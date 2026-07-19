# abcts — Checkpoint, 2026-07-19

First renderer slices. Supersedes `CHECKPOINT-2026-07-18.md`, which remains accurate for
the parser and whose risk list is still live except where noted below.

**Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **160 passing** (73 parser + 87 renderer) |
| Parser content parity | 39/39 gated fixtures, unchanged |
| **Render structural parity** | **40 of 41** — the 41st is a recorded abcjs bug |
| Typecheck / lint / build | clean; ESM + CJS + `.d.ts`, `.` and `./renderer` entry points |
| Renderer source | `src/renderer/{glyphs,layout,svg,index}.ts` + `scripts/gen-glyphs.mjs` |
| Compat layer | none — zero code |

Renders today: staff, all clefs, key signatures, meters, tempo marks, part labels,
noteheads and chords with stems and ledger lines, accidentals, rests, barlines.

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
   elements, not its SVG. Visual baselines are the deferred second half.
3. **Prose text is `<text font-family="serif">`** — the OPPOSITE call from glyphs, and
   deliberately so. A missing serif falls back to another serif; a missing Bravura falls
   back to tofu. Self-containment is worth paying for in noteheads, not in words.

**The checkpoint was wrong that core had no oracle.** It reasoned from the 503 SVGs,
which do only gate compat. Every fixture also ships an element dump with sequence and
staff positions. That is the previous checkpoint's own lesson turned on itself: *"no
oracle exists" should be verified against the data before it is believed.*

---

## What the render gate checks, and what it cannot see

`tests/renderer/structural.test.ts`, whose header carries the full list. Summarised:

**Compared:** element sequence (clef, key, meter, tempo, note, rest, bar) and the staff
step of every notehead, mapped from abcjs's numbering where 0 is C4 to core's where 0 is the
middle line.

**Not seen, and green does not mean these work:**

- **First tune, first voice only.** `clefs` is eight tunes and passes on tune 1.
  `voice-octave-shift` passes on its *unshifted* voice, so it does **not** settle
  risk 2 below.
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

## Next work — the corpus no longer drives it

With 40 of 41 reproduced, the diff has stopped picking features. What remains is known
from the code rather than from a failing fixture, which is a real change in method: from
here, work needs either new fixtures or the visual baselines.

Ranked by how wrong the output is today:

1. **Dotted and tuplet durations.** `noteGlyph` returns null for any non-power-of-two
   duration and the note draws NOTHING. Deliberate — a wrong notehead is worse — but it
   means real tunes have holes. The structural gate cannot see it (staff position is
   still right) and no gated fixture currently hits it.
2. **Flags and beams.** An unbeamed eighth draws as a stemmed black notehead, so it is
   indistinguishable from a quarter. Beaming also has 4 unanalysed parser failures.
3. **Duration-proportional spacing.** A half note takes an eighth's width.
4. **Multi-voice and system breaking.** Only voice 0 of tune 0 is laid out, on one
   endless staff. This is the largest structural gap and the gate is blind to it by
   construction — it reads voice 0 too.
5. **Repeat, double and final barlines** all draw as a thin line.

**Visual baselines are now the highest-value gate work**, because every remaining item is
something structure cannot see. The clipping bug and the tempo/part collision were both
found by rendering and looking, which does not scale.

**The renderer phase may now change the parser** — clef and `Q:` both did, and the
39/39 parser gate held through both. Treat that as settled unless it starts costing.

Carried forward from 2026-07-18 and still open: decoration/chord-symbol vocabulary
(settle against v2), abcMusicKit2 pinning.

---

## Known risks, ranked

1. **Lyrics remain verified only by unit tests.** Unchanged from 2026-07-18, and now
   also unrendered. The highest-value remaining gate work.
2. **`Voice.octaveShift` — sounding vs written — is still unresolved.** The previous
   checkpoint expected the first SVG comparison to settle it. It has not:
   `voice-octave-shift` passes on voice 1, which has no shift. Still open, still needs
   voice 2 and a v1 comparison.
3. **Beaming has 4 unanalysed failures**, and no beams are rendered at all yet.
4. **Chords, dotted durations and tuplet durations do not render.** `noteGlyph` returns
   null for a non-power-of-two duration and the note draws nothing rather than a wrong
   notehead — visible in output and deliberate. Chords are the largest single gap.
5. **Spacing is flat and duration-independent.** A half note takes an eighth's width.
   Legible now, wrong the moment a bar mixes durations. Upgrade path is the
   Gourlay/LilyPond spring model abcMusicKit2 already uses.

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
