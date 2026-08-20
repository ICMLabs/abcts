import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
import { glyphsFor } from "../src/renderer/glyph-table.js";

const r = parse(readFileSync(process.env["F"] as string, "utf-8")) as { scores?: unknown[] };
const doc = layout((r.scores?.[0] ?? {}) as never, { systemWidth: Number(process.env["W"] ?? 0) || undefined } as never);
const glyphs = glyphsFor(true);
for (const system of doc.systems)
  for (const staff of system.staves)
    for (const voice of staff.voices)
      for (const el of voice) {
        const heads = el.glyphs.filter((g) => g.role === "notehead");
        if (heads.length < 2) continue;
        console.log(
          "el.x", el.x, "rod", el.rodWidth, "width", el.width,
          heads.map((g) => `[x=${g.x} dx=${g.dx} w=${glyphs.width(g.name)}]`).join(" "),
        );
      }
