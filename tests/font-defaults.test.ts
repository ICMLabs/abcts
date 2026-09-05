/**
 * **WHAT FONT EACH `%%<type>font` IS MEASURED WITH WHEN THE TUNE SETS NONE.**
 *
 * abcjs's `initializeFonts` gives four types an ITALIC default and three a BOLD one
 * (`parse/abc_parse_directive.js:22-44`), and `getFontAndAttr` hands the whole object to
 * `getTextSize` — so a tune that writes no `%%measurefont` is still MEASURED italic. Our
 * `fontOfType` read only what the SCORE had set, so every one of those seven measured
 * `normal`/`normal`.
 *
 * ⚠️ **NO GATE IN THE REPO COULD SEE IT, AND TWO KINDS OF GATE COULD NOT IN PRINCIPLE.**
 *
 *   - **The headless goldens cannot.** `goldenTextWidth`/`goldenTextHeight` ignore the font
 *     entirely — that is what makes the 691 mean what they mean — so the whole class is
 *     invisible to `svg-bytes`.
 *   - **WebKit cannot.** It inks every digit at 9.5 at 19px whether upright or italic;
 *     Blink inks `6` at 9.982422 and `7` at 9.945313 against 9.5 for the rest. The live
 *     gate read 0 of 685 in WebKit on the build this test fails.
 *   - **And `zzcontrol dirs` cannot**, because every rung of it SETS a directive, so
 *     `fonts[type]` always exists and the default path never runs. It read 0 of 17 in BOTH
 *     browsers on that same build.
 *
 * So the instrument is neither a golden nor a browser: it records the fonts the measurer is
 * ASKED about. That is the quantity the defect is in, it needs no layout engine, and it
 * fails on the exact change that caused it. Checked by reverting `fontOfType`'s fallback:
 * every one of these assertions goes red.
 */
import { describe, expect, it } from "vitest";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
import {
  setTextMeasurer,
  type TextFont,
} from "../src/renderer/text-measure.js";

/** Every font the layout asks the measurer about, in order. */
function fontsAskedFor(abc: string): TextFont[] {
  const seen: TextFont[] = [];
  setTextMeasurer((text, font) => {
    seen.push(font);
    // A plausible non-zero box, so nothing downstream falls back to the tables.
    return { width: text.length * font.size * 0.5, height: font.size * 1.2 };
  });
  try {
    const parsed = parse(abc);
    if (!parsed.ok) throw new Error("fixture did not parse");
    for (const score of parsed.scores) layout(score, { systemWidth: 670 });
  } finally {
    setTextMeasurer(null);
  }
  return seen;
}

describe("a %%<type>font's DEFAULT weight and style reach the measurer", () => {
  it("measures a bar number ITALIC when no %%measurefont is set", () => {
    // `measurefont` defaults to Times New Roman 14pt **italic**. The bar number is the only
    // thing drawn in it, and its measured width sets the x of a number sitting on a clef —
    // `visual-wrap-03`'s bar 6 at 29.75 against abcjs's 29.99 in Blink.
    const fonts = fontsAskedFor(
      "X:1\n%%measurenb 1\nM:4/4\nL:1/4\nK:C\nCDEF|CDEF|CDEF|\n",
    );
    const digits = fonts.filter((f) => f.size === 19);
    expect(digits.length).toBeGreaterThan(0);
    // SOME, not every: the page's own prose-width guard measures every drawn row with a
    // default serif to decide how far right the ink reaches, and that is a sizing
    // safeguard rather than a quantity abcjs has. What must be italic is the measurement
    // the bar number's x is BUILT from.
    expect(digits.some((f) => f.style === "italic")).toBe(true);
  });

  it("keeps a directive's OWN weight and style over the default", () => {
    // A `%%…font` REPLACES the font rather than amending it, so an explicit upright
    // `measurefont` must NOT inherit the italic default.
    const fonts = fontsAskedFor(
      "X:1\n%%measurefont Times 14\n%%measurenb 1\nM:4/4\nL:1/4\nK:C\nCDEF|CDEF|\n",
    );
    const digits = fonts.filter((f) => f.size === 19);
    expect(digits.length).toBeGreaterThan(0);
    expect(digits.some((f) => f.style === "italic")).toBe(false);
  });

  it("measures a tempo mark BOLD when no %%tempofont is set", () => {
    // `tempofont` defaults to **bold**, and both widths the mark advances by are measured
    // with it — the beat-unit note and the rate ride on them.
    const fonts = fontsAskedFor(
      'X:1\nM:4/4\nL:1/4\nK:C\nQ:"Andante" 1/4=120\nCDEF|\n',
    );
    const marks = fonts.filter((f) => f.size === 20);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((f) => f.weight === "bold")).toBe(true);
  });
});
