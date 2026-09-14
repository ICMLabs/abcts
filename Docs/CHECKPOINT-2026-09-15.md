---
title: Checkpoint 2026-09-15 — the host-option surface finished, and five masked rules the options exposed
state: zzopts 26 rows, 17 differing of 17,810 comparisons · timeBasedLayout 669 → 1 · add_classes 16 → 1 · expandToWidest 14 → 0 · minPadding 4 → 1 · suite 2,671 · every byte and browser gate at zero
---

# Checkpoint 2026-09-15

## 1. WHERE THIS SITS

`zzopts` — the HOST-OPTION surface, opened 2026-09-09 at 685 of 685 on every row — is
**finished as an arc**. 26 rows × 685 tunes is 17,810 comparisons and **17 of them differ**,
across 12 distinct fixtures:

    baseline · responsive ×3 · jazzchords · oneSvgPerLine ×2 · viewport ×3 · ariaLabel ×2
    germanAlphabet · accentAbove · lineThickness · initialClef · expandToWidest       0 of 685
    scale 0.8 · oneSvgPerLine + scale 0.8 · add_classes · minPadding · timeBasedLayout      1
    scale 1.5                                                                              2
    print · print + responsive                                                             3
    wrap + staffwidth                                                    4  ← ITS FLOOR

**Nothing on the board is a feature any more.** Every remaining row is a last digit, a
rounding boundary, or a decision — and each is located to its term in `scripts/zzopts.mjs`.

Everything else is where it was: suite 89 files / 2,671 tests, `svg-bytes` 0 of 691 in-repo and
0 of 356 sibling, `zzlive`/`zzselect` 0 of 685 in WebKit AND Chrome, `zzledger` 0 differ,
`zzclick` 1 declared ×3, `midi-bytes` 0, `warnings` 0 of 815, `mode-bytes` 11 declared,
`test:dist` 0 both formats.

## 2. WHAT CLOSED, AND WHAT EACH ONE COST

### `timeBasedLayout` — 669 → 1, and the port was the easy part
A whole second layout algorithm, and it is **83 lines**: every element's x from its MUSICAL
TIME on a uniform grid, one `minSpacing` per line set by whichever element is tightest per
unit of time. The step is LINEAR in duration where a spring is `sqrt`-weighted — **2.000000
against √2** on the same 2:1 pair, which is how the two algorithms are told apart in one
number.

⭐ **THE PORT TOOK 669 → 11 IN ONE GO. THE OTHER TEN WERE FOUR PASSES OF THE SPRING SOLVE
THAT A GRID LINE DOES NOT GET**, because they live INSIDE `setXSpacing` and nothing in
`layoutInGrid` mentions them: `checkLastBarX`, `centerWholeRests`, the voice-overlap
displacement, and two rules that were only ever right by accident — see §3.

### `add_classes` — 16 → 1, and ten of the sixteen were one question
Where does the `abcjs-lN` counter advance. `draw()` runs `classes.incrLine()` at the HEAD of
each `tune.lines` iteration and only THEN asks what the line is, so **a row that paints
nothing is still a line** — a bare `%%text`, a bare `%%center`, the empty line a `%%newpage`
leaves. **Third time `tune.lines`'s index has been the cause**, after `initialClef`'s `l` and
the wrap's meter skip. Six more rules beside it: a separator's class generated at its own line
(lazy-vs-eager, not a missing call), every text row's class GENERATED rather than literal, a
boxed row's class moved to its group at three separate sites, a grace beam's per-voice index,
and a beam's tuplet ratio gated on its first element OPENING the tuplet.

### `expandToWidest` — 14 → 0, and it is the ABORT that does the arithmetic
`i = -1` fires the INSTANT a line widens the page, so the lines after the offender are never
solved at the width it just left. Reproducing the FIXED POINT instead — re-running at the
width the last pass ended on — settles somewhere else entirely: 714.51 against abcjs's 717.51.
And the chase is **112 passes** on one fixture; a 64-pass cap read 824.02, which is a width
that appears in abcjs's own trace.

### `minPadding` — 4 → 1, and the row is a ROD MAGNIFIER rather than a feature
Both remaining rules were element WIDTHS, and a width only reaches the page when it beats the
elastic gap beside it. A rest's width takes the voice scale; a chord's width is the max over
its heads AS ADDED, so a per-pitch `!style=!` on the middle head widens the element.

### `%%footer`, and a boxed row's rect
`%%footer` is print-only and we drew none at all — the mirror of `%%header`, which landed
months ago. And a boxed row's rect is measured at the x it is DRAWN at now, which is abcjs's
SECOND measurement of the same string: 3 of one fixture's 4 boxes became byte-exact.

## 3. THE RULES THIS ARC PRODUCED

- ⭐⭐ **AN OPTION IS A RESERVE MAGNIFIER, AND THAT IS WHY THIS SURFACE WAS WORTH RENDERING.**
  Five of the rules closed here are defects **on the default path** that no default-path gate
  could see. `svg-bytes` is 0 of 691 and both browser gates are 0 of 685, and yet: a rest's
  width ignored the voice scale, a chord's width read the wrong head, our collision pass
  grouped simultaneity by **x** where abcjs groups by **time**, an ending's room was charged to
  every voice instead of voice 0, and a boxed rect was measured at the wrong x corpus-wide.
  **A RESERVE ALWAYS MASKED BY A BIGGER ONE IS A RULE NO GATE CAN SEE** — and an option is how
  you unmask it, because it changes which reserve wins.
- ⭐⭐ **A SECOND ALGORITHM REVEALS EVERY COINCIDENCE THE FIRST ONE PAID FOR.** Grouping
  collisions by x and charging every voice for an ending were both *correct outputs* for as
  long as the spring solve was the only layout — it puts simultaneous elements at the same x,
  and its shared cursor makes `minspacing` a floor that voice 0 always wins. The grid did not
  break either; it revealed them, and both fixes are on the default path.
- ⭐ **THE BIGGEST ROW WAS NOT THE BIGGEST JOB, AND THE SMALLEST ROWS WERE NOT THE SMALLEST.**
  669 fell to 83 lines. 16 took seven rules. 4 took two masked widths and a day.
- ⚠️ **A PROBE THAT MEASURES TWO DIFFERENT QUANTITIES IS WORSE THAN NONE**, twice. Comparing
  x chains logged abcjs's TRIAL x against our FINAL one, so all 23 rows read as differing and
  the chains looked unrelated. And an isolated render of "the same" tune had a different tune's
  content, which produced a confident wrong conclusion about two engines agreeing.
- ⚠️ **THREE CONTROLS OF EIGHT WERE MUTE ON THE FIRST ATTEMPT, AND EVERY ONE LOOKED RIGHT.**
  A synthetic `|1` that never reaches the charge site; a head slice that missed the two heads
  that move; a bar pair that lands on one x anyway. **A cap is invisible to a fixture whose
  chase is shorter than the cap** (40 < 64), and a slur control cannot see a `voiceSites` reset
  at all — a hairpin can.
- ⚠️ **AND THE ROW COUNT AND MY OWN ATTRIBUTION DISAGREED ONCE, AND THE ROW COUNT WAS RIGHT.**
  Removing the ending-room gate left my control green and took `zzopts` from 1 to 3. The two
  heads that move are at indices 14 and 19, in a lower voice of a later system.
- ⚠️ **A ROW COUNT SAYS NOTHING ABOUT WHICH ROW.** `%%footer` was drawn NOWHERE and the option
  row reported the same number before and after, because its only fixture differs 23px earlier.
  Differencing the row LIST — every `data-name`/`y` pair in order — is what found it.
- ⭐ **AND THE REPO PREDICTED ONE OF THESE IN WRITING.** `SIZE_CACHE`'s comment already said
  abcjs keys its text-size cache on the generated class and we do not, and ended "it is where
  to look if a page-order defect ever shows up in text widths under `add_classes`". It did —
  **and the first reading of it was backwards**, because abcjs was the constant one.

## 4. WHAT IS LEFT, IN THE ORDER I WOULD TAKE IT

Two structural items, each named because it is a representation rather than an arithmetic slip:

| what | rows it closes | why it is its own landing |
|---|---|---|
| **A rule's EDGE, not its CENTRE** | `timeBasedLayout` 1 | abcjs stores a bar/stem rule's edge and `printStem` writes `roundNumber(x)`, `roundNumber(x + dx)`; we store the centre and recover `centre - half`. Both engines place `rests-and-bars-tune13`'s bar at exactly 119.955 and round it opposite ways. The engine already documents the asymmetry under `lineThickness`. |
| **The page WIDTH primitive** | `print` ×2 (the ULP half) | abcjs keeps the MUSIC width and adds margins once, at `setPaperSize`, left then right. We keep the summed page and subtract the sides back out — so `pageSides()` sums the margins first and `(a+b)+c` becomes `a+(b+c)`. 691 goldens rest on the current arithmetic. |

…and four that are located but small: the print **page-cursor** sum (23.54px, many small
top-block advance errors that CANCEL in the ink and not in the cursor), one nested-tspan bbox
(`scale 0.8`), `add_classes`'s ending counter (a volta wants the `measureElement` a triplet
already has), and three ULP.

Off `zzopts` entirely, unchanged: `Docs/PONYTAIL-DEBT.md`'s open markers (8 should be RESTATED
AS DECISIONS rather than worked), `npm run lint`'s 1,021 pre-existing errors as ITS OWN commit,
and PUBLISH, which is a decision.

⚖️ **AND ONE DECISION IS STILL THE OWNER'S**: `CLAUDE.md` is 2,300+ lines with over half of it
blockquote narrative duplicating 60 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.
