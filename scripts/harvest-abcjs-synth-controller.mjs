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
 *   node scripts/harvest-abcjs-synth-controller.mjs
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

/** THE BUFFER STUB, duplicated verbatim in `tests/synth-controller.test.ts`. */
let bufLog = []
const makeBuffer = () => ({
  duration: 12.5,
  init: (options) => {
    bufLog.push(['init', options.millisecondsPerMeasure, JSON.stringify(options.options)])
    return Promise.resolve({ status: 'ok', loaded: ['a'] })
  },
  prime: () => { bufLog.push(['prime']); return Promise.resolve({ status: 'primed' }) },
  start: () => bufLog.push(['start']),
  pause: () => bufLog.push(['pause']),
  seek: (position, units) => bufLog.push(['seek', position, units ?? null]),
  finished: () => bufLog.push(['finished']),
  stop: () => bufLog.push(['stop']),
  download: () => { bufLog.push(['download']); return 'blob:stub' },
})

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

/** THE CASES, duplicated verbatim in the test. */
const CASES = [
  ['all', { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true }, 'full'],
  ['no-control', null, 'full'],
  ['no-cursor', { displayLoop: true, displayPlay: true }, null],
  ['subdivisions', {}, 'subdivided'],
]
const FIXTURES = [
  'abcjs-synth-flattener-09-d-defg-q-1-2-90-defg',
  'abcjs-synth-flattener-12-chords-meter-change',
]

const cursorFor = (kind, log) => {
  if (kind === null) return null
  const cc = {
    onReady: () => log.push(['onReady']),
    onStart: () => log.push(['onStart']),
    onFinished: () => log.push(['onFinished']),
    onBeat: (beat, total, totalTime, position) =>
      log.push(['onBeat', beat, total, totalTime, position ? [position.left ?? null, position.top ?? null] : null]),
    onEvent: (e) => log.push(['onEvent', e ? (e.milliseconds ?? null) : null]),
    onLineEnd: (lineEvent, leftEvent) =>
      log.push(['onLineEnd', lineEvent ? (lineEvent.milliseconds ?? null) : null, leftEvent ? (leftEvent.milliseconds ?? null) : null]),
  }
  if (kind === 'subdivided') {
    cc.beatSubdivisions = 4
    cc.extraMeasuresAtBeginning = 1
    cc.lineEndAnticipation = 50
  }
  return cc
}

/** The transport bar as the CONTROLLER drives it — not its markup, which its own gate holds. */
const controlState = (parent) => {
  const q = (s) => parent.querySelector(s)
  const cls = (s, name) => { const el = q(s); return el ? el.classList.contains(name) : null }
  const html = (s) => { const el = q(s); return el ? el.innerHTML : null }
  return [
    cls('.abcjs-inline-audio', 'abcjs-disabled'),
    cls('.abcjs-midi-start', 'abcjs-pushed'),
    cls('.abcjs-midi-loop', 'abcjs-pushed'),
    html('.abcjs-midi-clock'),
    html('.abcjs-midi-current-tempo'),
    q('.abcjs-midi-tempo') ? q('.abcjs-midi-tempo').value : null,
    q('.abcjs-midi-progress-indicator') ? q('.abcjs-midi-progress-indicator').style.left : null,
  ]
}

const state = (c) => [
  c.isStarted, c.isLoaded, c.isLoading, c.isLooping, c.warp,
  c.percent === undefined ? null : c.percent,
  c.currentTempo,
  c.timer ? [c.timer.lastMoment, c.timer.totalBeats] : null,
]

/** The fake progress-bar click: 60px into a bar whose box starts at 10 and is 200 wide. */
const CLICK = {
  x: 60,
  target: {
    classList: { contains: () => false },
    parentNode: null,
    getBoundingClientRect: () => ({ left: 10 }),
    offsetWidth: 200,
  },
}

/** THE SCRIPT, duplicated verbatim in the test. */
const drive = async (make, tune, visualOptions, cursorKind, parent) => {
  parent.innerHTML = ''
  bufLog = []
  const cursorLog = []
  const log = []
  const c = make()
  const snap = (step) => log.push([step, bufLog.splice(0), cursorLog.splice(0), controlState(parent), state(c)])
  const step = async (label, fn) => {
    try { snap(`${label}${(await fn()) ?? ''}`) } catch (e) { snap(`${label} threw: ${e.message}`) }
  }

  snap('new')
  if (visualOptions !== null) {
    c.load('#bar', cursorFor(cursorKind, cursorLog), visualOptions)
    snap(`load ${JSON.stringify(visualOptions)}`)
  }
  await step('setTune passive -> ', async () => JSON.stringify(await c.setTune(tune, false, {})))
  await step('setTune userAction -> ', async () => JSON.stringify(await c.setTune(tune, true, { chordsOff: true })))
  await step('play -> ', async () => JSON.stringify(await c.play()))
  c.beatCallback(2, 8, 4000, { left: 5, top: 6, height: 7 })
  snap('beatCallback')
  c.eventCallback({ type: 'event', milliseconds: 100, startChar: 3 })
  snap('eventCallback event')
  c.lineEndCallback({ milliseconds: 50 }, { type: 'event', milliseconds: 20 })
  snap('lineEndCallback')
  snap(`eventCallback null -> ${c.eventCallback(null)}`)
  await step('play again -> ', async () => JSON.stringify(await c.play()))
  c.toggleLoop()
  snap('toggleLoop')
  c.restart()
  snap('restart')
  c.seek(0.25)
  snap('seek 0.25')
  c.seek(3, 'seconds')
  snap('seek 3 seconds')
  await step('randomAccess -> ', async () => JSON.stringify(await c.randomAccess(CLICK)))
  await step('onWarp 50', async () => { await c.onWarp({ target: { value: '50' } }) })
  snap(`eventCallback null looping -> ${c.eventCallback(null)}`)
  c.toggleLoop()
  c.pause()
  snap('pause')
  snap(`getUrl -> ${c.getUrl()}`)
  try { c.download('x.wav'); snap('download') } catch (e) { snap(`download threw: ${e.message}`) }
  c.destroy()
  snap('destroy')
  c.disable(true)
  snap('disable true')
  return log
}

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
}

const outDir = join(root, 'tests', 'corpus-synth-controller')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} cases, ${Object.values(out).reduce((n, v) => n + v.length, 0)} steps`)
