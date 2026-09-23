/**
 * **OPEN ROWS OF THE TUNE-OBJECT ORACLES — measured, named, NOT fixed.** 2026-09-22.
 *
 * The abcjs 6.7.1 re-harvest ran every tune-object harvester over the whole fixture
 * directory, and the oracles had been standing still since they were written: `lines`,
 * `deline`, `parse-only`, `parse-values`, `render-values`, `formatting`, `metatext`,
 * `toptext` were harvested at 507 tunes, `sequence` at 213, `accessors` at 293 — while the
 * directory had grown to 822 tunes with the `abcts-*` control ladders. **315 tunes had
 * never been asked these questions**, and the rows below are what they answered. None of
 * them is a 6.7.1 change (every row common to old and new golden is unchanged); every one
 * is a latent divergence on a hand-written control — a mid-measure clef in `tune.lines`, a
 * `%%stafflines` / `%%staffnonote` staff, a tie into a rest, a `%%vskip` / `%%text` line
 * row, the ruled `clef=x` marker.
 *
 * Each gate keeps its "the WHOLE corpus agrees" assertion over everything not named here,
 * and asserts that every row named here STILL differs — so a row cannot rot: fix it and
 * the gate tells you to delete the name. The plain-language table is
 * `Docs/PARITY-STATUS.md` §3b. The suffix `#breaks` (deline) is a case of the same tune.
 *
 * ✅ **`unknown-clef` IS GONE FROM EVERY LIST — CLOSED 2026-09-22, and it was ONE FACT
 * SHOWING AS TWO DIVERGENCES ACROSS FOUR GATES.** `fixClef` rewrites `clef.type` from
 * `clefLines` and assigns `clefPos` INSIDE THE SAME `if (value)`
 * (`abc_parse_key_voice.js:75-81`), so a name it does not know keeps the token the parser
 * assembled — letters, digit and any `±8` — and gets no `clefPos` at all. This engine fell
 * back to `treble` and assigned 4. The written token travels on `Clef.name` now.
 *
 * ⭐ That is what the family grouping was worth: five tunes × four gates were one lookup,
 * and the shared prefix predicted it. ⚠️ It does NOT follow that the other families are one
 * cause each — that is the same untested assumption, and it is only cheap to check.
 *
 * ✅ **`clef-midmeasure` IS GONE FROM EVERY LIST — CLOSED 2026-09-22, AND IT WAS THE FIRST
 * FAMILY TO HOLD TWO CAUSES.** The warning above earned itself immediately.
 *
 *   1. **A `K:` WRITTEN AFTER THE LAST MUSIC STILL PUBLISHES ITS ELEMENTS.** A change with
 *      no following measure had nothing to ride, so the projection published NEITHER the
 *      `clef` nor the `key` abcjs appends. `Measure.trailingKey` joins `trailingClef`, and
 *      the merge has to re-assert `drawnName`'s answer or `keyElement`'s own `el_type`
 *      takes it back. ⚠️ **AND THE DRAWING WAS ALREADY RIGHT** — abcjs draws the cautionary
 *      clef and no trailing key at all — which is why `svg-bytes` agreed throughout and the
 *      parser's own comment said this shape "needs nothing, measured". It had measured the
 *      INK. The parse tree is a second surface.
 *   2. **THE CLEF IS ONE TUNE-LEVEL VARIABLE AND EVERY VOICE SHARES IT.** `startNewLine`
 *      reads `multilineVars.staves[staffNum].clef` only for a staff that DECLARED one and
 *      otherwise falls through to `multilineVars.clef` (`abc_parse_music.js:961`), which
 *      every `K:`/`[K: clef=]` overwrites in READING ORDER whatever voice it stands in. So
 *      `V:1 CD[K:C bass]EF|` then `V:2 GABc|` opens voice 2 in BASS and its notes read
 *      `verticalPos` 16-19. Ours seeded each voice from the HEADER's clef, in two places —
 *      the staff furniture and `workingClef` — and fixing one left every note 12 pitch out
 *      with the staff already right, which is how the second half was found.
 *
 * ⚠️ **AND THE FIRST CAUSE CLOSED THREE GATES AND TOOK A FOURTH THE OTHER WAY.** Hard-coding
 * the trailing key's name to `key` made `parseOnly` agree and `deline` — which RENDERS —
 * disagree, because abcjs's engraver really does rename it. One override answered both.
 * `tests/clef-midmeasure.test.ts` is the control ladder, and every rung was checked against
 * its own deliberate break.
 */

const stafflines = (n: number[]) =>
  n.map((i) => `repo/abcts-stafflines-and-modifiers-tune${i}`);
const staffnonote = (n: number[]) =>
  n.map((i) => `repo/abcts-staffnonote-and-directives-tune${i}`);
const emptyStaves = (n: number[]) =>
  n.map((i) => `repo/abcts-staffnonote-empty-staves-tune${i}`);
const voidNotes = (n: number[]) =>
  n.map((i) => `repo/abcts-void-notes-and-stray-ties-tune${i}`);
const textUdef = (n: number[]) =>
  n.map((i) => `repo/abcts-text-udef-parts-overlays-tune${i}`);
const withBreaks = (slugs: string[]) => slugs.flatMap((s) => [s, `${s}#breaks`]);

export const OPEN = {
  lines: [...emptyStaves([0, 1]), ...staffnonote([0, 5, 7]), ...stafflines([4, 41, 42])],
  deline: withBreaks([
    ...stafflines([4, 15, 41, 42]),
    ...staffnonote([5]),
    ...textUdef([30, 34]),
  ]),
  parseOnly: [
    ...stafflines([4, 15, 41, 42]),
    "repo/abcts-endings-tune5",
    "repo/abcts-rests-and-bars-tune1",
    ...staffnonote([0, 5, 7]),
    ...voidNotes([0, 1, 4, 7, 8, 9, 10, 11, 12, 13]),
  ],
  parseValues: [
    "repo/abcts-endings-tune5",
    "repo/abcts-rests-and-bars-tune1",
    ...stafflines([4, 15, 41, 42]),
    ...staffnonote([0, 5, 7]),
    ...emptyStaves([0, 1]),
    ...textUdef([2, 7, 30, 34, 37, 38, 39, 45, 47, 48, 49, 54]),
    ...voidNotes([0, 1, 4, 7, 8, 9, 10, 11, 12, 13, 14]),
  ],
  renderValues: [
    "repo/abcts-endings-tune5",
    "repo/abcts-rests-and-bars-tune1",
    "repo/abcts-rests-and-bars-tune14",
    ...stafflines([4, 15, 41, 42]),
    ...staffnonote([0, 5, 7]),
    ...emptyStaves([0, 1]),
    ...textUdef([2, 7, 30, 34, 36, 37, 38, 39, 45, 47, 48, 49, 54]),
    ...voidNotes([0, 1, 4, 7, 8, 9, 10, 11, 12, 13, 14]),
  ],
  /** `sequence` is keyed by FIXTURE, not tune. */
  sequence: ["abcts-void-notes-and-stray-ties"],
  /** `accessors`: `slug field`. */
  accessors: [
    "repo/abcts-tempo-rung-tune2 pickupLength",
    "repo/abcts-grace-order-and-lanes-tune15 totalTime",
    "repo/abcts-grace-order-and-lanes-tune15 totalBeats",
    "repo/abcts-inline-fields-and-blocks-tune2 totalTime",
    "repo/abcts-inline-fields-and-blocks-tune2 totalBeats",
    "repo/abcts-rests-and-bars-tune14 totalTime",
    "repo/abcts-rests-and-bars-tune14 totalBeats",
    "repo/abcts-stafflines-and-modifiers-tune34 totalTime",
    "repo/abcts-stafflines-and-modifiers-tune34 totalBeats",
  ],
} satisfies Record<string, readonly string[]>;

/** The rows named OPEN that AGREE — each one is a fix that needs its name deleted. */
export const quietlyClosed = (
  open: readonly string[],
  rows: readonly { slug: string; agree: number; total: number; diffs?: readonly unknown[] }[],
): string[] =>
  rows
    .filter((r) => open.includes(r.slug) && r.agree === r.total && (r.diffs?.length ?? 0) === 0)
    .map((r) => r.slug);
