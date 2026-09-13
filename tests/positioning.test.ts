import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseOnly, renderAbc } from "../src/compat/index.js";

const FIXTURES = join(import.meta.dirname, "corpus-abcjs", "fixtures");

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

/**
 * **AN ENDING'S ROOM IS CHARGED TO EXACTLY ONE BARLINE — THE ONE THE VOLTA IS WRITTEN ON.**
 *
 *     abselem.minspacing += textWidth + 10;  // Give plenty of room for the ending number.
 *
 * (`abstract-engraver.js:1034-1041`) adds it to the single `abselem` being built when the
 * engraver reads `elem.startEnding`. This model splits that bar two ways — a measure's own
 * opening barline, or the PREVIOUS measure's closing one — and both sites charged it, which
 * is the label's `textWidth + 10` too much on every tune that writes the barline
 * separately. See `voltaOnOwnOpeningBar`.
 *
 * Instrumented in abcjs's own `layoutOneItem` on `E8| |1 D8 :|2 C8`: the plain `|` reports
 * `minsp=10` and the `|1` reports `minsp=28.5` — ONE charge — and the two barlines land 16px
 * apart where ours put them 34.5 apart, exactly 18.5 = the `1`'s width plus 10.
 *
 * ⚠️ **AND IT IS NOT A WRAP DEFECT, though only a wrapped fixture ever showed it.** On one
 * source line the same tune differs UNWRAPPED, and no golden covers that shape: in every
 * fixture that writes the barline separately the two bars fall on different systems, where
 * the gap between them is not drawn. `zzopts` 21 -> 20 on `synth-timing-06`.
 *
 * ⚠️ **AND `minspacing` IS A FLOOR, NOT AN ADDITION** — `voice.minx += child.minspacing`
 * and the next element sits at `max(minx, nextx)` (`layout/voice-elements.js:74-80`), which
 * is why the same 28.5 costs nothing after the `|1` (the natural gap there is 29.5) and
 * everything between two adjacent barlines (natural gap 0). Moving it into the LEFT-INK
 * shortfall instead was measured and reverted by an earlier pass; the shortfall is a
 * different mechanism and the goldens need this one.
 */
describe("an ending's room is charged once", () => {
  const bars = (abc: string): string => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, abc, { staffwidth: 670 });
    return [...host.innerHTML.matchAll(/<path d="M ([\d.]+) [^"]*" data-name="bar">/g)]
      .map((m) => Math.round(Number(m[1]) * 100) / 100)
      .join(" ");
  };

  // ⭐ The barline and the `|1` written SEPARATELY, on one line. abcjs: 133.9 and 149.9,
  // 16 apart — the bar's own `w` of 1, its flat `minspacing` of 10, and the 5 of left
  // clearance every barline claims. Ours charged the ending's 18.5 here as well and put
  // the second bar at 168.4.
  it("does not charge the barline before the volta's own", () => {
    expect(bars("X:1\nT:t\nK:C\nE8| |1 D8 :|2 C8\n")).toBe("133.9 149.9 270.26 274.26");
  });

  // ⭐⭐ THE CONTROL, and it is the shape that was always right: with ONE barline doing both
  // jobs there is no second bar to charge, and the room has to stay on the closing one.
  // A fix that simply stopped charging the closer would pass the row above and fail this.
  it("still charges the closing barline when that is where the volta is", () => {
    expect(bars("X:1\nT:t\nK:C\n|:CDEF|1GABc:|2cdef|]\n")).toBe(
      "58.05 66.05 255.03 465.52 469.52 677 681",
    );
  });

  // …**AND THE SHAPE THAT ALREADY HAD A NAMED DOUBLE CHARGE.** A quoted label's `]` is an
  // invisible barline that OPENS the next measure, so `C2|["first"] D2` reaches both sites
  // — the reason `voltaOnOwnOpeningBar`'s test exists at all. It stays single.
  it("charges a quoted label's invisible opening bar once", () => {
    expect(bars('X:1\nT:t\nK:C\nC2|["first"] D2|\n')).toBe("91.48 198.34");
  });

  // …and a BRACKETED `[1` is the same bar in a different spelling.
  it("reads a bracketed volta the same way", () => {
    expect(bars("X:1\nT:t\nK:C\n|:CDEF|[1GABc:|[2cdef|]\n")).toBe(
      "58.05 66.05 255.03 465.52 469.52 677 681",
    );
  });
});

/**
 * **A PITCH IS CONVERTED TO A y ONCE, AND THE FRACTION GOES ON THE PITCH.**
 *
 * `calcY(ofs) = this.y - ofs * STEP` (`write/renderer.js:178-180`) shifts NOTHING. Every
 * fudge the engraver applies — `p1 = minpitch + 1/3`, the beam pass's `+ 1/5`, the triplet
 * number's `calcY(yTextPos - 1)` — is added to a pitch in abcjs's OWN origin before `calcY`
 * ever sees it. Ours added those in step space and let `stepToY` add `PITCH_ORIGIN`
 * afterwards, or converted first and added the offset in y. Both are the same number in
 * algebra and a different double:
 *
 *     (-10 + 1/5) + 6                        -3.8000000000000007   vs abcjs's -3.8
 *     (109.98 - 16.561 * 3.875) + 3.875      49.685                vs abcjs's 49.684999999999995
 *
 * and `roundNumber` — `parseFloat(x.toFixed(2))`, which this engine already matches exactly
 * — then tips the other way: 99.29 against 99.28, 49.69 against 49.68. See `pitchToY`.
 *
 * ⚠️ **THE WRAP ONLY EXPOSES IT.** The rule is not the wrap's and neither fixture differs
 * unwrapped: `svg-bytes` is 0 of 691 through both of these, because the defect shows only
 * on a value that lands on a `.xx5` boundary and no golden's does. `zzopts` 20 -> 18.
 *
 * ⚠️ **AND `yTextPitch` MUST BE READ BESIDE `y`, NOT ABOVE THE MIDDLE-NOTE PASS** — a tall
 * note in the middle FLATTENS `startNote`/`endNote` after they are first set, and hoisting
 * the read reddened 26 rows of the suite.
 */
describe("a pitch is converted once", () => {
  const wrapped = (file: string): string => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, readFileSync(join(FIXTURES, file), "utf-8"), {
      staffwidth: 400,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
    });
    return host.innerHTML;
  };

  // ⭐ A BEAMED stem's near end is `minpitch + 1/5`. Ours wrote 99.29 for abcjs's 99.28.
  it("puts a beamed stem's foot where abcjs does", () => {
    expect(
      /M 125\.23 [\d.]+L 125\.23 [\d.]+/.exec(
        wrapped("abcjs-visual-transpose-06-c-d-e-f-g-a-b-c-cdef-gabc-c-d-e-f-g-a-b-.abc"),
      )?.[0],
    ).toBe("M 125.23 61.31L 125.23 99.28");
  });

  // ⭐ And the triplet number's baseline is `calcY(yTextPos - 1)`, the `- 1` on the PITCH.
  // abcjs's own words for it: "HACK: adjust the position of '3'. It is too high in all
  // cases so we fudge it by subtracting 1 here." Ours wrote 49.69 for abcjs's 49.68.
  it("puts a beamed triplet's number where abcjs does", () => {
    expect(
      /x="272\.16" y="[\d.]+"/.exec(wrapped("abcjs-visual-multi-voice-x03.abc"))?.[0],
    ).toBe('x="272.16" y="49.68"');
  });
});

/**
 * **AN ELEMENT'S WIDTH IS `dx + w`, NOT `(x + w) - base`.**
 *
 * `abselem.w` is `max(dx + w)` over the `addRight` children (`absolute-element.js:141`) —
 * each child's OFFSET added to its width. abcjs never subtracts two absolute x's to get it,
 * and the two are equal in algebra and not in doubles: a plain notehead's own term built the
 * second way is `(394.97100000000006 + 9.81) - 394.97100000000006`, which is
 * `9.809999999999945` where abcjs has the flat `9.81`. Subtracting the base FIRST makes the
 * head's term exactly `0 + 9.81`.
 *
 * ⚠️ **AND ONLY A GLISSANDO COULD SEE IT.** A glissando insets by half this width at each
 * end and is the only emitter in the engine that writes a coordinate at FULL precision —
 * everything else goes through `roundNumber`, and `9.81` and `9.809999999999945` round the
 * same. `visual-misc-04-stretchlast` was 0 of 116 elements moved with one byte differing,
 * and that byte was the squiggle's first `M`. It is the last row of `zzopts`'s
 * `wrap + staffwidth`: 5 -> 4, which is the floor.
 *
 * ⚠️ **AND THE NOTE'S OWN SOLVED x WAS NEVER WRONG** — the first reading of this row blamed
 * the spring solve's accumulation. Both engines' 41-element x chains were logged and are
 * byte-identical, `394.97100000000006` included; the defect was one association in the
 * width beside it.
 */
describe("an element's width is built from offsets", () => {
  // ⭐ The full-precision start of the first glissando on the wrapped render, which is
  // `(anchor.x + w/2) + (w/2 + 4)`. Ours wrote `408.781` for abcjs's `408.78100000000006`.
  it("insets a glissando by abcjs's own half-width", () => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(
      host,
      readFileSync(join(FIXTURES, "abcjs-visual-misc-04-stretchlast.abc"), "utf-8"),
      {
        staffwidth: 400,
        wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
      },
    );
    const starts = [
      ...host.innerHTML.matchAll(/<path d="M ([\d.]+) [^>]*data-name="glissando">/g),
    ].map((m) => m[1]);
    expect(starts).toContain("408.78100000000006");
  });
});

/**
 * **`initialClef`'s `l` IS THE INDEX INTO `tune.lines`, AND IT COUNTS THE NON-MUSIC ROWS.**
 *
 *     var clef = (!this.initialClef || l === 0) && createClef(abcstaff.clef, …)
 *
 * (`abstract-engraver.js:158`.) `l` is handed down from
 * `createABCLine(abcLine.staff, …, i)` where `i` walks `abcTune.lines`
 * (`engraver-controller.js:229-234`) — so it counts a subtitle, a `%%text`, a `%%sep` and a
 * `%%newpage` exactly as it counts a staff. **A tune whose music is preceded by any of them
 * has its FIRST music line at `l > 0` and draws NO clef at all under this option.**
 *
 * Ours read it as the count of music SYSTEMS, which is what `lineOfMeasure` holds, so the
 * option looked like "every line but the first". That is the same misreading the wrap's
 * meter skip had — `action.line !== 0` (`wrap_lines.js:43`) is the same index — and
 * `nonMusicPrecedesMusic` is now the one predicate both read.
 *
 * `zzopts`'s `initialClef` row: **42 -> 3**, and 27 of the 39 were this one reading.
 */
describe("initialClef counts the non-music rows", () => {
  const clefs = (abc: string): number => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, abc, { staffwidth: 670, initialClef: true });
    return [...host.innerHTML.matchAll(/data-name="clefs\.[A-Z]"/g)].length;
  };

  // ⭐ A subtitle stands between the header and the music, so the ONE music line is
  // `tune.lines[2]` and abcjs draws NO clef for it. Ours drew one, and the staff sat
  // 14.432px lower for the room it took.
  it("draws no clef at all when a subtitle precedes the music", () => {
    expect(clefs("X:1\nT:title\nT:t\nL:1/4\nK:C\nT:sub\nCDEF|\n")).toBe(0);
  });

  // ⭐⭐ THE CONTROL, and it is the shape that was always right: with NOTHING before the
  // music the first line IS `tune.lines[0]` and keeps its clef, while the second loses one.
  // A fix that suppressed by music-system index alone passes the row above and fails this.
  it("keeps the first line's clef when nothing precedes the music", () => {
    expect(clefs("X:1\nT:t\nL:1/4\nK:C\nCDEF|\nGABc|\n")).toBe(1);
  });

  // …and a `%%text` counts the same as a subtitle — the row is what matters, not its kind.
  it("counts a %%text row too", () => {
    expect(clefs("X:1\nT:t\nL:1/4\nK:C\n%%text hello\nCDEF|\n")).toBe(0);
  });

  // …and with the option OFF every line keeps its clef, whatever precedes the music.
  it("does nothing when the option is off", () => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, "X:1\nT:title\nT:t\nL:1/4\nK:C\nT:sub\nCDEF|\n", { staffwidth: 670 });
    expect([...host.innerHTML.matchAll(/data-name="clefs\.[A-Z]"/g)].length).toBe(1);
  });
});

/**
 * **A CHORD'S INCOMING TIE-HALF RESERVES, AND THE RULE HAD BEEN DEAD FOR A CHORD.**
 *
 * A tie arriving from the system above reserves `anchor2.pitch ± 4` as INK — the second
 * half has a null `anchor1` and its closing note IS on that line, so `setEndAnchor` runs
 * (`elements/tie-element.js:25-38`). That was ported, measured on a six-rung ladder and
 * written up; it tested `previous.type === 'note'`, and `[GB]8-|` is a CHORD. abcjs builds
 * one `TieElem` per tied PITCH (`abc_parse_music.js:427`), every one of which reserves.
 *
 * ⭐ **IT WAS INVISIBLE UNTIL `initialClef` REMOVED THE CLEF.** A treble clef declares
 * `bottom: -1` and the tie's own 0 never won the `min`, so the staff came out the same
 * either way. With the clef suppressed `parse-tie-slur-03`'s staff sat at pitch 2 — the
 * bare bottom line — against abcjs's 0, and the page was 7.75 short with NOTHING moved:
 * 0 of 61 elements, kinds identical. **A reserve that is always masked by a bigger one is
 * a rule no gate can see.**
 *
 * `zzopts`'s `initialClef` row: 3 -> 1.
 */
describe("a chord ties into the next system", () => {
  const bottomGap = (abc: string): number => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, abc, { staffwidth: 670, initialClef: true });
    return Number(/height="([\d.]+)"/.exec(host.innerHTML)?.[1] ?? 0);
  };

  // THE FIXTURE, not a paraphrase of it — the first draft of this rewrote the `%%staves`
  // and `%%staffwidth` lines and measured a different tune.
  const CHORD = readFileSync(
    join(FIXTURES, "abcjs-parse-tie-slur-03-onestaff.abc"),
    "utf-8",
  );

  // ⭐ abcjs's own page. Testing `type === 'note'` alone gave 7.75 less — two staves, one
  // pitch each, and nothing drawn moved to show it.
  it("reserves for the arriving half of a chord tie", () => {
    expect(bottomGap(CHORD)).toBeCloseTo(275.682, 3);
  });

  // ⭐⭐ THE CONTROL — the same tune with the ties REMOVED reserves nothing there, so the
  // page is shorter. A rule that reserved for every chord regardless would pass the row
  // above and fail this one.
  it("reserves nothing when the chords do not tie", () => {
    expect(bottomGap(CHORD.replace(/-\|/g, "|"))).toBeLessThan(bottomGap(CHORD));
  });
});

/**
 * **`startlimitelem` IS ENGRAVER STATE, NOT A PROPERTY OF THE LINE.**
 *
 * A slur's incoming half starts at `startLimitX.x + startLimitX.w`
 * (`elements/tie-element.js:118-131`), and `startlimitelem` is assigned only where a CLEF,
 * a KEY SIGNATURE or a TIME SIGNATURE is created (`abstract-engraver.js:164`, `:169`,
 * `:178` — and a repeat bar at `:982`). It is cleared only by `reset()`, which runs per
 * TUNE. **So a line that draws none of those keeps whatever the last line to draw one
 * left**; it does not fall back to the `anchor2.x - 20` stub.
 *
 * ⭐ **INVISIBLE UNTIL `initialClef` REMOVED THE CLEF**, because every line has one
 * otherwise and the carry can never be observed. `abcts-ledger-gaps-3` tune 3 is a slur
 * spanning three systems, and with the option abcjs's limit on lines 1 and 2 is LINE 0's
 * `M:4/4` — `staff-extra time-signature x=49.051 w=11.795`. Ours fell to the stub.
 *
 * That was the last row: `zzopts`'s `initialClef` is **0 of 685**, from 125.
 */
describe("a curve's start limit carries across systems", () => {
  const firstTieX = (opt: object): number => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, readFileSync(join(FIXTURES, "abcts-ledger-gaps-3.abc"), "utf-8"), {
      staffwidth: 670,
      startingTune: 3,
      ...opt,
    });
    const m = [...host.innerHTML.matchAll(/<path d="M ([\d.]+) [^>]*data-name="tie"/g)];
    return Number(m[m.length - 1]?.[1] ?? 0);
  };

  // ⭐ With the clef suppressed the limit is line 0's TIME SIGNATURE, two systems back.
  // Ours took `anchor2.x - 20` and started the arc 61px late.
  it("keeps the last line's limit when this line draws no prefix", () => {
    expect(firstTieX({ initialClef: true })).toBeCloseTo(66.85, 2);
  });

  // ⭐⭐ THE CONTROL — with the option OFF every line draws its own clef, so the limit is
  // THIS line's and the carry is invisible. It must not change that number.
  it("takes this line's own prefix when there is one", () => {
    expect(firstTieX({})).toBeCloseTo(45.05, 2);
  });
});

/**
 * **`lineThickness` IS A DRAWN WIDTH AND NEVER A PLACEMENT.**
 *
 * `renderer.lineThickness` is read in the DRAW functions alone (`draw/staff.js:14`, `:25`,
 * `draw/relative.js:61-66`); the ENGRAVER never sees it, so **abcjs moves nothing for it at
 * any value.** We folded it into `LINE_WEIGHTS`, which the LAYOUT reads too, and it leaked
 * into where things go.
 *
 * ⚠️ **AND THE TERM IS NOT THE SAME SIZE AT EVERY SITE.** `printLine`'s `dy` is a HALF —
 * drawn `y - dy` to `y + dy` — so a STAFF LINE and a LEDGER gain **2 ×**; `printStem`'s `dx`
 * is the WHOLE width, so a BARLINE and a STEM gain **one**. Nothing else takes it.
 *
 * `zzopts`'s `lineThickness` row: **0 of 685**, from 665.
 */
describe("lineThickness thickens without moving anything", () => {
  const TUNE = "X:1\nL:1/8\nK:C\n(3ceg|\n";
  const render = (t?: number): string => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, TUNE, {
      staffwidth: 670,
      ...(t === undefined ? {} : { lineThickness: t }),
    });
    return host.innerHTML;
  };

  // ⭐ THE TUPLET NUMBER DOES NOT MOVE. abcjs puts it at the same y for 0, 0.5, 1.5 and 3;
  // ours walked to 87.47 because the weight reached the layout.
  it("leaves the tuplet number where it was", () => {
    const y = (t?: number) => /data-name="3"[^>]*y="([\d.]+)"|y="([\d.]+)"[^>]*data-name="3"/.exec(render(t));
    const at = (t?: number) => {
      const m = /<text[^>]*y="([\d.]+)"[^>]*>(?:<[^>]*>)*3</.exec(render(t));
      return m?.[1];
    };
    expect(at(1.5)).toBe(at(undefined));
    expect(at(3)).toBe(at(undefined));
    void y;
  });

  // ⭐⭐ AND THE STAFF LINE REALLY DOES THICKEN — `printLine`'s `dy` is a HALF, so 1.5 adds
  // THREE to the drawn width. A fix that only stopped the leak would pass the row above.
  it("adds twice the term to a staff line", () => {
    const height = (t?: number): number => {
      const m = /<path d="M 15 ([\d.]+) L [\d.]+ [\d.]+ L [\d.]+ ([\d.]+)/.exec(render(t));
      return Math.round((Number(m?.[2]) - Number(m?.[1])) * 100) / 100;
    };
    expect(height(undefined)).toBeCloseTo(0.7, 2);
    expect(height(1.5)).toBeCloseTo(3.7, 2);
  });
});

/**
 * **`expandToWidest` — A LINE TOO STIFF FOR THE PAGE WIDENS THE PAGE FOR *EVERY* LINE.**
 *
 *     if (Math.round(thisWidth) > Math.round(maxWidth)) {
 *       maxWidth = thisWidth
 *       if (expandToWidest) i = -1   // do the calculations over with the new width
 *     }
 *
 * (`layout/layout.js:26-29`.) The page ratchets up to the widest line solved so far with or
 * without the flag; what the flag buys is the RESTART — the line loop begins again at line
 * 0, so the lines ALREADY solved are re-justified to the new width instead of being left at
 * the narrower one — and a top text rebuilt at `maxWidth`
 * (`engraver-controller.js:263-297`).
 *
 * ⭐ **AND IT IS THE ABORT, NOT THE FIXED POINT.** `i = -1` fires the INSTANT a line widens
 * the page, so the lines after the offender are never solved at the width it just left.
 * Finishing the pass and taking the MAX is the obvious reading and settles somewhere else —
 * `synth-flattener-32-quarter-tone2` at 714.51 against abcjs's 717.51 — because `thisWidth`
 * is not linear in the target and a later line's larger claim jumps the page ahead of the
 * chase. Both engines were instrumented side by side (`__ETW` in abcjs's own loop against
 * `ABCTS_W` here) to settle it.
 *
 * ⚠️ **THE CHASE IS LONG.** A line that cannot compress justifies to just OVER its target
 * and trips `Math.round` again, so `visual-layout-04-score-s-a` walks 670 → 850.54 in 112
 * restarts of about a pixel and a half. A 64-pass cap read 824.02 — **a width that appears
 * in abcjs's own trace**, one of the steps it walks through, which is why the truncation
 * looked like a near miss.
 *
 * ⚠️ **AND THE OPTION HAS ONLY ONE SURFACE.** It changes no element's kind and no stream —
 * `tune.lines` carries no width — so the ink is where it must be asserted, and the repo's
 * usual "assert both surfaces" does not apply here.
 *
 * `zzopts`'s `expandToWidest` row: **14 → 0 of 685.**
 */
describe("expandToWidest restarts the line loop at the widened page", () => {
  // Two stiff measures of sixteenths on one source line, then two short lines: the first
  // line cannot compress to 300 and so widens the page for the ones after it.
  const STIFF =
    "X:1\nT:Wide\nL:1/16\nK:C\nCDEFGABcdefgabc'd'|CDEFGABcdefgabc'd'|\nCDEF GABc|\nGABc CDEF|\n";
  const ink = (abc: string, expandToWidest = false): string => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, abc, { staffwidth: 300, ...(expandToWidest ? { expandToWidest } : {}) });
    return host.innerHTML;
  };
  const widthOf = (svg: string): number => Number(/width="([\d.]+)"/.exec(svg)?.[1]);
  const titleX = (svg: string): number =>
    Number(/data-name="title"><tspan x="([\d.]+)"/.exec(svg)?.[1]);

  // ⭐ THE TOP TEXT IS REBUILT AT THE WIDENED PAGE, so the title centres on the MUSIC.
  // Four of the row's five remaining fixtures were this one rule; each centred at
  // `staffwidth / 2 + padding.left`, the page's own centre, on a tune running far past it.
  it("centres the title on the widened page, not on the staffwidth", () => {
    const wide = ink(STIFF, true);
    expect(titleX(ink(STIFF))).toBe(300 / 2 + 15);
    expect(titleX(wide)).toBeCloseTo((widthOf(wide) - 30) / 2 + 15, 2);
    expect(titleX(wide)).toBeGreaterThan(titleX(ink(STIFF)) + 40);
  });

  // ⭐⭐ AND THE EARLIER LINES ARE RE-JUSTIFIED, which is the restart itself: the forward-only
  // ratchet leaves the line that WIDENED the page at its own natural width and only helps
  // the ones after it. A fix that rebuilt the top text alone passes the row above and fails
  // this one.
  it("re-justifies the line that widened the page", () => {
    const barOf = (svg: string): number =>
      Number([...svg.matchAll(/data-name="bar"[^>]*><path d="M ([\d.]+)/g)][1]?.[1]);
    expect(barOf(ink(STIFF, true))).toBeGreaterThan(barOf(ink(STIFF)));
  });

  // ⭐⭐⭐ THE ABORT'S OWN NUMBER. This fixture is the one that distinguishes abcjs's
  // "restart at the first overflow" from "finish the pass and take the max": the second
  // reading settles at 744.51 and abcjs is at 747.51. A cap that truncates the 40-restart
  // chase also lands short here.
  const fixtureWidth = (name: string): number => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, readFileSync(join(FIXTURES, `${name}.abc`), "utf-8"), {
      staffwidth: 670,
      expandToWidest: true,
    });
    return widthOf(host.innerHTML);
  };

  it("reaches abcjs's width on the fixture where the abort is the difference", () => {
    expect(fixtureWidth("abcjs-synth-flattener-32-quarter-tone2")).toBeCloseTo(
      747.5094495309276,
      6,
    );
  });

  // ⭐⭐⭐⭐ AND THE 112-RESTART CHASE HAS TO RUN TO ITS END. This is the fixture that walks
  // 670 → 850.54 a pixel and a half at a time; a cap of 64 stops it at 824.02 and the row
  // above still passes, because its own chase is only 40 long. **A cap is not visible to a
  // control whose fixture is shorter than the cap.**
  it("runs the whole chase out on the fixture that restarts 112 times", () => {
    expect(fixtureWidth("abcjs-visual-layout-04-score-s-a")).toBeCloseTo(880.5445219546016, 6);
  });

  // ⭐⭐⭐⭐ AND THE PASS IS RUN AGAIN RATHER THAN CONTINUED, so anything it ACCUMULATES has to
  // be cleared first. `voiceAnchors`/`voiceSites` collect per voice across the whole pass and
  // are read back inside it, and a restart that left them drew every slur and every spanner
  // once per pass — 261 of the 691 byte goldens.
  // ⚠️ **AND THE SLUR MUST BE ON A LINE *BEFORE* THE ONE THAT RATCHETS**, because the abort
  // throws before the offending line's own anchors are pushed. With the stiff line FIRST the
  // duplication cannot happen and this control is MUTE — verified by deleting the reset,
  // which left that shape at 6 slurs and this one at 8.
  it("draws each slur once however many times the pass restarts", () => {
    const slurred =
      "X:1\nT:Slurs\nL:1/16\nK:C\n(CDEF)(GABc)|\nCDEFGABcdefgabc'd'|CDEFGABcdefgabc'd'|\n(GABc)(CDEF)|\n";
    const count = (svg: string): number => (svg.match(/data-name="slur"/g) ?? []).length;
    expect(count(ink(slurred))).toBe(4);
    expect(count(ink(slurred, true))).toBe(4);
  });

  // ⚠️ **AND `voiceSites` IS A SECOND ACCUMULATOR THAT THE SLUR CONTROL IS MUTE FOR.** The
  // barline sites a hairpin opens and closes at are collected the same way and cleared in the
  // same place, and deleting only THAT line leaves every slur row green — the shapes are
  // different, so the controls have to be too. Verified: 2 hairpins become 4.
  it("draws each hairpin once however many times the pass restarts", () => {
    const hairpins =
      "X:1\nT:Hairpin\nL:1/16\nK:C\n!<(!CDEF GABc!<)!|\nCDEFGABcdefgabc'd'|CDEFGABcdefgabc'd'|\n!>(!GABc CDEF!>)!|\n";
    const count = (svg: string): number =>
      (svg.match(/data-name="dynamics"/g) ?? []).length;
    expect(count(ink(hairpins))).toBe(2);
    expect(count(ink(hairpins, true))).toBe(2);
  });

  // …and with the option OFF nothing changes: the ratchet is forward-only and the top text
  // stays on the page's centre. abcjs's own default is off.
  it("leaves the forward-only ratchet alone when the option is off", () => {
    expect(titleX(ink(STIFF))).toBe(165);
    expect(widthOf(ink(STIFF))).toBeCloseTo(431.971, 3);
  });
});

/**
 * **`add_classes` — THE LINE, MEASURE AND VOICE COUNTERS, WHICH ARE THE WRITER'S AND NOT THE
 * LAYOUT'S.**
 *
 * `Classes` is a stateful counter walked in draw order (`write/helpers/classes.js`), and
 * `getFontAndAttr.calc` ends `'class': this.classes.generate(klass)` for EVERY text row
 * (`helpers/get-font-and-attr.js:41`) — so a class is a position, not a name. The controls
 * below are one per rule, and each was verified against its own deliberate break; three of
 * them were MUTE on the first attempt for the reasons noted on them.
 *
 * ⚠️ **EVERY EXPECTED STRING HERE WAS READ OUT OF abcjs**, on these same synthetic shapes in
 * WebKit, rather than copied from our own output.
 *
 * `zzopts`'s `add_classes` row: **16 → 1 of 685.**
 */
describe("add_classes counts lines, measures and voices in draw order", () => {
  const ink = (abc: string): string => {
    const host = { innerHTML: "" } as { innerHTML: string };
    renderAbc(host, abc, { staffwidth: 670, add_classes: true });
    return host.innerHTML;
  };
  const all = (abc: string, re: RegExp): string[] =>
    [...ink(abc).matchAll(re)].map((m) => m[1] ?? "");
  const WRAPPER = /class="(abcjs-staff-wrapper[^"]*)"/g;

  /**
   * ⭐ **A ROW THAT PAINTS NOTHING IS STILL A LINE.** `draw()` runs `classes.incrLine()` at
   * the HEAD of each `tune.lines` iteration and only then asks what the line is
   * (`draw/draw.js:29-31`). The emitter counted the blocks that produced ROWS, so a bare
   * `%%text` — a line with one `{move}` and no ink — was skipped. Six of `zzopts`'s sixteen.
   */
  it("counts a bare %%text as a line", () => {
    expect(all("X:1\nT:t\nL:1/4\nK:C\n%%text\nCDEF|\n", WRAPPER)).toEqual([
      "abcjs-staff-wrapper abcjs-l1",
    ]);
    // ⭐⭐ THE CONTROL: the same shape with TEXT in it was always right, so a fix that only
    // looked at rows with ink passes this pair's second half and fails its first.
    expect(all("X:1\nT:t\nL:1/4\nK:C\n%%text hi\nCDEF|\n", WRAPPER)).toEqual([
      "abcjs-staff-wrapper abcjs-l1",
    ]);
    // …and with nothing before the music the first line really is `abcjs-l0`.
    expect(all("X:1\nT:t\nL:1/4\nK:C\nCDEF|\n", WRAPPER)).toEqual([
      "abcjs-staff-wrapper abcjs-l0",
    ]);
  });

  // …**AND A `%%newpage` IS A LINE THAT IS NOT A BLOCK AT ALL.** It pushes a `{newpage}` row
  // nothing in `write/` reads, so it paints nothing anywhere — the third term
  // `nonMusicPrecedesMusic` is built from, and the one a count of blocks misses.
  it("counts a %%newpage as a line", () => {
    expect(all("X:1\nT:t\n%%newpage 1\nL:1/4\nK:C\nCDEF|\n", WRAPPER)).toEqual([
      "abcjs-staff-wrapper abcjs-l1",
    ]);
  });

  /**
   * ⭐ **A `%%sep` RULE'S CLASS IS GENERATED AT ITS OWN LINE** —
   * `pathToBack({…, 'class': classes.generate('defined-text')})` (`draw/separator.js:13`).
   * The emitter built the block's non-text markup as a STRING before the loop that advances
   * the counter, where a text row is rendered inside it, so the rule went out with no
   * `abcjs-lN` at all. It is a thunk now.
   */
  it("generates a %%sep rule's class at its own line", () => {
    expect(
      all("X:1\nT:t\nL:1/4\nK:C\n%%text hi\n%%sep\nCDEF|\n", /class="(abcjs-defined-text[^"]*)"/g),
    ).toEqual(["abcjs-defined-text abcjs-l0", "abcjs-defined-text abcjs-l1"]);
  });

  /**
   * ⭐ **A SUBTITLE AFTER THE MUSIC TAKES THE COUNTER AND ONE IN THE HEADER DOES NOT**, and
   * the two come out of the same call. abcjs generates every row's class; the header block is
   * drawn by `nonMusic(topText)` BEFORE the `tune.lines` loop, where `lineNumber` is still
   * `null`, so `generate` adds nothing to it (`draw/draw.js:12-18`).
   *
   * ⚠️ **WHICH MAKES THE ORDER OF TWO STATEMENTS LOAD-BEARING.** The emitter wrote the meta
   * block AFTER advancing the counter for each leading subtitle line; while these classes were
   * literal strings that was invisible, and the moment the subtitle's became generated the
   * header title would have taken an `abcjs-l0` abcjs never writes. **Both halves are in this
   * one assertion** — the bare string is the header's, the `abcjs-l2` the trailing one's.
   */
  it("generates a trailing subtitle's class and leaves the header's bare", () => {
    expect(
      all(
        "X:1\nT:t\nT:sub0\nL:1/4\nK:C\nCDEF|\nT:sub\n",
        /class="(abcjs-text abcjs-subtitle[^"]*)"/g,
      ),
    ).toEqual(["abcjs-text abcjs-subtitle", "abcjs-text abcjs-subtitle abcjs-l2"]);
  });

  /**
   * ⭐ **A BOXED ROW'S CLASS IS MOVED TO THE GROUP, NOT DROPPED.** `renderText` opens
   * `openGroup({ klass: hash.attr['class'], … })` and only THEN
   * `delete hash.attr['class']` (`draw/text.js:50`, `:58`). The suppression on the text was
   * ported and the group left bare at all three sites — a music text, a top-block row and a
   * bottom-block row.
   */
  it("puts a boxed row's class on the group it opens", () => {
    expect(
      all(
        'X:1\nT:t\n%%gchordfont Arial 13 box\nL:1/4\nK:C\n"G"CDEF|\n',
        /<g class="(abcjs-chord[^"]*)"/g,
      ),
    ).toEqual(["abcjs-chord abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0"]);
    // ⚠️ AND A BLOCK ROW IS A DIFFERENT SITE: the music-text one reads `t.dataName` through
    // the element loop, this one through the top block, and fixing either alone leaves the
    // other bare. `%%textfont … box` is the shape that showed it.
    expect(
      all(
        "X:1\nT:t\n%%textfont Arial 13 box\nL:1/4\nK:C\n%%text hi\nCDEF|\n",
        /<g class="(abcjs-defined-text[^"]*)"/g,
      ),
    ).toEqual(["abcjs-defined-text abcjs-l0"]);
  });

  /**
   * ⭐ **A GRACE BEAM'S ELEMENT INDEX IS PER VOICE, AND ADDING THE VOICE BASE TWICE MISSES.**
   * An ordinary beam's `beamAt` comes off the voice's own plan and `flushVoice` adds
   * `voiceBase` to it; the grace-beam walk pushed a STAFF-wide index, so the `markerAt`
   * lookup missed and fell to 0 for every grace beam in a LOWER voice.
   *
   * ⚠️ **INVISIBLE FOR VOICE 0, WHERE THE TWO ARE THE SAME NUMBER** — the same shape as the
   * curve-anchor bug beside it, and the reason the graces here are on `V:B` after a barline.
   */
  it("classes a lower voice's grace beam at its own measure", () => {
    expect(
      all(
        "X:1\nT:t\nL:1/8\nK:C\n%%staves (A B)\nV:A\nCDEF|GABc|\nV:B\nCDEF|{ab}GABc|\n",
        /class="(abcjs-beam-elem abcjs-d0 [^"]*)"/g,
      ),
    ).toEqual(["abcjs-beam-elem abcjs-d0 abcjs-l0 abcjs-m1 abcjs-mm1 abcjs-v1"]);
  });

  /**
   * ⭐ **A BEAM MULTIPLIES BY THE TUPLET RATIO ONLY WHEN ITS FIRST ELEMENT *OPENS* THE
   * TUPLET** — `if (firstElement.startTriplet)` (`elements/beam-element.js:31-36`) — so the
   * beam before the bar classes SOUNDING and the one after it classes NOTATED. See
   * `TupletMark.opens`; the parse-side control is in `tests/corpus/parse.test.ts`.
   */
  it("classes a beam past the barline on the notated duration", () => {
    expect(
      all("X:20\nT:t\nL:1/8\nK:C\n(3CD|EFGA|\n", /class="(abcjs-beam-elem[^"]*)"/g),
    ).toEqual([
      "abcjs-beam-elem abcjs-d0-083 abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0",
      "abcjs-beam-elem abcjs-d0-125 abcjs-l0 abcjs-m1 abcjs-mm1 abcjs-v0",
    ]);
  });
});
