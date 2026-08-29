# NEXT AGENT PROMPT — abcts, 2026-08-29

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-29.md

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does
not persist between tool calls and the workspace ROOT collects every sibling repo's
tests.

TWO ROWS ARE OPEN AND BOTH ARE NAMED, in `abcts-grace-order-and-lanes.abc`:

  (a) TUNE 2 — a STACKED ORNAMENT is one ULP out (`22.535000000000007` for abcjs's
      `22.535`). ⚠️ `drawPitch` looks EXACTLY like the answer — it is the field that
      fixed the CLOSE decoration's identical-looking `getYCorr` case — and adding it
      here takes FOUR byte-exact fixtures RED: ragtime-nightingale in all three
      flavours and abcjs-visual-decorations-01-score-s-a-b. The corpus is the evidence
      against the obvious reading. READ THE NOTE AT THE PUSH BEFORE TRYING IT.

  (b) TUNE 26 — a DYNAMIC and a CURVE are ordered differently on a note carrying
      everything at once. Ours emits `data-name="dynamics"` where abcjs emits the curve.

EVERY OTHER GATE READS ZERO: SVG bytes 2 of 691 (those two, 6 ruled divergent) and
0 of 356 sibling; `tune.lines` 607,177 of 607,177 characters; extractMeasures 0 of 274
files and 3,366 of 3,366 rows; warnings 1 of 815 (a ruled divergence's shadow); the
harvested corpus 0 of 230 within 1px. Suite 2,451, no reds.

⚠️ THAT IS THE NORMAL CONDITION HERE, NOT A FINISH LINE.

⚠️ AND READ THIS BEFORE YOU READ ANY OTHER NOTE. THREE OF THIS SESSION'S SIX DEFECTS
HAD A NOTE OF OURS STANDING BETWEEN THE ROW AND ITS ANSWER, AND ALL THREE SAID THE SAME
KIND OF THING — THAT SOME CASE WAS SPECIAL:

  • "the moved rest changes the staff's extent"  — reasoned from which object abcjs
    ASSIGNS to, never from what READS it.
  • "`drawPitch` looks like the field for it and is NOT" — written after a 23.25px
    miss, and 23.25 is `PITCH_ORIGIN * spacePerStep` EXACTLY. A unit error that stood
    as a rebuttal for a day.
  • "a `(3` is the exception and is not this rule at all" — it is precisely that rule.

  A NUMBER THAT IS EXACTLY ONE CONSTANT IS A UNIT ERROR, NOT A REBUTTAL.
  A NOTE THAT SAYS "THIS CASE IS SPECIAL" IS THE FIRST THING TO RE-MEASURE.
  The gates were right throughout; the prose was the blocker.

THE METHOD, IN THE ORDER THAT PAID:

  ⭐ FIXTURE FIRST. A ladder renders one shape; a fixture renders a whole PAGE and joins
     every other gate. Close a row, make it a fixture tune the same hour, re-harvest the
     goldens AND the warnings AND the extractMeasures oracles, and re-ratchet.
  ⭐ THEN READ THE GATE YOU WERE NOT AIMING AT. `extractMeasures` and the warnings gate
     each named defects the byte gate structurally cannot see — on fixtures written FOR
     the byte gate. Run the WHOLE suite after every landing and read the ranked tables.
  ⭐ THEN THE SWEEP. `npx tsx scripts/zzsweep.ts <dir>` over a directory of `.abc`.
     Its territory is not exhausted — §2 of WHAT IS LEFT names what is untouched — but
     the lane sweep hit 3 of 24 and every hit was a GRACE, so aim at feature PAIRS.

  ⚠️ AND ENUMERATE THE REFERENCE, NOT YOUR NOTES. abcjs's own directive switch named 18
     directives this parser never mentions; SEVENTEEN were already byte-exact and five
     of those seventeen were still warning defects. "Never mentioned here" is not "not
     implemented there".

RULES THAT COST SOMETHING:
  ⚠️ A ROW NAMED IN A FIXTURE CAN REPORT ITS OWN CLOSURE; ONE LEFT OUT CANNOT. The byte
     gate sits off zero on purpose when a row is measured and open. Never drop a shape
     to make a number look better.
  ⚠️ A GATE'S EXCLUSION LIST MEANS WHAT IT SAYS. `DIVERGENT` is "abcjs does something we
     decline to reproduce, written up in Docs/ABCJS-DIFFERENCES.md"; `STALE` is "the
     golden was not regenerated". Using the second for the first hides a regression.
  ⚠️ A SUITE'S EXIT CODE CANNOT BE READ THROUGH `tail` — a red run committed that way.
     `npx vitest run > /tmp/suite.txt 2>&1; echo $?`.
  ⚠️ `git stash` ON A CLEAN TREE STASHES NOTHING, so the pop after it takes somebody
     else's entry. Put a control that MUST differ in the sweep instead: `C32|` is a
     ruled divergence and reads DIFFERS forever.
  ⚠️ printf '%b', NEVER '%s' — a sweep once reported 36 of 36 EXACT with every \n
     literal, and the runner cannot check that for you.

Before any abcjs instrumentation, check /tmp/gp/abcjs still exists — it is cleaned
periodically, and it carries ZZAE/ZZCH/ZZMOVEY/ZZCB/ZZNOTE/ZZCORE, each on its own env
var. ZZAE prints a per-element box, ZZCH a staff's extent, ZZMOVEY the page walk.
⚠️ ABCJS_VERSION=6.7.0 IS NOT OPTIONAL — dump-svg.js defaults to 6.6.3.

Run npx tsc --noEmit before every commit, diff every regenerated golden against HEAD
asserting only new keys appeared, re-ratchet every gate's PASSING list in the same
commit, and commit and push after every landing. Never --force.

DO NOT START the `abselem` decision — it is the OWNER's, and it means retaining the
`Layout` that measurably killed this suite's workers once.
```

---

## Why this is the order

**The two named rows first**, because they are measured, cited and gated — and because (a)
has a recorded WRONG answer beside it, which is worth more than the row.

**Then the notes, before the code.** Three of six defects this session were unblocked by
re-measuring a claim someone had written down, not by finding new code. That is now the
first thing the prompt says.

**Then a fixture, then the gate you were not aiming at, then the sweep.** Measured yield
order, unchanged from the last handoff and confirmed again.

**`abselem` is still not the next agent's.**
