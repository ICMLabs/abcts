import type {
  Barline,
  Measure,
  MusicEvent,
  Pitch,
  Score,
  SourceRange,
  Tempo,
} from "../core/model.js";
import { ratToNumber, stepIndex } from "../core/model.js";

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

/** One pitch of a note element, as abcjs's parser and engraver leave it between them. */
export interface AbcPitch {
  /** ABSOLUTE diatonic index — middle C is 0, whatever the clef. */
  pitch: number;
  /** The note AS WRITTEN, accidental sign included: `^c`, `B,`, `d`. */
  name: string;
  /** `pitch - mid` — where it sits on THIS staff (`tune-builder.js:918`). */
  verticalPos: number;
  /** Where a slur may hang off it — the engraver's answer, not the parser's. */
  highestVert?: number;
  startSlur?: readonly { label: number }[];
  endSlur?: readonly number[];
  startTie?: Record<string, never>;
  endTie?: boolean;
}

/**
 * One element of a voice's stream.
 *
 * abcjs's own is a bag the parser fills and the ENGRAVER then mutates in place —
 * `highestVert`, `averagepitch`, `minpitch`, `maxpitch` and, after `setUpAudio`,
 * `currentTrackMilliseconds` and `midiPitches` are all written onto the same object a host
 * reads back through `tune.lines`. Ours is the same object for the same reason: the
 * selectable array holds it, `getElementFromChar` returns it, and a host that stamps one
 * must see it through the other.
 */
export interface AbcElement {
  el_type: string;
  /**
   * **THE STAFF'S OWN FURNITURE CARRIES NEITHER.** A clef, a key and a meter that came
   * from the staff rather than from the stream have no `startChar` at all in abcjs — not
   * `-1`, ABSENT — which is visible the moment a host compares the objects and invisible
   * to anything that only reads them.
   */
  startChar?: number;
  endChar?: number;
  /** A barline's drawn kind — `bar_thin`, `bar_left_repeat`, … — or a tempo's `"tempo"`. */
  type?: string;
  /**
   * `%%barnumbers N` — the number printed on this barline, and the number of the measure it
   * OPENS. A PARSE field: `bar.barNumber = currBarNumber` is stamped on the element itself
   * (`abc_parse_music.js:298-303`), so it travels to a host through `tune.lines`.
   */
  barNumber?: number;
  // ── a tempo mark, and a body `P:` ──
  preString?: string;
  postString?: string;
  bpm?: number;
  title?: string;
  /** A voice name's label, and a text row's own words. */
  text?: string;
  // ── the staff's own furniture, which abcjs hangs on the STAFF and not on the stream ──
  verticalPos?: number;
  clefPos?: number;
  accidentals?: readonly { acc: string; note: string; verticalPos: number }[];
  root?: string;
  acc?: string;
  mode?: string;
  value?: readonly { num: string; den: string }[];
  // ── a note (and a rest, which abcjs also calls a note) ──
  pitches?: AbcPitch[];
  rest?: { type: string; text?: string };
  duration?: number | readonly number[];
  decoration?: readonly string[];
  chord?: readonly { name: string; position: string }[];
  gracenotes?: readonly {
    pitch: number;
    name: string;
    duration: number;
    verticalPos: number;
  }[];
  lyric?: readonly { syllable: string; divider: string }[];
  startBeam?: boolean;
  endBeam?: boolean;
  startTriplet?: number;
  endTriplet?: boolean;
  tripletMultiplier?: number;
  tripletR?: number;
  // ── written by the FLATTENER, on `setUpAudio` ──
  /** A number for an element played once, an ARRAY for one a repeat reaches twice. */
  currentTrackMilliseconds?: number | readonly number[];
  currentTrackWholeNotes?: number | readonly number[];
  midiPitches?: readonly Record<string, unknown>[];
  // ── written by the engraver, not the parser ──
  averagepitch?: number;
  minpitch?: number;
  maxpitch?: number;
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
const FIELD_ELEMENTS: ReadonlySet<string> = new Set(["tempo", "part"]);

function tile(abc: string, elements: readonly AbcElement[]): AbcElement[] {
  // **EACH ELEMENT OPENS WHERE THE ONE BEFORE IT CLOSED**, and the first of a line opens
  // at the line. A NOTE closes over its trailing whitespace and a BAR does not — measured
  // on `S1-decorations`: `!fermata!C ` is 163…174 and `!accent!D ` 174…184, the space
  // going with the note before it, while `| !tenuto!E` is bar 206…207 and note 207…217,
  // the space going with the note AFTER. That asymmetry is abcjs's and it is what makes
  // the spans tile.
  //
  // **IN PLACE, NOT COPIED.** A copy would break the identity the selectable array and
  // `getElementFromChar` both rest on — abcjs hands out ONE object per element and its
  // engraver stamps that object.
  // …**AND THE TILING IS PER SOURCE LINE.** An element opens where the one before it
  // closed only when the two were written on the SAME line; the first of a line opens at
  // the line. abcjs does not tile at all — each element's `startChar` is simply where its
  // tokenizer began reading it, and that is right after the previous element on the same
  // line and at the line's own start otherwise. Worth 300 characters on its own.
  const lineStart = (at: number): number => abc.lastIndexOf("\n", at - 1) + 1;
  const opened = elements.map((e, i) => {
    const own = e.startChar ?? 0;
    // **AN INLINE FIELD KEEPS ITS OWN OPENING** — it is bracketed, so the element begins at
    // the `[` and the space before it belongs to NOTHING. Measured on `selection-tempo`:
    // the barline is 46…47 and the `[Q:"left" …]` 48…73, with 47 in neither.
    if (FIELD_ELEMENTS.has(e.el_type)) return own;
    const before = elements[i - 1]?.endChar;
    return before === undefined || before < lineStart(own) ? lineStart(own) : before;
  });
  elements.forEach((e, i) => {
    e.startChar = opened[i] ?? e.startChar ?? 0;
  });
  return elements as AbcElement[];
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
 * `bar_thin` and its seven siblings — abcjs's own names for what a barline DRAWS
 * (`abstract-engraver.js:965-985`). The projection carries the name because a host reads
 * it off `tune.lines` and the selectable array hands back the same object.
 */
const BARLINE_TYPE: Readonly<Record<string, string>> = {
  thin: "bar_thin",
  double: "bar_thin_thin",
  thickThin: "bar_thick_thin",
  final: "bar_thin_thick",
  repeatStart: "bar_left_repeat",
  repeatEnd: "bar_right_repeat",
  repeatBoth: "bar_dbl_repeat",
  invisible: "bar_invisible",
};

/**
 * A barline element, registered by WHERE IT WAS WRITTEN so the drawing can find it again.
 *
 * The drawn barline carries `LayoutElement.sourceRange`, and the raw range is the key —
 * the tiled `startChar` moves, the written one does not.
 */
const bar = (
  kind: Barline | null,
  range: SourceRange | null,
  byRange?: Map<number, AbcElement>,
  /**
   * `%%barnumbers N` — the number printed on THIS barline, which is the number of the
   * measure it OPENS. It is a PARSE field, not a drawing one: abcjs stamps
   * `bar.barNumber = currBarNumber` onto the element itself
   * (`abc_parse_music.js:298-303`), so a host reads it off `tune.lines` and the selectable
   * array hands back the same object. `Measure.closingBarNumber` already holds it, with
   * abcjs's own three conditions — first voice, visible barline, non-empty measure.
   */
  barNumber?: number,
): AbcElement | null => {
  const e = el("bar", range);
  if (e === null || range === null) return e;
  e.type = (kind === null ? undefined : BARLINE_TYPE[kind]) ?? "bar_thin";
  if (barNumber !== undefined) e.barNumber = barNumber;
  byRange?.set(range.start, e);
  return e;
};

/**
 * `{preString?, duration, bpm, postString?, type: "tempo"}` — abcjs's tempo element.
 *
 * **`duration` IS AN ARRAY**, because `Q:1/4 1/8=120` counts two note values, and `type`
 * is the literal `"tempo"` beside `el_type` — the same word twice, which is abcjs's shape
 * rather than a redundancy of ours (`abc_parse_header.js:204-330`).
 *
 * A LONE TEMPO WORD still carries the rate it looked up and simply does not print it; the
 * element keeps the `bpm` either way, which is what `getBpm` reads.
 */
const tempoElement = (
  tempo: Tempo | null | undefined,
  range: SourceRange | null | undefined,
  byRange?: Map<number, AbcElement>,
): AbcElement | null => {
  const e = el("tempo", range);
  if (e === null || tempo == null || range == null) return null;
  e.type = "tempo";
  if (tempo.text !== null) e.preString = tempo.text;
  if (tempo.beatUnit !== null) e.duration = [ratToNumber(tempo.beatUnit)];
  if (tempo.bpm !== null) e.bpm = tempo.bpm;
  if (tempo.postText != null) e.postString = tempo.postText;
  byRange?.set(range.start, e);
  return e;
};

/** `{title, el_type: "part"}` — a BODY `P:`, printed above the staff where it stands. */
const partElement = (
  label: string | null,
  range: SourceRange | null,
  byRange?: Map<number, AbcElement>,
): AbcElement | null => {
  const e = el("part", range);
  if (e === null || label === null || range === null) return null;
  e.title = label;
  byRange?.set(range.start, e);
  return e;
};

/** True when the range opens a LINE — i.e. the field was written on one of its own. */
const fieldLine = (abc: string, range: SourceRange | null | undefined): boolean =>
  range != null && (range.start === 0 || abc[range.start - 1] === "\n");

/** `accMap` — the sign abcjs prefixes to a written note name (`abc_parse_settings.js:147`). */
const ACCIDENTAL_NAME: Readonly<Record<number, string>> = {
  [-2]: "dblflat",
  [-1]: "flat",
  0: "natural",
  1: "sharp",
  2: "dblsharp",
};

const ACC_SIGN: Readonly<Record<number, string>> = {
  [-2]: "__",
  [-1]: "_",
  0: "=",
  1: "^",
  2: "^^",
};

/** ABSOLUTE diatonic index, middle C = 0 — abcjs's `pitch` on every pitch element. */
const abcjsPitch = (p: Pitch): number =>
  stepIndex(p.step) + 7 * p.octave - MIDDLE_C_INDEX;
const MIDDLE_C_INDEX = 7 * 4;

/**
 * The note AS WRITTEN — `el.name = accMap[el.accidental] + el.name`
 * (`abc_parse_music.js:1116-1147`). NOT derivable from the pitch: `c,` and `C` are the
 * same note and abcjs keeps whichever was typed, which is why the model carries it.
 */
const writtenName = (p: Pitch): string => {
  const letter =
    p.written ??
    (p.octave >= 5
      ? p.step + "'".repeat(p.octave - 5)
      : p.octave === 4
        ? p.step.toUpperCase()
        : p.step.toUpperCase() + ",".repeat(4 - p.octave));
  const sign =
    p.writtenAccidental ??
    (p.accidental === null ? "" : (ACC_SIGN[p.accidental] ?? ""));
  return sign + letter;
};

/**
 * The PARSE-TIME half of a note element — everything abcjs's parser puts on it.
 *
 * `verticalPos`, `highestVert`, `averagepitch`, `minpitch` and `maxpitch` are NOT here:
 * the first needs the staff's middle line and the rest are the engraver's, so they are
 * stamped onto this same object when the drawing is walked. See `src/compat/selectables.ts`.
 */
function noteFields(e: AbcElement, event: MusicEvent): void {
  e.duration = ratToNumber(event.notatedDuration);
  if (event.type === "rest") {
    e.rest = { type: restType(event.kind) };
  } else {
    const pitches = event.type === "note" ? [event.pitch] : event.pitches;
    e.pitches = pitches
      .map((p) => ({
        // **AN EXPLICIT ACCIDENTAL IS NAMED ON THE PITCH**, and only an explicit one — a
        // note taking its accidental from the key signature carries none.
        ...(p.accidental === null
          ? {}
          : { accidental: ACCIDENTAL_NAME[p.accidental] ?? "natural" }),
        pitch: abcjsPitch(p),
        name: writtenName(p),
        // A placeholder until the drawing is walked — abcjs's own is `pitch - mid`, and
        // `mid` is the staff's, which this side does not know.
        verticalPos: abcjsPitch(p),
      }))
      .sort((a, b) => a.pitch - b.pitch);
    // **A TIE IS A PROPERTY OF THE PITCH** — `el.pitches.forEach(p => p.startTie = {})`
    // (`abc_parse_music.js:427`), and `[B-eg-b-]` ties three of its four heads. A plain
    // note's `-` lands on `pitches[0]` (`tune-builder.js:162-171`), which is the same rule
    // for a chord of one.
    const tied =
      event.type === "chord" && event.tiedPitches !== undefined
        ? event.tiedPitches
        : undefined;
    e.pitches.forEach((p, i) => {
      if (tied === undefined ? event.tiedToNext && i === 0 : tied[i] === true)
        p.startTie = {};
    });
    if (tied === undefined && event.tiedToNext && e.pitches.length > 1)
      for (const p of e.pitches) p.startTie = {};
  }
  if (event.decorations.length > 0)
    e.decoration = event.decorations.map((d) => DECORATION_NAME[d] ?? d);
  const chord: { name: string; position: string }[] = [];
  if (event.chordSymbol !== null)
    chord.push({ name: event.chordSymbol, position: "default" });
  for (const a of event.annotations)
    chord.push({ name: a.slice(1), position: ANNOTATION_POSITION[a[0] ?? ""] ?? "default" });
  if (chord.length > 0) e.chord = chord;
  if (event.type !== "rest" && event.lyric !== null) {
    // **THE DIVIDER IS PART OF THE SYLLABLE IN OUR MODEL AND A FIELD OF ITS OWN IN
    // abcjs's** — `Strang-` is `{syllable: "Strang", divider: "-"}`, and a syllable that
    // ends a word takes a space.
    const hyphen = event.lyric.endsWith("-");
    e.lyric = [
      {
        syllable: hyphen ? event.lyric.slice(0, -1) : event.lyric,
        divider: hyphen ? "-" : " ",
      },
    ];
  }
  if (event.graceNotes.length > 0)
    e.gracenotes = event.graceNotes.map((g) => ({
      pitch: abcjsPitch(g),
      name: writtenName(g),
      // **A GRACE'S DURATION IS RELATIVE TO A SIXTEENTH, NOT TO `L:`** — `note.duration =
      // note.duration / (default_length * 8)` (`abc_parse_music.js:694`), so a bare grace
      // is 0.125 whatever the unit note length is, and `{B2}` is 0.25.
      duration: ratToNumber(g.length) / 8,
      verticalPos: abcjsPitch(g),
    }));
}

/**
 * `accentPseudonyms` and `accentDynamicPseudonyms` — the SPELLINGS abcjs's parser folds
 * away (`abc_parse_settings.js:95-110`). `<(` is `crescendo(` by the time a host sees it,
 * `>` and `emphasis` are both `accent`, and `^` is `umarcato`. Our model keeps what was
 * written, because the renderer needs the source spelling for nothing and the parser has no
 * reason to lose it — so the fold happens here, at the boundary that has to match.
 *
 * The same rule bit the geometry once from the other side: `!>!` drew the sforzato and then
 * failed `closeDecoration`'s `name === 'accent'` test, and every accent in the corpus sat
 * one pitch out.
 */
const DECORATION_NAME: Readonly<Record<string, string>> = {
  "<": "accent",
  ">": "accent",
  tr: "trill",
  plus: "+",
  emphasis: "accent",
  "^": "umarcato",
  marcato: "umarcato",
  "<(": "crescendo(",
  "<)": "crescendo)",
  ">(": "diminuendo(",
  ">)": "diminuendo)",
};

/** `"^above"` / `"_below"` / `"<left"` / `">right"` / `"@free"` — abcjs's own words. */
const ANNOTATION_POSITION: Readonly<Record<string, string>> = {
  "^": "above",
  _: "below",
  "<": "left",
  ">": "right",
  "@": "free",
};

/** abcjs's `rest.type` after `createNote` has had its say. */
const restType = (kind: string): string =>
  kind === "spacer"
    ? "spacer"
    : kind === "invisible" || kind === "invisibleMultiMeasure"
      ? "invisible"
      : kind === "multiMeasure"
        ? "multimeasure"
        : "rest";

/**
 * One voice's elements in SOURCE ORDER: the mid-tune changes where they stand, the events,
 * and the barlines that open and close each measure.
 */
function voiceElements(
  abc: string,
  measures: readonly Measure[],
  /** Filled in as the stream is built — see `projectionOf`. */
  byEvent?: Map<MusicEvent, AbcElement>,
  /** The same, for elements the drawing joins by SOURCE RANGE rather than by event. */
  byRange?: Map<number, AbcElement>,
  /** The slur labels still open on this VOICE — one stack for the whole tune. */
  openSlurs: number[] = [],
  /** The tune's own `Q:`, for the first voice of the first line — see `projectionOf`. */
  headTempo: AbcElement | null = null,
): AbcElement[] {
  const out: (AbcElement | null)[] = [];
  const notes: { event: MusicEvent; e: AbcElement }[] = [];
  for (const measure of measures) {
    out.push(
      bar(measure.openingBarline, measure.openingBarlineSourceRange, byRange),
    );
    // ponytail: a mid-tune `[K:]` and `[M:]` carry source ranges and a `[V:… clef=]`,
    // `[Q:]`, `%%MIDI`, `!style=!`, `%%voicecolor` and `P:` do not yet — so those six
    // element types are absent from the projection. `tests/lines.test.ts` measures which
    // characters that costs, rather than the gap being a claim.
    // **A STANDALONE `K:` OR `M:` LINE IS NOT IN THE STREAM — IT RESTAMPS THE STAFF.**
    // Only the INLINE form is an element (`[K:…]`, `[M:…]`); a field on a line of its own
    // goes to `staff.key` / `staff.meter`, which is the same rule that lets `%%keywarn`
    // remove a cautionary key without touching the line's own signature, and the same one
    // the engraver follows when it draws a body `K:` as a whole staff's key.
    //
    // MEASURED on `selection-clefs`, whose seven `K:C clef=…` lines each precede a note:
    // abcjs opens that note at the LINE, and we opened it at the key element's own end,
    // one character earlier.
    if (!fieldLine(abc, measure.keyChangeSourceRange))
      out.push(el("keySignature", measure.keyChangeSourceRange));
    if (!fieldLine(abc, measure.meterChangeSourceRange))
      out.push(el("timeSignature", measure.meterChangeSourceRange));
    out.push(tempoElement(measure.tempoChange, measure.tempoChangeSourceRange, byRange));
    out.push(
      partElement(measure.partLabel, measure.partLabelSourceRange, byRange),
    );
    for (const event of measure.events) {
      const e = el("note", decoratedRange(abc, event));
      if (e !== null) {
        noteFields(e, event);
        markSlurs(e, event, openSlurs);
        byEvent?.set(event, e);
        notes.push({ event, e });
      }
      out.push(e);
    }
    out.push(
      bar(
        measure.closingBarline,
        measure.closingBarlineSourceRange,
        byRange,
        measure.closingBarNumber,
      ),
    );
  }
  // **SORTED BY POSITION, NOT BY THE ORDER WE HAPPEN TO BUILD THEM.** abcjs appends to the
  // voice as it reads the line, so the stream is in source order by construction; ours is
  // assembled from a measure's fields and has to be put back into it.
  markTuplets(notes.filter((n) => n.event.tuplet !== null));
  markTieEnds(notes);
  const stream = out
    .filter((e): e is AbcElement => e !== null)
    .sort((a, b) => (a.startChar ?? 0) - (b.startChar ?? 0));
  markBeams(abc, stream);
  return tile(abc, stream);
}

/**
 * **A TIE'S CLOSING HEAD IS MARKED TOO** — `endTie: true` on the pitch of the NEXT element
 * that carries the same note, which is what tells a host (and abcjs's own engraver) which
 * head a curve arrives at. Matched by pitch, because a chord ties head by head.
 */
function markTieEnds(
  notes: readonly { event: MusicEvent; e: AbcElement }[],
): void {
  let open: number[] = [];
  for (const { e } of notes) {
    const pitches = e.pitches;
    if (pitches === undefined) continue;
    for (const p of pitches) if (open.includes(p.pitch)) p.endTie = true;
    open = pitches.filter((p) => p.startTie !== undefined).map((p) => p.pitch);
  }
}

/**
 * **A SLUR IS A NUMBERED PAIR, AND THE NUMBER IS THE CHORD POSITION TIMES A HUNDRED.**
 *
 * `addStartSlur` opens at `chordPos * 100 + 1` and walks up past whatever is already open
 * on that voice (`tune-builder.js:697-721`), so the first slur of an ordinary note is
 * **101** — chord position 1, because a slur written before a note is moved onto
 * `pitches[0]` and numbered as that head (`abc_parse_music.js:507-508`). Grace notes take
 * chord position 20, i.e. 2001.
 *
 * The stack is per VOICE and spans the whole tune, which is why it is threaded in rather
 * than being local to a line: a slur may open on one system and close on the next.
 */
function markSlurs(
  e: AbcElement,
  event: MusicEvent,
  open: number[],
): void {
  if (event.type === "rest") return;
  const head = e.pitches?.[0];
  if (head === undefined) return;
  // **A CLOSE IS MATCHED LAST-OPENED-FIRST**, and it is a bare number where an open is an
  // object (`{label}` against `[101]`).
  if (event.slurEnds > 0) {
    const ends: number[] = [];
    for (let i = 0; i < event.slurEnds; i += 1) {
      const label = open.pop();
      if (label !== undefined) ends.push(label);
    }
    if (ends.length > 0) head.endSlur = ends;
  }
  if (event.slurStarts > 0) {
    const starts: { label: number }[] = [];
    for (let i = 0; i < event.slurStarts; i += 1) {
      let next = SLUR_LABEL_BASE;
      while (open.includes(next)) next += 1;
      open.push(next);
      starts.push({ label: next });
    }
    head.startSlur = starts;
  }
}

/** `chordPos * 100 + 1` with `chordPos` 1 — the first head of the element. */
const SLUR_LABEL_BASE = 101;

/**
 * `(3` — **THE MARKS RIDE ON THE FIRST NOTE OF THE GROUP AND ON THE LAST, AND NOTHING IN
 * BETWEEN.** `startTriplet` is the count `p`, `tripletR` how many notes it covers, and
 * `tripletMultiplier` the ratio each duration is scaled by; only `endTriplet` sits on the
 * last (`abc_parse_music.js`, and the chord grid found the same asymmetry from the other
 * side — abcjs's own beat count is wrong for every tuplet BECAUSE the ratio is stamped
 * once).
 *
 * The ratio is not a new model field: our `duration` is the SOUNDING one and
 * `notatedDuration` the written one, so their quotient IS the multiplier, exactly.
 */
function markTuplets(
  members: readonly { event: MusicEvent; e: AbcElement }[],
): void {
  const groups = new Map<number, { event: MusicEvent; e: AbcElement }[]>();
  for (const m of members) {
    const group = m.event.tuplet?.group;
    if (group === undefined) continue;
    const list = groups.get(group) ?? [];
    list.push(m);
    groups.set(group, list);
  }
  for (const list of groups.values()) {
    const head = list[0];
    const tail = list[list.length - 1];
    if (head === undefined || tail === undefined) continue;
    head.e.startTriplet = head.event.tuplet?.number ?? list.length;
    head.e.tripletMultiplier =
      ratToNumber(head.event.duration) / ratToNumber(head.event.notatedDuration);
    head.e.tripletR = list.length;
    tail.e.endTriplet = true;
  }
}

/**
 * **`startBeam` AND `endBeam` ARE A STATE MACHINE OVER THE STREAM, NOT THE DRAWN BEAM.**
 *
 * `appendElement` carries two pointers — the note a beam could start on and the one it
 * could end on — and flags the pair whenever the run closes (`tune-builder.js:174-220`,
 * `:880-945`). Four rules, and three of them are about what does NOT break a run:
 *
 * - a note of a QUARTER or longer closes the run before it (`dur >= 0.25`);
 * - a SPACE after a note closes the run ON it (`el.end_beam`, set by the tokenizer at
 *   `abc_parse_music.js:1244`) — unless the note is a REST, which closes it on the note
 *   BEFORE instead;
 * - a REST otherwise changes nothing at all: it falls past every arm, so `C/D/ z C/D/`
 *   keeps ONE potential run across the silence even though two beams are drawn;
 * - anything that is not a note — a barline, a key, a meter — closes the run.
 *
 * And a run of ONE gets no flags either way, because both pointers must be set. So this is
 * not "the first and last of a beam group": it is abcjs's own bookkeeping, and reading the
 * drawn beams instead would differ on every one of those three cases.
 */
function markBeams(abc: string, stream: readonly AbcElement[]): void {
  let start: AbcElement | undefined;
  let end: AbcElement | undefined;
  const closeLast = (): void => {
    if (start !== undefined && end !== undefined) {
      start.startBeam = true;
      end.endBeam = true;
    }
    start = undefined;
    end = undefined;
  };
  for (const e of stream) {
    if (e.el_type !== "note") {
      closeLast();
      continue;
    }
    const isRest = e.rest !== undefined;
    // `el.end_beam = true` on the whitespace branch of the note tokenizer — so it is the
    // SOURCE that says so. **AND THE ELEMENT'S OWN `endChar` HAS ALREADY EATEN THAT
    // SPACE** — `decoratedRange` walks it, because a note's span closes over its trailing
    // whitespace — so the character to test is the one BEFORE the end, not after it.
    const at = (e.endChar ?? 0) - 1;
    const spaced = abc[at] === " " || abc[at] === "\t";
    if ((typeof e.duration === "number" ? e.duration : 0) >= 0.25) closeLast();
    else if (spaced && start !== undefined) {
      if (isRest) closeLast();
      else {
        start.startBeam = true;
        e.endBeam = true;
        start = undefined;
        end = undefined;
      }
    } else if (!isRest) {
      if (start === undefined) {
        if (!spaced) start = e;
      } else end = e;
    }
  }
  // `closeLine` — the last run of a line is flagged when the line is pushed.
  closeLast();
}

/** `tune.lines` for a score — one line per SYSTEM, as abcjs has one per source line. */
export function linesOf(score: Score, abc: string): AbcLine[] {
  return projectionOf(score, abc).lines;
}

/**
 * The projection, plus the index the selectable array joins on.
 *
 * abcjs's engraver holds the very `tune.lines` element on each drawn thing, so a host that
 * clicks a note and a host that walks `lines` are handed the SAME object. Ours are built
 * here and the drawing carries a reference to the model event it came from
 * (`LayoutElement.sourceEvent`), so this map is the join — see `selectables.ts`.
 */
export function projectionOf(
  score: Score,
  abc: string,
): {
  lines: AbcLine[];
  byEvent: Map<MusicEvent, AbcElement>;
  byRange: Map<number, AbcElement>;
} {
  const byEvent = new Map<MusicEvent, AbcElement>();
  const byRange = new Map<number, AbcElement>();
  const lines: AbcLine[] = [];
  /** One open-slur stack per voice, carried across every system — see `markSlurs`. */
  const openSlurs: number[][] = [];
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
  if (first === undefined) return { lines, byEvent, byRange };
  const breaks = starts(first);

  /**
   * **THE TUNE'S OWN `Q:` IS A DRAWN ELEMENT AND IS NOT IN `tune.lines`** — and the two
   * gates are what say so, one each way. It is REGISTERED here so the selectable array
   * finds it by range (worth five rows, 152 -> 157) and it is put in NO voice's stream,
   * because `getElementFromChar` must keep answering nothing for the characters of a `Q:`
   * field line: putting it in one costs 412 of them and takes 21 ratcheted tunes red,
   * whether it is sorted into the stream or placed ahead of it.
   *
   * That is abcjs's own split — the header tempo lives on `metaText`, and the mark at the
   * head of system 1 is drawn from it rather than from anything in the voice.
   *
   * abcjs draws the mark at the head of system 1 wherever the field sits, and the element
   * keeps the field's own span: `selection-tempo` row 2 is `{startChar: 16, endChar: 39,
   * preString: "Easy Swing", duration: [0.25], bpm: 140}`, and putting it in the stream
   * takes the selectable gate from 152 to **157**.
   *
   *
   * Measured, all four shapes:
   *
   *   in the stream, sorted by startChar, no per-line tiling   244,058 characters
   *   in the stream, sorted, tiling per line                   250,900, 21 ratcheted RED
   *   placed FIRST and out of the chain                        250,900, the same rows RED
   *   registered only, in no stream                            251,312 and 157 selectables
   */
  const headTempo = tempoElement(score.tempo, score.tempoSourceRange, byRange);
  void headTempo;

  breaks.forEach((from, i) => {
    const to = breaks[i + 1] ?? first.measures.length;
    lines.push({
      staff: [
        {
          voices: score.voices.map((v, k) => {
            const slurs = openSlurs[k] ?? [];
            openSlurs[k] = slurs;
            return voiceElements(
              abc,
              v.measures.slice(from, to),
              byEvent,
              byRange,
              slurs,
              null,
            );
          }),
        },
      ],
    });
  });
  return { lines, byEvent, byRange };
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
