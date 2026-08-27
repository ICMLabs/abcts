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

/**
 * **THE EIGHT INLINE FIELDS abcjs HAS, AND IT HAS NO OTHERS.**
 * `letter_to_inline_header` is a switch on `line.substring(i, i+3)` with exactly these arms
 * (`abc_parse_header.js:347-410`) — anything else falls past it, so abcjs reads the `[` as a
 * CHORD, fails, and warns its way through the characters one at a time.
 *
 * Both corpora between them write `[V:` 201 times, `[K:` 78, `[Q:` 24, `[M:` 14, `[I:` 4,
 * `[L:` 3, `[P:` 2 and `[r:` once — **this set exactly, and nothing else.**
 */
const ABCJS_INLINE_FIELDS = new Set(['I', 'M', 'K', 'P', 'L', 'Q', 'V', 'r'])

export class Lexer {
  private pos: number

  constructor(
    private readonly src: string,
    start = 0,
    /**
     * **`abcjs-strict` ONLY, and it decides whether `[U:…]` IS A FIELD AT ALL.** See
     * `ABCJS_INLINE_FIELDS` and the mode split in `Docs/ABCJS-DIFFERENCES.md`: abcjs has no
     * inline `U:`, `w:` or `T:`, and strict reproduces that; `abc2.1` and `extended` read
     * them as ABC 2.1 says to. Ruled by the owner on 2026-08-27 — the FEATURE stays.
     */
    private readonly strictFields = false,
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

    // Greedy run: `|`, `||`, `|]`, `|:`, `[|` all lex as one barline.
    // `[` must be tested for a following `|` here, BEFORE the chord-open branch below —
    // otherwise `[|` opens a chord that never closes.
    // A LONE `:` is not a barline: it is the separator in the general tuplet form
    // `(p:q:r`. It only joins a barline next to `|` or another `:`.
    const colonStartsBarline = c === ':' && (src[start + 1] === '|' || src[start + 1] === ':')
    /**
     * ⚠️ **AND THE COLON ARM IS NOT A GREEDY RUN — `:|:` IS A RIGHT REPEAT AND A WARNING.**
     * `getBarLine`'s `:` branch is a fixed decision tree, and its `:|` case falls through to
     * `{len: 2, token: "bar_right_repeat"}` for anything that is not `]` or `|`
     * (`abc_tokenizer.js:175-203`). So the trailing `:` of `:|:` is NOT consumed: abcjs
     * re-enters on it, reaches `default: {len: 1, warn: "Unknown bar symbol"}`, and draws a
     * plain close repeat with no reopening dots at all.
     *
     * MEASURED on `|:CDEF:|:GABc:|` — abcjs's middle bar is two lines and two dots where
     * ours drew three lines and four, and the extra ink pushed every note of the first bar
     * 1px left. `:||:` (len 4) and `::` (len 2) ARE double repeats, and both were already
     * exact, which is why a greedy run looked right: **the three spellings of one barline
     * agree everywhere except the shortest.**
     *
     * The four lengths, in abcjs's own order — longest first so a prefix cannot win.
     */
    const colonBarLength = (): number => {
      const at = (n: number): string => src[start + n] ?? ''
      if (at(1) === ':') return 2 // `::` — bar_dbl_repeat
      if (at(1) !== '|') return 0 // a lone `:` is the tuplet separator, not a bar
      if (at(2) === ']') return at(3) === '|' && at(4) === ':' ? 5 : 3 // `:|]|:` / `:|]`
      if (at(2) === '|') return at(3) === ':' ? 4 : 3 // `:||:` / `:||`
      return 2 // `:|`, and the tree stops here whatever follows
    }
    if (colonStartsBarline) {
      const length = colonBarLength()
      if (length > 0) return token('barline', length)
    }
    if (c === '|' || (c === '[' && src[start + 1] === '|')) {
      let i = start + 1 // the opening char is part of the run by construction
      while (i < src.length) {
        const d = src[i]
        if (d !== '|' && d !== ':' && d !== ']') break
        i++
      }
      return token('barline', i - start)
    }

    // `[` BEFORE A DIGIT OR A QUOTE IS AN INVISIBLE BARLINE, one character long —
    // `if ((line[i] >= '1' && line[i] <= '9') || line[i] === '"') return {len: 1, token:
    // "bar_invisible"}` (`abc_tokenizer.js:215-217`). That is how `[1 …` and `[2 …` write
    // a repeat ending with no barline before it, and how `["D"…` opens one carrying a
    // chord. Lexed as a chord instead, the whole ending ran together at one x:
    // `visual-layout-09` had seven noteheads stacked on the same 82.5.
    if (c === '[' && (src[start + 1] ?? '') >= '1' && (src[start + 1] ?? '') <= '9') {
      return token('barline', 1)
    }
    if (c === '[' && src[start + 1] === '"') return token('barline', 1)

    // `[K:C]` is an inline field; a bare `[` opens a chord.
    if (c === '[') {
      if (
        start + 2 < src.length &&
        src[start + 2] === ':' &&
        // …and in STRICT only the eight abcjs knows — see `ABCJS_INLINE_FIELDS`.
        (!this.strictFields || ABCJS_INLINE_FIELDS.has(src[start + 1] as string))
      ) {
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

      // UNCLOSED. abcjs does not fall back to a single character here, and the difference
      // is visible: its `getBrackettedSubstring` gives up after `maxErrorChars` (5) so
      // that "a missing end quote won't eat up the entire line", consuming SIX characters
      // — the `+` and five more — clamped to the end of the line.
      //
      // This is only reachable on malformed input, where prose is being read as music.
      // frere-jacques is the case: abcjs does not implement `+:` continuations, so
      // `+:belongs to their…` is lexed as notes. Consuming one character started that at
      // the `b` of "belongs"; consuming six lands on `n`, which is not a note letter, so
      // the first note becomes the `g` — which is where abcjs starts. 50 notes against
      // its 45 was entirely this.
      const lineEnd = src.indexOf('\n', start)
      const lastIndex = (lineEnd === -1 ? src.length : lineEnd) - 1
      return token('unknown', Math.min(5, lastIndex - start) + 1)
    }

    return token('unknown', 1)
  }
}
