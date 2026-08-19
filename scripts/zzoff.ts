/** Where each tune starts — `F=<path>` */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env.F ?? "", "utf8");
parse(abc, { mode: "abcjs-strict" }).scores.forEach((s, i) =>
  console.log("tune", i, "sourceStartOffset", s.sourceStartOffset, JSON.stringify(abc.slice(s.sourceStartOffset, s.sourceStartOffset + 20))),
);
