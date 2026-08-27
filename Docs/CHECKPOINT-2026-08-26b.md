# CHECKPOINT — 2026-08-26b

**Branch `main`. Suite 2,325 passing, NO reds and NO expected-fails. Everything pushed.**

## 1. §1 OF THE PREVIOUS HANDOFF IS SPENT — ALL SEVEN ROWS

Six commits, **eight defects**, and only three of the eight are the rows that were written
down. The other five came out of the fixtures written to gate the first three.

| Gate | Then | Now |
|---|---|---|
| SVG bytes, in-repo | 0 of 424 | **0 of 564** (1 ruled divergent) |
| harvested corpus, four axes | 0 of 219 | **0 of 224** |
| `extractMeasures` | 265 files | **270 files, 1,682 measures** |
| warnings | 0 of 507 | **1 of 688**, 45 ratcheted from 14 |
| everything else | 0 | 0 |

Six new fixtures, 140 tunes, every one byte-exact and ratcheted:
`abcts-clef-midmeasure.abc` (22), `abcts-lyric-verses.abc` (12),
`abcts-inline-fields-and-blocks.abc` (15), `abcts-stafflines-and-modifiers.abc` (50),
`abcts-bars-graces-and-groups.abc` (41).

**SEVENTEEN DEFECTS IN ALL** — eight closing the handoff's §1, nine from two sweeps of
territory no earlier sweep had touched.

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

## 7. WHAT IS LEFT

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
