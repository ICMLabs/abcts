/**
 * Harvest abcjs's `getElementFromChar` for EVERY CHARACTER of every tune in both corpora —
 * the oracle `tests/lines.test.ts` compares against, and the one harvester the repo did not
 * have: `tests/corpus-lines/golden.json` was generated ad hoc on 2026-08-15 and could not be
 * regenerated, so **every fixture added since then was ungated on the character surface.**
 * Five were, by 2026-08-22.
 *
 * A row is `[char, el_type, startChar, endChar]` and a character abcjs answers null for has
 * no row at all, which is what makes the gate two-sided.
 *
 * ⚠️ **AND THE ENTRY POINT IS PART OF THE EXPERIMENT.** It RENDERS, because
 * `tests/lines.test.ts` builds our side with `linesOf(score, abc)` at its default
 * `engraved = true` — and **the engraver RENAMES the element it draws**, `key` and `meter`
 * becoming `keySignature` and `timeSignature`. Harvesting through `parseOnly` instead
 * rewrote 23 tunes of the committed golden with the unengraved spelling, which is the same
 * trap `synth.sequence` fell into on 2026-08-20.
 *
 *   node scripts/harvest-abcjs-lines.mjs
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

const out = {}
let rows = 0
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    let tunes
    try {
      const n = ABCJS.numberOfTunes(abc)
      const slots = []
      for (let k = 0; k < n; k += 1) slots.push('*')
      tunes = ABCJS.renderAbc(slots, abc, { staffwidth: 670 })
    } catch (e) {
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    tunes.forEach((tune, i) => {
      const found = []
      for (let c = 0; c < abc.length; c += 1) {
        const el = tune.getElementFromChar(c)
        if (el) found.push([c, el.el_type, el.startChar, el.endChar])
      }
      // …**AND A TUNE THAT MAPS NOTHING IS STILL A ROW.** `X:43\nT: example` draws no
      // staff at all, and the gate's other half — "an element abcjs does NOT have is a
      // difference too" — needs the tune present with an EMPTY list to say so. Dropping
      // the twelve such tunes would retire twelve two-sided checks silently.
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = found
      rows += found.length
    })
  }
}

const outDir = join(root, 'tests', 'corpus-lines')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out)}\n`)
console.log(`${Object.keys(out).length} tunes, ${rows} characters that map to an element`)
