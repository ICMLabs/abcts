/**
 * **A `tempo` AND A `part` ARE SELECTABLE, AND THEY CARRY THE FIELD'S OWN CHARACTERS.**
 *
 * `ponytail:` at `abcelemOf` in `compat/selectables.ts` said these two "produce nothing
 * here, and because the gate compares row against row, every entry after one is
 * misaligned" — the element half of what `selection-tempo` was missing.
 *
 * Re-measured 2026-09-16 against abcjs 6.7.0 in WebKit, reading `engraver.selectables` out
 * of both engines on the same tune: **the lists are identical, entry for entry, including
 * the source ranges.** Nothing is missing and nothing after it is misaligned. The numbers
 * below are abcjs's own.
 *
 * ⚠️ The four harvested cases in `corpus-selection/golden.json` do not write a `Q:` or a
 * `P:`, which is why 389 gated entries could not say this either way — **a gate's reach is
 * a property of its enumeration.**
 */
import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

const TEMPO_AND_PART = "X:1\nL:1/4\nQ:1/4=120\nP:A\nK:C\nC D E F|\n";
const NOTES_ONLY = "X:1\nL:1/4\nK:C\nC D E F|\n";

const rowsOf = (abc: string): string[] => {
  const host = { innerHTML: "" } as { innerHTML: string };
  const tune = renderAbc(host, abc, { staffwidth: 670, selectTypes: true })[0];
  const sel = (tune as unknown as {
    engraver?: { selectables?: { absEl?: { abcelem?: Record<string, unknown> } }[] };
  })?.engraver?.selectables;
  return (sel ?? []).map((s) => {
    const e = s.absEl?.abcelem ?? {};
    return `${String(e["el_type"])}[${String(e["startChar"])}..${String(e["endChar"])}]`;
  });
};

describe("a tempo and a part order are selectable elements", () => {
  it("lists them in abcjs's own order, with abcjs's own character ranges", () => {
    expect(rowsOf(TEMPO_AND_PART)).toEqual([
      "partOrder[20..23]",
      "clef[undefined..undefined]",
      "tempo[10..19]",
      "note[28..30]",
      "note[30..32]",
      "note[32..34]",
      "note[34..35]",
      "bar[35..36]",
    ]);
  });

  /**
   * ⭐ **THE BREAK.** The row above is a whole-list equality, which passes for a list that
   * is right and for one nothing produced — so this is the row that fails if the two extra
   * entries stop being built: the same tune without them is SHORTER by exactly two.
   */
  it("adds exactly those two entries to what the notes alone produce", () => {
    expect(rowsOf(NOTES_ONLY)).toHaveLength(6);
    expect(rowsOf(TEMPO_AND_PART)).toHaveLength(8);
  });
});
