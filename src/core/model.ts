/**
 * Core music model — TypeScript translation of abcMusicKit2's `abcMusicKit2Core`.
 *
 * Deliberate deviations from the Swift original, both flagged in ARCHITECTURE.md:
 *  - Source offsets are UTF-16 (JS-native string indices), not UTF-8 bytes. This also
 *    makes them directly comparable to abcjs `startChar`/`endChar`.
 *  - Swift `Optional` is modelled as `| null`, never `?:`. `exactOptionalPropertyTypes`
 *    makes an omitted property and an explicit `undefined` different types; null sidesteps
 *    that and survives a JSON round-trip.
 */

// ─── Rational ────────────────────────────────────────────────────────────────
// Durations are exact rationals, never floats. This is a locked decision in
// abcMusicKit2 and one of the abcjs bugs core exists to fix: abcjs stores
// duration as a double, so a triplet eighth is 0.041666666666666664.

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

export interface Rational {
  readonly numerator: number
  readonly denominator: number
}

/** Always reduced with a positive denominator, so equality is structural. */
export function rational(numerator: number, denominator = 1): Rational {
  if (denominator === 0) throw new Error('rational: zero denominator')
  const sign = denominator < 0 ? -1 : 1
  const divisor = gcd(numerator, denominator) || 1
  return { numerator: (sign * numerator) / divisor, denominator: (sign * denominator) / divisor }
}

export const ratMul = (a: Rational, b: Rational): Rational =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator)

export const ratAdd = (a: Rational, b: Rational): Rational =>
  rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator)

export const ratEq = (a: Rational, b: Rational): boolean =>
  a.numerator === b.numerator && a.denominator === b.denominator

export const ratLt = (a: Rational, b: Rational): boolean =>
  a.numerator * b.denominator < b.numerator * a.denominator

/** Lossy — for comparison against abcjs goldens only, never for internal math. */
export const ratToNumber = (r: Rational): number => r.numerator / r.denominator

// ─── Pitch ───────────────────────────────────────────────────────────────────

export type DiatonicStep = 'c' | 'd' | 'e' | 'f' | 'g' | 'a' | 'b'

const STEPS: readonly DiatonicStep[] = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
const SEMITONES_ABOVE_C: Record<DiatonicStep, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}
const CIRCLE_OF_FIFTHS: Record<DiatonicStep, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: -1,
  g: 1,
  a: 3,
  b: 5,
}

export const stepIndex = (step: DiatonicStep): number => STEPS.indexOf(step)
export const semitonesAboveC = (step: DiatonicStep): number => SEMITONES_ABOVE_C[step]

/** Numeric so it doubles as the semitone alteration. */
export const Accidental = {
  doubleFlat: -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  doubleSharp: 2,
} as const
export type Accidental = (typeof Accidental)[keyof typeof Accidental]

export interface Pitch {
  readonly step: DiatonicStep
  /** Scientific octave — middle C is C4. */
  readonly octave: number
  /** `null` means "inherit from the key signature". Key resolution is deferred to engrave. */
  readonly accidental: Accidental | null
}

/** Ignores the key signature — an unaltered pitch reads as natural. */
export const midiNoteIgnoringKey = (p: Pitch): number =>
  12 * (p.octave + 1) + semitonesAboveC(p.step) + (p.accidental ?? 0)

export interface PitchClass {
  readonly step: DiatonicStep
  readonly accidental: Accidental
}

// ─── Key signature ───────────────────────────────────────────────────────────
// Derived from the circle of fifths, never stored as an accidental list.

export type Mode =
  | 'major'
  | 'ionian'
  | 'mixolydian'
  | 'dorian'
  | 'minor'
  | 'aeolian'
  | 'phrygian'
  | 'locrian'
  | 'lydian'

const MODE_FIFTHS_OFFSET: Record<Mode, number> = {
  major: 0,
  ionian: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  aeolian: -3,
  phrygian: -4,
  locrian: -5,
  lydian: 1,
}

export interface KeySignature {
  readonly tonic: PitchClass
  readonly mode: Mode
}

export const keyFifths = (key: KeySignature): number =>
  CIRCLE_OF_FIFTHS[key.tonic.step] + 7 * key.tonic.accidental + MODE_FIFTHS_OFFSET[key.mode]

const SHARP_ORDER: readonly DiatonicStep[] = ['f', 'c', 'g', 'd', 'a', 'e', 'b']
const FLAT_ORDER: readonly DiatonicStep[] = ['b', 'e', 'a', 'd', 'g', 'c', 'f']

/** Which steps the key alters, in F-C-G-D-A-E-B order. */
export function keyAlterations(key: KeySignature): ReadonlyMap<DiatonicStep, Accidental> {
  const fifths = keyFifths(key)
  const out = new Map<DiatonicStep, Accidental>()
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER
  const alteration: Accidental = fifths >= 0 ? Accidental.sharp : Accidental.flat
  for (let i = 0; i < Math.min(Math.abs(fifths), 7); i++) {
    const step = order[i]
    if (step) out.set(step, alteration)
  }
  return out
}

// ─── Meter ───────────────────────────────────────────────────────────────────

export type MeterSymbol = 'numeric' | 'common' | 'cut'

export interface Meter {
  readonly numerator: number
  readonly denominator: number
  readonly symbol: MeterSymbol
}

export const measureDuration = (m: Meter): Rational => rational(m.numerator, m.denominator)

// ─── Events ──────────────────────────────────────────────────────────────────

export type NoteStyle = 'normal' | 'x' | 'harmonic' | 'triangle' | 'rhythm'

/** Membership in a tuplet group. `number` is the p in `(p`, drawn over the bracket. */
export interface TupletMark {
  /** Tune-unique id, so adjacent tuplets of the same size stay distinguishable. */
  readonly group: number
  readonly number: number
}

/** A compound meter beats in threes — 6/8, 9/8, 12/8 — which changes the default tuplet q. */
export const isCompoundMeter = (m: Meter): boolean =>
  m.numerator % 3 === 0 && m.numerator > 3 && [4, 8, 16].includes(m.denominator)

export interface Note {
  readonly type: 'note'
  readonly pitch: Pitch
  /** Sounding duration — includes tuplet scaling. */
  readonly duration: Rational
  /** Written duration — length and dots, excluding any tuplet ratio. */
  readonly notatedDuration: Rational
  /** `-` ties this event into the next; they sound as one. */
  readonly tiedToNext: boolean
  /** How many slurs open on this event, and how many close on it. */
  readonly slurStarts: number
  readonly slurEnds: number
  /** `{gfe}` ornament pitches played before this event; empty means none. */
  readonly graceNotes: readonly Pitch[]
  /** `{/g}` — an acciaccatura, drawn with a slash through the stem. */
  readonly graceSlash: boolean
  /** Shared id across a beamed run; null when this event beams with nothing. */
  readonly beamGroup: number | null
  /** First-verse syllable sung on this event, if any. */
  readonly lyric: string | null
  readonly lyricSourceRange: SourceRange | null
  /** Verses 2..n, parallel and positional — null where a verse skips this event. */
  readonly extraVerses: readonly (string | null)[]
  readonly style: NoteStyle
  /**
   * Microtonal detune in cents from a fractional accidental — `^/` is +50, `_/` is -50,
   * `^3/2` is +150. The printed accidental stays the base sign; this is the sounding
   * deviation, realized as a MIDI pitch bend. 0 means none.
   */
  readonly microtoneCents: number
  readonly tuplet: TupletMark | null
  /** `"Am7"` printed above the staff, if one precedes this event. */
  readonly chordSymbol: string | null
  readonly chordSymbolSourceRange: SourceRange | null
  /** `!trill!`, `.` staccato, and the shorthand letters. */
  readonly decorations: readonly string[]
  /** Parallel to `decorations`. */
  readonly decorationSourceRanges: readonly SourceRange[]
  /** `"^above"` / `"_below"` free text, which is NOT a chord symbol. */
  readonly annotations: readonly string[]
  /** Parallel to `annotations`. */
  readonly annotationSourceRanges: readonly SourceRange[]
  readonly sourceRange: SourceRange | null
}

export type RestKind = 'normal' | 'invisible' | 'multiMeasure' | 'invisibleMultiMeasure' | 'spacer'

export interface Rest {
  readonly type: 'rest'
  readonly duration: Rational
  readonly notatedDuration: Rational
  readonly kind: RestKind
  readonly tuplet: TupletMark | null
  readonly sourceRange: SourceRange | null
}

/**
 * Notes sounding simultaneously — one event, N pitches.
 *
 * Both references group rather than flatten (v1 `ChordModel.notes`, v2 `Chord.pitches`),
 * and grouping is what makes per-note audition possible: a consumer iterates `pitches` to
 * audition one notehead, or plays them together for the chord. Flattening to N separate
 * notes would lose the simultaneity that distinguishes a chord from a melody.
 */
export interface Chord {
  readonly type: 'chord'
  readonly pitches: readonly Pitch[]
  readonly duration: Rational
  readonly notatedDuration: Rational
  /** `-` ties this event into the next; they sound as one. */
  readonly tiedToNext: boolean
  /** How many slurs open on this event, and how many close on it. */
  readonly slurStarts: number
  readonly slurEnds: number
  /** `{gfe}` ornament pitches played before this event; empty means none. */
  readonly graceNotes: readonly Pitch[]
  /** `{/g}` — an acciaccatura, drawn with a slash through the stem. */
  readonly graceSlash: boolean
  /** Shared id across a beamed run; null when this event beams with nothing. */
  readonly beamGroup: number | null
  /** First-verse syllable sung on this event, if any. */
  readonly lyric: string | null
  readonly lyricSourceRange: SourceRange | null
  /** Verses 2..n, parallel and positional — null where a verse skips this event. */
  readonly extraVerses: readonly (string | null)[]
  readonly style: NoteStyle
  /**
   * Per-notehead notated durations for a mixed-length chord (`[C2G]` → half + quarter),
   * parallel to `pitches`. Empty when uniform. Visual only — stems, flags and sounding
   * duration all follow the chord's own `notatedDuration`/`duration`.
   */
  readonly headDurations: readonly Rational[]
  /** See `Note.microtoneCents`. */
  readonly microtoneCents: number
  readonly tuplet: TupletMark | null
  /** `"Am7"` printed above the staff, if one precedes this event. */
  readonly chordSymbol: string | null
  readonly chordSymbolSourceRange: SourceRange | null
  /** `!trill!`, `.` staccato, and the shorthand letters. */
  readonly decorations: readonly string[]
  /** Parallel to `decorations`. */
  readonly decorationSourceRanges: readonly SourceRange[]
  /** `"^above"` / `"_below"` free text, which is NOT a chord symbol. */
  readonly annotations: readonly string[]
  /** Parallel to `annotations`. */
  readonly annotationSourceRanges: readonly SourceRange[]
  readonly sourceRange: SourceRange | null
}

export type MusicEvent = Note | Rest | Chord

export interface SourceRange {
  readonly start: number
  readonly end: number
}

export const sourceRange = (start: number, end: number): SourceRange => ({ start, end })

export type Barline = 'thin' | 'double' | 'final' | 'repeatStart' | 'repeatEnd' | 'repeatBoth'

export interface Measure {
  readonly events: readonly MusicEvent[]
  /**
   * `&` overlay layers — additional simultaneous lines within this measure, each a
   * parallel stream to `events`. `G2 &E2 B2` puts `E2 B2` in overlay layer 0.
   */
  readonly overlays: readonly (readonly MusicEvent[])[]
  /**
   * A mid-tune `K:` taking effect at this measure. The Score's `key` stays the header
   * key; a consumer accumulates changes forward to get the key in force.
   */
  readonly keyChange: KeySignature | null
  readonly keyChangeSourceRange: SourceRange | null
  /** A mid-tune `M:` taking effect at this measure. */
  readonly meterChange: Meter | null
  readonly meterChangeSourceRange: SourceRange | null
  /** `null` when the tune ends without a closing barline. */
  readonly closingBarline: Barline | null
  readonly sourceRange: SourceRange | null
  readonly closingBarlineSourceRange: SourceRange | null
}

export interface Voice {
  readonly id: string
  /**
   * `V:… octave=±n` — a sounding shift in octaves, NOT baked into `Pitch.octave`.
   * Pitches stay as written; consumers (audio, engrave) apply this. abcjs bakes the
   * shift into its pitch numbers instead, so any comparison against it must add it back.
   */
  readonly octaveShift: number
  readonly measures: readonly Measure[]
}

export interface ScoreMetadata {
  readonly tuneNumber: number | null
  readonly titles: readonly string[]
  readonly composer: string | null
  readonly rhythm: string | null
}

export interface Score {
  readonly metadata: ScoreMetadata
  readonly key: KeySignature
  /** The *initial* meter, frozen at the header `K:`. `null` means free meter. */
  readonly meter: Meter | null
  readonly unitNoteLength: Rational
  readonly voices: readonly Voice[]
  readonly sourceStartOffset: number
  readonly keySourceRange: SourceRange | null
  readonly meterSourceRange: SourceRange | null
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  /** Stable kebab-case identifier, e.g. `unknown-field`. */
  readonly code: string
  readonly severity: Severity
  readonly message: string
  readonly range: SourceRange | null
}
