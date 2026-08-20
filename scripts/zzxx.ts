/**
 * The METRICS layout's cursor, element by element — abcjs's `getMeasureWidths` runs the
 * solve at width 0, which no ordinary render reproduces.
 *
 *   ABCTS_XX=1 F=<fixture path> npx tsx scripts/zzxx.ts
 *
 * Prints `v`, the item index, the placed `x`, and the voice's `minx`/`nextx`/`rod`/`width`
 * — the four quantities `layoutOneItem` spends. Pair with abcjs's own by instrumenting
 * `write/layout/voice-elements.js`.
 */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";
import { layout } from "../src/renderer/layout.js";
const abc = readFileSync(process.env["F"]!, "utf-8");
const r: any = (parse as any)(abc);
const score: any = r.scores ? r.scores[0] : (r.score ?? r[0]);
layout({ ...score, staffWidth: null, maxStaves: null }, { mode: "abcjs-strict", systemWidth: 30 } as any);
