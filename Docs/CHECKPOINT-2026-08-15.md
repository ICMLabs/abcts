# CHECKPOINT — 2026-08-15

Continues `CHECKPOINT-2026-08-14.md`. That session built the 41-fixture byte gate and took
it from 38 differing to 13. This one took it to **1**, and that one row is 57% byte-exact
through 2,007,011 bytes with its next cause measured and written at the code site.

---

## 1. THE GATES

| Gate | Start of session | Now |
|---|---|---|
| **SVG bytes, in-repo corpus (178 rows)** | 0 | **0** |
| **SVG bytes, 41-fixture corpus (113 rows)** | 13 | **1** |
| `svg-bytes-sibling` ratchet | 100 | **112** |
| Audio events / timings / element timings / chord grids / MIDI | 0 of 72 / 38 / 13 / 23 / 3 | unchanged |
| Harvested geometry / pixel targets / DOM contract | 0 of 174 / 120 / 25 | unchanged |

Suite 1445/1446. **THE ONE RED IS NOT OURS** — `content-parity`'s `S7-voices`, a fixture
edited in `../abcMusicKit` on 2026-08-12 whose goldens were never regenerated. Do not
bisect it (`CHECKPOINT-2026-08-12.md` §5).

---

## 2. WHAT LANDED — twenty-one fixes, one commit each

Every one came from a pair of numbers printed out of both engines in one sitting.

### The extent — what a staff reserves

1. **A beamed grace's stem reaches the staff when its OWN note is beamed.**
   `layout/voice.js:9-14` re-runs `voice.adjustRange` over every beam's elems once
   `layoutBeam` has run, and a beamed grace's stem is hung on the MAIN NOTE by
   `parent.addRight` (`layout/beam.js:117, 143`). Found by walking both page cursors term
   by term: the split between the system height and `addStaffPadding` moved 12.521px and
   summed back — **TWO ERRORS CANCELLING**, leaving one ULP of `height`.
2. **A flag reserves its anchor pitch and nothing else.** `create-note-head.js:49` passes
   no `thickness`. **THE DECLARED BOX AGAIN**, the fourth kind of element to want it.
3. **A curve's reserve carries the PITCH it was built from**, and **a beam-pinned curve end
   reserves in PITCH** — `PlacedLine.pitchRange` already had the number `fixedOf` needed.
4. **A moved rest shifts a PITCH, not a y** — `-(p − d)·STEP`, not `−p·STEP + d·STEP`.

### The constructed offset — `child.x = this.x + child.dx`

5. **A key signature's `dx`**, 6. **a grace note's accidental** (abcjs's two steps),
7. **a notehead's `shiftheadx`** — the last of these was tried on 2026-08-14 as
`accidentalWidth + dx` and took the gate from 0 to 23; the right term is the shift alone,
and a DISPLACED head is where the derivation shows.

### Document order

8. **A grace beam goes out before its group's own beam** at the same element.
9. **A chord's ties all key on the ELEMENT**, not on the head each one hangs off.

### Curves

10. **A grace slur ends on the chord's LAST head.** 11. **A note that CLOSES a slur is not
an internal note.** 12. **A slur's `hasDownStem` reads the notes BETWEEN the anchors.**
13. **`highestVert` compensates from the chord's TOP head.** 14. **A chord's tie hangs on
its OWN notehead.** 15. **A chord can tie SOME of its heads** — `[B-eg-b-]`, a parser and
model gap.

### Placement

16. **A slide hangs off `roomtaken`.** 17. **A bracket takes the same left edge as a
brace.** 18. **A dynamic does not move with the voice-overlap displacement.** 19. **A
chord's `dotshiftx` is the head width PLUS 2**, the mirror of `roomTaken`.
20. **A mid-tune text row's baseline comes off the PAGE's cursor.**
21. **Stem direction is the MEAN of every pitch, not the midpoint of the extremes** — and
`>= 6`, so the middle line stems down.

---

## 3. WHAT IS LEFT — one row

    ragtime-nightingale   1137504/2007011

`anchorBelowStaff`'s shift lands a below dynamic on `inkBottom` only if its raw y IS
`stepToY(dynamicBelowStep)`. That file's third `mp` is built six pitch off it — abcjs
draws it at PITCH -7, the staff's own ink bottom before the lane is taken, and ours at -1.

The EXTENT is not the culprit, which is the useful half: our `PROBE staff` reads `bottom=-8`
for that staff, which IS abcjs's -14 in the probe's `+6` convention. So either the raw lane
the mark was built on is not `dynamicBelowStep`, or the stack put it a lane deeper than
abcjs's single `positionY.volumeHeightBelow`. Written in full at the `shift` line with both
engines' numbers.

**One known gap behind it**: the FLATTENER still reads `tiedToNext` alone, so a partly-tied
chord re-articulates every head in the AUDIO. No audio gate covers one —
`ragtime-nightingale` is not in that corpus — and the note is at `Chord.tiedPitches`.

---

## 4. THE HARNESS

Ours, all gated, all in `src/renderer/layout.ts` unless noted:

| Var | Prints |
|---|---|
| `ABCTS_Y` | the page walk term by term — `Y lead`, `Y sysLead`, `Y gap`, `Y sys` |
| `ABCTS_H` | each staff's two `heightPitch` terms and the running total |
| `ABCTS_PL` | `placeElement`'s offset for a glyph landing near `Number(ABCTS_PL)` |
| `ABCTS_SP` / `ABCTS_XX` | the line solve's spacing pass and its per-element `x`/`minx`/`nextx` |
| `ABCTS_PROBE` | staff extents with the contributing source line, plus every glyph's box |
| `ABCTS_CHECK` | asserts the walked staff origin against the system-relative one |

abcjs, in the SCRATCHPAD COPY at `/tmp/gp/abcjs` (NEVER `../abcMusicKit`):

| Var | Prints |
|---|---|
| `ABCJS_MOVEY` | every `moveY`, with its call site |
| `ABCJS_TOP` / `ABCJS_ABSY` | `staff.top` around `setUpperAndLowerElements`; each staff's origin |
| `ABCJS_BOT` | the BELOW lanes — `staff.bottom` and `positionY.*Below` with the `specialY` that drove them |
| `ABCJS_ADJ` / `ABCJS_ADJ2` | the voice's and the element's `top` being raised, with the child that did it |
| `ABCJS_BDRAW` | a beam's start/end PITCH and its `calcY` before rounding |
| `ABCJS_RELX` | every named relative element's `x`, `dx` and `parent.x` |
| `ABCJS_INNER` | `avoidCollisionAbove`'s internal notes, their max, and both ends |
| `ABCJS_CRESC` / `ABCJS_DYN` | a hairpin's ends and anchors; a dynamic's `anchor.x` and pitch |
| `ABCJS_SLUR` / `ABCJS_SYM` / `ABCJS_NM` / `ABCJS_XX` / `ABCJS_DOT` | as `CHECKPOINT-2026-08-14.md` §5 |

`/tmp/gp/abcjs/src/write/creation/abstract-engraver.js:234` carries an UNGATED
`console.error("VOICE s"…)` from an earlier session. Harmless — walk.js's own output goes to
stderr too — but grep, do not eyeball.

**Multi-tune fixtures must be walked WHOLE.** `walk.js` on a single extracted `X:` renders
at a different width for a tune that overflows, so the x's do not match the golden. Pass the
fixture.

---

## 5. THE LESSONS THIS SESSION PAID FOR

- **PRINT THE SAME QUANTITY FROM BOTH ENGINES IN ONE SITTING.** All twenty-one. Three of
  them closed questions an earlier session had reasoned about and got wrong.
- **TWO ERRORS CANCELLING LEAVE ONLY THE ASSOCIATION.** When a total is right and a split
  is wrong, the split is the bug.
- **A RULE PORTED IN HALF LOOKS LIKE A RULE THAT DOES NOT APPLY**, and the narrowing gets
  written down as the finding. Five this session, each with a comment beside it explaining
  why the missing half was correct — `noReserve`, "no fixture has yet shown the difference",
  the slide, the bracket's left edge, `hasDownStem`.
- **A MEASUREMENT THAT RULED SOMETHING OUT CAN BE READ TOO NARROWLY.** The notehead-`dx`
  probe said the offset was zero on an UNDISPLACED head; the note beside it concluded there
  was nothing to carry at all. There was.
- **READ THE BASELINE DIFF'S SHAPE.** A pure re-split, a uniform -0.775 on grace beams, five
  ties gaining exactly 9.810, three dots gaining exactly 2.000 — each would have been
  alarming without the shape.
- **WHEN A TEST ENCODES THE OLD BELIEF, IT IS PART OF THE FIX.** Two hairpin unit tests
  asserted a queue and a dropped open; abcjs does neither.
