/**
 * **ONE FIXTURE, BOTH ENGINES, ELEMENT-BY-ELEMENT.**
 *
 * The live gate (`zzlive.mjs`) reports the FIRST differing byte, which for any
 * page-geometry defect is the root `height=` attribute and therefore names nothing. This
 * dumps one tune from both engines and diffs them element by element, which is what turns
 * "the page is 0.28px short" into "the staff lines are 0.29px apart, so the difference is
 * ABOVE the staff" — the step that found the chord lane on 2026-08-31.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js \
 *     node scripts/zzpair.mjs abcts-grace-order-and-lanes 23
 *
 * Writes `/tmp/gp/pair.ts.svg` and `/tmp/gp/pair.js.svg` for further poking.
 * `ENGINE=chrome` for the control; WebKit by default, as everywhere here.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require0 = createRequire(import.meta.url)
const PW = process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js'
const { webkit, chromium } = require0(PW)

const ABCJS =
  '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const repo = join(import.meta.dirname, '..')
const OURS = join(repo, 'dist', 'abcts-browser.global.js')
if (!existsSync(OURS)) throw new Error(`no ${OURS} — run npm run build`)

const slug = process.argv[2]
const tune = Number(process.argv[3] ?? 0)
const limit = Number(process.env.LIMIT ?? 4)
if (slug === undefined) throw new Error('usage: zzpair.mjs <fixture-slug> [tuneIndex]')
const abc = readFileSync(join(repo, 'tests', 'corpus-abcjs', 'fixtures', `${slug}.abc`), 'utf-8')

const engine =
  process.env.ENGINE === 'chrome'
    ? { launcher: chromium, opts: { channel: 'chrome' }, name: 'chrome' }
    : { launcher: webkit, opts: {}, name: 'webkit' }

const browser = await engine.launcher.launch(engine.opts)
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
await page.addScriptTag({ content: readFileSync(OURS, 'utf-8') })
const r = await page.evaluate(
  ({ abc, tune }) => {
    const go = (API) => {
      const n = API.numberOfTunes(abc)
      const slots = []
      for (let i = 0; i < n; i++) {
        const d = document.createElement('div')
        // ⚠️ visibility, never display — `display:none` zeroes `getBBox`. See zzlive.mjs.
        d.style.position = 'absolute'
        d.style.visibility = 'hidden'
        document.body.appendChild(d)
        slots.push(d)
      }
      API.renderAbc(slots, abc, { staffwidth: 670 })
      const svg = slots[tune]?.querySelector('svg')
      const s = svg ? svg.outerHTML : 'NO SVG'
      for (const d of slots) d.remove()
      return s
    }
    return { js: go(window.ABCJS), ts: go(window.ABCTS) }
  },
  { abc, tune },
)
await browser.close()

mkdirSync('/tmp/gp', { recursive: true })
writeFileSync('/tmp/gp/pair.ts.svg', r.ts)
writeFileSync('/tmp/gp/pair.js.svg', r.js)

/** Split on element boundaries so a diff names an ELEMENT rather than a byte offset. */
const split = (s) => s.split(/(?<=>)(?=<)/)
const a = split(r.ts)
const b = split(r.js)
let n = 0
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  const x = a[i] ?? '<MISSING>'
  const y = b[i] ?? '<MISSING>'
  if (x === y) continue
  n += 1
  let j = 0
  while (j < Math.min(x.length, y.length) && x[j] === y[j]) j += 1
  console.log(`--- element ${i} @char ${j}`)
  console.log(`  ours  : …${x.slice(Math.max(0, j - 45), j + 60)}`)
  console.log(`  abcjs : …${y.slice(Math.max(0, j - 45), j + 60)}`)
  if (n >= limit) {
    console.log('  (more suppressed — raise LIMIT)')
    break
  }
}
console.log(
  n === 0
    ? `IDENTICAL (${engine.name}, ${r.ts.length} bytes)`
    : `${n} differing element(s) in ${engine.name}`,
)
