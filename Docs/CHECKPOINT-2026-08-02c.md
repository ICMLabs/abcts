# abcts — Checkpoint, 2026-08-02 (late)

Supersedes `CHECKPOINT-2026-08-02b.md`. Read this, then `VERTICAL-ARC.md`, then
`HORIZONTAL-ARC.md`, then `ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE IN ONE TABLE

| lane | branch state |
|---|---|
| `main` | vertical arc v1 merged. GREEN 505/505. Untouched this session. |
| `geometry/horizontal` | **HORIZONTAL ARC CLOSED. GREEN 505/505**, ceilings re-recorded. Pushed. |
| `geometry/vertical` | **THE OPEN ARC.** Red by design — 5 gate items, none of them a raised ceiling. Pushed. |

Per-axis, on `geometry/vertical`, over the 29 pixel-gated fixtures:

| axis | at ZERO | was at session start |
|---|---|---|
| dy spread | 21/29 | 18/29 |
| oy offset | 20/29 | 3/29 |
| dx spread | 23/29 | 8/29 |
| ox offset | 23/29 | 8/29 |
| **ALL FOUR at once** | **16/29** | **0/29** |

Sixteen fixtures are now pixel-identical to abcjs in placement on every axis. Thirteen are
not, and eight of those are off on one axis only.

---

## THE ONE IDEA THAT EXPLAINS MOST OF THIS SESSION

**abcjs does not measure what it draws. It DECLARES a box and reserves that.**

Every one of the following was our engine measuring ink where abcjs reserves a declared
figure — and each moved the whole drawing, because a staff's extent is what positions it:

| thing | what abcjs declares | source |
|---|---|---|
| clef | `symbolHeightInPitches + clefPos + ofs`, `ofs` −5 G / −4 C,F / −2 perc | `create-clef.js:37,62-70` |
| time signature | `pitch ± thickness/2` | `create-time-signature.js:25` |
| key signature | `verticalPos + height + fudge`, −3 sharp / −1.2 flat | `create-key-signature.js:17-25` |
| tempo | a FLAT 6 pitches, whatever the mark says | `elements/tempo-element.js:12-13` |
| tuplet | `yTextPos + 1` / `yTextPos - 2`, a box round the NUMBER | `layout/triplet.js:20-21,73-74` |
| dynamic, either side | a flat 6 + 1 margin = 7 pitch | `dynamic-decoration.js:10`, `crescendo-element.js:9` |
| BEAM | **nothing at all** — it is not in the switch | `set-upper-and-lower-elements.js` |

The clef one is the one to remember: **the clef is what sets the staff's top** on any tune
with nothing above the staff — not the stems, which is the intuitive guess and is wrong.
Its declared box differs from its outline by 0.0235 of a space, and that alone put eight
fixtures a uniform 0.184px high.

---

## THE OTHER FINDINGS, briefly

- **Only the first voice of a staff carries the staff-extras.** abcjs gives the others none
  — probed, the second voice's `i=0` is a NOTE and its `minx` is the bare left edge. We gave
  every voice a clef, key and meter: four hidden copies stacked in `ragtime-mini`, and it
  MOVED THE MUSIC, because `minx` is what `er` is measured from.
- **A staff's reserves are the UNION of its voices'.** The shared-staff merge spread the
  first voice's object, so a tuplet or hairpin on the lower voice reserved nothing.
- **A hairpin must be read off the EVENTS**, not off `spannerLines` — those resolve after
  packing and are empty when the extent is measured.
- **A tuplet reserves ABOVE whichever side its bracket is drawn on**, and there is no
  below-side reserve in abcjs at all.
- **`%%center` is not a title row**: `{ move: size.height }` bare against
  `Math.round(height * 1.1)`, and its gap is spent BEFORE the row, not after.
- **The triplet bracket** is `max(note.top, 9) + 4` per END note, sloped; a beamed tuplet
  takes a different y entirely off the beam; `middleElems` holds NOTEHEADS, not notes.

---

## WHAT IS LEFT — thirteen fixtures, and what each is

| fixture | dy | oy | dx | ox | what it is |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 66.8 | −3.8 | 69.8 | −1.2 | **THE PRIZE.** See below. |
| `frere-jacques` | 22.4 | −12.5 | 22.2 | −3.6 | abcjs WRAPS a source line; model conflict |
| `vree-grace-notes` | 11.7 | 0.0 | 32.5 | −1.1 | **GATE ARTEFACT** — see below |
| `little swallow` | 1.9 | −0.6 | 24.0 | −5.7 | **GOLDEN LIMITATION** on dx — see below |
| `multi-voice-triplet-brackets` | 4.1 | −1.6 | 0.0 | 0.0 | |
| `ave-verum-corpus` | 2.4 | −0.5 | 0.0 | 0.0 | |
| `zocharti-loch` | 0.0 | 0.0 | 5.4 | 0.7 | dx only |
| `happy-birthday` | 0.0 | 0.0 | 3.9 | −0.5 | dx only |
| `score-reorder` | 0.0 | 0.6 | 0.0 | 0.0 | oy only |
| `multi-voice-rest-collision` | 0.0 | −0.4 | 0.0 | 0.0 | oy only |
| `two-voice-invention`, `multi-voice-lyrics-two-voices` | 0.08, 0.07 | 0.0 | 0.0 | 0.0 | just over the 0.05 threshold |

### `ragtime-nightingale` — start here

Its `dBot = -0.50`, which sat on 23 of its 46 staves, is CLOSED (the beam). Staves exact
2/46 → 7/46; bottom errors 37 → 11.

**Its TOP is now the dominant term — 33 of 46 staves — and it is SCATTERED**, not one
constant: −7.25, −7.15, −2.07, −2.00, −1.00, −0.15, +5.01. Several causes. The method that
worked twice this session:

1. Probe abcjs's per-staff `staff.top`/`staff.bottom` at the end of
   `setUpperAndLowerElements`.
2. Get OURS from **the staff-origin call in the stacking loop** — NOT from inside
   `verticalExtent`, which also fires for `anchorAboveStaff` and `systemHeight` and
   scrambles the order. That cost a run.
3. Convert: `abcjs pitch = 6 - 2 * ourY(spaces)`.
4. Pick a staff the table names, then instrument OUR `include()` to RECORD WHICH
   CONTRIBUTOR set that staff's top. Naming the winner is what found the beam in one run.
5. Probe abcjs's `adjustRange` for the same staff and compare the two chains.

Also still true and unexplained: abcjs's first staff reaches `staff.top = 21.0` from the
MUSIC's own ink before the tempo's 6 pitches go on top; ours falls ~2px short of that 21.

Its dx of 69.8 has had no attention since the horizontal arc closed.

---

## TWO GATE LIMITATIONS — do not chase either

1. **`vree-grace-notes` dx 32.5 is an ARTEFACT.** The gate pairs the i-th notehead of each
   engine, and abcjs emits a graced note's MAIN head BEFORE its graces where we emit them
   after. Sorted by x its mains are exact and its graces sit a uniform 1.99px left, which is
   a grace GLYPH difference. Three fixtures carry graces at all.
2. **`little swallow` dx cannot reach zero against these goldens.** The harness that made
   them (`dump-elements-char-widths.js`) carries an ASCII-only table per font and falls back
   to a flat **8px** for anything missing — `widths[ch] || 8`. 73 of that fixture's 576 lyric
   characters are CJK and were measured at 8px each; we measure a full-width character
   properly. `frere-jacques` has four (`èéâ`). No other fixture has any. This is a property
   of the GOLDEN, not of abcjs, and reproducing it would make our real output wrong.

---

## THE GATE, and why the branch is red

Five items. **None is a raised ceiling** — that is the one thing the contract forbids.

- THREE are improvements waiting to be recorded when the arc closes: `little swallow` dy
  1.9 (ceiling 4.3), `multi-voice-lyrics-two-voices` dy 0.07 (4.0),
  `multi-voice-triplet-brackets` dy 4.05 (13.1).
- TWO are genuine widenings: `ragtime-nightingale` dy 66.82 against 58.15, and
  `frere-jacques` dy 22.35 against 22.15.

Ragtime's is the one to justify or fix. Its 58.15 was resting on two of our own bugs — the
double-counted ending lane and the beam in the extent — and its `oy` improved 7.0 → −3.8 over
the same span. That is an explanation, not an excuse; it should come down.

---

## TRAPS PAID FOR THIS SESSION

1. **A "needs its partner, unfound" note is about the CORPUS AT THAT MOMENT, not about the
   change.** The beam-extent fact was recorded correctly in `-08-02` and dismissed as
   unlandable. It landed cleanly once five other things were right. Re-test parked findings
   after the ground moves.
2. **Probes lie about ORDER.** Recording from inside `verticalExtent` picked up two other
   call sites and mis-aligned every staff; the tell was that our index 1 matched abcjs's
   index 0.
3. **Classify what you measured.** The `vree-grace-notes` number is a pairing artefact, and
   `little swallow`'s is a golden artefact. Neither is a divergence.
4. **A constant offset in the noteheads AND the staff lines is placement; in the noteheads
   alone it would be the glyph.** Checking the staff line is how you tell, and it is what
   stopped the clef finding being written off as a Bravura difference.
5. **Check `git -C ../abcMusicKit status --short` before finishing.** Clean at handoff.

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD      # know your lane
npx tsc --noEmit                      # from the repo ROOT
npx vitest run                        # 500/505 on geometry/vertical; the 5 are the gate,
                                      #   and ZERO functional failures — if a functional
                                      #   test fails there, you broke it
npm run parity
```

Baselines: `npm run baseline`, READ the diff, commit them with the code.

## THE METHOD — unchanged, and it earned its keep again

```bash
# abcMusicKit is a clean git repo, so this is safe and fully reversible.
# env-guarded log in the vendored source, then run abcjs's own harness:
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

The probes worth re-creating, all of which paid this session:

- `Renderer.moveY`/`absolutemoveY` — the page's whole vertical cursor, with a stack frame
  saying who moved it.
- `VoiceElement.adjustRange` — WHICH element raised or lowered a voice's range. This one
  found the clef in a single run.
- `setUpperAndLowerElements` end — each staff's final `top`/`bottom`.
- `incTop` — the above-staff stack, item by item. NOTE it does not fire for the ending lane
  or the dynamic/volume pair, which take their own branches.
- `layoutOneItem` — `er`/`extraw`/`need`, and the resulting x. This is how the shared-staff
  prefix was found.
- One printing each element's CHILDREN as `name[dx= w=]` — gave `addCentered`, the flag and
  the annotation answer in a single run.
- AND ON OUR SIDE: instrument `include()` to NAME the contributor that set an extent. Two
  findings came from that and nothing else.
