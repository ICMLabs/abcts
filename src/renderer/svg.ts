/**
 * SVG emission — `Layout` → markup.
 *
 * Deliberately dumb: every positioning decision was made in `layout.ts`, so this pass
 * only scales staff spaces to pixels and writes tags. Nothing here should ever need to
 * know what a notehead is.
 *
 * Glyphs are emitted as `<path>`, never `<text>`, so the output is self-contained — it
 * renders correctly pasted into a page, saved to a file, or mailed, with no font
 * installed and no @font-face rule. See ARCHITECTURE.md on the glyph-source decision.
 */

import { type CompatibilityMode, defaultMode, isStrict } from '../core/model.js'
import { ABCJS_ARC, ABCJS_YCORR, spaces, STAFF_SPACE_PX, UNIT_PX } from './abcjs-constants.js'
import { SMUFL_TO_ABCJS } from './glyph-map.js'
import { glyphsFor } from './glyph-table.js'
import { GLYPHS, type GlyphName } from './glyphs.js'
import type {
  Layout,
  PartRole,
  PlacedCurve,
  PlacedGlyph,
  PlacedLine,
  PlacedText,
} from './layout.js'

export interface RenderOptions {
  /** Pixels per staff space. 8 gives a ~32px staff, close to typical engraving size. */
  readonly staffSpace?: number
  /** Emitted as a `class` on every element, for host styling. */
  readonly className?: string
  /**
   * Which naming to put in the DOM.
   *
   * `abcts` is core's own. `abcjs` reproduces abcjs's class names, `data-name` hooks and
   * group structure, so a page that styles `.abcjs-notehead` or attaches a handler to
   * `[data-name="note"]` keeps working when abcts replaces abcjs. That, not byte
   * identity, is what a drop-in actually needs.
   */
  readonly classes?: 'abcts' | 'abcjs'
  /**
   * abcjs's `add_classes` — the per-element `l`/`m`/`mm`/`v`/`n` class scheme and the
   * `staff-wrapper`/`staff` groups, which abcjs emits ONLY when a host asks for them
   * (`Classes.shouldAddClasses`). The per-PART names (`abcjs-notehead`, `abcjs-stem`) are
   * not gated on it here and never were: they are the hooks a stylesheet needs whatever
   * the host asked for, and they cost a word each. This scheme costs a line each.
   */
  readonly addClasses?: boolean
  /**
   * The tune's title, for the root's `aria-label`. abcjs writes
   * `Sheet Music for "…"` when `metaText.title` is set and a bare `Sheet Music` when it is
   * not (`write/renderer.js`), with the quotes HTML-escaped by the DOM serializer.
   */
  readonly title?: string
  /**
   * Force the drawing's width in pixels, rather than fitting the content.
   *
   * abcjs pads its SVG to the requested page width even when the music is narrower —
   * `simple-c` is 700px wide with the staff ending at 422. A page that swapped a
   * 700px-wide element for a 186px one would reflow, so compat sets this.
   */
  readonly pageWidth?: number
  /**
   * Deduplicate glyph outlines into `<defs>` and place them with `<use>`.
   *
   * Path data is 67–86% of an abcts SVG and the same handful of outlines repeat all
   * through it — `ave-verum-corpus` draws 145 glyphs from 20 distinct shapes. Emitting
   * each shape once cuts that file from 162KB to about 33KB.
   *
   * TRI-STATE, matching abcMusicKit v1's `optimizeSVG`:
   *   `undefined` → the mode decides. Strict says NO, because `<defs>`/`<use>` is
   *                 different markup from abcjs's and strict's job is byte parity.
   *                 `abc2.1`/`extended` say yes.
   *   `true`/`false` → override, whatever the mode.
   *
   * The DOM contract is preserved either way: every class and `data-name` that was on
   * the `<path>` moves to the `<use>`, so a stylesheet or a click handler cannot tell
   * the difference. That is the whole point — smaller bytes, identical hooks.
   */
  readonly optimizeSVG?: boolean
  /** Which dialect is being rendered; decides `optimizeSVG` when it is not set. */
  readonly mode?: CompatibilityMode
}

/**
 * Core's part roles → abcjs's class names.
 *
 * abcjs classes PARTS, not elements: a note group holds an `abcjs-notehead`, an
 * `abcjs-stem` and maybe an `abcjs-ledger`, and consumers style and hit-test each. A
 * role core does not map here simply gets no class, which is also what abcjs does for
 * most of its parts — only some are named.
 */
const ABCJS_CLASSES: Readonly<Record<string, string>> = {
  notehead: 'abcjs-notehead',
  grace: 'abcjs-notehead',
  stem: 'abcjs-stem',
  ledger: 'abcjs-ledger',
  // A DYNAMIC MARK IS CLASSED AND NAMED, and ours carried neither. abcjs's
  // `createDecoration` routes `!p!`/`!mf!` through `decoration.js` with
  // `classes.generate('decoration dynamics')`, which its own golden shows as
  // `class="abcjs-decoration abcjs-dynamics …" data-name="dynamics"`. Finding 92: it is
  // not a notehead and it had no handle, so no comparison could reach one.
  dynamic: 'abcjs-decoration abcjs-dynamics',
}

/**
 * The music's own texts that carry a generated class and name themselves after it
 * (`draw/relative.js:41-52`). The key is BOTH the class stem and the `data-name`, which is
 * why one set covers both.
 */
const MUSIC_TEXT_NAMES: ReadonlySet<string> = new Set(['lyric', 'chord', 'annotation'])

/** abcjs's `data-name` hooks, which its interaction code keys on. */
const ABCJS_DATA_NAMES: Readonly<Record<string, string>> = {
  stem: 'stem',
  ledger: 'ledger',
  // abcjs gives a barline NO class and a `data-name` — `printStem(…, null, "bar")`
  // (`abstract-engraver.js:992`). It is the only handle either engine offers on one, so
  // without it nothing downstream can ask a question about barlines at all.
  bar: 'bar',
  dynamic: 'dynamics',
}

/**
 * Element kinds → abcjs's `data-name` for the group.
 *
 * abcjs calls the staff prefix items "staff-extra clef" and "staff-extra time-signature",
 * which is what its layout dump and its DOM both use.
 *
 * CORRECTED: abcjs also puts a `data-name` on each GLYPH, and those ARE reproduced now —
 * `SMUFL_TO_ABCJS` was already there for `getYCorr`, so the "second table" this note said
 * it would cost did not exist. The one still missing is the NOTEHEAD's, which abcjs names
 * with the written note rather than the glyph; see `glyphMarkup`.
 */
const ABCJS_ELEMENT_NAMES: Readonly<Record<string, string>> = {
  clef: 'staff-extra clef',
  keySignature: 'staff-extra key-signature',
  timeSignature: 'staff-extra time-signature',
  voiceName: 'voice-name',
}

/** SVG needs `&` and `<` escaped; attribute values here also carry `"`. */
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * Character data. Escaped, not sanitised: ABC text is untrusted input — a `T:` or `Q:`
 * field carries whatever the file said — and it is being spliced into markup that a host
 * will put in a page. `&` first, or it would double-escape the entities added after it.
 */
const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * `%%jazzchords`' markup for one chord — `svg.js:198-211`, verbatim.
 *
 * The root is the outer tspan's own text; the modifier and the bass note are nested
 * `font-size:0.7em` tspans, raised and dropped. The bass's drop depends on whether a
 * modifier preceded it: `0.4em` clear of a raised one, `0.1em` from the baseline.
 */
const jazzChordMarkup = (jazz: readonly [string, string, string], x: string): string => {
  const [root, modifier, bass] = jazz
  const small = (dy: string, text: string): string =>
    `<tspan dy="${dy}" style="font-size:0.7em">${escapeText(text)}</tspan>`
  return (
    `<tspan x="${x}">${escapeText(root)}` +
    `${modifier === '' ? '' : small('-0.3em', modifier)}` +
    `${bass === '' ? '' : small(modifier === '' ? '0.1em' : '0.4em', bass)}` +
    '</tspan>'
  )
}

/**
 * THE EMISSION QUANTUM, in staff spaces — a hundred-thousandth, or 7.75e-5 of a pixel.
 *
 * Was a THOUSANDTH, which is 0.00775px and looks finer than the 0.01px abcjs itself
 * rounds its lines to. It is not, because of WHERE each engine spends it: abcjs writes one
 * absolute pixel coordinate per element, and we write a nested chain — a system translate,
 * a staff translate, the element's own offset, and a viewBox the host divides by — each
 * quantised, with the errors adding. Measured against abcjs's own output, a thousandth of
 * a space put a notehead up to 5.1e-3px out; a hundred-thousandth reaches 1.5e-4, which is
 * the floor (1e-6 gains nothing). At that point the residual is no longer ours.
 *
 * Five decimals rather than full precision because full precision writes seventeen digits
 * for numbers like 4.838709677419355 and buys nothing measurable.
 */
const PRECISION = 100000

/**
 * `roundNumber` — abcjs rounds every coordinate it writes into path data to TWO DECIMALS
 * (`write/svg.js`), which is why its staff line ends at `193.9` where the arithmetic gives
 * 193.90447. The root's width and height are the exception and go out raw.
 */
/**
 * **A `%%sep` RULE IS ITS OWN EMITTER** — `drawSeparator` builds the path by hand
 * (`draw/separator.js`) and shares nothing with `printLine`:
 *
 *   - `y = Math.round(renderer.y)` — the cursor rounded to a WHOLE PIXEL,
 *   - the rect is `y` to `y + 1`, one pixel, not a thickness either side,
 *   - FIVE points, closing back to the start before the `z`,
 *   - `fill="rgba(0,0,0,255)"` and `stroke="rgba(0,0,0,0)"`, not `none`/`currentColor`,
 *   - and a `defined-text` class rather than a line's.
 */
const separatorPath = (x1: number, y: number, x2: number, klass: string): string => {
  const top = Math.round(y)
  return (
    `<path d="M ${x1} ${top} L ${x2} ${top} L ${x2} ${top + 1} L ${x1} ${top + 1} ` +
    `L ${x1} ${top} z" stroke="rgba(0,0,0,0)" fill="rgba(0,0,0,255)" class="${klass}"></path>`
  )
}

const round2 = (n: number): string => {
  const r = Math.round(n * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

const num = (n: number): string => {
  const r = Math.round(n * PRECISION) / PRECISION
  return Object.is(r, -0) ? '0' : String(r)
}

/**
 * A SCALE is not a coordinate, and rounding it like one is a RELATIVE error.
 *
 * `num` quantises to a thousandth of a STAFF SPACE — 0.00775px, finer than the hundredth
 * of a pixel abcjs writes, which is right for a position. A scale has no unit: the error
 * it carries is multiplied by every number in the path it transforms. abcjs's outlines are
 * in ITS pixels, so each one is drawn at `1 / 7.75` = 0.12903225806451613, and `num` made
 * that `0.129` — a quarter of a per-mille, but applied to a 37px-tall clef it is 0.0012px
 * and to a notehead's 6.09px offset another 0.0015.
 *
 * Emitted at full precision instead. Nothing downstream reads it as text, and an SVG
 * `scale()` takes as many digits as it is given.
 */
const scaleNum = (n: number): string => (Object.is(n, -0) ? '0' : String(n))

/**
 * A line is emitted as a filled rect rather than a stroked line: SVG strokes straddle
 * the path, so a staff line of thickness t centred on y covers y ± t/2 — which is what
 * engraving means, but stroke rendering also picks up linecap and antialiasing
 * differences between renderers. A rect is unambiguous.
 */
function lineToRect(line: PlacedLine, attr: string, asPath = false): string {
  // A SLOPED line — only a beam is — is neither a horizontal nor a vertical rect. Drawn
  // as a parallelogram with vertical ends, which is how beams are cut in engraving, and
  // which a rect would silently render as a vertical bar.
  if (line.y1 !== line.y2 && line.x1 !== line.x2) {
    const half = line.thickness / 2
    const points = [
      `${num(line.x1)},${num(line.y1 - half)}`,
      `${num(line.x2)},${num(line.y2 - half)}`,
      `${num(line.x2)},${num(line.y2 + half)}`,
      `${num(line.x1)},${num(line.y1 + half)}`,
    ].join(' ')
    return `<polygon${attr} points="${points}"/>`
  }

  const horizontal = line.y1 === line.y2
  const x = horizontal ? Math.min(line.x1, line.x2) : line.x1 - line.thickness / 2
  const y = horizontal ? line.y1 - line.thickness / 2 : Math.min(line.y1, line.y2)
  const w = horizontal ? Math.abs(line.x2 - line.x1) : line.thickness
  const h = horizontal ? line.thickness : Math.abs(line.y2 - line.y1)
  /**
   * **A LINE IS A CLOSED PATH IN ABCJS, NOT A `<rect>`** — `printStem` and `printStaff`
   * both build `M x y L x2 y L x2 y2 L x y2 z` and fill it (`write/draw/*`), so a staff
   * line, a stem, a ledger and a beam are all four-point polygons.
   *
   * The attribute ORDER is abcjs's too — `d`, `stroke`, `fill`, then the class — and the
   * tag is written open-and-close rather than self-closing, which is what a browser's
   * serializer does to an element it built. Both are bytes.
   */
  if (asPath) {
    /**
     * **A STEM AND A BARLINE COME OUT OF A DIFFERENT EMITTER FROM A STAFF LINE, AND IT
     * WRITES A DIFFERENT PATH.** `printStem` joins each command's parts with a space and
     * CONCATENATES the commands with NOTHING between them — `M 80.66 49.86L 80.66 75.69…`
     * — where `printLine` builds one `sprintf` with spaces throughout
     * (`draw/print-stem.js:33-36`, `draw/print-line.js:29`). They also start at different
     * CORNERS and order their attributes differently.
     *
     * The corner is `x` then `x + dx`, with `dx` NEGATIVE for an up stem and the two y's
     * swapped when it is (`print-stem.js:5-14`) — so an up stem runs
     * right-top → right-bottom → left-bottom → left-top and a down stem or a barline runs
     * left-bottom → left-top → right-top → right-bottom. Measured on a control carrying
     * both directions and a bar.
     *
     * AND A STEM CARRIES NO `stroke`/`fill`: `printStem` adds them only when it is NOT
     * inside an element group, and a stem always is.
     */
    if (line.role === 'stem' || line.role === 'bar') {
      const up = line.role === 'stem' && line.y2 < line.y1
      const [xa, xb] = up ? [x + w, x] : [x, x + w]
      const [ya, yb] = up ? [y, y + h] : [y + h, y]
      return (
        `<path d="M ${round2(xa)} ${round2(ya)}L ${round2(xa)} ${round2(yb)}` +
        `L ${round2(xb)} ${round2(yb)}L ${round2(xb)} ${round2(ya)}z"${attr}></path>`
      )
    }
    // `printLine`'s options are `{path, stroke, fill, data-name, class}` in that order —
    // the NAME before the CLASS, which is the opposite of everywhere else here.
    const klass = / class="[^"]*"/.exec(attr)?.[0] ?? ''
    return (
      `<path d="M ${round2(x)} ${round2(y)} L ${round2(x + w)} ${round2(y)} ` +
      `L ${round2(x + w)} ${round2(y + h)} L ${round2(x)} ${round2(y + h)} z" ` +
      `stroke="none" fill="currentColor"${attr.replace(klass, '')}${klass}></path>`
    )
  }
  return `<rect${attr} x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"/>`
}

/**
 * A slur or tie as a filled lens: out along the top edge, back along the bottom.
 *
 * Drawn as a closed shape rather than a stroked spline because a slur is not a constant
 * width — it tapers to a hairline at both ends and swells in the middle, which is what
 * SMuFL's separate endpoint and midpoint thicknesses describe. Two cubics with control
 * points at the thirds give the shallow, even arc *Behind Bars* asks for.
 */
function curveToPath(curve: PlacedCurve, attr: string, strict: boolean, k = 1): string {
  const { x1, y1, x2, y2, bulge } = curve
  // ── ABCJS'S ARC, WHICH IS NOT A LENS ON THE THIRDS ─────────────────────────
  //
  // `drawArc` (`draw/tie.js:57-102`) builds the whole shape from the UNIT VECTOR between
  // the endpoints, so every term is measured along the chord rather than along x:
  //
  //     flatten = norm / 3.5                       control points, along the chord
  //     curve   = ±min(isTie ? 10 : 25, max(4, flatten))    bulge, PERPENDICULAR
  //     c1 = (x1 + flatten*ux − curve*uy, y1 + flatten*uy + curve*ux)
  //     c2 = (x2 − flatten*ux − curve*uy, y2 − flatten*uy + curve*ux)
  //     back edge = the same two controls displaced by `thickness = 2` perpendicular
  //
  // THREE THINGS DIFFER FROM OURS AND ALL THREE ARE VISIBLE. Controls sit at `1 / 3.5` of
  // the span, not a third. The bulge is CLAMPED — a tie at 10px, a slur at 25, with a floor
  // of 4 — where ours is a ratio between its own two limits. And the second edge is offset
  // PERPENDICULARLY by a flat 2px, where ours drops a vertical `midThickness`.
  //
  // That flat 2 is why the audit's `slurEndpoint` / `slurMidpoint` / `tieEndpoint` /
  // `tieMidpoint` had no abcjs counterpart to port: abcjs has no endpoint-versus-midpoint
  // notion at all. Its arc comes to a POINT at both ends, because the path returns through
  // the same x1,y1 it started from, and is a flat 2px wide everywhere between. The four
  // Bravura constants are not wrong numbers — they are the wrong MODEL, and strict now
  // reads none of them.
  if (strict) {
    const dx = x2 - x1
    const dy = y2 - y1
    const norm = Math.hypot(dx, dy)
    if (norm === 0) return ''
    const ux = dx / norm
    const uy = dy / norm
    const flatten = norm / ABCJS_ARC.flattenDivisor
    const cap = curve.kind === 'tie' ? ABCJS_ARC.tieMaxBulge : ABCJS_ARC.slurMaxBulge
    // `bulge` carries our sign convention: negative is ABOVE, which is abcjs's `-1`.
    const arc =
      Math.sign(bulge) * Math.min(spaces(cap) * k, Math.max(spaces(ABCJS_ARC.minBulge) * k, flatten))
    const t = spaces(ABCJS_ARC.thickness) * k
    const c1x = x1 + flatten * ux - arc * uy
    const c1y = y1 + flatten * uy + arc * ux
    const c2x = x2 - flatten * ux - arc * uy
    const c2y = y2 - flatten * uy + arc * ux
    return (
      `<path${attr} d="M${num(x1)},${num(y1)} ` +
      `C${num(c1x)},${num(c1y)} ${num(c2x)},${num(c2y)} ${num(x2)},${num(y2)} ` +
      `C${num(c2x - t * uy)},${num(c2y + t * ux)} ${num(c1x - t * uy)},${num(c1y + t * ux)} ` +
      `${num(x1)},${num(y1)}Z"/>`
    )
  }
  const dx = x2 - x1
  // Control points at the thirds, pushed out by the bulge. The outer edge carries the
  // full arc; the inner edge falls short by the midpoint thickness, which opens the lens.
  const inner = bulge - Math.sign(bulge) * curve.midThickness
  const cx1 = x1 + dx / 3
  const cx2 = x1 + (dx * 2) / 3
  const lift = (t: number) => (v: number) => v + t

  const outer = `C${num(cx1)},${num(lift(bulge)(y1))} ${num(cx2)},${num(lift(bulge)(y2))} ${num(x2)},${num(y2)}`
  const back = `C${num(cx2)},${num(lift(inner)(y2))} ${num(cx1)},${num(lift(inner)(y1))} ${num(x1)},${num(y1)}`
  return `<path${attr} d="M${num(x1)},${num(y1)} ${outer} ${back}Z"/>`
}


/**
 * abcjs's `Classes.generate` — the `add_classes` class string, ported from
 * `write/helpers/classes.js`.
 *
 * It is a STATEFUL COUNTER walked in draw order, not a property of any element, which is
 * why it lives in the writer: `l` is the line, `m` the measure within it, `mm` the measure
 * within the TUNE, `v` the voice, and `n` the note within the measure — and `n` is added
 * only for a class naming a note, a rest or a lyric.
 *
 * `mm` is the one that cannot be guessed from a single tune: it is
 * `sum(measureTotalPerLine[0 … line-1]) + measureNumber`, and `measureTotalPerLine` is
 * written by `newMeasure()` at the END of a line rather than counted as it goes.
 */
class Classes {
  constructor(private readonly on: boolean) {}
  private line: number | null = null
  private voice: number | null = null
  private measure: number | null = null
  private note: number | null = null
  private readonly perLine: number[] = []

  incrLine(): void {
    this.line = this.line === null ? 0 : this.line + 1
    this.voice = null
    this.measure = null
    this.note = null
  }
  incrVoice(): void {
    this.voice = this.voice === null ? 0 : this.voice + 1
    this.measure = null
    this.note = null
  }
  newMeasure(): void {
    // `if (this.measureNumber)` — a FALSY test, so a line whose measure counter is still 0
    // records nothing. That is abcjs's own line and it is why `mm` can lag.
    if (this.measure && this.line !== null) this.perLine[this.line] = this.measure
    this.measure = null
    this.note = null
  }
  startMeasure(): void {
    this.measure = 0
    this.note = 0
  }
  incrMeasure(): void {
    this.measure = (this.measure ?? 0) + 1
    this.note = 0
  }
  isInMeasure(): boolean {
    return this.measure !== null
  }
  incrNote(): void {
    this.note = (this.note ?? 0) + 1
  }
  private measureTotal(): number {
    let total = 0
    for (let i = 0; i < (this.line ?? 0); i += 1) total += this.perLine[i] ?? 0
    if (this.measure) total += this.measure
    return total
  }
  /**
   * `generate` as of a GIVEN measure, without moving the running one.
   *
   * abcjs's `otherchildren` is ONE interleaved list — endings, triplets, ties and `"bar"`
   * markers together — so its measure counter only ever goes forward as it walks. Ours
   * are separate buckets per staff, walked in an order of our own, so the counter has to
   * be addressed rather than advanced. Measured on a ladder: an ending's number is the
   * count of `"bar"` markers pushed before it, which is its measure index within the LINE
   * minus one, since the ending is added ahead of its own barline.
   */
  /** abcjs's `getCurrent()` — the counters an element's group was named with. */
  current(): { measure: number; note: number } {
    return { measure: this.measure ?? 0, note: this.note ?? 0 }
  }
  generateAt(c: string, measure: number): string {
    const saved = this.measure
    this.measure = measure
    const out = this.generate(c)
    this.measure = saved
    return out
  }
  generate(c: string): string {
    if (!this.on) return ''
    const ret: string[] = []
    if (c.length > 0) ret.push(c)
    if (this.line !== null) ret.push(`l${this.line}`)
    if (this.measure !== null) ret.push(`m${this.measure}`)
    // "measureNumber is null between measures so this is still the test for measureTotal"
    if (this.measure !== null) ret.push(`mm${this.measureTotal()}`)
    if (this.voice !== null) ret.push(`v${this.voice}`)
    if (
      (c.includes('note') || c.includes('rest') || c.includes('lyric')) &&
      this.note !== null
    ) {
      ret.push(`n${this.note}`)
    }
    return ret
      .join(' ')
      .split(' ')
      .filter((x) => x.length > 0)
      .map((x) => (x.startsWith('abcjs-') ? x : `abcjs-${x}`))
      .join(' ')
  }
}

export function toSVG(doc: Layout, options: RenderOptions = {}): string {
  const scale = options.staffSpace ?? 8
  const prefix = options.className ?? 'abcts'
  const abcjs = options.classes === 'abcjs'
  // Tri-state resolved once: explicit wins, otherwise the mode decides and strict says no.
  const strict = isStrict(options.mode ?? defaultMode)
  const optimize = options.optimizeSVG ?? !strict
  // The OUTLINES from the same table layout took its metrics from. Drawing Bravura at
  // abcjs's advances would be the worst of both — correctly sized gaps around wrongly
  // sized shapes — which is the whole reason there are two tables rather than one set of
  // numbers. abcjs's paths are in ITS pixels, 7.75 to a staff space, so they carry a
  // scale; Bravura's are already in staff spaces and carry none.
  const table = glyphsFor(strict)
  const outline = (name: GlyphName): { path: string; scale: number } => {
    const g = table.get(name)
    // PATH UNITS → LAYOUT UNITS. A path unit is `STAFF_SPACE_PX / unitsPerSpace` abcjs
    // pixels — 1 for abcjs's outlines, 7.75 for Bravura's — and a layout unit is
    // `UNIT_PX` of them. Written as one expression so the flip carries it; identical to
    // the `1 / unitsPerSpace` it replaced while `UNIT_PX` is the staff space.
    if (g === undefined) return { path: GLYPHS[name].path, scale: STAFF_SPACE_PX / UNIT_PX }
    return { path: g.path, scale: STAFF_SPACE_PX / (g.unitsPerSpace * UNIT_PX) }
  }

  /**
   * Each distinct glyph outline, in first-use order, so `<defs>` can emit it once.
   *
   * Keyed by glyph NAME rather than by path text: two names never share an outline, and
   * hashing kilobytes of path data per glyph to discover that would cost more than it
   * saves.
   */
  
/**
 * abcjs's own `<style>` text, byte for byte. It suppresses the OS text-selection callout
 * while a drag is in progress and does nothing else; reproducing it is part of byte parity
 * and nothing else reads it.
 */
/**
 * abcjs writes the ROOT's width and height as raw JS numbers — `height="1081.3299999999997"`
 * — where every coordinate inside the drawing goes through its own rounding. Ours rounded
 * both, so the two agreed to two decimals and differed as bytes.
 */
const raw = (n: number): string => String(n)


/**
 * abcjs's `<text>`, attribute for attribute — `stroke`, `font-size`, `font-style`,
 * `font-family`, `font-weight`, `text-decoration`, `class`, `text-anchor`, `x`, `y`,
 * `data-name`, and the content wrapped in a `<tspan x=…>` (`write/svg.js`).
 *
 * The `class=""` and the `text-decoration="none"` are written even when empty; that is the
 * DOM attribute abcjs sets, and a serializer writes what is set.
 */
/**
 * **A `<text>`'s x AND y ARE ROUNDED TO TWO DECIMALS** — `hash.attr.x = roundNumber(…)`,
 * `hash.attr.y = roundNumber(…)` (`draw/text.js:63-64`), the same rule its paths take. The
 * callers pass `round2`'d strings; the `<tspan>` reuses the x, as abcjs does
 * (`svg.js:195`).
 */
const abcjsText = (
  x: string,
  y: string,
  size: string,
  family: string,
  italic: boolean,
  bold: boolean,
  anchor: string,
  name: string,
  body: string,
  /** abcjs's own class for the row, empty unless `add_classes` asked for it. */
  klass = '',
  /** Extra lines of the SAME element — one `<tspan dy="1.2em">` each. */
  extra: readonly string[] = [],
  /** `dominant-baseline="middle"`, which the bottom block's multi-line rows carry. */
  middle = false,
): string =>
  `<text stroke="none" font-size="${size}" font-style="${italic ? 'italic' : 'normal'}" ` +
  `font-family="${family}" font-weight="${bold ? 'bold' : 'normal'}" text-decoration="none" ` +
  `class="${klass}" text-anchor="${anchor}"${middle ? ' dominant-baseline="middle"' : ''}` +
  ` x="${x}" y="${y}"${name ? ` data-name="${name}"` : ''}>` +
  `<tspan x="${x}">${body}</tspan>` +
  extra.map((line) => `<tspan x="${x}" dy="1.2em">${line}</tspan>`).join('') +
  '</text>'

/**
 * A top-text row's `data-name` → the class abcjs puts beside it, under `add_classes`.
 * Literal in `top-text.js` rather than run through `classes.generate`, so no line or
 * measure suffix joins it.
 */
const ABCJS_TEXT_CLASSES: Readonly<Record<string, string>> = {
  title: 'abcjs-title',
  subtitle: 'abcjs-text abcjs-subtitle',
  composer: 'abcjs-composer',
  author: 'abcjs-author',
  rhythm: 'abcjs-rhythm',
  'part-order': 'abcjs-part-order',
  header: 'abcjs-header abcjs-meta-top',
}

const ABCJS_STYLE =
  '.abcjs-dragging-in-progress text, .abcjs-dragging-in-progress tspan {-webkit-touch-callout: none; ' +
  '-webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; ' +
  'user-select: none;}'

const attrIfAny = (cls: string): string => (cls ? ` class="${cls}"` : '')

const glyphDefs = new Map<GlyphName, string>()
  const defId = (name: GlyphName): string => {
    let id = glyphDefs.get(name)
    if (id === undefined) {
      id = `g${glyphDefs.size}`
      glyphDefs.set(name, id)
    }
    return id
  }

  /**
   * One glyph, either as its own `<path>` or as a `<use>` of a shared definition.
   *
   * Both carry the same attributes, so the DOM a host sees is the same shape either way.
   * `<use>` takes x/y rather than a transform because a transform on `<use>` composes
   * with the referenced element's own coordinates, and these outlines are authored at
   * the origin — x/y says what is meant with less to get wrong. A scaled glyph keeps the
   * transform form, since `<use>` has no scale attribute.
   */
  const glyphMarkup = (
    name: GlyphName,
    x: number,
    y: number,
    scale: number | undefined,
    attributes: string,
    role?: string,
    dataName?: string,
  ): string => {
    const ink = outline(name)
    /**
     * `getYCorr`, and it belongs HERE because abcjs applies it here and only here.
     *
     *     ycorr = glyphs.getYCorr(symbol);
     *     glyphs.printSymbol(x, renderer.calcY(offset + ycorr), symbol, …)
     *
     * (`draw/print-symbol.js:22`, `:33`.) A per-glyph alignment fix-up for abcjs's own
     * font, spent at DRAW time and never in a reserve — which is why the layout must not
     * carry it and why no extent gate could ever have seen it missing. Measured on one
     * control per glyph: ten of them, exact to the hundredth of a pixel, and the two
     * fermatas disagreeing by one pitch in OPPOSITE directions is what named it.
     *
     * Strict only, because the correction is a property of abcjs's outlines: Bravura's are
     * authored against one baseline and need none. The dynamics are the exception on both
     * counts — SMuFL precomposes `mf` where abcjs sets an `m` and an `f` side by side, so
     * there is no abcjs name to look up, and every letter abcjs spells the set out of
     * carries the same -4. A pitch is half a staff space, and y runs DOWN.
     */
    const corrected =
      y -
      0.5 *
        (strict
          ? name.startsWith('dynamic')
            ? (ABCJS_YCORR.f ?? 0)
            : (ABCJS_YCORR[SMUFL_TO_ABCJS[name] ?? ''] ?? 0)
          : 0)
    // ABCJS NEVER APPLIES A GLYPH'S SCALE AT DRAW TIME, and says so in its own source:
    // `printSymbol` takes `{scalex, scaley}` and passes NEITHER to `glyphs.printSymbol`,
    // under the comment "TODO-PER: what happened to scalex, and scaley? That might have
    // been a bug introduced in refactoring" (`draw/print-symbol.js:11`). So a grace
    // notehead, a grace flag and a clef's octave `8` all DRAW at full size while their
    // POSITIONS are computed from the scaled width — which is why the golden's grace path
    // is byte-identical to its main head's, 10px to the left.
    //
    // Reproducing the bug is the point: it is 1.99px on every graced note, which is
    // 0.4 of a notehead's ink centre, and it is `vree-grace-notes`' whole residual.
    // IN PIXEL MODE THE OUTLINE'S OWN SCALE CANCELS: abcjs's glyph paths are authored in
    // ITS pixels, and `ink.scale` is `1 / unitsPerSpace` — the conversion into staff
    // spaces. Multiply by the staff space again and it is 1, which is why abcjs writes no
    // `scale()` on a glyph at all.
    const total = (strict ? ink.scale : (scale ?? 1) * ink.scale) * PX
    const scaled = total !== 1
    const transform = `translate(${num(x * PX)},${num(corrected * PX + oy)})${scaled ? ` scale(${scaleNum(total)})` : ''}`
    /**
     * **ABCJS WRITES NO `transform` ON A GLYPH EITHER — IT ADDS x AND y TO THE FIRST
     * `M`.** `Glyphs.printSymbol` clones the outline's command array, does
     * `pathArray[0][1] += x; pathArray[0][2] += y`, joins each command's parts with a
     * space and CONCATENATES the commands with nothing between them
     * (`creation/glyphs.js:132-142`) — which is why its `d` reads `M 20.67 88.4245c 0.24`
     * and why every coordinate after the first is untouched: they are all relative.
     *
     * The arithmetic is raw JS and so is the formatting: abcjs's own golden carries
     * `M 29.689999999999998 22.832000000000008` for a `clefs.G` at (20, 60.242). `num()`
     * would round it, so this does not use `num()`.
     *
     * AND THE NAME IS THE GLYPH'S OWN — `data-name="clefs.G"`, abcjs's key rather than
     * ours. `RelativeElement` defaults `this.name = this.c`, the symbol itself
     * (`relative-element.js:43-48`), and `printSymbol` passes it straight through.
     *
     * EXCEPT A NOTEHEAD, whose name abcjs overrides with the WRITTEN NOTE
     * (`create-note-head.js:34` — `name: pitchelem.name`). That arrives on the glyph as
     * `dataName`; see `writtenNote` in `layout.ts`.
     */
    if (abcjs && !scaled) {
      const head = /^M (-?[\d.]+) (-?[\d.]+)/.exec(ink.path)
      if (head?.[1] !== undefined && head[2] !== undefined) {
        const px = Number(head[1]) + x * PX
        const py = Number(head[2]) + corrected * PX + oy
        const named = dataName ?? SMUFL_TO_ABCJS[name] ?? name
        /**
         * **A NOTEHEAD'S CLASS IS WRITTEN AFTER ITS `d`**, because it is not written with
         * the element at all. Inside an element group `printSymbol` passes ONLY
         * `data-name` and no `klass` (`draw/print-symbol.js:34-38`) — which is why a clef
         * glyph carries no class — and `drawAbsolute` comes back afterwards with
         * `el.setAttribute('class', 'abcjs-notehead')` for any symbol whose glyph name
         * contains `notehead`, appending `abcjs-chord-pos-N` to it the same way
         * (`draw/absolute.js:20-28`). A late `setAttribute` serialises LAST.
         */
        // BOTH classes `drawAbsolute` sets afterwards travel late — the notehead's and the
        // chord position's. A `flags.*` glyph carries neither, which is abcjs's own name
        // test rather than an omission here.
        const late =
          role === 'notehead' || role === 'grace' || attributes.includes('abcjs-chord-pos-')
            ? / class="[^"]*"/.exec(attributes)?.[0] ?? ''
            : ''
        return (
          `<path${late ? attributes.replace(late, '') : attributes}${named ? ` data-name="${named}"` : ''} ` +
          `d="M ${px} ${py}${ink.path.slice(head[0].length)}"${late}></path>`
        )
      }
    }
    if (!optimize) return `<path${attributes} transform="${transform}" d="${ink.path}"/>`
    // A `<use>` takes a transform, so a scaled glyph dedupes like any other. It used to
    // fall back to an inline path when scaled, which was fine while only a stretched
    // brace was scaled — and stopped being fine the moment abcjs's outlines arrived,
    // since those are in ITS pixels and every one of them carries a scale.
    return scaled
      ? `<use${attributes} href="#${defId(name)}" transform="${transform}"/>`
      : `<use${attributes} href="#${defId(name)}" x="${num(x * PX)}" y="${num(corrected * PX + oy)}"/>`
  }

  /**
   * Attributes for one drawn part. Core names by ELEMENT (`abcts-note` on everything a
   * note draws); abcjs names by PART and adds `data-name` hooks. Both are emitted from
   * the same role, so neither naming is the privileged one.
   */
  const attrs = (elementType: string, role: string | undefined, chordPos?: number): string => {
    if (!abcjs) return ` class="${prefix}-${elementType}"`
    const base = role === undefined ? undefined : ABCJS_CLASSES[role]
    // abcjs APPENDS the chord position to whatever class the element already has, and sets
    // it ALONE when there is none: `klass = klass ? klass + ' abcjs-chord-pos-N' : 'abcjs-
    // chord-pos-N'` (`draw/absolute.js:23-28`). A chord's DOTS and ACCIDENTALS have no
    // class of their own and are still classed by it; a `flags.*` child is excluded by
    // name. Ours dropped it whenever there was no base class, which is every child but the
    // head.
    const pos = chordPos === undefined ? undefined : `abcjs-chord-pos-${chordPos}`
    const cls =
      base !== undefined && pos !== undefined ? `${base} ${pos}` : (base ?? pos)
    const name = role === undefined ? undefined : ABCJS_DATA_NAMES[role]
    return `${cls ? ` class="${cls}"` : ''}${name ? ` data-name="${name}"` : ''}`
  }

  /**
   * **ABCJS DRAWS IN ABSOLUTE PIXELS AND WE DRAW IN STAFF SPACES**, and the `viewBox` was
   * doing the conversion. It cannot: abcjs writes no `viewBox`, so byte parity needs the
   * pixels themselves.
   *
   * `PX` is the staff space in pixels and `OY` is the `viewBox`'s own min-y folded back in,
   * so a point that used to resolve through the view transform now arrives already
   * resolved. Applied by TRANSFORMING THE GEOMETRY on its way to the emitters rather than
   * by editing every `num()` — the same values reach the same string builders, which is why
   * every pixel gate in the repo stays green across this change.
   */
  // LAYOUT UNITS → OUTPUT PIXELS. The host's `staffSpace` is how many pixels it wants a
  // staff space to be, and a layout unit is `UNIT_PX` abcjs pixels of it — so compat's own
  // 7.75 resolves to EXACTLY 1 once the layout holds abcjs's pixels, and the emitter stops
  // multiplying at all.
  /**
   * LAYOUT UNITS → OUTPUT PIXELS, whatever the mode. The host's `staffSpace` is how many
   * pixels it wants a staff space to be and a layout unit is `UNIT_PX` abcjs pixels of
   * one, so compat's own 7.75 resolves to EXACTLY 1 once the layout holds abcjs's pixels.
   */
  const OUT = (scale * UNIT_PX) / STAFF_SPACE_PX
  // The DRAWING is in output pixels under `abcjs` and in layout units under core, where a
  // `viewBox` does the conversion instead. The ROOT's size is `OUT` either way.
  const PX = abcjs ? OUT : 1
  const OY = abcjs ? -doc.top : 0
  /**
   * **A `<text>`'s x AND y ARE ROUNDED TO TWO DECIMALS IN ABCJS** — `hash.attr.x =
   * roundNumber(…)`, `hash.attr.y = roundNumber(…)` (`draw/text.js:63-64`), the same rule
   * its paths take. Core keeps the emission quantum, which is finer than a hundredth of a
   * STAFF SPACE and is what its baselines are recorded at.
   */
  const textNum = abcjs ? round2 : num
  /**
   * **abcjs WRITES NO `transform` ANYWHERE** — its line group is a bare `<g>` and every
   * coordinate under it is already absolute. Ours nested a system translate inside a staff
   * translate, which is two more differences per line than the numbers themselves.
   *
   * `oy` is that nesting, flattened: the running origin in OUTPUT units, folded into every
   * coordinate on its way out. Zero in core mode, where the groups stay.
   */
  let oy = 0
  /** One placed line in output units. */
  const TL = (l: PlacedLine): PlacedLine =>
    PX === 1
      ? l
      : {
          ...l,
          x1: l.x1 * PX,
          x2: l.x2 * PX,
          y1: l.y1 * PX + oy,
          y2: l.y2 * PX + oy,
          thickness: l.thickness * PX,
        }
  const TC = (c: PlacedCurve): PlacedCurve =>
    PX === 1
      ? c
      : {
          ...c,
          x1: c.x1 * PX,
          x2: c.x2 * PX,
          y1: c.y1 * PX + oy,
          y2: c.y2 * PX + oy,
          bulge: c.bulge * PX,
          midThickness: c.midThickness * PX,
        }

  const parts: string[] = []
  /** abcjs's running counters. Inert unless `add_classes` asked for the markup. */
  const classes = new Classes(options.addClasses === true)
  /** abcjs's `Selectables.elements.length` — one counter for the whole drawing. */
  let selectableIndex = 0

  /**
   * A TUNE WITH NO MUSIC still writes its title, in the same `abcjs-meta-top` group a
   * tune with a staff writes it in — `draw()` runs `nonMusic(topText)` before it looks at
   * a line at all (`draw/draw.js:12-17`). `doc.topText` is set only in that case; see
   * `layout.ts`.
   */
  if (abcjs && doc.topText !== undefined && doc.topText.length > 0) {
    oy = OY * PX
    const block = doc.topText.map((t) =>
      abcjsText(
        round2(t.x * PX),
        round2(t.y * PX + oy),
        num(t.size * PX),
        'Times New Roman',
        t.italic === true,
        t.bold === true,
        t.anchor ?? 'start',
        t.dataName ?? '',
        escapeText(t.text),
        options.addClasses === true && t.dataName !== undefined
          ? (ABCJS_TEXT_CLASSES[t.dataName] ?? '')
          : '',
      ),
    )
    parts.push(`<g${options.addClasses === true ? ' class="abcjs-meta-top"' : ''}>${block.join('')}</g>`)
  }

  for (const [systemIndex, system] of doc.systems.entries()) {
    // The system's own origin, flattened into every coordinate under it.
    if (abcjs) oy = (system.originY + OY) * PX
    /**
     * **THE TOP TEXT COMES FIRST IN ABCJS'S BODY**, before any staff and before the braces
     * — `nonMusic()` runs the whole header block and only then does `drawStaffGroup` start
     * (`draw/draw.js`). Ours hung the block on the first staff, so a brace was written
     * ahead of the title on every grand-staff fixture.
     *
     * IT IS ITS OWN GROUP, AND A SIBLING OF THE LINE'S — `draw.js:12-17` opens a group
     * (`abcjs-meta-top` under `add_classes`, bare without), runs `nonMusic`, and CLOSES it
     * before the first staff-wrapper. Ours wrapped the whole drawing in one plain `<g>`
     * instead and never closed it, so every fixture carried one `<g>` too many and a
     * titled one had its text inside the wrapper rather than beside it.
     *
     * **AND AN EMPTY GROUP IS DELETED.** `Svg.closeGroup` removes a group whose children
     * are none — "all the elements were invisible" (`svg.js:364-372`) — which is why a
     * titleless tune's first child is the staff-wrapper and not an empty `<g></g>`.
     */
    if (abcjs) {
      const block: string[] = []
      const first = system.staves[0]
      if (first !== undefined) {
        oy = (system.originY + OY) * PX + first.originY * PX
        for (const el of first.elements) {
          if (el.blockHeight === undefined) continue
          for (const t of el.texts) {
            block.push(
              abcjsText(
                round2(t.x * PX),
                round2(t.y * PX + oy),
                num(t.size * PX),
                'Times New Roman',
                t.italic === true,
                t.bold === true,
                t.anchor ?? 'start',
                // abcjs names EVERY top-text row — `title`, `subtitle`, `composer`,
                // `free-text` — from the `name` its `addTextIf`/`richText` call passes.
                // This read a `text` key that was never in the table, so it was always ''.
                t.dataName ?? '',
                escapeText(t.text),
                options.addClasses === true && t.dataName !== undefined
                  ? (ABCJS_TEXT_CLASSES[t.dataName] ?? '')
                  : '',
                (t.extraLines ?? []).map(escapeText),
                t.middleBaseline === true,
              ),
            )
          }
          for (const line of el.lines) {
            const t = TL(line)
            block.push(
              line.role === 'separator'
                ? separatorPath(t.x1, t.y1, t.x2, classes.generate('defined-text'))
                : lineToRect(t, attrs(el.type, line.role), abcjs),
            )
          }
        }
      }
      // …and under `add_classes` the group is named: `abcjs-meta-top` for the tune's own
      // header block, `abcjs-non-music` for a mid-tune one (`draw/draw.js:11-12`, `:55`).
      if (block.length > 0) {
        const klass =
          options.addClasses === true
            ? ` class="${systemIndex === 0 ? 'abcjs-meta-top' : 'abcjs-non-music'}"`
            : ''
        parts.push(`<g${klass}>${block.join('')}</g>`)
      }
    }

    // `abcjs-staff-wrapper abcjs-l{n}` wraps a whole music LINE (`draw/draw.js:40-42`),
    // and it is the outermost thing in abcjs's output — our very first contract row
    // differed on depth because it was missing.
    if (abcjs) classes.incrLine()
    // Each system is laid out in its own space and placed by translation, so nothing
    // inside it depends on how many systems precede it. Staves nest the same way, one
    // per voice, because a staff step means a different pitch under a different clef.
    parts.push(
      `<g${abcjs ? attrIfAny(classes.generate('staff-wrapper')) : ` class="${prefix}-system"`}` +
        `${abcjs ? '' : ` transform="translate(0,${num((system.originY + OY) * PX)})"`}>`,
    )
    // Braces and brackets first: they belong to the SYSTEM, joining staves rather than
    // sitting on one, and they are drawn at the left edge outside the music area.
    // A BRACKET'S STEM. abcjs classes it `abcjs-bracket` and names it `bracket`
    // (`draw/brace.js`, via `classes.generate`), and we emitted neither — so no comparison
    // could reach a bracket at all. Finding 92: the representation was missing a HANDLE.
    for (const line of system.connectorLines) {
      parts.push(
        lineToRect(
          TL(line),
          abcjs ? ' class="abcjs-bracket" data-name="bracket"' : ` class="${prefix}-staff"`,
          abcjs,
        ),
      )
    }
    for (const g of system.connectorGlyphs) {
      // A brace stretches VERTICALLY to span its staves — `scale(1,n)`, not a uniform
      // scale — so it cannot share a definition with an unstretched one and stays a path.
      const scale = g.scale === undefined || g.scale === 1 ? '' : ` scale(1,${num(g.scale)})`
      // …and the same handle for the glyphs. abcjs draws a brace and a bracket as ONE path
      // each, so a `brace` name covers the whole shape and `bracket` covers its two arms.
      const named = g.name === 'brace' ? 'brace' : 'bracket'
      const attr = abcjs
        ? ` class="abcjs-${named}" data-name="${named}"`
        : ` class="${prefix}-staff"`
      parts.push(
        scale === ''
          ? glyphMarkup(g.name, g.x, g.y, undefined, attr)
          : `<path${attr} transform="translate(${num(g.x * PX)},${num(g.y * PX + oy)})${scale}" d="${outline(g.name).path}"/>`,
      )
    }
    for (const staff of system.staves) {
      // …and the staff's, on top of it. Reset per staff, since `staff.originY` is relative.
      if (abcjs) oy = (system.originY + OY) * PX + staff.originY * PX
      let staffGroup = ''
      // CORRECTED, by the byte table: abcjs DOES group the staff lines, with or without
      // `add_classes` — `…</path></g><g fill="currentColor" stroke="none" data-name=
      // "staff-extra clef">` — so the group is real and the element groups are its
      // SIBLINGS. `add_classes` only puts a class on it. Removing it outright was right
      // about the transform and wrong about the group.
      if (!abcjs) {
        parts.push(
          `<g class="${prefix}-staff-group" transform="translate(0,${num(staff.originY * PX)})">`,
        )
      }
      // `incrVoice()` then `newMeasure()` then the staff lines — abcjs's own order
      // (`draw/staff-group.js:80-91`), which is why the staff's class carries `l` and `v`
      // but no `m`/`mm`: the measure counter is null across that call.
      if (abcjs) {
        classes.incrVoice()
        classes.newMeasure()
        // The staff-lines group exists ONLY under `add_classes`; without it abcjs draws
        // the lines straight into the wrapper, and an empty `<g>` would be a row of its own
        // on the contract table.
        staffGroup = classes.generate('staff')
        // …AND AN EMPTY ONE IS DELETED, like every other group `closeGroup` sees with no
        // children (`svg.js:364-372`). A `clef=none stafflines=0` staff draws no lines at
        // all, so abcjs's next child is the time signature and ours was an empty `<g>`.
        if (staff.staffLines.length > 0) {
          parts.push(staffGroup ? `<g class="${staffGroup}">` : '<g>')
        }
        // …AND THE MEASURE COUNTER IS ALREADY 0 BY THE TIME THE PREFIX IS DRAWN.
        // `draw/voice.js:31` reads as though a `staff-extra` cannot open a measure —
        // `if (child.type !== 'staff-extra' && !isInMeasure()) startMeasure()` — but
        // abcjs's own OUTPUT gives the clef `abcjs-m0 abcjs-mm0`, so something upstream
        // has already started it. Measured rather than reasoned: the source lies here,
        // and the goldens are the target.
        classes.startMeasure()
      }
      // abcjs classes only the TOP staff line; the other four carry no class at all.
      //
      // Found by the LOWEST y rather than by index. `staffLines[0]` is the BOTTOM line —
      // y is down and the array runs upward — so keying on index 0 put `abcjs-top-line`
      // on the bottom line, four staff spaces from where a stylesheet targeting it would
      // expect. Silent, because the class was present and the count was right.
      const ordered = abcjs ? [...staff.staffLines].reverse() : staff.staffLines
      const topLine = ordered.reduce(
        (best, line, i) => (line.y1 < (ordered[best]?.y1 ?? Number.POSITIVE_INFINITY) ? i : best),
        0,
      )
      // **TOP-DOWN.** `staffLines[0]` is the BOTTOM line here — y is down and the array runs
      // upward — and abcjs's `printStaff` writes from the top. A pure ORDER difference,
      // invisible to every gate that compares positions and worth 31px of apparent offset
      // when the first line of each engine's output was read side by side.
      ordered.forEach((line, i) => {
        const attr = abcjs
          ? i === topLine
            ? ' class="abcjs-top-line"'
            : ''
          : ` class="${prefix}-staff"`
        parts.push(lineToRect(TL(line), attr, abcjs))
      })
      if (abcjs && staff.staffLines.length > 0) parts.push('</g>')
      // `foundNote` — a barline before any note does not advance the measure counter.
      let foundNote = false
      /**
       * **A DYNAMIC IS NOT A CHILD OF THE NOTE.** `!p!` becomes a `DynamicDecoration`
       * pushed onto the voice's `otherchildren` (`decoration.js:287`), so `drawVoice`
       * draws it AFTER every element and every beam, at the voice's own level — where a
       * hairpin already sat. Ours nested it in the note group at depth 2. Held back here
       * and flushed with the spanners below.
       */
      const dynamics: PlacedGlyph[] = []
      /**
       * The counters each element's GROUP was named with, by index — what abcjs stores as
       * `params.counters = classes.getCurrent()` inside `drawAbsolute`
       * (`draw/absolute.js:33`). A tie's and a slur's class quote them for both anchors.
       */
      const counters = new Map<number, { measure: number; note: number }>()
      /** Grace beams, held back to the voice's beam pass where abcjs draws them. */
      const graceBeams: PlacedLine[] = []
      staff.elements.forEach((el, elIndex) => {
        // Already written above, ahead of the braces. See the hoist.
        if (abcjs && el.blockHeight !== undefined) return
        // abcjs wraps each element in a group carrying its kind and index, which is what
        // its interaction code walks. Core's own naming needs no wrapper.
        let gcls = ''
        /**
         * Where this element's own `<g>` was pushed, so an element that draws NOTHING can
         * take it back again. **AN EMPTY GROUP IS DELETED** (`svg.js:364-372`) and
         * `drawAbsolute` skips the whole append when `closeGroup` returns null — which is
         * how a `y` SPACER produces no markup at all. Ours wrote a `<g class="abcjs-rest">`
         * around nothing, so a spacer read as a rest on every gate that walks the DOM.
         * The same rule already governs `abcjs-meta-top` and the staff-lines group.
         */
        let openedAt = -1
        /** The class counters this element advances — spent once its children are out. */
        let advance = (): void => {}
        if (abcjs) {
          const name = ABCJS_ELEMENT_NAMES[el.type] ?? el.type
          // `if (child.type !== 'staff-extra' && !isInMeasure()) startMeasure()`
          // (`draw/voice.js:31-34`) — a prefix element does not open a measure.
          const isExtra = name.startsWith('staff-extra')
          const justStarted = !isExtra && !classes.isInMeasure()
          if (justStarted) classes.startMeasure()
          // `klass = params.type`, then ` d{durationClass}` with `.` → `-`, then one
          // ` p{pitch}` per pitch, for a note or a rest only
          // (`draw/absolute.js:31-40`).
          let klass = name
          if (el.type === 'note' || el.type === 'rest') {
            klass += ` d${Math.round((el.durationClass ?? 0) * 1000) / 1000}`.replace(/\./g, '-')
            for (const p of el.abcjsPitches ?? []) klass += ` p${p}`
          }
          gcls = classes.generate(klass)
          counters.set(elIndex, classes.current())
          /**
           * abcjs's own attribute order on an element group: `fill`, `stroke`, the class
           * when there is one, then `data-name`.
           *
           * **AND `data-index` IS AN INDEX INTO THE SELECTABLES, NOT INTO THE CHILDREN.**
           * `Selectables.add` writes `{selectable: false, "data-index": elements.length}`
           * and only after `canSelect`, which with no `selectTypes` admits `el_type
           * 'note'` alone (`draw/selectables.js:15-45`) — abcjs's rests are note elements,
           * so both count and nothing else does. A barline, a clef and a key signature
           * carry NEITHER attribute; ours carried both, with the child index in them.
           */
          const selectable = el.type === 'note' || el.type === 'rest'
          openedAt = parts.length
          parts.push(
            `<g fill="currentColor" stroke="none"${gcls ? ` class="${gcls}"` : ''}` +
              ` data-name="${name}"` +
              `${selectable ? ` selectable="false" data-index="${selectableIndex++}"` : ''}>`,
          )
          /**
           * **THE COUNTERS ADVANCE AFTER THE ELEMENT IS DRAWN, NOT BEFORE IT.** `drawVoice`
           * runs `drawAbsolute(…)` and only then `incrNote()` / `incrMeasure()`
           * (`draw/voice.js:41-46`), so a child generated INSIDE the element sees the
           * counters the group itself was named with. A BAR NUMBER is such a child, and
           * ours read `m1 mm1` where abcjs writes `m0 mm0`.
           */
          advance = () => {
            if (el.type === 'note' || (el.type === 'rest' && el.plainRest !== false)) {
              classes.incrNote()
            }
            if (el.type === 'bar' && !justStarted && foundNote) classes.incrMeasure()
            if (el.type === 'note' || el.type === 'rest') foundNote = true
          }
        }
        /**
         * **A BAR NUMBER IS THE BAR'S FIRST CHILD**, ahead of the rule itself — abcjs's own
         * contract reads `bar-number` then `bar`. Every other element's text comes last,
         * which is why the texts are built here and placed by kind rather than in order.
         */
        const barTexts = abcjs && el.type === 'bar'
        // Carries the ROLE beside the markup because a note's texts are not one bucket:
        // `createNote` adds the lyric before the ledger lines and the chord symbol after
        // them (`abstract-engraver.js:829-855`). See the split at the emission site.
        const textParts: { readonly role: PartRole | undefined; readonly s: string }[] = []
        for (const t of el.texts) {
          const style =
            (t.bold ? ' font-weight="bold"' : '') + (t.italic ? ' font-style="italic"' : '')
          /**
           * **A `P:` LABEL NAMES ITSELF AND CARRIES ITS GROUP'S CLASS TWICE.**
           * `renderText(…, { klass: classes.generate("part"), name: params.c }, true)`
           * (`draw/relative.js:58`), and abcjs's own contract shows the result DOUBLED —
           * `abcjs-part abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0` repeated — because the group
           * around it was generated from the same key and the text appends the COUNTERS
           * again — `abcjs-part abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-l0 abcjs-m0
           * abcjs-mm0 abcjs-v0`, the key once and the counters twice. Measured from the
           * contract, which is the oracle here; ours wrote neither the name nor the class.
           */
          // A BAR NUMBER carries a GENERATED class of its own — see `barNumberText`.
          const isBarNumber = abcjs && t.dataName === 'bar-number'
          const isPart = abcjs && el.type === 'part'
          const counters = gcls.split(' ').slice(1).join(' ')
          const partAttr = isPart
            ? `${gcls ? ` class="${gcls}${counters ? ` ${counters}` : ''}"` : ''}` +
              ` data-name="${escapeAttr(t.text)}"`
            : isBarNumber
              ? `${attrIfAny(classes.generate('bar-number'))} data-name="bar-number"`
              /**
               * **A LYRIC, A CHORD SYMBOL AND AN ANNOTATION EACH NAME THEMSELVES** —
               * `relative.js:41-52` gives all three `klass: classes.generate(<name>)` and
               * the same string as `name`. The `n` counter joins only the lyric's, because
               * `generate` appends it for a key containing `note`, `rest` or `lyric`
               * (`helpers/classes.js:90`). Ours wrote neither the class nor the name.
               */
              : abcjs && MUSIC_TEXT_NAMES.has(t.dataName ?? '')
                ? `${attrIfAny(classes.generate(t.dataName ?? ''))} data-name="${t.dataName}"`
                // **A TEMPO MARK'S PARTS NAME THEMSELVES AND CARRY NO CLASS** —
                // `drawTempo` renders `pre`, `beats` and `post` with `noClass: true` and a
                // `name` each (`draw/tempo.js:19`, `:31`, `:38`).
                : abcjs && t.dataName !== undefined
                  ? ` data-name="${t.dataName}"`
                  : attrs(el.type, 'text')
          textParts.push({
            role: t.role,
            s:
            `<text${partAttr} x="${textNum(t.x * PX)}" y="${textNum(t.y * PX + oy)}" ` +
              `font-family="serif" font-size="${num(t.size * PX)}"${style}` +
              // Only the top-text block sets one; the music's own text is all left-aligned.
              `${t.anchor === undefined || t.anchor === 'start' ? '' : ` text-anchor="${t.anchor}"`}` +
              `>${t.jazz === undefined ? escapeText(t.text) : jazzChordMarkup(t.jazz, textNum(t.x * PX))}</text>`,
          })
        }
        if (barTexts) parts.push(...textParts.map((t) => t.s))
        /**
         * **THE ORDER INSIDE AN ELEMENT GROUP IS THE ENGRAVER'S ADD ORDER**, and for a note
         * that is, measured against abcjs's own goldens:
         *
         *     [flag, dots, accidental, head] per pitch  ->  stem  ->  ledger  ->  decoration
         *
         * `dots.dot, accidentals.flat, _B,, abcjs-stem, ledger` on `visual-layout-04`, and
         * `e, abcjs-stem, scripts.trill` on `synth-flattener-11`. The per-pitch run is
         * assembled in `layoutNote`; the split here is what puts the RULES between it and
         * everything the engraver added after them. We wrote every glyph and then every
         * rule, so a fermata preceded its own stem.
         *
         * A MULTI-CHARACTER SYMBOL IS ONE GROUP with UNNAMED children — see
         * `PlacedGlyph.group`. Consecutive glyphs sharing the string are wrapped together.
         */
        const PITCH_ROLES = ['flag', 'dot', 'accidental', 'notehead']
        // Only a NOTE or a REST has rules between its glyphs; a clef, a key and a time
        // signature are glyphs alone, and splitting their run broke the `<g data-name="12">`
        // a multi-character figure is wrapped in — which the PASSING ratchet caught.
        // A BAR INTERLEAVES its rules and its dot columns — see `PlacedGlyph.afterLine` —
        // so it takes its own merge below and has no pitch run at all.
        const pitchEnd =
          abcjs && el.type === 'bar'
            ? 0
            : abcjs && (el.type === 'note' || el.type === 'rest')
          ? (() => {
              let i = 0
              while (i < el.glyphs.length && PITCH_ROLES.includes(el.glyphs[i]?.role ?? '')) i += 1
              return i
            })()
          : el.glyphs.length
        let openGlyphGroup: string | null = null
        for (const g of el.glyphs.slice(0, pitchEnd)) {
          const group = abcjs ? (g.group ?? null) : null
          if (group !== openGlyphGroup) {
            if (openGlyphGroup !== null) parts.push('</g>')
            if (group !== null) parts.push(`<g data-name="${escapeAttr(group)}">`)
            openGlyphGroup = group
          }
          // The glyph path is authored at the origin, so a placement is all that is needed.
          parts.push(
            glyphMarkup(
              g.name,
              g.x,
              g.y,
              g.scale,
              attrs(el.type, g.role, g.chordPos),
              g.role,
              // Inside a group abcjs names NONE of the children — `printSymbol` passes
              // only `{stroke, fill}` there — and `'' ?? x` is `''`, so this suppresses
              // the attribute rather than falling back to the glyph key.
              group === null ? g.dataName : '',
            ),
          )
        }
        if (openGlyphGroup !== null) parts.push('</g>')
        // A STEM PRECEDES A LEDGER — `abselem.addRight(stem)` runs after every pitch and the
        // ledgers follow it (`abstract-engraver.js:762`). Ours built the ledgers inside the
        // head loop, so they came first.
        // A GRACE's stem is written after every grace HEAD — see `PlacedLine.graceStem` —
        // so it is held back past the trailing glyphs entirely.
        const isGraceLine = (l: (typeof el.lines)[number]): boolean =>
          l.graceStem === true || l.graceIndex !== undefined
        // A GRACE BEAM is hoisted to the voice's beam pass — see `PlacedLine.role`.
        const own = abcjs
          ? el.lines.filter((l) => !isGraceLine(l) && l.role !== 'beam')
          : el.lines
        if (abcjs) for (const l of el.lines) if (l.role === 'beam') graceBeams.push(l)
        const graceStems = abcjs ? el.lines.filter((l) => l.graceStem === true) : []
        // A grace's LEDGERS follow its OWN head — see `PlacedLine.graceIndex`.
        const graceLedgers = abcjs
          ? el.lines.filter((l) => l.graceStem !== true && l.graceIndex !== undefined)
          : []
        const ordered = abcjs
          ? [
              ...own.filter((l) => l.role === 'stem' && l.beamed !== true),
              ...own.filter((l) => l.role !== 'stem'),
              ...own.filter((l) => l.role === 'stem' && l.beamed === true),
            ]
          : own
        /**
         * **A BARLINE'S DOT COLUMNS INTERLEAVE WITH ITS RULES.** abcjs's contract shows a
         * repeat END as `dots.dot, dots.dot, bar, bar` and a repeat START as
         * `bar, bar, dots.dot, dots.dot` — the leading column is added before the rules and
         * the trailing one after. `afterLine` carries how many rules precede each dot.
         */
        if (abcjs && el.type === 'bar') {
          let li = 0
          for (const g of el.glyphs) {
            while (li < ordered.length && li < (g.afterLine ?? 0)) {
              const line = ordered[li++]
              if (line !== undefined) {
                parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
              }
            }
            parts.push(
              glyphMarkup(g.name, g.x, g.y, g.scale, attrs(el.type, g.role, g.chordPos), g.role, g.dataName),
            )
          }
          while (li < ordered.length) {
            const line = ordered[li++]
            if (line !== undefined) {
              parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
            }
          }
          if (barTexts) {
            // already emitted above
          }
          advance()
          parts.push('</g>')
          return
        }
        /**
         * **THE LEDGER IS LAST, AND THE LYRIC, THE GRACES AND THE DECORATION COME BEFORE
         * IT.** `createNote` is a straight run of adders and `_addChild` is a plain push
         * (`absolute-element.js:181-190`), so DRAW ORDER IS CALL ORDER:
         *
         *     heads+stem → lyric → graces → decorations → barNumber → LEDGER → chord
         *
         * (`abstract-engraver.js:829-855`), which abcjs's own contract shows as
         * `C, stem, scripts.ufermata, ledger` and `C, stem, lyric, ledger`. We emitted
         * every rule together, so the ledger came out with the stem and everything the
         * engraver added after it followed. A LYRIC IS A `<text>`, so the "texts last"
         * rule has to bend: only the CHORD symbol is genuinely last.
         */
        const isChordText = (r: PartRole | undefined): boolean => r === 'chord' || r === 'chordBelow'
        const ledgers = abcjs ? own.filter((l) => l.role !== 'stem') : []
        for (const line of abcjs ? own.filter((l) => l.role === 'stem' && l.beamed !== true) : ordered) {
          parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
        }
        if (abcjs) {
          for (const t of textParts.filter((t) => t.role === 'lyric')) parts.push(t.s)
        }
        // …and everything the engraver added AFTER the stem — decorations, graces.
        for (const g of el.glyphs.slice(pitchEnd)) {
          // Held whole rather than as markup: its class is `classes.generate`'d at FLUSH
          // time, after `startMeasure()` has reset the counters the group was named with.
          if (abcjs && g.role === 'dynamic') {
            dynamics.push(g)
            continue
          }
          parts.push(
            glyphMarkup(
              g.name,
              g.x,
              g.y,
              g.scale,
              attrs(el.type, g.role, g.chordPos),
              g.role,
              g.dataName,
            ),
          )
          if (g.graceIndex === undefined) continue
          for (const line of graceLedgers.filter((l) => l.graceIndex === g.graceIndex)) {
            parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
          }
        }
        for (const line of graceStems) parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
        // A TEXT DECORATION (`!D.C.!`) is `createDecoration`'s, so it precedes the ledger;
        // an ANNOTATION (`"^above"`) is `addChord`'s and follows it. Both draw with
        // `annotationfont`, so the ROLE is what tells them apart, not the markup.
        if (abcjs) {
          for (const t of textParts.filter((t) => t.role !== 'lyric' && !isChordText(t.role))) {
            parts.push(t.s)
          }
          for (const line of ledgers) parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
        }
        // Prose is a real <text> in a generic family, unlike musical glyphs, which are
        // paths so the SVG stays self-contained. A missing serif face falls back to
        // another serif; a missing Bravura falls back to nothing legible. See layout.ts.
        if (!barTexts) {
          parts.push(...textParts.filter((t) => !abcjs || isChordText(t.role)).map((t) => t.s))
        }
        if (abcjs) {
          for (const line of own.filter((l) => l.role === 'stem' && l.beamed === true)) {
            parts.push(lineToRect(TL(line), attrs(el.type, line.role), abcjs))
          }
        }
        advance()
        if (abcjs) {
          if (openedAt >= 0 && parts.length === openedAt + 1) {
            parts.length = openedAt
            // The `data-index` it took is given back too: `Selectables.add` never ran.
            if (el.type === 'note' || el.type === 'rest') selectableIndex -= 1
          } else {
            parts.push('</g>')
          }
        }
      })
      /**
       * **abcjs DRAWS THE MUSIC FIRST, THEN THE BEAMS, THEN EVERYTHING ELSE** — and we
       * drew all of it before the first notehead.
       *
       * `drawVoice` walks `params.children` (the absolute elements), then
       * `params.beams` — "beams must be drawn first for proper printing of triplets,
       * slurs and ties" — then `params.otherchildren`, whose switch runs glissando,
       * crescendo, dynamics, triplet, ending and tie (`draw/voice.js:25-90`). So a beam
       * or a tie sits AFTER the group of the note it belongs to, not before it.
       *
       * 48 rows of the byte table first differed exactly here, on a `<polygon>` where
       * abcjs's next byte opens the following note's `<g>`. No positional gate could see
       * it: document order is not a coordinate.
       */
      // `classes.startMeasure()` runs before the beams and again before the otherchildren
      // (`draw/voice.js:50`, `:59`), and it RESETS the counter to 0 rather than opening the
      // next measure (`helpers/classes.js:44-46`). So every beam is `m0 mm0` whatever bar
      // it is in — ours carried the running count.
      if (abcjs) classes.startMeasure()
      for (const beam of staff.beams) {
        /**
         * **A BEAM'S CLASS IS GENERATED, NOT LITERAL** —
         * `classes.generate('beam-elem ' + durationClass)` with `.` → `-`
         * (`draw/beam.js:24-25`), so `add_classes` gives
         * `abcjs-beam-elem abcjs-d0-125 abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0` and without it
         * an EMPTY `class=""` — abcjs passes `''` and `svg.js`'s path sets the attribute
         * anyway, because `'' !== undefined`. Ours wrote a literal `abcjs-beam`, which is a
         * class abcjs does not have at all.
         */
        const beamClass = abcjs
          ? ` class="${classes.generate(
              `beam-elem d${Math.round((beam.durationClass ?? 0) * 1000) / 1000}`.replace(
                /\./g,
                '-',
              ),
            )}"`
          : ` class="${prefix}-beam"`
        parts.push(lineToRect(TL(beam), beamClass, abcjs))
      }
      // A GRACE BEAM's own class is `beam-elem d0` — its `durationClass` is 0, since a
      // grace note has no sounding duration.
      for (const b of graceBeams) {
        parts.push(lineToRect(TL(b), attrIfAny(classes.generate('beam-elem d0')), abcjs))
      }
      // **`drawDynamics` AND `drawCrescendo` DISAGREE ON THE ORDER OF THEIR OWN TWO
      // CLASSES** — `generate('decoration dynamics')` for a volume mark
      // (`draw/dynamics.js:11`) and `generate('dynamics decoration')` for a hairpin
      // (`draw/crescendo.js:34`). abcjs's contract shows both spellings side by side, so
      // it is a quirk to reproduce rather than one of them to pick.
      for (const g of dynamics) {
        parts.push(
          glyphMarkup(
            g.name,
            g.x,
            g.y,
            g.scale,
            // The name goes in the ATTRIBUTES rather than through `dataName`, because a
            // SCALED glyph takes `glyphMarkup`'s transform path, which writes the
            // attribute string and nothing else. The ORDER is `svg.js:path`'s key order
            // over `printSymbol`'s options — class, stroke, fill, then the name — and it
            // differs from an in-group glyph's because this one is not in a group.
            ` class="${classes.generate('decoration dynamics')}" stroke="none" ` +
              `fill="currentColor" data-name="${ABCJS_DATA_NAMES.dynamic}"`,
            g.role,
          ),
        )
      }
      /**
       * **A BRACKET IS A GROUP HOLDING ONE PATH AND ITS NUMBER.** Both `drawEnding` and
       * `drawTriplet` open a `<g>`, write EVERY segment as a single `printPath` `d`, add
       * the number as a `noClass` text naming itself, and close
       * (`draw/ending.js:27-50`, `draw/triplet.js:7-13`). We wrote a line per segment at
       * the voice's own level and a text beside them, which is four rows of the contract
       * where abcjs has three — and the `d` is `M … L … ` per segment WITH a trailing
       * space, from `sprintf`.
       */
      const bracketGroup = (
        lines: readonly PlacedLine[],
        text: PlacedText | undefined,
        name: string,
        pathName: string,
        fill: boolean,
      ): void => {
        if (text === undefined) return
        const d = lines
          .map((l) => {
            const t = TL(l)
            return `M ${round2(t.x1)} ${round2(t.y1)} L ${round2(t.x2)} ${round2(t.y2)} `
          })
          .join('')
        parts.push(
          `<g${attrIfAny(classes.generateAt(text.groupClass ?? '', text.measure ?? 0))}` +
            `${fill ? ' fill="currentColor"' : ''} data-name="${name}">`,
        )
        if (d) {
          parts.push(
            `<path d="${d}" stroke="currentColor"${fill ? ' fill="currentColor"' : ''} ` +
              `data-name="${pathName}"></path>`,
          )
        }
        const style =
          (text.bold ? ' font-weight="bold"' : '') + (text.italic ? ' font-style="italic"' : '')
        const anchor = text.anchor === undefined ? '' : ` text-anchor="${text.anchor}"`
        parts.push(
          `<text${anchor} x="${textNum(text.x * PX)}" y="${round2(text.y * PX + oy)}" ` +
            `font-family="serif" font-size="${num(text.size * PX)}"${style} ` +
            `data-name="${escapeAttr(text.dataName ?? text.text)}">${escapeText(text.text)}</text>`,
        )
        parts.push('</g>')
      }
      if (abcjs) {
        for (const t of staff.voltaTexts) {
          bracketGroup(
            staff.voltaLines.filter((l) => l.group === t.group),
            t,
            'ending',
            'line',
            true,
          )
        }
      } else {
        for (const line of staff.voltaLines) {
          parts.push(lineToRect(TL(line), ` class="${prefix}-volta"`, abcjs))
        }
        for (const t of staff.voltaTexts) {
          parts.push(
            `<text class="${prefix}-volta" x="${textNum(t.x * PX)}" ` +
              `y="${round2(t.y * PX + oy)}" font-family="serif" font-size="${num(t.size * PX)}">${escapeText(t.text)}</text>`,
          )
        }
      }
      // ABCJS CALLS IT A TRIPLET, whatever the number — `classes.generate('triplet ' +
      // durationClass)` on the group and `data-name="triplet-bracket"` on the path
      // (`draw/triplet.js:7-9`, `:42`). Ours said `abcjs-tuplet`, which is the right word
      // for the concept and the wrong one for compat: a stylesheet written against abcjs
      // selects `.abcjs-triplet`, and no comparison could match the bracket either.
      if (abcjs) {
        for (const t of staff.tupletTexts) {
          bracketGroup(
            staff.tupletLines.filter((l) => l.group === t.group),
            t,
            'triplet',
            'triplet-bracket',
            false,
          )
        }
      } else {
        for (const line of staff.tupletLines) {
          parts.push(lineToRect(TL(line), ` class="${prefix}-tuplet"`, abcjs))
        }
      }
      // Never present in strict mode, where abcjs prints a literal `_` instead — so this
      // reuses abcjs's lyric class rather than inventing one it has no counterpart for.
      for (const line of staff.melismaLines) {
        parts.push(lineToRect(TL(line), abcjs ? ' class="abcjs-lyric"' : ` class="${prefix}-lyric"`, abcjs))
      }
      // Hairpins and glissandi. THE COMMENT HERE USED TO SAY "abcjs paints these with no
      // class of its own" — reasoned, never measured, and its own output denies it:
      // `drawCrescendo` passes `classes.generate('dynamics decoration')` and
      // `"data-name": "dynamics"` (`draw/crescendo.js:34`), which comes out as
      // `class="abcjs-decoration abcjs-dynamics …" data-name="dynamics"`. A glissando is
      // `data-name="glissando"` on the same footing.
      /**
       * **A HAIRPIN IS ONE STROKED `<path>` WITH TWO SUBPATHS, NOT TWO LINES.**
       * `drawCrescendo` builds `M %f %f L %f %f M %f %f L %f %f` in a single `printPath`
       * (`draw/crescendo.js:16-35`), so both arms are one element and one row of the
       * contract. We drew an arm each, which read as a doubled dynamic. The arms arrive
       * adjacent and upper-first from `hairpin()` in `layout.ts`, which is the pairing.
       */
      for (let i = 0; i < staff.spannerLines.length; i += 1) {
        const line = staff.spannerLines[i]
        if (line === undefined) continue
        const arm2 = line.role === 'dynamic' ? staff.spannerLines[i + 1] : undefined
        if (abcjs && arm2 !== undefined) {
          i += 1
          const [a, b] = [TL(line), TL(arm2)]
          const d =
            `M ${round2(a.x1)} ${round2(a.y1)} L ${round2(a.x2)} ${round2(a.y2)} ` +
            `M ${round2(b.x1)} ${round2(b.y1)} L ${round2(b.x2)} ${round2(b.y2)}`
          parts.push(
            `<path d="${d}" highlight="stroke" stroke="currentColor" ` +
              `class="${classes.generate('dynamics decoration')}" data-name="dynamics"></path>`,
          )
          continue
        }
        const named = line.role === 'dynamic' ? 'dynamics' : 'glissando'
        const cls =
          line.role === 'dynamic'
            ? classes.generate('dynamics decoration')
            : classes.generate('glissando')
        parts.push(
          lineToRect(
            TL(line),
            abcjs ? ` class="${cls}" data-name="${named}"` : ` class="${prefix}-decoration"`,
            abcjs,
          ),
        )
      }
      // THE NUMBER CARRIES NO CLASS, and that is abcjs's choice rather than an omission:
      // `drawTriplet` passes `noClass: true` and `name: "" + params.number`
      // (`draw/triplet.js:11`), so its golden emits `data-name="3"` and nothing else. The
      // BRACKET beside it is classed `abcjs-triplet` through the group. Giving the number
      // that class too — which this did until now — invented a hook abcjs does not offer
      // and still left it unmatchable, since a comparison keyed on `data-name` found
      // nothing.
      // …and under `abcjs` the number is written INSIDE its group, by `bracketGroup`.
      if (!abcjs) {
        for (const t of staff.tupletTexts) {
          const style = `${t.bold ? ' font-weight="bold"' : ''}${t.italic ? ' font-style="italic"' : ''}`
          const anchor = t.anchor === undefined ? '' : ` text-anchor="${t.anchor}"`
          parts.push(
            `<text class="${prefix}-tuplet"${anchor} x="${textNum(t.x * PX)}" ` +
              `y="${round2(t.y * PX + oy)}" font-family="serif" font-size="${num(t.size * PX)}"${style}>${escapeText(t.text)}</text>`,
          )
        }
      }
      /**
       * **A SLUR AND A TIE NAME THE NOTES THEY JOIN.** `drawTie` builds
       * `abcjs-start-m{measure}-n{note} abcjs-end-m{measure}-n{note}` off each anchor's
       * `parent.counters` — an unanchored end is `abcjs-start-edge` / `abcjs-end-edge` —
       * and `drawArc` appends `slur` and then `tie` or `legato` before generating
       * (`draw/tie.js:6-20`, `:83-87`). `data-name` is `tie` or `slur`. Ours wrote a bare
       * `abcjs-tie`, which is a class abcjs only ever writes with the rest of that string.
       */
      for (const curve of staff.curves) {
        const end = (which: 'start' | 'end', index: number | undefined): string => {
          const c = index === undefined ? undefined : counters.get(index)
          return c === undefined
            ? `abcjs-${which}-edge`
            : `abcjs-${which}-m${c.measure}-n${c.note}`
        }
        const klass =
          `${end('start', curve.startElement)} ${end('end', curve.endElement)}` +
          ` slur ${curve.kind === 'tie' ? 'tie' : 'legato'}`
        // Generated at the CLOSING note's measure: the curve is `addOther`'d when it
        // closes, so the count of `"bar"` markers ahead of it in `otherchildren` is that
        // note's own measure index within the line.
        const at = curve.endElement === undefined ? 0 : (counters.get(curve.endElement)?.measure ?? 0)
        parts.push(
          curveToPath(
            TC(curve),
            abcjs
              ? `${attrIfAny(classes.generateAt(klass, at))} data-name="${curve.kind}"`
              : ` class="${prefix}-${curve.kind}"`,
            strict,
            PX,
          ),
        )
      }

      if (!abcjs) parts.push('</g>')
    }
    parts.push('</g>')
  }

  /**
   * **THE PAGE IS `doc.pageWidth`, NOT THE INK AND NOT A HOST CONSTANT.** abcjs sizes the
   * root from `maxwidth + padding.left + padding.right` (`draw/set-paper-size.js:2`), and
   * `maxwidth` is the requested staff width raised by any line too stiff to compress to
   * it. So `%%staffwidth 5` gives 44.985 and a tune too wide for 670 gives 752.491 —
   * neither expressible by the host, which is why `options.pageWidth` is core-only now.
   */
  /**
   * **THE BOTTOM BLOCK CLOSES THE DRAWING** — `draw()` runs it after every line, in its own
   * group (`abcjs-meta-bottom` under `add_classes`) and after a bare `moveY(24)`
   * (`draw/draw.js:64-72`). Its y already carries that gap; see `layout.ts`.
   */
  if (
    abcjs &&
    ((doc.bottomText !== undefined && doc.bottomText.length > 0) ||
      (doc.bottomLines !== undefined && doc.bottomLines.length > 0))
  ) {
    oy = OY * PX
    const block = (doc.bottomText ?? []).map((t) =>
      abcjsText(
        round2(t.x * PX),
        round2(t.y * PX + oy),
        num(t.size * PX),
        'Times New Roman',
        t.italic === true,
        t.bold === true,
        t.anchor ?? 'start',
        t.dataName ?? '',
        escapeText(t.text),
        options.addClasses === true && t.dataName !== undefined
          ? (ABCJS_TEXT_CLASSES[t.dataName] ?? '')
          : '',
        (t.extraLines ?? []).map(escapeText),
        t.middleBaseline === true,
      ),
    )
    // …and a trailing `%%sep`'s rule, which is INK on the same block.
    for (const line of doc.bottomLines ?? []) {
      const t = TL(line)
      block.push(separatorPath(t.x1, t.y1, t.x2, classes.generate('defined-text')))
    }
    parts.push(
      `<g${options.addClasses === true ? ' class="abcjs-meta-bottom"' : ''}>${block.join('')}</g>`,
    )
  }

  const w = abcjs ? doc.pageWidth * OUT : (options.pageWidth ?? doc.width * OUT)
  const h = doc.height * OUT
  // The viewBox must widen with the page, or forcing the width would just scale the
  // music up to fill it instead of leaving the margin abcjs leaves.
  const viewWidth = options.pageWidth === undefined ? doc.width : options.pageWidth / OUT
  // viewBox carries the staff-space coordinate system, including the negative y above
  // the middle line, so nothing downstream has to know about the origin offset.
  const viewBox = `0 ${num(doc.top)} ${num(viewWidth)} ${num(doc.height)}`

  /**
   * ABCJS'S ROOT ELEMENT, ATTRIBUTE FOR ATTRIBUTE — and it is what a browser's serializer
   * writes back out of the DOM abcjs built, which is why there is no `xmlns` (an inline
   * `<svg>` inherits it) and why `xmlns:xlink` is there instead.
   *
   * The `<style>` block and the `<title>` are abcjs's own, emitted on every render
   * (`write/renderer.js`), and they are byte-for-byte fixed text — a drag-in-progress
   * rule and an accessible label. Neither draws anything, and both are 300-odd bytes of
   * the contract.
   *
   * NO `viewBox`: abcjs draws in ABSOLUTE PIXELS. Ours carries a staff-space coordinate
   * system and scales it, which is why the whole body still differs after this — that is
   * the next and much larger piece, and the byte table is what will rank it.
   */
  if (abcjs) {
    return (
      `<svg xmlns:xlink="http://www.w3.org/1999/xlink" role="img" fill="currentColor" ` +
      `stroke="currentColor" aria-label="Sheet Music${
        options.title === undefined || options.title === ''
          ? ''
          : ` for &quot;${escapeText(options.title)}&quot;`
      }" width="${raw(w)}" height="${raw(h)}"` +
      /**
       * **NO `viewBox`.** abcjs draws in ABSOLUTE PIXELS and writes none; the drawing above
       * is now emitted in pixels too, so there is nothing left for a view transform to do.
       *
       * This is what took 196 tests red when it was tried on its own: `tests/pixel-geometry.ts`
       * reads the `viewBox` to resolve our staff spaces, and every geometry gate is built
       * on it. Removing the attribute AND emitting pixels are one change, and together they
       * make the gates compare like with like instead of converting first.
       */
      `>` +
      // The TITLE element carries the same phrase with REAL quotes — it is text content,
      // where the `aria-label` is an attribute and the serializer escapes them there.
      `<style>${ABCJS_STYLE}</style><title>Sheet Music${
        options.title === undefined || options.title === ''
          ? ''
          : ` for "${escapeText(options.title)}"`
      }</title>` +
      (glyphDefs.size === 0
        ? ''
        : `<defs>${[...glyphDefs]
            .map(([name, id]) => `<path id="${id}" d="${outline(name).path}"/>`)
            .join('')}</defs>`) +
      // NO WRAPPER ROUND THE WHOLE DRAWING. abcjs's `fill` lives on the `<svg>` and its
      // outermost children are SIBLINGS: the meta-top group, then one staff-wrapper per
      // line, then the meta-bottom group. The `<g>` that used to be here was read as
      // abcjs's outer group and is in fact its `abcjs-meta-top`, which now sits with the
      // top text that fills it.
      parts.join('') +
      '</svg>'
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${abcjs ? '' : ` class="${escapeAttr(prefix)}"`} ` +
    // abcjs SETS `fill` ON THE `<svg>` ITSELF and wraps nothing round the music, so its
    // outermost child is the staff-wrapper. Ours carried an extra `<g fill>`, which put
    // every element ONE DEPTH deeper than abcjs's and made the very first contract row
    // differ — a difference no positional gate could express, since a group with no
    // transform moves nothing.
    `${abcjs ? 'fill="currentColor" ' : ''}` +
    `width="${num(w)}" height="${num(h)}" viewBox="${viewBox}">` +
    // Built while walking the music, so it can only be serialised now that the walk is
    // done — which is why `parts` is assembled first and the document assembled last.
    (glyphDefs.size === 0
      ? ''
      : `<defs>${[...glyphDefs]
          .map(([name, id]) => `<path id="${id}" d="${outline(name).path}"/>`)
          .join('')}</defs>`) +
    (abcjs ? parts.join('') : `<g fill="currentColor">${parts.join('')}</g>`) +
    `</svg>`
  )
}
