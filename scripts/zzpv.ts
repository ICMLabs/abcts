import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOnly } from "../src/compat/index.js";
import { valuesOfTune } from "../tests/parse-values-script.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf-8"));
const require = createRequire(join(root, config.goldens, "..", "package.json"));
const ABCJS = require(join(root, config.abcjsRef, "index"));

// **THE SHARED REDUCTION, NOT A COPY OF IT.** This probe held its own `canon`/`rows` pair
// and drifted the moment the gate's walk was widened to lines and staves — reporting 9,727
// where the gate saw 11,004. Same trap `synth-controller.test.ts` paid for.
const rows = valuesOfTune;

const corpora: [string, string][] = [
  ["repo", join(root, "tests", "corpus-abcjs", "fixtures")],
  ["sib", join(root, config.goldens, "..", "fixtures")],
];
let agree = 0, total = 0;
const diffs: string[] = [];
for (const [label, dir] of corpora) {
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".abc")) continue;
    const abc = readFileSync(join(dir, f), "utf-8");
    let theirs: any[], ours: any[];
    try { theirs = ABCJS.parseOnly(abc); } catch { continue; }
    try { ours = parseOnly(abc); } catch { diffs.push(`${label}/${f} OURS THREW`); continue; }
    theirs.forEach((t: any, i: number) => {
      const a = rows(t as any), b = rows((ours[i] ?? {}) as any);
      for (const [k, v] of a) {
        total++;
        if (b.get(k) === v) { agree++; continue; }
        if (diffs.length < 4000) diffs.push(`${label}/${f.replace(/\.abc$/, "")}-tune${i} ${k}\n    abcjs ${v}\n    ours  ${b.get(k) ?? "(absent)"}`);
      }
      for (const k of b.keys()) if (!a.has(k)) { total++; diffs.push(`${label}/${f.replace(/\.abc$/, "")}-tune${i} ${k} EXTRA IN OURS`); }
    });
  }
}
console.log(`${agree} of ${total} element values agree; ${total - agree} differ`);
// CLASSIFY BY WHICH KEY DIFFERS, not by element kind — the kind is the same for
// every row and says nothing about what to fix.
const kinds = new Map<string, { n: number; eg: string }>();
for (const d of diffs) {
  const [head, a, b] = d.split("\n");
  const type = /"el_type":"([^"]+)"/.exec(d)?.[1] ?? "?";
  let key = "(shape)";
  try {
    const A = JSON.parse((a ?? "").replace(/^\s*abcjs /, ""));
    const B = JSON.parse((b ?? "").replace(/^\s*ours {2}/, ""));
    const names = [...new Set([...Object.keys(A), ...Object.keys(B)])];
    const bad = names.filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
    key = bad.join("+") || "(equal?)";
    if (key === "pitches") {
      const pa = A["pitches"] as Record<string, unknown>[];
      const pb = B["pitches"] as Record<string, unknown>[];
      key = pa.map((x) => x["name"]).join("") === pb.map((x) => x["name"]).join("")
        ? "pitches." + [...new Set(pa.flatMap((x, i) =>
            Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(pb[i]?.[k]))))].join("+")
        : "pitches:ORDER";
    }
  } catch { /* keep (shape) */ }
  const tag = `${type}  ${key}`;
  const e = kinds.get(tag) ?? { n: 0, eg: d };
  kinds.set(tag, { n: e.n + 1, eg: e.eg });
}
const only = process.env.K;
for (const [k, v] of [...kinds].sort((x, y) => y[1].n - x[1].n)) {
  if (only !== undefined && !k.includes(only)) continue;
  console.log(`  ${String(v.n).padStart(5)}  ${k}`);
  if (only !== undefined) console.log(v.eg + "\n");
}
