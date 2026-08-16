/**
 * The generated abcjs glyph table, checked against abcjs's own rendered SVG.
 *
 * `src/renderer/glyphs-abcjs.ts` is generated from abcjs's `glyphs.js`. This asserts the
 * generation is FAITHFUL by a different route than the one that produced it: the outlines
 * are compared against the `d` attributes abcjs actually emitted into the golden SVGs. A
 * generator bug that mangled the segment joining would round-trip through its own logic
 * happily and fail here.
 *
 * ── WHY THERE ARE TWO GLYPH TABLES ───────────────────────────────────────────
 * A font is not only outlines. Its ADVANCES feed layout, and abcjs's differ from
 * Bravura's substantially — not by rounding:
 *
 *     noteheads.quarter  1.2658 spaces    noteheadBlack  1.1800    -6.8%
 *     noteheads.whole    1.9335           noteheadWhole  1.6880   -12.7%
 *     flags.d8th         1.0957           flag8thDown    1.2240   +11.7%
 *
 * So the glyph dictionary is an INPUT to the engraving, not an asset downstream of it.
 * While abcts draws Bravura it cannot be byte-identical to abcjs, and it cannot be
 * position-identical either. Borrowing abcjs's advances while drawing Bravura outlines
 * is the worst of both — correctly-sized gaps around wrongly-sized shapes.
 *
 * Hence: abcjs's table for the parity build, Bravura for `abc2.1`/`extended`, where
 * being better matters more than being identical and where the extra glyphs abcjs simply
 * lacks are needed anyway.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLYPHS } from "../src/renderer/glyphs.js";
import {
  ABCJS_GLYPHS,
  ABCJS_STAFF_SPACE,
} from "../src/renderer/glyphs-abcjs.js";
import { goldensDir } from "./corpus/corpus.js";

const golden = (name: string): string =>
  readFileSync(join(goldensDir, `${name}.svg`), "utf-8");

/** Every `d` abcjs emitted in a golden, with its class. */
const drawnPaths = (svg: string): { cls: string; d: string }[] =>
  [...svg.matchAll(/<path([^>]*)\/?>/g)].map((m) => ({
    cls: /class="([^"]*)"/.exec(m[1] ?? "")?.[1] ?? "",
    d: /\sd="([^"]+)"/.exec(m[1] ?? "")?.[1] ?? "",
  }));

describe("the generated abcjs glyph table", () => {
  it("has abcjs 6.6.3 full complement", () => {
    // 95, not 91: abcjs closes its table literal and then adds four more by assignment
    // under "Custom characters that weren't generated from the font" — the styled
    // noteheads, which are exactly what `%%percmap` and `V:… style=` reach. The generator
    // sliced to the literal's `};` and dropped all four silently.
    expect(Object.keys(ABCJS_GLYPHS).length).toBe(95);
  });

  it("reproduces the outlines abcjs actually drew, verbatim", () => {
    // abcjs bakes an absolute `M x y` onto the front of each outline and follows it with
    // the shape's own relative segments. The table stores the shape; the leading move is
    // placement. So the golden's `d` minus its opening move must appear in the table
    // exactly — byte for byte, not normalised.
    const heads = drawnPaths(golden("simple-c")).filter((p) =>
      p.cls.includes("notehead"),
    );
    expect(heads.length).toBeGreaterThan(0);
    const quarter = ABCJS_GLYPHS["noteheads.quarter"];
    expect(quarter).toBeDefined();
    for (const head of heads) {
      const outline = head.d.slice(head.d.indexOf("c"));
      expect(quarter?.path).toContain(outline.slice(0, 200));
    }
  });

  it("reproduces a clef outline too, so the check is not notehead-shaped", () => {
    // A notehead is short and smooth; a clef is long with many segments, which is where a
    // segment-joining bug would actually show.
    const clef = drawnPaths(golden("simple-c")).find((p) => p.d.length > 2000);
    expect(clef).toBeDefined();
    const outline = (clef?.d ?? "").slice((clef?.d ?? "").indexOf("c"));
    const gClef = ABCJS_GLYPHS["clefs.G"];
    expect(gClef?.path).toContain(outline.slice(0, 400));
  });

  describe("metrics differ from Bravura enough to change layout", () => {
    // The measurement that settled the dual-table decision. Asserted so that a future
    // Bravura update cannot quietly make the two agree and leave the second table
    // looking like dead weight — or, worse, quietly disagree further.
    const PAIRS: [abcjs: string, smufl: string][] = [
      ["noteheads.quarter", "noteheadBlack"],
      ["noteheads.whole", "noteheadWhole"],
      ["accidentals.sharp", "accidentalSharp"],
      ["flags.d8th", "flag8thDown"],
    ];

    for (const [abcjsName, smufl] of PAIRS) {
      it(`${abcjsName} vs ${smufl}`, () => {
        const theirs = (ABCJS_GLYPHS[abcjsName]?.w ?? 0) / ABCJS_STAFF_SPACE;
        const ours = GLYPHS[smufl as keyof typeof GLYPHS]?.advance ?? 0;
        expect(theirs).toBeGreaterThan(0);
        expect(ours).toBeGreaterThan(0);
        // At least 3% apart — far outside anything a rounding difference explains, and
        // enough that it accumulates visibly across a key signature or a beamed run.
        expect(Math.abs(ours - theirs) / theirs).toBeGreaterThan(0.03);
      });
    }
  });

  it("records the staff space its units are expressed in", () => {
    // abcjs's STEP is 3.875, a HALF space — the classic off-by-two waiting to happen if
    // anyone reads this table without checking.
    expect(ABCJS_STAFF_SPACE).toBe(7.75);
    // Sanity: a quarter notehead is a bit over one space wide in any real music font.
    const width =
      (ABCJS_GLYPHS["noteheads.quarter"]?.w ?? 0) / ABCJS_STAFF_SPACE;
    expect(width).toBeGreaterThan(1);
    expect(width).toBeLessThan(1.5);
  });
});
