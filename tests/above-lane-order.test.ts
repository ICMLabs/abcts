/**
 * THE ABOVE-LANE ORDER — the gate that had to be built because no other one could see it.
 *
 * abcjs spends every above lane in ONE loop, in order — lyric, chord, ending,
 * dynamic/volume, part, tempo — off a single running `staff.top`
 * (`layout/set-upper-and-lower-elements.js:31-49`). We spent them in four places, and the
 * staff's TOTAL was right either way: `verticalExtent` sums the same terms whatever order
 * it adds them in, and both ranked tables sat at 0 over it for days. What differed is WHICH
 * RUNG a mark lands on when a staff carries two lanes — and a lane order is INVISIBLE TO A
 * SUM, so no axis this repo measures could name it. The pixel table compares noteheads, the
 * harvested table compares noteheads, the staff-line gate compares a horizontal span.
 *
 * So this is a LADDER OF CONTROLS, one tune per pair of lanes, and NOT ONE OF THEM IS IN
 * EITHER CORPUS — which is the other half of why nothing caught it. Five of the eleven
 * disagreed with abcjs, by up to 27.13px:
 *
 *     control            mark      abcjs      before
 *     volta + tempo      tempo     -51.63     -28.37    the tempo sat INSIDE the ending lane
 *     volta + part       part      -52.53     -29.29    likewise
 *     volta + dynamic    ending    -19.81     -46.94    the ending rode the dynamic's lane
 *     part  + dynamic    dynamic   -39.25     -74.50    the dynamic rode the part's
 *     chord + dynamic    chord     -29.64     -56.77    the chord rode the dynamic's
 *
 * Every figure below is MEASURED off abcjs 6.6.3's own SVG for the same tune, rendered
 * through `Tools/abcjs-debug/dump-svg.js`, as px BELOW the top staff line — so a mark above
 * the staff is negative. The tunes are inline rather than fixtures because they are
 * controls: each one exists to isolate one PAIR of lanes and nothing else.
 */
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels } from './pixel-geometry.js'

const EPSILON = 0.05

interface Control {
  readonly name: string
  readonly abc: string
  /** abcjs's top staff line, in absolute px — the staff's own EXTENT. */
  readonly topLine: number
  /** Every abcjs `<text>` above the staff, px from the top line, ascending. */
  readonly marks: readonly number[]
  /** abcjs's dynamic glyph, px from the top line — mean of its `m` and `f` outlines. */
  readonly dynamic?: number
}

/**
 * A `w:` line is what puts a dynamic ABOVE the staff at all: `createDecoration` defaults
 * `volumePosition` to `hasVocals ? 'above' : 'below'` (`creation/decoration.js:379`).
 * That is also why no corpus tune combines an above dynamic with a chord lane — a singing
 * staff takes the lyric lane below, not a chord lane above — and why this file exists.
 */
const CONTROLS: readonly Control[] = [
  { name: 'chord', abc: 'X:1\nK:C\n"D7"CDEF|GABc|\n', topLine: 68.21, marks: [-29.65] },
  {
    name: 'dynamic above',
    abc: 'X:1\nK:C\n!mf!CDEF|GABc|\nw: la la la la la la la la\n',
    topLine: 72.94,
    marks: [],
    dynamic: -39.37,
  },
  {
    name: 'chord + dynamic',
    abc: 'X:1\nK:C\n"D7"!mf!CDEF|GABc|\nw: la la la la la la la la\n',
    topLine: 95.33,
    marks: [-29.64],
    dynamic: -61.77,
  },
  {
    name: 'volta',
    abc: 'X:1\nK:C\nCDEF|1GABc:|2cBAG|]\n',
    topLine: 69.06,
    marks: [-19.81, -19.81],
  },
  { name: 'tempo', abc: 'X:1\nQ:1/4=120\nK:C\nCDEF|GABc|\n', topLine: 72.94, marks: [-28.38] },
  {
    name: 'volta + tempo',
    abc: 'X:1\nQ:1/4=120\nK:C\nCDEF|1GABc:|2cBAG|]\n',
    topLine: 96.19,
    marks: [-51.63, -19.81, -19.81],
  },
  {
    name: 'volta + part',
    abc: 'X:1\nK:C\nP:A\nCDEF|1GABc:|2cBAG|]\n',
    topLine: 95.09,
    marks: [-52.53, -19.81, -19.81],
  },
  {
    name: 'chord + part + tempo',
    abc: 'X:1\nQ:1/4=120\nK:C\nP:A\n"D7"CDEF|GABc|\n',
    topLine: 121.37,
    marks: [-76.81, -51.68, -29.65],
  },
  {
    // THE ENDING-OVER-A-CHORD BRANCH: `if (chordHeightAbove) staff.top += 2` rather than
    // `endingHeightAbove + margin`, so the `|1` sits 2 pitch above the chord lane and not
    // 6 (`set-upper-and-lower-elements.js:33-38`).
    name: 'volta + chord',
    abc: 'X:1\nK:C\n"D7"CDEF|1GABc:|2cBAG|]\n',
    topLine: 75.96,
    marks: [-29.65, -26.71, -26.71],
  },
  {
    name: 'volta + dynamic',
    abc: 'X:1\nK:C\n!mf!CDEF|1GABc:|2cBAG|]\nw: la la la la la la la la\n',
    topLine: 96.19,
    marks: [-19.81, -19.81],
    dynamic: -62.62,
  },
  {
    name: 'part + dynamic',
    abc: 'X:1\nK:C\nP:A\n!mf!CDEF|GABc|\nw: la la la la la la la la\n',
    topLine: 98.97,
    marks: [-56.41],
    dynamic: -39.37,
  },
  {
    // The BELOW side, as the calibration for the dynamic glyph's own outline — see the
    // delta assertion below.
    name: 'dynamic below',
    abc: 'X:1\nK:C\n!mf!CDEF|GABc|\n',
    topLine: 45.81,
    marks: [],
    dynamic: 53.81,
  },
]

interface Measured {
  readonly topLine: number
  readonly marks: number[]
  readonly dynamic: number | null
}

function measure(abc: string): Measured {
  const doc = absolutePixels(renderAbc('paper', abc, {})[0]?.svg ?? '')
  const topLine = doc.items.find((i) => i.cls.includes('top-line'))?.y ?? 0
  const dyn = doc.items.filter((i) => i.cls.includes('abcjs-dynamics')).map((i) => i.y - topLine)
  return {
    topLine,
    marks: doc.items
      .filter((i) => i.tag === 'text' && i.y - topLine < 0)
      .map((i) => i.y - topLine)
      .sort((a, b) => a - b),
    dynamic: dyn.length === 0 ? null : dyn.reduce((a, b) => a + b, 0) / dyn.length,
  }
}

describe('above-lane order vs abcjs', () => {
  for (const control of CONTROLS) {
    it(`puts every above mark on abcjs's rung — ${control.name}`, () => {
      const got = measure(control.abc)
      // THE EXTENT FIRST, because it is what agreed all along: every one of these was
      // already within 0.01px of abcjs before the ladder landed. If this fails, a lane has
      // been added or lost rather than reordered.
      expect(Math.abs(got.topLine - control.topLine), 'top line').toBeLessThan(EPSILON)
      expect(got.marks.length, 'mark count').toBe(control.marks.length)
      for (const [i, expected] of control.marks.entries()) {
        expect(Math.abs((got.marks[i] ?? 0) - expected), `mark ${i}`).toBeLessThan(EPSILON)
      }
    })
  }

  /**
   * THE DYNAMIC IS ASSERTED AS A DELTA, and that is a statement about the glyph, not a
   * weaker test.
   *
   * abcjs draws `mf` as two of its own outlines, `m` and `f`; abcts draws Bravura's single
   * `dynamicMF`. The two fonts anchor that shape differently, so our mark sits a CONSTANT
   * 15.13px above abcjs's — on the below side as well as the above one, which is what
   * proves it is the outline and not the lane. Glyph outlines are out of scope by standing
   * policy; where the glyph is PLACED is not, and a delta between two controls cancels the
   * outline exactly and leaves the placement.
   */
  it("moves the dynamic between lanes exactly as abcjs's does", () => {
    const base = CONTROLS.find((c) => c.name === 'dynamic above')
    if (base === undefined) throw new Error('missing baseline control')
    const ourBase = measure(base.abc).dynamic ?? 0
    for (const control of CONTROLS) {
      if (control.dynamic === undefined) continue
      const got = measure(control.abc).dynamic
      expect(got, `${control.name} draws a dynamic`).not.toBeNull()
      const ours = (got ?? 0) - ourBase
      const theirs = control.dynamic - (base.dynamic ?? 0)
      expect(Math.abs(ours - theirs), `${control.name} delta`).toBeLessThan(EPSILON)
    }
  })
})
