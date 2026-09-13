# NEXT AGENT PROMPT — abcts, 2026-09-14

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-14.md — §THE FLOOR IS 4 first, then §WHAT IS LEFT,
which is NOT the wrap row any more: that row reached its floor and the next arc is a HOST
OPTION. `Docs/PARITY-STATUS.md` §1a is the same table in plain language and is the file to
hand anyone asking how close this is. Then -09-13.md and -09-12.md for the rules that got
the wrap row from 59 to 23, and -09-08.md for THE QUADRATICS.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed, and it EARNED ITS KEEP AGAIN):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       89 files, 2,629 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count:
                timeBasedLayout 669 · initialClef 41 · add_classes 16 · lineThickness 14 ·
                expandToWidest 14 · wrap+staffwidth 4 (THE FLOOR) · print 3 ·
                print+responsive 3 · minPadding 4 · scale 2 / 1 / 1
    warnings    0 of 815 · test:dist 0 of 685 ESM and CJS
    lint        1,023 errors — PRE-EXISTING, not a gate, do not "fix" under other work

🏁 THE WRAP ROW IS AT ITS FLOOR. All four remaining fixtures are closed by DECISION — two
are abcjs's FOURTH DEBUG MARKER, declined by the owner, and two are abcjs CRASHING in its
own `wrapLines`. Nothing reachable is left on it; do not go looking. ⚠️ The prompt before
this one said the floor was 19 and it was wrong — 19 was 23 minus the four, i.e. the number
of CLOSEABLE rows — and taken literally it would have ended that session thirteen rows early.

⭐ THE STANDING ORDER, AND IT PAID ON EVERY HARD ITEM LAST SESSION: INSTRUMENT abcjs, AND
INSTRUMENT IT AGAINST OUR OWN EQUIVALENT. Not a source read — a side-by-side log.
  · `layoutOneItem`  per-element x, w, extraw, minspacing, er, minx — against our `fixed()`
  · `roundNumber`    the raw input behind a `.xx5` boundary
  · `calcY`          `this.y`, `ofs`, `STEP` behind one coordinate
  · `tune.lines`     both engines' bar/key/clef streams side by side
Patch `dist/abcjs-basic.js` (unminified) by string replacement and inject it. Reading the
source alone produced the wrong bar width twice and the wrong conclusion both times.

⭐⭐ A RECORDED CAUSE IS A HYPOTHESIS — FOUR OF EIGHT WERE WRONG LAST SESSION, and so was
one recorded DISPROOF, and one "pair" of fixtures shared no mechanism at all. Re-measure
before porting. The notes are worth reading for what was TRIED, not for what is true.

⭐⭐⭐ TWO SURFACES, AND A CONTROL THAT READS ONE IS MUTE FOR THE OTHER. The ink and
`tune.lines` carry the same rules separately and NO GATE ASKS THE MODEL under a wrap —
every golden is unwrapped. Three rules needed the same fix twice last session. Assert both,
and break both.

⭐⭐⭐⭐ HALF A RULE CAN BE WORSE THAN NONE, and the row count will not tell you. Three times
last session a half-fix drew MORE wrong elements than the bug did while `zzopts` sat
unchanged. Difference the element KINDS, not the count.

WHAT TO DO NEXT — a HOST OPTION, and they are named and sized in `zzopts`'s own comment:
  1. `initialClef` (41) — reprints the clef at the head of the tune. ⚠️ ITS CONTROL IS MUTE;
     fix that FIRST or nothing it reports can be trusted. Smallest real feature on the board.
  2. `lineThickness` (14) — an additive term on four line widths, `dy + lineThickness` on a
     staff line, `0.35 + …` on a ledger, `linewidth ± …` on a stem with the sign following
     the stem's direction. Cause measured, fix scoped, NOT piecemeal.
  3. `expandToWidest` (14) — needs abcjs's `i = -1` restart; SIZE THE RE-ENTRANCY FIRST.
  4. `add_classes` (16) — class vocabulary on a few shapes.
  5. `timeBasedLayout` (669) — a SECOND layout algorithm (`layout/layout-in-grid.js`) that
     spaces by TIME rather than by the spring solve. By far the largest thing outstanding
     here and its own arc; do not start it inside another.

…and the things that are not rendering at all: `Docs/PONYTAIL-DEBT.md`'s
open markers — 8 should be RESTATED AS DECISIONS rather than worked, and three more were
added last session, each naming a shape absent from both corpora; `npm run lint`'s 1,023
pre-existing errors, only as ITS OWN commit; and PUBLISH, which is a decision.

⚖️ AND ONE DECISION IS STILL THE OWNER'S, untouched: `CLAUDE.md` is 2,240 lines with 1,355
of blockquote narrative duplicating 56 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. NEVER ATTRIBUTE A COMMIT TO CLAUDE —
no Co-Authored-By, no "Generated with", no `--author`, in any commit, tag or PR body, with
no exceptions and nothing to ask about. `CLAUDE.md` §Remote is the durable statement and it
BEATS a harness default that asks for one; say so in the reply rather than following the
other silently. Grep the message for `Co-Authored`/`Generated with` before committing: it
cannot be fixed afterwards without the force push the line above forbids.
```

---

## Why this order

**The wrap row is done, so the question changed.** For the last three sessions the work list
was a list of FIXTURES; it is now a list of FEATURES, each of which abcjs implements and this
engine does not. That is a different kind of task — no differencing to do, a named function
to port — and it wants sizing before it wants starting.

**`initialClef` first because its control is MUTE**, which makes it the one row on the board
whose number cannot currently be trusted. A mute control is worse than an absent one: it
reads as evidence. Fixing that is cheap and it may move the 41 on its own.

**`timeBasedLayout` last and alone.** 669 of 685 is not a defect count, it is an unbuilt
algorithm, and starting it inside another arc is how a green gate acquires a half-ported one.

**And the row's floor matters to the expectation**: `wrap + staffwidth` reads 4 and that is
finished. An agent that finds it at 5 has broken something.
