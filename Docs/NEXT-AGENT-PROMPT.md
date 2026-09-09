# NEXT AGENT PROMPT — abcts, 2026-09-09

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-09.md — §THE METHOD first, then §THE PATTERN THAT
NAMED FOUR OF THE FOUR, then §WHAT IS OPEN. Then HANDOFF-2026-09-08.md for THE QUADRATICS
and the scaling gate, and HANDOFF-2026-09-07.md for the MODE RULE.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

    suite       90 files, 2,547 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome
    zzselect    0 of 685  WebKit AND Chrome    <- NEW, and it OPENED AT 9
    zzopts      0 on every plumbing row         <- NEW, and it OPENED AT 685 OF 685
                jazzchords 0 — it opened at 95 and closed the same day
                print 7 · print+responsive 5 · scale 4 and 2, all DECLARED
                (SIX of the print seven differ in a LAST DIGIT alone)
    zzledger    2 differ, 2 KNOWN — 39 controls (was 16)
    warnings    0 of 815 · zzscale 8 of 8 LINEAR · test:dist 0 of 685 ESM and CJS

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT FIVE TIMES: REFERENCE THE ACTUAL abcjs.
Seventeen landings on 2026-09-09 and every one was a read of a named function or a probe of
its real output — not one came from a diff.

  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — its `src/` RUNS WITHOUT A BUILD:
       cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/. /tmp/gp/abcjs/
       node -e "const A=require('/tmp/gp/abcjs/index.js'); …"
     NEVER ../abcMusicKit itself, and BRACE every `if` you write under.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ AND EVERY CONTROL CARRIES A WITNESS NOW — a regex the shape must produce in abcjs's own
output. A control that agrees because the FEATURE NEVER RENDERED is a held prediction that
measures nothing; such a row reports MUTE. It fired four times in eighteen, TWICE ON MY OWN
WITNESS. Every new harness gets a NEGATIVE CONTROL too: the MIDI sweep's plain four-note
tune differed on the first run, and that was the first finding.

⭐⭐⭐ AND A MARKER'S CAUSE IS USUALLY RIGHT WHILE ITS SIZE IS WRONG. All four remaining
ledger defects fell in an hour each; TWO were symptoms of a defect the marker had not seen
(the `|` hint was the whole `w:` distribution loop; the tempo flag was the tempo mark
reading the NOTE glyph table). Re-derive the size — and when it holds, say so: `style=`
between voices was re-derived and the "model change" estimate STANDS.

⚠️ TRAPS, and the first two are new and cost the most:
  ⚠️ A REPO TEST CAN ASSERT THE DEFECT. FOUR did on 2026-09-09, each written from the same
     reading the defect came from, so it agreed with the code and with nothing else. PROBE
     abcjs before believing a red.
  ⚠️ A GATE CAN NORMALISE THE DEFECT AWAY — `Array.isArray(r) ? r[0] : r` in the MIDI gate
     hid a wrong return shape in the entry point that gate exists to prove. If a gate needs
     a shim to compare, ask what the shim is hiding.
  ⚠️ A SAMPLE IS A LOWER BOUND, NEVER A NUMBER TO DECLARE. `jazzchords` was declared at 13
     from a 1-in-8 reconnaissance and is 95 over the corpus. The gate said `UP` on the first
     full run, which is what a declared count is for.
  ⚠️ HALF OF `setPaperSize` IS ON THE PARENT NODE, so a comparison of the SVG alone cannot
     see it. `zzopts` compares `outerHTML`; every gate before it was blind to a container
     abcjs styles on every render.
  ⚠️ A FLOOR ROTS. Seven ratchets said "at least the rows it did" and six were slack by 48
     to 844 rows. They read `agree === total` now; write new ones the same way.
  ⚠️ `git stash push` + rebuild + re-run is how you tell a REGRESSION from a PRE-EXISTING
     difference. Needed three times, and twice the difference was older than the fix.
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT. Re-run before believing a red.
  ⚠️ `cd /tmp/gp/abcjs` RESETS THE SHELL'S CWD for the next call. Re-`cd` into the repo.
  ⚠️ `/tmp` IS CLEANED MID-SESSION and leaves EMPTY directories behind. Restore playwright:
     `mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61`.
  ⚠️ A GATE'S REPORT FILE OUTLIVES ITS RUN. Check the timestamp on `/tmp/abcts-*.txt`.

WHAT TO DO NEXT — ask the owner which; these are NOT equal:
  1. **`oneSvgPerLine` / `viewportHorizontal`** — both UNIMPLEMENTED, measured, each a
     wrapper of its own: an `abcjs-inner` div for the one, an `<svg>` per SYSTEM with its
     own viewBox and a `Sheet Music for "<title>" section N` title for the other. The
     biggest remaining FEATURE gap in the compat surface.
  2. **A non-unit `scale`, 4 and 2 in `zzopts`** — geometry inside the SVG.
  3. **`style=` between voices** — the one open ledger defect, and the size is honest.
  4. **The LAYOUT-UNIT ULP.** It is now SIX of the seven open `print` rows and both flag
     rows before them: `spaces(x)` then `× UNIT_PX` is not `x`. Architectural, and the
     largest single class of open rows left anywhere.
  5. **Finish the marker sweep.** ~55 of the 94 are still classified by reading alone.
  6. **Package metadata** — `version` is `0.0.0`, no `repository`/`homepage`/`unpkg`, so a
     CDN cannot resolve the script build. The only thing between the owner and publishing.
  7. **ANOTHER SURFACE.** Two were built on 2026-09-09 and found ten defects between them.
     What else does a host switch on that no gate renders? `add_classes` beyond the 111
     sibling goldens, `wrap`/`staffwidth` combinations, tablature options, `format`
     overrides, a `%%` file header applied to a whole book.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD first**, because the four additions to it — the witness, the negative control,
"a floor rots", and comparing the CONTAINER — are what found thirteen of the twenty-four.
The state is eleven numbers and nine of them are zero.

**Then the size pattern**, because it is the argument for re-opening anything this repo has
written off, and the 2026-09-09 pass is four more instances: cause right, size wrong, twice
over a defect the marker had never seen.

**Then the traps**, because two of them are new and both are about a GATE lying: a test that
asserts the defect, and a gate that normalises it away. Four tests and one gate did exactly
that this session, and each one had been green for weeks.
