# THE REMAINING WORK — a plan, 2026-08-15

Every SVG byte gate is at zero across all five render flavours, and so is every audio,
MIDI, chord-grid, timing, DOM and geometry gate. What is left is **API SURFACE, three
unparsed directives, and one audio model gap** — plus the enumeration question, which has
paid for itself six times on this branch and is therefore Phase 0 rather than an
afterthought.

Ordered by **evidence-per-hour**: what already has an oracle and an implementation comes
first, what needs a new oracle comes last.

---

## THE TWO DECISIONS THAT GATE PHASE 1

Neither is mine to make; both are one line of answer.

### D1 — Where does the audio surface hang?

`setUpAudio`, `setTiming`, `millisecondsPerMeasure`, `getMidiFile` and `chordGrid` are
**implemented and byte/event-exact** — 0 of 72 events, 0 of 38 timings, 0 of 13 element
timings, 0 of 3 MIDI files, 0 of 23 chord grids. None of them is reachable from `abcts` or
`abcts/compat`. The comment on `TuneObject` already flags this as an API decision rather
than an implementation one:

> Hang them here and they become part of the drop-in contract, which is what `compat` is
> for — flag it before doing it.

Options: **(a)** `abcts/compat` only, as methods on `TuneObject`, matching abcjs exactly;
**(b)** also on `src/index.ts`'s curated surface as free functions, which ARCHITECTURE.md
governs; **(c)** both, with compat's methods delegating. My recommendation is **(c)** —
the free functions are the honest shape and the methods are the drop-in promise — but the
curated surface is an ARCHITECTURE.md question and I will not widen it unasked.

### D2 — `tune.lines`

abcjs's `TuneObject` exposes `lines`, its own laid-out element tree, and three accessors
that walk it (`getElementFromChar`, `findSelectableElement`, `getSelectableArray`). Our IR
is different **by design**. Either we reproduce `lines` — large, and it is abcjs's
internals leaking into a public API — or we expose ours and write the difference up in
`Docs/ABCJS-DIFFERENCES.md` with its evidence.

This decides whether Phase 4 is a week or a fortnight.

---

## PHASE 0 — Ask what evidence EXISTS, not what it says

**One session. Do it first; it reorders everything below.**

The last three sessions were each opened by this question and each time it named real
defects: the gate reading 29 of 41 fixtures, the gate reading `<slug>.svg` only, the gate
reading two of five flavours.

The first sweep is already run. **Three directives appear in abcjs's own test suite and in
NEITHER of our corpora, and we parse none of them:**

    %%vskip   %%visualTranspose   %%keywarn

`%%vskip` is real geometry — `draw.js:41-43` does `if (abcLine.vskip)
renderer.moveY(abcLine.vskip)`, so it moves the page and every byte under it.

Still to sweep, same method:

- abcjs's 30 test files by ASSERTION TARGET against what we harvest. Known unharvested:
  `tests/parse/*` (6 files, 13 cases — `start-char`, `tie-slur`, `note-id`,
  `voices-array`, `book_parser`, `note`), `visual/wrap.test.js` (9), `visual/transpose*`
  (32), `visual/mouse-click.test.js`, `visual/selection.test.js`, `visual/tablature.test.js`,
  `api/tunebook_svg.test.js`.
- **`%%wrap` is not in `src/` at all** — no fixture in either corpus uses it, which is
  exactly the shape `%%score` reordering and `&` overlays had.
- Every `AbcjsParams` key abcjs accepts that we drop on the floor (`selectTypes`,
  `clickListener`, `oneSvgPerLine`, `responsive`, `tablature`, `chordGrid`, `jazzchords`,
  `visualTranspose`, `paddingtop/bottom/left/right`, `format`, `wrap`, …).

**Gate:** a list, in the checkpoint, of what is measured and what is not. No code.

---

## PHASE 1 — Wire what is already proven

**One session, after D1. Zero engine risk.**

Everything here exists and is gated; only the plumbing is missing.

| Surface | Implementation | Gate that already proves it |
|---|---|---|
| `setUpAudio()` | `src/audio/flatten.ts` | 0 of 72 audio cases |
| `setTiming()` / `noteTimings` | `src/audio/timing.ts` | 0 of 38 + 0 of 13 |
| `millisecondsPerMeasure()` | `src/audio/timing.ts` | ported, exported |
| `getMidiFile()` | `src/audio/midi-file.ts` | 0 of 3, BYTE-exact |
| `chordGrid` | `src/chord-grid.ts` | 0 of 23 |

**New gate:** `tests/compat-surface.test.ts` — for each method abcjs's `AbcTune` exposes,
assert we either have it or have it listed as declined. It is a ratchet like the byte
gate: the list of absences shrinks and never grows. **That is the artefact, not the
wiring** — without it the next session re-discovers the same holes.

---

## PHASE 2 — The small `AbcTune` accessors

**One session. Pure functions over the model, all in `src/data/abc_tune.js`.**

`getTotalTime`, `getTotalBeats`, `getBpm`, `getBeatLength`, `getPickupLength`,
`getBarLength`, `getMeter`, `getMeterFraction`, `getKeySignature`, `getBeatsPerMeasure`.

Two of them we already compute internally and do not expose: `getMeterFraction` is what
the chord grid's "defaults to 4/4 and reads the first meter of any LINE" rule reads, and
`getPickupLength` is the term the timing gate proved a case cannot reach.

**Oracle:** a ladder of control tunes through abcjs, printing each accessor's answer —
the same shape as `decoration-x` and `glyph-ycorr`. abcjs's own suite exercises only a few
of these, so **controls are the gate, not its fixtures.**

---

## PHASE 3 — `strTranspose`

**One to two sessions. Self-contained and it has a REAL oracle.**

`abcjs.strTranspose` is `src/str/output.js`, 18.7KB, ABC text in and ABC text out — no
geometry, no layout, no interaction with anything already green.
`tests/visual/transpose-output.test.js` is **22 cases with expected ABC STRINGS**, and
`transpose.test.js` another 10. That is a ranked table on day one, opening at 32 of 32.

Highest value-per-risk of anything left: it cannot regress a single existing gate, because
nothing else calls it.

---

## PHASE 4 — Selectables and the click contract

**Two to four sessions, depending on D2.**

`tests/visual/selection.test.js` holds **389 expected entries** across 4 cases, each one
`{draggable, svgEl attributes, abcEl, size{x,y,width,height}}`, and
`mouse-click.test.js` drives a synthetic click over every element and asserts what comes
back. Together they are the biggest unharvested oracle in abcjs's suite.

**Half of it is already proven.** We emit `data-index` and `selectable="false"`
byte-exactly on all 356 rows, so the ORDER and COUNT of the selectable array are correct
today. What is missing:

1. `getSelectableArray()` / `findSelectableElement()` / `getElementFromChar()` — accessors.
2. The `abcelem` shape each entry carries (`el_type`, `startChar`, `endChar`, …), which is
   the parse element and which we have.
3. `size` — a `getBBox()`, which is the one thing here that needs real ink measurement
   rather than markup.

Do 1 and 2 first and let the table say how much 3 costs. **D2 decides whether `lines`
comes with them.**

---

## PHASE 5 — The three unparsed directives, and the two print-only ones

**One session.**

`%%vskip`, `%%visualTranspose`, `%%keywarn` from Phase 0; `%%header`, `%%footer` and
`%%scale` from the print work, which are unimplemented because no fixture sets one — not
because they were measured.

**Oracle:** control tunes rendered through abcjs at the goldens' own `{staffwidth: 670}`,
with and without `--print`, added to the in-repo corpus so the byte gate carries them
forever. **A CONTROL TUNE IS THE PROOF, NOT THE FIXTURE** — five findings on this branch
were written, measured on a control, and corrected before they reached a corpus.

---

## PHASE 6 — The partly-tied chord

**Half a session. The only MODEL gap left.**

The flattener reads `tiedToNext` alone, so `[B-eg-b-]` re-articulates every head in the
AUDIO. The renderer already has the per-pitch rule — `Chord.tiedPitches`,
`abc_parse_music.js:427` — so this is carrying a rule the engine already knows across into
`src/audio/flatten.ts`.

**No abcjs case covers it**, so the oracle is a control tune run through abcjs's own
flattener, added to `tests/corpus-audio/` beside the 72.

---

## PHASE 7 — What is left after that

In descending order of size, none of it blocking:

- **Tablature.** `visual/tablature.test.js` is 47KB of assertions and there is partial
  support in `src/`. A gate would say how partial. Probably its own arc.
- **`%%wrap` / `wrap_lines.js`.** Not in `src/` at all; `visual/wrap.test.js` is 9 cases.
- **The parse oracles.** 6 files, 13 cases — `start-char` and `tie-slur` in particular
  assert source offsets, which every cross-link in a host depends on.
- **`TimingCallbacks`, `CreateSynth`, the synth controller.** Out of scope by the
  2026-08-08 arc decision: soundfonts and WebAudio are host playback, the same split the
  renderer makes between geometry and glyph outlines. `setTiming` — the thing
  `TimingCallbacks` consumes — is done and gated.

---

## THE SHAPE OF EVERY PHASE

Unchanged, because it is what has worked:

1. **Read the named abcjs function**, then instrument to confirm it. Neither half works
   alone.
2. **Land the oracle before the implementation.** A table that opens at every case is the
   right signal — audio opened at 54 of 54, the chord grid at 23 of 23, `-print` at 8 of
   110.
3. **Ratchet everything that goes green**, by slug. A ratchet holding 4% of what is green
   is a ratchet in name.
4. **One commit per landing, pushed.** No batching.
5. **If a fix is only half understood, revert it and write the measurement at the code
   site.** Three findings this month were reverted and landed later off the note.
