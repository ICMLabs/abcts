/**
 * **THE EXTENDED-MODE RATCHET — the only gate that watches the NON-STRICT path.**
 *
 * ── WHY IT HAD TO EXIST BEFORE ANY OF `ABCJS-DEBT.md` §3b COULD LAND ─────────
 * Measured 2026-09-03: **three test files in this repo reference a non-strict mode at all**
 * (`lyric-continuation`, `optimize-svg`, `renderer/layout`). Every corpus gate — `svg-bytes`
 * over 685, `svg-bytes-sibling` over 356, `zzlive`, all four `zzcontrol` ladders, the pixel
 * and harvested tables — renders **strict**. So `extended` was, in the aggregate, unproven
 * when written and unprotected afterwards: a change could move every page in it and no
 * number in this repo would move.
 *
 * That is exactly the shape the strict arc kept being bitten by and kept writing down — **a
 * comparison can only catch what its representation can express**, and no representation
 * here covered this mode at all.
 *
 * ── WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────
 * **NOT "matches abcjs".** That is the wrong question for `extended`, which exists to be
 * right where abcjs is wrong; a gate asking it would go red on every improvement and be
 * deleted within a week. This asserts **"has not changed since recorded"** — the same thing
 * `npm run baseline` asserts for geometry and `ExtendedModeSnapshotTests` asserts in
 * abcMusicKit, and the same job `svg-bytes`'s `PASSING` list does for strict.
 *
 * So a red row here is never automatically a defect. It is a CHANGE, and the commit that
 * causes it must say why — a new behaviour only ADDS rows, and a REMOVAL means something
 * broke. Read the diff; do not re-record it to make a run pass.
 *
 * ── RE-RECORDING ─────────────────────────────────────────────────────────────
 *     ABCTS_SNAPSHOT_RECORD=1 npx vitest run tests/extended-snapshot.test.ts
 *
 * ⚠️ The variable must come BEFORE the command and not after a `cd` — written the other way
 * round it applies to the `cd` alone, the suite runs in verify mode, passes or fails as
 * usual, and records nothing. That has cost a sibling repo a session.
 *
 * Commit the updated `extended.sha256` **with** the code change, never separately.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";
import { render } from "../src/renderer/index.js";

const fixtures = join(import.meta.dirname, "corpus-abcjs", "fixtures");
const goldens = join(import.meta.dirname, "corpus-abcjs", "golden");
const snapshot = join(import.meta.dirname, "corpus-abcjs", "extended.sha256");

interface Case {
  readonly slug: string;
  readonly abc: string;
  readonly tune: number;
}

/**
 * The SAME enumeration `svg-bytes` uses, and for the reason recorded there: a multi-tune
 * fixture's goldens are `<slug>-tune0.svg`, `-tune1.svg`, … and reading `<slug>.svg` alone
 * silently skipped twelve fixtures and 89 tunes for months. **A GATE'S REACH IS A PROPERTY
 * OF ITS ENUMERATION, NOT OF ITS COMPARISON.** The goldens are consulted only to learn how
 * many tunes a fixture has — nothing here compares against them.
 */
const CASES: Case[] = readdirSync(fixtures)
  .filter((f) => f.endsWith(".abc"))
  .sort()
  .flatMap((f) => {
    const slug = f.replace(/\.abc$/, "");
    const abc = readFileSync(join(fixtures, f), "utf-8");
    if (existsSync(join(goldens, `${slug}.svg`))) return [{ slug, abc, tune: 0 }];
    const rows: Case[] = [];
    for (let i = 0; existsSync(join(goldens, `${slug}-tune${i}.svg`)); i += 1)
      rows.push({ slug: `${slug}-tune${i}`, abc, tune: i });
    return rows;
  });

/**
 * ⚠️ **THE COMPAT LAYER CANNOT REACH THIS MODE, AND THE TYPECHECKER IS WHAT SAID SO.**
 * `renderAbc` hard-wires `mode: "abcjs-strict"` (`compat/index.ts:869`, `:999`) because a
 * drop-in whose default output differs from what it replaces is not one, and `AbcjsParams`
 * has no `mode` at all. A first cut of this file passed `{ mode: "abcjs-extended" }` there, and it
 * was silently ignored: **the snapshot it recorded was 691 STRICT renders**, which would
 * have been a gate that reads green while watching the wrong mode — the exact failure
 * `pixel-parity`'s enumeration and `compat`'s density test each shipped once.
 *
 * `npx tsc --noEmit` caught it in one line. Run it BEFORE the test, not alongside.
 *
 * So this goes through the CORE path, which is where the modes live: `parse(abc, {mode})`
 * then `render(score, {mode})`, exactly as `lyric-continuation` does.
 *
 * `systemWidth: 670` is the goldens' own staff width — the core spelling of compat's
 * `staffwidth`. Every gate that opens a golden passes it explicitly, because abcjs's own
 * default is 740 on screen and gates that omitted it agreed only while OUR default was
 * wrong (`CHECKPOINT-2026-08-17.md` §4). Nothing here reads a golden, but the width is
 * pinned so the snapshot cannot move with a future change to the default.
 */
const renderCase = (c: Case): string => {
  try {
    const parsed = parse(c.abc, { mode: "abcjs-extended" });
    if (!parsed.ok) return `PARSE FAILED: ${parsed.errors.length} error(s)`;
    const score = parsed.scores[c.tune];
    if (score === undefined) return "NO SCORE";
    return render(score, { mode: "abcjs-extended", systemWidth: 670 });
  } catch (e) {
    return `THREW: ${e instanceof Error ? e.message : String(e)}`;
  }
};

const digest = (s: string): string =>
  createHash("sha256").update(s, "utf-8").digest("hex").slice(0, 16);

const readSnapshot = (): Map<string, string> => {
  if (!existsSync(snapshot)) return new Map();
  return new Map(
    readFileSync(snapshot, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"))
      .map((l) => {
        const [hash, ...rest] = l.split("  ");
        return [rest.join("  "), hash ?? ""] as const;
      }),
  );
};

describe("extended mode, against its own recorded output", () => {
  /**
   * ⚠️ **A SNAPSHOT OF ERROR STRINGS IS A GREEN GATE OVER BROKEN OUTPUT.** `renderCase`
   * returns `THREW: …` / `PARSE FAILED` / `NO SCORE` rather than throwing, so one case
   * blowing up cannot take the whole table down — and that same helpfulness would let a
   * failure be RECORDED and then agree with itself forever. This is checked separately
   * from the digests so the ratchet can never be the thing that hides it.
   */
  it("renders every case — no failure is recorded as a digest", () => {
    const broken = CASES.map((c) => [c.slug, renderCase(c)] as const)
      .filter(([, svg]) => !svg.startsWith("<svg"))
      .map(([slug, svg]) => `${slug}: ${svg.slice(0, 60)}`);
    expect(broken).toEqual([]);
  });

  it("has not changed since recorded", () => {
    const now = new Map(CASES.map((c) => [c.slug, digest(renderCase(c))] as const));

    if (process.env.ABCTS_SNAPSHOT_RECORD === "1") {
      const body = [
        "# extended-mode output digests — see tests/extended-snapshot.test.ts.",
        "# NOT a comparison against abcjs: extended exists to be right where abcjs is wrong.",
        "# Re-record with ABCTS_SNAPSHOT_RECORD=1 and commit WITH the code change.",
        ...[...now].map(([slug, hash]) => `${hash}  ${slug}`),
      ].join("\n");
      writeFileSync(snapshot, `${body}\n`);
      return;
    }

    const was = readSnapshot();
    expect(
      was.size,
      "no extended.sha256 — record one with ABCTS_SNAPSHOT_RECORD=1",
    ).toBeGreaterThan(0);

    // Reported as three LISTS rather than a count, because the shape of the diff is the
    // finding: a new behaviour only ADDS, a reorder is a pure permutation, and REMOVALS in
    // either case mean something broke. `svg-bytes`'s baselines learned this the hard way.
    const changed = [...now].filter(([s, h]) => was.has(s) && was.get(s) !== h).map(([s]) => s);
    const added = [...now].filter(([s]) => !was.has(s)).map(([s]) => s);
    const removed = [...was].filter(([s]) => !now.has(s)).map(([s]) => s);

    expect(
      { changed, added, removed },
      "extended output moved — READ the diff and say why in the commit, or revert",
    ).toEqual({ changed: [], added: [], removed: [] });
  });

  /**
   * **A TUNE RENDERS THE SAME WHEREVER IT SITS IN A BOOK.** This is the property abcjs
   * CANNOT satisfy — its `sizeCache` is module-global and x-free (`write/svg.js:306`,
   * `:316`), so its output for a tune depends on what was rendered before it — and the one
   * `extended` exists to give back. See `ABCJS-DEBT.md` §3b.1.
   *
   * It passes today for the reason that makes it worth keeping rather than the reason it
   * was written: headless renders take the golden TABLES, which carry no cache at all. It
   * is the browser path that has one, so this is the invariant a live measurer must not
   * break, asserted where it can be asserted cheaply.
   */
  it("renders a tune the same alone as after forty others", () => {
    const target = CASES.find((c) => c.slug.includes("selection-01")) ?? CASES[0];
    if (target === undefined) return;
    const alone = renderCase(target);
    for (const c of CASES.slice(0, 40)) renderCase(c);
    expect(renderCase(target)).toBe(alone);
  });
});
