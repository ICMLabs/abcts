/** Every `%%MIDI` our parser attached to a measure — `F=<fixture> [T=<tune>]`. */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
const abc = readFileSync(process.env["F"] as string, "utf-8");
const p = parse(abc, { mode: "abcjs-strict" });
if (!p.ok) throw new Error("parse failed");
const score = p.scores[Number(process.env["T"] ?? 0)];
score?.voices.forEach((v, k) => {
  v.measures.forEach((m, i) => {
    if (m.midiCommands) console.log(`v${k} m${i}`, JSON.stringify(m.midiCommands));
  });
});
console.log("voices", score?.voices.length, "measures", score?.voices[0]?.measures.length);
