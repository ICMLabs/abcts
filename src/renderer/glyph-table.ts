/**
 * Which glyphs a render draws — Bravura, or abcjs's own.
 *
 * ONE emitter, one layout, two glyph tables. The table is selected by mode and everything
 * downstream reads it through the same shape, so nothing else has to know which font is
 * in play.
 *
 * ── WHY THE TABLE IS A LAYOUT INPUT, NOT A DRAWING DETAIL ────────────────────
 * A font's ADVANCES decide where the next thing goes, and abcjs's differ from Bravura's
 * by -13% to +12% — `noteheads.whole` is 1.9335 staff spaces against Bravura's 1.6880.
 * That is not a rounding difference; it moves notes. So "draw abcjs's outlines" and "use
 * abcjs's spacing" are the same decision, and taking one without the other gives
 * correctly-sized gaps around wrongly-sized shapes.
 *
 * `abcjs-strict` therefore draws abcjs's glyphs at abcjs's advances, and everything else
 * draws Bravura — which is the better font, and the only one carrying the glyphs the
 * extended features need.
 *
 * ── UNITS ────────────────────────────────────────────────────────────────────
 * Everything here is STAFF SPACES, because that is the coordinate system layout thinks
 * in. abcjs's table is stored in its own pixels (7.75 to a space) and converted on the
 * way out, with the conversion factor carried on the entry so the emitter can scale the
 * path data it did not convert. The path itself is left in abcjs's units deliberately:
 * rewriting the numbers inside a `d` string is how you turn a faithful copy into an
 * approximate one, and the emitter can express the same thing with a transform.
 */
import { type CompatibilityMode, isStrict } from '../core/model.js'
import { ABCJS_LINE_PX, spaces } from './abcjs-constants.js'
import { SMUFL_TO_ABCJS } from './glyph-map.js'
import { ENGRAVING_DEFAULTS, GLYPHS, type GlyphName } from './glyphs.js'
import { ABCJS_GLYPHS, ABCJS_STAFF_SPACE } from './glyphs-abcjs.js'

/** One glyph, as everything downstream of the table wants it. */
export interface ResolvedGlyph {
  /** Path data, in units of `unitsPerSpace` staff spaces. */
  readonly path: string
  /** Horizontal advance, STAFF SPACES. */
  readonly advance: number
  /** Ink width, STAFF SPACES. */
  readonly width: number
  /** Ink height, STAFF SPACES. */
  readonly height: number
  /** Ink box top relative to the draw origin, STAFF SPACES — negative is above. */
  readonly y: number
  /**
   * The height abcjs DECLARES for this glyph, staff spaces — its published `h`, which is
   * what `symbolHeightInPitches` divides by `STEP` and what every reserve and decoration
   * stack is measured in. NOT the derived ink box: the two differ (`noteheads.quarter`
   * publishes 8.094 against an ink box of 8.13), and abcjs never consults the ink box.
   * Bravura has no published figure, so its ink height stands in.
   */
  readonly declaredHeight: number
  /**
   * How many units of `path` make one staff space — 1 for Bravura, 7.75 for abcjs.
   *
   * The emitter multiplies by its reciprocal. Carried rather than baked so the path data
   * stays byte-identical to its source, which is the whole reason for having abcjs's
   * table at all.
   */
  readonly unitsPerSpace: number
}

export interface GlyphTable {
  /** The glyph, or `undefined` when this table has no such shape. */
  get(name: GlyphName): ResolvedGlyph | undefined
  /** Advance in staff spaces, falling back to Bravura's so spacing never collapses to 0. */
  advance(name: GlyphName): number
  /** Ink width in staff spaces, same fallback. */
  width(name: GlyphName): number
  readonly usesAbcjsGlyphs: boolean
}

const bravuraEntry = (name: GlyphName): ResolvedGlyph | undefined => {
  const glyph = GLYPHS[name]
  if (glyph === undefined) return undefined
  return {
    path: glyph.path,
    advance: glyph.advance,
    width: glyph.width,
    height: glyph.height,
    y: glyph.y,
    declaredHeight: glyph.height,
    unitsPerSpace: 1,
  }
}

const BRAVURA: GlyphTable = {
  get: bravuraEntry,
  advance: (name) => GLYPHS[name]?.advance ?? 0,
  width: (name) => GLYPHS[name]?.width ?? 0,
  usesAbcjsGlyphs: false,
}

/**
 * abcjs's glyphs, with Bravura standing in wherever abcjs has no such shape.
 *
 * The fallback is not a compromise — it is the parity behaviour. abcjs has no
 * three-quarter-tone accidental and no styled noteheads, so anything reaching for one is
 * already outside what abcjs can express, and drawing Bravura's is strictly better than
 * drawing nothing. Where abcjs DOES have the glyph, abcjs wins, which is every glyph the
 * corpus actually leans on. `glyph-map.test.ts` accounts for both lists.
 */
const ABCJS: GlyphTable = {
  get: (name) => {
    const mapped = SMUFL_TO_ABCJS[name]
    const glyph = mapped === undefined ? undefined : ABCJS_GLYPHS[mapped]
    if (glyph === undefined) return bravuraEntry(name)
    return {
      path: glyph.path,
      advance: glyph.w / ABCJS_STAFF_SPACE,
      width: glyph.w / ABCJS_STAFF_SPACE,
      // The DERIVED ink box, not the published `h`: abcjs ships a height but no origin
      // offset, and a glyph cannot be placed vertically without one. See the generator.
      height: glyph.boxHeight / ABCJS_STAFF_SPACE,
      y: glyph.y / ABCJS_STAFF_SPACE,
      declaredHeight: glyph.h / ABCJS_STAFF_SPACE,
      unitsPerSpace: ABCJS_STAFF_SPACE,
    }
  },
  advance: (name) => ABCJS.get(name)?.advance ?? 0,
  width: (name) => ABCJS.get(name)?.width ?? 0,
  usesAbcjsGlyphs: true,
}

/** The table a mode draws with. Strict gets abcjs's; everything else gets Bravura. */
export const glyphTableFor = (mode: CompatibilityMode): GlyphTable =>
  isStrict(mode) ? ABCJS : BRAVURA

/**
 * The table for a render, from the `strict` flag layout already threads everywhere.
 *
 * Keyed on that rather than passed as a parameter through fourteen signatures: the flag
 * is already in scope at every site that reads a glyph metric, and it is the same
 * decision. A second parameter carrying the same bit would be two ways to say one thing.
 */
export const glyphsFor = (strict: boolean): GlyphTable => (strict ? ABCJS : BRAVURA)

/**
 * LINE WEIGHTS for a render — abcjs's in strict, Bravura's everywhere else.
 *
 * The same split `glyphsFor` makes for outlines, and for the same reason: `abcjs-strict`
 * has no latitude. Bravura's `ENGRAVING_DEFAULTS` was reaching strict at 21 ungated sites
 * and drawing a thin barline at 1.24px where abcjs draws 0.600 — see `ABCJS_LINE_PX`.
 *
 * Five entries are NOT YET PORTED and still take Bravura's number in BOTH modes; each says
 * what to measure. They are flagged rather than guessed because a wrong constant that
 * looks decided is worse than one that says it is not.
 */
export interface LineWeights {
  readonly staffLine: number
  readonly stem: number
  readonly beam: number
  readonly beamSpacing: number
  readonly ledgerLine: number
  readonly ledgerExtension: number
  readonly thinBarline: number
  readonly thickBarline: number
  readonly barlineSeparation: number
  readonly repeatBarlineDotSeparation: number
  readonly slurEndpoint: number
  readonly slurMidpoint: number
  readonly tieEndpoint: number
  readonly tieMidpoint: number
}

const BRAVURA_WEIGHTS: LineWeights = {
  staffLine: ENGRAVING_DEFAULTS.staffLineThickness,
  stem: ENGRAVING_DEFAULTS.stemThickness,
  beam: ENGRAVING_DEFAULTS.beamThickness,
  beamSpacing: ENGRAVING_DEFAULTS.beamSpacing,
  ledgerLine: ENGRAVING_DEFAULTS.legerLineThickness,
  ledgerExtension: ENGRAVING_DEFAULTS.legerLineExtension,
  thinBarline: ENGRAVING_DEFAULTS.thinBarlineThickness,
  thickBarline: ENGRAVING_DEFAULTS.thickBarlineThickness,
  barlineSeparation: ENGRAVING_DEFAULTS.barlineSeparation,
  repeatBarlineDotSeparation: ENGRAVING_DEFAULTS.repeatBarlineDotSeparation,
  slurEndpoint: ENGRAVING_DEFAULTS.slurEndpointThickness,
  slurMidpoint: ENGRAVING_DEFAULTS.slurMidpointThickness,
  tieEndpoint: ENGRAVING_DEFAULTS.tieEndpointThickness,
  tieMidpoint: ENGRAVING_DEFAULTS.tieMidpointThickness,
}

const ABCJS_WEIGHTS: LineWeights = {
  ...BRAVURA_WEIGHTS,
  staffLine: spaces(ABCJS_LINE_PX.staffLine),
  stem: spaces(ABCJS_LINE_PX.stem),
  beam: spaces(ABCJS_LINE_PX.beam),
  ledgerLine: spaces(ABCJS_LINE_PX.ledgerLine),
  ledgerExtension: spaces(ABCJS_LINE_PX.ledgerExtension),
  thinBarline: spaces(ABCJS_LINE_PX.thinBarline),
  thickBarline: spaces(ABCJS_LINE_PX.thickBarline),
  // NOT YET PORTED, and still Bravura's in strict:
  //   beamSpacing                 measure the gap between two beams of a 16th run
  //   barlineSeparation           4.0px thick->thin and 3.4 thin->thick in the goldens,
  //                               which is asymmetric where ours is one constant
  //   repeatBarlineDotSeparation  measure off a `|:` in S4-bars-repeats
  //   slur/tie endpoint+midpoint  abcjs builds its own path in `draw/tie.js`; this is a
  //                               shape difference, not one number
}

/** The line weights a render draws with. Strict gets abcjs's; everything else Bravura's. */
export const lineWeightsFor = (strict: boolean): LineWeights =>
  strict ? ABCJS_WEIGHTS : BRAVURA_WEIGHTS

export { ABCJS as ABCJS_TABLE, BRAVURA as BRAVURA_TABLE }
