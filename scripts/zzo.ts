/** Our markup for one file at given params -> /tmp/ours.svg — `F=<path> [W=staffwidth]` */
import { readFileSync, writeFileSync } from "node:fs";
import { renderAbc } from "../src/compat/index.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const out = renderAbc(
  ["*"],
  abc,
  process.env.W === undefined ? {} : { staffwidth: Number(process.env.W) },
);
const svg = out[0]?.svg ?? "";
writeFileSync("/tmp/ours.svg", svg);
console.log("len", svg.length);
