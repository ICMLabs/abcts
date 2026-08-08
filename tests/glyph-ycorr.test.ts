/**
 * `getYCorr` — abcjs's per-glyph DRAW-TIME alignment shift, and the gate that found it.
 *
 *     ycorr = glyphs.getYCorr(symbol);
 *     glyphs.printSymbol(x, renderer.calcY(offset + ycorr), symbol, …)
 *
 * (`draw/print-symbol.js:22` and `:33`; the table is `creation/glyphs.js:174-219`.) It is
 * a fix-up for abcjs's own font — its outlines are not all authored against one baseline —
 * and it never enters a RESERVE: `RelativeElement` takes `top`/`bottom` from the
 * uncorrected pitch. So a staff's extent is identical with it and without it, which is
 * precisely why no gate in this repo could see it missing. The pixel table compares
 * NOTEHEADS, whose correction is zero; the harvested table compares the same; the
 * staff-line gate compares a horizontal span.
 *
 * WHAT NAMED IT was the two fermatas. `!fermata!` measured one pitch too high and
 * `!invertedfermata!` one pitch too LOW on the same tune — opposite directions, same
 * magnitude, which no outline difference and no lane error can produce. `getYCorr` returns
 * -1 for `scripts.ufermata` and +1 for `scripts.dfermata`.
 *
 * ONE CONTROL PER GLYPH, one mark per tune, so the decoration cursor never stacks and a
 * difference can only be that glyph's own. Every expected figure is MEASURED off abcjs
 * 6.6.3's own SVG through `Tools/abcjs-debug/dump-svg.js`, as px below the top staff line.
 *
 * FOUR OF THESE WERE DRAWING BRAVURA IN STRICT. `scripts.wedge`, `.shortphrase`,
 * `.mediumphrase` and `.longphrase` sat in `UNMAPPED_ABCJS` under "abcjs glyphs no SMuFL
 * name claims" — a note read as a statement about SMuFL that was a statement about our own
 * map. SMuFL names all four and we already draw all four; the names were never joined up,
 * so strict drew the wrong outline AND missed the correction, up to 11.66px out.
 */
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels } from './pixel-geometry.js'

const EPSILON = 0.05

/**
 * Every glyph we draw as a bare `<path>`, after the clef, in document order.
 *
 * abcjs classes a notehead, a stem and a ledger and leaves everything else unclassed, and
 * these controls are built so that what is left is the clef followed by the glyph under
 * test. Positional rather than named because the marks carry no name of their own —
 * fragile in general, exact for a tune with one decoration in it.
 */
function glyphsAfterClef(abc: string): number[] {
  const doc = absolutePixels(renderAbc('paper', abc, {})[0]?.svg ?? '')
  const top = doc.items.find((i) => i.cls.includes('top-line'))?.y ?? 0
  return doc.items
    .filter((i) => i.tag === 'path' && i.cls === '')
    .slice(1)
    .map((i) => i.y - top)
}

/** `!name!C4|` — one decoration, one note, nothing to stack against. */
const DECORATIONS: readonly (readonly [string, number])[] = [
  ['fermata', -16.52], // scripts.ufermata   -1
  ['invertedfermata', 51.57], // scripts.dfermata   +1
  ['trill', -18.13], // scripts.trill      -2
  ['upbow', -17.53], // scripts.upbow      -2
  ['downbow', -11.82], // scripts.downbow    -2
  ['roll', -11.86], // scripts.roll       -1
  ['wedge', -13.32], // scripts.wedge      -1   (also a wrong outline until now)
  ['shortphrase', -13.59], // scripts.shortphrase -1  (likewise)
  ['mediumphrase', -17.46], // scripts.mediumphrase 0  (likewise)
  ['longphrase', -21.09], // scripts.longphrase -1   (likewise)
  ['turn', -13.54], // 0
  ['mordent', -14.68], // 0
  ['coda', -20.22], // 0
  ['segno', -20.92], // 0
  ['snap', -13.09], // 0
  ['open', -13.44], // 0
  ['thumb', -13.44], // 0
]

describe('abcjs getYCorr', () => {
  for (const [name, expected] of DECORATIONS) {
    it(`draws !${name}! where abcjs draws it`, () => {
      const got = glyphsAfterClef(`X:1\nK:C\n!${name}!C4|\n`)
      expect(got.length, 'one decoration glyph').toBe(1)
      expect(Math.abs((got[0] ?? 0) - expected)).toBeLessThan(EPSILON)
    })
  }

  /**
   * The four FLAG rows, which are the only ones that go both ways and the only one that is
   * three pitch: `u32nd` +1, `d32nd` -1, `u64th` +3, `d64th` -2. A control per stem
   * direction per duration, one note to a bar so nothing beams.
   */
  it('draws a 32nd and 64th flag where abcjs draws it', () => {
    expect(glyphsAfterClef('X:1\nL:1/4\nK:C\nC///|\n')[0] ?? 0).toBeCloseTo(23.85, 1)
    expect(glyphsAfterClef('X:1\nL:1/4\nK:C\nc///|\n')[0] ?? 0).toBeCloseTo(28.0, 1)
    expect(glyphsAfterClef('X:1\nL:1/4\nK:C\nC////|\n')[0] ?? 0).toBeCloseTo(19.89, 1)
    expect(glyphsAfterClef('X:1\nL:1/4\nK:C\nc////|\n')[0] ?? 0).toBeCloseTo(30.0, 1)
  })

  /** Every digit is -2, which is a whole staff space on a time signature. */
  it("draws a time signature's digits where abcjs draws them", () => {
    const got = glyphsAfterClef('X:1\nM:3/4\nL:1/4\nK:C\nCDE|\n')
    expect(got.length, 'two digits').toBe(2)
    expect(Math.abs((got[0] ?? 0) - 8.0)).toBeLessThan(EPSILON)
    expect(Math.abs((got[1] ?? 0) - 23.46)).toBeLessThan(EPSILON)
  })

  /**
   * THE REST ROWS ARE DELIBERATELY ABSENT FROM THE TABLE, and this is the control that
   * says so. `restGlyph` returns abcjs's DRAWN pitch rather than its anchor — `restpitch`
   * 7 and the correction folded into one step — and the augmentation dots hang off that
   * same step. Adding the rows would move both by a pitch; here they are already exact.
   */
  it('leaves a dotted rest and its dot alone', () => {
    const got = glyphsAfterClef('X:1\nL:1/4\nK:C\nz3 z|\n')
    // dot, half rest, quarter rest — abcjs 11.61, 13.16, 14.36.
    const sorted = [...got].sort((a, b) => a - b)
    expect(sorted.length).toBe(3)
    expect(Math.abs((sorted[0] ?? 0) - 11.61)).toBeLessThan(EPSILON)
    expect(Math.abs((sorted[1] ?? 0) - 13.16)).toBeLessThan(EPSILON)
    expect(Math.abs((sorted[2] ?? 0) - 14.36)).toBeLessThan(EPSILON)
  })
})
