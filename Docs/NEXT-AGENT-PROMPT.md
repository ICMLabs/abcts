# NEXT AGENT PROMPT — abcts, 2026-09-09c

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-09c.md — §THE METHOD first, then §WHAT IS OPEN. Then
HANDOFF-2026-09-09b.md and -09-09.md for the witness, the negative control and "a floor
rots", HANDOFF-2026-09-08.md for THE QUADRATICS and the scaling gate, and
HANDOFF-2026-09-07.md for the MODE RULE.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

    suite       90 files, 2,547 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome
    zzselect    0 of 685  WebKit AND Chrome
    zzclick     1 of 685 DECLARED on all three rows
    zzopts      15 rows, every one at its declared count
                print 5 · scale 0.8 1 · scale 1.5 2 · oneSvgPerLine 0 · viewports 0
    zzledger    2 differ, 2 KNOWN — 39 controls
    warnings    0 of 815 · zzscale 8 of 8 LINEAR · test:dist 0 of 685 ESM and CJS
    lint        1,021 errors — PRE-EXISTING, not a gate, do not "fix" under other work

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT SIX TIMES: REFERENCE THE ACTUAL abcjs.
  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it — `setupSelection`'s tempo rule was already here, in
     `range-highlight.ts`, with a doc block explaining it. A rule ported at the site that
     named it is not a rule ported.
  3. LADDER it, one variable per rung, through BOTH engines. The `style=` spec below took
     five rungs; the orphaned-slur rule took twelve, and TEN of them already agreed.
  4. INSTRUMENT abcjs when the source is not enough — `/tmp/gp/abcjs` runs without a build,
     and for anything DOM-side render both engines in a real browser instead.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ PROVE THE GATE GOES RED — AND THEN CHECK WHICH ROWS STAYED GREEN. ⚠️ **A DELIBERATE
BREAK CAN MISS THE CODE IT WAS AIMED AT**: `zzclick` dispatched every probe ON the element,
so `getTarget` always resolved and the whole coordinate path never ran — cutting its 12px
radius to 6 left the gate at 0 of 35. Dispatching near misses on the `<svg>` instead, the
same break reads 33 of 35. If a break changes nothing, suspect the PROBE before the port.

⭐⭐⭐ AND AN ALGEBRAIC IDENTITY IS NOT A FLOATING-POINT ONE. `(x * 0.75) / 0.75` is not
`x`, the emitter had written `x` with a comment saying the two cancel, and putting abcjs's
round trip back closed EIGHT gate rows in one expression. This repo has now been bitten by
`(x*s)/s`, `x*STEP/STEP` and `(w-2m)+2m`.

⚠️ TRAPS:
  ⚠️ A SHARED FIRST-THREE IS NOT A SHARED SET — twice now. `zzopts` and `zzclick` each
     print three slugs; DIFFERENCE the full sets. On `zzclick` two fixtures looked alike and
     had different causes, one `staffPos` and one a `startChar`.
  ⚠️ `selectable="false"` IS A TRUTHY STRING, and so is every other non-empty one.
  ⚠️ A REPO TEST CAN ASSERT THE DEFECT — four did. PROBE abcjs before believing a red.
  ⚠️ A GATE CAN NORMALISE THE DEFECT AWAY. If a gate needs a shim to compare, ask what it
     is hiding.
  ⚠️ A SAMPLE IS A LOWER BOUND, NEVER A NUMBER TO DECLARE.
  ⚠️ A FLOOR ROTS. Ratchets read `agree === total`; write new ones the same way.
  ⚠️ EVERY GATE ROW CARRIES A WITNESS — a regex the shape must produce in abcjs's OWN
     output — and the witness has been the thing that was wrong three sessions running.
  ⚠️ `git stash push` + rebuild + re-run tells a REGRESSION from a PRE-EXISTING difference.
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT. Re-run before believing a red.
  ⚠️ `/tmp` IS CLEANED MID-SESSION. Restore playwright:
     `mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61`.
  ⚠️ A GATE'S REPORT FILE OUTLIVES ITS RUN. Check the timestamp on `/tmp/abcts-*.txt`.

WHAT TO DO NEXT — ask the owner which; these are NOT equal:
  1. **`style=` BETWEEN VOICES.** ⭐ The one open ledger defect, and the SPEC IS NOW
     WRITTEN — five rungs in `zzledger.mjs`'s own comment. `this.style` is engraver state
     that `pushCrossLineElems` does not save and `reset()` does not clear, so it runs in
     (line, staff, voice) ENGRAVING order: a header `K: style=` reaches both voices, a
     line-start `[K:]` does NOT reach its own voice's notes (`appendStartingElement` puts it
     on the STAFF) and then applies to every later voice and line. Ours is per voice at
     parse time and cannot express any of it. A model change, size re-derived twice.
  2. **ANOTHER SURFACE.** Three built on 2026-09-09 found sixteen defects between them, and
     the newest — a CLICK — found a PARSER defect no markup gate could see. What else does a
     host do that no gate does? `add_classes` beyond the 111 sibling goldens,
     `wrap`/`staffwidth` combinations, tablature options, `format` overrides, a `%%` file
     header over a whole book, the SYNTH controller's DOM.
  3. **THE FIVE REMAINING `print` ROWS HAVE FIVE CAUSES**, listed in the handoff. The shared
     root is closed; these are individual, and `visual-options-01-fonts` has several open
     causes at once and cannot arbitrate anything alone.
  4. **`staffPos`'s CLAMP SPLIT** — `zzclick`'s one declared fixture. `zero` is exact and
     `top + height` is exact; abcjs folds the inter-system clamp into `staff.top` and we
     spend it in the system advance. Moves no ink.
  5. **Finish the marker sweep.** ~55 of the 94 are still classified by reading alone.
  6. **PUBLISH.** The metadata is in, the name `abcts` is FREE on npm, and the CLI works
     now. What is left is a decision, not a defect — and see item 10 of the handoff about
     the 20.7 MB of sourcemaps in the tarball.
  7. **`npm run lint`** — 1,021 errors, all predating this session. Only worth doing as ITS
     OWN commit, never folded into other work.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD first**, because its newest addition is the sharpest one yet: a deliberate
break that changes nothing means the PROBE is wrong, not the port. That is how `zzclick`'s
whole coordinate path turned out to be untested minutes after the gate went green.

**Then `style=`**, because it is the only open item whose SPEC is finished. Five rungs are
written down; what is left is the model change, and the size has now been re-derived twice
and stands both times.

**Then the traps**, because the two that repeated — a shared first-three read as a shared
set, and a witness that was itself wrong — each cost a wrong conclusion this session and
each was caught by one extra measurement.
