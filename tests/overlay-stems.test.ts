import { describe, expect, it } from "vitest";
import { parseOnly, renderAbc } from "../src/compat/index.js";

const HEAD = "X:1\nL:1/4\nK:C\n";

/** The page height — which moves by exactly the up-stem's reach above the staff. */
const height = (music: string): string =>
  /height="([\d.]+)"/.exec(
    (renderAbc("*", `${HEAD}${music}`, {})[0] as { svg?: string })?.svg ?? "",
  )?.[1] ?? "";

/** Each voice of the first staff as `el_type`s, stems with their direction. */
const stream = (music: string): string[] =>
  (parseOnly(`${HEAD}${music}`)[0]?.lines ?? []).flatMap((l) =>
    ((("staff" in l ? l.staff : []) ?? []) as { voices?: { el_type: string; direction?: string }[][] }[])
      .slice(0, 1)
      .flatMap((st) =>
        (st.voices ?? []).map((v) =>
          v.map((e) => (e.el_type === "stem" ? `stem-${e.direction}` : e.el_type)).join(" "),
        ),
      ),
  );

/**
 * **AN `&` FORCES THE VOICE IT INTERRUPTS UP — FOR ITS OWN MEASURE, AND THEN LETS GO.**
 * `resolveOverlays` puts a `stem up` before the barline opening the `&`'s measure and a
 * `stem auto` after the one closing it (`tune-builder.js:601-606`), and the engraver takes
 * each as the voice's `stemdir` (`abstract-engraver.js:342-343`). Ours followed pitch, so
 * a `c` over an `&` stemmed DOWN into the layer's notes.
 *
 * Every number here is abcjs 6.7.1's own, read out of a WebKit page.
 */
describe("an & measure stems its main voice up", () => {
  it("a c that pitch would stem down stems up over a layer", () => {
    expect(height("c2&e2|")).toBe("95.685");
  });

  it("…and only in that measure — the one after is pitch's again", () => {
    // Four quarter c's after the `&` measure stem down; were they held up, the page
    // would not change, so the stream is what says the marker let go.
    expect(stream("c2&e2|c c c c|")).toEqual([
      "stem-up note bar stem-auto note note note note bar",
      "stem-down note bar note bar",
    ]);
  });

  /**
   * ⚠️ **AN EMPTY LAYER IS STILL AN `&`**, and the stem survives the layer: `voiceUseful`
   * deletes a voice that sings nothing (`tune-builder.js:113-123`) but the `stem up` it
   * left on the main voice is already there.
   */
  it("an empty layer still forces the stem", () => {
    expect(stream("c&|")).toEqual(["stem-up note bar stem-auto"]);
    expect(height("c&|")).toBe("95.685");
  });

  it("a voice that sings nothing is deleted — the main one included", () => {
    expect(stream("&|")).toEqual([]);
    expect(height("&|")).toBe("37.56");
  });

  it("a run of & belongs to nothing, and each is a layer", () => {
    expect(stream("C&&D|")).toEqual([
      "stem-up note bar stem-auto",
      "stem-down stem-down note bar",
    ]);
    // …and the D opens past BOTH: its span is 17…18, not 16…18.
    const layer = (parseOnly(`${HEAD}C&&D|`)[0]?.lines?.[0] as { staff: { voices: { el_type: string; startChar?: number }[][] }[] })
      .staff[0]?.voices[1]?.find((e) => e.el_type === "note");
    expect(layer?.startChar).toBe(17);
  });
});
