// THE PER-NOTEHEAD PROBE. Not a gate — it writes a table and always passes.
//
// The ranked table gives one number per fixture and `measure()` gives four, and neither
// can tell a LINE-START difference from a per-note SPACING one. This prints every paired
// notehead's x and y against abcjs's, in the order the gate pairs them, so the shape is
// readable: a dx that resets at each system is a prefix, one that grows monotonically
// inside a system is spacing, and a constant one is an offset.
//
//   SCRATCH_FIXTURE='little swallow' npx vitest run tests/notehead-dx.test.ts
//   cat /tmp/abcts-notehead-dx.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { absolutePixels, byClass } from './pixel-geometry.js'

const corpusDir = '../abcMusicKit/Tools/abcjs-debug/fixtures'
const goldensDir = '../abcMusicKit/Tools/abcjs-debug/golden'

describe('per-notehead probe', () => {
  it('writes the paired notehead table', () => {
    const name = process.env.SCRATCH_FIXTURE ?? 'little swallow'
    const abc = readFileSync(join(corpusDir, `${name}.abc`), 'utf-8')
    const golden = byClass(
      absolutePixels(readFileSync(join(goldensDir, `${name}.svg`), 'utf-8')),
      'notehead',
    )
    const ours = byClass(absolutePixels(renderAbc('paper', abc, {})[0]?.svg ?? ''), 'notehead')
    const pad = (n: number, w = 8) => n.toFixed(2).padStart(w)
    const rows: string[] = []
    for (let i = 0; i < Math.min(golden.length, ours.length); i++) {
      const g = golden[i]
      const o = ours[i]
      if (g === undefined || o === undefined) continue
      rows.push(
        `${String(i).padStart(4)} gx=${pad(g.x)} ox=${pad(o.x)} dx=${pad(o.x - g.x)}  gy=${pad(g.y)} dy=${pad(o.y - g.y, 7)}`,
      )
    }
    writeFileSync('/tmp/abcts-notehead-dx.txt', `${name}\n${rows.join('\n')}\n`)
  })
})
