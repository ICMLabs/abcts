/**
 * THE HARVESTED CORPUS, RANKED BY WORST AXIS, WITH EACH FIXTURE'S DIRECTIVES BESIDE IT.
 *
 * A diagnostic, not a gate — it asserts only that it measured something real, and writes
 * its table to `/tmp/abcts-corpus-ranked.txt`. `corpus-abcjs.test.ts` owns the ratchet.
 *
 * It exists because the ratchet's four counts cannot say WHAT to fix next. Every defect
 * closed on 2026-08-03 after the first checkpoint was written came off this list and none
 * of them off the counts: `clef=none` read as a C clef, `%%text` reserving nothing,
 * `V:… merge` unimplemented, `bass,,` parsed as no clef, an empty implicit voice taking a
 * staff, and the two line-assignment rules. The DIRECTIVES column is what makes it
 * actionable — it is what put `%%begintext` ahead of the `%%barnumbers` tail an earlier
 * checkpoint led with, and what showed `misc-01-barnumbers-1` to be a multi-measure-rest
 * fixture rather than a bar-number one.
 *
 * Read it with the shape in mind, not just the total: `dy 0.0` beside a large `dx` is a
 * horizontal defect and not this arc's, and a large `|oy|` with `dy` near zero is a rigid
 * vertical shift — one term, usually one cause.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { absolutePixels, byClass } from "./pixel-geometry.js";

const base = join(dirname(fileURLToPath(import.meta.url)), "corpus-abcjs");
const fixturesDir = join(base, "fixtures");
const goldenDir = join(base, "golden");
const goldens = readdirSync(goldenDir);

/** abcjs writes one SVG per tune, `<name>.svg` alone or `<name>-tuneN.svg` for a book. */
const goldensFor = (name: string): string[] =>
  existsSync(join(goldenDir, `${name}.svg`))
    ? [`${name}.svg`]
    : goldens.filter((g) => g.startsWith(`${name}-tune`)).sort();

describe("abcjs test-suite corpus, ranked", () => {
  it("writes the worst-axis table", () => {
    const names = readdirSync(fixturesDir)
      .filter((f) => f.endsWith(".abc"))
      .map((f) => f.replace(/\.abc$/, ""))
      .sort();
    const rows: string[] = [];
    let measured = 0;
    for (const name of names) {
      const abc = readFileSync(join(fixturesDir, `${name}.abc`), "utf-8");
      const files = goldensFor(name);
      // The goldens' own `{staffwidth: 670}` — abcjs's screen DEFAULT is 740, so a bare
      // `{}` compares a 770px page against a 700px one (`engraver-controller.js:52-60`).
      const ours = renderAll(abc, { staffwidth: 670 });
      // A tune-count mismatch is a CONTENT gap and the ratchet owns it; it has no axes.
      if (ours.length !== files.length) {
        rows.push(
          `   ------  TUNE COUNT ${ours.length} vs ${files.length}  ${name}`,
        );
        continue;
      }
      let dy = 0;
      let dx = 0;
      let sumY = 0;
      let sumX = 0;
      let paired = 0;
      files.forEach((file, i) => {
        const g = byClass(
          absolutePixels(readFileSync(join(goldenDir, file), "utf-8")),
          "notehead",
        );
        const o = byClass(absolutePixels(ours[i]?.svg ?? ""), "notehead");
        const n = Math.min(g.length, o.length);
        const deltas = (axis: "x" | "y"): number[] =>
          g.slice(0, n).map((head, k) => (o[k]?.[axis] ?? 0) - head[axis]);
        const spread = (v: number[]): number =>
          v.length === 0 ? 0 : Math.max(...v) - Math.min(...v);
        dy = Math.max(dy, spread(deltas("y")));
        dx = Math.max(dx, spread(deltas("x")));
        sumY += deltas("y").reduce((a, b) => a + b, 0);
        sumX += deltas("x").reduce((a, b) => a + b, 0);
        paired += n;
      });
      measured += paired;
      const oy = paired === 0 ? 0 : sumY / paired;
      const ox = paired === 0 ? 0 : sumX / paired;
      const worst = Math.max(dy, dx, Math.abs(oy), Math.abs(ox));
      if (worst < 0.05) continue;
      const directives = [
        ...new Set([...abc.matchAll(/^%%\s*(\w+)/gm)].map((m) => m[1])),
      ];
      const n = (v: number): string => v.toFixed(1).padStart(7);
      rows.push(
        `${worst.toFixed(2).padStart(9)}  dy=${n(dy)} dx=${n(dx)} oy=${n(oy)} ox=${n(ox)}  ` +
          `${name}  [${directives.join(",")}]`,
      );
    }
    rows.sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a));
    writeFileSync(
      "/tmp/abcts-corpus-ranked.txt",
      [
        `${rows.length} of ${names.length} fixtures are off some axis by 0.05px or more`,
        ...rows,
      ].join("\n"),
    );
    // The canary: a run that measured nothing would file an empty table and read as parity.
    expect(measured).toBeGreaterThan(500);
    expect(names.length).toBeGreaterThan(150);
  });
});
