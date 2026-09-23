import { describe, expect, it } from "vitest";
import { parseOnly } from "../src/compat/index.js";

/**
 * **THREE WARNING RULES, AND EVERY ONE OF THEM IS A RETRY RATHER THAN A MESSAGE.**
 * abcjs fails the attempt, and `parseMusic`'s `if (i === startI)` then warns "Unknown
 * character ignored" for the character it walked past and tries again one along. So the
 * question is never "what does it warn" but "what did it fail to read" — and the warnings
 * fall out of that.
 *
 * Found by fuzzing malformed input against abcjs (`scripts/zzfuzz.mjs`); no fixture in
 * either corpus writes any of these shapes. Every expectation is abcjs 6.7.1's own answer.
 */
const warningsOf = (music: string): string[] =>
  ((parseOnly(`X:1\nK:C\n${music}\n`)[0]?.warnings ?? []) as readonly string[]).map((w) =>
    w.replace(/<[^>]*>/g, "").replace(/^Music Line:/, ""),
  );

const at = (...columns: number[]): string[] => columns.map((c) => `3:${c}: Unknown character ignored`);
const on = (music: string): string[] => warningsOf(music).map((w) => w.split(":  ")[0] ?? w);

/**
 * **A TUPLET FIELD IS ONE DIGIT.** `(p[:q[:r]]` takes a single digit each, so every further
 * digit is an unknown character — `(99999` is a tuplet of NINE and four warnings, not a
 * tuplet of 99999. And `p < 2` builds nothing and warns at its own digit.
 */
describe("a tuplet's digits", () => {
  it.each([
    ["(99999CDEF|", at(3, 4, 5, 6)],
    ["(123CDEF|", at(2, 3, 4)],
    ["(10CDEF|", at(2, 3)],
    ["(0CDEF|", at(2)],
    ["(1CDEF|", at(2)],
    ["(3:2:12CDEFGA|", at(7)],
    ["(2CDEF|", []],
    ["(9CDEF|", []],
    ["(3CDE|", []],
    ["(3:2:6CDEFGA|", []],
  ])("%s warns %j", (music, expected) => {
    expect(on(music)).toEqual(expected);
  });
});

/**
 * **AN ACCIDENTAL RUN IS THE LONGEST LEGAL SUFFIX**, and everything before it warns — the
 * net effect of abcjs retrying one character at a time. Ours ACCUMULATED and clamped, so
 * `^^^^^^C` was a silent double sharp and `^_C` a silent natural.
 */
describe("a run of accidentals", () => {
  it.each([
    ["^^^^^^C|", at(1, 2, 3, 4)],
    ["^^^C|", at(1)],
    ["____C|", at(1, 2)],
    ["^_C|", at(1)],
    ["==C|", at(1)],
    ["^^C|", []],
    ["^C|", []],
    ["=C|", []],
    /**
     * ⚠️ **AND A MICROTONE IS FOUR WARNINGS IN BOTH ENGINES** — strict reads ONE character of
     * microtone and `^3/2G` is a plain G, so the fraction fails and each of its characters is
     * walked past. Measured: this expectation was written as `[]` and abcjs denied it.
     */
    ["^3/2G|", at(1, 2, 3, 4)],
  ])("%s warns %j", (music, expected) => {
    expect(on(music)).toEqual(expected);
  });
});

/**
 * **A `-` THAT NOTHING CAN CONTINUE IS AN UNKNOWN CHARACTER**, and the boundary is one
 * character wide: what follows must IMMEDIATELY be an accidental, a note letter or a rest
 * letter. ⚠️ A SPACE is enough to fail it, and a `-` that follows a note is eaten by THAT
 * note's own parse and fails nothing.
 */
describe("a dangling tie", () => {
  it.each([
    ["-|-", at(1, 3)],
    ["-", at(1)],
    ["|-|", at(2)],
    ["- |", at(1)],
    ["- C|", at(1)],
    ["- z|", at(1)],
    ["-[CE]|", at(1)],
    ['-"Am"C|', at(1)],
    ["-{a}C|", at(1)],
    ["-C|", []],
    ["-c|", []],
    ["-^C|", []],
    ["-z|", []],
    ["-x|", []],
    ["C-|", []],
    ["C -|", []],
    ["C--D|", []],
  ])("%s warns %j", (music, expected) => {
    expect(on(music)).toEqual(expected);
  });
});
