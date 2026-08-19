/** Bar x positions at a given systemWidth — `F=<path> [W=<layout units>]` */
import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const w = process.env.W === undefined ? undefined : Number(process.env.W);
const doc = layout(score, { mode: "abcjs-strict", ...(w === undefined ? {} : { systemWidth: w }) });
doc.systems.forEach((sys, i) => {
  const voice = sys.staves[0]?.voices[0] ?? [];
  const bars = voice.filter((e) => e.type === "bar").map((e) => e.x);
  const first = voice.find((e) => e.type !== "clef" && e.type !== "keySignature");
  console.log(
    `system ${i} width=${sys.musicWidth} left=${first?.x} bars=${bars.map((x) => x.toFixed(3)).join(" ")}`,
  );
});
