# PARITY STATUS — abcts vs abcjs 6.7.1

*Measured 2026-09-22 after the abcjs 6.7.1 re-harvest — every headless gate, and then the
BROWSER gates too, in WebKit and Chrome, against the widened corpus. Every number below is a
re-run, not a carried-forward claim.*

⚠️ **The browser gates were the last thing to be re-measured and they had been left at their
6.7.0 numbers for a day** — 685 where the corpus is now 691 comparable tunes. They agree
(0 of 691 in both engines), so nothing moved; the point is that a file claiming "every number
is a re-run" is one gate away from not meaning it. 🧨 **And `zzlive`'s own report line said
`abcts vs abcjs 6.7.0` while LOADING 6.7.1** — the label, not the oracle, but a report naming
the wrong reference version is exactly the trap `dump-svg.js` defaulting to 6.6.3 already
cost this repo once. Fixed.

**The one-line answer: rendered with the options a page normally passes, abcts and abcjs
produce identical output — the same SVG bytes and the same MIDI bytes — with the exceptions
listed in §3, each of which is a case where abcjs itself produces broken output.**

✅ **AND §1a IS NO LONGER A QUALIFIER — IT IS A LAST-DIGIT TABLE.** The sentence above was
written when every gate here rendered with default options, and this paragraph used to warn
that three of abcjs's options were unimplemented FEATURES. As of 2026-09-15 none is:
`zzopts` renders the whole corpus under each host option and **5 of its 17,966 comparisons
differ** (26 rows × 691 tunes), across 3 fixtures — and FOUR of those five are `wrap + staffwidth` at its declared
floor, which is two debug markers the owner declined and two tunes abcjs crashes on. What is
left that is ours is ONE ULP in one root `width`. The table in §1a says which, and each row
names its own term.

This file is the plain-language status. `CLAUDE.md` carries the working history,
`Docs/HANDOFF-<date>.md` the session state, `Docs/ABCJS-DIFFERENCES.md` the evidence behind
every declared divergence.

---

## 1. Rendering

The comparison is the **SVG file, byte for byte** — not "looks the same", not "the notes are
in the right place", but the same characters in the same order. It is the only gate here
with no tolerance and no excluded axis; every other one declares what it ignores, and
together they let a markup difference live forever.

| gate | what it compares | result |
|---|---|---|
| `svg-bytes` | 697 in-repo tunes, rendered headless | **0 differ** (6 divergent) |
| `svg-bytes-sibling` | 359 tunes from the 47-fixture corpus, in 5 flavours — plain, `--add-classes`, print, stacked, stacked-print | **0 differ** |
| `zzlive` (WebKit) | abcts and abcjs running **in the same browser page**, diffed live | **0 of 691** (6 divergent) |
| `zzlive` (Chrome) | the same, in Blink | **0 of 691** (6 divergent) |
| `dom-contract` | `class`, `data-name` and DOM depth over 25 tunes — what `querySelector` finds | **0 differ** |
| `pixel-parity` | notehead/ledger/stem centres to 0.05px, against abcjs's own SVGs | **0 of 121** |
| `corpus-ranked` (diagnostic, not a gate) | worst geometric axis per fixture | **1 of 237** — and it is `abcts-unknown-clef`, a declared divergence (§3) |

**Why the browser check matters and why it cannot be a stored golden.** abcjs does not agree
with *itself* across browsers: 230 of 691 tunes render differently in WebKit and Blink,
because the two measure text differently (single glyph advances agree exactly; multi-character
string widths and glyph bounding-box heights do not). So there is no single browser answer to
store. The only coherent test is both engines in one page, and that is what `zzlive` is.
WebKit is the primary because Studio's editor is CodeMirror 6 in a WKWebView — for this stack
WebKit is the deployment engine, not a proxy for one.

**What the headless goldens do and do not assert.** They are harvested under JSDOM, where
`dump-svg.js` patches `getBBox`, so they assert *"abcts matches abcjs given synthetic text
metrics"* — the right target headless, the wrong one in a browser. `zzlive` covers the real
thing.

---

## 1a. Rendering under the HOST'S options

`zzopts` renders all 691 comparable tunes under each option a drop-in host actually passes,
and compares the **container as well as the SVG** — `outerHTML` — because half of what
`setPaperSize` does is assign styles to the parent node, which no emitted string carries.

**It opened at 685 of 685 on every row** (2026-09-09): abcjs sizes the container and we set
nothing at all, and `responsive: "resize"` — the option a page reaches for first — was
unimplemented outright. Every row is now at a DECLARED count, and a row that moves in either
direction fails.

| option | differ | what the remainder is |
|---|---|---|
| default, `responsive`, `viewport*`, `jazzchords`, `oneSvgPerLine`, `ariaLabel`, `germanAlphabet`, `accentAbove`, `lineThickness`, `initialClef`, `expandToWidest`, **`print`**, **`print + responsive`**, **`scale 0.8`**, **`scale 1.5`**, **`oneSvgPerLine + scale 0.8`**, **`add_classes`**, **`timeBasedLayout`** | **0 of 691** | — |
| `wrap` + `staffwidth` | **4** | **its floor** — 2 declined debug markers, 2 abcjs crashing in its own `wrapLines` |
| `minPadding` | **1** | two ULP in one root `width`, and the cause is a DOMAIN: abcjs's `er` carries a tail its pixel chain put there where this engine walks the line in staff spaces |

🏁 **SEVEN ROWS CLOSED ON 2026-09-16, AND EVERY ONE WAS A REPRESENTATION RATHER THAN AN
ARITHMETIC SLIP.** Each is named in `scripts/zzopts.mjs` at its own row:

- **A rule is drawn from the EDGE it was given** — a barline or stem stored its centre and the
  emitter took the half back off, which is not the same double on a `.xx5` boundary
  (`timeBasedLayout` 1 → 0).
- **The page width is abcjs's own sum, in abcjs's own pixels** — `(music + left) + right`,
  where this engine held the summed page and subtracted the sides back out (`print` 3 → 2,
  `scale 1.5` 2 → 1). **And the music width is a primitive too**, which was the last ULP on
  both print rows.
- **A declared `reserve` is a y, so it moves with its text** — the print `%%header`'s span was
  left behind in the block's frame and read as the system's BOTTOM, so everything after the
  first system sat 23.54px low (`print` 2 → 1).
- **An ending takes the counters of the element it is added at**, like a triplet, where it had
  derived them from its measure index (`add_classes` 1 → 0).
- **The `text-anchor` travels with the x** into the drawn-node measurement, because it moves
  the same sub-pixel phase (`scale 0.8` and `oneSvgPerLine + scale 0.8` 1 → 0).
- **A tempo flag's offset is summed before the cursor is added**, which is abcjs's own
  `abselem.x + xdelta` (`scale 1.5` 1 → 0).

⚠️ **AND TWO RECORDED CAUSES ON THIS BOARD WERE WRONG**, both found by re-measuring rather than
by reading: the 23.54px page-cursor row was attributed to eighteen `%%…font` directives (the
probe had compared our NODE metrics with abcjs's BROWSER ones — in one WebKit page every advance
is identical), and the 1/64-px box was attributed to a nested-tspan split on a fixture that
contains no nested tspan at all. **A recorded cause is a hypothesis, however carefully it was
written down.**

🏁 **`timeBasedLayout` went 669 → 1** on 2026-09-15 — the whole second layout algorithm, and it
is 83 lines. Every element's x comes from its MUSICAL TIME on a uniform grid, and the step is
LINEAR in duration where a spring is `sqrt`-weighted: 2.000000 against √2 on the same 2:1 pair,
which is how the two algorithms are told apart in one number.

⭐ **The biggest row on the board was not the biggest job.** The port took 669 → 11 in one go.
The other ten were **four passes of the spring solve that a grid line does not get, because they
live inside `setXSpacing`** — `checkLastBarX`, `centerWholeRests`, the voice-overlap
displacement, and two rules that were only ever right by accident: our collision pass grouped
simultaneity **by x** where abcjs groups by **time** (the same answer for as long as the spring
solve was the only layout), and an ending's room was charged to **every** voice where abcjs
charges voice 0 alone (invisible under a shared cursor, where `minspacing` is only a floor). The
grid did not break either of those; it revealed them, and both fixes are on the default path.

**`%%footer` landed 2026-09-15** — print draws one and we drew none at all — and it moved no row
count, because the only fixture with a `%%footer` differs 23px earlier for another reason.
Differencing the ROW LIST, every `data-name`/`y` pair in order, is what found it: **a row count
says nothing about which row.** The `print` and `scale` rows that remained after it were all
last digits, each located to its term, and all of them closed on 2026-09-16 — including the two
that needed a structural change, the page-width primitive and measuring a box in the emitter
rather than in the layout.

**`minPadding` went 4 → 1** on 2026-09-15, and the row turned out to be a ROD MAGNIFIER rather
than a feature: both remaining rules were element WIDTHS, and a width only reaches the page when
it beats the elastic gap beside it, so `svg-bytes`, `zzlive` and `zzselect` were all blind to
them. A rest's width takes the voice scale (a rest reaches `createNoteHead` like any head) and a
chord's width is the max over its heads AS ADDED, so a per-pitch `!style=!` on the middle head
widens the element. Both were laddered through abcjs with padding off and on — with it off the
voice scale and the style move nothing at all, in either engine.

**`add_classes` went 16 → 1** on 2026-09-15, in seven rules, and TEN of the sixteen were one
question: where does the `abcjs-lN` counter advance. `draw()` runs `classes.incrLine()` at the
head of every `tune.lines` iteration and only then asks what the line is, so a row that paints
nothing — a bare `%%text`, a bare `%%center`, the empty line a `%%newpage` leaves — is a line
like any other; and every text row's class is GENERATED, which reads as a literal only while
the counter is still null. ⭐ **One of the sixteen was this repo's own prediction coming true**:
a comment in `text-measure.ts` had said abcjs keys its text-size cache on the generated class
and we do not, and named `add_classes` as where a page-order defect would show up. It did — and
the first reading of it was backwards, because abcjs was the constant one and we were drifting.

**`expandToWidest` closed at 0 from 14** on 2026-09-15, and it is the row whose own recorded
note was wrong about the COST rather than the cause. The note said the system pass is "one
~1700-line `spans.map` with outer accumulators, so making it re-entrant is a real refactor and
a real regression risk"; the pass writes six bindings outside itself, mutates no element, and
running it twice unconditionally left both byte gates at zero. What the row actually needed was
arithmetic: abcjs's `i = -1` is an ABORT, not a fixed point — the lines after the offender are
never solved at the width it just left — the chase runs **112 passes** on one fixture, and the
top text is rebuilt at the widened page so the title centres on the music.

**`initialClef` closed at 0 from 125 and `lineThickness` at 0 from 665**, both on
2026-09-14. Between them they show what these rows usually are: `initialClef`'s `l` is the
index into `tune.lines` and COUNTS the non-music rows, so a tune with a subtitle draws no
clef at all under it; `lineThickness` is a DRAWN width abcjs never lets reach its engraver,
and we had folded it into a table the layout also reads. Neither was a missing feature.

⭐ **THE `wrap + staffwidth` ROW IS WORTH READING AS A CASE STUDY.** It opened at 59, was 23
at the start of 2026-09-14 and reached its floor of 4 that day. What it cost was not
arithmetic: **four of the eight recorded causes were wrong, one recorded DISPROOF was
backwards, and seven fixtures that read as seven separate spacing defects were a single
expression** — a trailing barline passing `el.width`, which is zero for an invisible bar,
where `barWidthOf` gives abcjs's `w` of 1. Every one of those fell to instrumenting abcjs's
own `layoutOneItem`, `calcY`, `roundNumber` and `tune.lines` **against our equivalent**, and
none to reading its source alone.

⚠️ **AND A `wrap` DEFECT IS OFTEN NOT A WRAP DEFECT.** Three rules closed that row while
being general: an ending's room was charged to two barlines instead of one, a pitch was
converted to a y twice instead of once, and an element's width was `(x + w) - base` instead
of `dx + w`. All three reproduce with no wrap at all; no golden covers the shapes that show
them, which is why they lived under a green `svg-bytes` for months. The third also moved
`initialClef` 42 → 41 and the first two moved `print` and `minPadding`.

---

## 2. Audio

Three layers, each a different derivation of the same answer — which is the argument for
having all three. A surface that agrees by construction is worth less than one that could
disagree, and each of these has disagreed with the others at least once.

| gate | what it compares | result |
|---|---|---|
| `midi-bytes` | the **MIDI file, byte for byte**, over all 697 tunes | **0 differ** (19 divergent) |
| `audio-ranked` | the flattened event list — every note's pitch, start, duration, volume | **0 of 72** |
| `timing-ranked` | `setTiming` — the clock a player follows | **0 of 38** |
| `timing-elements` | `currentTrackMilliseconds` — which written element is lit | **0 of 13** |
| `timing-callbacks` | 132 cases, 4,816 callbacks | **0 differ** |
| `chord-grid` | the accompaniment grid `%%MIDI gchord` plays from | **0 of 23** |
| `midi-ranked` | the three cases abcjs's own suite asserts | **0 of 3** |
| `synth-*`, `create-synth`, `animation` | the synth control surface and its frames | **0 differ** |

`midi-bytes` closed on 2026-09-06 from 24 open. It is the youngest surface here and it found
sixteen real defects in code the other audio gates had called green for a month — the usual
result when a new axis opens.

**And the SYNTH itself is ported and gated, which an earlier note here got wrong.** A
2026-08-08 decision put WebAudio out of scope; it was REVERSED on 2026-08-15 when the scope
became the whole of abcjs's `index.js`. `CreateSynth` fetches the same soundfonts from the
same default URLs, and `tests/audio-recorder.ts` replaces `XMLHttpRequest`, `AudioContext`
and `OfflineAudioContext` with recorders on BOTH engines — so which sound is fetched, where
each note is placed in the output buffer and at what gain are all compared. The samples are
fake and the placement is real.

**What is NOT gated, and it is the one thing a website should smoke-test itself:** actual
mp3 decoding and real `AudioContext` scheduling in a browser. Nothing here makes a sound.

---

## 3. The declared divergences — where we deliberately differ

**A tolerance is a defect that has not been written down yet.** Everything below is written
down, with evidence, in `Docs/ABCJS-DIFFERENCES.md`, and its slug is in the gate's own
`DIVERGENT` list. Nothing else is excluded from any gate.

### Rendering — 6 tunes

| what abcjs does | why we decline |
|---|---|
| draws a **red debug string** in the shipped output for a note longer than a breve (`chartable.note` runs out one entry past it) | it is an internal error message rendered as music |
| `abcts-unknown-clef` (5 tunes) — an explicit `clef=x` | we reproduce the warning and the un-drawn clef; the residual is documented geometry |

### Audio — 19 tunes

| what abcjs does | count |
|---|---|
| writes **`NaN` into the tempo** — `Math.round(60000000 / undefined)` is `NaN`, and `toHex(NaN, 6)` pads the *string* `"NaN"` and slices it into `%00%0N%aN`. Its own decoder reads those as 0 and 10, giving a tempo of ~2.6 microseconds per quarter note. We write the 180bpm default. | 16 |
| **throws outright**, so a host gets no file at all — a rich `T:` reaching `charCodeAt` as an object, and two `Cannot read properties of undefined` | 3 |

### 3b. OPEN — measured 2026-09-23, named, not yet fixed

Not divergences: **defects on the tune-object surfaces that the widened oracles named**, on
hand-written `abcts-*` control tunes that no tune-object oracle had ever covered. Each is
listed by exact slug in `tests/open-rows.ts`; every gate asserts zero over everything NOT
named there and asserts each named row STILL differs, so a row cannot rot — fixing one makes
the gate demand its name be deleted. The families, from the ranked tables:

| family | fixtures | what differs |
|---|---|---|
| `clef=x` | `abcts-unknown-clef` 0–4 | the ruled divergence (§3) seen from the tune object: abcjs's `type: "x"` and debug marker |
| one-off | `abcts-rests-and-bars` 14 | the §3 debug-string divergence seen as element values — the ONLY open row left in the repo |

✅ **`mid-measure [K: clef=]` (`abcts-clef-midmeasure`, 7 tunes × 5 gates) CLOSED
2026-09-22 — and it was TWO causes, not one.** (1) A `K:` written after the last music still
publishes its elements: abcjs appends `clef` and `key` for `K:C clef=bass` and `key` alone
for `K:Am`, where a change with no following measure had nothing to ride here. ⚠️ The
DRAWING was already right — abcjs draws the cautionary clef and no trailing key — so
`svg-bytes` agreed throughout and the parser's own note said this shape "needs nothing,
measured"; it had measured the ink. (2) The clef is ONE tune-level variable every voice
shares (`abc_parse_music.js:961`), so `V:1 CD[K:C bass]EF|` then `V:2 GABc|` opens voice 2
in bass; ours seeded each voice from the header's clef in two places, and fixing one left
every note 12 pitch out with the staff already right. `tests/clef-midmeasure.test.ts`.

✅ **AND THE NINE `accessors` FIELD-ROWS ARE GONE — THREE RULES, NO TWO THE SAME.**

* **`computePickupLength` IS LINE-MAJOR, NOT VOICE-MAJOR** — three nested loops over
  `lines[i].staff[j].voices[v]` (`abc_tune.js:108-134`), so it reaches every voice of the
  first SYSTEM before the second system of the first voice, accumulating across staves and
  shedding a bar length whenever it passes one. `[V:1]P:A` on a line of its own makes line
  0 hold that element AND the second voice's measure: 1.125, less a bar, is abcjs's 0.125
  where the voice-major walk returned 0.5.
* **THE CLOCK STARTS AT `metaText.tempo`, WHICH AN INLINE `[Q:]` IS NOT** — and the
  head-of-voice tempo ELEMENT is the header's too. Ours pushed it for any `score.tempo`,
  so an inline `[Q:]` was filed under measure 0 and governed the bars BEFORE it: the whole
  tune played at 90 where abcjs plays the first bar at the default and slows at the `[Q:]`.
  Both halves are load-bearing; reverting either takes the row back.
* **A NOTE LONGER THAN A BREVE HAS NO HEAD AND STILL TAKES ITS TIME.** abcjs builds the
  AbsoluteElement and only the GLYPH is missing, so the note keeps its place in
  `makeVoicesArray`. Ours returned a layout element with no `sourceEvent`, so the timing's
  `%%maxStaves` rule — "an element with an event and NO geometry is one abcjs never saw" —
  read it as truncated and gave the WHOLE TUNE **zero seconds**. ⚠️ The INK there is the
  ruled divergence of §3; the clock never was, and the two had been conflated.

`tests/accessor-walks.test.ts` is the ladder, and each rule was checked against its own
break.

✅ **AND WITH THE EMPTY `%%center`, EVERY TUNE-OBJECT GATE IS AT ZERO BUT THE RULED
DIVERGENCE.** An empty `%%center` publishes a ROW and draws NOTHING: its text reaches
`FreeText` as an ARRAY, so it falls to the final `else`, which writes a row and moves
`getTextSize.calc('')` — zero — and then `nonMusic`'s `else if (row.text || row.phrases)`
(`draw/non-music.js:12`) is a JS FALSY test that never draws it. **Ours swallowed the row
and DREW the text**, two errors in opposite directions, which is why the page height
agreed and `svg-bytes` stayed green until the row started being published. The last row
anywhere is `abcts-rests-and-bars-tune14`, which is §3's debug-string divergence.

✅ **AND THE `%%vskip` / `%%text` LINE-ROW FAMILY IS DOWN TO ONE ROW — twelve of its
thirteen tunes closed on FOUR rules, and `tune.lines`, `parse-only`, `parse-values` and
`deline` are now EXACT over the whole corpus.**

* **A PENDING `%%vskip` RIDES THE VERY NEXT LINE, WHATEVER KIND OF LINE THAT IS** —
  `pushLine` stamps `hash.vskip` before it pushes (`tune-builder.js:904-908`), so a text
  row, a `%%center`, a `%%begintext`, a `%%sep` and a mid-tune `T:` all take it and the
  STAFF below gets none. Ours emitted it on music lines only.
* **AND A SUBTITLE CARRIES THE NUMBER WITHOUT SPENDING IT** — the controller builds
  `Subtitle` with no vskip argument (`engraver-controller.js:239`), so abcjs's page is
  byte-identical with and without the directive while `tune.lines` still publishes it.
  Both halves are modelled now; the repo had recorded only the page half, as measured.
* **A `%%text` SPAN IS ARITHMETIC, NOT THE LINE** — `iChar + restOfString.length + 7`
  (`abc_parse_directive.js:983`) over the TRIMMED tail, so a bare `%%text` spans seven
  characters where the line is six and `%%text  a ` spans eight where the line is ten.
  Only the one-space no-trailing-space form reads the same either way, which is every
  `%%text` in the corpus until these controls were written.
* **A BLOCK WRITTEN INSIDE A SYSTEM COMES OUT AFTER IT** — the staff line was pushed when
  the system opened, so a `%%text` between `V:1`'s music and `V:2`'s lands at index 1. The
  projection read `textBefore` off VOICE 0 alone and dropped the row outright.
* **AND THE `&` MARKER SORTS AHEAD OF THE LAYER'S FIRST ELEMENT, NOT ITS FIRST EVENT** — a
  note's span opens at whatever was written FOR it, so `&"C"GABc|` builds its `G` four
  characters early; keyed on the event, `resolveOverlays` snipped one element late and left
  the layer's first note in the MAIN voice. Any attachment does it: a chord symbol, a
  decoration, a `.` or a grace group.

⚠️ **ONE RUNG IS MEASURED AND NOT LANDED**: `%%newpage` is a line too and abcjs stamps the
pending vskip on it; no fixture writes that pair, so it is an `it.fails` in
`tests/text-line-rows.test.ts` rather than two more model fields.

✅ **AND SO DID `%%staffnonote` AND THE VOICE MODIFIERS — the four families named in the
morning's triage are all shut, and `tune.lines` and `parse-only` are now EXACT on every
tune in the corpus.** `%%staffnonote 0` deletes a staff from `tune.lines` and not only from
the page (`tune-builder.js:70-93`) — one per-line filter, and a rest carrying a CHORD SYMBOL
keeps its staff. A `K:` that names no clef appends no `clef` element, because `foundClef` is
set in the clef-NAME arm alone (`abc_parse_key_voice.js:513-516`) and
`Measure.clefChangeSilent` already said so. And `V:1 gstem=up` sets the stem because abcjs's
voice switch has **no `default:` arm — it is commented out**: an attribute it does not know
is dropped WITHOUT ITS VALUE, so the `up` left standing reaches `case 'up'`. That last one is
measured and the source predicts the opposite; `zzz=up` sets the stem too, which is what says
the name is not the mechanism. `tests/staffnonote-lines.test.ts` and
`tests/voice-modifiers.test.ts`.

⭐ **THREE OF THE FOUR FAMILIES WERE RULES THIS REPO HAD ALREADY PORTED — AT THE SITE THAT
NAMED THEM.** The renderer knew `%%staffnonote` and `clefChangeSilent`; the grace path knew
the tie carry was positional. Each was written once, where one surface needed it, and the
projection had no share of it.

✅ **AND THE TIE FAMILIES CLOSED THE SAME DAY — `abcts-void-notes-and-stray-ties` (11
tunes), `abcts-endings-tune5` and `abcts-rests-and-bars-tune1`, three names for one rule.**
abcjs's tie carry is a BOOLEAN (`abc_parse_music.js:93-103`): it lands on the very next
element whatever that element holds — a different pitch, or a REST — and steps over exactly
one thing, a spacer. We matched on PITCH, which is the same answer for ordinary music. The
other half is the `-` written BEFORE a note, which closes a tie on that note with nothing
opened, and does so even when the attempt it heads FAILS. `tests/stray-tie.test.ts` is the
ladder, 31 rungs with abcjs's own answers; two more are measured, recorded as `it.fails`
and deliberately not landed, and a third is measured and unexplained.

Two of the widened oracle's findings WERE fixed the same day, both on a new upstream
fixture: a `%%text` between two UNBARRED music lines was claimed by the line above
(`beginMusicLine` closing the previous measure after the block was pending — `visual-layout-10-text-a`, which also moved the SVG's height), and `%%papersize`/`%%landscape` were
documented as "nothing reads it" while `abc_parse.js:579-594` sizes `formatting.pagewidth`
/`pageheight` from them; `%%map` and its four siblings now publish their `restOfString`.

### And one abcjs bug we decline to reproduce because it is a hang

`%%beginps` with a non-empty body **never returns**: the reader advances the tokenizer but
never reassigns the variable it tests, so the loop condition is true forever. We consume the
block and raise abcjs's own single `Postscript ignored` warning — which is what abcjs would
do if that one assignment were there. A parser that can be made to spin forever on
user-supplied input is a denial of service, not a rendering difference.

---

## 3c. WebAudio — the surface that had no gate at all, and was BROKEN

⚠️ **FOUND 2026-09-23, and it is the sharpest example in this file of a green board over a
dead feature.** Every audio comparison here stops short of WebAudio on purpose — the event
list (0 of 72), the sequencer rows (0 of 237), the note timings (0 of 38) and the **byte-exact
MIDI file** (0 of 697) all describe what SHOULD sound and none of them touches an
`AudioContext`, a soundfont fetch or a rendered buffer. So `compat/create-synth.ts` and
`compat/synth-controller.ts` — the API a host calls to HEAR the tune — sat behind every green
gate in the repo while playback did not work at all:

* **`registerAudioContext()` never created a context.** abcjs's own comment is explicit —
  *"If you call it with no parameters, then an AudioContext is created and stored"* — and ours
  only stored what a host handed in, under a comment asserting the opposite. With no context
  `supportsAudio()` returns `undefined`, `_deviceCapable()` coerces that to false, and
  `CreateSynth.init` rejects with **"MIDI is not supported in this browser"** — in WebKit,
  where abcjs loads its soundfonts and primes.
* **`SynthController.play()` threw** "CreateSynth is not built yet — pass a midi buffer
  factory". A default written before `CreateSynth` existed, which outlived it: abcjs's
  controller does `self.midiBuffer = new CreateSynth()` itself, so every host following its
  documented three lines hit the throw.

Both are fixed and gated. `scripts/zzaudio.mjs` drives abcjs's own documented path —
`new SynthController()`, `load`, `setTune`, `play`, then `CreateSynth().init().prime()` — in
ONE WebKit page against BOTH engines over five shapes, and compares the RENDERED SAMPLES as
well as the API: buffer count, duration, peak amplitude and audible-sample count. **0 of 5
differ, peak and sample counts identical**, and each fix was checked against its own break (5
of 5 with either reverted). ⚠️ It needs the network for the soundfonts and says so rather than
passing quietly when a run is silent on both sides.

⭐ **THE LESSON: A SURFACE WITH NO GATE IS NOT A SURFACE WITH A SMALL GATE.** The MIDI file
being byte-exact reads like proof that audio works, and it is proof about a different
artefact. Ask what a host DOES, not what the nearest gate measures.

## 3d. Malformed input — the corpus no fixture covers, and the two defects it found

⚠️ **EVERY FIXTURE IN BOTH CORPORA IS VALID ABC** — 180 harvested from abcjs's own suite and
57 controls written to pin a rule — so *"what does a drop-in do with input a user is halfway
through typing?"* had no gate at all. `scripts/zzfuzz.mjs` runs 35 malformed shapes through
BOTH engines in one WebKit page and compares the tune count, the warning strings, the element
stream per voice and the page height. It is **48 shapes** now — the thirteen added with the chunk
rule and the normalizations are its own regression net — and it found **six** defects on its first run; two are fixed:

* ✅ **A LINE OF NOTHING BUT BARLINES WAS DELETED.** `|`, `||`, `|]`, `[|]`, `||||::|]` and
  `-|-` each give abcjs a staff and gave this engine NO LINES AT ALL — the voice's emptiness
  was tested before `closeUnterminatedMeasure` flushed the pending barline, so the voice never
  existed. 37.56px against abcjs's 94.617.
* ✅ **CONSECUTIVE BARLINES COLLAPSED INTO ONE.** The lexer's `|` arm was a GREEDY RUN where
  `getBarLine` is a bounded decision tree (`abc_tokenizer.js:219-235`): `|||` is
  `bar_thin_thin` then `bar_thin`, `||||` is two `bar_thin_thin`, `|]|[|` is three bars. The
  run swallowed them into one token that `BARLINES` could not match and fell through to a
  plain `thin`, and the table was missing `||:` and `[|:` besides. ⚠️ The code said so:
  *"Two openers in a row keep the first … nothing in the corpus does it and one slot is enough
  until something does."* A `ponytail:` in all but name, and this is the something.
* ⚠️ **AND THE FIX'S OWN REGRESSION WAS CAUGHT IN THE SAME RUN**: the flushed bare measure did
  not consume the pending line start, so `|:|:C:|:|` came out as TWO systems (187px against
  94.789). Fixed by having it take the line start, as a real measure does.

**SIX CLASSES WERE NAMED, ALL SIX ARE CLOSED**, and what is left is DECLARED in the script with
its measurements:

1. ✅ **RECOVERY FROM AN UNTERMINATED CONSTRUCT — CLOSED 2026-09-23, AND IT WAS ONE SHARED
   PRIMITIVE.** `getBrackettedSubstring` clamps a missing close to a per-construct BUDGET
   rather than eating the line — *"we'll just pick an arbitrary num of chars so the line
   doesn't disappear"* (`abc_tokenizer.js:789-814`) — and ours ran to the NEWLINE, so one
   stray `{` or `"` lost everything after it. **That is what an editor sees on every
   keystroke, and `compat` is the editor's engine.**
   * a `{` drops ONE character, abandons the group, and the rest of the line is ordinary
     music: `{ab CDEF|` is `a b C D E F` and a barline, with two warnings — the missing brace
     and then the character itself. ⚠️ And the character belongs to NOBODY, so the next
     note's span opens past it.
   * a `"` spends FIVE, so six characters go and the text is the four between: `"Am CDEF|` is
     a chord `Am C` on an E, then F.
   * a `!` is treated as a LINE BREAK — `[1, null]`, one character, **no warning at all** —
     so `!trill CDEF|` reads `t` as `trillh` and warns four times on `rill`. A CLOSED but
     unknown `!zzz!` is the other arm and still warns.
   ⚠️ **AND THE BUDGETS ARE NOT ALL `budget + 1`**: measured, the brace and the bang consume
   ONE character where the source's arithmetic says two. `tests/unterminated.test.ts` is the
   ladder, nine rungs, every expectation abcjs's own.

   **What is LEFT of the class is `[K:C CDEF|`**, where abcjs raises seven warnings walking
   out of a failed inline field and we raise one. The ELEMENTS agree.
2. ✅ **WARNINGS THIS PARSER DID NOT RAISE — three of five CLOSED 2026-09-23, and every one
   was a RETRY rather than a message.** abcjs fails the attempt and `parseMusic`'s
   `if (i === startI)` warns for the character it walked past, so the question is never "what
   does it warn" but "what did it fail to read".
   * **a tuplet field is ONE DIGIT** — `(99999` is a tuplet of NINE and four warnings, not a
     tuplet of 99999, and `p < 2` builds nothing and warns at its own digit;
   * **an accidental run is the longest LEGAL SUFFIX** — `^^^^^^C` keeps `^^C` and warns four
     times, `^_C` keeps `_C` and warns once. ⚠️ Ours ACCUMULATED and clamped to ±2, so
     `^^^^^^C` was a silent double sharp and `^_C` a silent NATURAL — neither abcjs's glyph
     nor its warning;
   * **a `-` that nothing can continue is an unknown character**, and the boundary is one
     character wide: a SPACE is enough to fail it, so `- C|` warns where `-C|` does not, while
     a `-` that follows a note is eaten by THAT note's parse and fails nothing.

   ⭐ **AND CLOSING THE TUPLET RULE EXPOSED A RENDERING DEFECT ON A SHAPE THAT IS NOT EXOTIC
   AT ALL**: a tuplet that never reaches its count draws NOTHING in abcjs — `endTriplet` is
   never stamped and a `TripletElem` with no end never reaches the page — where this engine
   drew a bracket and a number, 19.4px of page. `(3CD|` is what a user types when they stop
   halfway. It is the same rule as "an ending with no `end` emits nothing", ported for the
   volta years ago and never for the tuplet. `TupletMark.closes`.

   ✅ **AND THE LAST TWO CLOSED THE SAME DAY.** `%%score (((` — the flags for all six bracket
   warnings were already parsed and not one of them warned, and `justOpenBracket` is part of
   the CLOSE test, so `()` warns on an EMPTY group. A `w:` before any music is DROPPED with a
   warning whose text is the literal `SPACE`, which is abcjs's formatter rendering the empty
   line it was handed. **The class is closed.**
3. ✅ **WHAT A CHUNK OF THE BOOK IS — CLOSED 2026-09-23, AND IT WAS THREE RULES.** abcjs cuts
   the book on `"\nX:"` ALONE and then truncates each chunk at its first `\n\n`
   (`abc_parse_book.js:18-37`); the parse loop says the same thing a second way by falling out
   of `while (line)` on the first EMPTY line (`abc_parse.js:548-563`).
   * **An empty tune is still a tune.** `''`, `'\n\n\n'`, `' '` and `'%% nothing'` each give
     abcjs ONE tune object and a 37.56px page, where `renderAbc(div, '')[0]` was `undefined`.
   * ⭐ **A blank line ENDS the chunk — it does not START a tune.** `X:1 / CDEF| / ⏎ / GABc|`
     is ONE tune of ONE line for abcjs and the rest is thrown away; this engine made a SECOND
     TUNE of it, wrote a staff into a second div abcjs leaves empty, returned 2 tunes from
     `renderAbc([d1, d2], abc)` — and DISAGREED WITH OUR OWN `numberOfTunes`, which
     implements abcjs's split and said 1. Two answers to "how many tunes is this?" inside one
     library.
   * **Whitespace is not empty.** `nextLine()` hands back the raw line, so `" "` is truthy and
     only `parseLine`'s strip-to-nothing test fires (`abc_parse.js:413`): a space on the line
     between two music lines joins them into one tune of TWO staves, where ours ended the tune.
   ⚠️ **AND A CHUNK HOLDING ONLY A `W:` OR A `%%text` IS NOT EMPTY.** `flush` dropped a builder
   with no `X:`, no `T:` and no music, so `W:x` rendered 37.56px of nothing against abcjs's
   134.09 and `%%text hi` lost its line outright. `tests/chunking.test.ts` is the ladder, eight
   rungs, every number abcjs's own — and it counts `parse().scores`, because `parseOnly` opens
   one slot per `numberOfTunes` and CANNOT SEE the extra tune.
4. ✅ **THE LEADING CHUNK'S `%%` LINES ARE PREPENDED TO EVERY TUNE — CLOSED 2026-09-24.**
   abcjs keeps them as TEXT and every tune parses them again (`abc_parse_book.js:22-37`), so
   `%%text hi` above the first `X:` is a row in each tune — 189.88px against the 94.79 we drew.
   Ours kept a FORMATTING SNAPSHOT of that chunk (`fileDefaults`), which carried
   `%%stretchlast` and lost every directive that makes content. They REPLAY now, and at the
   offsets abcjs reports: the tune is parsed from `startPos - header.length`
   (`abc_tunebook.js:84`), so the replayed lines take the characters just BEFORE the tune,
   packed end to end whatever stood between them in the source — `hi@11,20` for tune 2 of
   `%%text hi / X:1 / … / X:2`. Their warnings are raised once, as before, and repeated per
   tune by `warningsOf`. The snapshot and its 70 lines are deleted.
5. ✅ **THE THREE REWRITES BEFORE THE FIRST LINE IS READ — CLOSED 2026-09-23, AND ONE OF THEM
   WAS TWO STRINGS.** abcjs normalizes line endings, blanks latex lines and swaps escaped
   percents before it reads anything (`abc_parse.js:497-512`), and the book is `strip`ped with
   its leading chunk's non-`%%` lines never parsed at all (`abc_parse_book.js:9-31`).
   * **A lone `\r` is a line separator** — one character for one, so nothing moves. A
     classic-Mac file was ONE line to this engine: a whole book as a 37.56px empty page.
   * **A `\r\n` is one too, and abcjs reports the SHORTER offsets** — it normalizes and then
     reports positions in the string it made, so on a CRLF file every span was off by one per
     preceding line. That is an editor's click-to-select on every Windows-authored file.
   * ⭐ **AND THE PROJECTION WAS READING A DIFFERENT STRING FROM THE PARSE.** `tune.lines` tiles
     each element's span per SOURCE LINE by walking the host's string for its line starts —
     with no `\n` in it there are no lines, so every element on the page opened at character 0.
     The parser had the right answer and the tune object did not. `normalizeSource` is the one
     door both go through now. Same class as a knob reaching the layout and not the audio.
   * **A line starting with `\` is a latex command and becomes spaces**, the preceding newline
     included, so `\score{…}` between two music lines costs nothing. Ours read it as music:
     198.86px and a warning where abcjs draws 94.789 and says nothing.
   * **A `T:` or a stray line above the first `X:` is never parsed** — only the `%%` lines up
     there survive, prepended to every tune. Ours read them and kept their warnings.
   ⚠️ **WHAT IS LEFT IS THE CHUNKING, WHICH abcjs DOES ON THE RAW STRING.** It cuts the book on
   `"\nX:"` BEFORE any normalizing, so `X:1\rC|\rX:2\rD|` is ONE tune of two lines to abcjs
   where ours is two tunes, and in a CRLF book a later tune's offsets are its RAW start plus its
   NORMALIZED interior: tune 2 of `X:1⏎C|⏎⏎X:2⏎D|` is `note15,16` to abcjs and `note12,13`
   here, exactly the three `\r`s before it. MEASURED, not built — reproducing that hybrid means
   chunking the raw source and giving each chunk its own offset base, which is a different
   parser entry rather than a rewrite. The first tune of a CRLF book is exact either way.
6. ✅ **A BARE `&` LAYER — CLOSED 2026-09-24, AND THE ROW WAS HIDING A GENERAL DEFECT.**
   ⭐ **AN `&` FORCES THE VOICE IT INTERRUPTS UP, FOR ITS OWN MEASURE, AND THIS ENGINE HAD
   NEVER DONE IT.** `resolveOverlays` leaves a `stem up` before the barline that opens the
   `&`'s measure and a `stem auto` after the one that closes it (`tune-builder.js:601-606`),
   and the engraver takes each as the voice's `stemdir` until the next — `auto` is
   `undefined`, which beats even a declared `stems=` (`abstract-engraver.js:342-343`). So
   `c2&e2|` stems its `c` UP over the layer's `e`; ours followed pitch and stemmed it DOWN
   into it, 1.07px of page and a collision. **The corpus overlays pass only because their main
   voices sit low enough to stem up by pitch** — `G8 & C4 D4` is the textbook shape, and
   it happens to agree. `Measure.overlayStem` carries the marker, read from the very stems
   our port of `resolveOverlays` already left behind and nothing consumed.
   * **An empty layer is still an `&`** — `letter_to_overlay` answers a length ≥ 1 for any
     `&`, so `C&|` appends the marker and its `stem up … stem auto` survives the layer's
     deletion. `Measure.writtenOverlays` keeps the layers as written, because
     `overlays` is what resolution LEFT.
   * **A voice that sings nothing is deleted after overlays resolve — the main one too**
     (`voiceUseful`/`deleteVoice`, `tune-builder.js:113-123`). `&|` is a staff with no
     voices and a 37.56px page, where we drew a staff and a barline. `Voice.deletedByOverlay`;
     the drawing skips it and `tune.lines` keeps the empty staff, as abcjs's does.
   * **A run of `&` belongs to nothing** — each is its own `parseMusic` iteration.
   `tests/overlay-stems.test.ts` is the ladder, five rungs, each checked against its own
   break.

## 4. Everything else that is measured

Re-run 2026-09-23, after the abcjs 6.7.1 re-harvest and after the `unknown-clef`,
`clef-midmeasure`, tie, `%%staffnonote`, voice-modifier and `%%vskip`/`%%text` families
closed. These are the parse and API surfaces rather than the output.

✅ **THE FIRST OPEN FAMILY IS CLOSED, AND IT WAS ONE LOOKUP.** `unknown-clef` was named in
FOUR gates over five tunes — `parse-only`, `parse-values`, `render-values` and `deline` —
and every row came from `fixClef` doing two things inside one `if (value)`: rewriting
`clef.type` from `clefLines` and assigning `clefPos = value.pitch`
(`abc_parse_key_voice.js:75-81`). A name it does not know gets NEITHER, so abcjs reports
`clef=q2` as `type: "q2"` with no `clefPos`, where this engine fell back to `treble` and
assigned 4. The written token travels on `Clef.name` now;
`tests/unknown-clef.test.ts` holds it, with a known clef as its break.
⭐ **That is what the family grouping was worth** — five tunes × four gates were one
lookup, and the shared fixture prefix predicted it. ⚠️ It does NOT follow that the other
families are one cause each; that is the same untested assumption. ⚠️ **The oracles WIDENED that day**: every tune-object harvester
enumerates the whole fixture directory, and most had last been run at 507 tunes while the
directory had grown to 822 with the `abcts-*` control ladders — so 315 tunes were being asked
these questions for the first time. What they answered is §3b; every row common to the old
and new oracle is byte-identical, so none of it is a 6.7.1 change.

| surface | result |
|---|---|
| `tune.lines` — every element's source span | **0 of 814 tunes; 1,204,999 of 1,204,999 characters** |
| `parse-values` — every value of every element | **0 of 16,223** |
| `render-values` — every value of every rendered element | **2 of 16,223 OPEN**, on 1 tune — the §3 divergence |
| `parse-only`, `voices-array`, `deline`, `extract-measures`, `setupevents` | 0 / 0 / 0 / 0 / 0 on 822 / 237 / 1,628 / 284 / 186 cases |
| `sequence` | **0 of 237** |
| `accessors` — the nine numeric tune accessors | **0 of 822 tunes × 9** |
| `tune.warnings` — the strings a host shows | **0 of 822 tunes**, 542 warnings across 93 |
| `metaText` / `metaTextInfo` / `formatting` / `tuneMetrics` / `toptext` / `timing-callbacks` / `tunebook` | **0** on 822 / 822 / 822 / 284 / 822 / 140 / 259 |
| `compat-surface` — abcjs's 64 public symbols | **0 absent** |
| `selectables`, `dom`, `editor`, `synth-controller` | **0** |

**Full suite: 94 files, 2,693 tests, no reds, no expected-fails.**

✅ **AND `npm run lint` IS A GATE NOW — 1,022 errors to 0** (2026-09-16), 33 warnings left
reporting. Most of it was never this repo's code: **691** were `noUnknownProperty` inside
abcjs's harvested goldens (`-khtml-user-select` in the `<style>` abcjs writes — fixing one
would corrupt a byte golden), **254** were index-signature reads of abcjs's OWN field names,
and **127 files** disagreed with a formatter that has never been run. Each is off with its
reason written at the rule in `biome.jsonc`; the rest was fixed. ⚠️ **The formatter stays
off** until adopting a format is someone's own commit. 🧨 And a `//` comment in `biome.json`
makes biome silently ignore the WHOLE configuration — no error, it just falls back to
defaults — which is why the config is `biome.jsonc`.

⚠️ **The file count fell by one on 2026-09-14** — `tests/zzk.test.ts` was a scratch probe
from an earlier session that asserted NOTHING, only `console.log`. A test that cannot fail
reads as coverage; it was deleted rather than filled in.

---

## 5. What this does NOT prove

Read this section before quoting the numbers above.

1. **It is `abcjs-strict`** — but as of 2026-09-07 that is a much smaller caveat than it
   was. The owner's rule is that `abcjs-extended` is **byte-identical to strict except for
   the divergences declared in `Docs/ABCJS-DIFFERENCES.md`**, and
   `tests/mode-bytes.test.ts` holds all 691 fixtures to it: **11 differ, every one
   declared**. So the numbers above carry over to extended everywhere it has not been given
   leave to differ.

   It opened at **675 of 691**. `strict` had been gating the LOOK as well as the bugs, so
   extended was drawing Bravura outlines at Bravura's advances, spacing at abcm2ps's
   density and measuring text with real per-em tables — none of it declared, none of it
   compared to anything. `tests/mode-partition.test.ts` still holds the partition by named
   behaviour; `mode-bytes` holds the bytes.

2. **Parity is only as broad as the corpus.** ~1,000 tunes: abcjs's own test suite plus
   purpose-built controls. **Every previous "everything is green" moment here was followed
   by building a new comparison that immediately found real defects** — `midi-bytes` is the
   most recent, opening at 37 differing a week after every other audio gate read zero. The
   honest phrasing is *"parity on every axis we have built a way to measure"*, never "done".

3. **A gate's reach is a property of its enumeration, not its comparison.** Twice a gate
   here read a confident zero while skipping a third of its inputs. Before concluding a
   surface is exhausted, ask what evidence EXISTS, not what the evidence says.

4. **A gate CAN name the next defect now, and that is new.** For most of this repo's life
   every table read zero and the answer was to build a surface expressing an axis none of
   the others could — eleven times over. `zzopts` is the twelfth, and it is still full: §1a's
   three unimplemented options are named work, not a hunt.

5. **Three of the four rows that cannot close are abcjs failing, not us.** Two tunes crash
   inside abcjs's own `wrapLines` and two draw a red debug string on valid input; we render
   all four. See §3.

---

## 6. Swapping abcjs for abcts on a site

Measured on 2026-09-06, not assumed.

**What is already true**

- **Zero missing symbols.** All 64 of abcjs's public symbols exist and behave;
  `Object.keys` on the built CJS bundle against abcjs 6.7.1's shows *nothing* abcjs has that
  we lack. We add a few extras, which is harmless.
- **`signature` reports `abcjs-basic v6.7.1`**, because a host that version-sniffs is
  sniffing for a behaviour contract we meet. `abctsSignature` says which engine it really is.
- **Zero runtime dependencies.**
- **The `<script>` build is browser-verified**, not just built: `zzlive` loads
  `dist/abcts-browser.global.js` in WebKit and Chrome and diffs it against abcjs live —
  **including the minification**, so a minifier that broke something would show up on 685
  byte comparisons rather than on someone's site. Re-measured 2026-09-16: **626 KB raw,
  201 KB gzipped**, against abcjs's own min build at **499 KB raw, 145 KB gzipped** — so
  **abcts is about 25% larger over the wire**, which is a real cost and is not measured
  further here. Two plausible causes, neither yet instrumented: two glyph tables are
  embedded (abcjs's for strict, Bravura's for extended), and extended is a second engraving
  path abcjs does not have. The esm/cjs builds stay unminified, because a consuming bundler
  minifies them with better information than we have.
- **The PACKAGE is prepared and NOT published** (2026-09-16). `abcts` is unclaimed on the
  npm registry. Version is **6.7.1**, naming the abcjs release this is byte-identical to —
  ⚠️ which means abcts's own fixes move the patch digit and a new abcjs to match resets the
  line. **Sourcemaps are off**: they were 12 files and ~22 MB of a 29 MB tarball, and
  turning them OFF rather than excluding them from `files` is deliberate — an exclusion
  leaves a `//# sourceMappingURL=` pointing at a file the package does not carry. The
  tarball is **2.0 MB packed / 6.9 MB unpacked, 25 files**, from 8.2 / 29.0 / 37.
- **The published artifacts are gated too** — `npm run test:dist` renders the whole corpus
  through `dist/` in ESM and CJS: 0 of 685 each.
- **The audio-control CSS still applies.** `CreateSynthControl` emits abcjs's own class names
  (`abcjs-inline-audio`, `abcjs-midi-start`, `abcjs-btn`, …), so a page already linking
  `abcjs-audio.css` keeps its styling. **We ship no CSS of our own — keep that link.**

**Speed and size, measured 2026-09-07 (re-run after the optimisation pass)**

Both engines loaded into ONE page and alternated per fixture, so they share a JS engine, a
font stack, a machine and a thermal state. `scripts/zzperf.mjs`; 231 files, 4 reps, the
first discarded as compilation. The ratio is the stable quantity — the absolute numbers
drift several percent between runs.

**A static score page** — `renderAbc` and nothing else:

| | abcjs 6.7.1 | abcts | ratio |
|---|---|---|---|
| WebKit, whole corpus (warm) | 240 ms | 293 ms | **1.22x** |
| Chrome, whole corpus (warm) | 175 ms | 242 ms | **1.38x** |
| WebKit, median per file | — | — | **1.00x** |
| Chrome, median per file | — | — | **1.20x** |

**A page with playback highlighting** — the same render, plus `tune.lines` and
`tune.noteTimings`, which both engines do real work for (`HOST=1`):

| | before the pass | after | abcjs |
|---|---|---|---|
| WebKit, whole corpus | 1.62x | **1.32x** | 247 ms vs 327 ms |
| Chrome, whole corpus | 1.87x | **1.50x** | 186 ms vs 279 ms |
| WebKit, median per file | 1.41x | **1.12x** | |
| Chrome, median per file | 1.63x | **1.29x** | |

**A page renders a tune in about a millisecond either way**, and in WebKit the median tune
is now exactly abcjs's speed. Nothing here is within an order of magnitude of mattering for
a page with a handful of tunes. The worst single fixture is `abcts-midi`, a 40-tune `%%MIDI`
directive file.

⚠️ **The MEDIAN and the TOTAL disagree on purpose** — a corpus total is dominated by its
largest tunes, and a site renders whatever it renders. Both are reported rather than one
being picked.

⚠️ **AND THE FIRST PER-FILE TABLE WAS NOISE.** `performance.now()` is clamped to 0.33 ms in
WebKit as a Spectre mitigation, and most fixtures render in under one tick, so a
single-render timing gave `0.00x`, `NaNx` and `Infinityx` ratios — beside an aggregate that
was perfectly sound, because 231 files sum well past the quantum. Each file is timed over
20 renders now. A broken per-file column can live beside a correct total.

**Bundle size**, brotli, minified both sides: abcjs 123 KB, abcts **160 KB** — **1.30x**,
down from 1.43x on 2026-09-08. ⚠️ **And it is NOT a TypeScript cost** — types are stripped
at build and the shipped file is JavaScript. It was TWO GLYPH TABLES where abcjs has one:
31% of the bundle was path data, and 89 of Bravura's 119 outlines could never be drawn once
both modes started using abcjs's. Those paths are gone (their metrics are still read); the
rest of the gap is the remaining second table and a larger feature surface.

⚠️ **AND THE MICRO-OPTIMISATION WELL IS DRY, which is worth writing down so it is not
re-dug.** After the three levers that landed, five more were implemented and measured:
`deepFreeze` walking with `for…in` instead of `Object.keys` (0.1% / 5.9% / 0.3% across
runs — under the noise floor), an integer fast path in `roundNumber` (**1.9% SLOWER** — the
guard costs more than the string round-trip saves, because coordinates rarely are
integers), a render-scoped text-width cache (**3.3% slower** — building the string key
costs more than the character walk), dropping `split('\n')` from the same function (−0.3%
then +7.2%), and the two rejected in the audit. **Every one was reverted.** The machine's
run-to-run noise is ±5%, the remaining hot spots are each under 6% of self time and
diffuse, and a change to byte-parity-critical code that measurement cannot defend is churn.


**What the swap needs**

- **The global is `ABCTS`, not `ABCJS`** — deliberately, so both can load in one page.
  A `<script>`-tag host writes `window.ABCJS = window.ABCTS` itself.
- **Bundler hosts** import `abcts/compat`, which is the abcjs-shaped surface.
  The bare `abcts` entry is the core API and is a different shape.
- **`package.json` is not release-ready**: `version` is `0.0.0`, and there is no
  `repository`, `homepage`, `browser`, `unpkg` or `jsdelivr` field, so a CDN will not resolve
  the script build by default. Those are release decisions, not defects.

**One helper abcts adds that abcjs has no equivalent for**

`synth.notesAvailable(visualObj, params)` → `{ inMemory, inCache, missing, error,
soundFontUrl }`, answering **which sounds the user already has, before playing**. abcjs's
`init` reports `{loaded, cached, error}`, but that is what a load DID, after the fetching,
and it only sees this page's memory. Use it for a prefetch decision, a progress bar, or an
"available offline" badge.

`inCache` is the **Cache API** — a service worker's store, or one you filled yourself. The
HTTP cache is not readable by anything, so a note the browser would in fact serve from disk
is still reported `missing`; the honest answer to an unanswerable question is the
pessimistic one. It is abcts's own symbol, not abcjs's, so the drop-in surface is untouched.

**What to smoke-test on the site itself**

1. **Playback makes sound**, and the soundfont fetch is not blocked. Default URL is
   `https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/` — same as abcjs, so an
   existing CSP already allows it, but check if the site passes its own `soundFontUrl`.
2. **Anything reading `abcjs-extended`** — `renderAbc(target, abc, { mode:
   'abcjs-extended' })`. That param is abcts's one addition to abcjs's, it defaults to
   `abcjs-strict`, and it reaches the parse, the layout, the measure widths and the
   emitter. (It did not exist until 2026-09-07; extended was reachable only through
   `ABCTS.core.render`.)

   ⚠️ **If you do go through `core.render`, pass the same options compat does or you are
   comparing pipelines rather than modes**: `classes: 'abcjs'`, `staffSpace: 7.75`, and
   `systemWidth` (the PAGE — there is no `staffwidth` option on `render`, so one passed
   there is silently dropped). All three caught out this repo's own comparison site.
3. **The editor**, if the site uses `abcjs.Editor` — it is implemented and gated on 14
   cases, but against recorded call sequences rather than a live textarea.

---

## How to re-run all of it

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts       # every command from here

npx tsc --noEmit && echo OK                  # before anything else
npx vitest run --testTimeout=180000          # 89 files, 2,639 tests

npm run build                                # zzlive loads dist/, a stale bundle lies
PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzlive.mjs
ENGINE=chrome PW=… node scripts/zzlive.mjs
```

⚠️ **The browser harness needs `playwright-core` whose webkit revision matches the cached
browser.** `~/Library/Caches/ms-playwright` currently holds `webkit-2311`, which is
**playwright-core 1.61.0**; a mismatch fails with "Executable doesn't exist" and a misleading
"just run `npx playwright install`". `/tmp` is cleaned periodically and leaves EMPTY
directories behind, which reads as a corrupt install rather than a missing one — reinstall
into `/tmp/gp/pw` rather than debugging it.

⚠️ **The suite times out under machine load and it is not a defect.** One run on 2026-09-06
reported three reds with a `Failed to start forks worker` at 592 seconds; the same tree
re-ran green at 2,470 in 19. Re-run before believing a red.

Each gate writes its ranked table to `/tmp/abcts-*.txt`. Those files **outlive the run**, so
a stale one has twice been mistaken for a result — check the timestamp.
