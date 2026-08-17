// Every `metaText` field that differs from abcjs -> /tmp/abcts-metatext.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'

const G = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-metatext', 'golden.json'), 'utf-8'),
) as Record<string, Record<string, unknown>>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')

const out: string[] = []
let rows = 0
let differ = 0
const byField = new Map<string, number>()
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
    got = (renderAbc(slots, abc, {})[n]?.metaText ?? {}) as Record<string, unknown>
  } catch {
    /* a render failure shows as every field missing */
  }
  const fields = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort()
  rows += fields.length
  for (const f of fields) {
    if (JSON.stringify(want[f]) === JSON.stringify(got[f])) continue
    differ += 1
    byField.set(f, (byField.get(f) ?? 0) + 1)
    if (out.length < 40)
      out.push(
        `${key} ${f}\n  abcjs ${JSON.stringify(want[f])}\n  ours  ${JSON.stringify(got[f])}`,
      )
  }
}
writeFileSync(
  '/tmp/abcts-metatext.txt',
  [
    `${differ} of ${rows} fields differ`,
    '',
    ...[...byField.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${String(n).padStart(5)}  ${f}`),
    '',
    ...out,
  ].join('\n') + '\n',
)
console.log(`${differ} of ${rows} fields differ`)
console.log([...byField.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`).join('\n'))
