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

// ─── Compatibility mode ──────────────────────────────────────────────────────

/**
 * Which dialect and which look abcts produces, mirroring abcMusicKit's own three modes.
 *
 * - `abcjs-strict` — reproduce abcjs, INCLUDING its bugs. The default, because abcts
 *   exists to replace abcjs and a replacement whose default output differs from the
 *   thing it replaces is not one. Someone swapping the import should see their page
 *   unchanged; opting into corrections should be a choice they make.
 * - `abc2.1` — the standard read correctly: abcjs's parsing bugs fixed, engraving
 *   still conventional.
 * - `extended` — beyond the standard, where abcm2ps and abc2svg have features abcjs
 *   lacks.
 *
 * The mode gates BEHAVIOUR, not just appearance. Where core deliberately departs from
 * abcjs — `+:` continuations, a dropped decoration, a spaced lyric hyphen — the
 * departure IS the mode, and strict reproduces abcjs instead.
 */
export type CompatibilityMode = 'abcjs-strict' | 'abc2.1' | 'extended'

export const defaultMode: CompatibilityMode = 'abcjs-strict'

/** True when the mode wants abcjs's behaviour rather than the standard's. */
export const isStrict = (mode: CompatibilityMode): boolean => mode === 'abcjs-strict'

// ─── Rational ────────────────────────────────────────────────────────────────
// Durations are exact rationals, never floats. This is a locked decision in
// abcMusicKit2 and one of the abcjs bugs core exists to fix: abcjs stores
// duration as a double, so a triplet eighth is 0.041666666666666664.

// Iterative, not recursive: a non-finite input made the recursive form spin on NaN until
// the stack blew. Callers are validated too, but this is the last line of defence.
function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

export interface Rational {
  readonly numerator: number
  readonly denominator: number
}

/** Always reduced with a positive denominator, so equality is structural. */
export function rational(numerator: number, denominator = 1): Rational {
  // Validated rather than assumed: ABC durations come from untrusted text, and an
  // overflowed digit run (`C` followed by 400 nines) arrives here as Infinity.
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error(
      `rational: numerator and denominator must be safe integers, got ${numerator}/${denominator}`,
    )
  }
  if (denominator === 0) throw new Error('rational: zero denominator')
  const sign = denominator < 0 ? -1 : 1
  const divisor = gcd(numerator, denominator) || 1
  return { numerator: (sign * numerator) / divisor, denominator: (sign * denominator) / divisor }
}

export const ratMul = (a: Rational, b: Rational): Rational =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator)

export const ratEq = (a: Rational, b: Rational): boolean =>
  a.numerator === b.numerator && a.denominator === b.denominator

export const ratLt = (a: Rational, b: Rational): boolean =>
  a.numerator * b.denominator < b.numerator * a.denominator

/** Lossy — for comparison against abcjs goldens only, never for internal math. */
export const ratToNumber = (r: Rational): number => r.numerator / r.denominator

// ─── Pitch ───────────────────────────────────────────────────────────────────

export type DiatonicStep = 'c' | 'd' | 'e' | 'f' | 'g' | 'a' | 'b'

const STEPS: readonly DiatonicStep[] = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
export const stepIndex = (step: DiatonicStep): number => STEPS.indexOf(step)

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

export interface PitchClass {
  readonly step: DiatonicStep
  readonly accidental: Accidental
}

// ─── Key signature ───────────────────────────────────────────────────────────
// Derived from the circle of fifths, never stored as an accidental list.

/**
 * Canonical modes only. ABC's `ionian` and `aeolian` are accepted on input and folded to
 * `major`/`minor` by the parser, so two KeySignatures that denote the same key are always
 * structurally equal — the same guarantee `rational()` makes for durations.
 */
export type Mode = 'major' | 'mixolydian' | 'dorian' | 'minor' | 'phrygian' | 'locrian' | 'lydian'

export interface KeySignature {
  readonly tonic: PitchClass
  readonly mode: Mode
  /**
   * `K:none` — no key signature at all. Distinct from C major, which also alters nothing
   * but IS a key: a renderer draws nothing here, and no step is implicitly altered.
   */
  readonly none: boolean
}

// ─── Clef ────────────────────────────────────────────────────────────────────

/**
 * The letter a clef is built from. `percussion` and `none` are ABC's `clef=perc` and
 * `clef=none`, which carry no pitch reference at all.
 */
export type ClefShape = 'G' | 'F' | 'C' | 'percussion' | 'none'

/**
 * A clef as shape plus the staff line it sits on, rather than a closed enum of named
 * clefs.
 *
 * abcMusicKit2 models this as `enum Clef { treble, bass, alto, tenor, percussion, none }`,
 * which cannot express three clefs the corpus actually uses: ABC writes the baritone as
 * `bass3`, the mezzo-soprano as `alto2` and the soprano as `alto1`, and the `clefs`
 * fixture has all three. The digit in those names IS the staff line, so shape + line
 * covers every ABC clef including ones nobody named, and it makes staff position a
 * formula instead of a lookup table — see `middleLineIndex` in the renderer.
 */
export interface Clef {
  readonly shape: ClefShape
  /** Staff line the clef's reference pitch sits on, 1 = bottom line, 3 = middle. */
  readonly line: number
  /**
   * `clef=treble-8` — sounds an octave lower than written. A SOUNDING shift: it moves no
   * notehead, unlike `Voice.octaveShift`, whose written/sounding status is still open.
   */
  readonly octaveShift: number
}

export const defaultClef: Clef = { shape: 'G', line: 2, octaveShift: 0 }

// ─── Meter ───────────────────────────────────────────────────────────────────

export type MeterSymbol = 'numeric' | 'common' | 'cut'

export interface Meter {
  readonly numerator: number
  readonly denominator: number
  readonly symbol: MeterSymbol
}

export const measureDuration = (m: Meter): Rational => rational(m.numerator, m.denominator)

// ─── Fonts ───────────────────────────────────────────────────────────────────

/**
 * A font named by `%%vocalfont` (or `I: vocalfont`), reduced to what can be DRAWN.
 *
 * `size` is in points, as the directive writes it — converted to staff spaces at layout,
 * so a change to the staff-space scale does not have to be chased through the parser.
 *
 * ponytail: the FACE is recorded but not emitted. Output asks for `font-family="serif"`
 * and lets the viewer supply the face, which is the same call the rest of the text layer
 * makes and the reason the width table is an estimate. Weight, style and size are what
 * Gonzato §4.1.4 actually distinguishes — Times-Roman 12, Times-Bold 16, Times-Italic 12
 * are three visibly different runs on those three axes alone. Emit `font-family` when
 * something needs a face that is not a serif, and expect the width estimate to be wrong
 * for it until there are real metrics.
 */
export interface LyricFont {
  readonly face: string
  /** Points, as written in the directive. */
  readonly size: number
  readonly bold: boolean
  readonly italic: boolean
}

/**
 * The point size `%%vocalfont` is understood to be changing FROM.
 *
 * 13, measured — abcjs's `formatting.vocalfont` reports size 13 when nothing has set one,
 * and this has to agree with it or every explicit size is scaled against the wrong
 * baseline. It is the DENOMINATOR in the pt-to-staff-space conversion, not a default that
 * anything gets compared against: a tune with no `%%vocalfont` has `lyricFont: null` and
 * never reaches this constant at all.
 *
 * That distinction is the safety property. A "differs from the default" guard is exactly
 * how a font change leaks into the measurement path of every font-free tune, and the
 * leak shows up as sub-pixel drift that only a snapshot suite catches.
 */
export const DEFAULT_VOCALFONT_PT = 13

// ─── Tempo ───────────────────────────────────────────────────────────────────

/**
 * A `Q:` field. Every part is optional because ABC allows each on its own:
 * `Q:1/4=120`, `Q:"Adagio"`, and `Q:"Allegro" 1/4=120` are all legal.
 */
export interface Tempo {
  /** The note value the rate counts — the `1/4` in `Q:1/4=120`. */
  readonly beatUnit: Rational | null
  /** Beats per minute. */
  readonly bpm: number | null
  /** A quoted direction, e.g. "Allegro". */
  readonly text: string | null
}

// ─── Events ──────────────────────────────────────────────────────────────────

/** Notehead shape, set by `!style=…!` or `K: style=…`. */
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
  /**
   * The `%%vocalfont` in force when THIS SYLLABLE's line was parsed; null for the
   * default. Per note because one lyric line can carry several fonts — see `LyricFont`.
   */
  readonly lyricFont: LyricFont | null
  /**
   * `_` in a `w:` line — this note CONTINUES the previous syllable rather than being
   * wordless. Distinct from `lyric: null` with `lyricMelisma: false`, which is `*`:
   * genuinely nothing sung here.
   *
   * A renderer draws an extension line under a melisma, in NON-STRICT modes only — abcjs
   * draws no line and prints the `_` literally, so strict does too. See
   * `lyricMelismaStart`.
   *
   * CORRECTED: this said the line "must span the full horizontal extent the note
   * OCCUPIES — a whole note is wider than a half — rather than stopping at the next
   * notehead's x". That is the one geometry Gould singles out as wrong. *Behind Bars*
   * p.447 puts the endpoint at the last written NOTE rather than at the end of that
   * note's duration, and prints the over-long form as a captioned example of the
   * mistake to avoid — so the error was the documented one. The endpoint is
   * the last held NOTEHEAD's right edge. abcMusicKit v1 and v2 both landed there.
   */
  readonly lyricMelisma: boolean
  /**
   * Set on the syllable a melisma run HOLDS — the note carrying `lyric`, not the held
   * notes carrying `lyricMelisma`.
   *
   * Both ends are needed and neither implies the other locally: the syllable knows the
   * text and where the line starts, the holds know where it stops. Recorded at parse
   * because it is structural, and consumed differently per mode — strict prints a literal
   * `_` after the syllable the way abcjs does, non-strict suppresses it and strokes a line.
   */
  readonly lyricMelismaStart: boolean
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
  readonly sourceRange: SourceRange
}

export type RestKind = 'normal' | 'invisible' | 'multiMeasure' | 'invisibleMultiMeasure' | 'spacer'

export interface Rest {
  readonly type: 'rest'
  readonly duration: Rational
  readonly notatedDuration: Rational
  readonly kind: RestKind
  /**
   * `!fermata!z4` is idiomatic, so a rest does carry decorations — but not ties, slurs,
   * grace notes or lyrics, none of which apply to silence.
   */
  readonly decorations: readonly string[]
  readonly decorationSourceRanges: readonly SourceRange[]
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
  /**
   * The `%%vocalfont` in force when THIS SYLLABLE's line was parsed; null for the
   * default. Per note because one lyric line can carry several fonts — see `LyricFont`.
   */
  readonly lyricFont: LyricFont | null
  /**
   * `_` in a `w:` line — this note CONTINUES the previous syllable rather than being
   * wordless. Distinct from `lyric: null` with `lyricMelisma: false`, which is `*`:
   * genuinely nothing sung here.
   *
   * A renderer draws an extension line under a melisma, in NON-STRICT modes only — abcjs
   * draws no line and prints the `_` literally, so strict does too. See
   * `lyricMelismaStart`.
   *
   * CORRECTED: this said the line "must span the full horizontal extent the note
   * OCCUPIES — a whole note is wider than a half — rather than stopping at the next
   * notehead's x". That is the one geometry Gould singles out as wrong. *Behind Bars*
   * p.447 puts the endpoint at the last written NOTE rather than at the end of that
   * note's duration, and prints the over-long form as a captioned example of the
   * mistake to avoid — so the error was the documented one. The endpoint is
   * the last held NOTEHEAD's right edge. abcMusicKit v1 and v2 both landed there.
   */
  readonly lyricMelisma: boolean
  /**
   * Set on the syllable a melisma run HOLDS — the note carrying `lyric`, not the held
   * notes carrying `lyricMelisma`.
   *
   * Both ends are needed and neither implies the other locally: the syllable knows the
   * text and where the line starts, the holds know where it stops. Recorded at parse
   * because it is structural, and consumed differently per mode — strict prints a literal
   * `_` after the syllable the way abcjs does, non-strict suppresses it and strokes a line.
   */
  readonly lyricMelismaStart: boolean
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
  /**
   * A repeat ending (volta) starting at this measure — the `1` in `|1`, or `1,2`.
   *
   * ABC writes the number after the barline that opens the ending, and the ending runs
   * until the next one or the repeat that closes it. Without this a reader cannot tell
   * which pass through a repeat plays which bars, so it is structural rather than
   * decorative — and it is playback structure too, which is why it belongs in the model
   * rather than only in the renderer.
   */
  readonly volta: string | null
  readonly voltaSourceRange: SourceRange | null
  /**
   * A `P:` part label taking effect at this measure — "A", or "PART - VERSE, CHORUS".
   * Printed above the staff.
   *
   * ponytail: BODY `P:` only. A `P:` in the header is a part ORDER ("ABAB"), a different
   * thing entirely, and is still deferred.
   */
  readonly partLabel: string | null
  readonly partLabelSourceRange: SourceRange | null
  /**
   * This measure opens a new SYSTEM, because a new line of music began in the source.
   *
   * ABC breaks staff lines where the FILE breaks them — one source music line is one
   * printed system — and abcjs has no line-breaking pass at all: it fits each source line
   * to the page width, compressing when the line is long rather than wrapping it. So the
   * break points are the author's and are recorded at parse, not recomputed at layout.
   */
  readonly startsSystem: boolean
  /**
   * A barline that OPENS this measure — a leading `|:` or `[|`, which belongs to the
   * measure after it rather than the one before. Distinct from `closingBarline` because
   * both can occur back to back: a line ending `:|` followed by one starting `|:` is two
   * printed barlines, and folding them into one loses a repeat structure.
   */
  readonly openingBarline: Barline | null
  readonly openingBarlineSourceRange: SourceRange | null
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
  /** `V:… clef=`. `null` means this voice takes the tune's clef from `Score.clef`. */
  readonly clef: Clef | null
  readonly measures: readonly Measure[]
}

export interface ScoreMetadata {
  readonly tuneNumber: number | null
  readonly titles: readonly string[]
  readonly composer: string | null
  readonly rhythm: string | null
}

/**
 * One STAFF, and the voices printed on it — the parsed result of `%%score` / `%%staves`.
 *
 * A staff is not a voice. `%%score {1 (2 3)}` puts voices 2 and 3 on ONE staff, so three
 * voices become two staves. Without this the directive's grouping punctuation is thrown
 * away and every voice gets a staff of its own, which is what abcts did until 2026-07-20
 * — five staves for a piano rag that abcjs renders on two.
 *
 * SHAPE follows abcMusicKit v1, which ports abcjs's `abc_parse_directive.js` line for
 * line, rather than abcMusicKit2's grouping TREE. v2's tree is closer to the source
 * syntax and better for round-tripping, but it records `( … )` with its merge explicitly
 * deferred — the one thing this exists to do. A renderer needs the flattened answer:
 * which staves exist, and which voices are on each.
 */
export interface StaffGroup {
  /** Voice ids on this staff, in order. The first is the upper voice. */
  readonly voiceIds: readonly string[]
  /** `{ … }` — a brace, as on a piano grand staff. */
  readonly brace: StaffConnector | null
  /** `[ … ]` — a bracket, as over an instrument family. */
  readonly bracket: StaffConnector | null
  /**
   * Whether barlines run through to the staff below. `%%staves` connects every staff;
   * `%%score` connects only where the directive writes `|`. That is the entire difference
   * between the two spellings.
   */
  readonly connectBarLines: StaffConnector | null
}

/** Where a staff sits in a run of grouped staves. */
export type StaffConnector = 'start' | 'continue' | 'end'

export interface Score {
  readonly metadata: ScoreMetadata
  readonly key: KeySignature
  /** The tune's clef, from `K:… clef=` or a bare clef name on `K:`. Defaults to treble. */
  readonly clef: Clef
  /** The *initial* meter, frozen at the header `K:`. `null` means free meter. */
  readonly meter: Meter | null
  /**
   * The tune's `Q:`, from wherever in the file it sits — abcjs models tempo tune-level
   * (`metaText.tempo`) and draws it at the head of the first system even when the field
   * is mid-tune, so a mid-tune `Q:` lands here rather than on a Measure. First one wins.
   */
  readonly tempo: Tempo | null
  readonly unitNoteLength: Rational
  readonly voices: readonly Voice[]
  /**
   * One entry per STAFF, in top-to-bottom order. Empty when the tune has no
   * `%%score`/`%%staves`, in which case every voice takes a staff of its own.
   */
  readonly staves: readonly StaffGroup[]
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
