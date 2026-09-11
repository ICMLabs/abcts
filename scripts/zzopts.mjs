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
 *     print        5 · scale 0.8   1 · scale 1.5   2
 *
 * ✅ **AND THE SCALE ROUND TRIP CLOSED EIGHT OF THOSE ROWS IN ONE EXPRESSION.**
 * `setPaperSize` multiplies `w` by the scale and then hands `setSize` `w / scale`
 * (`draw/set-paper-size.js:2`, `:37`) — and `(x * 0.75) / 0.75` is NOT `x`. The emitter
 * had written the algebraic identity, so the root `width` of every page below scale 1 was
 * one ULP out whenever the sum was not exactly representable. print 7 → 5, `scale 0.8`
 * 4 → 1, `oneSvgPerLine + scale 0.8` 4 → 1. The three that remain each have their own
 * cause: a jazzchord box on a whole-pixel rounding boundary, a tempo glyph's x, and one
 * input sum an ULP apart.
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
  ['scale 0.8', { scale: 0.8 }, 1],
  ['scale 1.5', { scale: 1.5 }, 2],
  ['print', { print: true }, 5],
  ['jazzchords', { jazzchords: true }, 0],
  // The witness for the split is the SECOND section: a one-`<g>` tune would produce
  // `section 1` from a split that never split anything.
  ['oneSvgPerLine', { oneSvgPerLine: true }, 0, /section 2<\/title>/],
  ['oneSvgPerLine + resize', { oneSvgPerLine: true, responsive: 'resize' }, 0, /viewBox="0 [1-9]/],
  // 4, and they are the SAME FOUR FIXTURES as the plain `scale 0.8` row above — measured
  // by differencing the two sets, not inferred from a shared first-three. The split adds
  // nothing; it is inheriting the non-unit-scale geometry that row already declares.
  ['oneSvgPerLine + scale 0.8', { oneSvgPerLine: true, scale: 0.8 }, 1, /<div style="overflow: hidden;height:/],
  ['viewportHorizontal', { viewportHorizontal: true }, 0, /<div class="abcjs-inner" style="overflow: hidden/],
  ['viewportHorizontal + scroll', { viewportHorizontal: true, scrollHorizontal: true }, 0, /overflow: auto hidden/],
  ['viewportVertical', { viewportVertical: true }, 0, /<div class="abcjs-inner scroll-amount"/],

  /**
   * **THE TEN OPTIONS `EngraverController` READS THAT `AbcjsParams` DOES NOT DECLARE**,
   * harvested by grepping `params\.` out of `write/engraver-controller.js` rather than by
   * reading our own type — the same "enumerate the REFERENCE, not the notes" rule that
   * found sixteen directives in one sweep.
   *
   * These rows carry no `witness` regex. They have something better: a row whose option
   * changes NOTHING IN abcjs'S OWN OUTPUT on any fixture reports **MUTE**, because the
   * comparison then proves only that two engines both ignored it. See the `moved` check.
   */
  // ✅ `ariaLabel` CLOSED — it was 685 of 685, since we always wrote the default label.
  // Three states and the middle one is the surprise: absent gives the default label and
  // `<title>`; a STRING replaces only the attribute; and `''` emits NEITHER, because
  // `if (renderer.ariaLabel !== '')` guards the whole block (`draw/set-paper-size.js:9-16`).
  ['ariaLabel', { ariaLabel: 'Custom label' }, 0],
  ['ariaLabel empty', { ariaLabel: '' }, 0],
  // ✅ `germanAlphabet` CLOSED — `germanNote` is a five-case SWITCH on the whole string
  // applied to the chord's ROOT and its `/bass` only (`creation/translate-chord.js:1-10`),
  // so `Bm` draws `Hm`, `Bb7` draws `B7` and the modifier is never touched.
  ['germanAlphabet', { germanAlphabet: true }, 0],

  /**
   * ⚠️ **THE SEVEN THAT ARE STILL UNIMPLEMENTED, EACH DECLARED AT ITS MEASURED COUNT.**
   * Every one is a REAL feature and not a rounding difference — the count is how many
   * fixtures a host passing it would see drawn differently from abcjs.
   *
   *   lineThickness    665 — an ADDITIVE term on four line widths: `dy + lineThickness` on
   *                          a staff line, `0.35 + …` on a ledger, `linewidth + …` on a bar
   *                          and `linewidth ± …` on a stem, the sign following the stem's
   *                          direction (`draw/staff.js:14`, `:25`, `draw/relative.js:61-66`).
   *   timeBasedLayout  669 — a SECOND layout algorithm, `layout/layout-in-grid.js`, which
   *                          spaces by TIME rather than by the spring solve. The largest.
   *   minPadding       659 — extra room to the left of every note and bar in the solve
   *                          (`layout/voice-elements.js:34`, `:110-115`).
   *   initialClef      125 — reprints the clef at the head of the tune.
   *   wrap+staffwidth   60 — re-lining is implemented (`compat/wrap.ts`) and no gate had
   *                          ever rendered its OUTPUT beside abcjs's.
   *   add_classes       17 — the class scheme itself is gated by 111 sibling goldens; these
   *                          are the rows those goldens do not reach.
   *   expandToWidest    14 — a line stiffer than the page widens the page to fit it.
   *   accentAbove       13 — an `accent` joins the ABOVE stack instead of the below one
   *                          (`creation/decoration.js:20`), which moves every lane with it.
   */
  /**
   * ⚠️ **16, AND THE CLASS RULES BEHIND THEM ARE NOW THREE.** The scheme itself is gated by
   * 111 sibling goldens; these are the rows those goldens do not reach.
   *
   * ✅ **A GROUP'S CLASS IS THE `<g>`'s AND AN UNGROUPED ROW'S IS ITS OWN**, and the two
   * callers differ by one argument: `addMultiLine`'s array branch opens a group with the
   * klass and hands `richText` a literal `''` (`bottom-text.js:48`, `:57`), which
   * `if (klass)` leaves UNSET — so the row serialises as the literal `class="undefined"`.
   * `addSingleLine` has no group and passes its klass through (`:32`), so a `B:` row really
   * does read `class="abcjs-extra-text abcjs-book"`. `groupName` tells them apart.
   * ✅ **A BOXED ROW'S GROUP CARRIES THE CLASS**, because `renderText` deletes it from the
   * text and opens a group for it (`draw/text.js:48-81`) — `partOrder` reads
   * `<g class="abcjs-part-order" fill="currentColor" …>`.
   * ✅ **AND A GENERATED CLASS WINS OVER THE FIELD'S OWN**, because `classes.generate`
   * appends the LINE counter: a `%%text` row is `abcjs-defined-text abcjs-l2`.
   *
   * ⚠️ **THE NEXT ONE IS NAMED AND NOT FIXED**: a `%%sep` SEPARATOR rule is
   * `abcjs-defined-text abcjs-l2` in abcjs and `abcjs-defined-text` here — the free-text
   * row immediately above it is `abcjs-l1` in BOTH, so the counter is right and simply is
   * not advanced for the separator's own line. `visual-mouse-click-01`, byte 2825.
   * ⚠️ And some of the 16 are not class defects at all: `visual-selection-01` differs on a
   * NOTEHEAD x, which `add_classes` only revealed by making the bytes before it match.
   */
  ['add_classes', { add_classes: true }, 16],
  // ✅ CLOSED — two `if`s, one in each decoration pass: `closeDecoration` skips the accent
  // (`creation/decoration.js:20`) and `stackedDecoration` picks it up with the ORNAMENT's
  // own placement (`:268-273`). The same sforzato is drawn either way; what changes is
  // which stack counts it, and so every lane above the staff.
  ['accentAbove', { accentAbove: true }, 0],
  /**
   * ✅ 665 → 14. The term lands on five weights at two sizes — see `lineWeightsFor`.
   *
   * ⚠️ **THE 14 THAT REMAIN ARE ONE SYMPTOM AND THE CAUSE IS NOW MEASURED, NOT GUESSED.**
   * A TUPLET NUMBER over a beam sits at a different `y`. Reduced to one bar —
   * `X:1 L:1/8 K:C (3ceg|` — and swept over `lineThickness` 0, 0.5, 1.5 and 3:
   *
   *     abcjs   89.33   89.33   89.33   89.33      <- it does NOT move, at any value
   *     abcts   89.33   89.33   87.47   87.53
   *
   * **abcjs NEVER MOVES ANYTHING FOR `lineThickness`.** `renderer.lineThickness` is read in
   * the DRAW functions alone (`draw/staff.js:14`, `:25`, `draw/relative.js:61-66`); the
   * ENGRAVER never sees it, so it is a drawn width and never a placement. We fold it into
   * `LINE_WEIGHTS`, which our LAYOUT also reads — so it leaks into where things go.
   * Bisected: excluding `stem` and `beamedStem` from the thickening fixes the tuplet
   * exactly, and breaks the drawn stem width, which needs it.
   *
   * ⚠️ **AND THE OBVIOUS NARROW FIX IS WRONG — 622 of 685, MEASURED.** Placing the stem at
   * its BASE weight (abcjs's `printStem(x, linewidth ± t)` leaves `x` alone) does not
   * transfer: our stem is placed by its CENTRE, and a centre DOES move when the width
   * grows even though abcjs's `x` does not. The two models differ structurally here.
   *
   * So the real fix is to keep `LINE_WEIGHTS` pristine for layout and add the term only
   * where a thickness is EMITTED — a separation this file cannot make one site at a time.
   */
  ['lineThickness', { lineThickness: 1.5 }, 14],
  ['expandToWidest', { expandToWidest: true }, 14],
  // ✅ 125 → 42. The name reads the other way round: `(!this.initialClef || l === 0) &&
  // createClef(…)` (`creation/abstract-engraver.js:158`), `l` being the LINE index — so it
  // means the initial clef ONLY. The key signature is outside the guard and still draws on
  // every line, and a mid-tune `[K: clef=]` is untouched.
  // ⚠️ The 42 that remain are PAGE HEIGHTS and they differ in BOTH directions — ours 7.75
  // short on `parse-tie-slur-03-onestaff`, 14.43 tall on `visual-directives-01-incipit-test`
  // — so it is not one missing reserve. The untested hypothesis is abcjs's
  // `this.startlimitelem = clef` (`:164`), which is INSIDE `if (clef)`: with the clef gone
  // the tie limit falls to the key signature, or stays stale when there is none. A
  // two-line control with a tie across the break did NOT reproduce it — both engines drew
  // the same height with and without the option — so that control is MUTE and the cause is
  // still open rather than named.
  ['initialClef', { initialClef: true }, 42],
  // ✅ 659 → 5. `getExtraWidth(child, pad)` returns `-child.extraw + pad`, so the padding is
  // part of what the element WANTS and the same shortfall test decides whether any of it is
  // spent — an element with slack in front of it costs nothing. `pad` is skipped for
  // anything still fixed to the left edge (`voice.durationindex + child.duration > 0`) and
  // applies to a `note` or a `bar` ONLY, which excludes a rest.
  // ⚠️ The 5 that remain are a ULP, a 0.01 tuplet y and a 0.03 staff width — the
  // layout-unit family, not the option.
  ['minPadding', { minPadding: 40 }, 5],
  ['timeBasedLayout', { timeBasedLayout: { minPadding: 20 } }, 669],
  /**
   * ⚠️ **53, AND THE LINE-STRUCTURE HALF IS CLOSED.** Counting staff lines in each engine
   * over the whole corpus: **ELEVEN fixtures drew a different NUMBER OF LINES and now NONE
   * does.** The two the line-count probe still reports are abcjs THROWING — see below.
   *
   * ⭐ **THE WRAP'S DECISION WAS NEVER THE DEFECT.** `tune.lineBreaks` is byte-identical to
   * abcjs's on every failing tune; the bug was translating a break index back onto the
   * score. A break indexes BAR ELEMENTS — `getMeasureWidths` reports one width per bar
   * (`engraver-controller.js:167-180`) and `findLineBreaks` counts the same
   * (`wrap_lines.js:132-141`) — so a measure that OPENS with a barline contributes TWO
   * where an ordinary one contributes one, and which measure a break opens depends on
   * which of the two it lands on. See `applyLineBreaks`.
   *
   * ⚠️ **THE COUNT ONLY MOVED BY ONE BECAUSE THOSE FIXTURES NOW DIFFER ON GEOMETRY
   * INSTEAD** — but by far less. `visual-layout-09-endings` was 389.24 against 235.58 and
   * is 389.238913 against 389.237975; `flattener-07-metronome`'s rest was 15.87px out and
   * is 2.09.
   *
   * ✅ **AND THE METER GOES WITH A NON-MUSIC FIRST ROW — 59 → 53.**
   *
   *     if (keys[k] === "meter" && action.line !== 0) skip = true;    // wrap_lines.js:43
   *
   * ⚠️ **`action.line` IS THE OUTPUT LINE INDEX OVER THE WHOLE TUNE AND IT COUNTS THE
   * NON-MUSIC ROWS.** `findLineBreaks` advances one `outputLine` for a subtitle, a
   * `%%text`, a `%%sep` or a `%%newpage` exactly as it does for a staff line
   * (`wrap_lines.js:150-153`), so a tune opening with a subtitle has its music on line 1
   * and loses the meter on EVERY system, the FIRST INCLUDED. The line the comment is
   * attached to reads as though only the reprints go, and this repo had ported it that
   * way: `i === 0` in `lines.ts` and `systemIndex === 0` in `layout.ts` are the tune's
   * first MEASURE and first SYSTEM, which is abcjs's line 0 only when nothing precedes it.
   *
   * The predicate was built against the REFERENCE rather than against our own type:
   * `tune.lines.findIndex(l => l.staff) > 0` names 41 fixtures of 685, and
   * `titles.length > 1 || textAbove.length > 0 || newPage != null` names THE SAME 41, with
   * no fixture on either side of the disagreement. ⚠️ `newPage` is a NUMBER — `%%newpage 1`
   * reads back as `1`, and a `=== true` test misses `abcts-directives-tune9` alone.
   *
   * ⚠️ **AND TWO OF THE 53 ARE abcjs CRASHING, NOT US.** `abcts-vskip` tunes 0 and 2 throw
   * inside abcjs's own `wrapLines` — `undefined is not an object (evaluating 'l[p]')` —
   * because `addLineBreaks` reads `lines[action.ogLine].staff[action.staff]` on a row a
   * `%%vskip` made non-music. We render them. A crash is not output and strict does not
   * reproduce one.
   */
  ['wrap + staffwidth', { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }, 53],
]
const every = Number(process.argv[2] ?? 1)
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let bad = 0
for (const [label, opts, declared, witness] of OPTIONS) {
  let off = 0, n = 0, seen = witness === undefined, moved = false
  const first = []
  for (let k = 0; k < cases.length; k += every) {
    const c = cases[k]
    if (SKIP.has(c.slug)) continue
    n += 1
    const r = await page.evaluate(([abc, tune, opts, needBase]) => {
      const one = (API, o) => {
        try {
          const d = document.createElement('div'); document.body.appendChild(d)
          d.style.position = 'absolute'; d.style.visibility = 'hidden'
          API.renderAbc([d], abc, { staffwidth: 670, startingTune: tune, ...o })
          const s = d.outerHTML
          d.remove(); return s
        } catch (e) { return 'THREW: ' + e.message }
      }
      // The baseline is rendered only until the option has been SHOWN to do something —
      // once `moved` is true it costs a third of the run for nothing.
      return {
        js: one(window.ABCJS, opts), ts: one(window.ABCTS, opts),
        base: needBase ? one(window.ABCJS, {}) : null,
      }
    }, [c.abc, c.tune, opts, !moved])
    if (r.js !== r.ts) { off += 1; if (first.length < 3) first.push(c.slug) }
    if (!moved && r.base !== null && r.js !== r.base) moved = true
    if (!seen && witness.test(r.js)) seen = true
  }
  // ⚠️ An option that moves NOTHING in abcjs cannot arbitrate anything — see the block
  // above. The baseline row is exempt, since it IS the baseline.
  const flag = !seen || (!moved && label !== 'baseline') ? 'MUTE'
    : off === declared ? '   ' : off > declared ? 'UP ' : 'DOWN'
  if (off !== declared || flag === 'MUTE') bad += 1
  console.log(`${flag} ${String(off).padStart(4)} of ${n} (declared ${declared})  ${label}   ${first.join(' ')}`)
}
if (bad > 0) {
  console.error(`FAIL: ${bad} option row(s) moved`)
  process.exitCode = 1
}
await browser.close()
