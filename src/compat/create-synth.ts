import type { MidiEvent, MidiNote } from "../audio/flatten.js";
import type { TuneObject } from "./index.js";
import {
  activeAudioContext,
  instrumentIndexToName,
  pitchToNoteName,
  registerAudioContext,
  supportsAudio,
  SynthSequence,
} from "./synth.js";

/**
 * What `CreateSynth` actually needs of what it is given — a tune's `setUpAudio()` answer
 * satisfies it, and so does a hand-built `SynthSequence`, which is the whole of what
 * `playEvent` is.
 */
export interface Playable {
  readonly tracks: readonly (readonly MidiEvent[])[];
  readonly totalDuration: number;
  readonly tempo?: number;
}

/**
 * **`CreateSynth` — THE ONE THAT MAKES THE SOUND.**
 *
 * A line-by-line port of `synth/create-synth.js`, with `load-note.js`, `create-note-map.js`,
 * `place-note.js`, `download-buffer.js` and `cents-to-factor.js` beside it because they are
 * one mechanism split across five files.
 *
 * **IT IS A SCHEDULER, NOT A SYNTHESIZER.** No waveform is computed here: the samples come
 * from a soundfont of mp3s, one per instrument and pitch, and everything this class does is
 * decide WHICH sample goes WHERE. That is what makes it gateable in Node — replace the
 * three host objects (`XMLHttpRequest`, `AudioContext`, `OfflineAudioContext`) with
 * recorders and every scheduling decision becomes comparable, exactly as
 * `tests/create-synth.test.ts` drives it.
 *
 * Six details that are abcjs's and would be wrong if intuited:
 *
 * - **THE SOUNDFONT URL DECIDES THE VOLUME MULTIPLIER** — 3.0 for the two hosted fonts,
 *   0.4 for the original one, 1.0 for anything else, and an explicit
 *   `soundFontVolumeMultiplier` of 0 must still win, which is why the test is
 *   `x || x === 0` (`:49-57`).
 * - **IDENTICAL SOUNDS ARE RENDERED ONCE AND PLACED MANY TIMES.** The key is
 *   `instrument:pitch:volume:len:pan:tempoMultiplier:cents` with the length rounded to the
 *   millisecond, and its value is the list of start times (`:337-346`).
 * - **THE NOTE MAP ROUNDS TO SIX DECIMALS** and drops a note whose duration is not
 *   positive; the gap is clamped to two thirds of the length (`create-note-map.js:22-30`).
 * - **A NOTE SHORTER THAN THE `noteEnd` TRIM STILL SOUNDS** — `len` floors at 0.005s rather
 *   than at zero (`place-note.js:16-17`).
 * - **THE PROGRAM OFFSET MOVES THE START EARLIER, NOT THE SAMPLE** — `ofsMs` lengthens the
 *   render and subtracts from every placement, clamped at the buffer's start
 *   (`place-note.js:13-14, 84-87`).
 * - ⚠️ **THE WAV WRITER'S CLAMP HAS A PRECEDENCE BUG** — `0.5 + sample < 0` parses as
 *   `(0.5 + sample) < 0`, so the negative scale is used for anything below −0.5 rather than
 *   below 0 (`download-buffer.js:42`). Ported as written; it is what abcjs's own files
 *   contain.
 */

const notSupportedMessage = "MIDI is not supported in this browser.";

const originalSoundFontUrl = "https://paulrosen.github.io/midi-js-soundfonts/abcjs/";
const defaultSoundFontUrl = "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/";
const alternateSoundFontUrl = "https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/";

// ── The host objects, as little of them as the port touches ──────────────────

export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

interface GainLike {
  readonly gain: AudioParamLike;
  connect(node: unknown): void;
}

interface PannerLike {
  readonly pan: AudioParamLike;
  connect(node: unknown): void;
}

interface BufferSourceLike {
  buffer: AudioBufferLike | null;
  playbackRate: { value: number };
  gainNode?: GainLike;
  panNode?: PannerLike;
  onended?: () => void;
  connect(node: unknown): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  noteOff?: (when: number) => void;
}

interface OfflineContextLike {
  readonly destination: unknown;
  oncomplete: ((event: { renderedBuffer?: AudioBufferLike }) => void) | null;
  createBufferSource(): BufferSourceLike;
  createGain(): GainLike;
  createStereoPanner?: () => PannerLike;
  startRendering(): unknown;
}

interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceLike;
  resume(): Promise<unknown>;
  suspend(): Promise<unknown>;
  decodeAudioData(
    data: ArrayBuffer,
    success: (buffer: AudioBufferLike) => void,
    failure: () => void,
  ): unknown;
}

const ac = (): AudioContextLike => activeAudioContext() as AudioContextLike;

/** `centsToFactor` — two to the power of cents over 1200 (`cents-to-factor.js`). */
export const centsToFactor = (cents: number): number => 2 ** (cents / 1200);

export interface LoadedNote {
  readonly instrument: string;
  readonly name: string;
  readonly status: string;
  readonly audioBuffer?: AudioBufferLike;
  readonly message?: string;
}

/**
 * `soundsCache` — one promise per instrument and pitch, for the LIFE OF THE PAGE. It is a
 * module-level object in abcjs and shared by every synth on the page, which is why a second
 * tune reports its notes as `cached` rather than `loaded`.
 */
export const soundsCache: Record<string, Record<string, Promise<LoadedNote>>> = {};

/** `getNote(url, instrument, name, audioContext)` — one mp3, over XHR (`load-note.js`). */
export function loadNote(
  url: string,
  instrument: string,
  name: string,
  audioContext: AudioContextLike,
): Promise<LoadedNote> {
  if (!soundsCache[instrument]) soundsCache[instrument] = {};
  const instrumentCache = soundsCache[instrument] as Record<string, Promise<LoadedNote>>;

  if (!instrumentCache[name])
    instrumentCache[name] = new Promise<LoadedNote>((resolve, reject) => {
      const XHR = (globalThis as { XMLHttpRequest?: new () => XhrLike }).XMLHttpRequest;
      if (XHR === undefined) {
        reject(new Error("Can't load sound: no XMLHttpRequest"));
        return;
      }
      const xhr = new XHR();
      const noteUrl = `${url}${instrument}-mp3/${name}.mp3`;
      xhr.open("GET", noteUrl, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = (): void => {
        if (xhr.status !== 200) {
          reject(new Error(`Can't load sound at ${noteUrl} status=${xhr.status}`));
          return;
        }
        const noteDecoded = (audioBuffer: AudioBufferLike): void => {
          resolve({ instrument, name, status: "loaded", audioBuffer });
        };
        const maybePromise = audioContext.decodeAudioData(
          xhr.response as ArrayBuffer,
          noteDecoded,
          () => {
            reject(new Error(`Can't decode sound at ${noteUrl}`));
          },
        );
        if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === "function")
          void (maybePromise as Promise<unknown>).catch(reject);
      };
      xhr.onerror = (): void => {
        reject(new Error(`Can't load sound at ${noteUrl}`));
      };
      xhr.send();
    }).catch((err: Error) => {
      throw err;
    });

  return instrumentCache[name] as Promise<LoadedNote>;
}

interface XhrLike {
  status: number;
  response: unknown;
  responseType: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  open(method: string, url: string, async: boolean): void;
  send(): void;
}

/** One row of the note map — a note with an END rather than a duration. */
export interface MappedNote {
  pitch: number;
  instrument: string;
  start: number;
  end: number;
  volume: number;
  startChar?: number;
  endChar?: number;
  style?: string;
  cents?: number;
}

/**
 * `createNoteMap(sequence)` — the flattened tracks turned into notes that know their own
 * END (`create-note-map.js`). **A ZERO-LENGTH NOTE IS DROPPED** and the gap is clamped to
 * two thirds of the note, so a `%%MIDI gchord`-heavy track cannot silence itself.
 */
export function createNoteMap(sequence: {
  tracks: readonly (readonly MidiEvent[])[];
}): MappedNote[][] {
  const map: MappedNote[][] = [];
  for (let i = 0; i < sequence.tracks.length; i += 1) map.push([]);

  let currentInstrument = instrumentIndexToName[0] as string;
  sequence.tracks.forEach((track, i) => {
    track.forEach((ev) => {
      switch (ev.cmd) {
        case "note": {
          const note = ev as MidiNote & { startChar?: number; endChar?: number };
          const inst =
            note.instrument !== undefined
              ? (instrumentIndexToName[note.instrument] as string)
              : currentInstrument;
          if (note.duration > 0) {
            let gap = note.gap ? note.gap : 0;
            const len = note.duration;
            gap = Math.min(gap, (len * 2) / 3);
            const obj: MappedNote = {
              pitch: note.pitch,
              instrument: inst,
              start: Math.round(note.start * 1000000) / 1000000,
              end: Math.round((note.start + len - gap) * 1000000) / 1000000,
              volume: note.volume,
            };
            if (note.startChar) obj.startChar = note.startChar;
            if (note.endChar) obj.endChar = note.endChar;
            if (note.style) obj.style = note.style;
            if (note.cents) obj.cents = note.cents;
            (map[i] as MappedNote[]).push(obj);
          }
          break;
        }
        case "program":
          currentInstrument = instrumentIndexToName[ev.instrument] as string;
          break;
        default:
          // "text" is the track name, which is for midi files only; anything else is
          // abcjs's own `console.log("Unhandled midi event")`.
          break;
      }
    });
  });
  return map;
}

/**
 * `placeNote(...)` — render ONE sound in an offline context and copy it into the output
 * buffer at every start time it has (`place-note.js`).
 *
 * The gain is `volume / 96 * multiplier`, held flat to the note's end and then ramped to
 * zero over the fade — so the ENVELOPE is two ramps and nothing else.
 */
export function placeNote(
  outputAudioBuffer: AudioBufferLike,
  sampleRate: number,
  sound: {
    instrument: string;
    pitch: number;
    volume: number;
    len: number;
    pan: number;
    tempoMultiplier: number;
    cents: number;
  },
  startArray: readonly number[],
  volumeMultiplier: number,
  ofsMs: number | undefined,
  fadeTimeSec: number,
  noteEndSec: number,
): Promise<void> {
  const w = globalThis as {
    OfflineAudioContext?: OfflineACConstructor;
    webkitOfflineAudioContext?: OfflineACConstructor;
    window?: {
      OfflineAudioContext?: OfflineACConstructor;
      webkitOfflineAudioContext?: OfflineACConstructor;
    };
  };
  const OfflineAC =
    w.window?.OfflineAudioContext ??
    w.window?.webkitOfflineAudioContext ??
    w.OfflineAudioContext ??
    w.webkitOfflineAudioContext;

  let len = sound.len * sound.tempoMultiplier;
  if (ofsMs) len += ofsMs / 1000;
  len -= noteEndSec;
  // Some small audible length no matter how short the note is.
  if (len < 0) len = 0.005;
  if (OfflineAC === undefined) return Promise.resolve();
  const offlineCtx = new OfflineAC(2, Math.floor((len + fadeTimeSec) * sampleRate), sampleRate);
  const noteName = pitchToNoteName[sound.pitch];
  // It shouldn't happen that the entire instrument cache wasn't created, but this has been
  // seen in practice, so guard against it.
  if (!soundsCache[sound.instrument]) return Promise.resolve();
  const noteBufferPromise =
    noteName === undefined
      ? undefined
      : (soundsCache[sound.instrument] as Record<string, Promise<LoadedNote>>)[noteName];
  // If the note isn't present then just skip it — it leaves a blank spot in the audio.
  if (!noteBufferPromise) return Promise.resolve();

  return noteBufferPromise.then((response) => {
    const source = offlineCtx.createBufferSource();
    source.buffer = response.audioBuffer ?? null;

    // Volume can be between 1 and 127; this translation to gain is trial and error.
    const volume = (sound.volume / 96) * volumeMultiplier;
    source.gainNode = offlineCtx.createGain();

    if (sound.pan && offlineCtx.createStereoPanner) {
      source.panNode = offlineCtx.createStereoPanner();
      source.panNode.pan.setValueAtTime(sound.pan, 0);
    }
    source.gainNode.gain.value = volume;
    source.gainNode.gain.linearRampToValueAtTime(source.gainNode.gain.value, len);
    source.gainNode.gain.linearRampToValueAtTime(0.0, len + fadeTimeSec);

    if (sound.cents) source.playbackRate.value = centsToFactor(sound.cents);

    if (source.panNode) {
      source.panNode.connect(offlineCtx.destination);
      source.gainNode.connect(source.panNode);
    } else {
      source.gainNode.connect(offlineCtx.destination);
    }
    source.connect(source.gainNode);

    source.start(0);
    if (source.noteOff) source.noteOff(len + fadeTimeSec);
    else source.stop(len + fadeTimeSec);

    let fnResolve: () => void = () => {};
    offlineCtx.oncomplete = (e): void => {
      // If the system gets overloaded or there are network problems then this can start
      // failing. Just drop the note if so.
      if (e.renderedBuffer && (e.renderedBuffer as { getChannelData?: unknown }).getChannelData) {
        for (const rawStart of startArray) {
          let start = rawStart * sound.tempoMultiplier;
          if (ofsMs) start -= ofsMs / 1000;
          // If the item that is moved back is at the very beginning of the buffer then
          // don't move it back; to do that would push everything else forward.
          if (start < 0) start = 0;
          start = Math.floor(start * sampleRate);
          copyToChannel(outputAudioBuffer, e.renderedBuffer, start);
        }
      }
      fnResolve();
    };
    offlineCtx.startRendering();
    return new Promise<void>((resolve) => {
      fnResolve = resolve;
    });
  });
}

type OfflineACConstructor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineContextLike;

const copyToChannel = (
  toBuffer: AudioBufferLike,
  fromBuffer: AudioBufferLike,
  start: number,
): void => {
  for (let ch = 0; ch < 2; ch += 1) {
    const fromData = fromBuffer.getChannelData(ch);
    const toData = toBuffer.getChannelData(ch);
    // Mix the current note into the existing track.
    for (let n = 0; n < fromData.length; n += 1)
      (toData as unknown as number[])[n + start] =
        ((toData as unknown as number[])[n + start] as number) +
        ((fromData as unknown as number[])[n] as number);
  }
};

/**
 * `downloadBuffer(synth)` — the rendered buffer as a WAV object URL (`download-buffer.js`).
 *
 * ⚠️ **THE CLAMP HAS A PRECEDENCE BUG** and the interleaving loop runs to the FILE length
 * rather than the sample count, so the last 22 frames read past the channel data and write
 * zeros. Both are abcjs's, and both are ported as written.
 */
export function downloadBuffer(synth: { audioBuffers: AudioBufferLike[] }): string {
  const w = globalThis as {
    window?: { URL: { createObjectURL(b: unknown): string } };
    Blob?: new (parts: unknown[], options: { type: string }) => unknown;
  };
  return (w.window as { URL: { createObjectURL(b: unknown): string } }).URL.createObjectURL(
    bufferToWave(synth.audioBuffers),
  );
}

function bufferToWave(audioBuffers: readonly AudioBufferLike[]): unknown {
  const audioBuffer = audioBuffers[0] as AudioBufferLike;
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  const setUint16 = (data: number): void => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number): void => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < numOfChan; i += 1) channels.push(audioBuffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < channels.length; i += 1) {
      const raw = (channels[i] as unknown as number[])[offset] as number | undefined;
      let sample = Math.max(-1, Math.min(1, raw ?? 0));
      // abcjs's own precedence: `(0.5 + sample) < 0`, not `0.5 + (sample < 0)`.
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset += 1;
  }

  const Blob = (globalThis as { Blob?: new (p: unknown[], o: { type: string }) => unknown })
    .Blob as new (p: unknown[], o: { type: string }) => unknown;
  return new Blob([buffer], { type: "audio/wav" });
}

export interface CreateSynthInitOptions {
  visualObj?: TuneObject;
  sequence?: Playable;
  millisecondsPerMeasure?: number;
  audioContext?: unknown;
  options?: Record<string, unknown>;
  debugCallback?: (message: string, arg?: unknown) => void;
}

export class CreateSynth {
  audioBufferPossible: boolean | undefined = undefined;
  directSource: BufferSourceLike[] = [];
  startTimeSec: number | undefined = undefined;
  pausedTimeSec: number | undefined = undefined;
  audioBuffers: AudioBufferLike[] = [];
  duration: number | undefined = undefined;
  isRunning = false;
  options: Record<string, unknown> = {};
  pickupLength = 0;

  flattened: Playable | undefined;
  soundFontUrl = defaultSoundFontUrl;
  soundFontVolumeMultiplier = 1;
  programOffsets: Record<string, number> = {};
  fadeLength = 200;
  noteEnd = 0;
  pan: unknown;
  meterSize = 1;
  meterFraction: { num?: number; den?: number } = { den: 1 };
  millisecondsPerMeasure = 1000;
  beatsPerMeasure = 4;
  sequenceCallback: ((tracks: MappedNote[][], context: unknown) => void) | undefined;
  callbackContext: unknown;
  onEnded: ((context: unknown) => void) | undefined;
  debugCallback: ((message: string, arg?: unknown) => void) | undefined;

  init = (options?: CreateSynthInitOptions): Promise<unknown> => {
    const opts = options ?? {};
    if (opts.options) this.options = opts.options;
    // A nop if there is already a context; creates one otherwise.
    registerAudioContext(opts.audioContext);
    this.debugCallback = opts.debugCallback;
    if (this.debugCallback) this.debugCallback("init called");
    this.audioBufferPossible = this._deviceCapable();
    if (!this.audioBufferPossible)
      return Promise.reject({ status: "NotSupported", message: notSupportedMessage });
    const params = (opts.options ?? {}) as Record<string, unknown>;
    this.soundFontUrl = params["soundFontUrl"]
      ? (params["soundFontUrl"] as string)
      : defaultSoundFontUrl;
    if (this.soundFontUrl[this.soundFontUrl.length - 1] !== "/") this.soundFontUrl += "/";
    if (params["soundFontVolumeMultiplier"] || params["soundFontVolumeMultiplier"] === 0)
      this.soundFontVolumeMultiplier = params["soundFontVolumeMultiplier"] as number;
    else if (
      this.soundFontUrl === defaultSoundFontUrl ||
      this.soundFontUrl === alternateSoundFontUrl
    )
      this.soundFontVolumeMultiplier = 3.0;
    else if (this.soundFontUrl === originalSoundFontUrl) this.soundFontVolumeMultiplier = 0.4;
    else this.soundFontVolumeMultiplier = 1.0;
    if (params["programOffsets"])
      this.programOffsets = params["programOffsets"] as Record<string, number>;
    else if (this.soundFontUrl === originalSoundFontUrl)
      this.programOffsets = ORIGINAL_PROGRAM_OFFSETS;
    else this.programOffsets = {};
    let p =
      params["fadeLength"] !== undefined
        ? Number.parseInt(String(params["fadeLength"]), 10)
        : Number.NaN;
    this.fadeLength = Number.isNaN(p) ? 200 : p;
    p =
      params["noteEnd"] !== undefined
        ? Number.parseInt(String(params["noteEnd"]), 10)
        : Number.NaN;
    this.noteEnd = Number.isNaN(p) ? 0 : p;

    this.pan = params["pan"];
    this.meterSize = 1;
    if (opts.visualObj) {
      this.flattened = opts.visualObj.setUpAudio(params);
      const meter = opts.visualObj.getMeterFraction();
      if (meter.den) this.meterSize = (meter.num as number) / meter.den;
      this.pickupLength = opts.visualObj.getPickupLength();
    } else if (opts.sequence) this.flattened = opts.sequence;
    else return Promise.reject(new Error("Must pass in either a visualObj or a sequence"));
    this.millisecondsPerMeasure = opts.millisecondsPerMeasure
      ? opts.millisecondsPerMeasure
      : opts.visualObj
        ? opts.visualObj.millisecondsPerMeasure(this.flattened.tempo as number)
        : 1000;
    this.beatsPerMeasure = opts.visualObj ? opts.visualObj.getBeatsPerMeasure() : 4;
    this.sequenceCallback = params["sequenceCallback"] as typeof this.sequenceCallback;
    this.callbackContext = params["callbackContext"];
    this.onEnded = params["onEnded"] as typeof this.onEnded;
    // If we are given a sequence instead of a regular visual obj, then don't do the swing.
    this.meterFraction = opts.visualObj ? opts.visualObj.getMeterFraction() : { den: 1 };

    const allNotes: Record<string, Record<string, boolean>> = {};
    const cached: string[] = [];
    const errorNotes: string[] = [];
    let currentInstrument = instrumentIndexToName[0] as string;
    this.flattened.tracks.forEach((track) => {
      track.forEach((event) => {
        if (event.cmd === "program" && instrumentIndexToName[event.instrument])
          currentInstrument = instrumentIndexToName[event.instrument] as string;
        const note = event as MidiNote;
        if (note.pitch !== undefined) {
          const noteName = pitchToNoteName[note.pitch];
          const inst =
            note.instrument !== undefined
              ? (instrumentIndexToName[note.instrument] as string)
              : currentInstrument;
          if (noteName) {
            if (!allNotes[inst]) allNotes[inst] = {};
            if (!soundsCache[inst] || !soundsCache[inst]?.[noteName])
              (allNotes[inst] as Record<string, boolean>)[noteName] = true;
            else {
              const label2 = `${inst}:${noteName}`;
              if (cached.indexOf(label2) < 0) cached.push(label2);
            }
          } else {
            const label = `${inst}:${noteName}`;
            if (errorNotes.indexOf(label) < 0) errorNotes.push(label);
          }
        }
      });
    });

    const notes: { instrument: string; note: string }[] = [];
    Object.keys(allNotes).forEach((instrument) => {
      Object.keys(allNotes[instrument] as Record<string, boolean>).forEach((note) => {
        notes.push({ instrument, note });
      });
    });
    if (this.debugCallback) this.debugCallback(`notes ${JSON.stringify(notes)}`);

    // If there are lots of notes, load them in batches.
    const batches: { instrument: string; note: string }[][] = [];
    const CHUNK = 256;
    for (let i = 0; i < notes.length; i += CHUNK) batches.push(notes.slice(i, i + CHUNK));

    return new Promise((resolve, reject) => {
      const results: { cached: string[]; error: string[]; loaded: string[] } = {
        cached,
        error: errorNotes,
        loaded: [],
      };
      let index = 0;
      const next = (): void => {
        if (index < batches.length) {
          this._loadBatch(batches[index] as { instrument: string; note: string }[]).then(
            (data) => {
              if (data) {
                if (data.error) results.error = results.error.concat(data.error);
                if (data.loaded) results.loaded = results.loaded.concat(data.loaded);
              }
              index += 1;
              next();
            },
            reject,
          );
        } else resolve(results);
      };
      next();
    });
  };

  /**
   * `_loadBatch` — and **A PENDING NOTE IS RETRIED WITH A DOUBLING DELAY** up to 90 seconds,
   * because a second call for notes can arrive before the first has finished (`:220-283`).
   */
  _loadBatch = (
    batch: { instrument: string; note: string }[],
    delay?: number,
  ): Promise<{ loaded: string[]; cached: string[]; error: string[] } | undefined> => {
    const promises: Promise<LoadedNote>[] = [];
    batch.forEach((item) => {
      if (this.debugCallback) this.debugCallback(`getNote ${item.instrument}:${item.note}`);
      promises.push(loadNote(this.soundFontUrl, item.instrument, item.note, ac()));
    });
    return Promise.all(promises)
      .then((response) => {
        const loaded: string[] = [];
        const cached: string[] = [];
        const pending: string[] = [];
        const error: string[] = [];
        for (const oneResponse of response) {
          const which = `${oneResponse.instrument}:${oneResponse.name}`;
          if (oneResponse.status === "loaded") loaded.push(which);
          else if (oneResponse.status === "pending") pending.push(which);
          else if (oneResponse.status === "cached") cached.push(which);
          else error.push(`${which} ${oneResponse.message}`);
        }
        if (pending.length > 0) {
          const nextDelay = delay === undefined ? 50 : delay * 2;
          if (nextDelay < 90000) {
            return new Promise<
              { loaded: string[]; cached: string[]; error: string[] } | undefined
            >((resolve, reject) => {
              const g = globalThis as { setTimeout?: (f: () => void, ms: number) => unknown };
              g.setTimeout?.(() => {
                const newBatch = pending.map((row) => {
                  const which = row.split(":");
                  return { instrument: which[0] as string, note: which[1] as string };
                });
                this._loadBatch(newBatch, nextDelay).then(resolve).catch(reject);
              }, nextDelay);
            });
          }
          const list = batch.map((b) => `${b.instrument}/${b.note}`);
          return Promise.reject(
            new Error(`timeout attempting to load: ${list.join(", ")}`),
          );
        }
        return Promise.resolve({ loaded, cached, error });
      })
      .catch(() => undefined);
  };

  prime = (): Promise<unknown> => {
    const fadeTimeSec = this.fadeLength / 1000;
    this.isRunning = false;
    if (!this.audioBufferPossible) return Promise.reject(new Error(notSupportedMessage));

    return new Promise((resolve, reject) => {
      try {
        const tempoMultiplier = this.millisecondsPerMeasure / 1000 / this.meterSize;
        this.duration = (this.flattened as Playable).totalDuration * tempoMultiplier;
        if (this.duration <= 0) {
          this.audioBuffers = [];
          resolve({ status: "empty", seconds: 0 });
          return;
        }
        this.duration += fadeTimeSec;
        const totalSamples = Math.floor(ac().sampleRate * this.duration);

        // There might be a previous run that needs to be turned off.
        this.stop();

        const noteMapTracks = createNoteMap(this.flattened as Playable);

        if (this.options["swing"]) {
          // With a drum intro the pickup is already incorporated into the beat.
          const pickupLength = this.options["drumIntro"] ? 0 : this.pickupLength;
          addSwing(
            noteMapTracks,
            this.options["swing"] as number,
            this.meterFraction,
            pickupLength,
          );
        }

        if (this.sequenceCallback) this.sequenceCallback(noteMapTracks, this.callbackContext);

        const panDistances = setPan(noteMapTracks.length, this.pan);

        // A list of the unique sounds in this music and where they should be placed: there
        // is a limit on how many audio buffers can be created at once.
        const uniqueSounds: Record<string, number[]> = {};
        noteMapTracks.forEach((noteMap, trackNumber) => {
          const panDistance =
            panDistances && panDistances.length > trackNumber
              ? (panDistances[trackNumber] as number)
              : 0;
          noteMap.forEach((note) => {
            const key = `${note.instrument}:${note.pitch}:${note.volume}:${
              Math.round((note.end - note.start) * 1000) / 1000
            }:${panDistance}:${tempoMultiplier}:${note.cents ? note.cents : 0}`;
            if (!uniqueSounds[key]) uniqueSounds[key] = [];
            (uniqueSounds[key] as number[]).push(note.start);
          });
        });

        const allPromises: Promise<void>[] = [];
        const audioBuffer = ac().createBuffer(2, totalSamples, ac().sampleRate);
        for (const k of Object.keys(uniqueSounds)) {
          const raw = k.split(":");
          const parts = {
            instrument: raw[0] as string,
            pitch: Number.parseInt(raw[1] as string, 10),
            volume: Number.parseInt(raw[2] as string, 10),
            len: Number.parseFloat(raw[3] as string),
            pan: Number.parseFloat(raw[4] as string),
            tempoMultiplier: Number.parseFloat(raw[5] as string),
            cents: raw[6] !== undefined ? Number.parseFloat(raw[6]) : 0,
          };
          allPromises.push(
            placeNote(
              audioBuffer,
              ac().sampleRate,
              parts,
              uniqueSounds[k] as number[],
              this.soundFontVolumeMultiplier,
              this.programOffsets[parts.instrument],
              fadeTimeSec,
              this.noteEnd / 1000,
            ),
          );
        }
        this.audioBuffers = [audioBuffer];

        const resolveData = (): { status: string; duration: number } => ({
          status: ac().state,
          duration: this.audioBuffers.length > 0 ? (this.audioBuffers[0] as AudioBufferLike).duration : 0,
        });

        Promise.all(allPromises)
          .then(() => {
            // Safari iOS can mess with the audioContext state, so resume if needed.
            if (ac().state === "suspended") {
              void ac()
                .resume()
                .then(() => resolve(resolveData()));
            } else if (ac().state === "interrupted") {
              void ac()
                .suspend()
                .then(() =>
                  ac()
                    .resume()
                    .then(() => resolve(resolveData())),
                );
            } else resolve(resolveData());
          })
          .catch((error: unknown) => reject(error));
      } catch (error) {
        reject(error);
      }
    });
  };

  /** This is called after everything is set up, so it can quickly make sound. */
  start = (): void => {
    if (!this.audioBufferPossible) throw new Error(notSupportedMessage);
    const resumePosition = this.pausedTimeSec ? this.pausedTimeSec : 0;
    this._kickOffSound(resumePosition);
    this.startTimeSec = ac().currentTime - resumePosition;
    this.pausedTimeSec = undefined;
  };

  pause = (): number => {
    if (!this.audioBufferPossible) throw new Error(notSupportedMessage);
    this.pausedTimeSec = this.stop();
    return this.pausedTimeSec;
  };

  resume = (): void => {
    this.start();
  };

  seek = (position: number, units?: string): void => {
    let offset: number;
    switch (units) {
      case "seconds":
        offset = position;
        break;
      case "beats":
        offset = (position * this.millisecondsPerMeasure) / this.beatsPerMeasure / 1000;
        break;
      default:
        // "percent" or any illegal value.
        offset = ((this.duration as number) - this.fadeLength / 1000) * position;
        break;
    }
    if (!this.audioBufferPossible) throw new Error(notSupportedMessage);

    if (this.isRunning) {
      this.stop();
      this._kickOffSound(offset);
    } else {
      this.pausedTimeSec = offset;
    }
    this.pausedTimeSec = offset;
  };

  stop = (): number => {
    this.isRunning = false;
    this.pausedTimeSec = undefined;
    this.directSource.forEach((source) => {
      try {
        source.stop();
      } catch {
        // We don't care if this succeeds: something else may have turned off the sound.
      }
    });
    this.directSource = [];
    return ac().currentTime - (this.startTimeSec as number);
  };

  finished = (): void => {
    this.startTimeSec = undefined;
    this.pausedTimeSec = undefined;
    this.isRunning = false;
  };

  download = (): string => downloadBuffer(this);

  getAudioBuffer = (): AudioBufferLike | undefined => this.audioBuffers[0];

  getIsRunning = (): boolean => this.isRunning;

  _deviceCapable = (): boolean => !!supportsAudio();

  _kickOffSound = (seconds: number): void => {
    this.isRunning = true;
    this.directSource = [];
    this.audioBuffers.forEach((audioBuffer, trackNum) => {
      const source = ac().createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ac().destination);
      this.directSource[trackNum] = source;
    });
    this.directSource.forEach((source) => {
      source.start(0, seconds);
    });
    if (this.onEnded && this.directSource[0])
      (this.directSource[0] as BufferSourceLike).onended = (): void => {
        (this.onEnded as (context: unknown) => void)(this.callbackContext);
      };
  };
}

/**
 * `setPan(numTracks, panParam)` — either an ARRAY of absolute positions, or one number that
 * is the SEPARATION between tracks, spread alternately either side of the middle. Too many
 * tracks for the separation and the whole thing is abandoned (`:395-440`).
 */
function setPan(numTracks: number, panParam: unknown): number[] | null {
  if (panParam === null || panParam === undefined) return null;

  const panDistances: number[] = [];
  if ((panParam as { length?: number }).length) {
    const arr = panParam as unknown[];
    for (let pp = 0; pp < numTracks; pp += 1) {
      if (pp < arr.length) {
        let x = Number.parseFloat(String(arr[pp]));
        if (x < -1) x = -1;
        else if (x > 1) x = 1;
        panDistances.push(x);
      } else panDistances.push(0);
    }
    return panDistances;
  }
  const panNumber = Number.parseFloat(String(panParam));
  // The separation can be no further than 2 (i.e. -1 to 1).
  if (panNumber * (numTracks - 1) > 2) return null;

  // With an even number of tracks, offset so the first two are centred around the middle.
  let even = numTracks % 2 === 0;
  let currLow = even ? 0 - panNumber / 2 : 0;
  let currHigh = currLow + panNumber;
  for (let p = 0; p < numTracks; p += 1) {
    even = p % 2 === 0;
    if (even) {
      panDistances.push(currLow);
      currLow -= panNumber;
    } else {
      panDistances.push(currHigh);
      currHigh += panNumber;
    }
  }
  return panDistances;
}

/**
 * `addSwing(...)` — **ONLY IN X/4 AND X/8**, only above 50, and capped at 75 (a dotted
 * eighth against a sixteenth). A note is swung when it falls on a HALF beat that is not a
 * beat, and its neighbours are clear; the note before it, if it ended exactly there, is
 * lengthened to meet it (`:568-640`).
 */
function addSwing(
  noteMapTracks: MappedNote[][],
  rawSwing: number,
  meterFraction: { den?: number },
  pickupLength: number,
): void {
  if (meterFraction.den !== 4 && meterFraction.den !== 8) return;

  let swing = Number.parseFloat(String(rawSwing));
  if (Number.isNaN(swing) || swing <= 50) return;
  if (swing > 75) swing = 75;
  swing = swing / 50 - 1;

  const volumeIncrease = 0.0;
  let beatLength = 0.25;
  // In X/8 meters the 16ths swing, so the beat length is halved.
  if (meterFraction.den === 8) beatLength = beatLength / 2;
  const halfbeatLength = beatLength / 2;
  const swingDuration = halfbeatLength * swing;

  for (const track of noteMapTracks) {
    for (let i = 0; i < track.length; i += 1) {
      const event = track[i] as MappedNote;
      const prev = track[i - 1];
      const next = track[i + 1];
      if (
        (event.start - pickupLength) % halfbeatLength === 0 &&
        (event.start - pickupLength) % beatLength !== 0 &&
        (i === 0 || (prev as MappedNote).start <= event.start - halfbeatLength) &&
        (i === track.length - 1 || (next as MappedNote).start >= event.start + halfbeatLength)
      ) {
        const oldEventStart = event.start;
        event.start += swingDuration;
        event.volume *= 1 + volumeIncrease;
        if (i > 0 && (prev as MappedNote).end === oldEventStart) {
          (prev as MappedNote).end = event.start;
          (prev as MappedNote).volume *= 1 - volumeIncrease;
        }
      }
    }
  }
}

/** The original soundfont's per-instrument onset offsets, in milliseconds (`:60-101`). */
const ORIGINAL_PROGRAM_OFFSETS: Record<string, number> = {
  bright_acoustic_piano: 20,
  honkytonk_piano: 20,
  electric_piano_1: 30,
  electric_piano_2: 30,
  harpsichord: 40,
  clavinet: 20,
  celesta: 20,
  glockenspiel: 40,
  vibraphone: 30,
  marimba: 35,
  xylophone: 30,
  tubular_bells: 35,
  dulcimer: 30,
  drawbar_organ: 20,
  percussive_organ: 25,
  rock_organ: 20,
  church_organ: 40,
  reed_organ: 40,
  accordion: 40,
  harmonica: 40,
  acoustic_guitar_nylon: 20,
  acoustic_guitar_steel: 30,
  electric_guitar_jazz: 25,
  electric_guitar_clean: 15,
  electric_guitar_muted: 35,
  overdriven_guitar: 25,
  distortion_guitar: 20,
  guitar_harmonics: 30,
  electric_bass_finger: 15,
  electric_bass_pick: 30,
  fretless_bass: 40,
  violin: 105,
  viola: 50,
  cello: 40,
  contrabass: 60,
  trumpet: 10,
  trombone: 90,
  alto_sax: 20,
  tenor_sax: 20,
  clarinet: 20,
  flute: 50,
  banjo: 50,
  woodblock: 20,
};

/**
 * `playEvent(midiPitches, midiGracePitches, millisecondsPerMeasure, soundFontUrl)` — sound
 * ONE clicked note, with its grace notes in front of it (`synth/play-event.js`).
 *
 * **IT IS `SynthSequence` PLUS A `CreateSynth` AND NOTHING ELSE.** Each pitch gets its own
 * TRACK, so a chord sounds together rather than in sequence, and the graces go on the FIRST
 * track only, a 64th note each — which is why a chord's graces do not stack up.
 */
export function playEvent(
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
  debugCallback?: (message: string, arg?: unknown) => void,
): Promise<unknown> {
  const sequence = new SynthSequence();

  for (let i = 0; i < midiPitches.length; i += 1) {
    const note = midiPitches[i] as (typeof midiPitches)[number];
    const trackNum = sequence.addTrack();
    sequence.setInstrument(trackNum, note.instrument);
    if (i === 0 && midiGracePitches) {
      for (const grace of midiGracePitches)
        sequence.appendNote(trackNum, grace.pitch, 1 / 64, grace.volume, grace.cents);
    }
    sequence.appendNote(trackNum, note.pitch, note.duration, note.volume, note.cents);
  }

  const context = ac();
  if (context.state === "suspended")
    return context
      .resume()
      .then(() => doPlay(sequence, millisecondsPerMeasure, soundFontUrl, debugCallback));
  return doPlay(sequence, millisecondsPerMeasure, soundFontUrl, debugCallback);
}

function doPlay(
  sequence: SynthSequence,
  millisecondsPerMeasure: number,
  soundFontUrl: string | undefined,
  debugCallback: ((message: string, arg?: unknown) => void) | undefined,
): Promise<unknown> {
  const buffer = new CreateSynth();
  return buffer
    .init({
      sequence: sequence as unknown as Playable,
      millisecondsPerMeasure,
      options: { soundFontUrl },
      ...(debugCallback === undefined ? {} : { debugCallback }),
    })
    .then(() => buffer.prime())
    .then(() => {
      buffer.start();
      return Promise.resolve();
    });
}
