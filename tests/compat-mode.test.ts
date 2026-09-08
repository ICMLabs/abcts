/**
 * **`AbcjsParams.mode` — abcts's ONE ADDITION TO abcjs'S PARAMS.**
 *
 * abcjs has no such option; it has only itself to be. Without one, `abcjs-extended` was
 * reachable through `parse`/`render` alone, so a drop-in host could not get at the parsing
 * fixes or the engraving abcjs lacks without abandoning the API it already calls.
 *
 * ── WHY IT IS SAFE NOW AND WAS NOT BEFORE ────────────────────────────────────
 * Under the owner's rule of 2026-09-07 extended is byte-identical to strict except for the
 * divergences declared in `Docs/ABCJS-DIFFERENCES.md`, and `tests/mode-bytes.test.ts` holds
 * all 691 corpus fixtures to it. Before that rule this option would have handed a host a
 * different engraving engine — Bravura outlines, abcm2ps spacing — under the name of a
 * compatibility flag.
 *
 * ── WHAT THIS FILE ASSERTS, AND WHY EACH ROW ─────────────────────────────────
 * The mode had THREE hard-wired `"abcjs-strict"` literals on this path — the parse, the
 * measure-width layout and the emitter — and a fix to one alone leaves a pipeline that
 * disagrees with itself. Each row below can only pass if the mode travelled all the way to
 * one of them.
 */
import { describe, expect, it } from 'vitest'
import { parseOnly, tuneMetrics } from '../src/compat/index.js'
import { parse as coreParse } from '../src/index.js'
import { STAFF_SPACE_PX } from '../src/renderer/abcjs-constants.js'
import { render } from '../src/renderer/index.js'
import { renderAll } from './render-all.js'

type Mode = 'abcjs-strict' | 'abcjs-extended'

/** A three-quarter tone: abcjs draws NOTHING, extended draws the glyph. Declared. */
const MICROTONE = 'X:1\nT:Micro\nL:1/4\nK:C\n^3/2C DEF|\n'
/**
 * SIX of them over two bars — the WIDTH control, and it had to be this long. See "reaches
 * the measure widths".
 */
const MANY_MICROTONES = 'X:1\nL:1/4\nK:C\n^3/2C ^3/2D ^3/2E ^3/2F|^3/2G ^3/2A|\n'
/** `[U:` is not one of abcjs's eight inline fields, so abcjs reads a failed CHORD. */
const UDEF = 'X:1\nT:Udef\nK:C\nL:1/4\n[U:n=!accent!]nCDEF|\n'

const svg = (abc: string, mode?: Mode): string =>
  renderAll(abc, mode === undefined ? {} : { mode })[0]?.svg ?? ''

describe('AbcjsParams.mode', () => {
  it('defaults to abcjs-strict, so a drop-in call is byte-unchanged', () => {
    expect(svg(MICROTONE)).toBe(svg(MICROTONE, 'abcjs-strict'))
    expect(svg(UDEF)).toBe(svg(UDEF, 'abcjs-strict'))
  })

  /**
   * ⚠️ **THIS ROW IS THE INSTRUMENT'S OWN CONTROL.** If the option were ignored the two
   * sides would be equal and every row below would pass by measuring nothing — the same
   * shape of mute check that cost this repo four probes. A DECLARED divergence is used
   * precisely because it is known to be visible.
   */
  it('actually changes the rendering on a declared divergence', () => {
    expect(svg(MICROTONE, 'abcjs-extended')).not.toBe(svg(MICROTONE, 'abcjs-strict'))
  })

  /**
   * The PARSER half, which an SVG comparison cannot isolate: `[U:` defines a macro in
   * extended and is a failed chord in abcjs, so strict raises warnings and extended does
   * not. A mode that reached the emitter but not the parser passes the row above and fails
   * this one.
   */
  it('reaches the parser, not only the drawing', () => {
    const warnings = (mode?: Mode): number =>
      (renderAll(UDEF, mode === undefined ? {} : { mode })[0]?.warnings ?? []).length
    expect(warnings('abcjs-strict')).toBeGreaterThan(0)
    expect(warnings('abcjs-extended')).toBe(0)
  })

  /**
   * ⚠️ **AND `parseOnly` IS A SECOND ENTRY POINT.** A host reading `tune.warnings` from the
   * headless call and drawing with `renderAbc` must get one answer; both go through
   * `renderInto`, and this says so rather than assuming it.
   */
  it("reaches compat's headless parseOnly too", () => {
    expect(parseOnly(UDEF, { mode: 'abcjs-extended' })[0]?.warnings ?? []).toEqual([])
    expect((parseOnly(UDEF)[0]?.warnings ?? []).length).toBeGreaterThan(0)
  })

  /**
   * The LAYOUT half. `getMeasureWidths` lays the tune out AGAIN at width 0 and had its own
   * `"abcjs-strict"` literal, so an extended tune reported strict's widths.
   *
   * ⚠️ **AND THE OBVIOUS CONTROL IS MUTE.** A single `^3/2C` reports 48.24 in BOTH modes —
   * one accidental is absorbed by the room the note already takes in a minimum layout — so
   * a row written with `MICROTONE` would have passed with the literal still in place. Six
   * shapes were measured before one moved: six microtones over two bars is
   * `[48.24, 37.62]` strict against `[98.46, 71.10]` extended.
   */
  it('reaches the measure widths', () => {
    const widths = (mode: Mode): number[] =>
      tuneMetrics(MANY_MICROTONES, { mode })[0]?.sections.flatMap((s) => s.measureWidths) ?? []
    expect(widths('abcjs-strict').length).toBeGreaterThan(0)
    expect(widths('abcjs-extended')).not.toEqual(widths('abcjs-strict'))
  })

  /**
   * **ONE ENGINE, NOT TWO.** compat and core must DRAW the same tune identically in the
   * same mode.
   *
   * ⚠️ Compared as the BODY rather than as bytes: compat also writes an `aria-label`, a
   * `<title>` and a `pageWidth` that a bare `render` call has no way to know, so whole-file
   * equality here would assert the wrapper rather than the engraving.
   *
   * ⚠️ **AND NOT AS `transform="translate(…)"` EITHER — THERE ARE NONE.** abcjs bakes a
   * glyph's absolute position into the first `M` of its path data (`creation/glyphs.js`),
   * and the emitter draws abcjs's shapes in both modes now, so no glyph carries a transform
   * at all. A first cut matched on one, found ZERO paths in both engines, and would have
   * compared two empty lists and passed. The count assertion below is what caught it, and
   * is why it is there.
   */
  it('draws the same body as the core API, in both modes', () => {
    // Everything after the root tag and its `<style>`/`<title>` pair: the drawing itself.
    const body = (out: string): string => out.slice(out.indexOf('</title>') + 1)
    for (const mode of ['abcjs-strict', 'abcjs-extended'] as const) {
      const parsed = coreParse(MANY_MICROTONES, { mode })
      if (!parsed.ok) throw new Error('did not parse')
      const score = parsed.scores[0]
      if (score === undefined) throw new Error('no score')
      const core = render(score, {
        mode,
        classes: 'abcjs',
        staffSpace: STAFF_SPACE_PX,
        // compat's own sum: abcjs's default screen staffwidth plus its two 15px margins.
        systemWidth: 740 + 30,
      })
      const fromCompat = body(svg(MANY_MICROTONES, mode))
      expect((fromCompat.match(/<path/g) ?? []).length, mode).toBeGreaterThan(4)
      expect(fromCompat, mode).toBe(body(core))
    }
  })
})
