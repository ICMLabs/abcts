/**
 * **abcts AGAINST abcjs ON SPEED, BOTH LIVE IN ONE BROWSER.**
 *
 * The same harness `zzlive.mjs` proves byte parity with, asked a different question. Both
 * engines are loaded into ONE page, so they share a JS engine, a font stack, a machine and
 * a thermal state — which is the only way a ratio between them means anything.
 *
 * ⚠️ **WHAT IT MEASURES IS `renderAbc` INTO A LIVE `<div>`** — parse, layout, emit, and the
 * browser's own DOM insertion — because that is the call a website makes. It is NOT a
 * microbenchmark of the parser, and the numbers include text measurement, which is a
 * `getBBox()` on a real element in both engines.
 *
 * ⚠️ **ALTERNATE THE ENGINES, NEVER RUN ALL OF ONE THEN ALL OF THE OTHER.** JIT warm-up and
 * CPU frequency both drift over a run, and a block layout hands the whole of that drift to
 * one engine. Each rep renders every fixture in both, in alternating order.
 *
 * ⚠️ **AND DISCARD THE FIRST REP.** Cold, the first pass is dominated by compilation of a
 * 681KB bundle. A site's SECOND render is the honest steady-state number and its FIRST is
 * reported separately, because a visitor pays that one too.
 *
 * ⚠️ **AND `performance.now()` IS CLAMPED — 0.33ms in WebKit, as a Spectre mitigation.**
 * A first cut timed ONE render per fixture and the per-file table came back full of `0.00x`,
 * `NaNx` and `Infinityx`: most tunes render in less than one tick, so both engines read
 * `0.0ms` or `0.3ms` and the RATIO of two quantised numbers is noise wearing a decimal
 * point. The aggregate was fine — 231 files sum well past the quantum — which is exactly how
 * a broken per-file column survives beside a sound total. Each file is now rendered `INNER`
 * times inside one timer and divided back, so the measured span is tens of ticks.
 *
 * ⚠️ **AND `HOST=1` IS THE OTHER HALF OF THE QUESTION.** The default times `renderAbc`
 * alone, which is what a static score page does. A page with playback highlighting also
 * reads `tune.lines` and `tune.noteTimings`, and BOTH engines do real work for those — so
 * the default number says nothing about it. Measured separately rather than folded in,
 * because they are different pages.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzperf.mjs
 *   ENGINE=chrome REPS=5 PW=… node scripts/zzperf.mjs
 *   HOST=1 PW=… node scripts/zzperf.mjs
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
const REPS = Number(process.env.REPS ?? 4)
/** Also read `tune.lines` and `tune.noteTimings` — the playback-highlighting page. */
const HOST = process.env.HOST === '1'
/** Renders per timed span — enough that the clock's 0.33ms quantum is noise. See the header. */
const INNER = Number(process.env.INNER ?? 20)

const cases = readdirSync(fixtures)
  .filter((x) => x.endsWith('.abc'))
  .sort()
  .map((f) => ({ slug: f.replace(/\.abc$/, ''), abc: readFileSync(join(fixtures, f), 'utf-8') }))

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

/** One rep: every fixture through both engines, alternating, timed per engine per tune. */
const rep = async (jsFirst) =>
  page.evaluate(({ cases, jsFirst, inner, host }) => {
    // ONE timed span over `inner` renders, divided back — the clock is quantised at 0.33ms
    // in WebKit and a single render of most fixtures is under one tick. See the header.
    const time = (API, abc) => {
      const count = API.numberOfTunes(abc)
      const t0 = performance.now()
      for (let k = 0; k < inner; k += 1) {
        const slots = []
        for (let i = 0; i < count; i++) {
          const d = document.createElement('div')
          d.style.position = 'absolute'
          // visibility, NOT display — a display:none subtree has no layout and getBBox()
          // answers 0 inside it, which changes what a boxed font MEASURES. See zzlive.
          d.style.visibility = 'hidden'
          document.body.appendChild(d)
          slots.push(d)
        }
        const out = API.renderAbc(slots, abc, { staffwidth: 670 })
        // The playback-highlighting page, when asked for: both engines build a real
        // `lines` projection and real note timings, so this is a fair comparison of the
        // same work rather than of one engine's laziness.
        if (host) for (const t of out) { void t.lines; void t.noteTimings }
        for (const d of slots) d.remove()
      }
      return (performance.now() - t0) / inner
    }
    const out = { js: 0, ts: 0, perTune: [] }
    for (const c of cases) {
      let j, t
      // The ORDER alternates per rep so neither engine always warms the cache for the other.
      if (jsFirst) { j = time(window.ABCJS, c.abc); t = time(window.ABCTS, c.abc) }
      else { t = time(window.ABCTS, c.abc); j = time(window.ABCJS, c.abc) }
      out.js += j
      out.ts += t
      out.perTune.push({ slug: c.slug, js: j, ts: t })
    }
    return out
  }, { cases, jsFirst, inner: INNER, host: HOST })

const reps = []
for (let i = 0; i < REPS; i += 1) {
  reps.push(await rep(i % 2 === 0))
  process.stderr.write(`  ${engine.name} rep ${i + 1}/${REPS}\r`)
}
await browser.close()

const cold = reps[0]
const warm = reps.slice(1)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const jsWarm = mean(warm.map((r) => r.js))
const tsWarm = mean(warm.map((r) => r.ts))

// The per-fixture ratio, from the warm reps only. The MEDIAN of it, not the ratio of the
// sums: a corpus total is dominated by its two largest tunes, and a site renders whatever
// it renders. Both are reported.
const perTune = cases.map((c, i) => {
  const js = mean(warm.map((r) => r.perTune[i].js))
  const ts = mean(warm.map((r) => r.perTune[i].ts))
  return { slug: c.slug, js, ts, ratio: ts / js }
}).sort((a, b) => b.ratio - a.ratio)
const ratios = perTune.filter((p) => p.js > 0.02 && p.ts > 0.02).map((p) => p.ratio).sort((a, b) => a - b)
const median = ratios[Math.floor(ratios.length / 2)]

// ⚠️ A fixture neither engine spends measurable time on cannot produce a meaningful ratio,
// whatever the clock says. Nothing is currently excluded by this — it is here so that a
// future corpus of trivial tunes cannot quietly fill the table with noise.
const measurable = perTune.filter((p) => p.js > 0.02 && p.ts > 0.02)
const lines = [
  `abcts vs abcjs 6.7.0, both live in ${engine.name}, ${cases.length} files, ${REPS} reps${HOST ? '  [HOST: + lines + noteTimings]' : ''}`,
  ``,
  `  COLD (first rep, compilation included)   abcjs ${cold.js.toFixed(0)}ms   abcts ${cold.ts.toFixed(0)}ms   ${(cold.ts / cold.js).toFixed(2)}x`,
  `  WARM (mean of ${warm.length})                      abcjs ${jsWarm.toFixed(0)}ms   abcts ${tsWarm.toFixed(0)}ms   ${(tsWarm / jsWarm).toFixed(2)}x`,
  ``,
  `  per file: abcjs ${(jsWarm / cases.length).toFixed(2)}ms   abcts ${(tsWarm / cases.length).toFixed(2)}ms`,
  `  MEDIAN per-file ratio ${median.toFixed(2)}x   over ${measurable.length} of ${cases.length} files (the sum is dominated by the largest tunes)`,
  ``,
  `  SLOWEST for abcts, relative:`,
  ...measurable.slice(0, 8).map((p) => `    ${p.slug.padEnd(50)} ${p.ratio.toFixed(2)}x   abcjs ${p.js.toFixed(1)}ms  abcts ${p.ts.toFixed(1)}ms`),
  ``,
  `  FASTEST for abcts, relative:`,
  ...measurable.slice(-8).reverse().map((p) => `    ${p.slug.padEnd(50)} ${p.ratio.toFixed(2)}x   abcjs ${p.js.toFixed(1)}ms  abcts ${p.ts.toFixed(1)}ms`),
]
writeFileSync(`/tmp/abcts-perf-${engine.name}${HOST ? '-host' : ''}.txt`, lines.join('\n') + '\n')
console.log(lines.join('\n'))
