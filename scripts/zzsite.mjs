/**
 * **BOTH ENGINES, EVERY TEST TUNE, IN A BROWSER YOU CAN LOOK AT.**
 *
 *   npm run build && node scripts/zzsite.mjs        # http://127.0.0.1:8788
 *   PORT=9000 node scripts/zzsite.mjs
 *
 * `zzlive.mjs` puts abcjs and abcts in one page and diffs 685 tunes, and answers "do the
 * bytes agree" — which is the gate. This serves the SAME page to a human, because a byte
 * comparison cannot say whether a difference MATTERS, and a green one cannot say whether
 * the two agree on something they are both wrong about. **The next input this repo needs
 * is a human visual pass**, and it had nowhere to happen.
 *
 * ── WHY IT IS LIVE AND NOT A GOLDEN ─────────────────────────────────────────
 * `npm run compare` puts our render beside abcjs's STORED SVGs, harvested under JSDOM with
 * a patched `getBBox`. That is the right target headless and the wrong one in a browser:
 * abcjs does not render byte-identically in WebKit and Blink (230 of 691), so there is no
 * single stored answer. Both engines running in the SAME browser is the only coherent
 * comparison, which is why this loads two `<script>` tags rather than any golden.
 *
 * ── THE THREE VIEWS ─────────────────────────────────────────────────────────
 *   SIDE BY SIDE  the default. abcjs left, abcts right.
 *   OVERLAY       abcjs in magenta under abcts in cyan — a perfect match reads BLACK and
 *                 any colour is a discrepancy. This is the Workbench's trick and it is
 *                 valid here because strict is a byte-parity target: the two are MEANT to
 *                 coincide exactly, unlike core's own engraving style.
 *   ABCJS / ABCTS one engine alone, for judging a rendering on its own terms.
 *
 * ⚠️ **NEEDS `npm run build` FIRST** — it serves `dist/abcts-browser.global.js`, and a
 * stale bundle would show you yesterday's engine. It fails loudly if the file is missing,
 * never silently skipping, because a page that renders nothing reads exactly like a pass.
 *
 * ⚠️ **`visibility:hidden`, NEVER `display:none`** for measuring slots — a `display:none`
 * subtree has no layout so `getBBox()` answers 0, and abcjs measures AT DRAW TIME for a
 * boxed font. Two fixtures read as engine defects for a whole session because of it. This
 * page renders visibly, so it does not hit that, but the same rule applies to any slot
 * added here later.
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const ABCJS = join(root, config.abcjsRef, 'dist/abcjs-basic-min.js')
const OURS = join(root, 'dist/abcts-browser.global.js')
const fixturesDir = join(root, 'tests', 'corpus-abcjs', 'fixtures')

for (const [what, p] of [['abcjs', ABCJS], ['the abcts bundle', OURS]]) {
  if (!existsSync(p)) {
    console.error(`${what} is missing at ${p}`)
    if (p === OURS) console.error('Run `npm run build` first.')
    process.exit(1)
  }
}

const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.abc'))
  .sort()
  .map((f) => f.replace(/\.abc$/, ''))

/** The slugs `svg-bytes` declines to reproduce — labelled here rather than hidden. */
const DIVERGENT = new Set([
  'abcts-rests-and-bars-tune14',
  'abcts-unknown-clef-tune0',
  'abcts-unknown-clef-tune1',
  'abcts-unknown-clef-tune2',
  'abcts-unknown-clef-tune3',
  'abcts-unknown-clef-tune4',
])

const PAGE = (slug) => `<!doctype html>
<meta charset="utf-8">
<title>${slug} — abcjs vs abcts</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px system-ui, sans-serif; margin: 0; }
  header { position: sticky; top: 0; background: Canvas; border-bottom: 1px solid #8888;
           padding: .6rem 1rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; z-index: 9; }
  select, button { font: inherit; }
  main { padding: 1rem; }
  .tune { border-bottom: 1px solid #8883; padding: 1rem 0; }
  .head { display: flex; gap: .75rem; align-items: baseline; margin-bottom: .5rem; }
  .slug { font: 12px ui-monospace, monospace; color: GrayText; }
  .badge { font-size: 11px; padding: .1rem .45rem; border-radius: 999px; font-weight: 600; }
  .same { background: #1a7f37; color: #fff; }
  .diff { background: #b42318; color: #fff; }
  .div  { background: #8250df; color: #fff; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .pane { min-width: 0; overflow-x: auto; }
  .pane h4 { margin: 0 0 .25rem; font-size: 11px; color: GrayText; text-transform: uppercase; letter-spacing: .06em; }
  .byte { font: 12px ui-monospace, monospace; color: GrayText; }
  /* OVERLAY — abcjs magenta UNDER abcts cyan. A perfect match reads black. */
  .overlay .pair { display: block; position: relative; }
  .overlay .pane { position: absolute; inset: 0; }
  .overlay .pane:first-child { position: relative; filter: url(#magenta); }
  .overlay .pane:last-child { filter: url(#cyan); mix-blend-mode: screen; }
  .overlay .pane h4 { display: none; }
  .only-js .pane:last-child, .only-ts .pane:first-child { display: none; }
  .only-js .pair, .only-ts .pair { grid-template-columns: 1fr; }
  svg { max-width: none; }
</style>

<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="magenta"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0  0 0 0 0 1  0 0 0 -1 1"/></filter>
  <filter id="cyan"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 1  0 0 0 0 1  0 0 0 -1 1"/></filter>
</defs></svg>

<header>
  <strong>abcjs 6.7.0 vs abcts</strong>
  <select id="fixture">${fixtures
    .map((f) => `<option${f === slug ? ' selected' : ''}>${f}</option>`)
    .join('')}</select>
  <span>
    <label><input type="radio" name="view" value="pair" checked> side by side</label>
    <label><input type="radio" name="view" value="overlay"> overlay</label>
    <label><input type="radio" name="view" value="only-js"> abcjs</label>
    <label><input type="radio" name="view" value="only-ts"> abcts</label>
  </span>
  <label><input type="checkbox" id="onlyDiff"> only differing</label>
  <span id="summary" class="byte"></span>
</header>
<main id="out">loading both engines…</main>

<script src="/engine/abcjs.js"></script>
<script src="/engine/abcts.js"></script>
<script>
const slug = ${JSON.stringify(slug)};
const DIVERGENT = new Set(${JSON.stringify([...DIVERGENT])});
const out = document.getElementById('out');
const summary = document.getElementById('summary');

// One slot per tune, because renderAbc renders ONE TUNE PER OUTPUT SLOT — a single div
// gets the FIRST tune and nothing else. Same reason zzlive builds an array.
function renderInto(API, abc, tuneIndex, host) {
  try {
    const count = API.numberOfTunes(abc);
    const slots = [];
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      if (i !== tuneIndex) { d.style.position = 'absolute'; d.style.visibility = 'hidden'; document.body.appendChild(d); }
      else host.appendChild(d);
      slots.push(d);
    }
    API.renderAbc(slots, abc, { staffwidth: 670 });
    for (let i = 0; i < slots.length; i++) if (i !== tuneIndex) slots[i].remove();
    const svg = host.querySelector('svg');
    return svg ? svg.outerHTML : 'NO SVG';
  } catch (e) { host.textContent = 'THREW: ' + e.message; return 'THREW: ' + e.message; }
}

async function load(name) {
  out.textContent = 'rendering…';
  const abc = await (await fetch('/abc/' + encodeURIComponent(name))).text();
  out.textContent = '';
  const count = window.ABCJS.numberOfTunes(abc);
  let same = 0, diff = 0, div = 0;
  for (let t = 0; t < count; t++) {
    const tuneSlug = count === 1 ? name : name + '-tune' + t;
    const wrap = document.createElement('section');
    wrap.className = 'tune';
    wrap.innerHTML = '<div class="head"><span class="slug"></span><span class="badge"></span>' +
      '<span class="byte"></span></div><div class="pair">' +
      '<div class="pane"><h4>abcjs</h4></div><div class="pane"><h4>abcts</h4></div></div>';
    out.appendChild(wrap);
    const panes = wrap.querySelectorAll('.pane');
    const js = renderInto(window.ABCJS, abc, t, panes[0]);
    const ts = renderInto(window.ABCTS, abc, t, panes[1]);
    wrap.querySelector('.slug').textContent = tuneSlug;
    const badge = wrap.querySelector('.badge');
    const isDiv = DIVERGENT.has(tuneSlug);
    if (js === ts) { badge.className = 'badge same'; badge.textContent = 'identical'; same++; }
    else if (isDiv) { badge.className = 'badge div'; badge.textContent = 'divergent, declared'; div++; }
    else {
      badge.className = 'badge diff'; badge.textContent = 'differs'; diff++;
      let i = 0; while (i < Math.min(js.length, ts.length) && js[i] === ts[i]) i++;
      wrap.querySelector('.byte').textContent = 'first differing byte ' + i;
      wrap.dataset.differs = '1';
    }
    if (js !== ts) wrap.dataset.differs = '1';
  }
  summary.textContent = same + ' identical · ' + diff + ' differ · ' + div + ' declared divergent';
  applyView();
}

function applyView() {
  const view = document.querySelector('input[name=view]:checked').value;
  out.className = view === 'pair' ? '' : view;
  const onlyDiff = document.getElementById('onlyDiff').checked;
  for (const s of out.querySelectorAll('.tune')) s.hidden = onlyDiff && !s.dataset.differs;
}

document.getElementById('fixture').addEventListener('change', (e) => {
  history.replaceState(null, '', '/f/' + encodeURIComponent(e.target.value));
  load(e.target.value);
});
for (const r of document.querySelectorAll('input[name=view]')) r.addEventListener('change', applyView);
document.getElementById('onlyDiff').addEventListener('change', applyView);

if (typeof window.ABCJS?.renderAbc !== 'function' || typeof window.ABCTS?.renderAbc !== 'function')
  out.textContent = 'engines did not load — run: npm run build';
else load(slug);
</script>`

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  const send = (type, body) => {
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  }
  if (url === '/engine/abcjs.js') return send('text/javascript', readFileSync(ABCJS))
  if (url === '/engine/abcts.js') return send('text/javascript', readFileSync(OURS))
  if (url.startsWith('/abc/')) {
    const name = url.slice('/abc/'.length)
    if (!fixtures.includes(name)) {
      res.writeHead(404)
      return res.end('unknown fixture')
    }
    return send('text/plain; charset=utf-8', readFileSync(join(fixturesDir, `${name}.abc`)))
  }
  const slug = url.startsWith('/f/') ? url.slice('/f/'.length) : fixtures[0]
  return send('text/html; charset=utf-8', PAGE(fixtures.includes(slug) ? slug : fixtures[0]))
})

const port = Number(process.env.PORT ?? 8788)
server.listen(port, '127.0.0.1', () => {
  console.log(`abcjs vs abcts — ${fixtures.length} fixtures`)
  console.log(`  http://127.0.0.1:${port}`)
})
