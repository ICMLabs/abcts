# NEXT AGENT PROMPT — abcts, 2026-09-13

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-13.md — §THE FLOOR first (the wrap row CANNOT reach
0), then §THE EIGHT NAMED ITEMS, which are already in the order to take them. Then
HANDOFF-2026-09-12.md for the eleven rules that got the row from 59 to 23 and for A FLAG
DOING TWO JOBS, and -09-08.md for THE QUADRATICS and the measured-and-declined list.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (it is CommonJS, no build needed, and it EARNED ITS KEEP):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       90 files, 2,604 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count:
                timeBasedLayout 669 · initialClef 42 · wrap+staffwidth 23 · add_classes 16 ·
                lineThickness 14 · expandToWidest 14 ·
                print 5 · print+responsive 5 · minPadding 5 · scale 2 / 1 / 1
    warnings    0 of 815 · test:dist 0 of 685 ESM and CJS
    lint        1,023 errors — PRE-EXISTING, not a gate, do not "fix" under other work

🛑 THE WRAP ROW'S FLOOR IS 19, NOT 0. Two of the 23 are abcjs's FOURTH DEBUG MARKER, which
the owner DECLINED on 2026-09-12 (this engine already declines three such strings as one
rule), and two are abcjs CRASHING in its own `wrapLines`. Do not chase 0.

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT SIX TIMES: REFERENCE THE ACTUAL abcjs.
  1. READ the named abcjs function.   2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — `/tmp/gp/abcjs`, and for anything
     DOM-side render both engines in a real browser instead.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ WRITE THE DELIBERATE BREAK FIRST, NOT LAST. Four controls were written for `ponytail:`
markers last session and THREE WERE MUTE — they agreed with abcjs while a deliberate break
changed nothing. Two would have been recorded as "measured and correct" without it.

⭐⭐⭐ A RULE DERIVED UNDER `{wrap}` MUST BE SHOWN NOT TO FIRE WITHOUT IT. The voice-name
grace shipped ungated and regressed the UNWRAPPED path, and NEITHER GATE COULD SEE IT:
`svg-bytes` has no fixture of that shape and `zzopts` only renders `{wrap}`.

⭐⭐⭐⭐ A RECORDED CAUSE IS A HYPOTHESIS — INCLUDING ONE YOU WROTE AN HOUR AGO. Three fell
last session, two of them written by that session. Items 1, 2 and 3 of the eight each carry
a DISPROVED fix: read those before porting anything, they are the expensive part.

🔬 TWO INSTRUMENTS, AND THEY SEE DIFFERENT THINGS. Element-KIND counts find a MISSING
element; an x/y POSITION diff finds ORDER and PLACEMENT where the counts are equal. 19 of
the 23 now draw the same elements at the same page height, so the kind sweep is nearly
exhausted and the position diff is the working instrument.

WHAT TO DO NEXT — the eight are ORDERED in the handoff; take them in that order:
  1. `%%keywarn` under wrap (3 fixtures) — the sharpest diagnosis on the board; the carried
     head key is "the last key ALLOWED INTO THE STREAM", not the key in force.
  2. The wrapped head CLEF (1 fixture, 1 of 59 elements) — cause measured; the obvious port
     breaks FOUR ratcheted cases.
  3. The ending-room pair (2) — 18.5px, exactly the `|1` label's `textWidth + 10`; the
     shortfall reading reddens SIX suites.
  4. The ULP tail (3) — 0 elements moved; arithmetic ORDER, not geometry.
  5. The sub-0.01 pair (2) — probably closes with item 4.
  6. The remaining inside-line geometry (6).
  7. `%%barsperstaff`'s own splitting defect — NAMED, and NO GATE RENDERS IT; build the
     gate before trusting a fix.
  8. The voice-name wrapped limit — check `lineOfMeasure` for a SHORT voice, not the grace.

…and the arcs that are NOT on that list: `timeBasedLayout` 669 (a second layout algorithm,
its own arc), `initialClef` 42 (⚠️ its control is MUTE), `add_classes` 16, `lineThickness`
14 (cause measured, fix scoped, NOT piecemeal), `expandToWidest` 14 (size the re-entrancy
first). Also open: `Docs/PONYTAIL-DEBT.md`'s 14 genuinely-open markers — triaged by
OBSERVABILITY, and 8 of them should be RESTATED AS DECISIONS rather than worked; `npm run
lint`'s 1,023 pre-existing errors, only as ITS OWN commit; and PUBLISH, which is a decision.

⚖️ AND ONE DECISION IS STILL THE OWNER'S, untouched: `CLAUDE.md` is 2,240 lines with 1,355
of blockquote narrative duplicating 56 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.

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

**Evidence in hand first, then risk.** Items 1–3 are each diagnosed to the rule AND carry a
disproved fix, so the expensive half — finding out what does not work — is already paid. An
agent can start porting within minutes rather than re-deriving.

**Then the cheap ones.** Items 4 and 5 are the same arithmetic family and 5 probably falls
out of 4; item 6 is six fixtures with the instrument already named.

**Item 7 is last of the defects because it needs a GATE BUILT FIRST** — nothing renders
`%%barsperstaff`, so a fix there cannot be trusted, and building the gate is most of the
work. **Item 8 is last outright** because the obvious change makes the gate WORSE (23 → 25)
and the real target is one level down in `lineOfMeasure`.

⚠️ **And the floor matters to the ordering**: four of the 23 will never close, so an agent
working the list top-down should expect to reach 19 and stop, not to reach 0.
