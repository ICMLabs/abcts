import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
import { glyphsFor } from "../src/renderer/glyph-table.js";

const r = parse(readFileSync(process.env["F"] as string, "utf-8")) as { scores?: unknown[] };
const doc = layout((r.scores?.[0] ?? {}) as never, { systemWidth: Number(process.env["W"] ?? 770) } as never);
const glyphs = glyphsFor(true);
for (const system of doc.systems)
  for (const staff of system.staves)
    for (const voice of staff.voices)
      for (const el of voice) {
        const heads = el.glyphs.filter((g) => g.role === "notehead");
        if (Math.abs(el.x - Number(process.env["X"] ?? -1)) > 0.01) continue;
        console.log(
          "el.x", el.x, "rod", el.rodWidth, "width", el.width,
          el.glyphs.map((g) => `[${g.name} x=${g.x} dx=${g.dx} w=${glyphs.width(g.name)} role=${g.role}]`).join(" "),
        );
      }
