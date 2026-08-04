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
 * ── THE NUMBERS BELOW CHANGED MEANING ON 2026-07-22 ──────────────────────────
 * Positions are now the BOUNDING-BOX CENTRE of the real outline on both sides (see
 * `pathBox` in `pixel-geometry.ts`). They used to be abcjs's first `M` against abcts's
 * glyph origin — for a notehead, its TOP against its CENTRE, a fixed 4.035px bias that
 * read as agreement and hid a real 4.3px vertical error of the same size underneath it.
 * Ceilings recorded before that change are NOT comparable with ones recorded after.
 * The tell was that `oy` and the staff-line offset disagreed by a constant 4.2px on 25 of
 * 29 fixtures while each engine was internally consistent — B4 centres on the middle line
 * in both.
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
 *  1. LINE BREAKING — CLOSED 2026-07-22, and it was not an algorithm. In ABC one source
 *     music line is one printed system, and abcjs fits each to the page, compressing a
 *     long line rather than wrapping it. We packed measures by width instead. Systems now
 *     match on 29 of 29 fixtures, up from 18, and the horizontal spreads collapsed with
 *     them — `chord-grid` 639.6 -> 7.4, `twinkle` 636.9 -> 7.3, `two-voice-invention`
 *     918.8 -> 34.9, `ragtime-nightingale` 1142.6 -> 101.5.
 *
 *     CORRECTION — abcjs DOES have a line-breaking pass, and an earlier note here saying
 *     it "HAS no line-breaking pass" was wrong. It lives in `parse/wrap_lines.js`, in the
 *     PARSER rather than under `write/`, which is why listing `write/` found nothing. It
 *     runs only when a host passes BOTH `wrap` and `staffwidth` (`api/abc_tunebook_svg.js`
 *     `doLineWrapping`), and the golden generator passes only `staffwidth` — so the
 *     goldens are UNWRAPPED and one source line is one system after all. The conclusion
 *     held; the reason given for it did not.
 *
 *     `frere-jacques` was the last fixture whose system COUNT differed (abcjs 4, ours 2)
 *     and it was never wrapping: abcjs parses its `+:` prose as music (a bug we reproduce
 *     — 45 noteheads on both sides) and gives each prose line its own staff line, running
 *     the last one straight into the first real bar with no barline between. abcjs breaks
 *     per source line whether or not a barline falls there; our systems break between
 *     MEASURES, so the break had nowhere to land. The parser now closes an unterminated
 *     measure at a source-line boundary, which is a layout unit, not a musical bar —
 *     nothing is drawn for the absent barline. 244 -> 40px.
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
 *  5. JUSTIFICATION HAS NO RATIO CAP — closed 2026-07-22. `maxJustifyStretch: 1.6` was a
 *     *Behind Bars* judgement abcjs does not share: `calcHorizontalSpacing` justifies
 *     every non-last line however far it must stretch. Removing it took `frere-jacques`
 *     47 -> 40 and `multi-voice-lyrics-two-voices` 339.7 -> 51.0 of dx spread.
 *     abcjs's own guard is ABSOLUTE (`spacing * minSpace > 50`) and is NOT reproduced —
 *     see the ponytail note in `layout.ts` for why measuring it off element origins binds
 *     too early, and what a faithful version needs.
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
    'ave-verum-corpus': { heads: 55, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'brother-john-inline-voices': { heads: 64, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'center-text': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'chord-grid': { heads: 16, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 22.15 -> 22.64 and `little swallow` 23.97 -> 24.19 when the notehead ROD became
    // abcjs's 9.81 rather than Bravura's 9.145 outline. Sub-pixel movement on the two
    // fixtures whose dx is dominated by a GOLDEN artefact — recorded rather than reverted,
    // because the width is abcjs's own and the same change took ragtime 55.32 -> 53.56 and
    // five more harvested fixtures inside their thresholds.
    'frere-jacques': { heads: 45, dy: 0.0, dx: 22.64, oy: 0.0, ox: -3.53 },
    'full-song-template': { heads: 20, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 3.85 -> 1.40 when a REST became a rod. abcjs's `getMinWidth` is `child.w`
    // whatever the type and a rest's `w` is its glyph — 7.534 for an eighth — where ours
    // was a flat 0, so a compressed line let the note after a rest slide onto it.
    // then 1.40 -> 0.23 when `Bb` became `B♭`: `♭` is a full em in the chord font where
    // `b` is 0.556, and the mark is CENTRED on the note, so half of that was horizontal.
    'happy-birthday': { heads: 25, dy: 0.0, dx: 0.23, oy: 0.0, ox: -0.49 },
    // dy 1.92 -> 0.32 and oy -0.58 -> 0.16 when `anchorLyrics` stopped measuring its own
    // ink and took `verticalExtent`'s. dx/ox are the goldens' ASCII width table, not us.
    // dx 24.19 -> 21.69 when `calcWidth` landed: its 73 Chinese characters measure the
    // golden generator's flat 8 rather than a full em, which is what the goldens do.
    'little swallow': { heads: 89, dy: 0.32, dx: 21.69, oy: 0.16, ox: -6.29 },
    'multi-voice-lyrics-two-voices': { heads: 16, dy: 0.07, dx: 0.0, oy: 0.05, ox: 0.0 },
    'multi-voice-rest-collision': { heads: 7, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-rest-placement': { heads: 14, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-triplet-brackets': { heads: 45, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'program-127-test': { heads: 20, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'ragtime-mini': { heads: 30, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 69.82 -> 55.32 when the accidental extents became abcjs's own numbers. Its `oy`
    // is the branch's one red and went 1.49 -> 1.58 on the same change — its residual is
    // horizontal in origin (see the checkpoint), so the two move together.
    // dy 58.1 -> 1.12 and dx 53.56 -> 18.30 when the GRACE NOTES stopped being emitted
    // before their main head. Both were recorded for weeks as "two mis-paired noteheads,
    // do not chase" — the mis-pairing was ours, and it was the emission order.
    'ragtime-nightingale': { heads: 2009, dy: 1.12, dx: 18.3, oy: -0.54, ox: -1.87 },
    'score-reorder-shared': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'score-reorder': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'simple-c': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'stacked-annotations': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    twinkle: { heads: 14, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'two-voice-invention': { heads: 74, dy: 0.07, dx: 0.0, oy: 0.0, ox: 0.0 },
    'voice-middle-after-clef': { heads: 10, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'voice-octave-shift': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'vree-compound-meter': { heads: 12, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dy 11.6 -> 0.02 and dx 32.5 -> 1.99, same cause. What is left is the grace glyph's
    // own width: a uniform 1.99 on the graces themselves, exactly as the note predicting
    // the "artefact" said it would be once the order was right.
    'vree-grace-notes': { heads: 7, dy: 0.02, dx: 1.99, oy: 0.03, ox: -1.14 },
    'vree-sharps': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.06, ox: 0.0 },
    'vree-slurs-and-triplets': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'vree-ties-across-bars': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 5.35 -> 1.25 on the accidental extents.
    'zocharti-loch': { heads: 64, dy: 0.0, dx: 1.25, oy: 0.0, ox: -0.34 },
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
    // passed while three crashes were live. This canary needs BOTH outcomes to be
    // reachable, so it names a fixture at parity and one that is not.
    //
    // It used to name only `simple-c`, on the grounds that it had a known non-zero dx
    // spread. It no longer does — the horizontal arc took it to exact — so that half is
    // now the ZERO end of the check and `frere-jacques`, which abcjs wraps differently,
    // is the non-zero end.
    const simple = measure('simple-c')
    expect(simple.goldenHeads).toBe(8)
    // Not `toBe(0)`: the resolved coordinates carry float noise, and a `0.0` in the
    // table means "a pure constant offset", not "exactly zero to the last bit".
    expect(simple.dx).toBeLessThan(EPSILON)
    expect(simple.dy).toBeLessThan(EPSILON)
    // …and a comparison returning 0 for everything would fail here.
    expect(measure('frere-jacques').dx).toBeGreaterThan(1)
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
