import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

/**
 * **A `[V:x]` WRITTEN AFTER MUSIC ON THE SAME LOGICAL LINE OPENS A NEW SYSTEM IN abcjs, AND
 * NOT HERE — MEASURED, NOT BUILT.**
 *
 * Found while chasing §2e's `transpose` row, which turned out not to be about `transpose`
 * at all: a bare `[V:1]` does the same thing. ⚠️ **MEASURE WHAT THE ROW POINTS AT, NOT WHAT
 * IT WAS NAMED** — `V:… transpose=` in a header and on two voices are both byte-exact.
 *
 * THE SIX SHAPES, through both engines at the goldens' own `{staffwidth: 670}`:
 *
 *     shape                                          abcjs  ours
 *     CDEF|[V:1]GABc|            (no V: anywhere)        2     1
 *     V:1 header, then CDEF|[V:1]GABc|                   2     1
 *     [V:1]CDEF|[V:1]GABc|                               2     1
 *     CDEF|\  +  [V:1]GABc|                              2     1
 *     [V:1]CDEF|\  +  [V:1]GABc|                         1     1   ✓
 *     [V:1]CDEF|  +  [V:1]GABc|                          2     2   ✓
 *
 * So the rule is not "a repeat switches voice" and it is not "a continuation suppresses the
 * break": the two agreeing rows straddle both. What separates row 4 from row 5 is whether
 * the LOGICAL LINE ITSELF OPENED with a `[V:1]`.
 *
 * ⚠️ **AND `setCurrentVoice`'s GUARD IS NOT THE MECHANISM — PROBED, NOT ASSUMED.** The
 * obvious reading is `if (currentVoice.index === … && staffNum === …) return // there was
 * no change` (`abc_parse_key_voice.js:526-531`), so a repeat does nothing and the early
 * return is what our `selectVoice` already reproduces. A `console.error` on both arms says
 * abcjs takes **EARLY RETURN in row 4 and row 5 alike** — the rows that disagree with each
 * other — so whatever opens the system is somewhere else, and removing our guard is not it.
 *
 * ⚠️ **AND REMOVING IT WAS TRIED AND REVERTED.** All six shapes went to abcjs's answer and
 * `abcjs-visual-parsing-03-v-1-f` and `-09-score-t-b` — two of abcjs's OWN test tunes, both
 * `\`-continued — went from byte-exact to differing. One surface's green cannot clear
 * another's, and this is the shape where that bites.
 *
 * **THE NEXT MOVE** is to instrument `abc_parse_music.js`'s inline-field arm rather than
 * `parseVoice`: `case "[V:"` returns a fourth element `needsNewLine` whose own
 * `startNewLine()` is COMMENTED OUT (`abc_parse_header.js:400-405`), so the break is being
 * raised by the caller and not by the switch. Find which caller before touching anything.
 */
const systems = (abc: string): number =>
  (
    ((renderAbc("*", abc, { staffwidth: 670 })[0] as { svg?: string })?.svg ?? "").match(
      /abcjs-top-line/g,
    ) ?? []
  ).length;

const HEAD = "X:1\nT:t\nL:1/8\n";

describe("a [V:x] after music on the same logical line", () => {
  it("agrees where the line OPENED with the same [V:x] and continues", () => {
    // Row 5 — abcjs draws one system and so do we. `abcjs-visual-parsing-03-v-1-f` is this
    // shape and is byte-exact, which is what removing our guard broke.
    expect(systems(`${HEAD}K:C\n[V:1]CDEF|\\\n[V:1]GABc|\n`)).toBe(1);
  });

  it("agrees where an ordinary newline separates them", () => {
    // Row 6 — the newline breaks the system whatever the `[V:1]` does.
    expect(systems(`${HEAD}K:C\n[V:1]CDEF|\n[V:1]GABc|\n`)).toBe(2);
  });

  /**
   * The four rows that differ. abcjs draws TWO systems for each; we draw one. They go RED
   * the moment the rule above is found and ported, which is what they are for.
   */
  it.fails("opens a new system with no V: anywhere", () => {
    expect(systems(`${HEAD}K:C\nCDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it.fails("opens a new system after a header V:1", () => {
    expect(systems(`${HEAD}V:1\nK:C\nCDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it.fails("opens a new system when the line opened with an inline [V:1]", () => {
    expect(systems(`${HEAD}K:C\n[V:1]CDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it.fails("opens a new system across a continuation the line did not open with", () => {
    expect(systems(`${HEAD}K:C\nCDEF|\\\n[V:1]GABc|\n`)).toBe(2);
  });
});
