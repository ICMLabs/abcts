/**
 * Harvest abcjs's `TimingCallbacks` — the CURSOR's own event stream — by RUNNING abcjs
 * 6.7.0 with its clock replaced.
 *
 * ── WHY IT IS PORTABLE AT ALL ───────────────────────────────────────────────
 * abcjs's own tests for this drive a REAL timer and `sleep()`, which the 2026-08-09 audit
 * classified as host playback and unportable. The class itself is not: `doTiming(timestamp)`
 * is public and takes the time as an argument (`api/abc_timing_callbacks.js:113`), and the
 * only other host calls are `requestAnimationFrame`, `setTimeout` and `performance.now()`.
 * Stub those three and the whole 436 lines become a pure function of a timestamp sequence —
 * so this drives it at a fixed 16ms and records every callback in order.
 *
 * **THAT MAKES IT AN ORACLE FOR THE STATE MACHINE, NOT FOR THE TIMER.** What a host cannot
 * be given is when the browser fires; what it CAN be held to is which beat, which event and
 * which line-end are reported at a given time, and with what arguments.
 *
 * ── THE FOUR SHAPES ─────────────────────────────────────────────────────────
 * The defaults; `beatSubdivisions: 2` (twice as many beat callbacks, at half-beats);
 * `qpm: 120` (the host's own tempo, which WARPS the tune's rather than replacing it); and
 * a `lineEndCallback` with a 100ms anticipation, which is the only one that reads the
 * GEOMETRY — `getLineEndTimings` groups by `timing.top`.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-timing-callbacks.mjs
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

// ── `dump-svg.js`'s text metrics: WITHOUT THEM THE LAYOUT ITSELF DIFFERS ──
// See `harvest-abcjs-setupevents.mjs`; the cursor's `left`/`top` come from that layout.
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

// ── THE CLOCK, REPLACED ──
// `requestAnimationFrame` and `setTimeout` are what abcjs uses to call itself; this file
// calls `doTiming` directly instead, so both become no-ops. `performance.now()` is read by
// `start`, `pause` and `setProgress`, and it answers the LAST timestamp driven.
let clock = 0
global.requestAnimationFrame = () => 0
global.cancelAnimationFrame = () => {}
const realSetTimeout = global.setTimeout
global.setTimeout = () => 0
global.clearTimeout = () => {}
global.performance = { now: () => clock }
dom.window.requestAnimationFrame = global.requestAnimationFrame
dom.window.setTimeout = global.setTimeout

const ABCJS = require(join(abcjsPath, 'index'))
const TimingCallbacks = require(join(abcjsPath, 'src/api/abc_timing_callbacks'))

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const files = readdirSync(dir)
  .sort()
  .filter((f) => f.endsWith('.abc') && /^abcjs-synth-(timing|flattener-(0|1))/.test(f))

/** Reduce a timing row to what a cursor uses, so the golden is readable. */
const ev = (e) =>
  e === null || e === undefined
    ? null
    : [e.type, e.milliseconds, e.startChar ?? null, e.left ?? null, e.top ?? null]

const SHAPES = [
  ['default', {}],
  ['subdivisions-2', { beatSubdivisions: 2 }],
  ['qpm-120', { qpm: 120 }],
  ['line-end', { lineEndAnticipation: 100 }],
]

const out = {}
for (const file of files) {
  const abc = readFileSync(join(dir, file), 'utf-8')
  let tune
  try {
    tune = ABCJS.renderAbc(['*'], abc, {})[0]
  } catch (e) {
    console.error(`SKIPPED ${file}: ${e.message}`)
    continue
  }
  if (!tune) continue
  for (const [label, params] of SHAPES) {
    const log = []
    const options = {
      ...params,
      eventCallback: (e) => {
        log.push(['event', ev(e)])
        return undefined
      },
      beatCallback: (beat, total, lastMoment, position, debug) => {
        log.push([
          'beat',
          beat,
          total,
          lastMoment,
          position ? [position.left ?? null, position.top ?? null, position.height ?? null] : null,
        ])
      },
    }
    if (label === 'line-end')
      options.lineEndCallback = (info, leftEvent, extra) => {
        log.push([
          'lineEnd',
          info ? [info.measureNumber, info.milliseconds, info.top, info.bottom] : null,
          ev(leftEvent),
          extra ? extra.line : null,
        ])
      }
    clock = 0
    let timing
    try {
      timing = new TimingCallbacks(tune, options)
    } catch (e) {
      out[`${file.replace(/\.abc$/, '')}#${label}`] = { throws: e.message }
      continue
    }
    timing.start()
    /**
     * 16ms is the animation frame abcjs's own comment names, and the drive stops one frame
     * PAST the last moment — `stop()` is reached through a PROMISE
     * (`shouldStop(promise).then(…)`), so `isRunning` is still true when the last callback
     * has already fired and driving on records thousands of repeats of the final beat.
     */
    const until = Math.min(timing.lastMoment + 32, 60000)
    for (let t = 0; t <= until; t += 16) {
      clock = t
      timing.doTiming(t)
    }
    out[`${file.replace(/\.abc$/, '')}#${label}`] = log
  }
}

global.setTimeout = realSetTimeout
const outDir = join(root, 'tests', 'corpus-timing-callbacks')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0)
console.log(`${Object.keys(out).length} cases, ${rows} callbacks`)
