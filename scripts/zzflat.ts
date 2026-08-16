import { flattenAudio } from '../src/audio/flatten.js'
import { parse } from '../src/parser/parser.js'
const p = parse(process.env.A as string, { mode: 'abcjs-strict' })
const s = p.ok ? p.scores[0] : undefined
if (s) {
  const f = flattenAudio(s, {})
  console.log(JSON.stringify(f.tracks))
}
