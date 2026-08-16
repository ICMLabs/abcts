/**
 * LINE WEIGHTS vs abcjs — the gate the pixel gate cannot be.
 *
 * `pixel-parity.test.ts` compares glyph bounding-box CENTRES, and a line's centre does not
 * move when its thickness changes. `baseline.test.ts` records our own geometry, so it locks
 * in whatever we already draw. Between them they let `abcjs-strict` draw a thin barline at
 * 1.24px for weeks where abcjs draws 0.600 — Bravura's `ENGRAVING_DEFAULTS`, ungated, at 21
 * sites. Nothing was wrong with either gate; they were both blind to the same axis.
 *
 * This measures the axis directly: for each class of line, the THICKNESS of the quad each
 * engine emits, resolved to absolute pixels.
 *
 * `abcjs-strict` has no latitude — it exists to reproduce abcjs byte for byte — so these
 * are equalities, not ceilings. `abc2.1` and `extended` keep Bravura's weights and are
 * deliberately not measured here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { absolutePixels } from "./pixel-geometry.js";

const corpusDir = "../abcMusicKit/Tools/abcjs-debug/fixtures";
const goldensDir = "../abcMusicKit/Tools/abcjs-debug/golden";

/**
 * The thinnest dimension of every element carrying `needle` in its class — a line's
 * thickness is its short axis, whichever way it runs.
 *
 * Rounded to a thousandth: abcjs itself writes staff lines through
 * `roundNumber` (2dp of a pixel), so anything finer is noise on its side.
 */
function thicknesses(svg: string, needle: string): number[] {
  const doc = absolutePixels(svg);
  return [
    ...new Set(
      doc.items
        .filter((item) => item.cls.includes(needle) && item.w !== undefined)
        .map(
          (item) =>
            Math.round(Math.min(item.w as number, item.h as number) * 1000) /
            1000,
        ),
    ),
  ].sort((a, b) => a - b);
}

const render = (name: string): string =>
  renderAll(readFileSync(join(corpusDir, `${name}.abc`), "utf-8"), {})[0]
    ?.svg ?? "";
const golden = (name: string): string =>
  readFileSync(join(goldensDir, `${name}.svg`), "utf-8");

describe("line weights match abcjs in strict mode", () => {
  // One fixture per class, chosen for having the thing and little else.
  const CASES: readonly { fixture: string; cls: string; what: string }[] = [
    // abcjs marks only the FIRST staff line, with `abcjs-top-line`; the other four carry
    // no class at all and the group holds `abcjs-staff`. So the top line is the one both
    // engines label, and it is enough — the five are drawn by one call.
    { fixture: "simple-c", cls: "top-line", what: "staff line" },
    { fixture: "simple-c", cls: "ledger", what: "ledger line" },
    { fixture: "simple-c", cls: "stem", what: "stem" },
    // NOT ONE STEM WEIGHT BUT THREE SOURCES OF TWO. `simple-c` has only unbeamed stems, so
    // it reports `[1]` and cannot tell the axis apart from a constant. abcjs writes
    // `linewidth: ±1` for an unbeamed stem (`abstract-engraver.js:748`) and `±0.6` for both
    // a BEAMED one (`layout/beam.js:122`) and a tempo mark's beat-unit note
    // (`tempo-element.js:56`) — so the set is the discriminator, and each fixture below
    // holds a different mix of the two.
    //
    // All three were wrong when this case was written, and none of the existing gates could
    // say so: a stem is not a notehead, so `pixel-parity` never looks at one, and the
    // fixture the thickness gate did have has no beams and no `Q:`.
    {
      fixture: "two-voice-invention",
      cls: "stem",
      what: "beamed and unbeamed stems",
    },
    // Beams AND a `Q:` — the tempo note is its only thin stem outside the beams.
    {
      fixture: "happy-birthday",
      cls: "stem",
      what: "a tempo mark's beat-unit stem",
    },
    // Every note beamed, so a stray unbeamed weight has nowhere to hide.
    { fixture: "ragtime-mini", cls: "stem", what: "an all-beamed tune" },
  ];

  for (const { fixture, cls, what } of CASES) {
    it(`${what}`, () => {
      const theirs = thicknesses(golden(fixture), cls);
      const ours = thicknesses(render(fixture), cls);
      expect(
        theirs.length,
        `no ${what} in the golden — the probe is measuring nothing`,
      ).toBeGreaterThan(0);
      expect(ours.length, `no ${what} in our output`).toBeGreaterThan(0);
      // Compare the SET of distinct thicknesses, so an engine drawing two weights where the
      // other draws one is a failure rather than an average.
      expect(ours).toEqual(theirs);
    });
  }

  // SEPARATION IS A DIFFERENT AXIS FROM THICKNESS, and the thickness gate above cannot see
  // it: two rules of the right weight in the wrong places pass every assertion in this file
  // until this one. abcjs's barline cursor is FIVE hardcoded numbers rather than one
  // separation (`abstract-engraver.js:985-1030`), so the gaps are asymmetric — thin→thick
  // is `4 - 0.6` and thick→thin is `5 + 3 - 4` — and a single constant cannot produce them.
  it("barline separations", () => {
    const gaps = (svg: string): number[] => {
      const doc = absolutePixels(svg);
      const bars = doc.items
        .filter((item) => item.name === "bar" && item.w !== undefined)
        .map((item) => ({
          left: item.x - (item.w as number) / 2,
          w: item.w as number,
        }))
        .sort((a, b) => a.left - b.left);
      const out: number[] = [];
      for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1];
        const here = bars[i];
        if (prev === undefined || here === undefined) continue;
        const gap = here.left - (prev.left + prev.w);
        // Only pairs that belong to ONE barline; anything further apart is a whole measure.
        if (gap >= 0 && gap < 6) out.push(Math.round(gap * 100) / 100);
      }
      return out;
    };
    const theirs = gaps(golden("S4-bars-repeats-tune0"));
    const ours = gaps(render("S4-bars-repeats"));
    expect(
      theirs.length,
      "no adjacent barline rules in the golden",
    ).toBeGreaterThan(0);
    expect(ours).toEqual(theirs);
  });

  // A REPEAT ENDING IS INVISIBLE TO EVERY OTHER GATE, and it was wrong on four axes at once.
  // It is not a notehead, so `pixel-parity` never looks at it; it is not classed `stem`,
  // `ledger` or `top-line`, so the thickness cases above never look at it; and abcjs draws
  // the whole bracket as ONE `<path>` with `data-name="line"`, so the barline case cannot
  // reach it either. Four figures out of `drawEnding` (`draw/ending.js:8-46`), all measured
  // against `S4-bars-repeats`' golden:
  //
  //   hook `height = 20`          | ours was 1.4 spaces, 10.85px — very nearly half
  //   rules at SVG's default 1px  | ours was the thin barline's 0.6, a right weight
  //                               |   borrowed for the wrong line
  //   label at `linestartx + 5`   | ours was 0.4 spaces, 3.1px
  //   label in `repeatfont`, 17px | ours was 1.3 spaces, 10.07px
  //
  // THE HOOK COULD ONLY LAND ONCE THE LANE DID, and that ordering is the durable lesson.
  // abcjs's 20px hook clears the staff only because abcjs's bracket sits 29.93px above the
  // top line where ours sat 15.5; ported on its own it put the hook 4.5px INSIDE the staff,
  // and the "clear of the music" case in `layout.test.ts` said so at once. The two numbers
  // were COMPENSATING, so they were one port rather than two — a correct constant is not
  // always an improvement.
  //
  // `anchorVoltas` hangs the bracket off the lane it already reserved, which took the
  // bracket's pitch from 14.44px out to 0.50 and let the hook and the label size follow.
  // The 0.50 that remains is not the ending at all: our staff's ink top reads 13.85 pitch
  // where abcjs's dumped `staff.top` is 13.7244, and the bracket simply rides on it.
  //
  // THE ENDS ARE ANCHORED ON THE BARLINE RULES NOW, and they are exact on both brackets:
  // `[257.37..472.18] [476.18..681.00]` in both engines. abcjs opens at
  // `anchor1.x + anchor1.w` and closes at `anchor2.x` — the right edge one way and the left
  // edge the other — where `anchor` is whichever RULE the barline cursor was holding
  // (`draw/ending.js:13-22`, `abstract-engraver.js:1017/1040`). We anchored on the
  // measure's first ink, a flat 28.5px out, which is exactly the `textWidth + 10` the
  // ending's own `minspacing` adds.
  //
  // The 0.50px of bracket pitch that remains is NOT the ending: our staff's ink top reads
  // 13.85 pitch where abcjs's dumped `staff.top` is 13.7244, and the bracket rides on it.
  it("a repeat ending", () => {
    const ends = (
      svg: string,
    ): {
      hook: number;
      rule: number;
      left: number;
      right: number;
      top: number;
    }[] => {
      const doc = absolutePixels(svg);
      const parts = doc.items.filter(
        (i) =>
          (i.name === "line" || i.cls.includes("ending")) &&
          i.w !== undefined &&
          i.h !== undefined,
      );
      // abcjs emits one path per bracket; we emit a rule per stroke. Either way the
      // bracket's own box is the union, its hook is the tallest piece, and its rule weight
      // is the thinnest dimension present.
      const hook = Math.max(...parts.map((i) => i.h as number));
      const rule = Math.min(
        ...parts.map((i) => Math.min(i.w as number, i.h as number)),
      );
      // THE SPAN COMES OFF THE HORIZONTAL RULE, not off the union. abcjs's bracket is one
      // stroked path whose box is its `d` coordinates, with no stroke width in it; ours is
      // a rect per stroke, so a 1px-wide HOOK reaches half a pixel further left than the
      // bracket actually starts. Taking the horizontal-dominant pieces asks both engines
      // for the same quantity — the run between the two hooks.
      const runs = parts.filter((i) => (i.w as number) > (i.h as number));
      const left = Math.min(...runs.map((i) => i.x - (i.w as number) / 2));
      const right = Math.max(...runs.map((i) => i.x + (i.w as number) / 2));
      const top = Math.min(...parts.map((i) => i.y - (i.h as number) / 2));
      return [
        {
          hook: r2(hook),
          rule: r2(rule),
          left: r2(left),
          right: r2(right),
          top: r2(top),
        },
      ];
    };
    const r2 = (n: number): number => Math.round(n * 100) / 100;
    const theirs = ends(golden("S4-bars-repeats-tune0"))[0];
    const ours = ends(render("S4-bars-repeats"))[0];
    expect(
      theirs,
      "no ending in the golden — the probe is measuring nothing",
    ).toBeDefined();
    if (theirs === undefined || ours === undefined) return;
    // NOT compared against `theirs.rule`, and the reason is this file's own lesson one turn
    // further on: abcjs draws the whole bracket as ONE stroked path, so its box's short
    // axis is the hook's 20 and its stroke weight is not in the geometry AT ALL — the
    // markup carries no `stroke-width`, which is what makes it SVG's default 1. A
    // representation that cannot express the quantity cannot be asked for it, so the 1 is
    // read from the golden's attributes and asserted here on our side only.
    // CORRECTED, and by this file's own lesson: the line above used to read
    // `expect(ours.rule).toEqual(1)` because OUR bracket was a rect per stroke and abcjs's
    // was one stroked path — so the two engines had different representations and only
    // ours could be asked for a weight. Ours is one stroked path now too, so the number is
    // the same quantity on both sides and the WEIGHT is not in the geometry for either:
    // it is SVG's default 1, which is what writing no `stroke-width` MEANS. Assert that,
    // and assert the boxes agree.
    expect(render("S4-bars-repeats")).toMatch(/data-name="line"/);
    expect(
      /<path[^>]*data-name="line"[^>]*stroke-width/.test(
        render("S4-bars-repeats"),
      ),
      "an ending rule must paint at SVG's default 1, as abcjs's does",
    ).toBe(false);
    expect(ours.rule, "bracket rule weight").toEqual(theirs.rule);
    expect(ours.hook, "end-hook drop").toEqual(theirs.hook);
    expect(ours.left, "bracket left edge").toEqual(theirs.left);
    expect(ours.right, "bracket right edge").toEqual(theirs.right);
    // CEILING: still open, and it must only ever come DOWN. It is the staff's ink top
    // rather than anything the ending does.
    expect(
      Math.abs(ours.top - theirs.top),
      "bracket pitch",
    ).toBeLessThanOrEqual(0.5);
  });

  // THE THREE CONSTRUCTIONS THAT HAD NO HANDLE AT ALL until finding 92 — a triplet
  // bracket, a hairpin and a group bracket. A probe asking both engines for them returned
  // abcjs's geometry and NOTHING from ours, because we emitted neither a class nor a
  // `data-name` any comparison could match on. These are the figures that came out of them
  // once the question could be put at all.
  //
  // Each is compared as a SCALAR against abcjs's own stated figure rather than against the
  // golden's geometry, and for the reason the ending case gives one block up: abcjs draws
  // each of these as one stroked path, so its box carries the shape and not the weight.
  // Each case names WHICH axis of the vertical piece it wants. A hook and a rule are both
  // upright rectangles, so `length` and `weight` are the two dimensions of the same shape
  // and no heuristic can tell which one a number is meant to be — the first attempt tried
  // "whichever of min and max is nearer the expectation" and cheerfully matched a 0.775px
  // rule weight against a 5px hook.
  const scalars: readonly {
    fixture: string;
    tune: number;
    name: string;
    what: string;
    axis: "length" | "weight";
    is: number;
  }[] = [
    // `bracketHeight = ±5` (`draw/triplet.js:24`). Ours was 0.6 spaces, 4.65px.
    {
      fixture: "S3-note-syntax",
      tune: 6,
      name: "triplet-bracket",
      what: "a triplet hook",
      axis: "length",
      is: 5,
    },
    // `xLineWidth = spacing.STEP * 0.75` (`draw/brace.js:20`) — 2.906px, and a LINE WEIGHT
    // reachable in strict, which is the audit finding's own class. Ours was 0.5 spaces.
    {
      fixture: "S7-voices",
      tune: 5,
      name: "bracket",
      what: "a group bracket rule",
      axis: "weight",
      is: 2.906,
    },
  ];
  for (const { fixture, tune, name, what, axis, is } of scalars) {
    it(what, () => {
      const doc = absolutePixels(
        renderAll(readFileSync(join(corpusDir, `${fixture}.abc`), "utf-8"), {})[
          tune
        ]?.svg ?? "",
      );
      // UPRIGHT pieces only — a triplet's horizontal run and a bracket's two arms are the
      // same `data-name` and would otherwise be averaged in.
      // **A BRACKET IS ONE PATH WITH EVERY SEGMENT IN ITS `d` NOW, AS ABCJS'S ALWAYS
      // WAS** — so its BOX is the whole shape and no filter over boxes can reach a hook.
      // The segments are read out of the `d` instead, which is a question both engines can
      // answer and the one this gate exists to ask. Falls back to the box for a name still
      // drawn as one rect per stroke.
      const svg =
        renderAll(readFileSync(join(corpusDir, `${fixture}.abc`), "utf-8"), {})[
          tune
        ]?.svg ?? "";
      const segments: { w: number; h: number }[] = [];
      for (const m of svg.matchAll(/<path[^>]*data-name="([^"]*)"[^>]*>/g)) {
        const tag = m[0];
        if (m[1] !== name) continue;
        const d = /\sd="([^"]*)"/.exec(tag)?.[1] ?? "";
        for (const seg of d.matchAll(
          /M\s*(-?[\d.]+)\s+(-?[\d.]+)\s*L\s*(-?[\d.]+)\s+(-?[\d.]+)/g,
        )) {
          segments.push({
            w: Math.abs(Number(seg[3]) - Number(seg[1])),
            h: Math.abs(Number(seg[4]) - Number(seg[2])),
          });
        }
        // **AND abcjs's BRACKET RULE IS A CLOSED RECT IN RELATIVE COMMANDS** —
        // `M x y l 0 H l W 0 l 0 -H z` (`draw/brace.js:24-29`) — so its WEIGHT is the
        // horizontal run's `W` and its LENGTH the vertical run's `H`. Nothing in the
        // absolute `L` form above can express that, and reading the path's BOX instead
        // gives the whole bracket including its two arms: 10.66 for a 2.906 rule. The
        // third time this file has had to widen because our markup became abcjs's.
        for (const seg of d.matchAll(
          /M\s*(?:-?[\d.]+)\s+(?:-?[\d.]+)\s*l\s*0\s+(-?[\d.]+)\s*l\s*(-?[\d.]+)\s+0/g,
        )) {
          segments.push({
            w: Math.abs(Number(seg[2])),
            h: Math.abs(Number(seg[1])),
          });
        }
      }
      // …and the fallback is keyed on the SEGMENTS FOUND, not on the path existing: a group
      // bracket is one path of curves whose only straight runs are horizontal, so parsing
      // it yields segments and none of them upright.
      const upright = segments.filter((sg) => sg.h > sg.w);
      const hits =
        upright.length > 0
          ? upright
          : doc.items.filter(
              (i) =>
                i.name === name &&
                i.w !== undefined &&
                i.h !== undefined &&
                (i.h as number) > (i.w as number),
            );
      expect(
        hits.length,
        `no upright ${what} in our output — the handle is missing again`,
      ).toBeGreaterThan(0);
      const got = hits.map((i) =>
        axis === "length" ? (i.h as number) : (i.w as number),
      );
      // Every one of them, so a single stray piece is a failure rather than an average.
      //
      // **abcjs ROUNDS EVERY PATH COORDINATE TO TWO DECIMALS** (`roundNumber`), and compat
      // now does too. So a rule of declared weight 2.906 is DRAWN 2.9 or 2.91 depending on
      // where it sits — by abcjs exactly as much as by us — and a comparison against the
      // DECLARED figure has to allow that: two edges, each rounded, is up to 0.01. This is
      // quantisation in the shared output format, not a tolerance on the constant.
      for (const g of got)
        expect(
          Math.abs(g - is),
          `${what} drawn ${g}, declared ${is}`,
        ).toBeLessThanOrEqual(0.011);
    });
  }

  it("the probe can fail — it is not measuring a constant", () => {
    // The canary the pixel gate has and this one needs for the same reason: a comparison
    // that returns the same number for everything reports coverage it does not have.
    const staff = thicknesses(golden("simple-c"), "staff");
    const stem = thicknesses(golden("simple-c"), "stem");
    expect(staff).not.toEqual(stem);
  });
});
