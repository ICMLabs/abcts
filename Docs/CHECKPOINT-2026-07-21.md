# abcts — Checkpoint, 2026-07-21

Supersedes `CHECKPOINT-2026-07-19.md`, which stays accurate for the renderer's first
slices and for the lessons recorded in it. **Read this, then `ARCHITECTURE.md`, then
`CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **376 passing** |
| **Note content parity** | **41/41 — ZERO known divergences** |
| **Lyrics** | **10/10 — zero divergences** |
| Beam grouping | 40/41 |
| Render structure | 40/41 |
| Visual baselines | 41/41 fixtures, **119 tunes** |
| Typecheck / lint / build | clean |

Content parity is complete: every corpus fixture matches abcjs on notes, durations,
offsets, decorations, chord symbols and grace notes, with nothing excluded.

---

## What closed since 2026-07-19

- **The ranked gap list** — all of it. Tuplets, voltas, annotations, melisma, styled
  noteheads, `V: octave=`, microtones.
- **Decoration coverage** — 145 of 245 corpus occurrences drew nothing; now **zero**.
  Every occurrence either draws or is an asserted blank matching abcjs.
- **Text metrics** — a flat half-em-per-character estimate, median error **24%**, replaced
  by a measured per-character table. Median **0.00%**.
- **`%%score` / `%%staves`** — voices grouped with `( … )` now SHARE a staff, with the
  stem convention and brace/bracket connectors. Was one staff per voice: five staves for a
  piano rag abcjs renders on two.
- **Both strict-fidelity gaps** — `!staccato!` and the `+:` prose.
- **Beam grouping 37/41 → 40/41.**
- **Compat DOM** — the claim "a stylesheet written against abcjs keeps working" is now
  measured against abcjs's own 29 golden SVGs, not asserted. 8 of 8 classes.

---

## THE REMAINING DIFFS — all three, precisely

This is the list to close. Each has been diagnosed to a cause, not left as a symptom.

### 1. Structural gate — `frere-jacques`, two causes

**(a) Mid-tune `Q:` is unimplemented.** `frere-jacques:21` has `Q:"Allegretto" 1/4=100`
AFTER `K:C` on line 20. abcjs honours it and emits a `tempo` element; we set
`score.tempo = null` and emit nothing. Confirmed: our `score.tempo` is `null` for this
fixture.

This is a recorded ponytail (`model.ts`, `parser.ts` — "header `Q:` only; a mid-tune `Q:`
is ignored rather than mis-applied"). It is the ONLY mid-tune `Q:` in the corpus — an
earlier count said 20, which was wrong: it counted every `Q:` after the first `K:`, and in
a multi-tune file that is mostly the next tune's header.

Fixing it means `Q:` on `Measure` alongside `keyChange`, the same shape mid-tune `K:` and
`M:` already use.

**(b) We emit a `timeSignature` element and abcjs does not.** `M:4/4` is on line 14, in
the header, so we are arguably right and abcjs's `+:` mis-parse loses it. **Verify before
changing anything** — if abcjs is simply broken here, matching it is the goal only if the
project still wants strict to reproduce abcjs bugs, which it does.

### 2. Beam grouping — `frere-jacques`, 3 links

All inside the `+:` prose abcjs lexes as music. We BREAK where abcjs KEEPS, at a space
with no pending attachment (`…gs to their…`). Genuinely prose-specific, unlike the rest of
that fixture's residual, which dissolved into two ordinary features.

Where to start: abcjs sets `el.end_beam = true` unconditionally on whitespace
(`abc_parse_music.js:1242`) and promotes it only for durations under a quarter
(`addEndBeam`), which predicts a break here. Something downstream in the beam builder
reconciles that, and it is the code to read — the tokenizer has been read three times and
gives a different answer each time.

### 3. Offsets — `S3-note-syntax`, 2 of 466

abcjs's span for `^3/2G` starts at the `G`, EXCLUDING the microtone fraction, while a
plain `^G` INCLUDES the accidental. It is inconsistent with itself.

**Recommend leaving this.** Matching it would make our source ranges inconsistent the same
way, and they would be worse for the editor cross-linking they exist for — a caret inside
`^3/2` would identify no note. The gate already tolerates it as a 2-note allowance with the
reason recorded.

---

## Method notes that earned their place

Six failures this session came from trusting a cheap signal over the artifact. They are
listed because every one cost real time and would have cost more unchecked.

1. **abcjs's element dump misses anything attached via `addOther`.** It hid all eleven
   dynamics, then `slide` and `breath`. Cost the same mistake twice.
2. **Diffing the SET of SVG paths loses duplicates** and reports staff lines as new when a
   decoration shifts them half a pixel.
3. **Counting drawable elements misses position-only changes.** "Does abcjs draw a brace"
   measured delta +0; it draws one, and the count matched because staff lines shift right
   to make room.
4. **Reading the wrong worktree.** A cross-check sent to the abcMusicKit2 agent claimed a
   gap that does not exist on their shipping path, because `Code/` was read instead of
   `Code-v2/` — and the injection point was in a third repo besides. CLAUDE.md warns to
   confirm the lane; the warning was skipped because reading felt safe.
5. **Frequency counts measure population, not wrongness.** "Mixed-length chords, 18
   occurrences" was not a gap at all. "Styled noteheads, 1" was 17. "Mid-tune `Q:`, 20"
   was 1.
6. **A recorded reason is a hypothesis until something tests it.** `frere-jacques` was
   carried for weeks as "closing it means emulating abcjs's lexer on arbitrary English".
   Reading which decorations actually differed took ten minutes and found two ordinary
   unimplemented features (`U:` symbols and a lowercase `t` shorthand). The note described
   a symptom and inferred a cause nobody had checked.

**Three GATE bugs were found this session**, all of the same shape — a comparison quietly
measuring something other than what its comment claimed:

- the lyric gate omitted `&` overlay events;
- the structural gate read `staves[0].elements` under a comment asserting "staves[0] is
  that voice", and began comparing abcjs's voice 0 against ours *plus every other voice*
  the moment staves could be shared;
- the beam gate concatenated beam ids across tunes and voices, so tune 10's group 1 next
  to tune 11's group 1 read as one continuous run.

Two of the four beam "failures" were gate or model bugs rather than beam bugs. **Check
what a number MEANS before chasing it.**

---

## Not started

**Audio** — parked deliberately. Rendering has cleared the bar it was waiting on.

**Playwright** — the compat gate now checks class NAMES against abcjs's goldens. What it
cannot check without a browser: that a stylesheet SELECTS the same elements, that a handler
hit-tests the same region, that the page does not reflow. That is where a browser would
earn its place, and not before.
