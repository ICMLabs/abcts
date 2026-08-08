/**
 * THE RENDER BENCHMARK — a before-number for a refactor that has not happened yet.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * Not because anything is slow. Measured on 2026-08-08, the whole of both corpora —
 * 220 tunes, `ragtime-nightingale`'s 2,009 noteheads included — renders in **151ms, 0.7ms
 * a tune**. That is the point: the number is recorded BEFORE a structural pass so that
 * "did the refactor cost anything" is answerable rather than arguable. A calibration knob,
 * left in place because the alternative is re-deriving the baseline from memory afterwards.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * It does not ASSERT a time. A timing assertion is flaky on a shared machine and would
 * teach the next reader to ignore this file. What it does assert is that all 220 tunes
 * render without throwing — which no other gate states directly, because the ranked tables
 * compare geometry on the ones that survive.
 *
 * ── AND WHAT NOT TO OPTIMISE ─────────────────────────────────────────────────
 * The dominant cost is `lineAt()` running a full layout up to NINE times per line, and it
 * is not a defect: finding 104 is that abcjs performs eight layouts and DISCARDS the ninth
 * spacing it solves for, and reproducing that is what put seven fixtures on the corpus.
 * Collapsing the loop would be the single largest parity regression available. If this
 * number ever has to come down, it comes down somewhere else.
 *
 *     npx vitest run tests/bench.test.ts   # prints the timing; /tmp/abcts-bench.txt
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { corpusDir } from './corpus/corpus.js'

const harvestedDir = join(import.meta.dirname, 'corpus-abcjs', 'fixtures')

const tunesOf = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.abc'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf-8'))

describe('render benchmark', () => {
  it('renders both corpora without throwing, and records how long it took', () => {
    const tunes = [...tunesOf(corpusDir), ...tunesOf(harvestedDir)]
    expect(tunes.length).toBeGreaterThan(200)

    // One warm pass: the first render pays for module init and the glyph tables, and
    // timing that in would make the number depend on which file vitest loaded first.
    renderAbc('paper', tunes[0] as string, {})

    const failures: string[] = []
    const started = process.hrtime.bigint()
    for (const [i, abc] of tunes.entries()) {
      try {
        renderAbc('paper', abc, {})
      } catch (error) {
        failures.push(`${i}: ${(error as Error).message}`)
      }
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6

    writeFileSync(
      '/tmp/abcts-bench.txt',
      `${tunes.length} tunes in ${ms.toFixed(0)}ms (${(ms / tunes.length).toFixed(2)}ms each)\n`,
    )
    // THE REAL ASSERTION. A tune that stops rendering at all would otherwise only show up
    // as a missing row in a ranked table, which is easy to read as "not measured".
    expect(failures).toEqual([])
  })
})
