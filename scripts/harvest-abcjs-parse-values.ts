/**
 * Harvest THE VALUES of every element of a `parseOnly` tune, by RUNNING abcjs 6.7.0 over
 * both corpora. See `tests/parse-values-script.ts` for what is reduced and why.
 *
 * ⚠️ Nothing renders, so there is no `document` to stub — that is the point of the file.
 *
 *   npx tsx scripts/harvest-abcjs-parse-values.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { valuesOfTune } from '../tests/parse-values-script.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const ABCJS = require(join(root, config.abcjsRef, 'index'))

const corpora: [string, string][] = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]

const out: Record<string, Record<string, string>> = {}
let rows = 0
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    let tunes: unknown[]
    try {
      tunes = ABCJS.parseOnly(abc) as unknown[]
    } catch {
      // A tune abcjs itself cannot parse has no oracle — a fact about the tune, and the
      // gate counts what it has rather than pretending.
      continue
    }
    tunes.forEach((tune, i) => {
      const slug = `${label}/${file.replace(/\.abc$/, '')}-tune${i}`
      const map = valuesOfTune(tune as Parameters<typeof valuesOfTune>[0])
      if (map.size === 0) return
      out[slug] = Object.fromEntries(map)
      rows += map.size
    })
  }
}
const dest = join(root, 'tests', 'corpus-parse-values')
mkdirSync(dest, { recursive: true })
writeFileSync(join(dest, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${Object.keys(out).length} tunes, ${rows} elements`)
