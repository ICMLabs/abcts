/** Meter changes per measure — `F=<path>` */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
score.voices.forEach((v, vi) =>
  v.measures.forEach((m, mi) => {
    const r = m as unknown as Record<string, unknown>;
    if (r["meterChange"] == null && r["meterChanges"] === undefined) return;
    console.log(
      `voice ${vi} m${mi} events=${m.events.length} startsSystem=${String(r["startsSystem"])}`,
      "meterChanges=", JSON.stringify(r["meterChanges"]),
      "inline=", r["meterChangeInline"], "standalone=", r["meterChangeStandalone"],
      "range=", JSON.stringify(r["meterChangeSourceRange"]),
    );
  }),
);
