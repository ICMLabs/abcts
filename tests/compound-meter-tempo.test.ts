/**
 * **THE EIGHTH-DENOMINATOR TEMPO BYTE, ACROSS THE METERS abcjs's COMPOUND FIX SINGLES OUT.**
 *
 * `midi-file.ts` carries a `ponytail:` saying abcjs's compound-meter fix is not ported —
 * `if (time.den === 8 && time.num !== 5 && time.num !== 7)` recomputes the tempo from
 * `millisecondsPerMeasure()`, a method on a laid-out tune that this engine does not have
 * (`synth/create-midi.js`, "MAE 7 July 2024"). Its own trigger was "the table will say so
 * when a 6/8 case turns up", and none of the three harvested cases is in 6/8.
 *
 * Measured 2026-09-16 against abcjs 6.7.0 in WebKit, over **28 meter × tempo combinations**
 * — 6/8, 9/8, 12/8, 3/8 (the rule's own meters), 5/8 and 7/8 (its exclusions) and 4/4, each
 * with `Q:1/4=120`, `Q:3/8=60`, `Q:1/8=200` and no `Q:` at all. **Every one is byte-identical
 * through `getMidiFile`**, so nothing the unported branch would change is reachable on that
 * path. The bytes below are abcjs's own.
 *
 * ⚠️ This does NOT say the branch is unreachable everywhere — only that `getMidiFile` does
 * not expose it. A sharper control would have to make abcjs's OWN byte move between an
 * eighth-denominator meter and a `4/4` one at the same `Q:`, and none of the 28 does.
 */
import { describe, expect, it } from "vitest";

import { synth } from "../src/compat/index.js";

const tempoByte = (abc: string): string => {
  const r = synth.getMidiFile(abc, { midiOutputType: "encoded" });
  const s = Array.isArray(r) ? (r[0] as string) : (r as string);
  return (/%FF%51%03(%[0-9a-fA-F]{2}){3}/.exec(s) ?? ["—"])[0];
};

const tune = (meter: string, q: string): string =>
  `X:1\nM:${meter}\nL:1/8\n${q ? `Q:${q}\n` : ""}K:C\nCDE FGA|\n`;

describe("an eighth-denominator meter's MIDI tempo is abcjs's", () => {
  it.each([
    ["1/4=120", "%FF%51%03%07%a1%20"],
    ["3/8=60", "%FF%51%03%0a%2c%2b"],
    ["1/8=200", "%FF%51%03%09%27%c0"],
    ["", "%FF%51%03%05%16%15"],
  ])("writes abcjs's byte for 6/8 at Q:%s", (q, expected) => {
    expect(tempoByte(tune("6/8", q))).toBe(expected);
  });

  it("writes the same byte for the rule's meters as for its exclusions", () => {
    const at = (m: string) => tempoByte(tune(m, "1/4=120"));
    // 6/8, 9/8, 12/8 and 3/8 take abcjs's compound branch; 5/8 and 7/8 are excluded from
    // it by name and 4/4 never reaches it. On this path they all agree — which is the
    // measurement, not an assumption.
    for (const m of ["9/8", "12/8", "3/8", "5/8", "7/8", "4/4"])
      expect(at(m)).toBe(at("6/8"));
  });

  /**
   * ⭐ **THE BREAK.** Every row above is an equality, and the first version of this probe
   * passed with a byte that never moved at all. The meter DOES reach the default tempo:
   * 3/8 with no `Q:` is a different byte from 6/8 with no `Q:` — in abcjs too.
   */
  it("moves with the meter when there is no Q: to fix it", () => {
    expect(tempoByte(tune("3/8", ""))).toBe("%FF%51%03%03%64%0e");
    expect(tempoByte(tune("6/8", ""))).toBe("%FF%51%03%05%16%15");
  });
});
