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
 *
 * **AND IT NOW NAMES EVERY EXACT FIXTURE, BECAUSE SEVEN COULD NOT DEFEND EIGHTY-NINE.**
 * On 2026-08-11b two fixtures went from byte-exact to differing while the aggregate count
 * IMPROVED — `parse-tie-slur-01` under the `addStaffPadding` port and `visual-misc-13`
 * under the above-ladder's start — and neither was ratcheted, so the only thing that caught
 * them was diffing two runs of a scratch script by hand. A ratchet holding 4% of what is
 * green is a ratchet in name. Regenerate with `npx tsx` over the corpus when a batch
 * lands; never delete a row to make a run pass.
 */
const PASSING: readonly string[] = [
  'abcjs-parse-book_parser-01-example',
  'abcjs-parse-book_parser-02-tune',
  'abcjs-parse-book_parser-04-wed',
  'abcjs-parse-book_parser-06-a',
  'abcjs-parse-book_parser-07-a',
  'abcjs-parse-note-01-c0-d1-eg-0-fa-1',
  'abcjs-parse-note-id-01-v-v1-c-d-e-f',
  'abcjs-parse-tie-slur-01-staffwidth-200',
  'abcjs-parse-tie-slur-02-staffwidth-200',
  'abcjs-parse-tie-slur-03-staffwidth-200',
  'abcjs-parse-tie-slur-04-stretchlast-1',
  'abcjs-synth-flattener-01-crescendo-efga-gab-crescendo-c-diminuend',
  'abcjs-synth-flattener-02-p-c-def-gabc-d2-b2-g2-f2-f-e-fga-bcde-p-',
  'abcjs-synth-flattener-03-pppp-cdef-gabc-y-ffff-bcba-gfed-y-pppp-c',
  'abcjs-synth-flattener-04-g-gab-cde-d7-fga-def',
  'abcjs-synth-flattener-05-c-cde-def-c2e-d2f-c-c2-d-d-g-d2-e-e',
  'abcjs-synth-flattener-06-cde-d7-f2-d2-e2-f2-1-g-g4-fedc-c-e4z4',
  'abcjs-synth-flattener-07-metronome',
  'abcjs-synth-flattener-08-em-egab',
  'abcjs-synth-flattener-09-d-defg-q-1-2-90-defg',
  'abcjs-synth-flattener-10-q-1-4-129-0476605-cdef-q-1-4-127-gabc-q-',
  'abcjs-synth-flattener-11-midi-program-3',
  'abcjs-synth-flattener-12-chords-meter-change',
  'abcjs-synth-flattener-13-e7-bcde-a-f-break-efe-e7-bc-ignore-de',
  'abcjs-synth-flattener-14-eb7-zg2ga2a2-a2ab-b4-ab-z-break-c2cd2d2-',
  'abcjs-synth-flattener-15-c-c4-c',
  'abcjs-synth-flattener-16-gm-gfdf-gfdf-gf-d2-f-c4',
  'abcjs-synth-flattener-17-midi-grace-notes',
  'abcjs-synth-flattener-18-midi-program-40',
  'abcjs-synth-flattener-19-cdef-z4-fedc',
  'abcjs-synth-flattener-20-k-treble-8-b-a4-ce-f-4-k-treble-8-g8-g-2',
  'abcjs-synth-flattener-21-c4-d4',
  'abcjs-synth-flattener-22-b-c4-d4',
  'abcjs-synth-flattener-23-percmap-d-pedal-hi-hat-x',
  'abcjs-synth-flattener-24-percmap-c-high-tom-x',
  'abcjs-synth-flattener-25-cd-d2-d2-dz',
  'abcjs-synth-flattener-26-gbcd-d4-zcdc-dc3',
  'abcjs-synth-flattener-27-triplets-and-chord-rhythm',
  'abcjs-synth-flattener-29-midi-drum-dddd-76-77-77-77-50-50-50-50',
  'abcjs-synth-flattener-30-am-a2e-e2d-g-bab-d2b-am-a2e-e2d-g-b2a-ga',
  'abcjs-synth-flattener-31-tempo-change-three-voices',
  'abcjs-synth-flattener-32-quarter-tone2',
  'abcjs-synth-flattener-33-tempo-override',
  'abcjs-synth-flattener-34-score-s-a-t-b',
  'abcjs-synth-flattener-35-midi-bassprog-10',
  'abcjs-synth-flattener-36-midi-gchord-fhihfhih',
  'abcjs-synth-flattener-37-midi-gchord-bzczbzcz',
  'abcjs-synth-flattener-38-c-zz-d-z-e-z',
  'abcjs-synth-flattener-39-midi-gchord-bzczbzcz',
  'abcjs-synth-flattener-40-c5-z4',
  'abcjs-synth-flattener-41-midi-bassprog-10-octave-1',
  'abcjs-synth-flattener-42-midi-gchord-ffffffff',
  'abcjs-synth-flattener-43-gm-zzz-cm-zzz',
  'abcjs-synth-flattener-44-cd-pppp-c-ffff-d-ffff-c-pppp-d-cd',
  'abcjs-synth-flattener-45-segno-f-d2',
  'abcjs-synth-flattener-46-c8-1-d8-2-e8-3-f8',
  'abcjs-synth-midi-01-midi-options',
  'abcjs-synth-midi-02-staccato',
  'abcjs-synth-midi-03-percmap',
  'abcjs-synth-timing-01-cde-fg-ab-1-bcd-2-efg',
  'abcjs-synth-timing-02-score-1-2',
  'abcjs-synth-timing-03-cd-e-f-3gab-ac',
  'abcjs-synth-timing-04-cd-e-f-3gab-ac',
  'abcjs-synth-timing-05-subtitle-crash',
  'abcjs-synth-timing-06-repeat-at-start-of-line-crash',
  'abcjs-synth-timing-07-skip-ties-crash',
  'abcjs-synth-timing-08-tie-repeat-crash',
  'abcjs-synth-timing-09-f-c-2d-2-e-4-g-6-a-2-g-4-e-4',
  'abcjs-synth-timing-10-stretchlast-1',
  'abcjs-synth-timing-11-stretchlast-1',
  'abcjs-synth-timing-12-stretchlast-1',
  'abcjs-visual-decorations-01-score-s-a-b',
  'abcjs-visual-directives-01-incipit-test',
  'abcjs-visual-layout-01-barlabelfont-times-bold-18-box',
  'abcjs-visual-layout-02-barlabelfont-times-bold-18-box',
  'abcjs-visual-layout-03-cdef-cdef',
  'abcjs-visual-layout-04-score-s-a',
  'abcjs-visual-layout-05-c3-abc-cf-3-abc-c3-fa-bc',
  'abcjs-visual-layout-06-staves-1-2-3-4',
  'abcjs-visual-layout-08-staffwidth-100',
  'abcjs-visual-layout-09-endings',
  'abcjs-visual-misc-01-barnumbers-1',
  'abcjs-visual-misc-02-title',
  'abcjs-visual-misc-03-jazzchords',
  'abcjs-visual-misc-04-stretchlast',
  'abcjs-visual-misc-05-cccc-d-c-alcoda-dddd-d-c-alfine-eeee-d-s',
  'abcjs-visual-misc-07-ab-ef-g-d-df-f-d-a-4-c-4',
  'abcjs-visual-misc-08-a2-c2-t-a2t-c2',
  'abcjs-visual-misc-09-begintext',
  'abcjs-visual-misc-10-begintext',
  'abcjs-visual-misc-11-begintext',
  'abcjs-visual-misc-12-b-beambr1-b-bb',
  'abcjs-visual-misc-13-ceg-t-gce-d-f-b-3-dm7-d-te',
  'abcjs-visual-misc-14-tune',
  'abcjs-visual-mouse-click-01-selection-test',
  'abcjs-visual-multi-voice-01-score-top-bottom',
  'abcjs-visual-multi-voice-02-p-c-2b2-z4-f2a2-f4',
  'abcjs-visual-parsing-01-azzz-e2',
  'abcjs-visual-parsing-02-sx',
  'abcjs-visual-parsing-03-v-1-f',
  'abcjs-visual-parsing-04-v-t-c',
  'abcjs-visual-parsing-05-v-t-c-v-b-a-v-t-d',
  'abcjs-visual-parsing-08-score-t-b',
  'abcjs-visual-parsing-09-score-t-b',
  'abcjs-visual-parsing-10-song',
  'abcjs-visual-selection-01-selection-test',
  'abcjs-visual-selection-02-g4-q-left-1-4-170-right-a4',
  'abcjs-visual-selection-03-c4',
  'abcjs-visual-slurs-01-score-s-a',
  'abcjs-visual-slurs-02-score-s-a-t-b',
  'abcjs-visual-svg-01-staffwidth-5',
  'abcjs-visual-svg-03-a4',
  'abcjs-visual-svg-per-line-01-selection-test',
  'abcjs-visual-tablature-01-gr',
  'abcjs-visual-tablature-02-g-fg-a-g2-a-very-very-long-chord-d2-cd-f',
  'abcjs-visual-tablature-03-staves-rh-lh',
  'abcjs-visual-tablature-04-barnumbers-1',
  'abcjs-visual-tablature-05-a7-a',
  'abcjs-visual-tablature-06-a7-a',
  'abcjs-visual-tablature-07-staves-rh-lh',
  'abcjs-visual-tablature-08-first',
  'abcjs-visual-tablature-09-f-g',
  'abcjs-visual-tablature-10-f3-a-y',
  'abcjs-visual-tablature-11-f-f',
  'abcjs-visual-tablature-12-b',
  'abcjs-visual-tablature-13-g8-c4-d4-e4-f4',
  'abcjs-visual-tablature-14-c',
  'abcjs-visual-tablature-15-all-element-types',
  'abcjs-visual-tablature-16-g-g-g-g',
  'abcjs-visual-tablature-17-stretchlast',
  'abcjs-visual-tablature-18-a-b',
  'abcjs-visual-tablature-19-d-a-d-g-b-e',
  'abcjs-visual-tablature-20-score-1-2',
  'abcjs-visual-tablature-21-a2-a-a-f-f-f-f-f-e-ee-g-gg-g-k-eb-a2-a2',
  'abcjs-visual-tablature-22-g-cegda',
  'abcjs-visual-tablature-24-stretchlast',
  'abcjs-visual-title-01-not-transformed',
  'abcjs-visual-title-02-transformed-the',
  'abcjs-visual-title-03-transformed-the',
  'abcjs-visual-title-04-transformed-a',
  'abcjs-visual-title-05-transformed-an',
  'abcjs-visual-title-06-transformed-a',
  'abcjs-visual-title-07-24-number-transform-the',
  'abcjs-visual-title-08-24-number-transform-a',
  'abcjs-visual-title-09-mal-the-formed',
  'abcjs-visual-title-10-20-subtitles-the',
  'abcjs-visual-transpose-01-f2-f-f-f-f-f2-e2-e-e-e-e-e2-k-ab-f2-f-f-',
  'abcjs-visual-transpose-02-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b-',
  'abcjs-visual-transpose-03-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b-',
  'abcjs-visual-transpose-04-transpose-annotations',
  'abcjs-visual-transpose-05-n-c-ab-c-c-c-c-d-d-d-d-e-e-f-f-f-f-g-g-g',
  'abcjs-visual-transpose-06-c-d-e-f-g-a-b-c-cdef-gabc-c-d-e-f-g-a-b-',
  'abcjs-visual-transpose-output-01-transpose-output',
  'abcjs-visual-transpose-output-02-transpose-output',
  'abcjs-visual-transpose-output-03-transpose-output',
  'abcjs-visual-transpose-output-04-transpose-output',
  'abcjs-visual-transpose-output-05-g',
  'abcjs-visual-transpose-output-06-f',
  'abcjs-visual-wrap-01-b-4-c2d2-e3f-gabc-d-e-f-g-marcato-d-e-f-',
  'abcjs-visual-wrap-02-stretchlast-1',
  'abcjs-visual-wrap-03-piano-wrap',
  'abcjs-visual-wrap-04-wrap-quartet',
  'abcjs-visual-wrap-05-score-1-2-3-4',
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
