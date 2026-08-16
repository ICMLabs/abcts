// Every strTranspose case that differs from abcjs -> /tmp/abcts-transpose.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '../src/parser/parser.js'
import { strTranspose } from '../src/str/transpose.js'
const G = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-transpose', 'golden.json'), 'utf-8'),
) as { slug: string; abc: string; steps: number; expected: string }[]
const bad: string[] = []
for (const c of G) {
  const p = parse(c.abc, { mode: 'abcjs-strict' })
  const got = p.ok ? strTranspose(c.abc, p.scores, c.steps) : ''
  if (got !== c.expected) {
    bad.push(`${c.slug}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(c.expected)}`)
  }
}
writeFileSync('/tmp/abcts-transpose.txt', `${bad.length} of ${G.length} differ\n\n${bad.join('\n')}\n`)
console.log(`${bad.length} of ${G.length} differ`)
