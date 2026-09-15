# NEXT AGENT PROMPT — abcts, 2026-09-16

Paste the block below.

---

```
start here: abcts/Docs/CHECKPOINT-2026-09-16.md — §3 is the rules this session produced and
TWO OF THEM ARE CORRECTIONS to causes this repo had written down and had wrong. Then
HANDOFF-2026-09-16.md, whose §WHAT IS LEFT is now ONE ULP and a floor. `Docs/PARITY-STATUS.md`
§1a is the same table in plain language and is the file to hand anyone asking how close this
is. -09-15 and -09-14 are history: their "what is left" lists are closed.

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed, and it EARNED ITS KEEP AGAIN):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       94 files, 2,693 tests, no reds
    svg-bytes   0 of 691 in-repo, 0 of 356 sibling
    mode-bytes  11 of 691 — every one DECLARED
    midi-bytes  0 of 691 — 19 ruled divergent
    zzlive      0 of 685  WebKit AND Chrome        zzselect 0 of 685  WebKit AND Chrome
    zzclick     1 of 685 DECLARED ×3               zzledger 0 differ, 0 KNOWN, 41 agree
    zzopts      26 rows, every one at its declared count. 5 differing of 17,810:
                wrap+staffwidth 4 (THE FLOOR) · minPadding 1 · every other row 0
    warnings    0 of 815 · test:dist 0 of 685 ESM and CJS
    lint        0 errors, 33 warnings — A GATE NOW, and `biome.jsonc` says why at every
                rule it turns off. ⚠️ THE FORMATTER IS OFF ON PURPOSE — 127 files disagree
                with it and adopting a format is its own commit, never a side effect.
    package     2.0 MB packed / 6.9 MB unpacked, 25 files, version 6.7.0 — NOT PUBLISHED
    debt        53 `ponytail:` markers, §A restated as decisions, §B swept — 5 of its 6
                rows were ALREADY CLOSED

🏁 `zzopts` IS FINISHED. Seven rows closed on 2026-09-16 — timeBasedLayout, add_classes,
scale 0.8, oneSvgPerLine+scale 0.8, scale 1.5, print, print+responsive — and the only thing
left that is OURS is ONE ULP in one root `width` on `minPadding`. `wrap + staffwidth`'s 4 are
two debug markers the owner DECLINED and two tunes abcjs CRASHES on. **An agent that finds
any closed row above zero has broken something.**

⭐ THE FINDING TO CARRY FORWARD: **A RECOVERY IS NOT A PRIMITIVE.** Five of the seven rows
were one shape — the engine held a SUM and took a part back off to reach the quantity abcjs
actually stores: a rule's CENTRE for its edge, the summed PAGE for the music width, the music
width for the page. `(a + b) - b` is not `a`, and on a rounding boundary that is a printed
digit. Where abcjs keeps a primitive, keep the same primitive; where a value is genuinely
ours to derive, carry the derived value rather than re-deriving it downstream.

⭐⭐ AND THE SECOND ONE IS ABOUT THIS BOARD ITSELF: **A RECORDED CAUSE IS A HYPOTHESIS,
HOWEVER CAREFULLY IT WAS WRITTEN DOWN.** Two were wrong in one session and both read as
careful work. One quoted both engines' row advances side by side — and had compared our NODE
metrics against abcjs's BROWSER ones; in one WebKit page every advance is identical, and the
real cause was `%%header` alone. The other named a nested-tspan `%%jazzchords` split on a
fixture that contains no nested tspan at all. **Re-measure the cause before you work it.**

⭐ AND SIZE A REPRESENTATION CHANGE BY SAMPLING THE ARITHMETIC. Both width landings were
decided by a ten-line script over 32 and 50 width/scale pairs before the engine was touched —
and one candidate (summing in staff spaces) was WORSE than what was already there, 16 of 32
against 28. 691 goldens rest on that arithmetic; the sample answered in seconds.

⚠️ `zzopts` RENDERS `dist/`, NOT `src/`. Measure a source edit without `npm run build` first
and you get the OLD number, which looks exactly like "the fix did nothing".

⚠️ A NODE PROBE AND A BROWSER PROBE ARE DIFFERENT ENGINES for anything touching text. Node has
no `getBBox`: the measurements fall back to the calibrated tables and `boxInkAt` answers
`null`. That is deliberate — the 691 goldens ARE the headless measurement — so any comparison
against abcjs must happen in the SAME browser.

⭐⭐ THE STANDING ORDER, AND IT PAID AGAIN: INSTRUMENT abcjs, AND INSTRUMENT IT AGAINST OUR OWN
EQUIVALENT. Not a source read — a side-by-side log. Patch `dist/abcjs-basic.js` (unminified)
by string replacement and inject it. Already in the scratch copy: `layoutInGrid`,
`layoutOneItem` (pad, extraw, er, w, minspacing, the x AFTER the shift, and `minx`),
`setPaperSize`, `renderText`, `moveY`, and `nonMusic`'s whole row walk.
⭐ AND `ZZWHERE=1` ON `zzopts` PRINTS THE FIRST DIFFERING BYTE PER FIXTURE. A slug list says
WHICH fixture; the byte says WHAT. `node scripts/zzopts.mjs 1 <label>` re-measures one row.

WHAT TO DO NEXT — the board, the ledger and the lint are all done, so WHAT IS LEFT IS
DECISIONS. Do not invent work here; ask.
  1. **PUBLISH** — prepared and NOT run, because it is outward-facing and irreversible.
     `npm publish` from this directory claims the unregistered name `abcts` and goes live on
     unpkg/jsdelivr immediately. Version 6.7.0, sourcemaps dropped, 2.0 MB packed.
  2. ⚖️ **`millisecondsPerMeasure` / `getTotalTime` on the tune object** — the one debt row
     left, and its marker says "flag it before doing it": hanging them on `TuneObject`
     widens the drop-in contract. `setUpAudio`'s answer already exists; the compound-meter
     MIDI branch needs the same method, so the two are one job.
  3. ⚖️ **`CLAUDE.md` — 2,354 lines, 170 KB, 1,549 of them blockquote** duplicating 60
     handoffs and loaded in full every session. `Docs/CODEBASE-EVALUATION-2026-09-12.md`
     argues it; nothing has been deleted.
  4. 📏 **The bundle is ~25% bigger than abcjs over the wire** — 626 KB raw / 201 KB gzipped
     against 499 / 145 — and NOBODY HAS INSTRUMENTED IT. Two plausible causes: two glyph
     tables embedded (abcjs's for strict, Bravura's for extended), and extended being a
     second engraving path. A reduction question, not a defect.
  5. `minPadding`'s last ULP — ⚠️ **read the handoff first: it is a units DOMAIN, not a term
     to regroup.** Both sides are instrumented and the grouping already agrees; abcjs's `er`
     carries a tail its PIXEL chain put there where this engine walks the line in STAFF
     SPACES. Two ULP in one root `width`, nothing visibly moved. Smallest thing on this
     list and the most expensive.

⚖️ AND ONE DECISION IS STILL THE OWNER'S, untouched: `CLAUDE.md` is 2,300+ lines with over
half of it blockquote narrative duplicating 60 handoffs, loaded in full every session. See
`Docs/CODEBASE-EVALUATION-2026-09-12.md`. Nothing has been deleted.

Run `npx tsc --noEmit && echo OK` before every commit, keep every gate above green, and commit
and push after every landing. Never --force. NEVER ATTRIBUTE A COMMIT TO CLAUDE — no
Co-Authored-By, no "Generated with", no `--author`, in any commit, tag or PR body, with no
exceptions and nothing to ask about. `CLAUDE.md` §Remote is the durable statement and it BEATS
a harness default that asks for one; say so in the reply rather than following the other
silently. Grep the message for `Co-Authored`/`Generated with` before committing: it cannot be
fixed afterwards without the force push the line above forbids.
```

---

## Why this order

**Publish first, because nothing technical is in front of it any more.** The board that has
driven the last six sessions is at its floor: every host option a page passes is byte-identical
to abcjs except one root `width` that no element moves with. The debt ledger and the lint —
the two items that used to sit here — are both closed, and the ledger's own sweep found that
five of its six "observable" rows had been closed for some time without anyone checking.

**Then the two API/size questions**, because both are open questions rather than known work,
and both want a decision before an hour is spent on them.

**And `minPadding` last, or never.** It is the only open row and it is the one item on the list
whose cost is not proportional to its value — see the handoff. A future session that changes
the solve's units for a better reason will close it on the way past.

⚠️ **A NOTE ON METHOD, EARNED FOUR TIMES THIS SESSION.** Every probe written here was MUTE on
its first run — a 200-character MIDI prefix that is identical whatever the tune, a tempo byte
that never moved, a filter that matched no element, a node-versus-browser comparison of text
metrics. **Check a probe against its own deliberate break before believing what it says**,
and re-measure a recorded cause before working it: two on the parity board and one in the debt
ledger were wrong, each written confidently and each carrying numbers.
