# NEXT AGENT PROMPT — abcts, 2026-08-26b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-26b.md

Work in /Users/lrettberg/ICMLabs/Code/abcts.

EVERY GATE IN THIS REPO READS ZERO. SVG bytes 0 of 635 in-repo (one ruled divergence)
and 0 of 356 sibling; warnings 0 of 759; extractMeasures 0 of 270 files and 3,199 of
3,199 rows; the harvested corpus 0 of 226 on all four axes; and the dozen others
beside them. Suite 2,398, no reds, no expected-fails.

⚠️ THAT IS THE NORMAL CONDITION HERE, NOT A FINISH LINE. No gate can name the next
defect and none has been able to for weeks. There is no measured work list waiting for
you — the eight rows the last handoff named are all closed (§8), and so is the owner's
inline-`U:` ruling (§9).

TWO RULES PRODUCED MOST OF THE LAST THIRTY-SIX DEFECTS. Use them in this order:

  ⭐ WRITE A FIXTURE, NOT JUST A LADDER. A ladder renders one shape; a fixture renders
    a whole PAGE and joins every other gate. Nineteen of the first twenty-seven came
    that way. Close a row, turn it into a fixture tune the same hour, re-harvest the
    goldens AND the extractMeasures AND the warnings oracles, and re-ratchet.

  ⭐ THEN READ THE GATE THE CHANGE WAS NOT AIMED AT. `extractMeasures` is
    all-or-nothing and named two defects in OPPOSITE directions on a fixture written
    for the byte gate; the warnings gate named four more the same way. Run the whole
    suite after every landing and read the ranked tables.

  ⚠️ AND A ROW NAMED IN A FIXTURE CAN REPORT ITS OWN CLOSURE; ONE LEFT OUT OF THE
    CORPUS CANNOT. The byte gate sat at 8 of 622 on purpose for half a session and
    every one of those rows closed. Never drop a shape from a fixture to make a number
    look better — name it in the test'"'"'s note instead.

THE SWEEP RUNNER IS A SCRIPT: `npx tsx scripts/zzsweep.ts <dir>`, from the repo root,
over any directory of `.abc` files. Its yield is falling (one defect per four shapes,
then twelve, then thirty-six) but its territory is not exhausted — §1 of WHAT IS LEFT
names what three sweeps have not touched. Two traps are still yours:
  ⚠️ printf '"'"'%b'"'"', NEVER '"'"'%s'"'"' — a sweep once reported 36 of 36 EXACT with every \n
     literal, and the runner cannot check that for you.
  ⚠️ Put a control that MUST differ in the same run — `C32|` is a ruled divergence and
     reads DIFFERS forever. Cheaper than the git-stash proof and it cannot go wrong:
     `git stash` on a CLEAN tree stashes nothing, so the pop after it pops somebody
     else'"'"'s entry. That happened, into layout.ts, as a conflicted merge.

RULES THAT COST SOMETHING, newest first:
  ⚠️ A PROBE THAT DISAGREES WITH A GATE IS THE PROBE'"'"'S PROBLEM until proven otherwise.
     Mine reported a mode split not working; I had invented the mode strings
     (`abcjsStrict` for `abcjs-strict`), so `isStrict` was false everywhere.
  ⚠️ A NUMBER THAT IS EXACTLY ONE CONSTANT IS A UNIT ERROR, NOT A REBUTTAL. 23.25 is
     `PITCH_ORIGIN * spacePerStep`; I had let it stand in a NOTE as proof that
     `drawPitch` was the wrong field. It was the right field with a step in it.
  ⚠️ A ONE-LINE FIX THAT MAKES THINGS WORSE IS OFTEN TWO CHANGES. The empty `%%text`
     row needed the block to REACH the page as well; the guard for that, keyed on
     `block.height`, was then too broad and moved six baselines.
  ⚠️ A SUM CANNOT SEE AN ORDER — seventh time. Whenever a page TOTAL is right to the
     digit and something inside it sits at the wrong y, look for rows being summed
     where `nonMusic` spends them one at a time.
  ⚠️ THE RULE IS OFTEN THE PAIR, NOT THE CHARACTER — a stray `-` warns only before a
     DIGIT; a note is voided only by a length THEN a space THEN a digit.
  ⚠️ A GATE'"'"'S RATCHET IS ONLY AS BROAD AS WHAT SOMEBODY ADDED TO IT — the warnings one
     held 14 rows while 39 agreed, and its own message had been saying so.
  ⚠️ A SUITE'"'"'S EXIT CODE CANNOT BE READ THROUGH `tail`. A red run committed and pushed
     that way. `npx vitest run > /tmp/suite.txt 2>&1; echo $?`.

Before any abcjs instrumentation, check /tmp/gp/abcjs still exists — it is cleaned
periodically, and it carries ZZMOVEY on Renderer.prototype.moveY plus ZZNOTE and
ZZCORE in abc_parse_music.js. ZZMOVEY beside ABCTS_Y prints both page walks term for
term and is the instrument for the whole ULP family.
⚠️ ABCJS_VERSION=6.7.0 IS NOT OPTIONAL — dump-svg.js defaults to 6.6.3.

Run npx tsc --noEmit before every commit, diff every regenerated golden against HEAD
asserting only new keys appeared, regenerate the extractMeasures AND warnings oracles
whenever a fixture grows, re-ratchet every gate'"'"'s PASSING list in the same commit, and
commit and push after every landing. Never --force.
```

---

## Why this is the order

**The FIXTURE first, then the gate you were not aiming at, then the sweep.** That is the
measured yield order of thirty-six defects, and the sweep — which was the whole method two
sessions ago — is now the least productive of the three.

**The ledger after that.** 100 entries, and the ones that pay are the ones describing the
CODE where they should describe the OUTPUT.

**`abselem` is still not the next agent's** — §11. It means retaining the `Layout` that
measurably killed this suite's workers once, and it is the owner's call.
