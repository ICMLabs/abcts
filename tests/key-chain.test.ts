import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOnly, synth } from "../src/compat/index.js";

/**
 * **EVERY `[K:]` IN A MEASURE IS AN ELEMENT, AND EACH CANCELS THE ONE BEFORE IT.** The model
 * held one key change per measure, so `[K:D][K:Bb]` lost the D, `[K:D]AB[K:Bb]` opened the
 * line in C, and `A[K:D]B[K:Bb]` sounded `B` natural. `Measure.earlierKeyChanges` carries the
 * rest; the line's key is the last that leads it (`leadingKeysOf`), every leading one is a
 * cautionary on the line above, the chain's clef moves with it, and an inline `[K:]` with no
 * clef takes the one the last `K:` named, not the voice's.
 *
 * `key-chain.json` is abcjs 6.7.1's `tune.lines` digest and MIDI file, read in WebKit. The
 * wrapped shapes are browser-only and live in `scripts/zzledger.mjs`.
 */
type Answer = { abc: string; lines: string[]; midi: string };
const answers = JSON.parse(
  readFileSync(join(__dirname, "key-chain.json"), "utf-8"),
) as Answer[];

type El = { el_type: string; value?: unknown; pitches?: { name: string }[] };
type Staff = { meter?: { value?: unknown; type?: string }; voices: El[][] };
const digest = (abc: string): string[] =>
  (parseOnly(abc)[0] as unknown as { lines: { staff: Staff[] }[] }).lines.map((l) =>
    l.staff
      .map(
        (st) =>
          `m${st.meter ? JSON.stringify(st.meter.value ?? st.meter.type) : "-"} ` +
          st.voices
            .map((v) =>
              v
                .map((e) =>
                  e.el_type === "note"
                    ? (e.pitches?.[0]?.name ?? "z")
                    : e.el_type === "bar"
                      ? "|"
                      : e.el_type === "timeSignature"
                        ? `M${JSON.stringify(e.value)}`
                        : e.el_type.toUpperCase(),
                )
                .join(" "),
            )
            .join(" / "),
      )
      .join(" // "),
  );

describe("several key changes in one measure", () => {
  for (const a of answers)
    it(JSON.stringify(a.abc), () => {
      expect(digest(a.abc)).toEqual(a.lines);
      expect(String(synth.getMidiFile(a.abc, { midiOutputType: "encoded" }))).toBe(a.midi);
    });
});
