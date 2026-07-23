# abcts — Checkpoint, 2026-07-22 (late)

Supersedes `CHECKPOINT-2026-07-22b.md` — read this one, then `ARCHITECTURE.md`, then
`CLAUDE.md`. The `b` file's *method notes* still stand; its priority list is closed below.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only. Never raise a pixel-parity ceiling to pass.

---

## Where things stand

**Every structural gate is at 100% with zero recorded divergences** — content, lyrics,
beams, structure, source offsets. **499 tests**, typecheck and build clean.

| Geometry (corrected metric — see below) | |
|---|---|
| Corpus median notehead distance | **19.5px** |
| Within 25 / 50 / 100px | **19 / 28 / 29** of 29 |
| Systems matching abcjs | **29 / 29** |
| Noteheads drawn | 2696 / 2696 |

Only two fixtures remain above 25px: `multi-voice-lyrics-two-voices` 92.9,
`multi-voice-rest-collision` 42.7. Everything else is inside 25px.

> **The metric changed meaning this session and old numbers are NOT comparable.** The gate
> used to compare abcjs's first `M` — wherever an outline's contour starts — against
> abcts's glyph ORIGIN. For a notehead that is its TOP against its CENTRE: a fixed 4.035px
> bias that read as agreement. It now resolves both engines to the bounding-box centre of
> the real outline. The pre-correction figure was 24.2px on the flattered scale.

---

## What closed this session

1. **Voice-name indent.** abcjs reserves horizontal space for `V:… name=` at the left of a
   system (`getLeftEdgeOfStaff`), shifting the staff and its notes right; we reserved none.
   Width comes from abcjs's own WebKit-calibrated `vocalfont` table, so the reservation
   equals the one baked into the goldens. `score-reorder` ox −106 → −16, `-shared` −98 →
   −16, plus `ave-verum`, `brother-john`, `zocharti`.

2. **`%%staffsep` / `%%sysstaffsep`.** `ragtime-nightingale` drifted ~950px up over 23
   two-staff systems because we dropped these. abcjs reads them in points and scales ×4/3
   (`renderer.js:148,160`). The inter-system pitch now lands on abcjs's exactly — golden
   151.0px top-to-top, ours 151.0. **335 → 42px**, and it is no longer a worst fixture.

3. **Source-line system breaks.** `frere-jacques` was the last system-count divergence
   (abcjs 4, ours 2). abcjs breaks per source line whether or not a barline falls there;
   our systems broke between measures, so the break had nowhere to land. The parser now
   closes an unterminated measure at a source-line boundary — a LAYOUT unit, not a musical
   bar, so no barline is drawn. **244 → 40px**, systems 29/29.

4. **Justification has no ratio cap.** `maxJustifyStretch: 1.6` was a *Behind Bars*
   judgement abcjs does not share — `calcHorizontalSpacing` justifies every non-last line
   however far it must stretch. Removing it also fixed
   `multi-voice-lyrics-two-voices` (dx spread 339.7 → 51.0).

5. **`%%center`.** Parsed and split by whether music had been seen. Above the music it
   closes the top-text block, centred on the STAFF width (abcjs puts it at 335 where the
   title, centred on the paper, sits at 350) with abcjs's 7.56 gap. Below the music it also
   stops the last music line being the last LINE, so abcjs justifies it — which is what
   `center-text`'s 219px dx spread was. **dx 219.3 → 3.9.**

6. **The 4px vertical, and the gate bias hiding it.** abcjs advances its top-text cursor by
   the rendered text HEIGHT, not the font size, and rounds font sizes to whole pixels: a
   title is `font-size="27"` and advances `round(27 × 1.108 × 1.1) = 33px` where we advanced
   `round(26.67 × 1.1) = 29`. 1.108 is the calibrated height ratio the golden generator
   itself uses, identical to three decimals across every serif size it lists. Our title
   baseline is now abcjs's 49.56 exactly and our composer 82.12 exactly; the whole
   title-only group went oy −4.3 → −0.2.

7. **Geometry axis wired into `npm run parity`** — it printed four structural axes at 100%
   and stayed silent on the open one.

---

## Next, in priority order

1. **The above-staff SKYLINE.** This is now the single dominant term and it is one cause,
   not several. Our `ENGRAVE` places above-staff content in FIXED LANES
   (`chordSymbolStep`, `annotationAboveStep`, `annotationLineStep`, `tempoStep`,
   `partStep`) and its own comment already names the fix as "the skyline pass this whole
   block is waiting on". Measured against abcjs:
   - `chord-grid` — abcjs puts a chord symbol **20.8px** above the top staff line, we put
     it 7.75. Staff 20.4px too high.
   - `stacked-annotations` — abcjs stacks annotation lines **20px** apart, we use 9.7.
     20 is exactly `round(annotationHeight × 1.1)` = `round(16 × 1.1575 × 1.1)`, the same
     text-height rule the top-text block now uses. Staff 21.5px too high.
   Everything in the −20 group (`chord-grid`, `ragtime-mini`, `stacked-annotations`,
   `vree-slurs-and-triplets`, `frere-jacques`) is this. Do it as a real skyline stack
   driven by measured text height, not by moving the lane constants.

2. **`multi-voice-lyrics-two-voices` 92.9px** — two voices sharing one staff, both with
   lyrics, stacked one `lyricHeightBelow` apart (the fixture's own header says so). Its
   oy is −87, so it is the same under-reservation but below the staff and multiplied by
   the voice count.

3. **`multi-voice-rest-collision` 42.7px** — has no `T:`; abcjs's topmost ink is at 49.7
   where ours is at 9.2, so something is being drawn far too high. Diagnose what that text
   is before assuming it is the same skyline term.

4. **abcjs's absolute stretch guard is NOT reproduced** — `spacing * minSpace > 50`, the
   stretched spring of the shortest note. Our column model has no `spacingUnits`
   equivalent; measuring it off element origins includes the rod and binds far too early
   (it pulled `frere-jacques` from 42px back to 280). Uncapped matches abcjs on all 29
   gated fixtures; the cost is that an ungated sparse line stretches wide. Needs a real
   spring/rod split. See the ponytail note in `layout.ts`.

---

## Method notes — new this session

The `b`, 07-21 and 07-22 notes still apply. New:

1. **A gate can compare two different points on the same shape.** The 4px vertical error
   and the gate's 4.035px reference bias cancelled almost exactly, so the number looked
   right while the drawing was wrong. Cross-check any measurement against a SECOND,
   independently-referenced one — here the staff lines, which are rects on both sides.
   `oy` and the staff-line offset disagreeing by a constant was the whole tell.
2. **"Nothing computes that" is a claim about where you looked.** abcjs's line-breaking
   algorithm was recorded as non-existent because `write/` was listed and nothing was
   found. It lives in `parse/wrap_lines.js` — the PARSER. The conclusion drawn from it
   happened to be right for the goldens (they pass `staffwidth` but not `wrap`, so no
   wrapping runs), which is why the wrong reason survived.
3. **Grep the fixture for a directive before modelling a discrepancy.** Two dropped `%%`
   lines were the entire ragtime vertical drift. abcjs honours far more directives than a
   default-only engine reproduces.
4. **Decompose an accumulating error by its PER-STEP pitch.** ragtime's 335px median said
   nothing; its top-line-to-top-line pitch, alternating a clean intra/inter pattern, said
   everything.
5. **When a fix makes the gated corpus worse, the model is wrong — not the corpus.** Two
   attempts died this way and both were right to: the `spacing * minSpace` cap measured off
   element origins, and a TOPNOTE-reserve model for staff placement. The second was
   disproved in one measurement — score-reorder's bass-clef first staff sits at 63.1 where
   simple-c's treble one sits at 77.55, so abcjs places by real ink.
6. **A drawing outside its own viewBox is a measurement bug or a reservation bug.** Ink
   resolving to y = −8.1 was what exposed the unscaled outline box.

---

## Confirm your lane before structural work — `Code/` vs `Code-v2/` vs `Code-1.9/`.
