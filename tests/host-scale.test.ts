import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

/**
 * **THE HOST'S `{scale}` IS `%%scale` BY ANOTHER ROUTE.**
 *
 *     this.scale = params.scale ? parseFloat(params.scale) : 0;
 *     if (!(this.scale > 0.1)) this.scale = undefined;
 *     …
 *     var scale = abcTune.formatting.scale ? abcTune.formatting.scale : this.scale;
 *
 * (`engraver-controller.js:47-50`, `:213`.) Whichever wins divides the music width, the
 * four paddings and the header/footer sizes, and the whole drawing is then CSS-scaled by
 * it (`:124-126`, `renderer.js:79-86`).
 *
 * ⚠️ **AND `setPaperSize` DIVIDES BACK ONLY BELOW 1:**
 *
 *     if (scale < 1) renderer.paper.setSize(w / scale, h / scale)
 *     else renderer.paper.setSize(w, h)
 *
 * (`draw/set-paper-size.js:33-38`), where `w`/`h` were multiplied by the scale two lines
 * up. So the operations cancel below 1 and compound at or above it. PRINT is always 0.75,
 * so only the cancelling branch was ever exercised and the asymmetry read as an identity.
 *
 * Every number here is abcjs 6.7.0's own, rendered at the goldens' `{staffwidth: 670}`,
 * and each row was byte-identical to abcjs's whole SVG when it was taken — not just the
 * two dimensions this asserts.
 *
 * ⚠️ **WHAT IT REPLACES WAS NOT A ROUNDING DIFFERENCE.** `params.scale` multiplied the
 * STAFF SPACE, so `{scale: 0.5}` came out 350x72.08 where abcjs writes 1400x174.167 — the
 * page shrank where abcjs's grows. The `%%scale` path was byte-exact the whole time: one
 * route was right and the other was reading the number as a different quantity. It
 * carried a `ponytail:` saying the host param "is not read", which was true when written
 * and had stopped being true.
 */
const page = (abc: string, params: Record<string, unknown>): string => {
  const svg =
    (renderAbc("*", abc, { staffwidth: 670, ...params } as never)[0] as { svg?: string })
      ?.svg ?? "";
  const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  return `${m?.[1] ?? "?"} x ${m?.[2] ?? "?"}`;
};

const TUNE = "X:1\nT:t\nL:1/8\nK:C\nCDEF GABc|\n";
const SCALED = "X:1\nT:t\n%%scale 0.5\nL:1/8\nK:C\nCDEF GABc|\n";

describe("renderAbc({scale})", () => {
  it("is the identity at 1 and when absent", () => {
    expect(page(TUNE, {})).toBe("700 x 144.167");
    expect(page(TUNE, { scale: 1 })).toBe("700 x 144.167");
  });

  it("widens the page below 1, where the two operations cancel", () => {
    expect(page(TUNE, { scale: 0.5 })).toBe("1400 x 174.167");
    expect(page(TUNE, { scale: 0.8 })).toBe("875 x 151.667");
  });

  it("…and compounds them at or above 1", () => {
    expect(page(TUNE, { scale: 2 })).toBe("700 x 258.334");
    expect(page(TUNE, { scale: 1.5 })).toBe("700 x 201.2505");
  });

  it("ignores a scale that is not above 0.1, which the DIRECTIVE would honour", () => {
    expect(page(TUNE, { scale: 0.05 })).toBe("700 x 144.167");
    expect(page(TUNE, { scale: 0.1 })).toBe("700 x 144.167");
  });

  it("lets the directive win over the host", () => {
    expect(page(SCALED, { scale: 2 })).toBe("1400 x 174.167");
    expect(page(SCALED, {})).toBe("1400 x 174.167");
  });
});
