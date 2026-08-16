// Every selectable row that differs, counted BY FIELD -> /tmp/abcts-selection.txt
//
//   npx tsx scripts/zzsel.ts            every case
//   ONLY=selection-none npx tsx …       one, which is what makes the table readable:
//                                       a case whose rows are MISALIGNED (we emit fewer
//                                       than abcjs) reports every field of every row.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as any[]
const same = (a: any, b: any): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const sorted = (v: any): any => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v
const out: string[] = []
const fieldCount = new Map<string, number>()
for (const c of G) {
  if (process.env.ONLY !== undefined && c.slug !== process.env.ONLY) continue
  const tune = renderAbc('*', c.abc, c.options)[0]!
  if (c.audio) tune.setUpAudio()
  const ours = tune.getSelectableArray()
  c.rows.forEach((want: any, i: number) => {
    const got = ours[i]
    const mine = got === undefined ? undefined : {
      draggable: got.isDraggable,
      svgEl: Object.fromEntries(got.svgEl.attributes.map((a) => [a.nodeName, a.nodeValue])),
      abcEl: got.absEl.abcelem as any,
    }
    if (mine !== undefined && same(mine, want)) return
    if (mine === undefined) { fieldCount.set('MISSING ROW', (fieldCount.get('MISSING ROW') ?? 0) + 1); return }
    const keys = new Set([...Object.keys(want.abcEl), ...Object.keys(mine.abcEl)])
    const bad: string[] = []
    for (const k of keys) if (!same((want.abcEl as any)[k], (mine.abcEl as any)[k])) {
      bad.push(k)
      fieldCount.set(`${want.abcEl.el_type}.${k}`, (fieldCount.get(`${want.abcEl.el_type}.${k}`) ?? 0) + 1)
    }
    if (!same(want.draggable, mine.draggable)) { bad.push('draggable'); fieldCount.set('draggable', (fieldCount.get('draggable') ?? 0) + 1) }
    if (!same(want.svgEl, mine.svgEl)) { bad.push('svgEl'); fieldCount.set('svgEl', (fieldCount.get('svgEl') ?? 0) + 1) }
    if (out.length < 40) out.push(`${c.slug}[${i}] ${bad.join(',')}\n  abcjs ${JSON.stringify(want)}\n  ours  ${JSON.stringify(mine)}`)
  })
}
writeFileSync('/tmp/abcts-selection.txt',
  [...[...fieldCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${String(n).padStart(5)}  ${k}`), '', ...out].join('\n') + '\n')
console.log([...fieldCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join('\n'))
