/**
 * A scratch differential for `/tmp/gp/ledger.abc` — our RENDERED value reduction against
 * abcjs's, plus the flattened audio, for shapes neither corpus writes.
 */
import { readFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
import { valuesOfTune } from '../tests/parse-values-script.js'

const abc = readFileSync(process.env.F ?? '/tmp/gp/ledger.abc', 'utf-8')
const n = abc.split(/^X:/m).length - 1
const ours = renderAbc(Array.from({ length: n }, () => '*'), abc, { staffwidth: 670 })
ours.forEach((t, i) => {
  console.log(`--- tune${i}`)
  for (const [k, v] of valuesOfTune(t as Parameters<typeof valuesOfTune>[0]))
    if (k.includes('/v')) console.log('   ', k, v.slice(0, 220))
})
