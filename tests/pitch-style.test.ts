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
 * ⚠️ **A STEM-DOWN CHORD HANGS ITS SLUR ON THE TOP HEAD — BUILT, and this assertion is
 * real now.**
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
 * `pitchStep`/`pitchY`, which every TIE reads too. **One surface's green cannot clear
 * another's**, for the second time on this rule.
 *
 * ✅ **SO THE SLUR CARRIES ITS OWN STEP** — `NoteAnchor.slurPitchStep`, substituted at the
 * two element-level slur sites and nowhere a tie can reach. The byte gates are unmoved and
 * `S7-voices` tune 0 — the one baseline this changed, by 2 pitch on a single slur — is
 * byte-exact against a FRESH abcjs render. ⚠️ That check had to be made by hand: the
 * fixture is on the sibling gate's `STALE` list, so its green says nothing about it.
 */
it("hangs a stem-down chord's slur on the top head", () => {
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

/**
 * **A REPEAT ENDING AT THE END OF A LINE — `C2|1|` — KEEPS ITS LABEL.**
 *
 * A volta rides on the measure its barline OPENS and the projection matches it back to
 * that barline by position, so `C2|1 D2|` works: the `D2` measure closes and consumes it.
 * `C2|1|` has no such measure — the second `|` leaves a `pendingOpening` and the line ends
 * — so the label was set and never taken. abcjs writes `bar_thin startEnding "1"` spanning
 * `|1`, and the same character costs the SPAN as well as the label.
 *
 * ⚠️ **FOUND WHILE CHASING SOMETHING ELSE, AND THE FIRST READING WAS WRONG.** It looked
 * like a defect of the ABANDONED-CHORD path, because `[!>!!tenuto!CEG]2|` showed it and
 * `CEG]2 D2|` did not. The control that separates them is `CEG]2|`: it is the trailing
 * `|`, not the chord, and it costs an ending on ordinary music. **Measure the control
 * before naming the cause.**
 */
it("keeps a repeat ending whose measure never closes", () => {
  const bars = (abc: string) =>
    (
      parseOnly(abc)[0] as unknown as {
        lines: {
          staff: {
            voices: { el_type: string; startEnding?: string; startChar: number; endChar: number }[][];
          }[];
        }[];
      }
    ).lines[0]?.staff[0]?.voices[0]?.filter((e) => e.el_type === "bar") ?? [];
  const trailing = bars(`${HEAD}C2|1|\n`);
  expect(trailing[0]?.startEnding).toBe("1");
  // …and the digit is INSIDE that barline's element, which is what `|1` is in abcjs.
  expect(trailing[0]?.endChar).toBe((trailing[0]?.startChar ?? 0) + 2);
  // The stray-`]` spelling of the same shape, which is how it was found.
  expect(bars(`${HEAD}CEG]2|\n`)[0]?.startEnding).toBe("2");
  // …and it did not disturb the one that always worked.
  expect(bars(`${HEAD}C2|1 D2|\n`)[0]?.startEnding).toBe("1");
});

/**
 * ✅ **AN ABANDONED CHORD'S CHARACTERS BELONG TO NOTHING — BUILT.**
 *
 * abcjs leaves `startI` at the token that ended the chord, so the re-read note's element
 * opens at the SURVIVING `!…!` and the `[` with the lost `!>!` is owned by no element at
 * all. Measured through abcjs 6.7.0 on `[!>!!tenuto!CEG]2|`:
 *
 *     abcjs   note startChar 22 — the `!tenuto!`
 *     ours    note startChar 18 — the `[`
 *
 * The channel was already there: `Score.unreadable` is what the parser uses to say it
 * could not read something, and `tile` pushes an element's opening past every range on it.
 * The abandoned chord pushes one now — and so does a `-` that reaches back across a
 * barline, which `extractMeasures` was asking for at the same time. TWO SURFACES, ONE
 * RULE, AND NO NEW MECHANISM.
 */
it("opens the re-read note at the surviving decoration", () => {
  const first = (
    parseOnly(`${HEAD}[!>!!tenuto!CEG]2|\n`)[0] as unknown as {
      lines: { staff: { voices: { el_type: string; startChar: number }[][] }[] }[];
    }
  ).lines[0]?.staff[0]?.voices[0]?.find((e) => e.el_type === "note");
  expect(first?.startChar).toBe(22);
});
