/**
 * **A `classes` OPTION CHOOSES THE NAMES, NOT THE PICTURE.**
 *
 * `RenderOptions.classes` is `"abcjs"` or `"abcts"`, and it exists so a page that styles
 * `.abcjs-notehead` keeps working when abcts replaces abcjs. It is a VOCABULARY, and
 * nothing a host asks for in the ABC may depend on which one is in play.
 *
 * ── ⚠️ WHY IT NEEDED A GATE ──────────────────────────────────────────────────
 * It did depend on it. `%%titlefont Times-Roman 22 box` and `%%gchordfont Arial 14 box`
 * drew no box at all under `classes: "abcts"`, in BOTH modes, because the two emission
 * sites were written inside the abcjs branch. Measured on one tune:
 *
 *     classes: "abcjs"   2 boxes        classes: "abcts"   0 boxes
 *
 * It cost an afternoon to find, because the comparison site's extended column renders
 * through core and it therefore read as an **extended-mode** defect. It is not: strict and
 * extended agreed exactly, and each disagreed with itself across the two vocabularies.
 * `tests/mode-bytes.test.ts` could not see it — both sides of that comparison ask for
 * abcjs's names, which is the right thing for it to do and the reason this file exists.
 *
 * ── AND THE TWO SHAPES OF ONE DIRECTIVE ─────────────────────────────────────
 * A `box` reaches the emitter two ways and both had to be fixed: a MUSIC text carries
 * `box` + `boxSize` and measures its own rect; a BLOCK row (`%%titlefont`, `%%subtitlefont`,
 * the bottom-text fields) carries a `boxRect` already placed. Fixing the first alone left
 * the title unboxed and the chord symbol boxed — which is why the control below asks for
 * one of each in the same tune.
 */
import { describe, expect, it } from 'vitest'
import type { CompatibilityMode } from '../src/core/model.js'
import { parse } from '../src/index.js'
import { STAFF_SPACE_PX } from '../src/renderer/abcjs-constants.js'
import { render } from '../src/renderer/index.js'

const MODES = ['abcjs-strict', 'abcjs-extended'] as const

const svgOf = (abc: string, mode: CompatibilityMode, classes: 'abcjs' | 'abcts'): string => {
  const parsed = parse(abc, { mode })
  if (!parsed.ok) throw new Error('did not parse')
  const score = parsed.scores[0]
  if (score === undefined) throw new Error('no score')
  return render(score, {
    mode,
    classes,
    systemWidth: 700,
    staffSpace: STAFF_SPACE_PX,
  })
}

/** abcjs names its rules; core classes them. Either way, four rules make one box. */
const boxes = (svg: string): number =>
  (svg.match(/data-name="box"/g) ?? []).length + (svg.match(/class="abcts-box"/g) ?? []).length

/** One block row and one music text, so a fix to either shape alone fails. */
const BOXED =
  'X:1\n%%titlefont Times-Roman 22 box\n%%gchordfont Arial 14 box\nT:Boxed Title\nL:1/4\nK:C\n"Am"CDEF|\n'
/** The same tune with the directives removed — the control, not decoration. */
const PLAIN = 'X:1\nT:Plain Title\nL:1/4\nK:C\n"Am"CDEF|\n'

describe('the `classes` option names things, it does not decide them', () => {
  for (const mode of MODES) {
    it(`${mode}: a %%…box directive boxes both shapes in both vocabularies`, () => {
      for (const classes of ['abcjs', 'abcts'] as const)
        expect(boxes(svgOf(BOXED, mode, classes)), `${classes}`).toBe(2)
    })

    /**
     * ⚠️ **THE ROW ABOVE PASSES FOR A COUNTER THAT COUNTS ANYTHING.** This is what says it
     * is counting the DIRECTIVE — remove `box` from the two `%%…font` lines and both
     * vocabularies must fall to zero. Without it a change that boxed every text would read
     * as a pass.
     */
    it(`${mode}: and draws none without it`, () => {
      for (const classes of ['abcjs', 'abcts'] as const)
        expect(boxes(svgOf(PLAIN, mode, classes)), `${classes}`).toBe(0)
    })
  }

  /**
   * The rules are drawn once, not once per vocabulary — the block row's rect used to be
   * emitted by the top-text pass AND could have been emitted again in the element loop.
   * A count of two is what stops that being invisible, and this states why two.
   */
  it('draws four rules per box and no more', () => {
    const svg = svgOf(BOXED, 'abcjs-strict', 'abcjs')
    // Each box is ONE path holding four filled rules — `Svg.rect` (`svg.js:112-142`).
    expect((svg.match(/data-name="box"/g) ?? []).length).toBe(2)
    for (const d of [...svg.matchAll(/<path d="([^"]*)" stroke="none" data-name="box"/g)])
      expect((d[1]?.match(/M /g) ?? []).length, 'rules in one box').toBe(4)
  })
})
