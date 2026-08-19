/**
 * Harvest abcjs's `tuneMetrics` — each measure's MINIMUM width — by RUNNING abcjs 6.7.0
 * over every fixture of both corpora.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * Per tune, the `sections` array whole: each section's `left`, its `measureWidths` and its
 * `total`. Those come from a layout at width **0**, where every spring has collapsed and
 * the rods are all that is left (`engraver-controller.js:139-170`).
 *
 * ⚠️ **IT RENDERS — through `EngraverController` — so it needs `dump-svg.js`'s `getBBox`
 * STUB.** A chord symbol or a lyric widens a measure, and their widths come from text
 * measurement.
 *
 *   node scripts/harvest-abcjs-tune-metrics.mjs
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
const charWidths = require(join(tools, 'dump-elements-char-widths.js'))

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

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
const orig = dom.window.document.createElementNS.bind(dom.window.document)
dom.window.document.createElementNS = (ns, tag) => {
  const el = orig(ns, tag)
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
          const t = tspan.textContent || ''
          if (t.length > 0) {
            w = Math.max(w, calcWidth(t, fontSize, fontWeight))
            nonEmpty += 1
          }
        }
        if (nonEmpty > 1) h = h + (nonEmpty - 1) * fontSize * 1.2
      } else w = calcWidth(el.textContent || '', fontSize, fontWeight)
      return { x: 0, y: 0, width: w, height: h }
    }
  }
  return el
}
global.document = dom.window.document
global.window = dom.window

const ABCJS = require(join(root, config.abcjsRef, 'index'))

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.corpus)],
]

const out = {}
let tunes = 0
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort().filter((f) => f.endsWith('.abc'))) {
    const abc = readFileSync(join(dir, file), 'utf-8')
    let metrics = []
    try {
      metrics = ABCJS.tuneMetrics(abc, {})
    } catch (e) {
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    metrics.forEach((m, i) => {
      tunes += 1
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = m.sections
    })
  }
}

const dir = join(root, 'tests', 'corpus-tune-metrics')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'golden.json'), `${JSON.stringify(out)}\n`)
const sections = Object.values(out).reduce((n, v) => n + v.length, 0)
const measures = Object.values(out).reduce(
  (n, v) => n + v.reduce((m, s) => m + s.measureWidths.length, 0),
  0,
)
console.log(`${tunes} tunes, ${sections} sections, ${measures} measures`)
