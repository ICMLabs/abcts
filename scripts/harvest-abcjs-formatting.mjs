/**
 * Harvest abcjs's `tune.formatting` — the `%%` settings it collected — over both corpora,
 * by RUNNING abcjs 6.7.0 rather than reading its source.
 *
 * ── WHAT IS IN IT ───────────────────────────────────────────────────────────
 * TWENTY-ONE FONT OBJECTS, always present, seeded by `initFormatting` before any directive
 * is read; then whatever directives the tune set, IN SOURCE ORDER; then `pagewidth` and
 * `pageheight`, which abcjs appends LAST whatever the source said.
 *
 * **A DEFAULT FONT AND A SET FONT HAVE DIFFERENT KEY ORDERS**, which is how the two are
 * told apart on sight: the default literal is `{face, size, weight, style, decoration}`
 * while `getFontParameter` builds `{face, weight, style, decoration}` and then assigns
 * `size` (and `box`). The default `face` is the string `"Times New Roman"` WITH ITS QUOTES.
 *
 * ── WHY IT PARSES RATHER THAN RENDERS ───────────────────────────────────────
 * `formatting` is a PARSE product (`abc_parse.js:26`), so this calls `Parse` the way
 * `renderEngine` does — the same reasoning as `harvest-abcjs-metatextinfo.mjs`.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-formatting.mjs
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
const Parse = require(join(abcjsPath, 'src/parse/abc_parse.js'))
const { TuneBook } = require(join(abcjsPath, 'src/api/abc_tunebook.js'))

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]

const out = {}
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    const book = new TuneBook(abc)
    book.tunes.forEach((tune, i) => {
      const parser = new Parse()
      parser.parse(tune.abc, {}, tune.startPos - book.header.length)
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = parser.getTune().formatting
    })
  }
}

const outDir = join(root, 'tests', 'corpus-formatting')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const fields = Object.values(out).reduce((n, v) => n + Object.keys(v).length, 0)
console.log(`${Object.keys(out).length} tunes, ${fields} settings`)
