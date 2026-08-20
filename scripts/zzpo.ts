/**
 * `parseOnly`'s field divergence, CLASSIFIED — which field on which `el_type`, and in how
 * many tunes. The gate's ranked table shows the FIRST differing row per tune; this shows
 * every one.
 *
 *   npx tsx scripts/zzpo.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseOnly } from "../src/compat/index.js";
import { rowsOfTune } from "../tests/parse-only-script.js";

const root = join(import.meta.dirname, "..");
const GOLDEN = JSON.parse(
  readFileSync(join(root, "tests", "corpus-parse-only", "golden.json"), "utf-8"),
) as Record<string, string[]>;
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf-8")) as {
  corpus: string;
};
const DIRS: Record<string, string> = {
  repo: join(root, "tests", "corpus-abcjs", "fixtures"),
  sib: join(root, config.corpus),
};

const split = (row: string): [string, Set<string>] => {
  if (row.startsWith("staff.")) {
    const parts = row.split(" ");
    return [`${parts[0]} ${parts[1]}`, new Set((parts[2] ?? "").split(",").filter(Boolean))];
  }
  const at = row.indexOf(" ");
  return [row.slice(0, at), new Set(row.slice(at + 1).split(",").filter(Boolean))];
};
/** The el_type name without the `el_type=` clause, so a rename does not split the counts. */
const kindOf = (head: string): string => head.split(" ")[0] ?? head;

const extra = new Map<string, number>();
const missing = new Map<string, number>();
const renamed = new Map<string, number>();
const bump = (m: Map<string, number>, k: string): void => m.set(k, (m.get(k) ?? 0) + 1);

const cache = new Map<string, string[][]>();
for (const [slug, want] of Object.entries(GOLDEN)) {
  const at = slug.indexOf("/");
  const corpus = slug.slice(0, at);
  const rest = slug.slice(at + 1);
  const cut = rest.lastIndexOf("-tune");
  const file = rest.slice(0, cut);
  const index = Number(rest.slice(cut + "-tune".length));
  const key = `${corpus}/${file}`;
  let all = cache.get(key);
  if (all === undefined) {
    const abc = readFileSync(join(DIRS[corpus] ?? "", `${file}.abc`), "utf-8");
    all = parseOnly(abc).map((t) => rowsOfTune(t as never));
    cache.set(key, all);
  }
  const got = all[index] ?? [];
  const ours = new Map(got.map((r) => [kindOf(split(r)[0]), r]));
  const theirs = new Map(want.map((r) => [kindOf(split(r)[0]), r]));
  for (const [kind, row] of theirs) {
    const mine = ours.get(kind);
    if (mine === undefined) {
      bump(missing, `${kind}  (the whole kind)`);
      continue;
    }
    const [ta, fa] = split(row);
    const [tb, fb] = split(mine);
    if (ta !== tb) bump(renamed, `${ta}  ->  ${tb}`);
    for (const f of fb) if (!fa.has(f)) bump(extra, `${kind}.${f}`);
    for (const f of fa) if (!fb.has(f)) bump(missing, `${kind}.${f}`);
  }
  for (const kind of ours.keys())
    if (!theirs.has(kind)) bump(extra, `${kind}  (the whole kind)`);
}
const show = (label: string, m: Map<string, number>): void => {
  console.log(`\n## ${label}`);
  for (const [k, n] of [...m].sort((x, y) => y[1] - x[1]))
    console.log(`  ${String(n).padStart(4)}  ${k}`);
};
show("OURS HAS, abcjs does NOT", extra);
show("abcjs HAS, ours does NOT", missing);
show("RENAMED", renamed);
