/**
 * **THE RECORDING AUDIO CONTEXT — what makes `CreateSynth` gateable in Node.**
 *
 * `CreateSynth` computes no waveform: it fetches one mp3 per instrument and pitch, renders
 * each unique sound once in an `OfflineAudioContext`, and copies the result into an output
 * buffer at every start time. Replace the three host objects it reaches for —
 * `XMLHttpRequest`, `AudioContext`, `OfflineAudioContext` — with recorders and every one of
 * those decisions becomes a comparable value, while nothing has to decode an mp3.
 *
 * **THE SAMPLES ARE FAKE AND THE PLACEMENT IS REAL.** A rendered sound is a block of one
 * constant — the gain the envelope was set to — so the output buffer's fingerprint (how
 * many frames are non-zero, where the first and last are, what they sum to) is an exact
 * statement about WHERE each note landed and HOW LOUD, which is the whole of what this
 * class decides.
 *
 * Used by both sides: `scripts/harvest-abcjs-create-synth.ts` installs it around abcjs
 * 6.7.0, `tests/create-synth.test.ts` installs it around ours. One file, so the two cannot
 * drift — which is why the harvester is a `.ts` run through `tsx` rather than the `.mjs`
 * the other harvesters are.
 */

/** 8kHz rather than 44.1: the arithmetic is identical and the buffers are 5x smaller. */
export const SAMPLE_RATE = 8000;

export class FakeAudioBuffer {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = [];
    for (let i = 0; i < numberOfChannels; i += 1) this.data.push(new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    return this.data[channel] as Float32Array;
  }
}

export interface Recorder {
  /** Every host call, in order, as a flat comparable row. */
  readonly calls: unknown[][];
  /** The fake audio context to hand to `registerAudioContext`. */
  readonly ac: Record<string, unknown>;
  /** Move the context's clock — `currentTime` is read by `start`, `pause` and `stop`. */
  setNow(seconds: number): void;
  /** Take the calls recorded so far and clear the log. */
  take(): unknown[][];
  /** What the output buffer holds: per channel, where the ink is. */
  fingerprint(buffer: unknown): unknown[];
}

const round = (n: number): number => Math.round(n * 1000000) / 1000000;

export function installRecorder(win: Record<string, unknown>): Recorder {
  const calls: unknown[][] = [];
  const log = (...row: unknown[]): void => void calls.push(row);
  let now = 0;

  class FakeXHR {
    status = 200;
    response: ArrayBuffer = new ArrayBuffer(8);
    responseType = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = "";
    open(_method: string, url: string): void {
      this.url = url;
    }
    send(): void {
      log("xhr", this.url.replace(/^https:\/\/[^/]+/, ""));
      // Asynchronous, as a real request is: the promise in `loadNote` must not resolve
      // inside `send()` or the batching would be a different shape.
      queueMicrotask(() => this.onload?.());
    }
  }

  class FakeParam {
    value = 0;
    constructor(private readonly name: string) {}
    setValueAtTime(value: number, time: number): void {
      log(`${this.name}.setValueAtTime`, round(value), round(time));
    }
    linearRampToValueAtTime(value: number, time: number): void {
      log(`${this.name}.ramp`, round(value), round(time));
    }
  }

  class FakeSource {
    buffer: FakeAudioBuffer | null = null;
    playbackRate = { value: 1 };
    gainNode: unknown;
    panNode: unknown;
    onended: (() => void) | null = null;
    constructor(private readonly where: string) {}
    connect(): void {}
    start(when?: number, offset?: number): void {
      log(`${this.where}.source.start`, when ?? null, offset === undefined ? null : round(offset));
    }
    stop(when?: number): void {
      log(`${this.where}.source.stop`, when === undefined ? null : round(when));
    }
  }

  class FakeGain {
    readonly gain = new FakeParam("gain");
    connect(): void {}
  }
  class FakePanner {
    readonly pan = new FakeParam("pan");
    connect(): void {}
  }

  class FakeOfflineContext {
    readonly destination = { name: "offline-destination" };
    oncomplete: ((e: { renderedBuffer: FakeAudioBuffer }) => void) | null = null;
    private gainValue = 0;
    constructor(
      readonly channels: number,
      readonly length: number,
      readonly sampleRate: number,
    ) {
      log("offline", channels, length, sampleRate);
    }
    createBufferSource(): FakeSource {
      return new FakeSource("offline");
    }
    createGain(): FakeGain {
      const gain = new FakeGain();
      const self = this;
      // The value the envelope settles on IS the sample the fake render produces, so the
      // output buffer's fingerprint carries the volume as well as the placement.
      Object.defineProperty(gain.gain, "value", {
        get: () => self.gainValue,
        set: (v: number) => {
          self.gainValue = v;
          log("gain.value", round(v));
        },
      });
      return gain;
    }
    createStereoPanner(): FakePanner {
      return new FakePanner();
    }
    startRendering(): void {
      const rendered = new FakeAudioBuffer(2, this.length, this.sampleRate);
      for (const channel of rendered.data) channel.fill(round(this.gainValue));
      // A microtask, never synchronous: `place-note.js` assigns its resolver AFTER
      // `startRendering()` returns, so a synchronous completion would call `undefined`.
      queueMicrotask(() => {
        log("rendered", this.length, round(this.gainValue));
        this.oncomplete?.({ renderedBuffer: rendered });
      });
    }
  }

  class FakeBlob {
    readonly bytes: Uint8Array;
    constructor(parts: ArrayBuffer[], readonly options: { type: string }) {
      this.bytes = new Uint8Array(parts[0] as ArrayBuffer);
    }
    get type(): string {
      return this.options.type;
    }
  }

  const ac: Record<string, unknown> = {
    sampleRate: SAMPLE_RATE,
    state: "running",
    destination: { name: "destination" },
    get currentTime(): number {
      return now;
    },
    createBuffer: (channels: number, length: number, sampleRate: number): FakeAudioBuffer => {
      log("createBuffer", channels, length, sampleRate);
      return new FakeAudioBuffer(channels, length, sampleRate);
    },
    createBufferSource: (): FakeSource => new FakeSource("direct"),
    resume: (): Promise<void> => Promise.resolve(),
    suspend: (): Promise<void> => Promise.resolve(),
    decodeAudioData: (
      data: ArrayBuffer,
      success: (buffer: FakeAudioBuffer) => void,
    ): undefined => {
      success(new FakeAudioBuffer(2, 8, SAMPLE_RATE));
      return undefined;
    },
  };

  const g = globalThis as Record<string, unknown>;
  for (const target of [g, win]) {
    // abcjs reads `window.Promise` and `window.AudioContext` (`supports-audio.js:14-20`)
    // and stashes the context on `window.abcjsAudioContext`, where ours keeps a module
    // variable — so the fake window has to carry both.
    target["Promise"] = Promise;
    target["XMLHttpRequest"] = FakeXHR;
    target["OfflineAudioContext"] = FakeOfflineContext;
    target["Blob"] = FakeBlob;
    target["AudioContext"] = function AudioContextStub(): unknown {
      return ac;
    };
  }
  (win["URL"] as { createObjectURL: (b: unknown) => string }).createObjectURL = (
    blob: unknown,
  ): string => {
    const b = blob as FakeBlob;
    let sum = 0;
    for (const byte of b.bytes) sum = (sum + byte) % 1000000007;
    log("createObjectURL", b.type, b.bytes.length, sum);
    return "blob:recorded";
  };

  return {
    calls,
    ac,
    setNow: (seconds: number): void => {
      now = seconds;
    },
    take: (): unknown[][] => calls.splice(0),
    fingerprint: (buffer: unknown): unknown[] => {
      const buf = buffer as FakeAudioBuffer | undefined;
      if (!buf || !buf.data) return [];
      return buf.data.map((channel) => {
        let count = 0;
        let sum = 0;
        let first = -1;
        let last = -1;
        for (let i = 0; i < channel.length; i += 1) {
          const v = channel[i] as number;
          if (v !== 0) {
            count += 1;
            sum += v;
            if (first < 0) first = i;
            last = i;
          }
        }
        return [count, round(sum), first, last];
      });
    },
  };
}
