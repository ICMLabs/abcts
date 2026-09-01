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
  /**
   * ⚠️ **THE X THE TEXT WILL BE DRAWN AT, BECAUSE A FRACTIONAL ONE MEASURES WIDER.**
   *
   * abcjs measures the element it JUST DREW — `getTextSize.calc(str, type, klass, el)`
   * takes the node as its fourth argument and `getTextSize` skips building a probe when
   * it has one (`write/svg.js:322-325`) — so the measurement happens at that element's
   * real x. A probe at x=0 is not the same measurement. MEASURED in WebKit, "left" in
   * bold Times 20px:
   *
   *     x = 0, 100, 166      27.765625
   *     x = 0.7, 166.7       27.781250     <- exactly 1/64 px wider
   *
   * One sub-pixel quantum, and it depends only on the FRACTIONAL PART. It reaches the
   * page because a tempo advances `preWidth + preWidth / length` — 1.25x — so 1/64 of
   * width became 0.02px of every element after the mark. Omit it and the measurement is
   * the x=0 one, which is right for anything actually drawn at an integer x.
   */
  readonly x?: number
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
    // The x matters to the WIDTH — see `TextFont.x`. Set on the element and on every
    // tspan, which is where abcjs's own builder puts it.
    if (font.x !== undefined) el.setAttribute('x', `${font.x}`)
    el.setAttribute('font-size', `${font.size}`)
    el.setAttribute('font-family', font.family)
    if (font.weight !== undefined) el.setAttribute('font-weight', font.weight)
    if (font.style !== undefined) el.setAttribute('font-style', font.style)
    // One tspan per line, `dy="1.2em"` from the second on — the `text` builder, svg.js.
    const lines = str.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const span = doc.createElementNS(NS, 'tspan')
      span.setAttribute('x', `${font.x ?? 0}`)
      if (i !== 0) span.setAttribute('dy', '1.2em')
      const line = lines[i] as string
      /**
       * ⚠️ **`\x03` SPLITS A CHORD INTO NESTED tspans, AND THEY ARE WHAT MAKES IT TALLER.**
       * `%%jazzchords` rewrites `Cmaj7` into base + superscript + subscript separated by
       * `\x03`, and the builder emits up to THREE children: `parts[0]` as the line's own
       * text, `parts[1]` raised `dy="-0.3em"`, `parts[2]` lowered by `0.4em` when there was
       * a superscript and `0.1em` when there was not — both at `font-size:0.7em`
       * (`write/svg.js`, the `text` builder). A flat string measures the ink of one line
       * and misses the raised and lowered boxes entirely, which is `visual-misc-03` by
       * 38.4px of page.
       */
      const parts = line.split('\x03')
      if (parts.length > 1) {
        span.textContent = parts[0] as string
        const sup = parts[1] ?? ''
        if (sup !== '') {
          const ts2 = doc.createElementNS(NS, 'tspan')
          ts2.setAttribute('dy', '-0.3em')
          ts2.setAttribute('style', 'font-size:0.7em')
          ts2.textContent = sup
          span.appendChild(ts2)
        }
        const sub = parts[2] ?? ''
        if (sub !== '') {
          const ts3 = doc.createElementNS(NS, 'tspan')
          ts3.setAttribute('dy', sup !== '' ? '0.4em' : '0.1em')
          ts3.setAttribute('style', 'font-size:0.7em')
          ts3.textContent = sub
          span.appendChild(ts3)
        }
      } else {
        span.textContent = line
      }
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
