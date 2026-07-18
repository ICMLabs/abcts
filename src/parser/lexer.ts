/**
 * Music-content lexer — translation of abcMusicKit2's `ABCLexer.swift`.
 *
 * A pull lexer, deliberately context-free and lenient: it never decides what is
 * musically valid, only what shape a run of characters has. There is no `note`
 * token — the parser assembles a note from `accidental* noteLetter octave* length`.
 * The parser owns line splitting and only runs this over music lines.
 */

export type TokenKind =
  | 'noteLetter'
  | 'accidental'
  | 'octaveUp'
  | 'octaveDown'
  | 'digit'
  | 'slash'
  | 'barline'
  | 'openBracket'
  | 'closeBracket'
  | 'inlineField'
  | 'chordSymbol'
  | 'decoration'
  | 'grace'
  | 'tie'
  | 'rest'
  | 'brokenRhythm'
  | 'lparen'
  | 'rparen'
  | 'voiceOverlay'
  | 'whitespace'
  | 'newline'
  | 'eof'
  | 'unknown'

export interface Token {
  readonly kind: TokenKind
  /** Offset into the buffer the lexer was constructed with. */
  readonly start: number
  readonly length: number
  /** The significant raw character — which accidental, which rest letter. */
  readonly aux: string
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9'
const isNoteLetter = (c: string): boolean => (c >= 'a' && c <= 'g') || (c >= 'A' && c <= 'G')
const isRestLetter = (c: string): boolean =>
  c === 'z' || c === 'x' || c === 'Z' || c === 'X' || c === 'y'

/** Scans to the matching close on the same line; unterminated runs stop at the newline. */
function delimited(src: string, from: number, close: string): number {
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '\n') return i
    if (c === close) return i + 1
  }
  return src.length
}

export class Lexer {
  private pos: number

  constructor(
    private readonly src: string,
    start = 0,
  ) {
    this.pos = start
  }

  next(): Token {
    const src = this.src
    const start = this.pos
    if (start >= src.length) return { kind: 'eof', start, length: 0, aux: '' }

    const c = src[start] as string
    const token = (kind: TokenKind, length: number, aux = c): Token => {
      this.pos = start + length
      return { kind, start, length, aux }
    }

    if (c === '\n') return token('newline', 1)
    if (c === ' ' || c === '\t' || c === '\r' || c === '\\') return token('whitespace', 1)

    if (isNoteLetter(c) && !isRestLetter(c)) return token('noteLetter', 1)
    if (isRestLetter(c)) return token('rest', 1)
    if (c === '^' || c === '_' || c === '=') return token('accidental', 1)
    if (c === "'") return token('octaveUp', 1)
    if (c === ',') return token('octaveDown', 1)
    if (c === '/') return token('slash', 1)
    if (c === '-') return token('tie', 1)
    if (c === '>' || c === '<') return token('brokenRhythm', 1)
    if (c === '(') return token('lparen', 1)
    if (c === ')') return token('rparen', 1)
    if (c === '&') return token('voiceOverlay', 1)

    if (isDigit(c)) {
      let i = start
      while (i < src.length && isDigit(src[i] as string)) i++
      return token('digit', i - start)
    }

    // Greedy run: `|`, `||`, `|]`, `:|`, `|:`, `::`, `[|` all lex as one barline.
    // `[` must be tested for a following `|` here, BEFORE the chord-open branch below —
    // otherwise `[|` opens a chord that never closes.
    if (c === '|' || c === ':' || (c === '[' && src[start + 1] === '|')) {
      let i = start + 1 // the opening char is part of the run by construction
      while (i < src.length) {
        const d = src[i]
        if (d !== '|' && d !== ':' && d !== ']') break
        i++
      }
      return token('barline', i - start)
    }

    // `[K:C]` is an inline field; a bare `[` opens a chord.
    if (c === '[') {
      if (start + 2 < src.length && src[start + 2] === ':') {
        return token('inlineField', delimited(src, start, ']') - start)
      }
      return token('openBracket', 1)
    }
    if (c === ']') return token('closeBracket', 1)

    if (c === '"') return token('chordSymbol', delimited(src, start, '"') - start)
    if (c === '{') return token('grace', delimited(src, start, '}') - start)
    if (c === '!') return token('decoration', delimited(src, start, '!') - start)
    if (c === '+') {
      // `+` is only a decoration when its closing `+` is on the same line.
      const end = delimited(src, start, '+')
      if (src[end - 1] === '+') return token('decoration', end - start)
      return token('unknown', 1)
    }

    return token('unknown', 1)
  }
}
