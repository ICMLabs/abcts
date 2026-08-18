import type { AbcElement, AbcLine, AbcStaff } from "./lines.js";

/**
 * **`resolveOverlays` — WHAT AN `&` ACTUALLY IS IN `tune.lines`.**
 *
 * A LINE-BY-LINE PORT of `tune-builder.js:515-620`, run as a pass over the finished lines
 * exactly as abcjs runs it in `cleanUp` — and it is a port rather than a rewrite because
 * every step of it is observable in the element stream a host reads.
 *
 * abcjs's parser puts an overlay layer's notes in the SAME voice as the music above them,
 * with an `{el_type: "overlay"}` element marking the `&`. `resolveOverlays` then, per
 * staff and per voice:
 *
 * - collects everything between the `&` and the barline that closes it into a NEW voice,
 *   with the barline itself and an `{el_type: "stem", direction: "down"}` at the front;
 * - **BACK-FILLS EVERY EARLIER LINE with a copy of each of its voices**, notes replaced by
 *   INVISIBLE RESTS of the same duration and the same span, so the layer exists on every
 *   system of the tune rather than only where it was written;
 * - snips the layer out of the voice it came from and leaves TWO more stems behind: an
 *   `auto` one after the snip and an `up` one at the last barline before it.
 *
 * Three stems per snip, and their POSITIONS are the whole of it — `synth-flattener-21`'s
 * first line is `[stem, note, stem, stem, bar, note, bar, stem]` and reproducing that was
 * the proof the port is right.
 *
 * ⚠️ **`findLastBar`'s LOOP CONDITION IS `i > 0`, so it stops at index 0 whatever is
 * there** — an overlay in the first measure of a line puts its `up` stem at the very front
 * rather than at a barline. Ported as written.
 *
 * ⚠️ **AND THE VOICE-USEFULNESS SWEEP IS abcjs's OWN "not sure how that happened"**
 * (`:113-124`): after resolving, any voice holding no note that is either pitched or
 * carries a chord is DELETED from every line. The `while` around it is abcjs's too — one
 * pass resolves one `&` per voice, so `B4 & d4 & f4` takes two.
 */

type MutableStaff = { voices: AbcElement[][] } & Record<string, unknown>;
type MutableLine = { staff?: MutableStaff[] } & Record<string, unknown>;

/** `findLastBar` — and its `i > 0` guard is load-bearing (`tune-builder.js:626-631`). */
const findLastBar = (voice: readonly AbcElement[], start: number): number => {
  let i = start - 1;
  for (; i > 0 && voice[i]?.el_type !== "bar"; i -= 1);
  return i;
};

const durationOf = (e: AbcElement): number =>
  typeof e.duration === "number" ? e.duration : 0;

/** One pass. Returns whether anything was resolved, as abcjs's does. */
function resolvePass(lines: MutableLine[]): boolean {
  let madeChanges = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line?.staff === undefined) continue;
    for (const staff of line.staff) {
      const overlayVoice: {
        hasOverlay: boolean;
        voice: AbcElement[];
        snip: { start: number; len: number }[];
      }[] = [];
      for (let k = 0; k < staff.voices.length; k += 1) {
        const voice = staff.voices[k] ?? [];
        const acc = { hasOverlay: false, voice: [] as AbcElement[], snip: [] as { start: number; len: number }[] };
        overlayVoice.push(acc);
        let durationThisBar = 0;
        let inOverlay = false;
        let snipStart = -1;
        for (let kk = 0; kk < voice.length; kk += 1) {
          const event = voice[kk];
          if (event === undefined) continue;
          if (event.el_type === "overlay" && !inOverlay) {
            madeChanges = true;
            inOverlay = true;
            snipStart = kk;
            acc.hasOverlay = true;
            for (let ii = 0; ii < i; ii += 1) {
              const above = lines[ii];
              if (above?.staff === undefined) continue;
              for (const s of above.staff) {
                if (staff.voices.length < s.voices.length) continue;
                // `forEach`'s range is fixed before the first call, so the voices pushed
                // here are not themselves copied — abcjs relies on that.
                for (const v of [...s.voices]) {
                  const nv: AbcElement[] = [];
                  for (const ev of v) {
                    if (ev.el_type === "bar") nv.push(ev);
                    else if (ev.el_type === "note")
                      nv.push({
                        el_type: "note",
                        ...(ev.duration === undefined ? {} : { duration: ev.duration }),
                        rest: { type: "invisible" },
                        ...(ev.startChar === undefined ? {} : { startChar: ev.startChar }),
                        ...(ev.endChar === undefined ? {} : { endChar: ev.endChar }),
                      });
                  }
                  s.voices.push(nv);
                }
              }
            }
          } else if (event.el_type === "bar") {
            if (inOverlay) {
              inOverlay = false;
              acc.snip.push({ start: snipStart, len: kk - snipStart });
              acc.voice.push(event);
            } else {
              // Invisible rests keep the layer lined up when the `&` is not in the first
              // measure of the line.
              if (durationThisBar > 0)
                acc.voice.push({
                  el_type: "note",
                  duration: durationThisBar,
                  rest: { type: "invisible" },
                  ...(event.startChar === undefined ? {} : { startChar: event.startChar }),
                  ...(event.endChar === undefined ? {} : { endChar: event.endChar }),
                });
              acc.voice.push(event);
            }
            durationThisBar = 0;
          } else if (event.el_type === "note") {
            if (inOverlay) acc.voice.push(event);
            else if (event.rest === undefined || event.rest.type !== "spacer")
              durationThisBar += durationOf(event);
          } else if (
            event.el_type === "scale" ||
            event.el_type === "stem" ||
            event.el_type === "overlay" ||
            event.el_type === "style" ||
            event.el_type === "transpose" ||
            event.el_type === "color"
          ) {
            // These types are DUPLICATED onto the overlay layer rather than moved.
            acc.voice.push(event);
          }
        }
        if (acc.hasOverlay && acc.snip.length === 0)
          acc.snip.push({ start: snipStart, len: voice.length - snipStart });
      }
      for (let k = 0; k < overlayVoice.length; k += 1) {
        const ov = overlayVoice[k];
        if (ov === undefined || !ov.hasOverlay) continue;
        ov.voice.splice(0, 0, { el_type: "stem", direction: "down" });
        staff.voices.push(ov.voice);
        for (let kkk = ov.snip.length - 1; kkk >= 0; kkk -= 1) {
          const snip = ov.snip[kkk];
          const voice = staff.voices[k];
          if (snip === undefined || voice === undefined) continue;
          voice.splice(snip.start, snip.len);
          voice.splice(snip.start + 1, 0, { el_type: "stem", direction: "auto" });
          voice.splice(findLastBar(voice, snip.start), 0, {
            el_type: "stem",
            direction: "up",
          });
        }
        // An ending mark belongs to the voice it was written in, not to the layer.
        const last = staff.voices[staff.voices.length - 1] ?? [];
        for (let kkk = 0; kkk < last.length; kkk += 1) {
          const el = { ...(last[kkk] as AbcElement) };
          last[kkk] = el;
          if (el.el_type === "bar") {
            delete el.startEnding;
            delete el.endEnding;
          }
        }
      }
    }
  }
  return madeChanges;
}

/** `voiceUseful` — `'not-found'`, or whether any note of it is pitched or has a chord. */
const voiceUseful = (
  lines: readonly MutableLine[],
  voiceNum: number,
): boolean | "not-found" => {
  let isUseful = false;
  let voiceExists = false;
  for (const line of lines)
    for (const staff of line.staff ?? []) {
      if (voiceNum >= staff.voices.length) continue;
      voiceExists = true;
      for (const el of staff.voices[voiceNum] ?? [])
        if (el.el_type === "note" && (el.rest === undefined || el.chord !== undefined))
          isUseful = true;
    }
  return voiceExists ? isUseful : "not-found";
};

const deleteVoice = (lines: readonly MutableLine[], voiceNum: number): void => {
  for (const line of lines)
    for (const staff of line.staff ?? [])
      if (voiceNum < staff.voices.length) staff.voices.splice(voiceNum, 1);
};

/** Resolve every `&` in the projected lines, in place. */
export function resolveOverlays(input: readonly AbcLine[]): void {
  const lines = input as unknown as MutableLine[];
  let hadOverlays = false;
  while (resolvePass(lines)) hadOverlays = true;
  if (!hadOverlays) return;
  let voiceNum = 0;
  let isUseful = voiceUseful(lines, voiceNum);
  while (isUseful !== "not-found") {
    isUseful = voiceUseful(lines, voiceNum);
    if (isUseful === false) deleteVoice(lines, voiceNum);
    else voiceNum += 1;
  }
}

export type { AbcStaff };
