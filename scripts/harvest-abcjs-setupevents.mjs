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
const charWidths = require(join(tools, 'dump-elements-char-widths.js'))

// ── `dump-svg.js`'s text metrics ──
// ⚠️ **WITHOUT THIS THE LAYOUT ITSELF IS DIFFERENT**, not merely the text. Measured on
// `synth-flattener-41`, a tune with no text at all: with the stub abcjs puts its barline
// at 161.48 and its whole rest at 99.6405, and with jsdom's missing `getBBox` at 159.6988
// and 98.7499. Every golden in both corpora was made with the stub and our own metrics
// reproduce that table, so an oracle harvested without it is a DIFFERENT ENGINE — the
// first harvest of this gate was, and its geometry columns were off by that 1.78px.
const fontHeights = { 27: 29.91, 21: 23.27, 20: 22.16, 19: 21.06, 17: 18.84, 16: 18.52, 15: 17.5 }
const calcWidth = (str, fontSize, fontWeight) => {
  if (!str) return 0
  let fontType = 'repeatfont'
  if (fontSize >= 27) fontType = 'titlefont'
  else if (fontSize >= 21) fontType = 'subtitlefont'
  else if (fontSize >= 20) fontType = 'partsfont'
  else if (fontSize >= 19) fontType = 'measurefont'
  else if (fontSize >= 17) fontType = fontWeight === 'bold' ? 'vocalfont' : 'repeatfont'
  else if (fontSize >= 16) fontType = 'gchordfont'
  const widths = charWidths[fontType] ?? charWidths.repeatfont ?? {}
  let maxWidth = 0
  for (const line of String(str).split('\n')) {
    let lineWidth = 0
    for (const ch of line) lineWidth += widths[ch] ?? 8
    if (lineWidth > maxWidth) maxWidth = lineWidth
  }
  return maxWidth
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>')
const origCreateElementNS = dom.window.document.createElementNS.bind(dom.window.document)
dom.window.document.createElementNS = (ns, tag) => {
  const el = origCreateElementNS(ns, tag)
  if (tag === 'text' || tag === 'tspan') {
    el.getBBox = () => {
      const fontSize = parseFloat(el.getAttribute('font-size')) || 16
      let fontWeight = el.getAttribute('font-weight') || 'normal'
      if (fontWeight === 'normal' && el.parentElement)
        fontWeight = el.parentElement.getAttribute('font-weight') || 'normal'
      let h = fontHeights[Math.round(fontSize)] ?? fontSize + 2
      let w = 0
      const tspans = el.querySelectorAll ? el.querySelectorAll('tspan') : []
      if (tspans.length > 0) {
        let nonEmpty = 0
        for (const tspan of tspans) {
          const ttext = tspan.textContent || ''
          if (ttext.length > 0) {
            w = Math.max(w, calcWidth(ttext, fontSize, fontWeight))
            nonEmpty += 1
          }
        }
        if (nonEmpty > 1) h = h + (nonEmpty - 1) * fontSize * 1.2
      } else {
        w = calcWidth(el.textContent || '', fontSize, fontWeight)
      }
      return { x: 0, y: 0, width: w, height: h }
    }
  }
  return el
}
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
      r.endX ?? null,
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
