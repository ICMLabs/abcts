/**
 * Harvest abcjs's `metaText` — the tune's FIELD VALUES — over both corpora, by RUNNING
 * abcjs 6.7.0 rather than reading its source.
 *
 * ── WHY IT IS A GATE ────────────────────────────────────────────────────────
 * `metaTextInfo` says WHERE each field was written and `metaText` says WHAT it said, and
 * the two are one surface: `TopText` and `BottomText` read the value from one and the span
 * from the other, and a host reads both. Ours answered `{title}` alone.
 *
 * **THE VALUE IS A STRING OR AN ARRAY OF PHRASES**, and which one depends on the field's
 * text: `parseFontChangeLine` returns the string unchanged unless a `$1`/`$2`-style font
 * change is in it, in which case it returns `[{text, font?}, …]`
 * (`abc_parse_directive.js`). `N:`, `H:` and `W:` are the multi-line fields and ACCUMULATE
 * — `addMetaTextArray` pushes one entry per field line (`abc_parse_header.js:484-503`) —
 * while `addMetaText` JOINS a repeated single-line field with a `\n` (`tune-builder.js:433-448`).
 *
 * ── WHY IT PARSES RATHER THAN RENDERS ───────────────────────────────────────
 * `metaText` is a PARSE product (`abc_parse.js:27`), so this calls `Parse` the way
 * `renderEngine` does (`api/abc_tunebook.js:84`), offset and all — the same reasoning as
 * `harvest-abcjs-metatextinfo.mjs` beside it.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-metatext.mjs
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
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = parser.getTune().metaText
    })
  }
}

const outDir = join(root, 'tests', 'corpus-metatext')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const fields = Object.values(out).reduce((n, v) => n + Object.keys(v).length, 0)
console.log(`${Object.keys(out).length} tunes, ${fields} field values`)
