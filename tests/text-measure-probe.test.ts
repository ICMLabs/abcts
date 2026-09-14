/**
 * **THE PROBE THE LIVE MEASURER BUILDS, ATTRIBUTE BY ATTRIBUTE.**
 *
 * `createDomTextMeasurer` is abcjs's `Svg.prototype.getTextSize` over its own `text` builder
 * (`write/svg.js`), and what it PUTS ON THE ELEMENT is the measurement: a browser's ink box
 * depends on the font, on the x — a fractional one measures 1/64 wider — and on the
 * `text-anchor`, which starts the run half a width left of the same x.
 *
 * The DOM is stubbed rather than mocked away: `tsconfig.json` has no `dom` lib and this file
 * satisfies the four structural interfaces the measurer declares, which is all it touches.
 * Nothing here measures anything — `getBBox` is the stub's — and that is the point: the rule
 * under test is which attributes reach the node.
 */
import { describe, expect, it } from "vitest";
import { createDomTextMeasurer } from "../src/renderer/text-measure.js";

interface FakeEl {
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly children: FakeEl[];
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeEl): void;
  removeChild(child: FakeEl): void;
  getBBox(): { width: number; height: number };
}

const fakeEl = (tag: string): FakeEl => ({
  tag,
  attrs: {},
  children: [],
  textContent: null,
  setAttribute(name, value) {
    this.attrs[name] = value;
  },
  appendChild(child) {
    this.children.push(child);
  },
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
  },
  getBBox: () => ({ width: 0, height: 0 }),
});

const built = (): { measure: ReturnType<typeof createDomTextMeasurer>; seen: FakeEl[] } => {
  const seen: FakeEl[] = [];
  const doc = {
    createElementNS: (_ns: string, tag: string) => {
      const el = fakeEl(tag);
      seen.push(el);
      return el;
    },
  };
  const host = { appendChild: () => {}, removeChild: () => {} };
  return { measure: createDomTextMeasurer(doc, host), seen };
};

describe("the measured probe carries what the drawing will carry", () => {
  it("puts the font, the x and the anchor on the element", () => {
    const { measure, seen } = built();
    measure("G♭maj7", {
      size: 53,
      family: "Arial",
      weight: "normal",
      style: "normal",
      x: 207.36,
      anchor: "middle",
      // Out of the shared cache, so a second case here cannot be served this one's answer.
      transient: true,
    });
    const text = seen.find((e) => e.tag === "text");
    expect(text?.attrs).toEqual({
      stroke: "none",
      x: "207.36",
      "font-size": "53",
      "font-family": "Arial",
      "font-weight": "normal",
      "font-style": "normal",
      "text-anchor": "middle",
    });
  });

  /**
   * ⚠️ **AND NOTHING IS WRITTEN WHERE THE CALLER SAID NOTHING.** abcjs's own x = 0 probe has
   * neither an x nor an anchor (`helpers/get-text-size.js`), and only the measurement of a
   * node it already DREW has both — so a measurer that defaulted either would be measuring
   * something abcjs does not.
   */
  it("writes no anchor and no x when the caller gave none", () => {
    const { measure, seen } = built();
    measure("G", { size: 13, family: "Arial", transient: true });
    const text = seen.find((e) => e.tag === "text");
    expect(text?.attrs["text-anchor"]).toBeUndefined();
    expect(text?.attrs["x"]).toBeUndefined();
  });
});
