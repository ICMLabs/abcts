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
| **SVG bytes** | **`svg-bytes`** | **171 of 171 — best 5186, median 174** (from 651 / 162) |

**Suite 1130 of 1130. NO REDS. `npx tsc --noEmit` clean.**

---

## 1. THE HEIGHT IS BLOCKING 109 OF THE 171 ROWS — READ THIS FIRST

`svg-bytes`'s median is **174** and its masked median is **1097**. The gap is one
attribute: **109 of the 171 fixtures first differ on the root's `height`**, and every one
of those differences is one or two ULPs in either direction —

```
got  height="227.68050000000002"      want height="227.6805"
got  height="176.0775"                want height="176.07750000000001"
got  height="505.5102030764843"       want height="505.51020307648423"
```

**It is arithmetic ORDER, not formatting.** abcjs accumulates `renderer.y` in PIXELS —
`y += padding.top`, `y += move`, `y += spacing.music`, `y += staffGroup.height * STEP` —
and closes with `h = y + padding.bottom` (`draw/draw.js`, `draw/set-paper-size.js:3`). We
accumulate the same quantity in STAFF SPACES and multiply by 7.75 at the end.

**MEASURED, so this is not re-derived**: rewriting only the LAST step in pixels —
`(height - 2 * marginY) * 7.75 + 30`, or with `15 + 15` — takes 69 of 171 exact to **70**.
The noise is spread through the whole accumulation, not concentrated in the margins.

So this is the VERTICAL half of the emission-quantum problem the horizontal arc already
knows by name, and closing it means carrying the vertical cursor in pixels. It is the
single highest-yield item on the board: **109 rows are invisible behind it.**

**To see past it while working on anything else**, `/tmp/probe4.mjs` (recreate from this
checkpoint) runs the same comparison with `height="…"` masked in BOTH strings and writes
`/tmp/probe-noheight.txt`. That is what named every family below. **It is a PROBE, not a
gate** — nothing in `tests/` may grow that mask.

**AND WITH THE HEIGHT MASKED, ALMOST EVERYTHING LEFT IS THE SAME PROBLEM.** The masked
table's largest families are now `M 57.840999999999994` against `M 57.841` and a `clefs.G`
whose y differs in the last digit — the HORIZONTAL and VERTICAL halves of one thing. The
mechanism is visible in one line: `flagX = headX + headInk - spaces(ABCJS_PX.flagStemInset)`
divides an abcjs pixel by 7.75 and the emitter multiplies it back. **Every abcjs constant
that enters as `px / 7.75` and leaves as `* 7.75` loses bits on the round trip.** Closing it
means the strict path holding pixels, which is the structural pass — see
`CHECKPOINT-2026-08-08d.md` for the terms it must be held to.

---

## 2. WHAT CLOSED, AND WHY EACH WAS INVISIBLE

Twelve landings, every one a read of a named abcjs function.

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

1. **THE ROOT'S `height` — 109 of 171 rows.** §1. Accumulate the vertical cursor in
   PIXELS. Highest yield on the board by a wide margin, and everything behind it is
   currently unmeasurable by the real gate.
2. ~~**THE ORDER INSIDE A NOTE GROUP**~~ — **CLOSED.** Kept because the rule is worth
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
3. **A STEM AND A LEDGER ARE DIFFERENT EMITTERS.** A stem is `printStem`'s form —
   `d="M x y1L x y2L x2 y2L x2 y1z"`, no separators between commands, NO `stroke`/`fill`
   inside a group, `class` BEFORE `data-name` (`draw/print-stem.js:32-42`) — where a ledger
   and a staff line are `printLine`'s, with spaces and `data-name` BEFORE `class`
   (`draw/print-line.js:30-35`). Ours writes one form for all three. **The stem's `x` and
   `x + dx` are the head's EDGES and `dx` carries the stem's SIDE**, which `PlacedLine`
   does not record — a down-stem writes the right edge first.
4. **Glyph coordinate noise — ~22 rows.** `M 54.78099999999999` against
   `M 54.781000000000006`, and a `clefs.G` whose Y differs in the last digit. Same
   emission-quantum family as the height, and the clef rows are the VERTICAL half of it,
   so §1 may close them too.
5. **A tie/slur is `drawArc`'s TWO-CUBIC closed path** with `data-name="tie"`/`"slur"`
   and a `class` from the anchors' measure/note counters (`draw/tie.js:57-102`); a beam is
   `drawBeam`'s single concatenated `M…L…L…L…z` path with `class="abcjs-beam-elem
   abcjs-d0-25"` (`draw/beam.js:34-43`). Ours are a `<path class="abcjs-tie">` and a
   `<polygon>`.
7. **`oneSvgPerLine` / `responsive` / `scale`** — five cases in `svg-per-line.test.js`.
8. **`el-four-endings`** — `|1,3 … :|2,4 …`. A DECISION, not a bug fix.
9. **The geometry half of the timing join** — `left`, `endX`, `top`, `height` on every
   `noteTimings` row. A gate to BUILD.
10. **The structural pass** — terms in `CHECKPOINT-2026-08-08d.md`, not to be re-argued.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1130 / 1130
svg bytes           171 of 171   best 5186, median 174   (masked-height median 1087)
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
