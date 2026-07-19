# Melisma (`_`) extension lines — why neither engine draws them

**Status:** read-only investigation, 2026-07-18. No files were modified in v1 or v2.
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

## The geometry — and the specific thing to get right

This is the part the original report was about: the line must be **longer under a whole note
than under a half note**.

**Do not derive the end-x from the next *syllable's* x.** That is what v1's hyphen does —
`SVGDraw.swift:2126-2158` — and what v2's hyphen does — `BasicLayouter.swift:1325`:

```swift
let hx = (i + 1 < syllables.count) ? (s.x + syllables[i + 1].x) / 2 : s.x + s.w / 2 + s.h * 0.25
```

In v2 that array contains **only notes that got a syllable** (`:1307`), so held notes aren't
in it. Copying this pattern for a melisma would appear to work — the next entry is past the
held notes — but only by accident, and it gives you no control over where the line stops.

**Derive the end-x from the horizontal extent the held notes actually OCCUPY.** Both engines
allot horizontal space by duration, so this is where "whole note ⇒ longer line" comes from:

- **v1** — `LayoutInGrid.swift:69-84`, allotment is literally `child.duration * durationUnit`:
  ```swift
  child.x = x + (child.duration * durationUnit) / 2 - child.w / 2
  x += child.duration * durationUnit
  ```
- **v2** — `BasicLayouter.swift:238-240`, square-root-proportional (standard engraving):
  ```swift
  Swift.max(minColumnGap, spacingScale * (Swift.max(d.doubleValue / reference.doubleValue, 0.0)).squareRoot())
  ```

So the rule is:

```
start x = right text edge of the syllable being held  + small gap
end x   = right edge of the allotted extent of the LAST held note  - small gap
          (equivalently: the next column's x, minus the inter-column gap)
```

Both quantities are already available at the draw site in both engines. In v1, `drawVoice`
iterates `voice.children` (`SVGDraw.swift:2140`) and each `AbsoluteElement` carries `.duration`,
`.w`, `.extraW` and its final `.x`. In v2 the per-column `noteX` positions are resolved before
§8.6 runs. **Neither engine currently consults any of it for lyrics** — that is the whole gap.

Break the line at a system break and resume it on the next staff, as both already do for
hyphens (v1 `SVGDraw.swift:2155-2158`, v2 `:1325` fallback branch).

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
