# NEXT AGENT PROMPT — abcts, 2026-09-05

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-05.md — its METHOD section first, then THE PATTERN
section, then the open arc.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

EVERY SVG GATE IS AT ZERO, IN BOTH BROWSERS. The open arc is the MIDI FILE, byte for byte.

    zzlive      0 of 685  WebKit AND Chrome
    svg-bytes   0 of 685 in-repo, 0 of 356 sibling
    midi-bytes  24 of 691 open, 648 byte-exact and NAMED, 19 ruled divergent  ← THE ARC
    suite       2,470, no reds. Keep them all that way.

    npx vitest run tests/midi-bytes.test.ts && cat /tmp/abcts-midi-bytes.txt

⭐ THE STANDING ORDER, AND THE OWNER HAS NOW SAID IT THREE TIMES: REFERENCE THE ACTUAL
abcjs. Do not intuit, do not trial-and-error. Last session a percussion fix was written by
adjusting until the bytes moved — it landed half-right, was committed with the wrong
explanation ("a model limit"), and had to be superseded. Reading the named function gave
the real rule in one pass, and `grep clef src/synth/abc_midi_flattener.js` returning NOTHING
said outright that the layer being patched never sees a clef.

  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — scratchpad copy at /tmp/gp/abcjs,
     NEVER ../abcMusicKit, probes gated on an env var, and BRACE every `if` you write under.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ AND STEP 2 IS NOT OPTIONAL. Nine of last session's fixes were rules ALREADY understood,
cited and implemented somewhere in this repo and simply not carried to the site being fixed
— the meter walk was in `chord-grid.ts`, `millisecondsPerMeasureOf` was exported from
`timing.ts`, the track-name join and the mid-tune `clef=perc` rule were both spelled out in
`compat/lines.ts`, `%%staffnonote` was in `layout.ts`, and once the rule was in the comment
AT THE SITE with only half of it in the code below. A RULE PORTED AT THE SITE THAT NAMED IT
IS NOT A RULE PORTED.

⛔ TWO THINGS ARE MEASURED, INSTRUMENTED AND DELIBERATELY NOT LANDED. Read `ABCJS-DEBT.md`
§3b.5 and the tuplet note in `flatten.ts` before touching either; both carry BOTH engines'
numbers, and one of them already had two ports written and reverted:

    the sequencer resets currentVolume per LINE-VOICE   ledger-gaps-4#1
    `(p:q:r` with r = 1 never clears the multiplier     ledger-gaps#1

⚠️ TRAPS:
  ⚠️ A CONTROL MUST BE SHOWN TO SEE ITS DEFECT — a dynamics ladder written with `!f!`
     reported nothing, because `f`'s table IS the default. Only a marking that differs from
     the default can express a lost dynamic.
  ⚠️ THE COUNT IS THE WRONG DIAL while a row differs LATER rather than not at all. Four
     fixes moved a row's first differing byte deep — 70 → 1787 on one — without closing it.
  ⚠️ `getMidiFile` has TWO entry points: a STRING yields the FIRST tune only, a TUNE OBJECT
     yields that tune. The gate uses the object form.
  ⚠️ A `*/` inside a block comment closes it — abcjs's own "x/8 meter" wording did.
  ⚠️ `npx tsc --noEmit && echo OK` BEFORE the test; `--testTimeout=180000` under load.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD before the state**, which reverses the usual shape on purpose. The state is
four numbers and they are all zero except one; the method is what the last session got
wrong and then right within an hour, and it is the owner's standing order restated for the
third time.

**Then the ported-once pattern**, because it is where nine of thirteen fixes came from and
it is invisible unless you grep for it — every one of those rules was already written down,
correctly, somewhere else in the repo.

**Then the do-not-re-open pair.** Both look like obvious work from the source. One of them
has already had two ports written and reverted, in opposite directions.
