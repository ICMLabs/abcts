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
 * body `P:` label), symbol lines (`s:`), and most `%%` directives.
 * Each is a separate step driven by the corpus fixture that needs it; the lexer
 * already tokenizes all of them, so the work is parser-side only.
 */

import {
  type OverlayElement,
  type OverlayLine,
  resolveOverlays,
} from '../core/overlays.js'
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
  ratToNumber,
  ratLt,
  ratMul,
  type Score,
  type RunningHead,
  type ScoreMetadata,
  type SourceRange,
  type StaffConnector,
  type StaffGroup,
  sourceRange,
  stepIndex,
  type Tempo,
  type Voice,
  type PositionKind,
  type ElementPosition,
} from '../core/model.js'
import { Lexer, type Token } from './lexer.js'
import { decodeTextString, setAbcjsEscapes } from './text.js'
import { visualTranspose } from './visual-transpose.js'

/** The host's `visualTranspose` param for this parse — see `ParseOptions`. */
let HOST_TRANSPOSE = 0

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
  // The `K:` FORM is read too, in the `case 'K'` arm rather than here: abcjs's modifier
  // switch is shared between the two fields (`abc_parse_key_voice.js:411-418`).
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
  /**
   * MATCHED ON THE FIRST THREE CHARACTERS, exactly as `getMode` does, and never as a
   * prefix of the whole word: `middle=B` reads `mid` and `merge` reads `mer`, neither of
   * which is a mode.
   *
   * ⚠️ **AND `m` IS MINOR WHENEVER THE NEXT CHARACTER IS ` `, `^`, `_` OR `=`.** That is
   * `getMode`'s own truncation — `firstThree = firstThree[0]`, with abcjs's comment "this
   * will handle the case of 'm'" (`abc_tokenizer.js`) — so `K:C m=B` is C MINOR, not a
   * middle-line override. This read `m` as a mode only when it stood ALONE, which put the
   * tune in C major and drew neither the three flats nor the natural.
   */
  const modeOf = (word: string): Mode | null => {
    const three = word.slice(0, 3).toLowerCase()
    const w = three.length > 1 && ' ^_='.includes(three[1] ?? '') ? (three[0] ?? '') : three
    return MODES.find(([prefix]) => prefix === w)?.[1] ?? null
  }
  const rest = spec.slice(i)
  const words = content.trim().split(/\s+/)
  const next = words[1] ?? ''
  const inlineMode = modeOf(rest)
  const nextMode = rest === '' ? modeOf(next) : null
  const mode = inlineMode ?? nextMode ?? 'major'
  /**
   * **AND `getMode` CONSUMES ONLY THE ALPHABETIC RUN IT MATCHED** — `len: skipAlpha(str, i)`
   * — so whatever follows it on the SAME token is still scanned for accidentals.
   * `K:C m=B` is C minor with a natural B, both drawn; abcjs's own probe reads two flats
   * and one natural. With the mode slot already filled (`K:Cmaj m=B`) the token never
   * reaches `getMode` at all and the modifier switch takes it as the middle override, which
   * is why the skip list below has to see the whole word in that case and not in this one.
   */
  const scanText =
    nextMode === null
      ? content
      : words.map((w, k) => (k === 1 ? w.replace(/^[A-Za-z]+/, '') : w)).join(' ')
  const extra = parseKeyAccidentals(scanText)
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
 * ⚠️ **AND A MODIFIER'S OWN `=` IS ONE OF THE THREE SIGNS.** The note here used to say a
 * scan over the whole value "cannot collide" with `clef=` and friends because none of them
 * carries a `^` or `_` before a letter — true, and beside the point: a BARE `=` is an
 * accidental too, so `K:C clef=C` read a natural on C, drew a key signature abcjs does not
 * and widened the staff by 15.4px. `clef=alto` escaped only because the `(?![A-Za-z=])`
 * guard saw the `l`.
 *
 * abcjs never scans the whole value: `getKeyAccidentals2` runs on what follows the key and
 * mode, and the MODIFIER LOOP takes over from the first keyword on
 * (`abc_parse_key_voice.js:380-520`). So the accidentals are a PREFIX, and the scan stops
 * at the first modifier word rather than skipping it — measured, because the two differ:
 * `K:C =f clef=alto` draws the natural and `K:C clef=alto =f` draws NOTHING, abcjs
 * warning "Unknown parameter: =" and dropping it.
 *
 * ⚠️ **AND NOT EVERY `x=y` IS A MODIFIER** — `K:C=c` really is a natural, measured — which
 * is why the stop tests the switch's own keywords and the bare clef names, and why the
 * KEY's own word is never one of them.
 */
/** `addFormattingOptions`'s own order for a note (`abc_parse.js:122-126`). */
const POSITION_KINDS: readonly PositionKind[] = [
  'vocalPosition',
  'dynamicPosition',
  'chordPosition',
  'ornamentPosition',
  'volumePosition',
]

/** `positionChoices` — `abc_parse_directive.js:751`. */
const POSITION_CHOICES: ReadonlySet<string> = new Set(['auto', 'above', 'below', 'hidden'])

/** The directive word each one answers to, in the switch's own order. */
const POSITION_DIRECTIVES: Readonly<Record<string, PositionKind>> = {
  vocal: 'vocalPosition',
  dynamic: 'dynamicPosition',
  gchord: 'chordPosition',
  ornament: 'ornamentPosition',
  volume: 'volumePosition',
}

const KEY_VOICE_MODIFIERS: ReadonlySet<string> = new Set([
  'clef', 'cl', 'middle', 'm', 'transpose', 'stafflines', 'staffscale', 'octave', 'style',
  'name', 'nm', 'subname', 'sname', 'snm', 'scale', 'score', 'space', 'spc', 'staves',
  'stave', 'stv', 'brace', 'brc', 'bracket', 'brk', 'volume', 'cue', 'gchords', 'gch',
  'stem', 'stems', 'merge',
])

function parseKeyAccidentals(content: string): KeyAccidental[] {
  const out: KeyAccidental[] = []
  const isModifier = (word: string): boolean =>
    KEY_VOICE_MODIFIERS.has((/^([A-Za-z]+)=/.exec(word)?.[1] ?? '').toLowerCase()) ||
    /^(?:treble|bass|alto|tenor|perc|none)/i.test(word)
  const words = content.trim().split(/\s+/)
  const stop = words.findIndex((w, i) => i > 0 && isModifier(w))
  const scanned = (stop < 0 ? words : words.slice(0, stop)).join(' ')
  for (const m of scanned.matchAll(/(\^\^|\^\/|\^|__|_\/|_|=)([A-Ga-g])(?![A-Za-z=])/g)) {
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

/**
 * **A `K:` TOKEN THE MODIFIER LOOP DOES NOT RECOGNISE IS A WARNING, AND IT CARRIES ITS OWN
 * COLUMN.** `default: warn("Unknown parameter: " + tokens[0].token, str, tokens[0].start)`
 * (`abc_parse_key_voice.js:518-519`) — `tokens[0].start`, an offset abcjs has in hand and
 * which a reader cannot recover from the token's TEXT. `K:C clef=alto =f` is TWO warnings
 * on two ADJACENT characters, and looking either one up with `indexOf` finds the `=` inside
 * `clef=` instead.
 *
 * So this walks abcjs's own consumption — the key head, the two deprecated words, the
 * accidentals and then the modifier switch — and reports what the switch's `default` arm
 * reaches. NOTHING HERE IS APPLIED: the key, the clef and the style are read by their own
 * functions above, and this is the DIAGNOSTIC alone.
 *
 * ponytail: the `Unsupported key signature` early return is not reproduced, so a
 * `K:Cbmin clef=x` would report a parameter abcjs never reaches. No corpus tune writes an
 * impossible key with a modifier after it; add the guard when one does.
 */
interface KeyToken {
  type: 'quote' | 'alpha' | 'number' | 'punct'
  token: string
  readonly start: number
}

/**
 * `tokenizer.tokenize(str, 0, str.length)` (`abc_tokenizer.js:445-503`), whole, with
 * `alphaUntilWhiteSpace` off — which is the call `parseKey` makes.
 *
 * ⚠️ **AND `i` IS DELIBERATELY STALE ACROSS ITERATIONS.** abcjs tests `line[i + 1]` for the
 * digit after a `.` or a `-` while `i` still holds the END of the PREVIOUS token, and that
 * is what makes `K:treble-8` one clef: at the `-`, `i` is the `treble` run's end, `line[i+1]`
 * is the `8`, and the number branch takes `-8` whole. Written the obvious way —
 * `line[start + 1]` — the `-` is punctuation and the clef loses its octave.
 */
const tokenizeKeyValue = (line: string): KeyToken[] => {
  const isLetter = (c: string | undefined): boolean =>
    c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
  const isNumber = (c: string | undefined): boolean =>
    c !== undefined && c >= '0' && c <= '9'
  // `getMeat` — the comment goes and both ends are trimmed (`abc_tokenizer.js:424-435`).
  const blank = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\x12'
  const comment = line.indexOf('%')
  let end = comment >= 0 ? comment : line.length
  let start = 0
  while (start < end && blank(line[start])) start += 1
  while (start < end && blank(line[end - 1])) end -= 1

  const tokens: KeyToken[] = []
  let i = Number.NaN
  while (start < end) {
    if (line[start] === '"') {
      i = start + 1
      while (i < end && line[i] !== '"') i += 1
      tokens.push({ type: 'quote', token: line.substring(start + 1, i), start: start + 1 })
      i += 1
    } else if (isLetter(line[start])) {
      i = start + 1
      while (i < end && isLetter(line[i])) i += 1
      tokens.push({ type: 'alpha', token: line.substring(start, i), start })
    } else if (
      (line[start] === '.' && isNumber(line[i + 1])) ||
      isNumber(line[start]) ||
      (line[start] === '-' && isNumber(line[i + 1]))
    ) {
      i = start + 1
      while (i < end && isNumber(line[i])) i += 1
      if (line[i] === '.' && isNumber(line[i + 1])) {
        i += 1
        while (i < end && isNumber(line[i])) i += 1
      }
      tokens.push({ type: 'number', token: line.substring(start, i), start })
    } else if (line[start] === ' ' || line[start] === '\t') {
      i = start + 1
    } else {
      tokens.push({ type: 'punct', token: line[start] ?? '', start })
      i = start + 1
    }
    start = i
  }
  return tokens
}

/**
 * `getMode`'s own `len > 0` (`abc_tokenizer.js:67-93`), for ONE TOKEN.
 *
 * Its truncation rule — "this will handle the case of 'm'" — tests the SECOND character for
 * a space, `^`, `_` or `=`, none of which can appear inside an alpha token, so on a token
 * stream the first three characters are the whole test. `parseKey` above needs the rule
 * itself because it reads WORDS.
 */
const isModeToken = (token: string): boolean =>
  ['mix', 'dor', 'phr', 'lyd', 'loc', 'aeo', 'maj', 'ion', 'min', 'm'].includes(
    token.slice(0, 3).toLowerCase(),
  )

/** `getKeyAccidentals2` (`abc_tokenizer.js:283-340`) — the CONSUMPTION alone. */
const eatKeyAccidentals = (tokens: KeyToken[]): void => {
  while (tokens.length > 0) {
    const sign = tokens[0]?.token
    if (sign === '^' || sign === '_') {
      tokens.shift()
      if (tokens.length === 0) return
      if (tokens[0]?.token === sign || tokens[0]?.token === '/') tokens.shift()
    } else if (sign === '=') tokens.shift()
    else return
    const note = tokens[0]
    if (note === undefined || !/^[A-Ga-g]/.test(note.token)) return
    if (note.token.length === 1) tokens.shift()
    else note.token = note.token.substring(1)
  }
}

/** `getPitchFromTokens` (`abc_tokenizer.js:266-281`) — the CONSUMPTION alone. */
const eatPitch = (tokens: KeyToken[]): void => {
  if (!/^[A-Ga-g]$/.test(tokens[0]?.token ?? '')) return
  tokens.shift()
  while (tokens.length > 0 && (tokens[0]?.token === ',' || tokens[0]?.token === "'"))
    tokens.shift()
}

/** The switch's own clef labels — and ⚠️ `C`, `F` and `G` are NOT among them, see below. */
const CLEF_TOKENS: ReadonlySet<string> = new Set([
  'treble', 'bass', 'alto', 'tenor', 'perc', 'none',
])
const STYLE_TOKENS: ReadonlySet<string> = new Set([
  'normal', 'harmonic', 'rhythm', 'x', 'triangle',
])

/** The tokens `parseKey`'s modifier switch reaches its `default` arm with, and where. */
function unknownKeyParameters(str: string): Array<{ token: string; column: number }> {
  const tokens = tokenizeKeyValue(str)
  const out: Array<{ token: string; column: number }> = []

  // The key itself (`abc_parse_key_voice.js:236-339`). `getKeyPitch`'s lowercase cases are
  // COMMENTED OUT, so only `A`..`G` is a key — see `parseKey` above.
  const first = tokens[0]
  if (first !== undefined) {
    if (first.token === 'HP' || first.token === 'Hp' || first.token === 'none') tokens.shift()
    else if (/^[A-G]/.test(first.token)) {
      // ⚠️ **THE TRUNCATION LEAVES `start` WHERE IT WAS** — abcjs's own
      // `tokens[0].token = tokens[0].token.substring(1)`, untouched `start` and all — so a
      // leftover that reaches the `default` arm reports the WHOLE token's column.
      if (first.token.length > 1) first.token = first.token.substring(1)
      else tokens.shift()
      // `getSharpFlat`, whose ONE exception is `bass` — a clef name that starts with a `b`.
      const acc = tokens[0]
      if (acc !== undefined && acc.token !== 'bass' && /^[#b]/.test(acc.token)) {
        if (acc.token.length > 1) acc.token = acc.token.substring(1)
        else tokens.shift()
      }
      if (isModeToken(tokens[0]?.token ?? '')) tokens.shift()
    }
  }
  // "There are two special cases of deprecated syntax. Ignore them if they occur."
  if (tokens[0]?.token === 'exp') tokens.shift()
  if (tokens[0]?.token === 'oct') tokens.shift()
  eatKeyAccidentals(tokens)

  while (tokens.length > 0) {
    const head = tokens[0]
    if (head === undefined) break
    const name = head.token
    if (
      name === 'm' || name === 'middle' || name === 'transpose' || name === 'stafflines' ||
      name === 'staffscale' || name === 'octave' || name === 'style' || name === 'clef'
    ) {
      tokens.shift()
      if (tokens.length === 0) return out
      // "Expected = after <name>" — and the token that was not an `=` is shifted with it.
      if (tokens.shift()?.token !== '=') continue
      if (tokens.length === 0) return out
      if (name === 'm' || name === 'middle') {
        eatPitch(tokens)
        continue
      }
      if (name === 'style') {
        // ⚠️ **A VALUE THE ARM REJECTS IS LEFT WHERE IT STANDS** — abcjs warns and `break`s
        // without shifting, so the switch sees it again and it becomes an unknown parameter.
        if (STYLE_TOKENS.has(tokens[0]?.token ?? '')) tokens.shift()
        continue
      }
      if (name !== 'clef') {
        if (tokens[0]?.type === 'number') tokens.shift()
        continue
      }
      // `clef=` FALLS THROUGH — abcjs's own comment, which is what makes it optional. And
      // ⚠️ **ONLY HERE DO `C`, `F` AND `G` NAME CLEFS**: a bare `K:C G` never reaches this
      // arm and is an unknown parameter.
    } else if (!CLEF_TOKENS.has(name)) {
      out.push({ token: name, column: head.start })
      tokens.shift()
      continue
    }
    // The clef arm: the name, then an optional line NUMBER, then an optional `±8`.
    tokens.shift()
    if (tokens[0]?.type === 'number') tokens.shift()
    if (
      tokens.length > 1 &&
      ['-', '+', '^', '_'].includes(tokens[0]?.token ?? '') &&
      tokens[1]?.token === '8'
    ) {
      tokens.shift()
      tokens.shift()
    }
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
export /**
 * **`C`, `F` AND `G` NAME CLEFS, IN EITHER CASE** — the inner switch of abcjs's clef arm
 * rewrites `C`/`c` to `alto`, `F`/`f` to `bass` and `G`/`g` to `treble`
 * (`abc_parse_key_voice.js:497-502`), the shapes' own letters.
 *
 * ⚠️ **ONLY AFTER `clef=`.** That inner switch is reached from `case "clef"` and from the
 * six full clef NAMES it falls through to, so a bare `K:C G` never gets there — `G` is not
 * a case of the OUTER switch and warns as an unknown parameter. Treating a bare letter as a
 * clef would make the key's own letter one.
 */
const clefAlias = (name: string): string =>
  ({ c: 'alto', f: 'bass', g: 'treble' })[name.toLowerCase()] ?? name

export function parseClef(spec: string): Clef | null {
  const middleOverride = middleLineOverride(spec)
  const staffLines = staffLineCount(spec)
  // See `Clef.staffLinesWritten` — the COUNT defaults, the flag does not.
  const written = staffLinesWritten(spec)
  const build = (name: string, digit: string, octave: string): Clef | null => {
    const entry = CLEF_NAMES.find(([n]) => n === name.toLowerCase())
    if (!entry) return null
    const [, shape, defaultLine] = entry
    const line = digit ? Number.parseInt(digit, 10) : defaultLine
    return {
      shape,
      line: line >= 1 && line <= 5 ? line : defaultLine,
      // **`^8` IS `+8` AND `_8` IS `-8`.** `parseKeyVoice` appends whichever of the four
      // signs it finds to the clef name verbatim — `'-' || '+' || '^' || '_'` followed by
      // an `8` (`abc_parse_key_voice.js:511`) — and the V: switch carries a case for each
      // of the eight spellings. Ours knew only the two ASCII ones, so `clef=treble^8` came
      // out a plain treble, 1361 bytes short of abcjs's.
      octaveShift:
        octave === '+8' || octave === '^8'
          ? 1
          : octave === '-8' || octave === '_8'
            ? -1
            : 0,
      middleOverride,
      staffLines,
      ...(written ? { staffLinesWritten: true as const } : {}),
    }
  }

  // **`cl=` IS `clef=`** — one case label sharing its arm (`abc_parse_key_voice.js:641`).
  // V:-only: abcjs's K: switch has no such alias, and reading it on both is a divergence
  // only a `K:C cl=bass` could show. No corpus writes one.
  const explicit = /\bcl(?:ef)?=([a-z]+)(\d?)([-+^_]8)?/i.exec(spec)
  if (explicit) return build(clefAlias(explicit[1] ?? ''), explicit[2] ?? '', explicit[3] ?? '')

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
  for (const m of modifiers.matchAll(/(?:^|\s)([a-z]+)(\d?)([-+^_]8)?/gi)) {
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
  const named = parseClef(spec)
  if (named !== null) return named
  /**
   * ⚠️ **AND `middle=` REACHES THIS FALLBACK TOO.** abcjs writes it straight onto the
   * standing clef — `multilineVars.clef.verticalPos = pitch.position - 6`
   * (`abc_parse_key_voice.js:410`) — with no clef named beside it, exactly as
   * `stafflines=` does. A `K:C middle=d` therefore repositions the staff and ours dropped
   * it on the floor: `parseClef` rightly returns null for a field that names no clef, and
   * only the line count was being carried across.
   *
   * ⚠️ **AND THE PROBE THAT SAID OTHERWISE WAS `middle=B`.** B IS the treble middle line,
   * so both engines drew the untouched tune and the row read identical. `middle=d` and
   * `middle=G` are what see it — a "SAME" is only as good as the shape that asked.
   */
  const middle = middleLineOverride(spec)
  return {
    ...current,
    staffLines: staffLineCount(spec),
    ...(middle === null ? {} : { middleOverride: middle }),
    ...(staffLinesWritten(spec) ? { staffLinesWritten: true as const } : {}),
  }
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
const STAFFLINES = /\bstafflines=(-?\d+)/i

/** Whether the field wrote a usable `stafflines=` — see `Clef.staffLinesWritten`. */
function staffLinesWritten(spec: string): boolean {
  const m = STAFFLINES.exec(spec)
  if (!m) return false
  const n = Number.parseInt(m[1] ?? '', 10)
  return Number.isInteger(n) && n >= 0 && n <= 10
}

/**
 * The four CHANGING fonts at their built-in values — abcjs's `initialize` literals
 * (`abc_parse_directive.js:23-31`), which is what `runningLineFonts` is seeded with.
 * `box` is false on all four: none is written with one by default.
 */
const DEFAULT_CHANGING_FONTS: Readonly<Record<string, LyricFont>> = {
  annotationfont: { face: 'Helvetica', size: 12, bold: false, italic: false, box: false },
  gchordfont: { face: 'Helvetica', size: 12, bold: false, italic: false, box: false },
  tripletfont: { face: 'Times', size: 11, bold: false, italic: true, box: false },
  vocalfont: { face: '"Times New Roman"', size: 13, bold: true, italic: false, box: false },
}

function staffLineCount(spec: string): number {
  const m = STAFFLINES.exec(spec)
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
/**
 * **THE TEMPO WORDS, AND THEIR RATES** — `abc_parse_header.js:204-232`, twenty-six of
 * them, matched case-insensitively against the WHOLE pre-string when a `Q:` states nothing
 * else. Reproduced verbatim because they are abcjs's numbers, not a convention: its
 * `moderato` is 112 where most tables say 108-120, and `marcia moderato` and `andante
 * moderato` are two-word keys.
 */
const TEMPO_WORDS: Readonly<Record<string, number>> = {
  larghissimo: 20,
  adagissimo: 24,
  sostenuto: 28,
  grave: 32,
  largo: 40,
  lento: 50,
  larghetto: 60,
  adagio: 68,
  adagietto: 74,
  andante: 80,
  andantino: 88,
  'marcia moderato': 84,
  'andante moderato': 100,
  moderato: 112,
  allegretto: 116,
  'allegro moderato': 120,
  allegro: 126,
  animato: 132,
  agitato: 140,
  veloce: 148,
  'mosso vivo': 156,
  vivace: 164,
  vivacissimo: 172,
  allegrissimo: 176,
  presto: 184,
  prestissimo: 210,
}

function parseTempo(
  content: string,
  /**
   * `multilineVars.printTempo === false` — `%%printtempo 0` or `false`. Stamped ON THE
   * TEMPO because the directive is running state, so one written between two `Q:` fields
   * governs only the second (`abc_parse_header.js:333-334`). See `Tempo.suppress`.
   */
  suppress = false,
): Tempo | null {
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
  /**
   * **AND A LONE TEMPO WORD IS A RATE.** `setTempo` shifts the leading quote, finds NO
   * tokens after it, and looks the string up in `tempoString` — `bpm` from the table and
   * `suppressBpm: true` so the number is not drawn (`abc_parse_header.js:257-268`). The
   * guard is "nothing else in the field at all", which is why `Q:"Allegro" 1/4=120` keeps
   * its stated 120 and `Q:"Allegro"` alone sounds at 126.
   */
  if (bpm === null && postText === null && text !== null) {
    const word = TEMPO_WORDS[text.toLowerCase()]
    if (word !== undefined)
      return {
        beatUnit,
        bpm: word,
        text,
        postText,
        suppressBpm: true,
        ...(suppress ? { suppress: true } : {}),
      }
  }
  return { beatUnit, bpm, text, postText, ...(suppress ? { suppress: true } : {}) }
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
 * **AN `&` OVERLAY IS A VOICE, AND WHICH LINES IT EXISTS ON IS abcjs'S OWN ANSWER.**
 *
 * This runs `core/overlays.ts` — the very pass `tune.lines` resolves with, and the very one
 * abcjs runs in `cleanUp` — over a line-structured view of the MODEL, so the renderer, the
 * clock and the flattener lay out the same voices a host reads. All three already expand
 * `measure.overlays` into a voice; what changed is what is IN it.
 *
 * ⚠️ **THE PADDING IS TWO DIFFERENT THINGS AND WE USED TO WRITE ONE.** On the layer's own
 * line, a measure that does not sing gets ONE invisible rest of the measure's summed
 * duration carrying the BARLINE's span (`tune-builder.js:572-575`); a line ABOVE one that
 * sings is BACK-FILLED with one invisible rest PER NOTE, each carrying that note's own span
 * (`:536-545`). A single per-measure rest with no span at all — what this used to write —
 * is neither, and it read as a `startCharArray` of `[82,82,82]` against abcjs's `[82,85]`.
 *
 * ⚠️ **AND HOW MANY LAYERS A LINE HAS IS NOT THE TUNE'S MAXIMUM.** The back-fill's guard —
 * `staff.voices.length < s.voices.length`, the CURRENT line's count against the earlier
 * line's and taken BEFORE the new voice is pushed — is what stops a line already carrying
 * its own layer from being back-filled by a later one. `synth-flattener-21` has five lines
 * and its fourth carries ONE layer where the tune's maximum is two. That rule was
 * re-derived wrong twice; this runs it instead of restating it.
 *
 * ponytail: ONE STAFF PER VOICE. abcjs back-fills a staff by copying EVERY voice on it, so
 * a two-voice staff gains two voices per pass where this gains one each. Nothing in either
 * corpus writes an `&` on a shared staff; the ranked tables will say so if anything does.
 */
const overlayElementFor = (event: MusicEvent): OverlayElement => {
  const range = event.sourceRange
  return {
    el_type: 'note',
    duration: ratToNumber(event.duration),
    ...(range == null ? {} : { startChar: range.start, endChar: range.end }),
    ...(event.type === 'rest' ? { rest: { type: event.kind } } : {}),
    // `voiceUseful` keeps a voice whose REST carries a chord symbol, so it has to be seen.
    ...(event.chordSymbol == null ? {} : { chord: [event.chordSymbol] }),
    ref: event,
  }
}

const invisibleRest = (
  duration: Rational,
  el: OverlayElement,
  mirrors?: MusicEvent,
): Rest => ({
  type: 'rest',
  kind: 'invisible',
  overlayPad: true,
  ...(mirrors === undefined ? {} : { overlayMirrors: mirrors }),
  duration,
  notatedDuration: duration,
  decorations: [],
  decorationSourceRanges: [],
  chordSymbol: null,
  chordSymbolSourceRange: null,
  chordFont: null,
  annotations: [],
  annotationSourceRanges: [],
  graceNotes: [],
  tuplet: null,
  measureCount: 0,
  sourceRange:
    el.startChar === undefined || el.endChar === undefined
      ? null
      : { start: el.startChar, end: el.endChar },
})

/** The measure's own sounding length — abcjs's `durationThisBar`, SPACERS EXCLUDED. */
const soundingLength = (measure: Measure): Rational =>
  measure.events.reduce(
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

function padOverlays(measures: readonly Measure[], _meter: Meter | null): Measure[] {
  if (!measures.some((m) => m.overlays.length > 0)) return [...measures]

  // ── abcjs's own view: one LINE per system, one staff, one voice ──
  const lines: OverlayLine[] = []
  const lineMeasures: number[][] = []
  const measureOfBar = new Map<OverlayElement, number>()
  let voice: OverlayElement[] = []
  measures.forEach((measure, index) => {
    if (index === 0 || measure.startsSystem) {
      voice = []
      lines.push({ staff: [{ voices: [voice] }] })
      lineMeasures.push([])
    }
    lineMeasures[lineMeasures.length - 1]?.push(index)
    for (const event of measure.events) voice.push(overlayElementFor(event))
    for (const layer of measure.overlays) {
      voice.push({ el_type: 'overlay' })
      for (const event of layer) voice.push(overlayElementFor(event))
    }
    const range = measure.closingBarlineSourceRange
    const bar: OverlayElement = {
      el_type: 'bar',
      ...(range == null ? {} : { startChar: range.start, endChar: range.end }),
    }
    measureOfBar.set(bar, index)
    voice.push(bar)
  })

  resolveOverlays(lines)

  // ── Read the layers back. A chunk NAMES its measure rather than being counted into it:
  // the bars in a layer voice are the very objects the main voice holds.
  const resolved: MusicEvent[][][] = measures.map(() => [])
  lines.forEach((line, l) => {
    const voices = line.staff?.[0]?.voices ?? []
    const indices = lineMeasures[l] ?? []
    for (let j = 1; j < voices.length; j += 1) {
      for (const index of indices) {
        const rows = resolved[index]
        if (rows !== undefined) rows[j - 1] = []
      }
      let chunk: MusicEvent[] = []
      let at = 0
      const put = (index: number | undefined): void => {
        const rows = index === undefined ? undefined : resolved[index]
        if (rows !== undefined) rows[j - 1] = chunk
        chunk = []
      }
      for (const el of voices[j] ?? []) {
        if (el.el_type === 'bar') {
          put(measureOfBar.get(el) ?? indices[at])
          at += 1
          continue
        }
        if (el.el_type !== 'note') continue
        const pad = el.pad as MusicEvent | undefined
        const ref = el.ref as MusicEvent | undefined
        if (pad !== undefined) chunk.push(invisibleRest(pad.duration, el, pad))
        else if (ref !== undefined) chunk.push(ref)
        else {
          const measure = measures[indices[at] ?? 0]
          chunk.push(
            invisibleRest(measure === undefined ? rational(0, 1) : soundingLength(measure), el),
          )
        }
      }
      // A line whose last measure has no closing barline leaves a chunk with no bar to name
      // it; it belongs to that measure.
      if (chunk.length > 0) put(indices[indices.length - 1])
    }
  })

  return measures.map((measure, index) => {
    const layers = resolved[index] ?? []
    if (layers.length === 0 && measure.overlays.length === 0) return measure
    return { ...measure, overlays: layers }
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
  const first = content.trim().split(/\s+/)[0] ?? ''
  /**
   * **`getKeyPitch` IS UPPERCASE-ONLY** — its switch has `case 'A'` … `case 'G'` and the
   * lowercase arms are COMMENTED OUT in abcjs's own source (`abc_tokenizer.js:33-45`). So
   * `[K: bass-8]` and `[K: alto]` name a CLEF and no key, where lowercasing the token first
   * read them as B and A: `synth-flattener-20` grew a `keySignature` element beside each of
   * its two lowercase-initial clefs, and every accidental after them was wiped.
   */
  return /^none\b/.test(first.toLowerCase()) || /^[A-G]/.test(first)
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
  /** `V:… scale=` / `cue=` — see `Voice.scale`. */
  scale: number | null = null
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
  /** The clef an INLINE `[K:]` pitches its accidentals for — see `Measure.keyChangeClef`. */
  private pendingKeyChangeClef: Clef | undefined = undefined
  /** `[K:…]` rather than a standalone `K:` line — see `Measure.keyChangeInline`. */
  private pendingKeyChangeInline = false
  /** `%%keywarn` as it stood at this `K:` — see `Measure.keyChangeKeywarn`. */
  private pendingKeyChangeKeywarn: boolean | undefined = undefined
  /** The meter came off a standalone `M:` LINE — see `Measure.meterChangeStandalone`. */
  private pendingMeterChangeStandalone = false
  /** Where the `K:` that named this clef was written — see `Measure.clefChangeSourceRange`. */
  private pendingClefChangeRange: SourceRange | null = null
  private pendingClefChangeInline = false
  private pendingClefChange: Clef | null = null
  private pendingTempoChange: Tempo | null = null
  private pendingTempoChangeRange: SourceRange | null = null
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
    /** `%%vskip` waiting for the next line, shared across voices as abcjs shares it. */
    readonly pendingVskip: { value: number | null } = { value: null },
  ) {}

  /** `%%vskip n` — see `Measure.vskip`. */
  setPendingVskip(px: number): void {
    this.pendingVskip.value = px
  }

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

  setKeyChange(
    key: KeySignature,
    range: SourceRange,
    clef?: Clef,
    inline = false,
    /** `%%keywarn` AT THIS `K:` — see `Measure.keyChangeKeywarn`. */
    keywarn?: boolean,
  ): void {
    this.pendingKeyChange = key
    this.pendingKeyChangeRange = range
    this.pendingKeyChangeClef = clef
    this.pendingKeyChangeInline = inline
    this.pendingKeyChangeKeywarn = keywarn
  }

  /** A mid-tune `K:… clef=` or `[K: bass]`. Delta, like the key change. */
  setClefChange(clef: Clef, range: SourceRange | null = null, inline = false): void {
    this.pendingClefChange = clef
    this.pendingClefChangeRange = range
    this.pendingClefChangeInline = inline
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
  setTempoChange(tempo: Tempo | null, range: SourceRange | null = null): void {
    this.pendingTempoChange = tempo
    this.pendingTempoChangeRange = range
  }

  setMeterChange(meter: Meter | null, range: SourceRange, inline = false): void {
    this.pendingMeterChange = meter
    this.pendingMeterChangeRange = range
    this.pendingMeterChangeInline = inline
    // …AND ITS POSITION IN THE STREAM, because a measure can carry more than one and
    // abcjs draws every one of them where it stands. See `Measure.meterChanges`.
    //
    // **AND ITS OWN SOURCE RANGE WITH IT**, because each is an ELEMENT of `tune.lines` and
    // a host reads its span: `[M:2/4]y[M:3/4]y[M:4/4]` is three time signatures and only
    // the LAST was reachable while the singular `meterChangeSourceRange` was the only one.
    this.pendingMeterChanges.push({ meter, at: this.events.length, range })
  }

  private pendingMeterChanges: {
    meter: Meter | null
    at: number
    range?: SourceRange
  }[] = []

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
      ...(this.pendingKeyChangeClef === undefined
        ? {}
        : { keyChangeClef: this.pendingKeyChangeClef }),
      clefChange: this.pendingClefChange,
      clefChangeSourceRange: this.pendingClefChangeRange,
      ...(this.pendingClefChangeInline ? { clefChangeInline: true } : {}),
      tempoChange: this.pendingTempoChange,
      tempoChangeSourceRange: this.pendingTempoChangeRange,
      ...(this.pendingMidi.length > 0 ? { midiCommands: this.pendingMidi } : {}),
      keyChangeSourceRange: this.pendingKeyChangeRange,
      ...(this.pendingKeyChangeInline ? { keyChangeInline: true } : {}),
      ...(this.pendingKeyChangeKeywarn === undefined
        ? {}
        : { keyChangeKeywarn: this.pendingKeyChangeKeywarn }),
      meterChange: this.pendingMeterChange,
      meterChangeSourceRange: this.pendingMeterChangeRange,
      ...(this.pendingMeterChangeInline ? { meterChangeInline: true } : {}),
      ...(this.pendingMeterChangeStandalone ? { meterChangeStandalone: true } : {}),
      ...(this.pendingMeterChanges.length > 1
        ? { meterChanges: this.pendingMeterChanges }
        : {}),
    }
    this.pendingKeyChange = null
    this.pendingKeyChangeClef = undefined
    this.pendingKeyChangeInline = false
    this.pendingKeyChangeKeywarn = undefined
    this.pendingClefChange = null
    this.pendingClefChangeRange = null
    this.pendingClefChangeInline = false
    this.pendingTempoChange = null
    this.pendingTempoChangeRange = null
    this.pendingMidi = []
    this.pendingKeyChangeRange = null
    this.pendingMeterChange = null
    this.pendingMeterChangeStandalone = false
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
    /**
     * **THE LINE'S STYLE IS READ WHERE `startNewLine` FIRES**, which is at the first
     * element appended and not at the line's first character — the same lazy line start
     * `styleForNextLine` is built on. See `Measure.lineStyle`.
     */
    if (!this.appendedSinceLineStart && this.styleSeen)
      this.styleAtLineStart = this.noteStyle
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
  /** Has a `style=` been seen AT ALL — abcjs's `if (multilineVars.style)`. */
  private styleSeen = false
  /** The style this line opened with — see `push`. */
  private styleAtLineStart: NoteStyle | null = null
  /** The fonts that changed as this line opened — see `ScoreBuilder.runningLineFonts`. */
  private lineFonts: Partial<Record<AbcFontType, LyricFont>> | undefined = undefined

  setLineFonts(fonts: Partial<Record<AbcFontType, LyricFont>> | undefined): void {
    this.lineFonts = fonts
  }

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
    this.styleSeen = true
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
      this.pendingMeterChanges.push({
        meter: this.meterForNextLine.meter,
        at: this.events.length,
        ...(this.meterForNextLine.range == null ? {} : { range: this.meterForNextLine.range }),
      })
      // The standalone form, by construction — this is abcjs's `startNewLine` consuming
      // `multilineVars.meter`, which the inline arm never fills.
      this.pendingMeterChangeInline = false
      this.pendingMeterChangeStandalone = true
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

  /**
   * **AND AN INLINE `[V:` OPENS A LINE EVEN WHEN IT NAMES THE VOICE ALREADY CURRENT** —
   * abcjs's OTHER mechanism, and the one this engine was missing.
   *
   *     if (retInlineHeader[1] === 'V') delayStartNewLine = true;  // "fixes bug on this: c[V:2]d"
   *     …
   *     if (!tuneBuilder.hasBeginMusic() || (delayStartNewLine && !this.lineContinuation))
   *         this.startNewLine();
   *
   * (`abc_parse_music.js:151-159`.) ANY inline `[V:` sets the flag, a repeat included, and
   * it fires at the next non-header token unless the line is a CONTINUATION.
   *
   * ⚠️ **THERE ARE TWO MECHANISMS AND THEY ARE NOT THE SAME ONE.** `switchedTo` above is
   * `tuneBuilder.setCurrentVoice`'s line scan, which fires only on a REAL switch — a
   * repeat early-returns before ever reaching it (`abc_parse_key_voice.js:526-531`), which
   * is why `selectVoice`'s guard is correct and must stay. Conflating the two was tried:
   * removing that guard takes all six control shapes to abcjs's answer AND takes
   * `abcjs-visual-parsing-03-v-1-f` and `-09-score-t-b` — both `\`-continued — from
   * byte-exact to differing. Instrumenting BOTH sites at once is what separated them:
   * rows 4 and 5 of the ladder trace identically through this gate and differ entirely in
   * the other.
   */
  inlineVoiceField(continued: boolean): void {
    if (continued || !this.wroteSinceLineStart) return
    this.beginMusicLine()
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
        /**
         * **A `*` IS AN EMPTY SYLLABLE, NOT AN ABSENT ONE — MEASURED, NOT LANDED.**
         *
         * This note says a `skip` "need not be recorded", and abcjs's own SVG denies it:
         * `little swallow`'s `w:` lines carry 19 `*`s and abcjs draws 89 lyric elements
         * where we draw 70. Each `*` gets a `<text data-name="lyric">` of its own, and its
         * content falls out of `renderText`'s two rewrites: `addLyric` builds
         * `lyricStr += syllable + div + "\n"`, so two blank verses give `"\n\n"`, which
         * `/\n\n/g → "\n \n"` and `/^\n/ → "\xA0\n"` turn into the three tspans
         * abcjs writes — `&nbsp;`, a space, and an empty one.
         *
         * NOT LANDED because it is three pieces, not one: the parser has to keep the
         * syllable, the lyric emitter has to apply those two rewrites to the JOINED verse
         * string as `bottomTextBlock` already does for `N:`/`H:`, and the LANE counts
         * `versesHere` by non-empty text — which 19 new empty lyrics would change. One
         * row of the sibling byte table.
         */
        verses[verse]?.set(line.start + offset, syllable)
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
        // …and a LATER verse tells "not covered" (null) from "covered, no syllable" ('')
        // the same way verse 1 does — see `lyric` below.
        const extras = verses.slice(1).map((verse) => {
          const sy = verse.get(index)
          return sy === undefined ? null : (sy.text ?? '')
        })
        // Named rather than read after `index += 1`: the lookahead is deliberate, and
        // spelling it out keeps it from reading as an off-by-one.
        const next = verses[0]?.get(index + 1)
        index += 1
        return {
          ...event,
          // **AN EMPTY SYLLABLE IS NOT AN ABSENT ONE.** A `*` (skip) and the note a `_`
          // holds over both reach `addLyric` in abcjs, which builds
          // `lyricStr = "" + div + "\n"` and draws `&nbsp;` — `null` here means the `w:`
          // line never covered this note at all. See the note above `verses`.
          lyric: first === undefined ? null : (first.text ?? ''),
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

  /**
   * …**AND A REST INSIDE THE RUN IS STAMPED TOO** — see `Rest.beamGroup`. `BeamElem.add`
   * takes every element the group covers, and a rest's `restpitch` feeds the beam's
   * `min`/`max` like any note's.
   */
  /** Is the event at `index` a rest? `closeBeamRun` trims the run's trailing ones. */
  isRestAt(index: number): boolean {
    return this.target[index]?.type === 'rest'
  }

  setBeamGroup(index: number, group: number): void {
    const target = this.target
    const event = target[index]
    if (event) target[index] = { ...event, beamGroup: group }
  }

  /** `-` reaches back: the tie belongs to the note already emitted. Rests cannot tie. */
  tieLast(dotted = false): void {
    const last = this.last
    if (last && last.type !== 'rest') {
      this.replaceLast({ ...last, tiedToNext: true, ...(dotted ? { tieDotted: true } : {}) })
      return
    }
    /**
     * ⚠️ **AND A `-` WRITTEN AFTER THE BARLINE STILL TIES THE NOTE BEFORE IT.** abcjs's
     * tie is a voice-level flag rather than a property of the measure being built, so
     * `C2|[-1 D2|]` — where the `[-1` reverts to a bare barline and the chord abandons at
     * the `-` — puts `startTie` on the C and `endTie` on the D across the bar. Ours looked
     * only at the measure just opened, which is empty, and drew nothing.
     *
     * Only reached where the current measure has no event yet: an ordinary `C2-|D2` writes
     * its `-` BEFORE the barline and never comes here.
     */
    if (last !== null) return
    const previous = this.measures[this.measures.length - 1]
    const events = previous?.events
    const at = events === undefined ? -1 : events.length - 1
    const target = at < 0 ? undefined : events?.[at]
    if (previous === undefined || events === undefined || target === undefined) return
    if (target.type === 'rest') return
    const replaced = [...events]
    replaced[at] = { ...target, tiedToNext: true, ...(dotted ? { tieDotted: true } : {}) }
    this.measures[this.measures.length - 1] = { ...previous, events: replaced }
  }

  /**
   * `)` likewise closes the slur on the preceding event — **INCLUDING A REST.**
   *
   * ⚠️ That is not symmetry: a `(` does NOT open on one. abcjs's rest arm assigns both
   * (`abc_parse_music.js:516-518`) and then `delete el.startSlur` runs unconditionally four
   * lines later (`:527`), where nothing deletes `endSlur`. So `(Cz)` puts `endSlur: [101]`
   * on the REST and `(zC)` opens nothing at all. See `Rest.slurEnds`.
   *
   * This said "Rests cannot be slurred" and dropped the close, which is the rule the tie
   * beside it follows and the slur does not.
   */
  slurEndLast(): void {
    const last = this.last
    if (!last) return
    if (last.type === 'rest') {
      this.replaceLast({ ...last, slurEnds: (last.slurEnds ?? 0) + 1 })
      return
    }
    this.replaceLast({ ...last, slurEnds: last.slurEnds + 1 })
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
  /** `%%vskip` waiting for the next line — see `Measure.vskip`. */
  private takeVskip(startsSystem: boolean): { vskip?: number } {
    if (!startsSystem || this.pendingVskip.value === null) return {}
    const n = this.pendingVskip.value
    this.pendingVskip.value = null
    return { vskip: n }
  }

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
          ...(startsSystem && this.styleAtLineStart !== null
            ? { lineStyle: this.styleAtLineStart }
            : {}),
          ...(startsSystem && this.lineFonts !== undefined
            ? { lineFonts: this.lineFonts }
            : {}),
          ...this.takeSystemBarNumber(startsSystem),
          ...this.takeTextBefore(startsSystem),
          ...this.takeVskip(startsSystem),
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
      /**
       * ⚠️ **AND WITH NOTHING AT ALL AFTER IT, THE ENDING GOES ON THE MEASURE ALREADY
       * PUSHED.** `C2|1` ends the line on the digit: no measure opens after that barline,
       * so nothing ever calls `takeOpening` and the label was set and dropped. abcjs
       * writes `bar_thin startEnding "1"`.
       *
       * The projection joins a volta to a barline BY POSITION — `voltaAt` is keyed on
       * `voltaSourceRange.start` and read against every measure's opening AND closing
       * barline range (`compat/lines.ts`) — so which measure carries the label does not
       * matter, only that one does. It goes on the last measure pushed, and only where
       * that measure has none of its own.
       */
      if (trailing === null && this.pendingVolta !== null) {
        const last = this.measures[this.measures.length - 1]
        if (last !== undefined && last.volta === null) {
          this.measures[this.measures.length - 1] = {
            ...last,
            volta: this.pendingVolta.label,
            voltaSourceRange: this.pendingVolta.range,
            // …and the bracket hangs on THIS measure's closer — see `Measure.voltaAtClose`.
            voltaAtClose: true,
          }
          this.pendingVolta = null
        }
      }
      if (trailing !== null) {
        this.pendingOpening = null
        const bare: Measure = {
          events: [],
          overlays: [],
          keyChange: null,
          keyChangeSourceRange: null,
          meterChange: null,
          meterChangeSourceRange: null,
          /**
           * ⚠️ **AND IT TAKES A REPEAT ENDING THAT NOTHING ELSE WILL.** A volta rides on
           * the measure the barline OPENS, and the projection matches it back to that
           * barline by position — so `C2|1 D2|` works because the `D2` measure closes and
           * consumes it. `C2|1|` has no such measure: the second `|` leaves a
           * `pendingOpening` and the line ends, so the label was set and never taken, and
           * abcjs writes `bar_thin startEnding "1"` spanning `|1`.
           *
           * The same one character costs the SPAN as well as the label, since the digit is
           * inside the barline's element in abcjs and outside ours.
           */
          volta: this.pendingVolta?.label ?? null,
          voltaSourceRange: this.pendingVolta?.range ?? null,
          partLabel: null,
          partLabelSourceRange: null,
          startsSystem: false,
          openingBarline: null,
          openingBarlineSourceRange: null,
          closingBarline: trailing.barline,
          closingBarlineSourceRange: trailing.range,
          sourceRange: trailing.range,
        }
        this.pendingVolta = null
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
          ...(startsSystem && this.styleAtLineStart !== null
            ? { lineStyle: this.styleAtLineStart }
            : {}),
          ...(startsSystem && this.lineFonts !== undefined
            ? { lineFonts: this.lineFonts }
            : {}),
          ...this.takeSystemBarNumber(startsSystem),
          ...this.takeTextBefore(startsSystem),
          ...this.takeVskip(startsSystem),
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

  finish(): Omit<Voice, 'declaredIndex'> {
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
      scale: this.scale,
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
    /**
     * **A NUMBER PAST THIS VOICE'S LAST MEASURE IS NOT THIS VOICE'S TO DELETE.** abcjs
     * hands it to `getNextMusicLine(tune.lines, i).staff[0]` — the next LINE of the TUNE,
     * whichever voices are on it (`tune-builder.js:139-144`) — so a voice whose part ends
     * mid-tune passes its trailing number to whoever is still playing. Deleting it here
     * cost `%%barnumbers 1` its `3` on a system voice 0 had dropped out of. See
     * `carryDanglingBarNumbers`, which finishes the move and deletes what no later system
     * claims.
     */
    if (next === undefined) continue
    const moved = measure.closingBarNumber
    delete (measure as { closingBarNumber?: number }).closingBarNumber
    ;(next as { systemBarNumber?: number }).systemBarNumber = moved
  }
  return out
}

/**
 * **THE OTHER HALF OF `moveTrailingBarNumbers`, ACROSS VOICES.**
 *
 * A bar number left on a voice's LAST measure belongs to the next music LINE of the tune,
 * not to this voice — `nextLine.staff[0].barNumber` (`tune-builder.js:139-144`). So it
 * travels to the first measure that OPENS a system after it, in whichever voice still has
 * one, and is deleted only when the tune ends there, which is why a tune ending `…|`
 * prints no number on its final barline.
 */
function carryDanglingBarNumbers(voices: readonly Voice[]): void {
  const startsSystemAt = (index: number): Voice | undefined =>
    voices.find((v) => v.measures[index]?.startsSystem === true)
  for (const voice of voices) {
    const last = voice.measures.length - 1
    const measure = voice.measures[last]
    const number = measure?.closingBarNumber
    if (measure === undefined || number === undefined) continue
    delete (measure as { closingBarNumber?: number }).closingBarNumber
    const longest = Math.max(...voices.map((v) => v.measures.length))
    for (let j = last + 1; j < longest; j += 1) {
      const owner = startsSystemAt(j)
      if (owner === undefined) continue
      ;(owner.measures[j] as { systemBarNumber?: number }).systemBarNumber = number
      break
    }
  }
}

/** The `%%` formatting a file header passes to every tune under it. */
interface Formatting {
  staffSep: number | null
  musicSpace: number | null
  measurements: Record<string, number>
  titleLeft: boolean
  bagpipes: boolean
  flatBeams: boolean
  graceSlurs: boolean
  newPage: number | null
  newPageAt: number | null
  barsPerStaff: number | null
  partsBox: boolean
  /** `%%printtempo` — see `ScoreBuilder.printTempo`. */
  printTempo: boolean | undefined
  jazzChords: boolean
  keywarn: boolean
  percMap: Record<string, PercMapEntry>
  drumMap?: Record<string, number>
  midi?: Record<string, readonly (string | number)[]>
  stretchLast: number | null
  staffWidth: number | null
  scale: number | null
  maxStaves: number | null
  sysStaffSep: number | null
  vocalFont: LyricFont | null
  fonts: Partial<Record<AbcFontType, LyricFont>>
  /** The five `positionChoices` directives — see `ScoreBuilder.positions`. */
  positions: Partial<Record<PositionKind, ElementPosition>>
  /** The `tune.formatting` keys the file header set, in its order — see `noteFormatting`. */
  formattingOrder: readonly string[]
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
  /** `%%abc-copyright` and its four siblings — see `ScoreMetadata.abcMeta`. */
  abcMeta: Record<string, string> = {}
  notes: RichText[] = []
  history: RichText[] = []
  unalignedWords: RichText[] = []
  /** `G:` — the tune's group. Recorded and drawn by nothing; see `ScoreMetadata.group`. */
  group: RichText | null = null
  /**
   * **THE ORDER `tune.formatting` WAS FILLED IN**, for the directives that reach it — see
   * `Score.formattingOrder`. abcjs writes `tune.formatting[cmd] = …` as each directive is
   * read (`abc_parse_directive.js:321`, `:421`, `:723`, `:1220`), so the object's KEY ORDER
   * is the source's; a key already present keeps its position when it is set again.
   */
  formattingOrder: string[] = []
  /** First write wins the position, as an object key does. */
  noteFormatting(key: string): void {
    if (!this.formattingOrder.includes(key)) this.formattingOrder.push(key)
  }
  /** `%%header` / `%%footer` — see `ScoreMetadata.runningHead`. */
  runningHead: Partial<Record<'header' | 'footer', RunningHead>> = {}
  /** `metaTextInfo` — see `ScoreMetadata.fieldRanges`. `title` lives in `titleRanges`. */
  fieldRanges: Record<string, SourceRange> = {}
  titleRanges: SourceRange[] = []
  /**
   * `addMetaText`'s rule: the FIRST write sets both ends, a later one moves only the end
   * (`tune-builder.js:433-448`). `addMetaTextArray` does the same for `N:`/`H:`/`W:`.
   */
  recordField(key: string, range: SourceRange): void {
    const seen = this.fieldRanges[key]
    this.fieldRanges[key] = seen === undefined ? range : sourceRange(seen.start, range.end)
  }
  /**
   * **BEFORE THE FIRST `K:` THE KEY IS `none`, NOT C MAJOR** — abcjs opens
   * `multilineVars.key` at `{accidentals: [], root: 'none', acc: '', mode: ''}`
   * (`abc_parse.js:80`). The two alter nothing and print nothing, so only `root` can tell
   * them apart, and it shows wherever a music line is read before the `K:` — `frere-jacques`
   * is one, whose `S:`/`Z:` prose the music scan reads as notes. It is also what an
   * unparseable `K:` leaves in force, `K:cm` and a bare `K:` alike.
   */
  key: KeySignature = { ...defaultKey(), none: true }
  clef: Clef = defaultClef
  tempo: Tempo | null = null
  tempoSourceRange: SourceRange | null = null
  /** The tune's `Q:` was written INLINE — drawn, but not the audio clock's. */
  tempoInline = false
  meter: Meter | null = null
  unitNoteLength: Rational = rational(1, 8)
  unitExplicit = false
  bodyStarted = false
  /** abcjs's `is_in_header`, inverted — cleared by the first `K:` and by nothing else. */
  sawKey = false
  /**
   * **THE VOICE HAS SOMETHING IN IT** — what `appendStartingElement` branches on when it
   * decides between the staff and the stream, and what the standalone-`M:` and
   * `firstLineKeyClef` rules read. NOT abcjs's `hasBeginMusic()`, though it was named for
   * it: the two part company at a BODY `V:`, and the byte gate is what said so —
   * `visual-layout-07` moved an accidental 7.75px when they were merged.
   */
  musicStarted = false
  /**
   * **abcjs's `hasBeginMusic()` — "at least one LINE contains a staff"**, which a body `V:`
   * creates and a header one does not. Read by the `%%MIDI` split alone: a command reaches
   * `tune.formatting.midi` only while this is false, and becomes an ELEMENT in the voice's
   * stream once it is true (`abc_parse_directive.js:718-724`).
   *
   * **MEASURED ON A FIVE-RUNG LADDER through abcjs rather than reasoned**, because the
   * predicate is stated nowhere: `%%MIDI program 5` reaches `formatting` before `K:`, after
   * `K:` with no `V:`, and after a HEADER `V:` — and does NOT after a BODY `V:` or after a
   * note.
   */
  beganMusic = false
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
  /**
   * **abcjs's `tune.runningFonts`, SEEDED WHERE THE HEADER ENDS.** `parseLine` calls
   * `setRunningFont` for all four changing fonts the moment `is_in_header` goes false
   * (`abc_parse.js:556-561`), and `setLineFont` then stamps a line's staff only when the
   * current font DIFFERS from the running one (`tune-builder.js:948-962`). So a font set
   * in the header is on no line at all, and each later change is on exactly one.
   */
  runningLineFonts: Partial<Record<AbcFontType, LyricFont>> | null = null

  /** The fonts that CHANGED since the last line — abcjs's four `setLineFont` calls. */
  takeLineFonts(): Partial<Record<AbcFontType, LyricFont>> | undefined {
    const running = this.runningLineFonts
    if (running === null) return undefined
    const out: Partial<Record<AbcFontType, LyricFont>> = {}
    for (const type of ['annotationfont', 'gchordfont', 'tripletfont', 'vocalfont'] as const) {
      const font = this.fonts[type]
      if (font === undefined) continue
      const was = running[type]
      if (was !== undefined && JSON.stringify(was) !== JSON.stringify(font)) out[type] = font
      running[type] = font
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  /**
   * Has this music line got past its leading inline headers — see `takeLineStartFonts`.
   * A font directive read while this is FALSE belongs to the line's own snapshot; one read
   * while it is true is a MID-LINE change and rides the elements after it.
   */
  lineOpen = false
  /**
   * The running font set as of the last MID-LINE change, or null when the line has had
   * none. Stamped onto every event appended after it — see `MusicEvent.runningFonts`.
   */
  midLineFonts: Partial<Record<AbcFontType, LyricFont>> | null = null
  /**
   * **THE FIVE `positionChoices` DIRECTIVES IN FORCE** — `%%vocal`, `%%dynamic`,
   * `%%gchord`, `%%ornament` and `%%volume` (`abc_parse_directive.js:824-828`).
   *
   * `multilineVars.<x>Position` is TUNE-GLOBAL running state that only a directive writes,
   * and `addFormattingOptions` reads it as each element is appended — so a directive
   * part-way down a tune governs the elements after it and no others.
   *
   * ⚠️ **AND THE ABSENT STATE IS `auto`, WHICH IS NOT A POSITION.** The arm is
   * `if (this.vocalPosition !== 'auto')`, so `auto` publishes NOTHING and lets the engraver
   * pick — and its choice is not always the explicit word it looks like: measured on a ten-
   * rung ladder, `%%ornament above` MOVES abcjs's output on a tune whose ornaments already
   * draw above, and only `%%vocal below` is a true no-op.
   */
  positions: Partial<Record<PositionKind, ElementPosition>> = {}

  /** What `addFormattingOptions` stamps on a NOTE — absent while every one is `auto`. */
  stampedPositions(): Readonly<Partial<Record<PositionKind, ElementPosition>>> | undefined {
    let out: Partial<Record<PositionKind, ElementPosition>> | undefined
    for (const kind of POSITION_KINDS) {
      const at = this.positions[kind]
      if (at === undefined || at === 'auto') continue
      out ??= {}
      out[kind] = at
    }
    return out
  }
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
  /**
   * **THE ELEVEN CHANGING FONTS AS THEY STOOD AT THE END OF THE HEADER.**
   * `getChangingFont` writes `tune.formatting[cmd]` only `if (multilineVars.is_in_header)`
   * — "If the font appears in the header, then it becomes the default font"
   * (`abc_parse_directive.js:315-322`) — so a `%%gchordfont` in the BODY changes what is
   * drawn and not what `formatting` reports. `visual-tablature-17` sets it five times and
   * abcjs reports the FIRST.
   *
   * The other ten are `getGlobalFont` and always report the latest, so the snapshot is the
   * whole difference between the two arms. See `Score.headerFonts`.
   */
  headerFonts: Partial<Record<AbcFontType, LyricFont>> | null = null
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
  /** The other `oneParameterMeasurement` directives — see `ScoreMetadata.measurements`. */
  measurements: Record<string, number> = {}
  /** `%%titleleft` — see `ScoreMetadata.titleLeft`. */
  titleLeft = false
  /** `%%bagpipes` — see `ScoreMetadata.bagpipes`. */
  bagpipes = false
  /** `%%flatbeams` — see `ScoreMetadata.flatBeams`. */
  flatBeams = false
  /** `%%graceslurs` — see `ScoreMetadata.graceSlurs`; UNSET is true. */
  graceSlurs = true
  /** `%%newpage` — see `ScoreMetadata.newPage`. */
  newPage: number | null = null
  /** `%%barsperstaff` — see the wrap pass in the score build. */
  barsPerStaff: number | null = null
  newPageAt: number | null = null
  partsBox = false
  /**
   * `%%printtempo` — `multilineVars.printTempo`. UNDEFINED until a directive says
   * otherwise, and only the literal `false` suppresses; see `Tempo.suppress`.
   */
  printTempo: boolean | undefined = undefined
  jazzChords = false
  /** `%%keywarn 0` stops a mid-tune `K:` being DRAWN — see `Score.keywarn`. */
  keywarn = true
  /** `%%visualTranspose n` — see `visualTranspose`. */
  visualTranspose = 0
  percMap: Record<string, PercMapEntry> = {}
  /** `%%MIDI drummap <abc-note> <midi>` — accumulated, one key per directive line. */
  drumMap: Record<string, number> = {}
  /** `%%MIDI` written before the first note — the tune's own audio settings. */
  midi: Record<string, readonly (string | number)[]> = {}
  stretchLast: number | null = null
  staffWidth: number | null = null
  scale: number | null = null
  maxStaves: number | null = null
  sysStaffSep: number | null = null

  /** The file-header formatting this tune would pass on — see `Parser.fileDefaults`. */
  formatting(): Formatting {
    return {
      staffSep: this.staffSep,
      musicSpace: this.musicSpace,
      measurements: this.measurements,
      barsPerStaff: this.barsPerStaff,
      titleLeft: this.titleLeft,
      bagpipes: this.bagpipes,
      flatBeams: this.flatBeams,
      graceSlurs: this.graceSlurs,
      newPage: this.newPage,
      newPageAt: this.newPageAt,
      partsBox: this.partsBox,
      printTempo: this.printTempo,
      jazzChords: this.jazzChords,
      keywarn: this.keywarn,
      percMap: this.percMap,
      drumMap: this.drumMap,
      midi: this.midi,
      stretchLast: this.stretchLast,
      staffWidth: this.staffWidth,
      scale: this.scale,
      maxStaves: this.maxStaves,
      sysStaffSep: this.sysStaffSep,
      vocalFont: this.vocalFont,
      fonts: this.fonts,
      // …and the five POSITION directives, which a FILE HEADER can set for every tune
      // (ABC 2.1 §4.1) exactly as it can a font. `multilineVars` survives the header in
      // abcjs; ours is per builder, so it has to travel here.
      positions: this.positions,
      formattingOrder: this.formattingOrder,
    }
  }

  applyFormatting(f: Formatting): void {
    this.staffSep = f.staffSep
    this.musicSpace = f.musicSpace
    this.measurements = f.measurements
    this.titleLeft = f.titleLeft
    this.bagpipes = f.bagpipes
    this.flatBeams = f.flatBeams
    this.graceSlurs = f.graceSlurs
    this.newPage = f.newPage
    this.newPageAt = f.newPageAt
    this.barsPerStaff = f.barsPerStaff
    this.partsBox = f.partsBox
    this.printTempo = f.printTempo
    this.jazzChords = f.jazzChords
    this.percMap = f.percMap
    if (f.drumMap !== undefined) this.drumMap = f.drumMap
    if (f.midi !== undefined) this.midi = f.midi
    this.stretchLast = f.stretchLast
    // …**AND THE ORDER WITH THEM.** A `%%` directive above the first `X:` is the FILE
    // HEADER and applies to every tune (ABC 2.1 §4.1), so its `formatting` key must arrive
    // in the tune too — `%%stretchlast 1` written there was reaching `stretchLast` and not
    // `formattingOrder`, so the value was right and the key absent.
    this.formattingOrder = [...f.formattingOrder]
    this.staffWidth = f.staffWidth
    this.scale = f.scale
    this.maxStaves = f.maxStaves
    this.sysStaffSep = f.sysStaffSep
    this.vocalFont = f.vocalFont
    this.fonts = { ...f.fonts }
    this.positions = { ...f.positions }
  }
  /** `%%center` text, split by whether any music had been parsed when it was read. */
  textAbove: FreeTextBlock[] = []
  /**
   * **CHARACTERS THE MUSIC SCAN COULD NOT READ**, in source order — a bare `#`, and the
   * `^3/2` of a microtone strict must refuse. They belong to no element at all, which is
   * abcjs's own answer: `startI` is taken at the top of each `parseMusic` iteration, and
   * an iteration that appends nothing leaves its characters to nobody. `tune.lines` reads
   * this so its spans do not tile back over them. See `src/compat/lines.ts`.
   */
  unreadable: SourceRange[] = []
  textBelow: FreeTextBlock[] = []
  /** Voice ids from `%%score`/`%%staves`, which overrides declaration order. */
  scoreOrder: string[] | null = null
  /** Has any `V:`/`[V:` made a voice current — abcjs's `multilineVars.currentVoice`. */
  voiceSelected = false
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
  /** `%%vskip` waiting for the next line — see `Measure.vskip`. */
  readonly pendingVskip: { value: number | null } = { value: null }
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
      builder = new VoiceBuilder(
        id,
        this.pendingTextBefore,
        this.keyOctave,
        this.barNumbering,
        this.pendingVskip,
      )
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
    /**
     * ⚠️ **AND THE FIRST `V:` OF A TUNE IS ALWAYS A REAL SWITCH, EVEN NAMING THE DEFAULT.**
     * abcjs's guard is `if (multilineVars.currentVoice) { if (same index && staffNum)
     * return }` (`abc_parse_key_voice.js:526-531`) — the OUTER test is whether a voice has
     * ever been made current, and nothing sets it but a `V:`/`[V:`. So on
     * `CDEF|\` + `[V:1]GABc|` the implicit voice the first line wrote into is NOT
     * `currentVoice`, the `[V:1]` switches for real, and `tuneBuilder.setCurrentVoice`'s
     * scan finds line 0 already full and points past it. Probed: `had=NONE -> SWITCHING`.
     *
     * Ours seeds `currentVoiceId` with the default id, so a `[V:1]` looked like a repeat.
     */
    if (this.voiceSelected && id === this.currentVoiceId && this.voices.has(id)) return
    this.voiceSelected = true
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
      abcMeta: this.abcMeta,
      notes: this.notes,
      history: this.history,
      unalignedWords: this.unalignedWords,
      group: this.group,
      runningHead: this.runningHead,
      fieldRanges: this.fieldRanges,
      titleRanges: this.titleRanges,
    }
    return {
      metadata,
      key: this.key,
      clef: this.clef,
      meter: this.meter,
      tempo: resolveBeatUnit(this.tempo, this.meter),
      tempoSourceRange: this.tempoSourceRange,
      tempoInline: this.tempoInline,
      unitNoteLength: this.unitNoteLength,
      ...(this.firstLineKeyClef === null ? {} : { firstLineKeyClef: this.firstLineKeyClef }),
      voices: (() => {
        // **DECLARATION ORDER, STAMPED BEFORE `%%score` REORDERS THEM** — see
        // `Voice.declaredIndex`. `this.voices` is a Map, so its insertion order IS the
        // order the `V:` fields were read in.
        const declared = new Map([...this.voices.keys()].map((id, i) => [id, i]))
        const finished = this.orderedVoices().map((v) => {
          // The meter lives on the score, and a voice needs it to pad an empty overlay
          // layer to a full measure's silence.
          v.meterForOverlays = this.meter
          return { ...v.finish(), declaredIndex: declared.get(v.id) ?? 0 }
        })
        // A trailing number crosses to whichever voice is still on the next line.
        carryDanglingBarNumbers(finished)
        /**
         * **`%%barsperstaff N` FORCES A LINE BREAK EVERY N BARS**, and it is a PARSE-time
         * rewrite rather than a layout one: `cleanUp` runs `while (wrapMusicLines(lines,
         * barsperstaff))` until nothing more splits, and each pass pushes everything after
         * the Nth barline of a line onto the next (`tune-builder.js:63-68`, `:794-833`).
         *
         * Our model says the same thing with `Measure.startsSystem`, so the rewrite is a
         * count: every N measures from the start of a line, the next one opens a line. It
         * only ever SPLITS — a line the source already broke shorter stays short, which is
         * what abcjs's repeated pass does too.
         */
        if (this.barsPerStaff !== null && this.barsPerStaff > 0) {
          const per = this.barsPerStaff
          for (const v of finished) {
            let bars = 0
            const measures = v.measures.map((m, i) => {
              if (i === 0 || m.startsSystem === true) bars = 0
              bars += 1
              if (bars > per && m.startsSystem !== true) {
                bars = 1
                // …**AND THE LINE IT OPENS REPRINTS THE METER**, because abcjs's copy of
                // the line carries `staff.meter` — see `Measure.wrappedLine`.
                return { ...m, startsSystem: true, wrappedLine: true as const }
              }
              return m
            })
            ;(v as { measures: readonly Measure[] }).measures = measures
          }
        }
        return finished
      })(),
      staves: this.resolvedStaves(),
      staffSep: this.staffSep,
      musicSpace: this.musicSpace,
      measurements: this.measurements,
      titleLeft: this.titleLeft,
      bagpipes: this.bagpipes,
      flatBeams: this.flatBeams,
      graceSlurs: this.graceSlurs,
      newPage: this.newPage,
      newPageAt: this.newPageAt,
      partsBox: this.partsBox,
      jazzChords: this.jazzChords,
      keywarn: this.keywarn,
      percMap: this.percMap,
      drumMap: this.drumMap,
      midi: this.midi,
      formattingOrder: this.formattingOrder,
      stretchLast: this.stretchLast,
      staffWidth: this.staffWidth,
      scale: this.scale,
      maxStaves: this.maxStaves,
      sysStaffSep: this.sysStaffSep,
      textAbove: this.textAbove,
      unreadable: this.unreadable,
      // …AND THE BLOCKS STILL WAITING FOR A SYSTEM THAT NEVER CAME. A mid-tune `T:` or
      // `%%text` moves to `pendingTextBefore` at the next system start; when the tune ends
      // before one, it sat there and was DRAWN NOWHERE. `visual-mouse-click-01`'s
      // `T:Inserted subtitle` vanished outright, and so did 23.175px of page.
      textBelow: [...this.textBelow, ...this.pendingTextBefore.blocks],
      fonts: this.fonts,
      headerFonts: this.headerFonts ?? this.fonts,
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
  /** The `%%begintext` line's own start — abcjs's `iChar` does not advance inside a block. */
  private textBlockStart = 0
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

  private warn(
    code: string,
    message: string,
    range: SourceRange | null,
    /** Where inside `range` the caret goes, when the text cannot say — see `Diagnostic`. */
    column?: number,
  ): void {
    this.diagnostics.push({
      code,
      severity: 'warning',
      message,
      range,
      ...(column === undefined ? {} : { column }),
    })
  }

  private info(code: string, message: string, range: SourceRange | null): void {
    this.diagnostics.push({ code, severity: 'info', message, range })
  }

  private flush(): void {
    if (this.builder && !this.builder.isEmpty) {
      // **`%%visualTranspose` IS APPLIED TO THE FINISHED SCORE**, not woven through the
      // parse. abcjs transposes as it reads, but its `accidentalChange` is written against
      // the ORIGINAL and TARGET key signatures explicitly rather than against running
      // state, so the two are the same transform in different places — and this one cannot
      // leak into a tune that did not ask for it.
      // **THE HOST'S `visualTranspose` AND THE DIRECTIVE ARE THE SAME KNOB** — abcjs sets
      // `multilineVars.globalTranspose` from either (`abc_parse.js:529-536`,
      // `abc_parse_directive.js:1206-1212`), and its own test helper checks that by
      // writing the directive into the string. The directive wins where both are given,
      // because it is read later.
      const steps = this.builder.visualTranspose || HOST_TRANSPOSE
      this.scores.push(visualTranspose(this.builder.finish(), steps))
    }
    this.builder = null
  }

  /** One `FreeText` for the whole `%%begintext` block, above the music or below it. */
  private closeTextBlock(at: number): void {
    if (this.textBlock.length === 0) return
    const builder = this.ensureScore(at)
    const target = builder.voice.isEmpty ? builder.textAbove : builder.textBelow
    /**
     * **abcjs MEASURES THE BLOCK FROM ITS `%%endtext` LINE AND ADDS ITS OWN TEXT'S
     * LENGTH**, not the source's — `endChar: iChar + textBlock.length + 7`
     * (`abc_parse_directive.js:964`), where the `+ 7` is `"%%text "` and the end is a
     * LENGTH rather than an offset into the source.
     *
     * ⚠️ **AND `iChar` IS THE CLOSING LINE'S, NOT THE OPENING ONE'S.** The note here said
     * "still the opening directive's" — `tokenizer.nextLine()` advances it once per line
     * the block swallows, so by the time `addText` runs it points at `%%endtext`. abcjs's
     * own answer for `visual-misc-09` is 57…65 where the `%%begintext` line starts at 42.
     */
    target.push({
      lines: this.textBlock,
      align: 'left',
      fromBlock: true,
      sourceRange: sourceRange(
        at,
        at + this.textBlock.reduce((n, l) => n + l.length + 1, 0) + 7,
      ),
    })
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
      this.textBlockStart = start
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
      line = line.slice(0, comment)
    }
    // **AND THE TRAILING-WHITESPACE STRIP IS UNCONDITIONAL** — `line.replace(/\s+$/, '')`
    // is its own statement after the comment cut, not part of that branch
    // (`abc_parse.js:408-411`). We ran it only when a `%` was found, so a field line
    // written with a trailing space carried it in its span: `T:20. Subtitles, The ` gave
    // `metaTextInfo.title` 4…25 where abcjs gives 4…24. It is the same `end` every field
    // and every music element takes its offsets from.
    const trimmed = line.replace(/\s+$/, '')
    end -= line.length - trimmed.length
    line = trimmed
    if (line.length === 0) return

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
        /**
         * …**AND abcjs SAYS SO OUT LOUD**: `warn("This font style doesn't support \"box\"",
         * str, position)` where `str` is the directive's BODY and `position` is 0
         * (`abc_parse_directive.js:230-234`, `:262-266`) — so the warning underlines the
         * font's own first letter, not the word `box`. Measured on `visual-options-01-fonts`,
         * which trips it seven times.
         */
        if (!boxable(type) && /(^|\s)box(\s|$)/.test(fontDirective[2]))
          this.warn(
            'font-box-unsupported',
            `${type} does not support box`,
            // The BODY's own start: it runs to the end of the directive, so `end` less
            // its length is where it begins — `%%` and any space after it excluded.
            sourceRange(end - fontDirective[0].length, end),
          )
        builder.fonts[type] = font
        /**
         * …**AND A CHANGE MADE AFTER THE LINE OPENED IS CARRIED BY THE ELEMENTS.**
         * `addFormattingOptions` reads `multilineVars.<font>` — the RUNNING value — at the
         * moment each element is appended (`abc_parse.js:120-138`), so `C D [I:vocalfont
         * …] E F` stamps `fonts` on `E` and `F` and not on `C` and `D`. The line-level
         * delta cannot say that: a `%%` directive owns a line, so it was the only shape
         * either corpus had, and the projection carried a `ponytail:` predicting exactly
         * this. See `MusicEvent.runningFonts`.
         */
        if (builder.lineOpen) builder.midLineFonts = { ...builder.fonts }
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
      target.push({
        lines: [decodeTextString((freeText[1] ?? '').trim())],
        align: 'left',
        sourceRange: sourceRange(start, end),
      })
      return
    }
    // `%%sep` — a horizontal rule as a LINE of its own, with a space above and below. All
    // three numbers are POINTS, each `Math.round`ed (`tune-builder.js:309`), and a bare
    // `%%sep` is 14 / 14 / 85. The rule costs no height: `drawSeparator` paints at the
    // cursor and moves nothing, so the line is worth exactly `above + below`.
    // `%%header` / `%%footer` — a three-part running head, `left \t center \t right`,
    // drawn only when printing (`top-text.js:6-14`, `bottom-text.js:83-92`). abcjs records
    // it with `addMetaTextObj` (`abc_parse_directive.js:1183`), so it has a `metaTextInfo`
    // entry whether or not the media ever draws it. The TEXT is unmodelled — the rows are
    // print-only and no gate reads them yet — the POSITION is not.
    const headFoot = /^(header|footer)\b\s*(.*)$/.exec(body)
    if (headFoot?.[1] !== undefined) {
      /**
       * **THE PARTS ARE TAB-SEPARATED AND THE COUNT DECIDES WHICH SLOTS THEY FILL** — one
       * gives the CENTRE alone, two give left and centre, three or more take the first three
       * (`abc_parse_directive.js:1166-1181`). A surrounding pair of quotes is stripped, and
       * the string is `getMeat`ed first, which trims both ends.
       */
      const meat = (headFoot[2] ?? '').replace(/%.*$/, '').trim()
      const bare =
        meat.length > 1 && meat.startsWith('"') && meat.endsWith('"')
          ? meat.slice(1, -1)
          : meat
      const parts = bare.split('\t')
      const head: RunningHead =
        parts.length === 1
          ? { left: '', center: parts[0] ?? '', right: '' }
          : parts.length === 2
            ? { left: parts[0] ?? '', center: parts[1] ?? '', right: '' }
            : { left: parts[0] ?? '', center: parts[1] ?? '', right: parts[2] ?? '' }
      this.ensureScore(start).runningHead[headFoot[1] as 'header' | 'footer'] = head
      // **THE SPAN IS THE LINE WITHOUT ITS `%%`** — `iChar + str.length`, where `str` is
      // `addDirective`'s argument, `line.substring(2)` (`abc_parse.js:403`). So the range
      // STARTS at the `%` and is two characters SHORT of the line's end.
      this.ensureScore(start).recordField(headFoot[1], sourceRange(start, end - 2))
      return
    }
    /**
     * `%%abc-copyright` and its four siblings. **THE SUB-COMMAND IS SPLIT OFF THE FIRST
     * TOKEN AND THE REST IS JOINED BACK WITH SINGLE SPACES** — `restOfString.split(' ')`,
     * `arr.shift()`, `arr.join(' ')` — so a run of spaces inside the value collapses; and
     * the span is `iChar … iChar + restOfString.length + 5`, the five being `%%abc`
     * (`abc_parse_directive.js:1150-1161`). Anything else after `%%abc` is an unknown
     * directive rather than a value.
     */
    const abcMeta = /^abc(-copyright|-creator|-edited-by|-version|-charset)\b\s*(.*)$/.exec(body)
    if (abcMeta !== null) {
      const b = this.ensureScore(start)
      b.abcMeta[`abc${abcMeta[1]}`] = (abcMeta[2] ?? '').split(' ').filter((w) => w !== '').join(' ')
      /**
       * ⚠️ **AND `restOfString` IS WHAT FOLLOWS `%%abc`, NOT THE WHOLE DIRECTIVE.** The
       * span is `iChar … iChar + restOfString.length + 5` where the five is `%%abc`
       * itself, so the `abc` is counted ONCE and our `body` — which carries it — is three
       * characters long. Measured by `metaTextInfo`, whose oracle is abcjs's own object.
       */
      b.recordField(`abc${abcMeta[1]}`, sourceRange(start, start + body.length + 2))
      return
    }
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
      /**
       * ⚠️ **THE SPAN IS THE LINE'S START PLUS THE LENGTH OF A DIFFERENT STRING.**
       * `{startChar: multilineVars.iChar, endChar: multilineVars.iChar + restOfString.length}`
       * (`abc_parse_directive.js:899`), where `iChar` is at the first `%` and
       * `restOfString` is `str.substring(str.indexOf(tokens[0].token) + …)` — the ARGUMENT
       * TAIL with its leading space gone. So `%%sep 0.4cm 0.4cm 6cm` at 562 ends at 577,
       * fifteen characters in, which is neither the line's end nor the arguments' own
       * position. Instrumented: `SEP iChar=562 rest="0.4cm 0.4cm 6cm" len=15`.
       *
       * The no-argument form is a literal `iChar + 5` — the length of `%%sep`.
       */
      target.push({
        lines: [],
        align: 'center',
        role: 'separator',
        sourceRange: sourceRange(start, start + (args === '' ? 5 : args.length)),
        separator: {
          above: Math.round(above ?? 14),
          below: Math.round(below ?? 14),
          length: Math.round(length ?? 85),
        },
      })
      return
    }
    /**
     * **`%%vskip n` — BLANK SPACE ABOVE THE NEXT LINE.** `addSpacing` parks the number and
     * `pushLine` stamps it onto whatever line is pushed next
     * (`abc_parse_directive.js:872-877`, `tune-builder.js:304-306`, `:906-911`). abcjs
     * ROUNDS the measurement, so `%%vskip 40` is 40 and `%%vskip 1cm` is 38.
     *
     * Found by the Phase 0 sweep: in abcjs's own tests, in NEITHER corpus, and it moves
     * the whole page — see `Measure.vskip`.
     */
    /**
     * `%%keywarn 0|1` — see `Score.keywarn`. **NOT `true`/`false`**: abcjs requires the
     * integer 0 or 1 and drops the directive otherwise
     * (`abc_parse_directive.js:941-946`), so `%%keywarn false` is a no-op.
     */
    /**
     * `%%visualTranspose n` — every pitch moved AT PARSE TIME, key signature and spelling
     * with it (`abc_parse_directive.js:1206-1212`). abcjs warns when the number is missing
     * and otherwise sets `multilineVars.globalTranspose`; the transform itself is
     * `src/parser/visual-transpose.ts`.
     */
    const visual = /^visualtranspose\s+(-?\d+)\s*$/i.exec(body)
    if (visual?.[1] !== undefined) {
      if (this.builder) this.builder.visualTranspose = Number.parseInt(visual[1], 10)
      return
    }
    const keywarn = /^keywarn\s+([01])\s*$/.exec(body)
    if (keywarn?.[1] !== undefined) {
      if (this.builder) this.builder.keywarn = keywarn[1] === '1'
      return
    }
    /**
     * …**AND ANYTHING ELSE AFTER `%%keywarn` IS A WARNING, NOT A SILENT NO-OP.** abcjs
     * RETURNS a message from the directive parser — `'Directive ' + cmd + ' requires 0 or 1
     * as a parameter.'` (`abc_parse_directive.js:941-946`) — and the caller warns with the
     * whole `%%` line at column 2, which is where every returned message lands.
     */
    if (/^keywarn(\s|$)/.test(body)) {
      this.warn(
        'directive-parameter',
        'keywarn requires 0 or 1',
        sourceRange(start, end),
      )
      return
    }
    const vskip = /^vskip\s+(-?\d+(?:\.\d+)?)\s*(cm|in|pt)?/.exec(body)
    if (vskip?.[1] !== undefined) {
      const n = Number.parseFloat(vskip[1])
      const unit = vskip[2]
      // **THE MEASUREMENT IS IN POINTS, AND `cm` GOES THROUGH INCHES** —
      // `case 'cm': value = parseFloat(num)/2.54*72` and `case 'in': value = num*72`,
      // while `pt` and `px` are taken as written (`abc_tokenizer.js:776-782`). So
      // `%%vskip 1cm` is 28px and not 38: abcjs converts to POINTS and then spends them as
      // pixels, which is a conflation and is the contract.
      const px = unit === 'cm' ? (n / 2.54) * 72 : unit === 'in' ? n * 72 : n
      // The directive can stand in the HEADER, before any voice exists, and abcjs parks it
      // on the TUNE either way — so it goes on the score's shared box, not the voice's.
      if (this.builder) this.builder.pendingVskip.value = Math.round(px)
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
      builder.noteFormatting(staffSep[1] === 'staffsep' ? 'staffsep' : 'sysstaffsep')
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
        const b = this.ensureScore(start)
        b.musicSpace = (px * 4) / 3
        b.noteFormatting('musicspace')
        return
      }
    }
    /**
     * **THE OTHER `oneParameterMeasurement` DIRECTIVES**, which abcjs reads with ONE
     * function and stores by their own name (`abc_parse_directive.js:417-423`, `:830-853`).
     * Measured through abcjs before any was written: of the forty-one directives its switch
     * names and this parser did not, only TEN move its output on a plain tune, and these
     * seven are the measurements among them.
     */
    const measured =
      /^(topmargin|botmargin|leftmargin|rightmargin|titlespace|vocalspace|stafftopmargin|botspace|composerspace|indent|linesep|partsspace|pageheight|pagewidth|subtitlespace|systemsep|textspace|topspace|wordsspace)\s+(\S+)\s*$/.exec(
        body,
      )
    if (measured?.[1] !== undefined && measured[2] !== undefined) {
      const points = parseMeasurement(measured[2])
      if (points !== null) {
        const b = this.ensureScore(start)
        /**
         * ⚠️ **A MARGIN IS USED RAW AND A SPACING TAKES THE `4 / 3`.** `setPaddingVariable`
         * assigns `formatting[key]` straight onto `renderer.padding`
         * (`write/renderer.js:55-73`) where every `spacing.*` line beside it multiplies
         * (`:140-170`) — so `%%topmargin 40` is FORTY PIXELS and `%%vocalspace 30` is
         * forty. Measured through abcjs on one tune: the margin moved the page by `40 - 15`
         * and the spacing by `30 * 4/3`. Reading both as points put every margin 13.33px
         * out.
         */
        const margin = measured[1].endsWith('margin') && measured[1] !== 'stafftopmargin'
        b.measurements[measured[1]] = margin ? points : (points * 4) / 3
        b.noteFormatting(measured[1])
        return
      }
    }
    /**
     * The three FLAG directives among the ten that move abcjs's output: `%%titleleft` and
     * `%%bagpipes` are `tune.formatting.<name> = true` outright
     * (`abc_parse_directive.js:789`, `:821`), and `%%newpage` pushes a LINE
     * (`tune-builder.js:306-308`) whose only cost is the `staffSeparation` a non-music line
     * before the first staff spends.
     */
    const flag = /^(titleleft|bagpipes|flatbeams)\b/.exec(body)
    if (flag?.[1] !== undefined) {
      const b = this.ensureScore(start)
      if (flag[1] === 'titleleft') b.titleLeft = true
      else if (flag[1] === 'bagpipes') b.bagpipes = true
      else b.flatBeams = true
      b.noteFormatting(flag[1])
      return
    }
    /**
     * `%%graceslurs 0|1|true|false` — **ONE PARAMETER, AND ANYTHING ELSE IS A WARNING**
     * (`abc_parse_directive.js:796-805`). It is the only one of these flags that can be
     * turned OFF, which is why it is a tri-state on the model rather than a `true`.
     */
    const graceSlurs = /^graceslurs\s+(\S+)\s*$/.exec(body)
    if (graceSlurs?.[1] !== undefined) {
      const arg = graceSlurs[1]
      if (arg === '0' || arg === 'false' || arg === '1' || arg === 'true') {
        const b = this.ensureScore(start)
        b.graceSlurs = arg === '1' || arg === 'true'
        b.noteFormatting('graceSlurs')
      }
      return
    }
    const barsPerStaff = /^barsperstaff\s+(\d+)\s*$/.exec(body)
    if (barsPerStaff?.[1] !== undefined) {
      const b = this.ensureScore(start)
      b.barsPerStaff = Number.parseInt(barsPerStaff[1], 10)
      b.noteFormatting('barsperstaff')
      return
    }
    const newPage = /^newpage(?:\s+(-?\d+))?\s*$/.exec(body)
    if (newPage !== null) {
      // `pgNum.digits === 0 ? -1 : pgNum.value` — a bare `%%newpage` is -1.
      const b = this.ensureScore(start)
      b.newPage = newPage[1] === undefined ? -1 : Number.parseInt(newPage[1], 10)
      b.newPageAt = start
      return
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
        const b = this.ensureScore(start)
        b.stretchLast = value
        b.noteFormatting('stretchlast')
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
      const b = this.ensureScore(start)
      b.staffWidth = Number.parseFloat(staffWidth[1]) * 1.33
      b.noteFormatting('staffwidth')
      return
    }
    /**
     * `%%scale` — see `Score.scale`. **A NUMBER, AND `NaN` OR `0` IS NO DIRECTIVE AT
     * ALL** (`abc_parse_directive.js:336-339`), which is how a bare `%%scale` is ignored
     * rather than making the page infinite.
     */
    const scale = /^scale\s+(\S+)\s*$/.exec(body)
    if (scale?.[1] !== undefined) {
      const num = Number.parseFloat(scale[1])
      if (!Number.isNaN(num) && num !== 0) {
        const b = this.ensureScore(start)
        b.scale = num
        b.noteFormatting('scale')
      }
      return
    }
    // `%%maxStaves` — an incipit. abcjs matches the directive case-insensitively like
    // every other, so `%%maxStaves` and `%%maxstaves` are the same thing.
    const maxStaves = /^maxstaves\s+(\d+)\s*$/i.exec(body)
    if (maxStaves?.[1] !== undefined) {
      const b = this.ensureScore(start)
      b.maxStaves = Number.parseInt(maxStaves[1], 10)
      // **THE KEY IS CAMEL-CASE WHERE THE DIRECTIVE IS NOT** — `%%maxstaves` writes
      // `tune.formatting.maxStaves`, the only one of the nine that renames itself.
      b.noteFormatting('maxStaves')
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
        const b = this.ensureScore(start)
        b.percMap[percMap[1]] = {
          sound,
          ...(percMap[3] === undefined ? {} : { noteHead: percMap[3] }),
        }
        b.noteFormatting('percmap')
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
     * LENGTH rather than by a schema.
     *
     * ⚠️ **AND ITS ARITY TABLE IS NOT ONLY WARNINGS.** That is what the note here used to
     * say, and enumerating abcjs's own eleven `midiCmdParam*` lists against this parser
     * denied it on two arms: `midiCmdParam1String` pushes `midi[0].token` — the RAW TEXT,
     * so `%%MIDI ptstress 1` is `["1"]` and not `[1]` — and `midiCmdParamFraction` pushes
     * TWO INTEGERS off a `n / m` triple, so `%%MIDI grace 1/4` is `[1, 4]` and not
     * `["1/4"]`. Both are VALUES a host reads off `tune.formatting.midi`, and the rest of
     * the table really is warnings.
     */
    const midiDirective = /^MIDI\s+(\S+)\s*(.*)$/.exec(body)
    if (midiDirective?.[1] !== undefined) {
      const cmd = midiDirective[1]
      const rest = midiDirective[2] ?? ''
      /**
       * ⚠️ **`%%MIDI` TOKENISES WITH `alphaUntilWhiteSpace`, WHICH IS WHY `1/4` SPLITS AND
       * `d2z/d/d` DOES NOT.** `tokenize(restOfString, 0, len, true)`
       * (`abc_parse_directive.js:1188`): a token that STARTS WITH A LETTER runs to the next
       * whitespace whatever is inside it, and only a token starting with a digit ends at
       * its digits, leaving the `/` as a `punct` of its own (`abc_tokenizer.js`, the
       * `alphaUntilWhiteSpace` arm).
       *
       * Splitting on `/` unconditionally is what a first cut did, and `flatten-drum`'s
       * `%%MIDI drum d2z/d/d 35 38 38 100 50 50` denied it — the pattern became three
       * tokens and the third line's drum track lost its beats.
       */
      const tokens = rest
        .split(/\s+/)
        .filter((t) => t !== '')
        .flatMap((word) =>
          /^[A-Za-z]/.test(word) ? [word] : (word.match(/-?\d+(?:\.\d+)?|./g) ?? []),
        )
      const params: (string | number)[] =
        MIDI_STRING_PARAM.has(cmd) && tokens.length === 1
          ? // **THE RAW TOKEN, NOT ITS VALUE** — `midi_params.push(midi[0].token)`
            // (`:550`). `%%MIDI ptstress 1` publishes the STRING `"1"`.
            [tokens[0] as string]
          : MIDI_FRACTION_PARAM.has(cmd) &&
              tokens.length === 3 &&
              tokens[1] === '/' &&
              /^-?\d+$/.test(tokens[0] ?? '') &&
              /^-?\d+$/.test(tokens[2] ?? '')
            ? // **A FRACTION IS TWO INTEGERS** — `push(midi[0].intt); push(midi[2].intt)`
              // (`:615-616`), the `/` dropped.
              [Number.parseInt(tokens[0] ?? '', 10), Number.parseInt(tokens[2] ?? '', 10)]
            : tokens.map((t) => (/^-?\d+$/.test(t) ? Number.parseInt(t, 10) : t))
      /**
       * **A ONE-PARAMETER `%%MIDI` COMMAND WITH THE WRONG COUNT IS A WARNING**, and the
       * text it points into is the REST OF THE STRING — `warn("Expected one parameter in
       * MIDI " + midi_cmd, restOfString, 0)` (`abc_parse_directive.js:546-554`), which for
       * a bare `%%MIDI gchord` is the word `gchord` alone, underlined at its first letter.
       * The three string-parameter commands are abcjs's own list (`:480-484`).
       */
      if (MIDI_STRING_PARAM.has(cmd) && params.length !== 1)
        this.warn(
          'midi-one-parameter',
          `${cmd} expects one parameter`,
          sourceRange(end - (midiDirective[0].length - 'MIDI '.length), end),
        )
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
        builder.noteFormatting('midi')
        return
      }
      // **A `%%MIDI` REACHES `formatting.midi` ONLY BEFORE THE MUSIC.**
      // `if (hasBeginMusic()) appendElement('midi', …) else formatting['midi'][cmd] = params`
      // (`abc_parse_directive.js:718-724`) — the two are exclusive, which is the same split
      // `addMidiCommand` already makes here.
      if (builder.beganMusic) builder.voice.addMidiCommand(cmd, params)
      else {
        builder.midi[cmd] = params
        builder.noteFormatting('midi')
      }
      return
    }
    /**
     * **`%%printtempo 0` / `false` — THE `Q:` MARK IS NOT DRAWN.**
     * `addMultilineVarBool('printTempo', …)` takes `true`/`false` OR abcjs's
     * `oneParameter` `0`/`1` and reduces the latter with `=== 1`
     * (`abc_parse_directive.js:437-446`, `:917-920`). Running state, read at each `Q:`, so
     * one written between two of them governs only the second — see `Tempo.suppress`.
     */
    const printTempo = /^printtempo\s+(\S+)\s*$/.exec(body)
    if (printTempo?.[1] !== undefined) {
      const word = printTempo[1]
      if (word === 'true' || word === 'false')
        this.ensureScore(start).printTempo = word === 'true'
      else if (word === '0' || word === '1') this.ensureScore(start).printTempo = word === '1'
      return
    }
    /**
     * **THE FIVE POSITION DIRECTIVES** — `%%vocal`, `%%dynamic`, `%%gchord`, `%%ornament`
     * and `%%volume`, each `addMultilineVarOneParamChoice(<x>Position, cmd, tokens,
     * positionChoices)` (`abc_parse_directive.js:824-828`). Running state on the tune,
     * stamped onto every note element appended after it — see `ScoreBuilder.positions`.
     *
     * ⚠️ **THEY WERE SWEPT ONCE AND CALLED "SAME".** The 2026-08-22 directive enumeration
     * rendered one control with and without each of abcjs's 41 absent directives; these
     * five moved nothing, because that control had no lyric, no chord symbol, no dynamic
     * and no ornament — the only things they position. A control carrying all four makes
     * NINE of their ten forms move abcjs's own output. **A "SAME" IS ONLY AS GOOD AS THE
     * SHAPE THAT ASKED**, and the tenth (`%%vocal below`) is the default, so it is the one
     * rung that genuinely cannot move.
     */
    const position = /^(vocal|dynamic|gchord|ornament|volume)\s+(\S+)\s*$/.exec(body)
    const positionKind = POSITION_DIRECTIVES[position?.[1] ?? '']
    if (positionKind !== undefined && POSITION_CHOICES.has(position?.[2] ?? '')) {
      this.ensureScore(start).positions[positionKind] = position?.[2] as ElementPosition
      return
    }
    // `%%jazzchords` — chord modifiers and bass notes as small sub/superscripts. A bare
    // switch with no argument and no way back: `abc_parse_directive.js:791` only ever
    // assigns `true`.
    if (/^jazzchords\b/.test(body)) {
      const b = this.ensureScore(start)
      b.jazzChords = true
      b.noteFormatting('jazzchords')
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
          // …**AND IT GOES THROUGH `parseFontChangeLine` LIKE THE TITLE DOES** — see
          // `FreeTextBlock.rich`. `setTitle` splits the fonts BEFORE it branches.
          const rich = parseFontChangeLine(theReverser(decodeTextString(value)), builder.setfont)
          builder.textBelow.push({
            lines: [theReverser(decodeTextString(value))],
            align: 'center',
            role: 'subtitle',
            rich,
            sourceRange: range,
          })
        } else {
          // `T: C: O: A: P:` all run through `parseFontChangeLine`
          // (`abc_parse_header.js:484-541`), so any of them may come back as phrases.
          builder.titles.push(
            parseFontChangeLine(theReverser(decodeTextString(value)), builder.setfont),
          )
          builder.titleRanges.push(range)
        }
        return
      case 'C':
        builder.composer = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('composer', range)
        return
      case 'R':
        builder.rhythm = decodeTextString(value)
        builder.recordField('rhythm', range)
        return
      case 'O':
        builder.origin = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('origin', range)
        return
      // `A:` — the author of the words, a row of its own in `composerfont`.
      case 'A':
        builder.author = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('author', range)
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
        builder.recordField('book', range)
        return
      case 'S':
        builder.source = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('source', range)
        return
      case 'D':
        builder.discography = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('discography', range)
        return
      case 'Z':
        builder.transcription = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('transcription', range)
        return
      case 'N':
        builder.notes.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        builder.recordField('notes', range)
        return
      case 'H':
        builder.history.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        builder.recordField('history', range)
        return
      case 'W':
        builder.unalignedWords.push(parseFontChangeLine(decodeTextString(value), builder.setfont))
        builder.recordField('unalignedWords', range)
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
          builder.recordField('partOrder', range)
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
          builder.tempo = parseTempo(value, builder.printTempo === false)
          builder.tempoSourceRange = range
          builder.tempoInline = inline
          if (inline && builder.bodyStarted)
            builder.voice.setTempoChange(parseTempo(value, builder.printTempo === false), range)
        } else if (builder.bodyStarted)
          builder.voice.setTempoChange(parseTempo(value, builder.printTempo === false), range)
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
        if (builder.bodyStarted) {
          builder.selectVoice(id)
          // …**AND AN INLINE ONE OPENS A LINE EVEN FOR THE VOICE ALREADY CURRENT**, unless
          // this line continues the one above it. abcjs's second mechanism — see
          // `VoiceBuilder.inlineVoiceField`, which is NOT the same as `switchedTo`.
          if (inline) builder.voice.inlineVoiceField(this.lineIsContinuation)
          builder.beganMusic = true
        }
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
        /**
         * **`V:… style=` IS THE VOICE'S STANDING NOTEHEAD SHAPE** — `createVoice` appends
         * a `style` element carrying `params.style` at the head of every line of that
         * voice (`tune-builder.js:979-980`), which the engraver reads as `this.style` for
         * everything after. The comment above this arm has claimed `style=` was read since
         * the arm was written and it was not: `V:1 style=x` drew ordinary heads, 4705
         * bytes short of abcjs's.
         *
         * The same `setNoteStyle` the `K:` arm calls, and NOT inline: the element is
         * appended at the line's head, so it applies to the line the field opens.
         *
         * ⚠️ **AND IN abcjs IT LEAKS INTO EVERY VOICE ENGRAVED AFTER IT.** `this.style` is
         * plain engraver state: `pushCrossLineElems`/`popCrossLineElems` save and restore
         * the slurs, the ties, the endings, the COLOUR and the SCALE per voice, and not the
         * style (`abstract-engraver.js:92-107`). So a voice with no style of its own
         * inherits whatever the last one left. Measured on `[V:1]…\n[V:2 style=x]…` over two
         * lines: voice 2's x heads reach voice 1's SECOND line, and on `V:1 style=x` the
         * lower staff draws x heads it never asked for.
         *
         * ponytail: not reproduced. The leak is a running value in (line, staff, voice)
         * ENGRAVING order, and this parser resolves the style per voice at parse time —
         * where the source order is the engraving order only for interleaved `[V:…]` lines
         * and not for a tune written one whole voice at a time. Reproducing it means moving
         * the style out of `VoiceBuilder` and re-asserting it at each line head, which is
         * a model change, not a patch. A SINGLE-voice tune is byte-exact in all five
         * styles, which is what `abcts-voice-style.abc` gates; a multi-voice one is closer
         * than it was (24654 bytes against abcjs's 25020, from a 20315 baseline) and still
         * wrong.
         */
        const voiceStyle = styleModifier(value)
        if (voiceStyle !== null) builder.voiceFor(id).setNoteStyle(voiceStyle, false)
        /**
         * **`scale=` AND `cue=` ARE ONE VALUE** — `voiceScale`. `cue=on` is `0.6` and
         * ANYTHING ELSE IS `1` (`abc_parse_key_voice.js:809-815`), so `cue=off` declares a
         * scale rather than clearing one, which is why the two arms are ordered: a `cue=`
         * written after a `scale=` overrides it, exactly as abcjs's switch does.
         */
        const voiceScale = /(?:^|\s)scale=([\d.]+)/i.exec(value)?.[1]
        if (voiceScale !== undefined && Number.isFinite(Number(voiceScale)))
          builder.voiceFor(id).scale = Number(voiceScale)
        const cue = /(?:^|\s)cue=(\S+)/i.exec(value)?.[1]
        if (cue !== undefined) builder.voiceFor(id).scale = cue === 'on' ? 0.6 : 1
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
        /**
         * **A TOKEN THE MODIFIER SWITCH DOES NOT RECOGNISE IS A WARNING** — `K:cm` is no key
         * at all (`getKeyPitch`'s lowercase cases are COMMENTED OUT), C major drawn, and one
         * warning, which is why that fixture renders byte-identically while saying nothing.
         * `unknownKeyParameters` walks abcjs's own consumption to find them; see it.
         *
         * The text such a warning points into is the FIELD's VALUE — `cm` alone, not the
         * `K:cm` line — and `start` is the FIELD's own start, so the value begins two
         * characters in, past the `K:`. The COLUMN travels with the diagnostic because two
         * of them can stand on adjacent characters and neither is findable by its text.
         */
        const valueAt = start + 2
        for (const bad of unknownKeyParameters(content))
          this.warn(
            'unknown-parameter',
            `unknown parameter: ${bad.token}`,
            sourceRange(valueAt, valueAt + content.length),
            bad.column,
          )
        // `style=` rides on K: and sets the notehead shape for everything that follows,
        // until the next one — `[K: style=harmonic]`, then `[K: style=normal]` to end it.
        // It is voice state, not a property of the K: field.
        const keyStyle = styleModifier(value)
        if (keyStyle !== null) builder.voice.setNoteStyle(keyStyle, inline)
        /**
         * **THE FIRST `K:` OF A TUNE IS NEVER A KEY CHANGE, WHATEVER STOOD ABOVE IT.**
         * abcjs's guard is `!multilineVars.is_in_header` (`abc_parse_header.js:509`), and
         * `is_in_header` is cleared by the `K:` ITSELF and by nothing else — where
         * `bodyStarted` is also set by MUSIC, which strict makes of a `+:` prose line.
         * `frere-jacques` is that tune: its prose stands above its `K:C`, and reading
         * `bodyStarted` here put a `keySignature` element in the stream that abcjs keeps
         * on the staff. The METER is the other way round and stays on `bodyStarted` —
         * abcjs's `M:` arm tests `hasBeginMusic()`, which the prose does satisfy.
         */
        if (builder.sawKey) {
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
          // A MID-TUNE CLEF. `K:C clef=bass` and `[K: bass]` both land here, and abcjs
          // prints the new clef where it stands AND at the head of every system after it.
          const midClef = parseClef(value)
          // …and an INLINE change is PITCHED for the field's own clef or for TREBLE, never
          // for the voice's — see `Measure.keyChangeClef`.
          if (hasKeySpec(value))
            builder.voice.setKeyChange(
              parseKey(value),
              range,
              inline ? (midClef ?? defaultClef) : undefined,
              inline,
              builder.keywarn,
            )
          if (midClef !== null) builder.voice.setClefChange(midClef, range, inline)
          // A MID-TUNE `K: octave=` is GLOBAL and takes effect from here. abcjs reads it
          // per note as the fallback under the voice's own `octave=`, so `parse-note-id-01`
          // — whose second half is written an octave lower on purpose — printed 27.1px
          // (seven steps, one octave) below abcjs's.
          const midOctave = octaveModifier(value)
          if (midOctave !== null) builder.keyOctave.value = midOctave
          return
        }
        // **AND AN UNPARSEABLE `K:` LEAVES THE KEY IN FORCE**, exactly as the mid-tune arm
        // above already did: abcjs's `getKeyPitch` finds nothing in `cm`, a bare `K:` or a
        // `K: style=harmonic`, so `multilineVars.key` is never written and stays what it
        // was — `none` at the head of a tune, and the previous key after one. This side
        // reset it to C major, which is a DIFFERENT key that happens to print the same.
        if (hasKeySpec(value)) builder.key = parseKey(value)
        builder.keySourceRange = range
        // `K:C bass` sets the tune's clef; a `V:… clef=` still overrides it per voice.
        builder.clef = clefWith(builder.clef, value)
        /**
         * **`transpose=` RIDES ON `K:` TOO, AND IT IS THE SAME SWITCH.** abcjs's clef
         * modifiers are read by ONE function for both fields, and its `case "transpose"`
         * writes `multilineVars.clef.transpose` outright (`abc_parse_key_voice.js:411-418`)
         * — which is why a `K:C transpose=2` staff reports `clef.transpose: 2` where the
         * page is unmoved: the renderer never reads it and only the synth does.
         *
         * ponytail: onto the voice in force, which for a header `K:` is the implicit one.
         * A voice DECLARED after such a `K:` takes the clef's copy in abcjs (`:514-515`),
         * where here it would take its own default; nothing in either corpus writes that
         * pair, and `abcts-ledger-gaps` tune 4 is what named the field at all.
         */
        const keyShift = /\btranspose=\s*(-?\d+)/.exec(value)
        if (keyShift?.[1] !== undefined)
          builder.voiceFor(builder.lastVoiceId).transpose = Number.parseInt(keyShift[1], 10)
        const keyOctave = octaveModifier(value)
        if (keyOctave !== null) builder.keyOctave.value = keyOctave
        // …and the header's fonts are frozen here, which is `is_in_header` going false.
        builder.headerFonts ??= { ...builder.fonts }
        /**
         * …and so are the four CHANGING ones, which is `setRunningFont` — see
         * `runningLineFonts`.
         *
         * ⚠️ **SEEDED WITH THE DEFAULTS, NOT WITH WHAT WAS SET.** abcjs hands
         * `setRunningFont` `multilineVars.<type>`, which is initialised to the built-in
         * font at tune start and only then overwritten by a header directive
         * (`abc_parse.js:557-562`, `abc_parse_directive.js:23-31`) — so it is NEVER
         * undefined, and `setLineFont`'s `if (tune.runningFonts[type])` guard passes from
         * the first line onward.
         *
         * Ours seeded from `builder.fonts`, which holds an entry only for a font the
         * SOURCE set. A tune with no header font directive therefore had
         * `runningLineFonts.vocalfont` undefined, `takeLineFonts`' `was !== undefined`
         * test failed, and the FIRST `%%vocalfont` of the body produced no delta at all —
         * so the staff never published it. `abcts-model-gaps` tunes 6 and 7 are exactly
         * that shape and nothing else in either corpus is.
         */
        builder.runningLineFonts ??= { ...DEFAULT_CHANGING_FONTS, ...builder.fonts }
        builder.bodyStarted = true // K: ends the header.
        builder.sawKey = true // …and this is abcjs's `is_in_header`, which ONLY a `K:` clears.
        return
      }
      // `G:` — the tune's GROUP. abcjs records it in `metaText`/`metaTextInfo`
      // (`abc_parse_header.js:469`) and neither `TopText` nor `BottomText` ever reads it,
      // so it is a position with no ink. The range is recorded because `metaTextInfo` is
      // where a host looks for it; the TEXT is not held, which is the same gap `metaText`
      // has for every field but `title`.
      case 'G':
        builder.group = parseFontChangeLine(decodeTextString(value), builder.setfont)
        builder.recordField('group', range)
        return
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
  /**
   * abcjs's `this.lineContinuation` as the CURRENT music line is scanned — whether this
   * line continues the one above it. Read by the inline `[V:` arm; see `switchedTo`.
   */
  private lineIsContinuation = false
  /** `%%continueall` — every music line continues (`abc_parse_directive.js:966`). */
  private continueAll = false

  private scanMusic(start: number, end: number, continued = false): void {
    // ⚠️ **AN INLINE `[V:` OPENS A LINE ON A NON-CONTINUED LINE, WHATEVER THE VOICE.** See
    // `VoiceBuilder.switchedTo`: abcjs's gate is `delayStartNewLine && !this.lineContinuation`
    // and the flag is set by ANY inline `[V:`, a repeat of the current voice included
    // (`abc_parse_music.js:151-159`). This is the half of it the field arm needs.
    this.lineIsContinuation = continued
    const builder = this.ensureScore(start)
    // Music ENDS the header, not just `K:`. Normally the two coincide; they come apart
    // when a line before the `K:` is scanned as music, which strict mode does to `+:`
    // because abcjs does. abcjs agrees: `frere-jacques`'s `M:4/4` sits on line 14 and its
    // time signature is printed on system 3, so the `+:` prose on line 8 had already made
    // every later field a mid-tune one.
    builder.headerFonts ??= { ...builder.fonts }
    builder.bodyStarted = true
    // …AND `musicStarted` IS THE NARROWER ONE. `bodyStarted` is also set by `K:`, which
    // ends the HEADER; abcjs's `hasBeginMusic()` asks whether a MUSIC LINE has been read,
    // and that is a different moment. `%%MIDI program 3` written on the line after `K:C`
    // and before the first note is a TUNE setting to abcjs and a mid-tune element to
    // anything that reads `bodyStarted` — `flatten-decorations` is exactly that shape.
    builder.musicStarted = true
    builder.beganMusic = true
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
    /**
     * ⚠️ **AND THE SNAPSHOT IS TAKEN PAST THE LINE'S LEADING INLINE HEADERS, NOT AT ITS
     * FIRST CHARACTER.** abcjs's own comment says so where it calls `startNewLine`:
     * *"Wait until here to actually start the line because we know we're past the inline
     * statements"* (`abc_parse_music.js:143-157`) — the call sits in the ELSE arm of
     * `letter_to_inline_header`, so every `[…:…]` at the head of a line is read BEFORE the
     * line's `params` are built and every one after the first music element is read after.
     *
     * `[I:` routes straight to `addDirective` (`abc_parse_header.js:353`), so an inline
     * font directive is subject to exactly that split. Measured both ways on abcjs:
     * `C D [I:vocalfont Times-Roman 20] E F` draws its lyric at 17 and
     * `[I:vocalfont Times-Roman 20] C D E F` at 27, on the first line of a tune and on a
     * later one alike — 11.07px of page each. Ours took the snapshot before any token was
     * read, so the directive could only reach the NEXT line.
     *
     * A line of nothing but inline headers never reaches the else arm in abcjs either; it
     * fires here after the loop instead, because `beginMusicLine` is our own bookkeeping
     * and a line that opens none is not a shape abcjs has to model.
     */
    if (!continued) builder.voice.beginMusicLine()
    /**
     * ⚠️ **BOTH FONT SNAPSHOTS ARE DEFERRED, AND `beginMusicLine` IS NOT.** Deferring the
     * WHOLE block — the shape abcjs has — costs `flatten-treble-8` an octave on its first
     * note: `beginMusicLine` is OUR bookkeeping, not abcjs's, and the voice's clef is bound
     * by it, so running it past a `[V:1]` binds the wrong line's clef.
     *
     * The two that do move are `lineVocalFont` (what a lyric DRAWS in) and
     * `takeLineFonts` (what the STAFF publishes), and they move together because they read
     * the same running state. `takeLineFonts` also ADVANCES it, so it must run exactly once
     * per line — which is why this is a latch and not a re-take.
     */
    let lineFontsPending = !continued
    if (!continued) {
      builder.lineOpen = false
      builder.midLineFonts = null
    }
    const takeLineStartFonts = (): void => {
      if (!lineFontsPending) return
      lineFontsPending = false
      builder.lineVocalFont = builder.vocalFont
      builder.voice.setLineFonts(builder.takeLineFonts())
      builder.lineOpen = true
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

    // ABC beaming: adjacent notes shorter than a quarter beam together. A space,
    // barline, rest, longer note, overlay boundary or end of line breaks the run.
    let beamRun: number[] = []
    const closeBeamRun = (): void => {
      /**
       * **THE GROUP RUNS TO THE `endBeam`, AND THAT IS ALWAYS A NOTE.** `getBeamGroup`
       * walks consecutive `el_type === 'note'` elements — a REST is one — and stops at the
       * first with `endBeam` (`abstract-engraver.js:381-395`), which the tune-builder only
       * ever sets on a note. So a rest BETWEEN two beamed notes is in the group and a
       * trailing one is not, and the run needs ≥ 2 NOTES rather than ≥ 2 members.
       */
      const run = [...beamRun]
      while (run.length > 0 && voice().isRestAt(run[run.length - 1] ?? -1)) run.pop()
      // …and a LEADING one is not in it either: `getBeamGroup` only opens on an element
      // with `startBeam`, which the tune-builder sets on a note.
      while (run.length > 0 && voice().isRestAt(run[0] ?? -1)) run.shift()
      if (run.filter((index) => !voice().isRestAt(index)).length >= 2) {
        const group = builder.nextBeamGroup()
        for (const index of run) voice().setBeamGroup(index, group)
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
      // …**AND IT IS IN THE GROUP ALL THE SAME**, because `getBeamGroup` spans every
      // consecutive `note` element and a rest is one. See `closeBeamRun`, which trims the
      // trailing ones the `endBeam` never reaches.
      beamRun.push(voice().lastIndex)
      if (last.type === 'rest') return
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
          decorations: pending.decorations,
          decorationSourceRanges: pending.decorationSourceRanges,
          ...(pending.extraClass === undefined ? {} : { extraClass: pending.extraClass }),
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
          // …and the DECORATION's own, which is what abcjs puts on the element. See
          // `Note.styleMark`.
          ...(inline === null ? {} : { styleMark: inline }),
          slurStarts: pendingSlurStarts,
          ...(pendingSlurDotted ? { slurDotted: true } : {}),
          graceNotes: pendingGrace,
        }
        voice().push(attached)
      }
      voice().pendingBroken = null
      pending = noAttachments()
      pendingSlurStarts = 0
      pendingSlurDotted = false
      pendingGrace = []
      beamAfterEmit()
    }

    while (i < tokens.length) {
      const token = tokens[i] as Token
      // …**AND WHITESPACE DOES NOT END THE RUN**, because `letter_to_inline_header` opens
      // with `eatWhiteSpace` and consumes it as part of the attempt.
      if (token.kind !== 'inlineField' && token.kind !== 'whitespace') takeLineStartFonts()
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
            /**
             * **abcjs READS EXACTLY ONE CHARACTER OF MICROTONE, AND A SECOND IS A PARSE
             * FAILURE.** `getCoreNote`'s `case '0' … case '/'` arm turns state `sharp2`
             * into `quartersharp` and moves to `pitch` (`abc_parse_music.js:1195-1217`);
             * a further digit or `/` then falls through to `return null`, the note is
             * abandoned, and the letter alone is re-read. Measured through abcjs, one
             * variable a rung:
             *
             *     ^3G      accidentals.halfsharp, name `^/G`   — a QUARTERSHARP
             *     ^/G      the same
             *     ^3/2G    plain `G`, NO accidental
             *     ^/2G     plain `G`
             *     ^1/2G    plain `G`
             *     _3/2G    plain `G`
             *
             * So the VALUE of the fraction never matters — only how many characters it
             * spans. `S3-note-syntax-tune1` named its notehead `^G` where abcjs names it
             * `G`. Strict only: ABC 2.1's numeric microtone is real, and reading it is
             * what every other mode is for.
             */
            const first = tokens[i] as Token
            const chars = fraction.next - i === 1 ? first.length : 2
            if (isStrict(this.mode)) {
              if (chars > 1) {
                pendingAccidental = null
                pendingMicrotone = 0
              } else {
                pendingMicrotone = sign * 50
              }
            }
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
            if (isStrict(this.mode)) {
              // …and those characters belong to NOTHING, not to the note after them:
              // `getCoreNote` returned null and abcjs re-read the letter alone.
              if (accidentalStart !== null && chars > 1) {
                const upTo = (tokens[i] as Token | undefined)?.start ?? accidentalStart
                builder.unreadable.push(sourceRange(accidentalStart, upTo))
                /**
                 * …**AND abcjs WARNS ONCE PER CHARACTER.** The note is abandoned and the
                 * iteration re-reads from the accidental, so each of `^`, `3`, `/`, `2`
                 * reaches the `if (i === startI)` arm on its own
                 * (`abc_parse_music.js:579-581`). `S3-note-syntax` tune 1 raises four for
                 * `^3/2G` and eight for the pair of them.
                 */
                for (let at = accidentalStart; at < upTo; at += 1) {
                  const ch = this.src[at]
                  if (ch !== ' ' && ch !== '`')
                    this.warn(
                      'unknown-character',
                      'unknown character ignored',
                      sourceRange(at, at + 1),
                    )
                }
              }
              accidentalStart = null
            }
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
          // …AND IT IS CARRIED NOW, NOT DROPPED. The `ponytail:` above said the
          // `-classes` goldens were not gated; `svg-bytes-sibling` gates all 111 of them,
          // and `extra-class-classes` is the golden its own header names.
          if (name.startsWith('class=')) {
            pending.extraClass = name.slice(6)
            i++
            break
          }
          if (!isStrict(this.mode) || ABCJS_KNOWN_DECORATIONS.has(decorationLookupName(name))) {
            pending.decorations.push(name)
            pending.decorationSourceRanges.push(
              sourceRange(token.start, token.start + token.length),
            )
          } else {
            /**
             * …**AND A NAME abcjs DOES NOT KNOW IS A WARNING**, pointing at the opening
             * `!` — `warn("Unknown decoration: " + ret[1], line, i)`
             * (`abc_parse_music.js:828`). `S1-decorations` writes `!staccato!`, which is a
             * name abcjs has no entry for even though the SHORTHAND `.` is staccato.
             */
            this.warn(
              'unknown-decoration',
              `unknown decoration: ${name}`,
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
            // **AND IT BELONGS TO NO ELEMENT AT ALL.** abcjs's iteration appends nothing
            // and the next one opens past it, so `tune.lines` must not tile a span back
            // over it — a bare `#` in `^c# ^d#` is the measured case.
            //
            // **EXCEPT THE DOT OF A DOTTED SLUR OR TIE, WHICH IS INSIDE THE ELEMENT.**
            // `letter_to_accent`'s `case '.'` BREAKS out of its switch when a `(` or `-`
            // follows (`abc_parse_music.js:784-787`) — it returns no decoration, but the
            // iteration goes on to read the note, so `startI` is still the dot.
            // `S3-note-syntax` tune 22 has three, and each was worth four characters.
            if (!dotsAMark) {
              builder.unreadable.push(sourceRange(token.start, token.start + token.length))
              /**
               * …**AND abcjs SAYS SO**: `if (line[i] !== ' ' && line[i] !== '`')
               * warn("Unknown character ignored", line, i)` (`abc_parse_music.js:579-581`),
               * pointing at the character itself in its own source line. The two exceptions
               * are the two characters that mean nothing and are not errors.
               */
              const ch = this.src[token.start]
              /**
               * …**EXCEPT AN UNCLOSED `+`, WHICH IS A DECORATION ATTEMPT.** `case '!': case
               * '+':` share one branch, and `getBrackettedSubstring` gives up after
               * `maxErrorChars` (5) with whatever it read, so abcjs reports
               * `Unknown decoration: :bel` where a character-by-character reader would
               * report six unknown characters. See the lexer's own note on the six.
               */
              if (ch === '+' && token.length > 1)
                this.warn(
                  'unknown-decoration',
                  `unknown decoration: ${this.src.slice(token.start + 1, token.start + token.length - 1)}`,
                  sourceRange(token.start, token.start + token.length),
                )
              /**
               * …**AND A `:` IS A BAR ATTEMPT, NOT AN UNKNOWN CHARACTER.** `letter_to_bar`
               * reaches `getBarLine`, whose `case ':'` returns `{len: 1, warn: "Unknown bar
               * symbol"}` for anything that is not `:` or `|` after it
               * (`abc_tokenizer.js:175-202`) — and the caller then finds an empty type and
               * warns AGAIN, `warn("Unknown bar type", line, i)` at the same column
               * (`abc_parse_music.js:268-269`). TWO warnings on one character.
               *
               * `[V:1]P:A` is the shape: a `P:` written on a music line rather than as a
               * field. All four tunes of `abcts-tempo-rung` carry one, and their geometry
               * was byte-exact while this row read `Unknown character ignored` once.
               */
              else if (ch === ':') {
                this.warn(
                  'unknown-bar-symbol',
                  'unknown bar symbol',
                  sourceRange(token.start, token.start + 1),
                )
                this.warn(
                  'unknown-bar-type',
                  'unknown bar type',
                  sourceRange(token.start, token.start + 1),
                )
              }
              else if (ch !== ' ' && ch !== '`')
                this.warn(
                  'unknown-character',
                  'unknown character ignored',
                  sourceRange(token.start, token.start + token.length),
                )
            }
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
          /**
           * **A REST INSIDE A GRACE GROUP IS A WARNING, ONE PER REST** — `warn("Rests not
           * allowed as grace notes '" + gra[1][ii] + "' while parsing grace note", line, i)`
           * (`abc_parse_music.js:698-700`), where `i` is the group's OWN start, so all of
           * them point at the `{`. `{Azzz}e2` raises three.
           */
          for (const rest of inner.matchAll(/[zx]/g))
            this.warn(
              'grace-rest',
              `rest '${rest[0]}' in a grace group`,
              sourceRange(token.start, token.start + token.length),
            )
          const grace = parseGracePitches(inner)
          /**
           * …**AND EVERY OTHER CHARACTER IN THE GROUP IS AN ERROR, ONE WARNING EACH**, at
           * the GROUP's own start like the rests above — `warn("Unknown character '" +
           * gra[1][ii] + "' while parsing grace note", line, i)`
           * (`abc_parse_music.js:719-725`). `{[ceg][gc]}` raises four: the two brackets of
           * each chord.
           */
          for (const at of grace.unparsed)
            this.warn(
              'grace-character',
              `unknown character '${inner[at] ?? ''}' in a grace group`,
              sourceRange(token.start, token.start + token.length),
            )
          pendingGrace = grace.pitches
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
          //
          // …**AND abcjs SAYS SO**: `if (tripletNotesLeft > 0) warn("Can't nest triplets",
          // line, i)` (`abc_parse_music.js:329-331`), pointing at the inner `(`.
          if (tupletRemaining > 0) {
            this.warn(
              'nested-triplet',
              "can't nest triplets",
              sourceRange(token.start, token.start + 1),
            )
            break
          }

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
          /**
           * ⚠️ **AND ANY NON-NOTE ELEMENT ENDS THE BEAM, WHICH IS EVERY INLINE FIELD THAT
           * APPENDS ONE.** `appendElement`'s else-arm is one line and abcjs's own comment
           * says it: *"It's not a note, so there definitely isn't beaming after it"* —
           * `endBeamLast(tune)` (`tune-builder.js:216-218`). A REST is `el_type: 'note'`
           * there, which is why a rest inside a run changes nothing; a `[K:]`, `[M:]`,
           * `[Q:]` or `[P:]` is not, and breaks it.
           *
           * Only `V:` closed the run here, so `CD[M:2/4]EF` came out as ONE beam over four
           * notes where abcjs draws two, and every stem of the bar ran 7.72px long.
           */
          if (colon === 1 && 'VKMQP'.includes(text[0] as string)) closeBeamRun()
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
        /**
         * ⚠️ **A STRAY `]` IS AN INVISIBLE BARLINE.** `getBarLine`'s `]` arm falls through
         * to `{len: 1, token: "bar_invisible"}` for anything that is not `|` or `[`
         * (`abc_tokenizer.js:161-173`), so the `]` left over by `[C"Am"E]` — where the
         * chord ended at the quote — is a BAR in abcjs's stream, and its own object says
         * so: `bar 559..560 bar_invisible`. Ours dropped the token, which is one element
         * of misalignment for every row after it.
         *
         * Only a `]` the CHORD and the inline-field parsers did not consume reaches here.
         */
        case 'closeBracket':
        case 'barline': {
          closeBeamRun() // beams do not cross barlines; assign before the measure closes
          const text =
            token.kind === 'closeBracket'
              ? '['
              : this.src.slice(token.start, token.start + token.length)
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
          /**
           * ⚠️ **AND THE NUMBER MAY BE BRACKETTED — `|[1` IS ONE BARLINE.** `letter_to_bar`
           * skips whitespace, absorbs ONE optional `[` into the barline's own length, and
           * only then reads the `1234567890-,` token; if that token is empty or opens with
           * a `-` the whole thing REVERTS and the `[` is not consumed
           * (`abc_parse_music.js:868-887`). So `|[1` and `| [1` are endings and `|[CEG]`
           * is a barline followed by a chord.
           *
           * Ours stopped at the bracket, so `C2|[1 D2:|[2 E2|]` came out as FIVE bar
           * elements against abcjs's three, with the endings on invisible barlines of
           * their own. `endingEnd` already had the rule on the projection side — the SPAN
           * would have been right the moment the label was.
           */
          let scan = i
          while (
            scan < tokens.length &&
            (tokens[scan] as Token | undefined)?.kind === 'whitespace'
          )
            scan += 1
          const bracket = tokens[scan] as Token | undefined
          if (
            bracket !== undefined &&
            // …**AND THE LEXER CALLS THAT `[` A BARLINE**, not an open bracket: a `[` in
            // bar position is `bar_invisible` on its own (`abc_tokenizer.js:161-173`),
            // which is exactly what ours emitted for it before this.
            (bracket.kind === 'barline' || bracket.kind === 'openBracket') &&
            this.src.slice(bracket.start, bracket.start + bracket.length) === '[' &&
            ((tokens[scan + 1] as Token | undefined)?.kind === 'digit' ||
              (tokens[scan + 1] as Token | undefined)?.kind === 'chordSymbol')
          )
            i = scan + 1
          /**
           * ⚠️ **AND `|["first"]` IS AN ENDING WHOSE LABEL IS PROSE.** The `[` having been
           * absorbed, a `"` immediately after it takes `getBrackettedSubstring` instead of
           * the digit token, and the QUOTED TEXT is the label
           * (`abc_parse_music.js:879-882`) — abcjs's own comment says it is unclear whether
           * the `[` is required and assumes it is, "otherwise it would be confused with a
           * regular chord". Its `]` is consumed with it, which is why nothing here treats
           * that bracket as a stray one — its `]` is NOT consumed, and becomes a bar of
           * its own.
           */
          const quoted = tokens[i] as Token | undefined
          if (quoted?.kind === 'chordSymbol' && i > scan) {
            const text = this.src.slice(quoted.start + 1, quoted.start + quoted.length - 1)
            i += 1
            // …**AND THE `]` IS LEFT BEHIND, WHICH IS ITS OWN INVISIBLE BARLINE.**
            // `getBrackettedSubstring` takes the quoted string and nothing after it
            // (`abc_parse_music.js:880-881`), so `|["first"]` is TWO bar elements in
            // abcjs — the labelled one and a stray `]`. Consuming it here left one.
            voice().setVolta(text, sourceRange(token.start, quoted.start))
            break
          }
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
          /**
           * **A STANDALONE OCTAVE MARK IS AN UNKNOWN CHARACTER TO abcjs.** `,` and `'` are
           * read only inside `parseNote`, so one that follows no note letter reaches the
           * `if (i === startI)` arm and warns (`abc_parse_music.js:579-581`). Measured on
           * `frere-jacques`, whose prose abcjs reads as music: the comma of "owners," is
           * its warning 16 and was our only missing one.
           *
           * ponytail: the WARNING alone, not `unreadable` — the character-ownership gate is
           * closed at 255,684 and nothing there stands on this path, so moving ownership
           * would be a change with no oracle asking for it.
           */
          if (token.kind === 'octaveUp' || token.kind === 'octaveDown')
            this.warn(
              'unknown-character',
              'unknown character ignored',
              sourceRange(token.start, token.start + token.length),
            )
          i++
          break
      }
    }
    // A line of nothing but inline headers still takes its snapshot — abcjs never reaches
    // the else arm for one either, but `takeLineFonts` has to advance once per line.
    takeLineStartFonts()
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
    const positions = builder.stampedPositions()

    const note: Note = {
      type: 'note',
      chordFont: builder.chordFont,
      // …and the whole running set when a MID-LINE directive changed it — see
      // `MusicEvent.runningFonts`.
      ...(builder.midLineFonts === null ? {} : { runningFonts: builder.midLineFonts }),
      // …and the five POSITION directives in force, which travel the same way — see
      // `ScoreBuilder.positions`.
      ...(positions === undefined ? {} : { positioning: positions }),
      pitch: head.pitch,
      duration,
      notatedDuration: duration,
      tiedToNext: false,
      slurStarts: 0,
      slurEnds: 0,
      graceNotes: [],
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
    /** Where an abandoned chord hands the source back — see the warn arm below. */
    let abandonedAt: number | null = null
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
    /** One flag per pitch — see `Chord.tiedPitches`. */
    const innerTies: boolean[] = []
    let pendingInner: string[] = []
    /** `!style=…!` read since the last head — see `Pitch.style`. */
    let pendingHeadStyle: NoteStyle | null = null
    /**
     * **A `(` INSIDE THE BRACKETS OPENS ON THE HEAD IT PRECEDES AND A `)` CLOSES ON THE ONE
     * BEFORE IT** — `[(CE)G]` is a slur from the chord's first pitch to its second, which
     * abcjs numbers at chord positions 1 and 2 and therefore as 101 and 201
     * (`tune-builder.js:752-770`). It reaches forward where the tie reaches back, and both
     * were being SKIPPED here: `chordDecoration` answers null for a paren, so the token was
     * consumed and the mark lost.
     */
    let pendingInnerSlurs = 0
    /** `^/` and `_/` on THIS head — see `readNoteHead`. Cleared with the accidental. */
    let microtone = 0

    while (i < tokens.length && (tokens[i] as Token).kind !== 'closeBracket') {
      const token = tokens[i] as Token
      if (token.kind === 'accidental') {
        accidental = combineAccidental(accidental, token.aux)
        i++
        /**
         * **A MICROTONE INSIDE A CHORD IS READ EXACTLY AS ONE OUTSIDE IT** — `getCoreNote`
         * is the same function on both paths (`abc_parse_music.js:357`), so `[^/CE]` is a
         * QUARTERSHARP C and an E, one chord. Ours read the `^` and left the `/`, which
         * named the head `^C` and — once an unparseable token ended the chord — split it
         * in two.
         *
         * **ONE CHARACTER, AND A SECOND IS A PARSE FAILURE**: see the note path for the
         * six-rung ladder that pins it. A longer fraction is left where it stands, and the
         * `break` below ends the chord there, which is what abcjs's own `null` does.
         */
        const fraction = tokens[i] as Token | undefined
        if (fraction?.kind === 'digit' || fraction?.kind === 'slash') {
          const read = this.readLength(tokens, i)
          const chars = read.next - i === 1 ? fraction.length : 2
          if (chars === 1) {
            microtone = Math.sign(accidental ?? 0) * 50
            i = read.next
          }
        }
        continue
      }
      if (token.kind === 'lparen') {
        pendingInnerSlurs += 1
        i++
        continue
      }
      if (token.kind === 'rparen') {
        const at = pitches.length - 1
        const target = pitches[at]
        if (target !== undefined)
          pitches[at] = { ...target, slurEnds: (target.slurEnds ?? 0) + 1 }
        i++
        continue
      }
      if (token.kind === 'noteLetter') {
        const head = this.readNoteHead(tokens, i, accidental, microtone)
        const length = this.readLength(tokens, head.next)
        /**
         * ⚠️ **AND A `!style=…!` INSIDE THE BRACKETS IS THIS HEAD'S, NOT THE CHORD'S** —
         * the one decoration that is (`abc_parse_music.js:375-379`, with abcjs's own
         * comment saying so). Every other `!…!` joins `innerDecorations`, the chord's own
         * list. See `Pitch.style`.
         */
        pitches.push({
          ...head.pitch,
          ...(pendingInnerSlurs === 0 ? {} : { slurStarts: pendingInnerSlurs }),
          ...(pendingHeadStyle === null ? {} : { style: pendingHeadStyle }),
        })
        pendingHeadStyle = null
        pendingInnerSlurs = 0
        innerTies.push(false)
        innerMultipliers.push(length.factor)
        innerDecorations.push(...pendingInner)
        pendingInner = []
        accidental = null
        microtone = 0
        i = length.next
        continue
      }
      /**
       * **A `-` INSIDE THE BRACKETS TIES THAT PITCH AND NOT THE CHORD.** `[B-eg-b-]` ties
       * three of its four heads — see `Chord.tiedPitches`. It reaches back to the pitch
       * already read, exactly as the outer `-` reaches back to the note.
       */
      /**
       * ⚠️ **AND A `-` WITH NO PITCH BEFORE IT IS NOT THE CHORD'S AT ALL.** abcjs reads a
       * chord's tie inside `getCoreNote`, which needs a pitch; a leading `-` reaches the
       * `else` and ends the chord like any other stray token (`abc_parse_music.js:352-390`).
       * `C2|[-1 D2|]` is the shape: the `[` is absorbed into the barline, `getTokenOf`
       * reads `-1`, the leading `-` REVERTS the whole ending (`:885-886`), and the music
       * parser re-reads `[-1` — where the chord abandons AT the `-`, which then ties the
       * C to the D. Swallowing it here drew no tie at all.
       */
      if (token.kind === 'tie' && innerTies.length > 0) {
        innerTies[innerTies.length - 1] = true
        i++
        continue
      }
      /**
       * ⚠️ **AND ONLY ONE `!…!` MAY STAND BEFORE A HEAD.** abcjs's loop runs
       * `letter_to_accent` ONCE per iteration and then requires a pitch
       * (`abc_parse_music.js:352-357`), so a SECOND mark falls to the arm below and ends
       * the chord where it stands. `[!>!!tenuto!CEG]2|` is three separate notes in abcjs,
       * the first carrying `!tenuto!` alone — the `!>!` was consumed by the failed
       * iteration and is LOST — and `]2` an invisible barline opening ending "2".
       *
       * Ours took any number and drew one chord. It is not a `style=` rule: the same
       * happens with two ordinary decorations, and it is why the fixture's first attempt
       * at `[!>!!style=harmonic!CEG]` measured as a defect that was nothing to do with
       * the per-pitch style it was written for.
       */
      /**
       * ⚠️ **AND A SPACE INSIDE THE BRACKETS IS RECOVERED FROM, NOT FATAL — AND IT DROPS
       * THE ACCENT.** abcjs warns "Spaces are not allowed in chords", skips the character
       * and starts the iteration over (`abc_parse_music.js:392-395`), so the `!…!` the
       * failed iteration had already read is thrown away with it: `[!>! !tenuto!CEG]` is
       * ONE chord carrying `["tenuto"]` alone. Ours reached the arm below and abandoned
       * the whole chord.
       */
      if (token.kind === 'whitespace') {
        this.warn(
          'chord-space',
          'spaces are not allowed in chords',
          sourceRange(token.start, token.start + 1),
        )
        pendingInner = []
        pendingHeadStyle = null
        i++
        continue
      }
      const tookAccent = pendingInner.length > 0 || pendingHeadStyle !== null
      // …**AND `style=` IS CAUGHT BEFORE `chordDecoration`, WHICH DELIBERATELY DROPS IT**
      // — it is not the chord's decoration, it is the next head's. See `Pitch.style`.
      if (token.kind === 'decoration' && !tookAccent) {
        const named = /^style=(.+)$/.exec(
          this.src.slice(token.start + 1, token.start + token.length - 1),
        )?.[1]
        if (named !== undefined && NOTE_STYLES.includes(named as NoteStyle)) {
          pendingHeadStyle = named as NoteStyle
          i++
          continue
        }
      }
      const decoration = tookAccent ? null : this.chordDecoration(token, builder)
      if (decoration !== null) {
        pendingInner.push(decoration)
        i++
        continue
      }
      /**
       * ⚠️ **ANYTHING ELSE ENDS THE CHORD WHERE IT STANDS, AND IS NOT CONSUMED.** abcjs's
       * loop has four arms — a decoration, a pitch, a SPACE (warned and skipped), and the
       * `]` — and its `else` warns "Expected ']' to end the chords", appends the pitches it
       * already has and stops (`abc_parse_music.js:472-489`). So `[C"Am"E]` is a CHORD OF
       * ONE followed by an annotated `E`, with the `]` left over, and abcjs's own object
       * says so: two notes, the second carrying the chord symbol.
       *
       * Ours skipped the token and kept collecting, which made it one two-note chord with
       * the symbol thrown away — invisible to every gate until `abcts-ledger-gaps` wrote
       * one, and worth 22.4px of page, because a chord symbol takes a lane.
       *
       * …**AND abcjs WARNS AS IT STOPS**, pointing at the token that ended it:
       * `warn("Expected ']' to end the chords", line, index)` (`abc_parse_music.js:487`).
       * The GEOMETRY has been right since the rule landed and only the diagnostic was
       * missing, which is what the warnings gate has read as its second row since
       * 2026-08-21.
       */
      this.warn(
        'chord-unterminated',
        "expected ']' to end the chords",
        sourceRange(token.start, token.start + 1),
      )
      /**
       * ⚠️ **AND WITH NO PITCH READ, THE CHORD IS ABANDONED AND THE SOURCE IS RE-READ FROM
       * HERE.** abcjs appends only `if (el.pitches !== undefined)` (`:475-486`) and leaves
       * `i` on the token that stopped it, so the outer loop parses the rest as ordinary
       * music — with the decoration it had already consumed thrown away.
       *
       * `letter_to_accent` runs ONCE per iteration, so `[!>!!tenuto!CEG]2|` fails on the
       * second `!`: abcjs draws THREE separate notes, gives the first `!tenuto!` alone —
       * the `!>!` is LOST — and reads `]2` as an invisible barline opening ending "2".
       * Ours built a two-`!` chord and drew one. Measured through abcjs's `parseOnly`.
       */
      if (pitches.length === 0) abandonedAt = i
      break
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
    const positions = builder.stampedPositions()
    return {
      chord: {
        type: 'chord',
        chordFont: builder.chordFont,
        ...(builder.midLineFonts === null ? {} : { runningFonts: builder.midLineFonts }),
      // …and the five POSITION directives in force, which travel the same way — see
      // `ScoreBuilder.positions`.
      ...(positions === undefined ? {} : { positioning: positions }),
        pitches,
        duration,
        notatedDuration: duration,
        // EVERY head tied is the whole-chord form, which `-` after the bracket writes and
        // the audio already understands; a PARTIAL set is the per-pitch one.
        tiedToNext: innerTies.length > 0 && innerTies.every(Boolean),
        ...(innerTies.some(Boolean) && !innerTies.every(Boolean)
          ? { tiedPitches: innerTies }
          : {}),
        slurStarts: 0,
        slurEnds: 0,
        graceNotes: [],
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
      // …**AND AN ABANDONED CHORD HANDS BACK THE TOKEN THAT STOPPED IT**, not the end of
      // what it read. The caller emits nothing, since `pitches` is empty. See the warn arm.
      next: abandonedAt ?? post.next,
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
    // …**AND THE TYPE IS DECIDED HERE TOO, NOT RE-DERIVED DOWNSTREAM.** The rule sets BOTH
    // `el.rest.type = 'whole'` and the duration, and once the duration has been rewritten
    // the test that chose it cannot be run again: `notatedDuration` is the MEASURE's by
    // then, so a reader asking "was this written as a whole note" gets the wrong answer in
    // any bar that is not one whole note long. `M:6/8 L:1/4 z4` is exactly that bar.
    let whole = false
    if (
      !multi &&
      kind === 'normal' &&
      ratEq(duration, rational(1, 1)) &&
      !ratLt(rational(1, 1), barLength)
    ) {
      duration = barLength
      whole = true
    }
    // `Z4` is four measures of the bar counter, not one — see `countMultiMeasureRest`.
    if (multi) builder.countMultiMeasureRest(bars)
    const restPositions = builder.stampedPositions()
    return {
      rest: {
        type: 'rest',
        // …and the five POSITION directives in force. A REST IS A `note` ELEMENT to abcjs,
        // so `addFormattingOptions(el, …, 'note')` stamps it exactly as it does a pitch
        // (`abc_parse_music.js:262`).
        ...(restPositions === undefined ? {} : { positioning: restPositions }),
        duration,
        notatedDuration: duration,
        ...(whole ? { wholeRest: true as const } : {}),
        kind,
        decorations: [], // filled in by emit()
        decorationSourceRanges: [],
        chordSymbol: null, // filled in by emit()
        chordSymbolSourceRange: null,
        chordFont: null,
        annotations: [],
        annotationSourceRanges: [],
        graceNotes: [],
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
  /** `!class=name!` — see `Note.extraClass`. */
  extraClass?: string
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
/**
 * The two `%%MIDI` arms whose parameter SHAPE is not "whatever the whitespace split gave".
 * abcjs's own lists (`abc_parse_directive.js:480-484, 524-528`); see the `%%MIDI` handler.
 */
const MIDI_STRING_PARAM: ReadonlySet<string> = new Set(['gchord', 'ptstress', 'beatstring'])
const MIDI_FRACTION_PARAM: ReadonlySet<string> = new Set(['expand', 'grace', 'trim'])

const ABCJS_KNOWN_DECORATIONS: ReadonlySet<string> = new Set([
  // legalAccents
  'trill',
  'trillh',
  'lowermordent',
  'uppermordent',
  'mordent',
  'pralltriller',
  'irishroll',
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
/**
 * ⚠️ **A SHORTHAND AND ITS LONG FORM ARE DIFFERENT NAMES, AND abcjs KEEPS BOTH.** Its
 * oracle publishes `mordent` AND `lowermordent`, `pralltriller` AND `uppermordent`,
 * `irishroll` AND `roll` — so `M` is not `!lowermordent!` and `~` is not `!R!`. Ours
 * expanded each shorthand to the long name and erased the distinction, which the
 * element-VALUE gate saw on 26 rows.
 *
 * **AND IT IS NOT COSMETIC.** `abc_midi_flattener.js:404-419` dispatches on the name and
 * has no `irishroll` case at all, so `~` sounds PLAIN where `R` is rolled; `mordent` and
 * `lowermordent` are two different modifications. The drawing does not care — abcjs gives
 * each pair the same glyph (`decoration.js:179-188`) — which is why only a gate reading
 * the parse tree could state it.
 */
const DECORATION_SHORTHAND: Record<string, string> = {
  '.': 'staccato',
  '~': 'irishroll',
  H: 'fermata',
  J: 'slide',
  L: 'accent',
  M: 'mordent',
  O: 'coda',
  P: 'pralltriller',
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

function parseGracePitches(raw: string): {
  pitches: GracePitch[]
  /**
   * Characters inside the group that are neither a note, a rest nor a space — abcjs's
   * "We shouldn't get anything but notes or a space here, so report an error"
   * (`abc_parse_music.js:719-725`). Indices are into `raw`, so the caller can name each
   * character; a `[ceg]` chord contributes its two brackets.
   */
  unparsed: number[]
} {
  const text = raw
  const offset = 0
  /**
   * **A `/` MARKS THE NOTE AFTER IT, WHEREVER IT IS IN THE GROUP.** This stripped a LEADING
   * one and let every other fall through to the unknown-character arm, so `{A /B}` warned
   * and drew nothing where abcjs draws a slash on the `B`. See `GracePitch.acciaccatura`.
   */
  let pendingAcciaccatura = false
  const unparsed: number[] = []
  const pitches: GracePitch[] = []
  /**
   * **A SLUR INSIDE THE GROUP IS READ, NOT REPORTED.** abcjs parses each grace with
   * `getCoreNote`, which consumes a leading `(` onto the note's own `startSlur` and a
   * trailing `)` onto its `endSlur` (`abc_parse_music.js:691`) — so `{(CD)}` is a slur from
   * the first grace to the second, numbered at chord position 20 and therefore 2001. Ours
   * fell through to the "unknown character" arm and warned about both parens.
   */
  let pendingSlurs = 0
  /** `var inTie` — the group's own carry, not the tune's. See `GracePitch.startTie`. */
  let inTie = false
  let i = 0
  while (i < text.length) {
    if (text[i] === '/') {
      pendingAcciaccatura = true
      i++
      continue
    }
    if (text[i] === '(') {
      pendingSlurs += 1
      i++
      continue
    }
    if (text[i] === ')') {
      const at = pitches.length - 1
      const target = pitches[at]
      if (target !== undefined)
        pitches[at] = { ...target, slurEnds: (target.slurEnds ?? 0) + 1 }
      i++
      continue
    }
    let accidental: Accidental | null = null
    while (i < text.length && '^_='.includes(text[i] as string)) {
      accidental = combineAccidental(accidental, text[i] as string)
      i++
    }
    const letter = text[i]
    if (!letter || !/[a-gA-G]/.test(letter)) {
      // A SPACE ends a beam rather than erring, and a REST has its own message — see the
      // `grace-rest` warning at the call site.
      //
      // …**AND "ENDS A BEAM" IS A FACT THE GROUP HAS TO CARRY.** It was read here as
      // "not an error" and dropped; abcjs writes it onto the grace BEFORE the space.
      // See `GracePitch.endBeam`.
      if (letter === ' ' || letter === '\t') {
        const at = pitches.length - 1
        const target = pitches[at]
        if (target !== undefined) pitches[at] = { ...target, endBeam: true }
      } else if (letter !== undefined && !/[zx]/.test(letter)) {
        unparsed.push(offset + i)
      }
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
    // …**AND THE `-` AFTER IT TIES THIS GRACE TO THE NEXT** — `getCoreNote` reads it onto
    // this note and the group's `inTie` carries it one iteration. See `GracePitch.startTie`.
    const startsTie = text[i] === '-'
    if (startsTie) i++
    pitches.push({
      step: letter.toLowerCase() as DiatonicStep,
      octave,
      accidental,
      length: graceLength(text.slice(lengthStart, i)),
      ...(pendingSlurs === 0 ? {} : { slurStarts: pendingSlurs }),
      ...(pendingAcciaccatura ? { acciaccatura: true as const } : {}),
      ...(startsTie ? { startTie: true as const } : {}),
      ...(inTie ? { endTie: true as const } : {}),
    })
    inTie = startsTie
    pendingSlurs = 0
    pendingAcciaccatura = false
  }
  return { pitches, unparsed }
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
  /**
   * abcjs's `visualTranspose` render param — every pitch moved at parse time, key
   * signature and spelling with it. The same knob `%%visualTranspose n` turns, and the
   * DIRECTIVE wins where both are given because it is read later
   * (`abc_parse.js:529-536`).
   */
  readonly visualTranspose?: number
}

/**
 * **`\%` IS A LITERAL PERCENT, AND abcjs NEVER PUTS IT BACK.**
 *
 *     // If there is an escaped percent, then temporarily change it so it doesn't affect
 *     // the processing.
 *     strTune = strTune.replace(/\\%/g, "\u200B\uFF05")
 *
 * (`abc_parse.js:511-512`, new in **6.7.0**.) Two characters replace two characters, so
 * every source offset downstream is unmoved — which is the whole reason it is done this
 * way rather than by deleting the backslash — and the "temporarily" in its own comment is
 * wrong: nothing restores it. So `T:100\% Amazing` really does become
 * `100<ZWSP>％ Amazing` with a FULLWIDTH percent, and that is what abcjs draws.
 *
 * **THIS WAS FILED AS A DECISION AND IT WAS A STALE ONE.** `content-parity` carried a
 * paragraph saying the fixture came from 6.7.0 while our target was 6.6.3, where a `%`
 * truncates unconditionally, so "one note is the right answer for our target". The target
 * MOVED to 6.7.0 on 2026-08-08 and the note did not, so a fixture whose whole point is
 * this rule sat excluded for a week — and with it went every note after the escape, which
 * is why `escaped-percent`'s clock ran to 0.333s against abcjs's 1.667. The fifth time on
 * this branch that a note naming a cause is the reason a row stopped being read.
 */
const escapePercent = (source: string): string => source.replace(/\\%/g, '\u200B\uFF05')

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  HOST_TRANSPOSE = options.visualTranspose ?? 0
  const mode = options.mode ?? defaultMode
  // WHICH ESCAPE TABLE THE TEXT DECODER READS — abcjs's fixed map in strict, ABC 2.1's
  // generic combining marks everywhere else. Set here rather than threaded through the
  // fourteen `decodeTextString` call sites, which is the shape `JAZZ_CHORDS` and
  // `PERC_MAP` already take in the renderer. See `setAbcjsEscapes`.
  setAbcjsEscapes(isStrict(mode))
  return deepFreeze(new Parser(escapePercent(source), mode).parse())
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
