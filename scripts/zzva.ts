/** Column-by-column disagreement of `makeVoicesArray` against the golden. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAbc } from "../src/compat/index.js";

const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "tests", "corpus-voices-array", "golden.json"), "utf-8"),
) as Record<string, unknown[][]>;
const IN_REPO = join(import.meta.dirname, "..", "tests", "corpus-abcjs", "fixtures");
const names = ["voice", "top", "height", "line", "measure", "type", "x", "w", "duration", "start", "end"];
const bad: Record<string, number> = {};
const byType: Record<string, number> = {};
let misaligned = 0, rows = 0;
for (const [slug, want] of Object.entries(GOLDEN)) {
  if (process.env.ONLY !== undefined && slug !== process.env.ONLY) continue;
  const abc = readFileSync(join(IN_REPO, `${slug}.abc`), "utf-8");
  const tune = renderAbc(["*"], abc, {})[0];
  const got: unknown[][] = [];
  tune?.makeVoicesArray().forEach((voice, v) => {
    for (const row of voice) {
      const el = row.elem;
      const bag = el.abcelem as Record<string, unknown>;
      got.push([v, row.top, row.height, row.line, row.measureNumber, el.type, el.x, el.w, el.duration,
        bag["startChar"] ?? null, bag["endChar"] ?? null]);
    }
  });
  if (got.length !== want.length) misaligned += 1;
  for (let i = 0; i < Math.min(want.length, got.length); i += 1) {
    rows += 1;
    const a = want[i] ?? [], b = got[i] ?? [];
    for (let c = 0; c < names.length; c += 1)
      if (JSON.stringify(a[c]) !== JSON.stringify(b[c])) {
        bad[names[c] ?? "?"] = (bad[names[c] ?? "?"] ?? 0) + 1;
        byType[`${names[c]}:${String(a[5])}`] = (byType[`${names[c]}:${String(a[5])}`] ?? 0) + 1;
      }
  }
}
console.log("rows compared", rows, "tunes with a different ROW COUNT", misaligned);
console.log("per column:", bad);
console.log("per column+type:", Object.entries(byType).sort((x, y) => y[1] - x[1]).slice(0, 14));
