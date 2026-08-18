import type { NoteTiming } from "../audio/timing.js";
import type { TuneObject } from "./index.js";

/**
 * **`TimingCallbacks` — THE CURSOR'S OWN STATE MACHINE.**
 *
 * A LINE-BY-LINE PORT of `api/abc_timing_callbacks.js`. A host hands it a tune and three
 * callbacks and drives it from an animation frame; it answers which EVENT is sounding,
 * which BEAT has arrived and where on the page the cursor belongs.
 *
 * **THE TIMER IS THE HOST'S AND THE STATE MACHINE IS OURS.** `doTiming(timestamp)` takes
 * the time as an argument, so everything but three globals — `requestAnimationFrame`,
 * `setTimeout` and `performance.now()` — is a pure function of a timestamp sequence. That
 * is what makes it gateable at all: abcjs's own tests for this drive a real timer and
 * `sleep()`, which the 2026-08-09 audit classified as unportable, and
 * `tests/timing-callbacks.test.ts` drives `doTiming` at a fixed 16ms instead.
 *
 * Everything it reads off the tune is built: `noteTimings` carries `left`, `top`, `height`
 * and `endX` since the geometry half landed, and `position.left` interpolates between an
 * event's `left` and its `endX` in proportion to how far into the event the clock is.
 */
export interface TimingCallbacksParams {
  readonly qpm?: number;
  readonly extraMeasuresAtBeginning?: number;
  readonly beatCallback?: (
    beatNumber: number,
    totalBeats: number,
    totalTime: number,
    position: { left?: number; top?: number; height?: number },
    debugInfo: Record<string, unknown>,
  ) => void;
  readonly eventCallback?: (event: NoteTiming | null) => unknown;
  readonly lineEndCallback?: (
    info: LineEndTiming | undefined,
    leftEvent: NoteTiming | undefined,
    extra: {
      line: number;
      endTimings: readonly LineEndTiming[];
      currentTime?: number;
    },
  ) => void;
  readonly lineEndAnticipation?: number;
  readonly beatSubdivisions?: number;
}

export interface LineEndTiming {
  readonly measureNumber?: number;
  readonly milliseconds: number;
  readonly top?: number;
  readonly bottom?: number;
}

/** The three host globals, read through `globalThis` so a Node caller does not crash. */
const raf = (fn: (t: number) => void): number => {
  const g = globalThis as { requestAnimationFrame?: (f: (t: number) => void) => number };
  return g.requestAnimationFrame === undefined ? 0 : g.requestAnimationFrame(fn);
};
const now = (): number => {
  const g = globalThis as { performance?: { now: () => number } };
  return g.performance === undefined ? 0 : g.performance.now();
};

/**
 * `getLineEndTimings` — one entry per LINE, at the moment its first event sounds less the
 * anticipation. The grouping key is `timing.top`, which is why the geometry had to exist
 * before this could (`abc_timing_callbacks.js:424-436`).
 */
function getLineEndTimings(
  timings: readonly NoteTiming[],
  anticipation: number,
): LineEndTiming[] {
  const callbackTimes: LineEndTiming[] = [];
  let lastTop: number | undefined;
  for (const timing of timings) {
    if (timing.type !== "end" && timing.top !== lastTop) {
      callbackTimes.push({
        ...(timing.measureNumber === undefined
          ? {}
          : { measureNumber: timing.measureNumber }),
        milliseconds: timing.milliseconds - anticipation,
        ...(timing.top === undefined ? {} : { top: timing.top }),
        ...(timing.top === undefined || timing.height === undefined
          ? {}
          : { bottom: timing.top + timing.height }),
      });
      lastTop = timing.top;
    }
  }
  return callbackTimes;
}

/** In general music doesn't need 60fps — abcjs's own compromise (`:295-297`). */
const JOGGING_INTERVAL = 60;

export class TimingCallbacks {
  qpm: number | null;
  extraMeasuresAtBeginning: number;
  beatCallback: TimingCallbacksParams["beatCallback"];
  eventCallback: TimingCallbacksParams["eventCallback"];
  lineEndCallback: TimingCallbacksParams["lineEndCallback"];
  lineEndAnticipation: number;
  beatSubdivisions: number;
  joggerTimer: number | null = null;

  noteTimings: NoteTiming[] = [];
  lineEndTimings: LineEndTiming[] = [];
  startTime: number | null = null;
  currentBeat = 0;
  currentEvent = 0;
  currentLine = 0;
  currentTime = 0;
  isPaused = false;
  isRunning = false;
  pausedPercent: number | null = null;
  justUnpaused = false;
  newSeekPercent = 0;
  lastTimestamp = 0;
  reportNext = false;
  millisecondsPerBeat = 0;
  lastMoment = 0;
  beatStarts: { b: number; ts: number }[] = [];
  totalBeats = 0;

  private readonly params: TimingCallbacksParams;

  constructor(target: TuneObject, params: TimingCallbacksParams = {}) {
    this.params = params;
    this.qpm = params.qpm ? Number.parseInt(String(params.qpm), 10) : null;
    this.extraMeasuresAtBeginning = params.extraMeasuresAtBeginning
      ? Number.parseInt(String(params.extraMeasuresAtBeginning), 10)
      : 0;
    this.beatCallback = params.beatCallback;
    this.eventCallback = params.eventCallback;
    this.lineEndCallback = params.lineEndCallback;
    this.lineEndAnticipation = params.lineEndAnticipation
      ? Number.parseInt(String(params.lineEndAnticipation), 10)
      : 0;
    this.beatSubdivisions = params.beatSubdivisions
      ? Number.parseInt(String(params.beatSubdivisions), 10)
      : 1;
    if (!this.beatSubdivisions) this.beatSubdivisions = 1;
    this.replaceTarget(target);
  }

  replaceTarget(newTarget: TuneObject): void {
    if (!this.params.qpm) this.qpm = newTarget.getBpm();
    this.noteTimings = newTarget.setTiming(
      this.qpm ?? undefined,
      this.extraMeasuresAtBeginning,
    );
    // **A TUNE THAT TIMES TO NOTHING IS RE-TIMED AT ZERO** (`:19-20`).
    if (newTarget.noteTimings.length === 0)
      this.noteTimings = newTarget.setTiming(0, 0);
    if (this.lineEndCallback)
      this.lineEndTimings = getLineEndTimings(
        newTarget.noteTimings,
        this.lineEndAnticipation,
      );
    this.startTime = null;
    this.currentBeat = 0;
    this.currentEvent = 0;
    this.currentLine = 0;
    this.currentTime = 0;
    this.isPaused = false;
    this.isRunning = false;
    this.pausedPercent = null;
    this.justUnpaused = false;
    this.newSeekPercent = 0;
    this.lastTimestamp = 0;
    if (this.noteTimings.length === 0) return;

    this.millisecondsPerBeat =
      1000 / ((this.qpm ?? 0) / 60) / this.beatSubdivisions;
    this.lastMoment =
      this.noteTimings[this.noteTimings.length - 1]?.milliseconds ?? 0;

    /**
     * **AN IRREGULAR METER'S BEAT IS NOT A PULSE.** `M: 2+3/8` makes the internal beat half
     * as long and reports the callback at the WRITTEN pattern — 0, 0.5, 1, 1.33, 1.67 for
     * two subdivisions — so the beat number counts up by one whatever the grouping
     * (`:44-100`).
     */
    const meter = newTarget.getMeter() as {
      type?: string;
      value?: readonly { num: string }[];
    };
    let irregularMeter = "";
    if (
      meter &&
      meter.type === "specified" &&
      meter.value &&
      meter.value.length > 0 &&
      (meter.value[0]?.num.indexOf("+") ?? -1) > 0
    )
      irregularMeter = meter.value[0]?.num ?? "";
    this.beatStarts = [];
    if (irregularMeter) {
      const measureLength =
        this.noteTimings[this.noteTimings.length - 1]?.millisecondsPerMeasure ?? 0;
      const numMeasures = this.lastMoment / measureLength;
      // …and the halves are because these numbers are EIGHTHS where a beat is a quarter.
      const parts = irregularMeter
        .split("+")
        .map((p) => Number.parseInt(p, 10) / 2);
      let currentTs = 0;
      let beatNumber = 0;
      for (let measureNumber = 0; measureNumber < numMeasures; measureNumber += 1) {
        const measureStartTs = measureNumber * measureLength;
        let subBeatCounter = 0;
        for (const beatLength of parts) {
          if (this.beatSubdivisions === 1) {
            if (currentTs < this.lastMoment)
              this.beatStarts.push({ b: beatNumber, ts: currentTs });
            currentTs += beatLength * this.millisecondsPerBeat;
          } else {
            const numDivisions = beatLength * this.beatSubdivisions;
            for (let k = 0; k < Math.floor(numDivisions); k += 1) {
              const subBeat = k / numDivisions;
              const ts = Math.round(
                measureStartTs + subBeatCounter * this.millisecondsPerBeat,
              );
              if (ts < this.lastMoment)
                this.beatStarts.push({ b: beatNumber + subBeat, ts });
              subBeatCounter += 1;
            }
          }
          beatNumber += 1;
        }
      }
      this.beatStarts.push({
        b: numMeasures * parts.length,
        ts: this.lastMoment,
      });
      this.totalBeats = this.beatStarts.length;
    } else {
      this.totalBeats = Math.round(this.lastMoment / this.millisecondsPerBeat);
      // Add one so the last beat is the last moment.
      for (let j = 0; j < this.totalBeats + 1; j += 1)
        this.beatStarts.push({
          b: j / this.beatSubdivisions,
          ts: Math.round(j * this.millisecondsPerBeat),
        });
    }
  }

  doTiming = (timestamp: number): void => {
    // Multiple seeks can produce two callbacks for the same instant (`:114-118`).
    if (this.lastTimestamp === timestamp) return;
    this.lastTimestamp = timestamp;
    if (this.isPaused || !this.isRunning) return;
    if (!this.startTime) this.startTime = timestamp;
    this.currentTime = timestamp - this.startTime;
    // "Add a little slop because this function isn't called exactly."
    this.currentTime += 16;
    while (
      this.noteTimings.length > this.currentEvent &&
      (this.noteTimings[this.currentEvent]?.milliseconds ?? 0) < this.currentTime
    ) {
      const row = this.noteTimings[this.currentEvent];
      if (this.eventCallback && row?.type === "event") {
        // The event callback can seek and move the position from beneath us.
        const thisStartTime: number | null = this.startTime;
        this.eventCallback(row);
        if (thisStartTime !== this.startTime)
          this.currentTime = timestamp - (this.startTime ?? 0);
      }
      this.currentEvent += 1;
    }
    if (
      this.lineEndCallback &&
      this.lineEndTimings.length > this.currentLine &&
      (this.lineEndTimings[this.currentLine]?.milliseconds ?? 0) < this.currentTime &&
      this.currentEvent < this.noteTimings.length
    ) {
      const leftEvent =
        this.noteTimings[this.currentEvent]?.milliseconds === this.currentTime
          ? this.noteTimings[this.currentEvent]
          : this.noteTimings[this.currentEvent - 1];
      this.lineEndCallback(this.lineEndTimings[this.currentLine], leftEvent, {
        line: this.currentLine,
        endTimings: this.lineEndTimings,
        currentTime: this.currentTime,
      });
      this.currentLine += 1;
    }
    if (this.currentTime < this.lastMoment) {
      raf(this.doTiming);
      if (
        this.currentBeat < this.beatStarts.length &&
        (this.beatStarts[this.currentBeat]?.ts ?? 0) <= this.currentTime
      ) {
        const ret = this.doBeatCallback(timestamp);
        this.currentBeat += 1;
        if (ret !== null) this.currentTime = ret;
      }
    } else if (this.currentBeat <= this.totalBeats) {
      // A background tab can starve the frames; keep reporting until every beat is out.
      if (this.beatCallback) {
        const ret2 = this.doBeatCallback(timestamp);
        this.currentBeat += 1;
        if (ret2 !== null) this.currentTime = ret2;
        raf(this.doTiming);
      }
    }
    if (this.currentTime >= this.lastMoment) {
      if (this.eventCallback) {
        // At the end the callback may return "continue" — or a promise for it — to keep
        // the machine running (`:159-172`).
        const promise = this.eventCallback(null);
        void this.shouldStop(promise).then((shouldStop) => {
          if (shouldStop) this.stop();
        });
      } else this.stop();
    }
  };

  shouldStop(promise: unknown): Promise<boolean> {
    return new Promise((resolve) => {
      if (!promise) return resolve(true);
      if (promise === "continue") return resolve(false);
      const then = (promise as { then?: (f: (r: unknown) => void) => void }).then;
      if (typeof then === "function")
        then.call(promise, (result: unknown) => resolve(result !== "continue"));
      else resolve(true);
    });
  }

  doBeatCallback(timestamp: number): number | null {
    if (!this.beatCallback) return null;
    /**
     * ⚠️ **`skipTies` TESTS `=== null`, AND THE `end` ROW'S `left` IS `undefined`.**
     * `while (next < length && noteTimings[next].left === null) next++` (`:193-194`) —
     * a tie's continuation carries an explicit `null` and is skipped; the END row carries
     * no `left` KEY at all and is NOT, which is what gives the final beat callback an
     * `endMs` and therefore a cursor position. Coercing the two together with `?? null`
     * left the last beat of every tune with an empty `position`.
     */
    let next = this.currentEvent;
    while (next < this.noteTimings.length && this.noteTimings[next]?.left === null)
      next += 1;
    let endMs: number | undefined;
    let ev: NoteTiming | undefined;
    if (next < this.noteTimings.length) {
      endMs = this.noteTimings[next]?.milliseconds;
      next = Math.max(0, this.currentEvent - 1);
      while (next >= 0 && this.noteTimings[next]?.left === null) next -= 1;
      ev = this.noteTimings[next];
    }
    const position: { left?: number; top?: number; height?: number } = {};
    let debugInfo: Record<string, unknown> = {};
    if (ev) {
      if (ev.top !== undefined) position.top = ev.top;
      if (ev.height !== undefined) position.height = ev.height;
      /**
       * **THE CURSOR'S X IS AN INTERPOLATION** — how far into this event the clock is,
       * scaled by the pixels between it and the next (`:220-228`). `ev.endX` is what
       * `addEndPoints` computed and is the reason the geometry half had to land first.
       */
      const offMs = Math.max(0, timestamp - (this.startTime ?? 0) - ev.milliseconds);
      const gapMs = (endMs ?? 0) - ev.milliseconds;
      const gapPx = (ev.endX ?? 0) - (ev.left ?? 0);
      const offPx = gapMs ? (offMs * gapPx) / gapMs : 0;
      position.left = (ev.left ?? 0) + offPx;
      // Before the first event — the "prep beats" case — there is no x at all.
      if (this.currentEvent === 0 && ev.milliseconds > timestamp - (this.startTime ?? 0))
        delete position.left;
      debugInfo = {
        timestamp,
        startTime: this.startTime,
        ev,
        endMs,
        offMs,
        offPx,
        gapMs,
        gapPx,
      };
    } else debugInfo = { timestamp, startTime: this.startTime };

    const start = this.beatStarts[this.currentBeat];
    if (this.currentBeat < 0 || this.currentBeat >= this.beatStarts.length || !start) {
      // abcjs throws this out of band "so that everything else continues working"; ours
      // does the same rather than reporting a beat it cannot name.
      return null;
    }
    const thisStartTime: number | null = this.startTime;
    this.beatCallback(
      start.b,
      this.totalBeats / this.beatSubdivisions,
      this.lastMoment,
      position,
      debugInfo,
    );
    if (thisStartTime !== this.startTime)
      return timestamp - (this.startTime ?? 0);
    return null;
  }

  animationJogger = (): void => {
    if (this.isRunning) {
      this.doTiming(now());
      this.joggerTimer = this.setJogger();
    }
  };

  private setJogger(): number {
    const g = globalThis as {
      setTimeout?: (f: () => void, ms: number) => unknown;
    };
    if (g.setTimeout === undefined) return 0;
    return g.setTimeout(this.animationJogger, JOGGING_INTERVAL) as unknown as number;
  }

  start(offsetPercent?: number, units?: string): void {
    this.isRunning = true;
    if (this.isPaused) {
      this.isPaused = false;
      if (offsetPercent === undefined) this.justUnpaused = true;
    }
    if (offsetPercent) this.setProgress(offsetPercent, units);
    else if (offsetPercent === 0) this.reset();
    else if (this.pausedPercent !== null) {
      const at = now();
      this.currentTime = this.lastMoment * this.pausedPercent;
      this.startTime = at - this.currentTime;
      this.pausedPercent = null;
      this.reportNext = true;
    }
    raf(this.doTiming);
    this.joggerTimer = this.setJogger();
  }

  pause(): void {
    this.isPaused = true;
    const at = now();
    this.pausedPercent = (at - (this.startTime ?? 0)) / this.lastMoment;
    this.isRunning = false;
    if (this.joggerTimer) {
      const g = globalThis as { clearTimeout?: (id: number) => void };
      g.clearTimeout?.(this.joggerTimer);
      this.joggerTimer = null;
    }
  }

  currentMillisecond(): number {
    return this.currentTime;
  }

  reset(): void {
    this.currentBeat = 0;
    this.currentEvent = 0;
    this.currentLine = 0;
    this.startTime = null;
    this.pausedPercent = null;
  }

  stop(): void {
    this.pause();
    this.reset();
  }

  setProgress(position: number, units?: string): void {
    // The effect is to MOVE `startTime` so the callbacks land correctly for the new seek.
    let percent: number;
    switch (units) {
      case "seconds":
        this.currentTime = position * 1000;
        if (this.currentTime < 0) this.currentTime = 0;
        if (this.currentTime > this.lastMoment) this.currentTime = this.lastMoment;
        percent = this.currentTime / this.lastMoment;
        break;
      case "beats":
        this.currentTime =
          position * this.millisecondsPerBeat * this.beatSubdivisions;
        if (this.currentTime < 0) this.currentTime = 0;
        if (this.currentTime > this.lastMoment) this.currentTime = this.lastMoment;
        percent = this.currentTime / this.lastMoment;
        break;
      default:
        percent = position;
        if (percent < 0) percent = 0;
        if (percent > 1) percent = 1;
        this.currentTime = this.lastMoment * percent;
        break;
    }
    if (!this.isRunning) this.pausedPercent = percent;
    const at = now();
    this.startTime = at - this.currentTime;
    this.currentEvent = 0;
    while (
      this.noteTimings.length > this.currentEvent &&
      (this.noteTimings[this.currentEvent]?.milliseconds ?? 0) < this.currentTime
    )
      this.currentEvent += 1;
    if (this.lineEndCallback) {
      this.currentLine = 0;
      while (
        this.lineEndTimings.length > this.currentLine &&
        (this.lineEndTimings[this.currentLine]?.milliseconds ?? 0) +
          this.lineEndAnticipation <
          this.currentTime
      )
        this.currentLine += 1;
    }
    const oldBeat = this.currentBeat;
    for (
      this.currentBeat = 0;
      this.currentBeat < this.beatStarts.length;
      this.currentBeat += 1
    )
      if ((this.beatStarts[this.currentBeat]?.ts ?? 0) > this.currentTime) break;
    this.currentBeat -= 1;
    if (this.beatCallback && oldBeat !== this.currentBeat) {
      // A seek that changed the beat reports it immediately.
      this.doBeatCallback((this.startTime ?? 0) + this.currentTime);
      this.currentBeat += 1;
    }
    if (
      this.eventCallback &&
      this.currentEvent >= 0 &&
      this.noteTimings[this.currentEvent]?.type === "event"
    )
      this.eventCallback(this.noteTimings[this.currentEvent] ?? null);
    if (this.lineEndCallback)
      this.lineEndCallback(
        this.lineEndTimings[this.currentLine],
        this.noteTimings[this.currentEvent],
        { line: this.currentLine, endTimings: this.lineEndTimings },
      );
    this.joggerTimer = this.setJogger();
  }
}
