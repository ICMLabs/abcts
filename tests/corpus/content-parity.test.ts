import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, it } from 'vitest'
import type { Pitch } from '../../src/core/model.js'
import { ratToNumber, stepIndex } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { decodeTextString } from '../../src/parser/text.js'
import { corpusDir, type GoldenElement, goldenElements, goldenNotes } from './corpus.js'

/**
 * Content-parity scoreboard and ratchet.
 *
 * Core produces abcMusicKit2's model, which cannot equal abcjs's parse tree by
 * construction (float vs exact durations, no measure nesting). What is comparable is
 * musical content: same notes, same source offsets, same sounding durations. This
 * counts how many fixtures agree and fails if that count drops — the same
 * regression-net convention abcMusicKit2 runs against v1 (`BASELINE=` in FREEZE.md).
 *
 * Never relax this to make a change pass — add a documented divergence instead.
 *
 *
 * These are abcjs bugs that core exists to fix, so matching the golden would be a
 * regression, not progress. They are excluded from the pass requirement but still
 * reported — a divergence that starts matching means something changed and needs a look.
 */
const KNOWN_DIVERGENCES: Record<string, string> = {
  // `S1-decorations` was here — abcjs DROPS `!staccato!` and strict did not. CLOSED
  // 2026-07-20 by reproducing abcjs's acceptance rule rather than special-casing the one
  // name: a `!name!` decoration survives strict only if it appears in one of abcjs's five
  // decoration tables, and `staccato` is in none of them while its `.` shorthand
  // hard-codes it. This assertion is what reported the fix — the divergence started
  // matching and had to be removed deliberately.
  // `frere-jacques` was the last content divergence and is CLOSED (2026-07-21). abcjs
  // does not implement `+:`, so a copyright notice is lexed as music; strict does the
  // same, and now produces the same 45 notes with the same decorations. The residual was
  // never prose-lexing at all — it was two missing features: `U:` user-defined symbols
  // (the fixture REDEFINES `u` and `v`, swapping them, so we were emitting wrong
  // decorations rather than absent ones) and abcjs's lowercase `t` shorthand.
}

/**
 * Per-fixture ALLOWANCE for offset mismatches, with the reason below.
 *
 * Previously this skipped the offset check for the whole fixture, so S3-note-syntax's
 * other 464 offsets went unchecked to excuse 2 — in the largest and most syntactically
 * dense fixture in the corpus. An allowance ratchets instead: only the known number may
 * fail, and a 3rd is a failure.
 */
const OFFSET_ALLOWANCE: Record<string, number> = { 'S3-note-syntax': 2 }
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
 * fully reverse-engineered. The exact SET of failures is asserted rather than a count:
 * a count of 37 has four units of live slack, so a change that fixed one fixture and broke
 * another would stay green. The set makes any swap a visible diff.
 *
 * That is not hypothetical. Chasing the space-after-tie rule fixed three fixtures'
 * divergences and broke `ragtime-mini`, holding the COUNT at a plausible-looking number
 * while the set churned underneath. The assertion caught it on the first run.
 *
 * ── WHAT THE REMAINING FOUR ACTUALLY ARE (investigated 2026-07-21) ───────────
 * Five disagreeing links across ~2000 compared. Recorded rather than fixed, because each
 * attempt so far has produced a rule fitted to an observation without a mechanism — which
 * is exactly what the original tie exception was, and it had to be undone.
 *
 * ALL THREE were closed on 2026-07-21, and only one of them was a beam rule:
 *
 *  `ragtime-nightingale` — a BROKEN RHYTHM cancels the chord-tie exception, plus a
 *      pending GRACE group holds a beam open exactly as a pending decoration does. Both
 *      are rules; see the `whitespace` case in the parser for the measured table.
 *
 *  `S8-layout` — never a beam divergence. Beam ids restart at 1 in every tune and voice,
 *      and this gate concatenated them, so tune 10's group 1 next to tune 11's group 1
 *      read as one run. Ids are now qualified by owner.
 *
 *  `S5-directives` — never a beam divergence either. An `&` overlay is a VOICE and spans
 *      the whole tune; abcjs pads the measures where it is silent with a whole-measure
 *      invisible rest and we emitted nothing, so the arrays differed in LENGTH while
 *      every beam link matched. Fixed in the parser, not here.
 *
 * Two of the three were therefore gate or model bugs wearing a beam label — which is why
 * the entry above says to look at what a number MEANS before chasing it.
 *
 * `frere-jacques`, the last of them, closed the same day and WAS a beam rule: a space
 * ends a beam only when nothing has come between it and the note, and a character abcjs
 * merely warns about counts as something. Measured across all eight boundaries in its
 * `+:` prose; the table is in the parser's `whitespace` case.
 *
 * The set is now empty, which is the goal state and NOT a reason to delete this. An
 * empty list still asserts: the next fixture whose beams diverge fails here.
 */
const BEAM_FAILURES: string[] = []

/**
 * Fixtures whose verse-1 lyrics do NOT line up with abcjs, and why.
 *
 * This gate is new — until 2026-07-19 lyrics were verified only by unit tests written
 * alongside the implementation, which the 2026-07-18 checkpoint called the highest-value
 * remaining gate work. It was left undone on the belief that the goldens carried no
 * lyric data. They carry it on every fixture. Folding it in immediately found two real
 * parser bugs, both of the same shape: `*` and `|` were handled as whole tokens but not
 * when ATTACHED to a syllable, which is how every real tune writes them.
 */
// `frere-jacques` was here and is CLOSED (2026-07-20). It was downstream of the note-level
// gap: strict lexed the `+:` prose differently, so the note count differed and the lyric
// alignment inherited it. Matching abcjs's unclosed-`+` rule fixed the notes, and the
// lyrics came with them. Empty, and asserted empty — a new entry has to be added on purpose.
const LYRIC_DIVERGENCES: Record<string, string> = {}

// `S5-directives` was listed here as a 2-note multi-verse drift and was NOT a parser
// bug: this gate's own flattening omitted `&` overlay events, which the note comparison
// above has always included. The two sides then differed by exactly the overlay count,
// which reads convincingly as a lyric drift and was written up as one. It matches with
// overlays included. The lesson is the older one about a gate being only as good as what
// it compares — and it applies to a NEW gate as readily as to an old one.

/** Full per-fixture breakdown, written on every run for triage. */
const REPORT_PATH = '/tmp/abcts-content-parity.txt'
/** Machine-readable counts for `npm run parity`, so the tracker has one source of truth. */
const METRICS_PATH = '/tmp/abcts-parity-content.json'

/**
 * Fields folded in from the goldens on 2026-07-18, after an audit found they existed.
 *
 * These were previously verified ONLY by hand-written unit tests written by the same
 * author as the implementation — self-referential coverage. The goldens carry decoration
 * (2745 occurrences), chord (139), lyric (10 files) and grace notes (57), and reading them
 * converts all of it to external verification at no extra corpus cost.
 */
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
  /**
   * Decoration COUNT, not names.
   *
   * The two engines use different vocabularies for the same mark — `~` is `roll` here and
   * `irishroll` in abcjs, `M` is `lowermordent` vs `mordent`, `!<(!` is passed through raw
   * here and normalised to `crescendo(` there. Which vocabulary core should adopt is a
   * decision to settle against v2, not something to infer from abcjs. Counting still gates
   * the structural question that mattered and was previously unchecked: is a decoration
   * attached, to the right note, and exactly once. Names are asserted in unit tests.
   */
  decorationCount: number
  /**
   * Chord symbol PRESENCE, not text — abcjs rewrites `Bb` to `B♭` and `F#m` to `F♯m` for
   * display; core keeps the source text. Same reasoning as decorations.
   */
  hasChordSymbol: boolean
  /** Grace-note count; the pitches themselves are numbered differently on each side. */
  graceCount: number
}

/** Floats from two engines; compare at a tolerance rather than by identity. */
const round = (n: number): number => Math.round(n * 1e9) / 1e9

const keyOf = (n: NoteKey): string =>
  [
    round(n.notated),
    round(n.soundingRatio),
    n.pitches.join(','),
    `d=${n.decorationCount}`,
    `c=${n.hasChordSymbol ? 'y' : 'n'}`,
    `g=${n.graceCount}`,
  ].join(':')

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
              (pitch) => `${diatonic(pitch)}`,
            ),
            decorationCount: event.decorations.length,
            hasChordSymbol: event.chordSymbol !== null,
            graceCount: event.graceNotes.length,
          }),
          key: keyOf({
            notated: ratToNumber(event.notatedDuration),
            // `B0` is a legal zero-duration note, so guard the 0/0.
            soundingRatio:
              ratToNumber(event.notatedDuration) === 0
                ? 1
                : ratToNumber(event.duration) / ratToNumber(event.notatedDuration),
            // No octave compensation: `octave=` is now baked into the model pitch, as abcjs
            // bakes it into its own. Adding it back here made voice-octave-shift pass while
            // our noteheads sat two octaves off abcjs's.
            pitches: (event.type === 'chord' ? event.pitches : [event.pitch]).map(
              (pitch) => `${diatonic(pitch)}${ourAccidental(pitch)}`,
            ),
            decorationCount: event.decorations.length,
            hasChordSymbol: event.chordSymbol !== null,
            graceCount: event.graceNotes.length,
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
  // Beam-group ids restart at 1 in every TUNE and every VOICE, so concatenating them and
  // comparing `id === previous id` reported a beam link across each boundary — tune 10's
  // group 1 sitting next to tune 11's group 1 reads as one run. That cost `S8-layout` a
  // phantom failure. Qualifying the id by its owner makes equality mean what the
  // comparison assumes it means.
  let owner = 0
  for (const score of result.scores) {
    for (const voice of score.voices) {
      owner += 1
      for (const event of [
        ...voice.measures.flatMap((measure) => measure.events),
        ...voice.measures.flatMap((measure) => measure.overlays.flat()),
      ]) {
        runs.push(
          event.type === 'rest' || event.beamGroup === null
            ? null
            : owner * 100_000 + event.beamGroup,
        )
      }
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

/** Attachment fields as abcjs records them, shaped to match our side of the key. */
const goldenAttachments = (element: GoldenElement) => ({
  decorationCount: (element.decoration ?? []).length,
  // abcjs puts annotations in `chord` too, distinguished by `position`; core keeps them
  // apart, so only a real chord symbol (position 'default' or absent) counts.
  // abcjs files annotations under `chord` too. A `position` marks `"^above"`-style
  // placement and a `rel_position` marks `"@x,y text"`; both are annotations, which core
  // keeps in a separate field. Only a bare chord symbol counts.
  // abcjs files annotations under `chord` too: 'above'/'below'/'left'/'right' are
  // "^text"-style placements and rel_position is "@x,y text". Only 'default' (or an
  // absent position, which does not occur) is a real chord symbol — core keeps the two
  // apart in separate fields.
  hasChordSymbol:
    element.chord?.some((c) => c.position === 'default' && c.rel_position === undefined) ?? false,
  graceCount: element.gracenotes?.length ?? 0,
})

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
        ...goldenAttachments(element),
      }),
      key: keyOf({
        notated: element.duration,
        soundingRatio,
        pitches: element.pitches.map((p) => `${p.pitch}${p.accidental ?? ''}`),
        ...goldenAttachments(element),
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
  const beamFailures: string[] = []

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
    if (!beamsSame) beamFailures.push(name)
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
      ours.filter((o, i) => !offsetWithin(o.start, theirs[i]?.start ?? 0, theirs[i]?.end ?? 0))
        .length <= (OFFSET_ALLOWANCE[name] ?? 0)
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
      `${same ? 'MATCH ' : 'diff  '} ${name.padEnd(34)}${beamsSame ? '' : ' [beam]'} ours=${String(ours.length).padStart(4)} abcjs=${String(theirs.length).padStart(4)}${OFFSET_ALLOWANCE[name] ? `  (${OFFSET_ALLOWANCE[name]} offsets allowed)` : ''}${offsetOnly ? '  content OK, OFFSET out of span' : ''}`,
    )
  }

  const gated = compared - diverged
  const summary =
    `=== ${matched}/${gated} gated fixtures match (${diverged} known divergences, ${fixtures.length - compared} skipped) ===\n` +
    `=== beams: ${fixtures.length - beamFailures.length}/${fixtures.length} match ===`
  // A skipped fixture means the golden yielded no notes at all. That should now be
  // impossible — if it reappears, the reader has lost a dump shape again, not the corpus.
  writeFileSync(REPORT_PATH, `${rows.join('\n')}\n${summary}\n`)

  // ─── Lyrics ───────────────────────────────────────────────────────────────
  // Verse 1 only. abcjs stores a hyphen as a `divider` on the syllable rather than in
  // it, and does not decode `\vao`-style escapes, so both sides are normalised before
  // comparing: reattach abcjs's divider, decode its text, and read its "" skip as null.
  const lyricFailures: string[] = []
  let lyricsCompared = 0
  for (const file of fixtures) {
    const name = basename(file, '.abc')
    const abc = readFileSync(join(corpusDir, file), 'utf-8')
    // Same flattening as the note comparison above, overlays included: abcjs promotes
    // `&` layers to their own voice after the main line. Omitting them made the two
    // sides differ by exactly the overlay count, which read convincingly as a lyric
    // drift and was recorded as one.
    const ours = parse(abc)
      .scores.flatMap((score) => score.voices)
      .flatMap((voice) => [
        ...voice.measures.flatMap((measure) => measure.events),
        ...voice.measures.flatMap((measure) => measure.overlays.flat()),
      ])
      .filter((event) => event.type !== 'rest')
      .map((event) => event.lyric)
    const theirs = goldenNotes(name).map((note: GoldenElement) => {
      const first = note.lyric?.[0]
      if (!first) return null
      const syllable = decodeTextString(first.syllable ?? '')
      return syllable === '' ? null : syllable + (first.divider === '-' ? '-' : '')
    })
    if (!ours.some(Boolean) && !theirs.some(Boolean)) continue
    lyricsCompared++
    const same =
      ours.length === theirs.length && ours.every((syllable, i) => syllable === theirs[i])
    if (!same) lyricFailures.push(name)
  }

  writeFileSync(
    METRICS_PATH,
    JSON.stringify({
      // `gated` is the number of fixtures actually held to the comparison; the
      // divergences are the rest. Summing `compared + diverged` double-counted them.
      content: { matched, total: gated, divergences: Object.keys(KNOWN_DIVERGENCES) },
      beams: {
        matched: fixtures.length - beamFailures.length,
        total: fixtures.length,
        failures: beamFailures,
      },
      lyrics: {
        matched: lyricsCompared - lyricFailures.length,
        total: lyricsCompared,
        divergences: Object.keys(LYRIC_DIVERGENCES),
      },
    }),
  )

  expect(lyricsCompared, 'no fixture had lyrics — the goldens are not loading').toBeGreaterThan(5)
  expect(
    lyricFailures.sort(),
    'lyric failures changed. A fixture that starts matching means a divergence is stale.',
  ).toEqual(Object.keys(LYRIC_DIVERGENCES).sort())

  expect(compared, 'no fixtures were comparable — the goldens are not loading').toBeGreaterThan(0)
  expect(
    beamFailures.sort(),
    `beam-run failures changed — see ${REPORT_PATH}, rows tagged [beam]. A swap (one fixed, ` +
      'one broken) keeps the count identical, which is why the set is asserted.',
  ).toEqual([...BEAM_FAILURES].sort())
  expect(
    unexpectedMatches,
    'a known divergence now matches abcjs — re-check whether it is still a real divergence',
  ).toEqual([])
  expect(matched, `${summary}\nfull report: ${REPORT_PATH}`).toBe(gated)
})
