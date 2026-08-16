/**
 * abcjs's `TuneBook` and the book-level helpers on its root — `abc_parse_book.js` and
 * `api/abc_tunebook.js`, ported rule for rule.
 *
 * These are STRING SURGERY, not parsing: abcjs splits a file on `"\nX:"`, truncates each
 * tune at the first blank line, and reads the title and id back out of the text with more
 * splits. A host uses them to slice a file before deciding what to render, so what matters
 * is that the offsets and the quirks agree — including the ones that are plainly bugs.
 */

/**
 * abcjs's `parseCommon.strip` — whitespace off both ends, and its own regex rather than
 * `String.prototype.trim`, which differs on some Unicode spaces.
 */
const strip = (str: string): string => str.replace(/^[\s]+|[\s]+$/g, '')

/** One tune of a book, exactly as `bookParser` shapes it. */
export interface BookTune {
  /** The tune's own text, with the file-wide directives PREPENDED. */
  abc: string
  /** The same text WITHOUT those directives — what the title and id are read from. */
  pure: string
  /** Character offset of the tune in the original string. */
  startPos: number
  /** The first `T:` line, stripped. Empty when there is none. */
  title: string
  /** The first `X:` line, stripped. */
  id: string
}

/**
 * `TuneBook` — splits a file into tunes.
 *
 * **THE SPLIT IS `"\nX:"`, SO A TUNE MUST OPEN A LINE**, and `startPos` counts the
 * newline the split ate. **FILE-WIDE `%%` DIRECTIVES ARE PREPENDED TO EVERY TUNE**, but
 * only when the text before the first `X:` is not itself a tune — abcjs's own comment
 * calls that "intertune" and says it can get away with prepending because a tune is parsed
 * all at once.
 *
 * **AND A TUNE ENDS AT THE FIRST BLANK LINE**, not at the next `X:`, so anything after one
 * is dropped rather than carried into the next tune.
 */
export class TuneBook {
  readonly header: string
  readonly tunes: BookTune[]

  constructor(book: string) {
    const initialWhiteSpace = /(\s*)/.exec(book)
    const stripped = strip(book)
    const tuneStrings = stripped.split('\nX:')
    // Put back the `X:` the split ate.
    for (let i = 1; i < tuneStrings.length; i += 1) tuneStrings[i] = `X:${tuneStrings[i] ?? ''}`

    let pos = initialWhiteSpace ? (initialWhiteSpace[0]?.length ?? 0) : 0
    const tunes: { abc: string; startPos: number }[] = []
    for (const tune of tuneStrings) {
      tunes.push({ abc: tune, startPos: pos })
      pos += tune.length + 1 // the newline the split ate
    }

    let directives = ''
    if (tunes.length > 1 && !(tunes[0]?.abc ?? '').startsWith('X:')) {
      const dir = tunes.shift()
      for (const line of (dir?.abc ?? '').split('\n')) {
        if (line.startsWith('%%')) directives += `${line}\n`
      }
    }
    this.header = directives

    this.tunes = tunes.map((tune) => {
      const end = tune.abc.indexOf('\n\n')
      const body = end > 0 ? tune.abc.substring(0, end) : tune.abc
      // **THE TITLE IS A SPLIT ON `"T:"`, NOT A FIELD LOOKUP**, so a `T:` anywhere — in a
      // `%%text` line, inside a chord symbol — is taken. Reproduced.
      const titleParts = body.split('T:')
      const title = titleParts.length > 1 ? strip((titleParts[1] ?? '').split('\n')[0] ?? '') : ''
      // …and the id is the text between character 2 and the first newline, which assumes
      // the tune opens with `X:` and gives nonsense when it does not.
      const id = strip(body.substring(2, body.indexOf('\n')))
      return { abc: directives + body, pure: body, startPos: tune.startPos, title, id }
    })
  }

  getTuneById(id: string | number): BookTune | null {
    return this.tunes.find((t) => t.id === String(id)) ?? null
  }

  getTuneByTitle(title: string): BookTune | null {
    return this.tunes.find((t) => t.title === title) ?? null
  }
}

/**
 * `numberOfTunes` — quirks and all: `abc.split("\nX:").length`, with a floor of 1
 * (`api/abc_tunebook.js:13-18`). It is a split and not a parse, so an `X:` opening the
 * STRING counts as part of the first chunk and a `\nX:` inside a comment counts as a tune.
 * Reproduced, because a host sizing its output array with it must get the same number we do.
 */
export function numberOfTunes(abc: string): number {
  const num = abc.split('\nX:').length
  return num === 0 ? 1 : num
}
