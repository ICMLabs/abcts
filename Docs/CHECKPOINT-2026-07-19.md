# abcts — Checkpoint, 2026-07-19

First renderer slices. Supersedes `CHECKPOINT-2026-07-18.md`, which remains accurate for
the parser and whose risk list is still live except where noted below.

**Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **129 passing** (73 parser + 56 renderer) |
| Parser content parity | 39/39 gated fixtures, unchanged |
| **Render structural parity** | **20 of the 31 fixtures that have a layout oracle** |
| Typecheck / lint / build | clean; ESM + CJS + `.d.ts`, `.` and `./renderer` entry points |
| Renderer source | `src/renderer/{glyphs,layout,svg,index}.ts` + `scripts/gen-glyphs.mjs` |
| Compat layer | none — zero code |

Renders today: staff, treble clef, key signatures, meters, noteheads with stems and
ledger lines, accidentals, rests, thin barlines.

---

## The two open decisions are settled

Both are recorded in ARCHITECTURE.md § Rendering. In brief:

1. **Glyph source — inline SVG paths**, extracted from Bravura at build time. Output is
   self-contained; an embedded woff2 would render as tofu wherever the font is absent.
   Metrics come from `bravura_metadata.json`, already in staff spaces, so only outlines
   need the font binary. `src/renderer/glyphs.ts` alone is OFL 1.1; the rest stays MIT.
2. **Correct means structural**, against `golden/*.elements.json` — abcjs's laid-out
   elements, not its SVG. Visual baselines are the deferred second half.

**The checkpoint was wrong that core had no oracle.** It reasoned from the 503 SVGs,
which do only gate compat. Every fixture also ships an element dump with sequence and
staff positions. That is the previous checkpoint's own lesson turned on itself: *"no
oracle exists" should be verified against the data before it is believed.*

---

## What the render gate checks, and what it cannot see

`tests/renderer/structural.test.ts`, whose header carries the full list. Summarised:

**Compared:** element sequence (clef, key, meter, note, rest, bar) and the staff step of
every notehead, mapped from abcjs's numbering where 0 is C4 to core's where 0 is the
middle line.

**Not seen, and green does not mean these work:**

- **First tune, first voice only.** `clefs` is eight tunes and passes on tune 1.
  `voice-octave-shift` passes on its *unshifted* voice, so it does **not** settle
  risk 3 below.
- **Notehead spine only.** Slurs, ties, grace notes, chord symbols, decorations and
  **accidentals** are not `children` elements in abcjs's layout. `vree-grace-notes` and
  `curves` are green with neither grace notes nor slurs drawn.
- **Rest position.** Presence only. abcjs anchors every rest at its pitch 7 whatever the
  duration because its glyphs carry different origins than SMuFL's; the conventions are
  not comparable.
- **No visual property at all** — spacing, stem direction, beams, ledger lines.

**The gate is proved to fail:** perturbing the staff mapping by one step fails all 20
fixtures, and it asserts its own sensitivity to staff position. Anything the gate cannot
see is covered by direct unit tests instead, which is why `keyFifths`, `noteGlyph` and
`accidentalGlyph` have their own.

---

## Ten fixtures have no layout oracle — actionable, in abcMusicKit

`S1-decorations`, `S2-fields`, `S3-note-syntax`, `S4-bars-repeats`, `S5-directives`,
`S6-keys`, `S7-voices`, `S8-layout`, `center-text`, `missing-decorations`.

abcjs's harness emitted `staffGroups: []` for each while producing 3–20 SVG goldens for
the same input, so abcjs laid them out fine and only the element dump came back empty.
**Regenerating `abcMusicKit/Tools/abcjs-debug` would bring 10 fixtures into the gate**,
several far more demanding than anything currently passing. Best available return on
gate coverage.

They are asserted still-empty rather than filtered, so regenerating the harness fails the
suite instead of passing unnoticed.

---

## Open decisions — these need a human

1. **Prose text rendering.** Nothing renders text: no titles, tempo marks, lyrics or
   chord symbols. The glyph decision does not transfer — a missing serif degrades to
   another serif, so `<text font-family="serif">` is defensible here where it was not for
   noteheads. abcMusicKit2 splits exactly this way (CGBackend: music from Bravura, "prose
   uses a CoreText system font"). Cheap, but it is a real decision and it is a
   prerequisite for tempo.
2. **May the renderer phase change the parser?** Both remaining blockers need it:
   - **`Q:` is not parsed and tempo is not in the model.** Five fixtures diverge at
     exactly that element — `happy-birthday`, `zocharti-loch`, `program-127-test`,
     `two-voice-invention`, `ragtime-mini`. Also needs decision 1.
   - **`clef=` is not parsed and clef is not in the model.** See risk 1 below.

   Both are small model additions, but the parser is gated at 39/39 saturated and the
   working rule is to confirm before moving between phases.

Carried forward from 2026-07-18 and still open: decoration/chord-symbol vocabulary
(settle against v2), abcMusicKit2 pinning.

---

## Known risks, ranked

1. **Clef is assumed to be treble, so bass, alto and tenor voices render at the wrong
   staff positions.** Not a missing feature — *silently wrong output* for real music.
   `score-reorder` demonstrates it: core puts `C,,` at step -20 where abcjs has -8, the
   difference being exactly the treble/bass middle-line offset. The highest-value fix
   available, and it needs the parser (decision 2).
2. **Lyrics remain verified only by unit tests.** Unchanged from 2026-07-18, and now
   also unrendered.
3. **`Voice.octaveShift` — sounding vs written — is still unresolved.** The previous
   checkpoint expected the first SVG comparison to settle it. It has not:
   `voice-octave-shift` passes on voice 1, which has no shift. Still open, still needs
   voice 2 and a v1 comparison.
4. **Beaming has 4 unanalysed failures**, and no beams are rendered at all yet.
5. **Chords, dotted durations and tuplet durations do not render.** `noteGlyph` returns
   null for a non-power-of-two duration and the note draws nothing rather than a wrong
   notehead — visible in output and deliberate. No fixture currently on the gate is
   affected (0 of 180 notes), but `happy-birthday` and others will be.
6. **Spacing is flat and duration-independent.** A half note takes an eighth's width.
   Legible now, wrong the moment a bar mixes durations. Upgrade path is the
   Gourlay/LilyPond spring model abcMusicKit2 already uses.

Risk 5 of the 2026-07-18 list — the falsy `Accidental.natural` — is **closed**: the
renderer checks `=== null`, and two tests fail if that is rewritten as truthiness,
verified by making the edit and watching them go red.

---

## Reference policy (unchanged, and load-bearing)

| Question | Reference |
|---|---|
| What should the output BE? | **v1 `abcMusicKit`** — production, shipping, proven |
| How should this be BUILT? | **v2 `abcMusicKit2`** — modern design |

Never port an algorithm out of v1. v2 is not a behaviour oracle. abcm2ps and abc2svg are
GPL: run the binaries and observe, never read the source.
