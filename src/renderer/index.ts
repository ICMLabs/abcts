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
  stepToY,
} from './layout.js'
export { type RenderOptions, toSVG } from './svg.js'

import type { Score } from '../core/model.js'
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
  toSVG(
    Array.isArray(score) ? layoutBook(score, options) : layout(score as Score, options),
    options,
  )
