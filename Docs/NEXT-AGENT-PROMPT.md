# NEXT AGENT PROMPT — abcts, 2026-08-23b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-08-23b.md

Work in /Users/lrettberg/ICMLabs/Code/abcts. Read WHAT IS LEFT first — it is the
whole brief. Suite 2,118 passing, 4 EXPECTED-FAIL, no reds; every gate reads zero
except the byte table, which reads 1 of 383.

⚠️ THE FOUR EXPECTED-FAILS ARE DELIBERATE, not a regression.
tests/inline-voice-line.test.ts holds abcjs's numbers for a rule that is measured
and not built. They go red when it lands.

FIVE ROWS, and §3 is the one to read before touching anything:

  §1  abcts-directives-tune4, the %%stafftopmargin height — the deferred
      y-versus-pitch refactor from 2026-08-11, not a new defect.
  §2  the abselem decision — the OWNER's, not yours. Do not start it.
  §3  the inline [V: line rule. FOUR .fails carry abcjs's numbers.
      ⚠️ DO NOT REMOVE selectVoice's early return — it was tried, it takes all
      six shapes to abcjs's answer, and it takes two of abcjs's OWN test tunes
      from byte-exact to differing.
      ⚠️ AND setCurrentVoice's guard is NOT the mechanism: probed, abcjs takes the
      EARLY RETURN in the row that differs and the row that agrees ALIKE.
      The next move is named — instrument abc_parse_music.js's inline-field
      CALLER, because case "[V:"'s own startNewLine() is commented out.
  §4  what the AbcElement sweep left: a per-PITCH notehead style, and grace
      startBeam / startTie / endTie / style. THREE declared fields are DEAD in
      abcjs 6.7.0 and two bar fonts are unreachable — do not open those rows.
  §5  K:C clef=none's one stem. THREE failed attempts say the stem's expression
      is not the obstacle; the drift is upstream in the NOTE's x. Instrument
      layoutOneItem's er/extraWidth arm.

THE METHOD is unchanged and it is what paid five features today: enumerate the
REFERENCE's own list, not our notes; read the named abcjs function first, then
instrument to confirm it; check the bare CONTROL before reading a variable's
column — and make sure the control can actually MOVE.

⚠️ THAT LAST ONE COST BOTH OF TODAY'S REVERSALS. Five directives were swept on
2026-08-22 and recorded as moving nothing, on a control with none of the four
things they position; they move nine ways. And selectVoice's guard was "probed"
on a tune where it could never fire. A "SAME" is only as good as the shape that
asked, and a swept list can be swept again.

⚠️ AND A FIXTURE FINDS WHAT A LADDER CANNOT. Ten rungs of the voice-scale ladder
went byte-identical and the fixture still opened a row, because tune 6 carried a
beamed AND an unbeamed grace at once.

Before any abcjs instrumentation, check /tmp/gp/abcjs still exists — it is cleaned
periodically. THE HARNESS has the table of probes and where they go; ZZMOVE first
for anything vertical.

Run npx tsc --noEmit before every commit, diff every regenerated golden against
HEAD asserting only new keys appeared (+N / -0 / ~0), re-ratchet all five PASSING
lists per fixture, and commit and push after every landing.
```

---

## Why this is the order

**§3 first** not because it is the biggest but because it is the one with a trap already
sprung: the obvious fix is wrong, it is wrong in a way that passes six controls, and the
probe disproving it is already recorded. An agent who starts there loses nothing; one who
finds it later loses an afternoon.

**§4 second** — the sweep's residue is small, named, and has a producer for each row.

**§1 and §5 are the long poles** and both are deferred refactors with recorded failed
attempts. Neither is a good opening move.

**§2 is not yours.**
