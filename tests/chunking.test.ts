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

/**
 * **THE THREE REWRITES abcjs MAKES BEFORE IT READS A LINE** — line endings, latex commands,
 * escaped percent (`abc_parse.js:497-512`) — and the rule that the book is STRIPPED and its
 * leading chunk is not parsed (`abc_parse_book.js:9-31`).
 *
 * Every offset here is abcjs 6.7.1's own answer, read out of a WebKit page.
 */
describe("the source is normalized before it is read", () => {
  /** The spans a host clicks against: `el_type` then `startChar,endChar`. */
  const spans = (abc: string): string =>
    (parseOnly(abc)[0]?.lines ?? [])
      .flatMap((l) => (("staff" in l ? l.staff : []) ?? []) as { voices?: unknown[] }[])
      .flatMap((st) => (st.voices ?? []) as { el_type: string; startChar: number; endChar: number }[][])
      .flatMap((v) => v.map((e) => `${e.el_type}${e.startChar},${e.endChar}`))
      .join(" ");

  const LF = "note8,9 note9,10 note10,11 note11,12 bar12,13";

  it("a lone \\r is a line separator, and it costs no characters", () => {
    expect(spans("X:1\rK:C\rCDEF|")).toBe(LF);
  });

  it("a \\r\\n is a line separator, and the offsets are the SHORTER ones", () => {
    // `/\r\n?/g → '\n'` loses a character per line, and abcjs reports the offsets of the
    // string it made — not of the string the host handed in.
    expect(spans("X:1\r\nK:C\r\nCDEF|")).toBe(LF);
  });

  it("a line starting with a backslash is a latex command and becomes spaces", () => {
    expect(spans("X:1\nK:C\n\\latex\nCDEF|")).toBe(
      "note15,16 note16,17 note17,18 note18,19 bar19,20",
    );
  });

  it("…but not on the first line, where there is no newline before it to eat", () => {
    // It is the book's leading chunk instead, and a leading chunk is not parsed: abcjs
    // raises NO warning here, where reading `\first` as music raises three.
    expect(parseOnly("\\first\nX:1\nK:C\nCDEF|")[0]?.warnings ?? []).toEqual([]);
    expect(spans("\\first\nX:1\nK:C\nCDEF|")).toBe(
      "note15,16 note16,17 note17,18 note18,19 bar19,20",
    );
  });

  it("the book is stripped, so leading blank lines end nothing", () => {
    expect(spans("\n\n X:1\nK:C\nCDEF|")).toBe(
      "note11,12 note12,13 note13,14 note14,15 bar15,16",
    );
    expect(spans("  \n\nCDEF|")).toBe("note4,5 note5,6 note6,7 note7,8 bar8,9");
  });

  it("a T: above the first X: is dropped with the rest of the leading chunk", () => {
    expect(parseOnly("T:lost\nX:1\nK:C\nCDEF|")[0]?.metaText?.title).toBeUndefined();
  });

  it("…while a %% line up there is kept and applies to every tune", () => {
    const tunes = parseOnly("%%bogus x\nX:1\nCDEF|\n\nX:2\nGABc|");
    expect(tunes.map((t) => (t.warnings ?? []).length)).toEqual([1, 1]);
  });
});
