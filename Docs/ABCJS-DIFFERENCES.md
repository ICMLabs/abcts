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

*Verified: `C32 D32|` under `L:1/8` through abcjs 6.7.0 at `{staffwidth: 670}`, with
`C16` — a breve, the last duration that has a glyph — exact in both engines. Instrumented
at `incTop`, which prints `chordHeightAbove 4`.*

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

### A space stops ending a beam if anything intervenes

A space between notes normally breaks a beam. In abcjs it only does so when nothing has
come between the space and the note — and a character abcjs merely *warns* about counts as
something, despite contributing nothing to the music.

*Verified across all eight beam boundaries in `frere-jacques`'s prose.*

---

## What abcts adds beyond fixing these

`abc2.1` corrects the above. `extended` goes further, with features the other engines have
and abcjs does not — styled noteheads, staccatissimo, caesuras, tremolos, three-quarter-tone
glyphs, and per-segment lyric fonts.

Output is also **about a third the size**: 0.33x abcjs's bytes across the corpus, by
emitting each glyph outline once into `<defs>` and placing it with `<use>`, while keeping
every `abcjs-*` class and `data-name` hook identical so existing stylesheets and click
handlers keep working.

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
