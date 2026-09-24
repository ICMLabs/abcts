import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, renderAbc, synth } from "../src/compat/index.js";

/**
 * **A HELD BARLINE WITH A CHANGE ON BOTH SIDES IS ITS OWN MEASURE.** abcjs's stream is flat:
 * `[K:G]|:[K:D]CDEF|` opens the line in G, then the `|:`, then a `key` D after it. Ours
 * merged the two sides into one measure, so the later change won — the G was never drawn —
 * and a different field after the barline was drawn before it. See
 * `VoiceBuilder.flushClashingOpening`.
 *
 * And two it surfaced: an inline `[K: clef=]` after a line's opening `|:` leads the
 * MEASURE's notes though not the line's prefix (ours drew them in the old clef, 46.5px
 * low), and an inline `[K:G]` before any music is the first staff's key and so the MIDI
 * file's (ours wrote the header's).
 *
 * `held-barline-changes.json` is abcjs 6.7.1's page height, path count and each line's
 * staves, read out of a WebKit page at `staffwidth: 670`.
 */
type Answer = { abc: string; height: string; paths: number; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "held-barline-changes.json"), "utf-8"),
) as Answer[];

type El = { el_type: string; pitches?: { name: string }[] };
type Staff = {
  clef?: { type?: string };
  key?: { accidentals?: unknown[] };
  meter?: { type?: string; value?: { num: string }[] };
  voices?: El[][];
};

const ours = (abc: string): Answer => {
  const t = renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as { svg?: string };
  const lines = (parseOnly(abc)[0] as unknown as { lines: { staff?: Staff[] }[] }).lines.map(
    (l) =>
      (l.staff ?? [])
        .map(
          (st) =>
            `${st.clef?.type}:k=${(st.key?.accidentals ?? []).length}${
              st.meter ? `,m=${st.meter.value?.[0]?.num ?? st.meter.type}` : ""
            }[${(st.voices ?? [])
              .map((v) =>
                v
                  .filter((e) => e.el_type !== "stem")
                  .map((e) =>
                    e.el_type === "note"
                      ? (e.pitches?.[0]?.name ?? "r")
                      : e.el_type === "bar"
                        ? "|"
                        : e.el_type.toUpperCase(),
                  )
                  .join(" "),
              )
              .join(" / ")}]`,
        )
        .join(" "),
  );
  return {
    abc,
    height: /height="([\d.]+)"/.exec(t.svg ?? "")?.[1] ?? "",
    paths: (t.svg ?? "").split("<path").length - 1,
    lines,
    midi: String(synth.getMidiFile(abc, { midiOutputType: "encoded" })),
  };
};

describe("a change on both sides of a held barline", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
