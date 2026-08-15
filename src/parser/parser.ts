/**
 * ABC parser — translation of abcMusicKit2's `ABCParser.swift`.
 *
 * Line-oriented and single-pass: this owns line splitting and field/music
 * classification, and runs the lexer only over music lines. Like the Swift
 * original it never throws — everything is lenient recovery plus collected
 * diagnostics.
 *
 * IMPLEMENTED: X/T/C/R/M/L/K/V headers and their inline `[V:2]` forms, notes, rests,
 * chords, barlines, measures, broken rhythm, tuplets, microtones, `&` overlays,
 * `%%score` voice ordering, `%%begintext` blocks, `+:` continuations, chord symbols,
 * annotations and decorations.
 * Also read: `U:` user-defined symbols, `P:` part labels, `w:`/`W:` lyrics, and the
 * `clef=` / `octave=` / `middle=` / `stafflines=` / `style=` modifiers on both `K:` and
 * `V:`.
 * ponytail: DEFERRED — part ORDER (a header `P:ABAB`, which is a different thing from the
 * body `P:` label), symbol lines (`s:`), a `transpose=` written on `K:` rather than `V:`,
 * and most `%%` directives.
 * Each is a separate step driven by the corpus fixture that needs it; the lexer
 * already tokenizes all of them, so the work is parser-side only.
 */

import {
  ABC_FONT_DEFAULT_PT,
  type AbcFontType,
  Accidental,
  type Barline,
  type Chord,
  type Clef,
  type ClefShape,
  type CompatibilityMode,
  DEFAULT_STAFF_LINES,
  DEFAULT_VOCALFONT_PT,
  type Diagnostic,
  type DiatonicStep,
  defaultClef,
  defaultMode,
  type FreeTextBlock,
  type GracePitch,
  isCompoundMeter,
  isStrict,
  type KeyAccidental,
  type KeySignature,
  type LyricFont,
  type Measure,
  type Meter,
  type Mode,
  type MusicEvent,
  measureDuration,
  type Note,
  type NoteStyle,
  type PercMapEntry,
  type Pitch,
  type Rational,
  type Rest,
  type RestKind,
  type RichText,
  ratEq,
  rational,
  ratLt,
  ratMul,
  type Score,
  type ScoreMetadata,
  type SourceRange,
  type StaffConnector,
  type StaffGroup,
  sourceRange,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import { Lexer, type Token } from './lexer.js'
import { decodeTextString, setAbcjsEscapes } from './text.js'

/**
 * Both branches carry everything.
 *
 * An ABC file is a collection of tunes, so a fatal error in one must not discard the
 * others — the original shape returned only `errors` on failure, throwing away every
 * successfully parsed score and every warning alongside it. `ok` reports whether any
 * diagnostic reached `error` severity; `scores` and `diagnostics` are always present, and
 * `errors` is the pre-filtered subset so a consumer need not filter by severity itself.
 *
 * Nothing currently emits `error` severity, so `ok` is always true today. The branch is
 * kept because ARCHITECTURE.md mandates a Result type and fatal errors are a plausible
 * near-term need — but it no longer loses work if one appears.
 */
export type ParseResult = {
  readonly scores: readonly Score[]
  readonly diagnostics: readonly Diagnostic[]
} & ({ readonly ok: true } | { readonly ok: false; readonly errors: readonly Diagnostic[] })

/**
 * abcjs's `drumNames` — General MIDI percussion 35 to 81, in order, one name per pitch.
 *
 * `%%percmap D bass-drum-1` resolves by POSITION: `drumNames.indexOf(name) + 35`
 * (`abc_parse_directive.js:343-406`). The list IS the mapping; there is no table of
 * name→number anywhere in abcjs, which is why the order is load-bearing and the entries
 * are reproduced verbatim rather than sorted or de-duplicated.
 */
const DRUM_NAMES: readonly string[] = [
  'acoustic-bass-drum',
  'bass-drum-1',
  'side-stick',
  'acoustic-snare',
  'hand-clap',
  'electric-snare',
  'low-floor-tom',
  'closed-hi-hat',
  'high-floor-tom',
  'pedal-hi-hat',
  'low-tom',
  'open-hi-hat',
  'low-mid-tom',
  'hi-mid-tom',
  'crash-cymbal-1',
  'high-tom',
  'ride-cymbal-1',
  'chinese-cymbal',
  'ride-bell',
  'tambourine',
  'splash-cymbal',
  'cowbell',
  'crash-cymbal-2',
  'vibraslap',
  'ride-cymbal-2',
  'hi-bongo',
  'low-bongo',
  'mute-hi-conga',
  'open-hi-conga',
  'low-conga',
  'high-timbale',
  'low-timbale',
  'high-agogo',
  'low-agogo',
  'cabasa',
  'maracas',
  'short-whistle',
  'long-whistle',
  'short-guiro',
  'long-guiro',
  'claves',
  'hi-wood-block',
  'low-wood-block',
  'mute-cuica',
  'open-cuica',
  'mute-triangle',
  'open-triangle',
]

// ─── Field parsing ───────────────────────────────────────────────────────────

const MODES: ReadonlyArray<readonly [string, Mode]> = [
  ['mix', 'mixolydian'],
  ['dor', 'dorian'],
  ['phr', 'phrygian'],
  ['lyd', 'lydian'],
  ['loc', 'locrian'],
  // ABC accepts `ionian` and `aeolian`; they are folded to their canonical names so key
  // equality stays structural.
  ['ion', 'major'],
  ['aeo', 'minor'],
  ['maj', 'major'],
  ['min', 'minor'],
  ['m', 'minor'],
]

/**
 * A fresh object each call. Returning one shared constant meant the first parse() froze a
 * module-level singleton — a cross-call side effect from a pure function — and made
 * `scoreA.key === scoreB.key` true for any two C-major tunes.
 */
const defaultKey = (): KeySignature => ({
  tonic: { step: 'c', accidental: Accidental.natural },
  mode: 'major',
  none: false,
})

function parseKey(content: string): KeySignature {
  // `K:none` means NO key signature — no alterations, and a renderer draws nothing. It is
  // not C major, even though both alter no steps.
  if (/^none\b/i.test(content.trim())) return { ...defaultKey(), none: true }
  // `clef=`, `octave=`, `middle=` and `stafflines=` also ride on K:, and are read by the
  // K: case in `field()` rather than here — this function returns the KEY alone.
  // `transpose=` is SOUNDING-ONLY and rides on `V:` — see `Voice.transpose`. abcjs's
  // renderer never reads it either, so no "written half" is owed; this line used to call
  // it unrealized, which reads as work outstanding where there is none.
  //
  // ponytail: a `transpose=` written on `K:` rather than `V:` is not read. abcjs accepts
  // both — the modifier switch is shared (`abc_parse_key_voice.js:411`) — and no fixture
  // in either corpus and no audio case writes the K: form, so it has no oracle yet.
  const spec = (content.split(/\s+/)[0] ?? '').trim()
  // UPPERCASE ONLY. abcjs's `getKeyPitch` is a switch on `A`..`G` with the lowercase cases
  // COMMENTED OUT (`abc_tokenizer.js:33-46`), so `K:cm` finds no key at all and the tune
  // is C major with nothing printed — `synth-midi-02-staccato` is exactly that, and
  // drawing C minor's three flats put every note in it 34.3px right of abcjs's.
  const head = spec[0]
  if (!head || head < 'A' || head > 'G') return defaultKey()

  let i = 1
  let accidental: Accidental = Accidental.natural
  if (spec[i] === '#') {
    accidental = Accidental.sharp
    i++
  } else if (spec[i] === 'b') {
    accidental = Accidental.flat
    i++
  }

  // THE MODE MAY BE ITS OWN TOKEN. `K:F# dor` is F# dorian — abcjs consumes the pitch and
  // the accidental and THEN calls `getMode` on whatever is left, across the space
  // (`abc_parse_key_voice.js:256-283`). Reading only the first token made it F# MAJOR:
  // six sharps against dorian's four, and `visual-transpose-output-06`'s single note sat
  // 20.5px right of abcjs's on two accidentals it should never have drawn.
  //
  // MATCHED ON THE FIRST THREE CHARACTERS, exactly as `getMode` does, and never as a
  // prefix of the whole word: `m` is minor only when it stands alone, so `middle=B` and
  // `merge` cannot be read as one.
  const modeOf = (word: string): Mode | null => {
    const w = word.toLowerCase()
    return MODES.find(([prefix]) => prefix === (w.length === 1 ? w : w.slice(0, 3)))?.[1] ?? null
  }
  const rest = spec.slice(i)
  const next = content.trim().split(/\s+/)[1] ?? ''
  const mode = modeOf(rest) ?? (rest === '' ? modeOf(next) : null) ?? 'major'
  const extra = parseKeyAccidentals(content)
  return {
    tonic: { step: head.toLowerCase() as DiatonicStep, accidental },
    mode,
    none: false,
    ...(extra.length > 0 ? { extra } : {}),
  }
}

/**
 * `^/f`, `_B`, `__A`, `=c` — accidentals written on a `K:` field after the key and mode.
 *
 * abcjs's `getKeyAccidentals2` (`abc_tokenizer.js:283-340`): `^` optionally doubled or
 * followed by `/`, likewise `_`, or a bare `=`, then a note letter. In QUARTER tones,
 * because the field can write a half-sharp that `Accidental` has no value for.
 *
 * Everything else on the field — `clef=`, `octave=`, `stafflines=` — carries no `^` or `_`
 * before a letter, so a scan over the whole value cannot collide with it. `middle=` is the
 * one to watch and it has none either.
 */
function parseKeyAccidentals(content: string): KeyAccidental[] {
  const out: KeyAccidental[] = []
  for (const m of content.matchAll(/(\^\^|\^\/|\^|__|_\/|_|=)([A-Ga-g])(?![A-Za-z=])/g)) {
    const sign = m[1] ?? ''
    const quarters =
      sign === '^^'
        ? 4
        : sign === '^/'
          ? 1
          : sign === '^'
            ? 2
            : sign === '__'
              ? -4
              : sign === '_/'
                ? -1
                : sign === '_'
                  ? -2
                  : 0
    out.push({ step: (m[2] ?? 'c').toLowerCase() as DiatonicStep, quarters })
  }
  return out
}

function parseMeter(content: string): Meter | null {
  const spec = content.trim()
  if (spec === 'C') return { numerator: 4, denominator: 4, symbol: 'common' }
  if (spec === 'C|') return { numerator: 2, denominator: 2, symbol: 'cut' }
  if (spec === 'none' || spec === '') return null

  const [top, bottom] = spec.split('/')
  const denominator = Number.parseInt(bottom ?? '', 10)
  if (!top || !Number.isFinite(denominator) || denominator <= 0) return null
  // Additive meters (`3+2+2/8`) sum for DURATION and are drawn term by term — see
  // `Meter.numeratorParts`.
  const parts = top.split('+').map((part) => Number.parseInt(part, 10) || 0)
  const numerator = parts.reduce((sum, part) => sum + part, 0)
  if (numerator <= 0) return null
  return {
    numerator,
    denominator,
    symbol: 'numeric',
    ...(parts.length > 1 ? { numeratorParts: parts } : {}),
  }
}

function parseUnitLength(content: string): Rational | null {
  const [top, bottom] = content.trim().split('/')
  const numerator = Number.parseInt(top ?? '', 10)
  const denominator = bottom === undefined ? 1 : Number.parseInt(bottom, 10)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return rational(numerator, denominator)
}

/** ABC's meter-derived default: shorter than 3/4 implies 1/16, otherwise 1/8. */
const defaultUnitLength = (meter: Meter | null): Rational =>
  meter && ratLt(measureDuration(meter), rational(3, 4)) ? rational(1, 16) : rational(1, 8)

const BARLINES: Record<string, Barline> = {
  '[': 'invisible',
  '[|]': 'invisible',
  '|': 'thin',
  '||': 'double',
  '|]': 'final',
  '[|': 'thickThin',
  '|:': 'repeatStart',
  ':|': 'repeatEnd',
  '::': 'repeatBoth',
  ':|:': 'repeatBoth',
  ':||:': 'repeatBoth',
}

const DEFAULT_VOICE_ID = '1'

/**
 * Named ABC clefs → shape and default staff line.
 *
 * The line is a DEFAULT because ABC lets a digit override it: `bass3` is an F clef on
 * line 3 (the baritone), `alto1` a C clef on line 1 (the soprano), `alto2` a C clef on
 * line 2 (the mezzo-soprano). That is why the model stores a line rather than a name —
 * ABC can spell clefs that have no common name at all.
 */
const CLEF_NAMES: ReadonlyArray<readonly [string, ClefShape, number]> = [
  // Longest first: `treble` must not be matched by a shorter prefix, and `perc` must be
  // tried before nothing at all.
  ['treble', 'G', 2],
  ['bass', 'F', 4],
  ['alto', 'C', 3],
  ['tenor', 'C', 4],
  ['baritone', 'F', 3],
  ['mezzosoprano', 'C', 2],
  ['soprano', 'C', 1],
  // **A PERCUSSION CLEF SITS ON THE MIDDLE LINE AND STILL READS LIKE TREBLE.** abcjs's
  // table gives it `{ pitch: 6, mid: 0 }` (`abc_parse_key_voice.js:35`) — where treble is
  // `{ pitch: 4, mid: 0 }` — so its two columns disagree: the GLYPH goes on line 3 and the
  // PITCH mapping is treble's. Ours derives the mapping FROM the line, so line 2 drew the
  // glyph 7.75px low on all four percussion fixtures; line 3 with a matching
  // `CLEF_REFERENCE` keeps B4 on the middle line and moves only the glyph.
  ['perc', 'percussion', 3],
  // `none` carries no `pitch` at all — it draws nothing — so its line is only a mapping.
  ['none', 'none', 2],
]

/**
 * A clef from a `K:` or `V:` field value, or `null` if the field names none.
 *
 * Accepts both ABC spellings: `clef=bass` and a bare clef name, as in `K:C bass`. The
 * optional trailing digit overrides the staff line and `+8` / `-8` sets the sounding
 * octave — `clef=treble-8` is the tenor's octave-down treble clef.
 */
export function parseClef(spec: string): Clef | null {
  const middleOverride = middleLineOverride(spec)
  const staffLines = staffLineCount(spec)
  const build = (name: string, digit: string, octave: string): Clef | null => {
    const entry = CLEF_NAMES.find(([n]) => n === name.toLowerCase())
    if (!entry) return null
    const [, shape, defaultLine] = entry
    const line = digit ? Number.parseInt(digit, 10) : defaultLine
    return {
      shape,
      line: line >= 1 && line <= 5 ? line : defaultLine,
      octaveShift: octave === '+8' ? 1 : octave === '-8' ? -1 : 0,
      middleOverride,
      staffLines,
    }
  }

  const explicit = /clef=([a-z]+)(\d?)([+-]8)?/i.exec(spec)
  if (explicit) return build(explicit[1] ?? '', explicit[2] ?? '', explicit[3] ?? '')

  // Bare form, as in `K:C bass`. EVERY word is tried, not just the first: the first word
  // of a K: field is the key itself, so returning on the first non-clef match would never
  // reach the clef. A word that names no clef is simply some other token — a mode, a
  // `name=`, a `stafflines=` — and is skipped rather than defaulting to something.
  //
  // MATCHED BY PREFIX, NOT AS A WHOLE WORD. abcjs's `getClef` is a chain of
  // `startsWith` — `treble`, `bass3`, `bass`, `tenor`, `alto2`, `alto1`, `alto`, `perc` —
  // and after the name it consumes only `+8` or `-8`, leaving anything else where it is
  // (`abc_tokenizer.js:95-155`). So `bass,,` IS the bass clef with two stray commas, and
  // requiring the token to end at whitespace read it as no clef at all and defaulted the
  // voice to treble. `abcjs-visual-layout-07`'s lower staff is written that way.
  //
  // Quoted strings go first so a `name="Bass line"` cannot name a clef.
  //
  // AND THE FIRST TOKEN IS NEVER A CLEF. `parseKeyVoice` consumes it as the KEY (or, on a
  // `V:`, as the id) and SHIFTS IT OFF before the modifier switch that reads clef names
  // ever runs (`abc_parse_key_voice.js:227-250,440-470`). That is the whole difference
  // between `K:none` and `K:C none`: the first is the none KEY over a treble clef, the
  // second is C major with no clef at all, and abcjs draws them 34.05px apart. Reading
  // every word made both of them clef-less.
  //
  // "THE FIRST TOKEN" MEANS THE ONE `parseKeyVoice` ACTUALLY CONSUMED. It shifts the token
  // off only when it IS a key — `HP`, `Hp`, `none`, or an UPPERCASE A..G — and leaves it
  // in place otherwise. `K: bass` is the difference: `b` is not a key pitch to abcjs, so
  // `bass` stays and is read as the clef. Skipping the first word unconditionally lost
  // that and put `parse-note-id-01` 105px out.
  const first = spec.trim().split(/\s+/)[0] ?? ''
  const isKey = /^(HP|Hp|none$|[A-G])/.test(first)
  const modifiers = spec.replace(/"[^"]*"/g, ' ').replace(isKey ? /^\s*\S+/ : /^$/, '')
  for (const m of modifiers.matchAll(/(?:^|\s)([a-z]+)(\d?)([+-]8)?/gi)) {
    const clef = build(m[1] ?? '', m[2] ?? '', m[3] ?? '')
    if (clef) return clef
  }
  return null
}

/**
 * A `V:`/`K:` field's clef, or the one already in force with its `stafflines=` updated.
 *
 * `stafflines=` can appear with no clef beside it — `V:1 stafflines=1` is a perfectly good
 * rhythm staff — and `parseClef` rightly returns null there, since the field names no clef.
 * So the count is applied to whatever clef the voice already has rather than forcing a
 * default treble alongside it.
 */
function clefWith(current: Clef, spec: string): Clef {
  return parseClef(spec) ?? { ...current, staffLines: staffLineCount(spec) }
}

/**
 * A `V:` field's OPTION tokens — the value with its quoted strings and its leading id
 * removed, so a bare keyword can be looked for without a voice called `up` or a
 * `name="merge"` matching it. abcjs reads the id first and then tokenises the rest
 * (`abc_parse_key_voice.js:518-800`); this is the same split.
 */
const voiceOptions = (spec: string): string =>
  ` ${spec
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(1)
    .join(' ')} `

/**
 * `V:… stems=up|down`, or the BARE `up` / `down` that mean the same thing.
 *
 * abcjs gives them one case each and both assign `voices[id].stem`
 * (`abc_parse_key_voice.js:717-732`) — `stems=` goes through `getVoiceToken`, the bare
 * form is the token itself. ABC 2.1 §4.19 documents only the first spelling; abcjs accepts
 * both, and its own test fixtures use the bare one (`V:1 up`, `V:2 merge down`).
 */
function stemModifier(spec: string): 'up' | 'down' | null {
  // `stem=` AND `stems=`. abcjs's switch takes both spellings
  // (`abc_parse_key_voice.js:717-718`) and `synth-flattener-28` writes the singular —
  // which left its percussion voice stemming by pitch, 11.63px of staff.
  const explicit = /\bstems?=(up|down)\b/i.exec(spec)
  if (explicit?.[1] !== undefined) return explicit[1].toLowerCase() as 'up' | 'down'
  const bare = /\s(up|down)\s/i.exec(voiceOptions(spec))
  return bare?.[1] === undefined ? null : (bare[1].toLowerCase() as 'up' | 'down')
}

/**
 * `V:… merge` — this voice shares the PREVIOUS voice's staff instead of opening its own.
 *
 * abcjs's algorithm, and it is the whole of it: a `V:` builds `staffInfo` with
 * `startStaff: isNew` — true the first time an id is seen — and `case 'merge'` sets it
 * false (`abc_parse_key_voice.js:518,714-716`). Then
 * `if (staffInfo.startStaff || staves.length === 0) staves.push(…)` and the voice takes
 * `staffNum = staves.length - 1` (`:803-810`), assigned once and never revised. So the
 * FIRST voice always gets a staff whatever it says, and a merging voice lands on whichever
 * staff was opened last.
 */
const mergesStaff = (spec: string): boolean => /\smerge\s/i.test(voiceOptions(spec))

/** `stafflines=` written with no `clef=` beside it — see `Voice.staffLineOverride`. */
const bareStaffLines = (spec: string): number | null =>
  /\bstafflines=/i.test(spec) && parseClef(spec) === null ? staffLineCount(spec) : null

/**
 * `V:… stafflines=<n>` → how many staff lines to draw, defaulting to five.
 *
 * abcjs clamps to 0–10 (`test/abc_parser_lint.js:164`) and treats anything else as absent,
 * which is what a non-integer or out-of-range value falls back to here. `stafflines=0` is a
 * real value, not "unset" — it draws no staff at all — so the range test has to admit it.
 */
function staffLineCount(spec: string): number {
  const m = /\bstafflines=(-?\d+)/i.exec(spec)
  if (!m) return DEFAULT_STAFF_LINES
  const n = Number.parseInt(m[1] ?? '', 10)
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : DEFAULT_STAFF_LINES
}

/**
 * `V:… middle=<pitch>` (or `m=`) → the diatonic index of the pitch on the MIDDLE staff
 * line, or `null` if absent. The pitch is written in ABC: an uppercase letter is octave 4,
 * lowercase octave 5, each `'` an octave up and each `,` down — so `middle=d` is D5.
 *
 * Diatonic index matches the renderer's `diatonicIndex`: `stepIndex(step) + 7 * octave`.
 * D5 = 1 + 7×5 = 36, which is what `clef=bass middle=d` puts on the middle line in place of
 * plain bass's D3 (22). Only diatonic letter + octave marks are read; a `middle=` with an
 * accidental (`middle=^c`) drops the accidental, which does not affect the LINE a pitch
 * sits on. No corpus fixture writes one.
 */
function middleLineOverride(spec: string): number | null {
  // `middle=` and `transpose=` interact — a vocal score writes its basses in treble range,
  // shifts them down whole octaves with `transpose=`, and repositions the clef with
  // `middle=` so they read correctly, the two nearly cancelling (`zocharti-loch`). Honour
  // `middle=` only when `transpose=` is absent, which is what abcjs's output does.
  //
  // NOT a placeholder for unimplemented work, though it was recorded as one. abcjs's
  // RENDERER never reads `transpose=` at all: `src/write/` has zero references to it and
  // only `src/synth/` uses it, so it is an audio-only field there and there is no "written
  // half" owed. (`create-clef.js:30-31` likewise has its `verticalPos` line commented out.)
  // Both `middle=` fixtures confirm the guard reproduces abcjs — `voice-middle-after-clef`
  // at dy 0.0 with it honoured, `zocharti-loch` at dy 0.9 with it suppressed. Measured, not
  // reasoned: honouring `middle=` here anyway sent zocharti to dy 72.
  if (/\btranspose=/.test(spec)) return null
  const m = /\b(?:middle|m)=\^*_*=?([A-Ga-g])([,']*)/.exec(spec)
  if (!m) return null
  const letter = m[1] ?? ''
  const step = stepIndex(letter.toLowerCase() as DiatonicStep)
  if (step < 0) return null
  let octave = letter === letter.toUpperCase() ? 4 : 5
  for (const mark of m[2] ?? '') octave += mark === "'" ? 1 : -1
  return step + 7 * octave
}

/**
 * A `Q:` tempo field.
 *
 * Handles every spelling the corpus uses — `Q:1/4=120`, `Q:"Adagio"`,
 * `Q:"Allegro" 1/4 = 120 % comment`, and the legacy bare `Q:120` — by looking for each
 * part independently rather than matching whole forms, since any part may be absent.
 * Returns null when none is found, so a malformed field declares no tempo instead of a
 * default one.
 */
function parseTempo(content: string): Tempo | null {
  // A `%` starts a comment; strip before parsing, or `% tempo` reads as a stray word.
  const spec = (content.split('%')[0] ?? '').trim()

  // `1/4=120`, tolerating spaces round the `=`. Take the beat unit only when it is
  // attached to a rate — a lone fraction is not a tempo.
  const rate = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)/.exec(spec)
  /**
   * **WHICH SIDE OF THE RATE A QUOTE FALLS ON IS THE WHOLE RULE.** abcjs shifts tokens in
   * order: a leading `quote` is `preString`, and a `quote` still there once the rate has
   * been read is `postString` (`abc_parse_header.js:257-330`). So
   * `[Q:"left" 1/4=170"right"]` is two strings, one each side, and a lone quote before the
   * rate is the PRE one however it reads. Ours took the first quote and dropped any second.
   */
  const quotes = [...spec.matchAll(/"([^"]*)"/g)]
  const rateAt = rate?.index ?? Number.POSITIVE_INFINITY
  const text = quotes.find((q) => q.index < rateAt)?.[1] ?? null
  const postText = quotes.find((q) => q.index > rateAt)?.[1] ?? null
  let beatUnit: Rational | null = null
  let bpm: number | null = null
  if (rate) {
    const numerator = Number.parseInt(rate[1] ?? '', 10)
    const denominator = Number.parseInt(rate[2] ?? '', 10)
    if (Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0) {
      beatUnit = rational(numerator, denominator)
    }
    bpm = Number.parseInt(rate[3] ?? '', 10)
  } else {
    // Legacy `Q:120` — a bare number is a rate with no stated unit. Guarded against
    // picking up a digit out of the quoted text.
    const bare = /(?:^|\s)(\d+)\s*$/.exec(spec.replace(/"[^"]*"/g, ''))
    if (bare) bpm = Number.parseInt(bare[1] ?? '', 10)
  }

  if (bpm !== null && !Number.isFinite(bpm)) bpm = null
  if (text === null && postText === null && bpm === null) return null
  return { beatUnit, bpm, text, postText }
}

/**
 * A `Q:` that states a rate but no beat unit gets one from the METER, not from `L:`.
 *
 * abcjs defers exactly this — `setTempo` returns `delaySet` for `Q:120` and `Q:C=120`
 * because the `M:` may not have been read yet, and `calcTempo` finishes the job at the end
 * of the header with `dur = 1 / meter.denominator`, falling back to a quarter
 * (`abc_parse_header.js:139-150`). Its `TempoElement` then draws that note beside the
 * number, `noteheads.quarter` and a stem for anything down to a quarter
 * (`tempo-element.js:15,32-56`).
 *
 * We resolved nothing and drew no note, so `ragtime-nightingale`'s `Q:80` came out as a
 * bare `= 80` — the one stem in its 1017 that abcjs draws and we did not, found by diffing
 * the two SVGs' stems rather than by reading either engine.
 *
 * `L:` is deliberately not consulted: ragtime is `M:2/4` with `L:1/4`, and abcjs's own
 * commented-out `default_length` line beside the meter one says it chose.
 */
function resolveBeatUnit(tempo: Tempo | null, meter: Meter | null): Tempo | null {
  if (tempo === null || tempo.bpm === null || tempo.beatUnit !== null) return tempo
  return { ...tempo, beatUnit: rational(1, meter?.denominator ?? 4) }
}

/** Move every written pitch in a measure by whole octaves — `V:… octave=±n`. */
function shiftMeasure(measure: Measure, octaves: number): Measure {
  const move = <P extends Pitch>(pitch: P): P => ({ ...pitch, octave: pitch.octave + octaves })
  const shift = (event: MusicEvent): MusicEvent => {
    if (event.type === 'rest') return event
    if (event.type === 'note') {
      return { ...event, pitch: move(event.pitch), graceNotes: event.graceNotes.map(move) }
    }
    return { ...event, pitches: event.pitches.map(move), graceNotes: event.graceNotes.map(move) }
  }
  return {
    ...measure,
    events: measure.events.map(shift),
    overlays: measure.overlays.map((layer) => layer.map(shift)),
  }
}

/**
 * An `&` overlay is a VOICE, so it exists for the whole tune — not only where it sings.
 *
 * abcjs models it that way: for `C2 E2 | G2 &E2 B2 | A2 G2 |` its overlay voice is a
 * whole-measure invisible rest, then `E B`, then another whole-measure invisible rest.
 * We emitted just the two notes, so the tune had two fewer elements and `S5-directives`
 * failed a beam gate on LENGTH while every beam link in it matched.
 *
 * Padding with an invisible rest changes nothing on the page — it draws nothing — but it
 * makes the overlay a voice rather than a fragment, which is what it is.
 */
function padOverlays(measures: readonly Measure[], _meter: Meter | null): Measure[] {
  const layers = Math.max(0, ...measures.map((m) => m.overlays.length))
  if (layers === 0) return [...measures]

  return measures.map((measure) => {
    if (measure.overlays.length === layers) return measure
    // THE PAD IS THE MEASURE'S OWN DURATION, NOT THE METER'S. abcjs sums
    // `durationThisBar` over the measure's notes — SPACERS EXCLUDED — and pushes one
    // invisible rest of exactly that, `if (durationThisBar > 0)`
    // (`tune-builder.js:572-575`). A pickup bar therefore pads to the pickup, not to a
    // full measure: `synth-flattener-22`'s `B, |` padded to 1 where abcjs pads to 0.25,
    // and the overlay voice then wanted a whole note's spring under a quarter note.
    const filled = measure.events.reduce(
      (sum, event) =>
        event.type === 'rest' && event.kind === 'spacer'
          ? sum
          : rational(
              sum.numerator * event.duration.denominator +
                event.duration.numerator * sum.denominator,
              sum.denominator * event.duration.denominator,
            ),
      rational(0, 1),
    )
    if (filled.numerator === 0) return measure
    const padded = Array.from({ length: layers }, (_, i) => {
      const existing = measure.overlays[i]
      if (existing !== undefined && existing.length > 0) return existing
      const rest: Rest = {
        type: 'rest',
        kind: 'invisible',
        duration: filled,
        notatedDuration: filled,
        decorations: [],
        decorationSourceRanges: [],
        chordSymbol: null,
        chordSymbolSourceRange: null,
        chordFont: null,
        annotations: [],
        annotationSourceRanges: [],
        graceNotes: [],
        graceSlash: false,
        tuplet: null,
        measureCount: 0,
        sourceRange: null,
      }
      return [rest]
    })
    return { ...measure, overlays: padded }
  })
}

/**
 * `%%score` / `%%staves` — which staves exist and which voices sit on each.
 *
 * A port of abcjs's `abc_parse_directive.js:1046-1132`, by way of abcMusicKit v1's
 * line-cited Swift port of the same function. abcjs and v1 agree here by construction, so
 * ONE implementation serves all three modes; there is no split to make.
 *
 * The whole sharing rule is `newStaff = !openParen || justOpenParen`: a voice opens a new
 * staff unless it is inside `( … )` and not the first one there. So `{1 (2 3)}` is two
 * staves, not three.
 *
 * `%%staves` differs from `%%score` in exactly one way — it connects barlines after EVERY
 * voice, where `%%score` connects only where the directive writes `|`.
 */
function parseStaffGroups(spec: string, directive: 'score' | 'staves'): MutableStaffGroup[] {
  const staves: MutableStaffGroup[] = []
  const voiceStaff = new Map<string, number>()

  let openParen = false
  let openBracket = false
  let openBrace = false
  let justOpenParen = false
  let justOpenBracket = false
  let justOpenBrace = false
  let continueBar = false
  let lastStaff: number | null = null

  /** `|` — barlines run through to the staff below. */
  const addContinueBar = (): void => {
    continueBar = true
    if (lastStaff === null) return
    const previous = lastStaff > 0 ? staves[lastStaff - 1]?.connectBarLines : null
    const staff = staves[lastStaff]
    if (staff !== undefined) {
      staff.connectBarLines = previous === 'start' || previous === 'continue' ? 'continue' : 'start'
    }
  }

  const addVoice = (id: string, newStaff: boolean): void => {
    if (newStaff || staves.length === 0) {
      staves.push({ voiceIds: [], brace: null, bracket: null, connectBarLines: null })
    }
    const index = staves.length - 1
    const staff = staves[index]
    if (staff === undefined) return
    // First writer wins, matching abcjs: a group's opening mark is not overwritten by the
    // `continue` of a voice added after it.
    if (justOpenBracket) staff.bracket ??= 'start'
    else if (openBracket) staff.bracket ??= 'continue'
    if (justOpenBrace) staff.brace ??= 'start'
    else if (openBrace) staff.brace ??= 'continue'
    if (continueBar) staff.connectBarLines = 'end'
    if (!voiceStaff.has(id)) {
      voiceStaff.set(id, index)
      staff.voiceIds.push(id)
    }
    lastStaff = index
  }

  // Tokens are the punctuation characters and runs of everything else, which is what a
  // voice id is — `RH`, `LH`, `1`, `mpguitarlow`.
  for (const token of spec.match(/[()[\]{}|]|[^\s()[\]{}|]+/g) ?? []) {
    switch (token) {
      case '(':
        if (!openParen) {
          openParen = true
          justOpenParen = true
        }
        break
      case ')':
        openParen = false
        break
      case '[':
        if (!openBracket) {
          openBracket = true
          justOpenBracket = true
        }
        break
      case ']':
        openBracket = false
        if (lastStaff !== null) {
          const staff = staves[lastStaff]
          if (staff !== undefined) staff.bracket = 'end'
        }
        break
      case '{':
        if (!openBrace) {
          openBrace = true
          justOpenBrace = true
        }
        break
      case '}':
        openBrace = false
        if (lastStaff !== null) {
          const staff = staves[lastStaff]
          if (staff !== undefined) staff.brace = 'end'
        }
        break
      case '|':
        addContinueBar()
        break
      default: {
        addVoice(token, !openParen || justOpenParen)
        justOpenParen = false
        justOpenBracket = false
        justOpenBrace = false
        continueBar = false
        if (directive === 'staves') addContinueBar()
      }
    }
  }
  return staves
}

interface MutableStaffGroup {
  voiceIds: string[]
  brace: StaffConnector | null
  bracket: StaffConnector | null
  connectBarLines: StaffConnector | null
}

/**
 * `style=` on a `K:` or `V:` field — the notehead shape for everything that follows.
 * Distinct from the `!style=x!` decoration, which applies to one note.
 *
 * MEASURED DIVERGENCE. abcjs honours this in a tune header (`K:C treble style=rhythm`)
 * and on an inline field at the START of a music line (`[K: style=harmonic]G A B c`), but
 * IGNORES it mid-line: `C|[K: style=harmonic]G A|` keeps plain quarter heads there.
 * Probed directly against 6.6.3. We honour it in all three positions.
 *
 * Not reproduced, deliberately. Matching it means teaching the parser where a line begins
 * so it can discard the field it just read, and no golden covers the case — abcjs's
 * element dumps are FIRST TUNE ONLY, and the corpus's only mid-line `[K: style=]` is in
 * S5-directives tune 1. So the quirk cannot be gated, and an ungated reproduction of a
 * bug is just an untested branch. Tune 0, which the goldens do cover, matches exactly.
 */
function styleModifier(spec: string): NoteStyle | null {
  const named = /(?:^|\s)style=([a-z]+)/i.exec(spec)?.[1]?.toLowerCase() as NoteStyle | undefined
  return named !== undefined && NOTE_STYLES.includes(named) ? named : null
}

/**
 * Does this `K:` content actually name a key?
 *
 * `K: style=harmonic` carries no key at all, and `parseKey` falls back to C major for
 * anything it cannot read — so without this check a style change silently becomes a key
 * change, wiping the tune's accidentals from that bar on.
 */
function hasKeySpec(content: string): boolean {
  const first = (content.trim().split(/\s+/)[0] ?? '').toLowerCase()
  return /^none\b/.test(first) || /^[a-g]/.test(first)
}

/**
 * `name=`/`nm=` and `subname=`/`sname=`/`snm=` on a `V:` field — the labels abcjs prints
 * to the left of the staff. Accepts a quoted value (`name="Violin I"`) or a bare single
 * token (`name=Vln`). Returns undefined when the attribute is absent, so a later `V:` for
 * the same voice does not clear a name an earlier one set.
 */
function voiceLabel(spec: string, keys: readonly string[]): string | undefined {
  const alt = keys.join('|')
  const match = new RegExp(`\\b(?:${alt})=(?:"([^"]*)"|(\\S+))`).exec(spec)
  if (match === null) return undefined
  return match[1] ?? match[2] ?? ''
}

/** `octave=±n` on a `V:` or `K:` field — a sounding shift, not a written-pitch change. */
function octaveModifier(spec: string): number | null {
  const match = /octave=(-?\d+)/.exec(spec)
  const value = match?.[1]
  return value === undefined ? null : Number.parseInt(value, 10)
}

const KNOWN_FIELDS = 'ABCDFGHIKLMNOPQRSTUVWXZmrsw'

/** Fields whose value is free text, so a `+:` continuation is meaningful. */
const CONTINUABLE_FIELDS = 'ABCDFGHNORSTZw'

// ─── Builders ────────────────────────────────────────────────────────────────

class VoiceBuilder {
  /**
   * Whether a `V:` or `[V:]` ever NAMED this voice, as against it being conjured by the
   * default `currentVoiceId` when the first music line began.
   *
   * `scanMusic` touches `builder.voice` to open the line before it has read the line's
   * tokens, so a tune whose every line starts with an inline `[V:T]` materialises an empty
   * voice `1` first. abcjs has no such voice: `setCurrentVoice` runs off the id the field
   * gives and nothing creates one otherwise. Left in, it took a whole extra staff on every
   * system of `visual-parsing-08` — three empty staves in a six-stave drawing.
   *
   * A tune with no `V:` at all still keeps its implicit voice: it holds the music, so it
   * is not empty.
   */
  explicit = false
  /**
   * `V:… octave=n` — the voice's OWN shift, or null when it never set one.
   *
   * Null is load-bearing: abcjs reads `currentVoice.octave !== undefined ?
   * currentVoice.octave : multilineVars.octave` PER NOTE
   * (`abc_parse_music.js:1113`), so a voice with no `octave=` of its own follows the
   * tune-level `K: octave=` — including one that arrives MID-TUNE.
   */
  octaveShift: number | null = null
  /** `V:… transpose=n` — semitones, sounding only. See `Voice.transpose`. */
  transpose = 0
  /** The effective shift as each measure CLOSED, since the tune-level one can change. */
  private readonly measureShifts: number[] = []
  /** `V:… stafflines=` with no `clef=` — see `Voice.staffLineOverride`. */
  staffLineOverride: number | null = null
  /** `V:… stems=up|down` — see `Voice.stemDirection`. */
  stemDirection: 'up' | 'down' | null = null
  /** `%%voicecolor` — see `Voice.color`. */
  color: string | null = null
  clef: Clef | null = null
  /** `V:… name=` / `subname=` — labels printed left of the staff. See `Voice`. */
  name: string | null = null
  subname: string | null = null
  /**
   * Notehead shape set by `K: style=` / `V: style=`, in force until the next one. Voice
   * state rather than per-note, which is what makes `[K: style=harmonic]` apply to a whole
   * passage. An inline `!style=x!` still overrides it for the one note it precedes.
   */
  noteStyle: NoteStyle = 'normal'
  /**
   * A `>`/`<` mark scales the NEXT event. It lives on the voice, not the scan of one
   * line: a plain line break does not end a measure, so `A>` at the end of one line and
   * `B` at the start of the next are still a broken-rhythm pair. Keeping it line-local
   * lengthened the first note and never shortened the second.
   */
  pendingBroken: Rational | null = null
  /**
   * Whether the event just emitted was scaled by a broken rhythm (`>` or `<`).
   *
   * Needed only by the beam rule: a broken rhythm cancels the chord-tie exception, and
   * `pendingBroken` is consumed at emit, so by the time the space is read it is gone.
   */
  lastBroken = false
  /** The tune's meter, so an empty overlay layer can be padded to a full measure. */
  meterForOverlays: Meter | null = null
  /** A mid-tune `K:`/`M:` applies to the measure it opens, so it pends until close. */
  private pendingKeyChange: KeySignature | null = null
  private pendingClefChange: Clef | null = null
  private pendingTempoChange: Tempo | null = null
  private pendingMidi: { cmd: string; params: readonly (string | number)[] }[] = []
  private pendingKeyChangeRange: SourceRange | null = null
  private pendingMeterChange: Meter | null = null
  private pendingMeterChangeRange: SourceRange | null = null
  private measures: Measure[] = []
  private events: MusicEvent[] = []
  private overlays: MusicEvent[][] = []
  /** Which `&` layer new events land in; null means the main line. */
  private overlayIndex: number | null = null
  private measureStart: number | null = null
  /** Lyric-bearing events emitted so far in the PRIMARY layer — the `w:` alignment index. */
  private noteCounter = 0
  /** The counter value when the current music line began; `w:` lines align from here. */
  private lineNoteStart = 0
  private readonly lyricLines: { start: number; syllables: Syllable[] }[] = []
  /** `s:` symbol lines, aligned to notes exactly as `w:` is. Non-strict modes only. */
  private readonly symbolLines: { start: number; syllables: Syllable[] }[] = []

  constructor(
    readonly id: string,
    /** The score's shared box of blocks waiting for the next system — see `ScoreBuilder`. */
    private readonly pendingTextBefore: { blocks: FreeTextBlock[] } = { blocks: [] },
    /** The tune-level `K: octave=`, shared and mutable — see `octaveShift`. */
    private readonly keyOctave: { value: number } = { value: 0 },
    /**
     * `%%barnumbers` / `%%measurenb` and the running count, shared across voices.
     *
     * abcjs keeps both on `multilineVars` and only the FIRST voice advances the counter
     * (`abc_parse_music.js:296-301`) — every other voice's barlines see the same numbers
     * without moving them. `every` is null while no directive has been seen; `%%setbarnb`
     * writes `current` directly.
     */
    private readonly barNumbering: {
      every: number | null
      current: number
      firstVoiceId: string | null
    } = { every: null, current: 1, firstVoiceId: null },
  ) {}

  /**
   * The number to print on the barline now closing, or null.
   *
   * `if (bar.type !== 'bar_invisible' && multilineVars.measureNotEmpty) { if
   * (isFirstVoice()) { currBarNumber++; if (barNumbers && currBarNumber % barNumbers ===
   * 0) bar.barNumber = currBarNumber } }`. So the number belongs to the measure the
   * barline OPENS, an empty measure does not advance it, and an invisible barline is not a
   * measure boundary for counting at all.
   */
  private takeBarNumber(barline: Barline, empty: boolean): { closingBarNumber?: number } {
    const n = this.barNumbering
    if (n.firstVoiceId !== this.id) return {}
    if (barline === 'invisible' || empty) return {}
    n.current += 1
    if (n.every === null || n.every === 0 || n.current % n.every !== 0) return {}
    return { closingBarNumber: n.current }
  }

  /**
   * `%%barnumbers 0` — THE NUMBER GOES ON THE STAFF, not on a barline.
   *
   *     if (multilineVars.barNumbers === 0 && isFirstVoice() && multilineVars.currBarNumber !== 1)
   *       params.barNumber = multilineVars.currBarNumber;
   *     tuneBuilder.startNewLine(params);
   *
   * (`abc_parse_music.js:1036-1038`.) A different mechanism from every other
   * `%%barnumbers N`, not a special case of one: `startNewLine` hangs it on the STAFF, and
   * `createABCStaff` passes it to `addMeasureNumber(abcstaff.barNumber, clef)` with the
   * CLEF as the element (`abstract-engraver.js:161`) — the only path on which
   * `abselem.isClef` and the `vert = 13.5` branch can fire at all.
   *
   * It is the number of the measure ABOUT to start, and `barNumbering.current` already IS
   * abcjs's `currBarNumber` — both start at 1 and both count the measure a barline OPENS —
   * so the guard is abcjs's own `!== 1` and the value needs no arithmetic.
   */
  private takeSystemBarNumber(startsSystem: boolean): { systemBarNumber?: number } {
    const n = this.barNumbering
    if (!startsSystem || n.every !== 0 || n.firstVoiceId !== this.id || n.current === 1) return {}
    return { systemBarNumber: n.current }
  }

  /** What `octave=` is worth for a measure closing NOW. */
  private takeOctave(): number {
    const shift = this.octaveShift ?? this.keyOctave.value
    this.measureShifts.push(shift)
    return shift
  }

  setKeyChange(key: KeySignature, range: SourceRange): void {
    this.pendingKeyChange = key
    this.pendingKeyChangeRange = range
  }

  /** A mid-tune `K:… clef=` or `[K: bass]`. Delta, like the key change. */
  setClefChange(clef: Clef): void {
    this.pendingClefChange = clef
  }

  /**
   * A `%%MIDI` written INSIDE the music — an element in the stream, not a tune setting.
   *
   * Attached to the measure being built, which is where the next `closeMeasure` will
   * carry it. abcjs appends it at the exact element position; a measure is close enough
   * for everything the flattener does with one (`gchord`, `drum`, `bassprog` and the
   * volume commands all take effect from a bar boundary either way).
   */
  addMidiCommand(cmd: string, params: readonly (string | number)[]): void {
    this.pendingMidi.push({ cmd, params })
  }

  /** A `Q:` after the first — printed where it stands. */
  setTempoChange(tempo: Tempo | null): void {
    this.pendingTempoChange = tempo
  }

  setMeterChange(meter: Meter | null, range: SourceRange, inline = false): void {
    this.pendingMeterChange = meter
    this.pendingMeterChangeRange = range
    this.pendingMeterChangeInline = inline
    // …AND ITS POSITION IN THE STREAM, because a measure can carry more than one and
    // abcjs draws every one of them where it stands. See `Measure.meterChanges`.
    this.pendingMeterChanges.push({ meter, at: this.events.length })
  }

  private pendingMeterChanges: { meter: Meter | null; at: number }[] = []

  private pendingMeterChangeInline = false

  /**
   * A STANDALONE `M:` LINE BELONGS TO THE NEXT LINE, NOT TO THE MEASURE STILL OPEN.
   *
   * abcjs holds it in `multilineVars.meter` and the next `startNewLine` consumes it into
   * `params.meter`, which becomes that LINE's staff meter and prints in its prefix
   * (`abc_parse_music.js:984-993`). An INLINE `[M:]` takes a different route entirely and
   * prints where it stands — measured on a pair of controls, abcjs draws the standalone
   * one at x 49.051 (straight after the clef of the next system) and the inline one at
   * 413.48 (mid-line), and ours already matched both.
   *
   * The two only part when a measure is still OPEN as the `M:` is read, because then
   * `takeChanges` hands it to that measure instead of the next line's first. That is
   * `frere-jacques`: its `M:4/4` sits four lines below the `+:` prose that strict scans as
   * MUSIC, so the change landed on the prose's own measure — a line abcjs had already
   * started and could not put a meter on. abcjs's next `startNewLine` is the `V:1` line,
   * which merges with the `P:A` music, so its meter prints at the head of THAT system.
   */
  setMeterForNextLine(meter: Meter | null, range: SourceRange): void {
    this.meterForNextLine = { meter, range }
  }

  private meterForNextLine: { meter: Meter | null; range: SourceRange } | null = null

  private takeChanges() {
    const changes = {
      keyChange: this.pendingKeyChange,
      clefChange: this.pendingClefChange,
      tempoChange: this.pendingTempoChange,
      ...(this.pendingMidi.length > 0 ? { midiCommands: this.pendingMidi } : {}),
      keyChangeSourceRange: this.pendingKeyChangeRange,
      meterChange: this.pendingMeterChange,
      meterChangeSourceRange: this.pendingMeterChangeRange,
      ...(this.pendingMeterChangeInline ? { meterChangeInline: true } : {}),
      ...(this.pendingMeterChanges.length > 1
        ? { meterChanges: this.pendingMeterChanges }
        : {}),
    }
    this.pendingKeyChange = null
    this.pendingClefChange = null
    this.pendingTempoChange = null
    this.pendingMidi = []
    this.pendingKeyChangeRange = null
    this.pendingMeterChange = null
    this.pendingMeterChangeRange = null
    this.pendingMeterChangeInline = false
    this.pendingMeterChanges = []
    return changes
  }

  noteMeasureStart(offset: number): void {
    if (this.measureStart === null) this.measureStart = offset
  }

  /** `&` opens the next overlay layer; the layer resets at the barline. */
  startOverlay(): void {
    this.overlayIndex = this.overlayIndex === null ? 0 : this.overlayIndex + 1
    while (this.overlays.length <= this.overlayIndex) this.overlays.push([])
  }

  private get target(): MusicEvent[] {
    if (this.overlayIndex === null) return this.events
    return this.overlays[this.overlayIndex] as MusicEvent[]
  }

  push(event: MusicEvent): void {
    this.target.push(event)
    this.appendedSinceLineStart = true
    // Lyrics align to the primary melody only: overlay notes do not advance the counter,
    // since an overlay plus lyrics is otherwise ambiguous. Rests bear no lyric.
    if (this.overlayIndex === null && event.type !== 'rest') this.noteCounter += 1
  }

  /** Called before scanning a music line, so following `w:` lines know where to start. */
  /**
   * A new line of music in the SOURCE, which is a new system on the page.
   *
   * ABC's default is one source line per printed staff line, and abcjs does not re-wrap
   * to fit — `parse/wrap_lines.js` runs only when a host passes BOTH `wrap` and
   * `staffwidth`, which the goldens do not. So the break points are the author's,
   * recorded here rather than recomputed.
   *
   * The measure is closed FIRST, barline-less, when a line ends mid-measure. abcjs starts
   * its new staff line at the source line whether or not a barline falls there, while our
   * systems break between measures — so without this the break has nowhere to land and
   * two source lines share one system. `frere-jacques` is the case that shows it: abcjs
   * parses its `+:` prose as music (a bug we reproduce), gives each prose line its own
   * staff line, and runs the last one straight into the first real bar.
   */
  /** Whether this voice has closed a measure since it last opened a line. */
  private wroteSinceLineStart = false
  /**
   * Whether anything at all has been appended since this line opened — abcjs's test for
   * whether `startNewLine` has FIRED yet. It fires lazily, once `parseMusicLine` is past
   * the inline statements at the head of the line (`abc_parse_music.js:152-156`), so a
   * field written before the first note or bar is still ahead of it. See `noteStyle`.
   */
  private appendedSinceLineStart = false
  /**
   * A `style=` that arrived MID-LINE and therefore belongs to the NEXT one. See the `K:`
   * arm of `applyField`; the mechanism is `meterForNextLine`'s exactly.
   */
  private styleForNextLine: NoteStyle | null = null

  /**
   * `K: style=` / `[K: style=]` — WHEN it takes effect, which is not where it stands.
   *
   * `parseKey` sets `multilineVars.style` immediately, but nothing reads it there: the
   * style reaches the drawing as an ELEMENT, appended by `createVoice` —
   * `if (params.style) self.appendElement('style', null, null, {head: params.style})`
   * (`tune-builder.js:963-971`) — and `createVoice` runs from `startNewLine`. So the
   * granularity is the music LINE, exactly as `%%vocalfont`'s is.
   *
   * MEASURED, because the source alone reads as "applies from here". On
   * `GAB2 !style=harmonic![gb]4|GAB2 [K: style=harmonic]gbgb|` abcjs draws the `[gb]` as
   * DIAMONDS and the four `gbgb` after the `[K:]` as ORDINARY OVAL HEADS — same path data
   * as the `G`, `A`, `B` before them, and its element probe reads `w = 9.810` for each
   * against the diamond's 7.500. The decoration form `!style=harmonic!` is per note and
   * immediate; the field form is not.
   *
   * A field at the HEAD of a line still applies to that line, because `startNewLine` has
   * not fired yet — the same lazy-line mechanism as findings 125 and 130.
   */
  setNoteStyle(style: NoteStyle, inline: boolean): void {
    if (inline && this.appendedSinceLineStart) this.styleForNextLine = style
    else this.noteStyle = style
  }

  beginMusicLine(): void {
    this.lineNoteStart = this.noteCounter
    this.closeUnterminatedMeasure()
    this.pendingLineStart = true
    this.wroteSinceLineStart = false
    this.appendedSinceLineStart = false
    // abcjs's `createVoice` reading `multilineVars.style` — see `setNoteStyle`.
    if (this.styleForNextLine !== null) {
      this.noteStyle = this.styleForNextLine
      this.styleForNextLine = null
    }
    // …AND THIS IS WHERE A STANDALONE `M:` LANDS — abcjs's `startNewLine` consuming
    // `multilineVars.meter`. See `setMeterForNextLine`. It is promoted AFTER
    // `closeUnterminatedMeasure`, so the measure this line opens gets it and the one it
    // closes does not.
    if (this.meterForNextLine !== null) {
      this.pendingMeterChange = this.meterForNextLine.meter
      this.pendingMeterChangeRange = this.meterForNextLine.range
      this.pendingMeterChanges.push({ meter: this.meterForNextLine.meter, at: this.events.length })
      // The standalone form, by construction — this is abcjs's `startNewLine` consuming
      // `multilineVars.meter`, which the inline arm never fills.
      this.pendingMeterChangeInline = false
      this.meterForNextLine = null
    }
  }

  /**
   * A `[V:x]` SWITCH opens a new line for x when x already has music on this one.
   *
   * abcjs's `setCurrentVoice` scans `tune.lines` from the top and points `lineNum` at the
   * first line where this voice is undefined or holds no notes
   * (`parse/tune-builder.js:410-428`); `startNewLine` does the same thing from the other
   * end, incrementing past any line whose voice `containsNotes` (`:334-357`). A voice only
   * ever appends, so both reduce to: if it has written here, move on.
   *
   * `[V:T]c|[V:B]A|[V:T]d|` is one source line and TWO printed systems because of it —
   * T's `d` cannot share a line with its own `c`.
   */
  switchedTo(): void {
    if (this.wroteSinceLineStart) this.beginMusicLine()
  }

  addLyricLine(syllables: Syllable[]): void {
    this.lyricLines.push({ start: this.lineNoteStart, syllables })
  }

  addSymbolLine(syllables: Syllable[]): void {
    this.symbolLines.push({ start: this.lineNoteStart, syllables })
  }

  /** Extend the lyric line in progress — a `\` continuation, not a new verse. */
  appendLyricLine(syllables: Syllable[]): void {
    const current = this.lyricLines[this.lyricLines.length - 1]
    if (current === undefined) {
      this.addLyricLine(syllables)
      return
    }
    current.syllables.push(...syllables)
  }

  /**
   * Distribute `s:` symbols onto notes by position — the CORRECT reading, which strict
   * mode never reaches.
   *
   * ABC 2.1 §8.2: an `s:` line aligns decorations under its music line the same way `w:`
   * aligns syllables, sharing that field's whole token grammar — space advances a note,
   * `*` skips one, `|` skips to the next barline. So it reuses the `w:` splitter and the
   * same index walk rather than growing a second one.
   *
   * abcjs does NOT do this. It reads `s:` with its `w:` parser and pushes the result onto
   * `el.lyric`, so the symbols come out as lyric TEXT under the staff — its own comment at
   * `parse/abc_parse.js:325` says "Currently copied from w: line. This needs to be read as
   * symbols instead." `abcjs-strict` reproduces that by routing the line to the lyric path
   * at the field, so nothing here runs in that mode; see the `s` case in `field`.
   *
   * The `!`/`+` delimiters are stripped so a symbol joins the same namespace `U:` and the
   * inline `!trill!` form use. A token that names no decoration is simply carried — the
   * renderer draws what it knows and ignores the rest, exactly as it does for an inline one.
   */
  private applySymbols(): void {
    if (this.symbolLines.length === 0) return
    const symbols = new Map<number, string[]>()
    for (const line of this.symbolLines) {
      line.syllables.forEach((token, offset) => {
        if (token.kind === 'skip' || token.text === null) return
        const name = token.text.replace(/^[!+]|[!+]$/g, '')
        if (name === '') return
        const at = line.start + offset
        symbols.set(at, [...(symbols.get(at) ?? []), name])
      })
    }
    if (symbols.size === 0) return

    let index = 0
    // Rebuilt rather than mutated, for the reason `applyLyrics` gives.
    this.measures = this.measures.map((measure) => ({
      ...measure,
      events: measure.events.map((event) => {
        if (event.type === 'rest') return event
        const extra = symbols.get(index)
        index += 1
        // Appended, so an inline `!trill!` on the same note keeps its place in the stack.
        return extra === undefined
          ? event
          : { ...event, decorations: [...event.decorations, ...extra] }
      }),
    }))
  }

  /**
   * Distribute `w:` syllables onto lyric-bearing events by position.
   *
   * Several `w:` lines after the same music line are successive verses of that line, and
   * verse numbering is per music line — the second line's first `w:` continues verse 1.
   */
  private applyLyrics(): void {
    if (this.lyricLines.length === 0) return
    const verses: Map<number, Syllable>[] = []
    const verseOfStart = new Map<number, number>()
    for (const line of this.lyricLines) {
      const verse = verseOfStart.get(line.start) ?? 0
      verseOfStart.set(line.start, verse + 1)
      while (verses.length <= verse) verses.push(new Map())
      line.syllables.forEach((syllable, offset) => {
        // `skip` is the absence of a syllable, so it need not be recorded; `melisma`
        // must be, or the held note becomes indistinguishable from a wordless one.
        if (syllable.kind !== 'skip') verses[verse]?.set(line.start + offset, syllable)
      })
    }

    let index = 0
    // Rebuilt, not mutated: casting `readonly MusicEvent[]` to a mutable array and writing
    // through it deletes the compile-time check that enforces the immutable-AST rule, in
    // the one function that touches an already-built tree.
    this.measures = this.measures.map((measure) => ({
      ...measure,
      events: measure.events.map((event) => {
        if (event.type === 'rest') return event
        const first = verses[0]?.get(index)
        const extras = verses.slice(1).map((verse) => verse.get(index)?.text ?? null)
        // Named rather than read after `index += 1`: the lookahead is deliberate, and
        // spelling it out keeps it from reading as an off-by-one.
        const next = verses[0]?.get(index + 1)
        index += 1
        return {
          ...event,
          lyric: first?.text ?? null,
          lyricSourceRange: first?.range ?? null,
          lyricFont: first?.font ?? null,
          // ponytail: melisma is tracked for verse 1 only. extraVerses is a plain
          // (string|null)[]; per-verse melismas need it to become a richer type, which
          // is worth doing when a renderer actually lays out multiple verses.
          lyricMelisma: first?.kind === 'melisma',
          // A run opens on the syllable BEFORE the first hold, so this is the one place
          // with both in view — `verses` is indexed by note position, and the holds are
          // the entries that follow. Looking ahead one is enough: a run of several holds
          // still starts at exactly one syllable.
          lyricMelismaStart:
            first !== undefined && first.kind !== 'melisma' && next?.kind === 'melisma',
          extraVerses: extras,
        }
      }),
    }))
  }

  /** The event a broken-rhythm mark reaches back to. Null once a barline has closed. */
  get last(): MusicEvent | null {
    const target = this.target
    return target[target.length - 1] ?? null
  }

  replaceLast(event: MusicEvent): void {
    const target = this.target
    if (target.length > 0) target[target.length - 1] = event
  }

  /** Index of the event just pushed, within whichever layer it landed in. */
  get lastIndex(): number {
    return this.target.length - 1
  }

  setBeamGroup(index: number, group: number): void {
    const target = this.target
    const event = target[index]
    if (event && event.type !== 'rest') target[index] = { ...event, beamGroup: group }
  }

  /** `-` reaches back: the tie belongs to the note already emitted. Rests cannot tie. */
  tieLast(dotted = false): void {
    const last = this.last
    if (last && last.type !== 'rest')
      this.replaceLast({ ...last, tiedToNext: true, ...(dotted ? { tieDotted: true } : {}) })
  }

  /** `)` likewise closes the slur on the preceding note. Rests cannot be slurred. */
  slurEndLast(): void {
    const last = this.last
    if (last && last.type !== 'rest') {
      this.replaceLast({ ...last, slurEnds: last.slurEnds + 1 })
    }
  }

  /**
   * The next measure opens a new SYSTEM, because a new source line just began.
   *
   * Held rather than applied immediately: a music line begins before its first event, and
   * the measure that event lands in may already be open — a measure continued across a
   * line break belongs to the line it STARTED on, and abcjs agrees, since it lays out
   * whatever the line contains and a half-measure is what it contains.
   */
  private pendingLineStart = false
  /** A leading barline awaiting the measure it opens. */
  private pendingOpening: {
    barline: Barline
    range: SourceRange
    decorations: readonly string[]
    chordSymbol: string | null
    annotations: readonly string[]
  } | null = null
  /** A `P:` label awaiting the measure it marks. */
  private pendingPart: { label: string; range: SourceRange } | null = null
  /** A repeat ending awaiting the measure it opens. */
  private pendingVolta: { label: string; range: SourceRange } | null = null

  setVolta(label: string, range: SourceRange): void {
    this.pendingVolta = { label, range }
  }

  setPartLabel(label: string, range: SourceRange): void {
    this.pendingPart = { label, range }
  }

  /**
   * The barline, part label and volta this measure OPENED with.
   *
   * Called at CLOSE, which is right for a barline and a volta — both were seen before the
   * measure's events — and is a trap for a `P:`. A `P:` field read while a measure is
   * still buffered belongs to the measure that FOLLOWS it, and a line-ending measure is
   * not closed until the next music line arrives, so `frere-jacques`'s `P:A` — sitting
   * between the last `+:` prose line and the first real bar — was swept into the prose
   * measure and printed at the right-hand end of that system. abcjs prints it at the head
   * of the next one.
   *
   * So the part label is kept pending unless it precedes what is being closed. The
   * renderer's own `partIndex` handles a `P:` that lands BETWEEN two events of one
   * measure, which is a different case and still reachable.
   */
  private takeOpening(lastEventStart: number | null): {
    openingBarline: Barline | null
    openingBarlineSourceRange: SourceRange | null
    openingBarlineDecorations?: readonly string[]
    openingBarlineChord?: string
    openingBarlineAnnotations?: readonly string[]
    partLabel: string | null
    partLabelSourceRange: SourceRange | null
    volta: string | null
    voltaSourceRange: SourceRange | null
  } {
    const pending = this.pendingOpening
    this.pendingOpening = null
    const part =
      this.pendingPart !== null &&
      lastEventStart !== null &&
      this.pendingPart.range.start > lastEventStart
        ? null
        : this.pendingPart
    if (part !== null) this.pendingPart = null
    const volta = this.pendingVolta
    this.pendingVolta = null
    return {
      openingBarline: pending?.barline ?? null,
      openingBarlineSourceRange: pending?.range ?? null,
      ...(pending !== null && pending.decorations.length > 0
        ? { openingBarlineDecorations: pending.decorations }
        : {}),
      ...(pending?.chordSymbol != null ? { openingBarlineChord: pending.chordSymbol } : {}),
      ...(pending !== null && pending.annotations.length > 0
        ? { openingBarlineAnnotations: pending.annotations }
        : {}),
      partLabel: part?.label ?? null,
      partLabelSourceRange: part?.range ?? null,
      volta: volta?.label ?? null,
      voltaSourceRange: volta?.range ?? null,
    }
  }

  /**
   * Whether the measure being closed opened a system, clearing the flag as it goes.
   *
   * The FIRST measure of a voice never needs it — a voice starts a system by definition —
   * but it is set anyway so the flag means one thing everywhere.
   */
  private takeLineStart(): boolean {
    const value = this.pendingLineStart
    this.pendingLineStart = false
    this.wroteSinceLineStart = true
    return value
  }

  /**
   * The blocks waiting for this system, claimed by the FIRST measure that opens one.
   *
   * Returns nothing on every other measure, so the field stays absent rather than an
   * empty array — a measure carrying `textBefore: []` would read as "there was text".
   */
  private takeTextBefore(startsSystem: boolean): { textBefore?: readonly FreeTextBlock[] } {
    if (!startsSystem || this.pendingTextBefore.blocks.length === 0) return {}
    const blocks = this.pendingTextBefore.blocks
    this.pendingTextBefore.blocks = []
    return { textBefore: blocks }
  }

  /**
   * Returns `false` when the barline OPENED a measure instead of closing one, so the
   * caller knows its pending chord was not consumed and must stay on the next note.
   */
  closeMeasure(
    barline: Barline,
    barlineRange: SourceRange,
    /** Decorations still waiting when the bar arrived — they attach to IT. */
    decorations: readonly string[] = [],
    /**
     * A chord symbol and annotations still waiting when the bar arrived, which attach to
     * IT and not to the next note — `if (el.chord !== undefined) bar.chord = el.chord`
     * followed by `el = {}` (`abc_parse_music.js:288-289, 305`). abcjs then engraves them
     * with the very same `addChord` a note gets, at `noteheadWidth = 0`
     * (`abstract-engraver.js:1047-1049`), so `"D"|` centres the chord ON the barline.
     */
    chordSymbol: string | null = null,
    annotations: readonly string[] = [],
  ): boolean {
    // A BARLINE FIRES `startNewLine` TOO, which is why this is not gated on notes — see
    // `appendedSinceLineStart`. `closeUnterminatedMeasure` runs from `beginMusicLine`
    // BEFORE that flag is reset, so a line-ending measure cannot set it for the next line.
    this.appendedSinceLineStart = true
    // A barline with nothing before it (leading `|:`) opens rather than closes, so it is
    // held for the NEXT measure instead of being dropped. Dropping it lost a printed
    // barline wherever a line ended `:|` and the next began `|:`, and lost the opening
    // `[|` of any tune that starts with one.
    //
    // Overlay state must be checked too: `|&|` used to return early leaving overlayIndex
    // set, so every later note in the voice landed in an overlay layer and measure.events
    // stayed empty for the rest of the tune.
    if (this.events.length === 0 && this.measureStart === null && this.overlays.length === 0) {
      this.overlayIndex = null
      // Two openers in a row keep the first; `[|` then `|:` prints both, but nothing in
      // the corpus does it and one slot is enough until something does.
      //
      // AND AN OPENING BARLINE TAKES THE PENDING DECORATION AND CHORD, exactly as a
      // closing one does — abcjs has ONE bar element and does not distinguish them, so
      // `!coda!|:` leaves the coda on the `bar_left_repeat`. This branch used to keep
      // nothing: the caller cleared the decorations unconditionally and they were LOST,
      // while the chord leaked onto the next note ahead of that note's own.
      this.pendingOpening ??= {
        barline,
        range: barlineRange,
        decorations: [...decorations],
        chordSymbol,
        annotations: [...annotations],
      }
      return false
    }
    this.measures.push({
      events: this.events,
      overlays: this.overlays,
      ...this.takeChanges(),
      ...this.takeOpening(this.events[this.events.length - 1]?.sourceRange?.start ?? null),
      ...(() => {
        const startsSystem = this.takeLineStart()
        this.takeOctave()
        return {
          startsSystem,
          ...this.takeSystemBarNumber(startsSystem),
          ...this.takeTextBefore(startsSystem),
        }
      })(),
      closingBarline: barline,
      ...this.takeBarNumber(barline, this.events.length === 0 && this.overlays.length === 0),
      ...(decorations.length > 0 ? { closingBarlineDecorations: [...decorations] } : {}),
      ...(chordSymbol === null ? {} : { closingBarlineChord: chordSymbol }),
      ...(annotations.length > 0 ? { closingBarlineAnnotations: [...annotations] } : {}),
      sourceRange: sourceRange(this.measureStart ?? barlineRange.start, barlineRange.end),
      closingBarlineSourceRange: barlineRange,
    })
    this.events = []
    this.overlays = []
    this.overlayIndex = null
    this.measureStart = null
    return true
  }

  /**
   * Close whatever has accumulated as a measure with NO closing barline.
   *
   * Two callers, and the barline-less part is the point of both: the end of a tune whose
   * last bar is unterminated, and a source line that ends mid-measure. Nothing is drawn
   * for the missing barline — this only ends the measure as a LAYOUT unit.
   *
   * Overlays must be checked too: `AB|&cd` with no closing barline used to discard the
   * whole overlay layer, so whether the notes existed depended on a trailing `|`.
   */
  private closeUnterminatedMeasure(): void {
    /**
     * **A BARLINE WITH NOTHING AFTER IT IS STILL A BARLINE.**
     *
     * Two barlines in a row leave the second as a `pendingOpening`, waiting for a measure
     * to open. When nothing follows — `[|] |` at the end of a line, which
     * `visual-tablature-20` writes twice — that pending bar was DISCARDED, and abcjs draws
     * it: its voice children are a flat stream and every `|` is its own `bar` element
     * (`abstract-engraver.js:957`), so that fixture has SEVEN bar groups against our five
     * and its last staff line ran 16px short.
     *
     * Emitted as an empty measure whose CLOSING barline is the pending one, which is the
     * shape `layoutMeasure` already draws.
     */
    if (this.events.length === 0 && this.overlays.length === 0) {
      const trailing = this.pendingOpening
      if (trailing !== null) {
        this.pendingOpening = null
        const bare: Measure = {
          events: [],
          overlays: [],
          keyChange: null,
          keyChangeSourceRange: null,
          meterChange: null,
          meterChangeSourceRange: null,
          volta: null,
          voltaSourceRange: null,
          partLabel: null,
          partLabelSourceRange: null,
          startsSystem: false,
          openingBarline: null,
          openingBarlineSourceRange: null,
          closingBarline: trailing.barline,
          closingBarlineSourceRange: trailing.range,
          sourceRange: trailing.range,
        }
        this.measures.push(
          trailing.decorations.length === 0
            ? bare
            : { ...bare, closingBarlineDecorations: [...trailing.decorations] },
        )
      }
      return
    }
    const last = this.events[this.events.length - 1]
    this.measures.push({
      events: this.events,
      overlays: this.overlays,
      ...this.takeChanges(),
      ...this.takeOpening(last?.sourceRange?.start ?? null),
      ...(() => {
        const startsSystem = this.takeLineStart()
        this.takeOctave()
        return {
          startsSystem,
          ...this.takeSystemBarNumber(startsSystem),
          ...this.takeTextBefore(startsSystem),
        }
      })(),
      closingBarline: null,
      sourceRange: sourceRange(this.measureStart ?? 0, last?.sourceRange?.end ?? 0),
      closingBarlineSourceRange: null,
    })
    this.events = []
    this.overlays = []
    this.overlayIndex = null
    this.measureStart = null
  }

  finish(): Voice {
    this.closeUnterminatedMeasure()
    this.applyLyrics()
    this.applySymbols()
    // `V:2 clef=bass octave=-2` moves the WRITTEN pitch, so it is baked into the model
    // here rather than left for a renderer to remember. Settled by probing abcjs 6.6.3,
    // which reports pitch -14 where an unshifted voice reports 0: the noteheads move.
    //
    // The model called this "a sounding shift, not a written-pitch change" and left the
    // question open in a comment, and the content gate compensated for it — adding the
    // shift back before comparing, which made the fixture pass while our noteheads sat
    // two octaves off abcjs's. The compensation went with this change, so the gate now
    // verifies the shift instead of normalising it away.
    //
    // ponytail: the voice's FINAL shift applies to all of its measures. A mid-body `V:`
    // that changes `octave=` partway would need this per-measure; none does.
    // PER MEASURE, because the tune-level `K: octave=` can change mid-tune and a voice
    // with no `octave=` of its own follows it from that point.
    const measures = this.measureShifts.some((n) => n !== 0)
      ? this.measures.map((m, i) => shiftMeasure(m, this.measureShifts[i] ?? 0))
      : this.measures
    // An `&` overlay is a voice, so it spans the whole tune — see `padOverlays`.
    return {
      id: this.id,
      octaveShift: this.octaveShift ?? this.keyOctave.value,
      transpose: this.transpose,
      clef: this.clef,
      staffLineOverride: this.staffLineOverride,
      stemDirection: this.stemDirection,
      color: this.color,
      name: this.name,
      subname: this.subname,
      measures: padOverlays(moveTrailingBarNumbers(measures), this.meterForOverlays),
    }
  }

  get isEmpty(): boolean {
    return this.measures.length === 0 && this.events.length === 0 && this.overlays.length === 0
  }
}

/**
 * A BAR NUMBER ON THE LAST BARLINE OF A SOURCE LINE MOVES TO THE NEXT LINE'S STAFF.
 *
 *     if (voice.length > 0 && voice[voice.length - 1].barNumber) {
 *       // Don't hang a bar number on the last bar line: it should go on the next line.
 *       var nextLine = getNextMusicLine(tune.lines, i);
 *       if (nextLine)
 *         nextLine.staff[0].barNumber = voice[voice.length - 1].barNumber;
 *       delete voice[voice.length - 1].barNumber;
 *     }
 *
 * (`tune-builder.js:137-143`, abcjs's own comment.) It runs per LINE in `cleanUp`, so it
 * applies to EVERY `%%barnumbers N` and not only to 0 — the two mechanisms meet here, and
 * `startNewLine`'s is just the other way a staff comes to carry one. With no next line the
 * number is DELETED, which is why a tune ending `…|` prints no number on its final barline.
 *
 * Measured on `%%barnumbers 1` over two source lines of two bars: abcjs draws `2` on the
 * first line's inner barline, `3` on the SECOND LINE'S CLEF, `4` on its inner barline, and
 * nothing at all for 5. We drew 2, 3, 4 and 5 on the four barlines.
 */
function moveTrailingBarNumbers(measures: readonly Measure[]): Measure[] {
  if (!measures.some((m) => m.closingBarNumber !== undefined)) return [...measures]
  const out = measures.map((m) => ({ ...m }))
  for (let i = 0; i < out.length; i += 1) {
    const measure = out[i]
    if (measure?.closingBarNumber === undefined) continue
    const next = out[i + 1]
    // The last measure of a source line is the one whose successor OPENS one.
    if (next !== undefined && !next.startsSystem) continue
    const moved = measure.closingBarNumber
    delete (measure as { closingBarNumber?: number }).closingBarNumber
    if (next !== undefined) (next as { systemBarNumber?: number }).systemBarNumber = moved
  }
  return out
}

/** The `%%` formatting a file header passes to every tune under it. */
interface Formatting {
  staffSep: number | null
  musicSpace: number | null
  partsBox: boolean
  jazzChords: boolean
  percMap: Record<string, PercMapEntry>
  drumMap?: Record<string, number>
  midi?: Record<string, readonly (string | number)[]>
  stretchLast: number | null
  staffWidth: number | null
  maxStaves: number | null
  sysStaffSep: number | null
  vocalFont: LyricFont | null
  fonts: Partial<Record<AbcFontType, LyricFont>>
}

class ScoreBuilder {
  tuneNumber: number | null = null
  titles: RichText[] = []
  composer: RichText | null = null
  rhythm: RichText | null = null
  origin: RichText | null = null
  author: RichText | null = null
  partOrder: RichText | null = null
  // The bottom-text fields — see `ScoreMetadata`. `N:`, `H:` and `W:` accumulate.
  book: RichText | null = null
  source: RichText | null = null
  discography: RichText | null = null
  transcription: RichText | null = null
  notes: RichText[] = []
  history: RichText[] = []
  unalignedWords: RichText[] = []
  key: KeySignature = defaultKey()
  clef: Clef = defaultClef
  tempo: Tempo | null = null
  /** The tune's `Q:` was written INLINE — drawn, but not the audio clock's. */
  tempoInline = false
  meter: Meter | null = null
  unitNoteLength: Rational = rational(1, 8)
  unitExplicit = false
  bodyStarted = false
  /** abcjs's `hasBeginMusic()` — a MUSIC LINE has been read, which `K:` alone does not do. */
  musicStarted = false
  /**
   * The `%%vocalfont` in force, or null while none has been seen.
   *
   * Null is load-bearing: it means "nothing said", and the renderer answers it with the
   * default constant rather than by computing a size that happens to equal it. A tune
   * with no `%%vocalfont` therefore takes a path with no font arithmetic on it at all,
   * which is the only way to guarantee its geometry cannot drift.
   */
  vocalFont: LyricFont | null = null
  /** …and the one the CURRENT music line started with, which is what a lyric draws in. */
  lineVocalFont: LyricFont | null = null
  /** The `%%gchordfont` in force — a CHANGING font, so it is stamped per event. */
  chordFont: LyricFont | null = null
  /**
   * `%%setfont-1` … `-9`, the numbered fonts `$N` switches a header field into.
   *
   * Sparse and 1-based, like abcjs's `multilineVars.setfont`, because `$0` means "back to
   * the field's own font" and is never a lookup. An UNDEFINED entry is not an error: a
   * `$5` with no `%%setfont-5` stays literal text, which is a branch of its own.
   */
  setfont: (LyricFont | undefined)[] = []
  /** Every `%%<type>font` set so far. The renderer defaults an absent entry itself. */
  fonts: Partial<Record<AbcFontType, LyricFont>> = {}
  /** See `Score.firstLineKeyClef` — a standalone body `K:` read before any music. */
  firstLineKeyClef: { voiceId: string; clef: Clef } | null = null
  keySourceRange: SourceRange | null = null
  meterSourceRange: SourceRange | null = null
  /** Declaration order is output order — a Map preserves insertion order. */
  private readonly voices = new Map<string, VoiceBuilder>()
  /**
   * Staves from `%%score`/`%%staves` — one entry per staff, with the voices on it.
   * Empty when the tune has no directive, in which case every voice takes its own staff.
   */
  /**
   * `U:` user-defined symbols — one character standing for a decoration.
   *
   * These OVERRIDE the built-in shorthands rather than supplementing them, which is not a
   * detail: `frere-jacques` writes `U:u = !downbow!` and `U:v = !upbow!`, deliberately
   * swapping the two built-ins. Treating them as additions left us emitting the WRONG
   * decoration on those notes, not merely a missing one.
   */
  userSymbols = new Map<string, string>()
  staffGroups: StaffGroup[] = []
  /** `%%staffsep` / `%%sysstaffsep`, in PIXELS (directive points × 4/3). See `Score`. */
  staffSep: number | null = null
  /** `%%musicspace` in PIXELS, or null for the engine default. */
  musicSpace: number | null = null
  partsBox = false
  jazzChords = false
  percMap: Record<string, PercMapEntry> = {}
  /** `%%MIDI drummap <abc-note> <midi>` — accumulated, one key per directive line. */
  drumMap: Record<string, number> = {}
  /** `%%MIDI` written before the first note — the tune's own audio settings. */
  midi: Record<string, readonly (string | number)[]> = {}
  stretchLast: number | null = null
  staffWidth: number | null = null
  maxStaves: number | null = null
  sysStaffSep: number | null = null

  /** The file-header formatting this tune would pass on — see `Parser.fileDefaults`. */
  formatting(): Formatting {
    return {
      staffSep: this.staffSep,
      musicSpace: this.musicSpace,
      partsBox: this.partsBox,
      jazzChords: this.jazzChords,
      percMap: this.percMap,
      drumMap: this.drumMap,
      midi: this.midi,
      stretchLast: this.stretchLast,
      staffWidth: this.staffWidth,
      maxStaves: this.maxStaves,
      sysStaffSep: this.sysStaffSep,
      vocalFont: this.vocalFont,
      fonts: this.fonts,
    }
  }

  applyFormatting(f: Formatting): void {
    this.staffSep = f.staffSep
    this.musicSpace = f.musicSpace
    this.partsBox = f.partsBox
    this.jazzChords = f.jazzChords
    this.percMap = f.percMap
    if (f.drumMap !== undefined) this.drumMap = f.drumMap
    if (f.midi !== undefined) this.midi = f.midi
    this.stretchLast = f.stretchLast
    this.staffWidth = f.staffWidth
    this.maxStaves = f.maxStaves
    this.sysStaffSep = f.sysStaffSep
    this.vocalFont = f.vocalFont
    this.fonts = { ...f.fonts }
  }
  /** `%%center` text, split by whether any music had been parsed when it was read. */
  textAbove: FreeTextBlock[] = []
  textBelow: FreeTextBlock[] = []
  /** Voice ids from `%%score`/`%%staves`, which overrides declaration order. */
  scoreOrder: string[] | null = null
  private tupletGroups = 0
  private beamGroups = 0

  nextBeamGroup(): number {
    this.beamGroups += 1
    return this.beamGroups
  }

  /** Tune-unique, so adjacent triplets stay distinguishable. */
  nextTupletGroup(): number {
    this.tupletGroups += 1
    return this.tupletGroups
  }
  private currentVoiceId = DEFAULT_VOICE_ID

  /**
   * Blocks read since the last music line — a `%%text`, a `%%center`, or a mid-tune `T:`.
   *
   * SHARED with every `VoiceBuilder`, because the blocks belong to the SYSTEM rather than
   * to a voice and the voice the next line opens in is not known until its tokens are
   * read. Whichever measure closes first with `startsSystem` takes them, and layout looks
   * at the first measure of the span across all voices.
   */
  readonly pendingTextBefore: { blocks: FreeTextBlock[] } = { blocks: [] }
  /**
   * The tune-level `K: octave=` — abcjs's `multilineVars.octave`, which is GLOBAL and can
   * change mid-tune. A voice that set its own `octave=` ignores it.
   */
  readonly keyOctave = { value: 0 }

  constructor(readonly sourceStartOffset: number) {}

  /**
   * abcjs's `multilineVars.currentVoice` — the LAST `V:` read, header or body.
   *
   * Not `currentVoiceId`, which is where MUSIC lands and stays on the first voice through
   * a header `V:` block. The two differ exactly where this is needed: after `V:1 … V:4`,
   * abcjs's `tune.staffNum` is V:4's.
   */
  lastVoiceId = DEFAULT_VOICE_ID

  /** The voice music currently lands in. Created on demand for tunes with no `V:` at all. */
  get voice(): VoiceBuilder {
    return this.voiceFor(this.currentVoiceId)
  }

  /** `%%barnumbers` / `%%measurenb` / `%%setbarnb`, shared with every VoiceBuilder. */
  readonly barNumbering: { every: number | null; current: number; firstVoiceId: string | null } = {
    every: null,
    current: 1,
    firstVoiceId: null,
  }

  /**
   * A MULTI-MEASURE REST ADVANCES THE BAR COUNTER BY ITS WHOLE COUNT.
   *
   *     if (core.rest.type === 'multimeasure' && isFirstVoice())
   *       multilineVars.currBarNumber += core.rest.text - 1
   *
   * (`abc_parse_music.js:512-513`, with abcjs's own "The minus one is because the measure
   * with the rest is already counted once normally" beside it — the barline that closes
   * the rest's own measure does the last increment.)
   *
   * Ours counted `Z24` as ONE measure, so every bar number after a multi-measure rest was
   * 23 too low and `%%barnumbers 5` printed one where abcjs prints none. Instrumented on
   * `visual-parsing-10`: abcjs reaches `curr=47` at the first barline where we reached 24.
   */
  countMultiMeasureRest(bars: number): void {
    if (this.barNumbering.firstVoiceId !== this.currentVoiceId) return
    this.barNumbering.current += bars - 1
  }

  voiceFor(id: string): VoiceBuilder {
    let builder = this.voices.get(id)
    if (!builder) {
      builder = new VoiceBuilder(id, this.pendingTextBefore, this.keyOctave, this.barNumbering)
      this.barNumbering.firstVoiceId ??= id
      this.voices.set(id, builder)
    }
    return builder
  }

  /**
   * Which staff each voice landed on, by abcjs's rule — see `mergesStaff`. Assigned once,
   * at the voice's FIRST `V:`, and never revised.
   */
  private staffOfVoice = new Map<string, number>()
  private staffCount = 0
  /** Whether any `V:… merge` was seen, so the default one-staff-per-voice path can stay. */
  private sawMerge = false

  /** Header `V:` — creates the voice, and makes the FIRST one declared current. */
  declareVoice(id: string, merge = false): void {
    const isFirst = this.voices.size === 0
    this.voiceFor(id).explicit = true
    if (isFirst) this.currentVoiceId = id
    this.lastVoiceId = id
    // `startStaff || staves.length === 0` — the first voice opens a staff whatever it says.
    if (!this.staffOfVoice.has(id)) {
      if (!merge || this.staffCount === 0) this.staffCount += 1
      this.staffOfVoice.set(id, this.staffCount - 1)
      if (merge) this.sawMerge = true
    }
  }

  /**
   * A body `V:2` switches the voice music lands in.
   *
   * A `[V:x]` naming the voice ALREADY CURRENT is a no-op — probed, abcjs's
   * `setCurrentVoice` fires twice for `visual-parsing-08`'s six `[V:…]` lines, once per
   * distinct id, and the repeats change nothing. Only a real switch can open a line.
   */
  selectVoice(id: string): void {
    if (id === this.currentVoiceId && this.voices.has(id)) return
    const voice = this.voiceFor(id)
    voice.explicit = true
    voice.switchedTo()
    this.currentVoiceId = id
    this.lastVoiceId = id
  }

  get isEmpty(): boolean {
    return (
      this.tuneNumber === null &&
      this.titles.length === 0 &&
      [...this.voices.values()].every((v) => v.isEmpty)
    )
  }

  /**
   * `%%score` sets the staff layout, and with it the order voices are presented in.
   * Voices it does not mention keep declaration order, appended after the listed ones.
   */
  private orderedVoices(): VoiceBuilder[] {
    const real = (v: VoiceBuilder): boolean => v.explicit || !v.isEmpty
    if (!this.scoreOrder) return [...this.voices.values()].filter(real)
    const listed = this.scoreOrder.filter((id) => this.voices.has(id))
    const seen = new Set(listed)
    return [
      ...listed.map((id) => this.voiceFor(id)),
      ...[...this.voices.entries()].filter(([id]) => !seen.has(id)).map(([, v]) => v),
    ].filter(real)
  }

  /**
   * Staves as they actually exist, after dropping voices the directive names but the tune
   * never defines.
   *
   * `%%score` is written by hand and routinely lists a voice that is not there — a part
   * commented out, a template reused. abcjs warns and carries on; a staff left holding no
   * voices would otherwise render as an empty stave.
   */
  private resolvedStaves(): StaffGroup[] {
    // `V:… merge` with no `%%score` to override it — group by the staff each voice was
    // assigned at declaration. Only when a merge was actually seen: without one abcjs's
    // rule gives every voice its own staff, which is exactly what an empty list already
    // means here, and returning groups for every tune would put this on paths that have
    // no reason to change.
    if (this.staffGroups.length === 0 && this.sawMerge) {
      const byStaff = new Map<number, string[]>()
      for (const [id, staff] of this.staffOfVoice) {
        if (!this.voices.has(id)) continue
        byStaff.set(staff, [...(byStaff.get(staff) ?? []), id])
      }
      return [...byStaff.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, voiceIds]) => ({ voiceIds, brace: null, bracket: null, connectBarLines: null }))
    }
    if (this.staffGroups.length === 0) return []
    const declared = new Set(
      [...this.voices.entries()].filter(([, v]) => v.explicit || !v.isEmpty).map(([id]) => id),
    )
    const kept = this.staffGroups
      .map((g) => ({ ...g, voiceIds: g.voiceIds.filter((id) => declared.has(id)) }))
      .filter((g) => g.voiceIds.length > 0)
    // Voices the directive never mentions keep declaration order, each on its own staff,
    // appended after the listed ones — the same fallback `orderedVoices` uses.
    const listed = new Set(kept.flatMap((g) => g.voiceIds))
    const extra = [...declared]
      .filter((id) => !listed.has(id))
      .map((id) => ({ voiceIds: [id], brace: null, bracket: null, connectBarLines: null }))
    return [...kept, ...extra]
  }

  finish(): Score {
    const metadata: ScoreMetadata = {
      tuneNumber: this.tuneNumber,
      titles: this.titles,
      composer: this.composer,
      rhythm: this.rhythm,
      origin: this.origin,
      author: this.author,
      partOrder: this.partOrder,
      book: this.book,
      source: this.source,
      discography: this.discography,
      transcription: this.transcription,
      notes: this.notes,
      history: this.history,
      unalignedWords: this.unalignedWords,
    }
    return {
      metadata,
      key: this.key,
      clef: this.clef,
      meter: this.meter,
      tempo: resolveBeatUnit(this.tempo, this.meter),
      tempoInline: this.tempoInline,
      unitNoteLength: this.unitNoteLength,
      ...(this.firstLineKeyClef === null ? {} : { firstLineKeyClef: this.firstLineKeyClef }),
      voices: this.orderedVoices().map((v) => {
        // The meter lives on the score, and a voice needs it to pad an empty overlay
        // layer to a full measure's silence.
        v.meterForOverlays = this.meter
        return v.finish()
      }),
      staves: this.resolvedStaves(),
      staffSep: this.staffSep,
      musicSpace: this.musicSpace,
      partsBox: this.partsBox,
      jazzChords: this.jazzChords,
      percMap: this.percMap,
      drumMap: this.drumMap,
      midi: this.midi,
      stretchLast: this.stretchLast,
      staffWidth: this.staffWidth,
      maxStaves: this.maxStaves,
      sysStaffSep: this.sysStaffSep,
      textAbove: this.textAbove,
      // …AND THE BLOCKS STILL WAITING FOR A SYSTEM THAT NEVER CAME. A mid-tune `T:` or
      // `%%text` moves to `pendingTextBefore` at the next system start; when the tune ends
      // before one, it sat there and was DRAWN NOWHERE. `visual-mouse-click-01`'s
      // `T:Inserted subtitle` vanished outright, and so did 23.175px of page.
      textBelow: [...this.textBelow, ...this.pendingTextBefore.blocks],
      fonts: this.fonts,
      sourceStartOffset: this.sourceStartOffset,
      keySourceRange: this.keySourceRange,
      meterSourceRange: this.meterSourceRange,
    }
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private readonly scores: Score[] = []
  private readonly diagnostics: Diagnostic[] = []
  private builder: ScoreBuilder | null = null
  private inTextBlock = false
  /** Lines gathered since `%%begintext`, closed into one block by `%%endtext`. */
  private textBlock: string[] = []
  private lastFieldLetter: string | null = null
  /** A `w:`/`+:` line ended in `\`, so the lyric is not finished. See the handler. */
  private lyricContinues = false

  constructor(
    private readonly src: string,
    private readonly mode: CompatibilityMode = defaultMode,
  ) {}

  parse(): ParseResult {
    let lineStart = 0
    while (lineStart <= this.src.length) {
      let lineEnd = this.src.indexOf('\n', lineStart)
      if (lineEnd === -1) lineEnd = this.src.length
      this.processLine(lineStart, lineEnd)
      if (lineEnd === this.src.length) break
      lineStart = lineEnd + 1
    }
    this.flush()

    const errors = this.diagnostics.filter((d) => d.severity === 'error')
    if (errors.length > 0) {
      return { ok: false, errors, scores: this.scores, diagnostics: this.diagnostics }
    }
    return { ok: true, scores: this.scores, diagnostics: this.diagnostics }
  }

  private warnAt(token: Token, code: string, message: string): void {
    this.warn(code, message, sourceRange(token.start, token.start + token.length))
  }

  private warn(code: string, message: string, range: SourceRange | null): void {
    this.diagnostics.push({ code, severity: 'warning', message, range })
  }

  private info(code: string, message: string, range: SourceRange | null): void {
    this.diagnostics.push({ code, severity: 'info', message, range })
  }

  private flush(): void {
    if (this.builder && !this.builder.isEmpty) this.scores.push(this.builder.finish())
    this.builder = null
  }

  /** One `FreeText` for the whole `%%begintext` block, above the music or below it. */
  private closeTextBlock(at: number): void {
    if (this.textBlock.length === 0) return
    const builder = this.ensureScore(at)
    const target = builder.voice.isEmpty ? builder.textAbove : builder.textBelow
    target.push({ lines: this.textBlock, align: 'left' })
    this.textBlock = []
  }

  /** Formatting from `%%` directives standing before the first `X:` — see `applyField`. */
  private fileDefaults: Formatting | null = null

  private ensureScore(at: number): ScoreBuilder {
    if (!this.builder) {
      this.builder = new ScoreBuilder(at)
      if (this.fileDefaults) this.builder.applyFormatting(this.fileDefaults)
    }
    return this.builder
  }

  private processLine(start: number, endIn: number): void {
    let end = endIn
    let line = this.src.slice(start, end).replace(/\r$/, '')

    // A `%%begintext` block runs to `%%endtext`. Its content lines carry no `%%` prefix,
    // so they must be claimed here — otherwise ordinary English prose parses as music and
    // every a-g in it becomes a note. Checked before the blank-line flush: a blank line
    // inside the block is part of the text, not the end of the tune.
    //
    // The WHOLE block is ONE `FreeText`, however many lines it holds — abcjs draws it as a
    // single `<text>` with a `tspan` per line and reserves one multi-line height for it.
    if (this.inTextBlock) {
      if (line.startsWith('%%endtext')) {
        this.inTextBlock = false
        this.closeTextBlock(start)
        return
      }
      // An `X:` ends the block regardless: without this an unterminated `%%begintext`
      // swallowed every remaining tune in the file.
      if (!/^X:/.test(line)) {
        // A content line may or may not repeat the `%%`; abcjs accepts both.
        this.textBlock.push(decodeTextString(line.replace(/^%%\s?/, '').trim()))
        return
      }
      this.inTextBlock = false
      this.closeTextBlock(start)
      this.warn(
        'unterminated-text-block',
        '%%begintext was not closed by %%endtext',
        sourceRange(start, end),
      )
    }
    if (line.startsWith('%%begintext')) {
      this.inTextBlock = true
      this.textBlock = []
      return
    }

    if (line.trim() === '') {
      this.flush() // A blank line ends the tune.
      return
    }
    if (line.startsWith('%%')) {
      // LEADING WHITESPACE IS NOT PART OF THE NAME. abcjs tokenizes the line and takes the
      // first WORD as the command (`abc_parse_directive.js:44-49`), so `%% barnumbers 1`
      // is the same directive as `%%barnumbers 1` — and `visual-tablature-04` writes it
      // the first way. Trailing space is left alone: `%%text` can end in one meaningfully.
      this.applyDirective(line.slice(2).replace(/^\s+/, ''), start, end)
      return
    }
    if (line.startsWith('%')) return // comment

    /**
     * A `%` ENDS THE LINE, wherever it is — and abcjs does it before anything else looks.
     *
     *     var i = line.indexOf('%');
     *     if (i >= 0) line = line.substring(0, i);
     *     line = line.replace(/\s+$/, '');
     *
     * (`abc_parse.js:408-411`, after the `%%` test and before every field and music
     * handler; `abc_parse_music.js:141` repeats the guard as a belt.) Unconditional: no
     * escape, no quoting awareness, so `T:100\% Amazing` really does become `T:100` and
     * `C2 "Play 100\% awesomely"G4 E2 C2|` really does become one note. That is abcjs
     * 6.6.3's answer, measured — its own SVG draws a single notehead — and ABC 2.1's `\%`
     * escape is simply not implemented there.
     *
     * WE DID NOT TRUNCATE AT ALL, and it took a fixture with a trailing comment to show it:
     * `C2 G4| % comment` parsed the `c` and the `e` of "comment" as two more notes. Nothing
     * in either corpus had one — `ragtime-nightingale` writes `| %4` on every line and got
     * away with it only because a digit is not a note letter.
     *
     * ponytail: non-strict stops at the first UNESCAPED `%` but does not yet UNESCAPE the
     * `\%` it keeps, so `abc2.1` prints the backslash. Fixing that means rewriting the text
     * after every field and music handler has taken its source offsets, which is a bigger
     * change than the one this corrects.
     */
    const comment = isStrict(this.mode) ? line.indexOf('%') : line.search(/(?<!\\)%/)
    if (comment >= 0) {
      // THE END OFFSET MOVES WITH THE TEXT. `scanMusic` takes OFFSETS and re-lexes from the
      // source, so truncating only the local string left the music path reading the comment
      // anyway — the control still parsed `% comment` as two notes.
      end = start + comment
      line = line.slice(0, comment).replace(/\s+$/, '')
      if (line.length === 0) return
    }

    // A `w:` line ending in `\` continues onto a later line, and what counts as "later"
    // is where abcjs and ABC 2.1 part company. MEASURED against abcjs 6.6.3 on Gonzato
    // §4.1.4, not assumed:
    //
    //   abcjs   swallows the VERY NEXT line whatever it is, strips its `X:` prefix and
    //           reads the rest as syllables — so `I: vocalfont Times-Bold 16` lands under
    //           the noteheads as "vocalfont", "Times", "Bold", "16". (`Times-Bold` is two
    //           syllables because `-` splits a word across notes.) It then drops the `+:`
    //           continuations entirely, because it does not implement `+:` at all and
    //           lexes those lines as MUSIC: 10 phantom notes, 4 of 16 syllables.
    //
    //   ABC 2.1 an interposed `%%` or `I:` line is FORMATTING, not lyric text. The lyric
    //           resumes at the next `+:`, giving all 16 syllables.
    //
    // Strict reproduces the first because reproducing abcjs is its job; every other mode
    // implements the second. Both are pinned by name in the lyric-continuation tests.
    if (this.lyricContinues) {
      if (isStrict(this.mode)) {
        // Whatever this line is, it is lyric now. Strip a field prefix if it has one.
        this.continueLyric(line.replace(/^[A-Za-z+]:/, ''), start, end)
        return
      }
      // `%%` was handled above and left `lyricContinues` set, which is the whole point:
      // formatting interposed in a continuation is transparent to it. `I:` is the same
      // directive spelled differently (ABC 2.1 §11.4) and is handled below.
      if (line.startsWith('+:')) {
        this.continueLyric(line.slice(2), start, end)
        return
      }
      if (!/^I:/.test(line)) this.lyricContinues = false
    }

    if (/^[A-Za-z]:/.test(line)) {
      // `I: <directive>` IS `%%<directive>` (ABC 2.1 §11.4) — mid-tune included, and
      // inside a lyric continuation included. abcjs does not implement this: it has no
      // `I:` case at all, which is why the field's text ends up sung. Strict keeps that
      // by falling through to the no-op below; every other mode routes it to the same
      // handler `%%` uses.
      //
      // Deliberately does NOT touch `lastFieldLetter`. It used to, by falling into the
      // generic dispatch, and that alone broke the `+:` chain after it: `I` is not a
      // continuable field, so the next `+:` stopped continuing the `w:` and fell through
      // to scanMusic as music. That was the leak, before any font question.
      if (!isStrict(this.mode) && line[0] === 'I') {
        this.applyDirective(line.slice(2).trim(), start, end)
        return
      }
      this.lastFieldLetter = line[0] as string
      this.applyField(this.lastFieldLetter, line.slice(2), start, end)
      return
    }
    // `+:` continues the previous field over another line. Restricted to text-bearing
    // fields: replaying it into K:/M:/L:/V: re-parsed prose as a field value and injected
    // a phantom mid-tune key change.
    // MODE-GATED. abcjs does not implement `+:` at all: it falls through and parses the
    // continuation line as MUSIC, so the prose of a copyright notice becomes noteheads
    // on the staff. `frere-jacques` is the fixture — 13 of abcjs's 45 "notes" there are
    // the words of "+:belongs to their respective owners". Strict mode reproduces that;
    // every other mode reads `+:` as ABC 2.1 defines it.
    if (
      !isStrict(this.mode) &&
      line.startsWith('+:') &&
      this.lastFieldLetter &&
      CONTINUABLE_FIELDS.includes(this.lastFieldLetter)
    ) {
      this.applyField(this.lastFieldLetter, line.slice(2), start, end)
      return
    }
    // A `\` AT THE END OF A MUSIC LINE JOINS IT TO THE NEXT — one printed system from two
    // source lines. abcjs marks it in preprocessing, `/\\([ \t]*)(%.*)*\n/` becoming
    // `\` + `\x12` (`abc_parse.js:511-515`), and then declines to open a line at all when
    // the PREVIOUS one carried the marker: `if (!hasBeginMusic() || (delayStartNewLine &&
    // !this.lineContinuation)) this.startNewLine()` (`abc_parse_music.js:154`), with
    // `lineContinuation` set from the line just finished (`:585`).
    //
    // We lexed `\` as whitespace and dropped the meaning, so every continued line opened a
    // system of its own — `visual-parsing-09` came out as three where abcjs draws one.
    //
    // Nothing of `beginMusicLine` runs on a continuation: the measure carries across, and
    // `lineNoteStart` must stay where the LOGICAL line began so a `w:` under it still
    // lines up with the first note of the pair.
    const continued = this.lineContinued || this.continueAll
    this.lineContinued = /\\[ \t]*(%.*)?$/.test(line)
    // FREE TEXT ONLY TRAILS IF NOTHING FOLLOWS IT. abcjs's justification rule is per
    // LINE — a music line is justified unless it is the LAST line — and a `%%begintext`
    // sitting BETWEEN two music lines makes the first one non-last while leaving the
    // second last. Measured on `S2-fields`'s BeginText tune: abcjs's first staff spans
    // the full 350 and its second stops at 211.
    //
    // Marking any post-music block as trailing justified the wrong line. So a block that
    // turns out to have music after it is dropped: mid-tune free text is still not drawn
    // (the `ponytail:` on `textBelow` says why), and it must not change the last line
    // either.
    // A BLOCK WITH MUSIC AFTER IT IS A LINE OF ITS OWN. abcjs builds one `nonMusic` line
    // per `%%text` / `%%center` / mid-tune `T:` and draws it between the two staff groups
    // (`engraver-controller.js:229-247`), so everything below it moves down. It moves to
    // the SYSTEM that follows, and only what is left when the tune ends stays `textBelow`.
    if (this.builder && this.builder.textBelow.length > 0) {
      this.builder.pendingTextBefore.blocks.push(...this.builder.textBelow)
      this.builder.textBelow = []
    }
    this.scanMusic(start, end, continued)
  }

  /**
   * A `%%directive` body, with the `%%` already stripped.
   *
   * Shared with `I:`, which ABC 2.1 §11.4 defines as the same thing spelled differently.
   * Extracted for that reason — the two must not drift apart, which they would as soon
   * as one of them grew a case the other did not.
   */
  private applyDirective(body: string, start: number, end: number): void {
    // `%%score [(S A) | (T B)]` / `%%staves` — grouping punctuation is layout; the bare
    // words are voice ids, and their order is the order voices are presented in.
    const scoreDirective = /^(score|staves)\s+(.*)$/.exec(body)
    if (scoreDirective?.[2]) {
      const builder = this.ensureScore(start)
      const groups = parseStaffGroups(scoreDirective[2], scoreDirective[1] as 'score' | 'staves')
      builder.staffGroups = groups
      // Voice ORDER falls out of the grouping: staves top to bottom, voices within each.
      builder.scoreOrder = groups.flatMap((g) => g.voiceIds)
      return
    }
    // `%%vocalfont Times-Bold 16` — the font for lyric lines parsed AFTER it. Held on the
    // builder rather than applied to notes: the notes are already parsed by the time a
    // `w:` line below them is read, so a note-level stamp cannot carry this. It is
    // captured per SYLLABLE at the moment its line is parsed. See `parseLyricSyllables`.
    // `%%gchordfont` — the chord-symbol font, and a CHANGING one: abcjs routes it through
    // `getChangingFont` (`abc_parse_directive.js:1019-1029`) so a later occurrence applies
    // from there on rather than to the whole tune. `visual-tablature-17` sets it four
    // times between music lines and each staff takes the size above it.
    //
    // EVERY font goes through the same door — abcjs's does too: `getFontAndAttr.calc`
    // reads `formatting[type]` and nothing in the engraver knows a size any other way.
    // `barlabelfont` / `barnumberfont` / `barnumfont` are aliases of `measurefont`
    // (`abc_parse_directive.js:1039-1042`).
    // `%%setfont-N <face> <size> [weight] [style]`, N from 1 to 9 — the numbered fonts a
    // header field switches into with `$N`. abcjs requires at least four tokens and reads
    // the number as `-` followed by a digit (`abc_parse_directive.js:992-1006`).
    const setfont = /^setfont-([1-9])\s+(.*)$/.exec(body)
    if (setfont?.[1] !== undefined && setfont[2] !== undefined) {
      const builder = this.ensureScore(start)
      // No default to inherit: a `%%setfont` states its own size, and `parseFontSpec`
      // returning the fallback would silently give it the title's.
      builder.setfont[Number(setfont[1])] = parseFontSpec(setfont[2], 0)
      return
    }
    const fontDirective = /^(\w+font)\s+(.*)$/.exec(body)
    if (fontDirective?.[1] && fontDirective[2]) {
      const alias = fontDirective[1]
      const type = (FONT_ALIASES[alias] ?? alias) as AbcFontType
      if (type in ABC_FONT_DEFAULT_PT) {
        const builder = this.ensureScore(start)
        // `box` IS NOT LEGAL ON EVERY FONT. abcjs allows it on eleven types and rejects it
        // on the rest — `fontTypeCanHaveBox` (`abc_parse_directive.js:60`), which has no
        // `vocalfont`, `tempofont`, `repeatfont`, `tripletfont` or `wordsfont` in it. So
        // `%%vocalfont sans-serif 11 box` is a font with NO box, and honouring the word
        // gave `visual-options-01-fonts` a lyric lane four paddings too tall the moment
        // strict started realizing the directive at all.
        const font = boxable(type)
          ? parseFontSpec(fontDirective[2], ABC_FONT_DEFAULT_PT[type])
          : { ...parseFontSpec(fontDirective[2], ABC_FONT_DEFAULT_PT[type]), box: false }
        builder.fonts[type] = font
        // The two that are also stamped PER ELEMENT, because they can change mid-tune and
        // a fixture does change them between music lines.
        if (type === 'gchordfont') builder.chordFont = font
        if (type === 'vocalfont') builder.vocalFont = font
        // `%%partsbox` and `%%partsfont … box` ARE THE SAME FLAG — the former is written
        // `multilineVars.partsfont.box = multilineVars.partsBox`
        // (`abc_parse_directive.js:924`). So the existing `partsBox` plumbing serves both.
        if (type === 'partsfont' && font.box === true) builder.partsBox = true
        return
      }
    }
    // `%%center <text>` — one line of centred free text. abcjs builds it as a `FreeText`
    // with `anchor: 'middle'` at `width / 2` (`write/creation/elements/free-text.js`),
    // where `width` is the STAFF width — so it centres on 335 where the title, which
    // centres on the paper, sits at 350.
    /**
     * **`%%voicecolor <colour>` — EVERY MARK THE CURRENT VOICE MAKES.**
     *
     * `multilineVars.currentVoice.color = voiceColor.token` (`abc_parse_directive.js:863-870`),
     * and `drawVoice` swaps `renderer.foregroundColor` for the whole voice
     * (`draw/voice.js:14-16`) — so its notes, bars, beams, ties, endings AND its
     * `staff-extra` clef and key all come out in it, while the staff LINES do not: they are
     * `printStaff`'s and are drawn before the swap.
     *
     * The token is taken raw and never validated — see `Voice.color`.
     *
     * ponytail: abcjs appends a `color` ELEMENT to the voice stream, so a second
     * `%%voicecolor` mid-tune repaints from there on and `drawVoice` colours the whole LINE
     * it lands in, retroactively. We hold ONE colour per voice, which is every use in either
     * corpus. Widen it to a per-line stamp if a fixture ever changes colour mid-tune.
     */
    const voiceColor = /^voicecolor\s+(\S+)\s*$/.exec(body)
    if (voiceColor?.[1] !== undefined) {
      this.ensureScore(start).voice.color = voiceColor[1]
      return
    }
    const centred = /^center\s+(.*)$/.exec(body)
    if (centred?.[1] !== undefined) {
      const builder = this.ensureScore(start)
      // Before any music it heads the tune; after it, it trails — and trailing text is
      // what stops the last music line being the last line, so abcjs justifies it.
      const target = builder.voice.isEmpty ? builder.textAbove : builder.textBelow
      target.push({ lines: [decodeTextString(centred[1].trim())], align: 'center' })
      return
    }
    // `%%text <line>` — the same element left-aligned, one block per directive. Two
    // `%%text` lines are two blocks, not one two-line block: measured, their rows sit
    // 33.77px apart, exactly one block's cost.
    const freeText = /^text(?:\s+(.*))?$/.exec(body)
    if (freeText !== null) {
      const builder = this.ensureScore(start)
      const target = builder.voice.isEmpty ? builder.textAbove : builder.textBelow
      target.push({ lines: [decodeTextString((freeText[1] ?? '').trim())], align: 'left' })
      return
    }
    // `%%sep` — a horizontal rule as a LINE of its own, with a space above and below. All
    // three numbers are POINTS, each `Math.round`ed (`tune-builder.js:309`), and a bare
    // `%%sep` is 14 / 14 / 85. The rule costs no height: `drawSeparator` paints at the
    // cursor and moves nothing, so the line is worth exactly `above + below`.
    const sep = /^sep\b\s*(.*)$/.exec(body)
    if (sep !== null) {
      const args = (sep[1] ?? '').trim()
      const measured = args === '' ? null : args.split(/\s+/).map(parseMeasurement)
      const [above, below, length] =
        measured === null || measured.length !== 3 || measured.some((n) => n === null)
          ? [14, 14, 85]
          : (measured as number[])
      const builder = this.ensureScore(start)
      const target = builder.voice.isEmpty ? builder.textAbove : builder.textBelow
      target.push({
        lines: [],
        align: 'center',
        role: 'separator',
        separator: {
          above: Math.round(above ?? 14),
          below: Math.round(below ?? 14),
          length: Math.round(length ?? 85),
        },
      })
      return
    }
    // `%%staffsep` / `%%sysstaffsep` — minimum staff separations, given in POINTS and
    // scaled to pixels by 4/3 exactly as abcjs does (`write/renderer.js:148,160`).
    const staffSep = /^(staffsep|sysstaffsep)\s+(-?\d+(?:\.\d+)?)/.exec(body)
    if (staffSep?.[2] !== undefined) {
      const px = (Number.parseFloat(staffSep[2]) * 4) / 3
      const builder = this.ensureScore(start)
      if (staffSep[1] === 'staffsep') builder.staffSep = px
      else builder.sysStaffSep = px
      return
    }
    // `%%musicspace` — the gap between the top text and the first staff, in POINTS and
    // scaled by 4/3 like every other measurement (`write/renderer.js:155-156`). It is
    // spent ONCE, before the first staff group, so `%%musicspace 0` closes that gap and
    // nothing else moves. `visual-selection-01` sets it.
    const musicSpace = /^musicspace\s+(\S+)\s*$/.exec(body)
    if (musicSpace?.[1] !== undefined) {
      const px = parseMeasurement(musicSpace[1])
      if (px !== null) {
        this.ensureScore(start).musicSpace = (px * 4) / 3
        return
      }
    }
    // `%%stretchlast` — bare or `true` is 1, `false` is 0, a number 0..1 is itself
    // (`abc_parse_directive.js:1294-1305`). Anything else abcjs rejects, so it stays null
    // and the 66% fallback applies.
    const stretch = /^stretchlast(?:\s+(\S+))?\s*$/.exec(body)
    if (stretch !== null) {
      const arg = stretch[1]
      const value =
        arg === undefined || arg === 'true'
          ? 1
          : arg === 'false'
            ? 0
            : Number.isFinite(Number.parseFloat(arg)) &&
                Number.parseFloat(arg) >= 0 &&
                Number.parseFloat(arg) <= 1
              ? Number.parseFloat(arg)
              : null
      if (value !== null) {
        this.ensureScore(start).stretchLast = value
        return
      }
    }
    // `%%staffwidth` IS IN POINTS, and the host's `staffwidth` param is in PIXELS.
    // abcjs converts only the directive: `this.width = formatting.staffwidth * 1.33`
    // with its own comment "the width is expressed in pt; convert to px"
    // (`engraver-controller.js:208`), where the param goes straight into
    // `staffwidthScreen` (`:55`). Reading the directive as pixels made
    // `%%staffwidth 400` a 400px staff against abcjs's 532.
    const staffWidth = /^staffwidth\s+(\d+(?:\.\d+)?)\s*$/.exec(body)
    if (staffWidth?.[1] !== undefined) {
      this.ensureScore(start).staffWidth = Number.parseFloat(staffWidth[1]) * 1.33
      return
    }
    // `%%maxStaves` — an incipit. abcjs matches the directive case-insensitively like
    // every other, so `%%maxStaves` and `%%maxstaves` are the same thing.
    const maxStaves = /^maxstaves\s+(\d+)\s*$/i.exec(body)
    if (maxStaves?.[1] !== undefined) {
      this.ensureScore(start).maxStaves = Number.parseInt(maxStaves[1], 10)
      return
    }
    // `%%partsbox` — a box round every `P:` label, and a taller lane to hold it.
    const partsBox = /^partsbox(?:\s+(\d+))?/.exec(body)
    if (partsBox !== null) {
      this.ensureScore(start).partsBox = partsBox[1] !== '0'
      return
    }
    // `%%barnumbers N` / `%%measurenb N` — print a bar number every N bars. Two spellings
    // of one directive (`abc_parse_directive.js:930-933`).
    const barNumbers = /^(?:barnumbers|measurenb)\s+(-?\d+)/.exec(body)
    if (barNumbers?.[1] !== undefined) {
      this.ensureScore(start).barNumbering.every = Number.parseInt(barNumbers[1], 10)
      return
    }
    // `%%setbarnb N` — set the running count immediately, so the NEXT barline reads N + 1.
    const setBarNb = /^setbarnb\s+(\d+)/.exec(body)
    if (setBarNb?.[1] !== undefined) {
      this.ensureScore(start).barNumbering.current = Number.parseInt(setBarNb[1], 10)
      return
    }
    // `%%percmap <abc-note> <drum-sound> [<note-head>]` — the note head a written pitch
    // draws on a percussion staff. Two or three whitespace-separated tokens; anything else
    // is a warning and no entry (`abc_parse_directive.js:393-409`). Only the HEAD is
    // modelled; the drum sound is audio.
    const percMap = /^percmap\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s*$/.exec(body)
    if (percMap?.[1] !== undefined) {
      // THE SOUND IS A NUMBER **OR** A NAME, and abcjs resolves the name by POSITION in a
      // 47-entry list starting at GM 35: `drumNames.indexOf(tokens[1].toLowerCase()) + 35`
      // (`abc_parse_directive.js:398-406`). A number outside 35–81 is retried as a name,
      // and an unresolvable one drops the whole entry rather than defaulting.
      const raw = percMap[2] ?? ''
      const asNumber = Number.parseInt(raw, 10)
      const sound =
        Number.isNaN(asNumber) || asNumber < 35 || asNumber > 81
          ? DRUM_NAMES.indexOf(raw.toLowerCase()) + 35
          : asNumber
      if (sound >= 35 && sound <= 81) {
        this.ensureScore(start).percMap[percMap[1]] = {
          sound,
          ...(percMap[3] === undefined ? {} : { noteHead: percMap[3] }),
        }
      }
      return
    }
    /**
     * `%%MIDI <cmd> [params…]` — the audio directives, and WHERE they land is the point.
     *
     *     if (tuneBuilder.hasBeginMusic())
     *       tuneBuilder.appendElement('midi', -1, -1, { cmd, params });
     *     else
     *       tune.formatting['midi'][cmd] = params;
     *
     * (`abc_parse_directive.js:718-724`.) Before the first note it is a TUNE setting the
     * sequencer reads once; after it, an ELEMENT in the stream taking effect where it
     * stands. `%%MIDI program 40` in the header sets the instrument for the whole tune;
     * `%%MIDI gchord fzczfzcz` mid-tune changes the strum pattern from that bar on, and
     * `flatten-change-gchord` is exactly that case.
     *
     * The parameters are kept as an ARRAY of number-or-string, which is abcjs's own shape
     * — `midi_params` — and is what lets `program 4` and `program 2 4` be told apart by
     * LENGTH rather than by a schema. Its per-command arity table is not reproduced: it
     * only ever produces warnings, and a consumer that reads `params[0]` when the command
     * takes one number is already tolerant of a wrong count.
     */
    const midiDirective = /^MIDI\s+(\S+)\s*(.*)$/.exec(body)
    if (midiDirective?.[1] !== undefined) {
      const cmd = midiDirective[1]
      const params: (string | number)[] = (midiDirective[2] ?? '')
        .split(/\s+/)
        .filter((t) => t !== '')
        .map((t) => (/^-?\d+$/.test(t) ? Number.parseInt(t, 10) : t))
      // `%%MIDI bassprog 10 octave=-1` — the octave arrives as a NUMBER, not as the token.
      // abcjs's `midiCmdParam1Integer1OptionalString` arm strips `octave=`, parses what is
      // left and CLAMPS it to [-1, 3] (`abc_parse_directive.js:686-716`), so the flattener
      // reads `params[1]` as a plain octave count. Keeping the raw string meant the chord
      // track's `bassprog?.length === 2` test never fired and both shifts stayed 0.
      if (cmd === 'bassprog' || cmd === 'chordprog') {
        const octave = typeof params[1] === 'string' ? /^octave=(-?\d+)$/.exec(params[1]) : null
        if (octave?.[1] !== undefined) {
          params[1] = Math.max(-1, Math.min(3, Number.parseInt(octave[1], 10)))
        }
      }
      const builder = this.ensureScore(start)
      // `drummap` ACCUMULATES where every other command replaces — abcjs builds
      // `tune.formatting.midi.drummap` as an OBJECT keyed by the written note
      // (`abc_parse_directive.js:592-600`), so a tune declares one line per drum. Storing
      // it as an array like the rest would keep only the last.
      if (cmd === 'drummap' && typeof params[0] === 'string' && typeof params[1] === 'number') {
        builder.drumMap[params[0]] = params[1]
        return
      }
      if (builder.musicStarted) builder.voice.addMidiCommand(cmd, params)
      else builder.midi[cmd] = params
      return
    }
    // `%%jazzchords` — chord modifiers and bass notes as small sub/superscripts. A bare
    // switch with no argument and no way back: `abc_parse_directive.js:791` only ever
    // assigns `true`.
    if (/^jazzchords\b/.test(body)) {
      this.ensureScore(start).jazzChords = true
      return
    }
    this.info(
      'unknown-directive',
      `directive not yet implemented: %%${body}`,
      sourceRange(start, end),
    )
  }

  /**
   * Append to the lyric line already in progress, rather than starting a new one.
   *
   * `addLyricLine` would make this the NEXT VERSE — a second `w:` under the same music is
   * verse 2 — so a continuation that used it would stack the second half of one line
   * underneath the first instead of after it.
   */
  private continueLyric(content: string, start: number, end: number): void {
    const builder = this.ensureScore(start)
    const offset = start + (end - start - content.length)
    builder.voice.appendLyricLine(this.takeLyricLine(content, offset, builder))
  }

  /**
   * Syllables for one `w:`/`+:` line, and the continuation flag it leaves behind.
   *
   * A trailing `\` is a CONTINUATION MARK, not text. abcjs strips it too — its fourth
   * syllable is "la", not "la\" — so this is not mode-split.
   */
  private takeLyricLine(content: string, offset: number, builder: ScoreBuilder): Syllable[] {
    const continues = /\\\s*$/.test(content)
    this.lyricContinues = continues
    const text = continues ? content.replace(/\\\s*$/, '') : content
    // AND THE MODE SPLIT IS REAL HERE, though not the one that used to be recorded.
    // Strict takes the font its MUSIC LINE started with, because that is abcjs's staff-level
    // granularity. `abc2.1` and `extended` take the one in force at this point in the
    // source, which is Gonzato §4.1.4's per-SEGMENT reading and the standard's intent.
    // What is NOT the split any more is "strict ignores `%%vocalfont` entirely" — abcjs
    // realizes it, and its own SVG says so in one attribute.
    return parseLyricSyllables(
      text,
      offset,
      this.mode,
      isStrict(this.mode) ? builder.lineVocalFont : builder.vocalFont,
    )
  }

  private applyField(
    letter: string,
    content: string,
    start: number,
    end: number,
    /** `[M:3/4]` written INSIDE a music line, which prints where it stands. */
    inline = false,
  ): void {
    const value = content.trim()
    const range = sourceRange(start, end)

    if (letter === 'X') {
      // A `%%` DIRECTIVE BEFORE THE FIRST `X:` IS THE FILE HEADER and applies to every
      // tune (ABC 2.1 §4.1). The builder holding it looks EMPTY — no `X:`, no `T:`, no
      // music — so `flush` was dropping it and `%%stretchlast 1` written above `X:1`
      // never reached the tune below it, which is 241px of `visual-wrap-02` on its own.
      //
      // …AND IT IS THE WHOLE LEADING CHUNK THAT GOES, not just an empty one. abcjs splits
      // the book on `"\nX:"` and, when that gives more than one piece and the first does
      // not itself start with `X:`, SHIFTS IT OFF — keeping only its `%%` lines, which it
      // prepends to every tune (`abc_parse_book.js:12-33`, its own "assume the top of the
      // file is intertune"). Everything else in it is DISCARDED, `T:` included.
      //
      // `isEmpty` alone was not that test: it wants no `X:`, no `T:` AND no music, so
      // `%% example / T: wed / %%example / X:1` kept its leading block as a TUNE and we
      // rendered two where abcjs renders one. A builder still holding no `X:` when an
      // `X:` arrives IS the leading chunk, whatever else it has collected.
      if (this.builder !== null && this.builder.tuneNumber === null) {
        this.fileDefaults = this.builder.formatting()
        this.builder = null
      }
      this.flush()
      const builder = this.ensureScore(start)
      builder.tuneNumber = Number.parseInt(value, 10) || null
      return
    }

    const builder = this.ensureScore(start)
    switch (letter) {
      case 'T':
        // ONLY A HEADER `T:` IS IN THE TOP-TEXT BLOCK. abcjs takes the title from
        // `metaText.title` and then walks `lines` while `lines[index].subtitle` holds —
        // LEADING subtitle lines only (`top-text.js:25-32`). A `T:` between two music
        // lines is a subtitle LINE, drawn where it stands, and putting it in the block
        // cost `mouse-click-01` 29.78px on every staff.
        //
        // A MID-TUNE `T:` IS A SUBTITLE LINE, drawn where it stands. It takes the same
        // road as a mid-tune `%%text`: onto `textBelow`, then onto the next system.
        // `theReverser` runs on EVERY `T:`, before `setTitle` decides which it is
        // (`abc_parse_header.js:543`).
        //
        // **AND `setTitle` BRANCHES ON `hasMainTitle`, NOT ON POSITION**
        // (`abc_parse_header.js:14-22`). A `T:` after the music is the TITLE — drawn in the
        // TOP block — when no earlier one claimed it; only the SECOND and later become
        // subtitles. A tune whose only `T:` follows its notes therefore looks exactly like
        // a tune with a header title, and we drew it as a trailing subtitle: 13.51px, on a
        // control ladder run through abcjs 6.7.0.
        if (builder.bodyStarted && builder.titles.length > 0) {
          builder.textBelow.push({
            lines: [theReverser(decodeTextString(value))],
            align: 'center',
            role: 'subtitle',
          })
        } else {
          // `T: C: O: A: P:` all run through `parseFontChangeLine`
          // (`abc_parse_header.js:484-541`), so any of them may come back as phrases.
          builder.titles.push(
            parseFontChangeLine(theReverser(decodeTextString(value)), builder.setfont),
          )
        }
        return
      case 'C':
        builder.composer = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      case 'R':
        builder.rhythm = decodeTextString(value)
        return
      case 'O':
        builder.origin = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      // `A:` — the author of the words, a row of its own in `composerfont`.
      case 'A':
        builder.author = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      /**
       * **THE BOTTOM-TEXT FIELDS** — `abc_parse_header.js:464-503`'s `metaTextHeaders`.
       * `N:`, `H:` and `W:` are the multi-line ones and ACCUMULATE, one entry per field
       * line; the rest are single and the last one written wins.
       *
       * `W:` is the UNALIGNED words — a whole verse printed under the tune — and is a
       * different field from `w:`, the aligned lyric that sits under its own notes.
       */
      case 'B':
        builder.book = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      case 'S':
        builder.source = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      case 'D':
        builder.discography = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      case 'Z':
        builder.transcription = parseFontChangeLine(decodeTextString(value), builder.setfont)
        return
      case 'N':
        builder.notes.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        return
      case 'H':
        builder.history.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        return
      case 'W':
        builder.unalignedWords.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        return
      case 'M': {
        if (builder.bodyStarted) {
          // A STANDALONE `M:` ON A CONTINUED LINE DRAWS WHERE IT STANDS, and that is a
          // THIRD case rather than a variant of either other one.
          //
          // The discriminator is which of abcjs's two parsers ever sees the field. A `M:`
          // on a fresh line is taken by the HEADER parser, which only fills
          // `multilineVars.meter` for the next `startNewLine` — its `letter_to_body_header`
          // arm is never reached, probed and confirmed silent. After a `\` continuation the
          // line is fed to `parseMusicLine` instead, which DOES reach that arm, and it runs
          // `appendStartingElement('meter', …)` on a line whose voice already holds notes —
          // so the meter is pushed onto the end of the music so far, mid-system.
          //
          // Measured on `S8-layout` X:812, whose `"Em"ABc def |\` is followed by `M: 9/8`:
          // abcjs draws `timeSignature x=207.51 w=10.93` straight after that bar at 196.51.
          // Ours parked it for the next line, where the tune's own `M: 6/8` overwrote it,
          // and the 9/8 was lost outright — 20.12px of every notehead on the system.
          //
          // `this.lineContinued` still holds the PREVIOUS line's flag here: a field line
          // returns from `parseLine` before the music path reassigns it.
          if (inline || this.lineContinued || this.continueAll) {
            builder.voice.setMeterChange(parseMeter(value), range, inline)
          } else builder.voice.setMeterForNextLine(parseMeter(value), range)
          return
        }
        builder.meter = parseMeter(value)
        builder.meterSourceRange = range
        if (!builder.unitExplicit) builder.unitNoteLength = defaultUnitLength(builder.meter)
        return
      }
      case 'L': {
        const unit = parseUnitLength(value)
        if (!unit) {
          this.warn('malformed-field', `L: expected a fraction, got "${value}"`, range)
          return
        }
        builder.unitNoteLength = unit
        builder.unitExplicit = true
        return
      }
      case 'P': {
        // A body `P:` labels the part that starts here. A header `P:` is a part ORDER,
        // a different feature — it closes the top-text block in `partsfont` — and it is
        // the LAST row abcjs writes there (`top-text.js:73-77`), for 24px.
        if (builder.bodyStarted && value.trim() !== '') {
          builder.voice.setPartLabel(value.trim(), range)
        } else if (!builder.bodyStarted) {
          builder.partOrder = parseFontChangeLine(decodeTextString(value), builder.setfont)
        }
        return
      }
      case 'Q': {
        // A mid-tune `Q:` sets the TUNE's tempo, not a tempo change at that point, because
        // that is what abcjs models: `tune.metaText.tempo` is tune-level wherever the field
        // sits, and its layout puts the mark at the head of the first system. Verified on
        // `frere-jacques`, whose only `Q:` is on line 21 and whose tempo element abcjs
        // emits on system 1, ahead of music that PRECEDES the field in the source.
        //
        // First one wins, matching abcjs's `if (!tune.metaText.tempo)`.
        //
        // A SECOND `Q:` IS NOT DROPPED, and that deferral is closed — the two paragraphs
        // below are what closed it. This used to read "a second `Q:` is dropped rather
        // than drawn as a tempo CHANGE in place… modelling one means a `tempoChange` on
        // Measure plus a renderer path with nothing to gate it." Both exist.
        // THE FIRST ONE ANYWHERE becomes the tune's, drawn at the head of system 1.
        // EVERY LATER ONE is an ordinary element in its own voice's stream, printed where
        // it stands — `synth-flattener-31` has four across three voices and abcjs draws
        // all five marks.
        //
        // …AND AN INLINE `[Q:]` IS THE TUNE'S TEMPO FOR THE PAGE AND NOT FOR THE CLOCK.
        // Measured on a control pair rather than read: abcjs DRAWS a head tempo mark for
        // `[Q:1/4=129]CDEF` — `data-name="tempo"` is in its SVG — and its `setUpAudio`
        // reports `tempo: 180`, the default, where the standalone `Q:1/4=129` form reports
        // 129. `metaText.tempo` is set by the FIELD parser and an inline field never
        // reaches it, so the mark is drawn from the element and the clock never hears it.
        // It still changes the tempo where it stands, so it is recorded as a change too —
        // `tempoInline` is what lets audio take the one and not the other.
        if (builder.tempo === null) {
          builder.tempo = parseTempo(value)
          builder.tempoInline = inline
          if (inline && builder.bodyStarted) builder.voice.setTempoChange(parseTempo(value))
        } else if (builder.bodyStarted) builder.voice.setTempoChange(parseTempo(value))
        return
      }
      case 'w': {
        // `w:` follows the music line it belongs to. Offset by 2 for the `w:` prefix.
        // `takeLyricLine` also sets `lyricContinues` from a trailing `\`.
        builder.voice.addLyricLine(this.takeLyricLine(content, start + 2, builder))
        return
      }
      case 'V': {
        // `V:1 clef=treble name="..."` — the id is the first token; the rest is voice
        // configuration. `clef=`, `octave=`, `middle=`, `stafflines=`, `name=`, `subname=`
        // `style=` and `transpose=` are read. `transpose=` is SOUNDING-ONLY — abcjs's
        // renderer has zero references to it — which is why `middle=` guards on its
        // PRESENCE rather than combining with it.
        const id = value.split(/\s+/)[0]
        if (!id) return
        // In the header a `V:` only DECLARES. Only a `V:` in the body switches the
        // current voice — otherwise `V:1` / `V:2` in the header left voice 2 current and
        // every note landed in it.
        builder.declareVoice(id, mergesStaff(value))
        if (builder.bodyStarted) builder.selectVoice(id)
        const octave = octaveModifier(value)
        if (octave !== null) builder.voiceFor(id).octaveShift = octave
        // `V:… transpose=-2` — SOUNDING only, and abcjs takes the sign from the token
        // rather than from a `+`: `tokens[0].intt` after the `=`.
        const shift = /\btranspose=\s*(-?\d+)/.exec(value)
        if (shift?.[1] !== undefined) {
          builder.voiceFor(id).transpose = Number.parseInt(shift[1], 10)
        }
        const voiceClef = parseClef(value)
        if (voiceClef !== null) builder.voiceFor(id).clef = voiceClef
        const bare = bareStaffLines(value)
        if (bare !== null) builder.voiceFor(id).staffLineOverride = bare
        const stems = stemModifier(value)
        if (stems !== null) builder.voiceFor(id).stemDirection = stems
        const name = voiceLabel(value, ['name', 'nm'])
        if (name !== undefined) builder.voiceFor(id).name = name
        const subname = voiceLabel(value, ['subname', 'sname', 'snm'])
        if (subname !== undefined) builder.voiceFor(id).subname = subname
        return
      }
      case 's': {
        // `s:` — decorations aligned under the music line, ABC 2.1 §8.2. Same token
        // grammar as `w:`, so the same splitter reads it.
        //
        // THE MODE SPLIT IS THE POINT. abcjs reads `s:` with its `w:` parser and pushes the
        // tokens onto `el.lyric` (`parse/abc_parse.js:317-395`), printing `!trill!` as a
        // lyric syllable — its own TODO at `:325` calls this out. Strict reproduces that by
        // handing the line to the lyric path, where an `s:` after a `w:` becomes the next
        // verse, which is what abcjs's `el.lyric.push` does. The other modes place them.
        const tokens = this.takeLyricLine(content, start + 2, builder)
        if (isStrict(this.mode)) builder.voice.addLyricLine(tokens)
        else builder.voice.addSymbolLine(tokens)
        return
      }
      /**
       * `[I:MIDI drumon]` — an INLINE instruction is a directive, in every mode.
       *
       * abcjs routes it unconditionally: `case "[I:": parseDirective.addDirective(…)`
       * (`abc_parse_header.js:353`), in the same switch as `[M:` and `[K:`. Nothing here
       * reached it — an inline field only dispatches on its LETTER and there was no `I`
       * arm — so `flatten-drum`'s `|[I:MIDI drumon]z4|` was silently dropped and the drum
       * track stayed off for the whole of its third line.
       *
       * Deliberately INLINE ONLY. A full-line `I:` is the mode-gated case above, whose
       * reasoning is about `+:` continuations and is not this question; abcjs's
       * `letter_to_body_header` does handle one, and strict's dropping it is a separate
       * open divergence with no case behind it yet.
       */
      case 'I': {
        if (inline) this.applyDirective(value, start, end)
        return
      }
      case 'U': {
        // `U:t = !tenuto!` — a single character standing for a decoration. The definition
        // is normally `!name!`; the delimiters are stripped so it joins the same namespace
        // the long form uses, and abcjs accepts `+name+` for the same thing.
        const define = /^\s*(\S)\s*=\s*(.+?)\s*$/.exec(value)
        const symbol = define?.[1]
        const body = define?.[2]?.replace(/^[!+]|[!+]$/g, '')
        if (symbol !== undefined && body !== undefined && body !== '') {
          this.ensureScore(start).userSymbols.set(symbol, body)
        }
        return
      }
      case 'K': {
        // `style=` rides on K: and sets the notehead shape for everything that follows,
        // until the next one — `[K: style=harmonic]`, then `[K: style=normal]` to end it.
        // It is voice state, not a property of the K: field.
        const keyStyle = styleModifier(value)
        if (keyStyle !== null) builder.voice.setNoteStyle(keyStyle, inline)
        if (builder.bodyStarted) {
          /**
           * **A STANDALONE `K:` BEFORE ANY MUSIC RESTAMPS THE CURRENT VOICE'S STAFF KEY,
           * AGAINST THE `K:`-CLEF.** `appendStartingElement` lands on
           * `staff[tune.staffNum].key` while that voice is still empty
           * (`parse/tune-builder.js:294`), and it is positioned by `multilineVars.clef`,
           * which only a `K:`'s own `clef=` writes. See `Score.firstLineKeyClef` — the
           * ladder that pins it is in `CHECKPOINT-2026-08-14.md`.
           */
          if (!inline && !builder.musicStarted)
            builder.firstLineKeyClef = {
              voiceId: builder.lastVoiceId,
              clef: clefWith(builder.clef, value),
            }
          // A style-only K: must not touch the key. `parseKey` reads the first token and
          // falls back to C for anything that is not a key letter, so passing it
          // `style=harmonic` would silently transpose the rest of the tune to C major.
          if (hasKeySpec(value)) builder.voice.setKeyChange(parseKey(value), range)
          // A MID-TUNE CLEF. `K:C clef=bass` and `[K: bass]` both land here, and abcjs
          // prints the new clef where it stands AND at the head of every system after it.
          const midClef = parseClef(value)
          if (midClef !== null) builder.voice.setClefChange(midClef)
          // A MID-TUNE `K: octave=` is GLOBAL and takes effect from here. abcjs reads it
          // per note as the fallback under the voice's own `octave=`, so `parse-note-id-01`
          // — whose second half is written an octave lower on purpose — printed 27.1px
          // (seven steps, one octave) below abcjs's.
          const midOctave = octaveModifier(value)
          if (midOctave !== null) builder.keyOctave.value = midOctave
          return
        }
        builder.key = parseKey(value)
        builder.keySourceRange = range
        // `K:C bass` sets the tune's clef; a `V:… clef=` still overrides it per voice.
        builder.clef = clefWith(builder.clef, value)
        const keyOctave = octaveModifier(value)
        if (keyOctave !== null) builder.keyOctave.value = keyOctave
        builder.bodyStarted = true // K: ends the header.
        return
      }
      default:
        if (!KNOWN_FIELDS.includes(letter)) {
          this.warn('unknown-field', `unknown information field "${letter}:"`, range)
        }
        return
    }
  }

  // ponytail: the Swift lexer streams; buffering one line's tokens into an array
  // costs nothing at ABC line lengths and makes the lookahead in note assembly
  // (octave marks, then length) plain indexing instead of a peek/rewind protocol.
  /** Whether the music line just read ended with a `\`, so the next continues it. */
  private lineContinued = false
  /** `%%continueall` — every music line continues (`abc_parse_directive.js:966`). */
  private continueAll = false

  private scanMusic(start: number, end: number, continued = false): void {
    const builder = this.ensureScore(start)
    // Music ENDS the header, not just `K:`. Normally the two coincide; they come apart
    // when a line before the `K:` is scanned as music, which strict mode does to `+:`
    // because abcjs does. abcjs agrees: `frere-jacques`'s `M:4/4` sits on line 14 and its
    // time signature is printed on system 3, so the `+:` prose on line 8 had already made
    // every later field a mid-tune one.
    builder.bodyStarted = true
    // …AND `musicStarted` IS THE NARROWER ONE. `bodyStarted` is also set by `K:`, which
    // ends the HEADER; abcjs's `hasBeginMusic()` asks whether a MUSIC LINE has been read,
    // and that is a different moment. `%%MIDI program 3` written on the line after `K:C`
    // and before the first note is a TUNE setting to abcjs and a mid-tune element to
    // anything that reads `bodyStarted` — `flatten-decorations` is exactly that shape.
    builder.musicStarted = true
    // THE VOCALFONT A LYRIC DRAWS IN IS THE ONE IN FORCE WHEN ITS MUSIC LINE BEGAN, not
    // when its `w:` line was read. `%%vocalfont` is a CHANGING font
    // (`abc_parse_directive.js:1022-1030`): it always writes `multilineVars.vocalfont`, and
    // writes `tune.formatting` only in the header. The mid-tune value reaches the drawing
    // through the STAFF — `params.vocalfont` on the `abcstaff`
    // (`abc_parse_music.js:1000-1001`), applied by
    // `staffgroup.getTextSize.updateFonts(abcstaff)` (`abstract-engraver.js:143`) — so its
    // granularity is the music LINE, and it takes effect from the next one.
    //
    // Measured three ways on abcjs itself: a header `%%vocalfont Helvetica 24` draws every
    // syllable at 32; the same directive between two music lines draws 17,17,17,17 then
    // 32,32,32,32; and Gonzato's fixture, whose music all precedes its directives, draws
    // every syllable at the DEFAULT 17 however many `%%vocalfont` lines follow.
    if (!continued) {
      builder.lineVocalFont = builder.vocalFont
      builder.voice.beginMusicLine()
    }
    // Re-read through the builder rather than capturing: an inline `[V:2]` mid-line
    // switches which voice subsequent events belong to.
    const voice = () => builder.voice
    const lexer = new Lexer(this.src.slice(0, end), start)
    const tokens: Token[] = []
    for (;;) {
      const token = lexer.next()
      if (token.kind === 'eof' || token.kind === 'newline') break
      tokens.push(token)
    }

    let i = 0
    let pendingAccidental: Accidental | null = null
    let accidentalStart: number | null = null
    /** Cents from a fractional accidental (`^3/2G`), pending until the note letter. */
    let pendingMicrotone = 0
    // Tuplet state. The ratio scales SOUNDING duration only — notatedDuration keeps the
    // written value, which is the whole reason those are separate fields: a triplet
    // eighth is written as an eighth but sounds for a twelfth.
    let tupletRemaining = 0
    let tupletRatio: Rational | null = null
    let tupletNumber = 0
    let tupletGroup = 0

    const applyTuplet = (event: MusicEvent): MusicEvent => {
      if (tupletRemaining <= 0 || !tupletRatio) return event
      tupletRemaining--
      return {
        ...event,
        duration: ratMul(event.duration, tupletRatio),
        tuplet: { group: tupletGroup, number: tupletNumber },
      }
    }

    /** Chord symbols, annotations and decorations bind to the next event. */
    let pending = noAttachments()
    /** `(` opens a slur on the NEXT event; `)` closes on the PREVIOUS one. */
    let pendingSlurStarts = 0
    /** `.(` / `.-` — see `Note.tieDotted`. Set by the dot, consumed by the mark it leads. */
    let pendingSlurDotted = false
    let dottedCurve = false
    let pendingGrace: GracePitch[] = []
    let pendingGraceSlash = false

    // ABC beaming: adjacent notes shorter than a quarter beam together. A space,
    // barline, rest, longer note, overlay boundary or end of line breaks the run.
    let beamRun: number[] = []
    const closeBeamRun = (): void => {
      if (beamRun.length >= 2) {
        const group = builder.nextBeamGroup()
        for (const index of beamRun) voice().setBeamGroup(index, group)
      }
      beamRun = []
    }
    const beamAfterEmit = (): void => {
      const last = voice().last
      if (last === undefined || last === null) {
        closeBeamRun()
        return
      }
      // A NOTE LONGER THAN AN EIGHTH ENDS THE BEAM WHATEVER IT IS — abcjs tests the
      // duration first and unconditionally: `if (dur >= 0.25) endBeamLast(tune)`
      // (`tune-builder.js:186-187`), rest or note alike.
      if (!ratLt(last.notatedDuration, rational(1, 4))) {
        closeBeamRun()
        return
      }
      // A SHORT REST DOES NOT BREAK THE BEAM, AND DOES NOT JOIN IT EITHER.
      //
      // abcjs's chain ends `else if (hashParams.rest === undefined) { …start or extend… }`
      // (`tune-builder.js:195-203`), so a rest that reaches it falls off the end: it is
      // neither made `potentialEndBeam` nor allowed to close the run, and the beam simply
      // SPANS it. The beam's last member stays the last NOTE.
      //
      // Only an explicit break stops it, and that is the branch above this one: a space
      // sets `end_beam`, and on a REST it takes `endBeamLast` — the beam ends on the note
      // BEFORE it — where on a note it takes `endBeamHere` and the note itself closes it.
      // Both are already ours, through `closeBeamRun` at the whitespace case.
      //
      // We broke on every rest, so `(6cegczg` came out as two beamed pairs and a bracket
      // in fourteen pieces where abcjs draws one beam and three bracket paths.
      if (last.type === 'rest') return
      beamRun.push(voice().lastIndex)
    }

    /**
     * A character abcjs warns "Unknown character ignored" about has been seen since the
     * last note. See the whitespace case — it swallows the beam break that a space would
     * otherwise make.
     */
    let ignoredSinceNote = false

    const emit = (event: MusicEvent): void => {
      ignoredSinceNote = false
      const broken = voice().pendingBroken
      voice().lastBroken = broken !== null
      const scaled = applyTuplet(broken ? scaleEvent(event, broken) : event)
      // A rest carries no ties and no slurs, but it still consumes the pending state so
      // they cannot leak past it.
      if (scaled.type === 'rest') {
        // A rest carries decorations, a chord symbol, annotations AND GRACE NOTES — but no
        // ties, slurs or lyrics. abcjs attaches `elem.chord` to whatever event follows the
        // `"…"`, rest included, and calls `addGraceNotes` outside its rest/note branch
        // entirely (`abstract-engraver.js:834`), so both engrave identically to a note's.
        voice().push({
          ...scaled,
          graceNotes: pendingGrace,
          graceSlash: pendingGraceSlash,
          decorations: pending.decorations,
          decorationSourceRanges: pending.decorationSourceRanges,
          chordSymbol: pending.chordSymbol,
          chordSymbolSourceRange: pending.chordSymbolSourceRange,
          chordFont: builder.chordFont,
          annotations: pending.annotations,
          annotationSourceRanges: pending.annotationSourceRanges,
        })
      } else {
        // Inline `!style=x!` wins for this note; otherwise the voice's standing style
        // from `K: style=` applies.
        const inline = resolveStyle(pending)
        const style = inline ?? voice().noteStyle
        const attached: Note | Chord = {
          ...scaled,
          ...pending,
          style,
          slurStarts: pendingSlurStarts,
          ...(pendingSlurDotted ? { slurDotted: true } : {}),
          graceNotes: pendingGrace,
          graceSlash: pendingGraceSlash,
        }
        voice().push(attached)
      }
      voice().pendingBroken = null
      pending = noAttachments()
      pendingSlurStarts = 0
      pendingSlurDotted = false
      pendingGrace = []
      pendingGraceSlash = false
      beamAfterEmit()
    }

    while (i < tokens.length) {
      const token = tokens[i] as Token
      switch (token.kind) {
        case 'accidental': {
          if (accidentalStart === null) accidentalStart = token.start
          pendingAccidental = combineAccidental(pendingAccidental, token.aux)
          i++
          // A fraction directly after the accidental and BEFORE the note letter is a
          // microtone (`^3/2G`), not a duration — durations follow the note letter.
          if (
            (tokens[i] as Token | undefined)?.kind === 'digit' ||
            (tokens[i] as Token | undefined)?.kind === 'slash'
          ) {
            const fraction = this.readLength(tokens, i)
            const sign = Math.sign(pendingAccidental ?? 0)
            pendingMicrotone = Math.round(
              ((sign * fraction.factor.numerator) / fraction.factor.denominator) * 100,
            )
            i = fraction.next
            // MODE-GATED SOURCE RANGE. abcjs starts a microtonal note's span at the note
            // LETTER, excluding the `^3/2` — while a plain `^G` starts at the accidental
            // and includes it. That is inconsistent with itself, and strict's job is to
            // reproduce abcjs rather than to improve on it, so the range is dropped back
            // to the letter here.
            //
            // Every other mode keeps the whole `^3/2G`, which is what the range is FOR:
            // these offsets drive editor cross-linking, and a caret inside `^3/2` must
            // identify the note it alters rather than nothing at all.
            if (isStrict(this.mode)) accidentalStart = null
          }
          break
        }
        case 'noteLetter': {
          voice().noteMeasureStart(accidentalStart ?? token.start)
          const built = this.buildNote(
            tokens,
            i,
            builder,
            pendingAccidental,
            pendingMicrotone,
            accidentalStart,
          )
          emit(built.note)
          i = built.next
          pendingAccidental = null
          accidentalStart = null
          pendingMicrotone = 0
          break
        }
        case 'rest': {
          voice().noteMeasureStart(token.start)
          const built = this.buildRest(tokens, i, builder)
          emit(built.rest)
          i = built.next
          // A rest consumes pending accidental state rather than passing it to the next
          // note: `^2zA` used to give the unaltered `A` a microtone of 200 cents.
          pendingAccidental = null
          accidentalStart = null
          pendingMicrotone = 0
          break
        }
        case 'openBracket': {
          const built = this.buildChord(tokens, i, builder)
          // An empty `[…]` is not a musical event — emitting it would insert a phantom
          // zero-pitch chord into the stream.
          if (built.chord.pitches.length > 0) {
            voice().noteMeasureStart(token.start)
            // AFTER whatever was written before the `[` — abcjs pushes onto the same
            // `el.decoration` the outer ones are already on, so the order is source order.
            for (const d of built.innerDecorations) {
              pending.decorations.push(d)
              pending.decorationSourceRanges.push(sourceRange(token.start, token.start + 1))
            }
            emit(built.chord)
          }
          i = built.next
          pendingAccidental = null
          accidentalStart = null
          break
        }
        case 'brokenRhythm': {
          // `>` lengthens what came before and shortens what follows; `<` is the mirror.
          // Consecutive marks stack (`>>`), and the lexer emits one token per character.
          let arrows = 1
          while ((tokens[i + arrows] as Token | undefined)?.kind === 'brokenRhythm') arrows++
          if (arrows > MAX_BROKEN_RHYTHM_ARROWS) {
            this.warnAt(token, 'malformed-broken-rhythm', `${arrows} broken-rhythm marks; clamped`)
          }
          const { long, short } = brokenRhythmFactors(arrows)
          const lengthenFirst = token.aux === '>'
          const previous = voice().last
          if (previous) {
            voice().replaceLast(scaleEvent(previous, lengthenFirst ? long : short))
            voice().pendingBroken = lengthenFirst ? short : long
          } else {
            this.warn(
              'broken-rhythm-without-note',
              'broken rhythm mark has no preceding note',
              sourceRange(token.start, token.start + token.length),
            )
          }
          i += arrows
          break
        }
        case 'chordSymbol': {
          const range = sourceRange(token.start, token.start + token.length)
          // `\n` IS A LINE BREAK AND `\"` A QUOTE, inside a quoted chord or annotation and
          // nowhere else — `substInChord`, applied by `getBrackettedSubstring` the moment
          // the substring is read (`abc_tokenizer.js:784-807`). It is NOT `translateString`,
          // which handles accent escapes and leaves an unknown `\x` alone: `\n` is not in
          // any of its char maps, so routing a chord through it kept the backslash.
          //
          // Ours dropped the backslash and kept the `n`, so `"C$1m$7\ntwo"` came out as the
          // single line `C$1m$7ntwo` — one chord lane where abcjs takes two, and a mark
          // four characters too wide. That one chord was the whole of `visual-misc-06`:
          // 16.92 of dx, 29.60 of ox and 18.52 of oy, all four axes exact once it is split.
          const text = substInChord(this.src.slice(token.start + 1, token.start + token.length - 1))
          if (isAnnotation(text)) {
            pending.annotations.push(decodeTextString(text))
            pending.annotationSourceRanges.push(range)
          } else {
            // TWO CHORD SYMBOLS ON ONE NOTE STACK, they do not replace each other:
            // `if (el.chord[ci].position === ret[2]) el.chord[ci].name += "\n" + chordName`
            // (`abc_parse_music.js:200-205`). `"D""G"d` is one chord named `D\nG`, and the
            // engraver makes each LINE its own centred mark — so it takes two chord LANES
            // and the staff is 18.52px taller. A `;` inside one means the same thing
            // (`:198`).
            const name = prettifyChord(decodeTextString(text)).replace(/;/g, '\n')
            pending.chordSymbol =
              pending.chordSymbol === null ? name : `${pending.chordSymbol}\n${name}`
            pending.chordSymbolSourceRange = range
          }
          i++
          break
        }
        case 'decoration': {
          // `!name!` — the LONG form. Strict drops any name abcjs does not recognise; see
          // ABCJS_LEGAL_ACCENTS. The shorthand path below is deliberately not filtered,
          // because abcjs does not filter it either.
          const name = this.src.slice(token.start + 1, token.start + token.length - 1)
          // `!class=name!` IS NOT A DECORATION — new in abcjs 6.7.0, and handled in the
          // same `if` as `!style=…!`, one arm along:
          //
          //     if (ret[1].indexOf("style=") === 0) el.style = ret[1].substring(6)
          //     else if (ret[1].indexOf("class=") === 0) el.extraClass = ret[1].substring(6)
          //     else { … el.decoration.push(ret[1]) }
          //
          // (`abc_parse_music.js:227-231`.) It is styling only: an arbitrary CSS class on
          // the element group, engraving nothing. Ours pushed it into `decorations`, where
          // it took a slot on the stacking cursor and moved the notes 3.88px — one pitch,
          // the height of a decoration lane.
          //
          // ponytail: the class is DROPPED rather than carried through to the markup.
          // abcjs emits it on the group only under `add_classes`, and the `-classes`
          // goldens are not gated here; `extra-class`'s own header says that is the golden
          // which would witness it.
          if (name.startsWith('class=')) {
            i++
            break
          }
          if (!isStrict(this.mode) || ABCJS_KNOWN_DECORATIONS.has(decorationLookupName(name))) {
            pending.decorations.push(name)
            pending.decorationSourceRanges.push(
              sourceRange(token.start, token.start + token.length),
            )
          }
          i++
          break
        }
        case 'unknown': {
          // Decoration shorthands (`.` staccato, `T` trill, `v` downbow) lex as unknown
          // because they are not note letters. Anything else stays ignored.
          //
          // `.` is the exception: before `(` or `-` it marks a DOTTED SLUR or DOTTED TIE
          // and belongs to that, not to the note. Treating it as staccato attached a
          // decoration no renderer should draw.
          const nextKind = (tokens[i + 1] as Token | undefined)?.kind
          const dotsAMark = token.aux === '.' && (nextKind === 'lparen' || nextKind === 'tie')
          // …AND THE DOT IS NOT DISCARDED, IT IS THE CURVE'S STYLE — see
          // `Note.tieDotted`. It was read here and thrown away, so `.- ` and `-` drew the
          // same filled lens where abcjs strokes a dashed one.
          if (dotsAMark) dottedCurve = true
          // User definitions WIN over the built-ins — abcjs looks in its macro table
          // first (`abc_parse_music.js:756`) and only falls through to the hard-coded
          // letters. `frere-jacques` relies on exactly that to swap `u` and `v`.
          const userSymbol = builder.userSymbols.get(token.aux)
          const shorthand = dotsAMark ? undefined : (userSymbol ?? DECORATION_SHORTHAND[token.aux])
          if (shorthand) {
            pending.decorations.push(shorthand)
            pending.decorationSourceRanges.push(
              sourceRange(token.start, token.start + token.length),
            )
          } else {
            // abcjs's "Unknown character ignored". Ignored for CONTENT, but not inert —
            // see the whitespace case.
            ignoredSinceNote = true
          }
          i++
          break
        }
        case 'whitespace': {
          // A space breaks the beam, with two exceptions measured out of abcjs 6.6.3.
          //
          // This once carried a blanket exception for `note- note`, justified in a comment
          // as "the tie binds the two notes and abcjs keeps them beamed". That is false as
          // stated, and the true rule is narrower and stranger:
          //
          //                          tie + space   space alone
          //   chord                    NO break      break
          //   chord after `>` or `<`   break         break
          //   note                     break         break
          //
          // The broken-rhythm row came from `ragtime-nightingale`, whose
          // `[fa]/>[da]/- [da]/` breaks where `[fa]/[da]/- [da]/` does not.
          //
          // NO MECHANISM IS CLAIMED. abcjs's parser was read three times to explain this
          // and gave a different answer each time: it sets `end_beam` unconditionally on
          // whitespace (`abc_parse_music.js:1242`), promotes it only below a quarter
          // (`addEndBeam`), and the tie lookahead never clears it — which predicts a break
          // in EVERY row above, including the one that does not break. The table is
          // reproducible across all eight cases; the explanation is not available here.
          // Recording evidence instead of inventing a cause is the point: the original
          // version of this exception asserted a plausible reason ("the tie binds the two
          // notes") that was false, and it cost a fixture.
          //
          // A tie suppresses the break only when what was tied is a CHORD. `[Ce]- [Ce]`
          // stays in one run; `CD- DE` splits into two. Almost certainly an abcjs bug —
          // a chord tie leaves state set that swallows the break — but strict mode's job
          // is to reproduce it, so it is reproduced rather than tidied.
          //
          // The second exception is anything still WAITING to attach to the next note.
          // In `de/f/P ^c3/d/` the space sits between `P` and the note it decorates, and
          // abcjs beams straight through; the same holds for a grace group, so
          // `C/D/{=de} E/F/` is one run while `C/D/ {=de}E/F/` is two. Move the mark to
          // the far side of the space and the break comes back.
          const tiedChord =
            (tokens[i - 1] as Token | undefined)?.kind === 'tie' &&
            voice().last?.type === 'chord' &&
            // A BROKEN RHYTHM cancels the exception. Measured, not derived.
            !voice().lastBroken
          // Anything still waiting to attach to the NEXT note holds the beam open — a
          // decoration or a grace group. `de/f/P ^c` and `C/D/{=de} E/F/` both beam
          // through; move either mark past the space and it breaks again.
          const pendingAttachment = pending.decorations.length > 0 || pendingGrace.length > 0
          // The third exception, and the one that closed `frere-jacques`'s last 3 links.
          // A space breaks the beam only when it is still the NOTE's own business — when
          // nothing has come between. Let a character abcjs merely warns about intervene
          // and the break is gone, even though that character contributes nothing to the
          // music and no attachment is pending.
          //
          // Measured across all eight boundaries in the `+:` prose abcjs lexes as music,
          // where the ignored characters are the consonants of an English sentence:
          //
          //   "…respective owners"   `e` then space          BREAK
          //   "…entitled holders"    `d` then space          BREAK
          //   "belongs to their"     `g` then `s` then space  no break
          //   "their respective"     `e` then `ir` then space no break
          //   "owners, or to the"    `e` then `rs,` then space no break
          //
          // Eight of eight. A TIE does not have this effect — `CD- DE` still breaks — so
          // this is not "anything at all suppresses it": abcjs handles a tie inside the
          // note's own parse and an unknown character outside it.
          if (!tiedChord && !pendingAttachment && !ignoredSinceNote) closeBeamRun()
          i++
          break
        }
        case 'tie': {
          voice().tieLast(dottedCurve)
          dottedCurve = false
          i++
          break
        }
        case 'rparen': {
          // **A `)` STRAIGHT AFTER A GRACE GROUP CLOSES ON THE LAST GRACE** — see
          // `GracePitch.slurEnds`. `pendingGrace` is cleared the moment a note consumes the
          // group, so its being non-empty here IS "nothing has come between".
          const lastGrace = pendingGrace[pendingGrace.length - 1]
          if (lastGrace !== undefined) {
            pendingGrace = [
              ...pendingGrace.slice(0, -1),
              { ...lastGrace, slurEnds: (lastGrace.slurEnds ?? 0) + 1 },
            ]
            i++
            break
          }
          voice().slurEndLast()
          i++
          break
        }
        case 'grace': {
          const inner = this.src.slice(token.start + 1, token.start + token.length - 1)
          const grace = parseGracePitches(inner)
          pendingGrace = grace.pitches
          pendingGraceSlash = grace.slash
          i++
          break
        }
        case 'lparen': {
          // `(` alone is a slur; `(p:q:r` opens a tuplet — p notes in the time of q, over
          // the next r notes, with q and r each optional (`(3`, `(3:2`, `(3::4`).
          //
          // Read the spec straight from the source rather than from tokens: `::` lexes as
          // a double-repeat barline and a lone `:` is ambiguous, so a token walk misreads
          // exactly the forms that omit a field.
          const spec = /^\((\d+)(?::(\d*))?(?::(\d*))?/.exec(
            this.src.slice(token.start, token.start + 16),
          )
          if (!spec?.[1]) {
            pendingSlurStarts++
            if (dottedCurve) {
              pendingSlurDotted = true
              dottedCurve = false
            }
            i++
            break
          }
          const specEnd = token.start + spec[0].length
          while (i < tokens.length && (tokens[i] as Token).start < specEnd) i++

          // A nested `(3` inside an unfinished group is swallowed: `(3:2:6(3GGGA2Bc` is
          // one 6-note group, matching abcjs. The outer group keeps running.
          if (tupletRemaining > 0) break

          const p = Number.parseInt(spec[1], 10)
          const compound = builder.meter ? isCompoundMeter(builder.meter) : false
          const q = spec[2] ? Number.parseInt(spec[2], 10) : defaultTupletQ(p, compound)
          const r = spec[3] ? Number.parseInt(spec[3], 10) : p
          // A tuplet needs at least 2 notes; `(0`/`(1` would divide by ~zero.
          if (p >= 2 && q >= 1) {
            tupletRemaining = Math.max(r, 1)
            tupletRatio = rational(q, p)
            tupletNumber = p
            tupletGroup = builder.nextTupletGroup()
          }
          break
        }
        case 'voiceOverlay': {
          closeBeamRun() // a beam cannot cross a layer boundary
          voice().startOverlay()
          tupletRemaining = 0 // a tuplet group cannot span an `&` layer boundary
          i++
          break
        }
        case 'inlineField': {
          // `[V:2]`, `[K:G]`, `[M:3/4]` — same fields as a header line, written inline.
          const text = this.src.slice(token.start + 1, token.start + token.length - 1)
          const colon = text.indexOf(':')
          // Beam-run indices are resolved against whatever voice is current when the run
          // closes, so a voice switch must close it first — otherwise voice 1's notes
          // went unbeamed and its indices were applied to voice 2.
          if (colon === 1 && text[0] === 'V') closeBeamRun()
          if (colon === 1) {
            this.applyField(
              text[0] as string,
              text.slice(2),
              token.start,
              token.start + token.length,
              true,
            )
          }
          i++
          break
        }
        case 'barline': {
          closeBeamRun() // beams do not cross barlines; assign before the measure closes
          const text = this.src.slice(token.start, token.start + token.length)
          // A DECORATION STILL WAITING WHEN THE BAR ARRIVES ATTACHES TO THE BAR — abcjs
          // builds it in `createBarLine`, not on the next note (`abstract-engraver.js:1002`).
          // Held for the NEXT note instead, `CCCC!D.C.alcoda!|DDDD` put the mark over the D.
          // …AND SO DOES A CHORD SYMBOL OR AN ANNOTATION, by the two lines after it:
          // `if (el.chord !== undefined) bar.chord = el.chord`, then `el = {}` clears the
          // pending set (`abc_parse_music.js:288-289, 305`). `"D"|` centres the chord on
          // the BARLINE — golden `transpose-output-03` draws it at x 491.73 against a bar
          // at 491.734 — where we carried it to the next note, 15.8px right of abcjs.
          // A barline that OPENS a measure keeps nothing: `closeMeasure` returns false
          // there, and the chord stays pending for the next note rather than being lost.
          const closed = voice().closeMeasure(
            BARLINES[text] ?? 'thin',
            sourceRange(token.start, token.start + token.length),
            pending.decorations,
            pending.chordSymbol,
            pending.annotations,
          )
          // Cleared either way now: an OPENING barline keeps them too (see `closeMeasure`),
          // where before this the decorations were cleared into nothing and the chord was
          // left pending for the next note.
          pending.decorations = []
          pending.decorationSourceRanges = []
          pending.chordSymbol = null
          pending.chordSymbolSourceRange = null
          pending.annotations = []
          pending.annotationSourceRanges = []
          i++

          // A digit straight after the barline opens a repeat ENDING — `|1`, `:|2`. The
          // lexer already emits it as a digit token; nothing consumed it, so the number
          // was silently dropped and a reader could not tell where a repeat went.
          // `1,2` and `1-3` label one ending for several passes.
          const label: string[] = []
          while (i < tokens.length) {
            const next = tokens[i]
            if (next === undefined) break
            const raw = this.src.slice(next.start, next.start + next.length)
            if (next.kind === 'digit' || (label.length > 0 && (raw === ',' || raw === '-'))) {
              label.push(raw)
              i++
            } else break
          }
          if (label.length > 0) {
            voice().setVolta(label.join(''), sourceRange(token.start, tokens[i - 1]?.start ?? 0))
          }
          break
        }
        default:
          i++
          break
      }
    }
    closeBeamRun() // end of line breaks any open beam
  }

  private buildNote(
    tokens: readonly Token[],
    index: number,
    builder: ScoreBuilder,
    accidental: Accidental | null,
    microtoneCents: number,
    accidentalStart: number | null,
  ): { note: Note; next: number } {
    const token = tokens[index] as Token
    const head = this.readNoteHead(tokens, index, accidental, microtoneCents)
    const length = this.readLength(tokens, head.next)
    const last = tokens[Math.max(index, length.next - 1)] as Token
    const duration = ratMul(builder.unitNoteLength, length.factor)

    const note: Note = {
      type: 'note',
      chordFont: builder.chordFont,
      pitch: head.pitch,
      duration,
      notatedDuration: duration,
      tiedToNext: false,
      slurStarts: 0,
      slurEnds: 0,
      graceNotes: [],
      graceSlash: false,
      beamGroup: null,
      lyric: null,
      lyricSourceRange: null,
      lyricFont: null,
      lyricMelisma: false,
      lyricMelismaStart: false,
      extraVerses: [],
      style: 'normal',
      microtoneCents,
      tuplet: null, // set by applyTuplet() on emit
      ...noAttachments(), // filled in by emit()
      // Includes a leading accidental, matching v2's implementation (`from: accStart`).
      // v2's doc comment on Note.sourceRange claims the opposite; the code wins, and
      // including it is what editor cross-linking wants — clicking `^` selects its note.
      sourceRange: sourceRange(accidentalStart ?? token.start, last.start + last.length),
    }
    return { note, next: length.next }
  }

  /** Reads `noteLetter octave*` into a pitch. The caller supplies any preceding accidental. */
  private readNoteHead(
    tokens: readonly Token[],
    index: number,
    accidental: Accidental | null,
    /** `^/` and `_/` are their own names in abcjs — see `Pitch.writtenAccidental`. */
    microtoneCents = 0,
  ): { pitch: Pitch; next: number } {
    const letter = (tokens[index] as Token).aux
    const step = letter.toLowerCase() as DiatonicStep
    // Case sets the octave: uppercase C..B is octave 4, lowercase c..b is octave 5.
    let octave = letter >= 'a' && letter <= 'g' ? 5 : 4

    let i = index + 1
    let marks = ''
    while (i < tokens.length) {
      const next = tokens[i] as Token
      if (next.kind === 'octaveUp') {
        octave++
        marks += "'"
      } else if (next.kind === 'octaveDown') {
        octave--
        marks += ','
      } else break
      i++
    }
    // A QUARTER TONE IS ITS OWN `accMap` NAME. `_/` lexes as a flat with -50 cents and
    // `^/` as a sharp with +50; every other fraction (`^3/2`) has no entry in abcjs's table
    // and keeps the base sign.
    const quarter =
      accidental === -1 && microtoneCents === -50
        ? '_/'
        : accidental === 1 && microtoneCents === 50
          ? '^/'
          : undefined
    // The SOURCE spelling, kept because it cannot be derived — see `Pitch.written`.
    return {
      pitch: {
        step,
        octave,
        accidental,
        written: letter + marks,
        ...(quarter === undefined ? {} : { writtenAccidental: quarter }),
      },
      next: i,
    }
  }

  /**
   * `[CEG]` — notes sounding simultaneously, one event.
   *
   * Chord length follows ABC §4.18: a length after the `]` wins (`[CEG]2`), otherwise the
   * FIRST inner note's length carries the chord (`[g4d4]`). Per-notehead durations are
   * recorded only when they actually differ, so a uniform chord stays clean.
   */
  private buildChord(
    tokens: readonly Token[],
    index: number,
    builder: ScoreBuilder,
  ): { chord: Chord; next: number; innerDecorations: string[] } {
    const open = tokens[index] as Token
    const pitches: Pitch[] = []
    const innerMultipliers: Rational[] = []
    let accidental: Accidental | null = null
    let i = index + 1
    /**
     * A DECORATION INSIDE A CHORD MODIFIES THE WHOLE CHORD, and its POSITION is data.
     *
     * abcjs pushes it onto `el.decoration` — the chord's own list, "if we found a
     * decoration above, it modifies the entire chord" (`abc_parse_music.js:356-363`) —
     * with only `style=` going to the individual pitch. So `[!pppp!c!ffff!D]` is one chord
     * carrying two dynamics, and the flattener then zips that list against the SORTED
     * pitches by index: decoration 0 sets the volume of the lowest note. `volume-in-chords`
     * is that tune and nothing else in either corpus writes one.
     *
     * Held back until a note actually follows, because abcjs keeps the accent only inside
     * `if (chordNote !== null && chordNote.pitch !== undefined)` — a trailing `[ce!p!]`
     * fails its `getCoreNote` and the accent is discarded.
     */
    const innerDecorations: string[] = []
    let pendingInner: string[] = []

    while (i < tokens.length && (tokens[i] as Token).kind !== 'closeBracket') {
      const token = tokens[i] as Token
      if (token.kind === 'accidental') {
        accidental = combineAccidental(accidental, token.aux)
        i++
        continue
      }
      if (token.kind === 'noteLetter') {
        const head = this.readNoteHead(tokens, i, accidental)
        const length = this.readLength(tokens, head.next)
        pitches.push(head.pitch)
        innerMultipliers.push(length.factor)
        innerDecorations.push(...pendingInner)
        pendingInner = []
        accidental = null
        i = length.next
        continue
      }
      const decoration = this.chordDecoration(token, builder)
      if (decoration !== null) pendingInner.push(decoration)
      i++ // ponytail: chord symbols inside `[…]` are still skipped.
    }
    if ((tokens[i] as Token | undefined)?.kind === 'closeBracket') i++

    const post = this.readLength(tokens, i)
    const postIsUnit = post.factor.numerator === 1 && post.factor.denominator === 1
    const chordMultiplier = postIsUnit ? (innerMultipliers[0] ?? rational(1)) : post.factor
    const duration = ratMul(builder.unitNoteLength, chordMultiplier)

    const headDurations = innerMultipliers.map((m) =>
      ratMul(ratMul(builder.unitNoteLength, m), post.factor),
    )
    const mixed = headDurations.some((h) => !ratEq(h, duration))

    const last = tokens[Math.max(index, post.next - 1)] as Token
    return {
      chord: {
        type: 'chord',
        chordFont: builder.chordFont,
        pitches,
        duration,
        notatedDuration: duration,
        tiedToNext: false,
        slurStarts: 0,
        slurEnds: 0,
        graceNotes: [],
        graceSlash: false,
        beamGroup: null,
        lyric: null,
        lyricSourceRange: null,
        lyricFont: null,
        lyricMelisma: false,
        lyricMelismaStart: false,
        extraVerses: [],
        style: 'normal',
        headDurations: mixed ? headDurations : [],
        microtoneCents: 0, // ponytail: microtones inside a chord when a fixture needs it
        tuplet: null, // set by applyTuplet() on emit

        ...noAttachments(), // filled in by emit()
        sourceRange: sourceRange(open.start, last.start + last.length),
      },
      next: post.next,
      innerDecorations,
    }
  }

  /** The decoration a token inside `[…]` names, or `null` if it names none. */
  private chordDecoration(token: Token, builder: ScoreBuilder): string | null {
    if (token.kind === 'decoration') {
      const name = this.src.slice(token.start + 1, token.start + token.length - 1)
      // `style=` goes on the individual PITCH and `class=` on the element group — abcjs
      // excludes both from `el.decoration` by the same test it uses outside a chord.
      if (name.startsWith('style=') || name.startsWith('class=')) return null
      if (isStrict(this.mode) && !ABCJS_KNOWN_DECORATIONS.has(decorationLookupName(name))) {
        return null
      }
      return name
    }
    if (token.kind === 'unknown') {
      return builder.userSymbols.get(token.aux) ?? DECORATION_SHORTHAND[token.aux] ?? null
    }
    return null
  }

  private buildRest(
    tokens: readonly Token[],
    index: number,
    builder: ScoreBuilder,
  ): { rest: Rest; next: number } {
    const token = tokens[index] as Token
    const kind = REST_KINDS[token.aux] ?? 'normal'
    const length = this.readLength(tokens, index + 1)
    let last = token
    if (length.next > index + 1) last = tokens[length.next - 1] as Token
    // A MULTI-MEASURE REST'S MULTIPLIER IS A COUNT TO PRINT, NOT A DURATION.
    //
    // `abc_parse_music.js:1214` reads `el.duration = num.num * tune.getBarLength()`, which
    // predicts 24 for `Z24`. MEASURED at layout, abcjs's element carries `duration: 1`
    // whatever the count and whatever the meter — probed on `Z24` with no `M:`, `Z2` in
    // 3/4 and `Z5` in 2/4, all three a flat 1. So the spring is one whole note's worth and
    // the multiplier only reaches `rest.text`.
    //
    // Reading it as `unitNoteLength x count` gave `Z24` a duration of 6 and a spring four
    // times too long; reading the source literally gave 24 and one four times too long
    // again in the other direction. The output settled it.
    const multi = kind === 'multiMeasure' || kind === 'invisibleMultiMeasure'
    const bars = multi
      ? Math.max(1, Math.round(length.factor.numerator / length.factor.denominator))
      : 0
    let duration = multi ? rational(1, 1) : ratMul(builder.unitNoteLength, length.factor)
    // A REST OF EXACTLY ONE WHOLE NOTE TAKES THE MEASURE'S DURATION, and this is a PARSER
    // rule, not the engraver's:
    //
    //     if (el.rest && el.rest.type === 'rest' && el.duration === 1 &&
    //         durationOfMeasure(multilineVars) <= 1) {
    //       el.rest.type = 'whole';
    //       el.duration = durationOfMeasure(multilineVars);
    //     }
    //
    // (`abc_parse_music.js:549-555`.) Its test is `duration === 1`, where the engraver's
    // is `measureLength === duration` (`abstract-engraver.js:812`) — two different rules
    // that agree in 4/4 and part company everywhere else. `z4` in `M:6/8 L:1/4` is one
    // whole note in a three-quarter bar: abcjs gives it duration 0.75 and a WHOLE rest
    // glyph, and its own probe reads `dur=0.75 elemdur=0.75`. Ours sprang it as a whole
    // note, 7.35px wider than abcjs's on the one bar and carried down the system.
    //
    // `durationOfMeasure` reads `origMeter` — the HEADER `M:` — and returns 1 when there
    // is none (`:743-751`), which is `builder.meter`: a mid-tune `M:` goes to
    // `setMeterChange` and never touches it.
    const barLength = builder.meter === null ? rational(1, 1) : measureDuration(builder.meter)
    if (
      !multi &&
      kind === 'normal' &&
      ratEq(duration, rational(1, 1)) &&
      !ratLt(rational(1, 1), barLength)
    ) {
      duration = barLength
    }
    // `Z4` is four measures of the bar counter, not one — see `countMultiMeasureRest`.
    if (multi) builder.countMultiMeasureRest(bars)
    return {
      rest: {
        type: 'rest',
        duration,
        notatedDuration: duration,
        kind,
        decorations: [], // filled in by emit()
        decorationSourceRanges: [],
        chordSymbol: null, // filled in by emit()
        chordSymbolSourceRange: null,
        chordFont: null,
        annotations: [],
        annotationSourceRanges: [],
        graceNotes: [],
        graceSlash: false,
        tuplet: null, // set by applyTuplet() on emit
        // `Z4` is FOUR bars' rest — the multiplier counts measures, not note lengths, and
        // a bare `Z` is one. Only a multi-measure rest carries it.
        measureCount: bars,
        sourceRange: sourceRange(token.start, last.start + last.length),
      },
      next: length.next,
    }
  }

  /** `A3` → 3/1, `A/` → 1/2, `A//` → 1/4, `A3/2` → 3/2. */
  private readLength(tokens: readonly Token[], from: number): { factor: Rational; next: number } {
    let i = from
    let numerator = 1
    let denominator = 1

    const first = tokens[i]
    if (first?.kind === 'digit') {
      // A digit run long enough to overflow parses as Infinity, which used to reach
      // rational() and hang gcd(). Zero IS valid here — `B0` is a legal zero-duration note.
      const value = Number.parseInt(this.text(first), 10)
      if (Number.isSafeInteger(value) && value >= 0) numerator = value
      else this.warnAt(first, 'malformed-length', `note length out of range: ${this.text(first)}`)
      i++
    }
    while (tokens[i]?.kind === 'slash') {
      i++
      const digits = tokens[i]
      if (digits?.kind === 'digit') {
        // `/0` is not a length. Ignore it rather than dividing by zero.
        const value = Number.parseInt(this.text(digits), 10)
        if (Number.isSafeInteger(value) && value > 0) denominator = value
        else
          this.warnAt(
            digits,
            'malformed-length',
            `note length divisor invalid: /${this.text(digits)}`,
          )
        i++
      } else {
        denominator *= 2
      }
      // `A////////…` doubles the denominator each time; stop before it overflows.
      if (!Number.isSafeInteger(denominator)) {
        this.warn('malformed-length', 'note length divisor overflowed', null)
        denominator = 1
        break
      }
    }
    return { factor: rational(numerator, denominator), next: i }
  }

  private text(token: Token): string {
    return this.src.slice(token.start, token.start + token.length)
  }
}

/**
 * Broken rhythm (`a>b`): one side is dotted, the other shortened by the same amount, so
 * the pair still fills the same time. n arrows give (2 - 2^-n) and 2^-n — `>` is 3/2 and
 * 1/2, `>>` is 7/4 and 1/4, `>>>` is 15/8 and 1/8.
 */
function brokenRhythmFactors(arrows: number): { long: Rational; short: Rational } {
  // Clamped: `2 * 2**arrows - 1` passes MAX_SAFE_INTEGER at 53 arrows and would throw in
  // rational(). Beyond about 4 the notation is meaningless anyway — `>>>>` already means
  // 31/16 against 1/16.
  const denominator = 2 ** Math.min(arrows, MAX_BROKEN_RHYTHM_ARROWS)
  return {
    long: rational(2 * denominator - 1, denominator),
    short: rational(1, denominator),
  }
}

/** Broken rhythm scales BOTH sounding and notated duration — unlike a tuplet. */
function scaleEvent(event: MusicEvent, factor: Rational): MusicEvent {
  return {
    ...event,
    duration: ratMul(event.duration, factor),
    notatedDuration: ratMul(event.notatedDuration, factor),
  }
}

/** Everything that can be written before a note and belongs to it. */
interface Attachments {
  chordSymbol: string | null
  chordSymbolSourceRange: SourceRange | null
  decorations: string[]
  decorationSourceRanges: SourceRange[]
  annotations: string[]
  annotationSourceRanges: SourceRange[]
}

const noAttachments = (): Attachments => ({
  chordSymbol: null,
  chordSymbolSourceRange: null,
  decorations: [],
  decorationSourceRanges: [],
  annotations: [],
  annotationSourceRanges: [],
})

/**
 * A `"…"` span is an annotation when it opens with a placement char, otherwise it is a
 * chord symbol. `"^above"`, `"_below"`, `"<left"`, `">right"`, `"@x,y text"` are
 * annotations; `"Am7"` is a chord symbol.
 */
/**
 * **AN EMPTY `""` IS A CHORD, AND `includes('')` IS TRUE.**
 *
 * abcjs decides by POSITION — `isAnnotation = pos === "left" || "right" || "below" ||
 * "above" || !!rel_position` (`creation/add-chord.js:9`) — and an empty chord names no
 * position, so it is a chord symbol like any other: centred, `data-name="chord"`.
 *
 * Ours read the first character, and `''` is a substring of EVERY string, so
 * `'^_<>@'.includes(text[0] ?? '')` answered TRUE for the empty one. `""_G-_G` in
 * `visual-transpose-output-03` drew an empty `<text>` anchored `start` and named
 * `annotation` where abcjs writes one anchored `middle` and named `chord` — an element
 * with no ink at all, which only a byte comparison could see.
 */
const isAnnotation = (text: string): boolean =>
  text.length > 0 && '^_<>@'.includes(text[0] as string)

/**
 * Every `!name!` decoration abcjs accepts, as data.
 *
 * Strict drops anything not here, because abcjs does: an unrecognised name yields no
 * decoration and a warning. Reproducing that closes the `S1-decorations` strict-fidelity
 * gap, and closes it as a RULE rather than a patch for one name.
 *
 * FIVE lists, not one — `abc_parse_settings.js`. Taking only `legalAccents` (the obvious
 * one, and the one that omits `staccato`) dropped every dynamic and hairpin in the corpus
 * and cost five fixtures on the content gate:
 *
 *   legalAccents (66)             the ornaments, fingerings, repeats, `style=`
 *   volumeDecorations (11)        p, pp, f, ff, mf, mp, ppp, pppp, fff, ffff, sfz
 *   dynamicDecorations (8)        crescendo(/) diminuendo(/) glissando(/) ~( ~)
 *   accentPseudonyms (7)          aliases: < > tr plus emphasis ^ marcato
 *   accentDynamicPseudonyms (4)   <( <) >( >)
 *
 * Only the KEYS of the pseudonym tables matter here. abcjs rewrites them to canonical
 * names on the way out; we keep the source spelling, which the content gate allows for
 * because it compares decoration COUNT rather than vocabulary.
 *
 * `staccato` is the point of interest and is deliberately absent from all five. abcjs
 * simply forgot it, while its `.` shorthand hard-codes the name
 * (`abc_parse_music.js:785`). So `!staccato!F` silently loses its dot and `.F` keeps it —
 * abcjs's own bug, and strict's job is to have it too. That asymmetry is exactly why the
 * shorthand path is NOT filtered against this set.
 *
 * Non-strict modes accept any name, which is the ABC 2.1 reading: an unknown decoration
 * is one the renderer has no glyph for, not a parse error.
 */
const ABCJS_KNOWN_DECORATIONS: ReadonlySet<string> = new Set([
  // legalAccents
  'trill',
  'trillh',
  'lowermordent',
  'uppermordent',
  'mordent',
  'pralltriller',
  'accent',
  'fermata',
  'invertedfermata',
  'tenuto',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '+',
  'wedge',
  'open',
  'thumb',
  'snap',
  'turn',
  'roll',
  'breath',
  'shortphrase',
  'mediumphrase',
  'longphrase',
  'segno',
  'coda',
  'D.S.',
  'D.C.',
  'fine',
  'beambr1',
  'beambr2',
  'slide',
  'marcato',
  'upbow',
  'downbow',
  '/',
  '//',
  '///',
  '////',
  'trem1',
  'trem2',
  'trem3',
  'trem4',
  'turnx',
  'invertedturn',
  'invertedturnx',
  'trill(',
  'trill)',
  'arpeggio',
  'xstem',
  'mark',
  'umarcato',
  'style=normal',
  'style=harmonic',
  'style=rhythm',
  'style=x',
  'style=triangle',
  'D.C.alcoda',
  'D.C.alfine',
  'D.S.alcoda',
  'D.S.alfine',
  'editorial',
  'courtesy',
  // volumeDecorations
  'p',
  'pp',
  'f',
  'ff',
  'mf',
  'mp',
  'ppp',
  'pppp',
  'fff',
  'ffff',
  'sfz',
  // dynamicDecorations
  'crescendo(',
  'crescendo)',
  'diminuendo(',
  'diminuendo)',
  'glissando(',
  'glissando)',
  '~(',
  '~)',
  // accentPseudonyms + accentDynamicPseudonyms — keys only
  '<',
  '>',
  'tr',
  'plus',
  'emphasis',
  '^',
  'marcato',
  '<(',
  '<)',
  '>(',
  '>)',
])

/**
 * abcjs strips a leading `^` or `_` before looking a decoration up — they force the mark
 * above or below the staff and are not part of its name. Only when something follows,
 * so bare `^` still resolves through `accentPseudonyms`.
 */
const decorationLookupName = (name: string): string =>
  name.length > 1 && (name[0] === '^' || name[0] === '_') ? name.slice(1) : name

/** Decoration shorthands. Safe to treat as decorations: none of these are note letters. */
const DECORATION_SHORTHAND: Record<string, string> = {
  '.': 'staccato',
  '~': 'roll',
  H: 'fermata',
  J: 'slide',
  L: 'accent',
  M: 'lowermordent',
  O: 'coda',
  P: 'uppermordent',
  R: 'roll',
  S: 'segno',
  T: 'trill',
  // Lowercase `t` is a SEPARATE shorthand in abcjs, not a case-insensitive `T`:
  // `abc_parse_music.js:838` gives it `trillh`, the trill with a diacritical mark.
  t: 'trillh',
  u: 'upbow',
  v: 'downbow',
}

/**
 * Default q for `(p` — p notes in the time of q (ABC 2.1 §4.13). The odd sizes depend on
 * whether the meter beats in threes, so `(5` is 5-in-3 in 6/8 but 5-in-2 in 4/4.
 */
function defaultTupletQ(p: number, compound: boolean): number {
  switch (p) {
    case 2:
      return 3
    case 3:
      return 2
    case 4:
      return 3
    case 6:
      return 2
    case 8:
      return 3
    default:
      return compound ? 3 : 2
  }
}

/**
 * `{gfe}` grace pitches, or `{/g}` for an acciaccatura. Parsed from the raw inner text
 * rather than tokens — a grace group is a self-contained span with its own accidentals
 * and octave marks, and never carries durations.
 */
/**
 * `2`, `/`, `/2`, `3/2` — the same length grammar every note uses, and the same defaults:
 * a bare `/` is `/2`, a bare number is a multiplier, `1` when nothing is written.
 */
function graceLength(text: string): Rational {
  if (text === '') return rational(1)
  const m = /^(\d*)(?:(\/+)(\d*))?$/.exec(text)
  if (!m) return rational(1)
  const numerator = m[1] === '' || m[1] === undefined ? 1 : Number.parseInt(m[1], 10)
  if (m[2] === undefined) return rational(numerator)
  // `//` halves twice, as it does on a note.
  const denominator =
    m[3] === '' || m[3] === undefined ? 2 ** m[2].length : Number.parseInt(m[3], 10)
  return denominator === 0 ? rational(numerator) : rational(numerator, denominator)
}

function parseGracePitches(raw: string): { pitches: GracePitch[]; slash: boolean } {
  let text = raw
  let slash = false
  if (text.startsWith('/')) {
    slash = true
    text = text.slice(1)
  }
  const pitches: GracePitch[] = []
  let i = 0
  while (i < text.length) {
    let accidental: Accidental | null = null
    while (i < text.length && '^_='.includes(text[i] as string)) {
      accidental = combineAccidental(accidental, text[i] as string)
      i++
    }
    const letter = text[i]
    if (!letter || !/[a-gA-G]/.test(letter)) {
      i++
      continue
    }
    let octave = letter >= 'a' && letter <= 'g' ? 5 : 4
    i++
    while (i < text.length && (text[i] === "'" || text[i] === ',')) {
      octave += text[i] === "'" ? 1 : -1
      i++
    }
    // A GRACE'S LENGTH IS NOT DECORATIVE — it was skipped here as "lengths are ignored",
    // and it is what abcjs divides the half-note by. `{B2c/d/}` is 2, 1/2 and 1/2, and the
    // B gets four times what each of the others does; ignoring the lengths split the half
    // evenly and made it 0.041666 against abcjs's 0.083333. Only the RATIO survives, since
    // the multiplier normalises over their sum, so the unit note length never enters.
    const lengthStart = i
    while (i < text.length && /[0-9/]/.test(text[i] as string)) i++
    pitches.push({
      step: letter.toLowerCase() as DiatonicStep,
      octave,
      accidental,
      length: graceLength(text.slice(lengthStart, i)),
    })
  }
  return { pitches, slash }
}

/**
 * `Times-Roman 12`, `Times-Bold 16`, `Helvetica-BoldOblique 10` — a PostScript font name
 * and a point size, which is how `%%vocalfont` and its siblings are written.
 *
 * The name carries weight and style as suffixes after the family: `-Bold`, `-Italic`,
 * `-Oblique`, and combinations. Matched case-insensitively on the whole name rather than
 * split on `-`, because families themselves contain hyphens (`Times-Roman` is one face,
 * not a Times in Roman weight) and a split would read the family as a style.
 *
 * A missing size is not an error — `%%vocalfont Times-Bold` is legal and means "that
 * face, current size". It comes back as null and the caller keeps the size it had.
 */
/**
 * A chord symbol's TYPOGRAPHY — abcjs's six substitutions (`abc_parse_music.js:652-659`).
 *
 * `Bb` becomes `B♭` and `C#` becomes `C♯`, and a diminished/half-diminished/major mark
 * after the root becomes its own sign. It is not decoration: `♯` measures 16px in the
 * gchordfont where `#` measures 8.91, so `visual-transpose-output-01` — twenty-five chord
 * symbols, nearly all of them accidental-bearing — was 106.8px of horizontal spread.
 *
 * Only a DEFAULT-position chord: an annotation (`"^text"`, `"_text"`, …) is prose and is
 * left alone, which is abcjs's own branch. `%%freegchord` turns it all off; the directive
 * is not parsed here, so nothing reaches that switch yet.
 */
function prettifyChord(chord: string): string {
  return chord
    .replace(/([ABCDEFG0-9])b/g, '$1♭')
    .replace(/([ABCDEFG0-9])#/g, '$1♯')
    .replace(/^([ABCDEFG])([♯♭]?)o([^A-Za-z])/g, '$1$2°$3')
    .replace(/^([ABCDEFG])([♯♭]?)o$/g, '$1$2°')
    .replace(/^([ABCDEFG])([♯♭]?)0([^A-Za-z])/g, '$1$2ø$3')
    .replace(/^([ABCDEFG])([♯♭]?)\^([^A-Za-z])/g, '$1$2∆$3')
}

/**
 * `12`, `0.4cm`, `2in`, `30pt`, `30px` — a length in POINTS.
 *
 * `abc_tokenizer.js:776-781`: `pt` and `px` pass through, `cm` is `/2.54*72`, `in` is
 * `*72`, and a bare number is already points. Anything else is not a measurement.
 */
function parseMeasurement(token: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)(pt|px|cm|in)?$/.exec(token.trim())
  if (!m?.[1]) return null
  const value = Number.parseFloat(m[1])
  if (m[2] === 'cm') return (value / 2.54) * 72
  if (m[2] === 'in') return value * 72
  return value
}

/** `abc_parse_directive.js:1039-1042` — all three route to `measurefont`. */
const FONT_ALIASES: Readonly<Record<string, string>> = {
  barlabelfont: 'measurefont',
  barnumberfont: 'measurefont',
  barnumfont: 'measurefont',
}

/**
 * **A POSTSCRIPT FONT NAME CARRIES ITS WEIGHT AND STYLE, AND abcjs TRANSLATES IT.**
 *
 * `fontTranslation` maps each PostScript name to a WEB family plus a weight and a style,
 * so `%%voicefont Helvetica-Bold 10.0` draws `font-family="Helvetica" font-weight="bold"`
 * rather than naming a family no browser has (`parse/abc_parse_directive.js:62-160`).
 * Ours read the suffix for the weight — correctly — and then wrote the whole PostScript
 * name into `font-family`, which `visual-selection-01`'s golden denies in one attribute.
 *
 * Transcribed from abcjs's own switch rather than derived by splitting on `-`: a family
 * can contain a hyphen, and the table's faces are not all one word (`Bookman,serif`,
 * `"Helvetica Narrow",Helvetica`).
 */
const POSTSCRIPT_FONTS: Readonly<
  Record<string, { readonly face: string; readonly bold: boolean; readonly italic: boolean }>
> = {
  'Arial-Italic': { face: 'Arial', bold: false, italic: true },
  'Arial-Bold': { face: 'Arial', bold: true, italic: false },
  'Bookman-Demi': { face: 'Bookman,serif', bold: true, italic: false },
  'Bookman-DemiItalic': { face: 'Bookman,serif', bold: true, italic: true },
  'Bookman-Light': { face: 'Bookman,serif', bold: false, italic: false },
  'Bookman-LightItalic': { face: 'Bookman,serif', bold: false, italic: true },
  'Courier': { face: '"Courier New"', bold: false, italic: false },
  'Courier-Oblique': { face: '"Courier New"', bold: false, italic: true },
  'Courier-Bold': { face: '"Courier New"', bold: true, italic: false },
  'Courier-BoldOblique': { face: '"Courier New"', bold: true, italic: true },
  'AvantGarde-Book': { face: 'AvantGarde,Arial', bold: false, italic: false },
  'AvantGarde-BookOblique': { face: 'AvantGarde,Arial', bold: false, italic: true },
  'AvantGarde-Demi': { face: 'AvantGarde,Arial', bold: true, italic: false },
  'Avant-Garde-Demi': { face: 'AvantGarde,Arial', bold: true, italic: false },
  'AvantGarde-DemiOblique': { face: 'AvantGarde,Arial', bold: true, italic: true },
  'Helvetica-Oblique': { face: 'Helvetica', bold: false, italic: true },
  'Helvetica-Bold': { face: 'Helvetica', bold: true, italic: false },
  'Helvetica-BoldOblique': { face: 'Helvetica', bold: true, italic: true },
  'Helvetica-Narrow': { face: '"Helvetica Narrow",Helvetica', bold: false, italic: false },
  'Helvetica-Narrow-Oblique': { face: '"Helvetica Narrow",Helvetica', bold: false, italic: true },
  'Helvetica-Narrow-Bold': { face: '"Helvetica Narrow",Helvetica', bold: true, italic: false },
  'Helvetica-Narrow-BoldOblique': { face: '"Helvetica Narrow",Helvetica', bold: true, italic: true },
  'Palatino-Roman': { face: 'Palatino', bold: false, italic: false },
  'Palatino-Italic': { face: 'Palatino', bold: false, italic: true },
  'Palatino-Bold': { face: 'Palatino', bold: true, italic: false },
  'Palatino-BoldItalic': { face: 'Palatino', bold: true, italic: true },
  'NewCenturySchlbk-Roman': { face: '"New Century",serif', bold: false, italic: false },
  'NewCenturySchlbk-Italic': { face: '"New Century",serif', bold: false, italic: true },
  'NewCenturySchlbk-Bold': { face: '"New Century",serif', bold: true, italic: false },
  'NewCenturySchlbk-BoldItalic': { face: '"New Century",serif', bold: true, italic: true },
  'Times': { face: '"Times New Roman"', bold: false, italic: false },
  'Times-Roman': { face: '"Times New Roman"', bold: false, italic: false },
  'Times-Narrow': { face: '"Times New Roman"', bold: false, italic: false },
  'Times-Courier': { face: '"Times New Roman"', bold: false, italic: false },
  'Times-New-Roman': { face: '"Times New Roman"', bold: false, italic: false },
  'Times-Italic': { face: '"Times New Roman"', bold: false, italic: true },
  'Times-Italics': { face: '"Times New Roman"', bold: false, italic: true },
  'Times-Bold': { face: '"Times New Roman"', bold: true, italic: false },
  'Times-BoldItalic': { face: '"Times New Roman"', bold: true, italic: true },
  'ZapfChancery-MediumItalic': { face: '"Zapf Chancery",cursive,serif', bold: false, italic: false },
}

function parseFontSpec(spec: string, defaultPt: number = DEFAULT_VOCALFONT_PT): LyricFont {
  // `box` may follow the size — `%%gchordfont Arial 10 box`. abcjs accepts it on eleven of
  // the font types (`fontTypeCanHaveBox`, `abc_parse_directive.js:60`) and it draws a frame
  // rather than changing the face.
  //
  // A BARE `box` IS A WHOLE DIRECTIVE — `%%partsfont box` names no face and no size, and
  // abcjs keeps both from the current setting (`getFontParameter`'s two `if (… === '')`
  // tails). It still costs 8px of lane, which is what that fixture is for.
  const boxed = /(^|\s)box\s*$/i.test(spec.trim())
  const trimmed = spec.trim().replace(/(^|\s)box\s*$/i, '')
  // THE MODIFIERS COME AFTER THE SIZE, NOT BEFORE IT — abcjs's format is
  // `<face> <utf8> <size> <modifiers> <box>` and `getFontParameter` leaves the `face`
  // state the moment it meets a number, reading `bold` / `italic` / `underline` as words
  // from there on (`abc_parse_directive.js:190-230`). Anchoring the size to the END of the
  // string instead meant `%%setfont-1 cursive 40 bold` found no size at all and silently
  // took the caller's default — which for a `%%setfont` is nothing, so a 40px phrase
  // measured as 2 and its row came out 12.09px short.
  const sizeMatch = /(^|\s)(\d+(?:\.\d+)?)(?=(?:\s+(?:bold|italic|oblique|underline))*\s*$)/i.exec(
    trimmed,
  )
  const face = (sizeMatch ? trimmed.slice(0, sizeMatch.index) : trimmed).trim()
  const modifiers = sizeMatch ? trimmed.slice(sizeMatch.index + sizeMatch[0].length) : ''
  // …AND THE FACE ITSELF IS TRANSLATED, when it is a PostScript name — see
  // `POSTSCRIPT_FONTS`. Anything not in abcjs's table passes through unchanged, which is
  // abcjs's own `default: return { face: fontFace, … }`.
  const translated = POSTSCRIPT_FONTS[face]
  return {
    face: translated?.face ?? face,
    size: sizeMatch?.[2] ? Number.parseFloat(sizeMatch[2]) : defaultPt,
    // A face may still SAY bold — `%%vocalfont Times-Bold 16` names one face — so both
    // roads are read. abcjs only honours the word, but the face spelling is what the
    // corpus's existing fixtures are gated on, and this widens rather than replaces it.
    bold: translated?.bold === true || /bold/i.test(face) || /\bbold\b/i.test(modifiers),
    italic:
      translated?.italic === true ||
      /italic|oblique/i.test(face) ||
      /\b(?:italic|oblique)\b/i.test(modifiers),
    box: boxed,
  }
}

/**
 * One syllable position in a `w:` line.
 *
 * `text` — sung on this note.
 * `skip` — `*`, nothing sung here.
 * `melisma` — `_`, the previous syllable is held through this note.
 *
 * `skip` and `melisma` both occupy a note, which is why alignment is the same either way;
 * they differ in what a renderer draws.
 */
interface Syllable {
  kind: 'text' | 'skip' | 'melisma'
  text: string | null
  range: SourceRange | null
  /**
   * The `%%vocalfont` in force WHEN THIS LINE WAS PARSED, or null for the default.
   *
   * Per syllable, and captured here rather than read later, because that is the only
   * place the answer is still available. A lyric line is parsed after the music line it
   * sits under, so the notes are already built and cannot carry it; and one lyric LINE
   * can span several fonts, since a `\` continuation may have a `%%vocalfont` between
   * its segments. Gonzato §4.1.4 is exactly that case — one line, three fonts.
   */
  font: LyricFont | null
}

/**
 * Split a `w:` line into per-note syllables.
 *
 * Whitespace separates notes. `|` is a barline-alignment hint and occupies no note. `*`
 * and `_` (melisma) occupy a note but carry no text. Within a token, `-` splits a word
 * across notes and each non-final piece keeps its hyphen. `~` is a hard space.
 *
 * A SPACED hyphen (`A - ve`) becomes its own syllable occupying a note, rather than
 * binding to the preceding one as `A- ve` does. That matches v2.
 *
 * ARBITRATED, 2026-07-19, and core diverges knowingly. The claim that "the corpus cannot
 * arbitrate this one because abcjs's .parse.json carries no lyric fields" was simply
 * wrong — the goldens carry lyrics on every fixture, and abcjs reads `A - ve,` as
 * syllable "A" with an attached hyphen, then a SKIPPED note, then "ve,". Core keeps v2's
 * reading. `ave-verum-corpus` is the fixture; the difference is recorded in the lyric
 * gate's divergence list rather than silently absorbed.
 */
function parseLyricSyllables(
  text: string,
  base: number,
  mode: CompatibilityMode = defaultMode,
  /** The `%%vocalfont` in force as this line is parsed; stamped on every syllable. */
  font: LyricFont | null = null,
): Syllable[] {
  const out: Syllable[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && text[i] === ' ') i++
    if (i >= text.length) break
    const tokenStart = i
    while (i < text.length && text[i] !== ' ') i++
    const token = text.slice(tokenStart, i)
    if (token === '|') continue // alignment hint, not a note

    // Scan the token: `-` ends a syllable and keeps its hyphen; `_` ends one and emits a
    // hold; `*` ends one and skips a note. All three are SEPARATORS, so an attached one
    // behaves like a standalone one — the spec writes `A-_ma-zing_`, which is `A-` ·
    // hold · `ma-` · `zing` · hold.
    //
    // `*` used to be handled only as a whole token, so `Xiao* yan*` — the form every
    // real tune uses — kept the star inside the syllable AND emitted no skip, which put
    // every later syllable on the wrong note. Invisible while lyrics went unrendered and
    // ungated; abcjs's goldens have said `"Xiao", "", "yan", ""` all along.
    let buffer = ''
    let bufferStart = tokenStart
    const flush = (end: number, hyphen: boolean): void => {
      if (buffer === '') return
      const raw = buffer.split('~').join(' ') // `~` is a hard space
      out.push({
        kind: 'text',
        text: decodeTextString(raw) + (hyphen ? '-' : ''),
        range: sourceRange(base + bufferStart, base + end),
        font,
      })
      buffer = ''
    }
    // MODE-GATED. A STANDALONE `-` (`A - ve`): abcjs binds the hyphen to the syllable
    // before it and consumes a note; abcMusicKit2 makes it a syllable in its own right.
    // Arbitrated against the goldens 2026-07-19 — `ave-verum-corpus` is the fixture.
    if (isStrict(mode) && token === '-') {
      const previous = out[out.length - 1]
      if (previous?.kind === 'text' && previous.text !== null && !previous.text.endsWith('-')) {
        out[out.length - 1] = { ...previous, text: `${previous.text}-` }
      }
      out.push({ kind: 'skip', text: null, range: null, font: null })
      continue
    }

    for (let j = tokenStart; j < i; j++) {
      const ch = text[j] as string
      if (ch === '-') {
        flush(j, true)
        bufferStart = j + 1
      } else if (ch === '_') {
        flush(j, false)
        out.push({ kind: 'melisma', text: null, range: null, font: null })
        bufferStart = j + 1
      } else if (ch === '*') {
        flush(j, false)
        out.push({ kind: 'skip', text: null, range: null, font: null })
        bufferStart = j + 1
      } else if (ch === '|') {
        // A bar hint aligns the line to the next barline and occupies NO note, so unlike
        // `*` it emits nothing. Attached as often as standalone — `a |rin,` is real
        // corpus text, and leaving it in the buffer put a pipe inside the syllable.
        // ponytail: dropped rather than honoured. Honouring it means re-aligning the
        // remaining syllables to the next barline, which needs the barline positions the
        // lyric pass does not have.
        flush(j, false)
        bufferStart = j + 1
      } else {
        if (buffer === '') bufferStart = j
        buffer += ch
      }
    }
    flush(i, false)
  }
  return out
}

/** `>>>>` is already 31:1; past this the factors overflow and mean nothing musically. */
const MAX_BROKEN_RHYTHM_ARROWS = 8

const NOTE_STYLES: readonly NoteStyle[] = ['normal', 'x', 'harmonic', 'triangle', 'rhythm']

/**
 * `!style=harmonic!` sets the notehead shape; it is NOT a decoration and abcjs does not
 * record it as one. Pulls any `style=` entries out of the pending decoration list and
 * returns the resulting style, mirroring v2's resolveStyle.
 */
function resolveStyle(attachments: Attachments): NoteStyle | null {
  // NULL FOR ABSENT, NOT `'normal'`. An explicit `!style=normal!` is how a rhythm-notation
  // voice writes a note that keeps its real head — `U:n=!style=normal!` then `nG` — and
  // abcjs honours it per PITCH: "There is a style for the whole group of pitches, but there
  // could also be an override for a particular pitch", `c = chartable[elem.pitches[p].style]
  // [-durlog]` (`abstract-engraver.js:677-680`).
  //
  // Returning `'normal'` for both cases made the override indistinguishable from its
  // absence, so the caller's `inline === 'normal' ? voice().noteStyle : inline` handed the
  // voice's `rhythm` straight back and `nG` drew a slash. FOURTH time on this branch that a
  // representation, not a rule, was the defect.
  let style: NoteStyle | null = null
  const keep: string[] = []
  const keepRanges: SourceRange[] = []
  attachments.decorations.forEach((decoration, index) => {
    const match = /^style=(.+)$/.exec(decoration)
    const named = match?.[1] as NoteStyle | undefined
    if (named && NOTE_STYLES.includes(named)) {
      style = named
      return
    }
    keep.push(decoration)
    const range = attachments.decorationSourceRanges[index]
    if (range) keepRanges.push(range)
  })
  attachments.decorations = keep
  attachments.decorationSourceRanges = keepRanges
  return style
}

const REST_KINDS: Record<string, RestKind> = {
  z: 'normal',
  x: 'invisible',
  Z: 'multiMeasure',
  X: 'invisibleMultiMeasure',
  y: 'spacer',
}

/** `^^` is a double sharp, `__` a double flat, any `=` a natural. */
function combineAccidental(current: Accidental | null, raw: string): Accidental {
  if (raw === '=') return Accidental.natural
  const delta = raw === '^' ? 1 : -1
  const combined = (current ?? 0) + delta
  return Math.max(-2, Math.min(2, combined)) as Accidental
}

/**
 * Freeze the whole tree. `readonly` is erased at runtime, so this is the only thing that
 * makes the immutable-AST guarantee true for a JavaScript consumer.
 *
 * A `seen` set rather than an `isFrozen` short-circuit: the latter skipped the RECURSION
 * too, so anything already frozen kept mutable children. Arrays iterate by value —
 * getOwnPropertyNames allocates an index string per element, which on a large score is
 * hundreds of thousands of throwaway strings.
 *
 * Note this makes a consumer's `score.voices.push(x)` throw a TypeError under ESM's strict
 * mode. That is intended, and is the one way parse()'s output can raise.
 */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen)
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key], seen)
    }
  }
  return value
}

/**
 * Parse ABC source into one `Score` per tune.
 *
 * Never throws. Following abcMusicKit2, recovery is lenient and problems surface as
 * diagnostics rather than failure — so `ok: false` is reserved for `error`-severity
 * diagnostics, which nothing currently emits. The result is deeply frozen.
 */
export interface ParseOptions {
  /**
   * Which dialect to read. Defaults to `abcjs-strict`, which reproduces abcjs including
   * its bugs — see `CompatibilityMode`.
   */
  readonly mode?: CompatibilityMode
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const mode = options.mode ?? defaultMode
  // WHICH ESCAPE TABLE THE TEXT DECODER READS — abcjs's fixed map in strict, ABC 2.1's
  // generic combining marks everywhere else. Set here rather than threaded through the
  // fourteen `decodeTextString` call sites, which is the shape `JAZZ_CHORDS` and
  // `PERC_MAP` already take in the renderer. See `setAbcjsEscapes`.
  setAbcjsEscapes(isStrict(mode))
  return deepFreeze(new Parser(source, mode).parse())
}

/**
 * `T:Title $1bold$0 reg` → the phrases it is written in — abcjs's `parseFontChangeLine`
 * (`abc_parse_directive.js:727-748`), ported branch for branch.
 *
 * Returns the STRING unchanged when there is nothing to split, which is abcjs's own return
 * type and not a convenience: a plain row and a phrase row advance the top-text block by
 * DIFFERENT rules, so the distinction has to survive as far as the renderer. See
 * `advanceRich` in `layout.ts`.
 *
 * The branches, all of them load-bearing:
 *  - `$$` is a literal `$`, swapped out to `\x03` before the split and back after.
 *  - only the FIRST character after `$` is the font number — `$11924` is font 1 then the
 *    text `1924`, not font 11.
 *  - `$0` returns to the field's own font, so its phrase carries no font at all.
 *  - a `$N` with no `%%setfont-N` is NOT an error and NOT a font: abcjs appends
 *    `'$' + part` to the PREVIOUS phrase, so the marker stays visible as typed.
 */
/**
 * **A TRAILING ARTICLE IS MOVED TO THE FRONT** — `T:Transformed, A` is titled
 * `A Transformed`. abcjs's `theReverser` (`abc_tokenizer.js:679-720`), applied to every
 * `T:` before `setTitle` decides whether it is the title or a subtitle.
 *
 * Eleven patterns tried IN ORDER, first match wins, each anchored at the end. A leading
 * `N.` track number is lifted off first and put back in front of the result, so
 * `1. Chanter, Le` becomes `1. Le Chanter`.
 */
const ARTICLE_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/,\s*The$/, 'The '],
  [/,\s*the$/, 'the '],
  [/,\s*A$/, 'A '],
  [/,\s*a$/, 'a '],
  [/,\s*An$/, 'An '],
  [/,\s*an$/, 'an '],
  [/,\s*Da$/, 'Da '],
  [/,\s*La$/, 'La '],
  [/,\s*Le$/, 'Le '],
  [/,\s*Les$/, 'Les '],
  [/,\s*Ye$/, 'Ye '],
]

function theReverser(str: string): string {
  for (const [pattern, replace] of ARTICLE_PATTERNS) {
    const match = pattern.exec(str)
    if (match === null) continue
    const number = /^(\d+)\./.exec(str)?.[1]
    const body = number === undefined ? str : str.replace(`${number}.`, '').trim()
    const result = replace + body.substring(0, body.length - match[0].length)
    return number === undefined ? result : `${number}. ${result}`
  }
  return str
}

function parseFontChangeLine(text: string, setfont: readonly (LyricFont | undefined)[]): RichText {
  // The sentinel is abcjs's own — `\x03` is what it swaps `$$` to so the split cannot see
  // it, and using any other character would change which strings round-trip.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: abcjs's `$$` sentinel, ported
  const swapped = text.replace(/\$\$/g, '\x03')
  const parts = swapped.split('$')
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the same sentinel, restored
  const restore = (v: string): string => v.replace(/\x03/g, '$')
  if (parts.length <= 1 || setfont.length === 0) return restore(swapped)
  const phrases: { font: LyricFont | null; text: string }[] = []
  if (parts[0] !== '') phrases.push({ font: null, text: restore(parts[0] as string) })
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] as string
    if (part[0] === '0') {
      phrases.push({ font: null, text: restore(part.substring(1)) })
      continue
    }
    const which = Number.parseInt(part[0] ?? '', 10)
    const font = Number.isNaN(which) ? undefined : setfont[which]
    if (font !== undefined) {
      phrases.push({ font, text: restore(part.substring(1)) })
    } else {
      // No such `%%setfont`: the marker is literal, glued onto whatever came before.
      const last = phrases[phrases.length - 1]
      if (last === undefined) phrases.push({ font: null, text: `$${restore(part)}` })
      else phrases[phrases.length - 1] = { ...last, text: `${last.text}$${restore(part)}` }
    }
  }
  return phrases
}

/**
 * The two escapes a QUOTED chord or annotation understands — `abc_tokenizer.js:784-788`.
 *
 * Deliberately not the accent machinery: `translateString` maps `\`a` to `à` and leaves
 * anything it does not know with its backslash intact, and `\n` is not one of its cases.
 * A chord gets this instead, and only a chord.
 */
const substInChord = (str: string): string => str.replace(/\\n/g, '\n').replace(/\\"/g, '"')

/**
 * The eleven font types abcjs lets `box` apply to — `fontTypeCanHaveBox`
 * (`abc_parse_directive.js:60`). Anywhere else the word is an extra parameter it warns
 * about and drops.
 */
const BOXABLE_FONTS: ReadonlySet<string> = new Set([
  'gchordfont',
  'measurefont',
  'partsfont',
  'annotationfont',
  'composerfont',
  'historyfont',
  'infofont',
  'subtitlefont',
  'textfont',
  'titlefont',
  'voicefont',
])
const boxable = (type: string): boolean => BOXABLE_FONTS.has(type)
