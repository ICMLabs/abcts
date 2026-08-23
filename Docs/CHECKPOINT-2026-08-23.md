# CHECKPOINT — 2026-08-23

**Branch `main`. Suite 2,086 passing, 3 EXPECTED-FAIL, no reds. Everything pushed.**

Two landings. **§3e of the previous handoff is CLOSED — the warnings gate reads 0 of 487**,
and every gate in this repo except the one byte row now reads zero. Then **§3g, the one
untried sweep, was run**, and it produced a work list plus one feature-sized defect whose
parse half is landed and whose layout half is measured to the digit.

---

## 1. §3e — THE WARNINGS GATE IS AT ZERO

`abcts-key-modifiers-tune9` is `K:C clef=alto =f`. The `=f` stands AFTER a modifier, so it
is past `getKeyAccidentals2` — **accidentals are a PREFIX** — and abcjs's modifier switch
reaches its `default` arm TWICE, on two ADJACENT characters:

    Music Line:4:13: Unknown parameter: =:  C clef=alto <span>=</span>f
    Music Line:4:14: Unknown parameter: f:  C clef=alto =<span>f</span>

**AND THE COLUMN IS THE WHOLE OF IT.** The mapping derived it as `text.indexOf(token)`,
which finds the `=` inside `clef=` for the first and cannot separate the two at all.
`default: warn("Unknown parameter: " + tokens[0].token, str, tokens[0].start)`
(`abc_parse_key_voice.js:518-519`) — `tokens[0].start` is an offset abcjs has in hand and a
reader cannot recover from the token's TEXT, so `Diagnostic.column` carries it.

And the parser site is abcjs's own consumption now rather than a first-token heuristic:
`unknownKeyParameters` ports `tokenize`, the key head, the two deprecated words,
`getKeyAccidentals2` and the modifier loop, and reports what the `default` arm reaches. It
is **DIAGNOSTIC-ONLY** — the key, the clef and the style are still read by their own
functions, and nothing it computes is applied.

Three transcription details that are not guessable from the shape:

- ⚠️ **`tokenize`'s `i` IS DELIBERATELY STALE ACROSS ITERATIONS.** abcjs tests `line[i + 1]`
  for the digit after a `.` or a `-` while `i` still holds the END of the PREVIOUS token,
  and that is what makes `K:treble-8` one clef: at the `-`, `i` is the `treble` run's end,
  `line[i+1]` is the `8`, and the number branch takes `-8` whole. Written the obvious way —
  `line[start + 1]` — the `-` is punctuation and the clef loses its octave.
- ⚠️ **THE KEY HEAD'S TRUNCATION LEAVES `start` WHERE IT WAS.** `tokens[0].token =
  tokens[0].token.substring(1)` with an untouched `start`, so a leftover that later reaches
  the `default` arm reports the WHOLE token's column.
- ⚠️ **A VALUE THE `transpose`/`style` ARMS REJECT IS NOT SHIFTED.** abcjs warns and
  `break`s, so the switch sees the same token again and it becomes an unknown parameter.
  Consuming it would have silently swallowed a warning abcjs raises.

---

## 2. §3g — THE SWEEP, AND WHAT IT NAMED

abcjs's `types/index.d.ts` declares every field an `AbcElement` can carry. Enumerating THAT
list against what the corpus actually produces — the same "enumerate the reference, not our
notes" that paid 26 defects the day before — over all 487 tunes of both corpora, **parsed
and then rendered**, because the two answers differ:

| Scope | Declared | Produced (parseOnly) | Produced (rendered) |
|---|---|---|---|
| `AbcElem` | 65 | 43 | 47 |
| `AbcElemPitch` | 11 | 9 | **11** |
| `AbcElemGraceNote` | 15 | 10 | 10 |
| `AbcElemRest` | 4 | 2 | 2 |
| **`AbcElemPositioning`** | **5** | **0** | **0** |
| `AbcElemFonts` | 6 | 2 | 2 |

⚠️ **RUN IT BOTH WAYS OR IT LIES.** `abselem`, `averagepitch`, `minpitch`, `maxpitch` and a
pitch's `highestVert` are absent from a `parseOnly` tune and present on a rendered one —
the ENGRAVER stamps them onto the very `tune.lines` element (`abstract-engraver.js:396`,
`:496`). Read only the parse answer and five fields look like defects that are not.

### 2a. THREE DECLARED FIELDS DO NOT EXIST IN abcjs 6.7.0 AT ALL

`noStem`, `stemConnectsToAbove` and `beat_division` appear **zero times** in the whole of
`src/`. They are dead declarations in the type file; there is nothing to build and nothing
to compare. Recorded so the row is not opened a second time.

### 2b. FOUR ARE THE FLATTENER'S, NOT THE PARSER'S

`currentTrackMilliseconds`, `currentTrackWholeNotes`, `midiPitches` and
`midiGraceNotePitches` are written back onto the element by the synth pass
(`abc_midi_flattener.js:526-546`) and are already gated by the count-in ladder and the
`sequence` surface. Not an element-shape question.

### 2c. TWO FONTS ARE UNREACHABLE, AND THE REASON IS A DISCARDED OBJECT

`measurefont` and `repeatfont` are `addFormattingOptions`'s `elType === 'bar'` arm — and
that arm writes onto `el`, the ACCUMULATOR, while `appendElement('bar', …, bar)` publishes
`bar`, with `el = {}` on the next line (`abc_parse_music.js:305-309`). So a bar's two fonts
and its four positions go to an object nothing reads. **Measured on a control with all five
position directives set: every note carries all five, both bars carry neither field.**

`annotationfont` and `tripletfont` ARE reachable — from a MID-TUNE change only, because
`differentFont` compares against `tune.formatting`, which a header directive has already
written. Ours is byte-identical to abcjs's on that control today.

### 2d. THE FIVE POSITIONS — A FEATURE, AND A "SAME" THAT WAS NOT ONE

`AbcElemPositioning`'s five fields are `%%vocal`, `%%dynamic`, `%%gchord`, `%%ornament` and
`%%volume` (`abc_parse_directive.js:824-828`), each taking one of `auto`, `above`, `below`,
`hidden`. No corpus tune writes one and this engine warned `Unknown directive` on all five.

⚠️ **AND THE 2026-08-22 DIRECTIVE ENUMERATION HAD ALREADY SWEPT THEM AND CALLED THEM
"SAME".** That sweep rendered a control with and without each of abcjs's 41 unmentioned
directives; these five moved nothing, because the control had **no lyric, no chord symbol,
no dynamic and no ornament** — the only four things they position. A control carrying all
four moves abcjs's own output on **nine of their ten forms**, the tenth being `%%vocal
below`, which is the default and is therefore the one rung that genuinely cannot move.
**A "SAME" IS ONLY AS GOOD AS THE SHAPE THAT ASKED**, one enumeration later and on a list
that had already been enumerated.

**THE PARSE HALF IS LANDED** — see the commit and `tests/positioning.test.ts`. **THE LAYOUT
HALF IS MEASURED AND NOT BUILT**, three `.fails` holding the numbers. Its mechanism:

1. **`containsLyrics` TESTS `=== 'below'`, NOT `!== 'above'`**
   (`abstract-engraver.js:114-119`). `%%ornament above` on a singing tune writes
   `{ornamentPosition: 'above'}` and no `vocalPosition` at all, so the object EXISTS,
   `vocalPosition` is `undefined`, and `hasVocals` goes **FALSE** — which is why all nine
   moving rungs move by the SAME 22.71px. **This much is landed** (`sings`, `layout.ts`).
2. **AND ONCE `positioning` EXISTS, `hasVocals` IS NEVER CONSULTED AGAIN.**
   `if (!positioning) positioning = {…hasVocals ? … : …}` is the whole of the default
   (`decoration.js:378-379`): with an object in hand the missing keys stay `undefined` and
   every reader tests them literally. `DynamicDecoration` is `if (position === 'below')
   volumeHeightBelow = 6; else volumeHeightAbove = 6` — so **`undefined` DRAWS ABOVE**.
   Measured: abcjs keeps its `p` at y 69.92 in the bare tune and in every rung.
3. **AND THE LYRIC GOES ABOVE FOR THE SAME REASON.** `var position = elem.positioning ?
   elem.positioning.vocalPosition : 'below'` (`abstract-engraver.js:776`) — the ternary
   tests the OBJECT, not the field. Measured: abcjs's lyric goes **195.69 → 129.64**, above
   the staff, on a tune with no ornament in it.
4. `'hidden'` **DROPS** a chord symbol rather than moving it — `if (pos2 !== 'hidden')`
   guards the `addCentered` outright (`add-chord.js:104-108`).

So what is owed is a `lyricHeightAbove` lane this engine has never had a producer for, plus
the three literal-`'below'` tests. abcjs's numbers for all of it are in the test file.

### 2e. WHAT THE SWEEP LEFT, AS A LIST

Reachable from ABC, declared by abcjs, produced by NO corpus tune, and untried:

| Field | Where it comes from |
|---|---|
| `positioning` (×5) | the five directives — §2d, parse half landed |
| `stafflines` | `[K:C stafflines=1]` — a clef element's own field |
| `staffscale` | `[K:C staffscale=1.5]` |
| `transpose` | `V:… transpose=` reaching a clef element |
| `size` | `el_type: 'scale'` from `V:… scale=` — **this is §3c**, named twice |
| `suppress` | a `Q:` under `%%printtempo false` |
| `overlay` | `VoiceItemOverlay` — `&`, which we resolve to voices instead |
| `steps`, `notes`, `gap`, `grace`, `text` | no producer found in `src/`; check before building |
| pitch `style` | a per-PITCH notehead override the engraver reads (`abstract-engraver.js:679`) |
| grace `startBeam`, `startTie`, `endTie`, `style` | a tie or a beam inside `{}` |
| rest `startTie`, `endTie` | a tie on a rest |

The sweep script is throwaway and lives in the scratchpad; it is 60 lines and reads
`types/index.d.ts` directly, so it is cheaper to rewrite than to keep.

---

## 3. WHAT IS LEFT

Unchanged from `HANDOFF-2026-08-22b.md` except that **§3e is closed** and §3g is spent:

- **§1** — `abcts-directives-tune4`, the `%%stafftopmargin` height. The deferred
  y-versus-pitch refactor from 2026-08-11, not a new defect. The one byte row.
- **§2** — the `abselem` decision, still the owner's.
- **§3b** — `K:C clef=none`'s one stem. THREE failed attempts; the stem's expression is not
  the obstacle. Instrument `layoutOneItem`'s `er`/`extraWidth` arm.
- **§3c** — `V:… scale=` / `cue=`. **Named a second time by §3g**, as `AbcElem.size`.
- **§3d** — `wrap`, with its nine-case JSON oracle.
- **NEW** — the layout half of §2d above, and the §2e list.

---

## 4. THE RULES

⚠️ **A DECLARED FIELD LIST IS A REFERENCE LIST, AND IT ANSWERS DIFFERENTLY AT TWO ENTRY
POINTS.** Five fields read as absent on `parseOnly` and are present on a render, because the
engraver stamps the parse element itself. Sweep both.

⚠️ **AND A REFERENCE'S OWN DECLARATION CAN BE DEAD.** Three of the 65 fields exist nowhere
in abcjs 6.7.0's source. Enumerating the reference is the method; checking that each row has
a PRODUCER is the second half of it.

⚠️ **A "SAME" IS ONLY AS GOOD AS THE SHAPE THAT ASKED — AND A SWEPT LIST CAN BE SWEPT
AGAIN.** Five directives were enumerated on 2026-08-22, measured, and recorded as moving
nothing. They move nine ways. The list was right and the control was empty of the four
things the list positions.

⚠️ **AND A DIAGNOSTIC'S COLUMN IS DATA, NOT A LOOKUP.** Two warnings on adjacent characters
cannot both be found by their text, whatever the search. abcjs had the offset in hand; the
fix was to carry it, and no amount of cleverness in `indexOf` would have got there.
