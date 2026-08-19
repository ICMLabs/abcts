import {
  LOADING_IMAGE,
  LOOP_IMAGE,
  PAUSE_IMAGE,
  PLAY_IMAGE,
  RESET_IMAGE,
} from "./synth-control-images.js";
import {
  activeAudioContext,
  registerAudioContext,
  supportsAudio,
} from "./synth.js";

/**
 * **`CreateSynthControl` — THE TRANSPORT BAR, WHICH IS DOM AND NOTHING ELSE.**
 *
 * A line-by-line port of `synth/create-synth-control.js`. It writes a `<div
 * class="abcjs-inline-audio">` of buttons into a parent, attaches a click handler to each,
 * and exposes seven setters a controller drives it with. **No audio passes through it** —
 * the only thing it knows about an AudioContext is that a click may have to RESUME one,
 * which is the browser's user-gesture rule and is why every handler goes through
 * `acResumerMiddleWare`.
 *
 * That is what makes it the one of the four sound-making symbols that can be gated in
 * Node: a jsdom page, the markup compared character for character across the option shapes,
 * and the clicks driven to see which handler fires and which class lands.
 *
 * Four details that are abcjs's and would be wrong if intuited:
 *
 * - **WHICH BUTTONS EXIST IS DECIDED BY WHICH HANDLERS WERE PASSED** — `hasLoop` is
 *   `!!options.loopHandler`, and so on down. The CLOCK is the exception: it is present
 *   unless `hasClock` is exactly `false`.
 * - **THE CSS WARNING IS ALWAYS WRITTEN**, styled inline, and is removed by the stylesheet
 *   rather than by the code.
 * - **A PROMISE HANDLER TAKES THE LOADING CLASS OFF WHEN IT RESOLVES**, where a plain one
 *   loses it immediately after the call (`doNext`).
 * - **`setProgress` READS `clientWidth`**, so the thumb only moves in a laid-out DOM; jsdom
 *   reports 0 and the thumb stays at 0px, which is what the gate records.
 */

/** The DOM this needs — as little of it as the port touches. */
export interface ControlElement {
  innerHTML: string;
  clientWidth: number;
  value: string;
  style: Record<string, string>;
  classList: {
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  };
  querySelector(selector: string): ControlElement | null;
  querySelectorAll(selector: string): ArrayLike<ControlElement>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface SynthControlOptions {
  readonly ac?: { state?: string; resume?: () => Promise<unknown> };
  readonly loopHandler?: (event: unknown) => void;
  readonly restartHandler?: (event: unknown) => void;
  readonly playHandler?: (event: unknown) => void;
  readonly playPromiseHandler?: (event: unknown) => Promise<unknown>;
  readonly progressHandler?: (event: unknown) => void;
  readonly warpHandler?: (event: unknown) => void;
  readonly afterResume?: () => Promise<unknown>;
  readonly hasClock?: boolean;
  readonly repeatTitle?: string;
  readonly repeatAria?: string;
  readonly restartTitle?: string;
  readonly restartAria?: string;
  readonly playTitle?: string;
  readonly playAria?: string;
  readonly randomTitle?: string;
  readonly randomAria?: string;
  readonly warpTitle?: string;
  readonly warpAria?: string;
  readonly bpm?: string;
}

/** `buildDom` — the markup, whole (`create-synth-control.js:113-148`). */
const buildDom = (parent: ControlElement, options: SynthControlOptions): void => {
  const hasLoop = !!options.loopHandler;
  const hasRestart = !!options.restartHandler;
  const hasPlay = !!options.playHandler || !!options.playPromiseHandler;
  const hasProgress = !!options.progressHandler;
  const hasWarp = !!options.warpHandler;
  const hasClock = options.hasClock !== false;

  let html = '<div class="abcjs-inline-audio">\n';
  if (hasLoop) {
    const repeatTitle = options.repeatTitle
      ? options.repeatTitle
      : "Click to toggle play once/repeat.";
    const repeatAria = options.repeatAria ? options.repeatAria : repeatTitle;
    html += `<button type="button" class="abcjs-midi-loop abcjs-btn" title="${repeatTitle}" aria-label="${repeatAria}">${LOOP_IMAGE}</button>\n`;
  }
  if (hasRestart) {
    const restartTitle = options.restartTitle
      ? options.restartTitle
      : "Click to go to beginning.";
    const restartAria = options.restartAria ? options.restartAria : restartTitle;
    html += `<button type="button" class="abcjs-midi-reset abcjs-btn" title="${restartTitle}" aria-label="${restartAria}">${RESET_IMAGE}</button>\n`;
  }
  if (hasPlay) {
    const playTitle = options.playTitle ? options.playTitle : "Click to play/pause.";
    const playAria = options.playAria ? options.playAria : playTitle;
    html += `<button type="button" class="abcjs-midi-start abcjs-btn" title="${playTitle}" aria-label="${playAria}">${PLAY_IMAGE}${PAUSE_IMAGE}${LOADING_IMAGE}</button>\n`;
  }
  if (hasProgress) {
    const randomTitle = options.randomTitle
      ? options.randomTitle
      : "Click to change the playback position.";
    const randomAria = options.randomAria ? options.randomAria : randomTitle;
    html += `<button type="button" class="abcjs-midi-progress-background" title="${randomTitle}" aria-label="${randomAria}"><span class="abcjs-midi-progress-indicator"></span></button>\n`;
  }
  if (hasClock) html += '<span class="abcjs-midi-clock"></span>\n';
  if (hasWarp) {
    const warpTitle = options.warpTitle
      ? options.warpTitle
      : "Change the playback speed.";
    const warpAria = options.warpAria ? options.warpAria : warpTitle;
    const bpm = options.bpm ? options.bpm : "BPM";
    html += `<span class="abcjs-tempo-wrapper"><label><input class="abcjs-midi-tempo" type="number" min="1" max="300" value="100" title="${warpTitle}" aria-label="${warpAria}">%</label><span>&nbsp;(<span class="abcjs-midi-current-tempo"></span> ${bpm})</span></span>\n`;
  }
  html +=
    '<div class="abcjs-css-warning" style="font-size: 12px;color:red;border: 1px solid red;text-align: center;width: 300px;margin-top: 4px;font-weight: bold;border-radius: 4px;">CSS required: load abcjs-audio.css</div>';
  html += "</div>\n";
  parent.innerHTML = html;
};

/** `doNext` — a promise handler clears the loading class when it RESOLVES. */
const doNext = (
  next: (event: unknown) => unknown,
  event: unknown,
  playBtn: ControlElement | null,
  isPromise: boolean,
): void => {
  if (isPromise) {
    void (next(event) as Promise<unknown>).then(() => {
      if (playBtn) playBtn.classList.remove("abcjs-loading");
    });
  } else {
    next(event);
    if (playBtn) playBtn.classList.remove("abcjs-loading");
  }
};

/**
 * `acResumerMiddleWare` — **EVERY CLICK GOES THROUGH THE AUDIO CONTEXT FIRST.** A browser
 * only lets a context start inside a user gesture, so the control registers or resumes one
 * and runs the handler after (`create-synth-control.js:160-186`). It THROWS a plain object
 * — `{status, message}`, not an `Error` — when audio is unsupported.
 */
const acResumerMiddleWare = (
  next: ((event: unknown) => unknown) | undefined,
  event: unknown,
  playBtn: ControlElement | null,
  afterResume: (() => Promise<unknown>) | undefined,
  isPromise = false,
): void => {
  if (next === undefined) return;
  let needsInit = true;
  const context = activeAudioContext() as { state?: string; resume?: () => Promise<unknown> } | null;
  if (!context) registerAudioContext();
  else needsInit = context.state === "suspended";
  if (!supportsAudio())
    throw {
      status: "NotSupported",
      message: "This browser does not support audio.",
    };

  if ((needsInit || isPromise) && playBtn) playBtn.classList.add("abcjs-loading");

  const active = activeAudioContext() as { resume?: () => Promise<unknown> } | null;
  if (needsInit && active?.resume !== undefined) {
    void active.resume().then(() => {
      if (afterResume !== undefined)
        void afterResume().then(() => {
          doNext(next, event, playBtn, isPromise);
        });
      else doNext(next, event, playBtn, isPromise);
    });
  } else {
    doNext(next, event, playBtn, isPromise);
  }
};

const attachListeners = (self: CreateSynthControl): void => {
  const options = self.options;
  const playBtn = self.parent.querySelector(".abcjs-midi-start");
  if (options.loopHandler)
    self.parent
      .querySelector(".abcjs-midi-loop")
      ?.addEventListener("click", (ev) => {
        acResumerMiddleWare(options.loopHandler, ev, playBtn, options.afterResume);
      });
  if (options.restartHandler)
    self.parent
      .querySelector(".abcjs-midi-reset")
      ?.addEventListener("click", (ev) => {
        acResumerMiddleWare(options.restartHandler, ev, playBtn, options.afterResume);
      });
  if (options.playHandler || options.playPromiseHandler)
    playBtn?.addEventListener("click", (ev) => {
      acResumerMiddleWare(
        options.playPromiseHandler ?? options.playHandler,
        ev,
        playBtn,
        options.afterResume,
        !!options.playPromiseHandler,
      );
    });
  if (options.progressHandler)
    self.parent
      .querySelector(".abcjs-midi-progress-background")
      ?.addEventListener("click", (ev) => {
        acResumerMiddleWare(options.progressHandler, ev, playBtn, options.afterResume);
      });
  if (options.warpHandler)
    self.parent
      .querySelector(".abcjs-midi-tempo")
      ?.addEventListener("change", (ev) => {
        acResumerMiddleWare(options.warpHandler, ev, playBtn, options.afterResume);
      });
};

export class CreateSynthControl {
  readonly parent: ControlElement;
  readonly options: SynthControlOptions;

  constructor(parent: string | ControlElement, options?: SynthControlOptions) {
    // A STRING IS A SELECTOR, not an id — `document.querySelector` (`:14-20`), and a miss
    // is an Error rather than a silent no-op.
    if (typeof parent === "string") {
      const doc = (
        globalThis as { document?: { querySelector(s: string): ControlElement | null } }
      ).document;
      const found = doc?.querySelector(parent) ?? null;
      if (found === null)
        throw new Error(`Cannot find element "${parent}" in the DOM.`);
      this.parent = found;
    } else this.parent = parent;
    this.options = options ? { ...options } : {};

    if (this.options.ac) registerAudioContext(this.options.ac);
    buildDom(this.parent, this.options);
    attachListeners(this);

    if (this.options.afterResume) {
      const ac = this.options.ac;
      const active = activeAudioContext() as { state?: string } | null;
      const isResumed = ac
        ? ac.state !== "suspended"
        : active
          ? active.state !== "suspended"
          : false;
      if (isResumed) void this.options.afterResume();
    }
  }

  disable(isDisabled: boolean): void {
    const el = this.parent.querySelector(".abcjs-inline-audio");
    if (isDisabled) el?.classList.add("abcjs-disabled");
    else el?.classList.remove("abcjs-disabled");
  }

  /**
   * ⚠️ **`setWarp` DOES NOT NULL-CHECK WHERE `setTempo` DOES** (`:48-52`): with no warp
   * input in the bar it throws `Cannot set properties of null`. Reproduced rather than
   * guarded — a control built without `warpHandler` and driven by a host that calls this
   * crashes in abcjs, and the gate records the throw as a step of its own.
   */
  setWarp(tempo: number, warp: number): void {
    const el = this.parent.querySelector(".abcjs-midi-tempo");
    (el as ControlElement).value = String(Math.round(warp));
    this.setTempo(tempo);
  }

  setTempo(tempo: number): void {
    const el = this.parent.querySelector(".abcjs-midi-current-tempo");
    if (el) el.innerHTML = String(Math.round(tempo));
  }

  resetAll(): void {
    const pushed = this.parent.querySelectorAll(".abcjs-pushed");
    for (let i = 0; i < pushed.length; i += 1)
      pushed[i]?.classList.remove("abcjs-pushed");
  }

  pushPlay(push: boolean): void {
    const startButton = this.parent.querySelector(".abcjs-midi-start");
    if (!startButton) return;
    if (push) startButton.classList.add("abcjs-pushed");
    else startButton.classList.remove("abcjs-pushed");
  }

  pushLoop(push: boolean): void {
    const loopButton = this.parent.querySelector(".abcjs-midi-loop");
    if (!loopButton) return;
    if (push) loopButton.classList.add("abcjs-pushed");
    else loopButton.classList.remove("abcjs-pushed");
  }

  /**
   * **THE THUMB IS PLACED IN PIXELS OFF `clientWidth`**, so an unlaid-out DOM leaves it at
   * 0 — and the CLOCK is `minutes:seconds` of `totalTime * percent`, floored, with the
   * seconds zero-padded (`:143-162`).
   */
  setProgress(percent: number, totalTime: number): void {
    const background = this.parent.querySelector(".abcjs-midi-progress-background");
    const thumb = this.parent.querySelector(".abcjs-midi-progress-indicator");
    if (!background || !thumb) return;
    const width = background.clientWidth;
    thumb.style["left"] = `${width * percent}px`;

    const clock = this.parent.querySelector(".abcjs-midi-clock");
    if (clock) {
      const totalSeconds = (totalTime * percent) / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      clock.innerHTML = `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
    }
  }
}
