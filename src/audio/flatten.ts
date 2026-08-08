/**
 * THE AUDIO FLATTENER — abcjs's `setUpAudio()`, which is `sequence()` then `flatten()`.
 *
 * ── WHAT THE PARITY SURFACE IS ───────────────────────────────────────────────
 * EVENT GENERATION, and not a note of sound. abcjs's `abc_midi_flattener.js`,
 * `abc_midi_sequencer.js` and `chord-track.js` turn a parsed tune into a
 * `{tempo, instrument, totalDuration, tracks[][]}` of `{cmd, pitch, volume, start,
 * duration, instrument, gap}` rows; `create-synth.js`, `synth-controller.js`, the
 * soundfont loading and the WebAudio graph are ~90KB of HOST PLAYBACK on top of that, and
 * they are out of scope. Whether a host plays the list through WebAudio, CoreAudio or a
 * MIDI file is that host's business. It is the same split the renderer makes between
 * geometry (in scope) and glyph outlines (out).
 *
 * ── WHAT IT RUNS OVER ────────────────────────────────────────────────────────
 * abcts's own parse tree, not the laid-out one. abcjs sequences the VISUAL object because
 * that is what its `Tune` has to hand, and pays for it — `preProcess` mutates the tree it
 * was given, and `writeNote` writes `currentTrackMilliseconds` back onto the drawn
 * element. Nothing here needs the geometry: pitches, durations, decorations, chord
 * symbols and bar structure are all in the AST, so audio does not depend on the renderer
 * and a headless host can have one without the other.
 *
 * ── UNITS, AND WHY THEY ARE INTEGERS ─────────────────────────────────────────
 * abcjs accumulates time as WHOLE NOTES SCALED BY A MILLION and rounds at every step —
 * `timeCounter += Math.round(thisDuration * tempoMultiplier * 1000000)` — with the comment
 * "To compensate for JS rounding problems, do all intermediate calcs on integers". Its
 * goldens carry the result of that: a triplet eighth is `0.083333` and the third of them
 * is `0.083334`, which is a rounded integer accumulator and not a rational. Reproducing
 * the accumulator is the only way to reproduce those figures, so it is reproduced exactly.
 */

import {
  type KeySignature,
  keyFifths,
  type Meter,
  type MusicEvent,
  type Rational,
  ratToNumber,
  type Score,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import { type ChordOptions, ChordTrack } from './chord-track.js'

/** One `{cmd: 'note'}` row, exactly as abcjs's flattener emits it. */
export interface MidiNote {
  readonly cmd: 'note'
  readonly pitch: number
  readonly volume: number
  readonly start: number
  readonly duration: number
  readonly instrument: number
  readonly gap: number
  readonly endType?: string
  readonly style?: string
  readonly cents?: number
}

export interface MidiProgram {
  readonly cmd: 'program'
  readonly channel: number
  readonly instrument: number
}

export interface MidiText {
  readonly cmd: 'text'
  readonly type: string
  readonly text: string
}

export type MidiEvent = MidiNote | MidiProgram | MidiText

export interface FlatAudio {
  readonly tempo: number
  readonly instrument: number
  readonly totalDuration: number
  readonly tracks: readonly (readonly MidiEvent[])[]
}

export interface AudioOptions {
  /** Overrides the tune's `Q:` outright — abcjs's `options.qpm`. */
  readonly qpm?: number
  /** Used only when the tune has no `Q:` at all. */
  readonly defaultQpm?: number
  readonly program?: number
  readonly channel?: number
  readonly midiTranspose?: number
  /** Every voice, or the listed voice indices, silenced to volume 0 rather than dropped. */
  readonly voicesOff?: boolean | readonly number[]
  /** `chordsOff` — the guitar-chord track is suppressed entirely, symbols and all. */
  readonly chordsOff?: boolean
}

/** `%%MIDI` settings gathered off the tune — abcjs's `tune.formatting.midi`. */
export interface MidiDirectives extends ChordOptions {
  readonly program?: readonly number[]
  readonly channel?: readonly number[]
  readonly transpose?: readonly number[]
}

const MICRO = 1000000

/** abcjs's `scale` — semitones above the tonic for each diatonic step. */
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]

/**
 * abcjs's `accentPseudonyms` and `accentDynamicPseudonyms` (`parse/abc_parse_settings.js`).
 *
 * abcjs canonicalises a decoration IN THE PARSER; our parser keeps the source spelling, so
 * the audio side resolves it. Both are defensible and this is where the difference is paid.
 */
const DECORATION_ALIAS: Readonly<Record<string, string>> = {
  '<': 'accent',
  '>': 'accent',
  tr: 'trill',
  plus: '+',
  emphasis: 'accent',
  '^': 'umarcato',
  marcato: 'umarcato',
  '<(': 'crescendo(',
  '<)': 'crescendo)',
  '>(': 'diminuendo(',
  '>)': 'diminuendo)',
}

const canonical = (d: string): string => DECORATION_ALIAS[d] ?? d

/**
 * A DYNAMIC IS A STRESS TABLE, not a volume. abcjs's `setDynamics` replaces the three
 * beat-stress figures outright — bar-first, on-beat, off-beat — so `!p!` makes the whole
 * passage quieter WITHOUT flattening its accents (`abc_midi_sequencer.js:422-433`).
 *
 * Tested one way round only, so the ORDER of the tests is load-bearing: abcjs asks for
 * `pppp` first and `ffff` last, but its `ff`/`fff`/`ffff` arms are unreachable — `f` is
 * tested before them and `indexOf('f')` matches nothing else in the list, so `!ff!` takes
 * the `f` row. Reproduced, because a strict-mode engine reproduces the bug: `flatten-
 * dynamics3` expects 105/95/80 where `!ffff!` is written.
 */
const DYNAMIC_ORDER = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff']
const DYNAMIC_VOLUMES: Readonly<Record<string, readonly [number, number, number]>> = {
  pppp: [15, 10, 5],
  ppp: [30, 20, 10],
  pp: [45, 35, 20],
  p: [60, 50, 35],
  mp: [75, 65, 50],
  mf: [90, 80, 65],
  f: [105, 95, 80],
  ff: [120, 110, 95],
  fff: [127, 125, 110],
  ffff: [127, 125, 110],
}

/** `crescendoSize` — how far a hairpin moves the stress table, before it is divided up. */
const CRESCENDO_SIZE = 50

/** The order sharps and flats are added to a key signature. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] // f c g d a e b
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] // b e a d g c f

/**
 * The gaps abcjs leaves after a note, and its own words for them.
 *
 * The first two are in SECONDS and the third is a FRACTION of the duration — a difference
 * that matters, because the staccato one is then converted with the tempo
 * (`startingTempo / 60 * d`) and the other two are not.
 */
const NORMAL_GAP = 0
const SLURRED_GAP = -0.001
const STACCATO_FRACTION = 0.4

/** abcjs's `getBeatFraction` — the note that gets a beat, given the meter. */
function beatFractionOf(meter: Meter): number {
  switch (meter.denominator) {
    case 2:
      return 0.5
    case 4:
      return 0.25
    case 8:
      return meter.numerator % 3 === 0 ? 0.375 : 0.125
    case 16:
      return 0.125
    default:
      return 0.25
  }
}

/**
 * `Tune.getBeatLength` — NOT the same thing as `getBeatFraction`, and both are used.
 *
 * This one only ever divides the tempo: `interpretTempo` turns `Q:1/2=60` into a
 * quarter-note qpm through it. A 6/8 tune counts in dotted quarters, so its beat is
 * `3/8`; an irregular 5/8 or 7/8 counts in `2/8`.
 */
function beatLengthOf(meter: Meter | null): number {
  if (meter === null) return 0.25
  const { numerator: num, denominator: den } = meter
  let multiplier = 1
  if (num === 6 || num === 9 || num === 12) multiplier = 3
  else if (num === 3 && den === 8) multiplier = 3
  else if (den === 8 && (num === 5 || num === 7)) multiplier = 2
  return multiplier / den
}

/** Semitone alteration per diatonic step index, from the key's position on the circle. */
function keyAccidentals(key: KeySignature): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0]
  const fifths = keyFifths(key)
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER
  for (let i = 0; i < Math.abs(fifths); i += 1) {
    const step = order[i]
    if (step !== undefined) out[step] = fifths >= 0 ? 1 : -1
  }
  // `K:… ^f _b` and the like ADD to the signature they follow — abcjs's `setKeySignature`
  // does `accidentals[note] += d`, not `=`. And a QUARTER tone is **0.25**, not 0.5:
  // `switch (acc.acc) { case "quarterflat": d = -0.25; case "quartersharp": d = 0.25 }`
  // (`abc_midi_flattener.js:676-682`). That looks like a bug — a quarter tone is half a
  // semitone, not a quarter — and it is not: the fraction is a MARKER. `adjustForMicroTone`
  // tests the pitch's decimal for `.25` or `.75` and turns it into a whole pitch plus a
  // ±50-cent bend, and only 0.25 lands unambiguously on one or the other. A 0.5 would put a
  // half-sharp above C and a half-flat below D on the same 60.5 and lose the direction.
  for (const extra of key.extra ?? []) {
    const step = stepIndex(extra.step)
    if (step >= 0) {
      out[step] =
        (out[step] ?? 0) + (extra.quarters % 2 === 0 ? extra.quarters / 2 : extra.quarters / 4)
    }
  }
  return out
}

interface Timed {
  /**
   * `bar` rows carry NO event and exist only so a decoration written before a barline can
   * still be found. abcjs's `numNotesToDecoration` walks every element and tests
   * `voice[i].decoration` on all of them, counting only the notes — so a `!<)!` written at
   * the end of a bar, which BOTH engines attach to the barline rather than to the next
   * note, still closes the hairpin. Probed on `flatten-dynamics2`: abcjs logs
   * `["crescendo)"] el bar`. Leave the bars out and the search runs off the end of the
   * tune, `floor(50 / 51)` is 0, and the whole crescendo is flat.
   */
  readonly kind: 'note' | 'bar'
  /**
   * The SOURCE LINE this row is on, and it is load-bearing for hairpins.
   *
   * abcjs sequences line by line — its `voice` is `abcLine.staff[j].voices[v]` — so
   * `numNotesToDecoration` and `endingVolume` can only see the line they were called on.
   * Measured on `flatten-dynamics`: a `!diminuendo(!` in the last bar of one line reaches
   * its `!diminuendo)!` but NOT the `!pppp!` two elements later, because that is the first
   * note of the next line and simply is not in the array. Searching the whole tune found
   * it, took the target from 76 to 15 and the step from -8 to -16, and put every note of
   * the passage 8 too quiet.
   */
  readonly line: number
  readonly decorations: readonly string[]
  readonly event: MusicEvent | null
  /** Whole notes × 1,000,000, accumulated as an integer exactly as abcjs does. */
  readonly time: number
  /** True on the first event of a measure — where the beat-stress clock restarts. */
  readonly barStart: boolean
  readonly key: KeySignature
  readonly meter: Meter | null
  /** Sounding duration in whole notes, with a tie's continuation already folded in. */
  readonly duration: number
  /** `startingTempo / qpm` in force here — a `[Q:]` stretches durations, not the tempo. */
  readonly factor: number
  /** Semitones the CLEF adds, which replaces the voice's transpose rather than adding. */
  readonly clefTranspose: number
  /** A tie's continuation, silenced: it was folded into the note that opened the tie. */
  readonly tiedOver: boolean
}

/**
 * Walk one voice into a flat, timed list — abcjs's `sequence()` plus its `preProcess()`.
 *
 * TIES ARE RESOLVED HERE, and abcjs resolves them by MOVING THE DURATION: the note that
 * opens the tie grows by the tied note's duration and the tied note is deleted outright
 * (`preProcess`, `voice[ties[…]].pitches[…].duration += pitch.duration; element.pitches[k]
 * = null`). So a tie makes ONE longer event, not two joined ones, and three notes tied
 * together make one event of the whole length.
 *
 * ponytail: repeats are not unrolled and `&` overlays are not split out. Both are the
 * sequencer's job in abcjs (`repeats.js`, and the overlay voices it appends), both need
 * the ranked table to steer them, and neither can be tested before the table exists.
 */
function sequenceVoice(voice: Voice, score: Score, startingTempo: number): Timed[] {
  const out: Timed[] = []
  let time = 0
  /**
   * THE TEMPO CHANGE SCALES THE CLOCK, NOT THE NOTE. abcjs never restates the tempo — it
   * keeps the FIRST one and stretches every later duration by `startingTempo / qpm`, in
   * both `preProcess` and `flatten` (`abc_midi_flattener.js:148-151, 271`). So a
   * `[Q:1/4=129]` under a 180 default makes every quarter last `0.25 * 180/129`, and the
   * reported `tempo` stays 180.
   */
  let tempoFactor = 1
  /**
   * THE CLEF'S OCTAVE REPLACES THE VOICE'S TRANSPOSE, it does not add to it.
   *
   *     if (staff.clef.transpose) { push transpose: clef.transpose; active = false }
   *     if (clef.type has "-8") { push transpose: -12; active = true }
   *     else if (has "+8")      { push transpose:  12; active = true }
   *     else if (active)        { push transpose:   0; active = false }
   *
   * (`abc_midi_sequencer.js:190-211`.) They are separate `transpose` ELEMENTS and the
   * flattener's `case "transpose"` ASSIGNS — so a `clef=bass+8` on a voice declared
   * `octave=-2` sounds at +12, not at -12, and the `octave=` is simply overwritten for
   * that line. The `else if (active)` arm is what cancels a `+8` when a later line goes
   * back to a plain clef, and it cannot fire on a line whose clef carries its own
   * transpose, because that arm already cleared the flag.
   */
  let clefTranspose = 0
  let clefOctaveActive = false
  let line = -1
  let key = score.key
  let meter = score.meter
  /** Open ties, keyed by written pitch, holding the index into `out` that owns them. */
  const ties = new Map<string, number>()
  const durations: number[] = []

  for (const measure of voice.measures) {
    if (measure.startsSystem || line < 0) line += 1
    const clef = measure.clefChange ?? (line === 0 ? (voice.clef ?? score.clef) : null)
    if (clef != null) {
      if (clef.octaveShift !== 0) {
        clefTranspose = clef.octaveShift * 12
        clefOctaveActive = true
      } else if (clefOctaveActive) {
        clefTranspose = 0
        clefOctaveActive = false
      }
    }
    if (measure.tempoChange != null) {
      const qpm = qpmOfTempo(measure.tempoChange, meter)
      tempoFactor = qpm > 0 ? startingTempo / qpm : 1
    }
    if (measure.keyChange !== null) key = measure.keyChange
    if (measure.meterChange !== null) meter = measure.meterChange
    let first = true
    for (const event of measure.events) {
      // A SPACER SOUNDS NOTHING, TAKES NO TIME — AND STILL COUNTS.
      //
      // `y` is skipped where the sequence is BUILT — `if (!elem.rest || elem.rest.type
      // !== 'spacer')` (`abc_midi_sequencer.js:246`) — so it neither sounds nor advances
      // the clock, and letting it take its written duration put every note after
      // `!<)!y!ffff!B` a quarter late. But `setDynamics(elem)` is called on the line ABOVE
      // that guard, and `numNotesToDecoration` walks the RAW voice where the spacer is
      // still an `el_type: "note"` — so a hairpin written on a `y` closes there and the
      // spacer is one of the notes the step is divided by. Dropping it outright made
      // `flatten-dynamics3`'s crescendo run to the end of the line instead of to the `y`,
      // 28 per note against 14.
      const spacer = event.type === 'rest' && event.kind === 'spacer'
      // A MULTI-MEASURE REST IS AS LONG AS IT SAYS. `Z4` is four BARS of silence, and its
      // written duration is one bar — abcjs multiplies by `measureLength` where we carried
      // the single bar through, so everything after it on `flatten-multi-measure-rest` ran
      // three whole notes early.
      const bars =
        event.type === 'rest' &&
        (event.kind === 'multiMeasure' || event.kind === 'invisibleMultiMeasure')
          ? (event.measureCount ?? 1)
          : 1
      const dur = spacer ? 0 : ratToNumber(event.duration) * bars
      let tiedOver = false
      if (event.type === 'note') {
        const name = `${event.pitch.step}${event.pitch.octave}`
        const open = ties.get(name)
        if (open !== undefined) {
          durations[open] = (durations[open] ?? 0) + dur
          tiedOver = true
          ties.delete(name)
        }
        if (event.tiedToNext) ties.set(name, tiedOver ? (open as number) : out.length)
      }
      out.push({
        kind: 'note',
        line,
        decorations: event.decorations,
        event,
        time,
        barStart: first,
        key,
        meter,
        duration: dur,
        factor: tempoFactor,
        clefTranspose,
        tiedOver,
      })
      durations.push(tiedOver ? 0 : dur)
      time += Math.round(dur * tempoFactor * MICRO)
      first = false
    }
    // A MEASURE BOUNDARY IS NOT ALWAYS A BARLINE. Our model closes a measure at a line
    // break whether or not a `|` was written; abcjs's voice carries a `bar` element only
    // where one actually is. Emitting one either way restarted the beat-stress clock at
    // every line end — `flatten-treble-8` writes one note per line with no barlines at all
    // and every one of them came out at the bar-first 105 instead of 85.
    if (measure.closingBarline === null) continue
    out.push({
      kind: 'bar',
      line,
      decorations: measure.closingBarlineDecorations ?? [],
      event: null,
      time,
      barStart: false,
      key,
      meter,
      duration: 0,
      factor: tempoFactor,
      clefTranspose,
      tiedOver: false,
    })
    durations.push(0)
  }
  return out.map((t, i) => ({ ...t, duration: durations[i] ?? t.duration }))
}

/** abcjs's `interpretTempo`: `Q:` is stated at some beat, the sequencer wants another. */
function qpmOfTempo(tempo: Tempo, meter: Meter | null): number {
  const unit: Rational | null = tempo.beatUnit
  const duration = unit === null ? 0.25 : ratToNumber(unit)
  return (duration * (tempo.bpm ?? 60)) / beatLengthOf(meter)
}

/**
 * The tune's qpm — and an INLINE `[Q:]` does not supply one.
 *
 * abcjs reads `abctune.metaText.tempo`, which only the FIELD parser writes; an inline
 * `[Q:]` becomes an element in the stream and never reaches it. Measured on a control
 * pair: `[Q:1/4=129]CDEF` reports `tempo: 180` from `setUpAudio` and draws the mark
 * anyway; `Q:1/4=129` reports 129.
 */
function qpmOf(score: Score, options: AudioOptions): number {
  if (options.qpm !== undefined) return Math.trunc(options.qpm)
  const tempo = score.tempo
  if (tempo !== null && tempo.bpm !== null && score.tempoInline !== true) {
    return qpmOfTempo(tempo, score.meter)
  }
  return options.defaultQpm ?? 180
}

/**
 * The pickup — abcjs's `computePickupLength`, which is what makes a lead-in play QUIETLY.
 *
 * It accumulates durations until the first barline and returns what it has, subtracting a
 * whole bar whenever it reaches one. So a tune that opens with a full measure returns 0
 * and every note is stressed normally; one that opens with `G/|` returns 0.125 and every
 * note before that time takes the weak-beat volume.
 */
function pickupLengthOf(score: Score): number {
  const voice = score.voices[0]
  if (voice === undefined) return 0
  const barLength = score.meter === null ? 1 : score.meter.numerator / score.meter.denominator
  let pickup = 0
  for (const measure of voice.measures) {
    for (const event of measure.events) {
      if (!(event.type === 'rest' && event.kind === 'spacer')) pickup += ratToNumber(event.duration)
      if (pickup >= barLength) pickup -= barLength
    }
    // IT STOPS AT A BARLINE, NOT AT A MEASURE. `computePickupLength` returns the moment it
    // meets a `bar` ELEMENT, and a tune with no barlines at all runs to the end and returns
    // everything it counted. `flatten-treble-8` is six notes over six lines and not one
    // `|`, so abcjs's pickup is 0.75 and every note in it takes the weak-beat volume;
    // stopping at the first measure gave 0.125 and the third note came out on-beat.
    if (measure.closingBarline !== null) return pickup
  }
  return pickup
}

/**
 * `%%MIDI` as the sequencer reads it — abcjs's `abctune.formatting.midi`, whose values are
 * flat arrays of number-or-string. `program 4` and `program 2 4` differ by LENGTH.
 */
function midiOf(score: Score): MidiDirectives {
  const raw = score.midi ?? {}
  const nums = (key: string): readonly number[] | undefined => {
    const v = raw[key]
    return v === undefined ? undefined : v.filter((x): x is number => typeof x === 'number')
  }
  const strs = (key: string): readonly string[] | undefined => {
    const v = raw[key]
    return v === undefined ? undefined : v.filter((x): x is string => typeof x === 'string')
  }
  const out: Record<string, readonly number[] | readonly string[]> = {}
  for (const key of [
    'program',
    'channel',
    'transpose',
    'bassprog',
    'chordprog',
    'bassvol',
    'chordvol',
  ]) {
    const v = nums(key)
    if (v !== undefined) out[key] = v
  }
  const g = strs('gchord')
  if (g !== undefined) out.gchord = g
  return out as MidiDirectives
}

export function flattenAudio(
  score: Score,
  options: AudioOptions = {},
  midiIn?: MidiDirectives,
): FlatAudio {
  const midi = midiIn ?? midiOf(score)
  const startingTempo = qpmOf(score, options)
  let program = Math.trunc(options.program ?? 0)
  let channel = Math.trunc(options.channel ?? 0)
  let transposeGlobal = Math.trunc(options.midiTranspose ?? 0)
  // `%%MIDI program 4` sets the instrument; `%%MIDI program 2 4` sets channel AND
  // instrument, in that order (`abc_midi_sequencer.js:73-79`).
  const declared = midi.program ?? []
  if (declared.length === 1) program = declared[0] as number
  else if (declared.length > 1) {
    channel = declared[0] as number
    program = declared[1] as number
  }
  if (midi.channel !== undefined && midi.channel.length > 0) channel = midi.channel[0] as number
  if (midi.transpose !== undefined && midi.transpose.length > 0) {
    transposeGlobal = midi.transpose[0] as number
  }

  const pickupLength = pickupLengthOf(score)
  const tracks: MidiEvent[][] = []
  const startMeter = score.meter ?? { numerator: 4, denominator: 4, symbol: 'numeric' as const }
  const chordTrack = new ChordTrack(score.voices.length, options.chordsOff === true, midi, {
    num: startMeter.numerator,
    den: startMeter.denominator,
  })
  let instrument: number | undefined
  let totalDuration = 0

  score.voices.forEach((voice, voiceIndex) => {
    const voiceOff =
      options.voicesOff === true ||
      (Array.isArray(options.voicesOff) && options.voicesOff.includes(voiceIndex))
    // abcjs seeds every track with a program event whose channel is the VOICE INDEX, then
    // lets an explicit `%%MIDI channel` walk back and overwrite it (`setChannel`).
    const track: MidiEvent[] = [
      { cmd: 'program', channel: channel !== 0 ? channel : voiceIndex, instrument: program },
    ]
    if (instrument === undefined) instrument = program

    let accidentals = keyAccidentals(score.key)
    let barAccidentals = new Map<string, number>()
    let meter: Meter = score.meter ?? { numerator: 4, denominator: 4, symbol: 'numeric' }
    let lastBarTime = 0
    let slurCount = 0
    // The clef's transpose REPLACES the running one rather than adding, so the global
    // `%%MIDI transpose` only survives where no clef states one.
    chordTrack.setTranspose(0)
    chordTrack.setLastBarTime(0)
    chordTrack.setMeter({ num: meter.numerator, den: meter.denominator })

    const timed = sequenceVoice(voice, score, startingTempo)
    /** The running stress table — abcjs's `currentVolume`, seeded at the default triple. */
    let stress: [number, number, number] = [105, 95, 85]
    /** Per-note increment while a hairpin is open; 0 when none is. */
    let hairpin = 0
    let currentKey = score.key
    for (const [index, item] of timed.entries()) {
      const decorations = item.decorations.map(canonical)
      // THE HAIRPIN MOVES FIRST AND THE DYNAMIC OVERRIDES IT, which is abcjs's order in
      // its own loop: the crescendo increment is applied at the top of the `note` arm and
      // `setDynamics` is called immediately after (`abc_midi_sequencer.js:229-245`).
      //
      // AND ONLY IN THE `note` ARM. A bar row is here so the hairpin's CLOSE can be found
      // on it; letting one step the volume as well put every bar of `flatten-dynamics2`
      // four louder than abcjs's.
      if (item.kind === 'note' && hairpin !== 0) {
        stress = [stress[0] + hairpin, stress[1] + hairpin, stress[2] + hairpin]
      }
      const named = DYNAMIC_ORDER.find((d) => decorations.includes(d))
      if (named !== undefined) {
        stress = [...(DYNAMIC_VOLUMES[named] as readonly [number, number, number])]
        hairpin = 0
      }
      if (decorations.includes('crescendo(')) {
        hairpin = hairpinStep(timed, index, stress[0], 'crescendo)', CRESCENDO_SIZE)
      } else if (decorations.includes('diminuendo(')) {
        hairpin = hairpinStep(timed, index, stress[0], 'diminuendo)', -CRESCENDO_SIZE)
      } else if (decorations.includes('crescendo)') || decorations.includes('diminuendo)')) {
        hairpin = 0
      }
      if (item.key !== currentKey) {
        currentKey = item.key
        accidentals = keyAccidentals(item.key)
      }
      if (item.meter !== null && item.meter !== meter) {
        meter = item.meter
        chordTrack.setMeter({ num: meter.numerator, den: meter.denominator })
      }
      if (item.barStart) barAccidentals = new Map()
      const start = item.time / MICRO
      chordTrack.setTempoChangeFactor(item.factor)
      if (item.kind === 'bar') {
        // The bar CLOSES here: the measure's chords are laid onto the meter's pattern and
        // only then does `lastBarTime` move on, which is the order abcjs's own `case "bar"`
        // arm takes (`abc_midi_flattener.js:157-165`).
        chordTrack.barEnd(start)
        lastBarTime = start
        chordTrack.setLastBarTime(lastBarTime)
        continue
      }
      const realDuration = Math.round(item.duration * item.factor * MICRO) / MICRO
      totalDuration = Math.max(totalDuration, start + realDuration)
      // A REST CARRIES ITS CHORD SYMBOL, and so does the silent half of a tie. abcjs's
      // `writeNote` runs `chordTrack.processChord(elem)` before it looks at the pitches at
      // all, and its `el_type: "note"` covers rests — so `"C"z4|` is a whole bar of chord
      // track over silence, which is most of `flatten-all-time-sigs`. Skipping the event
      // first left eight cases with no chord track to compare.
      if (item.event !== null) {
        chordTrack.processChord(chordSymbolOf(item.event), annotationsOf(item.event), start)
      }
      if (item.event === null || item.event.type === 'rest' || item.tiedOver) continue

      const volume = stressVolume(start, lastBarTime, meter, pickupLength, voiceOff, stress)
      // A CHORD SOUNDS FROM THE BOTTOM UP, whatever order it was written in. abcjs's parser
      // sorts `elem.pitches`, so `[cD]` emits D and then c; ours keeps the source order, so
      // the sort is here. `volume-in-chords` is the whole of it: pitch 62 where we had 72.
      const pitches =
        item.event.type === 'chord'
          ? [...item.event.pitches].sort(
              (a, b) => a.octave * 7 + stepIndex(a.step) - (b.octave * 7 + stepIndex(b.step)),
            )
          : [item.event.pitch]
      const mods = noteModifications(decorations, volume)
      slurCount += slurStartsOf(item.event)
      for (const written of pitches) {
        const transpose = item.clefTranspose !== 0 ? item.clefTranspose : transposeGlobal
        // `V:… octave=` IS ALREADY IN THE PITCH — in BOTH engines — and the model's comment
        // says otherwise. Measured: `V:2 octave=-2` parses `B` as octave 2 while also
        // reporting `octaveShift: -2`, and abcjs's own answer for the same voice under a
        // plain bass clef is 47, the shifted pitch with no transpose at all. So the shift is
        // spent once, in the pitch, and `octave=` is NOT one of the things that becomes a
        // `transpose` element. Reading it here as well put the voice an octave and a half
        // low — 23 against 47.
        const raw =
          midiPitchOf(written, accidentals, barAccidentals, quarterAlter(item.event)) + transpose
        const { pitch, cents } = adjustForMicroTone(raw)
        const event: MidiNote = {
          cmd: 'note',
          pitch,
          volume: mods.velocity ?? volume,
          start,
          duration: realDuration,
          instrument: program,
          ...endTypeAndGap(mods.endType, slurCount, realDuration, startingTempo),
          ...(cents === undefined ? {} : { cents }),
        }
        track.push(event)
      }
      slurCount -= slurEndsOf(item.event)
    }
    tracks.push(track)
    chordTrack.finish()
  })

  chordTrack.addTrack(tracks as never)

  return {
    tempo: startingTempo,
    instrument: instrument ?? 0,
    totalDuration: Math.round(totalDuration * MICRO) / MICRO,
    tracks,
  }
}

const chordSymbolOf = (event: MusicEvent): string | null => event.chordSymbol
const annotationsOf = (event: MusicEvent): readonly string[] => event.annotations

/** A microtone's alteration in abcjs's units — `^/` is +0.25, `_3/2` is -0.75. */
function quarterAlter(event: MusicEvent): number | null {
  const cents = event.type === 'rest' ? 0 : event.microtoneCents
  return cents === 0 ? null : cents / 200
}

/** `startSlur`/`endSlur` counts, which a chord carries on its own events. */
const slurStartsOf = (event: MusicEvent): number =>
  event.type === 'note' ? event.slurStarts : event.type === 'chord' ? event.slurStarts : 0
const slurEndsOf = (event: MusicEvent): number =>
  event.type === 'note' ? event.slurEnds : event.type === 'chord' ? event.slurEnds : 0

/**
 * abcjs's `processVolume`, and it is a BEAT-STRESS model rather than a dynamic one.
 *
 * The bar's first note is 105, any note landing on a whole beat is 95, everything else is
 * 85 — and a note inside the PICKUP takes the weak 85 whatever beat it lands on
 * (`abc_midi_flattener.js:352-391`). `!p!` and friends override it outright; those are the
 * `vol` elements, which arrive separately.
 */
function stressVolume(
  start: number,
  lastBarTime: number,
  meter: Meter,
  pickupLength: number,
  voiceOff: boolean,
  stress: readonly [number, number, number],
): number {
  if (voiceOff) return 0
  const clamp = (v: number) => Math.max(0, Math.min(127, v))
  if (pickupLength > start) return clamp(stress[2])
  const barBeat = (start - lastBarTime) / beatFractionOf(meter)
  if (barBeat === 0) return clamp(stress[0])
  return clamp(Number.isInteger(barBeat) ? stress[1] : stress[2])
}

/**
 * `numNotesToDecoration` and `endingVolume`, folded into the one number they produce.
 *
 * The hairpin's total travel is divided by how many NOTES are under it and floored, so a
 * crescendo over three notes steps by 16 and not by 16.67. If a named dynamic sits within
 * TWO events of the close, abcjs takes that as the destination instead of the flat 50
 * (`endingVolume`, "If we have a volume within a couple notes of the end then assume that
 * is the destination").
 */
function hairpinStep(
  timed: readonly Timed[],
  index: number,
  from: number,
  close: string,
  size: number,
): number {
  const line = timed[index]?.line
  let notes = 0
  let end = timed.length
  for (let i = index + 1; i < timed.length && timed[i]?.line === line; i += 1) {
    if (timed[i]?.kind === 'note') notes += 1
    if ((timed[i]?.decorations ?? []).map(canonical).includes(close)) {
      end = i
      break
    }
  }
  let target = size > 0 ? Math.min(127, from + size) : Math.max(15, from + size)
  // `endingVolume` — "If we have a volume within a couple notes of the end then assume
  // that is the destination." Three ELEMENTS, not three notes, and it starts one past the
  // close.
  for (let i = end + 1; i < Math.min(timed.length, end + 4); i += 1) {
    if (timed[i]?.line !== line) break
    if (timed[i]?.kind !== 'note') continue
    const named = DYNAMIC_ORDER.find((d) =>
      (timed[i]?.decorations ?? []).map(canonical).includes(d),
    )
    if (named !== undefined) {
      target = (DYNAMIC_VOLUMES[named] as readonly number[])[0] as number
      break
    }
  }
  return notes > 0 ? Math.floor((target - from) / notes) : 0
}

/** abcjs's `findNoteModifications`, minus the ornament rewrites — see the note below. */
function noteModifications(
  decorations: readonly string[],
  velocity: number,
): { endType?: string; velocity?: number } {
  const out: { endType?: string; velocity?: number } = {}
  for (const d of decorations) {
    if (d === 'staccato') out.endType = 'staccato'
    else if (d === 'tenuto') out.endType = 'tenuto'
    else if (d === 'accent') out.velocity = Math.min(127, velocity * 1.5)
  }
  return out
}

/**
 * The gap after a note, which is abcjs's articulation model and is three different units.
 *
 * A slurred note OVERLAPS the next by a millisecond; a staccato one is cut by 0.4 of its
 * own duration converted through the tempo; everything else has no gap at all
 * (`abc_midi_flattener.js:605-616`). A SLUR beats the note's own decoration, because the
 * `endType` is set from `slurCount` first and the decoration only fills in when no slur is
 * open.
 */
function endTypeAndGap(
  decorationEnd: string | undefined,
  slurCount: number,
  duration: number,
  startingTempo: number,
): { endType?: string; gap: number } {
  const endType = slurCount > 0 ? 'tenuto' : decorationEnd
  switch (endType) {
    case 'tenuto':
      return { endType, gap: SLURRED_GAP }
    case 'staccato':
      return { endType, gap: (startingTempo / 60) * (duration * STACCATO_FRACTION) }
    default:
      return { gap: NORMAL_GAP }
  }
}

/**
 * abcjs's `adjustPitch`, in our pitch model.
 *
 * `extractOctave(pitch) * 12 + scale[extractNote(pitch)] + 60` — where abcjs's `pitch` is
 * an index with 0 at middle C, so ours is the same number written as a scientific octave.
 * An explicit accidental is recorded for the rest of the BAR at that written pitch and
 * supersedes the key; without one the key's alteration applies.
 */
function midiPitchOf(
  pitch: { step: string; octave: number; accidental: number | null },
  accidentals: readonly number[],
  barAccidentals: Map<string, number>,
  quarter: number | null = null,
): number {
  const step = stepIndex(pitch.step as never)
  const name = `${pitch.step}${pitch.octave}`
  // A QUARTER-TONE ACCIDENTAL IS 0.25, NOT THE PRINTED SIGN. Our model keeps the drawn
  // accidental and records the sounding deviation beside it in `microtoneCents`; abcjs has
  // one number and marks the fraction. Passing the printed sharp through here would sound
  // `^/G` a full semitone up and then bend it further.
  if (quarter !== null) barAccidentals.set(name, quarter)
  else if (pitch.accidental !== null) barAccidentals.set(name, pitch.accidental)
  const base = (pitch.octave - 4) * 12 + (SEMITONES[step] ?? 0) + 60
  const alter = barAccidentals.get(name) ?? accidentals[step] ?? 0
  return base + alter
}

/**
 * abcjs's `adjustForMicroTone` — a quarter tone is a WHOLE pitch plus a PITCH BEND.
 *
 *     if (pitch.indexOf(".75") >= 0) { pitch = Math.round(pitch); cents = -50 }
 *     else if (pitch.indexOf(".25") >= 0) { pitch = Math.round(pitch); cents = 50 }
 *
 * (`abc_midi_flattener.js:735-747`, and yes it tests the decimal as a STRING.) A synth is
 * handed an integer note and a detune, never a fractional MIDI pitch, so `70.5` is not a
 * near miss — it is the wrong KIND of answer.
 */
function adjustForMicroTone(pitch: number): { pitch: number; cents?: number } {
  const text = String(pitch)
  if (text.includes('.75')) return { pitch: Math.round(pitch), cents: -50 }
  if (text.includes('.25')) return { pitch: Math.round(pitch), cents: 50 }
  return { pitch }
}
