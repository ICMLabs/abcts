/**
 * **THE ELEMENT-VALUE GATE — one row per element of a `parseOnly` tune.**
 *
 * The reduction, and the argument for it beside `parse-only`, are in
 * `tests/parse-values-script.ts`. The oracle is harvested by RUNNING abcjs 6.7.0
 * (`scripts/harvest-abcjs-parse-values.ts`), never copied from its suite.
 *
 * It writes `/tmp/abcts-parse-values-ranked.txt`, CLASSIFIED BY WHICH KEY DIFFERS rather
 * than by element kind — the kind is `note` on almost every row and says nothing about
 * what to fix, where the key names the defect directly.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";
import { canon, valuesOfTune } from "./parse-values-script.js";

const goldenPath = join(import.meta.dirname, "corpus-parse-values", "golden.json");
const golden: Record<string, Record<string, string>> = existsSync(goldenPath)
  ? (JSON.parse(readFileSync(goldenPath, "utf-8")) as Record<string, Record<string, string>>)
  : {};

const fixturesFor = (slug: string): { file: string; tune: number } => {
  const m = /^(repo|sib)\/(.*)-tune(\d+)$/.exec(slug);
  return { file: m?.[2] ?? "", tune: Number(m?.[3] ?? 0) };
};

const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "abcts.config.json"), "utf-8"),
) as { goldens: string };
const dirOf = (slug: string): string =>
  slug.startsWith("repo/")
    ? join(import.meta.dirname, "corpus-abcjs", "fixtures")
    : join(import.meta.dirname, "..", config.goldens, "..", "fixtures");

interface Row {
  readonly slug: string;
  readonly agree: number;
  readonly total: number;
  readonly diffs: readonly { at: string; theirs: string; ours: string }[];
}

const rows: Row[] = [];
/** One `parseOnly` per FILE, not per tune — it returns every tune of the book. */
const cache = new Map<string, unknown[]>();
for (const slug of Object.keys(golden)) {
  const { file, tune } = fixturesFor(slug);
  const path = join(dirOf(slug), `${file}.abc`);
  if (!existsSync(path)) continue;
  const key = `${dirOf(slug)}::${file}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, parseOnly(readFileSync(path, "utf-8")) as unknown[]);
    } catch {
      cache.set(key, []);
    }
  }
  const ours = valuesOfTune(
    (cache.get(key)?.[tune] ?? {}) as Parameters<typeof valuesOfTune>[0],
  );
  const want = golden[slug] as Record<string, string>;
  let agree = 0;
  const diffs: { at: string; theirs: string; ours: string }[] = [];
  for (const [at, theirs] of Object.entries(want)) {
    const mine = ours.get(at);
    if (mine === theirs) agree += 1;
    else diffs.push({ at, theirs, ours: mine ?? "(absent)" });
  }
  // …and an element abcjs does NOT have is a difference too, or the gate could be passed
  // by emitting more.
  for (const at of ours.keys())
    if (!(at in want)) diffs.push({ at, theirs: "(absent)", ours: ours.get(at) ?? "" });
  rows.push({ slug, agree, total: Object.keys(want).length, diffs });
}

/** Which KEYS of an element differ — the classifier that makes a row actionable. */
const differingKeys = (theirs: string, ours: string): string => {
  let a: Record<string, unknown>, b: Record<string, unknown>;
  try {
    a = JSON.parse(theirs) as Record<string, unknown>;
    b = JSON.parse(ours) as Record<string, unknown>;
  } catch {
    return "(shape)";
  }
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return (
    names.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join("+") || "(equal)"
  );
};

describe("parseOnly element values vs abcjs", () => {
  it("measured something real", () => {
    expect(rows.length).toBeGreaterThan(250);
    expect(rows.reduce((t, r) => t + r.total, 0)).toBeGreaterThan(9000);
  });

  it("writes the ranked table", () => {
    const total = rows.reduce((t, r) => t + r.total, 0);
    const agree = rows.reduce((t, r) => t + r.agree, 0);
    const kinds = new Map<string, { n: number; eg: string }>();
    for (const r of rows)
      for (const d of r.diffs) {
        const type =
          (/"el_type":"([^"]+)"/.exec(d.theirs) ?? /"el_type":"([^"]+)"/.exec(d.ours))?.[1] ??
          "?";
        const tag = `${type}  ${differingKeys(d.theirs, d.ours)}`;
        const e = kinds.get(tag) ?? { n: 0, eg: `${r.slug} ${d.at}` };
        kinds.set(tag, { n: e.n + 1, eg: e.eg });
      }
    const text = [
      `${total - agree} of ${total} element values differ; ${agree} agree`,
      "",
      ...[...kinds]
        .sort((x, y) => y[1].n - x[1].n)
        .map(([k, v]) => `  ${String(v.n).padStart(5)}  ${k.padEnd(38)} e.g. ${v.eg}`),
    ].join("\n");
    writeFileSync("/tmp/abcts-parse-values-ranked.txt", `${text}\n`);
    expect(total).toBeGreaterThan(0);
  });

  /**
   * **CLOSED — EVERY ELEMENT, EVERY FIELD.** This opened at 1,249 of 9,727 differing and
   * is at zero, so it is an EXACT gate now and not a floor: any element that regresses
   * anywhere fails here, and the row it names is the defect.
   */
  it("every element value agrees with abcjs", () => {
    const agree = rows.reduce((t, r) => t + r.agree, 0);
    const total = rows.reduce((t, r) => t + r.total, 0);
    const worst = rows
      .filter((r) => r.diffs.length > 0)
      .flatMap((r) => r.diffs.slice(0, 1).map((d) => `${r.slug} ${d.at}\n  abcjs ${d.theirs}\n  ours  ${d.ours}`))
      .slice(0, 3)
      .join("\n");
    expect(`${total - agree} differ\n${worst}`).toBe("0 differ\n");
  });

  /** The canonicaliser is what both sides trust; a stray `undefined` would hide a row. */
  it("canon sorts keys and drops undefined", () => {
    expect(JSON.stringify(canon({ b: 1, a: undefined, c: { z: 1, y: 2 } }))).toBe(
      '{"b":1,"c":{"y":2,"z":1}}',
    );
  });
});
