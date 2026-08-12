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
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **29 of 171**, best 200613 | 49 of 171 |

`DIVERGENT` is still EMPTY. **142 fixtures are byte-exact and all 142 are RATCHETED.**

The 34 that remain classify **21 STRUCTURAL / 13 ULP** — see §3.4.

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

### 2.15 A REST'S DOTS COME BEFORE IT, BECAUSE THEY COME BEFORE A NOTEHEAD TOO

`createNoteHead` pushes the dots itself with `addRight` and the caller pushes the head with
`addHead` AFTERWARDS (`create-note-head.js:50-53`, `abstract-engraver.js:600-604`). DRAW
ORDER IS CALL ORDER, the rule already ported for a note as "flag, dots, accidental, head" —
and it stopped at the note. A rest's branch ends in the SAME `createNoteHead` call.
`"F"z3` in `flattener-37` is one dotted half rest on which the two engines disagree about
nothing else.

### 2.14 A QUARTER TONE NAMES ITSELF

`accMap` has SEVEN entries — `__ _ = ^ ^^` plus `_/` and `^/`
(`abc_parse_settings.js:147-155`) — and our `Accidental` is a whole-semitone enum with the
deviation in `microtoneCents`, so every quarter tone printed its BASE sign:  `_A` where
abcjs writes `_/A`. `Pitch.writtenAccidental` carries the name, the same shape as
`Pitch.written` beside it. Every other fraction (`^3/2`) has no `accMap` entry at all and
keeps the base sign, which is what abcjs does too.

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
split between the two paths is the whole remaining question. Three measurements to make
before trying again:

1. Which of `abc_parse_header.js`'s three call sites fires for a `K:` written after `V:`
   lines, as `visual-layout-07`'s second `K:GMin` is.
2. What `params.clef` actually is at `abc_parse_music.js:984` for an inline `[K:]`.
3. Which fixtures regressed at treble-default — they are the ones that name the rule.

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

### 3.4 THE REST OF THE TABLE — 21 STRUCTURAL, 13 ULP

Read `/tmp/abcts-svg-bytes-ranked.txt` after `npx vitest run tests/svg-bytes.test.ts`, and
classify it by aligning on the FIRST DIFFERING CHARACTER and comparing the two numbers it
sits in — a crude "does one side have a long tail" test calls the wrong family the majority.
At 34 rows that split is **21 structural / 13 ULP**, and the ULP thirteen are almost all the
same `x.0000000000004` shape.

The named structural rows, cheapest last:

- THREE `[M:]` IN ONE MEASURE — §3.3, and the whole of `visual-svg-02-staffwidth-12`.
- `visual-misc-12`'s `!beambr1!` beam split.
- `flattener-37` emits `rests.half` where abcjs emits `dots.dot` — an element ORDER row.
- `visual-transpose-04`'s chord annotation is 20px high — that is §3.3c.
- `visual-tablature-20`'s missing note element and its 16px-narrow staff line.
- The `x.0000000000004` tail on `88.038`, `417.893`, `29.69`, `609.95…` — the same ULP
  family as §3.2 and probably the same cause.

---

## 4. THE RATCHET

`tests/svg-bytes.test.ts`'s `PASSING` names all 142 byte-exact fixtures. It caught nothing
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
- **AND THE ONE FROM §2.6, WHICH THIS BRANCH KEEPS RELEARNING**: a comment that explains why
  a derivation is safe is the reason nobody re-measures it. `writtenNote`'s said the source
  text was unnecessary, and it had been wrong on every lowercase-with-comma note in the
  corpus since it was written.
