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

**The root element is byte-identical on all 171 fixtures, and the coordinate system is now
abcjs's** — absolute pixels, no `viewBox`, no `transform` anywhere, one bare `<g>` per line.
The whole suite is green across that change (1127/1127), which is the proof it is right:
every pixel gate measures pixels, and they see the same pixels they saw before.

What is left, in the order the byte table hits it. **Best case 651 bytes in, median 162**,
from 10 when the table opened:

1. **THE TITLE IS CENTRED ON THE WRONG WIDTH — a real defect.** abcjs puts it at the
   PAPER's centre, x=350 on a 700px page, and the rule is already written down in the model:
   "`%%center` centres on the STAFF width — 335, not the paper's 350 the title uses". We
   emit x=123.08 for a short titled tune, which is neither — the block is centred on the
   system's own width. **No pixel gate compares text POSITION**, because those pair
   noteheads, so this has been wrong on every titled tune.

   (Its sibling, `font-weight="bold"` on the title, is FIXED: abcjs's default `titlefont`
   is Times New Roman 20 weight `normal` and we drew every title bold. Invisible to every
   gate — the pixel tables compare positions and `calcWidth`'s tables are keyed by font
   SIZE alone, so a bold title and a normal one measure the same and land in the same
   place. Fourth axis to turn out unrepresented, after the line weights, the decoration x
   and the DOM contract.)
2. **The two-decimal rounding is not universal.** abcjs rounds path coordinates
   (`roundNumber`) and writes the root's `width`/`height` raw; a `<text>`'s `x`/`y` and a
   `<tspan>`'s follow their own rule, which is unmeasured.
3. **`height="292.14200000000005"` against abcjs's `292.142`** — floating-point noise from
   our multiply. NOT a formatting rule: abcjs writes `1081.3299999999997` on another
   fixture, so matching means matching the arithmetic ORDER, which is the emission-quantum
   problem the geometry arc already knows by name.
4. **Curves, beams and glyph paths** — a tie is `<path class="abcjs-tie" d="M60.83225,…">`
   here and a differently-formatted `d` there; a beam is still a `<polygon>`.
5. **Per-glyph `data-name`** — `clefs.G`, `accidentals.flat`, `dots.dot`, `rests.half`, a
   bare digit for a time-signature figure, and the WRITTEN NOTE NAME (`C`, `c`, `C,`) on a
   notehead. Tracked separately by `tests/dom-contract.test.ts`.

### Closed on the way here

Absolute pixels and no `viewBox`; no `transform` anywhere; the root element attribute for
attribute including the title in `aria-label` and `<title>`; the page being the staff width
plus abcjs's 15px margins; **staff lines TOP-DOWN**; every rule a CLOSED PATH with abcjs's
attribute order and an explicit close tag; abcjs's two-decimal path rounding; the top text
first and outside the line group; the staff-lines group and abcjs's element-group
attributes; and abcjs's nine-attribute `<text>` with its `<tspan>`.

**A CORRECTION WORTH KEEPING.** A "~31px vertical origin difference, a real defect no pixel
gate could see" was recorded here and was wrong: the heights matched to the byte and our top
line was already at 36.642. abcjs writes its staff lines top-down and we wrote them
bottom-up, so comparing the FIRST path of each engine compared different lines. Reading two
different rules and calling the difference an origin is exactly the mistake this file exists
to prevent — measure the output, and be sure it is the same thing being measured.

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
