import type {
  Barline,
  Clef,
  FreeTextBlock,
  KeySignature,
  Measure,
  MusicEvent,
  Pitch,
  Score,
  SourceRange,
  Tempo,
} from "../core/model.js";
import { defaultClef, plainText, ratToNumber, stepIndex } from "../core/model.js";
import { resolveOverlays } from "./overlays.js";
import { clefElement, keyElement, meterElement } from "./selectables.js";

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
  /** A tempo whose rate came from its WORD and is therefore not printed — see `tempoElement`. */
  suppressBpm?: boolean;
  /**
   * `|1` — the ending label this barline OPENS, as written (`"1"`, `"1,2"`), and
   * `endEnding` on the barline that closes one. Both are the parser's fields on the bar
   * element itself (`abc_parse_music.js:271-280`).
   */
  startEnding?: string;
  endEnding?: boolean;
  // ── a tempo mark, and a body `P:` ──
  preString?: string;
  postString?: string;
  bpm?: number;
  title?: string;
  /** A voice name's label, and a text row's own words. */
  text?: string;
  /** `%%MIDI <cmd> <params…>` written after the music began — see `voiceElements`. */
  cmd?: string;
  params?: readonly (string | number)[];
  /** A `stem` element's own field — `up`, `down` or `auto`. See `resolveOverlays`. */
  direction?: string;
  /** `%%voicecolor` — a `color` element at the head of the voice (`tune-builder.js:993`). */
  color?: string;
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
  /**
   * **THE STAFF'S OWN FURNITURE, STAMPED ON EVERY LINE.** `createStaff` builds each line's
   * staff as `{voices, clef: params.clef, key: params.key, workingClef}` and adds
   * `meter` only `if (params.meter !== undefined)` (`tune-builder.js:1002`, `:1023`), so
   * the clef and key are on all 646 staves of the two corpora and the meter on 265.
   *
   * They carry NO span — a host reading `getElementFromChar` can never reach one — and
   * `deline` is what moves them into the voice stream when they change at a line boundary.
   * After a RENDER they also carry `el_type`, because `createKeySignature` and
   * `createTimeSignature` rename the very object they are handed
   * (`write/creation/create-key-signature.js:8`).
   */
  meter?: AbcElement;
  key?: AbcElement;
  clef?: AbcElement;
}

export interface AbcLine {
  readonly staff?: readonly AbcStaff[];
  /**
   * A `T:` after the first — a line of its own. abcjs's payload is the OBJECT
   * `{text, startChar, endChar}` that `addSubtitle` pushes (`tune-builder.js:297`), the
   * text without its `T:` and the span of the whole field line.
   */
  readonly subtitle?: { readonly text: string; readonly startChar?: number; readonly endChar?: number };
  /**
   * `%%text` / `%%begintext` — `{text, startChar, endChar}` — and `%%center`, which is an
   * ARRAY of one `{text, center: true}` and carries NO span at all, because `addCentered`
   * takes no `info` (`abc_parse_directive.js:986`, `tune-builder.js:318-320`).
   */
  readonly text?:
    | { readonly text: string; readonly startChar?: number; readonly endChar?: number }
    | readonly { readonly text: string; readonly center: true }[];
  /** `%%sep` — three ROUNDED point values and the directive's own span. */
  readonly separator?: {
    readonly spaceAbove: number;
    readonly spaceBelow: number;
    readonly lineLength: number;
    readonly startChar?: number;
    readonly endChar?: number;
  };
  /**
   * `%%vskip n` — blank space above this system. `addSpacing` parks it on
   * `tune.vskipPending` and `createStaff` stamps it onto the line it then opens
   * (`tune-builder.js:1024-1027`), so it belongs to the line BELOW the directive — and
   * `deline` reads it to refuse a merge (`deline-tune.js:16`).
   */
  readonly vskip?: number;
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
/**
 * Elements that came from a BRACKETED or a FIELD-LINE header and keep their own opening —
 * `letter_to_inline_header` sets `startChar = iChar + i` with `i` already past the
 * whitespace it ate (`abc_parse_header.js:344-350`), and the field-line arms pass the
 * line's own span. So the space before a `[K:F]` belongs to NOTHING, exactly as it does
 * before a `[Q:]`.
 */
const FIELD_ELEMENTS: ReadonlySet<string> = new Set([
  "tempo",
  "part",
  "keySignature",
  "timeSignature",
  "clef",
]);

function tile(
  abc: string,
  elements: readonly AbcElement[],
  unreadable: readonly SourceRange[] = [],
): AbcElement[] {
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
    /**
     * **AND A LINE'S OWN LEADING WHITESPACE BELONGS TO NOTHING.** `parseMusic` eats it
     * before it begins reading, so `\n c8| d4` opens its first element at the `c` — six of
     * `S8-layout`'s ten tunes are written that way and abcjs answers null for the space.
     * The space after an inline `[V: …]` is NOT skipped: that one is inside the line and
     * goes to the element after it, which is why the whitespace walk is on THIS branch only.
     */
    const before = elements[i - 1]?.endChar;
    let from: number;
    if (before !== undefined && before >= lineStart(own)) from = before;
    else {
      from = lineStart(own);
      while (from < own && (abc[from] === " " || abc[from] === "\t")) from += 1;
    }
    /**
     * **AND AN INLINE FIELD STOPS THE READING EVEN WHEN IT IS IN NO STREAM.** A `[V: …]`
     * switches voice, a `[L:1/4]` sets the unit length, an `[I:MIDI …]` is a directive and a
     * `[K: style=harmonic]` names no key — none of them is an element at all, and abcjs's
     * tokenizer has consumed every one, so the element AFTER opens at the `]`. On
     * `selection-multiple` that note is 700…714 where its line begins at 681; on
     * `S8-layout` tune 11 a `[L:1/4]` mid-line moved a key signature thirteen characters.
     *
     * The only `]` reachable between the previous close and this element's own start is a
     * field's: a CHORD's sits inside an element whose own start precedes it.
     */
    const field = abc.lastIndexOf("]", own - 1);
    const at = field >= from ? field + 1 : from;
    /**
     * **AND AN `&` BELONGS TO NOTHING.** abcjs appends an `overlay` element for it, but at
     * `startOfLine … startOfLine + 1` rather than at the `&`'s own position
     * (`abc_parse_music.js:314`), so `getElementFromChar` answers NULL for the character
     * itself — and the layer's first note opens after it: `G4 & E4 |` gives the layer
     * 36…40 where its main voice closed at 35.
     */
    /**
     * **AN OPENING `(` RUN BELONGS TO NOTHING UNLESS A NOTE FOLLOWS IT DIRECTLY.**
     *
     * `letter_to_open_slurs_and_triplets` eats the `(`s and the whitespace between them
     * BEFORE anything is appended (`abc_parse_music.js:890-953`), and `startI` was taken at
     * the top of that iteration — so whether the run is inside the element depends on what
     * comes next. If it is a core note or a `[` chord, the element is appended in the SAME
     * iteration and keeps its `(`; if it is a GRACE GROUP, a decoration or a chord symbol,
     * nothing matches, the iteration ends having appended nothing, and the next one opens
     * past the run.
     *
     * MEASURED, because the source reads both ways and the two look alike — instrumented
     * `startI` on `"Bb"{C}B,4 ({^CD}B,4`:
     *
     *     ITER startI=14  NOTE 14..25 "\"Bb\"{C}B,4 "
     *     ITER startI=25            <- the `(`, and NOTHING is appended
     *     ITER startI=26  NOTE 26..35 "{^CD}B,4 "
     *
     * A `(3` is the exception and is not this rule at all: the triplet arm consumes the
     * digit and a note follows directly, so `(3B2` keeps its opening.
     */
    let j = at;
    let sawSlur = false;
    let triplet = false;
    while (j < abc.length && (abc[j] === "(" || abc[j] === " " || abc[j] === "\t")) {
      const next = abc[j + 1] ?? "";
      if (abc[j] === "(" && next >= "2" && next <= "9") {
        // …**AND A TRIPLET INSIDE THE RUN KEEPS THE WHOLE RUN**, slurs and all: the
        // digit is consumed, a note follows directly and the element is appended in the
        // same iteration. `S8-layout` tune 8 writes `((3e` and abcjs answers `note` for
        // BOTH parentheses — the first cut dropped the slur's and took a ratcheted tune
        // red for eight characters.
        triplet = true;
        break;
      }
      if (abc[j] === "(") sawSlur = true;
      j += 1;
    }
    const NOTE_START = /[A-Ga-gzxZ[\^_=]/;
    let start = sawSlur && !triplet && j <= own && !NOTE_START.test(abc[j] ?? "") ? j : at;
    /**
     * **AND A PARSE FAILURE OWNS NO CHARACTERS.** `startI` is taken at the TOP of each
     * `parseMusic` iteration, so an iteration that reads something and appends NOTHING
     * leaves its characters to nobody — the next element opens past them. Two shapes in
     * the two corpora, and the list of every null run abcjs leaves between two elements is
     * what says there are only two: a bare `#` in `^c# ^d#`, and the `^3/2` of a microtone
     * `getCoreNote` returns null for, which strict already drops from the note's own range.
     *
     * The parser records both as `Score.unreadable` — it is the only side that knows what
     * it could not read, and guessing the rule from the characters themselves took the
     * corpus from 255,660 to 255,158 in one run.
     */
    for (const r of unreadable)
      if (r.end > start && r.start < own) start = Math.max(start, r.end);
    return abc[start] === "&" ? start + 1 : start;
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
  /**
   * …**AND A NOTE READS PAST ITS CLOSING `)` AND ITS TIE `-` BEFORE IT STOPS.**
   * `getCoreNote`'s `case ')'` neither sets `endChar` nor returns — it counts the slur
   * close and falls through to `index++` (`abc_parse_music.js:1077-1081`) — and `case '-'`
   * sets `state = 'broken_rhythm'` and keeps going whenever the note could take one, which
   * in a music line it can (`:1222-1237`). So `f) ` is ONE span of three and `B,4- ` one of
   * five, where ours stopped at the pitch.
   *
   * **THEN THE TRAILING WHITESPACE, AND ANY `-` RUN INSIDE IT.** The `case ' '` branch's
   * do-while swallows `isWhiteSpace(c) || c === '-'` together (`:1241-1262`) — which is
   * what hands the next element its own opening. A `)` after whitespace is NOT swallowed:
   * that branch takes whitespace and ties alone, which is why the two loops are separate.
   */
  /**
   * …**EXCEPT A MULTI-MEASURE REST, WHICH CLOSES AT ITS NUMBER.** `state = 'Zduration'`
   * ends with `el.endChar = num.index; return el` (`abc_parse_music.js:1214-1219`), the one
   * arm of `getCoreNote` that returns without reaching the whitespace branch — so ` Z2 |`
   * is a note of three characters and the space after it belongs to the BARLINE. Both `Z`
   * and `X` take it: the test is `rest.type.indexOf('multimeasure') >= 0` (`:1168`).
   */
  const kind = event.type === "rest" ? event.kind : undefined;
  if (kind === "multiMeasure" || kind === "invisibleMultiMeasure")
    return { start, end: own.end };
  let end = own.end;
  /**
   * …**AND A BROKEN RHYTHM BELONGS TO THE NOTE BEFORE IT.** `case '>'`/`case '<'` hands the
   * run to `getBrokenRhythm`, sets `state = 'end_slur'` and keeps going
   * (`abc_parse_music.js:1269-1283`), so `G>F` is `G>` and then `F` — 1288…1290 and
   * 1290…1292 — where ours split it at the `>`.
   */
  while (
    abc[end] === ")" ||
    abc[end] === "-" ||
    abc[end] === ">" ||
    abc[end] === "<"
  )
    end += 1;
  /**
   * …**AND THE WHITESPACE RUN IS ENTERED ONLY BY A LITERAL SPACE OR TAB, WHICH IS WHERE A
   * `\` LINE CONTINUATION GETS IN.** The switch arm is `case ' ': case '\t':` and the
   * do-while inside it tests `tokenizer.isWhiteSpace(c) || c === '-'`
   * (`abc_parse_music.js:1241-1262`) — and `isWhiteSpace` answers TRUE for `\x12`
   * (`abc_tokenizer.js:420-422`), the character abcjs's preprocessing puts where a `\`
   * continuation stood, padding the rest of the line with SPACES so the count is unchanged
   * (`abc_parse.js:513-517`).
   *
   * **SO THE TWO TESTS DISAGREE ON `\x12`, AND THAT ASYMMETRY IS THE RULE**: ` e6 \` is a
   * span of five because a space opened the run, while `e2)\` closes at the `)` because
   * nothing opened one. Swallowing the continuation unconditionally took FOUR ratcheted
   * tunes red while the aggregate improved, which is what named it.
   */
  if (abc[end] === " " || abc[end] === "\t") {
    // …**AND A DOTTED TIE JOINS THE RUN**, because the do-while's own condition is
    // `isWhiteSpace(c) || c === '-' || (c === '.' && next === '-')` and its BODY steps over
    // the `.` before reading the `-` (`abc_parse_music.js:1244-1262`). So ` D .- E` gives
    // the first note a span of six.
    while (
      abc[end] === " " ||
      abc[end] === "\t" ||
      abc[end] === "-" ||
      (abc[end] === "." && abc[end + 1] === "-")
    )
      end += 1;
    /**
     * **AND A CHORD DOES NOT TAKE THE CONTINUATION, BECAUSE A CHORD HAS ITS OWN LOOP.**
     * The post-chord `while (i < line.length && !postChordDone)` switch tests the LITERAL
     * `' '` and `'\t'` (`abc_parse_music.js:417-421`) where the single-note branch's
     * do-while calls `isWhiteSpace` — so `\x12` falls to that switch's
     * `default: postChordDone = true` and stops it. `~g \` is a span of four and
     * `[^G^e^c']   \` one of twelve, on the same line of the same tune.
     */
    if (
      event.type !== "chord" &&
      abc[end] === "\\" &&
      /^[ \t]*(%[^\n]*)?(\n|$)/.test(abc.slice(end + 1))
    )
      // ONE character, because that is all abcjs leaves: the `\` becomes `\x12` and
      // everything after it on the line is padding that the right-trim below removes.
      end += 1;
  }
  /**
   * …**AND A LINE'S TRAILING WHITESPACE IS NOT THERE TO BE SWALLOWED AT ALL.**
   * `line = line.replace(/\s+$/, '')` runs on every line before any handler sees it
   * (`abc_parse.js:411`), so the last element of a line closes at the last NON-space
   * character: `!glissando)!c ` is 199…212 and not …213. `\x12` is not `\s`, which is why a
   * `\` continuation survives the trim and a plain space does not.
   */
  const nl = abc.indexOf("\n", end);
  let limit = nl < 0 ? abc.length : nl;
  while (limit > own.end && (abc[limit - 1] === " " || abc[limit - 1] === "\t"))
    limit -= 1;
  return { start, end: Math.min(end, limit) };
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
  /**
   * **`|1` IS ONE ELEMENT IN ABCJS AND TWO IN OUR MODEL.** `letter_to_bar` consumes the
   * barline, then optional whitespace, an optional `[`, and a run of `1234567890-,`, and
   * `appendElement('bar', startI, i + ret[0], bar)` spans the lot
   * (`abc_parse_music.js:873-887`, `:305`). So the element carries `startEnding: "1"` and
   * READS PAST the digits — `|1` is 893…895 where ours ended at 894. The same shape as the
   * chord-grid arc's biggest finding, one surface over.
   */
  volta?: { label: string; abc: string },
): AbcElement | null => {
  const e = el("bar", range);
  if (e === null || range === null) return e;
  e.type = (kind === null ? undefined : BARLINE_TYPE[kind]) ?? "bar_thin";
  if (barNumber !== undefined) e.barNumber = barNumber;
  if (volta !== undefined) {
    e.startEnding = volta.label;
    e.endChar = endingEnd(volta.abc, range.end);
  }
  byRange?.set(range.start, e);
  return e;
};

/**
 * How far past a barline `letter_to_bar` reads for its ending label — whitespace, an
 * optional `[`, then a token of `1234567890-,`, and NOTHING when that token is empty or
 * opens with a `-` (`abc_parse_music.js:873-887`). A `["…"]` form takes the bracketted
 * string instead (`:879-882`).
 */
const endingEnd = (abc: string, from: number): number => {
  let i = from;
  while (abc[i] === " " || abc[i] === "\t") i += 1;
  if (abc[i] === "[") i += 1;
  if (abc[i] === '"' && abc[i - 1] === "[") {
    const close = abc.indexOf('"', i + 1);
    return close < 0 ? from : close + 1;
  }
  const start = i;
  while (i < abc.length && "1234567890-,".includes(abc[i] ?? "")) i += 1;
  return i === start || abc[start] === "-" ? from : i;
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
export const tempoElement = (
  tempo: Tempo | null | undefined,
  range: SourceRange | null | undefined,
  byRange?: Map<number, AbcElement>,
): AbcElement | null => {
  const e = el("tempo", range);
  if (e === null || tempo == null || range == null) return null;
  e.type = "tempo";
  if (tempo.text !== null) e.preString = tempo.text;
  /**
   * **A LONE TEMPO WORD CARRIES A RATE, DOES NOT PRINT IT, AND GETS ITS `duration` LAST.**
   * `tempoString[preString]` is a 26-entry table and the lookup sets `suppressBpm: true`
   * beside the bpm it found (`abc_parse_header.js:263-266`), which is what keeps `Q:"Adagio"`
   * drawing the word alone while `getBpm` still answers 68.
   *
   * And the KEY ORDER follows from WHEN each value is assigned: a written `1/4=120` gives the
   * duration during `setTempo`, before the bpm, while a word-only tempo has no duration in
   * the field at all and `calcTempo` supplies one at `resolveTempo` — after everything. The
   * two are exclusive: the table is consulted only when the string is the WHOLE field
   * (`if (tokens.length === 0)`), so `suppressBpm` is the discriminator rather than a
   * correlate.
   */
  const duration = tempo.beatUnit === null ? null : [ratToNumber(tempo.beatUnit)];
  if (tempo.suppressBpm !== true && duration !== null) e.duration = duration;
  if (tempo.bpm !== null) e.bpm = tempo.bpm;
  if (tempo.suppressBpm === true) {
    e.suppressBpm = true;
    if (duration !== null) e.duration = duration;
  }
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
/**
 * **`%%keywarn 0` SUPPRESSES A STANDALONE `K:`'s ELEMENTS ENTIRELY.** The guard is
 * `if (!is_in_header && hasBeginMusic() && multilineVars.keywarn !== false)`
 * (`abc_parse_header.js:507`), and the INLINE `[K:]` arm has no such test (`:366-371`) — so
 * the directive turns off the mid-tune key change a `K:` LINE makes and leaves a bracketed
 * one alone. `abcts-keywarn` is the fixture, and it is one of ours.
 */
const inStream = (
  range: SourceRange | null | undefined,
  inline: boolean | undefined,
  keywarn: boolean | undefined,
): boolean => range != null && (inline === true || keywarn !== false);

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
  /** abcjs's `multilineVars.inEnding` — tune-wide state, so it is carried across lines. */
  ending: { open: boolean } = { open: false },
  /** `%%keywarn` — see `keyInStream`. */
  keywarn?: boolean,
): AbcElement[] {
  const out: (AbcElement | null)[] = [];
  const notes: { event: MusicEvent; e: AbcElement }[] = [];
  /**
   * **WHERE AN ELEMENT SORTS WHEN IT HAS NO SPAN OF ITS OWN.** The stream is put back into
   * source order by `startChar`, which a `%%MIDI` element does not have — abcjs writes it
   * `-1 … -1` (`abc_parse_directive.js:719`) and relies on having APPENDED it in reading
   * order. Ours is assembled per measure, so the reading order is recovered from the
   * measure the directive belongs to; the `-0.5` puts it ahead of that measure's own
   * opening barline, which is where abcjs read it.
   */
  const sortAt = new Map<AbcElement, number>();
  /**
   * **THE VOLTA BELONGS TO THE MEASURE IT OPENS AND THE LABEL TO THE BARLINE BEFORE IT.**
   * `Measure.voltaSourceRange` IS that barline's range, so the two are matched by position
   * — which is also how the drawing finds a barline again.
   */
  const voltaAt = new Map<number, string>();
  for (const m of measures)
    if (m.volta !== null && m.voltaSourceRange !== null)
      voltaAt.set(m.voltaSourceRange.start, m.volta);
  const voltaOn = (
    range: SourceRange | null,
  ): { label: string; abc: string } | undefined => {
    const label = range === null ? undefined : voltaAt.get(range.start);
    return label === undefined ? undefined : { label, abc };
  };
  for (const measure of measures) {
    /**
     * **A `%%MIDI` AFTER THE MUSIC HAS BEGUN IS AN ELEMENT OF THE STREAM** —
     * `if (tuneBuilder.hasBeginMusic()) appendElement('midi', -1, -1, {cmd, params})`, and
     * BEFORE it, it is `formatting.midi` instead (`abc_parse_directive.js:718-724`). That
     * split is `formatting`'s own five-rung ladder finding; this is its other half.
     *
     * A directive standing between two music LINES lands at the END of the line above,
     * because `startNewLine` is lazy — the same rule a standalone `K:` follows, and
     * `hoistLeadingStaffFields` is where both are settled.
     */
    const midis: AbcElement[] = [];
    for (const midi of measure.midiCommands ?? []) {
      const e: AbcElement = {
        el_type: "midi",
        startChar: -1,
        endChar: -1,
        cmd: midi.cmd,
        params: midi.params,
      };
      midis.push(e);
      out.push(e);
    }
    const measureFrom = out.length;
    out.push(
      bar(
        measure.openingBarline,
        measure.openingBarlineSourceRange,
        byRange,
        undefined,
        voltaOn(measure.openingBarlineSourceRange),
      ),
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
    /**
     * **A `K:` NAMING A CLEF APPENDS THE CLEF FIRST AND THEN THE KEY, BOTH WITH THE
     * FIELD'S OWN SPAN** — `if (result.foundClef) appendStartingElement('clef', …); if
     * (result.foundKey) appendStartingElement('key', …)`, in that order and from the same
     * two characters (`abc_parse_header.js:508-513`, `:366-371` for the inline form). So
     * `getElementFromChar` over `K:C bass` answers `clef`, not `keySignature`, because it
     * returns the FIRST match in the voice.
     *
     * **AND WHETHER EITHER IS IN THE STREAM AT ALL IS DECIDED LATER** — see
     * `hoistLeadingStaffFields`. Emitted here whatever their position, because the test is
     * "does music precede it", which only the assembled line can answer.
     */
    // **AND A CLEF IS ITS OWN ELEMENT, WITH OR WITHOUT A KEY BESIDE IT** —
    // `if (result.foundClef) appendStartingElement('clef', …)` is unconditional on the key
    // (`abc_parse_header.js:508-509`), so `[K: treble+8]` puts a CLEF in the stream and no
    // key, and `getElementFromChar` answers `clef` for its characters.
    if (
      measure.clefChange !== null &&
      inStream(
        measure.clefChangeSourceRange,
        measure.clefChangeInline,
        keywarn,
      )
    )
      out.push(el("clef", measure.clefChangeSourceRange));
    if (inStream(measure.keyChangeSourceRange, measure.keyChangeInline, keywarn))
      out.push(el("keySignature", measure.keyChangeSourceRange));
    /**
     * **A STANDALONE `M:` LINE IS NEVER IN THE STREAM AND AN INLINE OR CONTINUED ONE ALWAYS
     * IS.** The header parser's `M:` arm only fills `multilineVars.meter` for the next
     * `startNewLine` (`abc_parse_header.js:519-521`) — its `letter_to_body_header` twin is
     * reached only after a `\` continuation — while `letter_to_inline_header`'s `[M:` arm
     * calls `appendStartingElement` (`:356-363`). Our parser already splits the two:
     * `meterChange` is set for the inline and continued forms and `meterForNextLine` for
     * the standalone one, so the PRESENCE of a range is the whole test and the old
     * line-position guard was dropping `[M:C]` written at the head of a line.
     *
     * `meterChangeStandalone` is the flag rather than `!meterChangeInline`, because an `M:`
     * after a `\` continuation is NEITHER — three states, not two.
     */
    if (measure.meterChangeStandalone !== true) {
      /**
       * **EVERY `[M:]` IN THE MEASURE, NOT JUST THE ONE IN FORCE.** abcjs treats a meter
       * as an ordinary element and draws it where it stands, so `[M:2/4]y[M:3/4]y[M:4/4]`
       * is three `timeSignature` elements — `meterChanges` is the plural list and
       * `meterChange` is its LAST entry, the meter in force, which is a different role.
       * The earlier ones had no range at all until now, so they were in no stream and
       * `getElementFromChar` answered null for seven characters of
       * `abcjs-visual-svg-02-staffwidth-12`.
       */
      const all = measure.meterChanges;
      if (all === undefined)
        out.push(el("timeSignature", measure.meterChangeSourceRange));
      else for (const m of all) out.push(el("timeSignature", m.range ?? null));
    }
    out.push(tempoElement(measure.tempoChange, measure.tempoChangeSourceRange, byRange));
    out.push(
      partElement(measure.partLabel, measure.partLabelSourceRange, byRange),
    );
    const note = (event: MusicEvent): void => {
      const e = el("note", decoratedRange(abc, event));
      if (e !== null) {
        noteFields(e, event);
        markSlurs(e, event, openSlurs);
        byEvent?.set(event, e);
        notes.push({ event, e });
      }
      out.push(e);
    };
    for (const event of measure.events) note(event);
    /**
     * **AN `&` OVERLAY LAYER IS READ INTO THE VOICE IT INTERRUPTS, AND `resolveOverlays`
     * SPLITS IT OUT LATER** (`src/compat/overlays.ts`). The parser appends an
     * `{el_type: "overlay"}` for the `&` itself and then goes on appending to the SAME
     * voice (`abc_parse_music.js:311-317`), which is why the layer's notes sit between
     * the main voice's in reading order and why the barline after them does not tile back
     * over them.
     *
     * **THE MARKER CARRIES NO SPAN HERE.** abcjs gives it `startOfLine … startOfLine + 1`,
     * but it never survives `resolveOverlays` — the snip removes it — so the only thing
     * its position has to do is sort it between the main voice's notes and the layer's.
     */
    measure.overlays.forEach((layer) => {
      /**
       * **ONLY THE LAYER ACTUALLY WRITTEN IN THIS MEASURE IS AN `&`.** Our parser PADS
       * every measure of the tune to the tune's overlay depth with rangeless invisible
       * rests, so that the renderer can tile them; abcjs's stream has the `&` and its own
       * notes and NOTHING else, and generates its padding inside `resolveOverlays` from
       * `durationThisBar`. Emitting the padding here made every measure look like an
       * overlay and snipped the first line's own notes out of it.
       */
      const written = layer.filter((e) => e.sourceRange != null);
      const first = written[0]?.sourceRange?.start;
      if (first === undefined) return;
      const marker: AbcElement = { el_type: "overlay" };
      sortAt.set(marker, first - 0.25);
      out.push(marker);
      for (const event of written) note(event);
    });
    out.push(
      bar(
        measure.closingBarline,
        measure.closingBarlineSourceRange,
        byRange,
        measure.closingBarNumber,
        voltaOn(measure.closingBarlineSourceRange),
      ),
    );
    /**
     * …**AND THE POSITION IT SORTS AT IS THIS MEASURE'S OWN FIRST CHARACTER**, taken off
     * the elements actually built rather than off `sourceRange`: a note's span opens at
     * its CHORD SYMBOL or decoration, so `"D"z4` begins five characters before the note
     * and the directive above it has to sort ahead of that too.
     */
    const opens = out
      .slice(measureFrom)
      .flatMap((e) => (e == null ? [] : [e.startChar ?? Number.POSITIVE_INFINITY]));
    const at = Math.min(...opens, Number.POSITIVE_INFINITY) - 0.5;
    for (const e of midis) sortAt.set(e, at);
  }
  // **SORTED BY POSITION, NOT BY THE ORDER WE HAPPEN TO BUILD THEM.** abcjs appends to the
  // voice as it reads the line, so the stream is in source order by construction; ours is
  // assembled from a measure's fields and has to be put back into it.
  markTuplets(notes.filter((n) => n.event.tuplet !== null));
  markTieEnds(notes);
  const keyOf = (e: AbcElement): number => sortAt.get(e) ?? e.startChar ?? 0;
  const stream = out
    .filter((e): e is AbcElement => e !== null)
    .sort((a, b) => keyOf(a) - keyOf(b));
  /**
   * **ANY BARLINE THAT IS NOT A PLAIN THIN `|` ENDS THE ENDING IT SITS IN**, and a barline
   * that opens ANOTHER while one is open ends that one too:
   *
   *     if (inEnding && bar.type !== 'bar_thin') { bar.endEnding = true; inEnding = false }
   *     if (ret[2]) { bar.startEnding = ret[2]; if (inEnding) bar.endEnding = true; inEnding = true }
   *
   * (`abc_parse_music.js:271-280`.) The order is abcjs's: the close is tested BEFORE the
   * open, so `|1 … :|2 … |]` puts `endEnding` on the `:|2` and on the `|]`. The renderer
   * already had this rule as a COMPLEMENT; the projection had it nowhere.
   */
  for (const e of stream) {
    if (e.el_type !== "bar") continue;
    if (ending.open && e.type !== "bar_thin") {
      e.endEnding = true;
      ending.open = false;
    }
    if (e.startEnding !== undefined) {
      if (ending.open) e.endEnding = true;
      ending.open = true;
    }
  }
  markBeams(abc, stream);
  // …**AND THE TILING IS PER LINE ACROSS EVERY VOICE OF IT, NOT PER VOICE** — see the call
  // in `projectionOf`. An `&` overlay layer's notes are read BETWEEN the main voice's, so
  // the barline after them opens where the LAYER stopped reading and not where this voice
  // did.
  return stream;
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
  input: Score,
  abc: string,
): {
  lines: AbcLine[];
  byEvent: Map<MusicEvent, AbcElement>;
  byRange: Map<number, AbcElement>;
} {
  /**
   * **AN `&` OVERLAY LAYER IS A VOICE OF ITS OWN IN `tune.lines`, WITH ITS OWN COPY OF THE
   * BARLINES.** Measured through abcjs on `synth-flattener-21`: `B4 & d4 & f4 | …` comes
   * back as THREE `staff[0].voices` entries, each carrying `bar 65…66` and `bar 80…81` — the
   * same spans, drawn at the same x.
   *
   * `expandOverlays` is the RENDERER's own expansion, reused rather than repeated: a layer
   * inherits its parent's clef, stems, barlines and volta and not its NAME. Without it the
   * layers were in no stream at all and the barline after them tiled back over their notes,
   * which is what `getElementFromChar` was answering for `& E4 |`.
   */
  const score = input;
  const byEvent = new Map<MusicEvent, AbcElement>();
  const byRange = new Map<number, AbcElement>();
  const lines: AbcLine[] = [];
  /** One open-slur stack per voice, carried across every system — see `markSlurs`. */
  const openSlurs: number[][] = [];
  /** `multilineVars.inEnding`, per voice and carried across the tune's lines. */
  const endings: { open: boolean }[] = [];
  /**
   * **A NON-MUSIC LINE IS A LINE, AND ITS POSITION IN THE LIST IS LOAD-BEARING.** A `T:`
   * after the first, a `%%text`, a `%%center`, a `%%begintext` block and a `%%sep` are
   * each `pushLine`d where they were written (`tune-builder.js:296-320`) — and `deline`
   * reads exactly that: any line with no `staff` clears `inMusicLine`, so the music line
   * after one does NOT merge into the one before it (`deline-tune.js:84-87`).
   *
   * ⚠️ **abcjs-debt: the `nonMusic` KEY IS NOT BUILT.** The engraver hangs a
   * `{rows: […]}` on each of these lines at draw time (`engraver-controller.js:229-247`),
   * the same row shape `topText`/`bottomText` carry, and a host reading `line.nonMusic`
   * gets nothing from us. The LINE, its kind and its span are here; the rows are the
   * `topText` machinery pointed at a different list and are owed.
   */
  const textLine = (b: FreeTextBlock): AbcLine => {
    const span =
      b.sourceRange === undefined
        ? {}
        : { startChar: b.sourceRange.start, endChar: b.sourceRange.end };
    const text = b.lines.join("\n");
    if (b.role === "separator")
      return {
        separator: {
          spaceAbove: b.separator?.above ?? 14,
          spaceBelow: b.separator?.below ?? 14,
          lineLength: b.separator?.length ?? 85,
          ...span,
        },
      };
    if (b.role === "subtitle") return { subtitle: { text, ...span } };
    // **`%%center` IS THE ARRAY FORM AND HAS NO SPAN** — `addCentered` takes no `info`.
    if (b.align === "center") return { text: [{ text, center: true }] };
    return { text: { text, ...span } };
  };
  /**
   * The blocks standing before any music, in SOURCE ORDER — the header's own `T:`
   * subtitles and `metadata.textAbove` interleaved. A `%%center` carries no span, so it
   * keeps the position its neighbours give it rather than sorting to the front.
   */
  {
    const before: { at: number; line: AbcLine }[] = [];
    score.metadata.titles.slice(1).forEach((title, i) => {
      const r = score.metadata.titleRanges[i + 1];
      before.push({
        at: r?.start ?? 0,
        line: {
          subtitle: {
            text: plainText(title),
            ...(r === undefined ? {} : { startChar: r.start, endChar: r.end }),
          },
        },
      });
    });
    let last = 0;
    for (const b of score.textAbove) {
      last = b.sourceRange?.start ?? last + 0.5;
      before.push({ at: last, line: textLine(b) });
    }
    before
      .sort((a, b) => a.at - b.at)
      .forEach((b) => {
        lines.push(b.line);
      });
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

  /**
   * **A KEY, CLEF OR METER WRITTEN BEFORE ANY MUSIC ON ITS LINE BELONGS TO THE LINE ABOVE.**
   *
   * `appendStartingElement` walks the CURRENT line's voice and branches on what it meets
   * FIRST: a `note` or `bar`, and it PUSHES the field with its span; an element of the same
   * type, and it REPLACES that one in place; NEITHER, and the value goes onto
   * `staff[n][type]` — where it carries no span at all and `getElementFromChar`, which
   * iterates VOICES only (`abc_tune.js:235-253`), can never see it
   * (`tune-builder.js:272-295`).
   *
   * And **`startNewLine` IS LAZY** — it fires when the first music element is appended — so
   * a field standing at the head of a line is read while `tune.lineNum` still points at the
   * line ABOVE it, whose voice is full of notes. The push lands there.
   *
   * **MEASURED BEFORE IT WAS BUILT AND THE TWO AGREED EXACTLY.** `S6-keys` tune 2 is six
   * `K:` lines between seven music lines, and abcjs's own `tune.lines` reads
   * `[…, bar 506…507, keySignature 508…511]` on line 0 — each key at the END of the line
   * above its own. **THIS CORRECTS 2026-08-16's "a standalone `K:` or `M:` line is NOT in
   * the stream"**: that was true only of the case measured then, where nothing above it
   * held a note.
   *
   * With NO line above holding music the field is genuinely absent, which is the other half
   * abcjs states as `hasBeginMusic()` (`abc_parse_header.js:508`) — `S6-keys` tune 1 opens
   * `K:A` then `[K:G] |` and abcjs answers NOTHING for that `[K:G]`.
   */
  const hoistLeadingStaffFields = (voiceLines: AbcElement[][]): void => {
    const STAFF_FIELD = new Set([
      "clef",
      "keySignature",
      "timeSignature",
      // A `%%MIDI` between two music lines is read while `tune.lineNum` still points at
      // the line above, exactly as a standalone `K:` is — measured on
      // `synth-flattener-07`, whose `%%MIDI drumoff` closes line 0 rather than opening
      // line 1.
      "midi",
    ]);
    for (let i = 0; i < voiceLines.length; i += 1) {
      const line = voiceLines[i];
      if (line === undefined) continue;
      /**
       * **THE TEST IS "BEFORE ANY NOTE OR BAR", NOT "AT THE HEAD".** `appendStartingElement`
       * scans the voice for a `note` or a `bar` and stops at the first one (`:273-292`);
       * a `stem`, a `style` or a `color` — which `createVoice` has already put at the head
       * of every line's voice — is NEITHER, so it is scanned straight past. Reading a
       * LEADING RUN instead cost five ratcheted tunes the moment the stems landed:
       * `visual-layout-07`'s second `K:GMin` stopped being hoisted and answered six
       * characters abcjs answers null for.
       */
      let upto = 0;
      while (
        upto < line.length &&
        line[upto]?.el_type !== "note" &&
        line[upto]?.el_type !== "bar"
      )
        upto += 1;
      const moved: AbcElement[] = [];
      for (let j = upto - 1; j >= 0; j -= 1)
        if (STAFF_FIELD.has(line[j]?.el_type ?? "")) moved.unshift(...line.splice(j, 1));
      if (moved.length === 0) continue;
      // The line above, if it has music of its own to be appended after.
      const above = voiceLines[i - 1];
      if (
        above !== undefined &&
        above.some((e) => e.el_type === "note" || e.el_type === "bar")
      )
        above.push(...moved);
      /**
       * **AND A `%%MIDI` IS NEVER DROPPED, WHERE A STAFF FIELD IS.** `appendElement`
       * pushes it onto the current voice unconditionally (`tune-builder.js:174-179`)
       * where `appendStartingElement` has a third arm that puts the value on the STAFF
       * and out of the stream (`:295`). So the two part company on exactly the line the
       * hoist cannot move: with nothing above holding music, a key is absent and a
       * `%%MIDI` stays where it was written — measured on `synth-flattener-07`, whose
       * `%%MIDI drumon` after a body `V:` opens line 0.
       */
      else line.unshift(...moved.filter((e) => e.el_type === "midi"));
    }
  };

  /**
   * **THE STAFF'S CLEF, KEY AND METER, PER LINE** — `params.clef`/`params.key`/
   * `params.meter` as `startNewLine` stamps them (`abc_parse_music.js:961-998`,
   * `tune-builder.js:1002`, `:1023`). The clef and key are on EVERY line; the meter only
   * where one was newly specified, which is a THREE-WAY split abcjs states in three
   * different files and a five-rung ladder through it settles:
   *
   *     M:3/4  on its own line   the NEXT line's `staff.meter`, nothing in the stream
   *     [M:3/4] leading a line   a `timeSignature` at the END of the line ABOVE
   *     K:G    on its own line   a `keySignature` at the end of the line above, AND
   *                              the next line's `staff.key`
   *
   * The parser's `M:` arm just fills `multilineVars.meter` for the next `startNewLine`
   * (`abc_parse_header.js:519-521`) where the `[M:` arm appends to the current line
   * (`:356-362`) — so only the standalone form reaches a staff. On the FIRST line there
   * is no line above and no music yet, so `hasBeginMusic()` is false and BOTH forms land
   * on the staff.
   *
   * The values themselves are only ever compared line to line, by `deline`'s `objEqual`,
   * so what matters is that they change exactly where abcjs's change.
   */
  const musicStartsAt = (m: Measure): number =>
    Math.min(
      m.openingBarlineSourceRange?.start ?? Number.POSITIVE_INFINITY,
      ...m.events.map((e) => e.sourceRange?.start ?? Number.POSITIVE_INFINITY),
    );
  const leadsLine = (m: Measure, at: number | null | undefined): boolean =>
    at != null && at < musicStartsAt(m);
  /**
   * **ONE STAFF PER `%%score` GROUP, AND ONE PER VOICE WITHOUT ONE** — the same expression
   * the renderer's `voicesOfStaff` is, and the same default: with no `%%score` every `V:`
   * takes a staff of its own, which is what `abcjs-visual-parsing-05`'s `[V:T]`/`[V:B]`
   * shows as `s0` and `s1`. An `&` layer joins its parent's staff, because `expandOverlays`
   * has already put its id in that group.
   */
  const voicesOfStaff: number[][] =
    score.staves.length > 0
      ? score.staves.map((group) =>
          group.voiceIds
            .map((id) => score.voices.findIndex((v) => v.id === id))
            .filter((k) => k >= 0),
        )
      : score.voices.map((_, k) => [k]);

  const furnitureOf = (
    voice: (typeof score.voices)[number] | undefined,
  ): { key: AbcElement; clef: AbcElement; meter?: AbcElement }[] => {
    const out: { key: AbcElement; clef: AbcElement; meter?: AbcElement }[] = [];
    let clefInForce: Clef = voice?.clef ?? score.clef ?? defaultClef;
    let keyInForce: KeySignature = score.key;
    (voice?.measures ?? []).forEach((m, i) => {
      // A mid-tune clef governs from the START of its measure — the renderer reads it the
      // same way (`layout.ts`, `clefAtMeasure`).
      if (m.clefChange != null) clefInForce = m.clefChange;
      if (i === 0 || m.startsSystem) {
        const key = leadsLine(m, m.keyChangeSourceRange?.start)
          ? (m.keyChange ?? keyInForce)
          : keyInForce;
        /**
         * **AND WHEN A MEASURE CARRIES SEVERAL `[M:]`, THE STAFF'S IS THE FIRST ONE THAT
         * LEADS THE MUSIC, NOT THE ONE IN FORCE.** `meterChange` is the LAST entry —
         * `abcjs-visual-svg-02-staffwidth-12` is `[M:2/4]y[M:3/4]y[M:4/4]` and abcjs puts
         * 2/4 on the staff and draws the other two, because only the first was read while
         * `hasBeginMusic()` was still false.
         */
        const leading =
          m.meterChanges?.find(
            (x) => x.range != null && x.range.start < musicStartsAt(m),
          ) ??
          (leadsLine(m, m.meterChangeSourceRange?.start)
            ? { meter: m.meterChange }
            : undefined);
        const meter =
          i === 0
            ? (leading?.meter ?? score.meter)
            : m.meterChange != null && m.meterChangeStandalone === true
              ? m.meterChange
              : null;
        out.push({
          key: keyElement(key, clefInForce),
          clef: clefElement(clefInForce),
          ...(meter == null ? {} : { meter: meterElement(meter) }),
        });
      }
      if (m.keyChange !== null) keyInForce = m.keyChange;
    });
    return out;
  };
  /** Per STAFF, off its first voice — abcjs's is `multilineVars.staves[staffNum]`. */
  const furniture = voicesOfStaff.map((members) =>
    furnitureOf(score.voices[members[0] ?? 0]),
  );

  breaks.forEach((from, i) => {
    const to = breaks[i + 1] ?? first.measures.length;
    /**
     * **THE TILING IS PER LINE ACROSS EVERY VOICE, BECAUSE READING IS.** An element opens
     * where the one before it STOPPED READING, and abcjs's tokenizer reads one line
     * top-to-bottom whatever voice each element lands in — so an `&` overlay layer's notes
     * sit between the main voice's, and the barline after them opens at 40 and not at 35.
     * Measured through abcjs on `synth-flattener-21`, whose main voice reads
     * `[… note 52…55, bar 65…66 …]` with the layer's `note 56…60` and `note 61…65` in
     * between: the bar did NOT tile back over them.
     *
     * `tile` mutates in place, so the per-voice arrays below still hold the same objects —
     * which is the identity `getElementFromChar` and the selectable array both rest on.
     */
    const lineVoices = score.voices.map((v, k) => {
      const slurs = openSlurs[k] ?? [];
      openSlurs[k] = slurs;
      return voiceElements(
        abc,
        v.measures.slice(from, to),
        byEvent,
        byRange,
        slurs,
        null,
        endings[k] ?? (endings[k] = { open: false }),
        score.keywarn,
      );
    });
    /**
     * **ONLY AN ELEMENT WITH A SPAN IS TILED.** A `%%MIDI` is `-1 … -1` and a `stem` has
     * no `startChar` KEY at all; letting either into the chain both destroyed its own
     * `-1` and handed the element after it the wrong opening.
     */
    tile(
      abc,
      lineVoices
        .flat()
        .filter((e) => (e.startChar ?? -1) >= 0)
        .sort((a, b) => (a.startChar ?? 0) - (b.startChar ?? 0)),
      score.unreadable ?? [],
    );
    /**
     * **A LINE HOLDS ONLY THE STAVES THAT WROTE MUSIC ON IT.** `createStaff` runs from
     * `startNewLine`, which fires when a voice appends its first element to the line
     * (`tune-builder.js:344-351`), so a staff silent on one system is ABSENT from that
     * line's `staff` array rather than present and empty. Measured on
     * `abcjs-visual-parsing-04`, three `\`-continued `[V:]` switches: abcjs's line 1 has
     * `staff[0]` alone, and `deline` therefore pushes NO `{el_type: "break"}` for the
     * staff it does not find — `if (inputStaff)` guards the whole merge
     * (`deline-tune.js:23`, `:66`).
     */
    /**
     * **`createVoice` OPENS EVERY LINE'S VOICE WITH ITS OWN FURNITURE** — a `style`, a
     * `stem`, a `scale` and a `color`, in that order and each with a NULL `startChar`, so
     * `appendElement` leaves the key off entirely (`tune-builder.js:965-994`, `:174-179`).
     *
     * Two sources of a `stem`, and the second is the one that surprises:
     *
     *   - `V:… stem=up` names it outright, and every line of that voice opens with it;
     *   - **A VOICE THAT IS NOT THE FIRST ON ITS STAFF GETS `down`, AND PUTS AN `up` ON
     *     THE FIRST ONE** — that is how two voices sharing a staff are told apart.
     *
     * ⚠️ **AND abcjs'S GUARD AGAINST DOUBLING THE `up` NEVER FIRES.** It tests
     * `thisStaff.voices[0].el_type === 'stem'` — on the ARRAY, not on its elements
     * (`:980`) — so `found` is always false and a THREE-voice staff splices two `up`
     * stems onto its first voice. Ported as written, because the count is visible.
     */
    voicesOfStaff.forEach((members) => {
      const firstOfStaff = lineVoices[members[0] ?? 0];
      /**
       * **AND THE ORDER `createVoice` RUNS IN IS THE SOURCE'S, NOT THE STAFF'S.** The
       * `up` stem is spliced onto `thisStaff.voices[0]` only `if (thisStaff.voices[0] !==
       * undefined)` (`:977`) — so a `%%score (V2 V1)` whose `[V:V1]` line is written
       * FIRST creates staff voice 1 before staff voice 0 exists, and no `up` stem is ever
       * added. Measured on `score-reorder-shared`: abcjs's `v0` has none and its `v1`
       * has the `down`.
       */
      const opened = (k: number): number =>
        Math.min(
          ...(lineVoices[k] ?? []).map((e) => e.startChar ?? Number.POSITIVE_INFINITY),
          Number.POSITIVE_INFINITY,
        );
      const created = new Set<number>();
      [...members.keys()]
        .sort((a, b) => opened(members[a] ?? 0) - opened(members[b] ?? 0))
        .forEach((j) => {
          const k = members[j] ?? 0;
          const voice = lineVoices[k];
          if (voice === undefined || voice.length === 0) return;
          created.add(j);
          const head: AbcElement[] = [];
          const stem = score.voices[k]?.stemDirection;
          if (stem != null) head.push({ el_type: "stem", direction: stem });
          else if (j > 0) {
            if (created.has(0))
              firstOfStaff?.splice(0, 0, { el_type: "stem", direction: "up" });
            head.push({ el_type: "stem", direction: "down" });
          }
          const color = score.voices[k]?.color;
          if (color != null) head.push({ el_type: "color", color });
          voice.splice(0, 0, ...head);
        });
    });
    // **FREE TEXT AND MID-TUNE SUBTITLES BETWEEN TWO SYSTEMS ARE LINES OF THEIR OWN**,
    // read off the same first measure the renderer's own block does (`Measure.textBefore`).
    for (const b of score.voices[0]?.measures[from]?.textBefore ?? [])
      lines.push(textLine(b));
    // `%%vskip` — the same first-measure read the renderer's `vskipBeforeSystem` makes.
    const vskip = score.voices
      .map((v) => v.measures[from]?.vskip ?? 0)
      .find((n) => n > 0);
    lines.push({
      ...(vskip === undefined ? {} : { vskip }),
      staff: voicesOfStaff
        .map((members, s) => ({ members, s }))
        .filter(({ members }) => members.some((k) => (lineVoices[k] ?? []).length > 0))
        .map(({ members, s }) => {
          const staff: AbcStaff = {
            voices: members.map((k) => lineVoices[k] ?? []),
          };
          const own = furniture[s]?.[i];
          if (own !== undefined) {
            // THE KEY ORDER IS abcjs's — `{voices, clef, key}` from `createStaff` with the
            // meter added after, which is what a host comparing the objects sees.
            if (own.meter !== undefined) staff.meter = own.meter;
            staff.key = own.key;
            staff.clef = own.clef;
          }
          return staff;
        }),
    });
  });
  // …and the hoist runs over the finished lines, per voice, because it moves an element
  // from one line's array into another's.
  for (const b of score.textBelow) lines.push(textLine(b));
  /**
   * **AND NOW THE `&`s ARE RESOLVED, WHICH IS WHERE abcjs DOES IT TOO** — in `cleanUp`,
   * over the finished lines rather than while reading them (`tune-builder.js:107-124`).
   * It moves each layer into a voice of its own, back-fills every EARLIER line with
   * invisible-rest copies, and leaves three `stem` elements per snip behind.
   */
  resolveOverlays(lines);
  // …and the hoist reads the FIRST MUSIC line, which is no longer line 0 once a subtitle
  // or a `%%text` stands above it.
  const firstStaff = lines.find((l) => l.staff !== undefined);
  const staffCount = firstStaff?.staff?.length ?? 0;
  for (let j = 0; j < staffCount; j += 1) {
    const voiceCount = firstStaff?.staff?.[j]?.voices.length ?? 0;
    for (let k = 0; k < voiceCount; k += 1)
      hoistLeadingStaffFields(
        lines.flatMap((l) => {
          const v = l.staff?.[j]?.voices[k];
          return v === undefined ? [] : [v as AbcElement[]];
        }),
      );
  }

  /**
   * **`noWarnBeforeTitle` — A COURTESY KEY BEFORE A SUBTITLE IS POPPED BACK OFF**
   * (`tune-builder.js:1075-1111`, run from `cleanUp`). A standalone `K:` is appended to
   * the line ABOVE it, as every other one is; then, if the NEXT line is a subtitle, abcjs
   * takes it straight back off — "a `K:` immediately preceded by a `T:` starts a new
   * section, so the cautionary key change belongs to the new section's initial key".
   *
   * Instrumented rather than reasoned: `appendStartingElement` fires for that `K:D`
   * (`ASE type=key 400..403 lineNum=1 … voice=["note","bar"]`) and the element is
   * nonetheless absent from abcjs's own `tune.lines`. The pop is the only thing that can
   * explain both.
   *
   * The naturals half is ported with it. Ours never carries one — `keyElement` builds the
   * signature from the fifths and has no `impliedNaturals` — so it is a no-op today and
   * the shape is what matters.
   */
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.subtitle === undefined) continue;
    for (const staff of lines[i - 1]?.staff ?? []) {
      for (const voice of staff.voices) {
        const last = voice[voice.length - 1];
        if (last?.el_type !== "keySignature") continue;
        (voice as AbcElement[]).pop();
        let j = i;
        while (j < lines.length && lines[j]?.staff === undefined) j += 1;
        for (const next of lines[j]?.staff ?? []) {
          const acc = next.key?.accidentals;
          if (acc !== undefined)
            (next.key as { accidentals?: unknown }).accidentals = acc.filter(
              (a) => a.acc !== "natural",
            );
        }
      }
    }
  }
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
