import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";
import type { AbcLine } from "../src/compat/lines.js";

const linesOf = (music: string, head = "X:1\nT:t\nL:1/4\nK:C\n"): string[] =>
  (parseOnly(`${head}${music}\n`)[0]?.lines ?? []).map((l: AbcLine) => {
    const { staff, ...rest } = l as AbcLine & { staff?: unknown };
    return staff === undefined ? JSON.stringify(rest) : `staff${JSON.stringify(rest)}`;
  });

/**
 * **A PENDING `%%vskip` GOES ON THE VERY NEXT LINE, WHATEVER KIND OF LINE THAT IS.**
 * `pushLine` stamps `hash.vskip` and deletes the pending one before it pushes
 * (`tune-builder.js:904-908`), so a text row, a `%%center`, a `%%begintext` block, a
 * `%%sep` and a mid-tune `T:` all take it — and the STAFF below then gets none. Ours
 * emitted it on music lines only, so it read in the wrong place or not at all.
 *
 * Every expectation here is abcjs 6.7.1's own answer, read out of a WebKit page.
 */
describe("a %%vskip rides the next line, whatever it is", () => {
  it("a %%text row takes it", () => {
    expect(linesOf("%%vskip 20\n%%text after\nCDEF|")).toEqual([
      '{"text":{"text":"after","startChar":29,"endChar":41},"vskip":20}',
      "staff{}",
    ]);
  });

  it("a %%center row takes it", () => {
    expect(linesOf("%%vskip 20\n%%center mid\nCDEF|")).toEqual([
      '{"text":[{"text":"mid","center":true}],"vskip":20}',
      "staff{}",
    ]);
  });

  it("a %%sep row takes it", () => {
    expect(linesOf("%%vskip 20\n%%sep\nCDEF|")).toEqual([
      '{"separator":{"spaceAbove":14,"spaceBelow":14,"lineLength":85,"startChar":29,"endChar":34},"vskip":20}',
      "staff{}",
    ]);
  });

  /**
   * ⚠️ **AND A SUBTITLE CARRIES THE NUMBER AND NEVER SPENDS IT** — the controller builds
   * `Subtitle` with no vskip argument (`engraver-controller.js:239`), so abcjs's page is
   * byte-identical with and without the directive while `tune.lines` still publishes it.
   * Both halves are modelled: `ScoreMetadata.titleVskips` and the layout's `role` guard.
   */
  it("a mid-tune T: carries it without spending it", () => {
    expect(linesOf("%%vskip 20\nT:sub\nCDEF|")).toEqual([
      '{"subtitle":{"text":"sub","startChar":29,"endChar":34},"vskip":20}',
      "staff{}",
    ]);
  });

  it("…and a staff line takes it when nothing else is between", () => {
    expect(linesOf("%%vskip 20\nCDEF|")).toEqual(['staff{"vskip":20}']);
  });

  /** MEASURED, NOT LANDED: `%%newpage` is a line too and abcjs stamps it there. */
  it.fails("a %%newpage row takes it", () => {
    expect(linesOf("%%vskip 20\n%%newpage\nCDEF|")).toEqual([
      '{"newpage":-1,"vskip":20}',
      "staff{}",
    ]);
  });
});

/**
 * **A `%%text` SPAN IS ARITHMETIC, NOT THE LINE** — `{startChar: iChar, endChar: iChar +
 * restOfString.length + 7}` (`abc_parse_directive.js:983`), where `restOfString` is the
 * TRIMMED tail. A bare `%%text` therefore spans SEVEN characters where the line is six,
 * and `%%text  a ` spans eight where the line is ten. Only a directive with exactly one
 * space and no trailing one reads the same either way — which is every `%%text` in the
 * corpus until these controls were written.
 */
describe("a %%text row's span", () => {
  const spanOf = (music: string): [number, number] | undefined => {
    const row = (parseOnly(`X:1\nT:t\nL:1/4\nK:C\n${music}\n`)[0]?.lines ?? []).find(
      (l) => (l as { text?: unknown }).text !== undefined,
    ) as { text?: { startChar?: number; endChar?: number } } | undefined;
    return row?.text?.startChar === undefined || row.text.endChar === undefined
      ? undefined
      : [row.text.startChar, row.text.endChar];
  };

  it.each([
    ["%%text\nCDEF|", 18, 25],
    ["%%text \nCDEF|", 18, 25],
    ["%%text a\nCDEF|", 18, 26],
    ["%%text  a \nCDEF|", 18, 26],
    ["%%text  a b \nCDEF|", 18, 28],
  ])("%s → %d..%d", (music, start, end) => {
    expect(spanOf(music)).toEqual([start, end]);
  });
});

/**
 * **A BLOCK WRITTEN INSIDE A SYSTEM COMES OUT AFTER IT.** `pushLine` appends where the
 * directive stands, but the STAFF line was pushed when the system opened — so a `%%text`
 * between `V:1`'s music and `V:2`'s lands at index 1 with the staff at 0. This projection
 * read `textBefore` off VOICE 0 alone and dropped the row outright.
 */
describe("free text between two voices", () => {
  it("is a line AFTER the system it stands in", () => {
    expect(linesOf("V:1\nCDEF|\n%%text mid\nV:2\nGABc|")).toEqual([
      "staff{}",
      '{"text":{"text":"mid","startChar":28,"endChar":38}}',
    ]);
  });

  it("…while one between two SYSTEMS still comes before the second", () => {
    expect(linesOf("CDEF|\n%%text mid\nGABc|")).toEqual([
      "staff{}",
      '{"text":{"text":"mid","startChar":24,"endChar":34}}',
      "staff{}",
    ]);
  });
});

/**
 * **AND THE `&` MARKER SORTS AHEAD OF THE LAYER'S FIRST ELEMENT, NOT ITS FIRST EVENT.**
 * A note's span opens at whatever was written FOR it — a chord symbol, a `!…!`, a `.` or
 * a grace group — so `&"C"GABc|` builds its `G` four characters before the note's own
 * range. Keyed on the EVENT, the marker sorted between the two and `resolveOverlays`
 * snipped one element late: the layer's first note stayed in the MAIN voice.
 *
 * BREAK: key the marker on `written[0].sourceRange.start` again and every rung but the
 * bare one goes red.
 */
describe("an & layer whose first note carries an attachment", () => {
  const voicesOf = (music: string): string[] =>
    (parseOnly(`X:1\nT:t\nL:1/4\nK:C\n${music}\n`)[0]?.lines ?? []).flatMap((l) =>
      (l.staff ?? []).flatMap((s) =>
        (s.voices ?? []).map((v) =>
          v
            .map((e) =>
              e.el_type === "note"
                ? ((e.pitches ?? []).map((p) => p.name).join("") || "z")
                : e.el_type,
            )
            .join(" "),
        ),
      ),
    );

  it.each([
    ['CDEF|&GABc|', ["C D E F stem bar bar stem", "stem z bar G A B c bar"]],
    ['CDEF|&{g}GABc|', ["C D E F stem bar bar stem", "stem z bar G A B c bar"]],
    ['CDEF|&"C"GABc|', ["C D E F stem bar bar stem", "stem z bar G A B c bar"]],
    ['CDEF|&!fermata!GABc|', ["C D E F stem bar bar stem", "stem z bar G A B c bar"]],
    ['CDEF|&.GABc|', ["C D E F stem bar bar stem", "stem z bar G A B c bar"]],
  ])("%s keeps the layer whole", (music, expected) => {
    expect(voicesOf(music)).toEqual(expected);
  });
});
