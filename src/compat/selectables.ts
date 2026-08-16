import type { Clef, MusicEvent, Pitch } from "../core/model.js";
import { stepIndex } from "../core/model.js";
import type { Layout, LayoutElement } from "../renderer/layout.js";
import { middleLineIndex } from "../renderer/layout.js";

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
): SelectableAttrs =>
  selectTypes === undefined
    ? attrs([
        ["selectable", "false"],
        ["data-index", String(index)],
      ])
    : attrs([
        ["selectable", "true"],
        ["tabindex", "0"],
        ["data-index", String(index)],
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
    if (anchor !== undefined && top !== undefined && pitches.length === 1) {
      anchor.highestVert =
        top.verticalPos + (up && (abcelem.duration ?? 0) < 1 ? 6 : 0);
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

export function selectablesOf(
  doc: Layout,
  byEvent: ReadonlyMap<MusicEvent, AbcElement>,
  selectTypes: SelectTypes,
  tuneNumber = 0,
): Selectable[] {
  const out: Selectable[] = [];
  for (const system of doc.systems) {
    for (const staff of system.staves) {
      for (const voice of staff.voices) {
        for (const element of voice) {
          if (element.type !== "note" && element.type !== "rest") continue;
          const event = element.sourceEvent;
          const abcelem = event === undefined ? undefined : byEvent.get(event);
          if (abcelem === undefined) continue;
          stampEngraved(abcelem, element);
          if (!canSelect(abcelem.el_type, selectTypes)) continue;
          out.push({
            absEl: { tuneNumber, abcelem, elemset: [] },
            svgEl: selectableAttrs(out.length, selectTypes),
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
      }
    }
  }
  return out;
}
