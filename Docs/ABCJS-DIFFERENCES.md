# What abcts fixes — abcjs bugs and gaps, verified

abcts's default mode, `abcjs-strict`, reproduces abcjs **exactly, bugs included**. That is
the point: a drop-in replacement whose default output differs from the thing it replaces
is not a drop-in.

Opt into `abcjs-extended` and each item below is corrected.

```js
import { renderAbc } from 'abcts/compat'   // abcjs's API, abcjs's output
import { parse, render } from 'abcts'      // render(score, { mode: 'abcjs-extended' })
```

---

## ✅ ALL FOUR CLOSED — found by sweeping the `ponytail:` ledger, 2026-09-08

These are **abcts diverging from abcjs in STRICT mode**, which is a defect rather than a
divergence: strict has no latitude. Each was found by writing the control a `ponytail:`
marker predicted nobody would write, and each is gated by `scripts/zzledger.mjs` — 16
controls, both engines live in one browser, `KNOWN` naming exactly the open ones. **12 of
the 16 predictions held**; these are the four that did not, two of them since closed.

| control | abcjs | abcts |
|---|---|---|
| ~~`Q:3/32=60`~~ | ✅ **FIXED 2026-09-09** — see below | |
| ~~`K:D#` and 47 other spellings~~ | ✅ **FIXED 2026-09-08** — see below | |
| ~~`w:a b\|c d` — a bar hint~~ | ✅ **FIXED 2026-09-09** — see below | |
| ~~a melisma on verse 2~~ | ✅ **FIXED 2026-09-09** — see below | |

**Why written down rather than fixed** — the rule this repo has paid for more than once, *a
half-understood fix is worth less than a written-down measurement*:

- ✅ **The key table — FIXED, and it turned out to be three defects rather than one.**
  abcjs's answers for all 231 spellings are harvested into `src/core/keys-abcjs.ts` by
  RUNNING it, never transcribed, and collapse into 147 `(root, accidental, mode)` groups —
  every one checked internally consistent at generation time. `keyFifths` consults it;
  `abcjsKeepsKey` marks the 37 groups abcjs does not recognise, which **redraw the key in
  force** rather than changing it; and the cancelling naturals compare the note LETTER
  alone, case-insensitively, as abcjs does. Measured against abcjs 6.7.0 live:

  |  | before | after |
  |---|---|---|
  | header spellings | 48 of 168 differ | **0** |
  | inline `[K:]` changes | 128 of 336 differ | **0** |

  ⚠️ **The "unpinned header seed" was a red herring** — the seed is just the key in force,
  and in a header there is none, so abcjs's own answer for the bare spelling IS the value.
  Harvesting it made the question go away rather than answering it.

  ⚠️ **And two of the three only appeared once the one before it was fixed.** Skipping an
  unrecognised change outright drew NOTHING where abcjs redraws two sharps — *"abcjs
  ignores it"* and *"abcjs applies the key it already had"* look identical in the model and
  differ on the page. Then, with that right, 32 of 336 still differed **in nothing but
  naturals**, which is the letter-only cancellation.
- ✅ **The tempo flag — FIXED, and the row was a SYMPTOM.** The marker predicted a missing
  glyph; the ledger predicted an error path; the defect was neither. **The tempo mark has
  its own note table** — a thirteen-arm if-ladder over the raw duration
  (`tempo-element.js:32-44`), with its own comment saying why: *"There aren't an infinite
  number of note values, but we are passed a float, so just in case something is off
  upstream, merge all of the in between points."* We were reading the NOTE table
  (`noteGlyph`, a floor and a halving loop) for it. The two agree on every duration a
  musician writes, which is how one stood in for the other for months, and part on the
  rest:

  | | abcjs | abcts, before |
  |---|---|---|
  | `Q:3/32` | quarter + `flags.u16nd` + dot | `flags.u16th` — the ledger's row |
  | `Q:1/5` | a bare quarter | a flagged, DOUBLY DOTTED quarter |
  | `Q:2/5` | a half | a doubly dotted quarter |
  | `Q:4/1` | a dotted breve | **nothing** — `noteGlyph` returns null past the breve |

  `tempoNoteGlyph` is that ladder. Four rungs of `tests/tempo-parts.test.ts`, each
  measured off abcjs 6.7.0.

  ⚠️ **AND `flags.u16nd` IS NOT A GLYPH IN ABCJS EITHER** — a typo for `u16th`, so
  `glyphs.printSymbol` answers `null` and `printSymbol` draws its MISSING-GLYPH MARKER in
  place of the flag: `"no symbol:flags.u16nd"` in `debugfont`, which is the unknown-type
  FALLBACK rather than a font anyone configured — Arial 16, `stroke="#ff0000"`, underlined
  (`draw/print-symbol.js:41-45`, `draw/text.js:32`,
  `write/helpers/get-font-and-attr.js:32`). `PlacedText.debug` is that text, and the whole
  tune is byte-identical to abcjs's.

  ⚠️ **ITS y IS THE STAFF'S ORIGIN, NOT THE MARK'S.** `renderText` is handed `renderer.y`,
  which `drawStaffGroup` set to `staff.absoluteY` and which the tempo's own float never
  touches — so the marker sits BELOW the staff it belongs to while the mark floats above
  it. In our frame that origin is y 0, the same fact `anchorAboveStaff`'s tempo branch
  already used for the notehead, and the marker is re-pinned there after the mark is
  moved.
- ✅ **The bar hint — FIXED, and the barline positions it "does not have" were the
  measures.** abcjs's distribution loop walks the line's ELEMENTS rather than its notes
  (`abc_parse.js:286-313`), so the hint is a `{skip: true, to: 'bar'}` consumed by the next
  BAR element, and — the half no marker predicted — **every element it waits through takes
  an EMPTY syllable**, `{syllable: "", divider: " "}`, which draws `&nbsp;`. Our measures
  ARE that element stream: `alignSyllables` walks it with `measureOfNote()`.

  ⚠️ **A BARLINE IS CONSUMED ONCE, BY WHICHEVER HINT IS AT THE HEAD AS THE WALK CROSSES
  IT**, which is why the four probed shapes differ from "skip to the next measure": a hint
  written AT a barline blanks nothing, two in a row take two barlines, and a LEADING hint
  blanks the first measure rather than being free (a line's elements hold the barlines that
  END its measures). All four probed against abcjs 6.7.0 and held in
  `tests/corpus/parse.test.ts`.

  ⚠️ **AND ONE EXISTING TEST ASSERTED THE DROP.** *"treats `*` as an EMPTY syllable and `|`
  as an alignment hint occupying none"* expected `["Do", "", "Mi", "Fa"]` from
  `w:Do * | Mi Fa`; abcjs answers `["Do", "", "", ""]`. The row was written from the same
  reading the defect came from, so it agreed with the code and with nothing else.

  ⚠️ **`s:` LINES GET THE SAME WALK**, because abcjs's `addSymbols` is a copy of `addWords`
  and says so. Without it a `|` in an `s:` line would leave an entry in the queue and shift
  every symbol after it — the ported-once pattern, caught before it landed rather than
  after.
- ✅ **The melisma — FIXED, and the "three layers wide" blocker was the estimate, not the
  cause.** The note was right that the flag had to cross the model, the parser and the
  drawing, and wrong that `extraVerses` had to stop being a `(string|null)[]` first: abcjs
  reads the divider off each verse's OWN syllable
  (`abstract-engraver.js:769-774`), so one parallel `readonly boolean[]` —
  `Note.extraVerseMelismaStarts`, filled by the same lookahead verse 1 already used —
  answers it. Under an hour, and the third standing "measured, not landed" note in a row
  whose CAUSE was right and whose SIZE was wrong.

  ⚠️ **And it exposed a latent one beside it.** The compat emitter's `lyric` array is
  DENSE, as abcjs's `el.lyric` is, so an entry's index is not its verse's; reading the
  flag after the filter would put verse 1's underscore on verse 2 for any note the first
  `w:` line skips. The zip happens before the filter.

  The underscore stays gated on `ABCJS_GAPS`, exactly as verse 1's is — extended
  suppresses the literal — so this moves no mode-bytes row. `tests/lyric-verse-melisma.test.ts`
  holds all three layers with the extended row as the negative control.

## ⚠️ THE SECOND LEDGER SWEEP, 2026-09-09 — FOUR MORE, THREE CLOSED

The first sweep wrote controls for 16 of the 97 `ponytail:` markers; the other ~80 were
classified by READING. This is the second pass over those, with one addition to the method:
**each control carries a WITNESS — a regex the shape must produce in abcjs's own output —
so a row that agrees because the feature never rendered reports MUTE rather than "held".**
It fired four times in eighteen controls, twice on my own witness (a hairpin's element is
`data-name="dynamics"`, and a notehead's `data-name` is its PITCH, not its glyph).

| control | abcjs | abcts, before |
|---|---|---|
| ✅ a `*` in an `s:` line | no lyric at all on the skipped note | an EMPTY one, drawing `&nbsp;` |
| ✅ `%%voicecolor` with no `V:` written | nothing — the directive is inert | the whole tune coloured |
| ✅ a MID-TUNE `%%newpage` | costs nothing; the line stands where written | 61.33px taller, line at index 0 |
| ⚠️ a header `K: style=` over two voices | voice 2 inherits voice 1's style | voice 2 draws plain heads |

- ✅ **`addSymbols` IS NOT `addWords`.** abcjs reads `s:` with a COPY of its `w:` parser —
  its own TODO says so — and the copy differs in ONE line: the skip branch never pushes the
  empty `{syllable: "", divider: " "}` onto the element it waits through
  (`abc_parse.js:378-388` against `:286-300`). So `s:!trill! * !fermata! *` draws TWO lyric
  elements in abcjs and drew four here. One flag on the line, `symbols`, and the same walk
  serves both.

- ✅ **`%%voicecolor` READS `multilineVars.currentVoice`, WHICH ONLY A `V:` FIELD SETS**
  (`abc_parse_directive.js:863-871`). No `V:` in the tune, no colour at all — which is most
  tunes, and we coloured every one of them. And the voice it means is the LAST `V:` field,
  a header declaration included, where ours was the voice music was landing in: a colour
  after a `V:1` / `V:2` pair paints voice 2 in abcjs and painted voice 1 here. See
  `ScoreBuilder.declaredVoiceId`, which is abcjs's value and deliberately not ours.

  ⚠️ **The marker's own prediction HELD** — a second `%%voicecolor` between two music lines
  paints both lines in abcjs too, so one colour per voice is the behaviour rather than an
  approximation of it. **The control that closed a prediction is what found the defect
  beside it.**

- ✅ **A `%%newpage` COSTS THE `staffSeparation` OF A NON-MUSIC LINE BEFORE THE FIRST
  STAFF, AND NOTHING ELSE.** `addNewPage` pushes a `{newpage: n}` LINE where the directive
  stands and nothing in `write/` reads it; the whole cost is `else if (line > 0)
  renderer.moveY(spacing.staffSeparation)` (`draw/draw.js:46-47`). Measured: a header one
  makes the page 61.33px taller and a mid-tune one changes nothing, where ours spent the
  separation for both — and put the line at index 0 in both, `["newpage","staff","staff"]`
  against abcjs's `["staff","newpage","staff"]`. `Measure.newPageBefore` is where it stands.

### AND THE SWEEP'S SECOND HALF — the markers no SVG control can reach

`scripts/zzledger.mjs` diffs SVG. The audio markers needed their own harness (both engines
in one page, `setUpAudio().tracks` and `synth.getMidiFile`), and **its NEGATIVE CONTROL —
a plain four-note tune — differed on the first run.**

- ✅ **`getMidiFile` ON A TUNE OBJECT RETURNS A STRING, NOT AN ARRAY.**
  `if (typeof source === "string") return tunebook.renderEngine(…); else return
  callback(null, source, 0)` (`synth/get-midi-file.js:37-40`). Ours wrapped both arms in an
  array. ⚠️ **And `tests/midi-bytes.test.ts` normalised it away** — `Array.isArray(r) ?
  r[0] : r`, written to make the gate work rather than to state the contract — so the gate
  that exists to prove this entry point could not see the entry point was wrong. It asserts
  the shape now.

- ✅ **`%%voicescale` WAS UNIMPLEMENTED AND WARNED.** The arm three lines above
  `%%voicecolor`'s and guarded identically, so it takes the same `declaredVoiceId` and does
  nothing without a `V:`. `%%voicescale 1.5` after a `V:1` renders 96.81px tall in abcjs and
  rendered 94.79 here, and BOTH spellings raised `Unknown directive` — a warning abcjs does
  not raise, invisible to the warnings gate because no corpus tune writes one.

- ✅ **A TIE MARK INSIDE A CHORD IS A DIFFERENT MECHANISM FROM ONE AFTER IT**, and the
  difference is not how many heads carry one. Inside the bracket sets
  `multilineVars.inTieChord[<position>]`, read ONLY by the chord loop; after it sets
  `isInTie`, read by the next element whatever it is (`abc_parse_music.js:381-386` against
  `:529-536`). Probed through abcjs 6.7.0:

  | | abcjs | abcts, before |
  |---|---|---|
  | `[C-E]C\|` | three notes — a single note is not a chord | C 0.5: merged |
  | `[C-E-]C\|` | the same; every head tied changes nothing | C 0.5 — the parser collapsed it into `[CE]-` |
  | `[C-E]z[CE]\|` | C 0.5 — a rest does not kill it, where `C-z C` dies | died at the rest |
  | `[C-E]D[CE]\|` | C 0.5 — nor does an intervening note | died at the note |
  | `[C-E][EC]\|` | no merge — POSITION 0 is E there | merged by name |
  | `[CE]-C\|` | C 0.5 — the after-bracket mark does reach a note | agreed |

  `chordTies` in `src/audio/flatten.ts` is the positional table; `tests/chord-tie.test.ts`
  holds all six rows.

  ✅ **AND THE DRAWING FOLLOWED THE SAME DAY, WHICH IS WHERE THE THIRD RULE WAS.** The
  four controls that differed in the SVG are byte-identical now, and so are eight more:
  `tieTargets` in `layout.ts` is the resolver, and it adds what the audio did not need —
  **a tie nothing closes keeps `anchor2 === null` and `calcX` runs it to `lineEndX`**
  (`tie-element.js:133-138`), where ours dropped it or tied it to the wrong element.

  ⚠️ **AND THE POSITION IS THE SOURCE'S, WHICH THE ENGRAVER'S SORT MOVES.** `inTieChord` is
  keyed as the chord is PARSED and `sortPitch` reorders the pitches later
  (`abstract-engraver.js:391`), carrying each flag with its own pitch object — so
  `[C-E][EC]` stamps `endTie` on the E, which sorting puts SECOND, and abcjs ties C to E.
  Resolving by the ascending index ties C to C. `NoteAnchor.tieSrc` is that mapping.

  ⚠️ **AND IT FIXED A REAL FIXTURE, NOT ONLY THE CONTROLS.** `S7-voices` tune 6 — "S7-7
  Organ Trio" — drew ONE tie where abcjs draws THREE, and is byte-identical now. It has no
  golden, which is why every byte gate read zero through it; the two missing ties are in
  the visual baseline as of this change.

  ⚠️ **AND ONE REPO TEST ASSERTED THE DEFECT**: *"still drops a curve with nowhere to land
  at all"*, on `GGGG|GGGG-|`. abcjs draws that curve from 384.83 to 425.26. There is no arm
  in `calcX` that drops a tie; the old expectation read an absence as a decision.

  ⚠️ Still open and measured: `[B-eg-b-]|[Begb]|` writes one tie's y as 60.54 against
  abcjs's 60.53. One hundredth, on one of three ties, and it pre-dates all of this.

  ⚠️ **Two predictions HELD and are now dated rather than standing**: an `&` overlay on the
  second staff only, and a meter change on the last line of voice 0 alone, are both
  byte-exact MIDI.

## ✅ THE HOST-OPTION SURFACE — a SECOND new axis, same day

`scripts/zzopts.mjs` renders the whole corpus under each switch a drop-in host actually
passes, and compares the **CONTAINER as well as the SVG** (`outerHTML`) — because half of
what `setPaperSize` does is assign styles to the PARENT node
(`draw/set-paper-size.js:29-41`), which no emitted string can carry.

**IT OPENED AT 685 OF 685 ON EVERY ROW**, including the plain one, for a single reason:

- ✅ **abcjs SIZES THE CONTAINER AND WE SET NOTHING.** `overflow: hidden; height: <h>px`,
  plus `width: <w>px` when the scale is below 1 — a host's layout reserves that space, and
  ours reserved none.
- ✅ **`responsive: "resize"` WAS UNIMPLEMENTED**, and it is the option a page reaches for
  first: `viewBox` + `preserveAspectRatio` on the SVG with its `width`/`height` REMOVED, and
  `class="abcjs-container"` with a `padding-bottom` ratio on the parent (`svg.js:33-59`).
- ✅ **AND IT DISCARDS THE SCALE, WHICH abcjs SAYS IN ITS OWN COMMENT** — *"the resizing
  will mess with the scaling, so just don't do it explicitly"*
  (`engraver-controller.js:213-216`). The `%%scale` DIRECTIVE goes with it, not just the
  param. Measured across four scales: abcjs's viewBox and padding are IDENTICAL at 1, 0.7,
  1.5 and 2, where ours moved with the scale.
- ⚠️ **AND TWO ORDERING RULES, BOTH BECAUSE THE BROWSER SERIALISES WHAT WE ASSIGN.** The
  transform is re-applied AFTER the four position styles (`setScale` runs after
  `setResponsiveWidth`), and the `style` ATTRIBUTE is dropped before the `viewBox` is set so
  it is re-created last — ours came from markup that already had one, which put `viewBox`
  after it.

**Three more surfaces were declared open in that gate with their counts**, all geometry
INSIDE the SVG rather than option plumbing, and none ever rendered by a gate before:
`print` 8, `scale` 4 and 2, and `jazzchords` **95 — closed the same day**.

## ✅ `style=` IS A VOICE-LINE PROPERTY, NOT A VOICE ONE — the last ledger defect

`zzledger`'s `parser.ts:4914` reported **STALE** on its own once the change landed. The
`ponytail:` marker at the site predicted a MODEL CHANGE rather than a patch and **the size
was right**, which is worth as much as a wrong one being caught: three rules, none of which
a single-voice fixture can state, so every gate in the repo was green over all three.

Laddered over TEN rungs through both engines, reading each notehead's path length — a slash
is ~33-57 characters, a round head ~377-389:

1. **`K: style=` IS GLOBAL.** abcjs's `multilineVars.style`, read by every voice-line that
   opens after it (`abc_parse_music.js:1008-1009`); a `V: style=` is the voice's own and
   beats it (`:1027-1028`). It was read here as the CURRENT voice's, so a header
   `K:C style=rhythm` over two voices reached only the first.
2. **A VOICE-LINE'S STYLE IS FIXED WHEN THE LINE OPENS, AND A `V:` FIELD OPENS ONE.** This is
   the whole difference between a single-voice tune, where a leading `[K: style=]` DOES reach
   its own line, and a multi-voice one, where it does not — `createVoice` appends the `style`
   element as the line opens (`tune-builder.js:971-973`) and `startNewLine` fires lazily
   unless a `V:` has already run it. A mid-line `[K:]` therefore updates the global value and
   the NEXT line to open reads it.
3. **A VOICE-LINE WITH NO STYLE OF ITS OWN INHERITS THE LAST ONE ENGRAVED.**
   `pushCrossLineElems`/`popCrossLineElems` save the slurs, the ties, the endings, the COLOUR
   and the SCALE per voice and **not** `this.style` (`abstract-engraver.js:92-107`), and
   `reset()` does not clear it either. `V:1 style=rhythm` draws slash heads on the lower
   staff too.

⚠️ **THE RUNNING VALUE FOLLOWS SOURCE ORDER**, which is engraving order for interleaved
voices and for every single-staff tune, and not for a tune written a whole voice at a time.
Marked at `ScoreBuilder.runningStyle` with the upgrade path — a post-parse pass over
`score.staves` and the `startsSystem` boundaries, where the true (line, staff, voice) order
lives.

⚠️ **AND TWO INTERMEDIATE SHAPES WERE WRONG, BOTH NAMED BY THE LADDER IN ONE RUN.** Capturing
in `push` left the FIRST note of every line on the old value, because the event is BUILT
before it is pushed; and `beginMusicLine` wiped the capture a `V:` field had just made. A
third — a voice conjured after the `K:` never seeing the global style — was caught by the
SUITE and not the ladder, which is the argument for running both.

## ✅ THE INTERACTIVE SURFACE — a THIRD new axis, and the score had been unclickable

`scripts/zzclick.mjs` renders the corpus, dispatches mousedown/mouseup at real points and
compares **what the host is told** — the callback's six arguments — as well as what the DOM
looks like afterwards. Every other gate here compares MARKUP; `zzselect` proves the
selectable array and its attributes are abcjs's, and nothing proved that CLICKING one did
anything at all.

**IT OPENED AT EVERY CASE.** `setupSelection` (`write/interactive/selection.js`, 424 lines)
was unported, so abcts attached **no DOM event listeners at all**: `clickListener` was never
called, and `ABCJS.Editor` installs one of its own, so its score-to-caret direction was dead.
It is 1 of 685 on all three rows now, and that one is declared.

- ✅ **THE JOIN IS `data-index`, WHICH IS THE JOIN abcjs USES TOO.** Its `svgEl` is the live
  node because it draws through a DOM; ours is a synthetic attribute bag, so each selectable
  is bound once after injection by the very attribute `Selectables.add` writes — and
  `findElementInHistory` matches on `dataset.index` rather than on identity.
- ⚠️ **`selectable="false"` IS A TRUTHY STRING.** `getTarget` walks up until
  `getAttribute("selectable")` is truthy, and with no `selectTypes` every selectable carries
  the literal `"false"` — so the walk STOPS there and a default render is fully clickable.
  Reading that attribute as a boolean makes the common case unclickable.
- ⚠️ **THE HIGHLIGHT COMES BEFORE THE NOTIFY**, so the `classes` string a host receives
  already contains `abcjs-note_selected` — which on a render with no `add_classes` is the
  only class there is.
- ⚠️ **`abcjs-dragging-in-progress` IS ADDED AND NEVER REMOVED, WITH A LEADING SPACE.**
  `mouseDown` adds it to `renderer.paper`; `mouseUp` removes it from `renderer.svg` — two
  different fields, and the renderer has no `svg`, so the guard is false. The leading space
  is `getClassSet` splitting a missing attribute into `[""]`. Both reproduced.
- ⚠️ **A TEMPO IS REGISTERED AS A SELECTABLE AND IS NEVER PAINTED.** `drawAbsolute`'s
  `isTempo` arm is alone in not running `params.elemset.push(g)` (`draw/absolute.js:52-56`),
  so `highlight` walks an empty list. **The rule was already in this repo** —
  `range-highlight.ts` ports it and says so — and porting it a second time is the point.
- ⚠️ **THE UP ARROW DOES NOT SET `dragMechanism` AND THE DOWN ARROW DOES**
  (`selection.js:93-115`). Reproduced; it looks like an oversight and it is abcjs's.
- ⚠️ **ONE FIXTURE IS DECLARED, AND IT IS A LAYOUT DIFFERENCE.**
  `abcts-ledger-gaps-3-tune3` reports `staffPos.top` 155.45 / `height` 60.932 against
  abcjs's 142.757 / 73.625 — `zero` is EXACT and `top + height` is EXACT, so the staff
  origin and the group's bottom both agree and only the SPLIT is ours. The 12.693px is the
  inter-system separation CLAMP: abcjs folds it into `staff.top`, which `startY` is measured
  back from, and our layout spends it in the system advance. It moves no ink.

### ✅ AND AN OPEN SLUR NOT FOLLOWED BY A NOTE ORPHANS EVERYTHING BEFORE IT

Found by `zzclick`, because a click hands the host the `abcelem` ITSELF — a `startChar` is
visible there and in no markup gate. `parseMusic` retakes `startI` every iteration; its
inner loop gathers chord symbols, annotations, decorations and a grace group TOGETHER, and
a `(` is consumed further down by `letter_to_open_slurs_and_triplets`. When `getCoreNote` is
then asked to read a `{`, `"` or `!` it reads nothing, the iteration appends nothing, and
the next one opens at that character. Measured on a twelve-rung ladder through both engines:

    "C"({ge}CD)|     abcjs opens at 4, the `{`     "C"("^a"CD)|     at 4 — not about graces
    "C"(!p!CD)|      at 4, the `!`                 "C"(({ge}CD))|   at 5 — the whole run
    "C"(3{ge}CDE|    at 5 — a TRIPLET counts       "C"( {ge}CD)|    at 5 — whitespace too
    "C"(3CDE|        at 0 — a NOTE follows         "C"{ge}(CD)|     at 0 — likewise

The rule was already half-implemented and could only fire when the element OPENED on the
run, so `"C"({ge}CD)` never reached the slur at all. **Ten of the twelve rungs already
agreed**, which is why nothing had named it.

### ✅ AND THE THREE WRAPPER OPTIONS LANDED — `oneSvgPerLine`, `viewportHorizontal`, `viewportVertical`

All three were **unimplemented outright** and are 0 of 685 apiece, `oneSvgPerLine +
responsive: "resize"` included. Each builds a wrapper the emitted string cannot carry, so
each is DOM-side beside `sizeContainer`, and none of them exists headless — which is
abcjs's own behaviour, not a shortcut.

- ✅ **`oneSvgPerLine` — ONE `<svg>` PER TOP-LEVEL `<g>`**, each in an `overflow: hidden`
  div, with a `viewBox` scrolled to where the section was drawn and an
  `aria-label`/`<title>` of `Sheet Music for "<title>" section N`
  (`engraver-controller.js:317-368`). **Every number in it comes from `getBBox()`.**
  Four rules, and three are not what a reading predicts:
  - **A SECTION'S HEIGHT INCLUDES THE GAP ABOVE IT** — `box.y - nextTop` belongs to the
    section BELOW, so the divs tile with no seams, and `nextTop` advances to
    `box.y + box.height` rather than to the height just written.
  - **THE WRAPPER'S HEIGHT IS SCALED AND THE SVG'S IS NOT.** At `scale: 0.8` the div reads
    `47.325px` for an `<svg>` of `59.15625` — the same split `setPaperSize` makes, the CSS
    transform doing the rest.
  - **THE WRAPPER'S `style` IS A CONCATENATED STRING**, so it reaches the attribute
    unserialised: `overflow: hidden;height:55.40625px;`, a space after the first colon and
    none after the second. Setting the two properties instead normalises it and differs on
    every wrapper — measured by breaking it on purpose: 86 of 87.
  - **AND THE `<title>` IS AN HTML ELEMENT INSIDE AN SVG** — `createElementNS` for the
    `<svg>`, plain `createElement` for the title.
- ✅ **`viewportHorizontal` / `viewportVertical` — THE HOST'S DIV BECOMES THE VIEWPORT** and
  the music moves into a `div.abcjs-inner` (`.abcjs-inner.scroll-amount` for the vertical
  arm) inside it (`abc_tunebook_svg.js:29-47`). abcjs hands the ENGRAVER that inner div, so
  **everything `setPaperSize` writes lands on the inner one** and the outer carries only its
  own overflow. They are an `if`/`else if`, not a pair of flags: horizontal wins when both
  are passed, and nothing warns.
- ⚠️ **AND THE OUTER'S `parent.style.width = div.style.width` IS USUALLY A NO-OP** —
  `setPaperSize` writes a `width` only below scale 1, so above it the inner's is `""`. A
  plain horizontal viewport's outer div carries `overflow: hidden` and NOTHING ELSE. That
  was verified against abcjs rather than reasoned; a wrong guess is a width on every
  container.
- ⚠️ **`oneSvgPerLine + scale 0.8` DIFFERS ON 4, AND THEY ARE THE SAME FOUR** as the plain
  `scale 0.8` row — established by differencing the two sets, not inferred from a shared
  first-three. The split inherits that row's non-unit-scale geometry and adds nothing.
- ⚠️ **THE RESIZE HANDLER'S ARITHMETIC IS REPRODUCED, BUG AND ALL.** `resizeOuter` declares
  `width` OUTSIDE its loop and subtracts each div's offset from what the last one left, so
  a second viewport on a page is narrower than the first (`abc_tunebook_svg.js:10-20`); and
  a div with no `id` is keyed under `"undefined"`. No gate here can see a resize handler,
  so the only defensible rule is to be abcjs.
- ⚠️ **THE FIREFOX `viewBox` `+1` IS PORTED; ITS TWO SIBLINGS ARE NOT.** `renderer.firefox`
  also has arms in `print-stem.js` and `print-line.js` that abcts has never had — a
  pre-existing gap, now written down.

### ✅ AND PRINT WENT 8 TO 7, WITH TWO FEATURES AMONG THE ROUNDING

- ✅ **`%%header` WAS PARSED AND NEVER DRAWN**, and PRINT IS THE ONLY MODE THAT DRAWS ONE
  (`top-text.js:7-14`). Three rows — left, centre, right — above the margin, each with
  `marginTop: -headerTextHeight`, whose probe measures **`"X"`** where every other row in
  the block measures `"A"`.
  - ⚠️ **`headerfont` AND `footerfont` ARE THE ONLY TWO FONTS PRINT DIVIDES BY THE SCALE** —
    `formatting.headerfont.size /= scale` (`renderer.js:84-85`), because they sit OUTSIDE
    the scaled drawing. `%%headerfont Geneva 15` draws at 27, which is
    `round((15 / 0.75) * 4/3)`.
  - ⚠️ **AND IT RESERVES NOTHING**, which abcjs's own comment states: *"whether there is a
    header or not doesn't change any other positioning"*. Its ROWS still move the cursor
    (+2.73 on the default font, measured), but its INK is above the margin — counted as
    ink, the extent grew and the staff dropped 21.8px where abcjs moves it 2.73.
- ✅ **`%%topspace` DID NOT REPLACE THE PRINT TOP SPACE.** Only print spends that row at
  all, so no gate had rendered it: `%%topspace 40` puts abcjs's title 23.09px below ours,
  exactly `40 * 4/3 - 30.24`.

**Six of the seven that remain differ in a LAST DIGIT** — `202.75` against `202.76`,
`196.3183333333333` against `…33` — the layout-unit round trip again. The seventh is
`visual-options-01-fonts`, which has several open causes at once and whose own file warns
that such a fixture cannot rule anything out.

The jazzchords arc:

- ✅ **THE HOST PARAM WAS IGNORED OUTRIGHT.** `{jazzchords: true}` set nothing; only the
  `%%jazzchords` DIRECTIVE reached the renderer, where abcjs takes the param as the default
  and lets the tune's own directive override it (`engraver-controller.js:69-70`, `:188`).
  `D7` drew as plain text where abcjs superscripts the `7`.
- ✅ **AND THEN TWO MEASUREMENTS READ THE FLAT STRING** where abcjs measures the DRAWN jazz
  form, whose modifier is a nested tspan at `font-size:0.7em`. The box round `G♭maj7` came
  out 54px against abcjs's 45; and the LANE PACKING opened a SECOND chord lane where abcjs
  fits one, which is 18.03px of staff on `visual-transpose-output-01`. The rod had used the
  jazz form all along — **three sites, one rule, and only one of them had it.**
  `measuredText` is the single place that answers it now.

⚠️ **AND `13` WAS THE JAZZCHORDS COUNT OVER A 1-IN-8 SAMPLE; THE REAL ONE WAS 95.** A
sample is a lower bound and never a number to declare — the gate reported `UP` on the first
full run, which is what a declared count is for.

---

## ✅ THE SELECTABLE SURFACE — a NEW AXIS, opened and closed 2026-09-09

`scripts/zzselect.mjs` is `zzlive` with **`selectTypes: true`**, which is how a host asks
for click-to-select. abcjs then stamps `selectable="true" tabindex="0" data-index="N"` on
the element it DREW for each entry, and **none of that markup exists with the default
`selectTypes`** — so every byte gate in this repo rendered straight past it.

**It opened at 9 of 685 with `zzlive` at zero**, and `tests/selection.test.ts` was green
through all nine: that gate compares the selectables ARRAY, and every one of these was in
the MARKUP. Five causes, five different places:

| | |
|---|---|
| a CURVE is in the array and its `<path>` was never stamped | `curveToPath` re-extracts `class` and `data-name` from the attribute string and dropped the rest |
| an element that DREW NOTHING kept its `data-index` | `abcts-endings` tune 3 — the ending label is its own barline — so every entry after it was numbered one high |
| a BOXED bottom-text row stamped its inner `<text>` | `renderText` returns the GROUP it opened for the box, and `wrapSvgEl` stamps what it returned |
| the LAST group of the bottom text never closed | `closeIfEnded` looks BACK from the following row, and there was none |
| a group whose last row is RICH TEXT lost its record | the not-selectable guard belongs to the ROW; the `endGroup` record belongs to the `<g>` |

⚠️ **AND FOUR OF THE FIVE WERE INVISIBLE TO THE ARRAY.** The array had the entry and the
DOM did not, or the array's index and the DOM's disagreed — which is what a host reads. A
comparison can only catch what its representation can express, for the second time in this
repo after the timing gate's geometry columns.

---

### ⚠️ AND THE FOURTH IS MEASURED, NOT LANDED — `style=` LEAKS BETWEEN VOICES

Declared in `scripts/zzledger.mjs`'s `KNOWN`. **The marker's cause was right and this
re-derivation does not shrink it.**

`this.style` is plain engraver state: `pushCrossLineElems`/`popCrossLineElems` save and
restore the slurs, the ties, the endings, the COLOUR and the SCALE per voice, and not the
style (`abstract-engraver.js:92-107`). So the effective style of a voice-line is **the last
`style` element seen in (line, staff, voice) ENGRAVING order**, and a voice that declares
none inherits whatever the previous one left. Four shapes, probed:

| | abcjs | abcts |
|---|---|---|
| `K:C style=rhythm`, two voices | both voices slashed | voice 1 slashed, voice 2 plain |
| `V:1 style=x`, `V:2` plain | both voices x | voice 1 x, voice 2 plain |
| `V:1` plain, `V:2 style=x` | voice 2 x only | **agrees** — the leak runs forward only |
| one voice, `K:C style=x` | x | **agrees** — the gated case |

Ours resolves the style per voice at PARSE time and stamps it on the event, where the leak
is a running value in engraving order. Reproducing it means the running value, re-asserted
at each line head — the model change the marker named, and the third row above says a
per-voice reading cannot express it.

---

### ⚠️ AND ONE MEASURED BESIDE IT, NOT LANDED — a tempo FLAG's last ULP

`Q:1/8=60` renders identically in every respect but the flag path's first coordinate:

    abcjs   <path data-name="flags.u8th" d="M 77.1835 25.341250000000002l …
    abcts   <path data-name="flags.u8th" d="M 77.18350000000001 25.34125000…

One ULP, on the x alone, and it reaches any tune with a FLAGGED tempo unit (`1/8`, `1/16`,
`1/32`) — none of which the corpus holds, which is why `svg-bytes` reads zero through it.
The shape is the one this repo has hit three times: `w * a * b` associating left where
abcjs forms `a * b` first and multiplies once (see the grace flag's `graceFlagDx`). NOT
INVESTIGATED past this measurement; the terms to compare are our
`cursor + headAdvance - spaces(flagStemInset)` against `headx + notehead.w - 0.6`.

---

## ⚖️ AND THIS FILE IS THE WHOLE LIST — EXTENDED IS OTHERWISE BYTE-EQUAL TO STRICT

**Owner's rule, 2026-09-07:** *"extended mode should always be byte compatible with strict,
except for those explicitly agreed upon divergences (usually we've fixed a bug in abcjs)."*

`tests/mode-bytes.test.ts` enforces it over all 691 corpus fixtures with the pipeline held
equal, and every slug it lets through names the entry here that permits it. A slug in its
`DIVERGENT` list without a row in this file is a tolerance wearing a disguise.

**It opened at 675 of 691.** The declared list accounted for eleven; the other 664 came
from one flag doing two jobs — `strict` gated both *reproduce abcjs's bug* and *engrave the
way abcjs engraves*, so extended had quietly become a second engraving engine: Bravura
outlines at Bravura's advances, abcm2ps's spacing density (16% looser), Bravura's line
weights, real per-em text metrics. None of those is a bug abcjs has, and none was ever
written down here. They are gone; 675 → 11.

⛔ **One correction was measured and DECLINED.** The golden text tables are ASCII-only —
`dump-svg.js`'s `widths[ch] || 8` measures CJK at a flat 8px — so extended used to measure
for real. Keeping it costs **156 of 691** fixtures to fix something no browser ever shows:
with a DOM both modes ask it, so the divergence existed only under jsdom. Both modes now use
the golden tables. Recorded here so it is not re-argued as an obvious improvement.

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
| **SVG file** | `tests/svg-bytes.test.ts` | **BYTE-EXACT, 0 of 691** (closed 2026-08-14) |
| extended vs strict | `tests/mode-bytes.test.ts` | **11 of 691, all declared above** |

`tests/svg-bytes.test.ts` is the only gate here with no tolerance at all. Every other one
declares what it ignores — `pixel-parity` compares notehead centres, the harvested table
takes 0.05px, `dom-contract` counts classed ancestors rather than raw nesting — and each of
those was defensible for the axis it was built to see. **Together they let a markup
difference live forever**: a `<rect>` where abcjs writes a `<path>` moves nothing, a
`<g transform>` where abcjs writes absolute coordinates moves nothing, and an attribute in a
different order moves nothing. A byte string has no such latitude.

### The blockers — ⚠️ ALL SIX CLOSED, kept for what they teach

**`svg-bytes` reached 0 of 691 on 2026-08-14 and has stayed there**, in-repo and on the 356
sibling rows, and `zzlive` says the same in WebKit and Chrome. The list below is what was
open when this section was written and it is HISTORY, not a work list — it is kept because
each row is a shape that recurs, and one of them (the ULP family) is the reason
`abcjs-constants.ts` carries a `UNIT_PX` knob at all.

1. **THE ROOT'S `height`, on 109 of 171 fixtures.** One or two ULPs, in both directions —
   `227.68050000000002` against `227.6805`. abcjs accumulates `renderer.y` in PIXELS; we
   accumulated the same quantity in staff spaces and multiplied by 7.75 at the end.
   Rewriting only the last step moved 69 exact rows to 70, so the noise was spread through
   the whole accumulation. **Closed by holding abcjs's own pixels end to end** — only the
   SAME ARITHMETIC produces the same bytes, and rounding cannot fix what a different
   association broke.
2. **The order and form of an element group's children.** A FLAG precedes its notehead on a
   single note and sits BETWEEN the heads of a chord — the engraver's add order, not a rule
   about flags. A STEM is `printStem`'s form (no separators between path commands, no
   `stroke`/`fill` inside a group, `class` before `data-name`); a ledger and a staff line
   are `printLine`'s, with spaces and `data-name` first.
3. **Glyph coordinate noise** — the same family as 1, and closed with it.
4. **A notehead's `data-name` is the WRITTEN NOTE** — `C`, `c`, `C,`, accidental prefixed
   and rewritten by transposition. It reads as derivable from the pitch and is not: `c,`
   and `C` are the same note and abcjs keeps whichever was typed.
5. **A multi-digit time signature is ONE group** — `<g data-name="12">` with unnamed
   per-character paths, where a single digit is a bare `data-name="3"` path.
6. **Curves and beams** — a tie is `drawArc`'s two-cubic closed path; a beam is `drawBeam`'s
   single concatenated path holding every level of its group. Ours were a classed `<path>`
   and a `<polygon>`.

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

**None of these was a ruled divergence** — every one was closed rather than declared.
`tests/svg-bytes.test.ts`'s `DIVERGENT` list stays empty until something is written up HERE
with its evidence — a slug in that
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

| | `abcjs-strict` | `abcjs-extended` |
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
an extension line. abcjs prints the literal `_` character instead — **on every verse that
holds one**, since `addLyric` reads the divider off each verse's own syllable
(`abstract-engraver.js:769-774`). Extended suppresses the literal on all of them; it
strokes an extender for verse 1 only, which is a coverage gap in the extender pass rather
than a second divergence, and costs no bytes against strict.

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

### A tune with no music writes `NaN` into the MIDI tempo

`abc_midi_create.js:21` takes `var tempo = commands.tempo`, and a tune with no music has
none, so `Math.round(60000000 / undefined)` is `NaN` and `toHex(NaN, 6)` pads the STRING
`"NaN"` to six characters and slices it into byte pairs:

    abcjs   %00%FF%51%03%00%0N%aN      ← the tempo is the characters of "NaN"
    abcts   %00%FF%51%03%05%16%15      ← 333,333 microseconds, abcjs's own 180bpm default

`%0N` and `%aN` are not hex. abcjs's own `midiOutputType: "binary"` decoder reads them with
`parseInt(…, 16)` and gets 0 and 10, so the file it hands a host has a tempo of 0x000A0A
microseconds — about 2.6 microseconds per quarter note — rather than the one it meant. **We
decline to reproduce a corrupt file**, exactly as we decline the red `pitch is undefined`
and `clef=x` debug strings above, and write the 180bpm default instead.

*Verified by running `abcjs.synth.getMidiFile` over the corpus: 10 tunes of 231 hit it, all
of them a header with no music. `toHex(NaN, 6)` reproduces `%00%0N%aN` exactly.*

### `getMidiFile` throws on three corpus tunes, and the host gets no file

Not a wrong byte — no output at all. Found by running `abcjs.synth.getMidiFile` over every
tune of the corpus rather than the first of each fixture:

- **A rich `T:` — `e.charCodeAt is not a function`.** The track name goes through
  `encodeString(name, "%01")`, which calls `charCodeAt` on it; a title carrying a font
  change (`$1bold$0`) is an OBJECT, not a string. `visual-misc-06`. *Our own note in
  `src/audio/midi-file.ts` predicted `[object Object]` would land in the track name;
  measured, abcjs does not get that far.*
- **`Cannot read properties of undefined (reading 'el_type')`** on two tunes of
  `abcts-endings`, reachable only past tune 0 — which is why nothing had seen it: the
  string form of `getMidiFile` renders one tune per output SLOT and yields the first only.

We produce a playable file in all three cases: the rich title is skipped for the track name
(a MIDI track name is a byte string, and abcjs's own writer has no way to encode a font
change into one).

*Verified 2026-09-05 by `scripts/harvest-abcjs-midi-corpus.mjs` over 691 tunes; the three
are on `tests/midi-bytes.test.ts`'s `DIVERGENT` list.*

## What abcts adds beyond fixing these

`abcjs-extended` corrects the above, and every correction above is reached by opting out of strict:
styled noteheads, the phrase and tremolo marks, three-quarter-tone glyphs, per-segment lyric
fonts, and the two falsy-zero reserves.

⚠️ **THIS PARAGRAPH ONCE DESCRIBED A THREE-WAY SPLIT, AND THE MEASUREMENT KILLED IT.** It
read that `abc2.1` corrected abcjs's bugs while `extended` went further with the
beyond-standard engraving. Measured 2026-09-04: **every mode branch in `src/` is
`isStrict(mode)`** — one comparison, `core/model.ts`. Not one site ever distinguished the
two, so they were byte-identical on all 691 corpus cases and on every feature the paragraph
named as `extended`-only. Both intended tiers had landed in the same bucket.

**The owner's call was to drop the middle name rather than implement it** (2026-09-04), and
to rename the survivor `abcjs-extended` to say what it is. So there is ONE opt-in and it
carries everything above. `tests/mode-partition.test.ts` holds the two modes apart by NAMED
behaviour, so a future divergence has to be deliberate and gets an entry here.

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
| `abcjs-extended` | abcm2ps and abc2svg behaviour, via the golden sets in abcMusicKit (v1), abcMusicKit2 (v2) and abcMusicKitCpp — observed output only, never source |
