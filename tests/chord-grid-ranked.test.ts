/**
 * THE CHORD-GRID RANKED TABLE — the fifth of its kind, and the instrument this arc steers by.
 *
 * Same shape as the audio and MIDI-file tables: it names, per case, the FIRST place the grid
 * differs, because a structure diverges at one point and everything after it is displacement
 * rather than information. Sorted by how far in the divergence is, so the cases that are
 * nearly right sit at the bottom.
 *
 * `/tmp/abcts-chord-grid-ranked.txt`, beside the other four.
 *
 * A ratchet, not a ceiling: `PASSING` lists the cases that must stay exact, and it grows.
 * No tolerance — a chord cell is right or it is not.
 *
 * **THE TWO REFUSALS ARE CASES, NOT GAPS.** `waltz` (3/4) and `no-chords` assert that abcjs
 * produces NO grid at all. A implementation that always returns something passes twenty-one
 * of these and fails those two, which is exactly the point of keeping them.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type ChartLine, chordGrid } from '../src/chord-grid.js'
import { parse } from '../src/parser/parser.js'

const dir = join(import.meta.dirname, 'corpus-chord-grid')

interface Case {
  readonly slug: string
  readonly name: string
  readonly abc: string
  /** `null` is abcjs's answer for a tune it refuses to grid, not a missing expectation. */
  readonly expected: ChartLine[] | null
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({
    slug: f.replace(/\.json$/, ''),
    ...JSON.parse(readFileSync(join(dir, f), 'utf-8')),
  }))

/** Every case, including the two REFUSALS — `waltz` (3/4) and `no-chords`. */
const PASSING: readonly string[] = [
  'ace',
  'after',
  'aint',
  'all',
  'and',
  'auld',
  'basin',
  'bill',
  'bye',
  'deed',
  'douce',
  'doy',
  'east',
  'fidgety',
  'i-wish',
  'ive',
  'minnie',
  'no-chords',
  'royal',
  'sugar',
  'under',
  'waltz',
  'you',
]

interface Diff {
  /** How many measure cells matched before the first divergence — bigger is closer. */
  readonly matched: number
  readonly where: string
}

/**
 * abcjs's own JSON omits an absent flag rather than writing `undefined`, and so does ours,
 * so a plain `JSON.stringify` comparison is the contract. Keys are written in the order the
 * algorithm sets them in both engines, but nothing promises that — sorted.
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  )

/** The first difference, walking the structure in abcjs's own order. */
function firstDifference(got: ChartLine[] | null, want: ChartLine[] | null): Diff | null {
  if (want === null) {
    return got === null ? null : { matched: 0, where: `expected NO grid, got ${got.length} sections` }
  }
  if (got === null) return { matched: 0, where: `expected ${want.length} sections, got NO grid` }
  if (got.length !== want.length) {
    return {
      matched: 0,
      where: `${got.length} sections vs ${want.length}: got ${got.map((s) => s.type).join(',')} want ${want.map((s) => s.type).join(',')}`,
    }
  }
  let matched = 0
  for (const [s, wantSection] of want.entries()) {
    const gotSection = got[s] as ChartLine
    if (gotSection.type !== wantSection.type) {
      return { matched, where: `sec ${s} type ${gotSection.type} vs ${wantSection.type}` }
    }
    if (wantSection.type !== 'part') {
      if (canonical(gotSection) !== canonical(wantSection)) {
        return { matched, where: `sec ${s}\n      got  ${canonical(gotSection)}\n      want ${canonical(wantSection)}` }
      }
      continue
    }
    const gotPart = gotSection as Extract<ChartLine, { type: 'part' }>
    if (gotPart.name !== wantSection.name) {
      return { matched, where: `sec ${s} part name "${gotPart.name}" vs "${wantSection.name}"` }
    }
    if (gotPart.lines.length !== wantSection.lines.length) {
      return {
        matched,
        where: `sec ${s} "${wantSection.name}" has ${gotPart.lines.length} lines, want ${wantSection.lines.length} (${wantSection.lines.map((l) => l.length).join('+')})`,
      }
    }
    for (const [l, wantLine] of wantSection.lines.entries()) {
      const gotLine = gotPart.lines[l] ?? []
      if (gotLine.length !== wantLine.length) {
        return {
          matched,
          where: `sec ${s} "${wantSection.name}" line ${l} has ${gotLine.length} measures, want ${wantLine.length}`,
        }
      }
      for (const [m, wantBar] of wantLine.entries()) {
        if (canonical(gotLine[m]) !== canonical(wantBar)) {
          return {
            matched,
            where: `sec ${s} "${wantSection.name}" line ${l} bar ${m}\n      got  ${canonical(gotLine[m])}\n      want ${canonical(wantBar)}`,
          }
        }
        matched += 1
      }
    }
  }
  return null
}

function run(c: Case): Diff | null {
  const parsed = parse(c.abc)
  if (!parsed.ok) return { matched: 0, where: `parse failed: ${parsed.errors[0]?.message ?? '?'}` }
  const score = parsed.scores[0]
  if (score === undefined) return { matched: 0, where: 'no tune parsed' }
  return firstDifference(chordGrid(score), c.expected)
}

describe('chord grid vs abcjs', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      const cells =
        c.expected === null
          ? 0
          : c.expected.reduce(
              (n, s) => n + (s.type === 'part' ? s.lines.reduce((k, l) => k + l.length, 0) : 0),
              0,
            )
      return { slug: c.slug, diff, cells }
    })
    const off = rows.filter((r) => r.diff !== null)
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      '',
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(14)} ${String(r.diff?.matched).padStart(4)}/${r.cells} ok  ${r.diff?.where}`,
        ),
    ].join('\n')
    writeFileSync('/tmp/abcts-chord-grid-ranked.txt', `${text}\n`)
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
