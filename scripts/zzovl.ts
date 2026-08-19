/** Our resolved per-line voices, in abcjs's shape — `F=<path>` */
import { readFileSync } from "node:fs";
import { renderAbc } from "../src/compat/index.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
const tune = renderAbc(["*"], abc, {})[0]!;
tune.lines.forEach((l, i) => {
  const staffs = (l as unknown as { staff?: { voices: { el_type: string; rest?: unknown; duration?: number; startChar?: number }[][] }[] }).staff;
  if (staffs === undefined) return;
  staffs.forEach((st, s) => {
    console.log(`line ${i} staff ${s} voices=${st.voices.length}`);
    st.voices.forEach((v, vi) =>
      console.log(
        `   v${vi}: ${v.map((e) => (e.el_type === "note" ? (e.rest ? `R${e.duration}@${e.startChar}` : `n@${e.startChar}`) : e.el_type)).join(" ")}`,
      ),
    );
  });
});
