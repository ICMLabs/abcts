import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";
import type { AbcLine } from "../src/compat/lines.js";

/**
 * **THE TIE CARRY IS A BOOLEAN AND IT IS POSITIONAL** — `isInTie`
 * (`abc_parse_music.js:93-103`) lands on the very NEXT element whatever that element
 * holds, skipping only a SPACER. This engine matched on PITCH, which is the same answer
 * for ordinary music and a different one for every rung below; it cost twelve tunes across
 * four tune-object gates (`abcts-void-notes-and-stray-ties`, `abcts-endings-tune5`,
 * `abcts-rests-and-bars-tune1`) and one whole `sequence` fixture.
 *
 * A LADDER, because no single rung distinguishes the two models: `C-C|` agrees under both.
 */
describe("a tie's carry", () => {
  const shapeOf = (abc: string): string =>
    (parseOnly(`X:1\nL:1/4\nK:C\n${abc}\n`)[0]?.lines ?? ([] as readonly AbcLine[]))
      .flatMap((l) => (l.staff ?? []).flatMap((s) => (s.voices ?? []).flat()))
      .map((e) =>
        e.el_type !== "note"
          ? e.el_type
          : ((e.pitches ?? [])
              .map((p) => `${p.name}${p.startTie ? "(" : ""}${p.endTie ? ")" : ""}`)
              .join("") ||
            `z${e.rest?.endTie === true ? ")" : ""}${e.rest?.type === "spacer" ? "~" : ""}`),
      )
      .join(" ");

  /** Every string here is abcjs 6.7.1's own answer, read out of a WebKit page. */
  const RUNGS: readonly [string, string][] = [
    // The carry does not compare pitches…
    ["C-D|", "C( D) bar"],
    ["C-C|", "C( C) bar"],
    ["[CE]-D|", "C(E( D) bar"],
    // …lands on a REST, and is spent there…
    ["C-z C|", "C( z) C bar"],
    ["C- z2 D|", "C( z) D bar"],
    ["C-Z|", "C( z) bar"],
    // …but a SPACER is the one thing it steps over (`rest.type !== 'spacer'`).
    ["C-y C|", "C( z~ C) bar"],
    ["C-x C|", "C( z) C bar"],
    // A `-` written BEFORE the note closes on that note, with nothing opened.
    ["-CDEF|", "C) D E F bar"],
    ["CDEF|-GABc|", "C D E F( bar G) A B c bar"],
    ["C2 -D2|", "C( D) bar"],
    ["C2 - D2|", "C( D) bar"],
    ["C2 -| D2|", "C( bar D) bar"],
    ["C2 -- D2|", "C( D) bar"],
    ["-[CE]|", "C)E) bar"],
    // …and a VOIDED note's run still leaves it open: the C is discarded by both engines.
    ["C2 -1 D2|", "D) bar"],
    ["C2 -1D2|", "D) bar"],
    // A chord carries TWO tie states at once — `inTieChord` by POSITION, `inTie` by element.
    ["[C-E-][CEG]|", "C(E( C)E)G bar"],
    ["[C-E-][EC]|", "C(E( E)C) bar"],
    ["[C-E-]D|", "C(E( D bar"],
    ["[CE]-[CE]|", "C(E( C)E) bar"],
    ["C-[CE]|", "C( C)E) bar"],
    ["[CE]-C|", "C(E( C) bar"],
    // The carry crosses a barline and a line break.
    ["C-|C|", "C( bar C) bar"],
    ["C2|[-1 D2|]", "C( bar D) bar"],
    ["C8-|\nC8|", "C( bar C) bar"],
    // Other things written between the two ends change nothing.
    ["C-\"chord\"D|", "C( D) bar"],
    ["C-!fermata!D|", "C( D) bar"],
    ["C-{d}D|", "C( D) bar"],
    ["C-D-E|", "C( D() E) bar"],
    /**
     * ⚠️ **AND A LEADING `-` BEFORE A REST IS SWALLOWED WHOLE.** `-z C|` marks NEITHER,
     * where `C2 -z D2|` marks the rest — so it is the leading `-` that dies and not the
     * rest that refuses. MEASURED; the source predicts the opposite (`:494-496` sets the
     * flag whatever follows), and the mechanism is worth finding before anything is built
     * on it. The guard in `markTieEnds` is this line.
     */
    ["-z C|", "z C bar"],
  ];

  for (const [abc, expected] of RUNGS)
    it(`${abc.replace(/\n/g, "\\n")} → ${expected}`, () => {
      expect(shapeOf(abc)).toBe(expected);
    });

  /**
   * **TWO RUNGS MEASURED AND DELIBERATELY NOT LANDED**, written down rather than fixed
   * because each is a model change for one shape and neither is named by any open row.
   * `it.fails` so they go RED when the gap closes rather than rotting into a claim.
   */
  it.fails("a rest can OPEN a tie — `z-C|` is `z( C)` in abcjs, `z C)` here", () => {
    // `Rest` has no `tiedToNext`: `tieLast` refuses a rest, where abcjs writes
    // `el.rest.startTie` (`abc_parse_music.js:519-520`). The endTie half already agrees.
    expect(shapeOf("z-C|")).toBe("z( C) bar");
  });

  it.fails("a voided `-` does not tie back across a LINE break in abcjs", () => {
    // `C2` then `-1 D2|` on the next line: abcjs gives the C no `startTie` at all — its
    // `addTieToLastNote` cannot see the line above — while ours reaches back.
    expect(shapeOf("C2\n-1 D2|")).toBe("C D) bar");
  });
});
