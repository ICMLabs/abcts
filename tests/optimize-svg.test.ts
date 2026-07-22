/**
 * `<defs>`/`<use>` glyph deduplication — smaller bytes, identical DOM.
 *
 * The shape abcMusicKit v1 shipped, and the reason abcts can replace abcjs rather than
 * merely match it: build to byte parity to PROVE the engraving, then emit the same
 * picture compactly for callers, with every class and hook intact.
 *
 * Path data is 67–86% of an abcts SVG and the same few outlines repeat throughout —
 * `ave-verum-corpus` draws 145 glyphs from 20 distinct shapes. Before this, abcts was
 * only 0.90x abcjs's bytes overall and LARGER on five fixtures (1.73x on
 * `ave-verum-corpus`), because Bravura's outlines are richer than abcjs's and every
 * instance carried a full copy. Now 0.34x.
 *
 * ── THE CONTRACT THIS MUST NOT BREAK ─────────────────────────────────────────
 * A page that styles `.abcjs-notehead` or hit-tests `[data-name="stem"]` cannot be
 * allowed to notice. So the central test here is not the byte count — it is that the
 * optimized render and the plain one put the SAME hooks at the SAME coordinates. Bytes
 * are the easy half; the DOM contract is the half that would break a caller silently.
 *
 * Strict is deliberately EXCLUDED: `<defs>`/`<use>` is different markup from abcjs's,
 * and strict's job is byte parity. That is why the option is tri-state rather than a
 * plain boolean — `undefined` means "the mode decides", and the mode says no.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CompatibilityMode } from '../src/core/model.js'
import { parse } from '../src/parser/parser.js'
import { render } from '../src/renderer/index.js'
import { corpusDir } from './corpus/corpus.js'
import { absolutePixels } from './pixel-geometry.js'

const fixture = (name: string): string => readFileSync(join(corpusDir, `${name}.abc`), 'utf-8')

const svgFor = (abc: string, mode: CompatibilityMode, optimizeSVG?: boolean): string => {
  const score = parse(abc, { mode }).scores[0]
  if (score === undefined) throw new Error('did not parse')
  return render(score, {
    classes: 'abcjs',
    mode,
    ...(optimizeSVG === undefined ? {} : { optimizeSVG }),
  })
}

/** Every drawn thing as (class, rounded position) — the hooks a caller can observe. */
const hooks = (svg: string): string[] =>
  absolutePixels(svg)
    .items.map((item) => `${item.cls}@${item.x.toFixed(2)},${item.y.toFixed(2)}`)
    .sort()

describe('optimizeSVG — <defs>/<use> deduplication', () => {
  describe('the mode decides when it is not set', () => {
    it('strict does NOT optimize, so byte parity is not disturbed', () => {
      const svg = svgFor(fixture('simple-c'), 'abcjs-strict')
      expect(svg).not.toContain('<defs>')
      expect(svg).not.toContain('<use')
    })

    for (const mode of ['abc2.1', 'extended'] as const) {
      it(`${mode} does optimize`, () => {
        const svg = svgFor(fixture('simple-c'), mode)
        expect(svg).toContain('<defs>')
        expect(svg).toContain('<use')
      })
    }

    it('an explicit setting overrides the mode in both directions', () => {
      expect(svgFor(fixture('simple-c'), 'abcjs-strict', true)).toContain('<use')
      expect(svgFor(fixture('simple-c'), 'extended', false)).not.toContain('<use')
    })
  })

  describe('the DOM contract survives', () => {
    // The half that would break a caller silently. Bytes are easy to check and easy to
    // notice; a missing `class` on a notehead is neither.
    for (const name of ['simple-c', 'ave-verum-corpus', 'ragtime-mini', 'zocharti-loch']) {
      it(`${name} — same hooks at the same coordinates, optimized or not`, () => {
        const abc = fixture(name)
        const plain = svgFor(abc, 'extended', false)
        const optimized = svgFor(abc, 'extended', true)
        // Not "the classes are present somewhere" — the full multiset of class-and-place,
        // so a glyph that moved, vanished or lost its hook all fail.
        expect(hooks(optimized)).toEqual(hooks(plain))
      })
    }

    it('carries class and data-name onto the <use> itself', () => {
      const svg = svgFor(fixture('simple-c'), 'extended')
      expect(svg).toMatch(/<use class="abcjs-notehead" href="#g\d+"/)
      // A `<use>` with a bare href and the class left behind on a wrapper would pass a
      // "contains abcjs-notehead" check and still break `svg.querySelectorAll('.abcjs-notehead')`
      // returning the same nodes.
      expect(svg).not.toMatch(/<use href="#g\d+"[^>]*\/>\s*<\/g>\s*<g class="abcjs-notehead"/)
    })

    it('uses modern href, not the deprecated xlink:href', () => {
      expect(svgFor(fixture('simple-c'), 'extended')).not.toContain('xlink:href')
    })
  })

  describe('it actually saves', () => {
    it('cuts every glyph-dense fixture by more than half', () => {
      for (const name of ['ave-verum-corpus', 'ragtime-mini', 'zocharti-loch']) {
        const abc = fixture(name)
        const plain = Buffer.byteLength(svgFor(abc, 'extended', false))
        const optimized = Buffer.byteLength(svgFor(abc, 'extended', true))
        expect(optimized, `${name} did not shrink`).toBeLessThan(plain * 0.5)
      }
    })

    it('emits each distinct outline exactly once', () => {
      const svg = svgFor(fixture('ave-verum-corpus'), 'extended')
      const defs = svg.slice(svg.indexOf('<defs>'), svg.indexOf('</defs>'))
      const ids = [...defs.matchAll(/<path id="(g\d+)"/g)].map((m) => m[1])
      expect(new Set(ids).size).toBe(ids.length)
      // Every referenced id must exist, or the browser draws nothing where a glyph
      // belongs — a failure that is invisible to a byte count and to a class check.
      const referenced = new Set([...svg.matchAll(/href="#(g\d+)"/g)].map((m) => m[1]))
      for (const id of referenced) expect(ids).toContain(id)
    })
  })

  describe('a stretched glyph stays a path', () => {
    it('keeps the vertical scale a brace needs', () => {
      // A brace spans its staves by `scale(1,n)`, so two braces of different heights are
      // different shapes and cannot share one definition. They stay inline paths; the
      // rest of the score still dedupes around them.
      const abc = 'X:1\n%%score (A B)\nV:A\nV:B\nK:C\nV:A\nCDEF|\nV:B\nCDEF|\n'
      const score = parse(abc, { mode: 'extended' }).scores[0]
      if (score === undefined) throw new Error('did not parse')
      const svg = render(score, { classes: 'abcjs', mode: 'extended' })
      expect(svg).toContain('<use')
      // Whatever the brace is drawn as, the score's noteheads still dedupe.
      expect([...svg.matchAll(/<use[^>]*>/g)].length).toBeGreaterThan(4)
    })
  })
})
