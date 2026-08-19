import { CreateSynthControl, type ControlElement } from "./synth-control.js";
import { activeAudioContext } from "./synth.js";
import { TimingCallbacks } from "./timing-callbacks.js";
import type { TuneObject } from "./index.js";
import type { NoteTiming } from "../audio/timing.js";
import type { LineEndTiming } from "./timing-callbacks.js";

/**
 * **`SynthController` — THE STATE MACHINE, WHICH MAKES NO SOUND OF ITS OWN.**
 *
 * A line-by-line port of `synth/synth-controller.js`. Everything audible happens one level
 * down in `CreateSynth`; this class decides WHEN — which is why it can be gated before that
 * class exists, by handing it a recording buffer instead (see `midiBufferFactory`).
 *
 * It drives three things that are already built here: `CreateSynthControl` (the transport
 * bar), `TimingCallbacks` (the cursor's clock, a closed gate) and `activeAudioContext`.
 *
 * Five details that are abcjs's and would be wrong if intuited:
 *
 * - ⚠️ **`afterResume: self.init` NAMES A METHOD THAT DOES NOT EXIST** (`:34`). There is no
 *   `init` on the controller, so a control the controller builds gets `undefined` and never
 *   runs an after-resume step. Reproduced by omitting the option.
 * - **`load` MUTATES the options object it is handed**, writing the `displayPlay` and
 *   `displayProgress` defaults back into the caller's object (`:22-27`).
 * - **`setTune` WITHOUT a user action never touches audio** — it resolves
 *   `{status: "no-audio-context"}`, because only a gesture may start a context (`:59-63`).
 * - **THE TIMER IS BUILT AFTER `prime()`**, on purpose: the callbacks read midi data that
 *   priming is what produces (`:94`).
 * - **`finished()` ANSWERS `"continue"` WHEN LOOPING** and nothing otherwise; that string is
 *   what `TimingCallbacks` reads to keep running.
 */

/** The `CreateSynth` surface the controller actually uses — nine calls and a duration. */
export interface MidiBuffer {
  duration?: number | undefined;
  init(options: {
    visualObj: TuneObject;
    options: unknown;
    millisecondsPerMeasure: number;
  }): Promise<unknown>;
  prime(): Promise<unknown>;
  start(): void;
  pause(): void;
  seek(position: number, units?: string): void;
  finished(): void;
  stop(): void;
  download(): string;
}

/** The host's cursor hooks — every one optional, every one checked for `typeof function`. */
export interface CursorControl {
  beatSubdivisions?: number | string;
  extraMeasuresAtBeginning?: number;
  lineEndAnticipation?: number;
  onReady?: (controller: SynthController) => void;
  onStart?: () => void;
  onFinished?: () => void;
  onBeat?: (
    beatNumber: number,
    totalBeats: number,
    totalTime: number,
    position: { left?: number; top?: number; height?: number },
  ) => void;
  onEvent?: (event: NoteTiming) => void;
  onLineEnd?: (
    lineEvent: LineEndTiming | undefined,
    leftEvent: NoteTiming | undefined,
  ) => void;
}

export interface SynthVisualOptions {
  displayLoop?: boolean;
  displayRestart?: boolean;
  displayPlay?: boolean;
  displayProgress?: boolean;
  displayWarp?: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const g = globalThis as { setTimeout?: (f: () => void, ms: number) => unknown };
    if (g.setTimeout === undefined) resolve();
    else g.setTimeout(() => resolve(), ms);
  });

/** Until `CreateSynth` is built, a host must hand one in. */
const noBuffer = (): MidiBuffer => {
  throw new Error(
    "abcts: CreateSynth is not built yet — pass a midi buffer factory to SynthController.",
  );
};

export class SynthController {
  warp = 100;
  cursorControl: CursorControl | null = null;
  visualObj: TuneObject | null = null;
  timer: TimingCallbacks | null = null;
  midiBuffer: MidiBuffer | null = null;
  options: unknown = null;
  currentTempo: number | null = null;
  control: CreateSynthControl | null = null;
  isLooping = false;
  isStarted = false;
  isLoaded = false;
  isLoading = false;
  /** ⚠️ abcjs leaves this UNDEFINED until `go()` or `setProgress` — and `_play` reads it. */
  percent: number | undefined = undefined;

  private readonly makeBuffer: () => MidiBuffer;

  constructor(midiBufferFactory: () => MidiBuffer = noBuffer) {
    this.makeBuffer = midiBufferFactory;
  }

  load = (
    selector: string | ControlElement,
    cursorControl?: CursorControl | null,
    visualOptions?: SynthVisualOptions,
  ): void => {
    const visual: SynthVisualOptions = visualOptions ?? {};
    if (visual.displayPlay === undefined) visual.displayPlay = true;
    if (visual.displayProgress === undefined) visual.displayProgress = true;
    this.control = new CreateSynthControl(selector, {
      ...(visual.displayLoop ? { loopHandler: this.toggleLoop } : {}),
      ...(visual.displayRestart ? { restartHandler: this.restart } : {}),
      ...(visual.displayPlay ? { playPromiseHandler: this.play } : {}),
      ...(visual.displayProgress ? { progressHandler: this.randomAccess } : {}),
      ...(visual.displayWarp ? { warpHandler: this.onWarp } : {}),
      // `afterResume: self.init` — and there is no `init`. See the class comment.
    });
    this.cursorControl = cursorControl ?? null;
    this.disable(true);
  };

  disable = (isDisabled: boolean): void => {
    if (this.control) this.control.disable(isDisabled);
  };

  setTune = (
    visualObj: TuneObject,
    userAction: boolean,
    audioParams?: unknown,
  ): Promise<unknown> => {
    this.visualObj = visualObj;
    this.disable(false);
    this.options = audioParams ? audioParams : {};

    if (this.control) {
      this.pause();
      this.setProgress(0, 1);
      this.control.resetAll();
      this.restart();
      this.isStarted = false;
    }
    this.isLooping = false;

    if (userAction) return this.go();
    return Promise.resolve({ status: "no-audio-context" });
  };

  go = (): Promise<unknown> => {
    this.isLoading = true;
    const visualObj = this.visualObj as TuneObject;
    const millisecondsPerMeasure =
      (visualObj.millisecondsPerMeasure() * 100) / this.warp;
    this.currentTempo = Math.round(
      (visualObj.getBeatsPerMeasure() / millisecondsPerMeasure) * 60000,
    );
    if (this.control) this.control.setTempo(this.currentTempo);
    this.percent = 0;
    let loadingResponse: unknown;

    if (!this.midiBuffer) this.midiBuffer = this.makeBuffer();
    const ac = activeAudioContext() as { resume: () => Promise<unknown> };
    return ac
      .resume()
      .then(() =>
        (this.midiBuffer as MidiBuffer).init({
          visualObj,
          options: this.options,
          millisecondsPerMeasure,
        }),
      )
      .then((response) => {
        loadingResponse = response;
        return (this.midiBuffer as MidiBuffer).prime();
      })
      .then(() => {
        let subdivisions = 16;
        const asked = Number.parseInt(
          String(this.cursorControl?.beatSubdivisions),
          10,
        );
        if (
          this.cursorControl &&
          this.cursorControl.beatSubdivisions !== undefined &&
          asked >= 1 &&
          asked <= 64
        )
          subdivisions = asked;

        // The timer is created AFTER priming so the midi data the callbacks read exists.
        this.timer = new TimingCallbacks(visualObj, {
          beatCallback: this.beatCallback,
          eventCallback: this.eventCallback,
          lineEndCallback: this.lineEndCallback,
          qpm: this.currentTempo as number,
          ...(this.cursorControl?.extraMeasuresAtBeginning === undefined
            ? {}
            : { extraMeasuresAtBeginning: this.cursorControl.extraMeasuresAtBeginning }),
          lineEndAnticipation: this.cursorControl
            ? (this.cursorControl.lineEndAnticipation ?? 0)
            : 0,
          beatSubdivisions: subdivisions,
        });
        if (typeof this.cursorControl?.onReady === "function")
          this.cursorControl.onReady(this);
        this.isLoaded = true;
        this.isLoading = false;
        return Promise.resolve({ status: "created", notesStatus: loadingResponse });
      });
  };

  destroy = (): void => {
    if (this.timer) {
      this.timer.reset();
      this.timer.stop();
      this.timer = null;
    }
    if (this.midiBuffer) {
      this.midiBuffer.stop();
      this.midiBuffer = null;
    }
    this.setProgress(0, 1);
    if (this.control) this.control.resetAll();
  };

  play = (): Promise<unknown> => this.runWhenReady(this._play, undefined);

  runWhenReady = (
    fn: (arg?: unknown) => Promise<unknown>,
    arg1?: unknown,
  ): Promise<unknown> => {
    if (!this.visualObj) return Promise.resolve({ status: "loading" });
    if (this.isLoading) {
      // Some other promise is waiting for the tune to be loaded, so just wait.
      return sleep(500).then(() => {
        if (this.isLoading) return this.runWhenReady(fn, arg1);
        return fn(arg1);
      });
    }
    if (!this.isLoaded) return this.go().then(() => fn(arg1));
    return fn(arg1);
  };

  _play = (): Promise<unknown> => {
    const ac = activeAudioContext() as { resume: () => Promise<unknown> };
    return ac.resume().then(() => {
      this.isStarted = !this.isStarted;
      if (this.isStarted) {
        if (typeof this.cursorControl?.onStart === "function")
          this.cursorControl.onStart();
        (this.midiBuffer as MidiBuffer).start();
        (this.timer as TimingCallbacks).start(this.percent);
        if (this.control) this.control.pushPlay(true);
      } else {
        this.pause();
      }
      return Promise.resolve({ status: "ok" });
    });
  };

  pause = (): void => {
    if (this.timer) {
      this.timer.pause();
      (this.midiBuffer as MidiBuffer).pause();
      if (this.control) this.control.pushPlay(false);
    }
  };

  toggleLoop = (): void => {
    this.isLooping = !this.isLooping;
    if (this.control) this.control.pushLoop(this.isLooping);
  };

  restart = (): void => {
    if (this.timer) {
      this.timer.setProgress(0);
      (this.midiBuffer as MidiBuffer).seek(0);
    }
  };

  randomAccess = (ev: unknown): Promise<unknown> =>
    this.runWhenReady(this._randomAccess as (a?: unknown) => Promise<unknown>, ev);

  /** The click's x against the bar's own box — abcjs reads `offsetWidth`, so an unlaid-out
   * DOM divides by zero and answers `Infinity`, which the clamp then takes to 1. */
  _randomAccess = (ev: unknown): Promise<unknown> => {
    const event = ev as {
      x: number;
      target: {
        classList: { contains(name: string): boolean };
        parentNode: unknown;
        getBoundingClientRect(): { left: number };
        offsetWidth: number;
      };
    };
    const background = (
      event.target.classList.contains("abcjs-midi-progress-indicator")
        ? event.target.parentNode
        : event.target
    ) as { getBoundingClientRect(): { left: number }; offsetWidth: number };
    let percent =
      (event.x - background.getBoundingClientRect().left) / background.offsetWidth;
    if (percent < 0) percent = 0;
    if (percent > 1) percent = 1;
    this.seek(percent);
    return Promise.resolve({ status: "ok" });
  };

  seek = (percent: number, units?: string): void => {
    if (this.timer && this.midiBuffer) {
      this.timer.setProgress(percent, units);
      this.midiBuffer.seek(percent, units);
    }
  };

  setWarp = (newWarp: number | string): Promise<unknown> => {
    if (Number.parseInt(String(newWarp), 10) > 0) {
      this.warp = Number.parseInt(String(newWarp), 10);
      const wasPlaying = this.isStarted;
      const startPercent = this.percent as number;
      this.destroy();
      this.isStarted = false;
      return this.go().then(() => {
        this.setProgress(
          startPercent,
          ((this.midiBuffer as MidiBuffer).duration as number) * 1000,
        );
        if (this.control)
          this.control.setWarp(this.currentTempo as number, this.warp);
        if (wasPlaying)
          return this.play().then(() => {
            this.seek(startPercent);
            return Promise.resolve();
          });
        this.seek(startPercent);
        return Promise.resolve();
      });
    }
    return Promise.resolve();
  };

  onWarp = (ev: unknown): Promise<unknown> =>
    this.setWarp((ev as { target: { value: string } }).target.value);

  setProgress = (percent: number, totalTime: number): void => {
    this.percent = percent;
    if (this.control) this.control.setProgress(percent, totalTime);
  };

  finished = (): string | undefined => {
    const timer = this.timer as TimingCallbacks;
    timer.reset();
    if (this.isLooping) {
      timer.start(0);
      (this.midiBuffer as MidiBuffer).finished();
      (this.midiBuffer as MidiBuffer).start();
      return "continue";
    }
    timer.stop();
    if (this.isStarted) {
      if (this.control) this.control.pushPlay(false);
      this.isStarted = false;
      (this.midiBuffer as MidiBuffer).finished();
      if (typeof this.cursorControl?.onFinished === "function")
        this.cursorControl.onFinished();
      this.setProgress(0, 1);
    }
    return undefined;
  };

  beatCallback = (
    beatNumber: number,
    totalBeats: number,
    totalTime: number,
    position: { left?: number; top?: number; height?: number },
  ): void => {
    const percent = beatNumber / totalBeats;
    this.setProgress(percent, totalTime);
    if (typeof this.cursorControl?.onBeat === "function")
      this.cursorControl.onBeat(beatNumber, totalBeats, totalTime, position);
  };

  eventCallback = (event: NoteTiming | null): unknown => {
    if (event) {
      if (typeof this.cursorControl?.onEvent === "function")
        this.cursorControl.onEvent(event);
      return undefined;
    }
    return this.finished();
  };

  lineEndCallback = (
    lineEvent: LineEndTiming | undefined,
    leftEvent: NoteTiming | undefined,
  ): void => {
    if (typeof this.cursorControl?.onLineEnd === "function")
      this.cursorControl.onLineEnd(lineEvent, leftEvent);
  };

  getUrl = (): string => (this.midiBuffer as MidiBuffer).download();

  download = (fileName?: string): void => {
    const url = this.getUrl();
    const doc = (globalThis as { document?: unknown }).document as {
      createElement(tag: string): {
        setAttribute(name: string, value: string): void;
        href: string;
        download: string;
        click(): void;
      };
      body: { appendChild(el: unknown): void; removeChild(el: unknown): void };
    };
    const link = doc.createElement("a");
    doc.body.appendChild(link);
    link.setAttribute("style", "display: none;");
    link.href = url;
    link.download = fileName ? fileName : "output.wav";
    link.click();
    (globalThis as { window?: { URL: { revokeObjectURL(u: string): void } } }).window?.URL.revokeObjectURL(
      url,
    );
    doc.body.removeChild(link);
  };
}
