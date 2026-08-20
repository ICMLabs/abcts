/**
 * `setGlyph`'s six renders, ours against abcjs's golden markup, one at a time.
 *
 *   [KEY=abcjs-visual-layout-04-score-s-a#wide] npx tsx scripts/zzsg.ts
 *
 * Writes `/tmp/gp/sg-ours.svg` and `/tmp/gp/sg-abcjs.svg` and prints the first differing
 * byte with 90 characters of context either side. The oracle is
 * `tests/corpus-set-glyph/golden.json`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGlyph } from "../src/compat/index.js";
import { clearGlyphOverrides } from "../src/renderer/set-glyph.js";
import { renderAll } from "../tests/render-all.js";
const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, "..", "tests", "corpus-set-glyph", "golden.json"), "utf-8")) as Record<string, string>;
const key = process.env["KEY"] ?? "abcjs-visual-layout-04-score-s-a#wide";
const [file = "", label = ""] = key.split("#");
clearGlyphOverrides();
if (label === "wide") setGlyph("noteheads.quarter", { d: [["M",0,-3],["l",18,0],["l",0,6],["l",-18,0],["z"]] as any, w: 18, h: 6 });
else setGlyph("noteheads.quarter", { d: [["M",0,-1.5],["l",4,0],["l",0,3],["l",-4,0],["z"]] as any, w: 4, h: 3 });
const got = renderAll(readFileSync(join(import.meta.dirname, "..", "tests", "corpus-abcjs", "fixtures", `${file}.abc`), "utf-8"), { staffwidth: 670 })[0]?.svg ?? "";
const want = GOLDEN[key] ?? "";
writeFileSync("/tmp/gp/sg-ours.svg", got); writeFileSync("/tmp/gp/sg-abcjs.svg", want);
let at = -1;
for (let i = 0; i < Math.max(got.length, want.length); i++) if (got[i] !== want[i]) { at = i; break; }
console.log("first diff", at, "lenOurs", got.length, "lenAbcjs", want.length);
if (at >= 0) { console.log("abcjs", JSON.stringify(want.slice(at - 90, at + 60))); console.log("ours ", JSON.stringify(got.slice(at - 90, at + 60))); }
