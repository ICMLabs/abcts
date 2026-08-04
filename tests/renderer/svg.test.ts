/**
 * SVG emission. Mostly a dumb pass over the layout, so there is little to test — except
 * the one place it takes untrusted input and puts it into markup.
 */
import { describe, expect, it } from 'vitest'
import type { Score } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { layout } from '../../src/renderer/layout.js'
import { toSVG } from '../../src/renderer/svg.js'

const svgFor = (abc: string): string => toSVG(layout(parse(abc).scores[0] as Score))

describe('text escaping', () => {
  // A trust boundary: `Q:`, `T:` and later lyrics carry whatever the ABC file said, and
  // that string is spliced into markup a host will put in a page. Escaping is not a
  // nicety here — an unescaped `<` closes the <text> element and everything after it is
  // live markup in the host's document.
  it('escapes markup characters in a tempo direction', () => {
    const svg = svgFor('X:1\nL:1/4\nQ:"<script>alert(1)</script>"\nK:C\nC|\n')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('escapes ampersands without double-escaping the entities it just wrote', () => {
    const svg = svgFor('X:1\nL:1/4\nQ:"Fast & loose"\nK:C\nC|\n')
    expect(svg).toContain('Fast &amp; loose')
    expect(svg).not.toContain('&amp;amp;')
  })
})

describe('output shape', () => {
  it('is self-contained — no external font or resource reference', () => {
    const svg = svgFor('X:1\nM:4/4\nL:1/4\nQ:"Allegro" 1/4=120\nK:D\n=FGAB|\n')
    // The glyph-source decision in one assertion: musical glyphs are paths, so nothing
    // has to load for the notes to render. @font-face or an <image> here would mean
    // output that degrades to tofu wherever the font is absent.
    expect(svg).not.toContain('@font-face')
    expect(svg).not.toContain('xlink:href')
    // The xmlns URI is a namespace NAME, never fetched, so it is excluded rather than
    // the check being dropped — anything else pointing outward is what matters.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/https?:\/\//)
    expect(svg).toContain('<path')
    // Prose is the deliberate exception, and only in a generic family.
    expect(svg).toContain('font-family="serif"')
  })

  it('puts the whole drawing inside the viewBox', () => {
    // The clipping bug: a bass voice written in treble range sits well above the staff,
    // and a long tune now wraps, so this walks every system. Rect coordinates are
    // SYSTEM-local — each system is wrapped in a translate — so the offset has to be
    // applied before comparing against the document's box.
    const svg = svgFor(`X:1\nM:4/4\nL:1/4\nK:C bass\n${'GABc|GABc|GABc|\n'.repeat(10)}\n`)
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number)
    expect(viewBox).toHaveLength(4)
    const [, minY, , height] = viewBox as number[]

    // Coordinates nest twice: a system translate, then a staff translate inside it.
    const systems = svg.split('<g class="abcts-system"').slice(1)
    expect(systems.length).toBeGreaterThan(1) // it really did wrap
    const offsetOf = (chunk: string) =>
      Number(/^[^>]*transform="translate\(0,(-?[\d.]+)\)"/.exec(chunk)?.[1] ?? 'NaN')

    let checked = 0
    for (const system of systems) {
      const systemY = offsetOf(system)
      expect(Number.isFinite(systemY)).toBe(true)
      for (const staff of system.split('<g class="abcts-staff-group"').slice(1)) {
        const staffY = offsetOf(staff)
        expect(Number.isFinite(staffY)).toBe(true)
        for (const m of staff.matchAll(/<rect[^>]*y="(-?[\d.]+)"[^>]*height="([\d.]+)"/g)) {
          const top = systemY + staffY + Number(m[1])
          const bottom = top + Number(m[2])
          expect(top).toBeGreaterThanOrEqual(minY as number)
          expect(bottom).toBeLessThanOrEqual((minY as number) + (height as number))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('%%jazzchords', () => {
  // `translateChord` + `svg.js:198-211`. The four cases are the four branches: a modifier
  // alone, a bass alone, both, and a chord that is nothing but a modifier.
  const chordsOf = (abc: string) =>
    [...svgFor(abc).matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1])

  it('nests the modifier and the bass as small tspans', () => {
    const texts = chordsOf('X:1\n%%jazzchords\nK:C\n"C7"C "C/B"B "x"A "x/C"G "/E"E|\n')
    expect(texts[0]).toContain('>C<tspan dy="-0.3em" style="font-size:0.7em">7</tspan>')
    // A bass with no modifier before it drops 0.1em, not 0.4em.
    expect(texts[1]).toContain('>C<tspan dy="0.1em" style="font-size:0.7em">/B</tspan>')
    expect(texts[3]).toContain('<tspan dy="0.4em" style="font-size:0.7em">/C</tspan>')
    expect(texts[4]).toContain('<tspan dy="0.1em" style="font-size:0.7em">/E</tspan>')
  })

  it('leaves a chord alone without the directive', () => {
    expect(chordsOf('X:1\nK:C\n"C7"C|\n')[0]).toBe('C7')
  })

  it('reserves a whole line of height per nested tspan', () => {
    // The reason this is geometry and not decoration: the golden generator counts nested
    // tspans as LINES (`dump-svg.js:120-124`), so `"x/C"` measures three lines high and
    // the chord lane grows by two of them — 38.4px, which is what `visual-misc-03` was out
    // by until this landed.
    const heightOf = (abc: string) => layout(parse(abc).scores[0] as Score).height
    const plain = heightOf('X:1\n%%jazzchords\nK:C\n"C"C|\n')
    const stacked = heightOf('X:1\n%%jazzchords\nK:C\n"x/C"C|\n')
    expect(stacked - plain).toBeCloseTo((2 * 16 * 1.2) / 7.75, 3)
  })
})
