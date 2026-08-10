/**
 * Harvest abcjs's CHORD-GRID oracle — the grids, not just the tunes.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Same reason the audio and MIDI-file harvesters came before a line of their arcs: the
 * gate is worth more than any fix it enables. `chordGrid` is the largest single FEATURE
 * gap in this repo — abcts has none of it — and `visual/chord-grid.test.js` is 22 tunes
 * with abcjs's answer written out beside each as a JSON literal.
 *
 * It is portable for the reason the audit named: `parserTest` asserts
 * `visualObj[0].chordGrid`, a plain published structure of the same kind as the `.parse.json`
 * goldens, not the internal `visualObj` tree that made most of abcjs's `visual/` suite
 * unportable.
 *
 * ── TWO CASES ASSERT `undefined` AND THEY ARE THE INTERESTING ONES ───────────
 * `waltz` and `no-chords` pass `undefined` as the expectation: a 3/4 tune and a tune with
 * no chord symbols. `chordGrid()` THROWS on both (`notCommonTime`, `noChords`) and abcjs
 * catches it, so the tune object simply carries no grid. A feature's refusals are part of
 * its contract, and they are the cases an implementation written from the happy path gets
 * wrong. Kept, with `expected: null`.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * By EVALUATING the file with `describe`/`it`/`parserTest` replaced, as the other two do.
 * The tunes are `const abcX = \`…\`` template literals and only the `it()` bodies pair them
 * with their answers. `oneSvgTest` is stubbed to nothing: its single case asserts a DIV
 * COUNT under `oneSvgPerLine`, which is a layout fact rather than a grid one.
 *
 * ── LICENCE ──────────────────────────────────────────────────────────────────
 * The ABC text and the expected grids are abcjs's authors' work, and abcjs is MIT. The
 * corpus directory carries abcjs's notice, as `tests/corpus-audio/` does.
 *
 *   node scripts/harvest-abcjs-chord-grid.mjs [--dry]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsRoot = join(root, config.abcjsRef ?? '../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0')
const SOURCE = join(abcjsRoot, 'tests/visual/chord-grid.test.js')
const outDir = join(root, 'tests', 'corpus-chord-grid')

const dry = process.argv.includes('--dry')
const text = readFileSync(SOURCE, 'utf-8')

// The helpers reach for `abcjs`, `chai` and `document`; cut them off so ours are what runs.
// They are top-level function DECLARATIONS, so they would otherwise hoist over any binding.
const helpersAt = text.indexOf('\nfunction parserTest')
if (helpersAt < 0) throw new Error('chord-grid.test.js: no `function parserTest` to cut at')
const body = text.slice(0, helpersAt)

const cases = []
let pending = null
const stubs = {
  describe: (_name, fn) => fn(),
  it: (name, fn) => {
    pending = { name, abc: null, expected: null, seen: false }
    fn()
    if (!pending.seen && pending.skip !== true) {
      throw new Error(`chord-grid.test.js: "${name}" never called parserTest`)
    }
    cases.push(pending)
    pending = null
  },
  parserTest: (abc, expected) => {
    if (pending === null) throw new Error('parserTest outside an it()')
    pending.abc = abc
    // `undefined` is the ANSWER for a tune abcjs refuses to grid, not a missing one.
    pending.expected = expected === undefined ? null : expected
    pending.seen = true
  },
  oneSvgTest: () => {
    // Asserts a div count under `oneSvgPerLine`; nothing about the grid.
    if (pending !== null) pending.skip = true
  },
}

// eslint-disable-next-line no-new-func
const run = new Function(...Object.keys(stubs), body)
run(...Object.values(stubs))

const harvested = cases.filter((c) => !c.skip)
if (harvested.length === 0) throw new Error('chord-grid.test.js: harvested nothing')

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

if (dry) {
  for (const c of harvested) {
    const parts = c.expected === null ? 'REFUSED' : `${c.expected.length} sections`
    console.log(`${slug(c.name).padEnd(14)} ${parts}`)
  }
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(join(outDir, f))
}
for (const c of harvested) {
  writeFileSync(
    join(outDir, `${slug(c.name)}.json`),
    `${JSON.stringify({ name: c.name, abc: c.abc, expected: c.expected }, null, 1)}\n`,
  )
}
console.log(`harvested ${harvested.length} chord-grid cases into ${outDir}`)
