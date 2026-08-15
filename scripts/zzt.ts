import { readFileSync, writeFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const abc = readFileSync(process.env.F ?? '', 'utf8')
writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[0]?.svg ?? '')
