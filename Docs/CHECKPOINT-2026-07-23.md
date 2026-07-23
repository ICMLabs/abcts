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

**The session's work is on the branch `geometry/lyric-ink-anchor`, not on `main`** — three
commits, `8196bfd` → `152c8b7` → `520cfb4`. Read `520cfb4`'s message first; it supersedes
parts of the two below it. The branch is parked because six fixtures still regress against
their recorded ceilings, but the vertical MODEL on it is now abcjs's, and that is the change
in position: this is no longer "a correct fix we cannot land", it is three named defects
standing between a correct model and landing it.

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

1. **DYNAMICS ARE ON THE WRONG SIDE, and the rule is one line.**
   `volumePosition: hasVocals ? 'above' : 'below'` (`write/creation/decoration.js:379`) —
   abcjs puts dynamics above the staff **only when that staff has lyrics**. Its dumps agree:
   `multi-voice-lyrics-two-voices` records `volumeHeightAbove`; `ragtime-nightingale` and
   `two-voice-invention` record `volumeHeightBelow`. `CHECKPOINT-2026-07-22c`'s "dynamics
   belong ABOVE the staff" was generalised from the one corpus fixture that sings, and is
   wrong for every fixture that does not.

   Worth `ragtime-nightingale` 61 → 47 on its own. Needs a `hasVocals` flag threaded down
   the path `voiceStem` already takes (`layoutMeasure` → `layoutEvent` → `layoutNoteheads`
   → `decorationGlyphs`), plus `layoutSpanners` for hairpins. The below position is a stack
   at the ink bottom, not a mirrored lane.

2. **`ragtime-nightingale`'s remaining drift** — dy 189 over 23 systems, not diagnosed
   beyond the dynamics. It sets `%%staffsep`/`%%sysstaffsep`, so any replica of abcjs's
   arithmetic must read those before its residuals mean anything.

3. **`frere-jacques`** — abcjs reserves 46.5 and 49.5px above its later systems where we
   reserve 35.6 and 15.4. Its second and third systems are the `+:` prose abcjs parses as
   music, so this may be a structural difference rather than a spacing one.

4. **`voice-middle-after-clef`** (dy 12.7 → 24.1), and `zocharti-loch`,
   `full-song-template`, `multi-voice-triplet-brackets` mixed — better on one axis, worse on
   the other. Undiagnosed.

5. **The absolute stretch guard** — `spacing * minSpace > 50`, still needing a real
   spring/rod split. Unchanged from `c`.

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
