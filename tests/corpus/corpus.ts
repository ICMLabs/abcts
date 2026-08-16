import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${key} is not set — vitest.config.ts exports it from abcts.config.json`,
    );
  }
  return resolve(value);
};

export const corpusDir = required("ABCTS_CORPUS_PATH");
export const goldensDir = required("ABCTS_GOLDENS_PATH");

/** One ABC fixture and every abcjs golden generated from it. */
export interface CorpusCase {
  /** Fixture filename without the `.abc` extension. Golden files are keyed on this. */
  readonly name: string;
  readonly abcPath: string;
  readonly abc: string;
  /** Golden filenames (not paths) attributed to this fixture. */
  readonly goldens: readonly string[];
}

/**
 * A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION — and this is the mirror of the 2026-08-07
 * finding, which was the same sentence the other way round.
 *
 * There the pixel gate enumerated `<name>.svg`, so twelve multi-tune fixtures went silently
 * unmeasured. Here two gates enumerate FIXTURES and then read GOLDENS, so a fixture arriving
 * WITHOUT goldens does not go unmeasured — it throws `ENOENT` and takes the suite red. The
 * corpus lives in a sibling repo that another agent maintains, and four fixtures landed in it
 * mid-session with no goldens beside them.
 *
 * A fixture with no golden cannot be compared against abcjs, so a parity gate must skip it —
 * but LOUDLY. `skipped` is returned rather than filtered away silently, because "we compared
 * everything" and "we compared everything we had a golden for" are different claims and the
 * second one has to be said out loud. The baseline gate still covers them: it compares our
 * output against our own committed snapshot and needs no golden at all.
 */
export function withGolden(
  corpus: readonly CorpusCase[],
  suffix: string,
): { cases: CorpusCase[]; skipped: string[] } {
  const cases: CorpusCase[] = [];
  const skipped: string[] = [];
  for (const c of corpus) {
    if (c.goldens.includes(`${c.name}${suffix}`)) cases.push(c);
    else skipped.push(c.name);
  }
  return { cases, skipped };
}

// A golden belongs to a fixture when the character right after the stem separates it
// from a variant (`-tune0.svg`) or an extension (`.parse.json`, `.svg`, `.mid`).
const ownsGolden = (stem: string, golden: string): boolean =>
  golden.startsWith(stem) &&
  (golden[stem.length] === "." || golden[stem.length] === "-");

export function loadCorpus(): CorpusCase[] {
  const fixtures = readdirSync(corpusDir)
    .filter((f) => f.endsWith(".abc"))
    .sort();
  const stems = fixtures.map((f) => basename(f, ".abc"));

  // Longest stem wins: `score-reorder-shared-*.svg` also prefix-matches `score-reorder`,
  // so a naive startsWith would attribute it to both fixtures.
  const byLength = [...stems].sort((a, b) => b.length - a.length);
  const goldensFor = new Map<string, string[]>(stems.map((s) => [s, []]));
  for (const golden of readdirSync(goldensDir)) {
    const owner = byLength.find((stem) => ownsGolden(stem, golden));
    if (owner) goldensFor.get(owner)?.push(golden);
  }

  return stems.map((name) => ({
    name,
    abcPath: join(corpusDir, `${name}.abc`),
    abc: readFileSync(join(corpusDir, `${name}.abc`), "utf-8"),
    goldens: goldensFor.get(name) ?? [],
  }));
}

/** The abcjs parse-tree dump for a fixture — the compat-mode parser target. */
export function parseGolden(name: string): unknown {
  return JSON.parse(
    readFileSync(join(goldensDir, `${name}.parse.json`), "utf-8"),
  );
}

/** The subset of an abcjs golden element this suite reads. */
export interface GoldenElement {
  readonly el_type: string;
  readonly startChar: number;
  readonly endChar: number;
  readonly duration: number;
  readonly rest?: unknown;
  readonly pitches?: readonly {
    readonly pitch: number;
    /** 'sharp' | 'flat' | 'natural' | 'dblsharp' | 'dblflat' | 'quartersharp' | 'quarterflat' */
    readonly accidental?: string;
  }[];
  /** On the FIRST note of a tuplet only: the sounding multiplier, e.g. 2/3 for a triplet. */
  readonly tripletMultiplier?: number;
  /** On the first note of a tuplet: how many notes the multiplier covers. */
  readonly tripletR?: number;
  /** Beam-run boundaries: set on the first and last note of a beamed run. */
  readonly startBeam?: boolean;
  readonly endBeam?: boolean;
  /** Grace-note pitches attached to this element. */
  readonly gracenotes?: readonly { readonly pitch: number }[];
  /** Decoration names attached to this element, e.g. ['trill']. */
  readonly decoration?: readonly string[];
  /** Chord symbols / annotations: {name, position}. */
  readonly chord?: readonly {
    readonly name: string;
    readonly position?: string;
    /** Present on `"@x,y text"` annotations, which are NOT chord symbols. */
    readonly rel_position?: unknown;
  }[];
  /** Lyric syllables, one per verse: {syllable, divider}. */
  readonly lyric?: readonly {
    readonly syllable: string;
    readonly divider?: string;
  }[];
}

interface GoldenTune {
  readonly lines?: readonly {
    readonly staff?: readonly { readonly voices?: GoldenElement[][] }[];
  }[];
}

/**
 * Every tune in a `.parse.json` golden, normalized across abcjs's two dump shapes.
 *
 * A single-tune golden is the tune object itself (`{warnings, formatting, metaText,
 * lines}`); a multi-tune golden wraps them in `{_meta, tunes: [...]}` with no top-level
 * `lines`. Reading only the single-tune shape silently yields zero notes for all 12
 * tunebook fixtures, which reads as "no coverage" rather than "wrong reader".
 */
function goldenTunes(name: string): readonly GoldenTune[] {
  const golden = parseGolden(name) as { tunes?: GoldenTune[] } & GoldenTune;
  return golden.tunes ?? [golden];
}

/**
 * Every note element in a golden — INCLUDING RESTS — in VOICE-MAJOR order.
 *
 * Rests are kept because abcjs attaches `tripletMultiplier` to whichever element opens a
 * tuplet, and `(3z2A2G2` opens on a rest. Filtering rests before propagating that marker
 * silently strips the tuplet from the notes that follow it.
 *
 * abcjs stores elements system-major — `lines[].staff[].voices[]`, where each line is one
 * rendered system — so a two-voice tune interleaves V1 and V2 once per system. The core
 * model is voice-major (`Score.voices[].measures[]`). Regrouping by `(staff, voice)` here
 * undoes abcjs's layout order to recover the logical order; it does not discard anything.
 * Grouping restarts per tune, so tune 0's voice 0 never merges with tune 1's.
 */
export function goldenElements(name: string): GoldenElement[] {
  const out: GoldenElement[] = [];
  for (const tune of goldenTunes(name)) {
    const byVoice = new Map<string, GoldenElement[]>(); // insertion order = first appearance
    for (const line of tune.lines ?? []) {
      (line.staff ?? []).forEach((staff, staffIndex) => {
        (staff.voices ?? []).forEach((voice, voiceIndex) => {
          const key = `${staffIndex}:${voiceIndex}`;
          let bucket = byVoice.get(key);
          if (!bucket) {
            bucket = [];
            byVoice.set(key, bucket);
          }
          for (const element of voice) {
            if (element.el_type !== "note") continue;
            bucket.push(element);
          }
        });
      });
    }
    for (const bucket of byVoice.values()) out.push(...bucket);
  }
  return out;
}

/** Sounding notes only — rests dropped. Use `goldenElements` when tuplet state matters. */
export const goldenNotes = (name: string): GoldenElement[] =>
  goldenElements(name).filter((element) => !element.rest && element.pitches);

// ─── Layout goldens (`*.elements.json`) ──────────────────────────────────────
// abcjs's LAID-OUT elements, as distinct from its parse tree. This is the renderer's
// structural oracle: element sequence and staff positions, which survive core rendering
// in its own visual style, unlike the SVG goldens which gate compat mode only.

/** The subset of an abcjs layout element this suite reads. */
export interface GoldenLayoutElement {
  /** e.g. 'note', 'bar', 'rest', 'staff-extra clef'. */
  readonly type: string;
  readonly duration: number;
  readonly w: number;
  /** Noteheads, carrying the staff position in abcjs's pitch numbering. */
  readonly heads?: readonly { readonly c: string; readonly pitch: number }[];
}

interface GoldenLayout {
  readonly staffGroups?: readonly {
    readonly voices?: readonly { readonly children?: GoldenLayoutElement[] }[];
  }[];
}

/**
 * abcjs's laid-out elements for the FIRST voice, in reading order.
 *
 * abcjs's `staffGroups` are rendered systems, so a tune that wraps appears as several
 * groups. Concatenating voice 0 across them recovers the logical voice — but abcjs
 * reprints the clef, key and meter at the head of every system, and those repeats are
 * layout, not content. They are dropped after the first system so the sequence reflects
 * what the music says rather than where abcjs chose to break the line.
 *
 * Caveat, and the reason this is not simply `filter(startsWith('staff-extra'))`: a
 * genuine mid-tune `K:` or `M:` change also surfaces as a `staff-extra`, and this drops
 * those too when they fall in a later system. No fixture in the current gate has one;
 * revisit when one enters.
 */
export function goldenLayoutElements(name: string): GoldenLayoutElement[] {
  const layout = JSON.parse(
    readFileSync(join(goldensDir, `${name}.elements.json`), "utf-8"),
  ) as GoldenLayout;

  const out: GoldenLayoutElement[] = [];
  (layout.staffGroups ?? []).forEach((group, systemIndex) => {
    for (const child of group.voices?.[0]?.children ?? []) {
      if (systemIndex > 0 && child.type.startsWith("staff-extra")) continue;
      out.push(child);
    }
  });
  return out;
}
