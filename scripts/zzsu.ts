import { readFileSync } from "node:fs";
import { parseOnly } from "../src/compat/index.js";
const abc = readFileSync(process.env["F"] as string, "utf-8");
const tune = parseOnly(abc)[0];
const flat = (tune as never as { setUpAudio: (o: unknown) => { tracks: unknown[][]; totalDuration: number; tempo: number } }).setUpAudio({});
console.log(JSON.stringify(flat.tracks.map((t) => t.slice(0, 3)), null, 1));
console.log("totalDuration", flat.totalDuration, "tempo", flat.tempo);
