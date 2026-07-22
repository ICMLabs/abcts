/**
 * Generate `src/renderer/glyphs-abcjs.ts` from abcjs's own glyph table.
 *
 * WHY A SECOND GLYPH TABLE. abcts draws Bravura, which is the better font and carries
 * glyphs abcjs simply does not have. But a font is not only outlines — its ADVANCES feed
 * layout, and abcjs's differ from Bravura's by -13% to +12%:
 *
 *     noteheads.quarter  1.2658 spaces   noteheadBlack   1.1800   -6.8%
 *     noteheads.whole    1.9335           noteheadWhole   1.6880  -12.7%
 *     flags.d8th         1.0957           flag8thDown     1.2240  +11.7%
 *
 * So the font choice is an INPUT to the engraving, not a rendering asset downstream of
 * it. Byte parity with abcjs is unreachable while drawing Bravura, and so is position
 * parity — borrowing abcjs's advances while drawing Bravura outlines would only put
 * correctly-sized gaps around wrongly-sized shapes.
 *
 * Hence two tables, selected by mode: abcjs's for the parity build, Bravura for
 * `abc2.1`/`extended` where being better matters more than being identical.
 *
 * Run: node scripts/gen-abcjs-glyphs.mjs
 *
 * Source: abcjs 6.6.3 `src/write/creation/glyphs.js`, MIT. Read as data, not ported —
 * this reproduces the table, not the code around it.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const config = JSON.parse(readFileSync('./abcts.config.json', 'utf-8'))
const SOURCE = `${config.abcjsRef ?? '../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3'}/src/write/creation/glyphs.js`

// The module exports helpers; the table itself is the `glyphs` local. Re-read the file
// and evaluate just the object literal rather than reaching into module internals.
const text = readFileSync(SOURCE, 'utf-8')
const start = text.indexOf('var glyphs =')
const end = text.indexOf('\n};', start)
if (start === -1 || end === -1) throw new Error('could not locate the glyph table')
const table = eval(`(${text.slice(text.indexOf('{', start), end + 2)})`)

/**
 * abcjs stores each outline as segment arrays — `[['M', 4.83, -14.97], ['c', …]]`. The
 * `d` string it draws is those joined with the command letter, a space, the numbers
 * space-separated, and NO separator between segments.
 */
const toPath = (d) => d.map((seg) => `${seg[0]} ${seg.slice(1).join(' ')}`).join('')

/**
 * Ink bounding box, walked from the segment arrays.
 *
 * abcjs publishes `w` and `h` but no ORIGIN offset, and a renderer cannot place a glyph
 * vertically without knowing where its ink sits relative to the point it is drawn at —
 * Bravura's table carries `x`/`y` for exactly that. So it is derived here.
 *
 * Control points are included rather than solved for: a cubic stays inside its hull, so
 * the box is a safe over-estimate and never clips. Bravura's boxes are tight, which makes
 * this a small systematic difference in the direction of reserving slightly too much —
 * the safe direction, and the alternative is a cubic extrema solver for a few tenths.
 */
function boundingBox(d) {
  let x = 0
  let y = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const hit = (px, py) => {
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }
  for (const seg of d) {
    const [cmd, ...n] = seg
    switch (cmd) {
      case 'M':
        x = n[0]
        y = n[1]
        hit(x, y)
        break
      case 'm':
        x += n[0]
        y += n[1]
        hit(x, y)
        break
      case 'l':
        x += n[0]
        y += n[1]
        hit(x, y)
        break
      case 'c':
        // Three relative point pairs; the first two are controls.
        hit(x + n[0], y + n[1])
        hit(x + n[2], y + n[3])
        x += n[4]
        y += n[5]
        hit(x, y)
        break
      case 's':
        // Smooth cubic: one control pair then the endpoint, both relative.
        hit(x + n[0], y + n[1])
        x += n[2]
        y += n[3]
        hit(x, y)
        break
      case 'a': {
        // Elliptical arc: rx ry rot largeArc sweep dx dy, the endpoint relative.
        // Bounded by the endpoint plus the radii, which contains any arc between them.
        const [rx, ry] = n
        x += n[5]
        y += n[6]
        hit(x, y)
        hit(x - rx, y - ry)
        hit(x + rx, y + ry)
        break
      }
      case 'z':
        break
      default:
        throw new Error(`unhandled path command ${cmd}`)
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const entries = Object.entries(table)
  .filter(([, g]) => Array.isArray(g?.d))
  .map(([name, g]) => {
    const box = boundingBox(g.d)
    const n = (v) => +v.toFixed(4)
    return (
      `  ${JSON.stringify(name)}: { path: ${JSON.stringify(toPath(g.d))}, ` +
      `w: ${g.w}, h: ${g.h}, x: ${n(box.x)}, y: ${n(box.y)}, ` +
      `boxWidth: ${n(box.width)}, boxHeight: ${n(box.height)} },`
    )
  })

writeFileSync(
  'src/renderer/glyphs-abcjs.ts',
  `/**
 * abcjs 6.6.3's glyph table — outlines and metrics, verbatim.
 *
 * GENERATED by \`scripts/gen-abcjs-glyphs.mjs\`. Do not edit; regenerate.
 *
 * Exists so the default mode can reach byte parity with abcjs. A font's ADVANCES feed
 * layout, and abcjs's differ from Bravura's by -13% to +12%, so matching abcjs's output
 * means using abcjs's glyphs — not Bravura outlines at abcjs's advances, which would put
 * correctly-sized gaps around wrongly-sized shapes. See the generator's header.
 *
 * UNITS ARE abcjs's OWN PIXELS, not staff spaces: one staff space is 7.75 of them
 * (abcjs's STEP is 3.875, a half space). Left unconverted on purpose — the parity build
 * emits abcjs's coordinate system, and rescaling the path data here would change the
 * very bytes this table exists to reproduce.
 *
 * Source: abcjs \`src/write/creation/glyphs.js\`, MIT.
 */

export interface AbcjsGlyph {
  /** SVG path data, in abcjs's pixel units. */
  readonly path: string
  /** Advance width, abcjs pixels. */
  readonly w: number
  /** Height, abcjs pixels. */
  readonly h: number
  /** Ink box left/top relative to the draw origin, abcjs pixels — DERIVED, see the generator. */
  readonly x: number
  readonly y: number
  readonly boxWidth: number
  readonly boxHeight: number
}

/** One staff space, in the units this table is expressed in. abcjs's STEP is half of it. */
export const ABCJS_STAFF_SPACE = 7.75

export const ABCJS_GLYPHS: Readonly<Record<string, AbcjsGlyph>> = {
${entries.join('\n')}
}
`,
)
console.log(`wrote src/renderer/glyphs-abcjs.ts — ${entries.length} glyphs`)
