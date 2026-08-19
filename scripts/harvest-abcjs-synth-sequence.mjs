/**
 * Harvest abcjs's `SynthSequence` — the little builder `playEvent` is made of — by RUNNING
 * abcjs 6.7.0 through a fixed script of calls and recording what it built.
 *
 * No DOM and no audio: `synth-sequence.js` is arithmetic over arrays, which is exactly why
 * it can be compared to the field where the four that DO make sound cannot.
 *
 *   node scripts/harvest-abcjs-synth-sequence.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const SynthSequence = require(join(root, config.abcjsRef, 'src/synth/synth-sequence.js'))

/** THE SCRIPT, duplicated verbatim in `tests/synth-sequence.test.ts`. */
const script = (seq) => {
  const log = []
  const snap = (label) =>
    log.push([label, JSON.parse(JSON.stringify(seq.tracks)), seq.totalDuration, [...seq.starts], [...seq.currentInstrument]])
  snap('empty')
  const a = seq.addTrack()
  snap(`addTrack -> ${a}`)
  seq.setInstrument(a, 40)
  snap('setInstrument 40')
  seq.appendNote(a, 60, 0.25, 105)
  snap('appendNote 60')
  seq.appendNote(a, 62, 0.125, 90, 50)
  snap('appendNote 62 with cents')
  seq.appendNote(a, 64, 1 / 64, 80, 0)
  snap('appendNote 64 with cents 0')
  const b = seq.addTrack()
  snap(`addTrack -> ${b}`)
  seq.appendNote(b, 48, 0.5, 70)
  snap('appendNote on the untouched track')
  seq.setInstrument(b, 0)
  seq.appendNote(b, 50, 0.75, 60)
  snap('second track past the first')
  return log
}

const out = script(new SynthSequence())
const dir = join(root, 'tests', 'corpus-synth-sequence')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${out.length} steps`)
