/**
 * Resolve an SVG's elements to ABSOLUTE PIXELS, the way a browser would.
 *
 * Exists because abcjs and abcts encode the same picture differently: abcjs bakes
 * absolute pixel coordinates into every `d` attribute, while abcts emits a `viewBox` in
 * staff-space units with `translate()` down the tree. Comparing the markup would only
 * ever report "different"; comparing what a browser PUTS ON SCREEN is the real question.
 *
 * So: accumulate `translate()` down the tree, then apply the viewBox -> width/height
 * scale. A glyph's own `scale()` is applied to its outline box — see the note at the
 * transform, and `pathBox` for why an outline box is what gets compared at all.
 *
 * `<use href="#id" x= y=>` counts as the glyph it references, because that is what a
 * browser draws. Without that, an optimized render measures as having no glyphs and any
 * comparison against it passes trivially.
 *
 * Deliberately hand-rolled rather than jsdom: the markup is machine-generated and
 * regular, and a DOM dependency for a coordinate walk is a lot of surface for a sum.
 */
export interface PixelItem {
  readonly tag: string
  readonly cls: string
  readonly x: number
  readonly y: number
  /**
   * The element's BOX, in absolute pixels — absent where it has none (a `<text>`).
   *
   * Added 2026-08-05 with the line-weight gate, and the reason is worth keeping: for
   * months this walk returned CENTRES only, and a line's centre does not move when its
   * thickness changes. Every gate built on it was structurally unable to see that
   * `abcjs-strict` was drawing Bravura's line weights — a thin barline at 1.24px against
   * abcjs's 0.600. A comparison can only catch what its representation can express.
   */
  readonly w?: number
  readonly h?: number
}

export interface PixelDoc {
  readonly width: number | null
  readonly height: number | null
  readonly items: PixelItem[]
}

/**
 * Centre of a path's bounding box, in the path's own units.
 *
 * WHY A BOUNDING BOX AND NOT THE `M`. The two engines put their glyphs on the page by
 * different references, and comparing those references compares different points on the
 * same shape. abcjs bakes absolute coordinates into `d`, so its first `M` is wherever that
 * outline's contour happens to start — for `noteheads.quarter` that is the TOP of the
 * ellipse, 4.035px above its centre. abcts authors every outline at the origin and places
 * it with a translate, so its reference is the glyph ORIGIN, which for a notehead is the
 * vertical centre. Comparing one against the other reported a ~4px bias as agreement, and
 * hid a real vertical offset of the same size underneath it.
 *
 * The box centre is the one point both engines can be asked for, because both embed the
 * actual outline: abcjs inline, abcts in `<defs>` behind a `<use>`. Control points are
 * included rather than solved for — a Bézier's hull bounds its curve, both engines' hulls
 * are tight on these shapes, and the error is common to both sides anyway.
 */
function pathBox(d: string): { x: number; y: number; w: number; h: number } | null {
  const tokens = d.match(/[MmCcLlHhVvSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  if (tokens === null) return null
  let x = 0
  let y = 0
  let cmd = ''
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const mark = (px: number, py: number): void => {
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  }
  const num = (i: number): number => Number(tokens[i] ?? 0)
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i] ?? ''
    if (/[A-Za-z]/.test(token)) {
      cmd = token
      i += 1
      if (cmd === 'Z' || cmd === 'z') mark(x, y)
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T': {
        const nx = num(i)
        const ny = num(i + 1)
        i += 2
        x = rel ? x + nx : nx
        y = rel ? y + ny : ny
        mark(x, y)
        // A repeated coordinate pair after M is an implicit L.
        if (cmd === 'M') cmd = 'L'
        else if (cmd === 'm') cmd = 'l'
        break
      }
      case 'H': {
        const nx = num(i)
        i += 1
        x = rel ? x + nx : nx
        mark(x, y)
        break
      }
      case 'V': {
        const ny = num(i)
        i += 1
        y = rel ? y + ny : ny
        mark(x, y)
        break
      }
      case 'C': {
        for (let k = 0; k < 3; k++) {
          mark(
            rel ? x + num(i + k * 2) : num(i + k * 2),
            rel ? y + num(i + k * 2 + 1) : num(i + k * 2 + 1),
          )
        }
        const ex = num(i + 4)
        const ey = num(i + 5)
        i += 6
        x = rel ? x + ex : ex
        y = rel ? y + ey : ey
        break
      }
      case 'S':
      case 'Q': {
        for (let k = 0; k < 2; k++) {
          mark(
            rel ? x + num(i + k * 2) : num(i + k * 2),
            rel ? y + num(i + k * 2 + 1) : num(i + k * 2 + 1),
          )
        }
        const ex = num(i + 2)
        const ey = num(i + 3)
        i += 4
        x = rel ? x + ex : ex
        y = rel ? y + ey : ey
        break
      }
      case 'A': {
        const ex = num(i + 5)
        const ey = num(i + 6)
        i += 7
        x = rel ? x + ex : ex
        y = rel ? y + ey : ey
        mark(x, y)
        break
      }
      default:
        i += 1
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
}

export function absolutePixels(svg: string): PixelDoc {
  const dim = /width="([\d.]+)"\s+height="([\d.]+)"/.exec(svg)
  const vb = /viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/.exec(svg)
  const W = dim?.[1] !== undefined ? +dim[1] : null
  const H = dim?.[2] !== undefined ? +dim[2] : null
  const [vx = 0, vy = 0, vw = W ?? 1, vh = H ?? 1] = vb ? vb.slice(1).map(Number) : []
  const sx = W && vw ? W / vw : 1,
    sy = H && vh ? H / vh : 1

  // `<defs>` outlines, by id, so a `<use>` can be resolved to the shape it draws.
  const defs = new Map<string, { x: number; y: number }>()
  for (const m of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? ''
    const id = /\sid="([^"]+)"/.exec(attrs)?.[1]
    const d = /\sd="([^"]+)"/.exec(attrs)?.[1]
    if (id !== undefined && d !== undefined) {
      const box = pathBox(d)
      if (box !== null) defs.set(id, box)
    }
  }

  const out: PixelItem[] = []
  const stack = [{ x: 0, y: 0 }]
  // `<defs>` holds DEFINITIONS. A browser draws none of it directly — only the `<use>`
  // elements that reference it — so counting its contents would report every deduplicated
  // outline twice: once where it is defined and once where it is placed.
  let inDefs = false
  // Machine-generated markup: only translate(), only well-formed tags.
  const tagRe = /<(\/?)(\w+)([^>]*?)(\/?)>/g
  for (const m of svg.matchAll(tagRe)) {
    const [, close, tag = '', attrs = '', selfClose] = m
    if (close) {
      if (tag === 'g') stack.pop()
      if (tag === 'defs') inDefs = false
      continue
    }
    if (tag === 'defs') {
      inDefs = true
      continue
    }
    if (inDefs) continue
    const tr = /transform="translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(attrs)
    // `scale()` MATTERS now that a glyph's box offset is added to its placement. It did
    // not before, when the placement WAS the translate — hence the old note here saying a
    // scale "affects its own outline, not where it sits". Half true: it affects where
    // every point of that outline sits relative to the origin, which is exactly what the
    // box centre is. abcjs's own outlines are in ITS pixels, so every one of them carries
    // `scale(1/7.75)`; ignoring it put the box offset 7.75x too far out.
    const sc = /transform="[^"]*scale\(\s*([-\d.]+)/.exec(attrs)
    const scale = sc?.[1] !== undefined ? +sc[1] : 1
    const top = stack[stack.length - 1] ?? { x: 0, y: 0 }
    const here =
      tr?.[1] !== undefined && tr[2] !== undefined ? { x: top.x + +tr[1], y: top.y + +tr[2] } : top
    if (tag === 'g' && !selfClose) {
      stack.push(here)
      continue
    }

    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? ''
    let lx: number | null = null
    let ly: number | null = null
    let lw: number | null = null
    let lh: number | null = null
    if (tag === 'path') {
      // The BOX CENTRE of the outline, whichever engine wrote it — see `pathBox`.
      //
      //   abcjs bakes ABSOLUTE coordinates into `d` and uses no transform, so the box is
      //   already in page coordinates and the accumulated transform is zero.
      //   abcts authors every outline at the ORIGIN and places it with a translate, so the
      //   box is outline-local and the transform carries it into place.
      //
      // Either way the two add, and the result is the same point on the same shape. Taking
      // the `M` instead compared abcjs's contour START against abcts's glyph ORIGIN — for
      // a notehead, its top against its centre, a 4.035px bias that read as agreement.
      const d = /\sd="([^"]+)"/.exec(attrs)?.[1]
      const box = d === undefined ? null : pathBox(d)
      if (box !== null) {
        lx = box.x * scale
        ly = box.y * scale
        lw = box.w * scale
        lh = box.h * scale
      }
    } else if (tag === 'rect') {
      // CENTRE, like a path's box — abcts draws a staff line as a `<rect>` where abcjs
      // draws the same line as a filled `<path>`, and comparing a rect's top edge against
      // a path's box centre offsets every rule by half its thickness.
      const x = /\sx="([-\d.]+)"/.exec(attrs)
      const y = /\sy="([-\d.]+)"/.exec(attrs)
      const w = /\swidth="([-\d.]+)"/.exec(attrs)
      const h = /\sheight="([-\d.]+)"/.exec(attrs)
      if (x?.[1] !== undefined && y?.[1] !== undefined) {
        lx = +x[1] + (w?.[1] !== undefined ? +w[1] / 2 : 0)
        ly = +y[1] + (h?.[1] !== undefined ? +h[1] / 2 : 0)
        lw = w?.[1] === undefined ? null : +w[1]
        lh = h?.[1] === undefined ? null : +h[1]
      }
    } else if (tag === 'use') {
      // `<use href="#g0" x= y=>` — a browser resolves this to the referenced outline
      // placed at x/y, so for a coordinate walk it IS the glyph. Without this, an
      // optimized render would measure as having no glyphs at all and every comparison
      // against it would trivially "pass".
      //
      // The referenced outline's BOX CENTRE is added for the same reason a `<path>`'s is:
      // a `<use>` and an inline `<path>` of the same glyph must measure to the same point,
      // or turning `<defs>` dedup on would move the drawing.
      const href = /\s(?:xlink:href|href)="#([^"]+)"/.exec(attrs)?.[1]
      const box = href === undefined ? undefined : defs.get(href)
      const x = /\sx="([-\d.]+)"/.exec(attrs)
      const y = /\sy="([-\d.]+)"/.exec(attrs)
      const px = x?.[1] !== undefined ? +x[1] : tr ? 0 : null
      const py = y?.[1] !== undefined ? +y[1] : tr ? 0 : null
      if (px !== null && py !== null) {
        lx = px + (box?.x ?? 0) * scale
        ly = py + (box?.y ?? 0) * scale
      }
    } else if (tag === 'text') {
      const x = /\sx="([-\d.]+)"/.exec(attrs),
        y = /\sy="([-\d.]+)"/.exec(attrs)
      if (x?.[1] !== undefined && y?.[1] !== undefined) {
        lx = +x[1]
        ly = +y[1]
      }
    }
    if (lx === null || ly === null) continue
    out.push({
      tag,
      cls,
      x: (here.x + lx - vx) * sx,
      y: (here.y + ly - vy) * sy,
      ...(lw === null ? {} : { w: lw * sx }),
      ...(lh === null ? {} : { h: lh * sy }),
    })
  }
  return { width: W, height: H, items: out }
}

/** Every element whose class contains `needle`, in document order. */
export const byClass = (doc: PixelDoc, needle: string): { x: number; y: number }[] =>
  doc.items
    .filter((item) => item.cls.includes(needle))
    .map((item) => ({ x: +item.x.toFixed(2), y: +item.y.toFixed(2) }))
