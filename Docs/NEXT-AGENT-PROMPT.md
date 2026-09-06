# NEXT AGENT PROMPT — abcts, 2026-09-06

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-06.md — its METHOD section first, then THE PATTERN
section, then THE THREE "DO NOT RE-OPEN" ROWS THAT ALL FELL.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

EVERY GATE IN THIS REPO IS AT ZERO, and `Docs/PARITY-STATUS.md` is the dated, plain-language
version of that — read it second. The MIDI-file arc went 24 open to 0 of 691 in one session
and `ABCJS-DEBT.md` has no measured-not-landed entry left.

    zzlive      0 of 685  WebKit AND Chrome — both re-run against a fresh build
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    midi-bytes  0 of 691 — 672 byte-exact and NAMED, 19 ruled divergent, OPEN_CEILING 0
    warnings    0 of 815 tunes
    suite       79 files, 2,470 tests, no reds. Keep them all that way.

    npx vitest run tests/midi-bytes.test.ts && cat /tmp/abcts-midi-bytes.txt

⭐ SO NO GATE CAN NAME THE NEXT DEFECT, and that is the normal condition here rather than a
milestone — it has happened eleven times and the answer was always the same: BUILD THE
SURFACE that expresses an axis none of the others can, or render a CONTROL abcjs's own suite
does not contain. **ASK THE OWNER WHICH AXIS IS WORTH THE MOST** before spending a session
on one; the last four surfaces were each a day and each found defects nothing else could
state.

⭐⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT FOUR TIMES: REFERENCE THE ACTUAL abcjs.
Sixteen landings last session and every one was a read of a named function or a probe of its
real output — not one came from a diff.

  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — and its `src/` RUNS WITHOUT A BUILD:
       cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/. /tmp/gp/abcjs/
       node -e "const A=require('/tmp/gp/abcjs/index.js'); …"
     NEVER ../abcMusicKit itself, probes gated on an env var, and BRACE every `if`.
     Three `console.error`s in `synth/repeats.js` settled in one run what two readings of
     that algorithm had not.
  5. Only then write code, and let the gate arbitrate.

⭐⭐⭐ AND STEP 2 IS NOT OPTIONAL. SIX of last session's sixteen were rules already
implemented, with their citations, elsewhere in this repo — five in `compat/sequence.ts` or
`layout.ts`, and ONE in `flatten.ts` THREE LINES ABOVE the site that needed it, under a
comment block explaining that very rule. A RULE PORTED AT THE SITE THAT NAMED IT IS NOT A
RULE PORTED.

⚠️ AND THE SHARPEST LESSON OF THE SESSION: A "MEASURED, NOT LANDED" NOTE IS A CLAIM ABOUT
SIZE AS WELL AS CAUSE, AND THE SIZE IS THE PART THAT ROTS. All three of this repo's standing
ones — two with ports written and reverted — were closed in about an hour each, and every
one had the cause right and the size wrong. A wrong cause gets tested and falls over; a
wrong size stops the work being attempted at all. The MEASUREMENTS in such a note are gold;
the estimate beside them is not.

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
  ⚠️ THE BROWSER HARNESS NEEDS A MATCHING playwright-core. `~/Library/Caches/ms-playwright`
     holds `webkit-2311`, which is playwright-core 1.61.0; a mismatch fails with
     "Executable doesn't exist" and tells you to run `npx playwright install`, which is the
     wrong fix. `/tmp` is cleaned periodically and leaves EMPTY directories behind — both
     `/tmp/gp/pw` and `/tmp/gp/abcjs` — which reads as a corrupt install, not a missing one.
  ⚠️ A GATE'S REPORT FILE OUTLIVES ITS RUN. `/tmp/abcts-*.txt` has twice been read as a
     result when it was yesterday's. Check the timestamp.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD before the state**, as before and for a sharper reason: the state is four
numbers and all four are zero, so nothing in it tells you what to do.

**Then the ported-once pattern**, because it produced six of sixteen and is invisible unless
you grep for it. Its worst instance was inside the file being edited, three lines from the
defect, under a comment stating the rule in full.

**Then the three that fell**, because they are the argument for re-deriving the SIZE of
anything this repo has written off. Two of them had ports written and reverted and were
still an hour's work once the right model was in hand.
