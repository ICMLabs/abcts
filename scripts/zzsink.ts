// What the EMITTER records for a `selectTypes: true` render, against abcjs's 221.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '../src/parser/parser.js'
import { layout } from '../src/renderer/layout.js'
import { type SelectableRecord, toSVG } from '../src/renderer/svg.js'
import { STAFF_SPACE_PX } from '../src/renderer/abcjs-constants.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as any[]
const c = G.find((x) => x.slug === (process.env.ONLY ?? 'selection-multiple'))!
const selectables: SelectableRecord[] = []
toSVG(layout(parse(c.abc, { mode: 'abcjs-strict' }).scores[0]!, { mode: 'abcjs-strict' }), {
  staffSpace: STAFF_SPACE_PX, classes: 'abcjs', selectTypes: c.options.selectTypes ?? undefined, selectables,
})
const n = new Map<string, number>()
for (const r of selectables) n.set(r.element?.type ?? r.kind, (n.get(r.element?.type ?? r.kind) ?? 0) + 1)
console.log(`${selectables.length} recorded, abcjs has ${c.rows.length}`)
console.log([...n].sort().map(([k, v]) => `  ${k} ${v}`).join('\n'))
// The non-element records, against abcjs's row at the same index.
for (const r of selectables) {
  if (r.element !== undefined) continue
  const want = c.rows[r.index]?.abcEl
  const got = (r as any).abcelem
  const same = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${same ? 'OK  ' : 'DIFF'} [${r.index}] ${r.kind}\n     abcjs ${JSON.stringify(want)}\n     ours  ${JSON.stringify(got)}`)
}
