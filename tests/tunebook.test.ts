import { describe, expect, it } from "vitest";

import { numberOfTunes, TuneBook } from "../src/compat/tunebook.js";

/**
 * `TuneBook` is STRING SURGERY, not parsing — abcjs splits a file on `"\nX:"`, truncates
 * each tune at the first blank line, and reads the title and id back out with more splits
 * (`abc_parse_book.js`). What matters is that the offsets and the quirks agree.
 */
describe("TuneBook", () => {
  const book =
    "X:1\nT:First\nK:C\nCDEF|\n\nnot part of the tune\n\nX:2\nT:Second\nK:G\nGABc|\n";

  it("splits on a line-opening X: and counts the newline the split ate", () => {
    const b = new TuneBook(book);
    expect(b.tunes.map((t) => t.id)).toEqual(["1", "2"]);
    expect(b.tunes.map((t) => t.title)).toEqual(["First", "Second"]);
    expect(
      book.slice(b.tunes[1]?.startPos ?? 0, (b.tunes[1]?.startPos ?? 0) + 3),
    ).toBe("X:2");
  });

  it("ends a tune at the first blank line, not at the next X:", () => {
    expect(new TuneBook(book).tunes[0]?.pure).toBe("X:1\nT:First\nK:C\nCDEF|");
  });

  it("prepends file-wide %% directives to every tune, and only those", () => {
    const b = new TuneBook(
      "%%staffwidth 300\n% a comment\n\nX:1\nK:C\nC|\n\nX:2\nK:C\nD|\n",
    );
    expect(b.header).toBe("%%staffwidth 300\n");
    expect(b.tunes.every((t) => t.abc.startsWith("%%staffwidth 300\n"))).toBe(
      true,
    );
    expect(b.tunes.every((t) => !t.pure.startsWith("%%"))).toBe(true);
  });

  it("finds a tune by id and by title", () => {
    const b = new TuneBook(book);
    expect(b.getTuneById(2)?.title).toBe("Second");
    expect(b.getTuneByTitle("First")?.id).toBe("1");
    expect(b.getTuneById("nope")).toBeNull();
  });

  /**
   * `numberOfTunes` is `split("\nX:").length` with a floor of 1 — a SPLIT, so an `X:` that
   * opens the string is part of the first chunk and one inside a comment still counts.
   * Reproduced: a host sizing its output array with it must get our number.
   */
  it("counts tunes abcjs's way, quirks included", () => {
    expect(numberOfTunes("X:1\nK:C\nC|\n")).toBe(1);
    expect(numberOfTunes("X:1\nK:C\nC|\nX:2\nK:C\nD|\n")).toBe(2);
    expect(numberOfTunes("% see\nX:1 for details\nX:1\nK:C\nC|\n")).toBe(3);
  });
});
