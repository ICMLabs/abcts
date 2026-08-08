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
import { ABCJS_ARC, ABCJS_YCORR, spaces } from './abcjs-constants.js'
import { SMUFL_TO_ABCJS } from './glyph-map.js'
import { glyphsFor } from './glyph-table.js'
import { GLYPHS, type GlyphName } from './glyphs.js'
import type { Layout, PlacedCurve, PlacedLine } from './layout.js'

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
 * ponytail: abcjs also puts a `data-name` on each GLYPH — the pitch letter on a notehead,
 * `clefs.G` on a clef — and those are not reproduced. Ours are SMuFL names, mapping them
 * would be a second table, and no realistic consumer keys on them; the group-level and
 * part-level hooks are the ones interaction code uses.
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
function lineToRect(line: PlacedLine, attr: string): string {
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
function curveToPath(curve: PlacedCurve, attr: string, strict: boolean): string {
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
      Math.sign(bulge) * Math.min(spaces(cap), Math.max(spaces(ABCJS_ARC.minBulge), flatten))
    const t = spaces(ABCJS_ARC.thickness)
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
    if (g === undefined) return { path: GLYPHS[name].path, scale: 1 }
    return { path: g.path, scale: 1 / g.unitsPerSpace }
  }

  /**
   * Each distinct glyph outline, in first-use order, so `<defs>` can emit it once.
   *
   * Keyed by glyph NAME rather than by path text: two names never share an outline, and
   * hashing kilobytes of path data per glyph to discover that would cost more than it
   * saves.
   */
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
    const total = strict ? ink.scale : (scale ?? 1) * ink.scale
    const scaled = total !== 1
    const transform = `translate(${num(x)},${num(corrected)})${scaled ? ` scale(${scaleNum(total)})` : ''}`
    if (!optimize) return `<path${attributes} transform="${transform}" d="${ink.path}"/>`
    // A `<use>` takes a transform, so a scaled glyph dedupes like any other. It used to
    // fall back to an inline path when scaled, which was fine while only a stretched
    // brace was scaled — and stopped being fine the moment abcjs's outlines arrived,
    // since those are in ITS pixels and every one of them carries a scale.
    return scaled
      ? `<use${attributes} href="#${defId(name)}" transform="${transform}"/>`
      : `<use${attributes} href="#${defId(name)}" x="${num(x)}" y="${num(corrected)}"/>`
  }

  /**
   * Attributes for one drawn part. Core names by ELEMENT (`abcts-note` on everything a
   * note draws); abcjs names by PART and adds `data-name` hooks. Both are emitted from
   * the same role, so neither naming is the privileged one.
   */
  const attrs = (elementType: string, role: string | undefined, chordPos?: number): string => {
    if (!abcjs) return ` class="${prefix}-${elementType}"`
    const base = role === undefined ? undefined : ABCJS_CLASSES[role]
    // abcjs appends the chord position to the notehead's own class rather than replacing
    // it: `class="abcjs-notehead abcjs-chord-pos-2"`.
    const cls =
      base !== undefined && chordPos !== undefined ? `${base} abcjs-chord-pos-${chordPos}` : base
    const name = role === undefined ? undefined : ABCJS_DATA_NAMES[role]
    return `${cls ? ` class="${cls}"` : ''}${name ? ` data-name="${name}"` : ''}`
  }

  const parts: string[] = []

  for (const system of doc.systems) {
    // Each system is laid out in its own space and placed by translation, so nothing
    // inside it depends on how many systems precede it. Staves nest the same way, one
    // per voice, because a staff step means a different pitch under a different clef.
    parts.push(
      `<g${abcjs ? '' : ` class="${prefix}-system"`} transform="translate(0,${num(system.originY)})">`,
    )
    // Braces and brackets first: they belong to the SYSTEM, joining staves rather than
    // sitting on one, and they are drawn at the left edge outside the music area.
    // A BRACKET'S STEM. abcjs classes it `abcjs-bracket` and names it `bracket`
    // (`draw/brace.js`, via `classes.generate`), and we emitted neither — so no comparison
    // could reach a bracket at all. Finding 92: the representation was missing a HANDLE.
    for (const line of system.connectorLines) {
      parts.push(
        lineToRect(
          line,
          abcjs ? ' class="abcjs-bracket" data-name="bracket"' : ` class="${prefix}-staff"`,
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
          : `<path${attr} transform="translate(${num(g.x)},${num(g.y)})${scale}" d="${outline(g.name).path}"/>`,
      )
    }
    for (const staff of system.staves) {
      parts.push(
        `<g${abcjs ? '' : ` class="${prefix}-staff-group"`} transform="translate(0,${num(staff.originY)})">`,
      )
      // abcjs classes only the TOP staff line; the other four carry no class at all.
      //
      // Found by the LOWEST y rather than by index. `staffLines[0]` is the BOTTOM line —
      // y is down and the array runs upward — so keying on index 0 put `abcjs-top-line`
      // on the bottom line, four staff spaces from where a stylesheet targeting it would
      // expect. Silent, because the class was present and the count was right.
      const topLine = staff.staffLines.reduce(
        (best, line, i) =>
          line.y1 < (staff.staffLines[best]?.y1 ?? Number.POSITIVE_INFINITY) ? i : best,
        0,
      )
      staff.staffLines.forEach((line, i) => {
        const attr = abcjs
          ? i === topLine
            ? ' class="abcjs-top-line"'
            : ''
          : ` class="${prefix}-staff"`
        parts.push(lineToRect(line, attr))
      })
      for (const beam of staff.beams) {
        parts.push(lineToRect(beam, abcjs ? ' class="abcjs-beam"' : ` class="${prefix}-beam"`))
      }
      for (const line of staff.voltaLines) {
        parts.push(lineToRect(line, abcjs ? ' class="abcjs-ending"' : ` class="${prefix}-volta"`))
      }
      for (const t of staff.voltaTexts) {
        parts.push(
          `<text${abcjs ? ' class="abcjs-ending"' : ` class="${prefix}-volta"`} x="${num(t.x)}" ` +
            `y="${num(t.y)}" font-family="serif" font-size="${num(t.size)}">${escapeText(t.text)}</text>`,
        )
      }
      // ABCJS CALLS IT A TRIPLET, whatever the number — `classes.generate('triplet ' +
      // durationClass)` on the group and `data-name="triplet-bracket"` on the path
      // (`draw/triplet.js:7-9`, `:42`). Ours said `abcjs-tuplet`, which is the right word
      // for the concept and the wrong one for compat: a stylesheet written against abcjs
      // selects `.abcjs-triplet`, and no comparison could match the bracket either.
      for (const line of staff.tupletLines) {
        parts.push(
          lineToRect(
            line,
            abcjs
              ? ' class="abcjs-triplet" data-name="triplet-bracket"'
              : ` class="${prefix}-tuplet"`,
          ),
        )
      }
      // Never present in strict mode, where abcjs prints a literal `_` instead — so this
      // reuses abcjs's lyric class rather than inventing one it has no counterpart for.
      for (const line of staff.melismaLines) {
        parts.push(lineToRect(line, abcjs ? ' class="abcjs-lyric"' : ` class="${prefix}-lyric"`))
      }
      // Hairpins and glissandi. THE COMMENT HERE USED TO SAY "abcjs paints these with no
      // class of its own" — reasoned, never measured, and its own output denies it:
      // `drawCrescendo` passes `classes.generate('dynamics decoration')` and
      // `"data-name": "dynamics"` (`draw/crescendo.js:34`), which comes out as
      // `class="abcjs-decoration abcjs-dynamics …" data-name="dynamics"`. A glissando is
      // `data-name="glissando"` on the same footing.
      for (const line of staff.spannerLines) {
        const named = line.role === 'dynamic' ? 'dynamics' : 'glissando'
        const cls = line.role === 'dynamic' ? 'abcjs-decoration abcjs-dynamics' : 'abcjs-glissando'
        parts.push(
          lineToRect(
            line,
            abcjs ? ` class="${cls}" data-name="${named}"` : ` class="${prefix}-decoration"`,
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
      for (const t of staff.tupletTexts) {
        const style = `${t.bold ? ' font-weight="bold"' : ''}${t.italic ? ' font-style="italic"' : ''}`
        const anchor = t.anchor === undefined ? '' : ` text-anchor="${t.anchor}"`
        parts.push(
          `<text${abcjs ? ` data-name="${escapeText(t.text)}"` : ` class="${prefix}-tuplet"`}` +
            `${anchor} x="${num(t.x)}" ` +
            `y="${num(t.y)}" font-family="serif" font-size="${num(t.size)}"${style}>${escapeText(t.text)}</text>`,
        )
      }
      for (const curve of staff.curves) {
        parts.push(
          curveToPath(
            curve,
            abcjs ? ` class="abcjs-${curve.kind}"` : ` class="${prefix}-${curve.kind}"`,
            strict,
          ),
        )
      }

      staff.elements.forEach((el, index) => {
        // abcjs wraps each element in a group carrying its kind and index, which is what
        // its interaction code walks. Core's own naming needs no wrapper.
        if (abcjs) {
          const name = ABCJS_ELEMENT_NAMES[el.type] ?? el.type
          parts.push(`<g data-name="${name}" data-index="${index}">`)
        }
        for (const line of el.lines) parts.push(lineToRect(line, attrs(el.type, line.role)))
        for (const g of el.glyphs) {
          // The glyph path is authored at the origin, so a placement is all that is needed.
          parts.push(glyphMarkup(g.name, g.x, g.y, g.scale, attrs(el.type, g.role, g.chordPos)))
        }
        // Prose is a real <text> in a generic family, unlike musical glyphs, which are
        // paths so the SVG stays self-contained. A missing serif face falls back to
        // another serif; a missing Bravura falls back to nothing legible. See layout.ts.
        for (const t of el.texts) {
          const style =
            (t.bold ? ' font-weight="bold"' : '') + (t.italic ? ' font-style="italic"' : '')
          parts.push(
            `<text${attrs(el.type, 'text')} x="${num(t.x)}" y="${num(t.y)}" ` +
              `font-family="serif" font-size="${num(t.size)}"${style}` +
              // Only the top-text block sets one; the music's own text is all left-aligned.
              `${t.anchor === undefined || t.anchor === 'start' ? '' : ` text-anchor="${t.anchor}"`}` +
              `>${t.jazz === undefined ? escapeText(t.text) : jazzChordMarkup(t.jazz, num(t.x))}</text>`,
          )
        }
        if (abcjs) parts.push('</g>')
      })
      parts.push('</g>')
    }
    parts.push('</g>')
  }

  const w = options.pageWidth ?? doc.width * scale
  const h = doc.height * scale
  // The viewBox must widen with the page, or forcing the width would just scale the
  // music up to fill it instead of leaving the margin abcjs leaves.
  const viewWidth = options.pageWidth === undefined ? doc.width : options.pageWidth / scale
  // viewBox carries the staff-space coordinate system, including the negative y above
  // the middle line, so nothing downstream has to know about the origin offset.
  const viewBox = `0 ${num(doc.top)} ${num(viewWidth)} ${num(doc.height)}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${abcjs ? '' : ` class="${escapeAttr(prefix)}"`} ` +
    `width="${num(w)}" height="${num(h)}" viewBox="${viewBox}">` +
    // Built while walking the music, so it can only be serialised now that the walk is
    // done — which is why `parts` is assembled first and the document assembled last.
    (glyphDefs.size === 0
      ? ''
      : `<defs>${[...glyphDefs]
          .map(([name, id]) => `<path id="${id}" d="${outline(name).path}"/>`)
          .join('')}</defs>`) +
    `<g fill="currentColor">${parts.join('')}</g>` +
    `</svg>`
  )
}
