/**
 * **THE NODES A HOST IS HANDED — every drawn element's `elemset` and every timing row's
 * `elements`, both engines live, over the whole in-repo corpus.**
 *
 * abcjs keeps the drawn `<g>` itself (`draw/absolute.js:57`) and a playback cursor adds a
 * class to it. abcts handed a stand-in object until 2026-09-25, so every follow-along
 * highlight threw on its first note — and no gate saw it, because each compared the rows'
 * SHAPE and never what the entries were. Found by the first page built on abcts.
 *
 * Each node is written as `data-name:data-index`, so a group attributed to the wrong element
 * shows (that is how an empty bar group's leftover record was found, which had also been
 * shifting `rangeHighlight` onto the wrong bar); `undefined` is abcjs's never-drawn
 * duplicate-voice furniture, `[]` an element that drew nothing.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzelemset.mjs
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit } = require0(process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js')
const repo = join(import.meta.dirname, '..')
const cfg = JSON.parse(readFileSync(join(repo, 'abcts.config.json'), 'utf-8'))
const fixtures = join(repo, 'tests', 'corpus-abcjs', 'fixtures')
const goldens = join(repo, 'tests', 'corpus-abcjs', 'golden')

/** abcjs's debug markers, which this engine declines to draw — `Docs/ABCJS-DIFFERENCES.md`. */
const DECLARED = new Map([
  ...[0, 1, 2, 3, 4].map((i) => [`abcts-unknown-clef-tune${i}`, 'abcjs draws `clef=x` as a clef group']),
  ['abcts-rests-and-bars-tune14', 'abcjs draws a debug string for a note longer than a breve'],
])

const cases = []
for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.abc')).sort()) {
  const base = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  if (existsSync(join(goldens, `${base}.svg`))) { cases.push([base, abc, 0]); continue }
  for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1) cases.push([`${base}-tune${i}`, abc, i])
}

const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let off = 0, undeclared = 0, stale = 0
for (const [slug, abc, tune] of cases) {
  const [js, ts] = await page.evaluate(([abc, tune]) => ['ABCJS', 'ABCTS'].map((E) => {
    try {
      const d = document.createElement('div')
      document.body.appendChild(d)
      const t = window[E].renderAbc(d, abc, { staffwidth: 670, startingTune: tune })[0]
      const node = (x) => (x && x.getAttribute ? `${x.getAttribute('data-name')}:${x.getAttribute('data-index')}` : 'NOT-A-NODE')
      const set = (es) => (es === undefined ? 'undefined' : `[${es.map(node).join(',')}]`)
      const elemset = t.makeVoicesArray().flat().map((r) => set(r.elem.elemset)).join(' ')
      const cursor = new window[E].TimingCallbacks(t, {}).noteTimings
        .filter((e) => e.type === 'event').map((e) => (e.elements ?? []).map(set).join('')).join(' ')
      d.remove()
      return `${elemset} || ${cursor}`
    } catch (e) { return `THREW ${e.message}` }
  }), [abc, tune])
  const same = js === ts
  if (same) {
    if (DECLARED.has(slug)) { stale += 1; console.log(`  STALE ${slug}`) }
    continue
  }
  off += 1
  if (DECLARED.has(slug)) continue
  undeclared += 1
  let i = 0
  while (js[i] === ts[i]) i += 1
  console.log(`  DIFFERS ${slug}\n    js …${js.slice(Math.max(0, i - 60), i + 80)}\n    ts …${ts.slice(Math.max(0, i - 60), i + 80)}`)
}
await browser.close()
console.log(`live elemset + cursor nodes — ${off} of ${cases.length} differ (${DECLARED.size} declared)`)
if (undeclared > 0 || stale > 0) {
  console.error(`FAIL: ${undeclared} undeclared, ${stale} stale`)
  process.exitCode = 1
}
