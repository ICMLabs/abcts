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
| suite | **701 of 701. NO REDS.** |
| harvested (174) | **18 of 174 off some axis**, UNMOVED — nothing this session touched a notehead. |
| the ranked table | unchanged: nothing above 1.77px, not one `dy` term. |
| `ENGRAVE` | **115 → 101 constants.** Bare literals 49 → **44**, of which **2 ported away** this session. |
| the audit finding | still closed. |

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
| end-hook drop | `height = 20` | 1.4 spaces = 10.85px | **blocked on the lane** |
| bracket rules | no `stroke-width`, so SVG's 1px | `thinBarline`, 0.6 | **PORTED** |
| label indent | `linestartx + 5` | 0.4 spaces = 3.1px | **PORTED** |
| label size | `repeatfont` 13pt → 17px | 1.3 spaces = 10.07px | **blocked on the lane** |
| bracket pitch | stacked staff top, 29.93px above the top line | fixed lane, 15.5px | **open** |
| bracket ends | the BARLINE RULES | the measure's first ink, +28.5px | **open** |

**WHY IT WAS INVISIBLE, THREE TIMES OVER.** An ending is not a notehead, so `pixel-parity`
never looks at it. It is not classed `stem`, `ledger` or `top-line`, so the thickness cases
never look at it. And abcjs draws the whole bracket as ONE `<path data-name="line">`, so
the barline-separation case cannot reach it either. Three gates, three different reasons,
one blind spot.

**AND ONLY TWO OF THE FIVE WERE PORTABLE, WHICH IS THE REAL FINDING.** abcjs's 20px hook
clears the staff only because abcjs's bracket sits 29.93px above the top line where ours
sits 15.5. Drop the 20 into our lane and the hook ends **4.5px INSIDE the staff**, and
`layout.test.ts`'s "clear of the music" says so instantly. **The two numbers were
COMPENSATING, which makes them one port rather than two.** The label size is coupled the
same way; the indent is horizontal and the rule weight is a scalar, so no lane can reach
either, and those landed.

> **A CORRECT CONSTANT IS NOT ALWAYS AN IMPROVEMENT.** PORT THE STRUCTURE, THEN THE
> CONSTANTS — stated in `CLAUDE.md` for months, and this is the first case where obeying
> it meant deliberately NOT landing a figure that is certainly abcjs's.

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

---

## THE TRIAGE TABLE — 44 live bare literals

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
| `spacingScale` | `PROFILES` supplies abcjs's 2.7372 in strict. **But the ENGRAVE value is still a DEFAULT PARAMETER on `naturalWidth`/`springForDuration`, so a caller that forgets gets ours silently. Make the parameter required — that is the leak class in one line.** |
| `dotSpacing` | `strict ? spaces(ABCJS_PX.dotSpacing) : ENGRAVE.dotSpacing` at the drawing site (finding 88) |
| `curveMinBulge`, `curveMaxBulge`, `curveBulgeRatio` | `curveToPath`'s strict branch uses only `Math.sign(bulge)`; the magnitude is computed and discarded. Harmless, but it should not be computed at all. |

### ABCJS-HAS-ITS-OWN, AND THE NUMBER ALREADY AGREES — cite only, expect a ZERO-line baseline diff

| constant | abcjs |
|---|---|
| `stemLength` 3.5 spaces | 7 pitch, `Math.round(70 * voiceScale) / 10`. Lance's worked example. `source` |
| `lastSystemFill` 0.66 | the literal at `layout/layout.js:102`. `source`, and unambiguous |
| `dynamicBelowReserve` 7 | `max(volumeHeightBelow, dynamicHeightBelow) + margin` = `max(6,6)+1`. `source` |
| `annotationLineStep` 5.16 steps | 19.995px ≈ the 20 the comment already derives. `source` |

### ABCJS-HAS-ITS-OWN, AND THE NUMBER DIFFERS — a port, and MEASURE FIRST

Every row below is `source` only. Three of the six are unreachable by any gate until
finding 92's handles exist.

| constant | ours | abcjs | source |
|---|---|---|---|
| `voltaHook` | 10.85px | `height = 20` | `draw/ending.js:10` — **measured**, blocked on the lane |
| `voltaTextSize` | 10.07px | `repeatfont` → 17px | `draw/ending.js:44` — **measured**, blocked on the lane |
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
itself. `anchorAboveStaff` and `anchorLyrics` have been migrating them into abcjs's stack
one at a time; `voltaStep` is next and finding 91 is blocked on it.

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

1. **The ending LANE** — move `voltaStep` into `anchorAboveStaff`'s stack. It unblocks two
   ported-and-waiting figures, and `layout.ts:7266` has been asking for it for months. Note
   the trap recorded there: putting the volta lines into the INNER `verticalExtent` call is
   what cost `mouse-click-01`'s first staff 23.25px.
2. **The ending ENDS** — anchor on the barline rules. The barlines are already exact.
3. **`data-name` for the triplet bracket, the hairpin and the brace** (finding 92), then
   triage the six constants behind them.
4. **The cite-only rows** — one commit, and the gate should show a ZERO-line baseline diff.
5. **Make `spacingScale` a required parameter** so no caller can silently take ours.
6. Then the slur/tie ENDPOINTS (`curveEndGap`), which `curveReserves` already derives a
   second time — and then `visual-layout-04`, `visual-parsing-10`, Gonzato, audio.

---

## VERIFY LOOP — and the trap that bit TWICE this session

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 701/701
npx biome check src                   # `src` alone: `src tests` has 20 PRE-EXISTING errors
npm run baseline                      # READ the diff
git -C ../abcMusicKit status --short  # MUST be empty — read it, do not test the exit code
```

**`cd` DOES NOT PERSIST, AND A `cd` INSIDE A COMPOUND COMMAND LEAVES THE SHELL THERE.** The
handoff warns about this and it still cost two runs — and once it did something worse than
waste a run: a heredoc meant for `tests/` **wrote a probe file into the read-only vendored
abcjs tree**, because the previous command had ended in `cd …/abcjs-6.6.3`. Removed, and
`git -C ../abcMusicKit status --short` verified empty. **Put the absolute
`cd /Users/lrettberg/ICMLabs/Code/abcts &&` in front of EVERY command, not just the vitest
ones** — the danger is not only reading the wrong package, it is writing to the wrong repo.

The sibling repo is now **completely clean**; the untracked `TempFileHeaderFieldsProbe.swift`
the previous handoff mentioned is gone.

**AND VITEST SWALLOWS `console.log` ON A PASSING TEST** — write to a file. Every measurement
in this checkpoint came from a throwaway `tests/zz-probe.test.ts` writing to `/tmp`, deleted
after use. That pattern is worth keeping: it reaches `absolutePixels` and both engines'
output in about fifteen lines.
