// The 41-FIXTURE SIBLING corpus, one tune -> /tmp/ours.svg. `S=<slug> T=<n>`.
import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const abc = readFileSync(`../abcMusicKit/Tools/abcjs-debug/fixtures/${process.env.S}.abc`, 'utf8')
writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[Number(process.env.T ?? 0)]?.svg ?? '')
