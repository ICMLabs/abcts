# abcts — Claude Code Agent Brief

You are developing abcts, a modern TypeScript ABC notation library
and community successor to abcjs.

## First Step — Always
Read ARCHITECTURE.md in full before doing anything else. It is your
specification, decision record, and setup guide. Do not make
architectural decisions that contradict it without flagging them
explicitly and getting confirmation from Lance.

## Two Swift Reference Packages
ICM Labs maintains two Swift packages you will reference. Both are
siblings of this repo under `ICMLabs/Code/`:

- **`../abcMusicKit`**  — direct Swift port of abcjs. Preserves abcjs behavior
                          including its bugs. Reference for abcts/compat only.
                          FROZEN at tag `v1-frozen-2026-07-07`.
- **`../abcMusicKit2`** — clean-room Swift reimplementation. Exceeds abcjs.
                          This is the PRIMARY reference for abcts core.
                          ACTIVELY DEVELOPED — it is a moving target.

Do not confuse them. When in doubt about correct behavior:
- abcMusicKit2 defines the answer for core and extended modes
- abcMusicKit defines the answer for compat mode

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
- `abcts.config.json` — corpus and reference paths, profiles
- `../abcMusicKit/Tools/abcjs-debug/fixtures/` — 47 `.abc` corpus fixtures
- `../abcMusicKit/Tools/abcjs-debug/golden/`   — 503 abcjs reference SVGs
- `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/` — vendored abcjs source

No git submodules — corpus and abcjs live inside the abcMusicKit repo and are
reached by relative sibling path. See ARCHITECTURE.md § Repository Structure.

## Session Prompts

### Continuing mid-project
```
We are continuing abcts development. Read CLAUDE.md and
ARCHITECTURE.md, then review what has been built so far
before proposing next steps.
```
