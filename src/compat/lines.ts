import type {
  Barline,
  Clef,
  FreeTextBlock,
  LyricFont,
  KeySignature,
  Measure,
  Meter,
  MusicEvent,
  Pitch,
  Score,
  SourceRange,
  Tempo,
} from "../core/model.js";
import { defaultClef, freeTextOf, plainText, ratToNumber, stepIndex } from "../core/model.js";
import { resolveOverlays, type OverlayLine } from "../core/overlays.js";
import {
  abcjsFont,
  richOf,
  BAR_FONTS,
  differentFont,
  NOTE_FONTS,
} from "./fonts.js";
import {
  clefElement,
  clefVerticalPos,
  impliedNaturals,
  keyElement,
  meterElement,
} from "./selectables.js";

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
  startSlur?: { label: number; style?: string }[];
  endSlur?: number[];
  startTie?: { style?: string };
  endTie?: boolean;
  /**
   * `"same"` or `"different"` — a chord head the engraver pushed aside because it stands a
   * second (or less) from its neighbour. The engraver's answer, stamped on the parse pitch.
   */
  printer_shift?: string;
  /** `%%MIDI drummap` on a percussion clef — the drum this written letter plays. */
  midipitch?: number;
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
  suppress?: boolean;
  size?: number;
  /**
   * A `style` element's note head — abcjs's `appendElement('style', null, null, {head:
   * params.style})` (`tune-builder.js:971-972`). The field is literally named `head`
   * because it is the NOTE HEAD to draw, not a position.
   */
  head?: string;
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
  rest?: { type: string; text?: string | number };
  duration?: number | readonly number[];
  decoration?: readonly string[];
  chord?: readonly {
    name: string;
    position?: string;
    /** `"@x,y TEXT"` — an ABSOLUTELY positioned annotation, which carries no `position`. */
    rel_position?: { x: number; y: number };
  }[];
  gracenotes?: readonly {
    pitch: number;
    name: string;
    duration: number;
    verticalPos: number;
  }[];
  lyric?: readonly { syllable: string; divider: string }[];
  startBeam?: boolean;
  endBeam?: boolean;
  /** `!beambr1!` / `!beambr2!` — a beam break, consumed off the decoration list. */
  beambr?: number;
  /**
   * **A WHOLE-CHORD SLUR SITS ON THE ELEMENT, NOT ON A HEAD** — and so does a `)` that
   * closes on a rest. See `markSlurs`.
   */
  startSlur?: { label: number; style?: string }[];
  endSlur?: number[];
  /** `!class=…!` — a host's own class on this element. See `noteFields`. */
  extraClass?: string;
  /** `%%…font` overrides in force here that differ from the tune's — see `voiceElements`. */
  positioning?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
  /** `!style=x!` — the DECORATION's notehead shape. See `Note.styleMark`. */
  style?: string;
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
  /** The staff's voice NAMES — `name` on the first music line, `subname` after it. */
  title?: readonly string[];
}

export interface AbcLine {
  readonly staff?: readonly AbcStaff[];
  /**
   * A `T:` after the first — a line of its own. abcjs's payload is the OBJECT
   * `{text, startChar, endChar}` that `addSubtitle` pushes (`tune-builder.js:297`), the
   * text without its `T:` and the span of the whole field line.
   */
  readonly subtitle?: {
    /** A string, or `parseFontChangeLine`'s phrases — see the `T:` note at `textLine`. */
    readonly text: unknown;
    readonly startChar?: number;
    readonly endChar?: number;
  };
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
  // …**AND THE PARSER'S OWN TWO NAMES**, which is what an UNENGRAVED tune carries — see
  // `projectionOf`'s `engraved`. Every test on an element's kind needs both spellings, or
  // it silently stops firing for `parseOnly`.
  "key",
  "meter",
]);

function tile(
  abc: string,
  elements: readonly AbcElement[],
  unreadable: readonly SourceRange[] = [],
  /**
   * Where the PREVIOUS projected line's last element closed, when there is one.
   *
   * ⚠️ **A `%%barsperstaff` LINE IS NOT A SOURCE LINE.** abcjs does not tile at all — each
   * element's `startChar` is where its tokenizer began, which for the first note of a
   * WRAPPED line is right after the barline before it, not at the source line's start.
   * Reading the line's own start there took `abcts-directives-2` tune 3's ninth note back
   * ten characters.
   */
  carried?: number,
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
    const before = i === 0 ? carried : elements[i - 1]?.endChar;
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
    /**
     * ⚠️ **AND A `.` BEFORE THE SLUR JOINS THE RUN WHILE ONE AFTER IT ENDS THE RUN.** The
     * gather loop takes decorations, chord symbols and graces at the iteration's HEAD and
     * breaks on the `(`; the slur is then consumed and the iteration ends if what follows
     * is not note-ish. So a `.` reached BEFORE any slur is still being gathered by this
     * iteration, and a `.` reached AFTER one is the next iteration's first token.
     * Instrumented on abcjs's own `startI`, four shapes that only this asymmetry explains:
     *
     *     .(F4)        0   the dotted slur is inside the note
     *     .("^X"F4)    2   the chord symbol after it opens a new iteration
     *     (.F4)        1   the dot after the slur opens a new iteration
     *     ((F4))       0
     *
     * `abcts-start-char`'s `.("^🚩""_II7"F4` is the second shape, and the run used to stop
     * dead at the `.` — `sawSlur` never became true and the note kept the two characters
     * abcjs leaves to nobody.
     */
    while (
      j < abc.length &&
      (abc[j] === "(" || abc[j] === " " || abc[j] === "\t" || (abc[j] === "." && !sawSlur))
    ) {
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
    /**
     * …**AND A DECORATION DOES NOT REACH BACK ACROSS ONE.** The test is the element's own
     * CLOSE, not its opening: `startI` is retaken by every junk character, while `el` — the
     * decorations, the chord symbol, the grace group — SURVIVES the iteration that appended
     * nothing. So `t o t he` in prose gives abcjs a note at the `e` carrying two tenutos
     * read eleven characters earlier, and our opening walked back to the first of them.
     * Measured on `frere-jacques`, whose `U:t`/`U:u`/`U:v` make its own prose parse that way.
     */
    const reach = e.endChar ?? own;
    for (const r of unreadable)
      if (r.end > start && r.start < reach) start = Math.max(start, r.end);
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
  /**
   * **A BARLINE CARRIES DECORATIONS AND CHORD SYMBOLS OF ITS OWN.** A hairpin's close
   * written at the end of a bar attaches to the BARLINE rather than to the next note — the
   * audio arc found that from the flattener's side, and `synth.sequence` is what showed the
   * projection had never carried it: `numNotesToDecoration` counts to the element holding
   * `crescendo)`, and with it missing the search ran to the end of the line and made the
   * hairpin's step 2 where abcjs's is 4.
   */
  extras?: {
    decorations?: readonly string[];
    chordSymbol?: string;
    annotations?: readonly string[];
  },
  /** `addFormattingOptions`'s two for a bar — `measurefont` and `repeatfont`. */
  fonts?: Record<string, unknown>,
): AbcElement | null => {
  const e = el("bar", range);
  if (e === null || range === null) return e;
  if (fonts !== undefined) e.fonts = fonts;
  e.type = (kind === null ? undefined : BARLINE_TYPE[kind]) ?? "bar_thin";
  if (extras?.decorations !== undefined && extras.decorations.length > 0)
    e.decoration = extras.decorations.map((d) => DECORATION_NAME[d] ?? d);
  const barChord: NonNullable<AbcElement["chord"]>[number][] = [];
  if (extras?.chordSymbol !== undefined)
    barChord.push({ name: extras.chordSymbol, position: "default" });
  for (const a of extras?.annotations ?? []) barChord.push(annotationEntry(a));
  if (barChord.length > 0) e.chord = barChord;
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
  /** See `projectionOf` — `type` is the ENGRAVER's, and abcjs says so in a TODO. */
  engraved = true,
): AbcElement | null => {
  const e = el("tempo", range);
  if (e === null || tempo == null || range == null) return null;
  /**
   * ⚠️ **AND `type` IS STAMPED BY THE ENGRAVER, NOT THE PARSER** — `TempoElement`'s
   * constructor opens `this.tempo.type = "tempo"` under abcjs's own comment "TODO-PER:
   * this should be set earlier, in the parser, probably"
   * (`write/creation/elements/tempo-element.js:9`). So an unengraved tune's tempo carries
   * `el_type` and no `type`, which is the same word twice one time instead of two.
   */
  if (engraved) e.type = "tempo";
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
  // …**AND `%%printtempo false` PUBLISHES A FLAG, NOT AN ABSENCE.** `parseTempo` stamps
  // `tempo.suppress` and the field stays on `metaText.tempo` and in the stream — what
  // changes is that the ENGRAVER draws no mark. See `Tempo.suppress`.
  if (tempo.suppress === true) e.suppress = true;
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
 * ⚠️ **`verticalPos` IS THE PARSER'S, AND IT WAS HELD BACK WITH THE ENGRAVER'S.**
 * `highestVert`, `averagepitch`, `minpitch` and `maxpitch` really are stamped when the
 * drawing is walked (`src/compat/selectables.ts`) — but `pushNote` writes
 * `p.verticalPos = p.pitch - mid` for every pitch and every grace note as the element is
 * APPENDED (`parse/tune-builder.js:917-928`), so an unengraved tune already carries it.
 * Ours stood at `pitch` under a note reading "a placeholder until the drawing is walked …
 * `mid` is the staff's, which this side does not know" — the second clause was true and
 * the conclusion did not follow: the clef is a parameter here now.
 *
 * `mid` is 0 for treble, which is why `verticalPos === pitch` reads as an identity until a
 * `bass` or `alto` clef turns up. 1,220 of the 1,249 rows the element-VALUE probe opened at.
 */
function noteFields(
  e: AbcElement,
  event: MusicEvent,
  /**
   * **A PERCUSSION CLEF TURNS A WRITTEN LETTER INTO A DRUM.** `%%MIDI drummap B 38` and a
   * `clef=perc` make the parser stamp `midipitch` on the pitch itself
   * (`abc_parse_music.js:1129-1137`), keyed by the letter AS WRITTEN with its accidental in
   * front — no octave marks, because those are read after. The flattener reads it back and
   * plays it instead of the pitch.
   *
   * **AND THE CLEF IN FORCE DECIDES, NOT THE VOICE'S** — abcjs tests `multilineVars.clef`
   * as the parser walks, so a mid-tune `[K:… clef=perc]` turns the map on partway through a
   * line. `abcts-ledger-gaps-2` tune 6 is the fixture; see the call site.
   */
  drumMap?: Readonly<Record<string, number>>,
  /** The measure's own length in whole notes — see `voiceElements`. */
  barLength = 1,
  /** `addFormattingOptions`'s four — see `voiceElements`. */
  fonts?: Record<string, unknown>,
  /** `workingClef.verticalPos` — what `verticalPos` is measured from. See the note above. */
  clefMid = 0,
  /**
   * **A CHORD'S PITCHES ARE SORTED BY THE ENGRAVER, NOT THE PARSER.** `[cD]` is read as
   * written and `createNote` sorts `elem.pitches` in place before it builds the heads,
   * because noteheads must STACK in pitch order to be drawn. So a RENDERED tune reads
   * `D, c` and an unengraved one reads `c, D` — both right about their own entry point,
   * which is the same split `getMidiFile` on a string already proved from the audio side.
   * 63 rows of the element-VALUE probe.
   */
  engraved = true,
): void {
  /** abcjs's key is the letter AS WRITTEN with its accidental, and no octave marks. */
  const drumKey = (name: string): string => name.replace(/[,']/g, "");
  e.duration = ratToNumber(event.notatedDuration);
  if (event.type === "rest") {
    e.rest = { type: restType(event.kind) };
    /**
     * **A MULTI-MEASURE REST IS AS LONG AS IT SAYS, AND IT SAYS SO TWICE.**
     * `el.duration = num * tune.getBarLength()` and `el.rest.text = num`
     * (`abc_parse_music.js:1216-1217`), with a bare `Z` taking one bar and a `text` of 1
     * (`:1169-1170`). Our model holds the BAR's length and the count separately, so the
     * element multiplies them back — `Z4` in 4/4 is `duration: 4`, not 1.
     */
    if (event.kind === "multiMeasure" || event.kind === "invisibleMultiMeasure") {
      const bars = event.measureCount > 0 ? event.measureCount : 1;
      e.duration = bars * barLength;
      e.rest.text = bars;
    } else if (
      /**
       * ⚠️ **THERE ARE TWO WHOLE-REST RULES AND THEY ARE NOT THE SAME RULE.**
       *
       *   PARSER   `el.rest.type === 'rest' && el.duration === 1 && durationOfMeasure <= 1`
       *            (`abc_parse_music.js:552-557`) — the rest is WRITTEN as a whole and the
       *            measure is no longer than one, whatever it actually fills. ⚠️ **ASKED
       *            OF THE PARSER, NOT RE-DERIVED HERE**: that rule rewrites the duration
       *            to the measure's, which destroys the test that chose it, so
       *            `M:6/8 L:1/4 z4` reads 0.75 by the time this sees it. See
       *            `Rest.wholeRest`.
       *   ENGRAVER `this.measureLength === duration`, and not invisible/spacer/multimeasure
       *            (`abstract-engraver.js:812-813`) — the rest FILLS the measure, whatever
       *            it was written as.
       *
       * Ours was the ENGRAVER's, applied unconditionally. Gating that one on `engraved`
       * alone took the row count the WRONG WAY — 8 differing to 35 — because 27 rests are
       * `whole` in abcjs's PARSE tree and the engraver's condition is not what puts them
       * there. **A rule that fires in two places is two rules until the source says
       * otherwise.**
       */
      event.wholeRest === true ||
      (engraved &&
        e.duration === barLength &&
        event.kind !== "invisible" &&
        event.kind !== "spacer")
    ) {
      e.rest.type = "whole";
    }
  } else {
    const written = event.type === "note" ? [event.pitch] : event.pitches;
    const unsorted = written
      .map((p) => ({
        // **AN EXPLICIT ACCIDENTAL IS NAMED ON THE PITCH**, and only an explicit one — a
        // note taking its accidental from the key signature carries none.
        ...(p.accidental === null
          ? {}
          : { accidental: accidentalName(p, writtenName(p)) }),
        pitch: abcjsPitch(p),
        name: writtenName(p),
        ...(drumMap === undefined || drumMap[drumKey(writtenName(p))] === undefined
          ? {}
          : { midipitch: drumMap[drumKey(writtenName(p))] }),
        // **AND A `!style=…!` INSIDE THE BRACKETS IS THIS HEAD'S** — see `Pitch.style`
        // and `abc_parse_music.js:375-379`. abcjs writes it between `name` and
        // `verticalPos`, which is where it is assigned.
        ...(p.style === undefined ? {} : { style: p.style }),
        verticalPos: abcjsPitch(p) - clefMid,
      }))
    // …and see `engraved`: the parser leaves them as written.
    e.pitches = engraved ? [...unsorted].sort((a, b) => a.pitch - b.pitch) : unsorted;
    // **A TIE IS A PROPERTY OF THE PITCH** — `el.pitches.forEach(p => p.startTie = {})`
    // (`abc_parse_music.js:427`), and `[B-eg-b-]` ties three of its four heads. A plain
    // note's `-` lands on `pitches[0]` (`tune-builder.js:162-171`), which is the same rule
    // for a chord of one.
    /**
     * **A DOTTED TIE SAYS SO ON THE `startTie` ITSELF** — `{style: "dotted"}`, where a plain
     * one is the empty object (`abc_parse_music.js:896`). `.-` is not a staccato: abcjs's
     * decoration lexer breaks out of `case '.'` when `-` follows.
     */
    const tieStyle: { style?: string } = event.tieDotted === true ? { style: "dotted" } : {};
    const tied =
      event.type === "chord" && event.tiedPitches !== undefined
        ? event.tiedPitches
        : undefined;
    e.pitches.forEach((p, i) => {
      if (tied === undefined ? event.tiedToNext && i === 0 : tied[i] === true)
        p.startTie = { ...tieStyle };
    });
    if (tied === undefined && event.tiedToNext && e.pitches.length > 1)
      for (const p of e.pitches) p.startTie = { ...tieStyle };
  }
  /**
   * **`!class=…!` RIDES THE ELEMENT** — `letter_to_accent`'s `class=` arm sets
   * `el.extraClass` in the same `if` chain as `style=` and `!…!` decorations
   * (`abc_parse_music.js:229-230`), so a host reads it off the note. Ours carried it in the
   * model and never projected it.
   *
   * Its two neighbours in that chain are here as well: `el.style` from `!style=x!` — which
   * needed `Note.styleMark`, because `Note.style` is the EFFECTIVE shape and "differs from
   * the default" cannot recover which — and `el.fonts`, which `voiceElements` stamps from
   * the fonts in force. All three arrived with the `parseOnly` gate.
   */
  const extraClass = (event as { extraClass?: string }).extraClass;
  if (extraClass !== undefined) e.extraClass = extraClass;
  const styleMark = (event as { styleMark?: string }).styleMark;
  if (styleMark !== undefined) e.style = styleMark;
  /**
   * **AND `positioning` STANDS IMMEDIATELY BEFORE `fonts`**, both of them written by
   * `addFormattingOptions` in that order (`abc_parse.js:120-138`) — MEASURED on a control
   * carrying both, whose notes read `…,duration,positioning,fonts,el_type,…`. It comes off
   * the EVENT because the directives are running state; see `MusicEvent.positioning`.
   */
  const positioning = (event as { positioning?: Record<string, unknown> }).positioning;
  if (positioning !== undefined) e.positioning = positioning;
  if (fonts !== undefined) e.fonts = fonts;
  if (
    event.decorations.length > 0 &&
    !(event.type === "rest" && event.kind === "invisible")
  )
    /**
     * ⚠️ **AN INVISIBLE REST LOSES ITS DECORATIONS, AND NOTHING ELSE DOES.** Measured
     * through abcjs on five rungs: `!segno!x` and `Sx` come back as a bare invisible rest,
     * while `!segno!z`, `!segno!y` (a spacer), `!segno!Z2` and the same decoration on a NOTE
     * all keep it.
     */
    e.decoration = event.decorations
      .map((d) => DECORATION_NAME[d] ?? d)
      // **A BEAM BREAK IS CONSUMED, NOT DECORATED.** `!beambr1!` sets `el.beambr = 1` and
      // is NOT pushed — but the array was already created, so an element whose only
      // decoration was one carries an EMPTY `decoration` rather than none
      // (`abc_parse_music.js:232-238`).
      .filter((d) => d !== "beambr1" && d !== "beambr2");
    const beambr = event.decorations.includes("beambr2")
      ? 2
      : event.decorations.includes("beambr1")
        ? 1
        : undefined;
    if (beambr !== undefined) e.beambr = beambr;
  /**
   * ⚠️ **TWO AT THE SAME POSITION ARE ONE ENTRY, JOINED WITH A NEWLINE**, and abcjs says
   * so in its own comment: *"There could be more than one chord here if they have
   * different positions. If two chords have the same position, then connect them with
   * newline"* — `el.chord[ci].name += "\n" + chordName` (`abc_parse_music.js:191-210`).
   * So `"_one" "_two" "_three"` on one note is ONE below-entry reading `one\ntwo\nthree`,
   * which is exactly what `renderText` then splits into three `<tspan>`s.
   *
   * A `rel_position` entry never merges: it is pushed on the `ret[2] === null` arm, so it
   * has no `position` to match on.
   */
  const chord: NonNullable<AbcElement["chord"]>[number][] = [];
  const addChord = (entry: NonNullable<AbcElement["chord"]>[number]): void => {
    const at =
      entry.position === undefined
        ? -1
        : chord.findIndex((c) => c.position === entry.position);
    if (at < 0) chord.push(entry);
    else (chord[at] as { name: string }).name += `\n${entry.name}`;
  };
  if (event.chordSymbol !== null)
    addChord({ name: event.chordSymbol, position: "default" });
  for (const a of event.annotations) addChord(annotationEntry(a));
  if (chord.length > 0) e.chord = chord;
  if (event.type !== "rest") {
    /**
     * **THE DIVIDER IS PART OF THE SYLLABLE IN OUR MODEL AND A FIELD OF ITS OWN IN
     * abcjs's** — `Strang-` is `{syllable: "Strang", divider: "-"}`, and a syllable that
     * ends a word takes a space.
     *
     * ⚠️ **AND `el.lyric` IS EVERY VERSE, NOT THE FIRST.** A `w:` line pushes one entry per
     * note onto the array it finds there, so two `w:` lines under one music line give every
     * note TWO entries — which is what `addLyric` then joins with `\n` into a single
     * `<text>` of stacked `<tspan>`s (`abstract-engraver.js:769-778`). Ours emitted verse 1
     * alone: 133 rows of the element-VALUE probe, on `visual-tablature-23` and every other
     * multi-verse fixture, and INVISIBLE to every other gate because the DRAWING already
     * reads `extraVerses` and stacks them correctly.
     *
     * A `null` verse is one that never covered this note and contributes no entry; an
     * EMPTY one covered it and contributes `{syllable: "", divider: " "}` — the `*` and
     * `_` rule, which cost four tests when it was found from the drawing side.
     */
    /**
     * **THE DIVIDER IS THE CHARACTER THAT TERMINATED THE SYLLABLE**, and there are three:
     * `var div = words[i]; if (div !== '_' && div !== '-') div = ' ';`
     * (`abc_parse.js:231-241`). So a syllable a `_` HOLDS OVER carries `_`, not a space —
     * and `lyricMelismaStart` is already the flag for "a hold follows this one".
     *
     * ponytail: verse 1 only, because `lyricMelismaStart` is. `extraVerses` is a bare
     * `(string|null)[]` with nowhere to put a per-verse melisma — the same limitation the
     * DRAWING has, recorded on `Note.lyricMelisma`. No fixture in either corpus holds a
     * syllable in a LATER verse.
     */
    const entries = [event.lyric, ...event.extraVerses]
      .filter((v): v is string => v !== null)
      .map((v, verse) => {
        const hyphen = v.endsWith("-");
        const held = verse === 0 && event.lyricMelismaStart === true;
        return {
          syllable: hyphen ? v.slice(0, -1) : v,
          divider: hyphen ? "-" : held ? "_" : " ",
        };
      });
    if (entries.length > 0) e.lyric = entries;
  }
  if (event.graceNotes.length > 0)
    e.gracenotes = event.graceNotes.map((g, i) => ({
      // **A GRACE NAMES ITS ACCIDENTAL TOO** — `getCoreNote` builds one pitch object
      // whatever it is for, so the grace carries the same `accidental` a note's pitch does.
      ...(g.accidental === null
        ? {}
        : { accidental: ACCIDENTAL_NAME[g.accidental] ?? "natural" }),
      pitch: abcjsPitch(g),
      name: writtenName(g),
      ...(drumMap === undefined || drumMap[drumKey(writtenName(g))] === undefined
        ? {}
        : { midipitch: drumMap[drumKey(writtenName(g))] }),
      /**
       * **THE SLASH BELONGS TO THE NOTE AFTER IT** — `if (gra[1][ii] === '/') acciaccatura
       * = true` runs per grace note inside the group (`abc_parse_music.js:687-697`), and
       * the model carries it per note now. See `GracePitch.acciaccatura`.
       */
      ...(g.acciaccatura === true ? { acciaccatura: true } : {}),
      // …and the space that ended its beam — see `GracePitch.endBeam`.
      ...(g.endBeam === true ? { endBeam: true } : {}),
      // **A GRACE'S DURATION IS RELATIVE TO A SIXTEENTH, NOT TO `L:`** — `note.duration =
      // note.duration / (default_length * 8)` (`abc_parse_music.js:694`), so a bare grace
      // is 0.125 whatever the unit note length is, and `{B2}` is 0.25.
      duration: ratToNumber(g.length) / 8,
      // …and the `-` that ties it to the grace after it, which abcjs writes as the empty
      // object a note's own `startTie` is. See `GracePitch.startTie`.
      ...(g.startTie === true ? { startTie: {} } : {}),
      ...(g.endTie === true ? { endTie: true } : {}),
      // …**AND A GRACE NOTE TAKES THE SAME SUBTRACTION** from the same clef
      // (`parse/tune-builder.js:925-928`).
      verticalPos: abcjsPitch(g) - clefMid,
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
/**
 * **A QUARTER TONE NAMES ITSELF, AND THE NAME IS IN THE SPELLING.** abcjs's `accMap` has
 * seven entries — `quarterflat` is `_/` and `quartersharp` is `^/`
 * (`abc_parse_settings.js:147-155`) — where our `Accidental` has five and the microtone
 * rides the EVENT as cents. The written name already carries the `/`, so the element takes
 * its accidental from what was typed rather than from an enum that cannot say it.
 *
 * ponytail: the source spelling is the whole test. A microtone reached any other way — the
 * DSL, a converter — has no `/` to read and falls back to the plain name, which is what the
 * enum can express anyway.
 */
const accidentalName = (
  p: { accidental: number | string | null },
  written: string,
): string => {
  if (written.startsWith("^/")) return "quartersharp";
  if (written.startsWith("_/")) return "quarterflat";
  return ACCIDENTAL_NAME[p.accidental as number] ?? "natural";
};

/**
 * One `"…"` annotation as abcjs's `letter_to_chord` reads it (`abc_parse_music.js:608-660`).
 *
 * ⚠️ **`@x,y` IS NOT A POSITION, IT IS A PAIR OF FLOATS AND A NAME WITHOUT THEM.** The mark
 * is stripped, a float is read, a comma is required, a second float is read, the whitespace
 * after it is skipped, and what remains is the text — `position` is NULL and `rel_position`
 * carries the two numbers. A malformation warns, strips the `@`, and falls back to `above`.
 */
const annotationEntry = (
  a: string,
): { name: string; position?: string; rel_position?: { x: number; y: number } } => {
  const mark = a[0] ?? "";
  if (mark !== "@")
    return { name: a.slice(1), position: ANNOTATION_POSITION[mark] ?? "default" };
  const at = /^@(-?[0-9]*\.?[0-9]+),(-?[0-9]*\.?[0-9]+)[ \t]*/.exec(a);
  if (at === null) return { name: a.slice(1).replace("@", ""), position: "above" };
  return {
    name: a.slice(at[0].length),
    rel_position: { x: Number(at[1]), y: Number(at[2]) },
  };
};

const DECORATION_NAME: Readonly<Record<string, string>> = {
  "<": "accent",
  ">": "accent",
  tr: "trill",
  plus: "+",
  emphasis: "accent",
  "^": "umarcato",
  /**
   * ⚠️ **AND `marcato` IS NOT ONE OF THEM, though abcjs's own pseudonym list pairs it with
   * `umarcato`.** Measured through abcjs: `!marcato!` reaches `tune.lines` as `marcato`
   * while `!^!` reaches it as `umarcato`, because the substitution only fires for a token
   * that is not already a legal decoration name — and `marcato` is one. The renderer
   * canonicalises for its own glyph table; the element a host reads keeps what was written.
   */
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
  openSlurs: SlurStacks = {},
  /** The tune's own `Q:`, for the first voice of the first line — see `projectionOf`. */
  headTempo: AbcElement | null = null,
  /** abcjs's `multilineVars.inEnding` — tune-wide state, so it is carried across lines. */
  ending: { open: boolean } = { open: false },
  /** `%%keywarn` — see `keyInStream`. */
  keywarn?: boolean,
  /** `%%MIDI drummap`, when this voice's clef is percussion — see `noteFields`. */
  drumMap?: Readonly<Record<string, number>>,
  /** This voice's own clef — what a standalone `K:`'s accidentals are pitched for. */
  voiceClef?: Clef | null,
  /**
   * **A TIE CROSSES A LINE BREAK, so its open pitches are carried like the slurs and the
   * endings are.** abcjs's `multilineVars.inTie` is parser state and lives for the whole
   * tune; ours was scoped to one line, so `[V:T1] G8-|` on one line and `G8` on the next
   * left the second note without its `endTie` — 13 rows of the `sequence` gate, and
   * invisible to every other one because a tie's END is drawn from the START's geometry.
   */
  openTies: { pitches: number[] } = { pitches: [] },
  /** The meter in force where this line opens — the bar's own LENGTH, in whole notes. */
  meterIn?: Meter | null,
  /** The key in force where this line opens — what its first change cancels. See `keyAt`. */
  keyIn?: KeySignature,
  /** See `projectionOf` — the engraver RENAMES the two it draws. */
  engraved = true,
  /**
   * **`addFormattingOptions` — THE FONTS THAT DIFFER FROM THE TUNE'S DEFAULT**, stamped on
   * every element as it is appended (`abc_parse.js:120-138`). Four for a note and two for a
   * bar, and the object is the whole font. See `projectionOf`, which runs the changes
   * forward line by line.
   */
  elementFonts: {
    /**
     * A FUNCTION, not a value: `addFormattingOptions` reads the RUNNING font at the moment
     * each element is appended, and a mid-line `[I:…font]` makes two notes on one line
     * disagree. See `MusicEvent.runningFonts`.
     */
    note?: (event: MusicEvent) => Record<string, unknown> | undefined
    bar?: Record<string, unknown>
  } = {},
): AbcElement[] {
  /**
   * **THE NAME THE ENGRAVER WOULD HAVE WRITTEN, OR THE PARSER'S OWN.**
   * `appendStartingElement` names an in-stream key `key` and an in-stream meter `meter`
   * (`tune-builder.js:277`, and `deline` unshifts under the same two names);
   * `createKeySignature` and `createTimeSignature` then rewrite them on the very object
   * `tune.lines` holds. A clef is `clef` on both sides.
   */
  const drawnName = (name: "keySignature" | "timeSignature"): string =>
    engraved ? name : name === "keySignature" ? "key" : "meter";
  const out: (AbcElement | null)[] = [];
  /**
   * **A REST AS LONG AS ITS MEASURE IS A WHOLE REST, WHATEVER THE METER SAYS** —
   * `if (this.measureLength === duration && …) elem.rest.type = 'whole'`
   * (`abstract-engraver.js:812-813`), stamped onto the parse element itself, so a host
   * reads it back off `tune.lines`. The parser has its own narrower copy of the rule for a
   * `z` of exactly one whole note (`abc_parse_music.js:552-556`).
   */
  let barLength = meterIn == null ? 1 : meterIn.numerator / meterIn.denominator;
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
  // `workingClef`, walked — a `[K: clef=]` governs from the START of its measure, which is
  // how the renderer reads it too (`layout.ts`, `clefAtMeasure`).
  let clefNow = voiceClef ?? null;
  /** …and the key, so a change knows what it is cancelling. See `impliedNaturals`. */
  let keyNow = keyIn;
  for (const measure of measures) {
    /**
     * ⚠️ **A CLEF CHANGE GOVERNS FROM WHERE IT IS WRITTEN, NOT FROM THE MEASURE'S HEAD.**
     * abcjs reads `multilineVars.clef` as the parser walks the line, so `B B [K:C
     * clef=perc] B B|` pitches the first two notes in treble and the last two in
     * percussion — and only the last two are stamped with a `%%MIDI drummap` pitch
     * (`abc_parse_music.js:1129-1137`). The renderer takes the same split at
     * `drawClefBefore`; this is its half.
     */
    const clefChangeAt =
      measure.clefChangeSourceRange == null
        ? 0
        : measure.events.filter(
            (e) =>
              (e.sourceRange?.start ?? Number.POSITIVE_INFINITY) <
              (measure.clefChangeSourceRange?.start ?? 0),
          ).length;
    if (measure.clefChange != null && clefChangeAt === 0) clefNow = measure.clefChange;
    if (measure.meterChange != null)
      barLength = measure.meterChange.numerator / measure.meterChange.denominator;
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
        {
          ...(measure.openingBarlineDecorations === undefined
            ? {}
            : { decorations: measure.openingBarlineDecorations }),
          ...(measure.openingBarlineChord === undefined
            ? {}
            : { chordSymbol: measure.openingBarlineChord }),
          ...(measure.openingBarlineAnnotations === undefined
            ? {}
            : { annotations: measure.openingBarlineAnnotations }),
        },
        elementFonts.bar,
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
      out.push(
        (() => {
          const e = el("clef", measure.clefChangeSourceRange);
          /**
           * **AND IT IS THE WHOLE CLEF, NOT A BARE MARKER.** abcjs appends the clef OBJECT
           * — `type`, `verticalPos`, `clefPos` — and `synth.sequence` reads `elem.type` off
           * it to decide a `transpose` row: `[K: treble+8]` is worth +12 and `treble-8` is
           * worth −12 (`abc_midi_sequencer.js:305-312`). Ours pushed an element with a span
           * and nothing else, so an octave clef changed the page and not the sound.
           */
          if (e !== null && measure.clefChange != null)
            Object.assign(e, clefElement(measure.clefChange), {
              startChar: e.startChar,
              endChar: e.endChar,
            });
          return e;
        })(),
      );
    // …**AND THE FLAG IS THE ONE AT THIS `K:`, NOT THE TUNE'S LAST SETTING** — abcjs tests
    // `multilineVars.keywarn !== false` inside `parseKey` itself. See
    // `Measure.keyChangeKeywarn`.
    if (
      inStream(
        measure.keyChangeSourceRange,
        measure.keyChangeInline,
        measure.keyChangeKeywarn ?? keywarn,
      )
    )
      out.push(
        (() => {
          const e = el(drawnName("keySignature"), measure.keyChangeSourceRange);
          /**
           * **AND IT IS THE WHOLE KEY** — the third element this projection pushed as a
           * bare marker, after the clef and the meter. `synth.sequence` reads
           * `elem.accidentals` off it, so a mid-tune `[K:Bb]` restated NOTHING and every
           * note after it sounded in the key it had left.
           *
           * The clef is the change's OWN where an inline `[K:]` named one — see
           * `Measure.keyChangeClef` — and the voice's otherwise.
           */
          if (e !== null && measure.keyChange != null) {
            const keyClef = measure.keyChangeClef ?? clefNow ?? defaultClef;
            const built = keyElement(measure.keyChange, keyClef);
            /**
             * **AND THE NATURALS THAT CANCEL THE OLD KEY GO IN FRONT** —
             * `impliedNaturals.concat(hashParams.accidentals)`
             * (`parse/tune-builder.js:281-291`), where the STAFF's key concatenates them
             * the other way round. Suppressed by `%%keywarn` off, which is abcjs's
             * `multilineVars.keywarn !== false` guard on building the list at all.
             */
            /**
             * ⚠️ **AND THE NATURALS ARE PITCHED FOR THE STAFF'S CLEF WHERE THE
             * ACCIDENTALS ARE PITCHED FOR THE CHANGE'S OWN.** One element, two clefs, and
             * abcjs's own output says so: on `ragtime-nightingale` the `[K:Eb]` element
             * carries its three FLATS at treble positions on BOTH staves — 6, 9, 5 — and
             * its natural at 8 on the treble staff and 6 on the bass one.
             *
             * The mechanism is that `impliedNaturals` OUTLIVES the element.
             * `appendStartingElement` stamps the accidentals through
             * `fixKey(multilineVars.clef, …)` — the clef in force where the inline `[K:]`
             * was READ — while `deepCopyKey` does not copy `impliedNaturals`
             * (`abc_parse_key_voice.js:535-537`, the same omission the `tuneMetrics` work
             * found), so the natural objects survive onto the next `startNewLine` and are
             * re-stamped by ITS `addPosToKey(params.clef, params.key)`, which is the
             * STAFF's clef.
             *
             * Instrumented on both sides before it was written: abcjs's `addPosToKey`
             * logs `mid=0 … nat=[{d}]` and then `mid=-12 … nat=[{d, verticalPos: 8}]` for
             * the SAME object, taking it to 6. Reasoning from the corpus alone had already
             * produced two wrong readings — "the flats must be bass too" and "the arrays
             * alias across staves" — and the second is denied by staff 0 keeping 8.
             */
            // …**AND THE FLAG IS THIS `K:`'s** — see `Measure.keyChangeKeywarn`. abcjs
            // computes the naturals inside `parseKey`, so the directive in force AT the
            // change is what decides, and a later `%%keywarn 0` cannot take them back.
            const naturals =
              (measure.keyChangeKeywarn ?? keywarn) === false || keyNow === undefined
                ? []
                : impliedNaturals(keyNow, measure.keyChange, clefNow ?? keyClef);
            Object.assign(
              e,
              built,
              naturals.length === 0
                ? {}
                : { accidentals: [...naturals, ...(built.accidentals ?? [])] },
              // …**AND THE NAME SURVIVES THE MERGE.** `keyElement` builds the element the
              // ENGRAVER would have, `el_type` and all, so the assign has to put the
              // drawn-or-parsed name back on top of it — see `drawnName`.
              { startChar: e.startChar, endChar: e.endChar, el_type: e.el_type },
            );
          }
          return e;
        })(),
      );
    // …and only NOW does the running key advance: the element above cancels what was in
    // force BEFORE it. See `impliedNaturals`.
    if (measure.keyChange != null) keyNow = measure.keyChange;
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
      /**
       * **AND IT IS THE WHOLE METER, NOT A BARE MARKER** — `appendStartingElement` pushes
       * the parsed object, so the element carries `type` and `value` and
       * `synth.sequence`'s `interpretMeter` can read a `num` and a `den` off it. A marker
       * with a span alone made an inline `[M:]` a meter of nothing.
       */
      const withMeter = (
        e: AbcElement | null,
        meter: Meter | null | undefined,
      ): AbcElement | null => {
        if (e === null || meter == null) return e;
        // The name survives the merge, as the key's does — see `drawnName`.
        return Object.assign(e, meterElement(meter), {
          startChar: e.startChar,
          endChar: e.endChar,
          el_type: e.el_type,
        });
      };
      const all = measure.meterChanges;
      if (all === undefined)
        out.push(
          withMeter(
            el(drawnName("timeSignature"), measure.meterChangeSourceRange),
            measure.meterChange,
          ),
        );
      else
        for (const m of all)
          out.push(withMeter(el(drawnName("timeSignature"), m.range ?? null), m.meter));
    }
    out.push(
      tempoElement(measure.tempoChange, measure.tempoChangeSourceRange, byRange, engraved),
    );
    out.push(
      partElement(measure.partLabel, measure.partLabelSourceRange, byRange),
    );
    const note = (event: MusicEvent): void => {
      const e = el("note", decoratedRange(abc, event));
      if (e !== null) {
        noteFields(
          e,
          event,
          // **THE CLEF IN FORCE DECIDES, NOT THE VOICE'S** — `%%MIDI drummap` is read
          // `if (multilineVars.clef.type === "perc")` as the parser walks
          // (`abc_parse_music.js:1129`), so a mid-tune `[K:… clef=perc]` turns it on
          // partway through a line. A `ponytail:` here predicted exactly that shape and
          // said nothing in either corpus writes one; `abcts-ledger-gaps-2` tune 6 does.
          clefNow?.shape === "percussion" ? drumMap : undefined,
          barLength,
          elementFonts.note?.(event),
          // `currStaff.workingClef.verticalPos` — the voice's clef, which is what
          // `voiceClef` already is for the standalone-`K:` rule below.
          clefNow == null ? 0 : clefVerticalPos(clefNow),
          engraved,
        );
        markSlurs(e, event, openSlurs);
        byEvent?.set(event, e);
        notes.push({ event, e });
      }
      out.push(e);
    };
    for (const [eventIndex, event] of measure.events.entries()) {
      if (measure.clefChange != null && clefChangeAt > 0 && eventIndex === clefChangeAt)
        clefNow = measure.clefChange;
      note(event);
    }
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
       * **ONLY THE LAYER ACTUALLY WRITTEN IN THIS MEASURE IS AN `&`.** The parser resolves
       * the model's overlays through the SAME pass this projection runs (`padOverlays` →
       * `core/overlays.ts`), so a measure the layer does not sing in holds invisible rests
       * standing in for notes and barlines; abcjs's stream has the `&` and its own notes
       * and NOTHING else. Emitting the padding here made every measure look like an
       * overlay and snipped the first line's own notes out of it.
       *
       * ⚠️ **AND A PAD CANNOT BE TOLD FROM A WRITTEN REST BY ITS RANGE** — it carries the
       * span of whatever it stands in for, exactly as abcjs's does — so `overlayPad` is
       * what this reads. It used to test for a null range, which was true only while the
       * padding was spanless and wrong.
       */
      const written = layer.filter(
        (e) => e.sourceRange != null && !(e.type === "rest" && e.overlayPad === true),
      );
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
        {
          ...(measure.closingBarlineDecorations === undefined
            ? {}
            : { decorations: measure.closingBarlineDecorations }),
          ...(measure.closingBarlineChord === undefined
            ? {}
            : { chordSymbol: measure.closingBarlineChord }),
          ...(measure.closingBarlineAnnotations === undefined
            ? {}
            : { annotations: measure.closingBarlineAnnotations }),
        },
        elementFonts.bar,
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
  markTieEnds(notes, openTies);
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
  openTies: { pitches: number[] },
): void {
  for (const { e } of notes) {
    const pitches = e.pitches;
    if (pitches === undefined) continue;
    for (const p of pitches) if (openTies.pitches.includes(p.pitch)) p.endTie = true;
    openTies.pitches = pitches
      .filter((p) => p.startTie !== undefined)
      .map((p) => p.pitch);
  }
}

/**
 * **A SLUR IS A NUMBERED PAIR, AND THE NUMBER IS THE CHORD POSITION TIMES A HUNDRED.**
 *
 * A LINE-BY-LINE PORT of `cleanUpSlursInLine` (`tune-builder.js:664-790`), because the
 * numbering is bookkeeping whose every branch is observable and the shape is not the one
 * a reasonable person would build: **there is one open-slur stack PER CHORD POSITION**,
 * not one per voice, and a close that finds its own position empty takes any other.
 *
 * `chordPos` is 0 for a mark on the ELEMENT, `p + 1` for one on a pitch, and 20 for a
 * grace — so the labels come out 1, 101, 201, … and 2001. Measured shape by shape:
 *
 *     (CD)          p0.start [{label:101}]      p0.end [101]
 *     ([CE]G)       el.start [{label:1}]        p0.end [1]      ← the fallback
 *     ([CE][GB])    el.start [{label:1}]        el.end [1]
 *     (C[EG])       p0.start [{label:101}]      el.end [101]
 *     [(CE)G]       p0.start [{label:101}]      p1.end [201]
 *     {(CD)}E       g0.start [{label:2001}]     g1.end [2001]
 *     (Cz)          p0.start [{label:101}]      el.end [101]
 *     (zC)          NOTHING on the rest         p0.end [101]    ← invented
 *
 * **SO THE MARK GOES WHERE THERE IS A PITCH TO PUT IT ON, AND ON THE ELEMENT WHEN THERE IS
 * NOT** — a CHORD, whose slur belongs to no single head, or a REST, which has no pitches
 * at all. ⚠️ And a `(` before a rest opens NOTHING: `(zC)` leaves the rest bare and the
 * `)` on C invents its own 101 out of `addEndSlur`'s last arm. Measured, both ways.
 *
 * The stacks are per VOICE and span the whole tune, which is why they are threaded in
 * rather than being local to a line: a slur may open on one system and close on the next.
 *
 * **A SLUR WRITTEN INSIDE A CHORD IS PER PITCH** — `Pitch.slurStarts`/`slurEnds` carry it
 * and the numbering below takes the chord position, which is the shape an earlier
 * `ponytail:` here asked for. `abcts-ledger-gaps-2` tune 7 (`[(CE)G]`, two halves that
 * cannot pair) and `-3` tune 2 (`(F [GB)d]`, a close that takes the open before it) are the
 * two fixtures.
 */
type SlurStacks = Record<number, number[]>;

/**
 * `addEndSlur` — pop the most recent open slur at this chord position, and if there is
 * none, **take any other position's** (`tune-builder.js:672-696`). With nothing open
 * anywhere it INVENTS `chordPos * 100 + 1`, stepped down past anything this element has
 * already closed.
 */
const addEndSlur = (
  open: SlurStacks,
  into: number[],
  num: number,
  chordPos: number,
): void => {
  let at = chordPos;
  if (open[at] === undefined) {
    // The scan is over an ARRAY indexed by chord position, so it runs 0 upward.
    const first = Object.keys(open)
      .map(Number)
      .sort((a, b) => a - b)
      .find((k) => open[k] !== undefined);
    if (first !== undefined) at = first;
    if (open[at] === undefined) {
      let offNum = at * 100 + 1;
      for (const x of into) if (offNum === x) offNum -= 1;
      open[at] = [offNum];
    }
  }
  const stack = open[at] as number[];
  for (let i = 0; i < num; i += 1) {
    const label = stack.pop();
    if (label !== undefined) into.push(label);
  }
  if (stack.length === 0) delete open[at];
};

/**
 * `addStartSlur` — the next free number at this chord position, walked past anything the
 * element's own closes used and anything already open (`tune-builder.js:697-721`).
 *
 * ⚠️ **THE WALK IS THREE PASSES AND TWO, NOT A LOOP UNTIL FREE.** abcjs writes the same
 * `forEach` out three times for `usedNums` and twice for the open stack, which is a crude
 * bound rather than a search — ported as written, because the number is visible.
 */
const addStartSlur = (
  open: SlurStacks,
  into: { label: number; style?: string }[],
  num: number,
  chordPos: number,
  dotted: boolean,
  usedNums: readonly number[] = [],
): void => {
  const stack = open[chordPos] ?? (open[chordPos] = []);
  let nextNum = chordPos * 100 + 1;
  for (let i = 0; i < num; i += 1) {
    for (let pass = 0; pass < 3; pass += 1)
      for (const x of usedNums) if (nextNum === x) nextNum += 1;
    for (let pass = 0; pass < 2; pass += 1)
      for (const x of stack) if (nextNum === x) nextNum += 1;
    stack.push(nextNum);
    // `.( ` — the dot rides the LAST start abcjs made, and is consumed.
    into.push(dotted ? { label: nextNum, style: "dotted" } : { label: nextNum });
    nextNum += 1;
  }
};

/** The chord position a grace note's slur is numbered at — abcjs's literal 20. */
const GRACE_CHORD_POS = 20;

function markSlurs(e: AbcElement, event: MusicEvent, open: SlurStacks): void {
  /**
   * **THE GRACE NOTES ARE NUMBERED FIRST**, each one's ends before its starts
   * (`tune-builder.js:730-742`). A `)` written after a grace group closes on the LAST
   * grace, and `addEndSlur`'s fallback is what lets it reach a slur opened on the note
   * before — `(f3 {a})y` gives that grace `endSlur: [101]`, not 2001.
   */
  const graces = e.gracenotes as
    | { endSlur?: number[]; startSlur?: { label: number; style?: string }[] }[]
    | undefined;
  if (graces !== undefined)
    (event.graceNotes as readonly { slurStarts?: number; slurEnds?: number }[]).forEach(
      (g, i) => {
        const target = graces[i];
        if (target === undefined) return;
        for (let n = 0; n < (g.slurEnds ?? 0); n += 1)
          addEndSlur(open, target.endSlur ?? (target.endSlur = []), 1, GRACE_CHORD_POS);
        if ((g.slurStarts ?? 0) > 0)
          addStartSlur(
            open,
            target.startSlur ?? (target.startSlur = []),
            g.slurStarts ?? 0,
            GRACE_CHORD_POS,
            false,
          );
      },
    );
  /**
   * **A `)` CLOSES ON A REST AND A `(` DOES NOT OPEN ON ONE** — see `Rest.slurEnds`. A rest
   * has no pitches, so the mark goes on the ELEMENT, at chord position 0.
   */
  if (event.type === "rest") {
    const ends = event.slurEnds ?? 0;
    if (ends > 0) {
      const into: number[] = [];
      addEndSlur(open, into, ends, 0);
      if (into.length > 0) e.endSlur = into;
    }
    return;
  }
  const head = e.pitches?.[0];
  /**
   * **A MARK WITH NO PITCH TO SIT ON GOES ON THE ELEMENT** — a CHORD, whose slur belongs to
   * no single head — and it is numbered at chord position 0, which is where the label 1
   * comes from. A rest is the other such element; see above.
   */
  const onElement = (e.pitches?.length ?? 0) > 1;
  /**
   * ⚠️ **AND A PLAIN NOTE'S MARKS GO THROUGH THE PITCH LOOP, WHICH IS THE ONE THAT CARRIES
   * `usedNums`.** abcjs has TWO numbering paths and only one of them avoids the labels this
   * element just freed: `addStartSlur(el, x, 0)` for `el.startSlur` takes three arguments,
   * where `addStartSlur(el.pitches[p], x, p + 1, usedNums)` takes four
   * (`tune-builder.js:755-772`). A single note's `(` and `)` live on `pitches[0]`, so it is
   * the four-argument one.
   *
   * `(D2)CB,)` on `S7-voices` V:3 is the case: the `D` closes 101 and opens on the SAME
   * head, and abcjs gives the new slur 102 because 101 is in `usedNums`. Ours reused 101,
   * and then its close 15 elements later carried the wrong label too — 6 rows, and
   * invisible to every other gate because BOTH ends agreed with each other.
   */
  const usedNums: number[] = [];
  if (event.slurEnds > 0) {
    const into: number[] = [];
    addEndSlur(open, into, event.slurEnds, onElement ? 0 : 1);
    // Only the PITCH path feeds `usedNums`; `usedNums` is declared inside abcjs's
    // `if (el.pitches)` block and the chord-position-0 ends never reach it.
    if (!onElement) usedNums.push(...into);
    if (into.length > 0) {
      if (onElement) e.endSlur = into;
      else if (head !== undefined) head.endSlur = into;
    }
  }
  if (event.slurStarts > 0) {
    const into: { label: number; style?: string }[] = [];
    addStartSlur(
      open,
      into,
      event.slurStarts,
      onElement ? 0 : 1,
      event.slurDotted === true,
      onElement ? [] : usedNums,
    );
    if (onElement) e.startSlur = into;
    else if (head !== undefined) head.startSlur = into;
  }
  /**
   * **THEN THE PITCHES, EVERY END BEFORE ANY START** — and the ends' labels are collected
   * into `usedNums`, which the starts then walk past (`tune-builder.js:751-770`). That
   * two-pass order is why `[(CE)G]` numbers its close 201 rather than 102: the close runs
   * first, at its OWN chord position.
   */
  const pitches =
    event.type === "chord"
      ? (event.pitches as readonly { slurStarts?: number; slurEnds?: number }[])
      : [];
  pitches.forEach((p, i) => {
    const target = e.pitches?.[i];
    if (target === undefined) return;
    for (let n = 0; n < (p.slurEnds ?? 0); n += 1) {
      const into = target.endSlur ?? (target.endSlur = []);
      const before = into.length;
      addEndSlur(open, into, 1, i + 1);
      for (let k = before; k < into.length; k += 1) usedNums.push(into[k] as number);
    }
  });
  pitches.forEach((p, i) => {
    const target = e.pitches?.[i];
    if (target === undefined || (p.slurStarts ?? 0) === 0) return;
    addStartSlur(
      open,
      target.startSlur ?? (target.startSlur = []),
      p.slurStarts ?? 0,
      i + 1,
      false,
      usedNums,
    );
  });
}

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
/**
 * ⚠️ **A CHORD DECIDES `end_beam` BY TWO RULES, AND ONE OF THEM READS THE WRONG DURATION.**
 *
 * The post-`]` loop has its own whitespace arm:
 *
 *     var postChordDone = false;
 *     while (i < line.length && !postChordDone) {
 *       switch (line[i]) {
 *         case ' ': case '\t': addEndBeam(el); break;
 *         case ')':  … case '-':  … case '>': case '<': …
 *         case '1'…'9': case '/':
 *           var fraction = tokenizer.getFraction(line, i);
 *           chordDuration = fraction.value; i = fraction.index;
 *           if (line[i] === ' ') rememberEndBeam = true;
 *           …
 *     }
 *     if (chordDuration !== null) {
 *       el.duration = el.duration * chordDuration;
 *       if (rememberEndBeam) addEndBeam(el);
 *     }
 *
 * (`abc_parse_music.js:416-478`.) So whitespace ANYWHERE in the run after `]` — past a
 * `-`, a `)`, a `<` — ends the beam, and `addEndBeam`'s `duration < 0.25` test is applied
 * to `el.duration` **BEFORE `* chordDuration`**: the duration of the chord's FIRST NOTE,
 * not the chord's own. `rememberEndBeam` is the second path and runs AFTER the multiply,
 * so it tests the real one, and it fires only when the space is immediately after the
 * duration.
 *
 * **THAT IS WHY THE SAME SOURCE ANSWERS DIFFERENTLY AT TWO `L:` VALUES.**
 * `[CE]/[DF]/- [CE]/[DF]/` is one beam at `L:1/4` and two at `L:1/8`, because the inner
 * note is 0.25 in the first and 0.125 in the second while the chord is 0.125 either way.
 * A LADDER caught the flip and an instrumented abcjs named the cause; two readings taken
 * off the corpus alone — "a tie suppresses the break", then "a chord needs an explicit
 * duration" — were both wrong, and the second one improved the corpus while being wrong.
 * **A ROW COUNT GOING DOWN IS NOT A RULE BEING RIGHT.**
 *
 * `null` means "not a chord, use the note rule".
 */
const chordEndBeam = (abc: string, e: AbcElement, final: number): boolean | null => {
  const from = e.startChar ?? 0;
  const close = abc.lastIndexOf("]", (e.endChar ?? 0) - 1);
  if (close <= from) return null;
  let k = close + 1;
  const durFrom = k;
  while (k < abc.length && /[0-9/]/.test(abc[k] as string)) k += 1;
  const written = abc.slice(durFrom, k);
  // `getFraction`: a bare `/` halves, `/n` divides, `n` multiplies, absent is 1.
  const m = /^(\d*)(\/*)(\d*)$/.exec(written);
  const chordDuration =
    written === ""
      ? null
      : (m?.[1] ? Number(m[1]) : 1) /
        (m?.[3] ? Number(m[3]) : m?.[2] ? 2 ** m[2].length : 1);
  // `el.duration` as `addEndBeam` sees it in the loop — before the multiply.
  const preMultiply = chordDuration === null || chordDuration === 0 ? final : final / chordDuration;
  const rememberEndBeam = chordDuration !== null && abc[k] === " ";
  let sawSpace = false;
  for (let j = k; j < abc.length; j += 1) {
    const c = abc[j] as string;
    if (c === " " || c === "\t") sawSpace = true;
    else if (c !== "-" && c !== ")" && c !== "<" && c !== ">") break;
  }
  return (sawSpace && preMultiply < 0.25) || (rememberEndBeam && final < 0.25);
};

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
    const dur = typeof e.duration === "number" ? e.duration : 0;
    const spaced = chordEndBeam(abc, e, dur) ?? (abc[at] === " " || abc[at] === "\t");
    if (dur >= 0.25) closeLast();
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
  /**
   * **WHETHER AN ENGRAVER RAN**, which changes the projection in one way beyond the fields
   * it stamps: **THE ENGRAVER RENAMES THE ELEMENT IT DRAWS.** `createKeySignature` opens
   * with `elem.el_type = "keySignature"` and `createTimeSignature` with `"timeSignature"`
   * (`write/creation/create-key-signature.js:8`, `create-time-signature.js:8`), writing on
   * the very object `tune.lines` holds — so a PARSE-ONLY tune says `key` and `meter` where
   * a rendered one says `keySignature` and `timeSignature`, and the STAFF's own furniture
   * carries no `el_type` at all until something draws it.
   *
   * `createClef` writes `"clef"`, which is what the parser already calls it, so only the
   * staff's copy changes there. See `tests/parse-only.test.ts`.
   */
  engraved = true,
): {
  lines: AbcLine[];
  byEvent: Map<MusicEvent, AbcElement>;
  byRange: Map<number, AbcElement>;
  blockOf: Map<AbcLine, FreeTextBlock>;
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
  /**
   * **WHICH `FreeTextBlock` EACH NONMUSIC LINE WAS WRITTEN AS.** The engraver hangs a
   * `{rows: […]}` on every one of these lines at draw time and the layout records those
   * rows against the same blocks (`Layout.nonMusicRows`), so this is the join — an
   * IDENTITY, like the overlay pads', rather than a position.
   */
  const blockOf = new Map<AbcLine, FreeTextBlock>();
  const lines: AbcLine[] = [];
  /**
   * One open-slur stack SET per voice, carried across every system — see `markSlurs`.
   * abcjs's `currSlur[staffNum][voiceNum]` is itself indexed by CHORD POSITION.
   */
  const openSlurs: SlurStacks[] = [];
  /** `multilineVars.inEnding`, per voice and carried across the tune's lines. */
  const endings: { open: boolean }[] = [];
  /** The meter in force where a line opens — every `[M:]` before it, in order. */
  /**
   * The clef IN FORCE at a measure — abcjs's `currStaff.workingClef`, which a `[K: clef=]`
   * replaces as the parser walks. `pushNote` reads its `verticalPos` for every pitch, so a
   * mid-tune clef change moves `verticalPos` on every note after it and moves NOTHING
   * else. Same shape as `meterAt` beside it, and for the same reason: `voiceElements` is
   * handed one LINE's measures and cannot see the change that happened before them.
   */
  const clefAt = (voice: (typeof score.voices)[number], upTo: number): Clef | null => {
    let clef = voice.clef ?? score.clef;
    for (let i = 0; i < upTo; i += 1) {
      const change = voice.measures[i]?.clefChange;
      if (change != null) clef = change;
    }
    return clef;
  };
  /** …and the key, for the naturals a change cancels with. See `impliedNaturals`. */
  const keyAt = (voice: (typeof score.voices)[number], upTo: number): KeySignature => {
    let key = score.key;
    for (let i = 0; i < upTo; i += 1) {
      const change = voice.measures[i]?.keyChange;
      if (change != null) key = change;
    }
    return key;
  };
  const meterAt = (voice: (typeof score.voices)[number], upTo: number): Meter | null => {
    let meter = score.meter;
    for (let i = 0; i < upTo; i += 1) {
      const change = voice.measures[i]?.meterChange;
      if (change != null) meter = change;
    }
    return meter;
  };
  /** …and the tie's open pitches, per voice, for the same reason. */
  const openTies: { pitches: number[] }[] = [];
  /**
   * **A NON-MUSIC LINE IS A LINE, AND ITS POSITION IN THE LIST IS LOAD-BEARING.** A `T:`
   * after the first, a `%%text`, a `%%center`, a `%%begintext` block and a `%%sep` are
   * each `pushLine`d where they were written (`tune-builder.js:296-320`) — and `deline`
   * reads exactly that: any line with no `staff` clears `inMusicLine`, so the music line
   * after one does NOT merge into the one before it (`deline-tune.js:84-87`).
   *
   * **AND THE ENGRAVER HANGS A `nonMusic` BLOCK ON EACH OF THEM** — a `Subtitle`, a
   * `FreeText` or a `Separator`, whose `{rows: […]}` is the shape `topText`/`bottomText`
   * carry (`engraver-controller.js:229-247`). The rows are the LAYOUT's own, recorded as
   * it spends them and joined back to these lines by BLOCK IDENTITY — see `blockOf`,
   * `Layout.nonMusicRows` and `attachNonMusic`. Only a tune that ENGRAVED has them, which
   * is abcjs's own split: a `parseOnly` line carries none.
   */
  const textLine = (b: FreeTextBlock): AbcLine => {
    const line = textLineOf(b);
    blockOf.set(line, b);
    return line;
  };
  const textLineOf = (b: FreeTextBlock): AbcLine => {
    const span =
      b.sourceRange === undefined
        ? {}
        : { startChar: b.sourceRange.start, endChar: b.sourceRange.end };
    // …**AND A BLOCK'S LINES EACH CARRY THEIR OWN NEWLINE** — see `freeTextOf`.
    const text = freeTextOf(b);
    if (b.role === "separator")
      return {
        separator: {
          spaceAbove: b.separator?.above ?? 14,
          spaceBelow: b.separator?.below ?? 14,
          lineLength: b.separator?.length ?? 85,
          ...span,
        },
      };
    // …and a subtitle publishes its PHRASES where it has them — see `FreeTextBlock.rich`.
    if (b.role === "subtitle")
      return { subtitle: { text: richOf(b.rich ?? text), ...span } };
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
            // **THE PHRASES, NOT THE FLATTENED STRING** — `setTitle` is handed
            // `parseFontChangeLine(...)` and only then decides whether the `T:` is the
            // title or a subtitle (`abc_parse_header.js:14-22`, `:543`), so a `$1bold$0`
            // in the second `T:` survives exactly as it does in the first. `titles`
            // already holds `RichText`; this flattened it on the way out.
            text: richOf(title),
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
    /**
     * **AND `%%newpage` IS A LINE OF ITS OWN** — `addNewPage` calls `pushLine(tune,
     * {newpage: num})` (`tune-builder.js:306-308`), which nothing in `write/` reads. It
     * still costs the `staffSeparation` any non-music line before the first staff costs,
     * and it still shifts every line index a host reads.
     */
    if (score.newPage !== null)
      before.push({
        at: score.newPageAt ?? 0,
        line: { newpage: score.newPage } as unknown as AbcLine,
      });
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
  if (first === undefined) return { lines, byEvent, byRange, blockOf };
  /**
   * **THE BREAKS ARE EVERY VOICE'S, NOT VOICE 0's.** A voice whose part ends mid-tune
   * stops contributing measures, and the lines after that are still lines — abcjs builds
   * them from the SOURCE, one entry per music line, whichever voices are on it. Reading
   * voice 0 alone lost every system after its last measure: `tune.lines` ended early, and
   * with it `getElementFromChar`, `deline`, the selectable array and the timing rows for
   * that music. Found by the `Editor` gate, whose edits routinely add a line past a
   * finished voice.
   */
  /** Where the previous projected line's last element closed — see `tile`'s `carried`. */
  let carriedTileEnd: number | undefined
  const lengths = score.voices.map((v) => v.measures.length);
  const totalMeasures = Math.max(...lengths, 0);
  const breaks = [
    ...new Set(score.voices.flatMap((v) => starts(v))),
  ].sort((a, b) => a - b);

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
/** What `createVoice` puts at the head of a voice, in its own order (`:971-998`). */
const VOICE_FURNITURE = new Set(["style", "stem", "color", "scale"]);

  const hoistLeadingStaffFields = (voiceLines: AbcElement[][]): void => {
    const STAFF_FIELD = new Set([
      "clef",
      "keySignature",
      "timeSignature",
      // …and the parser's own names for the same two — see `FIELD_ELEMENTS`.
      "key",
      "meter",
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
      else {
        /**
         * ⚠️ **AND IT GOES BEHIND `createVoice`'s FURNITURE, NOT IN FRONT OF IT.** The
         * `style`, `stem` and `color` elements are appended when the LINE IS CREATED
         * (`tune-builder.js:970-998`) and everything the source writes is appended after
         * them — including the `up` stem a second voice SPLICES onto voice 0 at index 0
         * (`:988`). This unshifted to 0 and put a `%%MIDI program` ahead of the stem;
         * abcjs's own answer for `S7-voices` is `stem` then `midi`. 8 rows.
         */
        const midi = moved.filter((e) => e.el_type === "midi");
        let at = 0;
        while (VOICE_FURNITURE.has(line[at]?.el_type ?? "")) at += 1;
        line.splice(at, 0, ...midi);
      }
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
    /**
     * Every voice on this staff — because a standalone body `K:` RESTAMPS THE STAFF, and
     * the parser was inside whichever voice happened to be current when it read it.
     * `visual-layout-07` writes its second `K:GMin` after four `V:` lines, so ours records
     * it on voice 4 while abcjs stamps it on the staff voice 4 sits on, where voice 3 reads
     * it too.
     */
    staffVoices: readonly (typeof score.voices)[number][] = [],
  ): { key: AbcElement; clef: AbcElement; meter?: AbcElement }[] => {
    const out: { key: AbcElement; clef: AbcElement; meter?: AbcElement }[] = [];
    let clefInForce: Clef = voice?.clef ?? score.clef ?? defaultClef;
    let keyInForce: KeySignature = score.key;
    /**
     * The key change whose naturals are still pending for the NEXT line's staff — see the
     * note below. **THE PAIR, NOT THE STAMPED LIST**: `addPosToKey(params.clef, …)` runs
     * in `startNewLine` for the LINE's own clef (`abc_parse_music.js:985`), so a natural
     * pending across a line break is pitched for the STAFF it lands on and not for the
     * clef in force where the `[K:]` was written. `ragtime-nightingale`'s `d` is 8 on the
     * treble staff and 6 on the bass one, from one change.
     */
    let pendingChange: {
      from: KeySignature;
      to: KeySignature;
      /** `%%keywarn` at that `K:` — see `Measure.keyChangeKeywarn`. */
      keywarn?: boolean;
    } | null = null;
    /**
     * ⚠️ **AND A VOICE SWITCH THROWS THE PENDING CANCELLATION AWAY.** `setCurrentVoice`
     * restores the key with `deepCopyKey`, which does not copy `impliedNaturals`
     * (`abc_parse_key_voice.js:535-537`), so a pending list survives only as far as the
     * next line of the SAME voice — any other voice's line in between silently drops it.
     *
     * That is the whole difference between `ragtime-nightingale`, written voice by voice
     * so its `[K:Eb]` reaches the next line, and `inline-key-per-voice`, which alternates
     * `V:1`/`V:2` every line so its `[K:F]` naturals die at the switch. **The renderer
     * already measured and ported this rule; the projection had no share of it.**
     */
    const otherVoiceOpensAt: number[] = score.voices
      .filter((other) => other !== voice)
      .flatMap((other) =>
        (other.measures ?? [])
          .filter((om) => om.startsSystem === true)
          .map((om) => musicStartsAt(om)),
      );
    let previousLineOpenedAt = -1;
    (voice?.measures ?? []).forEach((m, i) => {
      /**
       * A mid-tune clef governs from the START of its measure — the renderer reads it the
       * same way (`layout.ts`, `clefAtMeasure`) — **EXCEPT WHERE IT DOES NOT LEAD ITS
       * LINE**, in which case `startNewLine` has already copied the old one onto the staff
       * and only the NEXT line sees the change. See the renderer's `clefLeadsHere`.
       */
      const clefDeferred =
        m.clefChange != null &&
        (i === 0 || m.startsSystem === true) &&
        !leadsLine(m, m.clefChangeSourceRange?.start);
      if (m.clefChange != null && !clefDeferred) clefInForce = m.clefChange;
      let consumedHere = false;
      if (i === 0 || m.startsSystem) {
        const restamp = staffVoices
          .map((other) => other.measures[i])
          .filter(
            (om): om is Measure =>
              om !== undefined &&
              om.keyChange != null &&
              leadsLine(om, om.keyChangeSourceRange?.start),
          )
          .pop();
        const leadingKey = leadsLine(m, m.keyChangeSourceRange?.start)
          ? (m.keyChange ?? null)
          : (restamp?.keyChange ?? null);
        /**
         * ⚠️ **AND A LINE READ BEFORE THE `K:` IS IN THE KEY `none`.** abcjs's key is
         * PARSE-TIME state opened at `{root: 'none', …}` (`abc_parse.js:80`), so music the
         * scan reaches before the field has been read carries that and not the tune's own
         * key — `frere-jacques`, whose `S:`/`Z:` prose the music scan reads as notes eleven
         * lines above its `K:C`, is the corpus's one case and it costs two `deline` rows.
         * Ours held `score.key` for every line, which prints the same and IS a different key.
         */
        const beforeKey =
          score.keySourceRange != null &&
          musicStartsAt(m) < score.keySourceRange.start;
        const key = leadingKey ?? (beforeKey ? { ...keyInForce, none: true } : keyInForce);
        /**
         * ⚠️ **A KEY IS PITCHED WHERE IT IS PARSED, FOR WHATEVER CLEF THAT FIELD KNEW.**
         * `addPosToKey` runs in the `K:` handler, so a key declared with the voice — a
         * header `K:D` read after `V:T clef=bass,,` — takes the VOICE's clef, while a
         * standalone body `K:` restamps the staff against ITS OWN field's clef, which is
         * the default treble when the field names none.
         *
         * Measured both ways, because one fixture alone would have written the wrong rule:
         * `parse-tie-slur-04`'s `V:T clef=bass,,` reports the bass positions 8 and 5, and
         * `visual-layout-07` — whose second `K:GMin` stands AFTER its `V:3 bass,,` — reports
         * the treble 6 and 9 on the same kind of staff.
         *
         * The DRAWING still moves them; `keySignatureShift` is what the layout uses. This is
         * the element a host reads, not where the ink lands.
         */
        const keyClef =
          leadingKey === null
            ? clefInForce
            : ((leadsLine(m, m.keyChangeSourceRange?.start) ? m : restamp)?.keyChangeClef ??
              ((leadsLine(m, m.keyChangeSourceRange?.start) ? m : restamp)?.keyChangeInline ===
              true
                ? clefInForce
                : defaultClef));
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
          // …**AND A LINE `%%barsperstaff` CUT OUT KEEPS THE METER IT WAS COPIED WITH** —
          // see `Measure.wrappedLine`.
          i === 0 || m.wrappedLine === true
            ? /**
               * ⚠️ **AND A PENDING HEADER `M:` OVERWRITES WHAT A LEADING `[M:]` SET.**
               * abcjs 6.7.0's inline branch writes
               * `staves[currentVoice.staffNum].meter = meter` when the `[M:]` starts a
               * voice's line (`abc_parse_header.js:357-359`) — and then `startNewLine`
               * runs `if (multilineVars.meter !== null) { staves.forEach(st => st.meter =
               * multilineVars.meter); params.meter = staves[…].meter; }`
               * (`abc_parse_music.js:986-995`), which STAMPS THE HEADER'S OVER EVERY STAFF
               * and takes that. So `grandstaff-inline-meter`'s `[M:3/4]` leading V:1 is
               * destroyed on line 0 and the staff reads the header's 4/4.
               *
               * ⚠️ **AND A STANDALONE `M:` IS NOT AN INLINE ONE** — it writes the SAME
               * slot the header does (`multilineVars.meter`, `abc_parse_header.js:519-521`)
               * and therefore replaces it, where `[M:]` writes the staff's. So
               * `flattener-38`'s `M:2/4` on its own line after `K:C` beats the header's
               * 4/4 and `grandstaff-inline-meter`'s `[M:3/4]` does not. Preferring
               * `leading` outright got the first right and the second wrong; preferring
               * `score.meter` outright swapped them.
               */
              ((m.meterChangeStandalone === true &&
              leadsLine(m, m.meterChangeSourceRange?.start)
                ? m.meterChange
                : null) ??
              score.meter ??
              leading?.meter)
            : m.meterChange != null && m.meterChangeStandalone === true
              ? m.meterChange
              : null;
        /**
         * ⚠️ **AND THE STAFF'S KEY CARRIES THE CANCELLING NATURALS TOO — CONCATENATED THE
         * OTHER WAY ROUND.** `createStaff` writes
         * `params.key.accidentals = params.key.accidentals.concat(params.key.impliedNaturals)`
         * (`tune-builder.js:1002-1005`) where `appendStartingElement` writes
         * `impliedNaturals.concat(hashParams.accidentals)` (`:281-291`): naturals LAST on
         * the staff, FIRST in the stream. That asymmetry was already recorded here and
         * neither half was built until the walk started reading staff VALUES.
         *
         * Exactly ONE line cancels — `startNewLine` copies the list onto the line's key
         * and then deletes it (`abc_parse_music.js:964-965`, `:1041-1042`) — so this is
         * the line whose key differs from the one this VOICE opened its last line with.
         * Per voice, because `deepCopyKey` drops the pending naturals at a voice switch.
         */
        const built = keyElement(key, keyClef);
        /**
         * ⚠️ **AND THEY ARE EMITTED ONCE — WHICHEVER PATH REACHES THEM FIRST TAKES THEM.**
         * `appendStartingElement` reads `hashParams2.impliedNaturals` and DELETES it
         * (`tune-builder.js:241-247`); `startNewLine` copies the list onto the line's key
         * and deletes it too (`abc_parse_music.js:964-965`, `:1041-1042`). So a change
         * that LEADS its line hands them to the STAFF, and one written mid-line hands them
         * to the STREAM element and the next line's staff gets none.
         *
         * Instrumented on `S8-layout` X:812, whose `[K:Bb]` sits mid-line:
         * `CREATESTAFF line=0 nat=undefined`, `ASE-KEY took=[{natural f}] line=0`,
         * `ASE-KEY took=undefined` for the second key element on that line, then
         * `CREATESTAFF line=1 nat=undefined`. Computing them here unconditionally put a
         * natural on line 1's staff that abcjs does not have.
         */
        /**
         * ⚠️ **AND WHAT THEY CANCEL IS THE KEY IN FORCE AT THE CHANGE, NOT THE ONE THIS
         * LINE OPENED WITH.** `parseKey` computes them from `multilineVars.key` at the
         * MOMENT the new key is read (`abc_parse_key_voice.js:305-334`), which is what
         * `keyInForce` already tracks. `S8-layout` X:812 runs G → `[K:Bb]` mid-line →
         * `K: Gb` standalone: Bb's flats are a SUBSET of Gb's, so abcjs cancels nothing,
         * while the key line 1 opened with was still G and gave a spurious natural f.
         *
         * The renderer's prefix logic states this rule in as many words already
         * (`layout.ts`, `keyBeforeLine`) — it just had nothing to share it with.
         */
        /**
         * ⚠️ **A KEY CHANGE REPLACES THE PENDING NATURALS; THE NEXT LINE CONSUMES THEM.**
         * `parseKey` rebuilds `multilineVars.key` with `deepCopyKey`, which does NOT copy
         * `impliedNaturals` (`abc_parse_key_voice.js:305-334`, `:535-537`), so a second
         * change DROPS whatever the first left pending and computes its own. `startNewLine`
         * copies the survivor onto the line's key and deletes it
         * (`abc_parse_music.js:964-965`, `:1041-1042`) — so exactly ONE line cancels.
         *
         * ⚠️ **AND A STREAM ELEMENT TAKING THEM DOES NOT CONSUME THEM.**
         * `appendStartingElement` deletes the property on `fixKey`'s SHALLOW COPY, not on
         * `multilineVars.key` (`tune-builder.js:241-247`) — so `ragtime-nightingale`'s
         * `[K:Eb]` puts the `d` natural on FIVE stream elements on line 17 AND on line 18's
         * staff, while `S8-layout` X:812's `[K:Bb]` reaches no staff at all because the
         * `K: Gb` after it threw the pending list away.
         *
         * ⚠️ **BOTH READINGS BEFORE THIS ONE CAME FROM A PROBE PLACED AFTER THE
         * CONSUMPTION.** `createStaff` concatenates and deletes at `:1002-1005`, and the
         * instrument sat below it, so every line reported `nat=undefined` and "first taker
         * wins" looked measured. **PRINT THE VALUE THE CALLER PASSED, NOT THE ONE THE
         * CALLEE HAS LEFT.**
         */
        const switched =
          previousLineOpenedAt >= 0 &&
          otherVoiceOpensAt.some(
            (at) => at > previousLineOpenedAt && at < musicStartsAt(m),
          );
        // …**AND THE FLAG IS THE ONE AT THE `K:` THESE NATURALS CANCEL FOR** — the change
        // leading this line, or the pending one from the line above. See
        // `Measure.keyChangeKeywarn`; `score.keywarn` is only the fallback for a line whose
        // change carries none of its own.
        const naturalsOff =
          (leadingKey != null ? m.keyChangeKeywarn : pendingChange?.keywarn) ??
          score.keywarn;
        const naturals =
          naturalsOff === false
            ? []
            : leadingKey != null
              ? impliedNaturals(keyInForce, key, keyClef)
              : switched || pendingChange === null
                ? []
                : impliedNaturals(pendingChange.from, pendingChange.to, keyClef);
        // …and a change consumed by THIS push must not also be left pending below.
        consumedHere = leadingKey != null;
        pendingChange = null;
        previousLineOpenedAt = musicStartsAt(m);
        out.push({
          key:
            naturals.length === 0
              ? built
              : { ...built, accidentals: [...(built.accidentals ?? []), ...naturals] },
          clef: clefElement(clefInForce, voice?.transpose, voice?.staffLineOverride),
          ...(meter == null ? {} : { meter: meterElement(meter) }),
        });
      }
      // …and a DEFERRED clef change takes effect once the staff has been stamped, which is
      // what makes it the NEXT line's — see `clefDeferred`.
      if (clefDeferred && m.clefChange != null) clefInForce = m.clefChange
      if (m.keyChange !== null) {
        /**
         * A change consumed by THIS line's push is done; any other stays pending for the
         * NEXT line's staff, replacing whatever an earlier one left — see the note above.
         *
         * ⚠️ **`leadsLine` MEANS "LEADS ITS MEASURE", NOT "LEADS ITS SYSTEM".**
         * `ragtime-nightingale`'s `[K:Eb]` reports `leads=true startsSystem=false`, so
         * testing it directly skipped the very change this list exists for. The flag the
         * push sets is the only thing that knows.
         */
        if (!consumedHere)
          pendingChange = {
            from: keyInForce,
            to: m.keyChange,
            ...(m.keyChangeKeywarn === undefined ? {} : { keywarn: m.keyChangeKeywarn }),
          };
        keyInForce = m.keyChange;
      }
    });
    return out;
  };
  /** Per STAFF, off its first voice — abcjs's is `multilineVars.staves[staffNum]`. */
  const furniture = voicesOfStaff.map((members) =>
    furnitureOf(
      score.voices[members[0] ?? 0],
      members.map((k) => score.voices[k]).filter((v) => v !== undefined),
    ),
  );

  /**
   * **`addFormattingOptions` — THE FONTS IN FORCE, AGAINST THE TUNE'S DEFAULT.** abcjs
   * stamps `el.fonts` on every element it appends, carrying whichever of four fonts (for a
   * note) or two (for a bar) differ from `tune.formatting` — which for all six is their
   * value AT THE END OF THE HEADER (`abc_parse.js:120-138`, `abc_parse_directive.js:315`).
   *
   * So the DEFAULT is the header's and the IN-FORCE one is the header's with every line's
   * changes run forward on top: `Measure.lineFonts` is `setLineFont`'s "differs from the
   * line above", which is exactly a delta. `%%gchordfont Arial 10` in the header and
   * `Arial 20` in the body makes every note after it carry the 20.
   *
   * **AND THE GRANULARITY IS THE ELEMENT, NOT THE LINE.** This read "the granularity is
   * the LINE, because a `%%` directive occupies a line of its own", with a `ponytail:`
   * predicting that an inline `[I:…font]` mid-line "would need the running value per
   * EVENT; neither corpus writes one". `abcts-model-gaps` tune 5 writes one, and the
   * prediction was right: `MusicEvent.runningFonts` is that value, and it wins here.
   */
  const defaultFont = new Map<string, Record<string, unknown>>();
  const inForceFont = new Map<string, Record<string, unknown>>();
  for (const name of [...NOTE_FONTS, ...BAR_FONTS]) {
    const seed = abcjsFont(name, score.headerFonts?.[name]);
    defaultFont.set(name, seed);
    inForceFont.set(name, seed);
  }
  /**
   * The four, then the two, in `addFormattingOptions`'s own order — whichever of them
   * `inForce` says differs from the header's.
   */
  const stampedFrom = (
    inForce: (name: string) => Record<string, unknown> | undefined,
    names: readonly string[],
  ): Record<string, unknown> | undefined => {
    let out: Record<string, unknown> | undefined;
    for (const name of names) {
      const now = inForce(name);
      const base = defaultFont.get(name);
      if (now === undefined || base === undefined || !differentFont(now, base)) continue;
      out ??= {};
      out[name] = now;
    }
    return out;
  };
  const stampedFonts = (names: readonly string[]): Record<string, unknown> | undefined =>
    stampedFrom((name) => inForceFont.get(name), names);

  breaks.forEach((from, i) => {
    const to = breaks[i + 1] ?? totalMeasures;
    // The line's own `%%…font` changes, from whichever voice recorded them — abcjs's
    // `multilineVars` is tune-global where ours rides the measure that opens the system.
    for (const v of score.voices) {
      const changed = v.measures[from]?.lineFonts;
      if (changed === undefined) continue;
      for (const [name, font] of Object.entries(changed))
        inForceFont.set(name, abcjsFont(name, font as LyricFont));
    }
    // Captured now: `stampedFonts` reads the live `inForceFont` map, and the closure below
    // outlives this line's turn through it.
    const lineNoteFonts = stampedFonts(NOTE_FONTS);
    const elementFonts = {
      // **AND AN EVENT'S OWN RUNNING SET WINS WHERE IT HAS ONE.** Only a MID-LINE
      // directive writes it, so everything else takes the line's answer unchanged.
      note: (event: MusicEvent): Record<string, unknown> | undefined =>
        event.runningFonts === undefined
          ? lineNoteFonts
          : stampedFrom(
              (name) =>
                abcjsFont(
                  name,
                  (event.runningFonts as Partial<Record<string, LyricFont>> | undefined)?.[
                    name
                  ],
                ),
              NOTE_FONTS,
            ),
      ...(stampedFonts(BAR_FONTS) === undefined
        ? {}
        : { bar: stampedFonts(BAR_FONTS) as Record<string, unknown> }),
    };
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
      const slurs = openSlurs[k] ?? {};
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
        // The drum map reaches a voice only when ITS clef is percussion.
        score.drumMap,
        // …**AND IT IS THE CLEF IN FORCE, NOT THE VOICE'S OWN.** See `clefAt`.
        clefAt(v, from),
        openTies[k] ?? (openTies[k] = { pitches: [] }),
        // The meter this line OPENS in — every change inside it is walked from here.
        meterAt(v, from) ?? score.meter,
        // …and the key, for the same reason.
        keyAt(v, from),
        engraved,
        elementFonts,
      );
    });
    /**
     * **ONLY AN ELEMENT WITH A SPAN IS TILED.** A `%%MIDI` is `-1 … -1` and a `stem` has
     * no `startChar` KEY at all; letting either into the chain both destroyed its own
     * `-1` and handed the element after it the wrong opening.
     */
    const tiled = lineVoices
      .flat()
      .filter((e) => (e.startChar ?? -1) >= 0)
      .sort((a, b) => (a.startChar ?? 0) - (b.startChar ?? 0));
    /**
     * ⚠️ **AND ONLY A `%%barsperstaff` LINE CARRIES.** Every other projected line IS a
     * source line, where abcjs's own tokenizer position is the line's start — carrying
     * there took 30 notes of `parse-tie-slur-01-staffwidth-200` back a character, because a
     * NOTE closes over its trailing newline and the guard could not tell the two apart.
     */
    const wrapped = score.voices.some((v) => v.measures[from]?.wrappedLine === true);
    tile(abc, tiled, score.unreadable ?? [], wrapped ? carriedTileEnd : undefined);
    // …and what THIS line closed at, for a line the source did not break — see `tile`.
    carriedTileEnd = tiled[tiled.length - 1]?.endChar;
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
          /**
           * **THE `style` COMES FIRST**, and it is on EVERY line once a `style=` has been
           * seen at all — `if (params.style) appendElement('style', null, null, {head:
           * params.style})` (`tune-builder.js:971-972`), where `params.style` is
           * `multilineVars.style` as the line opened. See `Measure.lineStyle`.
           */
          const lineStyle = score.voices[k]?.measures[from]?.lineStyle;
          if (lineStyle !== undefined)
            head.push({ el_type: "style", head: lineStyle });
          const stem = score.voices[k]?.stemDirection;
          if (stem != null) head.push({ el_type: "stem", direction: stem });
          else if (j > 0) {
            if (created.has(0))
              firstOfStaff?.splice(0, 0, { el_type: "stem", direction: "up" });
            head.push({ el_type: "stem", direction: "down" });
          }
          /**
           * …**AND THE `scale` COMES BETWEEN THE STEM AND THE COLOUR** — `if (params.scale)
           * appendElement('scale', null, null, {size: params.scale})` immediately before
           * the `color` arm (`tune-builder.js:990-993`), and like the `style` it is on
           * EVERY line of the voice because `createVoice` runs per line.
           *
           * ⚠️ **AND THE GUARD IS TRUTHY, SO `cue=off` STILL EMITS ONE.** That arm sets
           * `scale = 1`, which is truthy — only an absent `scale=`/`cue=` and a literal
           * `scale=0` produce no element at all.
           */
          const voiceScale = score.voices[k]?.scale;
          if (voiceScale != null && voiceScale !== 0)
            head.push({ el_type: "scale", size: voiceScale });
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
    const firstMusicLine = !lines.some((l) => l.staff !== undefined);
    lines.push({
      ...(vskip === undefined ? {} : { vskip }),
      staff: voicesOfStaff
        .map((members, s) => ({ members, s }))
        .filter(({ members }) => members.some((k) => (lineVoices[k] ?? []).length > 0))
        .map(({ members, s }) => {
          const staff: AbcStaff = {
            voices: members.map((k) => lineVoices[k] ?? []),
          };
          /**
           * **THE VOICE NAMES, AND WHICH ONE DEPENDS ON THE LINE.** `createVoice` stamps
           * `{name, subname}` per voice and `cleanUp` resolves it once the lines are known:
           * the FIRST music line takes `name`, every later one `subname`, a voice with
           * neither takes `''`, and **a staff where none of them has a title loses the
           * array entirely** (`tune-builder.js:635-658`, `:969-971`).
           *
           * `synth.sequence` reads it as the track's name — `staff[voiceNumber].title`,
           * joined with a space, which is the abcjs quirk of indexing the STAFF array by a
           * VOICE number — and nothing else in this library did, which is why the surface
           * was missing until that gate opened.
           */
          /**
           * **THE GROUPING PUNCTUATION RIDES THE STAFF** — `startNewLine` copies `brace`,
           * `bracket` and `connectBarLines` off `multilineVars.staves[staffNum]` onto the
           * line's params (`abc_parse_music.js:1011-1014`), each `"start"`, `"continue"` or
           * `"end"`, and `createStaff` puts them on the staff object a host reads.
           *
           * All three were in the model — `%%score`/`%%staves` parse into `StaffGroup` and
           * the renderer draws from it — and none of them was projected. Fifty tunes across
           * the two corpora carry at least one, and no gate could see it: `deline` compares
           * the staff's fields only to OURS, through `objEqual`.
           */
          /**
           * **AND `%%barnumbers 0` HANGS ITS NUMBER ON THE STAFF** — `params.barNumber` at
           * `startNewLine`, guarded by the first voice and by not being bar 1
           * (`abc_parse_music.js:1035-1036`). The model has carried it since the layout
           * needed it (`Measure.systemBarNumber`); the projection never did.
           *
           * ⚠️ **AND IT IS WHICHEVER VOICE THE PARSER STAMPED IT ON, NOT THE STAFF'S OWN
           * FIRST.** The layout already reads it that way — `plans.map(…).find(n => n !==
           * undefined)` — because a voice suppressed on this line leaves a gap.
           */
          const numbered = score.voices.findIndex(
            (v) => v.measures[from]?.systemBarNumber !== undefined,
          );
          if (numbered >= 0 && members.includes(numbered))
            (staff as unknown as Record<string, unknown>)["barNumber"] =
              score.voices[numbered]?.measures[from]?.systemBarNumber;
          const group = score.staves[s];
          if (group?.brace != null) (staff as unknown as Record<string, unknown>)["brace"] = group.brace;
          if (group?.bracket != null)
            (staff as unknown as Record<string, unknown>)["bracket"] = group.bracket;
          if (group?.connectBarLines != null)
            (staff as unknown as Record<string, unknown>)["connectBarLines"] = group.connectBarLines;
          /**
           * ⚠️ **THE TITLES ARE IN DECLARATION ORDER WHERE THE VOICES ARE IN `%%score`
           * ORDER, AND abcjs PAIRS THEM BY INDEX.** `createVoice` writes
           * `thisStaff.title[tune.voiceNum] = {name: params.name}`
           * (`tune-builder.js:970-976`) as each voice's first line is READ, so a
           * `%%score (V2 V1)` fills slot 0 from the voice declared first and slot 0 of
           * `voices` from the one the score puts first — and draws each voice's music
           * under the other's name.
           *
           * That mismatch is already reproduced in the DRAWING; the projection published
           * the array in score order and so did not have it. `score-reorder-shared` is
           * abcjs's `["Melody","Harmony"]` against our `["Harmony","Melody"]`.
           */
          const titles = [...members]
            .sort(
              (a, b) =>
                (score.voices[a]?.declaredIndex ?? a) - (score.voices[b]?.declaredIndex ?? b),
            )
            .map((k) => {
              const voice = score.voices[k];
              return (firstMusicLine ? voice?.name : voice?.subname) ?? "";
            });
          if (titles.some((t) => t !== ""))
            (staff as unknown as Record<string, unknown>)["title"] = titles;
          /**
           * **A CHANGED FONT RIDES THE STAFF**, after the key and the clef — abcjs assigns
           * it in `setLineFont` once the staff object already exists, which is the order a
           * host comparing the objects sees. `deline` unshifts each one back into the
           * voices as a `font` element. See `Measure.lineFonts`.
           */
          const fonts = score.voices[members[0] ?? 0]?.measures[from]?.lineFonts;
          const own = furniture[s]?.[i];
          if (own !== undefined) {
            /**
             * …**AND THE STAFF'S OWN FURNITURE IS UNNAMED UNTIL SOMETHING DRAWS IT.**
             * `createStaff` assigns `{clef: params.clef, key: params.key}` straight off
             * `startNewLine`'s params (`tune-builder.js:1002`), and NOTHING has written an
             * `el_type` on those objects yet — the three `create*` functions in the
             * engraver are what do, each on its first line. So a `parseOnly` tune's staff
             * carries a clef with `type` and `clefPos` and no name at all.
             */
            const named = (field: AbcElement): AbcElement => {
              if (engraved) return field;
              const copy = { ...(field as unknown as Record<string, unknown>) };
              delete copy["el_type"];
              return copy as unknown as AbcElement;
            };
            // THE KEY ORDER IS abcjs's — `{voices, clef, key}` from `createStaff` with the
            // meter added after, which is what a host comparing the objects sees.
            if (own.meter !== undefined) staff.meter = named(own.meter);
            staff.key = named(own.key);
            staff.clef = named(own.clef);
          }
          if (fonts !== undefined)
            for (const [type, font] of Object.entries(fonts))
              /**
               * **AND IT IS abcjs's FONT OBJECT, NOT THE MODEL'S.** `{face, weight, style,
               * decoration, size, box?}` where `LyricFont` is `{face, size, bold, italic,
               * box?}` — the same font said two ways, and this side said ours. `deline`'s
               * gate compares a staff's fonts only to OURS through `objEqual`, so the shape
               * was never measured until the `parseOnly` gate listed the field names.
               *
               * A COPY, because `deline` writes `el_type` onto this very object the way
               * abcjs does (`deline-tune.js:153-155`) and the parse tree is frozen.
               */
              (staff as unknown as Record<string, unknown>)[type] = abcjsFont(
                type,
                font as LyricFont,
              );
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
  /**
   * **AN OVERLAY PAD HAS TWO CREATORS AND THIS IS WHERE THEY ARE JOINED.** `resolveOverlays`
   * runs on BOTH sides — the parser back-fills the MODEL with pad events (`padOverlays`),
   * this walk back-fills the PROJECTION with pad elements — and until now nothing said the
   * two were the same element, so `abcelemOf` synthesized a third object for the drawing
   * and `stampEngraved` stamped a throwaway while the published pad carried no
   * `averagepitch` at all.
   *
   * `ref` is the hook `core/overlays.ts` already carries for the model side: the back-fill
   * copies it onto the pad as `pad`, so tagging each projected element with its own event
   * before the pass makes every pad name the event it MIRRORS when the pass is over. The
   * model's pad names the same one (`overlayMirrors`), which is the join.
   *
   * ⚠️ **THE TAGS COME OFF BY WALKING THE LINES, NOT `byEvent`** — the ending-mark sweep
   * shallow-COPIES the last voice's elements, so the published object is not always the one
   * `byEvent` holds and a `ref` left on a copy would be published.
   *
   * ponytail: a mirror with several pads is matched IN ORDER, on the two walks agreeing;
   * a whole-measure pad has no mirror and is still synthesized. Both are what the corpus
   * has — the ranked table in `scripts/zzrv.ts` says so if that changes.
   */
  type Tagged = Record<string, unknown> & { ref?: MusicEvent; pad?: MusicEvent };
  const padsByMirror = new Map<MusicEvent, MusicEvent[]>();
  /**
   * **AND A WHOLE-MEASURE PAD HAS NO MIRROR TO NAME IT**, so it joins by the only thing it
   * has: the BARLINE's span, which both sides give it (`tune-builder.js:572-575`). A layer
   * voice's untagged invisible rest is one by construction — a rest the SOURCE wrote is a
   * model event and carries a tag.
   */
  const padsByStart = new Map<number, MusicEvent[]>();
  for (const v of score.voices)
    for (const m of v.measures)
      for (const layer of m.overlays)
        for (const e of layer) {
          if (e.type !== "rest" || e.overlayPad !== true) continue;
          const mirror = e.overlayMirrors;
          if (mirror === undefined) {
            const at = e.sourceRange?.start;
            if (at === undefined) continue;
            const byStart = padsByStart.get(at);
            if (byStart === undefined) padsByStart.set(at, [e]);
            else byStart.push(e);
            continue;
          }
          const list = padsByMirror.get(mirror);
          if (list === undefined) padsByMirror.set(mirror, [e]);
          else list.push(e);
        }
  for (const [event, e] of byEvent) (e as unknown as Tagged).ref = event;
  resolveOverlays(lines as unknown as OverlayLine[]);
  const taken = new Map<MusicEvent | number, number>();
  const next = (key: MusicEvent | number): number => {
    const at = taken.get(key) ?? 0;
    taken.set(key, at + 1);
    return at;
  };
  for (const line of lines)
    for (const staff of line.staff ?? [])
      for (const voice of staff.voices)
        for (const element of voice) {
          const e = element as unknown as Tagged;
          const mirror = e.pad;
          const tagged = e.ref !== undefined;
          // …and the SAME copy costs the layer's own notes their identity, which is why a
          // note of an `&` layer went unstamped too. The tag survives onto the copy, so
          // re-pointing the index at whatever was PUBLISHED closes both.
          if (e.ref !== undefined) byEvent.set(e.ref, element);
          delete e.ref;
          delete e.pad;
          if (mirror !== undefined) {
            const pad = padsByMirror.get(mirror)?.[next(mirror)];
            if (pad !== undefined) byEvent.set(pad, element);
            continue;
          }
          const start = element.startChar;
          if (tagged || element.rest?.type !== "invisible" || start === undefined) continue;
          const pad = padsByStart.get(start)?.[next(start)];
          if (pad !== undefined) byEvent.set(pad, element);
        }
  for (const [, e] of byEvent) delete (e as unknown as Tagged).ref;
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
        if (last?.el_type !== "keySignature" && last?.el_type !== "key") continue;
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
  return { lines, byEvent, byRange, blockOf };
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
