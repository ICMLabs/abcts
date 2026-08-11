# CHECKPOINT — 2026-08-11b

**abcts, `main`.** The suite is **1240/1240** with no reds, `npx tsc --noEmit` is clean,
everything below is committed and pushed.

---

## 1. THE STATE

| Gate | Ranked table | Now | Session start |
|---|---|---|---|
| Audio events | `abcts-audio-ranked` | **0 of 72** | 0 of 72 |
| Note timings | `abcts-timing-ranked` | **0 of 38** | 0 of 38 |
| Chord grids | `abcts-chordgrid-ranked` | **0 of 23** | 0 of 23 |
| MIDI files | — | **0 of 3** | 0 of 3 |
| Harvested geometry | `abcts-corpus-ranked` | **0 of 174** | 0 of 174 |
| Pixel targets | `abcts-pixel-ranked` | **0 of 120** | 0 of 120 |
| Element timings | — | 1 of 13 (abcjs's own quirk, NAMED) | 1 of 13 |
| DOM contract | — | **1 of 25**, 24 slugs RATCHETED | 1 of 25 |
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **82 of 171**, best 54030, median 8168 | 94 of 171 |

**`svg-bytes` is the one open gate**, `DIVERGENT` is still EMPTY, and **89 fixtures are
byte-exact — all 89 now RATCHETED**, up from seven. See §4.

---

## 2. THE LANDINGS

Five, and **four of them are one finding wearing four hats**: abcjs holds the vertical in
PITCH and multiplies by `spacing.STEP` exactly once; we held y and divided back. §3 of
`CHECKPOINT-2026-08-11.md` named that as the next architectural arc and this is it, done
for the vertical. The horizontal is untouched and is now the whole head of the table.

### A GLYPH'S y IS ONE VALUE BEFORE THE OUTLINE SEES IT — and the brackets are the finding
`printSymbol` computes `renderer.calcY(offset + ycorr)` — ONE number — and only then does
`pathArray[0][2] += y` (`draw/print-symbol.js:33`, `creation/glyphs.js:135`). Written flat
as `head + corrected * PX + oy`, JS associates LEFT and folds the outline's own origin in
before the staff's:

    -3.96 + -11.625  + 84.56   = 68.975                ← ours
    -3.96 + (-11.625 + 84.56)  = 68.97500000000001     ← abcjs's golden

**94 → 85 of 171 on one pair of parentheses.** The x needs none: `x * PX` is already the
whole term abcjs adds.

### A STAFF'S ORIGIN IS ONE PRODUCT OFF A PITCH
`renderer.moveY(spacing.STEP, staff1.top); staff1.absoluteY = renderer.y`
(`draw/staff-group.js:25-26`). Ours subtracted the extent's y — the same pitch already
multiplied, re-added. A block's span still has no pitch, so a staff carrying a heading keeps
the y form.

### `addStaffPadding` IS A PITCH SUM WITH ONE MULTIPLY, AND A TOP-UP NOT A MAXIMUM

    lastBottomLine     = -(lastStaff.bottom - 2)              // 2 is the bottom staff line
    nextTopLine        = thisStaffGroup.staffs[0].top - 10     // 10 is the top one
    separationInPixels = (nextTopLine + lastBottomLine) * spacing.STEP
    if (separationInPixels < staffSeparation)
      renderer.moveY(staffSeparation - separationInPixels)

(`draw/draw.js:84-92`.) Ours compared two ABSOLUTE y's —
`previousBottomLine + interSystemSep - topLineOffset` — four y's where abcjs has two
pitches. A fifth system's staff origin came out `445.06199999999995` against abcjs's
`445.062`, and **every glyph on that system carried the ULP.**

### THE INTRA-GROUP SEPARATION LIVES INSIDE `staff.top`, IN PITCHES

    thisStaffTop         = staff.top - 10
    forcedSpacingBetween = lastStaffBottom + thisStaffTop
    addedSpace           = systemStaffSeparation / STEP - forcedSpacingBetween
    if (addedSpace > 0) staff.top += addedSpace
    lastStaffBottom      = 2 - staff.bottom

(`layout/set-upper-and-lower-elements.js:82-92`.) **Which is why `calcHeight` can be a bare
sum of tops and bottoms and still be right** — its own `TODO-PER` says the separation is
missing, and it is not: it is already inside `top`. Ours clamped the y and divided the
difference back into `heightPitch`, so a tune whose three systems have identical staves
produced `35.18374193548387` for the first and `35.183741935483866` for the other two. The
first is the one whose cursor starts at `spacing.music`.

### THE PAGE IS ONE RUNNING CURSOR, SEEDED WITH `padding.top`
`draw()` opens `renderer.moveY(padding.top)` and every later move lands on that one number
(`draw/draw.js:14-92`). Ours held systems in their own coordinates and let the emitter add
the margin last — `(system + staff) + margin` where abcjs writes `((margin + …) + staff)`.
`LayoutStaff.absoluteY` is the cursor plus one `moveY`; the system-relative `originY` stays
beside it, because everything else in the layout is deliberately system-relative.

### A BEAMED STEM RESERVES THE BEAM'S OWN PITCH
`createStems` hands the stem `pitch2: bary` straight out of `getBarYAt`, which interpolates
two PITCHES (`layout/beam.js:122`), and `RelativeElement` takes `top`/`bottom` as
`max`/`min` of `pitch` and `pitch2` with no conversion (`relative-element.js:18-21`).

`CHECKPOINT-2026-08-11.md` §3 recorded that a beamed stem **must not** supply a pitch, and
that reading was right about the SYMPTOM and wrong about the cause: the stale value was the
UNBEAMED `p1`/`p2`, which the beam pass invalidates. The beam pass now writes the retargeted
end in pitch as well as in y. `visual-layout-04`'s staff top was `14.990393852065322`
against abcjs's `14.99039385206532`.

### THE ABOVE-STACK LADDER STARTS ON `staff.top` ITSELF
abcjs enters `setUpperAndLowerElements` with `staff.top` already a pitch — the max of the
elements' own declared pitches — and every `incTop` adds to it. Ours took the ink's y and
multiplied by `1 / STEP`.

**AND ON ITS OWN THAT WAS A WASH, WHICH IS THE INTERESTING PART.** It took
`visual-misc-13` OFF the byte-exact list. Its ladder start is `16.79987096774194` against
abcjs's `16.799870967741935` either way — the ULP was already there, in the ORNAMENT's own
reserve arriving as a divided y, and the reciprocal-multiply had been cancelling it. Two
more producers closed it:

- **A CLOSE DECORATION IS A POINT AT ITS OWN PITCH** — `new RelativeElement(symbol, deltaX,
  width, yPos)` with no options, so `top === bottom === pitch` (`decoration.js:47`).
- **A STACKED ORNAMENT DECLARES `thickness: symbolHeightInPitches(symbol)`**, so its box is
  `pitch ± thickness / 2` (`decoration.js:163`, `relative-element.js:22-24`).

**TWO ERRORS CANCELLING, for the fifth time on this branch** — and this one is the first
where the compensating pair was *a correct change and a latent defect* rather than two
defects. The lesson is the same either way: land the structure, then chase what it exposes;
do not read a wash as "no effect".

---

## 3. WHAT IS LEFT — the table's shape, measured

Classified by aligning on the FIRST DIFFERING CHARACTER and comparing the numeric token
that spans it (§4 of `CHECKPOINT-2026-08-11.md` has the recipe; a cruder test sends you at
the wrong family):

| | rows | ULP tokens | fixtures carrying them |
|---|---|---|---|
| **glyph x** | 34 | **265** | 33 |
| glyph y | — | 62 | 10 |
| root `width`/`height` | 9 | 6 | 6 |
| other | 5 | 8 | 7 |
| **structural** | **34** | — | — |

**33 fixtures are PURE ULP** — same token count, every difference under 1e-6.

### 3.1 THE HORIZONTAL IS NOW THE HEAD OF THE TABLE, and it is the same shape one axis over

`abcjs-visual-transpose-03` is down to ONE differing token in 55,703 bytes: a notehead's x,
`733.5559999999995` against `733.5559999999996`. Measured through both engines:

    abcjs   accidental  717.5159999999995   = absX - 9.95     (dx, a negative offset)
            notehead    727.4659999999996   = absX            (dx = 0)
    ours    accidental  717.5159999999995   ← exact
            notehead    727.4659999999994   ← 2 ULP low

**abcjs's `AbsoluteElement.x` IS THE NOTEHEAD'S x**, straight out of the solve, and the
accidental hangs off it at a negative `dx` — `RelativeElement.setX` is `this.x = x + this.dx`
(`relative-element.js:124`), one addition. Ours anchors the element's LEFT EDGE and builds
`headX = (x + graceWidth) + accidentalWidth`, three terms. That our accidental lands on
abcjs's value exactly and our head does not is the signature.

**What is NOT the problem, checked:** our justification is already abcjs's own shape — eight
passes, each re-running the whole line solve with a new spacing unit, the eighth discarded
(`layout/layout.js:65-79`; ours at `layout.ts:8673`). There is no scale-a-natural-layout
step to blame. The difference is inside one pass's accumulation.

**The probe that will answer it** is the one that answered the vertical: instrument
`VoiceElement.layoutOne`'s `child.setX(x)` in the scratchpad abcjs (§5) — it prints `x`,
`er`, `extraWidth` and `nextx` per element — and print the same terms from `lineAt`. Do NOT
instrument at `headX` in `layoutEvent`: that call site runs in the measuring passes and its
x is never the final one, which cost a run today.

### 3.2 THE STRUCTURAL THIRTY-FOUR
Unchanged from `CHECKPOINT-2026-08-11.md` §4.2, which lists each with abcjs's own citation.
The brace with a header (3 fixtures, `draw/brace.js:78-98`) is still the largest single one
and still needs no new model.

### 3.3 WHAT §3 OF THE PREVIOUS CHECKPOINT STILL OWES
- **`anchorLyrics` is not abcjs's placement**, so `lyricLanePitch` — measured, correct to
  the last digit — still cannot be spent. Untouched today.
- **Everything else is a producer that does not yet supply `reservePitch` / `pitchRange`.**
  Three landed today (the beamed stem, the close decoration, the stacked ornament). Ten
  fixtures still carry a glyph-y ULP; the list is in §5's probe output.

---

## 4. THE RATCHET NOW HOLDS EVERYTHING GREEN

`svg-bytes.test.ts`'s `PASSING` held **seven** slugs while **eighty-nine** fixtures were
byte-exact. Twice today a fixture went from byte-exact to differing **while the aggregate
count improved** — `parse-tie-slur-01` under the `addStaffPadding` port, `visual-misc-13`
under the ladder start — and neither was ratcheted, so the only thing that caught them was
diffing two runs of a scratch script by hand.

It now names all 89. **A ratchet holding 4% of what is green is a ratchet in name.**
Regenerate the list when a batch lands (`/tmp/gp/exact.mjs`, §5); never delete a row to make
a run pass.

---

## 5. THE HARNESS — unchanged, plus today's probes

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts        # every command, always
npx vitest run && head -1 /tmp/abcts-svg-bytes-ranked.txt
head -1 /tmp/abcts-pixel-ranked.txt    # must stay 0 of 120
head -1 /tmp/abcts-corpus-ranked.txt   # must stay 0 of 174
npx tsc --noEmit                       # BEFORE git commit, not alongside
```

abcjs itself, at the goldens' own `{ staffwidth: 670 }`:

```bash
cd ../abcMusicKit/Tools/abcjs-debug
ABCJS_VERSION=6.7.0 node dump-svg.js --add-classes --file x.abc --output x.svg
ABCJS_VERSION=6.7.0 node dump-elements.js --file x.abc
```

`ABCJS_VERSION` defaults to 6.6.3 and `--add-classes` is what makes the class scheme visible.
**And `dump-elements.js` LIES about `staff.top`** — it publishes it before
`setUpperAndLowerElements` mutates it.

### The scratchpad copy, which is what answered every finding above

```bash
rm -rf /tmp/gp/abcjs && mkdir -p /tmp/gp/abcjs
cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/. /tmp/gp/abcjs/
sed 's|^var abcjsPath = .*|var abcjsPath = process.env.ABCJS_PATH \|\| "";|' \
  ../abcMusicKit/Tools/abcjs-debug/dump-svg.js > /tmp/gp/walk.js
# then add a guarded console.error at the site you are asking about, and:
NODE_PATH=../abcMusicKit/Tools/abcjs-debug/node_modules ABCJS_PATH=/tmp/gp/abcjs \
  ABCJS_<FLAG>=1 node /tmp/gp/walk.js --file $PWD/tests/corpus-abcjs/fixtures/<slug>.abc \
  --output /tmp/gp/w.svg 2>&1 >/dev/null | grep '^<TAG>'
```

**NEVER instrument `../abcMusicKit` itself.** The four sites worth re-adding, each of which
named a finding today:

| file | site | prints |
|---|---|---|
| `write/renderer.js` | `moveY` | every page-cursor move with its caller — the whole vertical walk |
| `write/draw/print-symbol.js` | before `glyphs.printSymbol` | `x`, `offset`, `ycorr`, `calcY`, `renderer.y` per glyph |
| `write/creation/elements/relative-element.js` | `setX` | `absX`, `dx`, result — abcjs's x model in one line |
| `write/layout/set-upper-and-lower-elements.js` | `incTop` + the loop head | `staff.top` before, per rung, after |
| `write/layout/voice-elements.js` | after `child.setX(x)` | **§3.1's next probe** — `x`, `er`, `extraWidth`, `nextx` |

### Ours

```js
// /tmp/gp/r.mjs — render ONE fixture through our engine
import { readFileSync } from 'node:fs'
const { renderAbc } = await import('/Users/lrettberg/ICMLabs/Code/abcts/src/compat/index.ts')
console.log(renderAbc('paper', readFileSync(process.argv[2], 'utf-8'), { staffwidth: 670 })[0].svg)
```

Four more, all worth rebuilding rather than hunting for — each is ~20 lines over the corpus,
splitting `got`/`want` on `/(-?\d+\.?\d*(?:e[-+]?\d+)?)/` and walking the token pairs:

- **`/tmp/gp/tok.mjs <slug>`** — EVERY differing numeric token in one fixture with its
  context. This is what turns "the fixture differs" into "one token, and it is a notehead's
  x". Use it before anything else.
- **`/tmp/gp/cnt.mjs`** — per-fixture count of differing tokens and how many are ULP, sorted.
  Names the cheap fixtures and the `STRUCT` ones in one view.
- **`/tmp/gp/axis.mjs`** — every ULP token across the corpus tagged by AXIS (glyph-x,
  glyph-y, root, other) with a fixture count. **This is the table in §3** and it is the
  number to steer by: the fixture count can sit still while it halves.
- **`/tmp/gp/exact.mjs`** — the byte-exact slug list, formatted for `PASSING`.

**A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION**: `axis.mjs` skips any fixture whose
token COUNTS differ, so a fixture going structural silently leaves its table. Read it beside
`cnt.mjs`, never alone.

---

## 6. THE RULES THIS SESSION EARNED OR RE-EARNED

- **AN ASSOCIATION IS A DECISION.** `a + b + c` is `(a + b) + c`, and abcjs's grouping is
  part of the port. One pair of parentheses in the emitter closed nine fixtures.
- **A WASH IS NOT "NO EFFECT".** The ladder start was correct, cost a byte-exact fixture,
  and the fixture it cost was the one whose latent ornament defect the old wrong form had
  been cancelling. Land the structure, then chase what it exposes.
- **TWO ERRORS CANCELLING, five times now.** Ask it out loud whenever a correct-looking
  change moves nothing or moves the wrong way.
- **A RATCHET MUST HOLD WHAT IS GREEN, NOT A SAMPLE OF IT.** Seven of eighty-nine let two
  regressions through in one afternoon, and only a hand-diff of scratch output caught them.
- **THE AGGREGATE COUNT IS THE WRONG DIAL FOR AN ARITHMETIC ARC.** 85 → 85 hid a 180-token
  improvement; 82 → 82 hid a 48-token one. Count TOKENS BY AXIS while the family is ULP.
- **AN EARLIER CHECKPOINT'S "DO NOT TRY THIS AGAIN" CAN BE RIGHT ABOUT THE SYMPTOM AND
  WRONG ABOUT THE CAUSE.** §3 of `-08-11.md` said a beamed stem must not supply a pitch. It
  must — just not the unbeamed `p1`/`p2` the beam pass invalidates. Re-read the negative
  result against the source before treating it as closed.
- **DO NOT INSTRUMENT A SITE THAT RUNS IN A MEASURING PASS** and read its numbers as final.
  `layoutEvent`'s `headX` is called eight times per line with x's that never reach the page.
