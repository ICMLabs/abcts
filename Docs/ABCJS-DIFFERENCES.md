# What abcts fixes — abcjs bugs and gaps, verified

abcts's default mode, `abcjs-strict`, reproduces abcjs **exactly, bugs included**. That is
the point: a drop-in replacement whose default output differs from the thing it replaces
is not a drop-in.

Opt into `abc2.1` or `extended` and each item below is corrected.

```js
import { renderAbc } from 'abcts/compat'   // abcjs's API, abcjs's output
import { parse, render } from 'abcts'      // render(score, { mode: 'abc2.1' })
```

---

## THE STANDING GOAL: `abcjs-strict` OUTPUT IS BYTE-EQUAL TO abcjs 6.7.0

**Lance, 2026-08-09b: abcts exists to build an abcjs-modern whose output — the SVG FILE and
the AUDIO — is 100% byte-equal to abcjs 6.7.0.** A tolerance is therefore not a compromise
to be balanced against effort; it is a defect that has not been written down yet.

Where that stands:

| surface | gate | standing |
|---|---|---|
| MIDI file | `tests/midi-file-ranked.test.ts` | **BYTE-EXACT, 0 of 3** |
| audio event list | `tests/audio-ranked.test.ts` | 0 of 72 |
| note timings | `tests/timing-ranked.test.ts` | 0 of 38 |
| **SVG file** | `tests/svg-bytes.test.ts` | **171 of 171 differ** — the open arc |

`tests/svg-bytes.test.ts` is the only gate here with no tolerance at all. Every other one
declares what it ignores — `pixel-parity` compares notehead centres, the harvested table
takes 0.05px, `dom-contract` counts classed ancestors rather than raw nesting — and each of
those was defensible for the axis it was built to see. **Together they let a markup
difference live forever**: a `<rect>` where abcjs writes a `<path>` moves nothing, a
`<g transform>` where abcjs writes absolute coordinates moves nothing, and an attribute in a
different order moves nothing. A byte string has no such latitude.

### The blockers, measured rather than estimated

**The document's FRAME is abcjs's now** — the root element attribute for attribute, the
page width, the group nesting, the drawing ORDER, and every glyph in absolute coordinates
with abcjs's own name on it. **Best case 5186 bytes in, median 174**, from 10 when the
table opened.

What is left, in the order the byte table hits it:

1. **THE ROOT'S `height`, on 109 of the 171 fixtures.** One or two ULPs, in both
   directions — `227.68050000000002` against `227.6805`, `176.0775` against
   `176.07750000000001`. abcjs accumulates `renderer.y` in PIXELS and closes with
   `y + padding.bottom`; we accumulate the same quantity in staff spaces and multiply by
   7.75 at the end. Rewriting only the last step was measured and moved 69 exact rows to
   70, so the noise is spread through the whole accumulation. It is the vertical half of
   the emission-quantum problem the horizontal arc already knows by name, and **109 rows
   are unmeasurable behind it**.
2. **The order and form of an element group's children.** A FLAG precedes its notehead on
   a single note and sits BETWEEN the heads of a chord, so it is the engraver's add order
   rather than a rule about flags. A STEM is `printStem`'s form — no separators between
   path commands, no `stroke`/`fill` inside a group, `class` before `data-name` — where a
   ledger and a staff line are `printLine`'s, with spaces and `data-name` before `class`.
   And a stem's two x values are the head's EDGES, in an order that carries which SIDE the
   stem is on.
3. **Glyph coordinate noise** — `M 54.78099999999999` against `M 54.781000000000006`, the
   same family as the height.
4. **A notehead's `data-name` is the WRITTEN NOTE** — `C`, `c`, `C,`, with its accidental
   prefixed and rewritten by transposition. A parser value the layout does not carry, so
   it is left UNNAMED rather than wrongly named. Tracked by `tests/dom-contract.test.ts`,
   which is at 208 of 694 rows.
5. **A multi-digit time signature is ONE group** — `<g data-name="12">` with unnamed
   per-character paths, where a single digit is a bare `data-name="3"` path.
6. **Curves and beams** — a tie is `drawArc`'s two-cubic closed path with
   `data-name="tie"` and a class built from its anchors' measure/note counters; a beam is
   `drawBeam`'s single concatenated path. Ours are a classed `<path>` and a `<polygon>`.

### Closed on the way here

Absolute pixels and no `viewBox`; no `transform` anywhere, on a group OR on a glyph; the
root element attribute for attribute; **the page being `maxwidth + padding`**, which is the
requested staff width raised by any line too stiff to compress and replaced outright by a
`%%staffwidth`; staff lines TOP-DOWN; every rule a closed path with abcjs's attribute order
and an explicit close tag; abcjs's two-decimal path rounding; **the meta-top group, which
is abcjs's outer `<g>` and is DELETED when empty**; the staff-lines group; abcjs's
nine-attribute `<text>` with its `<tspan>`; **the top-text block placed absolutely on the
PAPER** — title at `paddingLeft + width/2`, composer at `paddingLeft + width`, `%%center`
at `width/2` with no padding at all — and not bold; **`theReverser`**, which moves a
trailing article to the front of a title; **every glyph's coordinates baked into its first
`M`** with abcjs's own raw formatting, its `data-name`, and no separator between path
commands; **abcjs's drawing ORDER** — music, then beams, then everything else; and
**`data-index` counting SELECTABLES**, which admits a note and a rest and nothing else.

**A CORRECTION WORTH KEEPING.** A "~31px vertical origin difference, a real defect no pixel
gate could see" was recorded here and was wrong: the heights matched to the byte and our top
line was already at 36.642. abcjs writes its staff lines top-down and we wrote them
bottom-up, so comparing the FIRST path of each engine compared different lines. Reading two
different rules and calling the difference an origin is exactly the mistake this file exists
to prevent — measure the output, and be sure it is the same thing being measured.

**AND A SECOND ONE.** The title's centre was recorded as a defect whose one-line fix "the
arithmetic said must work" changed nothing at all. The arithmetic was right and the fix was
in the wrong place: the value it computed was overwritten four hundred lines later by a
left-edge formula applied to a middle-anchored row. **When a change to an input moves
nothing, the output is not reading that input.**

**None of these is a ruled divergence.** `tests/svg-bytes.test.ts`'s `DIVERGENT` list is
empty and stays empty until something is written up HERE with its evidence — a slug in that
list without an entry in this file is a tolerance wearing a disguise.

---

## How this list was verified

Every entry was checked against **abcjs 6.6.3 itself** — either by running it over the
fixture and reading its parse tree and element dump, or against the SVG goldens it
generated. None is inferred from reading its source. Where a claim came from reading
code rather than output, it says so.

That distinction earned itself: three entries were originally written from a plausible
reading of abcjs's parser and turned out to be wrong when the output was actually
measured.

Fixtures named below are in `abcMusicKit/Tools/abcjs-debug/fixtures/`.

---

## Parsing

### `+:` field continuation is not implemented — and the text becomes music

ABC 2.1 §3.2 lets a text field continue on the next line with `+:`. abcjs has no handling
for it, so the continuation falls through to the music parser and the words are lexed as
notes.

`frere-jacques.abc` continues a copyright notice across two lines. abcjs renders **ten
noteheads** made from the letters of *"belongs to their respective owners, or to the"* —
`b`, `e`, `g`, `c`, `d`, `a`, `f` are all note letters — and drops the real lyric that
follows. 45 elements where the tune has 35.

*Verified: run abcjs 6.6.3 over the fixture; its own `warnings` array reports "Unknown
character ignored" for the consonants.*

### `I:` information fields are ignored

ABC 2.1 §11.4 defines `I:<directive>` as equivalent to `%%<directive>`. abcjs has no `I:`
case at all. Inside a lyric continuation the field's own text is **sung**: `I: vocalfont
Times-Bold 16` puts "vocalfont", "Times", "Bold" and "16" under four noteheads.

*Verified: parse tree of the Gonzato §4.1.4 fixture.*

### There are only eight inline fields, and `[U:` is not one — MODE SPLIT

`letter_to_inline_header` is a switch on `line.substring(i, i+3)` with exactly eight arms:
`[I:`, `[M:`, `[K:`, `[P:`, `[L:`, `[Q:`, `[V:` and `[r:` (`abc_parse_header.js:347-410`).
ABC 2.1 §4.19 allows any field inline that is legal in a tune body, which includes `U:`,
`w:` and `T:`. Anything outside the eight falls past the switch, so abcjs reads the `[` as a
CHORD, fails on the field letter, and warns its way through the characters one at a time.

`[U:n=!accent!]nCDEF|` is therefore, in abcjs: seven warnings — `Expected ']' to end the
chords`, `Unknown character ignored` on the `U`, `Unknown bar symbol` and `Unknown bar type`
on the `:`, `Unknown character ignored` on the `n`, the `=` and the later `n` — an
**invisible barline** spanning `!accent!]` and carrying that decoration, and four plain
notes. The macro is never defined and the `n` before `C` is discarded.

| | `abcjs-strict` | `abc2.1` / `extended` |
|---|---|---|
| `[U:n=!accent!]` | reproduced: no field, seven warnings, the accent on an invisible bar | the macro is defined and `n` is an accent |

A **header** `U:` works in both — abcjs supports that one.

⚖️ **Owner's ruling, 2026-08-27: the FEATURE stays.** The split is how it stays: strict
exists to be byte-equal to abcjs, and every other mode is where ABC 2.1 is read correctly —
the same shape as the melisma, the three-quarter tone and `%%vocalfont` above.

*Verified: `abcjs.parseOnly` on the shape above, element by element and warning by warning,
against `tests/corpus-abcjs/fixtures/abcts-text-udef-parts-overlays.abc` tunes 44-45, which
are byte-exact in strict. The set of eight is confirmed against both corpora, which between
them write `[V:` 201 times, `[K:` 78, `[Q:` 24, `[M:` 14, `[I:` 4, `[L:` 3, `[P:` 2 and
`[r:` once — this set exactly and nothing else.*

### An unknown clef name prints a red `clef=x` into the page

`parseKey`'s clef arm warns `Expected clef name. Found x`, BREAKS out of its inner switch,
and then falls straight through to `multilineVars.clef = {type: clef.token, …}` with
`foundClef = true` (`abc_parse_key_voice.js:500-517`) — so **the literal name becomes the
clef's type**. `createClef` has no case for it and its `default:` arm adds

    abselem.addFixed(new RelativeElement("clef=" + elem.type, 0, 0, undefined, {type: "debug"}))

(`create-clef.js:29`), never assigning `clef`, so no glyph is added. The page gets

    <text stroke="#ff0000" text-decoration="underline" …><tspan>clef=x</tspan></text>

and, because a `debug` child declares `chordHeightAbove = this.height` with `height`
defaulting to 4 (`relative-element.js:38,55-57`), the element also takes a **4-pitch CHORD
LANE** on a tune that has no chord symbol — 19.4px of page.

**We draw no clef, no marker, and take no lane** — the same ruling the note longer than a
breve already has below, for the same `type: "debug"` mechanism.

⚠️ **THE LANE IS NOT A FIXED PITCH.** Probed with `ZZAE` it reads 15 on a bare
`K:C clef=x`, **18.724387096774194** on a mid-tune change and **17** on that tune's reprint
in the next system's prefix — each the running top plus five. An earlier revision of this
entry called it a constant 15 and reproduced it as a point; three shapes had agreed on 15
because all three had a running top of 10. **Three agreeing measurements of a derived value
look exactly like a constant.**

⚠️ **AND ONLY AN EXPLICIT `clef=` REACHES THIS.** The outer switch's cases are `clef` and
the six clef KEYWORDS; a bare unknown word hits `default: warn("Unknown parameter")` and
never touches the clef. `K:Cbmin clef=x` is the shape; `K:C x` is not. The six single-letter
ALIASES are recognised and warn nothing: `C`/`c`, `F`/`f`, `G`/`g` each have their own case.

**What we DO reproduce**: the clef is not drawn (ours used to fall back to the tune's and
draw a TREBLE abcjs never draws), the notes keep their treble positions, and the
`Expected clef name. Found x` warning is raised at the clef token's own column.

*Verified: `dump-svg.js` at abcjs 6.7.0 on `K:C clef=x`, `clef=zzz`, `clef=q2`,
`V:1 clef=x` and a mid-tune `[K:C clef=x]`, with `ZZAE` for the element's box on all three
positions and a control at `K:C` for the 13.724387096774194 a treble clef reserves instead.
Fixture `tests/corpus-abcjs/fixtures/abcts-unknown-clef.abc`, all five slugs in
`svg-bytes`'s `DIVERGENT`.*

### `%%beginps` with a non-empty body never returns — INFINITE LOOP

`beginps`'s reader advances the tokenizer but never reassigns the variable it tests:

    case "beginps":
        line = tokenizer.nextLine();
        while (line && line.indexOf('%%endps') !== 0) {
            tokenizer.nextLine();          // <- the result is DISCARDED
        }

(`abc_parse_directive.js:969-975`.) `line` keeps the value it was given before the loop, so
unless the very first line after `%%beginps` IS `%%endps` the condition is true forever.
The `begintext` arm ten lines above is the same shape and ends its body with
`line = tokenizer.nextLine();` — the omission is one assignment.

**Measured**, both directions:

| input | abcjs |
|---|---|
| `%%beginps` then `%%endps` | renders normally |
| `%%beginps` then any other line | **never returns** |

abcts parses the block, warns `Unknown directive: beginps`, and returns in 5ms.

**We decline to reproduce a hang.** There is no output to be byte-equal to, and a host
handing user-supplied ABC to a parser that can be made to spin forever has a denial of
service rather than a rendering difference.

*Verified: `dump-svg.js` on both shapes at abcjs 6.7.0 — the empty block writes its SVG, the
non-empty one is still running when the harness is killed. Source read afterwards, and the
two arms compared side by side.*

### `%%staffnonote 0` over a tune of pure rests crashes `extractMeasures`

`cleanUp` nulls every staff none of whose voices holds a real note and then filters the
nulls out (`tune-builder.js:70-93`), so a tune whose every voice is rests ends with
`line.staff === []` — an EMPTY ARRAY, which is truthy. `extractMeasures` then does

    if (line.staff) {
        for (var k = 0; k < 1 /*line.staff.length*/; k++) {
            var staff = line.staff[k];
            for (var kk = 0; kk < 1 /*staff.voices.length*/; kk++) {

(`api/abc_tunebook.js:212-218`) — the bound is a hard-coded `1` with the real length
commented out — and reads `undefined.voices`:
`TypeError: Cannot read properties of undefined (reading 'voices')`.

abcts returns the measures. **Reproducing a crash is not parity**, and the SVG for the same
tunes is byte-exact in both engines, so only this surface diverges. The slug is named in
`tests/extract-measures.test.ts`'s `DIVERGENT` list, which carries the same
entry-here-or-it-is-a-tolerance contract as `svg-bytes`'s.

*Verified: `ABCJS.extractMeasures` on
`tests/corpus-abcjs/fixtures/abcts-staffnonote-empty-staves.abc` at abcjs 6.7.0, stack
captured; each tune renders through `dump-svg.js` individually without complaint, which is
what says the crash belongs to this API and not to the parse.*

### `!staccato!` is dropped, while `.` works

abcjs accepts a `!name!` decoration only if the name appears in one of its five decoration
tables. `staccato` is in none of them — its `.` shorthand is hard-coded separately — so
the long form silently draws nothing.

### An unclosed `+decoration+` eats six characters

abcjs's `getBrackettedSubstring` gives up after five error characters "so that a missing
end quote won't eat up the entire line", consuming the `+` and five more rather than
treating the `+` as a literal.

*From reading `abc_parse_music.js`; the six-character span is confirmed in output.*

### A spaced lyric hyphen consumes a note

`A - ve` — hyphen with spaces around it — is read by abcjs as syllable `A` with the hyphen
attached, then a **skipped note**, then `ve`. The bare hyphen is not a syllable of its own,
so the syllables after it land one note late.

*Verified against the `ave-verum-corpus` goldens, which carry lyrics on every fixture.*

### `s:` symbol lines are read as LYRICS

ABC 2.1 §8.2 defines `s:` as a line of decorations aligned under its music line, sharing
`w:`'s token grammar — space advances a note, `*` skips one, `|` skips to the next bar.

abcjs reads the line with its `w:` parser and pushes the tokens straight onto `el.lyric`,
so the symbols are printed as sung text: a note carrying `s: !trill!` gets the literal
string `!trill!` under the staff, delimiters and all. If a real `w:` line is already
there, the symbols become its second verse.

The other modes align the same tokens onto the notes as decorations, stripping the
delimiters so they join the namespace `U:` and the inline `!trill!` form already share.

*Verified: read from abcjs's source, not measured — no corpus fixture carries an `s:`
line. Its own comment at `parse/abc_parse.js:325` states the behaviour outright: "Currently
copied from w: line. This needs to be read as symbols instead."*

### Microtonal source ranges are inconsistent with themselves

abcjs's character span for `^3/2G` starts at the `G`, excluding the accidental — while its
span for a plain `^G` starts at the `^` and includes it. An editor mapping a caret to a
note therefore finds nothing inside `^3/2`.

---

## Rendering

### Three-quarter-tone accidentals draw nothing

abcjs knows the quarter-tone pair (`^/` and `_/`) and nothing wider. `^3/2G` yields
accidental `"-"` and no glyph — the note is drawn with **no accidental at all**, silently
changing the pitch a reader sees.

*Verified: element dump of `^3/2G _3/2A`.*

### A note longer than a breve draws a red debug string

`chartable.note[-durlog]` has one entry past the breve and no more, so a duration of four
whole notes or greater reaches `createNoteHead` with an undefined glyph. abcjs answers that
with a DEBUG element that ships in the released build:

    if (c === undefined)
      abselem.addFixed(new RelativeElement("pitch is undefined", 0, 0, 0, { type: "debug" }));

It draws as `<text stroke="#ff0000" text-decoration="underline">pitch is undefined</text>`
at the note's own x, and — because `RelativeElement`'s `debug` arm sets `chordHeightAbove`
to its default `height` of 4 — it reserves a CHORD LANE, 19.18px of page, on a tune with no
chord symbol anywhere in it.

abcts reproduces everything else about the element: no notehead, no stem, and the ledger
lines at `getSymbolWidth(undefined)`, which makes the rule the bare 4px overhang (47.05 to
51.05 in both engines). It does not draw the marker, and it does not reserve the lane the
marker takes.

**The short end reaches the same marker.** `note` runs out again past key 7, so a 256th
(`C/32` under `L:1/8`) is headless too — and there abcjs keeps the STEM, because
`hasStem = !nostem && durlog <= -1` is still true. abcts draws neither the marker nor that
stem; the head, the flag table's own limit (`uflags` stops at the 64th, so a 128th has a
head and a stem and no flag) and the ledgers are all reproduced.

*Verified: `C32 D32|` and `C/32 D/32|` under `L:1/8` through abcjs 6.7.0 at
`{staffwidth: 670}`, with `C16` — a breve — and `C/16` — a 128th — exact in both engines on
either side of the two limits. Instrumented at `incTop`, which prints `chordHeightAbove 4`.*

### A grace note on an invisible rest is drawn at `NaN`

`{g}x2` puts abcjs's grace FLAG at `M NaN 66.87` — a literal `NaN` in the path's first
coordinate, so the glyph is not drawn at all by any renderer that parses the `d`. The
grace's head and stem are placed normally; only the flag's x is lost. An ordinary rest
(`{g}z2`) is fine, and so is a note.

abcts draws the flag at the x the head and stem imply. **This is the one difference in
this file that strict mode does NOT reproduce**, because reproducing it means emitting a
`NaN` into a path — output that is invalid rather than merely different.

*Verified: `{g}x2 C2|` through abcjs 6.7.0 at `{staffwidth: 670}`, and the same shape with
a visible rest for contrast.*

### `%%vocalfont` is parsed and never used

abcjs stamps the resolved font onto `el.fonts` at parse time and reads `.fonts` nowhere in
its write phase. Every lyric renders in the default font however many times the directive
is set.

*Verified: `el.fonts` is populated in the parse tree; no drawn text varies.*

### A chord takes its notehead shape from the first note only

`[C4G]` is a whole note and a quarter note written together. abcjs draws **two whole-note
heads**; `[CG4]` draws two quarter-note heads. The first note's duration decides the shape
for every head in the chord.

*Verified: probed directly against 6.6.3 — `[C4G]` gives `noteheads.whole` twice.*

### A melisma prints its underscore

`_` in a `w:` line means "hold the previous syllable across this note", and engraving draws
an extension line. abcjs prints the literal `_` character instead.

### Mid-tune `Q:` is not mid-tune

A `Q:` anywhere in a tune sets `tune.metaText.tempo`, which is tune-level, and abcjs draws
the mark at the head of the first system — **ahead of music that precedes the field in the
source**. A tempo change partway through a tune cannot be expressed.

### `%%systemsep` and `%%linesep` are parsed and never read

Both are stored in `multilineVars` by the directive parser and consulted nowhere.

*From reading `abc_parse_directive.js`, corroborated by abcMusicKit v1, which reproduces
abcjs byte-for-byte and records the same finding.*

### A declared edge of zero is read as no edge at all

`relative-element.js:40-43` is `if (opt.top) this.top = opt.top` and the same for `bottom`,
and **`0` is falsy**, so an element that declares an edge AT the reference pitch keeps the
constructor's default instead. `K:C clef=alto2` declares `bottom` 0, abcjs keeps `clefPos`
4, and the staff reserves two pitch it does not need. Non-strict honours the declaration.

*Verified: page height 94.77161 in strict against 102.77161 corrected, and it is the one
corpus row `tests/corpus-abcjs/extended.sha256` moved when the fix landed. The same falsy-zero
appears at an unbeamed stem's `bottom: p1 - 1`; that site was gated, measured across the 691
corpus cases, sixteen single notes, a two-staff tune and a lyric row, moved NOTHING, and was
reverted — see `Docs/ABCJS-DEBT.md` §3b.3.*

### A held syllable reserves four pitch instead of a line of its font

`this.height = opt.height ? opt.height : 4` (`relative-element.js:36`) is the same falsy-zero
one line up, but the zero here is **measured rather than declared**, so the correction is
different. The `&nbsp;` that a `_` carries onto the next note has `lyricStr === "\n"` — pure
whitespace — which `getTextSize` early-outs to zero for (`svg.js:311-312`), so the element
takes abcjs's four-pitch constructor default. `lyricHeightBelow` maxes over children, so the
default BINDS under about 15.5px and the lane stops shrinking with the font. Non-strict
reserves the font's own line height, which is what an empty row actually occupies.

*Verified in a browser, which is the only place it can be: the whitespace early-out lives in
the live measurer, so a headless render never reaches the branch. `%%vocalfont Helvetica 8`
over `w:laa_ la` gives 117.84826 in strict and 124.27394 corrected, asserted by
`scripts/zzextended.mjs`. A SIZE LADDER named it, because the defect has a THRESHOLD and no
single fixture can show one: abcjs pins at 114.1655 for every size at or below 10pt in both
faces while the corrected lane keeps shrinking — `4 × 3.875 = 15.5`, where Helvetica 10
measures 15.015625 and Helvetica 11 measures 17.01.*

### A space stops ending a beam if anything intervenes

A space between notes normally breaks a beam. In abcjs it only does so when nothing has
come between the space and the note — and a character abcjs merely *warns* about counts as
something, despite contributing nothing to the music.

*Verified across all eight beam boundaries in `frere-jacques`'s prose.*

---

## What abcts adds beyond fixing these

`abc2.1` corrects the above, and every correction above is reached by opting out of strict:
styled noteheads, the phrase and tremolo marks, three-quarter-tone glyphs, per-segment lyric
fonts, and the two falsy-zero reserves.

⚠️ **`extended` DOES NOT YET GO FURTHER THAN `abc2.1`, and this paragraph used to say it
did.** Measured 2026-09-04: **every mode branch in `src/` is `isStrict(mode)`** — one
comparison, `core/model.ts:35`, and it is `mode === 'abcjs-strict'`. Not one site
distinguishes the two, so they are byte-identical on all 691 corpus cases and on each of the
features this paragraph named. The distinction is real in the TYPE and not yet in the CODE.

`tests/mode-partition.test.ts` asserts that as the state of affairs rather than as a goal, so
the first genuinely `extended`-only feature takes the gate red and gets an entry here on
purpose — instead of arriving as a silent digest move in the extended ratchet.

Output is also **under half the size**: **0.446x abcjs's bytes across the corpus**, by
emitting each glyph outline once into `<defs>` and placing it with `<use>`, while keeping
every `abcjs-*` class and `data-name` hook identical so existing stylesheets and click
handlers keep working.

*Measured 2026-09-04 over all 691 cases of `tests/corpus-abcjs/`: 4,949,600 bytes against
the goldens' 11,093,783, the goldens being abcjs's own output — `tests/svg-bytes.test.ts`
reproduces them byte for byte. **This paragraph said 0.33x**, which no longer held. Nineteen
of the 691 are not smaller at all and they are the header-only tunes that draw no staff:
136 bytes, and no repeated glyph to fold into a `<defs>`.*

---

## Fairness

abcjs is a large, long-lived and genuinely useful library, and abcts derives from it —
including, with attribution and under its MIT licence, its glyph outlines. Several items
above are unimplemented corners of a wide specification rather than mistakes, and the ABC
standard is large enough that no implementation covers all of it.

The list exists because a replacement has to be specific about what it changes, and
because reproducing these faithfully in strict mode is a feature rather than an oversight.

---

## Reference goldens

| Mode | Compared against |
|---|---|
| `abcjs-strict` | abcjs 6.6.3's own parse trees, element dumps and SVG output |
| `abc2.1`, `extended` | abcm2ps and abc2svg behaviour, via the golden sets in abcMusicKit (v1), abcMusicKit2 (v2) and abcMusicKitCpp — observed output only, never source |
