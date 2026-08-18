// Every accessor row that differs from abcjs -> /tmp/abcts-accessors.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getBarLength, getBeatLength, getBeatsPerMeasure, getBpm, getPickupLength,
  millisecondsPerMeasureOf, timingsOf,
} from '../src/audio/timing.js'
import { parse } from '../src/parser/parser.js'
import { renderAbc } from '../src/compat/index.js'
const G = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'tests', 'corpus-accessors', 'golden.json'), 'utf-8')) as Record<string, Record<string, number>>
const SIB = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const REP = join(import.meta.dirname, '..', 'tests', 'corpus-abcjs', 'fixtures')
const out: string[] = []
for (const [key, want] of Object.entries(G)) {
  if (key.startsWith('sib/S7-voices')) continue
  const corpus = key.slice(0, key.indexOf('/')), rest = key.slice(key.indexOf('/') + 1)
  const at = rest.lastIndexOf('-tune')
  const p = parse(readFileSync(join(corpus === 'sib' ? SIB : REP, `${rest.slice(0, at)}.abc`), 'utf-8'), { mode: 'abcjs-strict' })
  const score = p.ok ? p.scores[Number(rest.slice(at + 5))] : undefined
  if (score === undefined) continue
  // The TOTALS come off the tune object, where a host reads them — `setTiming` walks the
  // DRAWN voices, so a `%%maxStaves` incipit's clock is truncated. See `accessors.test.ts`.
  const slots: string[] = []
  for (let k = 0; k <= Number(rest.slice(at + 5)); k += 1) slots.push('*')
  const tune = renderAbc(slots, readFileSync(join(corpus === 'sib' ? SIB : REP, `${rest.slice(0, at)}.abc`), 'utf-8'), {})[Number(rest.slice(at + 5))]
  tune?.setTiming()
  const t = { totalTime: tune?.getTotalTime(), totalBeats: tune?.getTotalBeats() }
  const got: Record<string, number | undefined> = {
    beatLength: getBeatLength(score), barLength: getBarLength(score),
    beatsPerMeasure: getBeatsPerMeasure(score), bpm: getBpm(score),
    pickupLength: getPickupLength(score), msPerMeasure: millisecondsPerMeasureOf(score),
    msPerMeasure120: millisecondsPerMeasureOf(score, 120),
    totalTime: t.totalTime, totalBeats: t.totalBeats,
  }
  const bad = Object.keys(want).filter((k) => got[k] !== want[k])
  if (bad.length > 0) out.push(`${key}\n  ${bad.map((k) => `${k}: abcjs ${want[k]} ours ${got[k]}`).join('\n  ')}`)
}
writeFileSync('/tmp/abcts-accessors.txt', `${out.length} rows differ\n\n${out.join('\n')}\n`)
console.log(`${out.length} rows differ`)
