import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rational, ratToNumber, type Score, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { corpusDir, goldensDir } from './corpus.js'

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
function abcjsNotesOf(name: string) {
  const golden = JSON.parse(readFileSync(join(goldensDir, `${name}.parse.json`), 'utf-8'))
  const out: { start: number; end: number; duration: number; pitch: number }[] = []
  for (const line of golden.lines ?? []) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices ?? []) {
        for (const element of voice) {
          if (element.el_type !== 'note' || element.rest || !element.pitches) continue
          out.push({
            start: element.startChar,
            end: element.endChar,
            duration: element.duration,
            pitch: element.pitches[0].pitch,
          })
        }
      }
    }
  }
  return out
}

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
      style: 'normal',
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
