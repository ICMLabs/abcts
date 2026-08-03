# abcts — Checkpoint, 2026-08-03b

Supersedes `CHECKPOINT-2026-08-03.md`, which stays as the record of the declared-box idea,
the two corpora and the four gate artefacts. **Two of its statements are corrected below**
and both corrections came from measuring the output.

Read this, then `VERTICAL-ARC.md`, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE

| lane | state |
|---|---|
| `main` | vertical arc v1 merged. GREEN 505/505. Untouched. |
| `geometry/horizontal` | closed, GREEN 505/505. Untouched. |
| `geometry/vertical` | **THE OPEN ARC. 683 of 684**, and the one red is `ragtime-nightingale`'s `oy`, unchanged at 1.96 against 0.59 and NOT raised. |

| corpus | standing |
|---|---|
| 41-fixture | **21/29** exact on all four axes at 0.05px (was 20). Only EIGHT are off any axis, only FOUR off a vertical one. |
| harvested (174) | **172/174** content-correct; within 0.05 / 1 / 5 / 25px unchanged at 72 / 83 / 91 / 116. |
| `ragtime-nightingale` extents | **39 of 46** staves match abcjs's own `staff.top`/`.bottom`. |

---

## WHAT LANDED

### 1. The lyric block is subtracted from the INK, not maxed against the drawn baseline

abcjs runs the whole lyric question off ONE number — `staff.bottom` at
`set-upper-and-lower-elements.js:51`, before the lyric, chord and dynamic lanes and before
the `TieElem` push. It DRAWS at that ink (`:244`) and SUBTRACTS from it (`:54`), so two
staves that share an ink bottom get the same answer whatever else their music carries.

`anchorLyrics` measured its own ink instead, with a hand-picked subset of the furniture (no
tuplet boxes) and with lanes the lyric phase has not reached. Probed on `little swallow`,
abcjs subtracts a flat **11.1265 pitch** from all five staves; we subtracted
**11.13 / 11.13 / 10.63 / 11.13 / 9.17**, and the two that drifted are the two carrying the
most furniture.

`verticalExtent` now returns that ink as `inkBottom` and `anchorLyrics` reads it. All five
staves land within **0.025 pitch** of abcjs's own `staff.bottom`, from 1.96 out on the
worst. **`little swallow` dy 1.92 → 0.32, oy −0.58 → 0.16.**

**The general lesson: a second measurement of the same quantity is a bug waiting.** The two
calls had drifted apart in what furniture they were given and in which phase they stopped
at, and nothing could see it. The formula itself was never wrong.

### 2. The tempo mark's beat-unit note

Two causes, one symptom — the ONE stem in `ragtime-nightingale` that abcjs draws and we did
not.

- **A bare `Q:80` left `beatUnit` null**, so nothing was drawn beside the rate. abcjs defers
  a unit-less `Q:` because the `M:` may not have been read yet, and `calcTempo` finishes it
  with `1 / meter.denominator` (`abc_parse_header.js:139-150`) — **the METER**, with the
  `default_length` alternative commented out beside it. Ragtime is `M:2/4 L:1/4` and abcjs
  draws a QUARTER. Resolved in `ScoreBuilder.finish`, where the meter is known.
- **The note we did draw was full size with a staff-length stem.** abcjs's is a 0.75
  miniature five pitches below the reserved top, its stem a flat 3.5 pitch off the scaled
  head's right edge, with `note.w + 5` before the rate (`tempo-element.js:24-59`,
  `draw/tempo.js:29`). Measured against its own SVG, all four now to 0.01px: head centre
  2.625px above the rate's baseline, stem y 98.52→112.09, rate at x 128.56.

No pixel-gate movement — **the tempo notehead carries no class in either engine**, so the
notehead gate cannot see it. Twelve baselines re-recorded. Flags and dots on the beat-unit
note stay unimplemented with the probed constants recorded at the site.

**A parser test asserted `beatUnit: null` for `Q:120`.** It asserted abcjs was wrong and is
corrected — the third such on this branch.

---

## TWO CORRECTIONS TO THE PREVIOUS CHECKPOINT

### "942 beamed stems against our 940" — NO. It is ONE stem, and it was the tempo's.

Measured from the two SVGs: **1017 stems against our 1016.** Walking the two sequences
finds exactly one difference and it is `<path data-name="stem">` at x 123.26, inside
abcjs's `data-name="tempo"` group. Everything after it is a clean one-index offset.

The 942/940 figure was arrived at some other way and the conclusion drawn from it — "two
beamed notes differ, which is also what throws the beam lists out of alignment from index
195" — was an inference from a number that did not mean what it was read to mean. **A count
you cannot re-derive from the output is not a measurement.**

### The beam lists DO diverge at 195, but not for that reason

Probed both engines' beam layout directly (`layout/beam.js` `addBeam` on abcjs's side,
`ABCTS_PROBE`'s `BEAM` line on ours): **292 beams each**, and aligning the two sequences on
`(up, n, startY, endY)` gives exactly **THREE** events in the whole fixture. Every other
beam matches `startY`/`endY` exactly. `beam.min`/`beam.max` disagree on 202 of them without
changing the result — see the rest finding below for why.

---

## THE TWO REAL BEAM DIVERGENCES IN RAGTIME — diagnosed, not fixed

### A SHORT REST WITH NO PRECEDING SPACE IS TRANSPARENT TO BEAMING

`tune-builder.js:172-203` is a chain of `else if`s and **a short rest carrying no
`end_beam` falls through every one of them**: it neither starts a beam nor ends one, so the
run continues straight across it. The branches that DO fire for a rest are `dur >= 0.25`
(ends on the previous note) and `end_beam` — which a SPACE sets — where a rest takes
`endBeamLast` and a note takes `endBeamHere`.

`BeamElem.add` still takes the rest (`beam-element.js:54-67`), so it counts in
`elems.length`, in `total`/`average`, and in `min`/`max`. That is why our `beam.min`/`.max`
disagree with abcjs's on 202 beams — abcjs's carry rest pitches — and `elems.length` feeds
`maxSlant = numElements / 2` in `calcYPos`, so the rest can change the geometry too.
`createStems` skips it (`if (elem.abcelem.rest) continue`), so it contributes no stem.

**The site**, ragtime line 106:

```
[de]/4[de]/4x/4[de]/4- [de]/ x/
```

An INVISIBLE rest, unspaced, mid-run. abcjs makes ONE beam of five —
`d+e d+e rest d+e d+e`, `startY 19 endY 19`. We make two of two at `startY 17`. Note the
`x/` at the END of the same bar: it has a space before it, so `end_beam` fires and abcjs
breaks there — both halves of the rule in one bar.

Ours: `beamAfterEmit` in `parser.ts` closes the run on any rest, with the comment "A space,
barline, rest, longer note … breaks the run". The rest clause is wrong.

**This is not a small change.** Making rests transparent is one line; making them MEMBERS —
which is what abcjs's average, min, max and count all see — reaches `setBeamGroup` (which
refuses rests today), the `members` filter in `beamPos`, and the beam-geometry inputs. Do
it as a whole or not at all, and re-measure all 292.

### A TWO-NOTE GRACE GROUP IS BEAMED

Ragtime line 108, `{=de}` — abcjs lays a beam over it (`up=true n=2 startY 13 endY 14
startX 313.46`, its members printing as neither `pitches` nor `el_type` because grace beams
carry generic objects, per `createStems`'s own comment). We emit no beam for it at all.

---

## RAGTIME'S 4.09px OF PAGE DRIFT IS TWO STAVES

Comparing every staff's TOP LINE in both SVGs — the honest signal, and it tracks the
notehead deltas band for band:

| staves | ours − abcjs |
|---|---|
| 0–8 | ±0.03 — exact |
| 9–36 | **−1.78 to −1.90** |
| 37–45 | **−4.00 to −4.25** |

Two steps, two causes, and the extent table names both:

| staff | abcjs | ours | what |
|---|---|---|---|
| 8 | bottom −7.9748 | −7.5000 | the step at staff 9 |
| 37 | top 14.6277 | 14.0529 | the step at staff 37 |
| 16, 34, 42 | tops 26.5118 / 35.6574 / 26.5295 | 26.3038 / 35.5939 / 26.4449 | wobble, ≤0.21 pitch |
| 24 | bottom −7.9688 | −7.5000 | absorbed by the separation minimum |

**Fix those two and `oy` collapses** — the notehead mean IS this drift: −0.01 in the first
band, −1.8 in the middle, −4.2 at the foot, weighted to −1.96. Two mis-paired heads at
i=1498/1500 (+29.12 / −29.02) are the whole of `dy` 58 and change the mean by nothing.

### Staff 8 is a below-curve, and IT IS NOT THE BEAM either

Its bottom is set by a `TieElem.getYBounds` box — `top = min(startY, endY)`,
`bottom = top − 3` (`tie-element.js:228-251`). Probed on both sides:

| | startY | endY | → staff bottom |
|---|---|---|---|
| abcjs | −3.8997 | −4.9748 | −7.9748 |
| ours | −4.0000 | −4.5000 | −7.5000 |

Both engines take `calcSlurY`'s beamed branch (`parent.fixed.b`, our `beamPos` says
`middle` for both ends), and **the beams in that region agree** — the only three beam
divergences in the fixture are the two above. So the difference is in what `fixed.b`
resolves to, not in where the beam is. Ours are exact halves where abcjs's are fractional,
which says ours is not reading a beam-retargeted stem end at all. **That is the next thing
to probe, and probe the MECHANISM: print our `fixedOf` inputs beside abcjs's `fixed`.**

One thing to check first: abcjs builds **169** `TieElem`s here to our **64**, because it
makes one per CHORD NOTE where we make one per chord. The extra ones reserve less deep and
none of them bind — but confirm that before assuming the two engines are comparing the same
curve.

---

## THE HARVESTED CORPUS, RANKED BY WORST AXIS

Measured this session; the top of the list is not the directive tail the last checkpoint
led with. Everything below is a fixture's worst of `dy`/`dx`/`|oy|`/`|ox|`, px:

| worst | fixture | what it looks like |
|---|---|---|
| 496.88 | `visual-layout-09-endings` | `%%score` + `%%voicecolor` |
| 342.67 | `visual-parsing-09-score-t-b` | `%%score` |
| 300.30 | `visual-tablature-17-stretchlast` | |
| 241.15 | `visual-wrap-02-stretchlast-1` | pure `dx` |
| 228.85 | `visual-options-01-fonts` | the 18-font fixture |
| 158.06 | `parse-tie-slur-01/02/03-staffwidth-200` | `%%staffwidth`, pure `dy`/`oy` |
| **45.19** | `visual-misc-09 / -10 / -11-begintext` | **pure `oy`, all three identical** |

`%%begintext` is the cleanest vertical item in the whole list: three fixtures, one
mechanism, one number. abcjs renders the block as a `FreeText` — `{move: 7.56}` then
`{move: fontSize / 2}` then the row then `{move: size.height}`
(`creation/elements/free-text.js`), textfont at 21px, drawn left-aligned at `paddingLeft`.
Its golden is a single `<text data-name="free-text" x="15" y="54.06">`. We discard the
block's content at parse (`parser.ts`, an existing `ponytail:`), so the music rides 45.19px
high. `%%text` (4 more fixtures) is the same machinery.

`abcjs-visual-misc-01-barnumbers-1` is `Z24 | F2 |` — a MULTI-MEASURE REST, not a bar-number
problem. Its `dx`/`dy` of 0.00 are an artefact of having one paired notehead.

---

## TRAPS PAID FOR THIS SESSION

1. **A COUNT YOU CANNOT RE-DERIVE FROM THE OUTPUT IS NOT A MEASUREMENT.** "942 beamed
   stems" was carried forward for a session and named the wrong subsystem. Diffing the two
   SVGs settled it in one command.
2. **abcjs CLASSES ALMOST NOTHING.** Its only classes are `abcjs-notehead`,
   `abcjs-chord-pos-N`, `abcjs-ledger`, `abcjs-stem`, `abcjs-top-line`. Beams, tempo notes,
   ties, brackets and bar numbers carry NO class — so anything class-based cannot see them,
   and that is exactly why the tempo note went missing under a green gate.
3. **`NoteAnchor` HAS NO `.x`** — it has `.left` and `.right`. A probe that reads `.x`
   throws inside `layout`, and behind a `| grep` the render dies silently and prints
   nothing at all. Run a new probe once WITHOUT a pipe.
4. **Read OUR extent from the stacking loop's `PROBE staff` line**, not from inside
   `verticalExtent`. Still true, still the fastest way to scramble a comparison.
5. **`probeBottom` names the last `include()` that raised the bottom — not the final
   answer.** The lyric block, the lanes and the curve boxes are applied after the include
   loop and never appear in it. Read the printed `bottom=`, use `bottomBy=` only as a hint.
6. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 683/684; the ONLY expected failure is
                                      #   ragtime-nightingale's oy. Anything else is yours.
npm run parity
```

Baselines: `npm run baseline`, READ the diff, commit them with the code.
`npm run lint` has pre-existing findings in `tests/staff-spacing.test.ts` and in the
harvested goldens' inline CSS; check your own files with
`npx biome check <paths>` instead.

### The probes, unchanged

```bash
# abcjs — env-guarded log in the vendored source, then its own harness. Fully reversible.
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

The ones that paid this session: `set-upper-and-lower-elements.js` at the POST point
(staff extents), its `TieElem` case (`getYBounds`, `startY`/`endY`, both anchors' `fixed`),
`layout/beam.js` at `addBeam` (every beam's inputs and ends, plus its members' pitches and
durations — that last field is what named the invisible rest), and `draw/tempo.js` at
`params.note` (the beat-unit note's children, in pitch).

On our side, `ABCTS_PROBE=1`.
