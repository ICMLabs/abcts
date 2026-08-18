// Every `formatting` row that differs from abcjs -> /tmp/abcts-formatting.txt
//
// The oracle is /tmp/gp/mti.js, which PARSES with abcjs rather than rendering — the field
// spans are a parse product, and rendering a boxed font under JSDOM dies on `getBBox`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'

const G = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-formatting', 'golden.json'), 'utf-8'),
) as Record<string, Record<string, unknown>>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')

const out: string[] = []
const byKey = new Map<string, number>()
let rows = 0
let differ = 0
for (const [key, want] of Object.entries(G)) {
  const corpus = key.slice(0, key.indexOf('/'))
  const rest = key.slice(key.indexOf('/') + 1)
  const at = rest.lastIndexOf('-tune')
  const n = Number(rest.slice(at + 5))
  const abc = readFileSync(join(corpus === 'sib' ? SIB : REP, `${rest.slice(0, at)}.abc`), 'utf-8')
  const slots: string[] = []
  for (let k = 0; k <= n; k++) slots.push('*')
  let got: Record<string, unknown> = {}
  try {
    got = (renderAbc(slots, abc, {})[n]?.formatting ?? {}) as Record<string, unknown>
  } catch {
    /* a render failure is its own row below */
  }
  const fields = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort()
  const bad = fields.filter((f) => JSON.stringify(want[f]) !== JSON.stringify(got[f]))
  for (const f of bad) byKey.set(f, (byKey.get(f) ?? 0) + 1)
  rows += fields.length
  differ += bad.length
  if (bad.length > 0)
    out.push(
      `${key}\n${bad
        .map((f) => `  ${f}: abcjs ${JSON.stringify(want[f])} ours ${JSON.stringify(got[f])}`)
        .join('\n')}`,
    )
}
writeFileSync(
  '/tmp/abcts-formatting.txt',
  [
    `${differ} of ${rows} settings differ, ${out.length} tunes`,
    '',
    ...[...byKey.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${String(n).padStart(5)}  ${k}`),
    '',
    ...out.slice(0, 25),
  ].join('\n') + '\n',
)
console.log(`${differ} of ${rows} settings differ, ${out.length} tunes`)
console.log([...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n} ${k}`).join('\n'))
