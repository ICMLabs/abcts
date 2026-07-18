import { describe, expect, it } from 'vitest'
import { decodeTextString } from '../src/parser/text.js'

// ABC §8.2 text escapes. These reach titles, composer, lyrics, annotations and chord
// symbols alike — anything a human reads.
describe('decodeTextString', () => {
  it('returns plain text untouched', () => {
    expect(decodeTextString('Simple C')).toBe('Simple C')
    expect(decodeTextString('')).toBe('')
  })

  it('composes accent escapes onto the following letter', () => {
    expect(decodeTextString('Fr\\`ere Jacques')).toBe('Frère Jacques')
    expect(decodeTextString("caf\\'e")).toBe('café')
    expect(decodeTextString('Xi\\vao')).toBe('Xiǎo')
    expect(decodeTextString('chu\\=an')).toBe('chuān')
    expect(decodeTextString('\\"o')).toBe('ö')
    // ç is `\c` (cedilla) + the letter `c` — so the source reads `gar\ccon`.
    expect(decodeTextString('gar\\ccon')).toBe('garçon')
  })

  it('handles the slashed-O escape', () => {
    expect(decodeTextString('\\/O')).toBe('Ø')
    expect(decodeTextString('\\/o')).toBe('ø')
  })

  it('decodes code-point escapes', () => {
    expect(decodeTextString('\\u0041')).toBe('A')
    expect(decodeTextString('\\U0001D12A')).toBe('\u{1d12a}')
  })

  it('decodes octal escapes, mapping 201-205 to accidental glyphs', () => {
    // Without the special case these would be control characters U+0081..U+0085.
    expect(decodeTextString('\\201')).toBe('♯')
    expect(decodeTextString('\\202')).toBe('♭')
    expect(decodeTextString('\\203')).toBe('♮')
    expect(decodeTextString('\\101')).toBe('A') // ordinary octal
  })

  it('decodes the shorthand accidental escapes', () => {
    expect(decodeTextString('B\\b')).toBe('B♭')
    expect(decodeTextString('F\\#')).toBe('F♯')
  })

  it('decodes HTML entities, named and numeric', () => {
    expect(decodeTextString('Bach &amp; Sons')).toBe('Bach & Sons')
    expect(decodeTextString('&#65;')).toBe('A')
    expect(decodeTextString('&#x41;')).toBe('A')
  })

  it('keeps a literal backslash and drops an unknown escape', () => {
    expect(decodeTextString('a\\\\b')).toBe('a\\b')
    expect(decodeTextString('\\q')).toBe('q')
  })

  it('leaves a malformed entity alone rather than eating characters', () => {
    expect(decodeTextString('a & b')).toBe('a & b') // no semicolon
    expect(decodeTextString('&notanentity;')).toBe('&notanentity;')
  })

  it('falls back to the breve escape when \\u is not followed by hex', () => {
    // `u` is BOTH the code-point marker and the breve accent, so a malformed `\uXXXX`
    // does not pass through untouched — it decodes as breve-over-the-next-letter.
    // Matches v2, which tries the hex form first and falls through the same way.
    expect(decodeTextString('\\uZZZZ')).toBe('Z\u0306ZZZ')
    // NFC composes where a precomposed form exists (ă is U+0103); Z-breve has none.
    expect(decodeTextString('\\ua')).toBe('\u0103')
  })
})
