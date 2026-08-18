import type { AbcjsGlyph } from './glyphs-abcjs.js'

/**
 * **`setGlyph(name, glyph)` — a host REPLACING one of abcjs's outlines.**
 *
 * abcjs's is one line — `glyphs[name] = path` (`write/creation/glyphs.js:221`) — because
 * its table IS the drawing data: `{d: [['M', 4.83, -14.97], ['c', …]], w, h}`, segment
 * arrays it joins into a `d` string at draw time and measures with the published `w`.
 *
 * Ours keeps the joined path and a DERIVED ink box, because a glyph cannot be placed
 * vertically without an origin offset and abcjs ships none (see
 * `scripts/gen-abcjs-glyphs.mjs`). So this does what the generator does, at run time, for
 * the one glyph a host hands in — the same walk over the same four commands.
 *
 * **THE OVERRIDE IS MODULE STATE AND SO IS abcjs's.** It applies to every render after it,
 * in draw order, exactly as writing into abcjs's own table does.
 */
export type AbcjsPathSegment = [string, ...number[]]
export interface HostGlyph {
  readonly d: readonly AbcjsPathSegment[]
  readonly w: number
  readonly h: number
}

const overrides = new Map<string, AbcjsGlyph>()

/**
 * abcjs's own join, and **THE WHOLE SEGMENT IS JOINED, NOT THE COMMAND PLUS ITS NUMBERS** —
 * `path += pathArray[i].join(" ")` (`write/creation/glyphs.js:139`). The difference is a
 * bare `['z']`: joining the array gives `"z"` and writing `${cmd} ${rest.join(' ')}` gives
 * `"z "`, so every closed subpath would carry a trailing space and the markup would differ one
 * byte per `z`. Measured against abcjs's own render of a swapped notehead.
 */
const toPath = (d: readonly AbcjsPathSegment[]): string =>
  d.map((seg) => seg.join(' ')).join('')

/**
 * The ink box, walked from the segment arrays — the generator's `boundingBox`, and its
 * comment applies here too: control points are INCLUDED rather than solved for, so a cubic
 * stays inside its hull and the box is a safe over-estimate that never clips.
 */
function boundingBox(d: readonly AbcjsPathSegment[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let x = 0
  let y = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const hit = (px: number, py: number): void => {
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }
  for (const seg of d) {
    const [cmd, ...n] = seg
    switch (cmd) {
      case 'M':
        x = n[0] ?? 0
        y = n[1] ?? 0
        hit(x, y)
        break
      case 'm':
      case 'l':
        x += n[0] ?? 0
        y += n[1] ?? 0
        hit(x, y)
        break
      case 'c':
        // Three relative point pairs; the first two are controls.
        hit(x + (n[0] ?? 0), y + (n[1] ?? 0))
        hit(x + (n[2] ?? 0), y + (n[3] ?? 0))
        x += n[4] ?? 0
        y += n[5] ?? 0
        hit(x, y)
        break
      default:
        // `z` closes and moves nothing.
        break
    }
  }
  if (minX === Number.POSITIVE_INFINITY) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function setGlyph(name: string, glyph: HostGlyph): void {
  const box = boundingBox(glyph.d)
  overrides.set(name, {
    path: toPath(glyph.d),
    w: glyph.w,
    h: glyph.h,
    x: box.x,
    y: box.y,
    boxWidth: box.width,
    boxHeight: box.height,
  })
}

/** What the glyph table consults before its own entry. */
export const glyphOverride = (name: string): AbcjsGlyph | undefined => overrides.get(name)

/** Testing seam — abcjs has no way back either, so this is ours and is not on the surface. */
export const clearGlyphOverrides = (): void => {
  overrides.clear()
}
