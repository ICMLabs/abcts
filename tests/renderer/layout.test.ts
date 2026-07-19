/**
 * Unit tests for layout decisions the structural gate cannot see.
 *
 * The corpus reaches only a handful of keys and no modes at all, and abcjs's layout
 * goldens carry no accidental or duration information in their `children`, so both
 * functions here are effectively ungated by the corpus. That is exactly the situation
 * the parser audit found dangerous: `vree-sharps` reported MATCH with every accidental
 * unverified. These are the direct checks.
 */
import { describe, expect, it } from 'vitest'
import {
  Accidental,
  defaultClef,
  type KeySignature,
  type Mode,
  rational,
  type Score,
} from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import {
  accidentalGlyph,
  keyFifths,
  layout,
  middleLineIndex,
  noteGlyph,
} from '../../src/renderer/layout.js'

const key = (
  step: KeySignature['tonic']['step'],
  accidental: Accidental,
  mode: Mode,
): KeySignature => ({ tonic: { step, accidental }, mode, none: false })

describe('keyFifths', () => {
  it('places the major keys on the circle of fifths', () => {
    expect(keyFifths(key('c', Accidental.natural, 'major'))).toBe(0)
    expect(keyFifths(key('g', Accidental.natural, 'major'))).toBe(1)
    expect(keyFifths(key('b', Accidental.natural, 'major'))).toBe(5)
    expect(keyFifths(key('f', Accidental.natural, 'major'))).toBe(-1)
    expect(keyFifths(key('e', Accidental.flat, 'major'))).toBe(-3)
  })

  it('carries a tonic accidental seven places round the circle', () => {
    expect(keyFifths(key('f', Accidental.sharp, 'major'))).toBe(6)
    expect(keyFifths(key('c', Accidental.sharp, 'major'))).toBe(7)
    expect(keyFifths(key('c', Accidental.flat, 'major'))).toBe(-7)
  })

  it('offsets each mode from major', () => {
    // The defining cases: each of these keys has no accidentals at all.
    expect(keyFifths(key('d', Accidental.natural, 'dorian'))).toBe(0)
    expect(keyFifths(key('a', Accidental.natural, 'minor'))).toBe(0)
    expect(keyFifths(key('g', Accidental.natural, 'mixolydian'))).toBe(0)
    expect(keyFifths(key('e', Accidental.natural, 'phrygian'))).toBe(0)
    expect(keyFifths(key('f', Accidental.natural, 'lydian'))).toBe(0)
    expect(keyFifths(key('b', Accidental.natural, 'locrian'))).toBe(0)
    // And a mode that does signature something.
    expect(keyFifths(key('e', Accidental.natural, 'dorian'))).toBe(2)
  })

  it('draws nothing for K:none, which is not C major', () => {
    expect(
      keyFifths({
        tonic: { step: 'c', accidental: Accidental.natural },
        mode: 'major',
        none: true,
      }),
    ).toBe(0)
  })

  it('clamps rather than indexing past the seven accidentals', () => {
    // K:A# is 10 sharps. Seven is as many as a signature can print without doubles.
    expect(keyFifths(key('a', Accidental.sharp, 'major'))).toBe(7)
    expect(keyFifths(key('g', Accidental.flat, 'minor'))).toBe(-7)
  })
})

describe('accidentalGlyph', () => {
  // CHECKPOINT risk 5, pinned. `Accidental.natural` is 0 and therefore FALSY, while
  // `null` means "inherit from the key signature" — musically opposite cases that the
  // idiomatic `if (pitch.accidental)` silently merges. In D major that renders `=F` as
  // F sharp: no natural sign is drawn, so the note reads as the key's F#. These two
  // tests fail the moment anyone rewrites the check as a truthiness test.
  it('draws a natural for an explicitly written natural, which is 0 and falsy', () => {
    expect(Accidental.natural).toBe(0) // the trap itself, stated
    expect(accidentalGlyph(Accidental.natural)).toBe('accidentalNatural')
  })

  it('draws nothing when the accidental is null, meaning inherit from the key', () => {
    expect(accidentalGlyph(null)).toBeNull()
  })

  it('maps the remaining accidentals', () => {
    expect(accidentalGlyph(Accidental.sharp)).toBe('accidentalSharp')
    expect(accidentalGlyph(Accidental.flat)).toBe('accidentalFlat')
    expect(accidentalGlyph(Accidental.doubleSharp)).toBe('accidentalDoubleSharp')
    expect(accidentalGlyph(Accidental.doubleFlat)).toBe('accidentalDoubleFlat')
  })

  it('prints the natural end to end, in a key where it changes the pitch', () => {
    // D major has F#. `=F` cancels it for that note and MUST print a natural; the bare
    // `F` after it inherits the key and must print nothing. This is the whole risk in
    // one bar, through the real parser and layout rather than the mapping alone.
    const score = parse('X:1\nL:1/4\nK:D\n=FF|\n').scores[0]
    expect(score).toBeDefined()
    const notes = layout(score as Score)
      .systems.flatMap((s) => s.elements)
      .filter((e) => e.type === 'note')

    expect(notes).toHaveLength(2)
    expect(notes[0]?.glyphs.map((g) => g.name)).toEqual(['accidentalNatural', 'noteheadBlack'])
    expect(notes[1]?.glyphs.map((g) => g.name)).toEqual(['noteheadBlack'])
    // Both are the same written pitch, so they sit on the same line.
    expect(notes[0]?.staffStep).toBe(notes[1]?.staffStep)
  })
})

describe('clefs', () => {
  const clefOf = (abc: string) => parse(abc).scores[0]?.voices[0]?.clef ?? null

  it('reads a bare clef name on K:, past the key itself', () => {
    // `K:C bass` — the FIRST word is the key, so a scan that stopped at the first
    // non-clef word would never reach `bass`.
    expect(parse('X:1\nK:C bass\nC|\n').scores[0]?.clef).toEqual({
      shape: 'F',
      line: 4,
      octaveShift: 0,
    })
    expect(parse('X:1\nK:C treble\nC|\n').scores[0]?.clef).toEqual({
      shape: 'G',
      line: 2,
      octaveShift: 0,
    })
  })

  it('reads clef= on a voice', () => {
    expect(clefOf('X:1\nV:1 clef=bass\nK:C\nC|\n')).toEqual({ shape: 'F', line: 4, octaveShift: 0 })
  })

  it('takes the trailing digit as the staff line, which is how ABC spells three clefs', () => {
    // The `clefs` fixture writes the baritone, mezzo-soprano and soprano exactly this way.
    expect(parse('X:1\nK:C bass3\nC|\n').scores[0]?.clef).toEqual({
      shape: 'F',
      line: 3, // baritone
      octaveShift: 0,
    })
    expect(parse('X:1\nK:C alto1\nC|\n').scores[0]?.clef).toEqual({
      shape: 'C',
      line: 1, // soprano
      octaveShift: 0,
    })
    expect(parse('X:1\nK:C alto2\nC|\n').scores[0]?.clef).toEqual({
      shape: 'C',
      line: 2, // mezzo-soprano
      octaveShift: 0,
    })
  })

  it('reads the octave suffix', () => {
    expect(parse('X:1\nK:C treble-8\nC|\n').scores[0]?.clef.octaveShift).toBe(-1)
    expect(parse('X:1\nK:C treble+8\nC|\n').scores[0]?.clef.octaveShift).toBe(1)
  })

  it('defaults to treble, and ignores words that name no clef', () => {
    expect(parse('X:1\nK:C\nC|\n').scores[0]?.clef).toEqual(defaultClef)
    // `Dm` is a key, `name=` is a voice label — neither is a clef, and neither may
    // produce one by accident.
    expect(parse('X:1\nK:Dm\nC|\n').scores[0]?.clef).toEqual(defaultClef)
    expect(clefOf('X:1\nV:1 name="Bass Line"\nK:C\nC|\n')).toBeNull()
  })

  it('puts the middle line where each clef says it is', () => {
    // Treble B4 = 34, bass D3 = 22, alto C4 = 28, tenor A3 = 26.
    expect(middleLineIndex({ shape: 'G', line: 2, octaveShift: 0 })).toBe(34)
    expect(middleLineIndex({ shape: 'F', line: 4, octaveShift: 0 })).toBe(22)
    expect(middleLineIndex({ shape: 'C', line: 3, octaveShift: 0 })).toBe(28)
    expect(middleLineIndex({ shape: 'C', line: 4, octaveShift: 0 })).toBe(26)
  })

  it('puts a bass voice where abcjs puts it, which the treble assumption did not', () => {
    // The `score-reorder` regression in one assertion. `C,,` is C2; in bass clef abcjs
    // records staff position -8 relative to the middle line, and core produced -20 while
    // it assumed treble — silently wrong output rather than a missing feature.
    const score = parse('X:1\nL:1/4\nV:1 clef=bass\nK:C\nC,,|\n').scores[0]
    const note = layout(score as Score)
      .systems.flatMap((s) => s.elements)
      .find((e) => e.type === 'note')
    expect(note?.staffStep).toBe(-8)
  })
})

describe('noteGlyph', () => {
  it('maps the plain power-of-two durations', () => {
    expect(noteGlyph(rational(1, 1))?.head).toBe('noteheadWhole')
    expect(noteGlyph(rational(1, 2))?.head).toBe('noteheadHalf')
    expect(noteGlyph(rational(1, 4))?.head).toBe('noteheadBlack')
    expect(noteGlyph(rational(1, 8))?.head).toBe('noteheadBlack')
  })

  it('stems everything shorter than a whole note', () => {
    expect(noteGlyph(rational(1, 1))?.stemmed).toBe(false)
    expect(noteGlyph(rational(1, 2))?.stemmed).toBe(true)
    expect(noteGlyph(rational(1, 4))?.stemmed).toBe(true)
  })

  it('counts flags from the eighth down', () => {
    expect(noteGlyph(rational(1, 4))?.flags).toBe(0)
    expect(noteGlyph(rational(1, 8))?.flags).toBe(1)
    expect(noteGlyph(rational(1, 16))?.flags).toBe(2)
    expect(noteGlyph(rational(1, 32))?.flags).toBe(3)
  })

  it('refuses a dotted or tuplet duration rather than rounding it to a wrong notehead', () => {
    // The whole point of the null return: a dotted half drawn as a half is wrong output,
    // and the structural gate would never catch it because the staff position is right.
    expect(noteGlyph(rational(3, 8))).toBeNull() // dotted quarter
    expect(noteGlyph(rational(3, 4))).toBeNull() // dotted half
    expect(noteGlyph(rational(1, 6))).toBeNull() // triplet eighth
    expect(noteGlyph(rational(0, 1))).toBeNull()
  })
})
