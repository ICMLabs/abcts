# NEXT AGENT PROMPT — abcts, 2026-09-25

Paste the block below.

---

```
start here: **`Docs/HANDOFF-2026-09-25.md`** (newest: per-voice lines, the wrapped
`tune.lines` gate and the `addLineBreaks` port), then **`Docs/PARITY-STATUS.md`** — the only file re-measured after the abcjs
**6.7.1** re-harvest (2026-09-21/22) and is current; §3b is a class the older docs predate,
the NAMED OPEN ROWS of the tune-object oracles. Then `tests/open-rows.ts`, whose header says
what each row is. Then CHECKPOINT-2026-09-16.md §3 for the rules — two are CORRECTIONS to
causes this repo had written down and had wrong — and HANDOFF-2026-09-16.md for the traps.
⚠️ **Both of those carry 6.7.0-era NUMBERS and are bannered as such**; take numbers from
PARITY-STATUS or from a gate you ran. -09-15 and earlier are history.

⚠️ **THE ORACLE IS abcjs 6.7.1 AND THE VERSION IS PART OF THE GATE.** `abcts.config.json`
pins it, `signature` reports it, the package version IS it. The one behavioural change is a
scaled element carrying `transform="translate() scale() translate()"` where 6.7.0 wrote a CSS
style transform (`draw/relative.js:74-78`).

Work in /Users/lrettberg/ICMLabs/Code/abcts. Run every command from there — `cd` does not
persist between tool calls and the workspace ROOT collects every sibling repo's tests.

⚠️ FIRST: `/tmp` IS CLEANED BETWEEN SESSIONS. Restore before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed, and it EARNED ITS KEEP AGAIN):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.1/src /tmp/gp/abcjs
…then `cd` back into the repo — that `cd` resets the shell's CWD for the next call.

    suite       128 files, 3,446 tests (re-run 2026-09-25)
    zzelemset   6 of 697, all DECLARED (abcjs debug markers) — NEW 2026-09-25: the live
                `<g>` nodes in `elemset` and the timing rows a playback cursor colours.
    zzwraplines 2 of 697, both DECLARED — abcts-vskip 0/2, where abcjs throws. NEW
                2026-09-25: the wrapped `tune.lines` a host reads after `{wrap}`.
    svg-bytes   0 of 697 in-repo, 0 of 359 sibling
    mode-bytes  11 — every one DECLARED
    midi-bytes  0 of 697 — 19 ruled divergent
    zzlive      0 of 691  WebKit AND Chrome        zzselect 0 of 691  WebKit AND Chrome
                (re-run 2026-09-23 after the parser changes; Chrome is at zero too)
    zzclick     0 on every row                     zzledger 0 differ, 0 KNOWN, 88 agree
    zzopts      26 rows, every one at its declared count. 4 differing of 17,966 —
                `wrap+staffwidth` alone, and that is ITS floor: two debug markers the
                owner declined and two tunes abcjs CRASHES on. Every other row is 0.
    open rows   ✅ **EMPTY as of 2026-09-23** — every list in `tests/open-rows.ts` is `[]`
                but `renderValues`, whose ONE row is the §3 ruled divergence. `tune.lines`
                1,204,999 of 1,204,999 characters over 814 tunes, `parse-only` 0 of 822,
                `parse-values` 0 of 16,223, `deline` 0 of 1,628, `sequence` 0 of 237,
                `accessors` 0 of 822 × 9. Each gate still asserts that every NAMED row
                differs, so a fix without a deletion FAILS — which is how the eight
                families were closed one at a time.
    warnings    0 of 822 tunes, 542 warnings · test:dist 0 of 691 ESM and CJS
    lint        0 errors, 33 warnings — A GATE NOW, and `biome.jsonc` says why at every
                rule it turns off. ⚠️ THE FORMATTER IS OFF ON PURPOSE — 127 files disagree
                with it and adopting a format is its own commit, never a side effect.
    package     2.0 MB packed / 6.9 MB unpacked, 25 files, version 6.7.1 — NOT PUBLISHED
    debt        79 `ponytail:` / 19 `abcjs-debt:` markers (re-counted 2026-09-25; the
                instrument has moved three times, the code less). §A restated as
                decisions, §B swept, and its `millisecondsPerMeasure` row is CLOSED.

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

WHAT TO DO NEXT — ⚠️ **EVERY MEASURED SURFACE IN THIS REPO IS AT ITS FLOOR** (re-run
2026-09-23: suite, `svg-bytes` both corpora, `midi-bytes`, `mode-bytes` all-declared,
`zzopts` all 26 rows at their declared counts, `zzlive`/`zzselect` in BOTH browsers,
`zzclick`, `zzledger` 0 of 41, `zzscale` linear on all eight shapes, `warnings`,
`test:dist`, `compat-surface` 0 absent, and the open-row lists now empty). **AND THE ULP IS
GONE TOO, SO WHAT IS LEFT IS DECISIONS.** Do not invent work here; ask.

⚠️ **FOUR OF THE SIX ITEMS BELOW CLOSED ON 2026-09-22/23 AND ARE KEPT AS RECORDS**, because
each one's recorded CAUSE or SIZE was wrong and that is the reusable part. Only 1 (publish)
and 4 (the bundle) are open, and both are the owner's.
  1. **PUBLISH** — prepared and NOT run, because it is outward-facing and irreversible.
     `npm publish` from this directory claims the unregistered name `abcts` and goes live on
     unpkg/jsdelivr immediately. Version **6.7.1**, sourcemaps dropped, 2.0 MB packed.
     ⚠️ The version tracks the abcjs release this is byte-identical to, so it MOVED WITH THE
     RE-HARVEST — which is the scheme working, and also the reason abcts's own fixes have to
     take the patch digit.
  2. ✅ **CLOSED 2026-09-23** — `millisecondsPerMeasure` / `getTotalTime` are ON the tune
     object and gated (`compat-surface` 0 of 64 absent, `accessors` 0 of 822 × 9). What is
     left of that row is the COMPOUND-METER MIDI branch (`flatten.ts:450`), which needs the
     same method and has no harvested case in 6/8 yet.
  3. ✅ **DONE 2026-09-23 — `CLAUDE.md` is 644 lines / 44 KB**, from 2,370 / 176 KB, and 187
     blockquote lines from 1,557. The dated LOG and the session narratives are gone (they are
     in `Docs/`); every owner ruling, the harness and the rules that bind stayed, and what the
     narrative left behind is distilled into `### The rules that transfer`. ⚠️ Four numbers in
     what remained were re-measured and WRONG — `ENGRAVE`'s count, the sibling corpus's
     goldens, the vendored abcjs trees, and a debt bar that had been met on 2026-08-14.
  4. 📏 **The bundle is ~25% bigger than abcjs over the wire** — 626 KB raw / 201 KB gzipped
     against 499 / 145 — and NOBODY HAS INSTRUMENTED IT. Two plausible causes: two glyph
     tables embedded (abcjs's for strict, Bravura's for extended), and extended being a
     second engraving path. A reduction question, not a defect.
  5. ✅ **CLOSED 2026-09-22/23 — the named OPEN ROWS are GONE.** All eight families, and the
     nine `accessors` field-rows with them. `tests/open-rows.ts` now holds ONE row and it is
     the ruled divergence of PARITY-STATUS §3 (abcjs's red debug string for a note longer
     than a breve). Every list in that file is an empty array. The eight controls are
     `clef-midmeasure`, `stray-tie`, `staffnonote-lines`, `voice-modifiers`,
     `text-line-rows`, `accessor-walks`, `unknown-clef` and `positioning`.

     ⭐ **THE FINDING: MOST OF THEM WERE RULES THIS REPO HAD ALREADY PORTED, AT THE SITE
     THAT NAMED THEM.** The renderer knew `%%staffnonote` and `Measure.clefChangeSilent`;
     the grace path knew the tie carry was positional. Each was written once, where one
     surface needed it, and the projection had no share of it. **When a tune-object row
     looks like a missing feature, grep this repo for the rule first.**

     ⭐ **AND THE SECOND: THE INK AND THE CLOCK ARE DIFFERENT SURFACES.** A note longer than
     a breve had been SILENT here for as long as the row existed, because its DRAWING is a
     declared divergence and nobody asked whether it still sounded. A trailing `K:`, an
     empty `%%center` and `%%staffnonote` were all the same shape: the page agreed, so no
     byte gate could speak.
  6. ✅ **CLOSED 2026-09-23 — and the recorded cause was wrong.** `minPadding`'s ULP was
     neither the solve nor a units domain: the `er` values are IDENTICAL on both sides and the
     difference was `extraWidth`, because `graceLeft` RE-DERIVED a left reach the glyph beside
     it already carried as a constructed `dx`. `zzopts` is now 0 on every row but
     `wrap + staffwidth`'s declared floor of 4. ⚠️ The old note survived three sessions
     because its probe stopped one term short — it compared the grouping, which agreed.

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
