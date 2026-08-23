import { describe, expect, it } from "vitest";

import { parseOnly, renderAbc } from "../src/compat/index.js";

/**
 * **THE FIVE `positionChoices` DIRECTIVES — `%%vocal`, `%%dynamic`, `%%gchord`,
 * `%%ornament`, `%%volume`.**
 *
 * Each is `addMultilineVarOneParamChoice("<x>Position", cmd, tokens, positionChoices)`
 * (`abc_parse_directive.js:824-828`), the choices being `auto`, `above`, `below` and
 * `hidden` (`:751`). `addFormattingOptions` stamps whichever are not `auto` onto every NOTE
 * element as it is appended, under `el.positioning` (`abc_parse.js:120-138`).
 *
 * ── WHERE THIS CAME FROM ────────────────────────────────────────────────────
 * The 2026-08-23 sweep of abcjs's own `AbcElement` field list (`types/index.d.ts`) against
 * what both corpora produce: `AbcElemPositioning` declares five fields and **not one of
 * 487 tunes has ever produced any of them**, parsed or rendered.
 *
 * ⚠️ **AND THEY HAD BEEN SWEPT ONCE ALREADY AND CALLED "SAME".** The 2026-08-22 directive
 * enumeration rendered a control with and without each of abcjs's 41 unmentioned
 * directives; these five moved nothing, because that control had no lyric, no chord symbol,
 * no dynamic and no ornament — the only things they position. **A "SAME" IS ONLY AS GOOD AS
 * THE SHAPE THAT ASKED.** A control carrying all four moves abcjs's output on NINE of the
 * ten forms.
 *
 * ── WHAT IS BUILT, AND WHAT IS NOT ──────────────────────────────────────────
 * The PARSE half is in and is what the passing tests below hold: the directives are read,
 * they travel from a file header into every tune the way a font does, and `el.positioning`
 * is byte-identical to abcjs's on the ten-rung ladder.
 *
 * The LAYOUT half is NOT, and the `.fails` tests are the measurement, so they go RED the
 * moment it lands. Its mechanism is worked out and is smaller than it looks — nine of the
 * nine moving rungs move for ONE reason, and it is not what any of them positions:
 *
 * 1. **`containsLyrics` TESTS `=== 'below'`, NOT `!== 'above'`**
 *    (`abstract-engraver.js:114-119`). A `%%ornament above` on a singing tune writes
 *    `{ornamentPosition: 'above'}` with no `vocalPosition` at all, so the object EXISTS,
 *    `vocalPosition` is `undefined`, and `hasVocals` goes FALSE. **This part is LANDED** —
 *    see `sings` in `layout.ts`.
 * 2. **AND ONCE `positioning` EXISTS, `hasVocals` IS NEVER CONSULTED AGAIN.**
 *    `createDecoration`'s `if (!positioning) positioning = {ornamentPosition: 'above',
 *    volumePosition: hasVocals ? …, dynamicPosition: hasVocals ? …}` is the WHOLE of it
 *    (`decoration.js:378-379`): with an object in hand the missing keys stay `undefined`
 *    and each reader tests them literally. `DynamicDecoration` is
 *    `if (position === 'below') volumeHeightBelow = 6; else volumeHeightAbove = 6`
 *    (`elements/dynamic-decoration.js:7-10`), so **`undefined` DRAWS ABOVE** — measured:
 *    abcjs keeps its `p` at y 69.92 in both the bare tune and every rung.
 * 3. **AND THE LYRIC GOES ABOVE FOR THE SAME REASON.** `var position = elem.positioning ?
 *    elem.positioning.vocalPosition : 'below'` (`abstract-engraver.js:776`) — the ternary
 *    tests the OBJECT, not the field. Measured on `%%ornament above`: abcjs's lyric moves
 *    from y 195.69 to **129.64**, above the staff, on a tune with no ornament in it.
 * 4. A chord symbol is `elem.positioning.chordPosition` defaulting to `'above'`, and
 *    `'hidden'` DROPS the element rather than moving it (`add-chord.js:104-108`).
 *
 * So what is owed is a `lyricHeightAbove` lane this engine has never had a producer for,
 * and the three literal-`'below'` tests above. The numbers to land it against are here.
 */
const positioningOf = (abc: string): unknown[] => {
  const out: unknown[] = [];
  for (const tune of parseOnly(abc) as unknown as {
    lines?: { staff?: { voices?: { el_type: string; positioning?: unknown }[][] }[] }[];
  }[])
    for (const line of tune.lines ?? [])
      for (const staff of line.staff ?? [])
        for (const voice of staff.voices ?? [])
          for (const el of voice) if (el.el_type === "note") out.push(el.positioning);
  return out;
};

/** The control: a lyric, a chord symbol and a `!p!` — the things the five position. */
const TUNE = 'X:1\nT:Positioning\nL:1/8\nK:C\n"Am"!p!CDEF|GABc|\nw:la la la la\n';

const withDirectives = (...lines: string[]): string =>
  `${lines.map((l) => `%%${l}`).join("\n")}\n${TUNE}`;

describe("the five positionChoices directives — the parse half", () => {
  it("a file-header directive reaches every note of the tune", () => {
    // Above the first `X:`, so it is the FILE HEADER and applies to every tune
    // (ABC 2.1 §4.1) — `multilineVars` survives the header in abcjs, and ours travels on
    // `Formatting.positions`.
    const seen = positioningOf(withDirectives("vocal above"));
    expect(seen).toHaveLength(8);
    for (const p of seen) expect(p).toEqual({ vocalPosition: "above" });
  });

  it("all five stand together, in addFormattingOptions's own order", () => {
    const seen = positioningOf(
      withDirectives(
        "vocal above",
        "dynamic above",
        "gchord below",
        "ornament below",
        "volume above",
      ),
    );
    // MEASURED through abcjs 6.7.0 on this exact tune.
    for (const p of seen)
      expect(p).toEqual({
        vocalPosition: "above",
        dynamicPosition: "above",
        chordPosition: "below",
        ornamentPosition: "below",
        volumePosition: "above",
      });
    expect(Object.keys(seen[0] as object)).toEqual([
      "vocalPosition",
      "dynamicPosition",
      "chordPosition",
      "ornamentPosition",
      "volumePosition",
    ]);
  });

  it("a directive part-way down a tune governs only what follows it", () => {
    // Running state, read as each element is appended — the same shape `el.fonts` has.
    const seen = positioningOf(
      'X:1\nT:t\nL:1/8\nK:C\nCDEF|\n%%gchord below\nGABc|\n',
    );
    expect(seen.slice(0, 4)).toEqual([undefined, undefined, undefined, undefined]);
    for (const p of seen.slice(4)) expect(p).toEqual({ chordPosition: "below" });
  });

  it("`auto` publishes nothing, because it is not a position", () => {
    // `if (this.vocalPosition !== 'auto') addPositioning(…)` — an explicit `auto` leaves
    // the engraver to choose, and its choice is NOT always the same answer as the matching
    // explicit word. See the `.fails` below.
    for (const p of positioningOf(withDirectives("vocal auto"))) expect(p).toBeUndefined();
  });

  it("a value outside the four choices is no directive at all", () => {
    // `addMultilineVarOneParamChoice` returns an error string for anything not in
    // `positionChoices`, and `multilineVars` is left untouched.
    for (const p of positioningOf(withDirectives("vocal sideways"))) expect(p).toBeUndefined();
  });

  it("a REST carries it too — a rest is a `note` element to abcjs", () => {
    const seen = positioningOf(`${withDirectives("volume below")}`.replace("GABc", "z4"));
    expect(seen.length).toBeGreaterThan(4);
    for (const p of seen) expect(p).toEqual({ volumePosition: "below" });
  });

  /**
   * ⚠️ **AND A BAR CARRIES NOTHING, THOUGH abcjs'S SOURCE READS AS THOUGH IT SHOULD.**
   * `addFormattingOptions(el, tune.formatting, 'bar')` sets four positions and two fonts on
   * `el` — the ACCUMULATOR — while `appendElement('bar', …, bar)` publishes `bar`, and the
   * next line is `el = {}` (`abc_parse_music.js:305-309`). So a bar's `positioning`,
   * `measurefont` and `repeatfont` are written to an object nothing reads. Measured, not
   * inferred: with all five directives set, every note carries all five and both bars carry
   * neither field.
   */
  it("a bar carries none of it, which is abcjs's own discarded object", () => {
    const bars: unknown[] = [];
    for (const tune of parseOnly(
      withDirectives("vocal above", "dynamic above", "gchord below"),
    ) as unknown as {
      lines?: { staff?: { voices?: { el_type: string; positioning?: unknown }[][] }[] }[];
    }[])
      for (const line of tune.lines ?? [])
        for (const staff of line.staff ?? [])
          for (const voice of staff.voices ?? [])
            for (const el of voice) if (el.el_type === "bar") bars.push(el.positioning);
    expect(bars).toHaveLength(2);
    for (const p of bars) expect(p).toBeUndefined();
  });
});

/** The rendered height, which is what every one of these moves. */
const height = (abc: string): number => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as { svg?: string })?.svg ?? "";
  return Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
};

describe("the layout half — MEASURED, NOT BUILT", () => {
  /**
   * Every number here is abcjs 6.7.0's own, on the control above at `{staffwidth: 670}`.
   * `%%vocal below` is the DEFAULT and is the one rung that genuinely cannot move — it is
   * the calibration, and it passes today.
   */
  it("`%%vocal below` is the default, so it moves nothing", () => {
    expect(height(withDirectives("vocal below"))).toBeCloseTo(height(TUNE), 2);
  });

  it.fails("any other position drops the staff 22.71px, via hasVocals", () => {
    // abcjs: top line 135.54 bare, 158.25 on every one of the nine moving rungs.
    for (const d of [
      "vocal above",
      "dynamic above",
      "dynamic below",
      "gchord above",
      "ornament above",
      "ornament below",
      "volume above",
    ])
      expect(height(withDirectives(d)) - height(TUNE)).toBeCloseTo(22.71, 1);
  });

  it.fails("`%%vocal above` puts the lyric above the staff", () => {
    // abcjs: the lyric's `<text>` y goes 195.69 → 129.64.
    const svg =
      (renderAbc("*", withDirectives("vocal above"), { staffwidth: 670 })[0] as {
        svg?: string;
      })?.svg ?? "";
    const y = Number(/<text[^>]*y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?la/.exec(svg)?.[1] ?? 0);
    expect(y).toBeCloseTo(129.64, 1);
  });

  it.fails("`%%gchord hidden` drops the chord symbol rather than moving it", () => {
    // `if (pos2 !== 'hidden')` guards the `addCentered` outright (`add-chord.js:108`).
    const svg =
      (renderAbc("*", withDirectives("gchord hidden"), { staffwidth: 670 })[0] as {
        svg?: string;
      })?.svg ?? "";
    expect(svg).not.toContain("Am");
  });
});
