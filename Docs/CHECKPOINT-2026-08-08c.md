# abcts — Checkpoint, 2026-08-08c — THE AUDIO ARC

Supersedes `CHECKPOINT-2026-08-08b.md` for the STATE. That file keeps findings 147–150 and
**the geometric tail's four findings**, which are done and closed; `-08-08.md` keeps the
ARC DECISION verbatim; `-08-07b.md` keeps 134–146 and the method; `-08-06.md` keeps **THE
HARNESS**. Earlier ledgers as listed there.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔀 THE TARGET IS abcjs 6.7.0 AS OF 2026-08-08 (Lance's authorisation, same day)

6.7.0 shipped mid-arc. Another agent regenerated the sibling corpus's 505 goldens from it;
the in-repo 174-fixture corpus was then regenerated too, `abcts.config.json`'s `abcjsRef`
moved, and the engine was brought onto it.

**MEASURED BEFORE ANYTHING WAS PORTED, which is what made it a one-line job rather than a
project.** Regenerating the 174 goldens changed **166 of 178 FILES** but moved only
**THIRTEEN fixtures** on any geometric axis — every one by exactly `oy = -61.33`, with
`dy`, `dx` and `ox` at 0.00. A rigid shift and nothing else. 61.33 is
`spacing.staffSeparation`'s default to the hundredth.

The cause is one new `else` arm in `draw.js`:

```js
if (staffgroups.length >= 1)
  addStaffPadding(renderer, renderer.spacing.staffSeparation, …);
else if (line > 0) // This happens if there is non-music stuff before the first staff line
  renderer.moveY(renderer.spacing.staffSeparation)
```

A non-music LINE before the first staff now costs a whole staff separation; before, nothing.
**TWO things make `line > 0` true and the second is the one that is easy to miss:** a
`%%text`/`%%begintext` block, OR **a second `T:`** — abcjs's first `T:` is the title, drawn
from `metaText` before the loop, while every later one becomes a `{subtitle}` LINE. Seven of
the thirteen were the first case, six the second.

`!class=name!` came with it: abcjs sets `el.extraClass` and never pushes it into
`el.decoration` (`abc_parse_music.js:229`), in the same `if` as `!style=…!` one arm along.

**AND WHAT DID NOT MOVE MATTERS AS MUCH.** `tests/synth/flattener.test.js` and
`write/creation/glyphs.js` are **BYTE-IDENTICAL** between the versions, so the audio oracle
and both glyph tables needed no regeneration — the 54 audio cases and every ratcheted pass
are untouched. The synth surface changed in two places, neither reachable by any test:
`chord-track.js` accepts `♭`/`♯` spellings and `repeats.js` swaps `startEnding` /
`startRepeat` on a bar that is both.

**`abcjs-6.6.3` STAYS VENDORED beside `6.7.0`**, and the sibling `dump-svg.js` takes
`ABCJS_VERSION` — that is how the two were measured against each other, and how any citation
written before 2026-08-08 (they all name 6.6.3 line numbers) can be checked rather than
guessed at.

**ONE TARGET IS OPEN FROM IT.** `extra-class`, a new 6.7.0 fixture, sits at `oy = -3.88` —
one PITCH, uniform. Its tune is `!class=alice!A!class=bob!!>!T[dfa]`: a chord carrying BOTH
an accent and a trill, which nothing else in either corpus does. `!class=…!` is accounted
for and verified by parse, so the residual is the two-decoration STACK on a chord.

---

## 🔎 THE HEADLINE: GEOMETRY IS DONE. AUDIO EXISTS, HAS A GATE, AND IS AT 28 OF 54.

| axis | standing |
|---|---|
| suite | **954 of 954. NO REDS.** |
| **audio ranked table** | **26 of 54 differ** — from 54 of 54 when it opened |
| **audio PASSING** | **28** and ratcheted |
| pixel ranked table | **1 of 120** — `extra-class`, recorded and named |
| harvested ranked table | **0 of 174** — against the **6.7.0** oracle |
| staff-line gate | **0 of 41** |
| above-lane gate | 12 controls |
| ycorr gate | 20 controls |
| gates | **6** |

---

## THE AUDIO ARC, in the order it was built

### 1. THE ORACLE FIRST — `npm run harvest:audio`

54 cases, 1,930 events, one JSON file each under `tests/corpus-audio/`: the ABC, the
options that case passes to `setUpAudio`, and the expected `{tempo, instrument,
totalDuration, tracks[][]}`. Harvested by EVALUATING `flattener.test.js` with `describe`,
`it` and `doFlattenTest` replaced — the tunes are `var abcX = "…" + "…"` and the answers
`var expectedX = {…}`, and only the `it()` bodies pair them, so a regex would have to
re-implement the pairing and would get the `options` third argument wrong.

**NOT harvested, and the script says why where a reader will find it:** `timing.test.js`
reads `currentTrackMilliseconds` off the laid-out voice (the internal tree again);
`midi.test.js` compares a serialized MIDI FILE as a `data:` URI (a second surface on top of
this one); and `flattener.test.js`'s own two `doTimingObjTest` cases assert `setTiming()`,
whose rows carry `line`, `left` and `endX` beside the pitches.

### 2. THE RANKED TABLE — `/tmp/abcts-audio-ranked.txt`

Per case, the FIRST event that diverges, both sides printed, sorted by how far in the
divergence is. Structurally-wrong cases at the top, nearly-right at the bottom. No
tolerance: a pitch is right or it is not. `PASSING` is the ratchet.

### 3. `src/audio/flatten.ts` + `src/audio/chord-track.ts`

Runs over abcts's PARSE TREE, not the laid-out one — abcjs sequences its visual object
because that is what `Tune` has to hand, and pays for it (`preProcess` mutates the tree it
was given). So audio does not depend on the renderer. `keyFifths` moved from
`renderer/layout.ts` to `core/model.ts` for the same reason.

Time is abcjs's: WHOLE NOTES × 1,000,000, rounded at every step, because its goldens carry
the result — a triplet eighth is `0.083333` and the third of them `0.083334`.

---

## THE FINDINGS — every one measured, none guessed

### THE CHORD TRACK IS A WHOLE VOICE, and it blocked 25 cases

A `"C"` above the staff does not sound where it is written. abcjs collects a MEASURE's
chords, expands them across that bar's eighth-note grid, and plays a boom-chick pattern
chosen by the METER over the grid. Ported whole: `interpretChord`, the 100-row
`chordIntervals`, 20 meter patterns, `expandCurrentChords`, `resolvePitch`, `parseGChord`.

- **ONE TRACK, FROM ONE VOICE** — the first voice with chords gets it and `finish()` closes it.
- **A SHORT BAR THROWS THE PATTERN AWAY** — a pickup or a split bar gets a plain
  alternating chick for the beats actually present.
- **Only the FIRST note of a chord is a bass note**, or a `boom&chick` slot writes the whole
  triad at the bass volume and on the bass instrument.
- **A BREAK HAS NO BOOM.** `interpretChord('break')` is `{ chick: [] }` — the KEY is absent,
  and `writeNote` skips an undefined pitch. A boom of 0 wrote a track full of MIDI note 0
  and `chordTrackEmpty` then found notes and kept it.

### A DYNAMIC IS A STRESS TABLE, NOT A VOLUME

`!p!` replaces the three beat-stress figures outright, so the passage gets quieter without
losing its accents. **And abcjs's own table is unreachable past `f`:** it tests
`indexOf('f')` before `ff`/`fff`/`ffff` and nothing else in the list contains an `f`, so all
four take the `f` row. `flatten-dynamics3` expects 105/95/80 where `!ffff!` is written.

### THE HAIRPIN SEARCH IS SCOPED TO THE SOURCE LINE, and its close lands on the BARLINE

abcjs sequences line by line, so `numNotesToDecoration` and `endingVolume` cannot see past
the line they were called on: on `flatten-dynamics`, a `!diminuendo(!` reaches its close but
NOT the `!pppp!` two elements later, because that is the next line's first note. And `!<)!`
written at the end of a bar attaches to the BAR in both engines — probed, abcjs logs
`["crescendo)"] el bar` — and the search still finds it, because it tests every element's
decoration while counting only notes.

### A SPACER SOUNDS NOTHING, TAKES NO TIME, AND STILL COUNTS

Three answers, and we had one. `y` is skipped where the sequence is BUILT; but
`setDynamics(elem)` is called on the line ABOVE that guard, and `numNotesToDecoration` walks
the RAW voice where a spacer is still an `el_type: "note"`.

### A MEASURE BOUNDARY IS NOT A BARLINE

Our model closes a measure at a line break whether or not a `|` was written. Emitting a bar
row either way restarted the beat-stress clock at every line end. **And
`computePickupLength` stops at a BARLINE, not at a measure** — `flatten-treble-8` is six
notes on six lines with no `|` at all, so abcjs's pickup is 0.75 and the whole tune takes
the weak-beat volume.

### AN INLINE `[Q:]` IS THE PAGE'S TEMPO AND NOT THE CLOCK'S

Measured on a control pair: abcjs DRAWS a head tempo mark for `[Q:1/4=129]CDEF` and its
`setUpAudio` reports `tempo: 180`. `metaText.tempo` is written by the FIELD parser and an
inline field never reaches it. `Score.tempoInline` is the model's answer.

**AND A TEMPO CHANGE SCALES THE CLOCK, NOT THE NOTE** — abcjs keeps the first tempo and
stretches every later duration by `startingTempo / qpm`.

### THE CLEF'S OCTAVE REPLACES THE VOICE'S TRANSPOSE

Separate `transpose` ELEMENTS, and the flattener's `case "transpose"` ASSIGNS. The
`else if (active)` arm cancels a `+8` when a later line returns to a plain clef, and cannot
fire on a line whose clef states its own transpose.

**AND `V:… octave=` IS ALREADY IN THE PITCH, in BOTH engines**, where `Voice.octaveShift`'s
comment says it is not. Reading both put a voice an octave and a half low.

### Smaller, and each one a row of the table

- A QUARTER TONE IS A WHOLE PITCH AND A PITCH BEND — `{pitch: 71, cents: -50}`, never
  `70.5`. abcjs decides which way by testing the pitch's decimal AS A STRING for `.25` or
  `.75`, which is why its quarter tone is 0.25 and not 0.5: the fraction is a MARKER, and
  0.5 would put a half-sharp above C and a half-flat below D on the same 60.5.
- A REST CARRIES ITS CHORD SYMBOL, and so does the silenced half of a tie —
  `chordTrack.processChord` runs before `writeNote` looks at a pitch. Four cases.
- `%%MIDI` SPLITS BY POSITION, not by header: `hasBeginMusic()` is a MUSIC LINE, which `K:`
  alone does not start. `%%MIDI program 3` on the line after `K:C` is a TUNE setting.
- A CHORD SOUNDS FROM THE BOTTOM UP — abcjs sorts `elem.pitches`, so `[cD]` emits D then c.
- A MULTI-MEASURE REST IS AS LONG AS IT SAYS — `Z4` is four bars, written as one.
- `chordsOff` has to be plumbed, or `%%score`'s voices get a track they should not have.

---

## WHAT THE TABLE SAYS NOW, and it is the work list

```
 4 cases   1 tracks vs 3/2    `&` overlay voices are not split into their own voices
 3 cases   instrument 0/128   `%%MIDI drummap` + `%%percmap` — the percussion track
 2 cases   1 tracks vs 2      the DRUM track (`%%MIDI drum`), which does not exist at all
 3 cases   style:"decoration" trills, mordents, turns and rolls become RUNS of 1/32 notes
 2 cases   style:"grace"      grace notes
 2 cases   mid-tune %%MIDI    `Measure.midiCommands` is parsed; the flattener ignores it
 1 case    volume per pitch   per-note dynamics inside a chord (`volumesPerNotePitch`)
```

### THE REPEAT RESOLVER — PORTED, and this is what the translation cost

`repeats.js` is a two-pass algorithm and the second pass is short. Pass one records only the
INTERESTING bars into `sections`, seeded with `{type:'startRepeat', index:-1}`:

- `|:` or `::` → `startRepeat`
- `:|` or `::` → `endRepeat`, **and if the previous section is already an `endRepeat`,
  a synthetic `startRepeat` is pushed first at the same index** — two `:|` in a row is a
  notation error and this is the recovery. `no-start-repeat-repeat` is that case.
- `|1` / `|2` / `|1,3` / `|1-3` → `startEnding` with the parsed numbers

Pass two folds those into `repeatInstructions`, each `{common:{start,end}, endings?:[]}`,
and emits: no `endings` → copy the common span ONCE; `endings` present but EMPTY → copy it
TWICE (a plain repeat); `endings` non-empty → for each ending in turn, copy the common span
then that ending. A trailing `endRepeat` after endings appends one more bare common pass.
The array is SPARSE — `endings[section.endings[e]]` is indexed by the ENDING NUMBER — so
`|1,3` and `|2,4` interleave correctly and the empty slots are skipped.

`no-start-repeat-part` and `-title` are the same shape: a `:|` with no `|:`, where the
repeat runs from the tune's start because `sections` is seeded with a `startRepeat` at the
opening bar.

**AND IT IS INDEXED BY BARLINE, NOT BY MEASURE.** abcjs records a bar ELEMENT's position;
bar k sits between measure k-1 and measure k, so a section that STARTS there starts at
measure k and one that ENDS there ends at k-1. Indexing by MEASURE put a volta's
`startEnding` AFTER the `endRepeat` of the same measure — the volta bar OPENS the measure
and the `:|` CLOSES it, and one `::` is both — and `repeat-3` unrolled `C D D` where abcjs
gives `C D C E C F`.

---

## THE METHOD, unchanged, and it is what produced all of this

1. Both geometry tables first. Empty — that is the state, not a bug.
2. The AUDIO table, and READ ITS FIRST DIFFERING EVENT. It is a work list, not a score.
3. Read the named function in abcjs.
4. **MEASURE, do not reason.** The probe runner is
   `/tmp/abcts-probe/abcjs-probe/flat.js` — a jsdom shim and `visualObj[0].setUpAudio({})`,
   `DUMP=1 node flat.js <abc>` to print the whole answer, `ABCJS_PROBE=1` to print whatever
   the instrumented copy logs. Two findings here came from printing abcjs's own
   `elem.decoration` per element and reading `el bar` in the output.
5. Ratchet `PASSING` and never shrink it.

---

## RE-VERIFIED AT THIS COMMIT

```
HEAD                2f19793   working tree clean
npx tsc --noEmit    clean
npx vitest run      954 / 954
audio ranked        26 of 54,  PASSING 28
pixel ranked        0 of 119
harvested ranked    0 of 174
staff-line gate     0 of 41
npx biome check src NOT clean — same rows as before this session, all pre-existing
```
