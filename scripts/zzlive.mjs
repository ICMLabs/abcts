/**
 * **abcts AGAINST abcjs, IN THE SAME BROWSER, LIVE.** The only coherent browser oracle.
 *
 * `zzengines.mjs` measured that abcjs renders differently in WebKit and Blink — 230 of
 * 691 (`d4b7022`) — because the two engines measure text differently: single glyph
 * advances agree exactly, multi-character string widths and glyph bbox heights do not.
 * So no STORED golden can be the browser target: there is no single browser answer to
 * store. What is well defined is "the same bytes abcjs produces in the browser it is
 * running in", and that can only be asked with both engines in one page.
 *
 * WebKit by default, and WebKit for a reason beyond availability: Studio's editor is
 * CodeMirror 6 in a WKWebView, so for this stack WebKit is the deployment engine rather
 * than a proxy for one. `ENGINE=chrome` drives the installed Chrome as a control.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzlive.mjs
 *   ENGINE=chrome PW=… node scripts/zzlive.mjs
 *
 * ⚠️ Needs `npm run build` first — it loads `dist/abcts-browser.global.js`, and a stale
 * bundle would report yesterday's engine. It fails loudly if the file is missing, never
 * silently skipping, because a harness that renders nothing reads exactly like a pass.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const PW = process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js'
const { webkit, chromium } = require0(PW)

const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const repo = join(import.meta.dirname, '..')
const OURS = join(repo, 'dist', 'abcts-browser.global.js')
if (!existsSync(OURS)) throw new Error(`no ${OURS} — run npm run build`)
const fixtures = join(repo, 'tests', 'corpus-abcjs', 'fixtures')
const goldens = join(repo, 'tests', 'corpus-abcjs', 'golden')

/** The same six the byte gate rules divergent — abcjs's red debug strings. */
const DIVERGENT = new Set([
  'abcts-rests-and-bars-tune14', 'abcts-unknown-clef-tune0', 'abcts-unknown-clef-tune1',
  'abcts-unknown-clef-tune2', 'abcts-unknown-clef-tune3', 'abcts-unknown-clef-tune4',
])

const cases = []
for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.abc')).sort()) {
  const base = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  if (existsSync(join(goldens, `${base}.svg`))) { cases.push({ slug: base, abc, tune: 0 }); continue }
  for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1)
    cases.push({ slug: `${base}-tune${i}`, abc, tune: i })
}

const engine = process.env.ENGINE === 'chrome'
  ? { launcher: chromium, opts: { channel: 'chrome' }, name: 'chrome' }
  : { launcher: webkit, opts: {}, name: 'webkit' }

const browser = await engine.launcher.launch(engine.opts)
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
await page.addScriptTag({ content: readFileSync(OURS, 'utf-8') })
const ready = await page.evaluate(() => ({
  abcjs: typeof window.ABCJS?.renderAbc, abcts: typeof window.ABCTS?.renderAbc,
}))
if (ready.abcjs !== 'function' || ready.abcts !== 'function')
  throw new Error(`engines did not load: ${JSON.stringify(ready)}`)

const rows = []
let off = 0, n = 0
for (const c of cases) {
  const r = await page.evaluate(({ abc, tune }) => {
    const render = (API) => {
      try {
        const count = API.numberOfTunes(abc); const slots = []
        for (let i = 0; i < count; i++) {
          const d = document.createElement('div'); d.style.display = 'none'
          document.body.appendChild(d); slots.push(d)
        }
        API.renderAbc(slots, abc, { staffwidth: 670 })
        const svg = slots[tune] ? slots[tune].querySelector('svg') : null
        const s = svg ? svg.outerHTML : 'NO SVG'
        for (const d of slots) d.remove()
        return s
      } catch (e) { return 'THREW: ' + e.message }
    }
    return { js: render(window.ABCJS), ts: render(window.ABCTS) }
  }, { abc: c.abc, tune: c.tune })
  n += 1
  if (n % 100 === 0) process.stderr.write(`  ${engine.name} ${n}/${cases.length}\r`)
  if (r.js === r.ts || DIVERGENT.has(c.slug)) continue
  off += 1
  const m = Math.min(r.js.length, r.ts.length)
  let i = 0
  while (i < m && r.js[i] === r.ts[i]) i += 1
  const h = (s) => /height="([\d.]+)"/.exec(s)?.[1]
  rows.push(`  ${c.slug.padEnd(50)} byte ${String(i).padStart(6)}  h ours ${h(r.ts)} vs abcjs ${h(r.js)}`)
}
await browser.close()

const head = [
  `abcts vs abcjs 6.7.0, both live in ${engine.name}, ${cases.length} cases`,
  `${off} of ${cases.length - DIVERGENT.size} differ (${DIVERGENT.size} ruled divergent)`,
  ``,
]
writeFileSync(`/tmp/abcts-live-${engine.name}.txt`, head.concat(rows).join('\n') + '\n')
console.log(head.join('\n'))
console.log(`  full table: /tmp/abcts-live-${engine.name}.txt`)
