/**
 * **abcjs's FONT OBJECTS — the shape a host reads off `tune.formatting`, off a staff, and
 * off a note.**
 *
 * One module because THREE places need the same conversion and none of them can import
 * another: `formattingOf` in `compat/index.ts` builds `tune.formatting`, the projection in
 * `compat/lines.ts` hangs a changed font on the staff, and the same projection stamps
 * `el.fonts` on a note. The staff's was our MODEL's shape — `{face, size, bold, italic}` —
 * until this existed, which is a divergence no gate could see: `deline` compares a staff's
 * fonts only to OURS, through `objEqual`.
 */
import type { AbcFontType, LyricFont, RichPhrase, RichText } from "../core/model.js";

/**
 * **abcjs's OWN DEFAULT FONT TABLE, IN `initializeFonts`'s ORDER** — the twenty-one entries
 * it seeds `tune.formatting` with before any directive is read
 * (`abc_parse_directive.js:20-52`). It is a GOLDEN VARIABLE in the sense
 * `abcjs-constants.ts` means: it may change only if abcjs changes.
 *
 * **THE `face` IS THE STRING abcjs WROTE, QUOTES INCLUDED.** `"\"Times New Roman\""` and
 * `"\"Trebuchet MS\""` carry their own quotes where `Helvetica` and `Times` do not — a CSS
 * font-family list rather than a name, reproduced rather than normalised.
 *
 * The ORDER matters because `formatting`'s key order is observable: the three tune-global
 * fonts come first, then the tab fonts, then the eleven per-element ones.
 */
export const ABCJS_DEFAULT_FONTS: readonly (readonly [
  string,
  { face: string; size: number; weight: string; style: string },
])[] = [
  ["composerfont", { face: '"Times New Roman"', size: 14, weight: "normal", style: "italic" }],
  ["subtitlefont", { face: '"Times New Roman"', size: 16, weight: "normal", style: "normal" }],
  ["tempofont", { face: '"Times New Roman"', size: 15, weight: "bold", style: "normal" }],
  ["titlefont", { face: '"Times New Roman"', size: 20, weight: "normal", style: "normal" }],
  ["footerfont", { face: '"Times New Roman"', size: 12, weight: "normal", style: "normal" }],
  ["headerfont", { face: '"Times New Roman"', size: 12, weight: "normal", style: "normal" }],
  ["voicefont", { face: '"Times New Roman"', size: 13, weight: "bold", style: "normal" }],
  ["tablabelfont", { face: '"Trebuchet MS"', size: 16, weight: "normal", style: "normal" }],
  ["tabnumberfont", { face: '"Arial"', size: 11, weight: "normal", style: "normal" }],
  ["tabgracefont", { face: '"Arial"', size: 8, weight: "normal", style: "normal" }],
  ["annotationfont", { face: "Helvetica", size: 12, weight: "normal", style: "normal" }],
  ["gchordfont", { face: "Helvetica", size: 12, weight: "normal", style: "normal" }],
  ["historyfont", { face: '"Times New Roman"', size: 16, weight: "normal", style: "normal" }],
  ["infofont", { face: '"Times New Roman"', size: 14, weight: "normal", style: "italic" }],
  ["measurefont", { face: '"Times New Roman"', size: 14, weight: "normal", style: "italic" }],
  ["partsfont", { face: '"Times New Roman"', size: 15, weight: "normal", style: "normal" }],
  ["repeatfont", { face: '"Times New Roman"', size: 13, weight: "normal", style: "normal" }],
  ["textfont", { face: '"Times New Roman"', size: 16, weight: "normal", style: "normal" }],
  ["tripletfont", { face: "Times", size: 11, weight: "normal", style: "italic" }],
  ["vocalfont", { face: '"Times New Roman"', size: 13, weight: "bold", style: "normal" }],
  ["wordsfont", { face: '"Times New Roman"', size: 16, weight: "normal", style: "normal" }],
];


/**
 * **THE ELEVEN `getChangingFont` TYPES**, whose `formatting` entry is their value AT THE END
 * OF THE HEADER and not their latest (`abc_parse_directive.js:315-322`). The other ten are
 * `getGlobalFont` and always report the latest.
 */
export const CHANGING_FONTS: ReadonlySet<string> = new Set([
  "annotationfont",
  "gchordfont",
  "historyfont",
  "infofont",
  "measurefont",
  "partsfont",
  "repeatfont",
  "textfont",
  "tripletfont",
  "vocalfont",
  "wordsfont",
]);

/** The four an ELEMENT can carry, in `addFormattingOptions`'s own order (`abc_parse.js:127-130`). */
export const NOTE_FONTS = [
  "annotationfont",
  "gchordfont",
  "vocalfont",
  "tripletfont",
] as const;

/** The two a BARLINE can carry (`:136-137`). */
export const BAR_FONTS = ["measurefont", "repeatfont"] as const;

const DEFAULT_BY_NAME = new Map(ABCJS_DEFAULT_FONTS);

/**
 * One font as abcjs writes it.
 *
 * **A DEFAULT FONT AND A SET FONT HAVE DIFFERENT KEY ORDERS, AND THAT IS HOW abcjs TELLS
 * THEM APART ON SIGHT.** The default literal is `{face, size, weight, style, decoration}`;
 * `getFontParameter` builds `{face, weight, style, decoration}` and only then assigns `size`
 * (and `box`), so a set font reads `{face, weight, style, decoration, size, box?}`
 * (`abc_parse_directive.js:20-52`, `:200-240`). Reproduced, because `JSON.stringify` of this
 * object is output a host can take.
 */
export const abcjsFont = (
  name: string,
  set: LyricFont | undefined,
  boxed = false,
): Record<string, unknown> => {
  const base = DEFAULT_BY_NAME.get(name);
  if (base === undefined) return {};
  return set === undefined
    ? { ...base, decoration: "none", ...(boxed ? { box: true } : {}) }
    : {
        face: set.face === "" ? base.face : set.face,
        weight: set.bold ? "bold" : "normal",
        style: set.italic ? "italic" : "normal",
        decoration: "none",
        size: set.size,
        ...(set.box === true || boxed ? { box: true } : {}),
      };
};

/**
 * `differentFont` — the five fields abcjs compares, and **`box` IS NOT ONE OF THEM**
 * (`abc_parse.js:112-119`). So `%%gchordfont Arial 10 box` and `Arial 10` are the same font
 * to this test and `Arial 20 box` is not.
 */
export const differentFont = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean =>
  a["decoration"] !== b["decoration"] ||
  a["face"] !== b["face"] ||
  a["size"] !== b["size"] ||
  a["style"] !== b["style"] ||
  a["weight"] !== b["weight"];

/**
 * **ONE PHRASE OF RICH TEXT, IN abcjs's SHAPE.** A `$1bold$0` inside a `T:`, `C:` or a
 * `%%text` comes back from `parseFontChangeLine` as phrases, and abcjs writes each as
 * `{text}` alone or `{font: {face, weight, style, decoration, size}, text}` — a font key
 * that is ABSENT rather than null when the phrase carries none, and the five-key font
 * object rather than the model's `{face, size, bold, italic, box}`.
 *
 * Lives here, beside `abcjsFont`, because `index.ts` and `lines.ts` both need it and
 * `index.ts` imports `lines.ts`.
 */
export const phraseOf = (p: RichPhrase): Record<string, unknown> =>
  p.font === null
    ? { text: p.text }
    : {
        font: {
          face: p.font.face,
          weight: p.font.bold ? "bold" : "normal",
          style: p.font.italic ? "italic" : "normal",
          decoration: "none",
          size: p.font.size,
        },
        text: p.text,
      };

export const richOf = (value: RichText): unknown =>
  typeof value === "string" ? value : value.map(phraseOf);
