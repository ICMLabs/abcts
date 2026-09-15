/**
 * **A HEADER `P:ABAB` IS CARRIED AND NOT EXPANDED — WHICH IS WHAT abcjs DOES TOO.**
 *
 * Two `ponytail:` markers called the header part order DEFERRED: `parser.ts`'s list of
 * what is not parsed, and `Measure.partLabel`'s "a `P:` in the header is a part ORDER
 * ("ABAB"), a different thing entirely, and is still deferred".
 *
 * Measured 2026-09-16 against abcjs 6.7.0 in WebKit: **there is no parity gap.** Both
 * engines record the order at `metaText.partOrder` and neither repeats a bar of music for
 * it — the rendered SVG is byte-identical, and so is the MIDI. Expanding the order would be
 * a NATIVE feature, and a divergence from abcjs rather than a step towards it.
 */
import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

const WITH_ORDER = "X:1\nL:1/4\nP:ABAB\nK:C\nP:A\nC D E F|\nP:B\nG A B c|\n";
const NO_ORDER = "X:1\nL:1/4\nK:C\nP:A\nC D E F|\nP:B\nG A B c|\n";

const render = (abc: string): { order: unknown; svg: string } => {
  const host = { innerHTML: "" } as { innerHTML: string };
  const tune = renderAbc(host, abc, { staffwidth: 670 })[0];
  return {
    order: (tune?.metaText as Record<string, unknown> | undefined)?.["partOrder"],
    svg: host.innerHTML,
  };
};

describe("a header P: is a part ORDER, carried and not expanded", () => {
  it("reports the order at metaText.partOrder, as abcjs does", () => {
    expect(render(WITH_ORDER).order).toBe("ABAB");
    expect(render(NO_ORDER).order).toBeUndefined();
  });

  /**
   * ⭐ **THE BREAK, AND IT IS THE HALF THAT MATTERS.** Expanding `ABAB` would repeat the
   * music, so the drawing would GROW. It must not: abcjs draws the two parts once, and the
   * only thing the order adds to the page is the `P:` text row itself.
   */
  it("does not repeat a bar of music for it", () => {
    const withOrder = render(WITH_ORDER).svg;
    const noOrder = render(NO_ORDER).svg;
    // ⚠️ `<path data-name>`, not `data-name` — a `P:` label is a `<text data-name="A">`,
    // so counting both would have counted the part labels as notes. (It did: 10, not 8.)
    const notes = (svg: string): number =>
      (svg.match(/<path data-name="[A-Ga-g]"/g) ?? []).length;
    expect(notes(withOrder)).toBe(notes(noOrder));
    expect(notes(withOrder)).toBe(8);
  });
});
