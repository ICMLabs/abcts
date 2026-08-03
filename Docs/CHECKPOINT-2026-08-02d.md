# abcts — Checkpoint, 2026-08-02 (fourth)

Supersedes `CHECKPOINT-2026-08-02c.md`. Read this, then `VERTICAL-ARC.md`, then
`HORIZONTAL-ARC.md`, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE IN ONE TABLE

| lane | branch state |
|---|---|
| `main` | vertical arc v1 merged. GREEN 505/505. Untouched. |
| `geometry/horizontal` | closed, GREEN 505/505. Untouched. |
| `geometry/vertical` | **THE OPEN ARC.** Red on **2** gate items, down from 5 — and NEITHER is from this session's work. |

Per-axis over the 29 pixel-gated fixtures. The headline counts have not moved, because
the threshold is 0.05px and this session's residuals land just above it; the MAGNITUDES
moved a long way, so the 0.25px column is the one that shows the session:

| within | dy | dx | oy | ox | ALL FOUR |
|---|---|---|---|---|---|
| 0.05px | 21/29 | 23/29 | 20/29 | 23/29 | **16/29** |
| 0.25px | 24/29 | 23/29 | 23/29 | 23/29 | **20/29** |
| 1.0px | 24/29 | 23/29 | 28/29 | 25/29 | 22/29 |

`ragtime-nightingale` dy 66.82 → 58.14, oy −3.80 → **−0.41**.
`multi-voice-triplet-brackets` dy 4.05 → **0.17**, oy −1.62 → **−0.24**.
Nothing else in the corpus moves — verified by measuring a clean tree.

---

## THE IDEA, ONE TURN FURTHER ON

The `-c` checkpoint's rule still holds — **abcjs declares a box and reserves that** — and
this session added the two questions you have to ask about every declared box:

**WHOSE box is it?** A volta belongs to one voice on one staff, not to every voice that
happens to carry the `|1` barline. Getting that wrong reserved a lane on a staff abcjs
never reserves one on, and drew five brackets where abcjs draws one.

**WHEN is it applied?** A tuplet's box is INK — it goes in through `layoutVoice`'s
`adjustRange` before anything else, and the lanes then stack on top of it. A tie's
`getYBounds` box is not: the lanes run FIRST and the voice loop takes `max`/`min` against
what they produced, so a curve shorter than the lane contributes nothing at all. Counting
curves as ink put five of ragtime's staves out by exactly how far the curve poked past the
music underneath. **The same box in the wrong phase is a different number.**

And a corollary the same fixture proves twice: **one element can reserve more than once, at
different times, with different figures.** A tie sets `top/bottom = ±4 pitch` in
`setEndAnchor` the moment its closing note is known (ink), and a 3-pitch box in
`getYBounds` much later (post-lane). Porting only the second left `ave-verum-corpus` short.

---

## THE FIVE FINDINGS, with their citations

| # | finding | source |
|---|---|---|
| 1 | The ending lane is `endingHeightAbove + 1`, and a TUPLET declares 4 where a VOLTA declares 5 | `triplet-element.js:25`, `ending-element.js:8`, `set-upper-and-lower-elements.js:37` |
| 2 | ONE volta bracket per system — first voice of the first staff only | `abstract-engraver.js:1034-1037` |
| 3 | A tuplet inside a LONGER beam still gets a bracket | `layout/triplet.js:11` |
| 4 | A tie or slur reserves a declared box, twice, on rules of its own | `tie-element.js:28-36` and `:228-251` |
| 5 | A tuplet's low middle note counts `bottom - height`, and `height` defaults to **4** | `layout/triplet.js:56`, `relative-element.js:37` |

Three details inside (4), each of which the finding is wrong without:

- **ON A SHARED STAFF THE VOICE DECIDES THE SIDE, and the stems do not come into it.**
  `calcSlurDirection` short-circuits: `voiceNumber === 0` → above, `> 0` → below. Only a
  voice alone on its staff reaches the stem rules —
  `voice.voicetotal < 2 ? -1 : voice.voicenumber` (`abstract-engraver.js:235`). Reading
  the stems for every voice put ragtime's upper-voice slurs below, where abcjs draws them
  above, and that flipped which end of the curve got pinned.
- **A BEAMED END IS PINNED TO `parent.fixed`, TIES INCLUDED.** `getYBounds` branches on
  `this.isTie` — and **nothing sets that before layout**. The constructor never reads
  `options.isTie`; only `draw/tie.js` assigns it, at draw time. So every curve takes
  `calcSlurY` here whatever it is. That is abcjs's own bug, and excluding real ties from
  the rule undid the whole finding in one run. A FRACTIONAL `startY` against an INTEGER
  anchor pitch is the tell that the pin, not the notehead, is in play.
- **The `(highestVert + pitch) / 2` half-way-up-the-stem case is a no-op.** Probed,
  `highestVert` IS the anchor pitch on every binding curve here, so the average is the
  pitch. Not reproduced, and recorded so nobody ports it twice.

Also confirmed and used: **a notehead's declared box is its PITCH, not its outline** —
`RelativeElement` sets `top = bottom = pitch` and only `pitch2`, `thickness` and
`stemHeight` widen it (`relative-element.js:18-30`).

---

## `ragtime-nightingale` — from a boundary hunt to a residual list

The method the `-c` checkpoint prescribed worked, with one addition that made it much
sharper: **compare abcjs's staff extent at THREE points, not one.**

```bash
# in set-upper-and-lower-elements.js, all three env-guarded on ABCJS_PROBE:
#   SPECIAL — staff.top/.bottom at function ENTRY          … ink, before any lane
#   POST    — after the voice loop, BEFORE the lastStaffBottom block  … ink + lanes + ties
#   PROBE   — at `lastStaffBottom = 2 - staff.bottom`      … plus the inter-staff addedSpace
```

**POST is the one to compare ours against.** SPECIAL misses the tie adjustments; PROBE
adds `addedSpace`, which is a SEPARATION rule and not the staff's extent at all — chasing
that cost a run and produced a table of −7.15 / −7.25 / −6.15 constants that meant nothing.

Ours comes from the staff-origin call in the stacking loop, printed in abcjs pitch
(`6 - 2 * y`); `ABCTS_PROBE=1` now does that, with the source line that last raised each
side, and the lane flags beside it.

| | staves matching abcjs on BOTH top and bottom |
|---|---|
| session start | 7 / 46 |
| after the five findings | **36 / 46** |

Its staff-line placement is now inside 5px of abcjs across the whole page (from a drift
that reached 49px), and only four boundaries are off by more than 0.4px.

### What is left on it

Ten staves, all small, and every one of them a named residual rather than a mystery:

- Two at `dB = +1.0` whose bottom we take off a glyph reserve where abcjs takes it off
  something a pitch lower.
- `dT` of 1.22 on one staff, and a scatter of ±0.5 on five more.
- The first staff's 20.3 is the top-text block, which is a different question.

### ITS dy OF 58.14 IS TWO MIS-PAIRED NOTEHEADS — measured, not guessed

Do not chase it as a geometry number. The histogram of its 2009 per-notehead y-deltas:

```
-24: 1    -2: 1095    -1: 1    0: 352    1: 187    2: 232    3: 98    4: 42    34: 1
```

Every head but two lies in [−2, +4]. **Dropping the two worst pairs takes dy from 58.14 to
5.38**, and the two are a swapped pair in one bar — abcjs `(333.1, 4566.1)` against our
`(288.0, 4600.0)`, and abcjs `(323.1, 4593.3)` against our `(310.0, 4569.0)`. Their deltas
are `+33.86` and `−24.28`; the difference is `58.14`, which is the whole reported spread.

The gate pairs the i-th notehead of each engine, so two heads at the same musical time
emitted in a different ORDER read as a large vertical error. Same class as the
`vree-grace-notes` dx already recorded, and now the third instance — see the note on
sorting below before trying to re-pair.

**Sorting the heads by (x, y) is NOT a valid re-pairing** on a multi-system fixture: it
mixes systems and makes the number far worse (ragtime 58 → 11 255, `frere-jacques`
22 → 420). It IS valid on a single-system one, which is how `vree-grace-notes` was
confirmed — sorted, its dy is 0.01 and its dx a uniform 1.99, the grace glyph. Any real
re-pairing has to be per system and per staff first.

So the honest reading of ragtime is **a real dy of about 5.4px** with two heads emitted in
the wrong order. Find the ordering difference — it is around x 288–333 at y ≈ 4570–4600 —
rather than looking for 58px of geometry that is not there.

Its `dx` of 69.82 has still had no attention since the horizontal arc closed.

---

## THE GATE — and a way it can hide a failure

Two items red, and **neither is from this session** — both measure identically on a clean
tree, which is how they were classified:

| item | measured | recorded | what it is |
|---|---|---|---|
| `frere-jacques` dy | 22.35 | 22.15 | the source-line-wrap model conflict. A design question; read the risk note before touching it. |
| `ragtime-nightingale` ox | 1.16 | 1.05 | **a STALE RECORD, not a widening.** 1.16 on a clean tree too. Left alone rather than raised. |

**A FIXTURE'S ASSERTIONS SHORT-CIRCUIT, so a failing axis HIDES the ones after it.** All
eight checks for a fixture live in one `it`, and the first `expect` to fail ends it. Both
items above were invisible until this session's work made the assertion ahead of them
pass — ragtime's `ox` behind its `dy`, and `frere-jacques` has a third one still hidden
this way: its **`oy` measures −12.54 against a recorded −5.4**, and has for some time.

Raising either number to surface it is exactly what the contract forbids, and collecting
all four before asserting would surface `frere-jacques` oy as a third red without fixing
anything. Recorded here instead. **When a fixture goes green, do not assume the axes
behind the one you fixed were ever passing — re-read them.**

Ceilings were re-recorded DOWNWARD only. Where the measurement is worse than the record,
the record was left alone.

---

## TWO GATE LIMITATIONS — unchanged, do not chase either

1. **`vree-grace-notes` dx 32.5 is a PAIRING ARTEFACT.** abcjs emits a graced note's MAIN
   head before its graces where we emit them after. Sorted by x its mains are exact.
2. **`little swallow` dx cannot reach zero against these goldens.** Their generator carries
   an ASCII-only width table with a flat `|| 8` fallback, so 73 of its 576 lyric characters
   — the Chinese — were measured at 8px each. A property of the GOLDEN, not of abcjs.

---

## WHAT IS LEFT, ranked

| fixture | dy | dx | oy | ox | what it is |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 58.14 | 69.82 | −0.41 | −1.16 | dy: check the pairing FIRST. dx: horizontal, untouched since that arc. |
| `frere-jacques` | 22.35 | 22.15 | −12.54 | −3.63 | the source-line-wrap model conflict |
| `vree-grace-notes` | 11.65 | 32.50 | 0.03 | −1.14 | dx is the pairing artefact; dy is open |
| `little swallow` | 1.92 | 23.97 | −0.58 | −5.73 | dx is the golden limitation; dy/oy open |
| `zocharti-loch` | — | 5.35 | — | 0.69 | horizontal only |
| `happy-birthday` | — | 3.85 | — | −0.49 | horizontal only |
| `ave-verum-corpus` | 2.39 | — | −0.48 | — | **DIAGNOSED — see below** |
| `score-reorder` | — | — | 0.61 | — | the whole drawing 0.62px low; extents match exactly, so it is the top-text block |
| `multi-voice-rest-collision` | — | — | −0.37 | — | our tuplet's `yTextPos` is 0.093 pitch under abcjs's 16.5929 |
| `multi-voice-triplet-brackets` | 0.17 | — | −0.24 | — | was 4.05 / −1.62 |

### `ave-verum-corpus` — diagnosed, one step from closed

Its organ staff reaches its bottom on a slur and nothing else. abcjs stops at **−4.0**,
which is `min(1, 0) − 4` off the `setEndAnchor` reserve. Ours lands at −3.0 and is out by
one pitch, because **the slur's anchors on a CHORD are not abcjs's**: it pairs pitch 1 to
pitch 0 where we pair 1 to 1, and its second slur 1 to 2 where we pair 3 to 2.

Our anchor for a chord carries the chord's whole extent and its centre is the chord's
middle; abcjs anchors a slur on one specific NOTEHEAD. Find which one it picks — it is set
where `startSlur`/`endSlur` attach in `abstract-engraver.js` — and this fixture closes.
That is a chord-anchor question, not a reserve one.

---

## AN OPEN GAP — abcjs's OWN TEST SUITE IS NOT PORTED

Raised 2026-08-02 and worth a decision. `abcjs-6.6.3/tests/` holds **272 `it()` cases in
30 `describe` blocks**, and abcts reads none of them. Everything we gate on comes from
`Tools/abcjs-debug/` — 41 fixtures, their parse/element/SVG goldens — plus our own
hand-written suites.

| directory | cases | what it covers |
|---|---|---|
| `tests/visual/` | 181 | slurs vs beams, decorations, directives, layout, wrap, transpose, tablature, titles, selection, chord grids, svg-per-line |
| `tests/synth/` | 76 | flattener, MIDI, timing, synth options — abcts has no audio, so not applicable yet |
| `tests/parse/` | 13 | ties/slurs, note ids, start chars, tunebook parsing, voices-array |
| `tests/api/` | 2 | `tunebook_svg` |

They are mocha/chai over a jsdom DOM and assert on `getBBox()` and on the
`visualObj[0].lines[…].staffGroup` tree, so they are not runnable as-is — but the roughly
190 non-synth cases are exactly the properties our fixture corpus does NOT gate. `slurs`
alone asserts that a slur sits under the beam it passes, which is a claim about the
geometry this arc keeps rediscovering by hand.

Also unported and separately interesting: `src/test/abc_parser_lint.js` and
`abc_vertical_lint.js`, which validate abcjs's parse tree and its laid-out output against
a JSON schema. That is a shape check we could run over OUR parse output for free.

Not a defect — the corpus is the gate by design and it is at 100% on structure — but
"the 41 fixtures" and "abcjs's own idea of what to test" are not the same coverage, and
the difference has never been written down. Decide whether to port the visual/parse cases
as abcts tests (translating `getBBox` assertions onto `absolutePixels`) or to record that
we deliberately do not.

---

## TRAPS PAID FOR THIS SESSION

1. **THE PHASE MATTERS AS MUCH AS THE FIGURE.** Ink, lane, then post-lane. The same box
   applied one phase early is a different number, and it looked like a wrong constant.
2. **A FAILING ASSERTION HIDES THE ONES AFTER IT.** Two stale ceilings surfaced only when
   the check ahead of them started passing. Always measure a clean tree before calling
   something your own regression — that is what separated these two from the work.
3. **RE-TEST PARKED FINDINGS AFTER THE GROUND MOVES**, again. The tuplet middle-note
   height was recorded as a `ponytail:` note saying "no corpus fixture has a low middle
   note that binds". One does, and the note was written before the surrounding arithmetic
   was abcjs's.
4. **A RIGHT CHANGE CAN MAKE THE NUMBERS WORSE ON ITS WAY IN.** The curve reserve took
   ragtime's oy from −11.7 to +18.6 before the phase fix took it to −0.41. Extent accuracy
   (7/46 → 33/46 → 36/46) was the honest signal throughout; the pixel number was not.
5. **PROBE ABCJS AT EVERY PHASE BOUNDARY, NOT AT ONE POINT.** Three probes in the same
   function told three different stories and only one of them was the extent.
6. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # know your lane
npx tsc --noEmit
npx vitest run                        # 503/505 on geometry/vertical; the 2 are the gate,
                                      #   and ZERO functional failures
npm run parity
```

Baselines: `npm run baseline`, READ the diff, commit them with the code.

## THE METHOD

```bash
# abcMusicKit is a clean git repo, so this is safe and fully reversible.
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

The probes worth re-creating, all of which paid:

- **The three-point staff extent** — `SPECIAL` / `POST` / `PROBE` in
  `set-upper-and-lower-elements.js`. Compare against **POST**.
- `layoutVoice`'s end, printing which CHILD holds `voice.bottom` and which of its
  RelativeElements holds the child's — that named the TripletElem and the TieElem in one
  run each.
- `getYBounds` in the `TieElem` case, printing `above`, `startY`/`endY`, both anchor
  pitches and both `parent.fixed` — that gave the whole of finding 4.
- `layoutTriplet`'s end, printing `hasBeam`, `up`, `startNote`/`endNote`, `yTextPos` and
  the `middleElems` as `bottom/height` — finding 5 came straight off it.
- `VoiceElement.adjustRange`, `Renderer.moveY`, `incTop`, `layoutOneItem` — from earlier
  sessions, still the right tools.
- **AND ON OUR SIDE:** `ABCTS_PROBE=1` prints each staff's extent in abcjs pitch from the
  stacking loop, with the source line that last raised each side and the lane flags. Read
  it from the STACKING LOOP, never from inside `verticalExtent`.
