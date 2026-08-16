/**
 * The compat surface: what an existing abcjs page depends on.
 *
 * The bar here is VISUAL EQUIVALENCE plus the same DOM, not byte-identical SVG — see
 * `src/compat/index.ts`. So these assert the things a page actually breaks on: the call
 * signature, the CSS classes, the `data-name` hooks, the engraving density, and the
 * element's width in the page. Not the bytes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { numberOfTunes, renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { corpusDir, goldensDir } from "./corpus/corpus.js";

const fixture = (name: string) =>
  readFileSync(join(corpusDir, `${name}.abc`), "utf-8");
const golden = (name: string) =>
  readFileSync(join(goldensDir, `${name}.svg`), "utf-8");
const classesIn = (svg: string) =>
  new Set(
    [...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) =>
      (m[1] ?? "").split(" "),
    ),
  );

describe("renderAbc", () => {
  it("takes abcjs's signature and returns one object per output SLOT", () => {
    // `clefs` is eight tunes. Eight slots, eight objects — `dump-svg.js` builds eight divs.
    const tunes = renderAll(fixture("clefs"), { staffwidth: 740 });
    expect(tunes).toHaveLength(8);
    expect(tunes[0]?.metaText.title).toBe("Treble clef");
    expect(tunes[0]?.svg).toContain("<svg");
  });

  /**
   * **ONE TUNE PER SLOT, NOT ONE PER TUNE.** `renderEngine` normalises a non-array
   * `output` to `[output]` and walks the SLOTS from `params.startingTune`
   * (`api/abc_tunebook.js:56-104`). Measured against abcjs on `tunebook-3` before it was
   * changed here: `numberOfTunes` 3, a string target returns 1, an array of three
   * returns 3. This test used to assert the opposite, because our implementation did.
   */
  it("renders ONE tune for a single target, whatever the book holds", () => {
    expect(numberOfTunes(fixture("clefs"))).toBe(8);
    expect(renderAbc("*", fixture("clefs"), { staffwidth: 740 })).toHaveLength(
      1,
    );
  });

  it("opens at `startingTune` and stops at the end of the book", () => {
    const two = renderAbc(["*", "*"], fixture("clefs"), { startingTune: 6 });
    expect(two.map((t) => t.metaText.title)).toEqual([
      "Soprano clef",
      "Change Clefs",
    ]);
    // …AND A SLOT PAST THE END CONTRIBUTES NOTHING, it just empties its div (`:99-102`).
    const past = { innerHTML: "not empty" };
    expect(
      renderAbc(["*", past], fixture("clefs"), { startingTune: 7 }),
    ).toHaveLength(1);
    expect(past.innerHTML).toBe("");
  });

  it("injects into a DOM target when there is one", () => {
    // No document in Node, so a target object stands in for the element abcjs would fill.
    const element = { innerHTML: "" };
    renderAbc(element, fixture("simple-c"));
    expect(element.innerHTML).toContain("<svg");
  });

  it("renders without a target, for Node", () => {
    expect(() => renderAll(fixture("simple-c"))).not.toThrow();
  });

  it("emits abcjs's class names, and none of core's", () => {
    // The reason to use this entry point: a stylesheet written against abcjs keeps working.
    const ours = classesIn(renderAll(fixture("simple-c"))[0]?.svg ?? "");
    const theirs = classesIn(golden("simple-c"));
    for (const cls of [
      "abcjs-notehead",
      "abcjs-stem",
      "abcjs-ledger",
      "abcjs-top-line",
    ]) {
      expect(theirs.has(cls), `golden should have ${cls}`).toBe(true);
      expect(ours.has(cls), `compat should emit ${cls}`).toBe(true);
    }
    for (const cls of ours) expect(cls.startsWith("abcjs-")).toBe(true);
  });

  it("emits the data-name hooks interaction code keys on", () => {
    const svg = renderAll(fixture("simple-c"))[0]?.svg ?? "";
    const names = new Set(
      [...svg.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]),
    );
    for (const name of ["note", "bar", "stem", "ledger", "staff-extra clef"]) {
      expect(names.has(name), `missing data-name="${name}"`).toBe(true);
    }
  });

  it("matches abcjs's engraving density, so the page does not shift", () => {
    // abcjs spaces a quarter note at sqrt(0.25*8)*30 = 42.43 PIXELS.
    //
    // CORRECTED: this used to read "our coordinates are staff spaces inside a viewBox —
    // resolution-independent where abcjs writes absolute pixels — so the internal numbers
    // differ by design", and multiplied through the viewBox scale. That premise is gone:
    // compat now emits ABSOLUTE PIXELS and no `viewBox`, because byte parity with abcjs
    // needs the pixels themselves. The figure is read directly.
    const svg =
      renderAll(fixture("simple-c"), { staffwidth: 740 })[0]?.svg ?? "";
    const toPx = 1;

    // CORRECTED AGAIN: there is no `translate()` on a glyph either. abcjs adds x and y to
    // the first `M` of the outline and writes no transform (`creation/glyphs.js:132-142`),
    // and compat does the same. The `M` carries the outline's own contour start as well as
    // the placement, which cancels between two heads of the same glyph.
    // CORRECTED A THIRD TIME, and for the reason the last two were: this read
    // `class="abcjs-notehead"` BEFORE the `d`, which was true only of our own markup.
    // abcjs writes that class LAST — it is a `setAttribute` after the element exists
    // (`draw/absolute.js:20-22`) — so the pattern broke the moment we matched abcjs.
    // Read the whole tag and ask what it carries, in no order.
    const xs = [...svg.matchAll(/<path[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => tag.includes('class="abcjs-notehead"'))
      .map((tag) => Number(/\sd="M ([-\d.]+)/.exec(tag)?.[1]));
    expect(xs.length).toBeGreaterThan(3);
    expect(((xs[1] ?? 0) - (xs[0] ?? 0)) * toPx).toBeCloseTo(42.43, 1);
  });

  it("pads to the requested page width PLUS abcjs's own margins", () => {
    // abcjs's page is the staff width plus `padding.left` and `.right` — 15 each on screen
    // (`write/renderer.js:69-72`). CORRECTED: this asserted the staff width itself, and
    // every golden says otherwise — `dump-svg.js` renders at `staffwidth: 670` and abcjs
    // writes `width="700"`. Named by the byte table, which differed on that attribute for
    // all 171 fixtures.
    const svg = renderAll(fixture("clefs"), { staffwidth: 740 })[0]?.svg ?? "";
    expect(/width="([\d.]+)"/.exec(svg)?.[1]).toBe("770");
  });

  it("parses in strict mode, reproducing abcjs rather than correcting it", () => {
    // `+:` is a continuation in ABC 2.1 and NOT implemented by abcjs, which parses the
    // line as music. A compat layer must do what abcjs does, oddities included.
    const abc = "X:1\nL:1/4\nT:T\n+:more CDEF\nK:C\nGABc|\n";
    const notes =
      renderAll(abc)[0]?.score.voices[0]?.measures.flatMap((m) => m.events) ??
      [];
    expect(notes.length).toBeGreaterThan(4);
  });
});
