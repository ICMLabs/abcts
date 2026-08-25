import type { Diagnostic, Score } from "../core/model.js";

/**
 * **`tune.warnings` — THE STRINGS A HOST SHOWS, AND THE FORMAT IS AS MUCH OF THE CONTRACT
 * AS THE WORDING.**
 *
 * `renderEngine` hangs the parser's warnings on the tune, and ONLY when there are any
 * (`abc_tunebook.js:87-89`) — so an absent field and an empty array are different answers,
 * and `Editor` shows "No errors" for the first. Each string is built by `warn(str, line,
 * col)` (`abc_parse.js:194-203`):
 *
 *     "Music Line:" + lineIndex + ":" + (col + 1) + ": " + message + ":  " + clean_line
 *
 * where `clean_line` is 64 characters either side of the offending one, that one wrapped in
 * a `<span style="text-decoration:underline;font-size:1.3em;font-weight:bold;">`, with `&`,
 * `<` and `>` escaped and `\x12` turned back into a space — and **a SPACE or a MISSING
 * character is spelled `SPACE`**, which is the detail a reader would never guess.
 *
 * ⚠️ **THE `line` IS NOT ALWAYS THE SOURCE LINE.** abcjs passes whatever text the site had
 * in hand: `Unknown directive` passes the whole `%%example` and points at column 2, while a
 * font warning passes the directive's BODY — `footerfont Tahoma 8 box`, no `%%` — and
 * points at column 0. Every kind carries its own convention, which is why the mapping below
 * is per DIAGNOSTIC CODE and not one rule.
 *
 * **AND A FILE-HEADER WARNING IS REPEATED ON EVERY TUNE.** `multilineVars` carries into each
 * tune's parse, so `abcjs-parse-book_parser-05` reports the same `Unknown directive` on
 * tune 0 and on tune 1. Measured, not assumed.
 */

/** `encode` — `abc_parse.js:188-193`, whole. */
const encode = (str: string): string =>
  str
    .replace(/\x12/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const UNDERLINE =
  '<span style="text-decoration:underline;font-size:1.3em;font-weight:bold;">';

/** `warn(str, line, col_num)` — the string, given the text it points into. */
export const abcjsWarning = (
  message: string,
  line: string,
  column: number,
  lineIndex: number,
): string => {
  const bad = line[column];
  const badChar = bad === " " || bad === undefined ? "SPACE" : bad;
  const cleanLine =
    encode(line.substring(column - 64, column)) +
    UNDERLINE +
    badChar +
    "</span>" +
    encode(line.substring(column + 1).substring(0, 64));
  return `Music Line:${lineIndex}:${column + 1}: ${message}:  ${cleanLine}`;
};

/**
 * The line an offset falls on, COUNTED FROM `base`, and where that line starts.
 *
 * ⚠️ **THE COUNTER RESTARTS WHERE THE FILE HEADER ENDS.** abcjs tokenizes the file header
 * and each tune separately, so `tokenizer.lineIndex` is 1-based within whichever it is in.
 * MEASURED on five controls: `%%bogusa / T:t / %%bogusb` reports lines **1 and 2** for
 * source lines 1 and 3 — the `T:t` that ends the file header is line 1 of the TUNE — while
 * a tune with no file header at all reports its true source lines throughout.
 */
const lineAt = (
  abc: string,
  offset: number,
  base: number,
): { index: number; start: number } => {
  let index = 1;
  let start = base;
  for (let i = base; i < offset && i < abc.length; i += 1)
    if (abc[i] === "\n") {
      index += 1;
      start = i + 1;
    }
  return { index, start };
};

const lineTextAt = (abc: string, start: number): string => {
  const end = abc.indexOf("\n", start);
  return abc.substring(start, end < 0 ? abc.length : end);
};

/**
 * The offset the FILE HEADER ends at — the first line that is neither a `%` line (a
 * directive or a comment) nor blank. abcjs tokenizes that header separately from the tunes,
 * which is what restarts the line count; see `lineAt`.
 */
const fileHeaderEnd = (abc: string): number => {
  let at = 0;
  while (at < abc.length) {
    const end = abc.indexOf("\n", at);
    const line = abc.substring(at, end < 0 ? abc.length : end);
    if (line.trim() !== "" && !line.startsWith("%")) return at;
    if (end < 0) return abc.length;
    at = end + 1;
  }
  return abc.length;
};

/**
 * What each of OUR diagnostic codes is, in abcjs's words and pointing where abcjs points.
 *
 * Ours are our own — a `code` and a message written for this library — so the bridge lives
 * here rather than in the parser: the compat surface owes abcjs's text, and the parser owes
 * nothing to it. A code with no entry produces no warning at all, which is the honest
 * answer while the site that would raise abcjs's own is not built.
 */
const AS_ABCJS: Record<
  string,
  (
    diagnostic: Diagnostic,
    abc: string,
  ) => { message: string; column: number; text?: string } | null
> = {
  /**
   * `Unknown directive: <name>`, pointing at the character right after the `%%` —
   * `warn("Unknown directive: " + cmd, line, i)` with the whole line in hand
   * (`abc_parse_directive.js`). A `%% example` therefore points at a SPACE and prints
   * `SPACE`.
   */
  /**
   * `This font style doesn't support "box"`, pointing at column 0 of the directive's BODY —
   * `warn(…, str, position)` where `str` is the body and `position` is 0
   * (`abc_parse_directive.js:230-234`). So the underlined character is the font's own first
   * letter and the text carries no `%%`.
   */
  "font-box-unsupported": (diagnostic, abc) => ({
    message: 'This font style doesn\'t support "box"',
    column: 0,
    text: abc
      .substring(diagnostic.range?.start ?? 0, diagnostic.range?.end ?? 0)
      .replace(/\r?\n.*$/s, ""),
  }),
  /**
   * A message the DIRECTIVE PARSER returned — abcjs warns those with the whole `%%` line at
   * column 2, the same place `Unknown directive` points (`abc_parse_directive.js`, and the
   * caller that turns a returned string into a `warn`).
   */
  "directive-parameter": (diagnostic) => {
    const name = /^(\S+)/.exec(diagnostic.message)?.[1];
    return name === undefined
      ? null
      : {
          message: `Directive ${name} requires 0 or 1 as a parameter.`,
          column: 2,
        };
  },
  /**
   * `Expected one parameter in MIDI <cmd>`, pointing at column 0 of the REST OF THE STRING —
   * the command and its arguments with the `%%MIDI ` stripped
   * (`abc_parse_directive.js:546-554`).
   */
  "midi-one-parameter": (diagnostic, abc) => {
    const cmd = /^(\S+)/.exec(diagnostic.message)?.[1];
    return cmd === undefined
      ? null
      : {
          message: `Expected one parameter in MIDI ${cmd}`,
          column: 0,
          text: abc
            .substring(diagnostic.range?.start ?? 0, diagnostic.range?.end ?? 0)
            .replace(/\r?\n.*$/s, ""),
        };
  },
  /**
   * `Unknown character ignored`, pointing AT the character in its own source line
   * (`abc_parse_music.js:579-581`) — the two characters abcjs stays silent about, a space
   * and a backtick, are excluded at the parser site.
   */
  "unknown-character": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Unknown character ignored", column: at - start };
  },
  /**
   * `Unknown decoration: <name>`, pointing at the opening `!` in the source line
   * (`abc_parse_music.js:828`).
   */
  "unknown-decoration": (diagnostic, abc) => {
    const name = /: (.*)$/.exec(diagnostic.message)?.[1];
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return name === undefined
      ? null
      : { message: `Unknown decoration: ${name}`, column: at - start };
  },
  /**
   * `Rests not allowed as grace notes '<c>' while parsing grace note`, pointing at the
   * GROUP's own start — every rest in one group reports the same column
   * (`abc_parse_music.js:698-700`).
   */
  "grace-rest": (diagnostic, abc) => {
    const c = /'(.)'/.exec(diagnostic.message)?.[1];
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return c === undefined
      ? null
      : {
          message: `Rests not allowed as grace notes '${c}' while parsing grace note`,
          column: at - start,
        };
  },
  /**
   * `Unknown parameter: <token>` from a `K:` (or `V:`) field, pointing into the FIELD's
   * VALUE — `cm`, not the `K:cm` line — at the token's own offset
   * (`abc_parse_key_voice.js:518-519`).
   */
  "unknown-parameter": (diagnostic, abc) => {
    const token = /: (.*)$/.exec(diagnostic.message)?.[1];
    const text = abc.substring(
      diagnostic.range?.start ?? 0,
      diagnostic.range?.end ?? 0,
    );
    return token === undefined
      ? null
      : {
          message: `Unknown parameter: ${token}`,
          // …AND THE COLUMN IS THE DIAGNOSTIC's WHERE IT HAS ONE. `text.indexOf` cannot
          // separate two warnings standing on adjacent characters — see `Diagnostic.column`.
          column: diagnostic.column ?? Math.max(0, text.indexOf(token)),
          text,
        };
  },
  /** `Can't nest triplets`, pointing at the inner `(` (`abc_parse_music.js:329-331`). */
  /**
   * `Expected ']' to end the chords`, pointing at the token that ended it —
   * `warn("Expected ']' to end the chords", line, index)` (`abc_parse_music.js:487`). The
   * same line-and-column shape as `nested-triplet` below.
   */
  /**
   * `Spaces are not allowed in chords`, pointing at the space —
   * `warn("Spaces are not allowed in chords", line, i)` (`abc_parse_music.js:393`). abcjs
   * RECOVERS from it: the character is skipped and the chord goes on, minus whatever
   * decoration the failed iteration had read. See the chord loop.
   */
  "chord-space": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Spaces are not allowed in chords", column: at - start };
  },
  "chord-unterminated": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Expected ']' to end the chords", column: at - start };
  },
  /**
   * A `:` that starts no bar is TWO warnings on one character — `getBarLine`'s
   * `{len: 1, warn: "Unknown bar symbol"}` and then the caller's `Unknown bar type`, both
   * at the same column (`abc_tokenizer.js:200`, `abc_parse_music.js:268-269`). One
   * diagnostic maps to both, in that order.
   */
  "unknown-bar-symbol": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Unknown bar symbol", column: at - start };
  },
  "unknown-bar-type": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Unknown bar type", column: at - start };
  },
  "nested-triplet": (diagnostic, abc) => {
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return { message: "Can't nest triplets", column: at - start };
  },
  /**
   * `Unknown character '<c>' while parsing grace note`, at the GROUP's own start — the same
   * column as the rests beside it (`abc_parse_music.js:719-725`).
   */
  "grace-character": (diagnostic, abc) => {
    const c = /'(.)'/.exec(diagnostic.message)?.[1];
    const at = diagnostic.range?.start ?? 0;
    let start = 0;
    for (let i = 0; i < at; i += 1) if (abc[i] === "\n") start = i + 1;
    return c === undefined
      ? null
      : {
          message: `Unknown character '${c}' while parsing grace note`,
          column: at - start,
        };
  },
  "unknown-directive": (diagnostic) => {
    const name = /%%\s*(\S+)/.exec(diagnostic.message)?.[1];
    return name === undefined
      ? null
      : { message: `Unknown directive: ${name}`, column: 2 };
  },
};

/**
 * The warnings for one tune — its own, plus every one raised before the first tune began,
 * which abcjs repeats on all of them.
 *
 * `undefined` when there are none, because that is the difference `Editor` shows.
 */
export function warningsOf(
  diagnostics: readonly Diagnostic[],
  scores: readonly Score[],
  index: number,
  abc: string,
): string[] | undefined {
  const score = scores[index];
  if (score === undefined) return undefined;
  /**
   * **WHERE THE FILE HEADER ENDS IS WHERE THE FIRST TUNE'S LINE COUNT BEGINS**, and that is
   * the first line which is neither a `%` line nor blank — not the `X:`. MEASURED:
   * `%%bogusa / T:t / %%bogusb / X:1` reports the second directive as line **2**, so the
   * `T:t` that ended the header is line 1 of the tune's own pass. Our `sourceStartOffset`
   * is the `X:` line, which is a different place.
   */
  const headerEnd = fileHeaderEnd(abc);
  const startOf = (i: number): number =>
    i === 0
      ? Math.min(headerEnd, scores[0]?.sourceStartOffset ?? 0)
      : (scores[i]?.sourceStartOffset ?? abc.length);
  const from = startOf(index);
  const to = index + 1 < scores.length ? startOf(index + 1) : abc.length;
  const firstTune = startOf(0);
  const out: string[] = [];
  for (const diagnostic of diagnostics) {
    const at = diagnostic.range?.start;
    if (at === undefined) continue;
    const mine = at >= from && at < to;
    const header = at < firstTune;
    if (!mine && !header) continue;
    const as = AS_ABCJS[diagnostic.code]?.(diagnostic, abc);
    if (as === null || as === undefined) continue;
    const { index: lineIndex, start } = lineAt(abc, at, header ? 0 : from);
    // …and the TEXT a warning points into is the site's, not always the source line — see
    // the note at the top.
    out.push(
      abcjsWarning(
        as.message,
        as.text ?? lineTextAt(abc, start),
        as.column,
        lineIndex,
      ),
    );
  }
  return out.length > 0 ? out : undefined;
}
