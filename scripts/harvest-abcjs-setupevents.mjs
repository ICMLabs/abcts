/**
 * Harvest abcjs's `tune.setupEvents(startingDelay, timeDivider, startingBpm, warp)` —
 * `setTiming`'s WALK with the four numbers it computes handed in instead.
 *
 * ── WHY IT NEEDS ITS OWN ORACLE ─────────────────────────────────────────────
 * The timing gate already holds `setTiming`'s answer at zero, but `setTiming` only ever
 * calls this with the four values IT computed. A host calling `setupEvents` directly picks
 * its own — and the `timeDivider` in particular is a parameter abcjs uses until the first
 * tempo change and then RECOMPUTES from the running bpm (`abc_tune.js:438`, `:471`), so an
 * unusual one governs part of the run and not the rest. Nothing but a gate can say we do
 * the same.
 *
 * Three parameter sets per tune: the canonical one `setTiming` would use, a HALVED
 * `timeDivider` — which turned out to be a DEAD parameter, overwritten before the first
 * element is read (`abc_tune.js:459`) — and a delayed start with a warp.
 *
 * ── THE COLUMNS ─────────────────────────────────────────────────────────────
 * Every field of a timing row except `elements`, which is a DOM node per drawn glyph and
 * cannot cross a process boundary; its LENGTH is kept instead, because that is what a host
 * counts. `line`, `top`, `height`, `left`, `width`, `startChar`, `endChar` and the two
 * ARRAYS are the geometry a playback cursor draws with, and none of them was in the timing
 * oracle abcjs's own suite provides.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-setupevents.mjs
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

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const files = readdirSync(dir)
  .sort()
  .filter((f) => f.endsWith('.abc') && /^abcjs-synth-(timing|flattener)/.test(f))

const out = {}
for (const file of files) {
  const abc = readFileSync(join(dir, file), 'utf-8')
  let tunes
  try {
    tunes = ABCJS.renderAbc(['*'], abc, {})
  } catch (e) {
    console.error(`SKIPPED ${file}: ${e.message}`)
    continue
  }
  const tune = tunes[0]
  if (!tune) continue
  // The canonical four, exactly as `setTiming(undefined, 0)` computes them.
  const bpm = tune.getBpm()
  const beatLength = tune.getBeatLength()
  const beatsPerSecond = bpm / 60
  const divider = beatLength * beatsPerSecond
  const sets = [
    ['canonical', 0, divider, bpm, 1],
    ['half-divider', 0, divider / 2, bpm, 1],
    ['delayed-warped', 1.5, divider, bpm, 2],
  ]
  for (const [label, delay, timeDivider, startingBpm, warp] of sets) {
    const rows = tune.setupEvents(delay, timeDivider, startingBpm, warp)
    out[`${file.replace(/\.abc$/, '')}#${label}`] = rows.map((r) => [
      r.milliseconds,
      r.millisecondsPerMeasure,
      r.measureNumber ?? null,
      r.line ?? null,
      r.top ?? null,
      r.height ?? null,
      r.left ?? null,
      r.width ?? null,
      r.startChar ?? null,
      r.endChar ?? null,
      r.startCharArray ?? null,
      r.endCharArray ?? null,
      r.measureStart ?? null,
      r.type,
      // `elements` is a DOM node per drawn glyph — the one column that cannot cross a
      // process boundary. Its LENGTH is kept, which is what a host counts.
      (r.elements ?? []).length,
    ])
  }
}

const outDir = join(root, 'tests', 'corpus-setupevents')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} cases, ${rows} rows`)
