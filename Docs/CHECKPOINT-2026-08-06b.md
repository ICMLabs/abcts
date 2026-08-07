# abcts — Checkpoint, 2026-08-06 (second session of the day)

Supersedes `CHECKPOINT-2026-08-06.md` for the STATE. That file keeps findings 104–105 and
**THE HARNESS**, which is still the most reusable thing written down and was used for every
finding below. `-08-05c.md` keeps 90–103 and the `ENGRAVE` triage table, `-08-05b.md` 71–89,
`-08-05.md` the line-weight audit finding and the golden-variables map, `-08-04c.md` 51–70
and the ladder method, `-08-04b.md` 41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🏁 THE RANKED TABLE IS EMPTY

```
0 of 174 fixtures are off some axis by 0.05px or more
```

That is the whole file. Not a single row. **Every fixture of the harvested corpus agrees
with abcjs on note content AND on all four geometric axes to within 0.05px** — from 10 of
174 off at the start of this session, 18 that morning, 34 on 2026-08-04.

| | standing |
|---|---|
| suite | **703 of 703. NO REDS.** |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **174 / 174 / 174 / 174** |
| 41-fixture | staff spacing 72 of 73 boundaries exact |
| CONTENT gaps | **NONE.** `CONTENT_GAPS` is empty for the first time |
| ceilings raised | still two, both recorded: `ragtime-nightingale`'s `dy` 0.40, the repeat ending's bracket PITCH 0.50 |

**AN EMPTY TABLE IS NOT THE END OF THE WORK.** What it means is that the notehead-pairing
gate can no longer name ANYTHING, and neither can the content gate. Both are regression nets
now, not instruments. Findings 113–119 were all made with the table already empty, and three
of them are exercised by no fixture in either corpus. Everything still open is invisible to
every gate — see WHAT IS LEFT and, before it, **THE GATES CANNOT SEE WHAT IS LEFT**.

---

## THE METHOD, and it did not vary once

Every one of findings 106–119 came out of the same loop, and none could have been guessed
from a diff:

1. `npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`
2. Per-notehead diff of the top entry — **read the SHAPE**: a uniform `oy` is a staff
   origin, a spread with `ox ≈ 0` is one element's width, and two POPULATIONS in one
   fixture are two different defects sharing a tune.
3. Instrument abcjs in the scratchpad copy to answer ONE question.
4. Read the named function.
5. Port the structure, then the constants.

**A CONTROL TUNE IS THE PROOF, NOT THE FIXTURE.** Finding 111 was written, measured 6 pitch
wrong on a four-bar control, and fixed before it ever touched the corpus. Without it the
error would have landed under a green ratchet — the fixture it was aimed at moved the right
way for the wrong reason.

**AND FROM 113 ONWARD THE TABLE WAS ALREADY EMPTY.** Step 1 stopped naming anything, and
every finding after it came from step 4 first: read the named function, form ONE hypothesis,
prove it on a control. Seven landed that way in one stretch, and three of them —
`%%barnumbers 0`, the bar-number baseline, the bar-number transfer — are not exercised by a
single fixture in either corpus.

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

## FINDINGS 113–119 — EVERYTHING BELOW HERE WAS FOUND WITH THE TABLE ALREADY EMPTY

Not one of them could have been named by a gate. Each came from reading abcjs and was
proved on a CONTROL TUNE before it touched a fixture.

### 113 — `fixVoiceCollisions`: A REST GETS OUT OF THE OTHER VOICE'S WAY

`layout/layout.js:140-188`, run from `:49` over TIME SLOTS after layout and after the lanes
are stacked — and deliberately not followed by a second lane pass, abcjs's own
`//setUpperAndLowerElements(…)` being commented out on the next line. So the moved rest
changes the staff extent and the staff-to-staff spacing, and does NOT move the lanes.

Slots are bucketed by X rather than by time, and that is the same partition on one staff:
every voice is laid out against ONE cursor, co-timed elements land at the same x by
construction, `shiftRight` carries the whole slot when one needs room, and the cursor only
moves forward. It needs no `duration` on `LayoutElement`, which nothing else wants.

Against abcjs's own goldens, all rests within 0.003px: `multi-voice-rest-placement` 4 of 4
(two were 26.39px and 10.89px out), `multi-voice-rest-collision` 1 of 1.

### 114 — …AND A REST THAT EXACTLY FILLS ITS MEASURE BECOMES A WHOLE REST

The rule filed unchecked on 2026-08-06, and finding 113 is what forced it:

```js
if (this.measureLength === duration && type !== 'invisible' && type !== 'spacer' &&
    type.indexOf('multimeasure') < 0) elem.rest.type = 'whole'
```

(`abstract-engraver.js:811-813`.) It reaches THREE places: `case "whole"` draws
`chartable.rest[0]`, it sets `dot = 0` so a dotted rest filling its bar loses its dots, and
**`fixVoiceCollisions` weeds on `rest.type === 'rest'` EXACTLY** — so a whole rest never
gets out of anyone's way. Without it `zocharti-loch`'s `z8` moved 2.51px abcjs does not move
it, and our pass evaluated three slots where abcjs evaluates one.

**abcjs's own slot dump is what named it**: `note/whole[rests.whole]`, not `note/rest`.

### 115 — A BAR NUMBER'S BASELINE IS ONE FONT SIZE BELOW THE POINT IT RESERVES

`renderText` ends `if (!params.centerVertically) hash.attr.y += hash.font.size`
(`draw/text.js:29-30`) and the `barNumber` case passes no `centerVertically`. Its
RelativeElement carries no `thickness`, so what it reserves is a POINT — which the staff
extent already had right — and only the drawn text moves. We drew it AT the point: **24.94px
above the top staff line against abcjs's 5.93**, on every bar number there has ever been.

### 116 — A BAR NUMBER ON THE LAST BARLINE OF A LINE MOVES TO THE NEXT LINE'S STAFF

`tune-builder.js:137-143`, under abcjs's comment *"Don't hang a bar number on the last bar
line: it should go on the next line."* With no next line it is DELETED, which is why a tune
ending `…|` prints nothing there. It runs in `cleanUp` per line, so it applies to EVERY
`%%barnumbers N`.

### 117 — `%%barnumbers 0` PUTS THE NUMBER ON THE STAFF, NOT ON A BARLINE

`abc_parse_music.js:1036-1038` → `addMeasureNumber(abcstaff.barNumber, clef)`
(`abstract-engraver.js:161`). **That is the only path on which `abselem.isClef` shifts the
number right by half its width and the `vert = 13.5` branch can fire**; on a barline neither
can. And the two mechanisms MEET — finding 116 hands its number to the same staff slot.

Measured, every number and x identical to abcjs:

```
%%barnumbers 1, one line     2, 3                            (we drew 2, 3, 4)
%%barnumbers 1, two lines    2 @371.92, 3 @19.75 ON THE CLEF, 4 @218.76
%%barnumbers 0, three lines  3 @19.75, 5 @19.75, both on the clef  (we drew none)
```

### 118 — A BEAM DOES NOT BREAK AT A REST, AND THE GATE COULD NOT SAY SO

```js
} else if (hashParams.rest === undefined) {   // a short note, not about to end the beam
  if (tune.potentialStartBeam === undefined) { …start here… }
  else { tune.potentialEndBeam = hashParams }  // continue the beaming
}
```

(`tune-builder.js:195-203`.) A short REST reaching that branch **falls off the END of the
chain**: neither made `potentialEndBeam` nor allowed to close the run, so the beam SPANS it
and its last member stays the last NOTE. Only an explicit break stops it, and that is the
branch above — a space sets `end_beam`, and on a rest it takes `endBeamLast` where on a note
it takes `endBeamHere`.

**AND `beamLinks` COULD NOT EXPRESS THE DIFFERENCE.** It compared each event with the one
PHYSICALLY before it and mapped a rest to `null`, so `run === runs[i-1]` was false on either
side of a rest whatever its neighbours were — a beam spanning one and two beams broken by
one read IDENTICALLY. Comparing against the previous event IN A RUN makes it expressible,
and with that it fails on three of the 41 under the old behaviour and passes under the new.
**A comparison can only catch what its representation can express**, for the second time on
this branch.

The proof is a COUNT abcjs's SVG gives directly: which notes carry a FLAG. On
`cegczg|czg cz|c z c z` ours now matches abcjs element for element on x and on flags.

### 119 — AND THE TUPLET NUMBER FOLLOWED IT, both halves

Two rules previously READ and left out, both because the input was not abcjs's quantity:

- **The baseline is `calcY(yTextPos - 1)`, flat, with no font height** —
  `centerVertically: true` suppresses the `+= font.size` (`draw/triplet.js:11`). The `- 1`
  is abcjs's own fudge: *"HACK: adjust the position of '3'. It is too high in all cases."*
- **`heightAtMidpoint` samples the BEAM, not the stems that end on it** — `beam.beams[0]`'s
  own `startY`/`endY` (`layout/triplet.js:110-116`). A `PlacedLine` carries the beam's
  CENTRE and abcjs's `startY` is the edge the stems end on, half a thickness back out.
  Undone from the line's OWN thickness rather than by repeating `layoutBeam`'s constant.

Neither was portable until 118 landed. `(6cegczg (3czg` now matches abcjs on both axes to
the hundredth, and every tuplet number of `multi-voice-triplet-brackets` sits at ONE constant
offset per staff from abcjs's — 127.353..127.362 and 268.962, which is the staff origin and
nothing else. **The checkpoint's two open numbers, 4.91px in x and 38.8 in y, are closed.**

---

## WHAT IS LEFT

### 1. ~~`fixVoiceCollisions`~~ — DONE, finding 113

### 2. ~~The beam across a rest~~ — DONE, finding 118, and the tuplet number with it (119)

### 3. ~~The two rules read but not checked~~ — DONE, findings 114 and 117

### 4. THE REMAINING FIXED LANES

`chordSymbolStep`, `dynamicAboveStep`, `dynamicBelowStep`, `annotationAboveStep`,
`annotationBelowStep`, `partStep`, `tempoStep`, `lyricStep`. One decision, not eight.
`anchorVoltas` (finding 93) is the model: resolve in the pass that has the final elements,
shift furniture only, and **check first that the lane's ink is outside the staff extent**.

### 5. ~~The leading-header split~~ — DONE, finding 120

`bookParser` splits on `"\nX:"` and SHIFTS OFF the first piece when it does not start with
`X:`, keeping only its `%%` lines (`abc_parse_book.js:12-33`). The test is "no `X:` yet",
not "empty" — `isEmpty` also wanted no `T:` and no music. **The `CONTENT_GAPS` entry
described the symptom and guessed the cause backwards**, the second allowlist on this branch
written from a plausible reading rather than from the source.

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
