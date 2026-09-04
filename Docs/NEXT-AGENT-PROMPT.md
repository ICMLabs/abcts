# NEXT AGENT PROMPT — abcts, 2026-09-01 (rev f)

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-01.md

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does
not persist between tool calls and the workspace ROOT collects every sibling repo's tests.

A NEW AXIS IS OPEN AND IT IS THE ONE A DROP-IN IS JUDGED ON. Every headless gate compares
against goldens harvested from abcjs UNDER JSDOM, where `dump-svg.js` PATCHES `getBBox`
with calibrated tables. `scripts/zzlive.mjs` puts abcts and abcjs 6.7.0 in ONE WebKit page
and diffs them live:

    live gate: 5 of 685      (231 when the axis opened; 8 before the tempo x)
    Node suite 2,453, svg-bytes 685 of 685 — both green, keep them that way

⚠️ NO STORED GOLDEN CAN REPLACE IT. abcjs does not render byte-identically in WebKit and
Blink — 230 of 691 differ between them — so browser parity has NO SINGLE TARGET and the
only coherent oracle is abcjs in the SAME browser. Re-harvesting from a browser is ruled
out, measured, in `d4b7022`.

TO RUN IT (the driver is NOT a devDep here and /tmp gets cleaned):

    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
    npx playwright-core install webkit        # only if the cache is gone
    cd <repo> && npm run build                # the gates load dist/, not src/
    PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzlive.mjs

PIN 1.61 — it names webkit-2311, the cached build. 1.55 and 1.62 each start a 90MB fetch.

⭐ THE METHOD, IN THE ORDER THAT PAID — and it is the whole handoff in one line:

  A LADDER OF CONTROLS IS THE PROOF; A FIXTURE WITH MORE THAN ONE OPEN CAUSE CANNOT RULE
  ANYTHING OUT. `scripts/zzcontrol.mjs` runs one variable per rung (`size`, `dirs`,
  `tempo`, `lyricfont`, `abc`) in a FRESH DOCUMENT each — abcjs's `sizeCache` is MODULE-global, so sharing one page made nine
  of thirteen rungs "differ" on a build every rung of which is byte-identical alone. AND
  VERIFY A LADDER CAN SEE ITS DEFECT: stash the fix and count the reds.
  `scripts/zzpair.mjs` diffs one fixture element by element, and `zzwarm.mjs` does the
  same with the page PRE-WARMED, which is the only way to see a shared-page defect. TWO conclusions were committed
  to this repo and both were WRONG, both reasoned from `visual-options-01-fonts`, which
  sets EIGHTEEN font directives at once. Nine control tunes refuted them in one run.

  AND THREE INSTRUMENTS EACH CAUGHT WHAT THE OTHERS COULD NOT: the ladder overturned those
  two notes; the NODE CORPUS caught an over-broad fallback whose own control was
  byte-perfect; and the AGGREGATE live gate caught a fix that closed its target, kept Node
  green, and put two OTHER fixtures 23.27px out. Run all three.

THE RULE BEHIND ALMOST EVERY FIX: abcjs MEASURES THE THING IT IS ABOUT TO DRAW and we
measured a STAND-IN — a probe string, a generic font, the wrong family, one line's height
where the whole block's was wanted. And `h + (n-1) * size * 1.2` IS THE STUB'S `getBBox`,
NOT A RULE — it has appeared FOUR times.

WHAT IS LEFT — NOTHING ON WEBKIT. The live gate is 0 of 685.

  🆕 CHROME IS NEWLY ON THE BOARD AT 4 OF 685 — `ENGINE=chrome node scripts/zzlive.mjs`.
  Nothing had ever run it: the arc opened on WebKit because Studio's editor is a WKWebView,
  and `d4b7022` measured that abcjs does not render byte-identically in the two (230 of
  691) — which was read as "so only measure one". That does not follow. abcjs disagreeing
  with ITSELF across browsers says nothing about whether WE agree with IT in each. The
  cache port took Chrome 5 -> 4 on the same change, so it is not a WebKit-only fix.

    abcts-text-udef-parts-overlays-tune23  the staff 1px low — a text row's
                                           `Math.round(h * 1.1)` on the other side of a
                                           boundary where Blink measures a hair differently
    abcjs-visual-wrap-03-piano-wrap        a bar number's x, 29.75 against 29.99
    abcjs-visual-wrap-04-wrap-quartet      same family, deeper in the file
    abcjs-visual-options-01-fonts          byte 8753, unexamined

  ⚠️ DO NOT ASSUME THESE ARE THE WEBKIT DEFECTS AGAIN — WebKit is at ZERO, so each is
  something only Blink's metrics express. A rounding boundary is the shape to expect, and a
  rounding boundary is not fixed by measuring harder.

  ✅ CLOSED (`97613c6`): abcjs's TEXT CACHE is MODULE-GLOBAL and x-free (`svg.js:306,316`),
  consulted BEFORE the drawn element — so the first width it measures for a short string is
  the width every later render in that page gets. That was the whole of the last two rows,
  which were byte-identical rendered ALONE. ⚠️ AND THE 51-CALL-SITE ARC THIS PROMPT SIZED
  DOES NOT EXIST: `getTextSize.calc` is handed an ELEMENT at exactly TWO sites in all of
  abcjs (`draw/tempo.js:20,32`) and our two x-passing sites are already those two. ⭐ SIZE
  AN ARC BY GREPPING THE REFERENCE, NOT BY REASONING ABOUT IT — a wrong SIZE is worse than
  a wrong cause, because it stops the work being attempted at all. What was really in the
  way is that WE lay a tempo out TWICE and abcjs once; `TextFont.transient` keeps the
  throwaway pass out of the cache.

  📒 AND WHAT THE ARC COST IN FIDELITY-TO-A-BUG IS IN `Docs/ABCJS-DEBT.md` §3b — four
  entries, the largest being that abcjs's output DEPENDS ON WHAT WAS RENDERED BEFORE IT in
  the same page, and that abcjs discards its own x-corrected tempo measurement one line
  after making it. Read it before "fixing" any of them.

  📋 AND THE PLAN FOR LANDING ALL FOUR IS `Docs/PLAN-ABCJS-DEBT-2026-09-03.md`. Every one is
  a NON-STRICT change, so strict byte parity is not at risk by construction — but ⚠️ THE
  NON-STRICT PATH HAS ALMOST NO GATE (three test files reference a mode at all; every corpus
  gate renders strict), so PHASE 0 IS BUILDING ONE and is not optional. Order is fixed:
  gate, cache, whitespace/4-pitch, then the `"A"` probe LAST because it depends on the
  whitespace fix and moves every page in extended.

TRAPS, all measured this session:
  ⚠️ `display:none` ZEROES `getBBox` and abcjs measures at DRAW time for a boxed font, so
     hiding harness slots that way INVENTS defects and MASKS others. Use visibility:hidden.
  ⚠️ `npx tsc --noEmit | head -3; echo $?` reports HEAD's status. Two changes that did not
     compile passed it and WebKit caught them. Write `npx tsc --noEmit && echo OK`.
  ⚠️ An EMPTY line measures zero and still takes a row.
  ⚠️ A narrow probe can miss the effect it was built to find.
  ⚠️ SIZE AN ARC BY GREPPING THE REFERENCE, NOT BY REASONING — "51 call sites" was wrong
     and one grep said so; a wrong SIZE stops work being attempted at all.
  ⚠️ A PROBE ON A MULTI-TUNE FIXTURE MUST KEY BY TUNE — a global overwritten per tune had
     tune 1 read against tune 0's SVG and invented a discrepancy that cost a session.
  ⚠️ A LADDER SHARING ONE DOCUMENT IS NOT A LADDER — abcjs's `sizeCache` is MODULE-scoped
     and keyed without x, so rung k inherits every rung before it. The same fact makes two
     of zzlive's four reds page HISTORY rather than layout.

Run `npx tsc --noEmit && echo OK` before every commit, keep BOTH gates green, and commit
and push after every landing. Never --force. Omit Co-Authored-By trailers here.
```

---

## Why this order

**The live gate first**, because it is the only thing that can name a browser defect and it
did not exist three days ago.

**Then the method**, because the two wrong conclusions this session had to retract were both
produced by reasoning from a fixture instead of a control — and each cost more than the fix
that eventually landed.

**Then what is left, which on WebKit is nothing.** The board moved to a second browser the
moment the first hit zero, and the four Chrome rows are a different KIND of defect — Blink
metrics against rounding boundaries, not lanes measured in the wrong font. An agent that
carries the WebKit playbook straight over will measure things that are already exact.
