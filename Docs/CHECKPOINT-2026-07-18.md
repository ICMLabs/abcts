# abcts — Checkpoint, 2026-07-18

State at the end of the parser phase, immediately before renderer work begins.

> **SUPERSEDED by `CHECKPOINT-2026-07-19.md`. Read that first.**
>
> Still accurate for the parser, the corpus gate and the audit history — that material
> was not restated and this remains its record. Out of date in two places:
>
> - **Both "open decisions" 1 and 2 are settled** (glyph source, and what "correct" means).
>   See ARCHITECTURE.md § Rendering.
> - **"Core has no oracle" was wrong.** It reasoned from the 503 SVGs, which do gate compat
>   only — but every fixture also ships a `.elements.json` layout dump that is
>   style-independent and now gates core. A case of this document's own lesson.
>
> Risk 5 (falsy `Accidental.natural`) is **closed**. Risk 3 (`octaveShift`) is **not**
> settled by the first SVG comparison as predicted here — see the newer checkpoint.

---

## Where things stand

| | |
|---|---|
| Tests | **73 passing** (incl. a ~625-case fuzz suite) |
| Content parity | **39/39 gated fixtures**, saturated — 2 documented divergences |
| Beam parity | 36/41, asserted as an exact failure set |
| Typecheck / lint / build | clean; ESM + CJS + `.d.ts` |
| Source | `src/core/model.ts`, `src/parser/{lexer,parser,text}.ts`, `src/index.ts` |
| Renderer | **none — zero code.** This is the next phase. |
| Compat layer | none — zero code |
| CI | **not wired, by decision.** No remote; the local gate is the gate — run `npm test` before every commit. |

The parser covers essentially all of ABC 2.1's musical content. What remains unimplemented
is listed in the header comment of `src/parser/parser.ts`, and is deliberately small:
part order (`P:`), user-defined symbols (`U:`), symbol lines (`s:`), and most `%%`
directives.

---

## What the corpus gate actually checks

`tests/corpus/content-parity.test.ts`, against 41 fixtures and their abcjs `.parse.json`
goldens in `../abcMusicKit/Tools/abcjs-debug/`.

**Compared:** notated duration · sounding ratio (so tuplets are gated in both dimensions) ·
diatonic pitch · **accidental** · decoration count · chord-symbol presence · grace-note
count · voice order · overlay placement · source-offset containment.

**Deliberately NOT compared, each for a stated reason:**

- **Decoration vocabulary.** `~` is `roll` here and `irishroll` in abcjs; `M` is
  `lowermordent` vs `mordent`; `!<(!` is raw here and `crescendo(` there. Chord symbols
  likewise: `Bb` vs `B♭`. Which vocabulary core adopts should be settled **against v2**,
  not inferred from abcjs. Structure is gated; names are asserted in unit tests.
- **Exact source offsets.** abcjs's `startChar` is not a semantic anchor — it is wherever
  the previous element ended, so it tiles the source and absorbs leading whitespace and
  slur parens. Core asserts *containment* within abcjs's span, which is the property
  editor cross-linking depends on. Byte-exact offsets are compat-mode work.
- **Lyrics.** The goldens carry `lyric`, but core and abcjs disagree structurally (abcjs
  keeps a `divider` on the *preceding* syllable). Currently unit-tested only — see Risks.

**Three normalizations** reconcile real representational differences, and all three were
verified load-bearing by disabling each in turn (voice-major regrouping is worth 6
fixtures; the other two 1 each):

1. Goldens regrouped by `(staff, voice)` — abcjs stores system-major, core is voice-major.
2. `voice.octaveShift` added back — abcjs bakes `octave=` into pitch numbers, core keeps it
   on the Voice as a sounding shift.
3. Overlays emitted after the main line — abcjs promotes `&` layers to their own voice.

**Two documented divergences** (`KNOWN_DIVERGENCES`), both cases where abcjs is wrong:

- `frere-jacques` — abcjs parses `+:` field-continuation lines as music; 13 of its 45
  "notes" are the prose of `+:belongs to their respective owners`.
- `S1-decorations` — abcjs drops `!staccato!` while recording every neighbouring
  decoration.

The test **fails if a known divergence starts matching**, so a stale entry cannot rot.

---

## The audit, and what it says about trusting this code

Four parallel adversarial agents reviewed the parser on 2026-07-18. They found **thirteen
real bugs. None failed any existing test.** All are fixed and pinned by regression tests.

Silent data loss: a trailing overlay measure discarded whole; an unterminated
`%%begintext` swallowing every later tune; a stranded `overlayIndex` relocating the rest
of a voice out of `measure.events`.

Wrong output: header `V:` switching voices instead of declaring (the code contradicted its
own comment); beam indices resolved against the wrong voice at a mid-line `[V:]`; a rest
not clearing pending accidental state; `+:` replayed into `K:`; broken rhythm dying at end
of line; `K:none` parsed as C major; `.` before `(`/`-` read as staccato; `J` missing from
the shorthand table; `!style=…!` treated as a decoration.

Crashes: `B/0` threw; a 400-digit length overflowed to `Infinity` and blew the stack in
`gcd` — a denial-of-service for anything parsing untrusted ABC. Then the *hardening for
those* introduced a third: 53+ broken-rhythm arrows tripping the new safe-integer guard.

**Three failures of process worth carrying forward:**

1. **A test that could not fail.** The fuzz suite's `expect()` never landed — an edit
   failed silently and went unverified. It accumulated findings, wrote them to a temp file,
   and passed, while three crashes were live.
2. **A blind spot asserted as fact.** The parity key compared step and octave only, so
   `^F`, `F`, `_F`, `=F` were identical — every accidental path unverified across the
   corpus while `vree-sharps` reported MATCH with a sharp on every note. This persisted
   because the goldens were believed to lack the data. They carry `accidental` on 376
   pitches. The belief came from a 4-fixture key dump, generalised and never rechecked.
3. **A premature deletion.** `NoteStyle` was collapsed to `'normal'` on an audit finding
   that nothing produced the other variants. `!style=harmonic!` produces them; the finding
   was correct about the code and wrong about the format.

**The lesson for the renderer phase:** the gate is only as good as what it compares, and
"no oracle exists" should be verified against the data before it is believed.

---

## Open decisions — these need a human

1. **Glyph source for the renderer.** An embedded SMuFL font (v2 compiles in Bravura;
   OFL-licensed, permissive but *not* on ARCHITECTURE.md's MIT/ISC/BSD/Apache list, so it
   needs an explicit call) versus inlined SVG path data as abcjs uses. Shapes the whole
   rendering layer and is hard to reverse.
2. **What "correct" means for core rendering.** The 503 golden SVGs are abcjs output, so
   byte-comparison gates **compat mode**, not core — core renders in its own style by
   design, as v2 diverges visually from v1. Core needs either structural comparison
   (element counts and relative positions, as `abc-vs-abcm2ps` does in this workspace) or
   its own committed baselines like v2's `ExtendedModeSnapshotTests`. **Decide before
   writing renderer code**; the first snapshot test bakes it in.
3. ~~**CI corpus checkout.**~~ **DECIDED 2026-07-19: deferred deliberately. Do not
   re-open.** abcts has no git remote — it is local-only, so there is nothing for CI to run
   against. Publishing is a product decision, not a technical one, and Lance has deferred
   it. **The local gate IS the gate for now**: run `npm test` before every commit, because
   nothing else will.

   When abcts is published, the corpus strategy is already settled: **commit a ~3.3MB
   snapshot** (436K fixtures + 2.9M `.parse.json` goldens) into abcts rather than checking
   out ABCMusicKit in CI. ABCMusicKit is private, so a checkout-based workflow means no
   external contributor could ever run the corpus gate — on a fork or a PR. ARCHITECTURE.md
   makes the corpus the only gate that matters, and a gate only ICM Labs can execute does
   not survive contact with contributors. Licensing is clean: the fixtures are ICM Labs'
   own and the goldens are abcjs output, and abcjs is MIT.
4. **Decoration and chord-symbol vocabulary** — settle against v2 (see above).
5. **abcMusicKit2 pinning** — core's design reference is under active development. Pin to a
   tag or follow head?

---

## Known risks, ranked

1. **Lyrics are verified only by unit tests written alongside the implementation.** The
   goldens do carry `lyric` data that has never been folded in. Highest-value remaining
   gate work.
2. **Beaming has 4 unanalysed failures** (`S5-directives`, `S7-voices`, `S8-layout`,
   `ragtime-nightingale`). One beam rule — that a space does not break a beam when it
   follows a tie — was derived empirically from a single fixture, not from either
   reference.
3. **Two of the three normalizations rest on one fixture each.** `octaveShift` in
   particular masks a real semantic question: abcjs moves `verticalPos` too, implying it
   treats `octave=` as a *written* transposition, while core documents it as a *sounding*
   shift. Those are contradictory claims about where noteheads go. **The first SVG
   comparison will settle it** — and this gate never will. Worth resolving against v1
   before layout is built on it.
4. **`ok: false` is unreachable.** Nothing emits `error` severity. The branch is no longer
   lossy, but it is still a contract with no producer.
5. **`Accidental.natural === 0` is falsy**, and `accidental: null` means "inherit from
   key". `if (pitch.accidental)` — the idiomatic check — collapses two musically opposite
   cases. A renderer written that way produces wrong pitches in every key but C major.
   **Read `model.ts`'s comment on `Pitch.accidental` before touching accidentals.**

---

## Reference policy (unchanged, and load-bearing)

| Question | Reference |
|---|---|
| What should the output BE? | **v1 `abcMusicKit`** — production, shipping, proven |
| How should this be BUILT? | **v2 `abcMusicKit2`** — modern design |

Never port an algorithm out of v1: its internals are abcjs's internals wholesale, including
the slow and awkward parts. v2 is not a behaviour oracle — it has known gaps against v1.

abcm2ps and abc2svg are **GPL**: run the binaries and observe output, never read the source.
That is how the melisma findings in `MELISMA-RENDERING-FINDINGS.md` were produced.
