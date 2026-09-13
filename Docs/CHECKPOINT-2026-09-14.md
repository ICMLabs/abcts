---
title: Checkpoint 2026-09-14 — the host-option surface, three rows closed and one at its floor
state: zzopts 26 rows all declared · wrap+staffwidth 23 → 4 (FLOOR) · initialClef 42 → 0 · lineThickness 665 → 0 · suite 2,639 · every byte and browser gate at zero
---

# Checkpoint 2026-09-14

## 1. WHERE THIS SITS

`zzopts` — the HOST-OPTION surface, opened 2026-09-09 at 685 of 685 on every row — is the
arc. It renders all 685 comparable tunes under each option a drop-in host passes and compares
the CONTAINER as well as the SVG, because half of what `setPaperSize` does is assign styles
to the parent node.

    baseline · responsive ×3 · jazzchords · oneSvgPerLine ×2 · viewport ×3
    ariaLabel ×2 · germanAlphabet · accentAbove · lineThickness · initialClef   0 of 685
    scale 0.8 / 1.5 / oneSvgPerLine+0.8                                        1 / 2 / 1
    print · print + responsive                                                 3 · 3
    minPadding                                                                 4
    wrap + staffwidth                                                          4  ← ITS FLOOR
    expandToWidest                                                            14
    add_classes                                                               16
    timeBasedLayout                                                          669

Everything else is where it was: suite 89 files / 2,639 tests, `svg-bytes` 0 of 691 in-repo
and 0 of 356 sibling, `zzlive`/`zzselect` 0 of 685, `zzledger` 0 differ, `zzclick` 1 declared
×3, `midi-bytes` 0, `warnings` 0 of 815, `mode-bytes` 11 declared, `test:dist` 0 both formats.

## 2. WHAT CLOSED, AND WHAT EACH ONE COST

### `wrap + staffwidth` — 23 → 4, which is its floor
Four fixtures can never close: two are abcjs's fourth debug marker, DECLINED by the owner,
and two are abcjs CRASHING in its own `wrapLines` (both now in `ABCJS-DIFFERENCES.md`).
Fourteen landings. The ones whose LESSON transfers are in §3.

### `initialClef` — 42 → 0, in three landings and they were three different causes
1. **`l` IS THE INDEX INTO `tune.lines`, WHICH COUNTS THE NON-MUSIC ROWS.**
   `createABCLine(abcLine.staff, …, i)` with `i` walking `abcTune.lines`
   (`engraver-controller.js:229-234`). A tune whose music is preceded by a subtitle, a
   `%%text`, a `%%sep` or a `%%newpage` has its FIRST music line at `l > 0` and draws NO clef
   at all. **27 of the 39.** Same index the wrap's `action.line !== 0` meter skip reads;
   `nonMusicPrecedesMusic` is now the one predicate for both.
2. **A CHORD'S INCOMING TIE-HALF RESERVES.** The rule was ported, ladder-measured and written
   up, and tested `previous.type === 'note'` where `[GB]8-|` is a CHORD.
3. **`startlimitelem` IS ENGRAVER STATE, NOT A PROPERTY OF THE LINE.** Assigned only where a
   clef, key signature or time signature is CREATED, cleared only by `reset()` — which runs
   per TUNE. A line drawing none of them KEEPS the last one.

### `lineThickness` — 665 → 0, on the note the row already carried
**A DRAWN WIDTH AND NEVER A PLACEMENT.** `renderer.lineThickness` is read in the draw
functions alone; the ENGRAVER never sees it, so abcjs moves nothing for it at any value. The
row's own note said the fix was to keep `LINE_WEIGHTS` pristine for layout and add the term
only where a thickness is EMITTED — "a separation this file cannot make one site at a time".
It is three edits. **Reading the note rather than re-deriving it was the whole saving.**

## 3. THE RULES THIS ARC PRODUCED

- ⭐ **A RECORDED CAUSE IS A HYPOTHESIS, AND ITS *SIZE* ROTS FASTER THAN ITS CAUSE.** Of the
  eight items the board named: four causes were wrong, one DISPROOF was backwards, one "pair"
  of fixtures shared no mechanism, and the stated FLOOR was 19 when it was 4. `initialClef`'s
  hypothesis was right about ONE fixture and wrong about the other 41 — **a cause can be real
  and still not be the cause of the number beside it.**
- ⭐ **INSTRUMENT abcjs AGAINST OUR OWN EQUIVALENT.** Every hard item fell to a side-by-side
  log and none to a source read: `layoutOneItem` against our `fixed()` list, `roundNumber`'s
  raw input, `calcY`'s three terms, both engines' `tune.lines`, `staffGroup.staffs[].bottom`,
  `TieElem.calcX`'s branch. Patch `dist/abcjs-basic.js` (unminified) by string replacement.
  ⚠️ Reading the source alone produced the wrong bar width twice.
- ⭐ **SEVEN FIXTURES THAT READ AS SEVEN DEFECTS WERE ONE EXPRESSION** — a trailing barline
  passing `el.width`, zero for an invisible bar, where `barWidthOf` gives abcjs's 1.
- ⚠️ **TWO SURFACES, FOUR TIMES, AND A CONTROL THAT READS ONE IS MUTE FOR THE OTHER.** The
  ink and `tune.lines` carry the same rules separately and NO GATE ASKS THE MODEL UNDER A
  WRAP. The fourth case ran the other way: the MODEL had the rule and the drawing did not.
- ⚠️ **HALF A RULE CAN BE WORSE THAN NONE, AND THE ROW COUNT WILL NOT TELL YOU.** Four times
  a half-fix drew MORE wrong elements than the bug while `zzopts` sat unchanged — and once it
  went the other way and read **665 against the 14 it started at**, because `half` is derived
  twice in `lineToRect` and I patched one. **A value derived twice is one edit and two places.**
- ⚠️ **A RESERVE ALWAYS MASKED BY A BIGGER ONE IS A RULE NO GATE CAN SEE.** A chord's tie
  reserve had been dead since it landed; a clef declares `bottom: -1` and the tie's 0 never
  won the `min`. It took an OPTION removing the clef to expose it.
- ⚠️ **A `wrap` DEFECT IS OFTEN NOT A WRAP DEFECT.** Three rules that closed that row
  reproduce with no wrap at all; their controls belong in `positioning.test.ts`.
- ⚠️ **A FIX IN A SHARED WALK PAYS ELSEWHERE** — re-declare the rows it moves rather than
  treating a DOWN as a mistake. The pitch-conversion rule moved three rows; `dx + w` moved
  `initialClef`.

## 4. WHAT IS LEFT, IN THE ORDER I WOULD TAKE IT

| row | differ | what it is |
|---|---|---|
| `expandToWidest` | 14 | needs abcjs's `i = -1` restart. ⚠️ **SIZE THE RE-ENTRANCY FIRST** — the note is the row's own and predates this session. |
| `add_classes` | 16 | class vocabulary on a few shapes. |
| `minPadding` | 4 | partially implemented. |
| `print`, `print + responsive` | 3 each | last-digit rounding. |
| `scale` ×3 | 1 / 2 / 1 | last-digit rounding. |
| `timeBasedLayout` | 669 | a SECOND layout algorithm (`layout/layout-in-grid.js`), spacing by TIME rather than by the spring solve. **Its own arc — do not start it inside another.** |

…and off `zzopts` entirely: `Docs/PONYTAIL-DEBT.md`'s open markers (8 should be RESTATED AS
DECISIONS rather than worked, and three were added by the wrap arc), `npm run lint`'s 1,023
pre-existing errors as ITS OWN commit, and PUBLISH, which is a decision.

⚖️ **AND ONE DECISION IS STILL THE OWNER'S**: `CLAUDE.md` is 2,300+ lines with over half of
it blockquote narrative duplicating 58 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.
