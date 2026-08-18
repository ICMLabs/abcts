/**
 * Harvest abcjs's `extractMeasures(abc)` — the tune cut into MEASURES OF ABC TEXT — over
 * both corpora, by RUNNING abcjs 6.7.0.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * `[{header, measures: [{abc, lastChord?, startEnding?, endEnding?}], hasPickup}]`, one
 * entry per tune of the book (`api/abc_tunebook.js:174-259`). A host uses it to make a
 * chord chart or to quote a bar, and it is the one public API whose answer is a SUBSTRING
 * OF THE SOURCE: every fragment is `tune.abc.substring(fragStart, elem.endChar)`, so it is
 * `tune.lines`'s SPANS read back out. That makes it the strictest possible consumer of the
 * character gate that closed today, and the reason to build it now rather than later.
 *
 * Three quirks it carries, all of which the port keeps:
 *   - **IT READS ONE STAFF AND ONE VOICE.** `k < 1` and `kk < 1` are hard-coded, with the
 *     multi-voice code commented out above them.
 *   - **THE HEADER IS SPLIT ON THE FIRST `K:`, TEXTUALLY** — `abc.split("K:")` — so a `K:`
 *     inside a `%%text` line would cut it in the wrong place.
 *   - **`lastChord` IS THE CHORD IN FORCE WHEN THE MEASURE OPENED**, not the one inside it:
 *     it is remembered from the previous measure and only used when the opening element
 *     carries no chord of its own.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-extract-measures.mjs
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
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>')
global.document = dom.window.document
global.window = dom.window
const ABCJS = require(join(abcjsPath, 'index'))

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]

const out = {}
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    let tunes
    try {
      tunes = ABCJS.extractMeasures(abc)
    } catch (e) {
      // `extractMeasures` throws on a tune with no `K:` at all — `arr[1]` is undefined.
      // Recorded as a THROW so the port is held to the same failure.
      out[`${label}/${file.replace(/\.abc$/, '')}`] = { throws: e.message }
      continue
    }
    out[`${label}/${file.replace(/\.abc$/, '')}`] = tunes
  }
}

const outDir = join(root, 'tests', 'corpus-extract-measures')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const measures = Object.values(out).reduce(
  (n, v) => n + (Array.isArray(v) ? v.reduce((m, t) => m + t.measures.length, 0) : 0),
  0,
)
console.log(`${Object.keys(out).length} files, ${measures} measures`)
