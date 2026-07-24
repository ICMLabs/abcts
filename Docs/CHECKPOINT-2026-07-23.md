# abcts — Checkpoint, 2026-07-23

Supersedes `CHECKPOINT-2026-07-22c.md` — read this one, then `ARCHITECTURE.md`, then
`CLAUDE.md`. The `c` file's *method notes* still stand; its priority list is answered below.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only. Never raise a pixel-parity ceiling to pass.

---

## Where things stand

`main` is unchanged in behaviour from `a761cf8`: **499 tests green**, every structural gate
at 100%, corpus median notehead distance 17.4px, 21/29 within 25px, 29/29 within 50px.

**The session's work is on the branch `geometry/lyric-ink-anchor`, not on `main`** — seven
commits through `3a80638`. Read the last four first; they supersede parts of the earlier
ones. The branch is parked because fixtures still regress against their recorded ceilings,
but the vertical MODEL on it is now abcjs's, and the residual set is SHRINKING: **25 of 29
fixtures are now within their ceiling, up from 21 at the session's start.** Five former
priority items are FIXED on the branch: dynamics side (`67ff28c`), `spacing.music` above
title-less first systems (`d54b644`), the tuplet/volta fixed lane (`224ff8d`, which CLOSED
`multi-voice-triplet-brackets` and took `ragtime` dy 177 → 122), and the `middle=` clef
modifier (`3a80638`, which CLOSED `voice-middle-after-clef`).

**Now 4 blockers, 3 distinct problems** (`middle=` closed voice-middle-after-clef on the
branch, `3a80638` — 26/29… no: 25/29). The remaining four: the down-stem overhang (ragtime,
coupled — item 2 in "Next"), an intra-staff spacing residual (zocharti-loch — see item 2 in
"What blocks the merge"), and two text cases (frere-jacques prose, full-song-template
`W:`/`H:`).

CORRECTION to the previous version of this file: it claimed `middle=` would close BOTH
voice-middle-after-clef and zocharti-loch. It closes only voice-middle. zocharti has
`transpose=-24` alongside `middle=d`; the two nearly cancel, and since written `transpose=`
is not realized, `middle=` there is GUARDED OFF (else zocharti went dy 3 → 72). zocharti at
its guarded bass-default is dy 17.5 — the SAME as the `520cfb4` regression — so its problem
was never `middle=` but the intra-staff spacing the fudge deletion exposed.

### What the branch achieves

Our final per-staff extents against abcjs's own — computed by replicating its
`setUpperAndLowerElements` over the element goldens — now sit at a **median of 0.03px above
the staff and 0.46px below**, from +15.8 / −3.4 at the start of the session. Excluding
`ragtime-nightingale`, every staff in the corpus is within about half a pixel of abcjs on
both sides.

Against the recorded ceilings: **9 fixtures better, 14 unchanged, 6 worse or mixed.**

| | dy | oy |
|---|---|---|
| `ave-verum-corpus` | 13.5 → **2.4** | 10.5 → **10.1** |
| `happy-birthday` | 12.9 → **0.0** | 9.4 → **3.7** |
| `little swallow` | 50.6 → **7.1** | 25.2 → **3.4** |
| `multi-voice-lyrics-two-voices` | 26.7 → **4.5** | −26.0 → **−14.9** |
| `program-127-test` | 9.2 → **0.4** | 8.3 → **3.9** |
| `chord-grid`, `stacked-annotations` | — | −7.3 → **0.0** |

`ave-verum-corpus` — the fixture that blocked this work for three sessions — is now within
both of its ceilings.

---

## What was found, and what it corrects

### 1. Lyrics hang off the staff's INK, one lyric height lower per voice

```
lyric baseline  = staff INK BOTTOM + 17px + voiceIndex x 18.84px
staff reserves  = last verse's baseline + 5.715px
```

17 is abcjs's vocal font size (the SVG baseline offset); 18.84 is `17 x 1.108`, the
calibrated height ratio `ENGRAVE.textHeightRatio` already carries; 5.715 is
`18.84 + 3.875 − 17`, where 3.875 is abcjs's `margin = 1` pitch step. Measuring from the
LAST verse's baseline collapses every case to that one constant, because that baseline
already carries both the verse stacking and the per-voice offset. Exact against abcjs on
one-verse-one-voice, one-verse-second-voice and two-verses-first-voice.

**abcjs DOES apply the voice offset in `ave-verum-corpus`.** Two previous checkpoints said
it does not, reading its two lyric lines' 3.3px separation as absence. That staff's upper
neighbour reaches 15.5px further down, and `18.84 − 15.5 = 3.34` is the 3.3.

### 2. The shared-staff stem rule — and it needed no model change

abcjs forces `down` on every voice after the first on a staff, unconditionally, but
back-fills `up` onto the FIRST voice only `if (thisStaff.voices[0] !== undefined)`
(`parse/tune-builder.js:961-989`) — and `voices[0]` exists only once that voice has opened a
line. **A tune whose body writes the LOWER voice first leaves the upper one unforced.**

`ave-verum` is that tune, and abcjs's dump confirms all four vocal voices: Soprano up (by
pitch), Alto down (forced), Tenore DOWN (by pitch, unforced), Basso down (forced). We forced
Tenore up, which put that staff's ink top 23.5px above abcjs's. Body order is the first
measure's source offset, which `Voice` already carries.

### 3. Out-of-staff text — the reserve, the sizes, and the lane that was a coincidence

abcjs reserves a full font size ABOVE a text's baseline and the rest of its rendered height
below (`text.js:30-31`), not the 0.8/0.25 estimate. And `lyricTextSize` was 1.4 — 10.85px —
serving lyrics, chord symbols, annotations, decorations and inline text alike, where abcjs
uses 17px (`vocalfont`) and 16px (`gchordfont`/`annotationfont`). Together these close a
−7.3px shortfall on every staff carrying chord symbols.

**Chords are a STACK, not a lane.** abcjs's chord baseline is 20.83px above the top line in
`chord-grid`, `happy-birthday` AND `full-song-template` — but only because the CLEF sets the
ink top at 14.43px in all three. The rule is `ink + chordHeight + margin`; 20.83 is what it
evaluates to when the clef wins. This is the same coincidence that made a skyline port look
wrong in `CHECKPOINT-2026-07-22c` — the finding there ("abcjs places out-of-staff text at
fixed distances from the staff") is retracted. It stacks; this corpus makes stacking look
fixed.

### 4. `systemGap` and `staffGap` are gone

Both to zero, which is abcjs's own value (`staffTopMargin: 0`; `addStaffPadding` pads only
up to a minimum). Not tuned to zero — **deleted**, because the extents they stood in for are
now right. Boundary error goes from 10.64px mean to 5.90px, 23 of 73 boundaries exact.

### 5. A correction to this checkpoint's own earlier claim

An earlier version of this file said abcjs reserves ONE lyric line whatever the verse count,
citing `specialY.lyricHeightBelow` = 4.862 pitch in both its one-verse and two-verse
goldens. **That is wrong.** `dump-elements.js`'s `getBBox` stub returns a single line's
height, while the SVG generator that produced the actual goldens measures every tspan:
`18.84 + (n − 1) x 17 x 1.2` (`dump-svg.js:120-124`). The two harnesses disagree and the SVG
is the gate. `lyricLineStep` follows it — abcjs writes `dy="1.2em"`, so 20.4px, not the 21px
an advance rule gives.

---

## Next, in priority order

1. **DYNAMICS SIDE — DONE (`67ff28c`).** abcjs puts dynamics above the staff only when the
   tune sings — `volumePosition: hasVocals ? 'above' : 'below'`
   (`write/creation/decoration.js:379`), `hasVocals` set from any `w:` line
   (`abstract-engraver.js:110`). `dynamicStep` became two lanes, `dynamicAboveStep` 19.5 and
   `dynamicBelowStep` −10.96 (27px below the bottom line, off `two-voice-invention`'s dynamic
   box centre). A `dynamicsAbove` boolean, computed tune-wide, threads down the path
   `voiceStem` takes plus `layoutSpanners` for hairpins. `ragtime-nightingale` 61.1 → 57.9,
   `two-voice-invention` 21.5 → 20.8, `multi-voice-lyrics-two-voices` correctly unchanged
   (it sings), no regressions.

2. **`ragtime-nightingale`'s remaining drift — DIAGNOSED, and a fix ATTEMPTED AND REVERTED
   on 2026-07-24.** dy 176 over 23 systems. Three things are true, the third correcting an
   earlier version of this note:

   a. **We ignore `V:… stems=up`/`stems=down`.** Ragtime declares `V:1/2/3 bass stems=down`
      and the model dropped it entirely — no `stemDirection` field. abcjs takes the
      `if (params.stem)` branch in `createVoice` (`tune-builder.js:972`) and forces those
      three bass voices down, skipping the position convention. Our `stemForVoice` forced
      the first bass voice UP by position, drawing up-stems where abcjs draws down. Parsing
      and honouring `stems=` is a genuine missing feature, correct to add.

   b. **abcjs lets down-stems OVERHANG the inter-system gap.** Measured from its own SVG:
      ragtime's bass down-stems reach 44.9px below the bottom line while its `staff.bottom`
      stays at 19.5px — the NOTEHEAD depth. The stem laps into the gap without pushing the
      next system down. (The earlier note here said our extent "stops short of abcjs's
      `staff.bottom`" and that the fix was to reach it. That was WRONG — it conflated the
      few systems with `dynamicHeightBelow` on the bass, where `staff.bottom` genuinely is
      deep at 58px, with the many plain down-stem systems, where it is shallow at 19.5px and
      our extent is if anything too DEEP because we reserve the stem tip.)

   c. **Fixing (a) and (b) together made the corpus WORSE, so it was reverted.** Honouring
      `stems=down` alone: ragtime 57.9 → 66.8 (its new down-stems reserve their tips, growing
      the gap). Making down-stems overhang alone (stem reserved only on its high side, tip
      overhanging): `ave-verum` 2.4 → 23.4, `multi-voice-lyrics` 20 → 41, ragtime 57.9 →
      72.7 — worse everywhere. The overhang is right by abcjs's output yet wrong for our
      corpus, which by this project's iron rule means the model is still incomplete. The
      obvious culprit — our notehead glyph box being shallower than abcjs's − was CHECKED
      AND DISPROVEN: our `noteheadBlack` reaches 0.5 staff-spaces below centre, abcjs's
      0.522 (`pitch − 1.044` in its half-space units), a 0.17px difference. So the `+1`
      stem reserve added in `520cfb4` is compensating for something still unidentified, and
      the up-stem side, the down-stem side, the lyric anchor (which reads `verticalExtent`'s
      bottom) and the inter-system minimum are too coupled to change one term without
      recalibrating the others.

   **Next attempt:** change all of (a), (b) and the lyric anchor in ONE pass, and
   re-derive the lyric-anchor constant and the inter-system behaviour AFTER the extent is
   overhang-correct — do not expect any single edit to hold the corpus. The
   `.elements.json` `staffs[].bottom` is the per-system target for the extent BELOW; abcjs's
   own SVG stem tips are the target for what may overhang past it.

## What blocks the merge — all six, fully diagnosed

The branch cannot land until every fixture is within its recorded pixel-parity ceiling.
Measured against the `a761cf8` ceilings, **25 of 29 fixtures are within** and 4 are over
(`224ff8d` closed `multi-voice-triplet-brackets`; `3a80638` closed `voice-middle-after-clef`
via `middle=`). Every one of the 4 is a FEATURE GAP or an idiosyncratic reproduction case —
none is a constant to tune, and the gap constants `0/0` are already the best choice for the
contract (every non-zero `staffGap` scores fewer within-ceiling). The 4, with cause:

1. **`ragtime-nightingale`** (dy 177) — **`stems=` + down-stem overhang, ATTEMPTED and
   reverted 2026-07-24.** Its bass voices are `V:1/2/3 bass stems=down`, which we ignored
   entirely, and abcjs lets their down-stems overhang the inter-system gap while its
   `staff.bottom` stays at the notehead. Honouring `stems=` and making down-stems overhang
   are both correct against abcjs, but together they moved the corpus the WRONG way and were
   reverted — see § "Next, in priority order" item 2 for the full negative result and why.
   Not a 3-voice-collision problem after all (an earlier version of this note said so):
   `createVoice` forces every non-first voice down regardless of count, which our
   `stemForVoice` already does. This is the one blocker that gates the whole merge, and it
   needs a coordinated extent + lyric-anchor recalibration, not a constant.

2. **`voice-middle-after-clef` — CLOSED 2026-07-24 (`3a80638`).** `middle=<pitch>` sets which
   pitch sits on the middle staff line — a WRITTEN shift (abcjs's `clef.verticalPos`) that
   moves noteheads. New `Clef.middleOverride`; `clef=bass middle=d` puts D5 (36) on the
   middle line, dropping its high chords onto the staff. dy 24 → 0.0, oy → −0.2, exact.

   **`zocharti-loch`** (dy 17.5, ceil 3) — an INTRA-STAFF SPACING residual, NOT `middle=` (an
   earlier note here was wrong to bundle them). Its `V:B1/B2 clef=bass transpose=-24
   middle=d` basses are written in treble range; the `middle=` and `transpose=` nearly
   cancel, and since written `transpose=` is unrealized, `middle=` is GUARDED OFF there
   (honouring it alone sent zocharti to dy 72). At its guarded bass-default zocharti is dy
   17.5 — identical to the `520cfb4` regression — so the problem is the intra-staff gap the
   fudge deletion exposed: abcjs reserves the bass staff top at pitch 32/35 (its high notes)
   and the tenor↔bass gap is ~7–10px wider than ours. No `staffGap` value fixes it without
   costing more elsewhere (re-verified). Needs the bass staff's top extent, or the treble-8
   tenor's placement, measured against abcjs's `staffs[].top` — a different investigation
   from `middle=`. Written `transpose=` would let `middle=` compose here, but does not by
   itself close the spacing gap.

3. **`full-song-template`** (oy −22, ceil −17.4; dy 0) — **ABOVE-STAFF STACKING of chord +
   part + tempo, not `W:`/`H:`** (the earlier "W:/H: block shortfall" note here was a wrong
   guess — abcjs suppresses `O:`/`S:`/`D:`/`N:`/`Z:`/`H:` entirely; its top text is just
   title, subtitle, composer+rhythm, tempo). dy is a perfect 0, so every staff is consistent
   and the whole drawing sits ~22px too high. Measured: our title/subtitle/composer rows land
   on abcjs's to 0.1px, and the `P: PART` label matches abcjs's absolute y (170.3 vs 170.6) —
   but the FIRST STAFF sits 22px too high beneath it. Cause: abcjs STACKS the three
   above-staff elements the first staff carries — `chordHeightAbove 4.78` + `partHeightAbove
   5.72` + `tempoHeightAbove 6`, each + 1 margin, ≈ 19.5 pitch ≈ 75px above the note — where
   we place them in FIXED non-stacking lanes (`chordSymbolStep`, `partStep`, `tempoStep`)
   whose highest (tempo) reaches only ~53px. This is the SKYLINE-stacking problem the `-c`
   checkpoint flagged, now with a concrete fixture: the above-staff lanes want to become a
   stack like the tuplet lane became a fixed reserve. `frere-jacques` shares the `P:` path,
   so a `partStep` tweak is not safe — the stack has to be real.

4. **`multi-voice-triplet-brackets`** — **CLOSED 2026-07-24 (`224ff8d`).** abcjs reserves a
   tuplet/volta as a FIXED `endingHeightAbove` lane (5 pitch = 2.5 spaces) beyond the top/
   bottom NOTE and lets the bracket overhang it; we had reserved the bracket's actual line +
   hook + number geometry, which over-reserved ~8px on a tune with a high note under a
   bracket. `verticalExtent` now gathers tuplet/volta furniture as above/below flags and
   applies the fixed `endingLane` after the note extent is known. oy −17 → −2.3 (ceil −8.7),
   within ceiling; ragtime dy 177 → 122 as a bonus (its below-brackets over-reserved too);
   all five tuplet/grace fixtures within ceiling, no regression.

5. **`frere-jacques`** (dy 48, ceil 34) — **idiosyncratic.** abcjs lexes its `+:` prose as
   music and gives each prose line its own staff, reserving 46.5/23.4/23.4px above systems
   1/2/3 where we reserve 35.6/15.4/39.3. No rule we model produces those; it is a
   structural artifact of abcjs's prose-as-music bug, which we already reproduce for note
   COUNT but not for this spacing.

6. **`zocharti-loch`** — folded into item 2: it needs `middle=`, not a fudge. (The earlier
   "isolate which sub-change of `520cfb4` moved it" line is retired — the answer is that the
   fudge deletion merely exposed the unhonoured `middle=`.)

**The gate also wants six IMPROVEMENTS recorded** — `ave-verum` 12.5→2.4, `happy-birthday`
→0.0, `little swallow`→7.1, `multi-voice-lyrics`→4.5, `program-127`→0.4,
`two-voice-invention`→6.4. Do NOT lower those ceilings on `main`: they can only be recorded
when the branch lands, and it cannot land while the 6 above are over. Lower them in the same
commit that closes the last blocker.

## Also still open (unchanged from `c`)

- **The absolute stretch guard** — `spacing * minSpace > 50`, still needing a real
  spring/rod split.

---

## Tools this session added — use them before re-deriving anything

- **`tests/staff-spacing.test.ts`** (on the branch) measures the vertical question ALONE,
  boundary by boundary, instead of through a notehead distance that mixes in a horizontal
  axis still tens of pixels out. It reverses a conclusion: tuning the gap constants against
  the notehead median picks 3.0/1.5, tuning against boundary error picks 0/0, which is what
  abcjs uses.
- **The `.elements.json` goldens are an extent oracle**, not just a structural one. They
  carry `staffs[].top/.bottom` and the full `specialY` block — abcjs's own answer to how much
  room a staff takes and why. Replicating `setUpperAndLowerElements` over them and comparing
  the predicted bottom-line-to-top-line distance against the SVG lands EXACTLY (0.00px) on
  nine fixtures; every residual that remains is named (the voice-lyric offset, ragtime's
  `%%staffsep`, slur bounds). That replica is the fastest way to test a hypothesis about
  vertical space — no build, no renderer.
- **But `dump-elements.js` and `dump-svg.js` do not measure text the same way.** See §5.
  Where they disagree, the SVG is the gate.

---

## Method notes — new this session

The `c`, `b`, 07-21 and 07-22 notes still apply. New:

1. **A scratch probe writing to a fixed path will lie to you.** A geometry table was
   overwritten by a later probe using the same `/tmp` file, and nine consecutive
   configurations reported byte-identical results — which was the tell, because a constant
   that changes nothing at all changes nothing at all. `tests/staff-spacing.test.ts` asserts
   it read real staves before anything reads its table.
2. **Pick a metric that measures ONE thing.** The notehead median mixes a horizontal axis
   still tens of pixels out into every vertical judgement, and `oy` mixes where the first
   staff sits with how far apart the rest are stacked. Two constants were tuned for three
   sessions against a number that could not see what they did.
3. **Two errors that cancel look like one model.** Our lyric lane was too shallow AND our
   stacking too generous. Fixing only the lane made fixtures worse, which reads as "the fix
   is wrong" and is really "the fix is half of one". Same shape as the 4px gate bias in `c`.
4. **A constant that reproduces across three fixtures can still be a coincidence.** abcjs's
   chord baseline is 20.83px above the top line in three fixtures because the clef sets the
   ink top in all three. Three agreeing measurements killed a skyline port that was right.
   Vary the thing the model says matters, not just the fixture.
5. **Two harnesses from the same project can disagree, and only one is the gate.** The
   element dump and the SVG dump measure multi-line text differently. Believing the wrong
   one cost `little swallow` 19px a system and put a false claim in this file, which §5
   above retracts.
6. **Deleting a fudge is not tuning it.** `systemGap`/`staffGap` went to zero only after the
   extents they stood in for were measured right. The instruction was "find the missing
   extent, not tune the constant", and the constants went to abcjs's own value on their own
   once the extents did.
7. **"abcjs does X" is a claim about the fixture you measured.** Dynamics above the staff,
   the lyric voice offset, the chord lane — three findings generalised from one fixture
   each, all three wrong. Check whether the corpus holds a fixture where the rule's
   condition is FALSE before writing the rule down.
8. **A test that hard-codes a defective constant pins the defect in place.**
   `tests/lyric-continuation.test.ts` asserted the undersized 1.4 as a literal in three
   places. Its subject was "the default is applied exactly, not recomputed", which means
   asserting against the constant, not against its value.

---

## Confirm your lane before structural work — `Code/` vs `Code-v2/` vs `Code-1.9/`.
