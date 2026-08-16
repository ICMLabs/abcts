import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { elementFromChar, linesOf } from "../src/compat/lines.js";
import { parse } from "../src/parser/parser.js";

/**
 * **`getElementFromChar` FOR EVERY CHARACTER OF EVERY FIXTURE.**
 *
 * `tune.lines` is abcjs's laid-out tree and a host reads it to find the element under a
 * caret. The oracle is `tests/corpus-lines/golden.json`: abcjs 6.7.0 asked for the element
 * at every character of all 303 tunes in both corpora — **28,712 characters that map to
 * something**, and every other character has to map to nothing.
 *
 * The gate is per TUNE and ratcheted: a slug that agrees on every character is on
 * `PASSING` and must stay there. The aggregate is printed too, because the open rows are
 * a work list rather than a regression.
 *
 * **WHAT IS MISSING IS NAMED AND MEASURED, NOT GUESSED AT.** 5,912 characters across 126
 * tunes, and it is two things:
 *
 * 1. **SIX ELEMENT TYPES THE PROJECTION DOES NOT CARRY** — `tempo`, `clef`, `midi`,
 *    `style`, `color` and `part`, each needing a source range the model does not keep.
 *    (`stem` is the eleventh type and costs NOTHING: `appendElement('stem', null, null,
 *    …)` gives it a null `startChar`, so abcjs's own truthiness guard skips it —
 *    289 of them and not one reachable.)
 * 2. **A CHORD'S RANGE STOPS SHORT OF A TRAILING TIE.** `ragtime-nightingale` loses 1,273
 *    characters on its own, the most of any row, and the first is `[G,D]/4-` at 272:
 *    abcjs's element is 272…281 and ours 272…279, missing the `-`. That is a PARSER
 *    change — a chord's `sourceRange` — under gates that read source offsets, so it is
 *    measured here rather than guessed at from this side.
 */
const GOLDEN = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "corpus-lines", "golden.json"),
    "utf-8",
  ),
) as Record<string, [char: number, type: string, start: number, end: number][]>;

const SIBLING = join(
  import.meta.dirname,
  "..",
  "..",
  "abcMusicKit",
  "Tools",
  "abcjs-debug",
  "fixtures",
);
const IN_REPO = join(import.meta.dirname, "corpus-abcjs", "fixtures");

/** `S7-voices` is stale in the sibling repo — see `CHECKPOINT-2026-08-12.md` §5. */
const STALE = "sib/S7-voices";

interface Row {
  readonly slug: string;
  readonly agree: number;
  readonly total: number;
}

const rows = (): Row[] => {
  const out: Row[] = [];
  const cache = new Map<string, string>();
  for (const [key, want] of Object.entries(GOLDEN)) {
    if (key.startsWith(STALE)) continue;
    const corpus = key.slice(0, key.indexOf("/"));
    const rest = key.slice(key.indexOf("/") + 1);
    const at = rest.lastIndexOf("-tune");
    const file = rest.slice(0, at);
    const dir = corpus === "sib" ? SIBLING : IN_REPO;
    let abc = cache.get(`${corpus}/${file}`);
    if (abc === undefined) {
      abc = readFileSync(join(dir, `${file}.abc`), "utf-8");
      cache.set(`${corpus}/${file}`, abc);
    }
    const parsed = parse(abc, { mode: "abcjs-strict" });
    const score = parsed.ok
      ? parsed.scores[Number(rest.slice(at + "-tune".length))]
      : undefined;
    if (score === undefined) continue;
    const lines = linesOf(score, abc);
    const wanted = new Map(want.map((w) => [w[0], w]));
    let agree = 0;
    for (let c = 0; c < abc.length; c += 1) {
      const w = wanted.get(c);
      const g = elementFromChar(lines, c);
      const same =
        w === undefined
          ? g === null
          : g !== null &&
            g.el_type === w[1] &&
            g.startChar === w[2] &&
            g.endChar === w[3];
      if (same) agree += 1;
    }
    out.push({ slug: key, agree, total: abc.length });
  }
  return out;
};

/** Tunes that agree on EVERY character. Grows, never shrinks. */
const PASSING: readonly string[] = [
  "sib/S1-decorations-tune0",
  "sib/S1-decorations-tune1",
  "sib/S1-decorations-tune2",
  "sib/S1-decorations-tune3",
  "sib/S1-decorations-tune4",
  "sib/S2-fields-tune0",
  "sib/S2-fields-tune2",
  "sib/S3-note-syntax-tune0",
  "sib/S3-note-syntax-tune2",
  "sib/S3-note-syntax-tune4",
  "sib/S3-note-syntax-tune6",
  "sib/S3-note-syntax-tune7",
  "sib/S3-note-syntax-tune10",
  "sib/S3-note-syntax-tune11",
  "sib/S3-note-syntax-tune12",
  "sib/S3-note-syntax-tune13",
  "sib/S3-note-syntax-tune14",
  "sib/S3-note-syntax-tune15",
  "sib/S3-note-syntax-tune16",
  "sib/S3-note-syntax-tune18",
  "sib/S3-note-syntax-tune19",
  "sib/S3-note-syntax-tune20",
  "sib/S3-note-syntax-tune21",
  "sib/S3-note-syntax-tune23",
  "sib/S3-note-syntax-tune24",
  "sib/S5-directives-tune3",
  "sib/S6-keys-tune0",
  "sib/S8-layout-tune2",
  "sib/center-text-tune0",
  "sib/chord-grid-tune0",
  "sib/clefs-tune0",
  "sib/clefs-tune1",
  "sib/clefs-tune2",
  "sib/clefs-tune3",
  "sib/clefs-tune4",
  "sib/clefs-tune5",
  "sib/clefs-tune6",
  "sib/escaped-percent-tune0",
  "sib/extra-class-tune0",
  "sib/missing-decorations-tune0",
  "sib/missing-decorations-tune1",
  "sib/missing-decorations-tune2",
  "sib/missing-decorations-tune3",
  "sib/missing-decorations-tune4",
  "sib/missing-decorations-tune5",
  "sib/multi-voice-lyrics-two-voices-tune0",
  "sib/multi-voice-rest-collision-tune0",
  "sib/multi-voice-rest-placement-tune0",
  "sib/multi-voice-triplet-brackets-tune0",
  "sib/program-127-test-tune0",
  "sib/simple-c-tune0",
  "sib/stacked-annotations-tune0",
  "sib/tunebook-3-tune0",
  "sib/tunebook-3-tune1",
  "sib/tunebook-3-tune2",
  "sib/twinkle-tune0",
  "sib/voice-middle-after-clef-tune0",
  "sib/voice-octave-shift-tune0",
  "sib/vree-compound-meter-tune0",
  "sib/vree-grace-notes-tune0",
  "repo/abcjs-parse-book_parser-01-example-tune0",
  "repo/abcjs-parse-book_parser-02-tune-tune0",
  "repo/abcjs-parse-book_parser-03-a-tune0",
  "repo/abcjs-parse-book_parser-03-a-tune1",
  "repo/abcjs-parse-book_parser-03-a-tune2",
  "repo/abcjs-parse-book_parser-04-wed-tune0",
  "repo/abcjs-parse-book_parser-05-a-tune0",
  "repo/abcjs-parse-book_parser-05-a-tune1",
  "repo/abcjs-parse-book_parser-06-a-tune0",
  "repo/abcjs-parse-book_parser-07-a-tune0",
  "repo/abcjs-parse-note-01-c0-d1-eg-0-fa-1-tune0",
  "repo/abcjs-synth-flattener-01-crescendo-efga-gab-crescendo-c-diminuend-tune0",
  "repo/abcjs-synth-flattener-02-p-c-def-gabc-d2-b2-g2-f2-f-e-fga-bcde-p--tune0",
  "repo/abcjs-synth-flattener-03-pppp-cdef-gabc-y-ffff-bcba-gfed-y-pppp-c-tune0",
  "repo/abcjs-synth-flattener-04-g-gab-cde-d7-fga-def-tune0",
  "repo/abcjs-synth-flattener-05-c-cde-def-c2e-d2f-c-c2-d-d-g-d2-e-e-tune0",
  "repo/abcjs-synth-flattener-08-em-egab-tune0",
  "repo/abcjs-synth-flattener-12-chords-meter-change-tune0",
  "repo/abcjs-synth-flattener-13-e7-bcde-a-f-break-efe-e7-bc-ignore-de-tune0",
  "repo/abcjs-synth-flattener-16-gm-gfdf-gfdf-gf-d2-f-c4-tune0",
  "repo/abcjs-synth-flattener-17-midi-grace-notes-tune0",
  "repo/abcjs-synth-flattener-18-midi-program-40-tune0",
  "repo/abcjs-synth-flattener-19-cdef-z4-fedc-tune0",
  "repo/abcjs-synth-flattener-23-percmap-d-pedal-hi-hat-x-tune0",
  "repo/abcjs-synth-flattener-24-percmap-c-high-tom-x-tune0",
  "repo/abcjs-synth-flattener-27-triplets-and-chord-rhythm-tune0",
  "repo/abcjs-synth-flattener-28-midi-channel-10-tune0",
  "repo/abcjs-synth-flattener-29-midi-drum-dddd-76-77-77-77-50-50-50-50-tune0",
  "repo/abcjs-synth-flattener-30-am-a2e-e2d-g-bab-d2b-am-a2e-e2d-g-b2a-ga-tune0",
  "repo/abcjs-synth-flattener-32-quarter-tone2-tune0",
  "repo/abcjs-synth-flattener-33-tempo-override-tune0",
  "repo/abcjs-synth-flattener-34-score-s-a-t-b-tune0",
  "repo/abcjs-synth-flattener-35-midi-bassprog-10-tune0",
  "repo/abcjs-synth-flattener-36-midi-gchord-fhihfhih-tune0",
  "repo/abcjs-synth-flattener-37-midi-gchord-bzczbzcz-tune0",
  "repo/abcjs-synth-flattener-38-c-zz-d-z-e-z-tune0",
  "repo/abcjs-synth-flattener-39-midi-gchord-bzczbzcz-tune0",
  "repo/abcjs-synth-flattener-40-c5-z4-tune0",
  "repo/abcjs-synth-flattener-41-midi-bassprog-10-octave-1-tune0",
  "repo/abcjs-synth-flattener-42-midi-gchord-ffffffff-tune0",
  "repo/abcjs-synth-flattener-43-gm-zzz-cm-zzz-tune0",
  "repo/abcjs-synth-flattener-44-cd-pppp-c-ffff-d-ffff-c-pppp-d-cd-tune0",
  "repo/abcjs-synth-flattener-45-segno-f-d2-tune0",
  "repo/abcjs-synth-midi-01-midi-options-tune0",
  "repo/abcjs-synth-midi-03-percmap-tune0",
  "repo/abcjs-synth-timing-02-score-1-2-tune0",
  "repo/abcjs-synth-timing-05-subtitle-crash-tune0",
  "repo/abcjs-synth-timing-09-f-c-2d-2-e-4-g-6-a-2-g-4-e-4-tune0",
  "repo/abcjs-visual-directives-01-incipit-test-tune0",
  "repo/abcjs-visual-layout-03-cdef-cdef-tune0",
  "repo/abcjs-visual-layout-08-staffwidth-100-tune0",
  "repo/abcjs-visual-misc-02-title-tune0",
  "repo/abcjs-visual-misc-03-jazzchords-tune0",
  "repo/abcjs-visual-misc-05-cccc-d-c-alcoda-dddd-d-c-alfine-eeee-d-s-tune0",
  "repo/abcjs-visual-misc-07-ab-ef-g-d-df-f-d-a-4-c-4-tune0",
  "repo/abcjs-visual-misc-08-a2-c2-t-a2t-c2-tune0",
  "repo/abcjs-visual-misc-09-begintext-tune0",
  "repo/abcjs-visual-misc-10-begintext-tune0",
  "repo/abcjs-visual-misc-11-begintext-tune0",
  "repo/abcjs-visual-misc-12-b-beambr1-b-bb-tune0",
  "repo/abcjs-visual-misc-13-ceg-t-gce-d-f-b-3-dm7-d-te-tune0",
  "repo/abcjs-visual-misc-14-tune-tune0",
  "repo/abcjs-visual-multi-voice-01-score-top-bottom-tune0",
  "repo/abcjs-visual-multi-voice-02-p-c-2b2-z4-f2a2-f4-tune0",
  "repo/abcjs-visual-parsing-01-azzz-e2-tune0",
  "repo/abcjs-visual-parsing-02-sx-tune0",
  "repo/abcjs-visual-svg-01-staffwidth-5-tune0",
  "repo/abcjs-visual-svg-03-a4-tune0",
  "repo/abcjs-visual-svg-per-line-02-scaled-tune0",
  "repo/abcjs-visual-tablature-01-gr-tune0",
  "repo/abcjs-visual-tablature-03-staves-rh-lh-tune0",
  "repo/abcjs-visual-tablature-04-barnumbers-1-tune0",
  "repo/abcjs-visual-tablature-05-a7-a-tune0",
  "repo/abcjs-visual-tablature-06-a7-a-tune0",
  "repo/abcjs-visual-tablature-07-staves-rh-lh-tune0",
  "repo/abcjs-visual-tablature-08-first-tune0",
  "repo/abcjs-visual-tablature-09-f-g-tune0",
  "repo/abcjs-visual-tablature-10-f3-a-y-tune0",
  "repo/abcjs-visual-tablature-12-b-tune0",
  "repo/abcjs-visual-tablature-14-c-tune0",
  "repo/abcjs-visual-tablature-18-a-b-tune0",
  "repo/abcjs-visual-tablature-19-d-a-d-g-b-e-tune0",
  "repo/abcjs-visual-tablature-21-a2-a-a-f-f-f-f-f-e-ee-g-gg-g-k-eb-a2-a2-tune0",
  "repo/abcjs-visual-tablature-22-g-cegda-tune0",
  "repo/abcjs-visual-tablature-23-gab-tune0",
  "repo/abcjs-visual-tablature-24-stretchlast-tune0",
  "repo/abcjs-visual-title-01-not-transformed-tune0",
  "repo/abcjs-visual-title-02-transformed-the-tune0",
  "repo/abcjs-visual-title-03-transformed-the-tune0",
  "repo/abcjs-visual-title-04-transformed-a-tune0",
  "repo/abcjs-visual-title-05-transformed-an-tune0",
  "repo/abcjs-visual-title-06-transformed-a-tune0",
  "repo/abcjs-visual-title-07-24-number-transform-the-tune0",
  "repo/abcjs-visual-title-08-24-number-transform-a-tune0",
  "repo/abcjs-visual-title-09-mal-the-formed-tune0",
  "repo/abcjs-visual-title-10-20-subtitles-the-tune0",
  "repo/abcjs-visual-transpose-01-f2-f-f-f-f-f2-e2-e-e-e-e-e2-k-ab-f2-f-f--tune0",
  "repo/abcjs-visual-transpose-02-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b--tune0",
  "repo/abcjs-visual-transpose-03-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b--tune0",
  "repo/abcjs-visual-transpose-04-transpose-annotations-tune0",
  "repo/abcjs-visual-transpose-05-n-c-ab-c-c-c-c-d-d-d-d-e-e-f-f-f-f-g-g-g-tune0",
  "repo/abcjs-visual-transpose-06-c-d-e-f-g-a-b-c-cdef-gabc-c-d-e-f-g-a-b--tune0",
  "repo/abcjs-visual-transpose-output-01-transpose-output-tune0",
  "repo/abcjs-visual-transpose-output-02-transpose-output-tune0",
  "repo/abcjs-visual-transpose-output-05-g-tune0",
  "repo/abcjs-visual-transpose-output-06-f-tune0",
  "repo/abcjs-visual-wrap-01-b-4-c2d2-e3f-gabc-d-e-f-g-marcato-d-e-f--tune0",
  "repo/abcjs-visual-wrap-02-stretchlast-1-tune0",
  "repo/abcjs-visual-wrap-05-score-1-2-3-4-tune0",
  "repo/abcts-keywarn-tune1",
  "repo/abcts-visualtranspose-tune0",
  "repo/abcts-visualtranspose-tune1",
  "repo/abcts-visualtranspose-tune2",
  "repo/abcts-visualtranspose-tune3",
  "repo/abcts-vskip-tune0",
  "repo/abcts-vskip-tune1",
  "repo/abcts-vskip-tune2",
];

describe("tune.lines and getElementFromChar", () => {
  const table = rows();

  it("writes the ranked table", () => {
    const off = table
      .filter((r) => r.agree < r.total)
      .sort((a, b) => a.agree - b.agree);
    const agree = table.reduce((t, r) => t + r.agree, 0);
    const total = table.reduce((t, r) => t + r.total, 0);
    writeFileSync(
      "/tmp/abcts-lines-ranked.txt",
      [
        `${off.length} of ${table.length} tunes differ; ${agree} of ${total} characters agree`,
        "",
        ...off.map((r) => `  ${r.slug.padEnd(48)} ${r.agree}/${r.total}`),
      ].join("\n") + "\n",
    );
    expect(table.length).toBeGreaterThan(250);
  });

  it("every ratcheted tune agrees on every character", () => {
    const broken = table
      .filter((r) => PASSING.includes(r.slug))
      .filter((r) => r.agree < r.total)
      .map((r) => `${r.slug} ${r.agree}/${r.total}`);
    expect(broken).toEqual([]);
  });

  /**
   * A floor, not a target — it moves up as element types are added and must never move
   * down. The open rows are the seven types the projection does not carry.
   */
  it("the whole corpus agrees on at least the characters it did", () => {
    const agree = table.reduce((t, r) => t + r.agree, 0);
    expect(agree).toBeGreaterThanOrEqual(250775);
  });

  /**
   * **CHARACTER 0 IS UNREACHABLE, AND THAT IS abcjs's OWN GUARD** — `elem.startChar &&
   * elem.endChar && …` (`abc_tune.js:235-254`), so an element starting at 0 fails the
   * first test. A host asking for the element at the very first character gets null.
   */
  it("never finds an element at character 0", () => {
    const parsed = parse("X:1\nK:C\nCDEF|\n", { mode: "abcjs-strict" });
    const score = parsed.ok ? parsed.scores[0] : undefined;
    expect(score).toBeDefined();
    if (score !== undefined) {
      expect(
        elementFromChar(linesOf(score, "X:1\nK:C\nCDEF|\n"), 0),
      ).toBeNull();
    }
  });
});
