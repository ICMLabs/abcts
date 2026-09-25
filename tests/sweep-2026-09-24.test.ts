import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, synth } from "../src/compat/index.js";

/**
 * **THE FOURTH LEDGER SWEEP, 2026-09-24** — 61 control tunes over `[K:]` and `[L:]` in odd
 * positions, `%%continueall`, mid-tune `%%MIDI`, and inline fields. Each was a divergence
 * or a control for one; all now agree with abcjs on `tune.lines` and the MIDI file:
 * - `%%continueall` was never read (the flag existed, the directive warned "Unknown");
 * - an inline `[K:]` after a voice switch is the new line's key, not a cautionary;
 * - `K:none` cancels nothing; a mid-measure `[K:]` sounds from where it is written, and one
 *   after the last note is drawn and carries on;
 * - a mid-tune `%%MIDI program` changes the track, at the position it is written, and an
 *   inline `[I:MIDI …]` before the first note is a tune setting.
 *
 * `sweep-2026-09-24.json` is abcjs 6.7.1's `tune.lines` digest and MIDI file, read in WebKit.
 */
type Answer = { abc: string; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "sweep-2026-09-24.json"), "utf-8"),
) as Answer[];

type El = { el_type: string; value?: unknown; pitches?: { name: string }[] };
type Staff = { meter?: { value?: unknown; type?: string }; voices: El[][] };
const digest = (abc: string): string[] =>
  (parseOnly(abc)[0] as unknown as { lines: { staff: Staff[] }[] }).lines.map((l) =>
    l.staff
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

describe("the fourth ledger sweep", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => {
      expect(digest(a.abc)).toEqual(a.lines);
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi);
    });
});
