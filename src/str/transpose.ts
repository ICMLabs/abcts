import type { Measure, Score, SourceRange } from "../core/model.js";

import {
  isLegalMode,
  keyAccidentals,
  type KeyAccidental,
  relativeMajor,
  relativeMode,
  transposeChordName,
  transposeKey,
} from "./keys.js";

/**
 * abcjs's `strTranspose(abc, tunes, steps)` — **ABC TEXT IN, ABC TEXT OUT**
 * (`src/str/output.js`).
 *
 * It does not re-print the tune. It collects a list of `{start, end, note}` REPLACEMENTS
 * into the original string, sorts them **backwards** so earlier indexes stay valid, and
 * splices. Everything it does not understand — spacing, comments, decorations, lyrics — is
 * therefore preserved by construction, which is the whole point of the function and the
 * reason it is worth porting rule for rule rather than reimplementing.
 *
 * The tune is needed only for POSITIONS and the key in force; every character written back
 * is computed from the source text. That is what lets our own IR drive it: the ruling says
 * the internals are ours and the API is abcjs's, and here the API is a string.
 */
export function strTranspose(
  abc: string,
  scores: readonly Score[],
  steps: number,
): string {
  const n = Number.parseInt(String(steps), 10);
  let changes: Change[] = [];
  for (const score of scores)
    changes = changes.concat(transposeOneTune(abc, score, n));

  // **REVERSE SORT, AND THAT IS LOAD-BEARING.** Voices can be written in any order, so the
  // notes are not encountered in the order they appear in the string; splicing from the
  // end is what keeps every index valid (`output.js:18-27`).
  changes.sort((a, b) => b.start - a.start);
  const out = abc.split("");
  for (const ch of changes) out.splice(ch.start, ch.end - ch.start, ch.note);
  return out.join("");
}

interface Change {
  readonly start: number;
  readonly end: number;
  readonly note: string;
}

interface Key {
  readonly root: string;
  readonly acc: string;
  readonly mode: string;
  readonly accidentals: readonly KeyAccidental[];
}

const LETTERS = "CDEFGAB";
const OCTAVES = [",,,,", ",,,", ",,", ",", "", "'", "''", "'''", "''''"];

/** The `K:` field text as WRITTEN, which is what every spelling decision is made from. */
function readKeyField(text: string): Key | null {
  // Our source ranges cover the whole field, `[K:` and `]` included; abcjs's key object
  // arrives already split. Strip the wrapper and the rest is the same string.
  const body = text.replace(/^\[?\s*K:/, "").replace(/]\s*$/, "");
  const match = /^( *)([A-G])([#b]?)( ?)(\w*)/.exec(body);
  if (!match) return null;
  const mode = isLegalMode(match[5] ?? "") ? (match[5] ?? "") : "";
  const root = match[2] ?? "C";
  const acc = match[3] ?? "";
  return {
    root,
    acc,
    mode,
    accidentals: keyAccidentals(root + acc + mode) ?? [],
  };
}

function transposeOneTune(abc: string, score: Score, steps: number): Change[] {
  // **BAGPIPE MUSIC IS NEVER TRANSPOSED** — `Hp`/`HP` is a particular key and a special
  // case (`output.js:33-36`).
  const headKeyText = fieldText(abc, score.keySourceRange)
    .replace(/^\[?\s*K:/, "")
    .replace(/]\s*$/, "");
  if (/^\s*(Hp|HP)/.test(headKeyText)) return [];

  let changes = changeAllKeySigs(abc, steps);
  const headKey = readKeyField(headKeyText) ?? {
    root: "none",
    acc: "",
    mode: "",
    accidentals: [],
  };

  for (const voice of score.voices) {
    // A PERCUSSION STAFF IS SKIPPED — `staff.clef.type !== "perc"` (`output.js:45`) — and
    // the clef may be the TUNE's rather than the voice's, as `K:clef=perc` writes it.
    if ((voice.clef ?? score.clef)?.shape === "percussion") continue;
    changes = changes.concat(
      transposeVoice(abc, voice.measures, headKey, steps),
    );
  }
  return changes;
}

const fieldText = (
  abc: string,
  range: SourceRange | null | undefined,
): string =>
  range === null || range === undefined
    ? ""
    : abc.slice(range.start, range.end);

/**
 * **EVERY `K:` IN THE STRING IS REWRITTEN, BY SPLITTING ON `"K:"`** — not by walking the
 * parse tree (`output.js:53-71`). So an inline `[K:…]`, a voice's own `K:` and one inside
 * a comment are all treated alike, and the character count is kept by hand across the
 * split. Reproduced exactly: the offsets have to agree to the character.
 */
function changeAllKeySigs(abc: string, steps: number): Change[] {
  const changes: Change[] = [];
  const arr = abc.split("K:");
  let count = (arr[0] ?? "").length;
  for (let i = 1; i < arr.length; i += 1) {
    const segment = arr[i] ?? "";
    const match = /^( *)([A-G])([#b]?)( ?)(\w*)/.exec(segment);
    if (match) {
      const start = count + 2 + (match[1] ?? "").length; // past the `K:` and any space
      const mode = isLegalMode(match[5] ?? "") ? (match[5] ?? "") : "";
      const key = `${match[2] ?? ""}${match[3] ?? ""}${match[4] ?? ""}${mode}`;
      const dest = newKey(
        { root: match[2] ?? "", acc: match[3] ?? "", mode, accidentals: [] },
        steps,
      );
      changes.push({
        start,
        end: start + key.length,
        note: `${dest.root}${dest.acc}${match[4] ?? ""}${dest.mode}`,
      });
    }
    count += segment.length + 2;
  }
  return changes;
}

/** `newKey` — via the relative MAJOR, so a mode transposes as its major does. */
function newKey(key: Key, steps: number): Key {
  if (key.root === "none") {
    return {
      root: transposeKey("C", steps),
      mode: "",
      acc: "",
      accidentals: [],
    };
  }
  const major = relativeMajor(key.root + key.acc + key.mode);
  const newMajor = transposeKey(major, steps);
  const mode = relativeMode(newMajor, key.mode);
  return {
    root: mode[0] ?? "",
    mode: key.mode,
    acc: mode.length > 1 ? (mode[1] ?? "") : "",
    accidentals: keyAccidentals(newMajor) ?? [],
  };
}

/** The key's accidentals as a letter → `_`/`^` map, upper-cased. */
function createKeyAccidentals(key: Key): Record<string, string> {
  const ret: Record<string, string> = {};
  for (const acc of key.accidentals) {
    if (acc.acc === "flat") ret[acc.note.toUpperCase()] = "_";
    else ret[acc.note.toUpperCase()] = "^";
  }
  return ret;
}

/**
 * How many LETTERS the transposition moves, which is what decides the octave marks.
 *
 * The zero case is abcjs's own: `Eb => E` is a half step and `E => Eb` is almost an
 * octave, and it tells them apart by the size of `steps` (`output.js:93-113`).
 */
function setLetterDistance(
  destination: Key,
  keyRoot: string,
  steps: number,
): number {
  let d = LETTERS.indexOf(destination.root) - LETTERS.indexOf(keyRoot);
  if (keyRoot === "none") d = LETTERS.indexOf(destination.root);
  if (d === 0) {
    if (steps > 2) d += 7;
    else if (steps === -12) d -= 7;
  } else if (steps > 0 && d < 0) d += 7;
  else if (steps < 0 && d > 0) d -= 7;

  if (steps > 12) d += 7;
  else if (steps < -12) d -= 7;
  return d;
}

interface ParsedNote {
  readonly acc: string;
  readonly name: string;
  readonly pitch: number;
  readonly oct: number;
  readonly adj: number;
  readonly courtesy: boolean;
}

const REG_PITCH = /([_^=]*)([A-Ga-g])([,']*)/;

/**
 * A note's position relative to the TONIC plus its deviation from the key signature —
 * "in the key of D an F# is two steps from the tonic and no adjustment"
 * (`output.js:281-303`).
 */
function parseNote(
  note: string,
  keyRoot: string,
  keyAcc: Record<string, string>,
  measureAcc: Record<string, string>,
): ParsedNote {
  const root = keyRoot === "none" ? 0 : LETTERS.indexOf(keyRoot);
  const reg = REG_PITCH.exec(note);
  const written = reg?.[2] ?? "C";
  const name = written.toUpperCase();
  let pos = LETTERS.indexOf(name) - root;
  if (pos < 0) pos += 7;
  let oct = OCTAVES.indexOf(reg?.[3] ?? "");
  // A CAPITAL LETTER IS AN OCTAVE LOWER than the lower-case one it shares a slot with.
  if (name === written) oct -= 1;
  const acc = reg?.[1] ?? "";
  const current = measureAcc[name] ?? keyAcc[name] ?? "=";
  return {
    acc,
    name,
    pitch: pos,
    oct,
    adj: calcAdjustment(acc, keyAcc[name], measureAcc[name]),
    courtesy: acc === current,
  };
}

function calcAdjustment(
  thisAcc: string,
  keyAcc: string | undefined,
  measureAcc: string | undefined,
): number {
  let acc = thisAcc;
  // No accidental here but one earlier in the measure — that one still applies.
  if (!acc && measureAcc !== undefined) acc = measureAcc;
  if (!acc) return 0;
  const table: Record<string, Record<string, number>> = {
    "": { __: -2, _: -1, "=": 0, "^": 1, "^^": 2 },
    _: { __: -1, _: 0, "=": 1, "^": 2, "^^": 3 },
    "^": { __: -3, _: -2, "=": -1, "^": 0, "^^": 1 },
  };
  return table[keyAcc ?? ""]?.[acc] ?? 0;
}

interface NewPitch {
  readonly acc: string;
  readonly name: string;
  readonly upper: string;
}

/**
 * The note itself. **THE OCTAVE CHANGES WHEN THE LETTER CROSSES C**, and a triple sharp or
 * flat is resolved by moving to the neighbouring letter and RECURSING with one more letter
 * of distance (`output.js:187-273`).
 */
function transposePitch(
  note: {
    pitch: number;
    oct: number;
    name: string;
    adj: number;
    courtesy?: boolean;
  },
  key: Key,
  letterDistance: number,
  measureAcc: Record<string, string>,
): NewPitch {
  const origDistFromC = LETTERS.indexOf(note.name);
  const root = LETTERS.indexOf(key.root);
  const index = (root + note.pitch) % 7;
  let newDistFromC = origDistFromC + letterDistance;
  let oct = note.oct;
  while (newDistFromC > 6) {
    oct += 1;
    newDistFromC -= 7;
  }
  while (newDistFromC < 0) {
    oct -= 1;
    newDistFromC += 7;
  }

  let name = LETTERS[index] ?? "C";
  let acc = "";
  let adj = note.adj;
  // The size of the adjustment depends on the key: with a sharp in the signature, -1 is a
  // NATURAL; without one it is a flat.
  let keyAcc = "=";
  for (const a of key.accidentals) {
    if (a.note.toLowerCase() === name.toLowerCase()) {
      adj += a.acc === "flat" ? -1 : 1;
      keyAcc = a.acc === "flat" ? "_" : "^";
      break;
    }
  }

  if (adj === -2) acc = "__";
  else if (adj === -1) acc = "_";
  else if (adj === 0) acc = "=";
  else if (adj === 1) acc = "^";
  else if (adj === 2) acc = "^^";
  else if (adj === -3 || adj === 3) {
    const up = adj === 3;
    const at = LETTERS.indexOf(note.name) + (up ? 1 : -1);
    let nextName = LETTERS[at];
    let nextOct = note.oct;
    if (nextName === undefined) {
      nextName = up ? "C" : "B";
      nextOct += up ? 1 : -1;
    }
    const whole = up
      ? nextName === "C" || nextName === "F"
      : nextName === "B" || nextName === "E";
    return transposePitch(
      {
        pitch: note.pitch + (up ? 1 : -1),
        oct: nextOct,
        name: nextName,
        adj: note.adj + (up ? (whole ? -1 : -2) : whole ? 1 : 2),
      },
      key,
      letterDistance + 1,
      measureAcc,
    );
  }

  // **AN ACCIDENTAL THE KEY OR THE MEASURE ALREADY IMPLIES IS DROPPED**, unless the source
  // wrote one as a courtesy — in which case it is kept.
  if (
    (measureAcc[name] === acc || (!measureAcc[name] && acc === keyAcc)) &&
    !note.courtesy
  ) {
    acc = "";
  }

  if (oct === 0) name += ",,,";
  else if (oct === 1) name += ",,";
  else if (oct === 2) name += ",";
  else if (oct === 4) name = name.toLowerCase();
  else if (oct === 5) name = `${name.toLowerCase()}'`;
  else if (oct === 6) name = `${name.toLowerCase()}''`;
  else if (oct === 7) name = `${name.toLowerCase()}'''`;
  else if (oct === 8) name = `${name.toLowerCase()}''''`;
  if (oct > 4) name = name.toLowerCase();

  return { acc, name, upper: name.toUpperCase() };
}

/**
 * Every note letter inside an element's source span, with the CHORD SYMBOLS and
 * DECORATIONS masked out — "since the regex will also find `c`, `d` and `a` in `!coda!`"
 * (`output.js:305-334`).
 */
function findNotes(
  abc: string,
  start: number,
  end: number,
): { note: string; index: number }[] {
  const note = abc.substring(start, end);
  const ignore: { start: number; end: number }[] = [];
  for (const m of note.matchAll(/("[^"]+")+/g)) {
    ignore.push({ start: m.index, end: m.index + m[0].length });
  }
  for (const m of note.matchAll(/(![^!]+!)+/g)) {
    ignore.push({ start: m.index, end: m.index + m[0].length });
  }
  const ret: { note: string; index: number }[] = [];
  for (const m of note.matchAll(/([_^=]*)([A-Ga-g])([,']*)/g)) {
    // abcjs tests the regex's `lastIndex`, which is the END of the match — reproduced,
    // because a note ending exactly on a block's edge is treated as inside it.
    const lastIndex = m.index + m[0].length;
    const found = ignore.some(
      (b) => lastIndex >= b.start && lastIndex <= b.end,
    );
    if (!found) ret.push({ note: m[0], index: start + m.index });
  }
  return ret;
}

/** `replaceChord` — the quoted run inside an element's span, quotes excluded. */
function replaceChord(
  abc: string,
  start: number,
  end: number,
  newChord: string,
): Change | null {
  const match = /([^"]+)?(".+")+/.exec(abc.substring(start, end));
  if (!match) return null;
  let s = start + (match[1] ?? "").length;
  const e = s + (match[2] ?? "").length;
  return { start: s + 1, end: e - 1, note: newChord };
}

interface VoiceElement {
  readonly kind: "note" | "bar" | "key";
  readonly range: SourceRange | null;
  /** The chord symbol as WRITTEN, without its quotes. A BAR can carry one. */
  readonly chord?: string | null;
  readonly keyText?: string;
}

/**
 * **abcjs'S ELEMENT SPAN OPENS AT THE FIRST THING WRITTEN FOR THE NOTE**, not at the note
 * letter: a chord symbol, a `!…!` decoration and a grace group all fall inside
 * `startChar…endChar`. That is why `findNotes` has to MASK the quoted and banged runs out
 * — and why it does NOT mask the braces, so a grace note is transposed as an ordinary note
 * of its element. Measured on Cooley's through abcjs: `{c}B` is one element, 39…43.
 *
 * Our ranges cover the event alone, so the span is recovered by walking back over any
 * immediately preceding `{…}`, `"…"` or `!…!`. Projection, not model — the ruling puts
 * exactly this on our side of the boundary.
 */
function elementSpan(
  abc: string,
  range: SourceRange | null,
): SourceRange | null {
  if (range === null) return null;
  let start = range.start;
  for (;;) {
    // …and the SPACE between a chord symbol and its note is inside the span too, which is
    // why `"Ebdim7" C` is one element and not two.
    let at = start;
    while (at > 0 && (abc[at - 1] === " " || abc[at - 1] === "\t")) at -= 1;
    const before = abc[at - 1];
    const open =
      before === "}"
        ? "{"
        : before === '"'
          ? '"'
          : before === "!"
            ? "!"
            : // `+…+` is the LEGACY decoration delimiter, the same element part as `!…!`.
              before === "+"
              ? "+"
              : null;
    if (open === null) break;
    const opened = abc.lastIndexOf(open, at - 2);
    if (opened < 0) break;
    start = opened;
  }
  return start === range.start ? range : { start, end: range.end };
}

/** Our measures, flattened into abcjs's element order: bar, notes…, bar. */
function elementsOf(abc: string, measures: readonly Measure[]): VoiceElement[] {
  const out: VoiceElement[] = [];
  for (const measure of measures) {
    if (measure.openingBarline !== null) {
      /**
       * **A BARLINE THAT OPENS A MEASURE TAKES THE PENDING CHORD**, and `transposeVoice`
       * handles `el.chord` before it looks at `el_type` — so a `"D"` written just before a
       * `|` is transposed as the BAR's chord, not the next note's (`output.js:127-138`).
       * The chord-grid port found the same rule from the other side.
       */
      out.push({
        kind: "bar",
        range: elementSpan(abc, measure.openingBarlineSourceRange),
        chord: measure.openingBarlineChord ?? null,
      });
    }
    if (measure.keyChange !== null) {
      out.push({
        kind: "key",
        range: measure.keyChangeSourceRange,
        keyText: fieldText(abc, measure.keyChangeSourceRange)
          .replace(/^\[?K:/, "")
          .replace(/]$/, ""),
      });
    }
    for (const event of measure.events) {
      out.push({
        kind: "note",
        range: elementSpan(abc, event.sourceRange),
        // **A REST CARRIES A CHORD SYMBOL TOO** — abcjs attaches `elem.chord` to whatever
        // event follows the `"…"`, rest included, so `"Ab7b5"z` is a transposable chord.
        chord: (event as { chordSymbol?: string | null }).chordSymbol ?? null,
      });
    }
    if (measure.closingBarline !== null) out.push({ kind: "bar", range: null });
  }
  return out;
}

function transposeVoice(
  abc: string,
  measures: readonly Measure[],
  key: Key,
  steps: number,
): Change[] {
  const changes: Change[] = [];
  let keyRoot = key.root;
  let keyAcc = createKeyAccidentals(key);
  let destination = newKey(key, steps);
  let letterDistance = setLetterDistance(destination, keyRoot, steps);

  let measureAcc: Record<string, string> = {};
  let transposedMeasureAcc: Record<string, string> = {};

  for (const el of elementsOf(abc, measures)) {
    // **THE CHORD COMES FIRST AND IS NOT GATED ON THE ELEMENT TYPE** — `output.js:127-138`
    // tests `el.chord` before anything else, so a bar's chord is transposed too.
    if (el.chord != null && el.chord !== "" && el.range !== null) {
      const prefersFlats =
        destination.accidentals.length > 0 &&
        destination.accidentals[0]?.acc === "flat";
      let next = transposeChordName(el.chord, steps, prefersFlats, true);
      next = next.replace(/♭/g, "b").replace(/♯/g, "#");
      // If the chord was not recognised the input comes back unchanged and there is
      // nothing to replace.
      if (next !== el.chord) {
        const change = replaceChord(abc, el.range.start, el.range.end, next);
        if (change !== null) changes.push(change);
      }
    }
    if (el.kind === "bar") {
      measureAcc = {};
      transposedMeasureAcc = {};
      continue;
    }
    if (el.kind === "key") {
      const next = readKeyField(el.keyText ?? "");
      if (next !== null) {
        keyRoot = next.root;
        keyAcc = createKeyAccidentals(next);
        destination = newKey(next, steps);
        letterDistance = setLetterDistance(destination, keyRoot, steps);
      }
      continue;
    }
    if (el.range === null) continue;

    for (const found of findNotes(abc, el.range.start, el.range.end)) {
      const note = parseNote(found.note, keyRoot, keyAcc, measureAcc);
      if (note.acc) measureAcc[note.name.toUpperCase()] = note.acc;
      const next = transposePitch(
        note,
        destination,
        letterDistance,
        transposedMeasureAcc,
      );
      if (next.acc) transposedMeasureAcc[next.upper] = next.acc;
      changes.push({
        note: next.acc + next.name,
        start: found.index,
        end: found.index + found.note.length,
      });
    }
  }
  return changes;
}
