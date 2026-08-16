import type { Measure, MusicEvent, Score, SourceRange } from "../core/model.js";

/**
 * **abcjs's `tune.lines` — ITS LAID-OUT TREE, PROJECTED FROM OURS.**
 *
 * A host reads `lines` to find the element under a character, to walk the selectables, or
 * to draw its own overlay. Under the 2026-08-15 ruling it must exist and match; under the
 * same ruling it is NOT what the engine is built on, so it is built here on demand from
 * the `Score` rather than being the `Score`.
 *
 * The shape is `lines[i].staff[j].voices[k][]`, each element carrying at least
 * `el_type`, `startChar` and `endChar`. Eleven element types appear across both corpora,
 * counted by walking abcjs itself: `note` (6722), `bar` (1908), `stem` (289),
 * `keySignature` (48), `midi` (23), `tempo` (14), `clef` (14), `style` (9),
 * `timeSignature` (7), `color` (4) and `part` (3) — and three kinds of non-staff line,
 * `subtitle`, `text` and `nonMusic`.
 *
 * **THE TUNE'S OWN CLEF, KEY AND METER ARE NOT IN THE STREAM.** They live on the staff
 * (`staff.clef`, `staff.key`, `staff.meter`); only a MID-TUNE change is an element, which
 * is why `%%keywarn` can remove one without touching the line's own signature.
 */

export interface AbcElement {
  readonly el_type: string;
  readonly startChar: number;
  readonly endChar: number;
}

export interface AbcStaff {
  readonly voices: readonly (readonly AbcElement[])[];
}

export interface AbcLine {
  readonly staff?: readonly AbcStaff[];
  /** A `T:` after the first — a line that draws nothing and still counts. */
  readonly subtitle?: string;
}

const el = (
  type: string,
  range: SourceRange | null | undefined,
): AbcElement | null =>
  range == null
    ? null
    : { el_type: type, startChar: range.start, endChar: range.end };

/**
 * **abcjs's ELEMENT SPANS TILE THE LINE, AND THE RULE IS PURELY POSITIONAL.** Each element
 * runs from the PREVIOUS element's own end to the NEXT element's own start, so every
 * character of a music line belongs to exactly one of them — a chord symbol, a `!…!` or
 * `.` decoration, a grace group and the whitespace between all fall inside the element
 * they were written for, without anything having to recognise them.
 *
 * MEASURED on Cooley's, `|:D2|EB{c}BA B2 EB|` from char 32: bar 32…34, note 34…36, bar
 * 36…37, notes 37…38, 38…39, **39…43 (`{c}B` — the grace is inside the note's span)**,
 * 43…45 (`A `, trailing space included), 45…48, 48…49, 49…50, bar 50…51. And on
 * `S1-decorations`, `.C ` is one note element, 475…478.
 *
 * A first attempt walked BACKWARD over braces, quotes and bangs to find each opening. It
 * got the graces right and missed a bare `.` staccato and the space before a decoration —
 * because the rule is not about content at all.
 */
function tile(abc: string, elements: readonly AbcElement[]): AbcElement[] {
  return elements.map((e, i) => ({
    el_type: e.el_type,
    // **EACH ELEMENT OPENS WHERE THE ONE BEFORE IT CLOSED**, and the first of a line opens
    // at the line. A NOTE closes over its trailing whitespace and a BAR does not — measured
    // on `S1-decorations`: `!fermata!C ` is 163…174 and `!accent!D ` 174…184, the space
    // going with the note before it, while `| !tenuto!E` is bar 206…207 and note 207…217,
    // the space going with the note AFTER. That asymmetry is abcjs's and it is what makes
    // the spans tile.
    startChar:
      i === 0
        ? abc.lastIndexOf("\n", e.startChar - 1) + 1
        : (elements[i - 1]?.endChar ?? e.startChar),
    endChar: e.endChar,
  }));
}

/**
 * **AN ELEMENT OPENS AT THE FIRST THING WRITTEN FOR IT**, which is what abcjs's own
 * `startChar` already covers: a chord symbol, an annotation, a `!…!` or bare-letter
 * decoration, a grace group. Ours cover the event alone, so the opening is the earliest of
 * the ranges the model DOES carry — the decorations, the chord symbol and the
 * annotations — and then a walk back over an immediately preceding `{…}`, which is the one
 * part with no range of its own.
 */
function decoratedRange(abc: string, event: MusicEvent): SourceRange | null {
  const own = event.sourceRange;
  if (own == null) return null;
  const e = event as {
    decorationSourceRanges?: readonly SourceRange[];
    annotationSourceRanges?: readonly SourceRange[];
    chordSymbolSourceRange?: SourceRange | null;
  };
  let start = own.start;
  for (const r of e.decorationSourceRanges ?? [])
    start = Math.min(start, r.start);
  for (const r of e.annotationSourceRanges ?? [])
    start = Math.min(start, r.start);
  if (e.chordSymbolSourceRange != null)
    start = Math.min(start, e.chordSymbolSourceRange.start);
  /**
   * …and then a TEXTUAL walk back over anything else written for the element: a grace
   * group, which carries no range of its own, and a `!…!` or `+…+` decoration our parser
   * DROPPED because abcjs does not recognise the name. `!staccato!` is one — strict keeps
   * only the names in `ABCJS_LEGAL_ACCENTS` — and abcjs still counts its characters into
   * the element's span, so `!tenuto!E !staccato!F` is two elements at 184 and 194 rather
   * than at 184 and 204.
   */
  for (;;) {
    let i = start;
    while (i > 0 && (abc[i - 1] === " " || abc[i - 1] === "\t")) i -= 1;
    const before = abc[i - 1];
    const open =
      before === "}"
        ? "{"
        : before === '"'
          ? '"'
          : before === "!"
            ? "!"
            : before === "+"
              ? "+"
              : null;
    if (open === null) break;
    const opened = abc.lastIndexOf(open, i - 2);
    if (opened < 0) break;
    start = opened;
  }
  // **AND AN ELEMENT NEVER OPENS ON A SPACE** — the whitespace between two of them belongs
  // to the one BEFORE, which is what makes `.C ` a single span of three characters. One of
  // our decoration ranges opens on the space, so the start is walked forward off it.
  while (start < own.start && (abc[start] === " " || abc[start] === "\t"))
    start += 1;
  // …**AND A NOTE CLOSES OVER ITS TRAILING WHITESPACE**, which is what hands the next
  // element its own opening. See `tile`.
  let end = own.end;
  while (abc[end] === " " || abc[end] === "\t") end += 1;
  return { start, end };
}

/**
 * One voice's elements in SOURCE ORDER: the mid-tune changes where they stand, the events,
 * and the barlines that open and close each measure.
 */
function voiceElements(
  abc: string,
  measures: readonly Measure[],
): AbcElement[] {
  const out: (AbcElement | null)[] = [];
  for (const measure of measures) {
    out.push(el("bar", measure.openingBarlineSourceRange));
    // ponytail: a mid-tune `[K:]` and `[M:]` carry source ranges and a `[V:… clef=]`,
    // `[Q:]`, `%%MIDI`, `!style=!`, `%%voicecolor` and `P:` do not yet — so those six
    // element types are absent from the projection. `tests/lines.test.ts` measures which
    // characters that costs, rather than the gap being a claim.
    out.push(el("keySignature", measure.keyChangeSourceRange));
    out.push(el("timeSignature", measure.meterChangeSourceRange));
    for (const event of measure.events)
      out.push(el("note", decoratedRange(abc, event)));
    out.push(el("bar", measure.closingBarlineSourceRange));
  }
  // **SORTED BY POSITION, NOT BY THE ORDER WE HAPPEN TO BUILD THEM.** abcjs appends to the
  // voice as it reads the line, so the stream is in source order by construction; ours is
  // assembled from a measure's fields and has to be put back into it.
  return tile(
    abc,
    out
      .filter((e): e is AbcElement => e !== null)
      .sort((a, b) => a.startChar - b.startChar),
  );
}

/** `tune.lines` for a score — one line per SYSTEM, as abcjs has one per source line. */
export function linesOf(score: Score, abc: string): AbcLine[] {
  const lines: AbcLine[] = [];
  // Every `T:` after the first is a line of its own that draws nothing — see
  // `RenderDoc.blankLeadingLines`.
  for (const title of score.metadata.titles.slice(1)) {
    lines.push({ subtitle: typeof title === "string" ? title : "" });
  }

  /** Measure indexes where each system starts, per voice. */
  const starts = (voice: { measures: readonly Measure[] }): number[] => {
    const at: number[] = [];
    voice.measures.forEach((m, i) => {
      if (i === 0 || m.startsSystem) at.push(i);
    });
    return at.length > 0 ? at : [0];
  };
  const first = score.voices[0];
  if (first === undefined) return lines;
  const breaks = starts(first);

  breaks.forEach((from, i) => {
    const to = breaks[i + 1] ?? first.measures.length;
    lines.push({
      staff: [
        {
          voices: score.voices.map((v) =>
            voiceElements(abc, v.measures.slice(from, to)),
          ),
        },
      ],
    });
  });
  return lines;
}

/**
 * `getElementFromChar(char)` — the element whose span contains it, or null.
 *
 * **ITS GUARD IS TRUTHINESS, SO CHARACTER 0 IS UNREACHABLE**: `elem.startChar &&
 * elem.endChar && elem.startChar <= char && elem.endChar > char` (`abc_tune.js:235-254`),
 * and an element starting at 0 fails the first test. Reproduced — a host asking for the
 * element at the very first character gets null from abcjs and must get null from us.
 */
export function elementFromChar(
  lines: readonly AbcLine[],
  char: number,
): AbcElement | null {
  for (const line of lines) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices) {
        for (const elem of voice) {
          if (
            elem.startChar &&
            elem.endChar &&
            elem.startChar <= char &&
            elem.endChar > char
          ) {
            return elem;
          }
        }
      }
    }
  }
  return null;
}
