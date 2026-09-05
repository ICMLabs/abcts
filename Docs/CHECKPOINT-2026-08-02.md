# abcts — Checkpoint, 2026-08-02

Supersedes `CHECKPOINT-2026-08-01.md`. Read this, then `HORIZONTAL-ARC.md`, then
`ARCHITECTURE.md`, then `CLAUDE.md`.

---

## READ THIS FIRST — why this has felt like trial and error, and how to stop it

We can read abcjs's source and instrument both engines, so parity work should be
mechanical. For stretches of it, it has not been. The diagnosis, stated plainly so the next
agent does not repeat it:

**Constants were ported into a structurally different model.** Reading abcjs gives you its
NUMBERS easily. The divergences that cost the most were never numbers — they were
architecture: abcjs walks one cursor across all voices, we had per-measure columns; abcjs
solves a spring/rod system, we multiplied a width; abcjs anchors on ink and reserves a flat
lane, we used fixed lanes. Dropping a correct constant into a different structure moves the
output unpredictably, which is exactly the "this change is right and made the corpus worse"
pattern that recurs a dozen times in these logs.

**The rule that follows: port abcjs's STRUCTURE, then its constants.** Every time the
structure was ported — `calcYPos`, the above-staff stack, the shared-cursor loop — it landed
first or second try. Every time it was adapted to fit ours — a per-column timeline instead of
per-line, a single justify factor instead of a spring solve — it half-worked and needed
several rounds.

**Corollaries:**

- Before changing a constant, ask whether the surrounding LOOP is abcjs's. If it is not, fix
  that first; the constant is probably not what is wrong.
- When a cited, correct change makes the corpus worse, it is almost always partnered with
  another one, and the pair has to land together. That happened three times (stem endpoints
  + dynamics reserve; `stems=` + beam placement; beam extent + hairpin reserve).
- Instrument to ANSWER A QUESTION, not to see what happens. Three hypotheses were killed for
  one probe each — the beam geometry, the base spacing curve, the tuplet duration were all
  already exact. That is where instrumentation pays; using it as a feedback loop for guesses
  is the expensive mode.

---

## The contract

`abcjs-strict` reproduces abcjs 6.6.3 exactly. **A passing gate is not parity** — the pixel
gate only asserts "no worse than recorded". Parity is every axis at ZERO. `abcjs-extended` /
`extended` fix abcjs's bugs; their target is abcm2ps / abc2svg through OUTPUT only (both GPL
— never read their source). `../abcMusicKit` (MIT) and the vendored abcjs source are safe.

Never raise a ceiling to make a change pass.

---

## Repos and lanes — CONFIRM YOURS

Two different repos, and both have a branch called `main`:

- **`Code/abcts`** — this project. `git@github.com:ICMLabs/abcts.git`. All the branches below.
- **`Code/abcMusicKit`** — a sibling, read-only for us. Source of the vendored abcjs, the
  fixtures and the goldens. **Nothing is ever committed there.** If you instrument it,
  restore it and check `git -C ../abcMusicKit status --short` is empty before you finish.

`git rev-parse --abbrev-ref HEAD`

| Lane (abcts) | State |
|---|---|
| `main` | **The vertical arc is MERGED. 505/505, all 29 fixtures within their ceilings.** |
| `geometry/horizontal` | The open arc. No functional failures; geometry gates red BY DESIGN. |
| `geometry/lyric-ink-anchor` | Merged into `main`. Historical. |
| `geometry/ragtime-stems` | Folded into the above. Historical. |

---

## Where parity actually stands

| axis | median | at ZERO | state |
|---|---|---|---|
| dy spread | +0.00 | 18/29 | vertical arc CLOSED |
| oy offset | −0.20 | 3/29 | vertical arc CLOSED |
| dx spread | **+9.41** | 8/29 | horizontal arc OPEN |
| ox offset | **−1.37** | 8/29 | horizontal arc OPEN |

Eight fixtures match abcjs's horizontal placement EXACTLY (dx and ox both 0.0):
`simple-c`, `score-reorder`, `score-reorder-shared`, `multi-voice-rest-collision`,
`stacked-annotations`, `voice-octave-shift`, `vree-slurs-and-triplets`,
`vree-ties-across-bars`. At the start of that arc, none did.

Worst remaining: `ragtime-nightingale` 115.7, `multi-voice-triplet-brackets` 110.4,
`voice-middle-after-clef` 79.0.

---

## THE METHOD — instrument abcjs itself

```bash
# abcMusicKit is a clean git repo, so this is safe and fully reversible.
# 1. env-guarded log in the vendored source:
#      Docs/References/abcjs/abcjs-6.6.3/src/write/…
#      if (process.env.ABCJS_PROBE) console.log('PROBE …')
# 2. run abcjs's own harness
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
# 3. ALWAYS restore, and verify
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

Guard every probe on an env var so it is inert if a restore is missed.

**`.elements.json` is the WRONG oracle twice over.** It is taken before beams exist
(`createBeam` builds notes with `nostem`; `layout/beam.js` adds stems later) AND
`setUpperAndLowerElements` keeps mutating `staff.top`/`bottom` as it runs. Ragtime's first
staff reads 21.000/−3.500 at the top of that loop, 28.000/−3.500 at the end, and its
neighbour's bottom is −20 at draw time where the dump says −13. Only the end-of-loop value is
what the drawing uses.

---

## What is open — one structural piece

**The timeline must be per LINE, not per column.** `HORIZONTAL-ARC.md` has the detail.

The shared-cursor loop is ported and working (`5d0cc92`) — per-voice `minx`, `nextx`,
`spacingduration`, `durationindex`, and the waiting-voice recompute that the first attempt
omitted. It took `dx` median 17.06 → 9.41 and `multi-voice-triplet-brackets` 227 → 110.

It runs **per column**, on the assumption that barlines agree across voices so per-column and
per-line are equivalent. **That assumption is false**, and `voice-middle-after-clef` is the
proof: it writes a bar of 1.0 against a bar of 1.5, and abcjs does not align their barlines —
its measure 2 starts at 207.1 on staff 0 and 278.1 on staff 1. Our column model force-aligns
them because a column IS a measure. abcjs has no columns at all, only one timeline per line.
That fixture has sat at exactly 79.0 through every change in the arc.

Going per line retires the per-measure column model, `columnWidths`, and the per-block factor
along with it. It is the last structural difference on this axis, and per the lesson at the
top it should be done as a STRUCTURAL port — one line, one cursor, one spring solve — not as
an adaptation of the column model.

### Also open, smaller

- **Beams should not count toward a staff's extent.** abcjs never counts one (a `BeamElem`
  is in `voice.otherchildren`; `setUpperAndLowerVoiceElements` switches only on
  Crescendo/Dynamic/Ending/Tie). Ours adds a half-thickness below the stem tip, a flat 0.50
  pitch. Removing it improves the median 14.7 → 14.5px and costs ragtime more — it needs its
  partner, unfound.
- The absolute stretch guard (`spacing * minSpace > 50`). Its source comment says "reinstate
  together with a real spring/rod split, not before" — the split now exists, so it is
  unblocked.
- `%%titleformat`, `%%writefields`, `%%aligncomposer`; `"@x,y"` free placement; header `P:`
  part order.

---

## Traps, all paid for

1. **A recorded diagnosis is a hypothesis.** Four vertical blockers, four wrong causes on
   record. This file included — re-measure before trusting it.
2. **The element dump is pre-beam AND pre-mutation.**
3. **A right change can make the corpus worse** — look for its partner rather than reverting
   and forgetting.
4. **Band-assignment probes lie.** Two measurements were wrong because a stem's midpoint was
   assigned to the wrong staff, or a filter excluded the tall stems it was meant to find.
   Classify what you measured before believing it.
5. **Check `git -C ../abcMusicKit status` before finishing.**

---

## Verify loop

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # know your lane
npx tsc --noEmit                      # from the repo ROOT — npx installs a decoy `tsc` otherwise
npx vitest run                        # main: 505/505. horizontal: geometry gates red by design,
                                      #   ZERO functional failures — if one fails, you broke it
npm run parity                        # every axis in one view
```

Ceilings are the `EXPECTED` table in `tests/pixel-parity.test.ts`; regenerate by measuring,
and only in the commit that closes the last blocker. Baselines: `npm run baseline`, READ the
diff, commit them with the code.
