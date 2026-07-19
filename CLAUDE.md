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
- `../abcMusicKit/Tools/abcjs-debug/golden/`   — abcjs goldens: 41 `.parse.json` (used by the gate) + 503 SVGs (unused; for the renderer)
- `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/` — vendored abcjs source

No git submodules — corpus and abcjs live inside the abcMusicKit repo and are
reached by relative sibling path. See ARCHITECTURE.md § Repository Structure.

## Current phase
The PARSER is complete and gated (39/39 corpus fixtures, saturated). The RENDERER is
under way: 129 tests, 20 of the 31 fixtures with a layout oracle passing the structural
gate. Glyphs are inline SVG paths extracted from Bravura; core is gated structurally
against `golden/*.elements.json`, not the SVG goldens. Both are settled — see
ARCHITECTURE.md § Rendering.

Next up, and both need Lance: prose text rendering (nothing renders text at all), and
whether the renderer phase may reach back into the parser — `Q:` and `clef=` are neither
parsed nor modelled, and the treble-clef assumption is currently producing silently wrong
staff positions for bass and alto voices.

## Session Prompts

### Continuing mid-project
```
We are continuing abcts development. Read CLAUDE.md and
ARCHITECTURE.md, then review what has been built so far
before proposing next steps.
```
