/**
 * THE AUDIO RANKED TABLE — the third of its kind, and the instrument the audio arc steers by.
 *
 * The pixel table and the harvested table are both regression nets now: 0 of 119 and 0 of
 * 174. This one opens at 54 of 54 and that is the POINT. Every arc in this repo has been
 * worth more for its gate than for any fix it enabled, and the newest three findings could
 * only be STATED once a gate existed to state them in.
 *
 * It names, per case, the FIRST event that differs — the track, the index, and both sides
 * printed — because an event list diverges at one point and everything after it is
 * displacement rather than information. Sorted by how far in the divergence is, so the
 * cases that are nearly right sit at the bottom and the ones that are structurally wrong
 * sit at the top.
 *
 * `/tmp/abcts-audio-ranked.txt`, beside the other two.
 *
 * A ratchet, not a ceiling: `PASSING` lists the cases that must stay exact, and it grows.
 * Nothing here asserts a tolerance, because an event list has none — a pitch is right or
 * it is not.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type MidiEvent, flattenAudio } from '../src/audio/flatten.js'
import { parse } from '../src/parser/parser.js'

const dir = join(import.meta.dirname, 'corpus-audio')

interface Case {
  readonly slug: string
  readonly name: string
  readonly abc: string
  readonly options: Record<string, unknown> | null
  readonly expected: {
    tempo: number
    instrument: number
    totalDuration: number
    tracks: MidiEvent[][]
  }
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({
    slug: f.replace(/\.json$/, ''),
    ...JSON.parse(readFileSync(join(dir, f), 'utf-8')),
  }))

/**
 * Cases that are EXACT and must stay so. Add a slug the moment it goes green; never
 * remove one to make a change pass — that is the same rule as never raising a ceiling.
 */
const PASSING: readonly string[] = [
  'flatten-dynamics',
  'flatten-dynamics2',
  'flatten-dynamics3',
  'flatten-long-tie',
  'flatten-no-chord-voice',
  'flatten-tempo-change2',
  'flatten-tempo-override',
  'volume-crash',
]

interface Diff {
  /** How many events matched before the first divergence — bigger is closer. */
  readonly matched: number
  readonly where: string
}

/** The first difference, in abcjs's own reading order: header, then track by track. */
function firstDifference(
  got: ReturnType<typeof flattenAudio>,
  want: Case['expected'],
): Diff | null {
  if (got.tempo !== want.tempo) {
    return { matched: 0, where: `tempo ${got.tempo} vs ${want.tempo}` }
  }
  if (got.instrument !== want.instrument) {
    return { matched: 0, where: `instrument ${got.instrument} vs ${want.instrument}` }
  }
  if (got.tracks.length !== want.tracks.length) {
    return { matched: 0, where: `${got.tracks.length} tracks vs ${want.tracks.length}` }
  }
  let matched = 0
  for (const [t, wantTrack] of want.tracks.entries()) {
    const gotTrack = got.tracks[t] ?? []
    for (const [e, wantEvent] of wantTrack.entries()) {
      const gotEvent = gotTrack[e]
      if (gotEvent === undefined) {
        return { matched, where: `trk ${t} ev ${e} missing, want ${JSON.stringify(wantEvent)}` }
      }
      if (JSON.stringify(gotEvent) !== JSON.stringify(wantEvent)) {
        return {
          matched,
          where: `trk ${t} ev ${e}\n      got  ${JSON.stringify(gotEvent)}\n      want ${JSON.stringify(wantEvent)}`,
        }
      }
      matched += 1
    }
    if (gotTrack.length > wantTrack.length) {
      return {
        matched,
        where: `trk ${t} has ${gotTrack.length} events, want ${wantTrack.length}: extra ${JSON.stringify(gotTrack[wantTrack.length])}`,
      }
    }
  }
  if (got.totalDuration !== want.totalDuration) {
    return { matched, where: `totalDuration ${got.totalDuration} vs ${want.totalDuration}` }
  }
  return null
}

function run(c: Case): Diff | null {
  const parsed = parse(c.abc)
  if (!parsed.ok) return { matched: 0, where: `parse failed: ${parsed.errors[0]?.message ?? '?'}` }
  const score = parsed.scores[0]
  if (score === undefined) return { matched: 0, where: 'no tune parsed' }
  return firstDifference(flattenAudio(score, c.options ?? {}), c.expected)
}

describe('audio flattener vs abcjs', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      const events = c.expected.tracks.reduce((n, t) => n + t.length, 0)
      return { slug: c.slug, diff, events }
    })
    const off = rows.filter((r) => r.diff !== null)
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      '',
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(34)} ${String(r.diff?.matched).padStart(4)}/${r.events} ok  ${r.diff?.where}`,
        ),
    ].join('\n')
    writeFileSync('/tmp/abcts-audio-ranked.txt', `${text}\n`)
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
