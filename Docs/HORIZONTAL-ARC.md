# The horizontal arc — scoped, started, not finished

Vertical parity is CLOSED and green on `geometry/lyric-ink-anchor` (505/505, 29/29 fixtures
within ceiling). This is the next arc, on `geometry/horizontal`, and it starts RED on
purpose — the first fix is right and exposes the layer under it, exactly as each vertical
fix did.

Everything below was read out of abcjs by INSTRUMENTING IT, not inferred from its output.
See `CHECKPOINT-2026-08-01.md` for the method and the restore discipline.

---

## Where the corpus actually stands

Measured off the recorded ceilings, per axis, over 29 fixtures:

| axis | median | at zero | worst |
|---|---|---|---|
| dy spread | **+0.00** | 18/29 | +58.1 |
| oy offset | **−0.20** | 3/29 | −19.6 |
| dx spread | **+16.70** | 3/29 | +110.2 |
| ox offset | **−9.60** | **0/29** | −27.3 |

Vertical is essentially done. Horizontal has had no work at all, and `ox` being negative on
every single fixture is the giveaway: the whole drawing sat left of abcjs's.

---

## What landed (`135cde1`)

Instrumenting `layout/voice-elements.js` to print every element's x gives `simple-c` outright:

```
clef            x=15.000 w=24.051      (15 = padding.left)
time-signature  x=49.051 w=11.795      (15 + 24.051 + 10)
note            x=70.846 w=9.810       (49.051 + 11.795 + 10)
```

Three constants, each now derived rather than provisional:

1. **`prefixGap` 7.75px → 10px.** abcjs's `minspacing`, flat on every `AbsoluteElement`.
2. **A clef glyph sits 5px INTO its element** — `var dx = 5` in `createClef`. Its clef
   element is 24.051 wide against a 19.051 glyph; ours was glyph-wide with the glyph flush
   left, losing 5px before the music on every staff.
3. **Key-signature accidentals step by `getSymbolWidth + 2`** (`create-key-signature.js:26`).
   Ours stepped by 0.15 of a space (1.16px), so five sharps ran 3.35px narrow.

First notehead against abcjs's own SVG: `simple-c` −9.50 → **0.00**, `twinkle` −9.50 →
**0.00**, `vree-sharps` −15.10 → **0.00**, `chord-grid` −15.28 → −5.79.

Eight fixtures' dx improved; eight widened. That is the point — the note spacing had been
compensating for the prefix error.

---

## The core of the arc: a SPRING/ROD split

**Our base spacing curve already matches abcjs's.** It advances `spacing * sqrt(duration * 8)`
with `spacing` starting at 30 (`getSpacingUnits`, `updateNextX`); ours is
`spacingScale * sqrt(d * 16)` with the abcjs profile's 2.7372 spaces = 21.2px, and
`21.2 * sqrt(2)` = 29.98. Do not go looking there.

The difference is everything around it:

```js
// layout/voice-elements.js
voice.minx = x + getMinWidth(child);          // ROD  — the element's own width
if (notLast) voice.minx += child.minspacing;  //        plus a flat 10
voice.nextx = x + spacing * sqrt(dur * 8);    // SPRING — the duration advance
x = Math.max(voice.minx, voice.nextx);        // whichever is larger WINS
```

- **We have no rod.** `naturalWidth` floors at `minColumnGap` and never at the element's
  own width, so a wide element — an accidental, a dotted chord, a chord symbol — does not
  push its neighbour right the way abcjs's does.
- **Our columns are per-MEASURE**, and justification multiplies whole measure widths
  (`columnWidths[i] * justify`). abcjs justifies by solving for the spring alone:

```js
// layout/layout.js:100  calcHorizontalSpacing
relSpace   = spacingUnits * spacing;
constSpace = lineWidth - relSpace;              // rods, held FIXED
spacing    = (targetWidth - constSpace) / spacingUnits;
if (spacing * minSpace > 50) spacing = 50 / minSpace;   // the absolute guard
```

  and iterates it up to 8 times (`setXSpacing`), re-laying out each pass.

### What is already right — do not go looking here

Two things were measured and are NOT the problem:

- **The base spacing curve.** Ours is abcjs's, to three decimals (above).
- **The note rod.** abcjs's is `getMinWidth(child) + minspacing` = `child.w + 1` — 1, not
  the 10 a bar or staff-extra gets (`abstract-engraver.js:808` vs `:959`). Ours added 4.65px.
  Correcting it to abcjs's 1px changed NOT ONE number in the corpus, because the spring
  always wins at these durations: a 16th's spring is 21.2px against a ~14px rod, and only a
  32nd would bind. It is now abcjs's constant and it buys nothing.

### Unjustified lines are now EXACT

`simple-c`, which does not stretch, matches abcjs's drawing gap for gap:

```
abcjs  42.4 42.4 42.4 53.4 42.4 42.4 42.4
ours   42.4 42.4 42.4 53.4 42.4 42.4 42.4
```

So the ONLY thing left on this axis is what happens when a line is stretched.

### The remaining work: an iterative spring solve

Decompose a column into rod + spring, stretch only the spring, and iterate to the target
width. The iteration is not optional and abcjs's 8-pass loop is not laziness: the advance is
`max(rod, factor * spring)`, so the total width is a piecewise-linear function of the factor
and cannot be inverted in one step. Each pass re-solves with the set of springs that
currently win:

```
factor = 1
for (8 passes):
    width    = sum over elements of max(rod_i, factor * spring_i)
    springs  = sum of spring_i where factor * spring_i > rod_i     // only these stretch
    rods     = width - factor * springs                            // everything else
    if |width - target| < 2px: break                               // abcjs's own tolerance
    if springs <= 0: break
    factor   = (target - rods) / springs
    if factor * minSpace > 50: factor = 50 / minSpace              // the absolute guard
```

`LayoutElement` needs to carry its spring (the duration advance) so rod is `width - spring`;
the placement loop then re-runs each element's x as a running sum of
`max(rod_i, factor * spring_i)` instead of scaling `el.x` by one multiplier. The shared
column model across voices is the fiddly part — columns are per-MEASURE and every staff must
land on the same boundaries. **That also closes the last long-standing open item** — the absolute
stretch guard, which `layout.ts` currently carries a `ponytail:` note about and which the
`-08-01` checkpoint has been listing since the vertical arc began. Its own comment already
says "reinstate this together with a real spring/rod split, not before"; this is that.

---

## Lanes

| branch | state |
|---|---|
| `geometry/lyric-ink-anchor` | **GREEN, 505/505.** Vertical arc, ready to merge. Untouched by this. |
| `geometry/horizontal` | This arc. RED by design. |


---

## Where it stands after the solve (`f8924ca`)

| | arc start | now |
|---|---|---|
| dx exactly zero | 3/29 | **8/29** |
| ox exactly zero | **0/29** | **8/29** |
| both exactly zero | 0/29 | **8/29** |
| ox median | −9.60 | **−2.56** |

Exact on `simple-c`, `score-reorder`, `score-reorder-shared`, `multi-voice-rest-collision`,
`stacked-annotations`, `voice-octave-shift`, `vree-slurs-and-triplets`,
`vree-ties-across-bars`.

## The next structural piece: ONE CURSOR ACROSS VOICES

`multi-voice-triplet-brackets` went 109 → 227px and is now the worst fixture. It is NOT the
spacing curve and NOT the tuplet duration — both were instrumented and both already match:

```
abcjs   elem=0.25 mult=0.6667 forSpacing=0.16667 units=1.1547   ->  34.641px
ours    dur=0.16667 notated=0.25                                ->  34.641px
```

It is that **two voices sharing a staff are spaced independently in our model**. Measured
notehead x on its first system, where both voices are on one staff:

```
abcjs   54  54  78 102 126 149 173 197 197     gaps  0 24 24 24 23 24 24  0
ours    54  54  80 105 116 156 177 182 207     gaps  0 26 25 11 40 21  5 25
```

abcjs's coincide at shared time points; ours do not. Its `layoutStaffGroup`
(`layout/staff-group.js`) walks ONE cursor across all voices, stepping to the smallest
pending duration index each pass and laying out only the voices at that level:

```js
while (!finished(staffGroup.voices)) {
    currentduration = min over voices of getDurationIndex(voice)   // smallest pending
    currentvoices   = voices at that duration level                // lay these out
    ...                                                            // others wait
}
```

So simultaneous notes get the same x by construction. We lay each voice out independently
and only reconcile at barlines — which is why the barlines line up and nothing between them
does. Our per-block factor solve keeps the bars aligned but cannot align the interior.

**This is the piece to do next, and it is the last structural one on this axis.** It
subsumes the per-block factor: with a shared cursor there is one line, one spring solve, and
no per-measure column reconciliation at all.


---

## Shared cursor — ATTEMPTED, REVERTED, and the reason is exact

A first cut of the shared cursor was written and measured: elements carry an `onset`
(musical time within the measure), and a column's voices are walked together, each pass
taking the voices at the smallest pending onset.

It made every multi-voice fixture much worse — `ave-verum` 24 → 152px, `ragtime-nightingale`
108 → 372, `multi-voice-triplet-brackets` 227 → 284 — and the reason is a specific omission,
not the shape:

**A waiting voice's expectation must SHRINK by the duration consumed without it.** My pass
advanced x by the advance of the element at that onset, so a half note in one voice pushed
the cursor its full width at once, ignoring that another voice has four sixteenths inside
that span. abcjs spreads it, and says so in its own comment:

```
// remove the value of already counted spacing units in other voices (e.g. if a voice had
// planned to use up 5 spacing units but is not in line to be laid out at this duration
// level - where we've used 2 spacing units - then we must use up 3 spacing units, not 5)
for (i = 0; i < othervoices.length; i++) {
    othervoices[i].spacingduration -= spacingduration;
    updateNextX(x, spacing, othervoices[i]);        // nextx = x + spacing * sqrt(remaining * 8)
}
```

So the loop has to carry per-voice state, not just a cursor:

- `nextx` — where this voice wants its next element, absolute;
- `spacingduration` — how much of its current note's duration is still unspent.

Each pass: `x = max over the current voices of nextx`; place them; set each one's
`spacingduration` to its new element's duration and `nextx = x + spring(that element)`; then
for every WAITING voice subtract the duration just consumed from its `spacingduration` and
recompute `nextx = x + naturalWidth(remaining)`. The recompute is non-linear —
`sqrt(remaining * 8)`, not a proportional share — so it cannot be approximated by splitting
the advance evenly across the onsets it spans.

That is the whole of what is left on this axis.

---

## THE ARC IS CLOSED — per line, and green

Read `CHECKPOINT-2026-08-02b.md` for the full account. In summary, the last structural
piece named above ("ONE CURSOR ACROSS VOICES", then "per LINE rather than per column") is
done, and it took the branch from red-by-design to **505/505 with the ceilings re-recorded**.

| | arc start | after the shared cursor | now |
|---|---|---|---|
| dx exactly zero | 3/29 | 8/29 | **22/29** |
| ox exactly zero | 0/29 | 8/29 | **22/29** |
| dx median | +16.70 | +9.41 | **+0.01** |
| ox median | −9.60 | −1.37 | **−0.00** |
| notehead distance median | — | 10.20 | **5.59** |

`voice-middle-after-clef`, stuck at exactly 79.0 through every change of this arc, is 0.0.
`multi-voice-triplet-brackets` went 110.4 → 0.0.

What the per-line port turned out to require, none of it visible from the column model:

1. Barlines are NOT aligned across voices — they are zero-duration elements on one timeline.
2. A FINISHED voice still pushes the cursor, through `getDurationIndex`'s undefined-child
   branch.
3. The staff prefix rides the same cursor, one element at a time.
4. A note is anchored at its NOTEHEAD; accidentals and graces hang left as `extraw`.
5. A lyric or chord symbol is half its width on EACH side of the note (`addCentered`) —
   annotations are `w = 0` and occupy nothing.
6. Text has to be measured in the face abcjs names, at its real scale.

### The absolute stretch guard — CLOSED, as "do not implement"

The item this document opened by listing as unblocked is inert in abcjs. `minSpace` is a min
over every pass of the pushing voice's spacing units and the first pass always contributes
zero, because every voice starts at `leftEdge` and no `getNextX` beats the cursor. Probed:
`minSpace = 0`, so `spacing * minSpace > 50` never fires. Reproducing it would be a
divergence.

### What is left is not structural on this axis

`ragtime-nightingale` 72.4 (whose `dy` is 58.1 — the vertical is the bigger term there),
`little swallow` 24.0 (Chinese lyric metrics), `frere-jacques` 22.2 (abcjs wraps a source
line; the known model conflict), then 7.6, 5.4 and 3.9. And `vree-grace-notes`' 32.5 is a
GATE ARTEFACT — see the checkpoint.
