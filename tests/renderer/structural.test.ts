/**
 * Structural render gate — core layout vs abcjs's laid-out elements.
 *
 * WHY THIS AND NOT THE SVG GOLDENS. The 503 golden SVGs are abcjs output, so comparing
 * bytes against them gates COMPAT mode. Core renders in its own visual style by design,
 * so byte comparison would either fail forever or force core to be abcjs. What must not
 * drift is where the music LANDS: the element sequence, and the staff line or space each
 * notehead sits on. `*.elements.json` carries exactly that and is style-independent —
 * abcjs's spacing constants, glyph choices and pixel positions are never compared.
 *
 * ── WHAT THIS GATE DOES NOT SEE ──────────────────────────────────────────────
 * Stated plainly, because the parser phase's worst failure was a blind spot mistaken for
 * coverage: a parity key compared step and octave only, so every accidental was
 * unverified across the whole corpus while the suite reported MATCH.
 *
 *  1. FIRST TUNE ONLY. `layout()` takes `scores[0]`, and abcjs's element dump likewise
 *     covers only the first tune. `clefs` is eight tunes — treble, bass, tenor, alto —
 *     and this gate compares the first, so seven clefs are untested by a green result.
 *  2. FIRST VOICE ONLY. Both sides read voice 0. `voice-octave-shift` passes on its
 *     unshifted voice 1, so it does NOT settle the octaveShift question in CHECKPOINT
 *     risk 3 — that needs voice 2.
 *  3. NOTEHEAD SPINE ONLY. Slurs, ties, grace notes, chord symbols, decorations,
 *     annotations and ACCIDENTALS are not `children` elements in abcjs's layout, so a
 *     fixture named for one of them passes without that feature being rendered at all.
 *     `vree-grace-notes` and `curves` are green and neither grace notes nor slurs are
 *     drawn; `vree-sharps` is green and no accidental is drawn on any note. Accidentals
 *     are called out because they are where the parser audit's blind spot lived.
 *  4. REST POSITION. Compared as presence only. abcjs anchors every rest at its own
 *     pitch 7 whatever the duration, because its glyphs carry different origins than
 *     SMuFL's; a whole rest hangs below its origin and a half rest sits above it. The
 *     two conventions are not comparable, so only the rest's existence is gated.
 *  5. NO VISUAL PROPERTIES. Spacing, stem direction and length, beams, ledger lines. A
 *     regression preserving sequence and positions passes here. Committed visual
 *     baselines are the second half of this gate and are not built yet.
 *
 * Green here means "the right noteheads landed on the right lines, in the right order,
 * in the first voice of the first tune". It does not mean the fixture renders correctly.
 */
import { describe, expect, it } from 'vitest'
import { parse } from '../../src/parser/parser.js'
import { layout } from '../../src/renderer/layout.js'
import { type GoldenLayoutElement, goldenLayoutElements, loadCorpus } from '../corpus/corpus.js'

/**
 * Fixtures whose element sequence core reproduces today, subject to the blind spots above.
 *
 * Every other fixture is asserted to still diverge, so this list cannot rot: teach core
 * to render rests and the rest-bearing fixtures fail as unexpected matches, forcing the
 * list to be updated rather than letting coverage grow silently and unrecorded. Same
 * anti-rot property `KNOWN_DIVERGENCES` has in the parser gate.
 */
const RENDERABLE = [
  'S1-decorations',
  'S3-note-syntax',
  'S5-directives',
  'S6-keys',
  'S8-layout',
  'brother-john-inline-voices',
  'center-text',
  'chord-grid',
  'clefs',
  'curves',
  'multi-voice-lyrics-two-voices',
  'multi-voice-rest-collision',
  'multi-voice-rest-placement',
  'missing-decorations',
  'multi-voice-triplet-brackets',
  'score-reorder',
  'score-reorder-shared',
  'simple-c',
  'stacked-annotations',
  'tunebook-3',
  'twinkle',
  'voice-middle-after-clef',
  'voice-octave-shift',
  'vree-compound-meter',
  'vree-grace-notes',
  'vree-sharps',
  'vree-slurs-and-triplets',
  'vree-ties-across-bars',
]

/**
 * abcjs numbers staff positions with 0 = C4, so a treble middle line (B4) is 6. Core puts
 * 0 on the middle line — abcMusicKit2's convention — so the two differ by a constant.
 * Derived from the data, not assumed: in `simple-c`, `CDEF|GABc` carries abcjs pitches
 * 0..7, and the treble clef glyph sits at 4, which is G4, the line its curl marks.
 */
const ABCJS_MIDDLE_LINE = 6

/**
 * abcjs's element vocabulary → core's. An unmapped type falls through as itself, so a
 * kind neither side handles surfaces as a mismatch instead of being quietly skipped.
 */
const TYPE_MAP: Readonly<Record<string, string>> = {
  note: 'note',
  rest: 'rest',
  bar: 'bar',
  'staff-extra clef': 'clef',
  'staff-extra key-signature': 'keySignature',
  'staff-extra time-signature': 'timeSignature',
}

/** A comparable step: `type@staffStep`, the step omitted where it is meaningless. */
const describeGolden = (el: GoldenLayoutElement): string => {
  const type = TYPE_MAP[el.type] ?? el.type
  const head = el.heads?.[0]
  return type === 'note' && head ? `note@${head.pitch - ABCJS_MIDDLE_LINE}` : type
}

function coreSequence(abc: string): string[] {
  const result = parse(abc)
  const score = result.scores[0]
  if (!score) return []
  return layout(score).systems.flatMap((system) =>
    system.elements.map((el) => (el.staffStep === null ? el.type : `${el.type}@${el.staffStep}`)),
  )
}

const goldenSequence = (name: string): string[] => goldenLayoutElements(name).map(describeGolden)

describe('structural render parity vs abcjs layout', () => {
  const corpus = loadCorpus()
  const byName = new Map(corpus.map((c) => [c.name, c]))

  describe('the gate itself', () => {
    // The parser phase shipped a fuzz suite whose expectation never ran: it passed while
    // three crashes were live. A gate that cannot fail is worse than no gate, because it
    // reports coverage it does not have. These two tests exist to fail if that recurs.

    it('reads the layout goldens', () => {
      expect(goldenSequence('simple-c')).toEqual([
        'clef',
        'timeSignature',
        'note@-6',
        'note@-5',
        'note@-4',
        'note@-3',
        'bar',
        'note@-2',
        'note@-1',
        'note@0',
        'note@1',
        'bar',
      ])
    })

    it('is sensitive to staff position, not just element type', () => {
      // The exact failure mode of the parser audit: a key that compares only coarse
      // structure reports MATCH on a note sitting on the wrong line. Move one notehead
      // by a single step and the comparison must notice.
      const golden = goldenSequence('simple-c')
      const nudged = golden.map((s, i) => (i === 2 ? 'note@-5' : s))
      expect(nudged).not.toEqual(golden)
    })
  })

  describe('renderable', () => {
    for (const name of RENDERABLE) {
      it(`${name} — element sequence and staff positions match`, () => {
        const fixture = byName.get(name)
        expect(fixture, `${name} is in RENDERABLE but not in the corpus`).toBeDefined()
        const golden = goldenSequence(name)
        // A fixture with no golden elements would "match" core's empty output and mean
        // nothing — the emptiness bug that hid ten fixtures until it was checked for.
        expect(golden.length, `${name} has an empty layout golden`).toBeGreaterThan(0)
        expect(coreSequence(fixture?.abc ?? '')).toEqual(golden)
      })
    }
  })

  describe('not yet renderable', () => {
    const notYet = corpus.filter((c) => !RENDERABLE.includes(c.name))
    for (const fixture of notYet) {
      it(`${fixture.name} — still diverges, so absent from RENDERABLE`, () => {
        let core: string[]
        try {
          core = coreSequence(fixture.abc)
        } catch {
          return // A throw is a legitimate way to not-yet-render.
        }
        expect(core, `${fixture.name} now matches abcjs layout — add it to RENDERABLE`).not.toEqual(
          goldenSequence(fixture.name),
        )
      })
    }
  })
})
