# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## First Step — Always
Read `Docs/CHECKPOINT-2026-07-22c.md` first — it is the current state of play, the open
decisions, and the known risks. (`CHECKPOINT-2026-07-22b.md`, `-07-21.md`, `-07-19.md` and
`-07-18.md` are superseded but remain the record of the parser phase, the renderer's first
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
beams, structure, source offsets. 499 tests. The work is now entirely GEOMETRIC and
entirely strict-mode: corpus median notehead distance from abcjs is **17.4px**, with
**21/29** fixtures within 25px, **28/29** within 50px and **29/29** within 100px, and
systems matching 29/29. The remaining causes are named in the checkpoint's priority list.
It is NOT a skyline: abcjs places out-of-staff text at fixed distances from the staff, a
finding that killed a skyline port — measure its OUTPUT before porting its SOURCE.
NOTE the metric was corrected on 2026-07-22 and earlier figures are not comparable: the
gate had been comparing abcjs's outline START against our glyph ORIGIN, a 4px bias.


**Structural parity is done: note content, lyrics, beams and render structure are all
41/41 with zero recorded divergences.** 499 tests.

The work is now GEOMETRIC — does abcts put the ink where abcjs puts it. A pixel-parity
gate (`tests/pixel-parity.test.ts`) resolves both engines' SVG to absolute pixels and
measures it. Noteheads match 2696/2696, systems 28/29, output is 0.34x abcjs's bytes.

**The open problems are now three fixtures, not a corpus-wide term** — see
`Docs/CHECKPOINT-2026-07-22c.md` § Next. Vertical placement is largely closed (the
voice-name indent, `%%staffsep`/`%%sysstaffsep` and the prior per-staff-margin work took
the corpus median to 24.2px); what remains is `frere-jacques` (abcjs wraps a source line,
which fights the "one source line = one system" model — read the risk note), `center-text`
(needs `%%center`), `multi-voice-lyrics-two-voices`, and ragtime's small intra-staff
residual. A single aggregate number still cannot tell interacting terms apart — decompose
by per-step pitch, and read `ox`/`oy` offset, not just spread.

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
We are continuing abcts development. Read CLAUDE.md and
ARCHITECTURE.md, then review what has been built so far
before proposing next steps.
```
