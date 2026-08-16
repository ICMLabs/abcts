// Every character where our getElementFromChar disagrees with abcjs -> /tmp/abcts-lines.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { elementFromChar, linesOf } from '../src/compat/lines.js'
import { parse } from '../src/parser/parser.js'
const G = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-lines', 'golden.json'), 'utf-8'),
) as Record<string, [number, string, number, number][]>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')
const rows: string[] = []
let ok = 0, total = 0
for (const [key, want] of Object.entries(G)) {
  if (key.startsWith('sib/S7-voices')) continue
  const corpus = key.slice(0, key.indexOf('/')), rest = key.slice(key.indexOf('/') + 1)
  const at = rest.lastIndexOf('-tune')
  const abc = readFileSync(join(corpus === 'sib' ? SIB : REP, `${rest.slice(0, at)}.abc`), 'utf-8')
  const p = parse(abc, { mode: 'abcjs-strict' })
  const score = p.ok ? p.scores[Number(rest.slice(at + 5))] : undefined
  if (score === undefined) continue
  const lines = linesOf(score, abc)
  const wanted = new Map(want.map((w) => [w[0], w]))
  const bad: string[] = []
  for (let c = 0; c < abc.length; c += 1) {
    const w = wanted.get(c)
    const g = elementFromChar(lines, c)
    total += 1
    const same = w === undefined ? g === null : g !== null && g.el_type === w[1] && g.startChar === w[2] && g.endChar === w[3]
    if (same) ok += 1
    else if (bad.length < 6) {
      bad.push(`  char ${c} (${JSON.stringify(abc[c])}) abcjs ${w ? `${w[1]} ${w[2]}..${w[3]}` : 'null'} ours ${g ? `${g.el_type} ${g.startChar}..${g.endChar}` : 'null'}`)
    }
  }
  if (bad.length > 0) rows.push(`${key}\n${bad.join('\n')}`)
}
writeFileSync('/tmp/abcts-lines.txt', `${rows.length} tunes differ; ${ok} of ${total} characters agree\n\n${rows.join('\n')}\n`)
console.log(`${rows.length} tunes differ; ${ok} of ${total} characters agree`)
