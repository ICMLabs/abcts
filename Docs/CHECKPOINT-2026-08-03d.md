# abcts — Checkpoint, 2026-08-03d

Supersedes `CHECKPOINT-2026-08-03c.md`, which stays as the record of the accidental columns,
the notehead rod, the multi-measure rest, `%%staffwidth`, the file header and `%%gchordfont`.
Nothing in it is corrected; **one of its statements is now closed** — ragtime's residual was
NOT unreachable, and what closed most of it is named below.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached.**

Read this, then `HANDOFF-2026-08-03d.md`, then `-08-03c` and `-08-03b` for the ragtime
verdict and the beam findings, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE

| corpus | standing |
|---|---|
| 41-fixture | 20 of 29 are at ZERO on all four axes. Only `ragtime-nightingale`'s `oy` is a gate failure, and it is **0.646 against 0.59** — from 1.58. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **107 / 122 / 134 / 157**, from 95 / 106 / 115 / 137. **67 of 174 still off some axis**, from 79. |
| suite | 685 of 686. The one red is ragtime's `oy`, at **0.656** against 0.59 — from 1.58, and NOT raised. |

The 41-fixture stragglers, every one named:

| fixture | dy | dx | oy | ox | what |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 58.13 | 53.56 | −0.656 | −1.69 | dy is the mis-paired pair; `oy` is the one red |
| `vree-grace-notes` | 11.64 | 32.50 | 0.00 | −1.10 | grace EMISSION ORDER, an artefact |
| `little swallow` | 0.32 | 24.19 | 0.16 | −6.29 | dx is the goldens' ASCII width table |
| `frere-jacques` | 0.00 | 22.64 | 0.00 | −3.53 | horizontal |
| `zocharti-loch` | 0.00 | 1.25 | 0.00 | −0.34 | horizontal |
| `happy-birthday` | 0.00 | **0.23** | 0.00 | −0.49 | was 3.85 |
| `multi-voice-lyrics-two-voices`, `two-voice-invention`, `vree-sharps` | ≤0.07 | 0 | ≤0.06 | 0 | sub-tenth |

---

## START HERE, EVERY SESSION

```bash
npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt
```

**Every fix below came off that table**, and three of the seven came off the ITEM PROBE
this session adds. Read the SHAPE: `dy 0.0` beside a large `dx` is horizontal; a large
`|oy|` with `dy` near zero is one rigid term; a fixture with ONE paired notehead has no
spread, so its `dy`/`dx` of 0.00 are arithmetic, not parity.

---

## THE TWO PROBES, AND WHAT THEY COST TO BUILD

### 1. THE ITEM PROBE — the horizontal workhorse, now on BOTH sides

`ABCTS_PROBE=1` prints `v / i / kind / dur / w / left / gap / er / x` per item **on the
SOLVED pass only** (the solve runs `lineAt` up to eight times). Put it beside the same line
from abcjs's own `layoutOneItem`:

```js
// voice-elements.js, right after `child.setX(x)`:
if (process.env.ABCJS_PROBE) console.log('PROBE item v=' + voice.voicenumber + ' i=' + voice.i +
  ' type=' + child.type + ' dur=' + child.duration + ' w=' + child.w.toFixed(3) +
  ' extraw=' + child.extraw.toFixed(3) + ' minsp=' + child.minspacing +
  ' er=' + er.toFixed(3) + ' x=' + x.toFixed(3));
```

```bash
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file X.abc --output /tmp/x.svg | grep '^PROBE item'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

**OUR `rod` CARRIES THE GAP WHERE ABCJS'S `w` DOES NOT** — 34.051 against its 24.051 plus
`minspacing` 10. Compare the SUM. And **read the durations first**: two of this session's
finds were a duration, not a width, and the widths beside them were already right.

`console.log` is swallowed under vitest here, so a scratch driver has to capture it. There
is no committed one — three lines of `console.log = …` in a throwaway test.

### 2. THE CONTROLLED PAIR — `tests/controlled-pair.test.ts`, and it is COMMITTED now

Reads `/tmp/abcts-probe/*.abc` beside abcjs's SVG for each and prints the four axes and
both engines' staff-line y. A no-op when the directory is absent. Its whole point is
SPLITTING A NUMBER: a ladder of eight tunes, each one field longer than the last, put
`mouse-click-01`'s 99.6px into four separate causes in one run.

---

## WHAT LANDED

### 16. A MID-TUNE `[K:]` RESERVES THE SAME DECLARED BOX THE OPENING SIGNATURE DOES

`createKeySignature` is ONE function and abcjs calls it for a mid-tune `[K:]` too. A
NATURAL's fudge is 0 and it is the tall glyph, so a change that cancels anything reserves
well above the staff: `[K:Eb]` after `K:G` put abcjs's top line **8.34px below ours**. Our
`layoutKeyChange` emitted its glyphs with no `reserve` at all. Closes
`visual-tablature-21` and `visual-transpose-01`.

### 17. `A:` AND A HEADER `P:` ARE ROWS OF THE TOP-TEXT BLOCK

abcjs draws the author right-aligned in `composerfont` and the part ORDER left-aligned in
`partsfont` (`top-text.js:68-77`), neither with a leading gap. Measured on a control pair:
**23px and 24px**. We drew neither.

### 18. EVERY `%%<type>font`, AND THREE THINGS ABOUT THEM

`score.fonts` is a record keyed by type, with abcjs's eighteen defaults beside it
(`ABC_FONT_DEFAULT_PT`). `barlabelfont` / `barnumberfont` / `barnumfont` are aliases of
`measurefont`.

- **A BARE `box` IS A WHOLE DIRECTIVE.** `%%partsfont box` names no face and no size —
  abcjs keeps both from the current setting — and still costs 8px of lane, because a boxed
  font measures `height + padding * 4`. `%%partsbox` is the SAME FLAG
  (`abc_parse_directive.js:924` writes `multilineVars.partsfont.box`), so the existing
  `partsBox` plumbing serves both.
- **THE BLOCK'S LINE ADVANCE IS THE MEASURED HEIGHT, not a ratio.** `Math.round(size.height
  * 1.1)` (`add-text-if.js:26`), where `size.height` comes from the golden's own table. The
  two agree to a hundredth on every DEFAULT size and part company as soon as a directive
  sets one the table does not list.
- The eighteen defaults land on exactly SEVEN distinct pixel sizes, which is why
  `GOLDEN_TEXT_HEIGHTS` has seven entries and covers every tune that sets no font.

### 19. ONLY A HEADER `T:` IS A TOP-BLOCK SUBTITLE

abcjs takes the title from `metaText.title` and then walks `lines` **while**
`lines[index].subtitle` holds — LEADING subtitle lines only (`top-text.js:25-32`). A `T:`
between two music lines is a subtitle LINE, drawn where it stands. Counting it in the block
cost `mouse-click-01` 29.78px on every staff.

### 20. A ZERO-DURATION NOTE SPACES AS A QUARTER

`if (duration === 0) { zeroDuration = true; duration = 0.25; nostem = true; }`, with
abcjs's own comment "zero duration will draw a quarter note head"
(`abstract-engraver.js:791`). We had the head and the stemlessness and left the ADVANCE at
zero, so every note after a `C0` sat on top of it. `parse-note-01` 63.2 → gone.

### 21. A REST IS A ROD

`getMinWidth` is `child.w` whatever the type, and a rest's `w` is its glyph — **7.534** for
an eighth, 7.888 for a quarter, 11.250 for a half. Ours was a flat **0**, so a compressed
line let the note after a rest slide onto it. Probed on `z A z2 B z4 C`: every x now agrees
with abcjs to 0.001. `happy-birthday` dx 3.85 → 1.40.

### 22. THE VOICE-OVERLAP RULE — and it was RAGTIME'S MISSING PARTNER

`voice-elements.js:36-66`. A SOUNDING note in a voice that is not its staff's top voice,
whose pitch range TOUCHES the top voice's simultaneous note (either end inside the other's
range ± 1), is displaced right of it: `child.w = firstChildNoteWidth + child.w`, and the
same is added to every relative child whose name is not an accidental. ONE exception — the
same range AND the same head glyph share a notehead and nothing moves.

It is the seconds rule applied BETWEEN voices. abcjs caches it (`child.adjustedWidth`) so
it fires once however many times the solve re-lays the line out; reproduced that way,
because the widened rod is an input to the next pass and re-applying it would compound.

`visual-layout-04` 90.1 → 1.7. **And ragtime's `oy` 1.58 → 0.646, its `ox` −1.86 → −1.69.**
The residual `-08-03b` called horizontal in origin was this, and the rest of that diagnosis
stands.

### 23. AN `&` OVERLAY'S PAD IS THE MEASURE'S OWN DURATION, NOT THE METER'S

abcjs sums `durationThisBar` over the measure's notes — SPACERS EXCLUDED — and pushes one
invisible rest of exactly that, `if (durationThisBar > 0)` (`tune-builder.js:572-575`). A
pickup bar pads to the pickup: `synth-flattener-22`'s `B, |` padded to a whole where abcjs
pads to a quarter, and the overlay voice then wanted a whole note's spring under a quarter.
84.5 → gone.

**And there is a SECOND rule in that function we do not reproduce**: for lines BEFORE the
one carrying the `&`, abcjs mirrors the main voice NOTE FOR NOTE (`tune-builder.js:539-563`)
rather than one rest per measure. The two agree when a measure holds one note, which is
every case in the corpus so far. Read that loop before touching this again.

### 24. A CHORD SYMBOL'S TYPOGRAPHY — `Bb` IS `B♭`, AND `♯` IS A FULL EM

Six substitutions on every DEFAULT-position chord (`abc_parse_music.js:652-659`): the
accidental after a root becomes its sign, and a trailing `o` / `0` / `^` becomes `°` / `ø`
/ `∆`. An ANNOTATION is prose and is left alone — abcjs's own branch. `%%freegchord` turns
it all off and is not parsed yet.

**It is not decoration.** Calibrated WebKit advances at the 16px `gchordfont` put `♯` and
`♭` at a FULL EM where `#` and `b` are 0.556, and a chord mark is CENTRED on its note, so
half of every one of those goes into the horizontal spine.
`visual-transpose-output-01` — twenty-five accidental-bearing chords — was **106.8 → 0.25**,
and `happy-birthday` 1.40 → **0.23**.

### 25. MID-TUNE NON-MUSIC LINES — a `%%text`, `%%center`, `%%sep` or `T:` between two staves

abcjs builds ONE `nonMusic` line per directive and draws it between the two staff groups
(`engraver-controller.js:229-247`). They now ride to the system that follows on
`Measure.textBefore` and hang on its first staff as the same block the tune's own title
uses, so they enter `verticalExtent` rather than float over the page.

Three things had to be right and each was measured on a control pair:

- **A mid-tune block spends NO `musicSpace`.** `spacing.music` goes once, before the first
  staff group (`draw.js:17`); a nonMusic line between two groups costs exactly its rows.
  Mid-tune `T:` **27.05px**, `%%text` 33.77, `%%center` 23.27, bare `%%sep` 28.
- **A mid-tune `T:` is a SUBTITLE element, not free text**: `spacing.subtitle` above, one
  row in `subtitlefont`, and its own MEASURED height below with no `* 1.1`
  (`elements/subtitle.js`).
- **IT IS ADDITIVE TO THE STAFF SEPARATION, NOT ABSORBED BY IT.** abcjs moves `renderer.y`
  by the rows and only THEN runs `addStaffPadding`, which reads `naturalSeparation` off the
  two groups' own overhangs (`draw.js:82-89`) and knows nothing about the cursor. Left
  inside `topLineOffset` the whole block was swallowed and a mid-tune `T:` moved nothing.

`%%sep` is three POINT measurements, each `Math.round`ed, bare is 14 / 14 / 85, and **the
RULE COSTS NO HEIGHT** — `drawSeparator` paints at the cursor and moves nothing.

**AND A `T:` AFTER ALL THE MUSIC MOVES NOTHING.** `mouse-click-01`'s "Inserted subtitle"
sits at y 630.21, below both systems: its `T:` is in the last VOICE of a system, not
between systems.

### 26. EACH ABOVE-STAFF LANE IS SPENT ONCE — the dynamic one was spent twice

`setUpperAndLowerElements` walks `staff.top` up through lyric, chord, ending, dynamic, part
and tempo IN THAT ORDER, and every element it places is measured from the running total.
`anchorAboveStaff` reproduces that stack, so what it places already sits above the lanes —
and `verticalExtent` then re-derived the dynamic lane from the elements and subtracted it a
second time on top. Probed on `mouse-click-01`: a `w:` line flips the dynamics ABOVE and
cost us **54.25px where abcjs spends 27.13**, exactly twice.

**The ENDING lane is deliberately NOT gated the same way.** `anchorAboveStaff`'s ink call
leaves it out, so the stack it places sits BELOW it and `verticalExtent` is the one place it
is spent. Gating both ways was tried and put a tempo-and-volta staff 23.25px high — **the
two lanes are in different phases and one gate cannot serve both.**

And the same idea one level down: `anchorAboveStaff`'s ink call carried the VOLTA's share of
the ending lane and not the TUPLET's, so the two calls disagreed about what the lane already
held and a volta arriving beside a tuplet jumped it by the full 6 pitch where abcjs moves 1.

### 27. THE `K:` FIELD'S FIRST TOKEN, AND FOUR THINGS THAT FALL OUT OF IT

`parseKeyVoice` consumes the first token as the KEY and shifts it off before the modifier
switch that reads clef names ever runs — but **only when it IS a key**: `HP`, `Hp`, `none`,
or an UPPERCASE A..G. `getKeyPitch`'s lowercase cases are COMMENTED OUT
(`abc_tokenizer.js:33-46`).

| written | abcjs reads | cost of getting it wrong |
|---|---|---|
| `K:none` | the none KEY, treble clef | 34.05px of prefix, `visual-transpose-06` |
| `K:C none` | C major, **NO clef element at all** | three `%%begintext` fixtures |
| `K:cm` | no key found → C major, nothing printed | 34.3px, `synth-midi-02-staccato` |
| `K: bass` | the BASS clef — `b` is not a key pitch | 105px, `parse-note-id-01` |

The first attempt skipped the first word unconditionally and broke the last row, which is
why the rule TESTS the token rather than counting.

**AND `clef=perc` DRAWS.** `case 'perc': clef = "clefs.perc"` is 21px, 26 of prefix once the
clef's own `dx = 5` is on it; we drew nothing and reserved nothing. `clef=none` really is
nothing — `createClef` returns null, so there is no element and no width either.

### 28. A MID-TUNE CLEF — `K:C clef=bass` and `[K: bass]`

Three things, and the third is the one that showed:

- **The clef in force ACCUMULATES, like the key.** `Measure.clefChange` is a delta and the
  renderer is the consumer that walks it forward; every note after it is read against the
  new clef. `visual-selection-03`'s seven lines each had their notes at the treble's
  pitches.
- **It PRINTS WHERE IT STANDS** — an ordinary zero-duration `staff-extra` before the
  measure's notes — **and is REPRINTED at the head of every system after it.** abcjs
  reprints the clef IN FORCE, not the one the voice was declared with.
- **NOT BOTH.** A `K:` written on its own line above the music it governs OPENS a system,
  so the prefix already has it. Drawing the inline one too put `visual-selection-03` 24px
  wider than abcjs on every line.

### 29. `[` BEFORE A DIGIT OR A QUOTE IS AN INVISIBLE BARLINE

`if ((line[i] >= '1' && line[i] <= '9') || line[i] === '"') return {len: 1, token:
"bar_invisible"}` (`abc_tokenizer.js:215-217`). That is how `[1 …` and `[2 …` write a repeat
ending with no barline before it, and how `["D"…` opens one carrying a chord symbol. We
lexed it as a chord that never closed: `visual-layout-09` had **seven noteheads stacked on
one x** and was 496.9px of spread, the largest item on the table.

An invisible bar draws NOTHING and takes a THIN bar's layout width — abcjs's `addRight(new
RelativeElement(null, dx, 1, 2, { type: "none" }))` (`abstract-engraver.js:996-999`) differs
from a thin bar's anchor only in the `type`.

### 30. A BAR THAT STARTS AN ENDING GETS `minspacing += textWidth + 10`

`abstract-engraver.js:1034-1041`, with abcjs's own comment "Give plenty of room for the
ending number". Probed on `synth-timing-06`: its `|1` bar reports **`minsp = 28.5`** against
a plain bar's 10, and 28.5 is 10 + 8.5 + 10.

Two things about the 8.5. It is measured in **`repeatfont`** — 13pt, 17px — NOT in the
`voltaTextSize` the bracket's number is DRAWN at; abcjs measures the reserve and the ink
with different fonts and only the first is this. And it applies to **whichever bar the
ending opens on**: the measure's own opening barline, or the PREVIOUS measure's closing one
when the number follows a `:|`.

### 31. A FOURTH GOLDEN LIMITATION — `%%jazzchords`, and it is NOT chaseable

`visual-misc-03-jazzchords` is `oy` −38.4 with `dx` 0.1, a rigid vertical term, and the
whole of it is the generator.

`translateChord` puts a `\x03` marker between a jazz chord's root, its modifier and its
bass note (`translate-chord.js:30`), and `svg.js:198-216` splits on it into NESTED tspans
at `0.7em`. The golden generator's `getBBox` then counts NON-EMPTY TSPANS and treats each
as a LINE: `if (nonEmptyCount > 1) h = h + (nonEmptyCount - 1) * fontSize * 1.2`
(`dump-svg.js:120-124`). So `"C7"` measures 18.52 + 19.2 and `"x/C"` measures 18.52 + 38.4
— against a plain chord's 18.52 — and the chord LANE takes the widest.

Worked through: 56.92 / 3.875 = 14.69 pitch against 4.78, a difference of 9.91 pitch =
**38.4px**, which is the number exactly. A real browser's `getBBox` returns ONE line's
height for nested tspans, because they ARE one line; reproducing this would put a triple
chord lane over every jazz-chord tune we draw.

Recorded like `little swallow`'s CJK widths, `vree-grace-notes`'s emission order and the
non-default font sizes: **a property of the GOLDEN, not of abcjs.**

---

## TRAPS ADDED THIS SESSION

1. **`console.log` IS SWALLOWED UNDER VITEST HERE.** `ABCTS_PROBE=1 npx vitest run` prints
   nothing at all; a driver has to capture `console.log` and write a file. Half an hour
   went on believing the probe had not fired.
2. **`cd` DOES NOT PERSIST BETWEEN Bash CALLS in this harness** — every path to
   `../abcMusicKit` has to be absolute or inside one compound command.
3. **A FIX THAT MOVES NO RATCHET COUNT CAN STILL BE THE RIGHT ONE.** The rest-rod change
   left the four counts exactly where they were and took `happy-birthday`'s dx from 3.85 to
   1.40. The counts are thresholds; a fixture that was 3.85px out and is now 1.40px out
   crosses nothing.
4. **A CORRECT ROW CAN MAKE A FIXTURE WORSE.** Adding the `A:` and `P:` rows took
   `selection-01` from 51.6 to 98.6 — both numbers honest, because the block was ALREADY
   47px short for two other reasons and the rows made the total visible rather than causing
   it. Do not revert on the aggregate; split it.
5. **A LADDER BEATS A HYPOTHESIS.** `mouse-click-01` was 99.6px out and every feature in it
   measured clean ON ITS OWN. Nine control tunes, each one field longer than the last, split
   it into four unrelated causes — the mid-tune `T:`, `%%sep`, the double dynamic lane and
   the ending lane's two halves. None of them was guessable from the 99.6.
6. **`cd` DOES NOT PERSIST**, and a `cd` inside a compound command leaves the shell
   somewhere else for the NEXT call. Running `npx vitest` from `abcMusicKit/Tools/abcjs-debug`
   silently runs THAT package's suite and leaves the last table in place, which reads as
   "the change did nothing".
7. **REGENERATING `glyphs.ts` DROPS GLYPHS.** `scripts/gen-glyphs.mjs`'s list is behind the
   committed file — a full run wrote 108 glyphs where the file has 109 and lost `restHBar`.
   Splice a single entry in by hand instead.
8. Everything in `-08-03c`'s and `-08-03b`'s trap lists still holds.

---

## VERIFY LOOP

```bash
cd Code/abcts
npx tsc --noEmit
npx vitest run          # 685/686; the ONLY expected failure is ragtime's oy at 0.646
npx biome check src tests/corpus-abcjs.test.ts tests/pixel-parity.test.ts
npm run baseline        # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short   # MUST be empty — read it, do not test the exit code
```
