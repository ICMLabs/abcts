/** The parsed key of one file — `F=<path>` or `ABC=<text>` */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = process.env.ABC ?? readFileSync(process.env.F ?? "", "utf8");
const score = parse(abc, { mode: "abcjs-strict" }).scores[0]!;
console.log("score.key", JSON.stringify(score.key));
