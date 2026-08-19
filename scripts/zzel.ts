/** Raw layout elements of one file — `F=<path>` */
import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const doc = layout(score, { mode: "abcjs-strict" });
for (const system of doc.systems)
  for (const staff of system.staves)
    for (const voice of staff.voices)
      for (const el of voice) {
        const e = el as unknown as Record<string, unknown>;
        console.log(
          el.type,
          "x", e["x"], "width", e["width"], "rodWidth", e["rodWidth"], "rod", e["rod"],
          "spring", e["spring"], "durationClass", e["durationClass"],
        );
      }
