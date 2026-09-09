/**
 * **THE HOST-OPTION SURFACE — every switch a drop-in host passes, over the whole corpus.**
 *
 * `zzlive` renders with `{staffwidth: 670}` and nothing else, so the options a real page
 * sets were UNRENDERED by every gate here. This is the same comparison under each of them,
 * and it compares the CONTAINER as well as the SVG — `outerHTML` — because half of what
 * abcjs's `setPaperSize` does is assign styles to the parent node (`draw/set-paper-size.js`),
 * which no emitted string can carry.
 *
 * **IT OPENED AT 685 OF 685 ON EVERY ROW**, 2026-09-09, for one reason: abcjs sizes the
 * container (`overflow: hidden; height: <h>px`) and we set nothing at all. `responsive:
 * "resize"` — the option a page reaches for first — was unimplemented outright.
 *
 * The rows that remain are DECLARED below with their counts, and every one is geometry
 * INSIDE the SVG rather than option plumbing — three more surfaces no gate had rendered:
 *
 *     print        8 — a title at font-size 27 against our 31, among others
 *     scale 0.8    4 · scale 1.5   2 — a non-unit scale
 *     jazzchords  95 — the chord-symbol shapes, by far the biggest of the three
 *
 * Take one and the counts arbitrate. `13` was the count over a 1-in-8 SAMPLE and reads as
 * 95 over the whole corpus — **a sample is a lower bound, never a number to declare.**
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzopts.mjs
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit } = require0('/tmp/gp/pw/node_modules/playwright-core/index.js')
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
const SKIP = new Set(['abcts-rests-and-bars-tune14','abcts-unknown-clef-tune0','abcts-unknown-clef-tune1','abcts-unknown-clef-tune2','abcts-unknown-clef-tune3','abcts-unknown-clef-tune4'])
/**
 * `[label, options, declared]` — `declared` is how many fixtures differ TODAY for a reason
 * that is not the option plumbing. A row that goes UP fails; a row that goes DOWN says the
 * comment above is out of date.
 */
const OPTIONS = [
  ['baseline', {}, 0],
  ['responsive resize', { responsive: 'resize' }, 0],
  ['responsive + scale 1.5', { responsive: 'resize', scale: 1.5 }, 0],
  ['responsive + scale 0.7', { responsive: 'resize', scale: 0.7 }, 0],
  ['print + responsive', { print: true, responsive: 'resize' }, 6],
  ['scale 0.8', { scale: 0.8 }, 4],
  ['scale 1.5', { scale: 1.5 }, 2],
  ['print', { print: true }, 8],
  ['jazzchords', { jazzchords: true }, 95],
]
const every = Number(process.argv[2] ?? 1)
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let bad = 0
for (const [label, opts, declared] of OPTIONS) {
  let off = 0, n = 0
  const first = []
  for (let k = 0; k < cases.length; k += every) {
    const c = cases[k]
    if (SKIP.has(c.slug)) continue
    n += 1
    const r = await page.evaluate(([abc, tune, opts]) => {
      const one = (API) => {
        try {
          const d = document.createElement('div'); document.body.appendChild(d)
          d.style.position = 'absolute'; d.style.visibility = 'hidden'
          API.renderAbc([d], abc, { staffwidth: 670, startingTune: tune, ...opts })
          const s = d.outerHTML
          d.remove(); return s
        } catch (e) { return 'THREW: ' + e.message }
      }
      return { js: one(window.ABCJS), ts: one(window.ABCTS) }
    }, [c.abc, c.tune, opts])
    if (r.js !== r.ts) { off += 1; if (first.length < 3) first.push(c.slug) }
  }
  const flag = off === declared ? '   ' : off > declared ? 'UP ' : 'DOWN'
  if (off !== declared) bad += 1
  console.log(`${flag} ${String(off).padStart(4)} of ${n} (declared ${declared})  ${label}   ${first.join(' ')}`)
}
if (bad > 0) {
  console.error(`FAIL: ${bad} option row(s) moved`)
  process.exitCode = 1
}
await browser.close()
