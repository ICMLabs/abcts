/**
 * **`abcjs-extended` — A GATE THAT CAN SAY *WRONG*, NOT ONLY *CHANGED*.**
 *
 * ── WHY IT HAD TO EXIST ─────────────────────────────────────────────────────
 * Every SVG gate in this repo is STRICT-ONLY: `svg-bytes`, `svg-bytes-sibling` and
 * `zzlive` all compare against abcjs, and abcjs is not what extended is trying to be.
 * What extended had was `extended-snapshot`, which records a HASH — so it can say a
 * rendering moved and never that it was wrong, and it holds a defect in place the moment
 * one is recorded.
 *
 * That is not a theory. Three real bugs shipped under it and were found by a human
 * looking at the renderings on 2026-09-07:
 *
 *   - `<defs>` ids were `g0`, `g1`, … per render, and an SVG id is DOCUMENT-global, so
 *     two extended scores on one page drew each other's glyphs;
 *   - every dynamic sat four pitch high, on the notes rather than in the lane below them,
 *     because its y-correction was inside a `strict` guard;
 *   - every UP-STEM drew on the wrong side of its notehead, because Bravura's anchors are
 *     published in STAFF SPACES and were being used as layout units.
 *
 * ── ⚠️ §1 AND §2 ARE GONE, AND THE REASON IS THE POINT ──────────────────────
 * They were a stem-side ladder and a dynamics-lane check, both written against STRICT as a
 * structural reference: assert the SIDE, never the number, because extended had its own
 * font and its own spacing engine.
 *
 * The owner's rule of 2026-09-07 removed the premise — *extended is byte-compatible with
 * strict except where a divergence is declared* — so the figures are no longer allowed to
 * differ either, and `tests/mode-bytes.test.ts` compares all 691 fixtures byte for byte.
 * That is a strictly stronger statement than either row, and it caught what they were
 * written for on its first run: extended was diverging on **675 of 691** fixtures, of
 * which eleven were declared.
 *
 * Their two defects cannot recur: an up-stem's side and a dynamic's lane are now the same
 * arithmetic in both modes, and a byte gate sees a one-pixel move where a side check saw
 * nothing.
 *
 * ── AND THE AUDIO ───────────────────────────────────────────────────────────
 * The audio gates all run through `compat`, which hard-wires strict, so extended's audio
 * was never measured at all. A mode is a PARSING difference before it is an engraving
 * one, so it can change what you hear — and where it does, it must be a NAMED, deliberate
 * fix rather than a side effect of an engraving change. §3.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flattenAudio } from '../src/audio/flatten.js'
import { parse } from '../src/index.js'

const fixtures = join(import.meta.dirname, 'corpus-abcjs', 'fixtures')
const files = readdirSync(fixtures)
  .filter((f) => f.endsWith('.abc'))
  .sort()

/**
 * **§3 — THE AUDIO, WHICH NO GATE REACHED.**
 *
 * `audio-ranked`, `midi-bytes`, `timing` and the rest all go through `compat`, which
 * hard-wires `abcjs-strict`. So nothing measured what extended SOUNDS like, and a mode is
 * a PARSING difference before it is an engraving one — `+:`, an inline `[U:`, a
 * three-quarter tone — so it can change the notes.
 *
 * **Where it does, that must be DELIBERATE AND NAMED.** Every slug below is a documented
 * mode split; anything else is an engraving change that has leaked into the audio, which
 * is the failure this gate exists to catch.
 */
const AUDIO_DIFFERS: readonly string[] = [
  /** Microtones: extended sounds the quarter tone, strict rounds it — `ABCJS-DIFFERENCES`. */
  'abcts-ledger-gaps-4#2',
  'abcts-stafflines-and-modifiers#25',
  /** An accidental abcjs mis-parses and extended reads per ABC 2.1: pitch 60 against 61. */
  'abcts-stafflines-and-modifiers#23',
  /** `[U:` defines a macro in extended and is a failed CHORD in abcjs — volume 105 vs 127. */
  'abcts-text-udef-parts-overlays#43',
  'abcts-text-udef-parts-overlays#44',
]

describe('abcjs-extended, what it sounds like', () => {
  it('changes the audio ONLY where a documented parsing fix says it should', () => {
    const unexpected: string[] = []
    const stale: string[] = []
    for (const f of files) {
      const abc = readFileSync(join(fixtures, f), 'utf-8')
      let ps: ReturnType<typeof parse>
      let pe: ReturnType<typeof parse>
      try {
        ps = parse(abc, { mode: 'abcjs-strict' })
        pe = parse(abc, { mode: 'abcjs-extended' })
      } catch {
        continue
      }
      const n = Math.min(ps.scores?.length ?? 0, pe.scores?.length ?? 0)
      for (let t = 0; t < n; t += 1) {
        const slug = `${f.replace(/\.abc$/, '')}#${t}`
        let a: string
        let b: string
        try {
          a = JSON.stringify(flattenAudio(ps.scores[t] as never))
          b = JSON.stringify(flattenAudio(pe.scores[t] as never))
        } catch (err) {
          unexpected.push(`${slug} THREW ${(err as Error).message.slice(0, 60)}`)
          continue
        }
        const named = AUDIO_DIFFERS.includes(slug)
        if (a !== b && !named) {
          let i = 0
          while (i < Math.min(a.length, b.length) && a[i] === b[i]) i += 1
          unexpected.push(`${slug} at ${i}`)
        }
        if (a === b && named) stale.push(slug)
      }
    }
    expect(unexpected.slice(0, 15), 'extended changed the audio where nothing says it may').toEqual(
      [],
    )
    // A slug that has stopped differing is a rule that moved: read it, do not delete it.
    expect(stale, 'these agree now — remove them from AUDIO_DIFFERS').toEqual([])
  })
})
