# abcts — Checkpoint, 2026-08-03b

Supersedes `CHECKPOINT-2026-08-03.md`, which stays as the record of the declared-box idea,
the two corpora and the four gate artefacts. **Two of its statements are corrected below**
and both corrections came from measuring the output. Five fixes landed; the last three all
came off the harvested corpus's ranked list, which no gate summarises and which is the
first thing to re-run.

Read this, then `VERTICAL-ARC.md`, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE

| lane | state |
|---|---|
| `main` | vertical arc v1 merged. GREEN 505/505. Untouched. |
| `geometry/horizontal` | closed, GREEN 505/505. Untouched. |
| `geometry/vertical` | **THE OPEN ARC. 683 of 684**, and the one red is `ragtime-nightingale`'s `oy`, now **1.49** against 0.59 and NOT raised. |

| corpus | standing |
|---|---|
| 41-fixture | **21/29** exact on all four axes at 0.05px (was 20). Only EIGHT are off any axis, only FOUR off a vertical one. |
| harvested (174) | **172/174** content-correct; within 0.05 / 1 / 5 / 25px **78 / 89 / 96 / 119**, from 72 / 83 / 91 / 116. |
| `ragtime-nightingale` extents | **40 of 46** staves match abcjs's own `staff.top`/`.bottom`, and staff 0's is the title-block accounting difference rather than an error. |

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

### 3. `umarcato` is a STACKED decoration, not a close one

abcjs's close list is exactly staccato, tenuto and accent (`decoration.js:19-20`); every
other case in the switch goes through `symbolDecoration`. `marcato` was already on the
stacked path with that rule written beside it — `umarcato`, its `!^!` spelling and `wedge`
were added later on the CLOSE path, where they reserve a POINT at their own pitch instead
of `cursor + symbolHeightInPitches + 0.5`.

`ragtime-nightingale`'s staff 37 is a chord carrying `!^!`: abcjs reserves top 14.6277
(cursor 12 + 2.1277 + 0.5), we reserved 14.0529. That 0.5748 pitch is **2.23px of the
page's drift**, and every staff below it rode high. **oy 1.96 → 1.49.**

A test asserted `!^!` on a down-stem note draws `articMarcatoBelow`. It does not —
`symbolList` is placement-independent, and `!^!C !^!c` renders two `scripts.umarcato`,
measured. The fourth test on this branch to have asserted abcjs was wrong.

### 4. `clef=none` and `clef=perc` MAP LIKE TREBLE — only the glyph is absent

abcjs's table gives both `mid: 0`, the same as treble (`abc_parse_key_voice.js:36,42`), and
`none` carries no `pitch` field at all. Measured on its own output: `K:C`, `K:C none` and
`K:C perc` all put `B4` **15.49px below the top staff line**. The whole visible difference
between them is the CLEF's own reserve — 13.7244 pitch against a bare staff's 10.

We read both as a C clef on the middle line, with a comment saying it was so notes would
"land somewhere sane rather than at a wild offset". Three staff spaces wrong: every note
rode high and the staff under it sat ~11.8px low in compensation, for a net 11.43px.

**Found by SPLITTING one number into two.** A harvested fixture was 45.19px out; a
controlled pair — the same tune with and without its `%%begintext` block — put 11.43 of
that on the clef and 33.76 on the block. Neither was visible in the 45.19.

### 5. `%%text` and `%%begintext` are drawn and reserved

abcjs builds one `FreeText` per directive, and the spellings differ in more than alignment.
Measured with a control pair on one tune: **`%%center A` costs 23.27px and `%%text A` costs
33.77**, their rows exactly that 10.5 apart — the `{ move: fontSize / 2 }` the string branch
spends before its row and the centred branch does not.

A `%%begintext` block is ONE element however many lines it holds — a single `<text>` with a
`tspan` per line. Each line past the first adds **25.2px**, 1.2em at the 21px `textfont`,
the same `dy` a lyric verse steps by, and NOT the 1.108 line height the first line takes.

`textAbove`/`textBelow` are now lists of BLOCKS rather than of lines, which is what abcjs's
element already was. Verified against abcjs on five shapes — one- and two-line
`%%begintext`, one and two `%%text`, and `%%center` — all within 0.02px.

**FREE TEXT ONLY TRAILS IF NOTHING FOLLOWS IT.** abcjs's justification rule is per LINE, so
a `%%begintext` between two music lines makes the FIRST non-last and leaves the second
last. Measured on `S2-fields`'s BeginText tune: abcjs's first staff spans the full 350 and
its second stops at 211. Marking any post-music block as trailing justified the wrong line.

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

**This is not a small change, and it is NARROW.** Making rests transparent is one line;
making them MEMBERS — which is what abcjs's average, min, max and count all see — reaches
`setBeamGroup` (which refuses rests today), the `members` filter in `beamPos`, and the
beam-geometry inputs. Do it as a whole or not at all, and re-measure all 292.

The half-measure provably does not work: probed, that rest's `minpitch`/`maxpitch`/
`averagepitch` are all **11** — `restpitch` is 7 by default but 11 on a MULTI-VOICE staff
with stems up (`abstract-engraver.js:544-551`) — and it is the rest's 11 that lifts
`beam.max` from 9 and takes `pos` from 17 to 19. Transparent-but-not-a-member leaves us at
17. That single fact is also the whole of the 202 beams whose `min`/`max` disagree.

**Weigh it before starting.** Across all 41 fixtures abcjs has 599 beams and exactly FOUR
contain a rest — two in `S3-note-syntax`, one in `S8-layout`, one in ragtime — and none of
those three fixtures is pixel-gated. Ragtime's is, but the change moves only the beam and
its stems, and the pixel gate measures NOTEHEADS. **No gate in this repo can see this fix.**
It is a real defect — a beam drawn in two pieces where abcjs draws one — and it has to be
verified by comparing the two SVGs' beam probes directly.

### A TWO-NOTE GRACE GROUP IS BEAMED

Ragtime line 108, `{=de}` — abcjs lays a beam over it (`up=true n=2 startY 13 endY 14
startX 313.46`, its members printing as neither `pitches` nor `el_type` because grace beams
carry generic objects, per `createStems`'s own comment). We emit no beam for it at all.

---

## RAGTIME'S REMAINING RESIDUAL IS HORIZONTAL IN ORIGIN

Its page drift WAS two staves. One of them — staff 37 — is closed by the `umarcato` fix
above. What is left is a −1.78px step at staff 9 and wobble under 0.9px, and **all of it
traces back to the horizontal axis**:

| staff | abcjs | ours | who sets it |
|---|---|---|---|
| 8, 24 | bottom −7.9748 / −7.9688 | −7.5000 | a below-curve's `getYBounds` box |
| 16, 42 | top 26.5118 / 26.5295 | 26.3038 / 26.4449 | the same, on the above side |
| 34 | top 35.6574 | 35.5939 | " |

Staff 8's binding curve is a below-slur between members #3 and #4 of a six-note beam. Both
engines take `calcSlurY`'s beamed branch and read `parent.fixed.b` — a beam-interpolated
stem end — and both compute it the same way. What differs is the beam's own x SPAN:

| | startX | endX | span |
|---|---|---|---|
| abcjs | 234.396 | 331.112 | 96.72 |
| ours | 245.945 | 350.931 | 104.99 |

`startY`/`endY` are −3 and −6 in BOTH. A slanted beam sampled at an interior note therefore
gives a different y, and the fractional numbers abcjs reports — −3.8997 and −4.9748 against
our −4.0000 and −4.5000 — are that interpolation, nothing else. Working the fractions back:
abcjs puts those two members at 0.4666 and 0.8249 along the beam, we put them at 0.5007 and
0.6670. **That is within-bar horizontal spacing, and ragtime's `dx` is still 69.82.**

**Do not chase these five on the vertical axis.** They will close when ragtime's horizontal
does, and not before. The vertical arc has taken this fixture as far as it goes: 40 of 46
staff extents exact, and staff 0's difference is the title-block accounting rather than an
error.

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
| ~~45.19~~ | `visual-misc-09 / -10 / -11-begintext` | **CLOSED** — 11.43 of it was `clef=none`, 33.76 the block |

**The list is worth re-running before picking from it.** Three of its entries have closed
since it was made and the remaining order has not been re-measured; `npm run` nothing does
this, so it takes a scratch test over `tests/corpus-abcjs/` that reports each fixture's
worst of the four axes with its directives beside it. It is what put `%%begintext` ahead of
the directive tail the last checkpoint led with, and what showed that `barnumbers-1` is not
a bar-number fixture at all.

**MID-TUNE free text is still not drawn.** A `%%begintext` between two music lines is
dropped — it must not be marked as trailing (that justifies the wrong line) and placing it
properly needs free text to be a LINE rather than a property of the tune, which is the
standing `ponytail:` on `textBelow`. `S2-fields` is the fixture, and its second staff is
59px high because of it.

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
6. **SPLIT A NUMBER BEFORE CHASING IT.** A harvested fixture was 45.19px out and that read
   as one bug. A controlled pair — the same tune with and without its `%%begintext` block —
   split it into 11.43 of clef and 33.76 of free text, two unrelated defects. Neither was
   visible in the 45.19, and the clef one would never have been guessed from it.
7. **`dump-svg.js --output /dev/null` LITTERS the sibling repo.** A multi-tune fixture
   writes `<output>-tuneN`, so a batch loop over `fixtures/*.abc` leaves 25 untracked files
   called `-tune0`… in `Tools/abcjs-debug/`. Write to `/tmp/x.svg` instead.
8. **`git status --short` returning output still EXITS 0**, so `git status --short && echo
   CLEAN` prints CLEAN over a dirty tree. Read the output, do not test the exit code.
9. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

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
