/**
 * Every `deline` row that differs for one case, abcjs's above ours.
 *
 *   F=<fixture path> T=<tune index> [BREAKS=1] npx tsx scripts/zzdel.ts
 *   SLUG=sib/two-voice-invention-tune0 npx tsx scripts/zzdel.ts   (reads the golden's key)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderAbc } from "../src/compat/index.js";
import type { AbcLine } from "../src/compat/lines.js";

const root = join(import.meta.dirname, "..");
const GOLDEN = JSON.parse(
  readFileSync(join(root, "tests", "corpus-deline", "golden.json"), "utf-8"),
) as Record<string, string[]>;

const rowsOfLine = (line: AbcLine, i: number): string[] => {
  const l = line as AbcLine & {
    text?: unknown;
    separator?: unknown;
    vskip?: unknown;
  };
  if (l.staff === undefined) {
    const kind =
      l.subtitle !== undefined
        ? "subtitle"
        : l.text !== undefined
          ? "text"
          : l.separator !== undefined
            ? "separator"
            : l.vskip !== undefined
              ? "vskip"
              : Object.keys(l).join("+");
    return [`L${i} ${kind}`];
  }
  const out: string[] = [];
  l.staff.forEach((staff, s) => {
    const st = staff as unknown as { [k: string]: unknown };
    const kept = ["meter", "key", "clef"].filter((k) => st[k] !== undefined);
    out.push(`L${i} s${s} kept=${kept.join(",")}`);
    staff.voices.forEach((voice, v) => {
      out.push(
        `L${i} s${s} v${v} ${voice
          .map((e) => `${e.el_type}@${e.startChar}..${e.endChar}`)
          .join(" ")}`,
      );
    });
  });
  return out;
};

const slug = process.env["SLUG"] ?? "";
const breaks = slug.endsWith("#breaks") || process.env["BREAKS"] === "1";
const bare = breaks && slug.endsWith("#breaks") ? slug.slice(0, -7) : slug;
const corpus = bare.slice(0, bare.indexOf("/"));
const rest = bare.slice(bare.indexOf("/") + 1);
const at = rest.lastIndexOf("-tune");
const index = Number(rest.slice(at + 5));
const dir =
  corpus === "sib"
    ? join(root, "..", "abcMusicKit", "Tools", "abcjs-debug", "fixtures")
    : join(root, "tests", "corpus-abcjs", "fixtures");
const abc = readFileSync(join(dir, `${rest.slice(0, at)}.abc`), "utf-8");
const slots: string[] = [];
for (let k = 0; k <= index; k++) slots.push("*");
const tune = renderAbc(slots, abc, {})[index];
const got = tune?.deline(breaks ? { lineBreaks: true } : {}).flatMap(rowsOfLine) ?? [];
const want = GOLDEN[slug] ?? [];

for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
  if (want[i] === got[i]) continue;
  console.log(`row ${i}`);
  console.log(`  abcjs ${want[i] ?? "<none>"}`);
  console.log(`  ours  ${got[i] ?? "<none>"}`);
}
console.log(`${want.length} abcjs rows, ${got.length} ours`);
