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
  type Clef,
  type ClefShape,
  type DiatonicStep,
  defaultClef,
  type KeySignature,
  type Measure,
  type Mode,
  type MusicEvent,
  type Pitch,
  type Rational,
  type Rest,
  rational,
  ratToNumber,
  type Score,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import { ENGRAVING_DEFAULTS, GLYPHS, type GlyphName } from './glyphs.js'

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
   * Staff steps for the two marks that sit above the staff (top line is step 4).
   *
   * Four steps apart, which is two staff spaces — enough that 1.6-space text does not
   * collide when a tune carries both, as `full-song-template` does. ponytail: fixed
   * lanes, not a skyline pass. Real engraving stacks whatever is present and closes the
   * gap when something is absent; with exactly two kinds of mark, lanes are the smaller
   * correct answer. Revisit when a third joins them.
   */
  tempoStep: 10,
  partStep: 6,
  /** Tempo text size, in staff spaces. PROVISIONAL. */
  tempoTextSize: 1.6,
  /**
   * A stem shortened to meet a beam never drops below this. *Behind Bars* keeps beamed
   * stems from collapsing to stubs. PROVISIONAL.
   */
  minStemLength: 2.5,
  /** Maximum total vertical rise of a sloped beam across its span. *Behind Bars*. */
  beamMaxRise: 2.0,
  /** Length of a secondary-beam stub on a note whose neighbours lack that level. */
  beamStubLength: 1.1,
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
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'tempo'
  | 'part'
  | 'note'
  | 'rest'
  | 'bar'

export interface PlacedGlyph {
  readonly name: GlyphName
  readonly x: number
  readonly y: number
}

export interface PlacedLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly thickness: number
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
export interface LayoutStaff {
  readonly elements: readonly LayoutElement[]
  readonly staffLines: readonly PlacedLine[]
  /**
   * Beams, which belong to no single element — a beam spans several noteheads and is
   * drawn once for the group, after every member's position is known. Per staff, since
   * a beam never joins two voices.
   */
  readonly beams: readonly PlacedLine[]
  /** Vertical offset of this staff's middle line within its system. */
  readonly originY: number
}

export interface LayoutSystem {
  /** One per voice, in score order, top to bottom. */
  readonly staves: readonly LayoutStaff[]
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
    out.push(glyphAt('augmentationDot', x + i * ENGRAVE.dotSpacing, dotStep))
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
export function naturalWidth(duration: Rational): number {
  const d = ratToNumber(duration)
  if (!(d > 0)) return ENGRAVE.minColumnGap
  return Math.max(
    ENGRAVE.minColumnGap,
    ENGRAVE.spacingScale * Math.sqrt(d / ENGRAVE.spacingReference),
  )
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
    // ponytail: no text metrics, so the advance past a direction is estimated at half
    // the font size per character. Only affects where the `=120` that may follow lands.
    // Real metrics need a measured font; revisit if a fixture looks wrong.
    cursor += tempo.text.length * ENGRAVE.tempoTextSize * 0.5 + 1
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
const ACCIDENTAL_GLYPHS: Readonly<Record<Accidental, GlyphName>> = {
  [Accidental.doubleFlat]: 'accidentalDoubleFlat',
  [Accidental.flat]: 'accidentalFlat',
  [Accidental.natural]: 'accidentalNatural',
  [Accidental.sharp]: 'accidentalSharp',
  [Accidental.doubleSharp]: 'accidentalDoubleSharp',
}

export const accidentalGlyph = (accidental: Accidental | null): GlyphName | null =>
  accidental === null ? null : ACCIDENTAL_GLYPHS[accidental]

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

  const head = GLYPHS[spec.head]
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []

  // Stem direction follows the chord as a whole: away from the middle line, judged by
  // the midpoint of its outermost notes. On the middle line itself the stem goes down.
  // A beamed note takes its group's direction instead — a beam cannot join opposed stems.
  const up = forcedUp ?? (lowest + highest) / 2 < 0

  // Accidentals sit in a column before the heads and push everything right. ponytail:
  // ONE column. Real engraving fans accidentals into several columns when they would
  // collide; with the heads at distinct steps they only collide for a cluster, and no
  // corpus fixture has one.
  const accidentals = pitches
    .map((p) => ({ glyph: accidentalGlyph(p.accidental), step: pitchToStep(p, clef) }))
    .filter((a): a is { glyph: GlyphName; step: number } => a.glyph !== null)

  const accidentalWidth =
    accidentals.length === 0
      ? 0
      : Math.max(...accidentals.map((a) => GLYPHS[a.glyph].advance)) + ENGRAVE.accidentalGap

  for (const a of accidentals) glyphs.push(glyphAt(a.glyph, x, a.step))
  const headX = x + accidentalWidth

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

  for (const step of steps) {
    const dx = offsets.get(step) ?? 0
    glyphs.push(glyphAt(spec.head, headX + dx, step))
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
    })

    if (stemOut !== null) {
      // Beamed: the beam pass retargets this stem and draws the beams. No flag — a note
      // cannot carry both.
      stemOut.value = { x: stemX, farStep: up ? highest : lowest, up, beams: spec.flags }
    } else if (spec.flags > 0) {
      // Unbeamed: a flag per level, hung from the stem tip. The glyph is drawn from the
      // tip, and SMuFL's up and down flags are separate designs rather than a reflection.
      const flag: GlyphName | null =
        spec.flags === 1 ? (up ? 'flag8thUp' : 'flag8thDown') : up ? 'flag16thUp' : 'flag16thDown'
      // ponytail: 32nds and shorter reuse the 16th flag — the extracted set stops there.
      // Two flags is already rare in the corpus; extend gen-glyphs when one appears.
      if (flag !== null) glyphs.push({ name: flag, x: stemX, y: tip })
    }
  }

  // The spring is the natural width, but ink is a rod: an accidental, a displaced head
  // or a dot column must never be crushed by a short duration, so the element is at
  // least as wide as what it draws plus the minimum gap.
  const spread = Math.max(0, ...[...offsets.values()].map(Math.abs), dotWidth)
  const ink = accidentalWidth + spread + head.width + ENGRAVE.minColumnGap
  return {
    type: 'note',
    x,
    width: Math.max(advance, ink),
    staffSteps: steps,
    glyphs,
    lines,
    texts: [],
  }
}

function layoutBar(x: number): LayoutElement {
  // ponytail: thin barline only. Repeats, doubles and finals are in the model as
  // `Measure.closingBarline`; draw them when a fixture exercises them.
  const thickness = ENGRAVING_DEFAULTS.thinBarlineThickness
  return {
    type: 'bar',
    x,
    width: thickness,
    staffSteps: [],
    glyphs: [],
    lines: [
      {
        x1: x,
        y1: stepToY(4),
        x2: x,
        y2: stepToY(-4),
        thickness,
      },
    ],
    texts: [],
  }
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
 * ponytail: first voice only, one system, no line breaking — the whole tune goes on one
 * staff however wide that gets. Multi-voice and system breaking are the next two slices;
 * both are layout-only changes that this element model already accommodates.
 */
export interface LayoutOptions {
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
): MeasureBlock {
  const elements: LayoutElement[] = []
  const beams = new Map<number, StemInfo[]>()
  let x = 0

  // The label precedes the barline that opens its part.
  if (measure.partLabel !== null) elements.push(layoutPart(x, measure.partLabel))
  // An opening `|:` or `[|` prints before the measure it belongs to, and is a SEPARATE
  // barline from the previous measure's closer.
  if (measure.openingBarline !== null) {
    x += ENGRAVE.barGap
    elements.push(layoutBar(x))
    x += ENGRAVE.barGap
  }

  for (const event of measure.events) {
    const group = event.type === 'rest' ? null : event.beamGroup
    const stemOut: { value: Omit<StemInfo, 'element'> | null } | null =
      group === null ? null : { value: null }
    const el = layoutEvent(
      event,
      x,
      clef,
      group === null ? null : (directions.get(group) ?? null),
      stemOut,
    )
    if (el === null) continue
    if (group !== null && stemOut?.value) {
      const members = beams.get(group) ?? []
      members.push({ ...stemOut.value, element: elements.length })
      beams.set(group, members)
    }
    elements.push(el)
    x += el.width
  }

  let closingBarIndex: number | null = null
  const musicWidth = x
  if (measure.closingBarline !== null) {
    x += ENGRAVE.barGap
    closingBarIndex = elements.length
    elements.push(layoutBar(x))
    x += ENGRAVE.barGap
  }

  return { elements, width: x, beams, closingBarIndex, musicWidth }
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
  const voices = score.voices.length > 0 ? score.voices : [undefined]

  const plans: VoicePlan[] = voices.map((voice) => {
    // A voice's own `clef=` wins over the tune's `K:` clef; treble is the fallback.
    const clef = voice?.clef ?? score.clef
    const directions = beamDirections(voice, clef)
    const blocks = (voice?.measures ?? []).map((measure) =>
      layoutMeasure(measure, clef, directions),
    )

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
      const elements: LayoutElement[] = [...plan.prefix(withMeter, voiceIndex === 0).elements]
      const beamGroups = new Map<number, StemInfo[]>()
      let x = head

      for (let i = span.start; i < span.end; i++) {
        const block = plan.blocks[i]
        if (block !== undefined) {
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
        }
        // Advance by the COLUMN, not the block, so every staff stays in step.
        x += (columnWidths[i] ?? 0) * justify
      }

      const beams: PlacedLine[] = []
      // Beams last: they retarget stems already placed and need every member's final
      // position. A beam never crosses a barline, so it never crosses a system break.
      for (const group of beamGroups.values()) beams.push(...layoutBeam(group, elements))

      return { elements, staffLines: [], beams, originY: 0 }
    })

    const width = head + natural * justify + ENGRAVE.marginX

    // Stack the staves, each measured from its own content so a staff with a tempo mark
    // or high ledger lines gets the room it needs and no more.
    let cursor = 0
    const placed = staves.map((staff) => {
      const extent = verticalExtent(staff.elements, staff.beams)
      const originY = cursor - extent.top
      cursor += extent.bottom - extent.top + ENGRAVE.staffGap
      return { ...staff, staffLines: staffLinesFor(width), originY }
    })

    return { staves: placed, width, originY: 0 }
  })

  // Stack the systems.
  let cursor = 0
  const placed = systems.map((system) => {
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
  forcedUp: boolean | null = null,
  stemOut: { value: Omit<StemInfo, 'element'> | null } | null = null,
): LayoutElement | null {
  const advance = naturalWidth(event.duration)
  if (event.type === 'note') {
    return layoutNoteheads(
      [event.pitch],
      event.notatedDuration,
      advance,
      x,
      clef,
      forcedUp,
      stemOut,
    )
  }
  if (event.type === 'chord') {
    return layoutNoteheads(
      event.pitches,
      event.notatedDuration,
      advance,
      x,
      clef,
      forcedUp,
      stemOut,
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
