import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { setGlyph } from "../src/compat/index.js";
import { clearGlyphOverrides } from "../src/renderer/set-glyph.js";
import { renderAll } from "./render-all.js";

/**
 * **`setGlyph(name, glyph)` — A HOST REPLACING AN OUTLINE, AND THE WHOLE PAGE THAT MOVES.**
 *
 * The oracle is `tests/corpus-set-glyph/golden.json`: abcjs 6.7.0's own markup after the
 * same swap (`scripts/harvest-abcjs-set-glyph.mjs`), at the `{staffwidth: 670}` every
 * golden in both corpora is made at.
 *
 * **THE TABLE IS THE DRAWING DATA, SO A SWAP MOVES THE SPACING TOO.** abcjs's `w` is what
 * `getMinWidth` spends, so a wider notehead pushes every element after it; ours keeps a
 * joined path AND a derived ink box, and only the whole SVG can say both halves landed. A
 * gate that compared the notehead paths alone would pass with the music in the wrong place.
 *
 * Two swaps, a plain rectangle each way — 18 × 6 and 4 × 3 — so the difference is
 * unmistakable in the markup and in the spacing.
 *
 * ✅ **ALL SIX ARE BYTE-EXACT.** The sixth was one ULP for a while — `visual-layout-04#wide`
 * wrote a dot at `1055.0269999999998` against abcjs's `1055.027` — and the note here said
 * it was "the solve's association" and not `setGlyph`'s. It was neither: the dot is a
 * DISPLACED one, and the voice-overlap rule was NUDGING the glyph where abcjs rewrites its
 * `dx` and lets `setX` spend it as one add onto the element's x. An 18-wide quarter
 * notehead is what makes a second voice overlap here at all, which is why only this render
 * could see it. See `displaceHeads`.
 */
const ULP_ONLY: readonly string[] = [];
const GOLDEN = JSON.parse(
  readFileSync(join(import.meta.dirname, "corpus-set-glyph", "golden.json"), "utf-8"),
) as Record<string, string>;

const IN_REPO = join(import.meta.dirname, "corpus-abcjs", "fixtures");

const box = (w: number, h: number) => ({
  d: [
    ["M", 0, -h / 2],
    ["l", w, 0],
    ["l", 0, h],
    ["l", -w, 0],
    ["z"],
  ] as [string, ...number[]][],
  w,
  h,
});

const SWAPS: Record<string, () => void> = {
  wide: () => setGlyph("noteheads.quarter", box(18, 6)),
  narrow: () => setGlyph("noteheads.quarter", box(4, 3)),
};

describe("setGlyph — a replaced outline, and the page that moves with it", () => {
  const rows: { slug: string; same: boolean; at: number }[] = [];

  for (const [key, want] of Object.entries(GOLDEN)) {
    const [file = "", label = ""] = key.split("#");
    it(`${key} matches abcjs byte for byte`, () => {
      clearGlyphOverrides();
      SWAPS[label]?.();
      const abc = readFileSync(join(IN_REPO, `${file}.abc`), "utf-8");
      const got = renderAll(abc, { staffwidth: 670 })[0]?.svg ?? "";
      clearGlyphOverrides();
      let at = -1;
      for (let i = 0; i < Math.max(got.length, want.length); i += 1)
        if (got[i] !== want[i]) {
          at = i;
          break;
        }
      rows.push({ slug: key, same: at === -1, at });
      if (ULP_ONLY.includes(key)) {
        // Held at its measurement rather than at zero — see the note above.
        expect(at === -1 || Math.abs(got.length - want.length) < 16).toBe(true);
        return;
      }
      if (at !== -1) {
        const from = Math.max(0, at - 60);
        expect(
          `…${got.slice(from, at + 60)}`,
          `first difference at byte ${at}`,
        ).toEqual(`…${want.slice(from, at + 60)}`);
      }
      expect(at).toBe(-1);
    });
  }

  it("writes the ranked table", () => {
    writeFileSync(
      "/tmp/abcts-set-glyph-ranked.txt",
      `${[
        `${rows.filter((r) => !r.same).length} of ${rows.length} renders differ`,
        "",
        ...rows
          .filter((r) => !r.same)
          .map((r) => `  ${r.slug.padEnd(64)} first differs at byte ${r.at}`),
      ].join("\n")}\n`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
