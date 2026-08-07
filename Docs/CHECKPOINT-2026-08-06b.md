# abcts — Checkpoint, 2026-08-06 (second session of the day)

Supersedes `CHECKPOINT-2026-08-06.md` for the STATE. That file keeps findings 104–105 and
**THE HARNESS**, which is still the most reusable thing written down and was used for every
finding below. `-08-05c.md` keeps 90–103 and the `ENGRAVE` triage table, `-08-05b.md` 71–89,
`-08-05.md` the line-weight audit finding and the golden-variables map, `-08-04c.md` 51–70
and the ladder method, `-08-04b.md` 41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🏁 THE RANKED TABLE HAS NO GEOMETRY LEFT ON IT

```
1 of 174 fixtures are off some axis by 0.05px or more
   ------  TUNE COUNT 2 vs 1  abcjs-parse-book_parser-04-wed
```

That is the whole table. The one entry is the leading-header tune-count mismatch, which has
no geometry to compare. **Every measurable fixture in the harvested corpus is exact on all
four axes to within 0.05px** — from 10 of 174 at the start of this session, 18 that morning
and 34 on 2026-08-04.

| | standing |
|---|---|
| suite | **703 of 703. NO REDS.** |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **173 / 173 / 173 / 173** |
| 41-fixture | staff spacing 72 of 73 boundaries exact |
| CONTENT gaps | **one** — `parse-book_parser-04-wed`'s leading-header split |
| ceilings raised | still two, both recorded: `ragtime-nightingale`'s `dy` 0.40, the repeat ending's bracket PITCH 0.50 |

**A CLEAN TABLE IS NOT THE END OF THE WORK.** What it means is that the notehead-pairing
gate can no longer name the next defect. Everything below that is still open is invisible to
it — see WHAT IS LEFT.

---

## THE METHOD, and it did not vary once

Every one of findings 106–111 came out of the same loop, and none could have been guessed
from a diff:

1. `npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`
2. Per-notehead diff of the top entry — **read the SHAPE**: a uniform `oy` is a staff
   origin, a spread with `ox ≈ 0` is one element's width, and two POPULATIONS in one
   fixture are two different defects sharing a tune.
3. Instrument abcjs in the scratchpad copy to answer ONE question.
4. Read the named function.
5. Port the structure, then the constants.

**A CONTROL TUNE IS THE PROOF, NOT THE FIXTURE.** Finding 110 was written, measured 6 pitch
wrong on a four-bar control, and fixed before it ever touched the corpus. Without it the
error would have landed under a green ratchet — the fixture it was aimed at moved the right
way for the wrong reason.

---

## FINDING 106 — A CHORD SYMBOL WRITTEN BEFORE A BARLINE BELONGS TO THE BARLINE

```js
if (el.decoration !== undefined) bar.decoration = el.decoration;
if (el.chord !== undefined)      bar.chord = el.chord;
…
el = {};
```

(`abc_parse_music.js:286-289, 305`.) The decoration half was already ported; the chord half
was not, and it is the next line. `createBarLine` then ends by running the very same
`addChord` a note gets, at `roomTaken = 0` and **`noteheadWidth = 0`**
(`abstract-engraver.js:1047-1049`), so the mark is CENTRED on the barline and `addCentered`
gives the bar `w = chordWidth / 2`, `extraw = -chordWidth / 2` over the flat `-5` a bare
barline declares. abcjs probes `"D"|` at `w = 5.781` against 1.

`"D"|` is how a downbeat chord change is normally written. Carrying it to the next note put
our mark 15.8px right of abcjs's and spread every notehead on the line by 0.93px.
`transpose-output-03` went exact.

A barline that OPENS a measure keeps nothing — `closeMeasure` returns `false` there and the
chord stays pending, rather than being lost.

## FINDING 107 — A NOTE'S GRACE STEMS ARE PART OF THE `abselem.top` A DECORATION STACKS ON

`createDecoration` is handed `abselem.top` (`abstract-engraver.js:842`) with `addGraceNotes`
already run four lines above it, so an UNBEAMED grace's stem and flag are children and set
that top. Probed on `{c}+1+B`: `abselem.top = 11.2`, the grace's flag exactly, against the
main head's 7.04. A BEAMED grace group is the exception by the phase argument that keeps one
out of the staff extent.

**IT BITES ONLY THROUGH A CLAMP**, which is why one tune of a transposed pair showed it and
the other could not: `decorationMinTop` is 12, `{c}+1+B` reaches 11.2 and clamps, `{d}+1+c`
reaches 12.2 and keeps it. 0.2 pitch — 0.775px — under every notehead on
`transpose-output-04`.

## FINDING 108 — A REST'S CHORD SYMBOL IS CENTRED ON THE ELEMENT, NOT ON THE REST GLYPH

`createNote` declares `var symbolWidth = 0` and assigns it **only in the note arm** —
`symbolWidth = ret2.symbolWidth` inside the `else` (`abstract-engraver.js:784, 827`). So the
`noteheadWidth` reaching `addChord` on a rest is a flat zero and `addCentered` gets `dx = 0`
where a note gets half a head. abcjs's own SVG centres `"Eb7"z`'s chord at 109.84, the
rest's x, and probes the element at `w = 17.789` — exactly half the chord, no rest glyph in
it. 0.53px under every notehead after it.

## FINDING 109 — FOUR OF ABCJS'S NOTEHEADS WERE NEVER IN OUR COPY OF ITS GLYPH TABLE

**And it was our GENERATOR, not abcjs's absence.** abcjs closes its table literal and then
adds four more by assignment, under its own comment *"Custom characters that weren't
generated from the font"*: `noteheads.slash.whole`, `.slash.quarter`, `.harmonic.quarter`,
`.triangle.quarter` — every STYLED head, which is exactly what `%%percmap` and `V:… style=`
reach. `gen-abcjs-glyphs.mjs` sliced from `var glyphs =` to the literal's `};`.

A name this table does not hold falls through to **Bravura** in strict, which the Bravura
ruling makes a defect. **AND A TEST ASSERTED THE FALLBACK**: `glyph-table.test.ts` listed
`noteheadDiamondBlack` under "Bravura stands in where abcjs has no such glyph" and so froze
it in place. *A fallback test only means something if the absence it names is real* — the
other two names in that list are genuine and stayed.

Two side effects worth keeping:

- With the four mapped, abcjs's rhythm split by durlog becomes expressible, and that line —
  `.slash.whole` for a whole or half, `.slash.quarter` for a quarter and shorter — is
  exactly the `open`/`filled` line `STYLED_HEADS` already draws. Two Bravura names, no new
  mechanism.
- **Three glyphs had been hand-added to `glyphs.ts` against its own DO-NOT-EDIT header**
  (`unpitchedPercussionClef1`, `restHBar`, `timeSigPlus`). Regenerating would have deleted
  them silently. They are in the generator's list now.

## FINDING 110 — EVERY DECLARED BOX IS CENTRED ON THE PITCH, INCLUDING A NOTEHEAD'S AND A REST'S

`thickness: symbolHeightInPitches(c) * scale` → `pitch ± thickness / 2`
(`create-note-head.js:33-35`, `relative-element.js:22-24`). Our vertical scan falls back to
the glyph's **INK** box when an element sets no `reserve`, and for months nothing showed it
because the ROUND heads are near-symmetric: `noteheads.quarter` inks `[-4.08, +4.05]`
against a declared `±4.047`, a third of a tenth of a pixel.

**THE STYLED AND REST GLYPHS ARE NOT.** `noteheads.triangle.quarter` inks `[-5, +4]` against
a declared `±4.5` — half a pixel too tall above and half too short below. `rests.quarter`
inks 11.88px up and 9.6 down around a declared `±10.7175`.

Four fixtures came off the table on the notehead half alone: both `percmap` ones,
`visual-wrap-04` and `visual-multi-voice-02`.

## FINDING 111 — A BEAMED NOTE HAS NO STEM YET WHEN ITS DECORATIONS ARE PLACED

`createBeam` passes `nostem`, so `createNote` builds no stem child and `abselem.top`/
`.bottom` are the heads alone. abcjs guesses the rest in one line:

```js
var bottom = nostem && dir !== 'up' ? Math.min(-3, abselem.bottom - 6) : abselem.bottom
```

(`abstract-engraver.js:841`.) A flat **6-pitch drop with a FLOOR at pitch −3**, neither
figure the stem's real end. **There is no matching term on the ABOVE side** — that one takes
`abselem.top` raw. Ours read the real beamed stem on both sides, which is wrong twice over:
the stem does not exist yet, and where it will end is not what abcjs uses.

Verified on a control, ours against abcjs instrumented, all six marks agreeing to six
decimals where four were 6 pitch out:

```
.a.b (beamed, down)     staccato above   16.044387  17.044387
.C.D (beamed, up)       staccato below   -3.044387  -2.044387
!invertedfermata!abab                    -4.954710      ← the -3 floor biting
!invertedfermata!CDCD                    -2.999097
```

**THE SIX OF THE DROP AND THE SIX BETWEEN THE ORIGINS ARE DIFFERENT SIXES.** The first
attempt did the arithmetic at the call site, which works in staff STEPS, with figures abcjs
states in PITCH. It was 6 pitch out and the control caught it. The drop is applied inside
`decorationGlyphs`, beside the other pitch arithmetic.

## FINDING 112 — A REST MOVES OFF THE MIDDLE LINE WHEN IT SHARES A STAFF

```js
if (isMultiVoice) {
  if (stemdir === "down") restpitch = 3;
  if (stemdir === "up")   restpitch = 11;
}
```

(`abstract-engraver.js:544-551`, from a default 7.) `isMultiVoice` is `voice.voicetotal > 1`
— **this voice's own staff**, not the tune — and `stemdir` is the direction `stemForVoice`
already models. **The two conditions are separate**: a lone voice with `V:… stems=up` has a
direction and takes no shift, so the existing `voiceStem` could not be used on its own and a
`sharedStaff` flag is threaded down beside it.

`restpitch` is ONE variable — `createNoteHead(abselem, c, { verticalPos: restpitch })` both
draws the glyph and centres its box — so the four pitch move both. Applied as a DELTA,
because our own anchor already draws where abcjs's default does: measured on a control, our
rest ink sits 14.360px below the top staff line against abcjs's 14.362.

---

## WHAT IS LEFT, and none of it is on the ranked table

### 1. `fixVoiceCollisions` — MEASURED, NAMED, NOT IMPLEMENTED

`layout/layout.js:140-188`, called from `:49`. A pass over TIME SLOTS, after layout: where a
slot holds a real rest in the first voice and a non-rest in the last (or the mirror), it
pushes the rest clear of the other voice's nearest note and gives 2 pitch of room, moving
the element's `top`, `bottom` and its first child's `pitch` together.

Measured on `multi-voice-rest-placement` against abcjs's own golden: of its four rests, two
now land on abcjs's y exactly (finding 112) and **two are still off — 26.39px and 10.89px**,
which is this pass. `multi-voice-rest-collision` is the second fixture aimed at it.

**NO GATE CAN SEE IT.** Rests carry no class in the pixel gate, and the notehead-pairing
table cannot reach them. The baselines are the only witness, and they only say "changed".

### 2. A BEAM DOES NOT BREAK AT A REST IN ABCJS, AND IT DOES HERE

Unchanged from the last checkpoint. `(6cegczg` and `(3czg` are beamed by abcjs and bracketed
by us; the tell is a COUNT — abcjs draws three triplet-bracket paths in `S3-note-syntax`
tune 6 where we draw fourteen pieces. Fixing it changes beam GROUPING and moves real beams on
every tune with a rest inside one, so it is a slice of its own. It settles the two tuplet
numbers still off, 4.91px in x and 38.8 in y.

### 3. TWO RULES READ BUT STILL NOT CHECKED

Carried from the last checkpoint, neither exercised by anything red:

- **A rest that exactly fills a measure becomes a WHOLE rest**, whatever its written
  duration — `if (this.measureLength === duration && type !== 'invisible' && type !==
  'spacer' && type.indexOf('multimeasure') < 0) elem.rest.type = 'whole'`
  (`abstract-engraver.js:811`). Do we?
- **`%%barnumbers 0` puts the number on the STAFF, not a barline**
  (`abc_parse_music.js:1036`), which reaches `addMeasureNumber(barNumber, clef)` — and THAT
  is the path where `abselem.isClef` shifts the number right by half its width and the
  `vert = 13.5` branch can fire.

### 4. THE REMAINING FIXED LANES

`chordSymbolStep`, `dynamicAboveStep`, `dynamicBelowStep`, `annotationAboveStep`,
`annotationBelowStep`, `partStep`, `tempoStep`, `lyricStep`. One decision, not eight.
`anchorVoltas` (finding 93) is the model: resolve in the pass that has the final elements,
shift furniture only, and **check first that the lane's ink is outside the staff extent**.

### 5. THE LEADING-HEADER SPLIT — the last CONTENT gap

`parse-book_parser-04-wed`, 2 tunes against 1.

### 6. Then Gonzato, then audio.

---

## THE GATES CANNOT SEE WHAT IS LEFT — READ THIS BEFORE PICKING THE NEXT THING

The ranked table drove every session from 2026-08-03 to this one and it has run out. What
each gate is blind to, restated because it now decides the work:

| gate | blind to |
|---|---|
| ranked table / pixel parity | anything not classed a NOTEHEAD by abcjs — rests, beams, ties, tempo notes, bar numbers, decorations, text |
| baselines | correctness. They say CHANGED, never WRONG |
| structural (`.elements.json`) | anything added via `addOther` — slurs, ties, endings, triplets |
| line weights | position. It reads THICKNESS only |

So the next findings have to come from READING abcjs and checking with a control tune, the
way findings 111 and 112 did. **A measurement can only rank hypotheses you already have.**

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 703/703
npx biome check src                   # `src` ALONE. It is NOT clean — 1 error, 4 warnings,
                                      # all PRE-EXISTING. Diff against a stash before blaming
                                      # yourself; the line numbers shift under every edit.
npm run baseline                      # READ the diff, and MEASURE anything that moved
git status --short                    # `git add -A` swept a probe into a commit on 08-06
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Another agent works in it. Never commit
there, never revert anything there, and check whether the paths are ones you touched before
reading a dirty status as evidence.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there.** Put
the absolute `cd /Users/lrettberg/ICMLabs/Code/abcts &&` in front of every command. **vitest
SWALLOWS console.log on a passing test** — `--disableConsoleIntercept`, or write to a file.
**DELETE YOUR PROBE BEFORE COMMITTING.**
