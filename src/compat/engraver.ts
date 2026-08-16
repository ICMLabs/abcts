import type { Score } from '../core/model.js'
import { parse } from '../parser/parser.js'
import { layout } from '../renderer/layout.js'
import { STAFF_SPACE_PX, UNIT_PX } from '../renderer/abcjs-constants.js'
import { toSVG } from '../renderer/svg.js'

import { numberOfTunes, TuneBook } from './tunebook.js'

/**
 * `abcjs.test.{Parse, EngraverController}` — the two internals abcjs exposes for testing
 * and which its own golden generator uses. Its comment reads "probably not needed for most
 * uses"; `dump-tunebook-svg.js` needs `EngraverController` and it is exactly what a
 * `-stacked` render is, so it is built rather than declined.
 */

/** A target that can hold markup — a real element, or anything with `innerHTML`. */
type Paper = { innerHTML: string } | string | null | undefined

interface EngraverParams {
  readonly staffwidth?: number
  readonly print?: boolean
  readonly add_classes?: boolean
  readonly scale?: number
}

const SCREEN_PADDING = 15
const PRINT_PADDING = 68
const PRINT_SCALE = 0.75

/**
 * `EngraverController` — **ONE CONTROLLER IS ONE PAGE.** `engraveABC` resets once and then
 * runs `engraveTune` per tune, so `renderer.y` carries across and every tune of a book is
 * drawn down the same SVG (`engraver-controller.js:105-118`). That is the whole difference
 * from `renderAbc`, which gives each tune its own controller and its own `<svg>`.
 */
export class EngraverController {
  /** The markup of the last `engraveABC`, also written into the paper when there is one. */
  svg = ''

  constructor(
    private readonly paper: Paper = null,
    private readonly params: EngraverParams = {},
  ) {}

  engraveABC(tunes: readonly { score: Score }[] | { score: Score }): string {
    const list = Array.isArray(tunes)
      ? (tunes as readonly { score: Score }[])
      : [tunes as { score: Score }]
    const printing = this.params.print === true
    const padding = printing ? PRINT_PADDING : SCREEN_PADDING
    const scale = printing ? PRINT_SCALE : 1
    const systemWidth =
      this.params.staffwidth === undefined
        ? undefined
        : (this.params.staffwidth + padding * 2) / UNIT_PX / scale

    // ONE CONTINUOUS PAGE CURSOR — each tune's walk is seeded with the one above's `endY`.
    let pageTop = 0
    const layouts = list.map((t) => {
      const doc = layout(t.score, {
        mode: 'abcjs-strict',
        ...(systemWidth === undefined ? {} : { systemWidth }),
        ...(printing ? { print: true } : {}),
        pageTop,
      })
      pageTop = doc.endY ?? pageTop
      return doc
    })

    this.svg = toSVG(layouts, {
      staffSpace: STAFF_SPACE_PX * (this.params.scale ?? 1),
      classes: 'abcjs',
      ...(this.params.add_classes === true ? { addClasses: true } : {}),
      titles: list.map((t) => titleOf(t.score)),
    })
    if (this.paper !== null && this.paper !== undefined && typeof this.paper !== 'string') {
      this.paper.innerHTML = this.svg
    }
    return this.svg
  }
}

const titleOf = (score: Score): string | undefined => {
  const t = score.metadata.titles[0]
  if (t === undefined) return undefined
  return typeof t === 'string' ? t : t.map(() => '[object Object]').join(',')
}

/**
 * `Parse` — abcjs's parser object. `parse(abc, switches, startPos)` then `getTune()`.
 *
 * A book is split before this in abcjs, so `parse` is handed ONE tune's text; ours parses
 * whatever it is given and keeps the first score, which is the same thing for that input.
 */
export class Parse {
  private score: Score | null = null
  private diagnostics: readonly { message: string }[] = []

  parse(abc: string, _switches: unknown = {}, _startPos = 0): void {
    const result = parse(abc, { mode: 'abcjs-strict' })
    this.score = result.scores[0] ?? null
    this.diagnostics = result.diagnostics
  }

  getTune(): Score | null {
    return this.score
  }

  /** abcjs returns `undefined` — not an empty array — when a tune parsed cleanly. */
  getWarnings(): string[] | undefined {
    const warnings = this.diagnostics.map((d) => d.message)
    return warnings.length > 0 ? warnings : undefined
  }
}

/** How many tunes a string holds, re-exported so `renderEngine`'s callers need one import. */
export { numberOfTunes, TuneBook }
