import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **AN `[X:` WITH NO `]` CONSUMES NOTHING — AND abcjs RUNS THE FIELD ON THE WRONG STRING
 * FIRST.** `letter_to_inline_header` finds `e = -1`, so `line.substring(i+3, e)` SWAPS into
 * `line.substring(0, i+3)` — the line up to the colon — and the field parses THAT, then
 * returns a length `<= 0` and `parseMusic` reads the `[` again as a failed chord
 * (`abc_parse_header.js:342-414`). Ours ran the field to the end of the line: `[K:C CDEF|`
 * drew an empty page, which is what an editor showed while someone typed `[K:G]`.
 *
 * And two neighbours the probe found: a bare barline now takes the `[K:]`/`[M:]` written
 * before it, and an unknown directive's name is lowercased, its inline caret at the `[`.
 *
 * `unterminated-field.json` is abcjs 6.7.1's own `parseOnly` answer for every case, read
 * out of a WebKit page.
 */
type Answer = {
  abc: string;
  warnings?: string[];
  stream: string[];
  key?: string | undefined;
  meter?: string;
};
const answers = JSON.parse(
  readFileSync(join(__dirname, "unterminated-field.json"), "utf-8"),
) as Answer[];

const ours = (abc: string): Answer => {
  const t = parseOnly(abc)[0] as unknown as {
    warnings?: string[];
    lines: {
      staff?: {
        key?: { accidentals?: { acc: string; note: string }[] };
        meter?: { value?: { num: string; den: string }[] };
        voices?: { el_type: string; title?: string }[][];
      }[];
    }[];
  };
  const st = t.lines[0]?.staff?.[0];
  return {
    abc,
    ...(t.warnings === undefined ? {} : { warnings: t.warnings }),
    stream: (st?.voices?.[0] ?? []).map((e) => (e.el_type === "part" ? `part:${e.title}` : e.el_type)),
    key: st?.key?.accidentals?.map((a) => a.acc + a.note).join(" "),
    ...(st?.meter?.value === undefined
      ? {}
      : { meter: st.meter.value.map((v) => `${v.num}/${v.den}`).join(" ") }),
  };
};

describe("an unterminated inline field, as abcjs reads it", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
