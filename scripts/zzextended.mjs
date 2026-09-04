/**
 * **THE EXTENDED-MODE BROWSER CONTROL — the two properties `extended` exists to have.**
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzextended.mjs
 *
 * `tests/extended-snapshot.test.ts` is the headless ratchet and cannot ask either of these:
 * Node has no DOM, so no live measurer is installed and both answers are the tables'.
 *
 *   1  MEASURES LIVE.  Until 2026-09-04 the installer lived in `compat/index.ts`, which
 *      hard-wires `abcjs-strict`, so `extended` laid text out with the per-em TABLES in a
 *      real browser — the one mode meant to be right about text was the one that never
 *      asked the browser. A width that moves between the two paths is the proof it does now.
 *
 *   2  IS POSITION-INDEPENDENT.  abcjs cannot satisfy this: its `sizeCache` is module-global
 *      and keyed without the x (`write/svg.js:306`, `:316`), so a tune's output depends on
 *      what was rendered before it in the same page. Strict reproduces that deliberately
 *      (`ABCJS-DEBT.md` §3b.1); extended keys the cache WITH the x, per render, and must
 *      therefore render a tune identically wherever it sits in a book.
 *
 * ⚠️ Rung 2 must be checked against STRICT in the same run, or it proves nothing: if strict
 * were position-independent too, the cache split would be doing nothing and the rung would
 * pass for the wrong reason.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit } = require0(process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js')
const repo = join(import.meta.dirname, '..')
const OURS = join(repo, 'dist', 'abcts-browser.global.js')
const fixtures = join(repo, 'tests', 'corpus-abcjs', 'fixtures')

/**
 * ⚠️ **THE WARMER HAS TO POISON THE CACHE, OR THIS RUNG PASSES FOR THE WRONG REASON.**
 * Two cuts of it did not. Warming with the first 40 fixtures reported STRICT as
 * position-independent too; warming with the three fixtures that share `Q:"Easy Swing"`
 * did the same, because a HEADER tempo sits at the same x in every tune and a cached width
 * measured there is the one the target wants anyway.
 *
 * So this uses the case that was MEASURED to move: `zzwarm` found `selection-01` differing
 * from abcjs when warmed by the 137 cases `zzlive` renders before it, and byte-identical
 * alone. Whatever in those 137 draws a shared string at a different x, it is the thing that
 * matters — and the script asserts strict MOVED rather than assuming it.
 */
const TARGET = 'abcjs-visual-selection-01-selection-test.abc'
const all = readdirSync(fixtures).filter((f) => f.endsWith('.abc')).sort()
const TUNE = readFileSync(join(fixtures, TARGET), 'utf-8')
const others = all.slice(0, all.indexOf(TARGET)).map((f) => readFileSync(join(fixtures, f), 'utf-8'))

const b = await webkit.launch()
const page = await b.newPage()
const bundle = readFileSync(OURS, 'utf-8')

/**
 * ⚠️ **A FRESH DOCUMENT PER MEASUREMENT, AND THE WARMERS BEFORE THE TARGET.**
 * A third cut rendered the target ALONE first and then warmed — which primes the cache with
 * the target's OWN widths, so nothing that follows can dislodge them and strict reads
 * position-independent. The cache is module-scoped, so only a new JS realm clears it.
 */
const run = async (mode, warm) => {
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
  await page.addScriptTag({ content: bundle })
  return page.evaluate(({ tune, others, mode, warm }) => {
    const { parse, render } = window.ABCTS.core
    const one = (abc) => {
      const p = parse(abc, { mode })
      const s = p.ok ? p.scores[0] : undefined
      return s === undefined ? 'NO SCORE' : render(s, { mode, systemWidth: 670 })
    }
    if (warm) for (const o of others) { try { one(o) } catch { /* warming */ } }
    return one(tune)
  }, { tune: TUNE, others, mode, warm })
}

/**
 * RUNG 1 — **`extended` MEASURES LIVE AT ALL.** Compare the browser's answer for a
 * text-heavy tune against Node's, which has no DOM and therefore uses the per-em tables.
 * Identical means the browser measurer never installed, which is what `extended` did until
 * 2026-09-04 because `withLiveMeasurement` lived in the strict-only compat layer.
 */
const TEXT_HEAVY =
  'X:1\n%%vocalfont Helvetica 10\nT:Title\nW:extra verse\nH:history\nM:4/4\nL:1/4\nK:C\nCDEF|\nw:laa_ la la la\n'
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: bundle })
const inBrowser = await page.evaluate((abc) => {
  const { parse, render } = window.ABCTS.core
  const p = parse(abc, { mode: 'extended' })
  return p.ok && p.scores[0] ? render(p.scores[0], { mode: 'extended', systemWidth: 670 }) : 'NO SCORE'
}, TEXT_HEAVY)
const { parse: nodeParse } = await import('../dist/index.js')
const { render: nodeRender } = await import('../dist/renderer/index.js')
const np = nodeParse(TEXT_HEAVY, { mode: 'extended' })
const inNode = np.ok && np.scores[0]
  ? nodeRender(np.scores[0], { mode: 'extended', systemWidth: 670 })
  : 'NO SCORE'
console.log('extended: browser vs headless          ',
  inBrowser === inNode ? 'same — ⚠️ NO LIVE MEASURER INSTALLED' : 'DIFFER — measuring live ✅')
console.log()

/**
 * RUNG 3 — **AN EMPTY LYRIC ROW RESERVES A LINE, NOT abcjs's MAGIC 4 PITCH.**
 * `ABCJS-DEBT.md` §3b.3, and it can only be asked HERE: the whitespace early-out that makes
 * a held syllable measure zero (`svg.js:311-312`) lives in the LIVE measurer, so Node never
 * reaches the branch at all and the headless ratchet cannot see this gate fire.
 */
const HELD = 'X:1\n%%vocalfont Helvetica 8\nM:4/4\nL:1/4\nK:C\nC4 D4\nw:laa_ la\n'
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: bundle })
const held = await page.evaluate((abc) => {
  const { parse, render } = window.ABCTS.core
  const one = (mode) => {
    const p = parse(abc, { mode })
    return p.ok && p.scores[0] ? render(p.scores[0], { mode, systemWidth: 670 }) : 'NO SCORE'
  }
  const h = (svg) => /height="([\d.]+)"/.exec(svg)?.[1]
  return { strict: h(one('abcjs-strict')), extended: h(one('extended')) }
}, HELD)
console.log('held syllable, %%vocalfont Helvetica 8 — page height')
console.log('  strict  (abcjs\'s 4-pitch default) ', held.strict)
console.log('  extended (reserves a line)         ', held.extended,
  held.strict === held.extended ? ' ⚠️ SAME — the gate is not firing' : ' ✅')
console.log()

/**
 * RUNG 4 — **THE `"A"` PROBE COSTS NOTHING ON HEIGHT, AND THIS IS WHY.**
 * `ABCJS-DEBT.md` §3b.2 read that abcjs advances every bottom-block row by `"A"`
 * (`add-text-if.js:21`) so a row of DESCENDERS advances by exactly as much as a row of
 * capitals. True — **and measuring the row gives the identical answer**, because
 * `getBBox().height` on a `<text>` is the LINE BOX and not the ink extent. Measured across
 * Times New Roman, Helvetica and cursive at 8/13/17/21/27/40px: `"A"`, `"gggpqy"` and
 * `"Mg"` return the same height at every one.
 *
 * So this rung asserts BOTH modes agree, which is the measured truth rather than a defect.
 * It is kept because the claim it refutes was reasoned from abcjs's source comment and
 * would otherwise be re-attempted: a phase was written against it and reverted.
 */
const ROWS = (h) => `X:1\nT:t\nH:${h}\nM:4/4\nL:1/4\nK:C\nCDEF|\n`
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: bundle })
const rows = await page.evaluate(({ caps, desc }) => {
  const { parse, render } = window.ABCTS.core
  const h = (abc, mode) => {
    const p = parse(abc, { mode })
    const svg = p.ok && p.scores[0] ? render(p.scores[0], { mode, systemWidth: 670 }) : ''
    return /height="([\d.]+)"/.exec(svg)?.[1]
  }
  return {
    strictCaps: h(caps, 'abcjs-strict'), strictDesc: h(desc, 'abcjs-strict'),
    extCaps: h(caps, 'extended'), extDesc: h(desc, 'extended'),
  }
}, { caps: ROWS('AAA EEE'), desc: ROWS('gggpqy jjj') })
console.log('an H: row of CAPITALS vs one of DESCENDERS — page height')
console.log('  strict   ', rows.strictCaps, 'vs', rows.strictDesc,
  rows.strictCaps === rows.strictDesc ? ' same ✅' : ' DIFFER ⚠️')
console.log('  extended ', rows.extCaps, 'vs', rows.extDesc,
  rows.extCaps === rows.extDesc
    ? ' same ✅ — a text bbox height is the LINE BOX, so the probe costs nothing'
    : ' DIFFER ⚠️ — then the line-box measurement no longer holds; re-read §3b.2')
console.log()

const r = {}
for (const mode of ['abcjs-strict', 'extended']) {
  r[`${mode} alone`] = await run(mode, false)
  r[`${mode} warmed`] = await run(mode, true)
}
await b.close()

const same = (a, c) => (a === c ? 'same' : 'DIFFER')
console.log(`warmed by ${others.length} tunes, fresh document each time\n`)
const strictMoved = r['abcjs-strict alone'] !== r['abcjs-strict warmed']
const extendedMoved = r['extended alone'] !== r['extended warmed']
console.log('strict:   alone vs warmed              ', same(r['abcjs-strict alone'], r['abcjs-strict warmed']))
console.log('extended: alone vs warmed              ', same(r['extended alone'], r['extended warmed']))
console.log()
if (!strictMoved)
  console.log('⚠️  INCONCLUSIVE — strict did not move either, so the warmer never poisoned\n' +
              "    abcjs's x-free cache. This rung passes for the wrong reason otherwise.")
else if (extendedMoved) console.log('❌ extended moved with page history — the cache split is not doing its job')
else console.log('✅ strict MOVED and extended did NOT — the cache split is doing exactly its job')
