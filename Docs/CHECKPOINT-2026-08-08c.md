# abcts — Checkpoint, 2026-08-08c — THE AUDIO ARC

Supersedes `CHECKPOINT-2026-08-08b.md` for the STATE. That file keeps findings 147–150 and
**the geometric tail's four findings**, which are done and closed; `-08-08.md` keeps the
ARC DECISION verbatim; `-08-07b.md` keeps 134–146 and the method; `-08-06.md` keeps **THE
HARNESS**. Earlier ledgers as listed there.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔎 THE HEADLINE: GEOMETRY IS DONE. AUDIO EXISTS, HAS A GATE, AND IS AT 17 OF 54.

| axis | standing |
|---|---|
| suite | **943 of 943. NO REDS.** |
| **audio ranked table** | **37 of 54 differ** — from 54 of 54 when it opened |
| **audio PASSING** | **17** and ratcheted |
| pixel ranked table | **0 of 119** |
| harvested ranked table | **0 of 174** |
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

- A CHORD SOUNDS FROM THE BOTTOM UP — abcjs sorts `elem.pitches`, so `[cD]` emits D then c.
- A MULTI-MEASURE REST IS AS LONG AS IT SAYS — `Z4` is four bars, written as one.
- `chordsOff` has to be plumbed, or `%%score`'s voices get a track they should not have.

---

## WHAT THE TABLE SAYS NOW, and it is the work list

```
 9 cases   1 tracks vs 2      %%MIDI gchord / drum with no chord symbol in the tune
 4 cases   instrument 0 vs N  %%MIDI program / percmap — the parser reads %%MIDI ZERO times
 5 cases   missing / wrong    repeats are not unrolled
 2 cases   1 tracks vs 3      `&` overlay voices are not split out
 1 case    cents:-50          a quarter tone is a PITCH BEND, not a fractional pitch
 1 case    style:"grace"      grace notes
 1 case    style:"decoration" trills, mordents, turns and rolls become note runs
 1 case    volume per pitch   per-note dynamics inside a chord (`volumesPerNotePitch`)
```

**`%%MIDI` IN THE PARSER IS THE BIGGEST SINGLE UNBLOCK** — it appears in the parser exactly
zero times, and it gates 13 of the 37. `program`, `channel`, `transpose`, `gchord`, `drum`,
`drummap`, `bassprog`, `chordprog`, `bassvol`, `chordvol`, `percmap`. The flattener and the
chord track already take them as inputs (`MidiDirectives`, `ChordOptions`); nothing fills
them in.

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
HEAD                02e7dba   working tree clean
npx tsc --noEmit    clean
npx vitest run      943 / 943
audio ranked        37 of 54,  PASSING 17
pixel ranked        0 of 119
harvested ranked    0 of 174
staff-line gate     0 of 41
npx biome check src NOT clean — same rows as before this session, all pre-existing
```
