# abcts — Checkpoint, 2026-08-08

Supersedes `CHECKPOINT-2026-08-07b.md` for the STATE and for WHAT IS NEXT. That file keeps
findings 134–146 and the method; `-08-06.md` keeps **THE HARNESS**; `-08-07.md` keeps
125–133 and **THE GATE WAS READING 29 OF THE 41 FIXTURES**; earlier ledgers as listed there.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔎 THE HEADLINE: THE GEOMETRIC ARC IS DONE. THE NEXT ARC IS AUDIO.

| axis | standing |
|---|---|
| suite | **891 of 891. NO REDS.** |
| pixel ranked table | **0 of 119** |
| harvested ranked table | **0 of 174** |
| corpus median notehead distance | **0.0px** |
| noteheads within 25px of abcjs | **119 / 119** |
| parser, lyrics, beams, render structure | **100%**, 0 recorded divergences |
| gates | **3** — pixel parity, harvested content+geometry, staff-line extent |

Every fixture in both corpora agrees with abcjs on all four geometric axes to within 0.05px.
**No gate can name another geometric defect**, and the last three findings all had to be
reached by reading abcjs and proving on a control ladder — one of them (144) by building a
gate first, because no existing axis could express it.

---

## ⚖️ THE ARC DECISION (Lance, 2026-08-08)

> *"Defer Gonzato and focus on the remaining geometric tail and audio."*

**GONZATO IS DEFERRED.** It has sat in the standing order's tail since 2026-08-04 — "then
Gonzato, then audio" — and has never had a fixture, a gate, or an owner. It is a COVERAGE
question (does every decoration and directive in Guido Gonzato's reference set draw at all),
not a geometry one, and it is the only part of the order whose INPUTS are not already in
this repo. Nothing below depends on it.

**AUDIO IS THE ARC.** And the position is much better than "not started", which is what the
first estimate this session said. The implementation is genuinely absent — `src/` has no
`midi/` or `synth/`, and `%%MIDI` appears in the parser exactly ZERO times — but:

---

## 🎵 THE AUDIO CORPUS AND ITS ORACLE ARE ALREADY IN THE REPO

**61 of the 174 harvested fixtures are abcjs's own synth tests**, harvested on 2026-08-03
and rendering at exact geometric parity ever since. `SOURCES.json` pairs every one to the
abcjs test file it came from:

```
46  tests/synth/flattener.test.js
12  tests/synth/timing.test.js
 3  tests/synth/midi.test.js
```

They exercise the whole surface: `%%MIDI program`, `bassprog`, `gchord`, `percmap`, chord
tracks, crescendos, quarter tones, mid-tune `[Q:]` tempo changes, repeats, ties across bars.
`abcjs-synth-flattener-11-midi-program-3.abc` is a fair sample —

```
Q:1/4=90
K:C
%%MIDI program 3
!trill! e !lowermordent! d … | [Q:1/4=180] … | [Q:1/4=60] …
```

**AND THE EXPECTED OUTPUT IS WRITTEN DOWN.** `flattener.test.js` is **8,203 lines**, almost
all of it expected event lists as JSON literals:

```js
{ "cmd": "note", "pitch": 67, "volume": 85, "start": 0,
  "duration": 0.125, "instrument": 0, "gap": 0 }
```

with `{tempo, instrument, tracks[]}` around them. `timing.test.js` adds 526 more. That is an
EXACT oracle of the same kind as the `.parse.json` and `.elements.json` goldens, and it needs
harvesting, not deriving — the same move `harvest-abcjs-tests.mjs` already made for the
inputs. The current `harvest-abcjs-goldens.mjs` shells out to `dump-svg.js` and captures
SVG only.

### What is IN the parity surface, and what is not

| abcjs file | size | in scope? |
|---|---|---|
| `abc_midi_flattener.js` | 31KB | **YES** — this is what the oracle tests |
| `abc_midi_sequencer.js` | 26KB | **YES** — repeats, voices, tempo map |
| `chord-track.js` | 22KB | **YES** — `%%MIDI gchord`, bass/chord voicing |
| `repeats.js`, `place-note.js`, `note-to-midi.js`, `pitches-to-perc.js` | ~16KB | **YES** |
| `create-synth.js`, `synth-controller.js`, `load-note.js`, soundfont/WebAudio | ~90KB | **NO** — host playback, not parity |

**The parity-relevant part is the EVENT GENERATION, not the sound.** A `{cmd, pitch, start,
duration}` list compared against abcjs's own is the whole gate; whether a host then plays it
through WebAudio, CoreAudio or a MIDI file is that host's business. This is the same split
the renderer already makes between geometry (in scope) and glyph outlines (out).

---

## WHAT IS LEFT IN GEOMETRY — the tail, and it is short

### 1. `S3-note-syntax-tune13`'s 0.26px OF STAFF LINE

The staff-line gate (finding 144) opened with twenty targets and nineteen closed. What is
left is 0.26px of CENTRE — 0.52 of span — on a tune that is nothing but rests: our right end
is half a pixel short of abcjs's `staffGroup.w`. Every notehead on it is exact and both
ranked tables are empty, which puts it on the justification TARGET at the right edge rather
than on a placement. Unexamined.

### 2. THE ABOVE-LANE ORDER — one refactor, three `ponytail:` notes waiting on it

abcjs spends every above lane in ONE loop, in order — chord, ending, dynamic, part, tempo
(`set-upper-and-lower-elements.js:31-49`). **We spend them in four places**:

```
anchorAboveStaff       chord, part, tempo
verticalExtent         the ENDING lane, the DYNAMIC lane
anchorDynamicsAbove    the dynamic MARK          (finding 146)
anchorChordsBelow      the below chord lane      (finding 137)
```

The staff's TOTAL is right either way — every lane goes on, and both corpora prove it — so
**no gate can see this**. What differs is which lane a mark lands in when a staff carries
TWO of them: a tempo mark over a volta draws inside the ending lane, an above dynamic on a
staff with a chord lane lands in the chord's space.

Three separate `ponytail:` notes now defer to this one refactor — the ending bracket's
(finding 93), the tempo mark's, and the above dynamic's (146). **Nothing in either corpus
combines them**, so it needs a control ladder built first: a staff with a chord symbol AND
an above dynamic; one with a volta AND a tempo mark.

It is the most regression-prone code in the file, and both ranked tables sitting at 0 is the
best possible safety net it will ever have.

---

## THE METHOD, unchanged

1. Both ranked tables first. They are empty — that is the state, not a bug.
2. Read the named function in abcjs.
3. **Build a LADDER of controls**, and prefer a ladder of BARS then a ladder inside the bar.
4. Instrument a SCRATCHPAD COPY of abcjs to answer ONE question.
5. Port the structure, then the constants.
6. Measure before and after over ALL 119 targets, not against the ceiling.

**AND WHEN EVERY GATE IS QUIET, ASK WHAT NONE OF THEM CAN REPRESENT.** That is finding 144
in one line, and it is how the audio arc starts too: there is no audio gate at all yet, so
the first commit of that arc is the harvester, not the flattener.

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 891/891
npx biome check src                   # NOT clean — 1 error, 4 warnings, all PRE-EXISTING
npm run baseline                      # READ the diff, and MEASURE anything that moved
git status --short                    # DELETE tests/zz-probe.test.ts before committing
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Never commit or revert there.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there** — it
bit four times on 2026-08-07b, every time after cd-ing to the abcjs probe. **vitest SWALLOWS
console.log on a passing test** — `--disableConsoleIntercept`. The session's probe file is
kept at `/tmp/abcts-probe/zz-probe.test.ts`.
