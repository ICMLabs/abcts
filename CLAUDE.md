# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## How to read this file

⚠️ **THE CURRENT STATE IS NOT IN THIS FILE.** It is in `Docs/PARITY-STATUS.md`, which is
re-measured rather than carried forward — read that first, then
`Docs/NEXT-AGENT-PROMPT.md` and the newest `Docs/HANDOFF-*.md`.

What is here, and where:

| | |
|---|---|
| **the standing order + the method** | `## First Step — Always` — long, and load-bearing |
| **commands** | `## Running it`, `## Measuring progress`, `## Quality Gate` |
| **rules that bind** | `## Development Rules`, `## License`, `## Remote` (attribution) |
| **where things live** | `## Key Files and Paths` |
| **the target** | `## Parity targets, by mode`, `## Modes` |
| **the rules that transfer** | `### The rules that transfer` — what 119 handoffs and checkpoints left behind |

⚠️ **AND EVERY NUMBER IN A `>` BLOCKQUOTE IS WHAT WAS TRUE ON THE DATE BESIDE IT.** Run the
gate rather than quoting one. The dated LOG that used to fill `## Current phase` was deleted
on 2026-09-23 — **60 handoffs and 59 checkpoints in `Docs/`** are the durable record, and
this file keeps only what is true of every session.

## First Step — Always
**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE** — the 47-fixture sibling
corpus, the 237-fixture in-repo corpus (180 harvested from abcjs 6.7.1's own tests + 57
hand-written controls, 697 tunes) and the audio feature set. Work until it is reached;
checkpoint and hand off as you go so no context is lost.

> ⚖️ **THE RULING THAT GOVERNS THE GLYPH/METRIC SPLIT** (Lance, 2026-08-05): the Bravura
> authorisation **never covered `abcjs-strict`**. Strict reproduces abcjs byte for byte, so
> it has NO latitude — every figure it draws with must be abcjs's. `abcjs-extended`
> is where the flexibility lives. **Any Bravura input reachable in strict is a defect, not
> a decision.**
>
> **BOTH CLASSES ARE NOW CLOSED, AND THE FIRST ONE HAD TO BE CLOSED TWICE.** The line
> weights were declared closed on 2026-08-05 and were not: `ABCJS_WEIGHTS` began with a
> `...BRAVURA_WEIGHTS` spread, so every key nobody had reached stayed Bravura's silently,
> and `slurEndpoint` — one of four the file itself flagged as "still Bravura's in strict" —
> turned out to be the TUPLET BRACKET's rule weight. The flag was read as harmless because
> the CURVE ignores those four; nobody asked what else read one. **A constant is reachable
> by every caller, not by its name.** The spread is gone, so a missing override is now a
> COMPILE ERROR. The second class — raw `GLYPHS[…]` reads bypassing `glyphsFor(strict)` —
> is audited: six sites, two leaks (a curve anchor's notehead width and a rest's ink box,
> up to 2.51px and changing sign with the glyph), four legitimate and now checked rather
> than assumed. See `Docs/CHECKPOINT-2026-08-05c.md`, findings 96-98.

> ✅ **CLOSED AUDIT FINDING, kept because the LESSON transfers.**  Strict drew Bravura's line weights for
> months — a thin barline at 1.24px against abcjs's 0.600 — and **no gate could see it**:
> `pixel-parity` compares glyph bounding-box CENTRES, and a line's centre does not move when
> its thickness changes. Neither gate was broken; both were blind to the same axis because
> `PixelItem` carried only a centre. **A comparison can only catch what its representation
> can express.** When something is invisible to every gate, ask what the gate's DATA MODEL
> leaves out, not whether the number is small.

> ⚖️ **AND THE ARCHITECTURAL FORM OF IT** (Lance, 2026-08-05): *"We keep measuring
> differences to abcjs — when shouldn't we be using abcjs values?"* Measured: **`ENGRAVE`
> holds 115 constants, 54 from `ABCJS_*` and 61 OURS — and strict reads all 61.** The
> default in the strict path is our judgement and abcjs's is the exception, which is why
> every leak is found one fixture at a time. Measuring is a COMPASS (which rule is wrong)
> and a PROOF (that a port landed); it must never be a SOURCE OF NUMBERS. See
> `CHECKPOINT-2026-08-05b.md`, whose §triage sorts the live bare literals into a table. Each
> row says whether its evidence is `measured` or `source`, and **a `source` row must be
> measured before it is ported.**
>
> ⚠️ **AND THE COUNT IN THAT TABLE IS OLD — `ENGRAVE` is 122 constants today (re-measured
> 2026-09-23), not the 101 this paragraph used to claim.** What has changed underneath it is
> that every byte gate now reads zero, so a constant that is still OURS is one no fixture
> can reach rather than one nobody has checked. Re-measure a row before working it; the
> ruling above is what stands.

> ⚖️ **AND THE COROLLARY THE TRIAGE PRODUCED** (finding 91): **A CORRECT CONSTANT IS NOT
> ALWAYS AN IMPROVEMENT.** abcjs's volta hook is 20px against our 10.85, certainly and
> measurably — and porting it ALONE puts the hook 4.5px inside the staff, because abcjs's
> hook clears the staff only by virtue of abcjs's bracket sitting 29.93px above the top
> line where ours sits 15.5. The two numbers were COMPENSATING, which makes them one port
> rather than two. PORT THE STRUCTURE, THEN THE CONSTANTS is stated below; this is the
> first case where obeying it meant deliberately NOT landing a figure known to be abcjs's.

> ⚖️ **AND WHAT IT MEANS IN PRACTICE** (Lance, 2026-08-06): *"It seems you're doing more
> inferring rather than looking at abcjs constants and algorithms?"* It was right, and
> acting on it produced the two largest steps of the whole arc within an hour. Measuring
> said `visual-layout-04` was "a staircase, so four elements are too narrow" — a true
> observation and the wrong conclusion; instrumenting abcjs showed every element width
> already matched to the third decimal and the error was in the SOLVE. **A MEASUREMENT CAN
> ONLY RANK HYPOTHESES YOU ALREADY HAVE; THE SOURCE IS WHERE THE HYPOTHESIS COMES FROM.**
> The harness for instrumenting abcjs — in a SCRATCHPAD COPY, never in `../abcMusicKit` —
> is written out in `Docs/CHECKPOINT-2026-08-06.md`.

> ⚖️ **AND THE RULING BEHIND THE RULING** (Lance, 2026-08-05): **abcjs is the MASTER
> SOURCE. Any variability is likely due to not using the same SETTING as abcjs, or to
> INFERRING an algorithm instead of analysing abcjs.** Finding 73 is what that costs when
> ignored: `createStems` counts a beamed head's `dx` twice, the quirk was READ, judged
> "zero for the common case", left out — and that judgement was the entire remaining error
> on `ragtime-nightingale`, the branch's one standing red. Port the quirk, then measure.

> ⚖️ **AND HE HAD TO SAY IT AGAIN** (Lance, 2026-08-07): *"remember that abcjs code has the
> answers."* What it cost to ignore, in one sitting: reprinting the key in force made
> `ragtime-nightingale` WORSE (dx 13.31 → 14.18), so I GUESSED at why, implemented the
> guess, and it changed nothing at all. Reading `parseKey` gave it in one pass —
> `impliedNaturals`, three lines of source, dx → 12.13. **A measurement can only rank
> hypotheses you already have.**

> 🖥️ **RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist
> between tool calls, and the workspace ROOT has its own vitest reach: run from there and it
> collects every test in every sibling repo — abcjs's own included — and prints a wall of
> failures that are nothing to do with this one. It bit twice on 2026-08-08. And run
> `npx tsc --noEmit` BEFORE `git commit`, not alongside it: a duplicate object key shipped
> that day because vitest passed and the typecheck came back after the push.

> 🔬 **INSTRUMENT BOTH ENGINES — STANDING AUTHORITY** (Lance, 2026-08-13, and three times
> before): *"you have abcjs code to work from and the ability and my authority to add
> instrumentation to abcjs and to abcts to converge to 100% byte parity."* Reaching for a
> probe is the FIRST move, not the last resort. Instrument a SCRATCHPAD COPY at
> `/tmp/gp/abcjs` — never `../abcMusicKit` — and abcts through `scripts/zzpr.ts`, gating
> each probe on its own env var. **Print BOTH engines' answer for the same quantity in one
> sitting**: two of this branch's biggest steps came from a probe that printed abcjs's
> number and NOTHING from ours, which moves the search from "our arithmetic is off" to
> "this code never runs", and a probe that prints the RIGHT answer has ruled something out.
> **Never stop at "the source says X" when the output can be asked.** A careful chain of
> source reads has predicted something abcjs's own output denies SIX times here — the `G8`
> breve, the `extra-class` accent, the notehead `data-name`, the `sfz` glyph table,
> `beambr`'s `+= elem.w` guard, and `gstem=up`, where the switch has no arm for the word at
> all and the stem is set by the `up` its unknown key failed to eat.
> If a fix is only half understood, WRITE THE MEASUREMENT DOWN instead of shipping it.
>
> ⚠️ **AND WHEN THE SOURCE IS NOT ENOUGH, INSTRUMENT — THE DUMP LIES.**
> `dump-elements.js` publishes `staff.top`/`bottom` BEFORE `setUpperAndLowerElements`
> mutates them, and half a session went on a term list reasoned off that number. A
> scratchpad copy with a `console.error` after every `moveY` answered the page walk in ONE
> run. For anything in the SOLVE, patch `dist/abcjs-basic.js` (unminified) by string
> replacement and inject it — `layoutOneItem`, `setPaperSize`, `renderText`, `moveY` and
> `nonMusic`'s row walk are already instrumented in the scratchpad copy.
>
> ⚠️ **AND A PROBE MUST BE CHECKED AGAINST ITS OWN DELIBERATE BREAK.** Four probes were MUTE
> on their first run here — a 200-character MIDI prefix identical whatever the tune, a tempo
> byte that never moved, a part-box filter matching nothing, and a node-vs-browser text
> comparison. A probe that cannot fail proves nothing, and one that measures two different
> quantities is worse than none: `minPadding`'s ULP stood for three sessions behind a probe
> that compared the grouping (which agreed) and never printed the term the tail was in.
>
> ⚠️ **AND A NODE PROBE AND A BROWSER PROBE ARE DIFFERENT ENGINES FOR ANYTHING TOUCHING
> TEXT.** Node has no `getBBox`: the measurement falls back to the calibrated tables and
> `boxInkAt` answers `null`. That is deliberate — the goldens ARE the headless measurement —
> so a comparison against abcjs must happen in the SAME browser, and a control asserting a
> browser-only number will pass in node against its own break.

> 🔬 **AND abcjs ITSELF IS RUNNABLE**: `node dump-svg.js --file x.abc --output x.svg` from
> `../abcMusicKit/Tools/abcjs-debug`, at the goldens' own `{staffwidth: 670}`, with
> `dump-elements.js` beside it. **`ABCJS_VERSION` PICKS THE TREE** — it defaults to 6.7.1
> now, so it is only needed to run an older one, and a run against the wrong tree once
> accused this engine of a defect it did not have. `--add-classes` is not optional either:
> without it every generated class in abcjs's output is the empty string.
> **A LADDER OF CONTROLS THROUGH BOTH ENGINES IS A FIVE-MINUTE OPERATION**, and it is what
> names a rule; a FIXTURE NAME IS NOT EVIDENCE, and `stretchlast-1`'s defect had nothing to
> do with `%%stretchlast`.

> ⚖️ **GONZATO IS NOT AN abcjs-PARITY TARGET** (Lance, 2026-09-25, superseding the
> 2026-08-08 deferral): *"abcjs was never able to render all of Gonzato's examples as they
> are based on abcm2ps and abc2svg."* The book documents abcm2ps/abc2svg behaviour, so
> abcjs is not an oracle for it and strict cannot be held to it. It was REMOVED from the
> standing order above. If it returns, it returns as an `abcjs-extended` coverage question
> measured against abcm2ps/abc2svg OUTPUT (clean-room), never as a strict gate.

> ⚖️ **AND v1 HAS ALREADY ANSWERED THE ARCHITECTURAL QUESTION** (Lance, 2026-08-10b: *"v1
> port from js encountered similar rounding issue — so v1 may have the solution used to get
> to byte parity to js"*). It did, and **THERE IS NO CLEVER ROUNDING: v1 NEVER INTRODUCED A
> SECOND UNIT.** It holds abcjs's own PIXELS end to end — `Spacing.STEP = 3.875`,
> `calcY(pitch) = staffAbsoluteY - pitch * STEP`, `roundNumber = parseFloat(x.toFixed(2))`
> for paths and text, plain JS `String(number)` for the raw `width`/`height`. This engine
> does every one of those now: `UNIT_PX = 1` and the layout holds abcjs's pixels, because
> only the SAME ARITHMETIC produces the same bytes. **And at the one place a scale had to
> exist, v1 solved it by ASSOCIATION ORDER** — `pitch * STEP * stepScale`, never
> `pitch * (STEP * stepScale)`, "to keep the 1.0 path bit-for-bit". The strict path's
> expression must never contain a CONVERTED constant, and a mode factor goes on the OUTSIDE
> where 1.0 is the identity.

> 📈 **AND THE CORPUS IS TOO SMALL TO SEE A QUADRATIC — `npm run scale` IS THE GATE THAT
> CAN.** Every comparison here renders fixtures whose largest is a few hundred notes, so an
> O(n²) shows up as a flat, diffuse cost and a profiler over them says nothing.
> `scripts/zzscale.mjs` measures the SHAPE OF THE CURVE instead — eight kinds of music at
> three sizes, asserting the per-note cost does not run away — and it found **FIVE
> quadratics in one sitting**, three worth an order of magnitude (a warning scan from the
> start of the source PER WARNING, 85% of a render; `lastIndexOf` with no floor; an anchor
> filter over all anchors for every anchor).
>
> ⚠️ **TWO OF THOSE HAD ALREADY BEEN MEASURED AND REJECTED** — "973ms → 975ms on the
> corpus". Every number was right and every one was the wrong instrument: **a benchmark
> whose inputs are all small cannot see a quadratic**, and "measured and rejected" is only
> as good as the input that measured it. ⚠️ **AND ONE FIX HAD TO BE LAZY** — an eager map
> really did make the biggest fixture slower, because a short line's scan is cheaper than
> the map that replaces it; build it on first use. ⚠️ **AND IT IS A SCRIPT, NOT A TEST**: a
> wall-clock measurement inside the parallel suite measures the MACHINE, and a flaky gate is
> worse than no gate.

### The rules that transfer

**119 handoffs and checkpoints in `Docs/` hold the arcs themselves** — the geometry, the
unit flip, audio, the MIDI file, the chord grid, the DOM contract, the browser gates, the
host-option matrix and the tune-object oracles. What follows is what they left behind: the
rules that are true of the NEXT session rather than of the one that found them. Each was paid
for once, most of them twice.

**ON WHAT A GATE CAN AND CANNOT SEE**

- **A COMPARISON CAN ONLY CATCH WHAT ITS REPRESENTATION CAN EXPRESS.** Strict drew Bravura's
  line weights for months — a thin barline at 1.24px against abcjs's 0.600 — and no gate
  could see it, because `PixelItem` carried only a CENTRE and a line's centre does not move
  when its thickness changes. When something is invisible to every gate, ask what the gate's
  DATA MODEL leaves out, not whether the number is small.
- **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS COMPARISON.** `pixel-parity`
  read `<name>.svg` and silently skipped every multi-tune fixture — 89 tunes with abcjs's own
  goldens sitting in the same directory. `svg-bytes` did the same and the seven tunes it
  skipped named a whole missing feature. Before concluding a gate is exhausted, ask what
  evidence EXISTS, not what the evidence says.
- **A GATE BUILT ON OUR OWN MARKUP FAILS WHEN WE SUCCEED**, and the failure is the signal.
  Five did: a density test keyed on `transform="translate("`, a glyph filter keyed on "a
  `<path>` with no `data-name`", two keyed on a class that is empty without `add_classes`,
  and a line-weight probe that asked a one-path bracket for a per-stroke box.
- **A GATE THAT RECORDS ITS OWN NUMBERS CANNOT SEE A CHANGE OF UNITS.** The harvested table
  went to 74 of 177 fixtures off some axis, one by 211.8px, **and its assertion passed the
  whole time** — it ratchets "no worse than recorded" against numbers it had recorded. It was
  found by READING THE REPORT.
- **A RATCHET THAT NAMES ROWS CATCHES WHAT AN AGGREGATE HIDES.** Two fixtures went from
  byte-exact to differing while the total improved; a ratchet holding 4% of what is green is
  a ratchet in name. ⚠️ **AND A GATE'S REPORT FILE IS NOT ITS RESULT** — `/tmp/abcts-*.txt`
  outlives the run, and a gate was called green twice off a stale one.
- **AN OPTION IS A RESERVE MAGNIFIER.** Five rules closed on the host-option matrix were
  defects on the DEFAULT path that no default-path gate could see: a width only reaches the
  page when it beats the elastic gap beside it. Corollary: **A SECOND ALGORITHM REVEALS EVERY
  COINCIDENCE THE FIRST ONE PAID FOR.**
- **A RESERVE ALWAYS MASKED BY A BIGGER ONE IS A RULE NO GATE CAN SEE** — a chord's incoming
  tie-half had been dead since it landed, because a clef declares `bottom: -1` and the tie's
  own 0 never won the `min`.
- **TWO SURFACES, AND A CONTROL THAT READS ONE IS MUTE FOR THE OTHER.** The ink and
  `tune.lines` carry the same rules separately, and eight open-row families were rules this
  repo had ALREADY PORTED at the site that named them: the renderer knew `%%staffnonote` and
  `clefChangeSilent`, the grace path knew a tie's carry was positional. **A rule ported at
  the site that named it is not a rule ported** — grep this repo before building one.
- **THE INK AND THE CLOCK ARE DIFFERENT SURFACES TOO.** A note longer than a breve was
  SILENT here for as long as its row existed, because its DRAWING is a declared divergence
  and nobody asked whether it still sounded.
- **A DEFECT CAN NEED A BIGGER PAGE TO BE VISIBLE**: an accidental reserving in y rather than
  pitch is one ULP of `staff.top`, expressible only three thousand pixels down.
- **RE-RUN BEFORE BELIEVING A RED.** The suite timed out under load and reported three reds
  where the same tree re-ran green in 35 seconds. ⚠️ **AND A BISECT THAT NEVER TURNS GREEN
  MEANS THE CAUSE IS NOT IN THE HISTORY** — seven commits bought what `ls -la` on two inputs
  said at once: an uncommitted fixture edit in `../abcMusicKit`.

- **A GATE THAT COMPARES A ROW'S SHAPE CANNOT SEE WHAT ITS ENTRIES ARE.** The timing gates
  were at zero while every playback cursor threw on its first note: `elements` held the right
  COUNT of stand-in objects where abcjs holds live `<g>` nodes. The first real page built on
  abcts found it in one click (2026-09-25). **Build the consumer, not only the comparison.**

**ON METHOD**

- **READ THE NAMED abcjs FUNCTION, THEN PROBE. Neither half works alone.** Measuring can only
  RANK hypotheses you already have; the source is where a hypothesis comes from, and the
  output is what settles it.
- **PORT THE STRUCTURE, THEN THE CONSTANTS.** Every costly divergence here has been
  architectural rather than numeric. **AND A CORRECT CONSTANT IS NOT ALWAYS AN IMPROVEMENT**:
  abcjs's volta hook is 20px against our 10.85, certainly — and porting it ALONE puts the
  hook inside the staff, because the two numbers were COMPENSATING.
- **MEASURING IS A COMPASS AND A PROOF, NEVER A SOURCE OF NUMBERS** (Lance, 2026-08-05).
  Two pre-computed constants that hid real defects: a spring folded `sqrt(2)` in and rounded
  to four decimals (a relative 1.5e-5 on every note, invisible to a 0.05px gate and not to a
  byte comparison), and a tempo's pre-text gap was a flat staff space where abcjs measures
  one AVERAGE CHARACTER.
- **A LADDER OF CONTROLS, ONE VARIABLE PER RUNG, IS WHAT NAMES AN INTERACTION.** `"D7"…|1…`
  took five rungs to say "a chord AND an ending", which is a BRANCH in abcjs and invisible in
  either feature alone. A CONTROL TUNE is the proof, not a fixture.
- **A RECORDED CAUSE IS A HYPOTHESIS, HOWEVER CAREFULLY IT WAS WRITTEN DOWN — and its SIZE
  rots faster than its cause.** Four recorded causes were wrong in one session and all three
  "do not re-open" rows fell, each about an hour once the right model was in hand. A wrong
  cause gets tested and falls over; a wrong SIZE stops the work being attempted at all.
- **A NOTE THAT NAMES A CAUSE IS THE REASON THE ROW STOPS BEING READ.** Five times: the `G8`
  breve (a wrong GLYPH explained away as a bounding-box difference, with the cited 16.83 being
  `noteheads.dbl`'s own published width), the `extra-class` accent, the notehead `data-name`,
  the `sfz` table, and `minPadding`'s ULP. Rule the cause OUT on a control before writing it
  down.
- **A TEST CAN ENCODE AN INFERENCE AS FIRMLY AS A COMMENT CAN, AND IS HARDER TO NOTICE** — a
  green test reads as a checked fact. Three asserted this engine's own engraving as though
  measured, and one gate NORMALISED abcjs's answer away before comparing.
- **SIZE AN ARC BY GREPPING THE REFERENCE, NOT BY REASONING ABOUT IT.** "51 call sites must
  learn their drawn x" was TWO. And size a representation change by SAMPLING THE ARITHMETIC:
  a ten-line script over 32 width/scale pairs decided two landings before the engine was
  touched, and killed a third candidate that was worse than what it replaced.
- **ENUMERATE THE REFERENCE, NOT THE NOTES.** Sixteen defects came out of abcjs's own
  DIRECTIVE SWITCH, which named 41 directives this parser never mentioned. A `ponytail:` that
  says "no fixture writes one" is a PREDICTION; writing the fixture is how it becomes a
  measurement. **AND A GATE THAT CANNOT BE REGENERATED STOPS GROWING WITH THE CORPUS.**
- **WHEN A CHANGE TO AN INPUT MOVES NOTHING, THE OUTPUT IS NOT READING THAT INPUT.** Twice a
  careful fix changed nothing at all, and both times the value it computed was being
  overwritten downstream. ⚠️ **AND HALF A RULE CAN BE WORSE THAN NONE**, four times, with the
  row count unchanged.
- **A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A WRITTEN-DOWN MEASUREMENT.** Several were
  implemented, measured and REVERTED on purpose, with both engines' numbers recorded instead;
  every one of them landed later in about an hour.

**ON THE ARITHMETIC, WHICH IS PART OF THE PORT**

- **A RECOVERY IS NOT A PRIMITIVE.** `(a + b) - b` is not `a`, and on a rounding boundary that
  is a printed digit. Six times: a flag's `dx`, a key signature's `dx`, `minx`'s two adds, a
  dot's offset, a rule's centre for its edge, and a grace accidental's left reach — that last
  one already written down AT THE SITE and re-derived three lines later. Where abcjs keeps a
  primitive, keep the same primitive; carry a constructed value rather than re-deriving it.
- **AN ASSOCIATION IS A DECISION.** `a + b + c` is `(a + b) + c`, and abcjs's grouping is part
  of the port: nine fixtures turned on one pair of brackets in `printSymbol`.
- **A TOTAL IS NOT A WALK, AND A SUM CANNOT SEE AN ORDER.** Six times — `calcHeight`,
  `topAdvances`, the bottom-text block, the stacked page cursor, the above-lane order, a
  `%%text` before the music. Spend each term where abcjs spends it.
- **abcjs HOLDS THE VERTICAL IN PITCH AND MULTIPLIES BY `STEP` ONCE**; hold the extent in
  pitch, not in y divided back. And `roundNumber` is `parseFloat(x.toFixed(2))`, which
  disagrees with `Math.round(x*100)/100` on a decimal half.
- **A DECLARED BOX IS WHAT abcjs RESERVES — it does not measure what it draws.** Notehead,
  accidental, clef, key, meter, tempo, tuplet, dynamic, decoration and tie all reserve
  declared figures, and a BEAM reserves nothing. It is not a skyline. **AND "DOES NOT
  RESERVE" HAS TO BE SAID, NOT OMITTED**: an absent reserve falls back to an ascent/descent
  estimate, which reserves MORE.
- **A DECLARED EDGE OF ZERO IS NOT DECLARED AT ALL** — `if (opt.bottom)` and `0` is falsy.
  Ported twice: a stem whose low end is pitch 1, and a mezzosoprano clef.
- **TWO ERRORS CANCELLING IS THE NORMAL SHAPE HERE**, six times — including a correct change
  that made a fixture WORSE because it had been masking a latent defect, and an empty
  `%%center` whose row and ink were wrong in opposite directions so the page agreed. Land the
  structure, then chase what it exposes.
- **DOCUMENT ORDER IS CREATION ORDER, AND NO POSITIONAL GATE CAN EXPRESS IT.** abcjs draws
  the music first, then the beams, then everything else; `_addChild` is a plain push.

### Where the detail lives

**`Docs/PARITY-STATUS.md` first — it is the only file re-measured rather than carried
forward**, and it is what to hand anyone asking "how close are we to abcjs?". Then
`Docs/NEXT-AGENT-PROMPT.md` for the board, then the newest `Docs/HANDOFF-*.md`, then
`ARCHITECTURE.md` in full — it is the specification and decision record, and an architectural
decision that contradicts it needs Lance, not a commit.

119 handoffs and checkpoints sit beside them, newest first, each named for its date. The
ones worth knowing by name:

| what you are after | file |
|---|---|
| the tune-object oracles and the named open rows | `tests/open-rows.ts` header, `PARITY-STATUS.md` §3b |
| how the host-option matrix was closed | `CHECKPOINT-2026-09-16.md` §3, `HANDOFF-2026-09-16.md` |
| the browser gates, and why a golden cannot replace them | `CHECKPOINT-2026-08-31-browser-parity.md` |
| what we decline to reproduce, with its evidence | `Docs/ABCJS-DIFFERENCES.md` |
| where we are deliberately worse-shaped for parity's sake | `Docs/ABCJS-DEBT.md` (`abcjs-debt:`) |
| our own shortcuts, each with its trigger | `Docs/PONYTAIL-DEBT.md` (`ponytail:`) |
| the audio arc, the MIDI file, the chord grid | `CHECKPOINT-2026-08-08c/e.md`, `-08-09.md`, `-08-09b.md` |
| the unit flip and the SVG frame | `CHECKPOINT-2026-08-10b/c/d.md` |
| the `ENGRAVE` constant triage | `CHECKPOINT-2026-08-05c.md` |
| how to instrument abcjs, written out | `CHECKPOINT-2026-08-06.md`, `-08-11.md` §5 |

⚠️ **EVERY NUMBER IN THOSE FILES IS WHAT WAS TRUE ON ITS DATE**, and several carry a banner
saying which abcjs release they were measured against. Run the gate rather than quoting one.

## Two Swift Reference Packages — SPLIT BY QUESTION TYPE
ICM Labs maintains two Swift packages you will reference. Both are
siblings of this repo under `ICMLabs/Code/`:

- **`../abcMusicKit`** (v1)  — direct Swift port of abcjs, inheriting abcjs's design,
                               algorithms and performance along with its behavior.
                               FROZEN at tag `v1-frozen-2026-07-07`. **In production**
                               — the engine Music Studio ships today.
- **`../abcMusicKit2`** (v2) — clean-room reimplementation. **Not production**;
                               still being brought to functional parity with v1.
                               Actively developed, so it is a moving target.

**Which one answers depends on what you are asking:**

| Question | Reference | Why |
|---|---|---|
| *What should the output BE?* | **v1** | It is production and shipping. Behavior is proven. |
| *How should this be BUILT?* | **v2** | Modern design, written to be better than what v1 inherited. |

So: take the model shape, type design, algorithms, pipeline structure,
exact-`Rational` durations and source-map approach from **v2**. Take the answer to
"what notes, what durations, what does this ABC actually produce" from **v1**.

**Never port an algorithm out of v1.** Its internals are abcjs's internals, carried
over wholesale — including the slow and awkward parts. Read v1 for *what* it
produces, never for *how*.

Do not treat v2 as a behavior oracle — it has known gaps against v1.

When the two conflict on something that is BOTH (a model shape that changes
observable behavior), say so and ask rather than picking.

## License — Non-Negotiable
- abcts is MIT. All runtime dependencies must be MIT, ISC, BSD, or Apache 2.0.
- abcm2ps and abc2svg are GPL. Never read, reference, or port from their
  source code — not even for a single algorithm. Behavioral observation only.
- abcMusicKit and abcMusicKit2 are MIT and are safe to reference directly.

## Quality Gate
The corpus is the only quality gate that matters. All work must pass
corpus tests before it is considered complete. A green corpus means
correct behavior. Nothing ships red.

## Development Rules
- TypeScript strict mode throughout — no exceptions, no overrides
- Result types not exceptions — `{ ok: true, ... } | { ok: false, errors }`
- Immutable AST — parse result is frozen, never mutated
- Compat layer calls core — core has zero knowledge of compat
- One step at a time — confirm with Lance before moving to next step
- When unsure about a decision — ask, do not assume

## API Modes
- **compat**    — abcjs-identical API, derived from abcMusicKit
- **core**      — `parse`/`render`, which is where the two COMPATIBILITY modes live

⚠️ This list named a **standard** and an **extended** API mode and neither ever existed as
one: the split is `abcjs-strict` vs `abcjs-extended` on `parse`/`render`, and `compat` hard-
wires strict. See §Modes.

## Key Files and Paths
- `ARCHITECTURE.md`   — full specification and decision record (read first)
- `abcts.config.json` — corpus and goldens paths
- `tests/corpus-abcjs/fixtures/` — the IN-REPO corpus, 237 files / 697 tunes: 180 harvested
  from abcjs's own test suite (`npm run harvest`) and 57 hand-written `abcts-*` control
  ladders. ⚠️ `npm run harvest` KEEPS every fixture not listed in `SOURCES.json` — it used to
  clear the directory, which once deleted all 57 controls with their goldens still keyed on
  the names.
- `../abcMusicKit/Tools/abcjs-debug/fixtures/` — the SIBLING corpus, 47 `.abc` fixtures,
  with its goldens beside it in `golden/`: 46 `.parse.json`, 41 `.elements.json` and 384
  SVGs in five flavours (plain, `-classes`, `-print`, `-stacked`, `-stacked-print`).
  ⚠️ Counts re-measured 2026-09-23; this list has been wrong three times, the instrument
  moving rather than the corpus.
- `../abcMusicKit/Docs/References/abcjs/` — the vendored abcjs SOURCE, three trees:
  `abcjs-6.7.1` (the target), `abcjs-6.7.0` and `abcjs-6.6.3`. All three are kept because
  citations written before each upgrade name that tree's line numbers, so a stale citation
  can be CHECKED rather than guessed at. `dist/abcjs-basic.js` beside them is the unminified
  build to instrument.
- `../abcDocs/` — workspace-wide docs, private. Owns anything serving more than one repo.
  Two entries matter here: `reference/INDEX.md` catalogues the reference library (Gould's
  *Behind Bars*, the source for melisma geometry — contents gitignored, never
  redistributed), and `policy/CLEAN-ROOM-IMPLEMENTATION.md` holds the clean-room rule.

No git submodules — corpus and abcjs live inside the abcMusicKit repo and are
reached by relative sibling path. See ARCHITECTURE.md § Repository Structure.

**Clean-room, precisely.** §Scope of the policy above draws the line: the prohibition is on
reading the SOURCE CODE of tools implementing the same functionality — abc2svg, abcm2ps,
abc2midi, LilyPond, MuseScore — which stay black boxes, observed only through their output.
It is NOT a prohibition on published documentation. Gould's *Behind Bars* and the
Dorico/LilyPond/MuseScore architecture essays may be read and cited. What may never happen
is reproducing their prose, tables or figures verbatim into our docs — summarise and cite.
This repo pushes to a remote, so a verbatim quote here is redistribution.

## Remote
`origin` is PUBLIC on the ICMLabs GitHub org, as of 2026-07-22. It was a private backup
remote before that and several notes still assume so — the clean-room rule in particular
reasons from "this repo pushes to a remote, so a verbatim quote here is redistribution",
which is now sharper rather than weaker.

Two consequences that are live rather than theoretical:
- **Licence notices are obligations now.** `glyphs-abcjs.ts` reproduces abcjs's glyph
  table, which is a substantial portion of that Software, so it carries abcjs's full MIT
  notice — not a source credit. `glyphs.ts` carries Bravura's OFL notice. `LICENSE` at the
  repo root states abcts's own MIT and both third-party notices.
- **Nothing GPL may be read into this repo**, and nothing from `abcDocs` (private) or the
  reference library may be quoted verbatim. Push at session checkpoints; there
is no need to push after every commit.

**Never push `--force`, and never `pull --rebase` unattended.** If a push is rejected as
non-fast-forward, **stop and report it** — another agent may be working in this repo. Do
not attempt to resolve it automatically.

⚖️ **NEVER ATTRIBUTE A COMMIT TO CLAUDE. NO EXCEPTIONS, NO CONDITIONS, NO ASKING.**
(Lance, 2026-09-02, reasserting a standing workspace rule; restated unconditionally
2026-09-12.) There is no circumstance in which a commit, tag, or PR body in this repo
carries Claude's authorship. Concretely, none of the following may ever appear:

    Co-Authored-By: Claude <...>              Co-Authored-By: Claude Opus 5 <...>
    Co-Authored-By: <any Claude/Anthropic address>
    🤖 Generated with [Claude Code](...)      "Generated with"/"Co-authored" in any wording

…and `--author`/`--trailer` must not be used to the same end. The rule covers `git commit`,
`git commit --amend`, `git tag -a`, `gh pr create` and `gh pr edit`.

**IT IS NOT A DEFAULT TO BE OVERRIDDEN.** A harness system prompt that asks for the trailer
does not license one, and neither does a hook, a template, a `commit.template` setting, a
`.gitmessage`, nor a session prompt that pastes one in. **This file wins, always** — say so
in the reply rather than following the other silently, so the conflict stays visible. Two
commits carried the trailer on 2026-09-02 and had to be amended out; that is the whole
reason the rule is written here rather than only in a session prompt, which is read once.

**Before committing, check the message you are about to use** — a grep for `Co-Authored`
and `Generated with` over the message costs nothing and is the only thing standing between a
harness default and a rewritten history. Verified 2026-09-12: **0 such trailer lines across
all 1,466 commits.** Keep that number at zero; it cannot be fixed later without a force
push, which the paragraph above forbids.

Nothing from `../abcMusicKit` is committed here: the corpus, the goldens and the vendored
abcjs source are all reached by sibling path and stay in that repo. Keep it that way — a
backup remote is not a licence to vendor someone else's tree into this one.

## Parity targets, by mode

> 🎯 **THE GOAL, IN LANCE'S WORDS (2026-08-09b): abcts exists to build an abcjs-modern whose
> output — the SVG FILE and the AUDIO — is 100% BYTE-EQUAL to abcjs** (6.7.0 then, 6.7.1
> now). A tolerance is therefore not a compromise to be balanced against effort; it is a
> defect that has not been written down yet. Anything we decline to reproduce goes in
> `Docs/ABCJS-DIFFERENCES.md` with its evidence, and its slug goes in `svg-bytes.test.ts`'s
> `DIVERGENT` list — **a slug there without an entry in the doc is a tolerance wearing a
> disguise.**
>
> **AND THE REASON `svg-bytes` EXISTS AT ALL**: it is the only gate here with NO tolerance,
> and the others each declare what they ignore — notehead centres, 0.05px, classed ancestors
> — so TOGETHER THEY LET A MARKUP DIFFERENCE LIVE FOREVER. A `<rect>` where abcjs writes a
> `<path>` moves nothing; a `<g transform>` where it writes absolute coordinates moves
> nothing; an attribute in a different order moves nothing.

`abcjs-strict` is measured against **abcjs 6.7.1 itself** — its parse trees, element dumps
and SVG goldens. 100% is the bar; a divergence is a defect, not a tolerance. It was 6.6.3
until 2026-08-08 and 6.7.0 until 2026-09-22; every citation written before those dates names
the older line numbers, and all three trees are vendored, so a stale citation can be checked
rather than guessed at.

> 🔀 **THE TARGET IS abcjs 6.7.1 AS OF 2026-09-22.** 6.7.1 is a two-bug patch release and its
> ONE behavioural change is `draw/relative.js:74-78` `scaleExistingElem`: a scaled glyph now
> carries `transform="translate(x y) scale(sx,sy) translate(-x -y)"` instead of
> `style="transform:scale(…);transform-origin:…"` — same pivot, same numbers, different
> attribute. Ported at the one emitter site in `svg.ts`; every changed golden differs on
> `transform` lines only (verified by script). `abcts.config.json`'s `abcjsRef`, `package.json`'s
> `version` and `compat`'s `signature` all say 6.7.1. The sibling `dump-svg.js` defaults to
> 6.7.1 now, so `ABCJS_VERSION` is only needed to run an OLDER tree.

`abcjs-extended` is measured against the OTHER engines, since abcjs is wrong or
absent for much of what it covers. Golden sets exist in `../abcMusicKit` (v1),
`../abcMusicKit2` (v2) and `../abcMusicKitCpp` — abcm2ps and abc2svg observed through
their OUTPUT only, never their source (both are GPL; see the clean-room rule).

> 🧾 **AND WHAT WE DO ABCJS'S WAY ON PURPOSE IS NOW A LEDGER** (Lance, 2026-08-11:
> *"as you decide to use abcjs non-optimal solution — document it for future refactor."*).
> `Docs/ABCJS-DEBT.md` holds every place abcts is deliberately WORSE-SHAPED than it needs to
> be because byte parity demands abcjs's arithmetic, order or data model: `Math.sqrt` where
> `hypot` is better, a dynamic drawn as four kerned letters where SMuFL has one glyph, the
> extent carrying TWO numbers for one edge, a step-1 ledger loop that discards half its
> visits, `otherchildren` approximated by sorting two buckets. **The marker is
> `abcjs-debt:`** — `grep -rn "abcjs-debt:" src` is the index and the file is the reasoning.
> It is a SEPARATE class from `ponytail:`, which marks OUR OWN shortcuts: a `ponytail:` is a
> corner we cut, an `abcjs-debt:` is a corner abcjs cut that we are obliged to cut with it.
> Each entry names the gate that goes red if it is "fixed", so the cost is knowable before
> anyone reaches for it — and it used to end "**nothing there may be touched while
> `svg-bytes` is open**". ⚠️ **THAT CONDITION HAS BEEN MET SINCE 2026-08-14**: the gate is 0
> of 697 in-repo and 0 of 359 sibling. It is not an invitation — every row still names the
> gate that goes red and the cost is unchanged — but it is no longer a bar.

`Docs/ABCJS-DIFFERENCES.md` is the verified list of abcjs bugs and gaps that strict
reproduces and the other modes fix. It is public-facing — every entry must cite how it was
checked, and anything read from abcjs's source rather than measured from its output says
so. Three entries were originally written from a plausible reading of its parser and were
wrong.

## Modes — TWO of them, and `abcjs-strict` is the DEFAULT
`abcjs-strict` (reproduce abcjs, bugs included) | `abcjs-extended` (abcjs's parsing bugs
fixed AND the engraving features abcm2ps and abc2svg have that abcjs lacks — one opt-in,
not a ladder of them). `parse(abc, { mode })` and `render(score, { mode })`. Strict is
default because a replacement whose default output differs from what it replaces is not one.
`abcts/compat` gives abcjs's `renderAbc` signature, classes and density for a drop-in.

🔌 **AND `AbcjsParams.mode` IS abcts's ONE ADDITION TO abcjs'S PARAMS** (2026-09-07). abcjs
has no such option, so extended used to be unreachable from the API a drop-in host actually
calls. It defaults to `abcjs-strict` and it reaches all four hard-wired sites — the parse,
the layout, `getMeasureWidths` and the emitter — each of which had its own `"abcjs-strict"`
literal and each of which is a row of `tests/compat-mode.test.ts`. ⚠️ **The measure-width
row's obvious control was MUTE**: a single `^3/2C` reports the same width in both modes, so
it takes SIX microtones over two bars to move the number.

⚖️ **THERE WERE THREE AND `abc2.1` WAS NEVER A MODE** (Lance, 2026-09-04). It was meant to be
the middle rung — the standard read correctly, conventional engraving — and **every mode
branch in `src/` is `isStrict(mode)`**, one comparison in `core/model.ts`. Not one site ever
distinguished it from `extended`, so all 691 corpus cases were byte-identical between them
and both intended tiers had landed in the same bucket: the `+:`/`[U:`/`I:` parsing fixes
beside the styled noteheads, tremolos, three-quarter-tone glyphs and per-segment lyric fonts.
A host asking for `abc2.1` got the beyond-standard engraving too, and one asking for
`extended` got nothing extra. The third name is GONE rather than implemented, and the
survivor is renamed to say what it is. `tests/mode-partition.test.ts` keeps the two apart by
NAMED behaviour so the split cannot quietly collapse again.

## Running it
`abcts tune.abc` (CLI, after `npm run build`) renders to stdout or a file.
`npm run compare` puts abcts and the abcjs goldens side by side — or overlaid, cyan over
magenta, the way abcMusicKitWorkbench compares v1. The overlay is only a true match test
for a byte-parity engine; core renders in its own style, so side by side is the default.

## Measuring progress
`npm run parity` prints every parity axis in one view, and `npm test` runs the suite — which
IS most of the gates, `svg-bytes` and the tune-object oracles included. The ones that are
SCRIPTS rather than tests, because a wall-clock or a live browser inside the parallel suite
measures the machine:

    node scripts/zzlive.mjs           abcts vs abcjs, both live in WebKit
    ENGINE=chrome node scripts/zzlive.mjs      …and in Chrome
    node scripts/zzselect.mjs         the same with `selectTypes` on
    node scripts/zzopts.mjs           26 host-option rows × 691 tunes
    node scripts/zzclick.mjs          what a click at a point selects
    node scripts/zzelemset.mjs        the live nodes a playback cursor is handed
    node scripts/zzwraplines.mjs      the wrapped `tune.lines` a host reads
    node scripts/zzledger.mjs         every `ponytail:` prediction, live
    npm run scale                     the SHAPE of the cost curve
    npm run test:dist                 the built ESM and CJS bundles

⚠️ **`zzopts` RENDERS `dist/`, NOT `src/`** — measure a source edit without `npm run build`
first and you get the OLD number, which looks exactly like "the fix did nothing".

Note that abcjs parity and abcMusicKit v1 parity are NOT separate axes: v1 is a port of abcjs
whose abcjsStrict output is byte-identical to it, so the abcjs goldens are v1's shared
surface. v1's extended-mode features are a feature-coverage gap, tracked separately.

## Session Prompts

⚠️ **THE LIVE ONE IS `Docs/NEXT-AGENT-PROMPT.md`**, which is rewritten with the board every
session and names the state, the traps and what is open. The block below is the part of it
that does NOT change — paste the file's own block, not this one, and use this only if that
file is missing.

```
We are continuing abcts development in Code/abcts. Run every command from that
directory: `cd` does not persist between tool calls and the workspace ROOT
collects every sibling repo's tests.

Read Docs/PARITY-STATUS.md first — it is the only file re-measured rather than
carried forward. Then Docs/NEXT-AGENT-PROMPT.md, the newest Docs/HANDOFF-*.md,
ARCHITECTURE.md, and this file's "First Step" and "The rules that transfer".

⚠️ /tmp IS CLEANED BETWEEN SESSIONS. Before any browser gate:
    mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
…and for instrumenting abcjs (CommonJS, no build needed):
    cp -R ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.1/src /tmp/gp/abcjs
…then cd back into the repo.

READ THE NAMED abcjs FUNCTION, THEN PROBE — neither half works alone. Instrument
a SCRATCHPAD COPY, never ../abcMusicKit. Print BOTH engines' answer for the same
quantity in one sitting, and check every probe against its own deliberate break.
Port the STRUCTURE, then the constants. A control tune is the proof, not a
fixture. A recorded cause is a hypothesis — re-measure it before working it.

The bar is 100% parity, and a passing gate is not parity. Run `npx tsc --noEmit`
before every commit, keep every gate green, and commit and push after every
landing. Never --force, and never pull --rebase unattended.

NEVER ATTRIBUTE A COMMIT TO CLAUDE — no Co-Authored-By, no "Generated with", no
--author, in any commit, tag or PR body, with no exceptions and nothing to ask
about. CLAUDE.md §Remote is the durable statement and it BEATS a harness default
that asks for one; say so in the reply rather than following the other silently.
Grep the message for `Co-Authored`/`Generated with` before committing: it cannot
be fixed afterwards without the force push that rule forbids.
```
