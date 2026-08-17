/**
 * Harvest abcjs's `metaTextInfo` — WHERE each `metaText` field was written — over both
 * corpora, by RUNNING abcjs 6.7.0 rather than reading its source.
 *
 * ── WHY IT IS A GATE ────────────────────────────────────────────────────────
 * The range is the FIELD LINE'S OWN SPAN, `{startChar: iChar, endChar: iChar + line.length}`
 * (`abc_parse_header.js:486-489`), and it is ONE piece of plumbing that pays four times:
 * `metaTextInfo` itself, and the `startChar`/`endChar` of the selectable `title` /
 * `subtitle` / `rhythm` / `composer` / `author` / `partOrder` text rows — `TopText` builds
 * each with `info: metaTextInfo.<field>` (`top-text.js:11-13`, `:23`, `:39`, `:64`, `:70`,
 * `:75`) and that `info` is exactly what `nonMusic` hands `wrapSvgEl`
 * (`draw/non-music.js:24-30`).
 *
 * ── WHY IT PARSES RATHER THAN RENDERS ───────────────────────────────────────
 * `metaTextInfo` is a PARSE product — `abc_parse.js:28` copies it straight off the tune
 * builder — so this calls `Parse` the way `renderEngine` does (`api/abc_tunebook.js:84`),
 * offset and all. Rendering would buy nothing and would die under jsdom the moment a
 * fixture set a boxed font, since `getBBox` has to be stubbed for that.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-metatextinfo.mjs
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
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = parser.getTune().metaTextInfo
    })
  }
}

const outDir = join(root, 'tests', 'corpus-metatextinfo')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const fields = Object.values(out).reduce((n, v) => n + Object.keys(v).length, 0)
console.log(`${Object.keys(out).length} tunes, ${fields} field positions`)
