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
    expect(notes[0]?.staffSteps).toEqual(notes[1]?.staffSteps)
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
    expect(note?.staffSteps).toEqual([-8])
  })
})

describe('tempo', () => {
  const tempoOf = (q: string) =>
    parse(`X:1\nM:4/4\nL:1/4\n${q}\nK:C\nC|\n`).scores[0]?.tempo ?? null

  it('reads every spelling the corpus uses', () => {
    expect(tempoOf('Q:1/4=120')).toEqual({ beatUnit: rational(1, 4), bpm: 120, text: null })
    expect(tempoOf('Q: "Adagio"')).toEqual({ beatUnit: null, bpm: null, text: 'Adagio' })
    expect(tempoOf('Q:"Allegretto" 1/4=100')).toEqual({
      beatUnit: rational(1, 4),
      bpm: 100,
      text: 'Allegretto',
    })
  })

  it('ignores a trailing comment', () => {
    // `Q: "Allegro" 1/4 = 120 % tempo` is in the corpus verbatim, spaces and all.
    expect(tempoOf('Q: "Allegro" 1/4 = 120 % tempo')).toEqual({
      beatUnit: rational(1, 4),
      bpm: 120,
      text: 'Allegro',
    })
  })

  it('reads the legacy bare rate without taking a digit out of the text', () => {
    expect(tempoOf('Q:120')).toEqual({ beatUnit: null, bpm: 120, text: null })
    expect(tempoOf('Q:"Tempo di Marcia 2"')).toEqual({
      beatUnit: null,
      bpm: null,
      text: 'Tempo di Marcia 2',
    })
  })

  it('declares no tempo rather than a default one when the field says nothing', () => {
    expect(tempoOf('Q:')).toBeNull()
    expect(parse('X:1\nK:C\nC|\n').scores[0]?.tempo).toBeNull()
  })

  it('lays the mark out above the staff, taking no horizontal space', () => {
    const score = parse('X:1\nM:4/4\nL:1/4\nQ:"Allegro" 1/4=120\nK:C\nCDEF|\n').scores[0]
    const elements = layout(score as Score).systems.flatMap((s) => s.elements)
    const tempo = elements.find((e) => e.type === 'tempo')

    expect(tempo).toBeDefined()
    // Zero width, matching abcjs, so it cannot push the music around.
    expect(tempo?.width).toBe(0)
    expect(tempo?.texts.map((t) => t.text)).toEqual(['Allegro', '= 120'])
    // A real beat-unit note is drawn, not the digits alone.
    expect(tempo?.glyphs.map((g) => g.name)).toEqual(['noteheadBlack'])
    // Above the top staff line, which is at y = -2.
    for (const t of tempo?.texts ?? []) expect(t.y).toBeLessThan(-2)
  })

  it('grows the drawing box to fit content that sits outside the staff', () => {
    // A fixed margin silently clipped: notes on high ledger lines and the tempo mark
    // both fall outside any constant, and nothing in the structural gate can see it.
    const plain = layout(parse('X:1\nL:1/4\nK:C\nB|\n').scores[0] as Score)
    const high = layout(parse('X:1\nL:1/4\nK:C bass\nc|\n').scores[0] as Score)
    const marked = layout(parse('X:1\nL:1/4\nQ:"Adagio"\nK:C\nB|\n').scores[0] as Score)

    expect(high.top).toBeLessThan(plain.top)
    expect(marked.top).toBeLessThan(plain.top)
  })
})

describe('chords', () => {
  const elementsOf = (abc: string) =>
    layout(parse(abc).scores[0] as Score).systems.flatMap((s) => s.elements)
  const notesOf = (abc: string) => elementsOf(abc).filter((e) => e.type === 'note')

  it('reports every notehead ascending, whatever order they were written in', () => {
    // `[GCE]` and `[CEG]` are the same chord; both must give the same ascending steps.
    const written = notesOf('X:1\nL:1/4\nK:C\n[GCE]|\n')[0]
    expect(written?.staffSteps).toEqual([-6, -4, -2])
  })

  it('draws one notehead per pitch', () => {
    const chord = notesOf('X:1\nL:1/4\nK:C\n[CEG]|\n')[0]
    expect(chord?.glyphs.filter((g) => g.name === 'noteheadBlack')).toHaveLength(3)
  })

  it('moves a second across the stem instead of overlapping two heads', () => {
    // *Behind Bars*: seconds cannot share a side. A cluster alternates rather than
    // shifting every head, so C and E stay put and D moves.
    const chord = notesOf('X:1\nL:1/4\nK:C\n[CDE]|\n')[0]
    const xs = (chord?.glyphs ?? []).filter((g) => g.name === 'noteheadBlack').map((g) => g.x)
    expect(new Set(xs).size).toBe(2)
    // Exactly one head is displaced, not all three.
    const base = Math.min(...xs)
    expect(xs.filter((x) => x !== base)).toHaveLength(1)
  })

  it('leaves a chord of thirds in a single column', () => {
    const chord = notesOf('X:1\nL:1/4\nK:C\n[CEG]|\n')[0]
    const xs = (chord?.glyphs ?? []).filter((g) => g.name === 'noteheadBlack').map((g) => g.x)
    expect(new Set(xs).size).toBe(1)
  })

  it('spans the stem across the whole chord, not one notehead', () => {
    const chord = notesOf('X:1\nL:1/4\nK:C\n[CEG]|\n')[0]
    const stem = chord?.lines.find((l) => l.x1 === l.x2)
    // Lowest head is C4 (y = 3), stem runs up past G4 (y = 1) by the stem length.
    expect(stem).toBeDefined()
    expect(Math.abs((stem?.y1 ?? 0) - (stem?.y2 ?? 0))).toBeGreaterThan(3.5)
  })

  it('flips the stem down for a chord above the middle line', () => {
    const low = notesOf('X:1\nL:1/4\nK:C\n[CEG]|\n')[0]
    const high = notesOf('X:1\nL:1/4\nK:C\n[ceg]|\n')[0]
    const tipOf = (el: typeof low) => {
      const stem = el?.lines.find((l) => l.x1 === l.x2)
      return (stem?.y2 ?? 0) - (stem?.y1 ?? 0)
    }
    expect(tipOf(low)).toBeLessThan(0) // up: y decreases
    expect(tipOf(high)).toBeGreaterThan(0) // down
  })

  it('gives every altered pitch in a chord its own accidental', () => {
    const chord = notesOf('X:1\nL:1/4\nK:C\n[^C_EG]|\n')[0]
    const names = (chord?.glyphs ?? []).map((g) => g.name)
    expect(names).toContain('accidentalSharp')
    expect(names).toContain('accidentalFlat')
  })
})

describe('barlines that open a measure', () => {
  const typesOf = (abc: string) =>
    layout(parse(abc).scores[0] as Score)
      .systems.flatMap((s) => s.elements)
      .map((e) => e.type)

  it('keeps a leading barline instead of dropping it', () => {
    // `little swallow` opens with `[|` before any note. The parser recognised this case
    // and discarded the barline, so core drew nothing where abcjs draws a bar.
    expect(typesOf('X:1\nL:1/4\nK:C\n[|CDEF|\n')).toContain('bar')
    expect(
      parse('X:1\nL:1/4\nK:C\n[|CDEF|\n').scores[0]?.voices[0]?.measures[0]?.openingBarline,
    ).toBe('double')
  })

  it('draws two barlines when one closes and the next opens', () => {
    // A line ending `:|` followed by one starting `|:` is TWO printed barlines. Folding
    // them into one loses the repeat structure — and it is what abcjs does too.
    const types = typesOf('X:1\nL:1/4\nK:C\nCDEF:|\n|:GABc|\n')
    const bars = types.filter((t) => t === 'bar')
    expect(bars.length).toBe(3) // the :| , the |: , and the final |
  })
})

describe('part labels', () => {
  it('marks a body P: on the measure it starts', () => {
    const score = parse('X:1\nL:1/4\nK:C\nCDEF|\nP:B\nGABc|\n').scores[0]
    const measures = score?.voices[0]?.measures ?? []
    expect(measures[0]?.partLabel).toBeNull()
    expect(measures[1]?.partLabel).toBe('B')

    const parts = layout(score as Score)
      .systems.flatMap((s) => s.elements)
      .filter((e) => e.type === 'part')
    expect(parts).toHaveLength(1)
    expect(parts[0]?.texts[0]?.text).toBe('B')
    expect(parts[0]?.width).toBe(0) // must not push the music it labels
  })

  it('ignores a header P:, which is a part ORDER and a different feature', () => {
    const score = parse('X:1\nL:1/4\nP:ABAB\nK:C\nCDEF|\n').scores[0]
    expect(score?.voices[0]?.measures[0]?.partLabel).toBeNull()
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

  it('splits a dotted duration into its base note and dot count', () => {
    // A dot adds half of what precedes it, so d dots on base b are b(2^(d+1)-1)/2^d —
    // which puts an ODD numerator of the form 2^(d+1)-1 over a power of two. Derived
    // rather than tabled, so double and triple dots come free.
    expect(noteGlyph(rational(3, 8))).toMatchObject({ head: 'noteheadBlack', dots: 1, flags: 0 })
    expect(noteGlyph(rational(3, 4))).toMatchObject({ head: 'noteheadHalf', dots: 1 })
    expect(noteGlyph(rational(3, 16))).toMatchObject({ head: 'noteheadBlack', dots: 1, flags: 1 })
    expect(noteGlyph(rational(7, 16))).toMatchObject({ head: 'noteheadBlack', dots: 2 })
    expect(noteGlyph(rational(15, 16))).toMatchObject({ head: 'noteheadHalf', dots: 3 })
    expect(noteGlyph(rational(3, 2))).toMatchObject({ head: 'noteheadWhole', dots: 1 })
  })

  it("tells a breve from a dotted note by the numerator's ODD part", () => {
    // `G8` at L:1/4 is 2/1 — undotted and twice a whole note. Testing (numerator + 1)
    // for a power of two calls 3/8 dotted and 2/1 unwritable, which broke every long
    // note in the corpus. Only the odd part can carry dots.
    expect(noteGlyph(rational(2, 1))).toMatchObject({ head: 'noteheadWhole', dots: 0 })
    expect(noteGlyph(rational(4, 1))).toMatchObject({ head: 'noteheadWhole', dots: 0 })
    expect(noteGlyph(rational(3, 1))).toMatchObject({ head: 'noteheadWhole', dots: 1 })
    expect(noteGlyph(rational(6, 1))).toMatchObject({ head: 'noteheadWhole', dots: 1 })
  })

  it('still refuses a duration no notehead and dots can write', () => {
    // A wrong notehead is worse than none, and the structural gate would never catch it
    // because the staff position stays right.
    expect(noteGlyph(rational(1, 6))).toBeNull() // triplet eighth — but see below
    expect(noteGlyph(rational(5, 8))).toBeNull()
    expect(noteGlyph(rational(0, 1))).toBeNull()
  })

  it('never sees a tuplet ratio, because notatedDuration excludes it by contract', () => {
    // `(3abc` sounds each note as 1/12 but WRITES three eighths. If tuplet scaling ever
    // leaked into notatedDuration, every tuplet note would silently stop drawing.
    const score = parse('X:1\nM:4/4\nL:1/8\nK:C\n(3abc|\n').scores[0]
    const notes = (score?.voices[0]?.measures[0]?.events ?? []).filter((e) => e.type === 'note')
    expect(notes).toHaveLength(3)
    for (const note of notes) {
      expect(note.type === 'note' && noteGlyph(note.notatedDuration)).toMatchObject({
        head: 'noteheadBlack',
      })
    }
  })
})
