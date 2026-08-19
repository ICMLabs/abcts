import type { DrawnElement } from "../renderer/svg.js";

import { abcelemOf, type ProjectionIndex } from "./selectables.js";

/**
 * **`engraver.rangeHighlight(start, end)` — WHAT AN EDITOR PAINTS RED.**
 *
 * A line-by-line port of `write/interactive/selection.js:367`, plus the two one-liners it
 * reaches (`interactive/highlight.js`, `interactive/unhighlight.js`) and the four lines
 * that actually touch the DOM (`helpers/set-class.js`).
 *
 * **THE JOIN IS THE MARKUP, BECAUSE WE DO NOT DRAW THROUGH A DOM.** abcjs keeps the SVG
 * node on the absolute element — `params.elemset.push(g)` (`draw/absolute.js:57`) — and
 * highlights that one node. We emit a string, so the drawing records each group's
 * `data-name` and its ordinal among groups of that name (`DrawnElement`), and this finds
 * it again with `querySelectorAll`. Measured against abcjs in jsdom: highlighting a range
 * sets `fill="#ff0000"` and `class="abcjs-note_selected"` on the ELEMENT GROUP and on
 * nothing else, and clearing leaves `fill="currentColor"` with an EMPTY `class` attribute
 * still present — which is `String.replace` removing one substring and writing the result
 * back.
 *
 * Three rules that are abcjs's and would be wrong if intuited:
 *
 * - **A TEMPO IS NEVER HIGHLIGHTED.** `drawAbsolute`'s `isTempo` arm registers the group
 *   as a selectable and never pushes it into `elemset` (`draw/absolute.js:52-56`), so
 *   `setClass` walks an empty list. It is in the voice's children like everything else.
 * - **AN ELEMENT WITH NO SPAN NEVER MATCHES.** A clef, a key signature and a meter hang on
 *   the staff and carry no `startChar` at all, so abcjs's `end > elStart` is a comparison
 *   against `undefined` and false in both directions. Measured: selecting the whole tune
 *   paints every note and both barlines and leaves the two `staff-extra` groups alone.
 * - **A COLLAPSED CARET MATCHES ONE ELEMENT** — `(end === start) && end === elEnd`, the
 *   element that ENDS where the caret sits, so a caret at 0 matches nothing.
 */
const SELECTED_CLASS = "abcjs-note_selected";
const SELECTED_COLOR = "#ff0000";

/** The DOM this needs — narrow on purpose, so a Node host can supply a stub. */
export interface HighlightPaper {
  querySelectorAll(selector: string): ArrayLike<HighlightNode>;
}
export interface HighlightNode {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/**
 * `setClass(elemset, addClass, removeClass, color)` — `write/helpers/set-class.js`, whole.
 * The attribute painted is the node's own `highlight` when it has one, which is how a
 * stroked shape is highlighted without being filled.
 */
const setClass = (
  el: HighlightNode,
  addClass: string,
  removeClass: string,
  color: string,
): void => {
  const attr = el.getAttribute("highlight") ?? "fill";
  el.setAttribute(attr, color);
  let kls = el.getAttribute("class") ?? "";
  kls = kls.replace(removeClass, "");
  kls = kls.replace(addClass, "");
  if (addClass.length > 0) {
    if (kls.length > 0 && kls[kls.length - 1] !== " ") kls += " ";
    kls += addClass;
  }
  el.setAttribute("class", kls);
};

export interface RangeHighlighter {
  (start: number, end: number): void;
}

/**
 * Builds the closure the tune's `engraver` carries. Everything is read LAZILY through the
 * two thunks: the drawn records exist as soon as the markup does, but the paper element is
 * only known after `renderAbc` has assigned into it, and the projection is built on first
 * ask like every other one.
 */
export function rangeHighlighter(
  drawn: () => readonly DrawnElement[],
  projection: () => ProjectionIndex,
  paper: () => HighlightPaper | null,
  foregroundColor: string,
): RangeHighlighter {
  let selected: HighlightNode[] = [];
  return (start: number, end: number): void => {
    for (const el of selected) setClass(el, "", SELECTED_CLASS, foregroundColor);
    selected = [];
    const target = paper();
    if (target === null) return;
    const index = projection();
    // One query per distinct `data-name`, since the ordinal is per name.
    const byName = new Map<string, ArrayLike<HighlightNode>>();
    for (const record of drawn()) {
      if (record.element.type === "tempo") continue;
      const abcelem = abcelemOf(record.element, index);
      const elStart = abcelem?.startChar;
      const elEnd = abcelem?.endChar;
      if (typeof elStart !== "number" || typeof elEnd !== "number") continue;
      if (!((end > elStart && start < elEnd) || (end === start && end === elEnd)))
        continue;
      let nodes = byName.get(record.name);
      if (nodes === undefined) {
        nodes = target.querySelectorAll(
          `g[data-name="${cssEscape(record.name)}"]`,
        );
        byName.set(record.name, nodes);
      }
      const node = nodes[record.ordinal];
      if (node === undefined) continue;
      selected.push(node);
      setClass(node, SELECTED_CLASS, "", SELECTED_COLOR);
    }
  };
}

/** A `data-name` is engine-generated, but a `!class=…!` can put a quote in one. */
const cssEscape = (value: string): string => value.replace(/["\\]/g, "\\$&");
