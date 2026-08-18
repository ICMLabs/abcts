import type { AbcElement } from "./lines.js";
import type { TuneObject } from "./index.js";
import { TuneBook } from "./tunebook.js";

/**
 * **`extractMeasures(abc)` — THE TUNE CUT INTO MEASURES OF ABC TEXT.**
 *
 * A LINE-BY-LINE PORT of `api/abc_tunebook.js:174-259`, and the one public API whose answer
 * is a SUBSTRING OF THE SOURCE: every fragment is
 * `tune.abc.substring(fragStart, elem.endChar)`, taken straight off `tune.lines`'s spans.
 * That makes it the strictest consumer of the character gate — a span one character out
 * shows up here as a bar that begins with the wrong note.
 *
 * `[{header, measures: [{abc, lastChord?, startEnding?, endEnding?}], hasPickup}]`, one
 * entry per tune of the book. Three quirks, all abcjs's and all kept:
 *
 * - **IT READS ONE STAFF AND ONE VOICE.** `k < 1 /*line.staff.length* /` and
 *   `kk < 1 /*staff.voices.length* /` are hard-coded with the multi-voice code commented
 *   out above them, so a piano score returns its right hand alone.
 * - **THE HEADER IS SPLIT ON THE FIRST `K:`, TEXTUALLY** — `abc.split("K:")` then
 *   `arr[1].split("\n")` — so a `K:` anywhere earlier in the text cuts it there, and a tune
 *   with NO `K:` at all throws on `arr[1]`.
 * - **`lastChord` IS THE CHORD IN FORCE WHEN THE MEASURE OPENED**, not one inside it. It is
 *   remembered across measures and read only when the opening element carries none of its
 *   own — and it is re-derived from `measureStartChord` at every bar, so a measure whose
 *   first element HAS a chord reports none.
 */
export interface ExtractedMeasure {
  readonly abc: string;
  readonly lastChord?: string;
  readonly startEnding?: string;
  readonly endEnding?: boolean;
}

export interface ExtractedTune {
  readonly header: string;
  readonly measures: readonly ExtractedMeasure[];
  readonly hasPickup: boolean;
}

/**
 * `measureStartChord && measureStartChord.chord && measureStartChord.chord.length > 0 ?
 * measureStartChord.chord[0].name : null` — and a STRING has no `.chord`, which is the
 * whole of the type-change quirk above.
 */
const chordNameOf = (value: AbcElement | string | null): string | null => {
  if (value === null || typeof value === "string") return null;
  const chords = value.chord;
  return chords !== undefined && chords.length > 0 ? (chords[0]?.name ?? null) : null;
};

export function extractMeasuresOf(
  abc: string,
  parse: (source: string) => TuneObject[],
): ExtractedTune[] {
  const tunes: ExtractedTune[] = [];
  const book = new TuneBook(abc);
  for (const bookTune of book.tunes) {
    // **THE TEXTUAL SPLIT, INCLUDING ITS FAILURE** — `arr[1]` is undefined for a tune with
    // no `K:` and abcjs throws a TypeError there.
    const arr = bookTune.abc.split("K:");
    const after = arr[1];
    if (after === undefined)
      throw new TypeError(
        "Cannot read properties of undefined (reading 'split')",
      );
    const arr2 = after.split("\n");
    const header = `${arr[0] ?? ""}K:${arr2[0] ?? ""}\n`;
    /**
     * **THE VARIABLE CHANGES TYPE MID-LOOP AND THAT IS THE BEHAVIOUR.** It holds the
     * ELEMENT that carried a chord while a measure is being read, and the closing bar
     * REPLACES it with the chord's NAME — a string, whose `.chord` is undefined, so the
     * next measure that inherits it reports no chord at all. Ported as written, with the
     * union spelled out, because collapsing it to `null` is only equivalent until a chord
     * is written mid-measure.
     */
    let lastChord: AbcElement | string | null = null;
    let measureStartChord: AbcElement | string | null = null;
    let fragStart: number | null = null;
    const measures: ExtractedMeasure[] = [];
    let hasNotes = false;
    const tuneObj = parse(bookTune.abc)[0];
    const hasPickup = (tuneObj?.getPickupLength() ?? 0) > 0;

    for (const line of tuneObj?.lines ?? []) {
      if (line.staff === undefined) continue;
      // ONE staff and ONE voice — abcjs's own hard-coded bounds.
      const voice = line.staff[0]?.voices[0];
      for (const elem of voice ?? []) {
        if (fragStart === null && (elem.startChar ?? -1) >= 0) {
          fragStart = elem.startChar ?? 0;
          measureStartChord = elem.chord === undefined ? lastChord : null;
        }
        if (elem.chord) lastChord = elem;
        if (elem.el_type === "bar") {
          if (hasNotes) {
            const frag = bookTune.abc.substring(fragStart ?? 0, elem.endChar ?? 0);
            const name = chordNameOf(measureStartChord);
            lastChord = name;
            measures.push({
              abc: frag,
              ...(name === null ? {} : { lastChord: name }),
              ...(elem.startEnding === undefined
                ? {}
                : { startEnding: elem.startEnding }),
              ...(elem.endEnding === undefined
                ? {}
                : { endEnding: elem.endEnding }),
            });
            fragStart = null;
            hasNotes = false;
          }
        } else if (elem.el_type === "note") hasNotes = true;
      }
    }
    tunes.push({ header, measures, hasPickup });
  }
  return tunes;
}
