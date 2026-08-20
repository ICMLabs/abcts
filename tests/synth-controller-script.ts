/**
 * **THE SCRIPT `SynthController` IS DRIVEN THROUGH, WRITTEN ONCE.**
 *
 * `scripts/harvest-abcjs-synth-controller.ts` runs it against abcjs 6.7.0 and
 * `tests/synth-controller.test.ts` runs it against ours. It was DUPLICATED in both files
 * until now, each copy carrying the comment "verbatim from the harvester" — which is a
 * promise a comment cannot keep. The `CreateSynth` gate had already learned this: a state
 * machine driven in two slightly different orders is not a comparison, and this one is
 * order-dependent from `new` to `disable`.
 *
 * ⚠️ **THAT IS ALSO WHY THE HARVESTER IS `.ts` RATHER THAN `.mjs`** — the same reason
 * `harvest-abcjs-create-synth.ts` is. Run it through `tsx`.
 */

/** The tunes: a tempo change, and a meter change with chords. */
export const FIXTURES: readonly string[] = [
  "abcjs-synth-flattener-09-d-defg-q-1-2-90-defg",
  "abcjs-synth-flattener-12-chords-meter-change",
];

/** The four transport shapes: every control, none, no cursor, and a subdivided cursor. */
export const CASES: readonly [string, Record<string, boolean> | null, string | null][] = [
  [
    "all",
    {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    },
    "full",
  ],
  ["no-control", null, "full"],
  ["no-cursor", { displayLoop: true, displayPlay: true }, null],
  ["subdivisions", {}, "subdivided"],
];

export type Step = [string, unknown[], unknown[], unknown[], unknown[]];

/** The `CreateSynth` stub — nine methods, every call recorded. */
export interface Buffer {
  duration: number;
  init(options: { millisecondsPerMeasure?: number; options?: unknown }): Promise<unknown>;
  prime(): Promise<unknown>;
  start(): void;
  pause(): void;
  seek(position: number, units?: string): void;
  finished(): void;
  stop(): void;
  download(): string;
}

export interface Controller {
  load(selector: string, cursorControl: unknown, visualOptions: unknown): void;
  setTune(tune: unknown, userAction: boolean, options: unknown): Promise<unknown>;
  play(): Promise<unknown>;
  pause(): void;
  restart(): void;
  seek(position: number, units?: string): void;
  toggleLoop(): void;
  randomAccess(ev: unknown): Promise<unknown>;
  onWarp(ev: unknown): Promise<unknown> | void;
  beatCallback(beat: number, total: number, totalTime: number, position: unknown): void;
  eventCallback(ev: unknown): unknown;
  lineEndCallback(lineEvent: unknown, leftEvent: unknown): void;
  getUrl(): string;
  download(name: string): void;
  destroy(): void;
  disable(state: boolean): void;
  [field: string]: unknown;
}

export interface El {
  innerHTML: string;
  value?: string;
  style: { left?: string };
  classList: { contains(name: string): boolean };
  querySelector(s: string): El | null;
}

/** The buffer's call log, drained by every snapshot. */
export const bufLog: { rows: unknown[] } = { rows: [] };

export const makeBuffer = (): Buffer => ({
  duration: 12.5,
  init: (options) => {
    bufLog.rows.push([
      "init",
      options.millisecondsPerMeasure,
      JSON.stringify(options.options),
    ]);
    return Promise.resolve({ status: "ok", loaded: ["a"] });
  },
  prime: () => {
    bufLog.rows.push(["prime"]);
    return Promise.resolve({ status: "primed" });
  },
  start: () => void bufLog.rows.push(["start"]),
  pause: () => void bufLog.rows.push(["pause"]),
  seek: (position, units) => void bufLog.rows.push(["seek", position, units ?? null]),
  finished: () => void bufLog.rows.push(["finished"]),
  stop: () => void bufLog.rows.push(["stop"]),
  download: () => {
    bufLog.rows.push(["download"]);
    return "blob:stub";
  },
});

export const cursorFor = (
  kind: string | null,
  log: unknown[],
): Record<string, unknown> | null => {
  if (kind === null) return null;
  const cc: Record<string, unknown> = {
    onReady: () => log.push(["onReady"]),
    onStart: () => log.push(["onStart"]),
    onFinished: () => log.push(["onFinished"]),
    onBeat: (
      beat: number,
      total: number,
      totalTime: number,
      position: { left?: number; top?: number } | null,
    ) =>
      log.push([
        "onBeat",
        beat,
        total,
        totalTime,
        position ? [position.left ?? null, position.top ?? null] : null,
      ]),
    onEvent: (e: { milliseconds?: number } | null) =>
      log.push(["onEvent", e ? (e.milliseconds ?? null) : null]),
    onLineEnd: (
      lineEvent: { milliseconds?: number } | undefined,
      leftEvent: { milliseconds?: number } | undefined,
    ) =>
      log.push([
        "onLineEnd",
        lineEvent ? (lineEvent.milliseconds ?? null) : null,
        leftEvent ? (leftEvent.milliseconds ?? null) : null,
      ]),
  };
  if (kind === "subdivided") {
    cc["beatSubdivisions"] = 4;
    cc["extraMeasuresAtBeginning"] = 1;
    cc["lineEndAnticipation"] = 50;
  }
  return cc;
};

/** The transport bar as the CONTROLLER drives it — not its markup, which its own gate holds. */
export const controlState = (parent: El): unknown[] => {
  const q = (s: string): El | null => parent.querySelector(s);
  const cls = (s: string, name: string): boolean | null => {
    const el = q(s);
    return el ? el.classList.contains(name) : null;
  };
  const html = (s: string): string | null => {
    const el = q(s);
    return el ? el.innerHTML : null;
  };
  return [
    cls(".abcjs-inline-audio", "abcjs-disabled"),
    cls(".abcjs-midi-start", "abcjs-pushed"),
    cls(".abcjs-midi-loop", "abcjs-pushed"),
    html(".abcjs-midi-clock"),
    html(".abcjs-midi-current-tempo"),
    q(".abcjs-midi-tempo") ? (q(".abcjs-midi-tempo")?.value ?? null) : null,
    q(".abcjs-midi-progress-indicator")
      ? (q(".abcjs-midi-progress-indicator")?.style.left ?? null)
      : null,
  ];
};

export const state = (c: Controller): unknown[] => {
  const timer = c["timer"] as { lastMoment?: unknown; totalBeats?: unknown } | undefined;
  return [
    c["isStarted"],
    c["isLoaded"],
    c["isLoading"],
    c["isLooping"],
    c["warp"],
    c["percent"] === undefined ? null : c["percent"],
    c["currentTempo"],
    timer ? [timer.lastMoment ?? null, timer.totalBeats ?? null] : null,
  ];
};

/** The fake progress-bar click: 60px into a bar whose box starts at 10 and is 200 wide. */
export const CLICK = {
  x: 60,
  target: {
    classList: { contains: (): boolean => false },
    parentNode: null,
    getBoundingClientRect: (): { left: number } => ({ left: 10 }),
    offsetWidth: 200,
  },
};

export const drive = async (
  make: () => Controller,
  tune: unknown,
  visualOptions: Record<string, boolean> | null,
  cursorKind: string | null,
  parent: El,
): Promise<Step[]> => {
  parent.innerHTML = "";
  bufLog.rows = [];
  const cursorLog: unknown[] = [];
  const log: Step[] = [];
  const c = make();
  const snap = (step: string): void => {
    log.push([
      step,
      bufLog.rows.splice(0),
      cursorLog.splice(0),
      controlState(parent),
      state(c),
    ]);
  };
  const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      snap(`${label}${(await fn()) ?? ""}`);
    } catch (e) {
      snap(`${label} threw: ${(e as Error).message}`);
    }
  };

  snap("new");
  if (visualOptions !== null) {
    c.load("#bar", cursorFor(cursorKind, cursorLog), visualOptions);
    snap(`load ${JSON.stringify(visualOptions)}`);
  }
  await step("setTune passive -> ", async () =>
    JSON.stringify(await c.setTune(tune, false, {})),
  );
  await step("setTune userAction -> ", async () =>
    JSON.stringify(await c.setTune(tune, true, { chordsOff: true })),
  );
  await step("play -> ", async () => JSON.stringify(await c.play()));
  c.beatCallback(2, 8, 4000, { left: 5, top: 6, height: 7 });
  snap("beatCallback");
  c.eventCallback({ type: "event", milliseconds: 100, startChar: 3 });
  snap("eventCallback event");
  c.lineEndCallback({ milliseconds: 50 }, { type: "event", milliseconds: 20 });
  snap("lineEndCallback");
  snap(`eventCallback null -> ${c.eventCallback(null)}`);
  await step("play again -> ", async () => JSON.stringify(await c.play()));
  c.toggleLoop();
  snap("toggleLoop");
  c.restart();
  snap("restart");
  c.seek(0.25);
  snap("seek 0.25");
  c.seek(3, "seconds");
  snap("seek 3 seconds");
  await step("randomAccess -> ", async () => JSON.stringify(await c.randomAccess(CLICK)));
  await step("onWarp 50", async () => {
    await c.onWarp({ target: { value: "50" } });
  });
  snap(`eventCallback null looping -> ${c.eventCallback(null)}`);
  c.toggleLoop();
  c.pause();
  snap("pause");
  snap(`getUrl -> ${c.getUrl()}`);
  try {
    c.download("x.wav");
    snap("download");
  } catch (e) {
    snap(`download threw: ${(e as Error).message}`);
  }
  c.destroy();
  snap("destroy");
  c.disable(true);
  snap("disable true");
  return log;
};

/**
 * **`runWhenReady`'s `isLoading` ARM — the one the other four cases cannot reach.**
 *
 * `play()` goes through `runWhenReady`, which has three arms: no tune at all, LOADING, and
 * loaded-or-not. The middle one waits `sleep(500)` and then asks again
 * (`synth-controller.js:138-152`), and every gate here stubs `setTimeout` to a NO-OP — so
 * that promise never settles and the arm is unreachable by construction.
 *
 * Reaching it needs two things at once, and the first is not obvious:
 *
 * ⚠️ **`setTune(tune, false, …)` NEVER SETS `isLoading`.** The passive arm returns
 * `{status: "no-audio-context"}` without calling `go()` at all (`synth-controller.js:59-64`)
 * — so a `play()` racing THAT one takes the `!isLoaded` arm, which is the one the other
 * cases already cover. It is `userAction = true` that loads, and racing that is the case.
 *
 * The second is a clock: this installs a RECORDING timer for its own duration, one that
 * logs every delay it is asked for and fires on a macrotask.
 *
 * ⚠️ **AND `sleep` IS NOT THE ONLY THING ASKING.** `TimingCallbacks` keeps a backup
 * `joggerTimer` at its own interval (`abc_timing_callbacks.js:306`), which RESCHEDULES
 * ITSELF — so a timer that always fires never stops. The first few are fired and the rest
 * are recorded and dropped, which ends the jog and still shows every delay asked for.
 * **The delays are part of the comparison**: `sleep(500)` is a literal, and a port that
 * waited a different amount, or asked in a different order, would show it here and nowhere
 * else.
 */
export const driveLoading = async (
  make: () => Controller,
  tune: unknown,
  parent: El,
): Promise<Step[]> => {
  parent.innerHTML = "";
  bufLog.rows = [];
  const cursorLog: unknown[] = [];
  const log: Step[] = [];
  const delays: unknown[] = [];
  const c = make();
  const snap = (step: string): void => {
    log.push([
      step,
      bufLog.rows.splice(0),
      cursorLog.splice(0),
      [delays.splice(0), ...controlState(parent)],
      state(c),
    ]);
  };

  const g = globalThis as Record<string, unknown>;
  const savedTimeout = g["setTimeout"];
  /** Enough for the jogger's first tick and the sleep, and not enough to jog forever. */
  const FIRE_LIMIT = 3;
  let fired = 0;
  g["setTimeout"] = (fn: () => void, ms: number): number => {
    if (fired < FIRE_LIMIT) {
      fired += 1;
      delays.push(["timer", ms]);
      // A MACROTASK, not a microtask: the `go()` chain has to be able to finish before the
      // re-check, or the arm recurses.
      (globalThis as { setImmediate: (f: () => void) => unknown }).setImmediate(fn);
    } else delays.push(["timer-dropped", ms]);
    return 0;
  };
  try {
    c.load("#bar", cursorFor("full", cursorLog), {
      displayPlay: true,
      displayProgress: true,
    });
    snap("load");
    // **NOT AWAITED, AND `userAction` IS TRUE** — this is the whole case.
    const loading = c.setTune(tune, true, {});
    snap("setTune in flight");
    const playing = c.play();
    snap("play called while loading");
    const loadResult = JSON.stringify(await loading);
    snap(`setTune settled -> ${loadResult}`);
    const playResult = JSON.stringify(await playing);
    snap(`play settled -> ${playResult}`);
  } catch (e) {
    snap(`threw: ${(e as Error).message}`);
  } finally {
    g["setTimeout"] = savedTimeout;
  }
  return log;
};
