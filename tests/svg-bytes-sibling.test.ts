/**
 * **THE 41-FIXTURE CORPUS'S OWN abcjs SVGs, BYTE FOR BYTE — 113 TUNES NOTHING HAD READ.**
 *
 * `../abcMusicKit/Tools/abcjs-debug/golden/` holds 381 SVGs dumped from abcjs 6.7.0 at
 * `{staffwidth: 670}`, and until this file the only gate that opened them was
 * `pixel-parity`, which resolves both engines to absolute pixels and compares NOTEHEAD
 * CENTRES within 0.05px. That gate is at 0 of 120 and has been for a week. It is blind by
 * construction to everything a byte comparison sees: a `width` one ULP out, a page 7.75px
 * short, an attribute in another order, a glyph nobody classes.
 *
 * **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS COMPARISON** — for the
 * third time on this branch, and this is the largest instance: **38 of the 113 differ on
 * their first run**, `ragtime-nightingale` on ONE ULP of its `height` and nothing else in
 * 2,007,011 bytes.
 *
 * The shape is `svg-bytes.test.ts`'s exactly — a ranked table plus a `PASSING` ratchet
 * that grows and never shrinks — and the two are deliberately separate files: this corpus
 * is reached by SIBLING PATH and is not committed here, so a checkout without it must skip
 * rather than fail.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'

const fixtures = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const goldens = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'golden')

interface Case {
  readonly slug: string
  readonly abc: string
  readonly golden: string
  readonly tune: number
  /** `add_classes` — the `-classes` family. See `MODES`. */
  readonly addClasses?: boolean
}

/**
 * **THE CORPUS IS RENDERED FIVE WAYS AND THIS GATE READ ONE OF THEM.**
 *
 * `dump-svg.js` writes a plain family and an `--add-classes` one; `dump-tunebook-svg.js`
 * writes `-stacked`; and both take `--print`. Counted over the 507 goldens: 120 plain, 118
 * `-classes`, 117 `-print`, 12 `-stacked`, 12 `-stacked-print`. Until this list existed the
 * gate enumerated the 120 and nothing else — **A GATE'S REACH IS A PROPERTY OF ITS
 * ENUMERATION**, for the fifth time on this branch.
 *
 * `-classes` is `renderAbc(divs, abc, { staffwidth: 670, add_classes: true })`, the same
 * call with one flag, so it is enumerated here.
 *
 * `-print` and the two `-stacked` families are NOT, and the reason is capability rather
 * than reach: `print: true` is not in `AbcjsParams` at all, and a STACKED render is
 * `EngraverController(div).engraveABC(allTunes)` — every tune of a book into ONE svg —
 * which `compat` has no entry point for. Both are written up in
 * `Docs/CHECKPOINT-2026-08-15.md`; neither is a tolerance, they are unbuilt features.
 */
const MODES: readonly { readonly suffix: string; readonly addClasses: boolean }[] = [
  { suffix: '', addClasses: false },
  { suffix: '-classes', addClasses: true },
]

/**
 * **`S7-voices` IS EXCLUDED AND THE REASON IS NOT OURS.** Its fixture was edited in the
 * sibling repo on 2026-08-12 — the same notes with respelled chord durations — and its
 * goldens were never regenerated, so every one of them is from the tune as it stood on
 * 2026-08-08. `content-parity` has carried the same red since, and seven commits of
 * bisecting bought nothing that `ls -la` on the two inputs did not say at once
 * (`CHECKPOINT-2026-08-12.md` §5). Do not chase these rows; delete this entry when that
 * repo's goldens are rebuilt.
 */
const STALE: readonly string[] = ['S7-voices']

const CASES: Case[] = existsSync(fixtures)
  ? readdirSync(fixtures)
      .filter((f) => f.endsWith('.abc'))
      .sort()
      .filter((f) => !STALE.includes(f.replace(/\.abc$/, '')))
      .flatMap((f) => {
        const slug = f.replace(/\.abc$/, '')
        const abc = readFileSync(join(fixtures, f), 'utf-8')
        const rows: Case[] = []
        for (const mode of MODES) {
          const base = `${slug}${mode.suffix}`
          const flag = mode.addClasses ? { addClasses: true } : {}
          // A SINGLE-tune fixture's golden is `<base>.svg`; a tunebook's are `-tune0`, … .
          if (existsSync(join(goldens, `${base}.svg`)))
            rows.push({
              slug: base,
              abc,
              tune: 0,
              ...flag,
              golden: readFileSync(join(goldens, `${base}.svg`), 'utf-8'),
            })
          for (let i = 0; existsSync(join(goldens, `${base}-tune${i}.svg`)); i += 1) {
            rows.push({
              slug: `${base}-tune${i}`,
              abc,
              tune: i,
              ...flag,
              golden: readFileSync(join(goldens, `${base}-tune${i}.svg`), 'utf-8'),
            })
          }
        }
        return rows
      })
  : []

/**
 * Slugs whose difference is a RULED divergence rather than a defect. Empty, and it stays
 * empty until something is written up in `Docs/ABCJS-DIFFERENCES.md`.
 */
const DIVERGENT: readonly string[] = []

/** Slugs that are BYTE-EXACT and must stay so. Grows, never shrinks. */
const PASSING: readonly string[] = [
  'S1-decorations-tune0',
  'S1-decorations-tune1',
  'S1-decorations-tune2',
  'S1-decorations-tune3',
  'S1-decorations-tune4',
  'S1-decorations-classes-tune3',
  'S2-fields-tune0',
  'S2-fields-tune1',
  'S2-fields-tune2',
  'S2-fields-classes-tune1',
  'S2-fields-classes-tune2',
  'S3-note-syntax-tune0',
  'S3-note-syntax-tune1',
  'S3-note-syntax-tune2',
  'S3-note-syntax-tune3',
  'S3-note-syntax-tune4',
  'S3-note-syntax-tune5',
  'S3-note-syntax-tune6',
  'S3-note-syntax-tune7',
  'S3-note-syntax-tune8',
  'S3-note-syntax-tune9',
  'S3-note-syntax-tune10',
  'S3-note-syntax-tune11',
  'S3-note-syntax-tune12',
  'S3-note-syntax-tune13',
  'S3-note-syntax-tune14',
  'S3-note-syntax-tune15',
  'S3-note-syntax-tune16',
  'S3-note-syntax-tune17',
  'S3-note-syntax-tune18',
  'S3-note-syntax-tune19',
  'S3-note-syntax-tune20',
  'S3-note-syntax-tune21',
  'S3-note-syntax-tune22',
  'S3-note-syntax-tune23',
  'S3-note-syntax-tune24',
  'S3-note-syntax-classes-tune0',
  'S3-note-syntax-classes-tune1',
  'S3-note-syntax-classes-tune4',
  'S3-note-syntax-classes-tune5',
  'S3-note-syntax-classes-tune7',
  'S3-note-syntax-classes-tune8',
  'S3-note-syntax-classes-tune10',
  'S3-note-syntax-classes-tune11',
  'S3-note-syntax-classes-tune12',
  'S3-note-syntax-classes-tune13',
  'S3-note-syntax-classes-tune14',
  'S3-note-syntax-classes-tune15',
  'S3-note-syntax-classes-tune16',
  'S3-note-syntax-classes-tune17',
  'S3-note-syntax-classes-tune18',
  'S3-note-syntax-classes-tune19',
  'S3-note-syntax-classes-tune20',
  'S3-note-syntax-classes-tune21',
  'S3-note-syntax-classes-tune23',
  'S3-note-syntax-classes-tune24',
  'S4-bars-repeats-tune0',
  'S4-bars-repeats-tune1',
  'S4-bars-repeats-tune2',
  'S4-bars-repeats-classes-tune0',
  'S4-bars-repeats-classes-tune2',
  'S5-directives-tune0',
  'S5-directives-tune1',
  'S5-directives-tune2',
  'S5-directives-tune3',
  'S5-directives-tune4',
  'S5-directives-tune5',
  'S5-directives-classes-tune0',
  'S5-directives-classes-tune2',
  'S5-directives-classes-tune3',
  'S5-directives-classes-tune4',
  'S6-keys-tune0',
  'S6-keys-tune1',
  'S6-keys-tune2',
  'S6-keys-tune3',
  'S6-keys-tune4',
  'S6-keys-classes-tune0',
  'S6-keys-classes-tune1',
  'S6-keys-classes-tune2',
  'S6-keys-classes-tune3',
  'S6-keys-classes-tune4',
  'S8-layout-tune0',
  'S8-layout-tune1',
  'S8-layout-tune2',
  'S8-layout-tune3',
  'S8-layout-tune4',
  'S8-layout-tune5',
  'S8-layout-tune6',
  'S8-layout-tune7',
  'S8-layout-tune8',
  'S8-layout-tune9',
  'S8-layout-tune10',
  'S8-layout-tune11',
  'S8-layout-classes-tune0',
  'S8-layout-classes-tune1',
  'S8-layout-classes-tune2',
  'S8-layout-classes-tune3',
  'S8-layout-classes-tune4',
  'S8-layout-classes-tune5',
  'S8-layout-classes-tune6',
  'S8-layout-classes-tune7',
  'S8-layout-classes-tune10',
  'S8-layout-classes-tune11',
  'ave-verum-corpus',
  'ave-verum-corpus-classes',
  'brother-john-inline-voices',
  'brother-john-inline-voices-classes',
  'center-text',
  'chord-grid',
  'chord-grid-classes',
  'clefs-tune0',
  'clefs-tune1',
  'clefs-tune2',
  'clefs-tune3',
  'clefs-tune4',
  'clefs-tune5',
  'clefs-tune6',
  'clefs-tune7',
  'clefs-classes-tune0',
  'clefs-classes-tune1',
  'clefs-classes-tune2',
  'clefs-classes-tune3',
  'clefs-classes-tune4',
  'clefs-classes-tune5',
  'clefs-classes-tune6',
  'clefs-classes-tune7',
  'curves-tune0',
  'curves-tune1',
  'curves-tune2',
  'curves-tune3',
  'curves-tune4',
  'curves-tune5',
  'curves-tune6',
  'curves-classes-tune0',
  'curves-classes-tune1',
  'curves-classes-tune2',
  'curves-classes-tune3',
  'curves-classes-tune4',
  'curves-classes-tune5',
  'curves-classes-tune6',
  'extra-class',
  'frere-jacques',
  'full-song-template',
  'happy-birthday',
  'happy-birthday-classes',
  'little swallow',
  'missing-decorations-tune0',
  'missing-decorations-tune1',
  'missing-decorations-tune2',
  'missing-decorations-tune3',
  'missing-decorations-tune4',
  'missing-decorations-tune5',
  'missing-decorations-classes-tune0',
  'missing-decorations-classes-tune1',
  'missing-decorations-classes-tune2',
  'missing-decorations-classes-tune3',
  'missing-decorations-classes-tune4',
  'missing-decorations-classes-tune5',
  'multi-voice-lyrics-two-voices',
  'multi-voice-lyrics-two-voices-classes',
  'multi-voice-rest-collision',
  'multi-voice-rest-collision-classes',
  'multi-voice-rest-placement',
  'multi-voice-rest-placement-classes',
  'multi-voice-triplet-brackets',
  'multi-voice-triplet-brackets-classes',
  'program-127-test',
  'ragtime-mini',
  'ragtime-mini-classes',
  'ragtime-nightingale',
  'score-reorder-shared',
  'score-reorder-shared-classes',
  'score-reorder',
  'score-reorder-classes',
  'simple-c',
  'simple-c-classes',
  'stacked-annotations',
  'tunebook-3-tune0',
  'tunebook-3-tune1',
  'tunebook-3-tune2',
  'tunebook-3-classes-tune0',
  'tunebook-3-classes-tune1',
  'tunebook-3-classes-tune2',
  'twinkle',
  'twinkle-classes',
  'two-voice-invention',
  'two-voice-invention-classes',
  'voice-middle-after-clef',
  'voice-middle-after-clef-classes',
  'voice-octave-shift',
  'vree-compound-meter',
  'vree-compound-meter-classes',
  'vree-grace-notes',
  'vree-grace-notes-classes',
  'vree-sharps',
  'vree-sharps-classes',
  'vree-slurs-and-triplets',
  'vree-slurs-and-triplets-classes',
  'vree-ties-across-bars',
  'vree-ties-across-bars-classes',
  'zocharti-loch',
  'zocharti-loch-classes',
]

interface Diff {
  readonly matched: number
  readonly where: string
}

function firstDifference(got: string, want: string): Diff | null {
  if (got === want) return null
  let i = 0
  while (i < got.length && i < want.length && got[i] === want[i]) i += 1
  const from = Math.max(0, i - 60)
  return {
    matched: i,
    where:
      `byte ${i} of ${want.length}\n` +
      `      got  …${got.slice(from, i + 60).replace(/\n/g, '⏎')}\n` +
      `      want …${want.slice(from, i + 60).replace(/\n/g, '⏎')}`,
  }
}

/** THE SAME PARAMS THE GOLDENS WERE MADE WITH — `dump-svg.js`'s `{staffwidth: 670}`. */
function run(c: Case): Diff | null {
  const params = { staffwidth: 670, ...(c.addClasses === true ? { add_classes: true } : {}) }
  return firstDifference(renderAbc('paper', c.abc, params)[c.tune]?.svg ?? '', c.golden)
}

describe('strict SVG vs the 41-fixture corpus, byte for byte', () => {
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
      `${off.length} of ${rows.length} tunes differ from abcjs`,
      `${DIVERGENT.length} ruled divergent — see Docs/ABCJS-DIFFERENCES.md`,
      `${STALE.length} fixture excluded as STALE IN THE SIBLING REPO — see STALE`,
      '',
      ...off
        .sort((a, b) => (b.diff?.matched ?? 0) - (a.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(38)} ${String(r.diff?.matched).padStart(7)}/${r.n} ok  ${r.diff?.where}`,
        ),
    ].join('\n')
    writeFileSync('/tmp/abcts-svg-bytes-sibling-ranked.txt', `${text}\n`)
    expect(rows.length).toBe(CASES.length)
  })

  for (const slug of PASSING) {
    it(`is byte-exact — ${slug}`, () => {
      const c = CASES.find((x) => x.slug === slug)
      // The corpus is a SIBLING checkout, not committed here — skip rather than fail.
      if (CASES.length === 0) return
      if (c === undefined) throw new Error(`no such case ${slug}`)
      expect(run(c)?.where ?? null).toBeNull()
    })
  }
})
