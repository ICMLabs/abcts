# CHECKPOINT — 2026-08-15

Continues `CHECKPOINT-2026-08-14.md`. That session built the 41-fixture byte gate and took
it from 38 differing to 13. This one took it to **6**, closed the last in-repo height ULP,
and wrote three fully-diagnosed findings down instead of half-fixing them.

---

## 1. THE GATES

| Gate | Start of session | Now |
|---|---|---|
| **SVG bytes, in-repo corpus (178 rows)** | 0 | **0** |
| **SVG bytes, 41-fixture corpus (113 rows)** | 13 | **6** |
| `svg-bytes-sibling` ratchet | 100 | **107** |
| Audio events / timings / element timings / chord grids / MIDI | 0 of 72 / 38 / 13 / 23 / 3 | unchanged |
| Harvested geometry / pixel targets / DOM contract | 0 of 174 / 120 / 25 | unchanged |

Suite 1440/1441. **THE ONE RED IS NOT OURS** — `content-parity`'s `S7-voices`, a fixture
edited in `../abcMusicKit` on 2026-08-12 whose goldens were never regenerated. Do not
bisect it (`CHECKPOINT-2026-08-12.md` §5).

---

## 2. WHAT LANDED

Nine fixes and four measurements, one commit each.

### 2.1 A beamed grace's stem reaches the staff when its OWN note is beamed

`layout/voice.js:9-14` re-runs `voice.adjustRange` over every beam's elems once
`layoutBeam` has run — *"The above will change the top and bottom of the abselem children,
so see if we need to expand our range."* A beamed GRACE's stem is built in that same pass
and `parent.addRight(stem)` hangs it on the MAIN NOTE (`layout/beam.js:117, 143`), so it
reaches `staff.top` after all, but only when that main note is itself in a beam. A grace
beam never does: its `elems` are the pseudo-objects `{heads, abcelem}` and `adjustRange`
reads an undefined `top`.

Found by printing the page walk from both engines term by term — `ABCTS_Y=1` against
`ABCJS_MOVEY=1` — where the first two systems agreed and the third split 12.521px between
the system's own height and `addStaffPadding`'s top-up. **TWO ERRORS CANCELLING**, so only
the association survived, and that was one ULP of `height`.

### 2.2 A grace beam's line holds abcjs's EDGE, not a centre it must undo

A `PlacedLine` carries a beam's centre and `beamPath` takes half a thickness back off.
`(274.465 + 0.775) - 0.775` is `274.46500000000003`, the far side of `toFixed(2)`.
`ABCJS_BDRAW` prints what abcjs rounds: `calcY 274.465`, and `(274.465).toFixed(2)` is
"274.46" because the double is really 274.46499999999997. `PlacedLine.edgeY` says the line
already holds the edge.

### 2.3 A flag reserves its anchor pitch and nothing else

`create-note-head.js:49` passes no `thickness`, so `RelativeElement` leaves `top === bottom
=== pos` and a flag adds no height. Ours took the ink box, which for an UP flag hangs 32px
BELOW its anchor. **THE DECLARED BOX AGAIN** — the fourth kind of element to want it.

### 2.4 A key signature's `dx` is CARRIED to the placement

`placeElement` recovered each accidental's offset as `g.x - el.x`, and that subtraction does
not give back what went in: a third flat built at `180.7056274847714 + 14.8` comes back as
`14.800000000000011`. abcjs never subtracts — `child.x = this.x + child.dx`. Ruled out the
line solve first: `ABCTS_XX` and `ABCJS_XX` print the same cursor chain to the last digit.

### 2.5 A grace note's accidental carries abcjs's two-step `dx`

`accPlace = extrax` then `accPlace -= (getSymbolWidth(symb) * scale + 2)`, added once onto
`abselem.x`. The frame the 2026-08-12 attempt could not find is pinned by two probes in one
sitting: `GA graceNoteX 154.27922061357856` and `PL elx 154.27922061357856` are the same
number, so the element's x IS `graceNoteX`.

### 2.6 A slide hangs off `roomtaken`, not off the notehead

`decoration.js:51-59` builds `!slide!`'s blanks at `-roomtaken - 15` and `-roomtaken - 5`.
`J^c` starts its slide 10.25px left of where `Jc` does; ours drew all three of X:808's
slides at the bare-note offset, and the first one matching is why it read as correct.

### 2.7 At the same element, a grace beam goes out before the group's own

`createBeam` adds each member's grace beam through `createNote` and only then
`voice.addBeam`. Both paths were already byte-identical, in the other order.

### 2.8 A grace slur ends on the chord's LAST head

`createNote` reassigns `noteHead` per pitch and hands the survivor to `addGraceNotes`, so
`anchor2` is the HIGHEST pitch. `{G}[G4e4]` gives abcjs `ARC pitch1 2.5 pitch2 7.5` where
ours drew flat. NOT the `pitches[0]` rule an ordinary slur follows.

### 2.9 A note that CLOSES a slur is not an internal note

`addInternalNote` hangs off an `else if (!isGrace)` under `if (pitchelem.endSlur)`. In
`((c2 (3(d)ef) e2)` abcjs has ONE internal note; ours had three, which fired
`avoidCollisionAbove` and flattened both ends.

### 2.10 A slur's `hasDownStem` reads the notes BETWEEN the anchors

`calcSlurDirection` walks `internalNotes`; `calcTieDirection` does not. `(ABCD)` has two
stem-up anchors and an internal `B` on the middle line with its stem down, so abcjs draws
ABOVE and ours drew below — 23px.

---

## 3. THE FOUR MEASUREMENTS (written at the code site, not fixed)

Each is fully diagnosed. None is one line.

| Row | Cause | What closing it needs |
|---|---|---|
| `multi-voice-rest-placement` | `fixVoiceCollisions` shifts a PITCH (`children[0].pitch -= distance1`); ours shifts a y. `-p*STEP + d*STEP` vs `-(p - d)*STEP` | `verticalExtent`'s `edge` returning PITCH — a `reservePitch` on the rest and a pitch for the LINES the scan reads |
| `S5-directives-tune1` | A mid-tune text row's baseline takes the LOCAL chain. Both engines put the cursor at `158.01500000000001`; ours adds 21 to `158.015` | a `pageY` for mid-tune rows: each row's index into `advances`, and the walk that spends them |
| `S1-decorations-tune2` | abcjs's hairpin slot is SINGLE (a second `(` REPLACES the first) and `endLine` closes it at each ABC line's last child; a stray `)` starts at `firstNote(voice.children)`, which is EMPTY on a line's first element → `left = 0` | the ABC SOURCE LINE, which `ScoreModel` does not record. A system is not that partition once `\` or two short lines share one |
| `ave-verum-corpus` | the BRACE — `curvyPath`'s two cubics off seven-point tables, drawn after its own staff's lines | the largest single piece left; see `layoutConnectors` |

The first two are **the same page-cursor rework in two domains**, and doing them together is
probably cheaper than either alone.

---

## 4. WHAT IS LEFT — 6 of 113

    S1-decorations-tune2   134391/166603   hairpin — §3
    S8-layout-tune10       102878/249348   ULP on a chord notehead's x (see below)
    S5-directives-tune1     25410/137574   mid-tune %%text baseline — §3
    multi-voice-rest…        8976/19506    moved rest's pitch — §3
    ave-verum-corpus          1554/93004   BRACE — §3
    ragtime-nightingale        198/2007011 height ULP, one digit, cause not yet located

`S8-layout-tune10` prints `M 862.3369999999996` for abcjs's `…998` on a `^c` notehead
inside `[^c^d^c']`-class chords. `ABCTS_PL` did not fire on it, so it is NOT
`placeElement`'s derived offset; it is built somewhere else. **A carried `dx` on the
NOTEHEAD was tried on 2026-08-14 and took `svg-bytes` from 0 to 23** — the probe printed
`at 75.48861713702905  el.x 34.64101615137754  g.x 34.64101615137754  derived 0`, so the
offset there is genuinely zero. Do not retry that without a fresh measurement.

---

## 5. PROBES ADDED THIS SESSION

Ours, all gated, all in `src/renderer/layout.ts`:

| Var | Prints |
|---|---|
| `ABCTS_Y` | the page walk term by term — `Y lead`, `Y sysLead`, `Y gap`, `Y sys` |
| `ABCTS_PL` | `placeElement`'s offset for a glyph landing near `Number(ABCTS_PL)` |
| `ABCTS_SP` / `ABCTS_XX` | the line solve's spacing pass and its per-element `x`/`minx`/`nextx` |
| `ABCTS_PROBE` | staff extents with the contributing source line, and now every glyph's contributed box |

abcjs, in the SCRATCHPAD COPY at `/tmp/gp/abcjs` (NEVER `../abcMusicKit`):

| Var | Prints |
|---|---|
| `ABCJS_MOVEY` | every `moveY`, with its call site |
| `ABCJS_TOP` | `staff.top` before and after `setUpperAndLowerElements`, and each `incTop` |
| `ABCJS_ADJ` | `VoiceElement.adjustRange` raising the voice's top, with the child's type |
| `ABCJS_ADJ2` | `AbsoluteElement._addChild` raising the element's top, with the child |
| `ABCJS_BDRAW` | a beam's start/end PITCH and its `calcY` before rounding |
| `ABCJS_RELX` | every named relative element's `x`, `dx` and `parent.x` |
| `ABCJS_INNER` | `avoidCollisionAbove`'s internal notes, their max, and both ends |
| `ABCJS_CRESC` | a hairpin's `left`, `right` and whether each anchor exists |
| `ABCJS_SLUR` / `ABCJS_SYM` / `ABCJS_NM` / `ABCJS_ABSY` | as `CHECKPOINT-2026-08-14.md` §5 |

`/tmp/gp/abcjs/src/write/creation/abstract-engraver.js:234` carries an UNGATED
`console.error("VOICE s"…)` from an earlier session. Harmless — walk.js's own output goes to
stderr too — but grep, do not eyeball.

---

## 6. THE LESSONS THIS SESSION PAID FOR

- **PRINT THE SAME QUANTITY FROM BOTH ENGINES IN ONE SITTING.** Every one of the nine fixes
  came from a pair of numbers, and two of them (§2.1, §2.5) closed questions that an earlier
  session had reasoned about and got wrong.
- **TWO ERRORS CANCELLING LEAVE ONLY THE ASSOCIATION.** §2.1's 12.521px moved from one term
  to another and summed back to the same page position; all that survived was one ULP.
  When a total is right and a split is wrong, the split is the bug.
- **A RULE PORTED IN HALF LOOKS LIKE A RULE THAT DOES NOT APPLY**, and the narrowing gets
  written down as the finding. §2.1's `noReserve`, §2.10's "no fixture has yet shown the
  difference", §2.6's slide — three this session, each with a comment beside it explaining
  why the missing half was correct.
- **A HALF-UNDERSTOOD FIX IS WORTH LESS THAN A WRITTEN-DOWN MEASUREMENT**, and so is a
  fully-understood fix that would be half-built. §3's four are diagnosed to the line.
- **READ THE BASELINE DIFF'S SHAPE.** §2.1's was a pure re-split (system origin up by
  exactly what the staff origin came down); §2.2's was a uniform -0.775 on grace beams and
  nothing else. Both would have been alarming without the shape.
