# NEXT AGENT PROMPT — abcts, 2026-08-26b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-26b.md

Work in /Users/lrettberg/ICMLabs/Code/abcts.

⭐ THERE IS A MEASURED WORK LIST FOR THE FIRST TIME IN WEEKS: EIGHT NAMED ROWS, all in
`abcts-text-udef-parts-overlays.abc`, all cited, §8 of the checkpoint with both
engines' numbers.

⚠️ AND TWO OF THE THREE FAMILIES WERE IMPLEMENTED AND REVERTED, WITH THE REASON
WRITTEN AT THE SITE. READ THOSE BEFORE WRITING ANYTHING — the obvious fix for each is
MEASURED to make it worse:
  • An empty %%text draws nothing and moves twice the font size (8.23px, six tunes).
    Spending the 42 takes the page 42 SHORT: on a HEADINGLESS tune the block's rows
    never reach the page cursor at all, and what made our number nearly right was the
    text INK pushing the staff down. The row is the block-placement machinery.
  • A close decoration's drawn y is one ULP out. `PlacedGlyph.drawPitch` looks like
    the field for it and is NOT — it means an ABSOLUTE pitch with no staff origin,
    which the DYNAMIC survives only because its lane is shifted afterwards. Setting it
    put the sforzato 23px low.
  • The third is clean and untried: a %%vskip BEFORE a %%text is that block's FIRST
    row (`pushLine` stamps it onto whatever line comes next, text lines included).
    %%text then %%vskip is exact, which is what says the rule is the ORDER.

DO NOT START §9 — abcjs has NO INLINE `U:` and we support it. That is a MODE ruling,
the owner's, and it takes `[w:` and `[T:` with it. Nor §11's `abselem` decision.

EVERY OTHER GATE IS AT ZERO, including the warnings gate, which CLOSED yesterday at
0 of 746. The byte gate reads 8 of 622 ON PURPOSE: a row named in a fixture can report
its own closure, one left out of the corpus cannot. Suite 2,377, no reds.

⚠️ THE SWEEP'S YIELD IS FALLING AND THE FIXTURE'S IS NOT. One defect per four shapes
three sweeps ago; one per twelve, then one per thirty-six, then three per thirty-six
— and most of the recent ones came from FIXTURES and LADDERS, not from the sweep
itself. Nineteen of twenty-seven came that way. LADDER → FIX → FIXTURE → READ EVERY
OTHER GATE is the pattern still paying; §10.1 names untouched territory if you want a
fourth sweep.

THE SWEEP RUNNER IS A SCRIPT: `npx tsx scripts/zzsweep.ts <dir>`, from the repo root,
over any directory of `.abc` files. Two traps are still yours:
  ⚠️ printf '%b', NEVER '%s' — a sweep once reported 36 of 36 EXACT with every \n
     literal, and the runner cannot check that for you.
  ⚠️ Put a control that MUST differ in the same run — `C32|` is a ruled divergence and
     reads DIFFERS forever. Cheaper than the git-stash proof and it cannot go wrong:
     `git stash` on a CLEAN tree stashes nothing, so the pop after it pops somebody
     else's entry. That happened, into layout.ts, as a conflicted merge.

RULES THAT COST SOMETHING, newest first:
  ⚠️ A FIELD THAT LOOKS LIKE THE ONE YOU WANT MAY MEAN SOMETHING ELSE — `drawPitch`
     and `kind` both did, one commit apart.
  ⚠️ THE RULE IS OFTEN THE PAIR, NOT THE CHARACTER — a stray `-` warns only before a
     DIGIT; a note is voided only by a length THEN a space THEN a digit.
  ⚠️ A GATE'S RATCHET IS ONLY AS BROAD AS WHAT SOMEBODY ADDED TO IT — the warnings one
     held 14 rows while 39 agreed, and its own message had been saying so.
  ⚠️ A RULE RIGHT ON THE FIXTURE THAT NAMED IT CAN BE WRONG ON THE ONE BESIDE IT.
  ⚠️ A GUARD NOBODY PASSES LOOKS LIKE A RULE THAT DOES NOT APPLY (`=== undefined` on a
     field that is `null`).
  ⚠️ A SUM CANNOT SEE AN ORDER — ZZMOVEY beside ABCTS_Y prints both page walks term
     for term; that is the instrument for the whole ULP family.

Before any abcjs instrumentation, check /tmp/gp/abcjs still exists — it is cleaned
periodically, and it now carries ZZMOVEY on Renderer.prototype.moveY plus ZZNOTE and
ZZCORE in abc_parse_music.js.
⚠️ ABCJS_VERSION=6.7.0 IS NOT OPTIONAL — dump-svg.js defaults to 6.6.3.

Run npx tsc --noEmit before every commit, diff every regenerated golden against HEAD
asserting only new keys appeared, regenerate the extractMeasures AND warnings oracles
whenever a fixture grows, re-ratchet every gate's PASSING list in the same commit, and
commit and push after every landing. Never --force.
```

---

## Why this is the order

**The eight named rows first**, because they are measured, cited and gated — and because two
of the three families have a recorded WRONG answer beside them, which is worth more than the
row.

**Then the FIXTURE rather than the sweep.** Nineteen of twenty-seven defects came from
turning a closed row into a page or a ladder; the third sweep's 36 shapes bought two.

**And read every other gate after each landing.** `extractMeasures` and the warnings gate
each named defects the byte gate could not see, on fixtures written for the byte gate.

**The ledger after that.** 100 entries, and the ones that pay are the ones describing the
CODE where they should describe the OUTPUT.

**Neither the inline `U:` ruling nor `abselem` is the next agent's.**
