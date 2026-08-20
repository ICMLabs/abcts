import type { AbcElement, AbcLine, AbcStaff } from "./lines.js";

/**
 * **`tune.deline(options)` — abcjs's `tune.lines` WITH THE MUSIC LINES MERGED BACK.**
 *
 * A LINE-BY-LINE PORT of `data/deline-tune.js`, because this one is arithmetic-free
 * bookkeeping whose every branch is observable: which lines merge, which staff field moves
 * into the stream, and in what order. It is the one place in the compat surface where the
 * internal-freedom half of the ruling buys nothing.
 *
 * `tune.lines` is one line per DRAWN system; a host that wants the tune's stream rather
 * than its layout calls this. Because the staff's own furniture (`meter`, `key`, `clef`,
 * and four fonts) is stamped per LINE, merging has to put back anything that CHANGED at a
 * line boundary — as an element at the FRONT of every voice with `startChar`/`endChar` of
 * `-1`, deleted off the staff it came from.
 *
 * Three quirks that are abcjs's and not ours:
 *
 * - **THE UNSHIFTED ELEMENT'S `el_type` IS NOT THE STREAM'S NAME** — `meter`, `key` and
 *   `clef`, where the parser's own in-stream elements are `timeSignature`, `keySignature`
 *   and `clef` (`deline-tune.js:126`, `:135`, `:144`).
 * - **A NON-MUSIC LINE STOPS THE MERGE.** `inMusicLine` is cleared by any line with no
 *   `staff` — a `subtitle`, a `%%text`, a `%%sep`, a `%%vskip` — so the music line after
 *   one opens a NEW output line (`:84-87`). So does a line carrying a `vskip` of its own.
 * - **THE FIRST LINE RECORDS BUT NEVER MOVES.** The `else` arm seeds `currentKey`,
 *   `currentMeter` and `currentClef` and pushes the line whole, so its staff keeps every
 *   field (`:76-83`) — which is why a one-system tune's `deline` is its `lines`.
 *
 * `objEqual`'s `if (!input) return true` is the reason an ABSENT field never moves: "the
 * default is whatever the old output is" (`:167`).
 */
export interface DelineOptions {
  /** Push an `{el_type: "break"}` at every join — what `wrap_lines` asks for. */
  readonly lineBreaks?: boolean;
}

/** The mutable face of a projected line — `deline` clones before it writes. */
interface MutableStaff {
  voices: AbcElement[][];
  meter?: Record<string, unknown>;
  key?: Record<string, unknown>;
  clef?: Record<string, unknown>;
  title?: unknown;
  abbrevTitle?: unknown;
  vocalfont?: Record<string, unknown>;
  gchordfont?: Record<string, unknown>;
  tripletfont?: Record<string, unknown>;
  annotationfont?: Record<string, unknown>;
  [key: string]: unknown;
}
interface MutableLine {
  staff?: MutableStaff[];
  vskip?: number;
  [key: string]: unknown;
}

/** `replacer` — the engraver hangs itself on the element, so it is skipped (`:117-122`). */
const replacer = (key: string, value: unknown): unknown =>
  key === "abselem" ? "abselem" : value;

/**
 * ⚠️ **AND THE SKIP IS NOT AN IGNORE — `abselem`'s PRESENCE STILL COUNTS.** The replacer
 * flattens the engraver's back-pointer to a constant so two drawn lines compare equal
 * whatever it holds, but a field that HAS one and a field that has none stringify
 * differently, and `objEqual` reports a change. That is a DRAWING fact reaching a data
 * function: `params.abcelem.abselem = params` is written in `draw/absolute.js:72`, so only
 * a line that was DRAWN carries one.
 *
 * `%%maxStaves` is where it shows. abcjs lays the whole tune out and stops DRAWING at the
 * limit, so an incipit's hidden lines have bare staff furniture — and `deline` unshifts a
 * clef in front of every one of them, then keeps unshifting, because the first unshift
 * MUTATES the object it records. `abcjs-visual-directives-01-incipit-test` is the corpora's
 * one case and it is worth two rows.
 *
 * Two of the three fields need more than the line's own drawn-ness, because their
 * `AbsoluteElement` is not always built:
 *
 * - **A KEY WITH NOTHING TO DRAW HAS NO ELEMENT** — `createKeySignature` returns null on an
 *   empty `accidentals` (`write/creation/create-key-signature.js:8-9`), so `K:C` carries no
 *   `abselem` on a DRAWN line either. Measured against `K:G`, which does.
 * - **AND `clef=none` HAS NONE** — `createClef`'s `case 'none': return null` (`:26`).
 * - A time signature is always built (`create-time-signature.js:8`).
 */
const hasAbselem = (
  field: "meter" | "key" | "clef" | "font",
  value: unknown,
  drawn: boolean,
): boolean => {
  if (!drawn || field === "font") return false;
  const v = value as { accidentals?: unknown[]; type?: string } | null | undefined;
  if (field === "key") return (v?.accidentals?.length ?? 0) > 0;
  if (field === "clef") return v?.type !== "none";
  return true;
};

/** What `objEqual` compares: the field's JSON, and whether the drawing hung itself on it. */
const stampOf = (value: unknown, abselem: boolean): string | undefined =>
  value === undefined
    ? undefined
    : `${JSON.stringify(value, replacer)}${abselem ? "|abselem" : ""}`;

/** `objEqual` — an ABSENT input equals anything (`:163-169`). */
const objEqual = (
  input: unknown,
  output: string | undefined,
  abselem: boolean,
): boolean => input == null || stampOf(input, abselem) === output;

/** `cloneLine` — deep down to the voice ARRAYS, shallow at the elements (`:171-197`). */
const cloneLine = (line: MutableLine): MutableLine => {
  const out: MutableLine = {};
  for (const key of Object.keys(line)) {
    if (key !== "staff") out[key] = line[key];
    else {
      out.staff = (line.staff ?? []).map((staff) => {
        const copy: MutableStaff = { voices: [] };
        for (const k of Object.keys(staff)) {
          if (k !== "voices") copy[k] = staff[k];
          else copy.voices = staff.voices.map((v) => [...v]);
        }
        return copy;
      });
    }
  }
  return out;
};

const unshiftInto = (
  voices: AbcElement[][],
  value: Record<string, unknown>,
  el_type: string,
  type?: string,
): void => {
  // **THE FIELD OBJECT ITSELF IS MUTATED AND SHARED BY EVERY VOICE** — abcjs stamps
  // `el_type` on the staff's own object and unshifts THAT into each voice (`:124-131`).
  const element = value as unknown as AbcElement;
  element.el_type = el_type;
  if (type !== undefined) (element as { type?: string }).type = type;
  element.startChar = -1;
  element.endChar = -1;
  for (const voice of voices) voice.unshift(element);
};

export function delineOf(
  inputLines: readonly AbcLine[],
  options: DelineOptions = {},
  /**
   * How many of the MUSIC lines were drawn — `Layout.systems.length`, which `%%maxStaves`
   * truncates out of `Layout.engraved`. The music lines of `tune.lines` are the engraved
   * systems in order, so the first `drawnLines` of them are the drawn ones. Defaults to
   * every line, which is every tune without the directive.
   */
  drawnLines: number = Number.POSITIVE_INFINITY,
): AbcLine[] {
  const lineBreaks = options.lineBreaks === true;
  const outputLines: MutableLine[] = [];
  let inMusicLine = false;
  let musicLines = 0;
  const currentMeter: (string | undefined)[] = [];
  const currentKey: (string | undefined)[] = [];
  const currentClef: (string | undefined)[] = [];
  const currentFont: Record<string, (string | undefined)[]> = {
    vocalfont: [],
    gchordfont: [],
    tripletfont: [],
    annotationfont: [],
  };
  for (const raw of inputLines as unknown as readonly MutableLine[]) {
    const inputLine = cloneLine(raw);
    if (inputLine.staff) {
      const drawn = musicLines < drawnLines;
      musicLines += 1;
      // **THE TEST IS TRUTHINESS, SO A `%%vskip 0` MERGES** — `!inputLine.vskip`
      // (`:16`), not a presence check.
      if (inMusicLine && !inputLine.vskip) {
        const outputLine = outputLines[outputLines.length - 1];
        const outStaves = outputLine?.staff ?? [];
        for (let s = 0; s < outStaves.length; s += 1) {
          const inputStaff = inputLine.staff[s];
          const outputStaff = outStaves[s];
          if (inputStaff === undefined || outputStaff === undefined) continue;
          const stamp = (f: "meter" | "key" | "clef", v: unknown): string | undefined =>
            stampOf(v, hasAbselem(f, v, drawn));
          if (
            !objEqual(
              inputStaff.meter,
              currentMeter[s],
              hasAbselem("meter", inputStaff.meter, drawn),
            )
          ) {
            unshiftInto(inputStaff.voices, inputStaff.meter ?? {}, "meter");
            currentMeter[s] = stamp("meter", inputStaff.meter);
            delete inputStaff.meter;
          }
          if (
            !objEqual(
              inputStaff.key,
              currentKey[s],
              hasAbselem("key", inputStaff.key, drawn),
            )
          ) {
            unshiftInto(inputStaff.voices, inputStaff.key ?? {}, "key");
            currentKey[s] = stamp("key", inputStaff.key);
            delete inputStaff.key;
          }
          if (inputStaff.title) outputStaff.abbrevTitle = inputStaff.title;
          if (
            !objEqual(
              inputStaff.clef,
              currentClef[s],
              hasAbselem("clef", inputStaff.clef, drawn),
            )
          ) {
            unshiftInto(inputStaff.voices, inputStaff.clef ?? {}, "clef");
            currentClef[s] = stamp("clef", inputStaff.clef);
            delete inputStaff.clef;
          }
          for (const font of [
            "vocalfont",
            "gchordfont",
            "tripletfont",
            "annotationfont",
          ] as const) {
            const seen = currentFont[font] ?? [];
            if (!objEqual(inputStaff[font], seen[s], false)) {
              unshiftInto(
                inputStaff.voices,
                inputStaff[font] ?? {},
                "font",
                font,
              );
              seen[s] = stampOf(inputStaff[font], false);
              delete inputStaff[font];
            }
          }
          for (let v = 0; v < outputStaff.voices.length; v += 1) {
            const outputVoice = outputStaff.voices[v] ?? [];
            const inputVoice = inputStaff.voices[v];
            if (lineBreaks) outputVoice.push({ el_type: "break" });
            if (inputVoice) outputStaff.voices[v] = [...outputVoice, ...inputVoice];
          }
        }
      } else {
        for (let ii = 0; ii < inputLine.staff.length; ii += 1) {
          const staff = inputLine.staff[ii];
          currentKey[ii] = stampOf(staff?.key, hasAbselem("key", staff?.key, drawn));
          currentMeter[ii] = stampOf(
            staff?.meter,
            hasAbselem("meter", staff?.meter, drawn),
          );
          currentClef[ii] = stampOf(
            staff?.clef,
            hasAbselem("clef", staff?.clef, drawn),
          );
        }
        // Copied AGAIN because this one is going to be written to.
        outputLines.push(cloneLine(inputLine));
      }
      inMusicLine = true;
    } else {
      inMusicLine = false;
      outputLines.push(inputLine);
    }
  }
  return outputLines as unknown as AbcLine[];
}

/** The projected staff, as `deline` needs to see it. */
export type { AbcStaff };
