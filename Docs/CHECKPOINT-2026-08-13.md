# CHECKPOINT — 2026-08-13

**abcts, `main`.** `npx tsc --noEmit` is clean and everything below is committed and pushed.
The suite is **1321/1322 and the ONE red is NOT OURS** — `content-parity`'s `S7-voices` is an
uncommitted fixture edit in the sibling `../abcMusicKit` repo whose goldens were never
regenerated. `CHECKPOINT-2026-08-12.md` §5 has it; do not bisect it.

---

## 1. THE STATE

| Gate | Now | Session start |
|---|---|---|
| Audio events / timings / chord grids / MIDI | **0 of 72 / 0 of 38 / 0 of 23 / 0 of 3** | same |
| Harvested geometry | **0 of 174** | 0 of 174 |
| Pixel targets | **0 of 120** | 0 of 120 |
| DOM contract | 1 of 25, 24 ratcheted | 1 of 25 |
| **SVG bytes** | **3 of 171 — 168 byte-exact, ALL RATCHETED** | 10 of 171 |

`DIVERGENT` is EMPTY.

**SEVEN FIXTURES CLOSED**: `visual-transpose-output-04`, `visual-transpose-05`,
`synth-flattener-28`, `visual-svg-per-line-02-scaled`, `visual-parsing-06`,
`visual-parsing-07`, `visual-tablature-23`.

**THE THREE THAT ARE LEFT**

| Fixture | Byte | What it is |
|---|---|---|
| `visual-options-01-fonts` | 7292 / 33896 | the TEMPO's font — §3.1, measured and REVERTED |
| `visual-layout-07` | 13364 / 19706 | the key signature's clef — `-08-12` §3.3b, two reverts |
| `visual-svg-02-staffwidth-12` | 133 / 8790 | three `[M:]` in one measure — `-08-12` §3.3 |

---

## 2. THE LANDINGS

Every one is a read of a named abcjs function, and every one was settled by printing the
SAME QUANTITY FROM BOTH ENGINES in one sitting. Six careful source reads on this branch had
predicted things abcjs's own output denies; nothing here rests on a source read alone.

### 2.1 A BARLINE'S `w` AND ITS `minspacing` ARE TWO ADDS, NOT ONE ROD

`getMinWidth(child)` is `child.w`, and the cursor spends it as TWO adds —
`voice.minx = x + getMinWidth(child)` then `voice.minx += child.minspacing`
(`layout/voice-elements.js:79-80`). A barline's `minspacing` is the flat 10 plus an ending
label's room (`abstract-engraver.js:1034-1041`) and is never part of `w`; its `w` is
`max(barWidth, chordWidth / 2)`, the max `addCentered` takes.

`Advance.width` already carried `getMinWidth` alone for every other element, and **its own
doc block said a BARLINE could not** — "`rod` there is a `Math.max` over several claims
rather than a sum" and "the split is not ours to invent". It is abcjs's own split.

    abcjs  XX i 17 type bar x 503.746185497294 minx 519.0821354972941
    ours   XX i 17 kind bar x 503.746185497294 minx 519.082135497294

`503.746185497294 + 5.33595 + 10` is `…41`; `503.746185497294 + (5.33595 + 10)` is `…4`.
One ULP at element 17 carried out through `staffGroup.w`, so the root `width` printed
`701.4136103418931` against `701.4136103418928` and the whole 46,586-byte file sat behind
byte 181. All three of abcjs's solve iterations agree to the last bit now.

### 2.2 A CHORD LANE'S RUNG **IS** `staff.top`, NOT THE MARK'S BASELINE DIVIDED BACK

`incTop` writes the pitch to `staff.top` and to `positionY.chordHeightAbove` together and
the mark is DRAWN at it (`set-upper-and-lower-elements.js:104-110`), so abcjs never recovers
the staff's top from a chord symbol's box. Ours let the placed text's ink set the extent,
which divides the y back, and `x * STEP / STEP` is not `x`.

    abcjs  incTop chordHeightAbove h= 4.779354838709677 -> 23.761929651855723
    ours   ladder start topPitch 17.982574813146048   (identical)
           spend h 22.395 pitch 5.779354838709677 -> 23.761929651855723
           clampedTopPitch 23.76192965185572          <- the round trip

**The ladder had the right number all along and threw it away at the extent.** It already
publishes `tempoPitch` and `endingPitch` for exactly this reason; the chord rung now travels
the same way, as `PlacedText.reserveTopPitch`.

### 2.3 `spacing.composer` IS A ROW OF THE TOP BLOCK, NOT A NUDGE TO `y`

`this.rows.push({ move: spacing.composer })` guarded by the same
`rhythm || origin || composer` test that emits the row (`elements/top-text.js:34-35`), just
as `spacing.title` and `spacing.subtitle` already were here. Ours moved `y` and pushed
nothing, so the page recovered the gap as the block's REMAINDER:

    ours, before:  [7.56, 50, 3.78, 38, 19, 19, 62, 7.56, 61.33, 7.559999999999974]
    ours, after:   [7.56, 50, 3.78, 38, 7.56, 19, 19, 62, 7.56, 61.33]

**A SUM CANNOT SEE AN ORDER**, for the fifth time on this branch.

### 2.4 A GRACE FLAG'S OFFSET IS BUILT, AND `headx` OPENS AT THE NOTE'S ACCIDENTAL ROOM

`xdelta = headx + notehead.w - 0.6` with `headx = -graceoffsets[i]`
(`create-note-head.js:47`), placed as ONE addition onto the element's own x. **Two earlier
attempts were reverted for picking the wrong frame**, and the answer was one probe:
`graceoffsets` is a walk that OPENS at the `roomtaken` `createNoteHead` returned for THIS
note's accidentals (`abstract-engraver.js:485-494`), not at zero.

    17 GDX headx -10     w 5.886 xdelta -4.7139999999999995 scale 0.6
     1 GDX headx -20.25  w 5.886 xdelta -14.964             scale 0.6

The 20.25 is that note's sharp — `getSymbolWidth + 2`. That ONE row of eighteen is why the
offset cannot be built inside `layoutGraces`, which runs before the accidental column
exists here. And the ACCIACCATURA SLASH wears `role: 'flag'` too — for the CLASS — so
keying the stamp on the role moved it as well and cost two fixtures. Keyed on the name.

### 2.5 AN UNBEAMED GRACE'S STEM COMES AFTER ITS ACCIACCATURA SLASH

`_addChild` is a plain push, so `addGraceNotes`'s adders are the child order
(`abstract-engraver.js:507-517`): head, slash, stem, ledgers. Ours fired the stem on the
glyph whose role is `grace` — the HEAD — so it went out one glyph early on every `{/x}`.
Keyed on the LAST glyph carrying the grace's index instead.

### 2.6 AUXILIARY BEAMS GO OUT DEEPEST FIRST, PER ELEMENT

`createAdditionalBeams` flushes each element's finished runs with
`for (var j = auxBeams.length - 1; j >= 0; j--)` (`layout/beam.js:208`), and `drawBeam`
concatenates every beam into a single `d` (`draw/beam.js:6-22`) — **the only place the
order is visible at all**, since no positional gate can express document order.

    ours  M156.52 22.56 … M156.52 28.37 … M156.52 34.19 …
    abcjs M156.52 22.56 … M156.52 34.19 … M156.52 28.37 …

The GRACE builder had sorted on exactly this key since it learned about aux levels; the
main one walked `level = 0 … maxLevel` and pushed as it went. Four baselines moved and every
one is a pure PERMUTATION of the same coordinates.

### 2.7 A STEM'S FAR EDGE IS BUILT FROM THE **ROUNDED** ANCHOR

`x = roundNumber(x)` and then `x2 = roundNumber(x + dx)` (`draw/print-stem.js:14-15`) — the
second corner is one signed line-width off the FIRST CORNER AS PRINTED, never the other side
of an unrounded centre.

    ours  M 265 74.72L 265 108.82L 264.39 108.82L 264.39 74.72z
    abcjs M 265 74.72L 265 108.82L 264.4  108.82L 264.4  74.72z

Our anchor is `264.995…`, so `(264.995 - 0.3) - 0.3` is `264.395` and `toFixed(2)` takes it
down. The BEAM emitter beside it already chains this way and its comment says why.

### 2.8 A FORCED STEM DIRECTION IS PER **LINE**, NOT PER VOICE

`createVoice` reads `tune.lines[tune.lineNum].staff[tune.staffNum]`
(`parse/tune-builder.js:967`), so `thisStaff.voices` is that LINE's voice list, and
`createABCVoice` resets `this.stemdir = null` at the head of every line
(`abstract-engraver.js:229`).

    VOICE s 0 v 0 stream ["stem:up",   "note:c", "bar"]
    VOICE s 0 v 1 stream ["stem:down", "note:A", "bar"]
    VOICE s 0 v 0 stream [             "note:d", "bar"]

Both halves survive the move and are still keyed the way abcjs keys them: `down` on the
STAFF-RELATIVE index (`tune.voiceNum > 0`), so a second voice appearing alone on a line is
still forced; `up` spliced onto `voices[0]` only when a later voice is created while
`thisStaff.voices[0] !== undefined`. `ave-verum-corpus`'s lower-voice-first staves and
`ragtime-nightingale`'s 388 up-stems depend on those two and neither baseline moved.

### 2.9 EVERY VERSE OF A NOTE LIVES IN ONE `<text>`

`lyricStr += ly.syllable + div + "\n"` for every verse and ONE `RelativeElement` for the
result (`abstract-engraver.js:769-778`), which `Svg.prototype.text` splits on `\n` into a
`<tspan dy="1.2em">` per line. Two verses is THREE tspans, the last empty.

Ours wrote a `<text>` per verse in its own lane, with a note predicting that no corpus
fixture puts two verses on one note. **A `ponytail:` SAYING THE CORPUS NEVER VARIES
SOMETHING IS A PREDICTION, NOT A MEASUREMENT** — the fourth on this branch.

The LANE had to follow: `versesHere` counted TEXTS where `getTextSize.calc(lyricStr, …)`
measures LINES, and counting texts took the page 20.4px short.

**AND THE BASELINE COULD NOT EXPRESS THE CHANGE.** Its text dump printed `text` and not
`extraLines`, so the merge read as 11 files of pure REMOVALS — the shape that says
regression. The dump prints the extra lines now, and with that the diff is a merge with no
coordinate moved. **A comparison can only catch what its representation can express.**

### 2.10 THE TOP BLOCK AND THE VOICE NAME REALIZE `box`, `face` AND `style`

`renderText` has ONE boxed branch for every text it draws (`draw/text.js:48-81`): open
`<g fill data-name>` unless already in one, move the text IN by one padding (on x for a
`start` or `end` anchor, on y always), DELETE its class, and lay four one-pixel rules round
the MEASURED text. The rect's y is the row's own CURSOR, before the font size the baseline
adds. `fontTypeCanHaveBox` is eleven types (`abc_parse_directive.js:60`) — NOT `tempofont`,
`vocalfont`, `repeatfont`, `tripletfont` or `wordsfont`.

The `P:` part-order row had carried this since `%%partsbox`; every other row took the plain
path. The FACE was hard-coded to `'Times New Roman'` at the top-block emitter, and the
WEIGHT and STYLE were each row's default where a `%%<type>font` replaces the whole object
(`abc_parse_directive.js:200-240` — `%%infofont Monaco 11` draws UPRIGHT).

The VOICE NAME needed one more: `getTextSize.calc` returns `height + padding * 4` for a
boxed font and `headerPosition` HALVES that height (`get-text-size.js:46-49`,
`abstract-engraver.js:154`), so a boxed label centres 4.6px higher.

**AND THE RATCHET CAUGHT THE ONE THING THAT WENT BACKWARDS.** `visual-tablature-15` was
byte-exact and broke the moment a face reached the emitter: our `fontTranslation` table
transcribed abcjs's `"\"Times New Roman\""` as `'"Times New Roman\'` — the closing quote as
a BACKSLASH — on 13 rows. abcjs keeps the quotes in the model on purpose and `getFamily`
strips them at the attribute (`get-font-and-attr.js:17-22`); both halves are ported.

---

## 3. WHAT IS LEFT

### 3.1 `%%tempofont` IS NOT REALIZED — MEASURED, IMPLEMENTED, REVERTED

`visual-options-01` is at byte 7292 of 33896 and the next difference is the tempo mark:

    ours  font-size="20" font-family="Times New Roman" font-weight="bold"
    abcjs font-size="25" font-family="serif"           font-weight="normal"

from `%%tempofont serif 19 box` — `round(19 * 4/3) = 25`, and `tempofont` is NOT in
`fontTypeCanHaveBox`, so the `box` is ignored. `drawTempo`'s three parts are `renderText`'s
elements in `tempofont` (`draw/tempo.js:18-38`), so the directive reaches the drawn text and
the widths it advances by.

**IMPLEMENTED AND REVERTED, and here is exactly how far it got.** Swapping
`ENGRAVE.tempoTextSize` for `fontSizeOf('tempofont')` inside the tempo layout AND in
`aboveLadder`'s

    tempoY = reserve(ENGRAVE.tempoHeightAbove) + <size> + ENGRAVE.tempoDescenderBump

put the `pre` text's baseline at abcjs's own `y="317.79"` — byte 170 of 33896, past
everything before it — and **took the ROOT HEIGHT from `975.1000000000003` to
`970.1000000000003`**. Both staves moved UP by exactly 5, the size delta:

    top-line y   BEFORE ['456.34', '655.25']
                 AFTER  ['451.34', '650.25']
                 WANT   ['456.34', '655.25']

So staff 0's `top` came out 5 SMALLER when the tempo font grew, which is backwards.
**abcjs's `tempoHeightAbove` IS A FLAT 6 PITCH** — `this.totalHeightInPitches = 6;
this.tempoHeightAbove = this.totalHeightInPitches` (`elements/tempo-element.js:12-13`) —
and `set-upper-and-lower-elements.js:209-212` gives the element
`pitch = top = bottom = positionY.tempoHeightAbove`, **a POINT at the rung**. So the lane
does not depend on the font size at all and the staff's top must not move.

abcjs's own ladder for this fixture, for whoever picks it up:

    incTop chordHeightAbove h= 12.438709677419356 -> 28.206451612903226
    incTop partHeightAbove  h= 14.606451612903227 -> 45.81290322580645
    incTop tempoHeightAbove h= 6                  -> 52.81290322580645
    TOPend 52.81290322580645 bottom -12.516129032258064

**THE NEXT STEP IS A PROBE, NOT A GUESS**: print staff 0's `clampedTopPitch` with the tempo
font at 15pt and at 19pt and find which term of the ABOVE ladder reads the size. It is not
`reserve(tempoHeightAbove)`, which is untouched by the swap, so it is something downstream
reading the tempo element's own placed box — `aboveStackPlaced` is true for a tempo, so
`verticalExtent` is meant to take the box as given.

`git show` the reverted diff is not available — it was never committed. The change is four
lines: a `const tempoSize = fontSizeOf('tempofont')` at the head of the tempo layout, eight
`ENGRAVE.tempoTextSize` → `tempoSize` inside it, `...faceOf('tempofont')` and
`...styleOf('tempofont', true, false)` on the `pre` text, and `fontSizeOf('tempofont')` in
`aboveLadder`'s `tempoY`. `styleOf` IS committed (beside `faceOf`) and is used by nothing
yet — it is there for this.

### 3.2 THE OTHER TWO ARE UNCHANGED FROM `-08-12`

`visual-layout-07` is §3.3b of `CHECKPOINT-2026-08-12.md` — the bass staff's two key flats
7.75px (2 pitch) low, with a SIX-CONTROL LADDER through abcjs already printed there and
**two attempts already inferred and reverted**. Read it before touching anything.

`visual-svg-02-staffwidth-12` is §3.3 — `[M:2/4]y[M:3/4]y[M:4/4]`, where abcjs draws 3
`staff-extra time-signature` and we draw 1 because `Measure.meterChange` is SINGULAR. ~25
references across `parser.ts`, `layout.ts`, `chord-grid.ts`, `audio/flatten.ts` and
`audio/timing.ts`. The measure's meter-in-force (the LAST) and the drawn ones (ALL) are
genuinely different roles; keep them one derivation.

---

## 4. THE RATCHET

`tests/svg-bytes.test.ts`'s `PASSING` names all **168** byte-exact fixtures. It earned itself
again this session: `visual-tablature-15` went from byte-exact to differing on the
font-face change while the aggregate count was UNCHANGED at 3, and nothing else would have
said so.

Regenerate after every landing:

    node /tmp/exact.mjs      # writes /tmp/exact.txt from /tmp/abcts-svg-bytes-ranked.txt
    # splice /tmp/exact.txt into PASSING

---

## 5. THE HARNESS — WHAT WAS ADDED TO `/tmp/gp/abcjs` THIS SESSION

All gated on their own env var, all in the SCRATCHPAD COPY, never `../abcMusicKit`:

| Var | Where | Prints |
|---|---|---|
| `ABCJS_MAXW` | `layout/layout.js` | per-line `thisWidth` and the running `maxWidth` |
| `ABCJS_SXS` | `layout/layout.js` | `setXSpacing`'s `staffGroup.w`, `leftEdge` and its return |
| `ABCJS_SPACE2` | `layout/layout.js` | each solve iteration's `newspace`, `w` and `spacingUnits` |
| `ABCJS_FINX` | `layout/staff-group.js` | the final `x` and each voice's `minx`/`nextx`/last child |
| `ABCJS_XX` | `layout/voice-elements.js` | per element: `x`, `minx`, `nextx`, `w`, `minspacing` |
| `ABCJS_NM` | `draw/non-music.js` | every `nonMusic` ROW as JSON, in order |
| `ABCJS_PS` | `draw/print-stem.js` | `printStem`'s raw `x`, `dx` and `x + dx` |
| `ABCJS_GDX` | `creation/create-note-head.js` | a flag's `headx`, `notehead.w` and `xdelta` |

plus `ABCJS_TOP`/`ABCJS_MOVEY`/`ABCJS_SETX` from earlier arcs, which did as much work again.

Ours, one fixture, rendered exactly as the byte gate renders it:

    ABCTS_FIX=<slug> npx tsx scripts/zzpr.ts   # writes /tmp/ours.svg

**vitest swallows `console.log`**, so probe through `tsx`. `ABCTS_PROBE=1` adds the staff
extents with the contributing source line.

---

## 6. THE RULES THIS SESSION EARNED

- **A DOC BLOCK EXPLAINING WHY A PORT CANNOT BE DONE IS THE REASON NOBODY RE-MEASURES IT.**
  `Advance.width` said a barline's split was "not ours to invent" — it was abcjs's own split
  and needed no invention. Third time on this branch that a note naming a cause is the
  reason the row stopped being read.
- **A COMPARISON CAN ONLY CATCH WHAT ITS REPRESENTATION CAN EXPRESS.** The lyric merge read
  as pure REMOVALS because the baseline dump printed `text` and not `extraLines`. Widen the
  representation, then read the diff.
- **A `ponytail:` SAYING THE CORPUS NEVER VARIES SOMETHING IS A PREDICTION.** Fourth time.
- **WHEN A FIX MAKES ONE NUMBER RIGHT AND ANOTHER WRONG, REVERT IT AND WRITE BOTH DOWN.**
  §3.1 is worth more than the tempo font would have been.
- **PRINT THE SAME QUANTITY FROM BOTH ENGINES IN ONE SITTING.** Every landing here.
