# CHECKPOINT — 2026-08-11b

**abcts, `main`.** The suite is **1268/1268** with no reds, `npx tsc --noEmit` is clean,
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
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **57 of 171**, best 200613, median 10288 | 94 of 171 |

**`svg-bytes` is the one open gate**, `DIVERGENT` is still EMPTY, and **114 fixtures are
byte-exact — all 114 RATCHETED**, up from seven. See §4.

---

## 2. THE LANDINGS

**Twenty-eight, in two halves.** The first seven are one finding: abcjs's ARITHMETIC IS PART OF
THE PORT — which number is formed first, which product is taken once, which offset is
stored rather than derived. §3 of `CHECKPOINT-2026-08-11.md` named it as the next
architectural arc for the VERTICAL; it turned out to be the horizontal too, and the
horizontal was worth more (82 → 67 on two changes).

The last twenty-one are STRUCTURAL — 67 → 57 — and every one came out of the two biggest
fixtures in the corpus (`visual-selection-01` and `visual-svg-per-line-01`, 202k bytes each, the same
tune), which went from byte 3038 to byte **12305**. They are in §2.8 onward. **Four of the
last five are invisible to every ranked table** and were reachable only because the byte
comparison walks the whole file in order.

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

### THE LINE SOLVE ITERATES ON ABCJS'S SPACING, NOT ON A FACTOR — **82 → 71**

    voice.nextx = x + (spacing * this.getSpacingUnits(voice))     // voice-elements.js:80
    relSpace    = spacingUnits * spacing
    constSpace  = lineWidth - relSpace
    spacing     = (targetWidth - constSpace) / spacingUnits        // layout.js:110-116

`spacing` is ONE number, replaced outright each of the eight passes and opening at the 30px
base. **Ours carried a dimensionless FACTOR against that base** and re-multiplied it at
every spring, so each spring was `(factor * base) * units` off a factor the solve had itself
divided by `units * base` — a multiply and a divide abcjs does not have, spent once per
element per pass.

**Eleven fixtures, and glyph-x ULP tokens 265 → 48.** The single largest step of the
session, and it is four lines.

### PLACE AN ELEMENT ON THE SOLVED x — DON'T SHIFT IT THERE — **71 → 67**
`child.x = x + this.dx` (`relative-element.js:124-125`). abcjs positions every child as the
SOLVED x plus that child's own stored offset: ONE addition onto the number the solve
produced. Ours translated the whole element by a delta — `g.x + (target - el.x)` — which is
the same terms grouped the other way.

**The beam stems place the same way now, or an element and its beam disagree.** Doing the
elements alone showed as **8.51px of dy on `ragtime-nightingale`** — caught by
`pixel-parity` mid-refactor, and a reminder that this arc can produce real movement and not
only ULPs.

**AND ONE OFFSET HAS TO BE BUILT RATHER THAN DERIVED.** A flag's `dx` is literally
`headx + notehead.w - 0.6` (`create-note-head.js:47`), and `(x + a) - x` is not `a`:
deriving it broke `abcjs-parse-note-01`, **which the widened ratchet caught in the same
run**. `PlacedGlyph.dx` carries the constructed number; absent means derive, which is what
every other glyph still does. **The element's own `x` is `headX`** — abcjs's anchor is the
STEMMED HEAD, whose `dx` is 0, measured through `RelativeElement.setX`. Reading `el.x` as
the element's left edge put a down-stem flag 7.4px out on the first attempt.

### 2.8 A BRACE WITH A HEADER OWNS THE VOICE NAME

    // If only the start brace has a name then the name belongs to the brace
    // instead of the staff.
    if (this.startVoice.header && !this.endVoice.header) {
      this.header = this.startVoice.header;
      delete this.startVoice.header;
    }

(`creation/elements/brace-element.js:9-14`.) `drawBrace` then opens
`<g class="staff-extra voice-name" data-name="brace">`, draws the name at the PAGE's left
padding and at the BRACE's own vertical midpoint less
`baselineToCenter(header, 'voicefont', …, 0, 1)`, draws the path, and closes
(`draw/brace.js:78-98`). **The `delete` is what stops the voice drawing it a second time**,
and the baseline records the loss as a REMOVED `voiceName` element — which is the finding
rather than a regression. Counting the voice-name text in BOTH engines across all 171
fixtures, bare and brace-owned kept apart: **171 match / 0 differ.**

Three more came out of the same fixture, each one a read:

- **THE BRACE'S OWN x IS PAST THAT NAME.** `params.x` is `getLeftEdgeOfStaff`'s running `x`
  BEFORE the connector's width joins it — `padding.left + voiceheaderw`, where
  `voiceheaderw` is the widest voice or brace header plus the width of an `"A"`, and 0 when
  there is no header at all (`get-left-edge-of-staff.js:2-27`). Ours drew every brace at the
  page margin, 53.875px left on a named grand staff. **BUILT, not subtracted from the left
  edge**: `(connector + widest + widthA) - connector` is not `widest + widthA`, and a brace
  drawn off that landed one ULP out.
- **AND THE LEFT EDGE IS `(padding.left + voiceheaderw) + ofs`, IN THAT ORDER.** Ours summed
  the indent's three terms first and added the margin last, which put every prefix glyph of
  a named grand staff one ULP out.
- **A BRACE'S ENDS COME OFF `staff.absoluteY`, ONE PRODUCT EACH** —
  `absoluteY - spacing.STEP * 10` and `- spacing.STEP * 2` (`draw/brace.js:8-14`), 10 being
  the top staff line and 2 the bottom. Ours summed a system-relative edge and the system's
  origin, and every control point of the curve is `yTop + yHeight / k`.

### 2.9 `%%voicefont` IS REALIZED, AND A POSTSCRIPT NAME CARRIES ITS WEIGHT
The label was hard-coded to a bold 17px Times — the DEFAULT resolved — so
`%%voicefont Helvetica-Bold 10.0` drew at the default while `voiceNameWidth`, and therefore
the whole indent, already read the directive.

**AND `fontTranslation` IS A TABLE, NOT A SUFFIX RULE.** abcjs maps each PostScript name to
a WEB family plus a weight and a style (`abc_parse_directive.js:62-160`), so `Helvetica-Bold`
draws `font-family="Helvetica" font-weight="bold"` and not a family no browser has. Ours read
the suffix for the weight — correctly — and then wrote the whole PostScript name into
`font-family`. All 34 rows are transcribed rather than derived by splitting on `-`: a family
can contain a hyphen (`Times-Roman` is one face) and the faces are not all one word
(`Bookman,serif`, `"Helvetica Narrow",Helvetica`).

### 2.10 A TEMPO'S PARTS ARE INTERLEAVED
`drawTempo` renders `preString`, THEN walks `params.note.children` for the glyphs, THEN
writes `"= " + bpm`, and finally `postString` (`draw/tempo.js:18-38`). Ours put every glyph
of the element out before any of its texts — right for a note, wrong here: the mark read
`♩ Easy Swing = 140` instead of `Easy Swing ♩ = 140`. Keyed on abcjs's own `name: "pre"`.

### 2.11 A `P:` LABEL IS `renderText`'s ELEMENT, AND `draw/text.js` HAS THREE MORE RULES IN IT
Without a `font` the emitter fell through to its ad-hoc `<text font-family="serif">`, which
carries none of abcjs's attributes. Reading `renderText` gave the rest:

- **abcjs's `partsfont` DEFAULT IS WEIGHT `normal`** (`abc_parse_directive.js:27`); ours
  hard-coded bold.
- **A BOXED FONT SHIFTS A `start`-ANCHORED TEXT RIGHT BY ONE PADDING AND DELETES ITS CLASS**
  (`draw/text.js:49-60`) — two attributes, both measurable.
- **AND THE PADDING BELONGS TO `renderText`**, which adds it to the baseline at draw time, so
  adding it to the lane's baseline too counted it twice.
- **THE RECT IS `renderText`'s**, drawn from the text's own `getBBox()` and wrapped in its own
  group ONLY when the caller is not `alreadyInGroup` — which a `P:` label is. Our four
  separate rules are gone. Counting `data-name="box"` in BOTH engines: **6 fixtures differed
  before, 3 after, none newly wrong.**

### 2.12 `Q:` TAKES A QUOTE ON EITHER SIDE OF THE RATE
abcjs shifts tokens in order: a leading `quote` is `preString`, and a `quote` still there
once the rate has been read is `postString` (`abc_parse_header.js:257-330`). So
`[Q:"left" 1/4=170"right"]` is TWO strings, one each side, and **which side decides which —
not the content**. Ours took the first quote as the direction and dropped any second.

### 2.13 A LONE AUXILIARY BEAM IS A 5px STUB, AND ITS SIDE IS A FOUR-WAY RULE

    if (isFirstNote)              end = x + 5      // always right
    else if (isLastNote)          end = x - 5      // always left
    else if (prevDur === nextDur) end = i % 2 === 0 ? x + 5 : x - 5
    else                          end = prevDur < nextDur ? x + 5 : x - 5

(`layout/beam.js:215-238`.) Ours pointed backward whenever the note was not the first —
the first two arms only — and used a stub length of 1.1 staff spaces that nobody chose.
**AND THE TWO ENDS ARE NOT SYMMETRIC**: the stub STARTS at `x + (asc ? -0.6 : 0)` and ENDS
at `x ± 5`, while its start y is sampled at `x` itself, so an up-stem's stub spans 4.4 and
a down-stem's 5. Fifty-three baseline rows on `ragtime-nightingale` alone, all 1-for-1.

### 2.14 A TRIPLET JOINS THE `otherchildren` MERGE
A `TripletElem` and a `DynamicDecoration` share abcjs's ONE add-order list, so they
interleave; ours wrote every triplet ahead of every dynamic. A VOLTA still goes straight
out, which is where `drawStaffGroup` puts it.

### 2.15 THE BELOW-DYNAMICS LANE MUST NOT MEASURE THE UNPLACED HEADING BLOCK
The top-text block rides the first staff of the first system so the extent can account for
it, but when `anchorBelowStaff` runs its rows still carry their BLOCK-LOCAL y — positive
and large. `anchorAboveStaff` filters it out for exactly that reason; this did not, so a
tune with a heading measured its own composer row as ink **189px BELOW the staff** and
dropped the lane 160px past it. `visual-selection-01`'s `!mp!` sat below the SECOND staff
of a three-staff system where abcjs puts it below the first.

### 2.16 A HAIRPIN TAKES THE DYNAMICS LANE FOR ITS OWN SYSTEM, AND ITS OWN SIDE
`hasVocals` is set once per LINE (`abstract-engraver.js:110`) and `createDecoration`
defaults `volumePosition` to `hasVocals ? 'above' : 'below'` (`creation/decoration.js:379`),
so a tune whose lyrics start on its SECOND system puts the first system's dynamics below
and the rest above. `layoutSpanners` took the TUNE-WIDE flag — **and the recorded
`ponytail:` said "the corpus never varies" it.** `visual-selection-01` varies it, and it is
118px of hairpin, while the volume marks beside it, which do read it per system, were exact.

**AND THE SHIFT HAS TO MATCH THE SIDE.** `anchorBelowStaff` stamped a below shift whenever
a hairpin was present at all and the merge applied it to every dynamic line, so an ABOVE
hairpin was moved by the below lane's number — 2.15px on a singing control.

**THE FOUR OF THESE CAME OUT OF ONE FIXTURE AGAIN**, and three of the four are invisible to
every ranked table: a hairpin carries no notehead class, the baselines say CHANGED rather
than WRONG, and the byte table could only see them once everything before them closed.

### 2.17 THE BEAM'S OWN ARITHMETIC AND MARKUP — and the `otherchildren` ORDER

- **AN AUXILIARY BEAM'S START y IS SAMPLED AT THE NOTE'S OWN x**, not at its offset start.
  `auxBeams[index] = { x: x + (asc ? -0.6 : 0), y: bary + sy * (index + 1) }` with
  `bary = getBarYAt(…, x)` (`layout/beam.js:174-188`) — the x carries the inset and the y
  does not, so on a SLANT a deeper beam's left edge sits `0.6 × slope` off the line its own
  x lies on. **65 → 63 of 171 and 49 baseline rows** on `ragtime-nightingale`.
- **A CURVE IS ON `otherchildren` TOO, AND THE LIST SORTS ON THE CLOSE.** `addOther` is one
  list and `drawVoice` walks it once, so a slur, a hairpin, a dynamic and a triplet
  interleave — and both a curve and a hairpin are added by their CLOSING decoration, so
  `!<(! (bfdf) (3B2d2c2 !<)!` writes the slur first even though the hairpin opens to its
  left. Sorting on the opening x gets it backwards.
- **A GRACE BEAM IS A `<path>` LIKE ANY OTHER**, one per group with every level in its `d`
  and always a `class` attribute; ours wrote a `<polygon>` per beam. The path builder is
  shared with the ordinary beams now rather than duplicated.
- **AND A BEAMED GRACE GROUP'S STEMS COME AFTER THE ELEMENT'S LEDGERS.** `addGraceNotes`
  runs inside `createNote`, before `ledgerLines`, but a beamed group's stems come from
  `createStems` in the LAYOUT phase — `stem.setX(parent.x); parent.addRight(stem)`
  (`layout/beam.js:135-140`) — appending them to a child list `createNote` finished with
  long ago. An UNBEAMED grace's stem is built in the loop and stays with its own head.

Together these took the two big fixtures from byte 12305 to **74220 of 202156**.

### 2.18 A GRACE NOTE IS A SIXTEENTH, SO A BARE GRACE GROUP TAKES TWO BEAMS

`abc_parse_music.js:694-695` divides a grace's parsed duration by `default_length * 8`
under its own comment — *"The grace note durations should not be affected by the default
length: they should be based on 1/16"* — so `{CD}` draws two beams whether the tune says
`L:1/4`, `L:1/8` or `L:1/16`. Measured through abcjs at all three; ours drew one.

**AND THE FIRST ATTEMPT WAS WRONG IN BOTH DIRECTIONS, WHICH IS WHY THIS ONE IS
INSTRUMENTED.** Reading the two engines' `d` strings side by side could not say which of
abcjs's two subpaths the stems reach, and a plausible reading put the whole stack a pitch
out. A `console.error` in `createAdditionalBeams` answered it in one run:

    AUX j=0 isGrace=true sy=-1 bary=6 startY=4.0566 endY=5 beam.startY=5 beam.endY=6

— so the MAIN beam is `params.beams[0]` at pitch 5→6, the aux is ONE pitch below it, and
its start y is sampled at the note's own x while its start x keeps the 0.6 inset (the same
asymmetry §2.17 found for ordinary beams). `yAt(beamStartX + inset) + 1 pitch` to
`yAt(beamEndX) + 1 pitch`, and the control went byte-identical.

Counting beam LEVELS in both engines across all 171 fixtures: **161 match before, 169
after**; the two left are pre-existing and named (`%%voicecolor`, and `!beambr1!`'s split).

### 2.19 THE LAST OF THE BIG FIXTURE — 99.2% OF 202,156 BYTES

- **`%%vocalfont`'s FACE on a lyric.** The size and weight were realized and the face was
  not, so `%%vocalfont Helvetica 10.0` drew every syllable in the default Times New Roman
  at the right size — the same half-realization the voice name had.
- **AN ENDING IS ON `otherchildren` TOO**, so it takes its turn in the one add-order list
  rather than preceding all of them.
- **AND AN ENDING AND A TRIPLET TAKE THEIR TURN AT THEIR START, WHERE A CURVE AND A HAIRPIN
  TAKE THEIRS AT THEIR CLOSE.** Measured: abcjs writes a single-letter dynamic at x 120.63
  BEFORE an ending spanning 309.86…777.54, and that same ending BEFORE a hairpin closing at
  698.49. Only a start key gives the first and only a close key the second.
- **A TEMPO MARK'S NOTEHEAD SITS ON A PITCH.** `set-upper-and-lower-elements.js:209` gives
  it `element.pitch - totalHeightInPitches + 1` — the tempo rung less five — and
  `printSymbol` draws it at `calcY` of that, ONE product, where ours reached the same place
  through the text baseline and four y terms. Instrumented: `incTop` reports a rung of
  20.79664516129032 on `synth-flattener-25` and `printSymbol` the notehead's offset as
  15.796645161290321, exactly five below. **Three fixtures.**

`visual-selection-01` and its twin are now at byte **200613 of 202156**, and what is left
is 0.17px of one slur's y.

### 2.20 THE TOP-BLOCK LEAD IS ABCJS'S EIGHT ADDS, SPENT AS ONE TERM LIST

Instrumented on `visual-tablature-08` (`T:First` / `T:Second`), abcjs's page cursor reads

    15 → 22.56 → 55.56 → 59.34 → 85.34    padding.top, then four nonMusic ROWS
         → 92.9                            spacing.music
         → 154.23000000000002              staffSeparation, the 6.7.0 else-arm
         → 207.41200000000003              + STEP × 13.724387096774194

**Eight adds and one product.** Ours summed the whole lead into ONE number and subtracted
the extent's y, reaching `207.41199999999998`.

**A FIRST ATTEMPT FAILED AND THE SECOND ONE PRINTED EVERY PIECE FIRST.** The failure took
`pixel-parity` to 9 of 120 because it added `spacing.music` a second time and split
`blockSpan` as though the two were disjoint. One `console.error` of every input settled it:
**`topAdvances` ALREADY ENDS WITH `spacing.music`, and `blockSpan` IS its sum.** So the lead
is `[...topAdvances, separation]` and nothing else.

The list closes on a REMAINDER spent only when it exceeds a nanopixel — `visual-options-01`
carries one extra `spacing.music` these terms do not name, and below that threshold the
value is the same quantity by a different association, so keeping it took the byte table
59 → 60. **`ABCTS_CHECK=1` asserts the walked origin and the system-relative one agree**,
which is how `options-01`'s shape was found at all; it reports 0 mismatches across the
corpus and is the guard against a term list that silently stops describing a shape.

**TWO MORE FELL OUT OF IT.** A BLOCK STAFF'S TOP IS A PITCH TOO, now that the music-only
extent reports one — `calcHeight` sums `staff.top`, which knows nothing about the top text.
And THE HEIGHT WALK SPENDS THE SAME LIST: it used to add `topAdvances` and then
`first.leading - named`, which is the separation reached by subtracting two sums, and
`(61.33 + 77.89999999999999) - 77.9` is not `61.33`. **59 → 57**, and glyph-y ULP tokens
58 → 49.

### 2.21 `calcSlurY`'s MID-STEM ARM, WHICH A `ponytail:` PREDICTED WAS A NO-OP

    if (above && a1.stemDir === 'up' && !fixedY) startY = (a1.highestVert + a1.pitch)/2
    else                                          startY = a1.pitch
    if (above && a2.stemDir === 'up' && !fixedY && !beamInterferes && midPoint < startY)
                                                  endY = midPoint
    else  endY = above && beamInterferes ? a2.highestVert : a2.pitch

(`tie-element.js:163-200`.) Only the BEAMED override that follows it was ported, and the
`ponytail:` beside it said the mid-stem arm is a no-op because *"`highestVert` IS the anchor
pitch on every binding curve here"*. **A PREDICTION.** `visual-slurs-02` denies it: `(E2D2)`
is two UNBEAMED quarters, instrumented abcjs reports `pitch 2 / highestVert 8`, and its slur
sits three pitch — 11.62px — above ours.

**AND THE ARITHMETIC WAS ALREADY IN THE FILE**, because the same branch carries the x bump
that WAS ported: `midPointY`, `highPitch`, `beamInterferes` and `startYAtTest` all existed
and only the y read them. Instrumenting BOTH sides is what narrowed it — our `fixed.top` for
the beamed anchor is `12.988226417082117`, exactly abcjs's, which ruled the beamed branch out
and left the unbeamed one.

Five baselines moved 1-for-1, every row a slur endpoint rising 11.625px. **`pixel-parity` and
the harvested table cannot see a slur at all** and stayed at 0 throughout — the third time
this branch has had to lean on the byte table for an axis no other gate expresses.

---

## 3. WHAT IS LEFT — the table's shape, measured

Classified by aligning on the FIRST DIFFERING CHARACTER and comparing the numeric token
that spans it (§4 of `CHECKPOINT-2026-08-11.md` has the recipe; a cruder test sends you at
the wrong family):

| | rows | ULP tokens | fixtures carrying them |
|---|---|---|---|
| glyph y | — | **49** | 5 |
| glyph x | 13 | **36** | 13 |
| root `width`/`height` | — | 2 | 2 |
| **structural** | **~30** | — | — |

At the session's midpoint this read **glyph-x 265 tokens across 33 fixtures** and the root
5 across 5. **The arithmetic families are down to 87 tokens between them.**

### 3.1 THE TWO ULP FAMILIES, EACH NAMED

**GLYPH-y — 58 tokens, SIX fixtures**, and 27 of them are `visual-slurs-02-score-s-a-t-b`
alone. **The tempo notehead that used to be four of them is closed (§2.19)**, and what is
left is dominated by §2.20's leading walk. The old note is kept below because its shape is
the one to look for:

    abcjs   noteheads.quarter  offset = 15.796645161290321   calcY = 41.934999999999995
    ours                                                             41.935

That offset is `staff.top` at the tempo rung — the above-ladder's own running pitch — and
abcjs draws the mark's notehead at `calcY(pitch)` directly (`draw/relative.js:9`, the
`params.note.children` loop in `draw/tempo.js:26-28`). Ours reaches it by SHIFTING the
whole tempo element by `tempoY - stepToY(ENGRAVE.tempoStep)`, where `tempoY` is the TEXT
baseline (`reserve(tempoHeightAbove) + tempoTextSize + tempoDescenderBump`). **It is the
place-not-shift finding one axis over**, and it needs `aboveLadder` to return the rung's
PITCH beside its y — which `spend()` already has in hand.

**GLYPH-x — 36 tokens, 13 fixtures**, no single dominant fixture (8, 6, 6, 5, 4, 4, then
ones). Mixed glyph kinds: accidentals, plain heads, a tempo notehead. The next one to open
is `visual-transpose-03`, still down to ONE token in 55,703 bytes — the `^^F` head's x. Its
accidental is EXACT and its head is not, which says the residual is in what `headX` is built
from (`(x + graceWidth) + accidentalWidth`) rather than in the solve, now that the solve is
abcjs's. The `PlacedGlyph.dx` mechanism from the place-not-shift landing is the tool:
construct the offset, do not derive it.

**What is NOT the problem, checked:** the justification is already abcjs's shape — eight
passes, each re-running the whole line solve, the eighth discarded (`layout/layout.js:65-79`;
ours at `layout.ts:8673`). And `layoutOne`'s cursor arithmetic is ours term for term:
`er = x - voice.minx`, `if (er < extraWidth) x += extraWidth - er`,
`voice.minx = x + getMinWidth(child)`.

### 3.2 THE STRUCTURAL THIRTY-TWO — half the open table
`CHECKPOINT-2026-08-11.md` §4.2 lists each with abcjs's own citation. **Five of its rows
closed this session** (§2.8-2.12): the brace with a header, the brace's x, a tempo's part
order, the `P:` label, and the `Q:` post-string. What is left there is unchanged and still
the better place to spend a session — the arithmetic families are down to 108 tokens
between them.

**AND THE TWO BIGGEST FIXTURES IN THE CORPUS ARE NOW WORTH READING.**
`visual-selection-01` and `visual-svg-per-line-01` are the same 202k-byte tune and went
from byte 3038 to byte 11121; what stops them next is a CURVE's path, which is a family
none of the rows above names. Run `/tmp/gp/tok.mjs` on one of them before picking anything
else — a fixture that large names several defects per read.

### 3.3 WHAT §3 OF THE PREVIOUS CHECKPOINT STILL OWES
- **`anchorLyrics` is not abcjs's placement**, so `lyricLanePitch` — measured, correct to
  the last digit — still cannot be spent. Untouched today.
- **Everything else is a producer that does not yet supply `reservePitch` / `pitchRange`.**
  Three landed today (the beamed stem, the close decoration, the stacked ornament). Ten
  fixtures still carry a glyph-y ULP; the list is in §5's probe output.

---

## 4. THE RATCHET NOW HOLDS EVERYTHING GREEN

`svg-bytes.test.ts`'s `PASSING` held **seven** slugs while **eighty-nine** fixtures were
byte-exact — **104 now, and it has already paid for itself twice more**: it caught
`abcjs-parse-note-01` regressing under the place-not-shift port, and then
`abcjs-synth-flattener-14` under the first attempt at the flag's `dx`. Both were found in
the same run that made the change, not by hand-diffing afterwards. Twice today a fixture went from byte-exact to differing **while the aggregate
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
- **PLACE, DON'T SHIFT.** Wherever the layout moves something into position, ask whether
  abcjs adds a STORED offset to a solved coordinate. Four of this session's seven landings
  are that one question, on four different quantities.
- **AN ITERATION VARIABLE IS PART OF THE PORT TOO.** Ours solved for a dimensionless factor
  where abcjs solves for the spacing itself; the two agree in exact arithmetic and differ by
  a multiply and a divide per element per pass. Eleven fixtures.
- **A REFACTOR IN THIS FAMILY CAN MOVE REAL PIXELS.** Placing elements but still SHIFTING
  their beams put 8.51px of dy on `ragtime-nightingale`. Re-read `pixel-parity` and the
  harvested table after every step, not at the end.
- **A REMOVAL IS A FINDING WHEN A COUNT SAYS SO.** Two landed this session on removals the
  baseline flagged — the brace taking the voice name off the staff, and `renderText` taking
  the box off `partBox`. Both were settled by counting the thing in BOTH engines across all
  171 fixtures (`171 match / 0 differ`; `6 fixtures differed before, 3 after`). Write the
  count, not the argument.
- **ONE SOURCE FILE CAN HOLD SEVERAL FINDINGS, AND READING IT WHOLE IS CHEAPER THAN
  RETURNING.** `draw/text.js` gave four in one pass (the box's padding shift, the deleted
  class, `alreadyInGroup`, and where the rect is measured); `draw/brace.js` gave three. When
  a fixture points at a function, read the function rather than the line.
- **AND THE FIXTURE THAT POINTS AT ONE IS USUALLY THE BIGGEST.** `visual-selection-01` is
  202k bytes and named NINE separate defects in one sitting, each revealed only once the one
  before it closed. A large fixture is not a hard fixture; it is a DENSE one — and a BYTE
  comparison is what makes it one, because it walks the whole file in order and stops at the
  first thing wrong.
- **PRINT EVERY INPUT BEFORE CONSTRUCTING THE TERM LIST.** §2.20 failed once by reasoning
  about which terms `blockSpan` and `topAdvances` hold, and closed in one step after a
  `console.error` printed both. The failure cost a full suite run; the print cost nothing.
- **AND LEAVE THE ASSERTION BEHIND.** `ABCTS_CHECK=1` compares the walked origin with the
  system-relative one and is what found the shape the term list did not describe. A term
  list is a claim about every shape in the corpus; make it checkable.
- **A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A WRITTEN-DOWN MEASUREMENT.** The grace-beam
  level count is certain and its geometry is not; the implementation was reverted and §2.18
  records both engines' output verbatim plus the three questions to settle. A guess that
  moves four tests red teaches the next session nothing.
- **A `ponytail:` THAT SAYS "THE CORPUS NEVER VARIES THIS" IS A PREDICTION, NOT A
  MEASUREMENT.** The hairpin's tune-wide `hasVocals` carried exactly that note, and one
  fixture in 171 varies it — worth 118px. When a shortcut is justified by what the corpus
  does, COUNT the corpus.
