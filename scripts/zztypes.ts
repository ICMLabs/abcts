// Which element types the LAYOUT walk can actually see — the reach of `selectablesOf`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '../src/parser/parser.js'
import { layout } from '../src/renderer/layout.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as { slug: string; abc: string }[]
const abc = G.find((c) => c.slug === (process.env.ONLY ?? 'selection-multiple'))!.abc
const doc = layout(parse(abc, { mode: 'abcjs-strict' }).scores[0]!, { mode: 'abcjs-strict' })
const n = new Map<string, number>()
for (const sys of doc.systems) for (const st of sys.staves) for (const v of st.voices) for (const e of v) n.set(e.type, (n.get(e.type) ?? 0) + 1)
console.log([...n].sort().map(([k, c]) => `${k} ${c}`).join('\n'))
console.log('curves:', doc.systems.reduce((t, s) => t + s.staves.reduce((u, st) => u + ((st as any).curves?.length ?? 0), 0), 0))
