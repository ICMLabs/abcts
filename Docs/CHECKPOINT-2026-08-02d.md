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

Per-axis over the 29 pixel-gated fixtures:

| within | dy | dx | oy | ox | ALL FOUR |
|---|---|---|---|---|---|
| 0.05px | 23/29 | 23/29 | 24/29 | 23/29 | **20/29** |
| 0.25px | 25/29 | 23/29 | 26/29 | 23/29 | **23/29** |

Session start was 16/29. **Only NINE fixtures are off any axis by more than 0.05px**, and
three of those nine are gate artefacts rather than divergences.

| fixture | before | after |
|---|---|---|
| `ragtime-nightingale` | dy 66.82, oy −3.80 | dy 58.13, oy **−0.54** |
| `multi-voice-triplet-brackets` | dy 4.05, oy −1.62 | dy **0.01**, oy **−0.00** |
| `ave-verum-corpus` | dy 2.39, oy −0.48 | **0.02 / 0.04** |
| `multi-voice-rest-collision` | oy −0.37 | **−0.01** |
| `score-reorder` | oy 0.61 | **−0.01** |

And every fixture's PAGE HEIGHT now matches abcjs to within 0.07px, from 15px short.

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

## THE FINDINGS, with their citations

| # | finding | source |
|---|---|---|
| 1 | The ending lane is `endingHeightAbove + 1`, and a TUPLET declares 4 where a VOLTA declares 5 | `triplet-element.js:25`, `ending-element.js:8`, `set-upper-and-lower-elements.js:37` |
| 2 | ONE volta bracket per system — first voice of the first staff only | `abstract-engraver.js:1034-1037` |
| 3 | A tuplet inside a LONGER beam still gets a bracket | `layout/triplet.js:11` |
| 4 | A tie or slur reserves a declared box, twice, on rules of its own | `tie-element.js:28-36` and `:228-251` |
| 5 | A tuplet's low middle note counts `bottom - height`, and `height` defaults to **4** | `layout/triplet.js:56`, `relative-element.js:37` |
| 6 | A curve hangs on **`pitches[0]`** — the chord's first pitch as WRITTEN, not its centre and not its lowest note | `parse/abc_parse_music.js:503-506` |
| 7 | A beamed tuplet's number is a **SAMPLE** of the beam at an ASYMMETRIC midpoint, not the average of the two stem tips | `layout/triplet.js:15-16` |
| 8 | A LINE reserves its endpoints, never its painted width — only glyphs pass a `thickness` | `relative-element.js:22-24` |
| 9 | The page has a **bottom margin** as well as a top one | `draw/set-paper-size.js:3` |
| 10 | A NOTEHEAD's declared box is **2.088774 pitches**, not 2 | `create-note-head.js:34`, `glyphs.js` `symbolHeightInPitches` |

Six through ten, each one fixture's whole error:

- **(6)** `el.pitches[0].startSlur` / `endSlur` and nothing else. Take it from the EVENT,
  not from the drawn heads — `layoutNoteheads` sorts them so `[GCE]` and `[CEG]` engrave
  alike, which is right for engraving and loses exactly the ordering this needs.
- **(7)** `heightAtMidpoint(left, anchor2.x, beam)` with
  `left = isAbove(beam) ? anchor1.x + anchor1.w : anchor1.x` — an above beam measures from
  the FAR side of the first notehead to the NEAR side of the last. The two agree on a
  level beam, which is why averaging looked right.
- **(8)** `RelativeElement` widens by `thickness / 2` only when a `thickness` is PASSED,
  and only noteheads, decorations, key and time signatures pass one. A barline never does:
  probed, abcjs's is `bar@2..10`, flush with the staff. On a BASS staff the top staff line
  IS the staff's top, so half a barline's stroke above it moved the whole drawing.
- **(9)** We had `padding.top` and not `padding.bottom`. The page ended flush with the last
  staff line and clipped its own stroke — which the viewBox test caught only once (8)
  removed the slack that had been hiding it.
- **(10)** `thickness: symbolHeightInPitches(c) * scale`, so half is **1.0443871** pitch.
  **That 0.0444 is the tell all over abcjs's own numbers** — `a1bot=5.9556` for a note at
  pitch 5, `mids=6.0444^3.9556`, `staff.bottom=-14.0444`, `yTextPos=27.0444`. Wherever a
  declared box is read off a HEAD rather than a stem, a flat 1 is wrong.

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

Note (10) SUPERSEDES a reading taken earlier the same session — that a notehead's declared
box is its bare pitch, on `RelativeElement`'s `top = bottom = pitch`
(`relative-element.js:18-30`). That is the constructor's *starting* value; the very next
lines widen it by `thickness / 2`, and `create-note-head.js` always passes one. Read the
whole constructor before taking a default for the answer.

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

## THE GATE'S OWN LIMITATIONS — do not chase either

1. **`vree-grace-notes` dx 32.5 AND dy 11.6 ARE THE SAME PAIRING ARTEFACT.** abcjs emits a
   graced note's MAIN head before its graces where we emit them after. Sorted by x — valid
   on a one-system fixture — dy is 0.02 and dx a uniform 1.99, the grace glyph. The `-c`
   checkpoint listed only the dx; the dy is not a separate open item.
2. **`little swallow` dx cannot reach zero against these goldens.** Their generator carries
   an ASCII-only width table with a flat `|| 8` fallback, so 73 of its 576 lyric characters
   — the Chinese — were measured at 8px each. A property of the GOLDEN, not of abcjs.

---

## WHAT IS LEFT, ranked

Nine fixtures are off any axis by more than 0.05px, and three of the numbers are artefacts:

| fixture | dy | dx | oy | ox | what it is |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 58.13 | 69.82 | −0.54 | −1.16 | dy is TWO MIS-PAIRED HEADS (below); dx is horizontal, untouched since that arc |
| `frere-jacques` | 14.34 | 22.15 | −19.12 | −3.63 | **NOT the wrap conflict — see below.** One named cause left: decoration stacking |
| `vree-grace-notes` | 11.64 | 32.50 | — | −1.14 | **BOTH numbers are the same pairing artefact.** Sorted by x — valid here, one system — dy is 0.02 and dx a uniform 1.99, which is the grace glyph. Its dy was listed as "open" in `-c`; it is not. |
| `little swallow` | 1.92 | 23.97 | −0.58 | −5.73 | dx is the golden limitation. dy/oy is the LYRIC RESERVE — diagnosed below |
| `zocharti-loch` | — | 5.35 | — | 0.69 | horizontal only |
| `happy-birthday` | — | 3.85 | — | −0.49 | horizontal only |
| `multi-voice-lyrics-two-voices` | 0.07 | — | 0.05 | — | survives sorting, so a real 0.07px |
| `two-voice-invention` | 0.07 | — | — | — | survives sorting |
| `vree-sharps` | — | — | 0.07 | — | |

### `little swallow` — diagnosed, and it is our formula not our ink

Its five staves are one system each with two verses of lyrics. abcjs's rule is uniform:

```
staff.bottom  =  ink  -  (lyricHeightBelow + 1)          # 11.1265 pitch on every staff
lyric pitch   =  ink  -  spacing.vocal / STEP            # so the LYRIC follows the ink too
```

Its ink bottoms are −2.5 / −3.4747 / −3.0 / −3.4727 / −3.0 and its staff bottoms follow
exactly. **Our ink agrees** — probed, staves 2 and 4 both bottom out at pitch −3.0, the
same as abcjs. What does not agree is the reserve: ours is anchored on the DRAWN LYRIC
BASELINE (`lyricBottom + lyricVoiceStep + spacePerStep - lyricInkGap`, a constant
calibrated against three one-and-two-verse shapes), where abcjs's is anchored on the INK
with the lane subtracted. So where two staves share an ink bottom abcjs gives them the
same staff bottom and we give them −13.63 and −12.17.

The structural fix is abcjs's own form — ink minus `(lyricHeightBelow + margin)` — but
`lyricHeightBelow` is a MEASURED multi-line text height (10.1265 pitch here) and the
current constant was verified against abcjs's output on three shapes. Port the structure,
then re-derive the constant; do not drop a new constant into the old form.

### `frere-jacques` — THE WRAP CONFLICT IS NOT WHAT IS LEFT

It has been carried since 2026-07-22 as "the source-line-wrap model conflict, a design
question". **That is out of date.** Its system COUNT has matched abcjs (4 and 4) since the
parser started closing a measure at a source-line boundary. Measured against abcjs's own
`staff.top`/`.bottom`, the whole of what is left is ONE cause:

| staff | abcjs | ours | short by |
|---|---|---|---|
| 1 | 22.0110 | 19.1806 | 2.83 |
| 2 | 24.8325 | 22.7510 | 2.08 |
| 3 | 30.6070 | 28.9123 | 1.69 |

Its bottoms match exactly. Its lanes match exactly — the `P:` lane, the `%%partsbox`
widening and the chord lane all land on the digit now. What does not match is the INK
underneath them, and probed, the ink top of every one of its staves is a DECORATION:

```
VTOP 22.0110 by scripts.trill    @19.8832   (systems 0, 1)
VTOP 16.0493 by scripts.sforzato @16.0493   (system 2)
VTOP 16.0444 by scripts.staccato @16.0444   (system 3)
```

Ours puts the same decorations at pitch **15.0**, **13.0** and **14.0** — round numbers,
because we step one staff position per decoration. abcjs STACKS THEM BY THEIR OWN GLYPH
HEIGHTS (`creation/decoration.js:154-165`):

```js
var height = glyphs.symbolHeightInPitches(symbol) + 1;   // a pitch of padding
var y = getPlacement(placement);                          // the running yPos.above
y = (placement === 'above') ? y + height / 2 : y - height / 2;   // CENTRE it
… new RelativeElement(symbol, …, y, { thickness: glyphs.symbolHeightInPitches(symbol) })
incrementPlacement(placement, height);                    // yPos.above += height
```

Three things in five lines, and the same shape as everything else in this arc: a
DECLARED height per glyph, a flat pitch of padding, and the element CENTRED on the
running cursor rather than sitting on it. `yPos.above` starts at the note's own top,
clamped up to `minTop`.

**This is the next piece of work on the vertical axis and it is not a `frere-jacques`
fix** — it is every decorated fixture. The corpus's other decorated fixtures are at parity
today, so a decoration-placement change can regress them; measure `vree-*`,
`stacked-annotations` and `ragtime-nightingale` on the same run.

`frere-jacques`'s `oy` is now 19.12 against a recorded 5.4, and it is the visible red.
It was ALREADY failing at 12.53 and hidden behind the `dy` assertion (see the gate
section); it got worse because moving `P:A` off the prose system — which abcjs does —
shortened that system and let every system below it settle onto a decoration stack that
is still too low. The number will come back when the stack does.

### `ragtime-nightingale` dy is TWO MIS-PAIRED NOTEHEADS — measured, not guessed

See the section above for the histogram. Every head but two lies in [−2, +4]; drop the one
swapped pair and dy is **5.38**. Do not chase it as geometry.

---

## TRAPS PAID FOR THIS SESSION

0. **READ THE WHOLE CONSTRUCTOR BEFORE TAKING A DEFAULT FOR THE ANSWER.**
   `RelativeElement` opens with `top = bottom = pitch`, and that reading was written into
   a comment mid-session — but the next lines widen it by `thickness / 2`, which
   `create-note-head.js` always passes. The 0.0444 of a pitch that leaves is visible in
   abcjs's own printed numbers, and it was on screen for two hours before it was read.
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
