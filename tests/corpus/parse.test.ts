import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rational, ratToNumber, type Score, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { corpusDir, goldenNotes } from './corpus.js'

const fixture = (name: string): string => readFileSync(join(corpusDir, `${name}.abc`), 'utf-8')

/** Flatten a Score to a comparable note stream. */
const notesOf = (score: Score) =>
  score.voices
    .flatMap((voice) => voice.measures)
    .flatMap((measure) => measure.events)
    .filter((event) => event.type === 'note')
    .map((note) => ({
      start: note.sourceRange?.start ?? -1,
      end: note.sourceRange?.end ?? -1,
      duration: ratToNumber(note.duration),
      // abcjs numbers pitches diatonically from middle C, so C4 is 0 and c5 is 7.
      pitch: (note.pitch.octave - 4) * 7 + stepIndex(note.pitch.step),
    }))

/** The same stream pulled out of an abcjs `.parse.json` golden. */
const abcjsNotesOf = (name: string) =>
  goldenNotes(name).map((element) => ({
    start: element.startChar,
    end: element.endChar,
    duration: element.duration,
    pitch: element.pitches?.[0]?.pitch ?? -1,
  }))

describe('parse: simple-c', () => {
  const result = parse(fixture('simple-c'))
  if (!result.ok) throw new Error('expected simple-c to parse')
  const score = result.scores[0]
  if (!score) throw new Error('expected one score')

  it('produces exactly one score with no diagnostics', () => {
    expect(result.scores).toHaveLength(1)
    expect(result.diagnostics).toEqual([])
  })

  it('reads the header fields', () => {
    expect(score.metadata.tuneNumber).toBe(1)
    expect(score.metadata.titles).toEqual(['Simple C'])
    expect(score.key).toEqual({ tonic: { step: 'c', accidental: 0 }, mode: 'major' })
    // M:4/4 is numeric — `common` requires a literal `M:C`.
    expect(score.meter).toEqual({ numerator: 4, denominator: 4, symbol: 'numeric' })
    expect(score.unitNoteLength).toEqual(rational(1, 4))
  })

  it('anchors the header source ranges', () => {
    expect(score.meterSourceRange).toEqual({ start: 15, end: 20 })
    expect(score.keySourceRange).toEqual({ start: 27, end: 30 })
  })

  it('splits into two measures on one voice', () => {
    expect(score.voices).toHaveLength(1)
    const voice = score.voices[0]
    expect(voice?.id).toBe('1')
    expect(voice?.measures).toHaveLength(2)
    expect(voice?.measures[0]?.closingBarline).toBe('thin')
    expect(voice?.measures[0]?.sourceRange).toEqual({ start: 31, end: 36 })
    expect(voice?.measures[0]?.closingBarlineSourceRange).toEqual({ start: 35, end: 36 })
    expect(voice?.measures[1]?.sourceRange).toEqual({ start: 36, end: 41 })
  })

  it('builds the first note with an unresolved accidental', () => {
    expect(score.voices[0]?.measures[0]?.events[0]).toEqual({
      type: 'note',
      // null accidental means "inherit from the key" — resolution is an engrave concern.
      pitch: { step: 'c', octave: 4, accidental: null },
      duration: rational(1, 4),
      notatedDuration: rational(1, 4),
      tiedToNext: false,
      slurStarts: 0,
      slurEnds: 0,
      graceNotes: [],
      graceSlash: false,
      beamGroup: null,
      style: 'normal',
      microtoneCents: 0,
      tuplet: null,
      chordSymbol: null,
      chordSymbolSourceRange: null,
      decorations: [],
      decorationSourceRanges: [],
      annotations: [],
      annotationSourceRanges: [],
      sourceRange: { start: 31, end: 32 },
    })
  })

  it('octaves by letter case — uppercase B is 4, lowercase c is 5', () => {
    const second = score.voices[0]?.measures[1]?.events
    expect(second?.[2]).toMatchObject({ pitch: { step: 'b', octave: 4 } })
    expect(second?.[3]).toMatchObject({ pitch: { step: 'c', octave: 5 } })
  })

  it('freezes the result', () => {
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(score.voices[0]?.measures[0])).toBe(true)
  })
})

// Core cannot match abcjs's parse tree — abcjs stores duration as a float and flattens
// measures away. What IS comparable is musical content: same notes, same offsets, same
// sounding durations. That is the gate for core, mirroring the structural-content
// comparator abcMusicKit2 runs against v1 (scripts/v1parity.py).
describe('content parity with abcjs goldens', () => {
  for (const name of ['simple-c', 'twinkle']) {
    it(`${name}: note stream matches abcjs`, () => {
      const result = parse(fixture(name))
      if (!result.ok) throw new Error(`expected ${name} to parse`)
      const score = result.scores[0]
      if (!score) throw new Error(`expected a score for ${name}`)
      const expected = abcjsNotesOf(name)
      expect(
        expected.length,
        'golden yielded no notes — comparison would be vacuous',
      ).toBeGreaterThan(0)
      expect(notesOf(score)).toEqual(expected)
    })
  }
})

// Microtonal accidentals (ABC 2.1 §4.5). The fraction sits BEFORE the note letter, where
// a duration would sit after it — `^3/2G` is a three-quarter-sharp G, not G of length 3/2.
describe('microtonal accidentals', () => {
  const notesOfAbc = (abc: string) => {
    const result = parse(abc)
    if (!result.ok) throw new Error('expected parse to succeed')
    return (result.scores[0]?.voices[0]?.measures ?? [])
      .flatMap((measure) => measure.events)
      .filter((event) => event.type === 'note')
  }

  it('reads cents from a fractional accidental', () => {
    const notes = notesOfAbc('X:1\nL:1/8\nK:C\nG ^/G ^G ^3/2G _/A _3/2A |\n')
    expect(notes.map((n) => n.microtoneCents)).toEqual([0, 50, 0, 150, -50, -150])
  })

  it('keeps the printed accidental as the base sign', () => {
    const notes = notesOfAbc('X:1\nL:1/8\nK:C\n^3/2G _3/2A |\n')
    expect(notes[0]?.pitch.accidental).toBe(1) // sharp
    expect(notes[1]?.pitch.accidental).toBe(-1) // flat
  })

  it('does not confuse a microtone with a duration', () => {
    const [micro] = notesOfAbc('X:1\nL:1/8\nK:C\n^3/2G |\n')
    const [duration] = notesOfAbc('X:1\nL:1/8\nK:C\n^G3/2 |\n')
    expect(micro?.duration).toEqual(rational(1, 8))
    expect(micro?.microtoneCents).toBe(150)
    expect(duration?.duration).toEqual(rational(3, 16))
    expect(duration?.microtoneCents).toBe(0)
  })

  it('includes a leading accidental in the note source range, as v2 implements', () => {
    const abc = 'X:1\nL:1/8\nK:C\n^G |\n'
    const [note] = notesOfAbc(abc)
    expect(abc.slice(note?.sourceRange?.start ?? 0, note?.sourceRange?.end ?? 0)).toBe('^G')
  })
})

// Tuplets are why `duration` and `notatedDuration` are separate fields: a triplet eighth
// is WRITTEN as an eighth but SOUNDS for a twelfth. The ratio scales sounding only.
describe('tuplets', () => {
  const eventsOf = (abc: string) => {
    const result = parse(abc)
    if (!result.ok) throw new Error('expected parse to succeed')
    return (result.scores[0]?.voices[0]?.measures ?? []).flatMap((measure) => measure.events)
  }

  it('scales sounding duration but not notated duration', () => {
    const notes = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(3abc d |\n')
    expect(notes.slice(0, 3).map((n) => n.notatedDuration)).toEqual([
      rational(1, 8),
      rational(1, 8),
      rational(1, 8),
    ])
    expect(notes.slice(0, 3).map((n) => n.duration)).toEqual([
      rational(1, 12),
      rational(1, 12),
      rational(1, 12),
    ])
    // The note after the group is untouched.
    expect(notes[3]?.duration).toEqual(rational(1, 8))
    expect(notes[3]?.tuplet).toBeNull()
  })

  it('marks members with a shared group id and the printed number', () => {
    const [a, b, c] = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(3abc |\n')
    expect(a?.tuplet).toEqual({ group: 1, number: 3 })
    expect(b?.tuplet).toEqual(a?.tuplet)
    expect(c?.tuplet).toEqual(a?.tuplet)
  })

  it('gives adjacent groups distinct ids', () => {
    const notes = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(3abc (3def |\n')
    expect(notes[0]?.tuplet?.group).toBe(1)
    expect(notes[3]?.tuplet?.group).toBe(2)
  })

  it('reads the explicit (p:q:r form, including omitted fields', () => {
    // `(3::4` — q omitted so it defaults to 2, r explicit at 4.
    const notes = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(3::4 cdef g |\n')
    expect(notes.slice(0, 4).every((n) => n.duration.denominator === 12)).toBe(true)
    expect(notes[4]?.tuplet).toBeNull()
  })

  it('counts a rest as a tuplet member', () => {
    // `(3z2A2G2` opens on a rest; if the rest did not consume a slot the group would
    // run one note long.
    const events = eventsOf('X:1\nL:1/4\nM:4/4\nK:C\n(3z2A2G2 c |\n')
    expect(events[0]?.type).toBe('rest')
    expect(events[3]?.tuplet).toBeNull()
  })

  it('defaults q by meter for the ambiguous sizes', () => {
    // `(5` is 5-in-2 in simple time but 5-in-3 in compound.
    const simple = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(5abcde |\n')
    const compound = eventsOf('X:1\nL:1/8\nM:6/8\nK:C\n(5abcde |\n')
    expect(simple[0]?.duration).toEqual(rational(1, 20)) // 1/8 * 2/5
    expect(compound[0]?.duration).toEqual(rational(3, 40)) // 1/8 * 3/5
  })
})

describe('ties, slurs, grace notes and beams', () => {
  const eventsOf = (abc: string) => {
    const result = parse(abc)
    if (!result.ok) throw new Error('expected parse to succeed')
    return (result.scores[0]?.voices[0]?.measures ?? []).flatMap((measure) => measure.events)
  }

  it('ties reach back to the note already emitted', () => {
    const [a, b] = eventsOf('X:1\nL:1/4\nK:C\nc-c d |\n')
    expect(a?.type === 'note' && a.tiedToNext).toBe(true)
    expect(b?.type === 'note' && b.tiedToNext).toBe(false)
  })

  it('slurs open on the next note and close on the previous one', () => {
    const notes = eventsOf('X:1\nL:1/4\nK:C\n(abc) d |\n')
    expect(notes[0]?.type === 'note' && notes[0].slurStarts).toBe(1)
    expect(notes[2]?.type === 'note' && notes[2].slurEnds).toBe(1)
    expect(notes[3]?.type === 'note' && notes[3].slurStarts).toBe(0)
  })

  it('does not mistake a tuplet for a slur', () => {
    const [first] = eventsOf('X:1\nL:1/8\nM:4/4\nK:C\n(3abc |\n')
    expect(first?.type === 'note' && first.slurStarts).toBe(0)
    expect(first?.tuplet).not.toBeNull()
  })

  it('attaches grace notes to the following event', () => {
    const [note] = eventsOf('X:1\nL:1/4\nK:C\n{gab}c |\n')
    if (note?.type !== 'note') throw new Error('expected a note')
    expect(note.graceNotes.map((p) => p.step)).toEqual(['g', 'a', 'b'])
    expect(note.graceSlash).toBe(false)
    expect(note.pitch.step).toBe('c')
  })

  it('reads {/g} as an acciaccatura', () => {
    const [note] = eventsOf('X:1\nL:1/4\nK:C\n{/g}c |\n')
    expect(note?.type === 'note' && note.graceSlash).toBe(true)
  })

  it('beams runs shorter than a quarter, breaking on space and barline', () => {
    const notes = eventsOf('X:1\nL:1/8\nK:C\nabcd efgh |\n')
    const groups = notes.map((n) => (n.type === 'rest' ? null : n.beamGroup))
    // Two runs of four, split by the space.
    expect(new Set(groups.slice(0, 4)).size).toBe(1)
    expect(new Set(groups.slice(4, 8)).size).toBe(1)
    expect(groups[0]).not.toBe(groups[4])
  })

  it('does not beam quarter notes or longer', () => {
    const notes = eventsOf('X:1\nL:1/4\nK:C\nabcd |\n')
    expect(notes.every((n) => n.type !== 'rest' && n.beamGroup === null)).toBe(true)
  })

  it('keeps a beam across a space that follows a tie', () => {
    // abcjs beams `[G=Bg]/4- [GBg]/4` as one run: the tie binds across the space.
    const notes = eventsOf('X:1\nL:1/8\nK:C\na/4b/4- c/4d/4 |\n')
    const groups = notes.map((n) => (n.type === 'rest' ? null : n.beamGroup))
    expect(new Set(groups).size).toBe(1)
    expect(groups[0]).not.toBeNull()
  })
})
