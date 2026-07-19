# Melisma (`_`) extension lines — why neither engine draws them

**Status:** read-only investigation, 2026-07-18. No files were modified in v1 or v2.
**Revision 3** — the geometry section originally recommended duration-proportional extender
lengths. That was wrong. It is now corrected against the primary source (Gould, *Behind
Bars* p. 447, in our own reference library) and cross-checked against measured
abcm2ps/abc2svg output, which agree with it. See "The geometry — CORRECTED".
**Audience:** the abcMusicKit (v1) and abcMusicKit2 (v2) agents.
**Every claim below cites `file:line` so it can be verified before acting on it.**

---

## Summary

The reported symptom is "the melisma line doesn't extend correctly." The actual finding is
stronger and simpler:

> **Neither v1 nor v2 draws a melisma extension line at all.** There is no geometry bug to
> fix, because there is no line. The two engines fail for *different* reasons and need
> *different* fixes.

| | v1 (`abcMusicKit`) | v2 (`abcMusicKit2`) |
|---|---|---|
| Does `_` survive parsing? | **Yes** — as `LyricSyllable.divider == "_"` | **No** — discarded, identical to `*` |
| What renders today | A **literal `_` glyph** appended to the syllable text | **Nothing** |
| Where it's lost | Never lost; the draw path just ignores it | `ABCParser.swift:1324` |
| Fix scope | Renderer only | Parser → Core → Engrave → Layout |

A useful cross-check that the *semantics* are already right in v1: its **MusicXML export
does honour the melisma**, emitting `<extend/>` — `abcToMusicXML.swift:780` and
`:1359-1361`. So v1's model is correct and only the SVG/CG draw path ignores it.

---

## v1 — the marker survives, the renderer ignores it

**Parse keeps it.** `abcParser.swift:913`:

```swift
let divider = (div == "_" || div == "-") ? div : " "
```

`_` and `*` even generate different skip entries — `abcParser.swift:938-954` — `to: "slur"`
vs `to: "next"`.

**But the distinction dies before drawing, in two places:**

1. `abcParser.swift:1001-1006` treats `"slur"` and `"next"` identically, and both emit
   `LyricSyllable(syllable: "", divider: " ")` on the held note (`:1015`). At engrave time a
   held note is indistinguishable from a `*`-skipped one.
2. The surviving marker — the *preceding* syllable's `divider == "_"` — is consumed only as
   literal text. `AbstractEngraver.swift:1486`:

```swift
let div = (ly.divider == " " || isHyphen) ? "" : ly.divider
```

`_` falls through, and `:1489` concatenates it into the drawn string:
`let text = prefix + ly.syllable + div`. **That is why you see a literal underscore
printed after the syllable.** It is inherited verbatim from abcjs
(`abcjs-6.6.3/src/write/creation/abstract-engraver.js:772-773`), so it is abcjs-faithful
behaviour, not a v1 defect — which matters for `.abcjsStrict` mode (see "Mode policy").

Note `CompatibilityMode.swift:14` already *claims* extended mode "enables features like
melisma `_` extender lines that abcjs doesn't render". Nothing implements it. That comment
is aspirational and currently false.

### What v1 needs

The **hyphen** implementation is the right shape to copy — `SVGDraw.swift:2126-2158`,
per-verse pending state walking `voice.children` in x order:

```swift
if let prev = pendingHyphen[v] {
    drawHyphenDash(at: (prev.xRight + (rel.x - halfW)) / 2, y: prev.y)
    pendingHyphen[v] = nil
}
if rel.lyricHyphen { pendingHyphen[v] = (xRight: rel.x + halfW, y: baseY) }
```

Three changes:

1. Propagate `divider == "_"` onto the `RelativeElement` exactly as `lyricHyphen` is set —
   `AbstractEngraver.swift:1484` and `:1525`; field declared at `RelativeElement.swift:136-141`.
2. Stop concatenating `_` into the text at `AbstractEngraver.swift:1486` **in extended
   modes only** — see below.
3. Add the run walk and stroke the line. The held notes are already walkable: they produce
   `.lyric` relatives with `c == ""`, present in `voice.children`.

---

## v2 — the marker is destroyed at parse

`ABCParser.swift:1324`:

```swift
if token == "*" || token == "_" { out.append((nil, nil)); continue }   // blank / melisma
```

`*` and `_` produce byte-identical output. It is then lost a second time in
`applyLyrics()` — `ABCParser.swift:1591`:

```swift
for (i, syl) in line.syllables.enumerated() where syl.text != nil {
```

nil-text entries are filtered out, so the held note has no dictionary entry and ends up with
`lyric = nil` at `:1601` — indistinguishable from a note that never had a `w:` line at all.
**No downstream stage can know a melisma occurred.**

There is no field anywhere in Core, Engrave, or Layout capable of expressing "this note
continues the previous syllable." `Note.lyric` is a bare `String?` (`Events.swift:77,84`);
`AttachmentContent.lyric(String, verse: Int)` (`EngravingModel.swift:68`) carries only text
and a verse index. `Engraver.swift:1381` additionally drops empty syllables outright:

```swift
guard let l = syllable, !l.isEmpty else { continue }
```

⚠️ **`Docs/Audits/RENDERING-PARITY-AUDIT.md:307` claims "Lyrics — lyric extender `_` ✅ ✅ ✅".
That row is wrong and should be corrected.** `CHANGELOG.md:2841` is the accurate one — it
lists melisma extender lines as *Deferred*.

### What v2 needs

Full chain, in order:

1. `ABCParser.swift:1324` — distinguish `_` from `*`.
2. `ABCParser.swift:1591` — stop filtering nil-text syllables, or carry the melisma flag past
   the filter.
3. `Events.swift` — a flag on `Note`/`Chord` ("continues previous syllable").
4. `EngravingModel.swift:68` — extend `.lyric` to carry it.
5. `Engraver.swift:1381` — the empty-syllable guard must not swallow held notes.
6. `BasicLayouter.swift` §8.6 (starts `:1281`) — emit the line.

---

## The geometry — CORRECTED

> **An earlier revision of this document said the extender's end-x should be derived from
> the held notes' duration-proportional allotment, so that a whole note gets a longer line
> than a half note. That was wrong.** It was reasoning from the engines' layout code rather
> than from the engraving convention or from observed reference output. Both were then
> checked. This section replaces it.

### The primary source — Gould, *Behind Bars*, p. 447 "Extenders"

Available locally at `abcMusicKit/Docs/References/Behind Bars/`. Quoted verbatim (the PDF is
an OCR'd scan; typography has been tidied, wording has not):

> "An extender, a line of stave-line thickness, follows a final syllable or mono-syllabic
> word that extends beyond one written note, including a tied note. **The line extends to
> the last written note, but not to the end of the duration.** Any punctuation goes at the
> end of the word, before the extender."

The facing example in the book is captioned **"extenders too long"** — the over-extended
form is shown explicitly as the mistake to avoid. That sentence is the direct answer to the
question this document was opened for.

The full rule set from that page, all actionable:

1. **When.** An extender follows a **final syllable or mono-syllabic word** that extends
   beyond one written note, **including a tied note**.
2. **Where it ends.** At the **last written note** — *not* the end of that note's duration.
3. **When NOT to draw one at all.** "No extender is needed where a syllable occupies the
   length of its written duration nor where a single syllable is sung to one note alone."
   So a lone whole note carrying one syllable gets **no extender**.
4. **Never between syllables of a word.** "Never use an extender between syllables — an
   extender indicates that a word has ended and its incorrect use will cause confusion."
   Mid-word continuation is a hyphen, never an extender.
5. **Vertical placement.** "Place the extender on a level with the base of the text; it
   should not be centred like a hyphen." Conversely a hyphen sits "midway between the base
   and top of a lower-case letter, and not at the base of the text, where it will be
   mistaken for an extender." The two are deliberately distinguished by height.
6. **Punctuation** goes at the end of the word, *before* the extender — `come,_` not `come_,`.
7. **System ends.** On a key or time change at the end of a system, the extender **stops
   with the barline**. If an extender starts at the very end of a system, allow extra space
   before the barline so the extender's start fits after the word.
8. **System starts.** At the beginning of a system the extender "starts just before the
   first note, together with the slur or tie."
9. **Rests inside the span.** Short rests: continue the extender **uninterrupted** beneath
   them to the last written duration of the syllable. Longer rests: discontinue it and
   **reiterate the word in brackets** — `(dance)—` — the brackets signalling the text is not
   sung afresh.

Rule 3 is worth pausing on, because it reframes the original question: a syllable held over
a *single* note gets no line at all, whatever that note's duration. So "the line should be
longer under a whole note" has no case to apply to — either the syllable spans further notes
(and the line ends at the last of them), or it doesn't (and there is no line).

### What the reference engines actually do

Verified by running the binaries and reading only their SVG output (no source consulted —
both are GPL; see "Clean-room note"). Test: `Glo` on note 1, held on note 2, varying note 2.

| held note | abc2svg extender length | abcm2ps extender length |
|---|---|---|
| whole note (`C4 \| D4 \|`) | 28.6 | 35.60 |
| quarter + rests (`C4 \| D z3 \|`) | **32.6** | **60.60** |

**The shorter note produced the LONGER line in both engines** — the reverse of
duration-proportional, and consistent with Gould's rule 2. The reason is that the extender's start is fixed (just past the
syllable's right text edge) and its end tracks *where the held notehead sits*. In the
second test the held `D` is pushed rightward by the rests sharing its measure, so the line
grows. Duration enters only indirectly, through layout.

Sweeping duration alone confirms it. Holding layout otherwise constant, abc2svg gives 28.6
(whole) / 27.6 (half) / 27.3 (quarter) — a 4× duration change moves the line under 5%, and
that residue tracks *notehead glyph width*, not duration. abcm2ps gives byte-identical
output across the same three.

### The rule to implement

```
start x = right text edge of the held syllable  + left padding
end x   = right edge of the LAST WRITTEN NOTE's notehead  + right padding
```

Not the note's duration allotment, and not the next syllable's x. Normalising the measured
output against each engine's own noteheads shows both already do exactly this — the end
lands just past the held notehead (abcm2ps +5.0 whole / +3.0 quarter; abc2svg +11.2 / +6.8),
the variation being notehead *glyph* width, since a whole notehead is wider than a quarter.
The two engines agree on the rule and differ only in padding constant. Both engines already have
the notehead x and glyph width at the draw site, which is all this needs — v1 in
`drawVoice`'s walk of `voice.children` (`SVGDraw.swift:2140`), v2 from the resolved `noteX`
columns before `BasicLayouter.swift` §8.6.

Also worth adopting, and independent of the line itself: **left-align a melisma syllable**
instead of centring it. v1 centres unconditionally (`AbstractEngraver.swift:1515-1527`,
`dx: 0` + `addCentered`, drawn `anchor: "middle"`); v2 likewise
(`BasicLayouter.swift:1292`, `align: .middle`).

Break and resume the line across a system break, as both already do for hyphens (v1
`SVGDraw.swift:2155-2158`, v2 `:1325` fallback).

### If duration-proportional is wanted anyway

It is a legitimate product choice, but it should be a deliberate, documented deviation
rather than presented as a correctness fix — and ideally a setting, since it will diverge
from both reference engines and from every parity comparison against them. The allotment is
available: v1 `LayoutInGrid.swift:69-84` (`child.duration * durationUnit`), v2
`BasicLayouter.swift:238-240` (square-root spacing curve).

### Test cases

Whole vs half is the discriminating case — the first two must produce visibly different
line lengths:

```abc
X:1
L:1/4
K:C
C4 | D4 |
w: Glo _ _

X:2
L:1/4
K:C
C2 D2 | E2 F2 |
w: Glo _ _

X:3
L:1/8
K:C
G2 c3/2 B/ c2 e2 |
w: A-_ma-zing_ * grace
```

Tune 3 is ABC 2.1 §5.1's own example. It also checks that an **attached** `_` (inside
`A-_ma-zing_`, not standalone) is handled — see the parser note below.

---

## Mode policy for v1

Per `CLAUDE.md`, `.abcjsStrict` must stay byte-identical to abcjs, and abcjs prints the
literal `_`. So:

- **`.abcjsStrict`** — keep the current behaviour exactly (`AbstractEngraver.swift:1415`
  already mirrors abcjs). Do not draw a line.
- **`.abc2_1` / `.extended`** — suppress the literal `_` glyph and draw the line. This is
  what `CompatibilityMode.swift:14` already promises.

v2 is single-mode, so no gating needed there.

---

## A parser bug both engines share

While checking this against ABC 2.1 §5.1, we found a tokenizer bug that **both v1 and v2
have**, independent of rendering.

The spec's example is `w: A-_ma-zing_ * grace`. Both engines split a `w:` token on `-` and
handle `_` only as a **standalone** token. An *attached* `_` therefore stays inside the
syllable text:

```
A-   "_ma-"   "zing_"       ← wrong: literal underscores in the text, both holds lost
```

The correct reading treats `_` as a syllable terminator exactly like `-`:

```
"A-"  ·  hold  ·  "ma-"  ·  "zing"  ·  hold      ← 5 positions for the example's 5 notes
```

- v2: `parseLyricSyllables` — `ABCParser.swift:1309-1344`, splits only on `-` at `:1331`.
- v1: tokenizer at `abcParser.swift:938-954`, `case "_"` only fires for a standalone token.

abcts hit this too and has fixed it — `_` and `-` both terminate a syllable, and `_` then
emits a hold position. Worth fixing in both engines regardless of the rendering work, since
it corrupts the lyric text itself.

---

## For reference: what abcts now does

Parse-side only; abcts has no renderer yet.

- `Note.lyric` / `Chord.lyric` — the syllable, `null` if none.
- `Note.lyricMelisma: boolean` — **`_` is distinct from `*`.** `*` gives
  `lyric: null, lyricMelisma: false`; `_` gives `lyric: null, lyricMelisma: true`.
- `_` is a syllable separator, so attached and standalone forms behave alike.

This is a deliberate divergence from v2, which conflates the two. Recorded in
`src/core/model.ts`, with the duration-proportional requirement written into the
`lyricMelisma` doc comment so it isn't lost before the renderer exists.

---

## Clean-room note

abcm2ps and abc2svg are **GPL**. Nothing in this document derives from their source, which
was never opened. The reference-engine table above comes from **running the installed
binaries and reading their SVG output** — black-box behavioural observation, which is the
permitted mode under the project's clean-room policy. Behavioural descriptions of what the
output looks like are usable; their implementations are not.

The test inputs are reproduced in full above so the measurements can be re-taken
independently:

```bash
printf 'X:1\nL:1/4\nM:4/4\nK:C\nC4 | D4 |\nw: Glo _\n' > f1.abc
printf 'X:1\nL:1/4\nM:4/4\nK:C\nC4 | D z3 |\nw: Glo _\n' > f2.abc
abc2svg f1.abc > f1.svg ;  abcm2ps -g f1.abc -O f1m.svg
```

The extender is the last `<path class="stroke" …>` in the lyric group of each SVG.
