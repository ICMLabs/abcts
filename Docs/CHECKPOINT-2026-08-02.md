# abcts — Checkpoint, 2026-08-02

Supersedes `CHECKPOINT-2026-08-01.md`. Read this, then `ARCHITECTURE.md`, then `CLAUDE.md`.
`HORIZONTAL-ARC.md` is the working spec for what is open; read it before touching spacing.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly. **100% parity is the bar, and a passing gate
is not parity** — the pixel gate only says "no worse than recorded". The real target is
every axis at zero. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps /
abc2svg through OUTPUT only (both GPL — never read their source). `../abcMusicKit` (MIT) and
the vendored abcjs source are safe to read.

Never raise a ceiling to make a change pass.

---

## Lanes — CONFIRM YOURS FIRST

`git rev-parse --abbrev-ref HEAD`

| Lane | HEAD | State |
|---|---|---|
| `main` | `74268b2` | Docs only. Geometry unchanged from `a761cf8`. 499 tests. |
| `geometry/lyric-ink-anchor` | `2e4851a` | **GREEN — 505/505, 29/29 within ceiling.** The vertical arc, complete. **Ready to merge; not merged — that is Lance's call.** |
| `geometry/ragtime-stems` | `2e4851a` | Same commit, folded in. Historical. |
| `geometry/horizontal` | `52d8125` | The open arc. No functional failures; geometry gates red BY DESIGN. |

All four are pushed and match `origin`.

---

## Where parity actually stands

Per axis, over the 29 pixel-gated fixtures, on the branch that owns each:

| axis | median | at ZERO | state |
|---|---|---|---|
| dy spread | +0.00 | 18/29 | vertical arc CLOSED |
| oy offset | −0.20 | 3/29 | vertical arc CLOSED |
| dx spread | +17.06 | 8/29 | horizontal arc OPEN |
| ox offset | −2.56 | 8/29 | horizontal arc OPEN |

**Eight fixtures now match abcjs's horizontal placement exactly** (dx and ox both 0.0):
`simple-c`, `score-reorder`, `score-reorder-shared`, `multi-voice-rest-collision`,
`stacked-annotations`, `voice-octave-shift`, `vree-slurs-and-triplets`,
`vree-ties-across-bars`. At the start of that arc, none did.

Vertical, branch vs `main`: fixtures within ceiling 25/29 → **29/29**, noteheads within 25px
21/29 → **27/29**, corpus median 17.4px → **14.7px**.

---

## THE METHOD — read this before anything else

**Instrument abcjs itself. Do not infer from its output, and do not guess-and-check.**

Measuring abcjs's output was right as far as it went and it stalled the last vertical blocker
for two sessions. Instrumenting settled it in one, and has since disproved three of my own
hypotheses before a single line of our code changed — which is the real saving.

```bash
# abcMusicKit is a clean git repo, so this is safe and fully reversible
# 1. add an env-guarded log to the vendored source
#      Docs/References/abcjs/abcjs-6.6.3/src/write/…
#      if (process.env.ABCJS_PROBE) console.log('PROBE …')
# 2. run abcjs's own harness
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
# 3. ALWAYS restore, and verify
git -C ../../ checkout -- Docs/References/abcjs/
git -C ../../ status --short          # must be empty
```

Guard every probe on an env var so it is inert if a restore is ever missed. That repo is a
frozen sibling — leave no trace.

### What it has settled that output never could

- **`.elements.json` is the WRONG oracle twice over.** It is taken before beams exist
  (`createBeam` builds notes with `nostem`, and `layout/beam.js` adds the stems later), AND
  `setUpperAndLowerElements` keeps mutating `staff.top`/`bottom` as it runs. Ragtime's first
  staff reads 21.000/−3.500 at the top of that loop, 28.000/−3.500 at the end, and its
  neighbour's bottom is −20 at draw time where the dump says −13. **Only the end-of-loop
  value is what the drawing uses.**
- Our beam geometry, our base spacing curve and our tuplet durations were each suspected and
  each proved ALREADY EXACT. Three dead ends closed for the cost of one run apiece.
- abcjs's dynamics reserve is sparse and PER-SYSTEM — 9 staves of 46, not 23. That one fact
  explained a −318px blow-up that guess-and-check had left mysterious.

---

## What closed (2026-08-01 → 02)

### Vertical — every blocker, and NOT ONE had the cause on record

| blocker | cause on record | actual cause |
|---|---|---|
| `full-song-template` | `W:`/`H:` block reservation | the above-staff STACK |
| `frere-jacques` | prose-as-music spacing | the same stack |
| `zocharti-loch` | the bass staff's top | the TENOR's bottom — a missing `±8` octave clef |
| `ragtime` | down-stem overhang, coupled | four separate things (below) |

That table is the headline warning: **a recorded diagnosis is a hypothesis, not a finding.**

Ragtime was: (1) a forced voice must force its BEAMS — abcjs has one mechanism for a
declared `V:… stems=` and for the shared-staff convention, and it beats the pitch rule;
(2) a beam's stem height is 9.5 steps from `spacing.stemHeight` 36.67px, not the hardcoded 7
an unbeamed stem gets; (3) a down-stem stops half a beam-width short of the beam line and an
up-stem does not; (4) dynamics and hairpins hang off the music behind a flat 7-pitch lane.

The recurring shape, now four times: **abcjs anchors on the ink and reserves a flat lane;
we used a fixed lane.** `anchorLyrics`, `anchorAboveStaff`, `anchorBelowStaff` are the three
passes that fix it, and they are all the same shape.

### Horizontal — the arc opened and the prefix closed

Three constants, each instrumented out of `layout/voice-elements.js`, which prints
`simple-c`'s chain outright (`clef x=15 w=24.051`, `time-signature x=49.051`,
`note x=70.846`):

1. `prefixGap` 7.75px → 10px — abcjs's `minspacing`, flat on every `AbsoluteElement`.
2. A clef glyph sits **5px into** its element (`var dx = 5`), so its element is 24.051 wide
   against a 19.051 glyph. We drew it flush left.
3. Key-signature accidentals step by `getSymbolWidth + 2`, a flat 2px.

Then the spring/rod solve, `systemWidth` → `700 / 7.75` (abcjs's page is
`15 + 670 + 15`, so its solver targets 685 and ours targeted 682.5), and the rule that the
**last element of a line skips its `minspacing`** — a final barline advances 1px, not 11.

### Features, unrelated to geometry

`stafflines=` (V: and K:, abcjs's three behaviours: lines count up from the bottom, ONE line
is the middle B line, zero draws none) and `s:` symbol lines (MODE-SPLIT — strict reproduces
abcjs printing them as lyric TEXT, which its own TODO admits; the other modes place them as
decorations). Both are in `ABCJS-DIFFERENCES.md` where they belong.

---

## WHAT IS OPEN — one thing, fully specified

**A shared cursor across the voices of a system.** `HORIZONTAL-ARC.md` has the detail; the
summary:

We lay each voice out independently and reconcile only at barlines, so the bars align and
nothing between them does. `multi-voice-triplet-brackets` has abcjs's gaps at a regular 24px
and ours at 26, 25, 11, 40, 21, 5. abcjs's `layoutStaffGroup` walks ONE cursor across every
voice, stepping to the smallest pending duration each pass.

**ATTEMPTED AND REVERTED once — the shape was right, one thing was missing.** A first cut
made every multi-voice fixture much worse (`ave-verum` 24 → 152px, `ragtime-nightingale`
108 → 372). The omission, in abcjs's own comment:

```
// if a voice had planned to use up 5 spacing units but is not in line to be laid out at
// this duration level - where we've used 2 spacing units - then we must use up 3 spacing
// units, not 5
```

A WAITING voice's expectation must shrink by the duration consumed without it. The loop
carries per-voice `nextx` and `spacingduration`; each pass takes `x = max of the current
voices' nextx`, places them, then for every waiting voice subtracts the consumed duration
and recomputes `nextx = x + naturalWidth(remaining)`. That recompute is `sqrt(remaining * 8)`
— **non-linear**, so it cannot be approximated by splitting an advance evenly across the
onsets it spans. That is exactly the shortcut that failed.

**Do it as one piece, with room.** It retires the per-measure column model and the per-block
factor solve along with it: one cursor means one line, one spring solve, no column
reconciliation. Two partial attempts have now moved the corpus badly; a third increment on
top of a long session is not the way.

### Also open, smaller

- **Beams should not count toward a staff's extent.** abcjs never counts one (a `BeamElem`
  is in `voice.otherchildren`; `setUpperAndLowerVoiceElements` switches only on
  Crescendo/Dynamic/Ending/Tie). Ours adds a half-thickness below the stem tip, a flat 0.50
  pitch. Removing it improves the corpus median 14.7 → 14.5px and costs ragtime more than it
  gains — the gate says no. Revisit with a partner change.
- The absolute stretch guard (`spacing * minSpace > 50`). Its own source comment says
  "reinstate this together with a real spring/rod split, not before" — the split now exists,
  so this is unblocked.
- `%%titleformat`, `%%writefields`, `%%aligncomposer`; `"@x,y"` free placement; header `P:`
  part order.

---

## Traps, all paid for

1. **A recorded diagnosis is a hypothesis.** Four blockers, four wrong causes on record.
   Re-measure before you trust one — including one in this file.
2. **The element dump is pre-beam AND pre-mutation.** See the method section.
3. **Guess-and-check costs more than instrumenting.** Every wrong turn in the last two
   sessions came from changing code to see what happened. Every quick win came from asking
   abcjs directly.
4. **A change that is right can still make the corpus worse**, and the sign tells you what
   it is partnered with — the stem-endpoint fix and the dynamics reserve only worked
   together, and the beam-extent fix is still waiting for its partner.
5. **Band-assignment probes lie.** Two separate measurements were wrong because a stem's
   midpoint was assigned to the wrong staff, or a filter excluded the tall stems it was
   meant to find. Classify what you measured before believing it.
6. **Check `git status` on `abcMusicKit` before you finish.**

---

## Verify loop

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD          # know your lane
npx tsc --noEmit                          # run from the repo ROOT — npx installs a decoy `tsc` otherwise
npx vitest run                            # lyric-ink-anchor: 505/505. horizontal: geometry gates red by design,
                                          #   but ZERO functional failures — if a functional test fails, you broke it
npm run parity                            # every axis in one view
```

Ceilings are the `EXPECTED` table in `tests/pixel-parity.test.ts`; regenerate by measuring
and only in the commit that closes the last blocker. Baselines: `npm run baseline`, READ the
diff, commit them with the code.
