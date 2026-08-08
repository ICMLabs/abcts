# abcts — Checkpoint, 2026-08-08d

Supersedes `CHECKPOINT-2026-08-08c.md` for the STATE. That file keeps the audio arc's
findings; `-08-08b.md` keeps 147–150 and the geometric tail; `-08-08.md` keeps the ARC
DECISION; `-08-07b.md` keeps 134–146 and the method; `-08-06.md` keeps **THE HARNESS**.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔀 THE TARGET IS abcjs 6.7.0 (Lance, 2026-08-08)

It was 6.6.3 until that day. **Every citation written before 2026-08-08 names a 6.6.3 line
number**, and BOTH trees stay vendored — `abcjs-6.6.3` beside `abcjs-6.7.0` — so a stale
citation can be CHECKED rather than guessed at. The sibling `dump-svg.js` takes
`ABCJS_VERSION`, which is how the two were measured against each other.
`abcts.config.json`'s `abcjsRef` points at 6.7.0.

### The whole geometric difference was ONE BRANCH

Measured before anything was ported, which is what kept it a one-line job. Regenerating the
in-repo 174-fixture corpus from 6.7.0 changed **166 of 178 FILES** and moved **13 fixtures**
— every one by exactly `oy = -61.33`, `dy`/`dx`/`ox` at 0.00. A rigid shift and nothing
else. 61.33 is `spacing.staffSeparation`'s default to the hundredth (`renderer.js:105`).

```js
if (staffgroups.length >= 1)
  addStaffPadding(renderer, renderer.spacing.staffSeparation, …);
else if (line > 0) // This happens if there is non-music stuff before the first staff line
  renderer.moveY(renderer.spacing.staffSeparation)
```

**TWO things make `line > 0` true and the second is the one that is easy to miss**: a
`%%text`/`%%begintext` block, OR **a second `T:`** — abcjs's first `T:` is the title, drawn
from `metaText` before the loop, while every later one becomes a `{subtitle}` LINE. Seven of
the thirteen were the first case, six the second.

`!class=name!` came with it: `el.extraClass`, never `el.decoration`
(`abc_parse_music.js:229`), in the same `if` as `!style=…!` one arm along.

**AND WHAT DID NOT MOVE MATTERS AS MUCH.** `tests/synth/flattener.test.js` and
`write/creation/glyphs.js` are **BYTE-IDENTICAL** between the versions — the audio oracle
and both glyph tables needed no regeneration. The synth surface changed in two places,
neither reachable by any test: `chord-track.js` accepts `♭`/`♯`, `repeats.js` swaps
`startEnding`/`startRepeat` on a bar that is both.

---

## STATE

| axis | standing |
|---|---|
| suite | **966 of 966. NO REDS.** |
| **audio ranked table** | **23 of 54 differ**, PASSING **31** |
| harvested ranked table | **0 of 174** — against the 6.7.0 oracle |
| pixel ranked table | **1 of 120** — `extra-class`, recorded and named |
| staff-line gate | 0 |
| above-lane gate / ycorr gate | 12 + 20 controls |
| render benchmark | 220 tunes, ~1.1ms each — recorded, asserts no time |
| gates | **7** |

---

## THE AUDIO ARC — what is built and what is left

`tests/corpus-audio/` (54 cases, 1,930 events, harvested from `flattener.test.js`),
`tests/audio-ranked.test.ts` (the third ranked table, `PASSING` is the ratchet),
`src/audio/flatten.ts` + `src/audio/chord-track.ts`. Runs over the PARSE TREE, so audio
does not depend on the renderer.

### The work list, from the table itself

```
 4 cases   1 tracks vs 3/2    `&` overlay voices are not split into their own voices
 2 cases   1 tracks vs 2      the DRUM track (`%%MIDI drum`), which does not exist at all
 3 cases   style:"decoration" trills, mordents, turns, rolls become RUNS of 1/32 notes
 2 cases   mid-tune %%MIDI    `Measure.midiCommands` is parsed; the flattener ignores it
 1 case    volume per pitch   per-note dynamics inside a chord (`volumesPerNotePitch`)
 …         the rest are single cases with their first differing event printed
```

**THE DRUM TRACK IS READ AND NOT YET WRITTEN.** `normalizeDrumDefinition`,
`alignDrumToMeter` and `writeDrum` are at `abc_midi_flattener.js:760-889`, and the shape is:
the pattern string is `d`/`z` events with optional `/n` length suffixes, `params.pattern`
must be exactly `totalPlay*2 + 1` long or the drums turn OFF ENTIRELY, pitches are
`pattern[1+i]` and velocities `pattern[1+i+totalPlay]`. `alignDrumToMeter` then scales every
length so the pattern covers `drumBars` measures. `writeDrum(voices.length+1)` is called on
every BAR of voice 0 only, writes from `lastBarTime` — the measure that just ENDED — and
returns early if `lastEventTime < measureLen`, which is how a pickup delays the first hit.
A `drumChange` pushes to **voices[0]**, not the current voice.

---

## ⏳ THE OPTIMISATION PASS — deferred, and here is the reasoning so it is not re-argued

Asked on 2026-08-08: when to do a deep pass for cruft and non-optimisation. **Answer: after
audio reaches 54/54 — that is the phase boundary — and NEVER for speed.**

Measured, not assumed:

```
layout.ts   9,992 lines — 49% COMMENT      54 `ponytail:` markers across src/
parser.ts   4,301 lines — 36% comment       5 module-level mutables in layout
220 tunes rendered in 151ms — 0.7ms each, ragtime-nightingale included
```

- **No performance problem exists.** 0.7ms a tune, and the dominant cost (nine layout passes
  per line) is MANDATED by finding 104. A perf pass is pure risk with no prize. The
  benchmark is committed so that stays checkable.
- **The real cruft is structural: one 10k-line file.** But ~5k of it is COMMENT, and the
  comments are the finding ledger — 150 findings with citations, several recording things
  got wrong twice before the note existed. The test for any deletion: *could a future
  session re-derive this finding without the comment?* If no, it stays.
- **The gates are already maximal for geometry**, so waiting does not improve the net —
  context-switching mid-arc is the only cost, which is why the boundary is the moment.
- **The invariant to hold the pass to: NO BASELINE MAY MOVE.** If one does, that is a
  behaviour change — revert it, do not re-record it. Same discipline as never raising a
  ceiling, and it makes a pure-structural pass verifiable.

Order, once audio is done: (1) harvest the `ponytail:` ledger and triage; (2) split
`layout.ts` along its seams — glyph metrics, horizontal solve, vertical lanes, curves, text
— mechanically, baselines frozen; (3) close the `ENGRAVE` bare-literal table, already
half-triaged; (4) the 5 module-level mutables *if* they are a real hazard for repeated
renders rather than untidy.

---

## RE-VERIFIED AT THIS COMMIT

```
HEAD                9fbf7f6   working tree clean
npx tsc --noEmit    clean
npx vitest run      966 / 966
audio ranked        23 of 54, PASSING 31
harvested ranked    0 of 174   (6.7.0 oracle)
pixel ranked        1 of 120   (`extra-class`, recorded)
npx biome check src NOT clean — same rows as before this session, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist between
tool calls and the workspace ROOT has its own vitest reach: run from there and it collects
every test in every sibling repo, including abcjs's own, and reports a wall of failures that
are nothing to do with this one. It bit twice on 2026-08-08.
