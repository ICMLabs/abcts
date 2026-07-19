# abcts — Architecture Decision Record

> TypeScript successor to abcjs, derived from ABCMusicKit (Swift).
> Maintained by ICM Labs. Community-first, correctness-first.

---

## Background

ICM Labs maintains two Swift ABC notation packages that together form the reference for abcts:

**abcMusicKit (v1)** — direct port of abcjs into Swift, and a faithful one: it inherited abcjs's design, its algorithms, and its performance characteristics along with its behavior. **Frozen** at tag `v1-frozen-2026-07-07`, and **in production** — the engine Music Studio ships today. Its behavior is proven. Its internals are not a model to follow.

**abcMusicKit2 (v2)** — clean-room Swift reimplementation. Goal is to replicate and exceed abcjs without porting. **Not production** — still being brought to functional parity with v1, and actively developed, so it is a moving target. Its design and architecture are materially better than v1's.

### Reference policy — split by question type

*Amended 2026-07-18. Supersedes the original "v2 is the primary reference for core".*

| Question | Reference |
|---|---|
| **What should the output BE?** — notes, durations, what a given ABC produces | **v1** — it is production and shipping |
| **How should this be BUILT?** — model shape, type design, algorithms, pipeline | **v2** — modern design, written to be better than what v1 inherited |

Concretely from **v2**: exact-`Rational` durations, the `Score → Voice → Measure → MusicEvent` nesting, deferred accidental resolution, the diagnostics model, the source-map approach — and algorithm choice generally. From **v1**: the answer to "what does this ABC actually parse to".

Never port an algorithm out of v1. v1's internals are abcjs's internals, carried over wholesale — including the parts that are slow or awkward. Read v1 to learn *what* it produces, not *how* it gets there.

v2 is not a behavior oracle — it has known gaps against v1. Where a decision is both at once (a model shape that changes observable behavior), flag it rather than picking silently.

The two packages map directly onto abcts architecture:

```
abcMusicKit   (Swift, abcjs port)      → abcts/compat    (abcjs-identical API)
abcMusicKit2  (Swift, clean-room)      → abcts core      (the real engine)
```

Where abcMusicKit and abcMusicKit2 diverge, that divergence is intentional and self-documenting — it is either a bug fix or a feature addition. Those divergences become the abcts changelog.

abcts brings this work to TypeScript for the broader ABC web community: v2's architecture, validated against v1's production behavior. It is not a mechanical port of abcjs — it is a reimplementation against known-correct references with a full regression corpus.

**abcm2ps and abc2svg are GPL licensed. abcts derives from neither.** All behavioral parity with those tools was achieved independently through abcMusicKit2, which was developed by observing output behavior only — no source was read or ported. abcts inherits that clean lineage:

```
abcm2ps / abc2svg        → behavioral reference only, no code
       ↓ (observed output)
  abcMusicKit2 (Swift)   → independent clean-room implementation, MIT
       ↓ (translation)
    abcts (TypeScript)   → this project, MIT
```

abcMusicKit (the direct abcjs port) is used only for compat layer validation — confirming that abcts/compat reproduces abcjs behavior faithfully.

### Open question — reference tracking

abcMusicKit2 is under active development. abcts must decide whether core tracks a **pinned tag** of abcMusicKit2 or **follows its head**. Unresolved; revisit before core translation work begins.

---

## Positioning

| Library | License | Status |
|---|---|---|
| abcjs | MIT | Incumbent, aging architecture, single maintainer, bugs known |
| abcm2ps | GPL | Reference quality, desktop/print only, cannot be derived from |
| abc2svg | GPL | SVG-focused, limited JS reach, cannot be derived from |
| abcMusicKit | MIT | Direct Swift port of abcjs — compat reference |
| abcMusicKit2 | MIT | Clean-room Swift reimplementation — primary abcts reference |
| **abcts** | **MIT** | **Modern TS, behavioral parity+ to all, clean-room, community successor** |

---

## Repository Structure

*Amended 2026-07-17 — supersedes the original submodule-based plan.*

Everything lives as sibling directories under `ICMLabs/Code/`:

```
ICMLabs/Code/
  abcMusicKit/       → Swift v1, frozen. Also hosts:
                         Tools/abcjs-debug/          → corpus fixtures + abcjs goldens
                         Docs/References/abcjs/      → vendored abcjs 6.6.3 source
  abcMusicKit2/      → Swift clean-room engine (primary core reference)
  abcMusicStudio/    → Mac/iPad app
  abcts/             → this project
```

**No git submodules.** Submodules were specified originally on the assumption that `corpus` and `abcjs` were independent repositories. They are not — both live inside the abcMusicKit repo. A submodule would require first extracting a corpus repo and then maintaining a sync path back to the Swift test suites that generate it. Sibling relative paths in `abcts.config.json` achieve the same determinism with none of that.

---

## Corpus

*Amended 2026-07-17.*

There is no standalone corpus repo. Corpus material exists in several places with different purposes:

| Location | Contents | Role |
|---|---|---|
| `abcMusicKit/Tools/abcjs-debug/fixtures/` + `golden/` | 47 `.abc` → 503 abcjs SVG goldens | **Day-one gate.** Compat mode. Already in ABC-input → expected-output form. |
| `abcMusicKit2/Tests/.../Goldens/` | 12 SVG + sha256 pairs | Standard mode reference, adopt when core exists |
| `/tmp/v1corpus` | ~707 tunes, **ephemeral** | Regenerated by `abcMusicKitCpp/scripts/extract_v1corpus.py` scraping inline ABC from abcMusicKit2's Swift tests. Broad coverage; adopt for standard/extended once there is an engine to run it against. |
| `abc-vs-abcm2ps/corpus/` (20), `abcMusicKitCpp/parity/corpus/` (25) | Small targeted sets | Supplementary |

The abcjs-debug set is the gate because it is exactly the compat-mode diff the architecture calls primary, and it already exists in generated form.

---

## Package Strategy

**Single package.** Matches abcjs's distribution model, lowers adoption friction, one `npm install`. Internal source boundaries are maintained by directory structure — a future split would be mechanical if ever warranted.

Multiple entry points via `package.json` `exports` map for consumers who want tree-shaking:

```json
{
  "exports": {
    ".":          "./dist/index.js",
    "./parser":   "./dist/parser/index.js",
    "./renderer": "./dist/renderer/index.js",
    "./compat":   "./dist/compat/index.js"
  }
}
```

Each entry point is added to `package.json` and `tsup.config.ts` when the module behind it has code. Currently only `.` exists.

---

## API Modes

### Compatibility Mode
Drop-in replacement for abcjs. Identical call signatures. Enables direct migration and corpus diffing against abcjs output.

```typescript
import { renderAbc } from 'abcts/compat'
renderAbc("paper", abcString, options) // abcjs-identical signature
```

### Standard Mode
abcjs bugs fixed. Clean three-stage pipeline. Full TypeScript types.

```typescript
import { parse, render } from 'abcts'

const result = parse(abcString, parseOptions)
// result: { ok: true, tune: Tune } | { ok: false, errors: ParseError[] }

const svg = render(result.tune, renderOptions)
```

### Extended Mode
abcm2ps and abc2svg features unlocked via render profile.

```typescript
import { parse, render } from 'abcts'

const result = parse(abcString)
const svg = render(result.tune, {
  profile: 'abcm2ps' | 'abcsvg' | 'standard'
})
```

---

## API Design Principles

- **Parse → AST → Render** — three independent stages, each usable alone
- **Immutable AST** — parse result is frozen, never mutated in place
- **Result types not exceptions** — `{ ok, ... }` discriminated union, no try/catch required
- **Typed options interfaces** — `ParseOptions` and `RenderOptions` are distinct, never merged
- **Events separate from render** — not stuffed into options objects
- **Progressive disclosure** — simple case is one line; complex case is still possible

---

## Feature Surface

Three explicit documentation sections:

1. **Fixed from abcjs** — correctness bugs resolved, with before/after examples
2. **Behavioral parity with abcm2ps** — rendering features independently implemented, described by output behavior not by abcm2ps internals
3. **Behavioral parity with abc2svg** — SVG output improvements independently implemented

Source of truth: the ICM Labs fix/feature list derived from abcMusicKit development.

> **Legal note:** Feature descriptions reference abcm2ps and abc2svg as behavioral targets only. No GPL source was read, copied, or derived from at any stage. You cannot copyright a musical notation rendering feature — only its implementation.

---

## Rendering

*Added 2026-07-19. Both decisions were escalated as "needs a human" in the parser-phase
checkpoint and are settled here.*

### Glyph source — inline SVG paths

Musical glyphs are emitted as `<path>`, with outlines extracted from Bravura at build time
by `scripts/gen-glyphs.mjs` into `src/renderer/glyphs.ts`. Regenerate with
`node scripts/gen-glyphs.mjs`; adding a glyph means adding its SMuFL name to the `GLYPHS`
list in that script.

The alternative was an embedded SMuFL font with `<text>` and a codepoint, which is what
abcMusicKit2's `SVGBackend` does. Rejected for the web: it needs a ~380KB woff2 to reach
the page, and a saved, pasted or mailed SVG renders as tofu without it. Self-contained
output is worth more to a library than restyleable glyphs.

**Metrics are not extracted.** `bravura_metadata.json` publishes bounding boxes, anchors
and engraving defaults in staff spaces already, so only outlines need the font binary.
That the two agree is a genuine cross-check and they do — the extracted `noteheadBlack`
path spans exactly the published 1.18 × 1.0 box.

### Prose text — `<text>`, the opposite call

*Decided 2026-07-19 with the tempo work.*

Prose (tempo marks, and later titles, lyrics, chord symbols) is emitted as a real `<text>`
element in a generic family, NOT as paths. The glyph reasoning deliberately does not
transfer: a missing serif face falls back to another serif, whereas a missing Bravura
falls back to nothing legible. Self-containment is worth paying for in noteheads and not
worth paying for in words — paths for text would also bloat output and destroy
selectability and screen-reader access. abcMusicKit2's `CGBackend` splits the same way:
music from Bravura, "prose uses a CoreText system font".

Text from ABC is untrusted — a `T:` or `Q:` field carries whatever the file said — and it
is spliced into markup a host will put in a page, so it is escaped at emission. That is a
trust boundary, not a formatting nicety.

No text metrics are available, so layout estimates advance where it must. The tempo mark
is zero-width (matching abcjs) and floats above the staff, so nothing downstream depends
on those estimates. Anything that needs real metrics — centred titles, lyric alignment —
needs a measured font first.

### Units and coordinates

Staff spaces throughout, y-down, middle staff line at y = 0. A *staff step* is one
diatonic position, half a staff space, so `y = -step / 2`. Following abcMusicKit2, font
metadata (glyph metrics, line thicknesses) stays in the font and engraving conventions
(stem length, spacing) live in the engine's `ENGRAVE` constants — no magic numbers loose
in layout code. Scaling to pixels happens once, in the SVG backend.

### What "correct" means — structural, then baselines

Core renders in its own visual style, so the 503 golden SVGs gate **compat** mode only.
Core is gated structurally against `golden/*.elements.json` — abcjs's laid-out elements,
which carry element sequence and staff positions and survive stylistic divergence.

Committed visual baselines are the second half and are deliberately deferred: a baseline
committed from unverified output locks the bug in, and day one is when output is least
verified. **Structure catches wrong; baselines catch changed.** Add baselines once core's
visual style stabilises.

The gate's blind spots are documented in the header of
`tests/renderer/structural.test.ts` and must be kept honest there — green means "the right
noteheads landed on the right lines, in the first voice of the first tune", not "this
fixture renders correctly".

## Internal Source Structure

```
abcts/
  src/
    index.ts       → public entry (currently the only one)
    parser/        → ABC string → AST
    ast/           → Type definitions for the AST
    renderer/      → AST → SVG
    midi/          → AST → MIDI (optional, later)
    compat/        → abcjs signature shims (calls parser + renderer)
    extended/      → Profile-gated feature exposure
  tests/
    corpus/        → corpus-driven test suites
  dist/            → build output (gitignored)
```

Directories are created when they have code in them, not ahead of time. Compat layer calls core. Core has zero knowledge of compat. That boundary is enforced.

---

## Toolchain

| Concern | Tool | Rationale |
|---|---|---|
| Build | tsup | Zero-config library builds, ESM/CJS dual output |
| Test | Vitest | ESM-native, fast, corpus fixture support |
| Lint/Format | Biome | Single tool, replaces ESLint + Prettier |
| Versioning | Changesets | Semver discipline, changelog generation |
| API Docs | TypeDoc | Generated from types automatically |
| Narrative Docs | TBD | Starlight or VitePress; Hugo-compatible preferred |
| CI | GitHub Actions | Corpus tests run on every PR |

TypeScript strict mode. Strict null checks. No exceptions.

---

## Testing Strategy

Corpus is the primary quality gate.

1. Run abcjs against corpus → capture reference output (already captured as `golden/`)
2. Run abcts compat mode against same corpus → diff
3. Divergences are either bugs (fix them) or intentional improvements (document them)
4. Extended mode has its own corpus fixtures for parity+ features
5. Every PR must pass full corpus before merge

Fixture files are data-driven (ABC input → expected output), directly consumable by Vitest.

---

## Discovery Config

`abcts.config.json` at project root — readable by agents, contributors, and CI:

```json
{
  "corpus":   "../abcMusicKit/Tools/abcjs-debug/fixtures",
  "goldens":  "../abcMusicKit/Tools/abcjs-debug/golden",
  "abcjsRef": "../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3",
  "profiles": ["standard", "abcm2ps", "abcsvg"]
}
```

This file is the agent and contributor entry point. Read it first. Paths are relative to the abcts repo root and resolve to sibling directories under `ICMLabs/Code/`.

---

## Tools — Installation and Configuration

### Prerequisites

**Node.js** — current LTS or newer. Install via nvm for version flexibility.

```bash
nvm install --lts && nvm use --lts
node --version
```

**Git** — 2.13+.

### Project Initialization

```bash
mkdir abcts && cd abcts
git init
npm init -y
```

No submodule step — see Repository Structure.

### Toolchain Installation

All dev dependencies. Nothing in `dependencies` except what consumers need at runtime.

```bash
npm install -D typescript tsup vitest @biomejs/biome @changesets/cli typedoc
```

### Configuration files

Committed at repo root, authoritative over anything quoted in this document:

- `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `tsup.config.ts` — single entry today; entries added as modules land
- `vitest.config.ts` — reads `abcts.config.json`, exports corpus paths as env vars
- `biome.json` — recommended rules, 2-space, 100 cols
- `abcts.config.json` — discovery config

### npm Scripts

```
build · dev · test · test:watch · test:corpus · lint · lint:fix
format · typecheck · docs · changeset · version · release
```

### GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:corpus       # corpus is the gate
      - run: npm run build
```

> **CI caveat:** the corpus lives in a sibling repo, not a submodule. CI must check out abcMusicKit alongside abcts for `test:corpus` to run. Unresolved — options are a second `actions/checkout` step, or committing a generated corpus snapshot into abcts. Decide before wiring CI.

---

## VS Code Configuration

### Required Extensions

`.vscode/extensions.json`:

```json
{
  "recommendations": [
    "biomejs.biome",
    "usernamehw.errorlens",
    "eamodio.gitlens",
    "vitest.explorer"
  ]
}
```

| Extension | Purpose |
|---|---|
| `biomejs.biome` | Replaces ESLint + Prettier extensions — hooks into biome.json |
| `usernamehw.errorlens` | Inline error display — essential with strict TypeScript |
| `eamodio.gitlens` | Blame, history |
| `vitest.explorer` | Run and debug corpus tests directly in the editor |

Do **not** install ESLint or Prettier extensions — they will conflict with Biome.

### Workspace Settings

`.vscode/settings.json` — committed so all contributors get the same environment:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

`typescript.tsdk` uses the project's TypeScript version, not VS Code's bundled one — critical for consistency across machines.

---

## Provenance and License

abcts is MIT licensed. This is non-negotiable for community adoption and must be maintained through all dependencies.

**Clean-room lineage**

| Stage | Source | Method | License |
|---|---|---|---|
| abcm2ps behavior | Observed output only | Black-box testing | GPL — no code used |
| abc2svg behavior | Observed output only | Black-box testing | GPL — no code used |
| abcMusicKit | Direct Swift port of abcjs | Translation | MIT |
| abcMusicKit2 | Independent Swift reimplementation | Original clean-room work | MIT |
| abcts/compat | Translation of abcMusicKit | Original work | MIT |
| abcts core | Translation of abcMusicKit2 | Original work | MIT |

**Dependency discipline**

- All runtime dependencies must be MIT, ISC, BSD, or Apache 2.0
- No GPL or LGPL runtime dependencies — ever
- Dev dependencies (test runners, build tools) may be GPL — they don't ship to consumers
- License of every dependency must be verified before adding it
- Use `license-checker` or `licensee` in CI to enforce this automatically

**Bundled font data — OFL 1.1**

*Added 2026-07-19 with the glyph-source decision below.*

One file departs from the MIT/ISC/BSD/Apache rule, deliberately and with the reasoning
recorded: `src/renderer/glyphs.ts` contains SVG outlines extracted from **Bravura**, which
is **SIL OFL 1.1**. OFL is permissive but is not on the list above, so it needed an
explicit call rather than being waved through as "close enough".

- **That file alone** carries an OFL header and is licensed OFL 1.1. The rest of abcts,
  including the extraction script that generates it, stays MIT.
- The two are compatible. OFL permits redistribution, modification and embedding without
  restriction; it requires only that derivatives of the *font software* stay OFL and not
  use a Reserved Font Name. "Bravura" therefore appears in that file as attribution only,
  never as an identifier the module exports.
- OFL does **not** propagate to documents that embed the font, nor to the rest of a
  program that links it. Consumers of abcts are unaffected.
- Any future SMuFL font added (Petaluma, Leland) is OFL too and follows the same pattern.

Note this is font *data*, not a dependency: nothing is installed, and `npm ls` shows no
OFL package. `opentype.js` (MIT) reads the font at build time and is a devDependency.

**What contributors must understand**

If a contributor has read abcm2ps or abc2svg source code, they must not contribute implementations of features from those tools. Behavioral descriptions (what the output should look like) are acceptable. Code that mirrors GPL internals is not.

Document this clearly in CONTRIBUTING.md when that is written.

---

## What Is Deferred

- MIDI output module (separate entry point, post-v1)
- Canvas renderer (post-SVG)
- Contribution guidelines (once foundation is stable)
- Docs site (Starlight vs VitePress decision pending)
- CI corpus checkout strategy (see caveat above)
- abcMusicKit2 reference pinning (see Background)

---

## Agent Onboarding

See `CLAUDE.md` at repo root — Claude Code reads it automatically at session start.

---

*Last updated: 2026-07-17*
*Status: Toolchain scaffolded, pre-implementation*
