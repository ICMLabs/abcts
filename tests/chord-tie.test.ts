import { describe, expect, it } from "vitest";

import { flattenAudio } from "../src/audio/flatten.js";
import { parse } from "../src/parser/parser.js";

/**
 * **A CHORD'S TIES ARE PER PITCH — CLOSED 2026-08-22.**
 *
 * The renderer has known this since 2026-08-12 — `el.pitches.forEach(pitch => { pitch.startTie
 * = {} })` (`abc_parse_music.js:427`), so `[GB]8-` builds TWO `TieElem`s — and
 * `Chord.tiedPitches` carries it. The FLATTENER never learned: its tie map is inside
 * `if (event.type === 'note')`, so a chord's tie does nothing whatever.
 *
 * MEASURED through both engines on three controls at `L:1/4 K:C`:
 *
 *     c-|c|            ours 72@0 d0.5                    abcjs the same          ✓
 *     [ceg]-|[ceg]|    ours SIX notes, each d0.25        abcjs THREE, each d0.5  ✗
 *     [B-eg-b-]|[Begb] ours EIGHT notes, each d0.25      abcjs FIVE:             ✗
 *                                                          71@0   d0.5
 *                                                          76@0   d0.25
 *                                                          79@0   d0.5
 *                                                          83@0   d0.5
 *                                                          76@0.25 d0.25
 *
 * **AND abcjs's ALGORITHM IS PER-PITCH DURATION WITH THE TIED HEAD NULLED OUT**
 * (`abc_midi_flattener.js:287-325`): every pitch is given `pitch.duration =
 * element.duration`; a `startTie` records `{el, pitch}` unless one is already open, in
 * which case the open one's duration GROWS and this pitch becomes `null`; an `endTie` adds
 * its duration to the open one and nulls itself; `element.duration` is then DELETED so
 * nothing downstream reads a whole-event duration; and an unclosed `startTie` is simply
 * cleared. Ties key on the WRITTEN pitch, so a chord can hold four independent ones.
 *
 * **PORTED.** `VoiceItem.tieExtra` and `.tieSilenced` are the per-HEAD halves of what
 * `tiedOver` says for a whole event: a head folded into an earlier tie sounds nothing and
 * its duration is added to the head that opened it, keyed by the head's own name. **The
 * CLOCK is untouched** — only the note path moves a duration between events, because a
 * chord with some heads tied still sounds and still spends its own time.
 *
 * These tests assert what abcjs DOES. They were `.fails` while the gap stood and went RED
 * the moment it closed, which is what they were written for; the `.fails` are gone and the
 * gate holds the behaviour now. The three oracles that made this delicate — 0 of 72 events,
 * 0 of 3 MIDI files, 0 of 38 timings — are all still at zero.
 */
const notes = (
  abc: string,
): [pitch: number, start: number, duration: number][] => {
  const p = parse(`X:1\nL:1/4\nK:C\n${abc}\n`, { mode: "abcjs-strict" });
  const score = p.ok ? p.scores[0] : undefined;
  if (score === undefined) return [];
  return flattenAudio(score, {})
    .tracks.flat()
    .flatMap((e) =>
      (e as { cmd?: string }).cmd === "note"
        ? [
            [
              (e as { pitch: number }).pitch,
              (e as { start: number }).start,
              (e as { duration: number }).duration,
            ] as [number, number, number],
          ]
        : [],
    );
};

describe("a tie inside a chord", () => {
  it("ties a single note, which has always worked", () => {
    expect(notes("c-|c|")).toEqual([[72, 0, 0.5]]);
  });

  it("ties EVERY head of a fully tied chord", () => {
    expect(notes("[ceg]-|[ceg]|")).toEqual([
      [72, 0, 0.5],
      [76, 0, 0.5],
      [79, 0, 0.5],
    ]);
  });

  it("ties only the heads that carry one", () => {
    // `[B-eg-b-]` ties B, g and b; the `e` re-articulates.
    expect(notes("[B-eg-b-]|[Begb]|")).toEqual([
      [71, 0, 0.5],
      [76, 0, 0.25],
      [79, 0, 0.5],
      [83, 0, 0.5],
      [76, 0.25, 0.25],
    ]);
  });
});

/**
 * **AND THE MARK'S POSITION IS A DIFFERENT MECHANISM, NOT A SHORTHAND — MEASURED
 * 2026-09-09.**
 *
 * abcjs has two tie states and they are told apart by WHERE THE `-` IS WRITTEN, never by
 * how many heads carry one:
 *
 *   inside the bracket   `multilineVars.inTieChord[<position>]`, read ONLY by the chord
 *                        loop (`abc_parse_music.js:381-386`)
 *   after the bracket    `isInTie`, read by the next element whatever it is (`:529-536`)
 *
 * So a `[C-E]` waits for the next CHORD, however far away, and stamps `endTie` on whatever
 * pitch stands at that POSITION; the flattener then merges only if the pitch matches. Every
 * row below was probed through abcjs 6.7.0 in WebKit, `setUpAudio().tracks`:
 *
 *     [C-E]C|        C 0.25, E 0.25, C 0.25   a single note is not a chord: no tie at all
 *     [C-E-]C|       the same                 EVERY head tied changes nothing
 *     [C-E]z[CE]|    C 0.5                    a rest does not kill it, where `C-z C` dies
 *     [C-E]D[CE]|    C 0.5                    nor does an intervening NOTE
 *     [C-E][EC]|     no merge                 position 0 is E there: the pitch misses
 *     [C-E][GE]|     no merge                 same, with a pitch in neither chord
 *     [CE]-C|        C 0.5                    the after-bracket mark DOES reach a note
 *
 * We closed it by NAME on the next element, so `[C-E]C|` merged and `[C-E]z[CE]|` died at
 * the rest — and the parser collapsed `[C-E-]` into the after-bracket form. See
 * `chordTies` in `src/audio/flatten.ts`.
 */
describe("where the tie mark is written decides what can close it", () => {
  it("does NOT reach a single note from inside the bracket", () => {
    expect(notes("[C-E]C|")).toEqual([
      [60, 0, 0.25],
      [64, 0, 0.25],
      [60, 0.25, 0.25],
    ]);
  });

  it("does not reach one even when EVERY head carries a mark", () => {
    // The collapse this file's parser used to make: `[C-E-]` is not `[CE]-`.
    expect(notes("[C-E-]C|")).toEqual([
      [60, 0, 0.25],
      [64, 0, 0.25],
      [60, 0.25, 0.25],
    ]);
  });

  it("DOES reach a single note from after the bracket", () => {
    // The control that keeps the two mechanisms apart: same notes, mark moved.
    expect(notes("[CE]-C|")).toEqual([
      [60, 0, 0.5],
      [64, 0, 0.25],
    ]);
  });

  it("survives a rest, a note and a barline to reach the next chord", () => {
    expect(notes("[C-E]z[CE]|")).toEqual([
      [60, 0, 0.5],
      [64, 0, 0.25],
      [64, 0.5, 0.25],
    ]);
    expect(notes("[C-E]D[CE]|")).toEqual([
      [60, 0, 0.5],
      [64, 0, 0.25],
      [62, 0.25, 0.25],
      [64, 0.5, 0.25],
    ]);
  });

  it("closes at the POSITION it opened, so a reordered chord misses", () => {
    // `[EC]` has E at POSITION 0, where the tie is: the pitch does not match and both
    // chords sound in full. A name-keyed reading merges here, which is what ours did.
    // (The heads come out in PITCH order, not source order — both engines, and the MIDI
    // bytes agree on this tune, which is where that order is observable.)
    expect(notes("[C-E][EC]|")).toEqual([
      [60, 0, 0.25],
      [64, 0, 0.25],
      [60, 0.25, 0.25],
      [64, 0.25, 0.25],
    ]);
  });
});
