import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **A `%%voicecolor` AFTER THE MUSIC BEGAN IS AN ELEMENT OF THE STREAM.** abcjs's
 * `changeVoiceColor` appends a `color` element where the directive stands
 * (`tune-builder.js:332-334`), and only lines opened AFTER it carry the colour at their
 * head. Ours put the voice's last colour on every line's head and appended nothing.
 * A `%%MIDI` beside it now sorts by where IT was written too, so the two keep their order.
 *
 * `voicecolor-stream.json` is abcjs 6.7.1's element types per line, read in WebKit.
 */
type Answer = { abc: string; lines: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "voicecolor-stream.json"), "utf-8"),
) as Answer[];

type El = { el_type: string; color?: string; pitches?: { name: string }[] };
const digest = (abc: string): string[] =>
  (
    parseOnly(abc)[0] as unknown as { lines: { staff: { voices: El[][] }[] }[] }
  ).lines.map((l) =>
    l.staff
      .map((st) =>
        st.voices
          .map((v) =>
            v
              .map((e) =>
                e.el_type === "note"
                  ? (e.pitches?.[0]?.name ?? "z")
                  : e.el_type === "bar"
                    ? "|"
                    : e.el_type === "color"
                      ? `COLOR:${e.color}`
                      : e.el_type.toUpperCase(),
              )
              .join(" "),
          )
          .join(" / "),
      )
      .join(" // "),
  );

describe("%%voicecolor in tune.lines", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => expect(digest(a.abc)).toEqual(a.lines));
});
