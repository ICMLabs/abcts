/**
 * The SMuFL ↔ abcjs glyph bridge, and the coverage it does not have.
 *
 * A mapping is exactly the kind of table that rots silently: a typo on either side draws
 * nothing, and nothing draws no error. So both directions are asserted — every name we
 * map must exist in abcjs's table, every name we claim as ours must exist in Bravura's,
 * and the two "unmapped" lists must together account for every glyph in both tables.
 *
 * The last one is the point. An unmapped glyph is a PARITY GAP, not a housekeeping
 * detail, and the only way it stays visible is if adding a glyph to either table breaks
 * this file until someone decides which list it belongs in.
 */
import { describe, expect, it } from 'vitest'
import { SMUFL_TO_ABCJS, UNMAPPED_ABCJS } from '../src/renderer/glyph-map.js'
import { GLYPHS } from '../src/renderer/glyphs.js'
import { ABCJS_GLYPHS } from '../src/renderer/glyphs-abcjs.js'

/**
 * SMuFL glyphs abcts draws that abcjs has no equivalent for, so the parity build must
 * fall back to Bravura or draw nothing.
 *
 * Grouped by WHY, because the reasons differ and only one of them is a gap worth closing.
 */
const UNMAPPED_SMUFL_REASONS: Readonly<Record<string, string>> = {
  // 1. abcjs draws NOTHING here, and strict already reproduces the blank.
  accidentalThreeQuarterTonesSharpStein: 'abcjs has no three-quarter-tone glyph',
  accidentalThreeQuarterTonesFlatZimmermann: 'abcjs has no three-quarter-tone glyph',

  // 2. abcjs COMPOSES from letter glyphs — `pp` is the `p` glyph twice — so no single
  //    entry corresponds. Mapping one letter would draw the wrong dynamic.
  dynamicPiano: 'abcjs composes dynamics from letter glyphs',
  dynamicMezzo: 'abcjs composes dynamics from letter glyphs',
  dynamicForte: 'abcjs composes dynamics from letter glyphs',
  dynamicPP: 'abcjs composes dynamics from letter glyphs',
  dynamicPPP: 'abcjs composes dynamics from letter glyphs',
  dynamicPPPP: 'abcjs composes dynamics from letter glyphs',
  dynamicMP: 'abcjs composes dynamics from letter glyphs',
  dynamicMF: 'abcjs composes dynamics from letter glyphs',
  dynamicFF: 'abcjs composes dynamics from letter glyphs',
  dynamicFFF: 'abcjs composes dynamics from letter glyphs',
  dynamicFFFF: 'abcjs composes dynamics from letter glyphs',
  dynamicSforzando1: 'abcjs composes dynamics from letter glyphs',

  // 3. abcjs draws it as constructed geometry in the engraver, not as a glyph.
  brace: 'abcjs constructs braces as paths, not glyphs',
  bracketTop: 'abcjs constructs brackets as paths, not glyphs',
  bracketBottom: 'abcjs constructs brackets as paths, not glyphs',
  repeatDots: 'abcjs draws repeat dots as geometry',

  // 4. Genuinely beyond abcjs — extended-mode glyphs it never had. These are the ones
  //    that are a FEATURE, not a gap: they only appear where abcts exceeds abcjs.
  noteheadDiamondBlack: 'extended: styled noteheads abcjs lacks',
  noteheadDiamondWhite: 'extended: styled noteheads abcjs lacks',
  noteheadTriangleUpBlack: 'extended: styled noteheads abcjs lacks',
  noteheadTriangleUpWhite: 'extended: styled noteheads abcjs lacks',
  articStaccatissimoAbove: 'extended: abcjs has no staccatissimo',
  articStaccatissimoBelow: 'extended: abcjs has no staccatissimo',
  ornamentTremblement: 'extended: abcjs has no tremblement',
  ornamentTurnInverted: 'extended: abcjs has no inverted turn',
  ornamentTurnSlash: 'extended: abcjs has no slashed turn',
  brassLiftShort: 'extended: abcjs has no lift',
  breathMarkTick: 'extended: abcjs has only the comma',
  caesura: 'extended: abcjs has no caesura',
  caesuraShort: 'extended: abcjs has no caesura',
  pluckedLeftHandPizzicato: 'extended: abcjs has no left-hand pizzicato',
  tremolo1: 'extended: abcjs has no tremolo glyphs',
  tremolo2: 'extended: abcjs has no tremolo glyphs',
  tremolo3: 'extended: abcjs has no tremolo glyphs',
  tremolo4: 'extended: abcjs has no tremolo glyphs',
  fingering0: 'extended: abcjs reuses its numerals',
  fingering1: 'extended: abcjs reuses its numerals',
  fingering2: 'extended: abcjs reuses its numerals',
  fingering3: 'extended: abcjs reuses its numerals',
  fingering4: 'extended: abcjs reuses its numerals',
  fingering5: 'extended: abcjs reuses its numerals',
}

/** Bravura table keys that are engraving constants, not glyphs. */
const isGlyph = (name: string): boolean => {
  const entry = (GLYPHS as Record<string, unknown>)[name]
  return typeof entry === 'object' && entry !== null && 'path' in entry
}

describe('the SMuFL ↔ abcjs glyph bridge', () => {
  it('maps only names abcjs actually has', () => {
    // A typo here draws nothing, and nothing draws no error — which is why this is
    // asserted rather than trusted.
    const missing = Object.entries(SMUFL_TO_ABCJS)
      .filter(([, abcjsName]) => ABCJS_GLYPHS[abcjsName] === undefined)
      .map(([smufl, abcjsName]) => `${smufl} -> ${abcjsName}`)
    expect(missing).toEqual([])
  })

  it('maps only names Bravura actually has', () => {
    const missing = Object.keys(SMUFL_TO_ABCJS).filter((name) => !isGlyph(name))
    expect(missing).toEqual([])
  })

  it('accounts for every abcjs glyph — mapped or explicitly not', () => {
    const claimed = new Set<string>([...Object.values(SMUFL_TO_ABCJS), ...UNMAPPED_ABCJS])
    const unaccounted = Object.keys(ABCJS_GLYPHS).filter((name) => !claimed.has(name))
    expect(unaccounted, 'abcjs glyphs neither mapped nor listed as unmapped').toEqual([])
  })

  it('accounts for every Bravura glyph — mapped or explicitly not, WITH A REASON', () => {
    // The one that keeps the parity gap visible. Add a glyph to `glyphs.ts` and this
    // fails until someone says whether abcjs has it, which is the decision that would
    // otherwise be discovered as a blank on a page months later.
    const unaccounted = Object.keys(GLYPHS)
      .filter(isGlyph)
      .filter((name) => SMUFL_TO_ABCJS[name] === undefined)
      .filter((name) => UNMAPPED_SMUFL_REASONS[name] === undefined)
    expect(unaccounted, 'Bravura glyphs with no mapping and no recorded reason').toEqual([])
  })

  it('collapses Above/Below pairs onto one abcjs glyph where abcjs has one', () => {
    // Not an accident of the table — abcjs orients a single `scripts.staccato` by where
    // it puts it, where SMuFL ships two glyphs. Asserted so it reads as intent.
    expect(SMUFL_TO_ABCJS['articStaccatoAbove']).toBe(SMUFL_TO_ABCJS['articStaccatoBelow'])
    expect(SMUFL_TO_ABCJS['articTenutoAbove']).toBe(SMUFL_TO_ABCJS['articTenutoBelow'])
    // Marcato is the exception: abcjs DOES ship both orientations.
    expect(SMUFL_TO_ABCJS['articMarcatoAbove']).not.toBe(SMUFL_TO_ABCJS['articMarcatoBelow'])
  })

  it('covers the glyphs the corpus actually leans on', () => {
    // A mapping can be internally consistent and still miss the common case. These are
    // the shapes almost every fixture draws.
    for (const name of [
      'noteheadBlack',
      'noteheadHalf',
      'noteheadWhole',
      'gClef',
      'fClef',
      'accidentalSharp',
      'accidentalFlat',
      'accidentalNatural',
      'restQuarter',
      'flag8thDown',
      'augmentationDot',
      'timeSig4',
    ]) {
      expect(SMUFL_TO_ABCJS[name], `${name} is unmapped`).toBeDefined()
    }
  })
})
