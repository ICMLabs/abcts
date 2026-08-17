// Our keySignature abcelem against abcjs's, by content — the rows are misaligned, so the
// gate cannot compare them yet.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as any[]
for (const c of G) {
  const want = c.rows.filter((r: any) => r.abcEl.el_type === 'keySignature').map((r: any) => JSON.stringify(r.abcEl))
  if (want.length === 0) continue
  const tune = renderAbc('*', c.abc, c.options)[0]!
  const got = tune.getSelectableArray().filter((s) => s.absEl.abcelem.el_type === 'keySignature')
    .map((s) => JSON.stringify(s.absEl.abcelem))
  console.log(c.slug)
  want.forEach((w: string, i: number) => console.log(`  ${w === got[i] ? 'MATCH' : 'diff '} abcjs ${w}\n        ours  ${got[i] ?? 'MISSING'}`))
}
