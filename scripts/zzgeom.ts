/** Our laid-out geometry for one fixture — `F=<path> [T=<tune>]`. */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
import { layout } from "../src/renderer/layout.js";
const abc = readFileSync(process.env["F"] as string, "utf-8");
const p = parse(abc, { mode: "abcjs-strict" });
if (!p.ok) throw new Error("no");
const doc = layout(p.scores[Number(process.env["T"] ?? 0)]!, {
  mode: "abcjs-strict",
  systemWidth: Number(process.env["W"] ?? 740),
});
console.log("doc.top", doc.top, "height", doc.height, "width", doc.width);
doc.systems.forEach((sys, i) => {
  console.log(
    `system ${i} staves=${sys.staves.length} firstTopPitch=${sys.firstTopPitch} lastBottomPitch=${sys.lastBottomPitch} absoluteY=[${sys.staves.map((s) => s.absoluteY).join(",")}]`,
  );
  sys.staves.forEach((st, s) =>
    st.voices.forEach((v, k) =>
      console.log(
        `  s${s} v${k}`,
        v.slice(0, 6).map((e) => `${e.type}@x=${e.x.toFixed(3)},w=${e.width.toFixed(3)},rod=${e.rod?.toFixed(3)},rodW=${e.rodWidth?.toFixed(3)}`).join(" "),
      ),
    ),
  );
});
