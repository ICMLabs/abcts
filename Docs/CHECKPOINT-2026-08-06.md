# abcts — Checkpoint, 2026-08-06

Supersedes `CHECKPOINT-2026-08-05c.md` for the STATE. That file keeps findings 90–99 and
the `ENGRAVE` triage table; `-08-05b.md` keeps 71–89, `-08-05.md` the line-weight audit
finding and the golden-variables map, `-08-04c.md` 51–70 and the ladder method,
`-08-04b.md` 41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## ⚖️ THE CORRECTION THAT DEFINES THIS SESSION (Lance, 2026-08-06)

> *"It seems you're doing more inferring rather than looking at abcjs constants and
> algorithms?"*

It was right, and acting on it produced the two largest single steps of the whole arc
within an hour of each other. The method that did it is in **THE HARNESS** below and it is
the most reusable thing in this file.

Measuring told me `visual-layout-04` was "a four-step staircase, so four elements are too
narrow" — a true observation and the WRONG conclusion. Instrumenting abcjs showed every
element width already matched to the third decimal and the error was in the solve. **A
measurement can only rank hypotheses you already have; the source is where the hypothesis
comes from.**

---

## 🔧 THE HARNESS — instrument abcjs in a SCRATCHPAD COPY

This is new, it works, and it should be the first tool reached for from now on. **Do not
instrument `../abcMusicKit` — another agent is working in that repo.** Copy it instead:

```bash
S=<your scratchpad>/abcjs-probe
mkdir -p $S
cp -R ../abcMusicKit/Tools/abcjs-debug/node_modules $S/node_modules
cp ../abcMusicKit/Tools/abcjs-debug/dump-svg.js $S/
cp ../abcMusicKit/Tools/abcjs-debug/dump-elements-char-widths.js $S/
cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3 $S/abcjs
sed -i '' "s#path.resolve(__dirname, '../../Docs/References/abcjs/abcjs-6.6.3')#path.resolve(__dirname, 'abcjs')#" $S/dump-svg.js
# add env-guarded console.log wherever the question is, then:
cd $S && ABCJS_PROBE=1 node dump-svg.js --file <abs path to .abc> 2>&1 | grep PROBE
```

Note `--file`; a bare path argument is treated as ABC TEXT and silently renders something
else. Three probe points earned their keep and are worth re-adding:

| where | prints |
|---|---|
| `voice-elements.js`, after `child.setX(x)` | every element's `type/dur/w/minspacing/extraw/er/x` |
| `layout/layout.js`, in `calcHorizontalSpacing` | `spacingUnits`, `minSpace`, `lineWidth`, `target`, spacing in and out |
| `abc_parse_music.js:296` | the bar-number decision: `type/notEmpty/first/curr/every` |

**AND OURS HAS THE SAME FACILITY ALREADY.** `ABCTS_PROBE=1 npx vitest run <test>
--disableConsoleIntercept` prints `PROBE item …` per element and `PROBE staff … topBy=Lnnnn`
— the line number that SET the staff's extent. That named the bar-number reserve in finding
105 directly, with no searching.

**A PROBE THAT PRINTS NOTHING NEEDS A CONTROL.** `addMeasureNumber` printing nothing was the
answer, not a broken probe — proven by the item probes printing seven lines in the same run.

---

## STATE

| | standing |
|---|---|
| suite | **703 of 703. NO REDS.** |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **164 / 173 / 173 / 173** — **10 of 174 off some axis**, from 18 this morning and 34 on 2026-08-04. |
| the ranked table | **NOTHING ABOVE 0.93px.** Not one entry exceeds a single pixel. |
| `1: 173` | **every measurable fixture is within 1px.** The 174th is the leading-header tune-count mismatch, which has no geometry to compare. |
| 41-fixture | staff spacing 72 of 73 boundaries exact (<0.05px). |
| CONTENT gaps | **one** — `parse-book_parser-04-wed`'s leading-header split. |
| `ENGRAVE` | 101 constants; bare literals 49 → 38 → fewer again as lanes migrate. |

**ONE CEILING IS RAISED**, unchanged: `ragtime-nightingale`'s `dy` at 0.40. The repeat
ending's bracket-pitch ceiling at 0.50 is the only other, and it is the staff ink top rather
than the ending.

---

## FINDING 104 — ABCJS THROWS AWAY THE SPACING IT SOLVES FROM ITS LAST LAYOUT

Seven fixtures at once, the largest single step of the arc.

```js
var newspace = space;                                  // 30
for (var it = 0; it < 8; it++) {
  var ret = layoutStaffGroup(newspace, …);             // LAYOUT at newspace
  newspace = calcHorizontalSpacing(…, ret.spacingUnits, …);
  if (newspace === null) break;
}
```

(`layout/layout.js:68-75`.) **EIGHT LAYOUTS**, and the `newspace` computed after the eighth
is never laid out with — the loop just ends. abcjs renders at the spacing that produced its
eighth layout, not at the ninth it has just solved for. Ours ran the same eight passes and
then rendered with the factor computed after the last of them: nine layouts, one refinement
further in, so **every line came out slightly NARROWER than abcjs's**.

Instrumented, abcjs's own trace never converges at all:

```
layout 1 at 30.000 -> 964.55    layout 5 at 14.238 -> 705.80
layout 2 at 20.018 -> 772.65    layout 6 at 13.496 -> 700.84
layout 3 at 16.888 -> 731.17    layout 7 at 12.930 -> 698.34
layout 4 at 15.240 -> 713.05    layout 8 at 12.454 -> 696.24
                                        ...and 12.053 is DISCARDED
```

It stops **11px short of its own 685 target** having used every iteration it has. That is
not rounding; it is where abcjs stops.

**AND IT EXPLAINS THE STAIRCASE.** `visual-layout-04`'s error was five plateaux with steps
of 0.40 and 42 of its 61 heads flat — which is exactly what a slightly-wrong spacing factor
looks like, because a spring-dominated bar carries the difference and a rod-dominated one
holds it constant. I had read that shape as "four elements too narrow". The widths dump is
what killed that reading: clef 24.051, meter 11.795, G4 10.370, the voice-overlap-widened
note 20.180, the rest 7.534, the flagged note 15.902, bar `w=1 minsp=10 extraw=-5` — **every
one already exact**.

Two side confirmations from the same run: `minPadding` is 0 and `minSpace` is 0, so abcjs's
`spacing * minSpace > 50` guard really is inert, as this repo already claimed.

Gone exact on it: `visual-layout-04` (1.77), `mouse-click-01` and `tablature-15` (1.69),
`selection-01` and `svg-per-line-01` (0.94), `transpose-05` (0.91), `wrap-01` (0.70).

## FINDING 105 — A MULTI-MEASURE REST ADVANCES THE BAR COUNTER BY ITS WHOLE COUNT

```js
if (core.rest.type === 'multimeasure' && isFirstVoice())
  multilineVars.currBarNumber += core.rest.text - 1
```

(`abc_parse_music.js:512-513`, abcjs's own comment: "The minus one is because the measure
with the rest is already counted once normally.") Ours counted `Z24` as ONE measure, so
abcjs reaches `curr=47` at the first barline where we reached 24 — and `%%barnumbers 5`
printed "25" where abcjs prints nothing, because 48 and 49 are not multiples of 5. The
phantom number reserved at pitch 16.4348 against abcjs's 16 and pushed the top staff line
down 1.68px: `visual-parsing-10`'s entire `oy`.

**THE DIRECTIVES COLUMN LIED AGAIN.** It read `[barnumbers, setbarnb]` for a defect in
multi-measure REST counting. It is a hint about what a fixture CONTAINS, never about what is
wrong with it — recorded for the third time.

Four wrong paths were ruled out in minutes by instrumenting rather than reading ours: the
golden's only extra text is 20px BOLD (`tempofont`, the multi-measure count) not
`measurefont`'s 19px italic; abcjs reserves that count as a ZERO-HEIGHT box at pitch 16,
which we already matched; `addMeasureNumber` is never called; and our own `topBy=L8217`
named the reserve line directly.

---

## WHAT IS LEFT, ranked

```
 ------  TUNE COUNT 2 vs 1  parse-book_parser-04-wed        (the one CONTENT gap)
 0.93  dy=0.0 dx=0.9 oy= 0.0 ox=-0.1  visual-transpose-output-03  []
 0.93  dy=0.0 dx=0.9 oy=-0.8 ox=-0.1  visual-transpose-output-04  []
 0.53  dy=0.0 dx=0.0 oy=-0.0 ox= 0.5  synth-flattener-14          []
 0.51  dy=0.5 dx=0.1 oy=-0.3 ox= 0.0  synth-flattener-23  [percmap]
 0.18  dy=0.2 dx=0.0 oy=-0.1 ox= 0.0  visual-decorations-01  [score]
 0.17  …  visual-tablature-20  [score]     0.15  …  visual-wrap-04  [score]
 0.07  …  synth-flattener-24  [percmap]    0.05  …  visual-multi-voice-02
```

### NEXT, in order

1. **`transpose-output-03` and `-04`, 0.93 — the top of the table and a matched pair.**
   A `dx` of 0.9 with an `ox` of −0.1, so a SPREAD and almost no prefix shift. Both are
   `transpose-output`, and `-04` also carries `oy=-0.8`. Start by dumping abcjs's element
   widths for them with the harness and diffing against ours: that one comparison settled
   finding 104 and it is cheap.

2. **`synth-flattener-23` and `-24`, `[percmap]`** — the only `dy` left on the table (0.5).
   `%%percmap` remaps a drum note to a pitch and a notehead; a `dy` says our mapped PITCH
   differs, which is a parse-side question, not geometry.

3. **TWO RULES READ BUT NOT YET CHECKED**, both found while reading for findings 104–105 and
   neither exercised by anything currently red:
   - **A rest that exactly fills a measure becomes a WHOLE rest**, whatever its written
     duration: `if (this.measureLength === duration && type !== 'invisible' && type !==
     'spacer' && type.indexOf('multimeasure') < 0) elem.rest.type = 'whole'`
     (`abstract-engraver.js:812`). Do we?
   - **`%%barnumbers 0` puts the number on the STAFF, not a barline**:
     `if (barNumbers === 0 && isFirstVoice() && currBarNumber !== 1) params.barNumber =
     currBarNumber` (`abc_parse_music.js:1036`), which reaches `addMeasureNumber(barNumber,
     clef)` — and THAT is the path where `abselem.isClef` shifts the number right by half
     its width and the `13.5` branch can fire.

4. **A BEAM DOES NOT BREAK AT A REST IN ABCJS, AND IT DOES HERE.** `(6cegczg` and `(3czg`
   are beamed by abcjs and bracketed by us; the tell is a COUNT — abcjs draws three
   triplet-bracket paths in `S3-note-syntax` tune 6 where we draw fourteen pieces. Fixing it
   changes beam GROUPING and moves real beams on every tune with a rest inside one, so it is
   a slice of its own. It settles the two tuplet numbers still off, 4.91px in x and 38.8 in y.

5. **THE REMAINING FIXED LANES** — `chordSymbolStep`, `dynamicAboveStep`, `dynamicBelowStep`,
   `annotationAboveStep`, `annotationBelowStep`, `partStep`, `tempoStep`, `lyricStep`. One
   decision, not eight. `anchorVoltas` (finding 93) is the model: resolve in the pass that
   has the final elements, shift furniture only, and **check first that the lane's ink is
   outside the staff extent** — that property is what made the volta safe and it does not
   hold everywhere.

6. **The leading-header split** (`parse-book_parser-04-wed`), the last CONTENT gap.

7. Then Gonzato, then audio.

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 703/703
npx biome check src                   # `src` ALONE — `src tests` has 20 PRE-EXISTING errors
npm run baseline                      # READ the diff
git status --short                    # `git add -A` swept a probe file into a commit today
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Another agent is working in it — Swift
parser and renderer changes plus untracked probe files. Never commit there, never revert
anything there, and **do not read a dirty status as evidence that you dirtied it**: check
whether the paths are ones you touched. This session only ever READ fixtures, goldens and
the vendored abcjs from it, and instrumented a scratchpad COPY.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there.** Put
the absolute `cd /Users/lrettberg/ICMLabs/Code/abcts &&` in front of every command — on
2026-08-05 it wrote a probe file into the vendored abcjs tree. **And vitest SWALLOWS
console.log on a passing test**: use `--disableConsoleIntercept`, or write to a file.

**DELETE YOUR PROBE BEFORE COMMITTING.** `git add -A` committed `tests/zz-probe.test.ts`
today and it needed a follow-up commit to remove.
