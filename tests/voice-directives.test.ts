/**
 * **`%%voicecolor` AND `%%voicescale` — THE TWO DIRECTIVES GUARDED BY
 * `multilineVars.currentVoice`, AND THE GUARD IS THE POINT.**
 *
 * Both arms are three lines apart in abcjs and shaped identically
 * (`abc_parse_directive.js:854-871`):
 *
 *     if (multilineVars.currentVoice) { currentVoice.<field> = value; tuneBuilder.change… }
 *
 * `multilineVars.currentVoice` is set by a `V:` FIELD and by nothing else — a header
 * declaration counts, and a tune that never writes one leaves it undefined, so **the
 * directive does nothing at all**. That is most tunes, and we applied it to every one of
 * them; and where two voices are declared it is the LAST `V:`, not the voice the music
 * lands in.
 *
 * Measured against abcjs 6.7.0 live (`scripts/zzledger.mjs`, 2026-09-09) — before this,
 * `%%voicecolor red` with no `V:` coloured a whole tune abcjs leaves black, and
 * `%%voicescale` was UNIMPLEMENTED and raised `Unknown directive`, a warning abcjs does
 * not raise and which the warnings gate cannot see because no corpus tune writes one.
 */
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/parser.js";

const voicesOf = (abc: string) => {
  const p = parse(abc, { mode: "abcjs-strict" });
  const score = p.ok ? p.scores[0] : undefined;
  if (score === undefined) throw new Error("fixture did not parse");
  return {
    voices: score.voices.map((v) => ({ id: v.id, color: v.color, scale: v.scale })),
    warnings: p.diagnostics.map((d) => d.message),
  };
};

const BODY = "K:C\nCDEF|\n";

describe("%%voicecolor", () => {
  it("does NOTHING when no V: has been written", () => {
    const { voices } = voicesOf(`X:1\nM:4/4\nL:1/4\n%%voicecolor red\n${BODY}`);
    expect(voices.map((v) => v.color)).toEqual([null]);
  });

  it("colours the voice the last V: DECLARED, not the one music lands in", () => {
    // Both voices are declared in the header, so music lands in voice 1 and abcjs's
    // `currentVoice` is voice 2. The two are different values on purpose — see
    // `ScoreBuilder.declaredVoiceId`.
    const { voices } = voicesOf(
      "X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\n%%voicecolor red\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n",
    );
    expect(voices.map((v) => [v.id, v.color])).toEqual([
      ["1", null],
      ["2", "red"],
    ]);
  });
});

describe("%%voicescale", () => {
  it("scales the declared voice", () => {
    const { voices, warnings } = voicesOf(`X:1\nM:4/4\nL:1/4\nV:1\n%%voicescale 1.5\n${BODY}`);
    expect(voices[0]?.scale).toBe(1.5);
    expect(warnings).toEqual([]);
  });

  it("does NOTHING when no V: has been written, and still warns nothing", () => {
    const { voices, warnings } = voicesOf(`X:1\nM:4/4\nL:1/4\n%%voicescale 1.5\n${BODY}`);
    // The negative control: an implementation that ignored the guard would pass the row
    // above and fail this one.
    // `null` is "no scale declared", which is what the `V:` modifier leaves too — the
    // renderer's own default is 1 and an explicit `scale=1` is a different thing to abcjs
    // (a truthy value that emits a `scale` element).
    expect(voices[0]?.scale).toBe(null);
    expect(warnings).toEqual([]);
  });

  it("warns abcjs's own message when the parameter is not a float", () => {
    const { warnings } = voicesOf(`X:1\nM:4/4\nL:1/4\nV:1\n%%voicescale wide\n${BODY}`);
    expect(warnings).toEqual(["voicescale requires one float as a parameter"]);
  });
});
