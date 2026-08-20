# CHECKPOINT — 2026-08-19

**EVERY RANKED TABLE IN THE REPO READS ZERO EXCEPT FOUR ROWS, AND THE abcjs API SURFACE IS
COMPLETE — 0 of 64 absent.** Suite **1,855 passing, 2 expected-fail, no reds**. Eight
landings, all pushed to `main`.

| | opened at | closed at |
|---|---|---|
| `synth.SynthController` | absent | **174 of 174 steps, 8 of 8 cases** |
| `synth.CreateSynth` + `playEvent` | absent | **183 of 183 steps, 18 of 18 cases** |
| `synth.sequence` | absent | **4,795 of 4,795 rows, 177 of 177 tunes** |
| `tune.setupEvents` | 3,345 of 3,366 | **3,366 of 3,366** |
| `makeVoicesArray` | 4,153 of 4,208 | **4,208 of 4,208** |
| abcjs API surface | 4 of 64 absent | **0 of 64** |

---

## 1. THE SYNTH SURFACE IS BUILT, AND NONE OF IT NEEDED A SPEAKER

**`SynthController` (312 lines) was gated BEFORE `CreateSynth` existed**, exactly as the
previous handoff predicted: the one class it needs and we did not have is stubbed by a
RECORDER on both sides — `require.cache` for abcjs's `src/synth/create-synth.js`, installed
before `index.js` loads it, and a factory argument for ours, which is the only line of the
port that exists for the gate. What is compared is the CALL SEQUENCE into the buffer, the
transport bar's state, the `cursorControl` callbacks and the controller's own fields, after
each of twenty-two steps.

**`CreateSynth` (646 lines) COMPUTES NO WAVEFORM, and that is what makes it gateable.** It
fetches one mp3 per instrument and pitch, renders each UNIQUE sound once in an
`OfflineAudioContext`, and copies it into an output buffer at every start time that sound
has — so the whole class is a scheduler. `tests/audio-recorder.ts` replaces the three host
objects and records every decision.

⚠️ **THE SOUNDFONT COMES OVER `XMLHttpRequest`, NOT `fetch`** (`load-note.js:13-34`). The
previous handoff said fetch; what needs stubbing is XHR, `decodeAudioData`, `AudioContext`
and `window.OfflineAudioContext`.

**THE FAKE SAMPLES ARE A BLOCK OF ONE CONSTANT — the gain the envelope settled on** — so the
output buffer's fingerprint (non-zero frames, first, last, sum) is an exact statement about
WHERE each note landed and HOW LOUD. Changing `volume / 96` to `/ 100` takes 15 of 15 cases
red; the probe was run rather than assumed.

**AND THE RECORDER AND THE SCRIPT ARE SHARED FILES, NOT DUPLICATED BLOCKS**
(`tests/audio-recorder.ts`, `tests/create-synth-script.ts`), which is why that harvester is
`npx tsx scripts/harvest-abcjs-create-synth.ts` rather than a `.mjs`: a state machine driven
in two slightly different orders is not a comparison.

Three abcjs details the controller gate holds that would be wrong if intuited:
**`afterResume: self.init` NAMES A METHOD THAT DOES NOT EXIST** (`synth-controller.js:34`);
**`load` MUTATES the visual-options object it is handed**; and **`setWarp` THROWS through the
controller** when the bar has no warp input, with the buffer already re-`init`ed and
re-`prime`d behind it.

---

## 2. THE `&` OVERLAY MODEL — THE RESOLUTION IS SHARED, NOT RE-DERIVED

`resolveOverlays` moved to `src/core/overlays.ts` and the PARSER now runs it over a
line-structured view of the model (`padOverlays`), so the renderer, the clock and the
flattener lay out the voices a host reads. All three already expanded `measure.overlays`;
what changed is what is in it. **`setupEvents` 3,345 → 3,366 of 3,366.**

- **THE PADDING IS TWO DIFFERENT THINGS AND WE WROTE ONE.** On the layer's own line a
  measure that does not sing takes ONE invisible rest of the measure's summed duration
  carrying the BARLINE's span (`tune-builder.js:572-575`); a line ABOVE one that sings is
  BACK-FILLED with one rest PER NOTE, each carrying that note's own span (`:536-545`).
- **A LINE'S LAYER COUNT IS NOT THE TUNE'S MAXIMUM.** The back-fill's guard — the CURRENT
  line's voice count against the earlier line's, taken BEFORE the new voice is pushed — is
  what stops a line already carrying its own layer from being back-filled by a later one.
  `synth-flattener-21` is 3, 3, 3, 2, 2 voices where its maximum is 3.
- ⚠️ **AN EMPTY PART IS NOT A FREE ONE.** Dropping the silent layer from the staff MERGE
  alone left it in the line SOLVE, where a voice with no staff-extra of its own still moved
  the left edge — the last two clefs at 20 against abcjs's 15, and the whole corpus differing
  by exactly those five pixels.
- ⚠️ **AN ARRAY IS AN IDENTITY.** `stavesHere` recovers a staff by
  `voicesOfStaff.indexOf(members)`, so filtering that list into a NEW array cost eleven
  byte-exact fixtures their brace — every one a tune with no `&` in it at all.
- **THE TWO RESOLUTIONS ARE SEPARATE RUNS, SO A PAD HAS NO `abcelem`.** `abcelemOf`
  synthesizes it with the PROJECTED span of the note it mirrors (`Rest.overlayMirrors`); the
  model's own range stops short of the trailing whitespace abcjs's tokenizer swallows.

---

## 3. `synth.sequence` — A SECOND DERIVATION, AND IT FOUND SIXTEEN `tune.lines` FIELDS

`src/compat/sequence.ts` is a port of `abc_midi_sequencer.js` and `repeats.js` over OUR
`tune.lines`, which is what abcjs's own runs over. Our flattener runs over the parse MODEL
and never touches the projection — that is what keeps audio independent of the renderer — so
the two re-derive the same music from different sides, the argument `setupEvents` and the
MIDI writer were already built on.

**IT PAID THE SAME WAY: sixteen classes, every one a FIELD the projection did not carry, and
the character-based lines gate can see none of them.**

- the staff's voice `title` — `name` on the first music line, `subname` after it, `''` for a
  voice with neither, and the array DELETED when no voice on the staff has one
- a barline's decorations and chord symbol — a hairpin closing on a bar made a crescendo's
  step 2 where abcjs's is 4
- `V:… transpose=` riding the clef; a multi-measure rest's own length and `text`
- `midipitch` from a `%%MIDI drummap` on a percussion clef, on notes AND grace notes
- **`endTie` WAS SCOPED TO ONE LINE** where abcjs's tie state is the tune's
- a rest as long as its measure being a `whole` rest, stamped by the ENGRAVER
- `printer_shift`, and a grace note's `accidental` and `acciaccatura`
- ⚠️ **THREE ELEMENTS WERE PUSHED INTO THE STREAM AS BARE MARKERS** — a mid-tune `[K:Bb]`,
  an inline `[M:3/4]` and a `[K: treble+8]`, each with an `el_type` and a range and no
  content at all. **The same shape three times.**
- a quarter tone naming itself from its SPELLING (`_/A` → `quarterflat`), which sidesteps the
  five-value `Accidental` enum entirely
- a `K:` field's own explicit accidentals, which REPLACE a standard one on the same letter
- ⚠️ **WHICH CLEF A KEY IS PITCHED FOR** — `addPosToKey` runs where the `K:` is parsed, so a
  header `K:D` read after `V:T clef=bass,,` takes the VOICE's clef while a standalone body
  `K:` restamps THE STAFF against its own field's clef. **Measured both ways; either fixture
  alone writes the wrong rule.**
- the engrave-time fields on the systems `%%maxStaves` HIDES — abcjs lays the whole tune out
  and stops DRAWING at the limit, so `Layout.engraved` carries them now
- ⚠️ **AN INVISIBLE REST LOSES ITS DECORATIONS AND NOTHING ELSE DOES** — five rungs
- `@x,y` is not a position but two floats and a name without them (`rel_position`)
- a dotted tie's `startTie: {style: "dotted"}`
- and **`marcato` IS NOT CANONICALISED WHERE `^` IS**, because the pseudonym fires only for a
  token that is not itself a legal name; `!beambr1!` goes the other way and is CONSUMED into
  `el.beambr`, leaving an EMPTY decoration array behind

⚠️ **THE ORACLE IS HARVESTED FROM A RENDERED TUNE, NOT `parseOnly`.** abcjs's `parseOnly`
never engraves, so its pitches carry no `highestVert`; ours engrave whatever the entry point,
because our `parseOnly` IS `renderAbc(['*'])`. **Two thousand rows of the first harvest were
nothing but that.** It is a divergence of its own and is written down rather than fixed under
a gate that is not about it — see §5.

---

## 4. `makeVoicesArray` — CLOSED, AND ITS LAST ULP HAD A CAUSE

4,153 → **4,208 of 4,208**. The `w` family, a span that should not exist, a tie's reserve,
and finally a tuplet's.

- **abcjs's VOICE-OVERLAP RULE ADDS THE WIDTH TO THE CHILD'S OWN `dx`** beside
  `child.w = firstChildNoteWidth + child.w` (`layout/voice-elements.js:56-62`). Reading the
  offset back as `(g.x - el.x) + w` is the same number one ULP away. **A CONSTRUCTED OFFSET
  IS BUILT, NEVER DERIVED**, for the fourth time on this branch.
- **A STAFF-EXTRA TIME SIGNATURE OWNS NO CHARACTERS**, and `meterLeadsFirstMeasure` was
  asking the SINGULAR `meterChange` — the meter in FORCE, which is the LAST of several.
- **THE TIE'S RESERVE CARRIES ITS PITCH NOW.** `curveReserves`'s head arm had none, so a tie
  reached `verticalExtent`'s `-a / spacePerStep` fallback.
- **A TUPLET'S BOX IS DECLARED IN PITCH** — `element.top = yTextPos + 1`,
  `bottom = yTextPos - 2` (`layout/triplet.js:19-20, 76-77`), and `yTextPos` is a pitch on
  BOTH arms: the midpoint of the two end notes unbeamed, and `heightAtMidpoint` — which
  interpolates the BEAM's own two pitches — beamed. Ours pushed the y alone, the extent
  divided it back, and `synth-flattener-27`'s third staff top came out 22.318670814720246
  against abcjs's 22.318670814720242. **That 1.4e-13 reached `staffGroup.height` through
  `calcHeight` and every system below it inherited the page cursor.**
  `PlacedLine.pitchRange` now carries a beam's two ends, which is what `beam.startY` and
  `beam.endY` are.
- **AN ELEMENT'S `w` COUNTS ITS DOTS.** `getMinWidth(child)` is `child.w`, and an absolute
  element's `w` is `max(child.dx + child.w)` as each child arrives. ⚠️ Taking EVERY glyph
  instead put 169 rows out: a decoration, a tempo's parts and a rest's furniture are not
  `addRight` children. Measured both ways.

🔬 **THE HUNT IS THE REUSABLE PART — four probes, each ruling out one layer.** abcjs's
`makeVoicesArray` printing `absoluteY`/`top` (matched → not the row builder);
`Renderer.moveY` printing every page term (matched → not the walk); `calcHeight` printing
each staff's `top`/`bottom` (ONE differed → it is an extent); and `verticalExtent`'s
`include` printing whether the winning contributor supplied a PITCH or fell back to the
division (it fell back → and that named the tuplet).

**No SVG gate could see any of it**: path coordinates go through `roundNumber`, which is
`toFixed(2)`.

---

## 5. WHAT IS LEFT — FOUR ROWS AND ONE WRITTEN-DOWN DIVERGENCE

Measured, not remembered — every report below was regenerated by the run that closed this
session.

1. **`deline`, 4 of 1,570 rows / 2 tunes.** `%%maxStaves`: an undrawn line's `staff.clef`
   has no `abselem`, which is what makes abcjs's `objEqual` differ and `deline` unshift a
   clef — an ENGRAVER mutation leaking into a DATA comparison, and reproducing it means
   crossing the parse/layout boundary this library keeps. And `frere-jacques`'s prose spans.
2. **`Editor`, 2 of 196 steps / 1 case.** `visual-selection-03` at `staffwidth: 300` writes
   its `treble+8` octave marker at `M 306.8125` where abcjs writes `306.81250000000006` —
   ONE ULP, repeated in about ten glyph paths, which is the 40 characters of markup length
   the gate reports. The same fixture is byte-exact at every other width.
3. **`setGlyph`, 1 of 6 renders.** `visual-layout-04#wide` writes a dot at
   `1055.0269999999998` against abcjs's `1055.027`, under a SYNTHETIC 18-wide notehead no
   real table produces. Already ratcheted as ULP-only with its own note.
4. **`tuneMetrics`, 2 of 223 tunes.** `inline-key-per-voice` needs the implied-naturals rule
   that is **measured, written down and deliberately NOT applied** (it moves
   `ragtime-nightingale`'s page height by 0.009px in all three byte flavours, and that
   fixture IS gated where this one has no golden at all); `ragtime-nightingale`'s own two
   measures are one ULP apart with the section total exact.

⚠️ **AND ONE DIVERGENCE IS WRITTEN DOWN RATHER THAN FIXED: OUR `parseOnly` ENGRAVES.**
abcjs's is `renderEngine` with a callback that does nothing, so its pitches carry no
`highestVert`, no `averagepitch` and no `printer_shift`; ours is `renderAbc(['*'])`, which
lays the tune out. Nothing in the corpus can see it because every oracle here is harvested
from a rendered tune — but a host calling `parseOnly` gets fields abcjs does not give it.

---

## 6. THE HARNESS

New this session, all in the repo:

| Script | Prints |
|---|---|
| `node scripts/harvest-abcjs-synth-controller.mjs` | the controller's 22-step oracle, `CreateSynth` stubbed via `require.cache` |
| `npx tsx scripts/harvest-abcjs-create-synth.ts` | the scheduler's oracle, through `tests/audio-recorder.ts` |
| `node scripts/harvest-abcjs-sequence.mjs` | `synth.sequence` over both corpora, `elem` stripped |
| `npx tsx scripts/zzseq.ts` | our `sequence` disagreement CLASSIFIED by kind, with one example each |
| `npx tsx scripts/zzpad.ts` | our resolved overlay layers, line by line, beside abcjs's shape |
| `npx tsx scripts/zzva.ts` | `makeVoicesArray`'s disagreement by COLUMN and element type |
| `npx tsx scripts/zztop.ts` | our page walk:every system's `absoluteY`, `topPitch` and `top` at full precision |
| `npx tsx scripts/zzw.ts` | one element's glyphs with `x`, `dx` and width — `X=<el.x>` |
| `npx tsx scripts/zzdec.ts` | our per-line decorations, in abcjs's own dump shape |
| `npx tsx scripts/zzclef.ts`, `zzkeyorigin.ts` | staff clefs and key positions; where a `K:` was recorded |

Probes in the scratchpad (`NODE_PATH=$(cd ../abcMusicKit/Tools/abcjs-debug/node_modules && pwd) ABCJS_PATH=/tmp/gp/abcjs node /tmp/gp/<script>`):
`va.js` (abcjs's `makeVoicesArray`, `P=` for params), `ovl.js` (its resolved lines),
`keypos.js` (key positions per clef), `dec2.js` (decoration spellings), `px.js` (decorations
on every rest kind), `clefs3.js`, `seq.js`, `seqsurvey.js`.

⚠️ **AND A PROBE MUST USE THE HARVESTER'S OWN PARAMS.** The page-walk hunt's first run
compared `{staffwidth: 670}` against a golden harvested at `{}`, printed four systems whose
tops matched OURS exactly, and read as "there is no defect at all".

---

## 7. THE RULES THIS SESSION PAID FOR

- **A SECOND DERIVATION IS WORTH MORE THAN A SECOND CHECK.** `sequence` re-derives from the
  projection what the flattener derives from the model, and it named sixteen missing fields
  that every other gate was green through.
- **A CONSTRUCTED OFFSET IS BUILT, NEVER DERIVED** — `dx + w`, not `(g.x - el.x) + w`.
- **A RESERVE IS DECLARED IN PITCH.** Every ULP closed this session was a box stated in y
  where abcjs states it in pitch: the tie's head arm, the tuplet's box, the beam's two ends.
- **AN ARRAY IS AN IDENTITY** when something recovers an index with `indexOf`.
- **MEASURE BOTH WAYS BEFORE WRITING THE RULE.** The key-clef rule needed two fixtures
  pulling opposite ways; taking `every glyph` for `getMinWidth` looked right on one row and
  cost 169.
- **AND A CACHE GUARD MUST MATCH ITS SENTINEL**: `=== undefined` on a cache initialised to
  `null` silently emptied `tune.lines` and took eight tests red.
