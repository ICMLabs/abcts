/** Voice-0 elements at the width-0 layout — `F=<path>` */
import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const doc = layout({ ...score, staffWidth: null }, { mode: "abcjs-strict", systemWidth: 30 });
doc.systems.forEach((sys, i) => {
  console.log(`system ${i}`);
  for (const el of sys.staves[0]?.voices[0] ?? [])
    console.log(`   ${el.type.padEnd(14)} x=${el.x.toFixed(3)} w=${el.width.toFixed(3)}`);
});
