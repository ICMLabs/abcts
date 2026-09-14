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
  /**
   * ⚠️ **TWO ROWS, AND BOTH ARE MEASURED TO THE TERM.** Shared with the `print` row below —
   * the same fixtures. It was three until the page width became a PRIMITIVE rather than a
   * recovery (3, below).
   *
   * 1. **`visual-options-01-fonts` — 23.54px, AND IT IS THE PAGE CURSOR AND NOT THE INK.**
   *    Every drawn row through the FIRST SYSTEM matches to the digit; everything after it is
   *    23.54 lower. Differencing both engines' `moveY` walks says why: our top block's row
   *    ADVANCES are individually wrong — abcjs spends `… 68, 3.78, 38, 7.56, 18, 18, 67 …`
   *    where we spend `… 50, 3.78, 38, 7.56, 19, 19, 62 …`, a net 21 short — and those
   *    differences CANCEL in the rows' drawn ys, because a row's y and the page's cursor are
   *    two accumulations here. The SYSTEM is placed by its own walk and lands right; the
   *    trailing blocks are placed from the cursor and do not. ⚠️ **Removing any ONE of the
   *    eighteen `%%…font` directives takes the delta to zero**, which is what says it is a
   *    sum of many small term errors rather than one rule.
   * 2. **`visual-svg-per-line-02-scaled` — ONE ULP** in a notehead path's x,
   *    `325.912` against our `325.9119999999999`.
   * 3. ✅ **`abcts-directives-tune3` — CLOSED.** ONE ULP in the print width,
   *    `%%rightmargin 40`, and its cause was a SUM ORDER. abcjs writes
   *    `(maxwidth + padding.left) + padding.right`, left to right:
   *    `(893.3333333333334 + 90.66666666666667) + 53.333333333333336` is `1037.3333333333333`
   *    and `893.3333333333334 + (90.66666666666667 + 53.333333333333336)` is `…335`, which at
   *    print's 0.75 are 778 and 778.0000000000001. `pageSides()` sums the two margins FIRST,
   *    so the engine — which holds the PRE-SUMMED page and subtracts the sides back out to
   *    reach the music — could only write the second form.
   *
   *    The page is now summed from abcjs's own terms, IN PIXELS: `staffwidth / scale` plus
   *    each margin, left then right (`LayoutOptions.staffWidthPx`, `Layout.pageWidthPx`).
   *    ⚠️ **And the pixel domain is the point** — summing the same three terms in SPACES and
   *    multiplying out reproduces abcjs on 16 of 32 measured width/scale pairs where the
   *    existing single division reproduces 28; only the pixel form is 32 of 32, because it
   *    IS abcjs's expression. The space-domain width the other 691 goldens rest on did not
   *    move: nothing subtracts differently, one new number is published beside it.
   *
   * ✅ **AND `%%footer` LANDED HERE WITHOUT MOVING THE ROW** — print draws one and we drew
   * none at all. `visual-options-01-fonts` is the only fixture with a `%%footer` and it
   * differs 23px earlier, so this row said the same number before and after. It took
   * DIFFERENCING THE ROW LIST — every `data-name`/`y` pair in order — to see a row abcjs has
   * and we do not. **A row count says nothing about which row.**
   */
  ['print + responsive', { print: true, responsive: 'resize' }, 2],
  /**
   * ⚠️ **ONE ROW, AND IT IS A WHOLE PIXEL FROM 1/64 OF ONE.** `visual-tablature-17`'s boxed
   * jazzchord rect is `M 93` in abcjs and `M 94` here, and the terms line up exactly:
   *
   *     rawX 120.45443750000001   pad 1.3   bbox 51.3125    -> 93.49818750000001  abcjs
   *     rawX 120.45443750000001   pad 1.3   bbox 51.296875  -> 93.5061875         ours
   *
   * — identical but for the measured bbox WIDTH, by 0.015625, which is **one 1/64-px
   * quantum**: the same one `TextFont.x` exists for. abcjs rounds `hash.attr.x` and then
   * measures the node it JUST DREW (`draw/text.js:63-69`), so its bbox is taken at the
   * element's real, rounded x; ours is measured in the LAYOUT, where the chord's x is not yet
   * known, so it is the x = 0 measurement. Landing on `.498` against `.506` turns that into a
   * whole pixel.
   *
   * ✅ **THE EMITTER MEASURES THE BOX NOW, AT THE x IT WRITES — 3 OF THIS FIXTURE'S 4 BOXES
   * ARE EXACT AND THE ROW IS STILL 1.** `PlacedText.boxMeasure` carries the two strings and
   * the font, and `boxInkAt` asks again TRANSIENTLY at `roundNumber(x)`; the layout's
   * `boxSize` stands wherever there is no live measurer, which is what keeps the 691 headless
   * goldens meaning what they meant. Byte-exact on boxes 1, 2 and 4 (51.3125, 106.546875,
   * 422.171875 against abcjs's own).
   *
   * ⚠️ **THE FOURTH IS STILL 1/64 SHORT AND THE SIMPLE READING IS OUT.** Box 3 is
   * `209.109375` against abcjs's `209.125` at the SAME rounded x (207.36) and the same font,
   * where boxes 1, 2 and 4 all have fractional xs too and all now agree — so the quantum is
   * not "fractional or not". What is left is a nested-tspan measurement: a `%%jazzchords`
   * chord draws its modifier at `font-size:0.7em`, and box 3 is the one whose split differs.
   * **A rule that fixes three of four is not the rule for the fourth.**
   */
  ['scale 0.8', { scale: 0.8 }, 1],
  // ⚠️ ONE, a last digit: `synth-flattener-32`'s tempo flag path x, `123.0705` against
  // `123.07050000000001`. The layout-unit family.
  // ✅ `visual-directives-01`'s root `width` — `216.2` against `216.20000000000005` — closed
  // with the print width: the same recovered page, at a `%%scale` instead of print's.
  ['scale 1.5', { scale: 1.5 }, 1],
  ['print', { print: true }, 2],
  ['jazzchords', { jazzchords: true }, 0],
  // The witness for the split is the SECOND section: a one-`<g>` tune would produce
  // `section 1` from a split that never split anything.
  ['oneSvgPerLine', { oneSvgPerLine: true }, 0, /section 2<\/title>/],
  ['oneSvgPerLine + resize', { oneSvgPerLine: true, responsive: 'resize' }, 0, /viewBox="0 [1-9]/],
  // 1, and it is the SAME FIXTURE as the plain `scale 0.8` row above — measured by
  // differencing the two sets, not inferred from a shared first entry. The split adds
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
   *   lineThickness    665 — CLOSED. An ADDITIVE term on four line widths: `dy + lineThickness` on
   *                          a staff line, `0.35 + …` on a ledger, `linewidth + …` on a bar
   *                          and `linewidth ± …` on a stem, the sign following the stem's
   *                          direction (`draw/staff.js:14`, `:25`, `draw/relative.js:61-66`).
   *   timeBasedLayout  669 — a SECOND layout algorithm, `layout/layout-in-grid.js`, which
   *                          spaces by TIME rather than by the spring solve. NOW 0 — CLOSED.
   *   minPadding       659 — extra room to the left of every note and bar in the solve
   *                          (`layout/voice-elements.js:34`, `:110-115`). NOW 1.
   *   initialClef      125 — reprints the clef at the head of the tune. NOW 0 — CLOSED.
   *   wrap+staffwidth   60 — re-lining is implemented (`compat/wrap.ts`) and no gate had
   *                          ever rendered its OUTPUT beside abcjs's.
   *   add_classes       17 — the class scheme itself is gated by 111 sibling goldens; these
   *                          are the rows those goldens do not reach. NOW 0 — CLOSED.
   *   expandToWidest    14 — a line stiffer than the page widens the page to fit it. NOW 0 — CLOSED.
   *   accentAbove       13 — an `accent` joins the ABOVE stack instead of the below one
   *                          (`creation/decoration.js:20`), which moves every lane with it.
   */
  /**
   * ✅ **1, FROM 16 — AND THE CLASS RULES BEHIND THEM ARE NOW TEN.** The scheme itself is
   * gated by 111 sibling goldens; these were the rows those goldens do not reach.
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
   * ✅ **16 → 1, IN SEVEN RULES, AND `ZZWHERE=1` IS HOW EVERY ONE OF THEM WAS FOUND.** The
   * slug list says which fixtures; the first differing BYTE says what. Ten of the sixteen
   * were ONE question — where does the `abcjs-lN` counter advance — and it is the third time
   * `tune.lines`'s index has been the cause, after `initialClef`'s `l` and the wrap's meter
   * skip.
   *
   * ✅ **A ROW THAT PAINTS NOTHING IS STILL A LINE — 6.** `draw()` runs `classes.incrLine()`
   *    at the HEAD of each `tune.lines` iteration and only THEN asks whether the line is a
   *    staff or a nonMusic row (`draw/draw.js:29-31`). The emitter counted the blocks that
   *    produced ROWS, so a bare `%%text`, a bare `%%center` and the empty nonMusic line a
   *    `%%newpage` leaves behind were all skipped. The count travels now
   *    (`LayoutSystem.nonMusicLines`) rather than being re-derived from the ink, because ink
   *    is exactly what these lines do not have.
   * ✅ **A `%%sep` RULE'S CLASS IS GENERATED AT ITS OWN LINE — 2.**
   *    `pathToBack({…, 'class': classes.generate('defined-text')})`
   *    (`draw/separator.js:13`). ⚠️ **IT WAS A LAZY-VS-EAGER BUG AND NOT A MISSING CALL**: the
   *    block's non-text markup was built as a STRING before the loop that advances the
   *    counter, where a text row's is a function called inside it. It is a thunk now.
   * ✅ **EVERY TEXT ROW'S CLASS IS GENERATED — 3.** `getFontAndAttr.calc` ends
   *    `'class': this.classes.generate(klass)` whatever the klass is
   *    (`helpers/get-font-and-attr.js:41`). The literal table here is only what `generate`
   *    RETURNS while the counter is null, which is true of a title and a composer because
   *    they are drawn from `topText` BEFORE the loop — and NOT of a subtitle after the music,
   *    which abcjs writes `abcjs-text abcjs-subtitle abcjs-l2`.
   *    ⚠️ **AND THAT MADE THE ORDER OF TWO STATEMENTS LOAD-BEARING**: the meta block is
   *    written before the leading-subtitle advances now, or the header title would take an
   *    `abcjs-l0` abcjs never writes. Invisible while the classes were literal strings.
   * ✅ **A BOXED ROW'S CLASS IS MOVED TO ITS GROUP, NOT DROPPED — 2.** `renderText` opens
   *    `openGroup({ klass: hash.attr['class'], … })` and only THEN
   *    `delete hash.attr['class']` (`draw/text.js:50`, `:58`). The suppression on the text
   *    was ported and the group left bare at all THREE sites — a music text, a top-block row
   *    and a bottom-block row — and fixing any one leaves the others bare.
   * ✅ **A GRACE BEAM'S ELEMENT INDEX IS PER VOICE — 4.** An ordinary beam's `beamAt` comes
   *    off the voice's own plan and `flushVoice` adds `voiceBase`; the grace-beam walk pushed
   *    a STAFF-wide index, so the lookup missed and fell to `abcjs-m0 abcjs-mm0` for every
   *    grace beam in a LOWER voice. ⚠️ **Invisible for voice 0, where the two are the same
   *    number** — the same shape as the curve-anchor bug beside it in `svg.ts`.
   * ✅ **A BEAM MULTIPLIES BY THE TUPLET RATIO ONLY WHEN ITS FIRST ELEMENT OPENS THE
   *    TUPLET — 1.** `if (firstElement.startTriplet)` (`elements/beam-element.js:31-36`).
   *    The rule was already ported and the PREDICATE was re-derived — "the first member of
   *    this group I have seen", out of a set that lived for one MEASURE — so `(3CD|EFGA|`
   *    opened the group twice. `TupletMark.opens` is the parser's answer; no widening of the
   *    set could have worked, because only the parser knows where the `(p` stood.
   *
   * ⭐⭐ **AND ONE OF THE SIXTEEN WAS THIS REPO'S OWN PREDICTION COMING TRUE — 2.**
   *    `visual-selection-01` and `-svg-per-line-01` were byte-identical rendered ALONE and
   *    differed here by 0.02px in a NOTEHEAD x. `SIZE_CACHE`'s comment in
   *    `text-measure.ts` already said abcjs keys its text-size cache on the generated CLASS
   *    and ours does not, and ended: "it is where to look if a page-order defect ever shows
   *    up in text widths under `add_classes`". It did. **And the first reading was
   *    BACKWARDS** — measured with a fresh page against the gate's own walk, abcjs is
   *    CONSTANT and OURS drifts, bisected down to the single earlier tune that does it.
   *    The faithful key is unreachable (the class is the writer's, the measurement the
   *    layout's), so the cache is per-render under the flag.
   *
   * ✅ **AND THE LAST ROW CLOSED THE WAY ITS NOTE SAID IT WOULD — `abcts-endings` tune 2.**
   * abcjs's second `EndingElem` is `addOther`'d after TWO `'bar'` markers and ours reported
   * one: `other=[EndingElem, BAR, BAR, EndingElem, BAR, BAR, BAR]`, logged in abcjs's own
   * `drawVoice`. The ending's counter was DERIVED — `measure: Math.max(0, i - span.start - 1)`,
   * the measure index within the line minus one — where a TRIPLET already carries a
   * `measureElement` and lets `markerAt` answer. **The derivation broke exactly where the wrap
   * arc's did: a measure that OPENS with a barline contributes TWO bar elements, not one.**
   * A volta now names the element it is added at — the same bar `voltaStartOf` anchors it to,
   * in element indices instead of x — and the derivation stays as the fallback.
   */
  ['add_classes', { add_classes: true }, 0],
  // ✅ CLOSED — two `if`s, one in each decoration pass: `closeDecoration` skips the accent
  // (`creation/decoration.js:20`) and `stackedDecoration` picks it up with the ORNAMENT's
  // own placement (`:268-273`). The same sforzato is drawn either way; what changes is
  // which stack counts it, and so every lane above the staff.
  ['accentAbove', { accentAbove: true }, 0],
  /**
   * ✅ **CLOSED — 665 → 14 → 0. IT IS A DRAWN WIDTH AND NEVER A PLACEMENT.**
   * `renderer.lineThickness` is read in the DRAW functions alone (`draw/staff.js:14`,
   * `:25`, `draw/relative.js:61-66`); the ENGRAVER never sees it, so **abcjs moves NOTHING
   * for it at any value.** Swept over 0, 0.5, 1.5 and 3 on `X:1 L:1/8 K:C (3ceg|`, abcjs's
   * tuplet number sits at 89.33 throughout and ours moved to 87.47 — because we folded the
   * term into `LINE_WEIGHTS`, which the LAYOUT reads too.
   *
   * The fix is the separation this note used to say the file could not make one site at a
   * time, and it is three edits: `LINE_WEIGHTS` is pristine again, `RenderOptions` carries
   * the term, and `lineToRect` adds it per line ROLE.
   *
   * ⚠️ **AND THE TERM IS NOT THE SAME SIZE AT EVERY SITE.** `printLine`'s `dy` is a HALF —
   * drawn `y - dy` to `y + dy` — so a STAFF LINE and a LEDGER gain **2 ×**; `printStem`'s
   * `dx` is the WHOLE width, so a BARLINE and a STEM gain **one**. Nothing else takes it: a
   * beam is a filled path, the staff-group connector passes a bare 0.6, a glissando and a
   * `%%sep` are their own emitters.
   *
   * ⚠️ **AND A STEM'S ANCHOR MUST NOT MOVE WITH IT.** abcjs leaves `printStem`'s `x` alone
   * and grows `dx`; ours places a stem by its CENTRE. The anchor is built from the BASE
   * weight and only the width takes the term — which is what the earlier attempt measured
   * at 622 of 685 by placing the stem at its base weight instead.
   *
   * ⚠️ **AND THE HALF IS COMPUTED TWICE IN `lineToRect`.** Patching the rect's `y`/`h` left
   * the `printLine` branch recomputing `half` from `line.thickness`, so every staff line and
   * ledger stayed at its base width and the row read **665 of 685** — worse than before.
   * A value derived twice in one function is one edit and two places.
   */
  ['lineThickness', { lineThickness: 1.5 }, 0],
  /**
   * ✅ **CLOSED — 14 → 9 → 5 → 0, AND IT IS THE ABORT THAT DID THE ARITHMETIC.**
   * Three rules, and the row could not have arbitrated the first one on its own:
   *
   * 1. **THE RESTART, WHICH IS THE PASS ABORTING AND NOT A FIXED POINT.** `i = -1` the
   *    INSTANT a line widens the page (`layout/layout.js:26-29`), so the lines AFTER the
   *    offender are never solved at the width it just left. Re-running the whole pass at
   *    the width the previous one ENDED on is the obvious reading and reaches a different
   *    answer: `synth-flattener-32-quarter-tone2` settles at 714.51 that way against
   *    abcjs's 717.51, because line 3's larger claim jumps the page ahead of the chase and
   *    `thisWidth` is not linear in the target. 14 → 9 → 5 with the abort.
   * 2. **THE CHASE IS 112 PASSES LONG, NOT TWO.** `visual-layout-04-score-s-a` walks
   *    670 → 850.54 a pixel and a half at a time: a line that cannot compress justifies to
   *    just OVER its target and trips `Math.round` again, until the overshoot lands inside
   *    the same rounded pixel. ⚠️ **A 64-pass cap read 824.02 — a width that appears in
   *    abcjs's OWN trace**, one of the steps it walks through, which is why it looked like
   *    a plausible near-miss rather than a truncation.
   * 3. **THE TOP TEXT IS REBUILT AT THE WIDENED PAGE — 5 → 1.** `engraveTune` builds
   *    `TopText` at `this.width`, runs `layout()`, and then, `if (this.expandToWidest &&
   *    maxWidth > this.width + 1)`, throws it away and builds a second one at `maxWidth`
   *    (`engraver-controller.js:263-297`). Four fixtures centred their title at 350 —
   *    `670 / 2 + 15`, the PAGE's centre — where abcjs centres on the music.
   *
   * ⭐ **AND THE ROW'S OWN RECORDED NOTE WAS WRONG ABOUT THE COST.** It said the pass is
   * "one ~1700-line `spans.map` with outer accumulators, so making it re-entrant is a real
   * refactor and a real regression risk". It writes SIX bindings outside itself and mutates
   * no `plan` and no element; running it twice unconditionally left `svg-bytes` at 0 of 691
   * and 0 of 356, which is the proof rather than the reading. The one that had to be FOUND
   * was `voiceAnchors`/`voiceSites`, which accumulate per voice and drew every slur twice —
   * 261 goldens, so it announced itself.
   */
  ['expandToWidest', { expandToWidest: true }, 0],
  // ✅ 125 → 42 → 3. The name reads the other way round: `(!this.initialClef || l === 0) &&
  // createClef(…)` (`creation/abstract-engraver.js:158`) — so it means the initial clef
  // ONLY. The key signature is outside the guard and still draws on every line, and a
  // mid-tune `[K: clef=]` is untouched.
  // ⭐ **AND `l` IS THE INDEX INTO `tune.lines`, WHICH COUNTS THE NON-MUSIC ROWS** —
  // `createABCLine(abcLine.staff, …, i)` with `i` walking `abcTune.lines`
  // (`engraver-controller.js:229-234`). A tune whose music is preceded by a subtitle, a
  // `%%text`, a `%%sep` or a `%%newpage` has its FIRST music line at `l > 0` and draws NO
  // clef at all. Ours read it as the count of music SYSTEMS — the same misreading the
  // wrap's `action.line !== 0` meter skip had, and `nonMusicPrecedesMusic` is now the one
  // predicate both read. **27 of the 39 that closed were that single reading.**
  // ⚠️ **AND THE RECORDED HYPOTHESIS WAS HALF RIGHT, WHICH IS WHY ITS CONTROL WAS MUTE.**
  // The note named `this.startlimitelem = clef` (`:164`) as the cause of the 42. It reaches
  // only `TieElem.setStartX`, which sets `startX` and nothing else
  // (`elements/tie-element.js:42-44`, `:118-131`) — so it CANNOT move a reserve, and the
  // two page-height fixtures had NOTHING moved at all (0 of 61 elements, kinds identical).
  // It is real, and it is the LAST remaining row rather than the 42.
  // ✅ **THE PAGE HEIGHTS WERE A CHORD'S INCOMING TIE-HALF, RESERVING NOTHING — 3 → 1.**
  // A tie arriving from the system above reserves `anchor2.pitch ± 4` as ink; the rule was
  // ported, ladder-measured and written up, and tested `previous.type === 'note'` where
  // `[GB]8-|` is a CHORD. abcjs builds one `TieElem` per tied PITCH
  // (`abc_parse_music.js:427`). ⭐ **INVISIBLE UNTIL THIS OPTION REMOVED THE CLEF**: a
  // treble clef declares `bottom: -1` and the tie's own 0 never won the `min`. **A reserve
  // always masked by a bigger one is a rule no gate can see.** Measured in abcjs's own
  // `staffGroup`: its `bottom` is 0 on the clef-less lines and ours was 2, the bare bottom
  // staff line.
  // ✅ **AND THE LAST ROW WAS `startlimitelem` AFTER ALL — 1 → 0.** It is ENGRAVER STATE,
  // not a property of the line: assigned only where a clef, key signature or time signature
  // is CREATED (`:164`, `:169`, `:178`, plus a repeat bar at `:982`) and cleared only by
  // `reset()`, which runs per TUNE. A line drawing none of them KEEPS what the last line to
  // draw one left, rather than falling back to the `anchor2.x - 20` stub.
  // ⭐ Invisible until this option removed the clef, since every line has one otherwise.
  // Instrumented on `abcts-ledger-gaps-3` tune 3, a slur spanning three systems: with the
  // option abcjs's limit on lines 1 AND 2 is line 0's `M:4/4`,
  // `staff-extra time-signature x=49.051 w=11.795`, and ours fell to the stub — 128.28
  // against abcjs's 66.85, page height already exact.
  ['initialClef', { initialClef: true }, 0],
  /**
   * ✅ **659 → 1, AND THIS ROW IS A ROD MAGNIFIER RATHER THAN A FEATURE.**
   * `getExtraWidth(child, pad)` returns `-child.extraw + pad`, so the padding is part of what
   * the element WANTS and the same shortfall test decides whether any of it is spent — an
   * element with slack in front of it costs nothing. `pad` is skipped for anything still fixed
   * to the left edge (`voice.durationindex + child.duration > 0`) and applies to a `note` or a
   * `bar` ONLY, which excludes a rest.
   *
   * ⭐ **THE LAST TWO REAL ROWS WERE BOTH ELEMENT WIDTHS THAT NOTHING ELSE CAN SEE.** A width
   * is abcjs's `abselem.w`, and a width only reaches the page when it beats the elastic gap
   * beside it — so `svg-bytes` (0 of 691), `zzlive` and `zzselect` are blind to both. **A
   * RESERVE ALWAYS MASKED BY A BIGGER ONE IS A RULE NO GATE CAN SEE**, and here it took a HOST
   * OPTION to expose it rather than a fixture.
   *
   * ✅ **A REST'S WIDTH TAKES THE VOICE SCALE — 4 → 3.** A rest reaches `createNoteHead` like
   *    any head, so `new RelativeElement(c, shiftheadx, getSymbolWidth(c) * scale, …)`
   *    (`creation/create-note-head.js:35`) carries the scale for it too. Ours scaled the NOTE
   *    and left the rest at unit width — and the augmentation-dot term beside it already had
   *    the factor, which made the omission look deliberate. Laddered through abcjs on
   *    `z2 C2 z4|`: the voice scale moves NOTHING without padding (194.9 at 1, 1.5 and 2) and
   *    everything with it (201.37 / 208.18 / 217.75).
   * ✅ **A CHORD'S WIDTH IS THE MAX OVER ITS HEADS AS ADDED — 3 → 1.** Each head goes in
   *    through its own `createNoteHead` with its own `c` (`abstract-engraver.js:678-688`), so
   *    `w = max(w, dx + child.w)` pairs EACH head's offset with THAT head's width, and a
   *    per-pitch `!style=!` makes them differ. `[C!style=x!EG]` is 9.843 in abcjs where the
   *    chord-level glyph is 9.81. ⚠️ **A comment in `layout.ts` asserted the chord-level
   *    `headName` "still decides the WIDTH"** — it decides the DOTS and the STEM, `heads[0].w`,
   *    and not this. `abcts-pitch-style` tunes 0 and 6.
   *
   * ⚠️ **THE LAST ROW IS TWO ULP IN THE ROOT `width`, AND ITS LOCATION IS NOW EXACT.**
   * `synth-flattener-23`: `1144.9759999999999` against our `...9997`. Both engines' final-pass
   * x chains were logged element by element and are IDENTICAL for the first ELEVEN elements;
   * they part at the twelfth — abcjs `564.4630000000001`, ours `564.463` — and every element
   * after it inherits the one ULP. Nothing visible moves. ⚠️ And the first attempt to compare
   * those chains was MUTE, because the probe logged abcjs's TRIAL x (before
   * `if (er < extraWidth) x += …`) against our FINAL one, which made all 23 rows read as
   * differing. **A probe that measures two different quantities is worse than none.**
   */
  ['minPadding', { minPadding: 40 }, 1],
  /**
   * ✅ **CLOSED TO 1 FROM 669 — A SECOND LAYOUT ALGORITHM, AND IT IS 83 LINES.**
   * `layout()` calls `layoutInGrid` INSTEAD OF `setXSpacing` for every line
   * (`layout/layout.js:21-24`): every element's x comes from its MUSICAL TIME on a uniform
   * grid, one `minSpacing` for the whole line set by whichever element is tightest per unit of
   * time. The step is LINEAR in duration where a spring is `sqrt`-weighted — 2.000000 against
   * √2 on the same 2:1 pair, which is how the two algorithms are told apart in one number.
   *
   * ⚠️ **THE BIGGEST ROW ON THIS BOARD WAS NOT THE BIGGEST JOB.** The port itself took 669 → 11
   * in one go. **The other ten were four passes of the spring solve that a grid line does not
   * get, because they live INSIDE `setXSpacing`** — and each had to be found by differencing,
   * because nothing in the algorithm mentions them:
   *
   * ✅ **`checkLastBarX` — 11 → 7.** Called at the end of `layoutStaffGroup`
   *    (`layout/staff-group.js:119`), which only `setXSpacing` calls. So a short voice's closing
   *    bar is NOT pulled out to meet the long one's. `abcts-last-bar` tune 0 was a whole slot.
   * ✅ **`centerWholeRests` — inside `setXSpacing` itself** (`layout/layout.js:78`), so a
   *    time-based whole rest stays on its grid slot: 181.53 against the solve's 366.36.
   * ⭐ **SIMULTANEITY IS TIME AND WE GROUPED BY x — 7 → 3.** `toTimeAndStaffBased` keys a
   *    staff's slots on a running sum of `child.duration` and reads no x at all
   *    (`layout/to-time-and-staff-based.js`). Grouping by x agreed for as long as the SPRING
   *    SOLVE was the only layout, because it puts simultaneous elements at the same x; the grid
   *    left-aligns each by its own ink and the grouping simply stopped finding them. **The grid
   *    did not break this, it revealed it** — and the fix is on the DEFAULT path too, where the
   *    two answers coincide (`svg-bytes` 0 of 691 either way).
   * ⭐ **AN ENDING'S ROOM IS CHARGED TO VOICE 0 ALONE — 3 → 1.**
   *    `if (voice.voicenumber === 0)` gates `minspacing += textWidth + 10` AND the `EndingElem`
   *    together (`abstract-engraver.js:1034-1042`). The CLOSING bar's charge was already gated
   *    here and the OPENING bar's asked nobody. Invisible under the shared cursor, where
   *    `minspacing` is only a floor and voice 0's larger one wins.
   *
   * ⚠️ **AND THE VOICES ARE NOT ON A COMMON GRID.** `durationUnit` is computed INSIDE the voice
   * loop, from where THAT voice's fixed-left walk left the cursor — and a duplicate voice has no
   * staff-extras at all (`voice.children = []`, `abstract-engraver.js:181`), so its music starts
   * at the left edge and its unit is wider. That is what made the two per-voice bugs above
   * visible at all.
   *
   * ✅ **CLOSED AT 0 — AND THE LAST ROW WAS A CENTRE-VERSUS-EDGE REPRESENTATION, MEASURED TO
   * THE DOUBLE.** `abcts-rests-and-bars-tune13`'s closing bar: both engines placed the ELEMENT
   * at exactly 119.955, and abcjs drew `M 119.95` where we drew `M 119.96`. abcjs stores a
   * rule's EDGE and `printStem` writes `roundNumber(x)` then `roundNumber(x + dx)`
   * (`draw/print-stem.js:13-14`); we store the CENTRE — the placed line is 120.25500000000001 —
   * and the emitter RECOVERED the edge as `centre - half`, which is `119.95500000000001` and
   * rounds the other way. `(119.955).toFixed(2)` is `"119.95"` and
   * `(119.95500000000001).toFixed(2)` is `"119.96"`.
   *
   * The fix is representational, as `lineThickness`'s note already said it would be: the four
   * producers of a vertical rule — a barline, a note stem, a tempo stem and a grace stem —
   * record the edge they ALREADY HAD in `PlacedLine.anchorX`, and the emitter uses it in place
   * of the recovery. It rides every shift and the output scale exactly as `x1` does, and the
   * emitter falls back to the recovery when the two disagree by more than a rounding tail.
   *
   * ⚖️ **AND `{}` IS A DECLARED DIVERGENCE: abcjs WRITES 29 `NaN`s FOR IT.**
   * `getTotalDuration` is handed `timeBasedLayout.minPadding` and adds it to every width, so an
   * ABSENT `minPadding` is `w + undefined`. `{minPadding: 0}` is byte-identical. See
   * `Docs/ABCJS-DIFFERENCES.md`.
   */
  ['timeBasedLayout', { timeBasedLayout: { minPadding: 20 } }, 0],
  /**
   * ⚠️ **23, AND THE LINE-STRUCTURE HALF IS CLOSED.** Counting staff lines in each engine
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
   * ✅ **AND AN ENDING DECLARED ON THE BARLINE THAT *ENDS* A SYSTEM OPENS ON THAT SYSTEM —
   * 53 → 48.** abcjs opens the `EndingElem` where it processes the BAR (`elem.startEnding`
   * in `createABCBar`, `voice.addOther(this.partstartelem)`,
   * `abstract-engraver.js:1034-1042`), and a break at that bar leaves it the LAST element
   * of the line it CLOSES. So the ending opens THERE, as a hook at the line's right edge
   * WITH its number, and the next line gets a fresh `EndingElem("", null, null)` — no
   * hook, no number — from `createABCVoice`'s `if (this.partstartelem)` (`:230-233`).
   * `|:CDEF|1GABc:|3cdef|]` is `226.78/1`, `415/3`, `222.76/` in both engines now; ours
   * drew ONE bracket, numbered, on the wrong system at 183.71.
   *
   * ⚠️ **AND IT IS NOT A WRAP DEFECT — `%%barsperstaff 2` REPRODUCES IT WITH NO WRAP AT
   * ALL**, on the same tune, and no golden covers that path. Fixed for both.
   *
   * ⚠️ **AND `%%barsperstaff` HAS ITS OWN, SEPARATE SPLITTING DEFECT, NOW NAMED.** On that
   * tune abcjs puts `|:CDEF|` ALONE on line 1 under `%%barsperstaff 2` where we put two
   * measures — because abcjs counts BAR ELEMENTS there too and `|:CDEF|` is two of them,
   * exactly the rule this file's wrap comment states. `wrapMusicLines`
   * (`parser.ts:3556`) counts measures. Untouched: no gate renders it.
   *
   * ⚠️ **THE REMAINING 42 ARE DIFFERENCED AND NAMED** (the 48 as differenced, minus the 16
   * closed by the row marked ✅ below; the counts in the list are as measured at 48). Classified by the kind of element
   * each engine draws, not by the byte — a set difference of element kinds says an element
   * is MISSING where a byte offset only says the line is spaced differently:
   *
   * ✅ **THE DELINED STAFF PROPERTY IS RE-EMITTED — 48 → 42.** Closed; the paragraph below
   *    is kept because the rule it states is the one the code implements, and both of its
   *    edge rungs are load-bearing. Two surfaces needed it, as the meter rule did: the
   *    drawn ink in `layout.ts` AND `tune.lines` in `lines.ts`.
   *    ⚠️ **AND `startChar: -1` SORTS TO THE FRONT OF THE LINE AND IS THEN DROPPED.**
   *    `lines.ts`'s `stream` orders by `startChar`, so the injected element landed ahead
   *    of every note; `hoistLeadingStaffFields` then found a staff field before the first
   *    note or bar, tried to move it to the line above, and — nothing above holding music
   *    — DROPPED it, which that function says in so many words. It was in `out` and absent
   *    from `tune.lines`, silently. A `sortAt` pin is what holds it in place.
   *
   *   16  A DELINED STAFF PROPERTY IS NOT RE-EMITTED. ⭐ The largest, and it is a
   *       MECHANISM, not a value. `deline` runs BEFORE `findLineBreaks`, and when it
   *       merges a line it turns that line's STAFF key/meter/clef/font into a voice
   *       element and `unshift`s it onto the front of the voice, with `startChar: -1`
   *       (`data/deline-tune.js:23-39`, `addKeyToVoices`/`addMeterToVoices`/
   *       `addClefToVoices` at `:126-151`) — guarded by `objEqual` against a running
   *       `currentKey`/`currentMeter`/`currentClef`, so an unchanged line contributes
   *       nothing. The wrap then dissolves the source break and BOTH survive: the
   *       previous line's trailing warning AND the injected staff property.
   *
   *       Measured on four one-line rungs, the delined voice of `CDEF| / K:G / GAB^c|`:
   *
   *           K: change    abcjs  … bar keySignature keySignature note …   ours ONE
   *           M: change    abcjs  … bar timeSignature note …               ours NONE
   *           clef change  abcjs  … bar clef@26 keySignature clef@-1 …     ours no `@-1`
   *           no change    identical
   *
   *       So it is uniform: we drop the injected element in all three, and the `@-1` is
   *       the discriminator. ⚠️ It is NOT a flag — it is a new element in the stream, and
   *       the prefix builder that would carry it is the most suppression-dense function
   *       here (every `drawKeyChange`/`drawMeterChange` guard is separately measured
   *       against a golden). Do it at the `applyLineBreaks` stage, where abcjs does it.
   *       ⚠️ And `objEqual` tracks the STAFF key only, so an inline `[K:]` on the previous
   *       line does NOT advance `currentKey` — measure that arm before porting it.
   *       Fixtures: the 7 `clef-midmeasure`/`keywarn`/`stafflines-and-modifiers` rows
   *       (a second notehead's x), `synth-flattener-17` (+3 sharp, -3 natural, -2 flat —
   *       the missing key signature showing as accidentals), and the bar-x rows.
   *
   * ✅ **THE BAR NUMBERS — 41 → 34.** Not a lost label: a wrap RENUMBERS EVERY BAR FROM 1
   *    and throws away both `%%setbarnb` and the frequency.
   *
   *        if (barNumbers !== undefined && action.staff === 0 && action.line > 0)
   *          outputLines[action.line].staff[action.staff].barNumber = currentBarNumber;
   *        …
   *        if (barNumbers !== undefined && action.staff === 0 && action.voice === 0)
   *          for (kk = 0; kk < currVoice.length; kk++)
   *            if (currVoice[kk].el_type === 'bar') {
   *              currentBarNumber++
   *              if (kk === currVoice.length-1) delete currVoice[kk].barNumber
   *              else currVoice[kk].barNumber = currentBarNumber
   *            }
   *
   *    (`wrap_lines.js:37-39`, `:78-88`.) `currentBarNumber` opens at 1, counts BAR
   *    ELEMENTS, and the assignment is unconditional — no `% barNumbers` test survives.
   *    Measured on eight bars: `%%barnumbers 5` + `%%setbarnb 24` draws `25 30` unwrapped
   *    and `1 2 3 4 5 6 7 8` wrapped.
   *    ⚠️ **AND THE GATE IS THAT THE DIRECTIVE APPEARED, NOT THAT IT DREW ANYTHING.**
   *    `%%barnumbers 50` fires on no bar of that tune and `%%barnumbers 0` numbers the
   *    CLEF rather than a barline; both draw nothing unwrapped and every bar wrapped. So
   *    "some measure carries a number" is NOT a usable proxy — hence
   *    `Score.barNumbersDirective`, measured before it was added rather than assumed.
   *    ⚠️ And the head number is `action.line > 0`, the same output-line index the meter
   *    rule turns on, so the first system takes one exactly when `wrapDroppedMeter` is set.
   *    ponytail: an OPENING barline takes a number in abcjs and cannot here — the model has
   *    `closingBarNumber` and no opening twin. It still COUNTS, so every drawn number is
   *    right; only a number ON a `|:` is missing.
   *
   * ✅ **AND AN OPENING BARLINE TAKES A NUMBER TOO** — `Measure.openingBarNumber`, which
   *    the `ponytail:` above predicted would be needed "if a fixture ever shows one".
   *    `visual-options-01-fonts` is that fixture: `%%measurenb 1` with `|1"C"CE…:|` puts a
   *    number on the opening bar of the first measure. The parser's own `%%barnumbers` path
   *    never does — it stamps the bar that CLOSES a measure — but `addLineBreaks` walks BAR
   *    ELEMENTS and an opening `|:` or `|1` is one. That fixture went from +2 `path:box`
   *    and +2 `text:bar-number` with a differing page to **194 / 194 elements and an EXACT
   *    page height (1196.1352500000003 both)**; the count does not move because ONE number
   *    VALUE still differs.
   *
   * ✅ **AND THE HEAD NUMBER COMES FROM THE DELINED LINE — 32 → 31, `options-01` CLOSED.**
   *    `addLineBreaks` runs over `tune.deline({lineBreaks: false})`, so `ogLine` is a
   *    DELINED line: contiguous music merges into one and only a non-music row starts
   *    another. Its keys-copy loop overwrites the wrap's counter with that line's own
   *    `barNumber` for every output line cut from it. A SECTION is our name for the run.
   *    ⭐ Two instrumented runs settled it and the first reading was wrong: `piano-300`'s
   *    SOURCE lines each carry a head (4, 6, 8, 10, 12) and its wrapped heads still follow
   *    the counter, because deline merges them into one line whose `barNumber` is the
   *    first line's — absent. `%%text` blocks that merge, which is why `options-01` repeats
   *    its 3. The paragraph below is kept as the record of how it was found.
   *
   *    ⚠️ **THE RESIDUAL WAS ONE NUMBER VALUE, AND THIS IS HOW IT WAS EXPLAINED.** abcjs renders
   *    heads `1, 3, 3, 3` while its counter plainly reaches 5, which two passes over
   *    `addLineBreaks` could not account for. INSTRUMENTED (abcjs's own `tune.lines`
   *    against its actions list) and the answer is a SECOND WRITE: the keys-copy loop runs
   *    after the assignment and `barNumber` is NOT in its skip list, where `meter` is —
   *
   *        if (barNumbers !== undefined && …) …barNumber = currentBarNumber;   // :37-39
   *        var keys = Object.keys(inputStaff)                                   // :41
   *        … if (!skip) outputLines[…].staff[…][keys[k]] = inputStaff[keys[k]];
   *
   *    — so `inputStaff.barNumber`, which `tune-builder.js:139-144` put there by moving a
   *    source line's last bar number onto the next music line's staff, overwrites it.
   *    Lines 5 and 6 both come from `ogLine` 4, whose source staff carries 3.
   *
   *    ⚠️ **AND THE OBVIOUS PORT IS WRONG — TRIED, MEASURED, REVERTED.** Taking the head
   *    from the source line's own `systemBarNumber` fixes this fixture exactly and BREAKS
   *    `piano-300`, which wants the counter: abcjs gives it `2, 4, 5, 6, 8, 9, …` and the
   *    port repeats `4, 4, 8, 8`. So `inputStaff.barNumber` is present on one source line
   *    and ABSENT on the other, and `Measure.systemBarNumber` does not tell them apart.
   *    **What decides whether it is there at all is the open question** — instrument
   *    `tune-builder.js:139` next, not `addLineBreaks`. The `wrap.test.ts` ratchet caught
   *    the regression, which is what that fixture is in it for.
   *
   *    7  A BAR NUMBER IS LOST. `text:bar-number` is present in abcjs and absent here on
   *       `visual-layout-01`/`-02` (with its `path:box` — a `%%barlabelfont … box` label,
   *       and the box reserves 25.64px of PAGE HEIGHT), `visual-parsing-10-song` (+2),
   *       `mouse-click-01`, `options-01` (+3, +3 boxes), `selection-01`,
   *       `svg-per-line-01`, `tablature-15`. The renumbering half of `wrap_lines.js:78-88`
   *       landed last session; this is its residual.
   *
   * ✅ **ONE OF THE SIX LOST TEMPOS WAS MINE — 42 → 41.** `prefix`'s `withMeter` flag hangs
   *    THREE things off "this is the first system": the clef/key prefix, the header meter
   *    and the tune's TEMPO MARK (`engraver-controller.js:232`). Narrowing it for
   *    `wrapDroppedMeter` took the tempo off every wrapped tune with a subtitle, and NO
   *    GATE CAUGHT IT — the fixtures that show it were already differing on other causes,
   *    so this count never moved. The meter is narrowed at its own use site now. The other
   *    five still differ for the reason below.
   *
   *    6  A TEMPO IS LOST — `g:tempo` with its `noteheads.quarter`, `stem` and
   *       `text:beats`/`text:pre`. `createABCLine` hands the tempo to `createABCVoice`
   *       PER LINE, and the re-lined structure is not the one that was handed it.
   *       `abcts-tempo-rung-tune2`, `mouse-click-01`, `options-01`, `selection-01`,
   *       `svg-per-line-01`, `tablature-15`.
   *
   *    5  AN ENDING IS STILL MISSING — **and the family SPLITS IN TWO.** ⚠️ It was written
   *       up as one; checking the sources says otherwise, which is the third recorded
   *       cause this session to fall to one measurement.
   *
   *       (a) ✅ **THE BREAK-BAR IS ON THE WRONG SIDE — CLOSED STRUCTURALLY.**
   *           `Measure.openingBarlineTrails` + `layoutMeasure`'s `trailingBar` +
   *           `barAnchor(…, 'trailing', …)`. All three ending fixtures now match on element
   *           COUNT: `layout-09-endings` 136 → 138 of abcjs's 138, `tablature-20` 128 → 130,
   *           `tablature-17` loses its four missing brackets (its remaining +4 is the
   *           DECLARED debug marker). ⚠️ **Two offsets remain and the count does not move
   *           for them**: the numbered head is at 416 against abcjs's 415, and the middle
   *           continuation closes at 382.5 against 395. Geometry around the trailing bar,
   *           not structure.
   *           ⚠️ **AND THE FLAG IS STAMPED ON EVERY PATH, INCLUDING THE TWO THAT RETURN
   *           EARLY.** Under a wrap EVERY line boundary comes from `findLineBreaks`,
   *           whether or not it falls where the source already broke — the first attempt
   *           stamped it only where the wrap MOVED a break and reached exactly one measure
   *           of six.
   *           The original reading, kept because it is what the fix is built on: `tablature-20-score-1-2` (`[|]1`)
   *           and `visual-layout-09-endings` (`[1`) declare their endings on OPENING
   *           barlines. MEASURED through `tune.lines` on
   *           `CDEF|GABc|cdef|gabc| / [|]1 CDEF:| / [|]2 GABc|]` under wrap:
   *
   *             abcjs  L1: note×4 bar(bar_thin) bar(bar_invisible:E1)
   *                    L2: note×4 bar(bar_right_repeat) bar(bar_invisible:E2)
   *             abcts  L1: note×4 bar(bar_thin)
   *                    L2: bar(bar_invisible:E1) note×4 bar(bar_right_repeat)
   *
   *           `findLineBreaks` pushes `{start, end: e}` with `e` the bar itself, so the
   *           break-bar ENDS the line it closes — and an opening barline is a bar element
   *           like any other. `opensHere` in `applyLineBreaks` takes it to the new line
   *           with its measure. ⚠️ **AND THE MODEL CANNOT HOLD IT WHERE abcjs PUTS IT**:
   *           the previous line would carry TWO trailing bars (`bar_thin` then the
   *           invisible one) and a `Measure` has one `closingBarline`. It wants a trailing
   *           slot beside `trailingClef`/`trailingKey`/`trailingMeter`, and then the
   *           end-of-system volta block above opens on it. That is the shape of the work;
   *           it is not a one-liner.
   *           ⚠️ The `voltaOnOpeningBar` exclusion in `layout.ts` is DISPROVED and says so
   *           at the site — abcjs opens such an ending at the previous system's right edge
   *           exactly as a closing-bar one.
   *           ⚠️ **AND THE CHEAP FIX WAS TRIED AND IS DISPROVED TWICE OVER.** Letting the
   *           end-of-system block fire for `voltaOnOpeningBar` and anchoring at
   *           `solved.width - lineEndInset` gets the STRUCTURE right — four bracket groups
   *           against abcjs's four, numbers at 414 against 415 — and is still wrong:
   *           (1) it reddens EIGHT suites, because the rule belongs to the WRAP and not to
   *           system breaks in general. Without a wrap, abcjs's lines ARE the source lines
   *           and an `[1` opening one genuinely does belong to it; only `findLineBreaks`'
   *           slicing puts a break-bar on the line it closes. Any fix must be gated on the
   *           break having been MADE by the wrap.
   *           (2) even where it applies, the carried continuation still closes at the
   *           misplaced bar — 25→54.05 against abcjs's 25→395 — because `opensAfterVolta`
   *           ends it on the opening bar that is still at the head of the new system.
   *           So the BAR has to move, and the model needs the trailing slot. Measured,
   *           reverted; do not re-try the anchor on its own.
   *
   *       (b) ✅ **A SPAN OF MORE THAN TWO SYSTEMS — CLOSED.** The reading was right and the
   *           rung sharpened it. abcjs re-creates a fresh `EndingElem("", null, null)` at
   *           the head of EVERY line on which `partstartelem` is still open
   *           (`createABCVoice`, `abstract-engraver.js:230-233`), so there is one segment
   *           per system CROSSED. Measured on an ending stretched over one, two, three and
   *           four systems: abcjs's continuations sit at y163, y256, y348 and y440 and ours
   *           drew only the first. `closeVolta` nulled `voltaCarried` on EVERY continued
   *           close — and the end-of-system close is one, running right after the carry has
   *           been set. `hooked` is exactly "the ending really ends here" and spends it now.
   *           `selection-01` and `svg-per-line-01` lost their missing segments and their
   *           page heights are EXACT (2382.8494275606845 both) where they differed before;
   *           both still differ on geometry inside, so this count does not move.
   *           ⚠️ `tablature-17` keeps its +4 endings and a 499 / 966 page: that fixture is
   *           dominated by its +4 `g:unsupported`, a different defect wearing the symptom.
   *
   *    2  ⚖️ **`g:unsupported` + `text:text` — DECLARED DIVERGENCE, NOT A DEFECT.** These
   *       two are abcjs's FOURTH DEBUG MARKER and this engine declines all four (owner,
   *       2026-09-12) — `Docs/ABCJS-DIFFERENCES.md` has the entry beside `pitch is
   *       undefined` and `clef=x`. It was BUILT AND MEASURED before it was declined: our
   *       markup came out byte-identical to abcjs's but for the `y`, which is the
   *       above-lane its `chordHeightAbove` of 4 reserves. Reverted so the policy is one
   *       rule rather than case-by-case. **This row will not reach 0 while that holds.**
   *       The diagnosis is kept below because the MECHANISM is shared with the three
   *       injections that ARE ported.
   *
   *          `g:unsupported` + `text:text` — the mechanism. It is the FOURTH
   *       ARM of the delined staff property above, and abcjs draws its own DEBUG TEXT for
   *       it. `deline` calls `addFontToVoices` for `vocalfont`, `gchordfont`,
   *       `tripletfont` and `annotationfont` (`data/deline-tune.js:41-60`), producing an
   *       element with `el_type: "font"` — and the engraver's switch has NO CASE for it,
   *       so `default:` builds an `unsupported` AbsoluteElement holding
   *       `"element type " + elem.el_type` as a `type: "debug"` child
   *       (`abstract-engraver.js:379-382`). abcjs literally prints `element type font` on
   *       the score, red and underlined, and it enters the staff's ink: 19.375px of page.
   *
   *           <g fill="currentColor" stroke="none" data-name="unsupported"><text
   *             stroke="#ff0000" font-size="16" font-style="normal" font-family="Arial"
   *             font-weight="normal" text-decoration="underline" class=""
   *             text-anchor="start" x="247.92" y="93.55"><tspan x="247.92">element type
   *             font</tspan></text></g>
   *
   *       ⚠️ **THREE OF THE FOUR FIRE AND `annotationfont` DOES NOT** — measured, both
   *       engines agree on that one, because abcjs's parser never puts it on the staff.
   *       Do not port the fourth branch just because the source has it.
   *       ⚠️ **AND THE FONTS UNSHIFT AHEAD OF THE CLEF, KEY AND METER.** The calls run
   *       meter, key, clef, then the fonts, each onto the FRONT, so the block reads
   *       annotationfont, tripletfont, gchordfont, vocalfont, clef, key, meter — the fonts
   *       come FIRST. `drawWrapInjected` currently emits clef, key, meter; a font arm goes
   *       ahead of them, and a rung with BOTH a font and a key change is what proves it.
   *       ✅ What exists already: `Measure.lineFonts` is exactly abcjs's per-line staff
   *       fonts ("changed since the last line"), so the trigger needs no new detection; and
   *       `debugfont` is already drawn — Arial 16, `#ff0000`, underlined — by the
   *       `"no symbol:"` path (`layout.ts`'s `spec.missingFlag`, `svg.ts`'s `t.debug`).
   *       ⚠️ What does NOT exist: an `unsupported` ELEMENT. `ElementType` in
   *       `layout-model.ts` has no such member and the emitter has no group for it, and
   *       that type is PUBLIC — hosts read it. Adding a member is a design decision rather
   *       than a port, which is why this is recorded and not landed.
   *       Fixtures: `abcts-model-gaps-tune7` (+1) and `tablature-17-stretchlast` (+4,
   *       which also carries the +4 endings and a 499 / 966 page).
   *
   * ✅ **A WRAPPED SYSTEM'S HEAD KEY IS THE ONE abcjs CARRIED — 34 → 32.**
   *
   *        if (lastKeySig[action.staff])
   *          outputLines[action.line].staff[action.staff].key = lastKeySig[action.staff];
   *        …
   *        lastKeySig[action.staff] = { root, acc, mode,
   *          accidentals: accidentals.filter(a => a.acc !== 'natural') }
   *
   *    (`wrap_lines.js:49-50`, `:60-70`.) `lastKeySig` comes from the last `key` ELEMENT of
   *    the line just finished, so it reaches the NEXT line, and its naturals are FILTERED.
   *    Two rules, each on its own rung:
   *      · an inline `[K:]` the wrap lands at a line head is NOT that line's key — the head
   *        prints what was in force and the change draws in the STREAM after it. abcjs
   *        shows three sharps and then the Bb change; ours made Bb the head key and printed
   *        no sharps at all.
   *      · a carried head key prints NO cancelling naturals. Ours drew two flats and three
   *        naturals where abcjs draws two flats.
   *    Both fall out of passing the carried key as BOTH the outgoing and the incoming one.
   *    ⚠️ **AND THIS CLOSES THE ROW'S LAST LIVE HYPOTHESIS.** `synth-flattener-17`'s
   *    accidentals were predicted to be the delined-key defect and did NOT close with it.
   *    The prediction was wrong and the non-closing was the evidence: it is this rule.
   *
   * ✅ **AND A WRAP LOSES A MUSIC LINE'S OWN `%%vskip` — 31 → 28.** `addLineBreaks` builds
   *    a FRESH line, `outputLines[action.line] = {staff: []}` (`:33-35`), and copies only
   *    the STAFF's keys onto it; `vskip` is a property of the LINE, so nothing carries it.
   *    A NON-music line keeps its own, because that arm assigns the original object whole
   *    (`:89`). Measured on `%%text before` / `%%vskip 20` / `CDEF|`: abcjs's staff sits
   *    20px HIGHER than ours under wrap. Closed `text-udef-parts-overlays` tunes 8 and 46
   *    and `abcts-vskip-tune1`.
   *
   * ✅ **AND A CARRIED ENDING DRAWS BEFORE ITS LINE'S DECORATIONS — 28 → 26.**
   *    `createABCVoice` makes the continuation before it walks a single element
   *    (`abstract-engraver.js:230-233`), so it precedes every note on that line and
   *    therefore every note's decoration. Ours keyed the bracket on `lines[0].x1` — which
   *    for a `continued` half is its CLOSING hook, the opening one being skipped — and so
   *    sorted it after everything. The numbered bracket a few lines above already used the
   *    MIN of its lines. Four elements of 690 on `visual-selection-01`, same coordinates,
   *    pure ORDER; it and `svg-per-line-01` closed.
   *    ⭐ **FOUND BY DIFFERENCING x POSITIONS RATHER THAN ELEMENT SETS**, which is the
   *    instrument the row needs now that 19 of its rows draw the same elements at the same
   *    page height.
   *
   * ✅ **THE TUPLET PAIR — 108 of 265 MOVED DOWN TO 1.** The cause is a WRAP CARRY, not the
   *    tuplet code: `lastStem` re-asserts a voice's stem direction at the head of every
   *    later output line (`wrap_lines.js:59-60`, `:73-80`), so a voice whose companion has
   *    RUN OUT keeps the `up` it was forced while the companion was there. The beam's own
   *    `stemsUp` is what `isAbove` reads (`layout/triplet.js:84-86`), an above-tuplet
   *    reserves a lane, and that lane is the 20.36px.
   *    ⚠️ **THE STEMS WERE NOT THE DISCRIMINATOR THEY LOOKED LIKE** — every sampled stem
   *    pointed up in BOTH engines while the tuplet sat on opposite sides. Three rungs that
   *    agreed (single voice, two voices on one staff, two staves) are what narrowed it to
   *    "the companion has ended", which no amount of reading the tuplet code would give.
   * ✅ **AND THE `voice-name` AT dy 17.000 WITH IT — 26 → 24, BOTH FIXTURES CLOSED.** abcjs's
   *    `total` and `index` in `baselineToCenter` come from the LINE's staff voices, so a
   *    voice with no music on a line is not among them and the SURVIVOR's
   *    `(total - index - 2) * fontSize` term changes by a whole font size — 17px on a 17px
   *    `voicefont`. We were naming every declared voice on every system.
   *    ⚠️ **AND A VOICE SURVIVES EXACTLY ONE LINE PAST ITS LAST MUSIC**, because
   *    `findLineBreaks` pushes a final `{…, start, end: voice.length}` unconditionally
   *    (`:143-147`) — an empty slice that still creates the voice on that line. Filtering
   *    on music ALONE took that name away, and the RUNG caught it; the gate count had
   *    already moved.
   *
   *    The original diagnosis, kept because the narrowing is the useful part:
   *    `visual-mouse-click-01` and `visual-tablature-15` share one signature — 108 of 265
   *    elements moved, the first a staff line at dy 20.360 — and it is NOT a placement of
   *    the staff. Everything ABOVE it is at the SAME absolute y in both engines: the
   *    `[ending]line@839.62`, the `[ending]1@858.56`, the `dynamics@805.96` and all five
   *    tempo parts. Only the staff differs, 901.19 against 880.83.
   *
   *    What differs is ONE TUPLET NUMBER: abcjs draws its `3` at **873.06, ABOVE** the
   *    staff and we draw it at **937.40, BELOW**. abcjs's above-placement reserves the lane
   *    that pushes the staff down, which is the whole 20.36. The SECOND tuplet on the same
   *    tune has its bracket on the same side in both (1068.64 / 1127.60), so it is the
   *    SIDE of one tuplet and not the tuplet code in general.
   *
   *    ⚠️ It must be wrap-reachable only — `svg-bytes` is 0 of 691.
   *    ⭐ **AND THE TUPLET ITSELF IS NOT THE DEFECT — MEASURED.** Lifting that same
   *    `(3B2d2c2` into a single-voice tune puts the `3` at 134.99 in BOTH engines, wrapped
   *    and unwrapped alike. So the side is decided by the CONTEXT the fixture supplies and
   *    not by the tuplet code: it is a `%%staves` piano tune and the triplet sits on
   *    `[V: PianoRightHand]`, one voice of a shared staff. Look at the multi-voice stem
   *    direction next — and note that the isolated rung is what rules out the simpler
   *    explanation, which reading the tuplet code would not have.
   *
   * ✅ **PART OF IT LANDED: THE INJECTED STAFF KEY CARRIES ITS NATURALS, AFTER ITS
   *    ACCIDENTALS.** `deline` injects `inputStaff.key`, and a STAFF's key is built as
   *    `accidentals.concat(impliedNaturals)` — the OPPOSITE order from a mid-tune `[K:]`,
   *    which is `impliedNaturals.concat(accidentals)` (`tune-builder.js:998-1001` against
   *    `:280`, `:289`). `layoutKeyChange`'s `naturalsLast` already existed for exactly this
   *    and the first port of the injection missed it, passing the key as its OWN
   *    predecessor. Measured: abcjs writes `nat flat flat nat` at a merged change and we
   *    wrote `nat flat flat`. ⚠️ **AND `%%keywarn 0` TAKES THOSE NATURALS TOO** — the first
   *    fix ignored the directive and drew one where abcjs draws none, caught by the
   *    control. `parsing-x10`'s lengths now MATCH (39/39).
   *
   * ✅ **A WRAP MOVES THE CAUTIONARY CLEF ONTO THE NEXT SYSTEM'S HEAD — 7 → 6.**
   *    `appendStartingElement('clef', …)` pushes onto the voice that is still open
   *    (`abc_parse_header.js:508-513`), so a mid-tune `K: clef=` is a STREAM element fixed
   *    at the SOURCE break, not a reservation at a system end. `deline` merges the lines,
   *    `addLineBreaks` re-splits them, and it lands at the head of the slice that follows —
   *    beside `deline`'s injected staff clef, so the system opens with the SAME clef twice.
   *    `visual-selection-03` is seven `K:C clef=…` lines, three to a system; ours stranded
   *    system 2's cautionary past system 1's last barline.
   *    ⚠️ **MOVED, NOT DROPPED** — suppressing it took the fixture 54 elements to 52.
   *
   * ⭐ **A TRAILING BAR IS A BAR LIKE ANY OTHER — 13 → 8, AND THAT WAS THE WHOLE
   *    "PROGRESSIVE SPACING" FAMILY.** `layoutOneItem` drops `child.minspacing` on the
   *    line's LAST element alone (`layout/voice-elements.js:78`); `getMinWidth` and the
   *    `extraw -= 5` clearance apply to it as to every other barline. `layoutMeasure`
   *    passed `el.width` for the trailing copy of a wrap-broken opening bar — ZERO for an
   *    INVISIBLE bar, since nothing is drawn — and a `left` of 0, where `barWidthOf` gives
   *    abcjs's `w` of 1 whatever the ink. Six short of the fixed budget (1 + 5), and the
   *    ELASTIC note gaps grew to fill it.
   *    ⚠️ **SEVEN FIXTURES READ AS SEVEN SPACING DEFECTS AND WERE ONE EXPRESSION.**
   *    `synth-flattener-07`, `-46`, `visual-tablature-20`, `-24` and `abcts-endings` tune 2
   *    closed together. Found by instrumenting abcjs's `layoutOneItem` against our own
   *    `fixed()` list: abcjs's last element reports `w=1 extraw=-5`, ours `rod 0 … w 0`.
   *
   * ✅ **A WRAP LOSES `%%voicecolor` ON EVERY LINE BUT THE ONE THAT CARRIES IT — 8 → 7.**
   *    It is a `color` ELEMENT in the voice stream (`tune-builder.js:993`) and `drawVoice`
   *    swaps only `if (params.color)`, set when that element is PROCESSED
   *    (`abstract-engraver.js:376-377`). `deline` merges the music into ONE line so an
   *    unwrapped tune colours throughout; `addLineBreaks` re-splits it and only the slice
   *    holding the element keeps `voice.color`. `visual-layout-09-endings`' second system
   *    is `currentColor` throughout in abcjs — the V:1 blue AND the V:2 red both gone.
   *
   * ✅ **A QUOTED-LABEL ENDING CLOSES ON THE SYSTEM THAT OPENED IT — `abcts-endings`
   *    tune 2 is 31 of 31 with identical kinds.** `["second"] E2` ends at the `]` its own
   *    label leaves behind (`abc_parse_music.js:271-274`), ONE bar element after it opened;
   *    when the wrap breaks between the two that bar TRAILS onto the system before it, so
   *    abcjs's line 0 carries `bar_right_repeat start=second` AND `bar_invisible END` and
   *    its line 1 has no ending element. The per-measure pass already makes that close, but
   *    inside the `voltaOpenedOnPreviousSystem !== i` guard — so for an ending the previous
   *    system opened, the open and the close were skipped together and a continuation
   *    bracket was drawn that abcjs never draws.
   *    ⚠️ **AND THE NEXT SYSTEM MUST STILL BE MARKED.** Clearing that marker along with the
   *    carry drew a SECOND labelled bracket there — worse than the bug.
   *    ⚠️ **WHAT REMAINS ON IT IS SPACING, NOT ELEMENTS**: every element is +3 and then +6,
   *    starting at the C→`|` gap BEFORE any ending bar, so it is not the ending room —
   *    measured by restoring the old double charge, which moves it not at all. Same family
   *    as `layout-09-endings` and `tablature-20`.
   *
   * ✅ **"LEADS THE LINE" IS A SOURCE POSITION, NOT A BRACKET — 16 → 14.** `startNewLine`
   *    fires LAZILY (`abc_parse_music.js:152-156`), so a BRACKETED `[K:… clef=]` written
   *    before a line's first note is already in `multilineVars` when `params.clef` is
   *    stamped and IS that line's staff clef. `deline`'s injection test read
   *    `…Inline !== true`, which says the opposite. `abcts-stafflines-and-modifiers` tune 4
   *    (`stafflines` is a property of the CLEF) and `abcts-ledger-gaps-4` tune 5.
   *
   * ✅ **A HOST WRAP DROPS THE METER ON EVERY OUTPUT LINE PAST 0, `%%barsperstaff`
   *    INCLUDED — 14 → 13.** `addLineBreaks` skips `meter` for `action.line !== 0` whatever
   *    made the line; `%%barsperstaff`'s own `wrapMusicLines` copies the staff WHOLE and is
   *    why `Measure.wrappedLine` grants one. When both run the host wrap is applied LAST.
   *    ⚠️ Two surfaces again — the ink was fixed first and `tune.lines` still carried 4/4.
   *
   * ✅ **THE WHOLE `%%keywarn` CLUSTER IS CLOSED — x10, x11 AND x12.** x11 and x12 took
   *    three more rules, 18 → 16:
   *      · `lastKeySig` is a property of the STAFF and `addLineBreaks` never resets it, so
   *        it crosses the non-music row a subtitle or `%%text` puts between two runs.
   *        `opensHere` cannot see those measures — they open a SECTION, not a wrapped line.
   *      · a standalone `K:` written after such a row publishes NO key element, because
   *        `appendStartingElement` bails at `if (!staff) return` on the subtitle row
   *        (`tune-builder.js:255-258`). Unwrapped that costs nothing — `startNewLine`
   *        stamps the staff and the prefix prints it — but under a wrap `addLineBreaks`
   *        overwrites the staff key with the carried one and the change is lost from the
   *        DRAWING. abcjs renders x11's last system in the carried F, not the `K:D`.
   *        ⚠️ Half of this is WORSE than none: the carry without the suppression drew both,
   *        41 elements against abcjs's 38, where the unfixed engine drew 39.
   *      · `addKeyToVoices` unshifts onto EVERY voice of the staff
   *        (`data/deline-tune.js:135-142`), not voice 0's. x12 alternates `V:1`/`V:2` and
   *        ours drew three accidentals of eighteen.
   *
   * ✅ **AND `parsing-x10` IS CLOSED — 23 → 22 — AND THE HEAD KEY WAS NEVER THE PROBLEM.**
   *    The two flats read as "Gm, the HEADER key" and they are not: abcjs's system 2 draws
   *    the carried `K:F` at its HEAD and then a SECOND group in the stream, the delined
   *    line's own staff key, which is `F [flat nat]`. Instrumenting abcjs's `tune.lines`
   *    says so outright — `line 1 key=F [flatB]` with `v0: KEY{F [flatB naturalf]}@-1 …` —
   *    where reading the ink alone gave a three-glyph head nothing explained.
   *    ⭐ **TWO STAMPS WERE OWED ON THE SAME BRANCH.** `applyLineBreaks` returns bare where
   *    the wrap's break COINCIDES with a source break — the "nothing moved" arm — but
   *    neither stamp is about a break moving: `deline` runs BEFORE `findLineBreaks`, so its
   *    injection is owed at every source line start, and the system opened there is still a
   *    WRAPPED system, so its head takes `lastKeySig`. `Measure.wrapSourceLineStart` is the
   *    parser's break surviving the wrap's overwrite of `startsSystem`.
   *    ⚠️ **AND THE INJECTED NATURALS ARE THE PENDING ONES, NOT THE MEASURE'S.** `x10`
   *    writes `%%keywarn 0` BETWEEN the inline `[K:F]` that creates them and the line that
   *    re-emits them, and abcjs draws the natural anyway — `impliedNaturals` are built at
   *    the change and live until the next `startNewLine` consumes them, and a voice switch
   *    drops them. `keyAtPreviousLine` is NOT that value (it folds in this line's keywarn,
   *    which is right for the prefix); `injectedKeyCancels` is.
   *    ⚠️ **THE PREVIOUS SESSION'S "DISPROVED" READING WAS TWO CHANGES AT ONCE** — stamping
   *    every return path AND treating a section start as opening a line. The first half is
   *    right on its own; the second was what took `x10` to 39/37 and `x11` to 38/41.
   *
   *    ⚠️ **AND A NOTE HERE WAS WRONG, FROM A MUTE PROBE.** It said a standalone `K:` is
   *    "not on `Measure.keyChange` at all", measured across three measures. The probe read
   *    `m.keyChange?.root`; the field is `tonic`, so it printed null for a key that was
   *    there. `keyChange` IS set on both. Corrected rather than left, because the next pass
   *    would have gone looking for a field that does not exist.
   *
   *    The original diagnosis:
   *    `visual-parsing-x10` / `-x11` / `-x12` all toggle `%%keywarn` between key changes,
   *    and all three are LENGTH mismatches — 39/37, 38/37, 195/187 — so an element is
   *    missing, not moved. Counted per system, the NOTES AND BARS MATCH exactly (four of
   *    each on both lines of x10); every missing element is a key-signature accidental:
   *
   *      sys 1  js  fl@49 fl@57 fl@139 nat@221 sh@234 sh@252 **nat@257** nat@336 fl@343
   *             ts  fl@49 fl@57 fl@141 nat@224 sh@237 sh@256             nat@335 fl@341
   *      sys 2  js  fl@49 **fl@65** nat@75 sh@244 sh@254 sh@264
   *             ts  fl@49          nat@58 sh@235 sh@246 sh@256
   *
   *    So at the head of system 2 abcjs prints TWO flats and a natural where we print one
   *    flat and a natural — and the key in force there is F, which has one flat. Two flats
   *    is Gm, the tune's HEADER key. ⚠️ That smells like the carried `lastKeySig` and the
   *    `%%keywarn` naturals interacting, which is exactly where `Measure.wrapLineHeadKey`
   *    lives — so re-read that rule before adding another, and remember its naturals are
   *    FILTERED by `wrap_lines.js:60-70`.
   *
   * ✅ **AN ENDING'S ROOM IS CHARGED TO EXACTLY ONE BARLINE — 21 → 20.**
   *    `abselem.minspacing += textWidth + 10` adds it to the SINGLE abselem the engraver is
   *    building when it reads `elem.startEnding` (`abstract-engraver.js:1034-1041`), so the
   *    room belongs to the bar the volta was WRITTEN on. This model splits that bar two
   *    ways — a measure's own opening barline, or the previous measure's closing one — and
   *    BOTH sites charged it. See `voltaOnOwnOpeningBar`.
   *    ⭐ **INSTRUMENTED IN abcjs'S OWN `layoutOneItem`**, which is what settled it: on
   *    `E8| |1 D8 :|2 C8` the plain `|` reports `minsp=10` and the `|1` reports `minsp=28.5`
   *    — one charge — and the bars land 16 apart where ours put them 34.5 apart.
   *    ⚠️ **AND THE "DISPROVED" READING WAS BACKWARDS.** The gap form is right and
   *    `minspacing` IS the floor this file already models — `voice.minx += child.minspacing`
   *    with the next element at `max(minx, nextx)` (`layout/voice-elements.js:74-80`). It
   *    costs nothing after the `|1`, where the natural gap is 29.5 against a floor of 28.5,
   *    and everything between two adjacent barlines, where the natural gap is 0. Nothing
   *    had to move into the left-ink shortfall; the charge was simply doubled.
   *    ⚠️ **AND IT WAS NEVER A WRAP DEFECT.** Written on ONE source line the same tune
   *    differs UNWRAPPED — no golden covers that shape, because in every fixture that
   *    writes the barline separately the two bars fall on different systems and the gap
   *    between them is not drawn. The control lives in `positioning.test.ts`, not
   *    `wrap.test.ts`, and four volta spellings are rendered against abcjs in webkit.
   *
   * 🏁 **THIS ROW IS AT ITS FLOOR — 4, AND ALL FOUR ARE CLOSED BY DECISION.** Two are
   *    abcjs's FOURTH DEBUG MARKER, declined by the owner, and two are abcjs CRASHING in
   *    its own `wrapLines`. There is nothing reachable left on it.
   *
   * ✅ **AN ELEMENT'S WIDTH IS `dx + w`, NOT `(x + w) - base` — 5 → 4, THE LAST ROW.**
   *    `abselem.w` is `max(dx + w)` over the `addRight` children
   *    (`absolute-element.js:141`) — each child's OFFSET added to its width, never two
   *    absolute x's subtracted. A plain notehead's term built the second way is
   *    `(394.97100000000006 + 9.81) - 394.97100000000006` = `9.809999999999945` against
   *    abcjs's flat `9.81`.
   *    ⚠️ **ONLY A GLISSANDO COULD SEE IT** — it insets by half that width at each end and
   *    is the only emitter writing a coordinate at FULL precision; everything else goes
   *    through `roundNumber`, where the two round the same. `visual-misc-04-stretchlast`
   *    was 0 of 116 elements moved with one byte differing.
   *    ⚠️ **AND THE NOTE'S SOLVED x WAS NEVER WRONG.** The recorded reading blamed the
   *    spring solve's accumulation for that column; both engines' 41-element x chains were
   *    logged and are BYTE-IDENTICAL, `394.97100000000006` included. The defect was one
   *    association in the width beside it.
   *
   * ✅ **AND `synth-flattener-21` IS CLOSED — 6 → 5 — AND IT NEVER BELONGED TO THE ENDING
   *    ROOM.** It has no ending in it at all; it is `&` overlay voices, and the cause is
   *    that **a SILENT layer measure takes an invisible rest of the PARENT's duration**.
   *    `resolveOverlays` fills one in (`core/overlays.ts`) and `expandOverlays` — the
   *    RENDERER's own copy of that job — left the measure empty, so the layer had no
   *    element at that musical time and the shared cursor put its BARLINE at time 0, beside
   *    the parent's note, then spent a SECOND bar rod on the parent's own bar.
   *    System 2's four measures are one whole note each: abcjs 82.97 / 93.99 / 93.98 /
   *    93.99, ours 77.47 / 88.49 / 110.48 / 88.49 — the single-layer measure 16.5 too wide,
   *    its neighbours 5.5 short apiece, and its opening barline 33.018 from its note against
   *    abcjs's 11.018. **22 extra, TWO bar rods, one per absent layer.**
   *    ⚠️ **AND THE PAD IS MARKED** (`Measure.overlayPad`): a layer silent across a WHOLE
   *    system is dropped from the solve, worth 5px corpus-wide, and a real `x4` is an
   *    invisible rest too. **This row cannot see that half — `extended-snapshot` is what
   *    defends it**, checked rather than assumed.
   *    ⚠️ **IT WAS DIFFERENCED FIRST AND PORTED SECOND.** Every per-element rod had already
   *    been logged against abcjs's and matched, the padding rest included — which is what
   *    said the defect was in the CURSOR and not in any element's claim.
   *
   * ✅ **A PITCH IS CONVERTED TO A y ONCE, AND THE FRACTION GOES ON THE PITCH — 20 → 18.**
   *    `calcY(ofs) = this.y - ofs * STEP` shifts NOTHING, so every fudge the engraver
   *    applies — `p1 = minpitch + 1/3`, the beam pass's `+ 1/5`, the triplet number's
   *    `calcY(yTextPos - 1)` — is added to a pitch in abcjs's OWN origin first. Ours added
   *    them in step space and let `stepToY` add `PITCH_ORIGIN` after, or converted and then
   *    added the offset in y. `(-10 + 1/5) + 6` is `-3.8000000000000007` against `-3.8`;
   *    `roundNumber` tips the other way and writes `99.29` for `99.28`. See `pitchToY`.
   *    Closed `visual-transpose-06` and `visual-multi-voice-x03`.
   *    ⚠️ **THE WRAP ONLY EXPOSES IT** — the rule is not the wrap's and neither fixture
   *    differs unwrapped, because the defect shows only on a value landing on a `.xx5`
   *    boundary and no golden's does. Controls in `positioning.test.ts`.
   *    ⚠️ **AND `yTextPitch` MUST BE READ BESIDE `y`** — a tall middle note FLATTENS
   *    `startNote`/`endNote` after they are first set, and hoisting the read above that
   *    pass reddened 26 rows of the suite.
   *
   *  ⚠️ **`visual-misc-04-stretchlast` IS THE THIRD OF THAT FAMILY AND IS NOT THE GLISSANDO.**
   *    Its one byte is a glissando path's start x, `408.78100000000006` against our
   *    `408.781` — and our glissando arithmetic is already abcjs's expression
   *    term for term. Instrumented: abcjs's own `anchor1.x` is `394.97100000000006`, so the
   *    noise is in the NOTE's solved x and the glissando is merely the only emitter that
   *    writes full precision. The notehead itself rounds the same in both, which is why 0
   *    of 116 elements move. Chasing it means matching the spring solve's accumulation for
   *    that column — not attempted.
   *
   * ✅ **AND A STANDALONE `M:` IS DRAWN ONCE, NOT TWICE — 24 → 23.** The header parser's
   *    `M:` arm only fills `multilineVars.meter` for the next `startNewLine`;
   *    `appendStartingElement` is never called, so a standalone `M:` is a STAFF property
   *    and not a stream element. `deline` turns it into the ONE voice element abcjs draws
   *    (`addMeterToVoices`), and we drew the injected copy AND the change itself.
   *    ⚠️ An INLINE `[M:]` is exempt — it IS a stream element — and is the control.
   *    ⭐ Found by counting element KINDS on `synth-flattener-38`, whose twelve `M:`
   *    changes showed as twelve extra meter DIGITS, 35 against 23, with the systems, bars
   *    and `lineBreaks` all identical — so nothing structural was wrong and the x-diff's
   *    positional alignment could only report "439/451".
   *
   * ✅ **A WRAPPED SYSTEM REPRINTS THE DELINED LINE'S CLEF — 22 → 21.**
   *    `addLineBreaks` copies the delined line's staff keys onto every output line and has
   *    NO `lastClef` to advance where the key gets `lastKeySig` — so a system cut from a
   *    merged run reprints that run's OPENING clef whatever changed inside it.
   *    `synth-flattener-20` is one source line reading `[K:treble+8]…[K:treble-8]G8| …`
   *    and abcjs opens system 2 **treble+8**: ONE element of 59, the octave `8`, 72.557px,
   *    the marker moving from above the staff to below.
   *    ⭐ **THE VALUE IS RIGHT AND THE SCOPE WAS WRONG.** The previous attempt's
   *    "section's opening clef" is the right quantity; it broke four ratcheted cases by
   *    reading VOICE 0's for every voice. `startNewLine` takes
   *    `multilineVars.staves[staffNum].clef` before the tune-level one
   *    (`abc_parse_music.js:961`), so the map is built inside the per-voice walk and each
   *    staff keeps its own. Rung: two staves, `clef=bass` mid-run on the first only —
   *    byte-identical in webkit, where the old shape drew treble on the bass staff.
   *    ⚠️ **AND IT IS TWO SURFACES.** The ink was corrected first and `tune.lines` still
   *    said treble-8, which NO GATE ASKED: every golden is unwrapped. `lines.ts` carries
   *    the same rule under the same name, and the control for each was MUTE for the other
   *    until both were asserted — the model rows stayed green through a broken `prefix`.
   *    ⚠️ **A SEPARATE, PRE-EXISTING DEFECT SITS BESIDE IT, MEASURED NOT FIXED.** On
   *    `[K:treble+8]CDEF|CDEF|[K:treble-8]CDEF|…` under wrap, abcjs draws the inline change
   *    at the HEAD of system 2 and we draw it at the END of system 1. It is there with and
   *    without this rule — the same break-placement family as `openingBarlineTrails`.
   *
   *  ⚠️ **AND A KNOWN LIMIT ON THE VOICE-NAME RULE, MEASURED.** The "one line past its last
   *    music" grace is the WRAP's — `findLineBreaks` only runs under it — and is gated on
   *    that now. ⚠️ It is still wrong for one shape: four SOURCE lines with the second
   *    voice on only one of them, WRAPPED, gives abcjs `RH X2 RH` and ours `RH X2 RH X2`.
   *    Removing the grace fixes that shape and takes this row 23 → 25, so it is load-bearing
   *    for the corpus and the shape is not in it. The grace is probably compensating for
   *    `lineOfMeasure` mapping a SHORT voice's measures to too few lines — check that
   *    before removing it.
   *
   *    3  GEOMETRY ONLY, same element kinds throughout:
   *       `text-udef-parts-overlays-tune8` and `-tune46`, `vskip-tune1`.
   *
   * ⚠️ **AND TWO OF THE 4 ARE abcjs CRASHING, NOT US.** `abcts-vskip` tunes 0 and 2 throw
   * inside abcjs's own `wrapLines` — `undefined is not an object (evaluating 'l[p]')` —
   * because `addLineBreaks` reads `lines[action.ogLine].staff[action.staff]` on a row a
   * `%%vskip` made non-music. We render them. A crash is not output and strict does not
   * reproduce one.
   */
  ['wrap + staffwidth', { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }, 4],
]
const every = Number(process.argv[2] ?? 1)
/** …and an optional LABEL substring, to re-measure one row without walking 26. */
const only = process.argv[3]
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(join(repo, cfg.abcjsRef, 'dist', 'abcjs-basic-min.js'), 'utf-8') })
await page.addScriptTag({ content: readFileSync(join(repo, 'dist', 'abcts-browser.global.js'), 'utf-8') })
let bad = 0
for (const [label, opts, declared, witness] of OPTIONS) {
  if (only !== undefined && !label.includes(only)) continue
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
    if (r.js !== r.ts) {
      off += 1
      if (first.length < 3) first.push(c.slug)
      // `ZZWHERE=1` — the first differing BYTE of each row, which is what turns a slug list
      // into a diagnosis. Every rule of the `add_classes` arc was found from this output.
      if (process.env.ZZWHERE) {
        let i = 0
        while (i < r.js.length && r.js[i] === r.ts[i]) i += 1
        console.log(`  WHERE ${c.slug} byte ${i} of ${r.js.length}` +
          `\n    js …${r.js.slice(Math.max(0, i - 60), i + 60)}` +
          `\n    ts …${r.ts.slice(Math.max(0, i - 60), i + 60)}`)
      }
    }
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
