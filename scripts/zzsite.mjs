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

/**
 * ⚠️ **THE LANDING FIXTURE IS CHOSEN, NOT `fixtures[0]`.** Alphabetically first is
 * `abcjs-parse-book_parser-01-example`, whose whole content is `X:43` and `T: example` —
 * and **a line with no note and no barline is DELETED** (`containsNotes` tests
 * `el_type === 'note' || 'bar'`), so BOTH engines correctly draw a title and no staff.
 * The site opened on it, rendered no score in either pane, and read as broken.
 *
 * A tool's first screen is a claim about what it does. This one has two staves, two
 * voices, lyrics and dynamics, so a glance says the page works.
 */
const DEFAULT_FIXTURE = fixtures.includes('abcjs-visual-multi-voice-01-score-top-bottom')
  ? 'abcjs-visual-multi-voice-01-score-top-bottom'
  : fixtures[0]

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
  /* A placeholder RESERVES HEIGHT, so the scrollbar is honest before anything renders and
     the observer does not fire for thirty fixtures at once just because they are all 20px
     tall and stacked inside one screen. Dropped once the fixture has rendered. */
  .fixture { border-top: 2px solid #8886; padding-top: .5rem; margin-top: 1.5rem; min-height: 60vh; }
  .fixture[data-done] { min-height: 0; }
  .fixture h3 { margin: 0 0 .5rem; font: 600 13px ui-monospace, monospace; color: GrayText; }
  .pending { color: GrayText; font-style: italic; margin: .25rem 0 1.5rem; }
  .tune { border-bottom: 1px solid #8883; padding: 1rem 0; }
  .head { display: flex; gap: .75rem; align-items: baseline; margin-bottom: .5rem; }
  .slug { font: 12px ui-monospace, monospace; color: GrayText; }
  .badge { font-size: 11px; padding: .1rem .45rem; border-radius: 999px; font-weight: 600; }
  .same { background: #1a7f37; color: #fff; }
  .diff { background: #b42318; color: #fff; }
  .div  { background: #8250df; color: #fff; }
  .pair { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
  .pane { min-width: 0; overflow-x: auto; }
  .pane h4 { margin: 0 0 .25rem; font-size: 11px; color: GrayText; text-transform: uppercase; letter-spacing: .06em; }
  .byte { font: 12px ui-monospace, monospace; color: GrayText; }
  .empty { margin: .25rem 0 0; font-size: 12px; color: GrayText; font-style: italic; }
  /* OVERLAY — abcjs in RED, abcts in CYAN, blended MULTIPLY.
     The first cut was magenta + cyan + screen, wrong twice over: screen LIGHTENS, so
     agreement washed out to near-white instead of reading as a match, and magenta x cyan
     is blue rather than black even under multiply. Red (1,0,0) x cyan (0,1,1) IS (0,0,0),
     so a perfect match reads BLACK, ink only abcjs has stays RED, ink only abcts has
     stays CYAN, and nothing else can appear. */
  .overlay .pair, .overlay-ext .pair { display: block; position: relative; background: #fff; }
  .overlay .pane, .overlay-ext .pane { position: absolute; inset: 0; overflow: visible; }
  .overlay .pane:nth-child(1) { position: relative; filter: url(#red); }
  .overlay .pane:nth-child(2) { filter: url(#cyan); mix-blend-mode: multiply; }
  .overlay .pane h4, .overlay-ext .pane h4 { display: none; }
  /* OVERLAY EXT — abcts STRICT in red under abcts EXTENDED in cyan. Same reading: black
     is agreement, red is ink only strict has, cyan only extended. This is the one that
     answers "where does extended depart from a rendering we know is abcjs-exact". */
  .overlay-ext .pane:nth-child(1) { display: none; }
  .overlay-ext .pane:nth-child(2) { position: relative; filter: url(#red); }
  .overlay-ext .pane:nth-child(3) { filter: url(#cyan); mix-blend-mode: multiply; display: block; }
  /* The extended pane is abcts's OWN engraving, not a parity target — it is out of the
     way in every view whose question is "do the two agree". */
  .overlay .pane.ext, .only-js .pane.ext, .only-ts .pane.ext { display: none; }
  .only-js .pane:nth-child(2), .only-ts .pane:nth-child(1),
  .only-ext .pane:nth-child(1), .only-ext .pane:nth-child(2) { display: none; }
  .only-js .pair, .only-ts .pair, .only-ext .pair { grid-template-columns: 1fr; }
  .overlay .pair { grid-template-columns: 1fr 1fr; }
  /* Extended is EXPECTED to differ; say when it does rather than leaving it ambiguous. */
  .extmark { font-size: 11px; padding: .1rem .45rem; border-radius: 999px; background: #0969da; color: #fff; font-weight: 600; }
  .extsame { font-size: 11px; padding: .1rem .45rem; border-radius: 999px; background: #57606a; color: #fff; font-weight: 600; }
  svg { max-width: none; }
</style>

<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="red"><feColorMatrix type="matrix" values="0 0 0 0 1   1 0 0 0 0   1 0 0 0 0   0 0 0 1 0"/></filter>
  <filter id="cyan"><feColorMatrix type="matrix" values="1 0 0 0 0   0 0 0 0 1   0 0 0 0 1   0 0 0 1 0"/></filter>
</defs></svg>

<header>
  <strong>abcjs 6.7.0 vs abcts</strong>
  <select id="fixture">${fixtures
    .map((f) => `<option${f === slug ? ' selected' : ''}>${f}</option>`)
    .join('')}</select>
  <span>
    <label><input type="radio" name="view" value="pair" checked> side by side</label>
    <label><input type="radio" name="view" value="overlay"> overlay js/ts</label>
    <label><input type="radio" name="view" value="overlay-ext"> overlay strict/ext</label>
    <label><input type="radio" name="view" value="only-js"> abcjs</label>
    <label><input type="radio" name="view" value="only-ts"> abcts</label>
    <label><input type="radio" name="view" value="only-ext"> extended</label>
  </span>
  <label><input type="checkbox" id="onlyDiff"> only differing</label>
  <label><input type="checkbox" id="onlyDrift"> only extended drift</label>
  <span id="summary" class="byte"></span>
</header>
<main id="out">loading both engines…</main>

<script src="/engine/abcjs.js"></script>
<script src="/engine/abcts.js"></script>
<script>
const slug = ${JSON.stringify(slug)};
const FIXTURES = ${JSON.stringify(fixtures)};
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
    // AN EMPTY PANE AND A BROKEN ONE LOOK THE SAME, so say which this is. A tune with no
    // note and no barline draws NO STAFF in both engines, by design.
    if (svg && !svg.querySelector('path, rect, use')) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = 'no staff drawn — this tune has no note and no barline';
      host.appendChild(note);
    }
    return svg ? svg.outerHTML : 'NO SVG';
  } catch (e) { host.textContent = 'THREW: ' + e.message; return 'THREW: ' + e.message; }
}

/**
 * **ONE CONTINUOUS SCROLL OVER ALL 231 FIXTURES, RENDERED LAZILY.**
 *
 * A dropdown per fixture made the page a lookup, and what a visual pass needs is a WALK —
 * you cannot notice that something is subtly off in a hundred tunes you have to click
 * through one at a time.
 *
 * ⚠️ **IT MUST BE LAZY.** 691 tunes rendered twice is ~1,400 engravings; doing that
 * eagerly locks the tab for minutes and the browser may kill it. Every fixture gets an
 * empty placeholder immediately — cheap, so the scrollbar is honest about the length —
 * and an IntersectionObserver renders each one as it comes near. The dropdown becomes a
 * JUMP, not a filter.
 */
const sections = new Map();

function shell(name) {
  const sec = document.createElement('section');
  sec.className = 'fixture';
  sec.id = 'f-' + name;
  sec.innerHTML = '<h3>' + name + '</h3><div class="tunes"><p class="pending">…</p></div>';
  sections.set(name, sec);
  return sec;
}

async function renderFixture(name) {
  const sec = sections.get(name);
  if (!sec || sec.dataset.started) return;
  /**
   * ⚠️ **"started" and "done" ARE TWO FLAGS, AND MERGING THEM RENDERED INTO A HIDDEN
   * SUBTREE — WHICH abcjs CANNOT MEASURE.**
   *
   * renderFixture awaits a fetch, so several run interleaved: A starts, awaits; B
   * starts, awaits; A finishes and calls applyView, which saw B already flagged and with
   * no visible tunes yet and set B.hidden — display:none. B then rendered inside it.
   *
   * **abcjs measures a boxed font AT DRAW TIME** — var size = elem.getBBox()
   * (draw/text.js:69) — and a display:none subtree has NO LAYOUT, so getBBox()
   * answers 0 and abcjs bakes a degenerate box of pure padding. Measured on
   * visual-tablature-15: abcjs 86,108 bytes against 86,124, first differing byte 1965,
   * and on screen a 5x5 box beside AABB where abcts draws the real one. The site then
   * badged it "differs" — **a filter that manufactured the differences it was filtering
   * for**, which is why it only appeared with "only differing" ticked.
   *
   * Ours is unaffected because it measures from its own metric tables rather than the DOM.
   * The repo's own note about visibility:hidden versus display:none says exactly this;
   * it was obeyed for the sibling slots and then broken here by the filter.
   */
  sec.dataset.started = '1';
  // A section hidden by the filter must be shown again before anything renders into it.
  sec.hidden = false;
  const host = sec.querySelector('.tunes');
  let abc;
  try { abc = await (await fetch('/abc/' + encodeURIComponent(name))).text(); }
  catch (e) { host.innerHTML = '<p class="pending">could not load: ' + e.message + '</p>'; return; }
  host.textContent = '';
  const count = window.ABCJS.numberOfTunes(abc);
  for (let t = 0; t < count; t++) {
    const tuneSlug = count === 1 ? name : name + '-tune' + t;
    const wrap = document.createElement('div');
    wrap.className = 'tune';
    wrap.innerHTML = '<div class="head"><span class="slug"></span><span class="badge"></span>' +
      '<span class="byte"></span><span class="ext"></span></div><div class="pair">' +
      '<div class="pane"><h4>abcjs</h4></div><div class="pane"><h4>abcts strict</h4></div>' +
      '<div class="pane ext"><h4>abcts extended</h4></div></div>';
    host.appendChild(wrap);
    const panes = wrap.querySelectorAll('.pane');
    const js = renderInto(window.ABCJS, abc, t, panes[0]);
    const ts = renderInto(window.ABCTS, abc, t, panes[1]);
    // ⚠️ A PHANTOM SLOT PRODUCES NO SVG IN EITHER ENGINE, AND IS NOT A TUNE.
    // numberOfTunes is abc.split(newline + X:).length with a floor of 1 — a SPLIT, not a
    // parse (api/abc_tunebook.js:13-18) — so it over-counts whenever the text holds an X:
    // that opens no tune. Eleven for the ten tunes of abcts-slur-shapes, nine for the
    // eight of abcts-endings, two for the one of abcjs-visual-wrap-02. renderAbc still
    // needs a slot per COUNT, so the extra slot is passed and its empty row dropped here.
    // Both engines agree on the count, which is why the row was blank on both sides.
    if (js === 'NO SVG' && ts === 'NO SVG') { wrap.remove(); continue; }
    /**
     * THE THIRD COLUMN IS abcts's OTHER MODE, reached through core because compat's
     * renderAbc hard-wires abcjs-strict and AbcjsParams has no mode.
     *
     * ⚠️ IT IS A PARITY TARGET NOW, and this column used to make that impossible to see.
     * Owner's rule, 2026-09-07: extended is byte-compatible with strict except where a
     * divergence is declared. So the ONLY thing that may differ here is the mode — which
     * means every other render option must match what compat passes, and two of them did
     * not:
     *
     *   - classes. Panes 1 and 2 are abcjs's vocabulary; this pane asked for core's, so it
     *     took a different emitter path entirely. That is what dropped the BOX round a
     *     %%titlefont … box row: the box is drawn in the abcjs branch and the core branch
     *     has no equivalent. Nothing to do with the mode.
     *   - staffwidth. core.render has NO SUCH OPTION — the key is systemWidth — so this
     *     pane was rendering at the engine default while the other two rendered at 670,
     *     and every row differed by the page width before a note was drawn.
     *
     * A pipeline difference reported as a mode defect is the whole reason this column
     * looked "way out of whack". Held equal, it is tests/mode-bytes.test.ts in a browser.
     */
    // ⚠️ systemWidth IS THE PAGE, staffwidth IS THE MUSIC AREA — and core.render has no
    // 'staffwidth' at all, so the old { staffwidth: 670 } here was silently DROPPED and
    // this pane rendered at the engine default. compat computes staffwidth + 2 * margin,
    // which is the 700 the goldens are generated at (compat/index.ts:916).
    // ⚠️ AND staffSpace TOO. toSVG defaults to 8 px per staff space; compat passes abcjs's
    // own 7.75 (STAFF_SPACE_PX), so a core render at the default came out 32/31 too wide —
    // 722.58 for a 700px page — with every glyph scaled to match. Three options had to be
    // held equal before "extended vs strict" was a question about the MODE at all.
    const CORE_OPTS = { systemWidth: 700, staffSpace: 7.75, classes: 'abcjs', optimizeSVG: false };
    const extPane = wrap.querySelector('.pane.ext');
    let ext = null;
    try {
      const parsed = window.ABCTS.core.parse(abc, { mode: 'abcjs-extended' });
      const score = parsed.ok && parsed.scores ? parsed.scores[t] : null;
      ext = score ? window.ABCTS.core.render(score, { mode: 'abcjs-extended', ...CORE_OPTS }) : null;
      if (ext) extPane.insertAdjacentHTML('beforeend', ext);
    } catch (e) { extPane.insertAdjacentHTML('beforeend', '<p class="empty">threw: ' + e.message + '</p>'); }
    /**
     * ⚠️ AN OVERLAY MAKES 1.75px LOOK LIKE A CATASTROPHE. Red-on-cyan separation is
     * violently visible at two pixels, so every tune reads as broken and none can be
     * ranked. Measured on visual-layout-03, a tune with no extended feature at all: same
     * width, same 48 noteheads, dy 0 EVERYWHERE, dx at most 1.75 — decaying to zero across
     * each line as the justification absorbs a slightly wider prefix.
     *
     * So the NUMBER goes beside the badge, and a reader can tell a font's glyph widths
     * from a defect. That is the difference between a picture and a measurement.
     */
    // ⚠️ The page is a TEMPLATE LITERAL, so a regex in it needs its backslashes DOUBLED —
    // the first cut emitted /translate(([-d.]+),([-d.]+))/ and matched nothing, so every
    // row fell into the "different glyph count" arm and all 577 were flagged as drifting.
    const noteAt = (svg) => [...svg.matchAll(/<(?:path|use)[^>]*class="abcjs-notehead"[^>]*transform="translate\\(([-\\d.]+),([-\\d.]+)\\)/g)]
      .map((m) => ({ x: +m[1], y: +m[2] }));
    /**
     * ⚠️ **THE TWO PANES USED TO SPEAK DIFFERENT MARKUP** — panes 1 and 2 in abcjs's
     * vocabulary, pane 3 in core's abcts-note — so a class comparison matched NOTHING on
     * the strict side and all 577 rows were flagged. Both speak abcjs's now, because the
     * pane asks for it; the strict side is still rendered through CORE for the number, so
     * the comparison is mode against mode with the pipeline held equal.
     */
    let drift = null;
    let stc = null;
    if (ext !== null) {
      try {
        const psx = window.ABCTS.core.parse(abc, { mode: 'abcjs-strict' });
        stc = psx.ok && psx.scores ? window.ABCTS.core.render(psx.scores[t], { mode: 'abcjs-strict', ...CORE_OPTS }) : null;
      } catch (e) { stc = null; }
      const a = noteAt(stc ?? ''), b = noteAt(ext);
      if (a.length === b.length && a.length > 0) {
        let mx = 0, my = 0;
        for (let i = 0; i < a.length; i++) {
          mx = Math.max(mx, Math.abs(b[i].x - a[i].x));
          my = Math.max(my, Math.abs(b[i].y - a[i].y));
        }
        drift = { mx, my, n: a.length };
      }
    }
    const mark = wrap.querySelector('.ext');
    if (ext === null) { mark.className = 'empty'; mark.textContent = 'extended: no score'; }
    // BYTE-EQUAL is the expected answer now, not a happy accident — see the note above.
    else if (stc !== null && ext === stc) { mark.className = 'extsame'; mark.textContent = 'extended = strict (byte-equal)'; }
    else if (drift === null) { mark.className = 'extmark'; mark.textContent = 'extended: different glyph count'; wrap.dataset.drift = '1'; }
    else {
      const big = drift.mx > 4 || drift.my > 0.5;
      mark.className = big ? 'extmark' : 'extsame';
      mark.textContent = 'vs strict: dx ' + drift.mx.toFixed(2) + '  dy ' + drift.my.toFixed(2) + '  over ' + drift.n;
      if (big) wrap.dataset.drift = '1';
    }
    wrap.querySelector('.slug').textContent = tuneSlug;
    const badge = wrap.querySelector('.badge');
    if (js === ts) { badge.className = 'badge same'; badge.textContent = 'identical'; tally.same++; }
    else if (DIVERGENT.has(tuneSlug)) { badge.className = 'badge div'; badge.textContent = 'divergent, declared'; tally.div++; wrap.dataset.differs = '1'; }
    else {
      badge.className = 'badge diff'; badge.textContent = 'differs'; tally.diff++;
      let i = 0; while (i < Math.min(js.length, ts.length) && js[i] === ts[i]) i++;
      wrap.querySelector('.byte').textContent = 'first differing byte ' + i;
      wrap.dataset.differs = '1';
    }
  }
  sec.dataset.done = '1';
  tally.fixtures++;
  updateSummary();
  applyView();
}

const tally = { fixtures: 0, same: 0, diff: 0, div: 0 };
function updateSummary() {
  summary.textContent = tally.fixtures + '/' + FIXTURES.length + ' fixtures rendered · ' +
    tally.same + ' identical · ' + tally.diff + ' differ · ' + tally.div + ' declared divergent';
}

function applyView() {
  const view = document.querySelector('input[name=view]:checked').value;
  out.className = view === 'pair' ? '' : view;
  const onlyDiff = document.getElementById('onlyDiff').checked;
  const onlyDrift = document.getElementById('onlyDrift').checked;
  for (const s of out.querySelectorAll('.tune'))
    s.hidden = (onlyDiff && !s.dataset.differs) || (onlyDrift && !s.dataset.drift);
  // A fixture whose every tune is hidden should not leave its heading behind.
  for (const f of out.querySelectorAll('.fixture')) {
    const shown = [...f.querySelectorAll('.tune')].some((t) => !t.hidden);
    // ONLY a finished section may be hidden — see the two-flag note in renderFixture.
    f.hidden = (onlyDiff || onlyDrift) && f.dataset.done === '1' && !shown;
  }
}

// rootMargin renders a screen or two ahead, so scrolling at a normal speed never waits.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) renderFixture(e.target.id.slice(2));
}, { rootMargin: '800px 0px' });

function start() {
  out.textContent = '';
  for (const name of FIXTURES) { const sec = shell(name); out.appendChild(sec); io.observe(sec); }
  updateSummary();
  const target = document.getElementById('f-' + slug);
  if (target && slug !== FIXTURES[0]) target.scrollIntoView();
}

document.getElementById('fixture').addEventListener('change', (e) => {
  const name = e.target.value;
  history.replaceState(null, '', '/f/' + encodeURIComponent(name));
  renderFixture(name).then(() => document.getElementById('f-' + name)?.scrollIntoView());
  document.getElementById('f-' + name)?.scrollIntoView();
});
for (const r of document.querySelectorAll('input[name=view]')) r.addEventListener('change', applyView);
document.getElementById('onlyDiff').addEventListener('change', applyView);
document.getElementById('onlyDrift').addEventListener('change', applyView);

// Keep the dropdown showing whichever fixture is on screen, so it reads as a position
// rather than a selection once you have scrolled away from it.
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    document.getElementById('fixture').value = e.target.id.slice(2);
    break;
  }
}, { rootMargin: '-10% 0px -80% 0px' });

if (typeof window.ABCJS?.renderAbc !== 'function' || typeof window.ABCTS?.renderAbc !== 'function')
  out.textContent = 'engines did not load — run: npm run build';
else { start(); for (const s of out.querySelectorAll('.fixture')) spy.observe(s); }
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
  const slug = url.startsWith('/f/') ? url.slice('/f/'.length) : DEFAULT_FIXTURE
  return send('text/html; charset=utf-8', PAGE(fixtures.includes(slug) ? slug : DEFAULT_FIXTURE))
})

const port = Number(process.env.PORT ?? 8788)
server.listen(port, '127.0.0.1', () => {
  console.log(`abcjs vs abcts — ${fixtures.length} fixtures`)
  console.log(`  http://127.0.0.1:${port}`)
})
