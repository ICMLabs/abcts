# CHECKPOINT — 2026-08-17

**`engraver.selectables` IS CLOSED — 389 of 389, all four cases ratcheted**, from 158 when
the session opened. `tune.lines` is **255,641 of 255,684 characters** and **290 of 295
tunes exact**, from 250,942 and 185. A new gate, **`metaTextInfo`, opened at 4 of 310 and
closed at 0**. Suite **1803 passing, 2 expected-fail, no reds**.

Every other table is where it was, at zero: `svg-bytes` 0 of 188, `svg-bytes-sibling` 0 of
356 across all five flavours, `strTranspose` 0 of 59, harvested geometry 0 of 177, audio
0 of 72, timings 0 of 38, element timings 0 of 13, chord grids 0 of 23, MIDI 0 of 3, pixel
0 of 120, DOM contract 0 of 25, accessors 2 of 291 (both written down).

---

## 1. THE UNIT WAS ONE PIECE OF PLUMBING AND IT PAID FOUR TIMES

`applyField` already held every field's range; it now reaches `ScoreMetadata.fieldRanges` /
`titleRanges`, the compat tune object's `metaTextInfo`, `FreeTextBlock.sourceRange`, and the
`startChar`/`endChar` of every selectable text row. That is the chain the handoff predicted
and it held: `TopText` builds each row with `info: metaTextInfo.<field>` and `nonMusic` hands
that `info` straight to `wrapSvgEl` (`draw/non-music.js:24-30`).

**THE GATE LANDED BEFORE THE CODE**, as it did for audio and the chord grid: 312 tunes and
310 field positions harvested by RUNNING abcjs 6.7.0 (`scripts/harvest-abcjs-metatextinfo.mjs`
→ `tests/corpus-metatextinfo/golden.json`, `tests/metatextinfo.test.ts`). abcjs's own suite
asserts this nowhere at all. It opened at 4 of 310 and named three defects, two of them
rules that reach far past it:

- **THE TRAILING-WHITESPACE STRIP IS UNCONDITIONAL.** `line.replace(/\s+$/, '')` is its own
  statement after the comment cut, not part of that branch (`abc_parse.js:408-411`). We ran
  it only when a `%` was found, so `T:20. Subtitles, The ` gave `title` 4…25 against abcjs's
  4…24. It is the `end` **every field and every music element** takes its offsets from — and
  it is the same rule that later closed the last element of a line (§3).
- **A `%%` DIRECTIVE'S SPAN IS THE LINE WITHOUT ITS `%%`** — `iChar + str.length` where
  `str` is `addDirective`'s argument, `line.substring(2)` (`abc_parse.js:403`). So `%%header`
  starts at the first `%` and ends two characters SHORT of the line's end.
- `G:`, `%%header` and `%%footer` are POSITIONS WITH NO TEXT here. abcjs records all three;
  `G:` is read by neither `TopText` nor `BottomText` and the running head is print-only and
  unbuilt. `metaTextInfo` is about the position, so the position is answered and the gap is
  written down rather than faked.

---

## 2. THE SELECTABLES CLOSED, AND THE ORDER WAS THE HARD PART

### 2.1 The ten text rows

`PlacedText.selectable` is abcjs's `row.absElemType` with the `abcelem` it is wrapped with,
and the emitter writes `selectable`/`tabindex`/`data-index` on whatever `renderText`
returned. Four rules, each of which decides a field:

- **A RICH ROW IS NOT SELECTABLE AT ALL.** `richText`'s ARRAY branch pushes its phrases with
  no `absElemType` (`rich-text.js:18-28`) where its string branch passes one through, so a
  title that changed font mid-line draws and cannot be clicked.
- **THE ATTRIBUTES GO ON WHATEVER `renderText` RETURNED** — the GROUP for a boxed row, which
  is why `partOrder`'s golden entry carries no `x` where every other text row does.
  `%%partsfont box` is what makes that the row to notice it on.
- **ABSENT IS NOT `-2`.** `addTextIf` defaults a missing `info` to `{-2, -2}`
  (`add-text-if.js:8`), but `Subtitle` and `FreeText` read `info.startChar` off the line
  object with no default (`subtitle.js:7`, `free-text.js:11`) — and `addCentered` pushes no
  span at all (`tune-builder.js:318-320`), so a `%%center` genuinely has no `startChar` KEY.
- **THE COMPOSER'S RANGE, EVEN WHEN THE ROW IS THE `O:`'s TEXT** — `TopText` builds one
  `composerLine` from both and hands it `info: metaTextInfo.composer` (`top-text.js:64`).

And for the bottom block:

- **A `W:` VERSE IS ONE SELECTABLE, TAKEN AT THE GROUP'S CLOSE.** `addMultiLine`'s array
  branch hands its rows `{anchor: 'start'}` and nothing else (`bottom-text.js:57`) and closes
  with `{endGroup, absElemType, startChar: -1, endChar: -1}` (`:61`), which `nonMusic` wraps
  around the CLOSED `<g>` with an EMPTY text. Three lines of `W:` are ONE entry.
- **AND ITS INDEX IS ALLOCATED WHERE THE `</g>` IS WRITTEN**, ahead of the `extraText` rows
  that follow it — which is what abcjs's own array order says. The emitter builds markup in
  one pass and groups in a second, so the close is taken on the pass that can see draw order
  and its attributes are stashed for the pass that writes the tag.
- **`-1` AND `-2` ARE DIFFERENT ANSWERS**: `-1` is written into the `endGroup` row by hand,
  `-2` is `addTextIf`'s default. The joined `H:` text is the join BEFORE `renderText`'s
  blank-line rewrite, which runs at draw time on a string the row already holds.

### 2.2 The other five sites, and the ordering trap

- **A KERNED `mp` IS TWO GLYPHS AND ONE SELECTABLE**, wrapped on the `<g data-name="dynamics">`
  `drawDynamics` returns; a single-letter mark is wrapped on its `<path>`.
- **A HAIRPIN CARRIES NO `decoration` KEY AT ALL.** `drawCrescendo` writes the three fields
  and stops (`draw/crescendo.js:21`) where `drawDynamics` adds `params.dec`
  (`draw/dynamics.js:16`). The golden shows the two side by side, so the ABSENCE is the
  contract and not an omission.
- **EVERY CURVE IS `el_type: "slur"`, WHATEVER IT DRAWS** (`draw/tie.js:28`), and its span
  runs ANCHOR ELEMENT to ANCHOR ELEMENT, one character OUTSIDE each — "we assume that the
  parenthesis are just to the outside of that". **BOTH ENDS ARE `-1` FOR A TIE**, and `isTie`
  is recomputed at draw time, which is what `PlacedCurve.kind` already holds. The ELEMENTS
  travel on the record rather than the numbers, because only the projection knows a note's
  span.
- **`wrapSvgEl` TAKES WHATEVER THE DRAW FUNCTION RETURNED** — a brace's GROUP when it owns a
  voice name and its PATH when it does not; an ending's and a triplet's closed group; a voice
  name's bare `<text>`, which is the one MUSIC text that is wrapped at all.

⚠️ **AND THE `otherchildren` RUN IS SORTED AFTER IT IS BUILT, SO ITS INDICES CANNOT BE
ALLOCATED WHILE IT IS.** Each entry carries the record it wants and a SLOT (`SEL_SLOT`) in
its markup; the indices are handed out once the run is in draw order. Getting this wrong
would have mis-numbered nine dynamics, six curves, an ending and a triplet **while every
count looked right**.

### 2.3 ONE WALK BUILDS BOTH SURFACES NOW

`selectablesOf` consumes the emitter's records instead of walking the layout a second time.
abcjs builds its selectable array inside `draw()`, so the array and `data-index` cannot
disagree; ours had two walks, and the second could not reach a text row, a brace, a voice
name, an ending, a triplet, a curve or a dynamic at all — none of those is in `staff.voices`.
The records ride the eager `toSVG` call the tune object already makes, so nothing is laid out
or rendered twice, and every rule about WHICH elements are selectable now lives once:
`canSelect`, the duplicate-voice suppression (`abstract-engraver.js:150`, `:321-340`) and
"if there was no output, then don't add to the selectables" (`draw/absolute.js:66`).

A `<text>` row hands back its own `x`/`y` and a `<g>` hands back neither — abcjs's `svgEl` is
the live DOM node, so a boxed `partOrder`, a brace and a closed `W:` group carry `data-index`
alone, which its own golden shows.

### 2.4 The last two projection fields

- **`%%barnumbers N` IS A PARSE FIELD.** `bar.barNumber = currBarNumber` is stamped on the
  bar element itself (`abc_parse_music.js:298-303`), so a host reads it off `tune.lines`.
  Ten rows on one field; `Measure.closingBarNumber` already held the value.
- **`|1` IS ONE ELEMENT IN ABCJS AND TWO IN OUR MODEL.** `letter_to_bar` consumes the
  barline, then optional whitespace, an optional `[`, and a token of `1234567890-,` —
  returning nothing when that token is empty or opens with a `-` — and the element spans the
  lot (`:873-887`, `:305`). So the bar carries `startEnding: "1"` and READS PAST the digits.
  **The same finding the chord-grid arc's biggest row was**, one surface over. Its partner:
  **any barline that is not a plain thin `|` ENDS the ending it sits in, and one that opens
  another while one is open ends that one too** — the close is tested BEFORE the open
  (`:271-280`), so `|1 … :|2 … |]` puts `endEnding` on the `:|2` AND on the `|]`.

---

## 3. `tune.lines` — TEN FINDINGS, ALL OUT OF TWO FUNCTIONS

`getCoreNote` and `appendStartingElement`. Read first, measured second, and every one is a
span rule rather than a field:

- **A NOTE READS PAST ITS CLOSING `)` AND ITS TIE `-`.** `case ')'` neither sets `endChar`
  nor returns (`:1077-1081`); `case '-'` sets `state = 'broken_rhythm'` and keeps going
  whenever the note could take one, which in a music line it can (`:1222-1237`).
- **A BROKEN RHYTHM BELONGS TO THE NOTE BEFORE IT** (`:1269-1283`), so `G>F` is `G>` then
  `F`.
- **A MULTI-MEASURE REST CLOSES AT ITS NUMBER** — `state = 'Zduration'` returns without ever
  reaching the whitespace branch (`:1214-1219`), and the test is
  `rest.type.indexOf('multimeasure') >= 0` (`:1168`), not the letter.
- **A DOTTED TIE JOINS THE WHITESPACE RUN** (`:1244-1262`).
- **A LINE'S OWN LEADING WHITESPACE BELONGS TO NOTHING**, and a LINE'S TRAILING WHITESPACE
  IS NOT THERE AT ALL (the unconditional strip from §1).
- **AN INLINE FIELD STOPS THE READING ANYWHERE ON THE LINE, AND ITS OWN ELEMENT KEEPS ITS
  OPENING.** A `[V: …]`, a `[L:1/4]`, an `[I:MIDI …]` and a `[K: style=harmonic]` are none of
  them elements, and abcjs's tokenizer has consumed every one.
- **A STAFF FIELD WRITTEN BEFORE ANY MUSIC ON ITS LINE BELONGS TO THE LINE ABOVE.**
  `appendStartingElement` is a three-way branch (`tune-builder.js:272-295`) and
  `startNewLine` is LAZY, so the push lands on the line above. **THIS CORRECTS 2026-08-16's
  "a standalone `K:` or `M:` line is NOT in the stream"**: that was true only of the case
  measured then, where nothing above it held a note. With no such line the field is genuinely
  absent, which abcjs states as `hasBeginMusic()`.
- **A `K:` NAMING A CLEF APPENDS THE CLEF FIRST AND THEN THE KEY, from the same two
  characters** (`abc_parse_header.js:508-513`), so `getElementFromChar` over `K:C bass`
  answers `clef`. And **a clef is its own element with or without a key beside it**, so
  `[K: treble+8]` puts a CLEF in the stream and no key.
- **A STANDALONE `M:` LINE IS NEVER IN THE STREAM, AND THAT IS A THIRD STATE** rather than
  the negation of inline — an `M:` after a `\` continuation is neither.
  `Measure.meterChangeStandalone`.
- **`%%keywarn 0` SUPPRESSES A STANDALONE `K:`'s ELEMENTS** and leaves a bracketed one alone.

### 3.1 THE THREE TESTS THAT READ `\x12` DO NOT AGREE, AND THAT IS THE RULE

abcjs's preprocessing puts `\x12` where a `\` continuation stood, padding the rest of the
line with SPACES so the character count is unchanged (`abc_parse.js:513-517`), and
`isWhiteSpace` answers TRUE for it (`abc_tokenizer.js:420-422`). Three places read that
character:

| Reader | Test | Result |
|---|---|---|
| the note's whitespace do-while | `isWhiteSpace(c) \|\| c === '-'` | ` e6 \` is ONE span of five |
| its enclosing switch arm | literal `case ' ': case '\t':` | `e2)\` closes at the `)` |
| the CHORD's post-loop switch | literal, with `default: postChordDone` | `[^G^e^c']   \` stops before the `\` |

**The last two are on the same line of the same tune.** Swallowing the continuation
unconditionally took FOUR ratcheted tunes red while the aggregate improved; the second
attempt one more. Both were caught by the ratchet and by nothing else.

### 3.2 AN `&` OVERLAY LAYER IS A VOICE, AND THE TILING IS PER LINE

Measured through abcjs on `synth-flattener-21`: `B4 & d4 & f4 | …` comes back as THREE
`staff[0].voices` entries, each carrying `bar 65…66` and `bar 80…81` — the same spans, drawn
at the same x. `expandOverlays` is the RENDERER's own expansion, reused rather than repeated.

**AND THE TILING IS PER LINE ACROSS EVERY VOICE, BECAUSE READING IS.** abcjs's tokenizer
reads one line top-to-bottom whatever voice each element lands in, so the layer's notes sit
between the main voice's and the barline after them did NOT tile back over them. Per-VOICE
tiling had one barline swallowing a whole overlay. `tile` mutates in place, so the identity
`getElementFromChar` and the selectable array rest on is unchanged.

**AND AN `&` ITSELF BELONGS TO NOTHING** — abcjs appends its `overlay` element at
`startOfLine … startOfLine + 1` rather than at the `&`'s own position (`:314`).

---

## 4. abcjs HAS A DEFAULT STAFFWIDTH AND OURS WAS NOT IT

`if (params.staffwidth) { … } else { staffwidthScreen = 740; staffwidthPrint = 680 }`
(`engraver-controller.js:52-60`, `:210` picks by media). Ours fell through to the engine's
700px PAGE — which is the goldens' `staffwidth: 670` plus abcjs's margins — so a host calling
`renderAbc('paper', abc)` with no params got a page **70px narrow** and every centred title
with it.

**NO GEOMETRY GATE HERE COULD SEE IT: they all rendered with `{}` and compared against 670
goldens, so they AGREED ONLY WHILE THE DEFAULT WAS WRONG.** Named by the selectable oracle,
the one generated WITHOUT a staffwidth — `x="350"` against abcjs's `x="385"`, which is
`15 + 740 / 2`.

⚠️ **AND FIXING IT BROKE SEVEN GATES WHILE ONLY THREE SAID SO.** `pixel-parity`,
`corpus-abcjs` and `line-weights` went red. The harvested ranked table went to **74 of 177
fixtures off some axis, one by 211.8px, AND ITS ASSERTION PASSED THE WHOLE TIME** — it
ratchets "no worse than recorded" against numbers it had already recorded. It was found by
READING THE REPORT, which is the only thing that could have. `staff-spacing` and
`notehead-dx` were quiet because they measure RELATIVE to the top staff line and would have
gone wrong the moment either grew an absolute axis. **A gate that records its own numbers
cannot see a change of units.**

Every gate that opens a `dump-svg.js` golden now passes `{ staffwidth: 670 }` explicitly,
which is what they always meant.

---

## 5. WHAT IS LEFT

### 5.1 `tune.lines` — 5 tunes, 43 characters

Each is a distinct small mechanism, and all five are in `/tmp/abcts-lines.txt`
(`npx tsx scripts/zzlines.ts`):

- **`^3/2G` — A PARSE FAILURE OWNS NO CHARACTERS.** Strict reads one character of microtone
  and a second is a failure, so abcjs answers NULL for `^3/2` and its note starts at the `G`.
  Ours gives the note all six. `sib/S3-note-syntax-tune1`, 4 characters.
- **AN OPENING `(` BEFORE A DECORATION BELONGS TO NOTHING** — `(vf/` has abcjs's note at the
  `v`, while `(3B2` keeps its `(3` INSIDE the note's span. `letter_to_open_slurs_and_triplets`
  consumes the `(` run before `startI` is taken, and the triplet form is the exception;
  MEASURE which before porting. `sib/S8-layout-tune7`, 4 characters.
- **A standalone `K:D` that abcjs answers NULL for** where the same shape elsewhere is
  answered — `sib/courtesy-key-before-subtitle-tune0`, 3 characters. Probe abcjs's
  `tune.lines` for that fixture before touching §3's hoist; the rule is one of
  `appendStartingElement`'s three arms and the "same type → REPLACE" arm has never fired here.
- **A `#` IN THE MUSIC OWNS NO CHARACTERS** — `sib/vree-sharps-tune0`, 2 characters, same
  shape as the microtone.
- **THREE `[M:]` IN ONE BAR AND ONLY THE LAST HAS A RANGE.** `Measure.meterChanges` is the
  plural list and carries `{meter, at}` with NO source range, so the earlier ones are absent
  from the stream. `repo/abcjs-visual-svg-02-staffwidth-12-tune0`, 7 characters. It needs a
  range per entry — a small parser change, and the renderer already draws all three.

### 5.2 The API surface — 23 of 64 absent

`/tmp/abcts-compat-surface.txt`. **`tune.topText` and `tune.bottomText` are the two the §1
plumbing was supposed to unblock and they are still absent**, because they are abcjs's
INTERMEDIATE row list (`{move}` rows interleaved with text rows) rather than its result.

**THE SHAPE IS MEASURED — `HANDOFF-2026-08-17.md` has abcjs's own output for
`frere-jacques`** — and every field of every row is already computed: `left` is
`PlacedText.x`, `name` is `dataName`, `absElemType`/`startChar`/`endChar` are
`PlacedText.selectable`, and the `{move}` sequence IS `topTextBlock`'s `advances`. What is
missing is not a rule but three plumbing facts, in this order: the INTERLEAVING between
`texts` and `advances` is not recorded (`PlacedText.advanceAt` is exactly that index and
`nonMusicBlock` already stamps it, `topTextBlock` does not); a row's FONT TYPE NAME
(`"titlefont"`) is not carried, only its size and face; and the `Layout` does not expose the
block at all outside the no-music case. **Written down rather than half-built**, which is
this branch's own rule.

The rest: `Editor` / `EditArea` / `TimingCallbacks` / the three animation functions /
`extractMeasures` / `tuneMetrics` / `setGlyph`; `synth.CreateSynth`,
`synth.CreateSynthControl`, `synth.SynthController`, `synth.SynthSequence`,
`synth.midiRenderer`, `synth.playEvent`, `synth.sequence`; and `tune.deline`,
`tune.makeVoicesArray`, `tune.setupEvents`, `tune.addElementToEvents`,
`tune.addUsefulCallbackInfo` — the last three being `setTiming`'s internals, whose ANSWER we
already produce byte-exactly.

### 5.3 The three measured-and-written-down, unchanged

- **A chord's ties are per pitch** (`tests/chord-tie.test.ts`, two `it.fails` asserting what
  abcjs does, so they go RED when the gap closes).
- **`%%maxStaves` truncates the CLOCK**, because `makeVoicesArray` walks the DRAWN staffgroups.
- **An `&` overlay's `end` row is a whole note late** while every EVENT row matches.

### 5.4 `metaText` — DONE, 0 of 368

Landed the same day, and it did NOT move the surface count: `tune.metaText` was already
PRESENT as `{title}` alone, so the surface stands at 23 of 64 absent. Four findings, and one
of them arrived from the other side of a fact this session had already established:

- **`W:` STAYS AN ARRAY AND `N:`/`H:` DO NOT.** `simplifyMetaText` joins an array-of-strings
  with `\n` and `unalignedWords` is NOT in its list (`tune-builder.js:479-484`) — **which is
  the same fact that makes `W:` the only field reaching `addMultiLine`'s array branch**, and
  therefore the only bottom-block group with a selectable close (§2.1).
- **AN INLINE `[Q:]` IS NOT `metaText.tempo` AT ALL** (`abc_parse_header.js:384-397`), 59
  rows on one flag.
- **AN EMPTY FIELD IS STILL A FIELD** — `addMetaText` keys on `=== undefined`.
- **A LONE TEMPO WORD GETS ITS `duration` LAST**, and the KEY ORDER follows from when each
  value is assigned. The comparison is on the SERIALISED value because
  `JSON.stringify(tune.metaText)` is output a host can take.

Also landed with it: `G:`'s text, `%%header`/`%%footer`'s three parts (`RunningHead`), and
`suppressBpm` on the tempo element.

---

## 6. THE HARNESS

Ours, gated on their own env var: `ABCTS_Y`, `ABCTS_H`, `ABCTS_PL`, `ABCTS_PLR`, `ABCTS_SP`,
`ABCTS_XX`, `ABCTS_PROBE`, `ABCTS_CHECK`, `ABCTS_ABSY`, `ABCTS_TEMPOX`, `ABCTS_OTHER`,
`ABCJS_CHILD`.

| Script (`npx tsx scripts/…`) | Prints |
|---|---|
| `zzmti.ts` | **NEW** — every `metaTextInfo` row that differs → `/tmp/abcts-metatextinfo.txt` |
| `zzsink.ts` | what the EMITTER records, counted by type AND diffed against the golden row at each index |
| `zzsel.ts` | every open selectable row, counted BY FIELD (`ONLY=<slug>`) |
| `zzlines.ts` | every character where `getElementFromChar` differs |
| `zzacc.ts` / `zztr.ts` | accessor rows / `strTranspose` cases that differ |
| `zzr.ts` / `zzc.ts` / `zzpm.ts` / `zzs.ts` | one fixture rendered like the byte gate / with classes / print / stacked |
| `zzgap.ts` / `zzbars.ts` / `zztypes.ts` / `zzkey.ts` | a case by element type / bars per staff-voice / what the layout walk can see / key accidentals |
| `zztim.ts` / `zzev.ts` / `zzflat.ts` / `zzh.ts` | timing rows / parsed durations / flattened MIDI / page height |

Harvesters: `node scripts/harvest-abcjs-metatextinfo.mjs` is the new one — it PARSES with
abcjs rather than rendering, because `metaTextInfo` is a parse product and rendering a boxed
font under jsdom dies on `getBBox`.

abcjs, in the SCRATCHPAD COPY at `/tmp/gp/abcjs` — **never `../abcMusicKit`**. ⚠️ **/tmp IS
CLEANED AND THE COPY WAS HALF GONE THIS SESSION** — `src/` survived with its probes and every
top-level file (`index.js`, `version.js`, `package.json`) was missing. Restore with
`cp ../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/{index,version,license,plugin}.js …`
and check `diff -rq` against the vendored `src/` to see which probes are still in.

Run with
`NODE_PATH=$(cd ../abcMusicKit/Tools/abcjs-debug/node_modules && pwd) ABCJS_PATH=/tmp/gp/abcjs node /tmp/gp/<script>`:

| Script | Prints |
|---|---|
| `mti.js` | **NEW** — abcjs's `metaTextInfo` over both corpora, `label=dir` per corpus |
| `lines.js` | a tune's element stream per line/staff/voice — `F=<fixture> T=<tune>` |
| `twin.js` | every fixture through BOTH abcjs trees, diffed — run after instrumenting |
| `seldump.js` / `seldump2.js` / `surface.js` / `accessors.js` | selectables and at what depth / the public surface / the numeric accessors |
| `charmap.js` / `tim.js` / `flat.js` / `one.js` / `dur.js` / `h.js` / `svgdiff.js` | `getElementFromChar` per char / `setTiming` / `setUpAudio` / one tune's fields / durations / height / two markups diffed |

Goldens come from the VENDORED tree, never the scratchpad, and **`ABCJS_VERSION` is not
optional — `dump-svg.js` defaults to 6.6.3.**

---

## 7. THE RULES THIS SESSION PAID FOR

- **A GATE THAT RECORDS ITS OWN NUMBERS CANNOT SEE A CHANGE OF UNITS.** §4: seven gates
  broken, three loud, one silent at 211.8px, and the silence was in the one whose assertion
  is a ratchet on its own recorded values. Read the REPORT after a change of units, not the
  pass/fail.
- **A GATE'S REACH IS A PROPERTY OF ITS INPUTS, AGAIN.** Every geometry gate here passes
  `{staffwidth: 670}` now because every golden was made that way — and the DEFAULT had
  therefore never been measured by anything until an oracle generated without one arrived.
- **A RATCHET THAT NAMES ROWS CAUGHT FIVE REGRESSIONS THE AGGREGATE HID**, in three separate
  landings, every one while the total improved. Re-ratchet in the same commit and read the
  red list before believing the number.
- **MEASURE FIRST, READ SECOND, AND SAY SO WHEN THEY AGREE.** §3's biggest finding — a staff
  field belonging to the line above — was predicted from `appendStartingElement` and then
  confirmed row for row by `/tmp/gp/lines.js` on `S6-keys` before a line was written. It also
  **corrected a note written five days ago** that had been true of its one measured case.
- **AN INDEX ALLOCATED IN THE WRONG PASS IS INVISIBLE TO A COUNT.** §2.2's `SEL_SLOT`: nine
  dynamics, six curves, an ending and a triplet would have carried the wrong `data-index`
  with every count correct.
- **ONE WALK, NOT TWO.** §2.3. The second walk was not merely redundant — it could not reach
  seven of the eleven `wrapSvgEl` sites, because they are not in `staff.voices`. When two
  surfaces must agree, build them from one pass.
