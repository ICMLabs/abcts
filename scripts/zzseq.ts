import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOnly } from "../src/compat/index.js";
import { sequenceOf, type SequenceRow, type SequenceTune } from "../src/compat/sequence.js";

const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "tests", "corpus-sequence", "golden.json"), "utf-8"),
) as Record<string, SequenceRow[][]>;
const IN_REPO = join(import.meta.dirname, "..", "tests", "corpus-abcjs", "fixtures");

const row = (el: SequenceRow): Record<string, unknown> => {
  const out: Record<string, unknown> = { el_type: el.el_type };
  for (const key of Object.keys(el).sort()) {
    if (key === "el_type" || key === "elem" || el[key] === undefined) continue;
    out[key] = el[key];
  }
  return out;
};

const near = (a: unknown, b: unknown): boolean => {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.0000005;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => near(v, b[i]));
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return (a ?? null) === (b ?? null);
};

const counts = new Map<string, number>();
const example = new Map<string, string>();
const only = process.env["ONLY"];
for (const [slug, want] of Object.entries(GOLDEN)) {
  if (only && !slug.includes(only)) continue;
  const tune = parseOnly(readFileSync(join(IN_REPO, `${slug}.abc`), "utf-8"))[0];
  if (tune === undefined) continue;
  const got = sequenceOf(tune as unknown as SequenceTune, {});
  for (let v = 0; v < Math.max(want.length, got.length); v += 1) {
    const a = want[v] ?? [];
    const b = (got[v] ?? []).map(row);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const x = JSON.stringify(a[i]);
      const y = JSON.stringify(b[i]);
      if (near(a[i], b[i])) continue;
      const ta = a[i]?.el_type ?? "MISSING";
      const tb = (b[i] as { el_type?: string } | undefined)?.el_type ?? "MISSING";
      let key = `${ta} vs ${tb}`;
      if (ta === tb && ta === "note") {
        if (x.includes("midipitch") && !y.includes("midipitch")) key = "note: midipitch";
        else if (x.includes('"whole"') && !y.includes('"whole"')) key = "note: rest whole";
        else if (x.includes("endTie") !== y.includes("endTie")) key = "note: endTie";
        else if (x.includes("multimeasure")) key = "note: multimeasure";
        else key = "note: other";
      } else if (ta === tb) key = `${ta}: fields`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!example.has(key)) example.set(key, `${slug} v${v} #${i}\n    abcjs ${x}\n    ours  ${y}`);
    }
  }
}
for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`${String(n).padStart(4)} ${k}\n    ${example.get(k)}`);
