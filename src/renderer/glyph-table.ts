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
import {
  ABCJS_ARC,
  ABCJS_LINE_PX,
  ABCJS_PITCH,
  SPACE,
  spaces,
  spacesOfPitch,
  UNIT_PX,
} from './abcjs-constants.js'
import { SMUFL_TO_ABCJS } from './glyph-map.js'
import { ENGRAVING_DEFAULTS, GLYPHS, type GlyphName } from './glyphs.js'
import { ABCJS_GLYPHS, ABCJS_STAFF_SPACE } from './glyphs-abcjs.js'
import { glyphOverride } from './set-glyph.js'

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
    // Bravura's metrics are published in STAFF SPACES, so they carry the unit factor;
    // abcjs's are published in ITS PIXELS and are divided by the unit instead. Both land
    // in layout units, which is what every caller means by a width.
    advance: glyph.advance * SPACE,
    width: glyph.width * SPACE,
    height: glyph.height * SPACE,
    y: glyph.y * SPACE,
    declaredHeight: glyph.height * SPACE,
    unitsPerSpace: 1,
  }
}

const BRAVURA: GlyphTable = {
  get: bravuraEntry,
  advance: (name) => (GLYPHS[name]?.advance ?? 0) * SPACE,
  width: (name) => (GLYPHS[name]?.width ?? 0) * SPACE,
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
    // **A HOST'S `setGlyph` WINS OVER THE TABLE**, which is what abcjs's own does by
    // writing into it — see `src/renderer/set-glyph.ts`.
    const glyph =
      mapped === undefined ? undefined : (glyphOverride(mapped) ?? ABCJS_GLYPHS[mapped])
    if (glyph === undefined) return bravuraEntry(name)
    return {
      path: glyph.path,
      advance: glyph.w / UNIT_PX,
      width: glyph.w / UNIT_PX,
      // The DERIVED ink box, not the published `h`: abcjs ships a height but no origin
      // offset, and a glyph cannot be placed vertically without one. See the generator.
      height: glyph.boxHeight / UNIT_PX,
      y: glyph.y / UNIT_PX,
      declaredHeight: glyph.h / UNIT_PX,
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
 * Two entries are NOT YET PORTED and still take Bravura's number in BOTH modes; each says
 * what to measure. They are flagged rather than guessed because a wrong constant that
 * looks decided is worse than one that says it is not.
 */
export interface LineWeights {
  readonly staffLine: number
  readonly stem: number
  /** A BEAMED stem, which abcjs builds separately and thinner — see `ABCJS_LINE_PX`. */
  readonly beamedStem: number
  readonly beam: number
  /**
   * Centre-to-centre between stacked beams. abcjs states a STEP (1.5 pitch); Bravura states
   * a thickness plus a gap, and the two happen to agree exactly — see `ABCJS_PITCH.beamStep`.
   */
  readonly beamStep: number
  readonly ledgerLine: number
  readonly ledgerExtension: number
  readonly thinBarline: number
  readonly thickBarline: number
  readonly slurMidpoint: number
  readonly tieMidpoint: number
}

// SMuFL publishes every one of these in STAFF SPACES, so each carries the unit factor.
const BRAVURA_WEIGHTS: LineWeights = {
  staffLine: ENGRAVING_DEFAULTS.staffLineThickness * SPACE,
  stem: ENGRAVING_DEFAULTS.stemThickness * SPACE,
  beamedStem: ENGRAVING_DEFAULTS.stemThickness * SPACE,
  beam: ENGRAVING_DEFAULTS.beamThickness * SPACE,
  beamStep: (ENGRAVING_DEFAULTS.beamThickness + ENGRAVING_DEFAULTS.beamSpacing) * SPACE,
  ledgerLine: ENGRAVING_DEFAULTS.legerLineThickness * SPACE,
  ledgerExtension: ENGRAVING_DEFAULTS.legerLineExtension * SPACE,
  thinBarline: ENGRAVING_DEFAULTS.thinBarlineThickness * SPACE,
  thickBarline: ENGRAVING_DEFAULTS.thickBarlineThickness * SPACE,
  slurMidpoint: ENGRAVING_DEFAULTS.slurMidpointThickness * SPACE,
  tieMidpoint: ENGRAVING_DEFAULTS.tieMidpointThickness * SPACE,
}

/**
 * NO `...BRAVURA_WEIGHTS` SPREAD, DELIBERATELY — and that absence is the whole point.
 *
 * This object used to start with the spread and override the keys anyone had got round to
 * porting. That is the exception model Lance's `ENGRAVE` question is about, in miniature:
 * the DEFAULT was Bravura and abcjs's figure was the special case, so a key nobody had
 * reached stayed Bravura's silently, in a mode whose entire purpose is to have no latitude.
 * `slurEndpoint` sat there for months and turned out to be the TUPLET BRACKET's rule.
 *
 * Written out in full, `LineWeights` being all-required makes a missing override a COMPILE
 * ERROR. That is a structural guarantee rather than a test, and it cannot rot.
 */
const ABCJS_WEIGHTS: LineWeights = {
  staffLine: spaces(ABCJS_LINE_PX.staffLine),
  stem: spaces(ABCJS_LINE_PX.stem),
  beamedStem: spaces(ABCJS_LINE_PX.beamedStem),
  beam: spaces(ABCJS_LINE_PX.beam),
  beamStep: spacesOfPitch(ABCJS_PITCH.beamStep),
  ledgerLine: spaces(ABCJS_LINE_PX.ledgerLine),
  ledgerExtension: spaces(ABCJS_LINE_PX.ledgerExtension),
  thinBarline: spaces(ABCJS_LINE_PX.thinBarline),
  thickBarline: spaces(ABCJS_LINE_PX.thickBarline),
  // abcjs's arc is a FLAT `thickness = 2` all the way along and comes to a POINT at both
  // ends, because the path returns through the same `x1,y1` it started from
  // (`draw/tie.js:57-102`). So there is no endpoint-versus-midpoint notion to port — the
  // endpoint keys are gone from the interface entirely and the midpoint is abcjs's 2.
  //
  // `curveToPath`'s strict branch builds the shape from `ABCJS_ARC` and reads neither, so
  // this changes no pixel; it stops the table from asserting something untrue.
  slurMidpoint: spaces(ABCJS_ARC.thickness),
  tieMidpoint: spaces(ABCJS_ARC.thickness),
}

/** The line weights a render draws with. Strict gets abcjs's; everything else Bravura's. */
export const lineWeightsFor = (strict: boolean): LineWeights =>
  strict ? ABCJS_WEIGHTS : BRAVURA_WEIGHTS

export { ABCJS as ABCJS_TABLE, BRAVURA as BRAVURA_TABLE }
