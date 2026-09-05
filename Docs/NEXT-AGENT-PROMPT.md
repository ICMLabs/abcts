# NEXT AGENT PROMPT — abcts, 2026-09-04

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-04.md, then Docs/CHECKPOINT-2026-09-04.md §4.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does
not persist between tool calls and the workspace ROOT collects every sibling repo's tests.

THE BROWSER-PARITY ARC IS CLOSED ON WEBKIT — 0 of 685, from 231 when it opened on
2026-08-31. WebKit is the deployment engine: Studio's editor is CodeMirror 6 in a WKWebView.

    zzlive     0 of 685  WebKit        ← closed
    zzlive     4 of 685  Chrome        ← newly on the board, never gated before
    svg-bytes  0 of 685 in-repo, 0 of 356 sibling
    extended   691 digests, ratcheted  ← the non-strict path's FIRST gate
    zzcontrol  dirs 0/17 · tempo 0/13 · lyricfont 0/7 · size 0/9
    suite      2,456, no reds. Keep them all that way.

TO RUN THE BROWSER GATES (the driver is NOT a devDep here and /tmp gets cleaned):

    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
    npx playwright-core install webkit        # only if the cache is gone
    cd <repo> && npm run build                # the gates load dist/, not src/
    PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzlive.mjs
    PW=… ENGINE=chrome node scripts/zzlive.mjs

PIN 1.61 — it names webkit-2311, the cached build. 1.55 and 1.62 each start a 90MB fetch.

TWO AXES ARE OPEN AND THEY WANT DIFFERENT METHODS:

  1. CHROME, 4 of 685. WebKit is at ZERO, so every one of these is something only Blink's
     metrics express — the head of the list is a text row's `Math.round(h * 1.1)` on the
     other side of a boundary, and a bar number's x at 29.75 against 29.99. ⚠️ DO NOT CARRY
     THE WEBKIT PLAYBOOK OVER: a rounding boundary is not fixed by measuring harder, it is
     fixed by matching abcjs's ARITHMETIC. And note the reasoning that kept this axis shut
     for three days — abcjs renders differently in the two browsers, which was read as "so
     only measure one". abcjs disagreeing with ITSELF says nothing about whether WE agree
     with IT in each.

  2. THE NON-STRICT MODES. One gate old and thin. `abcjs-extended` is COMPLETELY unmeasured; only
     four properties of `extended` are asserted (`scripts/zzextended.mjs`); and this week's
     non-strict fixes have no `ABCJS-DIFFERENCES.md` entries, which the repo's own rule
     requires. If you do one thing here, WIDEN `zzextended` — a ratchet says "has not
     changed", never "is right", and only a control can say the second.

⛔ DO NOT RE-OPEN THESE. Each was written, measured and REVERTED this week; the refutation
is in the code or the ledger, so reaching for one costs a day and buys nothing:

    ABCJS-DEBT §3b.2, the "A" probe      costs NOTHING — getBBox().height is the LINE BOX,
                                         identical for "A"/"gggpqy"/"Mg" over 3 faces x 6 sizes
    ABCJS-DEBT §3b.4, vendor prefixes    not reachable non-strict — they are in compat's root
    the stem's falsy-zero `p1 - 1`       measured unreachable on every shape tried
    abcjs's cache without `transient`    measured WORSE — freezes the provisional tempo x
    "0.765625 between two frames"        never existed; a probe read the wrong tune

⭐ THE METHOD, AND CHECKPOINT §4 IS THE WHOLE OF IT IN A TABLE — five things were written
down wrong this week and every one was a claim REASONED from abcjs's source or from the
reach of the code, never measured:

  SIZE AN ARC BY GREPPING THE REFERENCE. "51 call sites must learn their drawn x" was TWO,
  and one grep said so. A WRONG SIZE IS WORSE THAN A WRONG CAUSE — a wrong cause gets tested
  and falls over; a wrong size stops the work being attempted at all.

  A CONTROL MUST BE SHOWN TO SEE ITS DEFECT. Stash the fix and count the reds. Four cuts of
  `zzextended`'s cache rung passed for the WRONG REASON before the fifth passed for the right
  one, and the script records all four.

  STRICT-VS-EXTENDED IS NOT A MEASUREMENT OF A CHANGE — the two already differ. The
  measurement is extended-BEFORE against extended-AFTER, which is what the ratchet does.

  AN UNEXERCISED GATE IS A PREDICTION. Two were written, moved nothing, and were reverted.

TRAPS:
  ⚠️ A PROBE ON A MULTI-TUNE FIXTURE MUST KEY BY TUNE — a global overwritten per tune had
     tune 1 read against tune 0's SVG and invented a discrepancy that cost a session.
  ⚠️ A LADDER SHARING ONE DOCUMENT IS NOT A LADDER — abcjs's `sizeCache` is MODULE-scoped,
     so rung k inherits every rung before it. `zzcontrol` resets per rung; SHARE=1 keeps the
     old behaviour, which is what a long-lived HOST page looks like.
  ⚠️ A GATE CAN WATCH THE WRONG MODE AND READ GREEN — the extended ratchet's first cut passed
     `{mode:"extended"}` to `renderAbc`, which hard-wires strict. `tsc` caught it in one line.
  ⚠️ `npx tsc --noEmit | head -3; echo $?` reports HEAD's status. Write `&& echo OK`, and run
     it BEFORE the test rather than alongside.
  ⚠️ THE SUITE TIMES OUT UNDER MACHINE LOAD AND IT IS NOT A DEFECT — 20s idle, 65s with Xcode
     building, against a 40s default. `--testTimeout=180000`.
  ⚠️ `display:none` ZEROES `getBBox`; use `visibility:hidden`.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The state first**, because two arcs closed in two days and the numbers a stale prompt
carries are the fastest way to send someone at work that is already done.

**Then the two open axes, labelled by what they NEED rather than by size.** They want
different methods — Chrome is an arithmetic search against rounding boundaries, the
non-strict modes are a coverage problem — and an agent that carries the font-lane playbook
from the WebKit arc into either will measure things that are already exact.

**Then the DO-NOT-RE-OPEN list, before the method.** Five items were written and reverted
this week. Every one of them looks like obvious work from the source, which is exactly why
the list has to be read before the method rather than after it.

**Then the method, which is one sentence five ways:** every mistake this week was a claim
reasoned from abcjs's source or from the reach of the code, and measurable in minutes.
