# abcts — Checkpoint, 2026-07-22 (late)

Supersedes `CHECKPOINT-2026-07-22b.md` — read this one, then `ARCHITECTURE.md`, then
`CLAUDE.md`. The `b` file's *method notes* still stand; its priority list is closed below.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abcjs-extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only. Never raise a pixel-parity ceiling to pass.

---

## Where things stand

**Every structural gate is at 100% with zero recorded divergences** — content, lyrics,
beams, structure, source offsets. **499 tests**, typecheck and build clean.

| Geometry (corrected metric — see below) | |
|---|---|
| Corpus median notehead distance | **17.4px** |
| Within 25 / 50 / 100px | **21 / 29 / 29** of 29 |
| Systems matching abcjs | **29 / 29** |
| Noteheads drawn | 2696 / 2696 |

**Every fixture is now within 50px of abcjs.** Eight remain above 25px; the worst is
`multi-voice-lyrics-two-voices` at 39.9.

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

7. **Out-of-staff furniture reserves room at last.** `verticalExtent` read only `elements`
   and `beams`, so tuplet brackets, repeat-ending brackets, hairpins and melisma rules
   reserved nothing and the staff sat as high as if they were not drawn. A tuplet bracket
   rides above the beam, so the tuplet fixtures were the worst offenders after ragtime:
   `multi-voice-triplet-brackets` −36 → −9, `multi-voice-rest-collision` −42 → −28.

8. **Lane distances, measured off abcjs — and NOT a skyline.** The previous checkpoint
   called for a skyline pass because `setUpperAndLowerElements` reads as one. Built,
   measured, discarded: abcjs puts the innermost above-staff text at a near-CONSTANT
   20.8px above the top staff line whether the notes sit inside the staff (`chord-grid`),
   23px above it (`happy-birthday`) or 27px above it (`stacked-annotations`). The lanes
   were right in kind and simply too tight — four measured constants, not a pass:
   chord 7.75 → 20.8, annotation above 15.5 → 19.3, annotation below 7.75 → 27.8, line to
   line 9.7 → 20.0 (which is `round(height × 1.1)` for a 16px font, the same advance rule
   the top-text block uses), first lyric 15.5 → 28.8 with verses 21.7 apart.

9. **Dynamics belong ABOVE the staff.** Not a distance error, a SIDE error:
   `DynamicDecoration` sets `volumeHeightBelow` only when the positioning says `below` and
   `volumeHeightAbove` otherwise, so `!p!`, `!mf!` and hairpins default above. Ours were
   under the staff. Confirmed in output too — abcjs's dynamic box centre sits 60px clear
   above the top staff line. `multi-voice-lyrics-two-voices` 121.4 → 39.9,
   `ragtime-nightingale` 34.0 → 28.3, and within-50 reached 29/29.

10. **Geometry axis wired into `npm run parity`** — it printed four structural axes at 100%
    and stayed silent on the open one.

---

## Next, in priority order

1. **Two voices sharing a staff print their lyrics ON TOP OF EACH OTHER.** abcjs offsets
   by the voice's index within the staff (`child.pitch -= child.voiceNumber * child[key]`,
   `set-upper-and-lower-elements.js`), and `multi-voice-lyrics-two-voices` confirms it in
   output: its two voices' lyrics sit 18.8px apart. Ours land on the same baseline. The fix
   is ~15 lines at the staff merge and it produces 21px, close to abcjs's 18.8.

   **Not committed, and the earlier reason for that was wrong.** A previous note guessed
   `ave-verum-corpus` was grouped differently from abcjs; it is not — abcjs's own parse
   golden gives it 4 staves of 2 voices, exactly what we build. The real obstacle is that
   abcjs does NOT appear to apply the offset there: `ave-verum`'s two lyric-bearing staves
   sit 48.0px and 51.3px below their own bottom staff lines, 3.3px apart, where a
   voice-index offset would put them a full ~21px apart. Only the SECOND voice of that
   staff sings, which is the exact case abcjs's own TODO says leaves unused space — so
   either the rule does not fire as read, or that staff's ink bottom differs by ~18px and
   masks it. Measure `ave-verum`'s per-staff ink bottom before applying the offset; landing
   it as-is costs that fixture 20.6 -> 31.7px and would mean raising a ceiling.

2. **Our ink extents are short of abcjs's by about `systemGap`.** abcjs adds NO gap
   between systems — it pads only when the natural ink separation falls short of
   `staffSeparation` — but setting ours to 0 to match moves the corpus the wrong way
   (median 17.4 -> 19.0). The 3.0 has been standing in for a missing extent. Find the
   missing extent; do not tune the constant.

3. **abcjs's absolute stretch guard is NOT reproduced** — `spacing * minSpace > 50`, the
   stretched spring of the shortest note. Our column model has no `spacingUnits`
   equivalent; measuring it off element origins includes the rod and binds far too early.
   Uncapped matches abcjs on all 29 gated fixtures; the cost is that an ungated sparse
   line stretches wide. Needs a real spring/rod split.

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
7. **Read the model out of the OUTPUT before porting it from the SOURCE.**
   `setUpperAndLowerElements` genuinely stacks against the music's ink, so a skyline was
   the obvious port — and three measurements of abcjs's own SVG killed it in a minute by
   showing the same 20.8px whatever the notes did. The source says how abcjs is built; the
   goldens say what it produces, and only the second is the contract.
8. **A correct fix can still be unshippable.** The per-voice lyric offset is right, is
   abcjs's documented rule, and visibly fixes overlapping syllables — and it costs
   `ave-verum-corpus` 11px. Landing it would have meant raising a ceiling. Left out twice,
   with the obstacle written up beside it — and the second write-up had to CORRECT the
   first, which had guessed at a staff-grouping difference that does not exist.
9. **Check the SIDE before tuning the distance.** Dynamics were under the staff where
   abcjs puts them over it. Every previous attempt to improve those fixtures had been
   adjusting how far below they sat. One constructor in abcjs
   (`if (position === 'below') ... else ...`) settled it in a line.

---

## Confirm your lane before structural work — `Code/` vs `Code-v2/` vs `Code-1.9/`.
