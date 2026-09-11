# NEXT AGENT PROMPT — abcts, 2026-09-11

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-11.md — §THE METHOD first, then §WHAT IS OPEN. Then
-09-09e.md for the host-option surface as a whole, -09-09d/c/b.md for the witness, the
negative control and "a floor rots", HANDOFF-2026-09-08.md for THE QUADRATICS and the
scaling gate, and HANDOFF-2026-09-07.md for the MODE RULE.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS and it took the playwright scratchpad AND every
scratch probe last time. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       90 files, 2,556 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count:
                timeBasedLayout 669 · wrap+staffwidth 59 · initialClef 42 ·
                add_classes 16 · expandToWidest 14 · lineThickness 14 ·
                print 5 · print+responsive 5 · minPadding 5 · scale 2 / 1 / 1
    warnings    0 of 815 · zzscale 8 of 8 LINEAR · test:dist 0 of 685 ESM and CJS
    lint        1,021 errors — PRE-EXISTING, not a gate, do not "fix" under other work

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT SIX TIMES: REFERENCE THE ACTUAL abcjs.
  1. READ the named abcjs function.   2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — `/tmp/gp/abcjs` runs without a build,
     and for anything DOM-side render both engines in a real browser instead.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ A RECORDED CAUSE IS A HYPOTHESIS UNTIL SOMETHING MEASURES IT. Two of this repo's own
were overturned last session by one sweep each — `lineThickness`'s note assumed abcjs moved
the tuplet too (it does not move for ANY value), and the `wrap` row's line-count half turned
out to have a byte-identical DECISION, so `calcLineWraps` was never the defect. **Before
implementing what a note says, spend ten minutes proving the note.**

⭐⭐⭐ AND A CORRECT READING OF abcjs CAN STILL GIVE THE WRONG PORT. `printStem(x, linewidth
± t)` leaves `x` alone, so placing our stem at its base weight looks like the port and reads
**622 of 685**: ours is placed by its CENTRE, and a centre moves when the width grows. The
source told the truth about abcjs and lied about us. Check which MODEL each side uses.

⚠️ TRAPS:
  ⚠️ A TEST CAN MEASURE THE HALF THAT WAS ALREADY RIGHT — the first wrap test counted
     `tune.lineBreaks` (the decision, already correct) and passed with the defect restored.
     RESTORE THE DEFECT AND WATCH IT GO RED before believing a new test.
  ⚠️ A SHARED FIRST-THREE IS NOT A SHARED SET. Difference the full sets.
  ⚠️ A SAMPLE IS A LOWER BOUND FOR THE WITNESS AS WELL AS THE COUNT.
  ⚠️ A `getBBox` CANNOT SEE A GLYPH'S SCALE — it is CSS-scaled and its path untouched.
  ⚠️ AN ALGEBRAIC IDENTITY IS NOT A FLOATING-POINT ONE — `(x*s)/s`, `x*STEP/STEP`.
  ⚠️ `selectable="false"` IS A TRUTHY STRING. A floor rots. A repo test can assert the
     defect. A gate can normalise it away.
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT. A gate's report file outlives
     its run — check the timestamp on `/tmp/abcts-*.txt`.

WHAT TO DO NEXT — ask the owner which; these are NOT equal:
  1. **`wrap`'s remaining 59 — GEOMETRY, and the only undiagnosed row left.** ⭐ The line
     structure now matches everywhere and the residuals collapsed with it
     (`visual-layout-09-endings` was 389.24 against 235.58 and is 389.238913 against
     389.237975). Nobody has looked at what the 59 are, so the first hour is a diff, not a
     port. ⚠️ Two of them are abcjs CRASHING on `%%vskip` + `wrap`, not us.
  2. **`add_classes` — 16, and the next one is NAMED.** A `%%sep` SEPARATOR rule is
     `abcjs-defined-text abcjs-l2` in abcjs and `abcjs-defined-text` here, while the
     free-text row above it is `abcjs-l1` in BOTH — the counter is right and is not advanced
     for the separator's own line. `visual-mouse-click-01`, byte 2825.
  3. **`initialClef` — 42.** Page heights in BOTH directions. Hypothesis:
     `this.startlimitelem = clef` is inside `if (clef)`. ⚠️ The control for it is MUTE —
     read the gate comment before re-deriving.
  4. **`lineThickness` — 14. CAUSE MEASURED, FIX SCOPED, DO NOT DO IT PIECEMEAL.** Keep
     `LINE_WEIGHTS` pristine for LAYOUT and add the term only where a thickness is EMITTED.
     abcjs reads `lineThickness` in the DRAW functions alone.
  5. **`expandToWidest` — 14.** Needs abcjs's `i = -1` restart. ⚠️ Our system loop is one
     ~1700-line `spans.map` with outer accumulators; size the re-entrancy before starting.
  6. **`timeBasedLayout` — 669.** A second layout algorithm. Its own arc.
  7. **ANOTHER SURFACE.** Still unrendered by any gate: the SYNTH controller's DOM, `%%`
     file headers over a whole book, tablature options, `chordGrid`, `showDebug`.
  8. **PUBLISH.** Metadata is in, the npm name `abcts` is FREE, the CLI works. A decision,
     not a defect — including the 20.7 MB of sourcemaps in the tarball.
  9. **`npm run lint`** — 1,021 pre-existing errors, only as ITS OWN commit.

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

**The METHOD first**, because its two newest entries both cost a wrong turn last session and
both are cheap to avoid: a recorded cause is a hypothesis until something measures it, and a
correct reading of abcjs can still give the wrong port when the two models are anchored
differently.

**Then `wrap`'s 59**, because it is the only open row nobody has diagnosed — every other one
has had its residue named or its fix scoped. An hour of diffing may make it one cause, as it
did for the line-count half.

**Then the traps**, because the one that repeated is about a test rather than a gate: a new
test that measures the half which was already correct passes with the defect in place.
