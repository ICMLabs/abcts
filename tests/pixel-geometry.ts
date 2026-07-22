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
  // Machine-generated markup: only translate(), only well-formed tags.
  const tagRe = /<(\/?)(\w+)([^>]*?)(\/?)>/g
  for (const m of svg.matchAll(tagRe)) {
    const [, close, tag = '', attrs = '', selfClose] = m
    if (close) {
      if (tag === 'g') stack.pop()
      continue
    }
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
      const d = /\sd="M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(attrs)
      if (d?.[1] !== undefined && d[2] !== undefined) {
        lx = +d[1]
        ly = +d[2]
      } else if (tr) {
        lx = 0
        ly = 0
      } // glyph placed purely by transform
    } else if (tag === 'rect') {
      const x = /\sx="([-\d.]+)"/.exec(attrs),
        y = /\sy="([-\d.]+)"/.exec(attrs)
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
