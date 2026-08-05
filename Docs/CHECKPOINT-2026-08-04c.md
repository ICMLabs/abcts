# abcts — Checkpoint, 2026-08-04c

Supersedes `CHECKPOINT-2026-08-04b.md` for the STATE and the priority list; that document
keeps findings 41–50, and `CHECKPOINT-2026-08-04.md` keeps THE METHOD and the expensive
lesson. `CHECKPOINT-2026-08-03d.md` is the ledger for 16–40. This one carries **51–64**.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached.**

---

## STATE

| corpus | standing |
|---|---|
| 41-fixture | **24 of 29 at ZERO on all four axes.** One gate failure, unchanged: `ragtime-nightingale`'s `oy` at **0.656** against 0.59. NOT raised. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **138 / 149 / 161 / 172**, from 114 / 130 / 144 / 169 at the start of the day. **36 of 174 off some axis, from 60.** |
| suite | **691 of 692.** The one red is ragtime's `oy`. Anything else failing is yours. |

**Nothing above 17px is left on the ranked table**, and the only item above 12 is a
FEATURE (`%%setfont`'s rich text) rather than a defect.

The 41-fixture ceilings that moved on 2026-08-04 (all LOWERED, none raised):

| fixture | was | now |
|---|---|---|
| `vree-grace-notes` | dy 0.02 dx 1.99 oy 0.03 ox −1.14 | **ZERO on all four** |
| `little swallow` | dy 0.32 dx 24.19 oy 0.16 ox −6.29 | dy 0.21 dx 21.69 oy 0.06 ox −5.28 |
| `frere-jacques` | dx 22.64 | dx 21.81 |
| `ragtime-nightingale` | dx 18.30 | dx 16.43 |
| `happy-birthday` | dx 0.23 ox −0.49 | dx 0.12 ox 0.00 |
| `vree-sharps` | oy 0.06 | oy 0.00 |

---

## THE METHOD, AND IT PRODUCED ALL TWENTY-FOUR OF TODAY'S FINDINGS

**A LADDER OF CONTROL TUNES, THEN THE NAMED FUNCTION, THEN A PROBE.** Not one came off a
diff. Written out because it is the whole of the day's technique:

1. Take a fixture off `/tmp/abcts-corpus-ranked.txt`.
2. Write four or five tunes into `/tmp/abcts-probe/`, each one FEATURE longer than the last.
3. `for f in /tmp/abcts-probe/*.abc; do node dump-svg.js --file "$f" --output "${f%.abc}.svg"; done`
   from `../abcMusicKit/Tools/abcjs-debug`, then run `tests/controlled-pair.test.ts`
   **from `Code/abcts`** and read the STAFF TOPLINES.
4. The rung where the number appears names the INTERACTION, not the feature.
5. Open the abcjs function that owns it and read the branch.

Three times today the rung was an interaction invisible in either feature alone:

- `"D7"…|1…` needed five rungs to say **a chord AND an ending**, which is a BRANCH in
  `set-upper-and-lower-elements.js`.
- `"Ab"z"^break"c2` needed four to separate **a chord on a rest** from **an annotation's
  justification** — two unrelated bugs inside eighteen characters of ABC.
- `B"<2"{c}B` needed five to say **a left annotation AFTER grace notes**, where each alone
  was exact.

And once the ladder pointed at the WRONG LINE: `synth-flattener-28`'s number followed
`clef=perc` through every rung, and the cause was `stem=up` three lines above it.

**`tests/notehead-dx.test.ts`** prints every paired notehead when the toplines are not
enough — a dx that RESETS at each system is a prefix, one that grows inside a system is
spacing, a constant one is an offset.

---

## FINDINGS 51–64

### 51. A REST CARRIES ITS CHORD SYMBOL AND ANNOTATIONS
`addChord` runs over every abselem regardless of type (`abstract-engraver.js:853`), so
`"Eb7"z` prints the chord over the rest and reserves the whole chord lane — 22.4px. Our
`Rest` had decorations and nothing else, so the mark was **lost**.

### 52. AN ANNOTATION IS LEFT-JUSTIFIED AT ITS ELEMENT; A CHORD SYMBOL IS CENTRED ON IT
`getChordDim`'s `offset = this.type === "chord" ? this.realWidth / 2 : 0`
(`relative-element.js:96`), and the golden says it in one attribute — `text-anchor="start"`
against `"middle"`. Centring ours opened chord LANES abcjs does not: 18.51px.

### 53. AN ADDITIVE METER IS DRAWN TERM BY TERM
`M:2+3/8` is the string `2+3` over `8`, one glyph per character with the `+` between terms
(`create-time-signature.js:17-27`) — not the sum `5`. 17.08px of prefix.
**Its denominator loop is an abcjs bug reproduced by construction**: it iterates the
NUMERATOR's length while indexing the DENOMINATOR.

### 54. `%%barnumbers` — AND A BAR NUMBER IS GEOMETRY BEFORE IT IS TEXT
`addMeasureNumber` (`abstract-engraver.js:945-953`) puts it at pitch
`vert + height / STEP`, `vert` 11 on a barline, and adds it with `addFixed` — so it enters
the ink and beats the clef's 13.72. **10.5px on a plain treble tune.** Counting is three
conditions deep (`abc_parse_music.js:296-301`): only the FIRST voice advances, an empty
measure does not, an invisible barline is not a boundary, and the number stamped is the one
of the measure the barline OPENS.

### 55. LEADING WHITESPACE IS NOT PART OF A DIRECTIVE'S NAME
abcjs tokenizes the line and takes the first WORD, so `%% barnumbers 1` is the same
directive. A root-cause fix at the one place every `%%` line goes through.

### 56. A `K:` CLEF CHANGE ON ITS OWN LINE PRINTS TWICE
abcjs appends the clef to the voice stream still OPEN when the field is parsed, so a
`K:C clef=treble+8` between two music lines lands at the END of the first — after its
closing barline — and is reprinted at the head of the second. The golden shows two
`clefs.G` on line 1, at x 29.69 and x 675.64, with the barline between them at 649.95.
Suppressing our inline draw was half the rule and had been recorded as the whole of it.
**11.63px per system.**

### 57. EVERY FONT SITE READS ITS OWN `%%<type>font`
Four are geometry: `measurefont` (the bar number), `annotationfont` (which abcjs picks over
`gchordfont` for an annotation, `add-chord.js:11-17`), `partsfont` (the `P:` lane) and
`voicefont` (the left edge, plus the trailing "A" abcjs measures in the SAME font rather
than as a constant, `get-left-edge-of-staff.js:19-20`). `tripletfont`, `tempofont` and
`repeatfont` measured EXACT on their controls and are untouched.

**`voice-name-metrics.ts` is DELETED** — with `calcWidth` ported,
`textWidth(name, fontSizeOf('voicefont'), 'serifBold')` is the same number by construction.

### 58. A ROW ADVANCES BY WHICHEVER FIELD MOVES IT
`addTextIf` moves by `round(height * 1.1)` for the field it is called on, and the rhythm is
given `noMove: !!(composer || origin)` (`top-text.js:36-39`) — so when either is present
the rhythm draws and moves NOTHING and `composerfont` alone sets that row. Taking the max
of the two spent `%%infofont Monaco 11 box`'s 24px where abcjs spent `%%composerfont Arial
8 box`'s 19.

### 59. A BOXED FONT'S `padding * 4` IS IN EVERY MEASURED HEIGHT — AND IN THE WIDTH
`getTextSize.calc` adds it to both (`get-text-size.js:46-48`). The mid-tune subtitle
(`subtitle.js:8`) and the free-text block (`free-text.js:19`) move by their measured height:
20.4px of gap. And the WIDTH is a chord's `realWidth`, which decides how far a centred mark
reaches either side of its note and where `placeInLane` puts its right edge:
`visual-tablature-17` was 33.9px of dx out on that alone.

**THE BOX COMES FROM THE FLAG, NOT THE FONT, for a part label**: `%%partsbox` sets it
without touching the font and `%%partsfont … box` sets both, so the padding is added once
from `partsBox` and `goldenTextHeight` is asked for the bare height. Taking it from
`fontHeightOf` double-counted one and missed the other — 15.6px each way.

### 60. AN ARPEGGIO IS A STACK REACHING TWICE ITS OWN WIDTH BACK
One glyph per two pitches from a pitch BELOW the lowest note to the highest, at
`-getSymbolWidth("scripts.arpeggio") * 2 - roomtaken` with `w: 0`
(`decoration.js:279-297`), each declaring its own height about the pitch it sits on. We
drew ONE, half a width to the left, reserving nothing — 10.01px, plus `roomtaken` again on
a chord with an accidental.

### 61. A FINGERING DIGIT IS A TEXT DECORATION, NOT A GLYPH
abcjs's switch sends `"0"` through `"5"` to `textDecoration` beside `D.C.` and `D.S.`
(`decoration.js:200-210`), so a digit stacks by the flat `textHeight: 5` and reserves the
flat `thickness: 3`. Drawing SMuFL's `fingering1` reserved 3.76px too little.

### 62. ABCJS NEVER APPLIES A GLYPH'S SCALE AT DRAW TIME
`printSymbol` takes `{ scalex, scaley }` and passes **neither** to `glyphs.printSymbol`,
under its own comment: *"TODO-PER: what happened to scalex, and scaley? That might have
been a bug introduced in refactoring"* (`draw/print-symbol.js:11`). The golden settles it
in one line — **a grace notehead's path is BYTE-IDENTICAL to its main head's**, 10px to the
left. So a grace notehead, a grace flag and a clef's octave `8` all DRAW full size while
their POSITIONS are computed from the scaled width. 1.99px on every graced note, which is
0.4 of a notehead's ink centre, and `vree-grace-notes` went to ZERO on it.

### 63. A GRACE NOTE ADDS 10 TO `roomtaken`, AND EVERYTHING AFTER IT STARTS FROM THE TOTAL
`roomtaken += this.addGraceNotes(…, roomtaken)` (`abstract-engraver.js:834-836`), with
`+= 10` per grace and `+= 7` more for an accidental on one (`:481-487`). The arpeggio and a
LEFT annotation both read the total. **And `addGraceNotes` RETURNS the running total it was
handed, so the accidental room is counted TWICE** — an abcjs bug, reproduced.

### 64. AN INVERTED FERMATA HANGS UNDER THE NOTE, AND `stem=` IS `stems=`
abcjs's ornament switch passes the literal `'below'` for `invertedfermata` where every
other case passes `positioning` through (`decoration.js:261-264`); `yPos` is an object with
an `above` AND a `below` cursor that `incrementPlacement` walks in opposite directions
(`:127-145`). 6.52px.

And `V:… stem=up` is the same as `stems=up` — abcjs's switch takes both spellings
(`abc_parse_key_voice.js:717-718`) and our regex matched only the plural, which left
`synth-flattener-28`'s percussion voice stemming by pitch: 11.63px of staff.

---

## WHAT IS LEFT, ranked

```
16.92  dy= 0.0 dx=16.9 oy= -3.5 ox= 4.6  visual-misc-06        [%%setfont] — RICH TEXT
11.56  dy= 0.0 dx= 0.9 oy=-11.6 ox=-0.5  visual-transpose-05   chord lanes, 21 symbols
10.69  dy= 0.5 dx=10.7 oy=  6.8 ox= 0.8  synth-flattener-23    [%%percmap]
 9.60  dy= 0.0 dx= 0.0 oy= -9.6 ox=-0.0  visual-tablature-10   grace before a `y` spacer
 7.51  dy= 0.0 dx= 7.5 oy=  0.0 ox= 3.4  visual-misc-13
 7.21  dy= 0.0 dx= 7.2 oy= -0.0 ox=-4.3  mouse-click-01 / tablature-15
 7.16  dy= 0.0 dx= 1.2 oy=  7.2 ox= 0.5  synth-flattener-24    [%%percmap]
 6.67  dy= 4.0 dx= 6.7 oy=  1.0 ox= 2.0  visual-selection-01 / svg-per-line-01
 6.21  dy= 0.0 dx= 0.0 oy=  6.2 ox=-0.0  synth-flattener-17    [MIDI grace notes]
 5.74  dy= 0.0 dx= 0.0 oy=  5.7 ox=-0.0  synth-flattener-32    quarter tones
```

### NEXT, in order

1. **`%%setfont-N` and `$N` rich text** — the biggest single item and the only FEATURE left
   above 12px. `parseFontChangeLine` (`abc_parse_directive.js:727-748`) splits a header
   field on `$`, maps each `$N` to `multilineVars.setfont[N]`, and returns an ARRAY of
   `{font, text}` phrases; `richText` (`elements/rich-text.js`) lays them out side by side
   with `largestY` deciding the row height. `$$` is a literal `$`, protected through a
   `\x03` swap. It runs on `T: C: O: A: P: H: N: W:` and `%%text` / `%%center` — and NOT on
   chord symbols, which keep their `$` literally.
2. **`visual-transpose-05`** — 21 chord symbols on one line, `oy` −11.6 and its controls all
   exact one at a time. That is a LANE COUNT, so instrument `placeInLane` against
   `getChordDim`'s edges rather than reading the source again.
3. **`%%percmap`** — two `synth-flattener` fixtures that DRAW differently, not only sound so.
4. **`visual-tablature-10`** — the grace before a `y` spacer. Now that `Rest` carries a chord
   symbol the same argument applies to `graceNotes`; this is a model decision, not a patch.
5. **`mouse-click-01` / `tablature-15`** — 7.21 of dx, `%%sep` and `%%text` between systems.
6. Then Gonzato, then audio.

### STILL NEEDING A DECISION, NOT A COMMIT

- **The gate hides failures** — all eight per-fixture assertions live in one `it`, so the
  first to fail ends it.
- **`frere-jacques`'s `M:` arrives after prose**, so `score.meter` is NULL and measure 1
  carries a 4/4 change. The honest fix is a line for the prose.
- **The overlay pad's second rule**, and **the leading-header split**
  (`parse-book_parser-04-wed`, the one remaining TUNE COUNT mismatch).

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 691/692; the ONLY expected failure is ragtime's oy
npx biome check src tests/corpus-abcjs.test.ts tests/pixel-parity.test.ts
npm run baseline                      # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short  # MUST be empty — read it, do not test the exit code
```

**`tests/fuzz.test.ts` HAS A TIMING ASSERTION and flakes under full-suite load** — it
reports `SLOW edge#19: … for 50008 chars`. Re-run it alone before believing it.

**AND WATCH FOR A DELETED BLOCK.** A scripted edit replaced a region of `noteText` that
reached further than intended and took the whole LYRIC block with it; four harvested
fixtures jumped 40–68px. `git diff | grep '^-'` before committing a scripted rewrite.

**A COMMIT MESSAGE PASSED TO `git commit -m` IS SHELL INPUT** — a backtick-quoted
`V:… stem=up` was expanded away and the paragraph came out empty. Use `-F` with a heredoc
for anything carrying backticks.
