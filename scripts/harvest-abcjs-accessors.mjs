/**
 * Harvest every NUMERIC accessor of abcjs's tune object, for both corpora, by RUNNING abcjs
 * — the oracle `tests/accessors.test.ts` reads (`tests/corpus-accessors/golden.json`).
 *
 *     beatLength  barLength  beatsPerMeasure  bpm  pickupLength
 *     msPerMeasure  msPerMeasure120  totalTime  totalBeats
 *
 * `totalTime` and `totalBeats` exist only after `setTiming(0, 0)` (`abc_tune.js:614-621`).
 * The render asks for one output SLOT per tune, as `dump-svg.js` does, because `renderAbc`
 * renders one tune per slot; the page is the goldens' own `{staffwidth: 670}` under
 * `dump-svg.js`'s text metrics (`scripts/bbox-stub.cjs`).
 *
 * This used to be `/tmp/gp/accessors.js`, a scratchpad script that `/tmp` cleaning deleted
 * — so the oracle could not follow a corpus re-harvest (2026-09-22) and a renamed fixture
 * took the whole gate down with an ENOENT. A gate that cannot be regenerated stops growing
 * with the corpus; this is its harvester, in the repo.
 *
 *   node scripts/harvest-abcjs-accessors.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const tools = join(root, config.goldens, '..')
const require = createRequire(join(tools, 'package.json'))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
require(join(root, 'scripts', 'bbox-stub.cjs'))(dom.window.document, tools)
global.document = dom.window.document
global.window = dom.window
const ABCJS = require(join(root, config.abcjsRef, 'index'))
const { TuneBook } = require(join(root, config.abcjsRef, 'src/api/abc_tunebook.js'))

const corpora = [
  ['sib', join(tools, 'fixtures')],
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
]

const num = (v) => (typeof v === 'number' ? v : null)
const out = {}
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    const count = new TuneBook(abc).tunes.length
    for (let i = 0; i < count; i += 1) {
      const slots = []
      for (let k = 0; k <= i; k += 1) {
        const div = dom.window.document.createElement('div')
        dom.window.document.body.appendChild(div)
        slots.push(div)
      }
      let tune
      try {
        tune = ABCJS.renderAbc(slots, abc, { staffwidth: 670 })[i]
        tune.setTiming(0, 0)
      } catch {
        continue
      }
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = {
        beatLength: num(tune.getBeatLength()),
        barLength: num(tune.getBarLength()),
        beatsPerMeasure: num(tune.getBeatsPerMeasure()),
        bpm: num(tune.getBpm()),
        pickupLength: num(tune.getPickupLength()),
        msPerMeasure: num(tune.millisecondsPerMeasure()),
        msPerMeasure120: num(tune.millisecondsPerMeasure(120)),
        totalTime: num(tune.getTotalTime()),
        totalBeats: num(tune.getTotalBeats()),
      }
      for (const div of slots) div.remove()
    }
  }
}

const outDir = join(root, 'tests', 'corpus-accessors')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} rows`)
