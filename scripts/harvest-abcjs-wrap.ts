/**
 * Harvest abcjs's `wrap` answer — `tune.explanation` and `tune.lineBreaks` — by RUNNING
 * abcjs 6.7.0 over its OWN wrap inputs.
 *
 * ⚠️ **THE ORACLE IS WHAT abcjs DOES, NOT WHAT ITS SUITE ASSERTS.** `tests/visual/
 * wrap.test.js` carries expected literals beside each input; those are NOT copied. The
 * inputs are — pulled out of that file by EVALUATING its `var abc…` declarations, the same
 * way the audio arc took `flattener.test.js` — and every number here comes from running the
 * engine. That distinction earned itself on `strTranspose`, where abcjs's own test expects
 * something abcjs does not produce.
 *
 * ⚠️ **AND THE ROUNDING IS THE TEST'S, NOT abcjs's.** `doWrapTest` rounds `lineBreakPoint`,
 * `minLineSize` and every width to ONE DECIMAL before comparing (`wrap.test.js:296-311`).
 * The raw values carry a full double, so this records the RAW ones and the gate rounds —
 * otherwise the oracle would bake in a tolerance nobody chose.
 *
 * `wrap` needs a render (it is `renderAbc`, not `parseOnly`), so it needs jsdom and
 * `dump-svg.js`'s text-metric stub — see `harvest-abcjs-toptext.mjs`.
 *
 *   npx tsx scripts/harvest-abcjs-wrap.ts
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

// ── THE CASES: abcjs's own inputs, at the widths its own suite renders them ──
const inputs = JSON.parse(
  readFileSync(join(root, 'tests', 'corpus-wrap', 'inputs.json'), 'utf-8'),
) as Record<string, string>

/** `doWrapTest`'s own `wrap` options — the only ones abcjs's suite ever passes. */
const WRAP = { minSpacing: 1.8, maxSpacing: 2.8, preferredMeasuresPerLine: 4 }

const CASES: ReadonlyArray<readonly [slug: string, input: string, width: number]> = [
  ['short-measures-740', 'abcShortMeasures', 740],
  ['single-line-400', 'abcSingleLine', 400],
  ['single-line-500', 'abcSingleLine', 500],
  ['single-line-600', 'abcSingleLine', 600],
  ['split-by-text-500', 'abcSplitByText', 500],
  ['piano-500', 'abcPiano', 500],
  ['quartet-500', 'abcQuartet', 500],
  ['share-staff-300', 'abcVoicesShareStaff', 300],
  // …and the three widths the suite does NOT render, because a wrap that only ever ran at
  // one width is a control that cannot move. 300 forces more breaks than any case above.
  ['piano-300', 'abcPiano', 300],
  ['quartet-740', 'abcQuartet', 740],
  ['split-by-text-300', 'abcSplitByText', 300],
]

const out: Record<string, unknown> = {}
let rows = 0
for (const [slug, name, staffwidth] of CASES) {
  const abc = inputs[name]
  if (abc === undefined) throw new Error(`no input ${name}`)
  // ⚠️ **A REAL TARGET, NOT `'*'`.** `renderEngine`'s headless slot skips the DOM work the
  // wrap search is folded into, so `'*'` comes back with `explanation: []` and no
  // `lineBreaks` at all — a silent empty answer rather than an error. abcjs's own suite
  // renders into `"paper"`, and so does this.
  document.querySelector('#paper').innerHTML = ''
  const tunes = ABCJS.renderAbc('paper', abc, { staffwidth, wrap: WRAP })
  const tune = tunes[0]
  // ⚠️ **`attempts` IS DROPPED, AS abcjs'S OWN TEST DROPS IT** (`wrap.test.js:297`) — it is
  // the search's working list, not its answer, and it carries a row per try.
  const explanation = (tune.explanation ?? []).map((line: Record<string, unknown>) => {
    const { attempts, ...rest } = line
    void attempts
    return rest
  })
  // …**AND THE DRAWING ITSELF**, because the two published fields can be exact while the
  // music is not re-lined at all — which is precisely what this engine did until the
  // `startsSystem` rewrite landed: `explanation` and `lineBreaks` byte-perfect and ONE
  // system drawn where abcjs draws four.
  const svg = document.querySelector('#paper svg')?.outerHTML ?? ''
  out[slug] = { abc, staffwidth, explanation, lineBreaks: tune.lineBreaks ?? null, svg }
  rows += explanation.length + (tune.lineBreaks?.length ?? 0)
}

mkdirSync(join(root, 'tests', 'corpus-wrap'), { recursive: true })
writeFileSync(
  join(root, 'tests', 'corpus-wrap', 'golden.json'),
  `${JSON.stringify(out, null, 1)}\n`,
)
console.log(`${CASES.length} cases, ${rows} rows`)
