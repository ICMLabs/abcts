/** The key-signature element's glyphs — `ABC=<text>` */
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
const abc = process.env.ABC ?? "";
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const doc = layout(score, { mode: "abcjs-strict" });
for (const sys of doc.systems)
  for (const staff of sys.staves)
    for (const voice of staff.voices)
      for (const el of voice)
        if (el.type === "keySignature")
          console.log("key element", el.x, el.glyphs.map((g) => `${g.name}@${g.x.toFixed(2)}`).join(" "));
