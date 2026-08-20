/**
 * Slur MARKS on both levels — the element, its pitches and its grace notes — for one tune
 * or for the built-in shape matrix. Pair with `/tmp/gp/slurm.js`, which prints abcjs's.
 *
 *   npx tsx scripts/zzslur.ts                 (the matrix)
 *   F=<fixture> T=<tune> npx tsx scripts/zzslur.ts
 */
import { readFileSync } from "node:fs";
import { parseOnly, renderAbc } from "../src/compat/index.js";

const CASES: Record<string, string> = {
  "slur two notes": "X:1\nL:1/4\nK:C\n(CD)|\n",
  "slur round a chord": "X:1\nL:1/4\nK:C\n([CE]G)|\n",
  "slur inside a chord": "X:1\nL:1/4\nK:C\n[(CE)G]|\n",
  "nested slurs": "X:1\nL:1/4\nK:C\n((CD)E)|\n",
  "grace slur": "X:1\nL:1/4\nK:C\n{(CD)}E|\n",
  "slur to a rest": "X:1\nL:1/4\nK:C\n(Cz)|\n",
  "slur ending on a chord": "X:1\nL:1/4\nK:C\n(C[EG])|\n",
  "slur chord to chord": "X:1\nL:1/4\nK:C\n([CE][GB])|\n",
  "slur from a rest": "X:1\nL:1/4\nK:C\n(zC)|\n",
};

const dump = (t: any): string[] => {
  const out: string[] = [];
  (t.lines ?? []).forEach((l: any) => {
    if (!l.staff) return;
    l.staff.forEach((st: any) =>
      st.voices.forEach((v: any[]) =>
        v.forEach((e: any, ei: number) => {
          const bits: string[] = [];
          if (e.startSlur !== undefined) bits.push(`el.start=${JSON.stringify(e.startSlur)}`);
          if (e.endSlur !== undefined) bits.push(`el.end=${JSON.stringify(e.endSlur)}`);
          (e.pitches ?? []).forEach((p: any, pi: number) => {
            if (p.startSlur !== undefined) bits.push(`p${pi}.start=${JSON.stringify(p.startSlur)}`);
            if (p.endSlur !== undefined) bits.push(`p${pi}.end=${JSON.stringify(p.endSlur)}`);
          });
          (e.gracenotes ?? []).forEach((g: any, gi: number) => {
            if (g.startSlur !== undefined) bits.push(`g${gi}.start=${JSON.stringify(g.startSlur)}`);
            if (g.endSlur !== undefined) bits.push(`g${gi}.end=${JSON.stringify(g.endSlur)}`);
          });
          if (bits.length) out.push(`#${ei} ${e.el_type} ${bits.join(" ")}`);
        }),
      ),
    );
  });
  return out;
};

const file = process.env["F"];
if (file === undefined) {
  for (const [name, abc] of Object.entries(CASES)) {
    console.log("###", name);
    console.log("  parseOnly:", JSON.stringify(dump(parseOnly(abc)[0])));
    console.log("  rendered :", JSON.stringify(dump(renderAbc(["*"], abc, {})[0])));
  }
} else {
  const idx = Number(process.env["T"] ?? 0);
  const abc = readFileSync(file, "utf-8");
  console.log("  parseOnly:", JSON.stringify(dump(parseOnly(abc)[idx]), null, 1));
  console.log(
    "  rendered :",
    JSON.stringify(dump(renderAbc(Array.from({ length: idx + 1 }, () => "*"), abc, {})[idx]), null, 1),
  );
}
