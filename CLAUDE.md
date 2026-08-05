# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## First Step — Always
**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE** — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached;
checkpoint and hand off as you go so no context is lost.

Read `Docs/CHECKPOINT-2026-08-04c.md` first — it is the current state of play, findings
51-64, THE METHOD that produced them, and what is left. `Docs/CHECKPOINT-2026-08-04b.md`
holds findings 41-50, `Docs/CHECKPOINT-2026-08-04.md` the expensive lesson about "golden
limitations", and **`Docs/CHECKPOINT-2026-08-03d.md` is the FINDINGS LEDGER, 16-40** —
every rule with its abcjs citation and its measured number. Read them when you need the WHY
of a specific behaviour. `Docs/HANDOFF-2026-08-04b.md` has the session prompt.
(`CHECKPOINT-2026-08-03c.md` holds the accidental columns,
the notehead rod, the multi-measure rest and `%%gchordfont`;
`CHECKPOINT-2026-08-03b.md` holds the lyric-ink fix, the
tempo note, the two beam divergences and the ragtime verdict; `CHECKPOINT-2026-08-03.md` is
superseded but remains the
record of the declared-box list, the two corpora and the four gate artefacts; TWO of its
statements are corrected in `-08-03b`. `CHECKPOINT-2026-08-02d.md`, `CHECKPOINT-2026-08-02c.md`, `CHECKPOINT-2026-08-02b.md`, `CHECKPOINT-2026-08-02.md`,
`CHECKPOINT-2026-08-01.md`, `CHECKPOINT-2026-07-24.md`, `-07-22c.md`, `CHECKPOINT-2026-07-22b.md`, `-07-21.md`, `-07-19.md` and
`CHECKPOINT-2026-07-23.md`, `-07-18.md` are superseded but remain the record of the parser phase, the renderer's first
slices, how the last parser diffs closed, and the geometric work up to the voice-name and
`%%staffsep` fixes.) Then read ARCHITECTURE.md in full. It is your
specification, decision record, and setup guide. Do not make
architectural decisions that contradict it without flagging them
explicitly and getting confirmation from Lance.

## Two Swift Reference Packages — SPLIT BY QUESTION TYPE
ICM Labs maintains two Swift packages you will reference. Both are
siblings of this repo under `ICMLabs/Code/`:

- **`../abcMusicKit`** (v1)  — direct Swift port of abcjs, inheriting abcjs's design,
                               algorithms and performance along with its behavior.
                               FROZEN at tag `v1-frozen-2026-07-07`. **In production**
                               — the engine Music Studio ships today.
- **`../abcMusicKit2`** (v2) — clean-room reimplementation. **Not production**;
                               still being brought to functional parity with v1.
                               Actively developed, so it is a moving target.

**Which one answers depends on what you are asking:**

| Question | Reference | Why |
|---|---|---|
| *What should the output BE?* | **v1** | It is production and shipping. Behavior is proven. |
| *How should this be BUILT?* | **v2** | Modern design, written to be better than what v1 inherited. |

So: take the model shape, type design, algorithms, pipeline structure,
exact-`Rational` durations and source-map approach from **v2**. Take the answer to
"what notes, what durations, what does this ABC actually produce" from **v1**.

**Never port an algorithm out of v1.** Its internals are abcjs's internals, carried
over wholesale — including the slow and awkward parts. Read v1 for *what* it
produces, never for *how*.

Do not treat v2 as a behavior oracle — it has known gaps against v1.

When the two conflict on something that is BOTH (a model shape that changes
observable behavior), say so and ask rather than picking.

## License — Non-Negotiable
- abcts is MIT. All runtime dependencies must be MIT, ISC, BSD, or Apache 2.0.
- abcm2ps and abc2svg are GPL. Never read, reference, or port from their
  source code — not even for a single algorithm. Behavioral observation only.
- abcMusicKit and abcMusicKit2 are MIT and are safe to reference directly.

## Quality Gate
The corpus is the only quality gate that matters. All work must pass
corpus tests before it is considered complete. A green corpus means
correct behavior. Nothing ships red.

## Development Rules
- TypeScript strict mode throughout — no exceptions, no overrides
- Result types not exceptions — `{ ok: true, ... } | { ok: false, errors }`
- Immutable AST — parse result is frozen, never mutated
- Compat layer calls core — core has zero knowledge of compat
- One step at a time — confirm with Lance before moving to next step
- When unsure about a decision — ask, do not assume

## API Modes
- **compat**    — abcjs-identical API, derived from abcMusicKit
- **standard**  — bugs fixed, clean pipeline, derived from abcMusicKit2
- **extended**  — parity+ features via render profile, derived from abcMusicKit2

## Key Files and Paths
- `ARCHITECTURE.md`   — full specification and decision record (read first)
- `abcts.config.json` — corpus and goldens paths
- `../abcMusicKit/Tools/abcjs-debug/fixtures/` — 41 `.abc` corpus fixtures
- `../abcMusicKit/Tools/abcjs-debug/golden/`   — abcjs goldens: 41 `.parse.json` (parser gate) +
  41 `.elements.json` (renderer gate — laid-out elements) + 379 SVGs (**pixel-parity gate** — no longer unused, and there are 379 not 503)
- `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/` — vendored abcjs source. The ONLY
  thing left under `Docs/References/`; it stayed because the `.abcjsStrict` porting rules
  cite it by path. Everything else there moved to abcDocs on 2026-07-20.
- `../abcDocs/` — workspace-wide docs, private. Owns anything serving more than one repo.
  Two entries matter here: `reference/INDEX.md` catalogues the reference library (Gould's
  *Behind Bars*, the source for melisma geometry — contents gitignored, never
  redistributed), and `policy/CLEAN-ROOM-IMPLEMENTATION.md` holds the clean-room rule.

No git submodules — corpus and abcjs live inside the abcMusicKit repo and are
reached by relative sibling path. See ARCHITECTURE.md § Repository Structure.

**Clean-room, precisely.** §Scope of the policy above draws the line: the prohibition is on
reading the SOURCE CODE of tools implementing the same functionality — abc2svg, abcm2ps,
abc2midi, LilyPond, MuseScore — which stay black boxes, observed only through their output.
It is NOT a prohibition on published documentation. Gould's *Behind Bars* and the
Dorico/LilyPond/MuseScore architecture essays may be read and cited. What may never happen
is reproducing their prose, tables or figures verbatim into our docs — summarise and cite.
This repo pushes to a remote, so a verbatim quote here is redistribution.

## Remote
`origin` is PUBLIC on the ICMLabs GitHub org, as of 2026-07-22. It was a private backup
remote before that and several notes still assume so — the clean-room rule in particular
reasons from "this repo pushes to a remote, so a verbatim quote here is redistribution",
which is now sharper rather than weaker.

Two consequences that are live rather than theoretical:
- **Licence notices are obligations now.** `glyphs-abcjs.ts` reproduces abcjs's glyph
  table, which is a substantial portion of that Software, so it carries abcjs's full MIT
  notice — not a source credit. `glyphs.ts` carries Bravura's OFL notice. `LICENSE` at the
  repo root states abcts's own MIT and both third-party notices.
- **Nothing GPL may be read into this repo**, and nothing from `abcDocs` (private) or the
  reference library may be quoted verbatim. Push at session checkpoints; there
is no need to push after every commit.

**Never push `--force`, and never `pull --rebase` unattended.** If a push is rejected as
non-fast-forward, **stop and report it** — another agent may be working in this repo. Do
not attempt to resolve it automatically.

Nothing from `../abcMusicKit` is committed here: the corpus, the goldens and the vendored
abcjs source are all reached by sibling path and stay in that repo. Keep it that way — a
backup remote is not a licence to vendor someone else's tree into this one.

## Current phase
**Every structural gate is at 100% with zero recorded divergences** — content, lyrics,
beams, structure, source offsets. The work is now entirely GEOMETRIC and entirely
strict-mode, and it is being driven off the HARVESTED corpus's ranked table rather than the
41 fixtures: the 41 were all chosen by the people who wrote the engine, and every defect
found since 2026-08-03 came off the other 174.
The remaining causes are named in the checkpoint's priority list.
It is NOT a skyline: abcjs places most out-of-staff text at fixed distances from the staff,
a finding that killed a skyline port — measure its OUTPUT before porting its SOURCE. It is
not a flat lane model either: chord symbols, part labels and tempo marks STACK on the
music's ink (see the checkpoint). Both facts were measured from its output, not read.
NOTE the metric was corrected on 2026-07-22 and earlier figures are not comparable: the
gate had been comparing abcjs's outline START against our glyph ORIGIN, a 4px bias.


**Structural parity is done: note content, lyrics, beams and render structure are all
41/41 with zero recorded divergences.** 686 tests on `geometry/vertical`.

The work is now GEOMETRIC — does abcts put the ink where abcjs puts it. A pixel-parity
gate (`tests/pixel-parity.test.ts`) resolves both engines' SVG to absolute pixels and
measures it. Noteheads match 2696/2696, systems 29/29, output is 0.34x abcjs's bytes.

**The VERTICAL arc is DONE and MERGED** — `main` is green at 505/505, all 29 pixel-gated
fixtures within their ceilings, ceilings re-recorded. Branch vs the old main: fixtures within
ceiling 25/29 → **29/29**, noteheads within 25px 21/29 → **27/29**, corpus median 17.4px →
**14.7px**.

**The HORIZONTAL arc is CLOSED** on `geometry/horizontal`, which is GREEN at 505/505 —
pixel-parity gate included, ceilings re-recorded. The timeline is per LINE, as abcjs's
`layoutStaffGroup` is: no columns, no per-measure reconciliation, barlines unaligned across
voices because they are ordinary zero-duration elements on one timeline.

**The VERTICAL arc is OPEN** on `geometry/vertical`, branched from it and red BY DESIGN.
`Docs/CHECKPOINT-2026-08-04.md` is the state; `Docs/VERTICAL-ARC.md` is the arc's original
spec and its numbers are long superseded.

**24 of 29 fixtures are at ZERO on all four axes**, and the harvested corpus is at
**139 / 153 / 165 / 172 of 174** within 0.05 / 1 / 5 / 25px — 35 of 174 still off some axis,
from 60 at the start of 2026-08-04. The suite is **691/692**, and the ONE red is
`ragtime-nightingale`'s `oy` at 0.656 against an unraised 0.59, down from 1.58. **THERE ARE
NO GOLDEN-GENERATOR LIMITATIONS LEFT**: all four that were filed as such are closed — two
were our own grace EMISSION ORDER, one the generator's text metrics (finding 41), and the
fourth was abcjs never applying a glyph's SCALE at draw time (finding 62). Nothing above
17px is left on the ranked table, and the only item above 10 is a FEATURE.

`frere-jacques` is CLOSED vertically (dy 0.03, oy −0.02) and was never the "source-line-wrap
model conflict" it was filed as for two weeks.

THE IDEA THAT EXPLAINS MOST OF IT: **abcjs does not measure what it draws — it DECLARES a
box and reserves that.** Notehead (`pitch ± 2.0888/2`, NOT ± 1), accidental, clef, key and
time signature, tempo, tuplet, dynamic, decoration and tie all reserve declared figures,
and a BEAM reserves nothing at all. The clef is what sets a staff's top on a plain tune,
not the stems.

**AND MEASURE THE OUTPUT — the source will lie to you.** Its sharper form, which cost a
whole session: **A COUNT YOU CANNOT RE-DERIVE FROM THE OUTPUT IS NOT A MEASUREMENT.** And
watch what the gate CANNOT see — abcjs classes only noteheads, ledgers, stems and the top
staff line, so beams, tempo notes, ties and bar numbers are invisible to a class-based
comparison, which is how a missing tempo note sat under a green gate.

Three times on this branch a careful chain of source reads predicted something abcjs's own
SVG denies, and a grep of the golden settled each in seconds. Read the source to find the
MECHANISM; read the output to find the NUMBER. An extent difference names a STAFF, not a
mechanism. And ask whether the quantity is MEASURED TWICE: the lyric-reserve bug was one
number computed in two places whose inputs had drifted apart, with the formula never wrong.

Two questions go with it, and both cost a run before they were asked. **WHOSE box is it** —
a volta belongs to the first voice of the first staff, not to every voice carrying the
`|1`. **WHEN is it applied** — a tuplet's box is INK and the lanes stack on it; a tie's
`getYBounds` box comes AFTER the lanes and only pushes their result. The same box in the
wrong phase is a different number. And one element can reserve TWICE with different
figures: a tie declares ±4 pitch in `setEndAnchor` and a 3-pitch box in `getYBounds`.

**A PASSING GATE IS NOT PARITY.** The gate asserts "no worse than recorded". Parity means
dy/dx/oy/ox at ZERO on every fixture.

**A FIXTURE'S GATE ASSERTIONS SHORT-CIRCUIT, so a failing axis HIDES the ones after it.**
Two stale ceilings surfaced only once the check ahead of them started passing, and
`frere-jacques`'s `oy` is still hidden that way. When a fixture goes green, re-read the
axes behind the one you fixed rather than assuming they were passing.

**TWO CORPORA NOW.** The 41 fixtures in `../abcMusicKit/Tools/abcjs-debug/` are the
original gate; `tests/corpus-abcjs/` holds **174 tunes harvested from abcjs's own test
suite**, with goldens generated by running abcjs (`npm run harvest`, `npm run
harvest:goldens`). abcjs's ASSERTIONS are not ported — they read its internal `visualObj`
tree, which compat does not reproduce — only its inputs.

It immediately found a whole feature that was parsed and never painted: **`&` overlay
voices**. Nothing in the 41 uses `&`, so 505 tests went green over it for weeks. A GATE IS
ONLY AS BROAD AS ITS INPUTS, and ours had all been chosen by the same people who wrote the
engine.

It has kept doing it — `clef=none` and `clef=perc` read as a C clef, `%%text` reserving
nothing, `V:… merge` unimplemented, `bass,,` parsed as no clef, an empty implicit voice
taking a staff, and both line-assignment rules were all found there, and only one of them
is exercised by any of the 41. **START EVERY SESSION WITH
`npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`** — that table, not the aggregate counts, is what
names the next defect, and its DIRECTIVES column is what makes it actionable.

**AND THE ALGORITHM IS IN ABCJS.** Read the named function, then finish with a probe: four
of one session's nine fixes were ports of one (`merge`'s staff assignment, `getClef`'s
prefix match, `setCurrentVoice`'s line scan, the backslash preprocessing) and none could
have been guessed from a diff — but one rule is not in the source at all and took
instrumenting to see.

**A DECORATION IS STACKED BY ITS OWN GLYPH HEIGHT AND CENTRED ON THE RUNNING CURSOR** —
`height = symbolHeightInPitches(symbol) + 1`, `y = cursor + height / 2`, `cursor += height`
(`creation/decoration.js:154-165`). Ported. **AND ONE WRITTEN BEFORE A BARLINE ATTACHES TO
THE BARLINE**, at a fixed pitch 12 (`abstract-engraver.js:1002`) — not to the next note.

**THE GATE PAIRS THE i-TH NOTEHEAD OF EACH ENGINE, so a difference in EMISSION ORDER reads
as a position error — AND THAT ORDER WAS OURS TO FIX.** For two days `ragtime-nightingale`'s
dy 58.1 and `vree-grace-notes`' dy 11.6 / dx 32.5 were filed as unchaseable artefacts, with
the note "abcjs emits a graced note's MAIN head before its graces where we emit them after;
sorted by x, dy is 0.02 and dx a uniform 1.99". Every word of that was right except the
conclusion: emitting them in abcjs's order took ragtime to dy 1.12 / dx 18.30 and
`vree-grace-notes` to dy 0.02 / dx 1.99. **"The gate cannot see this" and "the golden is
wrong" are different claims, and the second needs the golden opened.**

**AND THERE ARE NO "GOLDEN LIMITATIONS" — THE GOLDENS ARE THE TARGET, and all four are now
closed.** Two were our own grace emission order; the other two were the generator's TEXT
METRICS, and `calcWidth` is PORTED (`src/renderer/golden-widths.ts`): five ASCII
per-character tables picked by SIZE alone, three of the six brackets resolving to
`repeatfont` because their key does not exist, a flat **8** for every character outside them,
and `getBBox` counting a chord's NESTED tspans as separate lines. `abcMusicKit` v1 —
production, byte-identical to these goldens — reproduces the fallback ON PURPOSE. Strict
measures with the golden's tables; `abc2.1`/`extended` keep the real per-em ones, gated at
one place.

**A LADDER OF CONTROL TUNES, THEN THE NAMED FUNCTION, THEN A PROBE.** Ten more rules landed
on 2026-08-04 and not one came off a diff. Four or five tunes in `/tmp/abcts-probe/`, each
one FEATURE longer than the last, and the rung where the number appears names the
INTERACTION rather than the feature: `"D7"…|1…` needed five rungs to say "a chord AND an
ending", which is a BRANCH in `set-upper-and-lower-elements.js` and invisible in either
feature alone.

**PORT THE STRUCTURE, THEN THE CONSTANTS.** The costly divergences have all been
architectural, not numeric; see the checkpoint's opening section before starting anything.

The `.elements.json` goldens carry `staffs[].top/.bottom` and `specialY` — abcjs's own
answer to how much room a staff takes. Replicating `setUpperAndLowerElements` over them
reproduces its SVG exactly on nine fixtures, and is the fastest way to test any vertical
hypothesis. But `dump-elements.js` and `dump-svg.js` measure multi-line text differently;
where they disagree, the SVG is the gate. A single aggregate number still cannot tell
interacting terms apart, and the notehead median cannot see the vertical question at all —
use `tests/staff-spacing.test.ts`.

Renders staff, all clefs, key signatures, meters, tempo marks, part labels, noteheads and
chords with stems and ledger lines, accidentals, rests and barlines, grace notes, chord
symbols, the full decoration set, lyrics, slurs and ties, tuplets, voltas, annotations,
styled noteheads, hairpins and glissandi, melisma extenders, mid-tune key changes, and
`%%score` staff grouping with braces and brackets.

Two features are MODE-SPLIT, and the split is the point — strict is faithful to abcjs,
the other modes are correct:

| | `abcjs-strict` | `abc2.1` / `extended` |
|---|---|---|
| Melisma | prints abcjs's literal `_` | suppresses it, strokes an extender |
| Three-quarter tones | draws NOTHING, as abcjs does | draws the three-quarter glyph |
| `%%vocalfont` | parsed, NOT realized (abcjs never reads it) | realized, per lyric segment |
| `+:` in a lyric continuation | abcjs's leak, reproduced | ABC 2.1 semantics |
| `<defs>`/`<use>` | off, so markup stays abcjs-shaped | on, 0.34x the bytes |

THREE GATES, complementary — **pixel parity** catches DIFFERENT-ON-SCREEN (vs abcjs's own
SVG, glyph outlines excepted), structure catches WRONG (vs abcjs's laid-out elements),
baselines catch CHANGED (vs committed geometry). Re-record with `npm run baseline`, but
READ the diff and commit baselines with the code change.

## Parity targets, by mode
`abcjs-strict` is measured against **abcjs 6.6.3 itself** — its parse trees, element dumps
and SVG goldens. 100% is the bar; a divergence is a defect, not a tolerance.

`abc2.1` and `extended` are measured against the OTHER engines, since abcjs is wrong or
absent for much of what they cover. Golden sets exist in `../abcMusicKit` (v1),
`../abcMusicKit2` (v2) and `../abcMusicKitCpp` — abcm2ps and abc2svg observed through
their OUTPUT only, never their source (both are GPL; see the clean-room rule).

`Docs/ABCJS-DIFFERENCES.md` is the verified list of abcjs bugs and gaps that strict
reproduces and the other modes fix. It is public-facing — every entry must cite how it was
checked, and anything read from abcjs's source rather than measured from its output says
so. Three entries were originally written from a plausible reading of its parser and were
wrong.

## Modes — abcjs-strict is the DEFAULT
`abcjs-strict` (reproduce abcjs, bugs included) | `abc2.1` (standard read correctly) |
`extended`. `parse(abc, { mode })` and `render(score, { mode })`. Strict is default
because a replacement whose default output differs from what it replaces is not one.
`abcts/compat` gives abcjs's `renderAbc` signature, classes and density for a drop-in.

## Running it
`abcts tune.abc` (CLI, after `npm run build`) renders to stdout or a file.
`npm run compare` puts abcts and the abcjs goldens side by side — or overlaid, cyan over
magenta, the way abcMusicKitWorkbench compares v1. The overlay is only a true match test
for a byte-parity engine; core renders in its own style, so side by side is the default.

## Measuring progress
`npm run parity` prints every parity axis in one view. Note that abcjs parity and
abcMusicKit v1 parity are NOT separate axes: v1 is a port of abcjs whose abcjsStrict
output is byte-identical to it (verified by diffing v1's CLI output against the goldens),
so the abcjs goldens are v1's shared surface. v1's extended-mode features are a
feature-coverage gap, tracked separately and implemented not at all.

## Session Prompts

### Continuing mid-project
```
We are continuing abcts development in the abcts repo (Code/abcts).

Read Docs/CHECKPOINT-2026-08-04c.md first, and Docs/HANDOFF-2026-08-04b.md
beside it — then Docs/CHECKPOINT-2026-08-04b.md (findings 41-50), then
Docs/CHECKPOINT-2026-08-03d.md (16-40), then ARCHITECTURE.md, then this
file.

THE RULE THAT MATTERS: port abcjs's STRUCTURE, then its constants.
Reading abcjs gives you its numbers cheaply; the expensive divergences
have all been architectural — one cursor vs per-measure columns, a
spring/rod solve vs a width multiplier, ink-anchored lanes vs fixed
ones. Dropping a correct constant into a different structure moves the
output unpredictably. Before changing a constant, ask whether the
surrounding LOOP is abcjs's; if not, fix that first.

Work by INSTRUMENTING — env-guarded console.log in the vendored abcjs
source, run its own dump-svg.js harness, then
`git -C ../abcMusicKit checkout -- Docs/References/abcjs/` and verify
clean. Instrument to ANSWER A QUESTION, not to see what happens: used
that way it has killed three wrong hypotheses for one run each. Used as
a feedback loop for guesses it is the expensive mode.

The bar is 100% parity with abcjs. A passing gate is not parity — the
gate says "no worse than recorded"; parity means dy/dx/oy/ox at ZERO.

AND "THE GATE CANNOT SEE THIS" IS NOT "THE GOLDEN IS WRONG", AND
NEITHER OF THOSE IS "SO LEAVE IT". The goldens ARE the target: two of
the four recorded golden artefacts were OURS, and the other two are the
generator's text metrics, which byte parity obliges us to reproduce.

Confirm your lane with `git rev-parse --abbrev-ref HEAD`. `main` holds
the merged vertical arc and is GREEN — keep it that way.
`geometry/vertical` is the open arc, at 685/686.
```

### The open task, specifically
```
Continue geometric parity in Code/abcts.

Read Docs/CHECKPOINT-2026-08-04c.md; the findings ledgers are that file
(51-64), Docs/CHECKPOINT-2026-08-04b.md (41-50) and
Docs/CHECKPOINT-2026-08-03d.md (16-40).

The VERTICAL arc is open on `geometry/vertical`, 691/692 with one
expected red — ragtime's oy at 0.656 against 0.59. Start where the
checkpoint says: %%setfont's rich text, which is the top of the table
and the only item above 12px.

The method, unchanged: instrument abcjs to ANSWER A QUESTION, read the
ground truth, restore. Port abcjs's STRUCTURE, then its constants. And
read the STAFF TOPLINES, not only the notehead average — four toplines
out by 38.75/11.64/27.34/31.17 says SPACING, not a shift, and the gap it
names is a lane.
```
