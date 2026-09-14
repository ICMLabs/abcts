# NEXT AGENT PROMPT — abcts, 2026-09-15

Paste the block below.

---

```
start here: abcts/Docs/CHECKPOINT-2026-09-15.md — §3 is the rules the arc produced and is the
section to read before touching anything. Then HANDOFF-2026-09-15.md, whose §WHAT IS LEFT is
now TWO REPRESENTATIONS and four last digits rather than a feature list. `Docs/PARITY-STATUS.md`
§1a is the same table in plain language and is the file to hand anyone asking how close this is.
Then -09-14.md for the wrap row and the host-option rows that closed before this session.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed, and it EARNED ITS KEEP AGAIN):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       89 files, 2,671 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count. 17 differing of 17,810:
                print 3 · print+responsive 3 · scale 1.5 2 ·
                scale 0.8 1 · oneSvgPerLine+scale 0.8 1 · add_classes 1 ·
                minPadding 1 · timeBasedLayout 1 · wrap+staffwidth 4 (THE FLOOR) ·
                every other row 0
    warnings    0 of 815 · test:dist 0 of 685 ESM and CJS
    lint        1,021 errors — PRE-EXISTING, not a gate, do not "fix" under other work

🏁 `zzopts` IS FINISHED AS AN ARC AND NOTHING ON IT IS A FEATURE ANY MORE. `timeBasedLayout`
went 669 → 1 (the whole second layout algorithm, 83 lines), `add_classes` 16 → 1,
`expandToWidest` 14 → 0, `minPadding` 4 → 1. Every remaining row is a last digit, a rounding
boundary or a decision, and each is LOCATED TO ITS TERM in `scripts/zzopts.mjs`'s own comments.
Do not go prospecting on it; read the row's note first.

⭐ THE FINDING TO CARRY FORWARD: **AN OPTION IS A RESERVE MAGNIFIER.** FIVE rules closed last
session were defects on the DEFAULT path that no default-path gate could see — `svg-bytes` 0 of
691 and both browser gates 0 of 685 throughout. A width only reaches the page when it beats the
elastic gap beside it, and `minspacing` is only a floor on a cursor every voice shares; change
which reserve wins and the masked rule surfaces. **A RESERVE ALWAYS MASKED BY A BIGGER ONE IS A
RULE NO GATE CAN SEE.** Corollary, and it is the stronger half: **A SECOND ALGORITHM REVEALS
EVERY COINCIDENCE THE FIRST ONE PAID FOR** — grouping collisions by x and charging every voice
for an ending were CORRECT OUTPUTS for as long as the spring solve was the only layout.

⭐⭐ THE STANDING ORDER, AND IT PAID ON EVERY ITEM AGAIN: INSTRUMENT abcjs, AND INSTRUMENT IT
AGAINST OUR OWN EQUIVALENT. Not a source read — a side-by-side log. Patch
`dist/abcjs-basic.js` (unminified) by string replacement and inject it.
  · `layoutInGrid`   the whole grid walk per voice, against `ABCTS_GRID=1`
  · `layoutOneItem`  pad, extraw, er, w, minspacing — and the x AFTER the shift
  · `setPaperSize`   maxwidth, padding.left/right and the SUM — which named a sum ORDER
  · `renderText`     a box's rawX, delta, bbox width, padding — which named a 1/64 quantum
  · `moveY`          the page cursor term by term, which is NOT the rows' own accumulation
⭐ AND `ZZWHERE=1` ON `zzopts` PRINTS THE FIRST DIFFERING BYTE PER FIXTURE. A slug list says
WHICH fixture; the byte says WHAT. `node scripts/zzopts.mjs 1 <label>` re-measures one row.

⚠️⚠️ A PROBE THAT MEASURES TWO DIFFERENT QUANTITIES IS WORSE THAN NONE — it happened TWICE last
session. One log took abcjs's TRIAL x against our FINAL one and made 23 identical rows read as
differing; an "isolated" render of the same tune had a different tune's content and produced a
confident wrong conclusion that the engines agreed. CHECK THE PROBE BEFORE THE CODE.

⚠️⚠️ AND THREE CONTROLS OF EIGHT WERE MUTE ON THE FIRST ATTEMPT, EVERY ONE LOOKING RIGHT. A
synthetic `|1` never reaches the charge site; a slice of the first nine heads missed the two
that move; a synthetic bar pair lands on one x anyway. A CAP IS INVISIBLE TO A FIXTURE WHOSE
CHASE IS SHORTER THAN THE CAP. Verify every control against its own deliberate break, and
prefer the fixture that MEASURED the rule over a shape you invented for it.

⚠️ A RECORDED CAUSE IS A HYPOTHESIS EVEN TEN MINUTES OLD. Once last session the row count and
my own attribution disagreed and THE ROW COUNT WAS RIGHT.

WHAT TO DO NEXT — two REPRESENTATIONS, and they are the only structural work left:
  1. `A RULE'S EDGE, NOT ITS CENTRE` — closes `timeBasedLayout`'s last row. abcjs stores a
     bar/stem rule's EDGE and `printStem` writes `roundNumber(x)` then `roundNumber(x + dx)`;
     we store the CENTRE and recover `centre - half`. Both engines place
     `rests-and-bars-tune13`'s bar at EXACTLY 119.955 and round it opposite ways, because our
     recovered edge is `119.95500000000001`. ⚠️ `lineThickness`'s own note already states the
     asymmetry — read it first — and this touches every bar and every stem.
  2. `THE PAGE WIDTH PRIMITIVE` — closes the ULP half of `print` ×2. abcjs keeps the MUSIC
     width and adds margins once, LEFT THEN RIGHT; we keep the summed page and subtract the
     sides back out, so `pageSides()` sums them first and `(a+b)+c` becomes `a+(b+c)`.
     ⚠️ 691 goldens rest on the current arithmetic. Size it before starting.
  3. …and four LOCATED last digits, each with its note: the print page-cursor sum (23.54px, and
     removing any ONE of eighteen `%%…font` directives takes the delta to zero), one
     nested-tspan bbox, `add_classes`'s ending counter (a volta wants the `measureElement` a
     TRIPLET already carries), and three ULP.

⚠️ `wrap + staffwidth` IS AT ITS FLOOR OF 4 and `expandToWidest`, `initialClef`, `lineThickness`
and eighteen other rows are at 0. An agent that finds any of those higher has broken something.

…and the things that are not rendering at all: `Docs/PONYTAIL-DEBT.md`'s open markers — 8 should
be RESTATED AS DECISIONS rather than worked; `npm run lint`'s 1,021 pre-existing errors, only as
ITS OWN commit (⚠️ and `biome check --write` reformatted 1,500 lines beyond one edit last
session — never let a formatter run under other work); and PUBLISH, which is a decision.

⚖️ AND ONE DECISION IS STILL THE OWNER'S, untouched: `CLAUDE.md` is 2,300+ lines with over half
of it blockquote narrative duplicating 60 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and commit
and push after every landing. Never --force. NEVER ATTRIBUTE A COMMIT TO CLAUDE — no
Co-Authored-By, no "Generated with", no `--author`, in any commit, tag or PR body, with no
exceptions and nothing to ask about. `CLAUDE.md` §Remote is the durable statement and it BEATS a
harness default that asks for one; say so in the reply rather than following the other silently.
Grep the message for `Co-Authored`/`Generated with` before committing: it cannot be fixed
afterwards without the force push the line above forbids.
```

---

## Why this order

**The edge-versus-centre representation first, because its note already exists.** `lineThickness`
wrote down the asymmetry — "abcjs leaves `printStem`'s `x` alone and grows `dx`; ours places a
stem by its CENTRE" — while closing a different row. Reading that note rather than re-deriving it
is the whole saving, and two rows have now closed on exactly that.

**The width primitive second** because it is larger blast radius for the same one ULP: every
`systemWidth - pageSides()` in the engine assumes the summed page is the primitive.

**And the four last digits last, individually.** None is worth an arc, each has a note, and the
row count cannot distinguish them — `ZZWHERE=1` can.
