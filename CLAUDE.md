# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## First Step — Always
**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE** — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached;
checkpoint and hand off as you go so no context is lost.

> ⚖️ **THE RULING THAT GOVERNS THE GLYPH/METRIC SPLIT** (Lance, 2026-08-05): the Bravura
> authorisation **never covered `abcjs-strict`**. Strict reproduces abcjs byte for byte, so
> it has NO latitude — every figure it draws with must be abcjs's. `abc2.1` and `extended`
> are where the flexibility lives. **Any Bravura input reachable in strict is a defect, not
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
> `CHECKPOINT-2026-08-05b.md`. **THE TRIAGE IS PARTLY DONE**: `ENGRAVE` is now 101
> constants, fourteen having been read by NOTHING, and the 44 live bare literals are sorted
> into a table in `CHECKPOINT-2026-08-05c.md`. Work down it; do not re-derive it. Each row
> says whether its evidence is `measured` or `source`, and **a `source` row must be
> measured before it is ported.**

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

> 🔎 **AND THE GATE WAS READING 29 OF THE 41 FIXTURES** (2026-08-07). `pixel-parity`
> enumerated `<name>.svg`, which only a SINGLE-TUNE fixture has — a multi-tune fixture's
> goldens are `<name>-tune0.svg`, `-tune1.svg`, … — so twelve fixtures and **89 tunes** went
> unmeasured with abcjs's own per-tune SVGs sitting in the same directory since April. All 89
> matched on notehead COUNT on the first run; twelve differed on POSITION, and that list is
> what four findings closed. **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS
> COMPARISON** — every axis of that one was sound, and no number it printed could have
> revealed the hole, because the fixtures it skipped had no rows to be missing from. Before
> concluding a gate is exhausted, ask what evidence EXISTS, not what the evidence says.
> It writes `/tmp/abcts-pixel-ranked.txt` now, beside the harvested table.

> 🏁 **THE HARVESTED RANKED TABLE IS EMPTY — 0 of 174 rows** (2026-08-07), and **36 of the 41
> are at EXACT ZERO**. All 174 fixtures of the harvested corpus agree with abcjs on note content
> AND on all four geometric axes to within 0.05px, and `CONTENT_GAPS` is empty for the
> first time. **So neither the table nor the content gate can name anything any more, and
> every remaining gate is blind to what is left** —
> the pixel gate sees only what abcjs classes a NOTEHEAD, the baselines say CHANGED and
> never WRONG, the structural gate misses everything added via `addOther`. Findings now
> come from READING abcjs, and **a CONTROL TUNE is the proof**: finding 111 was written,
> measured 6 pitch wrong on a four-bar control, and fixed before it ever reached the
> corpus — without the control it would have landed under a green ratchet, because the
> fixture it was aimed at moved the right way for the wrong reason.

> 🔎 **AND THE TAIL OF THE TABLE WAS NEVER "NOT WORK"** (2026-08-07b). Nine of its
> eighteen rows sat behind an asserted `ox = 0.18` and a paragraph explaining that no
> placement rule could remove it: *"abcjs's head inks 16.83px wide, Bravura's 15.03, and
> the two are not left-aligned either."* Every clause true. Each of those tunes is `G8`
> under `L:1/4` — TWO whole notes — and abcjs's `chartable.note[-durlog]` lands on
> `noteheads.dbl`, a BREVE, where we drew a semibreve. **The 16.83 cited as the evidence is
> `noteheads.dbl`'s own published width, to the hundredth.** A bounding-box centre cannot
> tell a wrong glyph from a differently shaped one. A ranked table does need a way to say
> "measured, and not a defect" or its tail fills with work nobody should do — but the note
> has to RULE OUT THE WRONG GLYPH FIRST, because once written it is the reason the row
> stops being read. The pixel table went from eleven rows to two on that one finding.

> ⚖️ **THE ARC DECISION** (Lance, 2026-08-08): *"Defer Gonzato and focus on the remaining
> geometric tail and audio."* **GONZATO IS DEFERRED** — it has sat in the standing order's
> tail since 2026-08-04 with no fixture, no gate and no owner, it is a COVERAGE question
> rather than a geometry one, and it is the only part of the order whose INPUTS are not
> already in this repo. **AUDIO IS THE ARC**, and its corpus and oracle are already here:
> 61 of the 174 harvested fixtures ARE abcjs's own synth tests, and `flattener.test.js` is
> 8,203 lines of expected event lists written as JSON literals. The implementation is
> genuinely absent — no `src/midi/`, no `src/synth/`, `%%MIDI` in the parser ZERO times —
> so **the first commit of that arc is the HARVESTER, not the flattener.** The parity
> surface is EVENT GENERATION (`abc_midi_flattener.js`, `abc_midi_sequencer.js`,
> `chord-track.js`); soundfonts and WebAudio are host playback and out of scope, the same
> split the renderer makes between geometry and glyph outlines. See
> `Docs/CHECKPOINT-2026-08-08.md`.

> 🔎 **AND THE GEOMETRIC TAIL CLOSED ON FOUR FINDINGS, none of which any gate could
> state** (2026-08-08b). A rest shorter than a 16th drew NOTHING and reserved NOTHING —
> `restGlyph` stopped at four where abcjs's `chartable.rest` runs to seven — and it was
> reached only through a SECOND-ORDER effect, the missing 11.373px rod letting one line
> solve 0.53px narrow. The above lanes are ONE walk in abcjs's order and we spent them in
> four places: **A LANE ORDER IS INVISIBLE TO A SUM**, so the staff's total was right
> either way and five of eleven controls were out by up to 27.13px. And `printSymbol`
> never draws at `calcY(offset)` — it draws at `calcY(offset + getYCorr(symbol))`, a
> 30-row per-glyph table that **never enters a RESERVE**, so every extent agreed while
> twenty glyphs sat up to three pitch off. **THE SIGN OF AN ERROR IS EVIDENCE**: the
> dynamics were named by being wrong in the SAME direction above and below the staff, the
> `getYCorr` table by two fermatas being wrong by one pitch in OPPOSITE directions. Two
> new gates, both ladders of controls, one variable per rung. See
> `Docs/CHECKPOINT-2026-08-08b.md`.

> 🎵 **AND THE AUDIO ARC IS RUNNING** (2026-08-08c). The oracle landed before a line of the
> flattener: 54 cases and 1,930 expected events harvested out of `flattener.test.js` by
> EVALUATING it with `describe`/`it`/`doFlattenTest` replaced. Then the ranked table, which
> opened at 54 of 54 and names the FIRST differing event per case. Then
> `src/audio/flatten.ts` and `src/audio/chord-track.ts`, which run over the PARSE TREE and
> not the laid-out one, so audio does not depend on the renderer. **37 of 54, PASSING 17.**
> A `"C"` above the staff is a whole VOICE and sounds nowhere near where it is written; a
> DYNAMIC is a stress table rather than a volume, and abcjs's own table is unreachable past
> `f`; a hairpin's search is scoped to the SOURCE LINE and its close lands on the BARLINE; a
> SPACER sounds nothing, takes no time, and still counts; an inline `[Q:]` is the page's
> tempo and not the clock's. **`%%MIDI` appears in the parser ZERO times and gates 13 of the
> remaining 37** — it is the next thing to build. See `Docs/CHECKPOINT-2026-08-08c.md`.

> ✅ **AND THE AUDIO ARC IS CLOSED — 0 of 54** (2026-08-08e), from 23 of 54 differing.
> Thirteen findings, every one a read of a named abcjs function. THE DRUM TRACK is
> deliberately brittle — three ways to fail closed, and its two guards are not the same
> guard: `lastEventTime < measureLen` is how a PICKUP delays the first hit, `!drum.on` is
> how a `drumoff` stops the hits without closing the track. AN ORNAMENT REPLACES THE NOTE
> rather than decorating it, so a trilled staccato gets no gap at all. A TRIPLET'S LAST
> NOTE IS THE REMAINDER, because abcjs rounds to a millionth and makes the GROUP exact
> instead of the notes. A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE, keyed by
> WRITTEN POSITION — which is also why a `:|` back to the head restores the opening tempo.
> A CHORD CAN CARRY ONE DYNAMIC PER NOTE and the list is zipped against the SORTED pitches,
> so decoration 0 belongs to the LOWEST note whatever it was written beside. And the last
> row of the table was one character: `"^break"` is `{position, name}` in abcjs and we were
> matching the source spelling.
>
> **AND THE ANSWER WAS IN THIS REPO TWICE.** `&` overlay padding — the thing that puts an
> overlay in TIME — was already implemented by `padOverlays`, written months earlier for
> the BEAM gate, and I wrote it a second time before measuring that it existed. Three more
> findings were inputs the parser was silently DROPPING with a `ponytail:` marker sitting on
> the line: grace-note lengths, decorations inside a chord, `V:… transpose=`. Read the
> named abcjs function — and then grep this repo for the rule before porting it.
> **AND THE LAST GEOMETRIC TARGET WAS AN ACCENT, IN EVERY TUNE THAT HAS ONE.**
> `extra-class` sat at one pitch out with a note reading "a chord carrying BOTH an accent
> and a trill… the residual is the two-decoration STACK on a chord" — every clause an
> inference from the tune's TEXT, because it was a new 6.7.0 `!class=` fixture and the
> unusual thing about it was assumed to be the cause. A LADDER denied it in one run:
> `!>!d`, `!>!f`, `!>!a` and `!>![dfa]` are all out by exactly one pitch and `.` and
> `!tenuto!` on the same chord are exact. abcjs canonicalises `>`, `<` and `emphasis` to
> `accent` in the PARSER; we keep the source spelling, so `!>!` already DREW the sforzato
> and then failed `closeDecoration`'s `name === 'accent'` test. Keyed on the GLYPH now.
> Same lesson as the `G8` breve: **A NOTE THAT NAMES A CAUSE IS THE REASON THE ROW STOPS
> BEING READ** — rule the cause OUT on a control before writing it down.
> See `Docs/CHECKPOINT-2026-08-08e.md`.

> 📼 **THE MIDI FILE IS BYTE-EXACT, AND IT FOUND THREE FLATTENER BUGS** (2026-08-09).
> `src/audio/midi-file.ts` + `tests/corpus-midi/`, ported from `abc_midi_create.js` and
> `abc_midi_renderer.js`. It is the ONLY comparison here with no tolerance and no excluded
> axis — every other one declares what it ignores — and it **re-derives the flattener's
> answer a different way**, which is the whole argument for it: a surface that agrees by
> construction is worth less than one that could disagree, and this one disagreed three
> times with the event table green. **THE TRACK NAME** (`cmd: 'text'` was a type nothing
> ever produced, because no audio case declares a named voice); **THE CHORD SORT BELONGS TO
> THE ENGRAVER, NOT THE PARSER** — `[cD]` sounds D-then-c and `[gF]` sounds 42-then-36,
> because noteheads must STACK in pitch order to be drawn, so `flattener.test.js` (renders
> first) and `getMidiFile` on a string (never engraves) are BOTH right about their own
> entry point; and **A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED**, worth one byte.
> Four abcjs quirks reproduced on purpose, listed in the file.

> 🎸 **THE CHORD GRID IS IN — 0 of 23, AND EVERY FINDING WAS IN THE ADAPTER** (2026-08-09b).
> `src/chord-grid.ts`, ported from `src/parse/chord-grid.js`, whose own header numbers its
> sixteen rules. abcjs walks a FLAT element stream where we hold measures and its rules are
> full of order-dependent state, so our measures are converted into its stream and the
> algorithm is transcribed rather than re-derived. The table opened at 12 of 23:
> **`|1` IS ONE ELEMENT IN ABCJS AND TWO IN OURS** (seven of the twelve rows were that one
> flag); **`tripletMultiplier` IS STAMPED ON THE FIRST NOTE OF THE GROUP AND NOTHING ELSE**,
> so abcjs's beat count is wrong for every tuplet and wrong BY DESIGN — the `under` fixture's
> own header says "triplets mess up beat counting", and folding the ratio into every member
> makes the bar 3.9999999999999996 so it never closes; **A BARLINE THAT OPENS A MEASURE TAKES
> THE PENDING DECORATION AND CHORD**, which ours DROPPED outright and leaked; and
> **`getMeterFraction()` defaults to 4/4 and reads the first meter of any LINE**, not the
> header's. **TWO OF THE 23 CASES ASSERT NO GRID AT ALL** — a feature's refusals are part of
> its contract and they are what a happy-path implementation gets wrong.
>
> 🥁 **AND THE AUDIO TABLE IS EMPTY — 0 of 72**, its last two rows (the host drum options)
> closed and eleven CONTROLS added. `drumIntro` REWRITES THE MUSIC rather than moving a
> clock: whole measures of rests spliced onto the front of every voice, so every downstream
> clock shifts by construction. `options.test.js` exercises it twice and both times
> identically, so five of its branches had no case behind them until
> `scripts/gen-audio-controls.mjs` rendered them — including `measureLength` being the tune's
> LAST `M:`, not its first.

> 🏷️ **THE SVG DOM CONTRACT HAD NO INSTRUMENT AND COULD NOT HAVE HAD ONE** (2026-08-09b).
> `pixel-parity` and the harvested table resolve both SVGs to ABSOLUTE PIXELS and compare
> positions — they throw the markup away ON PURPOSE, because that is how they see past
> `<rect>`-versus-`<path>` and Bravura-versus-abcjs outlines. The structural gate compares
> abcjs's LAID-OUT ELEMENTS, its internal tree rather than its output. So the thing a
> drop-in replacement is actually judged on — does `querySelector('[data-name="note"]')`
> find a note, and is it inside the group a host expects — had never been measured, and
> `abcts/compat` promises it in as many words. `tests/dom-contract.test.ts` compares
> `class`, `data-name` and **DEPTH** over 25 tunes and opens at 25 of 25, **which is the
> point**. Four pieces are closed and it stands at 86 of 694 rows: the
> `abcjs-staff-wrapper`/`abcjs-staff` nesting, **`fill` belonging on the `<svg>` itself**
> (our extra `<g fill>` put every element one depth deeper, which no positional gate could
> express because a group with no transform moves nothing), the class scheme ported from
> `write/helpers/classes.js`, and `add_classes` becoming a real option — it was declared in
> `AbcjsParams` and read NOWHERE, so the scheme was emitted unconditionally and broke the
> `<defs>`/`<use>` saving test, which is how it was caught. **AND THE SOURCE LIED ONCE**:
> `draw/voice.js:31` reads as though a `staff-extra` cannot open a measure, and abcjs's own
> goldens give the clef `abcjs-m0 abcjs-mm0`. Measure the output.

> 🔁 **A REPEAT'S LAST ENDING WAS PLAYED TWICE, AND ONLY A THIRD SURFACE COULD SEE IT**
> (2026-08-09b). `currentTrackMilliseconds` is what the FLATTENER writes back onto the
> source (`abc_midi_flattener.js:526-546`) — the event table says what sounds, `setTiming`
> says where the clock is, and this says which WRITTEN element is lit. `resolveRepeats`
> pushed a synthetic `startRepeat` for any final section that was not one, including the
> `startEnding` of a LAST ending, so `CDE|:FG[Ab]|1 Bcd:|2 efg|]` played `efg` twice and
> ended at 18000 where abcjs ends at 15000. **The audio table was 0 of 72 and the MIDI file
> byte-exact throughout** — neither has a case with the second ending last, and a doubled
> pass reads as "more notes" on a table nobody counts by hand. It reads as a doubled ENTRY
> on a per-element one. A SPACER is never stamped at all, which the same ladder proved.
> One row is left open and NAMED rather than hidden: `|1,3 … :|2,4 …`, where abcjs's own
> `duplicateSpan` iterates to an `undefined` end and emits nothing, giving a pass with no
> ending. Closing it is a decision, not a bug fix.

> ⏱️ **`setTiming` IS IN — 0 of 38 — AND THE HARVESTED CORPUS COULD NOT DEFEND ITS OWN CODE**
> (2026-08-09b). `src/audio/timing.ts`, the TIME half of the audio↔geometry join, ported
> from `abc_tune.js`'s `setupEvents`. It re-derives what the flattener already answers a
> DIFFERENT way — the flattener resolves repeats by REWRITING the voice, `setupEvents` by
> REPLAYING elements in place — which is the same argument the MIDI file was built on.
> abcjs's twelve warp cases are two 4/4 tunes with no pickup, one voice and no mid-tune
> tempo, so **deleting `startingDelay -= getPickupLength()` outright left the table at 0 of
> 13**: a line no case can reach is a line no gate can defend. Twenty-five controls closed
> it and named a defect on their first run — `|1` is ONE element in abcjs and two in our
> model, and `startEnding === '1'` is what stops the replay before the first ending.
> **AND WHAT IT DOES NOT PROVE IS WRITTEN DOWN**: `left`, `endX`, `top` and `height` are on
> every row abcjs publishes and its own suite asserts none of them, so this is the CLOCK and
> not the join.

> 📐 **EVERY DECORATION IN THE REPO WAS UP TO 10.83px LEFT, AND A CANARY FOUND IT**
> (2026-08-09b). Not a search — the control written to prove the opening-barline transfer
> needed a boring rung showing the same coda on a NOTE, and the boring rung disagreed with
> abcjs by nine pixels. **NO GATE COULD SEE THE X OF A DECORATION**: `pixel-parity` and the
> harvested table compare what abcjs CLASSES and a decoration carries no class, while
> `glyph-ycorr` and `above-lane-order` are ladders that measure Y because each was built to
> name a vertical defect. Same shape as the line weights and the tempo notehead.
> **THE HALF-WIDTH SHIFT IS CONDITIONAL** — `if (getSymbolAlign(symbol) !== "center") deltaX
> -= getSymbolWidth(symbol) / 2` — and the align is a RULE, not a table: every `scripts.*`
> glyph is centred EXCEPT `scripts.roll`. **THE WIDTH IS THE HEAD'S DECLARED ONE**, abcjs's
> and not Bravura's. **A BARLINE HANDS IT 3 OR 1**, never its drawn width. And a fourth on a
> different code path: **A DYNAMIC IS NOT A DECORATION** — `drawDynamics` calls
> `printSymbol(renderer, params.anchor.x, …)` with no width arithmetic at all, proven by a
> whole note and a quarter drawing their `p` at the same absolute x.
> `tests/decoration-x.test.ts` is the instrument, and **reverting the rule fails 15 of its 20
> rungs** — checked, not assumed.

> 🔍 **AND THE HARVESTER NAMED A FILE WHERE IT SHOULD HAVE NAMED A SHAPE** (2026-08-09).
> An audit of abcjs's 30 test files, classified by ASSERTION TARGET rather than by file
> because most files mix both kinds. `synth/options.test.js` declares its own
> `doFlattenTest(abc, expected, options)` — the same helper, the same answer — and was
> missed for the whole audio arc because the harvest targeted `flattener.test.js` BY NAME.
> It is the only place in abcjs's suite exercising HOST-supplied options rather than the
> tune's own `%%MIDI`, so it is worth more per case than anything in the 8,203-line file
> beside it. And one earlier reading is corrected: `visual/svg.test.js` and
> `svg-per-line.test.js` assert the SVG DOM CONTRACT, not the internal tree — eight portable
> cases nearly written off. Four pasteable briefs for the sibling engines are in
> `Docs/BRIEF-abcjs-tests-*.md`; **provenance was checked rather than assumed**, and v1's
> `MIDIWriter.swift` turning out to be clean-room-from-spec rather than an abcjs port made
> the MIDI byte quirks a POLICY question there instead of a bug list.

> ⏳ **THE OPTIMISATION PASS WAS DEFERRED, the reasoning is recorded so it is not re-argued,
> AND THE BOUNDARY IT WAITED FOR HAS NOW BEEN REACHED** (2026-08-08). Measured: `layout.ts` is 9,992 lines and **49% COMMENT**, and
> those comments ARE the finding ledger — 150 findings with citations, several recording
> things got wrong twice before the note existed. 220 tunes render in **151ms, 0.7ms
> each**, and the dominant cost — nine layout passes per line — is MANDATED by finding 104,
> so **there is no performance work to do and a perf pass is pure risk**. The real cruft is
> structural (one 10k-line file) and the moment is the phase boundary AFTER audio reaches
> 54/54, because the geometry gates are already maximal and waiting does not improve them.
> The invariant to hold such a pass to: **NO BASELINE MAY MOVE** — if one does, that is a
> behaviour change, revert it rather than re-record it. `tests/bench.test.ts` holds the
> before-number. Full reasoning and the ordered plan are in `Docs/CHECKPOINT-2026-08-08d.md`.

> 🖥️ **RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist
> between tool calls, and the workspace ROOT has its own vitest reach: run from there and it
> collects every test in every sibling repo — abcjs's own included — and prints a wall of
> failures that are nothing to do with this one. It bit twice on 2026-08-08. And run
> `npx tsc --noEmit` BEFORE `git commit`, not alongside it: a duplicate object key shipped
> that day because vitest passed and the typecheck came back after the push.

> 🖼️ **THE SVG'S FRAME IS ABCJS'S NOW, AND THE HEIGHT IS BLOCKING 109 OF 171 ROWS**
> (2026-08-10b). Nine landings, every one a read of a named abcjs function: `staffwidth` is
> the MUSIC area so the page is it plus abcjs's 15px margins (42 rows drew `L 655` where
> abcjs writes `L 685`, and **no geometry gate could see it — they all render with NO
> staffwidth and take the default, which was already right**); the outer `<g>` is not
> abcjs's at all but its `abcjs-meta-top`, **which is DELETED when empty**
> (`svg.js:364-372`); the page is `maxwidth + padding` and not a host constant; a trailing
> article moves to the front of a title (`theReverser`); **a glyph carries ABSOLUTE
> coordinates baked into its first `M` and its own `data-name`, with no separator between
> path commands** (`creation/glyphs.js:132-142` — raw JS arithmetic AND raw JS formatting,
> so `num()` must not touch it); **abcjs draws the music FIRST, then the beams, then
> everything else** (`draw/voice.js:25-90`, 48 rows, and **document order is not a
> coordinate so no gate in this repo could express it**); and **`data-index` counts
> SELECTABLES**, which with no `selectTypes` admits `el_type 'note'` alone — so a note and
> a rest carry it and a barline, a clef and a key signature carry NEITHER attribute.
>
> **AND §4 OF THE PREVIOUS CHECKPOINT IS CLOSED.** abcjs places the whole top-text block
> absolutely on the PAPER — title at `paddingLeft + width/2` (350 on a 700px page),
> composer at `paddingLeft + width`, `%%center` at `width/2` with NO padding (335). We
> centred it on its own width and then OVERWROTE that four hundred lines later with the
> finished system's `(width - textWidth) / 2`, a LEFT-EDGE formula on a `middle`-anchored
> row. The recorded failed attempt changed the WIDTH handed to `topTextBlock` and moved
> nothing, because the value it computed was thrown away. **WHEN A CHANGE TO AN INPUT MOVES
> NOTHING, THE OUTPUT IS NOT READING THAT INPUT.**
>
> **AND TWO GATES WERE READING THE MARKUP THEY WERE MEASURING.** `glyph-ycorr` filtered
> glyphs as "a `<path>` with no `data-name`" and `compat`'s density test read
> `transform="translate(` — both true only of OUR output, and both broke the moment the
> markup got CLOSER to abcjs's. Same shape as the `viewBox` removal that took 196 tests
> red. **A gate built on our own markup fails when we succeed**; the failure is the signal.
>
> **AND THE DOM CONTRACT HAS ITS FIRST PASSING SLUGS** — 22 of 25 cases, 246 of 648 rows
> from 86, with `dom-ledger`, `svg-12-8-group` and `svg-single-note` EXACT and ratcheted.
> Three more findings did it: a NOTEHEAD is named with the WRITTEN NOTE
> (`create-note-head.js:34` — derivable from the already-transposed pitch, so it needs no
> source text, but the chord's pitches have to travel WITH their steps); a MULTI-CHARACTER
> SYMBOL is one `<g data-name="12">` with UNNAMED children, and the numerator is the
> string AS WRITTEN (`data-name="2+3"`, not `5`); and a top-text row carries its own class.
>
> **AND THE ORDER INSIDE A NOTE GROUP IS CLOSED**:
> `createNoteHead` adds the FLAG, then the DOTS, then the ACCIDENTAL, and only when it
> RETURNS does the caller `addHead` — so one pitch emits `flag, dots, accidental, head`,
> then `stem`, then `ledger`. **AND THE FLAG BELONGS TO THE STEMMED HEAD OF A CHORD**
> (`abstract-engraver.js:671-675`), which is why an up-stemmed `[FA]` reads
> `F, flags.u8th, A` and looked like an exception to a rule about flags.
>
> ✅ **AND THE BYTE TABLE HAS ITS FIRST SEVEN EXACT FIXTURES — 164 of 171** (2026-08-10b),
> from 171 of 171 at byte 10 when it opened. Six of the seven are ONE finding: **a line
> with no note and no barline is DELETED** — `cleanUp` drops any `tune.lines[i]` whose
> every voice fails `containsNotes`, and that test is `el_type === 'note' || 'bar'`
> (`tune-builder.js:29-61`, `:888-894`), so a clef, a key and a meter are not enough. A
> tune with a header and no music draws NO STAFF AT ALL; abcjs's golden for
> `X:43\nT: example` is 694 bytes holding a title and nothing else. **AND THE TITLE STILL
> DRAWS**, because `draw()` runs `nonMusic(topText)` and spends `spacing.music` before it
> looks at a line.
>
> 🔬 **AND abcjs ITSELF IS RUNNABLE — `ABCJS_VERSION=6.7.0 node dump-svg.js --file x.abc
> --output x.svg` from `../abcMusicKit/Tools/abcjs-debug`, at the goldens' own
> `{staffwidth: 670}`. `ABCJS_VERSION` IS NOT OPTIONAL: `dump-svg.js:14` DEFAULTS TO
> 6.6.3**, and a run without it accused the 6.7.0 branch this engine already ports of a
> defect it does not have. **THE ORACLE HAS A VERSION AND THE DEFAULT IS THE WRONG ONE.** A LADDER
> OF CONTROLS THROUGH BOTH ENGINES IS A FIVE-MINUTE OPERATION, and one such ladder named
> the last structural height in a single run: **a tie that CROSSES A SYSTEM BREAK reserves
> 7.75px and nothing else does** — not a mid-bar tie, not a tie at the end of the tune, and
> not `%%stretchlast`, which the fixture's NAME had made the obvious suspect and which
> costs nothing at all. **A FIXTURE NAME IS NOT EVIDENCE.**
>
> ⚖️ **AND v1 HAS ALREADY ANSWERED THE ARCHITECTURAL QUESTION** (Lance, 2026-08-10b: *"v1
> port from js encountered similar rounding issue — so v1 may have the solution used to get
> to byte parity to js"*). It did, and **THERE IS NO CLEVER ROUNDING: v1 NEVER INTRODUCED A
> SECOND UNIT.** It holds abcjs's own PIXELS end to end — `Spacing.STEP = 3.875`,
> `calcY(pitch) = staffAbsoluteY - pitch * STEP`, `roundNumber = parseFloat(x.toFixed(2))`
> for paths and text, plain JS `String(number)` for the raw `width`/`height`. We already do
> every one of those. What we do that v1 does not is DIVIDE BY 7.75 AND MULTIPLY BACK.
> **AND AT THE ONE PLACE A SCALE HAD TO EXIST IT SOLVED THIS BY ASSOCIATION ORDER** —
> `pitch * STEP * stepScale`, never `pitch * (STEP * stepScale)`, "to keep the 1.0 path
> bit-for-bit" (`Spacing.swift:41-43`). The strict path's expression must never contain a
> CONVERTED constant, and a mode factor goes on the OUTSIDE where 1.0 is the identity.
>
> ⚖️ **AND THE HEIGHT IS THREE PROBLEMS, NOT ONE.** Measured: **80 of 171 exact, 86 by pure
> ULP noise, 2 STRUCTURALLY** — both the same 3.875px, and FOUR LADDERS rule out what it is
> not. **A BLOCK WRITTEN INSIDE A SYSTEM IS DRAWN AFTER IT** (27.05px for a `T:`, 33.77 for
> a `%%text`, drawn nowhere at all), and **A TIE ARRIVING FROM THE SYSTEM ABOVE RESERVES
> `pitch ± 4` AS INK** — the second half of a split tie has a null `anchor1` and its closing
> note IS on that line, so `setEndAnchor` runs; the FIRST half never gets one, which is why
> a tie at the end of the TUNE costs nothing. **TWO WRONG INFERENCES PRECEDED THAT ONE, AND
> `dump-elements.js` SETTLED IT IN A STEP — it publishes abcjs's own `staff.top`/`bottom`,
> so ASK IT WHICH BOX IS IN PLAY rather than reading the three candidates and picking.** THE 13 ARE WORTH MORE THAN THE 82 — they are
> real vertical defects no gate here can state, because `pixel-parity` and the harvested
> table pair NOTEHEADS and a page 300px too short with every note in place reads as
> perfect. The largest WAS **`BottomText`, an entire missing feature** — `W:`, `N:`, `H:`,
> `B:`, `S:`, `D:`, `Z:`, worth 262, 274 and 297px of page — and it has LANDED across all
> three layers. Two rules from it transfer: `simplifyMetaText` JOINS `notes` and `history`
> into one `\n` string so they draw as ONE `<text>` advancing by
> `round(height * 1.1 * numLines)` — one rounding for the whole block — while an EMPTY line
> is a row of its own that advances by the RAW height with no `* 1.1` and no rounding. The 82 are the
> `px / 7.75` ROUND TRIP — `flagX = headX + headInk - spaces(ABCJS_PX.flagStemInset)`
> divides an abcjs pixel by 7.75 and the emitter multiplies it back, and every glyph
> coordinate does the same, so the vertical tail and the horizontal one are ONE defect.
> **A reading of a single aggregate number would have called all 109 rows one bug**; the
> classifier probe (recipe in `Docs/HANDOFF-2026-08-10b.md`) is what split them.

> 🧭 **THE DOM CONTRACT IS 24 OF 25, AND THE UNIT FLIP IS THE WHOLE REMAINING BYTE TABLE**
> (2026-08-10d). `dom-contract` went from 11 of 25 to **1**, on nine landings that were each
> a read of a named abcjs function — and the one case still open is a MODEL change, not a
> markup one. The ones whose LESSON transfers:
>
> - **DRAW ORDER IS CALL ORDER.** `_addChild` is a plain push, so `createNote`'s run of
>   adders IS the element's child order: `heads+stem → lyric → graces → decorations →
>   barNumber → LEDGER → chord` (`abstract-engraver.js:829-855`). **THE LEDGER IS LAST**;
>   only a BEAMED stem comes after it. A LYRIC is a `<text>`, so "texts last" had to bend —
>   only the CHORD SYMBOL is genuinely last.
> - **A DYNAMIC IS NOT A CHILD OF THE NOTE** — it is a `DynamicDecoration` on the voice's
>   `otherchildren`, drawn after every element and every beam. And **`drawDynamics` and
>   `drawCrescendo` disagree on the order of their own two classes**, which is a quirk to
>   reproduce rather than one of them to pick.
> - **AN ENDING AND A TRIPLET ARE EACH A GROUP** holding ONE path with every segment in its
>   `d` and a `noClass` number naming itself. **The ending's measure counter is its measure
>   within the LINE minus one** — MEASURED on three controls through abcjs with
>   `--add-classes`, not reasoned.
> - **A NOTEHEAD'S CLASS IS WRITTEN AFTER ITS `d`**, because inside an element group
>   `printSymbol` passes only `data-name` and `drawAbsolute` comes back afterwards with a
>   `setAttribute` (`draw/absolute.js:20-28`). A late `setAttribute` serialises LAST — which
>   is also why a CLEF glyph carries no class at all.
> - **A STEM AND A BARLINE COME OUT OF `printStem`, NOT `printLine`** — commands
>   concatenated with NO separator, a different starting CORNER per stem direction, the
>   class before the name, and no `stroke`/`fill` at all inside a group.
> - **AN ELEMENT THAT DRAWS NOTHING WRITES NO GROUP** — which is why a `y` SPACER produces
>   no markup, where ours wrapped nothing in an `abcjs-rest`.
> - **`--add-classes` IS NOT OPTIONAL EITHER.** Without it every generated class in abcjs's
>   output is the empty string, so the class scheme is invisible.
>
> ⚖️ **AND THE LAYOUT HOLDS ABCJS'S OWN PIXELS NOW — THE UNIT FLIP IS LANDED.** The byte
> table's head was `M 108.03813656268917` against `M 108.038` and its median row
> `height="149.07999999999998"` against `149.08`: the `px / 7.75` round trip, which
> rounding cannot fix because abcjs itself emits `29.689999999999998` where ours was clean.
> **Only the SAME ARITHMETIC produces the same bytes**, so `abcjs-constants.ts` carries a
> `UNIT_PX`/`SPACE` knob, every length in the engine says which unit it is in, and
> `UNIT_PX = 1`. It took the byte table from **161 of 171 at median 177 to 151 of 171 at
> median 657**, and the root height from **80 exact / 86 ULP to 114 exact / 55 ULP**.
>
> **DO THE ANNOTATION PASS BEFORE THE FLIP, NOT AFTER IT.** The first attempt flipped first
> and took `pixel-parity` to 119 of 120; with hundreds of literals wrong at once the ranked
> tables are noise rather than a work list. `n * SPACE` while `SPACE === 1` is a
> zero-behaviour edit whose check is the one already trusted here — the suite green and NO
> BASELINE MOVED — so every literal converts and verifies one at a time. **And the
> DISCOVERY MECHANISM was the baselines used as a RATIO**: after the flip every number must
> be exactly 7.75× its old one, which is exhaustive and needs no judgement. Its three
> filters earned themselves — integers are counts and step indices, anything under half a
> unit is print rounding, and `x == y` is a value with no unit at all.
>
> **THE CLASSES OF LITERAL IT FOUND**: a length→step conversion written `2 *` (four sites,
> each with a comment already calling it a division); a LENGTH spelled as a pitch
> (`noteheadHeight / 4`) and a STEP spelled as a length (a tremolo's stem reach); bare
> offsets; nine hard-coded `7.75`s; a raw `GLYPHS[…]` read whose SMuFL figures are in staff
> spaces; and the ROOT's own size, which multiplied by the host's `staffSpace` where it
> wanted layout-units-to-output-pixels.
>
> ⚖️ **AND TWO OF THEM WERE REAL DEFECTS, FOUND ONLY BECAUSE THE DIMENSIONS COULD SPEAK** —
> both the same shape, **a PRE-COMPUTED CONSTANT WHERE ABCJS HAS AN EXPRESSION**.
> **THE SPRING** was `spacingScale * sqrt(d / (1/16))` with `2.7372`: abcjs's own
> `spacing * Math.sqrt(duration * 8)` at a base of 30px, with the `sqrt(2)` folded into the
> constant and then ROUNDED TO FOUR DECIMALS — a relative 1.5e-5 on EVERY note's spring,
> **invisible to a 0.05px gate and not invisible to a byte comparison**, which is exactly
> why it survived. **A TEMPO'S PRE-TEXT GAP** is one AVERAGE CHARACTER —
> `charWidth = preWidth / length` (`draw/tempo.js:22-23`) — where ours added a flat 1 staff
> space; verified against abcjs's own SVG, which puts `data-name="beats"` at x 155.61 in
> both engines now. `CHECKPOINT-2026-08-05b.md`'s ruling in two constants: **measuring is a
> COMPASS, never a SOURCE OF NUMBERS.**
>
> 🔩 **AND THE FLIP ITSELF FOUND FIVE MORE, TWO OF THEM ABOUT A GUARD THAT QUIETLY CHANGED
> MEANING.** **THE IDENTITY SHORT-CUT WAS `PX === 1` AND HAD TO BE `PX === 1 && oy === 0`**
> — `TL`/`TC` returned their argument untouched at scale 1, written when that meant CORE
> mode, where `oy` is zero by construction; once the layout holds abcjs's pixels it is 1 in
> the abcjs path too, and skipping `oy` dropped the whole staff origin. Three byte-exact
> fixtures. **AND `roundNumber` IS `parseFloat(x.toFixed(2))`, NOT `Math.round(x*100)/100`**
> — they disagree on a decimal half, and a beam's second edge is computed FROM the rounded
> first, so 171.945 became 171.95 against abcjs's 171.94. Three more.
> **A SCALED GLYPH IS CSS-SCALED, NOT DRAWN SMALL** (`draw/relative.js:68-76`) — the other
> half of the finding that abcjs never applies a glyph's scale to its PATH.
> **A BEAM IS A `<path>` AND ONE PATH HOLDS EVERY BEAM OF ITS GROUP**, with irregular
> separators and a SIGNED `dy` that decides which edge the path opens on.
> **A MUSIC TEXT IS `renderText`'s ELEMENT**, with its own `%%…font`'s face, weight and
> style spelled out — and **`noClass` is a PROPERTY, not `renderText`'s third argument**,
> which is `alreadyInGroup`; reading the positional one as `noClass` broke
> `dom-bar-numbers` the moment it landed, and abcjs answered it in one run with and without
> `--add-classes`.

> 🔎 **AND THREE MORE GATES WERE READING THE MARKUP THEY MEASURED** — `compat`'s density
> test (its THIRD correction), `above-lane-order` (keyed on a class that is empty without
> `add_classes`) and `line-weights` (asked a one-path bracket for a per-stroke box). All
> three went red on changes that made the markup CLOSER to abcjs's. **A gate built on our
> own markup fails when we succeed; the failure is the signal.**

> 🏁 **THE BYTE TABLE HAS PASSING SLUGS AND THE DOM CONTRACT IS THE INSTRUMENT**
> (2026-08-10c). Both open tables started that day at EVERY case and neither does now:
> `svg-bytes` **164 of 171 with SEVEN byte-exact slugs** (from 171/171 at best 651, median
> 162 — now best 5186, median 179) and `dom-contract` **11 of 25 with FOURTEEN** (from 25/25
> at 86 of 694 rows). Forty-one landings, and the ones whose LESSON transfers:
>
> - **A LINE WITH NO NOTE AND NO BARLINE IS DELETED** (`containsNotes` tests
>   `el_type === 'note' || 'bar'`), so a tune with a header and no music draws NO STAFF —
>   this took the first seven fixtures to byte-exact.
> - **TWO `dots.dot`, NOT ONE BRAVURA `repeatDots`** — that glyph is not in abcjs's table,
>   so it fell through to Bravura's with `scale(7.75)` on it. **A BRAVURA FIGURE REACHABLE
>   IN STRICT, the class the 2026-08-05 audit closed**, surviving because no POSITIONAL gate
>   reads a barline's glyphs. The DOM contract is what could see it.
> - **THE COUNTERS ADVANCE AFTER THE ELEMENT IS DRAWN** (`draw/voice.js:41-46`), so a child
>   generated inside an element sees the counters the group was named with.
> - **THE PASSING RATCHET CAUGHT A REGRESSION THE COUNT HID**: one change took the aggregate
>   from 22 differing cases to 15 and broke a ratcheted slug in the SAME RUN.
> - **READ THE BASELINE DIFF'S SHAPE**: a new feature only ADDS and a reorder is a pure
>   PERMUTATION; REMOVALS in either case mean something broke. That caught a grace-stem
>   regression inside a grace-ledger fix.
> - **A FIXTURE'S NAME IS NOT EVIDENCE** — `stretchlast-1`'s defect had nothing to do with
>   `%%stretchlast`; it was a tie crossing a system break.
>
> **AND THE HARNESS IS BIGGER**: `ABCJS_VERSION=6.7.0 node dump-svg.js` AND
> `dump-elements.js` from `../abcMusicKit/Tools/abcjs-debug`, both at the goldens' own
> `{staffwidth: 670}`. **`ABCJS_VERSION` IS NOT OPTIONAL — it defaults to 6.6.3** and a run
> without it accused the 6.7.0 branch we already port of a defect it does not have.
> `dump-elements.js` publishes abcjs's own `staff.top`/`bottom`.

> 🧩 **AND THE ULP TAIL IS ONE ARCHITECTURAL DEFECT, PROVEN BY A CHANGE THAT MADE IT WORSE**
> (2026-08-11). `svg-bytes` went **117 → 94 of 171** on twenty-seven landings, every one a read
> of a named abcjs function, and what is left is dominated by a single shape: `calcHeight`
> sums `staff.top` and `-staff.bottom` **in PITCH** and multiplies by `STEP` once, while we
> hold the extent in y and divide back. **Writing one site "the abcjs way" is a
> REGRESSION** — `stepToY(step ± halfPitch)` adds a multiply AND a divide where
> `stepToY(step) ± half` had only the divide, and the staff bottom went from abcjs's exact
> `1.044774193548387` to `1.0447741935483865`. `x * STEP / STEP` is not `x`. The extent
> itself has to carry pitch; the failed shape is recorded at the site so it is not tried a
> third time. Where a value is only DRAWN the local fix DOES work, and it landed twice (a
> grace stem, a note stem).
>
> The landings whose LESSON transfers: **an unbeamed grace carries a `flags.u8th`** and no
> gate could state it (not a notehead, and its reserve is a POINT the stem already covers);
> **a `%%text` before the music is a nonMusic LINE**, so `spacing.music` is spent BEFORE it —
> the total was right and every row was 7.56px high, because **A SUM CANNOT SEE AN ORDER**;
> **ledgers run once per ELEMENT, outermost first**, with one extra rule per shifted head,
> which a corpus-wide COUNT of `data-name="ledger"` (171 match, 0 differ) is what made safe
> against a baseline diff full of removals; **a TIE and a SLUR choose their side by different
> rules** and a WHOLE NOTE still has a stem direction; **an incoming curve-half is a fixed
> 20px stub that is never omitted** — the `ponytail:` note claiming engraving needs room at a
> system's start was a hypothesis, and abcjs overlaps the clef; **an arc is built from its
> ROUNDED endpoints with `sqrt` and not `hypot`**, because A BETTER FORMULA IS STILL A
> DIFFERENT FORMULA; **a percussion clef sits on the middle line and still reads like
> treble**, abcjs's table having two columns that disagree; and **a voice name is
> `headerPosition`, wears no group, and RESERVES NOTHING** — moving it was byte-right and
> pushed a staff 2.98px, which only `pixel-parity` could say.

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
> source reads has predicted something abcjs's own output denies FIVE times here — the `G8`
> breve, the `extra-class` accent, the notehead `data-name`, the `sfz` glyph table, and
> `beambr`'s `+= elem.w` guard, which reads as though it must fire and provably does not.
> If a fix is only half understood, WRITE THE MEASUREMENT DOWN instead of shipping it.

> 🔬 **AND WHEN THE SOURCE IS NOT ENOUGH, INSTRUMENT abcjs — THE DUMP LIES**
> (2026-08-11). `dump-elements.js` publishes `staff.top`/`bottom` BEFORE
> `setUpperAndLowerElements` mutates them, and half a session went on a term list reasoned
> off that number. A SCRATCHPAD COPY with a `console.error` after every `moveY` answered the
> page walk in ONE run and named the defect: **A LEADING GAP IS A ROW OF ITS OWN** —
> `spacing.title` and `spacing.subtitle` enter the block as `{ move }` rows — and our block's
> ink overshoot happened to be the same 7.56, so the total was right to the pixel and wrong
> in the last bits. **TWO ERRORS CANCELLING**, for the fourth time on this branch. The recipe
> is in `CHECKPOINT-2026-08-11.md` §5; never instrument `../abcMusicKit` itself.
>
> **AND CLASSIFY BEFORE YOU CHOOSE.** The ranked table's shape is not visible by reading it:
> a crude "does one side have a long decimal tail" test calls 57 rows structural where
> aligning on the FIRST DIFFERING CHARACTER calls 19 — and a whole stretch went at the
> minority family on the strength of the wrong count. §4 has the classifier.
>
> **AND A ULP IS CHEAPER THAN A POSITION ERROR.** abcjs's lyric lane is
> `dim.height / STEP + 1` over ONE measurement of the whole verse string; it is measured,
> correct to the last digit, and deliberately NOT SPENT, because abcjs subtracts it from the
> music's ink while our y comes from the last verse's baseline — spending it takes one
> fixture byte-exact and puts two others structurally out.

> 🧱 **AND THEN THE STRUCTURAL ROWS STARTED FALLING — 67 → 57, TWENTY-ONE FINDINGS, MOST
> OFF ONE FIXTURE** (2026-08-11b), which a BYTE comparison hands you one at a time because it walks
> the whole file in order. The later ones: **a grace note is a SIXTEENTH** so a bare group
> takes TWO beams (`abc_parse_music.js:694-695`, measured at three `L:` values); **an ending
> is on `otherchildren` too**, and **an ending and a triplet take their turn at their START
> where a curve and a hairpin take theirs at their CLOSE**; **`%%vocalfont`'s FACE** was not
> realized on a lyric though its size and weight were; and **a tempo mark's notehead sits on
> a PITCH** — the rung less five (`set-upper-and-lower-elements.js:209`) — where ours
> reached it through the text baseline and four y terms.
>
> 🔬 **AND THE LAST TWO WERE THE PAGE LEAD AND A SLUR.** The top-block lead is abcjs's
> EIGHT ADDS — `padding.top`, four nonMusic rows, `spacing.music`, `staffSeparation`, then
> ONE product — where ours summed it into one number; a first attempt failed by REASONING
> about which terms `blockSpan` and `topAdvances` hold and a `console.error` of both settled
> it in one step (`topAdvances` already ends with `spacing.music`, and `blockSpan` IS its
> sum). **`ABCTS_CHECK=1` is the assertion left behind** — it compares the walked staff
> origin with the system-relative one and found the one shape the term list did not
> describe. And `calcSlurY`'s MID-STEM ARM was never ported because a `ponytail:` predicted
> it a no-op; `visual-slurs-02`'s `(E2D2)` denies it by three pitch, and **the arithmetic was
> already in the file** — the same branch carries an x bump that WAS ported.
>
> 🔬 **AND TWICE A FIX WAS REVERTED AND THEN LANDED BY INSTRUMENTING.** The grace beam's aux
> level was wrong in BOTH directions when read off the two engines' `d` strings; one
> `console.error` in `createAdditionalBeams` printed `bary=6, startY=4.0566, beam.startY=5`
> and it went byte-identical the same hour. **A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A
> WRITTEN-DOWN MEASUREMENT** — and the measurement is cheap, so instrument first. The last four are the beam and the `otherchildren` list: **an
> auxiliary beam's start y is sampled at the NOTE'S OWN x** and not at its 0.6-inset start,
> which on a slant is `0.6 × slope` (`layout/beam.js:174-188`); **a curve is on
> `otherchildren` too and the list sorts on the CLOSE**, since a slur and a hairpin are both
> added by their closing decoration; **a grace beam is a `<path>` like any other**, one per
> group with every level in its `d`; and **a beamed grace's stems come after the element's
> ledgers**, because `createStems` builds them in the LAYOUT phase and appends to a child
> list `createNote` finished with. Together those took the two biggest fixtures from byte
> 12305 to 74220 of 202156.
>
> ⚖️ **AND ONE MEASURED FINDING WAS DELIBERATELY NOT LANDED.** `abc_parse_music.js:694-695`
> makes a grace note a SIXTEENTH whatever `L:` says — measured through abcjs at three
> lengths — so a bare `{CD}` takes TWO beams where ours draws one. The level count is
> certain and the second beam's y is not, so the implementation was reverted and both
> engines' output written into `CHECKPOINT-2026-08-11b.md` §2.18 with the three questions to
> settle. **A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A WRITTEN-DOWN MEASUREMENT.** Four of the nine are invisible to every ranked table and were
> reachable only because a BYTE comparison walks the whole file in order: **a lone auxiliary
> beam is a 5px stub** whose side is a four-way rule and whose two ends are not symmetric
> (`layout/beam.js:215-238`); **a triplet joins the `otherchildren` merge** rather than
> queueing ahead of it; **the below-dynamics lane must not measure the UNPLACED heading
> block**, whose rows still carry a block-local y and read as 189px of ink below the staff;
> and **a hairpin takes the dynamics lane for its OWN SYSTEM** — `hasVocals` is per LINE
> (`abstract-engraver.js:110`), so a tune whose lyrics start on its second system puts the
> first system's dynamics below and the rest above. **A `ponytail:` THAT SAYS "THE CORPUS
> NEVER VARIES THIS" IS A PREDICTION, NOT A MEASUREMENT** — that one carried exactly such a
> note and was worth 118px.
>
> The other five: `visual-selection-01` is 202k bytes and named five separate
> defects in one sitting, each visible only once the one before it closed: **a brace with a
> header OWNS the voice name** and `setBottomStaff` DELETES it off the voice
> (`brace-element.js:9-14`); the brace's own x is `padding.left + voiceheaderw`, past that
> name, and its ends come off `staff.absoluteY` one product each (`draw/brace.js:8-14`);
> **`%%voicefont` was not realized at all** and `fontTranslation` is a 34-row TABLE mapping
> a PostScript name to a web family plus a weight, not a suffix rule
> (`abc_parse_directive.js:62-160`); **a tempo's parts are INTERLEAVED**, `preString`
> before the glyphs (`draw/tempo.js:18-38`); **a `P:` label is `renderText`'s element**,
> which brought three more rules out of `draw/text.js` in one pass — a boxed font shifts a
> `start`-anchored text by its padding, DELETES its class, and owns the rect, wrapping it in
> a group only when the caller is not `alreadyInGroup`; and **`Q:` takes a quote on EITHER
> SIDE of the rate**, position deciding which, not content.
>
> **A LARGE FIXTURE IS NOT A HARD FIXTURE; IT IS A DENSE ONE.** And **A REMOVAL IS A
> FINDING WHEN A COUNT SAYS SO** — two of the five rested on removals the baseline flagged,
> both settled by counting the thing in BOTH engines across all 171 fixtures (`171 match /
> 0 differ` for the voice name; `6 fixtures differed before, 3 after` for the box).
>
> ⚖️ **AND ABCJS'S ARITHMETIC IS PART OF THE PORT — 94 → 67 of 171 ON SEVEN LANDINGS**
> (the same day). Which number is formed FIRST, which product is taken ONCE, which offset is
> STORED rather than derived. The vertical closed first and the HORIZONTAL turned out to be
> worth more: **the line solve iterates on abcjs's `spacing` itself, not on a factor** —
> `spacing` is one number replaced outright each of the eight passes
> (`layout/layout.js:110-116`), where ours carried a ratio to the 30px base and
> re-multiplied it at every spring, a multiply and a divide per element per pass. Eleven
> fixtures on four lines. And **PLACE AN ELEMENT ON THE SOLVED x, DON'T SHIFT IT THERE** —
> `child.x = x + this.dx` (`relative-element.js:124-125`), one addition onto the solved
> number, where ours translated by a delta. **One offset has to be BUILT rather than
> derived**: a flag's `dx` is `headx + notehead.w - 0.6` (`create-note-head.js:47`) and
> `(x + a) - x` is not `a`. `PlacedGlyph.dx` carries the constructed number.
>
> **AND THAT REFACTOR MOVED REAL PIXELS, not only ULPs** — placing elements while still
> SHIFTING their beams put 8.51px of `dy` on `ragtime-nightingale`, caught by `pixel-parity`
> mid-refactor. Re-read every gate after each step of an arithmetic arc.
>
> ⚖️ **AND THE VERTICAL HOLDS ABCJS'S PITCHES END TO END** (the same day).
> `svg-bytes` **94 → 82 of 171** on five landings, four of which are ONE finding: abcjs
> holds the vertical in PITCH and multiplies by `spacing.STEP` exactly once, where we held y
> and divided back. **AN ASSOCIATION IS A DECISION** — `a + b + c` is `(a + b) + c`, and
> abcjs's grouping is part of the port: `printSymbol` computes `calcY(offset + ycorr)` as
> ONE number before `pathArray[0][2] += y`, so `-3.96 + -11.625 + 84.56` is `68.975` where
> `-3.96 + (-11.625 + 84.56)` is abcjs's own `68.97500000000001`. **Nine fixtures on one
> pair of brackets.** Then the walk itself: a staff's origin is ONE product off a pitch
> (`draw/staff-group.js:25-26`); `addStaffPadding` is a pitch sum with one multiply and a
> TOP-UP rather than a maximum (`draw/draw.js:84-92`); the intra-group separation lives
> INSIDE `staff.top`, in pitches (`set-upper-and-lower-elements.js:82-92`) — which is why
> `calcHeight` can be a bare sum of tops and bottoms and still be right, its own `TODO-PER`
> notwithstanding; and the page is ONE running cursor seeded with `padding.top`, so a staff's
> `absoluteY` is that cursor plus one `moveY`, never `(system + staff) + margin`.
>
> **AND §3 OF THE PREVIOUS CHECKPOINT WAS RIGHT ABOUT THE SYMPTOM AND WRONG ABOUT THE
> CAUSE.** It recorded that a beamed stem must NOT supply a pitch. It must — just not the
> UNBEAMED `p1`/`p2`, which the beam pass invalidates: `createStems` hands the stem
> `pitch2: bary` straight out of `getBarYAt`, which interpolates two PITCHES
> (`layout/beam.js:122`). Re-read a negative result against the source before treating it
> as closed.
>
> **AND A WASH IS NOT "NO EFFECT".** Starting the above-stack ladder on `staff.top` itself
> rather than on the ink's y divided back is correct and, alone, took `visual-misc-13` OFF
> the byte-exact list — because the reciprocal-multiply it replaced had been CANCELLING a
> latent defect in the ornament's own reserve. **TWO ERRORS CANCELLING, for the fifth time
> on this branch**, and the first where the pair was a correct change and a latent defect
> rather than two defects. Land the structure, then chase what it exposes.
>
> **AND THE AGGREGATE COUNT IS THE WRONG DIAL FOR AN ARITHMETIC ARC.** 85 → 85 hid a
> 180-token improvement and 82 → 82 hid a 48-token one. COUNT TOKENS BY AXIS while the
> family is ULP; `CHECKPOINT-2026-08-11b.md` §5 has the four probes that do it.
>
> 🔒 **AND THE RATCHET NOW NAMES ALL 104 BYTE-EXACT FIXTURES, BECAUSE SEVEN COULD NOT
> DEFEND EIGHTY-NINE.** It has since caught two more, in the same run that made the change. Twice that day a fixture went from byte-exact to differing **while
> the aggregate count improved**, and neither was ratcheted, so the only thing that caught
> them was diffing two runs of a scratch script by hand. **A ratchet holding 4% of what is
> green is a ratchet in name.**

> 🧾 **AND FIVE MORE FELL ON 2026-08-12 — 49 → 41 of 171 — THREE OF THEM NAMED BY A FIXTURE
> THAT WAS ABOUT SOMETHING ELSE.** A standalone `M:` on the tune's FIRST measure belongs to
> that line's prefix, because `startNewLine` fires lazily and on the first measure there is
> no next line to receive it (finding 121's twin). Then the bar-number arc, three rules
> stacked, each invisible until the one before it closed: a bar number wears
> **`measurefont`'s WEIGHT AND STYLE**, not just its size; **a BOXED font is measured four
> paddings wider AND taller** (`get-text-size.js:46-49`) — `fontHeightOf` already did the
> height and `textWidth` did not, so **landing it on both was worse than landing it on
> neither**, at 9.06px of page; and **A BAR NUMBER ON A CLEF DOES NOT PUSH THE TOP**, an
> explicit `okToPushTop = false` in `_addChild` (`absolute-element.js:184-189`) that was
> invisible until the boxed width flipped `vert` from 11 to 13.5.
>
> **AND "DOES NOT RESERVE" HAS TO BE SAID, NOT OMITTED** — deleting the reserve changed
> nothing at all, because an absent one falls back to `verticalExtent`'s ascent/descent
> estimate, which reserves MORE. The built-in `ABCTS_PROBE` named the real contributor in
> one run, after a wrong guess had already been implemented and measured to do nothing.
>
> **AND A CHORD'S TIE IS ONE TIE PER NOTEHEAD** — `el.pitches.forEach(function(pitch) {
> pitch.startTie = {} })` (`abc_parse_music.js:427`), so `[GB]8-` builds TWO `TieElem`s
> where we built one. **A SLUR IS NOT LIKE THIS**, being hung on `pitches[0]` alone, and the
> two rules look alike — which is how it survived. Three baselines moved and the diff was
> PURE ADDITIONS, which is the shape a new feature has to have.
>
> **AND A NOTEHEAD'S `data-name` IS THE SOURCE SPELLING, WHICH IS NOT DERIVABLE.** `c,` and
> `C` are the same note and abcjs keeps whichever was typed (`abc_parse_music.js:1116-1147`);
> we canonicalised. `writtenNote`'s own doc block said the pitch was enough — the premise was
> true, the conclusion did not follow, and it had been wrong on every lowercase-with-comma
> note in the corpus since it was written. **The third time on this branch that a note naming
> a cause is the reason the row stopped being read** (the `G8` breve, the `extra-class`
> accent, this).
>
> 🔟 **AND THE DAY CLOSED AT 26 of 171 WITH 145 EXACT, ON THIRTY-ONE LANDINGS.** The last
> five: **a SLASH or TRIANGLE notehead moves the stem's NOTEHEAD end**, on an UNBEAMED stem
> and AFTER the middle-line clamp — both conditions found by a gate reporting the fixture
> going BACKWARDS; **a tune with no `M:` still has a MEASURE LENGTH, and it is 1**, so
> `centerWholeRests` had never run at all; **`isTie` is RECOMPUTED AT DRAW TIME** — a slur
> whose two ends share a pitch with nothing between them is drawn as a TIE, which decides
> the lift, the flatten cap, the direction rule, the class and the `data-name` together;
> **a BARLINE WITH NOTHING AFTER IT is still a barline**, so `A | |` had been parsing as ONE
> measure; and **ANY barline that is not a plain thin `|` ENDS THE ENDING it sits in** —
> abcjs's rule is a COMPLEMENT where ours was a LIST, identical for everything but an
> invisible `[|]`.
>
> 🔇 **AND SILENCE IS A SHARPER SIGNAL THAN A WRONG NUMBER.** Twice this day a probe printed
> abcjs's answer and NOTHING from ours — `centerWholeRests` and the hairpin's close — and
> both times that moved the search from "our arithmetic is off" to "this code never runs",
> which is a different bug in a different file. The later
> ones, and every one is a read of a named abcjs function: **%%voicecolor is `drawVoice`'s
> SWAP** and the staff LINES are drawn before it; **an ENDING running off a system ends at
> the voice's width MINUS ONE, unrounded**, because `drawEnding` rounds only what came from
> an anchor; **a `%%sep` in the head of a tune drew NOTHING** — its `rules` sink was a
> literal `[]`, and the two rules that had to follow it were both things the block's TEXTS
> already did; **a GLISSANDO is a squiggle** built from four constant segment lists sheared
> by the slope; **a TEXT decoration is `renderText`'s element in `annotationfont`** and
> declares its own anchor, its literals being abcjs's `FINE` and `al coda` rather than a
> style guide's; **the BELOW decoration cursor's floor is the ELEMENT's own bottom** —
> `this.minBottom` from the constructor is passed nowhere, and the ABOVE side really does
> take the constant, which is why one half was right; **the ACCIACCATURA SLASH is a glyph**,
> abcjs's own `flags.ugrace`, which sat in `UNMAPPED_ABCJS` under a misreading SMuFL denies;
> **an empty `""` is a CHORD** and `includes('')` is TRUE; **a DOTTED tie is the outward half
> alone, stroked**; and **a HAIRPIN CLOSES ON A BARLINE**, which the audio arc had already
> found from the other side while the renderer never learned it.
>
> ⚖️ **AND THREE OF THEM WERE ONLY REACHABLE BECAUSE ANOTHER GATE CAUGHT THE FIRST
> ATTEMPT.** `role: 'grace'` on the acciaccatura slash made the pixel gate count a sixth
> notehead; `role: 'chord'` on a left annotation fixed its ORDER and cost 18.52px of LANE —
> **two questions, two fields**; and sorting the spanner sites on `element` alone paired a
> hairpin's open with the wrong close, which the baselines reported as **12 REMOVALS and no
> additions**, the shape that says regression rather than change.
>
> 🧾 **AND A TEST CAN ENCODE AN INFERENCE AS FIRMLY AS A COMMENT CAN, AND IS HARDER TO
> NOTICE** — a green test reads as a checked fact. Three asserted our own engraving as
> though measured: the decoration texts' `Fine` / `al Coda` / italic, the acciaccatura's
> extra LINE, and `lines('{/A}G2|') > lines('{A}G2|')`. All three now assert what abcjs
> draws and say what they used to claim.

> 🧮 **AND FIVE MORE THE SAME DAY — 39 → 34 of 171, 137 EXACT.** **A STEM'S `bottom: p1 - 1`
> IS SKIPPED WHEN IT IS ZERO** — `if (opt.bottom)` and `0` is FALSY
> (`relative-element.js:41-42`) — so a stem whose low end is pitch 1 reserves one pitch
> less, which is 3.875px of page on two fixtures. **THE BOTTOM-TEXT BLOCK'S ROWS ARE SPENT
> ON THE PAGE'S CURSOR ONE AT A TIME**, as `nonMusic` spends them; a sum cannot see an
> order, for the fourth time on this branch. **A `%%sep` IN THE HEAD OF A TUNE DREW
> NOTHING** because its `rules` sink was a literal `[]` — and the two rules that had to
> follow it were both things the block's TEXTS already did (the page's own y, and its turn
> among the rows). **`minx` IS TWO ADDS** — `x + getMinWidth` then `+= minspacing` — and
> **`rod - gap` DOES NOT RECOVER `w`** (`21.795 - 10` is `11.795000000000002`), which is
> why the obvious rewrite moved nothing the first time: THE WIDTH HAS TO BE CARRIED, not
> derived, exactly as `PlacedGlyph.dx` is. And **A QUARTER TONE NAMES ITSELF** — `accMap`
> has seven entries where our `Accidental` enum has five.
>
> ⚠️ **AND A BISECT THAT NEVER TURNS GREEN MEANS THE CAUSE IS NOT IN THE HISTORY.**
> `content-parity`'s one red is `S7-voices`, and it is an UNCOMMITTED edit to that fixture in
> `../abcMusicKit` — same notes, respelled chord durations, so every source offset moved
> while the goldens stayed at 2026-08-08. Seven commits of bisecting bought nothing that
> `ls -la` on the two inputs did not say at once. **AND A GATE'S REPORT FILE IS NOT ITS
> RESULT**: `/tmp/abcts-*.txt` outlives the run, and I called that gate green twice off a
> stale one.

**READ `Docs/HANDOFF-2026-08-13.md` FIRST** — the current state (12 of 171, 159 byte-exact
and all ratcheted), THE TWELVE with what each one needs and what has already been tried and
reverted, THE HARNESS, and the rules this arc earned. Then
`Docs/CHECKPOINT-2026-08-12.md` — the state, the five landings, §3 WHAT IS LEFT
(two rows measured to the digit and NOT landed — the per-LINE forced stem and the staff
BOTTOM's one-ULP pitch), §5 THE ONE RED IS NOT OURS, §6 THE HARNESS and §7 the rules.
`Docs/HANDOFF-2026-08-12.md` has the session prompt and the two probes.
Then `Docs/CHECKPOINT-2026-08-11b.md` — superseded for the state, but it keeps the
arithmetic arc, §3 WHAT IS LEFT
(the HORIZONTAL is now the head of the table and §3.1 has both the measurement and the
probe), §5 THE HARNESS and §6 the rules. `Docs/HANDOFF-2026-08-11b.md` has the session
prompt. Then `Docs/CHECKPOINT-2026-08-11.md` — superseded for the state, but it keeps the
twenty-seven landings and §3's negative result, whose central claim about a beamed stem is
corrected in `-08-11b` §2. `Docs/HANDOFF-2026-08-11.md` has that session's prompt.
Then `Docs/CHECKPOINT-2026-08-10d.md` — the state and WHAT IS LEFT, whose item 1 is
THE UNIT FLIP and is half-built. `Docs/HANDOFF-2026-08-10d.md` has the session prompt, the
baseline RATIO script the flip is discovered with, and the DOM-contract probe.
Then `Docs/CHECKPOINT-2026-08-10c.md` — superseded for the state, but it keeps THE HARNESS
(§1), the height's three-way split (§2), the forty-one landings of the SVG-frame arc (§3)
and **§5, v1's answer to the round trip**, which is the argument the flip rests on. Its
own item 1 — the ledger, the decoration and the lyric — is CLOSED.
`Docs/HANDOFF-2026-08-10c.md` has the session prompt and both probe recipes. Then read `Docs/CHECKPOINT-2026-08-10b.md` — the state and WHAT IS LEFT, with the height
named as the one thing that unblocks the rest. `Docs/HANDOFF-2026-08-10b.md` has the
session prompt and the masked-height probe.
`Docs/CHECKPOINT-2026-08-10.md` is superseded for the state; its **§4 IS CLOSED** and
`-08-10b.md`'s §3 records both the fix and why its earlier attempt moved nothing.
`Docs/CHECKPOINT-2026-08-09b.md` is superseded for the state but keeps the count-in ladder,
the chord grid, `setTiming`, the third audio surface and the decoration-x finding.
Then read `Docs/CHECKPOINT-2026-08-09b.md` — the state, the count-in ladder, the chord
grid, **the decoration-x finding**, and **WHAT IS LEFT**.
`Docs/HANDOFF-2026-08-09b.md` has the session prompt.
`Docs/CHECKPOINT-2026-08-09.md` is superseded for the state but keeps the tempo gate, the
byte-exact MIDI file, and **the audit of abcjs's own test suite classified by ASSERTION
TARGET**, which is still the work list for what is left. `Docs/CHECKPOINT-2026-08-08e.md` is
superseded for the state but keeps the audio arc's THIRTEEN FINDINGS and **the accent**.
`Docs/CHECKPOINT-2026-08-08d.md` is superseded for the state but keeps the 6.7.0 flip and
**the terms the optimisation pass must be held to**, which is the live phase — read it
rather than re-deriving it. `Docs/HANDOFF-2026-08-08d.md` has that session's prompt.
`Docs/CHECKPOINT-2026-08-08c.md` keeps the audio arc's first findings.
Then `Docs/HANDOFF-2026-08-08c.md` for the session prompt, and
`Docs/CHECKPOINT-2026-08-08b.md` for findings 147-150 and the geometric tail, which is
CLOSED. `Docs/CHECKPOINT-2026-08-08.md` keeps the ARC DECISION.
`Docs/CHECKPOINT-2026-08-07b.md` is superseded for the state but keeps findings 134-146.
`Docs/CHECKPOINT-2026-08-07.md` is
superseded for the state but keeps findings 125-133 and **THE GATE WAS READING 29 OF THE 41
FIXTURES**, which is the section that made 2026-08-07b possible. `Docs/CHECKPOINT-2026-08-06b.md` is superseded for the state but keeps findings 106-124 and
**THE GATES CANNOT SEE WHAT IS LEFT** — read that section knowing its central claim was
answered by widening a gate, not by working around it. `Docs/CHECKPOINT-2026-08-06.md` is
superseded for the state but keeps findings 104-105 and **THE HARNESS: how to instrument
abcjs in a scratchpad copy**, which is still the first tool to reach for.
`Docs/CHECKPOINT-2026-08-05c.md` is superseded for the state but keeps findings 90-103 and
**the `ENGRAVE` TRIAGE TABLE**. `Docs/CHECKPOINT-2026-08-05b.md` is
superseded for the state but keeps findings 71-89 and Lance's question in full;
`Docs/CHECKPOINT-2026-08-05.md` keeps the line-weight audit finding and the
golden-variables map. Then
`Docs/CHECKPOINT-2026-08-04c.md` — it is the current state of play, findings
51-64, THE METHOD that produced them, and what is left. `Docs/CHECKPOINT-2026-08-04b.md`
holds findings 41-50, `Docs/CHECKPOINT-2026-08-04.md` the expensive lesson about "golden
limitations", and **`Docs/CHECKPOINT-2026-08-03d.md` is the FINDINGS LEDGER, 16-40** —
every rule with its abcjs citation and its measured number. Read them when you need the WHY
of a specific behaviour. `Docs/HANDOFF-2026-08-05.md` has the session prompt.
(`CHECKPOINT-2026-08-03c.md` holds the accidental columns,
the notehead rod, the multi-measure rest and `%%gchordfont`;
`CHECKPOINT-2026-08-03b.md` holds the lyric-ink fix, the
tempo note, the two beam divergences and the ragtime verdict; `CHECKPOINT-2026-08-03.md` is
superseded but remains the
record of the declared-box list, the two corpora and the four gate artefacts; TWO of its
statements are corrected in `-08-03b`. `CHECKPOINT-2026-08-02d.md`, `CHECKPOINT-2026-08-02c.md`, `CHECKPOINT-2026-08-02b.md`, `CHECKPOINT-2026-08-02.md`,
`CHECKPOINT-2026-08-01.md`, `CHECKPOINT-2026-07-24.md`, `-07-22c.md`, `CHECKPOINT-2026-07-22b.md`, `-07-21.md`, `-07-19.md` and
`CHECKPOINT-2026-07-23.md`, `-07-18.md` are superseded but remain the record of the parser phase, the renderer's first
slices, how the last parser diffs closed, and the geometric work up to the voice-name and
`%%staffsep` fixes.) Then read ARCHITECTURE.md in full. It is your
specification, decision record, and setup guide. Do not make
architectural decisions that contradict it without flagging them
explicitly and getting confirmation from Lance.

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
- **standard**  — bugs fixed, clean pipeline, derived from abcMusicKit2
- **extended**  — parity+ features via render profile, derived from abcMusicKit2

## Key Files and Paths
- `ARCHITECTURE.md`   — full specification and decision record (read first)
- `abcts.config.json` — corpus and goldens paths
- `../abcMusicKit/Tools/abcjs-debug/fixtures/` — 41 `.abc` corpus fixtures
- `../abcMusicKit/Tools/abcjs-debug/golden/`   — abcjs goldens: 41 `.parse.json` (parser gate) +
  41 `.elements.json` (renderer gate — laid-out elements) + 379 SVGs (**pixel-parity gate** — no longer unused, and there are 379 not 503)
- `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/` — vendored abcjs source. The ONLY
  thing left under `Docs/References/`; it stayed because the `.abcjsStrict` porting rules
  cite it by path. Everything else there moved to abcDocs on 2026-07-20.
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

Nothing from `../abcMusicKit` is committed here: the corpus, the goldens and the vendored
abcjs source are all reached by sibling path and stay in that repo. Keep it that way — a
backup remote is not a licence to vendor someone else's tree into this one.

## Current phase
**AUDIO IS BYTE-EQUAL AND THE SVG IS THE ARC.** 1275/1276, and **the ONE red is NOT OURS** —
`content-parity`'s `S7-voices` is an uncommitted edit to a fixture in `../abcMusicKit` whose
goldens were not regenerated (`CHECKPOINT-2026-08-12.md` §5). Read that before you conclude
anything from a suite run.

**seventeen gates and NINE ranked tables** — 0 of 72 audio cases, 0 of 38 note timings,
0 of 23 chord grids, 0 of 3 MIDI files, 0 of 174 harvested fixtures, 0 of 120 pixel targets,
**1 of 13 element timings** (abcjs being idiosyncratic rather than us being wrong), and
**1 of 25 DOM-contract cases with TWENTY-FOUR slugs RATCHETED** — and
**26 of 171 SVG-byte fixtures, ONE HUNDRED AND FORTY-FIVE of them EXACT and ALL 145
RATCHETED** — 13 STRUCTURAL and 13 ULP — and **the SVG BYTE TABLE is THE ONE OPEN GATE**, at best 200613 — mostly
STRUCTURAL now, classified by aligning on the
first differing character (a cruder test sends you at the wrong family). **The next three
are named and measured in `CHECKPOINT-2026-08-12.md` §3**: the FORCED STEM being per LINE
rather than per voice (abcjs's own three voice streams printed); the lyric lane's per-VOICE
`diff`, without which spending the measured lane costs three fixtures 18.84px each — measured
twice, so do not re-try it bare; and `Measure.meterChange` being SINGULAR, so three `[M:]`
in one bar draw one. **THE ARITHMETIC
ARC HAS DONE ITS WORK ON BOTH AXES** — the layout holds abcjs's pitches end to end, the line
solve iterates on abcjs's own `spacing`, and elements are PLACED on the solved x rather than
shifted onto it — so the two ULP families are down to **62 glyph-y tokens across 10 fixtures
and 36 glyph-x across 13**, from 265 across 33 mid-session. **THE STRUCTURAL ROWS ARE NOW
THE MAJORITY OF THE TABLE** and are where a session buys the most; both remaining ULP
threads are named and measured in `CHECKPOINT-2026-08-11b.md` §3.1 (the TEMPO NOTEHEAD, which
is PLACE-DON'T-SHIFT one axis over, and `visual-transpose-03`'s last token). The structural
thirty-two are listed with citations in
`CHECKPOINT-2026-08-11.md` §4.2 — five of its rows closed on 2026-08-11b — and the largest
single one left is the BRACE's own shape, which
abcjs draws AFTER its own staff's lines and builds from `curvyPath` arithmetic rather than
from a glyph. The oracle lands before the
implementation here, as it did for audio and the chord grid, and a table that opens at every
case is the same signal 54 of 54 was. **No table can name a defect, and that is the normal condition here rather than a
milestone** — the last four findings all came from building a gate that expresses an axis
none of the others can, or from rendering a control abcjs's own suite does not contain.

FOUR of the eleven gates are LADDERS OF CONTROLS rather than corpora, and each had to be
built before its defects could be stated: `tests/above-lane-order.test.ts` (12 tunes, one
per PAIR of above lanes), `tests/glyph-ycorr.test.ts` (20 tunes, one per GLYPH),
`tests/tempo-parts.test.ts` (8 tunes, one per `Q:` beat unit — it measures WHICH GLYPHS a
mark is made of, because abcjs classes only `abcjs-notehead` and its TEMPO notehead is not
one) and `tests/decoration-x.test.ts` (20 rungs on the HORIZONTAL axis, which no table
could express at all). Nothing in either corpus exercises what any of them covers.

**SO NO GATE CAN NAME THE NEXT DEFECT.** That has happened twice on this branch and the
answer both times was to BUILD ONE that expresses an axis none of the others can. The two
oracles still unharvested are named in `CHECKPOINT-2026-08-08e.md`'s WHAT IS LEFT:
`timing.test.js`'s `setTiming`, which gates the audio↔geometry JOIN, and `midi.test.js`'s
MIDI FILE writer.

**Every structural gate is at 100% with zero recorded divergences** — content, lyrics,
beams, structure, source offsets. The work is now entirely GEOMETRIC and entirely
strict-mode, and it is being driven off the HARVESTED corpus's ranked table rather than the
41 fixtures: the 41 were all chosen by the people who wrote the engine, and every defect
found since 2026-08-03 came off the other 174.
The remaining causes are named in the checkpoint's priority list.
It is NOT a skyline: abcjs places most out-of-staff text at fixed distances from the staff,
a finding that killed a skyline port — measure its OUTPUT before porting its SOURCE. It is
not a flat lane model either: chord symbols, part labels and tempo marks STACK on the
music's ink (see the checkpoint). Both facts were measured from its output, not read.
NOTE the metric was corrected on 2026-07-22 and earlier figures are not comparable: the
gate had been comparing abcjs's outline START against our glyph ORIGIN, a 4px bias.


**Structural parity is done: note content, lyrics, beams and render structure are all
41/41 with zero recorded divergences.** `main` is **891/891 with NO reds**, and
**BOTH ranked tables are EMPTY** — 0 of 119 pixel targets and 0 of 174 harvested fixtures off
any axis by 0.05px or more. `ragtime-nightingale` — 2009 noteheads, the corpus's largest
fixture — is EXACT on all four. **So no gate can name the next defect** — and when that happened the answer
was to BUILD ONE: `draws its staff lines the length abcjs draws them` measures an axis
nothing could express, opened with TWENTY targets where the handoff had recorded one, and
nineteen closed on a single line. The two errors had been CANCELLING on 21 of the 41
fixtures, which is why no number ever moved. **When every gate is quiet, ask what none of
them can represent.** What is left is measured and named in the handoff: an ABOVE dynamic
drawn at a fixed step (its staff extent exact, its own y ~29px out and clipped off the page)
and 0.26px of one staff line.
pushed, and the AUDIT FINDING IS CLOSED — no Bravura figure is reachable in strict. The
harvested corpus is **10 of 174 off some axis**, from 34 at the start of 2026-08-05, with
**nothing above 0.93px** and every measurable fixture inside one pixel. Two ceilings are
raised, both recorded in the
test: `ragtime-nightingale`'s `dy` at 0.40, and the repeat ending's bracket PITCH at 0.50 —
which is the staff ink top rather than anything the ending does.

The work is now GEOMETRIC — does abcts put the ink where abcjs puts it. A pixel-parity
gate (`tests/pixel-parity.test.ts`) resolves both engines' SVG to absolute pixels and
measures it. Noteheads match 2696/2696, systems 29/29, output is 0.34x abcjs's bytes.

**The VERTICAL arc is DONE and MERGED** — `main` is green at 505/505, all 29 pixel-gated
fixtures within their ceilings, ceilings re-recorded. Branch vs the old main: fixtures within
ceiling 25/29 → **29/29**, noteheads within 25px 21/29 → **27/29**, corpus median 17.4px →
**14.7px**.

**The HORIZONTAL arc is CLOSED** on `geometry/horizontal`, which is GREEN at 505/505 —
pixel-parity gate included, ceilings re-recorded. The timeline is per LINE, as abcjs's
`layoutStaffGroup` is: no columns, no per-measure reconciliation, barlines unaligned across
voices because they are ordinary zero-duration elements on one timeline.

**The VERTICAL arc is CLOSED AND MERGED** — it went to `main` on 2026-08-08 at 891/891 with
both ranked tables empty, and work continues on the MAINLINE. `geometry/vertical` is kept as
the rollback point.
`Docs/CHECKPOINT-2026-08-04.md` is the state; `Docs/VERTICAL-ARC.md` is the arc's original
spec and its numbers are long superseded.

**24 of 29 fixtures are at ZERO on all four axes**, and the harvested corpus is at
**140 / 153 / 165 / 172 of 174** within 0.05 / 1 / 5 / 25px — 34 of 174 still off some axis,
from 60 at the start of 2026-08-04. The suite is **691/692**, and the ONE red is
`ragtime-nightingale`'s `oy` at 0.656 against an unraised 0.59, down from 1.58. **THERE ARE
NO GOLDEN-GENERATOR LIMITATIONS LEFT**: all four that were filed as such are closed — two
were our own grace EMISSION ORDER, one the generator's text metrics (finding 41), and the
fourth was abcjs never applying a glyph's SCALE at draw time (finding 62). Nothing above
17px is left on the ranked table, and the only item above 10 is a FEATURE.

`frere-jacques` is CLOSED vertically (dy 0.03, oy −0.02) and was never the "source-line-wrap
model conflict" it was filed as for two weeks.

THE IDEA THAT EXPLAINS MOST OF IT: **abcjs does not measure what it draws — it DECLARES a
box and reserves that.** Notehead (`pitch ± 2.0888/2`, NOT ± 1), accidental, clef, key and
time signature, tempo, tuplet, dynamic, decoration and tie all reserve declared figures,
and a BEAM reserves nothing at all. The clef is what sets a staff's top on a plain tune,
not the stems.

**AND `%%vocalfont` IS THE CASE THAT PROVES IT.** That row of the table read "parsed, NOT
realized (abcjs never reads it)" until 2026-08-05, with a test asserting it. It came from
reading the source — "abcjs stamps `el.fonts` and reads `.fonts` nowhere in its write
phase" — and abcjs's own SVG denies it in one attribute: the same tune draws its lyric at
`font-size="17"` with no directive, `13` under `%%vocalfont Helvetica 10.0`, `27` under
`20.0`. What made the wrong reading survive is that its granularity is the music LINE, so a
fixture whose music all precedes its directives — Gonzato's, the one the test used — draws
every syllable at the default and looks like proof.

**AND MEASURE THE OUTPUT — the source will lie to you.** Its sharper form, which cost a
whole session: **A COUNT YOU CANNOT RE-DERIVE FROM THE OUTPUT IS NOT A MEASUREMENT.** And
watch what the gate CANNOT see — abcjs classes only noteheads, ledgers, stems and the top
staff line, so beams, tempo notes, ties and bar numbers are invisible to a class-based
comparison, which is how a missing tempo note sat under a green gate.

Three times on this branch a careful chain of source reads predicted something abcjs's own
SVG denies, and a grep of the golden settled each in seconds. Read the source to find the
MECHANISM; read the output to find the NUMBER. An extent difference names a STAFF, not a
mechanism. And ask whether the quantity is MEASURED TWICE: the lyric-reserve bug was one
number computed in two places whose inputs had drifted apart, with the formula never wrong.

Two questions go with it, and both cost a run before they were asked. **WHOSE box is it** —
a volta belongs to the first voice of the first staff, not to every voice carrying the
`|1`. **WHEN is it applied** — a tuplet's box is INK and the lanes stack on it; a tie's
`getYBounds` box comes AFTER the lanes and only pushes their result. The same box in the
wrong phase is a different number. And one element can reserve TWICE with different
figures: a tie declares ±4 pitch in `setEndAnchor` and a 3-pitch box in `getYBounds`.

**A PASSING GATE IS NOT PARITY.** The gate asserts "no worse than recorded". Parity means
dy/dx/oy/ox at ZERO on every fixture.

**A FIXTURE'S GATE ASSERTIONS SHORT-CIRCUIT, so a failing axis HIDES the ones after it.**
Two stale ceilings surfaced only once the check ahead of them started passing, and
`frere-jacques`'s `oy` is still hidden that way. When a fixture goes green, re-read the
axes behind the one you fixed rather than assuming they were passing.

**TWO CORPORA NOW.** The 41 fixtures in `../abcMusicKit/Tools/abcjs-debug/` are the
original gate; `tests/corpus-abcjs/` holds **174 tunes harvested from abcjs's own test
suite**, with goldens generated by running abcjs (`npm run harvest`, `npm run
harvest:goldens`). abcjs's ASSERTIONS are not ported — they read its internal `visualObj`
tree, which compat does not reproduce — only its inputs.

It immediately found a whole feature that was parsed and never painted: **`&` overlay
voices**. Nothing in the 41 uses `&`, so 505 tests went green over it for weeks. A GATE IS
ONLY AS BROAD AS ITS INPUTS, and ours had all been chosen by the same people who wrote the
engine.

It has kept doing it — `clef=none` and `clef=perc` read as a C clef, `%%text` reserving
nothing, `V:… merge` unimplemented, `bass,,` parsed as no clef, an empty implicit voice
taking a staff, and both line-assignment rules were all found there, and only one of them
is exercised by any of the 41. **START EVERY SESSION WITH BOTH TABLES —
`npx vitest run tests/pixel-parity.test.ts && cat /tmp/abcts-pixel-ranked.txt` and
`npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`** — that table, not the aggregate counts, is what
names the next defect, and its DIRECTIVES column is what makes it actionable.

**AND THE ALGORITHM IS IN ABCJS.** Read the named function, then finish with a probe: four
of one session's nine fixes were ports of one (`merge`'s staff assignment, `getClef`'s
prefix match, `setCurrentVoice`'s line scan, the backslash preprocessing) and none could
have been guessed from a diff — but one rule is not in the source at all and took
instrumenting to see.

**A DECORATION IS STACKED BY ITS OWN GLYPH HEIGHT AND CENTRED ON THE RUNNING CURSOR** —
`height = symbolHeightInPitches(symbol) + 1`, `y = cursor + height / 2`, `cursor += height`
(`creation/decoration.js:154-165`). Ported. **AND ONE WRITTEN BEFORE A BARLINE ATTACHES TO
THE BARLINE**, at a fixed pitch 12 (`abstract-engraver.js:1002`) — not to the next note.

**THE GATE PAIRS THE i-TH NOTEHEAD OF EACH ENGINE, so a difference in EMISSION ORDER reads
as a position error — AND THAT ORDER WAS OURS TO FIX.** For two days `ragtime-nightingale`'s
dy 58.1 and `vree-grace-notes`' dy 11.6 / dx 32.5 were filed as unchaseable artefacts, with
the note "abcjs emits a graced note's MAIN head before its graces where we emit them after;
sorted by x, dy is 0.02 and dx a uniform 1.99". Every word of that was right except the
conclusion: emitting them in abcjs's order took ragtime to dy 1.12 / dx 18.30 and
`vree-grace-notes` to dy 0.02 / dx 1.99. **"The gate cannot see this" and "the golden is
wrong" are different claims, and the second needs the golden opened.**

**AND THERE ARE NO "GOLDEN LIMITATIONS" — THE GOLDENS ARE THE TARGET, and all four are now
closed.** Two were our own grace emission order; the other two were the generator's TEXT
METRICS, and `calcWidth` is PORTED (`src/renderer/golden-widths.ts`): five ASCII
per-character tables picked by SIZE alone, three of the six brackets resolving to
`repeatfont` because their key does not exist, a flat **8** for every character outside them,
and `getBBox` counting a chord's NESTED tspans as separate lines. `abcMusicKit` v1 —
production, byte-identical to these goldens — reproduces the fallback ON PURPOSE. Strict
measures with the golden's tables; `abc2.1`/`extended` keep the real per-em ones, gated at
one place.

**A LADDER OF CONTROL TUNES, THEN THE NAMED FUNCTION, THEN A PROBE.** Ten more rules landed
on 2026-08-04 and not one came off a diff. Four or five tunes in `/tmp/abcts-probe/`, each
one FEATURE longer than the last, and the rung where the number appears names the
INTERACTION rather than the feature: `"D7"…|1…` needed five rungs to say "a chord AND an
ending", which is a BRANCH in `set-upper-and-lower-elements.js` and invisible in either
feature alone.

**THE GOLDEN VARIABLES ARE IN `src/renderer/abcjs-constants.ts`**, grouped by the unit
abcjs states each in — `ABCJS_PX`, `ABCJS_PITCH`, `ABCJS_RATIO` — with the unit system and
its converters beside them. Anything NOT in that file is OUR engraving judgement and may be
changed on its merits; a golden variable may only change if abcjs changes. `chordHeightAbove`
is 4.78 PITCH, 2.39 spaces and 18.52px, and only one of those is right in any expression.

**AND THE NEAR-MISSES WERE EMISSION, NOT ARITHMETIC.** Measured: raise the emission quantum
and the residual collapses from 5.1e-3px to 1.5e-4 and stops — so our internal values agree
with abcjs's to 1e-8 and there is no order-of-operations difference to hunt. What differs is
WHERE the quantum is spent: abcjs writes one absolute pixel per element, we write a nested
chain of four rounded numbers whose errors add. A glyph SCALE is a ratio, not a coordinate —
rounding `1/7.75` to `0.129` was a relative error over a whole outline.

**PORT THE STRUCTURE, THEN THE CONSTANTS.** The costly divergences have all been
architectural, not numeric; see the checkpoint's opening section before starting anything.

The `.elements.json` goldens carry `staffs[].top/.bottom` and `specialY` — abcjs's own
answer to how much room a staff takes. Replicating `setUpperAndLowerElements` over them
reproduces its SVG exactly on nine fixtures, and is the fastest way to test any vertical
hypothesis. But `dump-elements.js` and `dump-svg.js` measure multi-line text differently;
where they disagree, the SVG is the gate. A single aggregate number still cannot tell
interacting terms apart, and the notehead median cannot see the vertical question at all —
use `tests/staff-spacing.test.ts`.

Renders staff, all clefs, key signatures, meters, tempo marks, part labels, noteheads and
chords with stems and ledger lines, accidentals, rests and barlines, grace notes, chord
symbols, the full decoration set, lyrics, slurs and ties, tuplets, voltas, annotations,
styled noteheads, hairpins and glissandi, melisma extenders, mid-tune key changes, and
`%%score` staff grouping with braces and brackets.

Two features are MODE-SPLIT, and the split is the point — strict is faithful to abcjs,
the other modes are correct:

| | `abcjs-strict` | `abc2.1` / `extended` |
|---|---|---|
| Melisma | prints abcjs's literal `_` | suppresses it, strokes an extender |
| Three-quarter tones | draws NOTHING, as abcjs does | draws the three-quarter glyph |
| `%%vocalfont` | realized, per music LINE (abcjs's staff granularity) | realized, per lyric SEGMENT |
| `+:` in a lyric continuation | abcjs's leak, reproduced | ABC 2.1 semantics |
| `<defs>`/`<use>` | off, so markup stays abcjs-shaped | on, 0.34x the bytes |

THREE GATES, complementary — **pixel parity** catches DIFFERENT-ON-SCREEN (vs abcjs's own
SVG, glyph outlines excepted), structure catches WRONG (vs abcjs's laid-out elements),
baselines catch CHANGED (vs committed geometry). Re-record with `npm run baseline`, but
READ the diff and commit baselines with the code change.

> 🔀 **THE TARGET IS abcjs 6.7.0 AS OF 2026-08-08** (Lance's authorisation, the same day).
> 6.7.0 shipped while this arc was running and another agent regenerated the sibling
> corpus's 505 goldens from it mid-session; the in-repo 174-fixture corpus was then
> regenerated too, `abcts.config.json`'s `abcjsRef` moved, and the engine was brought onto
> it. **The whole geometric difference between 6.6.3 and 6.7.0 was ONE BRANCH** —
> `draw.js` now moves down by `spacing.staffSeparation` (61.33px) when a non-music line
> precedes the first staff, which is a `%%text`/`%%begintext` block OR a second `T:`. Every
> one of the 13 fixtures that moved did so by exactly `oy = -61.33` with `dy`, `dx` and
> `ox` at 0.00. Two smaller things came with it: `!class=name!` is `el.extraClass` and NOT
> a decoration (`abc_parse_music.js:229`), and `flattener.test.js` plus
> `creation/glyphs.js` are BYTE-IDENTICAL between the versions — so the audio oracle and
> both glyph tables needed no regeneration at all. `abcjs-6.6.3` is still vendored beside
> `6.7.0` and the sibling `dump-svg.js` takes `ABCJS_VERSION`, which is how the two were
> measured against each other.

> 🎯 **THE GOAL, IN LANCE'S WORDS (2026-08-09b): abcts exists to build an abcjs-modern whose
> output — the SVG FILE and the AUDIO — is 100% BYTE-EQUAL to abcjs 6.7.0.** A tolerance is
> therefore not a compromise to be balanced against effort; it is a defect that has not been
> written down yet. Anything we decline to reproduce goes in `Docs/ABCJS-DIFFERENCES.md`
> with its evidence, and its slug goes in `svg-bytes.test.ts`'s `DIVERGENT` list — a slug
> there without an entry in the doc is a tolerance wearing a disguise.
>
> **AUDIO IS THERE**: the MIDI file is byte-exact (0 of 3), the event list 0 of 72, the
> timings 0 of 38. **THE SVG IS THE OPEN ARC**: `tests/svg-bytes.test.ts` is the only gate
> in this repo with NO tolerance, and it exists because the others each declare what they
> ignore — notehead centres, 0.05px, classed ancestors — and TOGETHER THEY LET A MARKUP
> DIFFERENCE LIVE FOREVER. A `<rect>` where abcjs writes a `<path>` moves nothing; a
> `<g transform>` where abcjs writes absolute coordinates moves nothing; an attribute in a
> different order moves nothing. The root element is now byte-identical on all 171 fixtures
> and the FIRST difference is one attribute, the same one on every row: **the `viewBox`**.
> abcjs draws in ABSOLUTE PIXELS and writes none; we draw in STAFF SPACES and let the
> viewBox convert, so it is the SYMPTOM rather than the difference. Removing it alone took
> 196 tests red — `tests/pixel-geometry.ts` reads it and every geometry gate is built on
> that — so absolute pixels throughout is the next arc, and the two go together.

## Parity targets, by mode
`abcjs-strict` is measured against **abcjs 6.7.0 itself** — its parse trees, element dumps
and SVG goldens. 100% is the bar; a divergence is a defect, not a tolerance. It was 6.6.3
until 2026-08-08; every citation written before that date names a 6.6.3 line number, and
the two trees are both vendored, so a stale citation can be checked rather than guessed at.

`abc2.1` and `extended` are measured against the OTHER engines, since abcjs is wrong or
absent for much of what they cover. Golden sets exist in `../abcMusicKit` (v1),
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
> anyone reaches for it — and **nothing there may be touched while `svg-bytes` is open.**

`Docs/ABCJS-DIFFERENCES.md` is the verified list of abcjs bugs and gaps that strict
reproduces and the other modes fix. It is public-facing — every entry must cite how it was
checked, and anything read from abcjs's source rather than measured from its output says
so. Three entries were originally written from a plausible reading of its parser and were
wrong.

## Modes — abcjs-strict is the DEFAULT
`abcjs-strict` (reproduce abcjs, bugs included) | `abc2.1` (standard read correctly) |
`extended`. `parse(abc, { mode })` and `render(score, { mode })`. Strict is default
because a replacement whose default output differs from what it replaces is not one.
`abcts/compat` gives abcjs's `renderAbc` signature, classes and density for a drop-in.

## Running it
`abcts tune.abc` (CLI, after `npm run build`) renders to stdout or a file.
`npm run compare` puts abcts and the abcjs goldens side by side — or overlaid, cyan over
magenta, the way abcMusicKitWorkbench compares v1. The overlay is only a true match test
for a byte-parity engine; core renders in its own style, so side by side is the default.

## Measuring progress
`npm run parity` prints every parity axis in one view. Note that abcjs parity and
abcMusicKit v1 parity are NOT separate axes: v1 is a port of abcjs whose abcjsStrict
output is byte-identical to it (verified by diffing v1's CLI output against the goldens),
so the abcjs goldens are v1's shared surface. v1's extended-mode features are a
feature-coverage gap, tracked separately and implemented not at all.

## Session Prompts

### Continuing mid-project
```
We are continuing abcts development in the abcts repo (Code/abcts).

Read Docs/CHECKPOINT-2026-08-06b.md first — the state, findings 106-124, and above
all THE GATES CANNOT SEE WHAT IS LEFT; its "WHAT IS LEFT" is your job. Then
Docs/HANDOFF-2026-08-06b.md, then -08-06.md for THE HARNESS, -08-05c.md (90-103
and the ENGRAVE triage table), -08-05b.md (71-89), -08-05.md, -08-04c.md (51-70
and the ladder method), -08-04b.md (41-50), -08-03d.md (16-40), ARCHITECTURE.md,
this file.

READ ABCJS'S CODE. IT HAS THE ANSWERS. Lance has said it twice; the second time
cost a revert and a wasted implementation of a guess. Port its STRUCTURE, then its
constants.

AND NO GATE CAN NAME THE NEXT DEFECT ANY MORE — the harvested table is empty and
36 of the 41 are at exact zero. Read abcjs, form ONE hypothesis, and prove it on a
CONTROL TUNE before touching a fixture.

Instrument a SCRATCHPAD COPY of abcjs — never ../abcMusicKit, another agent works
there and it is dirty. Instrument to ANSWER A QUESTION, not to see what happens.

The bar is 100% parity. A passing gate is not parity.

Confirm your lane with `git rev-parse --abbrev-ref HEAD`. It is `main`: the
geometry arc merged on 2026-08-08 and the mainline is GREEN at 891/891.
```

### The open task, specifically
```
Continue geometric parity in Code/abcts.

Read Docs/CHECKPOINT-2026-08-06b.md and Docs/HANDOFF-2026-08-06b.md; -08-06.md has
THE HARNESS and the earlier ledgers are -08-05c.md (90-103), -08-05b.md (71-89),
-08-05.md, -08-04c.md (51-70), -08-04b.md (41-50), -08-03d.md (16-40).

703/703. The harvested table is EMPTY and 36 of the 41 are at EXACT ZERO.

START WITH THE CANCELLATION LINE — pinned by three controls, not ported. abcjs's
own per-line key data:

  [K:C] at the START of a line   l0 Eb  l1 C+nat  l2 C      l3 C
  [K:C] MID-line                 l0 Eb  l1 Eb     l2 C+nat  l3 C
  standalone K:C between lines   l0 Eb  l1 C+nat  l2 C

A [K:] before any music on its line belongs to THAT LINE'S PREFIX, because
startNewLine fires LAZILY — when the first music element is appended. That same
lazy-line mechanism drives the standalone M: and the bar-number transfer. Fold a
change whose keyChangeSourceRange precedes every event of a system-starting
measure into the prefix, and suppress the inline draw.

Then ragtime-nightingale's dx 12.13, whose largest band JUMPS 10.33 between two
adjacent heads (golden x 323.1 and 442.9, the y≈4600 system) — ONE element's
width, not a spread. Then its dy 0.25, the fixed lanes, Gonzato, audio.

The method: read the named function, build a LADDER of control tunes, then probe.
A control tune is the proof, not the fixture.
```
