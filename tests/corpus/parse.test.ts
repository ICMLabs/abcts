import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CompatibilityMode,
  rational,
  ratToNumber,
  type Score,
  stepIndex,
} from "../../src/core/model.js";
import { parse } from "../../src/parser/parser.js";
import { corpusDir, goldenNotes } from "./corpus.js";

const fixture = (name: string): string =>
  readFileSync(join(corpusDir, `${name}.abc`), "utf-8");

/** Flatten a Score to a comparable note stream. */
const notesOf = (score: Score) =>
  score.voices
    .flatMap((voice) => voice.measures)
    .flatMap((measure) => measure.events)
    .filter((event) => event.type === "note")
    .map((note) => ({
      start: note.sourceRange?.start ?? -1,
      end: note.sourceRange?.end ?? -1,
      duration: ratToNumber(note.duration),
      // abcjs numbers pitches diatonically from middle C, so C4 is 0 and c5 is 7.
      pitch: (note.pitch.octave - 4) * 7 + stepIndex(note.pitch.step),
    }));

/** The same stream pulled out of an abcjs `.parse.json` golden. */
const abcjsNotesOf = (name: string) =>
  goldenNotes(name).map((element) => ({
    start: element.startChar,
    end: element.endChar,
    duration: element.duration,
    pitch: element.pitches?.[0]?.pitch ?? -1,
  }));

describe("parse: simple-c", () => {
  const result = parse(fixture("simple-c"));
  if (!result.ok) throw new Error("expected simple-c to parse");
  const score = result.scores[0];
  if (!score) throw new Error("expected one score");

  it("produces exactly one score with no diagnostics", () => {
    expect(result.scores).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it("reads the header fields", () => {
    expect(score.metadata.tuneNumber).toBe(1);
    expect(score.metadata.titles).toEqual(["Simple C"]);
    expect(score.key).toEqual({
      tonic: { step: "c", accidental: 0 },
      mode: "major",
      none: false,
    });
    // M:4/4 is numeric — `common` requires a literal `M:C`.
    expect(score.meter).toEqual({
      numerator: 4,
      denominator: 4,
      symbol: "numeric",
    });
    expect(score.unitNoteLength).toEqual(rational(1, 4));
  });

  it("anchors the header source ranges", () => {
    expect(score.meterSourceRange).toEqual({ start: 15, end: 20 });
    expect(score.keySourceRange).toEqual({ start: 27, end: 30 });
  });

  it("splits into two measures on one voice", () => {
    expect(score.voices).toHaveLength(1);
    const voice = score.voices[0];
    expect(voice?.id).toBe("1");
    expect(voice?.measures).toHaveLength(2);
    expect(voice?.measures[0]?.closingBarline).toBe("thin");
    expect(voice?.measures[0]?.sourceRange).toEqual({ start: 31, end: 36 });
    expect(voice?.measures[0]?.closingBarlineSourceRange).toEqual({
      start: 35,
      end: 36,
    });
    expect(voice?.measures[1]?.sourceRange).toEqual({ start: 36, end: 41 });
  });

  it("builds the first note with an unresolved accidental", () => {
    expect(score.voices[0]?.measures[0]?.events[0]).toEqual({
      type: "note",
      // The `%%gchordfont` in force, null when the tune sets none — see `Note.chordFont`.
      chordFont: null,
      // null accidental means "inherit from the key" — resolution is an engrave concern.
      // `written` is the SOURCE spelling, which is not derivable — see `Pitch.written`.
      pitch: { step: "c", octave: 4, accidental: null, written: "C" },
      duration: rational(1, 4),
      notatedDuration: rational(1, 4),
      tiedToNext: false,
      slurStarts: 0,
      slurEnds: 0,
      graceNotes: [],
      graceSlash: false,
      beamGroup: null,
      lyric: null,
      lyricSourceRange: null,
      lyricFont: null,
      lyricMelisma: false,
      lyricMelismaStart: false,
      extraVerses: [],
      style: "normal",
      microtoneCents: 0,
      tuplet: null,
      chordSymbol: null,
      chordSymbolSourceRange: null,
      decorations: [],
      decorationSourceRanges: [],
      annotations: [],
      annotationSourceRanges: [],
      sourceRange: { start: 31, end: 32 },
    });
  });

  it("octaves by letter case — uppercase B is 4, lowercase c is 5", () => {
    const second = score.voices[0]?.measures[1]?.events;
    expect(second?.[2]).toMatchObject({ pitch: { step: "b", octave: 4 } });
    expect(second?.[3]).toMatchObject({ pitch: { step: "c", octave: 5 } });
  });

  it("freezes the result", () => {
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(score.voices[0]?.measures[0])).toBe(true);
  });
});

// Core cannot match abcjs's parse tree — abcjs stores duration as a float and flattens
// measures away. What IS comparable is musical content: same notes, same offsets, same
// sounding durations. That is the gate for core, mirroring the structural-content
// comparator abcMusicKit2 runs against v1 (scripts/v1parity.py).
describe("content parity with abcjs goldens", () => {
  for (const name of ["simple-c", "twinkle"]) {
    it(`${name}: note stream matches abcjs`, () => {
      const result = parse(fixture(name));
      if (!result.ok) throw new Error(`expected ${name} to parse`);
      const score = result.scores[0];
      if (!score) throw new Error(`expected a score for ${name}`);
      const expected = abcjsNotesOf(name);
      expect(
        expected.length,
        "golden yielded no notes — comparison would be vacuous",
      ).toBeGreaterThan(0);
      expect(notesOf(score)).toEqual(expected);
    });
  }
});

// Microtonal accidentals (ABC 2.1 §4.5). The fraction sits BEFORE the note letter, where
// a duration would sit after it — `^3/2G` is a three-quarter-sharp G, not G of length 3/2.
describe("microtonal accidentals", () => {
  const notesOfAbc = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    return (result.scores[0]?.voices[0]?.measures ?? [])
      .flatMap((measure) => measure.events)
      .filter((event) => event.type === "note");
  };

  const notesOfAbcIn = (abc: string, mode: "abc2.1") => {
    const result = parse(abc, { mode });
    if (!result.ok) throw new Error("expected parse to succeed");
    return (result.scores[0]?.voices[0]?.measures ?? [])
      .flatMap((measure) => measure.events)
      .filter((event) => event.type === "note");
  };

  /**
   * **STRICT READS EXACTLY ONE CHARACTER OF MICROTONE, AND A SECOND IS A PARSE FAILURE.**
   * `getCoreNote`'s `case '0' … case '/'` arm turns state `sharp2` into `quartersharp` and
   * moves to `pitch` (`abc_parse_music.js:1195-1217`); a further digit or `/` then falls
   * through to `return null`, the note is abandoned and the letter alone is re-read.
   *
   * These three tests asserted OUR reading — 150 cents from `^3/2` and the base sign kept —
   * which is ABC 2.1 and is NOT what abcjs does. Measured through abcjs, one variable a
   * rung: `^3G` and `^/G` both draw `accidentals.halfsharp` and name the head `^/G`, while
   * `^3/2G`, `^/2G`, `^1/2G` and `_3/2G` all draw a PLAIN `G` with no accidental at all. So
   * the fraction's VALUE never reaches the page; only its length does.
   *
   * The ABC 2.1 reading is real and is what every other mode is for, so both are asserted.
   */
  it("reads ONE character of microtone in strict, as abcjs does", () => {
    const notes = notesOfAbc("X:1\nL:1/8\nK:C\nG ^/G ^G ^3G _/A _3/2A |\n");
    expect(notes.map((n) => n.microtoneCents)).toEqual([0, 50, 0, 50, -50, 0]);
    expect(notes.map((n) => n.pitch.accidental)).toEqual([
      null,
      1,
      1,
      1,
      -1,
      null,
    ]);
  });

  it("reads the whole fraction in abc2.1", () => {
    const notes = notesOfAbcIn(
      "X:1\nL:1/8\nK:C\nG ^/G ^G ^3/2G _/A _3/2A |\n",
      "abc2.1",
    );
    expect(notes.map((n) => n.microtoneCents)).toEqual([
      0, 50, 0, 150, -50, -150,
    ]);
    expect(notes.map((n) => n.pitch.accidental)).toEqual([
      null,
      1,
      1,
      1,
      -1,
      -1,
    ]);
  });

  it("does not confuse a microtone with a duration", () => {
    const [micro] = notesOfAbc("X:1\nL:1/8\nK:C\n^3/2G |\n");
    const [duration] = notesOfAbc("X:1\nL:1/8\nK:C\n^G3/2 |\n");
    // The DURATION is the note's own either way — abcjs abandons only the accidental.
    expect(micro?.duration).toEqual(rational(1, 8));
    expect(micro?.microtoneCents).toBe(0);
    expect(duration?.duration).toEqual(rational(3, 16));
    expect(duration?.microtoneCents).toBe(0);
  });

  it("includes a leading accidental in the note source range, as v2 implements", () => {
    const abc = "X:1\nL:1/8\nK:C\n^G |\n";
    const [note] = notesOfAbc(abc);
    expect(
      abc.slice(note?.sourceRange?.start ?? 0, note?.sourceRange?.end ?? 0),
    ).toBe("^G");
  });
});

// Tuplets are why `duration` and `notatedDuration` are separate fields: a triplet eighth
// is WRITTEN as an eighth but SOUNDS for a twelfth. The ratio scales sounding only.
describe("tuplets", () => {
  const eventsOf = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    return (result.scores[0]?.voices[0]?.measures ?? []).flatMap(
      (measure) => measure.events,
    );
  };

  it("scales sounding duration but not notated duration", () => {
    const notes = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(3abc d |\n");
    expect(notes.slice(0, 3).map((n) => n.notatedDuration)).toEqual([
      rational(1, 8),
      rational(1, 8),
      rational(1, 8),
    ]);
    expect(notes.slice(0, 3).map((n) => n.duration)).toEqual([
      rational(1, 12),
      rational(1, 12),
      rational(1, 12),
    ]);
    // The note after the group is untouched.
    expect(notes[3]?.duration).toEqual(rational(1, 8));
    expect(notes[3]?.tuplet).toBeNull();
  });

  it("marks members with a shared group id and the printed number", () => {
    const [a, b, c] = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(3abc |\n");
    expect(a?.tuplet).toEqual({ group: 1, number: 3 });
    expect(b?.tuplet).toEqual(a?.tuplet);
    expect(c?.tuplet).toEqual(a?.tuplet);
  });

  it("gives adjacent groups distinct ids", () => {
    const notes = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(3abc (3def |\n");
    expect(notes[0]?.tuplet?.group).toBe(1);
    expect(notes[3]?.tuplet?.group).toBe(2);
  });

  it("reads the explicit (p:q:r form, including omitted fields", () => {
    // `(3::4` — q omitted so it defaults to 2, r explicit at 4.
    const notes = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(3::4 cdef g |\n");
    expect(notes.slice(0, 4).every((n) => n.duration.denominator === 12)).toBe(
      true,
    );
    expect(notes[4]?.tuplet).toBeNull();
  });

  it("counts a rest as a tuplet member", () => {
    // `(3z2A2G2` opens on a rest; if the rest did not consume a slot the group would
    // run one note long.
    const events = eventsOf("X:1\nL:1/4\nM:4/4\nK:C\n(3z2A2G2 c |\n");
    expect(events[0]?.type).toBe("rest");
    expect(events[3]?.tuplet).toBeNull();
  });

  it("defaults q by meter for the ambiguous sizes", () => {
    // `(5` is 5-in-2 in simple time but 5-in-3 in compound.
    const simple = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(5abcde |\n");
    const compound = eventsOf("X:1\nL:1/8\nM:6/8\nK:C\n(5abcde |\n");
    expect(simple[0]?.duration).toEqual(rational(1, 20)); // 1/8 * 2/5
    expect(compound[0]?.duration).toEqual(rational(3, 40)); // 1/8 * 3/5
  });
});

describe("ties, slurs, grace notes and beams", () => {
  const eventsOf = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    return (result.scores[0]?.voices[0]?.measures ?? []).flatMap(
      (measure) => measure.events,
    );
  };

  it("ties reach back to the note already emitted", () => {
    const [a, b] = eventsOf("X:1\nL:1/4\nK:C\nc-c d |\n");
    expect(a?.type === "note" && a.tiedToNext).toBe(true);
    expect(b?.type === "note" && b.tiedToNext).toBe(false);
  });

  it("slurs open on the next note and close on the previous one", () => {
    const notes = eventsOf("X:1\nL:1/4\nK:C\n(abc) d |\n");
    expect(notes[0]?.type === "note" && notes[0].slurStarts).toBe(1);
    expect(notes[2]?.type === "note" && notes[2].slurEnds).toBe(1);
    expect(notes[3]?.type === "note" && notes[3].slurStarts).toBe(0);
  });

  it("does not mistake a tuplet for a slur", () => {
    const [first] = eventsOf("X:1\nL:1/8\nM:4/4\nK:C\n(3abc |\n");
    expect(first?.type === "note" && first.slurStarts).toBe(0);
    expect(first?.tuplet).not.toBeNull();
  });

  it("attaches grace notes to the following event", () => {
    const [note] = eventsOf("X:1\nL:1/4\nK:C\n{gab}c |\n");
    if (note?.type !== "note") throw new Error("expected a note");
    expect(note.graceNotes.map((p) => p.step)).toEqual(["g", "a", "b"]);
    expect(note.graceSlash).toBe(false);
    expect(note.pitch.step).toBe("c");
  });

  it("reads {/g} as an acciaccatura", () => {
    const [note] = eventsOf("X:1\nL:1/4\nK:C\n{/g}c |\n");
    expect(note?.type === "note" && note.graceSlash).toBe(true);
  });

  it("beams runs shorter than a quarter, breaking on space and barline", () => {
    const notes = eventsOf("X:1\nL:1/8\nK:C\nabcd efgh |\n");
    const groups = notes.map((n) => (n.type === "rest" ? null : n.beamGroup));
    // Two runs of four, split by the space.
    expect(new Set(groups.slice(0, 4)).size).toBe(1);
    expect(new Set(groups.slice(4, 8)).size).toBe(1);
    expect(groups[0]).not.toBe(groups[4]);
  });

  it("does not beam quarter notes or longer", () => {
    const notes = eventsOf("X:1\nL:1/4\nK:C\nabcd |\n");
    expect(notes.every((n) => n.type !== "rest" && n.beamGroup === null)).toBe(
      true,
    );
  });

  // A space after a tie breaks the beam for a NOTE and not for a CHORD. Both rows are
  // asserted because this pair replaces a test that observed the chord case, wrote the
  // note case, and asserted the chord's answer for it — which held the wrong rule in
  // place across the whole corpus. Measured against abcjs 6.6.3; see the `whitespace`
  // case in the parser for the table.
  const runsOf = (abc: string) =>
    new Set(eventsOf(abc).map((n) => (n.type === "rest" ? null : n.beamGroup)))
      .size;

  it("breaks a beam at a space after a tied NOTE", () => {
    expect(runsOf("X:1\nL:1/8\nK:C\na/4b/4- c/4d/4 |\n")).toBe(2);
  });

  it("keeps the beam at a space after a tied CHORD", () => {
    // abcjs beams `[G=Bg]/4- [GBg]/4` as one run. Almost certainly its bug; strict mode
    // reproduces it rather than correcting it.
    expect(runsOf("X:1\nL:1/8\nK:C\n[ac]/4[bd]/4- [ce]/4[df]/4 |\n")).toBe(1);
  });

  it("keeps the beam at a space that is still waiting to place a decoration", () => {
    // In `de/f/P ^c3/d/` the space sits between `P` and the note it decorates; abcjs
    // beams straight through. Drop the decoration and the same space breaks.
    expect(runsOf("X:1\nL:1/8\nK:C\nde/f/P ^c3/d/|\n")).toBe(1);
    expect(runsOf("X:1\nL:1/8\nK:C\nde/f/ ^c3/d/|\n")).toBe(2);
  });
});

describe("mid-tune key and meter changes", () => {
  const measuresOf = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    return result.scores[0]?.voices[0]?.measures ?? [];
  };

  it("attaches a mid-tune K: to the measure it opens", () => {
    const measures = measuresOf("X:1\nL:1/4\nK:C\nCDEF|\nK:G\nGABc|\n");
    expect(measures[0]?.keyChange).toBeNull();
    expect(measures[1]?.keyChange).toEqual({
      tonic: { step: "g", accidental: 0 },
      mode: "major",
      none: false,
    });
  });

  it("attaches a mid-tune M: likewise, leaving the header meter alone", () => {
    const result = parse("X:1\nL:1/4\nM:4/4\nK:C\nCDEF|\nM:3/4\nGAB|\n");
    if (!result.ok) throw new Error("expected parse to succeed");
    const score = result.scores[0];
    // Score.meter is the INITIAL meter, frozen at the header K:.
    expect(score?.meter).toEqual({
      numerator: 4,
      denominator: 4,
      symbol: "numeric",
    });
    expect(score?.voices[0]?.measures[1]?.meterChange).toEqual({
      numerator: 3,
      denominator: 4,
      symbol: "numeric",
    });
  });

  it("reads an inline [K:...] change too", () => {
    const measures = measuresOf("X:1\nL:1/4\nK:C\nCDEF|[K:F]GABc|\n");
    expect(measures[1]?.keyChange?.tonic.step).toBe("f");
  });

  it("no longer reports mid-tune changes as unimplemented", () => {
    const result = parse("X:1\nL:1/4\nK:C\nCDEF|\nK:G\nGABc|\n");
    if (!result.ok) throw new Error("expected parse to succeed");
    expect(
      result.diagnostics.filter((d) => d.code === "parsed-not-realized"),
    ).toEqual([]);
  });
});

describe("lyrics", () => {
  const notesOf = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    return (result.scores[0]?.voices[0]?.measures ?? [])
      .flatMap((measure) => measure.events)
      .filter((event) => event.type === "note");
  };

  it("aligns syllables to notes by position", () => {
    const notes = notesOf("X:1\nL:1/4\nK:C\nCDEF|\nw:Do Re Mi Fa\n");
    expect(notes.map((n) => n.lyric)).toEqual(["Do", "Re", "Mi", "Fa"]);
  });

  it("splits a hyphenated word across notes, keeping the hyphen", () => {
    const notes = notesOf("X:1\nL:1/4\nK:C\nCDEF|\nw:Fre-re Jac-ques\n");
    expect(notes.map((n) => n.lyric)).toEqual(["Fre-", "re", "Jac-", "ques"]);
  });

  /**
   * **AN EMPTY SYLLABLE IS NOT AN ABSENT ONE, AND THESE TESTS SAID IT WAS.**
   * abcjs's own parse golden for `S5-directives` X:505 ends `["true.|_"] ["| "]` — an
   * entry with an EMPTY syllable for the note the `_` holds over — and `addLyric` builds
   * `lyricStr = "" + div + "\n"` for it, which `renderText` draws as `&nbsp;`
   * (`abstract-engraver.js:779-784`, `draw/text.js:44-46`). `null` now means the `w:`
   * lines never covered this note; `''` means they did and gave it nothing.
   */
  it("treats * as an EMPTY syllable and | as an alignment hint occupying none", () => {
    const notes = notesOf("X:1\nL:1/4\nK:C\nCDEF|\nw:Do * | Mi Fa\n");
    expect(notes.map((n) => n.lyric)).toEqual(["Do", "", "Mi", "Fa"]);
    // `*` is nothing sung — NOT a held syllable.
    expect(notes.map((n) => n.lyricMelisma)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("distinguishes _ (melisma) from * (skip)", () => {
    // Both leave `lyric` EMPTY and occupy a note, but only `_` means the previous
    // syllable is still being sung — which is what a renderer needs to draw an
    // extension line rather than a gap.
    const notes = notesOf("X:1\nL:1/4\nK:C\nCDEF|\nw:Do _ * Fa\n");
    expect(notes.map((n) => n.lyric)).toEqual(["Do", "", "", "Fa"]);
    expect(notes.map((n) => n.lyricMelisma)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it("treats _ as a syllable separator, not a character", () => {
    // ABC 2.1 §5.1's own example: "A-_ma-zing_" spans five positions —
    // `A-` · hold · `ma-` · `zing` · hold. A tokenizer that only splits on `-` leaves
    // literal underscores in the text ("_ma-", "zing_") and loses both holds.
    const notes = notesOf(
      "X:1\nL:1/8\nK:C\nG2 c3/2 B/ c2 e2 |\nw: A-_ma-zing_ * grace\n",
    );
    expect(notes.map((n) => n.lyric)).toEqual(["A-", "", "ma-", "zing", ""]);
    expect(notes.map((n) => n.lyricMelisma)).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it("holds a melisma across several notes", () => {
    const notes = notesOf("X:1\nL:1/4\nK:C\nCDEF|\nw:Glo _ _ _\n");
    expect(notes.map((n) => n.lyricMelisma)).toEqual([false, true, true, true]);
  });

  it("stacks successive w: lines as verses", () => {
    const notes = notesOf("X:1\nL:1/4\nK:C\nCD|\nw:one two\nw:ein zwei\n");
    expect(notes.map((n) => n.lyric)).toEqual(["one", "two"]);
    expect(notes.map((n) => n.extraVerses)).toEqual([["ein"], ["zwei"]]);
  });

  it("continues verse 1 across a second music line", () => {
    const notes = notesOf(
      "X:1\nL:1/4\nK:C\nCD|\nw:one two\nEF|\nw:three four\n",
    );
    expect(notes.map((n) => n.lyric)).toEqual(["one", "two", "three", "four"]);
  });

  it("does not put a lyric on a rest", () => {
    const result = parse("X:1\nL:1/4\nK:C\nCzD|\nw:do re\n");
    if (!result.ok) throw new Error("expected parse to succeed");
    const events = (result.scores[0]?.voices[0]?.measures ?? []).flatMap(
      (m) => m.events,
    );
    expect(events[1]?.type).toBe("rest");
    // The rest is skipped entirely, so `re` lands on the note after it.
    expect(events[0]?.type === "note" && events[0].lyric).toBe("do");
    expect(events[2]?.type === "note" && events[2].lyric).toBe("re");
  });

  it("records a source range for cross-linking", () => {
    const abc = "X:1\nL:1/4\nK:C\nCD|\nw:do re\n";
    const [first] = notesOf(abc);
    const range = first?.lyricSourceRange;
    expect(abc.slice(range?.start ?? 0, range?.end ?? 0)).toBe("do");
  });
});

describe("malformed length input", () => {
  const parseOk = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("parser should never fail");
    return result;
  };

  it("recovers from a zero divisor instead of throwing", () => {
    const result = parseOk("X:1\nL:1/4\nK:C\nB/0 |\n");
    const note = result.scores[0]?.voices[0]?.measures[0]?.events[0];
    expect(note?.duration).toEqual(rational(1, 4)); // divisor ignored
    expect(result.diagnostics.map((d) => d.code)).toContain("malformed-length");
  });

  it("recovers from a digit run that overflows to Infinity", () => {
    // Previously reached rational() as Infinity and hung gcd() until the stack blew —
    // a denial-of-service for any consumer parsing untrusted ABC.
    const result = parseOk(`X:1\nL:1/4\nK:C\nC${"9".repeat(400)} |\n`);
    expect(
      result.scores[0]?.voices[0]?.measures[0]?.events[0]?.duration,
    ).toEqual(rational(1, 4));
    expect(result.diagnostics.map((d) => d.code)).toContain("malformed-length");
  });

  it("stops a runaway divisor before it overflows", () => {
    const result = parseOk(`X:1\nL:1/4\nK:C\nC${"/".repeat(200)} |\n`);
    const duration =
      result.scores[0]?.voices[0]?.measures[0]?.events[0]?.duration;
    expect(Number.isSafeInteger(duration?.denominator)).toBe(true);
  });

  it("still accepts a legitimate zero-duration note and a normal fraction", () => {
    expect(
      parseOk("X:1\nL:1/4\nK:C\nB0 |\n").scores[0]?.voices[0]?.measures[0]
        ?.events[0]?.duration,
    ).toEqual(rational(0, 1));
    expect(
      parseOk("X:1\nL:1/4\nK:C\nC3/2 |\n").scores[0]?.voices[0]?.measures[0]
        ?.events[0]?.duration,
    ).toEqual(rational(3, 8));
  });
});

// Each of these was a real bug found by an adversarial audit, verified reproducing, and
// fixed. They are pinned here because none of them failed any existing test.
describe("audit regressions", () => {
  const shape = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("parser should never fail");
    return result;
  };

  it("keeps a trailing overlay measure that has no closing barline", () => {
    // `AB|&cd` silently discarded `cd` entirely; adding a closing `|` made it reappear.
    const voice = shape("X:1\nK:C\nAB|&cd\n").scores[0]?.voices[0];
    expect(voice?.measures).toHaveLength(2);
    expect(voice?.measures[1]?.overlays[0]).toHaveLength(2);
  });

  it("treats a header V: as a declaration, not a voice switch", () => {
    // All four notes used to land in voice 2, the last one declared.
    const voices = shape("X:1\nV:1\nV:2\nK:C\nCDEF\n").scores[0]?.voices;
    expect(voices?.[0]?.measures.flatMap((m) => m.events)).toHaveLength(4);
    expect(voices?.[1]?.measures.flatMap((m) => m.events)).toHaveLength(0);
  });

  it("does not let an unterminated %%begintext swallow later tunes", () => {
    const result = shape("X:1\nK:C\nCD|\n%%begintext\nblah\n\nX:2\nK:C\nEF|\n");
    expect(result.scores).toHaveLength(2);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "unterminated-text-block",
    );
  });

  it("does not leak a pending microtone past a rest", () => {
    const events =
      shape("X:1\nK:C\n^2zA\n").scores[0]?.voices[0]?.measures[0]?.events;
    expect(events?.[1]?.type === "note" && events[1].microtoneCents).toBe(0);
  });

  it("does not let +: continue a K: into a phantom key change", () => {
    const measure = shape("X:1\nK:C\n+:prose here\nCD|\n").scores[0]?.voices[0]
      ?.measures[0];
    expect(measure?.keyChange).toBeNull();
  });

  it("distinguishes K:none from C major", () => {
    expect(shape("X:1\nK:none\nCD|\n").scores[0]?.key.none).toBe(true);
    expect(shape("X:1\nK:C\nCD|\n").scores[0]?.key.none).toBe(false);
  });

  it("closes a beam run at a mid-line voice switch", () => {
    // Beam indices were resolved against whichever voice was current at close time, so
    // voice 1 went unbeamed and its indices were applied to voice 2.
    const voices = shape("X:1\nK:C\nAB[V:2]cd\n").scores[0]?.voices;
    const groups = (i: number) =>
      voices?.[i]?.measures
        .flatMap((m) => m.events)
        .map((e) => (e.type === "rest" ? null : e.beamGroup));
    expect(new Set(groups(0)).size).toBe(1);
    expect(new Set(groups(1)).size).toBe(1);
    expect(groups(0)?.[0]).not.toBe(groups(1)?.[0]);
  });

  it("completes a broken-rhythm pair across a line break", () => {
    // A plain line break does not end a measure, so `A>` / `B` are still a pair. The
    // first note used to be lengthened while the second was never shortened.
    const events = shape(
      "X:1\nL:1/8\nK:C\nA>\nB\n",
    ).scores[0]?.voices[0]?.measures.flatMap((m) => m.events);
    expect(events?.[0]?.duration).toEqual(rational(3, 16));
    expect(events?.[1]?.duration).toEqual(rational(1, 16));
  });

  it("clamps an absurd broken-rhythm run instead of overflowing", () => {
    const result = shape(`X:1\nK:C\nc${">".repeat(60)}d`);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "malformed-broken-rhythm",
    );
  });
});

describe("attachment classification", () => {
  const eventsOfAbc = (abc: string) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("parser should never fail");
    return (result.scores[0]?.voices[0]?.measures ?? []).flatMap(
      (m) => m.events,
    );
  };

  it("does not read a dotted slur or dotted tie as staccato", () => {
    // `.(` marks the SLUR as dotted and `.-` the TIE; neither is a decoration on the note.
    expect(eventsOfAbc("X:1\nK:C\n.(C D E F)\n")[0]?.decorations).toEqual([]);
    expect(eventsOfAbc("X:1\nK:C\nC.-C D\n")[0]?.decorations).toEqual([]);
    // A bare `.` before a note IS staccato.
    expect(eventsOfAbc("X:1\nK:C\n.C D\n")[0]?.decorations).toEqual([
      "staccato",
    ]);
  });

  it("reads J as the slide shorthand", () => {
    expect(eventsOfAbc("X:1\nK:C\nJc d\n")[0]?.decorations).toEqual(["slide"]);
  });

  it("treats !style=…! as a notehead style, not a decoration", () => {
    const [note] = eventsOfAbc("X:1\nK:C\n!style=harmonic!G A\n");
    expect(note?.type === "note" && note.style).toBe("harmonic");
    expect(note?.decorations).toEqual([]);
  });

  it("separates chord symbols from annotations", () => {
    const [withChord] = eventsOfAbc('X:1\nK:C\n"Am7"C\n');
    expect(withChord?.type === "note" && withChord.chordSymbol).toBe("Am7");
    const [withAnnotation] = eventsOfAbc('X:1\nK:C\n"^above"C\n');
    expect(
      withAnnotation?.type === "note" && withAnnotation.chordSymbol,
    ).toBeNull();
    expect(
      withAnnotation?.type === "note" && withAnnotation.annotations,
    ).toEqual(["^above"]);
  });

  it("keeps decorations on a rest", () => {
    // `!fermata!z4` is idiomatic; the attachment used to be dropped silently.
    const [rest] = eventsOfAbc("X:1\nK:C\n!fermata!z4\n");
    expect(rest?.type).toBe("rest");
    expect(rest?.decorations).toEqual(["fermata"]);
  });

  it("folds mode aliases so key equality is structural", () => {
    const ionian = parse("X:1\nK:Cion\nC\n");
    const major = parse("X:1\nK:Cmaj\nC\n");
    if (!ionian.ok || !major.ok) throw new Error("parse failed");
    expect(ionian.scores[0]?.key).toEqual(major.scores[0]?.key);
  });

  it("does not share one key object across scores", () => {
    const result = parse("X:1\nK:C\nC\n\nX:2\nK:C\nD\n");
    if (!result.ok) throw new Error("parse failed");
    expect(result.scores[0]?.key).not.toBe(result.scores[1]?.key);
  });
});

describe("V: octave= shifts the written pitch", () => {
  const pitchesOf = (abc: string, voiceIndex: number) => {
    const result = parse(abc);
    if (!result.ok) throw new Error("expected parse to succeed");
    const voice = result.scores[0]?.voices[voiceIndex];
    return (voice?.measures ?? [])
      .flatMap((m) => m.events)
      .filter((e) => e.type === "note")
      .map((n) => (n.pitch.octave - 4) * 7 + stepIndex(n.pitch.step));
  };

  const TWO_VOICES =
    "X:1\nM:4/4\nL:1/4\nV:1 clef=treble\nV:2 clef=bass octave=-2\nK:C\nV:1\nCDEF|\nV:2\nCDEF|\n";

  it("moves the notehead, and is not a sounding-only shift", () => {
    // Settled by probing abcjs 6.6.3: an unshifted voice reports pitch 0 where
    // `octave=-2` reports -14, so the written pitch moves and so do the noteheads.
    // The model recorded this as "a sounding shift" with the question left open, and
    // the content gate ADDED the shift back before comparing — which made this fixture
    // pass while our noteheads sat two octaves off abcjs's. Both are now corrected.
    expect(pitchesOf(TWO_VOICES, 0)).toEqual([0, 1, 2, 3]);
    expect(pitchesOf(TWO_VOICES, 1)).toEqual([-14, -13, -12, -11]);
  });

  it("shifts by whole octaves in either direction", () => {
    const up = "X:1\nL:1/4\nV:1 octave=1\nK:C\nCDEF|\n";
    expect(pitchesOf(up, 0)).toEqual([7, 8, 9, 10]);
  });

  it("leaves an unshifted voice alone", () => {
    expect(pitchesOf("X:1\nL:1/4\nV:1\nK:C\nCDEF|\n", 0)).toEqual([0, 1, 2, 3]);
  });
});

describe("strict drops the decorations abcjs does not know", () => {
  const decorationsOf = (abc: string, mode: "abcjs-strict" | "abc2.1") => {
    const result = parse(abc, { mode });
    if (!result.ok) throw new Error("expected parse to succeed");
    const event = result.scores[0]?.voices[0]?.measures[0]?.events[0];
    return event && event.type !== "rest" ? [...event.decorations] : [];
  };
  const note = (d: string) => `X:1\nL:1/4\nK:C\n${d}F G|\n`;

  it("drops `!staccato!` but keeps the `.` shorthand — abcjs does exactly this", () => {
    // abcjs's five decoration tables all omit `staccato`, while its `.` path hard-codes
    // the name (abc_parse_music.js:785). So the two spellings disagree, and strict has to
    // disagree the same way. This was the S1-decorations divergence.
    expect(decorationsOf(note("!staccato!"), "abcjs-strict")).toEqual([]);
    expect(decorationsOf(note("."), "abcjs-strict")).toEqual(["staccato"]);
  });

  it("keeps everything abcjs does know, including dynamics and hairpins", () => {
    // Regression: filtering against `legalAccents` ALONE — the obvious list, and the one
    // that omits staccato — dropped every dynamic and hairpin in the corpus and cost five
    // fixtures on the content gate. Acceptance spans five tables, not one.
    expect(decorationsOf(note("!accent!"), "abcjs-strict")).toEqual(["accent"]);
    expect(decorationsOf(note("!p!"), "abcjs-strict")).toEqual(["p"]); // volumeDecorations
    expect(decorationsOf(note("!<(!"), "abcjs-strict")).toEqual(["<("]); // accentDynamicPseudonyms
    expect(decorationsOf(note("!crescendo(!"), "abcjs-strict")).toEqual([
      "crescendo(",
    ]); // dynamicDecorations
    expect(decorationsOf(note("!tr!"), "abcjs-strict")).toEqual(["tr"]); // accentPseudonyms
  });

  it("strips a leading ^ or _ before deciding, as abcjs does", () => {
    // `^`/`_` force the mark above or below and are not part of the name, so `!^trill!`
    // resolves to trill. Only when something follows: bare `!^!` is itself a pseudonym
    // for umarcato. Verified against 6.6.3 for all four spellings below.
    expect(decorationsOf(note("!^trill!"), "abcjs-strict")).toEqual(["^trill"]);
    expect(decorationsOf(note("!_fermata!"), "abcjs-strict")).toEqual([
      "_fermata",
    ]);
    expect(decorationsOf(note("!^!"), "abcjs-strict")).toEqual(["^"]);
    // ...and stripping does not rescue a name abcjs still would not know.
    expect(decorationsOf(note("!^staccato!"), "abcjs-strict")).toEqual([]);
  });

  it("accepts any name in non-strict modes", () => {
    // ABC 2.1's reading: an unknown decoration is one the renderer has no glyph for, not
    // a parse error. Only strict reproduces abcjs's rejection.
    expect(decorationsOf(note("!staccato!"), "abc2.1")).toEqual(["staccato"]);
    expect(decorationsOf(note("!madeupname!"), "abc2.1")).toEqual([
      "madeupname",
    ]);
    expect(decorationsOf(note("!madeupname!"), "abcjs-strict")).toEqual([]);
  });
});

describe("frere-jacques: the `+:` prose lexes to abcjs's notes", () => {
  // frere-jacques is excluded from the content gate as a KNOWN_DIVERGENCE, so without
  // this nothing would notice the part that DOES agree. abcjs has no `+:` continuation,
  // so a copyright notice is read as music; strict reproduces that, and since the
  // unclosed-`+` fix it reproduces it note for note. The residual difference is decoration
  // and chord-symbol attachment, not pitch or rhythm.
  const abc = fixture("frere-jacques");
  const oursNotes = () => {
    const result = parse(abc, { mode: "abcjs-strict" });
    if (!result.ok) throw new Error("expected frere-jacques to parse");
    return result.scores
      .flatMap((s) => s.voices)
      .flatMap((v) => v.measures)
      .flatMap((m) => m.events)
      .filter((e) => e.type === "note");
  };

  it("produces exactly abcjs's note count", () => {
    // Was 50 against 45. abcjs's getBrackettedSubstring gives up after 5 characters on an
    // unclosed `+`, so `+:belongs…` starts its first note at the `g`, not the `b`.
    expect(oursNotes()).toHaveLength(goldenNotes("frere-jacques").length);
    expect(oursNotes().length).toBe(45);
  });

  it("agrees with abcjs on every pitch and duration", () => {
    const theirs = goldenNotes("frere-jacques");
    const ours = oursNotes();
    expect(
      ours.map((n) => (n.pitch.octave - 4) * 7 + stepIndex(n.pitch.step)),
    ).toEqual(theirs.map((e) => e.pitches?.[0]?.pitch));
    expect(ours.map((n) => ratToNumber(n.notatedDuration))).toEqual(
      theirs.map((e) => e.duration),
    );
  });

  it("reads `+:` as a real continuation under abc2.1, where it is not music at all", () => {
    // The mode split: the prose is a field continuation, so the tune has only its real
    // notes. This is the number a reader would call correct.
    const result = parse(abc, { mode: "abc2.1" });
    if (!result.ok) throw new Error("expected frere-jacques to parse");
    const notes = result.scores
      .flatMap((s) => s.voices)
      .flatMap((v) => v.measures)
      .flatMap((m) => m.events)
      .filter((e) => e.type === "note");
    expect(notes.length).toBeLessThan(45);
  });
});

describe("`s:` symbol lines", () => {
  // ABC 2.1 §8.2. Same token grammar as `w:` — space advances a note, `*` skips one.
  const abc =
    "X:1\nT:t\nM:4/4\nL:1/4\nK:C\nCDEF|\ns: !trill! * !fermata! !staccato!\n";
  const events = (mode: CompatibilityMode) => {
    const result = parse(abc, { mode });
    if (!result.ok) throw new Error("expected the symbol-line tune to parse");
    return (result.scores[0]?.voices[0]?.measures ?? [])
      .flatMap((m) => m.events)
      .filter((e) => e.type !== "rest");
  };

  it("places them as decorations, skipping a note for `*`", () => {
    expect(events("extended").map((e) => e.decorations)).toEqual([
      ["trill"],
      [],
      ["fermata"],
      ["staccato"],
    ]);
    // The delimiters are stripped, so they share the namespace `U:` and `!trill!` use.
    expect(events("extended").map((e) => e.lyric)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("reproduces abcjs under strict, where they come out as LYRIC TEXT", () => {
    // Not a shortcut — abcjs reads `s:` with its `w:` parser and pushes the tokens onto
    // `el.lyric` (`parse/abc_parse.js:317-395`); its own TODO at `:325` says as much. A
    // strict render therefore prints `!trill!` under the staff, delimiters and all.
    expect(events("abcjs-strict").map((e) => e.lyric)).toEqual([
      "!trill!",
      // A `*` is an EMPTY syllable, not an absent one — see the `w:` tests above.
      "",
      "!fermata!",
      "!staccato!",
    ]);
    expect(events("abcjs-strict").map((e) => e.decorations)).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it("follows a `w:` as the next verse under strict, as `el.lyric.push` does", () => {
    const withWords = parse(
      "X:1\nT:t\nM:4/4\nL:1/4\nK:C\nCDEF|\nw: a b c d\ns: !trill! * * *\n",
      {
        mode: "abcjs-strict",
      },
    );
    if (!withWords.ok) throw new Error("expected it to parse");
    const first = withWords.scores[0]?.voices[0]?.measures[0]?.events[0];
    expect(first?.type === "note" ? first.lyric : null).toBe("a");
    expect(first?.type === "note" ? first.extraVerses : null).toEqual([
      "!trill!",
    ]);
  });
});
