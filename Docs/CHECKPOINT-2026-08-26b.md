# CHECKPOINT — 2026-08-26b

**Branch `main`. Suite 2,377 passing, NO reds and NO expected-fails. Everything pushed.**

## 1. §1 OF THE PREVIOUS HANDOFF IS SPENT — ALL SEVEN ROWS

Six commits, **eight defects**, and only three of the eight are the rows that were written
down. The other five came out of the fixtures written to gate the first three.

| Gate | Then | Now |
|---|---|---|
| **SVG bytes, in-repo** | 0 of 424 | **0 of 635** — 1 ruled divergent |
| harvested corpus, four axes | 0 of 219 | **0 of 226** |
| `extractMeasures` | 265 files | **0 of 270 files, 3,199 of 3,199 rows** |
| **warnings** | 0 of 507 | **0 of 759** — CLOSED, 49 rows ratcheted from 14 |
| everything else | 0 | 0 |

✅ **EVERY GATE IS AT ZERO.** The byte gate spent part of the session OFF zero on purpose,
with eight measured rows NAMED in a fixture rather than left out of the corpus — and all
eight are closed in §8. **A row named in a fixture can report its own closure; one left out
of the corpus cannot**, which is the rule two sessions have now paid for.

Eight new fixtures, 198 tunes:
`abcts-clef-midmeasure.abc` (22), `abcts-lyric-verses.abc` (12),
`abcts-inline-fields-and-blocks.abc` (15), `abcts-stafflines-and-modifiers.abc` (50),
`abcts-bars-graces-and-groups.abc` (41), `abcts-void-notes-and-stray-ties.abc` (15),
`abcts-text-udef-parts-overlays.abc` (43).

**TWENTY-SEVEN DEFECTS IN ALL** — eight closing the handoff's §1, nineteen from three sweeps
of territory no earlier sweep had touched and the ladders they opened.

## 2. THE EIGHT

**(a) AN INLINE `[K: … clef=]` PITCHED THE WHOLE MEASURE.** `layoutMeasure` was handed
`clefInForce` AFTER this measure's change had been applied, so `CD[K:C bass]EF|` drew all
four notes in bass where abcjs draws C,D in treble — 46.5px, six staff steps.

⚠️ **"LEADS THE LINE" IS NOT "LEADS THE MEASURE".** `clefLeadsHere` answers which clef the
PREFIX prints, and its `!(measureIndex === 0 || startsSystem)` clause is TRUE for every
mid-line measure — so `clefAtMeasure` carries the new clef there and is the wrong array to
read. `clefLeadsMeasure` asks the measure's own question.

⚠️ **AND THE HANDOFF'S FIRST HYPOTHESIS WAS BACKWARDS IN BOTH DIRECTIONS.** It read as
though the change never reached the layout; the `ZZCLEF` probe then said the whole measure
was in the NEW clef and pointed at `clefAtMeasure[from]`. The change reached the layout TOO
EARLY, and the machinery to switch mid-measure (`clefNow`, `drawClefBefore`) was already
there and already correct. **A probe that names the symptom has not named the cause.**

**(b) A BEAM'S DIRECTION READ THE VOICE'S CLEF.** `beamDirections` took the declared clef
for its whole walk, so on `CDEF[K:C bass]GABc|` the second group averaged as though it were
still treble, beamed UP where abcjs beams DOWN, and the ledgers that came with it were
30.83px of page. abcjs has no such choice: `averagepitch` is stamped by the PARSER, where
`getCoreNote` reads `multilineVars.clef`.

**(c) A LINE OPENS IN THE RUNNING CLEF, AND IT LEAKS ACROSS VOICES.** `startNewLine` opens a
line with `staves[voice.staffNum].clef` IF THAT IS DEFINED, and otherwise with
`multilineVars.clef` (`abc_parse_music.js:961`) — a single global the last `K:` or
`[K: … clef=]` replaced, wherever it was written. `staves[n].clef` comes from ONE place, a
`V:… clef=` declaration (`abc_parse_key_voice.js:858`).

Measured on a seven-rung ladder BEFORE a line was written: `V:1` carrying `[K:C bass]`
mid-measure and a plain `V:2` gives `clefs.G clefs.F clefs.F`; the control with no change
gives `clefs.G clefs.G`; declaring `V:1 clef=treble` / `V:2 clef=treble` protects both.

⚠️ **AND THE FIRST CUT MOVED NOTHING**, because the guard was `voice?.clef === undefined`
and an undeclared voice's clef is NULL in this model. **A rule nobody passes looks exactly
like a rule that does not apply** — the same tell as "when a change to an input moves
nothing, the output is not reading that input", one level in.

**(d) A CLEF CHANGE WITH NOTHING AFTER IT WAS DROPPED.** `CDEF|` then a standalone
`K:C clef=bass` line — or `CDEF|[K:C bass]` — left a pending change no measure would ever
close over. abcjs draws a cautionary `clefs.F` after the last note at the same page height,
and the next VOICE's line opens in it.

⚠️ **BEFORE BUILDING PLUMBING, GREP FOR IT** — the previous handoff's third rule, and it
paid again. `layoutMeasure` already takes a `nextClefChange` and already draws exactly this
cautionary for a change leading the NEXT system. Only the producer was missing.

⚠️ **AND IT GOES IN `finish()`, NOT `closeUnterminatedMeasure`**, which is also every LINE's
flush. Put there it stamped `CDEF| / K:C clef=bass / CDEF|`'s change onto measure 0 and
nulled the pending, so measure 1 lost the change it was waiting for. **A rung of the same
ladder that had been byte-exact is the only thing that said so.**

**(e) A VERSE'S LANE IS THE NOTE'S, NOT THE VERSE'S.** abcjs has no verse index to offset
by: `elem.lyric` is the NOTE's own dense array, so a note the first `w:` line never reached
puts its SECOND verse's syllable on the first ROW. `w:a b` over `CDEF|` then `w:x y z w`
draws `z` and `w` at `y="96.79"`, the same lane as `a`/`x`. Ours offset by the verse index
and dropped them a whole `lyricLineStep` — the handoff's 20.4px.

**It looks like the engraving anyone would want. It is not what abcjs does.**

**(f) THE STRICT `_` IS A DIVIDER, NOT "A HOLD FOLLOWS".** `addWord` takes
`div = words[i]` — the character that ENDED the word — so `a_` is
`{syllable:'a', divider:'_'}` while `a _` is `{syllable:'a', divider:' '}` with a bare skip
after it (`abc_parse.js:236-241`). Only the attached form prints an underscore. Ours derived
it from "a melisma token follows", true of both spellings, so `w:a _ _ _` drew `a_`.

⚠️ **INVISIBLE UNTIL (e) CLOSED.** The nine-shape sweep that found it was written to CHECK
(e), and this row could not have differed while every verse sat in the wrong lane.

**(g) A MID-MEASURE `[Q:]` DRAWS WHERE IT STANDS.** Same rule `[K:]` and `[M:]` already had,
and the machinery beside them. abcjs's group order on `CD[Q:1/4=90]EF|` is
`note note tempo note note bar` where ours was `tempo note note note note bar`.

**(h) A `%%text` BLOCK BEFORE THE MUSIC SPENDS ITS ROWS ONE AT A TIME, BEFORE
`staffSeparation`.** `topTextBlock` passed `[]` where `appendFreeText` takes the advances
array, under a comment saying the block is `tune.lines`'s business from there — true of the
ROWS and not of the page's cursor. Ours walked `15 → +7.56 → +61.33 → +33.77` where abcjs
walks `15 → +7.56 → +10.5 → +23.27 → +61.33` (`draw/draw.js:44-58`). Same total, different
doubles — `117.65999999999998` against `117.66` — and one ULP of the root `height`.

**A SUM CANNOT SEE AN ORDER**, for the fifth time on this branch.

## 3. AND §1(d) WAS ALREADY EXACT

The left/right annotation spacing the handoff measured at 6.74px closed under one of this
session's earlier landings and NOTHING SAID SO. **A ROW WITHOUT A GATE CANNOT REPORT ITS OWN
CLOSURE** — the second time in two sessions. Tunes 6-10 of
`abcts-inline-fields-and-blocks.abc` are its gate now.

## 4. THE RULES THIS SESSION ADDS

⚠️ **A GUARD NOBODY PASSES LOOKS LIKE A RULE THAT DOES NOT APPLY.** `=== undefined` against
a `null` field made a correct rule dead, and the measurement — "the change moved nothing" —
is the same measurement a wrong hypothesis produces. Check the guard's TYPE before
re-thinking the rule.

⚠️ **A FIXTURE FINDS WHAT A LADDER CANNOT, AND A SECOND SWEEP FINDS WHAT THE FIRST HID.**
Ten control shapes closed six rows of (a); the fifteen-tune fixture then opened (b) and (c)
the moment they were a page, because the ladder's shapes were all one bar and one voice. And
(f) was invisible until (e) closed.

⚠️ **PUT A NEW WRITE WHERE THE THING ENDS, NOT WHERE IT LOOKS LIKE IT ENDS.**
`closeUnterminatedMeasure` reads like end-of-voice and is every line's flush.

⚠️ **A GATE'S TIMEOUT HAS TO TRACK THE CORPUS.** The ranked table renders every case twice
and crossed vitest's 5s default the run after the corpus grew. **A gate that fails for
growing punishes the one thing this repo wants.** 15s now.

## 5. THE HARNESS — ONE NEW PROBE AND ONE NEW SCRIPT

- `/tmp/gp/abcjs/src/write/renderer.js` carries **`ZZMOVEY`** on `Renderer.prototype.moveY`,
  printing `before + em × numLines = after` and the call site. Beside `ABCTS_Y=1` it prints
  the two page walks term for term, which is what located (h) in one run.
- A **sweep runner** — write `<i>.abc` + `names.json` into a directory, then one script
  renders both engines and prints `exact` / `DIFFERS` per row. Recreate it from
  `zzdecs.ts`'s contract; the two traps it is built around are the handoff's own:
  ⚠️ **`printf '%b'`, never `'%s'`**, and ⚠️ **check the abcjs SVG EXISTS** (the runner exits
  if any reference is empty). Every command runs from the repo root — `cd` bit again today,
  from `/tmp`.
- **`git stash` IS THE PROOF A SWEEP RAN.** Ten rows came back `exact` on the first sweep of
  the day; stashing the fix and re-running turned six of them `DIFFERS`, which is the only
  thing that distinguished a real fix from a harness that never rendered.

## 6. AND THEN TWO SWEEPS OF UNTOUCHED TERRITORY — NINE MORE DEFECTS

**72 shapes, five ladders, three fixtures, nine defects.** The sweep runner is
`scripts/zzsweep.ts` now rather than a thing each session rebuilds in `/tmp`.

### 6.1 THE FIRST SWEEP — staff lines, `%%map`, `V:` modifiers, microtones, `%%MIDI`

33 of 36 exact on the first run: `%%repeat`, `%%map`, `%%percmap`, every `V:` modifier and
all four microtone spellings were already right.

⚠️ **`V:… stafflines=0` DRAWS ALL FIVE AND `K:C stafflines=0` DRAWS NONE.** abcjs's `V:`
path is guarded `if (multilineVars.currentVoice.stafflines)` (`abc_parse_music.js:1019`) and
`0` is FALSY; the `K:` path writes `multilineVars.clef.stafflines` outright with no guard at
all (`abc_parse_key_voice.js:428`). **Two spellings of one setting that disagree at zero and
nowhere else** — and the THIRD time on this branch that a declared 0 is not declared at all,
after a stem's `bottom: p1 - 1` and a mezzosoprano clef's edge. Both of those were written up
as belonging to their own site. **It is the rule.**

⚠️ **AND A GREEN TEST CARRIED THE INFERENCE, THE SIXTH ON THIS BRANCH** —
`rules("V:1 stafflines=0")).toEqual([])` under a comment reading "zero draws no staff at
all", which is true of the `K:` path and our own reasoning on the `V:` one.

⚠️ **A MID-TUNE `stafflines=` CHANGES THE STAFF AND DRAWS NO CLEF.** A `K:` modifier with no
clef NAME still writes the running `multilineVars.clef`, which `startNewLine` copies — but
`appendStartingElement('clef', …)` is guarded on `foundClef`, which only a NAME sets. New
`Measure.clefChangeSilent`, a running `clefInForce` on the builder, and a staff line count
that reads the clef the SYSTEM opens in.

⚠️ **A CENTRED `Z`'S GLYPH `dx` WAS RE-DERIVED** — `(x + mm) - x` against abcjs's carried
`mmWidth`. **AND THE OBVIOUS FIX MOVED NOTHING**: `centerWholeRests` SHIFTED where
`absolute-element.js:238` ASSIGNS, which is a real divergence and is landed, but it was not
this defect. The two look alike and only one was it.

### 6.2 THE SECOND SWEEP — barlines, graces, chords, tuplets, `%%score`, accidentals

**One defect in 36.** ⚠️ **`:|:` IS A RIGHT REPEAT AND A WARNING, NOT A DOUBLE REPEAT.**
`getBarLine`'s `:|` case falls through to `{len: 2, token: "bar_right_repeat"}` for anything
that is not `]` or `|` (`abc_tokenizer.js:175-203`), so the trailing `:` is left in the
stream and re-enters as `{len: 1, warn: "Unknown bar symbol"}`. `:||:` (len 4) and `::`
(len 2) ARE doubles and were both already exact — **the three spellings of one barline agree
everywhere except the shortest**, which is why a greedy run looked right for as long as it
did.

### 6.3 AND THE FIXTURES OPENED FOUR WARNING ROWS THE BYTE GATE CANNOT SEE

Both sweeps were byte-exact and their fixtures still moved the warnings gate from 2 to 6.
Fixing those found a fifth defect that had been wrong on every multi-tune file in the corpus.

- **abcjs KNOWS `%%map`** — `case "map": case "playtempo": case "auquality":
  case "continuous": case "nobarcheck"` are RECORDED under a `TODO-PER`
  (`abc_parse_directive.js:1214-1220`). Ours warned on all five.
- **`%%percmap`'S TWO FAILURES BOTH WARN**, at a literal column 8, and ours dropped the
  entry in silence. **A feature's REFUSALS are part of its contract.**
- **"UNKNOWN CHARACTER IGNORED" IS PER CHARACTER AND IS A COMPLEMENT** — everything but
  space and backtick. Ours warned only for a stray octave mark, once per token.
- **A BROKEN-RHYTHM MARK WITH NO NOTE BEFORE IT IS ONE OF THEM**, consuming ONE character.
  Ours raised a `broken-rhythm-without-note` of its own — **a code no formatter maps, so it
  was silent** — and swallowed the whole run.
- **AN UNCLOSED CHORD QUOTE WARNS AT THE OPENING QUOTE.**
- **A DURATION NO NOTEHEAD CAN SPELL WARNS, AND THE TEST IS A TABLE** — every power of two
  from a half to a 64th with five dots, asked BEFORE the broken-rhythm scaling and the
  tuplet ratio.
- ⚠️ **AND A TUNE'S LINE NUMBERS CONTINUE THE FILE HEADER'S DIRECTIVE LINES.** Measured
  three ways — a 4-line header reports the tune's fifth line as 9, a 19-line header reports
  it as 24, and five `%` COMMENT lines add nothing. **The FIRST tune has already absorbed
  the header**, so adding it again double-counts. ⚠️ **The first cut counted header LINES
  rather than header DIRECTIVE lines and took the gate from 2 to 9** — right on the fixture
  that named it, wrong on the one beside it, and the RATCHET is what said so.

⚠️ **AND THE WARNINGS RATCHET HELD 14 ROWS WHILE 39 AGREED.** Twenty-five could have
regressed in silence — the same shape as the byte gate holding 4% of what was green. The
gate was built to say so and its own message says so; it just had to be read. 45 now.

**ONE ROW STAYS OPEN AND IS WRITTEN UP IN THE TEST RATHER THAN GUESSED AT**: `C2|[-1 D2|]`
wants two more "Unknown character ignored" after the chord fails, where our tie and digit
arms consume them silently. Making either arm warn unconditionally is a change with reach —
our tokenizer consumes things abcjs's loop does not — so it wants a ladder of its own.

## 7. AND THE WARNINGS GATE CLOSED, THEN A THIRD SWEEP OPENED EIGHT NAMED ROWS

### 7.1 THE LAST WARNING ROW WAS WORTH TWO GEOMETRY DEFECTS

`C2|[-1 D2|]` had been written up as wanting a ladder rather than a guess. It got one:

⚠️ **A DIGIT AFTER A NOTE'S LENGTH AND ITS TRAILING SPACE VOIDS THE WHOLE NOTE.**
`getCoreNote`'s digit case leaves `state = 'broken_rhythm'` after a fraction, and the digit
case has no arm for that state: `else return null` (`abc_parse_music.js:1194-1210`). `C2 1 D2|`
is ONE note in abcjs — the `D` — and three warnings; ours drew both. `C 1 D|` keeps its `C`
and `C2 x1 D2|` keeps it too, which is what pins the rule to the PAIR rather than the digit.

⚠️ **A SPLIT TIE TAKES THE 20px STUB WHERE A SPLIT SLUR TAKES THE PREFIX.**
`setStartX(this.startlimitelem)` is called only in the branch that opens a SLUR — so which
arm `calcX` reaches is decided by how the curve was WRITTEN, a DIFFERENT question from
`isTie`, which is recomputed at draw time from the two pitches. They part company on exactly
one shape: a `-` between different pitches.

⚠️ **AND A CHARACTER THAT WARNS IS OWNED BY NOTHING**, which `extractMeasures` said from the
other side once the fixture existed — `-CDEF|` against our `CDEF|` (a successful `-` is part
of the note) and `CDEF|` against our `1CDEF|` (a stray digit is not). **Two rows, opposite
directions, one rule.**

⚠️ **AND THE WARNINGS RATCHET HELD 14 ROWS WHILE 39 AGREED.** Twenty-five could have
regressed in silence. The gate was built to say so and its own message had been saying so.

### 7.2 THE THIRD SWEEP — 31 of 36 EXACT, AND THE OPEN ROWS ARE THE FINDING

`%%text`/`%%center` variants, spacing directives, multi-voice lyric alignment, `U:`
redefinitions, `P:` part sequencing, `&` overlay boundaries. Every `P:` shape, every `&`
overlay shape, every multi-voice lyric shape, `%%staffsep`, `%%sysstaffsep`, `%%musicspace`,
`%%topspace` and `%%titlespace` were already right. Two closed — an unknown `U:` macro warns
and expands to nothing, and a bare `%%center` is a centred EMPTY line — and eight are named.

## 8. THE EIGHT ROWS, AND WHAT CLOSING THEM COST

All eight closed. **Two of the three families had a MEASURED WRONG ANSWER recorded beside
them first**, and that is what made the second attempt cheap rather than what made it slow.

### 8.1 AN EMPTY `%%text` MOVES TWICE THE FONT SIZE — three changes, not one

`FreeText`'s first arm is `if (text === "") rows.push({ move: font-size * 2 })` with NO text
row beside it (`free-text.js:8-10`), so **a blank row is TALLER than a full one**: 8.23px.

⚠️ Spending it ALONE takes the page 42px SHORT. The `heading` element was built only for a
block with INK, so an inkless one produced no `musicOnlyTop`, `walksTopBlock` was false, and
the page walk read ONE advance of 68.89 — `spacing.music + staffSeparation`, no block at all.
⚠️ And keying that guard on `block.height` is TOO BROAD: the height carries the unconditional
`spacing.music`, so every tune got a zero-size heading element, two `begintext` fixtures came
off byte-exact and six visual baselines moved. `blockHasRows` is the narrower question.

⚠️ **AND AN EMPTY `%%center` IS THE OTHER ARM AND COSTS NOTHING.** `addCentered` pushes an
ARRAY, so `info.text` is undefined and `FreeText` falls past that branch to its final `else`,
which measures the empty string. **Two spellings of "nothing to say" that differ by 42px.**

### 8.2 A `%%vskip` BEFORE A `%%text` IS THAT BLOCK'S FIRST ROW

`pushLine` stamps a pending vskip onto whatever LINE comes next, text lines included, and
`FreeText(info, vskip)` pushes `{move: vskip}` ahead of everything (`tune-builder.js:904-908`,
`free-text.js:5-6`). **The page TOTAL was right to the digit on every rung** and the text sat
20px high — a sum cannot see an order, and that is why this one was safe where 8.1 was not.

Its own ladder then opened two more: **a `T:` after `K:` but before any NOTE is a top-block
subtitle** (`addSubtitle` is a bare `pushLine`, so placement follows where the line lands;
ours tested `bodyStarted`, which the `K:` itself sets), and **a `%%vskip` before a subtitle is
consumed and THROWN AWAY** — the controller builds `new Subtitle(…)` with no vskip argument
(`engraver-controller.js:239`) where the FreeText arm one line below takes one. ⚠️ The
consuming is the point: left pending, the STAFF takes it.

### 8.3 A CLOSE DECORATION'S ONE ULP — and the note that had written the field off

`printSymbol` draws at `calcY(offset + ycorr)`, one sum and one multiply, where the emitter
given only a y spends the correction as a LENGTH. `PlacedGlyph.drawPitch` IS the field.

⚠️ **A note here said it was NOT**, written after the sforzato landed 23.25px low. The value
passed had been `toStep(closeY)` where the emitter wants an abcjs PITCH, and **23.25 is
`PITCH_ORIGIN * spacePerStep` exactly**. **A number that is exactly one constant is a UNIT
ERROR, not a rebuttal** — and it had been allowed to stand as a rebuttal, in a note, which is
the same failure mode this branch has been bitten by five times in the other direction.

### 8.4 AND THE LAST ROW WAS TWO DEFECTS, THE SECOND HIDING BEHIND THE FIRST

A `%%text` between two VOICES. Its ULP of root height was the **trailing block's rows being
summed instead of spent one at a time** — the same hole `topTextBlock` had before the
`%%begintext` ULP, one block over. Once that closed, the byte comparison moved from offset
153 to 452 and showed the real one: **the staff line ran to 219.76 where abcjs runs it to
685.** A block written INSIDE the system counts as trailing, so the line is not the LAST line
and abcjs justifies it; `score.textBelow` never saw that one because it lands in
`blocksAfterLastSystem`. Three rungs, and only the middle one moved.

⚠️ **THE SECOND WAS ONLY REACHABLE ONCE THE FIRST CLOSED.** A single-number diff hands you
one defect at a time, which is the argument for it.

## 9. THE INLINE `U:` RULING — the FEATURE stays, as a MODE SPLIT

**abcjs HAS NO INLINE `U:` AT ALL.** `letter_to_inline_header` switches on exactly eight —
`[I: [M: [K: [P: [L: [Q: [V: [r:` (`abc_parse_header.js:347-410`) — so `[U:n=!accent!]` is
read as a CHORD, fails, and yields seven warnings, an invisible barline carrying the
`!accent!`, and four plain notes. ABC 2.1 §4.19 allows any body field inline.

⚖️ **OWNER'S RULING, 2026-08-27: *"we should support U:"*.** The SPLIT is how it stays:
strict reproduces abcjs because that is what strict is for, and `abcjs-extended` define
the macro. A HEADER `U:` works in both, abcjs having that one. Both corpora write only those
eight letters inline, so the restriction costs nothing measurable.

⚠️ **AND THE LEXER CHANGE ALONE WAS NOT ENOUGH.** An accidental with no note letter after it
is a failed attempt too — `getCoreNote` leaves `state = 'pitch'` and `isComplete` answers
FALSE for it, so anything but a pitch letter returns null and every character of the attempt
warns on its own. The `=` of `n=!accent!` is warning five of seven, and ours held the natural
PENDING and stamped it on the `C` four characters later.

⚠️ **AND MY FIRST MODE PROBE LIED, BECAUSE I INVENTED THE MODE STRINGS.** It reported all
three modes identical and the split not working; the modes are `abcjs-strict`, `abcjs-extended`,
`extended` and I passed `abcjsStrict`/`abc2_1`, so `isStrict` answered false everywhere and
the probe measured the default twice. The byte gate had already said otherwise. **A probe
that disagrees with a gate is the PROBE's problem until proven otherwise.**

## 10. WHAT IS LEFT

### 1. THE SWEEP'S REMAINING TERRITORY, AND THE YIELD IS FALLING

Everything the previous handoff named is now swept: staff-line counts, `%%repeat`,
`%%map`/`%%percmap`, `V:` modifiers past `style=`, microtones, `%%MIDI` against the DRAWING,
and a first pass at feature boundaries — plus barlines and repeats, grace-note edges, chord
symbols, tuplet shapes, `%%score`/`%%staves` grouping, accidental propagation, broken rhythm
and page directives.

**The yield fell from one defect per four shapes to one per twelve, then one per thirty-six**
— and the SECOND sweep's single find was a barline spelling, not a feature. What has NOT
fallen off is the FIXTURE: nine of the seventeen defects came from turning a closed row into
a page, and the last four came from a gate the sweeps were not aimed at.

**So the next unit is probably not another 36 shapes of the same kind.** Untouched still:
`%%text`/`%%center` variants, `%%staffsep`/`%%sysstaffsep`/`%%vskip` combinations, multi-voice
lyric alignment, `U:` redefinitions, `P:` part sequencing, and the boundary between an
`&` overlay and everything else.

### 2. THE `ponytail:` LEDGER — 100 ENTRIES

`grep -rn "ponytail:" src tests scripts`. Read each against the OUTPUT, not the code beside
it.

### 3. TWO RULED DIVERGENCES — decisions, not work

`Docs/ABCJS-DIFFERENCES.md` carries both. Unchanged.

### 4. THE `abselem` DECISION IS THE OWNER'S

Unchanged since 2026-08-21. Do not start it.
