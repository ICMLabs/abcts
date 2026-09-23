import { describe, expect, it } from "vitest";
import type { AbcElement, AbcLine } from "../src/compat/lines.js";
import { parseOnly, renderAbc } from "../src/compat/index.js";

/**
 * **THE TWO RULES THAT CLOSED `clef-midmeasure`** — seven tunes across five tune-object
 * gates, and the shared prefix DID predict one cause and then turned out to hold two.
 *
 * Each of these is a control with its own break recorded beside it, because a gate that
 * names rows cannot say WHICH rule a row rests on.
 */
describe("a K: with nothing after it, and the clef it leaves behind", () => {
  const staffOf = (lines: readonly AbcLine[], k = 0) => lines[0]?.staff?.[k];
  const voicesOf = (lines: readonly AbcLine[]): AbcElement[][] =>
    lines.flatMap((l) => (l.staff ?? []).map((s) => (s.voices ?? []).flat()));

  /**
   * **A `K:` WRITTEN AFTER THE LAST MUSIC STILL PUBLISHES ITS ELEMENTS.**
   * `appendStartingElement` appends whatever the field named, whether or not a measure
   * follows — `clef` and `key` for `K:C clef=bass`, `key` alone for `K:Am`. The DRAWING was
   * already right (abcjs draws the cautionary clef and no trailing key at all), which is
   * why `svg-bytes` agreed throughout and only the parse tree could say so.
   *
   * BREAK: drop the `trailingKey` stash in `parser.ts`'s `finish()` and the last element
   * goes missing; drop the `el_type: e.el_type` override in the projection's merge and the
   * name reads `keySignature` on a tune nothing engraved.
   */
  it("appends a trailing key — under the parser's name when nothing engraved", () => {
    const [v] = voicesOf(parseOnly("X:1\nK:C\nCDEF|\nK:Am\n")[0]?.lines ?? []);
    expect(v?.map((e) => e.el_type)).toEqual(["note", "note", "note", "note", "bar", "key"]);
    expect(v?.[5]).toMatchObject({ root: "A", mode: "m", startChar: 14, endChar: 18 });
  });

  it("…and under the ENGRAVER's name when something drew it", () => {
    const [tune] = renderAbc("*", "X:1\nK:C\nCDEF|\nK:Am\n");
    const [v] = voicesOf(tune?.lines ?? []);
    expect(v?.map((e) => e.el_type)).toEqual([
      "note",
      "note",
      "note",
      "note",
      "bar",
      "keySignature",
    ]);
  });

  it("appends BOTH elements when the trailing field names a clef", () => {
    const [v] = voicesOf(parseOnly("X:1\nK:C\nCDEF|\nK:C clef=bass\n")[0]?.lines ?? []);
    expect(v?.slice(-2).map((e) => e.el_type)).toEqual(["clef", "key"]);
  });

  /**
   * **AND THE CLEF IS ONE TUNE-LEVEL VARIABLE, NOT ONE PER VOICE.** `startNewLine` reads
   * `multilineVars.staves[staffNum].clef` only for a staff that declared one and otherwise
   * falls through to `multilineVars.clef` (`abc_parse_music.js:961`), which every `K:` and
   * `[K: clef=]` overwrites in READING ORDER whatever voice it stands in.
   *
   * BREAK: seed `clefAt`/`furnitureOf` from `voice.clef ?? score.clef` again — the staff
   * reads `treble` and all four notes come back 12 pitch high.
   */
  it("opens a clef-less voice in the clef the voice above left behind", () => {
    const lines = parseOnly("X:1\nL:1/4\nK:C\nV:1\nCD[K:C bass]EF|\nV:2\nGABc|\n")[0]
      ?.lines;
    expect(staffOf(lines ?? [], 0)?.clef?.type).toBe("treble");
    expect(staffOf(lines ?? [], 1)?.clef?.type).toBe("bass");
    expect(
      staffOf(lines ?? [], 1)?.voices?.[0]?.map((e) => e.pitches?.[0]?.verticalPos),
    ).toEqual([16, 17, 18, 19, undefined]);
  });

  /** …and the standalone form of the same field, read between two `V:` lines. */
  it("…and a standalone K: between voices does it too", () => {
    const lines = parseOnly("X:1\nL:1/4\nK:C\nV:1\nCDEF|\nK:C clef=bass\nV:2\nGABc|\n")[0]
      ?.lines;
    expect(staffOf(lines ?? [], 1)?.clef?.type).toBe("bass");
  });

  /** A voice that DECLARED its own clef is insulated from the shared one. */
  it("…but a voice with its own clef= is not moved by it", () => {
    const lines = parseOnly(
      "X:1\nL:1/4\nK:C\nV:1\nCD[K:C bass]EF|\nV:2 clef=treble\nGABc|\n",
    )[0]?.lines;
    expect(staffOf(lines ?? [], 1)?.clef?.type).toBe("treble");
  });
});
