# abcts — Checkpoint, 2026-08-02 (evening)

Supersedes `CHECKPOINT-2026-08-02.md`. Read this, then `HORIZONTAL-ARC.md`, then
`ARCHITECTURE.md`, then `CLAUDE.md`.

---

## THE HEADLINE

**`geometry/horizontal` is GREEN at 505/505**, pixel-parity gate included, with ceilings
re-recorded. It was red by design when the session began.

| axis | was | now | at ZERO |
|---|---|---|---|
| dy spread | +0.00 | +0.01 | 18/29 |
| oy offset | −0.20 | −0.18 | 3/29 |
| dx spread | **+9.41** | **+0.01** | **8/29 → 22/29** |
| ox offset | **−1.37** | **−0.00** | **8/29 → 22/29** |
| notehead distance | 10.20 | **5.59** | — |

Twenty-two of twenty-nine fixtures now match abcjs's horizontal placement EXACTLY.
`voice-middle-after-clef`, stuck at 79.0 through the whole arc, is 0.0.
`multi-voice-triplet-brackets` went 110.4 → 0.0.

**A PASSING GATE IS STILL NOT PARITY.** Green now means "no worse than recorded", and what
is recorded is much better than it was. Parity is every axis at zero on every fixture.

---

## The lesson held, and it is worth restating

Every single thing that moved the corpus this session was **abcjs's STRUCTURE, ported**, and
every one of them was found by INSTRUMENTING ABCJS TO ANSWER A QUESTION. Not one came from
adjusting a number to see what happened. The constants that did change (bar widths, the
grace step, the font tables) were each read straight out of a probe after the surrounding
loop was already abcjs's.

The order matters and it is not negotiable: **port the loop, then read its constants.**

---

## What was ported, and what each probe answered

### 1. One timeline per LINE — the column model is gone

`layoutStaffGroup` walks ONE cursor along one timeline per line. The per-measure column
model, `columnWidths`, the per-block factor and the trailing-relief correction are all
retired. Three things it could not have:

- **Barlines are not aligned.** They are ordinary zero-duration elements on the timeline.
  `voice-middle-after-clef` writes a bar of 1.0 against a bar of 1.5 and abcjs lets them
  fall apart. A column IS a measure, so the old model force-aligned them.
- **A FINISHED voice still pushes the cursor.** `getDurationIndex` reads an exhausted
  voice's `children[i]` as undefined and returns `durationindex - 5e-7`, which keeps it in
  `currentvoices` forever; the isolation loop takes its `getNextX` before `layoutOneItem`
  declines to place anything. Measured: on `voice-middle-after-clef` the shorter voice's
  final `|]` at 332.917 pushes the longer voice's next note to 340.917, its own 8px width.
  Note the asymmetry that makes this terminate — ended voices are EXCLUDED when finding the
  minimum duration index and INCLUDED in the isolation.
- **The prefix is on the same cursor.** Clef, key and meter are `staff-extra` children,
  taken one element at a time, so a treble clef against a bass clef does not give two
  staves different prefix widths.

The solve is `calcHorizontalSpacing`: `constSpace = w − units·spacing` is everything that
will not move and one division hits the target, iterated 8 times because which rods win
moves with it.

### 2. A note IS its notehead

abcjs's `w` for `^c` is 9.810 — the notehead alone. The accidental is `extraw = -14.375`
and no part of the rod: it reaches back into the gap the previous note's spring already
opened. Probed on `vree-sharps`, where every gap is a flat 42.43px, exactly the quarter-note
spring, with the sharps sitting inside it. Grace notes are the same shape at a flat 10px
each (`extraw = -30` for three).

`left` (abcjs's `-extraw`) and its shift rule are ported, including `shiftRight` for
anything already placed at the same time slot.

### 3. A lyric or chord symbol is part of the note's width

`addCentered`, verbatim:

```js
var half = elem.w / 2;
if (-half < this.extraw) this.extraw = -half;          // LEFT: half, dx DROPPED
if (elem.dx + half > this.w) this.w = elem.dx + half;  // RIGHT: dx + half
```

Asymmetric, because the left side drops `dx`. A lyric anchors at `dx = 0`, a chord symbol
at `dx = 4.91` (half a notehead). **Annotations are NOT in this** — abcjs gives `"^Allegro"`
a RelativeElement of `w = 0`; they draw without occupying. Getting that wrong is what broke
`stacked-annotations` 0.0 → 55.6 for one round.

An unbeamed FLAG counts: `flags.u8th` sits at `dx = 9.21, w = 6.69`.

### 4. Measure text in the fonts abcjs names

Once a lyric's width is half its note's rod on each side, the metric table decides where
the music goes. abcjs's defaults are the spec and they are not one family:

| role | face | used for |
|---|---|---|
| `vocalfont` | "Times New Roman" 13pt **BOLD** | lyrics |
| `gchordfont` | Helvetica 12pt | chord symbols |
| `annotationfont` | Helvetica 12pt | annotations |

We measured everything with Georgia rescaled to a mean letter advance of 0.5 em — a uniform
13% narrow on sung music, which is the tell for a FACE difference rather than a table error.
Regenerated from the real faces, unnormalised. Checked against widths probed out of abcjs's
own `extraw`: `Hap-` 36.875 vs Times New Roman Bold's 36.84, `Amaj7` 45.380 vs Arial's 45.35.
Arial stands in for Helvetica (`.ttc`-only here); the numbers are the proof, not the claim.

Lyrics now DRAW bold as well, and anchor on the element's x — the notehead's LEFT edge, not
its middle.

### 5. The smaller ones, each probed

- **Bar rods are per KIND**: `|` 1, `||` 4, `|]` 8, `|:` 16, `:|` 14, `::` 22, plus the flat
  10 of `minspacing`. One flat 11 put a final `|]` 7px narrow, and because a line's last
  element loses its `minspacing` that 7px landed entirely in the justification's constant
  term — `vree-compound-meter` stretched every gap by 0.58px, drifting to 6.4px by the
  twelfth note.
- **A brace or bracket moves the left edge** by a flat 10, name or no name.
  `getLeftEdgeOfStaff` ends `return x + ofs`. The "width of an A" is NOT part of it — that
  is added only when there is a header to clear. `ragtime-mini` probes `leftEdge = 25.000`.
- **The page target RATCHETS.** `if (Math.round(thisWidth) > Math.round(maxWidth)) maxWidth
  = thisWidth`, so a line that cannot compress to the page widens the page for every line
  after it. Forward-only; `expandToWidest` is off by default.
- **A dotted note counted its notehead twice.** `dotWidth` is already a full extent from the
  notehead's origin, so `max(|offsets|, dotWidth) + head.width` added it again.

### 6. CLOSED: the absolute stretch guard

Listed as open since the vertical arc, and the answer is **do not implement it**. It is
INERT in abcjs. `minSpace` is a min over every pass of the pushing voice's spacing units,
and the FIRST pass always contributes zero: every voice starts at `leftEdge`, so no voice's
`getNextX` beats the cursor and `spacingunit` stays 0. Probed on `voice-middle-after-clef`:
`minSpace = 0`, so `spacing * 0 > 50` is never true. One probe, one long-standing item.

---

## What is still open

| fixture | dx | what it is |
|---|---|---|
| `ragtime-nightingale` | 72.4 | its `dy` is 58.1 — go at the VERTICAL first |
| `little swallow` | 24.0 | Chinese lyrics; a metrics question, not a structural one |
| `frere-jacques` | 22.2 | abcjs wraps a source line — the known model conflict, `dy` 22.1 |
| `multi-voice-lyrics-two-voices` | 7.6 | |
| `zocharti-loch` | 5.4 | a sub-pixel drift, ~1px of constant term |
| `happy-birthday` | 3.9 | |

Not ported, and no fixture needs them yet: abcjs's second-voice notehead-overlap widening in
`layoutOneItem`; `checkLastBarX`, which aligns the LAST bar of a line across voices (and has
a real quirk — it only pulls a bar right if an earlier voice's was further right).
`%%titleformat`, `%%writefields`, `%%aligncomposer`, `"@x,y"` free placement and header `P:`
part order are all still unimplemented.

`[|` is folded into `double` by the parser where abcjs keeps them apart at 13 and 4. That is
a model question, not a spacing one.

---

## A GATE DEFECT, so the next reading of the table is not misled

**`vree-grace-notes` reports dx 32.5 and that number is an ARTEFACT.** The pixel gate pairs
the i-th notehead of each engine, and abcjs emits a graced note's MAIN head before its
graces where we emit them after — so it compares our grace against abcjs's note. Sorted by
x, its mains are exact and its graces sit a uniform 1.99px left, which is a grace GLYPH
difference and not a placement one. Three fixtures carry graces at all.

This is trap 4 from the previous checkpoint, live: classify what you measured before
believing it.

---

## Traps, still all paid for

1. **A recorded diagnosis is a hypothesis.** This file included — re-measure.
2. **The element dump is pre-beam AND pre-mutation.**
3. **A right change can make the corpus worse** — look for its partner.
4. **Band-assignment probes lie**, and so does index-pairing. See above.
5. **Check `git -C ../abcMusicKit status` before finishing.** Done for this session; it is
   clean.

---

## Verify loop

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # know your lane
npx tsc --noEmit                      # from the repo ROOT
npx vitest run                        # 505/505 on BOTH main and geometry/horizontal now
npm run parity                        # every axis in one view
```

Baselines: `npm run baseline`, READ the diff, commit them with the code.

## THE METHOD — unchanged, and it earned its keep

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

The probes that paid this session, in case they are wanted again: `layoutOneItem` printing
`x`/`w`/`minspacing`/`durationindex` per element; the same function printing
`er`/`extraw`/`pad`; `layoutStaffGroup` printing the pass state; `setXSpacing` printing
`spacingUnits`/`minSpace`/`w`/`target` per iteration; and one printing each element's
CHILDREN as `name[dx= w=]`, which is what gave `addCentered`, the flag, and the annotation
answer in a single run.
