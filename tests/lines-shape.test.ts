import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **THE SHAPE OF `tune.lines` — each staff's clef and how many voices it holds.**
 *
 * The `lines` oracle compares every character's element and span, and a voice array that
 * holds NOTHING maps no character — so ours published `[[d], []]` for a `%%score (T B)`
 * line abcjs publishes as `[[d]]`, and every gate was green. A host iterating `voices` sees
 * the difference. `corpus-lines-shape/golden.json` is abcjs 6.7.1's `parseOnly` over both
 * corpora (`scripts/harvest-abcjs-lines-shape.mjs`).
 */
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, "corpus-lines-shape", "golden.json"), "utf-8"),
) as Record<string, unknown[]>;

const dirs: Record<string, string> = {
  repo: join(import.meta.dirname, "corpus-abcjs", "fixtures"),
  sib: join(import.meta.dirname, "..", "..", "abcMusicKit", "Tools", "abcjs-debug", "fixtures"),
};

type Line = Record<string, unknown> & {
  staff?: { clef?: { type?: string }; voices?: unknown[] }[];
};
const shapeOf = (line: Line): unknown =>
  line.staff
    ? line.staff.map((st) => [st.clef?.type ?? null, (st.voices ?? []).length])
    : Object.keys(line)
        .filter((k) => k !== "vskip")
        .sort()
        .join("+");

it("every tune's lines have abcjs's shape", () => {
  const files = new Map<string, unknown[][]>();
  const off: string[] = [];
  for (const [key, want] of Object.entries(GOLDEN)) {
    const m = /^(repo|sib)\/(.*)-tune(\d+)$/.exec(key);
    if (m === null) continue;
    const [, label, base, tune] = m as unknown as [string, string, string, string];
    const file = `${label}/${base}`;
    if (!files.has(file)) {
      const abc = readFileSync(join(dirs[label] as string, `${base}.abc`), "utf-8");
      files.set(
        file,
        parseOnly(abc).map((t) => ((t.lines ?? []) as unknown as Line[]).map(shapeOf)),
      );
    }
    const got = files.get(file)?.[Number(tune)] ?? null;
    if (JSON.stringify(got) !== JSON.stringify(want)) off.push(key);
  }
  expect(off).toEqual([]);
});
