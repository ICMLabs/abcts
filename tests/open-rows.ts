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
 * `Docs/PARITY-STATUS.md` §3b. The suffix `#breaks` (deline) was a case of the same tune —
 * `withBreaks` is gone with the last deline row.
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
 *
 * ✅ **AND THE TIE FAMILIES ARE GONE TOO — CLOSED 2026-09-22, TWELVE TUNES AND A WHOLE
 * `sequence` FIXTURE ON ONE DATA TYPE.** `abcts-void-notes-and-stray-ties` (11 tunes),
 * `abcts-endings-tune5` and `abcts-rests-and-bars-tune1` were named separately and are one
 * rule: **abcjs's `isInTie` IS A BOOLEAN** (`abc_parse_music.js:93-103`, `:529-538`). It
 * lands on the very next element whatever that element holds — a different pitch, or a
 * REST — and steps over exactly one thing, a SPACER. This engine matched on PITCH, which
 * is the same answer for ordinary music and a different one for every rung of
 * `tests/stray-tie.test.ts`.
 *
 * ⭐ **AND THE GRACE PATH HAD ALREADY PORTED IT**, under a note in `Note.startTie` saying
 * in as many words that "the carry is positional and nothing compares them". A rule ported
 * at the site that named it is not a rule ported.
 *
 * The second half is `Note.tieLeading`: a `-` written BEFORE a note sets `el.endTie` on the
 * element being built (`:1221-1226`) and `setIsInTie` runs from it **above the
 * `core !== null` guard** (`:494-496`), so even a FAILED attempt — `C2 -1 D2|`, whose C
 * both engines discard — leaves the flag set for the next note.
 *
 * ⚠️ **AND TWO RUNGS ARE MEASURED AND DELIBERATELY NOT LANDED**, as `it.fails` so they
 * cannot rot: a rest can OPEN a tie (`z-C|`), and abcjs's tie-back does not cross a line
 * break where ours does. ⚠️ **A THIRD IS MEASURED AND UNEXPLAINED**: a leading `-` before
 * a REST is swallowed whole (`-z C|` marks neither) though the source says it should not,
 * and `markTieEnds` carries a guard saying exactly that.
 *
 * ✅ **AND `%%staffnonote` AND `%%stafflines`/VOICE-MODIFIERS WENT WITH THEM — ALL FOUR
 * TRIAGED FAMILIES SHUT ON 2026-09-22, AND `lines` AND `parseOnly` ARE EMPTY LISTS.**
 *
 *   • **`%%staffnonote 0` DELETES A STAFF FROM `tune.lines`, not only from the page**
 *     (`tune-builder.js:70-93`) — one per-line filter closed five tunes across four gates
 *     and TWO fixture families, `-and-directives` and `-empty-staves`. A rest carrying a
 *     CHORD SYMBOL keeps its staff (`:896-902`), which is why it cannot be "has a note".
 *   • **A `K:` THAT NAMES NO CLEF APPENDS NO CLEF ELEMENT** — `foundClef` is set in the
 *     clef-NAME arm alone (`abc_parse_key_voice.js:513-516`), so `[K:C stafflines=1]`
 *     changes the staff and says nothing in the stream.
 *   • **abcjs's V: SWITCH HAS NO `default:` ARM — IT IS COMMENTED OUT** (`:828-830`), so an
 *     attribute it does not know is dropped WITHOUT ITS VALUE and the value is read as a
 *     token of its own. That, and not the spelling, is why `V:1 gstem=up` sets the stem:
 *     `zzz=up` and `xstem=up` do it too, with no warning. ⚠️ **MEASURED — the source
 *     predicts a warning and no stem.**
 *
 * ✅ **AND THE `%%vskip` / `%%text` LINE-ROW FAMILY IS DOWN TO ONE ROW — 2026-09-23.**
 * Twelve of its thirteen tunes on five rules, and with them `tune.lines`, `parseOnly`,
 * `parseValues` and `deline` are EXACT over the whole corpus:
 *
 *   • **A PENDING `%%vskip` RIDES THE VERY NEXT LINE, WHATEVER KIND IT IS** — `pushLine`
 *     stamps `hash.vskip` before it pushes (`tune-builder.js:904-908`), so a text row, a
 *     `%%center`, a `%%begintext`, a `%%sep` and a mid-tune `T:` all take it and the STAFF
 *     below gets none. ⚠️ **AND A SUBTITLE CARRIES IT WITHOUT SPENDING IT** — no vskip
 *     argument reaches `Subtitle` (`engraver-controller.js:239`), so the page is
 *     byte-identical while `tune.lines` publishes the number. The repo had recorded the
 *     PAGE half of that and called it "thrown away".
 *   • **A `%%text` SPAN IS ARITHMETIC, NOT THE LINE** — `iChar + restOfString.length + 7`
 *     over the TRIMMED tail (`abc_parse_directive.js:983`), so a bare `%%text` spans SEVEN
 *     characters where the line is six.
 *   • **A BLOCK WRITTEN INSIDE A SYSTEM COMES OUT AFTER IT**, because the staff line was
 *     pushed when the system opened.
 *   • **AND THE `&` MARKER SORTS AHEAD OF THE LAYER'S FIRST ELEMENT, NOT ITS FIRST EVENT**
 *     — a note's span opens at whatever was written FOR it, so `&"C"GABc|` builds its `G`
 *     four characters early and `resolveOverlays` snipped one element late.
 *
 * ⚠️ **ONE RUNG MEASURED AND NOT LANDED**: `%%newpage` takes the pending vskip too; no
 * fixture writes that pair, so it is an `it.fails` rather than two more model fields.
 *
 * ✅ **AND THE LAST ROW OF THAT FAMILY WENT WITH THE EMPTY `%%center` — SO EVERY
 * TUNE-OBJECT GATE IS AT ZERO BUT THE RULED DIVERGENCE.** An empty `%%center` publishes a
 * ROW and draws NOTHING: its text reaches `FreeText` as an ARRAY, so it falls past every
 * `text === ""` arm to the final `else`, which writes a row and moves
 * `getTextSize.calc('')` — zero — and `nonMusic`'s own arm is
 * `else if (row.text || row.phrases)` (`draw/non-music.js:12`), a JS FALSY test that never
 * draws it. **Ours swallowed the row AND drew the text**: two errors in opposite
 * directions, which is why the page height agreed and `svg-bytes` stayed green until the
 * row started being published — and then went red the same minute, which is the gate doing
 * its job. Three pieces: the layout publishes the row and spends 0, the `\u00A0`
 * substitution is narrowed to a `%%begintext` block (where `renderText`'s
 * `^\n` → `\xA0\n` rule actually fires), and the emitter drops both the text and the
 * `<g>` when nothing is drawn.
 *
 * ⭐ **AND THE SESSION'S RULE IS THAT THREE OF THE FOUR FAMILIES WERE RULES THIS REPO HAD
 * ALREADY PORTED, AT THE SITE THAT NAMED THEM.** The renderer knew `%%staffnonote` and
 * `Measure.clefChangeSilent`; the grace path knew the tie carry was positional. Each was
 * written once, where one surface needed it, and the projection had no share of it. When a
 * tune-object row looks like a missing feature, grep this repo for the rule first.
 */


export const OPEN = {
  lines: [] as readonly string[],
  deline: [] as readonly string[],
  parseOnly: [] as readonly string[],
  parseValues: [] as readonly string[],
  /**
   * ⚠️ **THE ONE ROW LEFT ANYWHERE, AND IT IS THE RULED DIVERGENCE OF §3** —
   * `abcts-rests-and-bars-tune14` is a note longer than a breve, which abcjs marks with a
   * red DEBUG STRING in its shipped output (`chartable.note` running out one entry past
   * it). We decline to reproduce an internal error message as music, so the note's
   * `pitches`/`minpitch`/`maxpitch`/`averagepitch` differ by construction.
   */
  renderValues: ["repo/abcts-rests-and-bars-tune14"],
  /** `sequence` is keyed by FIXTURE, not tune. Empty since the tie family closed. */
  sequence: [] as readonly string[],
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
