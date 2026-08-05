# abcts — Checkpoint, 2026-08-05

Supersedes `CHECKPOINT-2026-08-04c.md` for the STATE. That file keeps findings 51–70 and
the ladder method; `-08-04b.md` keeps 41–50, `-08-04.md` the expensive lesson, and
`-08-03d.md` the ledger for 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔴 AUDIT FINDING — START HERE. STRICT MODE DRAWS BRAVURA'S LINE WEIGHTS.

**Every line abcts draws in `abcjs-strict` is the wrong thickness**, by up to a factor of
two, and no gate can see it.

`ENGRAVING_DEFAULTS` in `src/renderer/glyphs.ts:45-59` is **Bravura's** engraving metadata.
It is read at **22 sites** in `layout.ts` and **not one of them is gated on `strict`**:

```bash
grep -c "ENGRAVING_DEFAULTS" src/renderer/layout.ts        # 22
grep -c "strict.*ENGRAVING_DEFAULTS" src/renderer/layout.ts # 0
```

Measured against abcjs's OWN goldens — not read from its source, measured off the emitted
path geometry:

| element | abcjs | ours | error | where abcjs says so |
|---|---|---|---|---|
| **thin barline** | **0.600 px** | 1.2400 px | **+107%** | measured, `simple-c.svg`; `linewidth: 0.6` at `abstract-engraver.js:992` |
| **ledger line** | **0.700 px** | 1.2400 px | **+77%** | measured, `simple-c.svg` ledger path |
| **staff line** | **0.700 px** | 1.0075 px | **+44%** | measured, `simple-c.svg`; `printStaff(…, dy = 0.35)` + `lineThickness` 0 |
| **stem** | **1.000 px** | 0.9300 px | −7% | measured, `simple-c.svg` stem paths |
| thick barline | 4 px | 3.8750 px | −3% | `linewidth: 4`, `abstract-engraver.js:1007` |
| beam | 3.875 px | 3.8750 px | **0%** | `calcDy` returns `spacing.STEP` — a coincidence, and the only one that matches |

**WHY NO GATE CAUGHT IT.** `pixel-parity` compares glyph bounding-box CENTRES, and a line's
centre does not move when its thickness changes. `baseline.test.ts` records our own
geometry, so it locked the wrong weights in. This is the same blind spot that once hid a
missing tempo note under a green gate, and the same shape as the four "golden artefacts"
that turned out to be ours.

### WAS THIS AUTHORISED? Partly — and the part that matters was not.

- **Bravura as the glyph OUTLINE source: YES.** `ARCHITECTURE.md` §"Glyph source — inline
  SVG paths", dated 2026-07-19, records it as escalated ("needs a human") and settled, with
  the reasoning (self-contained SVG, no 380KB woff2). That decision stands.
- **It was later narrowed:** `glyph-table.ts` gives `abcjs-strict` abcjs's OWN outlines at
  abcjs's OWN advances, and Bravura only serves `abc2.1`/`extended`. So for glyph SHAPES in
  strict we already do not use Bravura. `ARCHITECTURE.md:292` — "Bravura against abcjs's own
  font is the intended difference" — describes the state BEFORE that narrowing and is now
  stale for strict.
- **Bravura's LINE WEIGHTS in strict: NO RECORD ANYWHERE.** Not in `ARCHITECTURE.md`, not in
  any checkpoint, not in a code comment. `ENGRAVING_DEFAULTS` was wired up when there was
  one glyph table and one mode, and the strict/Bravura split went in around it without ever
  reaching the line weights. It is a leftover, not a decision.

### WHAT TO DO

Port the six weights into `abcjs-constants.ts` as `ABCJS_PX` entries and gate the 22 sites
on `strict`, exactly as `glyphsFor(strict)` already gates the outlines. `abc2.1` and
`extended` keep Bravura's, which is what they are for.

**It needs a probe that is not the pixel gate.** Compare emitted line THICKNESSES per class
against the goldens' — the measurement in the table above, generalised. Add it as a gate in
the same commit, or the next agent will re-lock the same blind spot.

---

## STATE

| corpus | standing |
|---|---|
| 41-fixture | **24 of 29 at ZERO on all four axes.** One gate failure: `ragtime-nightingale`'s `oy` at **0.661** against 0.59. NOT raised. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **140 / 153 / 165 / 172**, from 114 / 130 / 144 / 169 at the start of 2026-08-04. **34 of 174 off some axis, from 60.** |
| suite | **691 of 692.** The one red is ragtime's `oy`. Anything else failing is yours. |

Nothing above 17px on the ranked table, and the only item above 10 is a FEATURE
(`%%setfont`'s rich text).

**ONE CEILING WENT UP** on this branch, a tenth of a pixel — ragtime's `dx`, 16.43 → 16.53,
on finding 68. Recorded rather than masked; the reasoning is in the test.

---

## THE GOLDEN VARIABLES ARE IN ONE FILE

`src/renderer/abcjs-constants.ts`, grouped by the unit **abcjs** states each in:

| group | what |
|---|---|
| `ABCJS_PX` | 37 figures abcjs writes as PIXELS |
| `ABCJS_PITCH` | 17 it writes in PITCH — half a staff space |
| `ABCJS_RATIO` | 11 unitless |

plus the unit system (`STAFF_SPACE_PX`, `STEP_PX`, `PITCH_ORIGIN`, four converters),
`GOLDEN_TEXT_HEIGHTS`, three lookup tables, and re-exports of `golden-widths.ts` and
`ABC_FONT_DEFAULT_PT`.

**ANYTHING NOT IN THAT FILE IS OURS** — *Behind Bars* stem lengths, slur bulge, dot
spacing, the spacing curve, the fixed lanes. A golden variable may only change if abcjs
changes. `chordHeightAbove` is 4.78 PITCH, 2.39 spaces and 18.52px, and only one of those
is right in any given expression — which is why the grouping is by unit.

The extraction re-recorded 44 baseline files and changed **zero lines**. That is the test
that a constants refactor is honest, and it is the test the line weights above will need.

**`ENGRAVING_DEFAULTS` IS THE COUNTER-EXAMPLE**: Bravura's numbers, in a file of ours, used
in strict. It is the reason the audit finding exists — a golden variable that was never
recognised as one.

---

## FINDINGS 69–70 (the rest are in `-08-04c.md`)

### 69. THE NEAR-MISSES ARE EMISSION QUANTISATION, NOT ARITHMETIC ORDER — MEASURED

Every residual read as exactly 0.01px, which is not what float drift looks like: `byClass`
rounds BOTH engines to 2dp (`pixel-geometry.ts:279`), so a real 0.004 shows as 0.01 or 0.00.
Unrounded they were 1e-3 to 5e-3.

**The decisive experiment** — raise the emission quantum and see where it converges:

| quantum | worst notehead residual |
|---|---|
| 1e-3 staff space (was) | 5.1e-3 px |
| 1e-4 | 5.7e-4 px |
| 1e-5 (now) | **1.5e-4 px** |
| 1e-6 | 1.4e-4 — no gain |

It COLLAPSES, so there is **no arithmetic order-of-operations difference**: our internal
values agree with abcjs's to 1e-8, double noise. That kills the standing suspicion that
computing in staff spaces where abcjs computes in pixels was costing accuracy.

What differs is WHERE the quantum is spent. abcjs writes one absolute pixel per element; we
write a nested chain — system translate, staff translate, element offset, viewBox — each
quantised, errors ADDING. Cost of the fix, measured on ragtime: 1.0% of bytes.

**AND A GLYPH SCALE IS A RATIO, NOT A COORDINATE.** `1 / 7.75` was emitting as `0.129` — a
quarter of a per-mille multiplied by every number in the outline, 0.0012px on a clef. Full
precision now (`scaleNum`).

A floor of **1.4e-4px** remains on one notehead of `cd|`; it is the spring solve, and a
seventieth of abcjs's own rounding quantum.

### 70. ABCJS ROUNDS ITS LINES AND NOT ITS GLYPHS

`printLine` runs every staff line, ledger and bar coordinate through `roundNumber` —
`parseFloat(x.toFixed(2))` — while a glyph path is translated by an unrounded number
(`draw/print-line.js:7-10`). That is why a notehead agrees to 1e-8 and the top staff line
to 0.002: **the 0.002 is abcjs's quantisation and our value is the exact one.** Reproducing
it needs rounding in PIXEL space, which our viewBox-based unit system does not have.
Recorded as a divergence.

---

## WHAT IS LEFT, ranked

```
 —     THE LINE WEIGHTS. No number, because no gate measures them. See the audit above.
16.91  dy= 0.0 dx=16.9 oy= -3.5 ox= 4.6  visual-misc-06      [%%setfont] — RICH TEXT
 9.60  dy= 0.0 dx= 0.0 oy= -9.6 ox=-0.0  visual-tablature-10 grace before a `y` spacer
 7.21  dy= 0.0 dx= 7.2 oy= -0.0 ox=-4.3  mouse-click-01 / tablature-15   [%%sep, %%text]
 6.67  dy= 4.0 dx= 6.7 oy=  1.0 ox= 2.0  visual-selection-01 / svg-per-line-01
 6.21  dy= 0.0 dx= 0.0 oy=  6.2 ox=-0.0  synth-flattener-17  A GRACE BEAM
 5.74  dy= 0.0 dx= 0.0 oy=  5.7 ox=-0.0  synth-flattener-32  quarter tones
```

### NEXT, in order

1. **THE LINE WEIGHTS**, with a thickness gate beside them. See the audit.
2. **`%%setfont-N` and `$N` rich text** — the only measured item above 10px.
   `parseFontChangeLine` (`abc_parse_directive.js:727-748`) splits a header field on `$`,
   maps each `$N` to `multilineVars.setfont[N]` and returns an ARRAY of `{font, text}`
   phrases; `richText` lays them side by side with `largestY` setting the row height. `$$`
   is a literal `$` via a `\x03` swap. Runs on `T: C: O: A: P: H: N: W:` and
   `%%text`/`%%center` — NOT on chord symbols.
3. **A GRACE GROUP OF MORE THAN ONE NOTE IS BEAMED.** `addGraceNotes` builds a
   `BeamElem(round(stemHeight * 3.5/5), "grace", isBagpipes)` when `gracenotes.length > 1`
   (`abstract-engraver.js:466-478`); a grace beam's `dy` is `STEP * 0.4`; `forceup` is
   always true. We draw loose flagless stems of fixed length. `{efg}ag` is 6.21px.
4. **`visual-tablature-10`** — the grace before a `y` spacer. A MODEL decision: `Rest` now
   carries a chord symbol, so the same argument applies to `graceNotes`.
5. **`mouse-click-01` / `tablature-15`** — 7.21 of dx, `%%sep` and `%%text` between systems.
6. Then Gonzato, then audio.

### STILL NEEDING A DECISION

- **The gate hides failures** — eight per-fixture assertions in one `it`, so the first to
  fail ends it.
- **`frere-jacques`'s `M:` arrives after prose**, so `score.meter` is NULL. The honest fix
  is a line for the prose.
- **The overlay pad's second rule**, and the **leading-header split**
  (`parse-book_parser-04-wed`, the one TUNE COUNT mismatch).

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 691/692; the ONLY expected failure is ragtime's oy
npx biome check src tests/corpus-abcjs.test.ts tests/pixel-parity.test.ts
npm run baseline                      # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short  # MUST be empty — read it, do not test the exit code
```

**`tests/fuzz.test.ts` has a WALL-CLOCK assertion** and flakes under full-suite load. Re-run
it alone before believing it.

**A COMMIT MESSAGE PASSED TO `git commit -m` IS SHELL INPUT** — a backtick-quoted
`V:… stem=up` was expanded away and the paragraph came out empty. Use `-F` with a heredoc.

**AND WATCH FOR A DELETED BLOCK.** A scripted edit replaced a region of `noteText` that
reached further than intended and took the whole LYRIC block with it; four harvested
fixtures jumped 40–68px. `git diff | grep '^-'` before committing a scripted rewrite.
