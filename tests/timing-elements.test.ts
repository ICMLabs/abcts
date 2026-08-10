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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flattenAudio } from '../src/audio/flatten.js'
import type { MusicEvent } from '../src/core/model.js'
import { parse } from '../src/parser/parser.js'

const dir = join(import.meta.dirname, 'corpus-timing')

interface Case {
  readonly slug: string
  readonly kind: string
  readonly abc: string
  readonly expected: readonly ({ ms?: number | number[]; pitches?: number[]; bar?: boolean })[]
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf-8')) }))
  .filter((c) => c.kind === 'elements')

/** Voice 0's elements in source order — notes and rests, with a marker at every barline. */
function walk(abc: string): ({ ms: number | number[]; pitches: number[] } | { bar: true })[] {
  const parsed = parse(abc)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.errors[0]?.message ?? '?'}`)
  const score = parsed.scores[0]
  if (score === undefined) throw new Error('no tune parsed')
  const { elementTimings } = flattenAudio(score)
  const out: ({ ms: number | number[]; pitches: number[] } | { bar: true })[] = []
  const voice = score.voices[0]
  if (voice === undefined) return out
  for (const measure of voice.measures) {
    if (measure.openingBarline !== null) out.push({ bar: true })
    for (const event of measure.events as readonly MusicEvent[]) {
      const row = elementTimings.get(event)
      const ms = row === undefined ? [] : row.milliseconds
      out.push({
        // A single value stays a NUMBER; only a second, different one makes an array.
        ms: ms.length === 1 ? (ms[0] as number) : [...ms],
        pitches: [...(row?.pitches ?? [])],
      })
    }
    if (measure.closingBarline !== null) out.push({ bar: true })
  }
  return out
}

describe('what the flattener writes back onto the source', () => {
  for (const c of CASES) {
    it(`${c.slug} — every element`, () => {
      const got = walk(c.abc)
      expect(got.length).toBe(c.expected.length)
      c.expected.forEach((want, i) => {
        const row = got[i]
        if (want.bar === true) {
          expect(row, `element ${i} should be a bar`).toEqual({ bar: true })
          return
        }
        expect(row, `element ${i}`).toEqual({ ms: want.ms, pitches: want.pitches })
      })
    })
  }
})
