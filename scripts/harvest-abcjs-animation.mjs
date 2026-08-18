/**
 * Harvest abcjs's `startAnimation` — the CURSOR as it is actually drawn — by RUNNING abcjs
 * 6.7.0 into a jsdom page with its clock replaced.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * After each animation frame: the cursor element's `left`/`top`/`width`/`height` and the
 * COUNT of elements the run has hidden. Those are the two things `abc_animation.js` does —
 * move a `<div>` and set `display: none` on the measures before or after the one playing
 * (`api/abc_animation.js`) — and both are DOM state a host can see.
 *
 * ── HOW IT IS DRIVEN ────────────────────────────────────────────────────────
 * `startAnimation` keeps its `TimingCallbacks` module-private, so the timer cannot be
 * driven directly. `requestAnimationFrame` is stubbed to CAPTURE the callback instead, and
 * this file calls it with a fixed 16ms sequence — which is the same trick as the timing
 * gate, one level up.
 *
 * Three option shapes: a bare cursor, `hideFinishedMeasures`, and `hideCurrentMeasure`.
 * `add_classes` is on because the measure selectors are `.abcjs-l<line>.abcjs-m<measure>`.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-animation.mjs
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

let clock = 0
let framed = null
global.requestAnimationFrame = (fn) => {
  framed = fn
  return 0
}
global.setTimeout = () => 0
global.clearTimeout = () => {}
global.performance = { now: () => clock }

const ABCJS = require(join(abcjsPath, 'index'))

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const files = readdirSync(dir)
  .sort()
  .filter((f) => f.endsWith('.abc') && /^abcjs-synth-(timing-0|flattener-0)/.test(f))

const SHAPES = [
  ['cursor', { showCursor: true }],
  ['hide-finished', { showCursor: true, hideFinishedMeasures: true }],
  ['hide-current', { showCursor: true, hideCurrentMeasure: true }],
]

const out = {}
for (const file of files) {
  const abc = readFileSync(join(dir, file), 'utf-8')
  for (const [label, options] of SHAPES) {
    const paper = dom.window.document.getElementById('paper')
    paper.innerHTML = ''
    paper.removeAttribute('style')
    let tune
    try {
      tune = ABCJS.renderAbc('paper', abc, { add_classes: true })[0]
    } catch (e) {
      console.error(`SKIPPED ${file}: ${e.message}`)
      break
    }
    if (!tune) break
    clock = 0
    framed = null
    ABCJS.stopAnimation()
    ABCJS.startAnimation(paper, tune, options)
    const log = []
    const hidden = () => paper.querySelectorAll('[style*="display: none"]').length
    /**
     * ⚠️ **THE FIRST FRAME CANNOT BE 0.** `doTiming` opens with
     * `if (self.lastTimestamp === timestamp) return` and `lastTimestamp` starts at 0
     * (`abc_timing_callbacks.js:114-118`), so a drive starting at zero returns before it
     * registers the next frame and the animation never begins. A browser's
     * `requestAnimationFrame` timestamp is never 0 either.
     */
    for (let t = 16; t <= 20000; t += 16) {
      clock = t
      const fn = framed
      framed = null
      if (!fn) break
      fn(t)
      const c = paper.querySelector('.abcjs-cursor')
      log.push([
        t,
        c ? [c.style.left, c.style.top, c.style.width, c.style.height] : null,
        hidden(),
      ])
    }
    // Only the frames where something CHANGED — the cursor sits still between events and a
    // per-frame log is thousands of identical rows.
    const changes = log.filter(
      (row, i) => i === 0 || JSON.stringify(row.slice(1)) !== JSON.stringify(log[i - 1].slice(1)),
    )
    out[`${file.replace(/\.abc$/, '')}#${label}`] = changes
  }
}

const outDir = join(root, 'tests', 'corpus-animation')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} cases, ${rows} frames with a change`)
