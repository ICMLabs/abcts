// How many BAR elements each voice of a shared staff draws — the 36-vs-24 probe.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '../src/parser/parser.js'
import { layout } from '../src/renderer/layout.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-selection', 'golden.json'), 'utf-8')) as { slug: string; abc: string }[]
const abc = G.find((c) => c.slug === 'selection-multiple')!.abc
const p = parse(abc, { mode: 'abcjs-strict' })
const doc = layout(p.scores[0]!, { mode: 'abcjs-strict' })
doc.systems.forEach((sys, si) =>
  sys.staves.forEach((st, sti) =>
    st.voices.forEach((v, vi) => {
      const bars = v.filter((e) => e.type === 'bar')
      if (bars.length > 0) console.log(`system ${si} staff ${sti} voice ${vi}: ${bars.length} bars`)
    }),
  ),
)
