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

import { GLYPHS } from './glyphs.js'
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
}

/** abcjs's `data-name` hooks, which its interaction code keys on. */
const ABCJS_DATA_NAMES: Readonly<Record<string, string>> = {
  stem: 'stem',
  ledger: 'ledger',
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

const num = (n: number): string => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

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
function curveToPath(curve: PlacedCurve, attr: string): string {
  const { x1, y1, x2, y2, bulge } = curve
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

  /**
   * Attributes for one drawn part. Core names by ELEMENT (`abcts-note` on everything a
   * note draws); abcjs names by PART and adds `data-name` hooks. Both are emitted from
   * the same role, so neither naming is the privileged one.
   */
  const attrs = (elementType: string, role: string | undefined): string => {
    if (!abcjs) return ` class="${prefix}-${elementType}"`
    const cls = role === undefined ? undefined : ABCJS_CLASSES[role]
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
    for (const staff of system.staves) {
      parts.push(
        `<g${abcjs ? '' : ` class="${prefix}-staff-group"`} transform="translate(0,${num(staff.originY)})">`,
      )
      // abcjs classes only the TOP staff line; the other four carry no class at all.
      staff.staffLines.forEach((line, i) => {
        const attr = abcjs ? (i === 0 ? ' class="abcjs-top-line"' : '') : ` class="${prefix}-staff"`
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
      for (const line of staff.tupletLines) {
        parts.push(lineToRect(line, abcjs ? ' class="abcjs-tuplet"' : ` class="${prefix}-tuplet"`))
      }
      // Never present in strict mode, where abcjs prints a literal `_` instead — so this
      // reuses abcjs's lyric class rather than inventing one it has no counterpart for.
      for (const line of staff.melismaLines) {
        parts.push(lineToRect(line, abcjs ? ' class="abcjs-lyric"' : ` class="${prefix}-lyric"`))
      }
      for (const t of staff.tupletTexts) {
        const style = `${t.bold ? ' font-weight="bold"' : ''}${t.italic ? ' font-style="italic"' : ''}`
        parts.push(
          `<text${abcjs ? ' class="abcjs-tuplet"' : ` class="${prefix}-tuplet"`} x="${num(t.x)}" ` +
            `y="${num(t.y)}" font-family="serif" font-size="${num(t.size)}"${style}>${escapeText(t.text)}</text>`,
        )
      }
      for (const curve of staff.curves) {
        parts.push(
          curveToPath(
            curve,
            abcjs ? ` class="abcjs-${curve.kind}"` : ` class="${prefix}-${curve.kind}"`,
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
          // The glyph path is authored at the origin, so a translate is all that is needed.
          parts.push(
            `<path${attrs(el.type, g.role)} transform="translate(${num(g.x)},${num(g.y)})${
              g.scale === undefined || g.scale === 1 ? '' : ` scale(${num(g.scale)})`
            }" d="${GLYPHS[g.name].path}"/>`,
          )
        }
        // Prose is a real <text> in a generic family, unlike musical glyphs, which are
        // paths so the SVG stays self-contained. A missing serif face falls back to
        // another serif; a missing Bravura falls back to nothing legible. See layout.ts.
        for (const t of el.texts) {
          const style =
            (t.bold ? ' font-weight="bold"' : '') + (t.italic ? ' font-style="italic"' : '')
          parts.push(
            `<text${attrs(el.type, 'text')} x="${num(t.x)}" y="${num(t.y)}" ` +
              `font-family="serif" font-size="${num(t.size)}"${style}>${escapeText(t.text)}</text>`,
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
    `<g fill="currentColor">${parts.join('')}</g>` +
    `</svg>`
  )
}
