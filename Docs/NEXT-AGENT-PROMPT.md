# NEXT AGENT PROMPT — abcts, 2026-09-09b

Paste the block below.

---

```
start here: abcts/Docs/HANDOFF-2026-09-09b.md — §THE METHOD HELD first, then §THE FINDING
THAT IS NOT ABOUT THIS WORK, then §WHAT IS OPEN. Then HANDOFF-2026-09-09.md for the witness,
the negative control and "a floor rots", HANDOFF-2026-09-08.md for THE QUADRATICS and the
scaling gate, and HANDOFF-2026-09-07.md for the MODE RULE.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

    suite       90 files, 2,547 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome
    zzselect    0 of 685  WebKit AND Chrome
    zzopts      15 rows, every one at its declared count
                oneSvgPerLine 0 · +resize 0 · +scale 0.8 4 (the same four as `scale 0.8`)
                viewportHorizontal 0 · +scroll 0 · viewportVertical 0
                print 7 · print+responsive 5 · scale 4 and 2 · jazzchords 0
    zzledger    2 differ, 2 KNOWN — 39 controls
    warnings    0 of 815 · zzscale 8 of 8 LINEAR · test:dist 0 of 685 ESM and CJS
    lint        1,021 errors — PRE-EXISTING, not a gate, do not "fix" under other work

⭐ THE STANDING ORDER, AND THE OWNER HAS SAID IT SIX TIMES: REFERENCE THE ACTUAL abcjs.
The three wrapper options landed on 2026-09-09b and THREE OF THE FOUR RULES THAT MATTERED
WERE INVISIBLE IN THE SOURCE — they came from rendering abcjs in WebKit under seven option
combinations before a line was written.

  1. READ the named abcjs function. Its answer is usually one `if`.
  2. GREP THIS REPO before porting it.
  3. LADDER it, one variable per rung, through BOTH engines.
  4. INSTRUMENT abcjs when the source is not enough — its `src/` RUNS WITHOUT A BUILD:
       cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/. /tmp/gp/abcjs/
       node -e "const A=require('/tmp/gp/abcjs/index.js'); …"
     …and for anything DOM-side, render both engines in a real browser instead:
       PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzopts.mjs
     NEVER ../abcMusicKit itself, and BRACE every `if` you write under.
  5. Only then write code, and let the gate arbitrate.

⭐⭐ EVERY CONTROL AND EVERY GATE ROW CARRIES A WITNESS — a regex the shape must produce in
abcjs's own output; a row that agrees without it reports MUTE. ⚠️ **THE WITNESS HAS BEEN THE
THING THAT WAS WRONG THREE SESSIONS RUNNING** — this time a stray quote in
`section 2"></title>`. Write it, run it, read the MUTE before believing the zero. And pick
a witness the FEATURE alone can produce: `section 2`, never `section 1`, because a tune with
one `<g>` yields `section 1` from a split that never split.

⭐⭐⭐ AND PROVE THE GATE GOES RED — then check WHICH ROWS STAYED GREEN. Three deliberate
breaks took three rows to 86/87/87 of 87 and left green exactly the two rows each break
could not reach. That the instrument is SPECIFIC says more than that it is sensitive.

⚠️ TRAPS, the first two new:
  ⚠️ A SHARED FIRST-THREE IS NOT A SHARED SET. `zzopts` prints three slugs; DIFFERENCE the
     full sets before declaring a row's count as inherited from another row's.
  ⚠️ A CONCATENATED `style` STRING SURVIVES `setAttribute` VERBATIM. Assigning the same
     declarations as properties re-serialises them and differs on every element.
  ⚠️ A REPO TEST CAN ASSERT THE DEFECT — four did. PROBE abcjs before believing a red.
  ⚠️ A GATE CAN NORMALISE THE DEFECT AWAY. If a gate needs a shim to compare, ask what the
     shim is hiding.
  ⚠️ A SAMPLE IS A LOWER BOUND, NEVER A NUMBER TO DECLARE. `jazzchords` was declared at 13
     from a 1-in-8 pass and is 95 over the corpus.
  ⚠️ A FLOOR ROTS. Ratchets read `agree === total`; write new ones the same way.
  ⚠️ `getBBox()` NEEDS A LAYOUT ENGINE, and `visibility: hidden` still has one where
     `display: none` does not.
  ⚠️ `git stash push` + rebuild + re-run is how you tell a REGRESSION from a PRE-EXISTING
     difference — it is also how `lint`'s 1,021 errors were shown to pre-date this work.
  ⚠️ THE SUITE TIMES OUT UNDER LOAD AND IT IS NOT A DEFECT. Re-run before believing a red.
  ⚠️ `cd /tmp/gp/abcjs` RESETS THE SHELL'S CWD for the next call. Re-`cd` into the repo.
  ⚠️ `/tmp` IS CLEANED MID-SESSION and leaves EMPTY directories behind. Restore playwright:
     `mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61`.
  ⚠️ A GATE'S REPORT FILE OUTLIVES ITS RUN. Check the timestamp on `/tmp/abcts-*.txt`.

WHAT TO DO NEXT — ask the owner which; these are NOT equal:
  1. **THE INTERACTIVE SURFACE.** ⭐ The biggest hole in the compat surface now that the
     wrappers are in, and it was found by grepping for `addEventListener` after they landed:
     **abcts attaches NO DOM EVENT LISTENERS AT ALL.** `setupSelection`
     (`write/interactive/selection.js`, ~250 lines) is entirely unported — click, the
     `clickListener` a host passes, drag-to-change-pitch, `selectionColor`/`dragColor`
     repainting, `abcjs-dragging-in-progress` — and `tune.engraver.svgs` with it. The
     `selectables` ARRAY is right (`zzselect` 0 of 685); everything after a user TOUCHES it
     is absent, and no gate here renders a click.
  2. **The LAYOUT-UNIT ULP.** Six of the seven open `print` rows and both flag rows before
     them: `spaces(x)` then `× UNIT_PX` is not `x`. Architectural, and the largest single
     class of open rows left anywhere.
  3. **A non-unit `scale`, 4 and 2 in `zzopts`** — geometry inside the SVG, and
     `oneSvgPerLine + scale 0.8` inherits the same four.
  4. **`style=` between voices** — the one open ledger defect, and the size is honest.
  5. **Finish the marker sweep.** ~55 of the 94 are still classified by reading alone.
  6. **Package metadata** — `version` is `0.0.0`, no `repository`/`homepage`/`unpkg`, so a
     CDN cannot resolve the script build. The only thing between the owner and publishing.
  7. **`npm run lint`** — 1,021 errors and 46 warnings across ~10 files, all predating this
     session, mostly formatting and `useLiteralKeys`. `--write` would touch a thousand lines,
     so it is only worth doing as ITS OWN commit, on purpose, never folded into other work.
  8. **ANOTHER SURFACE.** Three were built across 2026-09-09 and found thirteen defects.
     `add_classes` beyond the 111 sibling goldens, `wrap`/`staffwidth` combinations,
     tablature options, `format` overrides, a `%%` file header applied to a whole book.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and
commit and push after every landing. Never --force. OMIT Co-Authored-By trailers here —
`CLAUDE.md` §Remote, and it beats a harness default that asks for one; say so in the reply
rather than following the other silently.
```

---

## Why this order

**The METHOD first**, because the newest addition to it is the sharpest: proving a gate goes
red is half the check, and asking WHICH ROWS STAYED GREEN is the other half. Three breaks
reddened three rows and left green exactly the two they could not reach.

**Then the interactive finding**, because it is the answer to the question the previous
prompt ended on — *what else does a host switch on that no gate renders?* Not another
option. An **interaction**. It was found by a grep that took ten seconds, after a change
that had nothing to do with it.

**Then the traps**, because the two new ones are both about a comparison that looks
conclusive and is not: a shared first-three read as a shared set, and a style string that
survives one route and is rewritten by the other.
