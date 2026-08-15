// The in-repo corpus, rendered exactly as the byte gate renders it -> /tmp/ours.svg
//   ABCTS_FIX=<slug> [ABCTS_TUNE=n] npx tsx scripts/zzpr.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const abc = readFileSync(`tests/corpus-abcjs/fixtures/${process.env.ABCTS_FIX}.abc`, 'utf8')
const out = renderAbc('paper', abc, { staffwidth: 670 })
writeFileSync('/tmp/ours.svg', out[Number(process.env.ABCTS_TUNE ?? 0)]?.svg ?? '')
