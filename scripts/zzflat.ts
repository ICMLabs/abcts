/** Our flattened note events for one fixture's tunes, to diff against abcjs's. */
import { readFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'

const abc = readFileSync(process.env.F ?? '', 'utf-8')
const n = abc.split(/^X:/m).length - 1
const out = renderAbc(Array.from({ length: n }, () => '*'), abc, { staffwidth: 670 })
for (const i of (process.env.T ?? '0').split(',').map(Number)) {
  const tune = out[i] as unknown as { setUpAudio: (o?: unknown) => { tracks: unknown[][] } }
  const audio = tune.setUpAudio({})
  console.log(`--- tune${i}`)
  for (const t of audio.tracks)
    for (const e of t as { cmd?: string }[]) if (e.cmd === 'note') console.log('   ', JSON.stringify(e))
}
