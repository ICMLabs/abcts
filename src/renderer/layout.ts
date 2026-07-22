/**
 * Layout — `Score` → positioned elements, in staff spaces.
 *
 * This is the stage the structural gate reads. SVG emission is a separate, dumber pass
 * over the same result (`svg.ts`), so what gets tested is where things ARE, not how the
 * markup happens to be spelled. That split is deliberate: core renders in its own visual
 * style, so a byte comparison of its SVG gates nothing, whereas element sequence and
 * staff positions are exactly the properties that must not drift.
 *
 * UNITS: staff spaces throughout, y-DOWN. The middle staff line is y = 0 and staff step
 * 0. A staff step is one diatonic position — line to adjacent space — and half a staff
 * space, so `y = -step / 2` (negated because higher pitch is lower y).
 *
 * Design follows abcMusicKit2: font metadata (glyph metrics, line thicknesses) stays in
 * the font, engraving conventions (stem length, spacing) live in ENGRAVE below.
 */
import {
  Accidental,
  type Barline,
  type Clef,
  type ClefShape,
  type CompatibilityMode,
  DEFAULT_VOCALFONT_PT,
  type DiatonicStep,
  defaultClef,
  defaultMode,
  isStrict,
  type KeySignature,
  type Measure,
  type Mode,
  type MusicEvent,
  type NoteStyle,
  type Pitch,
  type Rational,
  type Rest,
  rational,
  ratToNumber,
  type Score,
  type StaffGroup,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import { ENGRAVING_DEFAULTS, GLYPHS, type GlyphName } from './glyphs.js'
import { CHAR_ADVANCE, FALLBACK_ADVANCE } from './text-metrics.js'

// ─── Engine constants ────────────────────────────────────────────────────────
// Engraving conventions, NOT font metadata. Sources noted; values marked PROVISIONAL
// are starting points pending calibration against reference renders.

const ENGRAVE = {
  /** Steps of the five staff lines, bottom → top, about the middle line at 0. */
  staffLineSteps: [-4, -2, 0, 2, 4],
  /** A staff step is half a staff space. */
  spacePerStep: 0.5,
  /** Standard stem length ≈ one octave. *Behind Bars* (Gould). */
  stemLength: 3.5,
  /** First ledger step beyond the staff; grows outward by 2. *Behind Bars*. */
  firstLedgerStep: 6,
  /** Ledger line overhang past the notehead each side. */
  ledgerExtension: ENGRAVING_DEFAULTS.legerLineExtension,
  /** Page margin left of the staff. PROVISIONAL. */
  marginX: 1.0,
  /** Vertical padding above and below the staff. PROVISIONAL. */
  marginY: 4.0,
  /** Gap after a clef or meter before the next element. PROVISIONAL. */
  prefixGap: 1.0,
  /**
   * Gap between adjacent accidentals in a key signature. Bravura's advance width for a
   * sharp equals its ink width exactly, so laying them out on advance alone butts them
   * edge to edge — and a sharp is 2.8 staff spaces tall, so neighbours at different
   * heights visibly interpenetrate. Engraving sets them close but clear. PROVISIONAL.
   */
  keySignatureGap: 0.15,
  /** Gap between an accidental and the notehead it alters. PROVISIONAL. */
  accidentalGap: 0.15,
  /** Gap from the notehead's right edge to the first augmentation dot. PROVISIONAL. */
  dotGap: 0.35,
  /** Spacing between successive dots on a double- or triple-dotted note. PROVISIONAL. */
  dotSpacing: 0.45,
  /**
   * Square-root spacing coefficient, in staff spaces: a note's natural width is
   * `spacingScale · √(duration / reference)`.
   *
   * Taken from abcMusicKit2's `EngravingConstants.spacingScale`, which is not a guess:
   * abcm2ps's duration→width curve was measured by black-box probe and fits a pure
   * SQUARE ROOT of duration (its per-halving increment shrinks by ~1/√2 each step,
   * steeper than log2), and the full recovered model `W(d|s) = min(6.667, 13.3·√s)·√(d/s)`
   * collapses to `13.3·√d` for any line whose shortest note is a quarter or less — which
   * is nearly all music. 3.25 ≈ 13.3/4 is the corpus-centered scale.
   */
  spacingScale: 3.25,
  /**
   * Absolute spacing anchor. A sixteenth gets exactly `spacingScale`; everything else
   * scales from it by √duration, so a note's width depends only on its own duration and
   * not on what surrounds it.
   */
  spacingReference: 1 / 16,
  /** Hard minimum gap between adjacent columns — the rod floor beneath the springs. */
  minColumnGap: 0.6,
  /** Space either side of a barline. PROVISIONAL. */
  barGap: 1.0,
  /**
   * LANES above and below the staff, in staff steps. The staff itself spans -4 to 4.
   *
   * Fixed lanes rather than a skyline pass. Real engraving stacks whatever is present
   * and closes the gap when something is absent; lanes are the smaller correct answer
   * while the set of things that can appear is small and known. Each is far enough from
   * its neighbour that 1.4-space text cannot collide — `full-song-template` carries a
   * tempo and a part label at once, and `chord-grid` a symbol over every note.
   *
   * Nothing costs vertical space when absent: the drawing box is measured from the
   * content actually placed, so a tune with no tempo is no taller for the lane existing.
   */
  chordSymbolStep: 6,
  ornamentStep: 7,
  dynamicStep: -7,
  /**
   * `"^text"` above the staff and `"_text"` below.
   *
   * abcjs joins same-position annotations into ONE multi-line block, so the first one
   * written becomes the top line. Above the staff that puts it furthest out; below, it
   * puts it nearest. Stacking outward in reverse above and in written order below
   * reproduces both without special-casing either.
   *
   * ponytail: the above lane can reach `partStep` once three annotations stack, and the
   * below lane can reach `lyricStep` at two. No fixture combines them, and the real fix is
   * the skyline pass this whole block is waiting on rather than more hand-picked numbers.
   */
  annotationAboveStep: 8,
  annotationBelowStep: -6,
  annotationLineStep: 2.5,
  partStep: 10,
  tempoStep: 14,
  /** A tune's title sits above everything else it owns. */
  titleStep: 19,
  /** First verse below the staff; further verses stack downward by `lyricLineStep`. */
  lyricStep: -8,
  lyricLineStep: 4,
  /** Clearance between a brace or bracket and the staff it joins. */
  connectorGap: 0.6,
  /** A bracket is a rule, and a heavy one. */
  bracketThickness: 0.5,
  /** Mouth of a hairpin at its open end — abcjs paints 8px against a 7.75px space. */
  hairpinMouth: 1.0,
  /** Clearance either side of a glissando, so it does not touch the noteheads. */
  spannerGap: 0.3,
  /** Below this a hairpin is a smudge rather than a shape. */
  spannerMinLength: 1.5,
  /** Gap either side of a melisma extender — off the syllable, past the last notehead. */
  melismaGap: 0.4,
  /** Below this a run is a speck rather than a line; drawn as nothing. */
  melismaMinLength: 0.8,
  /** Tempo and part labels are directions; chord symbols and lyrics are smaller. */
  tempoTextSize: 1.6,
  titleTextSize: 2.4,
  /** Vertical gap between tunes in a tunebook — wider than between systems. */
  tuneGap: 6.0,
  lyricTextSize: 1.4,
  /**
   * A stem shortened to meet a beam never drops below this. *Behind Bars* keeps beamed
   * stems from collapsing to stubs. PROVISIONAL.
   */
  minStemLength: 2.5,
  /** Maximum total vertical rise of a sloped beam across its span. *Behind Bars*. */
  beamMaxRise: 2.0,
  /** Length of a secondary-beam stub on a note whose neighbours lack that level. */
  beamStubLength: 1.1,
  /** Clearance from a tuplet's furthest note to its bracket or number. PROVISIONAL. */
  tupletGap: 1.2,
  /** Half-gap the bracket leaves around its number. */
  tupletNumberGap: 0.35,
  /** Length of the hook turning down from each end of a tuplet bracket. */
  tupletHook: 0.6,
  tupletTextSize: 1.4,
  /** Staff step for a repeat-ending bracket, above everything the staff itself draws. */
  voltaStep: 8,
  /** How far the volta bracket's end hooks turn down toward the staff. */
  voltaHook: 1.4,
  voltaTextSize: 1.3,
  /** Grace notes are drawn at this fraction of full size. *Behind Bars* ~60%. */
  graceScale: 0.6,
  /** Horizontal advance per grace note, before the note it decorates. */
  graceAdvance: 1.1,
  /** Gap between the last grace note and the notehead it leads into. */
  graceGap: 0.4,
  /** Length of the hook that resumes a curve at the start of the next system. */
  curveContinuation: 2.0,
  /** How far a slur or tie endpoint sits clear of the notehead it springs from. */
  curveEndGap: 0.3,
  /** Arc height as a fraction of the curve's horizontal span, before clamping. */
  curveBulgeRatio: 0.18,
  /** Arc height floor and ceiling, in staff spaces. *Behind Bars* keeps slurs shallow. */
  curveMinBulge: 0.5,
  curveMaxBulge: 2.2,
  /**
   * Width a system may reach before it wraps, in staff spaces. Roughly a page width at a
   * typical staff size; a host that knows its viewport should pass `systemWidth`.
   */
  systemWidth: 90,
  /** Vertical gap between stacked systems. PROVISIONAL. */
  systemGap: 3.0,
  /**
   * A system is justified to the full width unless stretching it by more than this
   * factor. A nearly-empty last-but-one line would otherwise be pulled apart into
   * something unreadable; *Behind Bars* leaves such a line short instead.
   */
  maxJustifyStretch: 1.6,
  /** Vertical gap between staves WITHIN one system — tighter than between systems, so
   * the voices of one score read as belonging together. PROVISIONAL. */
  staffGap: 1.5,
} as const

// ─── Layout model ────────────────────────────────────────────────────────────

export type ElementType =
  | 'title'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'tempo'
  | 'part'
  | 'note'
  | 'rest'
  | 'bar'

/**
 * What a drawn part IS, independent of which element owns it.
 *
 * A note element draws a notehead, a stem and maybe a ledger line, and a host wants to
 * tell them apart — for styling, for hit-testing, and for the compat layer, which must
 * emit abcjs's per-part class names (`abcjs-notehead`, `abcjs-stem`, `abcjs-ledger`)
 * rather than one class for the whole note.
 */
export type PartRole =
  | 'notehead'
  | 'stem'
  | 'ledger'
  | 'accidental'
  | 'flag'
  | 'dot'
  | 'grace'
  | 'staff'
  | 'beam'
  | 'bar'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'rest'
  | 'decoration'
  | 'text'
  | 'lyric'

export interface PlacedGlyph {
  readonly name: GlyphName
  /**
   * Position within a CHORD, 1 = lowest pitch, counting upward. Absent on a single note.
   *
   * abcjs puts `abcjs-chord-pos-N` on each notehead of a chord and nothing on a lone one,
   * which is what its 722/715 split of pos-1 to pos-2 across the corpus shows — a single
   * note would make pos-1 dwarf the rest. Compat reproduces it because a stylesheet can
   * legitimately target it, and it was the ONLY class abcjs emits that we did not.
   */
  readonly chordPos?: number
  readonly x: number
  readonly y: number
  /** What this glyph is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * Uniform scale about the glyph origin. 1 unless stated — grace notes are the only
   * thing that shrinks, and they shrink everything: notehead, stem and flag together.
   */
  readonly scale?: number
}

export interface PlacedLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly thickness: number
  /** What this line is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
}

/**
 * Prose — a tempo direction, and later titles, lyrics and chord symbols.
 *
 * Kept separate from `PlacedGlyph` because the two are drawn by different mechanisms and
 * for a stated reason. Musical glyphs are inline paths so the SVG is self-contained; text
 * is a real `<text>` element in a generic family, because a missing serif face degrades
 * to a different serif whereas a missing Bravura degrades to nothing legible. That
 * asymmetry is the whole argument, and abcMusicKit2 splits the same way.
 */
export interface PlacedText {
  readonly text: string
  /** What this text is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  readonly x: number
  /** Baseline y, staff spaces. */
  readonly y: number
  /** Font size in staff spaces. */
  readonly size: number
  readonly bold: boolean
  readonly italic: boolean
}

export interface LayoutElement {
  readonly type: ElementType
  /** Left edge, staff spaces from the system origin. */
  readonly x: number
  readonly width: number
  /**
   * Staff steps of every notehead, ascending — 0 is the middle line, positive upward.
   * Empty for anything unpitched.
   *
   * ALL of them, not just the lowest, because this is what makes the structural gate
   * meaningful and a chord has more than one. Reporting a single step would leave every
   * upper notehead of every chord unverified while the suite reported MATCH — the exact
   * shape of the blind spot the parser audit found.
   */
  readonly staffSteps: readonly number[]
  readonly glyphs: readonly PlacedGlyph[]
  readonly lines: readonly PlacedLine[]
  readonly texts: readonly PlacedText[]
}

/**
 * Everything a beam needs to know about one of its members, recorded during layout so
 * the beam pass does not have to reverse-engineer it out of the drawn lines.
 */
export interface StemInfo {
  /** Index into the system's `elements`. */
  readonly element: number
  readonly x: number
  /** Staff step of the notehead furthest along the stem — where the tip is measured from. */
  readonly farStep: number
  readonly up: boolean
  /** Beams needed at this note: 1 for an eighth, 2 for a sixteenth. */
  readonly beams: number
}

/**
 * One voice's staff within a system.
 *
 * Laid out in its own coordinate space with its middle line at y = 0, and placed by
 * `originY`. Each staff carries its own clef, so a staff step means a different pitch on
 * different staves — which is exactly why the coordinate space is per staff, not shared.
 */
/**
 * A slur or tie: a lens-shaped curve, thin at the ends and thicker in the middle.
 *
 * Stored as endpoints plus a signed bulge rather than explicit control points, because
 * everything downstream wants the shape rather than the spline — the SVG backend derives
 * the two cubics, and a future canvas backend would derive its own.
 */
export interface PlacedCurve {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Height of the arc at its midpoint. NEGATIVE arcs upward, matching y-down. */
  readonly bulge: number
  readonly endThickness: number
  readonly midThickness: number
  /** A tie joins one pitch to itself; a slur spans a phrase. They differ in shape rules. */
  readonly kind: 'tie' | 'slur'
}

export interface LayoutStaff {
  /**
   * Everything drawn on this staff, in drawing order — the concatenation of `voices`.
   *
   * Most consumers want this: a renderer does not care which voice a stem belongs to.
   */
  readonly elements: readonly LayoutElement[]
  /**
   * The same elements, still split BY VOICE.
   *
   * A staff is not a voice — `%%score {1 (2 3)}` prints voices 2 and 3 on one staff — so
   * the flat list above cannot answer "what did voice 0 draw". abcjs keeps the same split
   * (`staffGroups[].voices[]`) and so does abcMusicKit v1 (`StaffDef.numVoices`), because
   * the answer is needed for stem-direction convention within a shared staff, and by any
   * gate comparing one voice against a reference.
   *
   * These hold the SAME element objects as `elements`, not copies.
   */
  readonly voices: readonly (readonly LayoutElement[])[]
  readonly staffLines: readonly PlacedLine[]
  /**
   * Beams, which belong to no single element — a beam spans several noteheads and is
   * drawn once for the group, after every member's position is known. Per staff, since
   * a beam never joins two voices.
   */
  readonly beams: readonly PlacedLine[]
  /**
   * Slurs and ties, which like beams belong to no single element — each spans from one
   * notehead to another and is resolved once every member's position is known.
   */
  readonly curves: readonly PlacedCurve[]
  /** Tuplet brackets, and the numbers that go with them. Also span elements. */
  readonly tupletLines: readonly PlacedLine[]
  readonly tupletTexts: readonly PlacedText[]
  /**
   * Melisma extenders — one syllable held across several notes. Non-strict only; strict
   * prints a literal `_` on the syllable instead, as abcjs does.
   */
  readonly melismaLines: readonly PlacedLine[]
  /**
   * Hairpins and glissandi — decorations that SPAN, opened by one note and closed by a
   * later one, so they belong to no single element for the same reason beams do not.
   */
  readonly spannerLines: readonly PlacedLine[]
  /** Repeat-ending (volta) brackets and their labels. Span whole measures. */
  readonly voltaLines: readonly PlacedLine[]
  readonly voltaTexts: readonly PlacedText[]
  /** Vertical offset of this staff's middle line within its system. */
  readonly originY: number
}

export interface LayoutSystem {
  /** One per STAFF, top to bottom. `%%score`'s `( … )` puts several voices on one. */
  readonly staves: readonly LayoutStaff[]
  /**
   * Braces and brackets at the system's left edge, joining the staves of a group.
   *
   * On the SYSTEM rather than a staff, because that is what they span: a brace over a
   * grand staff belongs to neither of its two staves. abcjs draws both — a curvy path for
   * the brace, verified against its rendered SVG — and so does abcMusicKit v1, whose
   * `drawBraces` ports the same element.
   */
  readonly connectorGlyphs: readonly PlacedGlyph[]
  readonly connectorLines: readonly PlacedLine[]
  /** Width of this system, staff spaces. Systems wrap, so they differ. */
  readonly width: number
  /**
   * Vertical offset of this system within the whole drawing.
   *
   * Each system is laid out in its OWN coordinate space and stacked by translation. That
   * keeps every position within a system independent of how many systems precede it, so
   * a break inserted earlier cannot shift the geometry of a later one — which would
   * otherwise churn every baseline below the break.
   */
  readonly originY: number
}

export interface Layout {
  readonly systems: readonly LayoutSystem[]
  /** Bounding box in staff spaces; the SVG backend applies the scale. */
  readonly width: number
  readonly height: number
  /** y of the topmost content — the SVG backend translates by this. */
  readonly top: number
}

/** Staff step → y, in staff spaces. Higher pitch is lower y. */
export const stepToY = (step: number): number => -step * ENGRAVE.spacePerStep

// ─── Pitch → staff position ──────────────────────────────────────────────────

/**
 * Diatonic index: steps above C0, so it orders and subtracts cleanly across octaves.
 * Middle line of a treble staff is B4 → index 34.
 */
const diatonicIndex = (p: Pitch): number => stepIndex(p.step) + 7 * p.octave

/**
 * Which pitch sits on a clef's own line: a G clef marks G4, an F clef F3, a C clef C4.
 * That single fact, plus the line the clef sits on, positions every note on the staff.
 */
const CLEF_REFERENCE: Readonly<Record<ClefShape, number>> = {
  // Diatonic indices: G4 = 4 + 7*4, F3 = 3 + 7*3, C4 = 0 + 7*4.
  G: 32,
  F: 24,
  C: 28,
  // Unpitched. Treated as a C clef on the middle line so notes land somewhere sane
  // rather than at a wild offset; neither is a real pitch mapping.
  percussion: 28,
  none: 28,
}

/**
 * The diatonic index that lands on the middle staff line, for a given clef.
 *
 * The clef's reference pitch sits on its own line, and staff line `n` is `(n - 3) * 2`
 * steps from the middle line, so the middle line carries `reference - (line - 3) * 2`.
 *
 * Treble checks out as B4: G clef, line 2, so 32 - (2-3)*2 = 34, which is B4. Bass as
 * D3: F clef, line 4, 24 - (4-3)*2 = 22. And that second number is what makes
 * `score-reorder` agree with abcjs — `C,,` is index 14, so 14 - 22 = -8, exactly the
 * step abcjs records, where the old hardcoded treble constant gave -20.
 */
export const middleLineIndex = (clef: Clef): number =>
  CLEF_REFERENCE[clef.shape] - (clef.line - 3) * 2

const pitchToStep = (p: Pitch, clef: Clef): number => diatonicIndex(p) - middleLineIndex(clef)

// ─── Duration → notehead ─────────────────────────────────────────────────────

interface NoteGlyphSpec {
  readonly head: GlyphName
  readonly stemmed: boolean
  /** Number of flags: 1 for an eighth, 2 for a sixteenth, 0 for a quarter or longer. */
  readonly flags: number
  /** Augmentation dots — 1 for a dotted quarter, 2 for a double-dotted one. */
  readonly dots: number
}

/** True for 1, 2, 4, 8, … and nothing else. */
const isPowerOfTwo = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0

/**
 * Split a written duration into the note value that is printed and its dots.
 *
 * A dot adds half of what precedes it, so `d` dots on a base `b` sound
 * `b × (2^(d+1) − 1) / 2^d`. Reduced, that puts an ODD numerator of the form
 * 2^(d+1)−1 — 1, 3, 7, 15 — over a power of two. So the numerator alone names the dot
 * count and the denominator then yields the base:
 *
 *   3/8  → numerator 3 = 2^2−1 → 1 dot,  base 1/4  (dotted quarter)
 *   7/16 → numerator 7 = 2^3−1 → 2 dots, base 1/4  (double-dotted quarter)
 *   3/4  → numerator 3          → 1 dot,  base 1/2  (dotted half)
 *
 * Deriving it rather than tabling the handful of common cases costs no more code and
 * gets double dots and dotted breves for free.
 *
 * Returns null when the numerator is not 2^(d+1)−1 or the denominator is not a power of
 * two — a value no combination of dots can write. That is not the same as a tuplet:
 * `notatedDuration` excludes tuplet scaling by contract, so a triplet eighth arrives
 * here as a plain 1/8 and its ratio never reaches this function.
 */
function splitDots(notated: Rational): { base: Rational; dots: number } | null {
  const { numerator, denominator } = notated
  if (numerator <= 0 || denominator <= 0) return null

  // Split the numerator into its power-of-two part and its ODD part. Only the odd part
  // can carry dots, since 2^(d+1)−1 is always odd — which is what lets a breve (2/1) and
  // a dotted quarter (3/8) be told apart: odd parts 1 and 3.
  let odd = numerator
  while (odd % 2 === 0) odd /= 2
  if (!isPowerOfTwo(odd + 1)) return null

  const dots = Math.log2(odd + 1) - 1
  const base = rational(numerator * 2 ** dots, denominator * odd)

  // The base must be a plain note value — a power of two either side. Anything else is a
  // duration no combination of notehead and dots can write.
  if (!isPowerOfTwo(base.numerator) || !isPowerOfTwo(base.denominator)) return null
  return { base, dots }
}

/**
 * Written duration → notehead, stem, flag count and dots.
 *
 * Returns `null` for a duration no notehead can express. Callers must handle that rather
 * than fall back to a quarter: silently drawing a dotted half as a half is wrong OUTPUT,
 * which is worse than an absent feature, and the structural gate would never catch it
 * because the staff position is still right.
 */
export function noteGlyph(notated: Rational): NoteGlyphSpec | null {
  const split = splitDots(notated)
  if (split === null) return null
  const { base, dots } = split

  const whole = ratToNumber(base)
  if (!(whole > 0)) return null
  if (whole >= 1) return { head: 'noteheadWhole', stemmed: false, flags: 0, dots }

  // 1/2 → 1, 1/4 → 2, 1/8 → 3 …
  const log = Math.log2(1 / whole)
  if (!Number.isInteger(log)) return null

  if (log === 1) return { head: 'noteheadHalf', stemmed: true, flags: 0, dots }
  return { head: 'noteheadBlack', stemmed: true, flags: Math.max(0, log - 2), dots }
}

/**
 * Augmentation dots for one notehead, starting at `x`.
 *
 * A dot NEVER sits on a staff line — it goes in the space beside the notehead, so a note
 * on a line takes its dot in the space above. Even staff steps are lines (0 is the middle
 * line, ±2 and ±4 the others) and odd steps are spaces, so the rule is simply: bump an
 * even step up by one.
 */
function dotGlyphs(count: number, x: number, step: number, taken: Set<number>): PlacedGlyph[] {
  let dotStep = step % 2 === 0 ? step + 1 : step
  // ponytail: in a chord, two notes a second apart can want the same dot space — one is
  // on a line and bumps up onto its neighbour's. Moved up a space rather than solved
  // properly; engraving has finer rules for dot columns. No corpus fixture has one.
  while (taken.has(dotStep)) dotStep += 2
  taken.add(dotStep)

  const out: PlacedGlyph[] = []
  for (let i = 0; i < count; i++) {
    out.push({ ...glyphAt('augmentationDot', x + i * ENGRAVE.dotSpacing, dotStep), role: 'dot' })
  }
  return out
}

/**
 * A note's natural horizontal width for its duration — the spring, before justification.
 *
 * `spacingScale · √(duration / reference)`, floored by the rod. Uses SOUNDING duration,
 * not written: three triplet eighths occupy the time of two and get the space of two,
 * which is what makes a tuplet look like one.
 *
 * The base cap in abcm2ps's full model (`reference = max(absolute, shortest/4)`) only
 * bites on a line whose shortest note is longer than a quarter. ponytail: not
 * implemented — every corpus fixture has something a quarter or shorter, so the cap
 * would never fire. Add it with the line's shortest note when a long-only tune appears.
 */
export function naturalWidth(
  duration: Rational,
  spacingScale: number = ENGRAVE.spacingScale,
): number {
  const d = ratToNumber(duration)
  if (!(d > 0)) return ENGRAVE.minColumnGap
  return Math.max(ENGRAVE.minColumnGap, spacingScale * Math.sqrt(d / ENGRAVE.spacingReference))
}

// ─── Element builders ────────────────────────────────────────────────────────

const glyphAt = (name: GlyphName, x: number, step: number): PlacedGlyph => ({
  name,
  x,
  y: stepToY(step),
})

const CLEF_GLYPHS: Readonly<Record<ClefShape, GlyphName | null>> = {
  G: 'gClef',
  F: 'fClef',
  C: 'cClef',
  // ponytail: no percussion glyph extracted, and `clef=none` draws nothing by definition.
  percussion: null,
  none: null,
}

function layoutClef(x: number, clef: Clef): LayoutElement | null {
  const name = CLEF_GLYPHS[clef.shape] ?? null
  if (name === null) return null
  // Every SMuFL clef's origin sits on the line it marks, so the glyph goes exactly where
  // the clef's line is — no per-clef offsets. Line n is (n - 3) * 2 steps from the middle.
  const step = (clef.line - 3) * 2
  return {
    type: 'clef',
    x,
    width: GLYPHS[name].advance,
    staffSteps: [],
    glyphs: [glyphAt(name, x, step)],
    lines: [],
    texts: [],
  }
}

const DIGIT_GLYPHS = [
  'timeSig0',
  'timeSig1',
  'timeSig2',
  'timeSig3',
  'timeSig4',
  'timeSig5',
  'timeSig6',
  'timeSig7',
  'timeSig8',
  'timeSig9',
] as const satisfies readonly GlyphName[]

/** Glyph names for a meter number's digits. A negative or fractional meter cannot occur. */
const digitNames = (value: number): GlyphName[] =>
  String(value)
    .split('')
    .map((d) => DIGIT_GLYPHS[Number(d)] ?? 'timeSig0')

const totalAdvance = (names: readonly GlyphName[]): number =>
  names.reduce((sum, name) => sum + GLYPHS[name].advance, 0)

/** Digits laid out left to right, the group centred on `centre`. */
function digitGlyphs(names: readonly GlyphName[], centre: number, step: number): PlacedGlyph[] {
  let cursor = centre - totalAdvance(names) / 2
  return names.map((name) => {
    const placed = glyphAt(name, cursor, step)
    cursor += GLYPHS[name].advance
    return placed
  })
}

function layoutMeter(x: number, numerator: number, denominator: number): LayoutElement {
  const top = digitNames(numerator)
  const bottom = digitNames(denominator)
  const width = Math.max(totalAdvance(top), totalAdvance(bottom))
  const centre = x + width / 2
  // Numerator and denominator centre on steps +2 and -2 — symmetric about the middle
  // line, each filling half the staff. Standard engraving.
  return {
    type: 'timeSignature',
    x,
    width,
    staffSteps: [],
    glyphs: [...digitGlyphs(top, centre, 2), ...digitGlyphs(bottom, centre, -2)],
    lines: [],
    texts: [],
  }
}

// ─── Key signature ───────────────────────────────────────────────────────────

/**
 * Staff steps for accidentals in a key signature, in the order they are written.
 *
 * Sharps run F C G D A E B and flats the reverse, each at a fixed staff position — the
 * placement is conventional, not derived, and is the same in every book. Treble clef;
 * other clefs shift these, which is part of the clef work and not yet done.
 */
const SHARP_STEPS = [4, 1, 5, 2, -1, 3, 0] as const
const FLAT_STEPS = [0, 3, -1, 2, -2, 1, -3] as const

/** Position on the circle of fifths for a natural step: F=-1, C=0, G=1, D=2 … */
const NATURAL_FIFTHS: Readonly<Record<DiatonicStep, number>> = {
  f: -1,
  c: 0,
  g: 1,
  d: 2,
  a: 3,
  e: 4,
  b: 5,
}

/** How far each mode sits from major on the circle. D dorian has no accidentals, so -2. */
const MODE_FIFTHS: Readonly<Record<Mode, number>> = {
  lydian: 1,
  major: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  phrygian: -4,
  locrian: -5,
}

/**
 * Signed accidental count for a key: positive is that many sharps, negative that many
 * flats. Derived from the circle of fifths rather than a lookup table of key names,
 * which is abcMusicKit2's approach and the reason `KeySignature` stores a tonic and a
 * mode instead of an accidental list.
 */
export function keyFifths(key: KeySignature): number {
  if (key.none) return 0
  // Each sharp on the tonic moves it seven places round the circle: C→C# is 0→7.
  const fifths = NATURAL_FIFTHS[key.tonic.step] + 7 * key.tonic.accidental + MODE_FIFTHS[key.mode]
  // Beyond ±7 the signature would need double accidentals. Real ABC does reach K:A#
  // (10 sharps); clamping draws seven rather than indexing off the end of the table.
  return Math.max(-7, Math.min(7, fifths))
}

/**
 * How far a key signature's accidentals shift for a clef, in staff steps.
 *
 * The written positions are conventional in treble; in another clef the same pitch
 * classes land elsewhere, and the signature follows the pitch, not the position. Two
 * clefs' middle lines differ by a whole number of diatonic steps, so the shift is that
 * difference reduced mod 7 and folded into [-3, 3] — which picks the octave that keeps
 * the accidentals on or near the staff.
 *
 * Bass works out to -2, giving F# on the fourth line and C# in the second space, the
 * standard pattern. Alto gives -1.
 *
 * ponytail: TENOR is genuinely irregular. Engravers drop some of its accidentals an
 * octave to avoid ledger lines, and no single shift reproduces that. This formula puts
 * them an octave high. No corpus fixture uses a tenor key signature; fix it when one does.
 */
function keySignatureShift(clef: Clef): number {
  const delta = middleLineIndex(defaultClef) - middleLineIndex(clef)
  const wrapped = ((delta % 7) + 7) % 7
  return wrapped > 3 ? wrapped - 7 : wrapped
}

function layoutKeySignature(x: number, key: KeySignature, clef: Clef): LayoutElement | null {
  const fifths = keyFifths(key)
  if (fifths === 0) return null // C major and K:none both draw nothing.

  const shift = keySignatureShift(clef)
  const sharps = fifths > 0
  const steps = (sharps ? SHARP_STEPS : FLAT_STEPS)
    .slice(0, Math.abs(fifths))
    .map((step) => step + shift)
  const name: GlyphName = sharps ? 'accidentalSharp' : 'accidentalFlat'
  const pitch = GLYPHS[name].advance + ENGRAVE.keySignatureGap

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: steps.length * pitch - ENGRAVE.keySignatureGap,
    staffSteps: [],
    glyphs: steps.map((step, i) => glyphAt(name, x + i * pitch, step)),
    lines: [],
    texts: [],
  }
}

/**
 * A mid-tune key change: naturals for what the old key had and the new one drops, then
 * the new key's own accidentals.
 *
 * The naturals are the whole reason this is not just `layoutKeySignature` at a different
 * x. Going from D (F#, C#) to G (F#) has to CANCEL the C# — print a natural on C — or a
 * reader carries the sharp forward and plays the wrong note. Going to C major cancels
 * everything and is nothing but naturals, which is why `layoutKeySignature` returning
 * null for C is right there and wrong here.
 *
 * Sharps to flats (or back) cancels ALL of them, not the numeric difference: the two
 * signatures share no step, so every outgoing accidental is dropped.
 */
function layoutKeyChange(
  x: number,
  from: KeySignature,
  to: KeySignature,
  clef: Clef,
): LayoutElement | null {
  // A `K:` that restates the key in force prints NOTHING. This is not an optimisation —
  // it is the difference between correct and a duplicated key signature in the middle of
  // a bar. Three fixtures reach it and none of them is about key changes: a per-voice
  // `K:G clef=treble` on each of two voices makes the second one a "change" from G to G
  // (`multi-voice-rest-collision`), and `clefs` restates the key per voice the same way.
  //
  // Compared on FIFTHS, not on the key object: `K:G` and `K:Em` are the same signature in
  // different modes, and a reader sees no accidental change between them, so neither
  // should the page.
  if (keyFifths(from) === keyFifths(to)) return null

  const shift = keySignatureShift(clef)
  const stepsFor = (key: KeySignature): { step: number; sharp: boolean }[] => {
    const fifths = keyFifths(key)
    const sharp = fifths > 0
    return (sharp ? SHARP_STEPS : FLAT_STEPS)
      .slice(0, Math.abs(fifths))
      .map((step) => ({ step: step + shift, sharp }))
  }
  const outgoing = stepsFor(from)
  const incoming = stepsFor(to)
  // Compared on step AND sign: a step that was sharp and is now flat is not "kept", it
  // is cancelled and re-marked.
  const kept = new Set(incoming.map((entry) => `${entry.step}:${entry.sharp}`))
  const cancelled = outgoing.filter((entry) => !kept.has(`${entry.step}:${entry.sharp}`))
  if (cancelled.length === 0 && incoming.length === 0) return null

  const glyphs: PlacedGlyph[] = []
  let cursor = x
  const advance = (name: GlyphName, step: number): void => {
    glyphs.push(glyphAt(name, cursor, step))
    cursor += GLYPHS[name].advance + ENGRAVE.keySignatureGap
  }
  for (const entry of cancelled) advance('accidentalNatural', entry.step)
  for (const entry of incoming)
    advance(entry.sharp ? 'accidentalSharp' : 'accidentalFlat', entry.step)

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: cursor - x - ENGRAVE.keySignatureGap,
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
  }
}

// ─── Tempo ───────────────────────────────────────────────────────────────────

/**
 * A tempo direction above the staff: `"Allegro"`, or a beat-unit note, `=`, and a rate.
 *
 * Zero width, matching abcjs, whose tempo element reports `w: 0` — the mark sits above
 * the music and takes no room in the horizontal spine, so it cannot push notes around.
 * Its text therefore overhangs to the right, which is also why this needs no text
 * metrics: nothing downstream depends on how wide the words turn out to be.
 */
function layoutTempo(x: number, tempo: Tempo): LayoutElement | null {
  const glyphs: PlacedGlyph[] = []
  const texts: PlacedText[] = []
  const lines: PlacedLine[] = []

  // Above the staff, clear of anything reaching over the top line.
  const step = ENGRAVE.tempoStep
  const baseline = stepToY(step)
  let cursor = x

  if (tempo.text !== null && tempo.text !== '') {
    texts.push({
      text: tempo.text,
      x: cursor,
      y: baseline,
      size: ENGRAVE.tempoTextSize,
      bold: true,
      italic: false,
    })
    // Real per-character metrics, like everything else that measures text. This kept the
    // flat half-em-per-character estimate after `textWidth` replaced it everywhere else —
    // a stale ponytail that was still running, not just still written.
    cursor += textWidth(tempo.text, ENGRAVE.tempoTextSize) + 1
  }

  if (tempo.bpm !== null) {
    // The beat unit is drawn as a real note — a quarter note for `1/4=120`.
    const spec = tempo.beatUnit === null ? null : noteGlyph(tempo.beatUnit)
    if (spec !== null) {
      const head = GLYPHS[spec.head]
      glyphs.push({ name: spec.head, x: cursor, y: baseline })
      if (spec.stemmed) {
        const [ax, ay] = head.anchors.stemUpSE ?? [head.width, 0]
        lines.push({
          x1: cursor + ax,
          y1: baseline + ay,
          x2: cursor + ax,
          y2: baseline + ay - ENGRAVE.stemLength,
          thickness: ENGRAVING_DEFAULTS.stemThickness,
        })
      }
      cursor += head.advance + 0.3
    }
    texts.push({
      text: `= ${tempo.bpm}`,
      x: cursor,
      y: baseline,
      size: ENGRAVE.tempoTextSize,
      bold: false,
      italic: false,
    })
  }

  if (glyphs.length === 0 && texts.length === 0) return null
  return { type: 'tempo', x, width: 0, staffSteps: [], glyphs, lines, texts }
}

/**
 * A `P:` part label above the staff. Zero width, like the tempo mark and for the same
 * reason: abcjs reports `w: 0`, and a label must not push the music it labels.
 */
const layoutPart = (x: number, label: string): LayoutElement => ({
  type: 'part',
  x,
  width: 0,
  staffSteps: [],
  glyphs: [],
  lines: [],
  texts: [
    {
      text: label,
      x,
      y: stepToY(ENGRAVE.partStep),
      size: ENGRAVE.tempoTextSize,
      bold: true,
      italic: false,
    },
  ],
})

// ─── Rests ───────────────────────────────────────────────────────────────────

/**
 * Written duration → rest glyph and the staff step its origin sits on.
 *
 * The step is not a free choice: SMuFL designs each rest around its origin, so a whole
 * rest's ink hangs BELOW the origin (bbox -0.54 to 0.036) and a half rest's sits ABOVE
 * it (-0.008 to 0.568). Putting the whole rest on step 2 and the half on step 0 is what
 * makes the first hang from the fourth line and the second sit on the middle line, which
 * is the engraving convention. The shorter rests are drawn about their own centre.
 *
 * NOTE this is a different convention from abcjs, which anchors every rest at its pitch
 * 7 regardless of duration, because its glyphs have different origins. Rest POSITION is
 * therefore not comparable between the two engines; the structural gate compares only
 * that a rest is present. See the gate's blind-spot list.
 */
function restGlyph(notated: Rational): { name: GlyphName; step: number; dots: number } | null {
  const split = splitDots(notated)
  if (split === null) return null
  const { base, dots } = split

  const whole = ratToNumber(base)
  if (!(whole > 0)) return null
  if (whole >= 1) return { name: 'restWhole', step: 2, dots }

  const log = Math.log2(1 / whole)
  if (!Number.isInteger(log)) return null

  const byLog: Readonly<Record<number, GlyphName>> = {
    1: 'restHalf',
    2: 'restQuarter',
    3: 'rest8th',
    4: 'rest16th',
  }
  const name = byLog[log]
  if (!name) return null
  return { name, step: 0, dots }
}

function layoutRest(rest: Rest, advance: number, x: number): LayoutElement {
  // `x` and `y` occupy horizontal space but print nothing; a spacer prints nothing and
  // is not even a rest musically. Both still advance, so following notes stay put.
  const invisible = rest.kind === 'invisible' || rest.kind === 'invisibleMultiMeasure'
  const spec = invisible || rest.kind === 'spacer' ? null : restGlyph(rest.notatedDuration)

  const glyphs: PlacedGlyph[] = []
  if (spec) {
    glyphs.push(glyphAt(spec.name, x, spec.step))
    if (spec.dots > 0) {
      const dotX = x + GLYPHS[spec.name].width + ENGRAVE.dotGap
      glyphs.push(...dotGlyphs(spec.dots, dotX, spec.step, new Set()))
    }
  }

  return {
    type: 'rest',
    x,
    width: advance,
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
  }
}

// ─── Accidentals ─────────────────────────────────────────────────────────────

/**
 * The accidental glyph to print before a note, or `null` for none.
 *
 * THE RULE IS `!== null`, NEVER TRUTHINESS. `Pitch.accidental` is null when the source
 * wrote no accidental and the note inherits from the key, and a NUMBER when the source
 * wrote one — where `Accidental.natural` is 0, which is falsy. So the idiomatic
 * `if (pitch.accidental)` collapses "inherit from the key" and "explicitly natural",
 * which are musically opposite: in D major, `=F` is F natural and a bare `F` is F sharp.
 * Writing it that way silently drops every natural sign in the corpus and is wrong in
 * every key but C major. This is risk 5 in CHECKPOINT-2026-07-18.
 *
 * ABC prints an accidental exactly where the source wrote one — that is the notation's
 * convention and why this needs no key or measure state. A note inheriting a sharp from
 * the key signature prints nothing, which is what `null` already says.
 */
/**
 * Notehead shape for `!style=x!` and `[K: style=x]`, keyed the way abcjs draws them:
 * harmonic is a diamond, `x` its `noteheads.indeterminate`, rhythm a slash.
 *
 * `filled` and `open` follow the DURATION, because a styled note is still a quarter or a
 * half — the style picks the shape, the duration picks whether it is filled.
 *
 * ponytail: abcjs has one glyph for `x` and one for rhythm whatever the duration
 * (`noteheads.indeterminate`, `noteheads.slash.quarter`), so both map to themselves here.
 * A half-note rhythm slash is its own SMuFL glyph if a fixture ever needs one.
 */
const STYLED_HEADS: Readonly<
  Record<Exclude<NoteStyle, 'normal'>, { readonly filled: GlyphName; readonly open: GlyphName }>
> = {
  harmonic: { filled: 'noteheadDiamondBlack', open: 'noteheadDiamondWhite' },
  x: { filled: 'noteheadXBlack', open: 'noteheadXBlack' },
  triangle: { filled: 'noteheadTriangleUpBlack', open: 'noteheadTriangleUpWhite' },
  rhythm: { filled: 'noteheadSlashVerticalEnds', open: 'noteheadSlashVerticalEnds' },
}

/** The head a note actually draws, once its style has had a say. */
function styledHead(base: GlyphName, event: MusicEvent | null): GlyphName {
  if (event === null || event.type === 'rest' || event.style === 'normal') return base
  const pair = STYLED_HEADS[event.style]
  return base === 'noteheadBlack' ? pair.filled : pair.open
}

const ACCIDENTAL_GLYPHS: Readonly<Record<Accidental, GlyphName>> = {
  [Accidental.doubleFlat]: 'accidentalDoubleFlat',
  [Accidental.flat]: 'accidentalFlat',
  [Accidental.natural]: 'accidentalNatural',
  [Accidental.sharp]: 'accidentalSharp',
  [Accidental.doubleSharp]: 'accidentalDoubleSharp',
}

export const accidentalGlyph = (accidental: Accidental | null): GlyphName | null =>
  accidental === null ? null : ACCIDENTAL_GLYPHS[accidental]

/**
 * Microtonal accidentals, by quarter-tone step: 1 is a half-sharp, 3 a three-quarter
 * sharp. `Pitch.accidental` records only the printed SIGN, so the alteration itself has
 * to come from `microtoneCents`.
 */
const MICROTONE_GLYPHS: Readonly<Record<number, GlyphName>> = {
  [-3]: 'accidentalThreeQuarterTonesFlatZimmermann',
  [-2]: 'accidentalFlat',
  [-1]: 'accidentalQuarterToneFlatStein',
  [1]: 'accidentalQuarterToneSharpStein',
  [2]: 'accidentalSharp',
  [3]: 'accidentalThreeQuarterTonesSharpStein',
}

/**
 * The accidental a note actually draws, once microtones have had a say.
 *
 * MODE SPLIT, measured against abcjs 6.6.3 rather than assumed:
 *
 *   `^/G`   half-sharp     abcjs draws `accidentals.halfsharp`; so do we, both modes.
 *   `^3/2G` ¾-sharp        abcjs draws NOTHING — no accidental in its element dump at
 *                          all. Strict reproduces that; abc2.1/extended draw the
 *                          three-quarter glyph, which is what the ABC actually says.
 *
 * Before this, every microtone drew a FULL sharp or flat — so `^/G` printed as a plain
 * sharp and `^3/2G` printed ink abcjs does not print. Wrong output, not missing output,
 * which is why the gap list's "parsed, not rendered" undersold it.
 *
 * ponytail: quantised to the nearest quarter tone, so `^1/3G` rounds to a half-sharp
 * rather than drawing nothing. Bravura has no third-tone glyph and no fixture writes one.
 */
function microtoneAccidental(
  accidental: Accidental | null,
  cents: number,
  strict: boolean,
): GlyphName | null {
  if (cents === 0) return accidentalGlyph(accidental)
  const steps = Math.round(cents / 50)
  // abcjs knows the quarter-tone pair and nothing else; anything wider prints no
  // accidental at all rather than an approximation.
  if (strict && Math.abs(steps) !== 1) return null
  return MICROTONE_GLYPHS[steps] ?? null
}

/**
 * Flag glyphs by level, `[up, down]`. Index is `spec.flags`, so index 1 is an eighth.
 *
 * Index 0 is unused — a note with no flags draws none — and is filled with the eighth
 * pair so the array indexes directly rather than needing an offset. Levels beyond the
 * last entry clamp to it: a 128th prints as a 64th, which is the same ponytail the 16th
 * used to be, but four levels deeper and out of reach of any real music.
 */
const FLAG_GLYPHS: readonly (readonly [GlyphName, GlyphName])[] = [
  ['flag8thUp', 'flag8thDown'],
  ['flag8thUp', 'flag8thDown'],
  ['flag16thUp', 'flag16thDown'],
  ['flag32ndUp', 'flag32ndDown'],
  ['flag64thUp', 'flag64thDown'],
]

/** Ledger lines for a note that sits beyond the staff. */
function ledgerLines(step: number, x: number, headWidth: number): PlacedLine[] {
  const lines: PlacedLine[] = []
  const x1 = x - ENGRAVE.ledgerExtension
  const x2 = x + headWidth + ENGRAVE.ledgerExtension
  const push = (s: number) => {
    lines.push({
      x1,
      y1: stepToY(s),
      x2,
      y2: stepToY(s),
      thickness: ENGRAVING_DEFAULTS.legerLineThickness,
      role: 'ledger',
    })
  }
  for (let s = ENGRAVE.firstLedgerStep; s <= step; s += 2) push(s)
  for (let s = -ENGRAVE.firstLedgerStep; s >= step; s -= 2) push(s)
  return lines
}

/**
 * One or more noteheads sharing a stem — the general case, of which a single note is
 * simply N = 1.
 *
 * Written as one function rather than two because a chord needs everything a note needs
 * (stem, ledger lines, accidental) and duplicating that was how the stem came to anchor
 * to the wrong x when accidentals landed. The differences from a note are real but
 * small: the stem spans the outermost heads, and heads a second apart must sit on
 * opposite sides of the stem.
 */
function layoutNoteheads(
  pitches: readonly Pitch[],
  notated: Rational,
  /** Natural width for this event's SOUNDING duration — see `naturalWidth`. */
  advance: number,
  x: number,
  clef: Clef,
  /** Forced by the beam group when this note is beamed — every stem in a beam agrees. */
  forcedUp: boolean | null = null,
  /** Set when this note is beamed: suppresses its flag and reports its stem. */
  stemOut: { value: Omit<StemInfo, 'element'> | null } | null = null,
  /** The source event, for the text attached to it. Null when there is none to attach. */
  event: MusicEvent | null = null,
  /** `abcjs-strict` — decides which microtonal accidentals print. See `microtoneAccidental`. */
  strict = true,
): LayoutElement {
  // Sorted ascending to match abcjs, which reports a chord's heads lowest-first — so the
  // gate compares like with like regardless of the order the pitches were written in.
  // `[GCE]` and `[CEG]` are the same chord and must produce the same steps.
  const steps = pitches.map((p) => pitchToStep(p, clef)).sort((a, b) => a - b)
  const lowest = steps[0] ?? 0
  const highest = steps[steps.length - 1] ?? 0
  const spec = noteGlyph(notated)

  if (spec === null || steps.length === 0) {
    // Unsupported duration — see noteGlyph. Emit the position with no ink rather than
    // the wrong notehead, so the gap is visible in output and in the gate.
    return { type: 'note', x, width: advance, staffSteps: steps, glyphs: [], lines: [], texts: [] }
  }

  // The style picks the SHAPE; `spec` still decides filled-vs-open, dots, stem and flags,
  // so a harmonic eighth is a filled diamond with a flag.
  const headName = styledHead(spec.head, event)
  const head = GLYPHS[headName]
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []

  // Grace notes lead INTO the note, so they are laid out first and push everything else
  // right. Each is a small notehead with a small stem; an acciaccatura (`{/g}`) takes a
  // slash through the stems. *Behind Bars* draws them at about 60% and always stem-up.
  let graceWidth = 0
  if (event !== null && event.type !== 'rest' && event.graceNotes.length > 0) {
    const scale = ENGRAVE.graceScale
    const small = GLYPHS.noteheadBlack
    const graceSteps = event.graceNotes.map((p) => pitchToStep(p, clef))

    graceSteps.forEach((graceStep, i) => {
      const gx = x + i * ENGRAVE.graceAdvance
      glyphs.push({ name: 'noteheadBlack', x: gx, y: stepToY(graceStep), scale, role: 'grace' })
      // The stem attaches at the scaled anchor and runs a scaled length upward.
      const [ax, ay] = small.anchors.stemUpSE ?? [small.width, 0]
      const stemX = gx + ax * scale
      const base = stepToY(graceStep) + ay * scale
      lines.push({
        x1: stemX,
        y1: base,
        x2: stemX,
        y2: base - ENGRAVE.stemLength * scale,
        thickness: ENGRAVING_DEFAULTS.stemThickness * scale,
        role: 'stem',
      })
    })

    graceWidth = graceSteps.length * ENGRAVE.graceAdvance + ENGRAVE.graceGap

    if (event.graceSlash) {
      // One slash across the first grace note's stem, which is what marks the whole
      // group as an acciaccatura however many notes it has.
      const firstStep = graceSteps[0] ?? 0
      const tipY = stepToY(firstStep) - ENGRAVE.stemLength * scale
      lines.push({
        x1: x - 0.2,
        y1: tipY + 1.0,
        x2: x + ENGRAVE.graceAdvance * 0.9,
        y2: tipY - 0.2,
        thickness: ENGRAVING_DEFAULTS.stemThickness * 1.4,
      })
    }
  }

  // Stem direction follows the chord as a whole: away from the middle line, judged by
  // the midpoint of its outermost notes. On the middle line itself the stem goes down.
  // A beamed note takes its group's direction instead — a beam cannot join opposed stems.
  const up = forcedUp ?? (lowest + highest) / 2 < 0

  // Accidentals sit in a column before the heads and push everything right. ponytail:
  // ONE column. Real engraving fans accidentals into several columns when they would
  // collide; with the heads at distinct steps they only collide for a cluster, and no
  // corpus fixture has one.
  const noteX = x + graceWidth
  // ponytail: `microtoneCents` is per-EVENT, not per-pitch, so a chord's microtone
  // applies to every altered head in it. `[^/G^/B]` is right; a chord mixing a microtone
  // with a plain accidental is not expressible. No fixture writes one, and fixing it
  // means moving the field onto Pitch.
  const cents = event === null || event.type === 'rest' ? 0 : event.microtoneCents
  const accidentals = pitches
    .map((p) => ({
      glyph: microtoneAccidental(p.accidental, cents, strict),
      step: pitchToStep(p, clef),
    }))
    .filter((a): a is { glyph: GlyphName; step: number } => a.glyph !== null)

  const accidentalWidth =
    accidentals.length === 0
      ? 0
      : Math.max(...accidentals.map((a) => GLYPHS[a.glyph].advance)) + ENGRAVE.accidentalGap

  for (const a of accidentals)
    glyphs.push({ ...glyphAt(a.glyph, noteX, a.step), role: 'accidental' })
  const headX = noteX + accidentalWidth

  // A second cannot be printed on the same side of the stem — the noteheads would
  // overlap — so the offending head moves across it. *Behind Bars*. Working from the
  // stem side outward keeps a cluster alternating rather than every head shifting.
  const ordered = up ? steps : [...steps].reverse()
  const offsets = new Map<number, number>()
  let previous: number | null = null
  let shifted = false
  for (const step of ordered) {
    shifted = previous !== null && Math.abs(step - previous) === 1 ? !shifted : false
    // With an up stem the displaced head goes right of it; with a down stem, left.
    offsets.set(step, shifted ? (up ? head.width : -head.width) : 0)
    previous = step
  }

  for (const [position, step] of steps.entries()) {
    const dx = offsets.get(step) ?? 0
    glyphs.push({
      ...glyphAt(headName, headX + dx, step),
      role: 'notehead',
      // `steps` is sorted ascending, so the index IS the chord position from the bottom.
      ...(steps.length > 1 ? { chordPos: position + 1 } : {}),
    })
    lines.push(...ledgerLines(step, headX + dx, head.width))
  }

  // Dots align in one column right of the WIDEST extent, so a chord's dots line up
  // rather than stepping in and out with each displaced notehead.
  let dotWidth = 0
  if (spec.dots > 0) {
    const rightmost = headX + Math.max(0, ...[...offsets.values()]) + head.width
    const dotX = rightmost + ENGRAVE.dotGap
    const taken = new Set<number>()
    for (const step of steps) glyphs.push(...dotGlyphs(spec.dots, dotX, step, taken))
    dotWidth = dotX - headX + spec.dots * ENGRAVE.dotSpacing
  }

  if (spec.stemmed) {
    const anchor = up ? head.anchors.stemUpSE : head.anchors.stemDownNW
    const [ax, ay] = anchor ?? [up ? head.width : 0, 0]
    // headX, not x: an accidental shifts the noteheads, and the stem follows them.
    const stemX = headX + ax
    // The stem starts at the head nearest its own end and runs past the far one, so a
    // chord's stem spans the whole spread rather than one notehead's worth.
    const base = stepToY(up ? lowest : highest) + ay
    const far = stepToY(up ? highest : lowest)
    const tip = far + (up ? -ENGRAVE.stemLength : ENGRAVE.stemLength)
    lines.push({
      x1: stemX,
      y1: base,
      x2: stemX,
      y2: tip,
      thickness: ENGRAVING_DEFAULTS.stemThickness,
      role: 'stem',
    })

    if (stemOut !== null) {
      // Beamed: the beam pass retargets this stem and draws the beams. No flag — a note
      // cannot carry both.
      stemOut.value = { x: stemX, farStep: up ? highest : lowest, up, beams: spec.flags }
    } else if (spec.flags > 0) {
      // Unbeamed: ONE glyph carrying every flag level, hung from the stem tip. SMuFL
      // draws a 32nd as a single three-tailed glyph rather than three stacked 8th flags,
      // and its up and down designs are separate rather than a reflection.
      //
      // This used to fall back to the 16th flag for anything shorter, on the stated
      // grounds that "two flags is already rare in the corpus". The corpus has 72 notes
      // shorter than a 16th; 63 are beamed (and the beam pass already draws three levels
      // correctly), but 9 are not, and every one of them printed as a 16th. A 32nd drawn
      // as a 16th is the wrong rhythm on the page, not a missing detail.
      const flag = FLAG_GLYPHS[Math.min(spec.flags, FLAG_GLYPHS.length - 1)]?.[up ? 0 : 1]
      if (flag !== undefined) glyphs.push({ name: flag, x: stemX, y: tip, role: 'flag' })
    }
  }

  const texts = event === null ? [] : noteText(event, headX, head.width, strict)
  if (event !== null && event.type !== 'rest') {
    texts.push(...decorationTexts(event.decorations, headX, head.width))
  }
  if (event !== null && event.decorations.length > 0) {
    glyphs.push(
      ...decorationGlyphs(event.decorations, headX, head.width, highest, lowest, up, strict),
    )
  }

  // The spring is the natural width, but ink is a rod: an accidental, a displaced head
  // or a dot column must never be crushed by a short duration, so the element is at
  // least as wide as what it draws plus the minimum gap.
  const spread = Math.max(0, ...[...offsets.values()].map(Math.abs), dotWidth)
  const ink = graceWidth + accidentalWidth + spread + head.width + ENGRAVE.minColumnGap
  return {
    type: 'note',
    x,
    width: Math.max(advance, ink),
    staffSteps: steps,
    glyphs,
    lines,
    texts,
  }
}

/**
 * A barline, in all six shapes ABC can write.
 *
 * Built left to right from three pieces — thin rule, thick rule, repeat dots — because
 * that is what the shapes are: a final is thin-then-thick, a repeat end is dots-then-
 * thin-then-thick, and a two-way repeat is that mirrored around a single thick rule.
 * Drawing them from parts rather than as six special cases means the spacing constants
 * (all from the font) apply uniformly.
 */
function layoutBar(x: number, kind: Barline): LayoutElement {
  const thin = ENGRAVING_DEFAULTS.thinBarlineThickness
  const thick = ENGRAVING_DEFAULTS.thickBarlineThickness
  const gap = ENGRAVING_DEFAULTS.barlineSeparation
  const dotGap = ENGRAVING_DEFAULTS.repeatBarlineDotSeparation

  const lines: PlacedLine[] = []
  const glyphs: PlacedGlyph[] = []
  let cursor = x

  const rule = (thickness: number): void => {
    // A rule is placed by its LEFT edge and the line is its centre, so the cursor
    // advances by the full thickness and nothing overlaps.
    lines.push({
      x1: cursor + thickness / 2,
      y1: stepToY(4),
      x2: cursor + thickness / 2,
      y2: stepToY(-4),
      thickness,
    })
    cursor += thickness
  }

  const dots = (): void => {
    // The two dots straddle the middle staff line, one in the space either side.
    //
    // SMuFL anchors `repeatDots` at the BOTTOM staff line, not the middle — its ink sits
    // ~1.98 spaces ABOVE its origin — so placing it at step 0 puts the dots up near the
    // top line. Centring from the bounding box rather than hardcoding the offset means a
    // different SMuFL font with a different anchor still lands correctly.
    const glyph = GLYPHS.repeatDots
    glyphs.push({ name: 'repeatDots', x: cursor, y: -(glyph.y + glyph.height / 2) })
    cursor += glyph.width + dotGap
  }

  switch (kind) {
    case 'thin':
      rule(thin)
      break
    case 'double':
      rule(thin)
      cursor += gap
      rule(thin)
      break
    case 'final':
      rule(thin)
      cursor += gap
      rule(thick)
      break
    case 'repeatStart':
      rule(thick)
      cursor += gap
      rule(thin)
      cursor += dotGap
      dots()
      break
    case 'repeatEnd':
      dots()
      rule(thin)
      cursor += gap
      rule(thick)
      break
    case 'repeatBoth':
      // One thick rule serving both directions, dots on each side — the standard
      // back-to-back form, rather than two complete repeat signs jammed together.
      dots()
      rule(thin)
      cursor += gap
      rule(thick)
      cursor += gap
      rule(thin)
      cursor += dotGap
      dots()
      break
  }

  return {
    type: 'bar',
    x,
    width: cursor - x,
    staffSteps: [],
    glyphs,
    lines,
    texts: [],
  }
}

/**
 * ABC decoration name → SMuFL glyph, and where it belongs.
 *
 * `articulation` hugs the notehead on the side opposite the stem; `ornament` sits above
 * the staff clear of everything; `dynamic` sits below it. That is the convention and it
 * is also what keeps three kinds of mark from fighting for one lane.
 *
 * Deliberately PARTIAL. The corpus uses a long tail — rolls, slides, glissandi,
 * crescendo hairpins, fingerings — and several have no unambiguous SMuFL equivalent or
 * are line-based rather than a glyph. Those are left undrawn and counted, rather than
 * approximated with a glyph that means something else: an Irish roll is not a turn, and
 * drawing one for the other is wrong output, which is worse than absent output.
 */
const DECORATIONS: Readonly<
  Record<
    string,
    { above: GlyphName; below: GlyphName; place: 'articulation' | 'ornament' | 'dynamic' | 'stem' }
  >
> = {
  staccato: { above: 'articStaccatoAbove', below: 'articStaccatoBelow', place: 'articulation' },
  accent: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  tenuto: { above: 'articTenutoAbove', below: 'articTenutoBelow', place: 'articulation' },
  marcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
  fermata: { above: 'fermataAbove', below: 'fermataBelow', place: 'ornament' },
  trill: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },
  // ABC's `M` is the mordent with the vertical stroke; `P` is the one without, which
  // SMuFL calls a short trill.
  lowermordent: { above: 'ornamentMordent', below: 'ornamentMordent', place: 'ornament' },
  uppermordent: { above: 'ornamentShortTrill', below: 'ornamentShortTrill', place: 'ornament' },
  turn: { above: 'ornamentTurn', below: 'ornamentTurn', place: 'ornament' },
  upbow: { above: 'stringsUpBow', below: 'stringsUpBow', place: 'ornament' },
  downbow: { above: 'stringsDownBow', below: 'stringsDownBow', place: 'ornament' },
  segno: { above: 'segno', below: 'segno', place: 'ornament' },
  coda: { above: 'coda', below: 'coda', place: 'ornament' },
  p: { above: 'dynamicPiano', below: 'dynamicPiano', place: 'dynamic' },
  f: { above: 'dynamicForte', below: 'dynamicForte', place: 'dynamic' },

  // ── The rest of abcjs's volumeDecoration set ────────────────────────────────
  // SMuFL precomposes the multi-letter dynamics, so `mp` is one glyph rather than an
  // `m` and a `p` set side by side.
  pp: { above: 'dynamicPP', below: 'dynamicPP', place: 'dynamic' },
  ppp: { above: 'dynamicPPP', below: 'dynamicPPP', place: 'dynamic' },
  pppp: { above: 'dynamicPPPP', below: 'dynamicPPPP', place: 'dynamic' },
  mp: { above: 'dynamicMP', below: 'dynamicMP', place: 'dynamic' },
  mf: { above: 'dynamicMF', below: 'dynamicMF', place: 'dynamic' },
  ff: { above: 'dynamicFF', below: 'dynamicFF', place: 'dynamic' },
  fff: { above: 'dynamicFFF', below: 'dynamicFFF', place: 'dynamic' },
  ffff: { above: 'dynamicFFFF', below: 'dynamicFFFF', place: 'dynamic' },
  sfz: { above: 'dynamicSforzando1', below: 'dynamicSforzando1', place: 'dynamic' },

  // ── Fingerings ─────────────────────────────────────────────────────────────
  // abcjs draws `!3!` as a decoration digit above the staff, so these take the ornament
  // lane rather than the dynamic one.
  '0': { above: 'fingering0', below: 'fingering0', place: 'ornament' },
  '1': { above: 'fingering1', below: 'fingering1', place: 'ornament' },
  '2': { above: 'fingering2', below: 'fingering2', place: 'ornament' },
  '3': { above: 'fingering3', below: 'fingering3', place: 'ornament' },
  '4': { above: 'fingering4', below: 'fingering4', place: 'ornament' },
  '5': { above: 'fingering5', below: 'fingering5', place: 'ornament' },

  // ── Aliases ────────────────────────────────────────────────────────────────
  // abcjs rewrites these to canonical names through `accentPseudonyms`; we keep the
  // source spelling in the model, so the renderer resolves them instead. Each already
  // had its glyph — they drew nothing only because the table was keyed on the canonical
  // name. Verified against 6.6.3: `!>!` and `!emphasis!` both draw its sforzato (the
  // accent wedge), `!^!` its umarcato, `!tr!` its trill.
  '>': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  '<': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  emphasis: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  '^': { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
  umarcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
  tr: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },
  // abcjs draws `!mordent!` and `!trillh!` with the same glyphs as `!lowermordent!` and
  // `!trill!` — its scripts.mordent and scripts.trill respectively.
  mordent: { above: 'ornamentMordent', below: 'ornamentMordent', place: 'ornament' },
  trillh: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },

  // ── Ornaments and techniques ───────────────────────────────────────────────
  // Every one of these is painted by abcjs. Checked against its RENDERED SVG, because
  // its element dump misses anything attached through addOther — which is exactly what
  // made `slide` and `breath` look unsupported on the first pass. They are not.
  //
  // The glyph is core's own choice from SMuFL, as everywhere else: what is reproduced is
  // abcjs's decision to MARK the note, not the shape of its private font.
  roll: { above: 'ornamentTremblement', below: 'ornamentTremblement', place: 'ornament' },
  slide: { above: 'brassLiftShort', below: 'brassLiftShort', place: 'ornament' },
  breath: { above: 'breathMarkComma', below: 'breathMarkComma', place: 'ornament' },
  pralltriller: { above: 'ornamentShortTrill', below: 'ornamentShortTrill', place: 'ornament' },
  // An inverted fermata is the below-facing design, which was already extracted.
  invertedfermata: { above: 'fermataBelow', below: 'fermataBelow', place: 'ornament' },
  wedge: {
    above: 'articStaccatissimoAbove',
    below: 'articStaccatissimoBelow',
    place: 'articulation',
  },
  open: { above: 'brassMuteOpen', below: 'brassMuteOpen', place: 'ornament' },
  thumb: { above: 'stringsThumbPosition', below: 'stringsThumbPosition', place: 'ornament' },
  snap: {
    above: 'pluckedSnapPizzicatoAbove',
    below: 'pluckedSnapPizzicatoBelow',
    place: 'ornament',
  },

  // ── Drawn only in abc2.1 / extended ────────────────────────────────────────
  // abcjs paints NOTHING for these three — confirmed twice, by element dump and by
  // rendered SVG. Strict reproduces the blank; the other modes draw the ornament the ABC
  // actually names. Third instance of this split, after melisma and the microtones.
  invertedturn: { above: 'ornamentTurnInverted', below: 'ornamentTurnInverted', place: 'ornament' },
  invertedturnx: { above: 'ornamentTurnSlash', below: 'ornamentTurnSlash', place: 'ornament' },
  turnx: { above: 'ornamentTurnSlash', below: 'ornamentTurnSlash', place: 'ornament' },

  // ── Tremolo ────────────────────────────────────────────────────────────────
  // Strokes across the STEM, not a lane mark — the stroke count is the rhythm, so it has
  // to read against the stem it divides. SMuFL gives one glyph per count, so `!//!` is
  // tremolo2 rather than two copies of tremolo1.
  //
  // abcjs paints the slash spellings and NOT `trem1`..`trem4`, which are the same marks
  // under different names. Its own quirk; the named forms are left undrawn to match, and
  // asserted as such.
  '/': { above: 'tremolo1', below: 'tremolo1', place: 'stem' },
  '//': { above: 'tremolo2', below: 'tremolo2', place: 'stem' },
  '///': { above: 'tremolo3', below: 'tremolo3', place: 'stem' },
  '////': { above: 'tremolo4', below: 'tremolo4', place: 'stem' },

  // ── Phrase separators and technique ────────────────────────────────────────
  // Three lengths of the same idea, so three widths of the same family.
  shortphrase: { above: 'breathMarkTick', below: 'breathMarkTick', place: 'ornament' },
  mediumphrase: { above: 'caesuraShort', below: 'caesuraShort', place: 'ornament' },
  longphrase: { above: 'caesura', below: 'caesura', place: 'ornament' },
  // ABC's `+` is left-hand pizzicato; `plus` is abcjs's spelling of the same mark.
  '+': {
    above: 'pluckedLeftHandPizzicato',
    below: 'pluckedLeftHandPizzicato',
    place: 'ornament',
  },
  plus: {
    above: 'pluckedLeftHandPizzicato',
    below: 'pluckedLeftHandPizzicato',
    place: 'ornament',
  },
  // Rolled chord — a vertical wiggle beside the notehead rather than above it.
  arpeggio: { above: 'wiggleArpeggiatoUp', below: 'wiggleArpeggiatoUp', place: 'stem' },
}

/**
 * Decorations abcjs recognises but never paints. Strict draws nothing for them; every
 * other mode draws the glyph above.
 *
 * Not the same thing as a name abcjs REJECTS — those never reach the renderer, because
 * the parser drops them in strict (see `ABCJS_KNOWN_DECORATIONS`). These are accepted,
 * attached to the note, and then silently not drawn.
 */
const STRICT_UNDRAWN: ReadonlySet<string> = new Set(['invertedturn', 'invertedturnx', 'turnx'])

/**
 * Navigation directions, drawn as WORDS rather than symbols — which is what they are.
 *
 * abcjs paints each of these; verified by the delta against a plain note in its rendered
 * SVG. The display spelling is conventional engraving (`D.C. al Fine`), not the ABC
 * token, because the token is an identifier and the page wants prose.
 */
const DECORATION_TEXTS: Readonly<Record<string, string>> = {
  'D.C.': 'D.C.',
  'D.S.': 'D.S.',
  fine: 'Fine',
  'D.C.alcoda': 'D.C. al Coda',
  'D.C.alfine': 'D.C. al Fine',
  'D.S.alcoda': 'D.S. al Coda',
  'D.S.alfine': 'D.S. al Fine',
}

/**
 * Words a note carries — the navigation directions above.
 *
 * Italic and in the part lane, well clear of the ornament stack, because these address
 * the PLAYER rather than marking the note: they are read at a glance while navigating,
 * not while reading pitch. Stacked so two on one note cannot overprint.
 */
function decorationTexts(names: readonly string[], headX: number, headWidth: number): PlacedText[] {
  const out: PlacedText[] = []
  const size = ENGRAVE.lyricTextSize
  for (const name of names) {
    const text = DECORATION_TEXTS[name]
    if (text === undefined) continue
    out.push({
      text,
      x: headX + headWidth / 2 - textWidth(text, size) / 2,
      y: stepToY(ENGRAVE.partStep - out.length * ENGRAVE.annotationLineStep),
      size,
      bold: false,
      italic: true,
    })
  }
  return out
}

/**
 * Decoration glyphs for one note.
 *
 * Articulations stack outward from the notehead on the side away from the stem, so a
 * staccato dot never collides with its own stem. Ornaments and dynamics take their own
 * lanes above and below the staff.
 */
function decorationGlyphs(
  names: readonly string[],
  headX: number,
  headWidth: number,
  topStep: number,
  bottomStep: number,
  stemUp: boolean,
  /** `abcjs-strict` — suppresses the marks abcjs accepts but never paints. */
  strict: boolean,
): PlacedGlyph[] {
  const out: PlacedGlyph[] = []
  // Away from the stem, and never inside the staff for a note that sits in it.
  const artAbove = !stemUp
  let artStep = artAbove ? Math.max(topStep, 4) + 2 : Math.min(bottomStep, -4) - 2
  let ornamentStep = ENGRAVE.ornamentStep

  for (const name of names) {
    if (strict && STRICT_UNDRAWN.has(name)) continue
    const spec = DECORATIONS[name]
    if (spec === undefined) continue // unmapped — counted by the test, never guessed at

    const glyph = spec.place === 'articulation' ? (artAbove ? spec.above : spec.below) : spec.above
    const centre = headX + headWidth / 2 - GLYPHS[glyph].width / 2

    if (spec.place === 'articulation') {
      out.push({ name: glyph, x: centre, y: stepToY(artStep), role: 'decoration' })
      artStep += artAbove ? 2 : -2
    } else if (spec.place === 'ornament') {
      out.push({ name: glyph, x: centre, y: stepToY(ornamentStep), role: 'decoration' })
      ornamentStep += 2
    } else if (spec.place === 'stem') {
      // Centred on the stem's midpoint. An arpeggio instead sits just LEFT of the head,
      // which is where a rolled chord is read from.
      const onStem =
        name === 'arpeggio'
          ? headX - GLYPHS[glyph].width - ENGRAVE.spannerGap
          : headX + headWidth / 2 - GLYPHS[glyph].width / 2
      const tip = stemUp
        ? Math.max(topStep, 4) + ENGRAVE.stemLength
        : Math.min(bottomStep, -4) - ENGRAVE.stemLength
      out.push({
        name: glyph,
        x: onStem,
        y: stepToY(((stemUp ? topStep : bottomStep) + tip) / 2),
        role: 'decoration',
      })
    } else {
      out.push({ name: glyph, x: centre, y: stepToY(ENGRAVE.dynamicStep), role: 'decoration' })
    }
  }
  return out
}

/**
 * Width of a run of text, in staff spaces.
 *
 * Per-character advances rather than one number per character. The flat estimate this
 * replaces measured `iiiii` and `WWWWW` the same, with a median error of 8.9% against
 * real serif metrics over the corpus and a worst case of +77% — on the short narrow
 * syllables lyrics are actually made of. Still an ESTIMATE: the output asks for
 * `font-family="serif"` and the viewer supplies the font, so no table can be exact.
 */
const textWidth = (text: string, size: number): number => {
  let em = 0
  for (const ch of text)
    em += CHAR_ADVANCE[ch] ?? (isFullWidth(ch) ? FULL_WIDTH_ADVANCE : FALLBACK_ADVANCE)
  return em * size
}

/**
 * CJK and kana, which are FULL WIDTH — about one em, against a Latin letter's half.
 *
 * A range test rather than a table entry: there are tens of thousands of these and they
 * share one advance, so enumerating them would be absurd. Found because the corpus has a
 * Chinese-lyric fixture whose three characters were each measured at half their real
 * width, which was the whole of the table's residual error.
 */
function isFullWidth(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return (
    (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
    (c >= 0x2e80 && c <= 0x9fff) || // CJK radicals through unified ideographs, incl. kana
    (c >= 0xac00 && c <= 0xd7a3) || // Hangul syllables
    (c >= 0xf900 && c <= 0xfaff) || // CJK compatibility ideographs
    (c >= 0xff00 && c <= 0xff60) // full-width forms
  )
}

/** One em, the standard advance for a full-width character. */
const FULL_WIDTH_ADVANCE = 1.0

/**
 * Text attached to a note: its chord symbol above, its lyric syllables below.
 *
 * Both are CENTRED on the notehead, which without text metrics means centred on an
 * estimate — see `textWidth`. A chord symbol in real engraving is left
 * aligned to the note rather than centred; centring reads better against an estimated
 * width, since the error is halved and falls on both sides instead of accumulating to
 * one. Revisit when there are metrics.
 */
function noteText(
  event: MusicEvent,
  headX: number,
  headWidth: number,
  /** `abcjs-strict` — gates whether `%%vocalfont` is realized. See the verses block. */
  strict = true,
): PlacedText[] {
  if (event.type === 'rest') return []
  const texts: PlacedText[] = []
  const centre = headX + headWidth / 2

  if (event.chordSymbol !== null && event.chordSymbol !== '') {
    const size = ENGRAVE.lyricTextSize
    texts.push({
      text: event.chordSymbol,
      x: centre - textWidth(event.chordSymbol, size) / 2,
      y: stepToY(ENGRAVE.chordSymbolStep),
      size,
      bold: false,
      italic: false,
    })
  }

  // `"^text"` and `"_text"` — free annotations, which the parser separates from chord
  // symbols by that leading char. It is placement, not content, so it is stripped here
  // rather than printed. See `ENGRAVE.annotationAboveStep` for the stacking order.
  const annotations = event.annotations.map((a) => ({ where: a[0] ?? '^', text: a.slice(1) }))
  const above = annotations.filter((a) => a.where === '^' || a.where === '@')
  const below = annotations.filter((a) => a.where === '_')

  above.forEach((a, index) => {
    const size = ENGRAVE.lyricTextSize
    const lane =
      ENGRAVE.annotationAboveStep + (above.length - 1 - index) * ENGRAVE.annotationLineStep
    texts.push({
      text: a.text,
      x: centre - textWidth(a.text, size) / 2,
      y: stepToY(lane),
      size,
      bold: false,
      italic: false,
    })
  })

  below.forEach((a, index) => {
    const size = ENGRAVE.lyricTextSize
    texts.push({
      text: a.text,
      x: centre - textWidth(a.text, size) / 2,
      y: stepToY(ENGRAVE.annotationBelowStep - index * ENGRAVE.annotationLineStep),
      size,
      bold: false,
      italic: false,
    })
  })

  // `"<text"` and `">text"` sit beside the note at staff height instead of above it.
  // ponytail: `"@x,y text"` is free placement — its coordinates would need parsing, so it
  // falls in with `^` above and prints them. No corpus fixture writes one.
  for (const a of annotations) {
    if (a.where !== '<' && a.where !== '>') continue
    const size = ENGRAVE.lyricTextSize
    texts.push({
      text: a.text,
      x:
        a.where === '<'
          ? headX - textWidth(a.text, size) - ENGRAVE.minColumnGap
          : headX + headWidth + ENGRAVE.minColumnGap,
      y: stepToY(0),
      size,
      bold: false,
      italic: false,
    })
  }

  // Verse 1 comes from `lyric`; `extraVerses` holds 2..n, positionally, with a null
  // wherever a verse skips this note.
  const verses = [event.lyric, ...event.extraVerses]
  // `%%vocalfont`, realized. THE NULL BRANCH DOES NO ARITHMETIC: a tune that never sets a
  // vocalfont takes `ENGRAVE.lyricTextSize` itself, the same object it always took, so
  // its geometry cannot move by a rounding step. Computing a size and finding it equal to
  // the default would be the same value in theory and a sub-pixel drift across every
  // font-free fixture in practice.
  //
  // Verse 1 only, because `lyricFont` is per event and `extraVerses` is a bare
  // (string|null)[] with nowhere to put one — the same limitation melisma has, recorded
  // on `lyricMelisma` in the model. A `%%vocalfont` between two `w:` lines under the same
  // music therefore styles verse 1 and not verse 2.
  //
  // MODE-GATED, and this direction is deliberate: abcjs stamps `el.fonts` at parse time
  // and never reads `.fonts` anywhere in its write phase, so its mid-tune vocalfont is
  // parsed and never realized. Strict reproduces that by drawing every syllable in the
  // default. Realizing it in strict would be an IMPROVEMENT, which is the one thing
  // strict must not do.
  const lyricSize =
    !strict && event.lyricFont !== null
      ? // Ratio FIRST. `size / DEFAULT` is exactly 1 when they are equal, whatever the
        // values, so `%%vocalfont Times-Bold` with no size lands on the default size
        // exactly rather than a rounding step away from it. Multiplying first happens to
        // be exact for 13 too, and would stop being so if either constant moved.
        ENGRAVE.lyricTextSize * (event.lyricFont.size / DEFAULT_VOCALFONT_PT)
      : ENGRAVE.lyricTextSize
  const lyricBold = !strict && event.lyricFont !== null ? event.lyricFont.bold : false
  const lyricItalic = !strict && event.lyricFont !== null ? event.lyricFont.italic : false
  verses.forEach((verse, index) => {
    if (verse === null || verse === '') return
    // Verse 1 carries the font; later verses stay at the default until `extraVerses` can
    // hold one of their own.
    const size = index === 0 ? lyricSize : ENGRAVE.lyricTextSize
    texts.push({
      text: verse,
      // Tagged so the melisma pass can find the syllable it must extend from. Matching
      // on the y lane instead would couple that pass to this one's lane arithmetic.
      role: 'lyric',
      // MEASUREMENT follows the same `size`, so a bigger font both draws and occupies
      // bigger. A font that draws large and measures at the default width is how lyrics
      // end up overlapping — the centring here and the melisma extender's start both
      // read this width.
      x: centre - textWidth(verse, size) / 2,
      y: stepToY(ENGRAVE.lyricStep - index * ENGRAVE.lyricLineStep),
      size,
      bold: index === 0 ? lyricBold : false,
      italic: index === 0 ? lyricItalic : false,
    })
  })

  return texts
}

/**
 * Melisma runs — one syllable held across several notes.
 *
 * Two different jobs, because the modes disagree about what a melisma LOOKS like:
 *
 *   strict    abcjs prints the `_` literally after the syllable and draws no line. Its
 *             element dump carries `c: "sing_"` as one text, so the underscore is folded
 *             into the syllable and the pair re-centred, not dropped alongside it.
 *   non-strict  the `_` is suppressed and an extender line is stroked instead, which is
 *             what every engraving convention actually asks for.
 *
 * ENDPOINT, per Gould, *Behind Bars* p.447: the line runs to the last written NOTE, not to
 * the end of that note's duration — and the book prints the over-long form as a captioned
 * example of the mistake. So it stops at the last held NOTEHEAD's right edge, NOT at the
 * end of the duration allotment and NOT at the next syllable. abcMusicKit v1 and v2 both
 * arrived here independently; this model's own comment used to prescribe the duration
 * extent, which is the error Gould is warning about.
 *
 * A rest inside the run keeps it alive without moving its end — also v1's rule. Rests
 * carry no lyric fields at all, so they are skipped rather than tested.
 *
 * ponytail: a run that crosses a system break is truncated at the edge, because anchors
 * arrive already filtered to one system. v1 draws a stub and resumes on the next; worth
 * doing when a fixture needs it.
 */
/**
 * Spanning decorations: hairpins and glissandi.
 *
 * These come in open/close pairs — `!<(!` … `!<)!` — so unlike every other decoration
 * they cannot be drawn from one note. The pass mirrors `layoutCurves`: walk the anchors,
 * remember where each kind opened, emit geometry when it closes.
 *
 * HAIRPIN geometry from abcjs 6.6.3's painted output. It draws two strokes from a common
 * apex to a spread mouth — `M 70.85 128.35 L 198.13 124.35` plus `L 198.13 132.35`, a
 * mouth of 8px against its 7.75px staff space, so almost exactly one space. A crescendo
 * points left and opens right; a diminuendo is the mirror. Both sit in the dynamic lane
 * below the staff, which is where a lone `!p!` already goes.
 *
 * ponytail: a pair that opens on one system and closes on another is dropped rather than
 * split, because anchors arrive filtered to a single system. Slurs solve this properly by
 * resolving after the whole tune is packed; hairpins can move to that machinery when a
 * fixture needs it. No corpus fixture spans one.
 */
const SPANNER_OPEN: Readonly<Record<string, 'crescendo' | 'diminuendo' | 'glissando'>> = {
  '<(': 'crescendo',
  'crescendo(': 'crescendo',
  '>(': 'diminuendo',
  'diminuendo(': 'diminuendo',
  'glissando(': 'glissando',
}
const SPANNER_CLOSE: Readonly<Record<string, 'crescendo' | 'diminuendo' | 'glissando'>> = {
  '<)': 'crescendo',
  'crescendo)': 'crescendo',
  '>)': 'diminuendo',
  'diminuendo)': 'diminuendo',
  'glissando)': 'glissando',
}

/**
 * Braces and brackets joining the staves of a `%%score` group.
 *
 * Placed once the staves have their final `originY`, since a connector spans from the top
 * of the first staff in its group to the bottom of the last — which is only known then.
 *
 * SMuFL draws a brace as one glyph meant to be STRETCHED vertically, and a bracket as a
 * plain rule with separate serifs at each end. So the brace is scaled and the bracket is
 * built, which is also how the two differ in engraving: a brace is a piece of lettering,
 * a bracket is a rule.
 */
function layoutConnectors(
  groups: readonly StaffGroup[],
  staves: readonly { readonly originY: number }[],
): { glyphs: PlacedGlyph[]; lines: PlacedLine[] } {
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []
  if (groups.length === 0) return { glyphs, lines }

  /** Runs of consecutive staves sharing a connector, from its `start`…`end` markers. */
  const runs = (kind: 'brace' | 'bracket'): { from: number; to: number }[] => {
    const out: { from: number; to: number }[] = []
    let open: number | null = null
    groups.forEach((group, i) => {
      const mark = kind === 'brace' ? group.brace : group.bracket
      if (mark === 'start') open = i
      if (mark === 'end' && open !== null) {
        out.push({ from: open, to: i })
        open = null
      }
    })
    return out
  }

  const edge = (index: number): { top: number; bottom: number } | null => {
    const staff = staves[index]
    if (staff === undefined) return null
    // A staff spans steps +4 to -4 around its own origin.
    return { top: staff.originY + stepToY(4), bottom: staff.originY + stepToY(-4) }
  }

  for (const { from, to } of runs('brace')) {
    const first = edge(from)
    const last = edge(to)
    if (first === null || last === null) continue
    const height = last.bottom - first.top
    const glyph = GLYPHS.brace
    // Stretched to the span. The glyph's own height is its natural size, so the scale is
    // the ratio — the one place a glyph is deliberately not drawn at 1:1.
    glyphs.push({
      name: 'brace',
      x: -ENGRAVE.connectorGap - glyph.width,
      y: first.top,
      scale: height / glyph.height,
      role: 'staff',
    })
  }

  for (const { from, to } of runs('bracket')) {
    const first = edge(from)
    const last = edge(to)
    if (first === null || last === null) continue
    const x = -ENGRAVE.connectorGap
    lines.push({
      x1: x,
      y1: first.top,
      x2: x,
      y2: last.bottom,
      thickness: ENGRAVE.bracketThickness,
      role: 'staff',
    })
    glyphs.push({ name: 'bracketTop', x, y: first.top, role: 'staff' })
    glyphs.push({ name: 'bracketBottom', x, y: last.bottom, role: 'staff' })
  }

  return { glyphs, lines }
}

function layoutSpanners(
  anchors: readonly NoteAnchor[],
  /** Where each system's music starts and ends, exactly as `layoutCurves` uses it. */
  bounds: readonly { left: number; right: number }[],
): PlacedLine[][] {
  const out: PlacedLine[][] = bounds.map(() => [])
  const thickness = ENGRAVING_DEFAULTS.staffLineThickness

  /**
   * One hairpin piece: two strokes whose gap goes from `startGap` to `endGap`.
   *
   * A hairpin split across systems is NOT two whole hairpins — it is one shape cut in
   * half, so each piece continues the taper the other left off at. The mouth therefore
   * interpolates by how much of the span each system carries.
   */
  const hairpin = (system: number, x1: number, x2: number, g1: number, g2: number): void => {
    if (x2 - x1 < ENGRAVE.spannerMinLength) return
    const y = stepToY(ENGRAVE.dynamicStep)
    out[system]?.push(
      { x1, y1: y - g1 / 2, x2, y2: y - g2 / 2, thickness, role: 'decoration' },
      { x1, y1: y + g1 / 2, x2, y2: y + g2 / 2, thickness, role: 'decoration' },
    )
  }

  const emit = (from: NoteAnchor, to: NoteAnchor, kind: string): void => {
    if (kind === 'glissando') {
      // Tracks PITCH, so it follows the noteheads rather than sitting in a lane. A
      // glissando across a system break is dropped rather than split: half a pitch line
      // aimed at a note the reader cannot see says nothing. No fixture writes one.
      if (from.system !== to.system) return
      out[from.system]?.push({
        x1: from.right + ENGRAVE.spannerGap,
        y1: (from.top + from.bottom) / 2,
        x2: to.left - ENGRAVE.spannerGap,
        y2: (to.top + to.bottom) / 2,
        thickness,
        role: 'decoration',
      })
      return
    }

    const mouth = ENGRAVE.hairpinMouth
    // Gap as a fraction of the way along: a crescendo opens, a diminuendo closes.
    const gapAt = (t: number) => (kind === 'crescendo' ? t : 1 - t) * mouth

    if (from.system === to.system) {
      hairpin(from.system, from.left, to.right, gapAt(0), gapAt(1))
      return
    }
    const start = bounds[from.system]
    const end = bounds[to.system]
    if (start === undefined || end === undefined) return
    const firstRun = Math.max(0, start.right - from.left)
    const lastRun = Math.max(0, to.right - end.left)
    const total = firstRun + lastRun
    const split = total === 0 ? 0.5 : firstRun / total
    hairpin(from.system, from.left, start.right, gapAt(0), gapAt(split))
    hairpin(to.system, end.left, to.right, gapAt(split), gapAt(1))
  }

  // A QUEUE per kind, not a single slot. `S1-decorations` writes `!crescendo(!G!<(!G`
  // and then closes both — the two spellings are the same kind, so a single slot let the
  // second open overwrite the first and silently lost a hairpin. FIFO rather than a
  // stack because hairpins on one voice run in sequence; they do not nest, so the first
  // open belongs to the first close.
  const open = new Map<string, NoteAnchor[]>()

  for (const anchor of anchors) {
    if (anchor.event.type === 'rest') continue
    for (const name of anchor.event.decorations) {
      const opens = SPANNER_OPEN[name]
      if (opens !== undefined) {
        const queue = open.get(opens)
        if (queue === undefined) open.set(opens, [anchor])
        else queue.push(anchor)
        continue
      }
      const closes = SPANNER_CLOSE[name]
      if (closes === undefined) continue
      const from = open.get(closes)?.shift()
      if (from !== undefined) emit(from, anchor, closes)
    }
  }

  return out
}

function layoutMelismas(
  anchors: readonly NoteAnchor[],
  elements: LayoutElement[],
  strict: boolean,
): PlacedLine[] {
  const lines: PlacedLine[] = []

  anchors.forEach((start, index) => {
    if (start.event.type === 'rest' || !start.event.lyricMelismaStart) return

    const element = elements[start.element]
    const lyricIndex = element?.texts.findIndex((t) => t.role === 'lyric') ?? -1
    const lyric = lyricIndex < 0 ? undefined : element?.texts[lyricIndex]
    if (element === undefined || lyric === undefined) return

    if (strict) {
      // One text, as abcjs emits it. Appending widens the string by the underscore, so
      // the pair re-centres by half that — the syllable itself shifts left, which is
      // what centring "sing_" rather than "sing" does.
      const widened = `${lyric.text}_`
      const texts = [...element.texts]
      texts[lyricIndex] = {
        ...lyric,
        text: widened,
        x: lyric.x - textWidth('_', lyric.size) / 2,
      }
      elements[start.element] = { ...element, texts }
      return
    }

    // Only the LINE needs the far end, which is why the search sits below the strict
    // branch rather than above it. The two modes wrap differently — strict renders at
    // abcjs's denser spacing — so a run can be intact in one mode and split across a
    // system break in the other. abcjs prints the `_` either way, because for abcjs it
    // is part of the syllable's text and has nothing to do with where the hold landed.
    // Gating it on finding a hold in THIS system dropped the underscore from
    // S5-directives, which is real corpus content no gate renders.
    let last: NoteAnchor | null = null
    for (const anchor of anchors.slice(index + 1)) {
      if (anchor.event.type === 'rest') continue
      if (!anchor.event.lyricMelisma) break
      last = anchor
    }
    if (last === null) return

    const from = lyric.x + textWidth(lyric.text, lyric.size) + ENGRAVE.melismaGap
    const to = last.right + ENGRAVE.melismaGap
    // A run so tight that the line would be a speck reads as a smudge; drop it instead.
    if (to - from < ENGRAVE.melismaMinLength) return
    lines.push({
      x1: from,
      y1: lyric.y,
      x2: to,
      y2: lyric.y,
      thickness: ENGRAVING_DEFAULTS.staffLineThickness,
      role: 'lyric',
    })
  })

  return lines
}

// ─── Slurs and ties ──────────────────────────────────────────────────────────

/** Where a curve can attach to a note, recorded during layout. */
interface NoteAnchor {
  /** Left and right edges of the notehead, and its vertical extremes. */
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly stemUp: boolean
  /** The source event, so ties and slurs can be matched to what the music said. */
  readonly event: MusicEvent
  /** Which system this note ended up in — a curve spanning two is drawn in halves. */
  readonly system: number
  /**
   * Index into the staff's `elements`, filled when the block is placed.
   *
   * A tuplet bracket must clear the STEMS and BEAMS, not just the noteheads, and those
   * are only final after the beam pass has retargeted them — so the bracket reads the
   * drawn element rather than the anchor's own notehead extent.
   */
  readonly element: number
}

/**
 * Build one curve between two anchors.
 *
 * A slur or tie sits on the NOTEHEAD side, opposite the stems — that is the convention,
 * and it is also what keeps the curve clear of the stems and beams. When the two ends
 * disagree about stem direction the curve goes above, which is the usual tie-break.
 */
function buildCurve(from: NoteAnchor, to: NoteAnchor, kind: 'tie' | 'slur'): PlacedCurve {
  // Opposite the stems: an up-stem note carries its slur below the notehead.
  const above = !(from.stemUp && to.stemUp)
  const direction = above ? -1 : 1

  const x1 = from.right + ENGRAVE.curveEndGap
  const x2 = to.left - ENGRAVE.curveEndGap
  const edge = (a: NoteAnchor) => (above ? a.top : a.bottom) + direction * ENGRAVE.curveEndGap

  const span = Math.max(0, x2 - x1)
  const bulge = Math.min(
    ENGRAVE.curveMaxBulge,
    Math.max(ENGRAVE.curveMinBulge, span * ENGRAVE.curveBulgeRatio),
  )

  return {
    x1,
    y1: edge(from),
    x2,
    y2: edge(to),
    bulge: bulge * direction,
    endThickness:
      kind === 'tie'
        ? ENGRAVING_DEFAULTS.tieEndpointThickness
        : ENGRAVING_DEFAULTS.slurEndpointThickness,
    midThickness:
      kind === 'tie'
        ? ENGRAVING_DEFAULTS.tieMidpointThickness
        : ENGRAVING_DEFAULTS.slurMidpointThickness,
    kind,
  }
}

/**
 * Resolve every tie and slur over one staff's notes, in order.
 *
 * Ties are pairwise and local: `tiedToNext` joins a note to the one after it. Slurs
 * nest, so `slurStarts` and `slurEnds` are COUNTS and matching them needs a stack —
 * `((AB)C)` has two slurs opening on the same note and they close in reverse.
 *
 * ponytail: a curve whose ends fall in different SYSTEMS is dropped rather than drawn
 * wrong. Engraving splits it in two, one piece running to the end of the first system
 * and another from the start of the next; that needs the halves laid out separately and
 * is a slice of its own. `vree-ties-across-bars` ties across a BARLINE, which is fine —
 * only a system break drops one.
 */
function layoutCurves(
  anchors: readonly NoteAnchor[],
  /**
   * Where each system's music starts and ends. A split curve runs to the right edge of
   * the system it leaves and resumes after the clef and key of the one it enters.
   */
  bounds: readonly { left: number; right: number }[],
): PlacedCurve[][] {
  const curves: PlacedCurve[][] = bounds.map(() => [])
  const open: number[] = []

  /**
   * Emit one logical curve, SPLITTING it if its ends are in different systems.
   *
   * Engraving breaks such a curve in two: a piece running from the first note to the end
   * of its system, and a piece from the start of the next system to the second note.
   * Each half keeps the full arc shape, so the eye completes it across the break.
   *
   * ponytail: a curve spanning THREE systems — possible only for a very long slur —
   * gets its two ends and no middle. The intervening systems would each want a full-width
   * arc; no corpus fixture has one.
   */
  const emit = (from: NoteAnchor, to: NoteAnchor, kind: 'tie' | 'slur'): void => {
    if (from.system === to.system) {
      curves[from.system]?.push(buildCurve(from, to, kind))
      return
    }
    const start = bounds[from.system]
    const end = bounds[to.system]
    if (start === undefined || end === undefined) return

    // Each half is LEVEL at its own note's height. Sloping it toward a note in another
    // system would aim at a pitch the reader cannot see, and the two halves would tilt
    // in unrelated directions.
    curves[from.system]?.push(
      buildCurve(from, { ...from, left: start.right, right: start.right }, kind),
    )
    // The continuation resumes after the new system's clef and key — starting at the
    // system's left edge drew it straight through the clef, where it was invisible.
    //
    // ponytail: if the first note sits hard against the prefix there is no room for the
    // hook, and it is OMITTED rather than drawn backwards. The half running off the
    // previous system still signals that the curve continues, which is most of the
    // reading benefit. Engraving reserves room at the system start for exactly this;
    // doing that means feeding the curve back into spacing, which is a slice of its own.
    const resume = Math.max(end.left, to.left - ENGRAVE.curveContinuation)
    if (to.left - resume >= ENGRAVE.curveEndGap * 2) {
      curves[to.system]?.push(buildCurve({ ...to, left: resume, right: resume }, to, kind))
    }
  }

  anchors.forEach((anchor, i) => {
    const event = anchor.event
    if (event.type === 'rest') return

    // Slurs close before they open, so `(A)(B)` closes on A before opening on B.
    for (let n = 0; n < event.slurEnds; n++) {
      const start = open.pop()
      const from = start === undefined ? undefined : anchors[start]
      if (from !== undefined) emit(from, anchor, 'slur')
    }
    for (let n = 0; n < event.slurStarts; n++) open.push(i)

    // A tie joins this note to the next SOUNDING one, wherever it falls.
    if (event.tiedToNext) {
      const next = anchors[i + 1]
      if (next !== undefined) emit(anchor, next, 'tie')
    }
  })

  return curves
}

// ─── Tuplets ─────────────────────────────────────────────────────────────────

/**
 * Tuplet brackets and their number.
 *
 * A tuplet is a rhythmic claim — "three in the time of two" — and without the digit a
 * triplet is indistinguishable from three plain notes. 177 tuplet members sit in the
 * corpus and none of them were drawn; the structural gate never noticed, because it
 * compares noteheads and abcjs does not put a tuplet bracket in `children` either.
 *
 * *Behind Bars*: over a BEAMED group the beam already shows the grouping, so only the
 * number is printed. Over unbeamed notes the number needs a bracket to say how far the
 * claim extends. Both sit on the stem side, with the beam rather than across the
 * noteheads.
 */
function layoutTuplets(
  anchors: readonly NoteAnchor[],
  elements: readonly LayoutElement[],
): { lines: PlacedLine[]; texts: PlacedText[] } {
  /** Full vertical ink of a member, stems and beams included. */
  const extentOf = (anchor: NoteAnchor): { top: number; bottom: number } => {
    const el = elements[anchor.element]
    if (el === undefined) return { top: anchor.top, bottom: anchor.bottom }
    let top = anchor.top
    let bottom = anchor.bottom
    for (const line of el.lines) {
      top = Math.min(top, line.y1, line.y2)
      bottom = Math.max(bottom, line.y1, line.y2)
    }
    for (const g of el.glyphs) {
      const glyph = GLYPHS[g.name]
      const scale = g.scale ?? 1
      top = Math.min(top, g.y + glyph.y * scale)
      bottom = Math.max(bottom, g.y + (glyph.y + glyph.height) * scale)
    }
    return { top, bottom }
  }

  const lines: PlacedLine[] = []
  const texts: PlacedText[] = []

  // Members of one tuplet are contiguous, so grouping by id preserves their order.
  const groups = new Map<number, NoteAnchor[]>()
  for (const anchor of anchors) {
    const tuplet = anchor.event.tuplet
    if (tuplet === null) continue
    const members = groups.get(tuplet.group) ?? []
    members.push(anchor)
    groups.set(tuplet.group, members)
  }

  for (const members of groups.values()) {
    const first = members[0]
    const last = members[members.length - 1]
    if (first === undefined || last === undefined) continue
    const number = first.event.tuplet?.number ?? 0
    if (number === 0) continue

    // The bracket goes on the stem side, where the beam is, so it never crosses the
    // noteheads. A majority vote: a group whose stems disagree is rare and the beam
    // pass has usually forced them to agree anyway.
    const up = members.filter((m) => m.stemUp).length * 2 >= members.length
    const direction = up ? -1 : 1

    // Clear of the furthest extent any member reaches, so the bracket never collides.
    const extents = members.map(extentOf)
    const edge = up
      ? Math.min(...extents.map((e) => e.top))
      : Math.max(...extents.map((e) => e.bottom))
    const y = edge + direction * ENGRAVE.tupletGap

    // A tuplet entirely inside ONE beam group needs no bracket: the beam already says
    // where it starts and stops.
    const beamed =
      members.every((m) => m.event.type !== 'rest' && m.event.beamGroup !== null) &&
      new Set(members.map((m) => (m.event.type === 'rest' ? null : m.event.beamGroup))).size === 1

    const label = String(number)
    const size = ENGRAVE.tupletTextSize
    const width = textWidth(label, size)
    const centre = (first.left + last.right) / 2

    texts.push({
      text: label,
      x: centre - width / 2,
      // Text hangs from its baseline, so a bracket ABOVE needs the number lifted clear.
      y: up ? y - size * 0.1 : y + size * 0.9,
      size,
      bold: false,
      italic: true,
    })

    if (beamed) continue

    // Bracket: a horizontal rule broken around the number, with a hook at each end
    // turning toward the notes.
    const gap = width / 2 + ENGRAVE.tupletNumberGap
    const thickness = ENGRAVING_DEFAULTS.slurEndpointThickness
    const hook = ENGRAVE.tupletHook * -direction

    lines.push({ x1: first.left, y1: y, x2: centre - gap, y2: y, thickness })
    lines.push({ x1: centre + gap, y1: y, x2: last.right, y2: y, thickness })
    lines.push({ x1: first.left, y1: y, x2: first.left, y2: y - hook, thickness })
    lines.push({ x1: last.right, y1: y, x2: last.right, y2: y - hook, thickness })
  }

  return { lines, texts }
}

// ─── Beams ───────────────────────────────────────────────────────────────────

/**
 * Draw one beam group: retarget every member's stem to a common beam line, and add the
 * beams themselves.
 *
 * The line is fitted from the two end notes' natural stem tips and then clamped twice —
 * once on slope, so a beam stays gently inclined however far the melody leaps, and once
 * on position, so no stem in the middle of the group ends up shorter than
 * `minStemLength`. Both are *Behind Bars*; the second is what stops a beam cutting
 * through a notehead that sits high inside a rising run.
 *
 * Returns the beam rectangles. Stems are rewritten in place in `elements`.
 */
function layoutBeam(group: readonly StemInfo[], elements: LayoutElement[]): PlacedLine[] {
  const first = group[0]
  const last = group[group.length - 1]
  if (!first || !last || group.length < 2) return []

  const up = first.up
  const direction = up ? -1 : 1
  const tipOf = (stem: StemInfo): number => stepToY(stem.farStep) + direction * ENGRAVE.stemLength

  // Fit through the end notes, then clamp the rise.
  const span = last.x - first.x
  let startY = tipOf(first)
  let endY = tipOf(last)
  const rise = endY - startY
  if (Math.abs(rise) > ENGRAVE.beamMaxRise) {
    const clamped = Math.sign(rise) * ENGRAVE.beamMaxRise
    const mid = (startY + endY) / 2
    startY = mid - clamped / 2
    endY = mid + clamped / 2
  }

  const yAt = (x: number): number =>
    span === 0 ? startY : startY + ((x - first.x) / span) * (endY - startY)

  // Push the line out until the shortest stem clears the minimum. An interior note can
  // sit closer to the beam than either end note does.
  let shift = 0
  for (const stem of group) {
    const length = (yAt(stem.x) - stepToY(stem.farStep)) * direction
    if (length < ENGRAVE.minStemLength) {
      shift = Math.max(shift, ENGRAVE.minStemLength - length)
    }
  }
  startY += shift * direction
  endY += shift * direction

  // Retarget each stem to the beam.
  for (const stem of group) {
    const element = elements[stem.element]
    if (!element) continue
    const beamY = yAt(stem.x)
    const lines = element.lines.map((line) =>
      line.x1 === line.x2 && line.x1 === stem.x ? { ...line, y2: beamY } : line,
    )
    elements[stem.element] = { ...element, lines }
  }

  // Level 0 spans the whole group; deeper levels only where consecutive notes both carry
  // them, and a lone note at a level gets a stub pointing back toward its neighbour.
  //
  // Deeper beams stack INWARD, toward the noteheads: the outermost beam is the one the
  // stems actually end on, so an up-stem's second beam sits below its first.
  const beams: PlacedLine[] = []
  const maxLevel = Math.max(...group.map((stem) => stem.beams))
  const thickness = ENGRAVING_DEFAULTS.beamThickness
  const inward = -direction
  const step = (thickness + ENGRAVING_DEFAULTS.beamSpacing) * inward

  for (let level = 0; level < maxLevel; level++) {
    // y here is the beam's CENTRE line; the emitted line carries its thickness.
    const offset = level * step + (inward * thickness) / 2
    let runStart: StemInfo | null = null
    let runEnd: StemInfo | null = null

    const flush = () => {
      if (runStart === null || runEnd === null) return
      let x1 = runStart.x
      let x2 = runEnd.x
      if (runStart === runEnd) {
        // A stub: point it back toward the previous note when there is one, so a lone
        // sixteenth in a run of eighths reads as belonging to what precedes it.
        const index = group.indexOf(runStart)
        const backward = index > 0
        x1 = backward ? runStart.x - ENGRAVE.beamStubLength : runStart.x
        x2 = backward ? runStart.x : runStart.x + ENGRAVE.beamStubLength
      }
      beams.push({
        x1,
        y1: yAt(x1) + offset,
        x2,
        y2: yAt(x2) + offset,
        thickness,
      })
      runStart = null
      runEnd = null
    }

    for (const stem of group) {
      if (stem.beams > level) {
        runStart ??= stem
        runEnd = stem
      } else {
        flush()
      }
    }
    flush()
  }

  return beams
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Lay out a score.
 *
 * Every voice, wrapped into justified systems, with voices that `%%score` groups with
 * `( … )` sharing a staff. (This once said "first voice only, one system, no line
 * breaking" — all three stopped being true and the comment did not.)
 */
/**
 * Which engine's look to reproduce.
 *
 * `standard` is core's own: abcm2ps's density, via abcMusicKit2's oracle-calibrated
 * constant. `abcjs` reproduces abcjs's, for the compat path where an existing page must
 * not visibly shift when abcts replaces abcjs.
 *
 * The two differ by ONE number, which is a genuinely surprising result and worth stating.
 * abcjs computes a note's spacing as `sqrt(duration * 8)` units of 30px
 * (`write/layout/voice-elements.js:23`, `engraver-controller.js:43`) — the same
 * SQUARE-ROOT law abcm2ps uses, just calibrated differently. In staff spaces abcjs is
 * `sqrt(d) * 10.949` against core's `sqrt(d) * 13.0`, so abcjs is about 16% tighter.
 * Predicted 42.43px for a quarter note; the goldens measure 42.43px.
 */
export type RenderProfile = 'standard' | 'abcjs'

const PROFILES: Readonly<Record<RenderProfile, { spacingScale: number }>> = {
  standard: { spacingScale: 3.25 },
  // sqrt(8) * 30 / 7.75 / 4 — abcjs's coefficient expressed against core's 1/16 reference.
  abcjs: { spacingScale: 2.7372 },
}

export interface LayoutOptions {
  /**
   * Which dialect's look to render. `abcjs-strict` reproduces abcjs's engraving density
   * so an existing page does not visibly shift; the other modes use core's own, which
   * follows abcm2ps.
   */
  readonly mode?: CompatibilityMode
  /** Override the mode's density directly. Rarely needed; `mode` is the usual control. */
  readonly profile?: RenderProfile
  /**
   * Width a system may reach before it wraps, in staff spaces. 90 is roughly a page
   * width at a typical staff size; a host with a known viewport should pass its own.
   */
  readonly systemWidth?: number
}

/** A measure laid out on its own, ready to be placed into whichever system it lands in. */
interface MeasureBlock {
  readonly elements: readonly LayoutElement[]
  readonly width: number
  /** Beam members, with element indices LOCAL to this block. */
  readonly beams: ReadonlyMap<number, readonly StemInfo[]>
  /**
   * Index of the barline that CLOSES this measure, if it has one.
   *
   * Recorded because it must end up at the column boundary rather than at this
   * measure's own content width: a sparse voice's barline would otherwise sit left of a
   * busy voice's, and the staves would stop lining up.
   */
  readonly closingBarIndex: number | null
  /** Note anchors for slur and tie resolution, positioned LOCAL to this block. */
  readonly anchors: readonly NoteAnchor[]
  /** A repeat ending opening at this measure, and whether this measure closes it. */
  readonly volta: string | null
  readonly closesVolta: boolean
  /**
   * Width of the music alone, excluding the closing barline and its gaps.
   *
   * A barline is a ROD, not a spring: it keeps its size and its distance from the
   * column edge however far the measure stretches. Only the music between barlines is
   * justified, so this is the span the stretch factor applies to.
   */
  readonly musicWidth: number
}

/**
 * Lay out one measure at x = 0. Position within a system comes later, by translation,
 * which is what lets a measure be measured before anywhere is chosen to put it.
 */
function layoutMeasure(
  measure: Measure,
  clef: Clef,
  directions: ReadonlyMap<number, boolean>,
  spacingScale: number,
  /** `abcjs-strict` — passed through for microtonal accidentals. */
  strict = true,
  /** Voice convention on a SHARED staff; null lets pitch decide. */
  voiceStem: boolean | null = null,
  /**
   * The key in force as this measure BEGINS — needed only to cancel it. A key change
   * cannot be drawn from the new key alone: the naturals depend on what is being left.
   */
  keyInForce: KeySignature | null = null,
): MeasureBlock {
  const elements: LayoutElement[] = []
  const beams = new Map<number, StemInfo[]>()
  const anchors: NoteAnchor[] = []
  let x = 0

  // The label precedes the first event that comes AFTER the `P:` in the source, which is
  // the measure head in every ordinary tune — a `P:` sits on its own line, so everything
  // in the measure follows it. The two come apart only when a measure spans the `P:`,
  // which `frere-jacques` does: abcjs lexes its `+:` prose as music, so the prose and the
  // real first bar are one measure with `P:A` between them, and abcjs prints the label
  // after the prose. Anchoring on the offset rather than on the measure gets both.
  //
  // An event with no source range is treated as following the `P:`, so an unknown offset
  // keeps the head placement rather than pushing the label to the end of the bar.
  const partAfter = measure.partLabelSourceRange?.start ?? -1
  const partIndex =
    measure.partLabel === null
      ? -1
      : measure.events.findIndex(
          (e) => (e.sourceRange?.start ?? Number.POSITIVE_INFINITY) >= partAfter,
        )
  if (measure.partLabel !== null && partIndex === 0) elements.push(layoutPart(x, measure.partLabel))

  // A mid-tune `K:` and the barline that opens the measure print in SOURCE ORDER.
  //
  // Which comes first is not a convention to pick, it is what the file says: `[K:Bb] |`
  // draws the signature then the bar, and `| [K:Bb]` draws the bar then the signature.
  // abcjs does exactly this — `S6-keys` X:602 writes `[K:Bb]       |` and abcjs emits
  // `[key]` BEFORE the bar — and strict has to match it. Anchoring on the two offsets
  // gets both spellings without a rule about either.
  //
  // The first version of this drew the key unconditionally after the barline, on the
  // stated grounds that "the new signature belongs to the music it governs". That reads
  // as sound engraving and is wrong here: it put the key on the far side of a barline
  // the author wrote it before, in all four of S6-keys' changes. The corpus fixture that
  // proves it is in tune 1, which the structural gate never looks at.
  const keyChangeAt = measure.keyChangeSourceRange?.start ?? Number.POSITIVE_INFINITY
  const openingBarAt = measure.openingBarlineSourceRange?.start ?? Number.POSITIVE_INFINITY
  const drawKeyChange = (): void => {
    if (measure.keyChange === null || keyInForce === null) return
    const change = layoutKeyChange(x, keyInForce, measure.keyChange, clef)
    if (change === null) return
    elements.push(change)
    x += change.width + ENGRAVE.prefixGap
  }
  const drawOpeningBar = (): void => {
    // An opening `|:` or `[|` prints before the measure it belongs to, and is a SEPARATE
    // barline from the previous measure's closer.
    if (measure.openingBarline === null) return
    x += ENGRAVE.barGap
    elements.push(layoutBar(x, measure.openingBarline))
    x += ENGRAVE.barGap
  }
  if (keyChangeAt < openingBarAt) {
    drawKeyChange()
    drawOpeningBar()
  } else {
    drawOpeningBar()
    drawKeyChange()
  }

  for (const [eventIndex, event] of measure.events.entries()) {
    if (measure.partLabel !== null && eventIndex === partIndex && partIndex > 0) {
      elements.push(layoutPart(x, measure.partLabel))
    }
    const group = event.type === 'rest' ? null : event.beamGroup
    const stemOut: { value: Omit<StemInfo, 'element'> | null } | null =
      group === null ? null : { value: null }
    const el = layoutEvent(
      event,
      x,
      clef,
      spacingScale,
      group === null ? null : (directions.get(group) ?? null),
      stemOut,
      strict,
      voiceStem,
    )
    if (el === null) continue
    if (group !== null && stemOut?.value) {
      const members = beams.get(group) ?? []
      members.push({ ...stemOut.value, element: elements.length })
      beams.set(group, members)
    }
    // Anchor the curve endpoints on the NOTEHEAD, not the element: an accidental shifts
    // the head right, and a slur springing from the accidental would start in mid-air.
    const heads = el.glyphs.filter((g) => g.name.startsWith('notehead'))
    if (heads.length > 0) {
      const width = GLYPHS[heads[0]?.name ?? 'noteheadBlack'].width
      anchors.push({
        system: 0, // filled in when the block is placed into a system
        element: elements.length,
        left: Math.min(...heads.map((h) => h.x)),
        right: Math.max(...heads.map((h) => h.x)) + width,
        top: Math.min(...heads.map((h) => h.y)) - 0.5,
        bottom: Math.max(...heads.map((h) => h.y)) + 0.5,
        stemUp: el.lines.some((l) => l.x1 === l.x2 && l.y2 < l.y1),
        event,
      })
    } else if (event.type === 'rest') {
      // Rests get an anchor too — not for curves, which skip them, but because a tuplet
      // can contain one (`(3cz` and `(3z` are both in the corpus) and its bracket has to
      // span the rest like any other member.
      const glyph = el.glyphs[0]
      const ink = glyph === undefined ? undefined : GLYPHS[glyph.name]
      anchors.push({
        system: 0,
        element: elements.length,
        left: el.x,
        right: el.x + (ink?.width ?? el.width),
        top: (glyph?.y ?? 0) + (ink?.y ?? 0),
        bottom: (glyph?.y ?? 0) + (ink?.y ?? 0) + (ink?.height ?? 0),
        stemUp: false,
        event,
      })
    }
    elements.push(el)
    x += el.width
  }

  // Every event preceded the `P:` — the label belongs after them, before the barline.
  if (measure.partLabel !== null && partIndex === -1)
    elements.push(layoutPart(x, measure.partLabel))

  let closingBarIndex: number | null = null
  const musicWidth = x
  if (measure.closingBarline !== null) {
    x += ENGRAVE.barGap
    closingBarIndex = elements.length
    elements.push(layoutBar(x, measure.closingBarline))
    x += ENGRAVE.barGap
  }

  // A repeat barline or a final ends the ending it sits in; a plain one does not.
  const closesVolta =
    measure.closingBarline === 'repeatEnd' ||
    measure.closingBarline === 'repeatBoth' ||
    measure.closingBarline === 'final' ||
    measure.closingBarline === 'double'

  return {
    elements,
    width: x,
    beams,
    anchors,
    closingBarIndex,
    musicWidth,
    volta: measure.volta,
    closesVolta,
  }
}

/** Shift a laid-out measure sideways into its place in a system. */
const shiftElement = (el: LayoutElement, dx: number): LayoutElement => ({
  ...el,
  x: el.x + dx,
  glyphs: el.glyphs.map((g) => ({ ...g, x: g.x + dx })),
  lines: el.lines.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx })),
  texts: el.texts.map((t) => ({ ...t, x: t.x + dx })),
})

const staffLinesFor = (width: number): PlacedLine[] =>
  ENGRAVE.staffLineSteps.map((step) => ({
    x1: 0,
    y1: stepToY(step),
    x2: width,
    y2: stepToY(step),
    thickness: ENGRAVING_DEFAULTS.staffLineThickness,
  }))

/** Everything about one voice that the packer needs. */
interface VoicePlan {
  readonly clef: Clef
  readonly blocks: readonly MeasureBlock[]
  /** The staff prefix, whose width differs per voice because clefs and keys differ. */
  readonly prefix: (
    withMeter: boolean,
    topStaff: boolean,
  ) => { elements: LayoutElement[]; width: number }
}

/**
 * Lay out a score.
 *
 * Every voice becomes a staff, stacked within each system. Measures are aligned across
 * voices by column, so bar 3 begins at the same x on every staff — without that the
 * staves drift apart and the score stops being readable as one thing.
 */
export function layout(score: Score, options: LayoutOptions = {}): Layout {
  const systemWidth = options.systemWidth ?? ENGRAVE.systemWidth
  // The mode picks the look; `profile` can still override it explicitly.
  const profile: RenderProfile =
    options.profile ?? (isStrict(options.mode ?? defaultMode) ? 'abcjs' : 'standard')
  // Read from the MODE, not from `profile`: profile is a density override and a caller
  // may set it either way, but whether a melisma prints abcjs's literal `_` or an
  // extender is a question about which engine's behaviour is being reproduced.
  const strict = isStrict(options.mode ?? defaultMode)
  const { spacingScale } = PROFILES[profile]
  const voices = score.voices.length > 0 ? score.voices : [undefined]

  /**
   * Which VOICES share each staff — the whole point of `%%score`'s `( … )`.
   *
   * Indices into `voices`, grouped by staff, top to bottom. Without a directive every
   * voice takes a staff of its own, which is what abcts did unconditionally until
   * 2026-07-20: five staves for a piano rag abcjs renders on two.
   *
   * Computed once for the tune, not per system, because staff membership is a property of
   * the score. It has to outlive the per-system build, since slurs and hairpins resolve
   * after packing and are indexed BY VOICE — so the merge needs to know, at that point,
   * which voices' curves belong to which staff.
   */
  const voicesOfStaff: number[][] =
    score.staves.length > 0
      ? score.staves.map((group) =>
          group.voiceIds.map((id) => voices.findIndex((v) => v?.id === id)).filter((i) => i >= 0),
        )
      : voices.map((_, i) => [i])

  /**
   * Stem direction by a voice's POSITION on its staff, not by its pitch.
   *
   * Two voices sharing a staff are read apart by their stems: the upper voice takes them
   * up, the lower down, whatever the notes do. Without this, `%%score (1 2)` on two
   * middle-register voices gives every stem the same direction — both down, since both
   * sit above the middle line — and the parts become unreadable exactly where sharing was
   * supposed to help. abcjs does the same: for `(1 2)` on identical notes, voice 0's stem
   * runs up and voice 1's down.
   *
   * `null` on a staff of one, where pitch is the right answer and forcing would be wrong.
   *
   * ponytail: voice 0 up, everything below it down. Three voices on a staff — the corpus
   * has `( 1 2 3 )` — conventionally wants the middle one placed by context, which needs
   * collision detection this engine does not have yet.
   */
  const stemForVoice = (index: number): boolean | null => {
    const staff = voicesOfStaff.find((members) => members.includes(index))
    if (staff === undefined || staff.length < 2) return null
    return staff.indexOf(index) === 0
  }

  const plans: VoicePlan[] = voices.map((voice, voiceIndex) => {
    // A voice's own `clef=` wins over the tune's `K:` clef; treble is the fallback.
    const clef = voice?.clef ?? score.clef
    const directions = beamDirections(voice, clef)
    // The key in force, accumulated forward. `Measure.keyChange` is a DELTA — the model
    // deliberately keeps `score.key` as the header key and leaves accumulation to the
    // consumer — so the renderer is the consumer that has to do it.
    let keyInForce = score.key
    const blocks = (voice?.measures ?? []).map((measure) => {
      const block = layoutMeasure(
        measure,
        clef,
        directions,
        spacingScale,
        strict,
        stemForVoice(voiceIndex),
        keyInForce,
      )
      if (measure.keyChange !== null) keyInForce = measure.keyChange
      return block
    })

    /**
     * The clef and key reprinted at the head of every system, which is what makes a
     * wrapped line readable. The meter is NOT reprinted — it appears once, at the start,
     * or again only where it changes.
     */
    const prefix = (
      withMeter: boolean,
      topStaff: boolean,
    ): { elements: LayoutElement[]; width: number } => {
      const elements: LayoutElement[] = []
      let x = ENGRAVE.marginX

      const clefElement = layoutClef(x, clef)
      if (clefElement !== null) {
        elements.push(clefElement)
        x += clefElement.width + ENGRAVE.prefixGap
      }
      const keySig = layoutKeySignature(x, score.key, clef)
      if (keySig !== null) {
        elements.push(keySig)
        x += keySig.width + ENGRAVE.prefixGap
      }
      if (withMeter && score.meter !== null) {
        const meter = layoutMeter(x, score.meter.numerator, score.meter.denominator)
        elements.push(meter)
        x += meter.width + ENGRAVE.prefixGap
      }
      // The tempo mark belongs to the TUNE — not to each system, and not to each voice.
      // It prints once: on the first system, above the top staff. Every staff still gets
      // its own clef, key and meter, which are per-staff by definition.
      // Zero width, so it does not advance the cursor.
      if (withMeter && topStaff && score.tempo !== null) {
        const tempo = layoutTempo(x, score.tempo)
        if (tempo !== null) elements.push(tempo)
      }
      return { elements, width: x }
    }

    return { clef, blocks, prefix }
  })

  // Measures align across voices: column i is as wide as the widest voice's bar i. A
  // voice that runs short simply contributes nothing to the columns past its end.
  const columns = Math.max(0, ...plans.map((plan) => plan.blocks.length))
  const columnWidths = Array.from({ length: columns }, (_, i) =>
    Math.max(0, ...plans.map((plan) => plan.blocks[i]?.width ?? 0)),
  )

  // Every staff in a system shares one prefix width, or the columns would not line up.
  const headWidth = (withMeter: boolean): number =>
    Math.max(0, ...plans.map((plan) => plan.prefix(withMeter, false).width))

  // Pack columns into systems, breaking before the column that would overflow.
  const spans: { start: number; end: number }[] = []
  let start = 0
  let used = 0
  for (let i = 0; i < columns; i++) {
    const head = headWidth(spans.length === 0)
    const width = columnWidths[i] ?? 0
    // A system always takes at least one column: a measure wider than the page
    // OVERFLOWS rather than sending the packer round forever.
    if (i > start && head + used + width + ENGRAVE.marginX > systemWidth) {
      spans.push({ start, end: i })
      start = i
      used = 0
    }
    used += width
  }
  if (columns > 0) spans.push({ start, end: columns })
  if (spans.length === 0) spans.push({ start: 0, end: 0 })

  // Anchors for every note of every voice, tagged with the system it landed in. A slur
  // or tie can span a break, so pairing them needs the whole tune, not one system.
  const voiceAnchors: NoteAnchor[][] = plans.map(() => [])

  const systems: LayoutSystem[] = spans.map((span, systemIndex) => {
    const withMeter = systemIndex === 0
    const head = headWidth(withMeter)

    /**
     * Justify the system to the page: every column stretches by a common factor so the
     * right edges line up, which is what makes a page of music look like a page rather
     * than a ragged list.
     *
     * The LAST system is left alone — a final line holding one bar would otherwise be
     * stretched across the whole page. And a system that would need more than
     * `maxJustifyStretch` is left short for the same reason, per *Behind Bars*.
     */
    const natural = columnWidths.slice(span.start, span.end).reduce((sum, w) => sum + w, 0)
    const available = systemWidth - head - ENGRAVE.marginX
    const isLast = systemIndex === spans.length - 1
    const wanted = natural > 0 && !isLast ? available / natural : 1
    const justify = wanted > 1 && wanted <= ENGRAVE.maxJustifyStretch ? wanted : 1

    const staves: LayoutStaff[] = plans.map((plan, voiceIndex) => {
      // The title heads the tune: first system, top staff, and inside the layout so the
      // vertical extent accounts for it. Added afterwards it would sit above y = 0 and
      // be clipped away — which is what happened to the first tune of a tunebook, while
      // every later tune looked fine because the tune above had already made room.
      const title = score.metadata.titles[0]
      const heading: LayoutElement[] =
        systemIndex === 0 && voiceIndex === 0 && title !== undefined && title !== ''
          ? [
              {
                type: 'title',
                x: 0,
                width: 0,
                staffSteps: [],
                glyphs: [],
                lines: [],
                texts: [
                  {
                    text: title,
                    x: 0,
                    y: stepToY(ENGRAVE.titleStep),
                    size: ENGRAVE.titleTextSize,
                    bold: true,
                    italic: false,
                  },
                ],
              },
            ]
          : []
      const elements: LayoutElement[] = [
        ...heading,
        ...plan.prefix(withMeter, voiceIndex === 0).elements,
      ]
      const beamGroups = new Map<number, StemInfo[]>()
      const voltaLines: PlacedLine[] = []
      const voltaTexts: PlacedText[] = []
      /** The repeat ending currently open, and where its bracket started. */
      let openVolta: { label: string; startX: number } | null = null

      /**
       * Close the open ending, drawing its bracket.
       *
       * `hooked` is false when the ending simply runs off the end of a system —
       * engraving leaves that end open, because the bracket resumes on the next line.
       */
      const closeVolta = (endX: number, hooked: boolean): void => {
        if (openVolta === null) return
        const y = stepToY(ENGRAVE.voltaStep)
        const thickness = ENGRAVING_DEFAULTS.thinBarlineThickness
        voltaLines.push({ x1: openVolta.startX, y1: y, x2: endX, y2: y, thickness })
        // The opening hook always turns down; the closing one only when the ending
        // really ends here rather than continuing onto the next system.
        voltaLines.push({
          x1: openVolta.startX,
          y1: y,
          x2: openVolta.startX,
          y2: y + ENGRAVE.voltaHook,
          thickness,
        })
        if (hooked) {
          voltaLines.push({ x1: endX, y1: y, x2: endX, y2: y + ENGRAVE.voltaHook, thickness })
        }
        voltaTexts.push({
          text: openVolta.label,
          x: openVolta.startX + 0.4,
          y: y + ENGRAVE.voltaTextSize,
          size: ENGRAVE.voltaTextSize,
          bold: false,
          italic: false,
        })
        openVolta = null
      }

      let x = head

      for (let i = span.start; i < span.end; i++) {
        const block = plan.blocks[i]
        if (block !== undefined) {
          // A new ending closes whatever was open — `|1 … :|2` runs them back to back.
          if (block.volta !== null) {
            closeVolta(x, true)
            openVolta = { label: block.volta, startX: x }
          }
          const base = elements.length
          // JUSTIFY the measure into its column. Scaling each element's ORIGIN by the
          // stretch factor distributes the slack between the notes in proportion to the
          // space each already occupies — which is exactly what stretching springs of
          // different natural widths by a common factor does. Internal geometry is
          // untouched, because `shiftElement` translates a whole element: an accidental
          // stays the same distance from its notehead however far the measure stretches.
          // Only the music stretches; the closing barline is a rod that keeps its
          // distance from the column edge, so barlines stay aligned across staves.
          const column = (columnWidths[i] ?? 0) * justify
          const barSpace = block.width - block.musicWidth
          const stretch =
            block.musicWidth > 0 ? Math.max(0, column - barSpace) / block.musicWidth : 1
          block.elements.forEach((el, index) => {
            const dx =
              index === block.closingBarIndex
                ? x + column - barSpace + ENGRAVE.barGap - el.x
                : x + el.x * (stretch - 1)
            elements.push(shiftElement(el, dx))
          })
          for (const [group, members] of block.beams) {
            const shifted = members.map((m) => ({
              ...m,
              // A stem sits at its element's origin plus an offset within it, so it
              // moves with the element rather than scaling on its own.
              x: m.x * stretch + x,
              element: m.element + base,
            }))
            beamGroups.set(group, [...(beamGroups.get(group) ?? []), ...shifted])
          }
          for (const a of block.anchors) {
            voiceAnchors[voiceIndex]?.push({
              ...a,
              system: systemIndex,
              element: a.element + base,
              left: a.left * stretch + x,
              right: a.right * stretch + x,
            })
          }
        }
        // Advance by the COLUMN, not the block, so every staff stays in step.
        x += (columnWidths[i] ?? 0) * justify
        if (block?.closesVolta) closeVolta(x, true)
      }

      const beams: PlacedLine[] = []
      // Beams last: they retarget stems already placed and need every member's final
      // position. A beam never crosses a barline, so it never crosses a system break.
      for (const group of beamGroups.values()) beams.push(...layoutBeam(group, elements))

      // Curves are NOT resolved here: a slur or tie can span a system break, so it needs
      // every system's anchors, which only exist once the whole tune is packed. Filled
      // in by the pass below.
      // An ending still open at the end of a system runs off it, unhooked.
      closeVolta(x, false)

      // Tuplets resolve here — unlike curves they never span a system, because a beam
      // and a barline both break them long before a line break can.
      const systemAnchors = (voiceAnchors[voiceIndex] ?? []).filter(
        (anchor) => anchor.system === systemIndex,
      )
      const tuplets = layoutTuplets(systemAnchors, elements)
      // Melismas resolve here for the same reason tuplets do, and must run AFTER the
      // elements are final: in strict mode this rewrites the syllable's text in place.
      const melismaLines = layoutMelismas(systemAnchors, elements, strict)

      return {
        elements,
        // One voice per staff until the merge below folds shared staves together.
        voices: [elements],
        staffLines: [],
        beams,
        curves: [],
        tupletLines: tuplets.lines,
        tupletTexts: tuplets.texts,
        voltaLines,
        voltaTexts,
        melismaLines,
        // Filled in after packing, with curves: a hairpin can cross a system break, and
        // resolving it here would silently drop every one that does.
        spannerLines: [],
        originY: 0,
      }
    })

    const musicWidth = head + natural * justify + ENGRAVE.marginX

    /**
     * The drawing has to fit its PROSE too, not just its music.
     *
     * A title is routinely wider than the bar it heads, and a lyric under the last note
     * runs past it. Sizing the system from the music alone clipped both: a 64-character
     * title on a one-bar tune produced a 13-space viewBox with text reaching 77, so most
     * of it was simply cut off the right edge.
     *
     * A title is measured BARE because it has not been centred yet — that happens below,
     * against this width. Everything else is already placed, so it measures from its x.
     */
    const textWidth_ = (t: { text: string; size: number }) => textWidth(t.text, t.size)
    const proseWidth = Math.max(
      0,
      ...staves.flatMap((staff) =>
        staff.elements.flatMap((el) =>
          el.texts.map((t) =>
            el.type === 'title'
              ? textWidth_(t) + 2 * ENGRAVE.marginX
              : t.x + textWidth_(t) + ENGRAVE.marginX,
          ),
        ),
      ),
    )
    const width = Math.max(musicWidth, proseWidth)

    // The title centres on the finished system, whose width is only known now.
    const centred = staves.map((staff, staffIndex) =>
      staffIndex !== 0
        ? staff
        : {
            ...staff,
            elements: staff.elements.map((el) =>
              el.type !== 'title'
                ? el
                : {
                    ...el,
                    texts: el.texts.map((t) => ({
                      ...t,
                      x: Math.max(0, (width - textWidth(t.text, t.size)) / 2),
                    })),
                  },
            ),
          },
    )

    // MERGE the voices that share a staff. Everything above is built per voice, because
    // beams, stems and lyrics are a voice's own; what is shared is the five lines they
    // are printed on. So the drawing is concatenated and one set of staff lines is drawn,
    // rather than each voice getting its own stave.
    const merged = voicesOfStaff.map((members) => {
      const parts = members.map((i) => centred[i]).filter((x) => x !== undefined)
      const first = parts[0]
      if (first === undefined) return centred[0] as (typeof centred)[number]
      if (parts.length === 1) return { ...first, voices: [first.elements] }
      return {
        ...first,
        voices: parts.map((p) => p.elements),
        elements: parts.flatMap((p) => p.elements),
        beams: parts.flatMap((p) => p.beams),
        tupletLines: parts.flatMap((p) => p.tupletLines),
        tupletTexts: parts.flatMap((p) => p.tupletTexts),
        voltaLines: parts.flatMap((p) => p.voltaLines),
        voltaTexts: parts.flatMap((p) => p.voltaTexts),
        melismaLines: parts.flatMap((p) => p.melismaLines),
      }
    })

    // Stack the staves, each measured from its own content so a staff with a tempo mark
    // or high ledger lines gets the room it needs and no more.
    let cursor = 0
    const placed = merged.map((staff) => {
      const extent = verticalExtent(staff.elements, staff.beams)
      const originY = cursor - extent.top
      cursor += extent.bottom - extent.top + ENGRAVE.staffGap
      return { ...staff, staffLines: staffLinesFor(width), originY }
    })

    const connectors = layoutConnectors(score.staves, placed)
    return {
      staves: placed,
      connectorGlyphs: connectors.glyphs,
      connectorLines: connectors.lines,
      width,
      originY: 0,
    }
  })

  // Now that every system exists, resolve each voice's slurs and ties across the whole
  // tune and hand each system its share.
  // Music starts after the widest prefix on the system and ends at its right margin.
  const systemBounds = systems.map((system, i) => ({
    left: headWidth(i === 0),
    right: system.width - ENGRAVE.marginX,
  }))
  const curvesBySystem = voiceAnchors.map((anchors) => layoutCurves(anchors, systemBounds))
  // Hairpins need the same treatment and for the same reason. Resolved per system, they
  // lost HALF the hairpins in S1-decorations tune 2 — it wraps to six systems and the
  // pairs straddle the breaks.
  const spannersBySystem = voiceAnchors.map((anchors) => layoutSpanners(anchors, systemBounds))
  const withCurves = systems.map((system, systemIndex) => ({
    ...system,
    // By STAFF now, not by voice: a shared staff collects the curves and hairpins of
    // every voice on it.
    staves: system.staves.map((staff, staffIndex) => ({
      ...staff,
      curves: (voicesOfStaff[staffIndex] ?? []).flatMap(
        (v) => curvesBySystem[v]?.[systemIndex] ?? [],
      ),
      spannerLines: (voicesOfStaff[staffIndex] ?? []).flatMap(
        (v) => spannersBySystem[v]?.[systemIndex] ?? [],
      ),
    })),
  }))

  // Stack the systems.
  let cursor = 0
  const placed = withCurves.map((system) => {
    const height = systemHeight(system)
    const originY = cursor
    cursor += height + ENGRAVE.systemGap
    return { ...system, originY }
  })

  return {
    systems: placed,
    width: Math.max(0, ...placed.map((s) => s.width)),
    // `cursor` has one trailing gap on it, added after the last system.
    height: Math.max(0, cursor - ENGRAVE.systemGap),
    top: 0,
  }
}

/**
 * Lay out a whole tunebook: several tunes stacked down the page.
 *
 * Each tune is laid out INDEPENDENTLY by `layout` and then translated into place, which
 * is the same trick as systems within a tune and staves within a system, for the same
 * reason — nothing inside a tune depends on how many tunes precede it, so adding a tune
 * at the top cannot shift the geometry of one below.
 *
 * This is not a niche case: 12 of the 41 corpus fixtures hold more than one tune, and
 * `clefs` holds eight. Rendering only the first meant seven of its eight clefs were
 * invisible.
 */
export function layoutBook(scores: readonly Score[], options: LayoutOptions = {}): Layout {
  const systems: LayoutSystem[] = []
  let cursor = 0
  let width = 0

  scores.forEach((score, index) => {
    const tune = layout(score, options)
    for (const system of tune.systems) {
      systems.push({ ...system, originY: system.originY + cursor })
    }
    width = Math.max(width, tune.width)
    cursor += tune.height + (index === scores.length - 1 ? 0 : ENGRAVE.tuneGap)
  })

  return { systems, width, height: cursor, top: 0 }
}

/** A system's full vertical extent, from the top of its first staff's content down. */
function systemHeight(system: LayoutSystem): number {
  let bottom = 0
  for (const staff of system.staves) {
    const extent = verticalExtent(staff.elements, staff.beams)
    bottom = Math.max(bottom, staff.originY + extent.bottom)
  }
  return bottom
}

/**
 * The vertical span of everything drawn, plus a margin.
 *
 * Measured from content rather than assumed, because a fixed margin silently CLIPS: a
 * bass-clef voice written in treble range sits four ledger lines above the staff, well
 * outside any constant, and a tempo mark sits above that again. The bug is invisible in
 * the structural gate, which sees no geometry at all — it shows up only as notes missing
 * from the rendered SVG.
 */
function verticalExtent(
  elements: readonly LayoutElement[],
  beams: readonly PlacedLine[] = [],
): { top: number; bottom: number } {
  // The staff itself is always present, spanning steps 4 to -4.
  let top = stepToY(4)
  let bottom = stepToY(-4)
  const include = (a: number, b: number) => {
    top = Math.min(top, a)
    bottom = Math.max(bottom, b)
  }

  for (const beam of beams) {
    const half = beam.thickness / 2
    include(Math.min(beam.y1, beam.y2) - half, Math.max(beam.y1, beam.y2) + half)
  }

  for (const el of elements) {
    for (const g of el.glyphs) {
      const glyph = GLYPHS[g.name]
      include(g.y + glyph.y, g.y + glyph.y + glyph.height)
    }
    for (const line of el.lines) {
      const half = line.thickness / 2
      include(Math.min(line.y1, line.y2) - half, Math.max(line.y1, line.y2) + half)
    }
    // No text metrics available, so bound the box by the font size: ascenders reach
    // roughly 0.8 of it above the baseline and descenders 0.25 below.
    for (const t of el.texts) include(t.y - t.size * 0.8, t.y + t.size * 0.25)
  }

  return { top: top - ENGRAVE.marginY, bottom: bottom + ENGRAVE.marginY }
}

function layoutEvent(
  event: MusicEvent,
  x: number,
  clef: Clef,
  spacingScale: number,
  forcedUp: boolean | null = null,
  stemOut: { value: Omit<StemInfo, 'element'> | null } | null = null,
  /** `abcjs-strict` — passed through for microtonal accidentals. */
  strict = true,
  /** Voice convention on a SHARED staff; null lets pitch decide. See `stemForVoice`. */
  voiceStem: boolean | null = null,
): LayoutElement | null {
  const advance = naturalWidth(event.duration, spacingScale)
  // The beam's direction wins over the voice convention: a beam cannot join opposed stems,
  // and the beam pass already agreed one direction for the whole group.
  const stem = forcedUp ?? voiceStem
  if (event.type === 'note') {
    return layoutNoteheads(
      [event.pitch],
      event.notatedDuration,
      advance,
      x,
      clef,
      stem,
      stemOut,
      event,
      strict,
    )
  }
  if (event.type === 'chord') {
    return layoutNoteheads(
      event.pitches,
      event.notatedDuration,
      advance,
      x,
      clef,
      stem,
      stemOut,
      event,
      strict,
    )
  }
  return layoutRest(event, advance, x)
}

/**
 * Stem direction for each beam group, decided before anything is drawn.
 *
 * Every stem in a beam must point the same way — a beam cannot join opposed stems — so
 * the decision belongs to the group, not the note. The rule is the usual one: away from
 * the middle line, judged by the note furthest from it, so the beam ends up on the side
 * with the most room.
 */
function beamDirections(voice: Voice | undefined, clef: Clef): Map<number, boolean> {
  const extremes = new Map<number, { min: number; max: number }>()
  for (const measure of voice?.measures ?? []) {
    for (const event of measure.events) {
      if (event.type === 'rest' || event.beamGroup === null) continue
      const pitches = event.type === 'chord' ? event.pitches : [event.pitch]
      for (const pitch of pitches) {
        const step = pitchToStep(pitch, clef)
        const seen = extremes.get(event.beamGroup)
        if (seen === undefined) extremes.set(event.beamGroup, { min: step, max: step })
        else {
          seen.min = Math.min(seen.min, step)
          seen.max = Math.max(seen.max, step)
        }
      }
    }
  }

  const directions = new Map<number, boolean>()
  for (const [group, { min, max }] of extremes) {
    // Whichever extreme is further from the middle line decides; ties go stem-down.
    directions.set(group, Math.abs(min) > Math.abs(max) ? min < 0 : max < 0)
  }
  return directions
}
