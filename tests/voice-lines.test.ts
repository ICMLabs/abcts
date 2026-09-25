import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, synth } from "../src/compat/index.js";

/**
 * **TUNE LINE k HOLDS EVERY VOICE'S k-th SOURCE LINE.** The model shared one line structure
 * across voices, breaking all of them wherever any one broke; abcjs keeps each voice's own
 * (`setCurrentVoice` / `startNewLine`). `alignVoiceLines` regroups them and pads with
 * `lineAbsent` placeholders; a voice with no line on a system is off it, the first voice
 * present carries the endings and the carried bar number, `%%text` hangs off it, and MIDI
 * tracks are positions counted afresh per line, each keeping absolute time.
 *
 * `voice-lines.json` is abcjs 6.7.1's `tune.lines` digest and MIDI file, read in WebKit.
 */
type Answer = { abc: string; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "voice-lines.json"), "utf-8"),
) as Answer[];

type El = { el_type: string; value?: unknown; pitches?: { name: string }[] };
type Staff = { meter?: { value?: unknown; type?: string }; voices: El[][] };
type Line = { staff?: Staff[] };
const digest = (abc: string): string[] =>
  (parseOnly(abc)[0] as unknown as { lines: Line[] }).lines.map((l) =>
    l.staff === undefined
      ? "TEXT"
      : l.staff
      .map(
        (st) =>
          `m${st.meter ? JSON.stringify(st.meter.value ?? st.meter.type) : "-"} ` +
          st.voices
            .map((v) =>
              v
                .map((e) =>
                  e.el_type === "note"
                    ? (e.pitches?.[0]?.name ?? "z")
                    : e.el_type === "bar"
                      ? "|"
                      : e.el_type === "timeSignature"
                        ? `M${JSON.stringify(e.value)}`
                        : e.el_type.toUpperCase(),
                )
                .join(" "),
            )
            .join(" / "),
      )
      .join(" // "),
  );

describe("each voice keeps its own source lines", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => {
      expect(digest(a.abc)).toEqual(a.lines);
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi);
    });
});
