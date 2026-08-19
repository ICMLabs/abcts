/** Our `tune.lines` shape, key by key — `F=<path>` */
import { readFileSync } from "node:fs";
import { renderAbc } from "../src/compat/index.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const tune = renderAbc(["*"], abc, {})[0]!;
tune.lines.forEach((l, i) => {
  const rec = l as unknown as Record<string, unknown>;
  const staff = rec["staff"] as { voices: unknown[] }[] | undefined;
  console.log(
    i,
    JSON.stringify(Object.keys(rec)),
    rec["subtitle"] === undefined ? "" : JSON.stringify(rec["subtitle"]),
    staff === undefined ? "" : `voices=${staff.map((s) => s.voices.length).join(",")}`,
  );
});
