/**
 * Harvest the SHAPE of abcjs's `tune.lines` — per line, each staff's clef type and how many
 * voices it holds; per text line, its kind — by running abcjs 6.7.1's `parseOnly` over every
 * fixture in both corpora.
 *
 * ⚠️ **THE `lines` ORACLE CANNOT SEE THIS.** It compares every character's element and span
 * (`corpus-lines`), and a voice array that holds NOTHING maps no character: ours published
 * `[[d], []]` for a `%%score (T B)` line abcjs publishes as `[[d]]`, across the whole
 * corpus, and every gate was green. `voices-array` records layout rows, and an empty voice
 * has none. So the shape is its own oracle.
 *
 *   node scripts/harvest-abcjs-lines-shape.mjs
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
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
global.document = dom.window.document
global.window = dom.window
const ABCJS = require(join(abcjsPath, 'index'))

/** One line's shape. Kept to what a host iterates: the staves, their clefs, their voices. */
export const shapeOf = (line) =>
  line.staff
    ? line.staff.map((st) => [st.clef?.type ?? null, (st.voices ?? []).length])
    : Object.keys(line).filter((k) => k !== 'vskip').sort().join('+')

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]
const out = {}
for (const [label, dir] of corpora)
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    let tunes
    try {
      tunes = ABCJS.parseOnly(abc)
    } catch (e) {
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    tunes.forEach((tune, i) => {
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = (tune.lines ?? []).map(shapeOf)
    })
  }
const outDir = join(root, 'tests', 'corpus-lines-shape')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out)}\n`)
console.log(`${Object.keys(out).length} tunes`)
