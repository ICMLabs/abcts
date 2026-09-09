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
 *     print        7 — SIX of them a last-digit float, one a mid-tune `%%text` y
 *     scale 0.8    4 · scale 1.5   2 — a non-unit scale, and `oneSvgPerLine + scale 0.8`
 *                  inherits the SAME FOUR
 *
 * ✅ **`oneSvgPerLine` AND THE TWO VIEWPORTS LANDED 2026-09-09** and are 0 of 685 apiece,
 * `oneSvgPerLine + resize` included. All three were unimplemented outright.
 *
 * ✅ **PRINT OPENED AT 8 AND TWO OF ITS CAUSES WERE FEATURES, NOT ROUNDING.** `%%header`
 * was parsed and never drawn — print is the only mode that draws one — and `%%topspace`
 * did not replace the print top space. What is left is six rows differing in a last digit
 * and one fixture with several open causes at once.
 *
 * ✅ **`jazzchords` OPENED AT 95 AND CLOSED THE SAME DAY**, in three steps: the host param
 * was ignored outright (the DIRECTIVE was the only way in), and then two measurements read
 * the FLAT chord string where abcjs measures the drawn jazz form — the box round `G♭maj7`
 * at 54px against 45, and the LANE PACKING, which opened a second chord lane where abcjs
 * fits one. `measuredText` is the one place that answers it now.
 *
 * Take one of the rest and the counts arbitrate. ⚠️ `13` was the jazzchords count over a
 * 1-in-8 SAMPLE and it was 95 over the whole corpus — **a sample is a lower bound, never a
 * number to declare.**
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
 * `[label, options, declared, witness]` — `declared` is how many fixtures differ TODAY for
 * a reason that is not the option plumbing. A row that goes UP fails; a row that goes DOWN
 * says the comment above is out of date.
 *
 * ⚠️ **AND `witness` IS THE SHAPE THE OPTION MUST PRODUCE IN abcjs'S OWN OUTPUT.** A row
 * that agrees because the feature NEVER RENDERED is a held prediction that measures
 * nothing — the repo's own rule, and it has fired four times in eighteen elsewhere. The
 * witness is asked of abcjs, on the first fixture the row walks, and a row that cannot
 * produce it reports **MUTE** and fails. Rows whose option changes only geometry inside a
 * shape every render already draws take no witness.
 */
const OPTIONS = [
  ['baseline', {}, 0],
  ['responsive resize', { responsive: 'resize' }, 0],
  ['responsive + scale 1.5', { responsive: 'resize', scale: 1.5 }, 0],
  ['responsive + scale 0.7', { responsive: 'resize', scale: 0.7 }, 0],
  ['print + responsive', { print: true, responsive: 'resize' }, 5],
  ['scale 0.8', { scale: 0.8 }, 4],
  ['scale 1.5', { scale: 1.5 }, 2],
  ['print', { print: true }, 7],
  ['jazzchords', { jazzchords: true }, 0],
  // The witness for the split is the SECOND section: a one-`<g>` tune would produce
  // `section 1` from a split that never split anything.
  ['oneSvgPerLine', { oneSvgPerLine: true }, 0, /section 2<\/title>/],
  ['oneSvgPerLine + resize', { oneSvgPerLine: true, responsive: 'resize' }, 0, /viewBox="0 [1-9]/],
  // 4, and they are the SAME FOUR FIXTURES as the plain `scale 0.8` row above — measured
  // by differencing the two sets, not inferred from a shared first-three. The split adds
  // nothing; it is inheriting the non-unit-scale geometry that row already declares.
  ['oneSvgPerLine + scale 0.8', { oneSvgPerLine: true, scale: 0.8 }, 4, /<div style="overflow: hidden;height:/],
  ['viewportHorizontal', { viewportHorizontal: true }, 0, /<div class="abcjs-inner" style="overflow: hidden/],
  ['viewportHorizontal + scroll', { viewportHorizontal: true, scrollHorizontal: true }, 0, /overflow: auto hidden/],
  ['viewportVertical', { viewportVertical: true }, 0, /<div class="abcjs-inner scroll-amount"/],
]
const every = Number(process.argv[2] ?? 1)
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let bad = 0
for (const [label, opts, declared, witness] of OPTIONS) {
  let off = 0, n = 0, seen = witness === undefined
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
    if (!seen && witness.test(r.js)) seen = true
  }
  const flag = !seen ? 'MUTE' : off === declared ? '   ' : off > declared ? 'UP ' : 'DOWN'
  if (off !== declared || !seen) bad += 1
  console.log(`${flag} ${String(off).padStart(4)} of ${n} (declared ${declared})  ${label}   ${first.join(' ')}`)
}
if (bad > 0) {
  console.error(`FAIL: ${bad} option row(s) moved`)
  process.exitCode = 1
}
await browser.close()
