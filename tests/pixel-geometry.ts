/**
 * Resolve an SVG's elements to ABSOLUTE PIXELS, the way a browser would.
 *
 * Exists because abcjs and abcts encode the same picture differently: abcjs bakes
 * absolute pixel coordinates into every `d` attribute, while abcts emits a `viewBox` in
 * staff-space units with `translate()` down the tree. Comparing the markup would only
 * ever report "different"; comparing what a browser PUTS ON SCREEN is the real question.
 *
 * So: accumulate `translate()` down the tree, then apply the viewBox -> width/height
 * scale. Only `translate` is handled, which is all either engine emits — a `scale()` on
 * a glyph affects its own outline, not where it sits.
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
}

export interface PixelDoc {
  readonly width: number | null
  readonly height: number | null
  readonly items: PixelItem[]
}

export function absolutePixels(svg: string): PixelDoc {
  const dim = /width="([\d.]+)"\s+height="([\d.]+)"/.exec(svg)
  const vb = /viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/.exec(svg)
  const W = dim?.[1] !== undefined ? +dim[1] : null
  const H = dim?.[2] !== undefined ? +dim[2] : null
  const [vx = 0, vy = 0, vw = W ?? 1, vh = H ?? 1] = vb ? vb.slice(1).map(Number) : []
  const sx = W && vw ? W / vw : 1,
    sy = H && vh ? H / vh : 1

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
    if (tag === 'path') {
      // WHERE a path is drawn depends on which engine wrote it, and conflating the two
      // silently compares different things.
      //
      //   abcjs bakes ABSOLUTE coordinates into `d` and uses no transform, so the `M`
      //   is the position.
      //   abcts authors every glyph outline at the ORIGIN and places it with a
      //   translate, so the transform is the position and the `M` is outline-local —
      //   whatever arbitrary point on the contour the outline happens to start from.
      //
      // A path carrying its own translate is therefore positioned BY that translate and
      // its `M` must be ignored. Adding both put each abcts glyph off by its outline's
      // start point. That cancels out of a same-glyph SPREAD, which is why the pixel
      // gate's numbers were unaffected — and it would not have cancelled the moment
      // anything compared absolute positions, or compared a `<path>` against a `<use>`.
      if (tr) {
        lx = 0
        ly = 0
      } else {
        const d = /\sd="M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(attrs)
        if (d?.[1] !== undefined && d[2] !== undefined) {
          lx = +d[1]
          ly = +d[2]
        }
      }
    } else if (tag === 'rect') {
      const x = /\sx="([-\d.]+)"/.exec(attrs),
        y = /\sy="([-\d.]+)"/.exec(attrs)
      if (x?.[1] !== undefined && y?.[1] !== undefined) {
        lx = +x[1]
        ly = +y[1]
      }
    } else if (tag === 'use') {
      // `<use href="#g0" x= y=>` — a browser resolves this to the referenced outline
      // placed at x/y, so for a coordinate walk it IS the glyph. Without this, an
      // optimized render would measure as having no glyphs at all and every comparison
      // against it would trivially "pass".
      const x = /\sx="([-\d.]+)"/.exec(attrs)
      const y = /\sy="([-\d.]+)"/.exec(attrs)
      if (x?.[1] !== undefined && y?.[1] !== undefined) {
        lx = +x[1]
        ly = +y[1]
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
    out.push({ tag, cls, x: (here.x + lx - vx) * sx, y: (here.y + ly - vy) * sy })
  }
  return { width: W, height: H, items: out }
}

/** Every element whose class contains `needle`, in document order. */
export const byClass = (doc: PixelDoc, needle: string): { x: number; y: number }[] =>
  doc.items
    .filter((item) => item.cls.includes(needle))
    .map((item) => ({ x: +item.x.toFixed(2), y: +item.y.toFixed(2) }))
