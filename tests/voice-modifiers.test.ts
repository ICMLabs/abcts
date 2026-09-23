import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

const elementsOf = (abc: string): string[] =>
  (parseOnly(abc)[0]?.lines ?? [])
    .flatMap((l) => (l.staff ?? []).flatMap((s) => (s.voices ?? []).flat()))
    .map((e) => e.el_type);

const stemOf = (voiceLine: string): string | undefined => {
  const head = (parseOnly(`X:1\nL:1/4\nK:C\n${voiceLine}\nCDEF|\n`)[0]?.lines ?? [])
    .flatMap((l) => (l.staff ?? []).flatMap((s) => (s.voices ?? []).flat()))
    .find((e) => e.el_type === "stem");
  return head === undefined
    ? undefined
    : (head as unknown as { direction?: string }).direction;
};

/**
 * **`foundClef` IS A NAME, NOT A CHANGE.** `ret.foundClef = true` is written in the
 * clef-NAME arm alone (`abc_parse_key_voice.js:513-516`), so a `K:` carrying only a
 * modifier appends NO clef element — it changes the staff and says nothing in the stream.
 * `Measure.clefChangeSilent` has said so since the renderer needed it and the projection
 * emitted a clef for every modifier.
 *
 * BREAK: drop the `clefChangeSilent !== true` guard in `voiceElements` and the first two
 * rungs grow a `clef`.
 */
describe("a K: that names no clef", () => {
  it("appends a key and NO clef for a bare modifier", () => {
    expect(elementsOf("X:1\nL:1/4\nK:C\nCDEF|\n[K:C stafflines=1]GABc|\n")).toEqual([
      "note",
      "note",
      "note",
      "note",
      "bar",
      "key",
      "note",
      "note",
      "note",
      "note",
      "bar",
    ]);
  });

  it("…mid-measure too", () => {
    expect(elementsOf("X:1\nL:1/4\nK:C\nCD[K:C stafflines=1]EF|\n")).toEqual([
      "note",
      "note",
      "key",
      "note",
      "note",
      "bar",
    ]);
  });

  it("…and appends BOTH when a clef IS named", () => {
    expect(elementsOf("X:1\nL:1/4\nK:C\nCD[K:C bass]EF|\n")).toEqual([
      "note",
      "note",
      "clef",
      "key",
      "note",
      "note",
      "bar",
    ]);
  });
});

/**
 * **THE V: SWITCH HAS NO `default:` ARM — IT IS COMMENTED OUT** (`:828-830`), so an
 * attribute abcjs does not know is dropped WITHOUT ITS VALUE, and the value is then read
 * as a token of its own. That is why `gstem=up` sets the stem: nothing in abcjs knows the
 * word `gstem`, and the `up` left behind reaches `case 'up'`.
 *
 * ⚠️ **MEASURED, AND THE SOURCE PREDICTS THE OPPOSITE** — a read says "unknown parameter,
 * warn and ignore". abcjs answers `{el_type: 'stem', direction: 'up'}` and NO warning for
 * `gstem=up`, `xstem=up` and `zzz=up` alike, which is what says the name is not the
 * mechanism. BREAK: restore the old `/\s(up|down)\s/` bare match and every `…=up` rung
 * goes quiet.
 */
describe("an unrecognised V: attribute does not eat its value", () => {
  it.each([
    ["V:1 gstem=up", "up"],
    ["V:1 gstem=down", "down"],
    ["V:1 xstem=up", "up"],
    ["V:1 zzz=up", "up"],
    ["V:1 GSTEM=up", "up"],
    ["V:1 stem=up", "up"],
    ["V:1 stems=down", "down"],
    ["V:1 up", "up"],
    ["V:1 clef=bass up", "up"],
    ["V:1 name=\"x\" down", "down"],
  ])("%s → stem %s", (voiceLine, expected) => {
    expect(stemOf(voiceLine)).toBe(expected);
  });

  /** …and a key that DOES eat its value leaves nothing behind, nor does a bad value. */
  it.each([["V:1 gstem"], ["V:1 gstem=sideways"], ["V:1 name=up"], ["V:1 zzz"]])(
    "%s → no stem element",
    (voiceLine) => {
      expect(stemOf(voiceLine)).toBeUndefined();
    },
  );
});
