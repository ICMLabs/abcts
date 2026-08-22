/**
 * **THE RENDERED TUNE'S OBJECT — one row per line, staff and element of a tune that was
 * ENGRAVED.** The reduction is `tests/parse-values-script.ts`'s own — a SHARED SCRIPT,
 * never a copy — and what differs is the ENTRY POINT. The oracle is harvested by RUNNING
 * abcjs 6.7.0 (`scripts/harvest-abcjs-render-values.ts`).
 *
 * ⚠️ **AND THE ENTRY POINT IS PART OF THE EXPERIMENT.** `parse-values` compares a
 * `parseOnly` tune and rules this one out on purpose, because the parser's answer and the
 * engraver's are different answers: the engraver renames elements, stamps `averagepitch`,
 * `verticalPos`, `highestVert` and `printer_shift` as it walks what was DRAWN, hangs a
 * `nonMusic` block on every text line, sorts a chord's pitches and rewrites a whole rest's
 * type. None of that exists before a render, and nothing else here compares the OBJECT a
 * render hands back — the byte gate compares its SVG and the selectable array its indices.
 *
 * ⚠️ **TWO KEYS ARE STRIPPED FROM BOTH SIDES, AND THAT IS A DECLARED ABSENCE RATHER THAN
 * A TOLERANCE.** Every drawn element carries `abselem`, a back-pointer to the laid-out
 * element (`draw/absolute.js:72`), and every drawn line a `staffGroup`. Publishing them
 * means RETAINING THE `Layout`, which measurably killed this suite's workers once
 * (2026-08-16: 5.6s → 50-120s, a different test failing each run), and a host that wants
 * the drawn element has `getSelectableArray`. It is an owner decision, not a bug fix —
 * `Docs/HANDOFF-2026-08-21.md` §1 — so the two markers are removed HERE, where the
 * decision is visible, and `scripts/zzrv.ts` still counts them.
 *
 * Everything else is EXACT: the row it names IS the defect.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { valuesOfTune } from "./parse-values-script.js";

const goldenPath = join(import.meta.dirname, "corpus-render-values", "golden.json");
const golden: Record<string, Record<string, string>> = existsSync(goldenPath)
  ? (JSON.parse(readFileSync(goldenPath, "utf-8")) as Record<string, Record<string, string>>)
  : {};

const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "abcts.config.json"), "utf-8"),
) as { goldens: string };

const fixturesFor = (slug: string): { file: string; tune: number } => {
  const m = /^(repo|sib)\/(.*)-tune(\d+)$/.exec(slug);
  return { file: m?.[2] ?? "", tune: Number(m?.[3] ?? 0) };
};
const dirOf = (slug: string): string =>
  slug.startsWith("repo/")
    ? join(import.meta.dirname, "corpus-abcjs", "fixtures")
    : join(import.meta.dirname, "..", config.goldens, "..", "fixtures");

/** The two markers, off both sides — see the header. */
const strip = (row: string): string =>
  row
    .replace(/"abselem":"abselem",?/g, "")
    .replace(/"staffGroup":"staffGroup",?/g, "")
    .replace(/,}/g, "}");

interface Row {
  readonly slug: string;
  readonly agree: number;
  readonly total: number;
  readonly diffs: readonly { at: string; theirs: string; ours: string }[];
}

const rows: Row[] = [];
/** One render per FILE, not per tune — `renderAbc` returns every tune of the book. */
const cache = new Map<string, unknown[]>();
for (const slug of Object.keys(golden)) {
  const { file, tune } = fixturesFor(slug);
  const path = join(dirOf(slug), `${file}.abc`);
  if (!existsSync(path)) continue;
  const key = `${dirOf(slug)}::${file}`;
  if (!cache.has(key)) {
    const abc = readFileSync(path, "utf-8");
    try {
      const slots = abc.split(/^X:/m).length - 1;
      cache.set(
        key,
        renderAbc(
          Array.from({ length: Math.max(slots, 1) }, () => "*"),
          abc,
          { staffwidth: 670 },
        ) as unknown[],
      );
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
    if (mine !== undefined && strip(mine) === strip(theirs)) agree += 1;
    else diffs.push({ at, theirs, ours: mine ?? "(absent)" });
  }
  // …and a row abcjs does NOT have is a difference too, or the gate could be passed by
  // publishing more.
  for (const at of ours.keys())
    if (!(at in want)) diffs.push({ at, theirs: "(absent)", ours: ours.get(at) ?? "" });
  rows.push({ slug, agree, total: Object.keys(want).length, diffs });
}

/** Which KEYS of a row differ — the classifier that makes a row actionable. */
const differingKeys = (theirs: string, ours: string): string => {
  let a: Record<string, unknown>, b: Record<string, unknown>;
  try {
    a = JSON.parse(theirs) as Record<string, unknown>;
    b = JSON.parse(ours) as Record<string, unknown>;
  } catch {
    return "(shape)";
  }
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => k !== "abselem" && k !== "staffGroup",
  );
  return (
    names.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join("+") || "(equal)"
  );
};

describe("rendered element values vs abcjs", () => {
  it("measured something real", () => {
    expect(rows.length).toBeGreaterThan(250);
    expect(rows.reduce((t, r) => t + r.total, 0)).toBeGreaterThan(10000);
  });

  it("writes the ranked table", () => {
    const total = rows.reduce((t, r) => t + r.total, 0);
    const agree = rows.reduce((t, r) => t + r.agree, 0);
    const kinds = new Map<string, { n: number; eg: string }>();
    for (const r of rows)
      for (const d of r.diffs) {
        const type =
          (/"el_type":"([^"]+)"/.exec(d.theirs) ?? /"el_type":"([^"]+)"/.exec(d.ours))?.[1] ??
          (d.at.includes("/v") ? "el" : d.at.includes("/s") ? "staff" : "line");
        const tag = `${type}  ${differingKeys(d.theirs, d.ours)}`;
        const e = kinds.get(tag) ?? { n: 0, eg: `${r.slug} ${d.at}` };
        kinds.set(tag, { n: e.n + 1, eg: e.eg });
      }
    const text = [
      `${total - agree} of ${total} rendered values differ; ${agree} agree`,
      "",
      ...[...kinds]
        .sort((x, y) => y[1].n - x[1].n)
        .map(([k, v]) => `  ${String(v.n).padStart(5)}  ${k.padEnd(38)} e.g. ${v.eg}`),
    ].join("\n");
    writeFileSync("/tmp/abcts-render-values-ranked.txt", `${text}\n`);
    expect(total).toBeGreaterThan(0);
  });

  /**
   * **CLOSED.** It opened at 60 rows over two classes — an overlay pad's stamped pitch,
   * which was an identity fault and a value fault behind it, and the whole `nonMusic`
   * block, which was not built at all — with the `abselem` decision measured separately.
   */
  it("every rendered value agrees with abcjs", () => {
    const agree = rows.reduce((t, r) => t + r.agree, 0);
    const total = rows.reduce((t, r) => t + r.total, 0);
    const worst = rows
      .filter((r) => r.diffs.length > 0)
      .flatMap((r) =>
        r.diffs
          .slice(0, 1)
          .map((d) => `${r.slug} ${d.at}\n  abcjs ${d.theirs}\n  ours  ${d.ours}`),
      )
      .slice(0, 3)
      .join("\n");
    expect(`${total - agree} differ\n${worst}`).toBe("0 differ\n");
  });
});
