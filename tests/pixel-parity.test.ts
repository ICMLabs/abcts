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
 *  2. A CONSTANT VERTICAL ORIGIN, about 34px. TEN fixtures have `dySpread` of exactly
 *     0.0 — vertical scale is already abcjs's, only the origin differs. One constant.
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
import { existsSync, readFileSync } from 'node:fs'
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
const EXPECTED: Record<string, { heads: number; dy: number; dx: number }> = {
  'ave-verum-corpus': { heads: 55, dy: 176.5, dx: 97.2 },
  'brother-john-inline-voices': { heads: 64, dy: 145.5, dx: 86.5 },
  'center-text': { heads: 8, dy: 0.0, dx: 219.3 },
  'chord-grid': { heads: 16, dy: 0.0, dx: 7.4 },
  'frere-jacques': { heads: 45, dy: 192.4, dx: 640.1 },
  'full-song-template': { heads: 20, dy: 40.0, dx: 23.3 },
  'happy-birthday': { heads: 25, dy: 48.6, dx: 39.5 },
  'little swallow': { heads: 89, dy: 209.6, dx: 51.7 },
  'multi-voice-lyrics-two-voices': { heads: 16, dy: 5.7, dx: 336.9 },
  'multi-voice-rest-collision': { heads: 7, dy: 0.0, dx: 4.9 },
  'multi-voice-rest-placement': { heads: 14, dy: 0.0, dx: 200.9 },
  'multi-voice-triplet-brackets': { heads: 45, dy: 53.1, dx: 116.3 },
  'program-127-test': { heads: 20, dy: 44.9, dx: 16.9 },
  'ragtime-mini': { heads: 30, dy: 49.5, dx: 199.3 },
  'ragtime-nightingale': { heads: 2009, dy: 2069.8, dx: 101.5 },
  'score-reorder-shared': { heads: 8, dy: 0.0, dx: 0.0 },
  'score-reorder': { heads: 8, dy: 55.8, dx: 0.0 },
  'simple-c': { heads: 8, dy: 0.0, dx: 4.5 },
  'stacked-annotations': { heads: 4, dy: 0.0, dx: 4.5 },
  twinkle: { heads: 14, dy: 0.0, dx: 7.3 },
  'two-voice-invention': { heads: 74, dy: 176.7, dx: 34.9 },
  'voice-middle-after-clef': { heads: 10, dy: 49.9, dx: 79.0 },
  'voice-octave-shift': { heads: 8, dy: 38.9, dx: 0.0 },
  'vree-compound-meter': { heads: 12, dy: 0.0, dx: 11.3 },
  'vree-grace-notes': { heads: 7, dy: 11.6, dx: 31.5 },
  'vree-sharps': { heads: 4, dy: 0.0, dx: 8.9 },
  'vree-slurs-and-triplets': { heads: 8, dy: 0.0, dx: 4.5 },
  'vree-ties-across-bars': { heads: 4, dy: 0.0, dx: 4.5 },
  'zocharti-loch': { heads: 64, dy: 178.0, dx: 108.7 },
}

/** Rounding slack, so a last-digit wobble is not a failure. */
const EPSILON = 0.05

interface Measured {
  goldenHeads: number
  ourHeads: number
  dy: number
  dx: number
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
  return {
    goldenHeads: goldenHeads.length,
    ourHeads: ourHeads.length,
    dy: spread(deltas('y')),
    dx: spread(deltas('x')),
  }
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
        const { dy, dx } = measure(name)
        expect(dy, `${name} dySpread widened`).toBeLessThanOrEqual(expected.dy + EPSILON)
        expect(dx, `${name} dxSpread widened`).toBeLessThanOrEqual(expected.dx + EPSILON)
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
})
