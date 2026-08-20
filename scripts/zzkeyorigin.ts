import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const r = parse(readFileSync(process.env["F"] as string, "utf-8")) as { scores?: unknown[] };
const score = r.scores?.[0] as {
  key: unknown;
  clef: unknown;
  voices: { id: string; clef: unknown; measures: { keyChange: unknown; keyChangeSourceRange: unknown; keyChangeInline?: boolean }[] }[];
};
console.log("score.key", JSON.stringify(score.key), "score.clef", JSON.stringify(score.clef));
for (const v of score.voices)
  console.log(
    v.id,
    "clef", JSON.stringify(v.clef),
    "m0.keyChange", JSON.stringify(v.measures[0]?.keyChange),
    "range", JSON.stringify(v.measures[0]?.keyChangeSourceRange),
    "inline", v.measures[0]?.keyChangeInline,
  );
