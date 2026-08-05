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
| 41-fixture | **26 of 29 at ZERO on all four axes** — `zocharti-loch` joined them on the meter glyph — and `ragtime-nightingale`'s twelve staff boundaries all measure 0.0. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **156 / 168 / 173 / 173**. **18 of 174 off some axis**, from 34 at the start of the day. |
| the ranked table | **NOTHING ABOVE 1.88px, AND NOT ONE `dy` TERM LEFT.** Every remaining entry is a `dx`/`ox` pair or a lone `oy`. `5` equals `25`: one fixture in 174 is outside five pixels and it is the tune-count mismatch, which has no geometry to measure. |
| CONTENT gaps | **one left** — `parse-book_parser-04-wed`'s leading-header split. |

**ONE CEILING IS RAISED, AND IT IS RECORDED IN THE TEST.** ragtime's `dy`, 0.33 → 0.40 on
finding 81 — 0.07px on a 2009-notehead fixture, against 3.2px off its own `dx` in the same
commit and 5.3px off `mouse-click-01`. The rule behind it was verified exact on four
control tunes, so what moved is a redistribution across 23 systems, not the rule.
Its `dx` raise (16.43 → 16.53, finding 68) is long gone — 13.31 now.

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

## FINDING 81 — A GRACE CARRIES ITS ACCIDENTAL, AND `extraw` IS WHERE IT SHOWS

We reserved the ROOM (`roomtaken += 7`) and never drew the GLYPH. No gate could see it: an
accidental is not a notehead, so the count is right either way. `createNoteHead` runs for a
grace exactly as for a note and places it at `accPlace -= getSymbolWidth(symb) * scale + 2`
from the head's `dx` (`create-note-head.js:88-101`) — head at −10, sharp at −16.95, and
`10 + (8.25 × 0.6 + 2)` is 16.95 exactly.

**AND IT IS WHAT THE ELEMENT REACHES LEFT BY.** `extraw` is a running MIN over every
`addExtra` child, and `addCentered` mins a chord symbol's own `−width / 2` into the SAME
number. On `"Bb"{^C}B,4` the sharp's −16.95 beats the chord's −13.34; with no accidental the
chord wins and the tune measures exact. **That is why it only showed where BOTH were
present** — four rungs of five were green.

**THE RANKED TABLE'S DIRECTIVES COLUMN NAMED THE WRONG THING.** It read
`[%%sep, %%text]`; deleting both changed nothing, and so did deleting the subtitle, the
parts box and the bar numbers. The PER-NOTEHEAD table is what named it — a clean STEP at
one musical instant in all three voices, not a growth, so one element was 7px wider in
abcjs. The directives column is a hint about what a fixture CONTAINS, never about what is
wrong with it.

Two abcjs bugs reproduced with it: the accidental reserves its own declared height
UNSCALED while drawing at 60%, and it takes the `accidental` class rather than the grace's
— our first attempt gave it `role: 'grace'`, which maps to `abcjs-notehead`, and the gate
promptly counted six noteheads against abcjs's five.

---

## FINDING 82 — `%%vocalfont` IS REALIZED, AND THE MODE-SPLIT ROW WAS REASONED

`CLAUDE.md`'s table said "parsed, NOT realized (abcjs never reads it)" and a test asserted
it. Both came from the SOURCE — "abcjs stamps `el.fonts` and reads `.fonts` nowhere in its
write phase" — and its own SVG denies it in one attribute:

| directive | drawn |
|---|---|
| none | `font-size="17" font-family="Times New Roman" font-weight="bold"` |
| `%%vocalfont Helvetica 10.0` | `13` / `Helvetica` / `normal` |
| `%%vocalfont Helvetica 20.0` | `27` / `Helvetica` / `normal` |

**WHAT MADE THE WRONG READING SURVIVE IS THE GRANULARITY.** `%%vocalfont` is a CHANGING
font: it always writes `multilineVars.vocalfont` and writes `tune.formatting` only in the
header. The mid-tune value reaches the drawing through the STAFF — `params.vocalfont` on
the `abcstaff`, applied by `getTextSize.updateFonts(abcstaff)` — so it takes effect from
the NEXT music line. Gonzato's fixture, the one the test used, has all its music BEFORE all
its directives, so abcjs draws every syllable at the default there however many
`%%vocalfont` lines follow. A true observation on a fixture that cannot discriminate.

The split is real but different: **strict takes the font its music LINE started with;
`abc2.1`/`extended` take the one in force at that point in the source** (Gonzato §4.1.4,
per SEGMENT).

Three arithmetic corrections came with it, each its own trap:
- **Points through `round(pt * 4/3)`, not a ratio of the default's already-rounded 17px.**
  They agree at 13pt and nowhere else. A ratio anchored on a rounded value cannot
  reproduce a rounding.
- **The baseline sits one FONT SIZE below the lane top**, not a constant 17 below the ink.
  17 is BOTH `spacing.vocal` and the default vocalfont's drawn size — two unrelated
  quantities that happen to be equal, which is exactly the coincidence that hides a rule.
- **`box` is not legal on every font.** `fontTypeCanHaveBox` lists eleven types and
  `vocalfont` is not one, so `%%vocalfont … box` is a font with no box.

---

## FINDINGS 83–84 — TWO TABLE ENTRIES AND A CLAMP WEARING A MAXIMUM'S CLOTHES

### 83. A QUARTER TONE IN A KEY SIGNATURE HAS A FUDGE OF ITS OWN
`createKeySignature` switches on FIVE accidentals and ours knew three — `quartersharp` is
−2.5 and `quarterflat` −1.2 (`create-key-signature.js:17-23`). Missing, they fell to the
`?? 0` default, and 2.5 pitch of phantom staff was `synth-flattener-32`'s entire 5.74px.
`K: C ^/f _/B _A ^D` is 5.74 and the same signature without the quarter tones is exact; one
rung named it. abcjs DOES draw these — `accidentals.halfsharp` and `accidentals.halfflat`
are in its own output — so the mode-split row about three-quarter tones is a different glyph
and still stands.

### 84. `Math.max(default, …sizes)` IS A FLOOR, NOT A MAXIMUM
It reads as "the largest lyric font on this part". It is harmless for anything BIGGER than
the default and silently wrong for anything smaller: `%%vocalfont Helvetica 10.0` draws at
13px and had its baseline measured at 17, so the lane hung four pixels too low and every
staff below it followed.

**The tell was the shape of the evidence**: exact with NO `%%vocalfont`, exact with
`%%vocalfont Helvetica 13.0` — the default SIZE under a different family — and wrong only at
10.0. **A rule that is correct in one direction and wrong in the other is a clamp in a
maximum's clothing.** Found by instrumenting OUR arithmetic rather than abcjs's: the lane,
the height and the size all printed correctly and the baseline they were measured from did
not. Four numbers on one line, three of them right.

---

## FINDING 85 — `Math.max(default, …)` IS A CLAMP, AND IT BIT THREE TIMES

The idiom reads as "the largest X present" and is a FLOOR. It is harmless for anything
BIGGER than the default and silently wrong for anything smaller — so it survives every
fixture that only ever goes up.

| site | default | what a smaller font got |
|---|---|---|
| lyric baseline (`anchorLyrics`) | 17px | `%%vocalfont Helvetica 10.0` drew at 13, measured at 17 |
| `chordSize` | 16px | `%%gchordfont Arial 10 box` drew at 13, measured at 16 |
| `chordBlock` | 18.52px | the same lane, measured at the 12pt default's height |

**THE SHAPE OF THE EVIDENCE IS THE TELL, and it named the third before the code was
opened.** `visual-tablature-17` sets one font at FIVE sizes — 10, 20, 40, 80, 130 — and only
the 10 was wrong. An arithmetic error does not spare four sizes out of five; a floor does,
and only ever at the bottom. The same signature had already appeared one lane over: exact
with no `%%vocalfont`, exact at the default SIZE under a different family, wrong only below.

All three are now `length === 0 ? default : Math.max(...)`, which says what was meant and
cannot clamp. **A sweep of the file found no others** — the two remaining
`Math.max(ENGRAVE.…, …)` are `minColumnGap` and `curveMinBulge`, which are minimums on
purpose.

---

## FINDING 86 — `M:C` AND `M:C|` ARE ONE GLYPH, AND THE MODEL ALWAYS SAID SO

`createTimeSignature` branches on `elem.type` and draws `timesig.common` or `timesig.cut`
as a single glyph at pitch 6 with nothing beside it (`create-time-signature.js:35-40`). Our
`layoutMeter` only ever drew digits, so `M:C` rendered as `4/4` and `M:C|` as `2/2` —
correct arithmetic, wrong ink, and `Meter.symbol` has carried the distinction all along.

**IT IS A PREFIX, WHICH IS BOTH WHY IT MATTERED AND HOW IT WAS FOUND.** Every note on every
line moves with a prefix, so `M:C` measured 1.24px narrow and `M:C|` 2.27 — **uniform on
both**. `ox` with no `dx` is the signature of a prefix rather than a spacing rule, and the
same meters written as DIGITS were exact throughout: the arithmetic was fine and the GLYPH
was missing.

Seven fixtures came inside 0.05px and six more inside 1px on this one rule, and
`zocharti-loch` became the 26th of 29 exact on all four axes.

**AND IT WAS FOUND SIDEWAYS.** The ladder was chasing `synth-flattener-09`'s 1.99 of dx.
The rung that removed its inline `[Q:]` did not move the number; the rung that changed its
METER did — and that fixture opens `M:C|` incidentally. Vary one thing at a time and the
fixture will tell you about something you were not looking for.

---

## WHAT IS LEFT, ranked

```
 1.88  dy= 0.0 dx= 1.9 oy=  0.0 ox=-1.0  mouse-click-01 / tablature-15
 1.69  dy= 0.0 dx= 1.7 oy=  0.0 ox=-1.4  visual-layout-04   [score]
 1.69  dy= 0.0 dx= 0.0 oy=  1.7 ox= 0.0  visual-parsing-10  [barnumbers, setbarnb]
 1.09  dy= 0.0 dx= 1.1 oy=  0.0 ox=-0.7  visual-wrap-01
```

**NOTHING ABOVE 1.88px IS LEFT, AND NOT ONE `dy` TERM.** The vertical arc this branch is
named for has no entry on the table at all: what remains is horizontal, plus one lone `oy`.

### NEXT, in order

1. ~~**GRACE BEAMS**~~ — **DONE**, findings 74–77. ~~**`%%setfont` RICH TEXT**~~ — **DONE**,
   findings 78–80. All three came off the table.
2. **`mouse-click-01` / `tablature-15`, 1.88** — one tune twice, a `dx`/`ox` pair.
3. **A CHORD SYMBOL WITH TWO BARS.** `"D"DEFG| DEFG |` is 1.99 of dx where the same tune
   without the chord, and the same chord with one bar, are both exact. Isolated on a
   control pair and NOT yet chased; it is what is left of `synth-flattener-09` after its
   `M:C|` was fixed.
4. **THE FOUR REMAINING LINE WEIGHTS** — `beamSpacing`, `barlineSeparation` (asymmetric,
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
