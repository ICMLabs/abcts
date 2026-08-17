/**
 * WHERE A DECORATION SITS **HORIZONTALLY** — the axis no gate in this repo could express,
 * and it was out by up to 10.83px on every ornament in every tune.
 *
 * ── WHY NOTHING COULD SEE IT ────────────────────────────────────────────────
 * `pixel-parity` and the harvested table compare elements abcjs CLASSES, and abcjs classes
 * a notehead, a stem, a ledger and the top staff line — a decoration carries no class at
 * all. `glyph-ycorr` and `above-lane-order` are ladders of controls that measure Y, because
 * each was built to name a vertical defect. So the X of every decoration was unmeasured,
 * which is the same shape as the line weights (a centre cannot see a thickness) and the
 * tempo notehead (no class, so no row could exist).
 *
 * ── AND A CANARY FOUND IT, NOT A SEARCH ─────────────────────────────────────
 * The control that named it was written to prove something else: an opening-barline
 * transfer needed a rung showing the same coda on a NOTE, and the boring rung disagreed
 * with abcjs by nine pixels.
 *
 * ── THE THREE RULES IT MEASURES ─────────────────────────────────────────────
 * 1. **The half-width shift is conditional.** `deltaX = width / 2`, then
 *    `if (getSymbolAlign(symbol) !== "center") deltaX -= getSymbolWidth(symbol) / 2`
 *    (`creation/decoration.js:44-48` and the identical pair at `:156-159`). The align is a
 *    RULE, not a table: every `scripts.*` glyph is centred EXCEPT `scripts.roll`
 *    (`creation/glyphs.js:166-172`). We subtracted for all of them.
 * 2. **The `width` is the head's DECLARED width**, `(notehead) ? notehead.w : 0`
 *    (`abstract-engraver.js:842`) — abcjs's figure, not Bravura's outline, which is 1.90px
 *    narrower on a whole note and put every mark 0.95 left.
 * 3. **A barline hands it 3 or 1**, not the bar's drawn width:
 *    `createDecoration(voice, elem.decoration, 12, (thick) ? 3 : 1, …)`
 *    (`abstract-engraver.js:1002`).
 *
 * …and a fourth, which is a different code path entirely: **a DYNAMIC is not a decoration.**
 * `volumeDecoration` builds a `DynamicDecoration` for `voice.addOther`, and `drawDynamics`
 * calls `printSymbol(renderer, params.anchor.x, …)` (`draw/dynamics.js:8`) — the anchor's
 * own x, with no `deltaX` and no width arithmetic at all. Measured on a pair: a whole note
 * and a quarter put their heads at 78.36 and 75.78 and abcjs draws the `p` at 74.21 for
 * both, because both heads' LEFT edges are 70.86. An accidental does not move it and
 * neither does a grace.
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 * Each mark's x relative to the NEAREST notehead, which both engines already agree on
 * (the harvested table is 0 of 174 on that axis). Figures are abcjs 6.7.0's own, read out
 * of its SVG through the same `absolutePixels` walk the pixel gate uses, so the two sides
 * are measured identically.
 *
 * One decoration per tune, so nothing stacks and a difference can only be that glyph's own.
 */
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { absolutePixels } from "./pixel-geometry.js";

const EPSILON = 0.05;
const HEAD = "X:1\nM:4/4\nL:1/4\nK:C\n";

/**
 * `[name, body, abcjs's offsets]`.
 *
 * `roll` is the ONE `scripts.*` glyph abcjs does not centre, and its −1.711 against the
 * centred glyphs' −0.022 is the whole of rule 1 in one pair of rungs. `trill` and `segno`
 * are neither: their outlines are simply not symmetric about their own origin, which is
 * why the expected figures are measured rather than derived.
 */
const RUNGS: readonly (readonly [string, string, readonly number[]])[] = [
  // ── Rule 1: centre-aligned `scripts.*`, which is all of them but one ──
  ["fermata", "!fermata!C4|", [-0.022]],
  ["coda", "!coda!C4|", [-0.022]],
  ["segno", "!segno!C4|", [0.098]],
  ["trill", "!trill!C4|", [-0.758]],
  ["upbow", "!upbow!C4|", [-0.022]],
  ["turn", "!turn!C4|", [-0.022]],
  ["mordent", "!lowermordent!C4|", [-0.022]],
  ["accent", "!accent!C4|", [-0.022]],
  ["tenuto", "!tenuto!C4|", [-0.022]],
  // THE EXCEPTION, and the rung that makes the gate a ladder rather than a list.
  ["roll", "!roll!C4|", [-1.711]],
  // ── Rule 2: the head's DECLARED width, which changes with the head ──
  ["quarter-head", "!fermata!C|", [-0.03]],
  ["half-head", "!fermata!C2|", [-0.005]],
  // ── Rule 3: a barline hands it 3 or 1, never its drawn width ──
  ["bar-close-thin", "CCC!coda!C|", [-0.03]],
  ["bar-close-repeat", "CCC!coda!C:|", [-0.03]],
  ["bar-open-repeat", '!coda!|:"G"G4|', [-38.242]],
  ["bar-open-thickthin", '!coda![|"G"G4|', [-35.242]],
];

/**
 * THE DYNAMICS ARE A SEPARATE LIST WITH A CEILING, and the ceiling is an OUTLINE.
 *
 * The anchor is exact — abcjs's `params.anchor.x`, ported — but strict still draws
 * Bravura's `dynamicPiano`, whose ink is 14.10 wide against abcjs's `p` at 14.82. Two
 * different shapes cannot have the same centre AND the same left edge, so a residual is
 * the only possible answer until the glyph itself is abcjs's. Recorded rather than
 * hidden: the handoff already lists the dynamic glyph under WHAT NOT TO CHASE.
 *
 * The rungs still earn their place — they are what proves the ANCHOR, which moves with the
 * head on a wrong rule and does not on the right one. `dyn-quarter` is the proof: abcjs
 * draws the `p` at the same absolute x under a quarter head as under a whole one.
 */
const DYNAMIC_RUNGS: readonly (readonly [string, string, readonly number[]])[] =
  [
    ["dyn-plain", "!p!C4|", [-4.155]],
    ["dyn-sharp", "!p!^C4|", [-13.64, -4.155]],
    ["dyn-grace", "!p!{d}C4|", [-4.155]],
    ["dyn-quarter", "!p!C|", [-1.575]],
  ];
/** The measured outline residual, in px. Lower it when the glyph becomes abcjs's. */
const DYNAMIC_CEILING = 0.94;

/** Every unclassed glyph clear of the staff, by its x relative to the nearest notehead. */
function marks(abc: string): number[] {
  const doc = absolutePixels(
    renderAll(HEAD + abc + "\n", { staffwidth: 670 })[0]?.svg ?? "",
  );
  const top = doc.items.find((i) => i.cls.includes("top-line"))?.y ?? 0;
  const heads = doc.items
    .filter((i) => i.cls.includes("abcjs-notehead"))
    .map((i) => i.x);
  return doc.items
    .filter(
      (i) =>
        i.tag === "path" &&
        i.name !== "ledger" &&
        !i.cls.includes("notehead") &&
        (i.y - top < -3 || i.y - top > 34),
    )
    .map(
      (m) =>
        m.x -
        heads.reduce(
          (a, b) => (Math.abs(b - m.x) < Math.abs(a - m.x) ? b : a),
          1e9,
        ),
    );
}

describe("a decoration sits where abcjs puts it, horizontally", () => {
  for (const [name, abc, want] of RUNGS) {
    it(`${name} — ${abc}`, () => {
      const got = marks(abc);
      expect(got.length).toBe(want.length);
      got.forEach((x, i) => {
        expect(Math.abs(x - (want[i] as number))).toBeLessThan(EPSILON);
      });
    });
  }

  for (const [name, abc, want] of DYNAMIC_RUNGS) {
    it(`${name} — ${abc} (anchor exact, outline within ${DYNAMIC_CEILING})`, () => {
      const got = marks(abc);
      expect(got.length).toBe(want.length);
      got.forEach((x, i) => {
        expect(Math.abs(x - (want[i] as number))).toBeLessThanOrEqual(
          DYNAMIC_CEILING,
        );
      });
    });
  }
});
