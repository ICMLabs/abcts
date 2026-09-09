/**
 * **DOES THE ENGINE STAY LINEAR IN THE SIZE OF A TUNE? — the axis no other gate can see.**
 *
 *   node scripts/zzscale.mjs            # needs npm run build first
 *   SIZES=2048,8192,32768 node scripts/zzscale.mjs
 *
 * Every comparison in this repo renders the corpus, and **the corpus is small**: 231
 * fixtures whose largest is a few hundred notes. A profiler over them shows a flat, diffuse
 * cost, and an O(n²) hiding inside it is invisible. That is not a theory:
 *
 * ⚠️ `svg.ts`'s `drawn` ordinal scan was measured on 2026-09-07 at **973ms → 975ms** over
 * the whole corpus and **34.6 → 34.5ms** on `ragtime-nightingale`, the largest fixture
 * there, and written up as "measured and rejected". Both numbers were right and both were
 * the wrong instrument. On a 16,384-note tune the same scan cost **734µs a note** — twelve
 * seconds for one score — with the per-note cost still accelerating: 1.16x, 1.21x, 1.39x,
 * 1.71x, 1.91x, 4.21x across doublings.
 *
 * So this measures the SHAPE OF THE CURVE, not a number: the same music at three sizes,
 * asserting the per-node cost does not run away.
 *
 * ── ⚠️ WHY THIS IS A SCRIPT AND NOT A TEST ───────────────────────────────────
 * It was `tests/scaling.test.ts` for about an hour. Inside a 89-file parallel suite a
 * wall-clock measurement measures the MACHINE: the full run went red on a different test
 * each time, and then on this one. A flaky gate is worse than no gate. It sits with
 * `zzlive`, `zzledger` and `zzperf` — the other measurements this repo runs deliberately
 * rather than on every save.
 *
 * ── AND WHY THE THRESHOLD IS LOOSE ───────────────────────────────────────────
 * **2.2x per 4x of input is far above any noise and far below a quadratic**, which is 4x.
 * The three defects this found were 4.2x, 2.1x and 2.0x; a linear pass sits near 1.0x.
 */
import { performance } from 'node:perf_hooks'

const M = await import('../dist/compat/index.js')
const NOTES = 'CDEFGABc'
const SIZES = (process.env.SIZES ?? '512,2048,8192').split(',').map(Number)
/** 4x per step, so a quadratic pass shows 4x here. */
const LIMIT = Number(process.env.LIMIT ?? 2.2)

const bars = (n, decorate) => {
  let s = 'X:1\nM:4/4\nL:1/8\nK:C\n'
  for (let i = 0; i < n; i += 8) s += decorate(NOTES) + '|' + (i % 64 === 56 ? '\n' : '')
  return s + '\n'
}

/**
 * Each shape is a different pass — decorations reach the warning formatter and the element
 * emitter, lyrics the text lanes, ties and slurs the curve matching, chords the above-lane
 * stack, and ONE LONG LINE the horizontal solve and every backwards string search in the
 * projections. A quadratic in any of them shows here and nowhere else.
 */
const SHAPES = {
  plain: (b) => b,
  decorations: (b) => [...b].map((c) => '!trill!!staccato!' + c).join(''),
  chords: (b) => [...b].map((c) => '"Am"' + c).join(''),
  ties: (b) => [...b].join('-') + '-',
  slurs: (b) => '(' + b + ')',
  graces: (b) => [...b].map((c) => '{gag}' + c).join(''),
  tuplets: (b) => '(3' + b.slice(0, 3) + '(3' + b.slice(3, 6) + b.slice(6),
}

/** …and the same music with no line breaks at all, which is its own shape. */
const oneLongLine = (n) => {
  let s = 'X:1\nM:4/4\nL:1/8\nK:C\n'
  for (let i = 0; i < n; i += 8) s += NOTES + '|'
  return s + '\n'
}

/**
 * ⚠️ **THE HOST READS TOO.** Two of the three quadratics found were in the PROJECTIONS —
 * `tune.lines` and the warning formatter — not in the renderer, and a render-only harness
 * cannot reach either.
 */
const render = (abc) => {
  const out = M.renderAbc(new Array(M.numberOfTunes(abc)).fill('*'), abc, { staffwidth: 670 })
  for (const t of out) {
    void t.lines
    void t.warnings
  }
}

/** Microseconds per note, BEST of three — best rather than mean, to shed GC pauses. */
const perNote = (abc, n) => {
  render(abc)
  let best = Infinity
  for (let r = 0; r < 3; r += 1) {
    const t0 = performance.now()
    render(abc)
    best = Math.min(best, performance.now() - t0)
  }
  return (best * 1000) / n
}

const rows = []
let failed = 0
for (const [name, make] of [
  ...Object.entries(SHAPES).map(([k, f]) => [k, (n) => bars(n, f)]),
  ['one long line', oneLongLine],
]) {
  const costs = SIZES.map((n) => perNote(make(n), n))
  const growth = costs.slice(1).map((c, i) => c / costs[i])
  const worst = Math.max(...growth)
  const bad = worst >= LIMIT
  if (bad) failed += 1
  rows.push(
    `  ${bad ? 'RUNS AWAY' : '  linear  '} ${name.padEnd(15)} ` +
      SIZES.map((n, i) => `${n}:${costs[i].toFixed(1)}us${i === 0 ? '' : ` (${growth[i - 1].toFixed(2)}x)`}`).join('  '),
  )
}
console.log(`per-note cost across ${SIZES.join(' -> ')} notes; ${LIMIT}x is the limit, 4x would be quadratic\n`)
console.log(rows.join('\n'))
if (failed > 0) {
  console.error(`\nFAIL: ${failed} shape(s) superlinear`)
  process.exit(1)
}
