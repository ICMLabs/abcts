import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **ONE ENTRY PER POSITION, ITS ROWS WALKED BACKWARD, THE ENTRIES IN WRITTEN ORDER.** abcjs
 * joins same-position marks with `\n` (and turns `;` into one), splits the entry into rows
 * and places them last first (`abc_parse_music.js:197-204`, `add-chord.js:6, 39-42`). Ours
 * measured `"^top\nbottom"` as one mark (1.19px too tall), kept `;` literal, drew
 * `"<a""<b"` in source order and drew the groups by placement rather than as written.
 *
 * `annotation-rows.json` is abcjs 6.7.1's annotation marks in document order, read in
 * WebKit. The heights are browser-only and live in `scripts/zzledger.mjs`.
 */
type Answer = { abc: string; marks: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "annotation-rows.json"), "utf-8"),
) as Answer[];

const ours = (abc: string): string[] => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  return [...svg.matchAll(/data-name="annotation"[^>]*>((?:<tspan[^>]*>[^<]*<\/tspan>)*)/g)].map(
    (m) => (m[1] ?? "").replace(/<[^>]+>/g, ""),
  );
};

describe("annotation rows and groups", () => {
  for (const a of answers) it(JSON.stringify(a.abc), () => expect(ours(a.abc)).toEqual(a.marks));
});
