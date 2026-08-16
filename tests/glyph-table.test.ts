/**
 * The per-mode glyph table.
 *
 * One emitter, one layout, two tables. Strict draws abcjs's glyphs at abcjs's advances;
 * everything else draws Bravura. The two are the same decision — a font's advances decide
 * where the next thing goes, so taking abcjs's outlines without its metrics would put
 * correctly-sized gaps around wrongly-sized shapes.
 *
 * NOT YET WIRED INTO LAYOUT, deliberately, and the reason is in the numbers. The residual
 * this table closes is the SMALL one: single-system fixtures, where no line-break
 * disagreement is possible, sit 0-9px from abcjs. Multi-system fixtures sit 900-1100px,
 * all of it line breaking. Wiring the table means threading it through ten layout
 * signatures for a term two orders of magnitude smaller than the one next to it, so it
 * waits until line breaking has collapsed and it is the dominant error rather than noise
 * underneath one.
 */
import { describe, expect, it } from "vitest";
import { SPACE } from "../src/renderer/abcjs-constants.js";
import {
  ABCJS_TABLE,
  BRAVURA_TABLE,
  glyphTableFor,
} from "../src/renderer/glyph-table.js";
import type { GlyphName } from "../src/renderer/glyphs.js";

describe("glyph table selection", () => {
  it("strict draws abcjs; the other modes draw Bravura", () => {
    expect(glyphTableFor("abcjs-strict").usesAbcjsGlyphs).toBe(true);
    expect(glyphTableFor("abc2.1").usesAbcjsGlyphs).toBe(false);
    expect(glyphTableFor("extended").usesAbcjsGlyphs).toBe(false);
  });

  describe("metrics come from the same font as the outlines", () => {
    // The failure this guards is silent and would look fine in a screenshot: abcjs's
    // spacing around Bravura's shapes, or the reverse. Both tables must be internally
    // consistent, so advance and path always come from one font.
    const CASES: [GlyphName, number, number][] = [
      // name, abcjs advance (staff spaces), Bravura advance
      ["noteheadBlack", 1.2658, 1.18],
      ["noteheadWhole", 1.9335, 1.688],
      ["accidentalSharp", 1.0645, 0.996],
      ["flag8thDown", 1.0957, 1.224],
    ];

    for (const [name, abcjsAdvance, bravuraAdvance] of CASES) {
      it(`${name}`, () => {
        // The figures are STAFF SPACES, which is what both fonts publish; the tables
        // answer in LAYOUT UNITS, and `SPACE` is how many of those a staff space is. It
        // was 1 while the layout was denominated in spaces and is 7.75 now, so the
        // conversion has to be written rather than assumed.
        expect(ABCJS_TABLE.advance(name)).toBeCloseTo(abcjsAdvance * SPACE, 3);
        expect(BRAVURA_TABLE.advance(name)).toBeCloseTo(
          bravuraAdvance * SPACE,
          3,
        );
        // And the outlines follow the metrics, not the other way round.
        expect(ABCJS_TABLE.get(name)?.unitsPerSpace).toBe(7.75);
        expect(BRAVURA_TABLE.get(name)?.unitsPerSpace).toBe(1);
      });
    }
  });

  it("keeps abcjs path data byte-identical rather than rescaling it", () => {
    // Converting the numbers inside a `d` string is how a faithful copy becomes an
    // approximate one. The scale rides on `unitsPerSpace` instead, so the emitter can
    // express it as a transform and the data stays exactly what abcjs ships.
    const head = ABCJS_TABLE.get("noteheadBlack");
    expect(head?.path.startsWith("M ")).toBe(true);
    expect(head?.path).toContain("c 0.36 -0.03");
  });

  describe("Bravura stands in where abcjs has no such glyph", () => {
    // Not a compromise — the parity behaviour. Anything reaching for a glyph abcjs lacks
    // is already outside what abcjs can express, so Bravura's is strictly better than a
    // blank, and the spacing stays consistent with the shape actually drawn.
    //
    // EVERY NAME HERE MUST BE ONE ABCJS GENUINELY LACKS, and `noteheadDiamondBlack` was
    // not: abcjs has `noteheads.harmonic.quarter` and our generator could not see it,
    // because abcjs adds four styled heads by ASSIGNMENT after its table literal. This
    // list asserted the fallback and so froze the defect in place — a fallback test is
    // only meaningful if the absence it names is real.
    for (const name of [
      "ornamentTurnInverted",
      "accidentalThreeQuarterTonesSharpStein",
      "tremolo1",
    ] as GlyphName[]) {
      it(`${name} falls back`, () => {
        const entry = ABCJS_TABLE.get(name);
        expect(entry).toBeDefined();
        // unitsPerSpace 1 is the tell: this came from Bravura, so its advance is
        // Bravura's too and the pair stays consistent.
        expect(entry?.unitsPerSpace).toBe(1);
        expect(ABCJS_TABLE.advance(name)).toBe(BRAVURA_TABLE.advance(name));
      });
    }
  });

  it("resolves every glyph the corpus leans on out of abcjs, not the fallback", () => {
    // A fallback that quietly caught everything would make the whole table a no-op and
    // still pass every test above.
    for (const name of [
      "noteheadBlack",
      "noteheadHalf",
      "gClef",
      "accidentalSharp",
      "restQuarter",
      "flag8thDown",
      "augmentationDot",
      "timeSig4",
    ] as GlyphName[]) {
      expect(
        ABCJS_TABLE.get(name)?.unitsPerSpace,
        `${name} fell back to Bravura`,
      ).toBe(7.75);
    }
  });
});
