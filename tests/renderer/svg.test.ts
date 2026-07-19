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
    const svg = svgFor(`X:1\nM:4/4\nL:1/4\nK:C bass\n${'GABc|'.repeat(30)}\n`)
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number)
    expect(viewBox).toHaveLength(4)
    const [, minY, , height] = viewBox as number[]

    const groups = svg.split('<g class="abcts-system"').slice(1)
    expect(groups.length).toBeGreaterThan(1) // it really did wrap
    let checked = 0
    for (const group of groups) {
      const originY = Number(/transform="translate\(0,(-?[\d.]+)\)"/.exec(group)?.[1] ?? 'NaN')
      expect(Number.isFinite(originY)).toBe(true)
      for (const m of group.matchAll(/<rect[^>]*y="(-?[\d.]+)"[^>]*height="([\d.]+)"/g)) {
        const top = originY + Number(m[1])
        const bottom = top + Number(m[2])
        expect(top).toBeGreaterThanOrEqual(minY as number)
        expect(bottom).toBeLessThanOrEqual((minY as number) + (height as number))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
