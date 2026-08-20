/**
 * Harvest abcjs's `CreateSynth` — THE ONE THAT MAKES THE SOUND — by RUNNING abcjs 6.7.0
 * with its three host objects replaced by recorders.
 *
 * ── WHY THERE IS NO AUDIO HERE AND NOTHING IS LOST ──────────────────────────
 * `CreateSynth` computes no waveform. It fetches one mp3 per instrument and pitch, renders
 * each UNIQUE sound once in an `OfflineAudioContext`, and copies the result into an output
 * buffer at every start time that sound has. So the whole class is a scheduler, and
 * `tests/audio-recorder.ts` — installed by both sides — records every scheduling decision:
 * which note was requested, how long each offline render was, what gain and pan and
 * playback rate it was given, where each copy landed, and what the output buffer holds.
 *
 * ⚠️ **THE HARVESTER IS `.ts` RATHER THAN `.mjs`, ON PURPOSE.** The recorder is one file
 * imported by both sides rather than a block duplicated into each, because a recorder that
 * drifted would compare two different experiments. Run it through `tsx`:
 *
 *   npx tsx scripts/harvest-abcjs-create-synth.ts
 *
 * ── NO DOM ──────────────────────────────────────────────────────────────────
 * Nothing here renders: `parseOnly` is enough for `setUpAudio`, and the only two things
 * that read `window` are `place-note.js` (`window.OfflineAudioContext`) and
 * `download-buffer.js` (`window.URL.createObjectURL`), so `window` is a two-property
 * object rather than a jsdom page.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { installRecorder } from "../tests/audio-recorder.js";
import {
  CASES,
  drive,
  driveErrors,
  drivePlayEvent,
  ERROR_CASES,
  FIXTURES,
  PLAY_EVENT_CASES,
  type PlayEvent,
} from "../tests/create-synth-script.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "abcts.config.json"), "utf-8")) as {
  abcjsRef: string;
  goldens: string;
};
const abcjsPath = join(root, config.abcjsRef);
const require = createRequire(join(root, config.goldens, "..", "package.json"));

const win: Record<string, unknown> = { URL: { createObjectURL: (): string => "" } };
(globalThis as Record<string, unknown>)["window"] = win;
const recorder = installRecorder(win);

const ABCJS = require(join(abcjsPath, "index")) as {
  parseOnly: (abc: string) => unknown[];
  synth: {
    registerAudioContext: (ac: unknown) => unknown;
    CreateSynth: new () => Record<string, (...args: never[]) => unknown>;
    playEvent: PlayEvent;
  };
};
ABCJS.synth.registerAudioContext(recorder.ac);

const dir = join(root, "tests", "corpus-abcjs", "fixtures");
const out: Record<string, unknown> = {};
for (const fixture of FIXTURES) {
  const abc = readFileSync(join(dir, `${fixture}.abc`), "utf-8");
  const tune = ABCJS.parseOnly(abc)[0];
  for (const [label, params] of CASES) {
    out[`${fixture}#${label}`] = await drive(
      () => new ABCJS.synth.CreateSynth() as never,
      tune as never,
      params,
      recorder,
    );
  }
}

for (const [label, params] of PLAY_EVENT_CASES)
  out[`playEvent#${label}`] = await drivePlayEvent(ABCJS.synth.playEvent, params, recorder);

/**
 * ⚠️ **`soundsCache` IS NOT PUBLIC IN abcjs, AND THE ERROR ARMS CANNOT BE GATED WITHOUT
 * IT** — a note that 404s stays rejected in there for the life of the page, so every case
 * after the first would be reading someone else's failure. It is a module of its own
 * (`src/synth/sounds-cache.js`), so it is requireable even though `index.js` does not
 * re-export it. Ours exports it from `compat`, which is a surface ADDITION and deliberate:
 * a host that wants a second chance at a failed soundfont has no other way in.
 */
const abcjsCache = require(join(abcjsPath, "src/synth/sounds-cache")) as Record<
  string,
  unknown
>;
const clearAbcjsCache = (): void => {
  for (const key of Object.keys(abcjsCache)) delete abcjsCache[key];
};
for (const [label, spec] of ERROR_CASES)
  out[`error#${label}`] = await driveErrors(
    () => new ABCJS.synth.CreateSynth() as never,
    (abc: string) => ABCJS.parseOnly(abc)[0],
    spec,
    recorder,
    clearAbcjsCache,
  );

const outDir = join(root, "tests", "corpus-create-synth");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "golden.json"), `${JSON.stringify(out, null, 1)}\n`);
const steps = Object.values(out).reduce((n, v) => n + (v as unknown[]).length, 0);
console.log(`${Object.keys(out).length} cases, ${steps} steps`);
