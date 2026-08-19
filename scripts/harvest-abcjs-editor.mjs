/**
 * Harvest abcjs's `Editor` — THE TEXTAREA BINDING, DRIVEN — by RUNNING abcjs 6.7.0 into a
 * jsdom page with its clock replaced.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * After every step: what a host can SEE of the page. The rendered markup's LENGTH and its
 * group count (the bytes themselves are gated by `svg-bytes`, twice over); WHICH element
 * groups the selection has painted, by their position in document order; the textarea's
 * class and `readonly`; its selection; `isDirty()`; the warnings div; and the two
 * callbacks' own log.
 *
 * ── HOW IT IS DRIVEN ────────────────────────────────────────────────────────
 * **`setTimeout` IS STUBBED TO CAPTURE, NOT TO SCHEDULE**, the same trick the animation
 * gate plays on `requestAnimationFrame`: `Editor.fireChanged` debounces its re-render by
 * 300ms (`abc_editor.js:392-400`), so the harness holds the pending callback and calls it
 * where a step says to. That makes the two steps a burst of typing really has — the text
 * changed, and then 300ms later the render — separately observable.
 *
 * The FOURTEEN STEPS are literal, text-agnostic and duplicated verbatim in
 * `tests/editor.test.ts`. They are a session at the keyboard: select, type, wait, go
 * read-only, pause, set the string outright, change a param, and click in the score.
 *
 * ⚠️ **AND IT RENDERS, SO IT NEEDS `dump-svg.js`'s `getBBox` STUB.** Without it abcjs lays
 * a tune out 1.78px differently and every geometry-derived column is uniformly wrong —
 * the trap `setupevents`'s first harvest paid for.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-editor.mjs
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

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><textarea id="abc"></textarea><div id="paper"></div><div id="warn"></div></body></html>',
)
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

// The debounce, HELD rather than scheduled — see the note at the top.
let pending = null
global.setTimeout = (fn) => {
  pending = fn
  return 1
}
global.clearTimeout = () => {
  pending = null
}
const runTimer = () => {
  const fn = pending
  pending = null
  if (fn) fn()
}

const ABCJS = require(join(abcjsPath, 'index'))

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const files = readdirSync(dir)
  .sort()
  .filter(
    (f) =>
      f.endsWith('.abc') &&
      /^abcjs-(parse-note|visual-selection|visual-mouse-click|visual-title-0[1-3]|parse-book_parser-0[1-5])/.test(f),
  )

const out = {}
for (const file of files) {
  const abc = readFileSync(join(dir, file), 'utf-8')
  const ta = dom.window.document.getElementById('abc')
  const paper = dom.window.document.getElementById('paper')
  const warn = dom.window.document.getElementById('warn')
  ta.value = abc
  ta.className = ''
  ta.removeAttribute('readonly')
  paper.innerHTML = ''
  warn.innerHTML = ''
  pending = null

  const log = []
  let changes = 0
  let lastSelection = null
  const editor = new ABCJS.Editor('abc', {
    paper_id: 'paper',
    warnings_id: 'warn',
    indicate_changed: true,
    onchange: () => {
      changes += 1
    },
    selectionChangeCallback: (start, end) => {
      lastSelection = [start, end]
    },
  })

  const record = (label) => {
    const groups = Array.from(paper.querySelectorAll('g[data-name]'))
    log.push([
      label,
      paper.innerHTML.length,
      groups.length,
      groups
        .map((g, i) => ((g.getAttribute('class') || '').indexOf('abcjs-note_selected') >= 0 ? i : -1))
        .filter((i) => i >= 0),
      ta.className,
      ta.getAttribute('readonly'),
      ta.selectionStart,
      ta.selectionEnd,
      editor.isDirty(),
      warn.innerHTML,
      changes,
      lastSelection,
    ])
  }
  const select = (start, end) => {
    ta.selectionStart = start
    ta.selectionEnd = end
    editor.fireSelectionChanged()
  }

  // ── THE FOURTEEN STEPS, duplicated verbatim in `tests/editor.test.ts` ──────
  record('construct')
  select(0, abc.length)
  record('select-all')
  select(Math.floor(abc.length / 2), Math.floor(abc.length / 2) + 2)
  record('select-mid')
  select(Math.floor(abc.length / 2), Math.floor(abc.length / 2))
  record('caret')
  ta.value = `${abc}|CDEF|\n`
  editor.fireChanged()
  record('typed')
  runTimer()
  record('debounced')
  editor.setReadOnly(true)
  record('read-only-on')
  editor.setReadOnly(false)
  record('read-only-off')
  editor.setNotDirty()
  record('not-dirty')
  editor.pause(true)
  ta.value = `${ta.value}z`
  editor.fireChanged()
  record('paused-typing')
  editor.pause(false)
  runTimer()
  record('resumed')
  editor.editarea.setString(abc)
  runTimer()
  record('set-string')
  editor.paramChanged({ staffwidth: 300 })
  runTimer()
  record('param-changed')
  editor.highlight({ startChar: 0, endChar: 4 })
  record('clicked')

  out[file.replace(/\.abc$/, '')] = log
}

const outDir = join(root, 'tests', 'corpus-editor')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} cases, ${rows} steps`)
