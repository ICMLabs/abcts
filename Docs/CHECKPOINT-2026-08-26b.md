# CHECKPOINT — 2026-08-26b

**Branch `main`. Suite 2,232 passing, NO reds and NO expected-fails. Everything pushed.**

## 1. §1 OF THE PREVIOUS HANDOFF IS SPENT — ALL SEVEN ROWS

Six commits, **eight defects**, and only three of the eight are the rows that were written
down. The other five came out of the fixtures written to gate the first three.

| Gate | Then | Now |
|---|---|---|
| SVG bytes, in-repo | 0 of 424 | **0 of 473** (1 ruled divergent) |
| harvested corpus, four axes | 0 of 219 | **0 of 222** |
| `extractMeasures` | 265 files | **268 files, 1,565 measures** |
| everything else | 0 | 0 |

Three new fixtures, 49 tunes, every one byte-exact and ratcheted:
`abcts-clef-midmeasure.abc` (22), `abcts-lyric-verses.abc` (12),
`abcts-inline-fields-and-blocks.abc` (15).

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

## 6. WHAT IS LEFT

### 1. THE SWEEP HAS MORE TERRITORY — unchanged, and now the whole list

The three sweeps of 2026-08-26 plus today's five ladders have not touched: `%%MIDI` and
audio-facing directives against the DRAWING, `V:` modifiers beyond `style=`, `%%repeat`,
staff-line counts, `%%map`/`%%percmap`, microtones beyond the quarter-tone pair, or anything
at the boundary between two features. **The yield today was roughly one defect per six
shapes and it has not fallen off.**

### 2. THE `ponytail:` LEDGER — 100 ENTRIES

`grep -rn "ponytail:" src tests scripts`. Read each against the OUTPUT, not the code beside
it.

### 3. TWO RULED DIVERGENCES — decisions, not work

`Docs/ABCJS-DIFFERENCES.md` carries both. Unchanged.

### 4. THE `abselem` DECISION IS THE OWNER'S

Unchanged since 2026-08-21. Do not start it.
