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
  type Voice,
} from '../core/model.js'

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
}

/** `%%MIDI` settings gathered off the tune — abcjs's `tune.formatting.midi`. */
export interface MidiDirectives {
  readonly program?: readonly number[]
  readonly channel?: readonly number[]
  readonly transpose?: readonly number[]
}

const MICRO = 1000000

/** abcjs's `scale` — semitones above the tonic for each diatonic step. */
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]

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
  // `K:… ^f _b` and the like WIN over the signature they follow, and a quarter-tone
  // accidental carries its quarter through — abcjs stores the key's extras in the same
  // array the notes read.
  for (const extra of key.extra ?? []) {
    const step = stepIndex(extra.step)
    if (step >= 0) out[step] = extra.quarters / 2
  }
  return out
}

interface Timed {
  readonly event: MusicEvent
  /** Whole notes × 1,000,000, accumulated as an integer exactly as abcjs does. */
  readonly time: number
  /** True on the first event of a measure — where the beat-stress clock restarts. */
  readonly barStart: boolean
  readonly key: KeySignature
  readonly meter: Meter | null
  /** Sounding duration in whole notes, with a tie's continuation already folded in. */
  readonly duration: number
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
function sequenceVoice(voice: Voice, score: Score): Timed[] {
  const out: Timed[] = []
  let time = 0
  let key = score.key
  let meter = score.meter
  /** Open ties, keyed by written pitch, holding the index into `out` that owns them. */
  const ties = new Map<string, number>()
  const durations: number[] = []

  for (const measure of voice.measures) {
    if (measure.keyChange !== null) key = measure.keyChange
    if (measure.meterChange !== null) meter = measure.meterChange
    let first = true
    for (const event of measure.events) {
      const dur = ratToNumber(event.duration)
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
      out.push({ event, time, barStart: first, key, meter, duration: dur, tiedOver })
      durations.push(tiedOver ? 0 : dur)
      time += Math.round(dur * MICRO)
      first = false
    }
  }
  return out.map((t, i) => ({ ...t, duration: durations[i] ?? t.duration }))
}

/** abcjs's `interpretTempo`: `Q:` is stated at some beat, the sequencer wants another. */
function qpmOf(score: Score, options: AudioOptions): number {
  if (options.qpm !== undefined) return Math.trunc(options.qpm)
  const tempo = score.tempo
  if (tempo !== null && tempo.bpm !== null) {
    const unit: Rational | null = tempo.beatUnit
    const duration = unit === null ? 0.25 : ratToNumber(unit)
    return (duration * tempo.bpm) / beatLengthOf(score.meter)
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
    // The measure boundary IS the barline abcjs stops at.
    return pickup
  }
  return pickup
}

export function flattenAudio(
  score: Score,
  options: AudioOptions = {},
  midi: MidiDirectives = {},
): FlatAudio {
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
    const transpose = transposeGlobal + voice.octaveShift * 12

    const timed = sequenceVoice(voice, score)
    let currentKey = score.key
    for (const item of timed) {
      if (item.key !== currentKey) {
        currentKey = item.key
        accidentals = keyAccidentals(item.key)
      }
      if (item.meter !== null) meter = item.meter
      if (item.barStart) {
        barAccidentals = new Map()
        lastBarTime = item.time / MICRO
      }
      const start = item.time / MICRO
      const realDuration = Math.round(item.duration * MICRO) / MICRO
      totalDuration = Math.max(totalDuration, start + realDuration)
      if (item.event.type === 'rest' || item.tiedOver) continue

      const volume = stressVolume(start, lastBarTime, meter, pickupLength, voiceOff)
      const pitches = item.event.type === 'chord' ? item.event.pitches : [item.event.pitch]
      const mods = noteModifications(item.event.decorations, volume)
      slurCount += slurStartsOf(item.event)
      for (const written of pitches) {
        const pitch = midiPitchOf(written, accidentals, barAccidentals) + transpose
        const event: MidiNote = {
          cmd: 'note',
          pitch,
          volume: mods.velocity ?? volume,
          start,
          duration: realDuration,
          instrument: program,
          ...endTypeAndGap(mods.endType, slurCount, realDuration, startingTempo),
        }
        track.push(event)
      }
      slurCount -= slurEndsOf(item.event)
    }
    tracks.push(track)
  })

  return {
    tempo: startingTempo,
    instrument: instrument ?? 0,
    totalDuration: Math.round(totalDuration * MICRO) / MICRO,
    tracks,
  }
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
): number {
  if (voiceOff) return 0
  if (pickupLength > start) return 85
  const barBeat = (start - lastBarTime) / beatFractionOf(meter)
  if (barBeat === 0) return 105
  return Number.isInteger(barBeat) ? 95 : 85
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
): number {
  const step = stepIndex(pitch.step as never)
  const name = `${pitch.step}${pitch.octave}`
  if (pitch.accidental !== null) barAccidentals.set(name, pitch.accidental)
  const base = (pitch.octave - 4) * 12 + (SEMITONES[step] ?? 0) + 60
  const alter = barAccidentals.get(name) ?? accidentals[step] ?? 0
  return base + alter
}
