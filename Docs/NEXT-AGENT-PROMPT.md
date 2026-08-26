# NEXT AGENT PROMPT — abcts, 2026-08-26b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-26b.md

Work in /Users/lrettberg/ICMLabs/Code/abcts.

⚠️ THERE IS NO WORK LIST WAITING. §1 of the previous handoff — seven measured rows —
is SPENT, closed in six commits, and every gate in this repo reads zero: the SVG byte
gate 0 of 473 with one ruled divergence, the harvested corpus 0 of 222, extractMeasures
0 of 268 files, and the other dozen at zero beside them. Suite 2,232 passing, NO reds
and NO expected-fails. THAT IS THE NORMAL CONDITION HERE. No gate can name the next
defect and none has for weeks.

SO WRITE A SHAPE NEITHER CORPUS CONTAINS. §1 of WHAT IS LEFT names the untouched
territory: %%MIDI and audio-facing directives against the DRAWING, V: modifiers beyond
style=, %%repeat, staff-line counts, %%map/%%percmap, microtones past the quarter-tone
pair, and anything at the boundary between two features. 36 shapes is an hour and the
last two sessions ran at roughly one defect per five.

THE THING THAT PAID MOST YESTERDAY WAS NOT THE LADDER. Ten control shapes closed six
rows; the FIXTURE built to gate them opened TWO MORE the moment they were a page,
because every ladder shape was one bar and one voice. And a second sweep over the same
territory found a defect the first could not have seen, because it was masked by the
one the first closed. LADDER → FIX → FIXTURE → SWEEP AGAIN.

WRITE THE SWEEP RUNNER FIRST — twenty lines, both engines over a numbered directory,
exact/DIFFERS per row. Build it around three traps that have each bitten:
  ⚠️ printf '%b', NEVER '%s' — a sweep reported 36 of 36 EXACT with every \n literal.
  ⚠️ EXIT if any abcjs SVG is empty — a missing reference reads as a clean column.
  ⚠️ Run everything from the repo root. `cd` into /tmp broke `npx tsx scripts/…` again.
AND `git stash` IS THE PROOF IT RAN: stash the fix, re-run, and confirm the rows you
just closed turn DIFFERS. Nothing else separates a real fix from a harness that idled.

FOUR RULES FROM YESTERDAY, each of which cost something:
  ⚠️ A GUARD NOBODY PASSES LOOKS LIKE A RULE THAT DOES NOT APPLY — a correct fix moved
     NOTHING because it tested `=== undefined` on a field that is `null`.
  ⚠️ A PROBE THAT NAMES THE SYMPTOM HAS NOT NAMED THE CAUSE — the ZZCLEF probe was
     right about what it printed and sent the search one step past the defect.
  ⚠️ PUT A NEW WRITE WHERE THE THING ENDS, NOT WHERE IT LOOKS LIKE IT ENDS —
     closeUnterminatedMeasure reads like end-of-voice and is every LINE's flush.
  ⚠️ A SUM CANNOT SEE AN ORDER — fifth time. ZZMOVEY beside ABCTS_Y prints both page
     walks term for term; that is the instrument for the whole ULP family.

DO NOT START the `abselem` decision (§4 of WHAT IS LEFT) — it is the OWNER's, and it
means retaining the `Layout` that killed this suite's workers once.

Before any abcjs instrumentation, check /tmp/gp/abcjs still exists — it is cleaned
periodically, and it now carries ZZMOVEY on Renderer.prototype.moveY.
⚠️ ABCJS_VERSION=6.7.0 IS NOT OPTIONAL — dump-svg.js defaults to 6.6.3.

Run npx tsc --noEmit before every commit, diff every regenerated golden against HEAD
asserting only new keys appeared, regenerate the extractMeasures oracle whenever a
fixture grows, re-ratchet every gate's PASSING list in the same commit, and commit and
push after every landing. Never --force.
```

---

## Why this is the order

**The sweep, because nothing else can speak.** Every gate is at zero and every defect for
weeks has come from writing a shape neither corpus contains.

**The fixture, because it is where the yield is.** Five of yesterday's eight defects were
found by fixtures written to gate the other three.

**The ledger after that.** 100 entries, and the ones that pay are the ones describing the
CODE where they should describe the OUTPUT.

**`abselem` is not the next agent's.**
