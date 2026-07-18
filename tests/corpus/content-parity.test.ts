import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'
import type { Pitch } from '../../src/core/model.js'
import { ratToNumber, stepIndex } from '../../src/core/model.js'
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
 * History: offsets are back in the gate as of the attachment work — see offsetWithin.
 * Earlier: 4 with offsets compared by equality, 18 after dropping them, 24 once the
 * golden reader learned abcjs's multi-tune `{tunes: [...]}` shape — that last step added
 * 12 fixtures to the denominator and 6 to the numerator without touching the parser.
 * Implementing chords moved this number by ZERO: every chord-bearing fixture still fails
 * on something else (multi-voice, mostly). Counts reconcile exactly, so chords are
 * correct; they are just not what this gate measures.
 */
const BASELINE = 40

/**
 * Fixtures where core INTENTIONALLY disagrees with abcjs, with the reason.
 *
 * These are abcjs bugs that core exists to fix, so matching the golden would be a
 * regression, not progress. They are excluded from the pass requirement but still
 * reported — a divergence that starts matching means something changed and needs a look.
 */
const KNOWN_DIVERGENCES: Record<string, string> = {
  'frere-jacques':
    'abcjs parses `+:` field-continuation lines as music — its notes at offsets 256-296 ' +
    'are the prose of "+:belongs to their respective owners". Core treats `+:` as a ' +
    'continuation of the previous field (ABC 2.1), giving 32 real notes against abcjs 45.',
}

/** Full per-fixture breakdown, written on every run for triage. */
const REPORT_PATH = '/tmp/abcts-content-parity.txt'

interface NoteKey {
  duration: number
  /** All pitches in the event — a chord is one entry with N pitches, never N entries. */
  pitches: number[]
}

const keyOf = (n: NoteKey): string => `${n.duration}:${n.pitches.join(',')}`

/**
 * Source offsets are checked by CONTAINMENT, not equality.
 *
 * abcjs's `startChar` is not a semantic anchor — it is wherever the previous element
 * ended, so abcjs tiles the source contiguously and absorbs leading whitespace and slur
 * parens into the next element (`" ^d#"` starts at the space, `"(GG)"` at the paren).
 * Reproducing that byte-for-byte is compat-mode work, not core's job: v2 anchors each
 * event on its own token and keeps attachments in their own ranges.
 *
 * What core must guarantee is that an offset identifies the RIGHT element — which is what
 * cross-linking an editor caret to a notehead depends on. So the check is that our start
 * falls inside abcjs's span for the same element. That catches a wrong or drifted offset
 * while tolerating abcjs's leading trivia.
 */
const offsetWithin = (ourStart: number | undefined, start: number, end: number): boolean =>
  ourStart !== undefined && ourStart >= start && ourStart < end

/** abcjs numbers pitches diatonically from middle C: C4 is 0, c5 is 7. */
const diatonic = (p: Pitch): number => (p.octave - 4) * 7 + stepIndex(p.step)

interface OurNote {
  key: string
  start: number | undefined
}

function ourNotes(abc: string): OurNote[] {
  const result = parse(abc)
  if (!result.ok) return []
  return result.scores
    .flatMap((score) => score.voices)
    .flatMap((voice) =>
      // abcjs promotes `&` overlay layers to their own voice, emitted after the main
      // line, so the main stream comes first and overlays follow.
      [
        ...voice.measures.flatMap((measure) => measure.events),
        ...voice.measures.flatMap((measure) => measure.overlays.flat()),
      ]
        .filter((event) => event.type === 'note' || event.type === 'chord')
        .map((event) => ({
          start: event.sourceRange?.start,
          key: keyOf({
            duration: ratToNumber(event.duration),
            // abcjs bakes `octave=` into its pitch numbers; the core model keeps it on
            // the Voice as a sounding shift, so add it back to compare like for like.
            pitches: (event.type === 'chord' ? event.pitches : [event.pitch]).map(
              (pitch) => diatonic(pitch) + voice.octaveShift * 7,
            ),
          }),
        })),
    )
}

interface GoldenNote {
  key: string
  start: number
  end: number
}

function abcjsNotes(name: string): GoldenNote[] {
  return goldenNotes(name).map((element) => ({
    start: element.startChar,
    end: element.endChar,
    key: keyOf({
      duration: element.duration,
      pitches: (element.pitches ?? []).map((p) => p.pitch),
    }),
  }))
}

it('content parity against abcjs goldens does not regress', () => {
  const rows: string[] = []
  const unexpectedMatches: string[] = []
  let matched = 0
  let compared = 0
  let diverged = 0

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
    const sameContent =
      ours.length === theirs.length && ours.every((o, i) => o.key === theirs[i]?.key)
    const offsetsOk =
      sameContent &&
      ours.every((o, i) => offsetWithin(o.start, theirs[i]?.start ?? 0, theirs[i]?.end ?? 0))
    const same = sameContent && offsetsOk
    const offsetOnly = sameContent && !offsetsOk
    const divergence = KNOWN_DIVERGENCES[name]
    if (divergence) {
      diverged++
      if (same) unexpectedMatches.push(name)
      rows.push(
        `DIVERGE ${name.padEnd(33)} ours=${String(ours.length).padStart(4)} abcjs=${String(theirs.length).padStart(4)}  ${same ? '!! NOW MATCHES — divergence may be stale' : divergence}`,
      )
      continue
    }
    if (same) matched++
    rows.push(
      `${same ? 'MATCH ' : 'diff  '} ${name.padEnd(34)} ours=${String(ours.length).padStart(4)} abcjs=${String(theirs.length).padStart(4)}${offsetOnly ? '  content OK, OFFSET out of span' : ''}`,
    )
  }

  const gated = compared - diverged
  const summary = `=== ${matched}/${gated} gated fixtures match (${diverged} known divergences, ${fixtures.length - compared} skipped) ===`
  // A skipped fixture means the golden yielded no notes at all. That should now be
  // impossible — if it reappears, the reader has lost a dump shape again, not the corpus.
  writeFileSync(REPORT_PATH, `${rows.join('\n')}\n${summary}\n`)

  expect(compared, 'no fixtures were comparable — the goldens are not loading').toBeGreaterThan(0)
  expect(
    unexpectedMatches,
    'a known divergence now matches abcjs — re-check whether it is still a real divergence',
  ).toEqual([])
  expect(matched, `${summary}\nfull report: ${REPORT_PATH}`).toBeGreaterThanOrEqual(BASELINE)
})
