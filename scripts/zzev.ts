import { readFileSync } from 'node:fs'
import { ratToNumber } from '../src/core/model.js'
import { parse } from '../src/parser/parser.js'
const p = parse(readFileSync(process.env.F as string, 'utf8'), { mode: 'abcjs-strict' })
const s = p.ok ? p.scores[Number(process.env.T ?? 0)] : undefined
s?.voices.forEach((v, i) =>
  console.log(
    'V' + i,
    JSON.stringify(
      v.measures.map((m) => m.events.map((e) => [e.type, ratToNumber(e.duration), (e as { kind?: string }).kind ?? ''])),
    ),
  ),
)
