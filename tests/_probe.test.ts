/**
 * SCRATCH — the controlled-pair probe. Reads `/tmp/abcts-probe/*.abc` and the abcjs golden
 * beside each (`<name>.svg`, made by `dump-svg.js`), and prints the four axes plus each
 * engine's staff-line y. Not a gate; delete before committing.
 */
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels, byClass } from './pixel-geometry.js'

const dir = '/tmp/abcts-probe'

describe('probe', () => {
  it('compares', () => {
    writeFileSync('/tmp/abcts-probe.txt', '')
    for (const f of readdirSync(dir)
      .filter((f) => f.endsWith('.abc'))
      .sort()) {
      const name = f.replace(/\.abc$/, '')
      const abc = readFileSync(`${dir}/${f}`, 'utf-8')
      const ours = renderAbc('paper', abc, {})
      const gold = readFileSync(`${dir}/${name}.svg`, 'utf-8')
      const g = byClass(absolutePixels(gold), 'notehead')
      const o = byClass(absolutePixels(ours[0]?.svg ?? ''), 'notehead')
      const n = Math.min(g.length, o.length)
      const dy = g.slice(0, n).map((h, k) => (o[k]?.y ?? 0) - h.y)
      const dx = g.slice(0, n).map((h, k) => (o[k]?.x ?? 0) - h.x)
      const avg = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)
      const spread = (v: number[]): number => (v.length ? Math.max(...v) - Math.min(...v) : 0)
      const gl = byClass(absolutePixels(gold), 'top-line')
      const ol = byClass(absolutePixels(ours[0]?.svg ?? ''), 'top-line')
      appendFileSync(
        '/tmp/abcts-probe.txt',
        `${name}  heads ${o.length}/${g.length}  dy=${spread(dy).toFixed(4)} dx=${spread(dx).toFixed(4)} oy=${avg(dy).toFixed(4)} ox=${avg(dx).toFixed(4)}  topline ours=[${ol.map((l) => l.y.toFixed(4))}] abcjs=[${gl.map((l) => l.y.toFixed(4))}]\n`,
      )
    }
    expect(true).toBe(true)
  })
})
