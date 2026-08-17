// Every `metaTextInfo` row that differs from abcjs -> /tmp/abcts-metatextinfo.txt
//
// The oracle is /tmp/gp/mti.js, which PARSES with abcjs rather than rendering — the field
// spans are a parse product, and rendering a boxed font under JSDOM dies on `getBBox`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'

type Info = { startChar: number; endChar: number }
const G = JSON.parse(readFileSync('/tmp/abcts-mti-abcjs.json', 'utf-8')) as Record<
  string,
  Record<string, Info>
>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')

const out: string[] = []
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
  let got: Record<string, Info> = {}
  try {
    got = (renderAbc(slots, abc, {})[n]?.metaTextInfo ?? {}) as Record<string, Info>
  } catch {
    /* a render failure is its own row below */
  }
  const fields = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort()
  const bad = fields.filter(
    (f) => want[f]?.startChar !== got[f]?.startChar || want[f]?.endChar !== got[f]?.endChar,
  )
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
  '/tmp/abcts-metatextinfo.txt',
  `${differ} of ${rows} rows differ, ${out.length} tunes\n\n${out.join('\n')}\n`,
)
console.log(`${differ} of ${rows} rows differ, ${out.length} tunes`)
