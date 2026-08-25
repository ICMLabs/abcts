import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

/**
 * **A `[V:x]` WRITTEN AFTER MUSIC ON THE SAME LOGICAL LINE OPENS A NEW SYSTEM — CLOSED.**
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
 * ⚠️ **THERE ARE TWO MECHANISMS AND THEY ARE NOT THE SAME ONE.** That is why no single
 * rule fits the table, and why the obvious fix passes all six rows and breaks the corpus:
 *
 *   1. **`delayStartNewLine && !this.lineContinuation`** (`abc_parse_music.js:151-159`).
 *      ANY inline `[V:` sets the flag — a repeat of the current voice included — and it
 *      fires at the next non-header token unless the line CONTINUES the one above. abcjs's
 *      own comment on it reads *"fixes bug on this: c[V:2]d"*. Rows 1, 2 and 3.
 *      `VoiceBuilder.inlineVoiceField` is this one.
 *   2. **`tuneBuilder.setCurrentVoice`'s LINE SCAN**, which runs only on a REAL switch: a
 *      repeat early-returns at `if (multilineVars.currentVoice) { if (same) return }`
 *      before ever reaching it (`abc_parse_key_voice.js:526-531`). Row 4, where the first
 *      line's notes went to the IMPLICIT voice and `currentVoice` was still unset, so
 *      `[V:1]` switches for real. `VoiceBuilder.switchedTo` is this one.
 *
 * ⚠️ **AND CONFLATING THEM WAS TRIED AND REVERTED FIRST.** Removing `selectVoice`'s
 * early return takes all six shapes to abcjs's answer AND takes
 * `abcjs-visual-parsing-03-v-1-f` and `-09-score-t-b` — two of abcjs's OWN test tunes,
 * both `\`-continued — from byte-exact to differing. **One surface's green cannot clear
 * another's.**
 *
 * ⚠️ **AND INSTRUMENTING BOTH SITES AT ONCE IS WHAT SEPARATED THEM.** Rows 4 and 5 trace
 * IDENTICALLY through mechanism 1 — `hasBeginMusic=true delay=true lineContinuation=true`,
 * no break — and differ entirely in mechanism 2, where row 4 prints `had=NONE -> SWITCHING`
 * and row 5 `-> EARLY RETURN`. Probing either one alone says the other cannot be the cause.
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

  /** The four rows mechanism 1 and mechanism 2 between them account for. */
  it("opens a new system with no V: anywhere", () => {
    expect(systems(`${HEAD}K:C\nCDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it("opens a new system after a header V:1", () => {
    expect(systems(`${HEAD}V:1\nK:C\nCDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it("opens a new system when the line opened with an inline [V:1]", () => {
    expect(systems(`${HEAD}K:C\n[V:1]CDEF|[V:1]GABc|\n`)).toBe(2);
  });

  it("opens a new system across a continuation the line did not open with", () => {
    expect(systems(`${HEAD}K:C\nCDEF|\\\n[V:1]GABc|\n`)).toBe(2);
  });
});
