// A sibling fixture rendered in PRINT media -> /tmp/ours.svg
//   S=<slug> [T=<tune>] npx tsx scripts/zzpm.ts
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
const out = renderAll(abc, { staffwidth: 670, print: true });
writeFileSync("/tmp/ours.svg", out[Number(process.env.T ?? 0)]?.svg ?? "");
