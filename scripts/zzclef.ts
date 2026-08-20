import { readFileSync } from "node:fs";
import { parseOnly } from "../src/compat/index.js";
const tune = parseOnly(readFileSync(process.env["F"] as string, "utf-8"))[0];
(tune?.lines ?? []).forEach((l, i) => {
  if (!l.staff) return;
  l.staff.forEach((st, si) =>
    console.log(`line ${i} staff ${si} clef=${JSON.stringify(st.clef)} key=${JSON.stringify(st.key?.accidentals)}`),
  );
});
