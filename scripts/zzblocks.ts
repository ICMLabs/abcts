/** Which measure each prose block hangs on — `F=<path>` */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
const s = score as unknown as Record<string, unknown>;
console.log("textAbove", JSON.stringify(s["textAbove"]));
console.log("textBelow", JSON.stringify(s["textBelow"]));
score.voices.forEach((v, vi) => {
  console.log(`voice ${vi} id=${(v as unknown as {id?:string}).id ?? "?"} measures=${v.measures.length}`);
  v.measures.forEach((m, mi) => {
    const r = m as unknown as Record<string, unknown>;
    const tb = r["textBefore"] as unknown[] | undefined;
    console.log(
      `   m${mi} events=${m.events.length} startsSystem=${String(r["startsSystem"])} textBefore=${tb === undefined ? "-" : JSON.stringify(tb).slice(0, 120)}`,
    );
  });
});
