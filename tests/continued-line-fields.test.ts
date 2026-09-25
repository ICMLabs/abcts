import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, synth } from "../src/compat/index.js";

/**
 * **A LINE THAT CONTINUES THE ONE ABOVE STILL STARTS FOR ITS INLINE FIELDS.** abcjs's
 * `startLine` is the line's own `start_new_line`, true after a `\` as well; only the
 * `startNewLine` it gates asks `!this.lineContinuation`. So at such a line's start an `[M:]`
 * (once a `V:` exists) parks on the staff, and a `[P:]` or `[Q:]` is held for the NEXT line
 * that opens — `partForNextLine` / `tempoForNextLine`. Ours attached all three to the
 * continued line.
 *
 * `continued-line-fields.json` is abcjs 6.7.1's `tune.lines` and MIDI file, read in WebKit.
 */
type Answer = { abc: string; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "continued-line-fields.json"), "utf-8"),
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

describe("inline fields at a continued line's start", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => {
      expect(digest(a.abc)).toEqual(a.lines);
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi);
    });
});
