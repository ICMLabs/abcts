/**
 * PIXEL PARITY against abcjs's rendered SVG — the gate nothing was doing.
 *
 * The contract: abcts's default mode reproduces abcjs's visual output, the glyph
 * dictionary excepted. Until now nothing checked that in either direction. CLAUDE.md
 * described the 379 golden SVGs as "unused" and ARCHITECTURE.md claimed they "gate compat
 * mode", while `abcts/compat` in fact calls the same core `layout()` + `toSVG()` as
 * everything else. A documented gate that measures nothing — the same shape as the three
 * gate bugs recorded in the checkpoint.
 *
 * ── WHAT IS COMPARED, AND WHY IT IS NOT BYTES ────────────────────────────────
 * abcjs bakes absolute pixels into every `d`; abcts emits a `viewBox` in staff-space
 * units with `translate()` down the tree. Both are legitimate encodings of the same
 * picture, so a byte diff would report "different" forever while telling you nothing.
 * `absolutePixels` resolves each to what a browser would put on screen, and the
 * comparison happens there.
 *
 * Glyph OUTLINES are deliberately out of scope: abcts draws Bravura, abcjs draws its own
 * font, and that difference is intended — it is why abcts's output is smaller. Where a
 * glyph is placed is in scope. What it looks like is not.
 *
 * ── TWO ASSERTIONS, AND THEY DO DIFFERENT JOBS ───────────────────────────────
 * 1. NOTEHEAD COUNT, exact, per fixture. Currently 29/29 fixtures and 2,652 noteheads.
 *    This is a real parity statement and it can only ever regress, so it is asserted
 *    flatly rather than tracked.
 * 2. POSITION SPREAD, tracked against recorded ceilings. `dySpread` is the range of
 *    (ours - abcjs) over every notehead: ZERO means our geometry differs from abcjs's by
 *    a pure constant offset, which is a margin, not an engraving difference.
 * 3. POSITION OFFSET (`oy`/`ox`), the MEAN of the same deltas — where the drawing sits,
 *    as opposed to how much it disagrees with itself. Added 2026-07-22 after the spread
 *    numbers were found to be flattering: `score-reorder-shared` reported a dx spread of
 *    0.0, a perfect score, while sitting 100px to the left of abcjs. Spread alone cannot
 *    see a uniform translation, and a picture in the wrong place is not parity.
 *
 * THE CEILINGS BELOW ARE A TODO LIST, NOT A SPECIFICATION. Every one of them should end
 * at 0. They are recorded so the gap cannot silently widen while it is being closed, and
 * a fixture that improves past its ceiling FAILS — forcing the number down rather than
 * letting it rot. Do not raise one to make a change pass.
 *
 * ── WHAT THE NUMBERS SAY, ranked (measured 2026-07-21) ───────────────────────
 *  0. JUSTIFICATION — LARGELY CLOSED 2026-07-21, and it was bigger than line breaking on
 *     every single-system fixture. We never stretched a last system; abcjs stretches one
 *     that is already >= 66% full (`write/layout/layout.js:102`). Since every single-tune
 *     fixture IS a last system, we justified none where abcjs justified most.
 *     `vree-compound-meter` 182.7 -> 11.3, `program-127-test` 54.7 -> 16.9,
 *     `full-song-template` 56.2 -> 23.3.
 *     `center-text` is unmoved and is NOT this rule failing: its trailing `%%center`
 *     means abcjs's music line is not its last line, so abcjs always justifies it. That
 *     one waits on `%%center`.
 *  1. LINE BREAKING — CLOSED 2026-07-22, and it was not an algorithm. abcjs HAS no
 *     line-breaking pass: in ABC one source music line is one printed system, and abcjs
 *     fits each to the page, compressing a long line rather than wrapping it. We packed
 *     measures by width instead. Systems now match on 28 of 29 fixtures, up from 18, and
 *     the horizontal spreads collapsed with them — `chord-grid` 639.6 -> 7.4, `twinkle`
 *     636.9 -> 7.3, `two-voice-invention` 918.8 -> 34.9, `ragtime-nightingale`
 *     1142.6 -> 101.5.
 *     `frere-jacques` is the one fixture whose system COUNT still differs (4 vs our 2),
 *     and it is the `+:` prose again: abcjs breaks per source line even mid-measure,
 *     while our systems are measure-granular, and its prose and first real bar are one
 *     measure. Nothing else in the corpus breaks inside a measure.
 *  2. VERTICAL — PARTLY CLOSED 2026-07-22, and it was never a constant. `marginY` padded
 *     every staff extent by 4 spaces a side, 31px, where abcjs and abcMusicKit v1 add no
 *     per-staff margin at all: they advance by the ink extent and enforce a MINIMUM
 *     line-to-line separation (`draw.js:84-92`). Removing it, plus applying abcjs's two
 *     separations as line-to-line rather than origin-to-origin minimums, takes EIGHT
 *     fixtures to a y offset within 2px of abcjs.
 *     The top-text BLOCK closed most of the rest on 2026-07-22: composer, rhythm and
 *     origin are drawn and reserve height, abcjs's font sizes are used (title 20pt, not
 *     the old 18.6px), and `padding.top` 15px exists at last. Mean |y offset| went
 *     73.8 -> 43.6 across the session; `zocharti-loch` -74.9 -> -5.5,
 *     `program-127-test` -117 -> -34.
 *     ELEVEN entries got WORSE, all for one reason: a title-only tune was accidentally
 *     near-zero under the old fixed `titleStep`, which happened to approximate a
 *     title-only block. They now sit around -16.5px — a real residual where there used to
 *     be a coincidence, and the next term to chase.
 *  3. A 4.5px HORIZONTAL STEP AT A BARLINE. `simple-c`, `stacked-annotations`,
 *     `vree-slurs-and-triplets` and `vree-ties-across-bars` all show 4.5 exactly, which
 *     is one shared cause and almost certainly one constant in `ENGRAVE`.
 *  4. Accidental and grace-note widths — `vree-sharps` 8.9, `vree-grace-notes` 31.5.
 *
 * Three fixtures ALREADY MATCH horizontally to the pixel (`score-reorder`,
 * `score-reorder-shared`, `voice-octave-shift` have `dxSpread` 0.0), which is the
 * evidence that the engraving grid itself is right and this is calibration rather than
 * a re-engraving.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { corpusDir, goldensDir, loadCorpus } from './corpus/corpus.js'
import { absolutePixels, byClass } from './pixel-geometry.js'

/**
 * Per fixture: how many noteheads abcjs draws, and the current position spreads.
 *
 * `heads` is asserted exactly. `dy`/`dx` are ceilings — the measured value must not
 * exceed them, and must not come in UNDER them without the entry being updated.
 */
const EXPECTED: Record<string, { heads: number; dy: number; dx: number; oy: number; ox: number }> =
  {
    'ave-verum-corpus': { heads: 55, dy: 26.8, dx: 28.0, oy: -3.6, ox: -23.7 },
    'brother-john-inline-voices': { heads: 64, dy: 0.0, dx: 16.7, oy: -2.1, ox: -19.8 },
    'center-text': { heads: 8, dy: 0.0, dx: 219.3, oy: -25.4, ox: -125.2 },
    'chord-grid': { heads: 16, dy: 0.0, dx: 7.0, oy: -20.4, ox: -22.8 },
    'frere-jacques': { heads: 45, dy: 232.0, dx: 637.6, oy: -173.9, ox: -37.4 },
    'full-song-template': { heads: 20, dy: 22.1, dx: 19.8, oy: -38.3, ox: -27.0 },
    'happy-birthday': { heads: 25, dy: 10.0, dx: 36.6, oy: -0.7, ox: -33.5 },
    'little swallow': { heads: 89, dy: 24.6, dx: 47.5, oy: -19.1, ox: -33.3 },
    'multi-voice-lyrics-two-voices': { heads: 16, dy: 67.7, dx: 339.7, oy: -83.4, ox: -89.7 },
    'multi-voice-rest-collision': { heads: 7, dy: 0.0, dx: 4.9, oy: -38.1, ox: -14.7 },
    'multi-voice-rest-placement': { heads: 14, dy: 0.0, dx: 18.4, oy: -3.1, ox: -19.4 },
    'multi-voice-triplet-brackets': { heads: 45, dy: 4.8, dx: 110.2, oy: -32.1, ox: -16.1 },
    'program-127-test': { heads: 20, dy: 13.7, dx: 14.3, oy: -8.1, ox: -24.9 },
    'ragtime-mini': { heads: 30, dy: 0.0, dx: 19.9, oy: -21.0, ox: -23.8 },
    'ragtime-nightingale': { heads: 2009, dy: 151.7, dx: 100.9, oy: -28.6, ox: -25.9 },
    'score-reorder-shared': { heads: 8, dy: 0.0, dx: 0.0, oy: -0.1, ox: -15.6 },
    'score-reorder': { heads: 8, dy: 0.0, dx: 0.0, oy: 7.4, ox: -15.6 },
    'simple-c': { heads: 8, dy: 0.0, dx: 4.5, oy: -0.1, ox: -13.3 },
    'stacked-annotations': { heads: 4, dy: 0.0, dx: 4.5, oy: -21.4, ox: -11.1 },
    twinkle: { heads: 14, dy: 0.0, dx: 6.8, oy: -0.1, ox: -18.8 },
    'two-voice-invention': { heads: 74, dy: 11.9, dx: 23.1, oy: 13.1, ox: -21.3 },
    'voice-middle-after-clef': { heads: 10, dy: 12.7, dx: 79.0, oy: -7.8, ox: -28.7 },
    'voice-octave-shift': { heads: 8, dy: 0.0, dx: 0.0, oy: -0.1, ox: -15.6 },
    'vree-compound-meter': { heads: 12, dy: 0.0, dx: 5.3, oy: 0.1, ox: -15.3 },
    'vree-grace-notes': { heads: 7, dy: 11.6, dx: 31.5, oy: -0.1, ox: -11.2 },
    'vree-sharps': { heads: 4, dy: 0.0, dx: 9.4, oy: 0.5, ox: -14.1 },
    'vree-slurs-and-triplets': { heads: 8, dy: 0.0, dx: 4.5, oy: -19.5, ox: -13.5 },
    'vree-ties-across-bars': { heads: 4, dy: 0.0, dx: 4.5, oy: -0.1, ox: -12.6 },
    'zocharti-loch': { heads: 64, dy: 3.0, dx: 47.5, oy: 7.4, ox: -15.7 },
  }

/** Rounding slack, so a last-digit wobble is not a failure. */
const EPSILON = 0.05

interface Measured {
  goldenHeads: number
  ourHeads: number
  dy: number
  dx: number
  /**
   * MEAN offset — where the drawing SITS, as opposed to how much it disagrees with
   * itself. Spread alone reports 0.0 for a render uniformly 100px left of abcjs's, which
   * is a perfect score for a picture in the wrong place.
   */
  oy: number
  ox: number
}

function measure(name: string): Measured {
  const abc = readFileSync(join(corpusDir, `${name}.abc`), 'utf-8')
  const golden = absolutePixels(readFileSync(join(goldensDir, `${name}.svg`), 'utf-8'))
  const rendered = renderAbc('paper', abc, {})
  const svg = rendered[0]?.svg ?? ''
  const ours = absolutePixels(svg)
  const goldenHeads = byClass(golden, 'notehead')
  const ourHeads = byClass(ours, 'notehead')
  const n = Math.min(goldenHeads.length, ourHeads.length)
  const spread = (values: number[]): number =>
    values.length === 0 ? 0 : Math.max(...values) - Math.min(...values)
  const deltas = (axis: 'x' | 'y'): number[] =>
    goldenHeads.slice(0, n).map((head, i) => (ourHeads[i]?.[axis] ?? 0) - head[axis])
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
  return {
    goldenHeads: goldenHeads.length,
    ourHeads: ourHeads.length,
    dy: spread(deltas('y')),
    dx: spread(deltas('x')),
    oy: mean(deltas('y')),
    ox: mean(deltas('x')),
  }
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}

/**
 * The MEDIAN euclidean distance from each of our noteheads to abcjs's, per fixture.
 *
 * Per fixture, not pooled per note: `ragtime-nightingale` holds 2009 of the corpus's
 * 2696 noteheads, so a pooled median is simply its median and hides everything else.
 */
function fixtureMedianDistance(name: string): number {
  const golden = byClass(
    absolutePixels(readFileSync(join(goldensDir, `${name}.svg`), 'utf-8')),
    'notehead',
  )
  const ours = byClass(
    absolutePixels(
      renderAbc('paper', readFileSync(join(corpusDir, `${name}.abc`), 'utf-8'), {})[0]?.svg ?? '',
    ),
    'notehead',
  )
  const n = Math.min(golden.length, ours.length)
  const distances: number[] = []
  for (let i = 0; i < n; i++) {
    const g = golden[i]
    const o = ours[i]
    if (g === undefined || o === undefined) continue
    distances.push(Math.hypot(o.x - g.x, o.y - g.y))
  }
  return median(distances)
}

describe('pixel parity vs abcjs rendered SVG', () => {
  const withGoldens = loadCorpus()
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(goldensDir, `${name}.svg`)))

  it('the gate reads real goldens and can tell positions apart', () => {
    // A gate that cannot fail reports coverage it does not have — the fuzz suite that
    // passed while three crashes were live. `simple-c` has a known non-zero dx spread,
    // so a comparison returning 0 for everything would fail here.
    const simple = measure('simple-c')
    expect(simple.goldenHeads).toBe(8)
    expect(simple.dx).toBeGreaterThan(1)
    // Not `toBe(0)`: the resolved coordinates carry float noise, and a `0.0` in the
    // table means "a pure constant offset", not "exactly zero to the last bit".
    expect(simple.dy).toBeLessThan(EPSILON)
  })

  it('every fixture with an SVG golden is accounted for', () => {
    // Adding a golden without a row here would otherwise be silently unmeasured.
    expect(withGoldens.filter((name) => EXPECTED[name] === undefined)).toEqual([])
    expect(Object.keys(EXPECTED).filter((name) => !withGoldens.includes(name))).toEqual([])
  })

  describe('notehead count is exact', () => {
    for (const name of withGoldens) {
      it(`${name}`, () => {
        const { goldenHeads, ourHeads } = measure(name)
        expect(goldenHeads).toBe(EXPECTED[name]?.heads)
        // The real parity statement: same notes, same count, drawn by both engines.
        expect(ourHeads).toBe(goldenHeads)
      })
    }
  })

  describe('position spread does not widen', () => {
    for (const name of withGoldens) {
      it(`${name}`, () => {
        const expected = EXPECTED[name]
        if (expected === undefined) throw new Error(`${name} has no recorded ceiling`)
        const { dy, dx, oy, ox } = measure(name)
        expect(dy, `${name} dySpread widened`).toBeLessThanOrEqual(expected.dy + EPSILON)
        expect(dx, `${name} dxSpread widened`).toBeLessThanOrEqual(expected.dx + EPSILON)
        // OFFSET as well as spread. A drawing uniformly 100px left of abcjs's scores a
        // perfect spread and is still in the wrong place — `score-reorder-shared` sat at
        // dx 0.0 and ox -100.5 for two days because only spread was checked.
        expect(Math.abs(oy), `${name} y offset grew`).toBeLessThanOrEqual(
          Math.abs(expected.oy) + EPSILON,
        )
        expect(Math.abs(ox), `${name} x offset grew`).toBeLessThanOrEqual(
          Math.abs(expected.ox) + EPSILON,
        )
        // Improving is the goal, and an improvement must be RECORDED — otherwise the
        // ceiling drifts away from reality and stops meaning anything. Lower the number.
        expect(
          dy,
          `${name} dySpread improved to ${dy.toFixed(1)} — lower the ceiling`,
        ).toBeGreaterThan(expected.dy - 1)
        expect(
          dx,
          `${name} dxSpread improved to ${dx.toFixed(1)} — lower the ceiling`,
        ).toBeGreaterThan(expected.dx - 1)
      })
    }
  })

  // Machine-readable geometry summary for `npm run parity`, so the one axis that is NOT
  // at 100% stops being invisible. The MEDIAN notehead distance per fixture (weighted per
  // fixture, never pooled — see `fixtureMedianDistance`), and how many fixtures land
  // within 25 / 50 / 100px of abcjs. The corpus figure is the median of the per-fixture
  // medians, which is the number the checkpoint tracks.
  it('records its geometry for the parity tracker', () => {
    const perFixture = withGoldens
      .map((name) => ({ name, median: fixtureMedianDistance(name) }))
      .sort((a, b) => b.median - a.median)
    const within = (px: number) => perFixture.filter((f) => f.median <= px).length
    writeFileSync(
      '/tmp/abcts-parity-pixel.json',
      JSON.stringify({
        fixtures: perFixture.length,
        corpusMedian: median(perFixture.map((f) => f.median)),
        within25: within(25),
        within50: within(50),
        within100: within(100),
        worst: perFixture.slice(0, 6).map((f) => ({ name: f.name, median: +f.median.toFixed(1) })),
      }),
    )
    // A gate that writes numbers should also prove it can read real ones — the whole point
    // of the axis is that it is not yet at parity, so a zero here means it measured nothing.
    expect(perFixture.length).toBe(withGoldens.length)
    expect(perFixture.every((f) => Number.isFinite(f.median))).toBe(true)
  })
})
