import {
  Accidental,
  type DiatonicStep,
  type KeySignature,
  type Measure,
  type MusicEvent,
  type Pitch,
  type Score,
  type Voice,
} from '../core/model.js'
import { keyAccidentals, type KeyAccidental, transposeChordName } from '../str/keys.js'

/**
 * `%%visualTranspose n` / the `visualTranspose` render param — **EVERY PITCH MOVED AT
 * PARSE TIME**, key signature and spelling with it (`parse/abc_transpose.js`).
 *
 * It is not the same operation as `strTranspose`: that one rewrites the SOURCE and this
 * one rewrites the parsed music, so a host asking for it gets a transposed DRAWING from an
 * untouched string. abcjs applies it inside the parser; ours is a transform over the
 * finished `Score`, which is the same thing because `accidentalChange` is written against
 * the ORIGINAL and TARGET key signatures explicitly rather than against running state.
 */

const STEPS: readonly DiatonicStep[] = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

/** abcjs's `keyIndex` — semitones from C, both spellings of every black note. */
const KEY_INDEX: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

/** …and the two tables it picks a spelling FROM. A minor key prefers sharps. */
const NEW_KEY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const NEW_KEY_MINOR = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

const MODE_SUFFIX: Readonly<Record<string, string>> = {
  major: '',
  minor: 'm',
  mixolydian: 'Mix',
  dorian: 'Dor',
  phrygian: 'Phr',
  lydian: 'Lyd',
  locrian: 'Loc',
}

interface Transposition {
  /** The key the music is now in. */
  readonly key: KeySignature
  /** Diatonic steps every pitch moves — abcjs's `localTransposeVerticalMovement`. */
  readonly movement: number
  /** The key signature as WRITTEN, for `accidentalChange`. */
  readonly origAccidentals: readonly KeyAccidental[]
  readonly newAccidentals: readonly KeyAccidental[]
  /** Whether chord symbols should be spelled with flats. */
  readonly preferFlats: boolean
}

const keyName = (key: KeySignature): string =>
  `${key.tonic.step.toUpperCase()}${accSuffix(key.tonic.accidental)}${MODE_SUFFIX[key.mode] ?? ''}`

const accSuffix = (acc: Accidental | null): string =>
  acc === Accidental.sharp ? '#' : acc === Accidental.flat ? 'b' : ''

/**
 * `transpose.keySignature` — the new key AND the diatonic distance every note moves.
 *
 * **THE DISTANCE IS A LETTER DISTANCE, NOT A SEMITONE ONE**, and the equal-letter case is
 * abcjs's own comment: `Ab -> A` going up must gain an octave and `A -> Ab` going down must
 * lose one, because the letters are the same and the pitch is not
 * (`abc_transpose.js:70-92`).
 */
function plan(key: KeySignature, steps: number): Transposition | null {
  const written = keyName(key)
  const orig = keyAccidentals(written)
  // A key we do not recognise is left alone — abcjs will not attempt to transpose it.
  if (orig === null) return null
  if (steps === 0) return null

  let base = written[0] ?? 'C'
  let rest = written.slice(1)
  if (rest[0] === 'b' || rest[0] === '#') {
    base += rest[0]
    rest = rest.slice(1)
  }
  const thisIndex = KEY_INDEX[base]
  const recognized = thisIndex !== undefined

  // **AN EXACT OCTAVE MOVES THE NOTES AND LEAVES THE KEY** (`abc_transpose.js:42-46`).
  if (steps % 12 === 0) {
    return {
      key,
      movement: (steps / 12) * 7,
      origAccidentals: orig,
      newAccidentals: orig,
      preferFlats: false,
    }
  }

  const from = recognized ? thisIndex : 0
  const fromKey = recognized ? base : 'C'
  const modeText = recognized ? rest : ''
  let index = from + steps
  while (index < 0) index += 12
  if (index > 11) index = index % 12
  const spelled = (modeText[0] === 'm' ? NEW_KEY_MINOR[index] : NEW_KEY[index]) ?? 'C'
  const transposed = spelled + modeText
  const newSig = keyAccidentals(transposed) ?? []
  // A key of C and every flat key gets chords spelled with flats.
  const preferFlats = newSig.length === 0 || newSig[0]?.acc === 'flat'

  let distance = transposed.charCodeAt(0) - fromKey.charCodeAt(0)
  if (steps > 0) {
    if (distance < 0) distance += 7
    else if (distance === 0 && (fromKey[1] === '#' || transposed[1] === 'b')) distance += 7
  } else if (steps < 0) {
    if (distance > 0) distance -= 7
    else if (distance === 0 && (fromKey[1] === 'b' || transposed[1] === '#')) distance -= 7
  }
  const movement =
    steps > 0
      ? distance + Math.floor(steps / 12) * 7
      : distance + Math.ceil(steps / 12) * 7

  if (!recognized) {
    return { key, movement, origAccidentals: orig, newAccidentals: [], preferFlats }
  }
  return {
    key: {
      ...key,
      tonic: {
        step: (spelled[0] ?? 'C').toLowerCase() as DiatonicStep,
        accidental: (spelled[1] === '#'
          ? Accidental.sharp
          : spelled[1] === 'b'
            ? Accidental.flat
            : null) as KeySignature['tonic']['accidental'],
      },
    },
    movement,
    origAccidentals: orig,
    newAccidentals: newSig,
    preferFlats,
  }
}

/** A key signature's alteration on a letter, in semitones. */
const alterationOf = (sig: readonly KeyAccidental[], letter: string): number => {
  for (const a of sig) {
    if (a.note.toLowerCase() === letter) return a.acc === 'flat' ? -1 : 1
  }
  return 0
}

/**
 * `accidentalChange` — **THE ACCIDENTAL IS RE-DERIVED FROM THE TWO KEY SIGNATURES**, not
 * carried, and it can move the pitch by another letter when the answer needs more than a
 * double sharp or flat (`abc_transpose.js:107-136`).
 */
function movedAccidental(
  origStep: DiatonicStep,
  newStep: DiatonicStep,
  accidental: Accidental,
  t: Transposition,
): { shift: number; accidental: Accidental } {
  const delta = accidental - alterationOf(t.origAccidentals, origStep)
  let calc = delta + alterationOf(t.newAccidentals, newStep)
  let shift = 0
  if (calc < -2) {
    shift = -1
    calc += newStep === 'c' || newStep === 'f' ? 1 : 2
  }
  if (calc > 2) {
    shift = 1
    calc -= newStep === 'b' || newStep === 'e' ? 1 : 2
  }
  return { shift, accidental: Math.max(-2, Math.min(2, calc)) as Accidental }
}

/** A pitch moved by `n` diatonic steps, carrying the octave. */
function movePitch(pitch: Pitch, n: number, t: Transposition): Pitch {
  const at = STEPS.indexOf(pitch.step) + n
  let step = STEPS[((at % 7) + 7) % 7] ?? 'c'
  let octave = pitch.octave + Math.floor(at / 7)
  if (pitch.accidental !== null) {
    const moved = movedAccidental(pitch.step, step, pitch.accidental, t)
    if (moved.shift !== 0) {
      const at2 = STEPS.indexOf(step) + moved.shift
      step = STEPS[((at2 % 7) + 7) % 7] ?? 'c'
      octave += Math.floor(at2 / 7)
    }
    // **THE WRITTEN NAME GOES WITH IT.** `el.name` is what a notehead's `data-name`
    // carries, and abcjs rewrites it in the same breath (`abc_transpose.js:167-181`).
    return { ...omitName(pitch), step, octave, accidental: moved.accidental }
  }
  return { ...omitName(pitch), step, octave, accidental: null }
}

/**
 * The written spelling cannot survive a transposition — `c,` transposed is not `c,` — and
 * a stale one would name the notehead wrongly. Dropping it makes the renderer derive one.
 */
const omitName = (pitch: Pitch): Pitch => {
  const { written: _w, writtenAccidental: _a, ...rest } = pitch
  return rest as Pitch
}

/**
 * `%%visualTranspose n` applied to a whole score. Returns the score unchanged when there
 * is nothing to do, so the common path allocates nothing.
 */
export function visualTranspose(score: Score, steps: number): Score {
  if (!steps) return score
  // A PERCUSSION or CLEF-LESS staff is never transposed (`abc_transpose.js:30-31`).
  if (score.clef?.shape === 'percussion') return score
  const t = plan(score.key, steps)
  if (t === null) return score

  const pitch = (p: Pitch): Pitch => movePitch(p, t.movement, t)
  const event = (e: MusicEvent): MusicEvent => {
    const chord =
      e.chordSymbol == null
        ? {}
        : { chordSymbol: transposeChordName(e.chordSymbol, steps, t.preferFlats, true) }
    if (e.type === 'rest') return { ...e, ...chord }
    if (e.type === 'note') {
      return {
        ...e,
        ...chord,
        pitch: pitch(e.pitch),
        graceNotes: e.graceNotes.map((g) => ({ ...g, ...pitch(g) })),
      }
    }
    return {
      ...e,
      ...chord,
      pitches: e.pitches.map(pitch),
      graceNotes: e.graceNotes.map((g) => ({ ...g, ...pitch(g) })),
    }
  }
  const measure = (m: Measure): Measure => ({
    ...m,
    events: m.events.map(event),
    overlays: m.overlays.map((o) => o.map(event)),
    ...(m.keyChange === null ? {} : { keyChange: plan(m.keyChange, steps)?.key ?? m.keyChange }),
  })
  const voice = (v: Voice): Voice => ({ ...v, measures: v.measures.map(measure) })
  return { ...score, key: t.key, voices: score.voices.map(voice) }
}
