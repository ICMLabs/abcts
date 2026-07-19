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
  type Mode,
  type MusicEvent,
  type Note,
  type Pitch,
  type Rational,
  type Rest,
  ratToNumber,
  type Score,
  stepIndex,
  type Tempo,
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
   * Staff step of the notehead — 0 is the middle line, positive is upward. `null` for
   * anything unpitched. This is the field that makes the structural gate meaningful:
   * it says which line or space the note actually landed on.
   */
  readonly staffStep: number | null
  readonly glyphs: readonly PlacedGlyph[]
  readonly lines: readonly PlacedLine[]
  readonly texts: readonly PlacedText[]
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
    staffStep: null,
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
    staffStep: null,
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
    staffStep: null,
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
  return { type: 'tempo', x, width: 0, staffStep: null, glyphs, lines, texts }
}

/**
 * A `P:` part label above the staff. Zero width, like the tempo mark and for the same
 * reason: abcjs reports `w: 0`, and a label must not push the music it labels.
 */
const layoutPart = (x: number, label: string): LayoutElement => ({
  type: 'part',
  x,
  width: 0,
  staffStep: null,
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
  x: number,
  clef: Clef,
): LayoutElement {
  // abcjs reports a chord's heads lowest-first and the structural gate keys on heads[0],
  // so the element's staffStep must be the LOWEST notehead, not the first written.
  const steps = pitches.map((p) => pitchToStep(p, clef)).sort((a, b) => a - b)
  const lowest = steps[0] ?? 0
  const highest = steps[steps.length - 1] ?? 0
  const spec = noteGlyph(notated)

  if (spec === null || steps.length === 0) {
    // Unsupported duration — see noteGlyph. Emit the position with no ink rather than
    // the wrong notehead, so the gap is visible in output and in the gate.
    return {
      type: 'note',
      x,
      width: ENGRAVE.noteAdvance,
      staffStep: lowest,
      glyphs: [],
      lines: [],
      texts: [],
    }
  }

  const head = GLYPHS[spec.head]
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []

  // Stem direction follows the chord as a whole: away from the middle line, judged by
  // the midpoint of its outermost notes. On the middle line itself the stem goes down.
  const up = (lowest + highest) / 2 < 0

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

    // ponytail: flags unrendered — the glyphs are extracted and the count is computed,
    // but nothing places them, because beaming decides whether a flag is drawn at all
    // and beaming is not built. An unbeamed eighth currently draws as a stemmed black
    // notehead. Wire up when the first fixture with unbeamed eighths lands.
  }

  // A head displaced across the stem widens the element.
  const spread = Math.max(0, ...[...offsets.values()].map(Math.abs))
  return {
    type: 'note',
    x,
    width: accidentalWidth + spread + ENGRAVE.noteAdvance,
    staffStep: lowest,
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
    texts: [],
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
  // A voice's own `clef=` wins over the tune's `K:` clef; treble is the fallback.
  const clef = voice?.clef ?? score.clef
  const elements: LayoutElement[] = []
  let x = ENGRAVE.marginX

  const clefElement = layoutClef(x, clef)
  if (clefElement !== null) {
    elements.push(clefElement)
    x += clefElement.width + ENGRAVE.prefixGap
  }

  // Clef, then key, then meter — the fixed order of a staff prefix.
  const keySig = layoutKeySignature(x, score.key, clef)
  if (keySig !== null) {
    elements.push(keySig)
    x += keySig.width + ENGRAVE.prefixGap
  }

  if (score.meter !== null) {
    const meter = layoutMeter(x, score.meter.numerator, score.meter.denominator)
    elements.push(meter)
    x += meter.width + ENGRAVE.prefixGap
  }

  if (score.tempo !== null) {
    const tempo = layoutTempo(x, score.tempo)
    // Zero width, so it does not advance the cursor — the mark floats above the music.
    if (tempo !== null) elements.push(tempo)
  }

  for (const measure of voice?.measures ?? []) {
    // An opening `|:` or `[|` prints before the measure it belongs to, and is a SEPARATE
    // barline from the previous measure's closer — a line ending `:|` followed by one
    // starting `|:` draws two.
    // The label precedes the barline that opens its part.
    if (measure.partLabel !== null) elements.push(layoutPart(x, measure.partLabel))
    if (measure.openingBarline !== null) {
      x += ENGRAVE.barGap
      elements.push(layoutBar(x))
      x += ENGRAVE.barGap
    }
    for (const event of measure.events) {
      const el = layoutEvent(event, x, clef)
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

  const { top, bottom } = verticalExtent(elements)
  return {
    systems: [{ elements, staffLines }],
    width,
    height: bottom - top,
    top,
  }
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
function verticalExtent(elements: readonly LayoutElement[]): { top: number; bottom: number } {
  // The staff itself is always present, spanning steps 4 to -4.
  let top = stepToY(4)
  let bottom = stepToY(-4)
  const include = (a: number, b: number) => {
    top = Math.min(top, a)
    bottom = Math.max(bottom, b)
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

function layoutEvent(event: MusicEvent, x: number, clef: Clef): LayoutElement | null {
  if (event.type === 'note') return layoutNoteheads([event.pitch], event.notatedDuration, x, clef)
  if (event.type === 'chord') return layoutNoteheads(event.pitches, event.notatedDuration, x, clef)
  return layoutRest(event, x)
}
