import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **MUSIC BEFORE THE FIRST `V:` IS THAT VOICE, AND A LATER `V:` CHANGES ITS CLEF FROM HERE.**
 *
 * abcjs gives the implicit voice no entry in `multilineVars.voices`, so the first body `V:`
 * naming a new id takes staff 0 / voice 0 — the implicit music's own slot — and its line
 * scan opens the next line (`abc_parse_key_voice.js:526-560`). Ours made a second voice
 * and drew `CDEF| / V:2 / GABc|` as two SIMULTANEOUS staves. The scan's "line full" is an
 * ELEMENT, not a closed measure, so `AB[V:1]cd` is two lines too.
 *
 * And `parseVoice` writes a `clef=` onto `staves[staffNum].clef` alone
 * (`abc_parse_key_voice.js:855-858`): the staff opens its next line in it, no cautionary
 * is appended to the line before, and no other staff shares it. Ours set the VOICE's clef,
 * which redrew every earlier line in the new one.
 *
 * `implicit-voice.json` is abcjs 6.7.1's page height and each line's staves — clef, and
 * the notes of every voice — read out of a WebKit page at `staffwidth: 670`.
 */
/** `paths` counts the drawing's `<path>`s — a cautionary clef is one of them. */
type Answer = { abc: string; height: string; paths: number; lines: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "implicit-voice.json"), "utf-8"),
) as Answer[];

type Line = {
  staff?: {
    clef?: { type?: string };
    voices?: { el_type: string; type?: string; pitches?: { name: string }[] }[][];
  }[];
};

const ours = (abc: string): Answer => {
  const t = renderAbc("*", abc, { staffwidth: 670 })[0] as unknown as {
    svg?: string;
    lines: Line[];
  };
  return {
    abc,
    height: /height="([\d.]+)"/.exec(t.svg ?? "")?.[1] ?? "",
    paths: (t.svg ?? "").split("<path").length - 1,
    lines: t.lines.map((l) =>
      (l.staff ?? [])
        .map(
          (st) =>
            `${st.clef?.type}[${(st.voices ?? [])
              .map((v) =>
                v
                  .filter((e) => e.el_type === "clef" || e.el_type === "note")
                  .map((e) => (e.el_type === "clef" ? `CLEF:${e.type}` : (e.pitches?.[0]?.name ?? "r")))
                  .join(" "),
              )
              .join(" / ")}]`,
        )
        .join(" "),
    ),
  };
};

describe("the implicit voice, and a V: that changes a clef", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
