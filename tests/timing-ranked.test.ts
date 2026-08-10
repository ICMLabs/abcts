/**
 * THE TIMING RANKED TABLE — the sixth of its kind.
 *
 * Reads the `warp` and `switch` cases of `tests/corpus-timing/`: `setTiming(bpm,
 * measuresOfDelay)` against abcjs's own `noteTimings[i].milliseconds` and
 * `millisecondsPerMeasure`. Names the FIRST row that differs, because a clock diverges at
 * one point and everything after it is displacement.
 *
 * `/tmp/abcts-timing-ranked.txt`, beside the other five.
 *
 * A ratchet, not a ceiling: `PASSING` grows and never shrinks. No tolerance — abcjs rounds
 * to whole milliseconds and so do we, so a row is right or it is not.
 *
 * **WHAT A GREEN TABLE HERE DOES NOT PROVE.** Every row abcjs publishes also carries `left`,
 * `endX`, `top` and `height`, and abcjs's own `timing.test.js` asserts NONE of them. This is
 * the clock, not the audio↔geometry join. The `elements` cases are not read here either:
 * `doTimingTest` asserts `currentTrackMilliseconds` stamped back onto the drawn elements by
 * the FLATTENER (`abc_midi_flattener.js:530`), which is a third surface again.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { setTiming } from '../src/audio/timing.js'
import { parse } from '../src/parser/parser.js'

/**
 * TWO DIRECTORIES, same shape, same compare — `npm run harvest:timing` CLEARS the harvested
 * one, so the CONTROLS live beside it. See `scripts/gen-timing-controls.mjs`: abcjs's twelve
 * warp cases are two 4/4 tunes with no pickup, one voice and no mid-tune tempo, so whole
 * branches had no case behind them. Deleting `startingDelay -= getPickupLength()` outright
 * left this table at 0 of 13.
 */
const DIRS = [
  join(import.meta.dirname, 'corpus-timing'),
  join(import.meta.dirname, 'corpus-timing-controls'),
]

interface Case {
  readonly slug: string
  readonly name: string
  readonly kind: string
  readonly abc: string
  readonly abc2?: string
  readonly bpm?: number
  readonly measuresOfDelay?: number
  readonly millisecondsPerMeasure?: number
  readonly ms?: number[]
  readonly ms2?: number[]
}

const CASES: Case[] = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf-8')) })),
).filter((c) => c.kind === 'warp' || c.kind === 'switch')

/** Every warp and switch case, harvested and control alike. */
const PASSING: readonly string[] = [
  'compound-6-8',
  'compound-9-8',
  'delay-1',
  'delay-2',
  'delay-pickup',
  'delay-pickup-2',
  'five-eight',
  'no-tempo-3-4',
  'no-tempo-4-4',
  'no-tempo-6-8',
  'pickup-no-delay',
  'plain',
  'repeat-chained',
  'repeat-endings',
  'repeat-plain',
  'seven-eight',
  'spacer',
  'switch-tunes',
  'tempo-change',
  'tempo-change-warped',
  'tempo-eighth',
  'tempo-half',
  'three-eight',
  'triplet',
  'two-voices',
  'two-voices-ragged',
  'warp-1',
  'warp-2',
  'warp-3',
  'warp-4',
  'warp-5',
  'warp-6',
  'warp-no-q-1',
  'warp-no-q-2',
  'warp-no-q-3',
  'warp-no-q-4',
  'warp-no-q-5',
  'warp-no-q-6',
]

interface Diff {
  /** How many rows matched before the first divergence — bigger is closer. */
  readonly matched: number
  readonly where: string
}

function compare(got: number[], want: number[], label: string): Diff | null {
  if (got.length !== want.length) {
    return { matched: 0, where: `${label}: ${got.length} rows vs ${want.length}` }
  }
  for (const [i, w] of want.entries()) {
    if (got[i] !== w) return { matched: i, where: `${label}: row ${i} ${got[i]} vs ${w}` }
  }
  return null
}

function run(c: Case): Diff | null {
  const timings = (abc: string, bpm?: number, delay?: number) => {
    const parsed = parse(abc)
    if (!parsed.ok) throw new Error(`parse failed: ${parsed.errors[0]?.message ?? '?'}`)
    const score = parsed.scores[0]
    if (score === undefined) throw new Error('no tune parsed')
    return setTiming(score, {
      ...(bpm === undefined ? {} : { bpm }),
      ...(delay === undefined ? {} : { measuresOfDelay: delay }),
    })
  }
  if (c.kind === 'switch') {
    const a = compare(timings(c.abc).map((t) => t.milliseconds), c.ms ?? [], 'tune 1')
    if (a !== null) return a
    return compare(
      timings(c.abc2 as string).map((t) => t.milliseconds),
      c.ms2 ?? [],
      'tune 2',
    )
  }
  const rows = timings(c.abc, c.bpm, c.measuresOfDelay)
  const perMeasure = rows[0]?.millisecondsPerMeasure
  if (perMeasure !== c.millisecondsPerMeasure) {
    return { matched: 0, where: `millisecondsPerMeasure ${perMeasure} vs ${c.millisecondsPerMeasure}` }
  }
  return compare(rows.map((t) => t.milliseconds), c.ms ?? [], 'ms')
}

describe('note timings vs abcjs', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      return { slug: c.slug, diff, n: (c.ms?.length ?? 0) + (c.ms2?.length ?? 0) }
    })
    const off = rows.filter((r) => r.diff !== null)
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      '',
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(16)} ${String(r.diff?.matched).padStart(4)}/${r.n} ok  ${r.diff?.where}`,
        ),
    ].join('\n')
    writeFileSync('/tmp/abcts-timing-ranked.txt', `${text}\n`)
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
