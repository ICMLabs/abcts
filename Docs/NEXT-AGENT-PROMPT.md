# NEXT AGENT PROMPT — abcts, 2026-09-14

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-14.md — §THE FLOOR IS 4 first (the last handoff's
was wrong and would have stopped a session early), then §WHAT IS LEFT, which is TWO rows
and both are differenced to a number. Then -09-13.md and -09-12.md for the rules that got
the wrap row from 59 to 23, and -09-08.md for THE QUADRATICS.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed, and it EARNED ITS KEEP AGAIN):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       90 files, 2,628 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count:
                timeBasedLayout 669 · initialClef 42 · add_classes 16 · lineThickness 14 ·
                expandToWidest 14 · wrap+staffwidth 6 · print 3 · print+responsive 3 ·
                minPadding 4 · scale 2 / 1 / 1
    warnings    0 of 815 · test:dist 0 of 685 ESM and CJS
    lint        1,023 errors — PRE-EXISTING, not a gate, do not "fix" under other work

🛑 THE WRAP ROW IS AT ITS FLOOR PLUS TWO. Four of the six can never close — two are abcjs's
FOURTH DEBUG MARKER, DECLINED by the owner, and two are abcjs CRASHING in its own
`wrapLines`. The floor is 4. ⚠️ The previous prompt said 19 and it was wrong: 19 was
23 minus the four, i.e. the number of CLOSEABLE rows.

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

WHAT TO DO NEXT — two rows, both already differenced:
  1. `synth-flattener-21` — `&` overlay voices. Its single-layer measure is 16.5 too wide
     and its three neighbours 5.5 short apiece; the gap from that measure's opening barline
     to its note is 11.018 in abcjs and 33.018 in ours — 22 extra, TWO more bar rods.
     ⚠️ NOT the per-element advances: every rod was logged against abcjs's and matches, the
     invisible padding rest included. It is the SHARED CURSOR where the layer count changes
     between measures. START FROM THE 22.
  2. `visual-misc-04-stretchlast` — one ULP, and NOT the glissando: our glissando is abcjs's
     expression term for term and abcjs's own `anchor1.x` already carries the noise. It is
     the NOTE's solved x, and the glissando is the only emitter writing full precision.

…and the arcs that are NOT those two: `timeBasedLayout` 669 (a second layout algorithm, its
own arc and the largest thing here), `initialClef` 42 (⚠️ its control is MUTE),
`add_classes` 16, `lineThickness` 14 (cause measured, fix scoped, NOT piecemeal),
`expandToWidest` 14 (size the re-entrancy first). Also open: `Docs/PONYTAIL-DEBT.md`'s
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

**There is very little left on this row, and both items are numbers rather than hunches.**
Item 1 has a localised 22px on a named measure and an explicit list of what has already been
excluded; item 2 is a single ULP whose owner has been traced upstream of the element that
shows it. Neither needs re-deriving.

**Item 1 first because item 2 may not be worth closing.** Matching the spring solve's
accumulation for one column, to fix one byte on one fixture, is a large change to a
load-bearing path for no visible difference — worth stating as a decision rather than
assuming it is work.

**And the row's floor matters to the expectation**: 4, not 6 and not 19. An agent that
closes both should expect `wrap + staffwidth` to read 4 and stop there.
