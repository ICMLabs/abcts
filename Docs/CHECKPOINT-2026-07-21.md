# abcts — Checkpoint, 2026-07-21

Supersedes `CHECKPOINT-2026-07-19.md`, which stays accurate for the renderer's first
slices and for the lessons recorded in it. **Read this, then `ARCHITECTURE.md`, then
`CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **397 passing** |
| **Note content parity** | **41/41 — ZERO known divergences** |
| **Lyrics** | **10/10 — zero divergences** |
| **Beam grouping** | **41/41 — zero divergences** |
| **Render structure** | **41/41 — zero divergences** |
| Visual baselines | 41/41 fixtures, **119 tunes** |
| Typecheck / lint / build | clean |

Content parity is complete: every corpus fixture matches abcjs on notes, durations,
offsets, decorations, chord symbols and grace notes, with nothing excluded.

**All four parity axes are at 100% with no recorded divergence on any of them**, as of
the three commits below. `KNOWN_DIVERGENCES` in the structural gate and `BEAM_FAILURES`
in the content gate are both empty — kept, not deleted, because an empty list still
asserts: the next fixture that diverges fails there. The structural gate's divergence
suite is `describe.skipIf`'d, since vitest fails a suite with no tests in it.

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
- **Beam grouping 37/41 → 40/41 → 41/41.**
- **Render structure 40/41 → 41/41**, and the last three diffs with it — see below.
- **Compat DOM** — the claim "a stylesheet written against abcjs keeps working" is now
  measured against abcjs's own 29 golden SVGs, not asserted. 8 of 8 classes.
- **Lyric continuation across interposed directives**, and per-segment `%%vocalfont` —
  Gonzato §4.1.4. `I:` is now `%%` (ABC 2.1 §11.4) and no longer clobbers the `+:` chain,
  which was the whole leak; fonts are captured per SYLLABLE and realized in measurement
  as well as draw. Mode-split: strict reproduces abcjs's version, verified by running it.
- **Mid-tune `K:`** — drawn, with cancelling naturals. See below for the `M:` half.

---

## THE REMAINING DIFFS — CLOSED

All three are done. What follows is what each turned out to be, because in two of the
three the recorded diagnosis was wrong, and how it was wrong is the reusable part.

### 1. Structural gate — `frere-jacques`. THREE causes, not two

**(a) Mid-tune `Q:`.** Correctly identified as unimplemented. The proposed FIX was
wrong: "`Q:` on `Measure` alongside `keyChange`" would have drawn the mark mid-tune and
matched nothing. abcjs models tempo TUNE-level — `tune.metaText.tempo`, set wherever the
field sits — and puts the element at the head of system 1, ahead of music that PRECEDES
the field in the source. So a body `Q:` now feeds `score.tempo`, first-one-wins,
mirroring abcjs's own `if (!tune.metaText.tempo)`.

It is still the only mid-tune `Q:` in the corpus; that part of the note held up.

**(b) The `timeSignature`.** The claim was "we emit one and abcjs emits none". abcjs
emits one. It is on system 3, and the gate drops `staff-extra` on every system after the
first, so from inside the gate it read as absent. **The note was describing the gate's
view and calling it abcjs's behaviour.** The instruction to verify before changing
anything is what caught it.

The real difference was WHERE, and the cause was where the body starts: abcjs lexes the
`+:` prose on line 8 as music, so `M:4/4` on line 14 is a mid-tune meter, not a header
one. `scanMusic` now sets `bodyStarted` — music ends the header, and `K:` is merely where
that normally happens.

**(c) The `P:` part label — not in the list at all.** Found by diffing the two element
sequences instead of re-reading the summary. `P:A` drew at its measure's head, and in
this tune the prose and the real first bar are ONE measure with the `P:` between them, so
the label sat ahead of fourteen notes it should follow. It now anchors on
`partLabelSourceRange` — before the first event that starts after the field. Identical
placement in every ordinary tune, where the `P:` is on its own line and everything
follows it.

### 2. Beam grouping — `frere-jacques`, 3 links

The diagnosis held: we broke where abcjs kept, at a space with no pending attachment.
The rule is that **a space ends a beam only when nothing has come between it and the
note** — and a character abcjs merely warns "Unknown character ignored" about counts as
something, despite contributing nothing and leaving nothing pending. Measured across all
eight boundaries in the prose; the table is in the parser's `whitespace` case.

The pointer to read the beam builder rather than the tokenizer was reasonable and also
unnecessary. **It was neither: abcjs's WARNINGS in the golden settled it.** They name
every ignored character with its column, which killed the theory that those letters were
decorations holding the beam open — a theory that fits five of the eight boundaries and
looks convincing until you check the other three. Two layers of source had been read
three times without answering what one field of the artifact answered immediately.

### 3. Offsets — `S3-note-syntax`, 2 of 466 — LEFT ALONE, as recommended

abcjs's span for `^3/2G` starts at the `G`, EXCLUDING the microtone fraction, while a
plain `^G` INCLUDES the accidental. It is inconsistent with itself.

**Recommend leaving this.** Matching it would make our source ranges inconsistent the same
way, and they would be worse for the editor cross-linking they exist for — a caret inside
`^3/2` would identify no note. The gate already tolerates it as a 2-note allowance with the
reason recorded.

---

## Mid-tune `M:` and `K:` — key DONE, meter still open

`Measure.meterChange` and `Measure.keyChange` have been populated since the model gained
them and the renderer read neither. **`K:` now draws**, with the naturals that cancel the
outgoing key, matched glyph for glyph against abcjs's inline `key` elements. `M:` does
not, and the reason is below.

**Two corrections to the first version of this entry, both mine, both the same mistake.**
It said "`S8-layout` has three meter changes; `S6-keys` has five key changes":

- Those came from grepping the FILE. The structural gate is **first tune only** on both
  sides — abcjs's dump covers tune 0 and `layout()` takes `scores[0]` — and every
  mid-tune key change in the corpus is in a LATER tune (S6-keys' in X:602, clefs' in
  X:608). So the gate cannot see this feature at all, and the prefix-filter blind spot
  named below is **secondary** to first-tune-only, which is the real blocker.
- The "five" counted `[K: style=harmonic]` lines, which are style-only and change no key.
  The parser already guards them with `hasKeySpec`.

Method note 5 — a frequency count measures population, not wrongness — written by the
person who then made the same mistake in the same document, one day later.

### What is left: mid-tune `M:`

Still parsed and drawn nowhere. It was written, measured and reverted TWICE now, for one
reason that has not changed:

**The gate cannot adjudicate it.** Both engines put the meter at the same musical point,
but abcjs's lands at the head of a later system, where the gate drops it as a
`staff-extra` reprint, while ours lands mid-measure on system 0, where it does not. No
system-index filter can reconcile that, because WHERE a line breaks is precisely what the
gate refuses to compare. `PREFIX_TYPES` assumes a time signature only ever appears AS a
system prefix, and a mid-measure one breaks the assumption.

Doing it honestly means one of:

1. Teach the gate to distinguish a system prefix from a mid-measure change, and compare
   the latter as content. Correct, and worth doing for its own sake.
2. Extend the structural gate past tune 0. Bigger — the `.elements.json` goldens only
   contain tune 0, so it needs regeneration with the harness in the abcMusicKit repo,
   which is another lane. It would also close blind spot 1 in `structural.test.ts`
   ("seven clefs are untested by a green result").

Do NOT reach for relaxing `PREFIX_TYPES` to make the fixture pass. That trades a real
check for a green light, and the check it trades away — clef and meter on the first
system — is the only one the gate currently has on either.

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

   **It happened again the next session, to this file.** Of the three diffs recorded
   above, one named the wrong fix, one named a behaviour abcjs does not have, and one
   missed a cause entirely — while every one of them was written as settled. The three
   took under an hour once each was checked against the goldens rather than against the
   note. Recording a diagnosis makes it look tested; it is not, and the instruction to
   verify before changing anything is the only thing that catches it.

7. **A gate's view is not the reference's behaviour.** "abcjs emits no timeSignature" was
   true of what the gate SHOWS and false of abcjs — the element is there, on a system the
   gate filters. Anything read through a comparison that drops, maps or normalises has to
   be confirmed against the raw golden before it goes in a document as a fact about the
   other engine. The same filter is why the mid-tune meter gap above cannot be scored yet.

8. **Warnings are evidence, and cheaper than source.** abcjs's `warnings` array names
   every character it ignored, with line and column. It settled the beam rule in a minute
   after two layers of parser had been read three times without settling it — and it
   falsified a theory that fit five of eight cases and would otherwise have shipped. When
   the question is "what did the reference DO with this input", prefer what it says about
   its own run over what its code appears to say.

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
