/**
 * `abcjs-top-line` names the TOP staff line.
 *
 * It did not. `staffLines[0]` is the BOTTOM line — y is down and the array runs upward —
 * so classing index 0 put the hook four staff spaces from where a stylesheet targeting it
 * expects. Silent in every way that is normally checked: the class was present, the count
 * was right, and the compat DOM test that asserts abcjs's class NAMES appear was green
 * throughout.
 *
 * Regression test rather than a line in the DOM suite, because what matters is not that
 * the class exists but that it is on the line a reader would call the top one.
 */
import { describe, expect, it } from 'vitest'
import { parse } from '../src/parser/parser.js'
import { render } from '../src/renderer/index.js'
import { absolutePixels } from './pixel-geometry.js'

describe('compat DOM: abcjs-top-line', () => {
  const svg = () => {
    const score = parse('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n').scores[0]
    if (score === undefined) throw new Error('did not parse')
    return render(score, { classes: 'abcjs' })
  }

  it('sits on the highest of the five staff lines', () => {
    const doc = absolutePixels(svg())
    // A LINE IS A `<path>` IN abcjs MODE NOW, not a `<rect>` — abcjs builds a closed
    // four-point polygon for every rule it draws, and compat reproduces it byte for byte.
    // A staff line is the full-width, hairline-high one.
    const staffLines = doc.items.filter((i) => (i.h ?? 0) < 2 && (i.w ?? 0) > (i.h ?? 0) * 20)
    expect(staffLines.length).toBeGreaterThanOrEqual(5)
    const classed = staffLines.filter((i) => i.cls.includes('abcjs-top-line'))
    expect(classed).toHaveLength(1)
    // y is DOWN, so the top line has the SMALLEST y of the five.
    const highest = Math.min(...staffLines.map((i) => i.y))
    expect(classed[0]?.y).toBeCloseTo(highest, 5)
  })

  it('leaves the other four unclassed, as abcjs does', () => {
    const doc = absolutePixels(svg())
    const lines = doc.items.filter((i) => (i.h ?? 0) < 2 && (i.w ?? 0) > (i.h ?? 0) * 20)
    expect(lines.filter((i) => i.cls === '').length).toBeGreaterThanOrEqual(4)
  })
})
