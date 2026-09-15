---
title: Checkpoint 2026-09-16 — seven rows, seven representations, a debt ledger that was mostly already closed, and a lint gate
state: zzopts 5 differing of 17,810 and FOUR of them are its floor · suite 2,693 · lint 1,022 errors to 0 · every byte and browser gate at zero, WebKit and Chrome · package prepared at 6.7.0, NOT published
---

# Checkpoint 2026-09-16

## 1. WHERE THIS SITS

`zzopts` — 26 rows × 685 tunes, 17,810 comparisons — is at **5 differing**, and **four of
those five are `wrap + staffwidth` at its declared floor**: two debug markers the owner
declined and two tunes abcjs crashes on inside its own `wrapLines`. What is left that is
OURS is **one ULP in one root `width`**, on `minPadding`.

    baseline · responsive ×3 · jazzchords · oneSvgPerLine ×2 · viewport ×3 · ariaLabel ×2
    germanAlphabet · accentAbove · lineThickness · initialClef · expandToWidest
    print · print + responsive · scale 0.8 · scale 1.5 · oneSvgPerLine + scale 0.8
    add_classes · timeBasedLayout                                          0 of 685
    minPadding                                                                    1
    wrap + staffwidth                                              4  ← ITS FLOOR

Every other gate, re-run at this state: suite **90 files / 2,680 tests**, `svg-bytes` 0 of
691 in-repo and 0 of 356 sibling, `zzlive` and `zzselect` **0 of 685 in WebKit AND Chrome**,
`zzledger` 0 differ / 0 known / 41 agree, `zzclick` 1 declared ×3, `test:dist` 0 of 685 in
both ESM and CJS, `midi-bytes` 0, `mode-bytes` 11 declared, `warnings` 0 of 815.

## 2. WHAT CLOSED, AND EVERY ONE WAS A REPRESENTATION

Seven rows, and not one of them was arithmetic that needed re-deriving. Each is a place
where this engine STORED a different quantity from abcjs and recovered the one it needed.

### `timeBasedLayout` 1 → 0 — a rule is drawn from the EDGE it was given
abcjs stores a bar or stem rule's edge and `printStem` writes `roundNumber(x)` then
`roundNumber(x + dx)`. A `PlacedLine` stores the CENTRE and the emitter took the half back
off: `(edge + half) - half` is not `edge`, and on a `.xx5` boundary the two round opposite
ways — `rests-and-bars-tune13`'s bar is exactly 119.955 in both engines and we wrote
`M 119.96` for abcjs's `M 119.95`. The four producers of a vertical rule now record the edge
they already had in `PlacedLine.anchorX`, and the emitter falls back to the recovery when
the two disagree by more than a rounding tail — so a pass that moves `x1` and forgets the
anchor cannot misplace a stem.

### `print` 3 → 0 and `scale 1.5` 2 → 1 — the page width, then the music width
abcjs keeps the MUSIC width and adds the margins once, LEFT THEN RIGHT. This engine held the
summed page and subtracted the sides back out, so abcjs's `(a + b) + c` was our `a + (b + c)`
— `1037.3333333333335` for `…333`, which at print's 0.75 is `778.0000000000001` for 778.

⚠️ **AND THE PIXEL DOMAIN WAS THE POINT, NOT ONLY THE ORDER.** Summing the same three terms
in SPACES and multiplying out reproduces abcjs on **16 of 32** measured width/scale pairs,
where the single division the space-domain width already used reproduces **28**. Only the
pixel form is **32 of 32**, because it IS abcjs's expression. Measuring that before starting
is what kept 691 goldens still.

The music width went the same way one step in (`this.width / scale`, not
`systemWidth - pageSides()`): 20 of 50 pairs for the recovery against **50 of 50** for the
primitive, and it was the last ULP on both print rows —
`visual-svg-per-line-02-scaled`'s notehead at `325.9119999999999` for `325.912`.

### `print` again — a declared `reserve` is a y, so it MOVES WITH ITS TEXT
`PlacedText.reserve` is a span "in the same y-down staff spaces as `y`". The block's shift
into the staff's frame moved the baseline and left the span behind. The one row that
declares a reserve is the print `%%header` — it reserves a zero-height span at the block's
own start so its ink cannot grow the block — and unshifted, `+50.67` is not the page's top
margin but **50.67px BELOW the middle line**. `verticalExtent` read it as the system's
BOTTOM: `-extent.bottomPitch` 1.044 → 13.075 pitch, and the system spent **46.62px it does
not occupy**.

### `add_classes` 1 → 0 — an ending takes the counters of the element it is added at
abcjs `addOther`s an `EndingElem` ahead of its own barline, so its class carries the `'bar'`
markers already standing — the same rule a TRIPLET follows, which is why a triplet already
named its element and an ending derived a number. **The derivation broke where the wrap
arc's did: a measure that OPENS with a barline contributes TWO bar elements, not one.**

### `scale 0.8` 1 → 0 — the anchor travels with the x
`TextFont.x` exists because a fractional x measures 1/64 px wider. The `text-anchor` is the
other half of the same rule: `middle` starts the glyph run half a width LEFT of the same x,
so the ink lands on a different sub-pixel phase. abcjs measures the node it DREW, which
carries both. Measured on `visual-tablature-17`'s five boxes, each at its own real x:

    size          13        27         53        107        173
    x = 0     51.2969  106.5312   209.1094   422.1562   682.5469
    + x       51.3125  106.5469   209.1094   422.1719   682.5469   <- 53 and 173 short
    + anchor  51.3125  106.5469   209.1250   422.1719   682.5625   <- abcjs, every size

### `scale 1.5` 1 → 0 — a tempo flag's offset is summed before the cursor
`xdelta = headx + notehead.w - 0.6` is built FIRST and the element's x is
`abselem.x + xdelta`, so abcjs writes `a + (b - c)` where this wrote `(a + b) - c`.

## 3. THE RULES THIS SESSION PRODUCED

- ⭐⭐ **A RECOVERY IS NOT A PRIMITIVE, AND THE DIFFERENCE IS A LAST DIGIT EVERY TIME.**
  Five of the seven rows are the same shape: the engine held a SUM and took a part back off
  to reach the quantity abcjs actually stores — a rule's centre for its edge, the page for
  the music, the music for the page. `(a + b) - b` is not `a`. Where abcjs keeps a
  primitive, keep the same primitive; where it is genuinely ours to derive, carry the
  derived value rather than re-deriving it downstream.
- ⭐⭐ **AND A RECORDED CAUSE IS A HYPOTHESIS, HOWEVER CAREFULLY IT WAS WRITTEN DOWN — TWICE
  IN ONE SESSION.** The 23.54px page-cursor row was attributed to eighteen `%%…font`
  directives, with the two engines' advance lists quoted side by side; **that probe compared
  our NODE metrics with abcjs's BROWSER ones**, and in one WebKit page every advance is
  identical. Removing each font directive in turn leaves the delta at exactly 23.54;
  removing `%%header` alone takes it to ZERO. The 1/64-px box was attributed to a
  nested-tspan `%%jazzchords` split, on a fixture that sets no `%%jazzchords` and draws no
  nested tspan at all. Both were found by re-measuring, not by reading.
- ⭐ **SIZE A REPRESENTATION CHANGE BY SAMPLING THE ARITHMETIC, NOT BY ARGUING ABOUT IT.**
  Both width landings were decided by a ten-line script over 32 and 50 width/scale pairs
  before a line of the engine changed. One of them (summing in spaces) would have been
  WORSE than what was there — 16 of 32 against 28 — and the sample said so in seconds.
- ⚠️ **A DECLARED SPAN IS IN SOME FRAME.** `reserve` is the second field to be caught
  travelling in the wrong one (`edgeY` was the first, in y). Anything that is a COORDINATE
  must move with every shift its coordinate takes; anything that is a LENGTH must not.
- ⚠️ **AND THE LAST ULP IS A DOMAIN, WHICH IS WHY IT IS STILL OPEN.** `minPadding`'s row was
  instrumented on both sides and the grouping already agrees. abcjs's `er` at that element
  is `526.703 - 507.51300000000003 = 19.18999999999994`, a tail its PIXEL chain put there,
  where this engine walks the line in STAFF SPACES and multiplies once at the end. Closing
  it is a units decision about the solve, not a term to regroup.

## 4. WHAT IS LEFT

Nothing on `zzopts` is reachable except the one ULP above, and `wrap + staffwidth` is at its
floor. Off the board, unchanged by this session:

- **`Docs/PONYTAIL-DEBT.md`** — the open markers, **8 of which should be RESTATED AS
  DECISIONS** rather than worked.
- ✅ **`npm run lint`** — CLOSED 2026-09-16, 1,022 errors to 0. See the commit: 691 were
  abcjs's goldens, 254 an idiom, 127 files an unrun formatter. ⚠️ The formatter stays off.
- **PUBLISH** — a decision, including whether to drop 20.7 MB of sourcemaps.
- ⚖️ **`CLAUDE.md` is 2,300+ lines**, over half of it blockquote narrative duplicating 60
  handoffs, loaded in full every session. See `Docs/CODEBASE-EVALUATION-2026-09-12.md`.
  Still the owner's decision; nothing has been deleted.
