import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { numberOfTunes, parseOnly } from "../src/compat/index.js";
import { parse } from "../src/parser/parser.js";

/**
 * **A WINDOWS TUNEBOOK, THE WHOLE CORPUS OF THEM.** Every fixture is valid ABC with `\n`
 * line ends, so `\r\n` had no gate — and it is the common real-world file. abcjs cuts the
 * RAW book on `"\nX:"`, normalizes each tune on its own and parses it from its raw start
 * (`abc_parse_book.js:9-37`, `abc_tunebook.js:84`), so a `\r\n` tune's offsets are its LF
 * offsets moved by exactly the `\r`s BEFORE ITS OWN `X:` — less one per `%%` line of a
 * leading header block, whose `\r`s are counted in the start and not in the walk.
 *
 * That rule was measured against abcjs live — the whole corpus in `\r\n` and in lone `\r`,
 * every element's span, 697 tunes — and this holds it in node without a browser: the LF
 * answer is gated elsewhere (`corpus-lines`), so the `\r\n` one is the LF one moved.
 */
const fixtures = join(__dirname, "corpus-abcjs", "fixtures");
const files = readdirSync(fixtures).filter((f) => f.endsWith(".abc")).sort();

const spans = (abc: string): number[][] =>
  parseOnly(abc).map((t) =>
    (t.lines ?? []).flatMap((l) =>
      "staff" in l
        ? ((l.staff ?? []) as unknown as { voices?: { startChar?: number }[][] }[]).flatMap((st) =>
            (st.voices ?? []).flatMap((v) => v.flatMap((e) => (e.startChar === undefined ? [] : [e.startChar]))),
          )
        : [],
    ),
  );

/** Where each tune's chunk starts in the LF text — abcjs's own split, on the stripped book. */
const shifts = (lf: string): number[] => {
  const lead = /^\s*/.exec(lf)?.[0].length ?? 0;
  const pieces = lf.slice(lead).split("\nX:");
  const hasHeader = pieces.length > 1 && !pieces[0]?.startsWith("X:");
  const header = hasHeader
    ? // EVERY one: in a `\r\n` book even the block's last line keeps its `\r`, because the
      // split eats only the `\n` before the `X:`.
      (pieces[0] ?? "").split("\n").filter((l) => l.startsWith("%%")).length
    : 0;
  const out: number[] = [];
  let at = lead;
  pieces.forEach((p, k) => {
    const start = k === 0 ? at : at + 1;
    if (!(hasHeader && k === 0)) out.push(lf.slice(0, start).split("\n").length - 1 - header);
    at = start + (k === 0 ? p.length : p.length + 2);
  });
  return out;
};

describe("every fixture as a \\r\\n file", () => {
  for (const f of files)
    it(f, () => {
      const lf = readFileSync(join(fixtures, f), "utf-8").replace(/\r\n/g, "\n");
      const crlf = lf.replace(/\n/g, "\r\n");
      const moved = spans(lf).map((t, k) => t.map((o) => o + (shifts(lf)[k] ?? 0)));
      expect(spans(crlf)).toEqual(moved);
      // …and a lone `\r` book is ONE tune, however many `X:` lines it has. Counted on
      // `parse().scores`: `parseOnly` opens one slot per `numberOfTunes` and cannot see an
      // extra tune — the same trap `chunking.test.ts` records.
      const cr = lf.replace(/\n/g, "\r");
      expect(parse(cr).scores.length).toBe(numberOfTunes(cr));
    });
});
