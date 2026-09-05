# abcts — Checkpoint, 2026-07-24

Supersedes `CHECKPOINT-2026-07-23.md` (which supersedes `-07-22c`). Read this, then
`ARCHITECTURE.md`, then `CLAUDE.md`. The older checkpoints' **method notes** still stand and
are worth reading once; their priority lists are closed or folded in here.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abcjs-extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only (both GPL — never read their source). v1
`../abcMusicKit` (MIT) and the vendored abcjs source
(`../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/src`) are safe to read.

Never raise a pixel-parity ceiling to make a change pass.

---

## Two-lane state — READ THIS FIRST

The strict-mode VERTICAL-geometry work lives on a **branch, not `main`**:

| Lane | HEAD | State |
|---|---|---|
| `main` | `f3cd07b` | 499 tests green, geometry UNCHANGED from `a761cf8`. All the diagnosis docs live here. |
| `geometry/lyric-ink-anchor` | `3a80638` | The geometry work. Typecheck clean; 452 functional tests green; 48 pixel-parity/baseline **ceiling** tests fail BY DESIGN (they fail when a fixture improves past its recorded ceiling — the TODO list, not regressions). Both lanes pushed to `origin`. |

**Confirm your lane before any structural work:** `git rev-parse --abbrev-ref HEAD`.

The branch is parked — not merged — because 4 of 29 fixtures still exceed their recorded
pixel-parity ceiling, and the branch cannot land until every fixture is within. But the
vertical MODEL on it is now abcjs's, and the residual set has shrunk steadily.

---

## Where the branch stands (measured 2026-07-24)

- **25 of 29 fixtures within their `a761cf8` ceiling**, up from 21 when this arc began.
- Notehead COUNT matches abcjs 29/29 fixtures; corpus median notehead distance **14.7px**.
- Per-staff extents vs abcjs's own (replica of `setUpperAndLowerElements` over the element
  goldens): median **0.03px above** the staff, **0.46px below** — the model is essentially
  abcjs's; what's left is four specific fixtures.

**What closed on the branch, newest first:**

| commit | what | effect |
|---|---|---|
| `3a80638` | `V:… middle=` clef modifier (`Clef.middleOverride`) | voice-middle-after-clef dy 24 → **0.0** |
| `224ff8d` | tuplet/volta reserve a FIXED lane, not drawn geometry | closed triplet-brackets; ragtime dy 177 → 122 |
| `d54b644` | `spacing.music` above title-less first systems | title-less tunes 7.56px lower |
| `67ff28c` | dynamics side follows `hasVocals` (above only if the tune sings) | ragtime 61 → 58; two-voice-invention 22 → 21 |
| `520cfb4` | chord+text reserves at abcjs font sizes; down-stem reserve; `systemGap`/`staffGap` deleted | the bulk of the vertical model |
| `152c8b7` | shared-staff stem-forcing rule; per-verse lyric reserve | ave-verum stem direction |
| `8196bfd` | lyrics hang off the staff ink, offset per voice | the lyric anchor |

---

## The 4 remaining blockers — each diagnosed, none a tunable constant

### 1. `ragtime-nightingale` (dy 122, oy −30) — down-stem overhang, COUPLED. The gate.
abcjs lets a down-stem OVERHANG the inter-system gap: its bass down-stems reach 44.9px below
the bottom line while `staff.bottom` stays at the notehead (19.5px). We reserve the stem tip.
It ALSO ignores `V:… stems=down` (ragtime declares it on all three bass voices; no model
field). **Both fixes are correct against abcjs and BOTH were attempted 2026-07-24 and
reverted** — together, and each alone, they moved the corpus the wrong way (overhang alone:
ave-verum 2.4 → 23.4; `stems=down` alone: ragtime 57.9 → 66.8). The notehead-depth hypothesis
was checked and DISPROVEN (our `noteheadBlack` reaches 0.5 staff-spaces below centre, abcjs's
0.522 — a 0.17px difference). The extent bottom, the up-stem side, the down-stem side, the
lyric anchor (which reads `verticalExtent().bottom`), and the inter-system minimum are too
coupled to change one term in isolation. **Next attempt must change `stems=`, the overhang,
AND re-derive the lyric-anchor constant in ONE pass, measuring the whole corpus after.**

### 2. `full-song-template` (dy 0, oy −22) — above-staff STACKING, tractable-ish.
Not `W:`/`H:` (abcjs suppresses O:/S:/D:/N:/Z:/H: entirely). dy is a perfect 0 — every staff
consistent, the whole drawing 22px too high. Our header rows and the `P:` label match abcjs
to 0.1px, but the first staff sits 22px too high because abcjs **stacks** the three
above-staff elements it carries — `chordHeightAbove 4.78 + partHeightAbove 5.72 +
tempoHeightAbove 6`, each +1 margin, ≈ 19.5 pitch ≈ 75px — where we use FIXED non-stacking
lanes (`chordSymbolStep`, `partStep`, `tempoStep`) topping out at ~53px. This is the same
"stack, don't use a fixed lane" shape the tuplet fix (`224ff8d`) took: the above-staff lanes
want to become a real stack. `frere-jacques` shares the `P:` path, so a `partStep` tweak is
unsafe — the stack has to be real. **This is the most promising next win** — it's a bounded
above-staff-stacking pass, decoupled from ragtime's below-staff coupling.

### 3. `zocharti-loch` (dy 18, oy 2) — intra-staff spacing, NOT `middle=`.
Its `V:B1/B2 clef=bass transpose=-24 middle=d` basses are written in treble range; `middle=`
and `transpose=` nearly cancel, so `middle=` is GUARDED OFF where `transpose=` is present
(honouring it alone sent zocharti to dy 72 — written `transpose=` is unrealized). At its
guarded bass-default zocharti is dy 17.5, IDENTICAL to the `520cfb4` regression — so its
problem was never `middle=` but the intra-staff gap the fudge deletion exposed. abcjs reserves
the bass staff top at pitch 32/35 (its high notes) and its tenor↔bass gap is ~7–10px wider
than ours. No `staffGap` value fixes it without costing more elsewhere (re-verified). Needs
the bass staff's top extent, or the `clef=treble-8` tenor's placement, measured against
abcjs's `staffs[].top`. Written `transpose=` would let `middle=` compose here but does not by
itself close the spacing gap.

### 4. `frere-jacques` (dy 48, oy −28) — idiosyncratic, hardest.
abcjs lexes its `+:` prose as music and gives each prose line its own staff, reserving
46.5/23.4/23.4px above systems 1/2/3 where we reserve 35.6/15.4/39.3. No rule we model
produces those; it is a structural artifact of abcjs's prose-as-music bug (we already
reproduce its note COUNT — 45 both sides — but not this spacing). Lowest-value, do last.

---

## Also recorded when the branch lands

The pixel-parity gate wants six IMPROVEMENTS recorded as lower ceilings — `ave-verum`
12.5→2.4, `happy-birthday`→0.0, `little swallow`→7.1, `multi-voice-lyrics`→4.5,
`program-127`→0.4, `two-voice-invention`→6.4 — PLUS the two closed this arc
(`multi-voice-triplet-brackets`, `voice-middle-after-clef`). **Do NOT lower any ceiling on
`main`.** They can only be recorded when the branch lands, in the same commit that closes the
last blocker. Until then the gate's "improved — lower the ceiling" failures are expected.

Still open from `-c`, untouched: the absolute stretch guard (`spacing * minSpace > 50`, needs
a real spring/rod split).

---

## How to work here (earned across this arc — ignore at your peril)

1. **Confirm the lane, then measure before you model.** Every wrong turn this arc came from
   modelling abcjs's SOURCE instead of measuring its OUTPUT first. Three findings were
   generalised from one fixture each and all three were wrong (dynamics-above, the chord
   fixed-lane, "middle= closes zocharti"). Check the corpus for a fixture where the rule's
   condition is FALSE before writing the rule.
2. **The `.elements.json` goldens are an EXTENT oracle**, not just structural. They carry
   `staffs[].top/.bottom` and the full `specialY` block — abcjs's own answer to how much room
   a staff takes and why. Replicating `setUpperAndLowerElements` over them and diffing against
   the SVG lands EXACTLY (0.00px) on most fixtures and is the fastest vertical-hypothesis test
   — no build, no renderer. BUT `dump-elements.js` and `dump-svg.js` measure multi-line text
   differently; where they disagree, the SVG is the gate.
3. **The notehead median can't see the vertical axis alone** — it mixes in a horizontal axis
   still tens of px out, and `oy` mixes first-staff placement with inter-staff stacking. Use
   a boundary-by-boundary probe (the throwaway `tests/staff-spacing.test.ts` shape) for
   vertical questions.
4. **A scratch probe on a fixed `/tmp` path will lie to you** — a later probe overwrote an
   earlier file and reported nine byte-identical "results". Check the mtime, or make the probe
   assert it measured real data.
5. **When a well-motivated change makes the GATED corpus worse, the model is wrong, not the
   corpus** — this project's iron rule, and it killed several correct-looking changes this
   arc. Revert; don't force. A parked branch with a written negative result beats a green
   diff that quietly regressed four fixtures.
6. **Deleting a fudge is not tuning it** — `systemGap`/`staffGap` went to 0 (abcjs's own
   value) only after the extents they stood in for were measured right.
7. **The winning shape twice now: "reserve a FIXED lane and let the ink OVERHANG it."** Tuplets
   (`224ff8d`) and, in principle, down-stems and the above-staff stack all follow it. When you
   find us reserving drawn geometry where abcjs reserves a constant, that's the fix.

---

## Verify loop

```
cd Code/abcts
git rev-parse --abbrev-ref HEAD          # know your lane
npx tsc --noEmit
npx vitest run                            # 452 green + 48 geometry-ceiling fails EXPECTED on the branch;
                                          #   on main, 499 green
npm run parity                            # prints the geometry axis + worst fixtures
```
Re-record baselines only after READING the diff:
`ABCTS_SNAPSHOT_RECORD=1 npx vitest run tests/renderer/baseline.test.ts`. Ceilings are the
EXPECTED table in `tests/pixel-parity.test.ts` — regenerate by measuring, then paste, and
only in the commit that lands the branch.

---

## Key files

- `Docs/CHECKPOINT-2026-07-24.md` — this file.
- `tests/pixel-parity.test.ts` — the gate + the ceiling table; header comment carries the
  full ranked history.
- `tests/pixel-geometry.ts` — `pathBox` and the outline-centre resolution both engines are
  measured through.
- `src/renderer/layout.ts` — all the geometry. `verticalExtent` (the tuplet fixed lane, the
  stem reserve, the lyric reserve), `anchorLyrics`, `stemForVoice`, `middleLineIndex`, the
  per-staff and per-system packing loops, the `ENGRAVE` constants each citing their abcjs
  source.
- `src/parser/parser.ts` — `parseClef` / `middleLineOverride` (the `middle=` support and its
  `transpose=` guard).
- Sibling refs: `../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3/src/write/` (layout/creation
  — `set-upper-and-lower-elements.js`, `abstract-engraver.js`, `decoration.js`,
  `draw/draw.js`), `../abcMusicKit/Tools/abcjs-debug/golden/` (`.svg` + `.elements.json`).
