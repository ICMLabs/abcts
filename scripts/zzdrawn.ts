/** Every element group the drawing opened, with what `abcelemOf` gives it — `F=<path>`. */
import { readFileSync } from "node:fs";

import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
import { toSVG, type DrawnElement } from "../src/renderer/svg.js";
import { projectionOf } from "../src/compat/lines.js";
import { abcelemOf } from "../src/compat/selectables.js";

const abc = readFileSync(process.env.F ?? "", "utf-8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const doc = layout(score, { mode: "abcjs-strict" });
const drawn: DrawnElement[] = [];
toSVG(doc, { staffSpace: 7.75, classes: "abcjs", drawn });
const p = projectionOf(score, abc);
drawn.forEach((d, i) => {
  const a = abcelemOf(d.element, { byEvent: p.byEvent, byRange: p.byRange });
  console.log(
    `${String(i).padStart(3)} ${d.name.padEnd(24)} #${d.ordinal} type=${d.element.type} range=${JSON.stringify((d.element as { sourceRange?: unknown }).sourceRange)} start=${a?.startChar} end=${a?.endChar}`,
  );
});
