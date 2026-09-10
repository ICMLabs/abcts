/**
 * **THE INTERACTIVE SURFACE — WHAT HAPPENS AFTER A USER TOUCHES THE SCORE.**
 *
 * Every other gate here compares MARKUP. `zzselect` proves the selectable array and its
 * attributes are abcjs's; nothing proved that CLICKING one does what abcjs does, because
 * no gate in this repo had ever dispatched an event.
 *
 * **IT OPENED AT EVERY CASE**, 2026-09-09, for one reason: `setupSelection`
 * (`write/interactive/selection.js`, 424 lines) was unported, so abcts attached no DOM
 * event listeners at all and a host's `clickListener` was never called. `ABCJS.Editor`
 * installs one (`compat/editor.ts:281`), so its score-to-caret direction was dead too.
 *
 * **THE INPUT IS SYNTHETIC ON PURPOSE.** A real `page.mouse.click` makes the BROWSER
 * compute `offsetX`/`layerX`, which is the very quirk `getBestMatchCoordinates` exists to
 * paper over — so a comparison driven that way measures WebKit as much as it measures us.
 * Each event here carries explicitly defined `offsetX/Y` and `layerX/Y`, so both engines
 * are handed the identical object and the browser-quirk arithmetic is exercised
 * deterministically.
 *
 * **AND BOTH ENGINES RENDER INTO THE SAME DIV, ONE AFTER THE OTHER**, so the coordinates
 * are literally the same numbers rather than two engines' idea of the same place.
 * `zzlive` is 0 of 685, so their geometry agrees; if it ever stops agreeing this gate
 * going red is correct rather than confusing.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzclick.mjs [every]
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
 * `[label, params]`. `dragging` is the arm that adds `tabindex`, the keyboard handlers and
 * the `abcjs-dragging-in-progress` class; without it a click still selects and notifies.
 */
/**
 * `[label, params, declared]`. `declared` is how many fixtures differ TODAY for a reason
 * that is not the interactive port. A row that goes UP fails; one that goes DOWN says this
 * comment is out of date.
 *
 * ⚠️ **THE ONE DECLARED FIXTURE IS `staffPos`, AND IT IS A LAYOUT DIFFERENCE, NOT A CLICK
 * ONE.** `abcts-ledger-gaps-3-tune3` reports `staffPos.top` 155.45 / `height` 60.932 where
 * abcjs reports 142.757 / 73.625 — and `zero` is EXACT, `top + height` is EXACT, so the
 * staff origin and the group's bottom both agree and only the SPLIT between the two is
 * ours. The 12.693px is the inter-system separation CLAMP: abcjs folds it into
 * `staff.top`, which its `startY` is then measured back from, and our layout spends it in
 * the system advance instead — so `originPitch` is 13.724 where abcjs's `staff.top` is 17.
 * The same family as the layout-unit round trip, and it moves no ink.
 */
const MODES = [
  ['plain', {}, 1],
  ['dragging', { dragging: true }, 1],
  ['selectTypes', { selectTypes: true, dragging: true }, 1],
]

const every = Number(process.argv[2] ?? 1)
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="paper"></div></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })

/**
 * The whole interaction, run inside the page for ONE engine: render, then for each probe
 * point dispatch mousedown/mouseup and record everything observable.
 *
 * ⚠️ **THE PROBE POINTS COME FROM THE FIRST ENGINE AND ARE REPLAYED ON THE SECOND** — see
 * the header. `plan` is null on the first call (it discovers the points) and the returned
 * plan is handed to the second.
 */
const interact = async (which, abc, tune, params, plan) =>
  page.evaluate(([which, abc, tune, params, plan]) => {
    const calls = []
    const d = document.getElementById('paper')
    d.innerHTML = ''
    d.removeAttribute('style'); d.removeAttribute('class')
    const seen = (v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'object') {
        // a DOMTokenList, or the selectable element itself
        if (typeof v.length === 'number' && typeof v.item === 'function')
          return Array.from(v)
        if (v.tagName)
          return v.tagName + '#' + (v.getAttribute('data-index') ?? '-')
      }
      return v
    }
    try {
      window[which].renderAbc([d], abc, {
        staffwidth: 670, startingTune: tune,
        selectionColor: '#0000ff', dragColor: '#00ff00', ...params,
        clickListener: (abcelem, tuneNumber, classes, analysis, drag, ev) => {
          calls.push({
            el: abcelem && { t: abcelem.el_type, s: abcelem.startChar, e: abcelem.endChar },
            tuneNumber, classes,
            an: analysis && {
              name: analysis.name ?? null, clicked: analysis.clickedName ?? null,
              v: analysis.voice ?? null, l: analysis.line ?? null, m: analysis.measure ?? null,
              staffPos: analysis.staffPos ?? null,
              pc: seen(analysis.parentClasses), cc: seen(analysis.clickedClasses),
              se: seen(analysis.selectableElement),
            },
            drag: drag && { step: drag.step, max: drag.max, index: drag.index, setSel: typeof drag.setSelection },
            evType: ev && ev.type,
          })
        },
      })
    } catch (e) { return { threw: String(e) } }
    const svg = d.querySelector('svg')
    if (!svg) return { plan: [], rows: [], nodes: 0 }
    const nodes = Array.from(d.querySelectorAll('[data-index]'))
    // Build the probe points, or replay the ones handed in.
    let points = plan
    if (points === null) {
      points = []
      const svgBox = svg.getBoundingClientRect()
      // Up to three selectables, spread across the tune, each probed twice: a DIRECT HIT
      // at the centre of its box and a NEAR MISS 8px above-left of its top-left corner —
      // which is inside abcjs's 12px `findElementByCoord` radius and takes the other arm.
      const picks = [0, Math.floor(nodes.length / 2), nodes.length - 1]
      for (const i of [...new Set(picks)]) {
        const n = nodes[i]
        if (!n) continue
        const r = n.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        points.push({ i, hit: true, x: r.x + r.width / 2 - svgBox.x, y: r.y + r.height / 2 - svgBox.y })
        points.push({ i, hit: false, x: r.x - 8 - svgBox.x, y: r.y - 8 - svgBox.y })
      }
      // ⚠️ THE NEGATIVE CONTROL: far below every element, so nothing may be notified.
      points.push({ i: -1, hit: false, x: 5, y: 100000 })
    }
    const rows = []
    for (const p of points) {
      const before = calls.length
      /**
       * ⚠️ **A NEAR MISS MUST BE DISPATCHED ON THE `<svg>`, NOT ON THE ELEMENT.**
       * `getMousePosition` asks `getTarget(ev.target)` first, and a direct hit there
       * short-circuits the whole coordinate path — so dispatching every probe on the
       * element left `getCoord` and `findElementByCoord` (the 12px radius, the four
       * distance branches) UNEXERCISED. Caught by breaking the radius on purpose and
       * watching the gate stay green: 0 of 35 with a 6px radius that should have moved
       * dozens of rows.
       */
      const target = p.hit && p.i >= 0 ? (nodes[p.i] ?? svg) : svg
      const svgBox = svg.getBoundingClientRect()
      const mk = (type) => {
        const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0,
          clientX: svgBox.x + p.x, clientY: svgBox.y + p.y })
        // ⚠️ DEFINED EXPLICITLY — see the header. `layer` is deliberately the same as
        // `offset` here, which is the arm `getBestMatchCoordinates` takes when its epsilon
        // is under 3.
        for (const [k, v] of [['offsetX', p.x], ['offsetY', p.y], ['layerX', p.x], ['layerY', p.y]])
          Object.defineProperty(ev, k, { value: v, configurable: true })
        return ev
      }
      target.dispatchEvent(mk('mousedown'))
      const cls = svg.getAttribute('class')
      target.dispatchEvent(mk('mouseup'))
      rows.push({
        p: `${p.i}${p.hit ? 'H' : 'N'}`,
        down: cls, up: svg.getAttribute('class'),
        painted: nodes.filter((n) => (n.getAttribute('class') ?? '').includes('note_selected')).length,
        fill: nodes[p.i] ? nodes[p.i].getAttribute('fill') : null,
        calls: calls.slice(before),
      })
    }
    return { plan: points, rows, nodes: nodes.length }
  }, [which, abc, tune, params, plan ?? null])

let bad = 0
const report = []
for (const [label, params, declared] of MODES) {
  let off = 0, n = 0, witnessed = false, controlOk = true
  const first = []
  for (let k = 0; k < cases.length; k += every) {
    const c = cases[k]
    if (SKIP.has(c.slug)) continue
    n += 1
    const js = await interact('ABCJS', c.abc, c.tune, params, null)
    const ts = await interact('ABCTS', c.abc, c.tune, params, js.plan ?? [])
    // ⭐ THE WITNESS: abcjs must actually notify somewhere, or the row proves nothing.
    if (!witnessed && (js.rows ?? []).some((r) => r.calls.length > 0)) witnessed = true
    // ⭐ THE NEGATIVE CONTROL: the last point is 100,000px below the score.
    const ctrl = (js.rows ?? [])[(js.rows ?? []).length - 1]
    if (ctrl && ctrl.calls.length > 0) controlOk = false
    const a = JSON.stringify(js.rows), b = JSON.stringify(ts.rows)
    if (a !== b) { off += 1; if (first.length < 3) first.push(c.slug) }
  }
  const flag = !witnessed ? 'MUTE' : !controlOk ? 'CTRL' : off === declared ? '    ' : off > declared ? 'UP  ' : 'DOWN'
  if (off !== declared || !witnessed || !controlOk) bad += 1
  const line = `${flag} ${String(off).padStart(4)} of ${n} (declared ${declared})  ${label}   ${first.join(' ')}`
  console.log(line)
  report.push(line)
}
writeFileSync('/tmp/abcts-click.txt', report.join('\n') + '\n')
if (bad > 0) { console.error(`FAIL: ${bad} row(s)`); process.exitCode = 1 }
await browser.close()
