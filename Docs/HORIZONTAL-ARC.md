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
