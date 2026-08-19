/**
 * Harvest abcjs's `synth.sequence` — the INTERMEDIATE between the parse tree and the midi
 * event list — by RUNNING abcjs 6.7.0 over every fixture of both corpora.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * `sequence(tune, options)` walks `tune.lines[].staff[].voices[]` — the very elements a
 * host reads — unrolls the repeats, and hands back one array per voice of REDUCED copies:
 * `{el_type: 'note', timing, duration, pitches, …}` with the parse element itself under
 * `elem`, and `instrument` / `tempo` / `key` / `meter` / `beat` / `transpose` rows spliced
 * in where the state changes. `flatten` then turns that into the `{cmd: 'note'}` tracks the
 * audio gate already holds.
 *
 * **`elem` IS STRIPPED HERE.** It is the original object, so it makes the structure cyclic
 * and carries the whole engraving besides; what is comparable is the ROW, and the row's
 * `elem` is joined by position rather than by value.
 *
 * ⚠️ **AND IT MUTATES THE TUNE** — `setDynamics` writes volumes onto the elements it walks
 * — so every fixture is parsed fresh.
 *
 *   node scripts/harvest-abcjs-sequence.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
// A headless render still walks a DOM, so the page is jsdom's — with `dump-svg.js`'s
// `getBBox` stub, without which abcjs lays a tune out 1.78px differently.
const { JSDOM } = require('jsdom')
process.env.DEBUG_TOOLS = process.env.DEBUG_TOOLS ?? join(root, config.goldens, '..')
const patch = require('/tmp/gp/bbox-stub.js')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>')
patch(dom.window.document)
global.document = dom.window.document
global.window = dom.window
const ABCJS = require(join(root, config.abcjsRef, 'index'))

/** One row, `elem` dropped and the arrays reduced to what a host reads off them. */
const row = (el) => {
  const out = { el_type: el.el_type }
  for (const key of Object.keys(el).sort()) {
    if (key === 'el_type' || key === 'elem') continue
    out[key] = el[key]
  }
  return out
}

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const out = {}
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.abc')) continue
  const abc = readFileSync(join(dir, file), 'utf-8')
  let voices
  try {
    // **RENDERED, NOT PARSED.** `parseOnly` never engraves, so its pitches carry no
    // `highestVert` and no `averagepitch`; a host reaching for `sequence` has rendered
    // (that is what `SynthController` does), and `"*"` is abcjs's own headless render.
    const tune = ABCJS.renderAbc(['*'], abc, {})[0]
    voices = ABCJS.synth.sequence(tune, {})
  } catch (e) {
    console.error(`SKIPPED ${file}: ${e.message}`)
    continue
  }
  out[file.replace(/\.abc$/, '')] = voices.map((v) => v.map(row))
}

const outDir = join(root, 'tests', 'corpus-sequence')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.reduce((m, x) => m + x.length, 0), 0)
console.log(`${Object.keys(out).length} tunes, ${Object.values(out).reduce((n, v) => n + v.length, 0)} voices, ${rows} rows`)
