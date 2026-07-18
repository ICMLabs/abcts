/**
 * ABC parser — translation of abcMusicKit2's `ABCParser.swift`.
 *
 * Line-oriented and single-pass: this owns line splitting and field/music
 * classification, and runs the lexer only over music lines. Like the Swift
 * original it never throws — everything is lenient recovery plus collected
 * diagnostics.
 *
 * IMPLEMENTED: X/T/C/R/M/L/K headers, notes, rests, barlines, measures.
 * ponytail: DEFERRED — chords, tuplets, grace notes, slurs, ties, broken rhythm,
 * decorations, chord symbols, annotations, lyrics, multi-voice (V:), overlays (&),
 * inline fields, directives (%%), mid-tune key/meter changes, beaming, part order.
 * Each is a separate step driven by the corpus fixture that needs it; the lexer
 * already tokenizes all of them, so the work is parser-side only.
 */

import {
  Accidental,
  type Barline,
  type Chord,
  type Diagnostic,
  type DiatonicStep,
  type KeySignature,
  type Measure,
  type Meter,
  type Mode,
  type MusicEvent,
  measureDuration,
  type Note,
  type Pitch,
  type Rational,
  type Rest,
  type RestKind,
  ratEq,
  rational,
  ratLt,
  ratMul,
  type Score,
  type ScoreMetadata,
  type SourceRange,
  sourceRange,
  type Voice,
} from '../core/model.js'
import { Lexer, type Token } from './lexer.js'

export type ParseResult =
  | {
      readonly ok: true
      readonly scores: readonly Score[]
      readonly diagnostics: readonly Diagnostic[]
    }
  | { readonly ok: false; readonly errors: readonly Diagnostic[] }

// ─── Field parsing ───────────────────────────────────────────────────────────

const MODES: ReadonlyArray<readonly [string, Mode]> = [
  ['mix', 'mixolydian'],
  ['dor', 'dorian'],
  ['phr', 'phrygian'],
  ['lyd', 'lydian'],
  ['loc', 'locrian'],
  ['ion', 'ionian'],
  ['aeo', 'aeolian'],
  ['maj', 'major'],
  ['min', 'minor'],
  ['m', 'minor'],
]

export const DEFAULT_KEY: KeySignature = {
  tonic: { step: 'c', accidental: Accidental.natural },
  mode: 'major',
}

function parseKey(content: string): KeySignature {
  // ponytail: `clef=`, `octave=`, `transpose=`, `middle=`, `stafflines=` also ride on
  // K:. Stripped here, implemented when a fixture needs them.
  const spec = (content.split(/\s+/)[0] ?? '').trim()
  const head = spec[0]?.toLowerCase()
  if (!head || head < 'a' || head > 'g') return DEFAULT_KEY

  let i = 1
  let accidental: Accidental = Accidental.natural
  if (spec[i] === '#') {
    accidental = Accidental.sharp
    i++
  } else if (spec[i] === 'b') {
    accidental = Accidental.flat
    i++
  }

  const rest = spec.slice(i).toLowerCase()
  const mode = MODES.find(([prefix]) => rest.startsWith(prefix))?.[1] ?? 'major'
  return { tonic: { step: head as DiatonicStep, accidental }, mode }
}

function parseMeter(content: string): Meter | null {
  const spec = content.trim()
  if (spec === 'C') return { numerator: 4, denominator: 4, symbol: 'common' }
  if (spec === 'C|') return { numerator: 2, denominator: 2, symbol: 'cut' }
  if (spec === 'none' || spec === '') return null

  const [top, bottom] = spec.split('/')
  const denominator = Number.parseInt(bottom ?? '', 10)
  if (!top || !Number.isFinite(denominator) || denominator <= 0) return null
  // Additive meters (`3+2+2/8`) sum to a single numerator.
  const numerator = top.split('+').reduce((sum, part) => sum + (Number.parseInt(part, 10) || 0), 0)
  if (numerator <= 0) return null
  return { numerator, denominator, symbol: 'numeric' }
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
  '|': 'thin',
  '||': 'double',
  '|]': 'final',
  '[|': 'double',
  '|:': 'repeatStart',
  ':|': 'repeatEnd',
  '::': 'repeatBoth',
  ':|:': 'repeatBoth',
  ':||:': 'repeatBoth',
}

const DEFAULT_VOICE_ID = '1'

/** `octave=±n` on a `V:` or `K:` field — a sounding shift, not a written-pitch change. */
function octaveModifier(spec: string): number | null {
  const match = /octave=(-?\d+)/.exec(spec)
  const value = match?.[1]
  return value === undefined ? null : Number.parseInt(value, 10)
}

const KNOWN_FIELDS = 'ABCDFGHIKLMNOPQRSTUVWXZmrsw'

// ─── Builders ────────────────────────────────────────────────────────────────

class VoiceBuilder {
  octaveShift = 0
  private readonly measures: Measure[] = []
  private events: MusicEvent[] = []
  private measureStart: number | null = null

  constructor(readonly id: string) {}

  noteMeasureStart(offset: number): void {
    if (this.measureStart === null) this.measureStart = offset
  }

  push(event: MusicEvent): void {
    this.events.push(event)
  }

  /** The event a broken-rhythm mark reaches back to. Null once a barline has closed. */
  get last(): MusicEvent | null {
    return this.events[this.events.length - 1] ?? null
  }

  replaceLast(event: MusicEvent): void {
    if (this.events.length > 0) this.events[this.events.length - 1] = event
  }

  closeMeasure(barline: Barline, barlineRange: SourceRange): void {
    // A barline with nothing before it (leading `|:`) opens rather than closes.
    if (this.events.length === 0 && this.measureStart === null) return
    this.measures.push({
      events: this.events,
      closingBarline: barline,
      sourceRange: sourceRange(this.measureStart ?? barlineRange.start, barlineRange.end),
      closingBarlineSourceRange: barlineRange,
    })
    this.events = []
    this.measureStart = null
  }

  finish(): Voice {
    if (this.events.length > 0) {
      const last = this.events[this.events.length - 1]
      this.measures.push({
        events: this.events,
        closingBarline: null,
        sourceRange: sourceRange(this.measureStart ?? 0, last?.sourceRange?.end ?? 0),
        closingBarlineSourceRange: null,
      })
      this.events = []
      this.measureStart = null
    }
    return { id: this.id, octaveShift: this.octaveShift, measures: this.measures }
  }

  get isEmpty(): boolean {
    return this.measures.length === 0 && this.events.length === 0
  }
}

class ScoreBuilder {
  tuneNumber: number | null = null
  titles: string[] = []
  composer: string | null = null
  rhythm: string | null = null
  key: KeySignature = DEFAULT_KEY
  meter: Meter | null = null
  unitNoteLength: Rational = rational(1, 8)
  unitExplicit = false
  bodyStarted = false
  keySourceRange: SourceRange | null = null
  meterSourceRange: SourceRange | null = null
  /** Declaration order is output order — a Map preserves insertion order. */
  private readonly voices = new Map<string, VoiceBuilder>()
  private currentVoiceId = DEFAULT_VOICE_ID

  constructor(readonly sourceStartOffset: number) {}

  /** The voice music currently lands in. Created on demand for tunes with no `V:` at all. */
  get voice(): VoiceBuilder {
    return this.voiceFor(this.currentVoiceId)
  }

  voiceFor(id: string): VoiceBuilder {
    let builder = this.voices.get(id)
    if (!builder) {
      builder = new VoiceBuilder(id)
      this.voices.set(id, builder)
    }
    return builder
  }

  /** `V:2` in the body switches; in the header it only declares. */
  selectVoice(id: string): void {
    this.voiceFor(id)
    this.currentVoiceId = id
  }

  get isEmpty(): boolean {
    return (
      this.tuneNumber === null &&
      this.titles.length === 0 &&
      [...this.voices.values()].every((v) => v.isEmpty)
    )
  }

  finish(): Score {
    const metadata: ScoreMetadata = {
      tuneNumber: this.tuneNumber,
      titles: this.titles,
      composer: this.composer,
      rhythm: this.rhythm,
    }
    return {
      metadata,
      key: this.key,
      meter: this.meter,
      unitNoteLength: this.unitNoteLength,
      voices: [...this.voices.values()].map((v) => v.finish()),
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

  constructor(private readonly src: string) {}

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
    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, scores: this.scores, diagnostics: this.diagnostics }
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

  private ensureScore(at: number): ScoreBuilder {
    if (!this.builder) this.builder = new ScoreBuilder(at)
    return this.builder
  }

  private processLine(start: number, end: number): void {
    const line = this.src.slice(start, end).replace(/\r$/, '')

    // A `%%begintext` block runs to `%%endtext`. Its content lines carry no `%%` prefix,
    // so they must be claimed here — otherwise ordinary English prose parses as music and
    // every a-g in it becomes a note. Checked before the blank-line flush: a blank line
    // inside the block is part of the text, not the end of the tune.
    // ponytail: the text itself is discarded. v2 keeps it as `Score.freeText`; add that
    // when something (a renderer) actually consumes it.
    if (this.inTextBlock) {
      if (line.startsWith('%%endtext')) this.inTextBlock = false
      return
    }
    if (line.startsWith('%%begintext')) {
      this.inTextBlock = true
      return
    }

    if (line.trim() === '') {
      this.flush() // A blank line ends the tune.
      return
    }
    if (line.startsWith('%%')) {
      this.info(
        'unknown-directive',
        `directive not yet implemented: ${line}`,
        sourceRange(start, end),
      )
      return
    }
    if (line.startsWith('%')) return // comment

    if (/^[A-Za-z]:/.test(line)) {
      this.applyField(line[0] as string, line.slice(2), start, end)
      return
    }
    this.scanMusic(start, end)
  }

  private applyField(letter: string, content: string, start: number, end: number): void {
    const value = content.trim()
    const range = sourceRange(start, end)

    if (letter === 'X') {
      this.flush()
      const builder = this.ensureScore(start)
      builder.tuneNumber = Number.parseInt(value, 10) || null
      return
    }

    const builder = this.ensureScore(start)
    switch (letter) {
      case 'T':
        builder.titles.push(value)
        return
      case 'C':
        builder.composer = value
        return
      case 'R':
        builder.rhythm = value
        return
      case 'M': {
        if (builder.bodyStarted) {
          this.info('parsed-not-realized', 'mid-tune meter change not yet implemented', range)
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
      case 'V': {
        // `V:1 clef=treble name="..."` — the id is the first token; the rest is voice
        // configuration. ponytail: clef/name/transpose parsed when a fixture needs them.
        const id = value.split(/\s+/)[0]
        if (!id) return
        builder.selectVoice(id)
        const octave = octaveModifier(value)
        if (octave !== null) builder.voiceFor(id).octaveShift = octave
        return
      }
      case 'K': {
        if (builder.bodyStarted) {
          this.info('parsed-not-realized', 'mid-tune key change not yet implemented', range)
          return
        }
        builder.key = parseKey(value)
        builder.keySourceRange = range
        const keyOctave = octaveModifier(value)
        if (keyOctave !== null) builder.voice.octaveShift = keyOctave
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
  private scanMusic(start: number, end: number): void {
    const builder = this.ensureScore(start)
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
    /** Set by a `>`/`<` mark; scales the NEXT event, then clears. */
    let pendingBroken: Rational | null = null

    const emit = (event: MusicEvent): void => {
      voice().push(pendingBroken ? scaleEvent(event, pendingBroken) : event)
      pendingBroken = null
    }

    while (i < tokens.length) {
      const token = tokens[i] as Token
      switch (token.kind) {
        case 'accidental': {
          if (accidentalStart === null) accidentalStart = token.start
          pendingAccidental = combineAccidental(pendingAccidental, token.aux)
          i++
          break
        }
        case 'noteLetter': {
          voice().noteMeasureStart(accidentalStart ?? token.start)
          const built = this.buildNote(tokens, i, builder, pendingAccidental, accidentalStart)
          emit(built.note)
          i = built.next
          pendingAccidental = null
          accidentalStart = null
          break
        }
        case 'rest': {
          voice().noteMeasureStart(token.start)
          const built = this.buildRest(tokens, i, builder)
          emit(built.rest)
          i = built.next
          break
        }
        case 'openBracket': {
          const built = this.buildChord(tokens, i, builder)
          // An empty `[…]` is not a musical event — emitting it would insert a phantom
          // zero-pitch chord into the stream.
          if (built.chord.pitches.length > 0) {
            voice().noteMeasureStart(token.start)
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
          const { long, short } = brokenRhythmFactors(arrows)
          const lengthenFirst = token.aux === '>'
          const previous = voice().last
          if (previous) {
            voice().replaceLast(scaleEvent(previous, lengthenFirst ? long : short))
            pendingBroken = lengthenFirst ? short : long
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
        case 'inlineField': {
          // `[V:2]`, `[K:G]`, `[M:3/4]` — same fields as a header line, written inline.
          const text = this.src.slice(token.start + 1, token.start + token.length - 1)
          const colon = text.indexOf(':')
          if (colon === 1) {
            this.applyField(
              text[0] as string,
              text.slice(2),
              token.start,
              token.start + token.length,
            )
          }
          i++
          break
        }
        case 'barline': {
          const text = this.src.slice(token.start, token.start + token.length)
          voice().closeMeasure(
            BARLINES[text] ?? 'thin',
            sourceRange(token.start, token.start + token.length),
          )
          i++
          break
        }
        default:
          i++
          break
      }
    }
  }

  private buildNote(
    tokens: readonly Token[],
    index: number,
    builder: ScoreBuilder,
    accidental: Accidental | null,
    accidentalStart: number | null,
  ): { note: Note; next: number } {
    const token = tokens[index] as Token
    const head = this.readNoteHead(tokens, index, accidental)
    const length = this.readLength(tokens, head.next)
    const last = tokens[Math.max(index, length.next - 1)] as Token
    const duration = ratMul(builder.unitNoteLength, length.factor)

    const note: Note = {
      type: 'note',
      pitch: head.pitch,
      duration,
      notatedDuration: duration,
      tiedToNext: false,
      style: 'normal',
      sourceRange: sourceRange(accidentalStart ?? token.start, last.start + last.length),
    }
    return { note, next: length.next }
  }

  /** Reads `noteLetter octave*` into a pitch. The caller supplies any preceding accidental. */
  private readNoteHead(
    tokens: readonly Token[],
    index: number,
    accidental: Accidental | null,
  ): { pitch: Pitch; next: number } {
    const letter = (tokens[index] as Token).aux
    const step = letter.toLowerCase() as DiatonicStep
    // Case sets the octave: uppercase C..B is octave 4, lowercase c..b is octave 5.
    let octave = letter >= 'a' && letter <= 'g' ? 5 : 4

    let i = index + 1
    while (i < tokens.length) {
      const next = tokens[i] as Token
      if (next.kind === 'octaveUp') octave++
      else if (next.kind === 'octaveDown') octave--
      else break
      i++
    }
    return { pitch: { step, octave, accidental }, next: i }
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
  ): { chord: Chord; next: number } {
    const open = tokens[index] as Token
    const pitches: Pitch[] = []
    const innerMultipliers: Rational[] = []
    let accidental: Accidental | null = null
    let i = index + 1

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
        accidental = null
        i = length.next
        continue
      }
      i++ // ponytail: decorations and chord symbols inside `[…]` are skipped for now.
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
        pitches,
        duration,
        notatedDuration: duration,
        tiedToNext: false,
        style: 'normal',
        headDurations: mixed ? headDurations : [],
        sourceRange: sourceRange(open.start, last.start + last.length),
      },
      next: post.next,
    }
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
    const duration = ratMul(builder.unitNoteLength, length.factor)
    return {
      rest: {
        type: 'rest',
        duration,
        notatedDuration: duration,
        kind,
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
      numerator = Number.parseInt(this.text(first), 10)
      i++
    }
    while (tokens[i]?.kind === 'slash') {
      i++
      const digits = tokens[i]
      if (digits?.kind === 'digit') {
        denominator = Number.parseInt(this.text(digits), 10)
        i++
      } else {
        denominator *= 2
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
  const denominator = 2 ** arrows
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
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
export function parse(source: string): ParseResult {
  return deepFreeze(new Parser(source).parse())
}
