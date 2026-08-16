import { readFileSync } from 'node:fs'
import { setTiming } from '../src/audio/timing.js'
import { parse } from '../src/parser/parser.js'
const p = parse(readFileSync(process.env.F as string, 'utf8'), { mode: 'abcjs-strict' })
const s = p.ok ? p.scores[Number(process.env.T ?? 0)] : undefined
if (s) console.log(JSON.stringify(setTiming(s, {}).map((r) => [r.type, r.milliseconds])))
