import type { Score } from "../core/model.js";
import { layout } from "../renderer/layout.js";
import { UNIT_PX } from "../renderer/abcjs-constants.js";

import type { AbcLine } from "./lines.js";
import { VOICE_CHILD_TYPES } from "./voices-array.js";

/**
 * **`tuneMetrics(abc, params)` — HOW WIDE EACH MEASURE WANTS TO BE.**
 *
 * `getMeasureWidths` lays the tune out at width **0** and reads voice 0's bar positions
 * (`engraver-controller.js:139-170`). At that width every spring collapses and the rods are
 * all that is left, so the answer is each measure's MINIMUM — which is what a host sizing a
 * page from the music needs.
 *
 * **AND OUR PACKER ALREADY DOES IT.** The handoff said this needed a compress-to-minimum
 * mode we did not have, on the evidence that `systemWidth` 0, 1 and 670 all produced the
 * same natural spacing. That was the UNIT: abcjs's `width` is the STAFF width and ours is
 * the PAGE, so a caller asking for 0 has to ask us for `0 + 2 × padding`, exactly as
 * `renderAbc` converts every other width. Laid out at 30, `twinkle` reports
 * `70.035, 48.99, 59.24, 48.99` — abcjs's four numbers to the digit, and its `left` of
 * 49.051 with them.
 *
 * The width the solve is really given is `targetWidth = width + padding.left`
 * (`layout/layout.js:73`), so the last-line test reads `lineWidth / 15` rather than a
 * division by zero, and the solve then asks for a spacing so small that every element sits
 * on its rod.
 */
export interface MeasureSection {
  /** The x of the first child that is neither a clef nor a key signature. */
  left: number;
  measureWidths: number[];
  total: number;
}

/** abcjs's screen padding — the same 15 `renderAbc` adds either side. */
const PADDING = 15;

/**
 * The sections of one tune. **A SECTION IS A RUN OF STAFF LINES**: any line without one —
 * a subtitle, a `%%text` — closes the current section and the next staff line opens a new
 * one (`engraver-controller.js:145-152`).
 *
 * ⚠️ **AND `left` IS OVERWRITTEN BY EVERY LINE OF THE SECTION**, not just the first:
 * abcjs assigns it inside the per-line walk, so a section's `left` is its LAST line's.
 * Ported as written.
 */
export function measureWidthsOf(
  score: Score,
  lines: readonly AbcLine[],
): MeasureSection[] {
  /**
   * ⚠️ **AND `%%staffwidth` DOES NOT WIN HERE.** The directive beats the host's parameter
   * everywhere else — it is the tune saying how wide it wants to be — but `getMeasureWidths`
   * calls `layout(renderer, abcTune, 0, …)` with the width in hand
   * (`engraver-controller.js:139`), so a `%%staffwidth 200` tune still reports its MINIMUM.
   * Measured: `parse-tie-slur-01` reports `44.023` per measure where honouring the
   * directive gives `181.949`.
   */
  const doc = layout({ ...score, staffWidth: null }, {
    mode: "abcjs-strict",
    // abcjs's width 0, in our units: the PAGE is the staff width plus both margins.
    systemWidth: (0 + PADDING * 2) / UNIT_PX,
  });
  const out: MeasureSection[] = [];
  let section: MeasureSection | null = null;
  let systemIndex = 0;
  for (const line of lines) {
    if (line.staff === undefined) {
      section = null;
      continue;
    }
    const system = doc.systems[systemIndex];
    systemIndex += 1;
    if (system === undefined) continue;
    if (section === null) {
      section = { left: 0, measureWidths: [], total: 0 };
      out.push(section);
    }
    // "At this point, the voices are laid out so that the bar lines are even with each
    // other. So we just need to get the placement of the first voice." (`:167`)
    // **PROSE IS NOT A VOICE CHILD** — the same filter `makeVoicesArray` needs, and for the
    // same reason: a title sits in our element stream at x = 0 and would be taken for the
    // first non-staff-extra child, which is what `left` and every width are measured from.
    const voice = (system.staves[0]?.voices[0] ?? []).filter((el) =>
      VOICE_CHILD_TYPES.has(el.type),
    );
    let foundNotStaffExtra = false;
    let lastX = 0;
    for (const child of voice) {
      if (
        !foundNotStaffExtra &&
        child.type !== "clef" &&
        child.type !== "keySignature"
      ) {
        foundNotStaffExtra = true;
        section.left = child.x;
        lastX = child.x;
      }
      if (child.type === "bar") {
        section.measureWidths.push(child.x - lastX);
        section.total += child.x - lastX;
        lastX = child.x;
      }
    }
  }
  return out;
}
