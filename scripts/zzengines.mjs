/**
 * WEBKIT vs BLINK vs THE JSDOM HARVEST — the three-way split.
 *
 * `dump-svg.js`'s stub tables are described as WebKit-calibrated, and the 233-of-691
 * number was measured against CHROME. If WebKit agrees with the harvest, that number is
 * mostly Blink≠WebKit and the goldens are honest for their stated engine. If WebKit
 * disagrees too — and disagrees with Chrome — then "byte parity in a browser" has no
 * single target.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
/**
 * ⚠️ **playwright-core LIVES IN A SCRATCHPAD, NOT IN THIS REPO'S devDeps.** Six devDeps is
 * a deliberate number here and a browser driver is not one of them. Point `PW` at a
 * playwright-core whose `browsers.json` webkit revision matches a build already in
 * `~/Library/Caches/ms-playwright` — 1.61 is webkit-2311, which is what is cached on this
 * Mac; 1.55 wants 2203 and 1.62 wants 2336, and either starts a 90MB download.
 * Chrome is the one in /Applications, reached with `channel: 'chrome'`.
 *
 *   mkdir -p /tmp/gp/pw && cd /tmp/gp/pw && npm init -y && npm i playwright-core@1.61
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzengines.mjs
 */
const PW = process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js'
const { webkit, chromium } = require0(PW)

const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const repo = join(import.meta.dirname, '..')
const fixtures = join(repo, 'tests', 'corpus-abcjs', 'fixtures')
const goldens = join(repo, 'tests', 'corpus-abcjs', 'golden')

const cases = []
for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.abc')).sort()) {
  const base = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  if (existsSync(join(goldens, `${base}.svg`))) { cases.push({ slug: base, abc, tune: 0 }); continue }
  for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1)
    cases.push({ slug: `${base}-tune${i}`, abc, tune: i })
}

const lib = readFileSync(ABCJS, 'utf-8')

async function renderAll(launcher, opts, label) {
  const browser = await launcher.launch(opts)
  const page = await browser.newPage()
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
  await page.addScriptTag({ content: lib })
  const out = {}
  let n = 0
  for (const c of cases) {
    out[c.slug] = await page.evaluate(({ abc, tune }) => {
      try {
        const count = window.ABCJS.numberOfTunes(abc)
        const slots = []
      // ⚠️ **`visibility:hidden`, NEVER `display:none`.** A `display:none` subtree has no
      // layout, so `getBBox()` answers 0 inside it — and abcjs measures AT DRAW TIME for a
      // boxed font (`draw/text.js:69`, `var size = elem.getBBox()`), so hiding the slots
      // that way made abcjs draw a degenerate box of pure padding (5x5 for `%%barlabelfont
      // … box`) while ours drew the real one. Two fixtures read as engine defects for a
      // whole session because of it. `visibility:hidden` still lays out.
        for (let i = 0; i < count; i++) {
          const d = document.createElement('div'); d.style.position = 'absolute'; d.style.visibility = 'hidden'
          document.body.appendChild(d); slots.push(d)
        }
        window.ABCJS.renderAbc(slots, abc, { staffwidth: 670 })
        const svg = slots[tune] ? slots[tune].querySelector('svg') : null
        const s = svg ? svg.outerHTML : 'NO SVG'
        for (const d of slots) d.remove()
        return s
      } catch (e) { return 'THREW: ' + e.message }
    }, { abc: c.abc, tune: c.tune })
    n += 1
    if (n % 100 === 0) process.stderr.write(`  ${label} ${n}/${cases.length}\r`)
  }
  await browser.close()
  return out
}

const wk = await renderAll(webkit, {}, 'webkit')
const bl = await renderAll(chromium, { channel: 'chrome' }, 'chrome')

const h = (s) => /height="([\d.]+)"/.exec(s ?? '')?.[1]
let wkVsGolden = 0, blVsGolden = 0, wkVsBl = 0
const rows = []
for (const c of cases) {
  const want = readFileSync(join(goldens, `${c.slug}.svg`), 'utf-8')
  const a = wk[c.slug], b = bl[c.slug]
  const dwg = a !== want, dbg = b !== want, dwb = a !== b
  if (dwg) wkVsGolden += 1
  if (dbg) blVsGolden += 1
  if (dwb) wkVsBl += 1
  if (dwg || dbg || dwb)
    rows.push(`  ${c.slug.padEnd(50)} wk${dwg ? '≠' : '='}g bl${dbg ? '≠' : '='}g wk${dwb ? '≠' : '='}bl   h ${h(a)} / ${h(b)} / ${h(want)}`)
}
const head = [
  `abcjs 6.7.0 — WebKit vs Blink vs the jsdom harvest, ${cases.length} cases`,
  ``,
  `  WebKit differs from the golden : ${wkVsGolden}`,
  `  Chrome differs from the golden : ${blVsGolden}`,
  `  WebKit differs from Chrome     : ${wkVsBl}`,
  ``,
]
writeFileSync('/tmp/abcts-engine-split.txt', head.concat(rows).join('\n') + '\n')
console.log(head.join('\n'))
console.log(`  full table: /tmp/abcts-engine-split.txt`)
