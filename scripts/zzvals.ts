/** Our RENDERED value reduction for one file — the same rows `render-values` compares. */
import { readFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
import { valuesOfTune } from '../tests/parse-values-script.js'
const abc = readFileSync(process.env.F ?? '', 'utf-8')
const n = abc.split(/^X:/m).length - 1
const ours = renderAbc(Array.from({ length: n }, () => '*'), abc, { staffwidth: 670 })
ours.forEach((t, i) => {
  if (process.env.T !== undefined && Number(process.env.T) !== i) return
  console.log(`--- tune${i}`)
  for (const [k, v] of valuesOfTune(t as Parameters<typeof valuesOfTune>[0]))
    console.log('   ', k, v.slice(0, 200))
})
