# ABCJS DEBT — what we do abcjs's way ON PURPOSE, and what the clean version would be

**This is not a bug list and not `ABCJS-DIFFERENCES.md`.** Those two say where abcts is
WRONG and where it deliberately DIVERGES. This one says where abcts is deliberately
**worse-shaped than it needs to be** because byte parity with abcjs 6.7.0 demands abcjs's
arithmetic, its order, or its data model rather than the better one.

> **The ruling it exists to serve** (Lance, 2026-08-11): *"abcjs behavior is what we're
> shooting for, we can optimize later."* Later needs a list, or "later" is a rediscovery
> exercise. Every entry here was a decision, not an accident.

## How to use it

- **The marker is `abcjs-debt:`** — one line in the code at the site, naming this file.
  `grep -rn "abcjs-debt:" src` is the index; this file is the reasoning.
- It is a SEPARATE class from `ponytail:`, which marks OUR OWN deliberate simplifications
  (a global lock, an O(n²) scan, a naive heuristic). A `ponytail:` is a corner we cut. An
  `abcjs-debt:` is a corner **abcjs** cut that we are obliged to cut with it.
- **Nothing here may be "fixed" while `svg-bytes` is open.** Each entry states the gate that
  will go red if it is, so the cost of touching it is knowable in advance.
- **When any of it IS refactored, the test is the same one every change here takes:** the
  suite green, `pixel-parity` 0 of 120, `corpus-abcjs-ranked` 0 of 174, `svg-bytes` no
  worse, and NO BASELINE MOVED.

## The one rule that governs all of it

Strict mode has no latitude. `abc2.1` and `extended` are where the better shape belongs, and
several entries below are already gated on `strict` for exactly that reason — the clean
version runs in the other modes today. **An entry that is NOT so gated is the interesting
kind: it means the shape leaked into code both modes share.**

---

## 1. ARITHMETIC WE DELIBERATELY DO WORSE

### 1.1 `Math.sqrt(dx * dx + dy * dy)` instead of `Math.hypot`
`svg.ts`, `curveToPath`'s strict branch.

`Math.hypot` is the more accurate of the two — it scales to avoid intermediate overflow —
and that is exactly why it is wrong here. Every control point of a slur or tie is derived
from `norm`, so one ULP of difference lands a coordinate on the far side of a `toFixed(2)`
boundary: 155.47 against abcjs's 155.46, on five fixtures.

**Clean version:** `Math.hypot`. **Cost of switching:** five `svg-bytes` fixtures.
**Scope:** strict only — the core path never reaches this branch.

### 1.2 Endpoints rounded BEFORE the curve is built, then not again
`svg.ts`, same branch.

`drawArc` opens `x1 = roundNumber(x1 + 6)` and derives `norm`, `flatten` and four control
points from the ROUNDED chord (`draw/tie.js:63-67`). Rounding once at the end is both
cheaper and more accurate. **Clean version:** round on output only. **Cost:** the same five
fixtures, plus every curve whose control lands near a hundredth.

### 1.3 `roundNumber` is `parseFloat(x.toFixed(2))`, not `Math.round(x * 100) / 100`
`svg.ts`, `round2`. The two disagree on a decimal half, and a beam's second edge is computed
FROM the rounded first. String formatting in a hot path is the cost. **Clean version:** the
arithmetic form. **Cost:** three fixtures when it was last measured.

### 1.4 The `px / 7.75` round trip is GONE, and its replacement is a DOUBLE representation
`layout.ts`, `verticalExtent` → `{ top, bottom, topPitch, bottomPitch }`;
`PlacedGlyph.reservePitch`; `PlacedLine.pitchRange`; `StaffFurniture.curveReserves`'
`topPitch`/`bottomPitch`.

`calcHeight` sums `staff.top` and `-staff.bottom` in PITCH and multiplies by `STEP` once
(`creation/calc-height.js:8-10`), and every contributor is a pitch expression abcjs never
converts. Recovering the pitch by dividing the y back is a different double —
`x * STEP / STEP` is not `x`. So the extent carries **both numbers for the same edge**, and
every producer that knows its pitch passes it alongside the y it also computes.

**Clean version:** ONE representation. Either the whole layout works in pitch and converts
at the emitter (which is what abcjs does and what v1 does), or it works in px and the height
is allowed to differ in the last bits. **Cost of collapsing to px:** 23 root elements go
back to ULP-differing, and the number will grow as more producers supply pitch.
**Cost of collapsing to pitch:** a very large refactor — the placement, the springs and
every emitter read the y.
**This is the biggest single entry in the file and it is only half built** — see
`CHECKPOINT-2026-08-11.md` §3 for the half that is done and the inter-system gap that is not.

### 1.5 A notehead's reserve is `stepToY(step) ± half`, and the "abcjs-shaped"
### `stepToY(step ± halfPitch)` is deliberately NOT used
`layout.ts`, `layoutNoteheads`.

Writing it as the pitch expression adds a multiply AND a divide where the y form has only
the divide, and MEASURABLY made the extent worse (`1.0447741935483865` against abcjs's exact
`1.044774193548387`). The pitch form is supplied SEPARATELY as `reservePitch`; the y stays
as it is because the PLACEMENT wants a y. **Recorded at the site so it is not tried a third
time.**

### 1.6 A block's span keeps a single division where everything else moved to pitch
`layout.ts`, the page walk's `heightPitch`.

`blockSpan` is a LENGTH with no pitch of its own — abcjs never puts the top text into
`staff.top` at all — so `-(top + blockSpan) / STEP` stays one rounding. Splitting it cost
nine `visual-title-*` fixtures. **Clean version:** none; this one is correct as it stands and
is listed so the asymmetry is not "tidied".

---

## 2. SHAPES WE REPRODUCE THAT ARE MORE WORK THAN THEY NEED TO BE

### 2.1 A dynamic is drawn LETTER BY LETTER with a kern table
`layout.ts`, `DYNAMIC_LETTERS` / `kernDynamic`; `svg.ts`, the dynamics loop.

SMuFL precomposes `dynamicPPPP` as ONE kerned glyph. abcjs draws four `p` outlines and
adjusts the advance for three specific pairs (`draw/print-symbol.js:16-57`), so `pppp` is
four paths inside a group instead of one path. **Clean version:** the precomposed glyph, in
`abc2.1`/`extended`. **Cost in strict:** every multi-letter dynamic in the corpus.
**Note:** `sfz` still draws precomposed because this repo's Bravura table has no
single-letter `s` or `z` — that one is a DIVERGENCE and belongs in `ABCJS-DIFFERENCES.md`
if a fixture ever reaches it.

### 2.2 Ledger lines are a step-1 loop with a parity test
`layout.ts`, `ledgerLines`.

`for (i = maxPitch; i > 11; i--) if (i % 2 === 0)` walks every pitch and discards half of
them, where `i -= 2` from the nearest even one visits exactly the rules it draws. The loop
SHAPE is what fixes the ORDER (outermost first), which is why it is transcribed rather than
re-derived. **Clean version:** start at the nearest even step and stride by two.
**Cost:** none to the output — this one is pure cycles, and is the cheapest entry here to
pay off.

### 2.3 `otherchildren` is reproduced by sorting two buckets by x
`svg.ts`, the `others` array.

abcjs holds ONE interleaved list in add order and walks it (`draw/voice.js:64-90`). We hold
dynamics and spanners in separate arrays and merge them by x, which is the add order **for a
single voice** and an approximation for anything else. **Clean version:** one ordered
`otherchildren` list built during layout, which is also the faithful port.
**Cost:** none today; this is the entry most likely to become a DEFECT rather than debt —
a triplet or an ending interleaved between two dynamics would already be in the wrong place.

### 2.4 The below-dynamics lane is anchored twice, in two places
`layout.ts`, `anchorBelowStaff` stamps `LayoutStaff.dynamicShift`; the system merge spends it
on `spannerLines`.

`spannerLines` is EMPTY when the anchoring runs — spanners resolve across the whole tune,
after packing — so the shift has to be recorded and applied later. abcjs has no such split:
`setUpperAndLowerElements` sees every child at once. **Clean version:** resolve spanners
before the lanes, or make the lane a value the emitter reads rather than a mutation.
**Cost:** none to the output; this is a phase-ordering wart, and the comment at the site says
so.

### 2.5 Nine layout passes per line
`layout.ts`, the justification loop. **MANDATED** — finding 104. abcjs re-solves the line
after each of its adjustments and the answers differ. 220 tunes render in 151ms, 0.7ms each,
so there is nothing to win here; it is listed only so a future perf pass does not
"discover" it and remove it. See `CHECKPOINT-2026-08-08d.md`.

### 2.6 Text is measured with the GOLDEN GENERATOR's tables
`golden-widths.ts` — five ASCII per-character tables picked by SIZE alone, three of six
brackets resolving to `repeatfont` because their key does not exist, and a flat **8** for
every character outside them.

This reproduces `dump-svg.js`'s `getBBox` stub, which is what the goldens were generated
with — not real font metrics. `abcMusicKit` v1 reproduces the same fallback on purpose.
**Clean version:** real per-em metrics, which `abc2.1`/`extended` already use.
**Cost in strict:** every text position in the corpus. Gated at one place.

---

## 3. QUIRKS REPRODUCED THAT LOOK LIKE BUGS AND ARE NOT OURS

Each of these is a place a future reader will reach for the "fix". They are abcjs's, they are
load-bearing for byte parity, and they are cited so the reach stops here.

| What it looks like | Where | abcjs's own line |
|---|---|---|
| `lineEndX` is the voice width **minus one** | curve split, `layoutCurves` | `var width = params.w - 1` (`draw/voice.js:12`) |
| An ending's segments end with a trailing space; a triplet's do not | `bracketGroup` | `sprintf("… ")` vs `drawLine` (`ending.js:14`, `triplet.js:18`) |
| A box's `d` has DOUBLED spaces at every joint | `boxPath` | `lines.join(" ")` over pieces that each end with one (`svg.js:130-140`) |
| `drawDynamics` and `drawCrescendo` order their two classes differently | dynamics / spanners | `'decoration dynamics'` vs `'dynamics decoration'` |
| A grace ledger is inset by ONE where a note's is inset by two | `ledgerLines`' `grace` arm | `grace.dx - 1` (`abstract-engraver.js:522`) |
| A lyric's last verse ends with a newline, so it draws an EMPTY tspan | lyric text | `lyricStr += … + "\n"` (`abstract-engraver.js:770-773`) |
| A percussion clef's glyph line and pitch mapping disagree | `CLEF_NAMES` / `CLEF_REFERENCE` | `{ pitch: 6, mid: 0 }` (`abc_parse_key_voice.js:35`) |
| A subtitle is paper-centred and a `%%center` is not | `appendFreeText` | `width/2 + padding.left` vs `width/2` |
| A tempo's pre-text gap is ONE AVERAGE CHARACTER | `layoutTempo` | `charWidth = preWidth / length` (`draw/tempo.js:22-23`) |
| The spring is `spacing * sqrt(duration * 8)` and not a pre-divided constant | `PROFILES` | `abcjs`'s own expression, at a base of 30px |

---

## 4. WHAT IS **NOT** IN THIS FILE

- **Real divergences** — anything abcts declines to reproduce — go in
  `ABCJS-DIFFERENCES.md` with their evidence, and their slug goes in `svg-bytes.test.ts`'s
  `DIVERGENT` list. That list is EMPTY and stays empty.
- **Our own shortcuts** stay on their `ponytail:` markers.
- **Structural cruft that is nobody's fault** — `layout.ts` at 11k lines, 49% comment —
  is a refactor question, not an abcjs one. `CHECKPOINT-2026-08-08d.md` holds the terms any
  such pass must be held to, of which the first is: **NO BASELINE MAY MOVE.**
