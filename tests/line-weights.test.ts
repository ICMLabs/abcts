/**
 * LINE WEIGHTS vs abcjs — the gate the pixel gate cannot be.
 *
 * `pixel-parity.test.ts` compares glyph bounding-box CENTRES, and a line's centre does not
 * move when its thickness changes. `baseline.test.ts` records our own geometry, so it locks
 * in whatever we already draw. Between them they let `abcjs-strict` draw a thin barline at
 * 1.24px for weeks where abcjs draws 0.600 — Bravura's `ENGRAVING_DEFAULTS`, ungated, at 21
 * sites. Nothing was wrong with either gate; they were both blind to the same axis.
 *
 * This measures the axis directly: for each class of line, the THICKNESS of the quad each
 * engine emits, resolved to absolute pixels.
 *
 * `abcjs-strict` has no latitude — it exists to reproduce abcjs byte for byte — so these
 * are equalities, not ceilings. `abc2.1` and `extended` keep Bravura's weights and are
 * deliberately not measured here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels } from './pixel-geometry.js'

const corpusDir = '../abcMusicKit/Tools/abcjs-debug/fixtures'
const goldensDir = '../abcMusicKit/Tools/abcjs-debug/golden'

/**
 * The thinnest dimension of every element carrying `needle` in its class — a line's
 * thickness is its short axis, whichever way it runs.
 *
 * Rounded to a thousandth: abcjs itself writes staff lines through
 * `roundNumber` (2dp of a pixel), so anything finer is noise on its side.
 */
function thicknesses(svg: string, needle: string): number[] {
  const doc = absolutePixels(svg)
  return [
    ...new Set(
      doc.items
        .filter((item) => item.cls.includes(needle) && item.w !== undefined)
        .map((item) => Math.round(Math.min(item.w as number, item.h as number) * 1000) / 1000),
    ),
  ].sort((a, b) => a - b)
}

const render = (name: string): string =>
  renderAbc('paper', readFileSync(join(corpusDir, `${name}.abc`), 'utf-8'), {})[0]?.svg ?? ''
const golden = (name: string): string => readFileSync(join(goldensDir, `${name}.svg`), 'utf-8')

describe('line weights match abcjs in strict mode', () => {
  // One fixture per class, chosen for having the thing and little else.
  const CASES: readonly { fixture: string; cls: string; what: string }[] = [
    // abcjs marks only the FIRST staff line, with `abcjs-top-line`; the other four carry
    // no class at all and the group holds `abcjs-staff`. So the top line is the one both
    // engines label, and it is enough — the five are drawn by one call.
    { fixture: 'simple-c', cls: 'top-line', what: 'staff line' },
    { fixture: 'simple-c', cls: 'ledger', what: 'ledger line' },
    { fixture: 'simple-c', cls: 'stem', what: 'stem' },
    // NOT ONE STEM WEIGHT BUT THREE SOURCES OF TWO. `simple-c` has only unbeamed stems, so
    // it reports `[1]` and cannot tell the axis apart from a constant. abcjs writes
    // `linewidth: ±1` for an unbeamed stem (`abstract-engraver.js:748`) and `±0.6` for both
    // a BEAMED one (`layout/beam.js:122`) and a tempo mark's beat-unit note
    // (`tempo-element.js:56`) — so the set is the discriminator, and each fixture below
    // holds a different mix of the two.
    //
    // All three were wrong when this case was written, and none of the existing gates could
    // say so: a stem is not a notehead, so `pixel-parity` never looks at one, and the
    // fixture the thickness gate did have has no beams and no `Q:`.
    { fixture: 'two-voice-invention', cls: 'stem', what: 'beamed and unbeamed stems' },
    // Beams AND a `Q:` — the tempo note is its only thin stem outside the beams.
    { fixture: 'happy-birthday', cls: 'stem', what: "a tempo mark's beat-unit stem" },
    // Every note beamed, so a stray unbeamed weight has nowhere to hide.
    { fixture: 'ragtime-mini', cls: 'stem', what: 'an all-beamed tune' },
  ]

  for (const { fixture, cls, what } of CASES) {
    it(`${what}`, () => {
      const theirs = thicknesses(golden(fixture), cls)
      const ours = thicknesses(render(fixture), cls)
      expect(
        theirs.length,
        `no ${what} in the golden — the probe is measuring nothing`,
      ).toBeGreaterThan(0)
      expect(ours.length, `no ${what} in our output`).toBeGreaterThan(0)
      // Compare the SET of distinct thicknesses, so an engine drawing two weights where the
      // other draws one is a failure rather than an average.
      expect(ours).toEqual(theirs)
    })
  }

  // SEPARATION IS A DIFFERENT AXIS FROM THICKNESS, and the thickness gate above cannot see
  // it: two rules of the right weight in the wrong places pass every assertion in this file
  // until this one. abcjs's barline cursor is FIVE hardcoded numbers rather than one
  // separation (`abstract-engraver.js:985-1030`), so the gaps are asymmetric — thin→thick
  // is `4 - 0.6` and thick→thin is `5 + 3 - 4` — and a single constant cannot produce them.
  it('barline separations', () => {
    const gaps = (svg: string): number[] => {
      const doc = absolutePixels(svg)
      const bars = doc.items
        .filter((item) => item.name === 'bar' && item.w !== undefined)
        .map((item) => ({ left: item.x - (item.w as number) / 2, w: item.w as number }))
        .sort((a, b) => a.left - b.left)
      const out: number[] = []
      for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1]
        const here = bars[i]
        if (prev === undefined || here === undefined) continue
        const gap = here.left - (prev.left + prev.w)
        // Only pairs that belong to ONE barline; anything further apart is a whole measure.
        if (gap >= 0 && gap < 6) out.push(Math.round(gap * 100) / 100)
      }
      return out
    }
    const theirs = gaps(golden('S4-bars-repeats-tune0'))
    const ours = gaps(render('S4-bars-repeats'))
    expect(theirs.length, 'no adjacent barline rules in the golden').toBeGreaterThan(0)
    expect(ours).toEqual(theirs)
  })

  it('the probe can fail — it is not measuring a constant', () => {
    // The canary the pixel gate has and this one needs for the same reason: a comparison
    // that returns the same number for everything reports coverage it does not have.
    const staff = thicknesses(golden('simple-c'), 'staff')
    const stem = thicknesses(golden('simple-c'), 'stem')
    expect(staff).not.toEqual(stem)
  })
})
