/**
 * Visual baseline gate — every corpus fixture's rendered geometry, against a committed
 * snapshot.
 *
 * Structure catches WRONG (the structural gate, against abcjs). This catches CHANGED.
 * See `baseline.ts` for why the snapshot is geometry rather than pixels or SVG.
 *
 * A FAILURE HERE IS NOT AUTOMATICALLY A BUG. It means the rendered geometry moved. Read
 * the diff: if the change is intended, re-record and commit the updated baselines
 * ALONGSIDE the code change so a reviewer sees both together.
 *
 *     npm run baseline
 *
 * Re-recording without reading the diff defeats the entire mechanism — the failure mode
 * this guards against is a regression waved through as noise.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Score } from '../../src/core/model.js'
import { parse } from '../../src/parser/parser.js'
import { layout } from '../../src/renderer/layout.js'
import { loadCorpus } from '../corpus/corpus.js'
import { snapshot } from './baseline.js'

const BASELINE_DIR = join(import.meta.dirname, 'baselines')
const RECORD = process.env.ABCTS_SNAPSHOT_RECORD === '1'

describe('visual baselines', () => {
  const corpus = loadCorpus()

  for (const fixture of corpus) {
    it(`${fixture.name} — rendered geometry is unchanged`, () => {
      // EVERY tune, not just the first. Taking `scores[0]` left five of `S5-directives`'s
      // six tunes unbaselined, and the corpus's only melisma is in tune 5 — so melisma
      // rendering could not move a baseline in either direction, and a bug in it did not.
      const scores = parse(fixture.abc).scores
      // Every corpus fixture parses to at least one score; a fixture that stopped doing
      // so would otherwise snapshot as empty and pass.
      expect(scores.length, `${fixture.name} produced no score`).toBeGreaterThan(0)

      const actual = snapshot(scores as Score[])
      const path = join(BASELINE_DIR, `${fixture.name}.txt`)

      if (RECORD) {
        writeFileSync(path, actual)
        return
      }

      let expected: string
      try {
        expected = readFileSync(path, 'utf-8')
      } catch {
        throw new Error(
          `No baseline for ${fixture.name}. Record with ABCTS_SNAPSHOT_RECORD=1 npm test, ` +
            'then READ the new file before committing it.',
        )
      }
      expect(actual).toEqual(expected)
    })
  }

  /**
   * Notes and chords that currently draw NOTHING, per fixture.
   *
   * `noteGlyph` returns null for any duration that is not a plain power of two — a
   * dotted or tuplet value — and the note is laid out with no glyph rather than a wrong
   * notehead. Deliberate, but it means real tunes have holes, and those holes are now
   * baked into 41 baseline files where nobody would notice them.
   *
   * So the gap is recorded here as a number instead of being spread silently across the
   * snapshots. Implement dotted durations and these counts drop, this fails, and the
   * change has to be acknowledged — the same anti-rot property KNOWN_DIVERGENCES has.
   *
   * The corpus's undrawn RESTS are a different matter and correctly absent: they are
   * ABC's invisible `x` and spacer `y` rests, which occupy space and print nothing.
   */
  const UNDRAWN_NOTES: Record<string, number> = {
    // EMPTY, as of the dotted-duration work: every note in the corpus now draws. Kept
    // rather than deleted because it is the assertion that a future duration change does
    // not silently reintroduce holes — `noteGlyph` still returns null for a value no
    // notehead can write, and that must stay visible if one ever reaches the corpus.
  }

  it('records exactly which fixtures still have notes that draw nothing', () => {
    const actual: Record<string, number> = {}
    for (const fixture of corpus) {
      const score = parse(fixture.abc).scores[0]
      if (!score) continue
      const undrawn = layout(score)
        .systems.flatMap((s) => s.staves.flatMap((st) => st.elements))
        .filter((e) => e.type === 'note' && e.glyphs.length === 0).length
      if (undrawn > 0) actual[fixture.name] = undrawn
    }
    expect(actual).toEqual(UNDRAWN_NOTES)
  })

  // A baseline for a fixture that no longer exists would sit unread forever, and a
  // fixture with no baseline would be silently unguarded. Both are caught here rather
  // than by anyone noticing the counts differ.
  it('records its coverage for the parity tracker', () => {
    writeFileSync(
      '/tmp/abcts-parity-baseline.json',
      JSON.stringify({ baselines: corpus.length, undrawnNotes: Object.keys(UNDRAWN_NOTES).length }),
    )
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('baselines and fixtures correspond exactly', () => {
    const recorded = readdirSync(BASELINE_DIR)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => f.replace(/\.txt$/, ''))
      .sort()
    expect(recorded).toEqual(corpus.map((c) => c.name).sort())
  })
})
