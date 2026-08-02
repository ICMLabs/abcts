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
