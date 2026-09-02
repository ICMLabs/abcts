# NEXT AGENT PROMPT — abcts, 2026-09-01 (rev e)

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

WHAT IS LEFT — ONE ROW, and it is an ARC rather than a fix:

  `visual-selection-01` and `svg-per-line-01` are BYTE-IDENTICAL RENDERED ALONE. They fail
  only in zzlive's shared page, and the mechanism is measured end to end.
  `scripts/zzwarm.mjs` renders every case zzlive renders before the target and then diffs
  it: the beat-unit notehead at 520.8810519588641 against 520.9005832088641 — the tempo's
  own 1.25 x 1/64. In a warmed page abcjs serves "Easy Swing" from its GLOBAL cache, frozen
  at an earlier fixture's x, while we measure fresh at the true one.

  ⛔ THE FAITHFUL PORT NEEDS BOTH HALVES, AND ONLY ONE IS CHEAP. abcjs's `sizeCache` is
  module-scoped and keyed WITHOUT x (`svg.js:306,316`) AND it always measures the element it
  just DREW. Port only the cache and the first sighting freezes at whatever x the first
  CALLER used — ours is x = 0 almost everywhere: 2 of 53 `textWidth`/`textHeight` sites pass
  a drawn x, both the tempo's. MEASURED with the x-free global cache applied: selection-01
  still differs AND selection-02 and mouse-click-01 break. So matching abcjs in a
  LONG-LIVED page is "measure at the drawn x at every site, then freeze the first sighting"
  — 51 call sites and an ordering question. It costs NOTHING today: every gate renders
  fresh and a host's FIRST tune is already byte-identical. Whether a SECOND tune in the same
  page is worth that arc is the owner's call.

  ✅ CLOSED SINCE (`6c42a08`): THE BOTTOM BLOCK'S PAGE CURSOR, 3 -> 2. `misc-06` is
  byte-identical. The emitter built each row's y as `t.y + oy` — a block-local walk plus a
  base — where `445.779 + 15` is 460.779 and the WALK is 460.77900000000005, abcjs's own.
  The top block has carried `pageY` since the `%%begintext` ULP; same fix one block over.
  ⚠️ AND THE "0.765625 BETWEEN TWO FRAMES" THIS PROMPT CARRIED DOES NOT EXIST — it was a
  probe reading the WRONG TUNE of a two-tune fixture. A PROBE ON A MULTI-TUNE FIXTURE MUST
  KEY BY TUNE.

TRAPS, all measured this session:
  ⚠️ `display:none` ZEROES `getBBox` and abcjs measures at DRAW time for a boxed font, so
     hiding harness slots that way INVENTS defects and MASKS others. Use visibility:hidden.
  ⚠️ `npx tsc --noEmit | head -3; echo $?` reports HEAD's status. Two changes that did not
     compile passed it and WebKit caught them. Write `npx tsc --noEmit && echo OK`.
  ⚠️ An EMPTY line measures zero and still takes a row.
  ⚠️ A narrow probe can miss the effect it was built to find.
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

**Then what is left, and it is ONE ROW that is an ARC.** Two fixtures byte-identical
rendered alone, failing only in a shared page — so there is no fix in the list at all, only
a decision about 51 call sites. An agent that treats it as effort will re-land the cache
port, which is measured to make things worse on its own.
