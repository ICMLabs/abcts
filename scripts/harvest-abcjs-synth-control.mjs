/**
 * Harvest abcjs's `CreateSynthControl` — the transport bar — by RUNNING abcjs 6.7.0 into a
 * jsdom page.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * For each option shape: the markup the control writes, WHOLE (icons and the inline-styled
 * CSS warning included), and then a script of calls and clicks — `pushPlay`, `pushLoop`,
 * `setTempo`, `setWarp`, `setProgress`, `disable`, `resetAll`, and a click on each button —
 * recording after every step which handlers fired and what the parent's markup is.
 *
 * **NO AUDIO IS INVOLVED AND THAT IS THE POINT.** The control is DOM and handlers; the only
 * thing it knows about an AudioContext is that a click may have to resume one, which is
 * stubbed here as an already-running context so the handlers run synchronously.
 *
 *   node scripts/harvest-abcjs-synth-control.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="bar"></div></body></html>')
global.document = dom.window.document
global.window = dom.window
global.HTMLElement = dom.window.HTMLElement
// An AudioContext that is already running: `acResumerMiddleWare` then calls the handler
// without a resume, so a click is synchronous and the log is deterministic.
const ac = { state: 'running', resume: () => Promise.resolve(), close: () => {} }
global.AudioContext = function () { return ac }

const ABCJS = require(join(root, config.abcjsRef, 'index'))
ABCJS.synth.registerAudioContext(ac)

/** THE SHAPES, duplicated verbatim in `tests/synth-control.test.ts`. */
const SHAPES = [
  ['bare', {}],
  ['play', { play: true }],
  ['all', { play: true, loop: true, restart: true, progress: true, warp: true }],
  ['no-clock', { play: true, hasClock: false }],
  ['titles', { play: true, loop: true, playTitle: 'Go', repeatTitle: 'Again', bpm: 'beats' }],
  ['promise', { playPromise: true, progress: true }],
]

const out = {}
for (const [label, shape] of SHAPES) {
  const parent = dom.window.document.getElementById('bar')
  parent.innerHTML = ''
  const fired = []
  const options = { hasClock: shape.hasClock }
  if (shape.play) options.playHandler = () => fired.push('play')
  if (shape.playPromise) options.playPromiseHandler = () => { fired.push('playPromise'); return Promise.resolve() }
  if (shape.loop) options.loopHandler = () => fired.push('loop')
  if (shape.restart) options.restartHandler = () => fired.push('restart')
  if (shape.progress) options.progressHandler = () => fired.push('progress')
  if (shape.warp) options.warpHandler = () => fired.push('warp')
  for (const key of ['playTitle', 'repeatTitle', 'bpm']) if (shape[key]) options[key] = shape[key]

  const control = new ABCJS.synth.CreateSynthControl(parent, options)
  const log = []
  const snap = (step) => log.push([step, parent.innerHTML, [...fired]])
  snap('built')
  control.pushPlay(true); snap('pushPlay true')
  control.pushLoop(true); snap('pushLoop true')
  control.setTempo(123.6); snap('setTempo')
  /**
   * ⚠️ `setWarp` DOES NOT NULL-CHECK where `setTempo` does — with no warp input it throws
   * `Cannot set properties of null`. Recorded as a step of its own, because a port that
   * guards it is a port that differs.
   */
  try { control.setWarp(90, 133.4); snap('setWarp') } catch (e) { log.push(['setWarp threw', parent.innerHTML, [...fired]]) }
  control.setProgress(0.5, 61000); snap('setProgress')
  control.disable(true); snap('disable true')
  control.disable(false); snap('disable false')
  control.resetAll(); snap('resetAll')
  for (const [selector, event] of [
    ['.abcjs-midi-start', 'click'],
    ['.abcjs-midi-loop', 'click'],
    ['.abcjs-midi-reset', 'click'],
    ['.abcjs-midi-progress-background', 'click'],
    ['.abcjs-midi-tempo', 'change'],
  ]) {
    const el = parent.querySelector(selector)
    if (el) el.dispatchEvent(new dom.window.Event(event))
    snap(`${event} ${selector}`)
  }
  out[label] = log
}

const dir = join(root, 'tests', 'corpus-synth-control')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} shapes, ${Object.values(out).reduce((n, v) => n + v.length, 0)} steps`)
