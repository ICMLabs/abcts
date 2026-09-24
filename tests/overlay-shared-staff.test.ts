import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **AN `&` LAYER ON A SHARED STAFF.** Two rules, both from `resolveOverlays`
 * (`tune-builder.js:585-606`):
 * - `staff.voices.push(ov.voice)` — a staff's layers draw AFTER all its voices, not beside
 *   their parent;
 * - the layer opens `stem down` and then copies the parent's stem elements, so it takes the
 *   parent's HEAD stem: `up` under a shared staff's first voice, `down` under its second.
 * Ours drew the layer beside its parent and stemmed it down by position.
 *
 * `overlay-shared-staff.json` is abcjs 6.7.1's stem paths in document order, read in WebKit.
 */
type Answer = { abc: string; stems: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "overlay-shared-staff.json"), "utf-8"),
) as Answer[];

const ours = (abc: string): string[] => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg: string }).svg;
  return [...svg.matchAll(/<path d="([^"]+)"[^>]*data-name="stem"/g)].map((m) => m[1] ?? "");
};

describe("an & layer on a shared staff", () => {
  for (const a of answers) it(JSON.stringify(a.abc), () => expect(ours(a.abc)).toEqual(a.stems));
});
