/**
 * Visual baselines — a readable geometry snapshot of a rendered score.
 *
 * THE SECOND HALF OF THE RENDER GATE. The structural gate compares element sequence and
 * staff positions against abcjs and so catches output that is WRONG. It sees no geometry
 * at all: spacing, stem direction and length, ledger lines, glyph choice and the drawing
 * bounds are all invisible to it. This catches output that has CHANGED.
 *
 * Both are needed and neither substitutes. A baseline committed from unverified output
 * locks the bug in — which is why these were deliberately deferred until the structural
 * gate was passing 40 of 41 and the output had been looked at.
 *
 * WHY GEOMETRY AND NOT PIXELS OR SVG:
 *  - Pixels need a rasterizer. There is none in this toolchain, and adding one to compare
 *    images would produce binary diffs no reviewer can read.
 *  - Full SVG embeds ~40KB of glyph path data per fixture. Regenerating glyphs would then
 *    churn all 41 baselines at once and bury a real position change in the noise. Glyph
 *    outlines are version-controlled in `glyphs.ts` already; git covers that file.
 *
 * So this records WHERE things are and WHICH glyph was chosen, one item per line, which
 * diffs precisely: a stem that moves shows as one changed line naming the stem.
 */

import type { Score } from '../../src/core/model.js'
import { type Layout, layout } from '../../src/renderer/layout.js'

/** Fixed precision so a baseline never churns on floating-point noise. */
const n = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(3)
}

/**
 * A score's geometry as text.
 *
 * The drawing bounds are recorded first and deliberately: a fixed margin used to CLIP
 * high ledger lines and tempo marks out of the output entirely, and nothing caught it.
 * A change to what fits in the box is exactly the kind of regression this exists for.
 */
export function snapshot(score: Score): string {
  const doc: Layout = layout(score)
  const lines: string[] = [
    `bounds  width=${n(doc.width)} height=${n(doc.height)} top=${n(doc.top)}`,
    `systems ${doc.systems.length}`,
  ]

  doc.systems.forEach((system, index) => {
    lines.push(`system ${index} width=${n(system.width)} originY=${n(system.originY)}`)
    system.staves.forEach((staff, staffIndex) => {
      lines.push(`  staff ${staffIndex} originY=${n(staff.originY)}`)
      for (const line of staff.staffLines) {
        lines.push(
          `    staffline ${n(line.x1)},${n(line.y1)} -> ${n(line.x2)},${n(line.y2)} t=${n(line.thickness)}`,
        )
      }
      for (const beam of staff.beams) {
        lines.push(
          `    beam   ${n(beam.x1)},${n(beam.y1)} -> ${n(beam.x2)},${n(beam.y2)} t=${n(beam.thickness)}`,
        )
      }
      for (const l of staff.tupletLines) {
        lines.push(
          `    tupletline ${n(l.x1)},${n(l.y1)} -> ${n(l.x2)},${n(l.y2)} t=${n(l.thickness)}`,
        )
      }
      for (const t of staff.tupletTexts) {
        lines.push(`    tuplettext ${n(t.x)},${n(t.y)} size=${n(t.size)} ${JSON.stringify(t.text)}`)
      }
      for (const c of staff.curves) {
        lines.push(
          `    ${c.kind}  ${n(c.x1)},${n(c.y1)} -> ${n(c.x2)},${n(c.y2)} bulge=${n(c.bulge)}`,
        )
      }
      for (const el of staff.elements) {
        const steps = el.staffSteps.length > 0 ? `@${el.staffSteps.join(',')}` : ''
        lines.push(`    ${el.type}${steps} x=${n(el.x)} w=${n(el.width)}`)
        for (const g of el.glyphs) {
          const scale = g.scale === undefined || g.scale === 1 ? '' : ` scale=${n(g.scale)}`
          lines.push(`      glyph ${g.name} ${n(g.x)},${n(g.y)}${scale}`)
        }
        for (const l of el.lines) {
          lines.push(
            `      line  ${n(l.x1)},${n(l.y1)} -> ${n(l.x2)},${n(l.y2)} t=${n(l.thickness)}`,
          )
        }
        for (const t of el.texts) {
          const style = `${t.bold ? ' bold' : ''}${t.italic ? ' italic' : ''}`
          lines.push(
            `      text  ${n(t.x)},${n(t.y)} size=${n(t.size)}${style} ${JSON.stringify(t.text)}`,
          )
        }
      }
    })
  })

  return `${lines.join('\n')}\n`
}
