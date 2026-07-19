import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'
import type { Pitch } from '../../src/core/model.js'
import { ratToNumber, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { corpusDir, goldenElements } from './corpus.js'

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

/**
 * Fixtures exempt from the OFFSET check only — content must still match exactly.
 * Narrower than KNOWN_DIVERGENCES so a content regression can never hide behind one.
 */
const OFFSET_DIVERGENCES: Record<string, string> = {
  'S3-note-syntax':
    'Microtonal accidentals (`^3/2G`): core spans the whole `^3/2G` because v2 includes a ' +
    'leading accidental in the note range, but abcjs starts its span at the `G`, excluding ' +
    "the fraction — inconsistent with abcjs's own handling of plain `^G`, which it does " +
    'include. 2 of 466 notes.',
}

/**
 * Beam runs are gated separately from content, with their own baseline.
 *
 * Beaming is a layout decision, not a musical one, and abcjs has conventions we have not
 * fully reverse-engineered — 4 fixtures still differ for reasons not yet analysed
 * (S5-directives, S7-voices, S8-layout, ragtime-nightingale). Tracking it separately
 * keeps those from blocking the content gate while still catching a regression.
 */
const BEAM_BASELINE = 36

/** Full per-fixture breakdown, written on every run for triage. */
const REPORT_PATH = '/tmp/abcts-content-parity.txt'

interface NoteKey {
  /**
   * NOTATED duration — what is written. abcjs's `duration` is the notated value and it
   * carries the tuplet ratio separately as `tripletMultiplier`, so comparing our sounding
   * `duration` against it would report every triplet as a mismatch.
   */
  notated: number
  /** Sounding / notated — 1 outside a tuplet, 2/3 inside a triplet. */
  soundingRatio: number
  /** All pitches in the event — a chord is one entry with N pitches, never N entries. */
  pitches: string[]
}

/** Floats from two engines; compare at a tolerance rather than by identity. */
const round = (n: number): number => Math.round(n * 1e9) / 1e9

const keyOf = (n: NoteKey): string =>
  `${round(n.notated)}:${round(n.soundingRatio)}:${n.pitches.join(',')}`

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

/**
 * Accidentals MUST be in the comparison key.
 *
 * Both sides number pitches diatonically, so `^F`, `F`, `_F` and `=F` are the same number.
 * Comparing pitch alone left every accidental path unverified across the whole corpus —
 * key-signature alteration, explicit accidentals, doubles, naturals — while `vree-sharps`
 * reported MATCH with a sharp on every note. The goldens carry `pitches[].accidental` on
 * 376 pitches; this reads it.
 *
 * `null` on our side means "inherit from the key signature", which abcjs resolves and we
 * deliberately defer to engrave — so an unaltered note is compared as absent on both
 * sides, and only WRITTEN accidentals are gated.
 */
const ACCIDENTAL_NAMES: Record<number, string> = {
  [-2]: 'dblflat',
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'dblsharp',
}
const ourAccidental = (p: Pitch): string =>
  p.accidental === null ? '' : (ACCIDENTAL_NAMES[p.accidental] ?? '?')

interface OurNote {
  key: string
  /** Same key with accidentals stripped — see the microtone note on ourAccidental. */
  keyNoAccidental: string
  /** True when any pitch carries a microtonal detune. */
  microtonal: boolean
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
          microtonal: event.microtoneCents !== 0,
          keyNoAccidental: keyOf({
            notated: ratToNumber(event.notatedDuration),
            soundingRatio:
              ratToNumber(event.notatedDuration) === 0
                ? 1
                : ratToNumber(event.duration) / ratToNumber(event.notatedDuration),
            pitches: (event.type === 'chord' ? event.pitches : [event.pitch]).map(
              (pitch) => `${diatonic(pitch) + voice.octaveShift * 7}`,
            ),
          }),
          key: keyOf({
            notated: ratToNumber(event.notatedDuration),
            // `B0` is a legal zero-duration note, so guard the 0/0.
            soundingRatio:
              ratToNumber(event.notatedDuration) === 0
                ? 1
                : ratToNumber(event.duration) / ratToNumber(event.notatedDuration),
            // abcjs bakes `octave=` into its pitch numbers; the core model keeps it on
            // the Voice as a sounding shift, so add it back to compare like for like.
            pitches: (event.type === 'chord' ? event.pitches : [event.pitch]).map(
              (pitch) => `${diatonic(pitch) + voice.octaveShift * 7}${ourAccidental(pitch)}`,
            ),
          }),
        })),
    )
}

interface GoldenNote {
  key: string
  keyNoAccidental: string
  start: number
  end: number
}

/** Which beam run each event belongs to, as a link-to-previous flag per event. */
const beamLinks = (runs: (number | null)[]): boolean[] =>
  runs.map((run, i) => i > 0 && run !== null && run === runs[i - 1])

function ourBeams(abc: string): boolean[] {
  const result = parse(abc)
  if (!result.ok) return []
  const runs: (number | null)[] = []
  for (const voice of result.scores.flatMap((score) => score.voices)) {
    for (const event of [
      ...voice.measures.flatMap((measure) => measure.events),
      ...voice.measures.flatMap((measure) => measure.overlays.flat()),
    ]) {
      runs.push(event.type === 'rest' ? null : event.beamGroup)
    }
  }
  return beamLinks(runs)
}

/** abcjs marks run boundaries with startBeam/endBeam rather than a shared id. */
function abcjsBeams(name: string): boolean[] {
  const runs: (number | null)[] = []
  let runId = 0
  let inRun = false
  for (const element of goldenElements(name)) {
    if (element.rest) {
      runs.push(null)
      if (element.endBeam) inRun = false
      continue
    }
    if (element.startBeam) {
      runId++
      inRun = true
    }
    runs.push(inRun ? runId : null)
    if (element.endBeam) inRun = false
  }
  return beamLinks(runs)
}

function abcjsNotes(name: string): GoldenNote[] {
  // abcjs marks only the FIRST note of a tuplet, with `tripletMultiplier` and a
  // `tripletR` count; the following R-1 notes are implicitly members. Propagate it so
  // every member is compared against the ratio it actually sounds at.
  let remaining = 0
  let multiplier = 1
  const out: GoldenNote[] = []
  // Walk rests too: a tuplet can open on one (`(3z2A2G2`), and dropping it here would
  // strip the tuplet from the notes that follow.
  for (const element of goldenElements(name)) {
    if (element.tripletMultiplier !== undefined) {
      multiplier = element.tripletMultiplier
      remaining = element.tripletR ?? 1
    }
    const soundingRatio = remaining > 0 ? multiplier : 1
    if (remaining > 0) remaining--
    if (element.rest || !element.pitches) continue
    out.push({
      start: element.startChar,
      end: element.endChar,
      keyNoAccidental: keyOf({
        notated: element.duration,
        soundingRatio,
        pitches: element.pitches.map((p) => `${p.pitch}`),
      }),
      key: keyOf({
        notated: element.duration,
        soundingRatio,
        pitches: element.pitches.map((p) => `${p.pitch}${p.accidental ?? ''}`),
      }),
    })
  }
  return out
}

it('content parity against abcjs goldens does not regress', () => {
  const rows: string[] = []
  const unexpectedMatches: string[] = []
  let matched = 0
  let compared = 0
  let diverged = 0
  let beamsMatched = 0

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
    const abc = readFileSync(join(corpusDir, file), 'utf-8')
    const ourBeamRuns = ourBeams(abc)
    const theirBeamRuns = abcjsBeams(name)
    const beamsSame =
      ourBeamRuns.length === theirBeamRuns.length &&
      ourBeamRuns.every((v, i) => v === theirBeamRuns[i])
    if (beamsSame) beamsMatched++
    const ours = ourNotes(abc)
    // Microtonal notes compare WITHOUT the accidental. v2's rule is that the printed
    // accidental stays the base sign and the deviation lives in microtoneCents, while
    // abcjs picks a distinct glyph (`^/` -> quartersharp) or none at all (`^3/2`). That is
    // a design divergence, not a defect — so the pitch and duration are still gated for
    // these notes, only the accidental name is not. Four notes corpus-wide.
    const sameContent =
      ours.length === theirs.length &&
      ours.every((o, i) =>
        o.microtonal ? o.keyNoAccidental === theirs[i]?.keyNoAccidental : o.key === theirs[i]?.key,
      )
    const offsetsOk =
      sameContent &&
      (name in OFFSET_DIVERGENCES ||
        ours.every((o, i) => offsetWithin(o.start, theirs[i]?.start ?? 0, theirs[i]?.end ?? 0)))
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
      `${same ? 'MATCH ' : 'diff  '} ${name.padEnd(34)}${beamsSame ? '' : ' [beam]'} ours=${String(ours.length).padStart(4)} abcjs=${String(theirs.length).padStart(4)}${name in OFFSET_DIVERGENCES ? '  (offsets exempt)' : ''}${offsetOnly ? '  content OK, OFFSET out of span' : ''}`,
    )
  }

  const gated = compared - diverged
  const summary =
    `=== ${matched}/${gated} gated fixtures match (${diverged} known divergences, ${fixtures.length - compared} skipped) ===\n` +
    `=== beams: ${beamsMatched}/${fixtures.length} match ===`
  // A skipped fixture means the golden yielded no notes at all. That should now be
  // impossible — if it reappears, the reader has lost a dump shape again, not the corpus.
  writeFileSync(REPORT_PATH, `${rows.join('\n')}\n${summary}\n`)

  expect(compared, 'no fixtures were comparable — the goldens are not loading').toBeGreaterThan(0)
  expect(
    beamsMatched,
    `beam runs regressed — see ${REPORT_PATH}, rows tagged [beam]`,
  ).toBeGreaterThanOrEqual(BEAM_BASELINE)
  expect(
    unexpectedMatches,
    'a known divergence now matches abcjs — re-check whether it is still a real divergence',
  ).toEqual([])
  expect(matched, `${summary}\nfull report: ${REPORT_PATH}`).toBeGreaterThanOrEqual(BASELINE)
})
