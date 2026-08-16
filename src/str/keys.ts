/**
 * abcjs's key tables — `const/relative-major.js` and `const/key-accidentals.js`, ported
 * verbatim because they are DATA rather than an algorithm and a host transposing a string
 * must land on the same spelling we do.
 *
 * The enharmonic rows are abcjs's, quirks included: its own comment on `A#`, `B#`, `D#`,
 * `E#` and `G#` says "these SOUND the same as what's written, but they aren't right", and
 * `A#` really is given TWO FLATS. Reproduced — the target is what abcjs writes.
 */

/** Keys with the same accidental count, and how far each is from C in semitones. */
const KEYS: Readonly<
  Record<string, { modes: readonly string[]; stepsFromC: number }>
> = {
  C: {
    modes: [
      "CMaj",
      "CIon",
      "Amin",
      "AAeo",
      "Am",
      "GMix",
      "DDor",
      "EPhr",
      "FLyd",
      "BLoc",
    ],
    stepsFromC: 0,
  },
  Db: {
    modes: [
      "DbMaj",
      "DbIon",
      "Bbmin",
      "BbAeo",
      "Bbm",
      "AbMix",
      "EbDor",
      "FPhr",
      "GbLyd",
      "CLoc",
    ],
    stepsFromC: 1,
  },
  D: {
    modes: [
      "DMaj",
      "DIon",
      "Bmin",
      "BAeo",
      "Bm",
      "AMix",
      "EDor",
      "F#Phr",
      "GLyd",
      "C#Loc",
    ],
    stepsFromC: 2,
  },
  Eb: {
    modes: [
      "EbMaj",
      "EbIon",
      "Cmin",
      "CAeo",
      "Cm",
      "BbMix",
      "FDor",
      "GPhr",
      "AbLyd",
      "DLoc",
    ],
    stepsFromC: 3,
  },
  E: {
    modes: [
      "EMaj",
      "EIon",
      "C#min",
      "C#Aeo",
      "C#m",
      "BMix",
      "F#Dor",
      "G#Phr",
      "ALyd",
      "D#Loc",
    ],
    stepsFromC: 4,
  },
  F: {
    modes: [
      "FMaj",
      "FIon",
      "Dmin",
      "DAeo",
      "Dm",
      "CMix",
      "GDor",
      "APhr",
      "BbLyd",
      "ELoc",
    ],
    stepsFromC: 5,
  },
  Gb: {
    modes: [
      "GbMaj",
      "GbIon",
      "Ebmin",
      "EbAeo",
      "Ebm",
      "DbMix",
      "AbDor",
      "BbPhr",
      "CbLyd",
      "FLoc",
    ],
    stepsFromC: 6,
  },
  G: {
    modes: [
      "GMaj",
      "GIon",
      "Emin",
      "EAeo",
      "Em",
      "DMix",
      "ADor",
      "BPhr",
      "CLyd",
      "F#Loc",
    ],
    stepsFromC: 7,
  },
  Ab: {
    modes: [
      "AbMaj",
      "AbIon",
      "Fmin",
      "FAeo",
      "Fm",
      "EbMix",
      "BbDor",
      "CPhr",
      "DbLyd",
      "GLoc",
    ],
    stepsFromC: 8,
  },
  A: {
    modes: [
      "AMaj",
      "AIon",
      "F#min",
      "F#Aeo",
      "F#m",
      "EMix",
      "BDor",
      "C#Phr",
      "DLyd",
      "G#Loc",
    ],
    stepsFromC: 9,
  },
  Bb: {
    modes: [
      "BbMaj",
      "BbIon",
      "Gmin",
      "GAeo",
      "Gm",
      "FMix",
      "CDor",
      "DPhr",
      "EbLyd",
      "ALoc",
    ],
    stepsFromC: 10,
  },
  B: {
    modes: [
      "BMaj",
      "BIon",
      "G#min",
      "G#Aeo",
      "G#m",
      "F#Mix",
      "C#Dor",
      "D#Phr",
      "ELyd",
      "A#Loc",
    ],
    stepsFromC: 11,
  },
  "C#": {
    modes: [
      "C#Maj",
      "C#Ion",
      "A#min",
      "A#Aeo",
      "A#m",
      "G#Mix",
      "D#Dor",
      "E#Phr",
      "F#Lyd",
      "B#Loc",
    ],
    stepsFromC: 1,
  },
  "F#": {
    modes: [
      "F#Maj",
      "F#Ion",
      "D#min",
      "D#Aeo",
      "D#m",
      "C#Mix",
      "G#Dor",
      "A#Phr",
      "BLyd",
      "E#Loc",
    ],
    stepsFromC: 6,
  },
  Cb: {
    modes: [
      "CbMaj",
      "CbIon",
      "Abmin",
      "AbAeo",
      "Abm",
      "GbMix",
      "DbDor",
      "EbPhr",
      "FbLyd",
      "BbLoc",
    ],
    stepsFromC: 11,
  },
};

const MODE_NAMES = [
  "maj",
  "ion",
  "min",
  "aeo",
  "m",
  "mix",
  "dor",
  "phr",
  "lyd",
  "loc",
];

export const isLegalMode = (mode: string): boolean =>
  MODE_NAMES.includes(mode.toLowerCase());

/** Built once, exactly as abcjs builds it lazily. Case-insensitive by construction. */
const KEY_REVERSE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, group] of Object.entries(KEYS)) {
    out[name.toLowerCase()] = name;
    for (const mode of group.modes) out[mode.toLowerCase()] = name;
  }
  return out;
})();

/**
 * The relative major of a key, or the key itself when it is unrecognised.
 *
 * **THE MATCH IS A PREFIX, AND A KEY WITH NO MODE RETURNS UNCHANGED** — `mode[2]` must be
 * present, so `K:C` gives back `"C"` rather than looking anything up.
 */
export function relativeMajor(key: string): string {
  const m = /([a-g][b#]?)(maj|ion|min|aeo|mix|dor|phr|lyd|loc|m)?/.exec(
    key.toLowerCase(),
  );
  if (!m?.[2]) return key;
  return KEY_REVERSE[`${m[1] ?? ""}${m[2]}`] ?? key;
}

/** The reverse: a major key plus a mode name, back to how that mode is spelled. */
export function relativeMode(majorKey: string, mode: string): string {
  const group = KEYS[majorKey];
  if (group === undefined || mode === "") return majorKey;
  const match = /^(maj|ion|min|aeo|mix|dor|phr|lyd|loc|m)/.exec(
    mode.toLowerCase(),
  );
  if (!match) return majorKey;
  const regMode = match[1] ?? "";
  for (const thisMode of group.modes) {
    const ind = thisMode.toLowerCase().indexOf(regMode);
    if (ind !== -1 && ind === thisMode.length - regMode.length) {
      return thisMode.substring(0, thisMode.length - regMode.length);
    }
  }
  return majorKey;
}

/**
 * A MAJOR key plus semitones — arithmetic on `stepsFromC`, then the FIRST key in insertion
 * order with that value. That ordering is why 1 semitone up from C is `Db` and not `C#`:
 * both are `stepsFromC: 1` and `Db` is declared first.
 */
export function transposeKey(key: string, steps: number): string {
  const match = KEYS[key];
  if (match === undefined) return key;
  let s = steps;
  while (s < 0) s += 12;
  const fromC = (match.stepsFromC + s) % 12;
  for (const k of Object.keys(KEYS)) {
    if (KEYS[k]?.stepsFromC === fromC) return k;
  }
  return key;
}

export interface KeyAccidental {
  readonly acc: "sharp" | "flat";
  readonly note: string;
}

const S = (note: string): KeyAccidental => ({ acc: "sharp", note });
const F = (note: string): KeyAccidental => ({ acc: "flat", note });
// abcjs's own casing, which is inconsistent and which `createKeyAccidentals` normalises.
const SHARPS = [S("f"), S("c"), S("g"), S("d"), S("A"), S("e"), S("B")];
const FLATS = [F("B"), F("e"), F("A"), F("d"), F("G"), F("c"), F("F")];

const KEY_ACCIDENTALS: Readonly<Record<string, readonly KeyAccidental[]>> = {
  "C#": SHARPS.slice(0, 7),
  "F#": SHARPS.slice(0, 6),
  B: SHARPS.slice(0, 5),
  E: SHARPS.slice(0, 4),
  A: SHARPS.slice(0, 3),
  D: SHARPS.slice(0, 2),
  G: SHARPS.slice(0, 1),
  C: [],
  F: FLATS.slice(0, 1),
  Bb: FLATS.slice(0, 2),
  Eb: FLATS.slice(0, 3),
  Cm: FLATS.slice(0, 3),
  Ab: FLATS.slice(0, 4),
  Db: FLATS.slice(0, 5),
  Gb: FLATS.slice(0, 6),
  Cb: FLATS.slice(0, 7),
  // "Not in the 2.0 spec, but seem normal enough" — and abcjs's own TODO says they are
  // wrong. `A#` really is two flats. Reproduced.
  "A#": FLATS.slice(0, 2),
  "B#": [],
  "D#": FLATS.slice(0, 3),
  "E#": FLATS.slice(0, 1),
  "G#": FLATS.slice(0, 4),
  none: [],
};

/** `keyAccidentals(key)` — the accidentals of a key's relative major, or null. */
export function keyAccidentals(key: string): readonly KeyAccidental[] | null {
  return KEY_ACCIDENTALS[relativeMajor(key)] ?? null;
}

const SHARP_CHORDS = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const FLAT_CHORDS = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
const SHARP_FREE = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_FREE = [
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

const chordIndex = (name: string): number => {
  for (const table of [SHARP_CHORDS, FLAT_CHORDS, SHARP_FREE, FLAT_FREE]) {
    const i = table.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * `transposeChordName` — `parse/transpose-chord.js`.
 *
 * **AN EXACT OCTAVE IS A NO-OP**, and the shape is `(root)(stuff)/(bass)(more stuff)` with
 * only the root and the bass moved. **AND `A#dim` AND `D#dim` ARE RESPELLED** — abcjs's
 * own comment is "we never want A#dim or D#dim" — which is the one place the table is
 * overridden by taste rather than by key.
 */
export function transposeChordName(
  chord: string,
  steps: number,
  preferFlats: boolean,
  freeGCchord: boolean,
): string {
  if (!steps || steps % 12 === 0) return chord;
  let s = steps;
  while (s < 0) s += 12;
  if (s > 11) s = s % 12;

  const match = /^([A-G][b#♭♯]?)([^/]+)?\/?([A-G][b#♭♯]?)?(.+)?/.exec(chord);
  if (!match) return chord;
  const name = match[1] ?? "";
  const extra1 = match[2];
  const bass = match[3];
  const extra2 = match[4];
  const at = chordIndex(name);
  if (at < 0) return chord;

  const pick = (i: number): string =>
    preferFlats
      ? ((freeGCchord ? FLAT_FREE[i] : FLAT_CHORDS[i]) ?? "")
      : ((freeGCchord ? SHARP_FREE[i] : SHARP_CHORDS[i]) ?? "");

  let out = pick((at + s) % 12);
  const isDim =
    extra1 !== undefined && (extra1.includes("dim") || extra1.includes("°"));
  if (isDim && out === "A#") out = "Bb";
  if (isDim && out === "D#") out = "Eb";
  if (isDim && out === "A♯") out = "B♭";
  if (isDim && out === "D♯") out = "E♭";
  if (extra1 !== undefined) out += extra1;

  if (bass !== undefined) {
    const bi = chordIndex(bass);
    out += "/";
    out += bi >= 0 ? pick((bi + s) % 12) : bass;
  }
  if (extra2 !== undefined) out += extra2;
  return out;
}
