/**
 * **THE SVG BYTE TABLE — the bar for `abcjs-strict` is BYTE PARITY, and this is the only
 * gate that says so.**
 *
 * Every other comparison in this repo declares what it ignores. `pixel-parity` resolves
 * both SVGs to absolute pixels and compares notehead CENTRES; the harvested table takes
 * 0.05px; `tempo-parts` compares which GLYPHS a mark is made of; `decoration-x` measures one
 * axis; `dom-contract` counts classed ancestors rather than raw nesting. Each of those
 * tolerances was defensible for the axis it was built to see, and **together they let a
 * markup difference live forever**: a `<rect>` where abcjs writes a `<path>` moves nothing,
 * a `<g transform>` where abcjs writes absolute coordinates moves nothing, and an attribute
 * in a different order moves nothing.
 *
 * A byte string has no such latitude. `differs` means differs, and the first differing
 * OFFSET names the construct — which is exactly the argument the MIDI-file oracle won on,
 * and that one disagreed three times while the event table was green.
 *
 * ── WHAT THIS TABLE IS FOR ───────────────────────────────────────────────────
 * It opens at every case and that is the POINT, as it was for audio (54 of 54), the MIDI
 * file (3 of 3) and the DOM contract (25 of 25). It is the WORK LIST for strict-mode
 * markup, ranked by how far in the first difference is, so the closest cases sit at the
 * bottom and are closed first.
 *
 * ── THE ONE THING IT MAY NEVER DO ────────────────────────────────────────────
 * **Grow a tolerance.** If a difference here is a deliberate divergence — an abcjs bug we
 * refuse to reproduce, or a mode-split this repo has already ruled on — it belongs in
 * `Docs/ABCJS-DIFFERENCES.md` with the evidence, and its slug belongs in `DIVERGENT` below
 * with a pointer. Anything else is a defect.
 *
 * `/tmp/abcts-svg-bytes-ranked.txt`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'

const fixtures = join(import.meta.dirname, 'corpus-abcjs', 'fixtures')
const goldens = join(import.meta.dirname, 'corpus-abcjs', 'golden')

interface Case {
  readonly slug: string
  readonly abc: string
  readonly golden: string
}

/**
 * A fixture is compared only where a SINGLE-TUNE golden exists — a multi-tune file's
 * goldens are `<name>-tune0.svg`, and rendering a tunebook into one SVG is a different
 * surface with a different generator (`dump-tunebook-svg.js`).
 */
const CASES: Case[] = readdirSync(fixtures)
  .filter((f) => f.endsWith('.abc'))
  .sort()
  .map((f) => ({ slug: f.replace(/\.abc$/, ''), abc: readFileSync(join(fixtures, f), 'utf-8') }))
  .filter((c) => existsSync(join(goldens, `${c.slug}.svg`)))
  .map((c) => ({ ...c, golden: readFileSync(join(goldens, `${c.slug}.svg`), 'utf-8') }))

/**
 * Slugs whose difference is a RULED divergence rather than a defect. Empty, and it stays
 * empty until something is written up in `Docs/ABCJS-DIFFERENCES.md` — a slug here without
 * an entry there is a tolerance wearing a disguise.
 */
const DIVERGENT: readonly string[] = []

/**
 * Slugs that are BYTE-EXACT and must stay so. Grows, never shrinks.
 *
 * The first seven arrived together, and six of them are the same finding: **a line with no
 * note and no barline is DELETED** (`tune-builder.js:29-61`, `:888-894`), so a tune with a
 * header and no music draws no staff at all — abcjs's golden for `X:43\nT: example` is 694
 * bytes holding a title and nothing else.
 */
const PASSING: readonly string[] = [
  'abcjs-parse-book_parser-01-example',
  'abcjs-parse-book_parser-02-tune',
  'abcjs-parse-book_parser-04-wed',
  'abcjs-parse-book_parser-06-a',
  'abcjs-parse-book_parser-07-a',
  'abcjs-visual-misc-14-tune',
  'abcjs-visual-transpose-output-02-transpose-output',
]

interface Diff {
  /** Bytes that matched before the first difference — bigger is closer. */
  readonly matched: number
  readonly where: string
}

/** The first differing byte, with enough either side to name the construct. */
function firstDifference(got: string, want: string): Diff | null {
  const n = Math.min(got.length, want.length)
  let i = 0
  while (i < n && got[i] === want[i]) i += 1
  if (i === n && got.length === want.length) return null
  const from = Math.max(0, i - 40)
  return {
    matched: i,
    where:
      `byte ${i} of ${want.length}\n` +
      `      got  …${got.slice(from, i + 60).replace(/\n/g, '⏎')}\n` +
      `      want …${want.slice(from, i + 60).replace(/\n/g, '⏎')}`,
  }
}

/**
 * THE SAME PARAMS THE GOLDENS WERE MADE WITH. `dump-svg.js` renders every one at
 * `{ staffwidth: 670 }`, and abcjs's own padding takes that to a 700px page — comparing
 * against a default render would differ on the very first attribute for a reason that is
 * about the harness rather than the engine.
 */
function run(c: Case): Diff | null {
  return firstDifference(renderAbc('paper', c.abc, { staffwidth: 670 })[0]?.svg ?? '', c.golden)
}

describe('strict SVG vs abcjs, byte for byte', () => {
  it('writes the ranked table', () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null
      try {
        diff = run(c)
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` }
      }
      return { slug: c.slug, diff, n: c.golden.length }
    })
    const off = rows.filter((r) => r.diff !== null && !DIVERGENT.includes(r.slug))
    const text = [
      `${off.length} of ${rows.length} fixtures differ from abcjs`,
      `${DIVERGENT.length} ruled divergent — see Docs/ABCJS-DIFFERENCES.md`,
      '',
      ...off
        .sort((a, b) => (b.diff?.matched ?? 0) - (a.diff?.matched ?? 0))
        .map((r) => `  ${r.slug.padEnd(38)} ${String(r.diff?.matched).padStart(6)}/${r.n} ok  ${r.diff?.where}`),
    ].join('\n')
    writeFileSync('/tmp/abcts-svg-bytes-ranked.txt', `${text}\n`)
    expect(rows.length).toBe(CASES.length)
  })

  for (const slug of PASSING) {
    it(`is byte-exact — ${slug}`, () => {
      const c = CASES.find((x) => x.slug === slug)
      if (c === undefined) throw new Error(`no such case ${slug}`)
      expect(run(c)?.where ?? null).toBeNull()
    })
  }
})
