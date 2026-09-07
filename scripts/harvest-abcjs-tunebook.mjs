/**
 * Harvest abcjs's `TuneBook` and `numberOfTunes` — the METADATA a host reads BEFORE it
 * parses anything — by RUNNING abcjs 6.7.0 rather than reading its source.
 *
 * ── WHY IT IS A GATE, AND WHY THE OLD TEST WAS NOT ONE ──────────────────────
 * `TuneBook` is what a site calls to list a file's tunes: id, title, and the byte offsets
 * to slice each one out with. It was covered by FIVE HAND-WRITTEN CASES asserting a
 * reading of `abc_parse_book.js` — and **a test can encode an inference as firmly as a
 * comment can, and is harder to notice**, because a green test reads as a checked fact.
 * Three tests in this repo have already had to be rewritten for exactly that (the
 * decoration texts, the acciaccatura line, the grace-note count). This asks abcjs instead.
 *
 * ── WHY THE CONTROLS ARE HERE AND NOT IN THE CORPUS ─────────────────────────
 * **`TuneBook` IS STRING SURGERY, NOT PARSING** — abcjs splits on `"\nX:"`, truncates each
 * tune at the first blank line, and reads the title back out with more splits. So what
 * exercises it is not music at all: it is blank lines, CRLF, a file header, an `X:` inside
 * a comment, a missing `T:`, a book with no `X:` whatever. The 231 fixtures are TUNES, and
 * measured, they agree on all 231 — which says the corpus cannot see this surface rather
 * than that the surface is right. **A GATE IS ONLY AS BROAD AS ITS INPUTS.**
 *
 * The 22 shapes below are the ladder, one variable per rung. They live in this file
 * because they are inputs to an oracle, exactly as `gen-audio-controls.mjs`'s do.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 * The control strings here are ours.
 *
 *   node scripts/harvest-abcjs-tunebook.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const tools = join(root, config.goldens, '..')

const require = createRequire(join(tools, 'package.json'))
const { TuneBook, numberOfTunes } = require(join(abcjsPath, 'src/api/abc_tunebook.js'))

/**
 * The ladder. Each name says the ONE thing its rung varies; the shapes with no music in
 * them at all are the point, not an edge case.
 */
const CONTROLS = {
  'two tunes': 'X:1\nT:First\nK:C\nCDEF|\n\nX:2\nT:Second\nK:G\nGABc|\n',
  'no trailing newline': 'X:1\nT:A\nK:C\nC|',
  'no X: at all': 'T:A\nK:C\nC|\n',
  'empty string': '',
  'only whitespace': '   \n\n  \n',
  'file header': '%%staffwidth 300\n% comment\n\nX:1\nK:C\nC|\n\nX:2\nK:C\nD|\n',
  'header with no blank line': '%%staffwidth 300\nX:1\nK:C\nC|\n',
  'X: inside a comment': '% see X:1 for details\nX:1\nK:C\nC|\n',
  'X: not at a line start': 'X:1\nT:has X: inside\nK:C\nC|\n',
  'no T:': 'X:1\nK:C\nC|\n',
  'T: before X:': 'T:orphan\nX:1\nK:C\nC|\n',
  'two T: lines': 'X:1\nT:One\nT:Two\nK:C\nC|\n',
  'blank line inside the tune': 'X:1\nT:A\nK:C\nCDEF|\n\nGABc|\n',
  CRLF: 'X:1\r\nT:A\r\nK:C\r\nC|\r\n\r\nX:2\r\nT:B\r\nK:C\r\nD|\r\n',
  'trailing prose': 'X:1\nT:A\nK:C\nC|\n\nsome prose here\n',
  'non-numeric X:': 'X:abc\nT:A\nK:C\nC|\n',
  'duplicate X:': 'X:1\nT:A\nK:C\nC|\n\nX:1\nT:B\nK:C\nD|\n',
  'X: with spaces': 'X: 1 \nT: A \nK:C\nC|\n',
  'three tunes with no blank lines': 'X:1\nK:C\nC|\nX:2\nK:C\nD|\nX:3\nK:C\nE|\n',
  'leading blank lines': '\n\nX:1\nT:A\nK:C\nC|\n',
  'a tune holding only its X:': 'X:1\n\nX:2\nT:B\nK:C\nD|\n',
  'unicode title': 'X:1\nT:Café — Ünïcode\nK:C\nC|\n',
}

/**
 * Every field a host reads, including the OFFSETS — `startPos`/`endPos` are what a caller
 * slices with, so a book whose ids and titles are right and whose offsets are one out is
 * still broken, and only a comparison that carries them can say so.
 */
const shapeOf = (abc, carry) => {
  const book = new TuneBook(abc)
  return {
    // **A CONTROL CARRIES ITS OWN INPUT INTO THE GOLDEN**, so the test needs no import from
    // this script — an `.mjs` has no types and the alternative was duplicating the ladder.
    // A fixture's input is its file, so only the controls carry one.
    ...(carry === undefined ? {} : { abc: carry }),
    header: book.header,
    numberOfTunes: numberOfTunes(abc),
    tunes: book.tunes.map((t) => ({
      id: t.id,
      title: t.title,
      startPos: t.startPos,
      endPos: t.endPos,
      abc: t.abc,
      pure: t.pure,
    })),
  }
}

const fixtures = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const out = {}
for (const [name, abc] of Object.entries(CONTROLS)) out[`control/${name}`] = shapeOf(abc, abc)
for (const f of readdirSync(fixtures).filter((f) => f.endsWith('.abc')).sort()) {
  out[`fixture/${f.replace(/\.abc$/, '')}`] = shapeOf(readFileSync(join(fixtures, f), 'utf-8'))
}

const dir = join(root, 'tests', 'corpus-tunebook')
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, 'golden.json'),
  `${JSON.stringify({ abcjs: '6.7.0', generatedBy: 'scripts/harvest-abcjs-tunebook.mjs', cases: out }, null, 1)}\n`,
)
console.log(`${Object.keys(out).length} cases -> ${join(dir, 'golden.json')}`)
