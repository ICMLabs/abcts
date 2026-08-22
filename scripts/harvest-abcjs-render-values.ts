/**
 * Harvest THE VALUES of every line, staff and element of a RENDERED tune, by RUNNING
 * abcjs 6.7.0 over both corpora. The reduction is `tests/parse-values-script.ts`'s own —
 * a SHARED SCRIPT, never a copy — and what differs is the ENTRY POINT.
 *
 * ⚠️ **AND THE ENTRY POINT IS PART OF THE EXPERIMENT.** `parse-values` compares a
 * `parseOnly` tune and rules this one out on purpose, because the parser's answer and the
 * engraver's are different answers: the engraver RENAMES elements, stamps `averagepitch`,
 * `verticalPos` and `printer_shift` as it walks what was drawn, hangs a `nonMusic` block on
 * every text line and a `staffGroup` on every music one. None of that exists before a
 * render, and no other gate in this repo compares the OBJECT a render hands back — the byte
 * gate compares its SVG and the selectable array its indices.
 *
 * It needs a render, so it needs jsdom and `dump-svg.js`'s text-metric stub — see
 * `harvest-abcjs-toptext.mjs`, whose preamble this is, and its note about the seven sizes.
 *
 *   npx tsx scripts/harvest-abcjs-render-values.ts
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

// ── `dump-svg.js`'s text metrics, so this sees what every golden was made with ──
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

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]


// …and the reduction is imported AFTER the DOM is stubbed, because the compat entry point
// it shares a file with reaches for `document` at load.
const { valuesOfTune } = await import('../tests/parse-values-script.js')

const out = {}
let rows = 0
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    const n = ABCJS.numberOfTunes(abc)
    const slots = []
    for (let k = 0; k < n; k += 1) slots.push('*')
    let tunes
    try {
      tunes = ABCJS.renderAbc(slots, abc, { staffwidth: 670 })
    } catch (e) {
      // A tune abcjs itself cannot render has no oracle — a fact about the tune, and the
      // gate counts what it has rather than pretending.
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    tunes.forEach((tune, i) => {
      const map = valuesOfTune(tune)
      if (map.size === 0) return
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = Object.fromEntries(map)
      rows += map.size
    })
  }
}

const outDir = join(root, 'tests', 'corpus-render-values')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} tunes, ${rows} rows`)
