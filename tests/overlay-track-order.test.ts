import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { synth } from "../src/compat/index.js";

/**
 * **AN OVERLAY'S TRACK FOLLOWS ITS OWN STAFF, NOT EVERY VOICE.** abcjs appends the overlay
 * voice to its staff (`staff.voices.push(ov.voice)`), so the MIDI file is staff-major:
 * `%%score 1 2` with `G4&EFGA` on V:1 is V:1, V:1&, V:2. Ours put every overlay after every
 * main voice — a `ponytail:` that predicted exactly this and was never written as a control.
 *
 * `overlay-track-order.json` is abcjs 6.7.1's MIDI file, read in WebKit.
 */
type Answer = { abc: string; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "overlay-track-order.json"), "utf-8"),
) as Answer[];

describe("overlay track order", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () =>
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi),
    );
});
