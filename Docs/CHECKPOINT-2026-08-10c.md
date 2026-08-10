# abcts — Checkpoint, 2026-08-10c — **THE BYTE TABLE HAS PASSING SLUGS, AND THE DOM CONTRACT IS THE INSTRUMENT**

Supersedes `CHECKPOINT-2026-08-10b.md` for the STATE. That file keeps the SVG-frame arc and
the first seven byte-exact fixtures. `-08-10.md`'s §4 is closed. `-08-09b.md` keeps the
count-in ladder, the chord grid, `setTiming`, the third audio surface and the decoration-x
finding. `-08-09.md` keeps the tempo gate, the byte-exact MIDI file and the audit of
abcjs's `tests/` folder. `-08-06.md` keeps **THE HARNESS**, which is superseded by §1 here.

---

## THE GOAL, UNCHANGED

> **abcts exists to build an abcjs-modern whose output — the SVG FILE and the AUDIO — is
> 100% BYTE-EQUAL to abcjs 6.7.0.**

A tolerance is a defect that has not been written down yet. Anything we decline to
reproduce goes in `Docs/ABCJS-DIFFERENCES.md` with its evidence and its slug goes in
`svg-bytes.test.ts`'s `DIVERGENT` list. **That list is still EMPTY.**

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
| **DOM contract** | **`dom-contract`** | **11 of 25 cases, 216 of 312 rows — FOURTEEN slugs RATCHETED** |
| **SVG bytes** | **`svg-bytes`** | **164 of 171 — SEVEN BYTE-EXACT AND RATCHETED**; best 5186, median 179 |

**Suite 1148 of 1148. NO REDS. `npx tsc --noEmit` clean.**

Both open tables started the day at every case: `svg-bytes` 171 of 171 at best 651 / median
162, `dom-contract` 25 of 25 at 86 of 694 rows with an empty PASSING list.

---

## 1. THE HARNESS, AND IT IS BIGGER THAN IT WAS

**abcjs ITSELF IS RUNNABLE**, from `../abcMusicKit/Tools/abcjs-debug` (jsdom is installed
there):

```bash
cd /Users/lrettberg/ICMLabs/Code/abcMusicKit/Tools/abcjs-debug
ABCJS_VERSION=6.7.0 node dump-svg.js      --file /tmp/ladder/rung.abc --output rung.svg
ABCJS_VERSION=6.7.0 node dump-elements.js --file /tmp/ladder/rung.abc --output rung.json
```

Both render at `{ staffwidth: 670 }` — the goldens' own params — so a control is directly
comparable with `renderAbc(abc, {staffwidth: 670})`. **A LADDER OF CONTROLS THROUGH BOTH
ENGINES IS A FIVE-MINUTE OPERATION**, and it is where most of today's findings came from.

**`ABCJS_VERSION` IS NOT OPTIONAL — `dump-svg.js:14` DEFAULTS TO 6.6.3.** A ladder run
without it said a second header `T:` costs no staff separation, which reads as a defect in
the 6.7.0 branch this engine already ports and is just the older engine answering correctly
for itself. **THE ORACLE HAS A VERSION AND THE DEFAULT IS THE WRONG ONE.**

**`dump-elements.js` PUBLISHES abcjs'S OWN `staff.top`/`staff.bottom`.** It settled the tie
reserve in one step after two wrong inferences had each cost an implementation — **ask it
which box is in play rather than reading the three candidates in `tie-element.js` and
picking**.

### And two PROBES, neither of which may ever become a gate

- `/tmp/probe4.mjs` — the byte comparison with `height="…"` masked in BOTH strings, writing
  `/tmp/probe-noheight.txt`. Median 1241 with it masked, against 179 without.
- `/tmp/probe9.mjs` — classifies every height into exact / ULP / structural. **This is what
  found the deleted line**, and it is the reason the height was not treated as one bug.

Recipes for both are in `Docs/HANDOFF-2026-08-10c.md`.

---

## 2. THE HEIGHT WAS THREE PROBLEMS, AND TWO OF THEM CLOSED

```
80 of 171   EXACT          (from 69)
86 of 171   ULP noise      relative error under 1e-12
 5 of 171   larger         and 3 of those are 1e-11 — so TWO are structural
```

**THE STRUCTURAL ONES WERE WORTH MORE THAN THE 86**, and every gate here was blind to them:
`pixel-parity` and the harvested table pair NOTEHEADS, so a page 300px too short with every
note in the right place reads as perfect. Six closed today (§3). **The two that remain are
`visual-mouse-click-01` and `visual-tablature-15` at 3.875px — one PITCH — and FOUR LADDERS
rule out what they are not**: a subtitle between voice lines of the FIRST system, of the
LAST system, a mid-tune `%%sep` and a trailing `%%sep` are all exact on height. Do not
re-measure those.

The ULP rows are the `px / 7.75` round trip — see §5.

---

## 3. WHAT CLOSED — FORTY-ONE LANDINGS, EVERY ONE A READ OF A NAMED FUNCTION

### The document's frame
- **`staffwidth` is the MUSIC area**; the page is it plus abcjs's 15px margins. 42 rows drew
  `L 655` where abcjs writes `L 685`, and **no geometry gate could see it** — they all render
  with NO staffwidth and take the default, which was already right.
- **The outer `<g>` is not abcjs's — it is `abcjs-meta-top`**, closed before the first
  staff-wrapper, **and an empty group is DELETED** (`svg.js:364-372`). Same rule deletes an
  empty staff-lines group.
- **The page is `maxwidth + padding`**, the requested staff width raised by any line too
  stiff to compress and REPLACED by a `%%staffwidth`. Now `Layout.pageWidth`, distinct from
  `Layout.width`. **And one division, not two additions**: `w / 7.75 + 2 * (15 / 7.75)`
  re-multiplied gives 295.99999999999994 where abcjs writes 296.

### Text
- **A trailing article moves to the front of a title** (`theReverser`, eleven end-anchored
  patterns, first match wins, with a leading `N.` lifted off and put back).
- **A `T:` after the music is the TITLE when no earlier one claimed it** — `setTitle`
  branches on `hasMainTitle`, NOT on position.
- **The top-text block is placed on the PAPER, absolutely** — title at
  `paddingLeft + width/2` (350 on a 700px page), composer at `paddingLeft + width`,
  `%%center` at `width/2` with NO padding (335). **CHECKPOINT-2026-08-10 §4, closed.** The
  failed attempt recorded there changed the width handed to `topTextBlock` and moved
  nothing, because the value it computed was overwritten four hundred lines later. **WHEN A
  CHANGE TO AN INPUT MOVES NOTHING, THE OUTPUT IS NOT READING THAT INPUT.**
- **A `<text>`'s x AND y are rounded to two decimals** (`draw/text.js:63-64`) — the
  "unmeasured" item from this arc's first checkpoint, now measured.
- **`BottomText` — `W:`, `B:`, `S:`, `D:`, `N:`, `Z:`, `H:`** — an entire missing feature
  worth 262, 274 and 297px. `simplifyMetaText` JOINS `notes` and `history` into one `\n`
  string so they draw as ONE `<text>` advancing by `round(height * 1.1 * numLines)` — one
  rounding for the whole block — while an EMPTY line is a row of its own that advances by
  the RAW height with no `* 1.1` and no rounding.
- **A block with no system after it was DRAWN NOWHERE**, and **a block written INSIDE a
  system is drawn AFTER it** — for every system but the first those are the same place,
  which is why only the first was wrong.
- **A mid-tune block is drawn at the TOP of the gap**, not the bottom: abcjs runs the
  nonMusic line while `renderer.y` is still the previous group's bottom. The total is
  identical either way, so no height moved and no gate could see it.
- **A `%%sep` rule is its OWN emitter** and a trailing one was dropped on the floor. **The
  "0.15px block-top residual" recorded beside it was the half-pixel of a thickness that
  should not have existed** — a markup defect read as a placement one.

### Geometry
- **A line with no note and no barline is DELETED** (`containsNotes` tests
  `el_type === 'note' || 'bar'`), so a tune with a header and no music draws NO STAFF —
  **this took the first seven fixtures to byte-exact**.
- **A staff whose voice says nothing on this LINE is dropped from it**, per staff.
- **A tie ARRIVING from the system above reserves `pitch ± 4` as INK** — the second half of
  a split tie has a null `anchor1` and its closing note IS on that line, so `setEndAnchor`
  runs; the first half never gets one, which is why a tie at the END OF THE TUNE costs
  nothing. **Two wrong inferences preceded the measurement.**
- **An inline `[M:]` before any music on the FIRST line is that line's prefix.**

### Markup
- **A glyph carries ABSOLUTE coordinates baked into its first `M`**, its own `data-name`,
  and NO separator between path commands (91 outlines carried a stray `z `).
- **abcjs draws the music FIRST, then the beams, then everything else** — 48 rows, and
  **document order is not a coordinate**, so no gate here could express it.
- **`data-index` counts SELECTABLES**, admitting a note and a rest and nothing else.
- **A notehead is named with the WRITTEN note**; a **multi-character symbol is ONE group**
  with unnamed children; a **top-text row carries its class**; a **`P:` label names itself
  and carries its group's COUNTERS twice**; a **bar number is the bar's FIRST child**.
- **THE COUNTERS ADVANCE AFTER THE ELEMENT IS DRAWN** (`draw/voice.js:41-46`), so a child
  generated inside an element sees the counters the group was named with.
- **A beam's class is GENERATED** (`beam-elem` + duration), empty without `add_classes`, and
  `classes.startMeasure()` RESETS the counter to 0 before the beams.
- **A grace gets LEDGER LINES** (we drew none), its head is NAMED, and its STEM is written
  after every grace head.
- **TWO `dots.dot`, NOT ONE BRAVURA `repeatDots`** — and that glyph is not in abcjs's table
  at all, so it fell through to Bravura's with `scale(7.75)` on it. **A BRAVURA FIGURE
  REACHABLE IN STRICT — the class the 2026-08-05 audit closed** — which survived because no
  gate reads a barline's glyphs. **And the dot columns INTERLEAVE with the rules.**

---

## 4. TWO GATES WERE READING THE MARKUP THEY MEASURED, AND THE RATCHET CAUGHT A REGRESSION

`glyph-ycorr` filtered glyphs as "a `<path>` with no `data-name`" and `compat`'s density
test read `transform="translate(` — both true only of OUR output, and both broke the moment
the markup got CLOSER to abcjs's. Same shape as the `viewBox` removal that took 196 tests
red. **A gate built on our own markup fails when we succeed**; the failure is the signal.

**AND THE PASSING RATCHET EARNED ITSELF.** Splitting the pitch run also broke the
`<g data-name="12">` that wraps a multi-character time signature — `svg-12-8-group` was in
`PASSING` and failed in the SAME RUN that took the aggregate from 22 differing to 15. **The
count improved while something regressed, and only the ratchet said so.**

**AND THE BASELINES CAUGHT ONE INSIDE A FIX**: the grace beam pass walks `graceLines` BY
INDEX and assumes every entry is a stem, so pushing the new grace ledgers straight in moved
every grace stem. The tell was the diff's SHAPE — it had REMOVALS, and a new feature should
only ever add.

---

## 5. THE TAIL IS ONE PROBLEM, AND v1 HAS ALREADY ANSWERED IT

With `height` masked, **every family at the head of the byte table is the `px / 7.75` round
trip** — `M 57.840999999999994` against `M 57.841`, and a `clefs.G` whose y differs in the
last digit. One line shows the mechanism:

```ts
const flagX = headX + headInk - spaces(ABCJS_PX.flagStemInset)
```

an abcjs pixel divided by 7.75 that the emitter multiplies back. **Every abcjs constant that
enters as `px / 7.75` and leaves as `* 7.75` loses bits**, and the root's `height` is the
same defect on the vertical axis.

**Lance, 2026-08-10c: *"v1 port from js encountered similar rounding issue — so v1 may have
the solution used to get to byte parity to js."* It did, and there is NO CLEVER ROUNDING:
`abcMusicKit` v1 NEVER INTRODUCED A SECOND UNIT.** It holds abcjs's own PIXELS end to end —
`Spacing.STEP = 3.875`, `calcY(pitch) = staffAbsoluteY - pitch * STEP`,
`roundNumber = parseFloat(x.toFixed(2))` for paths and text, plain JS `String(number)` for
the raw `width`/`height`. **We already do every one of those.** What we do that v1 does not
is divide by 7.75 and multiply back.

**AND IT MET THIS EXACT PROBLEM AT THE ONE PLACE A SCALE HAD TO EXIST**, `Spacing.swift:41-43`:

> `stepScale` (default 1.0) applies a per-staff `staffscale=` factor to STEP — extended-only;
> strict passes 1.0 → `pitch * STEP * 1.0 == pitch * STEP` exactly (byte-identical). Written
> `pitch * STEP * stepScale` (not `pitch * (STEP * stepScale)`) to keep the 1.0 path
> bit-for-bit.

**That is the structural pass in miniature: the strict path's expression must never contain
a CONVERTED constant, and a mode factor goes on the OUTSIDE where 1.0 is the identity.** A
working byte-parity engine settles it — it is no longer a judgement call.

The workspace rule still stands: read v1 for WHAT its output is and for architectural facts
like this one, **never port an algorithm out of it**.

---

## WHAT IS LEFT, IN YIELD ORDER

1. **THE LEDGER IS LAST, AND THE DECORATION AND LYRIC COME BEFORE IT.** Measured today and
   NOT yet implemented — abcjs's contract for `!fermata!C…` and for `CDEF|` + `w:`:

   ```
   note:  C, stem, scripts.ufermata, ledger
   note:  C, stem, lyric,            ledger
   ```

   So the element's own order is `[flag, dots, accidental, head] → stem → decoration /
   lyric / chord → LEDGER`, and only a BEAMED stem comes after the ledger (`dom-beam` reads
   `C, ledger, stem`). Ours puts the ledger with the stem and everything else after it.
   **Three cases move on this one change** — `dom-decorations` 11/26, `dom-lyrics` 11/27,
   and part of `dom-chord-symbols`. Note that a LYRIC is a `<text>`, so the "texts last"
   rule in the emitter has to bend with it.
2. **THE NAMED CHILDREN.** Each is one `data-name` plus a generated class, and each is
   measured in `tests/corpus-dom/*.json`:
   - a LYRIC — `class="abcjs-lyric …abcjs-n0" data-name="lyric"`,
   - a CHORD symbol — `class="abcjs-chord …" data-name="chord"`,
   - a TEMPO mark's parts — `data-name="beats"` and its siblings,
   - a TUPLET — `data-name="triplet"` with `abcjs-triplet abcjs-d0-167 …`, where ours says
     `triplet-bracket`.
3. **A DYNAMIC IS NOT A CHILD OF THE NOTE.** `dom-dynamics` wants it at DEPTH 1, its own
   element; ours nests it inside the note at depth 2.
4. **A SLUR AND A TIE CARRY ANCHOR-DERIVED CLASSES** —
   `abcjs-start-m0-n0 abcjs-end-m0-n3 abcjs-slur abcjs-legato …` with `data-name="slur"`,
   and `…abcjs-slur abcjs-tie…` with `data-name="tie"` (`draw/tie.js:6-20`). The measure and
   note counters come from the ANCHORS' own `parent.counters`.
5. **AN ENDING IS A GROUP, and the bracket is ONE path** — `<g class="{generated ending}"
   fill data-name="ending">` holding a single `<path data-name="line">` whose `d` carries
   every segment, then its number in `repeatfont` (`draw/ending.js:27-45`). Six rows of
   `dom-bars`, which is otherwise 63 of 69.
6. **THE `px / 7.75` ROUND TRIP** — §5. The whole remaining byte tail and the root's
   `height`, one change, with v1's technique to copy.
7. **The last two structural heights** — 3.875px, one pitch, with four ladders already
   ruling out what they are not.
8. **A MEASURE CAN CARRY ONLY ONE `meterChange`, and `svg-time-sig-list` needs three.**
   `[M:2/4]y[M:3/4]y[M:4/4]` has no barline in it, so all three belong to ONE measure and
   `Measure.meterChange` keeps the last. abcjs draws all three, each as its own
   `staff-extra time-signature`, because **a `y` SPACER does not open a measure**.
9. **A GRACE BEAM's own class and order** — `abcjs-beam-elem abcjs-d0 …`, ahead of the grace
   slur. Two rows of `dom-grace`, which is otherwise 20 of 22.
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
npx vitest run      1148 / 1148
svg bytes           164 of 171   best 5186, median 179   (masked-height median 1241)
                    PASSING ratchet: 7 slugs
DOM contract        11 of 25     (216 of 312 rows)
                    PASSING ratchet: 14 slugs
heights             80 exact / 86 ULP-only / 5 larger (2 structural)
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13
chord-grid ranked   0 of 23
midi ranked         0 of 3       BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.**
