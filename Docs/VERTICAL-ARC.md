# The vertical arc — opened, not finished

`geometry/horizontal` is CLOSED and GREEN at 505/505 (see
`CHECKPOINT-2026-08-02b.md`). This is the next arc, on `geometry/vertical`, and it starts
RED on purpose — for the same reason the horizontal one did, and by the same rule: four
recorded ceilings would have to be RAISED to land the first fix on the green branch, and
raising a ceiling to make a change pass is the one thing the contract forbids.

Everything below was read out of abcjs by INSTRUMENTING IT.

---

## Where the corpus stands

| axis | median | at ZERO | state |
|---|---|---|---|
| dx spread | +0.01 | 22/29 | horizontal arc CLOSED |
| ox offset | −0.00 | 22/29 | horizontal arc CLOSED |
| dy spread | +0.01 | 21/29 | this arc |
| oy offset | +0.03 | **20/29** | this arc |
| dx spread | +0.01 | **23/29** | horizontal, still improving |
| ox offset | −0.00 | **23/29** | " |
| ALL FOUR at zero | — | **16/29** | — |

Sixteen fixtures now match abcjs on every axis at once. At the start of the session it was
three, and dx/ox were zero on eight.

**Only six fixtures are off ANY axis by more than 0.1px**: `ragtime-nightingale`,
`frere-jacques`, `little swallow`, `vree-grace-notes`, `multi-voice-triplet-brackets`,
`ave-verum-corpus` — plus `happy-birthday` and `zocharti-loch` on dx alone.

---

## THE FINDING: abcjs reserves DECLARED boxes, not ink

Nothing at the edge of a staff is measured by what it paints. abcjs hands each element a
`top` and `bottom` and reserves those, and they are routinely not the glyph's box.

| element | declared box | source |
|---|---|---|
| clef | `symbolHeightInPitches + clefPos + ofs` / `clefPos + ofs`, `ofs` = −5 G, −4 C and F, −2 perc | `create-clef.js:37,62-70` |
| time signature | `pitch ± thickness/2`, thickness = the glyph's height in pitches | `create-time-signature.js:25`, `relative-element.js:22` |
| key signature | `verticalPos + height + fudge` / `verticalPos + fudge`, fudge −3 sharp, −1.2 flat | `create-key-signature.js:17-25` |
| tempo | a FLAT 6 pitches, whatever the mark says | `elements/tempo-element.js:12-13` |
| tuplet | 4 pitches ABOVE, whichever side the bracket is drawn | `elements/triplet-element.js:22-25` |

**THE CLEF IS WHAT SETS THE STAFF'S TOP** on any tune with nothing above the staff — not
the stems, which is the intuitive guess and is wrong. Probed on `simple-c`: `staff.top` is
raised to 13.7244 *by the clef* and by nothing else.

Two consequences worth keeping:

- A tiny declared-vs-ink difference moves the WHOLE DRAWING. The clef's was 0.0235 of a
  staff space and it put eight fixtures a uniform 0.184px high, staff lines and noteheads
  alike — so a constant offset like that is NOT a glyph question, and checking the staff
  line is how you tell.
- The tempo's flat 6 pitches is the largest single term: six fixtures, all of them with a
  `Q:`, each sitting 6.89–6.94px low on every staff while their staff-TO-staff spacing was
  already exact. A rigid offset with correct internal spacing points at the header stack,
  not at the music.

---

## What is open

### A TUPLET RESERVES ABOVE EVEN WHEN ITS BRACKET HANGS BELOW

`if (!this.anchor1.parent.beam || this.anchor1.stemDir === 'up') this.endingHeightAbove = 4`
— off the FIRST member, not a majority, and not the side the bracket lands on. abcjs has no
`endingHeightBelow` at all; `positionY` has no such field. `vree-slurs-and-triplets` proves
it beyond argument: abcjs draws its `3` UNDER the staff, at y 149.24 against a bottom line
at 127.9, and still reserves above. That fixture sat 19.35px high and is now at parity on
all four axes.

**And the lane was being counted twice.** `verticalExtent` runs twice per titled staff —
once over the music alone to place the top-text block, once over both to set the origin —
and the second pass added the lane to a total that already carried it. Probed: three
applications, the last two identical. The block always wins that `min` when present, so
skipping the lane on a pass carrying one cannot change the answer, only stop the double.

### A TUPLET'S RANGE IS A BOX AROUND ITS NUMBER

`layoutTriplet` ends both branches with `element.top = yTextPos + 1; element.bottom =
yTextPos - 2` — a small box in PITCH around where the number sits, not the bracket's drawn
lines. `layoutVoice` feeds that through `adjustRange`, so it enters the staff's range AND
the lane goes on top. Probed on `multi-voice-rest-collision`: clef 13.7244 → a note 13.9879
→ TripletElem 17.5929 → +5 = 22.5929.

Counting the bracket's drawn LINES instead overshoots by 1.89 pitch, because our bracket
clears the music by its own gap where abcjs puts it at `max(parent.top, 9) + 4` per end
note. The declared box sidesteps that — it is what abcjs contributes whatever either engine
draws.

### FOUR MORE DECLARED-BOX AND CURSOR FINDINGS

- **`%%center` is not a title row.** `FreeText` pushes `{ move: size.height }` bare where
  `addTextIf` pushes `Math.round(size.height * 1.1)`, and abcjs's gap before it is
  `spacing.music`, spent BEFORE the row and never after — the centered text ends exactly
  where the staff group begins. `center-text` to parity.
- **An ABOVE-side dynamic reserves a flat 7-pitch lane**, exactly as the below side did.
  `set-upper-and-lower-elements.js:39-42` adds `max(dynamicHeightAbove, volumeHeightAbove)
  + margin` when both are present, WITHOUT going through `incTop` — which is why no lane
  shows in that probe. Measuring the `p` glyph's own box left both staves of
  `multi-voice-lyrics-two-voices` 1.30 pitch short.
- **A HAIRPIN reserves that lane too**, and must be read off the EVENTS: hairpins can span
  a system break, so `spannerLines` is still empty when the extent is measured. This was a
  recorded `ponytail:` gap saying the model-based approach "was tried and made the corpus
  much worse" — it does not now, because the earlier attempt was landing a correct term on
  top of several wrong ones.
- **ONLY THE FIRST VOICE OF A STAFF CARRIES THE STAFF-EXTRAS.** abcjs gives the others
  none: probed, the second voice's `i=0` is a NOTE and its `minx` is the bare left edge.
  We gave every voice a clef, key and meter — four hidden copies stacked in `ragtime-mini`
  — and it MOVED THE MUSIC, because `minx` is what `er` is measured from.
- **A staff's reserves are the UNION of its voices'.** The shared-staff merge spread the
  first voice's object, so a tuplet or hairpin on the LOWER voice reserved nothing.

### A SECOND GATE LIMITATION, recorded like the grace-note one

**`little swallow`'s dx cannot reach zero against these goldens.** The harness that made
them (`dump-elements-char-widths.js`) carries an ASCII-only table per font and falls back to
a flat **8px** for anything missing — `widths[ch] || 8`. 73 of that fixture's 576 lyric
characters are CJK and were measured at 8px each in the golden, where we measure a full-width
character properly. `frere-jacques` has four such characters (`èéâ`). No other fixture has
any. This is a property of the golden, not of abcjs, and reproducing it would make our real
output wrong — CJK drawn at 17px and spaced at 8.

### The partners, unfound

A right change can make the corpus worse; look for its partner rather than reverting.

- **`ragtime-nightingale`** — THE TOP ITEM. dy 58.14 → 105.34, and that is not a reason to
  revert the tuplet work: measured all three ways, the rule alone gives 105.34, the
  double-count fix WITHOUT the rule gives 128.71, and the same run takes
  `multi-voice-triplet-brackets` from 24.67 to 5.29. Its old 58.14 was resting on the
  double count. Two handles on it:
  Its dy is 82.86 against 58.14 before the arc opened; its oy is 1.82 against 7.0. THE
  DIAGNOSIS IS NOW SHARP, and it is a per-staff extent comparison, not a boundary hunt:

  ```
  # abcjs, all 46 staves
  # probe `staff.top`/`staff.bottom` at the end of setUpperAndLowerElements
  ABCJS_PROBE=1 node dump-svg.js --file fixtures/ragtime-nightingale.abc … | grep 'PROBE staff'
  # ours, from the SAME call that sets the staff's origin — the one in the stacking loop.
  # Recording from inside `verticalExtent` instead picks up the anchorAboveStaff and
  # systemHeight calls and scrambles the order; that cost a run.
  # convert: abcjs pitch = 6 - 2 * ourY(spaces)
  ```

  Read that way, and after the hairpin fix, **`dBot` is a recurring −0.50 pitch on 23 of
  its 46 staves** — one constant, and by far the biggest single thing left in the corpus.
  abcjs's bottoms land on values like −12.500 and −9.500 where ours land on −13.000 and
  −10.000. The remaining 14 are scattered (+1.97, +2.08, +6.00 …).

  What is known about the −0.50: the staff bottom is set by a STEM in 148 of ragtime's
  cases (`PROBE range bot` counts: note 148, clef 115, key-signature 69, rest 3, TieElem 3,
  TripletElem 2). abcjs's beamed down-stems end on half-pitches and ours on whole ones,
  which points at the `+0.5` pitch fudge `layout/beam.js:125` applies to a descending
  beam's stem end — but a direct endpoint comparison on a BASS staff has not been done, and
  the up-stem sample taken instead was not the one setting the bottom. Take the sample from
  a staff the extent table names, not from the first system.

  Also still true: abcjs's first staff reaches `staff.top = 21.0` from the MUSIC's own ink
  before the tempo's 6 pitches go on top, and ours falls ~2px short of that 21.
- **`little swallow`** dy 5.35 → 6.13 and **`frere-jacques`** dy 22.15 → 22.35. Spreads,
  not offsets, so something inside the system rather than above it.
- **`center-text`** oy 10.15 → 10.32 — the clef's 0.18 landing on a fixture already 10px
  out for its own reason (`%%center`). Fix the 10 and this goes with it.

### Bigger, and not touched

`multi-voice-rest-collision` oy −13.93, `vree-slurs-and-triplets` oy −19.35,
`multi-voice-lyrics-two-voices` oy −7.55, `multi-voice-triplet-brackets` dy 14.09,
`vree-grace-notes` dy 11.65.

---

## The method

Unchanged, and it is what produced every line above:

```bash
# 1. env-guarded log in the vendored source (abcMusicKit is clean git, fully reversible)
#      Docs/References/abcjs/abcjs-6.6.3/src/write/…
#      if (process.env.ABCJS_PROBE) console.log('PROBE …')
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

The probes that paid here: `Renderer.moveY`/`absolutemoveY`, which prints the page's whole
vertical cursor with a stack line saying who moved it; `VoiceElement.adjustRange`, which
says WHICH element raised the staff's top — that one is what found the clef in a single
run; and `incTop`, which prints the above-staff stack item by item.

Compare the STAFF LINE, not just the noteheads. A constant offset in both is placement; a
constant offset in the noteheads alone would be the glyph.
