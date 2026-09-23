import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **THE THREE RULES THAT EMPTIED `OPEN.accessors`** — nine field-rows over five tunes, and
 * no two of them the same mechanism. Every expectation is abcjs 6.7.1's own answer, read
 * out of a WebKit page.
 */
const ask = (music: string, head = "X:1\nL:1/4\nK:C\n") => {
  const tune = renderAbc("*", `${head}${music}\n`)[0];
  tune?.setTiming();
  return {
    pickup: tune?.getPickupLength(),
    time: tune?.getTotalTime(),
    beats: tune?.getTotalBeats(),
  };
};

/**
 * **`computePickupLength` IS LINE-MAJOR, NOT VOICE-MAJOR** — three nested loops over
 * `lines[i].staff[j].voices[v]` (`abc_tune.js:108-134`), so it reaches every voice of the
 * FIRST system before the second system of the first voice, accumulating across staves and
 * shedding a bar length whenever it passes one. Walking voice by voice reads the same for
 * an ordinary tune and differently the moment a voice's first line is not the tune's.
 *
 * BREAK: walk `score.voices` then `voice.measures` again and the `P:` rungs read 0.5/0.625.
 */
describe("getPickupLength", () => {
  const head = "X:1\nM:4/4\nL:1/8\nK:C\n";

  it("is one voice's own lead-in when the voices line up", () => {
    expect(ask("V:1\nCD|\nV:2\nC,4 G,4|", head).pickup).toBe(0.25);
  });

  /**
   * `[V:1]P:A` on a line of its own makes `L0` hold that line's element AND the second
   * voice's whole measure, which sums past the bar length and sheds it.
   */
  it("accumulates across the staves of one line, shedding a bar length", () => {
    expect(ask("V:1\nV:2\n[V:1]P:A\n[V:1]CDEF|\n[V:2]C,4 G,4|", head).pickup).toBe(0.125);
  });

  it("…and the same tune without the P: line reads its own first voice", () => {
    expect(ask("V:1\nV:2\n[V:1]CDEF|\n[V:2]C,4 G,4|", head).pickup).toBe(0.5);
  });

  /** A triplet's members carry the multiplier, which the walk applies. */
  it("applies a triplet's multiplier", () => {
    expect(ask("(3CDE F|", head).pickup).toBe(0.375);
  });
});

/**
 * **THE CLOCK STARTS AT `metaText.tempo`, WHICH AN INLINE `[Q:]` IS NOT.** `var tempo =
 * this.metaText ? this.metaText.tempo : null; var naturalBpm = this.getBpm(tempo)`
 * (`abc_tune.js:592-593`) — so a tune whose only tempo is inline starts at the DEFAULT and
 * changes where the `[Q:]` stands, rather than playing the whole tune at that rate.
 *
 * TWO CHANGES, and each is load-bearing: the starting bpm, and the head-of-voice tempo
 * ELEMENT, which was pushed for `score.tempo` whatever its origin — so an inline `[Q:]`
 * was filed under measure 0 and governed the bars before it. Reverting either one takes
 * the first two rungs back to 5.333.
 */
describe("an inline [Q:] and the clock", () => {
  it("leaves the bars before it at the default rate", () => {
    expect(ask("CDEF|[Q:1/4=90]GABc|")).toEqual({ pickup: 0, time: 4, beats: 12 });
  });

  it("…and a repeat replays them at the rate in force there", () => {
    expect(ask("CDEF|1[Q:1/4=90] GABc:|2 cdef|]")).toEqual({
      pickup: 0,
      time: 9.333,
      beats: 27.999000000000002,
    });
  });

  it("…while a HEADER Q: is the starting rate, as it always was", () => {
    expect(ask("CDEF|[Q:1/4=90]GABc|", "X:1\nQ:1/4=120\nL:1/4\nK:C\n")).toEqual({
      pickup: 0,
      time: 4.667,
      beats: 9.334,
    });
  });

  it("…and a tune with no tempo at all is unmoved", () => {
    expect(ask("CDEF|GABc|")).toEqual({ pickup: 0, time: 2.667, beats: 8.001 });
  });
});

/**
 * **A NOTE LONGER THAN A BREVE HAS NO HEAD AND STILL TAKES ITS TIME.** `chartable.note`
 * runs out one entry past the breve, so abcjs adds a DEBUG element in place of the glyph
 * (`create-note-head.js:24-25`) — which we decline to draw, a ruled divergence — but the
 * AbsoluteElement is built either way, so the note keeps its place in `makeVoicesArray`.
 *
 * Ours returned a layout element with no `sourceEvent`, so the timing's `%%maxStaves` rule
 * — "an element with an event and NO geometry is one abcjs never saw" — read it as
 * truncated and gave the WHOLE TUNE zero seconds. The ink is the declared divergence; the
 * clock never was.
 *
 * BREAK: drop the `sourceEvent` from that early return and `time` comes back 0.
 */
describe("a note past the breve", () => {
  const head = "X:1\nL:1/8\nK:C\n";

  it.each([
    ["C32 D32|", 10.667],
    ["C32|", 5.333],
    ["C24 D24|", 8],
    ["C17|", 2.833],
  ])("%s sounds for %s seconds", (music, time) => {
    expect(ask(music, head).time).toBe(time);
  });
});
