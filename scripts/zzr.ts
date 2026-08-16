// An IN-REPO corpus fixture rendered like the byte gate -> /tmp/ours.svg
//   S=<slug> [T=<tune>] npx tsx scripts/zzr.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { numberOfTunes, renderAbc } from '../src/compat/index.js'
const dir = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')
const abc = readFileSync(join(dir, `${process.env.S}.abc`), 'utf8')
const out = renderAbc(new Array<string>(numberOfTunes(abc)).fill('*'), abc, { staffwidth: 670 })
writeFileSync('/tmp/ours.svg', out[Number(process.env.T ?? 0)]?.svg ?? '')
