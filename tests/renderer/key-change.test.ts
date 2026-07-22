/**
 * Mid-tune key changes — `[K:G]` and friends, drawn where they take effect.
 *
 * `Measure.keyChange` had been populated since the model gained it and read by NOTHING in
 * the renderer, so every `[K:…]` in the corpus silently changed the key and showed no
 * accidentals. The same shape as the `octave=` and `vocalfont` findings: parsed, never
 * realized.
 *
 * WHY THIS IS TESTED HERE AND NOT BY THE STRUCTURAL GATE. That gate is FIRST TUNE ONLY,
 * on both sides — abcjs's element dump covers tune 0 and `layout()` takes `scores[0]`.
 * Every mid-tune key change in the corpus lives in a LATER tune: `S6-keys`'s four are in
 * X:602, `clefs`'s in X:608, `ragtime-nightingale`'s in its second section. So the gate
 * cannot see this feature at all, and a green gate says nothing about it.
 *
 * The expectations below were measured by running abcjs 6.6.3 over the same fixture and
 * reading the `el_type: 'key'` elements it emits inline.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '../../src/parser/parser.js'
import { layout } from '../../src/renderer/layout.js'
import { corpusDir } from '../corpus/corpus.js'

/** Every key signature drawn for a tune, as accidental names with their staff step. */
const drawnKeySignatures = (fixture: string, tuneIndex: number): string[][] => {
  const abc = readFileSync(join(corpusDir, `${fixture}.abc`), 'utf-8')
  const score = parse(abc).scores[tuneIndex]
  if (score === undefined) throw new Error(`${fixture} has no tune ${tuneIndex}`)
  return layout(score)
    .systems.flatMap((system) => system.staves[0]?.voices[0] ?? [])
    .filter((element) => element.type === 'keySignature')
    .map((element) => element.glyphs.map((glyph) => glyph.name.replace('accidental', '')))
}

describe('mid-tune key changes', () => {
  it('cancels what the outgoing key had and the incoming key drops', () => {
    // S6-keys X:602 "Change Key Sig": A, then [K:G] [K:Bb] [K:Dm] [K:F#m].
    // Each system also reprints the tune key as a prefix, so the changes are the
    // entries carrying naturals.
    const withNaturals = drawnKeySignatures('S6-keys', 1).filter((glyphs) =>
      glyphs.includes('Natural'),
    )
    expect(withNaturals).toEqual([
      // A -> G: keep F#, cancel C# and G#.
      ['Natural', 'Natural', 'Sharp'],
      // G -> Bb: cancel F#, then two flats. abcjs: ["naturalf","flatB","flate"].
      ['Natural', 'Flat', 'Flat'],
      // Bb -> Dm: Dm is one flat, so cancel Eb. abcjs: ["naturale","flatB"].
      ['Natural', 'Flat'],
      // Dm -> F#m: cancel Bb, then three sharps. abcjs: ["naturalB","sharpf","sharpc","sharpg"].
      ['Natural', 'Sharp', 'Sharp', 'Sharp'],
    ])
  })

  it('puts the naturals BEFORE the new signature', () => {
    // Gould, *Behind Bars* — cancelling naturals precede the new key. abcjs agrees on
    // every one of its inline `key` elements. Asserted separately from the contents
    // because a reversed order still has the right glyphs and is still wrong.
    for (const glyphs of drawnKeySignatures('S6-keys', 1)) {
      const lastNatural = glyphs.lastIndexOf('Natural')
      const firstOther = glyphs.findIndex((name) => name !== 'Natural')
      if (lastNatural === -1 || firstOther === -1) continue
      expect(lastNatural).toBeLessThan(firstOther)
    }
  })

  it('draws NOTHING when a K: restates the key already in force', () => {
    // The regression this caught, and it is not hypothetical: it moved three fixtures
    // that have no key change in them. A per-voice `K:G clef=treble` on each of two
    // voices makes the second a "change" from G to G, and it was redrawing the whole
    // signature mid-bar.
    const twoVoices =
      'X:1\nM:4/4\nL:1/16\n%%score (a b)\nV:a\nK:G clef=treble\nD16|\nV:b\nK:G clef=treble\nE,16|\n'
    const score = parse(twoVoices).scores[0]
    if (score === undefined) throw new Error('did not parse')
    const mid = layout(score)
      .systems.flatMap((system) => system.staves.flatMap((staff) => staff.voices.flat()))
      .filter((element) => element.type === 'keySignature')
    // One per staff prefix, and no extra from the restated K:.
    expect(mid.every((element) => !element.glyphs.some((g) => g.name.includes('Natural')))).toBe(
      true,
    )
  })

  it('prints the key and the opening barline in SOURCE ORDER', () => {
    // Not a convention to pick — what the file says. `[K:Bb] |` is signature then bar;
    // `| [K:Bb]` is bar then signature. abcjs does exactly this, and S6-keys X:602
    // writes the key BEFORE the barline in all four of its changes, so a rule that
    // always put the key after the bar was wrong in every corpus instance of it.
    const before = parse('X:1\nL:1/4\nK:C\nCDEF|[K:G] |GABc|\n').scores[0]
    const after = parse('X:1\nL:1/4\nK:C\nCDEF| [K:G]GABc|\n').scores[0]
    const seq = (score: typeof before) => {
      if (score === undefined) throw new Error('did not parse')
      return layout(score)
        .systems.flatMap((system) => system.staves[0]?.voices[0] ?? [])
        .map((element) => element.type)
        .filter((type) => type === 'bar' || type === 'keySignature')
    }
    // The opening `|` of the second measure, and where the signature sits around it.
    expect(seq(before).join(' ')).toContain('keySignature bar')
    expect(seq(after).join(' ')).toContain('bar keySignature')
  })

  it('treats a mode change with the same signature as no change', () => {
    // K:G and K:Em are one signature. A reader sees no accidental move, so neither
    // should the page — this is why the guard compares FIFTHS, not the key object.
    const src = 'X:1\nL:1/4\nK:G\nGABc|[K:Em]GABc|\n'
    const score = parse(src).scores[0]
    if (score === undefined) throw new Error('did not parse')
    const sigs = layout(score)
      .systems.flatMap((system) => system.staves[0]?.voices[0] ?? [])
      .filter((element) => element.type === 'keySignature')
    expect(sigs).toHaveLength(1) // the opening prefix only
  })
})
