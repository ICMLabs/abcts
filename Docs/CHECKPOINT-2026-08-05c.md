# abcts — Checkpoint, 2026-08-05 (c)

Supersedes `CHECKPOINT-2026-08-05b.md` for the STATE. That file keeps findings 71–89 and
Lance's `ENGRAVE` question; `-08-05.md` keeps the line-weight audit finding and the
golden-variables map, `-08-04c.md` findings 51–70 and the ladder method, `-08-04b.md`
41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## STATE

| | standing |
|---|---|
| suite | **703 of 703. NO REDS.** |
| harvested (174) | **18 of 174 off some axis**, UNMOVED — nothing this session touched a notehead. |
| the ranked table | unchanged: nothing above 1.77px, not one `dy` term. |
| `ENGRAVE` | **115 → 101 constants.** Bare literals 49 → **38**. |
| the repeat ending | **ALL FIVE AXES CLOSED.** Both brackets span exactly abcjs's, on both ends. |
| the audit finding | **RE-OPENED AND CLOSED PROPERLY.** It was not closed; see findings 96-98. Both un-audited classes are now done, and the first is enforced by the TYPE SYSTEM. |

**WHAT THE TRIAGE HAS PAID FOR.** Fourteen dead constants deleted, and five more once the
dead FIELD keeping them alive was found. A repeat ending corrected on five axes. A dotted
REST's dot arithmetic. Three constants cited with a zero-line baseline diff and three
defaulted parameters closed. Handles for five constructions no comparison could reach at
all, and three of their constants ported the same hour. **A Bravura figure still reachable
in `abcjs-strict`, in the class a previous session had declared closed** — plus two more in
raw glyph reads, up to 2.51px and changing sign with the glyph. And the curve endpoints
finding 89 left.

Not one of these came from a fixture or a ranked-table entry. **That is the argument for
auditing rather than hunting**, and it is also why the ranked table has not moved: it pairs
NOTEHEADS, and almost nothing found this way is one.

---

## THE ANSWER TO LANCE'S QUESTION, AS FAR AS IT GOT

> *"We keep measuring differences to abcjs — when shouldn't we be using abcjs values?"*

The triage was the session's first job and it is **partly done**. What follows is the census
and the classification; the table at the bottom is the durable output and the next session
should work down it rather than re-deriving it.

### FINDING 90 — THE FIRST QUESTION WAS SMALLER THAN "WHOSE IS THIS?"

It is **"is this read at all?"**, and the answer for **fourteen of 115** constants was no —
by any site in `src` or `tests`:

```
ornamentStep  titleStep  lyricVoiceStep  minStemLength  beamMaxRise  tupletGap
barNumberSize  titleTextSize  subtitleTextSize  composerTextSize  infoTextSize
freeTextSize  freeTextSpace  freeTextBelowSpace
```

They are not inert. **Ten are a SECOND derivation of a quantity the use site now computes
for itself** — the text sizes off `ABC_FONT_DEFAULT_PT` and `fontPixels`, `lyricVoiceStep`
off the golden text table — which is the shape of the lyric-reserve bug: one number in two
places whose inputs can drift apart. The other four are PROVISIONAL *Behind Bars* figures
stranded by ported abcjs constructions, and nothing distinguished a live engraving
judgement from a dead one at a glance.

Deleted. **Baseline diff of ZERO lines**, which is the proof this file prescribes.

### FINDING 91 — A REPEAT ENDING WAS WRONG ON FIVE AXES, AND NO GATE COULD SEE ONE OF THEM

Found by the AUDIT, not by a fixture — which is the whole argument for doing it as an
audit. `voltaHook`, `voltaTextSize` and `voltaStep` are three of the 61; asking "whose is
this?" led to `drawEnding` (`draw/ending.js:8-46`), which has its own figure for every one.
All measured against `S4-bars-repeats`' golden:

| | abcjs | ours | status |
|---|---|---|---|
| end-hook drop | `height = 20` | 1.4 spaces = 10.85px | **PORTED** (was blocked on the lane) |
| bracket rules | no `stroke-width`, so SVG's 1px | `thinBarline`, 0.6 | **PORTED** |
| label indent | `linestartx + 5` | 0.4 spaces = 3.1px | **PORTED** |
| label size | `repeatfont` 13pt → 17px | 1.3 spaces = 10.07px | **PORTED** (was blocked on the lane) |
| bracket pitch | stacked staff top, 29.93px above the top line | fixed lane, 15.5px | **PORTED** |
| bracket ends | the BARLINE RULES | the measure's first ink, +28.5px | **PORTED** |

**ALL FIVE ARE NOW CLOSED** — see findings 93 and 94 below. The 0.50px that remains on the
bracket's pitch is not the ending at all: our staff's ink top reads 13.85 pitch where
abcjs's dumped `staff.top` is 13.7244, and the bracket rides on it.

**WHY IT WAS INVISIBLE, THREE TIMES OVER.** An ending is not a notehead, so `pixel-parity`
never looks at it. It is not classed `stem`, `ledger` or `top-line`, so the thickness cases
never look at it. And abcjs draws the whole bracket as ONE `<path data-name="line">`, so
the barline-separation case cannot reach it either. Three gates, three different reasons,
one blind spot.

**AND ONLY TWO OF THE FIVE WERE PORTABLE AT FIRST, WHICH IS THE REAL FINDING.** abcjs's 20px hook
clears the staff only because abcjs's bracket sits 29.93px above the top line where ours
sits 15.5. Drop the 20 into our lane and the hook ends **4.5px INSIDE the staff**, and
`layout.test.ts`'s "clear of the music" says so instantly. **The two numbers were
COMPENSATING, which makes them one port rather than two.** The label size is coupled the
same way; the indent is horizontal and the rule weight is a scalar, so no lane can reach
either, and those landed.

> **A CORRECT CONSTANT IS NOT ALWAYS AN IMPROVEMENT.** PORT THE STRUCTURE, THEN THE
> CONSTANTS — stated in `CLAUDE.md` for months, and this is the first case where obeying
> it meant deliberately NOT landing a figure that is certainly abcjs's. Finding 93 landed
> the structure and both figures went in behind it, unchanged, the same day.

The lane is `set-upper-and-lower-elements.js:32-36`: the ending reserves
`endingHeightAbove + margin`, or a flat 2 when a chord lane is present, and is DRAWN at the
top it just reserved. `layout.ts:7266` already named moving it into `anchorAboveStaff`'s
stack as the proper fix, long before this.

The ends are `anchor.x + anchor.w` to open and `anchor.x` to close, where `anchor` is the
bar's LAST rule (`abstract-engraver.js:1017`, `:1040`). The 28.5px is exactly the
`textWidth + 10` that the ending's own `minspacing` adds. **Every barline in the fixture
already matches abcjs to the hundredth of a pixel**, so the rules are there to anchor on —
verified by probe, not assumed.

### FINDING 92 — THREE MORE CONSTRUCTIONS HAVE NO HANDLE IN OUR OUTPUT AT ALL

Probing the triplet bracket, the hairpin and the brace the same way returned abcjs's
geometry and **nothing whatsoever from ours**: we emit no class or `data-name` any
comparison can match on. abcjs labels all three — `data-name="triplet-bracket"`,
`"dynamics"`, `"brace"`, the last two classed as well.

This is finding 87's lesson repeating, and it is now four for four: **the representation was
missing a HANDLE rather than an axis, and until it is added the question cannot be put to
either engine.** Adding `data-name` for these three is a precondition for triaging the six
constants below them, not a follow-up to it.

### FINDING 93 — THE ENDING DRAWS TWO PITCH BELOW THE LANE IT RESERVED

`anchorVoltas` is a fourth anchoring pass beside `anchorLyrics`, `anchorAboveStaff` and
`anchorBelowStaff`. The reserve was already right; only the drawing was a fixed lane.

**AND THE `- 2` IS THE PART THAT HAD TO BE MEASURED.**

```js
positionY.endingHeightAbove = staff.top;      // :38
...
element.pitch = positionY.endingHeightAbove - 2;   // :201
```

Every OTHER lane in that file draws AT the top it reserved — `chordHeightAbove`,
`partHeightAbove` and `tempoHeightAbove` are handed to their elements untouched — so the
subtraction reads as a typo. Anchoring without it overshot by exactly 7.75px, two pitch. The
`.elements.json` golden settles it in four numbers: `staff.top` 13.7244, `endingHeightAbove`
5, margin 1, and a bracket drawn at pitch 17.724. **13.724 + 5 + 1 − 2, and no other reading
of those numbers gives it.**

**THE SHIFT CANNOT MOVE ANYTHING ELSE**, which is why it is a pass and not a refactor of the
vertical stack. A volta's ink is deliberately outside the staff's extent — `verticalExtent`
reads a volta line only through `flag()`, to learn which side it is on, and abcjs agrees.
Measured: the baseline diff touches volta lines and volta texts and nothing else, across
three fixtures.

With the lane right, the hook and the label size landed — the two figures the previous
commit had deliberately reverted.

### FINDING 94 — AN ENDING HANGS ON A RULE, NOT ON A BAR AND NOT ON THE MUSIC

`EndingElem(text, anchor, null)` captures whatever `anchor` the barline cursor is holding
when `startEnding` fires — after the whole walk, so the LAST rule — and
`partstartelem.anchor2 = anchor` fires on `endEnding`, which sits BETWEEN the thick and the
second thin, so it is the thick where there is one and the first thin otherwise
(`abstract-engraver.js:1017`, `:1040`). `drawEnding` opens at `anchor1.x + anchor1.w` and
closes at `anchor2.x` — right edge one way, left edge the other.

Three things had to be right and each was its own trap:

- **The `w` is the ANCHOR's, not the painted thickness.** A thin rule is declared
  `(null, dx, 1, 2, {linewidth: 0.6})` and a thick `(null, dx, 4, 2, {linewidth: 4})`; only
  the thick pair agree, and an ending reads the declared one.
- **The bar an ending opens on is usually the PREVIOUS measure's closer.** `startEnding` is
  a property of the barline, and the bar carrying `|1` or `:|2` is the one that ENDS the
  measure before. `endingRoom` had already reasoned exactly this way about `minspacing`.
- **The two brackets of `|1 … :|2` do NOT abut.** Both hang on the same `:|`, on opposite
  edges of its thick rule, so abcjs leaves exactly 4px — `[…472.18] [476.18…]` in its own
  golden. **The eighth test in `layout.test.ts` found to be asserting abcjs is wrong.**

**AND THE GATE HAD THE SAME REPRESENTATION PROBLEM ONE LEVEL DOWN.** Comparing bounding
boxes made ours 0.5px wider, because abcjs's bracket is a stroked path whose box is its `d`
coordinates while ours is a rect per stroke — so our 1px HOOK reaches half a pixel past
where the bracket starts. The span is read off the horizontal rule now, which both engines
express identically.

### FINDING 95 — A DEFAULT PARAMETER IS THE LEAK, DISTILLED

`dotGlyphs(count, x, step, taken, spacing = ENGRAVE.dotSpacing)`. The call site gated on
strict passed abcjs's 5px; the call site that simply omitted the argument silently took our
0.45 spaces. **That ungated caller is the dotted REST**, and finding 88 had ported the dot
arithmetic for noteheads only.

abcjs makes no such distinction: its rest branch ends in `createNoteHead(abselem, c,
{verticalPos: restpitch}, {dot, scale})` (`abstract-engraver.js:600`), the same function
noteheads go through, so `notehead.w + dotshiftx - 2 + 5 * dot` governs both. Ours put the
dot 2.71px past the glyph against abcjs's 3, and stepped 3.49px against 5.

No gate could see it — 0.29px on an augmentation dot moves nothing a notehead comparison
looks at. `dotGlyphs`'s spacing, `naturalWidth`'s and `springForDuration`'s scale are all
REQUIRED now: **a caller that must name the value cannot forget it**, which is the smallest
available version of "strict should not be able to read ours".

### FINDING 96 — THE AUDIT FINDING WAS NOT CLOSED, AND THE REASON GENERALISES

Three constructions were borrowing a line weight from somewhere else, and one was
borrowing it from **Bravura, ungated, in `abcjs-strict`**:

| | was reading | which is |
|---|---|---|
| triplet bracket | `LINE_WEIGHTS.slurEndpoint` | **BRAVURA `ENGRAVING_DEFAULTS`** |
| hairpin / glissando | `LINE_WEIGHTS.staffLine` | abcjs's, for a staff line |
| repeat ending | `LINE_WEIGHTS.thinBarline` | abcjs's, for a barline |

abcjs draws all three with `printPath` and NO `stroke-width`, so they paint at SVG's
default 1px. **That is not anybody's engraving judgement — it is the absence of an
attribute** — so it is one constant, `strokedPathRule`, and all three read it now.

**`glyph-table.ts` SAID SO IN AS MANY WORDS** — "NOT YET PORTED, and still Bravura's in
strict: slur/tie endpoint+midpoint" — and it was read as harmless because `curveToPath`'s
strict branch ignores those four in favour of `ABCJS_ARC.thickness`. Nobody asked what ELSE
read one. **A CONSTANT IS REACHABLE BY EVERY CALLER, NOT BY ITS NAME.** Checking that the
curve had stopped reading `slurEndpoint` is not the same as checking that `slurEndpoint`
had stopped being read.

And no gate could see it for the reason this audit keeps producing: a tuplet bracket had no
class and no `data-name` until finding 92, one commit earlier. **The line-weight gate that
exists precisely to catch this could not name the element.** The audit closed the sites it
could SEE, and the sites it could see were the ones with handles.

### FINDING 97 — DELETE THE SPREAD, AND THE COMPILER BECOMES THE AUDIT

`ABCJS_WEIGHTS` began `{ ...BRAVURA_WEIGHTS, /* overrides */ }`. That is Lance's `ENGRAVE`
question in miniature and with the same answer: **the DEFAULT was Bravura and abcjs's
figure was the exception**, so an un-reached key stayed Bravura's silently, in the one mode
whose entire purpose is to have no latitude.

Written out in full, `LineWeights` being all-required makes a missing override a **compile
error** — a structural guarantee rather than a comment, and it cannot rot. Re-auditing now
reports 11 keys, 11 strict overrides, none Bravura.

**FIVE KEYS WERE DEAD** and are gone from the interface: `beamSpacing`,
`barlineSeparation`, `repeatBarlineDotSeparation` (abcjs has no such constants and nothing
read them), and `slurEndpoint` / `tieEndpoint`, which existed only to feed
`PlacedCurve.endThickness` — **a field written on every curve and read by NOTHING**. That
is finding 90's class again, and it is why "is this read at all?" has to come before "whose
is this?": the Bravura leak of finding 96 was a key that existed only to feed a dead field.

### FINDING 98 — THE SECOND UN-AUDITED CLASS, AND A BIAS THAT CHANGES SIGN

Six raw `GLYPHS[…]` reads bypass `glyphsFor(strict)`. Two were leaks:

    layout.ts:5265   a slur or tie's ANCHOR took Bravura's notehead width
    layout.ts:5287   a REST's ink box, which is what a tuplet bracket spans

    noteheadBlack  1.1800 -> 1.2658  +0.67px      restHalf     1.1280 -> 1.4516  +2.51px
    noteheadHalf   1.1800 -> 1.3381  +1.22px      restQuarter  1.0760 -> 1.0178  -0.45px
    noteheadWhole  1.6880 -> 1.9335  +1.90px

The rest is the sharper case: **the bias changes SIGN with the glyph**, so no single
correction could ever have absorbed it.

**WHAT MADE IT SURVIVE IS THAT ITS NEIGHBOUR IS RIGHT.** Twenty lines above 5265, `headInk`
reads `glyphsFor(strict).width(headName)` under a comment explaining that the outline stays
Bravura's while the metrics come from the active table. The anchor site does the same job on
the same glyph and simply never got the same treatment.

The other four are legitimate and are now CHECKED rather than assumed: `bravuraDeclared` is
the documented fallback for a name in neither table; the `head` at 2344 feeds
`head.anchors`, read only through `strict ? … : bravuraX/bravuraY`; two are
`glyphsFor(strict).get(…) ?? GLYPHS[…]` fallbacks; and `GLYPHS.brace` has no abcjs
counterpart, because abcjs builds its brace as a parameterised curve rather than a glyph.

### FINDING 99 — THE CURVE ENDPOINTS, AND THE ASYMMETRY IS THE TELL

Finding 89 ported `drawArc`'s SHAPE and deliberately left its ends. abcjs measures both
from the ANCHOR and never from the ink:

```js
x1 = roundNumber(x1 + 6)                    // draw/tie.js:60
x2 = roundNumber(x2 + 4)                    // :61
pitch1/2 = pitch ± (isTie ? 1.2 : 1.5)      // :58, 62-63
```

`calcX` sets `startX = anchor1.x`, `endX = anchor2.x` (`tie-element.js:118-140`) — an
anchor being the notehead's own `RelativeElement`, so its x is the head's left edge and its
pitch the head's pitch.

Ours sprang from the ink EDGE plus one symmetric `curveEndGap`. **6 at one end and 4 at the
other is not a clearance, it is two hardcoded numbers** — and a clearance is exactly the
shape our model had, which is why it never looked wrong.

The lift is the same thing one axis over: `1.2`/`1.5` are PITCH off the notehead's own
pitch, so abcjs's curve leaves every note at the same distance whatever the glyph's ink box
is. Ours moved with the ink — and after finding 98 it would have moved with the GLYPH TABLE
too, since abcjs's noteheads are up to 1.90px wider than Bravura's.

---

## THE TRIAGE TABLE — 38 live bare literals

Work down this. **Evidence column matters**: `measured` means both engines' output was
compared, `source` means abcjs's source was read and the prediction is NOT yet measured —
and this repo has three recorded cases of a careful source read that abcjs's own SVG
denies. Do not port a `source` row without measuring first.

### STRUCTURAL — a unit or a definition, legitimate in strict

| constant | why it is fine |
|---|---|
| `staffLineSteps` | the staff itself |
| `spacePerStep` | a unit conversion, 0.5 by definition |
| `firstLedgerStep` | the next line position; the same definition abcjs has |
| `spacingReference` | a PARAMETRISATION, not a value. Ours is `√(d/(1/16))` and abcjs's `√(8d)`; they differ by a constant `√2` that `spacingScale` absorbs and the justification solver cancels. |
| `minColumnGap` | the rod floor beneath the springs |

### ALREADY GATED — strict does not read our figure (verified, no action)

| constant | how |
|---|---|
| `spacingScale` | `PROFILES` supplies abcjs's 2.7372 in strict, and the parameter is REQUIRED now so no caller can silently take ours. |
| `dotGap`, `dotSpacing` | gated at BOTH drawing sites now — the notehead's since finding 88, the dotted rest's since finding 95. |
| `curveMinBulge`, `curveMaxBulge`, `curveBulgeRatio` | `curveToPath`'s strict branch uses only `Math.sign(bulge)`; the magnitude is computed and discarded. Harmless, but it should not be computed at all. |

### ABCJS-HAS-ITS-OWN, AND THE NUMBER ALREADY AGREES — cite only, expect a ZERO-line baseline diff

| constant | abcjs | |
|---|---|---|
| `stemLength` 3.5 spaces | 7 pitch, `Math.round(70 * voiceScale) / 10` (`abstract-engraver.js:740`) | **CITED** |
| `lastSystemFill` 0.66 | `ABCJS_RATIO.lastSystemFill`, which ALREADY EXISTED — a golden variable duplicated as a bare literal three hundred lines away | **CITED** |
| `dynamicBelowReserve` 7 | `max(volumeHeightBelow, dynamicHeightBelow) + margin` = `max(6,6)+1` | **CITED** |
| `annotationLineStep` 5.16 steps | 19.995px against the 20 the comment derives — and abcjs's real rule is `Math.round(height * 1.1)` over the ACTUAL annotation font, so a `%%annotationfont` moves it. Not a cite; a small port. | open |

All three citations landed with a **ZERO-LINE baseline diff**, which is the proof this file
prescribes.

### ABCJS-HAS-ITS-OWN, AND THE NUMBER DIFFERS — a port, and MEASURE FIRST

Every row below is `source` only. Three of the six are unreachable by any gate until
finding 92's handles exist.

| constant | ours | abcjs | source |
|---|---|---|---|
| ~~`voltaHook`~~ | — | `height = 20` | `draw/ending.js:10` — **PORTED**, finding 93 |
| ~~`voltaTextSize`~~ | — | `repeatfont` → 17px | `draw/ending.js:44` — **PORTED**, finding 93 |
| `tupletHook` | 0.6 spaces = 4.65px | `bracketHeight = ±5` | `draw/triplet.js:24` |
| `tupletNumberGap` | 0.35 spaces = 2.71px each side | `gapWidth = 8` each side | `draw/triplet.js:35` |
| `tupletTextSize` | 1.4 spaces = 10.85px | `tripletfont` 11pt → 15px | `abc_parse_directive.js:29` |
| `hairpinMouth` | 1.0 space = 7.75px | `height = 8`, and a `+4` offset on `y` we do not have | `draw/crescendo.js:9-10` |
| `bracketThickness` | 0.5 spaces = 3.875px | `spacing.STEP * 0.75` = 2.906px | `draw/brace.js:20` — **a LINE WEIGHT, the audit finding's own class** |
| `connectorGap` | 0.6 spaces = 4.65px | `xLeft += spacing.STEP` = 3.875px | `draw/brace.js:19` |

### OURS BY POLICY — a FIXED LANE where abcjs STACKS

`chordSymbolStep`, `dynamicAboveStep`, `dynamicBelowStep`, `annotationAboveStep`,
`annotationBelowStep`, `partStep`, `tempoStep`, `lyricStep`, `voltaStep`.

These are one decision, not nine, and it is already documented at length in `ENGRAVE`
itself. `anchorLyrics`, `anchorAboveStaff`, `anchorBelowStaff` and now `anchorVoltas` have
been migrating them into abcjs's stack one at a time — **`voltaStep` is done** (finding 93)
and is now only the ORIGIN the shift is measured from, like `lyricStep` before it. The
remaining lanes are the same job.

### ZERO, AND ZERO BECAUSE ABCJS HAS NO SUCH THING

`marginY`, `systemGap`, `staffGap`, `graceGap` — each documented as "abcjs has none". They
are dead weight with live read sites. **`systemGap`'s comment is STALE**: it argues for
keeping a non-zero value the constant no longer has.

### NOT YET EXAMINED

`curveEndGap` (the checkpoint's own priority 2 — the slur/tie endpoints), `curveContinuation`,
`spannerGap`, `spannerMinLength`, `melismaGap`, `melismaMinLength`, `tuneGap`,
`beamStubLength`, `dotGap`.

---

## WHAT IS LEFT, ranked — UNCHANGED, nothing this session touched a notehead

```
 1.77  dy= 0.0 dx= 1.8 oy=  0.0 ox=-1.5  visual-layout-04   [score]
 1.69  dy= 0.0 dx= 1.7 oy=  0.0 ox=-0.8  mouse-click-01 / tablature-15
 1.69  dy= 0.0 dx= 0.0 oy=  1.7 ox= 0.0  visual-parsing-10  [barnumbers, setbarnb]
 0.94  dy= 0.0 dx= 0.9 oy=  0.0 ox=-0.2  visual-selection-01 / svg-per-line-01
```

### NEXT, in order

Findings 93-102. Items 1-3 of the previous list are DONE; what is left:

1. **A BEAM DOES NOT BREAK AT A REST IN ABCJS, AND IT DOES HERE.** This is what the beamed
   triplet's `yTextPos` turned out to be, chased to the bottom:

   - `beamY` ALREADY ports `heightAtMidpoint` and the `isAbove(beam) ? 3 : -2` clearance —
     the previous checkpoint's "not wired up" note was wrong and I had double-counted it;
   - the number's midpoint was the only placement defect, and is fixed (`beamMidX`);
   - the tuplet's `hasBeam` test is now abcjs's exactly, and relaxing it changed NOTHING;
   - because `(6cegczg` and `(3czg` are beamed by abcjs and bracketed here, and our beam
     GROUP does not span them. abcjs's `hasBeam` being true for `(6cegczg` means its first
     `c` and last `g` share one beam across the `z`.

   **THE TELL WAS A COUNT, NOT A COORDINATE**: abcjs draws THREE triplet-bracket paths in
   `S3-note-syntax` tune 6 and we draw fourteen pieces. The two numbers' 4.91px of x would
   have led to the placement code, where nothing is wrong. That handle exists only because
   finding 92 gave the bracket a `data-name`.

   The fix is in beam GROUPING and moves real beams on every tune with a rest inside one —
   a slice of its own. It settles the two numbers, 4.91px in x and 38.8 in y.

2. **THE REMAINING FIXED LANES** — `chordSymbolStep`, `dynamicAboveStep`,
   `dynamicBelowStep`, `annotationAboveStep`, `annotationBelowStep`, `partStep`,
   `tempoStep`, `lyricStep`. One decision, not eight. `anchorVoltas` (finding 93) is the
   model: resolve in the pass that has the final elements, shift furniture only, and CHECK
   FIRST that the lane's ink is outside the staff extent — that property is what made the
   volta safe and it does not hold everywhere.

3. **THE STAFF INK TOP**, never checked as its own axis: 13.85 pitch against abcjs's dumped
   13.7244 on `S4-bars-repeats`. Half a pixel, carried by everything that hangs off the
   staff top — including the repeat ending's one remaining ceiling. The `.elements.json`
   goldens carry `staff.top` for every staff of every fixture, so the whole corpus is
   measurable today with no new machinery.

4. **THE BRACE** is a construction, not a constant: abcjs builds it as a `curvyPath` of two
   cubics parameterised by the span (`draw/brace.js:51-64`) where we stretch a Bravura
   glyph with `scale(1,n)`. Ours also sits at a NEGATIVE x on `S7-voices` where abcjs's is
   at 20.25, which is a separate question about the connector indent.

5. **`visual-layout-04`, 1.77 — MEASURED, and it is a STAIRCASE, not a spacing law.**
   Pairing the two engines' 61 noteheads gives exactly five plateaux and nothing else:

   ```
   heads  0-2    dx  0.00
   head   3      dx -0.57
   heads  4-12   dx -0.97      (a step of -0.40)
   heads 13-18   dx -1.37      (-0.40)
   heads 19-60   dx -1.77      (-0.40)
   ```

   Every `dy` is 0.00 and the last plateau covers **42 of the 61 heads** — so four
   ELEMENTS are too narrow, by 0.57 and then 0.40 three times, all of them inside the
   first two bars, and nothing after that drifts at all. Per this file's own heuristic a
   clean step is one element too wide or narrow; a spacing-law difference would GROW.

   The fixture is two voices on ONE staff (`%%score (S A)`, `stem=up`/`stem=down`) with
   different rhythms — `G4 zA G2` against `F2 F2 F2 F2` — so the suspects are the
   voice-overlap widening in `voice-elements.js:33-62` and the REMAINDER spring, where
   abcjs recomputes a waiting voice's expectation from `spacingduration -= spacingduration`
   and we run the same float through `springForDuration`. Note that `minColumnGap` is OURS
   and IS read there in strict — a floor abcjs does not have on its spring, only on its rod.

   The first barline is already -0.96 out, which places at least two of the four steps in
   bar 1.

6. Then `visual-parsing-10` at 1.69 (the only lone `oy` left), Gonzato, audio.

