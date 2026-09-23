import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **`%%staffnonote 0` DROPS A STAFF FROM `tune.lines`, NOT ONLY FROM THE PAGE.** `cleanUp`
 * nulls any STAFF none of whose voices satisfies `containsNotesStrict` and filters the
 * nulls out (`tune-builder.js:70-93`); the RENDERER has had the rule since it needed it
 * and the projection never did, so a host walking `lines` saw a staff of rests abcjs had
 * already deleted. Five tunes across four gates, two fixture families.
 *
 * BREAK: drop the `score.staffNoNote !== true ||` filter in `projectionOf` and the first
 * two rungs come back with an extra staff.
 */
describe("%%staffnonote 0 and the projection", () => {
  const stavesOf = (abc: string): number[][][] =>
    (parseOnly(abc)[0]?.lines ?? [])
      .filter((l) => l.staff !== undefined)
      .map((l) =>
        (l.staff ?? []).map((s) =>
          (s.voices ?? []).map((v) => v.filter((e) => e.el_type === "note").length),
        ),
      );

  const head = "X:1\n%%staffnonote 0\nL:1/4\nK:C\n";

  it("deletes a staff whose every voice is rests", () => {
    expect(stavesOf(`${head}V:1\nCDEF|\nV:2\nzzzz|\n`)).toEqual([[[4]]]);
  });

  it("…and keeps the staves around it in order", () => {
    expect(stavesOf(`${head}V:1\nCDEF|\nV:2\nzzzz|\nV:3\nGABc|\n`)).toEqual([[[4], [4]]]);
  });

  /**
   * ⚠️ **A REST CARRYING A CHORD SYMBOL KEEPS ITS STAFF** — the test is
   * `el_type === 'note' && (rest === undefined || chord !== undefined)`
   * (`tune-builder.js:896-902`), which is why this cannot be "does the voice have a note".
   */
  it("…but a rest with a chord symbol keeps it", () => {
    expect(stavesOf(`${head}V:1\nCDEF|\nV:2\n"C"zzzz|\n`)).toEqual([[[4], [4]]]);
  });

  /** And with the directive absent the staff stays, which is the other half of the rule. */
  it("…and without the directive nothing is dropped", () => {
    expect(stavesOf("X:1\nL:1/4\nK:C\nV:1\nCDEF|\nV:2\nzzzz|\n")).toEqual([[[4], [4]]]);
  });
});
