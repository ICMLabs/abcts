# NEXT AGENT PROMPT — abcts, 2026-09-06

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-06.md — its METHOD section first, then THE PATTERN
section, then WHAT LANDED.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

EVERY GATE IS AT ZERO OR EFFECTIVELY SO. The MIDI-file arc went 24 open to 3 in one
session and NONE OF THE THREE IS ORDINARY WORK.

    zzlive      0 of 685  WebKit AND Chrome
    svg-bytes   0 of 685 in-repo, 0 of 356 sibling
    midi-bytes  3 of 691 open, 669 byte-exact and NAMED, 19 ruled divergent
    suite       2,470, no reds. Keep them all that way.

    npx vitest run tests/midi-bytes.test.ts && cat /tmp/abcts-midi-bytes.txt

⛔ THE THREE ARE ALL MEASURED AND DELIBERATELY NOT LANDED. Read them before touching one;
two have had ports written and reverted, and the third is a granularity limit, not a bug:

    the sequencer resets currentVolume per LINE-VOICE   ledger-gaps-4#1   ABCJS-DEBT §3b.5
    `(p:q:r` with r = 1 never clears the multiplier     ledger-gaps#1     ABCJS-DEBT
    ONE velocity byte, our unrolling is per MEASURE     endings#2         at the site in flatten.ts

⭐ SO THE NEXT ARC IS NOT THIS GATE. No table can name the next defect, which is the normal
condition here rather than a milestone — it has happened eleven times and the answer was
always the same: BUILD THE SURFACE that expresses an axis none of the others can, or render
a CONTROL abcjs's own suite does not contain. Ask the owner which axis is worth the most
before spending a session on one.

⭐⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT FOUR TIMES: REFERENCE THE ACTUAL abcjs.
Thirteen landings last session and every one was a read of a named function or a probe of
its real output — not one came from a diff.

  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — and its `src/` RUNS WITHOUT A BUILD:
       cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/. /tmp/gp/abcjs/
       node -e "const A=require('/tmp/gp/abcjs/index.js'); …"
     NEVER ../abcMusicKit itself, probes gated on an env var, and BRACE every `if`.
  5. Only then write code, and let the gate arbitrate.

⭐⭐⭐ AND STEP 2 IS NOT OPTIONAL. SIX of last session's thirteen were rules already
implemented, with their citations, elsewhere in this repo — five in `compat/sequence.ts` or
`layout.ts`, and ONE in `flatten.ts` THREE LINES ABOVE the site that needed it, under a
comment block explaining the very rule. A RULE PORTED AT THE SITE THAT NAMED IT IS NOT A
RULE PORTED.

⚠️ TRAPS:
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT — one run reported `3 failed`
     with a worker-start error at 592s; the same tree re-ran green at 2,470 in 35s.
     RE-RUN BEFORE BELIEVING A RED.
  ⚠️ A FIXTURE'S FIRST DIFFERING BYTE IS A SYMPTOM, NOT THE DEFECT. One row's byte was a
     VELOCITY and the defect was a duration a millionth out, which moved the note onto a
     downbeat.
  ⚠️ `cd /tmp/gp/abcjs` RESETS THE SHELL'S CWD for the next call. Re-`cd` into the repo.
  ⚠️ `getMidiFile` has TWO entry points: a STRING yields the FIRST tune only, a TUNE OBJECT
     yields that tune. The gate uses the object form.
  ⚠️ A `*/` inside a block comment closes it.
  ⚠️ `npx tsc --noEmit && echo OK` BEFORE the test; `--testTimeout=180000` under load.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD before the state**, as last time and for the same reason: the state is four
numbers and three of them are zero.

**Then the ported-once pattern**, because it produced six of thirteen and it is invisible
unless you grep for it. Its worst instance last session was inside the file being edited,
three lines from the defect, under a comment that stated the rule in full.

**Then the do-not-re-open THREE**, which is what the whole remaining table is. Two have had
ports written and reverted; the third is a limit of the measure-granular model and its
alternatives are both written down at the site.
