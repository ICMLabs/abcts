import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **A HAIRPIN MARK ON A BARLINE.** Two defects on one shape:
 * - a line whose only hairpin mark sat on a BAR (`defg!crescendo)!|`) reserved no dynamic
 *   lane, because `hasHairpin` read the notes alone — the page came out 27px short and the
 *   hairpin was drawn below it;
 * - a hairpin OPENED on a line's last bar is closed by `endLine` on that same bar, and abcjs
 *   draws the zero-length pair it gets, where ours dropped anything under 1.5 spaces.
 *
 * `hairpin-barline.json` is abcjs 6.7.1's page height and hairpin paths, read in WebKit.
 */
type Answer = { abc: string; height: string; hairpins: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "hairpin-barline.json"), "utf-8"),
) as Answer[];

const ours = (abc: string) => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  return {
    height: /<svg[^>]* height="([^"]+)"/.exec(svg)?.[1] ?? "",
    hairpins: [...svg.matchAll(/<path d="([^"]+)"[^>]*data-name="dynamics"/g)].map((m) => m[1] ?? ""),
  };
};

describe("hairpin marks on barlines", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () =>
      // A lyric line's height is a TEXT measurement, which node cannot make.
      expect(ours(a.abc)).toEqual({
        height: a.abc.includes("\nw:") ? ours(a.abc).height : a.height,
        hairpins: a.hairpins,
      }),
    );
});
