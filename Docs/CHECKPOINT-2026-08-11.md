# CHECKPOINT — 2026-08-11

**abcts, `main`.** The suite is **1158/1158** with no reds, `npx tsc --noEmit` is clean,
and everything below is committed and pushed.

---

## 1. THE STATE

| Gate | Ranked table | Now | Where it opened |
|---|---|---|---|
| Audio events | `abcts-audio-ranked` | **0 of 72** | 54 of 54 |
| Note timings | `abcts-timing-ranked` | **0 of 38** | 13 of 13 |
| Chord grids | `abcts-chordgrid-ranked` | **0 of 23** | 12 of 23 |
| MIDI files | — | **0 of 3** | 3 of 3 |
| Harvested geometry | `abcts-corpus-ranked` | **0 of 174** | 60 of 174 |
| Pixel targets | `abcts-pixel-ranked` | **0 of 120** | 11 of 120 |
| Element timings | — | 1 of 13 (abcjs's own quirk, NAMED) | 13 of 13 |
| DOM contract | — | **1 of 25**, 24 slugs RATCHETED | 25 of 25 |
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **95 of 171**; best 52498, median 7181 | 171 of 171 at byte 10 |

**`svg-bytes` is the one open gate**, and `DIVERGENT` is still EMPTY.
It came into this session at 117 of 171 (median 6228) and stands at **95 of 171**
(median 7181) with **76 fixtures byte-exact**.

The ROOT element: **145 byte-exact / 23 ULP-only / 3 structural**, from 144/24/3.

---

## 2. THE LANDINGS, and what each one's LESSON is

Every one is a read of a named abcjs function. In the order they closed:

### AN UNBEAMED GRACE CARRIES A FLAG, AND WE DREW NONE AT ALL
`addGraceNotes` passes `flag = gracebeam ? null : chartable.uflags[3]` — a `flags.u8th`,
NOT a `flags.ugrace`; that glyph is the acciaccatura SLASH and is added separately
(`abstract-engraver.js:492-505`). `createNoteHead` then places it with the same arithmetic
as any other note's, `pos = pitch + 7 * scale` and `xdelta = headx + notehead.w - 0.6`.

**No gate here could state it.** It is not a notehead, so `pixel-parity` and the harvested
table never paired it; and its `RelativeElement` takes no `thickness`, so
`top === bottom === pitch` and it reserves a POINT the stem already covers — **every extent
agreed with the glyph missing.**

Its stem's foot was on the wrong side too: `p1 = gracepitch + 1/3 * gracescale` is a PITCH
offset, and pitch runs the other way from y. Measured on `{e}a`: abcjs 108.06, ours 109.61
— the whole 1.55 is twice that term, which is **the signature of a flipped sign**.

### A `%%text` BEFORE THE MUSIC IS A nonMusic LINE, NOT TOP TEXT
`draw()` closes `abcjs-meta-top`, spends `spacing.music`, and only THEN walks `tune.lines`,
where a `%%text` / `%%center` / `%%begintext` stands as `abcLine.nonMusic`
(`draw/draw.js:12-58`). Each is its own `<g class="abcjs-non-music">`, and each runs
`classes.incrLine()` — so the staff after two of them is `abcjs-l2`.

**A SUM CANNOT SEE AN ORDER.** The comment this replaced reasoned from the TOTAL — "we
place the block `musicSpace` above the music, so that same 7.56 is already accounted for on
the other side" — and the total was right, which is why the root's `height` matched to the
byte while every free-text row sat 7.56px high.

**And measuring settled where the parser could not**: a `%%text` written BEFORE `K:` and one
written after it produce byte-identical output through abcjs, so the placement is not a
parser question at all.

### LEDGERS RUN ONCE PER ELEMENT, OUTERMOST FIRST
`ledgerLines(abselem, elem.minpitch, elem.maxpitch, …)` runs ONCE with the chord's two
extremes (`abstract-engraver.js:850`), and each loop starts at the note and walks BACK
toward the staff — `for (i = maxPitch; i > 11; i--)` and `for (i = minPitch; i < 1; i++)` —
so the rule furthest from the staff is written FIRST. Ours ran per head, from the staff
outward: `[F,^G,]` drew five rules where abcjs draws four, in the reverse order.

**AND THE SHIFTED HEAD OF A SECOND GETS ONE EXTRA RULE, NOT A STACK** — `additionalLedgers`
collects `verticalPos - verticalPos % 2` per displaced head outside the staff
(`:657`, `:459-463`).

The check that made this safe was **counting `data-name="ledger"` across all 171 fixtures**:
171 match, 0 differ. The baseline diff had unmatched REMOVALS in it, which the recorded rule
says means something broke — the count is what proved they were the duplicates.

### A TIE CHOOSES ITS SIDE BY A DIFFERENT RULE FROM A SLUR
`calcTieDirection` and `calcSlurDirection` are two functions with two comment blocks
(`tie-element.js:54-115`), and they part company on the MIXED case: a slur asks only whether
ANY stem points down; a tie falls back to `referencePitch >= 6` when its two stems disagree.
We gave both the slur's rule.

**AND A WHOLE NOTE HAS A STEM DIRECTION.** `createNoteHead` assigns `notehead.stemDir = dir`
before it returns, drawn or not. Ours derived it from the drawn LINES, so a whole note read
as stem-down and its tie went to the wrong side of the staff on every fixture that has one.

### AN INCOMING CURVE-HALF IS A FIXED 20px STUB, AND IT IS NEVER OMITTED
With `anchor2` and no `anchor1`, `calcX` writes `startX = anchor2.x - 20` — "There is no
element and no repeat mark: make a small arc" (`tie-element.js:126-127`). `lineStartX` is
reached only when there is no anchor at ALL. Ours resumed after the new system's PREFIX and
then DROPPED the half whenever the first note sat close behind it, with a `ponytail:` note
explaining that engraving would reserve room. abcjs reserves none and overlaps the clef
quite happily. **Four of `parse-tie-slur-01`'s eight curves were halves we declined to draw.**

**AND `lineEndX` IS THE VOICE'S WIDTH MINUS ONE** — `var width = params.w - 1` at the top of
`drawVoice` (`draw/voice.js:12`), which is what a tie or an ending with no closing anchor is
handed. One pixel, on every curve running off the end of a system.

### AN ARC IS BUILT FROM ITS ROUNDED ENDPOINTS, WITH `sqrt` AND NOT `hypot`
`drawArc` opens `x1 = roundNumber(x1 + 6); x2 = roundNumber(x2 + 4)` and
`y1 = roundNumber(calcY(…))` (`draw/tie.js:63-67`), so `norm`, `flatten` and every control
point come off the ROUNDED chord. And `norm` is `Math.sqrt(dx * dx + dy * dy)`.

**`Math.hypot` is the more accurate of the two, and that is exactly why it is wrong here.**
A better formula is still a different formula: one ULP of `norm` lands a control point on
the far side of a `toFixed(2)` boundary and prints 155.47 where abcjs prints 155.46. Five
fixtures.

### A PERCUSSION CLEF SITS ON THE MIDDLE LINE AND STILL READS LIKE TREBLE
abcjs's table gives it `{ pitch: 6, mid: 0 }` where treble is `{ pitch: 4, mid: 0 }`
(`abc_parse_key_voice.js:35`) — **its two columns disagree**: the GLYPH goes on line 3 and
the PITCH mapping is treble's. Ours derives the mapping FROM the line, so line 2 drew the
glyph 7.75px low on all four percussion fixtures. Line 3 plus a matching `CLEF_REFERENCE`
moves the glyph and nothing else.

### A MULTI-MEASURE REST'S COUNT IS `renderText`'s ELEMENT
`drawRelativeElement`'s `multimeasure-text` arm writes it at `params.x + params.w / 2` in
`tempofont` with `klass: generate("rest")` and NO `name` (`draw/relative.js:54-56`). Ours
had no `font`, so the emitter fell through to its ad-hoc `<text font-family="serif">` — and
it sat half a glyph left, **which no gate could see because a count is not a notehead**.

### A BRACKET'S NUMBER IS `renderText`'s ELEMENT TOO, AND THE TWO WRITERS DISAGREE ON A SPACE
`drawEnding`'s `sprintf("M %f %f L %f %f ", …)` ends each segment with a trailing space;
`drawTriplet`'s `drawLine` does not (`draw/ending.js:14`, `draw/triplet.js:18`). One byte per
segment, and **a quirk to reproduce rather than one of them to pick.**

**THE HOOK TURNS AWAY FROM THE NOTES**, not toward them: `bracketHeight = up ? 5 : -5` with
the segment running `y1 → y1 + bracketHeight`, so an UP bracket's hooks point DOWN in SVG's
y. Ours pointed the other way on every bracket in the repo.

**AND THE BROKEN ENDS SIT ON THE SLOPE**: `slope = (y2 - y1) / (x2 - x1)` then
`leftEndY = y1 + (leftEndX - x1) * slope` (`draw/triplet.js:35-41`), so the two segments are
COLLINEAR with the line they came from. Ours ran both inner ends to the NUMBER's y — level
when the bracket is level, and out by a couple of tenths when it is not.

### A VOICE NAME IS `headerPosition`, AND IT WEARS NO GROUP
    headerPosition   = 6 + baselineToCenter(...) / STEP
    baselineToCenter = height * 0.5 + (total - index - 2) * fontSize

(`abstract-engraver.js:154`, `helpers/get-text-size.js:53-59`) — the MEASURED height of the
label, halved, plus one whole font size per voice BELOW this one on the staff, less two.
Ours centred on the middle line and stepped by a line-skip from the group's own midpoint,
which agrees on a staff of ONE voice and nowhere else, and sat 6.01px low even there.

`drawVoice` renders it before it walks `params.children` at all, with `alreadyInGroup = true`
(`draw/voice.js:17-20`), so abcjs writes a bare `<text data-name="voice-name">` as a SIBLING
of the staff's elements.

**AND IT RESERVES NOTHING.** It is not an `AbsoluteElement`, so it never enters `staff.top`.
Its ink does reach above the middle line, and letting the extent see that pushed
`ave-verum-corpus`'s second staff 2.98px down the moment `headerPosition` moved it — caught
by `pixel-parity`, not by the byte table.

### EVERY VERSE OF A LYRIC ENDS WITH A NEWLINE, THE LAST ONE INCLUDED
`lyricStr += ly.syllable + div + "\n"` (`abstract-engraver.js:770-773`), so a
single-syllable lyric is `"L\n"` — TWO lines — and `renderText` gives it a second, EMPTY
`<tspan dy="1.2em">`. Not a stray: `lyricDim.height` measures the same two lines, which is
why abcjs's lyric lane is a whole line taller than one syllable needs.

The emitter's music-text path passed `[]` for `extraLines`, hard-coded, so no music text
could ever be multi-line.

### A STEM'S TWO ENDS ARE PITCHES, CONVERTED ONCE
`p1 = minpitch + 1/3`, `p2 = maxpitch + stemHeight` going up and the mirror going down, each
clamped to pitch 6 and only THEN handed to `calcY` (`abstract-engraver.js:740-762`). Ours
added a LENGTH to a y — `stepToY(step) ± 7 * STEP` — the same value through two products
instead of one, printing 60.54 where abcjs prints 60.53.

### A DYNAMIC IS LETTERS, ONE PATH EACH, IN A GROUP
`printSymbol` branches on `symbol.length > 1 && symbol.indexOf(".") < 0` and opens
`<g data-name="dynamics">` round one path PER CHARACTER, each drawn with `{stroke, fill}`
alone — no name, no class (`draw/print-symbol.js:16-31`) — and the step between them is
KERNED: `f`+`f` is two thirds of an `f`, `p`+`p` five sixths of a `p`, `f`+`z` five eighths.

SMuFL PRECOMPOSES them, so ours drew one `dynamicPPPP` — **a Bravura figure reachable in
strict, the class the 2026-08-05 audit closed**, surviving because the name was ABSENT from
`SMUFL_TO_ABCJS` rather than present and wrong. An absence in that table is usually the
parity behaviour, which is exactly why this one hid.

`sfz` still draws precomposed and is recorded rather than faked: abcjs composes it from
`s`, `f` and `z`, and this repo's Bravura table has no single-letter `s` or `z` to name.

**AND `otherchildren` IS ONE INTERLEAVED LIST IN ADD ORDER**, so a hairpin written between
two dynamics is drawn between them. Ours held two buckets and emptied the dynamics one
first; they merge by x now, which is the add order for a single voice.

**AND A GATE WENT RED ON IT** — `above-lane-order` keyed on `data-name="dynamics"` being on
the PATH, which it no longer is. The fix is in the REPRESENTATION: `pixel-geometry` now
gives a child the enclosing group's `data-name`. Fourth time on this branch.

### A HAIRPIN RUNS ELEMENT-x TO ELEMENT-x, EIGHT BELOW ITS LANE, AND SHARES THE DYNAMICS' ANCHOR
`left = anchor1.x`, `right = anchor2.x` — the elements' own x, not their edges
(`draw/crescendo.js:12-13`); ours ran to the closing element's RIGHT edge, a whole notehead
too far. `y = calcY(params.pitch) + 4` and `height = 8`, so the mouth is centred
`calcY(pitch) + 8` at BOTH ends.

**AND A REST ANCHORS ONE**: `!<(!GABc|!<)!y` closes on the `y` SPACER, and skipping rests
lost the hairpin outright.

**AND THE LANE ARRIVES TOO LATE TO BE ANCHORED.** `spannerLines` is EMPTY when
`anchorBelowStaff` runs — spanners resolve across the whole tune, after packing — so a
hairpin never got the shift that puts the below-dynamics lane on the music's ink, and sat
on the raw lane constant while every volume MARK beside it was exact. The shift is recorded
on the staff and spent at the merge. **AND ITS OWN RESERVE HAD TO BE IN THAT EXTENT TOO**:
a dynamic GLYPH sets the flag from the elements, so a staff carrying a mark was consistent
by accident and one whose only dynamic is a crescendo came out 7 pitch — 27.13px — high.

### AN INLINE `[Q:]` IS DRAWN WHERE IT STANDS
`createABCLine(staff, !hasPrintedTempo ? abcTune.metaText.tempo : null, i)` prints the
HEADER tempo once, and `metaText.tempo` is set by the FIELD parser, which an inline field
never reaches. Five inline `[Q:]` and no header one: abcjs draws five marks, we drew six.

### A SUBTITLE IS PAPER-CENTRED AND A `%%center` IS NOT
`engraver-controller.js:238` hands `Subtitle` a `center = width / 2 + padding.left` — 350 on
a 700px page — where `FreeText` centres on `width / 2` with no padding, 335. Ours gave both
335.

### A BOXED FONT DRAWS FOUR FILLED RULES, INSIDE A GROUP
`renderText` opens `<g fill data-name>`, moves the text in by one `padding` on both axes,
DELETES its class, and after drawing measures `getBBox()` to lay a rect round it
(`draw/text.js:48-81`) — which `Svg.rect` writes as a PATH of four one-pixel bars "so that
it can be hollow and the color changes with fill instead of stroke". `padding` is
`font.size * 0.1`, everything is `Math.round`ed, and `lines.join(" ")` over four pieces that
each already END with a space is where the DOUBLED spaces in the `d` come from.

### AN UNBEAMED GRACE'S STEM PRECEDES ITS OWN LEDGERS
`addGraceNotes` runs `addExtra(stem)` and then `ledgerLines(...)` inside the per-grace loop,
so one grace reads `flag, head, stem, ledger` — but when the group is BEAMED the stems are
built by the beam pass instead and come after every head, which is what abcjs's contract for
`{gab}c4|` shows. Both are true at once and the flag that tells them apart already existed.
**AND A GRACE LEDGER HAS ITS OWN METRICS**: inset by ONE rather than two, and
`(symbolWidth + 4) * scale` wide off the FULL-SIZE head (`abstract-engraver.js:522`).

### ONE VOICE AT A TIME — abcjs FINISHES ITS BEAMS AND OTHERS BEFORE THE NEXT VOICE
`drawStaffGroup` loops `params.voices[i]` and `drawVoice` walks that voice's children, THEN
its beams, THEN its otherchildren (`draw/staff-group.js:112`, `draw/voice.js:25-90`). Ours
merged every voice's elements, then every voice's beams — **the same set in a different
order, and DOCUMENT ORDER IS NOT A COORDINATE**, so no positional gate could see it.

**Nineteen of the ninety-six differing fixtures shared a staff between voices**, which is how
the family was sized before the work started rather than after: a six-line script over the
ranked table and the fixtures' own `%%score`. `visual-wrap-05` — the table's HEAD, at 46104 —
went byte-exact on it.

The elements were already voice-major (`fixed.flat()`); everything else needed a handle, so
each voice's furniture is stamped with its position on the staff and the emitter's whole tail
became `flushVoice(v)`.

### AN ABOVE SLUR AIMING AT THE MIDDLE OF A STEM IS BUMPED RIGHT BY HALF A NOTEHEAD
`calcSlurY` writes `startX += anchor1.w / 2` INSIDE the arm that takes
`startY = (highestVert + pitch) / 2` — "when going to the middle of the stem, bump the line
to the right a little bit to make it look right" — and `endX += Math.round(anchor2.w / 2)`
in the closing arm, with a rounding the opening one does not have
(`tie-element.js:163-177`).

Our y already landed on the mid-stem point; only the x that goes with it was missing. It
shows on a SHARED staff above all, because there `voiceNumber === 0` forces `above` whatever
the stems do.

**AND THE CLOSING END HAS TWO GUARDS THE OPENING ONE DOES NOT** — `!beamInterferes` and
`midPoint < this.startY`. Trying to key the bump on "did the end LAND on the mid-stem point"
looked equivalent and is not: a beamed end also lands off its notehead, by a different rule,
and the control said so in one run. **AND `highestVert` IS NOT THE STEM'S REAL TOP** — a note
that starts or ends a slur, is stem-up and shorter than a whole gets a flat `+= 6`, six and
not the stem's own seven. **AND `this.startY` AT THE COMPARISON IS THE MID-STEM VALUE**, not
the final one: the beam override is two blocks further down and has not run yet.

---

## 3. ⚖️ THE FINDING THAT IS ALSO A NEGATIVE RESULT — **A PITCH RESERVE MUST NOT ROUND-TRIP**

23 of the 171 root elements differ by a lone ULP of `height`, and 33 of the 100 open rows
are a lone ULP somewhere. **They are ONE defect and it is architectural.**

`calcHeight` sums `staff.top` and `-staff.bottom` **in PITCH** and multiplies by `STEP`
once, and every contributor to those two numbers is a pitch expression abcjs never
converts: `pitch ± thickness / 2`, `gracepitch + 7 * gracescale`, `minpitch + 1/3`.
**We hold the extent in y and divide back**, so the chain is
`pitch → ×STEP → (max/min) → ÷STEP → sum → ×STEP` where abcjs's is `pitch → sum → ×STEP`.

**Writing a single site "the abcjs way" MAKES IT WORSE, and that was measured, not
reasoned.** Changing the notehead's reserve from `stepToY(step) ± half` to
`stepToY(step ± halfPitch)` adds a multiply AND a divide where the old form had only the
divide: the staff BOTTOM went from abcjs's exact `1.044774193548387` to
`1.0447741935483865`, and the top did not improve. **`x * STEP / STEP` is not `x`.** The
failed shape is written into the code at the site so it is not tried a third time.

**AND IT IS NOW HALF DONE.** `verticalExtent` returns `topPitch`/`bottomPitch` beside its
y, `include(a, b, ap?, bp?)` takes the pitch a caller knows and divides when it does not,
every LANE is `staff.top += pitch` as abcjs writes it, and the notehead, the clef and an
UNBEAMED stem all supply real pitches. `heightPitch` reads those instead of dividing the
final y. **The redundancy is deliberate — abcjs's structure first, tidy later.**

Two guards the measurement put there, each of which cost a run:

- **A BLOCK'S SPAN IS A LENGTH WITH NO PITCH**, so a system carrying one keeps the single
  division `-(top + blockSpan) / STEP` it always had. abcjs never puts the top text into
  `staff.top` at all, so that term is OURS; splitting it into `topPitch - blockSpan / STEP`
  is two roundings where it was one, and nine `visual-title-*` fixtures said so.
- **A BEAMED STEM MUST NOT SUPPLY ONE.** The beam pass RETARGETS it, so `p1`/`p2` stop
  describing it — 24 root elements went structural the moment it did.

**THE NEXT TERM IS THE INTER-SYSTEM GAP**, and it is the same shape one level up.
`addStaffPadding` is a PITCH sum with ONE multiply:

    lastBottomLine     = -(lastStaff.bottom - 2)
    nextTopLine        = thisStaffGroup.staffs[0].top - 10
    separationInPixels = (nextTopLine + lastBottomLine) * spacing.STEP
    if (separationInPixels < staffSeparation) moveY(staffSeparation - separationInPixels)

(`draw/draw.js:84-90`.) Ours computes `gap = originY - cursor` off `previousBottomLine`,
`topLineOffset` and the previous system's HEIGHT — four y's where abcjs has two pitches —
so the terms do not even correspond. The system already carries `heightPitch`; it needs the
first staff's `top` and the last staff's `bottom` in pitch beside it, and the placement loop
has to spend the gap as abcjs's own expression. That is a RESTRUCTURE of the placement loop
rather than a substitution, which is why it is written down here rather than begun.

**So the fix is not at any one site — the EXTENT has to be carried in PITCH**, alongside the
y that placement and drawing need. That is the next architectural arc, and it is the same
shape as the unit flip and the staff-frame change: port the STRUCTURE, and the constants
follow.

Where a value is used for DRAWING only, the local fix does work and has already landed
twice (the grace stem, the note stem) — because there the chain is
`pitch → ×STEP` on both sides.

---

## 4. WHAT IS LEFT — the ranked table's own families

Run first, always:

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
npx vitest run && cat /tmp/abcts-svg-bytes-ranked.txt
grep "^      want" /tmp/abcts-svg-bytes-ranked.txt | sed 's/^      want …//' \
  | cut -c1-40 | sort | uniq -c | sort -rn | head
```

1. **THE INTER-SYSTEM GAP IN PITCH (§3)** — the extent itself is done; the gap above each
   system is the next term of the same sum, and §3 has abcjs's four lines for it. 23 root
   heights and a long ULP tail hang off it.
2. **A MULTI-CHARACTER DYNAMIC IS A `<g data-name="dynamics">`** of one path per letter
   (`synth-flattener-03`). Named since 2026-08-10d and still open.
3. **THE ACCIACCATURA SLASH** — `flags.ugrace` at `-graceoffsets[i] + dAcciaccatura` with
   `dAcciaccatura = gracebeam ? 5 : 6` (`abstract-engraver.js:502-505`). We draw none
   (`visual-transpose-output-03`).
4. **THE HAIRPIN** (`synth-flattener-01`) — y out by 3.47 and the far end by 9.81.
   `drawCrescendo` is NOT handed `width`, unlike the tie and the ending.
5. **`%%score (T B)` WITH A REPEATED `[V:]`** (`visual-parsing-06`/`07`) — abcjs's forced
   stem direction is a `stem` ELEMENT spliced into a voice's stream by `createVoice`
   (`tune-builder.js:976-989`), so it is per TUNE LINE and stateful, where ours is one flag
   per voice for the whole tune. The third block re-enters voice T on a NEW line, where it
   is alone, so its stem follows pitch. **Ours forces it up on every line.**
6. **A BOXED FONT DRAWS A BOX** — `%%partsfont box` → `<g fill data-name>` + a rect from
   `getBBox` (`draw/text.js:48-60`).
7. **`svg-time-sig-list`** — a measure can carry only ONE `meterChange` in our model;
   `[M:2/4]y[M:3/4]y[M:4/4]` needs an inline meter to be an ELEMENT in the stream, as
   `letter_to_inline_header` makes it. The last open DOM-contract case, and a MODEL change.
8. **A BEAM BREAK'S PATH ORDER** (`visual-misc-12`, `!beambr1!`).
9. **TWO STRUCTURAL HEIGHTS** — 3.875px on `visual-mouse-click-01` and `visual-tablature-15`;
   four ladders already rule out what they are not.

---

## 5. THE HARNESS — unchanged, and both halves are non-optional

```bash
cd ../abcMusicKit/Tools/abcjs-debug
ABCJS_VERSION=6.7.0 node dump-svg.js --add-classes --file x.abc --output x.svg
ABCJS_VERSION=6.7.0 node dump-elements.js --file x.abc          # abcjs's own staff.top/bottom
```

`ABCJS_VERSION` DEFAULTS TO 6.6.3 and `--add-classes` is what makes the class scheme
visible at all. The goldens are rendered at `{ staffwidth: 670 }`; `svg-bytes` renders the
same way.

A one-file render of OUR engine, which is how every finding above was measured:

```js
// /tmp/gp/r.mjs
import { readFileSync } from 'node:fs'
const { renderAbc } = await import('/Users/lrettberg/ICMLabs/Code/abcts/src/compat/index.ts')
console.log(renderAbc('paper', readFileSync(process.argv[2], 'utf-8'), { staffwidth: 670 })[0].svg)
```

```bash
npx tsx /tmp/gp/r.mjs tests/corpus-abcjs/fixtures/<slug>.abc > /tmp/gp/x.svg
python3 -c "
a=open('/tmp/gp/x.svg').read(); b=open('tests/corpus-abcjs/golden/<slug>.svg').read()
i=next((k for k in range(min(len(a),len(b))) if a[k]!=b[k]), None)
print('first diff', i, 'of', len(b))
if i: print(' got ',a[i-70:i+70]); print(' want',b[i-70:i+70])"
```

The root-element classifier, which splits ULP from structural:

```js
// /tmp/gp/h.mjs — renders every fixture, compares only width/height
// 'byte-exact' | 'ULP-only' (|Δ| < 1e-6) | 'structural'
```

---

## 6. THE RULES THIS SESSION EARNED OR RE-EARNED

- **A SUM CANNOT SEE AN ORDER.** The `%%text` block's total was right and every row in it
  was 7.56px high. Same shape as the page walk's ULP.
- **A BETTER FORMULA IS STILL A DIFFERENT FORMULA.** `Math.hypot` over
  `Math.sqrt(dx*dx+dy*dy)` cost five fixtures.
- **MEASURE THE OUTPUT BEFORE BLAMING THE PARSER.** `%%text` before `K:` and after it are
  byte-identical through abcjs.
- **COUNT THE THING ACROSS THE WHOLE CORPUS BEFORE TRUSTING A REMOVAL.** The ledger change
  removed 184 baseline rows; `data-name="ledger"` counts, 171 match / 0 differ, is what
  proved it right.
- **A `ponytail:` NOTE EXPLAINING WHY ABCJS WOULD NEED SOMETHING IS A HYPOTHESIS.** The
  curve-continuation note said engraving reserves room at a system's start. abcjs reserves
  none and draws a flat 20px stub over the clef.
- **RE-CHECK `pixel-parity` AFTER EVERY VERTICAL CHANGE.** The voice-name move was byte-right
  and pushed a staff 2.98px; only the pixel gate could say so.
