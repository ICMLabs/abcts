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
   * ⚠️ **32, AND THE LINE-STRUCTURE HALF IS CLOSED.** Counting staff lines in each engine
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
   *    ⚠️ **AND THAT RESIDUAL IS NOT UNDERSTOOD — DO NOT GUESS AT IT.** Measured, abcjs's
   *    own `tune.lines[].staff[0].barNumber` after the wrap is **1, 3, 3, 3** while its
   *    counter plainly reaches 5 (`L5 bars=[5,-]`), and the rendered numbers are
   *    `1 2 3 3 5 3` against our `1 2 3 4 5 6`. A head of 3 followed by a first bar of 5 is
   *    TWO increments across one assignment, which `addLineBreaks` as written does not
   *    predict — so the reading is incomplete rather than the port. ⭐ **It needs abcjs
   *    INSTRUMENTED** (`/tmp/gp/abcjs`, the standing order's step 4) rather than another
   *    pass over the source; two passes over it produced no explanation.
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
   *       (a) **THE BREAK-BAR IS ON THE WRONG SIDE.** `tablature-20-score-1-2` (`[|]1`)
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
   *    4  GEOMETRY ONLY, same element kinds throughout: `synth-flattener-20`,
   *       `text-udef-parts-overlays-tune8` and `-tune46`, `vskip-tune1`.
   *
   * ⚠️ **AND TWO OF THE 32 ARE abcjs CRASHING, NOT US.** `abcts-vskip` tunes 0 and 2 throw
   * inside abcjs's own `wrapLines` — `undefined is not an object (evaluating 'l[p]')` —
   * because `addLineBreaks` reads `lines[action.ogLine].staff[action.staff]` on a row a
   * `%%vskip` made non-music. We render them. A crash is not output and strict does not
   * reproduce one.
   */
  ['wrap + staffwidth', { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }, 32],
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
