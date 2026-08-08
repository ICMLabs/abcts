/**
 * THE GUITAR-CHORD TRACK — abcjs's `chord-track.js`, and it is a whole voice of its own.
 *
 * A `"C"` above the staff does not sound where it is written. abcjs collects the chords of
 * a MEASURE, expands them across the bar's eighth-note grid, and then plays a boom-chick
 * pattern chosen by the METER over that grid — so `"C"` on the first beat of 4/4 becomes a
 * bass note, a chord, a bass note a fourth below and a chord again, none of which is at the
 * chord symbol's own time. Its own header says it in one line: *"the pattern of chord
 * expression depends on the meter, and how many chords are in a measure."*
 *
 * It is why twenty-five of the fifty-four flattener cases could not report anything at all
 * — every one of them stopped at `1 tracks vs 2`.
 *
 * ── THE PARTS, AND WHAT EACH IS FOR ──────────────────────────────────────────
 * `interpretChord` turns `"Cmaj7/E"` into `{boom, boom2, chick[]}` — a root, an alternating
 * root a fourth below, and the chord notes an octave above it. `resolveChords` lays those
 * onto the meter's pattern once a bar has closed. `expandCurrentChords` fills the grid, so a
 * chord written mid-bar takes over from where it stands.
 *
 * ── THE TWO RULES THAT ARE NOT OBVIOUS ───────────────────────────────────────
 * ONE TRACK, FROM ONE VOICE. The first voice that carries any chord gets the track, and
 * `finish()` closes it — a second voice's chords are dropped rather than merged.
 * A SHORT BAR REPLACES THE PATTERN. If the measure does not hold a whole bar's worth
 * (a pickup, or a bar split across a line), the meter's pattern is thrown away and a plain
 * alternating chick is generated for as many beats as are actually present.
 */

/** One `{cmd:'note'}` row on the chord track, in the flattener's own shape. */
export interface ChordEvent {
  readonly cmd: 'note' | 'program'
  readonly pitch?: number
  readonly volume?: number
  readonly start?: number
  readonly duration?: number
  readonly gap?: number
  readonly instrument?: number
  readonly channel?: number
}

/**
 * A `break` — `"n.c."`, `%%MIDI gchordoff`, `chordsOff` — is `{ chick: [] }` with NO boom
 * at all, and the absence is what silences it: `resolvePitch` pushes `currentChord.boom`
 * unread, and `writeNote` skips an undefined pitch. Giving the break a boom of 0 wrote a
 * track full of MIDI note 0 and `chordTrackEmpty` then reported the track as present.
 */
interface Interpreted {
  readonly boom?: number
  readonly boom2?: number
  readonly chick: readonly number[]
}

export interface ChordOptions {
  readonly bassprog?: readonly number[]
  readonly chordprog?: readonly number[]
  readonly bassvol?: readonly number[]
  readonly chordvol?: readonly number[]
  readonly gchord?: readonly string[]
}

const MICRO = 1000000

/** The MIDI pitch of each chord root, as abcjs's own `basses` table gives it. */
const BASSES: Readonly<Record<string, number>> = {
  A: 33,
  B: 35,
  C: 36,
  D: 38,
  E: 40,
  F: 41,
  G: 43,
}

const BREAK_SYNONYMS = ['break', '(break)', 'no chord', 'n.c.', 'tacet']

/** `"^break"` → `break`. ABC's five annotation positions, stripped as abcjs's parser does. */
const annotationName = (text: string): string =>
  '^_<>@'.includes(text[0] ?? '') ? text.slice(1) : text

/**
 * abcjs's `chordIntervals`, verbatim — semitones above the root for every modifier it
 * knows. An unknown modifier falls back to a major triad, except that anything starting
 * `ma`/`M` is major and anything starting `m`/`-` is minor.
 */
const CHORD_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  dim: [0, 3, 6],
  '°': [0, 3, 6],
  '˚': [0, 3, 6],
  dim7: [0, 3, 6, 9],
  '°7': [0, 3, 6, 9],
  '˚7': [0, 3, 6, 9],
  ø7: [0, 3, 6, 10],
  'm7(b5)': [0, 3, 6, 10],
  m7b5: [0, 3, 6, 10],
  'm7♭5': [0, 3, 6, 10],
  '-7(b5)': [0, 3, 6, 10],
  '-7b5': [0, 3, 6, 10],
  '7b5': [0, 4, 6, 10],
  '7(b5)': [0, 4, 6, 10],
  '7♭5': [0, 4, 6, 10],
  '7(b9,b5)': [0, 4, 6, 10, 13],
  '7b9,b5': [0, 4, 6, 10, 13],
  '7(#9,b5)': [0, 4, 6, 10, 15],
  '7#9b5': [0, 4, 6, 10, 15],
  'maj7(b5)': [0, 4, 6, 11],
  maj7b5: [0, 4, 6, 11],
  '13(b5)': [0, 4, 6, 10, 14, 21],
  '13b5': [0, 4, 6, 10, 14, 21],
  m: [0, 3, 7],
  '-': [0, 3, 7],
  m6: [0, 3, 7, 9],
  '-6': [0, 3, 7, 9],
  m7: [0, 3, 7, 10],
  '-7': [0, 3, 7, 10],
  '-(b6)': [0, 3, 7, 8],
  '-b6': [0, 3, 7, 8],
  '-6/9': [0, 3, 7, 9, 14],
  '-7(b9)': [0, 3, 7, 10, 13],
  '-7b9': [0, 3, 7, 10, 13],
  '-maj7': [0, 3, 7, 11],
  '-9+7': [0, 3, 7, 11, 13],
  '-11': [0, 3, 7, 11, 14, 17],
  m11: [0, 3, 7, 11, 14, 17],
  '-maj9': [0, 3, 7, 11, 14],
  '-∆9': [0, 3, 7, 11, 14],
  mM9: [0, 3, 7, 11, 14],
  M: [0, 4, 7],
  '6': [0, 4, 7, 9],
  '6/9': [0, 4, 7, 9, 14],
  '6add9': [0, 4, 7, 9, 14],
  '69': [0, 4, 7, 9, 14],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  '11': [0, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7♭9': [0, 4, 7, 10, 13],
  '7(b9)': [0, 4, 7, 10, 13],
  '7(#9)': [0, 4, 7, 10, 15],
  '7#9': [0, 4, 7, 10, 15],
  '(13)': [0, 4, 7, 10, 14, 21],
  '7(9,13)': [0, 4, 7, 10, 14, 21],
  '7(#9,b13)': [0, 4, 7, 10, 15, 20],
  '7(#11)': [0, 4, 7, 10, 14, 18],
  '7#11': [0, 4, 7, 10, 14, 18],
  '7(b13)': [0, 4, 7, 10, 20],
  '7b13': [0, 4, 7, 10, 20],
  '9(#11)': [0, 4, 7, 10, 14, 18],
  '9#11': [0, 4, 7, 10, 14, 18],
  '13(#11)': [0, 4, 7, 10, 18, 21],
  '13#11': [0, 4, 7, 10, 18, 21],
  maj7: [0, 4, 7, 11],
  '∆7': [0, 4, 7, 11],
  Δ7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  'maj7(9)': [0, 4, 7, 11, 14],
  'maj7(11)': [0, 4, 7, 11, 17],
  'maj7(#11)': [0, 4, 7, 11, 18],
  'maj7(13)': [0, 4, 7, 14, 21],
  'maj7(9,13)': [0, 4, 7, 11, 14, 21],
  '7sus4': [0, 5, 7, 10],
  m7sus4: [0, 3, 7, 10, 17],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus2': [0, 2, 7, 10],
  '9sus4': [0, 5, 7, 10, 14],
  '13sus4': [0, 5, 7, 10, 14, 21],
  aug7: [0, 4, 8, 10],
  '+7': [0, 4, 8, 10],
  '+': [0, 4, 8],
  '7#5': [0, 4, 8, 10],
  '7♯5': [0, 4, 8, 10],
  '7+5': [0, 4, 8, 10],
  '9#5': [0, 4, 8, 10, 14],
  '9♯5': [0, 4, 8, 10, 14],
  '9+5': [0, 4, 8, 10, 14],
  '-7(#5)': [0, 3, 8, 10],
  '-7#5': [0, 3, 8, 10],
  '7(#5)': [0, 4, 8, 10],
  '7(b9,#5)': [0, 4, 8, 10, 13],
  '7b9#5': [0, 4, 8, 10, 13],
  'maj7(#5)': [0, 4, 8, 11],
  'maj7#5': [0, 4, 8, 11],
  'maj7(#5,#11)': [0, 4, 8, 11, 18],
  'maj7#5#11': [0, 4, 8, 11, 18],
  '9(#5)': [0, 4, 8, 10, 14],
  '13(#5)': [0, 4, 8, 10, 14, 21],
  '13#5': [0, 4, 8, 10, 14, 21],
  '5': [0, 7],
  '5(8)': [0, 7, 12],
  '5add8': [0, 7, 12],
}

/** One entry per EIGHTH of the bar. `''` is silence. */
const RHYTHM_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  '2/2': ['boom', '', '', '', 'chick', '', '', ''],
  '3/2': ['boom', '', '', '', 'chick', '', '', '', 'chick', '', '', ''],
  '4/2': ['boom', '', '', '', 'chick', '', '', '', 'boom', '', '', '', 'chick', '', '', ''],
  '2/4': ['boom', '', 'chick', ''],
  '3/4': ['boom', '', 'chick', '', 'chick', ''],
  '4/4': ['boom', '', 'chick', '', 'boom', '', 'chick', ''],
  '5/4': ['boom', '', 'chick', '', 'chick', '', 'boom', '', 'chick', ''],
  '6/4': ['boom', '', 'chick', '', 'boom', '', 'chick', '', 'boom', '', 'chick', ''],
  '3/8': ['boom', '', 'chick'],
  '5/8': ['boom', 'chick', 'chick', 'boom', 'chick'],
  '6/8': ['boom', '', 'chick', 'boom', '', 'chick'],
  '7/8': ['boom', 'chick', 'chick', 'boom', 'chick', 'boom', 'chick'],
  '9/8': ['boom', '', 'chick', 'boom', '', 'chick', 'boom', '', 'chick'],
  '10/8': ['boom', 'chick', 'chick', 'boom', 'chick', 'chick', 'boom', 'chick', 'boom', 'chick'],
  '11/8': [
    'boom',
    'chick',
    'chick',
    'boom',
    'chick',
    'chick',
    'boom',
    'chick',
    'boom',
    'chick',
    'chick',
  ],
  '12/8': ['boom', '', 'chick', 'boom', '', 'chick', 'boom', '', 'chick', 'boom', '', 'chick'],
}

/** `%%MIDI gchord` — one pattern slot per character. */
const GCHORD_LETTERS: Readonly<Record<string, string>> = {
  z: '',
  // TODO in abcjs too: "This should extend the last note, but that's a small effect".
  '2': '',
  c: 'chick',
  b: 'boom&chick',
  f: 'boom',
  G: 'DO',
  H: 'MI',
  I: 'SOL',
  J: 'TI',
  K: 'TOP',
  g: 'do',
  h: 'mi',
  i: 'sol',
  j: 'ti',
  k: 'top',
}

const durationRounded = (duration: number, factor: number): number =>
  Math.round(duration * factor * MICRO) / MICRO

export class ChordTrack {
  private readonly track: ChordEvent[] = []
  private finished = false
  private readonly channel: number
  private current: { chord: Interpreted; beat: number }[] = []
  private last: Interpreted | undefined
  private lastBar: Interpreted | undefined
  private readonly chordsOff: boolean
  private tacet: boolean
  private rhythmHead = false
  private transpose = 0
  private lastBarTime = 0
  private meter: { num: number; den: number }
  private factor = 1
  private bassInstrument: number
  private chordInstrument: number
  private bassOctaveShift: number
  private chordOctaveShift: number
  private boomVolume: number
  private chickVolume: number
  private override: readonly string[] | undefined

  constructor(
    numVoices: number,
    chordsOff: boolean,
    midi: ChordOptions,
    meter: { num: number; den: number },
  ) {
    this.channel = numVoices // first free channel for chords
    this.chordsOff = chordsOff
    this.tacet = chordsOff
    this.meter = meter
    this.bassInstrument = (midi.bassprog?.[0] as number | undefined) ?? 0
    this.chordInstrument = (midi.chordprog?.[0] as number | undefined) ?? 0
    this.bassOctaveShift = midi.bassprog?.length === 2 ? (midi.bassprog[1] as number) : 0
    this.chordOctaveShift = midi.chordprog?.length === 2 ? (midi.chordprog[1] as number) : 0
    this.boomVolume = midi.bassvol?.length === 1 ? (midi.bassvol[0] as number) : 64
    this.chickVolume = midi.chordvol?.length === 1 ? (midi.chordvol[0] as number) : 48
    this.override =
      midi.gchord !== undefined && midi.gchord.length > 0
        ? parseGChord(midi.gchord[0] as string)
        : undefined
  }

  setMeter(meter: { num: number; den: number }): void {
    this.meter = meter
  }
  setTempoChangeFactor(factor: number): void {
    this.factor = factor
  }
  setLastBarTime(time: number): void {
    this.lastBarTime = time
  }
  setTranspose(transpose: number): void {
    this.transpose = transpose
  }
  /**
   * `!style=rhythm!B` — the note plays the LAST CHORD instead of its own pitch.
   *
   * Returns that chord's CHICK, which the flattener uses in place of `elem.pitches`
   * (`abc_midi_flattener.js:563-565`, `chord-track.js:71-84`): a slash-head is a strum, so
   * `"C"…!style=rhythm!B` sounds C-E-G at the melody's own volume and instrument. The flag
   * it also sets is what makes the chord track SIT OUT that measure — the melody is
   * carrying the rhythm, so playing it twice would double it. Reset at every bar.
   */
  setRhythmHead(isRhythmHead: boolean): readonly number[] {
    this.rhythmHead = isRhythmHead
    return isRhythmHead ? (this.last?.chick ?? []) : []
  }
  /** `%%MIDI gchordoff` / `gchordon`. */
  gChordOn(tacet: boolean): void {
    if (!this.chordsOff) this.tacet = tacet
  }
  setGChord(pattern: string | undefined): void {
    this.override = pattern !== undefined && pattern.length > 0 ? parseGChord(pattern) : undefined
  }
  setBassProg(program: number, octaveShift = 0): void {
    this.bassInstrument = program
    this.bassOctaveShift = octaveShift
  }
  setChordProg(program: number, octaveShift = 0): void {
    this.chordInstrument = program
    this.chordOctaveShift = octaveShift
  }
  /** `%%MIDI bassvol` / `chordvol` mid-tune — abcjs's `paramChange` reads `element.param`. */
  setBassVol(volume: number): void {
    this.boomVolume = volume
  }
  setChordVol(volume: number): void {
    this.chickVolume = volume
  }

  /** A bar closed: lay the measure's chords onto the meter's pattern. */
  barEnd(barTime: number): void {
    if (this.track.length > 0 && !this.finished) {
      this.resolveChords(this.lastBarTime, barTime)
      this.current = []
    }
    this.lastBar = this.last
  }

  /** Only the FIRST voice with chords gets a track. */
  finish(): void {
    if (!this.isEmpty()) this.finished = true
  }

  isEmpty(): boolean {
    return !this.track.some((e) => e.cmd === 'note')
  }

  addTrack(tracks: ChordEvent[][]): void {
    if (!this.isEmpty()) tracks.push(this.track)
  }

  /** One event's chord symbol, if it has one worth sounding. */
  processChord(name: string | null, annotations: readonly string[], time: number): void {
    if (this.finished) return
    const chord = this.findChord(name, annotations)
    if (chord === null) return
    const c = this.interpretChord(chord)
    // An unrecognised root is ignored completely, as if the symbol were not there.
    if (c === undefined) return
    if (this.track.length === 0) {
      this.track.push({ cmd: 'program', channel: this.channel, instrument: this.chordInstrument })
    }
    this.last = c
    this.current.push({ chord: c, beat: (time - this.lastBarTime) * 8 })
  }

  private findChord(name: string | null, annotations: readonly string[]): string | null {
    if (this.tacet) return 'break'
    if (this.finished) return null
    if (name !== null && name.length > 0) return name
    for (const a of annotations) {
      // THE POSITION CHARACTER IS NOT PART OF THE NAME. abcjs splits `"^break"` into
      // `{position: 'above', name: 'break'}` in the parser and matches `ch.name` against
      // the synonyms; ours keeps the source spelling, so `^break` matched nothing and the
      // whole of `flatten-break`'s second bar kept strumming an A chord through a rest
      // that abcjs leaves silent.
      if (BREAK_SYNONYMS.includes(annotationName(a).toLowerCase())) return 'break'
    }
    return null
  }

  /** `[root][acc][modifier][/][bass][acc]` → the three things a boom-chick needs. */
  private interpretChord(nameIn: string): Interpreted | undefined {
    let name = nameIn
    if (name.length === 0) return undefined
    if (name === 'break') return { chick: [] }
    let root = name.substring(0, 1)
    if (root === '(') {
      name = name.substring(1, name.length - 1)
      if (name.length === 0) return undefined
      root = name.substring(0, 1)
    }
    let bass = BASSES[root]
    if (bass === undefined) return undefined
    // A chord never transposes more than an octave, and is folded back into A–G's range.
    let chordTranspose = this.transpose
    while (chordTranspose < -8) chordTranspose += 12
    while (chordTranspose > 8) chordTranspose -= 12
    bass += chordTranspose
    if (bass < 33) bass += 12
    else if (bass > 44) bass -= 12

    let unshiftedBass = bass
    bass += this.bassOctaveShift * 12
    let bass2 = bass - 5 // the alternating bass is a fourth below

    let remaining = name.substring(1)
    const acc = remaining.substring(0, 1)
    if (acc === 'b' || acc === '♭') {
      unshiftedBass -= 1
      bass -= 1
      bass2 -= 1
      remaining = remaining.substring(1)
    } else if (acc === '#' || acc === '♯') {
      unshiftedBass += 1
      bass += 1
      bass2 += 1
      remaining = remaining.substring(1)
    }
    const arr = remaining.split('/')
    const chick = this.chordNotes(unshiftedBass, arr[0] ?? '')
    // An altered fifth moves the alternating bass with it.
    if (chick.length >= 3) {
      const fifth = (chick[2] as number) - (chick[0] as number)
      bass2 = bass2 + fifth - 7
    }
    if (arr.length === 2) {
      const explicit = BASSES[(arr[1] as string).substring(0, 1)]
      if (explicit !== undefined) {
        const bassAcc = (arr[1] as string).substring(1)
        const shift = ({ '#': 1, '♯': 1, b: -1, '♭': -1 } as Record<string, number>)[bassAcc] ?? 0
        bass = explicit + shift + chordTranspose + this.bassOctaveShift * 12
        bass2 = bass
      }
    }
    return { boom: bass, boom2: bass2, chick }
  }

  private chordNotes(bassIn: number, modifier: string): number[] {
    let intervals = CHORD_INTERVALS[modifier]
    if (intervals === undefined) {
      if (modifier.slice(0, 2).toLowerCase() === 'ma' || modifier[0] === 'M') {
        intervals = CHORD_INTERVALS.M
      } else if (modifier[0] === 'm' || modifier[0] === '-') {
        intervals = CHORD_INTERVALS.m
      } else {
        intervals = CHORD_INTERVALS.M
      }
    }
    // The chord sits an octave above the bass note.
    const bass = bassIn + 12 + this.chordOctaveShift * 12
    return (intervals ?? []).map((i) => bass + i)
  }

  private writeNote(
    pitch: number | undefined,
    volume: number,
    beat: number,
    noteLength: number,
    instrument: number,
  ): void {
    if (pitch === undefined) return
    this.track.push({
      cmd: 'note',
      pitch,
      volume,
      start: this.lastBarTime + beat * durationRounded(0.125, this.factor),
      duration: durationRounded(noteLength, this.factor),
      gap: 0,
      instrument,
    })
  }

  private resolveChords(startTime: number, endTime: number): void {
    // A rhythm head anywhere in the measure means the melody carries the rhythm.
    if (this.rhythmHead) return
    const { num, den } = this.meter
    const beatLength = 1 / den
    const noteLength = beatLength / 2
    const measureLength = num / den
    let portion = measureLength - (endTime - startTime) / this.factor
    if (Math.abs(portion) < 0.00001) portion = 0

    // No new chord this measure, or none on its first beat: carry the last one in.
    if (this.current.length === 0 || this.current[0]?.beat !== 0) {
      if (this.lastBar !== undefined) {
        this.current.unshift({ beat: 0, chord: this.lastBar })
      } else {
        this.current.unshift({ beat: 0, chord: undefined as unknown as Interpreted })
      }
    }

    const expanded = expandCurrentChords(this.current, (8 * num) / den)
    let pattern: readonly string[] | undefined = this.override ?? RHYTHM_PATTERNS[`${num}/${den}`]
    // A SHORT BAR THROWS THE PATTERN AWAY — a pickup, or a bar split over a line break,
    // gets a plain alternating chick for as many beats as are actually there.
    if (portion !== 0) {
      const beats = ((endTime - startTime) / this.factor) * 8
      const built: string[] = []
      for (let p = 0; p < beats / 2; p += 2) {
        built.push('chick')
        built.push('')
      }
      pattern = built
    }
    if (pattern === undefined) {
      const built: string[] = []
      for (let p = 0; p < (8 * num) / den / 2; p += 1) {
        built.push('chick')
        built.push('')
      }
      pattern = built
    }

    let firstBoom = true
    const minLength = Math.min(pattern.length, expanded.length)
    for (let p = 0; p < minLength; p += 1) {
      const prev = expanded[p - 1]
      const here = expanded[p]
      if (p > 0 && prev !== undefined && here !== undefined && prev.boom !== here.boom) {
        firstBoom = true
      }
      const type = pattern[p] ?? ''
      let isBoom = type.includes('boom')
      // A chord that changes where the pattern expects no bass note still gets one, if the
      // pattern opens with a bass note at all.
      let newBass =
        !isBoom &&
        p !== 0 &&
        (pattern[0] ?? '').includes('boom') &&
        (prev === undefined || here === undefined || prev.boom !== here.boom)
      const pitches = resolvePitch(here, type, firstBoom, newBass)
      if (isBoom) firstBoom = false
      for (const pitch of pitches) {
        this.writeNote(
          pitch,
          isBoom || newBass ? this.boomVolume : this.chickVolume,
          p,
          noteLength,
          isBoom || newBass ? this.bassInstrument : this.chordInstrument,
        )
        // Only the FIRST note of a chord is a bass note — this is what stops a
        // `boom&chick` slot writing every note at the bass volume.
        if (newBass) newBass = false
        else isBoom = false
      }
    }
  }
}

function resolvePitch(
  chord: Interpreted | undefined,
  type: string,
  firstBoom: boolean,
  newBass: boolean,
): number[] {
  const out: number[] = []
  if (chord === undefined) return out
  const push = (n: number | undefined): void => {
    if (n !== undefined) out.push(n)
  }
  if (type.includes('boom')) push(firstBoom ? chord.boom : chord.boom2)
  else if (newBass) push(chord.boom)
  if (type.includes('chick')) for (const n of chord.chick) out.push(n)
  const at = (index: number): number => {
    // An arpeggio note keeps climbing in octaves when the chord runs out of notes.
    const octave = Math.floor(index / chord.chick.length)
    return (chord.chick[index % chord.chick.length] as number) + octave * 12
  }
  switch (type) {
    case 'DO':
      out.push(chord.chick[0] as number)
      break
    case 'MI':
      out.push(chord.chick[1] as number)
      break
    case 'SOL':
      out.push(at(2))
      break
    case 'TI':
      out.push(at(3))
      break
    case 'TOP':
      out.push(at(4))
      break
    case 'do':
      out.push((chord.chick[0] as number) + 12)
      break
    case 'mi':
      out.push((chord.chick[1] as number) + 12)
      break
    case 'sol':
      out.push(at(2) + 12)
      break
    case 'ti':
      out.push(at(3) + 12)
      break
    case 'top':
      out.push(at(4) + 12)
      break
    default:
      break
  }
  return out
}

function parseGChord(gchord: string): string[] {
  const pattern: string[] = []
  for (const ch of gchord) {
    const slot = GCHORD_LETTERS[ch]
    if (slot !== undefined) pattern.push(slot)
  }
  return pattern
}

/** One chord per eighth-note position in the bar, each running until the next takes over. */
function expandCurrentChords(
  current: readonly { chord: Interpreted; beat: number }[],
  num8ths: number,
): (Interpreted | undefined)[] {
  const chords: (Interpreted | undefined)[] = []
  if (current.length === 0) return chords
  let currentChord = current[0]?.chord
  for (let i = 1; i < current.length; i += 1) {
    const c = current[i]
    if (c === undefined) continue
    while (chords.length < c.beat) chords.push(currentChord)
    currentChord = c.chord
  }
  while (chords.length < num8ths) chords.push(currentChord)
  return chords
}
