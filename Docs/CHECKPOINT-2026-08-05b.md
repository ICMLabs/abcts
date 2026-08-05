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
| harvested (174) | within 0.05 / 1 / 5 / 25px: **143 / 153 / 165 / 172**. **31 of 174 off some axis**, from 34. |

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

## WHAT IS LEFT, ranked

```
16.91  dy= 0.0 dx=16.9 oy= -3.5 ox= 4.6  visual-misc-06      [%%setfont] — RICH TEXT
 9.59  dy= 0.0 dx= 0.0 oy= -9.6 ox=-0.0  visual-tablature-10 grace before a `y` spacer
 7.20  dy= 0.0 dx= 7.2 oy= -0.0 ox=-4.3  mouse-click-01 / tablature-15   [%%sep, %%text]
 6.65  dy= 3.8 dx= 6.7 oy=  0.9 ox= 2.1  visual-selection-01 / svg-per-line-01
 6.22  dy= 0.0 dx= 0.0 oy=  6.2 ox=-0.0  synth-flattener-17  A GRACE BEAM
 5.74  dy= 0.0 dx= 0.0 oy=  5.7 ox=-0.0  synth-flattener-32  quarter tones
```

### NEXT, in order

1. **GRACE BEAMS — and the ground is now prepared for them.** `addGraceNotes` builds a
   `BeamElem(round(stemHeight * 3.5/5), "grace", isBagpipes)` whenever
   `gracenotes.length > 1` (`abstract-engraver.js:466-478`). The grace path through
   `createStems` is the branch this session did NOT take: `isGrace` is true when the elem
   has no `addExtra`, the stem is attached to `mainNote` rather than the elem, `dx` gets
   `elem.heads[0].dx` instead of `furthestHead.dx` — **so the double-count of finding 73
   does not apply to graces, it is a different term** — and `calcDy` scales the beam to
   `0.4`. `forceup` is always true and `calcYPos`'s too-high/too-low clamp is skipped for
   grace. We draw loose flagless stems of fixed length. `{efg}ag` is 6.21px.
2. **THE FIVE REMAINING LINE WEIGHTS** — `beamSpacing`, `barlineSeparation` (asymmetric,
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
