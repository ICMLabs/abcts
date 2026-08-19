/** Our `tune.warnings` beside abcjs's, for one golden key — `K=<slug>` */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOnly } from "../src/compat/index.js";
const root = join(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf8")) as { corpus: string };
const key = process.env.K ?? "";
const [corpus = "", rest = ""] = key.split("/");
const file = rest.substring(0, rest.lastIndexOf("-tune"));
const index = Number(rest.substring(rest.lastIndexOf("-tune") + 5));
const dir = corpus === "repo" ? join(root, "tests", "corpus-abcjs", "fixtures") : join(root, config.corpus);
const abc = readFileSync(join(dir, `${file}.abc`), "utf8");
const ours = ((parseOnly(abc)[index] as unknown as { warnings?: string[] })?.warnings ?? []);
const golden = (JSON.parse(readFileSync(join(root, "tests", "corpus-warnings", "golden.json"), "utf8")) as Record<string, string[] | null>)[key] ?? [];
console.log("ours", ours.length, "abcjs", golden.length);
const strip = (s: string): string => s.replace(/<[^>]*>/g, "|");
for (let i = 0; i < Math.max(ours.length, golden.length); i += 1)
  if (ours[i] !== golden[i]) {
    console.log(`first diff at ${i}`);
    console.log("  abcjs", strip(golden[i] ?? "").slice(0, 140));
    console.log("  ours ", strip(ours[i] ?? "").slice(0, 140));
    break;
  }
