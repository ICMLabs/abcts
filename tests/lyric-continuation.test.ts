/**
 * `w:` continuation across interposed directives, and per-segment `%%vocalfont`.
 *
 * Gonzato, *Making Music with ABC 2* §4.1.4 "Directives as I: Fields", p.65. Three
 * behaviours interact and the fixture is built to make them interact:
 *
 *  1. `\` at the end of a `w:`/`+:` line continues the lyric.
 *  2. A `%%` or `I:` line interposed INSIDE that continuation is formatting, not lyric
 *     text — processing resumes at the next `+:`.
 *  3. `I: <directive>` IS `%%<directive>` (ABC 2.1 §11.4), mid-tune included.
 *
 * Correct output is ONE lyric line of 16 syllables under 16 notes: four in Times-Roman
 * 12, eight in Times-Bold 16, four in Times-Italic 12.
 *
 * ── WHY THIS IS NOT GATED AGAINST abcjs ──────────────────────────────────────
 * abcjs is WRONG here, and measurably so. Run against 6.6.3 it swallows the `I:` line as
 * lyric text, sings "vocalfont Times- Bold 16" under the noteheads, then drops both `+:`
 * continuations entirely because it lexes them as MUSIC — 26 note elements where there
 * should be 16, and 4 of 16 syllables. It also stamps `el.fonts` at parse time and reads
 * `.fonts` nowhere in its write phase, so its mid-tune vocalfont is parsed and never
 * realized.
 *
 * So the two modes have DIFFERENT contracts and each test below names its own premise.
 * Neither may be used to justify the other: the strict expectation is a transcript of a
 * bug, and the modern expectation is the specification. Fossilising one as "the" answer
 * is how a mode-split rots into a single wrong behaviour with two names.
 *
 * The strict expectation is not hand-written. It was captured by running abcjs 6.6.3
 * from `Docs/References/abcjs/abcjs-6.6.3/dist/abcjs-basic.js` over this exact fixture
 * and reading `lines[].staff[].voices[]`, with abcjs's `divider` reattached to its
 * `syllable` the way the corpus lyric gate does it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CompatibilityMode } from '../src/core/model.js'
import { parse } from '../src/parser/parser.js'
import { render } from '../src/renderer/index.js'
import { ENGRAVE, layout } from '../src/renderer/layout.js'

const abc = readFileSync('tests/fixtures/gonzato-4-1-4-directives-as-i-fields.abc', 'utf-8')

const events = (mode: CompatibilityMode) => {
  const score = parse(abc, { mode }).scores[0]
  if (score === undefined) throw new Error('fixture did not parse')
  return score.voices.flatMap((voice) => voice.measures.flatMap((measure) => measure.events))
}

const syllables = (mode: CompatibilityMode) =>
  events(mode).map((event) => (event.type === 'rest' ? null : event.lyric))

/** Drawn lyric text with the font it is actually drawn in — the render, not the parse. */
const drawnLyrics = (mode: CompatibilityMode) => {
  const score = parse(abc, { mode }).scores[0]
  if (score === undefined) throw new Error('fixture did not parse')
  return layout(score, { mode })
    .systems.flatMap((system) => system.staves.flatMap((staff) => staff.voices.flat()))
    .flatMap((element) => element.texts.filter((text) => text.role === 'lyric'))
}

describe('lyric continuation across interposed directives', () => {
  describe('abcjs-strict — abcjs behaviour preserved, bug included', () => {
    // This block asserts a BUG on purpose. Every expectation here was measured from
    // abcjs 6.6.3, and if one of them starts looking wrong, the fix belongs in the other
    // block. Changing a number here to make it "better" silently ends strict's contract.

    it('sings the interposed I: line, exactly as abcjs does', () => {
      expect(syllables('abcjs-strict').slice(0, 8)).toEqual([
        'la',
        'la',
        'la',
        'la',
        // The `I:` field's own text, sung. `Times-Bold` is two syllables because `-`
        // splits a word across notes.
        'vocalfont',
        'Times-',
        'Bold',
        '16',
      ])
    })

    it('drops the +: continuations and lexes them as music, as abcjs does', () => {
      // 16 real notes plus 10 phantoms — the `a`s in "la la la la, la la la la" and
      // "la la la la.". abcjs produces exactly 26 elements here for the same reason.
      expect(events('abcjs-strict')).toHaveLength(26)
      expect(syllables('abcjs-strict').slice(8)).toEqual(Array(18).fill(null))
    })

    it('does NOT realize %%vocalfont — abcjs parses it and never draws it', () => {
      // abcjs stamps `el.fonts` and reads `.fonts` nowhere in its write phase. Every
      // syllable therefore draws at the DEFAULT font, and realizing the directive here
      // would be an improvement — the one thing strict must not do.
      //
      // The SIZE is what discriminates. The directive asks for `Times-Bold 16`, and
      // abcjs's default `vocalfont` is already Times New Roman 13pt BOLD
      // (`parse/abc_parse_directive.js:30`) — its own goldens draw every syllable with
      // `font-weight="bold"` — so the weight cannot tell "ignored" from "applied". The
      // size can, and the italic the directive does not ask for stays off either way.
      const sizes = new Set(drawnLyrics('abcjs-strict').map((text) => text.size))
      expect([...sizes]).toHaveLength(1)
      expect(drawnLyrics('abcjs-strict').every((text) => text.size === 17 / 7.75)).toBe(true)
      expect(drawnLyrics('abcjs-strict').every((text) => !text.italic)).toBe(true)
    })
  })

  for (const mode of ['abc2.1', 'extended'] as const) {
    describe(`${mode} — Gonzato §4.1.4 semantics`, () => {
      it('carries the lyric across both interposed directives: 16 syllables, 16 notes', () => {
        expect(events(mode)).toHaveLength(16)
        expect(syllables(mode)).toEqual([
          'la',
          'la',
          'la',
          'la',
          'la',
          'la',
          'la',
          'la,',
          'la',
          'la',
          'la',
          'la',
          'la',
          'la',
          'la',
          'la.',
        ])
      })

      it('leaks no directive text into the lyric or the music', () => {
        // The failure this guards is not subtle when it happens: "vocalfont" and "16"
        // appear under noteheads, and ten phantom `a`s appear on the staff.
        const sung = syllables(mode).join(' ')
        expect(sung).not.toMatch(/vocalfont|Times|Bold|Italic|Roman|\d\d/)
      })

      it('draws three font runs, per SEGMENT of the one lyric line', () => {
        const drawn = drawnLyrics(mode)
        expect(drawn).toHaveLength(16)
        const runs = drawn.map(
          (text) => `${text.size.toFixed(3)}${text.bold ? 'B' : ''}${text.italic ? 'I' : ''}`,
        )
        // The 13pt default is the scale everything else is relative to, so this reads it
        // rather than repeating it — it was written as a literal 1.4 and pinned the
        // vocal font two thirds of abcjs's size in place.
        const base = ENGRAVE.lyricTextSize
        const roman = (base * (12 / 13)).toFixed(3)
        const bold = `${(base * (16 / 13)).toFixed(3)}B`
        const italic = `${(base * (12 / 13)).toFixed(3)}I`
        expect(runs).toEqual([
          ...Array(4).fill(roman),
          ...Array(8).fill(bold),
          ...Array(4).fill(italic),
        ])
      })

      it('MEASURES in the font it draws in, not the default', () => {
        // The failure mode this catches is lyrics that draw large and are spaced as if
        // small, so they collide. Centring reads the measured width, so a syllable in a
        // bigger font must start further left of the same notehead than one in a
        // smaller font — comparing the same word on the same note across two modes.
        const big = drawnLyrics(mode)[4]
        const small = drawnLyrics(mode)[0]
        expect(big?.text).toBe('la')
        expect(small?.text).toBe('la')
        expect(big?.size).toBeGreaterThan(small?.size ?? 0)
        // Same two-letter word, wider font, so a wider measured box.
        const strictSame = drawnLyrics('abcjs-strict')[0]
        expect(strictSame?.text).toBe('la')
        expect(small?.x).not.toBe(strictSame?.x)
      })

      it('emits the font into the SVG, not just the layout', () => {
        const score = parse(abc, { mode }).scores[0]
        if (score === undefined) throw new Error('fixture did not parse')
        const svg = render(score, { mode })
        expect(svg).toMatch(/font-weight="bold"[^>]*>la</)
        expect(svg).toMatch(/font-style="italic"[^>]*>la/)
      })
    })
  }

  describe('the no-drift guard', () => {
    // v1's near-miss: a "differs from default" comparison against the wrong constant
    // rerouted every tune's lyric measurement and drifted the layout by 0.01px. The
    // structural property that makes that impossible here is that a tune with no
    // `%%vocalfont` has `lyricFont: null` and never reaches the conversion at all.
    it('a tune with no %%vocalfont draws lyrics at exactly the default size', () => {
      const plain = 'X:1\nL:1/4\nK:C\nCDEF|\nw: la la la la\n'
      for (const mode of ['abcjs-strict', 'abc2.1', 'extended'] as CompatibilityMode[]) {
        const score = parse(plain, { mode }).scores[0]
        if (score === undefined) throw new Error('did not parse')
        const drawn = layout(score, { mode })
          .systems.flatMap((system) => system.staves.flatMap((staff) => staff.voices.flat()))
          .flatMap((element) => element.texts.filter((text) => text.role === 'lyric'))
        expect(drawn).toHaveLength(4)
        // Exactly, not approximately. `toBeCloseTo` would pass on the drift this exists
        // to catch.
        for (const text of drawn) expect(text.size).toBe(ENGRAVE.lyricTextSize)
        expect(score.voices[0]?.measures[0]?.events[0]?.type === 'note').toBe(true)
      }
    })

    it('%%vocalfont with no size lands on the default size exactly', () => {
      // `size / DEFAULT` is 1 by construction here, so this is exact rather than a
      // rounding step away — see the conversion in layout.ts.
      const sized = 'X:1\nL:1/4\nK:C\nCDEF|\n%%vocalfont Times-Roman\nw: la la la la\n'
      const score = parse(sized, { mode: 'extended' }).scores[0]
      if (score === undefined) throw new Error('did not parse')
      const drawn = layout(score, { mode: 'extended' })
        .systems.flatMap((system) => system.staves.flatMap((staff) => staff.voices.flat()))
        .flatMap((element) => element.texts.filter((text) => text.role === 'lyric'))
      for (const text of drawn) expect(text.size).toBe(ENGRAVE.lyricTextSize)
    })
  })

  describe('I: is %% by another name (ABC 2.1 §11.4)', () => {
    it('routes a non-vocalfont directive too, so the two spellings cannot drift apart', () => {
      // `%%score` is the directive with the most behaviour behind it, so it is the one
      // worth proving goes through the shared handler rather than a vocalfont special
      // case. Voice ORDER is what `%%score` decides, so reversing it is observable.
      const viaPercent = 'X:1\nV:A\nV:B\n%%score B A\nK:C\nV:A\nC|\nV:B\nE|\n'
      const viaField = 'X:1\nV:A\nV:B\nI: score B A\nK:C\nV:A\nC|\nV:B\nE|\n'
      const order = (src: string) =>
        parse(src, { mode: 'extended' }).scores[0]?.voices.map((voice) => voice.id)
      expect(order(viaField)).toEqual(order(viaPercent))
      expect(order(viaField)).toEqual(['B', 'A'])
    })

    it('does not break the +: chain the way the generic field dispatch did', () => {
      // The regression in miniature, and the actual root cause of the leak: `I:` used to
      // fall into the generic field dispatch and set `lastFieldLetter = 'I'`. `I` is not
      // a continuable field, so the `+:` after it stopped continuing the `w:` and fell
      // through to scanMusic as music. No font involved.
      const src = 'X:1\nL:1/4\nK:C\nCDEF|\nw: la la\\\nI: vocalfont Times-Bold 16\n+: la la\n'
      const score = parse(src, { mode: 'extended' }).scores[0]
      const evs = score?.voices.flatMap((v) => v.measures.flatMap((m) => m.events)) ?? []
      expect(evs).toHaveLength(4)
      expect(evs.map((e) => (e.type === 'rest' ? null : e.lyric))).toEqual(['la', 'la', 'la', 'la'])
    })
  })
})
