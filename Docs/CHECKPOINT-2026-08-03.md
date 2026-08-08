# abcts — Checkpoint, 2026-08-03

Supersedes `CHECKPOINT-2026-08-02d.md`, which stays as the record of how the declared-box
idea was found. Read this, then `VERTICAL-ARC.md`, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE IN ONE TABLE

| lane | branch state |
|---|---|
| `main` | vertical arc v1 merged. GREEN 505/505. Untouched. |
| `geometry/horizontal` | closed, GREEN 505/505. Untouched. |
| `geometry/vertical` | **THE OPEN ARC**, pushed. **682 of 683**, and the one red is named below. |

**THERE ARE TWO CORPORA NOW**, and that is the biggest change on this branch:

| | fixtures | gate |
|---|---|---|
| `../abcMusicKit/Tools/abcjs-debug/` | 41 | `pixel-parity.test.ts`, per-fixture ceilings |
| `tests/corpus-abcjs/` | **174**, harvested from abcjs's own test suite | `corpus-abcjs.test.ts`, three aggregate assertions |

| corpus | standing |
|---|---|
| 41-fixture | **20/29** exact on all four axes at 0.05px, **23/29** within 0.25px. Only NINE are off any axis; only FIVE off a vertical one. |
| harvested | **172/174** content-correct. 72 / 83 / 91 / 116 within 0.05 / 1 / 5 / 25px. **174/174 parse and render without throwing.** |
| `ragtime-nightingale` extents | **39 of 46** staves match abcjs's own `staff.top`/`.bottom`, from 7 when this arc opened |

---

## THE IDEA, AND THE TWO QUESTIONS THAT GO WITH IT

**abcjs does not measure what it draws. It DECLARES a box and reserves that.** The list is
now essentially complete, and every entry was a real divergence:

| element | declares | source |
|---|---|---|
| clef | `symbolHeightInPitches + clefPos + ofs` | `create-clef.js:37,62-70` |
| time signature | `pitch ± thickness/2` | `create-time-signature.js:25` |
| key signature | `verticalPos + height + fudge` | `create-key-signature.js:17-25` |
| tempo | a FLAT 6 pitches | `tempo-element.js:12-13` |
| tuplet | a box round the NUMBER, `yTextPos + 1` / `− 2` | `layout/triplet.js:20-21` |
| dynamic, either side | a flat 6 + 1 margin | `dynamic-decoration.js:10` |
| **notehead** | **`pitch ± 2.0888/2`**, not `± 1` | `create-note-head.js:34` |
| **accidental** | **`pitch ± h/2`** | `create-note-head.js:99-100` |
| **decoration, stacked** | `pitch ± symbolHeightInPitches/2` | `decoration.js:163` |
| **decoration, close** | a POINT at its pitch — no thickness at all | `decoration.js:47` |
| **decoration, text** | a flat `thickness: 3` | `decoration.js:151` |
| **tie / slur** | a 3-pitch box, and a ±4 one EARLIER | `tie-element.js:228-251`, `:28-36` |
| BEAM | **nothing** — it is not in the switch | `set-upper-and-lower-elements.js` |

**WHOSE box is it?** A volta belongs to the first voice of the first staff, not to every
voice carrying the `|1`. A chord symbol and an annotation share ONE lane.

**WHEN is it applied?** Ink, then lanes, then post-lane. A tuplet's box is ink and the
lanes stack on it; a tie's `getYBounds` box comes after the lanes and only pushes their
result. The same box in the wrong phase is a different number.

And: **one element can reserve TWICE with different figures at different times** — a tie
declares ±4 pitch in `setEndAnchor` (ink) and a 3-pitch box in `getYBounds` (post-lane).

---

## THE HARD-WON RULE OF THIS BRANCH

**MEASURE THE OUTPUT. THE SOURCE WILL LIE TO YOU — not often, but expensively.**

Three times on this branch a careful, correct-looking chain of source reads predicted
something abcjs's own SVG denies:

1. `putChordInLane` rewrites an item's `chordHeightAbove` to `height * 1.25 * lane`, which
   reads as if the reserve grows per lane. It does not — that runs in `layoutVoice`, long
   after `setLimit` fixed the staff's `specialY` at engrave time. Probed,
   `stacked-annotations` reports `chordHeightAbove: 4.7794` with `chordLines.above: 2`.
2. `setLane`'s `invertLane` composed with `draw/text.js`'s lane offset predicts the LAST
   written annotation on top. The SVG has `"^Allegro"` at y 79.12 and `"^con brio"` at
   99.12 — first-written on top.
3. `RelativeElement` opens with `top = bottom = pitch`, and that got written into a
   comment. The next lines widen it by `thickness / 2`, which `create-note-head.js` always
   passes. The 0.0444 of a pitch that leaves is printed all over abcjs's own numbers.

A `grep` of the golden settled each in seconds. **Read the source to find the mechanism;
read the output to find the number.**

---

## WHAT LANDED ON THIS BRANCH

Sixteen findings, all cited, all with a fixture that proves them. The `-08-02d` checkpoint
lists 1–13; these are the rest:

| # | finding | source |
|---|---|---|
| 14 | A CHORD SYMBOL AND AN ANNOTATION ARE ONE LANE, and the lane COUNT is packed by horizontal overlap | `relative-element.js:60-76`, `layout/voice.js:70-101` |
| 15 | A TEXT DECORATION stacks on the ornament cursor and declares a flat `thickness: 3` | `decoration.js:147-153` |
| 16 | An ACCIDENTAL declares `pitch ± h / 2` | `create-note-head.js:99-100` |

Plus the gaps the new corpus found — see below.

### `frere-jacques` is CLOSED on both vertical axes

**dy 22.35 → 0.03, oy −12.53 → −0.02.** All four staves match abcjs's `staff.top` to a
hundredth. It had been filed since 2026-07-22 as "the source-line-wrap model conflict, a
design question"; it was four ordinary bugs — a `P:` attached to the measure it followed
instead of the one it heads, `%%partsbox` unimplemented as both a box and a lane, the
decoration stack, and the annotation lane plus the text decoration's declared box. Its
system count had matched abcjs since the line-wrap work. **What is left on it is
horizontal** (dx 22.15, ox −3.63).

---

## THE ABCJS TEST-SUITE CORPUS

`tests/corpus-abcjs/` — 174 tunes harvested from abcjs's `tests/`, goldens generated by
running abcjs itself. `npm run harvest` rebuilds the fixtures, `npm run harvest:goldens`
the goldens, `SOURCES.json` maps each back to its test file. They live here because
`../abcMusicKit` is read-only; the directory carries abcjs's MIT notice.

**The ASSERTIONS are not ported and are not worth porting** — they read abcjs's internal
`visualObj` tree, which `abcts/compat` does not reproduce, and `tests/api/` `require()`s
abcjs's own modules. Only the inputs transfer.

The gate asserts three things and deliberately is NOT 174 ceilings: nothing throws
(174/174), notehead counts match except a named gap list (a ratchet BOTH ways — a fixed
gap must be struck off), and how many fixtures land within 0.05 / 1 / 5 / 25px as counts
that only go up.

### It immediately found a feature that was parsed and never painted

**`&` OVERLAY VOICES.** The parser had always read them — `measure.overlays` populated and
correct — and nothing downstream looked, so every layer but the first went undrawn. 505
tests had been green over it for weeks, because **nothing in the 41-fixture corpus uses
`&` anywhere**.

A GATE IS ONLY AS BROAD AS ITS INPUTS, and ours had all been chosen by the same people who
wrote the engine.

Also fixed from what it found: zero-length notes (`C0`, which abcjs draws as a stemless
quarter head), `%%stretchlast` (13 fixtures), `%%staffwidth` (3), `%%maxStaves` incipits.

### Two content gaps left, both narrow

- **A grace note before a `y` SPACER is dropped** — `(f3 {a})y`. The grace attaches to the
  `y`, and `Rest` has no `graceNotes` field. The model says so on purpose: *"a rest does
  carry decorations — but not ties, slurs, grace notes or lyrics, none of which apply to
  silence"*. abcjs disagrees for a spacer, which is a layout device rather than silence.
  **A MODEL DECISION, not a mechanical fix.**
- **A header block before the first `X:`** (`%% example / T: wed / %%example / X:1`)
  splits the book in two where abcjs keeps one tune.

### Unimplemented directives, ranked by how many fixtures want them

`%%barnumbers` (8); the font directives `%%partsfont` / `%%titlefont` / `%%voicefont` /
`%%measurefont` / `%%barlabelfont` (11 between them); `%%musicspace` (4); `%%text` (4);
`%%sep` (2); `%%setbarnb` (2). `%%MIDI *` and `%%percmap` are audio and out of scope until
there is a synth.

---

## THE GATE — one red, and a way it hides failures

| item | measured | recorded | what it is |
|---|---|---|---|
| `ragtime-nightingale` oy | **1.96** | 0.59 | a GENUINE widening — and its extents got BETTER over the same changes. Not raised. See below. |
| `ragtime-nightingale` ox | 1.16 | 1.05 | a STALE RECORD, 1.16 on a clean tree too. Hidden behind the `oy` assertion. |

**A FIXTURE'S ASSERTIONS SHORT-CIRCUIT, so a failing axis HIDES the ones after it.** All
eight checks live in one `it` and the first `expect` to fail ends it. This hid something
three separate times in one session. **When a fixture goes green, re-read the axes behind
the one you fixed.** Collecting all four before asserting is the honest fix; it will show
more red before it shows less, so it needs a decision rather than a commit.

### Why ragtime's mean got worse as its geometry got better

`oy` went 0.54 → 1.96 while its extents went 36 of 46 exact → **39**, its staff-line
boundaries down to two off by more than 0.3px, and 4.09px of drift across a 6,000px page.

**The two numbers measure different things and the mean is the weaker one.** It was 0.54
because errors above and below were cancelling; it is 1.96 because the page no longer
drifts back. Extent accuracy is the honest signal, and it improved every time the mean did
not. The ceiling is not raised and the reason is here.

---

## FOUR GATE NUMBERS ARE ARTEFACTS — do not chase any of them

The pixel gate pairs the i-th notehead of each engine, so a difference in EMISSION ORDER
reads as a position error.

1. **`ragtime-nightingale` dy 58.1 is TWO MIS-PAIRED NOTEHEADS.** The histogram of its 2009
   y-deltas puts every head but two in [−2, +4]; drop the one swapped pair and dy is
   **5.38**. The two deltas are +33.86 and −24.28 and their difference is the whole spread.
2. **`vree-grace-notes` dy 11.6 AND dx 32.5 are the same artefact.** abcjs emits a graced
   note's MAIN head before its graces where we emit them after. Sorted by x — valid on a
   one-system fixture — dy is 0.02 and dx a uniform 1.99, which is the grace glyph.
3. **`little swallow` dx cannot reach zero against these goldens.** Their generator has an
   ASCII-only width table with a flat `|| 8` fallback, so 73 of its 576 lyric characters —
   the Chinese — were measured at 8px each. A property of the GOLDEN, not of abcjs.

**Sorting by (x, y) is NOT a valid re-pairing on a multi-system fixture** — it mixes
systems and makes the number far worse (ragtime 58 → 11 255). It is valid on a
single-system one, which is how (2) was confirmed.

---

## WHAT IS LEFT — 41-fixture corpus

| fixture | dy | dx | oy | ox | what it is |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 58.14 | 69.82 | −1.96 | −1.16 | dy is the pairing artefact; the rest below |
| `little swallow` | 1.92 | 23.97 | −0.58 | −5.73 | dx is the golden limitation; dy/oy is the LYRIC RESERVE, diagnosed below |
| `frere-jacques` | 0.03 | 22.15 | −0.02 | −3.63 | vertically CLOSED; what is left is horizontal |
| `vree-grace-notes` | 11.64 | 32.50 | 0.03 | −1.14 | both artefacts |
| `zocharti-loch` | — | 5.35 | — | 0.69 | horizontal only |
| `happy-birthday` | — | 3.85 | — | −0.49 | horizontal only |
| `multi-voice-lyrics-two-voices` | 0.07 | — | 0.05 | — | survives sorting, so a real 0.07px |
| `two-voice-invention` | 0.07 | — | — | — | survives sorting |
| `vree-sharps` | — | — | 0.07 | — | |

### `little swallow` — diagnosed, and it is our FORMULA not our ink

abcjs's rule is uniform: `staff.bottom = ink − (lyricHeightBelow + 1)`, and the LYRIC
follows the ink too — `lyric pitch = ink − spacing.vocal / STEP`. Its five ink bottoms are
−2.5 / −3.4747 / −3.0 / −3.4727 / −3.0 and its staff bottoms follow exactly.

**Our ink agrees** — probed, staves 2 and 4 both bottom out at pitch −3.0, same as abcjs.
What does not agree is the reserve: ours is anchored on the DRAWN LYRIC BASELINE, where
abcjs anchors on the INK and subtracts the lane. So where two staves share an ink bottom
abcjs gives them the same answer and we give them two.

Port the structure, then re-derive the constant — do not drop a new constant into the old
form. The existing one was verified against abcjs's output on three shapes.

### `ragtime-nightingale` — IT IS NOT THE BEAM

An earlier checkpoint said its remaining boundaries turned on abcjs's beamed stems reaching
0.47–0.58 pitch further than ours. **Measured, they do not:**

| | abcjs | ours |
|---|---|---|
| beam lines | 292 | 292, first 194 matching `startY`/`endY` EXACTLY |
| beamed stems | **942** | **940** |
| `bary` over the aligned stems | — | within **0.07 pitch** |
| stem x | — | **−0.54px** mean, the horizontal residual |

`calcYPos`, `calcSlant`, the `pos = round(extreme ± (stemHeight − 2))` reduction, the
`floor(slant/2)` asymmetry, the middle-line clamp and the down-stem `dy/2` fudge are all
already ported and all already agree.

**What is concrete is 942 beamed stems against our 940.** Two beamed notes differ, which is
also what throws the beam lists out of alignment from index 195 — every beam past it gets
compared against its neighbour. Find those two first.

---

## THE PROBES, and how to use them

```bash
# abcjs — env-guarded log in the vendored source, then run abcjs's own harness.
# abcMusicKit is a clean git repo, so this is safe and fully reversible.
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

**Compare abcjs's staff extent at THREE points, not one**, all in
`set-upper-and-lower-elements.js`:

| probe | where | what it is |
|---|---|---|
| `SPECIAL` | function ENTRY | ink, before any lane |
| **`POST`** | after the voice loop, before `lastStaffBottom` | **ink + lanes + ties — COMPARE AGAINST THIS** |
| `PROBE` | at `lastStaffBottom` | plus the inter-staff `addedSpace`, which is a SEPARATION rule, not an extent |

Others that paid: `layoutVoice`'s end printing which CHILD holds `voice.top`/`.bottom` and
which of its RelativeElements holds the child's; `getYBounds` in the `TieElem` case;
`layoutTriplet`'s end; `layoutBeam` printing `average`/`min`/`max`/`stemHeight` and the
computed ends; `createStems` printing each `bary`.

**On our side**, `ABCTS_PROBE=1`:

- each staff's extent in abcjs PITCH (`6 - 2 * y`) from the STACKING LOOP — never from
  inside `verticalExtent`, which also fires for the top-text block and scrambles the order
- the source line that last raised each side, and the lane flags
- `BLOCK` — the top-text block's `musicTop`, height and offset
- `BEAM` — every beam's inputs and its computed `pos`, slant and ends, in abcjs pitch

---

## TRAPS PAID FOR ON THIS BRANCH

1. **AN EXTENT DIFFERENCE NAMES A STAFF, NOT A MECHANISM.** ragtime's remaining 0.47 pitch
   went into this document as "the beam" because a beam was the nearest thing that could
   produce a fractional number. The number was measured; the cause was guessed; both were
   recorded as one thing. **Probe the mechanism separately, every time.**
2. **MEASURE THE OUTPUT** — see the rule above. Three times, and each cost a run.
3. **THE PHASE MATTERS AS MUCH AS THE FIGURE.** Ink, lane, post-lane.
4. **A FAILING ASSERTION HIDES THE ONES AFTER IT.**
5. **RE-TEST PARKED FINDINGS AFTER THE GROUND MOVES.** The tuplet middle-note height was
   parked as "no corpus fixture has a low middle note that binds". One does — the note was
   written before the surrounding arithmetic was abcjs's.
6. **A RIGHT CHANGE CAN MAKE THE NUMBERS WORSE ON ITS WAY IN.** The curve reserve took
   ragtime's oy from −11.7 to +18.6 before the phase fix took it to −0.41. Extent accuracy
   was the honest signal throughout; the pixel mean was not.
7. **A FIX'S REASONING CAN OUTLIVE ITS PREMISE.** The `P:` anchoring was recorded on
   2026-07-21 with reasoning that was true then; the line-wrap work changed measure closing
   and the premise went with it. Re-read a fix's reasoning when the thing it reasoned about
   changes.
8. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 682/683; the one red is ragtime's oy, and it is
                                      #   the ONLY expected failure — anything else is yours
npm run parity
```

Baselines: `npm run baseline`, READ the diff, commit them with the code.
`tests/fuzz.test.ts` has a wall-clock assertion (`ms > 1000`) and flakes on a loaded
machine; everything else in it is deterministic.
