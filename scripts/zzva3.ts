/** Every differing row — `TYPE=<abcjs type>` / `COL=<index>` filter, `N=` limit. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAbc } from "../src/compat/index.js";
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "tests", "corpus-voices-array", "golden.json"), "utf-8"),
) as Record<string, unknown[][]>;
const IN_REPO = join(import.meta.dirname, "..", "tests", "corpus-abcjs", "fixtures");
let shown = 0;
for (const [slug, want] of Object.entries(GOLDEN)) {
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
  for (let i = 0; i < Math.min(want.length, got.length); i += 1) {
    const a = want[i] ?? [], b = got[i] ?? [];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const col = process.env.COL === undefined ? undefined : Number(process.env.COL);
    if (col !== undefined && JSON.stringify(a[col]) === JSON.stringify(b[col])) continue;
    if (process.env.TYPE !== undefined && a[5] !== process.env.TYPE) continue;
    console.log(`${slug} row ${i}\n  abcjs ${JSON.stringify(a)}\n  ours  ${JSON.stringify(b)}`);
    if (++shown >= Number(process.env.N ?? 6)) process.exit(0);
  }
}
