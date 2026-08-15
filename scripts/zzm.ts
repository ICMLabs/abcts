import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const abc = readFileSync(`tests/corpus-abcjs/fixtures/${process.env.ABCTS_FIX}.abc`, 'utf8')
writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[Number(process.env.ABCTS_TUNE ?? 0)]?.svg ?? '')
