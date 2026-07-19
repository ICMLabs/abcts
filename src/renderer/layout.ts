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
  type DiatonicStep,
  type KeySignature,
  type Mode,
  type MusicEvent,
  type Note,
  type Pitch,
  type Rational,
  type Rest,
  ratToNumber,
  type Score,
  stepIndex,
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
  /**
   * Horizontal advance allotted to a note.
   *
   * ponytail: flat, duration-independent spacing — a half note takes the same width as
   * an eighth. Legible for the single-duration fixtures, and wrong the moment a tune
   * mixes durations in a bar. Upgrade path is the Gourlay/LilyPond spring-and-rod model
   * abcMusicKit2 uses (EngravingConstants "GOLDEN note-spacing calibration"); do it when
   * a mixed-duration fixture makes the spacing visibly wrong, not before.
   */
  noteAdvance: 3.5,
  /** Space either side of a barline. PROVISIONAL. */
  barGap: 1.0,
} as const

// ─── Layout model ────────────────────────────────────────────────────────────

export type ElementType = 'clef' | 'keySignature' | 'timeSignature' | 'note' | 'rest' | 'bar'

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

export interface LayoutElement {
  readonly type: ElementType
  /** Left edge, staff spaces from the system origin. */
  readonly x: number
  readonly width: number
  /**
   * Staff step of the notehead — 0 is the middle line, positive is upward. `null` for
   * anything unpitched. This is the field that makes the structural gate meaningful:
   * it says which line or space the note actually landed on.
   */
  readonly staffStep: number | null
  readonly glyphs: readonly PlacedGlyph[]
  readonly lines: readonly PlacedLine[]
}

export interface LayoutSystem {
  readonly elements: readonly LayoutElement[]
  readonly staffLines: readonly PlacedLine[]
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
 * ponytail: treble clef assumed. The model carries no clef yet — the parser reads
 * `V:… clef=` as an unparsed token — so there is nothing to branch on. When clef lands
 * in the model this becomes a per-clef offset and nothing else here changes.
 */
const MIDDLE_LINE_INDEX = 34 // B4

const pitchToStep = (p: Pitch): number => diatonicIndex(p) - MIDDLE_LINE_INDEX

// ─── Duration → notehead ─────────────────────────────────────────────────────

interface NoteGlyphSpec {
  readonly head: GlyphName
  readonly stemmed: boolean
  /** Number of flags: 1 for an eighth, 2 for a sixteenth, 0 for a quarter or longer. */
  readonly flags: number
}

/**
 * Written duration → notehead, stem and flag count.
 *
 * Returns `null` for a duration that is not a plain power of two — a dotted or tuplet
 * value. Callers must handle that rather than fall back to a quarter: silently drawing a
 * dotted half as a half is wrong OUTPUT, which is worse than an absent feature, and it
 * would not trip a gate that only checks staff positions.
 *
 * ponytail: dots and tuplet-scaled durations unhandled. Add when a fixture needs them.
 */
export function noteGlyph(notated: Rational): NoteGlyphSpec | null {
  const whole = ratToNumber(notated)
  if (!(whole > 0)) return null
  if (whole >= 1) return { head: 'noteheadWhole', stemmed: false, flags: 0 }

  // 1/2 → 1, 1/4 → 2, 1/8 → 3 …; non-integral means it is not a plain power of two.
  const log = Math.log2(1 / whole)
  if (!Number.isInteger(log)) return null

  if (log === 1) return { head: 'noteheadHalf', stemmed: true, flags: 0 }
  return { head: 'noteheadBlack', stemmed: true, flags: Math.max(0, log - 2) }
}

// ─── Element builders ────────────────────────────────────────────────────────

const glyphAt = (name: GlyphName, x: number, step: number): PlacedGlyph => ({
  name,
  x,
  y: stepToY(step),
})

function layoutClef(x: number): LayoutElement {
  // The gClef origin sits on the line its curl encircles: G4, two steps below B4.
  const glyph = GLYPHS.gClef
  return {
    type: 'clef',
    x,
    width: glyph.advance,
    staffStep: null,
    glyphs: [glyphAt('gClef', x, -2)],
    lines: [],
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
    staffStep: null,
    glyphs: [...digitGlyphs(top, centre, 2), ...digitGlyphs(bottom, centre, -2)],
    lines: [],
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

function layoutKeySignature(x: number, key: KeySignature): LayoutElement | null {
  const fifths = keyFifths(key)
  if (fifths === 0) return null // C major and K:none both draw nothing.

  const sharps = fifths > 0
  const steps = (sharps ? SHARP_STEPS : FLAT_STEPS).slice(0, Math.abs(fifths))
  const name: GlyphName = sharps ? 'accidentalSharp' : 'accidentalFlat'
  const pitch = GLYPHS[name].advance + ENGRAVE.keySignatureGap

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: steps.length * pitch - ENGRAVE.keySignatureGap,
    staffStep: null,
    glyphs: steps.map((step, i) => glyphAt(name, x + i * pitch, step)),
    lines: [],
  }
}

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
function restGlyph(notated: Rational): { name: GlyphName; step: number } | null {
  const whole = ratToNumber(notated)
  if (!(whole > 0)) return null
  if (whole >= 1) return { name: 'restWhole', step: 2 }

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
  return { name, step: name === 'restHalf' ? 0 : 0 }
}

function layoutRest(rest: Rest, x: number): LayoutElement {
  // `x` and `y` occupy horizontal space but print nothing; a spacer prints nothing and
  // is not even a rest musically. Both still advance, so following notes stay put.
  const invisible = rest.kind === 'invisible' || rest.kind === 'invisibleMultiMeasure'
  const spec = invisible || rest.kind === 'spacer' ? null : restGlyph(rest.notatedDuration)

  return {
    type: 'rest',
    x,
    width: ENGRAVE.noteAdvance,
    staffStep: null,
    glyphs: spec ? [glyphAt(spec.name, x, spec.step)] : [],
    lines: [],
  }
}

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

function layoutNote(note: Note, x: number): LayoutElement {
  const step = pitchToStep(note.pitch)
  const spec = noteGlyph(note.notatedDuration)
  if (spec === null) {
    // Unsupported duration — see noteGlyph. Emit the position with no ink rather than
    // the wrong notehead, so the gap is visible in output and in the gate.
    return { type: 'note', x, width: ENGRAVE.noteAdvance, staffStep: step, glyphs: [], lines: [] }
  }

  const head = GLYPHS[spec.head]
  const glyphs: PlacedGlyph[] = [glyphAt(spec.head, x, step)]
  const lines: PlacedLine[] = ledgerLines(step, x, head.width)

  if (spec.stemmed) {
    // Stems point away from the middle line, so the note stays near the staff. On the
    // middle line itself the stem goes down, by convention.
    const up = step < 0
    const anchor = up ? head.anchors.stemUpSE : head.anchors.stemDownNW
    const [ax, ay] = anchor ?? [up ? head.width : 0, 0]
    const stemX = x + ax
    const base = stepToY(step) + ay
    const tip = base + (up ? -ENGRAVE.stemLength : ENGRAVE.stemLength)
    lines.push({
      x1: stemX,
      y1: base,
      x2: stemX,
      y2: tip,
      thickness: ENGRAVING_DEFAULTS.stemThickness,
    })

    // ponytail: flags unrendered — the glyphs are extracted and the count is computed,
    // but nothing places them, because beaming decides whether a flag is drawn at all
    // and beaming is not built. An unbeamed eighth currently draws as a stemmed black
    // notehead. Wire up when the first fixture with unbeamed eighths lands.
  }

  return { type: 'note', x, width: ENGRAVE.noteAdvance, staffStep: step, glyphs, lines }
}

function layoutBar(x: number): LayoutElement {
  // ponytail: thin barline only. Repeats, doubles and finals are in the model as
  // `Measure.closingBarline`; draw them when a fixture exercises them.
  const thickness = ENGRAVING_DEFAULTS.thinBarlineThickness
  return {
    type: 'bar',
    x,
    width: thickness,
    staffStep: null,
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
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Lay out a score.
 *
 * ponytail: first voice only, one system, no line breaking — the whole tune goes on one
 * staff however wide that gets. Multi-voice and system breaking are the next two slices;
 * both are layout-only changes that this element model already accommodates.
 */
export function layout(score: Score): Layout {
  const voice = score.voices[0]
  const elements: LayoutElement[] = []
  let x = ENGRAVE.marginX

  elements.push(layoutClef(x))
  x += GLYPHS.gClef.advance + ENGRAVE.prefixGap

  // Clef, then key, then meter — the fixed order of a staff prefix.
  const keySig = layoutKeySignature(x, score.key)
  if (keySig !== null) {
    elements.push(keySig)
    x += keySig.width + ENGRAVE.prefixGap
  }

  if (score.meter !== null) {
    const meter = layoutMeter(x, score.meter.numerator, score.meter.denominator)
    elements.push(meter)
    x += meter.width + ENGRAVE.prefixGap
  }

  for (const measure of voice?.measures ?? []) {
    for (const event of measure.events) {
      const el = layoutEvent(event, x)
      if (el === null) continue
      elements.push(el)
      x += el.width
    }
    if (measure.closingBarline !== null) {
      x += ENGRAVE.barGap
      elements.push(layoutBar(x))
      x += ENGRAVE.barGap
    }
  }

  const width = x + ENGRAVE.marginX
  const staffLines = ENGRAVE.staffLineSteps.map((step) => ({
    x1: 0,
    y1: stepToY(step),
    x2: width,
    y2: stepToY(step),
    thickness: ENGRAVING_DEFAULTS.staffLineThickness,
  }))

  return {
    systems: [{ elements, staffLines }],
    width,
    height: ENGRAVE.marginY * 2,
    top: -ENGRAVE.marginY,
  }
}

/**
 * ponytail: chords lay out as nothing. A chord is a note element with N noteheads plus
 * second-interval offsetting, so it is a real slice of work rather than a line here.
 */
function layoutEvent(event: MusicEvent, x: number): LayoutElement | null {
  if (event.type === 'note') return layoutNote(event, x)
  if (event.type === 'rest') return layoutRest(event, x)
  return null
}
