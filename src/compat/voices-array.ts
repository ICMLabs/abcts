import { STAFF_SPACE_PX } from "../renderer/abcjs-constants.js";
import type { Layout, LayoutElement } from "../renderer/layout.js";
import { glyphsFor } from "../renderer/glyph-table.js";
import { ABCJS_ELEMENT_NAMES } from "../renderer/svg.js";

import type { AbcElement, AbcLine } from "./lines.js";
import { abcelemOf, type ProjectionIndex } from "./selectables.js";

/**
 * **`tune.makeVoicesArray()` AND `tune.addElementToEvents()` — abcjs's LAYOUT ELEMENTS,
 * HANDED OUT.**
 *
 * These two are one object in two shapes. `makeVoicesArray` walks the DRAWN staffgroups
 * and returns, per voice, `{top, height, line, measureNumber, elem}` for every element
 * drawn (`data/abc_tune.js:396-435`); `addElementToEvents` is the step `setupEvents` runs
 * over each of those rows to build one timing event per millisecond
 * (`:298-395`). Both are public, so a host can drive the timing walk itself — and abcjs's
 * own `setupEvents` is nothing but the loop around them.
 *
 * **THE GEOMETRY IS ALREADY BUILT AND THE ELEMENT SHAPE IS WHAT WAS MISSING.** Ours
 * computes the same `top`/`height`/`line` for its own timing rows, off the same three
 * formulas (`geometryOf`), and the join from a drawn element to its `abcelem` is the one
 * the selectable array uses. So this is a PROJECTION, not a computation — which is the
 * trade `topText` made.
 *
 * Two things ours cannot hand back, and both are stated rather than faked:
 *
 * - **`elemset` IS `[abcelem]`, NOT SVG NODES.** abcjs draws through a DOM and keeps the
 *   node (`draw/absolute.js:57`); we emit a string. Our own `setupEvents` already puts
 *   `[[abcelem]]` in a row's `elements` for exactly this reason, so the two agree.
 * - **`hint` IS NEVER SET**, because nothing here draws a drag preview.
 */

/** abcjs's `AbsoluteElement`, as much of it as its two public consumers read. */
export interface AbsoluteElementLike {
  /** abcjs's own group name — `note`, `rest`, `bar`, `staff-extra clef`. */
  readonly type: string;
  readonly abcelem: AbcElement | Record<string, unknown>;
  readonly x: number;
  /** `getMinWidth(child)` — the INK, not the spring the cursor advanced by. */
  readonly w: number;
  readonly duration: number;
  readonly durationClass?: number;
  readonly elemset: readonly unknown[];
  readonly startTie?: unknown;
  readonly hint?: boolean;
}

/** One row of `makeVoicesArray` (`data/abc_tune.js:428`). */
export interface VoiceElementRow {
  readonly top: number;
  readonly height: number;
  readonly line: number;
  readonly measureNumber: number;
  readonly elem: AbsoluteElementLike;
}

/** abcjs's `spacing.STEP` — one pitch, half a staff space. */
const PITCH_STEP_PX = STAFF_SPACE_PX / 2;

/**
 * **THE TYPES abcjs's VOICE CHILDREN CAN BE**, and the whole list: `createClef`,
 * `createKeySignature`, `createTimeSignature`, the note and rest builders, `createBarLine`,
 * the tempo and the part label. Ours puts PROSE — a title, a `%%text`, a subtitle — in the
 * same element stream, because the block rides the staff it is drawn above; abcjs keeps
 * those in `tune.lines` as non-music lines instead. Without this filter a title shifted
 * every row after it by one and 50 tunes reported a different row count.
 */
export const VOICE_CHILD_TYPES: ReadonlySet<string> = new Set([
  "clef",
  "keySignature",
  "timeSignature",
  "note",
  "rest",
  "bar",
  "tempo",
  "part",
]);

/**
 * abcjs's `durationForSpacing`, which is what an element's `duration` IS —
 * `duration * tripletmultiplier`, then two rest exceptions
 * (`abstract-engraver.js:802-806`):
 *
 *     if (elem.rest.type === 'multimeasure')           durationForSpacing = 1
 *     if (elem.rest.type === 'invisible-multimeasure') durationForSpacing = measureLength * text
 *
 * **SO `duration` AND `durationClass` PART COMPANY ON A `Z4`**, and only there: abcjs
 * reports 1 and 4 for the same element, because the bar-count rest is SPACED as one
 * measure and CLASSED as four. Measured on `synth-flattener-19`. Everywhere else the two
 * are the same number, tuplets included — `(3ABc` reports 1/12 twice.
 */
const spacingDurationOf = (element: LayoutElement): number => {
  const source = element.sourceEvent;
  if (
    element.type === "rest" &&
    source !== undefined &&
    (source as { kind?: string }).kind === "multiMeasure"
  )
    return 1;
  return element.durationClass ?? 0;
};

/**
 * **`getMinWidth(child)` IS A MAX OVER `dx + w`, MEASURED FROM THE ELEMENT'S OWN x** —
 * `max(child.dx + child.w)` over an absolute element's children
 * (`absolute-element.js`). For most elements that is the ink our layout already records as
 * `rodWidth`, and for a BARLINE it is a DECLARED number the drawing does not use
 * (`LayoutElement.minWidth`).
 *
 * **A DISPLACED CHORD IS THE THIRD CASE.** abcjs expresses a whole-chord shift as a
 * per-head `shiftheadx`, so both heads of `[ce]` under a down stem carry `dx = 14.985` and
 * `getMinWidth` is 29.97 — twice the head. Ours puts the same shift in the head's x and
 * measures the ink from THERE, which is 14.985. Measured on
 * `parse-tie-slur-03-staffwidth-200`, whose lower staff reports 29.97 on every note while
 * the two engines draw the heads at the same coordinates. So the width is taken back from
 * the DRAWN heads, which is abcjs's definition rather than a second guess at it.
 */
const minWidthOf = (element: LayoutElement): number => {
  const own = element.minWidth ?? element.rodWidth ?? element.width;
  if (element.minWidth !== undefined) return own;
  const glyphs = glyphsFor(true);
  let heads = 0;
  for (const g of element.glyphs) {
    if (g.role !== "notehead") continue;
    // **`dx + w`, abcjs'S OWN SUM** — the head's constructed offset within its element,
    // carrying both the seconds displacement and the voice-overlap shift. Deriving it as
    // `g.x - element.x` gets the magnitude right and the last bit wrong.
    heads = Math.max(heads, (g.dx ?? g.x - element.x) + glyphs.width(g.name));
  }
  /**
   * ⚠️ **AND `own` WINS ANY TIE, BECAUSE THE SUBTRACTION IS NOT abcjs'S SUM.** abcjs adds
   * `dx + w`; reading it back off the drawn head is `(g.x - element.x) + w`, which lands one
   * ULP away — `20.740000000000002` for its `20.74` — on the ordinary notes where the two
   * agree. So the head-derived width is taken only where it is genuinely WIDER.
   */
  return heads > own + 1e-9 ? heads : own;
};

const elemOf = (
  element: LayoutElement,
  index: ProjectionIndex,
): AbsoluteElementLike => {
  const abcelem = abcelemOf(element, index);
  const bag = (abcelem ?? {}) as Record<string, unknown>;
  return {
    type: ABCJS_ELEMENT_NAMES[element.type] ?? element.type,
    abcelem: abcelem ?? { el_type: element.type },
    x: element.x,
    // `getMinWidth` — see `minWidthOf`.
    w: minWidthOf(element),
    /**
     * **THE ELEMENT'S DURATION IS THE `durationClass`, NOT THE WRITTEN ONE.** Measured on
     * `(3ABc`: abcjs reports `duration` and `durationClass` both 1/12 while its
     * `abcelem.duration` is the written 0.125 — so a tuplet's element is timed at what it
     * is PLAYED, and `addElementToEvents` preferring `durationClass` is the same number
     * twice. Ours is byte-verified through the `abcjs-d…` classes.
     */
    duration: spacingDurationOf(element),
    durationClass: element.durationClass ?? 0,
    elemset: abcelem === undefined ? [] : [abcelem],
    ...(bag["startTie"] === undefined ? {} : { startTie: bag["startTie"] }),
  };
};

/**
 * `makeVoicesArray()` — one array per voice, ACROSS systems, keyed by the voice's index
 * within its staffgroup. That indexing is abcjs's own: `voicesArr[v]` where `v` counts the
 * voices of THIS line, so a voice that only appears on later systems shares an entry with
 * whatever held that index before it.
 *
 * **THE MEASURE COUNTER IS PER VOICE AND SKIPS A LEADING BARLINE** — "count the measures by
 * counting the bar lines, but skip a bar line that appears at the left of the music, before
 * any notes" (`:427-431`), which is why `noteFound` exists at all.
 */
export function makeVoicesArrayOf(
  doc: Layout,
  index: ProjectionIndex,
  lines: readonly AbcLine[],
): VoiceElementRow[][] {
  const out: VoiceElementRow[][] = [];
  const measureNumber: number[] = [];
  /** `group.line` is the index in `tune.lines`, not the system's own — see `geometryOf`. */
  const staffLines = lines
    .map((l, i) => (l.staff === undefined ? -1 : i))
    .filter((i) => i >= 0);
  doc.systems.forEach((system, systemIndex) => {
    const first = system.staves[0];
    const last = system.staves[system.staves.length - 1];
    if (first === undefined || last === undefined) return;
    const line = staffLines[systemIndex] ?? systemIndex;
    const top = first.absoluteY - system.firstTopPitch * PITCH_STEP_PX;
    const bottom = last.absoluteY - system.lastBottomPitch * PITCH_STEP_PX;
    const height = bottom - top;
    let v = 0;
    for (const staff of system.staves)
      for (const voice of staff.voices) {
        const rows = (out[v] ??= []);
        measureNumber[v] ??= 0;
        /**
         * ⚠️ **`noteFound` IS PER SYSTEM AND THE COUNT IS NOT.** abcjs declares it inside
         * the voice loop, which is inside the LINE loop (`data/abc_tune.js:414`), so a
         * barline standing at the head of a system — a repeat, or the bar a line opens
         * with — does not count, while the measure number carries on from the line above.
         * Ours kept it per voice for the whole tune and numbered 183 rows one too high.
         */
        let noteFound = false;
        for (const element of voice) {
          if (!VOICE_CHILD_TYPES.has(element.type)) continue;
          rows.push({
            top,
            height,
            line,
            measureNumber: measureNumber[v] ?? 0,
            elem: elemOf(element, index),
          });
          if (element.type === "bar" && noteFound)
            measureNumber[v] = (measureNumber[v] ?? 0) + 1;
          if (element.type === "note" || element.type === "rest") noteFound = true;
        }
        v += 1;
      }
  });
  return out;
}

/** One event of the hash `setupEvents` builds — abcjs's `eventHash["event" + ms]`. */
export interface TimingEvent {
  type: "event";
  milliseconds: number;
  line: number;
  measureNumber: number;
  top: number;
  height: number;
  left: number | null;
  width: number;
  elements: unknown[][];
  startChar: number | null;
  endChar: number | null;
  startCharArray: (number | null)[];
  endCharArray: (number | null)[];
  midiPitches?: unknown[];
  midiGraceNotePitches?: unknown[];
  measureStart?: boolean;
}

/**
 * `addElementToEvents(...)` — a LINE-BY-LINE port of `data/abc_tune.js:298-395`.
 *
 * Four rules that are abcjs's and would be wrong if intuited:
 *
 * - **A HINT ELEMENT IS SKIPPED WHOLE**, and returns no `nextIsBar` at all, so the caller's
 *   `nextIsBar` is cleared by the `undefined` it gets back.
 * - **A SPACER RESTS FOR ZERO**: `rest.type === "spacer"` sets the duration to 0 and so
 *   never opens an event, whatever its written length.
 * - **THE LEFTMOST ELEMENT WINS** when two voices land on the same millisecond, and only
 *   when the existing `left` is TRUTHY — a `left` of 0 is replaced rather than compared.
 * - **`nextIsBar` IS RETURNED, NOT SET**: `nextIsBar || element.type === 'bar'`, so a
 *   barline arms the NEXT event's `measureStart`.
 */
export function addElementToEvents(
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
): { isTiedState: number | undefined; duration: number; nextIsBar?: boolean } {
  if (element.hint === true) return { isTiedState: undefined, duration: 0 };
  const bag = element.abcelem as Record<string, unknown>;
  const rest = bag["rest"] as { type?: string } | undefined;
  let realDuration =
    element.durationClass !== undefined && element.durationClass !== 0
      ? element.durationClass
      : element.duration;
  if (rest?.type === "spacer") realDuration = 0;
  const key = `event${voiceTimeMilliseconds}`;
  const startChar = (bag["startChar"] ?? null) as number | null;
  const endChar = (bag["endChar"] ?? null) as number | null;
  const midiPitches = bag["midiPitches"] as unknown[] | undefined;
  const graceNotes = bag["midiGraceNotePitches"] as unknown[] | undefined;
  if (realDuration > 0) {
    const es = element.elemset.filter((e) => e !== null);
    const blank = (): TimingEvent => ({
      type: "event",
      milliseconds: voiceTimeMilliseconds,
      line,
      measureNumber,
      top,
      height,
      left: null,
      width: 0,
      elements: [],
      startChar: null,
      endChar: null,
      startCharArray: [],
      endCharArray: [],
    });
    const isTiedToNext = element.startTie !== undefined;
    if (isTiedState !== undefined) {
      // The tied note joins the event it is tied TO, not one of its own.
      (eventHash[`event${isTiedState}`] ??= blank()).elements.push(es);
      if (nextIsBar) {
        (eventHash[key] ??= blank()).measureStart = true;
        nextIsBar = false;
      }
      if (!isTiedToNext) isTiedState = undefined;
    } else {
      const existing = eventHash[key];
      if (existing === undefined) {
        eventHash[key] = {
          ...blank(),
          left: element.x,
          width: element.w,
          elements: [es],
          startChar,
          endChar,
          startCharArray: [startChar],
          endCharArray: [endChar],
          midiPitches: midiPitches === undefined ? [] : [...midiPitches],
          ...(graceNotes === undefined
            ? {}
            : { midiGraceNotePitches: [...graceNotes] }),
        };
      } else {
        existing.left =
          existing.left !== null && existing.left !== 0
            ? Math.min(existing.left, element.x)
            : element.x;
        existing.elements.push(es);
        existing.startCharArray.push(startChar);
        existing.endCharArray.push(endChar);
        if (existing.startChar === null) existing.startChar = startChar;
        if (existing.endChar === null) existing.endChar = endChar;
        if (midiPitches !== undefined && midiPitches.length > 0)
          (existing.midiPitches ??= []).push(...midiPitches);
        if (graceNotes !== undefined && graceNotes.length > 0)
          (existing.midiGraceNotePitches ??= []).push(...graceNotes);
      }
      const row = eventHash[key];
      if (nextIsBar && row !== undefined) {
        row.measureStart = true;
        nextIsBar = false;
      }
    }
  }
  return {
    isTiedState,
    duration: realDuration / timeDivider,
    nextIsBar: nextIsBar || element.type === "bar",
  };
}
