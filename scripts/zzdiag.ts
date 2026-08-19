/** Every diagnostic our parser emits over both corpora, by code. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/parser/parser.js";
const root = join(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf-8")) as { corpus: string };
const dirs = [join(root, "tests", "corpus-abcjs", "fixtures"), join(root, config.corpus)];
const byCode = new Map<string, number>();
const sample = new Map<string, string>();
for (const dir of dirs)
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".abc")).sort()) {
    const abc = readFileSync(join(dir, f), "utf8");
    for (const d of parse(abc, { mode: "abcjs-strict" }).diagnostics) {
      byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
      if (!sample.has(d.code)) sample.set(d.code, `${f}: ${d.message}`);
    }
  }
for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`${String(n).padStart(4)} ${code.padEnd(28)} ${sample.get(code)?.slice(0, 80)}`);
