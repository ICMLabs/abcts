import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const F = '../abcMusicKit/Tools/abcjs-debug/fixtures'
const abc = readFileSync(`${F}/${process.env.S}.abc`, 'utf8')
writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[Number(process.env.T ?? 0)]?.svg ?? '')
