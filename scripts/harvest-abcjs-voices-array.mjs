/**
 * Harvest abcjs's `tune.makeVoicesArray()` — the LAYOUT elements it hands a host — by
 * RUNNING abcjs 6.7.0 over every in-repo fixture.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * Every row of every voice, as ten columns:
 *
 *   [top, height, line, measureNumber, elem.type, elem.x, elem.w, elem.duration,
 *    elem.abcelem.startChar, elem.abcelem.endChar]
 *
 * — the row's own four (`data/abc_tune.js:428`), then the six fields of the element that
 * `addElementToEvents` reads. `elemset` is deliberately absent: abcjs's are SVG nodes and
 * ours are the `abcelem`, which is stated in `voices-array.ts` rather than compared.
 *
 * ── THE ENUMERATION ─────────────────────────────────────────────────────────
 * EVERY in-repo fixture, not the synth family the `setupEvents` gate uses — a gate's reach
 * is a property of its enumeration, and this one is about the DRAWING, where a tune with
 * no audio at all is as good a case as a tune with a repeat.
 *
 * ⚠️ **IT RENDERS, SO IT NEEDS `dump-svg.js`'s `getBBox` STUB** — without it abcjs lays a
 * tune out 1.78px differently and every geometry column is uniformly wrong.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-voices-array.mjs
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
const files = readdirSync(dir).sort().filter((f) => f.endsWith('.abc'))

const out = {}
let skipped = 0
for (const file of files) {
  const abc = readFileSync(join(dir, file), 'utf-8')
  const paper = dom.window.document.getElementById('paper')
  paper.innerHTML = ''
  let tunes
  try {
    tunes = ABCJS.renderAbc('paper', abc, {})
  } catch (e) {
    console.error(`SKIPPED ${file}: ${e.message}`)
    skipped += 1
    continue
  }
  const tune = tunes[0]
  if (!tune || !tune.makeVoicesArray) continue
  const voices = tune.makeVoicesArray()
  const rows = []
  voices.forEach((voice, v) => {
    for (const row of voice) {
      const el = row.elem
      const abcelem = el.abcelem || {}
      rows.push([
        v,
        row.top,
        row.height,
        row.line,
        row.measureNumber,
        el.type,
        el.x,
        el.w,
        el.duration === undefined ? null : el.duration,
        abcelem.startChar === undefined ? null : abcelem.startChar,
        abcelem.endChar === undefined ? null : abcelem.endChar,
      ])
    }
  })
  out[file.replace(/\.abc$/, '')] = rows
}

const outDir = join(root, 'tests', 'corpus-voices-array')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} tunes, ${rows} rows, ${skipped} skipped`)
