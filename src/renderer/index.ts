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
import { type LayoutOptions, layout } from './layout.js'
import { type RenderOptions, toSVG } from './svg.js'

/** Lay out and emit in one call — the common case. */
export const render = (score: Score, options: RenderOptions & LayoutOptions = {}): string =>
  toSVG(layout(score, options), options)
