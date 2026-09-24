import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **AN INLINE `[P:]` WRITTEN AFTER THE OPENING BAR IS DRAWN AFTER IT**, in source order
 * among the tempo, clef, key and meter that also follow the bar. A `P:` FIELD line still
 * precedes the bar — `createStaff` puts it first (`tune-builder.js:1022-1023`) — and ours
 * applied that to every part label, so `|:[P:A]CDEF` drew the label first and ran the
 * svg to 700.96px wide.
 *
 * `part-after-bar.json` is abcjs 6.7.1's element order, read in WebKit.
 */
type Answer = { abc: string; order: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "part-after-bar.json"), "utf-8"),
) as Answer[];
const KEEP = /^(bar|part|tempo|staff-extra .*|key-signature|time-signature|clef.*)$/;

const ours = (abc: string): string[] => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  return [...svg.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1] ?? "").filter((n) => KEEP.test(n));
};

describe("an inline part label after the opening bar", () => {
  for (const a of answers) it(JSON.stringify(a.abc), () => expect(ours(a.abc)).toEqual(a.order));
});
