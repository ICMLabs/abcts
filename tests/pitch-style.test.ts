import { describe, expect, it } from "vitest";

import { parseOnly, renderAbc } from "../src/compat/index.js";

/**
 * **A `!style=…!` INSIDE BRACKETS IS THE NEXT HEAD'S, NOT THE CHORD'S** — the one
 * decoration that is, and abcjs's own comment at the site says so:
 *
 *     if (accent[0] > 0) { // If we found a style above, it modifies the individual pitch,
 *                          // not the entire chord.
 *
 * (`abc_parse_music.js:375-379`.) The engraver then resolves the head PER PITCH —
 * `if (elem.pitches[p].style) c = chartable[elem.pitches[p].style][-durlog]`
 * (`abstract-engraver.js:678-688`) — BEFORE it consults `%%percmap`, so a mapped voice
 * still draws what the brackets asked for.
 *
 * ⚠️ **AND THREE OTHER QUANTITIES READ THE HEAD IT PICKS**, none of which any gate could
 * state until this fixture existed, because all three are byte-level and move no notehead
 * centre:
 *
 *   - **an up-stem's x is `abselem.heads[0].w`** (`:747`) — the chord's LOWEST head, not
 *     its stemmed one and not the chord's own glyph, so `[!style=harmonic!CEG]` hangs its
 *     stem off the diamond's 7.5 while the head it reaches is an ordinary 9.81;
 *   - **a ledger's width is `Math.max(getSymbolWidth(c), symbolWidth)` over the PITCH
 *     loop** (`:723`, spent at `:850`), so one styled head widens the rule for all of them;
 *   - **the curves of one element go out per HEAD** — `addSlursAndTies` runs inside the
 *     pitch loop (`:728`), so `([CEG]2-[CEG]2)` writes tie, SLUR, tie, tie.
 */
const pitches = (abc: string): unknown[] => {
  const out: unknown[] = [];
  for (const line of (parseOnly(abc)[0] as unknown as { lines?: unknown[] })?.lines ?? []) {
    for (const staff of (line as { staff?: unknown[] }).staff ?? []) {
      for (const voice of (staff as { voices?: unknown[][] }).voices ?? []) {
        for (const e of voice) {
          const p = (e as { pitches?: unknown[] }).pitches;
          if (p !== undefined) out.push(...p);
        }
      }
    }
  }
  return out;
};

const HEAD = "X:1\nT:t\nL:1/8\nK:C\n";

describe("a per-pitch !style=…! in a chord", () => {
  it("lands on the head it was written before, and nowhere else", () => {
    expect(pitches(`${HEAD}[!style=harmonic!CEG]2|\n`)).toEqual([
      { pitch: 0, name: "C", style: "harmonic", verticalPos: 0 },
      { pitch: 2, name: "E", verticalPos: 2 },
      { pitch: 4, name: "G", verticalPos: 4 },
    ]);
  });

  it("takes each head in turn where two are styled", () => {
    expect(pitches(`${HEAD}[!style=x!C!style=triangle!EG]2|\n`)).toEqual([
      { pitch: 0, name: "C", style: "x", verticalPos: 0 },
      { pitch: 2, name: "E", style: "triangle", verticalPos: 2 },
      { pitch: 4, name: "G", verticalPos: 4 },
    ]);
  });

  it("is NOT the chord's decoration", () => {
    const el = (
      (parseOnly(`${HEAD}[!>!C!style=x!EG]2|\n`)[0] as unknown as { lines: { staff: { voices: unknown[][] }[] }[] })
        .lines[0]?.staff[0]?.voices[0]?.[0] ?? {}
    ) as { decoration?: unknown };
    expect(el.decoration).toEqual(["accent"]);
  });
});

/**
 * ⚠️ **MEASURED AND NOT BUILT — A STEM-DOWN CHORD HANGS ITS SLUR ON THE TOP HEAD.**
 *
 * abcjs's two tests are `isTopWhenStemIsDown = (stemdir === "up" || dir === "up") && p ===
 * 0` and `isBottomWhenStemIsUp = (stemdir === "down" || dir === "down") && p === pp - 1`
 * (`abstract-engraver.js:692-694`), so the head a chord's slur is hung on follows the STEM.
 * Ours takes the lowest head always, which is right for every stem-up chord — which is
 * every chord in both corpora that carries a slur.
 *
 * **IT IS THE ANCHOR ALONE, NOT THE ORDER**, which the head-order key already gets right:
 *
 *     ([ceg]2-[ceg]2)     abcjs  tie 89.47, tie 81.72, tie 73.97, slur 72.81
 *                         ours   tie 89.47, tie 81.72, tie 73.97, slur 76.68
 *
 * ⚠️ **AND THE OBVIOUS FIX IS MEASURED AND WRONG.** Moving the anchor's `first` pitch to
 * the top head for a stem-down chord takes this shape to abcjs's answer AND takes
 * `S8-layout-tune7` off the sibling byte gate's ratchet, five rows — because `first` feeds
 * `pitchStep`/`pitchY`, which every TIE reads too. The slur needs its own step, threaded
 * past the ten sites that read `pitchStep` for both kinds. **One surface's green cannot
 * clear another's**, for the second time on this rule.
 */
it.fails("hangs a stem-down chord's slur on the top head", () => {
  const svg =
    (renderAbc("*", `${HEAD}([ceg]2-[ceg]2)|\n`, { staffwidth: 670 })[0] as { svg?: string })
      ?.svg ?? "";
  const slur = /<path d="M [\d.]+ ([\d.]+)[^"]*"[^>]*data-name="slur"/.exec(svg);
  expect(slur?.[1]).toBe("72.81");
});

/**
 * ⚠️ **TWO `!…!` WRITTEN BACK-TO-BACK BREAK THE CHORD THEY OPEN, AND THE FIRST OF THEM IS
 * LOST — BUILT, and this assertion is real now.** `letter_to_accent` runs ONCE per
 * iteration of the chord loop and a pitch must follow (`abc_parse_music.js:352-357`); a
 * second mark falls to the `else`, which warns and appends only `if (el.pitches !==
 * undefined)`, leaving the source to be re-read from there (`:472-489`). Measured through
 * abcjs 6.7.0, `parseOnly`, and all four rows now agree:
 *
 *     [!>!!tenuto!CEG]2|   THREE notes, the first carrying `decoration: ["tenuto"]`,
 *                          then a `bar_invisible` with `startEnding: "2"` — the `]2`
 *     [!>! !tenuto!CEG]2|  one chord, `decoration: ["tenuto"]` — the accent still lost
 *     [!tenuto!C!>!EG]2|   one chord, `decoration: ["tenuto", "accent"]` — both kept
 *     !>!!tenuto!CEG|      three notes, `decoration: ["accent", "tenuto"]` — both kept
 *
 * So the adjacency costs the FIRST decoration wherever it is written, and inside brackets
 * it also costs the chord. It is a decoration-tokenizer edge rather than anything to do
 * with `style=`, which is why `abcts-pitch-style` does not carry the shape — the fixture
 * was written with it and the row it opened was about `!…!!…!`, not about `style=`.
 */
it("breaks the chord when two !…! open it, losing the first", () => {
  const voice = (
    parseOnly(`${HEAD}[!>!!tenuto!CEG]2|\n`)[0] as unknown as {
      lines: { staff: { voices: { el_type: string; decoration?: string[] }[][] }[] }[];
    }
  ).lines[0]?.staff[0]?.voices[0];
  expect(voice?.filter((e) => e.el_type === "note")).toHaveLength(3);
  expect(voice?.[0]?.decoration).toEqual(["tenuto"]);
});

/**
 * …**AND A SPACE IS RECOVERED FROM RATHER THAN FATAL, DROPPING THE ACCENT WITH IT.**
 * abcjs warns "Spaces are not allowed in chords", skips the character and starts the
 * iteration over (`abc_parse_music.js:392-395`), so the mark the failed iteration had
 * already read is thrown away and the chord survives. The pair below is what separates
 * the two arms: the same two decorations, one chord or three notes depending on a space.
 */
it("recovers from a space in a chord, losing the accent the failed iteration read", () => {
  const notes = (abc: string) =>
    (
      parseOnly(abc)[0] as unknown as {
        lines: { staff: { voices: { el_type: string; decoration?: string[] }[][] }[] }[];
      }
    ).lines[0]?.staff[0]?.voices[0]?.filter((e) => e.el_type === "note") ?? [];
  const spaced = notes(`${HEAD}[!>! !tenuto!CEG]2|\n`);
  expect(spaced).toHaveLength(1);
  expect(spaced[0]?.decoration).toEqual(["tenuto"]);
  // …and a mark written AFTER a head opens a fresh iteration, so both survive.
  const inner = notes(`${HEAD}[!tenuto!C!>!EG]2|\n`);
  expect(inner).toHaveLength(1);
  expect(inner[0]?.decoration).toEqual(["tenuto", "accent"]);
});
