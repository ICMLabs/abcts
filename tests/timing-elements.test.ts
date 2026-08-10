/**
 * `currentTrackMilliseconds` — THE THIRD SURFACE OVER THE SAME WALK, and the one a playback
 * CURSOR actually reads.
 *
 * The event table says WHAT sounds. `setTiming` says where the CLOCK is. This says which
 * WRITTEN element is lit — abcjs stamps it back onto the parsed element from inside the
 * flattener (`abc_midi_flattener.js:526-546`), not from `setupEvents`, which is why
 * `doTimingTest` calls `setUpAudio()` and never `setTiming()`.
 *
 * **A NOTE REACHED TWICE THROUGH A REPEAT CARRIES BOTH TIMES.** abcjs stores a number until
 * a second, DIFFERENT value arrives and only then makes it an array; duplicates from other
 * voices are dropped. `of-repeated-sections` is that tune — `CDE|:FG[Ab]|1 Bcd:|2 efg|]`
 * gives its `F` `[3000, 9000]` while every note outside the repeat keeps a bare number. The
 * asymmetry is the contract, so the comparison reproduces it rather than normalising both
 * sides to arrays.
 *
 * The walk is voice 0's elements **in source order, including barlines** — the assertion is
 * positional against abcjs's `visualObj[0].lines[0].staff[0].voices[0]`, so a `{bar: true}`
 * row has to fall exactly where a barline is.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flattenAudio } from '../src/audio/flatten.js'
import type { MusicEvent } from '../src/core/model.js'
import { parse } from '../src/parser/parser.js'

/** The harvested pair, plus the repeat-shape ladder — see `scripts/gen-timing-controls.mjs`. */
const DIRS = [
  join(import.meta.dirname, 'corpus-timing'),
  join(import.meta.dirname, 'corpus-timing-controls'),
]

interface Case {
  readonly slug: string
  readonly kind: string
  readonly abc: string
  readonly expected: readonly ({ ms?: number | number[]; pitches?: number[]; bar?: boolean })[]
}

const CASES: Case[] = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf-8')) })),
).filter((c) => c.kind === 'elements')

/**
 * `el-four-endings` is the one OPEN row and it is left out on purpose — see the ranked
 * table's output. `|1,3 … :|2,4 …` is a corner where abcjs's OWN answer is idiosyncratic:
 * `repeats.js` leaves the final ending's `end` undefined and `duplicateSpan` then emits
 * nothing for it, so abcjs plays `[CDE FGA][CDE][CDE FGA][CDE cde]` — a second pass with no
 * ending at all. Ours plays the four passes the sparse array describes. Measured, named, and
 * not guessed at.
 */
const PASSING: readonly string[] = [
  'of-11-8',
  'of-repeated-sections',
  'el-double-repeat',
  'el-endings-then-more',
  'el-no-repeat',
  'el-no-start-repeat',
  'el-plain-repeat',
  'el-repeat-then-more',
  'el-rest-and-spacer',
  'el-tie-and-chord',
  'el-two-end-repeats',
  'el-two-endings',
]

/** Voice 0's elements in source order — notes and rests, with a marker at every barline. */
function walk(abc: string): ({ ms: number | number[] | undefined; pitches: number[] } | { bar: true })[] {
  const parsed = parse(abc)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.errors[0]?.message ?? '?'}`)
  const score = parsed.scores[0]
  if (score === undefined) throw new Error('no tune parsed')
  const { elementTimings } = flattenAudio(score)
  const out: ({ ms: number | number[] | undefined; pitches: number[] } | { bar: true })[] = []
  const voice = score.voices[0]
  if (voice === undefined) return out
  for (const measure of voice.measures) {
    if (measure.openingBarline !== null) out.push({ bar: true })
    for (const event of measure.events as readonly MusicEvent[]) {
      const row = elementTimings.get(event)
      const ms = row === undefined ? [] : row.milliseconds
      out.push(
        row === undefined
          ? { ms: undefined, pitches: [] }
          : {
              // A single value stays a NUMBER; only a second, different one makes an array.
              ms: ms.length === 1 ? (ms[0] as number) : [...ms],
              pitches: [...row.pitches],
            },
      )
    }
    if (measure.closingBarline !== null) out.push({ bar: true })
  }
  return out
}

/**
 * A RANKED TABLE, not a pass/fail list, for the same reason the other five are: a corner
 * nobody has closed should be a NAMED ROW rather than a red, and `PASSING` is the ratchet.
 *
 * `/tmp/abcts-timing-elements-ranked.txt`.
 */
interface Diff {
  readonly matched: number
  readonly where: string
}

const canonical = (v: unknown): string => JSON.stringify(v)

function firstDifference(got: ReturnType<typeof walk>, want: Case['expected']): Diff | null {
  if (got.length !== want.length) {
    return { matched: 0, where: `${got.length} elements vs ${want.length}` }
  }
  for (const [i, w] of want.entries()) {
    const expected = w.bar === true ? { bar: true } : { ms: w.ms, pitches: w.pitches }
    if (canonical(got[i]) !== canonical(expected)) {
      return { matched: i, where: `element ${i}\n      got  ${canonical(got[i])}\n      want ${canonical(expected)}` }
    }
  }
  return null
}

const run = (c: Case): Diff | null => firstDifference(walk(c.abc), c.expected)

describe('what the flattener writes back onto the source', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      return { slug: c.slug, diff, n: c.expected.length }
    })
    const off = rows.filter((r) => r.diff !== null)
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      '',
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map((r) => `  ${r.slug.padEnd(22)} ${String(r.diff?.matched).padStart(3)}/${r.n} ok  ${r.diff?.where}`),
    ].join('\n')
    writeFileSync('/tmp/abcts-timing-elements-ranked.txt', `${text}\n`)
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
