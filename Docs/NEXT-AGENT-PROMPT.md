# NEXT AGENT PROMPT — abcts, 2026-09-01 (rev d)

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

WHAT IS LEFT — 2, and ONE OF THEM IS NOT A RENDERER DEFECT AT ALL:

  1. TWO FIXTURES THAT ARE BYTE-IDENTICAL RENDERED ALONE. `visual-selection-01` and
     `svg-per-line-01` pass zzpair exactly and fail zzlive; the whole difference is the
     cache below. ⚠️ CONFIRM WITH zzpair BEFORE CHASING ANY RED — zzlive shares one page
     across 691 cases and abcjs's text cache is module-global.
  2. `misc-06-title-1bold` — ONE ULP, and it is the VISIBLE EDGE OF A 0.765625 THAT
     CANCELS. Page height exact; one bottom-block row reads 460.779 against
     460.77900000000005. INSTRUMENTED: the emitter builds that y as `t.y + oy` — a
     block-local walk plus a base, the hazard `bottomTextBlock`'s own doc warns about —
     while `pageEnd`'s WALK reaches 461.54462500000005 for the same row: abcjs's last bits,
     and 0.765625 HIGH. Two frames, two errors cancelling by the page end, eighth time.
     Stamping `pageY` from the walk is the right shape (the TOP block already does it) and
     lands a 0.77px error TODAY — written, measured, reverted. ⭐ SO THE WORK IS THE
     0.765625, WHICH IS TWO FRAMES AND IS NOW LOCATED: `bottom` is built from `originY`
     and the emitter adds `OY = -doc.top` (14.234375) where `pageEnd` walks from
     `padding.top` (15) — and `absoluteY - originY` is itself 15.000000000000057, which is
     the ULP. NEXT PROBE: `doc.top`'s derivation against `padding.top`, and whether the
     page height actually comes from `pageEnd`. Also dead and measured: per-phrase
     `richHeight`, left-associating `(originY + leading) + h*STEP`, stamping `pageY` on the
     bottom rows from the walk (right shape, lands 0.77px TODAY), every `%%setfont` rung.

  ⛔ AND DO NOT RE-TRY THE NAIVE CACHE PORT. abcjs's `sizeCache` is MODULE-scoped and keyed
  WITHOUT x (`write/svg.js:306,316`) — but WITH the class. Porting it (module-scoped, x
  dropped) takes the live gate from 4 to SEVEN: it re-breaks all three tempo fixtures,
  because each engine's cache freezes at ITS OWN first x and the two only track once every
  x already agrees. Measured both ways, reverted. A faithful port needs the CLASS in the
  key, which `TextFont` cannot express today.

  ✅ CLOSED SINCE (`6c8d920`): THE ZERO-HEIGHT LYRIC — `zzcontrol lyricfont` is 0 of 7.
  `this.height = opt.height ? opt.height : 4` (`relative-element.js:36`) over
  `height: lyricDim.height / STEP`: a held syllable's `lyricStr` is `"\n"`, PURE WHITESPACE,
  so `getTextSize` early-outs to zero, `opt.height` is FALSY, and the element takes abcjs's
  FOUR-PITCH DEFAULT. `lyricHeightBelow` maxes over children, so it binds under 15.5px.
  ⭐ A SIZE LADDER NAMED IT BECAUSE THE DEFECT HAS A THRESHOLD — abcjs pinned at 114.1655
  for every size ≤10pt in both faces while ours kept shrinking, turning exactly at
  4 × 3.875. ⚠️ AND THE OBVIOUS FIX WAS WRONG, MEASURED: "max the measurement, not the
  string" is a NO-OP (one verse, one text). The defect was never WHICH string is measured;
  it is what a measurement of ZERO means.

  ✅ CLOSED SINCE (`20edbfe`): THE HELD SYLLABLE. The `&nbsp;` a `_` carries onto the next
  note went from 17 BOLD to abcjs's 27 normal. ⭐ THE SCOPE WAS THE WHOLE FINDING: resolving
  EVERY null `lyricFont` from the directive closes the same control and takes FOUR gates
  red; keying on `raw === ''` closes it with all 2,453 green. `zzcontrol lyricfont` is the
  ladder — 6 of 7 rungs differ with the fix stashed, 1 of 7 with it, and that one is item 3.

  ✅ CLOSED SINCE (`0e7abc4`): CSSOM SERIALISATION, 4 → 3 — and it was filed as THE OWNER'S
  CALL because the question was put about the wrong thing. "Matching one browser breaks the
  other" is TRUE of a string we EMIT and FALSE of declarations we SET: re-running abcjs's
  eight `setScale` assignments over the INSERTED element makes `ledger-gaps-tune5`
  byte-identical in WebKit AND Chrome. The note called that "architectural"; it is one
  function over ONE element. ⭐ "ARCHITECTURAL" IS A CLAIM ABOUT SCOPE AND CAN BE MEASURED.

  ✅ CLOSED SINCE (`5092802`): EVERY `%%<type>font` LANE, 5 → 4. Ten sites, one defect, and
  it is the arc's own rule — each asked for a DEFAULT PROBE IN A DEFAULT SERIF where abcjs
  hands `getTextSize.calc` the directive's whole font object. `options-01-fonts` is
  byte-identical. AND THE PROBE STRING IS ABCJS'S: `addTextIf` measures "A", `richText`'s
  empty arm "i" — never the row's text — while `Subtitle` measures its own string. `'Mg'`
  carries a descender the probes do not, so the SIGN of the error moved with the face.

  ⭐ AND LEAVE-ONE-OUT IS THE LADDER'S COMPLEMENT. Delete one LINE of the fixture at a time
  and print the page delta: it ENUMERATES the causes of a fixture with many, where a ladder
  ISOLATES one. On an eighteen-directive fixture it named four contributors summing to the
  observed 3.06px exactly, and a control per contributor then proved each fix.

TRAPS, all measured this session:
  ⚠️ `display:none` ZEROES `getBBox` and abcjs measures at DRAW time for a boxed font, so
     hiding harness slots that way INVENTS defects and MASKS others. Use visibility:hidden.
  ⚠️ `npx tsc --noEmit | head -3; echo $?` reports HEAD's status. Two changes that did not
     compile passed it and WebKit caught them. Write `npx tsc --noEmit && echo OK`.
  ⚠️ An EMPTY line measures zero and still takes a row.
  ⚠️ A narrow probe can miss the effect it was built to find.
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

**Then what is left, and it is TWO ROWS.** One is not a renderer defect at all — two
fixtures byte-identical rendered alone — so there is exactly ONE piece of engineering in the
list: the 0.765625 between two derivations of the page cursor. An agent that treats the
other as effort will chase a fixture that is already byte-identical, or re-land the cache
port measured at 4 → 7.
