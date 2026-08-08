# abcts — Checkpoint, 2026-08-03b

Supersedes `CHECKPOINT-2026-08-03.md`, which stays as the record of the declared-box idea,
the two corpora and the four gate artefacts. **Two of its statements are corrected below**
and both corrections came from measuring the output.

**Nine fixes landed.** The last six all came off the harvested corpus's ranked table, and
that table is now a committed diagnostic — `tests/corpus-abcjs-ranked.test.ts`, writing
`/tmp/abcts-corpus-ranked.txt`. **Run it first.** The ratchet's four counts can say a
number moved; only the table says what to fix.

**AND THE ALGORITHM IS IN abcjs.** Findings 6–9 were read out of its source and then
confirmed by instrumenting it, not inferred from a diff — three of them could not have
been guessed from the output at all, and one of them (a `[V:x]` naming the current voice)
is not visible in the source either and took a probe to see. Read the source for the
MECHANISM, the output for the NUMBER, and instrument when the two disagree.

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
| harvested (174) | **172/174** content-correct; within 0.05 / 1 / 5 / 25px **86 / 97 / 106 / 130**, from 72 / 83 / 91 / 116. **86 of its 174 are still off some axis** — `tests/corpus-abcjs-ranked.test.ts` lists them. |
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

### 6. `V:… merge`, the bare `up` / `down`, and clef names matched by PREFIX

Three gaps on one fixture — `visual-layout-07`, 186.63px out and now 0.03.

- **`merge`.** abcjs builds `staffInfo` with `startStaff: isNew` — true the first time an
  id is seen — and `case 'merge'` sets it false (`abc_parse_key_voice.js:518,714-716`).
  Then `if (staffInfo.startStaff || staves.length === 0) staves.push(…)` and the voice takes
  `staffNum = staves.length - 1`, assigned once and never revised (`:803-810`). So the
  first voice always opens a staff whatever it says, and a merging voice lands on whichever
  was opened last. We had no such token: four staves where abcjs draws two.
- **The bare `up` / `down`.** abcjs gives them a case each and both assign
  `voices[id].stem` (`:717-732`). ABC 2.1 §4.19 documents only `stems=`; abcjs's own
  fixtures use the bare form.
- **Clef names are matched by PREFIX.** `getClef` is a chain of `startsWith` and after the
  name it consumes only `+8` or `-8`, leaving anything else where it is
  (`abc_tokenizer.js:95-155`). So **`bass,,` IS the bass clef** with two stray commas.
  Requiring a whole word read it as no clef and defaulted that voice to treble.

### 7. An implicit voice with no music takes no staff

`scanMusic` touches `builder.voice` to open the source line before it has read the line's
tokens, so a tune whose every line starts with an inline `[V:T]` materialises the default
voice `1` first and never puts anything in it. abcjs has no such voice. Left in, it took a
whole extra staff on EVERY system: `visual-parsing-08` drew six staves where abcjs draws
three, with the music on alternate ones.

A voice now counts only if a `V:` or `[V:]` NAMED it or it holds music — so a tune with no
`V:` at all keeps its implicit voice, and a header-declared silent voice keeps its staff.

### 8. THE TWO LINE-ASSIGNMENT RULES

The largest structural finding of the session, and the one that most needed instrumenting.

**A TRAILING BACKSLASH JOINS A MUSIC LINE TO THE NEXT.** abcjs marks it in preprocessing —
`/\\([ \t]*)(%.*)*\n/` becomes `\` + `\x12` (`abc_parse.js:511-515`) — and then declines
to open a line at all when the PREVIOUS one carried the marker
(`abc_parse_music.js:154,585`). We lexed `\` as whitespace and dropped the meaning, so
every continued line opened a system of its own. The 41-corpus `clefs` tune 7 was
**dy 207.93 / dx 884.41** out and is now **46.51 / 98.85**.

**A `[V:x]` SWITCH OPENS A LINE ONLY WHEN x ALREADY HAS MUSIC.** `setCurrentVoice` points
`lineNum` at the first line where the voice holds no notes (`tune-builder.js:410-428`) and
`startNewLine` increments past one that does (`:334-357`). A voice only ever appends, so
both reduce to: if it has written here, move on.

**AND A `[V:x]` NAMING THE VOICE ALREADY CURRENT IS A NO-OP.** That half is not in the
source — `parseVoice` ends `return setCurrentVoice(id)` unconditionally, so reading it
predicts a line advance on every repeat. Probed, `setCurrentVoice` fires **twice** across
`visual-parsing-08`'s six `[V:…]` lines, once per distinct id. Without the guard,
`[V:1]f|\` + `[V:1]f|` split into two systems where abcjs draws one.

All five inline-voice fixtures now match abcjs's system structure — `parsing-03` one, `-04`
and `-05` two, `-08` three, `-09` one. Five 41-corpus baselines moved and all five improved.

### 9. The ranked table is a committed diagnostic

`tests/corpus-abcjs-ranked.test.ts`, on the `staff-spacing` pattern: writes
`/tmp/abcts-corpus-ranked.txt`, asserts only that it measured something. It had been
rewritten as a scratch file three times in one session, and every fix from 4 onward came
off it.

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

## THE HARVESTED CORPUS — RUN THE RANKED TABLE FIRST

```bash
npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt
```

**86 of 174 are still off some axis.** Read the SHAPE, not just the total: `dy 0.0` beside
a large `dx` is a horizontal defect and not this arc's; a large `|oy|` with `dy` near zero
is a rigid vertical shift, which is one term and usually one cause.

What stands at the top, and what its shape says:

| worst | fixture | shape |
|---|---|---|
| — | `parse-book_parser-04-wed` | TUNE COUNT 2 vs 1 — the leading-header split, a known gap |
| 496.9 | `visual-layout-09-endings` | `dx`-led, `%%voicecolor` |
| 300.3 | `visual-tablature-17-stretchlast` | **`dy` 300.3** — the biggest vertical item left |
| 241.2 | `visual-wrap-02-stretchlast-1` | `dy` 0.0 — pure horizontal |
| 153.5 | `visual-options-01-fonts` | **`oy` −153.5** — 18 font directives plus `%%header`/`%%footer` |
| 115.5 | `visual-svg-per-line-02-scaled` | `dy` 0.0 — `%%staffwidth`, horizontal |
| 108.2, 106.8, 91.9, 84.7 | four `visual-transpose-*` | all `dy` 0.0 — ONE horizontal cause, four fixtures |
| 85.7 ×2, 69.9 ×2 | `selection-test` / `all-element-types` | `%%barnumbers` + `%%text` + `%%sep`, mixed |
| 75.8 ×2 | `misc-01-barnumbers-1`, `parsing-10-song` | `dy`/`dx` both 0.0, `ox` 75.84 — a RIGID x shift, and `misc-01` is a MULTI-MEASURE REST (`Z24`) rather than a bar-number fixture |

The four `visual-transpose-*` at `dy 0.0` are the cheapest thing on the list by fixtures
per cause, and the two at a rigid `ox` of 75.84 the cheapest by shape — both horizontal.
The two vertical ones are `tablature-17` and `options-01`.

**MID-TUNE free text is still not drawn.** A `%%begintext` between two music lines is
dropped — it must not be marked as trailing (abcjs's justification rule is per LINE, so
doing so justifies the wrong one) and placing it properly needs free text to be a LINE
rather than a property of the tune, which is the standing `ponytail:` on `textBelow`.
`S2-fields` is the fixture and its second staff is 59px high because of it.

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
9. **THE SOURCE HOLDS THE MECHANISM AND THE PROBE HOLDS THE REST.** `parseVoice` ends
   `return setCurrentVoice(id)` unconditionally, which reads as "every `[V:x]` repositions
   the line". It does not — a `[V:x]` naming the voice already current is a no-op, and only
   a probe shows it: `setCurrentVoice` fires twice across six `[V:…]` lines. Three of this
   session's four algorithm ports needed the source to find them and the probe to finish
   them. Reading alone would have shipped the wrong rule; measuring alone would never have
   found the rule at all.
10. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

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
