# abcts — Checkpoint, 2026-08-10b — **THE SVG'S FRAME AND ITS MARKUP**

Supersedes `CHECKPOINT-2026-08-10.md` for the STATE. That file's **§4 — the title's
centre — IS CLOSED**, and how it was closed is the lesson worth keeping (below).
`-08-09b.md` keeps the count-in ladder, the chord grid, `setTiming`, the third audio
surface and the decoration-x finding. `-08-09.md` keeps the tempo gate, the byte-exact
MIDI file and the audit of abcjs's `tests/` folder. `-08-06.md` keeps **THE HARNESS**.

---

## THE GOAL, UNCHANGED

> **abcts exists to build an abcjs-modern whose output — the SVG FILE and the AUDIO — is
> 100% BYTE-EQUAL to abcjs 6.7.0.**

A tolerance is a defect that has not been written down yet. Anything we decline to
reproduce goes in `Docs/ABCJS-DIFFERENCES.md` with its evidence and its slug goes in
`svg-bytes.test.ts`'s `DIVERGENT` list. That list is still EMPTY.

---

## STATE

| surface | gate | standing |
|---|---|---|
| MIDI file | `midi-file-ranked` | **BYTE-EXACT, 0 of 3** |
| audio event list | `audio-ranked` | 0 of 72 |
| note timings | `timing-ranked` | 0 of 38 |
| element timings | `timing-elements` | 1 of 13 — abcjs's own quirk |
| chord grid | `chord-grid-ranked` | 0 of 23 |
| harvested geometry | `corpus-abcjs-ranked` | 0 of 174 |
| pixel geometry | `pixel-parity` | 0 of 120 |
| DOM contract | `dom-contract` | **13 of 25 cases** (from 25), **184 of 390 rows** — TWELVE slugs RATCHETED |
| **SVG bytes** | **`svg-bytes`** | **164 of 171 — SEVEN BYTE-EXACT AND RATCHETED**; best 5186, median 179 (from 171 of 171 at 651 / 162) |

**Suite 1146 of 1146. NO REDS. `npx tsc --noEmit` clean.**

---

## 1. THE HEIGHT IS THREE PROBLEMS, NOT ONE — MEASURED

`svg-bytes`'s median is **175** and its masked median is **1241**, with the max EXACT. Most
rows still first differ on the root's `height`, and the temptation is to read that as one
defect. **It is three**, and the split is measured (`/tmp/probe9.mjs`, recipe below):

```
80 of 171   EXACT
85 of 171   differ by pure ULP noise — relative error under 1e-12
 6 of 171   differ by more, and 2 of those are 1e-11 relative — so FOUR are structural
```

**THE STRUCTURAL ONES ARE WORTH MORE THAN THE 82.** They are real vertical defects that no gate in this
repo can state — `pixel-parity` and the harvested table pair NOTEHEADS, so a page that is
300px too short with every note in the right place reads as perfect. One of them has
already closed and took SEVEN fixtures to byte-exact with it; a second closed two more, and
`BottomText` a third time (§2). **The five that are left are named in WHAT IS LEFT** and
none of them is a whole feature any more.

The ULP rows are the `px / 7.75` round trip, and one line shows the mechanism:
`flagX = headX + headInk - spaces(ABCJS_PX.flagStemInset)` divides an abcjs pixel by 7.75
and the emitter multiplies it back. **Every abcjs constant that enters as `px / 7.75` and
leaves as `* 7.75` loses bits**, and the same is true of every glyph coordinate — so the
horizontal tail and the vertical one are ONE defect, closed by the strict path holding
pixels. That is the structural pass; see `CHECKPOINT-2026-08-08d.md` for its terms.

The ULP differences look like this, in both directions —

```
got  height="227.68050000000002"      want height="227.6805"
got  height="176.0775"                want height="176.07750000000001"
got  height="505.5102030764843"       want height="505.51020307648423"
```

**It is arithmetic ORDER, not formatting.** abcjs accumulates `renderer.y` in PIXELS —
`y += padding.top`, `y += move`, `y += spacing.music`, `y += staffGroup.height * STEP` —
and closes with `h = y + padding.bottom` (`draw/draw.js`, `draw/set-paper-size.js:3`). We
accumulate the same quantity in STAFF SPACES and multiply by 7.75 at the end.

**MEASURED, so the shortcut is not repeated**: rewriting only the LAST step in pixels —
`(height - 2 * marginY) * 7.75 + 30`, or with `15 + 15` — took 69 of 171 exact to **70**.
The noise is spread through the whole accumulation, not concentrated in the margins.

**AND abcjs ITSELF IS RUNNABLE — THIS IS THE HARNESS, AND IT WORKS TODAY.** From
`../abcMusicKit/Tools/abcjs-debug` (jsdom is installed there):

```bash
cd /Users/lrettberg/ICMLabs/Code/abcMusicKit/Tools/abcjs-debug
ABCJS_VERSION=6.7.0 node dump-svg.js      --file /tmp/ladder/rung.abc --output /tmp/ladder/rung.svg
ABCJS_VERSION=6.7.0 node dump-elements.js --file /tmp/ladder/rung.abc --output /tmp/ladder/rung.json
```

**AND `dump-elements.js` PUBLISHES abcjs'S OWN `staff.top`/`staff.bottom`.** It settled the
tie reserve in one step after two wrong inferences had each cost an implementation — ASK IT
WHICH BOX IS IN PLAY rather than reading the three candidates in `tie-element.js` and
picking.

**`ABCJS_VERSION` IS NOT OPTIONAL — `dump-svg.js:14` DEFAULTS TO 6.6.3.** A first ladder
run without it said a second header `T:` costs no staff separation, which reads as a defect
in the 6.7.0 branch this engine already ports and is just the older engine answering
correctly for itself. Re-run at 6.7.0 the same rung is EXACT. **THE ORACLE HAS A VERSION,
AND THE DEFAULT IS THE WRONG ONE.**

It renders at `{ staffwidth: 670 }` — the goldens' own params — so a control rendered this
way is directly comparable with `renderAbc(abc, {staffwidth: 670})`. **A LADDER OF CONTROLS
THROUGH BOTH ENGINES IS NOW A FIVE-MINUTE OPERATION**, and it is what named the tie finding
below in one run after a fixture NAME had pointed at the wrong feature for a session.

**TWO PROBES, and the handoff carries both recipes.** `/tmp/probe4.mjs` runs the byte
comparison with `height="…"` masked in BOTH strings and writes `/tmp/probe-noheight.txt` —
that is what named every markup family closed here. `/tmp/probe9.mjs` splits the heights
into exact / ULP / structural, which is what found the deleted line. **Both are PROBES —
nothing in `tests/` may grow that mask.**

---

## 2. WHAT CLOSED, AND WHY EACH WAS INVISIBLE

Thirty-one landings, every one a read of a named abcjs function.

- **`staffwidth` is the MUSIC area; the page is it plus abcjs's 15px margins.** compat
  mapped `renderAbc(…, {staffwidth: 670})` straight onto core's `systemWidth`, which is
  the PAGE — `%%staffwidth` maps `(w + 30) / 7.75` and the engine default is 700 for
  abcjs's 670. Every justified line was solved 30px narrow and drew `L 655` where abcjs
  writes `L 685`, on 42 rows. **INVISIBLE TO EVERY GEOMETRY GATE**: they all call
  `renderAbc(abc, {})` and take the default, which was already right. Only `svg-bytes`
  passes the goldens' own staffwidth.
- **The outer `<g>` is not abcjs's — it is `abcjs-meta-top`.** `draw.js:12-17` opens a
  group, runs `nonMusic`, and CLOSES it before the first staff-wrapper. **And an empty
  group is DELETED** (`svg.js:364-372`, "all the elements were invisible"), which is why a
  titleless tune's first child is the staff-wrapper and not `<g></g>`.
- **The page is `maxwidth + padding`** (`set-paper-size.js:2`) — the requested staff width
  raised by any line too stiff to compress, REPLACED by a `%%staffwidth`. It is now
  `Layout.pageWidth`, distinct from `Layout.width`, which stays the ink's bound and what
  the core viewBox is built on. **And one division, not two additions**: `w / 7.75 +
  2 * (15 / 7.75)` re-multiplied gives 295.99999999999994 where abcjs writes 296.
- **A trailing article moves to the front of a title.** `theReverser`
  (`abc_tokenizer.js:679-720`): eleven end-anchored patterns tried IN ORDER, first match
  wins, with a leading `N.` track number lifted off and put back. Runs on EVERY `T:`,
  before `setTitle` decides which it is.
- **A glyph carries ABSOLUTE coordinates and no transform.** `Glyphs.printSymbol` clones
  the outline's command array, does `pathArray[0][1] += x; pathArray[0][2] += y`, joins
  each command's parts with a space and CONCATENATES the commands with nothing between
  them (`creation/glyphs.js:132-142`). Only the opening `M` moves — everything after it is
  relative. Raw JS arithmetic AND raw JS formatting: abcjs's golden carries
  `M 29.689999999999998 22.832000000000008` for a clef at (20, 60.242), so `num()` is not
  used there.
- **…and its own name.** `RelativeElement` defaults `this.name = this.c`
  (`relative-element.js:43-48`), so a clef is `data-name="clefs.G"` and a time-signature
  figure is `data-name="3"`. The comment saying this would cost "a second table" was
  stale — `SMUFL_TO_ABCJS` was already there for `getYCorr`.
- **abcjs writes NO separator between path commands.** 91 outlines in `glyphs-abcjs.ts`
  carried `z ` where abcjs writes `z`, plus one trailing space per path. Fixed in the
  DATA, not the emitter.
- **abcjs draws the music FIRST, then the beams, then everything else.** `drawVoice` walks
  `params.children`, then `params.beams` ("beams must be drawn first for proper printing
  of triplets, slurs and ties"), then `params.otherchildren` — glissando, crescendo,
  dynamics, triplet, ending, tie (`draw/voice.js:25-90`). We drew all of it BEFORE the
  first notehead. 48 rows. **NO POSITIONAL GATE COULD SEE IT — document order is not a
  coordinate, and every gate in this repo resolves to coordinates.**
- **A NOTEHEAD IS NAMED WITH THE WRITTEN NOTE** — `create-note-head.js:34` passes
  `name: pitchelem.name`, the source letter with any EXPLICIT accidental prefixed from
  `accMap` and one `,` or `'` per octave mark, rewritten by transposition. An uppercase
  letter is octave 4 and a lowercase one octave 5, so it derives from the already
  transposed pitch and needs no source text. The chord's pitches now travel WITH their
  steps: the sort that put a chord's heads in pitch order dropped the pairing, and a name
  you cannot attribute to a head is no name.
- **A MULTI-CHARACTER SYMBOL IS ONE GROUP** with unnamed children —
  `symbol.length > 1 && symbol.indexOf(".") < 0` opens `<g data-name="12">` round one path
  per character (`print-symbol.js:14-30`). The numerator is the string AS WRITTEN, which is
  why abcjs's golden reads `data-name="2+3"` and not `5`.
- **A top-text row carries its class** under `add_classes` — `abcjs-title`,
  `abcjs-text abcjs-subtitle`, `abcjs-composer` — literal in `top-text.js` rather than run
  through `classes.generate`, so no line or measure suffix joins them.
- **A LINE WITH NO NOTE AND NO BARLINE IS DELETED — and this is what took the first seven
  fixtures to BYTE-EXACT.** `cleanUp` drops any `tune.lines[i]` whose every voice fails
  `containsNotes`, and that test is `el_type === 'note' || el_type === 'bar'`
  (`tune-builder.js:29-61`, `:888-894`) — a clef, a key and a meter are not enough. So a
  tune with a header and no music draws NO STAFF AT ALL: abcjs's golden for
  `X:43\nT: example` is 694 bytes holding a title and nothing else, and we drew an empty
  five-line stave under it. **AND THE TITLE STILL DRAWS**, because `draw()` runs
  `nonMusic(topText)` and spends `spacing.music` before it looks at a line
  (`draw/draw.js:12-18`) — a bare `X:43\nT:` is 37.56, the two margins and the music gap
  with nothing between. **NO GATE COULD SEE IT**: the pixel tables pair NOTEHEADS and these
  tunes have none.
- **A STAFF WHOSE VOICE SAYS NOTHING ON THIS LINE IS DROPPED FROM IT** — a stronger rule
  than the empty-LINE one and applied per STAFF. `cleanUp` nulls
  `tune.lines[i].staff[s]` whenever that entry is `undefined`, meaning the voice never
  appeared on the source line, and filters the nulls out (`tune-builder.js:33-60`).
  `[V:T]c|\` / `[V:B]A|\` / `[V:T]d|` is one continued line for T and a shorter one for
  B, so abcjs draws THREE staves where we drew four and ran 79px tall — counted rather
  than assumed, from the golden's three `abcjs-top-line` paths.
- **`BottomText` — `W:`, `B:`, `S:`, `D:`, `N:`, `Z:`, `H:`** — an entire missing feature
  and the largest structural height gaps in the corpus. See WHAT IS LEFT item 2 for the
  rules, which are the parts worth keeping. **A BOXED FONT MEASURES HIGHER HERE TOO**:
  `getTextSize.calc` returns `height + padding * 4` to every caller, and the bottom block
  was the one that did not apply it.
- **A `T:` AFTER THE MUSIC IS THE TITLE when no earlier one claimed it** — `setTitle`
  branches on `hasMainTitle`, NOT on position (`abc_parse_header.js:14-22`), so a tune whose
  only `T:` follows its notes is titled exactly as if the field were in the header. 13.51px.
- **A BLOCK WITH NO SYSTEM AFTER IT WAS DRAWN NOWHERE.** `score.textBelow` holds exactly
  what a tune ended with — a trailing `%%text`, a `%%center`, a mid-tune `T:` — and it was
  read in ONE place, the last-line justification test, and drawn in none. A mid-tune block
  moves to `pendingTextBefore` at the next system start, so when the tune ends before one
  it sat there instead and `finish()` never looked. TWO holes, one shape.
- **A BLOCK WRITTEN INSIDE A SYSTEM IS DRAWN AFTER IT, NOT BEFORE IT** — for every system
  but the FIRST those are the same place, which is why only the first was wrong. 27.05px
  for a `T:` and 33.77 for a `%%text`, drawn nowhere at all. Five ladder rungs.
- **A TIE ARRIVING FROM THE SYSTEM ABOVE RESERVES `pitch ± 4` AS INK** — the second half of
  a split tie has a null `anchor1` and its closing note IS on that line, so `setEndAnchor`
  runs and takes its `else` branch (`tie-element.js:35-38`). The FIRST half never gets one,
  which is why a tie at the end of the TUNE costs nothing. Two wrong inferences preceded
  the measurement; `dump-elements.js` settled it in one step.
- **A `<text>`'s x AND y ARE ROUNDED TO TWO DECIMALS** — `draw/text.js:63-64`, the same rule
  its paths take; ours wrote the emission quantum. **`%%text` sits at `paddingLeft`** and
  `%%center` at `width / 2` with no padding (`free-text.js:11`, `:37`); that row was at 0.
  **A block's INK moves with its text** — a `%%sep` rule is a line on the same element and
  the offset was applied to `texts` alone. And every nonMusic row is NAMED.
- **A MID-TUNE BLOCK IS DRAWN AT THE TOP OF THE GAP** — abcjs runs the nonMusic line while
  `renderer.y` is still the previous group's bottom, and `addStaffPadding` tops the gap up
  AFTER (`draw/draw.js:44-52`), so the slack falls below. Ours anchored from the music
  BELOW, which is right for the head block and 31.4px low here. **The total is identical
  either way, so no height moved and no gate could see it.**
- **THE ORDER INSIDE AN ELEMENT GROUP IS THE ENGRAVER'S ADD ORDER** —
  `[flag, dots, accidental, head]` per pitch, then the RULES, then everything added after
  them. And the rules are not one block: an UNBEAMED stem is `addRight` right after the
  pitch loop (`abstract-engraver.js:762`) and lands BEFORE the ledgers, a BEAMED one comes
  from the beam pass and lands AFTER. abcjs's own contract shows both, `C, ledger, stem`
  against `_B,, stem, ledger`. **The ratchet caught a regression the ranked count hid**:
  splitting the run also broke a time signature's `<g data-name="12">`, and `svg-12-8-group`
  failed the same run that took the aggregate from 22 differing to 15.
- **A BEAM'S CLASS IS GENERATED** and the measure counter RESETS before it —
  `classes.startMeasure()` runs ahead of the beams and sets the counter to 0 rather than
  opening the next measure (`draw/voice.js:50`, `helpers/classes.js:44-46`), so every beam is
  `m0 mm0` whatever bar it is in. **AND AN EMPTY STAFF-LINES GROUP IS DELETED** like every
  other empty group.
- **AN INLINE `[M:]` BEFORE ANY MUSIC ON THE FIRST LINE IS THAT LINE'S PREFIX** — the same
  lazy-line mechanism the key change takes. `meterChangeLeadsLine` hands such a change to
  the PREVIOUS measure, and the first line has none, so it was dropped outright:
  `[M:2/4]CD|` drew no time signature at all.
- **`data-index` is an index into the SELECTABLES, not into the children.**
  `Selectables.add` writes `{selectable: false, "data-index": elements.length}` and only
  after `canSelect`, which with no `selectTypes` admits `el_type 'note'` alone
  (`draw/selectables.js:15-45`). abcjs's rests are note elements, so a note and a rest
  count and NOTHING else does — a barline, a clef and a key signature carry NEITHER
  attribute. Ours carried both, with the child index in them.

---

## 3. §4 IS CLOSED, AND THE REASON THE LAST ATTEMPT FAILED IS THE LESSON

abcjs places the whole top-text block ABSOLUTELY, on the PAPER (`top-text.js`):

| row | x | anchor |
|---|---|---|
| title, subtitle | `paddingLeft + width / 2` — **350 on a 700px page** | middle |
| rhythm, part order | `paddingLeft` | start |
| composer + origin, author | `paddingLeft + width` — **685** | end |
| `%%center` | `width / 2` — **335, and NO paddingLeft** (`free-text.js:37`) | middle |

None of it depends on the music beneath. We centred the block on its own width and then
**OVERWROTE that four hundred lines later** with the finished system's
`(width - textWidth) / 2` — a LEFT-EDGE formula applied to a `middle`-anchored row.

**THE FAILED ATTEMPT recorded in `-08-10.md` §4 changed the WIDTH handed to
`topTextBlock`, and it changed nothing because the value it computed was thrown away.**
The checkpoint's own instruction — *print `width` inside `topTextBlock`; do not reason
about it from the call site* — was right about the method and pointed at the wrong
variable. The number that needed printing was the one that reached the SVG. **When a
change to an input moves nothing, the output is not reading that input.**

Two gates moved honestly with it: `proseWidth` and the "fits every text it draws"
invariant now take a row's ANCHOR into account, because a `middle` row reaches half its
width past its x and the title had been the one row placed by its left edge.

---

## 4. AND TWO GATES WERE READING THE MARKUP THEY WERE MEASURING

`glyph-ycorr` filtered glyphs as "a `<path>` with no `data-name`" and `compat`'s density
test read `transform="translate(`. Both were true only of OUR output, and both broke the
moment the markup got CLOSER to abcjs's. They name what is NOT a glyph now, and read the
baked `M`.

Same shape as the `viewBox` removal that took 196 tests red. **A gate built on our own
markup is a gate that fails when we succeed** — the failure is the signal, not the
regression, so read the diff before touching the gate.

---

## WHAT IS LEFT, IN YIELD ORDER

1. **THE TWO STRUCTURAL HEIGHTS THAT ARE LEFT — `visual-mouse-click-01` and
   `visual-tablature-15`, 3.875px TALL, one PITCH, down from 297 SHORT.** Their staff lines
   match to the hundredth and every bottom row is uniformly 3.875 too low, so it is one term
   between the last staff and the block. **FOUR LADDERS THROUGH abcjs 6.7.0 RULE OUT WHAT
   IT IS NOT** — a subtitle between voice lines of the FIRST system, of the LAST system, a
   mid-tune `%%sep` and a trailing `%%sep` are all EXACT on height. Do not re-measure those.

   **AND TWO SMALLER THINGS FELL OUT AND ONE IS STILL OPEN.** A mid-tune block is drawn at
   the TOP of the gap now, exact on the subtitle rung — but the `%%sep` rung's rule lands at
   130.85 against 131, so the block top is 0.15 out on that tune where the subtitle rung is
   exact: it is the PREVIOUS system's bottom extent, not the block. And a TRAILING `%%sep`
   draws no rule at all, though its space is reserved.
2. **THE ROOT'S `height`'s ULP HALF — 86 rows — AND `abcMusicKit` v1 HAS ALREADY ANSWERED
   THE ARCHITECTURAL QUESTION** (Lance, 2026-08-10b: *"v1 port from js encountered similar
   rounding issue — so v1 may have the solution used to get to byte parity to js"*). It did,
   and the answer is that **THERE IS NO CLEVER ROUNDING — v1 NEVER INTRODUCED A SECOND
   UNIT.** It holds abcjs's own PIXELS end to end: `Spacing.STEP = 3.875`, `calcY(pitch) =
   staffAbsoluteY - pitch * STEP`, `roundNumber` = `parseFloat(x.toFixed(2))` for paths and
   text, and `jsString` — plain JS `String(number)` — for the raw `width`/`height`. Every one
   of those we already do. What we do that v1 does not is DIVIDE BY 7.75 AND MULTIPLY BACK.

   **AND IT MET THIS EXACT PROBLEM AT THE ONE PLACE A SCALE HAD TO EXIST, AND SOLVED IT BY
   ASSOCIATION ORDER.** `Spacing.swift:41-43`, verbatim from its own comment:

   > `stepScale` (default 1.0) applies a per-staff `staffscale=` factor to STEP —
   > extended-only; strict passes 1.0 → `pitch * STEP * 1.0 == pitch * STEP` exactly
   > (byte-identical). Written `pitch * STEP * stepScale` (not `pitch * (STEP * stepScale)`)
   > to keep the 1.0 path bit-for-bit.

   That is the technique the structural pass needs in miniature: **the strict path's
   expression must never contain a converted constant**, and where a mode factor must
   appear it goes on the OUTSIDE where 1.0 is the identity. A working, byte-parity engine
   settles this — it is no longer a judgement call.

   Note the workspace rule still stands: read v1 for WHAT its output is and for
   architectural facts like this one, never port an algorithm out of it.
3. ~~**`BottomText`**~~ — **LANDED.** `creation/elements/bottom-text.js` was the whole spec
   and it is short; kept because the rules are worth having written down:
   - `W:` **unaligned words** — `spacing.words`, then the block in `wordsfont`, then one
     more `getTextSize.calc("i", 'wordsfont')` height.
   - `B:`, `S:`, `D:` — ONE line each in `historyfont`, PREFIXED with `"Book: "`,
     `"Source: "`, `"Discography: "`.
   - `N:` and `H:` — MULTI-line, prefaced `"Notes:"` and `"History:"`, in `historyfont`,
     each a group with `spacing.info` above and `size.height` below.
   - `Z:`, `%%abc-copyright`, `%%abc-creator`, `%%abc-edited-by` — one line each, prefixed
     `"Transcription: "`, `"Copyright: "`, `"Creator: "`, `"Edited By: "`.
   - the footer, PRINT ONLY, three cells at `paddingLeft`, `+ width/2`, `+ width`.

   `draw()` spends a bare `moveY(24)` before the whole block — "Empirically discovered.
   What variable should this be?" (`draw/draw.js:66`) — and wraps it in
   `abcjs-meta-bottom`. **None of these fields is on `ScoreMetadata` yet**, so this is three
   layers: parse, lay out, emit.
4. ~~**THE ORDER INSIDE A NOTE GROUP**~~ — **CLOSED.** Kept because the rule is worth
   having written down:
   `createNoteHead` builds the notehead but does NOT add it: it `addRight`s the FLAG, then
   the DOTS, then `addExtra`s the ACCIDENTAL, and only when it RETURNS does the caller
   `abselem.addHead(noteHead)` (`create-note-head.js:20-70`, `abstract-engraver.js:722-733`).
   The stem is added after every pitch, the ledgers after that. So one pitch emits

   ```
   flag  →  dots  →  accidental  →  head        then, once per element:  stem  →  ledger
   ```

   — confirmed on `abcjs-visual-layout-04`'s golden, whose note group reads
   `['dots.dot', 'accidentals.flat', '_B,', 'abcjs-stem', 'ledger']`.

   **AND THE FLAG BELONGS TO THE STEMMED HEAD OF A CHORD, NOT TO THE ELEMENT.**
   `abstract-engraver.js:671-675`: `flag = null` when
   `(dir === "down" && p !== 0) || (dir === "up" && p !== pp - 1)`. So an up-stemmed `[FA]`
   emits `F, flags.u8th, A` — head, flag, head — which is what made this look like an
   exception to a rule about flags and is in fact the rule itself.

   The three collect rather than push and one assembly pass runs where the flag used to,
   because the flag hangs off the STEM TIP and cannot be known until every head is placed.
   **The baselines moved as a pure PERMUTATION** — every removed line was also an added
   one, checked rather than assumed, so nothing moved and only the order did.
5. **A STEM AND A LEDGER ARE DIFFERENT EMITTERS.** A stem is `printStem`'s form —
   `d="M x y1L x y2L x2 y2L x2 y1z"`, no separators between commands, NO `stroke`/`fill`
   inside a group, `class` BEFORE `data-name` (`draw/print-stem.js:32-42`) — where a ledger
   and a staff line are `printLine`'s, with spaces and `data-name` BEFORE `class`
   (`draw/print-line.js:30-35`). Ours writes one form for all three. **The stem's `x` and
   `x + dx` are the head's EDGES and `dx` carries the stem's SIDE**, which `PlacedLine`
   does not record — a down-stem writes the right edge first.
6. **Glyph coordinate noise.** `M 54.78099999999999` against
   `M 54.781000000000006`, and a `clefs.G` whose Y differs in the last digit. Same
   emission-quantum family as the height, and the clef rows are the VERTICAL half of it,
   so §1 may close them too.
7. **A tie/slur is `drawArc`'s TWO-CUBIC closed path** with `data-name="tie"`/`"slur"`
   and a `class` from the anchors' measure/note counters (`draw/tie.js:57-102`); a beam is
   `drawBeam`'s single concatenated `M…L…L…L…z` path with `class="abcjs-beam-elem
   abcjs-d0-25"` (`draw/beam.js:34-43`). Ours are a `<path class="abcjs-tie">` and a
   `<polygon>`.
8. ~~**THE PER-PART CLASSES**~~ — **CLOSED, and one half of it was a WRONG READING.** Only
   the BEAM's is generated (`classes.generate('beam-elem ' + durationClass)`,
   `draw/beam.js:24-25`), which gives an EMPTY `class=""` without `add_classes` because
   abcjs passes `''` and `svg.js`'s path sets the attribute anyway. A LEDGER's is a LITERAL
   after all — `printStaffLine(…, "abcjs-ledger", "ledger", …)` (`draw/relative.js:66`) —
   and the previous note called it generated from reading a classless golden path and
   ASSUMING it was the ledger. **A path with no class is not evidence about which element it
   is.**
9. **A MEASURE CAN CARRY ONLY ONE `meterChange`, AND `svg-time-sig-list` NEEDS THREE.**
   `[M:2/4]y[M:3/4]y[M:4/4]` has no barline in it, so all three changes belong to ONE
   measure and `Measure.meterChange` keeps the last. abcjs draws all three, each as its own
   `staff-extra time-signature` — **a `y` SPACER does not open a measure**, so every one of
   them is still a STARTING element. The model has to hold a list before this can be drawn.

   (The suspicion that we invent a default 4/4 here was WRONG and a ladder said so: no
   `M:` at all draws no meter in either engine, and `M:4/4` and `M:C` were already exact.
   What was actually broken is now fixed — an inline `[M:]` before any music on the FIRST
   line is that line's prefix, and it used to be dropped outright.)
10. **`oneSvgPerLine` / `responsive` / `scale`** — five cases in `svg-per-line.test.js`.
11. **`el-four-endings`** — `|1,3 … :|2,4 …`. A DECISION, not a bug fix.
12. **The geometry half of the timing join** — `left`, `endX`, `top`, `height` on every
   `noteTimings` row. A gate to BUILD.
13. **The structural pass** — terms in `CHECKPOINT-2026-08-08d.md`, not to be re-argued.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1146 / 1146
svg bytes           164 of 171   best 5186, median 179   (masked-height median 1241, max EXACT)
                    PASSING ratchet: 7 slugs, the first this table has ever held
heights             80 exact / 86 ULP-only / 2 structural (3.875px, both the same)
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13
chord-grid ranked   0 of 23
midi ranked         0 of 3       BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
DOM contract        13 of 25     (184 of 390 rows)
                    PASSING ratchet: 12 slugs
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.**
