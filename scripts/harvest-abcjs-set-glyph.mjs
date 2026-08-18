/**
 * Harvest abcjs's `setGlyph` — a host REPLACING an outline — by RUNNING abcjs 6.7.0 with
 * one glyph swapped and dumping the SVG it then draws.
 *
 * ── WHAT IT PROVES ──────────────────────────────────────────────────────────
 * abcjs's table IS its drawing data, so `glyphs[name] = path` changes both the INK and the
 * WIDTH the layout spaces by (`write/creation/glyphs.js:221`). Ours keeps a joined path
 * string and a DERIVED ink box, so an override has to reproduce both halves — and the only
 * check that can say it does is the whole SVG, byte for byte, which is the gate this feeds.
 *
 * Two swaps: a WIDER notehead (every note's rod grows, so the spacing moves) and a
 * NARROWER one, on the same three fixtures at `{staffwidth: 670}` — the width every golden
 * in both corpora is made at.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-set-glyph.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/** A plain rectangle, so the swap is unmistakable in the markup and easy to state. */
const box = (w, h) => ({
  d: [
    ['M', 0, -h / 2],
    ['l', w, 0],
    ['l', 0, h],
    ['l', -w, 0],
    ['z'],
  ],
  w,
  h,
})

const SWAPS = [
  ['wide', 'noteheads.quarter', box(18, 6)],
  ['narrow', 'noteheads.quarter', box(4, 3)],
]
const FIXTURES = [
  'abcjs-synth-flattener-01-crescendo-efga-gab-crescendo-c-diminuend',
  'abcjs-visual-layout-04-score-s-a',
  'abcts-keywarn',
]

const out = {}
for (const [label, name, glyph] of SWAPS) {
  ABCJS.setGlyph(name, glyph)
  for (const file of FIXTURES) {
    const abc = readFileSync(
      join(root, 'tests', 'corpus-abcjs', 'fixtures', `${file}.abc`),
      'utf-8',
    )
    const paper = dom.window.document.getElementById('paper')
    paper.innerHTML = ''
    ABCJS.renderAbc('paper', abc, { staffwidth: 670 })
    out[`${file}#${label}`] = paper.innerHTML
  }
}

const outDir = join(root, 'tests', 'corpus-set-glyph')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} renders`)
