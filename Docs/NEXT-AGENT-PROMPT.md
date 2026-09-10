# NEXT AGENT PROMPT — abcts, 2026-09-09d

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-09d.md — §THE METHOD first, then §WHAT IS OPEN. Then
-09-09c.md, -09-09b.md and -09-09.md for the witness, the negative control and "a floor
rots", HANDOFF-2026-09-08.md for THE QUADRATICS and the scaling gate, and
HANDOFF-2026-09-07.md for the MODE RULE.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

    suite       90 files, 2,552 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome
    zzselect    0 of 685  WebKit AND Chrome
    zzclick     1 of 685 DECLARED on all three rows
    zzledger    0 differ, 0 KNOWN, 41 agree      <- EMPTY, first time
    zzopts      26 rows, every one at its declared count
    warnings    0 of 815 · zzscale 8 of 8 LINEAR · test:dist 0 of 685 ESM and CJS
    lint        1,021 errors — PRE-EXISTING, not a gate, do not "fix" under other work

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT SIX TIMES: REFERENCE THE ACTUAL abcjs.
  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it — `setupSelection`'s tempo rule was already here, in
     `range-highlight.ts`, with a doc block explaining it.
  3. LADDER it, one variable per rung, through BOTH engines. `style=` took ten rungs;
     `voicescale` five; the orphaned-slur span twelve, TEN of which already agreed.
  4. INSTRUMENT abcjs when the source is not enough — `/tmp/gp/abcjs` runs without a build,
     and for anything DOM-side render both engines in a real browser instead.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ ENUMERATE THE REFERENCE, NOT YOUR OWN TYPE. `grep -oE "params\.[a-zA-Z_]+"` over
`write/engraver-controller.js` says abcjs reads TWENTY-TWO host options; `AbcjsParams`
declared twelve, and NINE of the ten missing ones opened a `zzopts` row. The same rule found
sixteen directives in one sweep in August. **What else in this repo is a list we wrote
instead of a list we measured?**

⭐⭐⭐ AND FOR AN OPTION ROW THERE IS A BETTER WITNESS THAN A REGEX: does the option change
**abcjs's own output** at all? A row that agrees while abcjs ignores the option proves only
that two engines both ignored it, and now reports MUTE. ⚠️ **A SAMPLE IS A LOWER BOUND FOR
THE WITNESS TOO** — three rows read MUTE on a 1-in-12 walk and are 10, 13 and 14 over the
corpus.

⚠️ TRAPS:
  ⚠️ A DELIBERATE BREAK CAN MISS THE CODE IT WAS AIMED AT. If a break changes nothing,
     suspect the PROBE before the port.
  ⚠️ AN ALGEBRAIC IDENTITY IS NOT A FLOATING-POINT ONE — `(x*s)/s`, `x*STEP/STEP`,
     `(w-2m)+2m`. Three now, and the last one closed eight gate rows.
  ⚠️ A `getBBox` CANNOT SEE A GLYPH'S SCALE — it is CSS-scaled and its path is untouched.
     `getBoundingClientRect` is what sees it.
  ⚠️ A SHARED FIRST-THREE IS NOT A SHARED SET. Difference the full sets.
  ⚠️ `selectable="false"` IS A TRUTHY STRING, and so is every other non-empty one.
  ⚠️ A REPO TEST CAN ASSERT THE DEFECT; A GATE CAN NORMALISE IT AWAY; A FLOOR ROTS.
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT. Re-run before believing a red.
  ⚠️ `/tmp` IS CLEANED MID-SESSION. Restore playwright:
     `mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61`.
  ⚠️ A GATE'S REPORT FILE OUTLIVES ITS RUN. Check the timestamp on `/tmp/abcts-*.txt`.

WHAT TO DO NEXT — ask the owner which; these are NOT equal:
  1. **`lineThickness` — 665 of 685.** ⭐ The best ratio of size to value on the board: an
     ADDITIVE term on four line widths, and the only subtlety is that the mapping is NOT
     uniform — a staff line and a ledger take it as a HALF-thickness (`draw/staff.js:14`,
     `:25`, `draw/relative.js:66`) while a bar and a stem take it WHOLE, the stem's sign
     following its direction (`:61-63`). `ABCJS_LINE_PX` already documents the term it does
     not carry.
  2. **`minPadding` — 659.** Extra room left of every note and bar in the solve;
     `getExtraWidth` adds it for a `note` or `bar` only and `layoutOneItem` skips anything
     still fixed to the left edge (`layout/voice-elements.js:34`, `:110-115`).
  3. **`timeBasedLayout` — 669.** A SECOND layout algorithm (`layout/layout-in-grid.js`),
     spacing by TIME rather than by the spring solve. The largest item in the repo; take it
     only as its own arc.
  4. **`wrap` + `staffwidth` — 60.** Re-lining is implemented and gated on its own numbers,
     and its rendered OUTPUT had never been compared to abcjs's. The 60 may be one cause.
  5. **`initialClef` 125 · `add_classes` 17 · `expandToWidest` 14 · `accentAbove` 13.**
     The small ones; `accentAbove` is one `if` in `creation/decoration.js:20` that moves a
     whole lane.
  6. **ANOTHER SURFACE.** Four were built across 2026-09-09 and found twenty-odd defects.
     Still unrendered by any gate: the SYNTH controller's DOM, `%%` file headers over a whole
     book, tablature options, `chordGrid`, `showDebug`.
  7. **PUBLISH.** Metadata is in, the npm name `abcts` is FREE, the CLI works. A decision,
     not a defect — including whether to drop the 20.7 MB of sourcemaps from the tarball.
  8. **`npm run lint`** — 1,021 pre-existing errors, only as ITS OWN commit.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD first**, because its newest addition is the one with the most left in it:
enumerate the REFERENCE, not your own type. Ten missing options were found by a single grep
over abcjs's controller, and nine of them were real. The question that follows is worth
asking of everything else here — what other list in this repo was written rather than
measured?

**Then `lineThickness`**, because it is 665 of 685 fixtures for four additive terms, and the
only thing to get right is which of them are halves.

**Then the traps**, because the two that repeated this session were both about a measurement
that looked conclusive: a sample that called three live rows MUTE, and a deliberate break
that changed nothing because the probe never reached the code.
