import { readFileSync } from "node:fs";
import { parseOnly } from "../src/compat/index.js";
const tune = parseOnly(readFileSync(process.env["F"] as string, "utf-8"))[0];
(tune?.lines ?? []).forEach((l, i) => {
  if (!l.staff) return;
  l.staff.forEach((st, si) =>
    st.voices.forEach((v, vi) => {
      console.log(
        `line ${i} staff ${si} voice ${vi}: ` +
          v.map((e) => `${e.el_type}${e.decoration ? `[${e.decoration.join(",")}]` : ""}`).join(" "),
      );
    }),
  );
});
