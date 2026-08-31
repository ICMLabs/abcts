/**
 * **MEASURING TEXT THE WAY abcjs DOES, WHEN THERE IS A DOM TO MEASURE IT WITH.**
 *
 * The 691 goldens were harvested by `dump-svg.js`, which runs abcjs under jsdom and
 * PATCHES `getBBox` with calibrated tables (`dump-svg.js:49-84`); `golden-widths.ts`
 * reproduces those tables and says so. That is the right target for a HEADLESS render and
 * the wrong one for a browser, because abcjs in a browser measures for real — and the two
 * browsers do not even agree with each other (`d4b7022`: WebKit and Blink differ on 230
 * of 691, single glyph advances identical, multi-character widths and bbox heights not).
 *
 * So there is no number to copy. The only thing that transfers is the MECHANISM:
 *
 *     var size = el.getBBox()            // write/svg.js:308-341
 *
 * on a `<text stroke="none" ...attrs>` carrying one `<tspan>` per line, inserted into the
 * live SVG, measured, removed — with abcjs's own cache for strings under 20 characters
 * and its own whitespace early-out. Reproduce that and parity holds in whatever browser
 * the host is running, which is the goal; reproduce the numbers and it holds in none.
 *
 * ⚠️ **NOT INSTALLED BY DEFAULT.** `setTextMeasurer` is called by the compat layer only
 * when a real `document` is present, so every Node gate keeps measuring with the golden
 * tables and the 691 stay meaningful. A measurer that quietly turned itself on under
 * jsdom would take the whole corpus red.
 */

/** The font a run of text is set in, as abcjs passes it to `getTextSize`. */
export interface TextFont {
  /** PIXELS, already through `fontPixels` — abcjs's attrs carry px, not points. */
  readonly size: number
  readonly family: string
  readonly weight?: string
  readonly style?: string
}

/** `getBBox()`'s two figures, in PIXELS. */
export interface TextSize {
  readonly width: number
  readonly height: number
}

export type TextMeasurer = (text: string, font: TextFont) => TextSize

let MEASURER: TextMeasurer | null = null

/**
 * Install (or clear, with `null`) the live measurer. Render-scoped in practice, the same
 * shape `STRICT_TEXT_METRICS` and `PAGE_PADDING` already have in `layout.ts`.
 */
export const setTextMeasurer = (m: TextMeasurer | null): void => {
  MEASURER = m
}

export const getTextMeasurer = (): TextMeasurer | null => MEASURER

/**
 * ⚠️ **THE DOM IS TYPED STRUCTURALLY HERE, NOT IMPORTED.** `tsconfig.json` sets
 * `"lib": ["ES2020"]` with no `dom`, and that is a deliberate property of this engine:
 * nothing in `src/` may depend on a browser existing. Adding `dom` to satisfy four
 * identifiers would make `document` and `window` legal in every file in the renderer,
 * which is exactly the mistake that made the iife die at load (`5b36bb4`). These four
 * interfaces are the entire surface this file touches; a real `document` and a real
 * `SVGSVGElement` satisfy them structurally.
 */
interface MeasuredBox {
  readonly width: number
  readonly height: number
}
interface ProbeElement {
  setAttribute(name: string, value: string): void
  appendChild(child: ProbeElement): void
  removeChild(child: ProbeElement): void
  textContent: string | null
  getBBox?(): MeasuredBox
}
export interface ProbeHost {
  appendChild(child: ProbeElement): void
  removeChild(child: ProbeElement): void
}
export interface ProbeDocument {
  createElementNS(ns: string, tag: string): ProbeElement
}

/**
 * abcjs's `Svg.prototype.getTextSize` over its `Svg.prototype.text`, against a real DOM.
 *
 * `host` is the SVG the probe is inserted into. It matters: a `<text>` measured outside
 * the document tree has no layout at all, and one measured under a different stylesheet
 * can measure differently — abcjs puts its probe in the SVG it is drawing into.
 */
export const createDomTextMeasurer = (doc: ProbeDocument, host: ProbeHost): TextMeasurer => {
  const NS = 'http://www.w3.org/2000/svg'
  /** abcjs caches text under 20 characters because `getBBox` is slow (`svg.js:314-318`). */
  const cache = new Map<string, TextSize>()

  return (text: string, font: TextFont): TextSize => {
    const str = `${text}`
    // `if (!text || text.match(/^\s+$/)) return {width: 0, height: 0}` — svg.js:311-312.
    if (str === '' || /^\s+$/.test(str)) return { width: 0, height: 0 }
    const key = str.length < 20 ? `${str} ${JSON.stringify(font)}` : null
    if (key !== null) {
      const hit = cache.get(key)
      if (hit !== undefined) return hit
    }

    const el = doc.createElementNS(NS, 'text')
    el.setAttribute('stroke', 'none')
    el.setAttribute('font-size', `${font.size}`)
    el.setAttribute('font-family', font.family)
    if (font.weight !== undefined) el.setAttribute('font-weight', font.weight)
    if (font.style !== undefined) el.setAttribute('font-style', font.style)
    // One tspan per line, `dy="1.2em"` from the second on — the `text` builder, svg.js.
    const lines = str.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const span = doc.createElementNS(NS, 'tspan')
      span.setAttribute('x', '0')
      if (i !== 0) span.setAttribute('dy', '1.2em')
      span.textContent = lines[i] as string
      el.appendChild(span)
    }
    host.appendChild(el)
    let size: TextSize
    try {
      // `catch (ex) { size = this.guessWidth(...) }` — svg.js:329-331. There is no guess
      // here: a host with no layout engine must not silently get plausible numbers, it
      // must fall back to the tables, which is what a zero tells the caller to do.
      const box = el.getBBox?.()
      size = box === undefined ? { width: 0, height: 0 } : { width: box.width, height: box.height }
    } catch {
      size = { width: 0, height: 0 }
    }
    host.removeChild(el)
    if (key !== null) cache.set(key, size)
    return size
  }
}
