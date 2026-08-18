// Every `topText.rows` / `bottomText.rows` row that differs from abcjs
//   -> /tmp/abcts-toptext.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'

type Rows = Record<string, unknown>[] | null
const G = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-toptext', 'golden.json'), 'utf-8'),
) as Record<string, { topText: Rows; bottomText: Rows }>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')

const out: string[] = []
let rows = 0
let differ = 0
const byKind = new Map<string, number>()
const only = process.env.ONLY
for (const [key, want] of Object.entries(G)) {
  if (only !== undefined && key !== only) continue
  const corpus = key.slice(0, key.indexOf('/'))
  const rest = key.slice(key.indexOf('/') + 1)
  const at = rest.lastIndexOf('-tune')
  const n = Number(rest.slice(at + 5))
  const abc = readFileSync(join(corpus === 'sib' ? SIB : REP, `${rest.slice(0, at)}.abc`), 'utf-8')
  const slots: string[] = []
  for (let k = 0; k <= n; k++) slots.push('*')
  let tune
  try {
    tune = renderAbc(slots, abc, { staffwidth: 670 })[n]
  } catch {
    /* a render failure shows as every row missing */
  }
  for (const which of ['topText', 'bottomText'] as const) {
    const wantRows = want[which] ?? []
    const gotRows = (tune?.[which]?.rows ?? []) as Record<string, unknown>[]
    const n2 = Math.max(wantRows.length, gotRows.length)
    rows += n2
    for (let i = 0; i < n2; i++) {
      const a = JSON.stringify(wantRows[i])
      const b = JSON.stringify(gotRows[i])
      if (a === b) continue
      differ += 1
      const kind =
        wantRows[i] === undefined
          ? `${which} EXTRA`
          : gotRows[i] === undefined
            ? `${which} MISSING`
            : `${which} ${Object.keys(wantRows[i] ?? {}).sort().join(',')}`
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
      if (out.length < 30) out.push(`${key} ${which}[${i}]\n  abcjs ${a}\n  ours  ${b}`)
    }
  }
}
writeFileSync(
  '/tmp/abcts-toptext.txt',
  [
    `${differ} of ${rows} rows differ`,
    '',
    ...[...byKind.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${String(v).padStart(5)}  ${k}`),
    '',
    ...out,
  ].join('\n') + '\n',
)
console.log(`${differ} of ${rows} rows differ`)
console.log([...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join('\n'))
