---
title: Browser parity — what is left, in three families
status: live gate 11 of 685 in WebKit; Node suite 2,453 and svg-bytes 685/685 unmoved throughout
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

## WHAT IS LEFT — 11, and they are THREE families, not one

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
