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
  type MusicEvent,
  type Note,
  type Pitch,
  type Rational,
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

export type ElementType = 'clef' | 'timeSignature' | 'note' | 'rest' | 'bar'

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
 * ponytail: notes only. Rests and chords return null and lay out as nothing — the rest
 * glyphs are extracted and ready, but no gated fixture in the first slice has one.
 */
function layoutEvent(event: MusicEvent, x: number): LayoutElement | null {
  return event.type === 'note' ? layoutNote(event, x) : null
}
