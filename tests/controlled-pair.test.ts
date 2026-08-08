/**
 * THE CONTROLLED-PAIR PROBE — put a tune of your own beside abcjs's answer to it.
 *
 * The ranked table names a FIXTURE; this is how you split the number it reports into its
 * causes. Write two or three variants of one tune, render each through abcjs's own
 * harness, and read the four axes and the staff-line y side by side. "The same tune with
 * and without its `%%begintext`" is what turned one 45.19px fixture into an 11.43px clef
 * bug and a 33.76px free-text bug, neither of which was visible in the 45.19.
 *
 * ```bash
 * mkdir -p /tmp/abcts-probe
 * printf 'X:1\nK:C\ncd|\n' > /tmp/abcts-probe/a.abc
 * cd ../abcMusicKit/Tools/abcjs-debug
 * for f in /tmp/abcts-probe/*.abc; do
 *   node dump-svg.js --file "$f" --output "${f%.abc}.svg" >/dev/null
 * done
 * cd - && npx vitest run tests/controlled-pair.test.ts && cat /tmp/abcts-probe.txt
 * ```
 *
 * NEVER `--output /dev/null` in that loop: a multi-tune file writes `<output>-tuneN` and
 * litters the sibling repo. It writes its table to `/tmp/abcts-probe.txt` because vitest
 * swallows `console.log` here.
 *
 * A NO-OP WHEN THE DIRECTORY IS ABSENT, which is the normal state — this is a tool, not a
 * gate, and the ranked table and the pixel gate are what assert anything.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels, byClass } from './pixel-geometry.js'

const dir = '/tmp/abcts-probe'

describe('controlled pair', () => {
  it('measures whatever is in /tmp/abcts-probe', () => {
    if (!existsSync(dir)) return
    const rows: string[] = []
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.abc'))
      .sort()) {
      const name = file.replace(/\.abc$/, '')
      if (!existsSync(`${dir}/${name}.svg`)) continue
      const ours = renderAbc('paper', readFileSync(`${dir}/${file}`, 'utf-8'), {})[0]?.svg ?? ''
      const gold = readFileSync(`${dir}/${name}.svg`, 'utf-8')
      const g = byClass(absolutePixels(gold), 'notehead')
      const o = byClass(absolutePixels(ours), 'notehead')
      const n = Math.min(g.length, o.length)
      const delta = (axis: 'x' | 'y'): number[] =>
        g.slice(0, n).map((head, k) => (o[k]?.[axis] ?? 0) - head[axis])
      const avg = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
      const spread = (v: number[]): number => (v.length ? Math.max(...v) - Math.min(...v) : 0)
      // The STAFF LINE, beside the noteheads: a constant offset in both is placement, a
      // constant offset in the noteheads alone would be the glyph.
      const line = (svg: string): string =>
        byClass(absolutePixels(svg), 'top-line')
          .map((l) => l.y.toFixed(2))
          .join(',')
      rows.push(
        `${name}  heads ${o.length}/${g.length}  dy=${spread(delta('y')).toFixed(2)}` +
          ` dx=${spread(delta('x')).toFixed(2)} oy=${avg(delta('y')).toFixed(2)}` +
          ` ox=${avg(delta('x')).toFixed(2)}  topline ours=[${line(ours)}] abcjs=[${line(gold)}]`,
      )
    }
    writeFileSync('/tmp/abcts-probe.txt', rows.join('\n'))
    expect(rows.length).toBeGreaterThanOrEqual(0)
  })
})
