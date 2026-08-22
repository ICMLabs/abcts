import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

/**
 * **AN `&` OVERLAY PAD'S ENGRAVE-TIME FIELDS, ON THE OBJECT A HOST READS.**
 *
 * A pad has TWO creators — the parser back-fills the MODEL through `padOverlays`, the
 * projection back-fills `tune.lines` through the same `resolveOverlays` pass — and until
 * `linesOf` joined them the drawing stamped `averagepitch` onto an object it synthesized
 * for itself, so the published pad carried none at all. Nothing else in the repo compares
 * a RENDERED tune's OBJECT (`scripts/zzrv.ts` measures it and is not a gate), and the byte
 * gate cannot see it: a pad is an INVISIBLE rest and draws nothing.
 *
 * The values are abcjs 6.7.0's own, harvested by running it on this fixture.
 * ⚠️ **THE TWO ARE NOT ONE NUMBER**: `resolveOverlays` splices a `{stem, down}` onto the
 * voice it CREATES, so the line the layer sings on reads 3 where the lines it only pads —
 * which get bars and invisible rests alone — take the default `restpitch` 7.
 */
const EXPECTED = [
  "L0/s0/v1/0: 7",
  "L0/s0/v1/2: 7",
  "L0/s0/v2/0: 7",
  "L0/s0/v2/2: 7",
  "L1/s0/v2/0: 7",
  "L1/s0/v2/2: 7",
  "L3/s0/v1/1: 3",
  "L4/s0/v1/1: 3",
  "L4/s0/v1/3: 3",
  "L4/s0/v1/7: 3",
];

describe("an `&` overlay pad", () => {
  it("carries abcjs's own rest pitch on the published element", () => {
    const file = join(
      import.meta.dirname,
      "corpus-abcjs",
      "fixtures",
      "abcjs-synth-flattener-21-c4-d4.abc",
    );
    const tune = renderAbc(["*"], readFileSync(file, "utf-8"), {
      staffwidth: 670,
    })[0];
    const rows: string[] = [];
    (tune?.lines ?? []).forEach((line, l) =>
      (line.staff ?? []).forEach((staff, s) =>
        staff.voices.forEach((voice, v) =>
          voice.forEach((el, i) => {
            if (el.el_type === "note" && el.rest?.type === "invisible")
              rows.push(`L${l}/s${s}/v${v}/${i}: ${String(el.averagepitch)}`);
          }),
        ),
      ),
    );
    expect(rows).toEqual(EXPECTED);
  });
});
