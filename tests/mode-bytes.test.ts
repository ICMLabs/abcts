/**
 * **EXTENDED IS STRICT, BYTE FOR BYTE, EXCEPT WHERE WE HAVE AGREED IT IS NOT.**
 *
 * ⚖️ Owner's rule, 2026-09-07: *"extended mode should always be byte compatible with
 * strict, except for those explicitly agreed upon divergences (usually we've fixed a bug
 * in abcjs)"*. This file is that sentence as a gate. `svg-bytes` says strict equals abcjs;
 * this says extended equals strict; together they say extended equals abcjs everywhere it
 * has not been given leave to differ.
 *
 * ── WHY IT HAD TO BE MEASURED RATHER THAN ASSUMED ────────────────────────────
 * When it was first run: **675 of 691 fixtures differed**. The declared list — the mode
 * table in `CLAUDE.md` — accounted for eleven of them. The other 664 came from ONE flag
 * doing TWO jobs: `strict` gated both "reproduce abcjs's bug" and "engrave the way abcjs
 * engraves", and it was threaded through two hundred sites without the distinction ever
 * being drawn. Measured, holding everything else equal:
 *
 *     layout's `strict`                            331 fixtures
 *     the emitter's `strict`                       333
 *     glyph table / weights / density / metrics      5
 *     the parser's `isStrict`                        6   <- the only ones intended
 *
 * So extended was not "abcjs plus fixes"; it was a second engraving engine that no gate
 * compared to anything. `ABCJS_GAPS` in `layout.ts` is the small half that survived.
 *
 * ── WHAT IS HELD EQUAL, AND WHY EACH ─────────────────────────────────────────
 * `classes` and `systemWidth` (the goldens' own page, 670 + two 15px margins) because a pipeline difference is not a mode difference — the
 * comparison site had extended coming through `core.render` and strict through `compat`,
 * and reported a mode defect for every row. `optimizeSVG: false` because `<defs>`/`<use>`
 * IS a declared divergence and is the one that would otherwise differ on all 691 for a
 * reason already written down; `optimize-svg.test.ts` proves it preserves the DOM.
 *
 * ── THE ONE THING IT MAY NEVER DO ────────────────────────────────────────────
 * Grow a tolerance. A slug in `DIVERGENT` needs a row of the mode table behind it and a
 * one-line reason here. Anything else is a defect.
 *
 * `/tmp/abcts-mode-bytes.txt` ranks what differs by how far in.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CompatibilityMode } from '../src/core/model.js'
import { parse } from '../src/index.js'
import { render } from '../src/renderer/index.js'

const fixtures = join(import.meta.dirname, 'corpus-abcjs', 'fixtures')
const goldens = join(import.meta.dirname, 'corpus-abcjs', 'golden')

/** The enumeration `svg-bytes` and `mode-partition` share — see either for why. */
const CASES = readdirSync(fixtures)
  .filter((f) => f.endsWith('.abc'))
  .sort()
  .flatMap((f) => {
    const slug = f.replace(/\.abc$/, '')
    const abc = readFileSync(join(fixtures, f), 'utf-8')
    if (existsSync(join(goldens, `${slug}.svg`))) return [{ slug, abc, tune: 0 }]
    const rows: { slug: string; abc: string; tune: number }[] = []
    for (let i = 0; existsSync(join(goldens, `${slug}-tune${i}.svg`)); i += 1)
      rows.push({ slug: `${slug}-tune${i}`, abc, tune: i })
    return rows
  })

/**
 * **THE DECLARED DIVERGENCES, EACH WITH THE ROW OF THE MODE TABLE IT SITS ON.**
 * Every one was read back out of the fixture after the gate named it, not assumed from the
 * fixture's title — `abcts-ledger-gaps-4`'s row is a decoration abcjs draws nothing for,
 * which its name says nothing about.
 */
const DIVERGENT: Readonly<Record<string, string>> = {
  // abcjs paints nothing for these; extended draws the ornament the ABC names.
  'abcts-grace-order-and-lanes-tune25': '!staccato!!tenuto!!accent! — STRICT_UNDRAWN',
  'abcts-ledger-gaps-4-tune2': 'a decoration abcjs draws nothing for — STRICT_UNDRAWN',
  'abcjs-visual-mouse-click-01-selection-test': 'decorations abcjs lacks, drawn from Bravura',
  'abcjs-visual-tablature-15-all-element-types': 'decorations abcjs lacks, drawn from Bravura',
  'abcjs-synth-flattener-11-midi-program-3': 'decorations abcjs lacks, drawn from Bravura',
  // abcjs prints a literal `_`; extended suppresses it and strokes an extender.
  'abcts-lyric-verses-tune8': 'melisma `_`',
  // `%%vocalfont` per music LINE (abcjs's granularity) against per lyric SEGMENT.
  'abcts-model-gaps-tune5': '%%vocalfont granularity',
  // abcjs draws NOTHING for a three-quarter tone; extended draws the glyph.
  'abcts-stafflines-and-modifiers-tune23': 'three-quarter tone',
  'abcts-stafflines-and-modifiers-tune25': 'three-quarter tone',
  // `[U:` is not one of abcjs's eight inline fields, so abcjs draws the leftovers.
  'abcts-text-udef-parts-overlays-tune43': 'inline [U:',
  'abcts-text-udef-parts-overlays-tune44': 'inline [U:',
}

const svgOf = (abc: string, mode: CompatibilityMode, tune: number): string => {
  const parsed = parse(abc, { mode })
  if (!parsed.ok) return `PARSE FAILED: ${parsed.errors.length} error(s)`
  const score = parsed.scores[tune]
  if (score === undefined) return 'NO SCORE'
  return render(score, {
    mode,
    // The PAGE, not the music area: compat's `staffwidth: 670` plus abcjs's two 15px
    // margins, which is what every golden in the corpus is generated at.
    systemWidth: 700,
    classes: 'abcjs',
    optimizeSVG: false,
  })
}

describe('abcjs-extended against abcjs-strict, byte for byte', () => {
  it('differs only where a divergence is declared', () => {
    const differing: { slug: string; at: number }[] = []
    const report: string[] = []
    for (const c of CASES) {
      const s = svgOf(c.abc, 'abcjs-strict', c.tune)
      const e = svgOf(c.abc, 'abcjs-extended', c.tune)
      if (s === e) continue
      let at = 0
      while (at < s.length && at < e.length && s[at] === e[at]) at += 1
      differing.push({ slug: c.slug, at })
      report.push(
        `${String(at).padStart(7)}  ${c.slug}${DIVERGENT[c.slug] === undefined ? '' : `  [declared: ${DIVERGENT[c.slug]}]`}\n` +
          `           strict   ${JSON.stringify(s.slice(Math.max(0, at - 30), at + 70))}\n` +
          `           extended ${JSON.stringify(e.slice(Math.max(0, at - 30), at + 70))}`,
      )
    }
    differing.sort((a, b) => a.at - b.at)
    writeFileSync(
      '/tmp/abcts-mode-bytes.txt',
      [`${differing.length} of ${CASES.length} differ`, ...report].join('\n'),
    )

    const undeclared = differing
      .filter((d) => DIVERGENT[d.slug] === undefined)
      .map((d) => `${d.slug} (first differs at byte ${d.at})`)
    expect(undeclared, `undeclared mode divergence — see /tmp/abcts-mode-bytes.txt`).toEqual([])
  })

  /**
   * ⚠️ **A DIVERGENCE LIST IS ALSO A CLAIM THAT EACH ROW STILL DIVERGES.** A slug that has
   * quietly converged is a tolerance nobody is paying for any more, and leaving it here
   * means the next real defect on that fixture passes silently.
   */
  it('every declared divergence still actually diverges', () => {
    const byId = new Map(CASES.map((c) => [c.slug, c]))
    for (const slug of Object.keys(DIVERGENT)) {
      const c = byId.get(slug)
      expect(c, `${slug} is not a case any more`).toBeDefined()
      if (c === undefined) continue
      expect(
        svgOf(c.abc, 'abcjs-strict', c.tune),
        `${slug} no longer diverges — drop it from DIVERGENT`,
      ).not.toBe(svgOf(c.abc, 'abcjs-extended', c.tune))
    }
  })
})
