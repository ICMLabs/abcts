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

  it('the probe can fail — it is not measuring a constant', () => {
    // The canary the pixel gate has and this one needs for the same reason: a comparison
    // that returns the same number for everything reports coverage it does not have.
    const staff = thicknesses(golden('simple-c'), 'staff')
    const stem = thicknesses(golden('simple-c'), 'stem')
    expect(staff).not.toEqual(stem)
  })
})
