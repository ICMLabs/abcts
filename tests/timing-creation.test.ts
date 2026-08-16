/**
 * THE FOUR CRASH REGRESSIONS out of abcjs's `timing.test.js`, and they are live the day the
 * corpus lands rather than waiting for `setTiming`.
 *
 * `doCreationTest` asserts nothing but that rendering does not THROW. That reads like a
 * weak test and is not: each of the four names a SHAPE that once crashed abcjs — a
 * subtitle, a repeat at the very start, ties that get skipped, and a tie across a repeat —
 * and three of the four are structures this repo has found defects in for other reasons.
 * A tune that throws has no rows on any ranked table, so nothing else here can see it.
 *
 * The rest of `tests/corpus-timing/` is the `setTiming` oracle and has no reader yet; see
 * that directory's README for the classification and for what abcjs's own file never
 * asserts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { parse } from "../src/parser/parser.js";

const dir = join(import.meta.dirname, "corpus-timing");

interface Case {
  readonly slug: string;
  readonly name: string;
  readonly kind: string;
  readonly abc: string;
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    slug: f.replace(/\.json$/, ""),
    ...JSON.parse(readFileSync(join(dir, f), "utf-8")),
  }))
  .filter((c) => c.kind === "creation");

describe("tunes that once crashed abcjs still render", () => {
  for (const c of CASES) {
    it(`${c.slug} — parses`, () => {
      const parsed = parse(c.abc);
      expect(parsed.ok).toBe(true);
    });
    it(`${c.slug} — renders`, () => {
      const svg = renderAll(c.abc, {})[0]?.svg ?? "";
      expect(svg.startsWith("<svg")).toBe(true);
    });
  }
});
