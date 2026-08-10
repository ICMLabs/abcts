# abcts — Checkpoint, 2026-08-09b — **FIVE TABLES, ALL EMPTY, AND A NINE-PIXEL DEFECT NO GATE COULD SEE**

Supersedes `CHECKPOINT-2026-08-09.md` for the STATE. That file keeps the TEMPO GATE, the
byte-exact MIDI file, and **the audit of abcjs's `tests/` folder** — the classification by
assertion target is what made this session's two harvests possible, and it is still the
work list for what is left.
`-08-08e.md` keeps the audio arc's thirteen findings and the accent.
`-08-08d.md` keeps the 6.7.0 flip and **the terms the structural pass must be held to**.
`-08-06.md` keeps **THE HARNESS**.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## STATE

| axis | standing |
|---|---|
| suite | **1065 of 1065. NO REDS.** |
| **audio ranked table** | **0 of 72** — was 2 of 61; the corpus GREW by 11 controls |
| **chord-grid ranked table** | **0 of 23** — NEW, and the feature is new with it |
| midi-file ranked table | **0 of 3 — BYTE-EXACT** |
| harvested ranked table | 0 of 174 |
| pixel ranked table | 0 of 120 |
| gates | **11** (26 test files) |

**THERE IS NO NAMED DEFECT LEFT ON ANY TABLE.** The engine's last one — the host drum
options — closed first thing this session.

---

## 1. THE HOST DRUM OPTIONS — the audio table is empty

`options.drum` / `drumBars` / `drumIntro` / `drumOff`, the two rows the session opened with.

- **The tune's `%%MIDI` REPLACES the option outright**, where the five chord settings beside
  it only default: `drumPattern = options.drum || ""` and then
  `if (globals.drum) drumPattern = globals.drum` (`abc_midi_sequencer.js:28-31, 86-92`).
- **A host pattern is never parsed.** `options.drum.split(" ")` and the tokens go straight
  through, so a host-supplied drum writes `"pitch":"76"` as a STRING where the tune's own
  writes a number.
- **`drumOn` is implied by a host pattern and not by a tune's** — `drumOn = drumPattern !== ""`
  is read off the OPTIONS, before the tune is.
- **`drumIntro` REWRITES THE MUSIC.** It splices whole measures of rests onto the FRONT of
  every voice (`:510-537`), so `lastBarTime`, the chord track's bar boundaries,
  `totalDuration` and the drum's own "reached a full measure yet" guard all shift by
  construction rather than by a correction anyone has to remember. Reproduced the same way.

---

## 2. THE COUNT-IN'S LADDER — eleven controls, because the corpus had a case for two branches

`options.test.js` exercises `drumIntro` twice and both times identically: one measure, no
pickup, 4/4, one voice. `scripts/gen-audio-controls.mjs` renders eleven more with abcjs
itself into `tests/corpus-audio-controls/`, read by the SAME ranked table under the SAME
ratchet. Every branch is exact on the first run:

- the `drumIntro-1` loop, which one measure never enters twice;
- the pickup coming out of the LAST intro measure, which then gets no barline of its own;
- `if (drumIntro)` not testing `drumOn`, so a SILENT count-in still shifts the music;
- the count-in landing on every voice rather than on voice 0;
- **and `measureLength` being the tune's LAST `M:`, not its first.** It is a sequencer-global
  every `interpretMeter` overwrites and the splice runs after all the voices are built, so a
  tune that ends in 3/4 gets a 0.75 count-in — and the drum's first group is then suppressed
  by the 4/4 guard and lands at 0.75 rescaled. `intro-meter-change` is that tune.

`intro-0` is the CANARY and is deliberately not a variation on the fix: same tune, same
drum, no count-in. Its voice starts at 0 where `intro-1`'s starts at 1.

**The controls are in a directory of their own because `npm run harvest:audio` CLEARS the
other one.** Same reason, same shape, one line of test change to read both.

---

## 3. THE CHORD GRID — a whole feature, 0 of 23

`src/chord-grid.ts`, `tests/corpus-chord-grid/` (harvested by `npm run harvest:chord-grid`),
`tests/chord-grid-ranked.test.ts`. Ported from `src/parse/chord-grid.js`, whose own header
numbers its sixteen rules.

**AN ADAPTER, NOT A REWRITE.** abcjs walks a flat element stream where we hold measures, and
its rules are full of order-dependent state — `nextBarEnding` spans two bar elements,
`currentBar` survives a barline that does not close a measure, `lastChord` runs across
parts. So our measures are converted into its stream and the algorithm is transcribed. The
table opened at 12 of 23 and **all four findings were in the ADAPTER, not the algorithm**:

- **`|1` IS ONE ELEMENT IN ABCJS AND TWO IN OURS.** Its bar carries `startEnding` and the
  grid spends it on the NEXT bar; we record the volta on the MEASURE, and the barline that
  announced it is the PREVIOUS measure's closing one. Seven of the twelve rows were that one
  flag.
- **`tripletMultiplier` IS STAMPED ON THE FIRST NOTE OF THE GROUP AND NOTHING ELSE**
  (`abc_parse_music.js:334`), so abcjs's beat count is wrong for every tuplet and wrong by
  design — the `under` fixture's own header says "triplets mess up beat counting". Folding
  the ratio into every member, which is what our `duration` does, makes the bar
  3.9999999999999996 and it never closes.
- **A BARLINE THAT OPENS A MEASURE TAKES THE PENDING DECORATION AND CHORD.** See §4.
- **`getMeterFraction()` reads the first meter of any LINE and defaults to 4/4**, not the
  header's — `you` writes `K:` before `M:`, and reading `Score.meter` refused a tune abcjs
  grids.

**TWO OF THE 23 CASES ASSERT NO GRID AT ALL** — `waltz` (3/4) and `no-chords`. A feature's
refusals are part of its contract and they are what an implementation written from the
happy path gets wrong.

And abcjs's own bug is reproduced on purpose: the annotation loop tests `chord.name` where
it means `ch.name` (`:118`), so one break synonym at the head of the list suppresses EVERY
annotation on the element. That is `douce`.

**What is NOT built: the DRAWING.** `src/write/draw/chord-grid.js` is 254 lines and the
oracle for it is one assertion counting DIVs. The parse-side structure is the whole of what
`chord-grid.test.js` asserts.

---

## 4. THE OPENING BARLINE WAS LOSING ITS DECORATION OUTRIGHT

abcjs has ONE bar element and does not care which measure it belongs to: `!coda!|:` and
`"^3x"|:` both leave `decoration` and `chord` on the `bar_left_repeat` — measured, not
inferred. Ours split a leading barline off as the NEXT measure's opener and the transfer had
nowhere to go: `closeMeasure` returns false on that path, the caller cleared the decorations
**unconditionally**, and the chord and annotations leaked onto the first note ahead of that
note's own.

Fixed in the PARSER, where the loss was, with the three model slots and the renderer to
match. **No baseline moved** — nothing in either corpus writes one, which is exactly why it
survived.

---

## 5. **EVERY DECORATION IN THE REPO WAS UP TO 10.83px LEFT**

The largest finding of the session, and it came from a CANARY rather than a search: the
control written to prove §4 needed a boring rung showing the same coda on a NOTE, and the
boring rung disagreed with abcjs by nine pixels.

**NO GATE COULD SEE THE X OF A DECORATION**, and this is the transferable part. `pixel-parity`
and the harvested table compare what abcjs CLASSES — notehead, stem, ledger, top staff line
— and a decoration carries no class at all. `glyph-ycorr` and `above-lane-order` are ladders
of controls that measure **Y**, because each was built to name a vertical defect. Same shape
as the line weights (a centre cannot express a thickness) and the tempo notehead (no class,
so no row could ever exist).

Three rules, all in `createDecoration`:

1. **THE HALF-WIDTH SHIFT IS CONDITIONAL.** `deltaX = width / 2`, then
   `if (getSymbolAlign(symbol) !== "center") deltaX -= getSymbolWidth(symbol) / 2`
   (`creation/decoration.js:44-48`, and the identical pair at `:156-159`). **And the align is
   a RULE, not a table**: every `scripts.*` glyph is centred EXCEPT `scripts.roll`
   (`creation/glyphs.js:166-172`). We subtracted for all of them, so each mark was out by its
   OWN declared half-width — 10.83 on a fermata, 9.93 on a trill, 8.97 on a coda, 8.45 on a
   segno.
2. **THE WIDTH IS THE HEAD'S DECLARED ONE**, `(notehead) ? notehead.w : 0`
   (`abstract-engraver.js:842`) — abcjs's figure, not Bravura's outline, which is 1.90px
   narrower on a whole note and put every mark a further 0.95 left.
3. **A BARLINE HANDS IT 3 OR 1**, not the bar's drawn width
   (`abstract-engraver.js:1002`). Passing the drawn width put a coda 7.5px right.

**AND A FOURTH, WHICH IS A DIFFERENT CODE PATH: A DYNAMIC IS NOT A DECORATION.**
`volumeDecoration` builds a `DynamicDecoration` for `voice.addOther` and `drawDynamics`
calls `printSymbol(renderer, params.anchor.x, …)` (`draw/dynamics.js:8`) — no `deltaX`, no
`getSymbolWidth`, no `getSymbolAlign`. Proven by a pair rather than by reading: a whole note
and a quarter put their heads at 78.36 and 75.78 and abcjs draws the `p` at 74.21 for BOTH,
because both heads' LEFT edges are 70.86. An accidental does not move it and neither does a
grace.

`tests/decoration-x.test.ts` is the instrument — 20 rungs, abcjs's own figures, each mark
measured against the nearest notehead. **Reverting the align rule fails 15 of its 20 rungs**,
which is the canary run on the gate itself. `roll` is in it because it is the exception.

Twelve baselines moved and **every moved row is a decoration glyph** — no notehead, no line,
no text.

---

## 6. THE ONE RESIDUAL, AND IT IS RECORDED RATHER THAN HIDDEN

The dynamics' anchor is exact; their OUTLINE is not. Strict still draws Bravura's
`dynamicPiano`, ink 14.10 wide against abcjs's `p` at 14.82, and two different shapes cannot
share both a centre and a left edge. `DYNAMIC_CEILING = 0.94` in `decoration-x.test.ts`
says so, with the upgrade path. This is the last known Bravura input reachable in strict,
and the audit finding in CLAUDE.md says that class is a defect — it is now MEASURED where it
used to be a sentence in a handoff.

---

## WHAT IS LEFT

### 1. `setTiming` — the audio↔geometry JOIN, still unharvested

`timing.test.js`, 16 cases. `doTimingTest` writes `currentTrackMilliseconds` and
`midiPitches` back onto the DRAWN elements, so a note reached twice through a repeat carries
`[3000, 9000]`. The other helpers assert `noteTimings` rows carrying `milliseconds`,
`millisecondsPerMeasure`, `left`, `endX`, `top`, `height`. That is the playback cursor's
data, and where `millisecondsPerMeasure` and `getTotalTime` belong. **It is now the only
unharvested portable oracle in abcjs's suite.**

### 2. The SVG DOM contract — `visual/svg.test.js` and `svg-per-line.test.js`

Eight portable cases, corrected into the audit on 2026-08-09: they assert
`[data-name=…]` presence and group structure, which the geometry gates do not cover and
`abcts/compat` explicitly promises.

### 3. `dynamicPiano` and the rest of the dynamic glyphs

The one measured Bravura leak left in strict. §6.

### 4. THE STRUCTURAL PASS — step 1 done, the rest queued

Terms in `CHECKPOINT-2026-08-08d.md`'s `⏳` section, unchanged and NOT to be re-argued.
Remaining: split `layout.ts` along its seams mechanically; close the `ENGRAVE` bare-literal
table; then the module-level mutables *if* they are a real hazard. **NO BASELINE MAY MOVE.**

### 5. The chord grid's DRAWING

`src/write/draw/chord-grid.js`, 254 lines. Its only assertion is a DIV count under
`oneSvgPerLine`, so it needs a control ladder before it needs an implementation.

### 6. THE COMPAT WIRING IS AN API DECISION — ask Lance

`setUpAudio`, `getMidiFile` and now `chordGrid` all have working answers and none is on
`src/index.ts`'s curated surface. ARCHITECTURE.md governs.

### 7. SMALL NAMED DIVERGENCES

Full-line `I:` in strict; `(p:q:r` with `p !== r`; overlay track numbering across staves;
`transpose=` on `K:` rather than `V:`. None has a case behind it; each wants a control tune
first.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1065 / 1065
audio ranked        0 of 72
chord-grid ranked   0 of 23
midi ranked         0 of 3     BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist between
tool calls and the workspace ROOT has its own vitest reach.
