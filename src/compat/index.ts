/**
 * `abcts/compat` — abcjs's API, so an existing page keeps working.
 *
 *   import { renderAbc } from 'abcts/compat'
 *   renderAbc('paper', abcString, { staffwidth: 740 })
 *
 * ── WHAT THIS PROMISES, AND WHAT IT DOES NOT ──────────────────────────────────
 * The bar is VISUAL EQUIVALENCE plus the same DOM, not byte-identical SVG:
 *
 *   - the same call signature, so calling code compiles and runs unchanged
 *   - the same CSS classes (`abcjs-notehead`, `abcjs-stem`, `abcjs-ledger`,
 *     `abcjs-top-line`) and the same `data-name` hooks, so stylesheets and click
 *     handlers keep working
 *   - the same engraving density, so the page does not visibly shift — abcjs spaces a
 *     note by `sqrt(duration * 8)` units of 30px, and strict mode reproduces that
 *     exactly
 *
 * It does NOT promise identical bytes. The markup is core's own: fewer wrapper groups,
 * no deprecated `xlink:href`, `currentColor` rather than fill and stroke repeated on
 * every node. A pixel-diff test against abcjs output will differ; a human looking at the
 * page, a stylesheet, and a click handler will not.
 *
 * Parsing runs in `abcjs-strict`, which reproduces abcjs's behaviour including its bugs.
 * That is the point of a compat layer: a page that renders today must render the same
 * tomorrow, oddities included. Opt into corrections with `abcts` proper and mode
 * `abc2.1`.
 */
import {
  type AudioOptions,
  type FlatAudio,
  flattenAudio,
} from "../audio/flatten.js";
import {
  getBarLength,
  getBeatLength,
  getBeatsPerMeasure,
  getBpm,
  getMeter,
  getPickupLength,
  millisecondsPerMeasureOf,
  type NoteTiming,
  addUsefulCallbackInfo,
  setupEventsFor,
  timingsOf,
} from "../audio/timing.js";
import {
  type AbcFontType,
  defaultClef,
  type MusicEvent,
  plainText,
  type RichPhrase,
  type RichText,
  type Score,
} from "../core/model.js";
import { type DelineOptions, delineOf } from "./deline.js";
import {
  type AbcElement,
  type AbcLine,
  elementFromChar,
  projectionOf,
  tempoElement,
} from "./lines.js";
import {
  findSelectable,
  keyElement,
  type Selectable,
  selectablesOf,
} from "./selectables.js";
export { type BookTune, numberOfTunes, TuneBook } from "./tunebook.js";
import {
  activeAudioContext,
  getMidiFileFor,
  instrumentIndexToName,
  type MidiFileParams,
  pitchToNoteName,
  registerAudioContext,
  supportsAudio,
} from "./synth.js";
import { numberOfTunes } from "./tunebook.js";
import { parse } from "../parser/parser.js";
import { EngraverController, Parse } from "./engraver.js";
import { strTranspose as transposeString } from "../str/transpose.js";
import { STAFF_SPACE_PX, UNIT_PX } from "../renderer/abcjs-constants.js";
import { layout, type MetaTextRow, type PlacedText } from "../renderer/layout.js";
import { type SelectableRecord, toSVG } from "../renderer/svg.js";

/**
 * abcjs's SCREEN padding — `top/left/right/bottom = 15` (`write/renderer.js:69-72`), where
 * print mode takes 38/68. The page is the staff width plus this either side, which is why
 * a 670 staffwidth renders a 700px SVG.
 */
const SCREEN_PADDING = 15;

/**
 * abcjs's own `signature`, reported verbatim — `"abcjs-basic v" + version`
 * (`index.js:32`, `version.js`). A host that feature-detects on it must not break because
 * it is running abcts; abcts's own identity goes under `abctsSignature`.
 */
export const signature = "abcjs-basic v6.7.0";

/** abcts's own, for a host that wants to know what it is really talking to. */
export const abctsSignature = "abcts (abcjs-compatible)";

/**
 * `AbcTune`'s own `version`, reported verbatim — a host that feature-detects on it must
 * not break because it is running abcts (`abc_tune.js:16`).
 */
const ABCJS_TUNE_VERSION = "1.1.0";

/** And PRINT's — 1.8cm either side (`renderer.js:71-72`). */
const PRINT_PADDING = 68;

/** The CSS scale a print render is drawn at (`engraver-controller.js:216`). */
const PRINT_SCALE = 0.75;

/** What `"Sheet Music for \"" + metaText.title + '"'` produces — see the call site. */
const ariaTitle = (title: RichText): string =>
  typeof title === "string"
    ? title
    : title.map(() => "[object Object]").join(",");

/** The subset of abcjs's params that changes the rendering abcts produces. */
export interface AbcjsParams {
  /** Staff width in pixels. abcjs's default is 740 on screen. */
  readonly staffwidth?: number;
  /**
   * abcjs's PAGE media — a 0.75 CSS scale on the root, print's own page margins, an extra
   * `spacing.top` above the title and an eleven-inch minimum height. See
   * `LayoutOptions.print`.
   */
  readonly print?: boolean;
  /** Uniform scale factor applied to the whole drawing. */
  readonly scale?: number;
  /**
   * abcjs adds its `abcjs-*` classes only when asked. Compat emits them either way,
   * because they are the reason to use this entry point; the flag is accepted so that
   * existing calls do not have to change.
   */
  readonly add_classes?: boolean;
  /** Which tune of the book the first output slot gets (`abc_tunebook.js:69`). */
  readonly startingTune?: number | string;
  /**
   * abcjs's `visualTranspose` — every pitch moved AT PARSE TIME, key signature and
   * spelling with it. The same thing `%%visualTranspose n` does, and abcjs's own test
   * helper writes the directive into the string to check the two agree
   * (`abc_parse.js:529-536`, `tests/visual/transpose.test.js:255-262`).
   */
  readonly visualTranspose?: number;
  /**
   * Which element types a host may click. `false` none, `true` every one that carries an
   * `abcelem`, a LIST for those types — and ABSENT is not "all": abcjs's default admits
   * `note` and `tabNumber` alone (`draw/selectables.js:31-45`).
   */
  readonly selectTypes?: boolean | readonly string[];
}

/**
 * abcjs's `getMeter()` shape — `{ type: "common_time" }`, `{ type: "cut_time" }`, or
 * `{ type: "specified", value: [{ num, den }] }` **with the numbers as STRINGS**, which is
 * why `getMeterFraction` calls `parseInt` on them (`abc_tune.js:181-220`).
 */
export interface AbcjsMeter {
  readonly type: "common_time" | "cut_time" | "specified";
  readonly value?: readonly { readonly num: string; readonly den: string }[];
}

/** `getMeterFraction()` — the same meter reduced to two integers (`abc_tune.js:196-219`). */
export interface AbcjsMeterFraction {
  readonly num: number;
  readonly den: number;
}

/**
 * **`metaText` — THE TUNE'S FIELD VALUES, abcjs'S OWN SHAPE.** `metaTextInfo` says WHERE each
 * field was written and this says WHAT it said; the two are one surface, and `TopText` and
 * `BottomText` each read a value from one and a span from the other.
 *
 * **THE VALUE IS A STRING OR AN ARRAY OF PHRASES, AND WHICH ONE IS NOT COSMETIC.**
 * `parseFontChangeLine` returns the line unchanged unless a `$N` font change is in it, in
 * which case it returns `[{text}, {font, text}, …]` — and a phrase's `font` is abcjs's own
 * five-field object, `weight`/`style`/`decoration` spelled out where ours carries booleans.
 * The distinction selects a different ROW HEIGHT downstream; see `RichText`.
 *
 * `N:`, `H:` and `W:` are the MULTI-LINE fields: `simplifyMetaText` joins them with `\n` into
 * ONE string when every entry is plain, and leaves an ARRAY OF ARRAYS when any entry is rich
 * (`tune-builder.js:479-484`). A key is present only when the field was written, which is why
 * this is assembled from entries rather than from a literal.
 *
 * `abc-copyright`, `abc-creator` and the other `%%abc-*` values are absent here because the
 * parser does not collect them yet; so are `header`'s and `footer`'s SIZES, which are print
 * furniture nothing draws.
 */
const phraseOf = (p: RichPhrase): Record<string, unknown> =>
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

const richOf = (value: RichText): unknown =>
  typeof value === "string" ? value : value.map(phraseOf);

/**
 * `N:` and `H:` are JOINED into one `\n` string when every entry is plain and left an ARRAY
 * OF ARRAYS when any entry is rich — `simplifyMetaText` tests `isArrayOfStrings`
 * (`tune-builder.js:479-484`).
 *
 * **`W:` IS NOT IN THAT LIST AND STAYS AN ARRAY EITHER WAY**, even when it holds one plain
 * line: `["lo loo lou $1dollar"]`, not `"lo loo lou $1dollar"`. It is the one field
 * `simplifyMetaText` leaves alone, which is also why it is the one that reaches
 * `addMultiLine`'s array branch and the only bottom-block group with a selectable close.
 */
const multiOf = (entries: readonly RichText[], join: boolean): unknown =>
  join && entries.every((e) => typeof e === "string")
    ? entries.join("\n")
    : entries.map(richOf);

const metaTextOf = (score: Score): Record<string, unknown> => {
  const m = score.metadata;
  const out: Record<string, unknown> = {};
  // **AN EMPTY FIELD IS STILL A FIELD.** `addMetaText` keys on `=== undefined`, not on
  // truthiness (`tune-builder.js:433`), so a bare `T:` records `title: ""`.
  const put = (key: string, value: RichText | null): void => {
    if (value !== null) out[key] = richOf(value);
  };
  put("title", m.titles[0] ?? null);
  put("composer", m.composer);
  put("rhythm", m.rhythm);
  put("origin", m.origin);
  put("author", m.author);
  put("partOrder", m.partOrder);
  put("book", m.book);
  put("source", m.source);
  put("discography", m.discography);
  put("transcription", m.transcription);
  put("group", m.group);
  for (const [key, entries, join] of [
    ["notes", m.notes, true],
    ["history", m.history, true],
    ["unalignedWords", m.unalignedWords, false],
  ] as const)
    if (entries.length > 0) out[key] = multiOf(entries, join);
  for (const key of ["header", "footer"] as const) {
    const head = m.runningHead[key];
    if (head !== undefined) out[key] = head;
  }
  // **THE TUNE'S OWN `Q:` IS A `metaText` ENTRY AND A DRAWN ELEMENT AND NOT IN `tune.lines`**
  // — the same three-way split the selectable array settled. Its shape here is the tempo
  // ELEMENT, `startChar`/`endChar` included (`abc_parse_header.js:530-536`).
  // …and it is `setTempo`'s RAW object here, with neither `el_type` nor the `type: "tempo"`
  // the DRAWN element carries: `tune.metaText.tempo = tempo.tempo` is a direct assignment
  // (`abc_parse_header.js:531-533`), where `appendElement` is what adds the two type fields.
  // **AND AN INLINE `[Q:]` IS NOT THE TUNE'S `metaText.tempo` AT ALL.**
  // `letter_to_inline_header`'s `[Q:` arm appends an ELEMENT or parks one for the next line
  // and never touches `metaText` (`abc_parse_header.js:384-397`), where the field-line arm
  // assigns it (`:530-536`). `synth-flattener-10` is five inline `[Q:]` and no `metaText.tempo`.
  const tempo = score.tempoInline === true
    ? null
    : tempoElement(score.tempo, score.tempoSourceRange);
  if (tempo !== null) {
    const { el_type: _drop, type: _drop2, ...rest } = tempo;
    out.tempo = rest;
  }
  return out;
};

/**
 * **ONE ROW OF `TopText.rows` / `BottomText.rows`, IN abcjs's OWN KEY ORDER.**
 *
 * `addTextIf` builds its row as a LITERAL and then adds three optional keys in a fixed
 * sequence (`add-text-if.js:10-19`):
 *
 *     { left, text, font, anchor, startChar, endChar, 'dominant-baseline' }
 *     then absElemType, then klass, then name
 *
 * so the order is deterministic and `JSON.stringify` of it is output a host can take.
 * `'dominant-baseline'` is in the literal but `undefined` unless the caller set it, which
 * `JSON.stringify` drops — that is why it sits between `endChar` and `absElemType` rather
 * than at the end.
 *
 * **A RICH ROW TAKES A DIFFERENT SHAPE ENTIRELY** — `richText`'s array branch pushes
 * `{left, anchor, phrases}` and adds `klass` after (`rich-text.js:18-26`). It carries no
 * `absElemType`, which is the same fact that makes a rich row unselectable, and each phrase
 * is `{content, attrs}` with abcjs's five font attributes spelled out.
 */
const metaTextRow = (
  t: PlacedText,
  font: AbcFontType,
  left: number,
  addClasses: boolean,
): Record<string, unknown> => {
  const klass = addClasses ? (t.groupClass ?? "") : "";
  if (t.phrases !== undefined)
    return {
      left,
      anchor: t.anchor ?? "start",
      phrases: t.phrases.map((p) => ({
        content: p.text,
        attrs: {
          "font-family": p.face,
          "font-size": p.size,
          "font-weight": p.bold ? "bold" : "normal",
          "font-style": p.italic ? "italic" : "normal",
          "font-decoration": "none",
        },
      })),
      ...(klass === "" ? {} : { klass }),
    };
  /**
   * **A ROW THAT CLOSES A GROUP IS NOT ITSELF SELECTABLE.** `closeGroup` stamps the
   * `endGroup`'s `abcelem` onto the LAST row so the emitter can find it, but abcjs's own
   * row there is an ordinary `richText` one with no `info` and therefore `addTextIf`'s
   * `{-2, -2}` — the `-1`s belong to the `endGroup` row alone (`bottom-text.js:57`, `:61`).
   */
  const sel =
    t.selectable?.onGroupClose === true ? undefined : t.selectable;
  return {
    left,
    /**
     * **THE ROW'S TEXT IS THE JOIN, AND IT IS THE JOIN BEFORE `renderText`'s REWRITE.**
     * `addTextIf` is handed one string with the newlines still in it and `Svg.text` splits
     * it into a `<tspan>` per line, which is why our `PlacedText` carries a first line and
     * `extraLines`. `selectable.text` already holds the pre-rewrite join — it is what the
     * `extraText` selectable is built from — so it is preferred where there is one and the
     * lines are re-joined where there is not.
     */
    text:
      sel?.text ??
      (t.extraLines === undefined
        ? t.text
        : [t.text, ...t.extraLines].join("\n")),
    font,
    anchor: t.anchor ?? "start",
    startChar: sel?.startChar ?? -2,
    endChar: sel?.endChar ?? -2,
    ...(t.middleBaseline === true ? { "dominant-baseline": "middle" } : {}),
    ...(sel === undefined || sel.onGroupClose === true
      ? {}
      : { absElemType: sel.elType }),
    ...(klass === "" ? {} : { klass }),
    ...(t.dataName === undefined ? {} : { name: t.dataName }),
  };
};

/** `TopText.rows` / `BottomText.rows` — see `metaTextRow` and `MetaTextRow`. */
const metaTextRows = (
  rows: readonly MetaTextRow[],
  addClasses: boolean,
): Record<string, unknown>[] =>
  rows.map((r) =>
    "move" in r
      ? { move: r.move }
      : "startGroup" in r
        ? { startGroup: r.startGroup, klass: addClasses ? r.klass : "", name: r.name }
        : "endGroup" in r
          ? {
              endGroup: r.endGroup,
              absElemType: r.absElemType,
              startChar: -1,
              endChar: -1,
              name: r.name,
            }
          : metaTextRow(r.text, r.font, r.left, addClasses),
  );

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
const ABCJS_DEFAULT_FONTS: readonly (readonly [
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
 * **`tune.formatting` — THE `%%` SETTINGS abcjs COLLECTED.** Twenty-one font objects seeded
 * before any directive is read, then whatever the tune set IN SOURCE ORDER
 * (`Score.formattingOrder`), then `pagewidth` and `pageheight`, which abcjs appends LAST
 * whatever the source said.
 *
 * **A DEFAULT FONT AND A SET FONT HAVE DIFFERENT KEY ORDERS, AND THAT IS HOW abcjs TELLS
 * THEM APART ON SIGHT.** The default literal is `{face, size, weight, style, decoration}`;
 * `getFontParameter` builds `{face, weight, style, decoration}` and only then assigns `size`
 * (and `box`), so a set font reads `{face, weight, style, decoration, size, box?}`
 * (`abc_parse_directive.js:20-52`, `:200-240`). Reproduced, because `JSON.stringify` of this
 * object is output a host can take.
 */
/**
 * **THE ELEVEN `getChangingFont` TYPES**, whose `formatting` entry is their value AT THE END
 * OF THE HEADER and not their latest (`abc_parse_directive.js:315-322`). The other ten are
 * `getGlobalFont` and always report the latest.
 */
const CHANGING_FONTS = new Set([
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

const formattingOf = (score: Score): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, base] of ABCJS_DEFAULT_FONTS) {
    const from = CHANGING_FONTS.has(name)
      ? (score.headerFonts ?? score.fonts)
      : score.fonts;
    const set = from[name as AbcFontType];
    /**
     * **`%%partsbox` MUTATES WHATEVER `partsfont` OBJECT IS CURRENT** —
     * `multilineVars.partsfont.box = multilineVars.partsBox` (`:921-925`) — so it appends
     * `box` to the DEFAULT literal when no `%%partsfont` replaced it, which is why the key
     * lands after `decoration` rather than in a set font's position.
     */
    const boxed = name === "partsfont" && score.partsBox === true;
    out[name] =
      set === undefined
        ? { ...base, decoration: "none", ...(boxed ? { box: true } : {}) }
        : {
            face: set.face === "" ? base.face : set.face,
            weight: set.bold ? "bold" : "normal",
            style: set.italic ? "italic" : "normal",
            decoration: "none",
            size: set.size,
            ...(set.box === true || boxed ? { box: true } : {}),
          };
  }
  for (const key of score.formattingOrder ?? []) {
    if (key === "staffwidth" && score.staffWidth != null)
      out[key] = score.staffWidth / 1.33;
    else if (key === "musicspace" && score.musicSpace != null)
      out[key] = (score.musicSpace * 3) / 4;
    else if (key === "stretchlast" && score.stretchLast != null)
      out[key] = score.stretchLast;
    // **THE POINTS AS WRITTEN, NOT THE PIXELS THEY BECOME.** `tune.formatting[cmd]` takes
    // `points.value` straight off the token (`abc_parse_directive.js:421`); the 4/3 is
    // applied later, in `write/renderer.js`. `%%staffsep 90` is 90 here and 120 there.
    else if (key === "staffsep" && score.staffSep != null)
      out[key] = (score.staffSep * 3) / 4;
    else if (key === "sysstaffsep" && score.sysStaffSep != null)
      out[key] = (score.sysStaffSep * 3) / 4;
    else if (key === "maxStaves" && score.maxStaves != null) out[key] = score.maxStaves;
    else if (key === "jazzchords") out[key] = true;
    else if (key === "percmap") out[key] = score.percMap;
    else if (key === "midi")
      out[key] = {
        ...score.midi,
        ...(Object.keys(score.drumMap ?? {}).length === 0
          ? {}
          : { drummap: score.drumMap }),
      };
  }
  // **LAST, WHATEVER THE SOURCE SAID** — abcjs writes them after every directive has run.
  out.pagewidth = 612;
  out.pageheight = 792;
  return out;
};

const abcjsMeter = (score: Score): AbcjsMeter => {
  const m = getMeter(score);
  // A tune with no music has no staff and therefore no meter — `getMeter` falls through
  // to `common_time`, which is 4/4 whatever the header said.
  if (m.symbol === "common") return { type: "common_time" };
  if (m.symbol === "cut") return { type: "cut_time" };
  return {
    type: "specified",
    value: [{ num: String(m.numerator), den: String(m.denominator) }],
  };
};

/**
 * What `renderAbc` hands back, per tune.
 *
 * ponytail: abcjs's tune object also carries audio and timing methods (`setUpAudio`,
 * `millisecondsPerMeasure`, `getTotalTime`) and an `engraver` for its drag interaction.
 * None of them is faked — a stub returning plausible numbers would be worse than an absent
 * method, which at least fails loudly.
 *
 * **THE AUDIO HALF OF THAT IS NO LONGER A CAPABILITY GAP.** `setUpAudio`'s answer exists —
 * `src/audio/flatten.ts`, at 0 of 54 against abcjs's own event lists — and so does
 * `abcjs.synth.getMidiFile`'s, byte-exact in `src/audio/midi-file.ts`. What is missing is
 * the WIRING, and it is an API decision rather than an implementation one: neither is on
 * `src/index.ts`'s curated surface yet, and ARCHITECTURE.md governs what goes there. Hang
 * them here and they become part of the drop-in contract, which is what `compat` is for —
 * flag it before doing it.
 *
 * `millisecondsPerMeasure` and `getTotalTime` are still genuinely absent, and both belong
 * with `setTiming`, the audio↔geometry JOIN nothing measures yet.
 */
export interface TuneObject {
  /** The rendered markup, also injected into the target when there is a DOM. */
  readonly svg: string;
  /** abcts's own parsed score, for callers that want the real thing. */
  readonly score: Score;
  /** abcjs exposes the title list at `metaText.title`. */
  readonly metaText: Readonly<Record<string, unknown>>;
  /** `AbcTune`'s own, and it is abcjs's number rather than abcts's — a host may test it. */
  readonly version: string;
  /** `"screen"` unless `print: true` was asked for (`abc_parse.js:525-526`). */
  readonly media: "screen" | "print";

  // ── The accessors, bound to this tune (`abc_tune.js:90-181`) ────────────────
  readonly getMeter: () => AbcjsMeter;
  readonly getMeterFraction: () => AbcjsMeterFraction;
  readonly getBeatLength: () => number;
  readonly getBarLength: () => number;
  readonly getBeatsPerMeasure: () => number;
  readonly getBpm: () => number;
  readonly getPickupLength: () => number;
  readonly millisecondsPerMeasure: (bpmOverride?: number) => number;

  /**
   * `setTiming(bpm, measuresOfDelay)` — builds `noteTimings` and, on the way, the two
   * totals. abcjs STORES them, so `getTotalTime()` before `setTiming()` is `undefined`
   * from abcjs and must be `undefined` from us (`abc_tune.js:584-621`).
   */
  readonly setTiming: (bpm?: number, measuresOfDelay?: number) => NoteTiming[];
  /**
   * `setupEvents(startingDelay, timeDivider, startingBpm, warp)` — the walk `setTiming`
   * runs, with the four numbers it computes handed in instead (`abc_tune.js:438`), and
   * `addUsefulCallbackInfo(timingEvents, bpm)` — the one figure it stamps on every row
   * (`:527`). Both are public in abcjs and `setTiming` is a caller like any other.
   */
  readonly setupEvents: (
    startingDelay: number,
    timeDivider: number,
    startingBpm: number,
    warp?: number,
  ) => NoteTiming[];
  readonly addUsefulCallbackInfo: (
    timingEvents: readonly NoteTiming[],
    bpm: number,
  ) => NoteTiming[];
  readonly noteTimings: NoteTiming[];
  readonly getTotalTime: () => number | undefined;
  readonly getTotalBeats: () => number | undefined;

  /** `setUpAudio(options)` — the flattened event list `CreateSynth` plays. */
  readonly setUpAudio: (options?: AudioOptions) => FlatAudio;

  /**
   * abcjs's laid-out tree, PROJECTED from ours on read — see `src/compat/lines.ts`. It is
   * what a host walks to find the element under a caret, and `getElementFromChar` is that
   * walk.
   */
  readonly lines: readonly AbcLine[];
  readonly getElementFromChar: (char: number) => AbcElement | null;
  /**
   * `deline(options)` — `lines` with every run of music lines merged back into one, and
   * any staff `meter`/`key`/`clef`/font that CHANGED at a line boundary moved into the
   * voice stream as a `-1 … -1` element. See `src/compat/deline.ts`.
   */
  readonly deline: (options?: DelineOptions) => readonly AbcLine[];
  /** The first key on any staff of any line, or `{}` (`abc_tune.js:222-233`). */
  readonly getKeySignature: () => AbcElement | Record<string, never>;
  /**
   * **`meter` IS STATE THAT `getMeterFraction()` WRITES**, not an accessor — abcjs's own
   * comment says so: "is this saved value used anywhere? A get function shouldn't change
   * state" (`abc_tune.js:218-219`). It is `{num, den}`, the fraction, and it exists from
   * the first call onward. Ours is computed once at construction, which is the same value
   * a host can observe and does not depend on call order.
   */
  readonly meter: AbcjsMeterFraction;
  /**
   * `formatting` — the `%%` settings the parser collected. Initialised `{}`
   * (`abc_tune.js:20`) and read back by `setUpAudio`, which takes `formatting.percmap` and
   * `formatting.midi` from it (`:628`).
   */
  readonly formatting: Record<string, unknown>;
  /** `metaTextInfo` — where each `metaText` field was written. `{}` until one is recorded. */
  readonly metaTextInfo: Record<string, unknown>;
  /**
   * **abcjs's OWN INTERMEDIATE ROW LIST, not its answer.** `TopText`/`BottomText` build a
   * `rows` array interleaving `{move: n}` with text rows and, in the bottom block, a
   * group's open and close; `nonMusic` walks it spending each `move` on the page's own
   * cursor (`creation/elements/top-text.js`, `bottom-text.js`, `draw/non-music.js`).
   * `engraver-controller.js:222` and `:236` hang both on the tune, so a host reads them.
   *
   * Projected from `Layout.topTextRows` / `.bottomTextRows` on read, like `tune.lines` —
   * which is why they are not built until asked for and no `Layout` is retained.
   */
  readonly topText: { readonly rows: readonly Record<string, unknown>[] };
  readonly bottomText: { readonly rows: readonly Record<string, unknown>[] };

  /**
   * `engraver.selectables` and the two accessors over it. abcjs returns `[]` and `null`
   * when there is no engraver at all (`abc_tune.js:633-642`), which is what `parseOnly`
   * hands back.
   */
  readonly engraver: { readonly selectables: readonly Selectable[] };
  readonly getSelectableArray: () => readonly Selectable[];
  readonly findSelectableElement: (target: unknown) => unknown;
}

/** A div, an id, `"*"` for a headless slot, or nothing (`abc_tunebook.js:76-82`). */
type Target = string | { innerHTML: string } | null | undefined;

function resolve(target: Target): { innerHTML: string } | null {
  if (target === null || target === undefined) return null;
  if (typeof target !== "string") return target;
  // Only look for an element when there is a document — this must run under Node too.
  const doc = (
    globalThis as { document?: { getElementById(id: string): unknown } }
  ).document;
  const found = doc?.getElementById(target);
  return (found as { innerHTML: string } | undefined) ?? null;
}

/**
 * abcjs's `renderAbc`.
 *
 * **IT RENDERS ONE TUNE PER OUTPUT SLOT, NOT ONE PER TUNE.** `renderEngine` normalises a
 * non-array `output` to `[output]`, opens at `params.startingTune ?? 0`, and walks the
 * SLOTS — so a single div renders the FIRST tune and nothing else, an array of three
 * renders three, and a slot past the end of the book CLEARS its div rather than being
 * skipped (`api/abc_tunebook.js:56-104`). `"*"` is a headless slot: the work is done and
 * no markup is shown.
 *
 * Ours returned one object per TUNE and joined every `svg` into the one target, which is
 * a divergence on the most-used function in the library and which no gate could see: the
 * byte gates ask for `renderAbc(...)[i]` and were handed an array our own implementation
 * had over-filled. Measured against abcjs on `tunebook-3` — `numberOfTunes` 3, a string
 * target returns 1, an array of three returns 3 — and then read back in the source before
 * it was changed.
 *
 * A DOM target is filled in; without one — Node, a test — the markup comes back on the
 * returned objects and nothing is injected.
 */
export function renderAbc(
  target: Target | readonly Target[],
  abc: string,
  params: AbcjsParams = {},
): TuneObject[] {
  const result = parse(abc, {
    mode: "abcjs-strict",
    ...(params.visualTranspose
      ? { visualTranspose: params.visualTranspose }
      : {}),
  });
  const staffSpace = STAFF_SPACE_PX * (params.scale ?? 1);
  // abcjs's staffwidth is the MUSIC AREA in pixels; core's `systemWidth` is the PAGE in
  // staff spaces — `%%staffwidth` maps `staffWidth / 7.75 + 2 * marginX` and the engine
  // default is 700 for abcjs's 670. Dropping the padding here made every justified line
  // 30px narrow (`L 655` where abcjs writes `L 685`) and it was invisible to every
  // geometry gate, because they all render with NO staffwidth and take the default.
  // …AND PRINT'S MARGINS AND MUSIC WIDTH ARE EACH DIVIDED BY THE SCALE, which is one
  // division of the same sum (`engraver-controller.js:124-126`, `renderer.js:78-86`).
  const printing = params.print === true;
  const padding = printing ? PRINT_PADDING : SCREEN_PADDING;
  const scale = printing ? PRINT_SCALE : 1;
  /**
   * **AND abcjs HAS A DEFAULT STAFFWIDTH OF ITS OWN — 740 ON SCREEN, 680 IN PRINT.**
   *
   *     if (params.staffwidth) { staffwidthScreen = staffwidthPrint = params.staffwidth }
   *     else { staffwidthScreen = 740; staffwidthPrint = 680 }
   *
   * (`engraver-controller.js:52-60`, and `:210` picks by media.) The engine's own default
   * is 700px of PAGE, which is abcjs's 670 plus its margins — the width every golden in
   * both corpora is generated at, `dump-svg.js`'s explicit `{staffwidth: 670}`.
   *
   * **SO NO GATE HERE HAD EVER MEASURED THE DEFAULT**, and it was 70px narrow: a host
   * calling `renderAbc('paper', abc)` with no params got abcjs's PAGE at 700 instead of
   * 770, and every centred title with it. Named by the selectable array, whose oracle is
   * the only one generated WITHOUT a staffwidth — `x="350"` against abcjs's `x="385"`,
   * which is `15 + 740 / 2`. A gate's reach is a property of its inputs.
   */
  const staffwidth = params.staffwidth ?? (printing ? 680 : 740);
  const systemWidth = (staffwidth + padding * 2) / UNIT_PX / scale;

  /**
   * **THE SLOTS, NOT THE TUNES.** A non-array output is one slot (`abc_tunebook.js:65-66`);
   * `startingTune` is where the walk opens (`:69`); a slot past the end of the book empties
   * its div and contributes NOTHING to the returned array (`:99-102`).
   */
  const slots: readonly Target[] = Array.isArray(target)
    ? (target as readonly Target[])
    : [target as Target];
  const from =
    params.startingTune === undefined
      ? 0
      : Number.parseInt(String(params.startingTune), 10);

  const render = (score: (typeof result.scores)[number]): TuneObject => {
    /**
     * **`noteTimings` AND THE TOTALS ARE STATE, not derived on read.** `setTiming` writes
     * all three onto the tune and the three getters just read the fields
     * (`abc_tune.js:584-621`), so a host that calls `getTotalTime()` first gets
     * `undefined` from abcjs — and must get `undefined` from us.
     */
    let lineCache: readonly AbcLine[] | null = null;
    let eventIndex: {
      byEvent: ReadonlyMap<MusicEvent, AbcElement>;
      byRange: ReadonlyMap<number, AbcElement>;
    } | null = null;
    let selectableCache: readonly Selectable[] | null = null;
    /**
     * The drawing. The selectable array is a walk of it — the same walk the emitter writes
     * `data-index` in — but it is **LAID OUT AGAIN rather than retained**: a `Layout` is
     * the biggest object this library makes, a host keeps every `TuneObject` a render
     * returns, and holding one per tune made the test suite's own memory blow up and its
     * workers start dying mid-file. Re-laying costs 0.7ms and only when a host asks.
     */
    const laidOut = (): ReturnType<typeof layout> =>
      layout(score, {
        mode: "abcjs-strict",
        ...(systemWidth ? { systemWidth } : {}),
        ...(printing ? { print: true } : {}),
      });
    const projection = (): {
      byEvent: ReadonlyMap<MusicEvent, AbcElement>;
      byRange: ReadonlyMap<number, AbcElement>;
    } => {
      if (eventIndex === null) {
        const p = projectionOf(score, abc);
        lineCache = p.lines;
        eventIndex = { byEvent: p.byEvent, byRange: p.byRange };
      }
      return eventIndex;
    };
    /**
     * **THE RECORDS THE EMITTER MADE WHILE IT DREW.** abcjs builds its selectable array
     * inside `draw()`, so the array and `data-index` come from ONE walk; ours did too for
     * the markup and then re-derived the array from the layout, which is a second copy of a
     * walk that cannot reach a text row, a brace, a voice name, an ending, a triplet, a
     * curve or a dynamic at all — none of those is in `staff.voices`.
     *
     * Filled by the `toSVG` call below, which is EAGER, so it is populated before a host
     * can ask. Empty when nothing was rendered — `parseOnly` — which is abcjs's `[]`.
     */
    const records: SelectableRecord[] = [];
    /**
     * **abcjs's `TopText.rows` / `BottomText.rows`, CAPTURED FROM THE RENDER AND NOT THE
     * `Layout`.** Both are set by `engraveABC` (`engraver-controller.js:222`, `:236`), so
     * they exist only once something has been drawn — and holding the `Layout` itself to
     * reach them is the trap that took the suite from 5.6s to 120s. These two arrays are a
     * few dozen entries; the `Layout` is the biggest object this library makes.
     */
    const metaRows: { top: MetaTextRow[]; bottom: MetaTextRow[] } = {
      top: [],
      bottom: [],
    };
    const selectables = (): readonly Selectable[] => {
      selectableCache ??= selectablesOf(
        records,
        projection(),
        params.selectTypes,
      );
      return selectableCache;
    };
    const timings: {
      rows: NoteTiming[];
      time: number | undefined;
      beats: number | undefined;
    } = { rows: [], time: undefined, beats: undefined };
    return {
      svg: ((): string => {
        const doc = laidOut();
        metaRows.top = [...(doc.topTextRows ?? [])];
        metaRows.bottom = [...(doc.bottomTextRows ?? [])];
        return toSVG(
        doc,
        {
          staffSpace,
          classes: "abcjs",
          selectables: records,
          // What a host may click decides the markup as well as the array — an element is
          // `selectable="false"` with only its index by default and a real tab stop with
          // one (`draw/selectables.js:19-23`).
          ...(params.selectTypes === undefined
            ? {}
            : { selectTypes: params.selectTypes }),
          // abcjs emits its per-element class scheme only when the host asks for it.
          ...(params.add_classes === true ? { addClasses: true } : {}),
          /**
           * abcjs's `aria-label` carries the title; the padding is abcjs's own 15 either side.
           *
           * **AND A RICH TITLE GOES IN AS AN ARRAY.** `setPaperSize` builds the label by
           * CONCATENATION — `"Sheet Music for \"" + metaText.title + '"'`
           * (`draw/set-paper-size.js:12`) — and `metaText.title` is the phrase array whenever
           * the field carried a `$N`, so JS's own `Array.prototype.toString` writes
           * `[object Object],[object Object],…`. Measured from abcjs's own golden, not
           * reasoned: `visual-misc-06`'s label says exactly that.
           */
          ...(score.metadata.titles[0] === undefined
            ? {}
            : { title: ariaTitle(score.metadata.titles[0]) }),
          // NO `pageWidth` HERE. The page is `layout()`'s own ratchet — the staff width plus
          // abcjs's 15px either side (`write/renderer.js:69-72`), raised by any line too stiff
          // to compress to it and REPLACED outright by a `%%staffwidth`, which the host cannot
          // know. Forcing it to `staffwidth + 30` wrote `width="700"` where abcjs writes 296
          // for `%%staffwidth 200` and 752.491 for a tune that overflows.
        },
        );
      })(),
      score,
      // abcjs's `metaText.title` is a plain string even when the field changed font
      // mid-line — the phrases are a LAYOUT structure, not part of the public shape.
      metaText: metaTextOf(score),
      get topText() {
        return { rows: metaTextRows(metaRows.top, params.add_classes === true) };
      },
      get bottomText() {
        return { rows: metaTextRows(metaRows.bottom, params.add_classes === true) };
      },

      // abcjs's own version string, not abcts's — a host may feature-detect on it.
      version: ABCJS_TUNE_VERSION,
      media: printing ? "print" : "screen",

      getMeter: () => abcjsMeter(score),
      getMeterFraction: () => {
        const m = abcjsMeter(score);
        if (m.type === "cut_time") return { num: 2, den: 2 };
        const first = m.value?.[0];
        if (m.type !== "specified" || first === undefined)
          return { num: 4, den: 4 };
        // **A COMPOUND NUMERATOR SUMS ITS PARTS** — `3+2+3` is 8 (`abc_tune.js:202-207`).
        const num =
          first.num.indexOf("+") > 0
            ? first.num
                .split("+")
                .reduce((t, p) => t + Number.parseInt(p, 10), 0)
            : Number.parseInt(first.num, 10);
        return { num, den: Number.parseInt(first.den, 10) };
      },
      /**
       * `getKeySignature()` — the FIRST key on any staff of any line, or `{}`
       * (`abc_tune.js:222-233`). It walks `lines`, so it is the same object a host reads
       * off the staff, and the empty object for a tune with no music is abcjs's own answer
       * rather than a null.
       */
      getKeySignature: () => {
        const voice = score.voices[0];
        return keyElement(score.key, voice?.clef ?? defaultClef);
      },

      meter: (() => {
        const m = abcjsMeter(score);
        if (m.type === "cut_time") return { num: 2, den: 2 };
        const first = m.value?.[0];
        if (m.type !== "specified" || first === undefined)
          return { num: 4, den: 4 };
        const num =
          first.num.indexOf("+") > 0
            ? first.num
                .split("+")
                .reduce((t, part) => t + Number.parseInt(part, 10), 0)
            : Number.parseInt(first.num, 10);
        return { num, den: Number.parseInt(first.den, 10) };
      })(),
      formatting: formattingOf(score),
      /**
       * **THE FIELD LINE'S OWN SPAN, PER FIELD** — see `ScoreMetadata.fieldRanges`. abcjs
       * starts this `{}` and adds a key only when a field is written
       * (`abc_tune.js:19`, `tune-builder.js:433-462`), so a tune with no `T:` has no
       * `title` key rather than a null one.
       */
      metaTextInfo: Object.fromEntries(
        [
          ["title", score.metadata.titleRanges[0]] as const,
          ...Object.entries(score.metadata.fieldRanges),
        ].flatMap(([key, r]) =>
          r === undefined ? [] : [[key, { startChar: r.start, endChar: r.end }]],
        ),
      ),

      getBeatLength: () => getBeatLength(score),
      getBarLength: () => getBarLength(score),
      getBeatsPerMeasure: () => getBeatsPerMeasure(score),
      getBpm: () => getBpm(score),
      getPickupLength: () => getPickupLength(score),
      millisecondsPerMeasure: (bpmOverride?: number) =>
        millisecondsPerMeasureOf(score, bpmOverride),

      setTiming(bpm?: number, measuresOfDelay?: number): NoteTiming[] {
        const t = timingsOf(score, {
          ...(bpm === undefined ? {} : { bpm }),
          ...(measuresOfDelay === undefined ? {} : { measuresOfDelay }),
        });
        timings.rows = t.rows;
        timings.time = t.totalTime;
        timings.beats = t.totalBeats;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        (this as { noteTimings: NoteTiming[] }).noteTimings = t.rows;
        return t.rows;
      },
      setupEvents: (
        startingDelay: number,
        timeDivider: number,
        startingBpm: number,
        warp = 1,
      ) => setupEventsFor(score, startingDelay, timeDivider, startingBpm, warp),
      addUsefulCallbackInfo: (rows: readonly NoteTiming[], bpm: number) =>
        addUsefulCallbackInfo(score, rows, bpm),
      noteTimings: timings.rows,
      getTotalTime: () => timings.time,
      getTotalBeats: () => timings.beats,

      setUpAudio: (options: AudioOptions = {}) => {
        const audio = flattenAudio(score, options);
        // **THE FLATTENER WRITES BACK ONTO THE ELEMENT** — `currentTrackMilliseconds`,
        // `currentTrackWholeNotes` and `midiPitches` land on the very `tune.lines` element
        // a host then reads (`abc_midi_flattener.js:526-596`). It is a THIRD surface over
        // the same walk and the one a playback cursor lights.
        //
        // **A NUMBER BECOMES AN ARRAY ONLY WHEN A SECOND, DIFFERENT VALUE ARRIVES** —
        // through a repeat — and `midiPitches` carries the ELEMENT's own `startChar` and
        // `endChar`, which is why this is stamped here rather than in the flattener: only
        // this side holds the projected span.
        const index = projection().byEvent;
        for (const [event, timing] of audio.elementTimings) {
          const abcelem = index.get(event);
          if (abcelem === undefined) continue;
          const ms = timing.milliseconds[0];
          const wholes = timing.wholeNotes[0];
          if (ms !== undefined && wholes !== undefined) {
            abcelem.currentTrackMilliseconds =
              timing.milliseconds.length === 1 ? ms : [...timing.milliseconds];
            abcelem.currentTrackWholeNotes =
              timing.wholeNotes.length === 1 ? wholes : [...timing.wholeNotes];
          }
          if (timing.notes.length > 0)
            abcelem.midiPitches = timing.notes.map((n) => ({
              ...n,
              startChar: abcelem.startChar,
              endChar: abcelem.endChar,
            }));
        }
        return audio;
      },

      get lines(): readonly AbcLine[] {
        // Built on read and cached for the object's life — a host that never asks for it
        // pays nothing, which is the point of it being a projection. Asking for the
        // SELECTABLES builds it too, because they hold the very same elements.
        selectables();
        return lineCache ?? [];
      },
      getElementFromChar(char: number): AbcElement | null {
        selectables();
        return elementFromChar(lineCache ?? [], char);
      },
      deline(options?: DelineOptions): readonly AbcLine[] {
        selectables();
        return delineOf(lineCache ?? [], options);
      },

      get engraver(): { selectables: readonly Selectable[] } {
        return { selectables: selectables() };
      },
      getSelectableArray: () => selectables(),
      findSelectableElement: (target: unknown) =>
        findSelectable(selectables(), target),
    };
  };

  return walkSlots(slots, from, result.scores, (element, score) => {
    const tune = render(score);
    if (element !== null) element.innerHTML = tune.svg;
    return tune;
  });
}

/**
 * `renderEngine(callback, output, abc, params)` — abcjs's generic slot walker, and the
 * thing `renderAbc`, `parseOnly` and `tuneMetrics` are each one callback away from
 * (`api/abc_tunebook.js:56-104`).
 *
 * The callback's return REPLACES the tune in the result when it is truthy
 * (`var override = callback(...); ret.push(override ? override : tune)`), which is how
 * `tuneMetrics` returns measure widths from the same walk.
 */
export function renderEngine<T>(
  callback: (
    element: { innerHTML: string } | null,
    tune: TuneObject,
    index: number,
  ) => T,
  output: Target | readonly Target[],
  abc: string,
  params: AbcjsParams = {},
): (T | TuneObject)[] {
  const tunes = renderAbc(
    Array.isArray(output) ? (output as readonly Target[]) : [output as Target],
    abc,
    params,
  );
  return tunes.map((tune, i) => {
    const override = callback(null, tune, i);
    return override ? override : tune;
  });
}

/** The slot rule itself — see `renderAbc`. */
function walkSlots(
  slots: readonly Target[],
  from: number,
  scores: readonly Score[],
  make: (element: { innerHTML: string } | null, score: Score) => TuneObject,
): TuneObject[] {
  const tunes: TuneObject[] = [];
  slots.forEach((slot, i) => {
    // A HEADLESS slot does the work and shows nothing (`abc_tunebook.js:78-80`).
    const element = slot === "*" ? null : resolve(slot);
    const score = scores[from + i];
    if (score === undefined) {
      // …AND A SLOT PAST THE END CLEARS ITS DIV rather than being skipped (`:99-102`).
      if (element !== null) element.innerHTML = "";
      return;
    }
    tunes.push(make(element, score));
  });
  return tunes;
}

/**
 * `parseOnly(abc, params)` — every tune parsed and none of them drawn.
 *
 * abcjs builds an output array of `numberOfTunes` slots and passes a callback that does
 * nothing (`api/abc_tunebook.js:42-54`), so this is the whole book, one object per tune,
 * with no markup. Ours renders nothing at all rather than rendering into a hidden div,
 * which is the "internals are ours" half of the ruling — the observable result is the same
 * array of tune objects.
 */
/**
 * `abcjs.strTranspose(abc, tunes, steps)` — ABC text in, ABC text out.
 *
 * abcjs takes the array `renderAbc` returned; ours takes the same, and reads each object's
 * `score`. The implementation is `src/str/transpose.ts` and is gated against 59 of abcjs's
 * own cases.
 */
export function strTranspose(
  abc: string,
  tunes: readonly TuneObject[],
  steps: number,
): string {
  return transposeString(
    abc,
    tunes.map((t) => t.score),
    steps,
  );
}

/**
 * `abcjs.synth` — the parts that make no sound, which are the parts that can be compared
 * exactly. `CreateSynth`, `SynthController` and `CreateSynthControl` need WebAudio and a
 * soundfont and are not here yet; their contract is the event sequence, already 0 of 72.
 */
export const synth = {
  pitchToNoteName,
  instrumentIndexToName,
  supportsAudio,
  registerAudioContext,
  activeAudioContext,
  /** `getMidiFile(source, options)` — a string is parsed, a tune array is used as given. */
  getMidiFile(
    source: string | readonly TuneObject[],
    options: MidiFileParams = {},
  ): (string | Uint8Array)[] {
    const tunes =
      typeof source === "string"
        ? parseOnly(source)
        : (source as readonly TuneObject[]);
    return getMidiFileFor(
      tunes.map((t) => t.score),
      // The MIDI track name, which is the title as a plain string — a RICH title is not one
      // and abcjs's own writer would put `[object Object]` there, so it is skipped instead.
      tunes.map((t) =>
        typeof t.metaText.title === "string" ? t.metaText.title : undefined,
      ),
      options,
    );
  },
};

/**
 * `abcjs.test` — the two internals abcjs exposes "for testing", and which its own golden
 * generator calls. `EngraverController` is what a STACKED render is.
 */
export const test = { Parse, EngraverController };

export function parseOnly(abc: string, params: AbcjsParams = {}): TuneObject[] {
  return renderAbc(
    new Array<string>(numberOfTunes(abc)).fill("*"),
    abc,
    params,
  );
}

/**
 * **A WHOLE TUNEBOOK STACKED INTO ONE SVG.**
 *
 * This is not `renderAbc` with a different flag: abcjs's public API has no entry point
 * for it. `renderAbc` gives each tune its own `EngraverController` and therefore its own
 * `<svg>`; a stacked render is `new EngraverController(div, params).engraveABC(allTunes)`
 * — ONE controller, one renderer, every tune drawn in turn down the same page
 * (`engraver-controller.js:105-118`). That is what abcjs's own golden generator calls,
 * and what `-stacked` in the sibling corpus is.
 *
 * The composition rule is in `toSVG`; this only supplies the layouts and the fact that
 * the root's `aria-label` comes from the LAST tune, because `setPaperSize` runs per tune
 * and the last call wins.
 */
export function renderTuneBook(abc: string, params: AbcjsParams = {}): string {
  // **AND IT DELEGATES**, rather than standing beside `EngraverController` doing the same
  // thing: abcjs's own generator calls `new EngraverController(div, params).engraveABC(…)`
  // and this is that call.
  return new EngraverController(null, params).engraveABC(
    parseOnly(abc, params),
  );
}
