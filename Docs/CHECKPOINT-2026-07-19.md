# abcts — Checkpoint, 2026-07-19

First renderer slices. Supersedes `CHECKPOINT-2026-07-18.md`, which remains accurate for
the parser and whose risk list is still live except where noted below.

**Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **266 passing** (74 parser + 192 renderer) |
| Parser content parity | 39/39 gated fixtures, unchanged |
| **Render structural parity** | **40 of 41** — the 41st is a recorded abcjs bug |
| **Visual baselines** | **41 of 41**, committed geometry snapshots |
| Typecheck / lint / build | clean; ESM + CJS + `.d.ts`, `.` and `./renderer` entry points |
| Renderer source | `src/renderer/{glyphs,layout,svg,index}.ts` + `scripts/gen-glyphs.mjs` |
| Compat layer | none — zero code |

Renders today: staff, all clefs, key signatures, meters, tempo marks, part labels,
noteheads and chords with stems, flags, beams and ledger lines, accidentals, dotted
durations (including double and triple dots), rests, barlines — across MULTIPLE VOICES,
each on its own staff, wrapped into justified systems, with notes spaced by duration on
abcm2ps's measured square-root curve, with all six barline shapes, slurs, ties, grace
notes, chord symbols, lyrics and decorations.

**Everything in the model now reaches the page**, except the decorations listed below.
Whole tunebooks render, each tune headed by its title.

**Every note in the corpus draws.** No fixture has missing output.

**The corpus is complete.** Every fixture is either reproduced or a recorded divergence,
asserted as such — adding a new fixture fails the suite until someone decides which it is.

---

## The three open decisions are settled

All three are recorded in ARCHITECTURE.md § Rendering. In brief:

1. **Glyph source — inline SVG paths**, extracted from Bravura at build time. Output is
   self-contained; an embedded woff2 would render as tofu wherever the font is absent.
   Metrics come from `bravura_metadata.json`, already in staff spaces, so only outlines
   need the font binary. `src/renderer/glyphs.ts` alone is OFL 1.1; the rest stays MIT.
2. **Correct means structural**, against `golden/*.elements.json` — abcjs's laid-out
   elements, not its SVG. The deferred second half — visual baselines — **now exists**;
   see below.
3. **Prose text is `<text font-family="serif">`** — the OPPOSITE call from glyphs, and
   deliberately so. A missing serif falls back to another serif; a missing Bravura falls
   back to tofu. Self-containment is worth paying for in noteheads, not in words.

**The checkpoint was wrong that core had no oracle.** It reasoned from the 503 SVGs,
which do only gate compat. Every fixture also ships an element dump with sequence and
staff positions. That is the previous checkpoint's own lesson turned on itself: *"no
oracle exists" should be verified against the data before it is believed.*

---

## Running it, and looking at it

| | |
|---|---|
| `abcts tune.abc` | render to stdout or `-o file.svg`. `--width`, `--first` |
| `npm run parity` | every parity axis in one view |
| `npm run compare` | abcts vs the abcjs goldens, side by side or overlaid |

`npm run compare` adapts abcMusicKitWorkbench's technique — v1 in cyan over abcjs in
magenta, black meaning agreement — but with an important qualification. That overlay
works for v1 because v1 is a byte-parity port with identical pixel coordinates. Core is
not: it has its own spacing engine and its own units, so overlaid raw the two would not
align at all.

So the default is SIDE BY SIDE, which answers the question no gate here asks — does core's
engraving read as well as abcjs's. The overlay is offered too, staff-aligned, where
horizontal disagreement is expected and VERTICAL disagreement means a wrong pitch. It
becomes a true match test when compat mode exists.

### What the first look showed

Core's spacing is about **19% looser than abcjs's** — abcjs sets a quarter note at 5.47
staff spaces, core at 6.5 — so `twinkle` wraps to two systems where abcjs fits it on one,
despite core's default system being wider (90 staff spaces against abcjs's 86.5).

Not a bug: core follows abcm2ps's density through abcMusicKit2's oracle-calibrated
constant, and abcm2ps is looser than abcjs. But it is the single most visible difference
between the two renderings, and it is a decision that should be recorded rather than
discovered.

---

## Parity tracker — `npm run parity`

One view of how close core is to its references. The numbers come from the assertions
themselves, so the report cannot drift from the gates.

| Axis | | |
|---|---|---|
| Note content | 39/39 | 2 known divergences |
| Beam grouping | 36/41 | 3 open, cause unidentified |
| Lyrics | 8/10 | 2 known divergences |
| Render structure | 40/41 | 1 known divergence |
| Visual baselines | 41/41 | self-referential |

### "v1 parity" is not a separate axis, and here is why

ARCHITECTURE.md names two references, but they are not independent. v1 is a direct PORT
of abcjs and its `abcjsStrict` path is byte-identical to abcjs by construction — v1's own
`SVGComparison` tests gate exactly that.

**Verified rather than assumed**: rendering `simple-c` through v1's CLI and diffing
against the abcjs golden gives identical staff-line coordinates, identical stem paths
(`M 80.66 89.18L 80.66 115.01`), identical barlines. The files differ only in packaging —
v1 emits `<defs>` + `<use>` where the golden inlines each path — and in a default page
width.

So the abcjs goldens ARE v1's shared surface, and every number above measures both.

What v1 has BEYOND abcjs is its extended mode: per-element colour, modern collision
detection, theory overlays, tablature. That is feature coverage, not numeric parity, and
no amount of corpus diffing answers it. abcts implements none of it. Tracked as an
explicit gap rather than folded into a percentage.

Also unmeasured, and listed by the tracker: compat mode (zero code, and nothing consumes
the 503 SVG goldens) and visual CORRECTNESS (baselines catch change, not wrongness —
nothing compares core's rendering to a reference image).

---

## What the render gate checks, and what it cannot see

`tests/renderer/structural.test.ts`, whose header carries the full list. Summarised:

**Compared:** element sequence (clef, key, meter, tempo, note, rest, bar) and the staff
step of every notehead, mapped from abcjs's numbering where 0 is C4 to core's where 0 is the
middle line.

**Not seen, and green does not mean these work:**

- **First tune, first voice only.** `clefs` is eight tunes and passes on tune 1.
  `voice-octave-shift` passes on its *unshifted* voice, so it does **not** settle
  risk 2 below. Core now RENDERS every voice, but the gate still reads `staves[0]`
  because abcjs's own dump is regrouped per system and the two engines break lines
  differently — extending it to every voice is real work and the best remaining
  gate improvement.
- **Notehead spine only.** Slurs, ties, grace notes, chord symbols, decorations and
  **accidentals** are not `children` elements in abcjs's layout. `vree-grace-notes` and
  `curves` are green with neither grace notes nor slurs drawn. Chord noteheads ARE gated.
- **Rest position.** Presence only. abcjs anchors every rest at its pitch 7 whatever the
  duration because its glyphs carry different origins than SMuFL's; the conventions are
  not comparable.
- **Tempo content.** abcjs's tempo element is a zero-width marker carrying no text or
  rate, so only its presence is gated; what it says is unit-tested.
- **No visual property at all** — spacing, stem direction, beams, ledger lines. This is
  how the viewBox clipping bug below survived: no gate can see geometry.

**The gate is proved to fail:** perturbing the staff mapping by one step fails every
renderable fixture, and it asserts its own sensitivity to staff position. Anything the
gate cannot see is covered by direct unit tests instead — which is why `keyFifths`,
`noteGlyph`, `accidentalGlyph`, the clef arithmetic, `Q:` parsing and SVG text escaping
all have their own.

---

## The ten empty goldens — FIXED, in abcMusicKit

Root cause was in abcjs, not the harness: `abc_parse.js` drives parsing with
`while (line)`, and a blank line is `""` — falsy — so parsing stops at the first empty
line. `dump-elements.js` fed raw fixture text straight to `Parse.parse()`, and all ten
affected fixtures open with a `%` comment block followed by a blank line. Nothing to do
with multi-tune input, which was the obvious-looking but wrong hypothesis.

Fixed by routing through `TuneBook` first, as abcjs's own api does and as `dump-parse.js`
already did. The `startPos - header.length` argument is load-bearing — without it the
header strip shifts every `startChar`. All 31 previously-good goldens verified
byte-identical. Committed as `ca6614b` in abcMusicKit.

Two latent instances of the same falsy-blank-line bug remain in `dump-draw.js:96` and
`dump-transpose.js:35`. Neither generates goldens in this set; same one-line fix if ever
pointed at a comment-headed fixture.

---

## Visual baselines — the second half of the gate

`tests/renderer/baselines/*.txt`, one per fixture, recording rendered GEOMETRY: element
positions and widths, glyph names and placements, line coordinates, text, and the drawing
bounds. `tests/renderer/baseline.test.ts` compares; `npm run baseline` re-records.

**Structure catches WRONG, baselines catch CHANGED**, and the split is real rather than
theoretical. With stem direction inverted so every stem in the corpus points the wrong
way, the structural gate is **fully green** and the baselines fail 39 of 43. Same for a
0.1 spacing change (41 failures) and dropped ledger lines (30).

Geometry rather than pixels or SVG: no rasterizer exists in this toolchain and binary
diffs are unreviewable; full SVG would embed ~40KB of glyph paths per fixture, so a glyph
regeneration would churn all 41 at once and hide real movement. Glyph outlines are
version-controlled in `glyphs.ts`, which git already covers.

Bounds are recorded first, deliberately — the clipping bug that silently cut high ledger
lines and tempo marks out of the output now fails here.

**Re-recording without reading the diff defeats the mechanism.** Read it, and commit
baselines alongside the code change so a reviewer sees both.

### What the baselines exposed, and what came of it

44 notes across 7 fixtures drew NOTHING — the dotted-duration gap. Recorded as an
explicit per-fixture count rather than left to sit silently in 41 files, precisely so the
fix would announce itself. **It did**: implementing dots broke exactly nine tests — the 7
baseline snapshots, that count, and the unit test asserting dotted durations return null
— and nothing had to be hunted for. `UNDRAWN_NOTES` is now empty but kept, as the
assertion that a future duration change does not reintroduce holes.

Undrawn *rests* were checked separately and are correct: ABC's invisible `x` and spacer
`y`, which occupy space and print nothing.

---

## Next work — the corpus no longer drives it

With 40 of 41 reproduced, the diff has stopped picking features. What remains is known
from the code rather than from a failing fixture, which is a real change in method: from
here, work needs either new fixtures or the visual baselines.

Ranked by how wrong the output is today. Nothing on this list produces MISSING output
any more — dotted durations were the last of those.

1. **Multi-voice and system breaking.** Only voice 0 of tune 0 is laid out, on one
   endless staff. Largest structural gap, and the structural gate is blind to it by
   construction — it reads voice 0 too. Baselines would catch a change here but there is
   nothing yet to change.
3. **Duration-proportional spacing.** A half note takes an eighth's width.
4. **Repeat, double and final barlines** all draw as a thin line; `Measure.barline`
   already carries the distinction.
5. **Tenor-clef key signatures** are knowingly wrong — engravers drop some accidentals an
   octave to dodge ledger lines and no single shift reproduces that. No fixture uses one.

Visual baselines cover all of these: any change to spacing, stems, beams or bounds fails
the baseline gate even though structure stays green.

**The renderer phase may now change the parser** — clef and `Q:` both did, and the
39/39 parser gate held through both. Treat that as settled unless it starts costing.

Carried forward from 2026-07-18 and still open: decoration/chord-symbol vocabulary
(settle against v2), abcMusicKit2 pinning.

---

## Known risks, ranked

1. **Lyrics are now GATED against the goldens** — the 2026-07-18 risk is closed. Seven
   fixtures match; three diverge with recorded reasons (`frere-jacques` the known abcjs
   `+:` mis-parse, `ave-verum-corpus` a deliberate spaced-hyphen divergence,
   `S5-directives` an UNANALYSED 2-note drift between multiple `w:` lines — the next
   thing to look at).

   Building the gate found two real parser bugs immediately: `*` and `|` were handled as
   whole tokens but not when ATTACHED to a syllable, which is how every tune writes
   them. It also arbitrated a question the code had recorded as unanswerable — the
   comment claimed the goldens carry no lyric fields. They carry them on every fixture.
2. **`Voice.octaveShift` — sounding vs written — is still unresolved.** The previous
   checkpoint expected the first SVG comparison to settle it. It has not:
   `voice-octave-shift` passes on voice 1, which has no shift. Still open, still needs
   voice 2 and a v1 comparison.
3. **Beam GROUPING differs from abcjs on 3 fixtures** (`S5-directives`, `S7-voices`,
   `S8-layout`), a handful of links each — the asserted `BEAM_FAILURES` set. Beams and
   flags now RENDER; this is about which notes get grouped, not how a group is drawn.

   No longer unanalysed. Three findings:
   - The tie-then-space rule is **verified load-bearing**, not a guess: removing it takes
     parity from 36/41 to 35/41 because `ragtime-mini` depends on it.
   - It is also **insufficient** — it does not explain S7-voices or S8-layout, which have
     the same tie-then-space shape yet diverge the other way.
   - abcjs's mechanism is now known from its own source (MIT, vendored): a space sets
     `end_beam` on the note it FOLLOWS, and `endBeamHere` includes that note in the run.
     `force_end_beam_last` (chord symbol + whitespace) is ruled out — S8-layout has no
     such pattern. A third cause remains unidentified.
4. **Three ways a verification can lie, all hit this session.**
   - A no-op MUTATION looks exactly like a passing suite. One spacing mutation matched
     nothing because lint had reformatted the target line and reported a clean 164/164.
     Mutations now assert the edit applied before running.
   - A TEST that cannot distinguish the cases it claims to cover. The slur-nesting test
     used `((GG)GG)`, where both slurs open on the same note, so stack and queue
     matching return the same index — replacing `pop()` with `shift()` passed all 177
     tests. `(G(GG)G)` discriminates. This is the parser audit's blind spot exactly, and
     it was found by mutation rather than by review.
   - A MEASUREMENT that reads the wrong number. A grep for the mutation failure count
     matched elsewhere in vitest's output and reported 3 where the truth was 9,
     flattering the code by understating what the tests caught. Read `Tests N failed`.

Risk 5 of the 2026-07-18 list — the falsy `Accidental.natural` — is **closed**: the
renderer checks `=== null`, and two tests fail if that is rewritten as truthiness,
verified by making the edit and watching them go red.

The clef risk from this document's first revision is **closed**: clefs are parsed as
shape + staff line and `score-reorder` now agrees with abcjs at step -8.

A bug worth recording because no gate could have caught it: the drawing box was a fixed
margin and silently CLIPPED anything outside it — high ledger lines, tempo marks. Found
by rendering and looking. Vertical extent is now measured from placed content. The
structural gate sees no geometry, so visual baselines remain the only future guard.

---

## Reference policy (unchanged, and load-bearing)

| Question | Reference |
|---|---|
| What should the output BE? | **v1 `abcMusicKit`** — production, shipping, proven |
| How should this be BUILT? | **v2 `abcMusicKit2`** — modern design |

Never port an algorithm out of v1. v2 is not a behaviour oracle. abcm2ps and abc2svg are
GPL: run the binaries and observe, never read the source.
