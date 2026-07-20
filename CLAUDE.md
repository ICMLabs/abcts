# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## First Step — Always
Read `Docs/CHECKPOINT-2026-07-19.md` first — it is the current state of play, the open
decisions, and the known risks. (`CHECKPOINT-2026-07-18.md` is superseded but still the
record of the parser phase and its audit.) Then read ARCHITECTURE.md in full. It is your
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
  41 `.elements.json` (renderer gate — laid-out elements) + 503 SVGs (compat mode only, unused)
- `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/` — vendored abcjs source

No git submodules — corpus and abcjs live inside the abcMusicKit repo and are
reached by relative sibling path. See ARCHITECTURE.md § Repository Structure.

## Remote
`origin` is a private backup remote on the ICMLabs GitHub org. It exists for off-machine
backup, not distribution — this repo is not published. Push at session checkpoints; there
is no need to push after every commit.

**Never push `--force`, and never `pull --rebase` unattended.** If a push is rejected as
non-fast-forward, **stop and report it** — another agent may be working in this repo. Do
not attempt to resolve it automatically.

Nothing from `../abcMusicKit` is committed here: the corpus, the goldens and the vendored
abcjs source are all reached by sibling path and stay in that repo. Keep it that way — a
backup remote is not a licence to vendor someone else's tree into this one.

## Current phase
The PARSER is complete and gated (39/39 corpus fixtures, saturated). The RENDERER now
reproduces **40 of 41** fixtures on the structural gate; the 41st is a recorded abcjs bug,
so the corpus is COMPLETE — every fixture is either reproduced or explained. All 41 also
have committed visual baselines. 295 tests.
Renders staff, all clefs, key signatures, meters, tempo marks, part labels, noteheads and
chords with stems and ledger lines, accidentals, rests and barlines, grace notes, chord
symbols, decorations, lyrics, slurs and ties, tuplets, voltas and annotations.

Beware the gap list in the checkpoint: it was built by counting how often a model field
is POPULATED, and its top entry turned out not to be a gap at all — see the second
CORRECTION there. Ask the reference directly before believing a frequency count.

All three rendering decisions are settled — inline Bravura paths for glyphs, `<text>` for
prose, structural comparison against `golden/*.elements.json` rather than the SVG
goldens. See ARCHITECTURE.md § Rendering.

The renderer phase MAY change the parser; clef, `Q:`, opening barlines and `P:` all did,
and the parser gate held each time.

TWO GATES, and they are complementary — structure catches WRONG (vs abcjs), baselines
catch CHANGED (vs committed geometry). Invert every stem in the corpus and the structural
gate stays fully green while baselines fail 39 of 43. Re-record with `npm run baseline`,
but READ the diff and commit baselines with the code change.

**The corpus has stopped driving the work** — with 40/41 reproduced there is no failing
diff to follow. What remains is known from the code: the decoration tail (rolls, slides, hairpins),
no text metrics, fixed lanes rather than a skyline, and page furniture beyond titles.
See the checkpoint.

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
