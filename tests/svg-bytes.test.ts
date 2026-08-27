/**
 * **THE SVG BYTE TABLE — the bar for `abcjs-strict` is BYTE PARITY, and this is the only
 * gate that says so.**
 *
 * Every other comparison in this repo declares what it ignores. `pixel-parity` resolves
 * both SVGs to absolute pixels and compares notehead CENTRES; the harvested table takes
 * 0.05px; `tempo-parts` compares which GLYPHS a mark is made of; `decoration-x` measures one
 * axis; `dom-contract` counts classed ancestors rather than raw nesting. Each of those
 * tolerances was defensible for the axis it was built to see, and **together they let a
 * markup difference live forever**: a `<rect>` where abcjs writes a `<path>` moves nothing,
 * a `<g transform>` where abcjs writes absolute coordinates moves nothing, and an attribute
 * in a different order moves nothing.
 *
 * A byte string has no such latitude. `differs` means differs, and the first differing
 * OFFSET names the construct — which is exactly the argument the MIDI-file oracle won on,
 * and that one disagreed three times while the event table was green.
 *
 * ── WHAT THIS TABLE IS FOR ───────────────────────────────────────────────────
 * It opens at every case and that is the POINT, as it was for audio (54 of 54), the MIDI
 * file (3 of 3) and the DOM contract (25 of 25). It is the WORK LIST for strict-mode
 * markup, ranked by how far in the first difference is, so the closest cases sit at the
 * bottom and are closed first.
 *
 * ── THE ONE THING IT MAY NEVER DO ────────────────────────────────────────────
 * **Grow a tolerance.** If a difference here is a deliberate divergence — an abcjs bug we
 * refuse to reproduce, or a mode-split this repo has already ruled on — it belongs in
 * `Docs/ABCJS-DIFFERENCES.md` with the evidence, and its slug belongs in `DIVERGENT` below
 * with a pointer. Anything else is a defect.
 *
 * `/tmp/abcts-svg-bytes-ranked.txt`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";

const fixtures = join(import.meta.dirname, "corpus-abcjs", "fixtures");
const goldens = join(import.meta.dirname, "corpus-abcjs", "golden");

interface Case {
  readonly slug: string;
  readonly abc: string;
  readonly golden: string;
  /** Which tune of the file this row renders — `renderAbc` returns one entry per `X:`. */
  readonly tune: number;
}

/**
 * **A MULTI-TUNE FILE IS THREE ROWS, NOT A SKIP.** A single-tune fixture's golden is
 * `<name>.svg` and a multi-tune file's are `<name>-tune0.svg`, `-tune1.svg`, … — one per
 * `X:`, which is exactly what `renderAbc` returns. This enumerated `<name>.svg` alone and
 * therefore SKIPPED three fixtures and SEVEN tunes, whose goldens have sat in the same
 * directory since April.
 *
 * **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS COMPARISON**, for the
 * second time on this branch — `pixel-parity` had the same hole and the same shape of note
 * explaining it away ("rendering a tunebook into one SVG is a different surface"). It is
 * not: each tune is its own `<svg>` in both engines. Six of the seven were already exact;
 * the seventh named a defect nothing else could reach.
 */
const CASES: Case[] = readdirSync(fixtures)
  .filter((f) => f.endsWith(".abc"))
  .sort()
  .flatMap((f) => {
    const slug = f.replace(/\.abc$/, "");
    const abc = readFileSync(join(fixtures, f), "utf-8");
    if (existsSync(join(goldens, `${slug}.svg`))) {
      return [
        {
          slug,
          abc,
          tune: 0,
          golden: readFileSync(join(goldens, `${slug}.svg`), "utf-8"),
        },
      ];
    }
    const rows: Case[] = [];
    for (let i = 0; existsSync(join(goldens, `${slug}-tune${i}.svg`)); i += 1) {
      rows.push({
        slug: `${slug}-tune${i}`,
        abc,
        tune: i,
        golden: readFileSync(join(goldens, `${slug}-tune${i}.svg`), "utf-8"),
      });
    }
    return rows;
  });

/**
 * Slugs whose difference is a RULED divergence rather than a defect. Empty, and it stays
 * empty until something is written up in `Docs/ABCJS-DIFFERENCES.md` — a slug here without
 * an entry there is a tolerance wearing a disguise.
 */
const DIVERGENT: readonly string[] = [
  /**
   * **abcjs DRAWS A DEBUG STRING FOR A NOTE LONGER THAN A BREVE, IN RED, IN THE SHIPPED
   * OUTPUT.** `chartable.note[-durlog]` runs out one entry past the breve, and
   * `createNoteHead` answers an undefined glyph with
   * `new RelativeElement("pitch is undefined", 0, 0, 0, { type: "debug" })`
   * (`create-note-head.js:24-25`) — which draws as
   * `<text stroke="#ff0000" text-decoration="underline">pitch is undefined</text>` and
   * reserves a 4-pitch chord lane, 19.18px of page, on a tune with no chord symbol in it.
   *
   * Everything else about the element IS reproduced — no head, no stem, and the ledger at
   * `getSymbolWidth(undefined)`, so the rule is the bare 4px overhang (47.05 to 51.05 in
   * both engines). We decline the marker and the lane it takes.
   *
   * See `Docs/ABCJS-DIFFERENCES.md`.
   */
  "abcts-rests-and-bars-tune14",
];

/**
 * Slugs that are BYTE-EXACT and must stay so. Grows, never shrinks.
 *
 * The first seven arrived together, and six of them are the same finding: **a line with no
 * note and no barline is DELETED** (`tune-builder.js:29-61`, `:888-894`), so a tune with a
 * header and no music draws no staff at all — abcjs's golden for `X:43\nT: example` is 694
 * bytes holding a title and nothing else.
 *
 * **AND IT NOW NAMES EVERY EXACT FIXTURE, BECAUSE SEVEN COULD NOT DEFEND EIGHTY-NINE.**
 * On 2026-08-11b two fixtures went from byte-exact to differing while the aggregate count
 * IMPROVED — `parse-tie-slur-01` under the `addStaffPadding` port and `visual-misc-13`
 * under the above-ladder's start — and neither was ratcheted, so the only thing that caught
 * them was diffing two runs of a scratch script by hand. A ratchet holding 4% of what is
 * green is a ratchet in name. Regenerate with `npx tsx` over the corpus when a batch
 * lands; never delete a row to make a run pass.
 */
const PASSING: readonly string[] = [
  /**
   * **`V:… scale=` AND `cue=` — abcjs's `voiceScale`.** Twelve tunes, one per thing that
   * reads it: unbeamed and beamed stems, rests, dots, graces, flags, chords, the identity
   * `scale=1`, `cue=off` (which declares a scale of ONE rather than clearing it) and a
   * two-voice tune where only the first is scaled. See `Voice.scale` for the four
   * quantisations, and `tests/positioning.test.ts` for the ladder method.
   */
  "abcts-grace-tie-tune4",
  "abcts-grace-tie-tune5",
  "abcts-endings-tune2",
  "abcts-rests-and-bars-tune0",
  "abcts-rests-and-bars-tune1",
  "abcts-rests-and-bars-tune2",
  "abcts-rests-and-bars-tune15",
  "abcts-rests-and-bars-tune12",
  "abcts-rests-and-bars-tune13",
  "abcts-rests-and-bars-tune10",
  "abcts-rests-and-bars-tune11",
  "abcts-rests-and-bars-tune8",
  "abcts-rests-and-bars-tune9",
  "abcts-rests-and-bars-tune4",
  "abcts-rests-and-bars-tune5",
  "abcts-rests-and-bars-tune6",
  "abcts-rests-and-bars-tune3",
  "abcts-rests-and-bars-tune7",
  "abcts-endings-tune5",
  "abcts-endings-tune0",
  "abcts-endings-tune1",
  "abcts-endings-tune3",
  "abcts-endings-tune4",
  "abcts-endings-tune6",
  "abcts-endings-tune7",
  "abcts-grace-tie-tune0",
  "abcts-grace-tie-tune1",
  "abcts-grace-tie-tune2",
  "abcts-grace-tie-tune3",
  "abcts-grace-tie-tune6",
  "abcts-grace-tie-tune7",
  "abcts-pitch-style-tune0",
  "abcts-pitch-style-tune1",
  "abcts-pitch-style-tune2",
  "abcts-pitch-style-tune3",
  "abcts-pitch-style-tune4",
  "abcts-pitch-style-tune5",
  "abcts-pitch-style-tune6",
  "abcts-pitch-style-tune7",
  "abcts-voice-scale-tune0",
  "abcts-voice-scale-tune1",
  "abcts-voice-scale-tune2",
  "abcts-voice-scale-tune3",
  "abcts-voice-scale-tune4",
  "abcts-voice-scale-tune5",
  "abcts-voice-scale-tune6",
  "abcts-voice-scale-tune7",
  "abcts-voice-scale-tune8",
  "abcts-voice-scale-tune9",
  "abcts-voice-scale-tune10",
  "abcts-voice-scale-tune11",
  /**
   * **THE FIVE `positionChoices` DIRECTIVES** — `%%vocal`, `%%dynamic`, `%%gchord`,
   * `%%ornament`, `%%volume`. Eight tunes, byte-exact on arrival; the ten-rung ladder they
   * were built from is in `tests/positioning.test.ts` with abcjs's own numbers.
   *
   * ⚠️ **AND THEY HAD BEEN SWEPT ONCE AND CALLED "SAME"** — the 2026-08-22 directive
   * enumeration's control had no lyric, no chord symbol, no dynamic and no ornament, which
   * is everything they position. A "SAME" is only as good as the shape that asked.
   */
  "abcts-positioning-tune0",
  "abcts-positioning-tune1",
  "abcts-positioning-tune2",
  "abcts-positioning-tune3",
  "abcts-positioning-tune4",
  "abcts-positioning-tune5",
  "abcts-positioning-tune6",
  "abcts-positioning-tune7",
  "abcts-slur-shapes-tune0",
  "abcts-slur-shapes-tune1",
  // CLOSED 2026-08-20: the two the fixture opened. `{(CD)}E` was two passes over the grace
  // group — every close, then every open — where `addGraceNotes` makes ONE, so its `)`
  // popped an empty stack; and `[(CE)G]`'s two halves are built at ONE element and were
  // ordered by an absent `startElement` rather than by their own anchors.
  "abcts-slur-shapes-tune2",
  "abcts-slur-shapes-tune3",
  "abcts-slur-shapes-tune4",
  "abcts-slur-shapes-tune5",
  "abcts-slur-shapes-tune6",
  "abcts-slur-shapes-tune7",
  "abcts-slur-shapes-tune8",
  "abcts-slur-shapes-tune9",
  "abcjs-parse-book_parser-01-example",
  "abcjs-parse-book_parser-02-tune",
  "abcjs-parse-book_parser-03-a-tune0",
  "abcjs-parse-book_parser-03-a-tune1",
  "abcjs-parse-book_parser-03-a-tune2",
  "abcjs-parse-book_parser-04-wed",
  "abcjs-parse-book_parser-05-a-tune0",
  "abcjs-parse-book_parser-05-a-tune1",
  "abcjs-parse-book_parser-06-a",
  "abcjs-parse-book_parser-07-a",
  "abcjs-parse-note-01-c0-d1-eg-0-fa-1",
  "abcjs-parse-note-id-01-v-v1-c-d-e-f",
  "abcjs-parse-tie-slur-01-staffwidth-200",
  "abcjs-parse-tie-slur-02-staffwidth-200",
  "abcjs-parse-tie-slur-03-staffwidth-200",
  "abcjs-parse-tie-slur-04-stretchlast-1",
  "abcjs-synth-flattener-01-crescendo-efga-gab-crescendo-c-diminuend",
  "abcjs-synth-flattener-02-p-c-def-gabc-d2-b2-g2-f2-f-e-fga-bcde-p-",
  "abcjs-synth-flattener-03-pppp-cdef-gabc-y-ffff-bcba-gfed-y-pppp-c",
  "abcjs-synth-flattener-04-g-gab-cde-d7-fga-def",
  "abcjs-synth-flattener-05-c-cde-def-c2e-d2f-c-c2-d-d-g-d2-e-e",
  "abcjs-synth-flattener-06-cde-d7-f2-d2-e2-f2-1-g-g4-fedc-c-e4z4",
  "abcjs-synth-flattener-07-metronome",
  "abcjs-synth-flattener-08-em-egab",
  "abcjs-synth-flattener-09-d-defg-q-1-2-90-defg",
  "abcjs-synth-flattener-10-q-1-4-129-0476605-cdef-q-1-4-127-gabc-q-",
  "abcjs-synth-flattener-11-midi-program-3",
  "abcjs-synth-flattener-12-chords-meter-change",
  "abcjs-synth-flattener-13-e7-bcde-a-f-break-efe-e7-bc-ignore-de",
  "abcjs-synth-flattener-14-eb7-zg2ga2a2-a2ab-b4-ab-z-break-c2cd2d2-",
  "abcjs-synth-flattener-15-c-c4-c",
  "abcjs-synth-flattener-16-gm-gfdf-gfdf-gf-d2-f-c4",
  "abcjs-synth-flattener-17-midi-grace-notes",
  "abcjs-synth-flattener-18-midi-program-40",
  "abcjs-synth-flattener-19-cdef-z4-fedc",
  "abcjs-synth-flattener-20-k-treble-8-b-a4-ce-f-4-k-treble-8-g8-g-2",
  "abcjs-synth-flattener-21-c4-d4",
  "abcjs-synth-flattener-22-b-c4-d4",
  "abcjs-synth-flattener-23-percmap-d-pedal-hi-hat-x",
  "abcjs-synth-flattener-24-percmap-c-high-tom-x",
  "abcjs-synth-flattener-25-cd-d2-d2-dz",
  "abcjs-synth-flattener-26-gbcd-d4-zcdc-dc3",
  "abcjs-synth-flattener-27-triplets-and-chord-rhythm",
  "abcjs-synth-flattener-28-midi-channel-10",
  "abcjs-synth-flattener-29-midi-drum-dddd-76-77-77-77-50-50-50-50",
  "abcjs-synth-flattener-30-am-a2e-e2d-g-bab-d2b-am-a2e-e2d-g-b2a-ga",
  "abcjs-synth-flattener-31-tempo-change-three-voices",
  "abcjs-synth-flattener-32-quarter-tone2",
  "abcjs-synth-flattener-33-tempo-override",
  "abcjs-synth-flattener-34-score-s-a-t-b",
  "abcjs-synth-flattener-35-midi-bassprog-10",
  "abcjs-synth-flattener-36-midi-gchord-fhihfhih",
  "abcjs-synth-flattener-37-midi-gchord-bzczbzcz",
  "abcjs-synth-flattener-38-c-zz-d-z-e-z",
  "abcjs-synth-flattener-39-midi-gchord-bzczbzcz",
  "abcjs-synth-flattener-40-c5-z4",
  "abcjs-synth-flattener-41-midi-bassprog-10-octave-1",
  "abcjs-synth-flattener-42-midi-gchord-ffffffff",
  "abcjs-synth-flattener-43-gm-zzz-cm-zzz",
  "abcjs-synth-flattener-44-cd-pppp-c-ffff-d-ffff-c-pppp-d-cd",
  "abcjs-synth-flattener-45-segno-f-d2",
  "abcjs-synth-flattener-46-c8-1-d8-2-e8-3-f8",
  "abcjs-synth-midi-01-midi-options",
  "abcjs-synth-midi-02-staccato",
  "abcjs-synth-midi-03-percmap",
  "abcjs-synth-timing-01-cde-fg-ab-1-bcd-2-efg",
  "abcjs-synth-timing-02-score-1-2",
  "abcjs-synth-timing-03-cd-e-f-3gab-ac",
  "abcjs-synth-timing-04-cd-e-f-3gab-ac",
  "abcjs-synth-timing-05-subtitle-crash",
  "abcjs-synth-timing-06-repeat-at-start-of-line-crash",
  "abcjs-synth-timing-07-skip-ties-crash",
  "abcjs-synth-timing-08-tie-repeat-crash",
  "abcjs-synth-timing-09-f-c-2d-2-e-4-g-6-a-2-g-4-e-4",
  "abcjs-synth-timing-10-stretchlast-1",
  "abcjs-synth-timing-11-stretchlast-1",
  "abcjs-synth-timing-12-stretchlast-1",
  "abcjs-visual-decorations-01-score-s-a-b",
  "abcjs-visual-directives-01-incipit-test",
  "abcjs-visual-layout-01-barlabelfont-times-bold-18-box",
  "abcjs-visual-layout-02-barlabelfont-times-bold-18-box",
  "abcjs-visual-layout-03-cdef-cdef",
  "abcjs-visual-layout-04-score-s-a",
  "abcjs-visual-layout-05-c3-abc-cf-3-abc-c3-fa-bc",
  "abcjs-visual-layout-06-staves-1-2-3-4",
  "abcjs-visual-layout-07-v-1-b2-a2",
  "abcjs-visual-layout-08-staffwidth-100",
  "abcjs-visual-layout-09-endings",
  "abcjs-visual-misc-01-barnumbers-1",
  "abcjs-visual-misc-02-title",
  "abcjs-visual-misc-03-jazzchords",
  "abcjs-visual-misc-04-stretchlast",
  "abcjs-visual-misc-05-cccc-d-c-alcoda-dddd-d-c-alfine-eeee-d-s",
  "abcjs-visual-misc-06-title-1bold-0-100-reg-the-tune0",
  "abcjs-visual-misc-06-title-1bold-0-100-reg-the-tune1",
  "abcjs-visual-misc-07-ab-ef-g-d-df-f-d-a-4-c-4",
  "abcjs-visual-misc-08-a2-c2-t-a2t-c2",
  "abcjs-visual-misc-09-begintext",
  "abcjs-visual-misc-10-begintext",
  "abcjs-visual-misc-11-begintext",
  "abcjs-visual-misc-12-b-beambr1-b-bb",
  "abcjs-visual-misc-13-ceg-t-gce-d-f-b-3-dm7-d-te",
  "abcjs-visual-misc-14-tune",
  "abcjs-visual-mouse-click-01-selection-test",
  "abcjs-visual-multi-voice-01-score-top-bottom",
  "abcjs-visual-multi-voice-02-p-c-2b2-z4-f2a2-f4",
  "abcjs-visual-options-01-fonts",
  "abcjs-visual-parsing-01-azzz-e2",
  "abcjs-visual-parsing-02-sx",
  "abcjs-visual-parsing-03-v-1-f",
  "abcjs-visual-parsing-04-v-t-c",
  "abcjs-visual-parsing-05-v-t-c-v-b-a-v-t-d",
  "abcjs-visual-parsing-06-score-t-b",
  "abcjs-visual-parsing-07-score-t-b",
  "abcjs-visual-parsing-08-score-t-b",
  "abcjs-visual-parsing-09-score-t-b",
  "abcjs-visual-parsing-10-song",
  "abcjs-visual-selection-01-selection-test",
  "abcjs-visual-selection-02-g4-q-left-1-4-170-right-a4",
  "abcjs-visual-selection-03-c4",
  "abcjs-visual-slurs-01-score-s-a",
  "abcjs-visual-slurs-02-score-s-a-t-b",
  "abcjs-visual-svg-01-staffwidth-5",
  "abcjs-visual-svg-02-staffwidth-12",
  "abcjs-visual-svg-03-a4",
  "abcjs-visual-svg-per-line-01-selection-test",
  "abcjs-visual-svg-per-line-02-scaled",
  "abcjs-visual-tablature-01-gr",
  "abcjs-visual-tablature-02-g-fg-a-g2-a-very-very-long-chord-d2-cd-f",
  "abcjs-visual-tablature-03-staves-rh-lh",
  "abcjs-visual-tablature-04-barnumbers-1",
  "abcjs-visual-tablature-05-a7-a",
  "abcjs-visual-tablature-06-a7-a",
  "abcjs-visual-tablature-07-staves-rh-lh",
  "abcjs-visual-tablature-08-first",
  "abcjs-visual-tablature-09-f-g",
  "abcjs-visual-tablature-10-f3-a-y",
  "abcjs-visual-tablature-11-f-f",
  "abcjs-visual-tablature-12-b",
  "abcjs-visual-tablature-13-g8-c4-d4-e4-f4",
  "abcjs-visual-tablature-14-c",
  "abcjs-visual-tablature-15-all-element-types",
  "abcjs-visual-tablature-16-g-g-g-g",
  "abcjs-visual-tablature-17-stretchlast",
  "abcjs-visual-tablature-18-a-b",
  "abcjs-visual-tablature-19-d-a-d-g-b-e",
  "abcjs-visual-tablature-20-score-1-2",
  "abcjs-visual-tablature-21-a2-a-a-f-f-f-f-f-e-ee-g-gg-g-k-eb-a2-a2",
  "abcjs-visual-tablature-22-g-cegda",
  "abcjs-visual-tablature-23-gab",
  "abcjs-visual-tablature-24-stretchlast",
  "abcjs-visual-title-01-not-transformed",
  "abcjs-visual-title-02-transformed-the",
  "abcjs-visual-title-03-transformed-the",
  "abcjs-visual-title-04-transformed-a",
  "abcjs-visual-title-05-transformed-an",
  "abcjs-visual-title-06-transformed-a",
  "abcjs-visual-title-07-24-number-transform-the",
  "abcjs-visual-title-08-24-number-transform-a",
  "abcjs-visual-title-09-mal-the-formed",
  "abcjs-visual-title-10-20-subtitles-the",
  "abcjs-visual-transpose-01-f2-f-f-f-f-f2-e2-e-e-e-e-e2-k-ab-f2-f-f-",
  "abcjs-visual-transpose-02-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b-",
  "abcjs-visual-transpose-03-cdef-gabc-c-d-e-f-g-a-b-c-c-d-e-f-g-a-b-",
  "abcjs-visual-transpose-04-transpose-annotations",
  "abcjs-visual-transpose-05-n-c-ab-c-c-c-c-d-d-d-d-e-e-f-f-f-f-g-g-g",
  "abcjs-visual-transpose-06-c-d-e-f-g-a-b-c-cdef-gabc-c-d-e-f-g-a-b-",
  "abcjs-visual-transpose-output-01-transpose-output",
  "abcjs-visual-transpose-output-02-transpose-output",
  "abcjs-visual-transpose-output-03-transpose-output",
  "abcjs-visual-transpose-output-04-transpose-output",
  "abcjs-visual-transpose-output-05-g",
  "abcjs-visual-transpose-output-06-f",
  "abcjs-visual-wrap-01-b-4-c2d2-e3f-gabc-d-e-f-g-marcato-d-e-f-",
  "abcjs-visual-wrap-02-stretchlast-1",
  "abcjs-visual-wrap-03-piano-wrap",
  "abcjs-visual-wrap-04-wrap-quartet",
  "abcjs-visual-wrap-05-score-1-2-3-4",
  "abcts-vskip-tune0",
  "abcts-vskip-tune1",
  "abcts-vskip-tune2",
  "abcts-keywarn-tune0",
  "abcts-keywarn-tune1",
  "abcts-keywarn-tune2",
  "abcts-visualtranspose-tune0",
  "abcts-visualtranspose-tune1",
  "abcts-visualtranspose-tune2",
  "abcts-visualtranspose-tune3",
  /**
   * `abcts-tempo-rung.abc` — the ULP that was invisible because nothing combined a `Q:`
   * with the rest. `verticalExtent` recovered the tempo's reserve by subtracting the font
   * size and abcjs's 2px bump back off the baseline it had just been PLACED at, and the
   * rung now travels with the text as `reserveTopPitch`. Tune 3 carries `%%tempofont`,
   * because the OLD re-derivation depended on the font size and the rung does not.
   */
  "abcts-tempo-rung-tune0",
  "abcts-tempo-rung-tune1",
  "abcts-tempo-rung-tune2",
  "abcts-tempo-rung-tune3",
  /**
   * …and the same sweep over `tests/synth/`, which the visual pass did not cover: three
   * more, all byte-exact on arrival. `synth-y01` is `|:C8|1D8::2E8||F8:|` — a first/second
   * ending inside a double repeat, which nothing else in either corpus writes.
   */
  "abcjs-synth-timing-y02",
  "abcjs-synth-timing-y03",
  "abcjs-synth-synth-y01",
  /**
   * abcjs's OWN TEST INPUTS, the ones its harvester never took. Counting `var abc`
   * declarations per file against the fixtures already here named ~20 absent — nine of them
   * in `multi-voice`, which is where `checkLastBarX` came from. Thirteen of fourteen and all
   * four `tie-slur` tunes were byte-exact on arrival, which is the honest outcome of a
   * corpus sweep; the fourteenth was not, and is the `%%keywarn` row below.
   *
   * ⚠️ **`abcjs-visual-parsing-x10` IS NOT HERE.** It toggles `%%keywarn` three times and
   * closed two real defects (see `Measure.keyChangeKeywarn`), taking the row from 11,498
   * matching bytes to 21,407 of 37,883; what is left is a notehead x one ULP apart —
   * `81.211` against `81.21100000000001` — on the third line of a tune whose first two now
   * agree.
   */
  "abcjs-parse-tie-slur-01-multipart",
  "abcjs-parse-tie-slur-02-chord",
  "abcjs-parse-tie-slur-03-onestaff",
  "abcjs-parse-tie-slur-04-height",
  "abcjs-visual-decorations-x02",
  "abcjs-visual-directives-x01",
  "abcjs-visual-misc-x07",
  "abcjs-visual-multi-voice-x01",
  "abcjs-visual-multi-voice-x02",
  "abcjs-visual-multi-voice-x03",
  "abcjs-visual-multi-voice-x04",
  "abcjs-visual-multi-voice-x05",
  "abcjs-visual-multi-voice-x08",
  // …and `-x10` joined once the key signature's width stopped being `dx` less the gap.
  "abcjs-visual-parsing-x10",
  "abcjs-visual-parsing-x11",
  "abcjs-visual-parsing-x12",
  "abcjs-visual-parsing-x14",
  /**
   * `abcts-start-char.abc` — abcjs's OWN `tests/parse/start-char.test.js` tune, the last
   * unenumerated list's first case. Its emoji chord symbol makes it look like a
   * surrogate-pair test and it is not: what it catches is an opening slur's iteration
   * split. See `tile`'s run walk.
   */
  // ⚠️ Its golden is `abcts-start-char.svg`, not `-tune0`: abcjs's own tune has NO `X:`,
  // so the book holds one tune and `dump-svg.js` writes the single-tune name.
  "abcts-start-char",
  /**
   * `abcts-key-modifiers.abc` — the K: switch's own 31 case labels, which are NOT the V:
   * ones: four defects, and tune 9 gates the rule that decided the fourth — accidentals
   * are a PREFIX, so `K:C =f clef=alto` draws the natural and `K:C clef=alto =f` does not.
   *
   * ✅ **`clef=none` IS HERE NOW, AND IT CLOSED WITHOUT BEING WORKED ON.** This note read:
   * "`none` keeps ONE stem, whose centre is itself `origin + (headInk - half)` and whose
   * drawn edge the emitter rebuilds as `(centre - half) + half` — three operations where
   * abcjs has one sum, `58.604999999999996873` against `58.605000000000003979`", with a
   * failed attempt beside it and the row left open across three handoffs.
   *
   * ⚠️ **THE ROW HAD NO FIXTURE, WHICH IS WHY IT COULD ROT.** Nine control shapes and the
   * family's own spelling are byte-exact — so some later arithmetic landing fixed it and
   * nothing said so, because the only thing carrying the row was prose. It is tune 12 of
   * this fixture now, on the same ratchet as the other twelve. **A ROW WITHOUT A GATE
   * CANNOT REPORT ITS OWN CLOSURE.**
   */
  ...Array.from({ length: 13 }, (_, i) => `abcts-key-modifiers-tune${i}`),
  /**
   * `abcts-clef-midmeasure.abc` — an inline `[K: … clef=]` written INSIDE a measure, which
   * pitched the whole bar in the new clef because `layoutMeasure` was handed the
   * already-advanced `clefInForce`. See `clefLeadsMeasure` in `layout.ts`: "leads the LINE"
   * decides the prefix and is true for every mid-line measure, so it is the wrong question
   * for the clef a measure OPENS in.
   *
   * ⚠️ **THE FIXTURE FOUND TWO MORE THE MOMENT IT WAS A PAGE**, which is what a fixture does
   * that a ladder cannot — the ladder's ten shapes were all one bar and one voice. Both are
   * closed and neither was the defect above: tune11 (a clef mid-BEAM, 30.83px) is
   * `beamDirections` reading the VOICE's clef where abcjs reads the one in force at the
   * note, and tune10 (two voices, 12.78px) is `runningClefBefore` — the clef is a running
   * PARSER value and it leaks across voices.
   *
   * ⚠️ **AND THE FIXTURE'S SECOND HALF (16-22) IS THE THIRD ROUND OF THE SAME LOOP.** A
   * clef change with NOTHING after it was dropped outright — abcjs draws a cautionary
   * `clefs.F` after the last note and the next voice's line opens in it. tune22 is the
   * control that says a trailing KEY change is not this shape.
   */
  ...Array.from({ length: 22 }, (_, i) => `abcts-clef-midmeasure-tune${i}`),
  /**
   * `abcts-lyric-verses.abc` — `w:` lines that do NOT cover every note, which neither
   * corpus writes. Two defects, and both are abcjs doing the un-engraved thing:
   *
   * ⚠️ **THE LANE IS THE FIRST VERSE'S, WHATEVER VERSE THIS NOTE'S FIRST SYLLABLE IS** —
   * `elem.lyric` is the NOTE's own dense array, so a note the first `w:` never reached puts
   * its SECOND verse's syllable on the first ROW. 20.4px, and ours had it "right".
   *
   * ⚠️ **AND THE STRICT `_` IS A DIVIDER, NOT "A HOLD FOLLOWS"** — `a_` prints an
   * underscore and `a _` does not, though both hold the next note (`addWord`'s
   * `div = words[i]`). Tunes 8-10 are the three spellings side by side.
   */
  ...Array.from({ length: 12 }, (_, i) => `abcts-lyric-verses-tune${i}`),
  /**
   * `abcts-inline-fields-and-blocks.abc` — §1(c), (d) and (e) of the 2026-08-26 handoff,
   * which turned out to be two defects and one row that had already closed.
   *
   * **A MID-MEASURE `[Q:]` DRAWS WHERE IT STANDS**, the same rule `[K:]` and `[M:]` already
   * had: abcjs's group order is `note note tempo note note bar` where ours put the tempo at
   * the measure's head. Tunes 1-5.
   *
   * **AND A `%%text` BLOCK BEFORE THE MUSIC SPENDS ITS ROWS ONE AT A TIME, BEFORE
   * `staffSeparation`** — ours walked `15 → +7.56 → +61.33 → +33.77` where abcjs walks
   * `15 → +7.56 → +10.5 → +23.27 → +61.33`. Same total, one ULP of the root `height`.
   * Tunes 11-15. **A SUM CANNOT SEE AN ORDER**, for the fifth time on this branch.
   *
   * ⚠️ **AND (d) WAS ALREADY EXACT** — the left/right annotation spacing the handoff
   * measured at 6.74px closed under one of the day's earlier landings and nothing said so.
   * Tunes 6-10 are its gate now, so it cannot rot again.
   */
  ...Array.from(
    { length: 15 },
    (_, i) => `abcts-inline-fields-and-blocks-tune${i}`,
  ),
  /**
   * `abcts-stafflines-and-modifiers.abc` — a 36-shape SWEEP over territory no earlier sweep
   * had touched (staff-line counts, `%%repeat`, `%%map`/`%%percmap`, `V:` modifiers past
   * `style=`, microtones, `%%MIDI` against the DRAWING, and four feature boundaries) plus
   * the three ladders that closed what it found. **Three defects out of 36 shapes.**
   *
   * ⚠️ **`V:… stafflines=0` DRAWS ALL FIVE AND `K:C stafflines=0` DRAWS NONE.** abcjs's
   * `V:` path is guarded `if (multilineVars.currentVoice.stafflines)`
   * (`abc_parse_music.js:1019`) and `0` is FALSY, where the `K:` path writes
   * `multilineVars.clef.stafflines` outright (`abc_parse_key_voice.js:428`). **Two
   * spellings of one setting that disagree at zero and nowhere else** — and the THIRD time
   * on this branch that a declared 0 is not declared at all.
   *
   * ⚠️ **AND A MID-TUNE `stafflines=` CHANGES THE STAFF AND DRAWS NO CLEF.** A `K:` modifier
   * with no clef NAME beside it still writes the running `multilineVars.clef`, which
   * `startNewLine` copies — but `appendStartingElement('clef', …)` is guarded on
   * `foundClef`. See `Measure.clefChangeSilent`. Ours ignored it entirely and drew five
   * lines for the whole tune.
   *
   * ⚠️ **AND A CENTRED `Z`'S GLYPH `dx` WAS RE-DERIVED**, `(x + mm) - x` against abcjs's
   * carried `mmWidth` — `115.2642034355964` against `115.26420343559641`, on any `Z` with
   * an element before it. An offset is CONSTRUCTED, never recovered.
   */
  ...Array.from(
    { length: 50 },
    (_, i) => `abcts-stafflines-and-modifiers-tune${i}`,
  ),
  /**
   * `abcts-bars-graces-and-groups.abc` — a second 36-shape SWEEP: barlines and repeats,
   * grace-note edge cases, chord symbols, tuplet shapes, `%%score`/`%%staves` grouping,
   * accidental propagation, broken rhythm and page directives. **ONE defect in 36.**
   *
   * ⚠️ **`:|:` IS A RIGHT REPEAT AND A WARNING, NOT A DOUBLE REPEAT.** `getBarLine`'s `:|`
   * case falls through to `{len: 2, token: "bar_right_repeat"}` for anything that is not
   * `]` or `|` (`abc_tokenizer.js:175-203`), so the trailing `:` is left in the stream and
   * re-enters as `{len: 1, warn: "Unknown bar symbol"}`. `:||:` (len 4) and `::` (len 2)
   * ARE doubles and were both already exact — **the three spellings of one barline agree
   * everywhere except the shortest**, which is why a greedy run looked right.
   */
  ...Array.from(
    { length: 41 },
    (_, i) => `abcts-bars-graces-and-groups-tune${i}`,
  ),
  /**
   * `abcts-void-notes-and-stray-ties.abc` — written to close the WARNINGS gate's last row
   * and it named two GEOMETRY defects on the way, which is the argument for writing the
   * ladder rather than the fix.
   *
   * ⚠️ **A DIGIT AFTER A NOTE'S LENGTH AND ITS TRAILING SPACE VOIDS THE WHOLE NOTE.**
   * `getCoreNote` leaves `state = 'broken_rhythm'` after a fraction, and the digit case has
   * no arm for it: `else return null` (`abc_parse_music.js:1194-1210`). `C2 1 D2|` is ONE
   * note in abcjs — the `D` — and three warnings. Ours drew both.
   *
   * ⚠️ **AND A SPLIT TIE TAKES THE 20px STUB WHERE A SPLIT SLUR TAKES THE PREFIX.**
   * `setStartX(this.startlimitelem)` is called only in the branch that opens a SLUR
   * (`abstract-engraver.js:928-930`), so which arm `calcX` reaches is decided by how the
   * curve was WRITTEN — a different question from `isTie`, which is recomputed at draw
   * time from the two pitches. The two agree everywhere except a `-` between DIFFERENT
   * pitches, which abcjs builds as a tie and draws as a slur.
   */
  ...Array.from(
    { length: 15 },
    (_, i) => `abcts-void-notes-and-stray-ties-tune${i}`,
  ),
  /**
   * `abcts-text-udef-parts-overlays.abc` — a third 36-shape SWEEP over `%%text`/`%%center`
   * variants, spacing directives, multi-voice lyric alignment, `U:` redefinitions, `P:`
   * part sequencing and `&` overlay boundaries, plus the two ladders it opened.
   *
   * **31 of the 36 exact.** Every `P:` shape, every `&` overlay shape, every multi-voice
   * lyric shape, `%%staffsep`, `%%sysstaffsep`, `%%musicspace`, `%%topspace` and
   * `%%titlespace` were already right.
   *
   * ✅ **EVERY ROW OF THIS FIXTURE IS CLOSED, AND SO IS THE WHOLE BYTE GATE — 0 of 635.**
   *
   * ✅ **(a) AN EMPTY `%%text` DRAWS NOTHING AND MOVES TWICE THE FONT SIZE — CLOSED, AND IT
   * WAS THREE CHANGES.** `FreeText`'s first arm is `if (text === "")
   * rows.push({move: font-size * 2})` with no text row beside it (`free-text.js:8-10`), so
   * a BLANK row is TALLER than a full one: 8.23px each.
   *
   * ⚠️ Spending it ALONE takes the page 42px SHORT, because the `heading` element was built
   * only for a block with INK — an inkless one produced no `musicOnlyTop`, `walksTopBlock`
   * was false, and the page walked straight past it. ⚠️ And keying that guard on
   * `block.height` instead is TOO BROAD: the height carries the unconditional
   * `spacing.music`, so every tune in the corpus got a zero-size heading element and six
   * visual baselines moved. `blockHasRows` is the narrower question.
   *
   * ⚠️ **AND AN EMPTY `%%center` IS THE OTHER ARM AND COSTS NOTHING.** `addCentered` pushes
   * an ARRAY, so `info.text` is undefined and `FreeText` falls past that first branch to its
   * final `else`, which measures the empty string. **Two spellings of "nothing to say" that
   * differ by 42px**, and the array is the whole reason.
   *
   * ✅ **(b) A `%%vskip` BEFORE A `%%text` IS THAT BLOCK'S FIRST ROW — CLOSED.**
   * `pushLine` stamps a pending vskip onto whatever LINE comes next, text lines included,
   * and `FreeText(info, vskip)` pushes `{move: vskip}` ahead of everything
   * (`tune-builder.js:904-908`, `free-text.js:5-6`). Ours held it on the SYSTEM, so it was
   * spent AFTER the text: the page TOTAL was right to the digit on every rung and the text
   * sat 20px high. **A SUM CANNOT SEE AN ORDER**, sixth time. `%%text` then `%%vskip` is
   * exact either way, which is what says the rule is the ORDER rather than the number.
   *
   * ✅ **AND THE RUNG IT LEFT OPEN IS CLOSED TOO, AS TWO MORE RULES.** A `%%vskip` before a
   * mid-tune `T:` was 44px, not 20 — so it was never the vskip:
   *
   * **A `T:` AFTER `K:` BUT BEFORE ANY NOTE IS A TOP-BLOCK SUBTITLE.** `addSubtitle` is a
   * bare `pushLine(tune, {subtitle})` (`tune-builder.js:298-300`), so a subtitle is placed
   * by WHERE ITS LINE LANDS, and that one is line 0 — ahead of the staff. Ours tested
   * `bodyStarted`, which the `K:` itself sets, and put it BELOW the music: abcjs draws it at
   * y 80.34 against our 165.13. `musicStarted` is the narrower flag and already existed.
   *
   * **AND A `%%vskip` BEFORE A SUBTITLE IS CONSUMED AND THROWN AWAY.** `pushLine` stamps it
   * on the line like any other, but the controller builds `new Subtitle(spacing.subtitle,
   * …)` with **no vskip argument** (`engraver-controller.js:239`) where the FreeText arm one
   * line below takes one, and `draw()`'s `if (abcLine.vskip)` fires only for a line with a
   * `staff`. MEASURED: abcjs's page is byte-identical with and without the directive.
   * **The consuming is the point** — left pending it goes to the STAFF instead.
   *
   * ✅ **AND THE CLOSE DECORATION'S ONE ULP IS CLOSED TOO** — `getYCorr` joins the PITCH in
   * abcjs and the LENGTH here, and `PlacedGlyph.drawPitch` IS the field. A note here said
   * it was not: the value passed had been `toStep(closeY)` where the emitter wants an abcjs
   * PITCH, and the 23.25px that produced is `PITCH_ORIGIN * spacePerStep` exactly.
   * **A number that is exactly one constant is a unit error, not a rebuttal.**
   *
   * ✅ **AND TUNE 34 — a `%%text` between two VOICES — WAS TWO DEFECTS STACKED.** Its ULP
   * of root height was the TRAILING BLOCK'S ROWS being summed instead of spent one at a
   * time; and behind that, masked by it, the staff line ran to 219.76 where abcjs runs it
   * to 685. **A BLOCK WRITTEN INSIDE THE SYSTEM COUNTS AS TRAILING**, so the line is not
   * the LAST line and abcjs justifies it — `score.textBelow` never saw that one because it
   * lands in `blocksAfterLastSystem`. Three rungs, and only the middle one moved.
   *
   * ✅ **AND `[U:n=!accent!]` IS A MODE SPLIT NOW — tunes 43 and 44.** abcjs has no inline
   * `U:` at all: `letter_to_inline_header` switches on exactly eight, `[I: [M: [K: [P: [L:
   * [Q: [V: [r:` (`abc_parse_header.js:347-410`), so it reads the `[` as a CHORD, fails,
   * and emits seven warnings, an invisible barline carrying the `!accent!`, and four plain
   * notes. **Strict reproduces that; `abc2.1` and `extended` keep the feature.** Owner's
   * ruling, 2026-08-27 — see `Docs/ABCJS-DIFFERENCES.md`.
   */
  ...Array.from(
    { length: 56 },
    (_, i) => `abcts-text-udef-parts-overlays-tune${i}`,
  ),
  /**
   * `abcts-staffnonote-and-directives.abc` — abcjs's DIRECTIVE SWITCH enumerated against our
   * parser, which named **18 directives this parser never mentions**, plus the ladder the
   * one live defect earned. Seventeen of the eighteen were already byte-exact
   * (`%%measurebox`, `%%titlecaps`, `%%fontboxpadding`, `%%voicescale`, `%%deco`,
   * `%%headerfont`, `%%footerfont`, `%%landscape`, `%%papersize`, the four `%%-` info
   * fields and the three tab fonts) — **"never mentioned" is not "not implemented"**, and
   * enumerating the reference is what tells the two apart.
   *
   * ✅ **`%%staffnonote 0` DROPS EVERY STAFF THAT HOLDS NOTHING BUT RESTS**, and the sense
   * of the boolean is INVERTED — abcjs's own comment says so. See `Score.staffNoNote`.
   * A rest carrying a CHORD SYMBOL keeps its staff; a bare rest does not; and a tune whose
   * every voice is rests keeps no staff at all and falls to the "no note and no barline"
   * line deletion, which is what gets its 37.56px page right.
   *
   * ⚠️ **TUNE 4 IS OPEN AND IS NOT THIS DIRECTIVE.** `%%score (1 2)` with one note-voice and
   * one rest-voice reserves 29.185px more below than abcjs does — **every glyph is at an
   * identical position in both engines**, so it is a RESERVE and nothing else. Measured with
   * and without `%%staffnonote`, and with both voices noted and both rested: only this pair
   * moves. `addRestToAbsElement` puts a multi-voice rest at pitch 3 or 11 and `createNoteHead`
   * declares its box from that same pitch (`abstract-engraver.js:544-612`), so the drawn
   * position agreeing while the extent does not says our extent measures the INK.
   */
  ...[0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(
    (i) => `abcts-staffnonote-and-directives-tune${i}`,
  ),
  // …and the two tunes whose `extractMeasures` CRASHES abcjs, split into their own file so
  // that gate's `DIVERGENT` list can name them. Their SVG is exact — see there.
  "abcts-staffnonote-empty-staves-tune0",
  "abcts-staffnonote-empty-staves-tune1",
  /**
   * `abcts-voice-style.abc` — `V:… style=`, the first of the three modifiers the V:
   * enumeration left as a FEATURE. All five shapes, one voice each.
   *
   * ⚠️ **ONE VOICE ON PURPOSE.** abcjs's `this.style` leaks into every voice engraved after
   * the one that set it — `pushCrossLineElems` saves the colour and the scale per voice and
   * not the style — and that is a running value in engraving order, which this parser does
   * not model. See the `V:` arm's `ponytail:`.
   */
  "abcts-voice-style-tune0",
  "abcts-voice-style-tune1",
  "abcts-voice-style-tune2",
  "abcts-voice-style-tune3",
  "abcts-voice-style-tune4",
  /**
   * `abcts-midi.abc` — all 53 `%%MIDI` sub-commands abcjs's eleven `midiCmdParam*` tables
   * name, one tune each, plus a negative parameter, a spaced fraction and a `/`-bearing
   * drum pattern. NOT ONE OF THEM MOVES THE DRAWING, which is the honest outcome of the
   * only enumeration so far aimed at a non-SVG surface: the two defects it found are
   * `tune.formatting.midi` VALUES and the `formatting` gate is what states them.
   */
  ...Array.from({ length: 56 }, (_, i) => `abcts-midi-tune${i}`),
  /**
   * `abcts-voice-modifiers.abc` — three of the four defects the V:-modifier enumeration
   * itself found: `^8`/`_8` as clef octave suffixes (abcjs takes any of `- + ^ _` before
   * an `8`), `cl=` as `clef=`, and the staff-connecting rule starting at the FIRST staff's
   * own top line rather than at pitch 10. Tune 4 is the one-line exception, which keeps
   * the full span.
   */
  "abcts-voice-modifiers-tune0",
  "abcts-voice-modifiers-tune1",
  "abcts-voice-modifiers-tune2",
  "abcts-voice-modifiers-tune3",
  "abcts-voice-modifiers-tune4",
  /**
   * `abcts-last-bar.abc` — `checkLastBarX`, found by the V:-modifier enumeration's own
   * CONTROL rather than by any modifier: a voice that runs out of music early left its
   * closing rule hanging 30px short. Tune 2 is the one that gates abcjs's one-directional
   * forward pass — three voices, the LONGEST in the middle, so the first keeps its short
   * bar and only the third is pushed. Tune 3 is the equal-length control.
   */
  "abcts-last-bar-tune0",
  "abcts-last-bar-tune1",
  "abcts-last-bar-tune2",
  /**
   * `abcts-decorations.abc` — the three `!…!` names abcjs's own decoration tables hold and
   * this engine got wrong, found by rendering every one of the 96 through both engines:
   * `slide`'s EXTENT (its curve was byte-exact and its reserve was missing), `~(`/`~)` as
   * an alias of `glissando(`/`glissando)`, and a glissando's inset, which is half the
   * ELEMENT's width and not half the notehead's — so tunes 4 and 5 put a dot and a beam on
   * the anchor, the two other things that move `abselem.w`.
   *
   * ⚠️ **`!glissando)!` AND `!~)!` WITH NOTHING OPEN CRASH abcjs** — `drawGlissando` reads
   * `params.anchor1.heads[0]` after logging "Glissando Element not set" and carrying on
   * (`draw/glissando.js:6-10`). There can be no golden for either, so neither is here.
   */
  "abcts-decorations-tune0",
  "abcts-decorations-tune1",
  "abcts-decorations-tune2",
  "abcts-decorations-tune3",
  "abcts-decorations-tune4",
  "abcts-decorations-tune5",
  /**
   * `abcts-directives-2.abc` — the SEVEN more that move abcjs's output only in a shape that
   * can reach them: a subtitle, a composer, a `W:`, four bars, a beam, a grace group.
   * `%%topspace` is the eighth and is PRINT-only, so no screen golden can gate it.
   */
  "abcts-directives-2-tune0",
  "abcts-directives-2-tune1",
  "abcts-directives-2-tune2",
  "abcts-directives-2-tune3",
  "abcts-directives-2-tune4",
  "abcts-directives-2-tune5",
  /**
   * `abcts-directives.abc` — the TEN directives abcjs's own switch names, this parser never
   * mentioned, and that MOVE its output. Measured by rendering one tune through abcjs with
   * and without each of the forty-one absent ones: thirty-one are inert in that shape.
   *
   * ✅ **`abcts-directives-tune4` (`%%stafftopmargin`) IS HERE — THE LAST BYTE ROW.** It
   * had been open since 2026-08-21, filed as "the deferred y-versus-pitch refactor", and a
   * four-rung ladder is what located it: `0` with a title is exact, `12` and `30` are not,
   * and `30` WITHOUT a title is exact. So it was the margin, and only on the branch that
   * carries a heading block.
   *
   * abcjs puts the margin on the STAFF — `staff.top += renderer.spacing.staffTopMargin /
   * spacing.STEP` (`set-upper-and-lower-elements.js:92`) — where `calcHeight` sums it in
   * PITCH and multiplies by `STEP` once. Ours took the music-only extent without it, so it
   * lived in `blockSpan`, a LENGTH, and the height recovered it divided back and
   * re-multiplied.
   *
   * ⚠️ **AND THE REMAINDER IS WHY THREE EARLIER ATTEMPTS EACH DID NOTHING.**
   * `originAdvances` closes on `rest = flat - named - topPitch * STEP`, so moving ONE term
   * is absorbed there and the page is unchanged — or doubled, when the term is also added
   * somewhere else. All four move together now: the block's lead loses the margin, the
   * staff's origin gains it as a pitch, `topTerm` gains it, and the remainder is told
   * about it. **WHEN A DECOMPOSITION HAS A BALANCING TERM, EVERY PART MOVES OR NONE DOES.**
   */
  "abcts-directives-tune0",
  "abcts-directives-tune1",
  "abcts-directives-tune2",
  "abcts-directives-tune3",
  "abcts-directives-tune4",
  "abcts-directives-tune5",
  "abcts-directives-tune6",
  "abcts-directives-tune7",
  "abcts-directives-tune8",
  "abcts-directives-tune9",
  // `abcts-ledger-gaps-4.abc` — six more, and NOT ONE was a defect: lyrics under the SECOND
  // system with dynamics on both, a hairpin across a system break, a third-tone microtone,
  // two verses where one holds a blank syllable, a voice whose lowest note is not its last,
  // and a key change on a line that wraps. Every one was byte-exact on the first run, which
  // is what turns six `ponytail:` predictions into measurements.
  "abcts-ledger-gaps-4-tune0",
  "abcts-ledger-gaps-4-tune1",
  "abcts-ledger-gaps-4-tune2",
  "abcts-ledger-gaps-4-tune3",
  "abcts-ledger-gaps-4-tune4",
  "abcts-ledger-gaps-4-tune5",
  // `abcts-ledger-gaps-3.abc` — eight more, and FIVE were defects: `%%abc-copyright` and
  // its siblings drew no rows at all, a slur closing on ONE HEAD of a chord never paired, a
  // curve crossing a system it does not end on got no arc, and the below-annotation lane's
  // reserve round-tripped through pixels for one ULP of the page.
  "abcts-ledger-gaps-3-tune0",
  "abcts-ledger-gaps-3-tune1",
  "abcts-ledger-gaps-3-tune2",
  "abcts-ledger-gaps-3-tune3",
  "abcts-ledger-gaps-3-tune4",
  "abcts-ledger-gaps-3-tune5",
  "abcts-ledger-gaps-3-tune6",
  "abcts-ledger-gaps-3-tune7",
  // `abcts-ledger-gaps-2.abc` — eight more, and FIVE were real defects: a key signature on
  // a TENOR clef sat an octave high, a chord's dots were bumped apart where abcjs lets them
  // coincide, a below annotation landed inside the lyric block, a percussion chord took one
  // head glyph for every pitch, and a mid-measure `[K:… clef=]` was read as the whole line's.
  "abcts-ledger-gaps-2-tune0",
  "abcts-ledger-gaps-2-tune1",
  "abcts-ledger-gaps-2-tune2",
  "abcts-ledger-gaps-2-tune3",
  "abcts-ledger-gaps-2-tune4",
  "abcts-ledger-gaps-2-tune5",
  "abcts-ledger-gaps-2-tune6",
  "abcts-ledger-gaps-2-tune7",
  // `abcts-ledger-gaps.abc` — six shapes the `ponytail:` LEDGER named, each under a note
  // saying no fixture writes one. THREE WERE REAL DEFECTS: `%%scale` was unmodelled, a
  // chord symbol inside the brackets did not end the chord, and a microtone inside them was
  // read as a plain accidental. All six are byte-exact.
  "abcts-ledger-gaps-tune0",
  "abcts-ledger-gaps-tune1",
  "abcts-ledger-gaps-tune2",
  "abcts-ledger-gaps-tune3",
  "abcts-ledger-gaps-tune4",
  "abcts-ledger-gaps-tune5",
  // `abcts-model-gaps.abc` — the three shapes `HANDOFF-2026-08-20.md` §2 named. Two were
  // already exact and are here to SAY SO; the other two named the inline-font rule.
    // `abcts-model-gaps.abc` — the three shapes `HANDOFF-2026-08-20.md` §2 named. Two were
  // already exact and are here to SAY SO; the other two named the inline-font rule.
  "abcts-model-gaps-tune0",
  "abcts-model-gaps-tune1",
  "abcts-model-gaps-tune2",
  "abcts-model-gaps-tune3",
  "abcts-model-gaps-tune4",
  "abcts-model-gaps-tune5",
  "abcts-model-gaps-tune6",
  "abcts-model-gaps-tune7",
  "abcts-model-gaps-tune8",
];

interface Diff {
  /** Bytes that matched before the first difference — bigger is closer. */
  readonly matched: number;
  readonly where: string;
}

/** The first differing byte, with enough either side to name the construct. */
function firstDifference(got: string, want: string): Diff | null {
  const n = Math.min(got.length, want.length);
  let i = 0;
  while (i < n && got[i] === want[i]) i += 1;
  if (i === n && got.length === want.length) return null;
  const from = Math.max(0, i - 40);
  return {
    matched: i,
    where:
      `byte ${i} of ${want.length}\n` +
      `      got  …${got.slice(from, i + 60).replace(/\n/g, "⏎")}\n` +
      `      want …${want.slice(from, i + 60).replace(/\n/g, "⏎")}`,
  };
}

/**
 * THE SAME PARAMS THE GOLDENS WERE MADE WITH. `dump-svg.js` renders every one at
 * `{ staffwidth: 670 }`, and abcjs's own padding takes that to a 700px page — comparing
 * against a default render would differ on the very first attribute for a reason that is
 * about the harness rather than the engine.
 */
function run(c: Case): Diff | null {
  return firstDifference(
    renderAll(c.abc, { staffwidth: 670 })[c.tune]?.svg ?? "",
    c.golden,
  );
}

describe("strict SVG vs abcjs, byte for byte", () => {
  it("writes the ranked table", () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null;
      try {
        diff = run(c);
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` };
      }
      return { slug: c.slug, diff, n: c.golden.length };
    });
    const off = rows.filter(
      (r) => r.diff !== null && !DIVERGENT.includes(r.slug),
    );
    const text = [
      `${off.length} of ${rows.length} fixtures differ from abcjs`,
      `${DIVERGENT.length} ruled divergent — see Docs/ABCJS-DIFFERENCES.md`,
      "",
      ...off
        .sort((a, b) => (b.diff?.matched ?? 0) - (a.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(38)} ${String(r.diff?.matched).padStart(6)}/${r.n} ok  ${r.diff?.where}`,
        ),
    ].join("\n");
    writeFileSync("/tmp/abcts-svg-bytes-ranked.txt", `${text}\n`);
    expect(rows.length).toBe(CASES.length);
  });

  for (const slug of PASSING) {
    it(`is byte-exact — ${slug}`, () => {
      const c = CASES.find((x) => x.slug === slug);
      if (c === undefined) throw new Error(`no such case ${slug}`);
      expect(run(c)?.where ?? null).toBeNull();
    });
  }
});
