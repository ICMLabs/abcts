/**
 * `abcts/compat` — abcjs's API, so an existing page keeps working.
 *
 *   import { renderAbc } from 'abcts/compat'
 *   renderAbc('paper', abcString, { staffwidth: 740 })
 *
 * ── WHAT THIS PROMISES, AND WHAT IT DOES NOT ──────────────────────────────────
 * The bar is VISUAL EQUIVALENCE plus the same DOM, not byte-identical SVG:
 *
 *   - the same call signature, so calling code compiles and runs unchanged
 *   - the same CSS classes (`abcjs-notehead`, `abcjs-stem`, `abcjs-ledger`,
 *     `abcjs-top-line`) and the same `data-name` hooks, so stylesheets and click
 *     handlers keep working
 *   - the same engraving density, so the page does not visibly shift — abcjs spaces a
 *     note by `sqrt(duration * 8)` units of 30px, and strict mode reproduces that
 *     exactly
 *
 * It does NOT promise identical bytes. The markup is core's own: fewer wrapper groups,
 * no deprecated `xlink:href`, `currentColor` rather than fill and stroke repeated on
 * every node. A pixel-diff test against abcjs output will differ; a human looking at the
 * page, a stylesheet, and a click handler will not.
 *
 * Parsing runs in `abcjs-strict`, which reproduces abcjs's behaviour including its bugs.
 * That is the point of a compat layer: a page that renders today must render the same
 * tomorrow, oddities included. Opt into corrections with `abcts` proper and mode
 * `abc2.1`.
 */
import { plainText, type RichText, type Score } from '../core/model.js'
import { parse } from '../parser/parser.js'
import { STAFF_SPACE_PX, UNIT_PX } from '../renderer/abcjs-constants.js'
import { layout } from '../renderer/layout.js'
import { toSVG } from '../renderer/svg.js'

/**
 * abcjs's SCREEN padding — `top/left/right/bottom = 15` (`write/renderer.js:69-72`), where
 * print mode takes 38/68. The page is the staff width plus this either side, which is why
 * a 670 staffwidth renders a 700px SVG.
 */
const SCREEN_PADDING = 15

/** And PRINT's — 1.8cm either side (`renderer.js:71-72`). */
const PRINT_PADDING = 68

/** The CSS scale a print render is drawn at (`engraver-controller.js:216`). */
const PRINT_SCALE = 0.75

/** What `"Sheet Music for \"" + metaText.title + '"'` produces — see the call site. */
const ariaTitle = (title: RichText): string =>
  typeof title === 'string' ? title : title.map(() => '[object Object]').join(',')

/** The subset of abcjs's params that changes the rendering abcts produces. */
export interface AbcjsParams {
  /** Staff width in pixels. abcjs's default is 740 on screen. */
  readonly staffwidth?: number
  /**
   * abcjs's PAGE media — a 0.75 CSS scale on the root, print's own page margins, an extra
   * `spacing.top` above the title and an eleven-inch minimum height. See
   * `LayoutOptions.print`.
   */
  readonly print?: boolean
  /** Uniform scale factor applied to the whole drawing. */
  readonly scale?: number
  /**
   * abcjs adds its `abcjs-*` classes only when asked. Compat emits them either way,
   * because they are the reason to use this entry point; the flag is accepted so that
   * existing calls do not have to change.
   */
  readonly add_classes?: boolean
}

/**
 * What `renderAbc` hands back, per tune.
 *
 * ponytail: abcjs's tune object also carries audio and timing methods (`setUpAudio`,
 * `millisecondsPerMeasure`, `getTotalTime`) and an `engraver` for its drag interaction.
 * None of them is faked — a stub returning plausible numbers would be worse than an absent
 * method, which at least fails loudly.
 *
 * **THE AUDIO HALF OF THAT IS NO LONGER A CAPABILITY GAP.** `setUpAudio`'s answer exists —
 * `src/audio/flatten.ts`, at 0 of 54 against abcjs's own event lists — and so does
 * `abcjs.synth.getMidiFile`'s, byte-exact in `src/audio/midi-file.ts`. What is missing is
 * the WIRING, and it is an API decision rather than an implementation one: neither is on
 * `src/index.ts`'s curated surface yet, and ARCHITECTURE.md governs what goes there. Hang
 * them here and they become part of the drop-in contract, which is what `compat` is for —
 * flag it before doing it.
 *
 * `millisecondsPerMeasure` and `getTotalTime` are still genuinely absent, and both belong
 * with `setTiming`, the audio↔geometry JOIN nothing measures yet.
 */
export interface TuneObject {
  /** The rendered markup, also injected into the target when there is a DOM. */
  readonly svg: string
  /** abcts's own parsed score, for callers that want the real thing. */
  readonly score: Score
  /** abcjs exposes the title list at `metaText.title`. */
  readonly metaText: { readonly title?: string }
}

type Target = string | { innerHTML: string } | null | undefined

function resolve(target: Target): { innerHTML: string } | null {
  if (target === null || target === undefined) return null
  if (typeof target !== 'string') return target
  // Only look for an element when there is a document — this must run under Node too.
  const doc = (globalThis as { document?: { getElementById(id: string): unknown } }).document
  const found = doc?.getElementById(target)
  return (found as { innerHTML: string } | undefined) ?? null
}

/**
 * abcjs's `renderAbc`. Renders every tune in the string and returns one object each.
 *
 * A DOM target is filled in; without one — Node, a test — the markup comes back on the
 * returned objects and nothing is injected.
 */
export function renderAbc(target: Target, abc: string, params: AbcjsParams = {}): TuneObject[] {
  const result = parse(abc, { mode: 'abcjs-strict' })
  const staffSpace = STAFF_SPACE_PX * (params.scale ?? 1)
  // abcjs's staffwidth is the MUSIC AREA in pixels; core's `systemWidth` is the PAGE in
  // staff spaces — `%%staffwidth` maps `staffWidth / 7.75 + 2 * marginX` and the engine
  // default is 700 for abcjs's 670. Dropping the padding here made every justified line
  // 30px narrow (`L 655` where abcjs writes `L 685`) and it was invisible to every
  // geometry gate, because they all render with NO staffwidth and take the default.
  // …AND PRINT'S MARGINS AND MUSIC WIDTH ARE EACH DIVIDED BY THE SCALE, which is one
  // division of the same sum (`engraver-controller.js:124-126`, `renderer.js:78-86`).
  const printing = params.print === true
  const padding = printing ? PRINT_PADDING : SCREEN_PADDING
  const scale = printing ? PRINT_SCALE : 1
  const systemWidth =
    params.staffwidth === undefined
      ? undefined
      : (params.staffwidth + padding * 2) / UNIT_PX / scale

  const tunes = result.scores.map((score) => ({
    svg: toSVG(layout(score, {
      mode: 'abcjs-strict',
      ...(systemWidth ? { systemWidth } : {}),
      ...(printing ? { print: true } : {}),
    }), {
      staffSpace,
      classes: 'abcjs',
      // abcjs emits its per-element class scheme only when the host asks for it.
      ...(params.add_classes === true ? { addClasses: true } : {}),
      /**
       * abcjs's `aria-label` carries the title; the padding is abcjs's own 15 either side.
       *
       * **AND A RICH TITLE GOES IN AS AN ARRAY.** `setPaperSize` builds the label by
       * CONCATENATION — `"Sheet Music for \"" + metaText.title + '"'`
       * (`draw/set-paper-size.js:12`) — and `metaText.title` is the phrase array whenever
       * the field carried a `$N`, so JS's own `Array.prototype.toString` writes
       * `[object Object],[object Object],…`. Measured from abcjs's own golden, not
       * reasoned: `visual-misc-06`'s label says exactly that.
       */
      ...(score.metadata.titles[0] === undefined
        ? {}
        : { title: ariaTitle(score.metadata.titles[0]) }),
      // NO `pageWidth` HERE. The page is `layout()`'s own ratchet — the staff width plus
      // abcjs's 15px either side (`write/renderer.js:69-72`), raised by any line too stiff
      // to compress to it and REPLACED outright by a `%%staffwidth`, which the host cannot
      // know. Forcing it to `staffwidth + 30` wrote `width="700"` where abcjs writes 296
      // for `%%staffwidth 200` and 752.491 for a tune that overflows.
    }),
    score,
    // abcjs's `metaText.title` is a plain string even when the field changed font
    // mid-line — the phrases are a LAYOUT structure, not part of the public shape.
    metaText:
      score.metadata.titles[0] === undefined ? {} : { title: plainText(score.metadata.titles[0]) },
  }))

  const element = resolve(target)
  if (element !== null) element.innerHTML = tunes.map((t) => t.svg).join('\n')
  return tunes
}
