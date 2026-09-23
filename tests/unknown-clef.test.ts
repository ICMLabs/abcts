/**
 * **A CLEF NAME abcjs DOES NOT KNOW KEEPS ITS OWN SPELLING AND GETS NO `clefPos`.**
 *
 * `fixClef` looks the name up in `clefLines` and does BOTH things inside one `if (value)`:
 * rewrites `clef.type` to the table's canonical name, and assigns `clef.clefPos =
 * value.pitch` (`abc_parse_key_voice.js:75-81`). A miss does neither — so the parsed clef
 * keeps the token the `default:` arm assembled after warning about it, which is the
 * letters plus any number and any `±8` (`:490-513`).
 *
 * This engine fell back to `treble` and assigned `clefPos: 4`. **One lookup, showing as two
 * divergences across four gates and five tunes** — `parse-only`, `parse-values`,
 * `render-values` and `deline` all named `abcts-unknown-clef` rows in `tests/open-rows.ts`,
 * and all four closed on `Clef.name`.
 *
 * Measured against abcjs 6.7.1 in WebKit, both engines' `parseOnly` on the same fixture.
 */
import { describe, expect, it } from "vitest";

import { parseOnly } from "../src/compat/index.js";

const clefOf = (abc: string): Record<string, unknown> | undefined => {
  const tune = parseOnly(abc)[0] as unknown as {
    lines?: { staff?: { clef?: Record<string, unknown> }[] }[];
  };
  return tune?.lines?.flatMap((l) => l.staff ?? []).find((s) => s.clef)?.clef;
};

const head = (clef: string): string => `X:1\nL:1/4\nK:C clef=${clef}\nCDEF|\n`;

describe("an unrecognised clef name", () => {
  it.each(["x", "zzz", "q2"])("reports %s as its own type, with no clefPos", (name) => {
    const clef = clefOf(head(name));
    expect(clef?.["type"]).toBe(name);
    expect(clef).not.toHaveProperty("clefPos");
  });

  /**
   * ⭐ **THE BREAK.** Both assertions above are about an ABSENCE and a passthrough, which is
   * what a projection that had stopped emitting clefs entirely would also produce. A name
   * the table DOES know must still be canonicalised and still carry its pitch — `tenor`
   * comes back spelled `alto`, at `clefPos` 8.
   */
  it("still canonicalises and positions a name the table knows", () => {
    const clef = clefOf(head("tenor"));
    expect(clef?.["type"]).toBe("alto");
    expect(clef?.["clefPos"]).toBe(8);
  });

  /**
   * …and `clef=none` is the third case: it HITS the table and the row has no `pitch`, so
   * the assignment stores `undefined` and the field never serialises. Same output as a
   * miss, different reason — the comment at `clefElement` had that reason wrong for months.
   */
  it("gives clef=none no clefPos either, by a different route", () => {
    const clef = clefOf(head("none"));
    expect(clef?.["type"]).toBe("none");
    expect(clef).not.toHaveProperty("clefPos");
  });
});
