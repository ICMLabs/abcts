/**
 * Renderer — `Score` → SVG.
 *
 * Two stages, both public, because they are useful separately: `layout()` yields
 * positioned elements in staff spaces (what the structural gate reads, and what a
 * host needs for hit-testing and cross-linking), `toSVG()` turns those into markup.
 */
export {
  type ElementType,
  type Layout,
  type LayoutElement,
  type LayoutOptions,
  type LayoutSystem,
  layout,
  type PlacedGlyph,
  type PlacedLine,
  type RenderProfile,
  stepToY,
} from './layout.js'
export { type RenderOptions, toSVG } from './svg.js'

import { defaultMode, isStrict, type Score } from '../core/model.js'
import { withLiveMeasurement } from './text-measure.js'
import { type LayoutOptions, layout, layoutBook } from './layout.js'
import { type RenderOptions, toSVG } from './svg.js'

/**
 * Lay out and emit in one call — the common case.
 *
 * Takes one tune or a whole tunebook. `parse()` returns `scores`, so passing that array
 * straight through renders every tune rather than silently only the first, which is what
 * a caller doing `render(result.scores[0])` gets and rarely means.
 */
export const render = (
  score: Score | readonly Score[],
  options: RenderOptions & LayoutOptions = {},
): string =>
  /**
   * **MEASURED WITH THE BROWSER'S OWN METRICS WHERE THERE IS A BROWSER** — see
   * `withLiveMeasurement`. Until 2026-09-04 that installer lived in `compat/index.ts` and
   * was therefore reachable from `abcjs-strict` alone, so a host using `abcts` proper laid
   * text out with the per-em TABLES in a real browser: the one mode meant to be right about
   * text was the one that never asked the browser.
   *
   * The cache is the MODE's: abcjs's module-global, x-free one for strict, because that
   * history-dependence is part of abcjs's output; a per-render one keyed WITH the x for
   * everything else, because that is correct. `ABCJS-DEBT.md` §3b.1.
   */
  withLiveMeasurement(isStrict(options.mode ?? defaultMode), () =>
    toSVG(
      Array.isArray(score) ? layoutBook(score, options) : layout(score as Score, options),
      options,
    ),
  )
