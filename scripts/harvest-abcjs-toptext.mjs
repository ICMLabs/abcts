/**
 * Harvest abcjs's `topText.rows` and `bottomText.rows` — THE INTERMEDIATE ROW LIST the page
 * cursor walks — over both corpora, by RUNNING abcjs 6.7.0.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * `new TopText(metaText, metaTextInfo, formatting, lines, width, isPrint, paddingLeft,
 * spacing, shouldAddClasses, getTextSize)` builds `this.rows`, an array interleaving
 * `{move: n}` rows with `{left, text, font, klass, anchor, startChar, endChar, absElemType,
 * name}` rows (`write/creation/elements/top-text.js`, `bottom-text.js`), and `nonMusic`
 * walks it spending each `move` on the page's own cursor (`draw/non-music.js`). It is
 * abcjs's INTERMEDIATE shape rather than its answer, which is why it is a projection here
 * and not a feature.
 *
 * ── WHY IT NEEDS A RENDER ───────────────────────────────────────────────────
 * `engraver-controller.js:222` builds it, so a parse-only run has neither. That means
 * jsdom, and jsdom implements `getBBox` for nothing — so `dump-svg.js`'s text-metric stub
 * is lifted here, exactly as `harvest-abcjs-selection.mjs` lifts it. Without it any
 * `%%…font … box` in a fixture kills the run.
 *
 * ⚠️ **AND ITS `y` PARTS COMPANY WITH A BROWSER ON 46 TEXT ELEMENTS.** That table's
 * `fontHeights` has SEVEN entries — the sizes abcjs's DEFAULTS resolve to — and anything
 * else falls through to `size + 2` where a browser gives about `size × 1.108`. Our engine
 * reproduces the fallback ON PURPOSE (`GOLDEN_TEXT_HEIGHTS`), so nothing here is
 * inconsistent; what is true is that a tune setting a size outside
 * {15,16,17,19,20,21,27} has a page a browser would draw differently, in every corpus here.
 *
 * ── THE PARAMS ──────────────────────────────────────────────────────────────
 * `{staffwidth: 670}`, the width every golden in both corpora is generated at — and NOT the
 * bare `{}`, because abcjs's own screen default is 740 (`engraver-controller.js:52-60`).
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-toptext.mjs
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
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    tunes.forEach((tune, i) => {
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = {
        topText: tune.topText?.rows ?? null,
        bottomText: tune.bottomText?.rows ?? null,
      }
    })
  }
}

const outDir = join(root, 'tests', 'corpus-toptext')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce(
  (n, v) => n + (v.topText?.length ?? 0) + (v.bottomText?.length ?? 0),
  0,
)
console.log(`${Object.keys(out).length} tunes, ${rows} rows`)
