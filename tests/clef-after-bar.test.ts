import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **A CLEF WRITTEN AFTER THE LINE'S FIRST MUSIC DRAWS NO CAUTIONARY AT THE LINE ABOVE.**
 * `|[K:clef=bass]` appends the bar first, and that fires `startNewLine`, so the clef lands
 * on the new line — the rule `keyChangeLeadsLine` already states for a key. Ours drew a
 * cautionary clef at the end of the line above.
 *
 * `clef-after-bar.json` is abcjs 6.7.1's element order, read in WebKit.
 */
type Answer = { abc: string; order: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "clef-after-bar.json"), "utf-8"),
) as Answer[];
const KEEP = /^(bar|part|tempo|staff-extra .*|key-signature|time-signature|clef.*)$/;

const ours = (abc: string): string[] => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  return [...svg.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1] ?? "").filter((n) => KEEP.test(n));
};

describe("a clef written after the line.s first music", () => {
  for (const a of answers) it(JSON.stringify(a.abc), () => expect(ours(a.abc)).toEqual(a.order));
});
