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
  timingsOf,
} from "../audio/timing.js";
import { plainText, type RichText, type Score } from "../core/model.js";
export { type BookTune, numberOfTunes, TuneBook } from "./tunebook.js";
import { numberOfTunes } from "./tunebook.js";
import { parse } from "../parser/parser.js";
import { STAFF_SPACE_PX, UNIT_PX } from "../renderer/abcjs-constants.js";
import { layout } from "../renderer/layout.js";
import { toSVG } from "../renderer/svg.js";

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
  readonly metaText: { readonly title?: string };
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
  readonly noteTimings: NoteTiming[];
  readonly getTotalTime: () => number | undefined;
  readonly getTotalBeats: () => number | undefined;

  /** `setUpAudio(options)` — the flattened event list `CreateSynth` plays. */
  readonly setUpAudio: (options?: AudioOptions) => FlatAudio;
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
  const result = parse(abc, { mode: "abcjs-strict" });
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
  const systemWidth =
    params.staffwidth === undefined
      ? undefined
      : (params.staffwidth + padding * 2) / UNIT_PX / scale;

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
    const timings: {
      rows: NoteTiming[];
      time: number | undefined;
      beats: number | undefined;
    } = { rows: [], time: undefined, beats: undefined };
    return {
      svg: toSVG(
        layout(score, {
          mode: "abcjs-strict",
          ...(systemWidth ? { systemWidth } : {}),
          ...(printing ? { print: true } : {}),
        }),
        {
          staffSpace,
          classes: "abcjs",
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
      ),
      score,
      // abcjs's `metaText.title` is a plain string even when the field changed font
      // mid-line — the phrases are a LAYOUT structure, not part of the public shape.
      metaText:
        score.metadata.titles[0] === undefined
          ? {}
          : { title: plainText(score.metadata.titles[0]) },

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
      noteTimings: timings.rows,
      getTotalTime: () => timings.time,
      getTotalBeats: () => timings.beats,

      setUpAudio: (options: AudioOptions = {}) => flattenAudio(score, options),
    };
  };

  const tunes: TuneObject[] = [];
  slots.forEach((slot, i) => {
    // A HEADLESS slot does the work and shows nothing (`abc_tunebook.js:78-80`).
    const element = slot === "*" ? null : resolve(slot);
    const score = result.scores[from + i];
    if (score === undefined) {
      // …AND A SLOT PAST THE END CLEARS ITS DIV rather than being skipped (`:99-102`).
      if (element !== null) element.innerHTML = "";
      return;
    }
    const tune = render(score);
    if (element !== null) element.innerHTML = tune.svg;
    tunes.push(tune);
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
  const result = parse(abc, { mode: "abcjs-strict" });
  const printing = params.print === true;
  const padding = printing ? PRINT_PADDING : SCREEN_PADDING;
  const scale = printing ? PRINT_SCALE : 1;
  const systemWidth =
    params.staffwidth === undefined
      ? undefined
      : (params.staffwidth + padding * 2) / UNIT_PX / scale;
  // **ONE CONTINUOUS PAGE CURSOR** — each tune's walk is seeded with the one above's
  // `endY`, because abcjs's `renderer.y` runs through every advance of every tune and a
  // sum of per-tune totals is a different double. See `LayoutOptions.pageTop`.
  let pageTop = 0;
  const layouts = result.scores.map((score) => {
    const doc = layout(score, {
      mode: "abcjs-strict",
      ...(systemWidth ? { systemWidth } : {}),
      ...(printing ? { print: true } : {}),
      pageTop,
    });
    pageTop = doc.endY ?? pageTop;
    return doc;
  });
  return toSVG(layouts, {
    staffSpace: STAFF_SPACE_PX * (params.scale ?? 1),
    classes: "abcjs",
    ...(params.add_classes === true ? { addClasses: true } : {}),
    // One `<style>`/`<title>` pair per tune, in reverse — see `RenderOptions.titles`.
    titles: result.scores.map((score) =>
      score.metadata.titles[0] === undefined
        ? undefined
        : ariaTitle(score.metadata.titles[0]),
    ),
  });
}
