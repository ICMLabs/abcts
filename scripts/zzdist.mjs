/**
 * **THE BYTE GATE, AGAINST THE BUILT BUNDLE.** Every gate in this repo renders `src/`
 * through vitest; a host loads `dist/`. This runs the SAME 691 cases with the SAME
 * `{ staffwidth: 670 }` the goldens were made with, but through the published entry
 * points — ESM by default, `MODE=cjs` for the `require` half of the `exports` map.
 *
 *   node scripts/zzdist.mjs            # dist/compat/index.js   (import)
 *   MODE=cjs node scripts/zzdist.mjs   # dist/compat/index.cjs  (require)
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const mode = process.env.MODE ?? 'esm'
const root = join(import.meta.dirname, '..')
const entry = join(root, 'dist', 'compat', mode === 'cjs' ? 'index.cjs' : 'index.js')
if (!existsSync(entry)) throw new Error(`no bundle at ${entry} — run npm run build`)
const api = mode === 'cjs' ? createRequire(import.meta.url)(entry) : await import(entry)
const { renderAbc, numberOfTunes } = api
if (typeof renderAbc !== 'function')
  throw new Error(`${mode}: renderAbc is ${typeof renderAbc} — the entry point is wrong`)

/**
 * ⚠️ **THE GATE'S EXCLUSION LIST TRAVELS WITH THE GATE.** These six are abcjs's red debug
 * strings — an unknown clef name and a note longer than a breve — written up in
 * `Docs/ABCJS-DIFFERENCES.md` and declined on purpose, so they read DIFFERS forever. Run
 * without them this script reports `6 of 691` and looks exactly like a bundle defect;
 * it is what it reported on the first run here. Keep in step with `svg-bytes.test.ts`.
 */
const DIVERGENT = new Set([
  'abcts-rests-and-bars-tune14',
  'abcts-unknown-clef-tune0',
  'abcts-unknown-clef-tune1',
  'abcts-unknown-clef-tune2',
  'abcts-unknown-clef-tune3',
  'abcts-unknown-clef-tune4',
])

const fixtures = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const goldens = join(root, 'tests', 'corpus-abcjs', 'golden')
const cases = readdirSync(fixtures)
  .filter((f) => f.endsWith('.abc'))
  .sort()
  .flatMap((f) => {
    const slug = f.replace(/\.abc$/, '')
    const abc = readFileSync(join(fixtures, f), 'utf-8')
    if (existsSync(join(goldens, `${slug}.svg`)))
      return [{ slug, abc, tune: 0, golden: readFileSync(join(goldens, `${slug}.svg`), 'utf-8') }]
    const rows = []
    for (let i = 0; existsSync(join(goldens, `${slug}-tune${i}.svg`)); i += 1)
      rows.push({ slug: `${slug}-tune${i}`, abc, tune: i,
        golden: readFileSync(join(goldens, `${slug}-tune${i}.svg`), 'utf-8') })
    return rows
  })

let off = 0
for (const c of cases) {
  let got = ''
  try {
    got = renderAbc(new Array(numberOfTunes(c.abc)).fill('*'), c.abc, { staffwidth: 670 })[c.tune]?.svg ?? ''
  } catch (e) { got = `THREW: ${e.message}` }
  if (got !== c.golden && !DIVERGENT.has(c.slug)) {
    off += 1
    const n = Math.min(got.length, c.golden.length)
    let i = 0
    while (i < n && got[i] === c.golden[i]) i += 1
    if (off <= 5)
      console.log(`${c.slug}\n  byte ${i} of ${c.golden.length}\n  got  …${got.slice(Math.max(0,i-30), i+50)}\n  want …${c.golden.slice(Math.max(0,i-30), i+50)}`)
  }
}
console.log(
  `${mode.toUpperCase()}: ${off} of ${cases.length - DIVERGENT.size} off ` +
    `(${DIVERGENT.size} ruled divergent)`,
)
process.exit(off === 0 ? 0 : 1)
