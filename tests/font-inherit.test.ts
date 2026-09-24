import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **WHAT A FONT DIRECTIVE LEAVES OUT COMES FROM THE FONT IN FORCE.** abcjs's
 * `getFontParameter` takes a missing face and size from `currentSetting`, and a size alone
 * keeps the weight and style too (`abc_parse_directive.js:159-172, 282-296`). Ours took the
 * DEFAULTS — `%%gchordfont box` drew `font-family=""` — read a leading `bold` as the face,
 * and drew every chord symbol `normal` whatever its directive said.
 *
 * `font-inherit.json` is abcjs 6.7.1's drawn text attributes (size, style, family, weight),
 * read out of a WebKit page.
 */
type Answer = { abc: string; sel: string; font: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "font-inherit.json"), "utf-8"),
) as Answer[];

const ours = (abc: string, sel: string): string => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  const name = /data-name="(\w+)"/.exec(sel)?.[1];
  const at = svg.indexOf(`data-name="${name}"`);
  const tag = /<text[^>]*>/.exec(svg.slice(svg.lastIndexOf("<", at)))?.[0] ?? "";
  return ["font-size", "font-style", "font-family", "font-weight"]
    .map((a) => new RegExp(`${a}="([^"]*)"`).exec(tag)?.[1] ?? "")
    .join("|");
};

describe("font directives inherit from the font in force", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc.split("\n").filter((l) => l.startsWith("%%")).join(" / ")), () => {
      expect(ours(a.abc, a.sel)).toBe(a.font);
    });
});
