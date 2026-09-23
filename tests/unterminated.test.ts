import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **AN UNTERMINATED CONSTRUCT DOES NOT EAT THE LINE — IT SPENDS A BUDGET.**
 * `getBrackettedSubstring(line, i, maxErrorChars, matchChar)` searches for the close and,
 * failing, sets `pos = i + maxErrorChars` under its own comment: *"we hit the end of line, so
 * we'll just pick an arbitrary num of chars so the line doesn't disappear"*
 * (`abc_tokenizer.js:789-814`). Ours ran to the NEWLINE, so one stray `{` or `"` lost
 * everything after it — **which is what an editor sees on every keystroke, and `compat` is
 * the editor's engine.**
 *
 * Found by fuzzing malformed input against abcjs (`scripts/zzfuzz.mjs`); no fixture in either
 * corpus is malformed. Every expectation below is abcjs 6.7.1's own answer, read out of a
 * WebKit page — the elements AND the warnings, because the warnings are what a host displays.
 */
describe("an unterminated construct", () => {
  const shapeOf = (music: string): string =>
    (parseOnly(`X:1\nK:C\n${music}\n`)[0]?.lines ?? [])
      .flatMap((l) => (l.staff ?? []).flatMap((s) => (s.voices ?? []).flat()))
      .map((e) => {
        if (e.el_type !== "note") return e.el_type === "bar" ? "|" : e.el_type;
        const g = (e.gracenotes ?? []).map((x) => x.name).join("");
        const d = (e.decoration ?? []).join(".");
        const c = (e.chord ?? []).map((x) => x.name).join("");
        return (
          (g === "" ? "" : `{${g}}`) +
          (d === "" ? "" : `!${d}!`) +
          (c === "" ? "" : `"${c}"`) +
          ((e.pitches ?? []).map((p) => p.name).join("") || "z") +
          `@${e.startChar}`
        );
      })
      .join(" ");

  const warningsOf = (music: string): string[] =>
    ((parseOnly(`X:1\nK:C\n${music}\n`)[0]?.warnings ?? []) as readonly string[]).map((w) =>
      w.replace(/<[^>]*>/g, ""),
    );

  /**
   * **A GRACE GROUP'S BUDGET IS ONE CHARACTER, AND THE `{` IS DROPPED ENTIRELY** — the group
   * is abandoned, everything after it is ORDINARY MUSIC, and the character belongs to NOBODY
   * (the following note's span opens past it, the same rule a failed `-` attempt has).
   */
  it("`{` keeps the rest of the line as music", () => {
    expect(shapeOf("{ab CDEF|")).toBe("a@9 b@10 C@12 D@13 E@14 F@15 |");
    expect(shapeOf("{CDEF|")).toBe("C@9 D@10 E@11 F@12 |");
  });

  it("…and warns twice, the second for the character itself", () => {
    expect(warningsOf("{CDEF|")).toEqual([
      "Music Line:3:1: Missing the closing '}' while parsing grace note:  {CDEF|",
      "Music Line:3:1: Unknown character ignored:  {CDEF|",
    ]);
  });

  /** **A CHORD SYMBOL'S BUDGET IS FIVE**, so six characters go and the text is the four between. */
  it("`\"` spends five characters and keeps the rest", () => {
    expect(shapeOf('"Am CDEF|')).toBe('"Am C"E@8 F@15 |');
    expect(warningsOf('"Am CDEF|')).toEqual([
      'Music Line:3:1: Missing the closing quote while parsing the chord symbol:  "Am CDEF|',
    ]);
  });

  /**
   * **AN UNTERMINATED `!` IS A LINE BREAK, NOT A DECORATION** — its arm returns `[1, null]`
   * under abcjs's own comment, so the character goes with NO warning and the rest is music.
   * `!trill CDEF|` then reads `t` as `trillh` and warns four times on `rill`.
   */
  it("`!` drops one character and warns nothing for it", () => {
    expect(shapeOf("!CDEF|")).toBe("C@8 D@10 E@11 F@12 |");
    expect(warningsOf("!CDEF|")).toEqual([]);
    expect(shapeOf("!trill CDEF|")).toBe("!trillh!C@14 D@16 E@17 F@18 |");
    expect(warningsOf("!trill CDEF|").length).toBe(4);
  });

  /** …while a CLOSED but unknown decoration is the other arm, and still warns. */
  it("…but a closed `!zzz!` still warns", () => {
    expect(warningsOf("!zzz!C|")).toEqual([
      "Music Line:3:1: Unknown decoration: zzz:  !zzz!C|",
    ]);
  });

  /** And the terminated forms are untouched, which is what the budget must not disturb. */
  it.each([
    ["{a}C|", "{a}C@8 |"],
    ['"Am"C|', '"Am"C@8 |'],
    ["!trill!C|", "!trill!C@8 |"],
    ["{a b}C|", "{ab}C@8 |"],
  ])("%s is unchanged", (music, expected) => {
    expect(shapeOf(music)).toBe(expected);
    expect(warningsOf(music)).toEqual([]);
  });
});
