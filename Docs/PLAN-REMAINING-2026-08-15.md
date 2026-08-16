# THE REMAINING WORK — a plan, 2026-08-15

Every SVG byte gate is at zero across all five render flavours, and so is every audio,
MIDI, chord-grid, timing, DOM and geometry gate. What is left is **API SURFACE, three
unparsed directives, and one audio model gap** — plus the enumeration question, which has
paid for itself six times on this branch and is therefore Phase 0 rather than an
afterthought.

Ordered by **evidence-per-hour**: what already has an oracle and an implementation comes
first, what needs a new oracle comes last.

---

## THE RULING — 2026-08-15 (Lance)

> **abcts must match abcjs on every API, every output. Internally it can use any
> architecture / design / data model that is best for performance, size, modern TS
> syntax.** …**abcts must be able to compile and create a "modern" abcjs that has ALL the
> same features, functions, api, and output.**

Three consequences, and they reorder everything below.

**1. THE BOUNDARY IS THE API; BEHIND IT WE ARE FREE.** `tune.lines`, `abcelem`, the
selectable array — these are things abcjs's callers READ, so they must exist and match.
They do NOT have to be what the engine is built on. Each becomes a PROJECTION built from
our IR on read. That turns the biggest remaining item from "adopt abcjs's data model" into
"write an adapter", which is smaller, reversible, and cannot slow the engine down.

**2. INTERNAL FREEDOM STOPS AT ARITHMETIC**, because the OUTPUT constrains it. Every entry
in `Docs/ABCJS-DEBT.md` — `Math.sqrt` where `hypot` is better, `a + (b + c)` where the
grouping is load-bearing, a step-1 ledger loop that discards half its visits — names the
gate that goes red if it is "fixed". Those stay. The freedom is in types, module
boundaries, allocation and syntax, never in which double comes out.

**3. THE SCOPE IS THE WHOLE OF `index.js`, NOT THE RENDERER.** The 2026-08-08 arc decision
put soundfonts and WebAudio out of scope as "host playback". **That decision is
REVERSED** — it was taken when audio was unbuilt, and "ALL the same features" is explicit.
`CreateSynth`, `SynthController`, `CreateSynthControl`, `Editor`, `EditArea` and
`TimingCallbacks` are in, ~2,160 lines of abcjs between them.

For those six the contract has to be stated, because nothing can byte-compare a sound:
**the API surface and the EVENT SEQUENCE handed to WebAudio are the gate** — the sequence
is already at 0 of 72 against abcjs's own event lists — **not the samples.** Everything
else on `index.js` has an output that can be compared exactly, and is.

Two smaller rulings, both settled:

- **Version strings MATCH.** `abcjs.signature` reports `"abcjs-basic v6.7.0"` and
  `tune.version` reports `"1.1.0"`, because a host that feature-detects must not break.
  abcts's own identity goes under a separate key.
- **`abcjs.test.{Parse, EngraverController}` IS BUILT**, and `renderTuneBook` delegates to
  `EngraverController.engraveABC` rather than standing beside it. abcjs's own golden
  generator calls it, and it is exactly what `-stacked` is.

---

## THE TWO DECISIONS THAT GATED PHASE 1 — both now answered above

### D1 — Where does the audio surface hang? → **BOTH**

`setUpAudio`, `setTiming`, `millisecondsPerMeasure`, `getMidiFile` and `chordGrid` are
**implemented and byte/event-exact** — 0 of 72 events, 0 of 38 timings, 0 of 13 element
timings, 0 of 3 MIDI files, 0 of 23 chord grids. None of them is reachable from `abcts` or
`abcts/compat`. The comment on `TuneObject` already flags this as an API decision rather
than an implementation one:

> Hang them here and they become part of the drop-in contract, which is what `compat` is
> for — flag it before doing it.

**ANSWERED: both.** The free functions stay the implementation — that is the "any
internal architecture" half — and `TuneObject`'s methods delegate to them, shaped exactly
as abcjs shapes them. ARCHITECTURE.md's curated surface widens to match, because "every
API" is the governing rule now.

### D2 — `tune.lines` → **REPRODUCE IT, AS A PROJECTION**

abcjs's `TuneObject` exposes `lines`, its own laid-out element tree, and three accessors
that walk it (`getElementFromChar`, `findSelectableElement`, `getSelectableArray`). Our IR
is different **by design**. Either we reproduce `lines` — large, and it is abcjs's
internals leaking into a public API — or we expose ours and write the difference up in
`Docs/ABCJS-DIFFERENCES.md` with its evidence.

**ANSWERED: reproduce it.** It is an API, so it matches. But it is built from our IR at
the boundary rather than being our IR — see consequence 1 above. Nothing in
`ABCJS-DIFFERENCES.md`; there is no divergence to declare.

---

---

## PROGRESS — 2026-08-15c

**DONE:** Phase 0 (the sweep, and `tests/compat-surface.test.ts` is its executable form),
Phase 1 (the gate plus fifteen tune-object symbols, `TuneBook`, `numberOfTunes`,
`parseOnly`, `signature`), Phase 2 (all nine accessors, with a 293-tune oracle, at 2 rows
and both written down), and Phase 6 measured, cited and gated as two `it.fails` rather than
half-ported.

Phase 3 too: **`strTranspose` at 58 of 59**, with a 59-case oracle generated by running
abcjs rather than copied from its suite — which is what caught abcjs's own test disagreeing
with abcjs on `output-miss-accidental`. And `abcjs.synth`'s silent half,
`test.Parse`/`test.EngraverController`, and `renderEngine`.

**Surface 62 → 32 absent.** `Docs/CHECKPOINT-2026-08-15c.md` is what landed and why.

**NEXT, in order:** Phase 4 (`lines` + selectables, 389 expected entries, half already
proven by `data-index` being byte-exact), Phase 5 (`%%vskip`, `%%visualTranspose`,
`%%keywarn`), then the WebAudio and editor surface (`CreateSynth`, `SynthController`,
`CreateSynthControl`, `SynthSequence`, `TimingCallbacks`, `Editor`, `EditArea`), then the
stragglers: `extractMeasures`, `tuneMetrics`, `setGlyph`, the three animation functions,
and the tune object's `lines`-derived accessors.

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

**New gate, and it is the artefact — not the wiring:** `tests/compat-surface.test.ts`,
which enumerates **every symbol on abcjs's own `index.js`** — `renderAbc`, `tuneMetrics`,
`TimingCallbacks`, `setGlyph`, `strTranspose`, the twelve entries under `synth`, `Editor`,
`EditArea`, `test.*`, and everything the animation and tunebook modules spread onto the
root — plus every key and method on the object `renderAbc` hands back. Each is PRESENT or
on a `MISSING` list that shrinks and never grows.

**It is generated by REQUIRING abcjs and walking the object**, not by reading its source
into a literal, so a symbol cannot be missed the way twelve fixtures and three flavours
were. **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION**, and this is the enumeration for
the whole remaining arc.

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
- **`TimingCallbacks`, `CreateSynth`, `SynthController`, `CreateSynthControl`, `Editor`,
  `EditArea`.** **IN**, by the ruling above — the 2026-08-08 exclusion is reversed.
  ~2,160 lines of abcjs. `setTiming`, which `TimingCallbacks` consumes, and the event
  sequence, which `CreateSynth` plays, are both already done and gated at 0 — so what is
  left here is the driver and the DOM, not the music. Gate: API surface plus the sequence
  handed to WebAudio; the samples are not comparable and that is stated, not hidden.

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
