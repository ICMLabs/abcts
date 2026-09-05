# abcts — Checkpoint, 2026-07-22 (evening)

Supersedes `CHECKPOINT-2026-07-22.md` — read this one. The earlier file's *method notes*
still stand; its vertical-placement section is history now that the work landed.

**Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.**

---

## The contract

**`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, and any
divergence is a defect rather than a tolerance.** `abcjs-extended` fix abcjs's bugs
and add what the other engines have; their parity target is abcm2ps and abc2svg, via the
golden sets in v1, v2 and cpp, observed through OUTPUT only.

The repo is **public** as of today. Licence notices are obligations, not courtesies.

---

## Where things stand

| Axis | | |
|---|---|---|
| Note content | **41/41** | zero divergences |
| Lyrics | **10/10** | zero divergences |
| Beam grouping | **41/41** | zero divergences |
| Render structure | **41/41** | zero divergences |
| Source offsets | **exact** | allowance list empty |
| Tests | **498** | typecheck, lint, build clean |

**Every structural gate is at 100% with no recorded divergence of any kind.**
`KNOWN_DIVERGENCES`, `BEAM_FAILURES`, `LYRIC_DIVERGENCES` and `OFFSET_ALLOWANCE` are all
empty and all asserted empty.

### Geometry — the open work

| | |
|---|---|
| Noteheads drawn | **2696 / 2696**, all 29 fixtures with SVG goldens |
| Systems matching abcjs | **28 / 29** |
| **Corpus median notehead distance** | **32.6px** (~4 staff spaces) |
| Within 25px / 50px / 100px | 11 / 21 / 24 of 29 |
| Output size vs abcjs | **0.33x** |

Best: `vree-grace-notes` 8.9px, `vree-sharps` 11.8, `vree-ties-across-bars` 12.4.
Worst: `ragtime-nightingale` 335, `frere-jacques` 244, `center-text` 141,
`multi-voice-lyrics-two-voices` 118, `score-reorder` 107, `score-reorder-shared` 98.

**Quote the per-FIXTURE median, never a per-note median pooled across the corpus.**
`ragtime-nightingale` holds 2009 of the 2696 noteheads, so pooling makes its median the
corpus's and reports 250px+.

---

## What closed today

**Structural, all of it.** Mid-tune `Q:`; `scanMusic` ends the header; `P:` in source
order; the beam rule that a space ends a beam only when nothing intervened; Gonzato §4.1.4
lyric continuation with `I:` as `%%`; per-segment `%%vocalfont`; mid-tune `K:` with
cancelling naturals; microtone source ranges mode-split.

**Geometric.** Justification (a last system ≥66% full is justified; compression
unconditional); systems follow SOURCE LINES because abcjs has no line-breaking pass;
abcjs's 15px left margin; `marginY` 4.0 → 0 because abcjs has no per-staff margin;
separations measured line-to-line; the top-text BLOCK (composer, rhythm, origin, abcjs's
font sizes, `padding.top`); `blockTop`; the glyph table WIRED, outlines and metrics.

**Infrastructure.** `<defs>`/`<use>` dedup, 0.90x → 0.33x. The pixel-parity gate, which
now tracks OFFSET as well as spread — it previously scored a drawing 100px to the left of
abcjs as perfect. `abcjs-top-line` was on the BOTTOM staff line.

**Licensing.** `LICENSE` added (there was none, in a repo ARCHITECTURE.md calls "MIT,
non-negotiable"). `glyphs-abcjs.ts` reproduces 91 of abcjs's glyph outlines — a
substantial portion of that Software — and carried only a source credit; it now carries
abcjs's full MIT notice, emitted by the generator so regeneration cannot lose it.

**`Docs/ABCJS-DIFFERENCES.md`** — the verified, public-facing list of abcjs bugs and gaps.

---

## Next, in priority order

Each is a defect. None is a judgement call any more.

1. **`ragtime-nightingale` 335px** — 46 systems, so any per-system error accumulates. It
   is the amplifier: whatever is left in system-to-system spacing shows here first and
   largest. Start by measuring its system-to-system pitch against abcjs directly, not its
   notehead median.
2. **`frere-jacques` 244px** — abcjs breaks per SOURCE LINE even mid-measure; our systems
   are measure-granular, and its `+:` prose and first real bar are one measure. The only
   fixture whose system COUNT still differs (4 vs our 2).
3. **`center-text` 141px** — needs `%%center`. abcjs's trailing `%%center` makes its music
   line not the LAST line, so abcjs justifies it unconditionally where we do not.
4. **`score-reorder` 107 / `score-reorder-shared` 98** — multi-staff. Both had a dx spread
   of 0.0 and were pure vertical/offset error, so this is staff placement within a system.
5. **`multi-voice-lyrics-two-voices` 118px** — multi-voice with lyrics.
6. **Wire the pixel axis into `npm run parity`.** It currently prints four axes at 100%
   and does not mention the one that is not.

---

## Method notes — new today

The 07-21 and 07-22 notes still apply. These are new and each cost real time.

1. **A gate measuring spread cannot see a translation.** `score-reorder-shared` scored
   dx 0.0 — perfect — while sitting 100px left of abcjs. Offsets are tracked now.
2. **The function you are looking for may not exist.** abcjs's line-breaking algorithm was
   found by listing `write/` and seeing that nothing computes one.
3. **Weight per fixture, not per note.** See the median warning above.
4. **Check the shell loop before believing the check.** A baseline verification looped over
   an unquoted file list; `little swallow` split on its space, the loop ran once on a
   concatenated name, and it printed a clean bill of health.
5. **Read v1 WITH abcjs, not abcjs alone.** v1 is byte-identical to abcjs and cites it line
   by line, having already made the improvements. Reading its cursor rather than
   re-deriving abcjs's is what solved vertical placement after four failed attempts.
6. **Four attempts against one aggregate number taught nothing.** Ganged terms cannot be
   told apart by a single metric. Decompose — title baseline, staff origin, system origin —
   and set each from its own constant.
7. **Regex probes break on reformatting.** Two "findings" this session were artefacts of a
   probe matching the wrong entry after biome reflowed a file. Both were nearly written up
   as bugs.
8. **`git stash` during a measure-fix loop silently dropped edits twice**, and numbers were
   reported from code that did not contain the change. Commit or verify with `grep` before
   trusting a measurement.
