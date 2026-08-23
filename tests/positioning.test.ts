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
 * **AND THE LAYOUT HALF IS IN — ALL TEN RUNGS OF THE LADDER ARE BYTE-IDENTICAL TO abcjs.**
 * Nine of the nine that move do so for ONE reason, and it is not what any of them positions:
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
 * All four are ported. The `lyricHeightAbove` lane — the ladder's FIRST rung, which this
 * engine had never had a producer for — is `PlacedText.lyricAbove` and `AboveLadder`.
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

/** The staff's own TOP LINE — what every one of these actually moves. */
const svgOf = (abc: string): string =>
  (renderAbc("*", abc, { staffwidth: 670 })[0] as { svg?: string })?.svg ?? "";

const topLine = (abc: string): number =>
  Number(/<path d="M 15 ([\d.]+) L/.exec(svgOf(abc))?.[1] ?? 0);

/**
 * ⚠️ **AND THE ROOT `height` IS NOT WHAT MOVES — 216.402 ON ALL TEN RUNGS AND ON THE BARE
 * TUNE, IN BOTH ENGINES.** The above stack is anchored to the page and the STAFF drops
 * inside it, so the page is exactly as tall either way. A first cut of these tests asserted
 * a height delta, took the 22.71px off the top line's diff and encoded it against the wrong
 * quantity — **a test can carry an inference as firmly as a comment can, and a green one
 * reads as a checked fact.**
 */
describe("the layout half", () => {
  const TOP_LINE_BARE = 135.54;
  const TOP_LINE_MOVED = 158.25;

  it("`%%vocal below` is the default, so it moves nothing", () => {
    expect(topLine(withDirectives("vocal below"))).toBeCloseTo(TOP_LINE_BARE, 2);
    expect(topLine(TUNE)).toBeCloseTo(TOP_LINE_BARE, 2);
  });

  it("any other position drops the staff 22.71px, through hasVocals", () => {
    // abcjs's own top line, rung by rung. `%%gchord below` is the exception: its chord
    // symbol leaves the above stack for the below one, so the staff drops by the lyric
    // rung alone rather than by lyric-minus-chord.
    for (const d of [
      "vocal above",
      "dynamic above",
      "dynamic below",
      "gchord above",
      "ornament above",
      "ornament below",
      "volume above",
    ])
      expect(topLine(withDirectives(d)), d).toBeCloseTo(TOP_LINE_MOVED, 2);
  });

  it("`%%vocal above` puts the lyric above the staff", () => {
    // abcjs: the lyric's `<text>` y goes 195.69 → 129.64.
    const y = Number(
      /<text[^>]*y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?la/.exec(
        svgOf(withDirectives("vocal above")),
      )?.[1] ?? 0,
    );
    expect(y).toBeCloseTo(129.64, 2);
    expect(
      Number(/<text[^>]*y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?la/.exec(svgOf(TUNE))?.[1] ?? 0),
    ).toBeCloseTo(195.69, 2);
  });

  it("`%%gchord below` moves the chord symbol into the annotation's below lane", () => {
    // abcjs: `Am` goes from y 128.29 above to 195.01 below, and the lyric to 107.25.
    const y = Number(
      /<text[^>]*y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?Am/.exec(
        svgOf(withDirectives("gchord below")),
      )?.[1] ?? 0,
    );
    expect(y).toBeCloseTo(195.01, 2);
  });

  it("`%%gchord hidden` drops the chord symbol rather than moving it", () => {
    // `if (pos2 !== 'hidden')` guards the `addCentered` outright (`add-chord.js:108`).
    expect(svgOf(withDirectives("gchord hidden"))).not.toContain("Am");
  });

  /**
   * ⚠️ **AND THE DYNAMIC'S `getYCorr` JOINS ITS PITCH, NOT ITS y.** abcjs draws the letter
   * at `calcY(offset + ycorr)` — one sum, one multiply (`draw/print-symbol.js:34`) — where
   * spending the correction on the finished y is `offset * STEP + ycorr * STEP`. The two
   * agree on every tune in both corpora and part by ONE ULP the moment the rung has a long
   * tail, which a lyric singing above the staff is the first thing to give it:
   * `69.91999999999999` against `69.92`. See `PlacedGlyph.drawPitch`.
   */
  it("the `!p!` keeps abcjs's own last bits", () => {
    expect(svgOf(withDirectives("vocal above"))).toContain("M 62.971000000000004 69.91999999999999");
    // …and the bare tune's, which has no tail and is the control that the rule did not
    // break something already exact.
    expect(svgOf(TUNE)).toContain("M 62.971000000000004 69.92c");
  });
});
