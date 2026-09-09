/**
 * **abcjs's KEY SIGNATURES, WHICH ARE A TABLE AND NOT ARITHMETIC.**
 *
 * abcts computed fifths from the circle and clamped to ±7. abcjs computes nothing:
 * `relativeMajor` maps a spelling to its relative major through a reverse index of 16
 * majors × 10 mode spellings, then `keyAccidentals` looks THAT up in a 23-entry table —
 * which carries five off-spec enharmonics under abcjs's own comment *"These SOUND the same
 * as what's written, but they aren't right"*. A spelling in neither returns `null`, and
 * `transpose.keySignature`'s `if (!k) return multilineVars.key` hands back the key IN
 * FORCE, after which `multilineVars.key.mode = mode` overwrites the mode alone
 * (`abc_parse_key_voice.js:314-317`).
 *
 * Measured against abcjs 6.7.0 live: **48 of 168 header spellings and 128 of 336 inline
 * changes differed**. Both are zero now. No corpus tune writes an impossible key, so no
 * gate in this repo could see it — it was found by writing the control a `ponytail:` marker
 * predicted nobody would (`scripts/zzledger.mjs`).
 *
 * ⚠️ **THE ROWS BELOW ARE abcjs's ANSWERS, NOT MUSIC THEORY.** `A#` major is two FLATS here.
 * Anyone who "corrects" one of these to the theoretically right value breaks strict parity,
 * which is the whole contract. Re-harvest with `scripts/harvest-abcjs-keys.mjs` rather than
 * editing a number.
 */
import { describe, expect, it } from 'vitest'
import { ABCJS_KEYS } from '../src/core/keys-abcjs.js'
import type { DiatonicStep, KeySignature, Mode } from '../src/core/model.js'
import { Accidental, abcjsKeepsKey, keyFifths } from '../src/core/model.js'

const key = (step: DiatonicStep, accidental: Accidental, mode: Mode): KeySignature => ({
  tonic: { step, accidental },
  mode,
  none: false,
})

describe("abcjs's key table", () => {
  /**
   * The five off-spec enharmonics abcjs ships, verbatim from its own file. Arithmetic gives
   * every one of these ±8 or more; the table gives what is here.
   */
  it("takes abcjs's five off-spec enharmonics", () => {
    expect(keyFifths(key('a', Accidental.sharp, 'major'))).toBe(-2)
    expect(keyFifths(key('b', Accidental.sharp, 'major'))).toBe(0)
    expect(keyFifths(key('d', Accidental.sharp, 'major'))).toBe(-3)
    expect(keyFifths(key('e', Accidental.sharp, 'major'))).toBe(-1)
    expect(keyFifths(key('g', Accidental.sharp, 'major'))).toBe(-4)
  })

  /**
   * ⚠️ **THE CONTROL, and the rows above are worthless without it.** If the table were
   * consulted for everything and were wrong, or ignored entirely, the ordinary keys would
   * move — and every real tune is an ordinary key. Table and arithmetic agree on all of
   * them, which is what makes this change safe for anything anyone actually writes.
   */
  it('leaves every key the circle of fifths can reach exactly where it was', () => {
    const ORDINARY: [DiatonicStep, Accidental, Mode, number][] = [
      ['c', Accidental.natural, 'major', 0],
      ['g', Accidental.natural, 'major', 1],
      ['d', Accidental.natural, 'major', 2],
      ['f', Accidental.natural, 'major', -1],
      ['b', Accidental.flat, 'major', -2],
      ['e', Accidental.flat, 'major', -3],
      ['a', Accidental.natural, 'minor', 0],
      ['e', Accidental.natural, 'minor', 1],
      ['d', Accidental.natural, 'dorian', 0],
      ['g', Accidental.natural, 'mixolydian', 0],
      ['f', Accidental.sharp, 'major', 6],
      ['c', Accidental.flat, 'major', -7],
    ]
    for (const [step, acc, mode, fifths] of ORDINARY)
      expect(keyFifths(key(step, acc, mode)), `${step}${acc}${mode}`).toBe(fifths)
  })

  /**
   * A spelling abcjs has no entry for. `keeps` is what stops an inline `[K:]` changing
   * anything — it redraws the key in force — and it cannot be inferred from `fifths`,
   * because the header seed for the same spelling is a real number.
   */
  it('marks the spellings abcjs does not recognise', () => {
    expect(abcjsKeepsKey(key('c', Accidental.flat, 'minor'))).toBe(true)
    expect(abcjsKeepsKey(key('c', Accidental.sharp, 'lydian'))).toBe(true)
    expect(abcjsKeepsKey(key('g', Accidental.flat, 'minor'))).toBe(true)
    // …and does recognise.
    expect(abcjsKeepsKey(key('d', Accidental.natural, 'major'))).toBe(false)
    expect(abcjsKeepsKey(key('a', Accidental.sharp, 'major'))).toBe(false)
  })

  /**
   * ⚠️ **A HARVESTED TABLE IS ALSO A CLAIM ABOUT ITS OWN SHAPE.** If a re-harvest came back
   * empty, or with every row `keeps`, every assertion above would still pass while the
   * engine had lost the table — which is exactly how the harvest's own first two probes
   * failed (231 of 231 "unrecognised", twice, for two different reasons).
   */
  it('is a table of the size it was harvested at', () => {
    const rows = Object.entries(ABCJS_KEYS)
    expect(rows.length).toBe(147)
    expect(rows.filter(([, v]) => v.keeps).length).toBe(37)
    expect(rows.filter(([, v]) => !v.keeps).length).toBe(110)
  })
})
