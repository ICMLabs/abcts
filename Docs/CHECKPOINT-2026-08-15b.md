# CHECKPOINT — 2026-08-15b

Continues `CHECKPOINT-2026-08-15.md`. That session took the 41-fixture byte gate from 13
differing to 1. This one closed that row, then found the gate was reading **two of the
five flavours the corpus is rendered in**, built the two features the other three needed,
and closed all of them.

**EVERY SVG BYTE GATE IS AT ZERO.**

---

## 1. THE GATES

| Gate | Start of session | Now |
|---|---|---|
| **SVG bytes, in-repo corpus** | 0 of 178 | **0 of 178** |
| **SVG bytes, sibling corpus** | 1 of 113 rows, ONE flavour | **0 of 356 rows, ALL FIVE** |
| `svg-bytes-sibling` ratchet | 112 | **356** |
| Audio events / timings / element timings / chord grids / MIDI | 0 of 72 / 38 / 13 / 23 / 3 | unchanged |
| Harvested geometry / pixel targets / DOM contract | 0 of 174 / 120 / 25 | unchanged |

Suite 1689/1690. **THE ONE RED IS NOT OURS** — `content-parity`'s `S7-voices`, a fixture
edited in `../abcMusicKit` on 2026-08-12 whose goldens were never regenerated. Do not
bisect it (`CHECKPOINT-2026-08-12.md` §5).

---

## 2. THE ENUMERATION, FOR THE SIXTH TIME

`dump-svg.js` writes a plain family and an `--add-classes` one and both take `--print`;
`dump-tunebook-svg.js` writes `-stacked` and `-stacked-print`. Counted over the sibling
repo's 507 goldens: **120 plain, 118 `-classes`, 117 `-print`, 12 `-stacked`, 12
`-stacked-print`**. The gate read the first two. It now reads all five, as 356 rows.

**A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION** — and this time the note beside the
hole was RIGHT about the cause and wrong about the conclusion: it said `-print` and
`-stacked` were "unbuilt features, not tolerances", which was true, and then left them
unbuilt. Both turned out to be an afternoon each, and each named real defects in code
that had been byte-exact for two days.

---

## 3. WHAT LANDED

### The `-classes` family — 111 differing to 0

1. **A `%%text` ROW'S CLASS IS GENERATED, NOT STATED.** `FreeText` gives every row
   `klass: 'defined-text'` (`elements/free-text.js:12, 29, 39`) and `renderText` runs
   `classes.generate` on it, so a `%%center` carries the LINE counter where a title's
   class is a flat literal from a table.
2. **…AND A TRAILING nonMusic LINE IS STILL A LINE.** `draw()` runs `classes.incrLine()`
   at the head of EVERY `tune.lines` iteration and `classes.reset()` before the bottom
   block (`draw/draw.js:30`, `:54-58`, `:61`), so a trailing `%%center` is `abcjs-l2` and
   a `W:` row carries no counter at all.
3. **A SUBTITLE IS A LINE OF ITS OWN THAT DRAWS NOTHING.** Every `T:` after the first is a
   bare `{subtitle}` entry in `abcTune.lines` — no `staff`, no `nonMusic`, so `draw()`'s
   loop matches neither branch and emits nothing — and the loop increments over it anyway.
   Instrumented: `DRAWLINE 0 staff false nonMusic undefined keys subtitle`. Six rows: a
   tune with one extra `T:` opens at `abcjs-l1`, `little swallow` at `abcjs-l2`.
4. **A BOTTOM-TEXT ARRAY BLOCK'S CLASS IS THE GROUP'S, NOT ITS ROWS'.** `addMultiLine`'s
   array branch pushes `{ startGroup, klass, name }` and `openGroup` writes `class` before
   `data-name`, while its `richText` rows are handed `''` (`bottom-text.js:37-57`). The
   STRING branch is the other way round, which is why `notes` and `history` were already
   right and only `W:` was not.
5. **`!class=name!` IS CARRIED TO THE GROUP.** `endGroup(klass, name, extraClass)` appends
   it INSIDE its `if (c)` (`draw/group-elements.js:45-59`), so it is dropped entirely
   without `add_classes` — which is why the plain goldens never witnessed it — and
   `absolute.js:42` runs before the `!mark!` swap at `:68-69`, so the order is
   `… n0 alice mark`. **The `ponytail:` on the parser line had named the exact golden that
   would witness it and said the `-classes` goldens were not gated.** They are now.

### `print` — a feature, and it opened at 8 of 110

`print: true` sets `tune.media = 'print'` (`abc_parse.js:525-526`), which `renderer.js:38`
reads as `isPrint`. **FOUR THINGS AND NO ENGRAVING CHANGE**:

- the page margins take their print defaults — 38px top and bottom, 68px either side
  against 15px all round (`renderer.js:69-72`);
- the whole SVG is CSS-scaled 0.75, and the four margins, the music width and the
  header/footer font sizes are divided by that scale FIRST so they do not shrink with it
  (`engraver-controller.js:124-126, 214-217`, `renderer.js:78-86`);
- `TopText` opens with a `spacing.top` row, 30.24px (`top-text.js:17-18`);
- the page is at least 11 inches tall — `max(h, 1056)`, on the SVG's own size and nothing
  inside it (`draw/set-paper-size.js:4-5`) — and `setSize` is handed `w / scale` and
  `h / scale`, so the two divisions cancel on the WIDTH and leave the floor as the only
  thing the height gains.

Then the four defects it exposed, none of which any other flavour could state:

6. **`spacing.top` IS SPENT EVEN WHEN THE TOP BLOCK IS EMPTY** — `TopText` pushes it
   before it looks at the title, so a TITLE-LESS tune, whose block the `headingless`
   branch skips entirely, still spends it.
7. **A BRACE'S OWN VOICE NAME IS PLACED AT THE RENDER'S PADDING.** It is the one thing the
   emitter positions absolutely and it read the screen constant, so `ave-verum-corpus`
   put `Organo` at 15 where abcjs writes 90.67.
8. **A CARRIED ENDING'S LEFT EDGE GOES IN RAW**, as its right edge already did.
   `drawEnding` calls `roundNumber` on `linestartx` only inside `if (params.anchor1)`
   (`draw/ending.js:13-26`). Invisible on screen, where `15 + 10` rounds to itself; in
   print it is `90.66666666666667 + 10`. **A RULE PORTED IN HALF**, for the sixth time.
9. **A TEMPO MARK IS BUILT AT DRAW TIME, FROM THE SOLVED x.** `drawTempo` takes
   `params.x` and walks its own cursor over it (`draw/tempo.js:5-38`); every other prefix
   element is PLACED with constructed offsets, and this one has none because abcjs never
   computes them until it has the x. The prefix builder's provisional x and the line
   solve's are two accumulations of the same widths and disagree in the last bit —
   `163.2626666666667` against abcjs's `163.26266666666666` — which rounded text hides and
   the beat-unit notehead's RAW path does not. **And the prefix now PLACES rather than
   SHIFTS**: `shiftElement(el, solved − built)` carried a −2.8e-14 delta onto every child.

### `stacked` — a second feature, opened at 19 of 24

abcjs's public API has no entry point: `renderAbc` gives each tune its own
`EngraverController` and its own `<svg>`, while a stacked render is
`new EngraverController(div, params).engraveABC(allTunes)` — ONE controller, one renderer,
every tune drawn down the same page (`engraver-controller.js:105-118`). `renderTuneBook`
is that, in `compat`.

Three rules, all **measured off `tunebook-3-stacked.svg` before a line was written**:

10. **THE PAGE CURSOR IS ONE WALK.** `renderer.y` runs through every advance of every
    tune, so `LayoutOptions.pageTop` seeds each tune with the one above's `endY`. The
    first attempt added per-tune TOTALS — `Σ(height − padding.bottom)` — which is right to
    the pixel and re-derives the sum: **19 of the 24 stacked goldens differed by one ULP**,
    and threading the cursor took that to 1. **A TOTAL IS NOT A WALK**, which is the same
    finding as `calcHeight`, `topAdvances` and `minx` in different clothes.
11. **THE `<style>`/`<title>` PAIR REPEATS, IN REVERSE TUNE ORDER.** `setPaperSize` runs
    per tune and both `setTitle` and `insertStyles` PREPEND to the `<svg>`
    (`write/svg.js:26-31`, `:88-93`), the style last — so a three-tune book opens
    `style, title(tune 2), style, title(tune 1), style, title(tune 0)` with the bodies
    after them in FORWARD order.
12. **THE ROOT TAKES THE LAST TUNE'S WIDTH AND `aria-label`**, not the widest or the
    first, because the last `setPaperSize` wins. And **`data-index` RESETS per tune**
    (0…7, 0…11, 0…13), so the selectable counter stays inside the loop.

13. **AN ACCIDENTAL RESERVES IN PITCH.** `create-note-head.js:102` states the box as
    `pitch ± h / 2` where `h` is `symbolHeightInPitches` — a PITCH count — and ours stated
    it in y, which costs a multiply and a divide the pitch form does not. On a page 3000px
    down that is one ULP of `staff.top`: `15.898322580645162` against `15.89832258064516`.
    **No standalone render can show it** — the smaller absolute y rounds it away — so it
    survived 178 + 334 byte-exact rows and appeared only once a STACKED book put the same
    staff three thousand pixels down. Found by walking both engines' per-staff
    `absoluteY` (28 rows, one differing) and then both `_addChild` pushes into it.

---

## 4. WHAT IS LEFT

Nothing on any SVG table. The open items are API SURFACE and one model gap, none of them
gated by anything in this repo:

1. **The audio compat surface.** `setUpAudio`, `setTiming`, `millisecondsPerMeasure` and
   `getTotalTime` are not on `AbcjsParams`/`TuneObject`, though the implementations exist
   in `src/audio/flatten.ts`, `src/audio/timing.ts` and `src/audio/midi-file.ts` and are
   byte-exact against abcjs's own oracles.
2. **The metadata surface.** `TuneObject` exposes `{svg, score, metaText:{title?}}` where
   abcjs's carries `formatting`, `lines`, `media`, `metaText`, `metaTextInfo`, `version`
   and 21 methods.
3. **A partly-tied chord re-articulates in the AUDIO.** The flattener reads `tiedToNext`
   alone, so `[B-eg-b-]` sounds every head again. The renderer has the per-pitch rule
   (`Chord.tiedPitches`); no audio gate covers one.
4. **`%%header` / `%%footer`** are print-only and no fixture in either corpus sets one, so
   they are unimplemented rather than measured. Same for **`%%scale`**, which `print`
   would take over abcjs's 0.75.

---

## 5. THE HARNESS ADDED THIS SESSION

Ours: `ABCTS_ABSY` (each staff's walked `absoluteY`, which is what named finding 13),
`scripts/zzpm.ts` (a sibling fixture in PRINT media) and `scripts/zzs.ts` (a sibling
fixture STACKED), beside `scripts/zzc.ts`'s `add_classes`.

abcjs, in the SCRATCHPAD COPY at `/tmp/gp/abcjs` (NEVER `../abcMusicKit`):
`ABCJS_DRAWLINE` (every `tune.lines` entry with its keys — this is what showed a subtitle
line), `ABCJS_TEMPOX` (`drawTempo`'s `params.x`, its post-preString cursor and each
child's `dx`), `ABCJS_STACK` (`renderer.y` before and after each tune of a book).

**And `/tmp/gp/walkbook.js`** — `dump-tunebook-svg.js` with its abcjs path made
overridable by `ABCJS_PATH`, which is how a STACKED render can be instrumented at all.

---

## 6. THE RULES THIS SESSION PAID FOR

- **A NOTE THAT SAYS "UNBUILT, NOT A TOLERANCE" IS STILL A NOTE THAT STOPS THE ROW BEING
  READ.** Both unbuilt features were an afternoon, and both found defects in code that
  had been byte-exact for days.
- **A TOTAL IS NOT A WALK.** Stacking by per-tune heights is right to the pixel and one
  ULP wrong on 19 of 24 rows. Thread the cursor.
- **A DEFECT CAN NEED A BIGGER PAGE TO BE VISIBLE.** The accidental's y-form reserve is
  wrong everywhere and only expressible three thousand pixels down.
- **PRINT THE SAME QUANTITY FROM BOTH ENGINES IN ONE SITTING**, still. Findings 9, 10 and
  13 are each two lists compared row by row — the tempo's cursor, the inter-tune cursor,
  the per-staff `absoluteY`.
- **A `ponytail:` THAT NAMES THE GOLDEN THAT WOULD WITNESS IT IS A WORK ITEM.** The
  `!class=` one had been sitting on the exact fixture that closed it.
