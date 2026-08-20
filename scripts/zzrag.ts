/**
 * Every `tuneMetrics` number that differs for one tune, abcjs's beside ours.
 *
 *   F=<fixture path> [SLUG=sib/<name>-tune0] npx tsx scripts/zzrag.ts
 *
 * The oracle is `tests/corpus-tune-metrics/golden.json`. Prints nothing when the tune
 * agrees on `left`, every measure width and the section total.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tuneMetrics } from "../src/compat/index.js";
const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, "..", "tests", "corpus-tune-metrics", "golden.json"), "utf-8")) as Record<string, any>;
const slug = process.env["SLUG"] ?? "sib/ragtime-nightingale-tune0";
const want = GOLDEN[slug];
const abc = readFileSync(process.env["F"]!, "utf-8");
const got: any = (tuneMetrics as any)(abc, {})[0]?.sections ?? [];
want.forEach((sec: any, i: number) => {
  const g = got[i];
  if (sec.left !== g.left) console.log(`sec ${i} left abcjs=${sec.left} ours=${g.left}`);
  if (sec.total !== g.total) console.log(`sec ${i} total abcjs=${sec.total} ours=${g.total}`);
  sec.measureWidths.forEach((w: number, j: number) => {
    if (w !== g.measureWidths[j]) console.log(`sec ${i} m${j} abcjs=${w} ours=${g.measureWidths[j]} d=${g.measureWidths[j] - w}`);
  });
  if (sec.measureWidths.length !== g.measureWidths.length) console.log(`sec ${i} count abcjs=${sec.measureWidths.length} ours=${g.measureWidths.length}`);
});
