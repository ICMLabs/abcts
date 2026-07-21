# abcts — Checkpoint, 2026-07-19

> **SUPERSEDED by `CHECKPOINT-2026-07-21.md`.** Read that first for current state and
> the remaining diffs. This file stays accurate for the renderer's first slices and for
> the lessons recorded in it.

First renderer slices. Supersedes `CHECKPOINT-2026-07-18.md`, which remains accurate for
the parser and whose risk list is still live except where noted below.

**Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **288 passing** (74 parser + 206 renderer + 8 compat) |
| Parser content parity | 39/39 gated fixtures, unchanged |
| **Render structural parity** | **40 of 41** — the 41st is a recorded abcjs bug |
| **Visual baselines** | **41 of 41**, committed geometry snapshots |
| Typecheck / lint / build | clean; ESM + CJS + `.d.ts`, `.` and `./renderer` entry points |
| Renderer source | `src/renderer/{glyphs,layout,svg,index}.ts` + `scripts/gen-glyphs.mjs` |
| Compat layer | none — zero code |

Renders today: staff, all clefs, key signatures, meters, tempo marks, part labels,
noteheads and chords with stems, flags, beams and ledger lines, accidentals, dotted
durations (including double and triple dots), rests, barlines — across MULTIPLE VOICES,
each on its own staff, wrapped into justified systems, with notes spaced by duration on
abcm2ps's measured square-root curve, with all six barline shapes, slurs, ties, grace
notes, chord symbols, lyrics and decorations.

**Everything in the model now reaches the page**, except the decorations listed below.
Whole tunebooks render, each tune headed by its title.

**Every note in the corpus draws.** No fixture has missing output.

**The corpus is complete.** Every fixture is either reproduced or a recorded divergence,
asserted as such — adding a new fixture fails the suite until someone decides which it is.

---

## The three open decisions are settled

All three are recorded in ARCHITECTURE.md § Rendering. In brief:

1. **Glyph source — inline SVG paths**, extracted from Bravura at build time. Output is
   self-contained; an embedded woff2 would render as tofu wherever the font is absent.
   Metrics come from `bravura_metadata.json`, already in staff spaces, so only outlines
   need the font binary. `src/renderer/glyphs.ts` alone is OFL 1.1; the rest stays MIT.
2. **Correct means structural**, against `golden/*.elements.json` — abcjs's laid-out
   elements, not its SVG. The deferred second half — visual baselines — **now exists**;
   see below.
3. **Prose text is `<text font-family="serif">`** — the OPPOSITE call from glyphs, and
   deliberately so. A missing serif falls back to another serif; a missing Bravura falls
   back to tofu. Self-containment is worth paying for in noteheads, not in words.

**The checkpoint was wrong that core had no oracle.** It reasoned from the 503 SVGs,
which do only gate compat. Every fixture also ships an element dump with sequence and
staff positions. That is the previous checkpoint's own lesson turned on itself: *"no
oracle exists" should be verified against the data before it is believed.*

---

## Compatibility modes — and why strict is the DEFAULT

Mirrors abcMusicKit's three, and `abcjs-strict` is the default because a replacement
whose default output differs from the thing it replaces is not one.

| Mode | |
|---|---|
| `abcjs-strict` | reproduce abcjs, bugs included. **Default.** |
| `abc2.1` | the standard read correctly |
| `extended` | beyond the standard |

**The mode gates BEHAVIOUR, not just look**, and that is the point. Every place core
deliberately departed from abcjs was already recorded as a KNOWN_DIVERGENCE; under modes
those became the difference between modes rather than permanent divergences. `+:`
continuations and the spaced lyric hyphen are both mode-gated now, and lyric parity went
8/10 to 9/10 because strict reproduces abcjs exactly on `ave-verum-corpus`.

### Spacing: one constant, not a second engraver

abcjs computes a note's width as `sqrt(duration * 8)` units of 30px
(`write/layout/voice-elements.js:23`, `engraver-controller.js:43`) — the SAME square-root
law abcm2ps uses, differently calibrated. abcjs is `sqrt(d) * 10.949` staff spaces against
core's `sqrt(d) * 13.0`. Predicted 42.43px for a quarter note; the goldens measure 42.43px.

### `abcts/compat`

`import { renderAbc } from 'abcts/compat'` — abcjs's signature, its CSS classes, its
`data-name` hooks, its density, and its padded element width. The bar is VISUAL
EQUIVALENCE plus the same DOM, not byte-identical SVG: the markup is core's own (fewer
wrappers, no `xlink:href`, `currentColor`), which leaves room for optimisation that
cannot change what is painted.

Deliberately absent rather than stubbed: abcjs's audio and timing methods and its
`engraver`. A method returning a plausible number is worse than one that is missing.

### Strict-mode fidelity gaps — BOTH CLOSED, 2026-07-20

- ~~`S1-decorations`~~ — abcjs drops `!staccato!` and strict did not. Closed as a RULE:
  a `!name!` survives strict only if it is in one of abcjs's FIVE decoration tables, and
  `staccato` is in none while its `.` shorthand hard-codes the name. Filtering against
  `legalAccents` alone — the obvious list — dropped every dynamic and hairpin in the
  corpus and cost five fixtures, which is how the other four tables were found.
  **Note content 39/39 → 40/40**: the fixture moved from excluded to gated and matching.
- ~~`frere-jacques`~~ — closed as a CONTENT divergence. abcjs's
  `getBrackettedSubstring` gives up after 5 characters on an unmatched `+`, consuming
  six; ours consumed one. Six lands on a non-note letter and one does not, and the whole
  50-against-45 gap was that single character. All 45 notes now agree on pitch and
  duration exactly. **Lyrics 9/10 → 10/10, zero divergences** — that entry was recorded
  as downstream of this one and proved to be.

  A residual entry remains, narrowed to what actually differs: 17 source offsets, 8
  decoration counts, 1 chord symbol — abcjs attaching marks it finds in English prose.
  Emulating that buys nothing a reader would see. Pitch and duration are asserted in
  `parse.test.ts` so the exclusion cannot hide the part that agrees.

---

## Running it, and looking at it

| | |
|---|---|
| `abcts tune.abc` | render to stdout or `-o file.svg`. `--width`, `--first` |
| `npm run parity` | every parity axis in one view |
| `npm run compare` | abcts vs the abcjs goldens, side by side or overlaid |

`npm run compare` adapts abcMusicKitWorkbench's technique — v1 in cyan over abcjs in
magenta, black meaning agreement — but with an important qualification. That overlay
works for v1 because v1 is a byte-parity port with identical pixel coordinates. Core is
not: it has its own spacing engine and its own units, so overlaid raw the two would not
align at all.

So the default is SIDE BY SIDE, which answers the question no gate here asks — does core's
engraving read as well as abcjs's. The overlay is offered too, staff-aligned, where
horizontal disagreement is expected and VERTICAL disagreement means a wrong pitch. It
becomes a true match test when compat mode exists.

### What the first look showed

Core's spacing is about **19% looser than abcjs's** — abcjs sets a quarter note at 5.47
staff spaces, core at 6.5 — so `twinkle` wraps to two systems where abcjs fits it on one,
despite core's default system being wider (90 staff spaces against abcjs's 86.5).

Not a bug: core follows abcm2ps's density through abcMusicKit2's oracle-calibrated
constant, and abcm2ps is looser than abcjs. But it is the single most visible difference
between the two renderings, and it is a decision that should be recorded rather than
discovered.

---

## Parity tracker — `npm run parity`

One view of how close core is to its references. The numbers come from the assertions
themselves, so the report cannot drift from the gates.

| Axis | | |
|---|---|---|
| Note content | 39/39 | 2 known divergences |
| Beam grouping | 37/41 | 3 open: S5-directives, S8-layout, ragtime-nightingale |
| Lyrics | 8/10 | 2 known divergences |
| Render structure | 40/41 | 1 known divergence |
| Visual baselines | 41/41 | self-referential |

### "v1 parity" is not a separate axis, and here is why

ARCHITECTURE.md names two references, but they are not independent. v1 is a direct PORT
of abcjs and its `abcjsStrict` path is byte-identical to abcjs by construction — v1's own
`SVGComparison` tests gate exactly that.

**Verified rather than assumed**: rendering `simple-c` through v1's CLI and diffing
against the abcjs golden gives identical staff-line coordinates, identical stem paths
(`M 80.66 89.18L 80.66 115.01`), identical barlines. The files differ only in packaging —
v1 emits `<defs>` + `<use>` where the golden inlines each path — and in a default page
width.

So the abcjs goldens ARE v1's shared surface, and every number above measures both.

What v1 has BEYOND abcjs is its extended mode: per-element colour, modern collision
detection, theory overlays, tablature. That is feature coverage, not numeric parity, and
no amount of corpus diffing answers it. abcts implements none of it. Tracked as an
explicit gap rather than folded into a percentage.

Also unmeasured, and listed by the tracker: compat mode (zero code, and nothing consumes
the 503 SVG goldens) and visual CORRECTNESS (baselines catch change, not wrongness —
nothing compares core's rendering to a reference image).

---

## What the render gate checks, and what it cannot see

`tests/renderer/structural.test.ts`, whose header carries the full list. Summarised:

**Compared:** element sequence (clef, key, meter, tempo, note, rest, bar) and the staff
step of every notehead, mapped from abcjs's numbering where 0 is C4 to core's where 0 is the
middle line.

**Not seen, and green does not mean these work:**

- **First tune, first voice only.** `clefs` is eight tunes and passes on tune 1.
  `voice-octave-shift` passes on its *unshifted* voice, so it does **not** settle
  risk 2 below. Core now RENDERS every voice, but the gate still reads `staves[0]`
  because abcjs's own dump is regrouped per system and the two engines break lines
  differently — extending it to every voice is real work and the best remaining
  gate improvement.
- **Notehead spine only.** Slurs, ties, grace notes, chord symbols, decorations and
  **accidentals** are not `children` elements in abcjs's layout. `vree-grace-notes` and
  `curves` are green with neither grace notes nor slurs drawn. Chord noteheads ARE gated.
- **Rest position.** Presence only. abcjs anchors every rest at its pitch 7 whatever the
  duration because its glyphs carry different origins than SMuFL's; the conventions are
  not comparable.
- **Tempo content.** abcjs's tempo element is a zero-width marker carrying no text or
  rate, so only its presence is gated; what it says is unit-tested.
- **No visual property at all** — spacing, stem direction, beams, ledger lines. This is
  how the viewBox clipping bug below survived: no gate can see geometry.

**The gate is proved to fail:** perturbing the staff mapping by one step fails every
renderable fixture, and it asserts its own sensitivity to staff position. Anything the
gate cannot see is covered by direct unit tests instead — which is why `keyFifths`,
`noteGlyph`, `accidentalGlyph`, the clef arithmetic, `Q:` parsing and SVG text escaping
all have their own.

---

## The ten empty goldens — FIXED, in abcMusicKit

Root cause was in abcjs, not the harness: `abc_parse.js` drives parsing with
`while (line)`, and a blank line is `""` — falsy — so parsing stops at the first empty
line. `dump-elements.js` fed raw fixture text straight to `Parse.parse()`, and all ten
affected fixtures open with a `%` comment block followed by a blank line. Nothing to do
with multi-tune input, which was the obvious-looking but wrong hypothesis.

Fixed by routing through `TuneBook` first, as abcjs's own api does and as `dump-parse.js`
already did. The `startPos - header.length` argument is load-bearing — without it the
header strip shifts every `startChar`. All 31 previously-good goldens verified
byte-identical. Committed as `ca6614b` in abcMusicKit.

Two latent instances of the same falsy-blank-line bug remain in `dump-draw.js:96` and
`dump-transpose.js:35`. Neither generates goldens in this set; same one-line fix if ever
pointed at a comment-headed fixture.

---

## Visual baselines — the second half of the gate

`tests/renderer/baselines/*.txt`, one per fixture, recording rendered GEOMETRY: element
positions and widths, glyph names and placements, line coordinates, text, and the drawing
bounds. `tests/renderer/baseline.test.ts` compares; `npm run baseline` re-records.

**Structure catches WRONG, baselines catch CHANGED**, and the split is real rather than
theoretical. With stem direction inverted so every stem in the corpus points the wrong
way, the structural gate is **fully green** and the baselines fail 39 of 43. Same for a
0.1 spacing change (41 failures) and dropped ledger lines (30).

Geometry rather than pixels or SVG: no rasterizer exists in this toolchain and binary
diffs are unreviewable; full SVG would embed ~40KB of glyph paths per fixture, so a glyph
regeneration would churn all 41 at once and hide real movement. Glyph outlines are
version-controlled in `glyphs.ts`, which git already covers.

Bounds are recorded first, deliberately — the clipping bug that silently cut high ledger
lines and tempo marks out of the output now fails here.

**Re-recording without reading the diff defeats the mechanism.** Read it, and commit
baselines alongside the code change so a reviewer sees both.

### What the baselines exposed, and what came of it

44 notes across 7 fixtures drew NOTHING — the dotted-duration gap. Recorded as an
explicit per-fixture count rather than left to sit silently in 41 files, precisely so the
fix would announce itself. **It did**: implementing dots broke exactly nine tests — the 7
baseline snapshots, that count, and the unit test asserting dotted durations return null
— and nothing had to be hunted for. `UNDRAWN_NOTES` is now empty but kept, as the
assertion that a future duration change does not reintroduce holes.

Undrawn *rests* were checked separately and are correct: ABC's invisible `x` and spacer
`y`, which occupy space and print nothing.

---

## Next work — the corpus no longer drives it

With 40 of 41 reproduced, the diff has stopped picking features. What remains is known
from the code rather than from a failing fixture, which is a real change in method: from
here, work needs either new fixtures or the visual baselines.

**CORRECTION, 2026-07-19.** An earlier revision of this section claimed "everything in
the model now reaches the page". That was wrong, and wrong in an instructive way: it was
asserted from having built the features I remembered building, rather than from checking.
Auditing which model fields the renderer actually READS found six it never touches — its
only mentions of `tuplet` and `style` are in comments.

### Ranked by how often the corpus hits it

| Gap | Corpus | State |
|---|---|---|
| ~~Tuplet brackets and numbers~~ | 177 members | **DONE** — beamed groups print the number alone, unbeamed get a bracket. 26 numbers across 4 fixtures. |
| ~~Voltas / 1st–2nd endings~~ | 45 | **DONE** — parsed into `Measure.volta` (a STRING: `1,2` and `1-3` are legal) and bracketed. 32 labels across 2 fixtures. |
| ~~Mixed-length chords (`headDurations`)~~ | 18 | **NOT A GAP** — see below. We already match abcjs; rendering it would diverge. |
| ~~Annotations (`"^text"`)~~ | 15 | **DONE** — `^`/`_` stack in abcjs's line order, `<`/`>` sit beside the note. |
| ~~Microtones~~ | 4 | **DONE** — quarter-tone pair in all modes; three-quarter tones drawn in `abc2.1`/`extended` and BLANK in strict, as abcjs leaves them. Was rendered WRONG (full sharp), not merely unrendered. |
| ~~Styled noteheads~~ | 1 inline, 16 via `[K: style=]` | **DONE** — diamond, x, triangle, rhythm slash; 6 Bravura glyphs added. Count understated it: it missed the K: form. |
| ~~Melisma extension lines~~ | 1 | **DONE** — strict prints abcjs's literal `_`, non-strict strokes the extender to the last held notehead (Gould p.447). NO GATE COVERS IT; see below. |
| ~~`V:… octave=`~~ | 1 | **DONE** — moves the WRITTEN pitch (abcjs-verified). The gate had been compensating for the bug; compensation removed. |

**CORRECTION, 2026-07-19 (later).** "Mixed-length chords, 18 occurrences" was the top of
this list and was not a gap at all. The entry was built by counting how often a model
field is POPULATED, which is not the same as counting where the rendering is wrong.

Probing abcjs 6.6.3 directly settles it: it takes ONE head glyph for the whole chord,
from the FIRST note's duration. `[C4G]` is two whole heads, `[CG4]` two quarter heads,
`[C4G2]` two whole heads. abcts already produces exactly that, because our chord's
`notatedDuration` IS that first duration. Drawing `headDurations` per head would be
better engraving and a divergence — which belongs in `abc2.1`/`extended`, not in the
strict default. It is now pinned by a test that fails if either rule changes.

The corpus could never have answered this. All 18 of its mixed chords combine eighths,
quarters and sixteenths, and those three share a single filled notehead — so every
candidate rule produces identical ink. A frequency count over a saturated corpus reads
like evidence and is not; the reference had to be asked directly.

**BASELINES RENDERED THE FIRST TUNE ONLY — found and FIXED 2026-07-19.** `baseline.test.ts`
took `scores[0]`, so `S3-note-syntax` was watched on 1 of its 25 tunes and `S5-directives`
on 1 of 6. The structural gate documents this limit about itself; the baseline gate did
not, and it mattered more there, because baselines are the only thing watching the *look*.

It was worse than untested. The corpus's only melisma is in `S5-directives` tune 5, so
melisma rendering could not move a committed baseline in either direction — and a real bug
in it did not. A synthetic unit test passed while the real fixture silently lost its
underscore. Rendering the actual fixture found it; nothing in the suite would have.

Now **119 tunes baselined, up from 41**, and mutating the strict underscore away fails
`S5-directives` where it previously failed nothing. Each tune is snapshotted separately
rather than through `layoutBook`, which reports `top: 0` for the book instead of each
tune's real top — that bounds line is what once caught a fixed margin clipping ledger
lines out of the drawing. The re-record was purely additive: 12,121 insertions, zero
deletions, so every previously committed geometry is byte-identical.

### `%%score` / `%%staves` — voices that should SHARE a staff do not

**Investigated 2026-07-20; recorded, not fixed.** Bigger than the "staff braces" it was
filed as, and worth stating precisely before anyone picks it up.

We parse the directive and take the voice ORDER from it, discarding the grouping
punctuation. `( )` means *these voices share one staff*, and that is the part not
implemented — so a 5-voice piano rag renders as five staves.

Measured against abcjs 6.6.3 on `ragtime-mini`, whose `%%score { ( 4 5 ) | ( 1 2 3 ) }` it
lays out as voiceNumber/voiceTotal `[0/2 1/2 0/3 1/3 2/3]` — **two** staves carrying two
and three voices. We give it five. **9 of the 11 corpus fixtures with the directive render
the wrong number of staves**, including `multi-voice-rest-collision`, which is named for a
problem that only exists once voices share.

**No gate sees any of it.** The structural gate reads voice 0 only, and baselines record
our own output, so a wrong staff count is invisible to both. A pinned assertion in
`layout.test.ts` is the only thing watching, written to fail the day sharing lands.

Why it was not done in the same pass: the layout pipeline is one-staff-per-voice from
`plans` through `voiceAnchors` to `systems`, and sharing changes the fundamental unit from
voice to staff — measure packing has to interleave several voices by x, and stem direction
becomes a per-voice convention within a staff rather than a per-note decision. That is a
real refactor, not an edit.

Braces and brackets were deliberately NOT drawn first. A grouping mark around five staves
that ought to be two is decoration on a wrong structure; the glyphs (`brace`, `bracket`)
are in Bravura and the marks are an afternoon once the staves are right.

### Ponytail debt — triaged 2026-07-21

33 `ponytail:` markers in `src/`. Triaged rather than counted, because the interesting
question is which are WRONG, not how many there are.

**Three were stale, and one of those was still running.** `layout.ts` said "no text
metrics, so the advance past a tempo direction is estimated at half the font size per
character" — and it still was, using the flat formula `textWidth` had replaced everywhere
else, so a narrow direction reserved as much room as a wide one. Fixed. The other two were
misinformation only: `layout()` documented as "first voice only, one system, no line
breaking" (all three long since false), and the `V:` field claiming clef/name/transpose are
unparsed (clef, octave and style are read).

**The rest divide cleanly, and neither group needs work now:**

*Legitimately deferred — a documented ceiling that is the right call at this size:* the
system-break truncations (melisma, hairpin, a curve spanning three systems), tenor-clef
accidental irregularity, no percussion glyph, one accidental column per chord, fixed lanes
rather than a skyline, three-voice stem convention, `"@x,y"` free placement, glyph-level
`data-name`.

*Real but unexercised — the corpus barely touches them, and every frequency count this
session that looked large turned out not to be:* decorations inside a chord (**0**
occurrences), microtones inside a chord (**0**), multi-verse melisma (**0**), chord symbol
inside a chord (**1**), mid-tune `Q:` (**1**, not the 20 a careless count suggested),
header `P:` part order (**3**).

The lesson from the gap list applies to the debt list too: **count what is wrong, not what
is populated.** A first pass at mid-tune `Q:` said 20 by counting every `Q:` after the
first `K:` — which in a multi-tune file is mostly the next tune's header.

### Then, none of which the corpus hits as hard

1. ~~**Decoration coverage is partial by design**~~ — **CLOSED 2026-07-20.** It was 15
   names mapped and **145 of the corpus's 245 decoration occurrences reaching the page as
   nothing**. Now zero: every occurrence either draws or is an asserted blank matching
   abcjs. 104 glyphs (from 55), plus a spanner pass for hairpins and glissandi, text for
   the navigation directions, and stem placement for tremolo.

   Four things worth carrying forward from that work:

   - **The gap list undercounted it.** "Styled noteheads: 1" counted the inline
     `!style=…!` and missed the `[K: style=…]` form, which is what the corpus actually
     uses. Frequency counts over model fields measure population, not wrongness.
   - **Three more mode splits fell out**, all the same shape as melisma and the
     microtones: abcjs ACCEPTS a decoration and then paints nothing. `invertedturn`,
     `turnx`, `invertedturnx` draw in `abc2.1`/`extended` and are blank in strict.
     Distinct from a name abcjs REJECTS, which the parser drops before the renderer sees
     it — different mechanism, different place to handle it.
   - **abcjs's element dump is not a reliable answer to "does it paint this".** It misses
     anything attached through `addOther`, which hid all eleven dynamics, then `slide` and
     `breath`. It cost the same mistake twice.
   - **Diffing the SET of SVG paths is unsound.** It loses duplicates — a second identical
     tremolo stroke vanishes — and reports staff lines as new when a decoration shifts
     them half a pixel. **Counting drawable elements against a plain note** is the method
     that held up, and is the one to use next time.
2. **No text metrics.** Everything that centres or advances past text uses an estimated
   character width. Real metrics would also unlock lyric-driven spacing and melisma lines.
3. **Fixed lanes, not a skyline.** Chord symbols, ornaments, dynamics, lyrics, parts and
   tempo each own a staff step. Nothing collides in the corpus, but a note on far ledger
   lines can reach into the lyric lane.
4. **A split curve loses its continuation hook** when the next system's first note sits
   hard against the clef. A curve spanning three systems gets its ends and no middle.
5. **Beam grouping** differs from abcjs on 3 fixtures; third cause unidentified.
6. **32nd notes and shorter reuse the 16th flag.**
7. **`%%score` staff grouping** — no braces or brackets joining a piano staff.
8. **Page furniture** beyond tune titles: no composer, rhythm or page numbering.
9. **Tenor-clef key signatures** are knowingly wrong.

### Strict-mode fidelity gaps

- `S1-decorations` — abcjs drops `!staccato!`; strict does not drop it yet.
- `frere-jacques` — strict parses the `+:` prose as music like abcjs, so the structure
  matches, but lexes it differently: 50 notes against 45.

Visual baselines cover geometry changes in all of the above: any change to spacing,
stems, beams or bounds fails the baseline gate even though structure stays green. What
they do NOT cover is whether the output is right in the first place — see `npm run
compare`, which is the only thing that answers that and needs a human.

**The renderer phase may now change the parser** — clef and `Q:` both did, and the
39/39 parser gate held through both. Treat that as settled unless it starts costing.

Carried forward from 2026-07-18 and still open: decoration/chord-symbol vocabulary
(settle against v2), abcMusicKit2 pinning.

---

## Known risks, ranked

1. **Lyrics are now GATED against the goldens** — the 2026-07-18 risk is closed. Seven
   fixtures match; three diverge with recorded reasons (`frere-jacques` the known abcjs
   `+:` mis-parse, `ave-verum-corpus` a deliberate spaced-hyphen divergence,
   `S5-directives` an UNANALYSED 2-note drift between multiple `w:` lines — the next
   thing to look at).

   Building the gate found two real parser bugs immediately: `*` and `|` were handled as
   whole tokens but not when ATTACHED to a syllable, which is how every tune writes
   them. It also arbitrated a question the code had recorded as unanswerable — the
   comment claimed the goldens carry no lyric fields. They carry them on every fixture.
2. **`Voice.octaveShift` — sounding vs written — is still unresolved.** The previous
   checkpoint expected the first SVG comparison to settle it. It has not:
   `voice-octave-shift` passes on voice 1, which has no shift. Still open, still needs
   voice 2 and a v1 comparison.
3. **Beam GROUPING differs from abcjs on 3 fixtures** (`S5-directives`, `S8-layout`,
   `ragtime-nightingale`), a handful of links each — the asserted `BEAM_FAILURES` set.
   Beams and flags now RENDER; this is about which notes get grouped, not how a group is
   drawn.

   **RESOLVED IN PART, 2026-07-19 (later): 36/41 → 37/41, `S7-voices` now matches.**

   The tie-then-space rule was read here as "verified load-bearing" because removing it
   dropped parity to 35/41. That inference was one step short. The rule was not right; it
   was too BROAD, and `ragtime-mini` depended on the part of it that happened to be true.
   Both the keep-it and drop-it experiments score worse than the actual rule, which is:

   |           | tie + space | space alone |
   |-----------|-------------|-------------|
   | **chord** | NO break    | break       |
   | **note**  | break       | break       |

   A tie suppresses the break only when what was tied is a CHORD — almost certainly an
   abcjs bug, and reproduced. A second exception turned up in the same pass: a space
   arriving while a decoration still awaits its note does not break either (`de/f/P ^c`
   beams through, `de/f/ ^c` does not). That was the unidentified third cause.

   How the wrong rule survived: its test observed the chord case — the comment cites
   `[G=Bg]/4- [GBg]/4` — then coded plain NOTES and asserted the chord's answer for them.
   Green, and wrong, and it made the false rule look measured. A fourth entry for the
   list in §4 below: a test whose comment and body describe different inputs.

   Note that "removing it costs a fixture" proved only that SOME of the rule was
   load-bearing. It could not distinguish a correct rule from an over-broad one, and it
   was read as if it could. Asking abcjs directly settled it in one probe.
4. **Three ways a verification can lie, all hit this session.**
   - A no-op MUTATION looks exactly like a passing suite. One spacing mutation matched
     nothing because lint had reformatted the target line and reported a clean 164/164.
     Mutations now assert the edit applied before running.
   - A TEST that cannot distinguish the cases it claims to cover. The slur-nesting test
     used `((GG)GG)`, where both slurs open on the same note, so stack and queue
     matching return the same index — replacing `pop()` with `shift()` passed all 177
     tests. `(G(GG)G)` discriminates. This is the parser audit's blind spot exactly, and
     it was found by mutation rather than by review.
   - A MEASUREMENT that reads the wrong number. A grep for the mutation failure count
     matched elsewhere in vitest's output and reported 3 where the truth was 9,
     flattering the code by understating what the tests caught. Read `Tests N failed`.

Risk 5 of the 2026-07-18 list — the falsy `Accidental.natural` — is **closed**: the
renderer checks `=== null`, and two tests fail if that is rewritten as truthiness,
verified by making the edit and watching them go red.

The clef risk from this document's first revision is **closed**: clefs are parsed as
shape + staff line and `score-reorder` now agrees with abcjs at step -8.

A bug worth recording because no gate could have caught it: the drawing box was a fixed
margin and silently CLIPPED anything outside it — high ledger lines, tempo marks. Found
by rendering and looking. Vertical extent is now measured from placed content. The
structural gate sees no geometry, so visual baselines remain the only future guard.

---

## Reference policy (unchanged, and load-bearing)

| Question | Reference |
|---|---|
| What should the output BE? | **v1 `abcMusicKit`** — production, shipping, proven |
| How should this be BUILT? | **v2 `abcMusicKit2`** — modern design |

Never port an algorithm out of v1. v2 is not a behaviour oracle. abcm2ps and abc2svg are
GPL: run the binaries and observe, never read the source.
