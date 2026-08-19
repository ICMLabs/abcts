/** Our diagnostics for one file — `F=<path>` */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const r = parse(abc, { mode: "abcjs-strict" });
console.log(`${r.diagnostics.length} diagnostics`);
for (const d of r.diagnostics)
  console.log(` ${d.severity} ${d.code} ${JSON.stringify(d.message)} @${JSON.stringify(d.range)}`);
