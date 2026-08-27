# NEXT AGENT PROMPT — abcts, 2026-08-26b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-26b.md

Work in /Users/lrettberg/ICMLabs/Code/abcts.

⚠️ THERE IS NO WORK LIST WAITING. §1 of the previous handoff — seven measured rows —
is SPENT, and two sweeps of new territory went with it: SEVENTEEN defects, ten commits,
six new fixtures. Every gate but one reads zero: the SVG byte gate 0 of 564 with one
ruled divergence, the harvested corpus 0 of 224, extractMeasures 0 of 270 files, and
the other dozen at zero beside them. Suite 2,325 passing, NO reds and NO
expected-fails. THAT IS THE NORMAL CONDITION HERE.

THE ONE OPEN ROW IS THE WARNINGS GATE, 1 of 688, and it is written up in the test
itself: `C2|[-1 D2|]` wants two more "Unknown character ignored" after the chord
fails, where our tie and digit arms consume them silently. Its geometry has been
byte-exact throughout. Making either arm warn unconditionally is a change with reach,
so it wants a ladder of its own rather than a guess.

⚠️ AND THE SWEEP'S YIELD IS FALLING WHILE THE FIXTURE'S IS NOT. Three sweeps ago it
was one defect per four shapes; yesterday's first sweep was one per twelve and the
second one per thirty-six — and that one find was a barline SPELLING, not a feature.
NINE OF THE SEVENTEEN CAME FROM TURNING A CLOSED ROW INTO A FIXTURE, and the last five
came from a gate the sweeps were not aimed at: two byte-exact sweep fixtures moved
`tests/warnings.test.ts` the moment they were pages.

SO DO NOT JUST WRITE 36 MORE SHAPES OF THE SAME KIND. The pattern still paying is
LADDER → FIX → FIXTURE → READ EVERY OTHER GATE. §7.1 of the checkpoint names what is
untouched: %%text/%%center variants, %%staffsep/%%sysstaffsep/%%vskip combinations,
multi-voice lyric alignment, U: redefinitions, P: part sequencing, and the boundary
between an `&` overlay and everything else.

THE SWEEP RUNNER IS A SCRIPT NOW: `npx tsx scripts/zzsweep.ts <dir>`, from the repo
root, over any directory of `.abc` files. It carries the traps that used to be prose.
Two are still yours:
  ⚠️ printf '%b', NEVER '%s' — a sweep reported 36 of 36 EXACT with every \n literal,
     and the runner cannot check that for you.
  ⚠️ Put a control that MUST differ in the same run — `C32|` is a ruled divergence and
     reads DIFFERS forever. Cheaper than the git-stash proof, and it cannot go wrong:
     `git stash` on a CLEAN tree stashes nothing, so the pop after it pops somebody
     else's entry. That happened, into layout.ts, as a conflicted merge.

SIX RULES FROM YESTERDAY, each of which cost something:
  ⚠️ A GUARD NOBODY PASSES LOOKS LIKE A RULE THAT DOES NOT APPLY — a correct fix moved
     NOTHING because it tested `=== undefined` on a field that is `null`.
  ⚠️ A PROBE THAT NAMES THE SYMPTOM HAS NOT NAMED THE CAUSE — the ZZCLEF probe was
     right about what it printed and sent the search one step past the defect.
  ⚠️ PUT A NEW WRITE WHERE THE THING ENDS, NOT WHERE IT LOOKS LIKE IT ENDS —
     closeUnterminatedMeasure reads like end-of-voice and is every LINE's flush.
  ⚠️ A SUM CANNOT SEE AN ORDER — fifth time. ZZMOVEY beside ABCTS_Y prints both page
     walks term for term; that is the instrument for the whole ULP family.
  ⚠️ A GATE'S RATCHET IS ONLY AS BROAD AS WHAT SOMEBODY ADDED TO IT — the warnings one
     held 14 rows while 39 agreed, and its own failure message had been saying so.
  ⚠️ A RULE RIGHT ON THE FIXTURE THAT NAMED IT CAN BE WRONG ON THE ONE BESIDE IT —
     a line-numbering rule derived from two fixtures took that gate from 2 to 9.

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

**The one open row first**, because it is measured and it is the only thing any gate can
name.

**Then the FIXTURE rather than the sweep.** Nine of seventeen defects came from turning a
closed row into a page; the second sweep's 36 shapes bought one, and it was a spelling.

**And read every other gate after each landing.** The last five defects came from the
warnings gate, which neither sweep was aimed at and which both sweep fixtures moved.

**The ledger after that.** 100 entries, and the ones that pay are the ones describing the
CODE where they should describe the OUTPUT.

**`abselem` is not the next agent's.**
