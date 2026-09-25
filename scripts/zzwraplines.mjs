/**
 * **THE WRAPPED `tune.lines`, BOTH ENGINES LIVE — the surface no other gate reads.**
 *
 * `zzopts` compares the SVG under `wrap`; every `tune.lines` gate compares the UNWRAPPED
 * parse. Under a wrap abcjs's tune object is the `deline`d, re-broken one, and a host reads
 * its `lines` — so that structure had no gate at all until 2026-09-25, when voices whose
 * lines disagree showed it differing while the drawing agreed.
 *
 * Each line is reduced to its staves, each staff to its clef and key, and each voice to its
 * elements' `el_type`, span and pitch names — enough to see a voice move staff, a stem
 * element appear, or an empty slot. `abselem` and friends are skipped: they are layout.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzwraplines.mjs
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
const cases = []
for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.abc')).sort()) {
  const base = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  if (existsSync(join(goldens, `${base}.svg`))) { cases.push({ slug: base, abc, tune: 0 }); continue }
  for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1)
    cases.push({ slug: `${base}-tune${i}`, abc, tune: i })
}
/**
 * The rows that differ TODAY, by slug, in `zzwraplines-known.json` — a RATCHET that names
 * them: a new difference fails as undeclared, a row that starts agreeing fails as STALE so
 * the file shrinks. 529 of 697 when the gate was written, 2026-09-25: element SPANS on
 * wrapped lines (the tile), each dissolved source line's own `createVoice` stems at its
 * join inside the merged voice, and a handful of keys and meters.
 */
const KNOWN = new Map(
  JSON.parse(readFileSync(join(import.meta.dirname, 'zzwraplines-known.json'), 'utf-8')).map((s) => [s, 'open']),
)
const OPTS = { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }

const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let off = 0, unexpected = 0, stale = 0
const rows = []
for (const c of cases) {
  const r = await page.evaluate(([abc, tune, opts]) => {
    const digest = (API) => {
      try {
        const d = document.createElement('div'); document.body.appendChild(d)
        d.style.position = 'absolute'; d.style.visibility = 'hidden'
        const t = API.renderAbc([d], abc, { staffwidth: 670, startingTune: tune, ...opts })[0]
        d.remove()
        return JSON.stringify((t?.lines ?? []).map((l) => !l.staff ? Object.keys(l).sort().join(',') :
          l.staff.map((st) => st ? [st.clef?.type, (st.key?.accidentals ?? []).map((a) => a.acc + a.note).join(''),
            st.voices.map((v) => v.map((e) => [e.el_type, e.startChar ?? null, e.endChar ?? null,
              (e.pitches ?? []).map((p) => p.name).join(''), e.direction ?? null].join(':')))] : 'HOLE')))
      } catch (e) { return 'THREW: ' + e.message }
    }
    return { js: digest(window.ABCJS), ts: digest(window.ABCTS) }
  }, [c.abc, c.tune, OPTS])
  const same = r.js === r.ts
  if (same) { if (KNOWN.has(c.slug)) { stale += 1; rows.push(`  STALE ${c.slug}`) } continue }
  off += 1
  if (!KNOWN.has(c.slug)) {
    unexpected += 1
    let i = 0
    while (i < r.js.length && r.js[i] === r.ts[i]) i += 1
    rows.push(`  DIFFERS ${c.slug} at ${i}\n    js …${r.js.slice(Math.max(0, i - 80), i + 80)}\n    ts …${r.ts.slice(Math.max(0, i - 80), i + 80)}`)
  }
}
await browser.close()
console.log(`wrapped tune.lines — ${off} of ${cases.length} differ (${KNOWN.size} known)`)
if (rows.length > 0) console.log(rows.join('\n'))
if (unexpected > 0 || stale > 0) {
  console.error(`FAIL: ${unexpected} undeclared, ${stale} stale`)
  process.exitCode = 1
}
