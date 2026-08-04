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
 * body `P:` label), symbol lines (`s:`), the written half of `transpose=`, and most `%%`
 * directives.
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
  type StaffConnector,
  type StaffGroup,
  sourceRange,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import { Lexer, type Token } from './lexer.js'
import { decodeTextString } from './text.js'

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
  // ponytail: `transpose=` is parsed but its written half is unrealized.
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

  const rest = spec.slice(i).toLowerCase()
  const mode = MODES.find(([prefix]) => rest.startsWith(prefix))?.[1] ?? 'major'
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
  '[': 'invisible',
  '[|]': 'invisible',
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
  // Line 2, like treble — see `CLEF_REFERENCE`. Neither draws a glyph, but both keep
  // treble's pitch mapping, measured off abcjs's own output.
  ['perc', 'percussion', 2],
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
  const explicit = /\bstems=(up|down)\b/i.exec(spec)
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

  const quoted = /"([^"]*)"/.exec(spec)
  const text = quoted?.[1] ?? null

  // `1/4=120`, tolerating spaces round the `=`. Take the beat unit only when it is
  // attached to a rate — a lone fraction is not a tempo.
  const rate = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)/.exec(spec)
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
  if (text === null && bpm === null) return null
  return { beatUnit, bpm, text }
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
  const move = (pitch: Pitch): Pitch => ({ ...pitch, octave: pitch.octave + octaves })
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
  /** The effective shift as each measure CLOSED, since the tune-level one can change. */
  private readonly measureShifts: number[] = []
  /** `V:… stafflines=` with no `clef=` — see `Voice.staffLineOverride`. */
  staffLineOverride: number | null = null
  /** `V:… stems=up|down` — see `Voice.stemDirection`. */
  stemDirection: 'up' | 'down' | null = null
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
  ) {}

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

  setMeterChange(meter: Meter | null, range: SourceRange): void {
    this.pendingMeterChange = meter
    this.pendingMeterChangeRange = range
  }

  private takeChanges() {
    const changes = {
      keyChange: this.pendingKeyChange,
      clefChange: this.pendingClefChange,
      keyChangeSourceRange: this.pendingKeyChangeRange,
      meterChange: this.pendingMeterChange,
      meterChangeSourceRange: this.pendingMeterChangeRange,
    }
    this.pendingKeyChange = null
    this.pendingClefChange = null
    this.pendingKeyChangeRange = null
    this.pendingMeterChange = null
    this.pendingMeterChangeRange = null
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

  beginMusicLine(): void {
    this.lineNoteStart = this.noteCounter
    this.closeUnterminatedMeasure()
    this.pendingLineStart = true
    this.wroteSinceLineStart = false
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
  tieLast(): void {
    const last = this.last
    if (last && last.type !== 'rest') this.replaceLast({ ...last, tiedToNext: true })
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
  private pendingOpening: { barline: Barline; range: SourceRange } | null = null
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

  closeMeasure(
    barline: Barline,
    barlineRange: SourceRange,
    /** Decorations still waiting when the bar arrived — they attach to IT. */
    decorations: readonly string[] = [],
  ): void {
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
      this.pendingOpening ??= { barline, range: barlineRange }
      return
    }
    this.measures.push({
      events: this.events,
      overlays: this.overlays,
      ...this.takeChanges(),
      ...this.takeOpening(this.events[this.events.length - 1]?.sourceRange?.start ?? null),
      ...(() => {
        const startsSystem = this.takeLineStart()
        this.takeOctave()
        return { startsSystem, ...this.takeTextBefore(startsSystem) }
      })(),
      closingBarline: barline,
      ...(decorations.length > 0 ? { closingBarlineDecorations: [...decorations] } : {}),
      sourceRange: sourceRange(this.measureStart ?? barlineRange.start, barlineRange.end),
      closingBarlineSourceRange: barlineRange,
    })
    this.events = []
    this.overlays = []
    this.overlayIndex = null
    this.measureStart = null
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
    if (this.events.length === 0 && this.overlays.length === 0) return
    const last = this.events[this.events.length - 1]
    this.measures.push({
      events: this.events,
      overlays: this.overlays,
      ...this.takeChanges(),
      ...this.takeOpening(last?.sourceRange?.start ?? null),
      ...(() => {
        const startsSystem = this.takeLineStart()
        this.takeOctave()
        return { startsSystem, ...this.takeTextBefore(startsSystem) }
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
      clef: this.clef,
      staffLineOverride: this.staffLineOverride,
      stemDirection: this.stemDirection,
      name: this.name,
      subname: this.subname,
      measures: padOverlays(measures, this.meterForOverlays),
    }
  }

  get isEmpty(): boolean {
    return this.measures.length === 0 && this.events.length === 0 && this.overlays.length === 0
  }
}

/** The `%%` formatting a file header passes to every tune under it. */
interface Formatting {
  staffSep: number | null
  musicSpace: number | null
  partsBox: boolean
  stretchLast: number | null
  staffWidth: number | null
  maxStaves: number | null
  sysStaffSep: number | null
  vocalFont: LyricFont | null
  fonts: Partial<Record<AbcFontType, LyricFont>>
}

class ScoreBuilder {
  tuneNumber: number | null = null
  titles: string[] = []
  composer: string | null = null
  rhythm: string | null = null
  origin: string | null = null
  author: string | null = null
  partOrder: string | null = null
  key: KeySignature = defaultKey()
  clef: Clef = defaultClef
  tempo: Tempo | null = null
  meter: Meter | null = null
  unitNoteLength: Rational = rational(1, 8)
  unitExplicit = false
  bodyStarted = false
  /**
   * The `%%vocalfont` in force, or null while none has been seen.
   *
   * Null is load-bearing: it means "nothing said", and the renderer answers it with the
   * default constant rather than by computing a size that happens to equal it. A tune
   * with no `%%vocalfont` therefore takes a path with no font arithmetic on it at all,
   * which is the only way to guarantee its geometry cannot drift.
   */
  vocalFont: LyricFont | null = null
  /** The `%%gchordfont` in force — a CHANGING font, so it is stamped per event. */
  chordFont: LyricFont | null = null
  /** Every `%%<type>font` set so far. The renderer defaults an absent entry itself. */
  fonts: Partial<Record<AbcFontType, LyricFont>> = {}
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

  /** The voice music currently lands in. Created on demand for tunes with no `V:` at all. */
  get voice(): VoiceBuilder {
    return this.voiceFor(this.currentVoiceId)
  }

  voiceFor(id: string): VoiceBuilder {
    let builder = this.voices.get(id)
    if (!builder) {
      builder = new VoiceBuilder(id, this.pendingTextBefore, this.keyOctave)
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
    }
    return {
      metadata,
      key: this.key,
      clef: this.clef,
      meter: this.meter,
      tempo: resolveBeatUnit(this.tempo, this.meter),
      unitNoteLength: this.unitNoteLength,
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
      stretchLast: this.stretchLast,
      staffWidth: this.staffWidth,
      maxStaves: this.maxStaves,
      sysStaffSep: this.sysStaffSep,
      textAbove: this.textAbove,
      textBelow: this.textBelow,
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

  private processLine(start: number, end: number): void {
    const line = this.src.slice(start, end).replace(/\r$/, '')

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
      this.applyDirective(line.slice(2), start, end)
      return
    }
    if (line.startsWith('%')) return // comment

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
    const fontDirective = /^(\w+font)\s+(.*)$/.exec(body)
    if (fontDirective?.[1] && fontDirective[2]) {
      const alias = fontDirective[1]
      const type = (FONT_ALIASES[alias] ?? alias) as AbcFontType
      if (type in ABC_FONT_DEFAULT_PT) {
        const builder = this.ensureScore(start)
        const font = parseFontSpec(fontDirective[2], ABC_FONT_DEFAULT_PT[type])
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
    return parseLyricSyllables(text, offset, this.mode, builder.vocalFont)
  }

  private applyField(letter: string, content: string, start: number, end: number): void {
    const value = content.trim()
    const range = sourceRange(start, end)

    if (letter === 'X') {
      // A `%%` DIRECTIVE BEFORE THE FIRST `X:` IS THE FILE HEADER and applies to every
      // tune (ABC 2.1 §4.1). The builder holding it looks EMPTY — no `X:`, no `T:`, no
      // music — so `flush` was dropping it and `%%stretchlast 1` written above `X:1`
      // never reached the tune below it, which is 241px of `visual-wrap-02` on its own.
      if (this.builder?.isEmpty === true) this.fileDefaults = this.builder.formatting()
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
        if (builder.bodyStarted) {
          builder.textBelow.push({
            lines: [decodeTextString(value)],
            align: 'center',
            role: 'subtitle',
          })
        } else {
          builder.titles.push(decodeTextString(value))
        }
        return
      case 'C':
        builder.composer = decodeTextString(value)
        return
      case 'R':
        builder.rhythm = decodeTextString(value)
        return
      case 'O':
        builder.origin = decodeTextString(value)
        return
      // `A:` — the author of the words, a row of its own in `composerfont`.
      case 'A':
        builder.author = decodeTextString(value)
        return
      case 'M': {
        if (builder.bodyStarted) {
          builder.voice.setMeterChange(parseMeter(value), range)
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
          builder.partOrder = decodeTextString(value)
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
        // ponytail: so a second `Q:` is dropped rather than drawn as a tempo CHANGE in
        // place. No corpus fixture has two, and modelling one means a `tempoChange` on
        // Measure plus a renderer path with nothing to gate it.
        if (builder.tempo === null) builder.tempo = parseTempo(value)
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
        // and `style=` are read; ponytail: `transpose=` is parsed but its WRITTEN half is
        // unrealized, which is why `middle=` guards on it.
        const id = value.split(/\s+/)[0]
        if (!id) return
        // In the header a `V:` only DECLARES. Only a `V:` in the body switches the
        // current voice — otherwise `V:1` / `V:2` in the header left voice 2 current and
        // every note landed in it.
        builder.declareVoice(id, mergesStaff(value))
        if (builder.bodyStarted) builder.selectVoice(id)
        const octave = octaveModifier(value)
        if (octave !== null) builder.voiceFor(id).octaveShift = octave
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
        if (keyStyle !== null) builder.voice.noteStyle = keyStyle
        if (builder.bodyStarted) {
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
    if (!continued) builder.voice.beginMusicLine()
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
    let pendingGrace: Pitch[] = []
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
      if (last && last.type !== 'rest' && ratLt(last.notatedDuration, rational(1, 4))) {
        beamRun.push(voice().lastIndex)
      } else {
        closeBeamRun()
      }
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
      // A rest carries none of these — no ties, slurs, grace notes or chord symbols —
      // but it still consumes the pending state so they cannot leak past it.
      if (scaled.type === 'rest') {
        // A rest carries decorations but no ties, slurs, grace notes or chord symbols.
        voice().push({
          ...scaled,
          decorations: pending.decorations,
          decorationSourceRanges: pending.decorationSourceRanges,
        })
      } else {
        // Inline `!style=x!` wins for this note; otherwise the voice's standing style
        // from `K: style=` applies.
        const inline = resolveStyle(pending)
        const style = inline === 'normal' ? voice().noteStyle : inline
        const attached: Note | Chord = {
          ...scaled,
          ...pending,
          style,
          slurStarts: pendingSlurStarts,
          graceNotes: pendingGrace,
          graceSlash: pendingGraceSlash,
        }
        voice().push(attached)
      }
      voice().pendingBroken = null
      pending = noAttachments()
      pendingSlurStarts = 0
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
          const text = this.src.slice(token.start + 1, token.start + token.length - 1)
          if (isAnnotation(text)) {
            pending.annotations.push(decodeTextString(text))
            pending.annotationSourceRanges.push(range)
          } else {
            pending.chordSymbol = prettifyChord(decodeTextString(text))
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
          voice().tieLast()
          i++
          break
        }
        case 'rparen': {
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
          voice().closeMeasure(
            BARLINES[text] ?? 'thin',
            sourceRange(token.start, token.start + token.length),
            pending.decorations,
          )
          pending.decorations = []
          pending.decorationSourceRanges = []
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
    const head = this.readNoteHead(tokens, index, accidental)
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
    const duration = multi ? rational(1, 1) : ratMul(builder.unitNoteLength, length.factor)
    return {
      rest: {
        type: 'rest',
        duration,
        notatedDuration: duration,
        kind,
        decorations: [], // filled in by emit()
        decorationSourceRanges: [],
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
const isAnnotation = (text: string): boolean => '^_<>@'.includes(text[0] ?? '')

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
function parseGracePitches(raw: string): { pitches: Pitch[]; slash: boolean } {
  let text = raw
  let slash = false
  if (text.startsWith('/')) {
    slash = true
    text = text.slice(1)
  }
  const pitches: Pitch[] = []
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
    while (i < text.length && /[0-9/]/.test(text[i] as string)) i++ // lengths are ignored
    pitches.push({ step: letter.toLowerCase() as DiatonicStep, octave, accidental })
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
  const sizeMatch = /(^|\s)(\d+(?:\.\d+)?)\s*$/.exec(trimmed)
  const face = (sizeMatch ? trimmed.slice(0, sizeMatch.index) : trimmed).trim()
  return {
    face,
    size: sizeMatch?.[2] ? Number.parseFloat(sizeMatch[2]) : defaultPt,
    bold: /bold/i.test(face),
    italic: /italic|oblique/i.test(face),
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
function resolveStyle(attachments: Attachments): NoteStyle {
  let style: NoteStyle = 'normal'
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
  return deepFreeze(new Parser(source, options.mode ?? defaultMode).parse())
}
