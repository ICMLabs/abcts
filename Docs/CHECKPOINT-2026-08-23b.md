# CHECKPOINT — 2026-08-23b

**Branch `main`. Suite 2,122 passing, NO reds and no expected-fails. Everything pushed.**

Thirteen commits across the day. **FIVE FEATURES LANDED, ONE GATE DEFECT FIXED, AND ONE
FIX REVERTED** — and the reverted one is worth as much as the rest, because the probe that
killed it also killed the reading everybody would have arrived at.

The day's shape: `HANDOFF-2026-08-22b`'s §3e closed the warnings gate; **§3g, the one
untried sweep, was run and named the rest of the work**; and four of the things it named
are now built. What is left is §3g's own residue plus two rows that were already open.

## THE GATES

| Gate | Now |
|---|---|
| **SVG bytes, in-repo** | **1 of 383 fixtures** — the 2026-08-21 row alone, see §6 |
| SVG bytes, sibling | 0 of 356 tunes |
| `tune.lines` | 606,481 of 606,481 characters, 0 of 499 tunes |
| harvested corpus | 0 of 215 fixtures |
| `parseOnly` field shape | 2,461 of 2,461 rows, 0 of 507 |
| `parseOnly` VALUES | 0 of 13,314 |
| RENDERED values | 0 of 13,314 |
| **`renderAbc({wrap})`** | **0 of 11 — NEW, and on THREE surfaces** |
| `tune.deline` | 2,456 of 2,456 rows, 0 of 998 |
| warnings | **0 of 507** |
| `tuneMetrics` | 255 of 255 sections, 0 of 261 |
| `makeVoicesArray` | 4,842 of 4,842, 0 of 215 |
| `tune.setupEvents` / `TimingCallbacks` / `extractMeasures` / `selectables` | 0 |
| audio / MIDI / chord grids / DOM / pixel / editor / animation / synth | 0 |

Everything reads zero except the one byte row. **AND THE FOUR EXPECTED-FAILS §6 OPENED WERE
CLOSED THE SAME DAY — see §6a**, which is where the rest of the day's lesson is.

---

## 1. §3e — THE WARNINGS GATE IS AT ZERO

`abcts-key-modifiers-tune9` is `K:C clef=alto =f`, where the `=f` stands AFTER a modifier
and is therefore past `getKeyAccidentals2` — **accidentals are a PREFIX**. abcjs's modifier
switch reaches its `default` arm TWICE, on two ADJACENT characters.

**AND THE COLUMN IS THE WHOLE OF IT.** The mapping derived it as `text.indexOf(token)`,
which finds the `=` inside `clef=` for the first and cannot separate the two at all.
`Diagnostic.column` carries abcjs's own `tokens[0].start`.

The parser site is abcjs's own consumption now: `unknownKeyParameters` ports `tokenize`,
the key head, the deprecated words, `getKeyAccidentals2` and the modifier loop. Three
transcription details that are not guessable:

- ⚠️ **`tokenize`'s `i` IS DELIBERATELY STALE ACROSS ITERATIONS**, which is what makes
  `K:treble-8` one clef.
- ⚠️ **THE KEY HEAD'S TRUNCATION LEAVES `start` WHERE IT WAS.**
- ⚠️ **A VALUE THE `transpose`/`style` ARMS REJECT IS NOT SHIFTED** — abcjs warns and
  breaks, so the switch sees it again and it becomes an unknown parameter.

---

## 2. §3g — THE SWEEP THAT NAMED THE REST OF THE DAY

abcjs's `types/index.d.ts` declares every field an `AbcElement` can carry. Enumerating THAT
list against what both corpora produce, **parsed and then rendered**:

⚠️ **RUN IT BOTH WAYS OR IT LIES.** `abselem`, `averagepitch`, `minpitch`, `maxpitch` and a
pitch's `highestVert` are absent from a `parseOnly` tune and present on a rendered one —
the ENGRAVER stamps them onto the very `tune.lines` element. Read only the parse answer and
five fields look like defects that are not.

⚠️ **AND A REFERENCE'S OWN DECLARATION CAN BE DEAD.** `noStem`, `stemConnectsToAbove` and
`beat_division` appear **zero times** in abcjs 6.7.0's source. Enumerating the reference is
the method; checking each row has a PRODUCER is the second half of it.

⚠️ **AND TWO FONTS ARE WRITTEN TO AN OBJECT NOTHING READS.** `addFormattingOptions`'s
`elType === 'bar'` arm writes onto `el`, the ACCUMULATOR, while `appendElement('bar', …,
bar)` publishes `bar`, with `el = {}` on the next line (`abc_parse_music.js:305-309`). So a
bar's `measurefont`, `repeatfont` and four positions are unreachable. Measured, not inferred.

---

## 3. THE FIVE `positionChoices` DIRECTIVES — BUILT, 10 OF 10

`%%vocal`, `%%dynamic`, `%%gchord`, `%%ornament`, `%%volume`, each taking `auto`, `above`,
`below` or `hidden`. `abcts-positioning.abc`'s eight tunes were byte-exact on arrival.

⚠️ **AND THEY HAD BEEN SWEPT ONCE AND CALLED "SAME".** The 2026-08-22 directive
enumeration rendered a control with and without each of abcjs's 41 unmentioned directives;
these five moved nothing, because that control had **no lyric, no chord symbol, no dynamic
and no ornament** — the only four things they position. **A "SAME" IS ONLY AS GOOD AS THE
SHAPE THAT ASKED**, one enumeration later and on a list that had already been enumerated.

Four rules, and the first is where nine of the nine moving rungs move:

1. **`containsLyrics` TESTS `=== 'below'`, NOT `!== 'above'`**
   (`abstract-engraver.js:114-119`). `%%ornament above` on a singing tune writes
   `{ornamentPosition: 'above'}` and no `vocalPosition`, so the object EXISTS, the field is
   `undefined`, and `hasVocals` goes FALSE — dropping the staff 22.71px on a tune with no
   ornament in it.
2. **ONCE `positioning` EXISTS, `hasVocals` IS NEVER CONSULTED AGAIN.** The fallback is
   WHOLE-OBJECT, so missing keys stay `undefined` and each reader tests its own field
   literally: `if (position === 'below') … else …`. **`undefined` DRAWS ABOVE.**
3. **THE LYRIC LANE IS THE ABOVE LADDER'S FIRST RUNG**, and this engine had never had a
   producer for it. An above lyric takes NONE of the below branch's three extra terms.
4. **`hidden` DROPS A MARK RATHER THAN MOVING IT**, and `%%gchord below` is a ROLE change
   into the lane a `"_text"` annotation already opens.

⚠️ **AND AN ABOVE LYRIC IS INK ONLY ONCE PLACED.** Spending its lane in `verticalExtent`
was tried twice and double-counted both times, because the chord sits OUTSIDE the lyric
rung and a placed chord's ink already carries it.

⚠️ **AND THE LAST TOKEN OF THE TEN WAS A ULP WITH ITS OWN RULE: A GLYPH'S `getYCorr` JOINS
ITS PITCH, NOT ITS y.** abcjs draws at `calcY(offset + ycorr)` — one sum, one multiply —
where the emitter had only the y and spent the correction on it as a LENGTH.
`PlacedGlyph.drawPitch` carries it, set on the DYNAMIC alone.

⚠️ **AND THE LADDER RULED ITSELF OUT TWO STEPS BEFORE THE ANSWER.** A `ZZTOPA` probe in
abcjs's `incTop` and its twin in our `aboveLadder` printed **bit-identical** walks, which
said the arithmetic was exact and left only the DRAW.

⚠️ **AND THE ROOT `height` IS NOT WHAT MOVES** — 216.402 on all ten rungs and on the bare
tune, in BOTH engines. The first cut of the layout tests asserted a height delta, having
taken the 22.71px off the TOP LINE's diff. **A test can carry an inference as firmly as a
comment can, and a green one reads as a checked fact.**

---

## 4. `%%printtempo`, `V:… scale=`/`cue=`, AND A GATE DEFECT

**`%%printtempo`** — §2e's `AbcElem.suppress`. ⚠️ **THE ENGRAVER READS IT IN TWO PLACES
THAT BEHAVE DIFFERENTLY**: the HEADER tempo is skipped outright and builds no element,
while a MID-TUNE `[Q:]` still builds its `AbsoluteElement` and merely gets no
`TempoElement` child — an EMPTY element that still takes its turn in the stream. Five
controls, all byte-identical.

**`V:… scale=` / `cue=`** — §3c, which §3g named independently as `AbcElem.size`. Twelve
tunes byte-identical. Six readers, and ⚠️ **THEY DO NOT ALL READ IT THE SAME WAY: FOUR
DIFFERENT QUANTISATIONS**, each rounding a different product —

    unbeamed stem   Math.round(70 * scale) / 10          a tenth of a pitch
    beam            this.stemHeight * scale              no rounding at all
    grace beam      Math.round(9.5 * scale * 0.7)        the voice scale INSIDE
    flag            pitch ± 7 * scale                    unrounded, then clamped

⚠️ **AND THREE THINGS DO NOT SCALE AT ALL, WHICH IS THE HARDER HALF.** Both ledgers take
LITERALS (`0.6` and `1`), an unbeamed grace's stem reads the local `var gracescale = 3/5`
with no `voiceScale` in it, and THE DOT does not scale under abcjs's own `// TODO scale the
dot as well` though its x moves with the head. Multiplying any of them through is a defect:
the grace ledger came out 12.43px against abcjs's 8.29.

⚠️ **AND `notehead.w` IS A DIFFERENT QUANTITY FROM THE TABLE WIDTH BESIDE IT** — the STEM's
`dx`, the FLAG's `xdelta`, the DOT's offset, the beam's `furthestHead.w` and the element's
rod all read the SCALED width, while the ledgers and the accidental's declared `w` keep the
unscaled one. abcjs scales the very offset it computes one line above the width it does not.

⚠️ **AND THE FIXTURE FOUND WHAT THE LADDER COULD NOT.** Ten rungs went byte-identical and
`abcts-voice-scale` still opened a row: tune 6 has BOTH a beamed grace group and a single
UNBEAMED one, and only the second has a flag to be wrong. **A ladder covers the axes you
thought of.**

**AND THE CORPUS GATE PAIRED `-tune10` WITH `-tune2`.** `goldensFor` sorted the per-tune
goldens LEXICOGRAPHICALLY. ⚠️ **IT READ ZERO FOR MONTHS BECAUSE NO FIXTURE WITH MORE THAN
TEN TUNES RENDERED THEM DIFFERENTLY** — `abcts-midi.abc` has fifty-six and not one `%%MIDI`
sub-command moves the drawing, so mis-pairing them is invisible by construction. ⚠️ **AND
THE RULE LIVES IN TWO FILES**: fixing the gate's copy alone left the ranked table reporting
a row while the ratchet it belongs to read 215 of 215 within — **a report contradicting its
own gate**, which is how the second copy was found. **A GATE'S REACH IS A PROPERTY OF ITS
ENUMERATION, AND SO IS ITS PAIRING.**

---

## 5. `wrap` — BUILT, AND THE TRAP IT CARRIES

§3d. Eleven cases byte-identical on THREE surfaces: `explanation`, `lineBreaks`, and the
drawn SVG.

⚠️ **AND THE MEASUREMENT HALF WAS ALREADY BUILT.** `getMeasureWidths` lays the tune out at
width **ZERO** whatever `staffwidth` says (`engraver-controller.js:139`) — it is the very
call `tuneMetrics` makes, ported and gated at 0 of 261 since 2026-08-19. Checked before a
line of the search was written: our `widths` are bit-for-bit abcjs's, long tails included.
**What §3d called a feature was two thirds done and nobody had asked.**

⚠️ **A HEADLESS RENDER NEVER WRAPS** — `if (div === "*") removeDiv = true` then
`if (!removeDiv && params.wrap && params.staffwidth)`. Not an error, an empty answer: the
harvester read eleven blank cases as a RESULT before it rendered into a target.

⚠️ **AND THE TWO PUBLISHED FIELDS CAN BE EXACT WHILE THE MUSIC IS NOT RE-LINED AT ALL.**
That is what this engine did at first — both fields byte-perfect on all eleven, and ONE
system drawn where abcjs draws four. **A surface that reports the right answer and does not
act on it passes every gate built to read the report.** The SVG is the gate's third surface
for exactly that reason.

Three rules paid for the drawing, each a place where the wrap differs from
`%%barsperstaff` or destroys something:

- ⚠️ **A WRAPPED LINE DOES NOT REPRINT THE METER, WHERE `%%barsperstaff`'s DOES.**
- ⚠️ **THE VOICE NAME IS KEYED ON THE DELINED LINE.** `fixTitles` resolves each title to a
  STRING inside `cleanUp`, which runs BEFORE `wrapLines`, and `wrapLines` opens with
  `deline({lineBreaks: false})` — so a tune whose seven source lines collapse into ONE
  section prints the FULL name on all six wrapped systems. Measured through abcjs, which
  reads `Violin I` six times wrapped and `Violin I, Vl.1, Vl.1, …` unwrapped.
  `Measure.wrapSourceLine` is abcjs's `ogLine`.
- ⚠️ **AND THE BARLINE THAT ENDS A WRAPPED LINE LOSES ITS NUMBER**, which the next line
  takes AT ITS HEAD. The two are different mechanisms and only one costs height: a number
  on a barline is a POINT in the staff's ink, one on the CLEF carries `okToPushTop = false`.
  Leaving it put `piano-300` 10.5px low on EVERY system — **a uniform shift from the first
  staff line, which is the shape of a lane and not of a placement.**

---

## 6. THE ONE FIX THAT WAS REVERTED — AND IT IS THE MOST USEFUL ROW HERE

§2e's `transpose` row is **not about `transpose`**. ⚠️ **MEASURE WHAT THE ROW POINTS AT,
NOT WHAT IT WAS NAMED**: a bare `[V:1]` does the same thing, and `V:… transpose=` in a
header and across two voices are both byte-exact.

    shape                                          abcjs  ours
    CDEF|[V:1]GABc|            (no V: anywhere)        2     1
    V:1 header, then CDEF|[V:1]GABc|                   2     1
    [V:1]CDEF|[V:1]GABc|                               2     1
    CDEF|\  +  [V:1]GABc|                              2     1
    [V:1]CDEF|\  +  [V:1]GABc|                         1     1   ✓
    [V:1]CDEF|  +  [V:1]GABc|                          2     2   ✓

The rule is neither "a repeat switches voice" nor "a continuation suppresses the break" —
the two agreeing rows straddle both. What separates row 4 from row 5 is whether the LOGICAL
LINE ITSELF OPENED with a `[V:1]`.

**THE OBVIOUS FIX IS WRONG AND IT LOOKS RIGHT.** `selectVoice` early-returns on a repeated
voice id under a note reading "probed, abcjs's `setCurrentVoice` fires twice … and the
repeats change nothing". ⚠️ **THAT PROBE'S CONTROL COULD NOT MOVE**: in the tune it was
taken on, every `[V:…]` OPENS a source line, so the guard is never exercised. Removing it
took **all six shapes to abcjs's answer** — and `abcjs-visual-parsing-03-v-1-f` and
`-09-score-t-b`, two of abcjs's OWN test tunes, went byte-exact to differing.

⚠️ **AND `setCurrentVoice`'s GUARD IS NOT THE MECHANISM — PROBED, NOT ASSUMED.** A
`console.error` on both arms says abcjs takes **EARLY RETURN in row 4 and row 5 alike** —
the two rows that disagree with each other. So the system is opened somewhere else, and the
guard our engine already reproduces is not what to touch.

Reverted, and `tests/inline-voice-line.test.ts` holds the measurement: two passing rows for
what agrees, **four `.fails` carrying abcjs's numbers**, red the moment the rule is found.
**THE NEXT MOVE IS NAMED** — instrument `abc_parse_music.js`'s inline-field CALLER, not
`parseVoice`, because `case "[V:"`'s own `startNewLine()` is COMMENTED OUT in abcjs's
source (`abc_parse_header.js:400-405`), so the break is raised by whoever reads its fourth
return value.

---

## 6a. AND THEN IT CLOSED — TWO MECHANISMS, NOT ONE

All six shapes byte-identical; both byte gates unmoved at 1 of 383 and 0 of 356. The four
`.fails` did exactly what they were for: they carried abcjs's numbers until the rule was
found and then went red.

**THE REASON NO SINGLE RULE FIT THE TABLE IS THAT THERE ARE TWO:**

1. **`delayStartNewLine && !this.lineContinuation`** (`abc_parse_music.js:151-159`). ANY
   inline `[V:` sets the flag — a repeat of the current voice INCLUDED — and it fires at
   the next non-header token unless the line CONTINUES the one above. abcjs's own comment
   on it reads *"fixes bug on this: c[V:2]d"*. Rows 1-3. **This is the half we lacked**, and
   it is now `VoiceBuilder.inlineVoiceField`.
2. **`tuneBuilder.setCurrentVoice`'s LINE SCAN**, which runs only on a REAL switch — a
   repeat early-returns before ever reaching it. Row 4. `VoiceBuilder.switchedTo`, which was
   already correct, which is why `selectVoice`'s guard had to stay.

Plus one more: ⚠️ **THE FIRST `V:` OF A TUNE IS ALWAYS A REAL SWITCH, EVEN NAMING THE
DEFAULT.** abcjs's OUTER test is `if (multilineVars.currentVoice)` — whether a voice has
EVER been made current — and nothing sets it but a `V:`/`[V:`. So on `CDEF|\` +
`[V:1]GABc|` the implicit voice the first line wrote into is not `currentVoice`, the `[V:1]`
switches for real, and the scan points past the full line. Ours seeded `currentVoiceId` with
the default id, so it read as a repeat.

⚠️ **AND INSTRUMENTING BOTH SITES AT ONCE IS WHAT SEPARATED THEM.** Rows 4 and 5 trace
IDENTICALLY through mechanism 1 — `hasBeginMusic=true delay=true lineContinuation=true`, no
break — and differ entirely in mechanism 2, where row 4 prints `had=NONE -> SWITCHING` and
row 5 `-> EARLY RETURN`. **PROBING EITHER ONE ALONE SAYS THE OTHER CANNOT BE THE CAUSE**,
which is precisely the wrong conclusion §6 recorded and this section had to undo. The rule
"instrument to answer a question" has a corollary: **when a probe exonerates a site, it has
only exonerated it FOR THE ROWS YOU RAN**, and a second site can carry the difference.

⚠️ **AND THE FIRST METRIC WAS WRONG.** `abcjs-top-line` counts STAVES, not systems; it
happened to equal the line count on these tunes, so the table it produced was right by
luck. Counting `tune.lines` with a staff is what confirmed it before any of it was believed.
**A metric that agrees with the truth on your controls is not thereby the truth.**

---

## 7. WHAT IS LEFT

- **§1** — `abcts-directives-tune4`, the `%%stafftopmargin` height (`201.76700000000002`
  against `201.767`). The deferred y-versus-pitch refactor from 2026-08-11, not a new
  defect. The ONE byte row.
- **§2** — the `abselem` decision, still the owner's: 10,570 rows that require RETAINING
  the `Layout`, which measurably killed this suite's workers once.
- **§3b** — `K:C clef=none`'s one stem, on no gate. THREE failed attempts say the stem's
  own expression is not the obstacle; instrument `layoutOneItem`'s `er`/`extraWidth` arm.
- ~~**§6**~~ — the inline `[V:` line rule. **CLOSED, see §6a.**
- **§3g's residue** — pitch-level `style` (a per-PITCH notehead override the engraver reads
  at `abstract-engraver.js:679` that no corpus tune produces), and grace `startBeam`,
  `startTie`, `endTie`, `style`.

---

## 8. THE RULES THIS SESSION PAID FOR

⚠️ **A "SAME" IS ONLY AS GOOD AS THE SHAPE THAT ASKED — AND A SWEPT LIST CAN BE SWEPT
AGAIN.** Five directives were enumerated on 2026-08-22, measured, and recorded as moving
nothing. They move nine ways.

⚠️ **AND A PROBE'S CONTROL CAN BE UNABLE TO MOVE TOO.** The `selectVoice` guard was
"probed" on a tune where it could never fire. Both of this session's reversals trace to a
control that could not express the thing it was asked about.

⚠️ **A DECLARED FIELD LIST ANSWERS DIFFERENTLY AT TWO ENTRY POINTS**, and can be DEAD:
sweep parsed AND rendered, and check each row has a producer.

⚠️ **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, AND SO IS ITS PAIRING** — and when a
report contradicts its own ratchet, the rule lives in two files.

⚠️ **A SURFACE THAT REPORTS THE RIGHT ANSWER AND DOES NOT ACT ON IT PASSES EVERY GATE BUILT
TO READ THE REPORT.** `wrap`'s two fields were byte-perfect while the music was not re-lined
at all.

⚠️ **A FIXTURE FINDS WHAT A LADDER CANNOT.** A ladder covers the axes you thought of;
`abcts-voice-scale` tune 6 carried two shapes at once and opened a row ten byte-identical
rungs had closed.

⚠️ **AND A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A WRITTEN-DOWN MEASUREMENT**, for the
sixth time on this branch — and this time the measurement was cashed the same day, because
it recorded the four numbers AND the probe that disproved the obvious reading.

⚠️ **AND WHEN A PROBE EXONERATES A SITE, IT HAS EXONERATED IT FOR THE ROWS YOU RAN.** §6
concluded `setCurrentVoice`'s guard "is not the mechanism" from a trace that was correct;
the guard IS one of two mechanisms, and the trace could not say so because the other one
accounted for the rows it was run on. Instrument every candidate site in the same sitting.

⚠️ **AND A METRIC THAT AGREES WITH THE TRUTH ON YOUR CONTROLS IS NOT THEREBY THE TRUTH** —
`abcjs-top-line` counts staves and was read as systems for a whole session.
