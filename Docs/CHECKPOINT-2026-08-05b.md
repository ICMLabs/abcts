# abcts — Checkpoint, 2026-08-05 (b)

Supersedes `CHECKPOINT-2026-08-05.md` for the STATE. That file keeps the line-weight audit
finding and the golden-variables map; `-08-04c.md` keeps findings 51–70 and the ladder
method, `-08-04b.md` 41–50, `-08-04.md` the expensive lesson, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## ⚖️ THE RULING, RESTATED BY LANCE AND NOW PAID FOR TWICE

> **abcjs is the MASTER SOURCE. Any variability is likely due to not using the same
> setting as abcjs, or to INFERRING an algorithm instead of analysing abcjs.**

Both of this session's findings were that, exactly. The first was Bravura reaching strict
through an ANCHOR; the second was a quirk in abcjs's own arithmetic that was read, judged
harmless, and left out — and that judgement was the whole remaining error. See finding 73.

---

## STATE

| corpus | standing |
|---|---|
| suite | **699 of 699. NO REDS.** The branch has had one standing failure for weeks and it is closed. |
| 41-fixture | **25 of 29 at ZERO on all four axes**, and `ragtime-nightingale`'s twelve staff boundaries all measure 0.0. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **147 / 157 / 168 / 173**. **27 of 174 off some axis**, from 34 at the start of the day. |
| CONTENT gaps | **one left** — `parse-book_parser-04-wed`'s leading-header split. |

**NO CEILING IS RAISED ON THIS BRANCH ANY MORE.** ragtime's `dx` was the only one ever
raised (16.43 → 16.53, finding 68); it is back under the original at 16.52. Its other three
axes came down with it: `dy` 1.12 → 0.33, `oy` −0.54 → 0.13, `ox` −1.87 → −0.76.

---

## FINDINGS 71–73 — THE SECOND CLASS OF `ENGRAVING_DEFAULTS` LEAK

The line-weight audit closed one hole. This is the one beside it: `ENGRAVING_DEFAULTS`
reaching strict through a Bravura **ANCHOR** rather than a Bravura thickness, and no gate
could see that either — a stem is not a notehead, so `pixel-parity` never looks at one, and
`line-weights` reads only the THICKNESS of what it finds.

### 71. A STEM IS HUNG ON THE NOTEHEAD'S EDGE, NOT ON A FONT ANCHOR

Bravura publishes `stemUpSE` / `stemDownNW`, points where a stem of its own weight meets
the outline. abcjs has no such notion: `dx = (dir === "down") ? 0 : heads[0].w` with
`linewidth = ±1`, so the quad spans `[headx + w − 1, headx + w]` going up and
`[headx, headx + 1]` going down (`abstract-engraver.js:747-762`, `draw/relative.js:63`,
`draw/print-stem.js:32`). Its CENTRE is half a stem inside the edge.

Measured on `simple-c`: **0.169px left going up, 0.494px going down.** Now 0.005px, which
is abcjs's own `roundNumber` quantum.

**AND THE CLAMP IS ON BOTH ENDS.** `if (p1 > 6) p1 = 6` and `if (p2 < 6) p2 = 6` are
independent, so the end AT THE NOTEHEAD is pulled to the middle line too. It bites on the
commonest case there is — a down-stem on the middle line starts at the notehead's centre —
and that is one note in eight of `simple-c`.

### 72. A BEAMED STEM IS A DIFFERENT OBJECT, AND SO ARE THE BEAM'S ENDS AND THE FLAG

FIVE constructions where we had one, none derivable from the others:

| | abcjs | source |
|---|---|---|
| unbeamed stem | edge, `±1` thick, `±1/3` pitch into the head, both ends clamped | `abstract-engraver.js:739-762` |
| beamed stem | rebuilt from scratch: **`±0.6` thick**, **`±1/5` pitch**, honours the head's displacement where the unbeamed one ignores it, no clamp | `layout/beam.js:107-142` |
| beam ends | `calcXPos` insets the START by 0.6 going up and extends the END by 0.6 coming down — asymmetric | `layout/beam.js:74-82` |
| flag | `headx + w − 0.6`, NOT the stem beside it | `create-note-head.js:47` |
| tempo beat-unit stem | `0.6` thick, off the head's right edge | `tempo-element.js:51-58` |

The beam's ends are not decoration: `getBarYAt` interpolates **every stem's endpoint** along
the line they define, so a purely horizontal error there is a vertical one on every slant.
And the flag's `x` is a term in the element's ROD, so hanging it on the stem **moved
noteheads** — `happy-birthday`'s dx spread went 0.17 → 0.18 the moment the stem became
abcjs's, which is how the two came to be told apart at all.

### 73. `createStems` COUNTS THE HEAD'S `dx` TWICE — AND IT WAS REASONED AWAY FIRST

```js
var dx = asc ? furthestHead.w : 0;
if (!isGrace) dx += furthestHead.dx;
var x = furthestHead.x + dx;              // furthestHead.x is ALREADY parent.x + dx
var bary = getBarYAt(beam.startX, beam.startY, beam.endX, beam.endY, x);
```

Zero on a plain note. **A whole notehead — 9.81px — on a voice-overlap displacement.**

What that one term was worth, end to end, and every link was measured by instrumenting
abcjs rather than reasoned:

1. one beamed down-stem on `ragtime-nightingale`'s system 4 landed **0.30 pitch high**;
2. a below-slur anchored in that beam takes the stem's bottom as its endpoint, not the
   notehead's pitch (`calcSlurY`'s `parent.fixed.b` branch — already ported);
3. `setUpperAndLowerVoiceElements` hands a `TieElem`'s `getYBounds` box straight to
   `staff.bottom` (`set-upper-and-lower-elements.js:143-149`);
4. system 4 is **the one system where the natural separation beats
   `systemStaffSeparation`**, so `staff.bottom` sets the gap instead of the minimum;
5. every staff from the ninth inherited a flat **−1.11px**.

Staves 0–8 were exact to 0.04px, which is what made it read as a spacing constant rather
than as one stem.

**The first commit of the pair read this double-count, called it "zero for the common
case", and left it out. That inference WAS the remaining error.**

---

## AND A GATE THAT CAN SEE IT

`line-weights.test.ts` had one fixture, `simple-c` — no beams, no `Q:` — so it reported a
stem set of `[1]` and could not tell the axis from a constant. Three fixtures added, each a
different mix of the two weights: `two-voice-invention` (beamed and unbeamed),
`happy-birthday` (a tempo note among beams), `ragtime-mini` (every note beamed, so a stray
weight has nowhere to hide). **All three were wrong before this session.**

`layout.test.ts`'s "lands every stem on the beam" asserted the beam is sampled at the stem's
CENTRE. It is sampled at the head's EDGE. Corrected, not loosened — the seventh test to
have been asserting abcjs is wrong.

The pattern is now three for three: **a comparison can only catch what its representation
can express.** Centres could not see thickness; thickness could not see position; neither
could see a stem at all, because a stem is not a notehead.

---

## FINDINGS 74–77 — GRACE NOTES

### 74. A GRACE GROUP OF MORE THAN ONE IS BEAMED
`gracenotes.length > 1` builds `BeamElem(round(stemHeight * 3.5/5), "grace", isBagpipes)`
(`abstract-engraver.js:466-478`), which suppresses the flag, owns the stem tops, and solves
`calcYPos` with `isGrace` — the full-beam solve minus the too-high/too-low clamp, with
`forceup` always true (`beam-element.js:22`). The beam's own weight is `STEP * 0.4`.

### 75. AND A BEAMED GRACE RESERVES NOTHING — A PHASE DIFFERENCE
Its stems are built in `createStems` during LAYOUT, after `staff.top` has been accumulated,
so they push `abselem.top` and arrive too late to reach the staff. Instrumented: `{efg}CD`'s
element top reaches pitch 16 while its staff top stays at the G clef's declared 13.72, and
its top line does not move one pixel from the same tune with no graces.

**THE TELL WAS TWO GRACES RESERVING LESS THAN ONE.** `{c''}CD` moves abcjs's top line
44.5px; `{c''d''}CD` moves it 34.5. No size rule produces that — only the phase does. Same
axis as the tie's `getYBounds` arriving after the lanes: **the same box in the wrong phase
is a different number.**

### 76. A GRACE STEM IS MEASURED FROM THE HEAD'S PITCH, TWICE
`p1 = gracepitch + 1/3 * gracescale` and `p2 = gracepitch + 7 * gracescale` are two
independent offsets from one pitch (`abstract-engraver.js:515-520`), not a length run up
from the base. `dx = grace.dx + grace.w` with `linewidth -0.6`, and that 0.6 is NOT scaled.
The head reserves its DECLARED box (8.094, not the 8.13 ink box) times the grace scale.
And `graceoffsets` is a BACKWARD walk, so an accidental widens the gap BEFORE its own grace.

### 77. A REST CARRIES ITS GRACES — THERE WAS NO MODEL DECISION TO MAKE
`createNote` closes its rest/note branch and THEN calls `addGraceNotes`
(`abstract-engraver.js:834`), so `{a}z` and `{a}y` engrave exactly as `{a}c`. This had been
filed as a MODEL DECISION, justified inside `Rest` itself: "not ties, slurs, grace notes or
lyrics, none of which apply to silence." Three of the four are right; the fourth was
REASONING, and reasoning is the thing abcjs is the master source for. `(f3 {a})y` was a
whole notehead short.

---

## FINDINGS 78–80 — RICH TEXT, AND A CHORD'S NEWLINE

### 78. A ROW THAT CHANGES FONT MID-LINE ADVANCES BY A DIFFERENT RULE
`addTextIf` moves a plain row by `Math.round(size.height * 1.1)` (`add-text-if.js:26`);
`richText` moves a phrase row by `largestY` — the tallest phrase's RAW height, no 1.1 and
no rounding (`rich-text.js:42-47`). Nothing reconciles them:

| row | plain | rich | Δ |
|---|---|---|---|
| title (29.91) | round(32.901) = **33** | **29.91** | 3.09px |
| composer (21.06) | round(23.166) = **23** | **21.06** | 1.94px |

That is why `RichText` is a UNION, `string | RichPhrase[]`, and not always an array: the
distinction IS the height rule and it has to reach the renderer. abcjs's own
`parseFontChangeLine` returns exactly that union.

**AND A PHRASE'S FONT IS MEASURED AT ITS RAW SIZE.** `getTextSize.calc` applies the
`pt -> px` 4/3 only when handed a font by NAME; handed a font OBJECT — which is what a
`%%setfont` is — it reads `type.size` straight (`get-text-size.js:24-43`). `%%setfont-1 … 40`
measures 40px where `%%titlefont 40` measures 53.

### 79. THE FONT MODIFIERS COME AFTER THE SIZE
`<face> <utf8> <size> <modifiers> <box>`, and `getFontParameter` leaves its `face` state the
moment it meets a number (`abc_parse_directive.js:190-230`). Anchoring the size to the END
of the string found none in `cursive 40 bold` and silently took the caller's default.

### 80. `\n` IS A LINE BREAK INSIDE A QUOTED CHORD — AND IT IS A DIFFERENT DECODER
`substInChord` maps `\n` to a newline and `\"` to a quote, applied by
`getBrackettedSubstring` as the substring is read (`abc_tokenizer.js:784-807`). It is NOT
`translateString`, which handles accent escapes and leaves an unknown `\x` with its
backslash intact. Ours dropped the backslash and kept the `n`, so `"C$1m$7\ntwo"` was one
line reading `C$1m$7ntwo` — one chord lane where abcjs takes two, and a mark four characters
too wide.

**THAT ONE CHORD WAS THE WHOLE OF A 16.91 FIXTURE.** Swapping it for a plain `"Cm"` took all
four axes to 0.00 with every other field untouched, which is how something that looked like
a font feature turned out to be a two-character escape. The ladder is what separated them:
eleven rungs went green on finding 78 and one did not.

**AND CHORDS, ANNOTATIONS AND LYRICS DO NOT GET `parseFontChangeLine`** — measured, not
assumed. Their `$1` stays literal in both engines, and the four rungs covering them were
exact before the work and after it.

---

## WHAT IS LEFT, ranked

```
 7.20  dy= 0.0 dx= 7.2 oy= -0.0 ox=-4.3  mouse-click-01 / tablature-15   [%%sep, %%text]
 6.65  dy= 3.8 dx= 6.7 oy=  0.9 ox= 2.1  visual-selection-01 / svg-per-line-01
 5.74  dy= 0.0 dx= 0.0 oy=  5.7 ox=-0.0  synth-flattener-32  quarter tones
 3.00  dy= 0.0 dx= 0.0 oy= -3.0 ox= 0.0  visual-tablature-17 [stretchlast, gchordfont]
```

**NOTHING ABOVE 7.20 IS LEFT**, and the top of the table is now a two-fixture pair.

### NEXT, in order

1. ~~**GRACE BEAMS**~~ — **DONE**, findings 74–77. ~~**`%%setfont` RICH TEXT**~~ — **DONE**,
   findings 78–80. All three came off the table.
2. **`mouse-click-01` / `tablature-15`, 7.20 of dx** — `%%sep` and `%%text` between
   systems, and now the joint top of the table.
3. **THE FOUR REMAINING LINE WEIGHTS** — `beamSpacing`, `barlineSeparation` (asymmetric,
   4.0 thick→thin and 3.4 the other way), `repeatBarlineDotSeparation`, and slur/tie
   endpoint+midpoint, which is a SHAPE port out of `draw/tie.js` and the largest.
   `beamedStem` came off this list this session.
3. **`%%setfont-N` / `$N` rich text** — the only measured item above 10px.
   `parseFontChangeLine` (`abc_parse_directive.js:727-748`) + `richText`.
4. `visual-tablature-10`'s grace before a `y` spacer; then `%%sep`/`%%text` between
   systems; then Gonzato; then audio.

### STILL NEEDING A DECISION

- **The gate hides failures** — eight per-fixture assertions in one `it`, so the first to
  fail ends it.
- **`frere-jacques`'s `M:` arrives after prose**, so `score.meter` is NULL.
- **The overlay pad's second rule**, and the **leading-header split**
  (`parse-book_parser-04-wed`, the one TUNE COUNT mismatch).

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 699/699 — NO expected failures any more
npx biome check src tests
npm run baseline                      # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short  # MUST be empty — read it, do not test the exit code
```

**`cd` DOES NOT PERSIST BETWEEN TOOL CALLS, AND A `cd` INSIDE A COMPOUND COMMAND LEAVES THE
SHELL THERE FOR THE NEXT ONE.** Bit this session: after instrumenting abcjs with
`cd …/abcjs-debug && node dump-svg.js`, the following `npx tsc` ran from THAT package and
failed with "TypeScript is not installed", which reads as a broken toolchain rather than a
wrong directory. `pwd` first when a tool suddenly goes missing.

**AND VITEST SWALLOWS `console.log` ON A PASSING TEST.** A probe that prints and passes
prints nothing. Either write to a file or make the probe throw.

**`tests/fuzz.test.ts` has a WALL-CLOCK assertion** and flakes under full-suite load.

**A COMMIT MESSAGE PASSED TO `git commit -m` IS SHELL INPUT.** Use `-F` with a heredoc.

**AND WATCH FOR A DELETED BLOCK** in a scripted rewrite: `git diff | grep -c '^-'` against
`'^+'` before committing. A baseline re-record should be symmetric.
