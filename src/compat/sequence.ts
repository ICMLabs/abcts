import type { AbcElement, AbcLine, AbcStaff } from "./lines.js";

/**
 * **`synth.sequence` — THE INTERMEDIATE, WHICH IS WHAT abcjs PLAYS FROM.**
 *
 * A line-by-line port of `synth/abc_midi_sequencer.js` and `synth/repeats.js`. It walks
 * `tune.lines[].staff[].voices[]` — the very elements a host reads — unrolls the repeats,
 * and hands back one array per VOICE of reduced copies with a running `timing`, plus
 * `instrument` / `tempo` / `key` / `meter` / `beat` / `transpose` rows spliced in wherever
 * the state changes. `flatten` then turns that into `{cmd: 'note'}` tracks.
 *
 * **IT IS A SECOND WALK OVER A SECOND INPUT, AND THAT IS THE POINT.** Our own flattener
 * runs over the PARSE MODEL and never touches the projection, which is what keeps audio
 * independent of the renderer; this runs over the projection, exactly as abcjs's does. So
 * the two re-derive the same music from different sides — the argument
 * `tests/setupevents.test.ts` and the MIDI writer are already built on — and its gate is
 * 4,795 rows over both corpora.
 *
 * Five things in here are abcjs's and would be wrong if intuited:
 *
 * - **A ZERO-LENGTH NOTE IS TIMED AS A QUARTER** — `elem.duration === 0 ? 0.25` — which is
 *   the same rule `getDurationClass` states from the other side.
 * - **A SPACER IS NOT AN EVENT AT ALL** and takes no time, where an invisible rest does.
 * - **A DYNAMIC IS A `beat` ROW, NOT A VOLUME**, and a crescendo is a per-note STEP
 *   computed from how many notes stand before its close — `numNotesToDecoration` counts
 *   over the SOURCE LINE's array, so a hairpin that closes on the next line reaches
 *   nothing.
 * - **A TEMPO CHANGE IN ANY VOICE REACHES EVERY VOICE** — `insertTempoChanges` keys the
 *   table by WRITTEN POSITION and splices, which is why a `:|` back to the head restores
 *   the opening tempo rather than repeating the change.
 * - ⚠️ **`addIfDifferent` LOOKS BACK FOR THE LAST ROW OF ITS OWN TYPE AND STOPS THERE**, so
 *   a key that returns to a value already in force is dropped, and one that differs is
 *   appended however far back the last one was.
 */

/** One row of the answer. The shapes are abcjs's own, per `el_type`. */
export interface SequenceRow {
  el_type: string;
  [key: string]: unknown;
}

export interface SequenceOptions {
  readonly qpm?: number;
  readonly program?: number;
  readonly midiTranspose?: number;
  readonly channel?: number;
  readonly drum?: string;
  readonly drumBars?: number;
  readonly drumIntro?: number;
  readonly drumOff?: boolean;
}

/** What the sequencer reads off the tune — a `TuneObject` satisfies it. */
export interface SequenceTune {
  readonly lines: readonly AbcLine[];
  readonly formatting: Record<string, unknown>;
  readonly metaText: Record<string, unknown>;
  readonly visualTranspose?: number;
  readonly getBeatLength: () => number;
  readonly getPickupLength: () => number;
}

const PERCUSSION_PROGRAM = 128;

const VOLUMES: Record<string, number[]> = {
  pppp: [15, 10, 5, 1],
  ppp: [30, 20, 10, 1],
  pp: [45, 35, 20, 1],
  p: [60, 50, 35, 1],
  mp: [75, 65, 50, 1],
  mf: [90, 80, 65, 1],
  f: [105, 95, 80, 1],
  ff: [120, 110, 95, 1],
  fff: [127, 125, 110, 1],
  ffff: [127, 125, 110, 1],
};

const num = (v: unknown, fallback = 0): number => {
  const n = Number.parseInt(String(v), 10);
  return Number.isNaN(n) ? fallback : n;
};

/**
 * `startEndingNumbers` — `"1"`, `"1,3"`, `"1-3"` or a string that is none of those, which
 * yields no numbers at all and the ending is skipped (`repeats.js:207-234`).
 */
const startEndingNumbers = (startEnding: string): number[] => {
  const nums: number[] = [];
  if (startEnding.indexOf(",") > 0) {
    for (const part of startEnding.split(",")) {
      const ending = Number.parseInt(part, 10);
      if (ending > 0) nums.push(ending);
    }
  } else if (startEnding.indexOf("-") > 0) {
    const parts = startEnding.split("-");
    const se = Number.parseInt(parts[0] ?? "", 10);
    const ee = Number.parseInt(parts[1] ?? "", 10);
    for (let i = se; i <= ee; i += 1) nums.push(i);
  } else {
    const ending = Number.parseInt(startEnding, 10);
    if (ending > 0) nums.push(ending);
  }
  return nums;
};

const areKeysEqual = (a: SequenceRow, b: SequenceRow): boolean => {
  if (!a["accidentals"] || !b["accidentals"]) return false;
  return JSON.stringify(a["accidentals"]) === JSON.stringify(b["accidentals"]);
};

const duplicateItem = (src: SequenceRow): SequenceRow => {
  const item: SequenceRow = { ...src };
  if (Array.isArray(item["pitches"]))
    item["pitches"] = (item["pitches"] as unknown[]).map((p) =>
      p !== null && typeof p === "object" ? { ...(p as object) } : p,
    );
  return item;
};

/**
 * `duplicateSpan` — and its two guards are the whole of why an unrolled repeat does not
 * stutter: a bar meeting a bar is dropped, and a `key` / `meter` / `tempo` / `instrument`
 * row equal to the last one of its type is skipped (`repeats.js:161-191`).
 */
function duplicateSpan(
  input: readonly SequenceRow[],
  output: SequenceRow[],
  rawStart: number,
  end: number,
): void {
  let start = rawStart < 0 ? 0 : rawStart;
  if (
    output.length > 0 &&
    input[start]?.el_type === "bar" &&
    output[output.length - 1]?.el_type === "bar"
  )
    start += 1;

  for (let i = start; i <= end; i += 1) {
    const item = input[i];
    if (item === undefined) continue;
    let skip = false;
    if (
      item.el_type === "key" ||
      item.el_type === "meter" ||
      item.el_type === "tempo" ||
      item.el_type === "instrument"
    ) {
      let index = output.length - 1;
      while (index >= 0 && output[index]?.el_type !== item.el_type) index -= 1;
      const prior = index >= 0 ? output[index] : undefined;
      if (prior !== undefined) {
        if (item.el_type === "key" && areKeysEqual(item, prior)) skip = true;
        else if (
          item.el_type === "meter" &&
          item["num"] === prior["num"] &&
          item["den"] === prior["den"]
        )
          skip = true;
        else if (item.el_type === "instrument" && item["program"] === prior["program"])
          skip = true;
        else if (item.el_type === "tempo" && item["qpm"] === prior["qpm"]) skip = true;
      }
    }
    if (!skip) output.push(duplicateItem(item));
  }
}

interface Section {
  type: "startRepeat" | "endRepeat" | "startEnding";
  index: number;
  endings?: number[];
  end?: number;
}

interface RepeatSpan {
  start: number;
  end?: number;
}

/**
 * `Repeats` — the marker list a voice's barlines leave behind, and the unrolling it
 * implies (`synth/repeats.js`). **TWO `:|` IN A ROW IS A NOTATION ERROR IT RECOVERS FROM**
 * by pretending a `|:` stood before the second, and an ending list is SPARSE: `|1,3` fills
 * slots 1 and 3 and leaves 2 a hole, which the copy loop skips.
 */
class Repeats {
  private readonly sections: Section[] = [{ type: "startRepeat", index: -1 }];

  constructor(private readonly voice: SequenceRow[]) {}

  addBar(elem: AbcElement): void {
    const thisIndex = this.voice.length - 1;
    const isStartRepeat = elem.type === "bar_left_repeat" || elem.type === "bar_dbl_repeat";
    const isEndRepeat = elem.type === "bar_right_repeat" || elem.type === "bar_dbl_repeat";
    const startEnding =
      elem.startEnding === undefined ? undefined : startEndingNumbers(String(elem.startEnding));
    if (isEndRepeat) {
      const last = this.sections[this.sections.length - 1];
      if (this.sections.length > 0 && last?.type === "endRepeat")
        this.sections.push({ type: "startRepeat", index: last.index });
      this.sections.push({ type: "endRepeat", index: thisIndex });
    }
    if (startEnding)
      this.sections.push({ type: "startEnding", index: thisIndex, endings: startEnding });
    if (isStartRepeat) this.sections.push({ type: "startRepeat", index: thisIndex });
  }

  resolveRepeats(): SequenceRow[] {
    const voice = this.voice;
    const lastSection = this.sections[this.sections.length - 1] as Section;
    const lastElement = voice.length - 1;
    if (lastSection.type === "startRepeat") lastSection.end = lastElement;
    else if (lastSection.index + 1 < lastElement)
      this.sections.push({ type: "startRepeat", index: lastSection.index + 1 });

    // If there are no repeats then don't bother copying anything.
    if (this.sections.length < 2) return voice;

    const repeatInstructions: { common: RepeatSpan; endings?: (RepeatSpan | undefined)[] }[] = [];
    let currentRepeat: { common: RepeatSpan; endings?: (RepeatSpan | undefined)[] } | null = null;
    for (let i = 0; i < this.sections.length; i += 1) {
      const section = this.sections[i] as Section;
      switch (section.type) {
        case "startRepeat": {
          if (currentRepeat) {
            if (!currentRepeat.common.end) currentRepeat.common.end = section.index;
            if (currentRepeat.endings) {
              for (const ending of currentRepeat.endings)
                if (ending && !ending.end && ending.start !== section.index)
                  ending.end = section.index;
            }
            // If the last event was an end repeat, there is one more repeat of just the
            // common area — only when there are ending markers.
            if (
              this.sections[i - 1]?.type === "endRepeat" &&
              currentRepeat.endings &&
              currentRepeat.endings.length
            )
              currentRepeat.endings[currentRepeat.endings.length] = { start: -1, end: -1 };
            repeatInstructions.push(currentRepeat);

            // If there is a gap between the last event and this start, insert those items.
            let lastUsed = currentRepeat.common.end ?? 0;
            if (currentRepeat.endings) {
              for (const ending of currentRepeat.endings)
                if (ending) lastUsed = Math.max(lastUsed, ending.end ?? 0);
            }
            if (lastUsed < section.index - 1)
              repeatInstructions.push({ common: { start: lastUsed + 1, end: section.index } });
          }
          currentRepeat = { common: { start: section.index } };
          break;
        }
        case "startEnding": {
          if (currentRepeat) {
            if (!currentRepeat.common.end) currentRepeat.common.end = section.index;
            if (!currentRepeat.endings) currentRepeat.endings = [];
            for (const slot of section.endings ?? [])
              currentRepeat.endings[slot] = { start: section.index + 1 };
          }
          break;
        }
        case "endRepeat": {
          if (currentRepeat) {
            if (!currentRepeat.endings) currentRepeat.endings = [];
            if (currentRepeat.endings.length > 0) {
              for (const ending of currentRepeat.endings)
                if (ending && !ending.end) ending.end = section.index;
            }
            // A repeat that doesn't have first and second endings.
            if (!currentRepeat.common.end) currentRepeat.common.end = section.index;
          }
          break;
        }
      }
    }
    if (currentRepeat) {
      if (!currentRepeat.common.end) currentRepeat.common.end = lastElement;
      if (currentRepeat.endings) {
        for (const ending of currentRepeat.endings)
          if (ending && !ending.end) ending.end = lastElement;
      }
      repeatInstructions.push(currentRepeat);
    }

    const output: SequenceRow[] = [];
    for (const instructions of repeatInstructions) {
      const common = instructions.common;
      if (!instructions.endings) {
        duplicateSpan(voice, output, common.start, common.end ?? 0);
      } else if (instructions.endings.length === 0) {
        // No endings specified — it is just a repeat.
        duplicateSpan(voice, output, common.start, common.end ?? 0);
        duplicateSpan(voice, output, common.start, common.end ?? 0);
      } else {
        for (const ending of instructions.endings) {
          // A SPARSE array — `|1,3` leaves slot 2 a hole, which is skipped.
          if (!ending) continue;
          duplicateSpan(voice, output, common.start, common.end ?? 0);
          if (ending.start > 0) duplicateSpan(voice, output, ending.start, ending.end ?? 0);
        }
      }
    }
    return output;
  }
}

/** `getTrackTitle` — the STAFF at the voice's index, and its `title` joined with a space. */
const getTrackTitle = (
  staves: readonly AbcStaff[] | undefined,
  voiceNumber: number,
): string | undefined => {
  const staff = staves?.[voiceNumber] as { title?: readonly string[] } | undefined;
  if (staves === undefined || staves.length <= voiceNumber || !staff?.title) return undefined;
  return staff.title.join(" ");
};

/** `interpretTempo` — the rate restated at the tune's own beat length. */
const interpretTempo = (element: AbcElement, beatLength: number): number => {
  const durations = element.duration;
  const duration = Array.isArray(durations) ? (durations[0] as number) : 0.25;
  const bpm = typeof element.bpm === "number" ? element.bpm : 60;
  return (duration * bpm) / beatLength;
};

export function sequenceOf(
  abctune: SequenceTune,
  options: SequenceOptions = {},
): SequenceRow[][] {
  let measureLength = 1;

  /** `interpretMeter` — and it SETS `measureLength`, which the drum intro then reads. */
  const interpretMeter = (element: AbcElement): SequenceRow => {
    switch (element.type) {
      case "common_time":
        measureLength = 4 / 4;
        return { el_type: "meter", num: 4, den: 4 };
      case "cut_time":
        measureLength = 2 / 2;
        return { el_type: "meter", num: 2, den: 2 };
      case "specified": {
        // Only the first meter, so the complex meters are not handled — abcjs's own note.
        let numerator = 0;
        const first = element.value?.[0];
        if (first !== undefined && first.num.indexOf("+") > 0) {
          for (const part of first.num.split("+")) numerator += num(part);
        } else numerator = num(first?.num);
        measureLength = numerator / num(first?.den, 1);
        return { el_type: "meter", num: numerator, den: first?.den };
      }
      default:
        measureLength = 1;
        return { el_type: "meter" };
    }
  };

  const addIfDifferent = (arr: SequenceRow[], item: SequenceRow): void => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i]?.el_type === item.el_type) {
        if (JSON.stringify(arr[i]) !== JSON.stringify(item)) arr.push(item);
        return;
      }
    }
    arr.push(item);
  };

  const removeNaturals = (
    accidentals: readonly { acc: string; note: string; verticalPos: number }[],
  ): unknown[] => accidentals.filter((a) => a.acc !== "natural");

  const addKey = (arr: SequenceRow[], key: AbcElement): void => {
    const newKey: SequenceRow =
      key.root === "HP"
        ? {
            el_type: "key",
            accidentals: [
              { acc: "natural", note: "g" },
              { acc: "sharp", note: "f" },
              { acc: "sharp", note: "c" },
            ],
          }
        : { el_type: "key", accidentals: removeNaturals(key.accidentals ?? []) };
    addIfDifferent(arr, newKey);
  };

  const addMeter = (arr: SequenceRow[], meter: AbcElement): void => {
    addIfDifferent(arr, interpretMeter(meter));
  };

  /** How many NOTES stand between here and the decoration that closes the hairpin. */
  const numNotesToDecoration = (
    voice: readonly AbcElement[],
    start: number,
    decoration: string,
  ): number => {
    let counter = 0;
    for (let i = start + 1; i < voice.length; i += 1) {
      const el = voice[i];
      if (el?.el_type === "note") counter += 1;
      if (el?.decoration && el.decoration.indexOf(decoration) >= 0) return counter;
    }
    return counter;
  };

  /** A volume within a couple of notes of the end is taken to be the hairpin's target. */
  const endingVolume = (
    voice: readonly AbcElement[],
    start: number,
    volumeDecorations: readonly string[],
  ): string | null => {
    const end = Math.min(voice.length, start + 3);
    for (let i = start; i < end; i += 1) {
      const el = voice[i];
      if (el?.el_type === "note" && el.decoration) {
        for (const d of el.decoration) if (volumeDecorations.indexOf(d) >= 0) return d;
      }
    }
    return null;
  };

  const chordVoiceOffThisBar = (voices: SequenceRow[][]): void => {
    for (const voice of voices) {
      let j = voice.length - 1;
      while (j >= 0 && voice[j]?.el_type !== "bar") {
        (voice[j] as SequenceRow)["noChordVoice"] = true;
        j -= 1;
      }
    }
  };

  const insertTempoChanges = (
    voices: SequenceRow[][],
    tempoChanges: Record<string, SequenceRow>,
  ): void => {
    const changePositions = Object.keys(tempoChanges);
    if (changePositions.length === 0) return;
    for (let i = 0; i < voices.length; i += 1) {
      const voice = voices[i] as SequenceRow[];
      // Don't insert redundant changes — this happens normally when repeating from the
      // beginning, but could happen anywhere the marking equals the one in force.
      let lastTempo = tempoChanges["0"] ? (tempoChanges["0"]["qpm"] as number) : 0;
      for (let j = 0; j < voice.length; j += 1) {
        const el = voice[j] as SequenceRow;
        if (el.el_type === "tempo") lastTempo = el["qpm"] as number;
        const at = `${el["timing"]}`;
        const change = tempoChanges[at];
        if (changePositions.indexOf(at) >= 0 && change !== undefined && lastTempo !== change["qpm"]) {
          lastTempo = change["qpm"] as number;
          if (el.el_type === "tempo") {
            el["qpm"] = change["qpm"];
            // A tempo element's neighbour has the same timing and must not match twice.
            j += 1;
          } else {
            voice.splice(j, 0, {
              el_type: "tempo",
              qpm: change["qpm"],
              timing: el["timing"],
            });
            j += 2;
          }
        }
      }
    }
  };

  // ── The globals, in abcjs's own order ──
  let qpm: number;
  let program = num(options.program ?? 0);
  let transpose = num(options.midiTranspose ?? 0);
  if (abctune.visualTranspose) transpose -= abctune.visualTranspose;
  let channel = num(options.channel ?? 0);
  let channelExplicitlySet = false;
  let drumPatternRaw = options.drum ?? "";
  let drumBars = num(options.drumBars ?? 1);
  const drumIntro = num(options.drumIntro ?? 0);
  let drumOn = drumPatternRaw !== "";
  let drumOffAfterIntro = !!options.drumOff;
  const style: (string | undefined)[] = [];
  const crescendoSize = 50;

  if (channel === 10) program = PERCUSSION_PROGRAM;
  let drumPattern: unknown = drumPatternRaw.split(" ");

  const bagpipes = abctune.formatting["bagpipes"];
  if (bagpipes) program = 71;

  const startingMidi: SequenceRow[] = [];
  const globals = abctune.formatting["midi"] as Record<string, unknown[]> | undefined;
  if (globals) {
    const declared = globals["program"];
    if (declared && declared.length > 0) {
      program = declared[0] as number;
      if (declared.length > 1) {
        program = declared[1] as number;
        channel = declared[0] as number;
      }
      channelExplicitlySet = true;
    }
    if (globals["transpose"]) transpose = globals["transpose"][0] as number;
    if (globals["channel"]) {
      channel = globals["channel"][0] as number;
      channelExplicitlySet = true;
    }
    if (globals["drum"]) drumPattern = globals["drum"];
    if (globals["drumbars"]) drumBars = globals["drumbars"][0] as number;
    if (globals["drumon"]) drumOn = true;
    if (channel === 10) program = PERCUSSION_PROGRAM;
    if (globals["beat"]) startingMidi.push({ el_type: "beat", beats: globals["beat"] });
    if (globals["nobeataccents"])
      startingMidi.push({ el_type: "beataccents", value: false });
  }

  // The tempo passed in wins; then the tune's; then abcjs's own 180.
  const metaTempo = abctune.metaText["tempo"] as { bpm?: number } | undefined;
  if (options.qpm) qpm = num(options.qpm);
  else if (metaTempo)
    qpm = interpretTempo(metaTempo as AbcElement, abctune.getBeatLength());
  else qpm = 180;

  const startVoice: SequenceRow[] = [];
  if (bagpipes) startVoice.push({ el_type: "bagpipes" });
  startVoice.push({ el_type: "instrument", program });
  if (channel) startVoice.push({ el_type: "channel", channel });
  if (transpose) startVoice.push({ el_type: "transpose", transpose });
  startVoice.push({ el_type: "tempo", qpm });
  for (const row of startingMidi) startVoice.push(row);

  const voices: SequenceRow[][] = [];
  const clefTransposeActive: boolean[] = [];
  const inCrescendo: (number | false)[] = [];
  const inDiminuendo: (number | false)[] = [];
  const durationCounter: number[] = [0];
  const tempoChanges: Record<string, SequenceRow> = {
    "0": { el_type: "tempo", qpm, timing: 0 },
  };
  let currentVolume: number[] = [105, 95, 85, 1];
  const repeats: Repeats[] = [];
  let startingDrumSet = false;

  for (const line of abctune.lines) {
    if (!line.staff) continue;
    const staves = line.staff;
    let voiceNumber = 0;
    for (const staff of staves) {
      if (staff.clef && staff.clef.type === "TAB") continue;

      for (let k = 0; k < staff.voices.length; k += 1) {
        const voice = staff.voices[k] ?? [];
        let target = voices[voiceNumber];
        if (!target) {
          target = JSON.parse(JSON.stringify(startVoice)) as SequenceRow[];
          voices[voiceNumber] = target;
          const voiceName = getTrackTitle(staves, voiceNumber);
          if (voiceName) target.unshift({ el_type: "name", trackName: voiceName });
          repeats[voiceNumber] = new Repeats(target);
        }
        const out = target;
        const repeat = repeats[voiceNumber] as Repeats;

        // Negate any transposition for the percussion staff.
        if (transpose && staff.clef?.type === "perc")
          out.push({ el_type: "transpose", transpose: 0 });

        if (staff.clef && staff.clef.type === "perc" && !channelExplicitlySet) {
          for (const row of out)
            if (row.el_type === "instrument") row["program"] = PERCUSSION_PROGRAM;
        } else if (staff.key) {
          addKey(out, staff.key);
        }
        if (staff.meter) addMeter(out, staff.meter);
        // The drum information is only needed once, so use the first line and track 0.
        if (!startingDrumSet && drumOn) {
          out.push({
            el_type: "drum",
            params: { pattern: drumPattern, bars: drumBars, on: drumOn, intro: drumIntro },
          });
          startingDrumSet = true;
        }
        const clefTranspose = (staff.clef as { transpose?: number } | undefined)?.transpose;
        if (staff.clef && staff.clef.type !== "perc" && clefTranspose) {
          out.push({ el_type: "transpose", transpose: clefTranspose });
          clefTransposeActive[voiceNumber] = false;
        }
        if (staff.clef?.type) {
          if (staff.clef.type.indexOf("-8") >= 0) {
            out.push({ el_type: "transpose", transpose: -12 });
            clefTransposeActive[voiceNumber] = true;
          } else if (staff.clef.type.indexOf("+8") >= 0) {
            out.push({ el_type: "transpose", transpose: 12 });
            clefTransposeActive[voiceNumber] = true;
          } else if (clefTransposeActive[voiceNumber]) {
            // A previous treble+8 and now a regular clef cancels the transposition.
            out.push({ el_type: "transpose", transpose: 0 });
            clefTransposeActive[voiceNumber] = false;
          }
        }

        const formattingMidi = abctune.formatting["midi"] as Record<string, unknown> | undefined;
        if (formattingMidi?.["drumoff"]) {
          // A drum-off right at the beginning goes to the metaText instead of the stream.
          out.push({ el_type: "bar" });
          out.push({ el_type: "drum", params: { pattern: "", on: false } });
        }

        let noteEventsInBar = 0;
        let tripletMultiplier = 0;
        let tripletDurationTotal = 0;
        let tripletDurationCount = 0;
        currentVolume = [105, 95, 85, 1];

        /** `setDynamics` — a dynamic REPLACES the running volume and emits a `beat` row. */
        const setDynamics = (elem: AbcElement, at: number): void => {
          if (!elem.decoration) return;
          let dynamicType: string | undefined;
          // abcjs's own order, prefixes and all: `p` is tested before `mp`, so a `mp`
          // never matches `p` only because `indexOf` is an exact list membership.
          for (const name of ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff"]) {
            if (dynamicType === undefined && elem.decoration.indexOf(name) >= 0)
              dynamicType = name;
          }
          if (dynamicType) {
            currentVolume = [...(VOLUMES[dynamicType] as number[])];
            let volumesPerNotePitch: number[][] = [currentVolume];
            if (Array.isArray(elem.decoration)) {
              volumesPerNotePitch = [];
              for (const d of elem.decoration)
                if (d in VOLUMES) volumesPerNotePitch.push([...(VOLUMES[d] as number[])]);
            }
            out.push({
              el_type: "beat",
              beats: [...currentVolume],
              volumesPerNotePitch,
            });
            inCrescendo[k] = false;
            inDiminuendo[k] = false;
          }

          if (elem.decoration.indexOf("crescendo(") >= 0) {
            const n = numNotesToDecoration(voice, at, "crescendo)");
            let top = Math.min(127, (currentVolume[0] as number) + crescendoSize);
            const endDec = endingVolume(voice, at + n + 1, Object.keys(VOLUMES));
            if (endDec) top = (VOLUMES[endDec] as number[])[0] as number;
            inCrescendo[k] = n > 0 ? Math.floor((top - (currentVolume[0] as number)) / n) : false;
            inDiminuendo[k] = false;
          } else if (elem.decoration.indexOf("crescendo)") >= 0) {
            inCrescendo[k] = false;
          } else if (elem.decoration.indexOf("diminuendo(") >= 0) {
            const n2 = numNotesToDecoration(voice, at, "diminuendo)");
            let bottom = Math.max(15, (currentVolume[0] as number) - crescendoSize);
            const endDec2 = endingVolume(voice, at + n2 + 1, Object.keys(VOLUMES));
            if (endDec2) bottom = (VOLUMES[endDec2] as number[])[0] as number;
            inCrescendo[k] = false;
            inDiminuendo[k] =
              n2 > 0 ? Math.floor((bottom - (currentVolume[0] as number)) / n2) : false;
          } else if (elem.decoration.indexOf("diminuendo)") >= 0) {
            inDiminuendo[k] = false;
          }
        };

        for (let v = 0; v < voice.length; v += 1) {
          const elem = voice[v] as AbcElement & { style?: string; head?: string; transpose?: number };
          switch (elem.el_type) {
            case "note": {
              const step = inCrescendo[k] || inDiminuendo[k];
              if (step) {
                currentVolume[0] = (currentVolume[0] as number) + step;
                currentVolume[1] = (currentVolume[1] as number) + step;
                currentVolume[2] = (currentVolume[2] as number) + step;
                out.push({ el_type: "beat", beats: [...currentVolume] });
              }
              setDynamics(elem, v);

              // Regular items are just pushed — a SPACER is not one of them.
              if (!elem.rest || elem.rest.type !== "spacer") {
                const noteElem: SequenceRow = {
                  elem,
                  el_type: "note",
                  timing: durationCounter[voiceNumber] as number,
                };
                if (elem.style) noteElem["style"] = elem.style;
                else if (style[voiceNumber]) noteElem["style"] = style[voiceNumber];
                const written = typeof elem.duration === "number" ? elem.duration : 0;
                let duration = written === 0 ? 0.25 : written;
                if (elem.startTriplet) {
                  tripletMultiplier = elem.tripletMultiplier ?? 0;
                  tripletDurationTotal = elem.startTriplet * tripletMultiplier * written;
                  // Most commonly `(3:2:2`.
                  if (elem.startTriplet !== elem.tripletR) {
                    const r = elem.tripletR ?? 0;
                    if (v + r <= voice.length) {
                      let durationTotal = 0;
                      for (let w = v; w < v + r; w += 1) {
                        const d = voice[w]?.duration;
                        durationTotal += typeof d === "number" ? d : 0;
                      }
                      tripletDurationTotal = tripletMultiplier * durationTotal;
                    }
                  }
                  duration = Math.round(duration * tripletMultiplier * 1000000) / 1000000;
                  tripletDurationCount = duration;
                } else if (tripletMultiplier) {
                  if (elem.endTriplet) {
                    tripletMultiplier = 0;
                    duration =
                      Math.round((tripletDurationTotal - tripletDurationCount) * 1000000) /
                      1000000;
                  } else {
                    duration = Math.round(duration * tripletMultiplier * 1000000) / 1000000;
                    tripletDurationCount += duration;
                  }
                }
                noteElem["duration"] = duration;
                if (elem.rest) noteElem["rest"] = elem.rest;
                if (elem.decoration) noteElem["decoration"] = [...elem.decoration];
                if (elem.pitches)
                  noteElem["pitches"] = elem.pitches.map((p) => ({ ...p }));
                if (elem.gracenotes)
                  noteElem["gracenotes"] = elem.gracenotes.map((g) => ({ ...g }));
                if (elem.chord) noteElem["chord"] = elem.chord.map((c) => ({ ...c }));

                out.push(noteElem);
                if (elem.style === "rhythm") chordVoiceOffThisBar(voices);
                noteEventsInBar += 1;
                durationCounter[voiceNumber] = (durationCounter[voiceNumber] as number) + duration;
              }
              break;
            }
            case "key":
            case "keySignature":
              addKey(out, elem);
              break;
            case "meter":
              addMeter(out, elem);
              break;
            case "clef":
              // Kept only to catch the `transpose` element.
              if (elem.transpose) out.push({ el_type: "transpose", transpose: elem.transpose });
              if (elem.type) {
                if (elem.type.indexOf("-8") >= 0) out.push({ el_type: "transpose", transpose: -12 });
                else if (elem.type.indexOf("+8") >= 0)
                  out.push({ el_type: "transpose", transpose: 12 });
              }
              break;
            case "tempo": {
              qpm = interpretTempo(elem, abctune.getBeatLength());
              const timing = durationCounter[voiceNumber] as number;
              out.push({ el_type: "tempo", qpm, timing });
              tempoChanges[`${timing}`] = { el_type: "tempo", qpm, timing };
              break;
            }
            case "bar":
              // Don't add two bars in a row. The marking resets the accidentals.
              if (noteEventsInBar > 0) out.push({ el_type: "bar" });
              setDynamics(elem, v);
              noteEventsInBar = 0;
              repeat.addBar(elem);
              break;
            case "style":
              style[voiceNumber] = elem.head;
              break;
            case "timeSignature":
              out.push(interpretMeter(elem));
              break;
            case "part":
            case "stem":
            case "scale":
            case "break":
            case "font":
              // These elements don't affect sound.
              break;
            case "midi": {
              let drumChange = false;
              const params = elem.params ?? [];
              switch (elem.cmd) {
                case "drumon":
                  drumOn = true;
                  drumChange = true;
                  break;
                case "drumoff":
                  drumOn = false;
                  drumChange = true;
                  break;
                case "drum":
                  drumPattern = params;
                  drumChange = true;
                  break;
                case "drumbars":
                  drumBars = params[0] as number;
                  drumChange = true;
                  break;
                case "drummap":
                  // Handled before getting here.
                  break;
                case "channel":
                  // Only the percussion channel matters here.
                  if (params[0] === 10)
                    out.push({ el_type: "instrument", program: PERCUSSION_PROGRAM });
                  break;
                case "program":
                  addIfDifferent(out, { el_type: "instrument", program: params[0] });
                  channelExplicitlySet = true;
                  break;
                case "transpose":
                  out.push({ el_type: "transpose", transpose: params[0] });
                  break;
                case "gchordoff":
                  out.push({ el_type: "gchordOn", tacet: true });
                  break;
                case "gchordon":
                  out.push({ el_type: "gchordOn", tacet: false });
                  break;
                case "beat":
                  out.push({ el_type: "beat", beats: params });
                  break;
                case "nobeataccents":
                  out.push({ el_type: "beataccents", value: false });
                  break;
                case "beataccents":
                  out.push({ el_type: "beataccents", value: true });
                  break;
                case "vol":
                case "volinc":
                  out.push({ el_type: elem.cmd, volume: params[0] });
                  break;
                case "swing":
                case "gchord":
                case "bassvol":
                case "chordvol":
                case "gchordbars":
                  out.push({ el_type: elem.cmd, param: params[0] });
                  break;
                case "bassprog":
                case "chordprog":
                  out.push({ el_type: elem.cmd, value: params[0], octaveShift: params[1] });
                  break;
                default:
                  break;
              }
              if (drumChange) {
                (voices[0] as SequenceRow[]).push({
                  el_type: "drum",
                  params: { pattern: drumPattern, bars: drumBars, intro: drumIntro, on: drumOn },
                });
                startingDrumSet = true;
              }
              break;
            }
            default:
              break;
          }
        }
        voiceNumber += 1;
        if (!durationCounter[voiceNumber]) durationCounter[voiceNumber] = 0;
      }
    }
  }

  for (let r = 0; r < repeats.length; r += 1)
    voices[r] = (repeats[r] as Repeats).resolveRepeats();

  // A tempo change must reach every voice, and only their elements can say where.
  insertTempoChanges(voices, tempoChanges);

  if (drumIntro) {
    const pickups = abctune.getPickupLength();
    // Add some measures of rests to the start of each track.
    for (const track of voices) {
      let insertPoint = 0;
      while (track[insertPoint]?.el_type !== "note" && track.length > insertPoint) insertPoint += 1;
      if (track.length > insertPoint) {
        for (let w = 0; w < drumIntro; w += 1) {
          // On the last measure of intro, subtract the pickups.
          if (pickups === 0 || w < drumIntro - 1) {
            track.splice(
              insertPoint,
              0,
              { el_type: "note", rest: { type: "rest" }, duration: measureLength },
              { el_type: "bar" },
            );
            insertPoint += 2;
          } else {
            track.splice(insertPoint, 0, {
              el_type: "note",
              rest: { type: "rest" },
              duration: measureLength - pickups,
            });
            insertPoint += 1;
          }
        }
        if (drumOffAfterIntro) {
          drumOn = false;
          track.splice(insertPoint, 0, {
            el_type: "drum",
            params: { pattern: drumPattern, bars: drumBars, intro: drumIntro, on: drumOn },
          });
          insertPoint += 1;
          drumOffAfterIntro = false;
        }
      }
    }
  }
  const firstVoice = voices[0];
  if (voices.length > 0 && firstVoice !== undefined && firstVoice.length > 0)
    (firstVoice[0] as SequenceRow)["pickupLength"] = abctune.getPickupLength();
  return voices;
}
