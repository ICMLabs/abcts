# abcts — Checkpoint, 2026-08-09 — **THE MIDI FILE IS BYTE-EXACT, AND THE SUITE IS AUDITED**

Supersedes `CHECKPOINT-2026-08-08e.md` for the STATE. That file keeps **the audio arc's
thirteen findings** and **the accent**, both still current as ledger.
`-08-08d.md` keeps the 6.7.0 flip and **the terms the structural pass must be held to**.
`-08-08c.md` keeps the audio arc's first findings; `-08-08b.md` keeps 147–150 and the
geometric tail; `-08-08.md` keeps the ARC DECISION; `-08-07b.md` keeps 134–146 and the
method; `-08-06.md` keeps **THE HARNESS**.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## STATE

| axis | standing |
|---|---|
| suite | **1008 of 1008. NO REDS.** |
| **midi-file ranked table** | **0 of 3 — BYTE-EXACT.** No tolerance, no excluded axis |
| audio ranked table | **2 of 61** — both the host drum-intro; the corpus GREW from 54 |
| harvested ranked table | **0 of 174** |
| pixel ranked table | **0 of 120** |
| tempo-parts gate | 8 controls |
| staff-line gate | 0 of 41 |
| above-lane / ycorr gates | 12 + 20 controls |
| gates | **9** (23 test files) |

The two open rows are `options-all-midi-options-1` and `-2`: HOST-supplied
`drum`/`drumBars`/`drumIntro`/`drumOff`. That was a named divergence reading "no case
passes them"; now two do.

---

## 1. THE TEMPO MARK — the gate had to be built before the fix could land

`Q:1/8=66` drew a bare stem where abcjs draws an eighth, and it had sat open under a note
saying "no pixel-gated fixture has a non-quarter `Q:` … so it lands blind until one does."
**That was true of the CORPUS and false of the ORACLE** — abcjs renders any tune on demand.
The corpus is not the oracle; it is a sample of it.

`tests/tempo-parts.test.ts` is the repo's third LADDER OF CONTROLS after `above-lane-order`
and `glyph-ycorr`. Eight rungs, one `Q:` beat unit each, abcjs's own answer beside it. It
compares WHICH GLYPHS a mark is made of — outline-independent, which is the only thing
comparable across Bravura and abcjs's font — and opened naming exactly six defective rungs
and three already right.

**Its canary is deliberately NOT the flag pair.** One comparing `Q:1/4` with `Q:1/8` would
assert the FIX rather than the INSTRUMENT: before the flag existed those two returned the
same list, so it would have failed for the same reason every rung did and proved nothing
about whether the gate could see. It compares HEADS, an axis the engine has always had right.

The port is `createNoteHead` — abcjs runs the tempo note through the SAME routine an
ordinary note does at `scale: 0.75` (`tempo-element.js:24-59`), so the figures are the note
path's and the two now read the same constants. Verified on the ADVANCE as well as the
parts, because `note.w + 5` grows with whatever `addRight` put in it: +4.419 vs +4.410,
+6.450 vs +6.450, +0.420 vs +0.420 — every rung inside 0.01px, which is abcjs's own
two-decimal SVG rounding.

**WHY NO GATE COULD SEE IT**, and this is the transferable part: `pixel-parity` and the
harvested table compare elements classed `abcjs-notehead`, and abcjs gives the tempo group's
glyphs a `data-name` and NO class — its tempo notehead is not an `abcjs-notehead`, so no
table in the repo has ever had a row for one.

---

## 2. THE MIDI FILE — byte-exact, and it found three flattener bugs

`tests/corpus-midi/` (3 cases harvested from `midi.test.js`), `src/audio/midi-file.ts`,
`tests/midi-file-ranked.test.ts`. The writer is `abc_midi_create.js` + `abc_midi_renderer.js`.

**IT IS THE BEST ORACLE IN THE REPO.** Every other comparison has to declare what it
ignores — `pixel-parity` excludes glyph outlines, `tempo-parts` compares glyph kinds, the
harvested table takes 0.05px. A MIDI file is a byte string, so "differs" means differs and
the first differing byte names the field. It also **re-derives the flattener's answer a
different way**: a surface that agrees by construction is worth less than one that could
disagree, and this one disagreed three times with the event table green.

- **THE TRACK NAME.** `%FF%03` carries `V:… name=`, unshifted to the FRONT of the finished
  track. `cmd: 'text'` had been a type in `flatten.ts` since it was written and NOTHING
  EVER PRODUCED ONE, because not one of the audio cases declares a named voice.
- **THE CHORD SORT BELONGS TO THE ENGRAVER, NOT THE PARSER.** `[cD]` sounds D-then-c and
  `[gF]` sounds 42-then-36 — and only the first was known, recorded as "abcjs sorts
  `elem.pitches`". A chord's noteheads have to STACK in pitch order to be drawn, so the
  LAYOUT sorts them: `flattener.test.js` renders before calling `setUpAudio`, while
  `getMidiFile` on a STRING goes through `renderEngine(callback, "*", …)` and never
  engraves. **Both oracles are right about their own ENTRY POINT.** Measured by
  instrumenting `abc_midi_create.js`, whose own `setUpAudio` returns `[[42,0],[36,0]]` where
  a RENDERED dump of the same tune returns `[36, 42]`. Now `AudioOptions.chordsInSourceOrder`,
  defaulting to the laid-out answer.
- **A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED.** abcjs moves both slur counts before
  reading them, inside the pitch loop; we added before and subtracted after, so `(ef)` gave
  `f` a −0.001s overlap and its note-off landed two ticks late. One byte.

Four abcjs quirks reproduced on purpose and written out in the file: the program change is
always on channel 0 whatever `%%MIDI channel` said; a pitch is not zero-padded; the
instrument LEAKS into the next track; an empty-but-present key still writes a key signature,
which is why `K:cm` emits one.

---

## 3. THE AUDIT OF abcjs's `tests/` FOLDER — asked for, done by measurement

Thirty test files. `harvest-abcjs-tests.mjs` took INPUTS from 24; the corpus README said the
ASSERTIONS were unportable because they read the internal `visualObj` tree.

**THE HARVESTER NAMED A FILE WHERE IT SHOULD HAVE NAMED A SHAPE.** `synth/options.test.js`
declares its own `doFlattenTest(abc, expected, options)` — the same helper, the same three
arguments, the same answer — and was missed for the whole audio arc because the harvest
targeted `flattener.test.js` by name. It is the only place in abcjs's suite exercising
HOST-supplied options rather than the tune's `%%MIDI`, so it is worth more per case than
anything in the 8,203-line file beside it. Seven cases; three failed on arrival.

**FIXED:** the chord-track settings supplied as OPTIONS. abcjs folds `bassprog`, `bassvol`,
`chordprog`, `chordvol` and `gchord` into `midiOptions` at the top of `flatten()`, guarded
by `!midiOptions.<key>` — so the TUNE'S OWN `%%MIDI` WINS and the option is only a default.

**AND THE CLASSIFICATION IS BY ASSERTION TARGET, NOT BY FILE**, because most files mix both
kinds — the same lesson turned on the audit itself.

| assertion target | files (cases) | harvested |
|---|---|---|
| `setUpAudio()` return | flattener 54, options 7, synth 4 | 54 + 7 |
| MIDI file bytes | midi 3 | 3 |
| `setTiming` / `noteTimings` | timing 16 | no |
| `chordGrid` | chord-grid 24 | no — **a feature we do not have** |
| `metaText` | parsing, misc, title | no |
| `warnings` | parsing, note, transpose, tablature, directives, chord-grid | no |
| `charPos` (source offsets) | start-char 1 | no |
| `lineBreaks` / `explanation` | wrap 9 | no |
| SVG DOM `[data-name=…]`, groups | svg 3, svg-per-line 5, options 1 | no |

NOT portable: `lines` / `topText` / `bottomText` / `engraver` / `makeVoicesArray` — the
internal laid-out tree, for which our geometry gates are a stronger check on the same tunes.
Skip `parse/voices-array.test.js` (abcjs's own comment: "a known bug so the test is expected
to fail") and `api/tunebook_svg.test.js` (asserts param forwarding, not behaviour).

**ONE EARLIER READING WAS WRONG AND IS CORRECTED HERE:** `visual/svg.test.js` and
`svg-per-line.test.js` assert the SVG DOM CONTRACT — `[data-name=…]` presence and group
structure — not the internal tree. Geometry gates do not cover that, and `abcts/compat`
explicitly promises it. Eight portable cases nearly written off.

---

## 4. BRIEFS FOR THE SIBLING REPOS — `Docs/BRIEF-abcjs-tests-*.md`

Four, one pasteable prompt each: `abcMusicKit` (v1), `abcMusicKit2`, `abcMusicKitCpp`,
`abcMusicStudio`. Written because the findings above are engine-agnostic and three other
engines implement the same format.

**PROVENANCE WAS CHECKED RATHER THAN ASSUMED, and it changed one of them.** v1's synth files
carry their origin in their headers: `MIDIFlattener`, `MIDISequencer` and `ChordTrack` are
all "Ported from abcjs src/synth/…", so anything abcjs does wrong they must do wrong
identically. **`MIDIWriter.swift` is NOT** — "Clean room implementation from the MIDI 1.0
specification" — so the four MIDI byte quirks are a POLICY question for v1 (does
`abcjsStrict` owe byte parity on the FILE, or only on the EVENT LIST?) and not a bug list.
`abcMusicKitCpp`'s `src/smf.h` is a direct port of that same clean-room writer, so it
INHERITS the decision; its brief says so rather than pre-empting it. cpp also has no
flattener, sequencer or chord track at all, which is why its brief is a record-it request
against a parked repo rather than a do-work one.

---

## WHAT IS LEFT

### 1. THE HOST DRUM OPTIONS — the only two rows on any table

`options.drum` / `drumBars` / `drumIntro` / `drumOff`. `drumIntro` is the count-in:
`abc_midi_sequencer.js:510-537` splices whole measures of rests onto the front of EVERY
voice and subtracts the pickup from the last of them; `drumOff` then inserts a drum-off
after the intro. The pattern string arrives as `options.drum.split(" ")`, which is the same
array shape `%%MIDI drum` already produces, so `normalizeDrumDefinition` needs nothing new.
Note the expected events carry pitch and volume as STRINGS (`"pitch":"76"`) — abcjs passes
the host's tokens through unparsed, and the ranked table compares by value.

### 2. `chordGrid` — a whole feature, with a 24-case JSON oracle

`renderAbc(…, { chordGrid: "withMusic" })` publishes `[{type:'part', name, lines:[[{chord:
[…4 slots…], annotations, hasStartRepeat, hasEndRepeat}]]}]`. Chord symbols arrive
prettified. `visual/chord-grid.test.js`. Nothing of it exists here.

### 3. `setTiming` — the audio↔geometry JOIN, still unharvested

`timing.test.js`, 16 cases. `doTimingTest` writes `currentTrackMilliseconds` and
`midiPitches` back onto the DRAWN elements, so a note reached twice through a repeat carries
`[3000, 9000]`. The other helpers assert `noteTimings` rows carrying `milliseconds`,
`millisecondsPerMeasure`, `left`, `endX`, `top`, `height`. That is the playback cursor's
data, and where `millisecondsPerMeasure` and `getTotalTime` belong.

### 4. THE STRUCTURAL PASS — step 1 done, the rest queued

Terms in `CHECKPOINT-2026-08-08d.md`'s `⏳` section, unchanged and NOT to be re-argued.
Step 1 (the `ponytail:` ledger triage) is done — four of 55 markers were LIES about work
already finished. Remaining: split `layout.ts` along its seams mechanically; close the
`ENGRAVE` bare-literal table; then the module-level mutables *if* they are a real hazard.
**NO BASELINE MAY MOVE.**

### 5. THE COMPAT WIRING IS AN API DECISION, NOT AN IMPLEMENTATION ONE

`setUpAudio`'s answer exists and `getMidiFile`'s is byte-exact, but neither is on
`src/index.ts`'s curated surface and ARCHITECTURE.md governs what goes there. Hanging them
on the compat tune object makes them part of the drop-in contract. `compat/index.ts` says so
where the methods would go. **Ask Lance before doing it.**

### 6. SMALL NAMED DIVERGENCES

Full-line `I:` in strict (abcjs's `letter_to_body_header` handles one; ours is mode-gated to
non-strict, and the comment beside it reasons about `+:` continuations, which is a different
question); `(p:q:r` with `p !== r`; overlay track numbering across staves; `transpose=` on
`K:` rather than `V:`. None has a case behind it; each wants a control tune first.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1008 / 1008
midi ranked         0 of 3     BYTE-EXACT
audio ranked        2 of 61    (host drum options)
harvested ranked    0 of 174
pixel ranked        0 of 120
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist between
tool calls and the workspace ROOT has its own vitest reach: run from there and it collects
every test in every sibling repo, abcjs's own included.
