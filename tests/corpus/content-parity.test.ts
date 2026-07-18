import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'
import { ratToNumber, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { corpusDir, goldensDir } from './corpus.js'

/**
 * Content-parity scoreboard and ratchet.
 *
 * Core produces abcMusicKit2's model, which cannot equal abcjs's parse tree by
 * construction (float vs exact durations, no measure nesting). What is comparable is
 * musical content: same notes, same source offsets, same sounding durations. This
 * counts how many fixtures agree and fails if that count drops — the same
 * regression-net convention abcMusicKit2 runs against v1 (`BASELINE=` in FREEZE.md).
 *
 * Raise BASELINE as parser features land. Never lower it to make a change pass.
 */
const BASELINE = 4

/** Full per-fixture breakdown, written on every run for triage. */
const REPORT_PATH = '/tmp/abcts-content-parity.txt'

interface NoteKey {
  start: number | undefined
  duration: number
  pitch: number
}

const keyOf = (n: NoteKey): string => `${n.start}:${n.duration}:${n.pitch}`

function ourNotes(abc: string): string[] {
  const result = parse(abc)
  if (!result.ok) return []
  return result.scores
    .flatMap((score) => score.voices)
    .flatMap((voice) => voice.measures)
    .flatMap((measure) => measure.events)
    .filter((event) => event.type === 'note')
    .map((note) =>
      keyOf({
        start: note.sourceRange?.start,
        duration: ratToNumber(note.duration),
        // abcjs numbers pitches diatonically from middle C: C4 is 0, c5 is 7.
        pitch: (note.pitch.octave - 4) * 7 + stepIndex(note.pitch.step),
      }),
    )
}

function abcjsNotes(name: string): string[] {
  const golden = JSON.parse(readFileSync(join(goldensDir, `${name}.parse.json`), 'utf-8'))
  const out: string[] = []
  for (const line of golden.lines ?? []) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices ?? []) {
        for (const element of voice) {
          if (element.el_type !== 'note' || element.rest || !element.pitches) continue
          out.push(
            keyOf({
              start: element.startChar,
              duration: element.duration,
              pitch: element.pitches[0].pitch,
            }),
          )
        }
      }
    }
  }
  return out
}

it('content parity against abcjs goldens does not regress', () => {
  const rows: string[] = []
  let matched = 0
  let compared = 0

  const fixtures = readdirSync(corpusDir)
    .filter((f) => f.endsWith('.abc'))
    .sort()

  for (const file of fixtures) {
    const name = basename(file, '.abc')
    const theirs = abcjsNotes(name)
    if (theirs.length === 0) {
      // Multi-tune fixtures: the golden holds a single tune, so there is nothing to
      // compare against yet. Counted separately so they cannot inflate the score.
      rows.push(`skip   ${name.padEnd(34)} golden has no notes`)
      continue
    }
    compared++
    const ours = ourNotes(readFileSync(join(corpusDir, file), 'utf-8'))
    const same = ours.length === theirs.length && ours.every((k, i) => k === theirs[i])
    if (same) matched++
    rows.push(
      `${same ? 'MATCH ' : 'diff  '} ${name.padEnd(34)} ours=${String(ours.length).padStart(4)} abcjs=${String(theirs.length).padStart(4)}`,
    )
  }

  const summary = `=== ${matched}/${compared} compared fixtures match (${fixtures.length - compared} skipped) ===`
  writeFileSync(REPORT_PATH, `${rows.join('\n')}\n${summary}\n`)

  expect(compared, 'no fixtures were comparable — the goldens are not loading').toBeGreaterThan(0)
  expect(matched, `${summary}\nfull report: ${REPORT_PATH}`).toBeGreaterThanOrEqual(BASELINE)
})
