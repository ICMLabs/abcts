// Rest events. `ABC=$'X:1\nM:4/4\nK:C\nZ2\n' npx tsx scripts/zzr.ts`
import { parse } from "../src/parser/parser.js";
const r = parse(process.env.ABC ?? "");
if (!r.ok) throw new Error("parse failed");
for (const m of r.scores[0]?.voices[0]?.measures ?? [])
  for (const e of m.events)
    if (e.type === "rest")
      console.log(
        JSON.stringify({ kind: e.kind, dur: e.duration, mc: e.measureCount }),
      );
