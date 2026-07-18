import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'
import { type Pitch, ratToNumber, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { corpusDir, goldenNotes } from './corpus.js'

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
 *
 * History: 4 with offsets in the key, 18 after dropping them (see keyOf), 24 once the
 * golden reader learned abcjs's multi-tune `{tunes: [...]}` shape — that last step added
 * 12 fixtures to the denominator and 6 to the numerator without touching the parser.
 * Implementing chords moved this number by ZERO: every chord-bearing fixture still fails
 * on something else (multi-voice, mostly). Counts reconcile exactly, so chords are
 * correct; they are just not what this gate measures.
 */
const BASELINE = 26

/** Full per-fixture breakdown, written on every run for triage. */
const REPORT_PATH = '/tmp/abcts-content-parity.txt'

interface NoteKey {
  duration: number
  /** All pitches in the event — a chord is one entry with N pitches, never N entries. */
  pitches: number[]
}

// ponytail: source offsets are NOT compared. abcjs anchors `startChar` at the start of the
// whole attached group, so `"C"G` starts at the `"`, while v2 keeps the chord symbol in a
// separate `chordSymbolSourceRange`. We cannot compute abcjs's anchor until chord symbols
// and decorations are parsed. Ceiling: this gate cannot catch an offset regression.
// Upgrade: put `start` back in the key once attached-token parsing lands.
const keyOf = (n: NoteKey): string => `${n.duration}:${n.pitches.join(',')}`

/** abcjs numbers pitches diatonically from middle C: C4 is 0, c5 is 7. */
const diatonic = (p: Pitch): number => (p.octave - 4) * 7 + stepIndex(p.step)

function ourNotes(abc: string): string[] {
  const result = parse(abc)
  if (!result.ok) return []
  return result.scores
    .flatMap((score) => score.voices)
    .flatMap((voice) => voice.measures)
    .flatMap((measure) => measure.events)
    .filter((event) => event.type === 'note' || event.type === 'chord')
    .map((event) =>
      keyOf({
        duration: ratToNumber(event.duration),
        pitches: (event.type === 'chord' ? event.pitches : [event.pitch]).map(diatonic),
      }),
    )
}

function abcjsNotes(name: string): string[] {
  return goldenNotes(name).map((element) =>
    keyOf({
      duration: element.duration,
      pitches: (element.pitches ?? []).map((p) => p.pitch),
    }),
  )
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
  // A skipped fixture means the golden yielded no notes at all. That should now be
  // impossible — if it reappears, the reader has lost a dump shape again, not the corpus.
  writeFileSync(REPORT_PATH, `${rows.join('\n')}\n${summary}\n`)

  expect(compared, 'no fixtures were comparable — the goldens are not loading').toBeGreaterThan(0)
  expect(matched, `${summary}\nfull report: ${REPORT_PATH}`).toBeGreaterThanOrEqual(BASELINE)
})
