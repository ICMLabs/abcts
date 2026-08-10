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
| suite | **1126 of 1126. NO REDS.** |
| **audio ranked table** | **0 of 72** — was 2 of 61; the corpus GREW by 11 controls |
| **chord-grid ranked table** | **0 of 23** — NEW, and the feature is new with it |
| midi-file ranked table | **0 of 3 — BYTE-EXACT** |
| harvested ranked table | 0 of 174 |
| pixel ranked table | 0 of 120 |
| **timing ranked table** | **0 of 38** — NEW (13 harvested + 25 controls) |
| **element-timing ranked table** | **1 of 13** — abcjs's own quirk, §7 |
| **DOM-contract ranked table** | **25 of 25** — NEW, and opening at every case IS the point |
| gates | **16** (32 test files) |

**ONE NAMED ROW LEFT ON ANY TABLE**, and it is abcjs being idiosyncratic rather than us
being wrong — see §7. The engine's last ordinary defect, the host drum options, closed
first thing this session.

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

## 7. `currentTrackMilliseconds` — A THIRD SURFACE, AND IT FOUND TWO THINGS THE OTHERS COULD NOT

The event table says WHAT sounds; `setTiming` says where the CLOCK is; this says which
WRITTEN element is lit. abcjs stamps it from inside the FLATTENER
(`abc_midi_flattener.js:526-546`), which is why `doTimingTest` calls `setUpAudio()` and
never `setTiming()`. `flattenAudio` now returns `elementTimings`, keyed by the source event
object.

**A note reached twice through a repeat carries both times**, and the shape is the contract:
a number until a second DIFFERENT value arrives, an array after that, duplicates from other
voices dropped. Reproduced rather than normalised.

**FINDING ONE — A REPEAT'S LAST ENDING WAS PLAYED TWICE.** `resolveRepeats` pushed a
synthetic `startRepeat` for any final section that was not one, including the `startEnding`
of a LAST ending: it closed the repeat at that index and opened a new one there.
`CDE|:FG[Ab]|1 Bcd:|2 efg|]` played `efg` at 12000 AND at 15000, and ended at 18000 where
abcjs ends at 15000. **NO EVENT-LIST GATE COULD SEE IT** — the audio table is 0 of 72 and the
MIDI file is byte-exact, and neither has a case with the second ending LAST. A doubled pass
reads as "more notes" on a table nobody counts by hand; it reads as a doubled ENTRY here.
The `endRepeat` arm of that guard is load-bearing (removing it reds four cases), so the fix
narrows the condition rather than deleting it.

**FINDING TWO — A SPACER IS NEVER STAMPED AT ALL.** It reaches `writeNote` in neither
engine, so abcjs's element carries no `currentTrackMilliseconds` rather than one it ignores.
`CzE|DyFG|`: the `z` rest IS stamped and the `y` is not.

**AND THE ONE OPEN ROW.** `el-four-endings` — `|1,3 … :|2,4 …` — is a corner where abcjs's
OWN answer is idiosyncratic: `repeats.js` leaves the final ending's `end` undefined and
`duplicateSpan`'s `for (i = start; i <= undefined; i++)` emits nothing for it, so abcjs
plays `[CDE FGA][CDE][CDE FGA][CDE cde]` — a second pass with no ending at all. Ours plays
the four passes the sparse array describes. **Measured on a control, named in the table, and
not guessed at.** Closing it means porting that undefined-end behaviour deliberately; it is
a decision, not a bug fix.

---

## 8. THE SVG DOM CONTRACT — the eighth table, opening at 25 of 25, **which is the point**

`tests/corpus-dom/` (25 cases, `npm run gen:dom-contract`) + `tests/dom-contract.test.ts`.
The oracle lands before a line of the implementation, as it did for audio, the MIDI file and
the chord grid — and a table that opens at every case is the same signal 54 of 54 was.

**THE AXIS HAD NO INSTRUMENT AND COULD NOT HAVE HAD ONE.** `pixel-parity` and the harvested
table resolve both SVGs to ABSOLUTE PIXELS and compare positions — they throw the markup
away on purpose, because that is how they see past `<rect>`-versus-`<path>` and
Bravura-versus-abcjs outlines. The structural gate compares abcjs's LAID-OUT ELEMENTS, its
internal tree rather than its output. So the thing a drop-in replacement is actually judged
on — does `querySelector('[data-name="note"]')` find a note, and is it inside the group a
host expects — has never been measured, and `abcts/compat` promises it in as many words.

Compared: `class`, `data-name` and **DEPTH**, so grouping is part of the contract. NOT
compared: the tag name — a staff line is a `<path>` in abcjs and a `<rect>` here, which the
pixel gate already proves equivalent, and folding it in would drown the axis.

**THE GAP IS BOUNDED AND NAMED**, which is what the table is for. We already emit
`abcjs-top-line`, `abcjs-ledger`, `abcjs-stem`, `abcjs-notehead` and the `data-name` groups.
Three things are missing:

1. **The wrappers.** abcjs nests `<g class="abcjs-staff-wrapper abcjs-l0">` →
   `<g class="abcjs-staff abcjs-l0 abcjs-v0">` holding the five staff lines, with every
   element group a SIBLING of that inner group rather than a child. Ours has no wrappers at
   all, so the very first row differs on depth.
2. **The per-element class scheme.** `abcjs-note abcjs-d0-25 abcjs-p0 abcjs-l0 abcjs-m0
   abcjs-mm0 abcjs-v0 abcjs-n0` — kind, duration (`.` → `-`), pitch, line, measure, ?, voice
   and note index. A staff-extra takes the same set less `d`/`p`/`n`. **Read
   `src/write/classes.js` for the generator rather than inferring it from the goldens** —
   the `mm` component in particular is not guessable from one tune.
3. **The note group's child ORDER.** abcjs writes notehead, stem, ledger; we write ledger,
   stem, notehead. Cheap, but check `glyph-ycorr`'s positional `slice(1)` before moving it.

Three of the tunes are `visual/svg.test.js`'s own; twenty-two are controls, one feature each,
because that file covers a clef, a time signature and a note and nothing else — and a
contract is exactly the kind of thing that holds for what someone tested and lapses for what
they did not.

**`svg-per-line.test.js`'s five cases are NOT in this corpus**: they assert a COUNT of
`<svg>` elements under `oneSvgPerLine` / `responsive` / `scale`, which are FEATURES compat
does not implement. That is a separate gap and a larger one.

---

## WHAT IS LEFT

### 1. `setTiming` — **DONE for the TIME half; the GEOMETRY half has no oracle**

`src/audio/timing.ts`, 0 of 38. Two things are recorded rather than assumed:

- **`left` / `endX` / `top` / `height` are on every row abcjs publishes and its own
  `timing.test.js` asserts NONE of them.** A green timing table is the CLOCK, not the
  audio↔geometry join. Building that half needs an oracle first, and there is none in
  abcjs's suite — a control ladder against its rendered SVG is the only route.
- **`doTimingTest`'s two `elements` cases are a THIRD surface** and are still unread:
  `currentTrackMilliseconds` and `midiPitches` are stamped back onto the drawn elements by
  the FLATTENER (`abc_midi_flattener.js:530-540`), not by `setupEvents`. A note reached
  twice through a repeat carries `[3000, 9000]` — an array where a once-played note carries
  a number, which is the shape to reproduce.

**AND THE HARVESTED CORPUS COULD NOT DEFEND ITS OWN CODE**: its twelve warp cases are two
4/4 tunes with no pickup, one voice and no mid-tune tempo, so deleting
`startingDelay -= getPickupLength()` outright left the table at 0 of 13. The 25 controls in
`tests/corpus-timing-controls/` are what close that, and `repeat-endings` named a real
defect on its first run — `|1` is ONE element in abcjs and two in our model, the same split
the chord grid hit, load-bearing here because `startEnding === '1'` is what stops the replay
before the first ending.

### 2. THE DOM CONTRACT — the open arc, 25 of 25

§8 has the three missing pieces and where to read them. **This is the only table with real
work behind it.**

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
npx vitest run      1126 / 1126
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13   (`el-four-endings`, abcjs's own quirk)
DOM contract       25 of 25   THE OPEN ARC
chord-grid ranked   0 of 23
midi ranked         0 of 3     BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist between
tool calls and the workspace ROOT has its own vitest reach.
