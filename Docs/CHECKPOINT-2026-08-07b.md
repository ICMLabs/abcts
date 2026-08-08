# abcts — Checkpoint, 2026-08-07b

Supersedes `CHECKPOINT-2026-08-07.md` for the STATE. That file keeps findings 125–133 and
**THE GATE WAS READING 29 OF THE 41 FIXTURES**, which is the section that made this session
possible. `-08-06b.md` keeps 106–124, `-08-06.md` **THE HARNESS** and 104–105, `-08-05c.md`
90–103 and the `ENGRAVE` triage table, `-08-05b.md` 71–89, `-08-04c.md` 51–70 and the ladder
method, `-08-04b.md` 41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔎 THE HEADLINE: BOTH RANKED TABLES ARE EMPTY, AND THE TAIL WAS NEVER "NOT WORK"

| | at the session's start | now |
|---|---|---|
| suite | 890 | **890. NO REDS.** |
| pixel ranked table | 18 of 119, "TEN live rows, nothing above 8.25" | **0 of 119** |
| harvested (174) | 0 of 174 | **0 of 174** |
| ceilings | — | **fourteen LOWERED, none raised** |
| gates | 2 ranked tables | **3** — the staff-line extent gate is new, and it opened with 20 targets |
| Bravura glyphs | 112 | 113 — the BREVE |

Nine of the eighteen rows were the block this file's predecessor called *"the whole-note
OUTLINE and not work"*, asserted at `ox = 0.18` with a paragraph explaining why no placement
rule could remove it. **Every clause of that paragraph was true and the conclusion was
wrong** — see finding 141. Eight more closed on ordinary findings.

---

## FINDING 134 — A GRACE DEEPER THAN AN ACCIDENTAL THROWS THE ACCIDENTAL'S HALF-WIDTH AWAY

`abselem.extraw` is a MIN over siblings, and the two writes that touch it are ordered:

```js
abselem.addExtra(accidental at accPlace)   // if (dx < extraw) extraw = dx
abselem.extraw -= ret.extraLeft            // half the accidental's width
…
addGraceNotes(…)                           // addExtra again — a MIN, which RESETS it
```

(`create-note-head.js:101`, `abstract-engraver.js:723-725, 834-836`,
`absolute-element.js:97`.) A grace group always reaches further left than the accidental
column — its walk starts AT the accidental room and adds 10 per grace — so the `-=` between
the two steps is thrown away entirely.

We summed it: `headX - x + extraLeft`. A flat **4.125px** on any note carrying BOTH a grace
group and an accidental, and nothing anywhere else.

`S8-layout` X:807 is 99 heads in three runs of dx 0.00 / 4.12 / 8.25 with **zero spread
inside each run** and `dy` flat at 0.00 — a pure ORIGIN step, twice. The steps fall at
`{A}^c2` and `{FGAB}[^c4A4]`, the tune's only two such notes. **The handoff's shape table
called it right and its guess at the cause did not**: it read "a step at the `\` join" and
recorded a dead hypothesis about a running `roomtaken`. The step is at the second element of
line 4, not at the join.

## FINDING 135 — `translateChord` RUNS ON EVERY CHORD SYMBOL AND DROPS WHAT IT CANNOT READ

`add-chord.js:44-45` calls it for anything that is not an annotation, with no `%%jazzchords`
test — that flag only chooses whether the marker between the pieces is `\x03` or `""`. With
an empty marker it LOOKS like an identity and is not, because the string is REBUILT:

```js
let reg = chord.match(/^([ABCDEFG][♯♭]?)?([^\/]+)?(\/([ABCDEFG][#b♯♭]?))?/)
lines[i] = [reg[1] || "", reg[2] || "", reg[4] ? "/" + reg[4] : ""].join(marker)
```

`"C6/9"` takes root `C`, modifier `6`, then fails `[ABCDEFG][#b♯♭]?` on `9` — abcjs prints
`C6`. `"C/E"`, `"D/F#"`, `"G/B"` and `"Am/C"` all keep their bass, which is why a system with
four slash chords in it hid this until the digit one.

## FINDING 136 — `roomtaken` IS AN ORIGIN, NOT A CHILD

`extraw` only moves under `addExtra` / `addHead` / `addCentered`, so it measures the leftmost
thing actually ADDED. `roomtaken` is a separate figure saying where the NEXT thing to the
left should START, and the displacement pass seeds it before the accidental loop:

```js
if (dir === "down") roomTaken = glyphs.getSymbolWidth(noteSymbol) + 2   // 11.81
```

With no accidental and no grace, nothing is ever added out there and the element's whole left
reach is the displaced head's own `shiftheadx` — 8.81 for a unison. Charging the seed made
every chord holding a second or a unison **3.00px too wide**.

Two terms now, each guarded by whether its own child exists:

```ts
accidentals.length === 0 ? 0 : accidentalWidth + extraLeft
graceWidth      === 0 ? 0 : graceWidth + accidentalWidth
```

`S8-layout-tune5` and **`ragtime-nightingale`** both went EXACT on it — 2009 noteheads, the
corpus's largest fixture and the oldest number on the table.

**AND THE CANARY HAD TO CHANGE SHAPE, exactly as the test file predicted.** "The gate can
tell positions apart" asserted ragtime's dx exceeded 1px. Its non-zero end is now a
deliberate MISMATCH — our `simple-c` render against ragtime's golden — which no fix can
close. `tunebook-3-tune0` was tried first and does NOT work: eight quarter notes at
`simple-c`'s own spacing, so the SPREAD is 0.00. **Two different tunes are not automatically
two different geometries.**

## FINDING 137 — A BELOW ANNOTATION TAKES A LANE OFF THE STAFF'S BOTTOM

The mirror of `anchorAboveStaff`'s chord lane:

```js
if (staff.specialY.chordHeightBelow) {
  positionY.chordHeightBelow = staff.bottom;      // where the mark is DRAWN
  var hgt = staff.specialY.chordHeightBelow;
  if (staff.specialY.chordLines.below) hgt *= staff.specialY.chordLines.below;
  staff.bottom -= (hgt + margin);                 // what the staff RESERVES
}
```

(`set-upper-and-lower-elements.js:56-61`.) A ladder of four controls on `CEGc`, ink bottom
−1.0444, against abcjs's instrumented `staff.bottom`:

```
plain              -1.0444   -1.0444    exact
"_below"           -6.8237   -5.6159    1.2078 pitch out = 4.68px
"_below" "_two"   -11.6031  -10.7772    0.8259 pitch out
"_Wwwwwwwwwwwwww"  -6.8237   -5.6159    LENGTH IRRELEVANT — a FIXED lane
```

**The fourth rung names the mechanism**: fourteen characters reserve exactly what six do, so
nothing there is measuring ink.

The margin is BEYOND the drawn box on this side where above it lands inside, so the block is
spent explicitly as a `reserve` on the texts; they carry a POINT reserve until the pass runs.

**AND THE LANE ORDER HAD TO BE MEASURED.** Three source reads predict the below side is
upside down from the above one — `setLaneForChord` walks children BACKWARD for
`chordHeightBelow` and `setLane`'s `invertLane` has its below arm commented out. Instrumenting
`placeInLane` on `"_p""_dolce"C|` says the opposite:

```
PROBE lane "p"     -> FIT 0   left=49.05 right=57.96
PROBE lane "dolce" -> NEW 1   left=49.05 right=87.33
```

and the SVG agrees, `p` at y 95.79 against `dolce` at 115.79. The reversal was written and
an existing unit test caught it.

## FINDING 138 — A MELISMA'S `_` IS PART OF THE SYLLABLE ABCJS MEASURES

`addLyric` runs `getTextSize.calc(lyricStr, …)` on the whole string and hands the result to
`addCentered`, which takes `extraw = -w / 2` (`abstract-engraver.js:769-778`). In strict the
underscore IS that string — the golden draws one tspan reading `true._`.

We appended it in `layoutMelismas`, after the element's spans were taken: it measured `true.`
and drew `true._`. **ONE NUMBER COMPUTED IN TWO PLACES WHOSE INPUTS HAD DRIFTED**, the third
time on this branch after the lyric reserve and `curveReserves`. Both probes:

```
abcjs   w=21.492  extraw=-21.492
ours    w=20.828  left= 17.242
```

and 4.25 is half the 8.5 the golden vocalfont table gives `_`.

## FINDING 139 — `~` AND `R` ARE ABCJS'S `scripts.roll`, 6.125px TALL

The last Bravura metric reachable in strict on the decoration path. `scripts.roll` sat in
`UNMAPPED_ABCJS`, whose own first paragraph says an absence there is usually the parity
behaviour — **it is not here.** abcjs HAS the glyph; what it lacks is a SMuFL name that
claims it, and a decoration is stacked by `symbolHeightInPitches(symbol) + 1`
(`decoration.js:154-165`), so Bravura's `ornamentTremblement` at 7.564 cost 0.3714 pitch each.

A ladder of six bars put it on ONE bar, then a ladder of eight put it on the glyph:

```
c2       13.7966  13.7966     exact
uc2      16.5279  16.5279     exact          — upbow is mapped
uRc2     19.1085  19.4799     +0.3714        — R is not
uR~c2    21.6892  22.4319     +0.7427        — and neither is ~
uR~Mc2   25.2729  26.0156     +0.7427        — mordent adds the same to both
```

The glyph's x moves 1.27 with it, which is also abcjs's: `symbolDecoration` places a
non-centre-aligned symbol at `width / 2 - getSymbolWidth(symbol) / 2`, and `getSymbolAlign`
returns "left" for `scripts.roll` **by name**.

## FINDING 140 — A REST OF EXACTLY ONE WHOLE NOTE TAKES ITS MEASURE'S DURATION

A PARSER rule, and NOT the engraver's:

```js
if (el.rest && el.rest.type === 'rest' && el.duration === 1 &&
    durationOfMeasure(multilineVars) <= 1) {
  el.rest.type = 'whole';
  el.duration = durationOfMeasure(multilineVars);
}
```

(`abc_parse_music.js:549-555`.) Its test is `duration === 1`; the engraver's whole-rest rule
is `measureLength === duration` (`abstract-engraver.js:812`). **Two different rules that
agree in 4/4 and part company everywhere else** — we had only the second. `z4` in
`M:6/8 L:1/4` is one whole note in a three-quarter bar, and abcjs's probe reads `dur=0.75`.

`durationOfMeasure` reads `origMeter`, the HEADER `M:`, and returns 1 when there is none —
which is `builder.meter` exactly: a mid-tune `M:` goes to `setMeterChange` and never touches
it.

**AND A DOTTED REST'S DOT WIDENS THE ELEMENT.** The dot was drawn and its rod was not:
`restInk` only ever knew the glyph. abcjs probes a dotted quarter rest at `w = 14.338`
against the plain 7.888. It moved NOTHING measurable — the line had slack — so it is landed
on abcjs's own probe rather than on a fixture.

---

## FINDING 141 — `G8` IS A BREVE, AND NINE "NOT WORK" ROWS WERE A WRONG NOTE VALUE

The table's tail carried eight `ox = 0.18` rows plus `S3-note-syntax-tune12`'s `dx`, asserted
with this explanation:

> "abcjs's head inks 16.83px wide, Bravura's 15.03, and the two are not left-aligned either.
> Positions are compared as bounding-box CENTRES, so two differently shaped glyphs at the
> same origin score a difference no placement rule can remove."

Every clause true. Each of those tunes is `G8` under `L:1/4` — **TWO whole notes** — and
abcjs indexes `chartable.note[-durlog]` with `durlog = Math.floor(Math.log2(duration))`, so
it lands on `noteheads.dbl`, a BREVE. We drew a semibreve. **The 16.83 quoted as the evidence
is `noteheads.dbl`'s own `w`, to the hundredth**; nobody asked whose glyph it was.

**A BOUNDING-BOX CENTRE CANNOT TELL A WRONG GLYPH FROM A DIFFERENTLY SHAPED ONE.** A ranked
table does need a way to say "measured, and not a defect" or its tail fills with work nobody
should do — but the note has to rule the first case out before it is written, because once
written it is the reason the row stops being read.

Three parts: `noteheadDoubleWhole` added to the generator and regenerated (113 glyphs),
mapped to `noteheads.dbl` and removed from `UNMAPPED_ABCJS`, and `noteGlyph` returns it for a
base of 2 or more. **Eleven rows became two.**

## FINDING 142 — `K: style=` TAKES EFFECT FROM THE NEXT LINE

The style reaches the drawing as an ELEMENT appended by `createVoice` —
`if (params.style) self.appendElement('style', null, null, {head: params.style})`
(`tune-builder.js:963-971`) — and `createVoice` runs from `startNewLine`. `parseKey` sets
`multilineVars.style` where the field stands and **nothing reads it there**, so the
granularity is the music LINE, exactly as `%%vocalfont`'s is.

Measured, because the source reads as "applies from here" and the two forms differ. On
`GAB2 !style=harmonic![gb]4|GAB2 [K: style=harmonic]gbgb|` abcjs draws the `[gb]` as DIAMONDS
and the four `gbgb` after the `[K:]` as ORDINARY OVAL HEADS — same path data as the `G A B`
before them, `w = 9.810` each against the diamond's 7.500. **The decoration form
`!style=harmonic!` is per NOTE and immediate; the field form is per LINE.**

The element x's already matched to the third decimal, which is what said the defect was the
GLYPH and not the spacing: 1.18 is half the 2.31 between the two heads' inked widths.

A field at the HEAD of a line still applies to that line, because `startNewLine` fires lazily
once `parseMusicLine` is past the leading inline statements — the same mechanism as findings
125 and 130. So the test is `appendedSinceLineStart`, and a BARLINE sets it as well as a note.

---

## WHAT MOVED, MEASURED BEFORE AND AFTER OVER ALL 119 TARGETS

Nothing regressed by any amount at any point. Every ceiling that moved went DOWN.

| target | was | now |
|---|---|---|
| `S8-layout-tune6` | dx 8.25 ox 3.58 | **0.00 — exact on all four** |
| `S3-note-syntax-tune24` | dx 6.24 ox 0.11 | **0.00 — exact** |
| `S8-layout-tune5` | dx 6.20 ox 1.07 | **0.00 — exact** |
| `ragtime-nightingale` | dx 1.58 ox 0.03 | **0.00 — exact, 2009 heads** |
| `S2-fields-tune1` | dy 4.68 oy −2.98 | **0.00 — exact** |
| `S5-directives-tune4` | dx 3.88 ox 0.17 | **0.00 — exact** |
| `S4-bars-repeats-tune2` | dx 1.17 ox 1.80 | **0.00 — exact** |
| `S5-directives-tune1` | dx 1.19 dy 0.03 | **0.00 — exact** |
| `S3-note-syntax-tune12` + eight `G8` tunes | 0.18 | **0.00 — exact** |
| `S8-layout-tune7` | dy 2.66 oy 1.14 | **0.00 — exact** |

---

## FINDING 143 — A GRACE GROUP CARRIES ITS OWN SLUR, AND WE HAD NEVER BUILT ONE

The only curve abcjs makes without the source asking for one:

```js
var isInvisibleRest = elem.rest && (elem.rest.type === "spacer" || elem.rest.type === "invisible");
if (i === 0 && !isBagpipes && this.graceSlurs && !isInvisibleRest)
  voice.addOther(new TieElem({ anchor1: grace, anchor2: notehead, isGrace: true }))
```

(`abstract-engraver.js:528-533`, inside `addGraceNotes`' forward loop — ONE per group, first
grace to main head, `graceSlurs` default true.) `grep -rn graceSlur src/` returned NOTHING;
`curveReserves` knew `slurStarts`, `slurEnds` and `tiedToNext` and nothing about graces.

**ITS GEOMETRY IS THE SIMPLEST OF ANY CURVE, because two branches switch themselves off.**
`calcSlurDirection` opens `if (this.isGrace) this.above = false`, so it is ALWAYS BELOW; and
`calcSlurY`'s beam-retargeting block is guarded on `anchor1.scalex === 1`, which a
0.6-scaled grace head fails — **so both ends are the plain pitch even when the main note is
mid-beam** (`tie-element.js:96-98, 163-202`). The reserve is `min(pitch) - 3`.

A ladder of seven controls against abcjs's own `staff.bottom`, and only one binds:

```
e          -1.0000  -1.0000
{f}e       -1.0000  -1.0000     grace ABOVE the note — reserves past the staff
{cd}c      -1.0000  -1.0000
{dedc}d    -1.0000  -1.0000
{C}D       -3.0000  -1.2000     ← the one, and min(0, 1) - 3 is exactly -3
{f}y       -1.0000  -1.0000     invisible rest — abcjs SKIPS the slur
{f}z       -1.0000  -1.0000     ordinary rest — it does NOT, and it still clears
```

**AND IT IS DRAWN, at abcjs's own coordinates.** Three offsets: `calcX` pulls the GRACE end
back 3 — the only thing it special-cases — then `drawArc` adds the usual 6 and 4, and the
1.5-pitch slur lift goes DOWN. Verified against abcjs's own path on `{C}D`:

```
abcjs   M 75.09 81.55 C 79.56 84.22 84.27 82.56 86.09 77.68 …   centre (80.590, 81.895)
ours                                                            centre (80.590, 81.890)
```

with both engines' noteheads at (87.02, 71.85) and (77.02, 75.73).

**`anchor2` IS THE MAIN NOTEHEAD AND THAT IS NOT `anchor.left`** — our anchor's `left` is a
min over every head on the element and the grace heads are in it. Both ends are resolved in
`curveReserves`, where the elements are, and stamped on the anchor: the same merge
`slurFixed` makes.

## FINDING 144 — A THIRD GATE: THE STAFF LINES' OWN LENGTH

The two ranked tables were empty, so this is the first finding that had to build its own
instrument. Nothing could see the axis — the pixel gate compares NOTEHEADS, the line-weight
gate reads a rule's THICKNESS, the baselines say CHANGED and never WRONG. The line weights'
lesson, a second time: **a comparison can only catch what its representation can express.**

`draws its staff lines the length abcjs draws them` compares the top line's resolved
bounding-box centre per target. The last handoff recorded ONE fixture off. **It was TWENTY**,
and they sorted into abcjs's two terms exactly: a flat **5.00** wherever there is a BRACE
(`setBraceLocation` adds its own 10px width, so the centre moves 5), and **40–46** wherever
there is a VOICE HEADER (the widest `voicefont` string plus the width of an "A").

Nineteen closed on one line. abcjs draws from `staffGroup.startx` to `staffGroup.w` —
`getLeftEdgeOfStaff` and `totalWidth + leftEdge` (`draw/staff-group.js:92`,
`layout/layout-in-grid.js:13-14`) — so the left end clears the voice headers and the brace
and the right end stops at the LAST ELEMENT, not at the page margin and not at a title
overhanging it. `staffLinesFor` took `0` to `width` and was wrong at both ends.

**AND THE TWO ERRORS CANCELLED ON MOST OF THE CORPUS.** Where `leftEdge` is just `marginX`
and the system width is just `musicWidth`, `0 → marginX + solvedWidth` has the same CENTRE
as `marginX → solvedWidth`. 21 of the 41 agreed, and the defect only surfaced on a brace, a
voice name, or prose wider than the music. Every one of the 41 baselines moved and nothing
in them but `staffline` rows did.

## FINDING 145 — AN UNCLOSED SLUR STILL RESERVES

`voice.addOther(this)` runs where the `(` is seen, so a `TieElem` whose `)` never arrives is
on the voice like any other. `getYBounds` falls past its two-anchor arm to
`else if (this.anchor1) this.startY = this.endY = this.anchor1.pitch`
(`tie-element.js:203-206`) and takes the flat 3. Ours dropped it — `open.pop()` is only read
on a matching `slurEnds`.

```
b4          14.0448   14.0448     exact — the notehead's own ink
(b4         16.0000   14.0448     ← 13 + 3, and we reserved nothing
(b4 b4)     17.0000   17.0000     exact — a closed slur was always right
```

**Its INK box is NOT taken**, and that is the part worth writing down: `this.top =
max(anchor1.pitch, anchor2.pitch) + 4` is set in `setEndAnchor`, which never runs. The two
boxes a curve declares are spent in different places and only one of them exists here.

---

## WHAT IS LEFT — AND NO GATE CAN NAME IT ANY MORE

```
0 of 119 tunes are off some axis by 0.05px or more
0 of 174 fixtures are off some axis by 0.05px or more
```

Every fixture in both corpora agrees with abcjs on all four geometric axes to within 0.05px.
**So findings now come only from READING abcjs and proving on a control**, and the two
things already measured and not chased are the place to start.

### 1. AN ABOVE DYNAMIC IS DRAWN AT A FIXED STEP — measured, not fixed

**Its staff EXTENT is exact and its own y is ~29px out**, which is why nothing has ever
seen it: the pixel gate compares noteheads, and a dynamic is not one.

`ENGRAVE.dynamicAboveStep: 19.5` is the last lane constant that does not cancel. `partStep`,
`tempoStep`, `lyricStep`, `annotationAboveStep` and `dynamicBelowStep` are all reference
points their anchor pass shifts FROM — `anchorAboveStaff`, `anchorLyrics` and
`anchorBelowStaff` between them place chord symbols, annotations, part labels, tempo marks,
lyrics and BELOW dynamics on the music's own ink. Nothing places an ABOVE dynamic.

A ladder of four controls, all with a `w:` line so abcjs puts dynamics above (`hasVocals`,
`decoration.js:379`):

```
                staff top          top line y        the MARK
  CDEF          13.7244  exact     64.12  exact      —
  !mf!CDEF      20.7244  exact     64.12  exact      abcjs path starts y 29.15, ours y -0.07
  !mf!c'DEF     22.0444  exact     69.23  exact      abcjs path starts y 29.15, ours y  5.05
  c'DEF         15.0444  exact     69.23  exact      —
```

**Ours is a CONSTANT 64.18px above the top line and abcjs's is not** — abcjs's mark stays at
the same absolute y while the staff moves down under it, which is what pinning to the top of
the reserved lane looks like. On the second rung ours lands at y ≈ 0 and is clipped off the
page.

`set-upper-and-lower-elements.js:39-46` is the rule: the lane goes on `staff.top`, then
`positionY.dynamicHeightAbove = staff.top` and the mark draws there.

**THE FIX IS THE ORDERING, NOT THE ARITHMETIC.** abcjs stacks above in the order chord,
ending, dynamic, part, tempo. Ours spends chord/part/tempo in `anchorAboveStaff` and the
ending and dynamic lanes in `verticalExtent` — so the staff's TOTAL is right either way and
only the mark's own y is wrong. `anchorBelowStaff` is the model for the cheap version (it
takes `verticalExtent(...).bottom` minus its own lane and shifts); the honest version moves
both lanes into `anchorAboveStaff`'s stack, which that function's own `ponytail:` note has
been asking for since finding 93.

### 2. `S3-note-syntax-tune13`'s LAST 0.26px OF STAFF LINE

The staff-line gate opened with twenty targets and nineteen closed. What is left is 0.26px
of centre — 0.52 of span — on a tune that is nothing but rests: our right end is half a
pixel short of abcjs's `staffGroup.w`. Every notehead is exact and both ranked tables are
empty, which puts it on the justification TARGET at the right edge. Unexamined.

### 3. THE REMAINING FIXED LANES, then Gonzato, then audio

`dynamicAboveStep`, `dynamicBelowStep`, `annotationAboveStep`, `partStep`, `tempoStep`,
`lyricStep`. `anchorChordsBelow` (137) is now the second model beside `anchorVoltas`.

---

## THE METHOD, and the two things this session added

1. `npx vitest run tests/pixel-parity.test.ts && cat /tmp/abcts-pixel-ranked.txt`
2. `npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`
3. Per-notehead diff of the top entry — **read the SHAPE**.
4. Instrument abcjs in the scratchpad copy to answer ONE question.
5. Read the named function.
6. Port the structure, then the constants.
7. **Prove it on a CONTROL TUNE**, and prefer a LADDER.

**ADDED: A LADDER OF BARS, THEN A LADDER INSIDE THE BAR.** Finding 139 took two — six
controls, one per bar of the system, put a 2.66px error on `uR~M.c2  Hg4`; eight more, one
per decoration, put it on `R` and `~` and named the glyph. Neither ladder alone would have
done it, and no diff could have.

**ADDED: A "NOT A DEFECT" NOTE MUST RULE OUT THE WRONG GLYPH FIRST.** Finding 141. The
evidence that justified nine rows of silence was the wrong glyph's own published width.

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 890/890
npx biome check src                   # NOT clean — 1 error, 4 warnings, all PRE-EXISTING
npm run baseline                      # READ the diff, and MEASURE anything that moved
git status --short                    # DELETE tests/zz-probe.test.ts before committing
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Never commit or revert there.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there** — it
happened four times this session, every time after a `cd /tmp/abcts-probe/abcjs-probe`. Put
the absolute `cd /Users/lrettberg/ICMLabs/Code/abcts &&` in front of every command.
**vitest SWALLOWS console.log on a passing test** — `--disableConsoleIntercept`.

The probe test file used all session is kept at `/tmp/abcts-probe/zz-probe.test.ts`; copy it
to `tests/zz-probe.test.ts` to use it and **delete it before committing**.
