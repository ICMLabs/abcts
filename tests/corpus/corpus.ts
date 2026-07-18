import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const required = (key: string): string => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${key} is not set — vitest.config.ts exports it from abcts.config.json`)
  }
  return resolve(value)
}

export const corpusDir = required('ABCTS_CORPUS_PATH')
export const goldensDir = required('ABCTS_GOLDENS_PATH')

/** One ABC fixture and every abcjs golden generated from it. */
export interface CorpusCase {
  /** Fixture filename without the `.abc` extension. Golden files are keyed on this. */
  readonly name: string
  readonly abcPath: string
  readonly abc: string
  /** Golden filenames (not paths) attributed to this fixture. */
  readonly goldens: readonly string[]
}

// A golden belongs to a fixture when the character right after the stem separates it
// from a variant (`-tune0.svg`) or an extension (`.parse.json`, `.svg`, `.mid`).
const ownsGolden = (stem: string, golden: string): boolean =>
  golden.startsWith(stem) && (golden[stem.length] === '.' || golden[stem.length] === '-')

export function loadCorpus(): CorpusCase[] {
  const fixtures = readdirSync(corpusDir)
    .filter((f) => f.endsWith('.abc'))
    .sort()
  const stems = fixtures.map((f) => basename(f, '.abc'))

  // Longest stem wins: `score-reorder-shared-*.svg` also prefix-matches `score-reorder`,
  // so a naive startsWith would attribute it to both fixtures.
  const byLength = [...stems].sort((a, b) => b.length - a.length)
  const goldensFor = new Map<string, string[]>(stems.map((s) => [s, []]))
  for (const golden of readdirSync(goldensDir)) {
    const owner = byLength.find((stem) => ownsGolden(stem, golden))
    if (owner) goldensFor.get(owner)?.push(golden)
  }

  return stems.map((name) => ({
    name,
    abcPath: join(corpusDir, `${name}.abc`),
    abc: readFileSync(join(corpusDir, `${name}.abc`), 'utf-8'),
    goldens: goldensFor.get(name) ?? [],
  }))
}

/** The abcjs parse-tree dump for a fixture — the compat-mode parser target. */
export function parseGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(goldensDir, `${name}.parse.json`), 'utf-8'))
}

/** The subset of an abcjs golden element this suite reads. */
export interface GoldenElement {
  readonly el_type: string
  readonly startChar: number
  readonly endChar: number
  readonly duration: number
  readonly rest?: unknown
  readonly pitches?: readonly { readonly pitch: number }[]
  /** On the FIRST note of a tuplet only: the sounding multiplier, e.g. 2/3 for a triplet. */
  readonly tripletMultiplier?: number
  /** On the first note of a tuplet: how many notes the multiplier covers. */
  readonly tripletR?: number
}

interface GoldenTune {
  readonly lines?: readonly {
    readonly staff?: readonly { readonly voices?: GoldenElement[][] }[]
  }[]
}

/**
 * Every tune in a `.parse.json` golden, normalized across abcjs's two dump shapes.
 *
 * A single-tune golden is the tune object itself (`{warnings, formatting, metaText,
 * lines}`); a multi-tune golden wraps them in `{_meta, tunes: [...]}` with no top-level
 * `lines`. Reading only the single-tune shape silently yields zero notes for all 12
 * tunebook fixtures, which reads as "no coverage" rather than "wrong reader".
 */
function goldenTunes(name: string): readonly GoldenTune[] {
  const golden = parseGolden(name) as { tunes?: GoldenTune[] } & GoldenTune
  return golden.tunes ?? [golden]
}

/**
 * Every note element in a golden — INCLUDING RESTS — in VOICE-MAJOR order.
 *
 * Rests are kept because abcjs attaches `tripletMultiplier` to whichever element opens a
 * tuplet, and `(3z2A2G2` opens on a rest. Filtering rests before propagating that marker
 * silently strips the tuplet from the notes that follow it.
 *
 * abcjs stores elements system-major — `lines[].staff[].voices[]`, where each line is one
 * rendered system — so a two-voice tune interleaves V1 and V2 once per system. The core
 * model is voice-major (`Score.voices[].measures[]`). Regrouping by `(staff, voice)` here
 * undoes abcjs's layout order to recover the logical order; it does not discard anything.
 * Grouping restarts per tune, so tune 0's voice 0 never merges with tune 1's.
 */
export function goldenElements(name: string): GoldenElement[] {
  const out: GoldenElement[] = []
  for (const tune of goldenTunes(name)) {
    const byVoice = new Map<string, GoldenElement[]>() // insertion order = first appearance
    for (const line of tune.lines ?? []) {
      ;(line.staff ?? []).forEach((staff, staffIndex) => {
        ;(staff.voices ?? []).forEach((voice, voiceIndex) => {
          const key = `${staffIndex}:${voiceIndex}`
          let bucket = byVoice.get(key)
          if (!bucket) {
            bucket = []
            byVoice.set(key, bucket)
          }
          for (const element of voice) {
            if (element.el_type !== 'note') continue
            bucket.push(element)
          }
        })
      })
    }
    for (const bucket of byVoice.values()) out.push(...bucket)
  }
  return out
}

/** Sounding notes only — rests dropped. Use `goldenElements` when tuplet state matters. */
export const goldenNotes = (name: string): GoldenElement[] =>
  goldenElements(name).filter((element) => !element.rest && element.pitches)
