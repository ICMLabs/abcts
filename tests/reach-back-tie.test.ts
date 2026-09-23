import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";
import type { AbcLine } from "../src/compat/lines.js";

/**
 * **`addTieToLastNote` — THE WHOLE OF IT, AND IT IS FOUR RULES** (`tune-builder.js:162-172`
 * with `getLastNote` at `:859-872`). A `-` standing at the head of a token — after a
 * barline, after a space, or at the start of a line — reaches BACK for the note before it,
 * and that reach is not the mirror of a `-` written after a note:
 *
 *   1. it sets `el.pitches[0].startTie` and **nothing else**, so the voice-level carry
 *      `isInTie` is NOT opened — which shows the moment a REST follows;
 *   2. it ties `pitches[0]` ALONE, abcjs's own TODO asking "if this is a chord, which
 *      note?";
 *   3. it searches `tune.lines[tune.lineNum]` — THIS LINE's voice — so it cannot cross a
 *      line break;
 *   4. a REST stops the search rather than being skipped, because `getLastNote` returns the
 *      last `el_type === 'note'` and the `el.pitches` guard then fails.
 *
 * ⭐ **AND THE FIFTH RULE IS THE ONE THAT EXPLAINED A ROW THIS REPO HAD RECORDED AS
 * UNEXPLAINED.** A leading `-` before a REST marks nothing at all, and the mechanism is not
 * the rest refusing it: `getCoreNote`'s `-` arm writes `el.endTie = true`, and then the rest
 * letter's own arm runs `delete el.endTie` under a comment about nixing note properties
 * (`abc_parse_music.js:1158-1166`). Instrumented in a scratchpad copy: for `-C` the returned
 * core carries `endTie`, for `-z` it does not, and the dash arm fires in `startSlur` state
 * both times.
 *
 * Every expectation is abcjs 6.7.1's own answer, read out of a WebKit page.
 */
describe("a `-` that reaches back", () => {
  const shapeOf = (music: string): string =>
    (parseOnly(`X:1\nL:1/4\nK:C\n${music}\n`)[0]?.lines ?? ([] as readonly AbcLine[]))
      .flatMap((l) => (l.staff ?? []).flatMap((s) => (s.voices ?? []).flat()))
      .map((e) =>
        e.el_type !== "note"
          ? e.el_type
          : ((e.pitches ?? [])
              .map((p) => `${p.name}${p.startTie ? "(" : ""}${p.endTie ? ")" : ""}`)
              .join("") ||
            `z${e.rest?.startTie === undefined ? "" : "("}${
              e.rest?.endTie === true ? ")" : ""
            }`),
      )
      .join(" ");

  it.each([
    // 1. It ties back across a BARLINE and opens no carry, so a rest after it is bare…
    ["C|-D|", "C( bar D) bar"],
    ["C|-z C|", "C( bar z C bar"],
    ["C|-Z|", "C( bar z bar"],
    // …where a `-` written after the note DOES carry, and the rest closes it.
    ["C -z D|", "C( z) D bar"],
    ["C2 -z D2|", "C( z) D bar"],
    // 2. A chord is tied on its FIRST head alone.
    ["[CE]|-D|", "C(E bar D) bar"],
    // …and the closing side is per head, which is a different function.
    ["C|-[DF]|", "C( bar D)F) bar"],
    // 3. It cannot cross a line break.
    ["C\n-D|", "C D) bar"],
    ["C2\n-1 D2|", "C D) bar"],
    // 4. A rest stops the search.
    ["z|-C|", "z bar C) bar"],
    ["C z|-D|", "C z bar D) bar"],
    // 5. A leading `-` before a rest is deleted by the rest's own arm.
    ["-z C|", "z C bar"],
    ["-x C|", "z C bar"],
    ["-Z|", "z bar"],
    // …and before a NOTE it survives and closes on that note.
    ["-C D|", "C) D bar"],
    ["-[CE]|", "C)E) bar"],
    // A rest's OWN `-` opens a tie, which nothing draws.
    ["z-C|", "z( C) bar"],
  ])("%s → %s", (music, expected) => {
    expect(shapeOf(music)).toBe(expected);
  });
});
