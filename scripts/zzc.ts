// A sibling fixture rendered with `add_classes` -> /tmp/ours.svg
//   S=<slug> [T=<tune>] npx tsx scripts/zzc.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "../tests/render-all.js";
const dir = join(
  import.meta.dirname,
  "..",
  "..",
  "abcMusicKit",
  "Tools",
  "abcjs-debug",
  "fixtures",
);
const abc = readFileSync(join(dir, `${process.env.S}.abc`), "utf8");
const out = renderAll(abc, { staffwidth: 670, add_classes: true });
writeFileSync("/tmp/ours.svg", out[Number(process.env.T ?? 0)]?.svg ?? "");
