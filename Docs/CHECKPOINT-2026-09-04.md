---
title: Checkpoint 2026-09-04 — browser parity closed, and the non-strict path gets its first gate
status: zzlive 0 of 685 WebKit · 4 of 685 Chrome · suite 2,456 · svg-bytes 685/685 + 356/356
---

# Checkpoint 2026-09-04

## 1. THE STATE

    zzlive         0 of 685   WebKit   ← the arc that opened at 231 on 2026-08-31
    zzlive         4 of 685   Chrome   ← a second browser, newly on the board
    svg-bytes      0 of 685 in-repo, 0 of 356 sibling
    extended       691 digests, ratcheted (NEW)
    zzcontrol      dirs 0/17 · tempo 0/13 · lyricfont 0/7 · size 0/9
    suite          2,456 passing, no reds, no expected-fails

Two arcs closed in two days: **strict browser parity on WebKit**, and **the first gate the
non-strict modes have ever had**.

## 2. WHAT LANDED — STRICT

### 2.1 The tempo's sub-pixel x (`35d7031`), 8 → 5

abcjs measures the element it JUST DREW (`draw/tempo.js:20`, `:32`), and in WebKit a
fractional x measures 1/64 px wider than an integer one. The advance is
`preWidth + preWidth/length`, so on a four-letter word that quantum lands as 0.02px on the
mark's note, its `= 170`, its `post` and everything after.

**The note that said "passing an x here changes NOTHING" was right about ONE of two sites.**
The prefix branch already rebuilds a HEADER tempo at the solved x; a MID-TUNE `[Q:]` is
translated like any music element and its measure-pass cursor is BLOCK-LOCAL — a different
x entirely, not one disagreeing in the last bit.

### 2.2 Every `%%<type>font` lane (`5092802`), 5 → 4

Ten sites, one defect, and it is this arc's own rule: **abcjs measures the thing it is about
to draw and we measured a STAND-IN.** Each asked for a default probe in a default serif where
abcjs hands `getTextSize.calc` the directive's whole font object. The part label, `wordsfont`,
`historyfont`, `measurefont`, a mid-tune `T:`, `tempofont`'s two advances, `repeatfont`'s
`minspacing`, and `$N` rows in the bottom block.

**And the probe string is abcjs's, which is not the same as not having one.** `addTextIf`
measures `"A"`, `richText`'s empty arm `"i"` — never the row's own text. Ours used `'Mg'`,
which carries a descender the probes do not, so the SIGN of the error moved with the face.

### 2.3 CSSOM serialisation (`0e7abc4`), 4 → 3

Filed as THE OWNER'S CALL on the reasoning *"matching one browser's serialisation breaks the
other by construction"*. True of a string we EMIT and false of declarations we SET.
Re-running abcjs's eight `setScale` assignments over the INSERTED element makes
`ledger-gaps-tune5` byte-identical in **WebKit and Chrome** — one alone would have proved
nothing. The note called the fix "architectural"; it is one function over one element.

### 2.4 The held syllable (`20edbfe`) and the zero-height lyric (`6c8d920`)

`lyricFont` is stamped per ELEMENT, so the `&nbsp;` a `_` carries onto the next note has
none. Scoped to `raw === ''` — resolving EVERY null from the directive closes the same
control and takes four gates red.

Then: `this.height = opt.height ? opt.height : 4` (`relative-element.js:36`) over
`height: lyricDim.height / STEP`. A held syllable's `lyricStr` is `"\n"`, PURE WHITESPACE, so
`getTextSize` early-outs to zero, `opt.height` is FALSY, and the element takes abcjs's
**four-pitch default**. `lyricHeightBelow` maxes over children, so it binds under 15.5px.

⭐ **A SIZE LADDER NAMED IT BECAUSE THE DEFECT HAS A THRESHOLD**, and no single fixture can
show a threshold. abcjs pinned at 114.1655 for every size ≤10pt in both faces while ours kept
shrinking; `4 × 3.875 = 15.5`, Helvetica 10 measures 15.015625 and 11 measures 17.01.

### 2.5 The bottom block's page cursor (`6c42a08`), 3 → 2

`t.y + oy` is a block-local walk plus a base — the `local + base` hazard
`bottomTextBlock`'s own doc warns about. `445.779 + 15` is `460.779`; the WALK is
`460.77900000000005`, abcjs's own. The top block has carried `pageY` since the `%%begintext`
ULP; this is the same fix one block over.

### 2.6 The text cache (`97613c6`), 2 → **0**

    var sizeCache = {};                   svg.js:306, MODULE scope, unbounded
    key = text + JSON.stringify(attr)     svg.js:316, font attrs only — no x
                                          consulted BEFORE the drawn element

So the first width abcjs measures for a short string is the width every later render in that
page gets. `visual-selection-01` and `svg-per-line-01` were byte-identical rendered ALONE and
differed only in a shared page.

What was in the way is an artefact of OURS: **we lay a tempo out twice** where abcjs lays one
out once, and the throwaway pass would have been the first sighting the cache froze — freezing
the provisional x, the exact defect the rebuild exists to avoid. `TextFont.transient` marks a
measurement abcjs never makes; three call sites set it.

## 3. WHAT LANDED — NON-STRICT (`PLAN-ABCJS-DEBT-2026-09-03.md`)

| # | Phase | Result |
|---|---|---|
| 0 | Non-strict gate | **LANDED** `db2d61e` |
| 1 | Size cache | **LANDED** `de12139`, bigger than planned |
| 2 | Falsy-zero | **PART LANDED** `9507179`; one site reverted |
| 3 | `"A"` probe | **NOT A DEFECT**, reverted |
| 4 | Vendor prefixes | **NOT REACHABLE**, reverted |

**Phase 0** — `tests/extended-snapshot.test.ts`, 691 digests asserting *"has not changed since
recorded"*, NOT *"matches abcjs"*: the second would go red on every improvement and be deleted
within a week. Reported as three lists (changed/added/removed) because the shape is the
finding. **Exit criterion met**: a deliberate `+0.0001` on `laneMargin` takes it red on 88 rows.

**Phase 1** — the planned change alone would have been a no-op. `withLiveMeasurement` lived in
`compat/index.ts`, which hard-wires strict, so **`extended` had no live measurement path at
all** and laid text out with the per-em tables in a real browser. Lifted into
`text-measure.ts`; `createDomTextMeasurer(…, { shared })` gives strict abcjs's global x-free
cache and everything else a per-render cache keyed WITH the x. `src/browser.ts` exports `core`
namespaced, because the modes were unreachable from a page too.

**Phase 2** — one abcjs bug, THREE sites, and **the correct answer is not the same at all
three**: 1 and 2 are a DECLARED zero dropped, 3 is a MEASURED zero misread as absent. Clef
edge (94.77161 → 102.77161) and lyric height (117.84826 → 124.27394) landed; the stem site
moved nothing anywhere and was reverted.

## 4. ⚠️ THE FIVE THINGS THAT WERE WRITTEN DOWN WRONG, AND HOW EACH WAS CAUGHT

This is the most transferable section of the checkpoint. Every one was a claim reasoned from
abcjs's source or from the reach of the code, and never measured.

| Claim | Reality | What caught it |
|---|---|---|
| "51 call sites must learn their drawn x" | **TWO.** `getTextSize.calc` takes an element at `draw/tempo.js:20` and `:32` and nowhere else | one grep |
| "a 0.765625 between two page-cursor frames" | **does not exist** — a probe overwriting its global per tune read tune 1 against tune 0's SVG | keying the probe by tune |
| "max the measurement, not the string" fixes the lyric lane | **no-op** — that loop runs per ELEMENT and a one-verse note has one lyric text | stash-and-measure |
| §3b.2: "a row of descenders advances like a row of capitals" costs something | **costs nothing** — `getBBox().height` is the LINE BOX, identical for `"A"`, `"gggpqy"`, `"Mg"` across 3 faces × 6 sizes | measuring the browser directly |
| §3b.4: dead vendor prefixes are worth removing non-strict | **not reachable** — they are in compat's root markup, and compat is strict by construction | building the gate and finding it dead |

⭐ **A WRONG SIZE IS WORSE THAN A WRONG CAUSE.** A wrong cause gets tested and falls over; a
wrong size stops the work being attempted at all. Two of the five above were sizings, and both
went into a handoff as decisions for the owner.

## 5. THE HARNESS

    scripts/zzlive.mjs        both engines in ONE page, all 691 — ENGINE=chrome for the other
    scripts/zzpair.mjs        one fixture, element by element, ALONE
    scripts/zzwarm.mjs        the same, with the page PRE-WARMED — for shared-page defects
    scripts/zzcontrol.mjs     ladders: size · dirs · tempo · lyricfont · abc
    scripts/zzextended.mjs    the four non-strict properties, in a browser
    tests/extended-snapshot   691 digests, ABCTS_SNAPSHOT_RECORD=1 to re-record

**Setup** (`playwright-core` is NOT a devDep and `/tmp` gets cleaned):

    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
    cd <repo> && npm run build     # every gate loads dist/, not src/

⚠️ **PIN 1.61** — it names webkit-2311, the cached build. 1.55 and 1.62 each start a 90MB fetch.

## 6. THE RULES THIS TWO-DAY ARC ADDED

1. **SIZE AN ARC BY GREPPING THE REFERENCE, NOT BY REASONING ABOUT IT.**
2. **A PROBE ON A MULTI-TUNE FIXTURE MUST KEY BY TUNE.**
3. **A LADDER SHARING ONE DOCUMENT IS NOT A LADDER** — abcjs's `sizeCache` is module-scoped,
   so rung k inherits every rung before it. Reset the document per rung.
4. **A CONTROL MUST BE SHOWN TO SEE ITS DEFECT.** Stash the fix and count the reds. Four cuts
   of `zzextended`'s cache rung passed for the wrong reason before the fifth passed for the
   right one.
5. **STRICT-VS-EXTENDED IS NOT A MEASUREMENT OF A CHANGE.** The two already differ. The
   measurement is extended-BEFORE against extended-AFTER.
6. **AN UNEXERCISED GATE IS A PREDICTION.** Two were written, measured to move nothing, and
   reverted rather than landed.
7. **A GATE CAN WATCH THE WRONG MODE AND READ GREEN.** The extended ratchet's first cut passed
   `{mode: "extended"}` to `renderAbc`, which hard-wires strict — 691 strict digests. `tsc`
   caught it; run it BEFORE the test, not alongside.
