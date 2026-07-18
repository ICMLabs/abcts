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
