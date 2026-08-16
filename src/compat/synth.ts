import type { Score } from "../core/model.js";
import { midiFile, type MidiFileOptions } from "../audio/midi-file.js";

/**
 * `abcjs.synth`'s data and file surface — the parts that make no sound and can therefore
 * be compared exactly.
 *
 * `CreateSynth`, `SynthController` and `CreateSynthControl` are the parts that DO make
 * sound; they need WebAudio and a soundfont, and their gate is the event sequence rather
 * than the samples. They are not here yet.
 */

/** abcjs's `pitchToNoteName` — MIDI number to a flat-preferring name (`synth/pitch-to-note-name.js`). */
export const pitchToNoteName: Readonly<Record<number, string>> = (() => {
  const names = [
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "Gb",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];
  const out: Record<number, string> = {};
  // **abcjs's TABLE RUNS 21 TO 121** — `A0` up to `C#9`, 101 entries, well past an
  // 88-key piano at the top. Measured against its own file, every name generated here
  // agreeing to the character; the octave is the standard `floor(pitch / 12) - 1`.
  for (let p = 21; p <= 121; p += 1) {
    out[p] = `${names[p % 12] ?? ""}${Math.floor(p / 12) - 1}`;
  }
  return out;
})();

/**
 * abcjs's `instrumentIndexToName` — the 128 General MIDI programs, in its own spelling
 * (`synth/instrument-index-to-name.js`), because a host uses the string to name a
 * soundfont file.
 */
export const instrumentIndexToName: readonly string[] = [
  "acoustic_grand_piano",
  "bright_acoustic_piano",
  "electric_grand_piano",
  "honkytonk_piano",
  "electric_piano_1",
  "electric_piano_2",
  "harpsichord",
  "clavinet",
  "celesta",
  "glockenspiel",
  "music_box",
  "vibraphone",
  "marimba",
  "xylophone",
  "tubular_bells",
  "dulcimer",
  "drawbar_organ",
  "percussive_organ",
  "rock_organ",
  "church_organ",
  "reed_organ",
  "accordion",
  "harmonica",
  "tango_accordion",
  "acoustic_guitar_nylon",
  "acoustic_guitar_steel",
  "electric_guitar_jazz",
  "electric_guitar_clean",
  "electric_guitar_muted",
  "overdriven_guitar",
  "distortion_guitar",
  "guitar_harmonics",
  "acoustic_bass",
  "electric_bass_finger",
  "electric_bass_pick",
  "fretless_bass",
  "slap_bass_1",
  "slap_bass_2",
  "synth_bass_1",
  "synth_bass_2",
  "violin",
  "viola",
  "cello",
  "contrabass",
  "tremolo_strings",
  "pizzicato_strings",
  "orchestral_harp",
  "timpani",
  "string_ensemble_1",
  "string_ensemble_2",
  "synth_strings_1",
  "synth_strings_2",
  "choir_aahs",
  "voice_oohs",
  "synth_choir",
  "orchestra_hit",
  "trumpet",
  "trombone",
  "tuba",
  "muted_trumpet",
  "french_horn",
  "brass_section",
  "synth_brass_1",
  "synth_brass_2",
  "soprano_sax",
  "alto_sax",
  "tenor_sax",
  "baritone_sax",
  "oboe",
  "english_horn",
  "bassoon",
  "clarinet",
  "piccolo",
  "flute",
  "recorder",
  "pan_flute",
  "blown_bottle",
  "shakuhachi",
  "whistle",
  "ocarina",
  "lead_1_square",
  "lead_2_sawtooth",
  "lead_3_calliope",
  "lead_4_chiff",
  "lead_5_charang",
  "lead_6_voice",
  "lead_7_fifths",
  "lead_8_bass__lead",
  "pad_1_new_age",
  "pad_2_warm",
  "pad_3_polysynth",
  "pad_4_choir",
  "pad_5_bowed",
  "pad_6_metallic",
  "pad_7_halo",
  "pad_8_sweep",
  "fx_1_rain",
  "fx_2_soundtrack",
  "fx_3_crystal",
  "fx_4_atmosphere",
  "fx_5_brightness",
  "fx_6_goblins",
  "fx_7_echoes",
  "fx_8_scifi",
  "sitar",
  "banjo",
  "shamisen",
  "koto",
  "kalimba",
  "bagpipe",
  "fiddle",
  "shanai",
  "tinkle_bell",
  "agogo",
  "steel_drums",
  "woodblock",
  "taiko_drum",
  "melodic_tom",
  "synth_drum",
  "reverse_cymbal",
  "guitar_fret_noise",
  "breath_noise",
  "seashore",
  "bird_tweet",
  "telephone_ring",
  "helicopter",
  "applause",
  "gunshot",
  // **AND THERE ARE 129, NOT 128** — abcjs appends `percussion` past the end of General
  // MIDI so channel 10 can be named the same way.
  "percussion",
];

/**
 * `supportsAudio()` — abcjs's own three-part test, and its own caveat: `AudioContext.resume`
 * cannot be detected without creating a context, which needs a user gesture, so this is
 * "close" rather than certain (`synth/supports-audio.js`).
 *
 * **AND IT RETURNS `undefined` WHEN THERE IS NO ACTIVE CONTEXT**, not `false` — the last
 * arm is `if (aac) return aac.resume !== undefined` with no else. Reproduced.
 */
export function supportsAudio(): boolean | undefined {
  const w = globalThis as unknown as Record<string, unknown>;
  if (!w["Promise"]) return false;
  const nav = w["navigator"] as Record<string, unknown> | undefined;
  if (
    !w["AudioContext"] &&
    !w["webkitAudioContext"] &&
    !nav?.["mozAudioContext"] &&
    !nav?.["msAudioContext"]
  ) {
    return false;
  }
  const aac = activeAudioContext();
  if (aac) return (aac as { resume?: unknown }).resume !== undefined;
  return undefined;
}

let audioContext: unknown = null;

/** `registerAudioContext(ac)` — the host hands in its own, since only it can create one. */
export function registerAudioContext(ac?: unknown): boolean | undefined {
  if (ac) audioContext = ac;
  return supportsAudio();
}

/** `activeAudioContext()` — whatever was registered, or null. */
export function activeAudioContext(): unknown {
  return audioContext;
}

export interface MidiFileParams extends MidiFileOptions {
  /** `"encoded"` (a data URI), `"binary"` (bytes), or a download link (the default). */
  readonly midiOutputType?: "encoded" | "binary" | "link";
  readonly downloadClass?: string;
  readonly preTextDownload?: string;
  readonly postTextDownload?: string;
  readonly downloadLabel?: string | ((tune: unknown, index: number) => string);
  readonly fileName?: string;
}

/**
 * `abcjs.synth.getMidiFile(source, options)` — the same MIDI our byte-exact writer
 * produces, in whichever of abcjs's three wrappers the host asked for
 * (`synth/get-midi-file.js`).
 *
 * `"binary"` is abcjs's own decode of its own encoding: the data URI is escaped three
 * characters per byte (`%4d`), except for the literal `MThd` and `MTrk` which it puts BACK
 * into that form before decoding. Reproduced, quirk and all.
 */
export function getMidiFileFor(
  scores: readonly Score[],
  titles: readonly (string | undefined)[],
  params: MidiFileParams = {},
): (string | Uint8Array)[] {
  return scores.map((score, index) => {
    const encoded = midiFile(score, params);
    if (params.midiOutputType === "encoded") return encoded;
    if (params.midiOutputType === "binary") {
      let decoded = encoded.replace("data:audio/midi,", "");
      decoded = decoded
        .replace(/MThd/g, "%4d%54%68%64")
        .replace(/MTrk/g, "%4d%54%72%6b");
      const out = new Uint8Array(decoded.length / 3);
      for (let i = 0; i < decoded.length / 3; i += 1) {
        out[i] = Number.parseInt(decoded.substring(i * 3 + 1, i * 3 + 3), 16);
      }
      return out;
    }
    return downloadLink(encoded, titles[index], index, params);
  });
}

function downloadLink(
  midi: string,
  rawTitle: string | undefined,
  index: number,
  params: MidiFileParams,
): string {
  const classes = ["abcjs-download-midi", `abcjs-midi-${index}`];
  if (params.downloadClass !== undefined) classes.push(params.downloadClass);
  let html = `<div class="${classes.join(" ")}">`;
  if (params.preTextDownload !== undefined) html += params.preTextDownload;
  const title =
    rawTitle !== undefined && rawTitle !== "" ? rawTitle : "Untitled";
  const label =
    typeof params.downloadLabel === "function"
      ? params.downloadLabel(null, index)
      : params.downloadLabel !== undefined
        ? params.downloadLabel.replace(/%T/, title)
        : `Download MIDI for "${title}"`;
  // The filename is the title lower-cased with every non-word run collapsed — and abcjs's
  // `replace(/__/g, '_')` runs ONCE, so three underscores become two rather than one.
  const slug = title
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\W/g, "_")
    .replace(/__/g, "_");
  const filename = params.fileName ?? `${slug}.midi`;
  html += `<a download="${filename}" href="${midi}">${label}</a>`;
  if (params.postTextDownload !== undefined) html += params.postTextDownload;
  return `${html}</div>`;
}
