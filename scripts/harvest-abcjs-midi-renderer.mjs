/**
 * Harvest abcjs's `midiRenderer` — the MIDI file writer, driven DIRECTLY — by RUNNING
 * abcjs 6.7.0 through a fixed script of calls.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * `getData()` after every call: the whole percent-encoded `data:audio/midi,` string. That
 * is the writer's entire observable output, so comparing it after each step says exactly
 * which call diverged — a track header, a pitch wheel, a duration, a text event.
 *
 * No DOM and no audio: the renderer is string arithmetic, which is why this one can be
 * compared to the byte where the four sound-making symbols cannot.
 *
 *   node scripts/harvest-abcjs-midi-renderer.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const midiRenderer = require(join(root, config.abcjsRef, 'src/synth/abc_midi_renderer.js'))

/** THE SCRIPT, duplicated verbatim in `tests/midi-renderer.test.ts`. */
const script = (make) => {
  const log = []
  const run = (label, fn) => {
    const midi = fn()
    log.push([label, midi.getData()])
  }

  // A bare tempo track, which is `setTempo`'s whole job.
  run('setTempo alone', () => {
    const m = make()
    m.setTempo(120)
    return m
  })
  // …and it only fires on the FIRST track.
  run('setTempo twice', () => {
    const m = make()
    m.setTempo(120)
    m.setTempo(90)
    return m
  })
  run('setGlobalInfo', () => {
    const m = make()
    m.setGlobalInfo(144, 'A tune', { accidentals: [{ acc: 'sharp' }, { acc: 'sharp' }], mode: '' }, { num: 3, den: 4 })
    return m
  })
  run('setGlobalInfo minor and flats', () => {
    const m = make()
    m.setGlobalInfo(60, 'Flat', { accidentals: [{ acc: 'flat' }, { acc: 'flat' }, { acc: 'flat' }], mode: 'm' }, { num: 4, den: 4 })
    return m
  })
  run('one note', () => {
    const m = make()
    m.setGlobalInfo(120, '', { accidentals: [] }, { num: 4, den: 4 })
    m.startTrack()
    m.setChannel(0)
    m.setInstrument(40)
    m.startNote(60, 105)
    m.addRest(0.25)
    m.endNote(60)
    m.endTrack()
    return m
  })
  run('rests, text and a second track', () => {
    const m = make()
    m.setGlobalInfo(120, '', { accidentals: [] }, { num: 4, den: 4 })
    m.startTrack()
    m.setText('name', 'Voice one')
    m.setChannel(1, 0.5)
    m.setInstrument(0)
    m.addRest(0.5)
    m.startNote(72, 95)
    m.addRest(0.125)
    m.endNote(72)
    m.addRest(-3)
    m.endTrack()
    m.startTrack()
    m.setChannel(10, -1)
    m.startNote(38, 80)
    m.addRest(1)
    m.endNote(38)
    m.endTrack()
    return m
  })
  // A MICROTONE bends the pitch wheel and bends it back at the note's end.
  run('cents', () => {
    const m = make()
    m.setGlobalInfo(120, '', { accidentals: [] }, { num: 4, den: 4 })
    m.startTrack()
    m.setChannel(0)
    m.startNote(61, 100, 50)
    m.addRest(0.25)
    m.endNote(61)
    m.startNote(63, 100, -50)
    m.addRest(0.25)
    m.endNote(63)
    m.endTrack()
    return m
  })
  // A meter with no entry in abcjs's clock table writes NO time signature at all.
  run('7/8 has no clock', () => {
    const m = make()
    m.setGlobalInfo(120, '', { accidentals: [] }, { num: 7, den: 8 })
    return m
  })
  return log
}

const out = script(() => midiRenderer())
const dir = join(root, 'tests', 'corpus-midi-renderer')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${out.length} steps`)
