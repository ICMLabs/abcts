/**
 * **A MELISMA BELONGS TO THE VERSE THAT HOLDS IT, NOT TO THE FIRST ONE.**
 *
 * abcjs builds one string per note out of EVERY verse's own syllable and divider —
 * `elem.lyric.forEach(ly => lyricStr += ly.syllable + div + "\n")`
 * (`write/creation/abstract-engraver.js:769-774`) — so `w:a_ b c d` over `w:e_ f g h`
 * prints `a_` on the first row and `e_` on the second. Ours tracked the flag for verse 1
 * alone and drew `e`, which `scripts/zzledger.mjs` measured as a strict-mode byte
 * divergence on 2026-09-08 (marker `lines.ts:1077`).
 *
 * The three layers the fix crosses are the three this file asserts: the parse flag, the
 * compat element's `divider`, and the drawn text — with the extended-mode row as the
 * negative control, since a change that printed the underscore unconditionally would pass
 * every positive row here.
 */
import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";
import { type Score, defaultMode } from "../src/core/model.js";
import { parse } from "../src/parser/parser.js";
import { layout } from "../src/renderer/layout.js";

const ABC = "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\nw:a_ b c d\nw:e_ f g h\n";

const notesOf = (mode = defaultMode) => {
  const score = parse(ABC, { mode }).scores[0];
  if (score === undefined) throw new Error("fixture did not parse");
  return score.voices.flatMap((v) => v.measures.flatMap((m) => m.events));
};

/** Every string the staff draws, the stacked verses of one `<text>` included. */
const drawnOf = (mode: "abcjs-strict" | "abcjs-extended") => {
  const score = parse(ABC, { mode }).scores[0] as Score;
  const staff = layout(score, { mode, systemWidth: 400 }).systems[0]?.staves[0];
  return (staff?.elements ?? [])
    .flatMap((e) => e.texts)
    .flatMap((t) => [t.text, ...(t.extraLines ?? [])]);
};

describe("a melisma in a later verse", () => {
  it("sets the hold flag on the verse that wrote it, and on no other note", () => {
    const first = notesOf()[0];
    expect(first?.type === "note" ? first.lyricMelismaStart : null).toBe(true);
    expect(first?.type === "note" ? first.extraVerseMelismaStarts : null).toEqual([true]);
    // The note the run holds OVER carries the hold, never the start.
    const second = notesOf()[1];
    expect(second?.type === "note" ? second.extraVerseMelismaStarts : null).toEqual([false]);
  });

  it("gives each verse its own divider in the compat element", () => {
    const tune = parseOnly(ABC)[0];
    const element = tune?.lines[0]?.staff?.[0]?.voices?.[0]?.[0];
    expect(element?.lyric).toEqual([
      { syllable: "a", divider: "_" },
      { syllable: "e", divider: "_" },
    ]);
  });

  it("prints abcjs's literal underscore on verse 2 in strict mode", () => {
    expect(drawnOf("abcjs-strict")).toContain("a_");
    expect(drawnOf("abcjs-strict")).toContain("e_");
  });

  it("suppresses it in extended mode, as it does for verse 1", () => {
    // The negative control: extended strokes an extender for verse 1 and prints no
    // literal, and the later verses follow the same gate rather than a second rule.
    expect(drawnOf("abcjs-extended")).not.toContain("a_");
    expect(drawnOf("abcjs-extended")).not.toContain("e_");
  });
});
