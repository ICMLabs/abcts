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

**The geometry arc is CLOSED.** `geometry/lyric-ink-anchor` is GREEN — 505 tests pass, all
29 fixtures are within their pixel-parity ceilings, and the ceilings are re-recorded to the
values achieved. It is ready to merge into `main`; that call is Lance's, not the branch's.

| Lane | HEAD | State |
|---|---|---|
| `main` | `ce348fe`+ | 499 tests green, geometry UNCHANGED from `a761cf8`. Docs only. |
| `geometry/lyric-ink-anchor` | `2e4851a` | **GREEN. 505/505.** Ready to merge. |
| `geometry/ragtime-stems` | `2e4851a` | Same commit; the working branch, now folded in. |

**Confirm your lane before any structural work:** `git rev-parse --abbrev-ref HEAD`.

---

## Where it landed (2026-08-02)

| | main | branch |
|---|---|---|
| fixtures within ceiling | 25/29 | **29/29** |
| noteheads within 25px | 21/29 | **27/29** |
| corpus median | 17.4px | **14.7px** |
| `ragtime-nightingale` | dy 121.5 | **58.1**, notehead distance 39.6 → **21.9px** |

Every blocker the `-07-24` checkpoint listed is closed, and **not one had the cause that
checkpoint recorded**:

| blocker | recorded cause | actual cause |
|---|---|---|
| `full-song-template` | `W:`/`H:` block reservation | the above-staff STACK |
| `frere-jacques` | prose-as-music spacing | the same stack |
| `zocharti-loch` | the bass staff's top | the TENOR's bottom — a missing `±8` octave clef |
| `ragtime` | down-stem overhang, coupled | four separate things, below |

### What ragtime actually was

1. **A forced voice forces its beams.** We had the beam's pitch choice overriding the voice
   convention; abcjs has one mechanism for both (`tune-builder.js:971-986` →
   `forceup`/`forcedown`, tested before the pitch rule). Treble direction went from ours
   81 up / 554 down against abcjs's 388/246 to 382/246.
2. **A beam's stem height is not an unbeamed stem's** — 9.5 steps from
   `spacing.stemHeight` 36.67px, not the hardcoded 7.
3. **A down-stem stops half a beam-width short** of the beam line; an up-stem does not.
4. **Dynamics and hairpins hang off the music** and reserve a flat 7-pitch lane past it,
   where we had a fixed lane. `anchorBelowStaff` is the third of these passes after
   `anchorLyrics` and `anchorAboveStaff` — the same shape three times over.

---

## THE METHOD THAT CLOSED IT — instrument abcjs, do not infer from its output

This is the note to read before any future parity question. Measuring abcjs's OUTPUT was
right as far as it went and it stalled for two sessions. What broke it open was
instrumenting abcjs ITSELF:

```
# abcMusicKit is a clean git repo, so this is safe and reversible
edit  Docs/References/abcjs/abcjs-6.6.3/src/write/…      # env-guarded console.log
cd    Tools/abcjs-debug && ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc -o /tmp/x.svg
git -C ../abcMusicKit checkout -- Docs/References/abcjs/   # ALWAYS, and verify clean
```

Guard every probe on an env var so it is inert if a restore is ever missed, and check
`git status` on that repo afterwards. It is a frozen sibling; leave no trace.

What it settled that output never could:
- **The element dump is the wrong oracle twice.** It is taken before beams exist, AND
  `setUpperAndLowerElements` keeps mutating `staff.top`/`bottom` as it runs. Probing the
  top of its loop gives 21.000/−3.500 for ragtime's first staff; the end of the loop gives
  28.000/−3.500; at draw time its neighbour's bottom is −20 where the dump says −13. Only
  the end-of-loop value is what the drawing uses.
- **Our beam geometry was already exact** — abcjs's own numbers matched ours term for term,
  which retired a whole line of investigation in one run.
- **abcjs's dynamics reserve is sparse and PER-SYSTEM** — 9 of 46 staves, not 23. That one
  fact explains a −318px blow-up that guess-and-check had left mysterious.

---

## Still open, recorded rather than applied

- **Beams should not count toward a staff's extent.** abcjs never counts one (a `BeamElem`
  is in `voice.otherchildren`; `setUpperAndLowerVoiceElements` switches only on
  Crescendo/Dynamic/Ending/Tie). Ours contributes a half-thickness below the stem tip — a
  flat 0.50 pitch. Removing it improves the corpus median 14.7 → 14.5px and costs ragtime
  more than it gains, so the gate says no. Revisit with a partner change.
- The absolute stretch guard (`spacing * minSpace > 50`), untouched all arc.
- `%%titleformat`, `%%writefields`, `%%aligncomposer`; `"@x,y"` free placement; header
  `P:` part order; `s:` in strict is deliberately abcjs's bug.

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
