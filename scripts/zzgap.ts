import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as any[]
const c = G.find((x) => x.slug === (process.env.ONLY ?? 'selection-multiple'))!
const want = new Map<string, number>(), got = new Map<string, number>()
for (const r of c.rows) want.set(r.abcEl.el_type, (want.get(r.abcEl.el_type) ?? 0) + 1)
const tune = renderAbc('*', c.abc, c.options)[0]!
for (const s of tune.getSelectableArray()) {
  const t = (s.absEl.abcelem as { el_type: string }).el_type
  got.set(t, (got.get(t) ?? 0) + 1)
}
for (const k of [...new Set([...want.keys(), ...got.keys()])].sort())
  console.log(`${(want.get(k) ?? 0) === (got.get(k) ?? 0) ? '   ' : '-> '}${k.padEnd(18)} abcjs ${want.get(k) ?? 0}  ours ${got.get(k) ?? 0}`)
