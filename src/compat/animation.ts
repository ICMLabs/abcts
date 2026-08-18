import { TimingCallbacks } from "./timing-callbacks.js";
import type { TuneObject } from "./index.js";
import type { NoteTiming } from "../audio/timing.js";

/**
 * **`startAnimation` / `pauseAnimation` / `stopAnimation` — THE CURSOR, DRAWN.**
 *
 * A LINE-BY-LINE PORT of `api/abc_animation.js`. It is `TimingCallbacks` plus a `<div>`:
 * the timer reports each event, and this moves an absolutely-positioned cursor over the
 * rendered SVG and — optionally — hides the measures before or after the one playing.
 *
 * **THE TIMER IS MODULE STATE, AND THAT IS abcjs's OWN SHAPE.** One animation at a time
 * per page; `startAnimation` stops any previous one, `pauseAnimation(true)` pauses it and
 * `pauseAnimation(false)` restarts it. A host that wants two runs its own
 * `TimingCallbacks`.
 *
 * Three details that are abcjs's and easy to lose:
 *
 * - **THE CURSOR IS FOUND BEFORE IT IS MADE.** `paper.querySelector('.abcjs-cursor')` — so
 *   a second `startAnimation` on the same paper reuses the element rather than stacking
 *   them — and creating it also sets `paper.style.position = 'relative'`, without which an
 *   absolutely-positioned child would be placed against the page.
 * - **THE MEASURE SELECTOR IS BUILT FROM THE EVENT'S OWN `line` AND `measureNumber`** —
 *   `.abcjs-l<line>.abcjs-m<measure>`, which is why the `add_classes` markup and the
 *   timing row's geometry are the same contract.
 * - **A `null` EVENT STOPS THE TIMER**, because that is what the event callback is handed
 *   at the end of the tune.
 */
export interface AnimationOptions {
  readonly bpm?: number;
  readonly showCursor?: boolean;
  readonly hideCurrentMeasure?: boolean;
  readonly hideFinishedMeasures?: boolean;
}

/** The DOM surface this needs — narrow on purpose, so a Node host can supply a stub. */
interface Paper {
  querySelector(selector: string): CursorElement | null;
  querySelectorAll(selector: string): ArrayLike<CursorElement>;
  appendChild(child: CursorElement): void;
  style: Record<string, string>;
}
interface CursorElement {
  className: string;
  style: Record<string, string>;
  classList: { contains(name: string): boolean };
}

let timer: TimingCallbacks | undefined;
let cursor: CursorElement | null | undefined;

export function startAnimation(
  paper: Paper,
  tune: TuneObject,
  options: AnimationOptions = {},
): void {
  if (timer) {
    timer.stop();
    timer = undefined;
  }
  if (options.showCursor) {
    cursor = paper.querySelector(".abcjs-cursor");
    if (!cursor) {
      const doc = (globalThis as { document?: { createElement(t: string): CursorElement } })
        .document;
      if (doc !== undefined) {
        cursor = doc.createElement("DIV");
        cursor.className = "abcjs-cursor cursor";
        cursor.style["position"] = "absolute";
        paper.appendChild(cursor);
        paper.style["position"] = "relative";
      }
    }
  }

  const hideMeasures = (elements: ArrayLike<CursorElement>): void => {
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      if (element && !element.classList.contains("abcjs-bar"))
        element.style["display"] = "none";
    }
  };

  let lastMeasure: string | undefined;
  const disappearMeasuresAfter = (selector: string): void => {
    if (lastMeasure) hideMeasures(paper.querySelectorAll(lastMeasure));
    lastMeasure = selector;
  };
  const disappearMeasuresBefore = (selector: string): void => {
    hideMeasures(paper.querySelectorAll(selector));
  };
  const measureCallback = (selector: string): void => {
    if (options.hideCurrentMeasure) disappearMeasuresBefore(selector);
    else if (options.hideFinishedMeasures) disappearMeasuresAfter(selector);
  };
  const getLineAndMeasure = (element: NoteTiming): string =>
    `.abcjs-l${element.line}.abcjs-m${element.measureNumber}`;

  const setCursor = (range: NoteTiming | null): void => {
    if (range) {
      if (range.measureStart) {
        const selector = getLineAndMeasure(range);
        if (selector) measureCallback(selector);
      }
      if (cursor) {
        cursor.style["left"] = `${range.left}px`;
        cursor.style["top"] = `${range.top}px`;
        cursor.style["width"] = `${range.width}px`;
        cursor.style["height"] = `${range.height}px`;
      }
    } else {
      timer?.stop();
      timer = undefined;
    }
  };

  timer = new TimingCallbacks(tune, {
    ...(options.bpm === undefined ? {} : { qpm: options.bpm }),
    eventCallback: setCursor,
  });
  timer.start();
}

export function pauseAnimation(pause: boolean): void {
  if (timer) {
    if (pause) timer.pause();
    else timer.start();
  }
}

export function stopAnimation(): void {
  if (timer) {
    timer.stop();
    timer = undefined;
  }
}

/** The running timer, for a gate that has to drive it — abcjs keeps it module-private. */
export const animationTimer = (): TimingCallbacks | undefined => timer;
