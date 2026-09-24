import { describe, expect, it } from "vitest";
import { numberOfTunes, parseOnly } from "../src/compat/index.js";
import { parse } from "../src/parser/parser.js";

/**
 * Tune count, and per tune the kinds of line it drew.
 *
 * ⚠️ **`parseOnly` CANNOT SEE AN EXTRA TUNE** — it opens one slot per `numberOfTunes` and a
 * score past the last slot is never asked for, so a parser that makes two tunes out of one
 * chunk looks right through it. `parse().scores` is the count that moves.
 */
const shape = (abc: string): { tunes: number; counted: number; lines: string[][] } => ({
  tunes: parse(abc).scores.length,
  counted: numberOfTunes(abc),
  lines: parseOnly(abc).map((t) =>
    (t.lines ?? []).map((l) =>
      "staff" in l ? "staff" : "text" in l ? "text" : "other",
    ),
  ),
});

/**
 * **A BLANK LINE DOES NOT START A NEW TUNE — IT ENDS THE CHUNK.** abcjs cuts the book on
 * `"\nX:"` alone and then truncates each chunk at its first `\n\n`
 * (`abc_parse_book.js:18-37`), which its parse loop confirms by falling out of
 * `while (line)` on the first empty line (`abc_parse.js:548-563`). So music after a blank
 * line is DISCARDED, not a second tune, and `numberOfTunes` — which implements the same
 * split — must agree with what `parseOnly` hands back.
 *
 * Every number here is abcjs 6.7.1's own answer, read out of a WebKit page.
 */
describe("a chunk of the book is exactly one tune", () => {
  it("music after a blank line is thrown away", () => {
    expect(shape("X:1\nCDEF|\n\nGABc|")).toEqual({
      tunes: 1,
      counted: 1,
      lines: [["staff"]],
    });
  });

  it("…and so is a whole second tune body with no X: of its own", () => {
    expect(shape("CDEF|\n\nGABc|")).toEqual({ tunes: 1, counted: 1, lines: [["staff"]] });
  });

  it("a WHITESPACE-only line is not blank: the tune keeps going", () => {
    // `nextLine()` hands back the raw line, so `" "` is truthy and only `parseLine`'s own
    // strip-to-nothing test fires (`abc_parse.js:413`).
    expect(shape("X:1\nCDEF|\n \nGABc|")).toEqual({
      tunes: 1,
      counted: 1,
      lines: [["staff", "staff"]],
    });
  });

  it("an X: after the blank line still opens the next tune", () => {
    expect(shape("X:1\nCDEF|\n\nX:2\nGABc|")).toEqual({
      tunes: 2,
      counted: 2,
      lines: [["staff"], ["staff"]],
    });
  });

  /**
   * **AN EMPTY TUNE IS STILL A TUNE.** `numberOfTunes('')` is 1, so `renderAbc(div, '')[0]`
   * is a tune object with no lines and a 37.56px page — not `undefined`.
   */
  it("an empty book is one empty tune", () => {
    expect(shape("")).toEqual({ tunes: 1, counted: 1, lines: [[]] });
    expect(shape("\n\n\n")).toEqual({ tunes: 1, counted: 1, lines: [[]] });
    expect(shape("%% nothing")).toEqual({ tunes: 1, counted: 1, lines: [[]] });
  });

  /** …and a chunk holding only a `W:` or a `%%text` is not empty at all. */
  it("words with no music are a tune", () => {
    expect(parseOnly("W:x")[0]?.metaText?.unalignedWords).toEqual(["x"]);
    expect(shape("W:x")).toEqual({ tunes: 1, counted: 1, lines: [[]] });
  });

  it("a %%text with no music is a tune with a text line", () => {
    expect(shape("%%text hi")).toEqual({ tunes: 1, counted: 1, lines: [["text"]] });
  });

  it("the words survive the blank line that swallows the music", () => {
    expect(parseOnly("W:x\n\nCDEF|")[0]?.metaText?.unalignedWords).toEqual(["x"]);
    expect(shape("W:x\n\nCDEF|")).toEqual({ tunes: 1, counted: 1, lines: [[]] });
  });
});
