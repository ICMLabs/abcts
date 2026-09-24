import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, synth } from "../src/compat/index.js";

/**
 * **AN INLINE `[M:]` BEFORE A LINE'S MUSIC, ONCE ANY `V:` EXISTS, IS THE STAFF'S NEXT
 * METER** — `multilineVars.staves[currentVoice.staffNum].meter` (`abc_parse_header.js:359`),
 * not an element. What becomes of it depends on who opens the line:
 * - a line the music opens lazily takes it at its head (`[V:1][M:3/4]GAB`);
 * - a line a `V:` FIELD already opened is reused, and the reuse takes it and throws it away,
 *   so `V:1` / `[M:3/4]GAB|` draws, publishes and plays no 3/4 anywhere;
 * - on the tune's first line the header `M:` is copied over every staff first and wins;
 * - `[M:3/4][M:2/4]` writes the slot twice and the line takes the last.
 * Ours appended every one as a cautionary on the line above, and played it.
 *
 * `inline-meter-line-start.json` is abcjs 6.7.1's `tune.lines` and MIDI file, read in WebKit.
 */
type Answer = { abc: string; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "inline-meter-line-start.json"), "utf-8"),
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

describe("an inline [M:] at a line's start", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => {
      expect(digest(a.abc)).toEqual(a.lines);
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi);
    });
});
