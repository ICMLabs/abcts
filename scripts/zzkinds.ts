import { readFileSync } from "node:fs";
import { parseOnly } from "../src/compat/index.js";
const abc = readFileSync(process.env["F"]!, "utf-8");
const t: any = parseOnly(abc)[Number(process.env["T"] ?? 0)];
(t.lines ?? []).forEach((l: any, i: number) => {
  if (!l.staff) return;
  l.staff.forEach((st: any, s: number) =>
    st.voices.forEach((v: any[], vi: number) =>
      console.log(`L${i}s${s}v${vi}`, v.map((e) => e.el_type).join(" "))));
});
