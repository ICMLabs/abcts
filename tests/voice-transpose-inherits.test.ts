/**
 * **A VOICE DECLARED AFTER A HEADER `K:` TAKES THE CLEF'S COPY — INCLUDING `transpose=`.**
 *
 * abcjs reads every clef modifier with ONE function for both `K:` and `V:`, and its
 * `case "transpose"` writes `multilineVars.clef.transpose` outright
 * (`abc_parse_key_voice.js:411-418`); a voice declared afterwards is given a COPY of that
 * clef (`:514-515`). So `K:C transpose=2` + `V:1` and `K:C` + `V:1 transpose=2` are the
 * same tune to the synth.
 *
 * ⚠️ **AND THE ORACLE HAS TO BE THE MIDI, WHICH IS WHY THIS EXISTS.** `transpose` is read
 * by the SYNTH and never by the renderer, so an SVG comparison cannot see it at all —
 * `ponytail:` at this rule in `parser.ts` carried "✅ MEASURED 2026-09-08: byte-identical
 * in both engines", and that measurement was `zzledger`'s SVG. It could not have failed.
 *
 * Re-measured 2026-09-16 against abcjs 6.7.0 in WebKit, on `getMidiFile`: the two engines
 * agree byte for byte on all four shapes below, and the marker's prediction — "here it
 * would take its own default" — is false. The rule is already implemented; this is what
 * keeps it that way, and the last case is the probe's own break.
 */
import { describe, expect, it } from "vitest";

import { synth } from "../src/compat/index.js";

const midi = (abc: string): string => {
  const r = synth.getMidiFile(abc, { midiOutputType: "encoded" });
  return Array.isArray(r) ? (r[0] as string) : (r as string);
};

const ON_THE_KEY = "X:1\nL:1/4\nK:C transpose=2\nV:1\nC D E F|\n";
const ON_THE_VOICE = "X:1\nL:1/4\nK:C\nV:1 transpose=2\nC D E F|\n";
const IMPLICIT_VOICE = "X:1\nL:1/4\nK:C transpose=2\nC D E F|\n";
const NO_TRANSPOSE = "X:1\nL:1/4\nK:C\nV:1\nC D E F|\n";

describe("a voice declared after a header K: inherits its transpose", () => {
  it("sounds the same as the transpose written on the voice itself", () => {
    expect(midi(ON_THE_KEY)).toBe(midi(ON_THE_VOICE));
  });

  it("sounds the same as the implicit voice, which has no declaration to inherit into", () => {
    expect(midi(IMPLICIT_VOICE)).toBe(midi(ON_THE_VOICE));
  });

  /**
   * ⭐ **THE PROBE'S OWN BREAK.** Every assertion above is an equality, and equalities pass
   * when nothing is measured — a `getMidiFile` that threw the same way four times, or a
   * prefix comparison that stops before the notes, would read as agreement. (The first
   * attempt at this comparison did exactly that: 90 characters of MIDI header are identical
   * whatever the tune.) This is the row that fails if the transposition is not reaching the
   * notes at all.
   */
  it("is not the same as no transpose at all", () => {
    expect(midi(ON_THE_KEY)).not.toBe(midi(NO_TRANSPOSE));
  });
});
