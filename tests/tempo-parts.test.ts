/**
 * THE TEMPO MARK'S PARTS — a gate for an axis no other one can express.
 *
 * `Q:1/8=66` draws a beat-unit note above the staff, and abcjs gives it a FLAG. We drew a
 * bare stem for months and every gate in the repo was structurally unable to say so:
 *
 *   - `pixel-parity` and `corpus-abcjs-ranked` compare elements classed `abcjs-notehead`,
 *     and abcjs gives the tempo group's glyphs a `data-name` and NO class — its tempo
 *     notehead is not an `abcjs-notehead`. Neither table has ever had a row for one.
 *   - the baselines say CHANGED, never WRONG, and the tempo mark has looked like this
 *     since it was written.
 *   - the staff-line, above-lane and ycorr gates measure extents and lanes; the mark's own
 *     PARTS are not an extent, and the flag reserves nothing that moves a staff.
 *
 * So this is the third LADDER OF CONTROLS in the repo, after `above-lane-order` and
 * `glyph-ycorr`, and it is built the same way: one tune per rung, one variable per rung,
 * and abcjs's own answer recorded beside it.
 *
 * ── WHAT IS COMPARED, AND WHY IT IS NOT PIXELS ───────────────────────────────
 * The glyph KINDS, not their positions. abcts draws Bravura and abcjs draws its own font,
 * so their outlines have different boxes and a resolved centre cannot be compared without
 * re-deriving the outline difference — the same reason `pixel-parity` excludes outlines.
 * WHICH glyphs a mark is made of is outline-independent, and it is exactly the axis that
 * was blind: a missing flag is a missing PART, not a displaced one.
 *
 * Read off our LAYOUT TREE rather than our SVG, because our SVG deliberately does not name
 * glyphs — see `svg.ts`'s note on `data-name`, where abcjs tags each glyph and we tag only
 * the group. The tree is where the names live.
 *
 * ── THE ORACLE ───────────────────────────────────────────────────────────────
 * Measured 2026-08-08e off abcjs 6.7.0's own SVG for each tune below, rendered through
 * `Tools/abcjs-debug/dump-svg.js` and read out of its `data-name="tempo"` group. Recorded
 * here rather than regenerated, exactly as `above-lane-order` records its figures: these
 * are controls, and a control's expected value is a measurement, not a fixture.
 *
 * AND THE HEAD AND STEM DO NOT MOVE. Every rung below puts them at the quarter's own
 * coordinates to the hundredth, so the flag and the dot are purely ADDITIVE — which is why
 * a parts comparison is sufficient and a position one would add nothing.
 */
import { describe, expect, it } from 'vitest'
import { UNIT_PX } from '../src/renderer/abcjs-constants.js'
import { layout } from '../src/renderer/layout.js'
import { parse } from '../src/parser/parser.js'

/**
 * abcjs's glyph names → ours. Six entries, and the whole mapping the gate needs.
 *
 * `flags.u16nd` is deliberately absent: abcjs's own table maps a `3/32` beat unit to it
 * (`tempo-element.js:35`) and NO SUCH GLYPH EXISTS — a typo for `u16th`, so abcjs draws
 * nothing there. Reproducing the typo would mean dropping a flag we can draw; no rung
 * below writes `3/32`, and when one does it should be recorded as an abcjs BUG in
 * `ABCJS-DIFFERENCES.md` rather than silently matched.
 */
const ABCJS_GLYPHS: Readonly<Record<string, string>> = {
  'noteheads.quarter': 'noteheadBlack',
  'noteheads.half': 'noteheadHalf',
  'noteheads.whole': 'noteheadWhole',
  'flags.u8th': 'flag8thUp',
  'flags.u16th': 'flag16thUp',
  'flags.u32nd': 'flag32ndUp',
  'dots.dot': 'augmentationDot',
}

interface Rung {
  /** The `Q:` beat unit. */
  readonly unit: string
  /** abcjs's tempo-group glyphs, in ITS names, in the order its SVG emits them. */
  readonly abcjs: readonly string[]
  /** Whether abcjs draws a stem — every rung here does, but a whole note would not. */
  readonly stem: boolean
  /** The x of abcjs's `= 66`, absolute px. Recorded so the ADVANCE cannot drift unseen. */
  readonly rateX: number
}

const LADDER: readonly Rung[] = [
  // The baseline: a plain quarter, no flag and no dot.
  { unit: '1/4', abcjs: ['noteheads.quarter'], stem: true, rateX: 137.08 },
  // ONE FLAG. `+4.41` on the rate and nothing else moves.
  { unit: '1/8', abcjs: ['flags.u8th', 'noteheads.quarter'], stem: true, rateX: 141.49 },
  // TWO AND THREE FLAGS ARE ONE GLYPH EACH, not a repeated eighth flag — and they cost the
  // rate the SAME 4.41 as one, because abcjs's flag glyphs share a width.
  { unit: '1/16', abcjs: ['flags.u16th', 'noteheads.quarter'], stem: true, rateX: 141.49 },
  { unit: '1/32', abcjs: ['flags.u32nd', 'noteheads.quarter'], stem: true, rateX: 141.5 },
  // A DOT AND NO FLAG. A dotted quarter is `flags` 0 in our own `noteGlyph` too, so the
  // two engines agree on the shape before either draws it.
  { unit: '3/8', abcjs: ['dots.dot', 'noteheads.quarter'], stem: true, rateX: 143.53 },
  // BOTH AT ONCE, and the dot's cost (+6.45) SUBSUMES the flag's rather than adding to it:
  // 143.53 here and 143.53 for the dotted quarter, so the rate follows the element's right
  // edge and the dot is what sets it.
  {
    unit: '3/16',
    abcjs: ['flags.u8th', 'dots.dot', 'noteheads.quarter'],
    stem: true,
    rateX: 143.53,
  },
  // A DIFFERENT HEAD, which still takes a stem. The rate sits 0.42 further right than the
  // quarter's because the half head is wider — the advance is the head's, not a constant.
  { unit: '1/2', abcjs: ['noteheads.half'], stem: true, rateX: 137.5 },
  { unit: '3/4', abcjs: ['dots.dot', 'noteheads.half'], stem: true, rateX: 143.95 },
]

/**
 * abcjs prints its SVG coordinates to two decimals, so two marks that agree exactly can
 * still be recorded 0.01 apart. Nothing here is near that: the four rungs that differ at
 * all differ by 0.003–0.010px, and the other four are exact.
 */
const EPSILON = 0.02

/**
 * LAYOUT UNITS → abcjs PIXELS, which the gate compares against.
 *
 * CORRECTED: this read a hard-coded 7.75 because the layout was denominated in staff
 * spaces. It holds abcjs's own PIXELS now — the `UNIT_PX` knob in `abcjs-constants.ts` —
 * so the conversion is the knob, and a gate that hard-codes the old unit reports a
 * 29.84px error on a tempo mark that is exactly right. Same class as the three markup
 * gates that broke the same day: a gate built on our own representation fails when the
 * representation becomes abcjs's.
 */
const TO_PX = UNIT_PX

/** The tempo element's glyph names, in the order the layout emits them. */
function tempoGlyphs(abc: string): { glyphs: string[]; stem: boolean; rateX: number } {
  const parsed = parse(abc)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.errors[0]?.message ?? '?'}`)
  const score = parsed.scores[0]
  if (score === undefined) throw new Error('no tune parsed')
  const page = layout(score, {}) as unknown as Record<string, unknown>

  const glyphs: string[] = []
  let stem = false
  /** The `= 66` text's x MINUS the head's — the advance the flag and the dot widen. */
  let rateX = Number.NaN
  let headX = Number.NaN
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    const record = node as Record<string, unknown>
    if (record.type === 'tempo') {
      // THE FIRST ONE ONLY. A laid-out page reaches the same element object down more than
      // one path — the system's element list and the staff's — so a naive walk counts every
      // glyph twice and a parts comparison reads `[head, head]` for a plain quarter. The
      // gate would then have been unable to say anything at all, which is the failure mode
      // this file exists to close.
      if (glyphs.length > 0 || stem) return
      for (const g of (record.glyphs ?? []) as { name: string; x: number }[]) {
        // The NOTEHEAD's x, not the first glyph's — abcjs adds the flag and the dots
        // BEFORE the head (`createNoteHead` returns before `addHead`), so the first glyph
        // is a flag on any beat unit shorter than a quarter.
        if (g.name.startsWith('notehead')) headX = g.x
        glyphs.push(g.name)
      }
      for (const l of (record.lines ?? []) as { role?: string }[]) {
        if (l.role === 'stem') stem = true
      }
      for (const t of (record.texts ?? []) as { x: number }[]) rateX = t.x
      return
    }
    for (const key of Object.keys(record)) walk(record[key])
  }
  walk(page)
  return { glyphs, stem, rateX: (rateX - headX) * TO_PX }
}

/** The quarter is the baseline every other rung's advance is measured against. */
const QUARTER = LADDER[0] as Rung

describe('the tempo mark has the same PARTS as abcjs', () => {
  it('the gate can tell two different marks apart', () => {
    // A gate that cannot fail reports coverage it does not have, so both outcomes have to
    // be reachable through the same function the ladder uses.
    //
    // Deliberately NOT the flag pair. A canary that compares `Q:1/4` with `Q:1/8` is
    // asserting the fix rather than the instrument: before the flag existed those two
    // returned the same list, so the canary would have failed for the same reason every
    // rung did and proved nothing about whether the gate could SEE. The HEAD differs on
    // an axis this engine has always got right, which is what makes it independent.
    const quarter = tempoGlyphs('X:1\nQ:1/4=66\nK: C\nC\n')
    const half = tempoGlyphs('X:1\nQ:1/2=66\nK: C\nC\n')
    expect(quarter.glyphs).toEqual(['noteheadBlack'])
    expect(half.glyphs).toEqual(['noteheadHalf'])
  })

  for (const rung of LADDER) {
    it(`Q:${rung.unit}=66 — ${rung.abcjs.join(' + ')}`, () => {
      const { glyphs, stem, rateX } = tempoGlyphs(`X:1\nQ:${rung.unit}=66\nK: C\nC\n`)
      // Compared as SETS: abcjs emits its tempo group in its own paint order (flag, dot,
      // then head) and ours emits the head first. Which glyphs the mark is made of is the
      // parity statement; the order within one group paints identically either way.
      const want = [...rung.abcjs].map((g) => ABCJS_GLYPHS[g] ?? g).sort()
      expect([...glyphs].sort()).toEqual(want)
      expect(stem).toBe(rung.stem)

      // AND THE ADVANCE, because the parts alone would let a flag be drawn and the rate
      // left where it was. abcjs's `= 66` sits at `note.w + 5` from the head, and `note.w`
      // is the ABSELEM's width — so it grows with whatever `addRight` put in it. Compared
      // as a DELTA from the quarter's, which cancels the page margin and the head glyph's
      // own left bearing and leaves exactly what the flag and the dot are worth.
      const base = tempoGlyphs(`X:1\nQ:${QUARTER.unit}=66\nK: C\nC\n`).rateX
      expect(Math.abs(rateX - base - (rung.rateX - QUARTER.rateX))).toBeLessThan(EPSILON)
    })
  }
})
