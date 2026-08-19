import type { Recorder } from "./audio-recorder.js";

/**
 * **THE SCRIPT `CreateSynth` IS DRIVEN THROUGH, WRITTEN ONCE.**
 *
 * `scripts/harvest-abcjs-create-synth.ts` runs it against abcjs 6.7.0 and
 * `tests/create-synth.test.ts` runs it against ours, so the two sides cannot be driven
 * differently — which matters more here than in the other gates, because the state machine
 * this walks (`start` → `pause` → three flavours of `seek` → `start` → `stop`) is
 * order-dependent from end to end.
 */

/** The tunes: a tempo change, a meter change with chords, and quarter tones for `cents`. */
export const FIXTURES: readonly string[] = [
  "abcjs-synth-flattener-09-d-defg-q-1-2-90-defg",
  "abcjs-synth-flattener-12-chords-meter-change",
  "abcjs-synth-flattener-32-quarter-tone2",
];

/**
 * The option shapes. `original-font` is the one that turns the PROGRAM OFFSETS on — the
 * only path where a note is rendered longer than it sounds and placed EARLIER than its
 * start — and `pan-fade` is the only one that builds a stereo panner.
 */
export const CASES: readonly [string, Record<string, unknown>][] = [
  ["default", {}],
  [
    "original-font",
    { soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/abcjs/" },
  ],
  ["swing", { swing: 66 }],
  ["pan-fade", { pan: 0.4, fadeLength: 100, noteEnd: 50 }],
  ["chords-off", { chordsOff: true }],
];

export interface SynthLike {
  init(options: unknown): Promise<unknown>;
  prime(): Promise<unknown>;
  start(): void;
  pause(): number;
  seek(position: number, units?: string): void;
  stop(): number;
  finished(): void;
  download(): string;
  getAudioBuffer(): unknown;
  getIsRunning(): boolean;
  duration?: number | undefined;
  isRunning: boolean;
  startTimeSec?: number | undefined;
  pausedTimeSec?: number | undefined;
  audioBuffers: unknown[];
  soundFontVolumeMultiplier: number;
  fadeLength: number;
  noteEnd: number;
  meterSize: number;
  millisecondsPerMeasure: number;
  beatsPerMeasure: number;
  pickupLength: number;
  programOffsets: Record<string, number>;
}

export type Step = [string, unknown[][], unknown];

const round = (n: number | undefined): number | null =>
  n === undefined ? null : Math.round(n * 1000000) / 1000000;

export async function drive(
  make: () => SynthLike,
  tune: unknown,
  params: Record<string, unknown>,
  recorder: Recorder,
): Promise<Step[]> {
  const log: Step[] = [];
  const synth = make();
  let noteMap: unknown = null;
  recorder.setNow(0);
  recorder.take();

  const snap = (label: string, extra: unknown): void => {
    log.push([label, recorder.take(), extra]);
  };
  const state = (): unknown[] => [
    synth.isRunning,
    round(synth.startTimeSec),
    round(synth.pausedTimeSec),
  ];

  try {
    const initResult = await synth.init({
      visualObj: tune,
      options: {
        ...params,
        sequenceCallback: (tracks: unknown) => {
          noteMap = tracks;
        },
      },
    });
    snap("init", [
      initResult,
      synth.soundFontVolumeMultiplier,
      synth.fadeLength,
      synth.noteEnd,
      synth.meterSize,
      round(synth.millisecondsPerMeasure),
      synth.beatsPerMeasure,
      round(synth.pickupLength),
      Object.keys(synth.programOffsets).length,
    ]);
  } catch (e) {
    snap(`init threw: ${(e as Error).message}`, null);
    return log;
  }

  try {
    const primeResult = await synth.prime();
    const buffer = synth.getAudioBuffer() as { length?: number; sampleRate?: number } | undefined;
    snap("prime", [
      primeResult,
      round(synth.duration),
      buffer ? [buffer.length ?? null, buffer.sampleRate ?? null] : null,
      recorder.fingerprint(buffer),
      noteMap,
    ]);
  } catch (e) {
    snap(`prime threw: ${(e as Error).message}`, null);
    return log;
  }

  // ── The transport, driven against a clock that only this script moves ──
  recorder.setNow(1.5);
  synth.start();
  snap("start at 1.5", state());

  recorder.setNow(2.25);
  const paused = synth.pause();
  snap(`pause at 2.25 -> ${round(paused)}`, state());

  synth.seek(0.5);
  snap("seek 0.5 percent", state());

  synth.seek(1, "seconds");
  snap("seek 1 seconds", state());

  synth.seek(2, "beats");
  snap("seek 2 beats", state());

  recorder.setNow(3);
  synth.start();
  snap("start again at 3", state());

  synth.seek(0.25);
  snap("seek while running", state());

  recorder.setNow(4.5);
  const stopped = synth.stop();
  snap(`stop at 4.5 -> ${round(stopped)}`, state());

  synth.finished();
  snap("finished", state());

  try {
    const url = synth.download();
    snap(`download -> ${url}`, [synth.getIsRunning()]);
  } catch (e) {
    snap(`download threw: ${(e as Error).message}`, null);
  }

  return log;
}

/**
 * **`playEvent` — ONE CLICKED NOTE.** Each pitch gets its own TRACK so a chord sounds
 * together, and the graces go on the FIRST track only, a 64th each.
 */
export const PLAY_EVENT_CASES: readonly [
  string,
  {
    pitches: { pitch: number; duration: number; volume: number; instrument: number; cents?: number }[];
    graces?: { pitch: number; volume: number; cents?: number }[];
    millisecondsPerMeasure: number;
    soundFontUrl?: string;
  },
][] = [
  [
    "single",
    {
      pitches: [{ pitch: 60, duration: 0.25, volume: 105, instrument: 0 }],
      millisecondsPerMeasure: 2000,
    },
  ],
  [
    "chord-with-graces",
    {
      pitches: [
        { pitch: 60, duration: 0.5, volume: 105, instrument: 0 },
        { pitch: 64, duration: 0.5, volume: 105, instrument: 0 },
        { pitch: 67, duration: 0.5, volume: 105, instrument: 40 },
      ],
      graces: [
        { pitch: 62, volume: 60 },
        { pitch: 64, volume: 60 },
      ],
      millisecondsPerMeasure: 1000,
    },
  ],
  [
    "cents",
    {
      pitches: [{ pitch: 69, duration: 0.25, volume: 90, instrument: 0, cents: 50 }],
      millisecondsPerMeasure: 1500,
      soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/abcjs/",
    },
  ],
];

export type PlayEvent = (
  midiPitches: readonly {
    pitch: number;
    duration: number;
    volume: number;
    instrument: number;
    cents?: number;
  }[],
  midiGracePitches: readonly { pitch: number; volume: number; cents?: number }[] | undefined,
  millisecondsPerMeasure: number,
  soundFontUrl?: string,
) => Promise<unknown>;

export async function drivePlayEvent(
  playEvent: PlayEvent,
  params: (typeof PLAY_EVENT_CASES)[number][1],
  recorder: Recorder,
): Promise<Step[]> {
  recorder.setNow(0);
  recorder.take();
  const log: Step[] = [];
  try {
    const answer = await playEvent(
      params.pitches,
      params.graces,
      params.millisecondsPerMeasure,
      params.soundFontUrl,
    );
    log.push(["playEvent", recorder.take(), answer ?? null]);
  } catch (e) {
    log.push([`playEvent threw: ${(e as Error).message}`, recorder.take(), null]);
  }
  return log;
}
