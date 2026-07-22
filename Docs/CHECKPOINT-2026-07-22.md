# abcts — Checkpoint, 2026-07-22

Supersedes `CHECKPOINT-2026-07-21.md`, which stays accurate for how the last three parser
diffs closed and for the method notes in it. **Read this, then `ARCHITECTURE.md`, then
`CLAUDE.md`.**

---

## Where things stand

| | |
|---|---|
| Tests | **498 passing** |
| Note content parity | **41/41 — zero divergences** |
| Lyrics | **10/10 — zero divergences** |
| Beam grouping | **41/41 — zero divergences** |
| Render structure | **41/41 — zero divergences** |
| **Pixel parity vs abcjs** | **new axis — see below** |
| Visual baselines | 41/41 fixtures, 119 tunes |
| Typecheck / lint / build | clean |

The four structural axes stayed at 100% through every change below. The new work is
GEOMETRIC: does abcts put the ink where abcjs puts it.

### Pixel parity, measured

| | |
|---|---|
| Noteheads | **2696 / 2696 exact**, all 29 fixtures with SVG goldens |
| Systems matching abcjs | **28 / 29** (was 18/29) |
| Mean dx spread | 68.7px |
| Mean dy spread | 122.4px |
| Mean abs x offset | 33.0px |
| Mean abs y offset | **73.8px — the open problem** |
| Output size vs abcjs | **0.34x** (was 0.90x) |

Worst remaining dx: `frere-jacques` 637 (the `+:` prose fixture, breaks mid-measure),
`multi-voice-lyrics-two-voices` 337, `center-text` 219 (waits on `%%center`).

---

## THE CONTRACT, restated — this changed during the session

**abcts's default mode reproduces abcjs's visual output.** Not "behaviourally similar" —
the same ink in the same place. `abc2.1` and `extended` fix abcjs's bugs and add what the
other engines have.

`ARCHITECTURE.md` used to say "core renders in its own visual style, so the golden SVGs
gate compat mode only", and `CLAUDE.md` called those SVGs "unused". **Both were wrong**,
and the second proves the first was never tested: `abcts/compat` calls the same core
`layout()` + `toSVG()` as everything else, so nothing ever rendered differently and
nothing was ever compared. Corrected in place.

**One emitter, not two.** A byte-parity emitter was proposed and rejected: byte equality
proves the layout AND the serialisation, and the serialisation is what abcts intends to
differ on — smaller, no `xlink`, `currentColor`. Position equality proves the layout,
which is the half that matters. The `<defs>`/`<use>` optimisation is how output gets
smaller while every class and `data-name` hook stays identical.

---

## What closed

**Parser** — mid-tune `Q:` (tune-level, as abcjs models it); `scanMusic` ends the header,
not just `K:`; `P:` prints in source order; the beam rule that a space ends a beam only
when nothing has come between it and the note. Those took render structure and beams to
41/41.

**Lyrics** — Gonzato §4.1.4. `I:` is `%%` (ABC 2.1 §11.4) and no longer clobbers the `+:`
chain, which was the whole leak; `%%vocalfont` captured per SYLLABLE and realized in
measurement as well as draw. Mode-split, strict reproducing abcjs's version.

**Mid-tune `K:`** — drawn, with cancelling naturals, in source order against the barline.

**Pixel-parity gate** — `tests/pixel-parity.test.ts` plus `tests/pixel-geometry.ts`, which
resolves either engine's SVG to absolute pixels the way a browser would.

**`<defs>`/`<use>`** — 0.90x abcjs to 0.34x. Tri-state `optimizeSVG`, off in strict.

**Justification** — a last system already 66% full is justified (`layout.js:102`);
compression is unconditional.

**Systems follow source lines** — abcjs has no line-breaking pass; one source music line
is one system, fitted to the page.

**abcjs's 15px left margin**, and the same margin counted in the fill fraction.

**`abcjs-top-line`** was on the BOTTOM staff line — a real compat bug.

---

## THE OPEN PROBLEM — vertical placement

Mean |y offset| 73.8px, and it is the largest remaining term by a distance.

**FOUR attempts, all measured, none shipped.** Read `ENGRAVE.titleStep` in `layout.ts` for
the full record. Ordered by size:

1. **`marginY` dominates.** It pads every staff extent by 4.0 spaces a side — 31px —
   where abcjs adds NO per-staff margin: it stacks on ink extents and enforces a MINIMUM
   separation (`draw.js:84-92`, pad only when the natural clearance falls short). Setting
   it to 0.5 alone moves the mean 73.8 → 54.1 and collapses `ragtime-nightingale`
   987 → -264 — 46 systems, so its error was accumulated padding.
2. **The title gap is worth ~30px.** abcjs leaves 27.6px between title baseline and top
   staff line; we leave 58. `titleStep: 11.12` makes it exact and drives six fixtures to a
   y offset of exactly 0.0.
3. **abcjs's separations are inert.** Adding `systemStaffSeparation` (48) and
   `staffSeparation` (61.33) changed the result by NOTHING to the decimal, because our
   natural stacking is already looser than either. A minimum cannot fix loose — see 1.

**The model is known**, from abcMusicKit v1, which is byte-identical to abcjs and cites
`draw.js` line by line in `SVGDraw.swift`:

```
rendererY  = padding.top                 // draw.js:14
drawTopText(...)                         // advances by the BLOCK's own height
rendererY += spacing.music (7.56)        // draw.js:17
→ music
```

`spacing.music` clears the text from the **top of the music** — tempo marks and
annotations included — not from the staff line. That is why one constant cannot work.

**Why nothing shipped.** Every attempt was judged against ONE aggregate offset, and three
of the four improved it while making individual fixtures worse. Ganged terms cannot be
told apart by a single number, and `marginY: 2.0` would have zeroed the aggregate and
taught nothing.

**Do this next:** measure the three terms SEPARATELY against abcjs — title baseline to
music top, staff origin to staff origin within a system, system origin to system origin —
and set each from its own abcjs constant. Then re-measure the aggregate as a *result*
rather than as the thing being tuned.

---

## Also open

- **Mid-tune `M:`** — parsed, drawn nowhere. Blocked on the structural gate being FIRST
  TUNE ONLY, so it cannot be scored there; every mid-tune meter in the corpus is in a
  later tune. `frere-jacques` also breaks mid-measure, which our measure-granular systems
  cannot express — the one fixture whose system count still differs.
- **The glyph table is built but NOT WIRED.** `glyph-table.ts` resolves abcjs's glyphs at
  abcjs's advances for strict, Bravura otherwise, and is tested. Wiring it means threading
  through ten layout signatures, and it closes the SMALL residual (single-system fixtures
  sit 0-9px out) — do it once vertical placement is fixed and it is the dominant error.
- **`%%center`** — `center-text` is 219px out because abcjs's trailing `%%center` makes
  its music line not the last line, so abcjs always justifies it.
- **Audio** — nothing exists. "Match abcjs audio output" is unmet in the strongest sense.

---

## Method notes from this session

The 2026-07-21 notes still apply. These are new and each cost real time.

1. **A gate that measures spread cannot see a translation.** `score-reorder-shared`
   scored dx 0.0 — perfect — while sitting 100px left of abcjs. Mean offset across the
   corpus was 44px while the table read like convergence. Offsets are now tracked.
2. **The function you are looking for may not exist.** abcjs's line-breaking algorithm
   was found by listing `write/` and seeing nothing that computes one. ABC breaks where
   the file breaks.
3. **Check the shell loop before believing the check.** A baseline verification looped
   over an unquoted file list; `little swallow` split on its space, the loop ran once on a
   concatenated name, and it printed a clean bill of health.
4. **Falsify the cheap hypothesis first.** "abcjs justifies lines ending `|]`" fitted four
   fixtures and died on the fifth, in one command, before anything was built on it.
5. **Never raise a ceiling to make a change pass.** One raise with a measured cause and a
   prediction attached was defensible — and the prediction came true, the number falling
   below its original once line breaking converged. Eight raises with an unexplained cause
   is how a gate stops meaning anything.
6. **v1 is the reference for "how did byte parity actually work".** It is MIT, it is
   byte-identical to abcjs, and it cites abcjs line by line. It turned an unexplained
   5.3px into a named model with constants attached. v2 and Gould had nothing to add here.
