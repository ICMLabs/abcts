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
/**
 * ABCJS'S OWN ESCAPE TABLE, verbatim (`abc_tokenizer.js:525-546`), and the point is what
 * is NOT in it.
 *
 * abcjs looks a two-character sequence up in a FIXED map; ours applies a combining mark
 * generically, which is what ABC 2.1 §8.2 describes. The two agree on everything abcjs
 * lists and part on everything it does not: `\va` is absent — the caron pairs it has are
 * `vs`, `vS`, `vz`, `vZ` and no others — so abcjs leaves `Xi\vao` LITERAL where we render
 * `Xiǎo`. Its own SVG proves it: `little swallow`'s first lyric tspan reads `Xi\vao` while
 * the third reads `yàn`, because `` \` `` IS in the map.
 *
 * It is not only text. abcjs measures what it prints, so a six-character `Xi\vao` is
 * 47.25px of lyric against a four-character `Xiǎo`'s 33.52, and a lyric is CENTRED on its
 * note — half that difference pushed every notehead of the line 6.87px.
 */
const ABCJS_CHAR_MAP: Record<string, string> = {
  '`a': 'à',
  "'a": 'á',
  '^a': 'â',
  '~a': 'ã',
  '"a': 'ä',
  oa: 'å',
  aa: 'å',
  '=a': 'ā',
  ua: 'ă',
  ';a': 'ą',
  '`e': 'è',
  "'e": 'é',
  '^e': 'ê',
  '"e': 'ë',
  '=e': 'ē',
  ue: 'ĕ',
  ';e': 'ę',
  '.e': 'ė',
  '`i': 'ì',
  "'i": 'í',
  '^i': 'î',
  '"i': 'ï',
  '=i': 'ī',
  ui: 'ĭ',
  ';i': 'į',
  '`o': 'ò',
  "'o": 'ó',
  '^o': 'ô',
  '~o': 'õ',
  '"o': 'ö',
  '=o': 'ō',
  uo: 'ŏ',
  '/o': 'ø',
  '`u': 'ù',
  "'u": 'ú',
  '^u': 'û',
  '~u': 'ũ',
  '"u': 'ü',
  ou: 'ů',
  '=u': 'ū',
  uu: 'ŭ',
  ';u': 'ų',
  '`A': 'À',
  "'A": 'Á',
  '^A': 'Â',
  '~A': 'Ã',
  '"A': 'Ä',
  oA: 'Å',
  AA: 'Å',
  '=A': 'Ā',
  uA: 'Ă',
  ';A': 'Ą',
  '`E': 'È',
  "'E": 'É',
  '^E': 'Ê',
  '"E': 'Ë',
  '=E': 'Ē',
  uE: 'Ĕ',
  ';E': 'Ę',
  '.E': 'Ė',
  '`I': 'Ì',
  "'I": 'Í',
  '^I': 'Î',
  '~I': 'Ĩ',
  '"I': 'Ï',
  '=I': 'Ī',
  uI: 'Ĭ',
  ';I': 'Į',
  '.I': 'İ',
  '`O': 'Ò',
  "'O": 'Ó',
  '^O': 'Ô',
  '~O': 'Õ',
  '"O': 'Ö',
  '=O': 'Ō',
  uO: 'Ŏ',
  '/O': 'Ø',
  '`U': 'Ù',
  "'U": 'Ú',
  '^U': 'Û',
  '~U': 'Ũ',
  '"U': 'Ü',
  oU: 'Ů',
  '=U': 'Ū',
  uU: 'Ŭ',
  ';U': 'Ų',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  ss: 'ß',
  "'c": 'ć',
  '^c': 'ĉ',
  uc: 'č',
  cc: 'ç',
  '.c': 'ċ',
  cC: 'Ç',
  "'C": 'Ć',
  '^C': 'Ĉ',
  uC: 'Č',
  '.C': 'Ċ',
  '~N': 'Ñ',
  '~n': 'ñ',
  '=s': 'š',
  vs: 'š',
  DH: 'Ð',
  dh: 'ð',
  HO: 'Ő',
  Ho: 'ő',
  HU: 'Ű',
  Hu: 'ű',
  "'Y": 'Ý',
  "'y": 'ý',
  '^Y': 'Ŷ',
  '^y': 'ŷ',
  '"Y': 'Ÿ',
  '"y': 'ÿ',
  vS: 'Š',
  vZ: 'Ž',
  vz: 'ž',
}

/**
 * `charMap2` — abcjs's OCTAL escapes, keyed by their three digits
 * (`abc_tokenizer.js:552-563`). Only the codes abcjs lists exist; anything else falls
 * through to the backslash branch, where ours would decode the octal value.
 */
const OCTAL_BY_CODE: Record<string, string> = {
  '201': '♯',
  '202': '♭',
  '203': '♮',
  '241': '¡',
  '242': '¢',
  '243': '£',
  '244': '¤',
  '245': '¥',
  '246': '¦',
  '247': '§',
  '250': ' ̈',
  '251': '©',
  '252': 'a',
  '253': '«',
  '254': '¬',
  '255': '-',
  '256': '®',
  '257': ' ̄',
  '260': '°',
  '261': '±',
  '262': '2',
  '263': '3',
  '264': '  ́',
  '265': 'μ',
  '266': '¶',
  '267': '·',
  '270': ' ̧',
  '271': '1',
  '272': 'o',
  '273': '»',
  '274': '1⁄4',
  '275': '1⁄2',
  '276': '3⁄4',
  '277': '¿',
  '300': 'À',
  '301': 'Á',
  '302': 'Â',
  '303': 'Ã',
  '304': 'Ä',
  '305': 'Å',
  '306': 'Æ',
  '307': 'Ç',
  '310': 'È',
  '311': 'É',
  '312': 'Ê',
  '313': 'Ë',
  '314': 'Ì',
  '315': 'Í',
  '316': 'Î',
  '317': 'Ï',
  '320': 'Ð',
  '321': 'Ñ',
  '322': 'Ò',
  '323': 'Ó',
  '324': 'Ô',
  '325': 'Õ',
  '326': 'Ö',
  '327': '×',
  '330': 'Ø',
  '331': 'Ù',
  '332': 'Ú',
  '333': 'Û',
  '334': 'Ü',
  '335': 'Ý',
  '336': 'Þ',
  '337': 'ß',
  '340': 'à',
  '341': 'á',
  '342': 'â',
  '343': 'ã',
  '344': 'ä',
  '345': 'å',
  '346': 'æ',
  '347': 'ç',
  '350': 'è',
  '351': 'é',
  '352': 'ê',
  '353': 'ë',
  '354': 'ì',
  '355': 'í',
  '356': 'î',
  '357': 'ï',
  '360': 'ð',
  '361': 'ñ',
  '362': 'ò',
  '363': 'ó',
  '364': 'ô',
  '365': 'õ',
  '366': 'ö',
  '367': '÷',
  '370': 'ø',
  '371': 'ù',
  '372': 'ú',
  '373': 'û',
  '374': 'ü',
  '375': 'ý',
  '376': 'þ',
  '377': 'ÿ',
}

/** `charMap1` — the three accidental shorthands (`abc_tokenizer.js:547-551`). */
const ABCJS_CHAR_MAP_1: Record<string, string> = { '#': '♯', b: '♭', '=': '♮' }

/**
 * `translateString`, branch for branch (`abc_tokenizer.js:565-590`). Split on `\`, then
 * per piece try the 2-character map, then the 3-digit octal one, then the 1-character
 * accidental one — and on failing all three **put the backslash back and keep the piece**.
 * That last branch is the whole difference.
 */
function translateAbcjs(text: string): string {
  const parts = text.split('\\')
  if (parts.length === 1) return text
  let out: string | null = null
  for (const s of parts) {
    if (out === null) {
      out = s
      continue
    }
    const two = ABCJS_CHAR_MAP[s.substring(0, 2)]
    if (two !== undefined) {
      out += two + s.substring(2)
      continue
    }
    const octal = OCTAL_BY_CODE[s.substring(0, 3)]
    if (octal !== undefined) {
      out += octal + s.substring(3)
      continue
    }
    const one = ABCJS_CHAR_MAP_1[s.substring(0, 1)]
    if (one !== undefined) {
      out += one + s.substring(1)
      continue
    }
    out += `\\${s}`
  }
  return out ?? text
}

/**
 * Which table `decodeTextString` reads — abcjs's in strict, ABC 2.1's everywhere else.
 *
 * A module switch rather than a parameter on all fourteen call sites, which is the same
 * shape `JAZZ_CHORDS` and `PERC_MAP` take in the renderer. `parse()` sets it once.
 */
let ABCJS_ESCAPES = false
export const setAbcjsEscapes = (on: boolean): void => {
  ABCJS_ESCAPES = on
}

export function decodeTextString(text: string): string {
  if (!text.includes('\\') && !text.includes('&')) return text
  if (ABCJS_ESCAPES) return translateAbcjs(text)

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
