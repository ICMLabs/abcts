# abcts — Checkpoint, 2026-08-01

Supersedes `CHECKPOINT-2026-07-24.md`. Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.
The older checkpoints' **method notes** still stand; their priority lists are folded in here.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only (both GPL — never read their source). v1
`../abcMusicKit` (MIT) and the vendored abcjs source are safe to read.

Never raise a pixel-parity ceiling to make a change pass.

---

## Two-lane state — READ THIS FIRST

The strict-mode VERTICAL-geometry work still lives on a **branch, not `main`**:

| Lane | HEAD | State |
|---|---|---|
| `main` | `ac475f9`+ | 499 tests green, geometry UNCHANGED from `a761cf8`. Docs only. |
| `geometry/lyric-ink-anchor` | `1168e5d` | The geometry work. Typecheck clean; 452 functional tests green; 49 pixel-parity/baseline **ceiling** tests fail BY DESIGN. NOT pushed since `3a80638`. |

**Confirm your lane before any structural work:** `git rev-parse --abbrev-ref HEAD`.

---

## Where the branch stands (measured 2026-08-01)

- **27 of 29 fixtures within their `a761cf8` ceiling**, up from 25.
- Noteheads within 25px **25/29** (was 23/29). Corpus median notehead distance **14.7px**.
- Notehead COUNT matches abcjs 29/29.

**What closed this session:**

| commit | what | effect |
|---|---|---|
| `4ea24aa` | above-staff lanes became a real STACK (`anchorAboveStaff`) | `full-song-template` oy 22.1 → 0.3; `frere-jacques` dy 47.9 → 21.9 |
| `1168e5d` | `±8` clefs draw AND reserve their octave marker | `zocharti-loch` dy 17.5 → 0.9 |

**Three of the previous checkpoint's four blockers are CLOSED**, and not one of them had
the cause that checkpoint recorded. Only ragtime remains.

### The stack, since it is the reusable part

abcjs does not hold a chord symbol, a part label and a tempo mark at fixed distances from
the staff. It stacks them on the music's ink top, each reserving `height + 1` pitch and
drawing at the top it reserved (`set-upper-and-lower-elements.js:31-49`, `incTop`; margin
at `:102`). `anchorAboveStaff` is the mirror of `anchorLyrics` and hooks at the same point
in the per-staff merge, for the same reason: the anchor is unknown until the voices sharing
the staff are.

MEASURED before it was modelled. In `full-song-template`'s golden SVG the chord baseline
sits 6.7187 pitch below the part baseline — `partHeightAbove` 5.71871 + 1 exactly — and the
part 7.0013 below the tempo, `tempoHeightAbove` 6 + 1, once the tempo's own 2px bump
(`draw/tempo.js:15`) is removed. Resolved chord pitch lands on 19.504 against a predicted
19.5037. The three heights are corpus-wide constants; every fixture reports the same
`specialY`. Verified by script that `endingHeightAbove` and the dynamics pair never share a
staff with the stack anywhere in the corpus, so their position in abcjs's order is untested
here and remains unmodelled.

`tempoTextSize` went 1.6 → 20/7.75 with it: abcjs's `partsfont` and `tempofont` are both
15pt → 20px, and the stack draws each item one FONT SIZE below the top it reserved.

### The octave clef, since it corrected a standing diagnosis

`clef=treble-8` drew no `8` at all, and the missing RESERVE — not the missing ink — was the
whole of zocharti's tenor-to-bass gap. `-07-24` recorded the cause as the BASS staff's top
extent. It is not: against abcjs's own `staffs[]`, our bass tops are 22.12 and 25.12 pitch
against its 22 and 25, right to a tenth. The TENOR's bottom was short — 6.12 and 5.12
against a flat 8.00 — and abcjs's being IDENTICAL in both systems while ours varied with the
notes is what named the cause. A constant, not ink.

Source `creation/create-clef.js:33-56`: the clef element declares its bottom at
`2 x line + clefOffsets(shape)` (treble: `4 + (-5) = -1`), and the marker hangs one pitch
under that while reserving from three under it down to five — `bottom = -6`, exactly the
golden's `staff.bottom`, 8 pitch below the bottom line, note-independent. The declared
extent does not bracket the marker's own ink, so `PlacedGlyph.reserve` carries it, mirroring
abcjs's `RelativeElement` `top`/`bottom` overrides.

---

## The remaining blocker — ONE cause

### ragtime (`ragtime-nightingale` dy 122, `ragtime-mini` oy 30.4) — THE gate, coupled.
`ragtime-mini` joined this blocker this session; it is not a second problem. With a fixed
lane its tempo sat 38.8px above the top line against abcjs's 47.8, and the lane was **right
by accident** — once the stack anchored the tempo on real ink, the underlying ink gap
surfaced. abcjs's staff-0 top there is 21 pitch where ours is ~4: its treble 16th-note runs
carry UP-stems reaching 22.5px above the top line and ours carry none.

Everything the `-07-24` checkpoint said still holds: the down-stem overhang, `V:… stems=`
(no model field), the lyric anchor and the inter-system minimum are too coupled to change
one at a time, and each was attempted alone and reverted. **Add the treble beam direction to
that list — one pass, whole-corpus measurement after.**

**NEGATIVE RESULT, 2026-08-01 — beam direction by AVERAGE pitch. Attempted, reverted.**
abcjs decides beam stem direction by the group's average pitch against the middle line
(`beam-element.js:74-86`), not by the note furthest from it, which is our rule. Porting the
average rule left every other fixture byte-identical and moved `ragtime-nightingale` 36.9 →
39.3px, so it went back. Two things were learned and both are worth having:
- The rules genuinely disagree ONLY on ragtime in this corpus. Any future stem work can
  treat beam direction as a ragtime-local question.
- The port is **not settled**, and this is the part to resolve first next time. abcjs runs
  the decision TWICE. `createBeam` calls `runningDirection` over the parsed elems *before*
  `createNote` has run `setAveragePitch` on them, so on a first engrave `averagepitch` is
  `undefined`, `runningDirection` returns early, and `setStemDirection` averages 0 → stems
  UP. That provisional answer is what builds the stems (`this.stemdir = beamelem.stemsUp`).
  `calcDir` afterwards recomputes from real pitches and sets `heads[].stemDir`. Which of the
  two the DRAWN stem follows was not established. A first-engrave "always up" reading does
  explain abcjs's up-stems on ragtime's treble runs, which the average rule does NOT
  (computed averages 6.75 and 8.0, both → down). **Settle it by measuring abcjs's output
  across the corpus, not by reading further.**

### The measurement to start from — a term-by-term extent table

This is the first per-staff breakdown of ragtime that exists, and it is what every previous
attempt lacked. Method: dump abcjs's `staffs[].top/.bottom` from the element golden as
`above = top - 10` / `below = 2 - bottom`, dump ours from the packing loop in the same
units, and diff. It is the same probe that cracked `zocharti-loch` in one pass, and it
replaces the aggregate numbers that misled the earlier attempts.

Ours minus abcjs, in PITCH, over all 23 systems (staff 0 = treble, staff 1 = bass):

- **ABOVE** median +1.22, mean +2.15. **BELOW** median +3.12, mean +2.53. We over-reserve on
  both sides — it is not one term and not a constant.
- **Staff 0 BELOW is the loudest.** abcjs reports exactly **3.00** on 13 of 23 systems; ours
  runs 6–13. 3.00 is pitch -1, which is precisely the CLEF's own declared bottom
  (`4 + (-5)`) — meaning that on those staves abcjs's deepest DECLARED thing is the clef and
  its down-stems reserve nothing at all below. That is the overhang, seen from the treble
  side rather than the bass, and it is why we run 3–10 pitch deep.
- **Staff 1 ABOVE is over by 3–5 pitch** on most systems (0/1 +5.12, 1/1 +4.08, 3/1 +4.08,
  4/1 +5.01, 6/1 +6.08 …). ragtime declares `V:… stems=down` on all three bass voices; we
  have no model field for it, so we point some of those stems up and reserve a stem length
  above that abcjs never reserves.
- A handful of rows are NEGATIVE (14/0 -2.95, 17/1 -5.38, 22/1 -5.95) — we under-reserve
  there. Any fix has to be measured against this whole table, not against a mean.

**Nothing was attempted against it this session.** Both single-term fixes are already
recorded as failures (`overhang alone`: ave-verum 2.4 → 23.4; `stems=down` alone: ragtime
57.9 → 66.8) and re-running a known-failed experiment is not progress.

---

## Also recorded when the branch lands

The gate wants these IMPROVEMENTS recorded as lower ceilings — `ave-verum` 12.5→2.4,
`frere-jacques` 33.1→21.9, `full-song-template` 8.8→0.3, `happy-birthday`→0.2,
`little swallow`→7.1, `multi-voice-lyrics`→4.5, `multi-voice-triplet-brackets` 18.8→14.6,
`program-127`→0.3, `two-voice-invention`→6.4, `voice-middle-after-clef`→0.0,
`zocharti-loch` 2.0→0.9. **Do NOT lower any ceiling on `main`**, and only in the commit that
closes the last blocker. Until then the
gate's "improved — lower the ceiling" failures are expected.

Still open, untouched: the absolute stretch guard (`spacing * minSpace > 50`, needs a real
spring/rod split).

---

## How to work here (unchanged, and it paid again this session)

1. **Confirm the lane, then measure before you model.** The stack was derived from abcjs's
   own SVG baselines and only then written; it landed first try. The beam rule was read from
   abcjs's source and reverted the same hour. That contrast is the whole method.
2. **The `.elements.json` goldens are an EXTENT oracle** — `staffs[].top/.bottom` and the
   full `specialY`. NOTE what they are NOT: the dump runs `createABCLine` only, so its
   `staff.top` is the PRE-beam, PRE-stem ink top. `layoutVoice` raises it before
   `setUpperAndLowerElements` sees it (`layout/layout.js:35-41`). Reading the dump's `top`
   as the stack's anchor is off by whatever the beams add — 6 pitch on `ragtime-mini`.
2b. **THE PROBE THAT WORKS — a term-by-term extent diff.** It has now cracked two blockers
   in a session, and it is the first thing to reach for on any vertical question:
   - abcjs's side: `staffs[].top/.bottom` from the element golden, as `above = top - 10`,
     `below = 2 - bottom` (PITCH beyond the outer staff lines);
   - our side: one `console.log` in the packing loop next to `verticalExtent`, printing
     `-extent.top * 2 - 4` and `extent.bottom * 2 - 4` — the same units;
   - diff them per staff, and read the STRUCTURE, not the mean.
   It works because it separates the two things every aggregate mixes: which SIDE is wrong
   and which STAFF. On zocharti it showed the bass top right to a tenth of a pitch and the
   tenor bottom flat-wrong, which named the cause in one pass after two sessions of the
   diagnosis pointing at the wrong staff. Add the SVG line-to-line gap check next to it
   (`abcjs` gap = `(2 - prevBottom) + (thisTop - 10)` pitch, exactly, when the
   `staffSeparation` minimum does not bind) to confirm the extents explain the drawing.
3. **The notehead median can't see the vertical axis alone.** Use a boundary-by-boundary
   probe (`tests/staff-spacing.test.ts` shape).
4. **A scratch probe on a fixed path will lie to you** — assert it measured real data.
5. **When a well-motivated change makes the GATED corpus worse, the model is wrong, not the
   corpus.** It killed the beam rule this session. Revert; don't force.
6. **Deleting a fudge is not tuning it.**
7. **The winning shape, three times now: "reserve a FIXED lane and let the ink OVERHANG
   it"** — tuplets (`224ff8d`), and the above-staff stack is its sibling: reserve a real
   STACK, not a lane, and let the ink overhang that. When you find us reserving drawn
   geometry where abcjs reserves a constant, or a lane where abcjs stacks, that's the fix.
8. **Probes measure text AND ink separately.** The first read of `ragtime-mini` counted the
   tempo mark's own beat-unit note as "music ink 58px above the staff" and pointed at the
   wrong staff entirely. Classify what you measured before you believe it.

---

## Verify loop

```
cd Code/abcts
git rev-parse --abbrev-ref HEAD          # know your lane
npx tsc --noEmit                          # run from the repo ROOT — npx installs a decoy `tsc` otherwise
npx vitest run                            # 452 green + 49 ceiling fails EXPECTED on the branch
npm run parity                            # prints the geometry axis + worst fixtures
```
Re-record baselines only after READING the diff:
`ABCTS_SNAPSHOT_RECORD=1 npx vitest run tests/renderer/baseline.test.ts`. Ceilings are the
EXPECTED table in `tests/pixel-parity.test.ts` — regenerate by measuring, then paste, and
only in the commit that lands the branch.

---

## Key files

- `Docs/CHECKPOINT-2026-08-01.md` — this file.
- `tests/pixel-parity.test.ts` — the gate + the ceiling table.
- `tests/pixel-geometry.ts` — `pathBox` and the outline-centre resolution.
- `src/renderer/layout.ts` — all the geometry. `verticalExtent`, `anchorLyrics`,
  `anchorAboveStaff` (the above-staff stack), `beamDirections`, `stemForVoice`,
  `middleLineIndex`, the packing loops, the `ENGRAVE` constants with their abcjs citations.
- `src/parser/parser.ts` — `parseClef` / `middleLineOverride`.
- Sibling refs: `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/src/write/`
  (`layout/set-upper-and-lower-elements.js`, `layout/layout.js`,
  `creation/elements/beam-element.js`, `creation/abstract-engraver.js`, `draw/tempo.js`),
  `../abcMusicKit/Tools/abcjs-debug/golden/` (`.svg` + `.elements.json`).
