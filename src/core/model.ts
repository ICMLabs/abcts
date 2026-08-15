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
  /**
   * **THE LETTER AND OCTAVE MARKS EXACTLY AS WRITTEN**, without the accidental — `c,`,
   * `C`, `b'`. Absent when the pitch was not read from source (the DSL, a converter).
   *
   * It is NOT derivable from the pitch, which is the whole reason it is here: `c,` and `C`
   * are the same note and abcjs keeps whichever the writer typed. `el.name = line[index]`
   * then one `,` or `'` appended per mark (`abc_parse_music.js:1116-1147`), and it is what
   * a notehead's `data-name` carries (`create-note-head.js:34`). See `writtenNote`.
   */
  readonly written?: string
  /**
   * The ACCIDENTAL as abcjs names it, when that is not derivable from `accidental` alone.
   *
   * `el.name = accMap[el.accidental] + el.name` (`abc_parse_music.js:1118`) and `accMap`
   * has SEVEN entries — `__ _ = ^ ^^` and the two quarter tones `_/` and `^/`
   * (`abc_parse_settings.js:147-155`). Our `Accidental` is a whole-semitone enum with the
   * deviation in `microtoneCents`, so a quarter tone would otherwise print its BASE sign.
   */
  readonly writtenAccidental?: string
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

/** One accidental written explicitly on a `K:` field, after the key and mode. */
export interface KeyAccidental {
  readonly step: DiatonicStep
  /** In QUARTER tones, so a half-sharp is 1 and a sharp is 2 — see `KeySignature.extra`. */
  readonly quarters: number
}

export interface KeySignature {
  readonly tonic: PitchClass
  readonly mode: Mode
  /**
   * `K: C ^/f _/B _A ^D` — accidentals written on the field itself, printed in the key
   * signature after the mode's own and inherited by every note on those steps.
   *
   * abcjs reads them with `getKeyAccidentals2` (`abc_tokenizer.js:283-340`), which accepts
   * `^`, `^^`, `^/`, `_`, `__`, `_/` and `=` before a note letter, and then REPLACES a
   * standard accidental on the same letter or appends
   * (`abc_parse_key_voice.js:320-350`). Held in QUARTER tones because the field can write
   * quarter sharps and flats that `Accidental` cannot.
   */
  readonly extra?: readonly KeyAccidental[]
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
  /**
   * `V:… middle=<pitch>` — the diatonic index that sits on the MIDDLE staff line, which
   * overrides the one the clef's shape and line imply. `null` when no `middle=` was given.
   *
   * abcjs's `clef.verticalPos`: a WRITTEN-position shift, not a sounding one, so unlike
   * `octaveShift` it moves noteheads. `clef=bass middle=d` puts D5 (index 36) on the middle
   * line where plain bass puts D3 (22), dropping that voice's high notes onto the staff.
   * Independent of `transpose=`, which is sounding-only and moves nothing on the page.
   */
  readonly middleOverride: number | null
  /**
   * `V:… stafflines=<n>` — how many staff lines to DRAW, 5 unless stated.
   *
   * A drawing count, not a coordinate system: notes keep their normal pitches and a
   * `stafflines=1` rhythm staff still reads as a treble staff with four of its lines
   * hidden. abcjs carries it on the clef for the same reason (`clef.stafflines`,
   * `abstract-engraver.js:182`) and leaves the staff's own top/bottom limits at the
   * five-line values — its `staff-group-element.js:53` records that as an open question,
   * and matching it is what keeps a short staff from re-spacing everything around it.
   */
  readonly staffLines: number
}

/** Five, as every ABC clef is unless `stafflines=` says otherwise. */
export const DEFAULT_STAFF_LINES = 5

export const defaultClef: Clef = {
  shape: 'G',
  line: 2,
  octaveShift: 0,
  middleOverride: null,
  staffLines: DEFAULT_STAFF_LINES,
}

// ─── Meter ───────────────────────────────────────────────────────────────────

export type MeterSymbol = 'numeric' | 'common' | 'cut'

export interface Meter {
  readonly numerator: number
  readonly denominator: number
  readonly symbol: MeterSymbol
  /**
   * `M:2+3/8` — the numerator as WRITTEN, so it can be drawn as `2+3` rather than `5`.
   *
   * Absent for a plain meter. abcjs keeps the whole string and lays out one glyph per
   * character with a `+` between the terms, each `getSymbolWidth("+") + 2` wide
   * (`create-time-signature.js:12-16`) — 17.08px more prefix than a single digit on
   * `2+3/8`, which moves the music. `numerator` stays the SUM, since that is the bar's
   * duration either way.
   */
  readonly numeratorParts?: readonly number[]
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
  /**
   * `box` after the size — a frame round the text, on the eleven types abcjs allows it on
   * (`fontTypeCanHaveBox`, `abc_parse_directive.js:60`).
   *
   * It is a LAYOUT term, not decoration: `getTextSize` returns `height + padding * 4` and
   * `width + padding * 4` for a boxed font (`helpers/get-text-size.js:46-48`) with
   * `padding = size * fontboxpadding` (default 0.1), so the row or lane grows with it.
   * `%%partsfont box` costs a `P:` row 33px against the plain 24.
   */
  readonly box?: boolean
}

/**
 * The font types abcjs names, each `%%<type>font`.
 *
 * CHANGING vs GLOBAL is abcjs's own split (`abc_parse_directive.js:1019-1037`): the first
 * eleven can change mid-tune and belong on the element, the rest are tune-level. We record
 * both here; only `vocalfont` and `gchordfont` are stamped per element so far, and the
 * others take the last value, which is what a header-only directive means either way.
 * `barlabelfont`, `barnumberfont` and `barnumfont` are aliases of `measurefont`.
 */
export type AbcFontType =
  | 'gchordfont'
  | 'partsfont'
  | 'tripletfont'
  | 'vocalfont'
  | 'textfont'
  | 'annotationfont'
  | 'historyfont'
  | 'infofont'
  | 'measurefont'
  | 'repeatfont'
  | 'wordsfont'
  | 'composerfont'
  | 'subtitlefont'
  | 'tempofont'
  | 'titlefont'
  | 'voicefont'
  | 'footerfont'
  | 'headerfont'

/**
 * abcjs's own defaults, in POINTS (`abc_parse_directive.js:21-42`).
 *
 * A size reaches the page as `round(pt * 4 / 3)` px (`get-font-and-attr.js:28`), and the
 * eighteen defaults land on exactly seven distinct pixel sizes — which is why the golden
 * generator's height table has seven entries and covers every tune that sets no font.
 */
export const ABC_FONT_DEFAULT_PT: Readonly<Record<AbcFontType, number>> = {
  gchordfont: 12,
  partsfont: 15,
  tripletfont: 11,
  vocalfont: 13,
  textfont: 16,
  annotationfont: 12,
  historyfont: 16,
  infofont: 14,
  measurefont: 14,
  repeatfont: 13,
  wordsfont: 16,
  composerfont: 14,
  subtitlefont: 16,
  tempofont: 15,
  titlefont: 20,
  voicefont: 13,
  footerfont: 12,
  headerfont: 12,
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

/** One `%%center`, `%%text`, or `%%begintext` … `%%endtext` block. */
export interface FreeTextBlock {
  /** One entry per line. A `%%begintext` block is the only one that holds more than one. */
  readonly lines: readonly string[]
  /**
   * `%%center` centres on the STAFF width — 335, not the paper's 350 the title uses.
   * `%%text` and `%%begintext` sit at the left margin, `anchor: "start"`.
   */
  readonly align: 'center' | 'left'
  /**
   * A mid-tune `T:` — a SUBTITLE line, not free text. It takes `subtitlefont` and abcjs's
   * `spacing.subtitle` above it, and its own measured height below with no `* 1.1`
   * (`elements/subtitle.js`). Measured on a control pair: 27.05px against `%%text`'s 33.77.
   */
  readonly role?: 'text' | 'subtitle' | 'separator'
  /**
   * `%%sep` — a horizontal rule, centred on the STAFF width, with a space above and below.
   * All three in POINTS and each `Math.round`ed at parse (`tune-builder.js:309`); bare
   * `%%sep` is 14 / 14 / 85 (`abc_parse_directive.js:883`). The rule itself costs no
   * height at all — `drawSeparator` paints at `renderer.y` and moves nothing — so the
   * line's whole cost is `above + below`, measured at 28 bare and 22 for `0.4cm` each way.
   */
  readonly separator?: { readonly above: number; readonly below: number; readonly length: number }
}

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
  /** A quoted direction BEFORE the rate — abcjs's `preString`, e.g. `Q:"Allegro" 1/4=120`. */
  readonly text: string | null
  /**
   * A quoted direction AFTER the rate — abcjs's `postString`.
   *
   * `Q:` takes a quote on either side of the rate and draws them on either side of the
   * mark: `[Q:"left" 1/4=170"right"]` prints `left ♩ = 170 right`
   * (`parse/abc_parse_header.js:257-330`, `write/draw/tempo.js:18-38`). Which side a lone
   * quote falls on is decided by POSITION, not by content — one written before the rate is
   * the pre-string even when it reads like a marking.
   */
  readonly postText?: string | null
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
  /**
   * `.-` and `.(` — a DOTTED tie and a DOTTED slur, drawn as a dashed open curve rather
   * than a filled lens (`draw/tie.js:89-95`). The leading `.` is NOT a staccato: abcjs's
   * decoration lexer breaks out of the `case '.'` when `(` or `-` follows
   * (`abc_parse_music.js:783-786`), and the flag rides on the ELEMENT, one for the tie it
   * starts and one for the slurs opening on it (`:896`, `:1062-1066`).
   */
  readonly tieDotted?: boolean
  readonly slurDotted?: boolean
  /** How many slurs open on this event, and how many close on it. */
  readonly slurStarts: number
  readonly slurEnds: number
  /** `{gfe}` ornament pitches played before this event; empty means none. */
  readonly graceNotes: readonly GracePitch[]
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
  /**
   * The `%%gchordfont` in force where this event was written, or null while none has been.
   *
   * PER EVENT because abcjs makes it a CHANGING font (`abc_parse_directive.js:1019-1029`,
   * `getChangingFont`) — `visual-tablature-17` sets it four times between music lines and
   * each staff's chord symbols take the size in force above them.
   */
  readonly chordFont: LyricFont | null
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

/**
 * A grace note — a pitch plus the LENGTH it was written with.
 *
 * `{B2c/d/}` is three graces of 2, 1/2 and 1/2, and abcjs spends them proportionally:
 * `multiplier = companionDuration / 2 / graceDuration` over their SUM, then each grace
 * takes `its own duration × multiplier` (`abc_midi_flattener.js:691-714`). Because the
 * multiplier normalises, only the RATIOS matter and the unit note length cancels — which
 * is why this is a bare multiplier and not a duration.
 *
 * `1` when the grace wrote no length at all, which is every grace in the corpus but one.
 * The engraver does not read it: abcjs draws every grace as the same small head.
 */
export interface GracePitch extends Pitch {
  readonly length: Rational
  /**
   * **A `)` WRITTEN AFTER A GRACE GROUP CLOSES ON THE LAST GRACE, NOT ON THE NOTE.**
   *
   * abcjs's parser puts it there — `(f3 {a})y` gives the grace
   * `{"pitch":12,"name":"a","endSlur":[101]}` — and `addSlursAndTies` runs for grace notes
   * as well as pitches (`abstract-engraver.js:498`, `:728`), so the curve's `anchor2` is
   * the GRACE head. It never runs for a rest, which is why the `y` spacer after it closes
   * nothing at all.
   */
  readonly slurEnds?: number
}

export type RestKind = 'normal' | 'invisible' | 'multiMeasure' | 'invisibleMultiMeasure' | 'spacer'

export interface Rest {
  readonly type: 'rest'
  readonly duration: Rational
  readonly notatedDuration: Rational
  readonly kind: RestKind
  /**
   * `!fermata!z4` is idiomatic, so a rest does carry decorations — but not ties, slurs or
   * lyrics, none of which apply to silence.
   */
  readonly decorations: readonly string[]
  readonly decorationSourceRanges: readonly SourceRange[]
  /**
   * …AND A CHORD SYMBOL, which is NOT the same question. abcjs runs `addChord` over every
   * abselem's `elem.chord` regardless of type (`abstract-engraver.js:853`), so `"Eb7"z`
   * prints the chord over the rest and reserves the whole chord lane for it — 22.4px of
   * staff on a tune that opens that way, and the mark itself lost outright before this.
   */
  readonly chordSymbol: string | null
  readonly chordSymbolSourceRange: SourceRange | null
  readonly chordFont: LyricFont | null
  readonly annotations: readonly string[]
  readonly annotationSourceRanges: readonly SourceRange[]
  /**
   * …AND ITS GRACE NOTES, for the same reason and by the same line. `createNote` calls
   * `addGraceNotes` OUTSIDE its rest/note branch — `if (elem.gracenotes !== undefined)` at
   * `abstract-engraver.js:834`, after both arms have run — so `{a}z` and `{a}y` engrave
   * their graces exactly as `{a}c` does.
   *
   * This field's absence used to be justified here in so many words: "not ties, slurs,
   * grace notes or lyrics, none of which apply to silence." Three of those four are right.
   * The fourth was reasoned rather than measured, and abcjs draws the note: `(f3 {a})y`
   * came out one notehead short and 9.6px high on every axis that reads the staff.
   */
  readonly graceNotes: readonly GracePitch[]
  readonly graceSlash: boolean
  readonly tuplet: TupletMark | null
  /**
   * How many BARS a `Z`/`X` stands for — the number printed over the multi-measure bar.
   * Zero for every other rest. abcjs keeps it as `rest.text` and draws it at pitch 16
   * (`abstract-engraver.js:596`).
   */
  readonly measureCount: number
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
  /**
   * `.-` and `.(` — a DOTTED tie and a DOTTED slur, drawn as a dashed open curve rather
   * than a filled lens (`draw/tie.js:89-95`). The leading `.` is NOT a staccato: abcjs's
   * decoration lexer breaks out of the `case '.'` when `(` or `-` follows
   * (`abc_parse_music.js:783-786`), and the flag rides on the ELEMENT, one for the tie it
   * starts and one for the slurs opening on it (`:896`, `:1062-1066`).
   */
  readonly tieDotted?: boolean
  readonly slurDotted?: boolean
  /** How many slurs open on this event, and how many close on it. */
  readonly slurStarts: number
  readonly slurEnds: number
  /** `{gfe}` ornament pitches played before this event; empty means none. */
  readonly graceNotes: readonly GracePitch[]
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
  /**
   * The `%%gchordfont` in force where this event was written, or null while none has been.
   *
   * PER EVENT because abcjs makes it a CHANGING font (`abc_parse_directive.js:1019-1029`,
   * `getChangingFont`) — `visual-tablature-17` sets it four times between music lines and
   * each staff's chord symbols take the size in force above them.
   */
  readonly chordFont: LyricFont | null
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

/**
 * `invisible` is abcjs's `bar_invisible` — `[|]`, and a bare `[` before a digit or a
 * quote. It draws NOTHING and takes a thin bar's layout width: `addRight(new
 * RelativeElement(null, dx, 1, 2, { type: "none" }))` (`abstract-engraver.js:996-999`),
 * where a thin bar's own anchor differs only in `type: "bar"`.
 */
export type Barline =
  | 'thin'
  | 'double'
  /**
   * `[|` — a THICK rule then a thin one, which abcjs keeps apart from `||`:
   * `bar_thick_thin` sets `firstthin` false and `thick` true where `bar_thin_thin` does
   * the opposite (`abstract-engraver.js:974-977`). The two are 13px and 4px wide, and
   * folding `[|` into `double` was 9px of every line that opens with one — the whole of
   * `little swallow`'s prefix gap. Recorded in `ENGRAVE.barLayoutWidth`'s own comment as
   * "a model question, not a spacing one" before it was one.
   */
  | 'thickThin'
  | 'final'
  | 'repeatStart'
  | 'repeatEnd'
  | 'repeatBoth'
  | 'invisible'

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
   * Was this meter written INLINE (`[M:]`) rather than as a standalone `M:` line?
   *
   * The two take different routes in abcjs and land in different places, so a renderer
   * that cannot tell them apart draws one of them wrong. `letter_to_inline_header`'s
   * `"[M:"` arm appends a `meter` element and leaves `multilineVars.meter` alone;
   * `setMeter` on a standalone `M:` line sets `multilineVars.meter`, which the next
   * `startNewLine` consumes into that line's `params.meter` and prints in its PREFIX.
   *
   * Measured on a pair of controls, `M:3/4` and `[M:3/4]` at the same point in the same
   * tune:
   *
   *   standalone  line 0 ends with its notes; line 1 opens `clef 15, timeSig 49.05 w=11.79`
   *   inline      line 0 ends `timeSig 673.20 w=11.79`; line 1 opens with the CLEF ALONE
   *
   * Absent (or false) means the standalone form. See `meterChangeLeadsLine` in the
   * renderer, which is the only thing that reads it.
   */
  readonly meterChangeInline?: boolean
  /**
   * **EVERY `[M:]` IN THIS MEASURE, IN ORDER**, each with the number of events already
   * emitted when it was read — because abcjs treats a meter as an ORDINARY element in the
   * voice stream and draws it where it stands, so `[M:2/4]y[M:3/4]y[M:4/4]` is five
   * elements and three time signatures.
   *
   * Present only when a measure carries more than one, which is the only case the singular
   * `meterChange` cannot express. That field is the LAST entry's meter — the meter IN
   * FORCE, which is a different role from the DRAWN ones and is what audio, timing and the
   * chord grid read. Both are built from this list in one place (`takeChanges`), so they
   * cannot drift.
   */
  readonly meterChanges?: readonly { readonly meter: Meter | null; readonly at: number }[]
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
  /**
   * A mid-tune clef, from a `K:… clef=` or an inline `[K: bass]`. A DELTA like
   * `keyChange`: null means "unchanged", and the consumer accumulates.
   *
   * abcjs reprints it at the head of every system after it, so the renderer has to carry
   * it forward into the prefix as well as draw it where it stands.
   */
  readonly clefChange?: Clef | null
  /**
   * Decorations written immediately before this measure's CLOSING barline, which is what
   * they attach to — `createBarLine` ends `if (elem.decoration)
   * this.decoration.createDecoration(voice, elem.decoration, 12, thick ? 3 : 1, abselem,
   * 0, "down", 2, …)` (`abstract-engraver.js:1002`), at a FIXED pitch 12 rather than any
   * note's extent. `CCCC!D.C.alcoda!|` is that, and it is how a navigation mark is
   * normally written.
   */
  readonly closingBarlineDecorations?: readonly string[]
  /**
   * …AND SO DO A CHORD SYMBOL AND ANNOTATIONS WRITTEN THERE, by the two lines after the
   * decoration transfer: `if (el.chord !== undefined) bar.chord = el.chord`, then `el =
   * {}` (`abc_parse_music.js:288-289, 305`). `createBarLine` ends by running the very
   * same `addChord` a note gets, at `roomTaken = 0` and `noteheadWidth = 0`
   * (`abstract-engraver.js:1047-1049`), so the mark is CENTRED on the barline itself and
   * `addCentered` gives the bar `w = chordWidth / 2` and `extraw = -chordWidth / 2` —
   * real spacing, over the flat `-5` a bare barline declares.
   *
   * `"D"|` is how a chord change on the downbeat is normally written, so this is not an
   * edge case: carrying it to the next note put our mark 15.8px right of abcjs's and
   * spread every notehead on the line by 0.93px.
   */
  readonly closingBarlineChord?: string
  readonly closingBarlineAnnotations?: readonly string[]
  /**
   * …AND SO DOES A BARLINE THAT **OPENS** A MEASURE, which is the same transfer read from
   * the other side and was missing entirely.
   *
   * abcjs has ONE bar element and does not care which measure it belongs to: `!coda!|:` and
   * `"^3x"|:` both leave `decoration` and `chord` on the `bar_left_repeat`
   * (measured — a dump of `you`'s delined voice prints
   * `bar type=bar_left_repeat chord=[{"name":"3x","position":"above"}] dec=["coda"]`).
   *
   * Ours split a leading barline off as the NEXT measure's opener, and the transfer had
   * nowhere to go: `closeMeasure` returns false on that path, so the decorations were
   * cleared unconditionally by the caller and **lost outright**, while the chord and the
   * annotations leaked onto the first note. The chord-grid arc is what surfaced it — a
   * `"^3x"` sitting on the note ahead of that note's own `"G"` makes the annotation the
   * FIRST entry of `element.chord`, and the grid reads only the first.
   */
  readonly openingBarlineDecorations?: readonly string[]
  readonly openingBarlineChord?: string
  readonly openingBarlineAnnotations?: readonly string[]
  /**
   * A `Q:` or `[Q:]` after the FIRST one, printed where it stands.
   *
   * The first `Q:` anywhere in the tune becomes `Score.tempo` and is drawn at the head of
   * system 1 — abcjs's `metaText.tempo`, which is why `frere-jacques`'s line-21 `Q:`
   * appears above music that precedes it. Every LATER one is an ordinary element in its
   * own voice's stream, on its own staff: `synth-flattener-31` has four across three
   * voices and abcjs draws all five marks.
   */
  readonly tempoChange?: Tempo | null
  /**
   * `%%MIDI` directives written inside the music, taking effect from this measure.
   *
   * abcjs splits them by POSITION: before the first note a `%%MIDI` is a tune setting on
   * `formatting.midi`, after it an ELEMENT in the stream (`abc_parse_directive.js:718-724`).
   * `%%MIDI program 40` in the header is the first kind; `%%MIDI gchord fzczfzcz` mid-tune
   * is the second. Params keep abcjs's own shape — a flat array of number-or-string — which
   * is what lets `program 4` and `program 2 4` be told apart by LENGTH.
   */
  readonly midiCommands?: readonly {
    readonly cmd: string
    readonly params: readonly (string | number)[]
  }[]
  readonly startsSystem: boolean
  /**
   * Free-text blocks and mid-tune subtitles standing between the PREVIOUS system and this
   * one. Empty for all but the first measure of a system, and empty on that one too
   * unless something non-musical stood above it.
   *
   * abcjs models each as a LINE of its own (`engraver-controller.js:229-247`), drawn
   * between the two staff groups and pushing everything below it down. Ours is the same
   * top-text block the tune's own title uses, hung on the first staff of the system after
   * it — which is what makes it enter `verticalExtent` rather than float over the page.
   */
  readonly textBefore?: readonly FreeTextBlock[]
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
  /**
   * `%%barnumbers N` — the bar number printed ON this measure's closing barline, which is
   * the number of the measure that barline OPENS.
   *
   * abcjs advances `currBarNumber` at each visible barline of the FIRST voice and stamps
   * `bar.barNumber` when `currBarNumber % barNumbers === 0`
   * (`abc_parse_music.js:296-301`). It is geometry as well as text: the number is a POINT
   * at pitch `vert + height / STEP` added by `addFixed`, so it enters the staff's ink and
   * pushes its top past the clef's — 10.5px on a plain treble tune.
   */
  readonly closingBarNumber?: number
  /**
   * `%%barnumbers 0` — the number printed on this system's CLEF rather than on a barline,
   * which is a different mechanism and not a special case of `closingBarNumber`. abcjs
   * hangs it on the STAFF at `startNewLine` (`abc_parse_music.js:1036`) and
   * `createABCStaff` hands it to `addMeasureNumber(abcstaff.barNumber, clef)` — the only
   * path where `abselem.isClef` shifts the number right by half its width and the
   * `vert = 13.5` branch can fire. Absent on the first system, as abcjs's
   * `currBarNumber !== 1` says.
   */
  readonly systemBarNumber?: number
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
  /**
   * `V:… transpose=n` — semitones, SOUNDING ONLY. Nothing on the page moves.
   *
   * abcjs hangs it on the CLEF (`multilineVars.clef.transpose`, copied from
   * `currentVoice.transpose`) and the renderer never reads it: `src/write/` has zero
   * references and only `src/synth/` uses it. It lives on the voice here because a `V:`
   * may declare one with no `clef=` beside it, and putting it on the tune's shared clef
   * would leak it to every other voice.
   *
   * It is a SEMITONE count, unlike `octaveShift`, and the clef's own `+8`/`-8` OVERRIDES
   * it rather than adding: abcjs pushes both as `transpose` elements in that order and the
   * flattener's `case "transpose"` assigns.
   */
  readonly transpose: number
  /** `V:… clef=`. `null` means this voice takes the tune's clef from `Score.clef`. */
  readonly clef: Clef | null
  /**
   * `V:… stafflines=<n>` given WITHOUT a `clef=` beside it. `null` when absent.
   *
   * Separate from `clef.staffLines` because the two inherit differently: a bare
   * `stafflines=` must not materialise a clef, or the voice would stop taking the tune's
   * (`V:1 stafflines=1` above a `K:C bass` would silently turn treble). So the count rides
   * on the voice and is applied to whichever clef resolution picks.
   */
  readonly staffLineOverride: number | null
  /**
   * `V:… stems=up|down` — every stem in this voice forced one way. `null` when absent.
   *
   * It WINS over the shared-staff convention rather than combining with it, which is
   * abcjs's own precedence: `createVoice` takes `if (params.stem) … else if (voiceNum > 0)`
   * (`parse/tune-builder.js:971-986`), so a declared `stems=` also suppresses the `up`
   * that would otherwise be back-filled onto the staff's first voice. It beats the BEAM's
   * choice too — abcjs hands it to `BeamElem` as `forceup`/`forcedown`, checked before the
   * average-pitch rule (`beam-element.js:74-86`).
   */
  readonly stemDirection: 'up' | 'down' | null
  /**
   * `%%voicecolor <colour>` — every mark this voice makes is drawn in it. `null` means the
   * host's `foregroundColor`, which abcjs writes as the literal `currentColor`.
   *
   * The token is taken RAW and never validated: abcjs stores whatever word or quoted string
   * followed the directive (`abc_parse_directive.js:863-870`) and hands it straight to the
   * SVG `fill`, so `blue`, `#c00` and nonsense all reach the attribute alike.
   */
  readonly color: string | null
  /**
   * `V:… name=` — the label printed to the left of the FIRST system. `null` means none.
   * abcjs reserves horizontal space for it, shifting the staff (and its notes) right.
   */
  readonly name: string | null
  /** `V:… subname=`/`sname=` — the label on LATER systems. `null` means none. */
  readonly subname: string | null
  readonly measures: readonly Measure[]
}

/**
 * One run of text in ONE font, inside a header field that changed font mid-line.
 *
 * `$1` switches to `%%setfont-1` and `$0` switches back, so `T:Title $1bold$0 reg` is three
 * phrases (`abc_parse_directive.js:727-748`). A `null` font means the field's own default.
 */
export interface RichPhrase {
  readonly font: LyricFont | null
  readonly text: string
}

/**
 * A header field that may or may not have changed font part-way through.
 *
 * A UNION rather than always-an-array, because that is exactly what abcjs returns:
 * `parseFontChangeLine` gives back the plain string when the line holds no `$N` — or when
 * it does but no `%%setfont` defined that number — and an ARRAY of phrases otherwise. The
 * distinction is not cosmetic. It selects a different ROW HEIGHT downstream, and the two
 * differ by 10% and a rounding on every affected row. See `richTextRowHeight`.
 */
export type RichText = string | readonly RichPhrase[]

/** The text of a rich field with its font changes flattened away. */
export const plainText = (value: RichText | null): string =>
  value === null ? '' : typeof value === 'string' ? value : value.map((p) => p.text).join('')

export interface ScoreMetadata {
  readonly tuneNumber: number | null
  readonly titles: readonly RichText[]
  readonly composer: RichText | null
  readonly rhythm: RichText | null
  /** `O:` — where the tune comes from. Printed in the top-text block beside the composer. */
  readonly origin: RichText | null
  /**
   * `A:` — the author of the words. Its own row at the foot of the top-text block, drawn
   * right-aligned in `composerfont` (`top-text.js:68-71`), and it costs 23px whether or
   * not a composer row precedes it. Measured on a control pair.
   */
  readonly author: RichText | null
  /**
   * A HEADER `P:` — the part ORDER, `AABB`. A different field from the body `P:` that
   * labels a part, and a different font: it closes the top-text block left-aligned in
   * `partsfont` (`top-text.js:73-77`), for 24px.
   */
  readonly partOrder: RichText | null
  /**
   * **THE BOTTOM-TEXT FIELDS.** abcjs draws these BELOW the last staff, in the order
   * `BottomText` lists them and each with its literal English prefix
   * (`creation/elements/bottom-text.js`): `W:` unaligned words first, then
   * `"Book: "`, `"Source: "`, `"Discography: "`, `"Notes:"`, `"Transcription: "`,
   * `"History:"`.
   *
   * `N:`, `H:` and `W:` are MULTI-LINE — `addMetaTextArray` accumulates one entry per
   * field line (`abc_parse_header.js:484-503`), and `H:` keeps swallowing following lines
   * until one of them looks like a field. The rest are single.
   */
  readonly book: RichText | null
  readonly source: RichText | null
  readonly discography: RichText | null
  readonly transcription: RichText | null
  readonly notes: readonly RichText[]
  readonly history: readonly RichText[]
  readonly unalignedWords: readonly RichText[]
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

/**
 * One `%%percmap <abc-note> <drum-sound> [<note-head>]` entry, as abcjs stores it.
 *
 * BOTH halves are needed and they serve different engines: `noteHead` is what the engraver
 * draws (`abstract-engraver.js:681-688`) and `sound` is the GM percussion pitch the
 * flattener plays (`writeNote`, via `pitches-to-perc.js`). abcjs keeps them in one object
 * on `tune.formatting.percmap` and so does this.
 *
 * The sound is either a MIDI number in 35–81 or one of abcjs's 47 drum names, resolved as
 * `drumNames.indexOf(name) + 35` (`abc_parse_directive.js:393-409`).
 */
export interface PercMapEntry {
  readonly sound: number
  readonly noteHead?: string
}

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
  /**
   * The tune's `Q:` was written INLINE (`[Q:1/4=129]`) rather than as a field.
   *
   * abcjs DRAWS the mark either way — its SVG carries a `data-name="tempo"` for the inline
   * form — but only the FIELD form reaches `metaText.tempo`, which is what its audio reads.
   * Measured on a control pair: `[Q:1/4=129]CDEF` reports `tempo: 180` from `setUpAudio`
   * where `Q:1/4=129` reports 129. So the page and the clock disagree on purpose, and this
   * is what lets each take its own.
   */
  readonly tempoInline?: boolean
  readonly unitNoteLength: Rational
  /**
   * **A STANDALONE `K:` IN THE BODY RESTAMPS ONE STAFF'S KEY SIGNATURE, AGAINST THE
   * `K:`-CLEF RATHER THAN THAT STAFF'S OWN.**
   *
   * `appendStartingElement('key', …, fixKey(multilineVars.clef, multilineVars.key))` lands
   * on `staff[tune.staffNum].key` when the current voice has no note or bar yet
   * (`parse/tune-builder.js:294`), and `multilineVars.clef` is written by a `K:`'s own
   * `clef=` and by NOTHING else — a `V:… clef=bass` never touches it
   * (`abc_parse_key_voice.js:513`). So a `K:` line written after a `V:` block draws
   * TREBLE-positioned accidentals on that voice's BASS staff.
   *
   * Named here rather than folded into the voice's clef because it is deliberately
   * narrow, and a six-rung ladder through abcjs pins every edge: only the CURRENT voice's
   * staff is restamped (staff 0 keeps its own positions), and only the line that was open
   * when the `K:` was read — a second music line draws bass again. `null` when no such
   * `K:` exists, which is every tune in both corpora but one.
   *
   * ponytail: scoped to the FIRST SYSTEM rather than to abcjs's tune LINE. The two differ
   * only when the first source line WRAPS, where `wrap_lines.js:50` copies the running key
   * signature onto the continuation; no fixture does both.
   */
  readonly firstLineKeyClef?: { readonly voiceId: string; readonly clef: Clef }
  readonly voices: readonly Voice[]
  /**
   * One entry per STAFF, in top-to-bottom order. Empty when the tune has no
   * `%%score`/`%%staves`, in which case every voice takes a staff of its own.
   */
  readonly staves: readonly StaffGroup[]
  /**
   * `%%staffsep` — minimum gap between one system's bottom staff LINE and the next
   * system's top staff line, in PIXELS at a 7.75px staff space. `null` takes the engine
   * default. abcjs reads the directive in points and scales it by 4/3, so the value here
   * is already in pixels (`staffsep * 4 / 3`).
   */
  readonly staffSep: number | null
  /** `%%sysstaffsep` — the same minimum, but between staves WITHIN a system. Pixels, or null. */
  readonly sysStaffSep: number | null
  /**
   * `%%musicspace` — the gap between the top text and the FIRST staff, in pixels.
   *
   * Spent once, before the first staff group (`write/draw/draw.js:17`), which is why a
   * mid-tune block between two groups costs nothing extra. `null` takes the engine
   * default; abcjs scales the directive's points by 4/3 (`write/renderer.js:155-156`).
   */
  readonly musicSpace: number | null
  /**
   * `%%partsbox` — draw a box round every `P:` label.
   *
   * It is not only decoration: a boxed font measures `height + padding * 4` and
   * `width + padding * 4` (`write/helpers/get-text-size.js:46-48`), so the part's whole
   * reserved lane grows with it. Probed on `frere-jacques`, `partHeightAbove` is 5.7187
   * pitch without the directive and 7.7832 with it.
   */
  readonly partsBox: boolean
  /**
   * `%%jazzchords` — set a chord symbol's modifier and bass note as small sub/superscripts.
   *
   * `translateChord` (`write/creation/translate-chord.js:12-34`) splits every chord into
   * root, modifier and `/bass` and rejoins them round a `\x03` marker; `svg.js:198-211`
   * then reads that marker and nests a `font-size:0.7em` tspan for each part present.
   *
   * It is not only cosmetic: the golden generator counts a text's NESTED tspans as
   * separate LINES, `h + (n-1) * fontSize * 1.2` (`dump-svg.js:120-124`), so `"x/C"`
   * measures three lines high and its chord lane reserves 38.4px more than a plain one.
   *
   * abcjs has no way to turn it off again — the directive only ever sets it TRUE
   * (`abc_parse_directive.js:791`).
   */
  readonly jazzChords: boolean
  /**
   * `%%percmap <abc-note> <drum-sound> [<note-head>]` — the NOTEHEAD a written pitch draws
   * on a percussion staff, keyed by the note as the directive spells it (`D`, `^B`, `_c'`).
   *
   * abcjs stores the whole entry on `tune.formatting.percmap` and the engraver reads only
   * `noteHead` (`abstract-engraver.js:681-688`), looking the pitch up through
   * `pitchesToPerc` — the accidental's first letter plus the vertical position, mapped back
   * to an ABC spelling (`synth/pitches-to-perc.js`). Out of that table's range, or on a
   * double accidental, there is no entry and the head is the ordinary one.
   *
   * The `sound` half is audio and is not modelled here.
   */
  /** `%%MIDI` written before the first note — the tune's own audio settings. */
  readonly midi?: Readonly<Record<string, readonly (string | number)[]>>
  readonly percMap: Readonly<Record<string, PercMapEntry>>
  /**
   * `%%MIDI drummap <abc-note> <midi>` — the written LETTER to a GM percussion pitch.
   *
   * abcjs stamps the result onto the note at PARSE time (`abc_parse_music.js:1127-1134`),
   * keyed by the raw source character plus any accidental prefix, and only on a percussion
   * clef. `adjustPitch` then returns that pitch outright — no key signature, no transpose.
   * Kept as a map rather than baked onto the note because the renderer has no use for it.
   */
  readonly drumMap?: Readonly<Record<string, number>>
  /**
   * `%%stretchlast` — whether to justify the LAST music line, and how nearly full it has
   * to be first. `null` when the directive is absent, which is a different rule and not a
   * default: abcjs then falls back to "justify only if the line is at least 66% of the
   * page", kept "for backward compatibility. The break isn't quite the same for some
   * reason" (`write/layout/layout.js:100-102`).
   *
   * With a value, the test is on how much the line LACKS:
   * `stretch = 1 - (lineWidth + padding) / targetWidth < stretchlast`
   * (`:104-107`). Bare `%%stretchlast` and `true` are 1, `false` is 0, and a number 0..1
   * is itself (`abc_parse_directive.js:1294-1305`).
   */
  readonly stretchLast: number | null
  /** `%%staffwidth` — the music area in PIXELS, or `null` for the engine default. */
  readonly staffWidth: number | null
  /**
   * `%%maxStaves` — an INCIPIT: draw at most this many staff lines and stop.
   *
   * abcjs counts them as it draws and `break`s past the limit
   * (`write/draw/draw.js:33-38`), so the rest of the tune is laid out and never painted.
   */
  readonly maxStaves: number | null
  /**
   * Free-text blocks standing BEFORE any music, in source order — one per `%%center`,
   * one per `%%text`, and ONE per `%%begintext` … `%%endtext` however many lines it holds.
   *
   * abcjs builds one `FreeText` per directive (`creation/elements/free-text.js`) and the
   * two spellings differ in more than alignment: `%%center` emits its row bare, `%%text`
   * spends `{ move: fontSize / 2 }` first. Measured on abcjs's own output with a control
   * pair — `%%center A` costs 23.27px and `%%text A` costs 33.77, and their rows sit
   * exactly that 10.5 apart.
   */
  readonly textAbove: readonly FreeTextBlock[]
  /**
   * The same standing AFTER the music. As well as being drawn, these make the last music
   * line no longer the LAST line, so abcjs justifies it like any other.
   *
   * ponytail: free text BETWEEN two music lines lands here too. No fixture does it, and
   * placing it properly needs free text to be a line in its own right rather than a
   * property of the tune.
   */
  readonly textBelow: readonly FreeTextBlock[]
  /**
   * Every `%%<type>font` the tune set. Absent entries mean "abcjs's default", and the
   * renderer answers those with its own constant rather than by computing a size that
   * happens to equal it — the same load-bearing null `vocalFont` has.
   */
  readonly fonts: Readonly<Partial<Record<AbcFontType, LyricFont>>>
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
