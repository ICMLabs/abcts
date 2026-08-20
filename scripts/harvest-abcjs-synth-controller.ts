/**
 * Harvest abcjs's `SynthController` — the transport STATE MACHINE — by RUNNING abcjs 6.7.0
 * with the one class it needs and we have not built REPLACED BY A RECORDER.
 *
 * ── WHY IT IS GATEABLE BEFORE `CreateSynth` EXISTS ──────────────────────────
 * `SynthController` makes no sound. It decides WHEN: it builds the transport bar, drives
 * `TimingCallbacks`, and calls nine methods on a `CreateSynth` — `init`, `prime`, `start`,
 * `pause`, `seek`, `finished`, `stop`, `download`, and reads `duration`. Replace that class
 * on BOTH sides with a stub that records those calls and the whole state machine becomes
 * comparable: the CALL SEQUENCE into the buffer, the transport bar's own state, the
 * `cursorControl` callbacks, and the controller's fields after every step.
 *
 * abcjs's copy is replaced through `require.cache` — the entry for
 * `src/synth/create-synth.js` is installed BEFORE `index.js` is required, so its own
 * `require('./create-synth')` finds the stub. Ours takes a factory argument.
 *
 * ── THE CLOCK, REPLACED ─────────────────────────────────────────────────────
 * As in `harvest-abcjs-timing-callbacks.mjs`: `requestAnimationFrame`, `setTimeout` and
 * `performance.now()` are stubbed, so `timer.start()` sets the state machine going without
 * a single frame ever firing. What is recorded is what the CONTROLLER did, not what a
 * browser would have played.
 *
 * ⚠️ **AND IT RENDERS, SO IT NEEDS `dump-svg.js`'s `getBBox` STUB** — the tune the
 * controller is handed is a rendered one, and without the stub abcjs lays it out 1.78px
 * differently.
 *
 * ⚠️ **THE SCRIPT IS A SHARED FILE NOW** — `tests/synth-controller-script.ts`, imported by
 * this harvester and by `tests/synth-controller.test.ts`. It was duplicated in both, each
 * copy labelled "verbatim", which is a promise a comment cannot keep. That is why this is
 * a `.ts` run through `tsx`, as `harvest-abcjs-create-synth.ts` already was:
 *
 *   npx tsx scripts/harvest-abcjs-synth-controller.ts
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

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="bar"></div><div id="paper"></div></body></html>')
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
global.HTMLElement = dom.window.HTMLElement
// jsdom has no `URL.revokeObjectURL`; `download()` calls it last, and without this the
// gate would record a jsdom message rather than what the controller did.
dom.window.URL.revokeObjectURL = () => {}

global.requestAnimationFrame = () => 0
global.cancelAnimationFrame = () => {}
global.setTimeout = () => 0
global.clearTimeout = () => {}
global.performance = { now: () => 0 }
dom.window.requestAnimationFrame = global.requestAnimationFrame
dom.window.setTimeout = global.setTimeout

// An AudioContext that is already running, so `resume()` is a resolved promise and the
// whole chain runs on microtasks.
const ac = { state: 'running', resume: () => Promise.resolve(), close: () => {} }
global.AudioContext = function () { return ac }

import {
  CASES,
  drive,
  driveLoading,
  FIXTURES,
  makeBuffer,
} from "../tests/synth-controller-script.js";

// ── THE SEAM: abcjs's `CreateSynth`, replaced before `index.js` loads it ──
const createSynthPath = require.resolve(join(abcjsPath, 'src/synth/create-synth.js'))
require.cache[createSynthPath] = {
  id: createSynthPath,
  filename: createSynthPath,
  loaded: true,
  paths: [],
  exports: function CreateSynthStub() { return makeBuffer() },
}

const ABCJS = require(join(abcjsPath, 'index'))
ABCJS.synth.registerAudioContext(ac)

const dir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const out = {}
for (const fixture of FIXTURES) {
  const abc = readFileSync(join(dir, `${fixture}.abc`), 'utf-8')
  const tune = ABCJS.renderAbc(['paper'], abc, {})[0]
  for (const [label, visualOptions, cursorKind] of CASES) {
    const parent = dom.window.document.getElementById('bar')
    out[`${fixture}#${label}`] = await drive(
      () => new ABCJS.synth.SynthController(),
      tune,
      visualOptions,
      cursorKind,
      parent,
    )
  }
  out[`${fixture}#loading`] = await driveLoading(
    () => new ABCJS.synth.SynthController(),
    tune,
    dom.window.document.getElementById('bar'),
  )
}

const outDir = join(root, 'tests', 'corpus-synth-controller')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} cases, ${Object.values(out).reduce((n, v) => n + v.length, 0)} steps`)
