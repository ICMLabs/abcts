// Render an arbitrary .abc file exactly as the byte gates do -> /tmp/ours.svg
//   F=<path> npx tsx scripts/zzt.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const abc = readFileSync(process.env.F ?? '', 'utf8')
const out = renderAbc('paper', abc, { staffwidth: 670 })
writeFileSync('/tmp/ours.svg', out[Number(process.env.T ?? 0)]?.svg ?? '')
