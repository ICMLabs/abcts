import { describe, expect, it } from "vitest";

import { instrumentIndexToName, pitchToNoteName } from "../src/compat/synth.js";

/**
 * abcjs's two published tables, checked against the shape MEASURED out of its own files
 * rather than against a music-theory expectation — a host names a soundfont file with
 * these strings, so the spelling is the contract.
 */
describe("the synth tables", () => {
  it("names every pitch abcjs names, over its own range", () => {
    expect(Object.keys(pitchToNoteName)).toHaveLength(101);
    expect(pitchToNoteName[21]).toBe("A0");
    expect(pitchToNoteName[60]).toBe("C4");
    expect(pitchToNoteName[108]).toBe("C8");
    // **THE TABLE RUNS PAST AN 88-KEY PIANO**, to 121 — and it PREFERS FLATS all the way
    // up, so the last entry is `Db9` rather than `C#9`.
    expect(pitchToNoteName[121]).toBe("Db9");
    expect(pitchToNoteName[122]).toBeUndefined();
  });

  it("has 129 instruments, not 128", () => {
    expect(instrumentIndexToName).toHaveLength(129);
    expect(instrumentIndexToName[0]).toBe("acoustic_grand_piano");
    expect(instrumentIndexToName[71]).toBe("clarinet");
    expect(instrumentIndexToName[127]).toBe("gunshot");
    // abcjs appends this past the end of General MIDI so channel 10 can be named too.
    expect(instrumentIndexToName[128]).toBe("percussion");
  });
});
