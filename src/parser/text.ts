/**
 * ABC §8.2 text-string decoding — translation of abcMusicKit2's `decodeTextString`.
 *
 * Applies to every user-facing string in an ABC file: titles, composer, lyrics,
 * annotations and chord symbols. Without it, `w:Xi\vao` renders literally as `Xi\vao`
 * instead of `Xiǎo`.
 */

/** `\'e` → é. The escape names a combining mark applied to the letter that follows. */
const COMBINING: Record<string, string> = {
  "'": '́', // acute
  '`': '̀', // grave
  '^': '̂', // circumflex
  '"': '̈', // diaeresis
  '~': '̃', // tilde
  '=': '̄', // macron
  '.': '̇', // dot above
  c: '̧', // cedilla
  v: '̌', // caron
  H: '̋', // double acute
  o: '̊', // ring above
  u: '̆', // breve
}

/** Octal 201-205 are the accidental glyphs by ABC/abcjs convention, not control chars. */
const OCTAL_ACCIDENTALS = ['♯', '♭', '♮', '\u{1d12a}', '\u{1d12b}']

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntity(name: string): string | null {
  const named = NAMED_ENTITIES[name]
  if (named !== undefined) return named
  const hex = /^#[xX]([0-9a-fA-F]+)$/.exec(name)
  if (hex?.[1]) return codePoint(Number.parseInt(hex[1], 16))
  const decimal = /^#(\d+)$/.exec(name)
  if (decimal?.[1]) return codePoint(Number.parseInt(decimal[1], 10))
  return null
}

function codePoint(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return null
  try {
    return String.fromCodePoint(value)
  } catch {
    return null
  }
}

const isHex = (s: string): boolean => /^[0-9a-fA-F]+$/.test(s)
const isOctalDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '7'

/**
 * Decode escapes and HTML entities in an ABC text string.
 *
 * Returns the input unchanged when it contains neither `\` nor `&`, which is the common
 * case — most lyrics and titles are plain text.
 */
export function decodeTextString(text: string): string {
  if (!text.includes('\\') && !text.includes('&')) return text

  const chars = [...text]
  let out = ''
  let i = 0

  while (i < chars.length) {
    const c = chars[i] as string

    if (c === '\\' && i + 1 < chars.length) {
      const next = chars[i + 1] as string

      if (next === '\\') {
        out += '\\'
        i += 2
        continue
      }
      // `\uXXXX` and `\UXXXXXXXX` code points. A malformed one falls through to the
      // unknown-escape path rather than silently eating the following characters.
      const width = next === 'u' ? 4 : next === 'U' ? 8 : 0
      if (width > 0) {
        const digits = chars.slice(i + 2, i + 2 + width).join('')
        const decoded =
          digits.length === width && isHex(digits) ? codePoint(Number.parseInt(digits, 16)) : null
        if (decoded !== null) {
          out += decoded
          i += 2 + width
          continue
        }
      }

      if (next === '#') {
        out += '♯' // sharp
        i += 2
        continue
      }
      if (next === 'b') {
        out += '♭' // flat
        i += 2
        continue
      }

      if (isOctalDigit(next)) {
        let j = i + 1
        let value = 0
        let digits = 0
        while (j < chars.length && digits < 3 && isOctalDigit(chars[j])) {
          value = value * 8 + Number.parseInt(chars[j] as string, 10)
          j++
          digits++
        }
        if (digits === 3 && value >= 0o201 && value <= 0o205) {
          out += OCTAL_ACCIDENTALS[value - 0o201] ?? ''
        } else {
          out += codePoint(value) ?? ''
        }
        i = j
        continue
      }

      // `\'e` — combining mark plus the following letter, composed to a single character.
      const mark = COMBINING[next]
      const target = chars[i + 2]
      if (mark !== undefined && target !== undefined && /\p{L}/u.test(target)) {
        out += (target + mark).normalize('NFC')
        i += 3
        continue
      }

      // `\/O` → Ø, `\/o` → ø; any other `\/x` keeps the base character.
      if (next === '/' && i + 2 < chars.length) {
        const base = chars[i + 2] as string
        out += base === 'O' ? 'Ø' : base === 'o' ? 'ø' : base
        i += 3
        continue
      }

      out += next // unknown escape: drop the backslash, keep the character
      i += 2
      continue
    }

    if (c === '&') {
      const semicolon = chars.indexOf(';', i + 1)
      if (semicolon !== -1 && semicolon - i <= 10) {
        const decoded = decodeEntity(chars.slice(i + 1, semicolon).join(''))
        if (decoded !== null) {
          out += decoded
          i = semicolon + 1
          continue
        }
      }
    }

    out += c
    i += 1
  }

  return out
}
