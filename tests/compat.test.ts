/**
 * The compat surface: what an existing abcjs page depends on.
 *
 * The bar here is VISUAL EQUIVALENCE plus the same DOM, not byte-identical SVG — see
 * `src/compat/index.ts`. So these assert the things a page actually breaks on: the call
 * signature, the CSS classes, the `data-name` hooks, the engraving density, and the
 * element's width in the page. Not the bytes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { corpusDir, goldensDir } from './corpus/corpus.js'

const fixture = (name: string) => readFileSync(join(corpusDir, `${name}.abc`), 'utf-8')
const golden = (name: string) => readFileSync(join(goldensDir, `${name}.svg`), 'utf-8')
const classesIn = (svg: string) =>
  new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(' ')))

describe('renderAbc', () => {
  it("takes abcjs's signature and returns one object per tune", () => {
    // `clefs` is eight tunes. abcjs returns an array; a caller indexing [0] must work.
    const tunes = renderAbc(null, fixture('clefs'), { staffwidth: 740 })
    expect(tunes).toHaveLength(8)
    expect(tunes[0]?.metaText.title).toBe('Treble clef')
    expect(tunes[0]?.svg).toContain('<svg')
  })

  it('injects into a DOM target when there is one', () => {
    // No document in Node, so a target object stands in for the element abcjs would fill.
    const element = { innerHTML: '' }
    renderAbc(element, fixture('simple-c'))
    expect(element.innerHTML).toContain('<svg')
  })

  it('renders without a target, for Node', () => {
    expect(() => renderAbc(null, fixture('simple-c'))).not.toThrow()
  })

  it("emits abcjs's class names, and none of core's", () => {
    // The reason to use this entry point: a stylesheet written against abcjs keeps working.
    const ours = classesIn(renderAbc(null, fixture('simple-c'))[0]?.svg ?? '')
    const theirs = classesIn(golden('simple-c'))
    for (const cls of ['abcjs-notehead', 'abcjs-stem', 'abcjs-ledger', 'abcjs-top-line']) {
      expect(theirs.has(cls), `golden should have ${cls}`).toBe(true)
      expect(ours.has(cls), `compat should emit ${cls}`).toBe(true)
    }
    for (const cls of ours) expect(cls.startsWith('abcjs-')).toBe(true)
  })

  it('emits the data-name hooks interaction code keys on', () => {
    const svg = renderAbc(null, fixture('simple-c'))[0]?.svg ?? ''
    const names = new Set([...svg.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]))
    for (const name of ['note', 'bar', 'stem', 'ledger', 'staff-extra clef']) {
      expect(names.has(name), `missing data-name="${name}"`).toBe(true)
    }
  })

  it("matches abcjs's engraving density, so the page does not shift", () => {
    // abcjs spaces a quarter note at sqrt(0.25*8)*30 = 42.43 PIXELS.
    //
    // Our coordinates are staff spaces inside a viewBox — resolution-independent where
    // abcjs writes absolute pixels — so the internal numbers differ by design and only
    // the PAINTED size is comparable. Multiply through the viewBox scale, which is what
    // the browser does.
    const svg = renderAbc(null, fixture('simple-c'), { staffwidth: 740 })[0]?.svg ?? ''
    const width = Number(/width="([\d.]+)"/.exec(svg)?.[1])
    const viewWidth = Number(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/.exec(svg)?.[1])
    const toPx = width / viewWidth

    const xs = [...svg.matchAll(/class="abcjs-notehead"[^>]*translate\(([\d.]+)/g)].map((m) =>
      Number(m[1]),
    )
    expect(xs.length).toBeGreaterThan(3)
    expect(((xs[1] ?? 0) - (xs[0] ?? 0)) * toPx).toBeCloseTo(42.43, 1)
  })

  it('pads to the requested page width, as abcjs does', () => {
    // abcjs's simple-c is 700px wide with the staff ending at 422 — it pads. A page that
    // swapped a 700px element for a content-width one would reflow.
    const svg = renderAbc(null, fixture('clefs'), { staffwidth: 740 })[0]?.svg ?? ''
    expect(/width="([\d.]+)"/.exec(svg)?.[1]).toBe('740')
  })

  it('parses in strict mode, reproducing abcjs rather than correcting it', () => {
    // `+:` is a continuation in ABC 2.1 and NOT implemented by abcjs, which parses the
    // line as music. A compat layer must do what abcjs does, oddities included.
    const abc = 'X:1\nL:1/4\nT:T\n+:more CDEF\nK:C\nGABc|\n'
    const notes = renderAbc(null, abc)[0]?.score.voices[0]?.measures.flatMap((m) => m.events) ?? []
    expect(notes.length).toBeGreaterThan(4)
  })
})
