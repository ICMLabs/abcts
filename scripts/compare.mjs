/**
 * Visual comparison against the abcjs goldens.
 *
 *   npm run compare            # every fixture
 *   npm run compare simple-c   # one
 *   npm run compare -- --open
 *
 * Builds an HTML page holding both renderings of each fixture, in two modes.
 *
 * ── WHY TWO MODES ─────────────────────────────────────────────────────────────
 * abcMusicKitWorkbench compares v1 against abcjs by OVERLAYING them — Swift in cyan over
 * abcjs in magenta, so a perfect match reads as black and any colour is a discrepancy.
 * That works because v1 is a byte-parity port of abcjs: identical pixel coordinates, so
 * the two images are meant to coincide exactly.
 *
 * abcts core is NOT that. It renders in its own style by deliberate decision — its own
 * spacing engine (abcm2ps's √duration curve, justified) and its own unit system (staff
 * spaces, staff centred on y=0, against abcjs's pixels with the staff at y=77). Overlaid
 * raw, the two would simply not align, and the picture would say nothing.
 *
 * So:
 *   SIDE BY SIDE  — the honest default. For judging whether core's engraving reads as
 *                   well as abcjs's, which is a question only a human can answer and
 *                   which no gate in this repo asks.
 *   OVERLAY       — the Workbench's trick, adapted: both are scaled to a common staff
 *                   space and aligned on the first staff line. Horizontal disagreement
 *                   is then EXPECTED (different spacing engines), but vertical
 *                   disagreement is not — a notehead at the wrong height is a wrong
 *                   pitch, and it shows up immediately as colour fringing.
 *
 * The overlay becomes a true match test only when compat mode exists, which is zero code
 * today. At that point this script points at compat and black means byte parity.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const config = JSON.parse(readFileSync(new URL('../abcts.config.json', import.meta.url), 'utf8'))
const CORPUS = resolve(config.corpus)
const GOLDENS = resolve(config.goldens)
const OUT = resolve('compare-output')

const args = process.argv.slice(2)
const open = args.includes('--open')
const only = args.filter((a) => !a.startsWith('-'))

/** abcjs's staff space: its STEP constant is half a space. */
const ABCJS_STAFF_SPACE = 7.75
/** Where abcjs puts the top staff line, from `simple-c.svg` and every other golden. */
const ABCJS_STAFF_TOP = 77.2

const fixtures = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.abc'))
  .map((f) => basename(f, '.abc'))
  .filter((name) => only.length === 0 || only.includes(name))
  .sort()

if (fixtures.length === 0) {
  console.error(only.length ? `no fixture matched ${only.join(', ')}` : 'no fixtures found')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const cards = []
for (const name of fixtures) {
  // The golden holds the FIRST tune only, so core renders the first tune too — comparing
  // a whole tunebook against one tune would look like a catastrophic difference.
  let ours
  try {
    ours = execFileSync(
      'node',
      ['dist/cli.js', join(CORPUS, `${name}.abc`), '--first'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
  } catch (error) {
    cards.push({ name, error: String(error).slice(0, 200) })
    continue
  }

  const goldenPath = join(GOLDENS, `${name}.svg`)
  const theirs = existsSync(goldenPath) ? readFileSync(goldenPath, 'utf8') : null

  // Align the overlay on the staff: scale ours to abcjs's staff space, then shift so the
  // top staff lines coincide. Our staff's top line is at y = -2 staff spaces, and the
  // viewBox's minY tells us where that sits inside the image.
  const viewBox = /viewBox="([^"]+)"/.exec(ours)?.[1]?.split(' ').map(Number) ?? [0, 0, 0, 0]
  const minY = viewBox[1] ?? 0
  const scale = ABCJS_STAFF_SPACE / 8 // our CLI renders at 8px per staff space
  const ourStaffTopPx = (-2 - minY) * 8 * scale
  const shift = ABCJS_STAFF_TOP - ourStaffTopPx

  cards.push({ name, ours, theirs, scale, shift })
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const html = `<!doctype html>
<meta charset="utf-8">
<title>abcts vs abcjs — ${fixtures.length} fixtures</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: Canvas; color: CanvasText; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .lede { opacity: .75; max-width: 70ch; margin: 0 0 24px; }
  .card { border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: 8px; margin: 0 0 20px; overflow: hidden; }
  .card > h2 { font-size: 14px; margin: 0; padding: 10px 14px; background: color-mix(in srgb, CanvasText 6%, transparent); font-weight: 600; }
  .panes { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: color-mix(in srgb, CanvasText 12%, transparent); }
  .pane { background: white; padding: 12px; overflow-x: auto; }
  .pane > .tag { font: 11px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .06em; color: #666; margin-bottom: 8px; }
  .overlay { background: white; padding: 12px; position: relative; overflow-x: auto; display: none; }
  .overlay .layer { position: absolute; top: 12px; left: 12px; }
  /* The Workbench's trick: ours cyan over theirs magenta. Agreement reads dark. */
  .overlay .ours { color: #0ff; mix-blend-mode: multiply; }
  .overlay .theirs { color: #f0f; mix-blend-mode: multiply; }
  body.overlay-mode .panes { display: none; }
  body.overlay-mode .overlay { display: block; }
  .bar { position: sticky; top: 0; background: Canvas; padding: 8px 0 16px; z-index: 5; }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); background: Canvas; color: CanvasText; cursor: pointer; }
  .err { padding: 12px; color: #b00; font-family: ui-monospace, monospace; font-size: 12px; }
  .missing { padding: 12px; opacity: .6; font-style: italic; }
</style>
<h1>abcts vs abcjs</h1>
<p class="lede">
  Side by side is the honest default: core renders in its own style by design, so the two
  are <em>not</em> meant to be identical — the question is whether core's engraving reads
  as well. Overlay aligns both on the first staff line and tints ours cyan over abcjs
  magenta, the way abcMusicKitWorkbench compares v1. Horizontal disagreement there is
  expected (different spacing engines); <strong>vertical</strong> disagreement is not — a
  notehead at the wrong height is a wrong pitch.
</p>
<div class="bar"><button id="toggle">Show overlay</button></div>
${cards
  .map((c) => {
    if (c.error) return `<div class="card"><h2>${esc(c.name)}</h2><div class="err">${esc(c.error)}</div></div>`
    if (!c.theirs)
      return `<div class="card"><h2>${esc(c.name)}</h2><div class="missing">no abcjs golden for this fixture</div></div>`
    return `<div class="card"><h2>${esc(c.name)}</h2>
  <div class="panes">
    <div class="pane"><div class="tag">abcts</div>${c.ours}</div>
    <div class="pane"><div class="tag">abcjs (golden)</div>${c.theirs}</div>
  </div>
  <div class="overlay">
    <div class="layer theirs">${c.theirs}</div>
    <div class="layer ours" style="transform: translateY(${c.shift.toFixed(2)}px) scale(${c.scale.toFixed(5)}); transform-origin: 0 0;">${c.ours}</div>
    <div style="visibility:hidden">${c.theirs}</div>
  </div>
</div>`
  })
  .join('\n')}
<script>
  const b = document.body, t = document.getElementById('toggle')
  t.onclick = () => {
    b.classList.toggle('overlay-mode')
    t.textContent = b.classList.contains('overlay-mode') ? 'Show side by side' : 'Show overlay'
  }
</script>
`

const path = join(OUT, 'index.html')
writeFileSync(path, html)
console.log(`  ${fixtures.length} fixture(s) → ${path}`)
if (open) execFileSync('open', [path])
