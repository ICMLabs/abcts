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
  type Clef,
  type CompatibilityMode,
  defaultClef,
  defaultMode,
  type KeySignature,
  type Mode,
  rational,
  type Score,
} from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { GLYPHS } from '../../src/renderer/glyphs.js'
import {
  accidentalGlyph,
  keyFifths,
  layout,
  layoutBook,
  middleLineIndex,
  naturalWidth,
  noteGlyph,
  TEXT_ASCENT,
} from '../../src/renderer/layout.js'
import {
  CHAR_ADVANCE,
  CHAR_ADVANCE_BOLD_FALLBACK,
  FALLBACK_ADVANCE,
} from '../../src/renderer/text-metrics.js'

/** Mirrors the renderer's own measure, for asserting that nothing falls outside bounds. */
const textWidthOf = (text: string, size: number): number => {
  let em = 0
  for (const ch of text) em += CHAR_ADVANCE[ch] ?? FALLBACK_ADVANCE
  return em * size
}

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
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
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
      middleOverride: null,
      staffLines: 5,
    })
    expect(parse('X:1\nK:C treble\nC|\n').scores[0]?.clef).toEqual({
      shape: 'G',
      line: 2,
      octaveShift: 0,
      middleOverride: null,
      staffLines: 5,
    })
  })

  it('reads clef= on a voice', () => {
    expect(clefOf('X:1\nV:1 clef=bass\nK:C\nC|\n')).toEqual({
      shape: 'F',
      line: 4,
      octaveShift: 0,
      middleOverride: null,
      staffLines: 5,
    })
  })

  it('takes the trailing digit as the staff line, which is how ABC spells three clefs', () => {
    // The `clefs` fixture writes the baritone, mezzo-soprano and soprano exactly this way.
    expect(parse('X:1\nK:C bass3\nC|\n').scores[0]?.clef).toEqual({
      shape: 'F',
      line: 3, // baritone
      octaveShift: 0,
      middleOverride: null,
      staffLines: 5,
    })
    expect(parse('X:1\nK:C alto1\nC|\n').scores[0]?.clef).toEqual({
      shape: 'C',
      line: 1, // soprano
      octaveShift: 0,
      middleOverride: null,
      staffLines: 5,
    })
    expect(parse('X:1\nK:C alto2\nC|\n').scores[0]?.clef).toEqual({
      shape: 'C',
      line: 2, // mezzo-soprano
      octaveShift: 0,
      middleOverride: null,
      staffLines: 5,
    })
  })

  it('reads the octave suffix', () => {
    expect(parse('X:1\nK:C treble-8\nC|\n').scores[0]?.clef.octaveShift).toBe(-1)
    expect(parse('X:1\nK:C treble+8\nC|\n').scores[0]?.clef.octaveShift).toBe(1)
  })

  it('draws the staff lines `stafflines=` asks for, abcjs’s way', () => {
    // `write/draw/staff.js`: lines count UP from the bottom line, ONE line is the middle
    // (B) line rather than the bottom, and zero draws no staff at all.
    const rules = (abc: string): number[] =>
      (layout(parse(abc).scores[0] as Score).systems[0]?.staves[0]?.staffLines ?? []).map(
        (l) => l.y1,
      )
    const five = rules('X:1\nK:C\nC|\n')
    expect(five).toHaveLength(5)
    expect(rules('X:1\nK:C\nV:1 stafflines=3\nC|\n')).toEqual(five.slice(0, 3))
    expect(rules('X:1\nK:C\nV:1 stafflines=1\nC|\n')).toEqual([five[2]])
    expect(rules('X:1\nK:C\nV:1 stafflines=0\nC|\n')).toEqual([])
    // It rides on K: too, and alongside a `clef=` rather than instead of one.
    expect(rules('X:1\nK:C stafflines=2\nC|\n')).toEqual(five.slice(0, 2))
    expect(rules('X:1\nK:C\nV:1 clef=bass stafflines=1\nC|\n')).toEqual([five[2]])
    // A bare `stafflines=` must not replace an inherited clef with a default treble.
    expect(parse('X:1\nK:C bass\nV:1 stafflines=1\nC|\n').scores[0]?.clef.shape).toBe('F')
    // Out of abcjs's 0-10 range, or not a number: treated as absent.
    expect(rules('X:1\nK:C\nV:1 stafflines=99\nC|\n')).toHaveLength(5)
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
    expect(
      middleLineIndex({ shape: 'G', line: 2, octaveShift: 0, middleOverride: null, staffLines: 5 }),
    ).toBe(34)
    expect(
      middleLineIndex({ shape: 'F', line: 4, octaveShift: 0, middleOverride: null, staffLines: 5 }),
    ).toBe(22)
    expect(
      middleLineIndex({ shape: 'C', line: 3, octaveShift: 0, middleOverride: null, staffLines: 5 }),
    ).toBe(28)
    expect(
      middleLineIndex({ shape: 'C', line: 4, octaveShift: 0, middleOverride: null, staffLines: 5 }),
    ).toBe(26)
  })

  it('puts a bass voice where abcjs puts it, which the treble assumption did not', () => {
    // The `score-reorder` regression in one assertion. `C,,` is C2; in bass clef abcjs
    // records staff position -8 relative to the middle line, and core produced -20 while
    // it assumed treble — silently wrong output rather than a missing feature.
    const score = parse('X:1\nL:1/4\nV:1 clef=bass\nK:C\nC,,|\n').scores[0]
    const note = layout(score as Score)
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
      .find((e) => e.type === 'note')
    expect(note?.staffSteps).toEqual([-8])
  })

  it('honours `middle=`, which moves noteheads where an octave clef would not', () => {
    // `voice-middle-after-clef`: `clef=bass middle=d` puts D5 (index 36) on the middle line
    // in place of plain bass's D3 (22), dropping high notes onto the staff.
    const clef = clefOf('X:1\nV:1 clef=bass middle=d\nK:C\nC|\n')
    expect(clef?.middleOverride).toBe(36)
    expect(middleLineIndex(clef as Clef)).toBe(36)
    // `d'` is D6 (index 43); the short spelling `m=` and octave marks both parse.
    expect(clefOf("X:1\nV:1 clef=treble m=d'\nK:C\nC|\n")?.middleOverride).toBe(43)
    // Skipped where `transpose=` is also present — the two interact and written transpose
    // is not realized yet, so honouring `middle=` alone would move the voice wrongly.
    expect(
      clefOf('X:1\nV:1 clef=bass middle=d transpose=-24\nK:C\nC|\n')?.middleOverride,
    ).toBeNull()
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
    const elements = layout(score as Score).systems.flatMap((s) =>
      s.staves.flatMap((st) => st.elements),
    )
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
    // A fixed margin silently CLIPPED: notes on high ledger lines and the tempo mark
    // both fall outside any constant, and nothing in the structural gate can see it.
    // Since systems are stacked, that room now shows up as extra height and as the first
    // system's origin being pushed further down to make space above it.
    const plain = layout(parse('X:1\nL:1/4\nK:C\nB|\n').scores[0] as Score)
    const high = layout(parse('X:1\nL:1/4\nK:C bass\nc|\n').scores[0] as Score)
    const marked = layout(parse('X:1\nL:1/4\nQ:"Adagio"\nK:C\nB|\n').scores[0] as Score)

    expect(high.height).toBeGreaterThan(plain.height)
    expect(marked.height).toBeGreaterThan(plain.height)
    // The room appears as the first STAFF being pushed down within its system.
    expect(marked.systems[0]?.staves[0]?.originY).toBeGreaterThan(
      plain.systems[0]?.staves[0]?.originY ?? 0,
    )
  })
})

describe('chords', () => {
  const elementsOf = (abc: string) =>
    layout(parse(abc).scores[0] as Score).systems.flatMap((s) =>
      s.staves.flatMap((st) => st.elements),
    )
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
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
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
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
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

describe('flags and beams', () => {
  const sys = (abc: string) => layout(parse(abc).scores[0] as Score).systems[0]?.staves[0]
  const notesOf = (abc: string) => (sys(abc)?.elements ?? []).filter((e) => e.type === 'note')
  const glyphNames = (abc: string) => notesOf(abc).flatMap((n) => n.glyphs.map((g) => g.name))
  const stemOf = (el: { lines: readonly { x1: number; x2: number; y1: number; y2: number }[] }) =>
    el.lines.find((l) => l.x1 === l.x2)

  it('flags an unbeamed eighth and beams a beamed one — never both', () => {
    // A space breaks the beam in ABC, so `C C` is two unbeamed eighths and `CC` is a
    // beamed pair. The distinction is the whole reason an eighth can look like either.
    const alone = 'X:1\nM:4/4\nL:1/8\nK:C\nC2 C C2|\n'
    expect(glyphNames(alone)).toContain('flag8thUp')
    expect(sys(alone)?.beams).toHaveLength(0)

    const beamed = 'X:1\nM:4/4\nL:1/8\nK:C\nCCCC|\n'
    expect(glyphNames(beamed)).not.toContain('flag8thUp')
    expect(sys(beamed)?.beams.length).toBeGreaterThan(0)
  })

  it('flags in the direction of the stem', () => {
    expect(glyphNames('X:1\nM:4/4\nL:1/8\nK:C\nC2 C C2|\n')).toContain('flag8thUp')
    expect(glyphNames('X:1\nM:4/4\nL:1/8\nK:C\nc2 c c2|\n')).toContain('flag8thDown')
  })

  it('gives every stem in a beam the same direction', () => {
    // `ABcd` straddles the middle line, so note-by-note these would disagree — and a
    // beam cannot join opposed stems. The group decides, by its furthest note.
    const notes = notesOf('X:1\nM:4/4\nL:1/8\nK:C\nABcd|\n')
    const directions = notes.map((n) => {
      const stem = stemOf(n)
      return (stem?.y2 ?? 0) > (stem?.y1 ?? 0) // true = downward
    })
    expect(new Set(directions).size).toBe(1)
  })

  it('lands every stem on the beam', () => {
    const system = sys('X:1\nM:4/4\nL:1/8\nK:C\nDEFG|\n')
    const beam = system?.beams[0]
    expect(beam).toBeDefined()
    const half = (beam?.thickness ?? 0) / 2
    const yAt = (x: number) => {
      const { x1, y1, x2, y2 } = beam as { x1: number; y1: number; x2: number; y2: number }
      return x1 === x2 ? y1 : y1 + ((x - x1) / (x2 - x1)) * (y2 - y1)
    }
    for (const note of (system?.elements ?? []).filter((e) => e.type === 'note')) {
      const stem = stemOf(note)
      expect(stem).toBeDefined()
      // The tip meets the beam's outer edge, within a rounding hair.
      expect(Math.abs((stem?.y2 ?? 0) - (yAt(stem?.x1 ?? 0) - half))).toBeLessThan(0.001)
    }
  })

  it('keeps a beamed stem from collapsing when a note spikes toward the beam', () => {
    // `CcCC` puts one high note under a beam sitting above four low ones. Without a
    // minimum the spike's stem would reach zero and the beam would cut the notehead.
    const notes = notesOf('X:1\nM:4/4\nL:1/8\nK:C\nCcCC|\n')
    for (const note of notes) {
      const stem = stemOf(note)
      expect(Math.abs((stem?.y2 ?? 0) - (stem?.y1 ?? 0))).toBeGreaterThan(2)
    }
  })

  it('clamps the slope so a beam stays gently inclined', () => {
    const beam = sys("X:1\nM:4/4\nL:1/8\nK:C\nCc'|\n")?.beams[0]
    expect(beam).toBeDefined()
    // A 14-step leap; the beam rises far less than the notes do.
    expect(Math.abs((beam?.y2 ?? 0) - (beam?.y1 ?? 0))).toBeLessThanOrEqual(2.001)
  })

  it('draws a second beam only where consecutive notes both carry one', () => {
    // `CDE2` is 16th, 16th, 8th: the secondary beam covers the first two and stops.
    const system = sys('X:1\nM:4/4\nL:1/16\nK:C\nCDE2F2|\n')
    expect(system?.beams).toHaveLength(2)
    const primary = system?.beams[0]
    const secondary = system?.beams[1]
    expect(primary).toBeDefined()
    expect(secondary).toBeDefined()
    const span = (b?: { x1: number; x2: number }) => (b?.x2 ?? 0) - (b?.x1 ?? 0)
    expect(span(secondary)).toBeLessThan(span(primary))
  })

  it('stubs a lone short note rather than beaming it to nothing', () => {
    // `C2DE2` — an eighth, a lone sixteenth, an eighth. The sixteenth's second beam has
    // no neighbour to span to, so it becomes a stub pointing back at the note before it.
    const system = sys('X:1\nM:4/4\nL:1/16\nK:C\nC2DE2|\n')
    expect(system?.beams).toHaveLength(2)
    const stub = system?.beams[1]
    expect(stub).toBeDefined()
    const width = (stub?.x2 ?? 0) - (stub?.x1 ?? 0)
    expect(width).toBeGreaterThan(0)
    expect(width).toBeLessThan(2) // a stub, not a span
  })

  it('does not beam a quarter note or anything longer', () => {
    const system = sys('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n')
    expect(system?.beams).toHaveLength(0)
    expect(glyphNames('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n')).not.toContain('flag8thUp')
  })
})

describe('system breaking', () => {
  // Four bars per SOURCE LINE. abcts breaks systems where the file breaks lines — the
  // ABC default, and what abcjs does — so a long tune on one source line is one long
  // system, not several. It takes several lines to get several systems.
  const long = (bars: number) =>
    `X:1\nM:4/4\nL:1/4\nK:C\n${Array.from({ length: Math.ceil(bars / 4) }, () => 'CDEF|CDEF|CDEF|CDEF|\n').join('')}`

  it('keeps a short tune on one system', () => {
    expect(layout(parse(long(2)).scores[0] as Score).systems).toHaveLength(1)
  })

  it('gives each source line its own system', () => {
    // The break points are the AUTHOR's, not a packer's — ten source lines, ten systems,
    // however wide or narrow the page. This is the ABC default and what abcjs does: it
    // has no line-breaking pass at all.
    const doc = layout(parse(long(40)).scores[0] as Score)
    expect(doc.systems).toHaveLength(10)
  })

  it('does NOT re-wrap when the page is narrow — it compresses', () => {
    // The behaviour that replaced width packing. A narrower page does not add systems;
    // the same music is fitted into less room, which is what abcjs's
    // `calcHorizontalSpacing` does when a line is longer than the target.
    const wide = layout(parse(long(40)).scores[0] as Score, { systemWidth: 200 })
    const narrow = layout(parse(long(40)).scores[0] as Score, { systemWidth: 40 })
    expect(narrow.systems).toHaveLength(wide.systems.length)
  })

  it('reprints the clef and key on every system, but the meter and tempo only once', () => {
    const abc = `X:1\nM:3/4\nL:1/4\nQ:"Andante"\nK:Eb\n${'CDE|CDE|CDE|CDE|\n'.repeat(10)}\n`
    const doc = layout(parse(abc).scores[0] as Score)
    expect(doc.systems.length).toBeGreaterThan(1)

    doc.systems.forEach((system, index) => {
      const types = (system.staves[0]?.elements ?? []).map((e) => e.type)
      expect(types, `system ${index} clef`).toContain('clef')
      expect(types, `system ${index} key`).toContain('keySignature')
      // The meter and tempo belong to the tune, not to each line of it.
      if (index === 0) {
        expect(types).toContain('timeSignature')
        expect(types).toContain('tempo')
      } else {
        expect(types, `system ${index} must not reprint the meter`).not.toContain('timeSignature')
        expect(types, `system ${index} must not reprint the tempo`).not.toContain('tempo')
      }
    })
  })

  it('always places at least one measure, even one wider than the page', () => {
    // A measure that cannot fit must OVERFLOW rather than send the packer round forever
    // looking for a system it will fit in.
    const doc = layout(parse(long(1)).scores[0] as Score, { systemWidth: 1 })
    expect(doc.systems).toHaveLength(1)
    expect(doc.systems[0]?.staves[0]?.elements.some((e) => e.type === 'note')).toBe(true)
  })

  it('stacks systems without overlapping', () => {
    const doc = layout(parse(long(40)).scores[0] as Score)
    let previousBottom = Number.NEGATIVE_INFINITY
    for (const system of doc.systems) {
      // Staff lines sit at ±2 about the system's own origin.
      const top = system.originY - 2
      expect(top).toBeGreaterThan(previousBottom)
      previousBottom = system.originY + 2
    }
    // And the document is tall enough to hold them all.
    const last = doc.systems[doc.systems.length - 1]
    expect(doc.height).toBeGreaterThan((last?.originY ?? 0) + 2)
  })

  it('lays every system out in its own coordinate space', () => {
    // Each system's staff sits at y = ±2 regardless of position, so inserting a break
    // earlier cannot shift the geometry of a later system — which would otherwise churn
    // every baseline below the break on any spacing change.
    const doc = layout(parse(long(40)).scores[0] as Score)
    for (const system of doc.systems) {
      for (const staff of system.staves) {
        // `+ 0` normalises the -0 that stepToY(0) produces; -0 and 0 are the same line.
        const ys = staff.staffLines.map((l) => l.y1 + 0).sort((a, b) => a - b)
        expect(ys).toEqual([-2, -1, 0, 1, 2])
      }
    }
  })
})

describe('multiple voices', () => {
  const two = `X:1
M:4/4
L:1/4
Q:"Andante"
V:1 clef=treble
V:2 clef=bass
K:C
V:1
CDEF|GABc|
V:2
C,D,E,F,|G,A,B,C|
`

  it('gives every voice its own staff', () => {
    const doc = layout(parse(two).scores[0] as Score)
    expect(doc.systems[0]?.staves).toHaveLength(2)
  })

  it('gives each staff its own clef, so the same step is a different pitch', () => {
    const doc = layout(parse(two).scores[0] as Score)
    const clefOf = (i: number) =>
      doc.systems[0]?.staves[i]?.elements.find((e) => e.type === 'clef')?.glyphs[0]?.name
    expect(clefOf(0)).toBe('gClef')
    expect(clefOf(1)).toBe('fClef')

    // `C` on the treble staff and `C,` on the bass one are an octave apart in pitch but
    // land on positions the two clefs place differently — the reason each staff has its
    // own coordinate space.
    const firstNote = (i: number) =>
      doc.systems[0]?.staves[i]?.elements.find((e) => e.type === 'note')?.staffSteps[0]
    expect(firstNote(0)).toBe(-6) // C4 in treble
    expect(firstNote(1)).toBe(-1) // C3 in bass
  })

  it('prints the tempo once, on the top staff — it belongs to the tune', () => {
    const doc = layout(parse(two).scores[0] as Score)
    const tempos = doc.systems.flatMap((s, i) =>
      s.staves.map((st, j) => ({ i, j, n: st.elements.filter((e) => e.type === 'tempo').length })),
    )
    expect(tempos.filter((t) => t.n > 0)).toEqual([{ i: 0, j: 0, n: 1 }])
  })

  it('still gives every staff its own clef, key and meter', () => {
    // Unlike the tempo, these are per-staff by definition — a reader needs them on the
    // line they are reading.
    const abc = two.replace('K:C', 'K:D')
    const doc = layout(parse(abc).scores[0] as Score)
    for (const staff of doc.systems[0]?.staves ?? []) {
      const types = staff.elements.map((e) => e.type)
      expect(types).toContain('clef')
      expect(types).toContain('keySignature')
      expect(types).toContain('timeSignature')
    }
  })

  it('aligns measures across staves, so bar 2 starts at the same x on both', () => {
    // Without column alignment the staves drift apart and the score stops reading as one
    // thing. The voices here have the same note count, but the packer must not depend on
    // that — the bass voice below is deliberately sparser.
    const uneven = `X:1\nM:4/4\nL:1/8\nV:1\nV:2\nK:C\nV:1\nCDEFGABc|cBAGFEDC|\nV:2\nC2E2G2c2|c2G2E2C2|\n`
    const doc = layout(parse(uneven).scores[0] as Score)
    const barsOf = (i: number) =>
      (doc.systems[0]?.staves[i]?.elements ?? []).filter((e) => e.type === 'bar').map((e) => e.x)
    expect(barsOf(0).length).toBeGreaterThan(0)
    expect(barsOf(1).length).toBe(barsOf(0).length)
    // To the pixel, not to the bit: the claim is that the staves line up, and the two
    // voices reach the same column by different sums, so the last float digit can differ.
    barsOf(1).forEach((x, i) => {
      expect(x).toBeCloseTo(barsOf(0)[i] as number, 6)
    })
  })

  it('stacks staves within a system without overlapping', () => {
    const doc = layout(parse(two).scores[0] as Score)
    const staves = doc.systems[0]?.staves ?? []
    expect(staves.length).toBe(2)
    for (let i = 1; i < staves.length; i++) {
      expect(staves[i]?.originY ?? 0).toBeGreaterThan(staves[i - 1]?.originY ?? 0)
    }
  })

  it('renders a single-voice tune as one staff, unchanged', () => {
    const doc = layout(parse('X:1\nL:1/4\nK:C\nCDEF|\n').scores[0] as Score)
    expect(doc.systems).toHaveLength(1)
    expect(doc.systems[0]?.staves).toHaveLength(1)
  })
})

describe('spacing and justification', () => {
  const staffOf = (abc: string, opts = {}) =>
    layout(parse(abc).scores[0] as Score, opts).systems[0]?.staves[0]
  const noteXs = (abc: string, opts = {}) =>
    (staffOf(abc, opts)?.elements ?? []).filter((e) => e.type === 'note').map((e) => e.x)

  it('follows a square-root curve, so a note four times as long is twice as wide', () => {
    // abcm2ps's measured duration→width curve is a pure √ — its per-halving increment
    // shrinks by ~1/√2 each step, steeper than log2. Taken from abcMusicKit2's
    // oracle-calibrated constant rather than invented.
    expect(naturalWidth(rational(1, 16))).toBeCloseTo(3.25, 5)
    expect(naturalWidth(rational(1, 4))).toBeCloseTo(6.5, 5)
    expect(naturalWidth(rational(1, 1))).toBeCloseTo(13, 5)
    // Four times the duration, twice the width — at every scale.
    expect(naturalWidth(rational(1, 2)) / naturalWidth(rational(1, 8))).toBeCloseTo(2, 5)
  })

  it('never lets a note fall below the rod floor', () => {
    expect(naturalWidth(rational(1, 1024))).toBeGreaterThanOrEqual(0.6)
    expect(naturalWidth(rational(0, 1))).toBeGreaterThanOrEqual(0.6)
  })

  it('gives a longer note more room than a shorter one in the same bar', () => {
    // The whole point: with flat spacing these were identical.
    const xs = noteXs('X:1\nM:4/4\nL:1/8\nK:C\nC4C2C1C1|\n')
    expect(xs).toHaveLength(4)
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] as number))
    expect(gaps[0]).toBeGreaterThan(gaps[1] as number)
    expect(gaps[1]).toBeGreaterThan(gaps[2] as number)
  })

  it('spaces a tuplet by its SOUNDING duration, not its written one', () => {
    // Three triplet eighths occupy the time of two and must take the space of two —
    // spacing off the written duration would make a triplet as wide as three eighths.
    const triplet = noteXs('X:1\nM:4/4\nL:1/8\nK:C\n(3CCC C4|\n')
    const plain = noteXs('X:1\nM:4/4\nL:1/8\nK:C\nCCC C4|\n')
    const span = (xs: number[]) => (xs[2] as number) - (xs[0] as number)
    expect(span(triplet)).toBeLessThan(span(plain))
  })

  it('keeps ink from being crushed by a short duration', () => {
    // A rod, not a spring: a sixteenth carrying an accidental and a dot needs more room
    // than its duration alone would buy.
    const bare = staffOf('X:1\nM:4/4\nL:1/16\nK:C\nCC|\n')
    const inky = staffOf('X:1\nM:4/4\nL:1/16\nK:C\n^C3C|\n')
    const widthOf = (s: typeof bare) => s?.elements.find((e) => e.type === 'note')?.width ?? 0
    expect(widthOf(inky)).toBeGreaterThan(widthOf(bare))
  })

  it('distributes a measure’s slack between its notes, not before the barline', () => {
    // Two voices, one sparse. The sparse voice's notes must spread through its column
    // rather than huddle at the left with a gap before the bar.
    const abc = `X:1\nM:4/4\nL:1/8\nV:1\nV:2\nK:C\nV:1\nCDEFGABc|\nV:2\nC2E2G2c2|\n`
    const doc = layout(parse(abc).scores[0] as Score)
    const staff = doc.systems[0]?.staves[1]
    const notes = (staff?.elements ?? []).filter((e) => e.type === 'note')
    const bar = (staff?.elements ?? []).find((e) => e.type === 'bar')
    expect(notes).toHaveLength(4)

    const last = notes[notes.length - 1]?.x ?? 0
    const first = notes[0]?.x ?? 0
    const barX = bar?.x ?? 0
    // The gap after the last note is not wildly larger than the gaps between notes —
    // which is exactly what dumping all the slack before the barline would produce.
    const averageGap = (last - first) / (notes.length - 1)
    expect(barX - last).toBeLessThan(averageGap * 2)
  })

  it('justifies every system to the same width', () => {
    const abc = `X:1\nM:4/4\nL:1/4\nK:C\n${'CDEF|CDEF|CDEF|CDEF|\n'.repeat(10)}\n`
    const doc = layout(parse(abc).scores[0] as Score, { systemWidth: 90 })
    expect(doc.systems.length).toBeGreaterThan(2)
    // Including the last, HERE, because every line of this tune is the same length and
    // the last one is therefore as full as the rest. See the next test for the case that
    // makes the rule visible.
    // THE FULL PAGE WIDTH. A line's final barline takes its own 1px and not the 10 of
    // `minspacing` — abcjs skips it on the last element of a voice
    // (`layout/voice-elements.js`) — and that now happens INSIDE the cursor, where the
    // element is placed, rather than as a correction to the finished total. So the solve
    // stretches until the line really does end on the target and the page comes out whole,
    // which is abcjs's own arithmetic: `staffGroup.w` reaches `width + padding.left` and
    // the page is that plus `padding.right`. Every system does it equally, which is what
    // "the same width" is really claiming.
    const target = 90
    for (const w of doc.systems.map((s) => s.width)) expect(w).toBeCloseTo(target, 5)
  })

  it('leaves a SHORT last system at its natural width', () => {
    // abcjs's rule (`write/layout/layout.js:102`): a last line filling less than 66% of
    // the page keeps its natural width, and anything fuller is justified like any other.
    // A final bar stretched across a whole page is the classic ugly justification bug,
    // and this is the threshold that avoids it without leaving every full last line short.
    const abc = `X:1\nM:4/4\nL:1/4\nK:C\n${'CDEF|CDEF|CDEF|CDEF|\n'.repeat(3)}CDEF|\n`
    const doc = layout(parse(abc).scores[0] as Score, { systemWidth: 90 })
    const widths = doc.systems.map((s) => s.width)
    expect(widths).toHaveLength(4)
    const target = 90 // see the note above
    for (const w of widths.slice(0, -1)) expect(w).toBeCloseTo(target, 5)
    expect(widths[widths.length - 1]).toBeLessThan(45)
  })

  it('leaves a system short rather than stretching it absurdly', () => {
    // A system needing more than the cap is left ragged, per *Behind Bars*. Two systems
    // where the second holds almost nothing: the first must not be pulled apart.
    const doc = layout(parse('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|C16|\n').scores[0] as Score, {
      systemWidth: 40,
    })
    for (const system of doc.systems) expect(system.width).toBeLessThanOrEqual(90)
  })
})

describe('barline shapes', () => {
  const barsOf = (abc: string) =>
    layout(parse(abc).scores[0] as Score)
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
      .filter((e) => e.type === 'bar')

  const shape = (bar: { lines: readonly { thickness: number }[]; glyphs: readonly unknown[] }) => ({
    rules: bar.lines.map((l) => (l.thickness > 0.3 ? 'thick' : 'thin')),
    dots: bar.glyphs.length,
  })

  it('draws each shape from its own parts', () => {
    // A final is thin-then-thick; a repeat end is dots-then-thin-then-thick; a two-way
    // repeat is one thick rule with dots on both sides.
    expect(shape(barsOf('X:1\nL:1/4\nK:C\nC|\n')[0] as never)).toEqual({
      rules: ['thin'],
      dots: 0,
    })
    expect(shape(barsOf('X:1\nL:1/4\nK:C\nC||\n')[0] as never)).toEqual({
      rules: ['thin', 'thin'],
      dots: 0,
    })
    expect(shape(barsOf('X:1\nL:1/4\nK:C\nC|]\n')[0] as never)).toEqual({
      rules: ['thin', 'thick'],
      dots: 0,
    })
    expect(shape(barsOf('X:1\nL:1/4\nK:C\n|:C:|\n')[0] as never)).toEqual({
      rules: ['thick', 'thin'],
      dots: 1,
    })
    expect(shape(barsOf('X:1\nL:1/4\nK:C\n|:C:|\n')[1] as never)).toEqual({
      rules: ['thin', 'thick'],
      dots: 1,
    })
    // `CDEF::` not `C::` — a body line beginning `C:` is the COMPOSER field, so the
    // parser eats the whole line and the tune has no music at all. A real ABC trap.
    expect(shape(barsOf('X:1\nL:1/4\nK:C\nCDEF::GABc|\n')[0] as never)).toEqual({
      rules: ['thin', 'thick', 'thin'],
      dots: 2,
    })
  })

  it('makes a heavier barline wider than a plain one', () => {
    const width = (abc: string) => barsOf(abc)[0]?.width ?? 0
    expect(width('X:1\nL:1/4\nK:C\nC||\n')).toBeGreaterThan(width('X:1\nL:1/4\nK:C\nC|\n'))
    expect(width('X:1\nL:1/4\nK:C\nC|]\n')).toBeGreaterThan(width('X:1\nL:1/4\nK:C\nC||\n'))
    expect(width('X:1\nL:1/4\nK:C\nCDEF::GABc|\n')).toBeGreaterThan(width('X:1\nL:1/4\nK:C\nC|]\n'))
  })

  it('straddles the middle line with the repeat dots', () => {
    // SMuFL anchors repeatDots at the BOTTOM staff line — its ink sits ~2 spaces above
    // its origin — so placing it at step 0 puts the dots up by the top line. Centred
    // from the bounding box, so a font with a different anchor still lands right.
    const dots = barsOf('X:1\nL:1/4\nK:C\n|:C:|\n')[0]?.glyphs[0]
    expect(dots?.name).toBe('repeatDots')
    const glyph = GLYPHS.repeatDots
    const inkTop = (dots?.y ?? 0) + glyph.y
    const inkBottom = inkTop + glyph.height
    // The ink is centred on the middle line, one dot either side.
    expect((inkTop + inkBottom) / 2).toBeCloseTo(0, 5)
    expect(inkTop).toBeLessThan(0)
    expect(inkBottom).toBeGreaterThan(0)
  })

  it('spans the staff, whatever the shape', () => {
    for (const abc of ['C|', 'C||', 'C|]', '|:C:|', 'CDEF::GABc|']) {
      for (const bar of barsOf(`X:1\nL:1/4\nK:C\n${abc}\n`)) {
        for (const line of bar.lines) {
          expect(Math.min(line.y1, line.y2)).toBeCloseTo(-2, 5)
          expect(Math.max(line.y1, line.y2)).toBeCloseTo(2, 5)
        }
      }
    }
  })
})

describe('slurs and ties', () => {
  const curvesOf = (abc: string) =>
    layout(parse(`X:1\nM:4/4\nL:1/4\nK:C\n${abc}\n`).scores[0] as Score, {
      systemWidth: 400,
    }).systems.flatMap((s) => s.staves.flatMap((st) => st.curves))

  it('draws a tie between tied notes and a slur between slurred ones', () => {
    expect(curvesOf('G-G|').map((c) => c.kind)).toEqual(['tie'])
    expect(curvesOf('(GG)|').map((c) => c.kind)).toEqual(['slur'])
    expect(curvesOf('GG|')).toEqual([])
  })

  it('nests slurs, matching each close to the most recent open', () => {
    // `(G(GG)G)` — the slurs open on DIFFERENT notes, which is what makes this a real
    // test of the stack. In `((GG)GG)` both open on the same note, so pairing them
    // first-in-first-out gives identical answers and the test proves nothing; a
    // mutation to `shift()` passed the whole suite until this case was used.
    const curves = [...curvesOf('(G(GG)G)|')].sort((a, b) => a.x2 - a.x1 - (b.x2 - b.x1))
    expect(curves).toHaveLength(2)
    // The inner (shorter) slur opens LATER than the outer one. Matched first-in-
    // first-out they would both start on the first note.
    expect(curves[0]?.x1 ?? 0).toBeGreaterThan(curves[1]?.x1 ?? 0)
  })

  it('handles a slur that opens and closes on the same note', () => {
    expect(curvesOf('(G(G)GG)|')).toHaveLength(2)
  })

  it('tells a tie from a slur when both are on one note', () => {
    const kinds = curvesOf('(G-GGG)|')
      .map((c) => c.kind)
      .sort()
    expect(kinds).toEqual(['slur', 'tie'])
  })

  it('ties across a barline', () => {
    // `vree-ties-across-bars` is a corpus fixture: a tie is a musical join and does not
    // care where the bar falls.
    const [tie] = curvesOf('G-|G|')
    expect(tie?.kind).toBe('tie')
    expect(tie?.x2).toBeGreaterThan(tie?.x1 as number)
  })

  it('arcs away from the stems', () => {
    // The convention, and it is also what keeps a curve clear of stems and beams: an
    // up-stem note carries its slur BELOW the notehead. y is down, so a downward arc is
    // a positive bulge.
    expect(curvesOf('(GG)|')[0]?.bulge).toBeGreaterThan(0) // low notes, stems up
    expect(curvesOf('(cc)|')[0]?.bulge).toBeLessThan(0) // high notes, stems down
  })

  it('springs from the notehead, not from the accidental', () => {
    // An accidental shifts the head right; a curve anchored on the element origin would
    // start in mid-air to the left of the note.
    const plain = curvesOf('(GG)|')[0]
    const sharped = curvesOf('(^G^G)|')[0]
    expect((sharped?.x1 ?? 0) - (plain?.x1 ?? 0)).toBeGreaterThan(0.5)
  })

  it('keeps the arc shallow however long the span', () => {
    // *Behind Bars* keeps slurs shallow; an arc proportional to span without a cap
    // becomes a semicircle over a long phrase.
    const long = curvesOf('(GGGGGGGG)|')[0]
    expect(Math.abs(long?.bulge ?? 0)).toBeLessThanOrEqual(2.2)
    // And not vanishingly flat over a short one.
    expect(Math.abs(curvesOf('(GG)|')[0]?.bulge ?? 0)).toBeGreaterThanOrEqual(0.5)
  })

  it('splits a curve across a system break instead of dropping it', () => {
    // Both ends exist but in different systems. The first half runs to the right edge of
    // the system it leaves — which is the signal to the reader that it continues.
    // The break is where the SOURCE breaks — abcts does not re-wrap, so a narrow page
    // no longer produces one. The slur opens on line 1 and closes on line 2.
    // A normal page width: the break comes from the SOURCE line now, so the narrow page
    // that used to force a wrap only squeezes the music and moves the curve off the edge.
    const doc = layout(parse('X:1\nM:4/4\nL:1/4\nK:C\n(CDEG-|\nG2 G2)|\n').scores[0] as Score)
    expect(doc.systems.length).toBeGreaterThan(1)
    const first = doc.systems[0]
    // A FRACTION of the system, not a pixel tolerance: "runs to the right edge" is the
    // property, and a fixed 2-space slack was quietly tied to the old geometry — the
    // curve now stops 2.2 short, behind the closing barline, which is correct.
    const leaving = (first?.staves[0]?.curves ?? []).filter(
      (c) => c.x2 >= (first?.width ?? 0) * 0.9,
    )
    expect(leaving.length).toBeGreaterThan(0)
    // And the continuation resumes on the next system, after its clef.
    const resuming = doc.systems[1]?.staves[0]?.curves ?? []
    expect(resuming.length).toBeGreaterThan(0)
    for (const c of resuming) expect(c.x1).toBeGreaterThan(0)
  })

  it('still drops a curve with nowhere to land at all', () => {
    // A tie on the very last note of the tune has no next note anywhere.
    expect(curvesOf('GGGG|GGGG-|')).toEqual([])
  })
})

describe('grace notes, chord symbols, lyrics and decorations', () => {
  const notesOf = (abc: string) =>
    layout(parse(`X:1\nM:4/4\nL:1/4\nK:C\n${abc}\n`).scores[0] as Score, { systemWidth: 300 })
      .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
      .filter((e) => e.type === 'note')

  it('draws grace notes small, before the note they lead into', () => {
    const [note] = notesOf('{AB}G2|')
    const graces = (note?.glyphs ?? []).filter((g) => g.scale !== undefined && g.scale < 1)
    expect(graces).toHaveLength(2)
    const main = (note?.glyphs ?? []).find((g) => g.scale === undefined)
    // Small, and to the LEFT of the notehead they decorate.
    for (const g of graces) expect(g.x).toBeLessThan(main?.x ?? 0)
  })

  it('hangs grace notes LEFT of the note, out of its width', () => {
    // Grace notes reach back into the gap the previous note's spring already opened, and
    // cost the cursor nothing while they fit in it. abcjs records exactly that: probed on
    // `C{ABc}G/4 D2`, the graced note has `w = 15.903` — no larger for the graces — and
    // `extraw = -30`, ten pixels per grace, all of it to the LEFT.
    const first = (abc: string) => notesOf(abc)[0]
    expect(first('{ABc}G/4|')?.left ?? 0).toBeGreaterThan(0)
    expect(first('G/4|')?.left ?? 0).toBe(0)
    // The width is the note's own, graces or not.
    expect(first('{ABc}G/4|')?.width).toBe(first('G/4|')?.width)
    expect(first('{AB}G2|')?.width).toBe(first('G2|')?.width)
  })

  it('slashes an acciaccatura and not an appoggiatura', () => {
    const lines = (abc: string) => notesOf(abc)[0]?.lines.length ?? 0
    // `{/g}` is the slashed one. Same note, same grace count — one extra line.
    expect(lines('{/A}G2|')).toBeGreaterThan(lines('{A}G2|'))
  })

  it('puts a chord symbol above and a lyric below', () => {
    const [note] = notesOf('"Am"G2|\nw:la')
    const chord = note?.texts.find((t) => t.text === 'Am')
    const lyric = note?.texts.find((t) => t.text === 'la')
    expect(chord).toBeDefined()
    expect(lyric).toBeDefined()
    // y is down: above the staff is negative, below is positive.
    expect(chord?.y).toBeLessThan(-2)
    expect(lyric?.y).toBeGreaterThan(2)
  })

  it('stacks extra verses downward', () => {
    const [note] = notesOf('G2|\nw:one\nw:two')
    const ys = (note?.texts ?? []).map((t) => t.y).sort((a, b) => a - b)
    expect(ys).toHaveLength(2)
    expect(ys[1]).toBeGreaterThan(ys[0] as number)
  })

  it('places an articulation away from the stem', () => {
    // A low note has an up stem, so its staccato dot goes BELOW the notehead.
    const low = notesOf('.C|')[0]?.glyphs.find((g) => g.name.startsWith('articStaccato'))
    const high = notesOf(".c'|")[0]?.glyphs.find((g) => g.name.startsWith('articStaccato'))
    expect(low?.name).toBe('articStaccatoBelow')
    expect(high?.name).toBe('articStaccatoAbove')
  })

  it('maps the decorations it knows and draws nothing for the rest', () => {
    // Still partial, and still the same principle: an unmapped mark gets NO glyph rather
    // than a near-enough one, because a wrong symbol is worse than an absent one.
    //
    // `!roll!` and `!slide!` used to be the examples here and now draw their own glyphs —
    // the roll a tremblement, the slide a lift. What remains unmapped is a different
    // shape of problem: navigation words like `D.C.` are TEXT, and `xstem` is a stem
    // instruction with no symbol at all.
    const named = (abc: string) =>
      (notesOf(abc)[0]?.glyphs ?? []).map((g) => g.name).filter((n) => !n.startsWith('notehead'))
    expect(named('!trill!G|')).toEqual(['ornamentTrill'])
    expect(named('!fermata!G|')).toEqual(['fermataAbove'])
    expect(named('!upbow!G|')).toEqual(['stringsUpBow'])
    expect(named('!roll!G|')).toEqual(['ornamentTremblement'])
    expect(named('!slide!G|')).toEqual(['brassLiftShort'])
    // Unmapped: no glyph, and emphatically not a wrong one.
    expect(named('!D.C.!G|')).toEqual([])
    expect(named('!xstem!G|')).toEqual([])
  })

  it('stacks several decorations on one note without overlapping', () => {
    // `.` rather than `!staccato!` — the default mode is strict, which drops the LONG
    // form because abcjs's tables omit it while its `.` path hard-codes it. The point
    // here is the stacking, so this uses the spelling that survives.
    const glyphs = (notesOf('.!accent!!tenuto!G|')[0]?.glyphs ?? []).filter((g) =>
      g.name.startsWith('artic'),
    )
    expect(glyphs).toHaveLength(3)
    const ys = glyphs.map((g) => g.y)
    expect(new Set(ys).size).toBe(3)
  })
})

describe('tunebooks', () => {
  const book = (n: number) =>
    Array.from({ length: n }, (_, i) => `X:${i + 1}\nT:Tune ${i + 1}\nL:1/4\nK:C\nCDEF|\n`).join('')

  it('lays out every tune, not just the first', () => {
    // 12 of the 41 corpus fixtures hold more than one tune, and `clefs` holds eight —
    // so rendering only the first left seven of its eight clefs invisible.
    const scores = parse(book(3)).scores
    expect(scores).toHaveLength(3)
    const doc = layoutBook(scores)
    expect(doc.systems).toHaveLength(3)
  })

  it('stacks tunes down the page without overlapping', () => {
    const doc = layoutBook(parse(book(4)).scores)
    const ys = doc.systems.map((s) => s.originY)
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1] as number)
    expect(doc.height).toBeGreaterThan(ys[ys.length - 1] as number)
  })

  it('lays each tune out independently of the ones above it', () => {
    // Same trick as systems and staves: a tune is laid out in its own space and
    // translated, so adding a tune at the top cannot shift the geometry of one below.
    const alone = layoutBook(parse('X:9\nT:Solo\nL:1/4\nK:C\nCDEF|\n').scores)
    const second = layoutBook(parse(`${book(1)}X:9\nT:Solo\nL:1/4\nK:C\nCDEF|\n`).scores)
    const strip = (doc: ReturnType<typeof layoutBook>, i: number) =>
      (doc.systems[i]?.staves[0]?.elements ?? []).map((e) => `${e.type}@${e.x.toFixed(3)}`)
    expect(strip(second, 1)).toEqual(strip(alone, 0))
  })

  it('heads each tune with its title, inside the layout so it is not clipped', () => {
    // The title must be added BEFORE extents are measured. Added afterwards it sits
    // above y = 0 and is clipped — which happened only to the FIRST tune, because every
    // later one had the tune above it to make room.
    const doc = layoutBook(parse(book(2)).scores)
    doc.systems.forEach((system, i) => {
      const title = system.staves[0]?.elements.find((e) => e.type === 'title')
      expect(title?.texts[0]?.text, `tune ${i}`).toBe(`Tune ${i + 1}`)
      // Absolute top of the title's ink must be on the page. Measured with the SAME
      // ascent the layout reserves — `TEXT_ASCENT` — not a stricter one invented here.
      // Asserting a full em while the extent reserves 0.8 reported a title clipped by
      // 0.48 spaces that nothing in the renderer actually clips, and the value is the
      // one that matches abcjs's measured text: see the constant.
      const text = title?.texts[0]
      const top = system.originY + (system.staves[0]?.originY ?? 0) + (text?.y ?? 0)
      expect(
        top - (text?.size ?? 0) * TEXT_ASCENT,
        `tune ${i} title is clipped`,
      ).toBeGreaterThanOrEqual(doc.top)
    })
  })

  it('renders a single score without a book wrapper', () => {
    const one = parse(book(1)).scores[0] as Score
    expect(layout(one).systems).toHaveLength(1)
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
  })

  it('draws a ZERO-length note as a stemless quarter head, as abcjs does', () => {
    // `C0` is legal ABC. This used to return null and the note vanished — abcjs keeps it:
    // `if (duration === 0) { zeroDuration = true; duration = 0.25; nostem = true; }`
    // (`abstract-engraver.js:790-791`) and then `chartable[style].nostem`, which is
    // `noteheads.quarter`. Its own `parse/note.test.js` asserts the durations survive.
    expect(noteGlyph(rational(0, 1))).toEqual({
      head: 'noteheadBlack',
      stemmed: false,
      flags: 0,
      dots: 0,
    })
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

describe('compatibility modes', () => {
  it('defaults to abcjs-strict', () => {
    // A replacement whose default output differs from the thing it replaces is not one.
    expect(defaultMode).toBe('abcjs-strict')
  })

  it("renders at abcjs density in strict mode, and core's own otherwise", () => {
    const gap = (mode: CompatibilityMode) => {
      const abc = 'X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n'
      const notes = (
        layout(parse(abc, { mode }).scores[0] as Score, { mode }).systems[0]?.staves[0]?.elements ??
        []
      ).filter((e) => e.type === 'note')
      return (notes[1]?.x ?? 0) - (notes[0]?.x ?? 0)
    }
    // abcjs sets a quarter note at sqrt(0.25*8)*30px = 42.43px = 5.474 staff spaces,
    // measured identically in the goldens. Core follows abcm2ps and is looser.
    expect(gap('abcjs-strict')).toBeCloseTo(5.474, 2)
    expect(gap('abc2.1')).toBeCloseTo(6.5, 2)
    expect(gap('extended')).toBeCloseTo(6.5, 2)
  })

  it('reads `+:` as music in strict mode and as a continuation otherwise', () => {
    // abcjs does not implement `+:`, so the prose falls through and is parsed as notes.
    const abc = 'X:1\nL:1/4\nT:Title\n+:continued CDEF\nK:C\nGABc|\n'
    const notes = (mode: CompatibilityMode) =>
      parse(abc, { mode })
        .scores.flatMap((s) => s.voices)
        .flatMap((v) => v.measures.flatMap((m) => m.events))
        .filter((e) => e.type === 'note').length
    expect(notes('abcjs-strict')).toBeGreaterThan(notes('abc2.1'))
  })

  it('binds a spaced lyric hyphen abcjs-style in strict mode only', () => {
    // `A - ve,`: abcjs attaches the hyphen to the previous syllable and skips a note;
    // abcMusicKit2 makes it a syllable of its own. Arbitrated against the goldens.
    const lyrics = (mode: CompatibilityMode) =>
      (parse('X:1\nL:1/4\nK:C\nCDE|\nw:A - ve,\n', { mode }).scores[0]?.voices[0]?.measures ?? [])
        .flatMap((m) => m.events)
        .map((e) => (e.type === 'rest' ? null : e.lyric))
    expect(lyrics('abcjs-strict')).toEqual(['A-', null, 've,'])
    expect(lyrics('abc2.1')).toEqual(['A', 've,', null])
  })
})

describe('tuplets', () => {
  const staffOf = (abc: string) =>
    layout(parse(`X:1\nM:4/4\nL:1/8\nK:C\n${abc}\n`).scores[0] as Score, { systemWidth: 200 })
      .systems[0]?.staves[0]

  it('numbers a tuplet, so a triplet is not three plain notes', () => {
    // 177 tuplet members sit in the corpus and none were drawn. The structural gate
    // never noticed: it compares noteheads, and abcjs does not put a bracket in
    // `children` either — the same blind spot slurs and accidentals had.
    expect(staffOf('(3cde c4|')?.tupletTexts.map((t) => t.text)).toEqual(['3'])
    expect(staffOf('(5cdefg c2|')?.tupletTexts.map((t) => t.text)).toEqual(['5'])
    expect(staffOf('cdef|')?.tupletTexts).toEqual([])
  })

  it('brackets an unbeamed tuplet and leaves a beamed one bare', () => {
    // *Behind Bars*: the beam already shows the grouping, so a beamed tuplet prints only
    // its number. Unbeamed, the number needs a bracket to say how far the claim extends.
    expect(staffOf('(3cde c4|')?.tupletLines).toHaveLength(0)
    // Two rule segments either side of the number, plus a hook at each end.
    expect(staffOf('(3c2d2e2 c2|')?.tupletLines).toHaveLength(4)
  })

  it('spans a rest inside the tuplet', () => {
    // `(3cz` and `(3z` are both in the corpus, so a rest needs an anchor like any member.
    const staff = staffOf('(3c2z2d2 c2|')
    expect(staff?.tupletLines).toHaveLength(4)
    const notes = (staff?.elements ?? []).filter((e) => e.type === 'note')
    const rule = staff?.tupletLines[0]
    // The bracket starts at the first note and reaches past the rest to the last.
    expect(rule?.x1).toBeLessThanOrEqual(notes[0]?.x ?? 0)
  })

  it('clears the stems and beams, not just the noteheads', () => {
    // Measuring the notehead extent put the number underneath the beam — the geometry
    // was right and the drawing was useless. The bracket reads the DRAWN element.
    const staff = staffOf('(3cde c4|')
    const text = staff?.tupletTexts[0]
    const beam = staff?.beams[0]
    expect(text).toBeDefined()
    expect(beam).toBeDefined()
    // High notes take down stems, so the beam is below the heads and the number below it.
    expect(text?.y ?? 0).toBeGreaterThan(Math.max(beam?.y1 ?? 0, beam?.y2 ?? 0))
  })
})

describe('repeat endings (voltas)', () => {
  const staffOf = (abc: string) =>
    layout(parse(`X:1\nM:4/4\nL:1/4\nK:C\n${abc}\n`).scores[0] as Score, { systemWidth: 200 })
      .systems[0]?.staves[0]

  it('parses the ending number, which used to be silently dropped', () => {
    // `|1` reached the lexer as barline + digit and nothing consumed the digit, so a
    // reader could not tell which pass through a repeat plays which bars.
    const measures = parse('X:1\nL:1/4\nK:C\n|:CDEF|1 GABc:|2 cBAG||\n').scores[0]?.voices[0]
      ?.measures
    expect(measures?.map((m) => m.volta)).toEqual([null, '1', '2'])
  })

  it('reads a multi-pass label', () => {
    const measures = parse('X:1\nL:1/4\nK:C\nCDEF|1,2 GABc:|\n').scores[0]?.voices[0]?.measures
    expect(measures?.[1]?.volta).toBe('1,2')
  })

  it('brackets each ending and labels it', () => {
    const staff = staffOf('|:CDEF|1 GABc:|2 cBAG||')
    expect(staff?.voltaTexts.map((t) => t.text)).toEqual(['1', '2'])
    // Each ending: a rule, an opening hook, and a closing hook.
    expect(staff?.voltaLines).toHaveLength(6)
  })

  it('starts a new ending where the previous one stops', () => {
    // `|1 … :|2` runs them back to back, so ending 2 opens exactly where 1 closes.
    const lines = staffOf('|:CDEF|1 GABc:|2 cBAG||')?.voltaLines ?? []
    const rules = lines.filter((l) => l.y1 === l.y2).sort((a, b) => a.x1 - b.x1)
    expect(rules).toHaveLength(2)
    expect(rules[1]?.x1).toBeCloseTo(rules[0]?.x2 ?? 0, 1)
  })

  it('sits above the staff, clear of the music', () => {
    for (const line of staffOf('|:CDEF|1 GABc:|2 cBAG||')?.voltaLines ?? []) {
      // y is down; the staff's top line is at -2.
      expect(Math.max(line.y1, line.y2)).toBeLessThan(-2)
    }
  })

  it('draws nothing when there are no endings', () => {
    expect(staffOf('CDEF|GABc|')?.voltaLines).toEqual([])
  })
})

describe('annotations', () => {
  const textsOf = (abc: string) =>
    (
      layout(parse(`X:1\nM:4/4\nL:1/4\nK:C\n${abc}\n`).scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    ).flatMap((e) => e.texts)

  it('prints the text and not the placement char', () => {
    // `^` says where, not what. Printing it would put a caret on the page.
    expect(textsOf('"^dolce"C|').map((t) => t.text)).toEqual(['dolce'])
    expect(textsOf('"_p"C|').map((t) => t.text)).toEqual(['p'])
  })

  it("SHARES a chord symbol's lane, which is what abcjs does", () => {
    // This used to assert the opposite — "a chord symbol sits in its own lane, so the two
    // must not land on the same line". abcjs disagrees, and the SVG is the evidence:
    // `"Am7"C` and `"^Am7"C` both draw at y 38.56. `RelativeElement` gives a `type:
    // "text"` with no pitch the very same `chordHeightAbove` a `type: "chord"` gets
    // (`relative-element.js:60-76`), and `setUpperAndLowerRelativeElements` handles both
    // in one `case "text": case "chord":`.
    //
    // What still separates them is ALIGNMENT — a chord is centred on the notehead and an
    // annotation is left-justified — and lane PACKING, which pushes the second of two
    // overlapping marks onto its own line.
    const chord = textsOf('"Am7"C|')[0]
    const annotation = textsOf('"^Am7"C|')[0]
    expect(chord?.text).toBe('Am7')
    expect(annotation?.text).toBe('Am7')
    expect(chord?.y).toBe(annotation?.y)
  })

  it('stacks above the staff with the first one written on top', () => {
    // abcjs joins same-position annotations into one block, so `"^Allegro""^con brio"`
    // reads as two lines with Allegro above. Verified against abcjs's element dump.
    const texts = textsOf('"^Allegro""^con brio"C|')
    const allegro = texts.find((t) => t.text === 'Allegro')
    const conBrio = texts.find((t) => t.text === 'con brio')
    // SVG y grows downward, so "above" is the smaller number.
    expect(allegro?.y ?? 0).toBeLessThan(conBrio?.y ?? 0)
    expect(conBrio?.y ?? 0).toBeLessThan(0)
  })

  it('stacks below the staff with the first one written nearest', () => {
    // The mirror of the above case, and the reason the two loops count in opposite
    // directions: both put the first-written on the block's TOP line.
    const texts = textsOf('"_p""_dolce"C|')
    const p = texts.find((t) => t.text === 'p')
    const dolce = texts.find((t) => t.text === 'dolce')
    expect(p?.y ?? 0).toBeLessThan(dolce?.y ?? 0)
    expect(p?.y ?? 0).toBeGreaterThan(0)
  })

  it('puts `<` and `>` beside the note rather than above it', () => {
    const left = textsOf('"<cresc"C|')[0]
    const right = textsOf('">cresc"C|')[0]
    // Staff height. `toBeCloseTo` because stepToY(0) is -0, which draws the same as 0.
    expect(left?.y).toBeCloseTo(0)
    expect(right?.y).toBeCloseTo(0)
    expect(left?.x ?? 0).toBeLessThan(right?.x ?? 0)
  })
})

describe('mixed-length chords', () => {
  // Every system — see the note on the other `headsOf`.
  const headsOf = (abc: string) =>
    layout(parse(`X:1\nM:4/4\nL:1/4\nK:C\n${abc}\n`).scores[0] as Score, { systemWidth: 200 })
      .systems.flatMap((system) => system.staves[0]?.elements ?? [])
      .flatMap((e) => e.glyphs)
      .filter((g) => g.role === 'notehead')
      .map((g) => g.name)

  it('takes ONE head glyph for the whole chord, from its first note — as abcjs does', () => {
    // `[C4G]` is a whole-note head and a quarter-note head written together, and the
    // obvious reading is that it should draw one of each. abcjs does not: it takes the
    // FIRST note's duration for every head in the chord. Probed directly against abcjs
    // 6.6.3 — `[C4G]` gives noteheads.whole twice, `[CG4]` gives noteheads.quarter twice.
    //
    // So `Chord.headDurations` is deliberately NOT rendered. Drawing it would be better
    // engraving and a DIVERGENCE, which strict mode is the wrong place for. The corpus
    // hides this: all 18 of its mixed chords combine eighths, quarters and sixteenths,
    // and those share one filled head, so nothing there can tell the two rules apart.
    expect(headsOf('[C4G]|')).toEqual(['noteheadWhole', 'noteheadWhole'])
    expect(headsOf('[CG4]|')).toEqual(['noteheadBlack', 'noteheadBlack'])
    expect(headsOf('[C4G2]|')).toEqual(['noteheadWhole', 'noteheadWhole'])
  })

  it('still records the per-head durations for a non-strict renderer to use', () => {
    // Parsed and kept, just not drawn — `abc2.1`/`extended` are where honouring it belongs.
    const score = parse('X:1\nL:1/4\nK:C\n[C4G]|\n').scores[0] as Score
    const event = score.voices[0]?.measures[0]?.events[0]
    expect(event?.type).toBe('chord')
    expect(event?.type === 'chord' ? event.headDurations.length : 0).toBe(2)
  })
})

describe('melisma extenders', () => {
  const staffOf = (abc: string, mode: CompatibilityMode = 'abc2.1') =>
    layout(parse(abc, { mode }).scores[0] as Score, { mode, systemWidth: 400 }).systems[0]
      ?.staves[0]

  const textsOf = (abc: string, mode: CompatibilityMode = 'abc2.1') =>
    (staffOf(abc, mode)?.elements ?? []).flatMap((e) => e.texts).map((t) => t.text)

  const HELD = 'X:1\nL:1/4\nK:C\nCDEF|\nw:sing_ _ _ ing\n'

  it("prints abcjs's literal underscore in strict mode and draws no line", () => {
    // abcjs's element dump carries `c: "sing_"` — one text, underscore folded in. Strict
    // reproduces that rather than drawing the extender every engraving convention wants.
    expect(textsOf(HELD, 'abcjs-strict')).toContain('sing_')
    expect(staffOf(HELD, 'abcjs-strict')?.melismaLines).toHaveLength(0)
  })

  it('suppresses the underscore and strokes a line in non-strict modes', () => {
    expect(textsOf(HELD)).toContain('sing')
    expect(textsOf(HELD)).not.toContain('sing_')
    expect(staffOf(HELD)?.melismaLines).toHaveLength(1)
  })

  it('stops at the last held NOTEHEAD, not at the end of its duration', () => {
    // Gould, Behind Bars p.447: the line runs to the last written NOTE, not to the end of
    // that note's duration — the book prints the over-long form as a captioned example of
    // the mistake. A whole note puts the two endpoints far apart, which is why this uses one.
    const staff = staffOf('X:1\nL:1/4\nK:C\nC4|D4|\nw:Glo_ _\n')
    const line = staff?.melismaLines[0]
    const notes = (staff?.elements ?? []).filter((e) => e.type === 'note')
    const held = notes[notes.length - 1]
    expect(line).toBeDefined()
    expect(held).toBeDefined()
    const noteheadRight = Math.max(
      ...(held?.glyphs ?? []).filter((g) => g.role === 'notehead').map((g) => g.x + 1),
    )
    const durationRight = (held?.x ?? 0) + (held?.width ?? 0)
    // Far from the duration's end, and close to the notehead's.
    expect(line?.x2 ?? 0).toBeLessThan(durationRight - 1)
    expect(Math.abs((line?.x2 ?? 0) - noteheadRight)).toBeLessThan(1.5)
  })

  it('lets a rest keep the run alive without moving its end', () => {
    // v1's rule: a rest inside a melisma neither closes the run nor extends it. Asserting
    // the COUNT would not test that — a rest that wrongly closed the run still leaves one
    // line, just a shorter one. The endpoint is what distinguishes the two.
    const staff = staffOf('X:1\nL:1/4\nK:C\nCDzE|\nw:sing_ _ _\n')
    const line = staff?.melismaLines[0]
    const notes = (staff?.elements ?? []).filter((e) => e.type === 'note')
    const last = notes[notes.length - 1]
    expect(staff?.melismaLines).toHaveLength(1)
    // Reaches the note AFTER the rest, not the one before it.
    expect(line?.x2 ?? 0).toBeGreaterThan(last?.x ?? 0)
  })

  it('draws nothing when no syllable is held', () => {
    expect(staffOf('X:1\nL:1/4\nK:C\nCDEF|\nw:one two three four\n')?.melismaLines).toEqual([])
  })

  it("keeps strict's underscore when the hold wraps to the next system", () => {
    // Regression. The underscore was first gated on finding a hold in the SAME system,
    // which is wrong: for abcjs the `_` is part of the syllable's text and says nothing
    // about where the held note ended up. The modes wrap differently — strict renders at
    // abcjs's denser spacing — so this silently dropped the underscore from the one piece
    // of real corpus content that has a melisma, which no gate renders.
    // Two source lines, so the held syllable and the notes holding it land in different
    // systems — which is the case this guards. A narrow page no longer splits a line.
    const abc = 'X:1\nL:1/4\nK:C\nCDEF|GABc|\nw:a b c d e f g sing_\ndefg|\nw:_ _ _ _\n'
    const narrow = layout(parse(abc, { mode: 'abcjs-strict' }).scores[0] as Score, {
      mode: 'abcjs-strict',
      systemWidth: 26,
    })
    expect(narrow.systems.length).toBeGreaterThan(1)
    const texts = narrow.systems.flatMap((s) =>
      s.staves.flatMap((st) => st.elements.flatMap((e) => e.texts.map((t) => t.text))),
    )
    expect(texts).toContain('sing_')
  })
})

describe('styled noteheads', () => {
  // EVERY system, not `systems[0]`. Each source line is now its own system, so reading
  // only the first silently truncated any test whose ABC spans more than one line —
  // which is exactly what a `[K: style=]` test needs to do.
  const headsOf = (abc: string) =>
    layout(parse(abc).scores[0] as Score, { systemWidth: 300 })
      .systems.flatMap((system) => system.staves[0]?.elements ?? [])
      .flatMap((e) => e.glyphs)
      .filter((g) => g.role === 'notehead')
      .map((g) => g.name)

  it('draws the four shapes abcjs draws', () => {
    // Verified against abcjs 6.6.3's element dump: harmonic is a diamond, `x` is its
    // `noteheads.indeterminate`, rhythm a slash, triangle a triangle.
    expect(
      headsOf(
        'X:1\nL:1/4\nK:C\nC !style=harmonic! D !style=x! E !style=triangle! F !style=rhythm! G|\n',
      ),
    ).toEqual([
      'noteheadBlack',
      'noteheadDiamondBlack',
      'noteheadXBlack',
      'noteheadTriangleUpBlack',
      'noteheadSlashVerticalEnds',
    ])
  })

  it('lets the DURATION still pick filled vs open', () => {
    // The style picks the shape and the duration picks the fill, so a harmonic half note
    // is an open diamond rather than a second harmonic glyph.
    expect(headsOf('X:1\nL:1/4\nK:C\n!style=harmonic!C !style=harmonic!C2|\n')).toEqual([
      'noteheadDiamondBlack',
      'noteheadDiamondWhite',
    ])
  })

  it('applies `[K: style=]` to every following note until the next one', () => {
    // The form the corpus actually uses, and the reason style is VOICE state rather than
    // a property of one note.
    const heads = headsOf(
      'X:1\nM:4/4\nL:1/4\nK:C\nC D|\n[K: style=harmonic]G A|\n[K: style=normal]c B|\n',
    )
    expect(heads).toEqual([
      'noteheadBlack',
      'noteheadBlack',
      'noteheadDiamondBlack',
      'noteheadDiamondBlack',
      'noteheadBlack',
      'noteheadBlack',
    ])
  })

  it('applies a header `K:C treble style=rhythm` to the whole tune', () => {
    expect(headsOf('X:1\nL:1/4\nK:C treble style=rhythm\nC D|\n')).toEqual([
      'noteheadSlashVerticalEnds',
      'noteheadSlashVerticalEnds',
    ])
  })

  it('does NOT let a style-only K: field wipe the key signature', () => {
    // `parseKey` falls back to C for anything it cannot read, so passing it
    // `style=harmonic` would silently transpose the rest of the tune out of G major.
    const score = parse('X:1\nM:4/4\nL:1/4\nK:G\nF G|\n[K: style=harmonic]F G|\n').scores[0]
    expect(score?.key.tonic.step).toBe('g')
    expect(score?.voices[0]?.measures[1]?.keyChange ?? null).toBeNull()
  })

  it('lets an inline !style=! override the standing style for one note', () => {
    expect(headsOf('X:1\nM:4/4\nL:1/4\nK:C style=rhythm\nC !style=harmonic!D C|\n')).toEqual([
      'noteheadSlashVerticalEnds',
      'noteheadDiamondBlack',
      'noteheadSlashVerticalEnds',
    ])
  })
})

describe('microtonal accidentals', () => {
  const accidentalsOf = (abc: string, mode: CompatibilityMode) =>
    (
      layout(parse(abc, { mode }).scores[0] as Score, { mode, systemWidth: 300 }).systems[0]
        ?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      .filter((g) => g.role === 'accidental')
      .map((g) => g.name)

  const ALL = 'X:1\nL:1/4\nK:C\n^/G ^G ^3/2G _/A _3/2A G|\n'

  it('draws the quarter-tone pair, which abcjs draws too', () => {
    // abcjs emits `accidentals.halfsharp` / `.halfflat` for `^/` and `_/`. We drew a FULL
    // sharp or flat for both, so a half-sharp printed as a plain sharp — wrong output
    // rather than missing output, which is why "parsed, not rendered" undersold this.
    expect(accidentalsOf('X:1\nL:1/4\nK:C\n^/G _/A|\n', 'abcjs-strict')).toEqual([
      'accidentalQuarterToneSharpStein',
      'accidentalQuarterToneFlatStein',
    ])
  })

  it('prints NO accidental for a three-quarter tone in strict, as abcjs does', () => {
    // Probed against 6.6.3: `^3/2G` yields accidental "-" and no glyph in its element
    // dump. abcjs knows the quarter-tone pair and nothing wider. We were printing a full
    // sharp there — ink abcjs does not put on the page.
    expect(accidentalsOf('X:1\nL:1/4\nK:C\n^3/2G _3/2A|\n', 'abcjs-strict')).toEqual([])
  })

  it('draws the three-quarter glyphs in abc2.1 and extended', () => {
    // The mode split: strict reproduces abcjs's blank, the other modes draw what the ABC
    // actually says. This is the divergence being deliberate rather than accidental.
    for (const mode of ['abc2.1', 'extended'] as const) {
      expect(accidentalsOf('X:1\nL:1/4\nK:C\n^3/2G _3/2A|\n', mode)).toEqual([
        'accidentalThreeQuarterTonesSharpStein',
        'accidentalThreeQuarterTonesFlatZimmermann',
      ])
    }
  })

  it('leaves ordinary accidentals alone in every mode', () => {
    for (const mode of ['abcjs-strict', 'abc2.1', 'extended'] as const) {
      expect(accidentalsOf('X:1\nL:1/4\nK:C\n^G _A =B|\n', mode)).toEqual([
        'accidentalSharp',
        'accidentalFlat',
        'accidentalNatural',
      ])
    }
  })

  it('differs between the modes on exactly the two three-quarter tones', () => {
    expect(accidentalsOf(ALL, 'abcjs-strict')).toHaveLength(3)
    expect(accidentalsOf(ALL, 'abc2.1')).toHaveLength(5)
  })
})

describe('flags beyond the sixteenth', () => {
  const flagsOf = (unit: string) =>
    (
      layout(parse(`X:1\nL:${unit}\nK:C\nC z C|\n`).scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      .filter((g) => g.role === 'flag')
      .map((g) => g.name)

  it('draws one glyph per duration, not a repeated sixteenth', () => {
    // Everything shorter than a 16th used to fall back to the 16th flag, justified as
    // "two flags is already rare in the corpus". The corpus has 72 such notes; 63 are
    // beamed and were fine, but 9 are unbeamed and every one printed the wrong rhythm.
    // Four of those nine are 64ths.
    expect(flagsOf('1/8')).toEqual(['flag8thUp', 'flag8thUp'])
    expect(flagsOf('1/16')).toEqual(['flag16thUp', 'flag16thUp'])
    expect(flagsOf('1/32')).toEqual(['flag32ndUp', 'flag32ndUp'])
    expect(flagsOf('1/64')).toEqual(['flag64thUp', 'flag64thUp'])
  })

  it('leaves beamed runs to the beam pass, which already had the levels right', () => {
    const staff = layout(parse('X:1\nM:1/8\nL:1/32\nK:C\nCCCC|\n').scores[0] as Score, {
      systemWidth: 200,
    }).systems[0]?.staves[0]
    expect(staff?.elements.flatMap((e) => e.glyphs).filter((g) => g.role === 'flag')).toEqual([])
    // Three beam levels for a 32nd, which is what a flag would have carried.
    expect(new Set((staff?.beams ?? []).map((b) => b.y1.toFixed(3))).size).toBe(3)
  })
})

describe('decoration coverage', () => {
  const glyphsOf = (dec: string) =>
    (
      layout(parse(`X:1\nL:1/4\nK:C\n${dec}F|\n`).scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      // `dynamic` as well as `decoration`: below-staff dynamics carry their own role so
      // `anchorBelowStaff` can find them, but they are still decorations here.
      .filter((g) => g.role === 'decoration' || g.role === 'dynamic')
      .map((g) => g.name)

  it("resolves abcjs's pseudonyms, which already had glyphs", () => {
    // These drew NOTHING only because the table was keyed on the canonical name while the
    // model keeps the source spelling. abcjs rewrites them via accentPseudonyms; we alias
    // instead. Verified against 6.6.3: `!>!` and `!emphasis!` draw its sforzato (the
    // accent wedge), `!^!` its umarcato, `!tr!` its trill.
    // Below, not Above: a lone middle-C takes an up stem, and articulations sit opposite
    // the stem. The point here is that a glyph appears at all.
    expect(glyphsOf('!>!')).toEqual(['articAccentBelow'])
    expect(glyphsOf('!emphasis!')).toEqual(['articAccentBelow'])
    expect(glyphsOf('!^!')).toEqual(['articMarcatoBelow'])
    expect(glyphsOf('!tr!')).toEqual(['ornamentTrill'])
  })

  it("draws every dynamic in abcjs's volumeDecoration set", () => {
    // Only `p` and `f` were mapped. SMuFL precomposes the multi-letter ones, so `mp` is a
    // single glyph rather than an `m` and a `p` placed side by side.
    expect(glyphsOf('!mp!')).toEqual(['dynamicMP'])
    expect(glyphsOf('!ff!')).toEqual(['dynamicFF'])
    expect(glyphsOf('!pp!')).toEqual(['dynamicPP'])
    expect(glyphsOf('!sfz!')).toEqual(['dynamicSforzando1'])
  })

  it('draws fingerings as digits', () => {
    expect(glyphsOf('!3!')).toEqual(['fingering3'])
    expect(glyphsOf('!0!')).toEqual(['fingering0'])
    expect(glyphsOf('!5!')).toEqual(['fingering5'])
  })

  it('aliases `mordent` and `trillh` the way abcjs draws them', () => {
    // abcjs gives `!mordent!` its scripts.mordent — the same glyph as `!lowermordent!` —
    // and `!trillh!` its scripts.trill.
    expect(glyphsOf('!mordent!')).toEqual(glyphsOf('!lowermordent!'))
    expect(glyphsOf('!trillh!')).toEqual(glyphsOf('!trill!'))
  })

  it('still draws nothing for the spanners, which are the next wave', () => {
    // Hairpins and glissandi need start/end anchors like slurs, not a stamped glyph.
    // Asserted so the gap stays visible rather than being mistaken for coverage.
    expect(glyphsOf('!<(!')).toEqual([])
    expect(glyphsOf('!glissando(!')).toEqual([])
  })
})

describe('spanning decorations', () => {
  const staffOf = (abc: string, width = 300) =>
    layout(parse(abc).scores[0] as Score, { systemWidth: width }).systems[0]?.staves[0]

  it('opens a crescendo to the right and mirrors it for a diminuendo', () => {
    // abcjs paints two strokes from a common apex to a spread mouth, ~1 staff space at
    // 7.75px per space. A crescendo points left; a diminuendo is its mirror.
    const cresc = staffOf('X:1\nM:4/4\nL:1/4\nK:C\n!<(!C D E !<)!F|\n')?.spannerLines ?? []
    expect(cresc).toHaveLength(2)
    // Apex: both strokes meet at the left.
    expect(cresc[0]?.y1).toBe(cresc[1]?.y1)
    expect(cresc[0]?.y2).not.toBe(cresc[1]?.y2)

    const dim = staffOf('X:1\nM:4/4\nL:1/4\nK:C\n!>(!C D E !>)!F|\n')?.spannerLines ?? []
    expect(dim).toHaveLength(2)
    // Apex on the RIGHT instead.
    expect(dim[0]?.y2).toBe(dim[1]?.y2)
    expect(dim[0]?.y1).not.toBe(dim[1]?.y1)
  })

  it('accepts both spellings of each hairpin', () => {
    // `!<(!` and `!crescendo(!` are the same mark; abcjs treats them as one kind.
    const a = staffOf('X:1\nM:4/4\nL:1/4\nK:C\n!crescendo(!C D !crescendo)!E z|\n')
    expect(a?.spannerLines).toHaveLength(2)
  })

  it('pairs consecutive hairpins of the same kind in order', () => {
    // S1-decorations writes `!crescendo(!G!<(!G` and then closes both. A single open slot
    // per kind let the second overwrite the first and silently lost a hairpin, so this is
    // a queue. FIFO because hairpins run in sequence rather than nesting.
    const staff = staffOf(
      'X:1\nM:4/4\nL:1/4\nK:C\n!crescendo(!G!<(!G |\n!crescendo)!G!<)!G z2|\n',
      400,
    )
    expect(staff?.spannerLines).toHaveLength(4)
  })

  it('splits a hairpin across a system break instead of dropping it', () => {
    // Resolved per system, a pair whose ends land in different systems vanished — which
    // cost HALF the hairpins in S1-decorations tune 2, since it wraps to six systems.
    // Now resolved after packing, alongside slurs, which have the same problem.
    const doc = layout(
      // Break where the SOURCE breaks: the hairpin opens on line 1 and closes on line 2.
      parse("X:1\nM:4/4\nL:1/4\nK:C\n!<(!C D E F|G A B c|\nd e f g|a b c' !<)!d'|\n")
        .scores[0] as Score,
      { systemWidth: 26 },
    )
    expect(doc.systems.length).toBeGreaterThan(1)
    const total = doc.systems.flatMap((s) => s.staves).flatMap((st) => st.spannerLines)
    // Two strokes on each of the two systems the hairpin touches.
    expect(total.length).toBeGreaterThanOrEqual(4)
  })

  it('draws a glissando between the noteheads, not in the dynamic lane', () => {
    const staff = staffOf('X:1\nM:4/4\nL:1/4\nK:C\n!glissando(!C !glissando)!G z2|\n')
    const line = staff?.spannerLines[0]
    expect(staff?.spannerLines).toHaveLength(1)
    // Slopes with the pitch rather than running level under the staff.
    expect(line?.y1).not.toBe(line?.y2)
  })

  it('draws nothing for an unpaired open', () => {
    expect(staffOf('X:1\nM:4/4\nL:1/4\nK:C\n!<(!C D E F|\n')?.spannerLines).toEqual([])
  })
})

describe('ornaments and techniques', () => {
  const glyphsOf = (dec: string, mode: CompatibilityMode = 'abcjs-strict') =>
    (
      layout(parse(`X:1\nL:1/4\nK:C\n${dec}F|\n`, { mode }).scores[0] as Score, {
        mode,
        systemWidth: 200,
      }).systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      // `dynamic` as well as `decoration`: below-staff dynamics carry their own role so
      // `anchorBelowStaff` can find them, but they are still decorations here.
      .filter((g) => g.role === 'decoration' || g.role === 'dynamic')
      .map((g) => g.name)

  it('draws every ornament abcjs paints', () => {
    // Checked against abcjs's RENDERED SVG, not its element dump. The dump misses
    // anything attached through addOther, which made `slide` and `breath` look
    // unsupported on the first pass — the same blind spot that nearly lost the dynamics.
    for (const name of [
      'roll',
      'slide',
      'breath',
      'wedge',
      'open',
      'thumb',
      'snap',
      'invertedfermata',
      'pralltriller',
    ]) {
      expect(glyphsOf(`!${name}!`), `!${name}! should draw`).toHaveLength(1)
    }
  })

  it('draws NOTHING for the inverted turns in strict, as abcjs does', () => {
    // abcjs recognises these — they are in its legalAccents, so the parser keeps them —
    // and then paints nothing. Confirmed twice, by element dump and by rendered SVG.
    // Distinct from a name abcjs REJECTS, which never reaches the renderer at all.
    for (const name of ['invertedturn', 'turnx', 'invertedturnx']) {
      expect(glyphsOf(`!${name}!`, 'abcjs-strict'), `!${name}! in strict`).toEqual([])
    }
  })

  it('draws them in abc2.1 and extended', () => {
    // Third instance of the same split, after melisma and the microtones: strict is
    // faithful, the other modes draw what the ABC names.
    for (const mode of ['abc2.1', 'extended'] as const) {
      expect(glyphsOf('!invertedturn!', mode)).toEqual(['ornamentTurnInverted'])
      expect(glyphsOf('!turnx!', mode)).toEqual(['ornamentTurnSlash'])
    }
  })

  it('stacks a crowded note outward instead of overprinting', () => {
    // Adding the roll to a note that already had ornaments pushed the mordent to the next
    // lane rather than colliding with it — which is what the baseline diff showed.
    const ys = (
      layout(parse('X:1\nL:1/4\nK:C\n!roll!!lowermordent!!upbow!F|\n').scores[0] as Score, {
        systemWidth: 200,
      }).systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      // `dynamic` as well as `decoration`: below-staff dynamics carry their own role so
      // `anchorBelowStaff` can find them, but they are still decorations here.
      .filter((g) => g.role === 'decoration' || g.role === 'dynamic')
      .map((g) => g.y)
    expect(ys.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ys).size).toBe(ys.length)
  })
})

describe('navigation directions', () => {
  const textsOf = (dec: string) =>
    (
      layout(parse(`X:1\nL:1/4\nK:C\n${dec}F|\n`).scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    ).flatMap((e) => e.texts)

  it('draws them as WORDS, in conventional engraving spelling', () => {
    // The ABC token is an identifier; the page wants prose. abcjs paints each of these —
    // verified as a delta against a plain note in its rendered SVG.
    expect(textsOf('!D.C.!').map((t) => t.text)).toEqual(['D.C.'])
    expect(textsOf('!fine!').map((t) => t.text)).toEqual(['Fine'])
    expect(textsOf('!D.S.alcoda!').map((t) => t.text)).toEqual(['D.S. al Coda'])
    expect(textsOf('!D.C.alfine!').map((t) => t.text)).toEqual(['D.C. al Fine'])
  })

  it('sets them in italic, as directions rather than lyrics', () => {
    expect(textsOf('!D.C.!')[0]?.italic).toBe(true)
  })

  it('stacks two on one note rather than overprinting', () => {
    const ys = textsOf('!D.C.!!fine!').map((t) => t.y)
    expect(ys).toHaveLength(2)
    expect(new Set(ys).size).toBe(2)
  })

  it('draws no GLYPH for them — they are text, not symbols', () => {
    const glyphs = (
      layout(parse('X:1\nL:1/4\nK:C\n!D.C.!F|\n').scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      // `dynamic` as well as `decoration`: below-staff dynamics carry their own role so
      // `anchorBelowStaff` can find them, but they are still decorations here.
      .filter((g) => g.role === 'decoration' || g.role === 'dynamic')
    expect(glyphs).toEqual([])
  })
})

describe('decorations abcjs accepts but never paints', () => {
  // Distinct from names abcjs REJECTS, which the parser drops in strict. These are
  // accepted, attached to the note, and then drawn by nobody — so asserting the blank
  // keeps it a recorded decision rather than a hole someone re-discovers.
  //
  // `xstem` is a stem instruction, `editorial`/`courtesy` mark an accidental's status,
  // `mark` is a reference point, `trill(`/`trill)` open and close a span abcjs does not
  // render. Verified by SVG delta against a plain note: all zero.
  const drawnFor = (dec: string) => {
    const staff = layout(parse(`X:1\nL:1/4\nK:C\n${dec}F|\n`).scores[0] as Score, {
      systemWidth: 200,
    }).systems[0]?.staves[0]
    const els = staff?.elements ?? []
    return [
      ...els.flatMap((e) => e.glyphs).filter((g) => g.role === 'decoration'),
      ...els.flatMap((e) => e.texts),
      ...(staff?.spannerLines ?? []),
    ]
  }

  for (const name of ['xstem', 'editorial', 'courtesy', 'mark']) {
    it(`draws nothing for !${name}!, matching abcjs`, () => {
      expect(drawnFor(`!${name}!`)).toEqual([])
    })
  }
})

describe('tremolo, phrases and technique', () => {
  const glyphsOf = (dec: string) =>
    (
      layout(parse(`X:1\nL:1/4\nK:C\n${dec}F|\n`).scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      // `dynamic` as well as `decoration`: below-staff dynamics carry their own role so
      // `anchorBelowStaff` can find them, but they are still decorations here.
      .filter((g) => g.role === 'decoration' || g.role === 'dynamic')
      .map((g) => g.name)

  it('picks one tremolo glyph per stroke count', () => {
    // The count IS the rhythm, so `!//!` is tremolo2 rather than two tremolo1s stacked.
    expect(glyphsOf('!/!')).toEqual(['tremolo1'])
    expect(glyphsOf('!//!')).toEqual(['tremolo2'])
    expect(glyphsOf('!///!')).toEqual(['tremolo3'])
    expect(glyphsOf('!////!')).toEqual(['tremolo4'])
  })

  it('draws nothing for `trem1`..`trem4`, matching abcjs', () => {
    // The same marks under different names, and abcjs paints the slash spellings only.
    // Its quirk; reproduced rather than tidied, and asserted so it stays deliberate.
    for (const n of ['trem1', 'trem2', 'trem3', 'trem4']) {
      expect(glyphsOf(`!${n}!`), `!${n}!`).toEqual([])
    }
  })

  it('puts a tremolo on the stem, not in an ornament lane', () => {
    const y = (
      layout(parse('X:1\nL:1/4\nK:C\n!//!F|\n').scores[0] as Score, { systemWidth: 200 }).systems[0]
        ?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      .find((g) => g.name === 'tremolo2')?.y
    const ornament = (
      layout(parse('X:1\nL:1/4\nK:C\n!trill!F|\n').scores[0] as Score, { systemWidth: 200 })
        .systems[0]?.staves[0]?.elements ?? []
    )
      .flatMap((e) => e.glyphs)
      .find((g) => g.name === 'ornamentTrill')?.y
    expect(y).toBeDefined()
    expect(y).not.toBe(ornament)
  })

  it('gives the three phrase lengths three widths of the same family', () => {
    expect(glyphsOf('!shortphrase!')).toEqual(['breathMarkTick'])
    expect(glyphsOf('!mediumphrase!')).toEqual(['caesuraShort'])
    expect(glyphsOf('!longphrase!')).toEqual(['caesura'])
  })

  it('draws `+` and `plus` as the same left-hand pizzicato mark', () => {
    expect(glyphsOf('!+!')).toEqual(['pluckedLeftHandPizzicato'])
    expect(glyphsOf('!plus!')).toEqual(glyphsOf('!+!'))
  })

  it('puts the arpeggio wiggle LEFT of the notehead', () => {
    const staff = layout(parse('X:1\nL:1/4\nK:C\n!arpeggio![CEG]|\n').scores[0] as Score, {
      systemWidth: 200,
    }).systems[0]?.staves[0]
    const wiggle = (staff?.elements ?? [])
      .flatMap((e) => e.glyphs)
      .find((g) => g.name === 'wiggleArpeggiatoUp')
    const head = (staff?.elements ?? []).flatMap((e) => e.glyphs).find((g) => g.role === 'notehead')
    expect(wiggle).toBeDefined()
    expect(wiggle?.x ?? 0).toBeLessThan(head?.x ?? 0)
  })
})

describe('text metrics', () => {
  // READ OFF THE NOTE'S LEFT EXTENT, not the drawn x of the text.
  //
  // A lyric is centred on its note and reaches half its width back before it, which is
  // abcjs's `addCentered`. At the START of a line that half is the only thing between the
  // note and the cursor, so abcjs's `if (er < extraWidth) x += extraWidth - er` shifts the
  // note right by exactly it and every syllable, narrow or wide, ends up drawn at the same
  // absolute x. These tests used to compare that x and so measured a constant. `left` is
  // the quantity they were always about: does the estimate tell characters apart.
  const leftOf = (text: string) => {
    const staff = layout(parse(`X:1\nL:1/4\nK:C\nC|\nw:${text}\n`).scores[0] as Score, {
      systemWidth: 200,
    }).systems[0]?.staves[0]
    return (staff?.elements ?? []).find((e) => e.type === 'note')?.left ?? 0
  }
  const sizeOf = (text: string) => {
    const staff = layout(parse(`X:1\nL:1/4\nK:C\nC|\nw:${text}\n`).scores[0] as Score, {
      systemWidth: 200,
    }).systems[0]?.staves[0]
    return (staff?.elements ?? []).flatMap((e) => e.texts).find((x) => x.text === text)?.size ?? 1
  }

  it('measures narrow and wide characters differently', () => {
    // The whole point. The flat estimate this replaces measured these the same, with a
    // median error of 24% against real serif metrics over the corpus.
    expect(leftOf('WWWWW')).toBeGreaterThan(leftOf('iiiii'))
  })

  it('treats CJK as full width', () => {
    // A range test, not a table entry — there are tens of thousands of them and they
    // share one advance. The corpus's Chinese-lyric fixture was being measured at half
    // its real width, which was the whole of the residual error after the table landed.
    expect(leftOf('小燕子')).toBeGreaterThan(leftOf('abc'))
  })

  it('falls back for a character the table lacks, rather than measuring zero', () => {
    // A zero-width fallback would centre an unknown string on the wrong point and, worse,
    // look plausible. Cyrillic Zhe is not in the table, so each one should cost exactly
    // the fallback — measured as the difference between one and three of them, halved by
    // the centring. A lyric is set in abcjs's `vocalfont`, so it is the BOLD table's
    // fallback that applies, not the serif one's.
    expect(leftOf('ЖЖЖ') - leftOf('Ж')).toBeCloseTo(CHAR_ADVANCE_BOLD_FALLBACK * sizeOf('Ж'), 4)
  })
})

describe('%%score / %%staves staff grouping', () => {
  const stavesFor = (abc: string) =>
    layout(parse(abc).scores[0] as Score, { systemWidth: 300 }).systems[0]?.staves.length ?? 0

  const THREE_VOICES = (directive: string) =>
    `X:1\nM:4/4\nL:1/4\n${directive}\nV:1\nV:2\nV:3\nK:C\nV:1\nCDEF|\nV:2\nGABc|\nV:3\nEFGA|\n`

  it('takes the voice ORDER from the directive', () => {
    // This much works: grouping punctuation is stripped and the bare words reorder the
    // voices. It is the sharing the punctuation encodes that is not implemented.
    const score = parse(THREE_VOICES('%%score 3 1 2')).scores[0] as Score
    expect(score.voices.map((v) => v.id)).toEqual(['3', '1', '2'])
  })

  it('shares one staff for `( )`, as abcjs and abcMusicKit v1 do', () => {
    // `%%score {1 (2 3)}` means voices 2 and 3 print on ONE staff, so three voices become
    // two staves. This was a recorded gap until 2026-07-20: the layout was
    // one-staff-per-voice from `plans` through `voiceAnchors` to `systems`, and a piano
    // rag rendered on five staves where abcjs uses two.
    //
    // The rule is one line of abcjs's `abc_parse_directive.js`, which abcMusicKit v1
    // ports with citations: a voice opens a new staff unless it is inside `( … )` and not
    // the first one there. abcjs and v1 therefore agree, so one implementation serves all
    // three modes and there is no split to make.
    expect(stavesFor(THREE_VOICES('%%score {1 (2 3)}'))).toBe(2)
    expect(stavesFor(THREE_VOICES('%%score {(1 2) 3}'))).toBe(2)
    expect(stavesFor(THREE_VOICES('%%score (1 2 3)'))).toBe(1)
  })

  it('keeps the voices distinguishable on a shared staff', () => {
    // A staff is not a voice. The flat element list interleaves them for drawing, but
    // `voices` keeps the split — needed for stem-direction convention, and by any gate
    // comparing ONE voice against a reference. The structural gate read `staves[0].elements`
    // and silently started comparing abcjs's voice 0 against ours plus everyone else's.
    const staff = layout(parse(THREE_VOICES('%%score (1 2 3)')).scores[0] as Score, {
      systemWidth: 300,
    }).systems[0]?.staves[0]
    expect(staff?.voices).toHaveLength(3)
    expect(staff?.elements.length).toBe((staff?.voices ?? []).reduce((n, v) => n + v.length, 0))
  })

  it('is already right where the directive asks for no sharing', () => {
    expect(stavesFor(THREE_VOICES('%%score 1 2 3'))).toBe(3)
    expect(stavesFor(THREE_VOICES('%%score {1 2 3}'))).toBe(3)
  })
})

describe('stem direction on a shared staff', () => {
  const stemsPerVoice = (abc: string) => {
    const staff = layout(parse(abc).scores[0] as Score, { systemWidth: 300 }).systems[0]?.staves[0]
    return (staff?.voices ?? []).map((v) =>
      v
        .flatMap((e) => e.lines)
        .filter((l) => l.role === 'stem')
        .map((l) => (l.y2 < l.y1 ? 'up' : 'down')),
    )
  }

  const SHARED = 'X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\ncccc|\nV:2\ncccc|\n'

  it('sends the upper voice up and the lower voice down, whatever the pitch', () => {
    // Both voices here are the same note, ABOVE the middle line, so pitch alone gives
    // every stem the same direction — and the parts become unreadable exactly where
    // sharing a staff was supposed to help. abcjs forces them apart; for `(1 2)` on
    // identical notes its voice 0 stem runs up and voice 1's down.
    const [upper, lower] = stemsPerVoice(SHARED)
    expect(upper?.every((d) => d === 'up')).toBe(true)
    expect(lower?.every((d) => d === 'down')).toBe(true)
  })

  it('leaves a staff of ONE voice to decide by pitch', () => {
    // Forcing here would be wrong: a lone voice high on the staff wants a down stem.
    const [only] = stemsPerVoice('X:1\nM:4/4\nL:1/4\nK:C\ncccc|\n')
    expect(only?.every((d) => d === 'down')).toBe(true)
  })

  it('lets a BEAM override the voice convention', () => {
    // A beam cannot join opposed stems, so the group's agreed direction has to win over
    // the per-voice rule. Beamed eighths in the lower voice stay one direction.
    const [, lower] = stemsPerVoice(
      'X:1\nM:4/4\nL:1/8\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\ncccccccc|\nV:2\nCCCCCCCC|\n',
    )
    expect(new Set(lower).size).toBe(1)
  })
})

describe('staff connectors — braces and brackets', () => {
  const systemFor = (directive: string) =>
    layout(
      parse(`X:1\nM:4/4\nL:1/4\n${directive}\nV:1\nV:2\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n`)
        .scores[0] as Score,
      { systemWidth: 300 },
    ).systems[0]

  it('braces a `{ … }` group and brackets a `[ … ]` one', () => {
    // abcjs draws both. Verified by finding the brace's CURVY path in its rendered SVG,
    // present with `{1 2}` and absent without — an element COUNT showed no difference,
    // because the staff lines merely shift right to make room for the brace.
    expect(systemFor('%%score {1 2}')?.connectorGlyphs.map((g) => g.name)).toEqual(['brace'])
    expect(systemFor('%%score [1 2]')?.connectorGlyphs.map((g) => g.name)).toEqual([
      'bracketTop',
      'bracketBottom',
    ])
  })

  it('draws nothing without grouping punctuation', () => {
    expect(systemFor('%%score 1 2')?.connectorGlyphs).toEqual([])
    expect(systemFor('%%score 1 2')?.connectorLines).toEqual([])
  })

  it('stretches the brace to the staves it spans', () => {
    // SMuFL draws the brace as one glyph MEANT to be stretched, which is the one place a
    // glyph is deliberately not drawn at 1:1. A bracket is a rule with serifs instead.
    const brace = systemFor('%%score {1 2}')?.connectorGlyphs[0]
    expect(brace?.scale).toBeGreaterThan(1)
    expect(systemFor('%%score [1 2]')?.connectorLines).toHaveLength(1)
  })

  it('sits left of the staff, outside the music', () => {
    const brace = systemFor('%%score {1 2}')?.connectorGlyphs[0]
    expect(brace?.x ?? 0).toBeLessThan(0)
  })
})

describe('drawing bounds include prose, not just music', () => {
  const doc = (abc: string) => layout(parse(abc).scores[0] as Score, { systemWidth: 20 })

  it('widens for a title longer than the bar it heads', () => {
    // Sizing the system from the music alone CLIPPED the title: a 64-character title on a
    // one-bar tune gave a 13-space viewBox with text reaching well past it, so most of the
    // title was cut off the right edge and the output looked like a rendering bug.
    const long = doc(
      'X:1\nT:A very considerably longer title than the music beneath it needs\nL:1/4\nK:C\nC|\n',
    )
    const short = doc('X:1\nT:A\nL:1/4\nK:C\nC|\n')
    expect(long.width).toBeGreaterThan(short.width)
  })

  it('leaves the width alone when the music is the wider thing', () => {
    // Its own page width rather than the shared 20-space one the title tests use: at 20
    // the music no longer overflows, it COMPRESSES to fit, so the drawing would be
    // exactly 20 wide and the comparison would say nothing about which is wider.
    const wide = layout(
      parse('X:1\nT:A\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|defg|\n').scores[0] as Score,
      { systemWidth: 200 },
    )
    expect(wide.width).toBeGreaterThan(30)
    // And the one-character title is not what set it.
    expect(wide.width).toBeGreaterThan(
      layout(parse('X:1\nT:A\nM:4/4\nL:1/4\nK:C\nC|\n').scores[0] as Score, {
        systemWidth: 200,
      }).width,
    )
  })

  it('fits every text it draws', () => {
    // The general property, rather than the title case that exposed it: nothing the
    // renderer places may fall outside the box it reports.
    for (const abc of [
      'X:1\nT:A very considerably longer title than the music beneath it needs\nL:1/4\nK:C\nC|\n',
      'X:1\nT:T\nL:1/4\nK:C\nC|\nw:enormouslylongsyllable\n',
    ]) {
      const d = doc(abc)
      const right = Math.max(
        0,
        ...d.systems.flatMap((s) =>
          s.staves.flatMap((st) =>
            st.elements.flatMap((e) => e.texts.map((t) => t.x + textWidthOf(t.text, t.size))),
          ),
        ),
      )
      expect(right).toBeLessThanOrEqual(d.width + 0.01)
    }
  })
})

describe('tempo direction advance', () => {
  it('measures the direction text properly, not at half an em per character', () => {
    // This kept the flat estimate after `textWidth` replaced it everywhere else — a stale
    // ponytail that was still RUNNING, not merely still written. A narrow direction like
    // "Illi" was reserving as much room as a wide one, pushing the beat-unit note right.
    const beatNote = (text: string) =>
      (
        layout(parse(`X:1\nQ:"${text}" 1/4=60\nL:1/4\nK:C\nC|\n`).scores[0] as Score, {
          systemWidth: 200,
        }).systems[0]?.staves[0]?.elements ?? []
      )
        .flatMap((e) => e.glyphs)
        .find((g) => g.name === 'noteheadBlack')?.x

    // Same character count, very different real width.
    const narrow = beatNote('lili')
    const wide = beatNote('WMWM')
    expect(narrow).toBeDefined()
    expect(wide).toBeDefined()
    expect(narrow ?? 0).toBeLessThan(wide ?? 0)
  })
})
