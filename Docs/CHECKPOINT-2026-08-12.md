# CHECKPOINT — 2026-08-12

**abcts, `main`.** `npx tsc --noEmit` is clean and everything below is committed.
The suite is **1275/1276 with ONE red, and the red is NOT OURS** — see §5, which has to be
read before anything else in this file is trusted, because I reported that gate green twice
on stale runs before finding out what it was.

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
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **12 of 171**, best 21920 | 49 of 171 |

`DIVERGENT` is still EMPTY. **159 fixtures are byte-exact and all 159 are RATCHETED** —
`visual-selection-01` (202,156 bytes, the corpus's largest), `visual-tablature-15` and
`visual-mouse-click-01` (85,865 each) among them.

The 26 that remained at the first checkpoint classified **13 STRUCTURAL / 13 ULP** — §3.4.
Seven more closed after it; §2b is those, and §3.5 is what the table looks like now.

---

## 2. THE LANDINGS

Fourteen, and the shape of the session is that **most were found by a fixture that had
nothing to do with what they were about.** The bar-number arc in particular is three
rules stacked, each invisible until the one before it closed.

### 2.1 A STANDALONE `M:` ON THE TUNE'S FIRST MEASURE BELONGS TO THAT LINE'S PREFIX

    X: 1
    L: 1/4
    M: 4/4
    K:C
    M:2/4
    "C"zz|"D"z"E"z|

abcjs draws the **2**; we drew the header's **4**.

`startNewLine` fires LAZILY — when the first music element is appended — so a standalone
`M:` written before any music reaches the NEXT line's prefix. That is finding 121 and it is
why `meterChangeLeadsLine` deliberately fires only on the INLINE form. **On the FIRST
measure there is no next line, so it reaches its own.**

`meterLeadsFirstMeasure` is the standalone twin: a system-starting first measure whose
`meterChangeSourceRange` precedes every event of it. Wired into the prefix and into
`drawMeterChange`'s suppression, through a new `isFirstMeasure` parameter on
`layoutMeasure`.

### 2.2 A BAR NUMBER WEARS `measurefont`'S WEIGHT AND STYLE

Both were hard coded to abcjs's own default — `{ face: "Times New Roman", size: 14, weight:
"normal", style: "italic" }` (`abc_parse_directive.js:26`) — which is right until a tune
writes `%%barlabelfont Times-Bold 18 box`. Then the SIZE moved and the style did not,
because only the size was ever read from the score. The parser had it correct all along;
`layoutBarNumber` simply never asked.

### 2.3 A BOXED FONT IS MEASURED FOUR PADDINGS WIDER **AND** TALLER

`getTextSize.calc` ends

    if (hash.font.box)
        return { height: size.height + hash.font.padding * 4,
                 width:  size.width  + hash.font.padding * 4 }

(`helpers/get-text-size.js:46-49`) — "padding and an equal margin to each side", where
`padding` is `font.size * fontboxpadding`, default 0.1.

`fontHeightOf` ALREADY did the height. `textWidth` is the raw glyph run and did not.
**Adding it to both double-counted and cost 9.06px of page**, which is how the split was
found — it is not a rule about "the box", it is a rule about two functions of which one
already obeyed it.

Instrumented through abcjs on the fixture: `w 26.6 h 35.6 pad 2.4`, against a `getBBox` of
17.0 × 26.0. Both axes carry the 9.6, once each.

The width matters TWICE: `addMeasureNumber` centres on it (`dx += measureNumDim.width / 2`)
and thresholds `vert` against it (`width > 10 && type === "treble" ? 13.5 : 11`). **So a
boxed bar number is centred on the BOX rather than on its digits** — and that threshold is
what surfaced the next one.

### 2.4 A BAR NUMBER ON A CLEF DOES NOT PUSH THE TOP

`_addChild` opens with an explicit exception:

    var okToPushTop = true;
    if ((this.abcelem.el_type == "clef") && (child.type == "barNumber")){
      okToPushTop = false;
    }

(`elements/absolute-element.js:184-189`) — its own comment reading *"To avoid extra space
for chords if there is only a bar number on the clef"*. It still pushes the BOTTOM, which
for a point that far above the staff can never win.

**It was invisible while the width was measured unboxed.** `%%measurefont Helvetica 7 box`
measures 8.5 raw and takes `vert` 11, which sits inside the clef's own extent, so the
unconditional push cost nothing. Boxed it measures 12.1, `vert` becomes 13.5 — abcjs's own
number, instrumented — and `visual-options-01-fonts`' second system dropped 9.69px. That
was the harvested table's only row, and it is why 2.2–2.4 are one commit and not three.

**AND "DOES NOT PUSH" HAD TO BE SAID, NOT LEFT OUT.** Deleting the `reserve` changed
nothing at all: an absent reserve falls back to `verticalExtent`'s ascent/descent estimate,
which pushes MORE. `reserve: [stepToY(4), y]` is the honest form — `stepToY(4)` is where the
extent starts, so it can never win. **The built-in `ABCTS_PROBE` named the real contributor
in one run** (`topBy=L12597` — the heading block, not the bar number) after a wrong guess
had already been implemented and measured to do nothing.

### 2.5 A CHORD'S TIE IS ONE TIE PER NOTEHEAD

`-` after a chord is

    case '-':
      el.pitches.forEach(function(pitch) { pitch.startTie = {}; });

(`abc_parse_music.js:427`), and `addSlursAndTies` runs once per pitch — so `[GB]8-` builds
**TWO** `TieElem`s (`abstract-engraver.js:873-905`). We built one, on `pitches[0]`, and
abcjs's golden for `parse-tie-slur-02` has the second sitting 7.75px above it with the
identical arc.

**A SLUR IS NOT LIKE THIS, AND THE TWO RULES LOOK ALIKE.** `(` is hung on `el.pitches[0]`
and on nothing else (`:508`), which is what `NoteAnchor.pitchY` already records. Both are
now stated at the field, because reading one as the other is how this survived.

The pairing is abcjs's own: an arriving head closes the open tie whose `anchor1.pitch`
MATCHES it, and an unmatched one closes `ties[0]`, the oldest still open
(`abstract-engraver.js:874-891`).

The reserve and the drawing fan out through the same `tiePairs`, so the extent sees every
arm — one derivation, not two. Three baselines moved and **the diff is PURE ADDITIONS with
no removals**, which is the shape a new feature has to have.

### 2.6 A NOTEHEAD'S `data-name` IS THE SOURCE SPELLING, AND IT IS NOT DERIVABLE

    el.name = line[index];
    if (el.accidental) el.name = accMap[el.accidental] + el.name;
    …
    case ',':  el.pitch -= 7; el.name += ',';
    case '\'': el.pitch += 7; el.name += "'";

(`abc_parse_music.js:1116-1147`) — the letter AS TYPED. **`c,` and `C` are the same note**
and abcjs keeps whichever the writer used; we canonicalised, so every `c,` in the corpus
came out `C` (`create-note-head.js:34`).

`writtenNote`'s own doc block said the pitch was enough — *"transposition rewrites the whole
string, which is why deriving it from the (already transposed) pitch reproduces it rather
than needing the source text."* The first half is true and **the conclusion does not
follow**: without a transpose there is no rewrite and the source spelling stands. Same shape
as the `G8` breve and the `extra-class` accent — **a note that names a cause is the reason
the row stops being read.**

The canonical form stays as the fallback, and it is ALSO what abcjs itself produces once
`%%transpose` HAS rewritten a name: `allPitches` runs `C,,,` to `b'''` in exactly that order
(`abc_transpose.js:170-176`, `all-notes.js:3-12`), which is the table `writtenNote` already
derives. Only the letter and marks are carried; the accidental prefix is abcjs's canonical
`accMap[el.accidental]` and was already right.

### 2.7 `%%voicecolor` IS `drawVoice`'S SWAP, NOT A PROPERTY OF ANY ELEMENT

It was not implemented at all, and it was the earliest structural row left.

    var saveColor = renderer.foregroundColor
    if (params.color) renderer.foregroundColor = params.color
    …
    renderer.foregroundColor = saveColor

(`draw/voice.js:14-16`, `:93`) — everything drawn between those two lines takes it,
including the voice's `staff-extra` clef and key and its LEDGERS, and nothing outside does.
**The staff LINES are `printStaff`'s and are drawn before the swap**, which is why abcjs's
own golden leaves them `currentColor` on a fully coloured tune. The emitter's `flushVoice`
already spans exactly that range, because "abcjs finishes one voice before it starts the
next" landed on 2026-08-11b — so this was a colour variable and not a refactor.

The token is taken RAW and never validated (`abc_parse_directive.js:863-870`).

*ponytail*: abcjs appends a `color` ELEMENT to the voice stream, so a second
`%%voicecolor` repaints from there on and colours the whole LINE it lands in,
retroactively. We hold ONE colour per voice, which is every use in either corpus.

### 2.8 AND TWO RULES WERE HIDING BEHIND IT

Landing the colour moved that fixture's first divergence from byte 1257 to 7737 and made
both reachable for the first time.

**AN EMPTY GROUP IS DELETED** — `Svg.closeGroup` removes any `<g>` whose
`children.length === 0`, *"if nothing was added to the group it is because all the elements
were invisible"* (`write/svg.js:364-372`). The NOTE branch already obeyed it; the BAR branch
pushed `</g>` unconditionally. A `[1` opening a repeat ending at the START of a line is such
an element — a bar with no rule and no glyph.

**AND AN INVISIBLE BAR STILL CARRIES A 1-WIDE ANCHOR** — the same `w: 1` a thin rule's
anchor gets, on an element that draws nothing (`abstract-engraver.js:996-999`). A repeat
ending hangs off `anchor1.x + anchor1.w` (`draw/ending.js:14`), so the bracket opens one
pixel right of the element; we skipped the branch entirely. Measured through abcjs as
`anchor1.x 87.551 w 1 c null`.

### 2.9 AN ENDING RUNNING OFF A SYSTEM ENDS AT THE VOICE'S WIDTH MINUS ONE, UNROUNDED

`drawVoice` opens `var width = params.w - 1` and hands that to `drawEnding` as its
`lineendx` default (`draw/voice.js:12`, `:82`) — **the same off-by-one a CURVE running off
the end already reproduced through `ENGRAVE.lineEndInset`**, on a different element that
nobody had connected to it.

**AND AN UNANCHORED END IS NOT ROUNDED.** `drawEnding` calls `roundNumber` only inside
`if (params.anchor1)` and `if (params.anchor2)`; the fallbacks go into the `sprintf` raw
(`draw/ending.js:13-26`). So one `d` mixes two-decimal coordinates with a full double —
`294.7566274847714` beside `182.4` — which no general rule about rounding could produce.
`PlacedLine.rawEnd` carries it rather than the formatter guessing.

### 2.10 A STEM'S `bottom: p1 - 1` IS SKIPPED WHEN IT IS ZERO — JS TRUTHINESS

`RelativeElement`'s constructor ends `if (opt.bottom) this.bottom = opt.bottom`
(`relative-element.js:41-42`), and **`0` is FALSY** — so a stem whose low end is pitch 1
keeps the default `min(pitch, pitch2)`, which is `p1` itself. `p1` is always the LOW end
(`abstract-engraver.js:740-742`), so the reserve is one pitch shallower on exactly that
note and no other.

`visual-tablature-15` and `visual-mouse-click-01` were each **3.875px — one step —** too
tall on nothing else. This is the guard the workspace's own porting notes warn about, found
by comparing abcjs's page walk with ours staff by staff: its bass staff reported `bottom 1`
against our 0.

### 2.11 THE BOTTOM-TEXT BLOCK'S ROWS ARE SPENT ON THE PAGE'S CURSOR, ONE AT A TIME

`nonMusic` walks a block's rows calling `renderer.moveY(row.move)` per row
(`draw/non-music.js:10`). We accumulated them from zero inside `bottomTextBlock` and added
the total. **A SUM CANNOT SEE AN ORDER**, again — the same rule as `topAdvances` and the
staff-origin walk. Worth `982.6205` against abcjs's `982.6204999999999`, and it took those
two fixtures from byte 187 to 2412 of 85865.

### 2.12 A `%%sep` IN THE HEAD OF A TUNE DREW NOTHING, AND ITS `rules` SINK WAS A LITERAL `[]`

`appendFreeText` has collected separator rules since the mid-tune blocks needed them; the
tune's OWN block passed a throwaway array. The `%%sep` still cost both its 11px moves —
those are the block's ROWS, so the height was right — and the only symptom was a missing
path, **which no gate here reads**.

Two more rules had to follow it, and both are things the block's TEXTS already did: the
rule takes **THE PAGE'S OWN y** (`pageY`, because the top block is built on the page's
cursor and rebased into a staff's frame), and it takes **ITS TURN AMONG THE ROWS**
(`nonMusicIndex`, because `nonMusic` draws each row where it stands and every block LINE was
tagged `undefined`, dropping it into `meta-top`).

### 2.13 `minx` IS TWO ADDS — THE MIN WIDTH, THEN THE MINSPACING

    voice.minx = x + getMinWidth(child);
    if (voice.i !== voice.children.length - 1) voice.minx += child.minspacing;

(`layout/voice-elements.js:74-77`). Ours folded both into one `rod` and subtracted the gap
back on the last element: `x + (w + gap)` where abcjs writes `(x + w) + gap`.

**AND `rod - gap` DOES NOT RECOVER `w`**, which is why the obvious rewrite moved nothing
when it was first tried: `21.795 - 10` is `11.795000000000002`, so the reconstructed width
is itself one ULP wrong and the line lands where it started. The width has to be CARRIED —
the same lesson as `PlacedGlyph.dx`. `Advance.width` is therefore set only where the caller
genuinely built `rod` as `width + gap`, and is ABSENT on a BARLINE, where `rod` is a
`Math.max` over competing claims and the split is not ours to invent.

**39 → 35 of 171 on that one association**, found by comparing abcjs's `child.setX` trace
with ours item by item: both agree to the last digit through the clef and the time signature
and part company at the BAR after them.

### 2.14 A QUARTER TONE NAMES ITSELF

`accMap` has SEVEN entries — `__ _ = ^ ^^` plus `_/` and `^/`
(`abc_parse_settings.js:147-155`) — and our `Accidental` is a whole-semitone enum with the
deviation in `microtoneCents`, so every quarter tone printed its BASE sign:  `_A` where
abcjs writes `_/A`. `Pitch.writtenAccidental` carries the name, the same shape as
`Pitch.written` beside it. Every other fraction (`^3/2`) has no `accMap` entry at all and
keeps the base sign, which is what abcjs does too.

### 2.15 A REST'S DOTS COME BEFORE IT, BECAUSE THEY COME BEFORE A NOTEHEAD TOO

`createNoteHead` pushes the dots itself with `addRight` and the caller pushes the head with
`addHead` AFTERWARDS (`create-note-head.js:50-53`, `abstract-engraver.js:600-604`). DRAW
ORDER IS CALL ORDER, the rule already ported for a note as "flag, dots, accidental, head" —
and it stopped at the note. A rest's branch ends in the SAME `createNoteHead` call.
`"F"z3` in `flattener-37` is one dotted half rest on which the two engines disagree about
nothing else.

### 2.16 A GLISSANDO IS A SQUIGGLE, AND IT RUNS NOTEHEAD CENTRE TO NOTEHEAD CENTRE

We had none of `draw/glissando.js`: ours ran from the first ink's RIGHT edge to the next
ink's LEFT with a 0.3-space gap, took the anchor BOX's midpoint for y, and drew a straight
`<polygon>`. All three our own engraving in a shape abcjs does not have.

`leftX = anchor1.x + anchor1.w / 2`, `marginLeft = anchor1.w / 2 + 4`, and the y at each end
is `calcY(heads[0].pitch)` sheared along the line by that margin (`:9-22`). `numSquigglies`
is `max(2, floor((len - 10) / 6))` over the length already less both margins, `len` being
the centre-to-centre hypotenuse — `Math.sqrt`, the same debt the curve's arc carries. The
SHAPE is four constant segment lists sheared by the slope — lead-in, `num` along the TOP,
a turn, `num` back along the BOTTOM, lead-out, `z` — each step
`'l' + dx + ' ' + roundNumber(dy + dx * slope)`, the dx RAW and the dy rounded.

### 2.17 ONLY A BAR NUMBER PRECEDES THE BARLINE'S RULE

The comment at that line already said it — "a bar number is the bar's FIRST child, ahead of
the rule itself; every other element's text comes last" — and the code pushed ALL of a bar's
texts first. A `!D.C.alcoda!` written before a barline attaches to the BARLINE
(`abstract-engraver.js:1002`) and `createBarLine` adds the rules first.

### 2.18 A TEXT DECORATION IS `renderText`'S ELEMENT, AND IT DECLARES ITS OWN ANCHOR

    renderText(renderer, { x: params.x, y: y + 6, text: params.c,
      type: 'annotationfont', anchor: params.anchor, centerVertically: true, … })

(`draw/relative.js:47-50`) — "the +6 is to compensate for the placement of text in svg".
`centerVertically` is TRUE, so no font size is added to the y. Ours went out through the
plain writer at `font-family="serif"`, in ITALIC, centring itself by subtracting half its
measured width. `textDecoration(text, placement, anchor)` takes the anchor as a parameter:
the four `al coda`/`al fine` phrases pass `'end'`, everything else `'middle'`.

**AND THE LITERALS ARE ABCJS'S, NOT A STYLE GUIDE'S** — `"FINE"` in capitals and a
lowercase `al coda`. Two unit tests asserted `Fine`, `al Coda` and italic, all three our own
judgement written as though measured. **A TEST CAN ENCODE AN INFERENCE AS FIRMLY AS A
COMMENT CAN**, and it is harder to notice, because a green test reads as a checked fact.

### 2.19 THE BELOW DECORATION CURSOR'S FLOOR IS THE ELEMENT'S OWN BOTTOM

    yPos.below = Math.min(yPos.below, minPitch);
    stackedDecoration(decoration, width, abselem, yPos, positioning.ornamentPosition,
                      this.minTop, minPitch, accentAbove);

(`creation/decoration.js:390-391`) — the SEVENTH argument is `minBottom` and it is
`minPitch`, **the element's own bottom**. `this.minBottom` from the constructor is passed
NOWHERE, and that constant is what our clamp was reading, *with a citation to the line that
defines it*. The ABOVE side really does take the constant (`this.minTop` is the sixth
argument), which is why one half was right and the other was not.

So an inverted fermata on a high note hangs at pitch 8, well inside the staff, and ours
could never rise past the floor. `visual-decorations-01` went from byte 7221 to 17871 of
59302. **Measured by dumping every below placement out of both engines and sorting them**:
abcjs's set has 1.0009, 6.0009 and 8.0009 in it and ours had six copies of one clamped
value. Three of its twelve are still one pitch out — the element bottom coming from the
STEM rather than the head — and the fixture's next divergence is a `scripts.ufermata` 22px
out, which is the staff's own origin moving underneath it, not the decoration.

### 2.20 THE ACCIACCATURA SLASH IS A GLYPH, AND IT FOLLOWS THE FIRST GRACE HEAD

`flags.ugrace` — abcjs's own grace FLAG reused as the stroke, at "the same formula that
determines the flag position", scaled like the head and with ZERO width
(`abstract-engraver.js:501-506`). Ours drew a thickened line from five invented ratios,
pushed after EVERY grace rather than after the one it belongs to. `dAcciaccatura` is 5 when
the group is BEAMED and 6 when it is not.

**THE GLYPH WAS IN `UNMAPPED_ABCJS`** as "no SMuFL name claims it" — the same misreading
that once left four decorations on Bravura's outlines. SMuFL names it
`graceNoteSlashStemUp`; `scripts/gen-glyphs.mjs` says adding a glyph is "add the name,
re-run, commit", so no outline had to be invented. **`role: 'flag'`, NOT `'grace'`** — the
role picks the class and `grace` maps to `abcjs-notehead`, which abcjs gives only to a glyph
whose NAME contains `notehead`; the pixel gate counted it as a sixth notehead the moment it
did not. `visual-transpose-output-03` went from byte 11240 to 31189 of 43612.

### 2.21 AN ANNOTATION IS IN THE CHORD BUCKET — AND THAT IS NOT ITS LANE

Every annotation comes out of `addChord`, so it sits in the bucket `createNote` adds LAST,
after the decorations. A `"<2"` was written before the `+1+` beside it.

**Keyed on `dataName`, not on the ROLE**: the role also decides whether a mark takes a CHORD
LANE, and a left- or right-placed annotation does not. Giving these `role: 'chord'` fixed the
order and cost `S2-fields-tune1` 18.52px — one whole lane, caught by the pixel gate on the
first run. **TWO QUESTIONS, TWO FIELDS.**

### 2.22 AN EMPTY `""` IS A CHORD, AND `includes('')` IS TRUE

abcjs decides by POSITION — `isAnnotation = pos === "left" || … || !!rel_position`
(`add-chord.js:9`) — and an empty chord names none, so it is a chord symbol: centred,
`data-name="chord"`. Ours read the first character, and **the empty string is a substring of
every string**, so `'^_<>@'.includes(text[0] ?? '')` answered TRUE for it.

**AND AN EMPTY CHORD STILL DRAWS AN EMPTY `<text>`** — `addChord` calls `addCentered` for
every entry whose position is not `hidden` and never tests the STRING (`:104-116`). Two
guards here skipped it, one on the whole symbol and one per line. An element with no ink at
all, which only a byte comparison could see. `visual-transpose-output-03` went from 33085 to
**41691 of 43612**, and what is left on it is beam order.

### 2.23 THE BEAMS GO OUT IN ADD ORDER, AND A GRACE BEAM IS ADDED EARLIER

`drawVoice` walks `params.beams` as it stands, and `createBeam` pushes each member through
`createNote` — which adds that element's grace beam (`abstract-engraver.js:537`) — before
pushing the group's own beam (`:426`). So an ordinary beam is added at its group's LAST
element and a grace beam at its own. Ours wrote every ordinary beam and then every grace
beam, so `{/GA}B` at the head of a tune put its grace beam after a beam 290px right of it.

### 2.24 A DOTTED TIE AND SLUR — `.-` AND `.(`

**The `.` is not a staccato and the parser already knew it** — abcjs's decoration lexer
breaks out of `case '.'` when `(` or `-` follows (`abc_parse_music.js:783-786`) and ours had
that rule *with a comment explaining it*. What it did next was throw the dot away, so `.-`
and `-` drew the same filled lens. **A rule can be read correctly and then discarded**, and
nothing but a byte comparison notices.

The flag rides on the ELEMENT the curve OPENS at — one for the tie it starts (`:1062-1066`)
and one for the slurs opening on it (`:896`) — which is why there are two fields.

**A DOTTED CURVE IS THE OUTWARD HALF ALONE, STROKED**: one cubic with
`stroke: foregroundColor`, `fill: "none"` and `stroke-dasharray: "5 5"`
(`draw/tie.js:89-95`) — no mirrored return, no `z`. Everything else about the arc is
identical, so it is a flag on the curve rather than a second shape.

**`visual-transpose-output-03` is byte-exact**, from 11240 of 43612 when the session started
on it — six landings, all in this file's §2.20 onward.

### 2.25 A HAIRPIN CLOSES ON A BARLINE, AND THE SPANNER SCAN ONLY WALKED NOTES

`flattener-02` drew **no hairpin at all** — three dynamic glyphs where abcjs's line reads
`DYNAMIC HAIRPIN DYNAMIC HAIRPIN DYNAMIC`. Traced, the OPEN reached the layout and the
CLOSE never did:

    SPAN name "<(" opens crescendo closes undefined

`!<)!` is written before a `|`, and **a decoration before a barline attaches to the
BARLINE** (`abstract-engraver.js:1002`) — a rule this engine already knows and already
implements for the barline's own MARKS. What it did not do is let one CLOSE a spanner,
because `layoutSpanners` walked `anchors` and an anchor exists only for a note or a rest.
**The audio arc found the same rule from the other side in August** and the flattener has
obeyed it since; the renderer never learned it.

**A SEPARATE LIST, NOT AN EXTRA ANCHOR.** An anchor is read by the curve pass, the tuplet
pass and the grace pass, and a bar belongs to none of them — it would lengthen a tuplet
bracket and offer itself as a slur end. `emit`'s hairpin arm reads only `system` and `left`,
so `SpannerSite` carries those plus an optional `anchor` for the GLISSANDO arm, which joins
two noteheads and cannot end on a bar.

**AND THE MERGE SORTS BY SYSTEM FIRST.** `element` is an index into the system's own list
and REPEATS across systems; sorting on it alone paired a hairpin's open with the wrong close.
A unit test caught it and the baseline diff showed **12 spanner REMOVALS and no additions**,
which is the shape that says regression rather than change.

### 2.26 A SLUR IS ADDED AT ITS OPEN, A HAIRPIN AT ITS CLOSE

`voice.addOther(slur)` sits inside `if (pitchelem.startSlur)` and the tie's inside
`if (pitchelem.startTie)` (`abstract-engraver.js:897-941`), so a curve joins `otherchildren`
where it BEGINS. A hairpin is the other way round — `new CrescendoElem(this.startCrescendoX,
lastNote(voice.children), …)` is built when the CLOSE is seen (`decoration.js:304-308`).

The comment here claimed both sorted on the close. **Measurably neutral** — nothing in
either corpus has a curve and a hairpin whose two orderings disagree — and committed for the
citation, because the old note would send the next reader the wrong way and
`visual-svg-per-line-01` is still open on this list.

### 2.27 A SLASH OR TRIANGLE NOTEHEAD MOVES THE STEM'S NOTEHEAD END

`p2 -= 0.7` down and `p1 -= 1.2` up for a triangle, `∓1` for a slash
(`abstract-engraver.js:749-761`). abcjs's `p1` is always the LOW end and `p2` the HIGH one,
so a down stem's `p2` and an up stem's `p1` are both the end AT THE NOTEHEAD.

**ONLY ON AN UNBEAMED STEM** — the rule sits inside `if (hasStem)` and `createBeam` passes
`nostem: true`, so `flattener-23`'s fourteen triangle heads produce exactly ONE stem that
reaches it. Applying it to the beamed ones drove that fixture from byte 18826 BACK to 6809.
**AND AFTER THE MIDDLE-LINE CLAMP**, where `p1`/`p2` already stand: adding it to the raw
value let the clamp swallow part of it, showing as 2.583px where the rule is a whole pitch.

### 2.28 A TUNE WITH NO `M:` STILL HAS A MEASURE LENGTH, AND IT IS 1

`engraver-controller.js:206` seeds it from `getMeterFraction()`, which is 4/4 when the tune
names no meter, and the per-staff branch only OVERWRITES it `if (abcstaff.meter)`. Ours
passed `null`, so `fillsMeasure` was never true and `centerWholeRests` — implemented,
correct, cited — **never ran at all**.

Instrumenting `center()` on both sides printed abcjs's `before 419.24 bar after 493.65 bar
w 11.25` and, from ours, NOTHING. **Silence was the sharper signal**: it moved the search
from "our arithmetic is 20px off" to "our centring never runs", a different bug in a
different file. Same shape as the hairpin below.

### 2.29 `isTie` IS RECOMPUTED AT DRAW TIME FROM THE ANCHORS

    if (!anchor1 || !anchor2) isTie = true
    else if (anchor1.pitch === anchor2.pitch && internalNotes.length === 0) isTie = true
    else isTie = false

(`draw/tie.js:33-42`.) A SLUR between two notes of the same pitch with nothing between them
is drawn AS A TIE, and that one flag decides the 1.2 rather than 1.5 pitch lift, the 10
rather than 25 flatten cap, `calcTieDirection`/`calcTieY`, the class and the `data-name`
together. `internalNotes` is fed only by the `else if (!isGrace)` arm, so a REST between the
ends does not count and neither does a grace.

**Found on the automatic GRACE SLUR, which is the case that proves it**: `flattener-23`
draws `{^c}^c`, both ends at pitch 7, and its curve came out 1.16px low — 0.3 pitch, exactly
the difference between the lifts. Every other number matched, which is why it took printing
abcjs's `startY 7 endY 7` beside ours to see that the pitches agreed and the SPACING did not.

### 2.30 A BARLINE WITH NOTHING AFTER IT IS STILL A BARLINE

Two barlines in a row leave the second as a `pendingOpening`; when nothing follows — `[|] |`
at the end of a line — it was DISCARDED. abcjs's voice children are a flat stream and every
`|` is its own `bar` element, so `visual-tablature-20` has SEVEN bar groups against our five
and its last staff line ran 16px short. `A | |` parsed here as ONE measure.

### 2.31 AND ANY BARLINE THAT IS NOT A PLAIN THIN `|` ENDS THE ENDING IT SITS IN

    if (multilineVars.inEnding && bar.type !== 'bar_thin') { bar.endEnding = true; … }

(`abc_parse_music.js:271-274`.) **The rule is a COMPLEMENT and ours was a LIST** —
`repeatEnd`, `repeatBoth`, `final`, `double` — the same set for everything the corpus writes
except an INVISIBLE `[|]`. `visual-tablature-20`'s second ending both opens and closes on
one. It only became visible once the trailing barline existed at all: **the two are one
fixture's worth of rule, found in the order the byte comparison hands them over.**

---

## 3. WHAT IS LEFT — MEASURED, NOT LANDED

### 3.1 A FORCED STEM DIRECTION IS PER **LINE**, NOT PER VOICE — 2 fixtures, fully measured

`visual-parsing-06` and `-07` (`%%score (T B)`, byte 10288 of 11592, the same tune):

    X: 360
    %%score (T B)
    [V:T]c|\
    [V:B]A|\
    [V:T]d|

Every element matches except the third note's flag: abcjs draws `flags.d8th`, we draw
`flags.u8th`. Instrumented — abcjs's own three voice streams are

    VOICE s 0 v 0 stream ["stem:up",  "note:c","bar"]
    VOICE s 0 v 1 stream ["stem:down","note:A","bar"]
    VOICE s 0 v 0 stream [            "note:d","bar"]

`createVoice` appends `{el_type:'stem', direction:'down'}` when `tune.voiceNum > 0` and
splices `up` onto `voices[0]` (`tune-builder.js:965-990`) — **on the line where that voice
opens.** `createABCVoice` then resets `this.stemdir = null` at the head of EVERY line
(`abstract-engraver.js:229`). The third `[V:T]` opens a new line on which the staff carries
ONE voice, so nothing is forced and `d` takes its natural down stem by pitch.

Ours is `stemForVoice(index)` — per voice, for the whole tune. The fix is to make it per
LINE, keyed on how many voices that line's staff carries. **Do not land it without
re-reading `ave-verum-corpus` and `ragtime-nightingale`**, whose vertical extents both
depend on the existing rule (see `stemForVoice`'s own doc block, which records 23.5px of
error from getting it wrong the other way).

### 3.2 THE STAFF-LINE ULP IS A NAMED DEBT, AND ITS MISSING TERM IS NOW MEASURED

**Corrected on re-reading**: this is not an unknown. The bottom carries
`bottomPitch -= (bottom - wasBottom) / spacePerStep` — the lane recovered as a DELTA and
divided back — with `lyricLanePitch` computed beside it and deliberately not spent, on the
recorded grounds that **A ULP IS CHEAPER THAN A POSITION ERROR**.

Re-measured 2026-08-12, and the verdict holds: spending `lyricLanePitch + 1` on the ink
bottom directly takes `svg-bytes` from 39 to 40 and puts `ave-verum-corpus`,
`multi-voice-lyrics-two-voices` and `visual-multi-voice-01` out by **exactly 18.84px, one
lyric block**. The missing term is abcjs's `diff`: a lyric on voice n>0 takes
`child.pitch -= voiceNumber * child.lyricHeightBelow`, which drives
`bottom = Math.min(element.bottom, child.pitch)` and then `staff.bottom -= diff` per VOICE
(`set-upper-and-lower-elements.js:118-125`, `:163-168`). **Porting the lane without the
per-voice diff is half a rule**, and that diff is the whole remaining job here.

### 3.3 THREE `[M:]` IN ONE MEASURE DRAW ONE — the model is singular

`visual-svg-02-staffwidth-12` is `[M:2/4]y[M:3/4]y[M:4/4]`. abcjs draws THREE
`staff-extra time-signature` groups; we draw one, and it is the LAST — so the page comes out
51.795 wide against abcjs's 87.385. `Measure.meterChange` is a single field, so a measure
that changes meter more than once keeps only the final change. Fixing it means meter changes
become a positioned LIST on the measure, which also touches `meterChangeLeadsLine` and
`meterLeadsFirstMeasure`. One fixture, and the only one in either corpus that varies it.

#### The original note, kept for its numbers

`visual-multi-voice-02`, byte 38733 of 48279: a staff line reads
`M 15 414.24 … 414.94` against abcjs's `M 15 414.23 … 414.94`.

Not the emitter — `printLine`'s two independently-rounded edges are already ported. The
centre is:

    abcjs   414.585              ours   414.58500000000004

and it comes from the page walk, where the second staff of the SECOND system diverges:

    abcjs   moveY 3.875 × 22.044387096774194 → 346.438
            moveY 3.875 ×  6.861935483870968 → 373.02799999999996
            moveY 3.875 × 20.724387096774194 → 453.335
    ours    261.016 + 0 + 85.422 + 26.590000000000003 + 80.307 → 453.33500000000004

The single differing term is the second: **abcjs's `staff.bottom` is
`-6.861935483870968` and our `extent.bottomPitch` is `-6.861935483870969`** — one ULP,
which `× 3.875` turns into `26.590000000000003` against abcjs's exact `26.59`. Note that
`26.59 / 3.875` gives abcjs's number EXACTLY, so here the DIVISION is right and our pitch
SUM is the one that is off — the opposite direction from the rest of that family, and worth
knowing before reaching for the usual fix. `staff.bottom` is built by
`set-upper-and-lower-elements.js:55-80` (`staff.bottom -= (lane + margin)`, then
`staff.bottom -= diff` per voice); start by instrumenting those terms.

### 3.3b A KEY SIGNATURE'S POSITIONS ARE BAKED AT PARSE TIME — MEASURED, TRIED, REVERTED

`visual-layout-07` is four voices on two staves (`V:3 bass,, / V:4 bass,, merge`) under
`K:GMin`. Its bass staff's two flats sit **7.75px — 2 pitch — lower in ours**, and
*everything else on that staff is byte-identical*: the bass clef glyph, every notehead.
Instrumented through abcjs, the cause is not the arithmetic but WHEN it runs:

    ADDPOS out   0  ["Bflat@6","eflat@9"]     ← treble
    ADDPOS out -12  ["Bflat@4","eflat@7"]     ← bass, computed and NOT USED
    CREATEKEYSIG    ["Bflat@6","eflat@9"]   x4  ← what the engraver is actually handed

**abcjs resolves `verticalPos` ONCE, when the `K:` is read**, and `multilineVars.clef` —
the clef it resolves against — is written by a `K:`'s own `clef=` and **by nothing else**
(`abc_parse_key_voice.js:513`, `abc_parse_header.js:371`). A `V:… clef=bass` never touches
it. So a tune whose `K:` names no clef draws TREBLE-positioned accidentals on its BASS
staff. It is arguably wrong engraving and it is what strict has to draw. Our
`keySignatureShift` reads the STAFF's clef at draw time, which is right and not abcjs.

**IT WAS IMPLEMENTED AND REVERTED, and the reason is worth more than the attempt.** There
are TWO call sites and they do not use the same clef: the header path passes
`multilineVars.clef` (`abc_parse_header.js:371`, `:437`, `:513`) and the INLINE path passes
`params.clef` (`abc_parse_music.js:984`), which is the element's own. Stamping the key with
a running K:-clef defaulting to treble took `svg-bytes` from **34 to 36** and put two
pixel-gate tunes out — so some fixture in the corpus DOES want the staff clef, and the
split between the two paths is the whole remaining question. **MEASUREMENTS 1 AND 2 ARE NOW MADE.** Instrumenting all four call sites on
`visual-layout-07`:

    ADDPOS-INLINE clef {"type":"treble","verticalPos":0}     x2
    ADDPOS-INLINE clef {"type":"bass","verticalPos":-12}     x2
    FIXKEY site3  clef {"type":"treble","verticalPos":0}

So the INLINE path runs once per voice with **that voice's own clef** — the bass voices do
get bass positions — and the header path runs once with `multilineVars.clef`, treble. And
`CREATEKEYSIG` is handed `Bflat@6 eflat@9` FOUR times: **the per-voice bass positions are
computed and thrown away, and the header element is what every staff draws.**

That confirms the model tried and reverted — a running K:-clef defaulting to treble — is the
right shape. What is left is measurement 3: it took `svg-bytes` from 34 to 36 and put two
pixel-gate tunes out, and **which fixtures those were has not been looked at**. They are the
ones that name the rest of the rule.

**AND A LADDER THROUGH ABCJS SAYS WHY "ALWAYS TREBLE" IS THE WRONG SHAPE** (2026-08-12b).
Six controls, `CREATEKEYSIG` printed for each — the positions the ENGRAVER is handed, not
the ones the parser computes:

| control | source | drawn |
|---|---|---|
| e | `K:D` | `fsharp@10 csharp@7` — treble |
| a | `K:D clef=bass` | `fsharp@8 csharp@5` — **bass** |
| b | `V:1 clef=bass` then `K:D` | `fsharp@8 csharp@5` — **bass** |
| c | `K:D`, then `V:1 clef=bass` | `fsharp@8 csharp@5` — **bass** |
| d | `V:T clef=treble` / `V:B clef=bass` then `K:D` | `fsharp@8 csharp@5` on BOTH staves |
| f | `K:D clef=bass` + `V:2 clef=treble` | **TWO signatures**, `@8/@5` and `@10/@7` |

So the drawn positions are BASS in four of the six, ONE object is shared by every staff in
`d`, and `f` proves abcjs can emit two different ones in a tune. **A blanket "use the
treble positions" is denied by five of the six rows** — which is almost certainly what the
two reverted attempts amounted to, and it explains the two pixel-gate tunes.

The discriminator is `params.clef` at the moment the `K:` line is read, and it is a PARSER
STATE MACHINE rather than a rule: `visual-layout-07` has a header `K:GMin`, then four `V:`
lines two of which are `bass,,`, then a body `K:GMin` — and that body `K:` is read with
`params.clef` TREBLE, where control `d`'s `K:D` after the same shape of `V:` block is read
with BASS. The difference is the HEADER `K:` that precedes it. **Port
`multilineVars.clef`'s write set, do not infer the rule from the outcome** — that is the
third attempt this row has earned, and the first two both inferred.

Note also that the two `setKeyChange`/`setClefChange` calls in our mid-tune branch are
ORDER-SENSITIVE: swapping them cost `clefs-tune7` 7.40px of dx on the first run, before any
of the above was in play.

### 3.3c THE CHORD LANE IS INVERTED, AND `placeInLane` DOES NOT WALK SOURCE ORDER

`visual-transpose-04` draws its first chord symbol at y 79.12 where abcjs draws it at
99.12 — exactly one lane, `(fontSize + margin) * 1`. The rule is real and is `setLane`:

    if (rightMostAbove.length > 1 || rightMostBelow.length > 1)
        setLane(absElems, rightMostAbove.length, rightMostBelow.length);
    // invertLane: this.lane = total - this.lane - 1

(`layout/voice.js:100-102`, `relative-element.js:103-107`) — "flip the indexes of the names
so that we can count from the top line". **LANE 0 IS THE TOP**, and everything that fitted
in the packing lane 0 ends up at the BOTTOM when a second lane opens.

`layoutAboveStack`'s existing comment says the opposite and cites a measurement of
`stacked-annotations` to justify it. **Both measurements are right and the comment's
conclusion is wrong.** Instrumented, abcjs's final lanes are:

    transpose-04         "C" -> 1   "G" -> 1   "D" -> 0
    stacked-annotations  "con brio" -> 1   "Allegro" -> 0   "staccato" -> 1

Source order plus inversion reproduces the first and *inverts* the second, so
`placeInLane` is not walking source order. What it walks is not yet pinned down, and there
is a strong clue: **abcjs MERGES two marks at the same position into ONE `elem.chord`
entry with a newline** — `CHORDORDER ["Allegro\ncon brio@above"]` — while
`setLaneForChord`'s own criteria say "a chord can have more than one line (for instance
"C\nD") each line is a lane". So a multi-line mark is one parse entry, one or more
children, and one lane PER LINE. That relationship is the missing measurement.

Do not land the inversion alone: on `transpose-04` it fixes `"C"` and puts `"D"` and
`"G"` the wrong way round.

**THE MISSING MEASUREMENT IS NOW MADE, AND IT IS NOT WHAT THE CLUE SUGGESTED**
(2026-08-12b). `placeInLane` traced on `transpose-04`, dims and all:

    PLACE "C"  dim  75.75..87.31   rightMost [0]              -> lane 0
    PLACE "G"  dim 126.71..139.16  rightMost [87.31]          -> lane 0
    PLACE "D"  dim 127.15..138.71  rightMost [139.16]         -> lane 1  (new)
    LANE  "C" -> 1   "G" -> 1   "D" -> 0

So: **`setLaneForChord` DOES walk source order** over elements and forward over children —
what reverses is the CHILD LIST itself. `addChord` closes with
`for (var j = chords.length - 1; j >= 0; j--)` under its own comment, *"parse these in
opposite order because we place them from bottom to top"* (`creation/add-chord.js:42`). And
the two marks on one note differ in extent because each is CENTRED and `G` measures wider
than `D` — nothing to do with the `\n` merge the earlier clue pointed at.

**IT WAS IMPLEMENTED, MEASURED AND REVERTED.** Inversion plus our own `el.texts` order
(already reversed for CHORD SYMBOLS) took `visual-transpose-04` from byte 7784 to **12466
of 15781** — and broke `stacks above the staff with the first one written on top`, whose
claim IS abcjs's measured answer (`stacked-annotations`: `Allegro -> 0`, `con brio -> 1`).

**BECAUSE ANNOTATIONS AND CHORD SYMBOLS ARE STACKED BY TWO DIFFERENT MECHANISMS HERE.** The
annotation branch carries its own within-element stack —
`lane = annotationAboveStep + ((above.length - 1 - index) * size * laneLineStep) / STEP` —
so the lane machinery inverting on top of it double-counts. abcjs has ONE mechanism.
**The job is to delete the annotation branch's private stack and let the lanes do it**, and
only then land the inversion. That is the whole remaining measurement.

### 3.3d A SLUR CLOSES ON A GRACE NOTE — measured, one fixture

`visual-tablature-10` is `(f3 {a})y` and abcjs draws a curve we draw not at all: `TIE a1
49.051 a2 91.01252422706631`, the second anchor being the GRACE NOTE. Instrumented, the
parser puts the `)` on the last grace note rather than on the element that follows it:

    GRACE {"pitch":12,"name":"a","duration":0.125,"endSlur":[101],"verticalPos":12}

and `addSlursAndTies` runs for grace notes as well as pitches
(`abstract-engraver.js:498`, `:728`) — but NEVER for a rest, which is why the `y` spacer
after it closes nothing. Ours records `slurEnds` on the main event and `layoutCurves` skips
any anchor whose event is a rest, so the close is dropped entirely. Two parts: the parser
must attach a `)` that follows a grace group to the last GRACE note, and the layout must be
able to anchor a curve on a grace head — which `NoteAnchor.graceSlur` already half carries.

### 3.3f THE GRACE GROUP'S SECOND BEAM STARTS ONE GRACE LATE — partly measured

`flattener-17`'s first beam subpath is byte-identical and its SECOND is not: ours runs from
143.45, abcjs's from **153.45** — one grace advance later — and the y's differ with it.
This is the thread `CHECKPOINT-2026-08-11b.md` §2.18 left open ("the level count is certain
and the second beam's y is not, so the implementation was reverted").

What is measured now, instrumenting `createAdditionalBeams` and `addGraceNotes`:

    GRACEDUR i 0 raw 0.125 used 0.0625      (every grace, in both groups)
    AUX j 1 single false startX 153.45 endX 164.05 i 2 nelems 3
    AUX j 0 single false startX 153.45 endX 164.05 i 2 nelems 3
    AUX j 0 single false startX 501.74 endX 562.34 i 6 nelems 7

An aux beam is created at the FIRST element whose `getDurlog(duration) < -3`, at that
element's own x (`layout/beam.js:180-190`). Every grace pseudo-element has duration
`0.0625` — durlog −4 — which makes **index 0 only**, created at i = 0. Two facts contradict
that: a `j 1` exists at all, and both start at the SECOND grace rather than the first.

**So the pseudo-elements `createAdditionalBeams` walks are not the ones `addGraceNotes`
prints durations for**, and finding out which they are is the next probe. Note the
seven-grace group reports only `j 0` where the three-grace group reports `j 0` and `j 1`,
which is backwards from any duration rule and is the sharpest clue in the trace.

### 3.3g `!beambr1!` BUILDS A LITERAL `split` ARRAY, AND ITS SEGMENTS OVERLAP

`visual-misc-12` is `B!beambr1!B/BB/` under `L:1/8` — durations 1/8, 1/16, 1/8, 1/16, so
only notes 2 and 4 carry a second beam and each is alone at that level. Ours therefore draws
two 5px stubs, `45→40` and `96.21→91.21`. abcjs draws `45→24.81` and `35.79→40`, **which
overlap**.

Modelling `beambr` as a RUN BREAK reproduces neither: implemented and reverted, it changed
nothing at all, because at level 1 the run is already empty where the break would fire.

Reading `layout/beam.js:188-205` with that output in hand explains the shape. The split is
pushed IMMEDIATELY AFTER the aux beam is created, at the same element:

    if (!auxBeams[index].split) auxBeams[index].split = [auxBeams[index].x]
    var xPos = calcXPos(asc, elems[i - 1], elem)
    auxBeams[index].split.push(xPos[0]); auxBeams[index].split.push(xPos[1])

so `split` becomes `[thisNoteX, prevNoteRight, thisNoteLeft]` and closes with `endX`. The
drawn pairs are `(thisNoteX, prevNoteRight)` and `(thisNoteLeft, endX)` — the FIRST runs
BACKWARDS from this note to the previous one's right edge, which is where `45→24.81` comes
from, and the second is the forward stub. **A `beambr` does not break a run; it makes the
aux beam reach back over its neighbour and then resume.**

Porting it means carrying abcjs's `split` array through to the emitter rather than
expressing it as runs — our beam model has one `[x1,x2]` per level per run and cannot say
this. One fixture, and the last 200 bytes of it.


**MEASURED IN FULL, IMPLEMENTED, AND REVERTED (2026-08-12b) — TWO NUMBERS ARE NOT OURS.**

abcjs's own final array on `visual-misc-12`, printed at the push and at the close:

    SPLIT      i 1  index 0  auxX 45  xPos [24.810000000000002, 45.6]  elemW 9.81
               splitBefore [45]  asc false
    SPLITFINAL [45, 24.810000000000002, 35.79, 40]  endX 40

`drawBeam` walks that in PAIRS (`draw/beam.js:11-20`), so the level-1 beam is
`(45 → 24.81)` — **backwards over the previous note** — then `(35.79 → 40)`, and the run's
own stub is a third segment. The infrastructure to draw it is small: a `split` array on the
beam line and a loop in the emitter interpolating each pair's y along the whole beam's
slope. That part was written and worked.

**WHAT DOES NOT RECONCILE IS `calcXPos`'s OPERANDS.** With `asc === false` it returns
`[starthead.x, endhead.x + 0.6]`, and abcjs's pair is `[24.81, 45.6]` — so its
`elems[0]`'s head sits at **24.81** and `elems[1]`'s at **45**. Our `StemInfo.headX` for the
same two members is **15** and **23.79**, and 15 is right by the MAIN beam, which runs
`15 → 96.81` off `[starthead.x, endhead.x + 0.6]` in both engines. One notehead width
separates the two readings and nothing in the trace says which head abcjs is taking.

**AND THE `+= elem.w` GUARD DOES NOT FIRE THOUGH IT READS AS THOUGH IT MUST.**
`if (split[split.length - 1] >= xPos[0]) xPos[0] += elem.w` with `split = [45]` and
`xPos[0] = 24.81` — yet the final array keeps 24.81. Reproducing the guard puts the first
segment at 34.62 and the fixture further out.

So: the SHAPE is settled and two operands are not. Do not re-derive the shape; get
`calcXPos`'s two heads printed with their `parent.x` and `dx` first.

### 3.3h A BEAMED STEM'S ANCHOR IS 0.005px SHORT — located, not fixed

`visual-svg-per-line-02` prints a stem as `M 265 … L 264.39 …` where abcjs writes `265` and
`264.4`. Probed, our stem's line is `x1 264.695 thickness 0.6`, so the emitter's two edges
are `264.995` and `264.395` — and `roundNumber` sends the first to **265** (the double for
`264.995` sits just above the half) and the second to **264.39** (the double for `264.395`
sits just below). Both roundings are abcjs's own `parseFloat(toFixed(2))` behaving
correctly.

So the emitter is right and **the anchor is 0.005px short**: abcjs's stem x is the head's
right edge at exactly `265`, ours implies `264.995`. Deriving the far edge from the anchor
rather than from the centre — which is what `printStem` does, `x` and `x + dx`
(`draw/print-stem.js:5-14`) — was implemented and **reverted**: it is the faithful form and
it changed nothing, because the anchor it derives from is the value that is wrong.

The suspect is named in the code already: our beamed stem takes a BRAVURA anchor
(`head.anchors.stemUpSE`) where abcjs takes `furthestHead.w`, the head's DECLARED width —
the same `ENGRAVING_DEFAULTS`-shaped hole the line weights came out of, one axis over. Start
by printing both for this fixture's beamed stem.

### 3.3i `flattener-23` IS 166 BYTES FROM CLOSING, ON A GRACE SLUR'S y

Its last divergence is one curve: `M 315.71 79.37` against abcjs's `M 315.71 78.21`. The x
is identical and the y is **1.16px — 0.2994 pitch** — apart.

Instrumented, abcjs draws exactly one curve in the tune and it is the automatic GRACE slur:

    TIE a1 312.7142857142858 a2 322.7142857142858 isGrace true above false

`drawTie`'s `fudgeY` is 0 unless `fixedY`, so the difference is in `startY` itself — the
pitch `calcSlurY` hands `drawArc`. Both engines agree on the two anchor x's and on the +3
that `drawArc` adds, so the anchors are right and only the pitch is not. 0.2994 is not a
third, not the 0.6 grace scale and not half a notehead; naming it is the next step, and the
fixture closes when it is.

### 3.4 THE REST OF THE TABLE — 13 STRUCTURAL, 13 ULP

Read `/tmp/abcts-svg-bytes-ranked.txt` after `npx vitest run tests/svg-bytes.test.ts`, and
classify it by aligning on the FIRST DIFFERING CHARACTER and comparing the two numbers it
sits in — a crude "does one side have a long tail" test calls the wrong family the majority.
At 26 rows that split is **13 structural / 13 ULP**, and the thirteen are almost all the
same `x.0000000000004` shape.

**AND THE CLASSIFIER HAS A TRAP OF ITS OWN**: the ranked table's two excerpt lines are
prefixed `got  …` and `want …`, which are DIFFERENT LENGTHS. Comparing them raw diverges at
the prefix and calls every row structural — it reported `ULP 0 STRUCTURAL 29` until the
prefixes were stripped. Strip them before aligning.

The named structural rows, cheapest last:

- THREE `[M:]` IN ONE MEASURE — §3.3, and the whole of `visual-svg-02-staffwidth-12`.
- `visual-misc-12`'s `!beambr1!` beam split.
- `flattener-37` emits `rests.half` where abcjs emits `dots.dot` — an element ORDER row.
- `visual-transpose-04`'s chord annotation is 20px high — that is §3.3c.
- `visual-tablature-20`'s missing note element and its 16px-narrow staff line.
- The `x.0000000000004` tail on `88.038`, `417.893`, `29.69`, `609.95…` — the same ULP
  family as §3.2 and probably the same cause.

---

## 2b. THE LANDINGS AFTER THE FIRST CHECKPOINT — 26 → 22

### 2b.1 A STEM'S DECORATION FLOOR IS ITS DECLARED `bottom`, WHICH IS `p1 - 1`

`createDecoration` receives `abselem.bottom` as `minPitch`, and a DOWN stem's element
bottom is `minpitch - 8` — an INTEGER — where its drawn end is `minpitch - 7`. Instrumented
on `visual-decorations-01`: abcjs reports `abselemBottom 1`, `-3`, `-8` for its
down-stemmed notes and the head box `pitch - 1.0444` for its up-stemmed ones.

`PlacedLine.pitchRange` already carried that number, the JS-truthiness exception included
(`if (opt.bottom)` skips a zero). `decorationBelowBase` re-derived it from the DRAWN y and
lost the `- 1`, which is the one pitch three of that fixture's twelve below fermatas were
out by.

### 2b.2 AN ORNAMENT ABOVE A BEAMED NOTE IS MOVED CLEAR OF THE BEAM

`moveDecorations(voice.beams[i])` runs straight after `layoutBeam` and before
`voice.adjustRange` (`layout/voice.js:5-14, 30-50`):

    var top = yAtNote(child, beam)                 // the beam's PITCH at the note's x
    if (el.bottom - 1.5 < top) {
      var distance = top - el.bottom + 1.5
      el.bottom += distance; el.top += distance; el.pitch += distance
      top = child.top = el.top                     // the next ornament stacks on the moved top
    }

The creation phase cannot know this: a beamed note has no stem when `createDecoration`
runs, so every ornament is placed against the notehead and a beam riding above it would be
drawn straight through. `yAtNote` samples at `element.x`, NOT at the stem's
`furthestHead.x + dx`, and off `beam.beams[0]` — the outermost beam, in pitch.

Not reproduced: abcjs guards on `if (child.top)`, JS-truthy, so an element whose declared
top is exactly pitch 0 is skipped. Nothing in either corpus reaches it.

### 2b.3 …AND THE BEAM'S START x IS `x + (w - 0.6)`

`calcXPos` writes it as a compound assignment — `startX = starthead.x;
if (asc) startX += starthead.w - 0.6` (`layout/beam.js:74-81`) — so the 0.6 comes off the
WIDTH, not off the sum. Ours read left to right and formed `(x + w) - 0.6`, which is
545.9214999999999 where abcjs has a clean 545.9215; every stem `getBarYAt` delivers along
that line inherits it. **It was the last token between `visual-decorations-01` and byte
parity**, and it surfaced only because 2b.2's probe printed both engines' beam ends.

### 2b.4 THREE MORE CONSTRUCTED OFFSETS — the `PlacedGlyph.dx` rule, three elements over

`placeElement` derives an offset as `g.x - el.x` when the glyph carries no `dx`, and
`(x + a) - x` is not `a`. Three sites were still deriving:

| site | abcjs | ours was | cost |
|---|---|---|---|
| a DECORATION's `deltaX` | `width / 2` then `-= symbolWidth / 2`, handed whole to `RelativeElement` (`decoration.js:44-48`) | `(x + w/2) - gw/2` | `scripts.roll` at 419.0510833333332 vs …33 |
| the CLEF's octave `8` | `addRight(new RelativeElement('8', dx + adjustspacing, …))` (`create-clef.js:49`) | `(x + 5) + adjust` | 78.6605 vs 78.66050000000001 — **and it unblocked 44k bytes on two fixtures** |
| a DYNAMIC's kern | `printSymbol(x + dx, …)`, `dx` running over the letters (`draw/print-symbol.js:18-26`) | derived | `pppp` at 417.893 vs 417.89300000000003 |

**A ULP in an x is not a small defect — it is a WALL.** The clef one sat at byte 6931 of
85865 on `visual-tablature-15` and `visual-mouse-click-01`; closing it took both to 51404.

### 2b.5 A TREMOLO IS A STACK OF `flags.ugrace` GLYPHS

`compoundDecoration` (`creation/decoration.js:87-122`), called THIRD in `createDecoration`
— after the two dynamics and BEFORE `closeDecoration`, so its glyphs lead the element's
decoration children:

    placement = dir === 'down' ? lowestPitch() + 1 : highestPitch() + 9
    if (dir !== 'down' && count === 1) placement--
    deltaX = width / 2;  deltaX += (dir === 'down') ? -5 : 3
    for (i = 0; i < count; i++) { placement -= 1; addFixedX(symbol, deltaX, w, placement) }

`highestPitch`/`lowestPitch` are the HEADS' extremes, and the slashes march DOWNWARD from
the first whichever way the stem points.

**The site already carried a note saying ours "is a divergence in SHAPE and belongs in
`ABCJS-DIFFERENCES.md`" — and it was in neither that file nor the `DIVERGENT` list.**
Strict has no latitude, so it is ported; `abc2.1`/`extended` keep the drawn `tremoloN`
bars, which are the right shape.

### 2b.6 `sfz` IS THREE LETTERS TOO, AND THE MISSING GLYPHS WERE OURS

The note beside it read: abcjs composes `sfz` from `s`, `f` and `z`, and "this repo's
Bravura table has no single-letter `s` or `z` to name." True of the table — and the table
is GENERATED from a list in `scripts/gen-glyphs.mjs` that simply never asked for them.
SMuFL names them `dynamicSforzando` and `dynamicZ`.

**The fourth time on this branch that a note naming a cause is the reason the row stopped
being read** (the `G8` breve, the `extra-class` accent, the notehead `data-name`, this).

### 2b.7 `avoidCollisionAbove` — AN INNER NOTE PUSHES BOTH ENDS OF A SLUR

    if (maxInnerHeight > this.startY && maxInnerHeight > this.endY)
      this.startY = this.endY = maxInnerHeight - 1

(`tie-element.js:216-227`.) BOTH ends move, to the SAME value, and only when the inner note
clears both — which is why it is one number and not a per-end clamp. `layout()` applies it
after `calcSlurY` on every drawn slur; **`getYBounds` does NOT call it**, so the RESERVE is
untouched and only the drawing moves.

`internalNotes[i].highestVert` is the per-pitch value from `abstract-engraver.js:696-717`:
its own `verticalPos`, except that a LONE note — `pp === 1`, so both the
top-when-stem-down and bottom-when-stem-up tests pass — takes the chord's top and adds 6
when its stem is UP and it is shorter than a whole note.

`visual-selection-01`'s `(bfdf)` is the case: the beam rule puts its ends at 10.0444, the
inner `d` reaches 11, so abcjs draws the whole curve at 10 and ours sat **0.17px** high on
the LAST slur of a 202k-byte file.

### 2b.8 THE `W:` BLOCK WEARS ITS OWN GROUP, AND A BLANK LINE IS DRAWN AS A SPACE

Two rules, both at the tail of `visual-selection-01`.

`addMultiLine`'s ARRAY branch pushes `{ startGroup: groupName }` before its rows where its
STRING branch does not (`bottom-text.js:37-62`) — so `W:`, the one field `simplifyMetaText`
does NOT join into a single string, is the only one that wears a
`<g data-name="unalignedWords">`. `notes` and `history` are joined and wear nothing.

And **`renderText` rewrites blank lines at DRAW time, on the JOINED string**:

    text = params.name === 'free-text'
      ? params.text.replace(/^[ \t]*\n/gm, ' \n')
      : params.text.replace(/\n\n/g, "\n \n")
    text = text.replace(/^\n/, "\xA0\n")

(`draw/text.js:41-48`.) The `/g` is NON-OVERLAPPING, so three consecutive blank lines get a
space on the first and third and nothing on the second — doing it per row would space all
of them. `free-text` takes the other arm and `svg.js` then skips its empties outright.

Worth one byte, and it was the last of 202,156.

### 2b.9 A GRACE GROUP'S DEEPER BEAMS RUN ONLY OVER THE GRACES THAT HAVE THEM

`layoutBeam` calls `createAdditionalBeams(elems, asc, beam, isGrace, dy)` — **the same
function the ordinary beams take** (`layout/beam.js:168-258`), `isGrace` changing nothing
but `sy`. So a grace group whose durations differ takes PARTIAL auxiliary beams, with the
lone-note stub and its four-way side rule, exactly as an ordinary group does.

Ours drew every level across the whole group, which is right only when every grace is the
same length — **every rung of the ladder that named the level COUNT (§2.18 of
`-08-11b`), and none that could name this**. `{B2c/d/}` is the case: one eighth and two
thirty-seconds, so abcjs's second and third beams start at the SECOND grace and ours
started at the first, 10px left.

And the flush order is DEEPEST FIRST — `for (var j = auxBeams.length - 1; j >= 0; j--)` —
so two levels ending on the same note come out 2 then 1.

**§3.3f IS CLOSED BY THIS**, and it closed by asking what a NAMED abcjs function does rather
than by measuring the fixture: the level count was already right and the run structure had
never been asked about.


### 2b.10 THE LYRIC LANE IS SPENT IN PITCH, AND ITS MISSING HALF WAS THE PER-VOICE DROP

**§3.2 IS CLOSED.** `staff.bottom -= (lyricHeightBelow + margin)` where `lyricHeightBelow`
is `lyricDim.height / STEP` plus `spacing.vocal / STEP` — so the DIVISION is of the LANE,
not of the accumulated y (`set-upper-and-lower-elements.js:50-54`,
`abstract-engraver.js:777`).

Spending the lane ALONE was tried twice and recorded twice as costing
`ave-verum-corpus`, `multi-voice-lyrics-two-voices` and `visual-multi-voice-01` exactly
18.84px — ONE lyric block — under the note *"porting the lane without the per-voice diff is
half a rule"*. It was, and the diff is:

    child.pitch -= child.voiceNumber * child.lyricHeightBelow    // :170-173
    bottom = Math.min(element.bottom, child.pitch)               // :174
    …
    staff.bottom -= diff                                         // :82, per VOICE

**AND THE REASON THE OLD FORM WORKED IS THE REASON THE TWO TERMS ARE NOT SEPARABLE.** Ours
took a `max` against the LAST VERSE'S BASELINE and divided the delta back; that baseline
already carried the per-voice drop, because `anchorLyrics` puts it there
(`voiceIndex * goldenTextHeight(size)`). So one derivation held BOTH terms and the other
held NEITHER — which is exactly why spending half of it was a 18.84px regression and looked
like the lane being wrong.

The port: `anchorLyrics` stamps `voice` on each lyric text (the field already existed on
`PlacedText`), the extent gathers `lyricVoiceDrop = max(voice × blockHeight / STEP)`, and
the bottom takes `lower(lyricLanePitch + margin + lyricVoiceDrop)` — abcjs's own two
subtractions, in pitch.

`visual-multi-voice-02` goes from byte 38733 to **48187 of 48279** and
`visual-tablature-23` from 153 to **9585 of 11740**; `pixel-parity` stays 0 of 120 and the
harvested corpus 0 of 174. **AND ALL FOUR OF `multi-voice-02`'s STAFF ORIGINS ARE NOW
abcjs's OWN DOUBLES** — 107.982, 214.87900000000002, 346.438, 453.335 — where the fourth
was 453.33500000000004 before.

Not reproduced, and no fixture separates it: abcjs's `diff` also carries
`element.bottom - staff.bottom`, the element's own overhang below the staff's lowest point,
and takes the LAST such element rather than the deepest. Every fixture's lyric-bearing
element IS its lowest. A control with a low stem on a voice whose lyric is not the deepest
would name it.


### 2b.11 THE RULE CLOSING A MULTI-STAFF GROUP IS `calcY` OFF EACH STAFF'S OWN `absoluteY`

`topLine = renderer.calcY(10)` on the FIRST staff and `bottomLine = calcY(linePitch)` on
the LAST, each taken while `renderer.y` is that staff's origin
(`draw/staff-group.js:86-96`, `:142-143`), and `calcY` is `this.y - ofs * spacing.STEP`.
ONE product each — the same shape the BRACE beside it already took.

Ours was `(staff.originY + stepToY(±4)) + systemOy`: three terms in the other order, and it
straddled a `roundNumber` boundary. `453.335 - 2 * 3.875` is the double that prints
`445.585` and rounds to `445.58`; the three-term form lands one ULP above and rounds to
`445.59`.

**FOUND BY ELIMINATION, AND THE ELIMINATION WAS THE WHOLE JOB.** The layout's own barlines
were printed and were abcjs's numbers to the digit — `100.232`, `207.12900000000002`,
`338.688`, `445.585` — so the divergent path could not be one of them, which is what sent
the search to the LAST path in the file. **A probe that prints the right answer has ruled
something out**; that is worth as much as one that prints the wrong one.


### 2b.12 AN ENDING'S BRACKET IS ONE PRODUCT OFF THE LANE'S PITCH, WITH THE `- 2` INSIDE

`drawEnding` takes `y = roundNumber(renderer.calcY(params.pitch))` where `params.pitch` is
`positionY.endingHeightAbove` already reduced by the drop (`draw/ending.js:9`), and `calcY`
is `this.y - ofs * spacing.STEP`.

TWO defects, and the first one hid the second:

- ours added `voltaDrawDrop * STEP` to a y that was itself `-pitch * STEP` — **two products
  added where abcjs takes one**; and
- the bracket was built at a placeholder step and SHIFTED onto that y, where
  `a + (b - a)` is not `b`.

Fixing the shift alone moved nothing, which is what said the base itself was wrong. The
ladder now returns the ending rung's PITCH beside its y — exactly as it already did for the
tempo notehead, `AboveLadder.tempoPitch` — and the bracket is PLACED.

`visual-tablature-15` and `visual-mouse-click-01` go from byte 51404 to **53158 of 85865**.

**AND THEIR NEXT DIVERGENCE IS THE TRIPLET BRACKET, ONE LANE OVER AND THE SAME SHAPE** —
449.85 against abcjs's 449.83. `layoutTuplets` computes its end pitches with
`pitchOf(y) = -y / ENGRAVE.spacePerStep` over `extentOf`'s ACCUMULATED y
(`layout/triplet.js:29-64` is `max(anchor.parent.top, 9) + 4`, a PITCH), so it is the
`x * STEP / STEP` round trip once more. 0.02px is 0.005 pitch, which also says the `max`
picked the measured term rather than the constant 9 — a fixture where it picks 9 would be
exact either way. The fix is to give `extentOf` a pitch twin: the head's declared half-box
in pitch, and each line's `pitchRange` (the stem's `p1 - 1` included, which `extentOf`
already models in y as `+ spacePerStep`).

**IT WAS BOTH, AND NEITHER WAS THE ROUND TRIP ALONE — §2b.13.**

**AND BOTH ENGINES WERE PROBED BEFORE ANY OF THAT WAS WRITTEN, WHICH CHANGES THE JOB.**
On `visual-tablature-15` abcjs reports ONE triplet and reports it in clean integers:

    TRIP up=true  a1.top 16  a2.top 11  start 20  end 15

Ours reports TWO, and the SECOND is abcjs's answer exactly — `a1 16, a2 11 → 20, 15`. The
FIRST is ours alone and carries `a1.topPitch 15.027002700270028`, whose fraction is a
division artefact rather than anything abcjs computes. **So this row may not be an
arithmetic defect at all**: the pitch twin would make a wrong-shaped number exact instead of
removing it. Find out WHICH triplet draws at 449.85 and why we lay out a second one, before
porting anything. abcjs's probe is `ABCJS_TRIP=1` on `layout/triplet.js:34`.


### 2b.13 A TUPLET'S MIDDLE MEMBER DECLARES **ITS OWN** NOTEHEAD'S BOX, IN PITCH

`middleElems[i]` is the head's `RelativeElement` and its `top` is
`pitch + symbolHeightInPitches(symbol) / 2` (`layout/triplet.js:41-44`,
`relative-element.js:22-24`).

Two things were wrong and **only one of them was written down**. The note at the site said
the box is `pitch ± thickness/2` — right — and then read `ENGRAVE.noteheadHalfHeight`, which
is `noteheads.quarter` and nothing else. Probed through abcjs on `visual-tablature-15`:
`pitch=10, top=11.049290322580646`, a half-box of **1.04929**. `noteheads.half` publishes
`h: 8.132` where the quarter publishes `8.094`, so an OPEN head declares 0.0098 of a pitch
more. The other half was the round trip: the whole thing was computed in y and divided back.

**AND 0.0098 OF A PITCH DECIDES WHETHER THE FLATTEN FIRES AT ALL.** abcjs's `max + 4` is
15.049290322580646 against an `endNote` of 15, so the bracket is drawn FLAT at `max + 3`;
ours reached 15.0444, the test failed, and the bracket SLOPED. **A rounding-sized constant
inside a comparison is not a rounding-sized error** — the row read as a 0.02px hundredth and
was a different shape.

`visual-tablature-15` and `visual-mouse-click-01` go from byte 53155 to **63245 of 85865**.

**AND A FIRST ATTEMPT USED `NoteAnchor.pitchStep` FOR THE HEAD'S PITCH AND WAS WRONG** —
that is the chord's FIRST WRITTEN pitch, where abcjs's `middleElems[i]` is one specific
head; on this fixture it reads 1 where the head is at abcjs pitch 10. The head's pitch comes
off `anchor.top` less one step (the curve padding the anchor carries), which divides an
exact multiple of `spacePerStep` rather than an accumulated sum.

**WHAT IS LEFT ON THIS FIXTURE IS A TIE, AND IT IS TWO THINGS.** Ours draws
`slur@309.34, tie@312.34`; abcjs draws `tie@332.34, slur@309.34`. So (a) the tie's ANCHOR is
20px — one note — earlier in ours, and (b) the `otherchildren` merge orders it after the
slur where abcjs puts it before. Settle the anchor first: the order key is the CLOSE, so a
wrong anchor can produce a wrong order by itself.


### 2b.14 FIVE MORE, ALL TRACED RATHER THAN REASONED — 19 → 15

- **A CURVE SPRINGS FROM THE MAIN NOTEHEAD.** `calcX` sets `startX = anchor1.x` and
  `anchor1` is the MAIN head's `RelativeElement`. Ours filtered an element's heads on the
  NAME alone and a grace head is a `notehead*` like any other, so a curve opening on a
  graced note sprang from its first GRACE — 20px, two grace advances.
- **AND A GRACE SLUR TAKES ITS PLACE IN `otherchildren` AT THE MAIN NOTE.**
  `addGraceNotes` runs at `abstract-engraver.js:840` and the pitch loop's
  `addSlursAndTies` at `:732`, so within ONE element the WRITTEN curve is `addOther`'d
  first. Traced through `voice.addOther`: grace, written, grace, written, each written one
  carrying `a2x null` because its close has not been seen.
- **A TRAILING nonMusic LINE IS A SIBLING GROUP**, not the head of the bottom block
  (`draw/draw.js:55`, `:64-72`). Ours ran the two arrays together and wrapped the lot in
  one `<g>`.
- **A JOINED STAFF'S BARLINE REACHES ONE PRODUCT OFF THE STAFF ABOVE'S OWN `absoluteY`** —
  `bartop = renderer.calcY(2 + tabNameHeight)` taken while `renderer.y` is THAT staff's
  origin (`draw/staff-group.js:132`). Ours reached it through this staff's frame, four
  terms. `PlacedLine.absY1`/`absY2` are the ends the translation must not touch.
- **A SPLIT CURVE IS DRAWN AS A TIE** — `if (!params.anchor1 || !params.anchor2)
  params.isTie = true`, abcjs's own comment: *"if the slur goes off the end of the line,
  then draw it like a tie"*. Six `data-name="slur"` against abcjs's four.
- **AND `otherchildren` KEYS ON THE ANCHOR, NOT THE ARC.** `drawArc` adds 6 at the start
  and 4 at the end; a HAIRPIN closing on the same note has neither, so keying the arc put a
  curve 6px right of the hairpin sharing its element. The secondary key is `createNote`'s
  own order for ONE element: `addSlursAndTies` (:732), `addGraceNotes` (:840), then
  `createDecoration` (:847) — whose first call is `volumeDecoration` and whose second
  builds the `CrescendoElem`.
- **A SLIDE BOWS ABOVE AND IS DRAWN AS A SLUR.** `calcTieDirection` takes
  `this.voiceNumber === 0` for a slide's `TieElem` — it carries none — so `above` is TRUE;
  and `isTie` is recomputed from the anchors, whose two BLANKS sit at `yPos2 ± 1`, so
  neither arm fires.


### 2b.15 THE CHORD LANE, AND A RIGHT ANNOTATION'S ROOM — 15 → 14

**THE CHORD LANE INVERTS, AND THE ANNOTATION BRANCH WAS STACKING TWICE.**
`setLaneForChord` walks source order over elements and FORWARD over children; what reverses
is the CHILD LIST — `addChord` closes with a descending loop under its own comment, *"parse
these in opposite order because we place them from bottom to top"*
(`creation/add-chord.js:42`). Then `invertLane` flips the result once more than one lane is
used, *"so that we can count from the top line"*.

The inversion could not land alone — §3.3c said so and was right — because the ANNOTATION
branch carried a private within-element stack (`(above.length - 1 - index) * size *
laneLineStep`) while the lane machinery stacked ACROSS notes. **abcjs has ONE mechanism.**
That stack is gone and the above marks are stored reversed, as the chord-symbol branch
already stored them. abcjs's own lanes for `stacked-annotations` — `Allegro 0`,
`con brio 1`, `staccato 1` — now come out exactly.

**AND A RIGHT ANNOTATION'S ROOM STARTS AT THE DOT SHIFT, NOT AT ZERO.**
`createNoteHead` returns `dotshiftx = notehead.w + dotshiftx - 2 + 5 * dot`
(`create-note-head.js:50`) whether or not the note is dotted, and `createNote` hands it
straight to `addChord` as `roomtakenright` (`abstract-engraver.js:610`, `:858`). So a
`">G"` on an undotted quarter sits at `9.81 - 2 + 4`, not at `4` — traced,
`RIGHT "G" x 11.81 roomTakenRight 11.81`.

`visual-transpose-04` closed on the two together.


### 2b.16 INSTRUMENTING **BOTH** ENGINES FOR THE SAME QUANTITY — 14 → 12

Lance gave standing authority to instrument abcjs and abcts as much as it takes
(2026-08-13). Two rows that had each survived a careful source read fell the same hour once
BOTH engines printed the same number.

**`beambr` SPLITS AN AUXILIARY BEAM INTO A LIST OF x PAIRS.** `createAdditionalBeams`
builds a literal `split` array — the run's own start, then `calcXPos(prev, this)` per break,
then the beam's end — and `drawBeam` walks it in PAIRS, interpolating each pair's y along
the whole beam's slope (`layout/beam.js:193-203`, `:250-256`, `draw/beam.js:11-20`). The
FIRST pair runs backwards over the previous note.

A first attempt failed on two operands and **both were mis-read from the source**:

- `elem.w` is an `AbsoluteElement`'s width, which for a plain note is the NOTEHEAD's 9.81;
  ours is 11.4 with its trailing gap.
- the `if (split[last] >= xPos[0]) xPos[0] += elem.w` guard reads as though it cannot fire
  and DOES — the probe that seemed to deny it printed `xPos` AFTER the adjustment.

Instrumenting `calcXPos` itself settled both at once:

    XPOS asc false  startheadX 15  w 9.81  parentX 15 | endheadX 45  parentX 45
    SPLITFINAL [45, 24.81, 35.79, 40]  endX 40

**AND AN INCOMING SLUR-HALF STARTS AT THE *CLOSING* LINE'S PREFIX.** `startlimitelem` is a
per-LINE field on the engraver — clef, then key signature, then time signature, each
overwriting the last (`:165`, `:170`, `:179`) — so the half drawn on the second line reads
THAT line's prefix, not the one the slur opened on:

    abcjs  LIMIT2 staff-extra key-signature | x=60.153 | w=15.5
    ours   SPLITSYS from 0 to 1 … prefixEnd(from) 133.3544 prefixEnd(to) 75.653

Three earlier guesses — `bounds[].left` on either side, then the opening system's prefix —
each named a plausible number and none was it. `visual-svg-per-line-01`, 202,515 bytes, is
exact.

**THE RULE:** print the SAME quantity from both engines in one sitting. A source read gives
a hypothesis; only the pair of numbers gives the answer.

---

## 3.5 WHAT THE TABLE LOOKS LIKE NOW — 22 rows, and what each one is

Read `/tmp/abcts-svg-bytes-ranked.txt` for the live version. As of this checkpoint:

**Named and measured, in §3 above:** `visual-parsing-06`/`-07` (§3.1, the per-LINE forced
stem — the last flag of a three-line tune), `visual-svg-02-staffwidth-12` (§3.3, three
`[M:]` in one measure — **confirmed by counting: abcjs draws 3 `staff-extra
time-signature`, we draw 1**), `visual-transpose-04` (§3.3c, the chord lane, 20px),
`visual-misc-12` (§3.3g, `beambr1`'s literal split array).

**The ROOT-DIMENSION ULP FAMILY — 6 fixtures, one cause.** `visual-directives-01` and
`synth-timing-05` (a `clefs.G` y), `visual-transpose-output-04` (root `width`),
`visual-transpose-05`, `visual-options-01` and `visual-tablature-23` (root `height`).
**Measured this session on `synth-timing-05`**: system 1's walked origin is abcjs's own
number exactly — `15 + 7.56 + 33 + 7.56 + 0` then `3.875 × 13.724387096774194` — and
system 2's is not, because a system carrying a MID-TUNE block takes the
`originAdvances = [flat]` arm: one number where abcjs spends four `moveY`s
(`57.057`, `3.78`, `23.27`, `34.033`) and then `3.875 × 14.044387096774194` inside the
staff group. **The top block already walks abcjs's eight adds; the mid-tune block does
not**, and that is the whole of this family.

**CLOSED SINCE:** `visual-selection-01` (§2b.7, §2b.8) and `synth-flattener-17` (§2b.9).

**`visual-layout-07` IS §3.3b AND NOTHING ELSE** — measured this session by comparing every
accidental of both engines: the four treble ones are byte-identical and the BASS staff's two
key flats are 7.75px low, which is exactly the treble-vs-bass `verticalPos` split. Read
§3.3b's six-control ladder before touching it.

**THE 0.01 ROWS ARE NOT THE STAFF ORIGIN.** `visual-multi-voice-02` (barline bottom 445.59
vs 445.58), `visual-slurs-02` (barline top 80.68 vs 80.69) and `visual-tablature-15` /
`visual-mouse-click-01` (an ending bracket at 393.6 vs 393.59) all straddle a `roundNumber`
boundary — `parseFloat(x.toFixed(2))` on a value whose last bits differ. **Measured after
§2b.10: all four of `multi-voice-02`'s staff origins are abcjs's own doubles**, so the
residual is downstream of the origin, in the element's own y. `calcY` is
`this.y - ofs * spacing.STEP` and the bar branch is
`printStem(renderer, x, linewidth + lineThickness, y, bartop ? bartop : calcY(pitch2))`
(`draw/relative.js:61`) — instrument THAT rather than the walk.

**§2b.11 CLOSED `multi-voice-02`, AND THE OTHER THREE ARE THE ABOVE-LANE LADDER.**
`visual-tablature-15` and `visual-mouse-click-01` (an ending bracket at 393.6 vs 393.59)
and `visual-slurs-02` (a barline top at 80.68 vs 80.69) are the SAME straddle one lane over:
`drawEnding` takes `y = roundNumber(renderer.calcY(params.pitch))` where `params.pitch` is
`positionY.endingHeightAbove`, and abcjs builds THAT by `staff.top += endingHeightAbove +
margin` — **a running PITCH**. Ours builds the above lanes with `spend()`/`reserve()`, which
accumulate a **y**, so the ending's `y1` is a y ladder rather than one product off the
staff's origin. Converting the above-lane ladder to pitch is the same move `heightPitch`
and `bottomPitch` already made on the extent, and it is what these three rows want.

**AND IT HAS BEEN, ON `multi-voice-02`.** abcjs's four bars print

    BAR y 100.232               pitch 2  pitch2 10  bartop 0        rendererY 107.982
    BAR y 207.12900000000002    pitch 2  pitch2 10  bartop 100.232  rendererY 214.87900000000002
    BAR y 338.688               pitch 2  pitch2 10  bartop 0        rendererY 346.438
    BAR y 445.585               pitch 2  pitch2 10  bartop 338.688  rendererY 453.335

`453.335 - 2 * 3.875` IS the double that prints `445.585`, and `(445.585).toFixed(2)` is
`"445.58"`. Our staff origin is now the same double (§2b.10) and our bar still rounds to
`445.59`, so **ours is not formed as `origin - pitch * STEP`** — it is a staff-LOCAL y with
the origin added at emit time, two terms in the other order. The fix is the same rule the
layout already obeys everywhere else: **a bar's endpoint has to reach the emitter as a
PITCH**, the way a stem's `pitchRange` does, so the product is taken once against the
staff's own origin. That is one change and it is worth all four of these rows.

**Still unread:** `svg-per-line-01` (a hairpin drawn where abcjs draws a slur — an
`otherchildren` ORDER question, and note the SAME TUNE is byte-exact when not split per
line), `visual-tablature-15` and `visual-mouse-click-01` (an ending bracket at 393.6 vs
393.59), `visual-slurs-02` (a barline at 80.68 vs 80.69), `visual-multi-voice-02` (a staff
line at 414.24 vs 414.23), `synth-flattener-11` (a `!slide!` curve bulging the wrong way —
`closeDecoration`'s two blank anchors and a `fixedY` `TieElem`, `decoration.js:49-57`),
`synth-flattener-28` (a `flags.u8th` x ULP), `visual-svg-per-line-02-scaled` (a stem edge at
264.39 vs 264.4).


---

## 4. THE RATCHET

`tests/svg-bytes.test.ts`'s `PASSING` names all 145 byte-exact fixtures. It caught nothing
this session, which is the point of it — every change here moved the count the right way
AND kept every ratcheted slug. Regenerate it with `/tmp/gp/exact.mjs`; never shrink it.

---

## 5. THE ONE RED IS NOT OURS — AND I CALLED IT GREEN TWICE

`tests/corpus/content-parity.test.ts` fails at 44 of 45:

    diff   S7-voices    ours= 371 abcjs= 371   content OK, OFFSET out of span

Every note matches; 40 of them start at the wrong SOURCE OFFSET. I bisected it to HEAD~1,
~2, ~3, ~4, ~6, ~9 and ~12 — all red — and only then looked at the input:

    ../abcMusicKit/Tools/abcjs-debug/fixtures/S7-voices.abc   modified 2026-08-12 10:54
    ../abcMusicKit/Tools/abcjs-debug/golden/S7-voices.parse.json   generated 2026-08-08

`git -C ../abcMusicKit diff` shows that fixture is **uncommitted-modified by the other
agent working in that repo**: chord durations respelled (`[C,3G,3]` → `[C,G,]3`), an em dash
turned into a hyphen, the trailing newline dropped. Same notes, different offsets — which is
exactly what the gate says. The goldens were generated from the COMMITTED fixture and have
not been regenerated.

**Nothing in abcts caused it and nothing in abcts can fix it**: the rule here is never to
write to `../abcMusicKit`. It clears itself the moment that fixture is committed and its
goldens regenerated, or reverted.

Two lessons, both mine:

- **I reported that gate green on stale runs.** The number came from a `/tmp` report file
  written by an earlier run, not from the run I was quoting. Read the exit status, not the
  artefact.
- **A BISECT THAT NEVER TURNS GREEN IS TELLING YOU THE CAUSE IS NOT IN THE HISTORY.** Four
  more commits of bisecting bought nothing that the first `ls -la` on the two inputs did not
  say immediately.

`tests/svg-bytes.test.ts` is unaffected — `S7-voices` is not in the harvested corpus the
byte table walks, and both other corpora are green.

---

## 5b. AND `fuzz.test.ts` IS FLAKY UNDER A FULL RUN — IT MEASURES WALL CLOCK

It failed once in a full-suite run and passed three times on its own, which is the shape of
a phantom regression. Reproduced under load, the message names itself:

    "SLOW edge#19: 1304ms for 50008 chars"

`check()` does `const t0 = Date.now()` … `if (ms > 1000) problems.push('SLOW …')`
(`tests/fuzz.test.ts:24-33`). That is a WALL-CLOCK budget on a 50KB adversarial input,
asserted while vitest is running every other suite in parallel on the same machine. Nothing
about the parse is wrong and nothing in the engine changed.

**The threshold has NOT been touched**, because relaxing a gate to make a run green is the
one thing this branch does not do — and the assertion's intent (the parser must not go
superlinear on hostile input) is worth keeping. But the INSTRUMENT is wrong for a parallel
runner: a ratio against a known-linear input of the same size would say the same thing and
not depend on what else is on the CPU. That is a test-infrastructure change and it is
Lance's call, not one to make unattended.

Until then: **if `fuzz` fails, run it alone before believing it.** It also seeds from
`../abcMusicKit/Tools/abcjs-debug/fixtures` — the same directory §5 is about — so a fixture
edited mid-run changes its inputs as well.

## 6. THE HARNESS

Unchanged from `CHECKPOINT-2026-08-11b.md` §5, plus two things worth writing down:

**`walk.js` NEEDS `NODE_PATH`.** Running the scratchpad abcjs from this repo's directory
cannot resolve `jsdom`:

    NODE_PATH=../abcMusicKit/Tools/abcjs-debug/node_modules \
    ABCJS_PATH=/tmp/gp/abcjs \
    node /tmp/gp/walk.js --file tests/corpus-abcjs/fixtures/<slug>.abc

**AND `cd /tmp/gp` IS REFUSED IN THIS SANDBOX**, which silently resets the shell to the
WORKSPACE ROOT — where `npx vitest run` collects every sibling repo's tests and prints a
wall of unrelated failures. It bit twice today. Run everything from
`/Users/lrettberg/ICMLabs/Code/abcts` with absolute script paths, and if a suite reports
~160 test FILES, look at `pwd` before looking at the code.

**To render one fixture the way the byte gate does**, write a throwaway
`scripts/zzpr.ts` (it must live inside the repo — `tsx` will not resolve a script in `/tmp`
against these imports) and delete it before committing:

    import { readFileSync, writeFileSync } from 'node:fs'
    import { renderAbc } from '../src/compat/index.js'
    const abc = readFileSync(`tests/corpus-abcjs/fixtures/${process.env.ABCTS_FIX}.abc`, 'utf8')
    writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[0]?.svg ?? '')

`ABCTS_PROBE=1` on that prints the staff extents WITH the contributing source line, which is
what §2.4 turned on. **vitest swallows `console.log`**, so a probe run has to go through
`tsx`, not through a test.

---

## 7. THE RULES THIS SESSION ADDED

- **A BISECT THAT NEVER TURNS GREEN MEANS THE CAUSE IS NOT IN THE HISTORY.** Check the
  INPUTS' timestamps before the third commit.
- **A GATE'S REPORT FILE IS NOT ITS RESULT.** `/tmp/abcts-*.txt` outlives the run.
- **"DOES NOT RESERVE" MUST BE SAID, NOT OMITTED** — an absent reserve falls back to an
  estimate that reserves more, so deleting one can be a no-op or a regression, never a
  removal.
- **A RULE THAT IS ALREADY OBEYED BY ONE OF TWO FUNCTIONS IS A HALF-RULE.** `fontHeightOf`
  had the box padding and `textWidth` did not; landing it on both was worse than landing it
  on neither.
- **A ULP IN AN x IS A WALL, NOT A SMALL DEFECT.** The clef octave marker's last bit sat at
  byte 6931 of 85865 on two fixtures; closing it took both to 51404. Rank the table by what
  a row BLOCKS, not by how wrong the number looks.
- **A CONSTRUCTED OFFSET IS BUILT, NEVER DERIVED** — the `PlacedGlyph.dx` rule, and this
  session found three more sites obeying it and three not. When a byte row is a pure ULP in
  an x, ask FIRST whether the offset is recovered as `g.x - el.x`.
- **A NOTE THAT SAYS "…AND IT BELONGS IN `ABCJS-DIFFERENCES.md`" IS NOT AN ENTRY IN IT.**
  Two rows this session were divergences recorded only at the code site — the tremolo's
  shape and `sfz`'s precomposed glyph — so neither the doc nor the `DIVERGENT` list knew,
  and the ratchet could not see them. Grep the source for prose promising a doc entry.
- **AND THE ONE FROM §2.6, WHICH THIS BRANCH KEEPS RELEARNING**: a comment that explains why
  a derivation is safe is the reason nobody re-measures it. `writtenNote`'s said the source
  text was unnecessary, and it had been wrong on every lowercase-with-comma note in the
  corpus since it was written.
