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
| DOM contract | `dom-contract` | **22 of 25 cases** (from 25), **248 of 648 rows** (from 86) — three slugs RATCHETED |
| **SVG bytes** | **`svg-bytes`** | **164 of 171 — SEVEN BYTE-EXACT AND RATCHETED**; best 5186, median 175 (from 171 of 171 at 651 / 162) |

**Suite 1137 of 1137. NO REDS. `npx tsc --noEmit` clean.**

---

## 1. THE HEIGHT IS THREE PROBLEMS, NOT ONE — MEASURED

`svg-bytes`'s median is **175** and its masked median is **1241**, with the max EXACT. Most
rows still first differ on the root's `height`, and the temptation is to read that as one
defect. **It is three**, and the split is measured (`/tmp/probe9.mjs`, recipe below):

```
80 of 171   EXACT
84 of 171   differ by pure ULP noise — relative error under 1e-12
 7 of 171   differ by more, and 2 of those are 1e-11 relative — so FIVE are structural
```

**THE STRUCTURAL ONES ARE WORTH MORE THAN THE 82.** They are real vertical defects that no gate in this
repo can state — `pixel-parity` and the harvested table pair NOTEHEADS, so a page that is
300px too short with every note in the right place reads as perfect. One of them has
already closed and took SEVEN fixtures to byte-exact with it; a second closed two more, and
`BottomText` a third time (§2). **The five that are left are named in WHAT IS LEFT** and
none of them is a whole feature any more.

The 82 are the `px / 7.75` round trip, and one line shows the mechanism:
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

**TWO PROBES, and the handoff carries both recipes.** `/tmp/probe4.mjs` runs the byte
comparison with `height="…"` masked in BOTH strings and writes `/tmp/probe-noheight.txt` —
that is what named every markup family closed here. `/tmp/probe9.mjs` splits the heights
into exact / ULP / structural, which is what found the deleted line. **Both are PROBES —
nothing in `tests/` may grow that mask.**

---

## 2. WHAT CLOSED, AND WHY EACH WAS INVISIBLE

Fifteen landings, every one a read of a named abcjs function.

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
  rules, which are the parts worth keeping.
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

1. **THE FIVE STRUCTURAL HEIGHTS, all measured and none of them a whole feature:**
   - `visual-mouse-click-01` and `visual-tablature-15` — 23.175px SHORT, and **it is not
     the bottom block**: `visual-selection-01` carries the same `W:`/`H:`/`S:` fields and
     is exact, and this one's four bottom rows step 49.27 / 72.54 / 26 exactly as abcjs's
     do. The difference is above them, in the music.
   - `visual-options-01-fonts` — 81.2px short. Every font in it is set `box`, and a boxed
     font measures `height + padding * 4` (`ENGRAVE.fontBoxPadding`); the top block already
     applies that and the bottom one does not. It also sets `%%header`/`%%footer`, which
     `TopText`/`BottomText` draw only when `isPrint`.
   - `synth-timing-10-stretchlast-1` — 7.75px, exactly one staff space, on a two-line tune
     with `%%stretchlast 1` and a tie across the break.
   - `visual-tablature-20-score-1-2` and `visual-transpose-05` — 1e-11 relative, which is
     the ULP family wearing a slightly bigger number.
2. ~~**`BottomText`**~~ — **LANDED.** `creation/elements/bottom-text.js` was the whole spec
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
2. **THE ROOT'S `height`'s ULP HALF — 82 rows.** §1. Accumulate the vertical cursor in
   PIXELS, which is the same change that closes the glyph-coordinate tail.
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
8. **`oneSvgPerLine` / `responsive` / `scale`** — five cases in `svg-per-line.test.js`.
9. **`el-four-endings`** — `|1,3 … :|2,4 …`. A DECISION, not a bug fix.
10. **The geometry half of the timing join** — `left`, `endX`, `top`, `height` on every
   `noteTimings` row. A gate to BUILD.
11. **The structural pass** — terms in `CHECKPOINT-2026-08-08d.md`, not to be re-argued.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1137 / 1137
svg bytes           164 of 171   best 5186, median 178   (masked-height median 1241, max EXACT)
                    PASSING ratchet: 7 slugs, the first this table has ever held
heights             80 exact / 84 ULP-only / 5 structural
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13
chord-grid ranked   0 of 23
midi ranked         0 of 3       BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
DOM contract        22 of 25     (248 of 648 rows, from 86)
                    PASSING ratchet: dom-ledger, svg-12-8-group, svg-single-note
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.**
