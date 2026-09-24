import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **`M:` IS A GRAMMAR, AND A VALUE IT REJECTS IS NO METER AT ALL.** abcjs's `setMeter` reads
 * `[(] n [(+|.) n]… [)] / d` term by term, throws on anything else, and its `catch` warns
 * at column 0 of the value and returns `null` (`abc_parse_header.js:24-136`). Ours was a
 * lenient `split('/')`: `M:3/4 x` drew a 3/4 where abcjs draws nothing, said nothing where
 * abcjs warns, and `(2+3)/8` — the `(` SKIPPED by abcjs, not kept — split into a `NaN` and
 * a `3`, so the bar was 3/8 long.
 *
 * `meter-grammar.json` is abcjs 6.7.1's warnings, first staff's meter and page height,
 * read out of a WebKit page at `staffwidth: 670`.
 */
type Answer = {
  abc: string;
  warnings: string[];
  meter: { type?: string | undefined; value?: { num: string; den?: string }[] };
  height: string;
};
const answers = JSON.parse(
  readFileSync(join(__dirname, "meter-grammar.json"), "utf-8"),
) as Answer[];

const ours = (abc: string): Answer => {
  const t = renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as {
    svg?: string;
    warnings?: string[];
    lines: { staff?: { meter?: { type?: string; value?: { num: string; den?: string }[] } }[] }[];
  };
  const m = t.lines[0]?.staff?.[0]?.meter;
  return {
    abc,
    warnings: t.warnings ?? [],
    meter: m === undefined ? {} : { type: m.type, ...(m.value ? { value: m.value } : {}) },
    height: /height="([\d.]+)"/.exec(t.svg ?? "")?.[1] ?? "",
  };
};

describe("M: as abcjs's grammar reads it", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
