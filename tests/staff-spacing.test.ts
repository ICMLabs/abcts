/**
 * STAFF-TO-STAFF SPACING against abcjs, boundary by boundary.
 *
 * A diagnostic, not a gate — it asserts only that it measured something real, and writes
 * its table to `/tmp/abcts-staff-spacing.txt`.
 *
 * It exists because the pixel-parity numbers cannot answer the vertical question on their
 * own. A notehead's distance from abcjs's mixes the horizontal axis (still tens of pixels
 * out on some fixtures) with the vertical, and `oy` mixes where the FIRST staff sits with
 * how far apart the rest are stacked. This measures one thing: given abcjs's own
 * bottom-line-to-top-line distance at each boundary, how far off is ours.
 *
 * The distinction is not academic — it reverses a conclusion. Tuning `ENGRAVE.systemGap`
 * and `staffGap` against the notehead median picks 3.0 / 1.5; tuning against THIS picks
 * 0 / 0, which is what abcjs actually uses (`staffTopMargin: 0`, and `addStaffPadding`
 * pads only to a minimum). Half of our boundaries are already exact to the pixel; the
 * fudges are averaging over the half that are not.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { corpusDir, goldensDir, loadCorpus } from "./corpus/corpus.js";
import { absolutePixels } from "./pixel-geometry.js";

/** The y of every staff's TOP line, in page pixels, in document order. */
const topLines = (svg: string): number[] =>
  absolutePixels(svg)
    .items.filter((item) => item.cls.includes("top-line"))
    .map((item) => item.y);

describe("staff spacing vs abcjs", () => {
  it("records each boundary error", () => {
    const rows: string[] = [
      "fixture".padEnd(30) + "ours - abcjs, per staff boundary (px)",
    ];
    const all: number[] = [];
    for (const entry of loadCorpus()) {
      const golden = join(goldensDir, `${entry.name}.svg`);
      if (!existsSync(golden)) continue;
      const g = topLines(readFileSync(golden, "utf-8"));
      const abc = readFileSync(join(corpusDir, `${entry.name}.abc`), "utf-8");
      const o = topLines(renderAll(abc, {})[0]?.svg ?? "");
      // A staff-count mismatch is a different defect and the structure gate owns it.
      if (g.length < 2 || g.length !== o.length) continue;
      const errors = g
        .slice(1)
        .map(
          (_, i) =>
            (o[i + 1] ?? 0) - (o[i] ?? 0) - ((g[i + 1] ?? 0) - (g[i] ?? 0)),
        );
      all.push(...errors);
      rows.push(
        entry.name.padEnd(30) +
          errors
            .slice(0, 12)
            .map((e) => e.toFixed(1).padStart(7))
            .join(""),
      );
    }
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const sorted = [...all].sort((a, b) => a - b);
    rows.push(
      "",
      `boundaries ${all.length}   exact(<0.05px) ${all.filter((e) => Math.abs(e) < 0.05).length}` +
        `   median ${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2)}` +
        `   mean ${mean(all).toFixed(2)}   mean |error| ${mean(all.map(Math.abs)).toFixed(2)}`,
    );
    writeFileSync("/tmp/abcts-staff-spacing.txt", rows.join("\n"));
    // The probe that lied for nine straight runs wrote a stale file and nobody noticed,
    // so this one proves it read real staves before anything reads its table.
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((e) => Math.abs(e) < 0.05).length).toBeGreaterThan(15);
  });
});
