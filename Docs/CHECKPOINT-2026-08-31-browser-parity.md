---
title: Browser parity — what is left, and it is decisions rather than effort
status: live gate 8 of 685 in WebKit; Node suite 2,453 and svg-bytes 685/685 green throughout
updated: 2026-09-01 — was 11 of 685 in three families; five more closed since
---

# Browser parity, 2026-08-31

`scripts/zzlive.mjs` runs abcts and abcjs 6.7.0 **in one WebKit page** and diffs
them. That is the only coherent browser oracle: `d4b7022` measured that abcjs does
not render byte-identically in WebKit and Blink, so no stored golden can be the
target. **231 of 685 -> 11** over the day.

## The rule that produced almost every fix

**abcjs measures THE THING IT IS ABOUT TO DRAW; we measured a stand-in.** A probe
string, a generic font, the wrong family, the flat form of a jazz chord, a font's
height where a string's was wanted, the stub's `h + (n-1)*size*1.2` where the
browser lays out real tspans. Nine fixes, all the same shape.

**And the second rule is the owner's: ORDER OF CALCULATIONS.** abcjs divides by
`spacing.STEP` FIRST and multiplies by a lane count SECOND; building a length and
dividing once at the end is `(h*n)/STEP` against `(h/STEP)*n`, which is the same
number for one lane and not the same float for more. Landed on both the above
lane (`805a9a1`) and the below (`fb3fb17`).

## ⚠️ The method that matters more than any of them

**A LADDER OF CONTROLS IS THE PROOF; A FIXTURE WITH MORE THAN ONE OPEN CAUSE
CANNOT RULE ANYTHING OUT.** Two conclusions were written into this repo today and
both were WRONG, both reasoned from `visual-options-01-fonts` — a fixture setting
eighteen font directives at once:

- "the face is not it, measured twice, reverted" — it WAS it.
- "the error flips sign with size, so a family cannot explain it" — on a control
  every rung is positive and there is no sign change at all.

Nine control tunes varying ONE thing (the gchord size) identified the two fonts by
their increments — ours Helvetica, abcjs Arial — and closed it to 0.000000 on
every rung. Seventeen control tunes varying ONE directive each took the font types
from 15 of 17 exact to 16.

## ⚠️ UPDATE 2026-09-01 — 11 → 8, AND THE TAXONOMY BELOW IS PARTLY SPENT

Closed since this was written: the staff's right edge (family 2, a lyric measured in
`serifBold` where `[I:vocalfont Times-Roman]` says regular — it moves the LINE SOLVE,
because a lyric's width is half its note's rod), the `%%begintext` block's height, and a
`%%annotationfont` FACE that no fixture could reach. Family 1's mechanism is now MEASURED
though not fixed — see below.

**THE `h + (n-1) * lineStep` PATTERN IS THE STUB'S ARITHMETIC AND IT HAS APPEARED FOUR
TIMES** — the lyric lane, the jazz chord's nested tspans, the `%%begintext` block, and
`dump-svg.js` itself. Whenever a multi-line thing's height is COMPUTED from a single line,
abcjs measured the whole string once and a browser will disagree in the last bits.

**AND THREE DIFFERENT INSTRUMENTS EACH CAUGHT SOMETHING THE OTHERS COULD NOT:**

- a LADDER OF CONTROLS overturned two conclusions written into this repo from a confounded
  fixture (`visual-options-01-fonts`, eighteen directives at once);
- the CORPUS caught an over-broad lyric-font fallback that made its control byte-perfect
  and took FOUR gates red;
- the AGGREGATE live gate caught a `%%begintext` fix that closed its own target, kept the
  Node suite green, and put two OTHER fixtures 23.27px out. A per-fixture check cannot see
  a regression in a fixture it does not render.

## WHAT IS LEFT — 8, mostly DECISIONS

**1 · THE TEMPO'S SUB-PIXEL X — 3 fixtures, mechanism measured (`549d728`).** A FRACTIONAL
x measures one sub-pixel wider: `"left"` bold Times 20px is 27.765625 at x = 0/100/166 and
27.78125 at x = 0.7/166.7, exactly 1/64. abcjs measures the element it JUST DREW, at the
SOLVED x; we measure a probe at 0, and the prefix builder's cursor is provisional.
**The fix is to advance the tempo at DRAW time, an ORDERING change** — passing an x at the
existing site is measured to do nothing. Reproduction: `G4|[Q:"left" 1/4=170 "right"]A4|`.

**2 · CSSOM SERIALISATION — 1 fixture, and it is the OWNER'S CALL.** Unchanged from below:
abcjs sets style through the DOM and the browser serialises, and abcjs disagrees with
ITSELF across browsers. The mechanism-level answer is to set styles through the DOM, which
is architectural — we emit SVG text, abcjs builds nodes.

**3 · A HELD SYLLABLE TAKES THE DEFAULT FONT — measured, fixed, REVERTED (`85356b9`).**
`%%vocalfont Times-Roman 20` draws the held `&nbsp;` at 17 BOLD where abcjs draws 27
normal. Inheriting the directive closes it and breaks four gates, one of them named
*"does NOT realize %%vocalfont — abcjs parses it and never draws it"*. Scope to the
held/empty syllable alone and prove against THOSE gates.

**4 · TWO LARGE FONT FIXTURES** — `misc-06-title-1bold` (10.3px, rich text with `$1`/`$0`)
and `options-01-fonts` (3.1px, down from 27.4). Several causes each; use a control.

**5 · TWO SELECTION/TABLATURE FIXTURES** with byte-identical page heights, differing deep
in the file. Not page geometry; unexamined.

## THE ORIGINAL TAXONOMY, kept for its reasoning — 11, and they were THREE families, not one

**1 · A NOTEHEAD X, CONSTANT AT 0.0171875** — `visual-selection-02`,
`mouse-click-01`, `tablature-15`. Identical delta in all three, ours LOW:
185.1485 against 185.16568750000002, 259.53175 against 259.54893749999997. A
constant across unrelated fixtures is ONE term, not accumulation. This is the
line solve's own cursor, which `CHECKPOINT-2026-08-14` already names as the last
horizontal ULP family.

**2 · THE STAFF'S RIGHT EDGE, ~0.75px** — `model-gaps` tunes 6 and 7. 252.06
against 251.3, 230.26 against 229.51. Page heights are already exact on both, so
this is justification, not geometry above the staff.

**3 · ⚠️ CSSOM SERIALISATION, WHICH IS NOT A DEFECT WE CAN FIX IN A STRING** —
`ledger-gaps` tune 5. abcjs sets `el.style.transform` through the DOM and the
BROWSER serialises it; we emit the attribute as text. The two do not agree, and
**abcjs does not agree with itself across browsers** — measured:

    WebKit  style="transform: scale(0.8, 0.8); transform-origin: 0px 0px;"
    Chrome  ...the same, plus -webkit-transform-origin-x/y: 0px

Same class as the text metrics: a browser-dependent artifact of abcjs's own
mechanism. Matching it in a string means emitting one browser's CSSOM
serialisation, which by construction breaks the other. **The only mechanism-level
answer is to set the style through the DOM as abcjs does and let the browser
serialise** — an architectural change (we emit SVG text; abcjs builds nodes), and
therefore the owner's call rather than a fix to slip in.

**AND THE TWO LARGE FONT FIXTURES** — `misc-06-title-1bold` (10.3px, rich text
with `$1`/`$0` switching) and `options-01-fonts` (9.1px). Both carry several open
causes each; use a control, not the fixture.

## Traps this session added

- ⚠️ **`display:none` ZEROES `getBBox`**, and abcjs measures at DRAW time for a
  boxed font — so hiding the harness's render slots that way INVENTED two defects
  and MASKED others. `visibility:hidden` lays out. A harness that lies does not
  lie in one direction.
- ⚠️ **`npx tsc --noEmit | head -3; echo $?` REPORTS `head`'S STATUS.** A change
  that did not compile passed the check and was caught by WebKit as a runtime
  `Can't find variable`. Write `npx tsc --noEmit && echo OK`.
- ⚠️ **A NARROW PROBE CAN MISS THE EFFECT IT WAS BUILT TO FIND.** The above-lane
  order fix looked inert on the two fixtures the lane was known to be wrong on —
  both have ONE lane, where the old and new arithmetic agree by construction —
  and closed a third fixture neither named.
- **`playwright-core` is pinned to 1.61 in a SCRATCHPAD, not this repo's devDeps**;
  1.61 is the webkit-2311 build already cached on this Mac. 1.55 and 1.62 each
  start a 90MB download.
