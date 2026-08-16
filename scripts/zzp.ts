// One tune's parsed notes — pitch, accidental and microtone. `ABC=$'X:1\nK:C\n^3/2G\n'`.
import { parse } from "../src/parser/parser.js";
const r = parse(process.env.ABC ?? "");
if (!r.ok) throw new Error("parse failed");
for (const m of r.scores[0]?.voices[0]?.measures ?? []) {
  for (const e of m.events) {
    if (e.type === "note")
      console.log(JSON.stringify({ p: e.pitch, cents: e.microtoneCents }));
  }
}
