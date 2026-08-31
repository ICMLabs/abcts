/**
 * **abcjs IN A REAL BROWSER, AGAINST THE GOLDENS IT WAS HARVESTED INTO.**
 *
 * Every golden in this repo was made by `dump-svg.js`, which runs abcjs under jsdom and
 * PATCHES `getBBox` with WebKit-calibrated tables because jsdom has no layout engine
 * (`dump-svg.js:49-84`). So the corpus asserts "abcts matches abcjs GIVEN SYNTHETIC TEXT
 * METRICS" — see the header of `src/renderer/golden-widths.ts`, which says so and calls it
 * the point. What no gate here has ever asked is what abcjs draws when it measures text
 * for real, which is what a host that drops us in will be comparing against.
 *
 * This asks it. Headless Chrome — already on this Mac, so no new dependency and no
 * browser download — loads abcjs's own `dist/abcjs-basic-min.js`, renders at the goldens'
 * `{ staffwidth: 670 }`, and serialises with `outerHTML`, exactly as `dump-svg.js` does.
 *
 *   node scripts/zzbrowser.mjs [slug ...]     # default: a text-bearing sample
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const root = join(import.meta.dirname, '..')
const fixtures = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const goldens = join(root, 'tests', 'corpus-abcjs', 'golden')
const work = '/tmp/gp/browser'
mkdirSync(work, { recursive: true })

/**
 * A BATCH of cases in ONE Chrome launch — 691 launches is twelve minutes of process
 * startup and nothing else. Each case renders into its own slots and the page hands back
 * one JSON blob, which `--dump-dom` carries out in a `<pre>`.
 */
function inChromeBatch(cases) {
  const page = join(work, 'batch.html')
  writeFileSync(page,
`<!doctype html><meta charset="utf-8"><body><pre id="out"></pre>
<script src="file://${ABCJS}"></script>
<script>
const cases = ${JSON.stringify(cases)};
const out = {};
for (const c of cases) {
  try {
    const n = ABCJS.numberOfTunes(c.abc);
    const slots = [];
      // ⚠️ **`visibility:hidden`, NEVER `display:none`.** A `display:none` subtree has no
      // layout, so `getBBox()` answers 0 inside it — and abcjs measures AT DRAW TIME for a
      // boxed font (`draw/text.js:69`, `var size = elem.getBBox()`), so hiding the slots
      // that way made abcjs draw a degenerate box of pure padding (5x5 for `%%barlabelfont
      // … box`) while ours drew the real one. Two fixtures read as engine defects for a
      // whole session because of it. `visibility:hidden` still lays out.
    for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.style.position='absolute';d.style.visibility='hidden'; document.body.appendChild(d); slots.push(d); }
    ABCJS.renderAbc(slots, c.abc, { staffwidth: 670 });
    const svg = slots[c.tune] ? slots[c.tune].querySelector('svg') : null;
    out[c.slug] = svg ? svg.outerHTML : 'NO SVG';
  } catch (e) { out[c.slug] = 'THREW: ' + e.message; }
}
document.getElementById('out').textContent = JSON.stringify(out);
</script>`)
  const dom = execFileSync(CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=60000',
     '--dump-dom', `file://${page}`],
    { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)
  if (!m) throw new Error('no #out in the dumped DOM — the page did not run')
  const json = m[1]
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
  return JSON.parse(json)
}

/** One tune of one fixture, rendered by abcjs in Chrome. `outerHTML`, like the generator. */
function inChrome(abc, tune) {
  const page = join(work, 'page.html')
  writeFileSync(page,
`<!doctype html><meta charset="utf-8"><body><div id="paper"></div><pre id="out"></pre>
<script src="file://${ABCJS}"></script>
<script>
const abc = ${JSON.stringify(abc)};
const n = ABCJS.numberOfTunes(abc);
const slots = [];
for (let i = 0; i < n; i++) { const d = document.createElement('div'); document.body.appendChild(d); slots.push(d); }
ABCJS.renderAbc(slots, abc, { staffwidth: 670 });
const svg = slots[${tune}].querySelector('svg');
document.getElementById('out').textContent = svg ? svg.outerHTML : 'NO SVG';
</script>`)
  const dom = execFileSync(CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000',
     '--dump-dom', `file://${page}`],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)
  if (!m) throw new Error('no #out in the dumped DOM — the page did not run')
  return m[1]
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
}

const args = process.argv.slice(2)

/** Every case the byte gate has, enumerated the same way it enumerates them. */
function allCases() {
  const rows = []
  for (const f of readdirSync(fixtures).filter((x) => x.endsWith('.abc')).sort()) {
    const base = f.replace(/\.abc$/, '')
    const abc = readFileSync(join(fixtures, f), 'utf-8')
    if (existsSync(join(goldens, `${base}.svg`))) { rows.push({ slug: base, base, abc, tune: 0 }); continue }
    for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1)
      rows.push({ slug: `${base}-tune${i}`, base, abc, tune: i })
  }
  return rows
}

if (args[0] === '--all') {
  const cases = allCases()
  const CHUNK = 40
  const results = {}
  for (let i = 0; i < cases.length; i += CHUNK) {
    const chunk = cases.slice(i, i + CHUNK)
    Object.assign(results, inChromeBatch(chunk.map((c) => ({ slug: c.slug, abc: c.abc, tune: c.tune }))))
    process.stderr.write(`  ${Math.min(i + CHUNK, cases.length)}/${cases.length}\r`)
  }
  const off = []
  for (const c of cases) {
    const got = results[c.slug] ?? 'MISSING'
    const want = readFileSync(join(goldens, `${c.slug}.svg`), 'utf-8')
    if (got === want) continue
    const n = Math.min(got.length, want.length)
    let k = 0
    while (k < n && got[k] === want[k]) k += 1
    const h = (s) => /height="([\d.]+)"/.exec(s)?.[1]
    off.push({ slug: c.slug, at: k, chrome: h(got), jsdom: h(want),
               dh: h(got) && h(want) ? (Number(h(got)) - Number(h(want))).toFixed(4) : '?' })
  }
  const lines = [
    `abcjs 6.7.0 in real Chrome vs the jsdom-harvested goldens`,
    `${off.length} of ${cases.length} differ`,
    '',
    ...off.map((o) => `  ${o.slug.padEnd(46)} byte ${String(o.at).padStart(6)}  height ${o.chrome} vs ${o.jsdom}  Δ${o.dh}`),
  ]
  writeFileSync('/tmp/abcts-browser-vs-golden.txt', lines.join('\n') + '\n')
  console.log(lines.slice(0, 3).join('\n'))
  console.log(`  full table: /tmp/abcts-browser-vs-golden.txt`)
  process.exit(0)
}

const targets = args.length > 0 ? args : [
  'abcts-grace-order-and-lanes-tune26',  // title, chord, annotation, lyric, tempo, part
  'abcts-grace-order-and-lanes-tune0',   // title only
]
for (const slug of targets) {
  const m = /^(.*?)(?:-tune(\d+))?$/.exec(slug)
  let base = m[1], tune = m[2] === undefined ? 0 : Number(m[2])
  if (!existsSync(join(fixtures, `${base}.abc`))) { console.log(`${slug}: no fixture`); continue }
  const abc = readFileSync(join(fixtures, `${base}.abc`), 'utf-8')
  const golden = join(goldens, `${slug}.svg`)
  if (!existsSync(golden)) { console.log(`${slug}: no golden`); continue }
  const want = readFileSync(golden, 'utf-8')
  const got = inChrome(abc, tune)
  writeFileSync(join(work, `${slug}.chrome.svg`), got)
  if (got === want) { console.log(`${slug}: IDENTICAL to the jsdom golden`); continue }
  const n = Math.min(got.length, want.length)
  let i = 0
  while (i < n && got[i] === want[i]) i += 1
  console.log(`${slug}: DIFFERS at byte ${i} of ${want.length}`)
  console.log(`  chrome …${got.slice(Math.max(0, i - 45), i + 55)}`)
  console.log(`  jsdom  …${want.slice(Math.max(0, i - 45), i + 55)}`)
}
