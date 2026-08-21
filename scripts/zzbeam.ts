import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOnly } from "../src/compat/index.js";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf-8"));
const require = createRequire(join(root, config.goldens, "..", "package.json"));
const ABCJS = require(join(root, config.abcjsRef, "index"));
const rungs = [
  "C/D/ E/F/|",       // plain space: the run must break
  "C/D/- E/F/|",      // a TIE before the space
  "C/D/ - E/F/|",     // a tie AFTER the space
  "[CE]/[DF]/- [CE]/[DF]/|", // the ragtime shape: a tied CHORD
  "C/D/-E/F/|",       // a tie and no space at all
  "[CE]/[DF]/ [CE]/[DF]/|",  // a chord and a space, NO tie
  "C/[DF]/ E/F/|",           // the space follows a CHORD
  "[CE]/D/ E/F/|",           // the space follows a NOTE, chord earlier in the run
  "[CE] [DF] [CE] [DF]|",    // chords with NO duration, spaced
  "[CE] D/ E/F/|",           // a duration-less chord, then a spaced note
  "[CE][DF] [CE][DF]|",      // duration-less chords, NO space between the pair
];
// **BOTH NOTE LENGTHS, BECAUSE THE ANSWER DEPENDS ON THEM.** A chord's `addEndBeam` tests
// its FIRST NOTE's duration, not the chord's, so `[CE]/[DF]/- …` is one beam at `L:1/4` and
// two at `L:1/8`. Running one length only is what hid the rule twice.
for (const L of ["1/4", "1/8"]) for (const music of rungs) {
  const abc = `X:1\nL:${L}\nM:4/4\nK:C\n${music}\n`;
  const show = (t: any): string =>
    (t.lines?.[0]?.staff?.[0]?.voices?.[0] ?? [])
      .map((e: any) => `${e.el_type === "bar" ? "|" : (e.pitches?.map((p: any) => p.name).join("") ?? "?")}${e.startBeam ? "[" : ""}${e.endBeam ? "]" : ""}`)
      .join(" ");
  const theirs = show(ABCJS.parseOnly(abc)[0]);
  const mine = show((parseOnly(abc) as any)[0]);
  console.log(
    `${theirs === mine ? "ok  " : "DIFF"} L:${L} ${music.padEnd(28)} abcjs ${theirs.padEnd(30)} ours ${mine}`,
  );
}
