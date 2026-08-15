// The 41-FIXTURE SIBLING corpus: first byte difference against its abcjs golden.
//   S=<slug> [T=<tune index>] npx tsx scripts/zzs1.ts
// Omit T for a single-tune fixture (golden `<slug>.svg`); give it for a tunebook
// (`<slug>-tune<T>.svg`). `tests/svg-bytes-sibling.test.ts` is the gate this probes.
import { readFileSync } from 'node:fs'
import { renderAbc } from '../src/compat/index.js'
const F = '../abcMusicKit/Tools/abcjs-debug/fixtures'
const G = '../abcMusicKit/Tools/abcjs-debug/golden'
const slug = process.env.S ?? ''
const tune = process.env.T === undefined ? -1 : Number(process.env.T)
const abc = readFileSync(`${F}/${slug}.abc`, 'utf8')
const got = renderAbc('paper', abc, { staffwidth: 670 })[tune < 0 ? 0 : tune]?.svg ?? ''
const want = readFileSync(`${G}/${slug}${tune < 0 ? '' : `-tune${tune}`}.svg`, 'utf8')
let k = 0
while (k < got.length && k < want.length && got[k] === want[k]) k += 1
console.log('diff at', k, 'of', want.length)
if (k !== want.length || k !== got.length) {
  console.log('GOT :', JSON.stringify(got.slice(Math.max(0, k - 90), k + 200)))
  console.log('WANT:', JSON.stringify(want.slice(Math.max(0, k - 90), k + 200)))
}
