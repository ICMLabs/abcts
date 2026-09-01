# NEXT AGENT PROMPT — abcts, 2026-09-01 (rev b)

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
  `tempo`, `abc`) in a FRESH DOCUMENT each — abcjs's `sizeCache` is MODULE-global, so sharing one page made nine
  of thirteen rungs "differ" on a build every rung of which is byte-identical alone. AND
  VERIFY A LADDER CAN SEE ITS DEFECT: stash the fix and count the reds.
  `scripts/zzpair.mjs` diffs one fixture element by element. TWO conclusions were committed
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

WHAT IS LEFT — 5, and most of it is DECISIONS rather than effort:

  1. CSSOM SERIALISATION (1). THE OWNER'S CALL — abcjs sets style through the DOM and the
     browser serialises; abcjs disagrees with ITSELF across browsers. Matching it means
     setting styles through the DOM, which is architectural.
  2. A HELD SYLLABLE TAKES THE DEFAULT FONT. Measured, fixed, REVERTED — inheriting the
     directive closes the control and takes FOUR gates red. Scope to the held/empty
     syllable alone and prove against those four, not the control.
  3. Two large font fixtures (several causes each — use a control).
  4. Two selection/tablature fixtures, page heights already exact, unexamined.

  AND ONE MEASURED DIVERGENCE WRITTEN DOWN RATHER THAN LANDED — abcjs's `sizeCache` is
  MODULE-scoped and keyed WITHOUT x (`write/svg.js:306,316`), so the first width it measures
  for a string under 20 chars is the width EVERY later render in that page gets. Ours caches
  per measurer and keys ON the x. No gate can see it — they all render fresh — and a
  long-lived HOST page (Studio's WKWebView) is exactly where it bites. Reproduce:
  `SHARE=1 node scripts/zzcontrol.mjs tempo` → 9 of 13. Fixing it makes our output depend on
  render HISTORY, so it is the owner's call.

✅ CLOSED SINCE (`35d7031`): THE TEMPO'S SUB-PIXEL X, 8 → 5. The old note said passing an x
"changes NOTHING" — true of ONE of the two sites. The prefix branch ALREADY rebuilds a
HEADER tempo at the solved x, so passing `cursor` there closed it; a MID-TUNE [Q:] is
TRANSLATED and its measure-pass cursor is BLOCK-LOCAL — a different x entirely, not one
disagreeing in the last bit — so it had to be rebuilt in the block loop too.

TRAPS, all measured this session:
  ⚠️ `display:none` ZEROES `getBBox` and abcjs measures at DRAW time for a boxed font, so
     hiding harness slots that way INVENTS defects and MASKS others. Use visibility:hidden.
  ⚠️ `npx tsc --noEmit | head -3; echo $?` reports HEAD's status. Two changes that did not
     compile passed it and WebKit caught them. Write `npx tsc --noEmit && echo OK`.
  ⚠️ An EMPTY line measures zero and still takes a row.
  ⚠️ A narrow probe can miss the effect it was built to find.
  ⚠️ A LADDER SHARING ONE DOCUMENT IS NOT A LADDER — abcjs's `sizeCache` is MODULE-scoped
     and keyed without x, so rung k inherits every rung before it.

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

**Then what is left, labelled by what it NEEDS.** Two of the four are decisions, and the
`sizeCache` divergence below them is a THIRD. An agent that treats them as effort will
re-try the held-syllable fallback that four gates already refused, or land a global text
cache nobody asked for.
