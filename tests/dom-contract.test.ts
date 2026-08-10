/**
 * THE SVG DOM CONTRACT — the eighth ranked table, and an axis nothing here could express.
 *
 * `pixel-parity` and the harvested table resolve both SVGs to ABSOLUTE PIXELS and compare
 * positions; they throw the markup away on purpose, because that is how they see past
 * `<rect>`-versus-`<path>` and Bravura-versus-abcjs outlines. The structural gate compares
 * abcjs's LAID-OUT ELEMENTS, which are its internal tree and not its output. So the thing a
 * drop-in replacement is actually judged on — does `querySelector('[data-name="note"]')`
 * find a note, and is it inside the group a host expects — has had no instrument.
 *
 * Corrected into the 2026-08-09 suite audit for exactly this reason: `visual/svg.test.js`
 * and `svg-per-line.test.js` assert the DOM CONTRACT, not the internal tree, and eight
 * cases were nearly written off as unportable.
 *
 * **WHAT IS COMPARED**: every element carrying a `class` or a `data-name`, in document
 * order, with its CONTRACT DEPTH — how many CLASSED-OR-NAMED ancestors it has, so grouping
 * is part of the contract and not just membership.
 *
 * Depth is counted over CONTRACT elements rather than raw nesting because raw nesting would
 * measure POSITIONING: abcjs draws at absolute coordinates and we place each system and
 * staff with a `<g transform>`, so a group that moves things is a level in one engine and
 * not the other. Same class of choice as `<rect>`-versus-`<path>`. What this preserves is
 * what a host actually walks — `closest('.abcjs-note')`, ancestor selectors, and the
 * grouping of parts inside their element.
 * **The tag name is NOT**: a staff line is a `<path>` in abcjs and a `<rect>` here, a
 * drawing choice the pixel gate already proves equivalent, and folding it in would drown
 * the axis this gate exists for.
 *
 * `/tmp/abcts-dom-ranked.txt`. A ratchet, not a ceiling.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'

const dir = join(import.meta.dirname, 'corpus-dom')

interface Row {
  readonly depth: number
  readonly class: string | null
  readonly name: string | null
}

interface Case {
  readonly slug: string
  readonly abc: string
  readonly contract: readonly Row[]
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf-8')) }))

/**
 * Cases whose contract is EXACT. Grows, never shrinks — the same ratchet every other table
 * here keeps.
 */
const PASSING: readonly string[] = [
  'dom-accidentals',
  'dom-beam',
  'dom-chord',
  'dom-clef-change',
  'dom-key-sig',
  'dom-ledger',
  'dom-parts',
  'dom-plain',
  'dom-rest',
  'dom-title-composer',
  'dom-two-voices',
  'svg-12-8-group',
  'svg-single-note',
]

/**
 * The same walk the generator does, over our own markup — by TAG SCAN rather than by DOM,
 * because there is no DOM here and the shape is regular: every element is either
 * self-closing or paired, and depth is the open-tag nesting count.
 */
function contractOf(svg: string): Row[] {
  const rows: Row[] = []
  /** One entry per open element: does it count toward contract depth? */
  const stack: boolean[] = []
  const depth = (): number => stack.filter(Boolean).length
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClose] = m
    if (tag === 'svg' || tag === 'style' || tag === 'title' || tag === 'defs') {
      if (closing === '/' && tag !== 'svg') stack.pop()
      else if (closing === '' && selfClose === '' && tag !== 'svg') stack.push(false)
      continue
    }
    if (closing === '/') {
      stack.pop()
      continue
    }
    const klass = /\sclass="([^"]*)"/.exec(attrs ?? '')?.[1] ?? null
    const name = /\sdata-name="([^"]*)"/.exec(attrs ?? '')?.[1] ?? null
    const counts = klass !== null || name !== null
    if (counts) rows.push({ depth: depth(), class: klass === '' ? null : klass, name })
    if (selfClose === '') stack.push(counts)
  }
  return rows
}

interface Diff {
  readonly matched: number
  readonly where: string
}

const show = (r: Row | undefined): string =>
  r === undefined ? 'nothing' : `d${r.depth} class=${JSON.stringify(r.class)} name=${JSON.stringify(r.name)}`

function firstDifference(got: readonly Row[], want: readonly Row[]): Diff | null {
  for (const [i, w] of want.entries()) {
    const g = got[i]
    if (g === undefined || g.depth !== w.depth || g.class !== w.class || g.name !== w.name) {
      return { matched: i, where: `row ${i}\n      got  ${show(g)}\n      want ${show(w)}` }
    }
  }
  if (got.length > want.length) {
    return { matched: want.length, where: `${got.length} rows, want ${want.length}: extra ${show(got[want.length])}` }
  }
  return null
}

function run(c: Case): Diff | null {
  return firstDifference(contractOf(renderAbc('paper', c.abc, { add_classes: true })[0]?.svg ?? ''), c.contract)
}

describe('the SVG DOM contract vs abcjs', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      return { slug: c.slug, diff, n: c.contract.length }
    })
    const off = rows.filter((r) => r.diff !== null)
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      '',
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map((r) => `  ${r.slug.padEnd(22)} ${String(r.diff?.matched).padStart(3)}/${r.n} ok  ${r.diff?.where}`),
    ].join('\n')
    writeFileSync('/tmp/abcts-dom-ranked.txt', `${text}\n`)
    expect(rows.length).toBe(CASES.length)
  })

  for (const slug of PASSING) {
    it(`is exact — ${slug}`, () => {
      const c = CASES.find((x) => x.slug === slug)
      if (c === undefined) throw new Error(`no such case ${slug}`)
      expect(run(c)?.where ?? null).toBeNull()
    })
  }
})
