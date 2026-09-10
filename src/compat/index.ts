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
 * `abcjs-extended`.
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
  type TimingGeometry,
  addUsefulCallbackInfo,
  setupEventsFor,
  timingsOf,
} from "../audio/timing.js";
import {
  type AbcFontType,
  type CompatibilityMode,
  defaultClef,
  type MusicEvent,
  type FreeTextBlock,
  plainText,
  type RichPhrase,
  type RichText,
  type Score,
} from "../core/model.js";
import { type DelineOptions, delineOf } from "./deline.js";
import {
  applyLineBreaks,
  calcLineWraps,
  findLineBreaks,
  type WrapExplanation,
  type WrapLineBreak,
  type WrapParams,
} from "./wrap.js";
export { TimingCallbacks, type TimingCallbacksParams } from "./timing-callbacks.js";
export {
  type AnimationOptions,
  animationTimer,
  pauseAnimation,
  startAnimation,
  stopAnimation,
} from "./animation.js";
import { type ExtractedTune, extractMeasuresOf } from "./extract-measures.js";
import {
  type AbcElement,
  type AbcLine,
  elementFromChar,
  projectionOf,
  tempoElement,
} from "./lines.js";
import {
  abcelemOf,
  findSelectable,
  stampEngravedSystems,
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
  midiRenderer,
  supportsAudio,
  SynthSequence,
} from "./synth.js";
import { numberOfTunes } from "./tunebook.js";
import { parse } from "../parser/parser.js";
import { EngraverController, Parse } from "./engraver.js";
import { strTranspose as transposeString } from "../str/transpose.js";
import { STAFF_SPACE_PX, UNIT_PX } from "../renderer/abcjs-constants.js";
export { setGlyph } from "../renderer/set-glyph.js";
export type {
  AbsoluteElementLike,
  TimingEvent,
  VoiceElementRow,
} from "./voices-array.js";
/**
 * The textarea binding — `Editor` and the `EditArea` it wraps one in. Exported from
 * here because that is where abcjs exports them from, and because `Editor` renders
 * through `renderAbc` in this very file.
 */
export {
  EditArea,
  Editor,
  type EditorListener,
  type EditorPaper,
  type EditorParams,
  type EditorTextArea,
} from "./editor.js";

/**
 * abcjs's `spacing.STEP` — ONE PITCH, half a staff space. Every vertical figure a timing
 * row carries is a pitch times this (`abc_tune.js:401-409`).
 */
const PITCH_STEP_PX = STAFF_SPACE_PX / 2;

/** abcjs's `renderer.padding.left` on screen — the margin every system's music starts at. */
const PAGE_MARGIN_PX = 15;
import { layout, type MetaTextRow, type PlacedText } from "../renderer/layout.js";
import { type DrawnElement, type SelectableRecord, toSVG } from "../renderer/svg.js";
import { setupSelection } from "./interactive.js";
import { createDomTextMeasurer, setTextMeasurer } from "../renderer/text-measure.js";
import {
  type HighlightPaper,
  rangeHighlighter,
} from "./range-highlight.js";
import { warningsOf } from "./warnings.js";
export {
  type ControlElement,
  CreateSynthControl,
  type SynthControlOptions,
} from "./synth-control.js";
import { CreateSynthControl } from "./synth-control.js";
export {
  type CursorControl,
  type MidiBuffer,
  SynthController,
  type SynthVisualOptions,
} from "./synth-controller.js";
import { SynthController } from "./synth-controller.js";
export {
  type SequenceOptions,
  type SequenceRow,
  sequenceOf,
  type SequenceTune,
} from "./sequence.js";
import {
  type SequenceOptions,
  sequenceOf,
  type SequenceRow,
  type SequenceTune,
} from "./sequence.js";
export {
  type AudioBufferLike,
  CreateSynth,
  type CreateSynthInitOptions,
  createNoteMap,
  type MappedNote,
  type NotesAvailable,
  notesAvailable,
  playEvent,
  type Playable,
  soundsCache,
} from "./create-synth.js";
import { abcjsFont, ABCJS_DEFAULT_FONTS, CHANGING_FONTS, richOf } from "./fonts.js";
import { CreateSynth, notesAvailable, playEvent } from "./create-synth.js";
import {
  type MeasureSection,
  measureWidthsOf,
} from "./tune-metrics.js";
import {
  type AbsoluteElementLike,
  addElementToEvents,
  makeVoicesArrayOf,
  type TimingEvent,
  type VoiceElementRow,
} from "./voices-array.js";

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
  /**
   * **abcts's ONE ADDITION TO abcjs'S PARAMS, AND IT DEFAULTS TO abcjs.**
   *
   * abcjs has no such option — it has only itself to be. Without one, `abcjs-extended` was
   * reachable only through `parse`/`render`, which means a drop-in host could not get at
   * the parsing fixes or the engraving abcjs lacks without abandoning the API it already
   * calls. Omitted, this is `abcjs-strict` and every byte is abcjs's, which is what a
   * drop-in must be.
   *
   * Safe to set because of the owner's rule of 2026-09-07: extended is byte-identical to
   * strict except for the divergences declared in `Docs/ABCJS-DIFFERENCES.md`, and
   * `tests/mode-bytes.test.ts` holds all 691 corpus fixtures to it. Before that rule this
   * option would have handed a host a different engraving engine.
   */
  readonly mode?: CompatibilityMode;
  /** Staff width in pixels. abcjs's default is 740 on screen. */
  readonly staffwidth?: number;
  /**
   * **RE-LINE THE MUSIC TO FIT `staffwidth`** — abcjs's five knobs, all optional. See
   * `src/compat/wrap.ts`.
   *
   * ⚠️ **AND IT DOES NOTHING ON A HEADLESS RENDER.** `renderAbc('*', abc, {wrap})` returns
   * no `explanation` and no `lineBreaks`, because abcjs's guard is
   * `if (!removeDiv && params.wrap && params.staffwidth)` and `'*'` sets `removeDiv`
   * (`api/abc_tunebook_svg.js:112-120`). It also does nothing without a `staffwidth`.
   */
  readonly wrap?: WrapParams;
  /**
   * abcjs's PAGE media — a 0.75 CSS scale on the root, print's own page margins, an extra
   * `spacing.top` above the title and an eleven-inch minimum height. See
   * `LayoutOptions.print`.
   */
  readonly print?: boolean;
  /** Uniform scale factor applied to the whole drawing. */
  readonly scale?: number;
  /**
   * **`"resize"` — THE SCORE SCALES WITH ITS COLUMN INSTEAD OF OVERFLOWING IT**, and the
   * option a host reaches for first. abcjs puts a `viewBox` on the SVG, takes its `width`
   * and `height` off, and gives the CONTAINER a `padding-bottom` ratio
   * (`draw/set-paper-size.js:30`, `write/svg.js:33-59`) — all of it through the DOM, so
   * `sizeContainer` applies it after the markup is inserted, exactly as `restyleScale`
   * does for `%%scale`.
   *
   * Any other value is abcjs's `else` arm, which is what an absent one takes too.
   */
  readonly responsive?: string;
  /**
   * **ONE `<svg>` PER SYSTEM, EACH IN AN `overflow: hidden` DIV OF ITS OWN.**
   *
   * `splitSvgIntoLines` walks the top-level `<g>`s of the finished SVG — a line, or the top
   * matter, or the bottom matter — and moves each into a duplicate of the root, with a
   * `viewBox` that scrolls to where the section was drawn and an
   * `aria-label`/`<title>` of `Sheet Music for "<title>" section N`
   * (`write/engraver-controller.js:307-368`). It runs AFTER `setPaperSize`, so the
   * container keeps the height the whole score would have had.
   *
   * ⚠️ **IT NEEDS A LAYOUT ENGINE** — every section's box comes from `getBBox()`, so this
   * does nothing headless, exactly as abcjs's does nothing headless.
   */
  readonly oneSvgPerLine?: boolean;
  /**
   * **THE TARGET BECOMES A VIEWPORT AND THE MUSIC GOES IN A `div.abcjs-inner` INSIDE IT**
   * (`api/abc_tunebook_svg.js:29-40`). The div the host passed is given `overflow: hidden`
   * — or `overflow-x: auto; overflow-y: hidden` under {@link scrollHorizontal} — and every
   * style `setPaperSize` would have put on it lands on the inner div instead. The outer
   * then takes the inner's WIDTH, which is empty above scale 1 and therefore usually a
   * no-op.
   *
   * ⚠️ **abcjs ALSO REGISTERS THE OUTER DIV FOR A WINDOW-RESIZE HANDLER, BY `id`** — see
   * `registerResizeViewport`. A div with no `id` is registered under `undefined`, so the
   * LAST such div on the page wins; that is abcjs's behaviour and it is reproduced.
   */
  readonly viewportHorizontal?: boolean;
  /** {@link viewportHorizontal}'s vertical arm — `div.abcjs-inner.scroll-amount`, and the
   * outer scrolls vertically (`api/abc_tunebook_svg.js:41-47`). No resize registration. */
  readonly viewportVertical?: boolean;
  /** Under {@link viewportHorizontal}, scroll rather than clip. Ignored without it. */
  readonly scrollHorizontal?: boolean;
  /**
   * **`%%jazzchords` FROM THE HOST** — chord modifiers and bass notes as small sub- and
   * superscripts. `if (params.jazzchords) this.jazzchords = params.jazzchords`, and the
   * TUNE's own directive overrides it per tune (`engraver-controller.js:69-70`, `:188`);
   * that directive can only ever turn it ON.
   */
  readonly jazzchords?: boolean;
  /**
   * abcjs adds its `abcjs-*` classes only when asked. Compat emits them either way,
   * because they are the reason to use this entry point; the flag is accepted so that
   * existing calls do not have to change.
   */
  readonly add_classes?: boolean;
  /** Which tune of the book the first output slot gets (`abc_tunebook.js:69`). */
  readonly startingTune?: number | string;
  /**
   * The ink colour, and the one a CLEARED selection is repainted in —
   * `params.foregroundColor ? params.foregroundColor : "currentColor"`
   * (`engraver-controller.js:80`). Read by `rangeHighlight` only; the drawing's own
   * `currentColor` is emitted whatever this says.
   */
  readonly foregroundColor?: string;
  /**
   * **TURNS A CLICK INTO A DRAG.** With it every `selectable="true"` element becomes a tab
   * stop with `keydown`/`keyup`/`focus` handlers, the arrow keys move a note by
   * `spacing.STEP` and report a `step` to the listener, and a mouse drag does the same
   * (`write/interactive/selection.js:6-17`, `:291-311`).
   *
   * ⚠️ **THE KEYBOARD HALF NEEDS A `selectTypes` TOO** — without one abcjs marks every
   * selectable `selectable="false"` and the `tabindex` loop matches nothing. The MOUSE
   * half works either way.
   */
  readonly dragging?: boolean;
  /**
   * **THE ROOT'S `aria-label`, AND `''` TURNS OFF THE `<title>` WITH IT.**
   * `if (renderer.ariaLabel !== '')` guards the whole accessibility block
   * (`draw/set-paper-size.js:9-16`), so an empty string emits neither the attribute nor the
   * `<title>` element — which is how a host suppresses a duplicate announcement when the
   * score already has a visible heading.
   */
  readonly ariaLabel?: string;
  /**
   * **`germanAlphabet` — H FOR B, AND B FOR B FLAT, IN CHORD SYMBOLS.** abcjs applies it in
   * `translateChord` to the chord's ROOT and its `/bass` and to nothing else
   * (`creation/translate-chord.js:1-10`, `:24-27`), so `Bm` draws as `Hm` and `Bb7` as
   * `B7`. A host option with no directive spelling.
   */
  readonly germanAlphabet?: boolean;
  /**
   * **THE CALLBACK A CLICK IN THE SCORE CALLS** — `(abcelem, tuneNumber, classes,
   * analysis, drag, ev)`. abcjs pushes it onto `this.listeners`
   * (`engraver-controller.js:61-63`) and `notifySelect` walks them
   * (`interactive/selection.js:350-358`).
   *
   * ⚠️ **THE SECOND-ARGUMENT FORM IS A DIFFERENT OPTION.** `renderAbc`'s old
   * three-parameter signature reads `engraverParams.listener.highlight` and copies it HERE
   * (`api/abc_tunebook_svg.js:94-99`), which is why a `listener` in the second argument and
   * a `clickListener` in the first mean the same thing.
   */
  readonly clickListener?: (...args: unknown[]) => void;
  /** What a selected element is painted (`interactive/highlight.js` defaults to `#ff0000`). */
  readonly selectionColor?: string;
  /** What a DRAGGING element is painted; falls back to {@link selectionColor}. */
  readonly dragColor?: string;
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
  // …and the `%%abc-…` five, which are PLAIN STRINGS and keyed by abcjs's own hyphenated
  // names — see `ScoreMetadata.abcMeta`.
  for (const [key, value] of Object.entries(m.abcMeta)) if (value !== undefined) out[key] = value;
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

/**
 * **ONE ROW OF `abcLine.nonMusic.rows`, WHICH IS NOT `addTextIf`'s SHAPE.** `Subtitle` and
 * `FreeText` push their row as a LITERAL of their own — `{left, text, font, klass, anchor,
 * startChar, endChar, absElemType, name}` (`elements/subtitle.js:7`, `free-text.js:11`) —
 * so the keys come in a different order from a top-block row's, and
 * **THE CLASS IS UNCONDITIONAL**: both elements name it outright where `TopText` gates
 * every one of its own on `shouldAddClasses`.
 */
const nonMusicRow = (
  t: PlacedText,
  font: AbcFontType,
  left: number,
): Record<string, unknown> => {
  const row = metaTextRow(t, font, left, false);
  return {
    left: row.left,
    text: row.text,
    font: row.font,
    klass: t.dataName === "subtitle" ? "text subtitle" : "defined-text",
    anchor: row.anchor,
    /**
     * ⚠️ **AND AN ABSENT SPAN IS ABSENT, NOT `-2`.** `Subtitle` and `FreeText` write
     * `info.startChar` straight into the row (`subtitle.js:7`, `free-text.js:11`) and a
     * `%%center` has no `info` at all (`abc_parse_directive.js:986`), so `JSON.stringify`
     * drops both keys. The `-2` is `addTextIf`'s own default and belongs to the TOP
     * block's rows alone.
     */
    ...(t.selectable?.startChar === undefined ? {} : { startChar: row.startChar }),
    ...(t.selectable?.endChar === undefined ? {} : { endChar: row.endChar }),
    ...(row.absElemType === undefined ? {} : { absElemType: row.absElemType }),
    ...(row.name === undefined ? {} : { name: row.name }),
  };
};

/** `abcLine.nonMusic.rows` — see `nonMusicRow`. */
const nonMusicRowsOf = (rows: readonly MetaTextRow[]): Record<string, unknown>[] =>
  rows.map((r) =>
    "move" in r
      ? { move: r.move }
      : "separator" in r
        ? { separator: r.separator, absElemType: "separator" }
        : "text" in r
          ? nonMusicRow(r.text, r.font, r.left)
          : {},
  );

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
          : "separator" in r
            ? { separator: r.separator, absElemType: "separator" }
            : metaTextRow(r.text, r.font, r.left, addClasses),
  );

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

const formattingOf = (score: Score): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name] of ABCJS_DEFAULT_FONTS) {
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
    out[name] = abcjsFont(name, set, boxed);
  }
  for (const key of score.formattingOrder ?? []) {
    if (key === "staffwidth" && score.staffWidth != null)
      out[key] = score.staffWidth / 1.33;
    else if (key === "musicspace" && score.musicSpace != null)
      out[key] = (score.musicSpace * 3) / 4;
    // …**AND THE OTHER MEASUREMENTS REPORT THE POINTS THEY WERE WRITTEN IN**, exactly as
    // `%%musicspace` beside them does — the `4 / 3` is `write/renderer.js`'s, not the
    // parser's (`abc_parse_directive.js:417-423`). See `ScoreMetadata.measurements`.
    else if (score.measurements[key] !== undefined)
      // …and a MARGIN was never multiplied, so it is reported as it was written — see the
      // parser's note on `setPaddingVariable`.
      out[key] =
        key.endsWith("margin") && key !== "stafftopmargin"
          ? (score.measurements[key] ?? 0)
          : ((score.measurements[key] ?? 0) * 3) / 4;
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
    // **`%%scale` IS THE NUMBER AS WRITTEN** — `tune.formatting.scale = parseFloat(…)`
    // (`abc_parse_directive.js:339`), with no unit conversion of any kind.
    else if (key === "scale" && score.scale != null) out[key] = score.scale;
    else if (key === "jazzchords") out[key] = true;
    // …and the other two FLAG directives, which abcjs sets to a bare `true` as well
    // (`abc_parse_directive.js:789`, `:821`). `%%newpage` is NOT among them: it pushes a
    // line rather than a setting.
    else if (key === "titleleft" && score.titleLeft) out[key] = true;
    else if (key === "bagpipes" && score.bagpipes) out[key] = true;
    else if (key === "flatbeams" && score.flatBeams) out[key] = true;
    // …and `graceSlurs` is the one that can be FALSE, keyed by abcjs's own camel-case name
    // (`abc_parse_directive.js:796-805`).
    else if (key === "graceSlurs") out[key] = score.graceSlurs;
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
    /**
     * **THE NUMERATOR IS THE ONE AS WRITTEN, `2+3` AND NOT `5`.** `getMeter()` hands back
     * the parsed meter object and `getMeterFraction()` is the one that sums — which is why
     * that function splits on `+` at all. `TimingCallbacks` is what said so: its irregular
     * -meter branch tests `meter.value[0].num.indexOf('+') > 0`
     * (`abc_timing_callbacks.js:50-52`), so a summed numerator sent `M:2+3/8` down the
     * REGULAR beat path and reported five beats where abcjs reports six.
     */
    value: [
      {
        num:
          m.numeratorParts === undefined
            ? String(m.numerator)
            : m.numeratorParts.join("+"),
        den: String(m.denominator),
      },
    ],
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
  /**
   * **THE WRAP SEARCH'S OWN REASONING**, one row per SECTION — absent unless `wrap` and
   * `staffwidth` were both given and the target is not headless. A STRING rather than an
   * array when the page is narrower than its own margin, which is abcjs's own return
   * (`wrap_lines.js:359-365`).
   */
  readonly explanation?: WrapExplanation[] | string;
  /** **THE ANSWER** — one row per drawn line, saying where it came from. See `wrap.ts`. */
  readonly lineBreaks?: WrapLineBreak[];

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
  readonly engraver: {
    readonly selectables: readonly Selectable[];
    /**
     * `rangeHighlight(start, end)` — what an editor paints red, and the one thing
     * `Editor.updateSelection` reaches into the engraver for
     * (`abc_editor.js:320`). See `range-highlight.ts`.
     */
    readonly rangeHighlight: (start: number, end: number) => void;
  };
  readonly getSelectableArray: () => readonly Selectable[];
  readonly findSelectableElement: (target: unknown) => unknown;

  /**
   * abcjs's LAYOUT elements, handed out — `{top, height, line, measureNumber, elem}` per
   * voice, and the step that turns one of those rows into a timing event. See
   * `voices-array.ts`; `setupEvents` is the loop around the two.
   */
  /**
   * **THE PARSER'S WARNINGS, AND ONLY WHEN THERE ARE ANY.** `renderEngine` hangs them on
   * the tune with `if (warnings) tune.warnings = warnings` (`abc_tunebook.js:87-89`), so an
   * absent field and an empty array are different answers — `Editor` shows "No errors" for
   * the first. See `warnings.ts` for the format, which is as much of the contract as the
   * wording.
   */
  readonly warnings?: readonly string[];

  readonly makeVoicesArray: () => VoiceElementRow[][];
  readonly addElementToEvents: (
    eventHash: Record<string, TimingEvent>,
    element: AbsoluteElementLike,
    voiceTimeMilliseconds: number,
    top: number,
    height: number,
    line: number,
    measureNumber: number,
    timeDivider: number,
    isTiedState: number | undefined,
    nextIsBar: boolean,
  ) => { isTiedState: number | undefined; duration: number; nextIsBar?: boolean };
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
  return renderInto(target, abc, params, true);
}

/**
 * `renderAbc`'s body, with the one thing `parseOnly` needs to say: **WHETHER THE TUNE WAS
 * ENGRAVED.**
 *
 * abcjs's `parseOnly` is `renderEngine` with a callback that does nothing
 * (`api/abc_tunebook.js:42-54`) — the tune is PARSED and never LAID OUT — where
 * `renderAbc('*')` engraves into a div it then throws away. Ours had no way to tell the two
 * apart, so a `parseOnly` tune carried every field the engraver stamps and every rename it
 * makes. See `tests/parse-only.test.ts`.
 */
/**
 * **`engraver.svgs` — THE ARRAY `setupSelection` BINDS TO**, one entry normally and one per
 * SYSTEM under `oneSvgPerLine` (`engraver-controller.js:307-312`). Held beside the tune
 * rather than on it, because the tune object's shape is a gated surface and this is the
 * engraver's own field.
 */
const engraverSvgs = new WeakMap<object, readonly unknown[]>();

function renderInto(
  target: Target | readonly Target[],
  abc: string,
  params: AbcjsParams,
  engraved: boolean,
): TuneObject[] {
  // `AbcjsParams.mode`, which is `abcjs-strict` unless a host asks otherwise — and the
  // ONE place it is resolved, so the parse, the layout and the emitter cannot disagree.
  const mode: CompatibilityMode = params.mode ?? "abcjs-strict";
  const result = parse(abc, {
    mode,
    ...(params.visualTranspose
      ? { visualTranspose: params.visualTranspose }
      : {}),
  });
  const staffSpace = STAFF_SPACE_PX;
  /**
   * **THE HOST'S `{scale}` IS `%%scale` BY ANOTHER ROUTE, AND IT IS FLOORED AT 0.1.**
   *
   *     this.scale = params.scale ? parseFloat(params.scale) : 0;
   *     if (!(this.scale > 0.1)) this.scale = undefined;
   *
   * (`engraver-controller.js:47-50`.) It reaches the same variable the directive does,
   * where the DIRECTIVE wins (`:213`). This used to multiply the STAFF SPACE, which is a
   * different quantity: `{scale: 0.5}` came out 350x72 where abcjs writes 1400x174.
   */
  const hostScale =
    typeof params.scale === "number" && params.scale > 0.1 ? params.scale : undefined;
  /**
   * ⚠️ **AND `responsive: "resize"` THROWS THE SCALE AWAY — abcjs SAYS SO IN ITS OWN
   * COMMENT.**
   *
   *     if (this.responsive === "resize") // The resizing will mess with the scaling,
   *         scale = undefined;            // so just don't do it explicitly.
   *     if (scale === undefined) scale = this.renderer.isPrint ? 0.75 : 1;
   *
   * (`engraver-controller.js:213-216`.) It discards the `%%scale` DIRECTIVE with it — the
   * whole expression is replaced, not just the param — so a responsive render is always at
   * 1, or print's 0.75, and the viewBox does the resizing instead.
   *
   * Measured 2026-09-09 across four scales: abcjs's viewBox and `padding-bottom` are
   * IDENTICAL at 1, 0.7, 1.5 and 2 — `0 0 700 98.492` and `14.070286%` — where ours moved
   * with the scale and drew a transform abcjs does not.
   */
  const ignoreScale = params.responsive === "resize";
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

  const render = (
    score: (typeof result.scores)[number],
    paper: { innerHTML: string } | null,
  ): TuneObject => {
    /** See `warningsOf` — the file header's are repeated on every tune, as abcjs's are. */
    const warnings = warningsOf(
      result.diagnostics,
      result.scores,
      result.scores.indexOf(score),
      abc,
    );
    /**
     * **`noteTimings` AND THE TOTALS ARE STATE, not derived on read.** `setTiming` writes
     * all three onto the tune and the three getters just read the fields
     * (`abc_tune.js:584-621`), so a host that calls `getTotalTime()` first gets
     * `undefined` from abcjs — and must get `undefined` from us.
     */
    let lineCache: readonly AbcLine[] | null = null;
    /** Which `FreeTextBlock` each nonMusic line was written as — see `attachNonMusic`. */
    let blockOf: ReadonlyMap<AbcLine, FreeTextBlock> | null = null;
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
    /**
     * **THE SCORE THE DRAWING USES** — the wrapped one where `wrap` applies. abcjs
     * RE-PARSES with the computed breaks (`abc_tunebook_svg.js:137-144`); this model says
     * the same thing with `Measure.startsSystem`, so the breaks are a rewrite. See
     * `applyLineBreaks`.
     */
    /**
     * **THE WRAP SEARCH, RUN ONCE.** Both the published fields and the DRAWING need it, and
     * it must run on the tune AS PARSED: abcjs measures the original and only then
     * re-parses with the answer (`abc_tunebook_svg.js:134-144`).
     *
     * ⚠️ **AND IT CANNOT GO THROUGH THE CACHED PROJECTION.** `lineCache` is built from the
     * DRAWN score, the drawn score is the wrapped one, and the wrap is what this computes —
     * a cycle that recurses until the stack goes. `projectionOf` on the parsed score is the
     * measurement abcjs makes and has no such dependency.
     */
    let wrapCache: {
      explanation: WrapExplanation[] | string;
      lineBreaks: number[][];
      reParse: boolean;
    } | null = null;
    const wrapSearch = (): typeof wrapCache => {
      if (wrapCache !== null) return wrapCache;
      if (paper === null || params.wrap === undefined || params.staffwidth === undefined)
        return null;
      const sections = measureWidthsOf(
        score,
        projectionOf(score, abc, engraved).lines,
        mode,
      );
      wrapCache = calcLineWraps(sections, staffwidth, params.wrap, params.scale);
      return wrapCache;
    };
    let wrapped: Score | null = null;
    const drawnScore = (): Score => {
      if (wrapped !== null) return wrapped;
      const ret = wrapSearch();
      wrapped = ret !== null && ret.reParse ? applyLineBreaks(score, ret.lineBreaks) : score;
      return wrapped;
    };
    /**
     * **THE LAYOUT, LAID OUT ONCE — AND IT WAS BEING LAID OUT TWICE FOR EVERY HOST THAT
     * READS THE TUNE OBJECT.**
     *
     * ⚠️ COUNTED, not inferred: `layout()` ran **1.00 times per tune for a bare render and
     * 2.00** the moment anything touched `tune.lines`, `noteTimings` or
     * `getSelectableArray()` — which is exactly what a page with playback highlighting
     * does. Five call sites, no memo, and layout is **49% of a render**:
     *
     *     render only                151ms
     *     render + lines + timings   258ms      (+71%)
     *
     * ── ⚠️ WHY THIS WAS NOT DONE BEFORE, AND WHY THE REASON DID NOT SURVIVE MEASUREMENT ──
     * `CLAUDE.md` records that retaining the `Layout` in this closure once took the suite
     * from 5.6s to 50-120s with workers dying, and that it is "the biggest object this
     * library makes". The first half is history; the second was worth checking, because a
     * fear with no number attached is what stops the work rather than the cost:
     *
     *     691 tunes:  TuneObjects 41MB (59KB each)   Layouts 14MB (20KB each)
     *
     * A retained `Layout` is **a third of what the TuneObject beside it already costs**, so
     * this cache grows a tune's footprint by about a third and cannot be what killed those
     * workers. The suite is re-run on every change here and its wall time is the check.
     *
     * ── AND WHY IT IS SAFE FOR THE BYTES ────────────────────────────────────────
     * `layout()` re-applies its module-level switches at the top of every call, so a SKIPPED
     * call could in principle leave stale state behind for whatever ran next. It cannot
     * here: `svg.ts` imports exactly `ENGRAVE` and `stepToY` from `layout.ts` and both are
     * constants — no emitter reads a mutable. Everything else that takes a cached `doc`
     * only reads it. The byte gates are the proof either way.
     */
    let laidOutCache: ReturnType<typeof layout> | null = null;
    const laidOut = (): ReturnType<typeof layout> => {
      if (laidOutCache !== null) return laidOutCache;
      laidOutCache = layout(drawnScore(), {
        mode,
        ...(systemWidth ? { systemWidth } : {}),
        ...(printing ? { print: true } : {}),
        ...(hostScale === undefined || ignoreScale ? {} : { hostScale }),
        ...(ignoreScale ? { ignoreScale: true } : {}),
        // …and the host's `{jazzchords: true}`, which the TUNE's own directive overrides —
        // see `LayoutOptions.jazzChords`.
        ...(params.jazzchords === true ? { jazzChords: true } : {}),
        // …and `germanAlphabet`, which no directive can ask for — see `GERMAN_CHORDS`.
        ...(params.germanAlphabet === true ? { germanAlphabet: true } : {}),
      });
      return laidOutCache;
    };
    const projection = (): {
      byEvent: ReadonlyMap<MusicEvent, AbcElement>;
      byRange: ReadonlyMap<number, AbcElement>;
    } => {
      if (eventIndex === null) {
        const p = projectionOf(score, abc, engraved);
        lineCache = p.lines;
        blockOf = p.blockOf;
        eventIndex = { byEvent: p.byEvent, byRange: p.byRange };
      }
      return eventIndex;
    };
    /**
     * **`abcLine.nonMusic` — THE ENGRAVER'S OWN, HUNG ON THE LINE IT WAS WRITTEN AS.**
     * `constructTuneElements` walks the finished lines and hangs a `Subtitle`, a `FreeText`
     * or a `Separator` on each nonMusic one (`engraver-controller.js:229-247`), so it
     * exists only where something ENGRAVED — a `parseOnly` tune has none — and the rows are
     * the layout's own, joined back by block identity.
     *
     * ⚠️ **A SUBTITLE ABOVE THE FIRST NON-SUBTITLE LINE GETS NOTHING**, because the title
     * block already accounted for it: `hasSeenNonSubtitle` gates that arm alone, where a
     * `%%text` or a `%%sep` sets the flag as well as taking its own rows.
     */
    const attachNonMusic = (
      rows: ReadonlyMap<FreeTextBlock, readonly MetaTextRow[]> | undefined,
    ): void => {
      if (rows === undefined || blockOf === null) return;
      let seenNonSubtitle = false;
      for (const line of lineCache ?? []) {
        const l = line as { staff?: unknown; subtitle?: unknown; nonMusic?: unknown };
        if (l.staff !== undefined) {
          seenNonSubtitle = true;
          continue;
        }
        const block = blockOf.get(line);
        const own = block === undefined ? undefined : rows.get(block);
        if (l.subtitle === undefined) seenNonSubtitle = true;
        else if (!seenNonSubtitle) continue;
        if (own !== undefined)
          l.nonMusic = { rows: nonMusicRowsOf(own) };
      }
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
     * **EVERY ELEMENT GROUP THE DRAWING OPENED, IN THE ORDER IT WROTE THEM** — the join
     * `rangeHighlight` needs to find a node again in markup it did not keep a handle on.
     * Filled by the same eager `toSVG` call as `records`, and a few dozen entries rather
     * than a retained `Layout`.
     */
    const drawnRecords: DrawnElement[] = [];
    /**
     * `engraver.rangeHighlight` — see `range-highlight.ts`. The paper is the element
     * `renderAbc` is about to write into, which is the DOM this searches; a headless slot
     * has none and the highlight is then a no-op, exactly as abcjs's is when nothing was
     * drawn.
     */
    const highlight = rangeHighlighter(
      () => drawnRecords,
      projection,
      () =>
        paper === null || typeof paper === "string"
          ? null
          : (paper as unknown as HighlightPaper),
      // `params.foregroundColor ? … : "currentColor"` (`engraver-controller.js:80`).
      params.foregroundColor ?? "currentColor",
    );
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
    /**
     * **THE GEOMETRY A TIMING ROW CARRIES, JOINED TO THE CLOCK BY THE MODEL EVENT.**
     *
     * abcjs builds its rows by walking the DRAWN staffgroups, so every row has its
     * system's extent and its element's box for free (`abc_tune.js:396-434`). Ours walks
     * the parse tree — deliberately, so audio does not need the renderer — and the join is
     * `LayoutElement.sourceEvent`, the same reference the selectable array and
     * `tune.lines` are joined by.
     *
     * The three formulas are abcjs's, and the unit is the PITCH step, half a staff space:
     *
     *     top    = staffs[0].absoluteY   − staffs[0].top    × STEP
     *     bottom = staffs[last].absoluteY − staffs[last].bottom × STEP
     *     height = bottom − top
     *
     * `left` is the element's own `x` and `width` is its ROD width — abcjs's `element.w`
     * is `getMinWidth(child)`, the ink, not the spring the cursor advanced by. Measured on
     * `synth-flattener-01`: `x = 70.846` and `rodWidth = 9.81` against abcjs's `left:
     * 70.846, width: 9.81`, and `102.867 − 20.724 × 3.875 = 22.56` against its `top`.
     */
    let geometryCache: Map<MusicEvent, TimingGeometry> | null = null;
    /** The same, for BARLINES, keyed by where they were written — read only for `endX`. */
    const barCache = new Map<number, TimingGeometry>();
    const geometryOf = (event: MusicEvent): TimingGeometry | undefined => {
      if (geometryCache === null) {
        const cache = new Map<MusicEvent, TimingGeometry>();
        geometryCache = cache;
        const doc = laidOut();
        const index = projection().byEvent;
        /**
         * **`line` IS THE INDEX IN `tune.lines`, NOT THE SYSTEM'S OWN.** abcjs reads
         * `group.line`, which `engraveTune` stamps from the LINE loop, so a subtitle or a
         * `%%text` standing between two systems counts — `synth-timing-05-subtitle-crash`
         * has its second system on line 2. The projection already holds the line list.
         */
        const staffLines = (lineCache ?? [])
          .map((l, i) => (l.staff === undefined ? -1 : i))
          .filter((i) => i >= 0);
        doc.systems.forEach((system, systemIndex) => {
          const line = staffLines[systemIndex] ?? systemIndex;
          const first = system.staves[0];
          const last = system.staves[system.staves.length - 1];
          if (first === undefined || last === undefined) return;
          const top = first.absoluteY - system.firstTopPitch * PITCH_STEP_PX;
          const bottom = last.absoluteY - system.lastBottomPitch * PITCH_STEP_PX;
          const geometry = {
            line,
            top,
            height: bottom - top,
            /**
             * **abcjs's `staffGroup.w` IS OUR `musicWidth` LESS THE LEFT MARGIN**, and it
             * is the MUSIC's width rather than the system's box — `max(musicWidth,
             * proseWidth)` widens the latter for a long title and `staffGroup.w` is not
             * widened by one. Measured over every system of the corpus: 224 of 225 agree
             * to the digit, on stretched and unstretched lines alike, and the one that
             * does not is `synth-flattener-17`'s first line, 14px apart.
             *
             * ⚠️ **AND THE UNITS ARE THE TRAP.** `layout`'s `systemWidth` option is the
             * PAGE — `(staffwidth + 2 × padding) / UNIT_PX` — so a probe passing 740 lays
             * out a DIFFERENT tune from the one `renderAbc(…, {})` renders at 770, and
             * every derived comparison off it says the rule is one thing on a stretched
             * line and another on a short one. It is not; it is this.
             */
            systemWidth: system.musicWidth - PAGE_MARGIN_PX,
          };
          for (const staff of system.staves)
            for (const voice of staff.voices)
              for (const element of voice) {
                if (element.sourceRange !== undefined && element.type === "bar")
                  barCache.set(element.sourceRange.start, {
                    ...geometry,
                    left: element.x,
                    width: element.rodWidth ?? element.width,
                    startChar: element.sourceRange.start,
                    endChar: element.sourceRange.end,
                  });
                const source = element.sourceEvent;
                if (source === undefined || cache.has(source)) continue;
                const abcelem = abcelemOf(element, projection());
                /**
                 * **AN OVERLAY PAD BORROWS ITS SPAN, EXACTLY AS abcjs'S DOES.** A layer's
                 * back-filled rest is a copy of a note "of the same duration and the same
                 * `startChar`/`endChar`" (`tune-builder.js:541-556`), and a whole-measure
                 * one takes the BARLINE's. Both are real elements of abcjs's own
                 * `tune.lines`; ours are the model's, and the projection resolves its own
                 * copies separately — so the span comes from the element the pad MIRRORS,
                 * and falls back to the pad's own range, which for the measure case is the
                 * barline's already.
                 */
                const mirror =
                  abcelem === undefined && source.type === "rest"
                    ? index.get(source.overlayMirrors as MusicEvent)
                    : undefined;
                cache.set(source, {
                  ...geometry,
                  left: element.x,
                  width: element.rodWidth ?? element.width,
                  startChar:
                    abcelem?.startChar ?? mirror?.startChar ?? source.sourceRange?.start ?? null,
                  endChar: abcelem?.endChar ?? mirror?.endChar ?? source.sourceRange?.end ?? null,
                  ...(abcelem === undefined ? {} : { abcelem }),
                  ...(abcelem?.midiPitches === undefined
                    ? {}
                    : { midiPitches: abcelem.midiPitches }),
                });
              }
        });
      }
      return geometryCache.get(event);
    };
    const barGeometryOf = (range: { start: number }): TimingGeometry | undefined => {
      geometryOf({} as unknown as MusicEvent);
      return barCache.get(range.start);
    };
    const selectables = (): readonly Selectable[] => {
      if (selectableCache == null) {
        /**
         * **THE ENGRAVE-TIME FIELDS BELONG TO EVERY SYSTEM, NOT ONLY THE DRAWN ONES.**
         * abcjs stamps `highestVert`, `averagepitch` and `printer_shift` in the ENGRAVER,
         * and `%%maxStaves` stops the DRAWING alone (`draw/draw.js:33-38`) — so an
         * incipit's hidden lines carry them too. The selectable array is still built from
         * what was drawn, which is what `data-index` counts.
         */
        // …**AND ONLY WHEN THERE WAS AN ENGRAVER.** See `renderInto`.
        if (engraved) {
          const doc = laidOut();
          stampEngravedSystems(doc.engraved, projection());
          // …and the nonMusic lines' rows off the SAME layout — see `attachNonMusic`.
          projection();
          attachNonMusic(doc.nonMusicRows);
        }
        selectableCache = selectablesOf(records, projection(), params.selectTypes);
      }
      return selectableCache ?? [];
    };
    const timings: {
      rows: NoteTiming[];
      time: number | undefined;
      beats: number | undefined;
    } = { rows: [], time: undefined, beats: undefined };
    return {
      svg: ((): string => {
        /**
         * **AND NOTHING IS DRAWN WHEN NOTHING ENGRAVED.** `parseOnly` never reaches a
         * renderer at all in abcjs (`api/abc_tunebook.js:42-54`), so there is no markup,
         * no selectable array and — the part that shows in `tune.lines` — no
         * `highestVert`, `averagepitch`, `minpitch`, `maxpitch` or `printer_shift`, which
         * `selectablesOf` stamps as it walks what was DRAWN. See `renderInto`.
         */
        if (!engraved) return "";
        const doc = laidOut();
        metaRows.top = [...(doc.topTextRows ?? [])];
        metaRows.bottom = [...(doc.bottomTextRows ?? [])];
        return toSVG(
        doc,
        {
          staffSpace,
          classes: "abcjs",
          // …AND THE EMITTER TAKES IT TOO. It decides `<defs>`/`<use>`, which is a declared
          // divergence; everything else it draws is abcjs's in both modes.
          mode,
          selectables: records,
          drawn: drawnRecords,
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
          ...(params.ariaLabel === undefined ? {} : { ariaLabel: params.ariaLabel }),
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
      /**
       * **THE WRAP SEARCH** — see `src/compat/wrap.ts` for the algorithm and
       * `tests/wrap.test.ts` for abcjs's own numbers.
       *
       * ⚠️ **THREE THINGS HAVE TO BE TRUE**, and abcjs's guard is one expression:
       * `if (!removeDiv && params.wrap && params.staffwidth)`
       * (`api/abc_tunebook_svg.js:118`). A HEADLESS target sets `removeDiv`, so `'*'`
       * never wraps however the params read — which is not an error but an absence, and
       * is what this surface's own harvester read as eleven empty cases before it
       * rendered into a target.
       */
      ...((): { explanation?: WrapExplanation[] | string; lineBreaks?: WrapLineBreak[] } => {
        const ret = wrapSearch();
        if (ret === null) return {};
        if (!ret.reParse) return { explanation: ret.explanation };
        return {
          explanation: ret.explanation,
          // `wrapLines` walks the DELINED tune — one line per original source line, with
          // no `break` elements in it (`wrap_lines.js:10`) — and it is the tune AS PARSED,
          // for the same reason the widths are.
          lineBreaks: findLineBreaks(
            delineOf(projectionOf(score, abc, engraved).lines, { lineBreaks: false }),
            ret.lineBreaks,
          ),
        };
      })(),

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
          geometryOf,
          barGeometryOf,
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
      ) =>
        setupEventsFor(
          score,
          startingDelay,
          timeDivider,
          startingBpm,
          warp,
          geometryOf,
          barGeometryOf,
        ),
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
          if (timing.notes.length > 0) {
            // **ONE OBJECT, PUSHED TO BOTH.** abcjs stamps the span inside the flattener
            // (`abc_midi_flattener.js:589`), so the note in the TRACK and the note in
            // `midiPitches` are the same object and both carry `startChar`/`endChar`. Ours
            // can only know the span here — so it writes the fields onto those very
            // objects rather than onto copies. `createNoteMap` reads the TRACK, which is
            // what `CreateSynth`'s `sequenceCallback` then hands a host; copies left that
            // surface without a span at all.
            for (const n of timing.notes) {
              const note = n as { startChar?: number | undefined; endChar?: number | undefined };
              note.startChar = abcelem.startChar;
              note.endChar = abcelem.endChar;
            }
            abcelem.midiPitches = timing.notes as unknown as readonly Record<string, unknown>[];
          }
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
        // **AND HOW MANY LINES WERE DRAWN**, because `deline` can SEE the engraver's
        // back-pointer — see `hasAbselem`. `%%maxStaves` is the only thing that makes the
        // two counts differ.
        return delineOf(lineCache ?? [], options, laidOut().systems.length);
      },

      get engraver(): {
        selectables: readonly Selectable[];
        rangeHighlight: (start: number, end: number) => void;
        svgs: readonly unknown[];
      } {
        return {
          selectables: selectables(),
          rangeHighlight: highlight,
          svgs: engraverSvgs.get(this as object) ?? [],
        };
      },
      getSelectableArray: () => selectables(),
      findSelectableElement: (target: unknown) =>
        findSelectable(selectables(), target),

      /**
       * **LAID OUT AGAIN RATHER THAN RETAINED**, like every other projection here — see
       * `laidOut`. `tune.lines` is asked for first because the row's `line` is an index
       * into it.
       */
      ...(warnings === undefined ? {} : { warnings }),

      makeVoicesArray: (): VoiceElementRow[][] => {
        selectables();
        return makeVoicesArrayOf(laidOut(), projection(), lineCache ?? []);
      },
      addElementToEvents,
    };
  };

  return withLiveTextMetrics(() =>
    walkSlots(slots, from, result.scores, (element, score) => {
      const tune = render(score, element);
      if (element !== null) {
        /**
         * **THE VIEWPORT WRAPPER IS BUILT BEFORE THE MUSIC GOES IN**, because abcjs hands
         * the ENGRAVER the inner div (`api/abc_tunebook_svg.js:39`) — so every style
         * `setPaperSize` assigns lands on the inner one, and `oneSvgPerLine` splits inside
         * it too. Without either viewport option this is the host's own element and the
         * three steps below are what they always were.
         */
        const paper = openViewport(element, params);
        paper.innerHTML = tune.svg;
        restyleScale(paper);
        sizeContainer(paper, params.responsive);
        // `engraveTune` splits AFTER `draw`, which is after `setPaperSize` — so the
        // container already carries the height of the whole score (`:305-310`).
        if (params.oneSvgPerLine === true)
          splitSvgIntoLines(
            paper,
            score.metadata.titles[0] === undefined
              ? ""
              : ariaTitle(score.metadata.titles[0]),
            params.responsive,
          );
        // …and only then does `renderOne` size the outer one (`:53-57`).
        closeViewport(element, paper);
        /**
         * **AND THE LISTENERS GO ON LAST, WHICH IS WHERE abcjs PUTS THEM** —
         * `setupSelection(this, this.svgs)` is the final statement of `engraveTune`, after
         * the split and after everything `draw` wrote (`engraver-controller.js:311`). It
         * needs the LIVE nodes, so it cannot run before the markup is injected.
         */
        engraverSvgs.set(
          tune as object,
          setupSelection(
          paper as unknown as Parameters<typeof setupSelection>[0],
          tune.getSelectableArray(),
          {
            ...(params.dragging === undefined ? {} : { dragging: params.dragging }),
            ...(params.selectionColor === undefined ? {} : { selectionColor: params.selectionColor }),
            ...(params.dragColor === undefined ? {} : { dragColor: params.dragColor }),
            ...(params.clickListener === undefined ? {} : { clickListener: params.clickListener }),
            ...(hostScale === undefined ? {} : { scale: hostScale }),
            ...(params.foregroundColor === undefined ? {} : { foregroundColor: params.foregroundColor }),
            },
          ),
        );
      }
      return tune;
    }),
  );
}

/**
 * **A `%%scale` IS SET THROUGH THE DOM AND THE BROWSER SERIALISES IT — SO WE SET IT TOO.**
 *
 * `setScale` assigns EIGHT properties on the root `<svg>`'s `style`
 * (`write/svg.js:71-83`): `transform`, `-ms-transform`, `-webkit-transform`,
 * `transform-origin` and the `-ms-`/`-webkit-` `transform-origin-x`/`-y` four. What lands
 * in the attribute is then whatever that browser's CSSOM serialises — **and the browsers
 * disagree**: WebKit collapses `-webkit-transform` onto `transform`, prints
 * `scale(0.8, 0.8)` with a space and `0px 0px`, and drops the six it does not know;
 * Chrome KEEPS `-webkit-transform-origin-x/y`. jsdom, which harvested the goldens,
 * serialises three.
 *
 * So there is no one string to emit, which is why the emitter's own `style` attribute —
 * jsdom's three, the form the 691 goldens carry — cannot be right in a browser and this
 * exists. Re-running abcjs's eight assignments over the inserted element replaces that
 * attribute with the browser's OWN serialisation of the same declarations, which is
 * abcjs's by construction in every browser rather than in one.
 *
 * Headless is untouched: no `document`, no `querySelector`, and the emitted string stands.
 * The scale is read back off the element rather than threaded down, because the emitter has
 * already resolved `%%scale`, `{scale}` and print into one number and re-deriving it here
 * would be a second place for that rule to live.
 */
function restyleScale(element: { innerHTML: string }): void {
  const root = (element as { querySelector?(s: string): StyledElement | null }).querySelector?.(
    "svg",
  );
  const style = root?.style;
  if (style === undefined || style === null) return;
  const scale = /scale\(\s*([0-9.]+)/.exec(style.transform ?? "")?.[1];
  if (scale === undefined) return;
  applyScaleStyles(style as Record<string, string | undefined>, scale);
}

/** `setScale`'s eight assignments, in its own order (`write/svg.js:71-83`). */
function applyScaleStyles(
  style: Record<string, string | undefined>,
  scale: string,
): void {
  const s = `scale(${scale},${scale})`;
  style["transform"] = s;
  style["-ms-transform"] = s;
  style["-webkit-transform"] = s;
  style["transform-origin"] = "0 0";
  style["-ms-transform-origin-x"] = "0";
  style["-ms-transform-origin-y"] = "0";
  style["-webkit-transform-origin-x"] = "0";
  style["-webkit-transform-origin-y"] = "0";
}

/** The one DOM surface `restyleScale` touches — structurally typed, like `LiveElement`. */
interface StyledElement {
  readonly style?: { transform?: string } & Record<string, string | undefined>;
}

/**
 * **abcjs SIZES THE CONTAINER, AND IT DOES IT THROUGH THE DOM** — `setPaperSize`'s last two
 * lines (`draw/set-paper-size.js:29-41`), which no emitted string can carry:
 *
 *     var parentStyles = { overflow: "hidden" };
 *     if (responsive === 'resize') renderer.paper.setResponsiveWidth(w, h);
 *     else { parentStyles.width = ""; parentStyles.height = h + "px";
 *            if (scale < 1) parentStyles.width = w + "px"; … }
 *     renderer.paper.setParentStyles(parentStyles);
 *
 * ⚠️ **MEASURED 2026-09-09 AND THE DEFAULT PATH DIFFERED TOO.** abcjs gives every container
 * `overflow: hidden; height: <h>px` — a host's layout reserves that space — and ours set
 * nothing at all. `responsive: "resize"` was unimplemented outright, which is the option a
 * host reaches for FIRST: the score then scales with its column instead of overflowing it.
 *
 * The same shape as `restyleScale` beside it: assignments in abcjs's own ORDER, because
 * what lands in the attribute is the browser's serialisation of them, and headless is
 * untouched — no `document`, no `querySelector`, and the emitted string stands.
 */
function sizeContainer(
  element: { innerHTML: string },
  responsive: string | undefined,
): void {
  const host = element as {
    querySelector?(s: string): StyledElement | null;
    style?: Record<string, string | undefined>;
    getAttribute?(name: string): string | null;
    setAttribute?(name: string, value: string): void;
  };
  const root = host.querySelector?.("svg") as
    | (StyledElement & { getAttribute?(n: string): string | null; removeAttribute?(n: string): void; setAttribute?(n: string, v: string): void })
    | null
    | undefined;
  const parent = host.style;
  if (root === null || root === undefined || parent === undefined) return;
  /**
   * **THE SVG CARRIES `w`/`h` ITSELF, EXCEPT BELOW 1.** `setSize(w, h)` for `scale >= 1`
   * and `setSize(w / scale, h / scale)` below it (`draw/set-paper-size.js:33-38`) — abcjs
   * draws a shrunken score at full size and lets the CSS transform shrink it, so only that
   * arm has to be multiplied back. Measured 2026-09-09: at `scale: 1.5` abcjs's container
   * is 132.738px, the SVG's own height, where multiplying gave 199.107.
   */
  const scale = Number(/scale\(\s*([0-9.]+)/.exec(root.style?.transform ?? "")?.[1] ?? 1);
  const back = scale < 1 ? scale : 1;
  const w = Number(root.getAttribute?.("width") ?? 0) * back;
  const h = Number(root.getAttribute?.("height") ?? 0) * back;
  if (!(w > 0) || !(h > 0)) return;
  if (responsive === "resize") {
    /**
     * ⚠️ **AND THE `style` ATTRIBUTE IS DROPPED FIRST, SO IT IS RE-CREATED LAST.**
     * abcjs's SVG has no `style` until `setResponsiveWidth` assigns one, so its attribute
     * order is `… viewBox, preserveAspectRatio, style`. Ours is parsed from markup that
     * already carries a `style` when a scale is in force, and `setAttribute` appends —
     * which put `viewBox` after it. Print plus responsive is the case that has both.
     */
    const carried = /scale\(\s*([0-9.]+)/.exec(
      (root.style as Record<string, string | undefined> | undefined)?.["transform"] ?? "",
    )?.[1];
    root.removeAttribute?.("style");
    // `setResponsiveWidth` — the technique abcjs cites from thenewcode.com, which is a
    // viewBox on the SVG and a padding-bottom ratio on the parent (`svg.js:33-59`).
    root.setAttribute?.("viewBox", `0 0 ${w} ${h}`);
    root.setAttribute?.("preserveAspectRatio", "xMinYMin meet");
    root.removeAttribute?.("height");
    root.removeAttribute?.("width");
    const style = root.style as Record<string, string | undefined> | undefined;
    if (style !== undefined) {
      /**
       * ⚠️ **AND THE SCALE IS RE-APPLIED AFTER, BECAUSE THE ORDER IS THE SERIALISATION.**
       * `setResponsiveWidth` runs before `setScale` (`draw/set-paper-size.js:30`, `:39`),
       * so abcjs's attribute reads `display; position; top; left; transform; …` where the
       * emitter's transform is already first. The four are set, then the transform is
       * cleared and re-assigned so it lands last — the same trick `restyleScale` plays
       * with the browser's own serialiser, for the same reason.
       */
      const had = carried;
      style["display"] = "inline-block";
      style["position"] = "absolute";
      style["top"] = "0";
      style["left"] = "0";
      if (had !== undefined) applyScaleStyles(style, had);
    }
    const cls = host.getAttribute?.("class");
    if (!cls) host.setAttribute?.("class", "abcjs-container");
    else if (!cls.includes("abcjs-container"))
      host.setAttribute?.("class", `${cls} abcjs-container`);
    parent["display"] = "inline-block";
    parent["position"] = "relative";
    parent["width"] = "100%";
    // "I changed the padding from 100% to this through trial and error" — abcjs's own note.
    parent["padding-bottom"] = `${(h / w) * 100}%`;
    parent["vertical-align"] = "middle";
    parent["overflow"] = "hidden";
    return;
  }
  // …and the ORDER is `parentStyles`' own key order: overflow, width, height. An empty
  // `width` serialises as nothing, which is why the default container carries only two.
  parent["overflow"] = "hidden";
  parent["width"] = scale < 1 ? `${w}px` : "";
  parent["height"] = `${h}px`;
}

/**
 * **THE DOM SURFACE `oneSvgPerLine` AND THE VIEWPORTS NEED**, structurally typed like
 * `StyledElement` beside it — `tsconfig` has no `dom` lib, deliberately.
 */
interface SplitElement {
  innerHTML: string;
  readonly style?: Record<string, string | undefined>;
  readonly attributes?: ArrayLike<{ readonly name: string; readonly value: string }>;
  innerText?: string;
  querySelector?(s: string): SplitElement | null;
  querySelectorAll?(s: string): ArrayLike<SplitElement>;
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  appendChild?(child: SplitElement): void;
  removeChild?(child: SplitElement): void;
  cloneNode?(deep: boolean): SplitElement;
  getBBox?(): { readonly x: number; readonly y: number; readonly height: number };
  readonly viewBox?: { readonly baseVal?: { readonly width: number } };
  readonly id?: string;
}
interface SplitDocument {
  createElement(tag: string): SplitElement;
  createElementNS(ns: string, tag: string): SplitElement;
}

/** The document, when there is one — every function below is a no-op without it. */
const liveDocument = (): SplitDocument | undefined =>
  (globalThis as { document?: SplitDocument }).document;

/**
 * **`viewportHorizontal` / `viewportVertical` — THE HOST'S DIV BECOMES THE VIEWPORT AND
 * THE MUSIC MOVES INTO A `div.abcjs-inner` INSIDE IT** (`api/abc_tunebook_svg.js:29-47`):
 *
 *     if (params.viewportHorizontal) {
 *         div.innerHTML = '<div class="abcjs-inner"></div>';
 *         if (params.scrollHorizontal) { div.style.overflowX = "auto";
 *                                        div.style.overflowY = "hidden"; }
 *         else div.style.overflow = "hidden";
 *         resizeDivs[div.id] = div;
 *         div = div.children[0];
 *     }
 *
 * Returns the element the music should go into, which is the host's own when neither
 * option is set. The overflow goes on BEFORE the render, which is why it precedes
 * everything `setPaperSize` writes in the serialised attribute — measured, not assumed:
 * abcjs's outer div reads `overflow: hidden;` and its inner `overflow: hidden;
 * height: 231.382px;`.
 *
 * ⚠️ **THE TWO ARE NOT A PAIR OF FLAGS BUT AN `if`/`else if`** — horizontal wins when both
 * are passed, and nothing warns.
 */
function openViewport(
  element: { innerHTML: string },
  params: AbcjsParams,
): { innerHTML: string } {
  const horizontal = params.viewportHorizontal === true;
  if (!horizontal && params.viewportVertical !== true) return element;
  const host = element as SplitElement;
  const style = host.style;
  if (host.querySelector === undefined || style === undefined) return element;
  element.innerHTML = horizontal
    ? '<div class="abcjs-inner"></div>'
    : '<div class="abcjs-inner scroll-amount"></div>';
  if (horizontal) {
    if (params.scrollHorizontal === true) {
      style["overflow-x"] = "auto";
      style["overflow-y"] = "hidden";
    } else style["overflow"] = "hidden";
    registerResizeViewport(host);
  } else {
    style["overflow-x"] = "hidden";
    style["overflow-y"] = "auto";
  }
  const inner = host.querySelector(".abcjs-inner");
  return inner === null ? element : (inner as { innerHTML: string });
}

/**
 * **AND THE OUTER DIV TAKES THE INNER'S WIDTH** (`api/abc_tunebook_svg.js:53-57`):
 *
 *     if (params.viewportVertical || params.viewportHorizontal) {
 *         var parent = div.parentNode;
 *         parent.style.width = div.style.width;
 *     }
 *
 * ⚠️ **WHICH IS USUALLY A NO-OP, AND THAT IS THE POINT.** `setPaperSize` writes a `width`
 * only below scale 1 (`draw/set-paper-size.js:33-36`); above it the inner's is the empty
 * string, and assigning `""` removes nothing that was never there. So the outer div of a
 * plain horizontal viewport carries `overflow: hidden` and NOTHING ELSE — verified against
 * abcjs rather than reasoned, because a wrong guess here is a width on every container.
 */
function closeViewport(
  element: { innerHTML: string },
  paper: { innerHTML: string },
): void {
  if (paper === element) return;
  const outer = (element as SplitElement).style;
  const inner = (paper as SplitElement).style;
  if (outer === undefined || inner === undefined) return;
  outer["width"] = inner["width"] ?? "";
}

/**
 * **abcjs RESIZES EVERY HORIZONTAL VIEWPORT ON THE WINDOW'S `resize`**
 * (`api/abc_tunebook_svg.js:9-27`), keyed by the div's `id` so that repeated renders into
 * the same div register it once:
 *
 *     var width = window.innerWidth;
 *     for (var id in resizeDivs) { var outer = resizeDivs[id];
 *         var ofs = outer.offsetLeft; width -= ofs * 2;
 *         outer.style.width = width + "px"; }
 *
 * ⚠️ **`width` IS DECLARED OUTSIDE THE LOOP AND EACH DIV'S MARGIN IS SUBTRACTED FROM WHAT
 * THE LAST ONE LEFT** — with two viewports on a page the second is narrower than the
 * first by the first's offset. That is abcjs's arithmetic and it is reproduced here
 * rather than corrected; a divergence in a resize handler is invisible to every gate in
 * this repo, so the only defensible rule is to be abcjs.
 *
 * ⚠️ And a div with no `id` is keyed under the string `"undefined"`, so several
 * un-`id`ed viewports collapse into one entry. Also abcjs's.
 */
const resizeViewports = new Map<string, ResizeViewport>();
interface ResizeViewport {
  readonly offsetLeft?: number;
  readonly style?: Record<string, string | undefined>;
}
let resizeListening = false;
function registerResizeViewport(host: SplitElement): void {
  const win = (
    globalThis as {
      window?: {
        innerWidth?: number;
        addEventListener?(type: string, fn: () => void): void;
      };
    }
  ).window;
  if (win?.addEventListener === undefined) return;
  resizeViewports.set(String(host.id), host as ResizeViewport);
  if (resizeListening) return;
  resizeListening = true;
  const resizeOuter = (): void => {
    let width = win.innerWidth ?? 0;
    for (const outer of resizeViewports.values()) {
      width -= (outer.offsetLeft ?? 0) * 2;
      if (outer.style !== undefined) outer.style["width"] = `${width}px`;
    }
  };
  win.addEventListener("resize", resizeOuter);
  win.addEventListener("orientationChange", resizeOuter);
}

/**
 * **`oneSvgPerLine` — ONE `<svg>` PER TOP-LEVEL `<g>`, EACH SCROLLED TO ITS OWN SECTION**
 * (`write/engraver-controller.js:317-368`). A port of `splitSvgIntoLines`, and every
 * number in it comes from the LAYOUT ENGINE: a section's box is `getBBox()`, so there is
 * nothing to do without a document and nothing a headless render could produce.
 *
 * The shape, measured from abcjs on a two-line tune before a line of this was written:
 *
 *     <div style="overflow: hidden;height:55.40625px;">
 *       <svg … width="700" aria-label='Sheet Music for "T" section 1'
 *            height="55.40625" viewBox="0 0 700 55.40625">
 *         <style>…</style><title>Sheet Music for "T" section 1</title><g>…</g>
 *
 * Four rules worth stating, because three of them are not what a reading predicts:
 *
 * ⚠️ **A SECTION'S HEIGHT INCLUDES THE GAP ABOVE IT.** `box.y - nextTop` is the margin the
 * engraver left, and it belongs to the section BELOW it — so the divs tile the score with
 * no seams, and `nextTop` advances to `box.y + box.height` rather than to the height just
 * written.
 *
 * ⚠️ **THE WRAPPER'S HEIGHT IS SCALED AND THE SVG'S IS NOT.** `height * scale` on the div,
 * the raw `height` on the `<svg>` and in its `viewBox` — the CSS transform does the rest,
 * which is the same split `setPaperSize` makes. Verified at `scale: 0.8`: the div reads
 * `47.325px` for an svg of `59.15625`.
 *
 * ⚠️ **THE WRAPPER'S `style` IS A STRING abcjs BUILDS BY CONCATENATION**, so it reaches the
 * attribute unserialised — `overflow: hidden;height:55.40625px;`, with a space after the
 * first colon and none after the second. `setAttribute` stores it verbatim; assigning the
 * two properties instead would produce a normalised string and differ on every wrapper.
 *
 * ⚠️ **AND THE `<title>` IS AN HTML ELEMENT INSIDE AN SVG.** abcjs builds the `<svg>` with
 * `createElementNS` and the `<title>` with plain `createElement`, so the title is in the
 * HTML namespace. It serialises the same and it is what abcjs does.
 */
function splitSvgIntoLines(
  paper: { innerHTML: string },
  title: string,
  responsive: string | undefined,
): void {
  const doc = liveDocument();
  const output = paper as SplitElement;
  const source = doc === undefined ? null : (output.querySelector?.("svg") ?? null);
  if (doc === undefined || source === null) return;
  const sections = output.querySelectorAll?.("svg > g");
  if (sections === undefined) return;
  const fullName = title === "" ? "Untitled" : title;
  const resize = responsive === "resize";
  // The container's `padding-bottom` ratio was the WHOLE score's; the wrappers carry the
  // proportions now (`:322-323`).
  if (resize && output.style !== undefined) output.style["padding-bottom"] = "";
  const style = source.querySelector?.("style") ?? null;
  // Under `resize` the width and height attributes are gone — `setResponsiveWidth` took
  // them — so the width comes off the viewBox instead (`:326`).
  const width = resize
    ? (source.viewBox?.baseVal?.width ?? 0)
    : (source.getAttribute?.("width") ?? "");
  // The same transform `sizeContainer` reads, and for the same reason: `setScale` is the
  // one place the resolved scale is written, and `setScale(1)` clears it (`svg.js:71-85`).
  const scale = Number(
    /scale\(\s*([0-9.]+)/.exec(source.style?.["transform"] ?? "")?.[1] ?? 1,
  );
  const firefox = /Firefox\//.test(
    (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "",
  );
  let nextTop = 0;
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const box = section?.getBBox?.();
    if (section === undefined || box === undefined) continue;
    const gapBetweenLines = box.y - nextTop;
    const height = box.height + gapBetweenLines;
    const wrapper = doc.createElement("div");
    let divStyles = "overflow: hidden;";
    if (!resize) divStyles += `height:${height * scale}px;`;
    wrapper.setAttribute?.("style", divStyles);
    const svg = duplicateSvg(doc, source);
    const fullTitle = `Sheet Music for "${fullName}" section ${i + 1}`;
    svg.setAttribute?.("aria-label", fullTitle);
    if (!resize) svg.setAttribute?.("height", String(height));
    // `position: absolute` was `setResponsiveWidth`'s, and it stacked every section on the
    // first; the wrappers do the stacking now (`:339-340`).
    if (resize && svg.style !== undefined) svg.style["position"] = "";
    // "TODO-PER: Hack! Not sure why this is needed." — abcjs's own note (`:342`). The two
    // other `renderer.firefox` arms, in `print-stem` and `print-line`, are unported.
    const viewBoxHeight = firefox ? height + 1 : height;
    svg.setAttribute?.("viewBox", `0 ${nextTop} ${width} ${viewBoxHeight}`);
    if (style !== null) {
      const cloned = style.cloneNode?.(true);
      if (cloned !== undefined) svg.appendChild?.(cloned);
    }
    const titleEl = doc.createElement("title");
    titleEl.innerText = fullTitle;
    svg.appendChild?.(titleEl);
    // ⚠️ **THIS MOVES THE SECTION**, which is why `querySelectorAll`'s static list matters
    // and why the source is removed only at the end.
    svg.appendChild?.(section);
    wrapper.appendChild?.(svg);
    output.appendChild?.(wrapper);
    nextTop = box.y + box.height;
  }
  output.removeChild?.(source);
}

/**
 * `duplicateSvg` (`write/engraver-controller.js:370-379`) — a fresh SVG carrying every
 * attribute of the original **except `height` and `aria-label`**, which the caller then
 * sets to this section's own. The two omissions are why a split `<svg>`'s attribute order
 * is `… width [style] aria-label height viewBox` rather than the source's.
 */
function duplicateSvg(doc: SplitDocument, source: SplitElement): SplitElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  const attrs = source.attributes;
  for (let i = 0; i < (attrs?.length ?? 0); i += 1) {
    const attr = attrs?.[i];
    if (attr === undefined) continue;
    if (attr.name !== "height" && attr.name !== "aria-label")
      svg.setAttribute?.(attr.name, attr.value);
  }
  return svg;
}

/**
 * **RUN A RENDER WITH THE BROWSER'S OWN TEXT METRICS, WHEN THERE IS A BROWSER.**
 *
 * abcjs measures every run of text with `getBBox` on an element it puts in the live SVG
 * (`write/svg.js:308-341`). Ours measures with `dump-svg.js`'s tables, which is the right
 * answer for a headless render and the wrong one in a browser — measured, `d4b7022`: abcjs
 * renders differently in WebKit and Blink, so the tables cannot be right in both and the
 * only transferable thing is the MECHANISM. `text-measure.ts` has the argument in full.
 *
 * ⚠️ **THE PROBE MUST BE IN THE DOCUMENT.** A `<text>` outside the tree has no layout and
 * `getBBox` answers zero, which would silently take every width to nothing — so the host
 * SVG is appended to `body`, and the measurer is torn down in a `finally` so a throw
 * cannot leave a stale one installed for the next render.
 *
 * ⚠️ **AND jsdom IS EXCLUDED ON PURPOSE.** It defines `document` and `createElementNS` and
 * has NO layout engine, so `getBBox` is either absent or zero there; the probe below asks
 * for a real number and keeps the tables when it does not get one. Without that check the
 * 691 goldens — harvested under jsdom — would all go red.
 */
function withLiveTextMetrics<T>(run: () => T): T {
  const doc = (globalThis as { document?: LiveDocument }).document;
  const body = doc?.body;
  if (doc === undefined || body === undefined || body === null) return run();
  const NS = "http://www.w3.org/2000/svg";
  let host: LiveElement | undefined;
  try {
    host = doc.createElementNS(NS, "svg");
    host.setAttribute("width", "0");
    host.setAttribute("height", "0");
    host.setAttribute("style", "position:absolute;visibility:hidden");
    body.appendChild(host);
    const measure = createDomTextMeasurer(doc, host);
    // A real layout engine answers a positive width for a real string. jsdom does not.
    if (measure("M", { size: 27, family: "Times New Roman" }).width <= 0) {
      body.removeChild(host);
      return run();
    }
    setTextMeasurer(measure);
    return run();
  } finally {
    setTextMeasurer(null);
    if (host !== undefined && body.removeChild !== undefined) {
      try {
        body.removeChild(host);
      } catch {
        // already gone; nothing to undo
      }
    }
  }
}

/** The two DOM shapes this file touches — `tsconfig` has no `dom` lib, deliberately. */
interface LiveElement {
  setAttribute(name: string, value: string): void;
  appendChild(child: LiveElement): void;
  removeChild(child: LiveElement): void;
  textContent: string | null;
  getBBox?(): { readonly width: number; readonly height: number };
}
interface LiveDocument {
  createElementNS(ns: string, tag: string): LiveElement;
  body?: LiveElement | null;
}

/**
 * `tuneMetrics(abc, params)` — each tune's MEASURE WIDTHS, from a layout at width 0.
 *
 * abcjs runs the tunebook walker with a single `"*"` slot and lets the callback REPLACE the
 * tune in the result (`api/tune-metrics.js`), which is why the array holds `{sections}`
 * objects rather than tunes. See `tune-metrics.ts` for what the numbers are.
 */
export function tuneMetrics(
  abc: string,
  params: AbcjsParams = {},
): { sections: MeasureSection[] }[] {
  /**
   * ⚠️ **ONE SLOT, SO ONE TUNE.** `tuneMetrics` passes the STRING `"*"`, which
   * `renderEngine` normalises to a single-slot array (`abc_tunebook.js:65-66`) — so a book
   * of twelve tunes reports metrics for the FIRST, or for `startingTune` where one is
   * given. Measured: abcjs returns 223 entries over 303 files, one apiece.
   */
  return renderAbc(["*"], abc, params).map((tune) => ({
    sections: measureWidthsOf(tune.score, tune.lines, params.mode ?? "abcjs-strict"),
  }));
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
 * `abcjs.synth` — and **ALL OF IT MAKES NO SOUND IN NODE, WHICH IS WHY ALL OF IT IS
 * GATED.** `CreateSynth` computes no waveform: it fetches one mp3 per instrument and pitch
 * and decides which sample goes where, so with the three host objects replaced by recorders
 * every decision it makes is an exact comparison (`tests/create-synth.test.ts`).
 * `SynthController` decides WHEN rather than what, and `playEvent` is `SynthSequence` plus
 * a `CreateSynth`. Only `sequence` — abcjs's INTERMEDIATE, which ours fuses into
 * `flattenAudio` — is still absent.
 */
export const synth = {
  CreateSynth,
  CreateSynthControl,
  playEvent,
  /**
   * `sequence(tune, options)` — the INTERMEDIATE, which is what `flatten` plays from: one
   * array per voice of reduced elements with a running `timing`, the repeats unrolled and
   * the state changes spliced in. A port of `abc_midi_sequencer.js` over `tune.lines`,
   * exactly as abcjs's runs, and therefore a SECOND derivation of what our own flattener
   * answers from the parse model — see `tests/sequence.test.ts`.
   */
  sequence: (tune: TuneObject, options: SequenceOptions = {}): SequenceRow[][] =>
    sequenceOf(tune as unknown as SequenceTune, options),
  SynthController,
  midiRenderer,
  SynthSequence,
  pitchToNoteName,
  instrumentIndexToName,
  supportsAudio,
  registerAudioContext,
  activeAudioContext,
  /**
   * **`notesAvailable(visualObj, params)` — WHICH SOUNDS THE USER ALREADY HAS. abcts's own,
   * and NOT one of abcjs's symbols**, so `compat-surface`'s "nothing abcjs has is absent"
   * is untouched and a host that never calls it sees exactly abcjs's shape.
   *
   * abcjs answers half of this: `init` resolves `{loaded, cached, error}` — but that is a
   * report of what a load DID, after the fetching, and it can only see this page's memory.
   * This answers BEFORE playing and survives a reload, which is what a prefetch decision,
   * a progress bar or an "available offline" badge actually needs.
   *
   * `{ inMemory, inCache, missing, error, soundFontUrl }`. See `create-synth.ts` for why
   * `inCache` is the Cache API and not the HTTP cache — the latter is not readable by
   * anything, and a note the browser would in fact serve from disk is still reported
   * `missing`, because the honest answer to an unanswerable question is the pessimistic one.
   */
  notesAvailable,
  /**
   * `getMidiFile(source, options)` — a string goes through `renderEngine`, a tune array is
   * used as given.
   *
   * ⚠️ **A STRING SOURCE YIELDS ONE TUNE, NOT ONE PER `X:`.** abcjs is
   * `tunebook.renderEngine(callback, "*", source, params)` (`synth/get-midi-file.js:38`),
   * and **`renderEngine` renders ONE TUNE PER OUTPUT SLOT** — `"*"` is a single headless
   * slot, so a three-tune book gets the FIRST tune and nothing else. This mapped
   * `parseOnly(source)` and answered one file per `X:`: three where abcjs gives one,
   * measured on `abcjs-parse-book_parser-03-a`.
   *
   * **Exactly the divergence `renderAbc` itself had** (`CHECKPOINT-2026-08-15c`) — found
   * then, fixed there, and this call site kept its own copy of the old shape. **A RULE
   * PORTED AT THE SITE THAT NAMED IT IS NOT A RULE PORTED**, for the third time in this
   * repo after `printStem`'s rounding and the `centerVertically` flag.
   */
  /**
   * ⚠️ **AND THE OBJECT ARM RETURNS A BARE VALUE, WHERE THE STRING ARM RETURNS AN ARRAY.**
   * `if (typeof source === "string") return tunebook.renderEngine(…); else return
   * callback(null, source, 0)` (`synth/get-midi-file.js:37-40`) — the callback's own
   * return, one string. Ours wrapped both in an array, so a host reading the documented
   * shape got `["data:audio/midi,…"]`.
   *
   * ⚠️ **AND `tests/midi-bytes.test.ts` NORMALISED IT AWAY** — `Array.isArray(r) ? r[0] :
   * r`, written to make the gate work rather than to state the contract, so the gate that
   * exists to prove this entry point could not see the entry point was wrong. Found
   * 2026-09-09 by the NEGATIVE CONTROL of a new harness: a plain tune differed, which no
   * defect could explain.
   */
  getMidiFile(
    source: string | TuneObject | readonly TuneObject[],
    options: MidiFileParams = {},
  ): string | Uint8Array | (string | Uint8Array)[] {
    /**
     * ⚠️ **A NON-STRING SOURCE IS ONE TUNE, NOT AN ARRAY OF THEM.** abcjs's else arm is
     * `return callback(null, source, 0)` (`synth/get-midi-file.js:40`) — `source` goes
     * straight to `midiCreate` as a single tune object. This assumed an array and threw
     * `tunes.map is not a function` on the very call a host makes to reach tune 2 of a
     * book, which is the only way to reach it at all: the STRING form is
     * `renderEngine(callback, "*", …)` and yields the first tune and nothing else.
     *
     * Found while widening the MIDI byte gate past tune 0 — **the entry point needed to
     * test the other 460 tunes was itself broken**, which is why nothing had noticed.
     *
     * An ARRAY is still accepted and mapped, as this always did. abcjs would hand one
     * whole array to `midiCreate` and produce nonsense, so nothing that works against
     * abcjs can be relying on that shape; it costs a line and keeps our own callers.
     */
    const one = (src: TuneObject | readonly TuneObject[]): readonly TuneObject[] =>
      Array.isArray(src) ? (src as readonly TuneObject[]) : [src as TuneObject];
    const tunes: readonly TuneObject[] =
      typeof source === "string"
        ? (renderEngine((_el, tune) => tune, "*", source, {}) as TuneObject[])
        : one(source);
    const files = getMidiFileFor(
      tunes.map((t) => t.score),
      // The MIDI track name, which is the title as a plain string — a RICH title is not one
      // and abcjs's own writer would put `[object Object]` there, so it is skipped instead.
      tunes.map((t) =>
        typeof t.metaText.title === "string" ? t.metaText.title : undefined,
      ),
      options,
    );
    // ONE TUNE OBJECT IN, ONE FILE OUT — see the note above. A string source and our own
    // array extension both keep the array.
    return typeof source === "string" || Array.isArray(source)
      ? files
      : (files[0] as string | Uint8Array);
  },
};

/**
 * `abcjs.test` — the two internals abcjs exposes "for testing", and which its own golden
 * generator calls. `EngraverController` is what a STACKED render is.
 */
export const test = { Parse, EngraverController };

/**
 * `extractMeasures(abc)` — the tune cut into MEASURES OF ABC TEXT, for a chord chart or a
 * quoted bar. See `src/compat/extract-measures.ts`; the parse it walks is `parseOnly`'s.
 */
export function extractMeasures(abc: string): ExtractedTune[] {
  return extractMeasuresOf(abc, (source) => parseOnly(source));
}

export function parseOnly(abc: string, params: AbcjsParams = {}): TuneObject[] {
  return renderInto(
    new Array<string>(numberOfTunes(abc)).fill("*"),
    abc,
    params,
    false,
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
