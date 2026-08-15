import { readFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const F = '../abcMusicKit/Tools/abcjs-debug/fixtures'
const G = '../abcMusicKit/Tools/abcjs-debug/golden'
const slug = process.env.S!
const tune = Number(process.env.T ?? -1)
const abc = readFileSync(`${F}/${slug}.abc`, 'utf8')
const out = renderAbc('paper', abc, { staffwidth: 670 })
const got = out[tune < 0 ? 0 : tune]?.svg ?? ''
const want = readFileSync(`${G}/${slug}${tune < 0 ? '' : `-tune${tune}`}.svg`, 'utf8')
let k = 0; while (k < got.length && k < want.length && got[k] === want[k]) k++
console.log('diff at', k, 'of', want.length)
console.log('GOT :', JSON.stringify(got.slice(Math.max(0, k - 90), k + 200)))
console.log('WANT:', JSON.stringify(want.slice(Math.max(0, k - 90), k + 200)))
