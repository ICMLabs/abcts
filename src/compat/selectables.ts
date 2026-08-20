import type {
  Clef,
  KeySignature,
  Meter,
  MusicEvent,
  Pitch,
} from "../core/model.js";
import { DEFAULT_STAFF_LINES, keyFifths, ratToNumber, stepIndex } from "../core/model.js";
import type { Layout, LayoutElement } from "../renderer/layout.js";
import type { SelectableRecord } from "../renderer/svg.js";
import {
  FLAT_ORDER,
  keySignatureShift,
  keyStepOf,
  middleLineIndex,
  SHARP_ORDER,
} from "../renderer/layout.js";

import type { AbcElement } from "./lines.js";

/**
 * **`engraver.selectables` — WHAT A HOST CLICKS INTO.**
 *
 * abcjs builds this array while it DRAWS: `Selectables.add(absEl, svgEl, isDraggable,
 * staffPos)` runs at eleven sites in `write/draw/` — every absolute element, and then the
 * ending, the brace, the dynamics, the tie, the non-music text rows, the crescendo, the
 * voice name, the glissando and the triplet, each of which wraps a synthetic `abcelem`
 * (`draw/selectables.js`). The index it writes into `data-index` is simply how many were
 * added before it.
 *
 * **THE ORDER AND THE COUNT ARE ALREADY PROVEN.** We emit `data-index` byte-exactly on all
 * 356 sibling rows and all 188 in-repo ones, so the drawing walk this array follows is the
 * same walk. What has to be built is the ARRAY — the `abcelem` each entry carries — and
 * that is a join rather than a computation: the drawing carries a reference to the model
 * event (`LayoutElement.sourceEvent`) and `projectionOf` hands back the map from that event
 * to its `tune.lines` element. abcjs's own two surfaces agree by IDENTITY and so do ours.
 *
 * **AND THE ENGRAVE-TIME FIELDS ARE STAMPED HERE, ON THAT SAME OBJECT.** `verticalPos`,
 * `highestVert`, `averagepitch`, `minpitch` and `maxpitch` are not the parser's — abcjs
 * writes them onto the parse element while engraving (`abstract-engraver.js:385-399`,
 * `:692-712`) and a host reads them back through `tune.lines`.
 */

/** abcjs's `selectTypes` render param: `false` none, `true` all, absent notes, or a list. */
export type SelectTypes = boolean | readonly string[] | undefined;

/** What `svgEl` is when nothing has been injected into a DOM — the attributes we wrote. */
export interface SelectableAttrs {
  readonly attributes: readonly { nodeName: string; nodeValue: string }[];
  getAttribute: (name: string) => string | null;
}

export interface Selectable {
  readonly absEl: {
    readonly tuneNumber: number;
    readonly abcelem: AbcElement;
    readonly elemset: readonly unknown[];
  };
  readonly svgEl: SelectableAttrs;
  readonly isDraggable: boolean;
}

/**
 * `Selectables.canSelect` (`draw/selectables.js:31-45`) — and its DEFAULT is the
 * interesting arm: with no `selectTypes` at all only `el_type` `note` and `tabNumber` are
 * selectable, and abcjs's rests ARE note elements, so a barline, a clef and a key
 * signature carry neither attribute.
 */
const canSelect = (elType: string, selectTypes: SelectTypes): boolean => {
  if (selectTypes === false) return false;
  if (selectTypes === true) return true;
  if (selectTypes === undefined)
    return elType === "note" || elType === "tabNumber";
  return selectTypes.includes(elType);
};

const attrs = (
  pairs: readonly [string, string][],
): SelectableAttrs => ({
  attributes: pairs.map(([nodeName, nodeValue]) => ({ nodeName, nodeValue })),
  getAttribute: (name) => pairs.find((p) => p[0] === name)?.[1] ?? null,
});

/**
 * `Selectables.add`'s two shapes: without `selectTypes` the element is marked
 * `selectable="false"` and carries only its index — the OLD behaviour abcjs kept — and
 * with one it is a real tab stop (`draw/selectables.js:19-23`).
 */
const selectableAttrs = (
  index: number,
  selectTypes: SelectTypes,
  /**
   * The wrapped element's OWN `x`/`y`, where it has them. abcjs's `svgEl` is the live DOM
   * node and a host reads its attributes off it, so a `<text>` row hands back both and a
   * `<g>` — a boxed row, a brace, a closed group, and every element group — hands back
   * neither. They come FIRST, because they were written at creation and the three
   * `Selectables.add` attributes are set afterwards.
   */
  xy?: { readonly x: string; readonly y: string },
): SelectableAttrs =>
  attrs([
    ...(xy === undefined
      ? []
      : ([
          ["x", xy.x],
          ["y", xy.y],
        ] as [string, string][])),
    ...(selectTypes === undefined
      ? ([
          ["selectable", "false"],
          ["data-index", String(index)],
        ] as [string, string][])
      : ([
          ["selectable", "true"],
          ["tabindex", "0"],
          ["data-index", String(index)],
        ] as [string, string][])),
  ]);

/** `verticalPos` — `pitch - mid`, and `mid` is the staff's own middle line. */
const verticalPosOf = (p: Pitch, clef: Clef): number =>
  stepIndex(p.step) + 7 * p.octave - middleLineIndex(clef) + MIDDLE_LINE_VERTICAL_POS;

/**
 * abcjs counts `verticalPos` from the FIRST LEDGER LINE BELOW the staff, not from the
 * middle line: a treble middle line is B4 and reads 6, so middle C reads 0 and
 * `verticalPos === pitch` on a treble staff. Ours counts from the middle line, so the two
 * differ by exactly the six steps between them. Checked on all three clefs of
 * `selection-clefs`: treble 0, tenor 8, bass 12 for the same written `C`.
 */
const MIDDLE_LINE_VERTICAL_POS = 6;

/**
 * `setAveragePitch` and the `highestVert` rule, stamped onto the projection.
 *
 * **`highestVert` IS WHERE A SLUR MAY HANG, NOT THE TOP OF THE NOTE.** It is the pitch's
 * own `verticalPos` except on the head a whole-chord slur would attach to — the LOWEST
 * head when the stem is up, the HIGHEST when it is down — where it becomes the chord's top
 * pitch, plus 6 more when the stem is up and the note is shorter than a whole
 * (`abstract-engraver.js:692-712`). A single note is a chord of one, so `pp === 1` puts
 * every unslurred eighth 6 above itself.
 */
function stampEngraved(abcelem: AbcElement, element: LayoutElement): void {
  const clef = element.sourceClef;
  const pitches = abcelem.pitches;
  if (pitches !== undefined && clef !== undefined) {
    const event = element.sourceEvent;
    const sources =
      event === undefined
        ? []
        : event.type === "note"
          ? [event.pitch]
          : event.type === "chord"
            ? [...event.pitches].sort(
                (a, b) =>
                  stepIndex(a.step) + 7 * a.octave - (stepIndex(b.step) + 7 * b.octave),
              )
            : [];
    pitches.forEach((p, i) => {
      const source = sources[i];
      if (source !== undefined) p.verticalPos = verticalPosOf(source, clef);
      p.highestVert = p.verticalPos;
    });
    const top = pitches[pitches.length - 1];
    const up = element.stemUp === true;
    const anchor = up ? pitches[0] : top;
    /**
     * **AND A WHOLE-CHORD SLUR IS COPIED DOWN ONTO THE ANCHOR HEAD** — the same branch and
     * the same head as `highestVert`, because they answer the same question: which notehead
     * a curve for the whole chord hangs from (`abstract-engraver.js:696-717`). The mark is
     * on the ELEMENT until then; a rendered chord carries it in BOTH places, which is what
     * `addIfNotExist` keeps from doubling. See `markSlurs` for where it starts.
     */
    const raise =
      top === undefined
        ? 0
        : (up && (typeof abcelem.duration === "number" ? abcelem.duration : 0) < 1 ? 6 : 0);
    if (anchor !== undefined && top !== undefined && (pitches.length === 1 || abcelem.startSlur))
      anchor.highestVert = top.verticalPos + raise;
    if (anchor !== undefined && top !== undefined && abcelem.endSlur !== undefined)
      anchor.highestVert = top.verticalPos + raise;
    if (anchor !== undefined && abcelem.startSlur !== undefined) {
      const into = anchor.startSlur ?? (anchor.startSlur = []);
      for (const mark of abcelem.startSlur)
        if (!into.some((x) => x.label === mark.label)) into.push(mark);
    }
    if (anchor !== undefined && abcelem.endSlur !== undefined) {
      const into = anchor.endSlur ?? (anchor.endSlur = []);
      for (const label of abcelem.endSlur) if (!into.includes(label)) into.push(label);
    }
    /**
     * **`printer_shift` — WHICH HEAD OF A CHORD IS PUSHED ASIDE**, stamped onto the parse
     * pitch while the engraver decides it (`abstract-engraver.js:649-656`). The walk starts
     * at the stem end — the second head IN from the stem — and a head no more than a second
     * from its neighbour is shifted, `"same"` when they share a line and `"different"`
     * otherwise. **A HEAD ALREADY SHIFTED BLOCKS THE NEXT ONE**, which is what keeps a
     * cluster from marching sideways.
     */
    for (
      let i = up ? 1 : pitches.length - 2;
      up ? i < pitches.length : i >= 0;
      i += up ? 1 : -1
    ) {
      const prev = pitches[up ? i - 1 : i + 1];
      const curr = pitches[i];
      if (prev === undefined || curr === undefined) continue;
      const delta = up ? curr.pitch - prev.pitch : prev.pitch - curr.pitch;
      if (delta <= 1 && prev.printer_shift === undefined)
        curr.printer_shift = delta ? "different" : "same";
    }
    abcelem.averagepitch =
      pitches.reduce((t, p) => t + p.verticalPos, 0) / pitches.length;
    abcelem.minpitch = pitches[0]?.verticalPos ?? 0;
    abcelem.maxpitch = top?.verticalPos ?? 0;
  } else if (abcelem.rest !== undefined) {
    // **A REST REPORTS THE PITCH IT IS DRAWN AT** — `restpitch` is 7, or 11 with the stems
    // up and 3 with them down on a shared staff (`abstract-engraver.js:559-560`).
    const pitch = element.restPitch ?? REST_PITCH;
    abcelem.averagepitch = pitch;
    abcelem.minpitch = pitch;
    abcelem.maxpitch = pitch;
  }
}

const REST_PITCH = 7;

/**
 * The selectable array for one rendered tune, in DRAWING ORDER.
 *
 * Systems, then staves, then voices, then that voice's elements — which is `drawStaffGroup`
 * looping `params.voices[i]` and `drawVoice` walking its children
 * (`draw/staff-group.js:112`, `draw/voice.js:25-90`), and which is exactly the order the
 * emitter writes `data-index` in.
 *
 * ponytail: only the elements are here. abcjs also wraps the non-music text rows, the voice
 * name, the brace, the endings, the triplets, the curves and the dynamics — every one of
 * them is a `selectTypes`-driven entry and none is reachable with the default, which admits
 * `note` alone. `tests/selection.test.ts` measures what that costs: two of the four cases.
 */
/**
 * `findSelectableElement(event)` — the entry a CLICK landed on
 * (`interactive/find-selectable-element.js`).
 *
 * It walks UP from the event target to the nearest node carrying a `selectable` attribute,
 * reads its `data-index`, and hands back `createAnalysis`'s two-part answer with the index
 * and the entry added. Every guard is abcjs's: a missing attribute, an index of `"0"`
 * (which is FALSY as a string only when empty, so 0 does reach the array), and an index
 * past the end all return `null`.
 */
export function findSelectable(
  selectables: readonly Selectable[],
  target: unknown,
): { classes: string[]; analysis: Record<string, unknown>; index: number; element: Selectable } | null {
  let node = target as {
    attributes?: Record<string, { nodeValue: string } | undefined>;
    tagName?: string;
    parentNode?: unknown;
  } | null;
  while (
    node?.attributes !== undefined &&
    node.tagName?.toLowerCase() !== "svg" &&
    node.attributes["selectable"] === undefined
  ) {
    node = node.parentNode as typeof node;
  }
  const raw = node?.attributes?.["selectable"] === undefined
    ? undefined
    : node.attributes["data-index"]?.nodeValue;
  if (raw === undefined || raw === "") return null;
  const index = Number.parseInt(raw, 10);
  const element = selectables[index];
  if (element === undefined) return null;
  return {
    classes: [],
    analysis: { selectableElement: element.svgEl },
    index,
    element,
  };
}

/** What a `duplicate` voice — any but the first on its staff — does not draw. */
const DUPLICATE_HIDES: ReadonlySet<string> = new Set([
  "bar",
  "clef",
  "keySignature",
  "timeSignature",
]);

/** The two maps `projectionOf` hands back — see `abcelemOf`. */
export interface ProjectionIndex {
  readonly byEvent: ReadonlyMap<MusicEvent, AbcElement>;
  readonly byRange: ReadonlyMap<number, AbcElement>;
}

/**
 * The `abcelem` a drawn element carries, and it is THREE DIFFERENT JOINS.
 *
 * A NOTE or a REST joins by its model event. A BARLINE joins by where it was WRITTEN,
 * since the projection already builds one element per barline and the drawing carries its
 * range — the raw one, because the tiled `startChar` moves and the written one does not.
 * The CLEF, KEY and METER join by NEITHER: abcjs hangs those on the STAFF rather than
 * putting them in the voice's stream, so there is no stream element to be identical with
 * and they are built here from the model object the drawing was made from.
 *
 * ponytail: a `tempo` and a `part` ARE stream elements and have no source range in our
 * model — two of the six types `tests/lines.test.ts` already names — so they produce
 * nothing here, and because the gate compares row against row, every entry after one is
 * misaligned. That is the whole of what `selection-tempo` is still missing on the element
 * side; the ten `wrapSvgEl` sites are the other half of `selection-multiple`. Both are in
 * `Docs/HANDOFF-2026-08-16.md`.
 */
export /**
 * **A PREFIX ELEMENT OWNS CHARACTERS ONLY WHEN A MID-TUNE FIELD WROTE IT.** The clef, key
 * and meter reprinted at the head of a system come off the STAFF and carry no span at all;
 * the ones a body `K:`, `[K:]` or `M:` puts in the stream carry the field's own
 * (`abc_parse_header.js:508-509`). See `layoutMeasure`'s `trailingClefRange`.
 */
const withSpan = (
  element: AbcElement,
  range: { start: number; end: number } | undefined,
): AbcElement =>
  range === undefined
    ? element
    : { ...element, startChar: range.start, endChar: range.end };

export function abcelemOf(
  element: LayoutElement,
  index: ProjectionIndex,
): AbcElement | undefined {
  switch (element.type) {
    case "note":
    case "rest": {
      const event = element.sourceEvent;
      if (event === undefined) return undefined;
      const found = index.byEvent.get(event);
      if (found !== undefined) return found;
      /**
       * **AN OVERLAY PAD IS AN ELEMENT OF abcjs'S OWN `tune.lines`, SO IT NEEDS ONE HERE.**
       * `resolveOverlays` fills a layer's silent measures with invisible rests — one per
       * note when a line is back-filled, one per measure otherwise — and they carry the
       * span of whatever they stand in for (`tune-builder.js:541-556, 572-575`). Both
       * sides of this library resolve them, but SEPARATELY: the model's are what the
       * renderer lays out and the projection's are what a host reads, and no identity
       * joins the two. So the element is synthesized here, with the projected span of the
       * note it mirrors — the model's own range is the RAW one, which stops short of the
       * trailing whitespace abcjs's tokenizer swallows.
       */
      if (event.type === "rest" && event.overlayPad === true) {
        const mirror =
          event.overlayMirrors === undefined
            ? undefined
            : index.byEvent.get(event.overlayMirrors);
        const start = mirror?.startChar ?? event.sourceRange?.start;
        const end = mirror?.endChar ?? event.sourceRange?.end;
        return {
          el_type: "note",
          rest: { type: "invisible" },
          duration: ratToNumber(event.duration),
          ...(start === undefined ? {} : { startChar: start }),
          ...(end === undefined ? {} : { endChar: end }),
        };
      }
      return undefined;
    }
    // A BARLINE, a TEMPO and a body `P:` are all stream elements the projection already
    // built; each joins by where it was WRITTEN.
    case "bar":
    case "tempo":
    case "part":
      return element.sourceRange === undefined
        ? undefined
        : index.byRange.get(element.sourceRange.start);
    /**
     * **A CLEF OWNS CHARACTERS ONLY WHEN A MID-TUNE `K:` WROTE IT.** abcjs's line-leading
     * clef comes off `staff.clef` and carries no span at all; the one a `K:… clef=` puts
     * in the stream carries the field's own (`abc_parse_header.js:508-509`). See
     * `layoutMeasure`'s `trailingClefRange`.
     */
    case "clef":
      return element.sourceClef === undefined
        ? undefined
        : withSpan(clefElement(element.sourceClef), element.sourceRange);
    case "keySignature":
      return element.sourceKey === undefined || element.sourceClef === undefined
        ? undefined
        : withSpan(
            keyElement(element.sourceKey, element.sourceClef),
            element.sourceRange,
          );
    // (was: a KEY SIGNATURE is measured and NOT built. Its shape is
    // `{accidentals: [{acc, note, verticalPos}], root, acc, mode}` and the mode is the
    // EMPTY STRING for major — but `note` is the accidental's own written name AT THE
    // POSITION IT IS DRAWN, so B♭ major gives `B` (verticalPos 6) and `e` (verticalPos 9),
    // upper and lower case in one list, and every one of those moves with the clef. Our
    // model holds no such list at all: `layoutKeySignature` derives the glyph positions
    // from `keyFifths` and the sharp/flat order. Building it needs that derivation
    // repeated with abcjs's naming, which is a measurement this session did not make.
    // `selection-multiple` has four of them — built now, off the same order and shift the
    // layout draws them with.)
    /**
     * **A VOICE NAME IS A WRAPPED TEXT, NOT AN ELEMENT OF THE MUSIC** — `drawVoice` wraps
     * the label it prints left of the staff in a synthetic abcelem carrying the text and
     * no span at all (`draw/voice.js:20`). It is one of the ten `wrapSvgEl` sites and the
     * only one the layout walk can reach today, because ours IS an element.
     */
    case "voiceName": {
      const text = element.texts[0]?.text;
      return text === undefined
        ? undefined
        : { el_type: "voiceName", startChar: -1, endChar: -1, text };
    }
    case "timeSignature":
      return element.sourceMeter === undefined
        ? undefined
        : withSpan(meterElement(element.sourceMeter), element.sourceRange);
    default:
      return undefined;
  }
}

/**
 * `{type, verticalPos, clefPos}` — abcjs's own clef table
 * (`abc_parse_key_voice.js:25-70`), and both numbers are DERIVED rather than tabled:
 * `clefPos` is the LINE the clef sits on, doubled, and `verticalPos` is the table's `mid`,
 * which is this staff's middle line measured from a treble staff's. `tenor` comes back
 * spelled `alto`, because the field names the clef and the element names what is DRAWN.
 */
export const clefElement = (
  clef: Clef,
  transpose?: number,
  /**
   * `V:… stafflines=` written WITHOUT a `clef=` beside it — see `Voice.staffLineOverride`.
   * abcjs has no such split: it writes the count straight onto `multilineVars.clef`, so a
   * `V:SnareDrum stafflines=1` followed by `K:C clef=perc` gives ONE object carrying both.
   */
  staffLineOverride?: number | null,
): AbcElement => ({
  el_type: "clef",
  type:
    (CLEF_TYPE[clef.shape] ?? "treble") +
    (clef.octaveShift === 0 || clef.octaveShift === undefined
      ? ""
      : clef.octaveShift > 0
        ? "+8"
        : "-8"),
  verticalPos: middleLineIndex(clef) - TREBLE_MIDDLE_LINE_INDEX,
  /**
   * **`stafflines=` RIDES THE CLEF, AND ONLY WHEN IT WAS WRITTEN.** `V:` and `K:` both
   * assign `multilineVars.clef.stafflines` from the token
   * (`abc_parse_key_voice.js:429`, `:796-797`), so the field exists on the projected clef
   * exactly when the source says so — `clef=none` reads 0 and a percussion staff 1.
   *
   * **AND AN EXPLICIT `stafflines=5` IS NOT THE DEFAULT.** This tested the VALUE, so
   * `K:C stafflines=5` published no field where abcjs publishes 5 — the two draw
   * identically and only the parse tree can say. `Clef.staffLinesWritten` is the flag its
   * own `ponytail:` asked for; `abcts-model-gaps.abc` is the fixture that turned one up.
   * The value test stays beside it, because a count that is not 5 is written by
   * definition and some of them reach the clef by routes that set no flag.
   */
  ...(staffLineOverride == null &&
  clef.staffLinesWritten !== true &&
  clef.staffLines === DEFAULT_STAFF_LINES
    ? {}
    : { stafflines: staffLineOverride ?? clef.staffLines }),
  /**
   * **AND A `clef=none` HAS NO `clefPos` AT ALL.** `fixClef` assigns one only when the
   * type is in `clefLines`, and `none` is not a row in that table
   * (`abc_parse_key_voice.js:75-81`) — where `perc` is, at pitch 6. So the field is absent
   * rather than 0, which is what `visual-misc-09`'s `%%stafflines 0` staff shows.
   */
  ...(clef.shape === "none" ? {} : { clefPos: clef.line * 2 }),
  /**
   * **`V:… transpose=` RIDES THE CLEF**, because abcjs's `V:` handler writes it onto the
   * clef object it just built (`abc_parse_key_voice.js`), and `synth.sequence` reads it
   * back off `staff.clef` as a `transpose` row. Nothing else in this library needed it,
   * which is why the field was absent until that gate opened.
   */
  ...(transpose === undefined || transpose === 0 ? {} : { transpose }),
});

const CLEF_TYPE: Readonly<Record<string, string>> = {
  G: "treble",
  F: "bass",
  C: "alto",
  percussion: "perc",
  none: "none",
};

/** B4, the middle line of a treble staff — what abcjs's `mid` is measured from. */
const TREBLE_MIDDLE_LINE_INDEX = 34;

/**
 * `{accidentals: [{acc, note, verticalPos}], root, acc, mode}` — abcjs's parsed key.
 *
 * **THE `note` IS THE PITCH AT THE POSITION THE ACCIDENTAL IS DRAWN**, named the way ABC
 * writes it — B♭ major gives `B` (verticalPos 6) and `e` (9), upper and lower case in one
 * list, and both move with the clef. So it is derived from the SAME order and shift the
 * layout draws the signature with (`layoutKeySignature`), not from the key's letters:
 * `keyStepOf` places each accidental, `keySignatureShift` moves the lot for the clef, and
 * the step is read back out as a pitch.
 *
 * abcjs writes the MAJOR mode as the empty string, and `root`/`acc` are the tonic split in
 * two — `Bb` is `{root: "B", acc: "b"}`.
 */
/** A `K:` field's explicit accidental, in QUARTER tones, as abcjs's `accMap` names it. */
const KEY_ACCIDENTAL_ACC: Readonly<Record<number, string>> = {
  [-4]: "dblflat",
  [-2]: "flat",
  [-1]: "quarterflat",
  [0]: "natural",
  [1]: "quartersharp",
  [2]: "sharp",
  [4]: "dblsharp",
};

export const keyElement = (key: KeySignature, clef: Clef): AbcElement => {
  const fifths = keyFifths(key);
  const sharps = fifths > 0;
  const shift = keySignatureShift(clef);
  const letters = (sharps ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(fifths));
  const accidentals = letters.map((letter) => {
      const step = keyStepOf(letter, sharps) + shift;
      return {
        acc: sharps ? "sharp" : "flat",
        // **THE NAME IS THE TREBLE SPELLING AND DOES NOT MOVE WITH THE CLEF** — abcjs's
        // table gives each letter a fixed `note` and adjusts only `verticalPos` by the
        // staff's `mid` (`abc_parse_key_voice.js:107-135`). So B♭ major reads `B` and `e`
        // on a BASS staff too, where those positions sound `B,,` and `E,`. Measured: our
        // first cut named the pitch at the drawn position and differed on exactly the two
        // bass rows.
        note: abcName(keyStepOf(letter, sharps) + TREBLE_MIDDLE_LINE_INDEX),
        verticalPos: step + MIDDLE_LINE_VERTICAL_POS,
        letter,
      };
    });
  /**
   * **AN EXPLICIT ACCIDENTAL ON THE FIELD REPLACES A STANDARD ONE ON THE SAME LETTER, OR IS
   * APPENDED** (`abc_parse_key_voice.js:320-350`) — the rule the layout already draws with,
   * and the element carries it too, in the order written. `K: C ^/f _/B _A ^D` is four
   * accidentals over a key with none of its own, and this side reported an empty list.
   *
   * Its position follows the accidental's SIGN, because a sharp and a flat sit an octave
   * apart for several letters.
   */
  for (const acc of key.extra ?? []) {
    const up = acc.quarters > 0;
    const step = keyStepOf(acc.step, up) + shift;
    const entry = {
      acc: KEY_ACCIDENTAL_ACC[acc.quarters] ?? "natural",
      note: abcName(keyStepOf(acc.step, up) + TREBLE_MIDDLE_LINE_INDEX),
      verticalPos: step + MIDDLE_LINE_VERTICAL_POS,
      letter: acc.step,
    };
    const at = accidentals.findIndex((w) => w.letter === acc.step);
    if (at >= 0) accidentals[at] = entry;
    else accidentals.push(entry);
  }
  return {
    el_type: "keySignature",
    accidentals: accidentals.map(({ acc, note, verticalPos }) => ({
      acc,
      note,
      verticalPos,
    })),
    // **`K:none` NAMES ITSELF** — abcjs writes the literal `"none"` where a real key writes
    // its tonic (`abc_parse_key_voice.js:261`), and the same string is what the implicit
    // pre-`K:` key carries. `accidentals` is empty either way, so this is the only field
    // that separates `K:none` from `K:C`.
    root: key.none ? "none" : key.tonic.step.toUpperCase(),
    acc:
      key.none ||
      key.tonic.accidental === null ||
      key.tonic.accidental === 0
        ? ""
        : key.tonic.accidental > 0
          ? "#"
          : "b",
    mode: key.none ? "" : (KEY_MODE[key.mode] ?? ""),
  };
};

const KEY_MODE: Readonly<Record<string, string>> = {
  major: "",
  minor: "m",
  mixolydian: "Mix",
  dorian: "Dor",
  phrygian: "Phr",
  lydian: "Lyd",
  locrian: "Loc",
};

/** A diatonic index as ABC writes it: `C` is C4, `c` is C5, `C,` is C3, `c'` is C6. */
const abcName = (index: number): string => {
  const octave = Math.floor(index / 7);
  const letter = "cdefgab"[((index % 7) + 7) % 7] ?? "c";
  return octave >= 5
    ? letter + "'".repeat(octave - 5)
    : octave === 4
      ? letter.toUpperCase()
      : letter.toUpperCase() + ",".repeat(4 - octave);
};

/** The same shape `getMeter()` returns — `{type, value: [{num, den}]}`, numbers as STRINGS. */
export const meterElement = (meter: Meter): AbcElement => ({
  el_type: "timeSignature",
  ...(meter.symbol === "common"
    ? { type: "common_time" }
    : meter.symbol === "cut"
      ? { type: "cut_time" }
      : {
          type: "specified",
          value: [
            {
              num:
                meter.numeratorParts === undefined
                  ? String(meter.numerator)
                  : meter.numeratorParts.join("+"),
              den: String(meter.denominator),
            },
          ],
        }),
});

/**
 * Stamp the engrave-time fields onto every element of every system that was LAID OUT —
 * see the call in `index.ts`. Idempotent: each field is recomputed from the element, and
 * `printer_shift` only fills a gap.
 */
export function stampEngravedSystems(
  systems: readonly Layout["systems"][number][],
  index: ProjectionIndex,
): void {
  for (const system of systems)
    for (const staff of system.staves)
      for (const voice of staff.voices)
        for (const element of voice) {
          if (element.type !== "note" && element.type !== "rest") continue;
          const abcelem = abcelemOf(element, index);
          if (abcelem !== undefined) stampEngraved(abcelem, element);
        }
}

export function selectablesOf(
  records: readonly SelectableRecord[],
  index: ProjectionIndex,
  selectTypes: SelectTypes,
  tuneNumber = 0,
): Selectable[] {
  const out: Selectable[] = [];
  for (const record of records) {
    const element = record.element;
    if (element === undefined) {
      /**
       * **A WRAPPED `abcelem` COMES OUT OF THE DRAWING WHOLE**, because only the drawing
       * knows which rows and spanners carry an `absElemType` at all — the ten text rows,
       * the voice name, the brace, the ending, the triplet, the curves and the dynamics.
       *
       * A CURVE IS THE ONE THAT IS FINISHED HERE: its span is its two ANCHOR ELEMENTS'
       * own, one character outside each (`draw/tie.js:18-26`), and only the projection
       * knows a note's span. Absent anchors — a tie, or a half whose other end is on
       * another system — are abcjs's `-1`.
       */
      const wrapped = record.abcelem;
      if (wrapped === undefined) continue;
      const spanOf = (
        anchor: LayoutElement | undefined,
        which: "startChar" | "endChar",
      ): number => {
        const el = anchor === undefined ? undefined : abcelemOf(anchor, index);
        const at = el === undefined ? undefined : el[which];
        if (typeof at !== "number") return -1;
        return which === "startChar" ? at - 1 : at + 1;
      };
      out.push({
        absEl: {
          tuneNumber,
          abcelem: {
            ...wrapped,
            ...(record.kind === "curve"
              ? {
                  startChar: spanOf(record.anchors?.start, "startChar"),
                  endChar: spanOf(record.anchors?.end, "endChar"),
                }
              : {}),
          } as unknown as AbcElement,
          elemset: [],
        },
        svgEl: selectableAttrs(record.index, selectTypes, record.xy),
        // `wrapSvgEl` calls `add(absEl, el, false)` — nothing it wraps is draggable
        // (`draw/selectables.js:47-56`).
        isDraggable: false,
      });
      continue;
    }
    /**
     * **AN ELEMENT JOINS BY REFERENCE** — see `abcelemOf`. Every rule about WHICH elements
     * are selectable has already been applied by the emitter, which is the walk that
     * assigns `data-index`: `canSelect` over the `el_type`, the duplicate-voice suppression
     * of a second voice's barline, clef, key and meter (`abstract-engraver.js:150`,
     * `:321-340`), and "if there was no output, then don't add to the selectables"
     * (`draw/absolute.js:66`). Re-deriving them here was a second copy of a walk that is
     * already byte-exact on 544 `data-index` rows, and a second copy is a second thing to
     * drift.
     */
    const abcelem = abcelemOf(element, index);
    if (abcelem === undefined) continue;
    stampEngraved(abcelem, element);
    out.push({
      absEl: { tuneNumber, abcelem, elemset: [] },
      svgEl: selectableAttrs(record.index, selectTypes),
      /**
       * **A REST IS SELECTABLE AND NOT DRAGGABLE.** `isSelectable = params.type ===
       * 'note' || params.type === 'tabNumber'` (`draw/absolute.js:59-63`) and the
       * abselem of a rest is typed `rest` — while `canSelect` reads the ABCELEM's
       * `el_type`, which is `note` for both. Two different type fields, one line
       * apart, and only one of them says `rest`.
       */
      isDraggable: element.type === "note",
    });
  }
  return out;
}
