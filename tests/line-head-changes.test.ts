import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, renderAbc, synth } from "../src/compat/index.js";

/**
 * **A STANDALONE `K:` OR `M:` READ AFTER A `V:` SWITCH HAS OPENED ITS VOICE'S NEXT LINE.**
 *
 * The `V:` field runs `startNewLine` itself (`abc_parse_header.js:550-551`), so a `K:`
 * read after it lands at the HEAD of that empty line: the staff opens in the new clef or
 * key, no courtesy clef or key ends the line before, and a clef is still the tune's
 * running clef every undeclared staff follows. A `M:` is `multilineVars.meter`, which the
 * NEXT `startNewLine` copies to EVERY staff's slot and takes its own — each other staff
 * takes its copy at its own next line, and the line a `V:` already opened takes and
 * discards it (`abc_parse_music.js:985-998`). And with no header `M:` the tune's meter is
 * the FIRST staff meter in `lines`, which sets the MIDI time signature and the pickup
 * (`abc_tune.js:181-218`); the flattener read the header's.
 *
 * `line-head-changes.json` is abcjs 6.7.1's page height, path count, each line's staves
 * and its MIDI file, read out of a WebKit page at `staffwidth: 670`.
 */
type Answer = { abc: string; height: string; paths: number; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "line-head-changes.json"), "utf-8"),
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

describe("a K: or M: at the head of a line a V: opened", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
