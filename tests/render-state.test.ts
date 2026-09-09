/**
 * **A LAID-OUT DOCUMENT MUST STILL DRAW THE SAME AFTER ANOTHER SCORE HAS BEEN LAID OUT.**
 *
 * `layout.ts` carries sixteen render-scoped module `let`s — the page padding, the print
 * scale, the score's fonts, the line weights, `ABCJS_GAPS` — each set at the top of every
 * `layout()` call. That is a defensible local choice with one global consequence: a `Layout`
 * outlives the call that made it, so drawing one AFTER a different score has been laid out
 * asks whether the emitter reads any of that state.
 *
 * ⚠️ **THIS BECAME REACHABLE ON 2026-09-07**, when `laidOut()` in compat gained a memo:
 * `measureWidthsOf` lays the tune out AGAIN at width 0, so a host that reaches the wrap
 * search and then the cached document has exactly this interleaving. Establishing it was
 * safe took reading `svg.ts`'s imports and confirming that `ENGRAVE` and `stepToY` are both
 * constants — an hour of proof that no test could have given, because no test asked.
 *
 * This is that test, and it is **verified against the defect three ways** rather than
 * assumed. With `svg.ts` temporarily made to read `PAGE_PADDING` and emit it:
 *
 *     no save/restore wrapper          -> FAILS
 *     wrapper present                  -> passes (the restore absorbs the leak)
 *     wrapper minus ONE restored field -> FAILS
 *
 * so it defends each of the sixteen individually, not the block. ⚠️ And the FIRST attempt
 * at that verification was mute: the probe computed the leaked value and never emitted it,
 * so all three variants passed and this comment nearly said the guard was untestable.
 * A probe that does not reach the output is not a probe.
 */
import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'
import { STAFF_SPACE_PX } from '../src/renderer/abcjs-constants.js'
import { layout, toSVG } from '../src/renderer/index.js'

const scoreOf = (abc: string) => {
  const parsed = parse(abc, { mode: 'abcjs-strict' })
  if (!parsed.ok) throw new Error('did not parse')
  const score = parsed.scores[0]
  if (score === undefined) throw new Error('no score')
  return score
}

/** Two tunes whose settings differ in as many of the sixteen as one tune can. */
const A =
  'X:1\n%%titlefont Times-Roman 22 box\n%%leftmargin 40\n%%jazzchords 1\nT:A\nM:4/4\nL:1/4\nK:C\n' +
  '"Am7"CDEF|GABc|\nw:one two three four\n'
const B = 'X:1\n%%vocalfont Helvetica 10\n%%rightmargin 5\nT:B\nM:3/4\nL:1/8\nK:Eb\nGABcde|\n'

const EMIT = { classes: 'abcjs', staffSpace: STAFF_SPACE_PX } as const

describe('a Layout outlives the call that made it', () => {
  it('draws the same after another score has been laid out', () => {
    const docA = layout(scoreOf(A), { mode: 'abcjs-strict', systemWidth: 700 })
    const fresh = toSVG(docA, { ...EMIT, mode: 'abcjs-strict' })

    // Everything a host can do between the layout and the draw, and the interleaving the
    // `laidOut()` memo made reachable: another score, at another width, in print.
    layout(scoreOf(B), { mode: 'abcjs-strict', systemWidth: 0 })
    layout(scoreOf(B), { mode: 'abcjs-strict', systemWidth: 300, print: true })

    expect(toSVG(docA, { ...EMIT, mode: 'abcjs-strict' })).toBe(fresh)
  })

  /**
   * ⚠️ **AND THE CONTROL, because the row above passes for an emitter that reads NOTHING
   * at all.** The two tunes must genuinely draw differently, or "unchanged" would be a
   * statement about an instrument that cannot see.
   */
  it('and the two tunes are not the same drawing', () => {
    const a = toSVG(layout(scoreOf(A), { mode: 'abcjs-strict', systemWidth: 700 }), {
      ...EMIT,
      mode: 'abcjs-strict',
    })
    const b = toSVG(layout(scoreOf(B), { mode: 'abcjs-strict', systemWidth: 700 }), {
      ...EMIT,
      mode: 'abcjs-strict',
    })
    expect(a).not.toBe(b)
  })

  /**
   * The property `RenderState` exists for, stated where it can be read: laying out B in the
   * middle must not change what laying out A produces. Under the old code every switch was
   * re-set on entry so this held by re-assignment; it holds by SAVE AND RESTORE now, which
   * is what makes a SKIPPED call safe as well as an interleaved one.
   */
  it('lays a score out identically whatever preceded it', () => {
    const once = layout(scoreOf(A), { mode: 'abcjs-strict', systemWidth: 700 })
    layout(scoreOf(B), { mode: 'abcjs-strict', systemWidth: 120, print: true })
    const again = layout(scoreOf(A), { mode: 'abcjs-strict', systemWidth: 700 })
    expect(toSVG(again, { ...EMIT, mode: 'abcjs-strict' })).toBe(
      toSVG(once, { ...EMIT, mode: 'abcjs-strict' }),
    )
  })
})
