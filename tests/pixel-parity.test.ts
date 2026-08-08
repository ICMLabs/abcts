/**
 * PIXEL PARITY against abcjs's rendered SVG — the gate nothing was doing.
 *
 * The contract: abcts's default mode reproduces abcjs's visual output, the glyph
 * dictionary excepted. Until now nothing checked that in either direction. CLAUDE.md
 * described the 379 golden SVGs as "unused" and ARCHITECTURE.md claimed they "gate compat
 * mode", while `abcts/compat` in fact calls the same core `layout()` + `toSVG()` as
 * everything else. A documented gate that measures nothing — the same shape as the three
 * gate bugs recorded in the checkpoint.
 *
 * ── WHAT IS COMPARED, AND WHY IT IS NOT BYTES ────────────────────────────────
 * abcjs bakes absolute pixels into every `d`; abcts emits a `viewBox` in staff-space
 * units with `translate()` down the tree. Both are legitimate encodings of the same
 * picture, so a byte diff would report "different" forever while telling you nothing.
 * `absolutePixels` resolves each to what a browser would put on screen, and the
 * comparison happens there.
 *
 * Glyph OUTLINES are deliberately out of scope: abcts draws Bravura, abcjs draws its own
 * font, and that difference is intended — it is why abcts's output is smaller. Where a
 * glyph is placed is in scope. What it looks like is not.
 *
 * ── THE NUMBERS BELOW CHANGED MEANING ON 2026-07-22 ──────────────────────────
 * Positions are now the BOUNDING-BOX CENTRE of the real outline on both sides (see
 * `pathBox` in `pixel-geometry.ts`). They used to be abcjs's first `M` against abcts's
 * glyph origin — for a notehead, its TOP against its CENTRE, a fixed 4.035px bias that
 * read as agreement and hid a real 4.3px vertical error of the same size underneath it.
 * Ceilings recorded before that change are NOT comparable with ones recorded after.
 * The tell was that `oy` and the staff-line offset disagreed by a constant 4.2px on 25 of
 * 29 fixtures while each engine was internally consistent — B4 centres on the middle line
 * in both.
 *
 * ── TWO ASSERTIONS, AND THEY DO DIFFERENT JOBS ───────────────────────────────
 * 1. NOTEHEAD COUNT, exact, per fixture. Currently 29/29 fixtures and 2,652 noteheads.
 *    This is a real parity statement and it can only ever regress, so it is asserted
 *    flatly rather than tracked.
 * 2. POSITION SPREAD, tracked against recorded ceilings. `dySpread` is the range of
 *    (ours - abcjs) over every notehead: ZERO means our geometry differs from abcjs's by
 *    a pure constant offset, which is a margin, not an engraving difference.
 * 3. POSITION OFFSET (`oy`/`ox`), the MEAN of the same deltas — where the drawing sits,
 *    as opposed to how much it disagrees with itself. Added 2026-07-22 after the spread
 *    numbers were found to be flattering: `score-reorder-shared` reported a dx spread of
 *    0.0, a perfect score, while sitting 100px to the left of abcjs. Spread alone cannot
 *    see a uniform translation, and a picture in the wrong place is not parity.
 *
 * THE CEILINGS BELOW ARE A TODO LIST, NOT A SPECIFICATION. Every one of them should end
 * at 0. They are recorded so the gap cannot silently widen while it is being closed, and
 * a fixture that improves past its ceiling FAILS — forcing the number down rather than
 * letting it rot. Do not raise one to make a change pass.
 *
 * ── WHAT THE NUMBERS SAY, ranked (measured 2026-07-21) ───────────────────────
 *  0. JUSTIFICATION — LARGELY CLOSED 2026-07-21, and it was bigger than line breaking on
 *     every single-system fixture. We never stretched a last system; abcjs stretches one
 *     that is already >= 66% full (`write/layout/layout.js:102`). Since every single-tune
 *     fixture IS a last system, we justified none where abcjs justified most.
 *     `vree-compound-meter` 182.7 -> 11.3, `program-127-test` 54.7 -> 16.9,
 *     `full-song-template` 56.2 -> 23.3.
 *     `center-text` is unmoved and is NOT this rule failing: its trailing `%%center`
 *     means abcjs's music line is not its last line, so abcjs always justifies it. That
 *     one waits on `%%center`.
 *  1. LINE BREAKING — CLOSED 2026-07-22, and it was not an algorithm. In ABC one source
 *     music line is one printed system, and abcjs fits each to the page, compressing a
 *     long line rather than wrapping it. We packed measures by width instead. Systems now
 *     match on 29 of 29 fixtures, up from 18, and the horizontal spreads collapsed with
 *     them — `chord-grid` 639.6 -> 7.4, `twinkle` 636.9 -> 7.3, `two-voice-invention`
 *     918.8 -> 34.9, `ragtime-nightingale` 1142.6 -> 101.5.
 *
 *     CORRECTION — abcjs DOES have a line-breaking pass, and an earlier note here saying
 *     it "HAS no line-breaking pass" was wrong. It lives in `parse/wrap_lines.js`, in the
 *     PARSER rather than under `write/`, which is why listing `write/` found nothing. It
 *     runs only when a host passes BOTH `wrap` and `staffwidth` (`api/abc_tunebook_svg.js`
 *     `doLineWrapping`), and the golden generator passes only `staffwidth` — so the
 *     goldens are UNWRAPPED and one source line is one system after all. The conclusion
 *     held; the reason given for it did not.
 *
 *     `frere-jacques` was the last fixture whose system COUNT differed (abcjs 4, ours 2)
 *     and it was never wrapping: abcjs parses its `+:` prose as music (a bug we reproduce
 *     — 45 noteheads on both sides) and gives each prose line its own staff line, running
 *     the last one straight into the first real bar with no barline between. abcjs breaks
 *     per source line whether or not a barline falls there; our systems break between
 *     MEASURES, so the break had nowhere to land. The parser now closes an unterminated
 *     measure at a source-line boundary, which is a layout unit, not a musical bar —
 *     nothing is drawn for the absent barline. 244 -> 40px.
 *  2. VERTICAL — PARTLY CLOSED 2026-07-22, and it was never a constant. `marginY` padded
 *     every staff extent by 4 spaces a side, 31px, where abcjs and abcMusicKit v1 add no
 *     per-staff margin at all: they advance by the ink extent and enforce a MINIMUM
 *     line-to-line separation (`draw.js:84-92`). Removing it, plus applying abcjs's two
 *     separations as line-to-line rather than origin-to-origin minimums, takes EIGHT
 *     fixtures to a y offset within 2px of abcjs.
 *     The top-text BLOCK closed most of the rest on 2026-07-22: composer, rhythm and
 *     origin are drawn and reserve height, abcjs's font sizes are used (title 20pt, not
 *     the old 18.6px), and `padding.top` 15px exists at last. Mean |y offset| went
 *     73.8 -> 43.6 across the session; `zocharti-loch` -74.9 -> -5.5,
 *     `program-127-test` -117 -> -34.
 *     ELEVEN entries got WORSE, all for one reason: a title-only tune was accidentally
 *     near-zero under the old fixed `titleStep`, which happened to approximate a
 *     title-only block. They now sit around -16.5px — a real residual where there used to
 *     be a coincidence, and the next term to chase.
 *  3. A 4.5px HORIZONTAL STEP AT A BARLINE. `simple-c`, `stacked-annotations`,
 *     `vree-slurs-and-triplets` and `vree-ties-across-bars` all show 4.5 exactly, which
 *     is one shared cause and almost certainly one constant in `ENGRAVE`.
 *  4. Accidental and grace-note widths — `vree-sharps` 8.9, `vree-grace-notes` 31.5.
 *  5. JUSTIFICATION HAS NO RATIO CAP — closed 2026-07-22. `maxJustifyStretch: 1.6` was a
 *     *Behind Bars* judgement abcjs does not share: `calcHorizontalSpacing` justifies
 *     every non-last line however far it must stretch. Removing it took `frere-jacques`
 *     47 -> 40 and `multi-voice-lyrics-two-voices` 339.7 -> 51.0 of dx spread.
 *     abcjs's own guard is ABSOLUTE (`spacing * minSpace > 50`) and is NOT reproduced —
 *     see the ponytail note in `layout.ts` for why measuring it off element origins binds
 *     too early, and what a faithful version needs.
 *
 * Three fixtures ALREADY MATCH horizontally to the pixel (`score-reorder`,
 * `score-reorder-shared`, `voice-octave-shift` have `dxSpread` 0.0), which is the
 * evidence that the engraving grid itself is right and this is calibration rather than
 * a re-engraving.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
import { corpusDir, goldensDir, loadCorpus } from './corpus/corpus.js'
import { absolutePixels, byClass } from './pixel-geometry.js'

/**
 * THE 89 `-tuneN` ROWS ARE A GOLDEN SURFACE THIS GATE READ NOTHING OF UNTIL 2026-08-07.
 *
 * It enumerated `<name>.svg`, which only a SINGLE-TUNE fixture has — so 29 of the 41 were
 * measured and the twelve multi-tune ones were not measured at all, though abcjs's own
 * per-tune goldens (`<name>-tune0.svg`, `-tune1.svg`, …) had been sitting beside them the
 * whole time. That is 89 more tunes, and every mid-tune key change in the corpus lives in
 * one of them (`key-change.test.ts` says why, and had to hand-roll its own comparison for
 * exactly this reason).
 *
 * All 89 match abcjs on notehead COUNT on the first run. Twelve differ on position, and
 * they are the ranked list the checkpoint said no gate could produce any more — `S8-layout`
 * X:810 at dx 82.67 being the largest number left anywhere in either corpus.
 *
 * The `-classes-tuneN` and `-print-tuneN` families are the same tunes rendered with
 * `add_classes` / `print`, so they are deliberately NOT enumerated: they would triple the
 * row count and measure the same geometry three times.
 */
/**
 * Per fixture: how many noteheads abcjs draws, and the current position spreads.
 *
 * `heads` is asserted exactly. `dy`/`dx` are ceilings — the measured value must not
 * exceed them, and must not come in UNDER them without the entry being updated.
 */
const EXPECTED: Record<string, { heads: number; dy: number; dx: number; oy: number; ox: number }> =
  {
    'ave-verum-corpus': { heads: 55, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'brother-john-inline-voices': { heads: 64, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'center-text': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'chord-grid': { heads: 16, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 22.15 -> 22.64 and `little swallow` 23.97 -> 24.19 when the notehead ROD became
    // abcjs's 9.81 rather than Bravura's 9.145 outline. Sub-pixel movement on the two
    // fixtures whose dx is dominated by a GOLDEN artefact — recorded rather than reverted,
    // because the width is abcjs's own and the same change took ragtime 55.32 -> 53.56 and
    // five more harvested fixtures inside their thresholds.
    // dx 22.64 -> 21.81 on the declared-height fix.
    'frere-jacques': { heads: 45, dy: 0.02, dx: 0.02, oy: -0.01, ox: 0.0 },
    'full-song-template': { heads: 20, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 3.85 -> 1.40 when a REST became a rod. abcjs's `getMinWidth` is `child.w`
    // whatever the type and a rest's `w` is its glyph — 7.534 for an eighth — where ours
    // was a flat 0, so a compressed line let the note after a rest slide onto it.
    // then 1.40 -> 0.23 when `Bb` became `B♭`: `♭` is a full em in the chord font where
    // `b` is 0.556, and the mark is CENTRED on the note, so half of that was horizontal.
    // dx 0.23 -> 0.12 and ox -0.49 -> 0.0 when every DECLARED box became abcjs's
    // published `h` rather than the derived ink box.
    'happy-birthday': { heads: 25, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dy 1.92 -> 0.32 and oy -0.58 -> 0.16 when `anchorLyrics` stopped measuring its own
    // ink and took `verticalExtent`'s. dx/ox are the goldens' ASCII width table, not us.
    // dx 24.19 -> 21.69 when `calcWidth` landed: its 73 Chinese characters measure the
    // golden generator's flat 8 rather than a full em, which is what the goldens do.
    // dy 0.32 -> 0.21, oy 0.16 -> 0.06 and ox -6.29 -> -5.28 on the declared-height fix.
    'little swallow': { heads: 89, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-lyrics-two-voices': { heads: 16, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-rest-collision': { heads: 7, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-rest-placement': { heads: 14, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'multi-voice-triplet-brackets': { heads: 45, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'program-127-test': { heads: 20, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'ragtime-mini': { heads: 30, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 69.82 -> 55.32 when the accidental extents became abcjs's own numbers. Its `oy`
    // is the branch's one red and went 1.49 -> 1.58 on the same change — its residual is
    // horizontal in origin (see the checkpoint), so the two move together.
    // dy 58.1 -> 1.12 and dx 53.56 -> 18.30 when the GRACE NOTES stopped being emitted
    // before their main head. Both were recorded for weeks as "two mis-paired noteheads,
    // do not chase" — the mis-pairing was ours, and it was the emission order.
    // dx 16.43 -> 16.53 when `extraw` became abcjs's RUNNING MIN rather than a sum of half
    // widths. RECORDED, not masked: the port is exact on a three-accidental chord — 7.50px,
    // which is `(6.75 + 8.25) / 2` to the digit — and verified against abcjs's own probed
    // `extraw`. Ragtime's dx is a SPREAD dominated by other causes and moved a tenth of a
    // pixel; the harvested corpus gained a fixture at 1px and another at 5px on the same
    // change.
    // dy 1.12 -> 0.33, oy -0.54 -> 0.13, ox -1.87 -> -0.76, and every one of its twelve
    // staff boundaries now measures 0.0. It was the branch's one standing red, and the
    // cause was a single beamed down-stem on system 4: `createStems` counts the head's own
    // `dx` twice when it asks `getBarYAt` for the beam's height, which is zero on a plain
    // note and a whole notehead on a voice-overlap displacement. That stem landed 0.30
    // pitch high, a below-slur anchored in the beam took its bottom as an endpoint, and the
    // slur's box became `staff.bottom` — the natural separation, on the one system where
    // `systemStaffSeparation` does not bind. Every staff from the ninth inherited 1.1px.
    //
    // AND THE `dx` RAISE IS UNDONE. It went 16.43 -> 16.53 on finding 68, the only ceiling
    // ever raised on this branch; it is back under the original figure at 16.52.
    // A GRACE'S ACCIDENTAL, drawn at last, moves three of these four the right way and one
    // the wrong way: dx 16.52 -> 13.31, ox -0.76 -> -0.75, oy 0.13 -> 0.15, dy 0.33 -> 0.40.
    //
    // THE `dy` RAISE IS RECORDED, NOT MASKED — the second on this branch, and 0.07px on a
    // 2009-notehead fixture against 3.2px off its `dx`. The rule it is drawn from was
    // verified exact on four control tunes (`{=de}`, `{de}`, `{^de}`, and with a lyric),
    // so what moved here is a redistribution across 23 systems once one element reaches
    // 7px further left, not the rule. `mouse-click-01` went 7.20 -> 1.88 on the same fix.
    // dy 0.25 -> 0.04, oy 0.05 -> 0.01 and ox 0.12 -> 0.02 on the accidental-room rule.
    // `dx` did not move: its 12.13 is the cancellation line, not this.
    // dx 12.13 -> 1.58, dy 0.04 -> 0.01, oy 0.01 -> 0.00 when the ending's `minspacing`
    // stopped being charged to EVERY voice's barline. abcjs charges the one that carries
    // the volta: of the five barlines at one x on system 17, ONE has `minsp=28.50` and the
    // other four have the plain 10.00. It is not a wash, because the left-ink rule is a
    // SHORTFALL — abcjs's other voices keep 18.50 of slack after their bar, which absorbs
    // the 12.13 of accidental ink on the chord after it; ours had spent that slack.
    // dx 1.58 -> 0.0, ox 0.03 -> 0.0. EXACT ON ALL FOUR, on the corpus's largest fixture,
    // and it closed on the SAME rule as `S8-layout-tune5`: `roomtaken` is an ORIGIN, not a
    // child, so a down-stemmed displaced head's 11.81 seed reserves nothing on its own —
    // `extraw` sees only the head's own 8.81 `shiftheadx`.
    'ragtime-nightingale': { heads: 2009, dy: 0.01, dx: 0.0, oy: 0.0, ox: 0.0 },
    'score-reorder-shared': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'score-reorder': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'simple-c': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'stacked-annotations': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    twinkle: { heads: 14, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'two-voice-invention': { heads: 74, dy: 0.01, dx: 0.0, oy: 0.0, ox: 0.0 },
    'voice-middle-after-clef': { heads: 10, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'voice-octave-shift': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'vree-compound-meter': { heads: 12, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dy 11.6 -> 0.02 and dx 32.5 -> 1.99, same cause. What is left is the grace glyph's
    // own width: a uniform 1.99 on the graces themselves, exactly as the note predicting
    // the "artefact" said it would be once the order was right.
    // dx 1.99 -> 0.0 and ox -1.14 -> 0.0 when strict stopped SCALING a grace glyph, which
    // abcjs does not either: `printSymbol` takes `scalex`/`scaley` and passes neither on.
    // At ZERO on all four axes.
    'vree-grace-notes': { heads: 7, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // oy 0.06 -> 0.0: a sharp DECLARES 20.15 where its ink box is 20.19, and a key
    // signature of them was the extra 0.04px on top of the clef's systemic 0.03.
    'vree-sharps': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'vree-slurs-and-triplets': { heads: 8, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'vree-ties-across-bars': { heads: 4, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    // dx 5.35 -> 1.25 on the accidental extents.
    // EXACT ON ALL FOUR — dx 1.25 -> 0.0 and ox -0.34 -> 0.0 when `M:C` started drawing
    // `timesig.common` instead of the digits `4/4`. A one-glyph prefix, and the whole of
    // this fixture's remaining horizontal error.
    'zocharti-loch': { heads: 64, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },

    // ── THE MULTI-TUNE FIXTURES, per tune. See the note above the table. ──────────
    'S1-decorations-tune0': { heads: 16, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S1-decorations-tune1': { heads: 11, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S1-decorations-tune2': { heads: 64, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S1-decorations-tune3': { heads: 13, dy: 0, dx: 0, oy: 0, ox: 0 },
    // oy 9.67 -> 0.00. EXACT. `!slide!` is a curve at the note in abcjs, not a glyph
    // above the staff, so it reserves nothing — this tune's whole error was that reserve.
    'S1-decorations-tune4': { heads: 16, dy: 0, dx: 0.01, oy: 0.0, ox: 0 },
    'S2-fields-tune0': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dy 4.68 -> 0.0 and oy -2.98 -> 0.0. EXACT ON ALL FOUR. A `"_below"` annotation takes
    // a LANE off the staff's bottom ink — `chordHeightBelow * lanes + margin` — where we
    // drew it at a fixed step and reserved its own ink box. 1.2078 pitch on staff 0, which
    // carried the whole tune's two later systems with it.
    'S2-fields-tune1': { heads: 11, dy: 0.0, dx: 0, oy: 0.0, ox: 0 },
    'S2-fields-tune2': { heads: 16, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S3-note-syntax-tune0': { heads: 28, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune1': { heads: 43, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune2': { heads: 21, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune3': { heads: 11, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune4': { heads: 43, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune5': { heads: 27, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune6': { heads: 23, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S3-note-syntax-tune7': { heads: 29, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune8': { heads: 66, dy: 0.01, dx: 0.01, oy: 0, ox: 0 },
    'S3-note-syntax-tune9': { heads: 8, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune10': { heads: 14, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune11': { heads: 7, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 0.18 -> 0.0. Its two `G8` bars are BREVES, and we drew semibreves — see the
    // `G8` test below, which used to assert the difference as an irreducible outline.
    'S3-note-syntax-tune12': { heads: 16, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    'S3-note-syntax-tune13': { heads: 0, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune14': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune15': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune16': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune17': { heads: 25, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune18': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune19': { heads: 12, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune20': { heads: 12, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune21': { heads: 5, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S3-note-syntax-tune22': { heads: 40, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S3-note-syntax-tune23': { heads: 29, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 6.24 -> 0.0 and ox 0.11 -> 0.0. EXACT ON ALL FOUR. `translateChord` runs on every
    // chord symbol, not only under `%%jazzchords`, and it REBUILDS the string from three
    // regex groups — so `"C6/9"` prints as `C6`, the `/9` failing `[ABCDEFG][#b♯♭]?`.
    'S3-note-syntax-tune24': { heads: 64, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    'S4-bars-repeats-tune0': { heads: 28, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S4-bars-repeats-tune1': { heads: 60, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 1.17 -> 0.0 and ox 1.80 -> 0.0. EXACT ON ALL FOUR. `z4` in `M:6/8` is a WHOLE
    // rest whose duration abcjs's PARSER rewrites to the measure's — 0.75, not 1 — so its
    // spring is a dotted half's, not a whole note's. A second fix in the same tune: a
    // dotted REST's dot widens the element, which only the note path knew.
    'S4-bars-repeats-tune2': { heads: 2, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    'S5-directives-tune0': { heads: 28, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    // dy 0.52 -> 0.03 and oy 0.03 -> 0.00 when `!style=normal!` started overriding a
    // `style=rhythm` voice and a zero-duration styled note took its own `nostem` head —
    // four head glyphs were simply wrong. Then dx 24.27 -> 1.19 and ox 1.94 -> -0.03 when
    // an inline `[M:]` at the head of a line started drawing at the END of the previous
    // system. That 23px of fixed width was the whole ramp.
    //
    // THE `ox` RAISE THIS ENTRY CARRIED FOR ONE COMMIT IS GONE. It was 1.79 -> 1.94, a
    // mean over exactly that ramp, and closing the ramp took it to -0.03. Which is what
    // the raise predicted, and the reason it was recorded rather than argued away.
    // dx 1.19 -> 0.0 and dy 0.03 -> 0.0. EXACT ON ALL FOUR, and it took four findings:
    // 129 (`!style=normal!` overriding the voice), 130 (an inline `[M:]` at a line head),
    // and now the LINE granularity of `K: style=`. A mid-line `[K: style=harmonic]` does
    // not change the rest of its own line — `createVoice` appends the style element from
    // `startNewLine`, so it takes effect from the next one.
    'S5-directives-tune1': { heads: 188, dy: 0.0, dx: 0.0, oy: 0.0, ox: 0.0 },
    'S5-directives-tune2': { heads: 7, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S5-directives-tune3': { heads: 16, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 3.88 -> 0.0 and ox 0.17 -> 0.0. EXACT ON ALL FOUR. The melisma `_` is part of the
    // syllable abcjs MEASURES, not something appended after the element's spans are taken:
    // `true._` reserves 21.492 each side where `true.` reserves 17.242, and the 8.5
    // between them is the golden vocalfont table's width for `_`.
    'S5-directives-tune4': { heads: 22, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    'S5-directives-tune5': { heads: 22, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S6-keys-tune0': { heads: 1, dy: 0, dx: 0, oy: 0, ox: 0.0 },
    'S6-keys-tune1': { heads: 48, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S6-keys-tune2': { heads: 28, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 24.93 -> 0.01 and ox 2.08 -> 0.0 when the "same signature prints nothing" guard
    // went. `K:A Mixolydian` -> `K:E Dorian` is two sharps to two sharps and abcjs
    // reprints all of it; the 18.50px it reserved came back as a 3.56px-per-note ramp.
    'S6-keys-tune3': { heads: 48, dy: 0, dx: 0.01, oy: 0, ox: 0.0 },
    'S6-keys-tune4': { heads: 31, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S7-voices-tune0': { heads: 51, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune1': { heads: 62, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune2': { heads: 47, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune3': { heads: 66, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune4': { heads: 84, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune5': { heads: 52, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S7-voices-tune6': { heads: 71, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S8-layout-tune0': { heads: 45, dy: 0, dx: 0, oy: 0, ox: 0 },
    'S8-layout-tune1': { heads: 16, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S8-layout-tune2': { heads: 40, dy: 0.01, dx: 0, oy: -0.01, ox: 0 },
    'S8-layout-tune3': { heads: 31, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'S8-layout-tune4': { heads: 90, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 11.81 -> 6.20 and ox -1.56 -> 1.07 on the same rule plus the UNISON half of it.
    // `[cc]` and `[dd]` were drawn as one head on top of another, because the displacement
    // map was keyed by STEP and a unison is two heads at one step.
    // dx 6.20 -> 0.0 and ox 1.07 -> 0.0. EXACT ON ALL FOUR. `[cc]` and `[dd]` were each
    // 3.00px too wide — the gap between the displaced head's 8.81 `shiftheadx` and the
    // 11.81 it seeds `roomtaken` with. Only the first is a child of the element.
    'S8-layout-tune5': { heads: 60, dy: 0.01, dx: 0.0, oy: 0, ox: 0.0 },
    // dx 8.25 -> 0.0 and ox 3.58 -> 0.0. EXACT ON ALL FOUR. `abselem.extraw` is a MIN over
    // siblings and the accidental's `extraw -= extraLeft` runs BEFORE the graces' own
    // `addExtra` resets it, so a grace deeper than the accidental throws that half-width
    // away. We were adding it on top: exactly 4.125px per note carrying BOTH a grace group
    // and an accidental, of which this tune has two — `{A}^c2` and `{FGAB}[^c4A4]`.
    'S8-layout-tune6': { heads: 99, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    // oy 1.67 -> 1.14 on the `!slide!` rule; its `dy` 2.66 is something else.
    // EXACT ON ALL FOUR, and it took three findings: `scripts.roll`'s height (139), then
    // the GRACE SLUR, which abcjs hangs under every grace group and we had never built at
    // all. `{f}e {C}D {cd}c {E^c}a2 {dedc}d` measured -3.0000 against our -1.2000.
    'S8-layout-tune7': { heads: 58, dy: 0.0, dx: 0, oy: 0.0, ox: 0 },
    'S8-layout-tune8': { heads: 28, dy: 0.01, dx: 0, oy: 0, ox: 0 },
    'S8-layout-tune9': { heads: 66, dy: 0, dx: 0, oy: 0, ox: 0 },
    // dx 82.67 -> 0.0 and ox -31.37 -> 0.0. EXACT ON ALL FOUR. A down-stemmed chord with a
    // displaced head starts its accidentals a notehead further left, and this tune is
    // twelve bars of nothing else — the deficit was a perfect 11.81px staircase.
    'S8-layout-tune10': { heads: 96, dy: 0, dx: 0.0, oy: 0, ox: 0.0 },
    // EXACT ON ALL FOUR, and it took two findings. First the prefix started cancelling the
    // key IN FORCE rather than the previous LINE's key — `K:Gb` after a mid-line `[K:Bb]`
    // cancels nothing, where against G it cancelled an F#, and a NATURAL declares a box to
    // pitch 15.88 against the clef's 13.72, so one wrong glyph raised the chord lane, the
    // ending lane above it and the whole staff: dy 8.37 -> 0.01, oy 4.73 -> 0.00.
    // Then the standalone `M: 9/8` after a `\` continuation started drawing where it
    // stands: dx 20.12 -> 0.00, ox -3.16 -> 0.00.
    //
    // AND THE `ox` RAISE THE MIDDLE STATE CARRIED IS GONE — the second of that shape to
    // close itself one commit later. Both were means over a spread that had not been
    // fixed yet, and in both cases the entry named what it was waiting on.
    'S8-layout-tune11': { heads: 46, dy: 0.01, dx: 0.0, oy: 0.0, ox: 0.0 },
    'clefs-tune0': { heads: 1, dy: 0, dx: 0, oy: 0, ox: 0.0 },
    'clefs-tune1': { heads: 1, dy: 0, dx: 0, oy: -0.03, ox: 0.0 },
    'clefs-tune2': { heads: 1, dy: 0, dx: 0, oy: -0.03, ox: 0.0 },
    'clefs-tune3': { heads: 1, dy: 0, dx: 0, oy: -0.03, ox: 0.0 },
    'clefs-tune4': { heads: 1, dy: 0, dx: 0, oy: -0.03, ox: 0.0 },
    'clefs-tune5': { heads: 1, dy: 0, dx: 0, oy: -0.01, ox: 0.0 },
    'clefs-tune6': { heads: 1, dy: 0, dx: 0, oy: -0.01, ox: 0.0 },
    'clefs-tune7': { heads: 36, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune0': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune1': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune2': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune3': { heads: 10, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune4': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune5': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'curves-tune6': { heads: 4, dy: 0, dx: 0, oy: 0, ox: 0 },
    'missing-decorations-tune0': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'missing-decorations-tune1': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'missing-decorations-tune2': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'missing-decorations-tune3': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'missing-decorations-tune4': { heads: 24, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'missing-decorations-tune5': { heads: 8, dy: 0, dx: 0.01, oy: 0, ox: 0 },
    'tunebook-3-tune0': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
    'tunebook-3-tune1': { heads: 14, dy: 0, dx: 0, oy: 0, ox: 0 },
    'tunebook-3-tune2': { heads: 8, dy: 0, dx: 0, oy: 0, ox: 0 },
  }

/** Rounding slack, so a last-digit wobble is not a failure. */
/**
 * THE SLACK THIS GATE ALLOWS, AND IT IS NOT NOTHING. At 0.05px it can hide a fixture
 * drifting off EXACT ZERO — six of the 41 sat between 0.01 and 0.04 on some axis through
 * 2026-08-06 without any ceiling moving. Measuring the corpus at the session's first commit
 * and again at its last is what settles which way a change went; the recorded numbers alone
 * cannot, because they only ever say "no worse than".
 */
const EPSILON = 0.05

interface Measured {
  goldenHeads: number
  ourHeads: number
  dy: number
  dx: number
  /**
   * MEAN offset — where the drawing SITS, as opposed to how much it disagrees with
   * itself. Spread alone reports 0.0 for a render uniformly 100px left of abcjs's, which
   * is a perfect score for a picture in the wrong place.
   */
  oy: number
  ox: number
}

/**
 * One row of the table: a golden SVG and the tune of the fixture it was rendered from.
 *
 * A single-tune fixture has `<name>.svg` and is tune 0. A multi-tune one has no
 * `<name>.svg` at all — its goldens are `<name>-tune0.svg`, `-tune1.svg`, … — which is why
 * twelve fixtures and 89 tunes went unmeasured until 2026-08-07. The KEY is the golden's
 * own basename, so the two families share one table.
 */
interface Target {
  readonly key: string
  readonly fixture: string
  readonly tune: number
}

const targetsOf = (fixture: string): Target[] => {
  if (existsSync(join(goldensDir, `${fixture}.svg`))) {
    return [{ key: fixture, fixture, tune: 0 }]
  }
  const found: Target[] = []
  for (let tune = 0; existsSync(join(goldensDir, `${fixture}-tune${tune}.svg`)); tune++) {
    found.push({ key: `${fixture}-tune${tune}`, fixture, tune })
  }
  return found
}

function measure(target: Target): Measured {
  const abc = readFileSync(join(corpusDir, `${target.fixture}.abc`), 'utf-8')
  const golden = absolutePixels(readFileSync(join(goldensDir, `${target.key}.svg`), 'utf-8'))
  const rendered = renderAbc('paper', abc, {})
  const svg = rendered[target.tune]?.svg ?? ''
  const ours = absolutePixels(svg)
  const goldenHeads = byClass(golden, 'notehead')
  const ourHeads = byClass(ours, 'notehead')
  const n = Math.min(goldenHeads.length, ourHeads.length)
  const spread = (values: number[]): number =>
    values.length === 0 ? 0 : Math.max(...values) - Math.min(...values)
  const deltas = (axis: 'x' | 'y'): number[] =>
    goldenHeads.slice(0, n).map((head, i) => (ourHeads[i]?.[axis] ?? 0) - head[axis])
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
  return {
    goldenHeads: goldenHeads.length,
    ourHeads: ourHeads.length,
    dy: spread(deltas('y')),
    dx: spread(deltas('x')),
    oy: mean(deltas('y')),
    ox: mean(deltas('x')),
  }
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}

/**
 * The MEDIAN euclidean distance from each of our noteheads to abcjs's, per fixture.
 *
 * Per fixture, not pooled per note: `ragtime-nightingale` holds 2009 of the corpus's
 * 2696 noteheads, so a pooled median is simply its median and hides everything else.
 */
function fixtureMedianDistance(target: Target): number {
  const golden = byClass(
    absolutePixels(readFileSync(join(goldensDir, `${target.key}.svg`), 'utf-8')),
    'notehead',
  )
  const ours = byClass(
    absolutePixels(
      renderAbc('paper', readFileSync(join(corpusDir, `${target.fixture}.abc`), 'utf-8'), {})[
        target.tune
      ]?.svg ?? '',
    ),
    'notehead',
  )
  const n = Math.min(golden.length, ours.length)
  const distances: number[] = []
  for (let i = 0; i < n; i++) {
    const g = golden[i]
    const o = ours[i]
    if (g === undefined || o === undefined) continue
    distances.push(Math.hypot(o.x - g.x, o.y - g.y))
  }
  return median(distances)
}

describe('pixel parity vs abcjs rendered SVG', () => {
  const withGoldens = loadCorpus().flatMap((entry) => targetsOf(entry.name))

  it('the gate reads real goldens and can tell positions apart', () => {
    // A gate that cannot fail reports coverage it does not have — the fuzz suite that
    // passed while three crashes were live. This canary needs BOTH outcomes to be
    // reachable, so it names a fixture at parity and one that is not.
    //
    // It used to name only `simple-c`, on the grounds that it had a known non-zero dx
    // spread. It no longer does — the horizontal arc took it to exact — so that half is
    // now the ZERO end of the check.
    //
    // The non-zero end was `frere-jacques` until 2026-08-07, when its 21.80 went to 0.00
    // and this canary failed BEFORE its own ceiling did. It moved to `little swallow`,
    // then to `ragtime-nightingale`, and both closed inside two sessions. This file
    // predicted the ending: "when its 13.31 closes this check needs a different shape — a
    // SYNTHETIC PAIR, not a fixture, since by then there may be none that differ."
    //
    // So the non-zero end is now a DELIBERATE MISMATCH: our `simple-c` render measured
    // against `ragtime-nightingale`'s golden, which `measure` pairs head-for-head over the
    // first eight. It is the real comparison on real goldens — it simply has no reason to
    // agree, and it cannot close. A canary a fix can extinguish is a ceiling in disguise.
    //
    // `tunebook-3-tune0` was tried first and is NOT usable: eight quarter notes at the
    // same spacing as `simple-c`'s, so the dx SPREAD is 0.00 and only the mean differs.
    // Two different tunes are not automatically two different geometries.
    const simple = measure({ key: 'simple-c', fixture: 'simple-c', tune: 0 })
    expect(simple.goldenHeads).toBe(8)
    // Not `toBe(0)`: the resolved coordinates carry float noise, and a `0.0` in the
    // table means "a pure constant offset", not "exactly zero to the last bit".
    expect(simple.dx).toBeLessThan(EPSILON)
    expect(simple.dy).toBeLessThan(EPSILON)
    // …and a comparison returning 0 for everything would fail here.
    const mismatched = measure({ key: 'ragtime-nightingale', fixture: 'simple-c', tune: 0 })
    expect(mismatched.ourHeads).toBe(8)
    expect(mismatched.dx).toBeGreaterThan(1)
    expect(mismatched.dy).toBeGreaterThan(1)
  })

  it('every fixture with an SVG golden is accounted for', () => {
    // Adding a golden without a row here would otherwise be silently unmeasured.
    const keys = withGoldens.map((target) => target.key)
    expect(keys.filter((key) => EXPECTED[key] === undefined)).toEqual([])
    expect(Object.keys(EXPECTED).filter((key) => !keys.includes(key))).toEqual([])
  })

  describe('notehead count is exact', () => {
    for (const target of withGoldens) {
      it(`${target.key}`, () => {
        const { goldenHeads, ourHeads } = measure(target)
        expect(goldenHeads).toBe(EXPECTED[target.key]?.heads)
        // The real parity statement: same notes, same count, drawn by both engines.
        expect(ourHeads).toBe(goldenHeads)
      })
    }
  })

  describe('position spread does not widen', () => {
    for (const target of withGoldens) {
      const name = target.key
      it(`${name}`, () => {
        const expected = EXPECTED[name]
        if (expected === undefined) throw new Error(`${name} has no recorded ceiling`)
        const { dy, dx, oy, ox } = measure(target)
        expect(dy, `${name} dySpread widened`).toBeLessThanOrEqual(expected.dy + EPSILON)
        expect(dx, `${name} dxSpread widened`).toBeLessThanOrEqual(expected.dx + EPSILON)
        // OFFSET as well as spread. A drawing uniformly 100px left of abcjs's scores a
        // perfect spread and is still in the wrong place — `score-reorder-shared` sat at
        // dx 0.0 and ox -100.5 for two days because only spread was checked.
        expect(Math.abs(oy), `${name} y offset grew`).toBeLessThanOrEqual(
          Math.abs(expected.oy) + EPSILON,
        )
        expect(Math.abs(ox), `${name} x offset grew`).toBeLessThanOrEqual(
          Math.abs(expected.ox) + EPSILON,
        )
        // Improving is the goal, and an improvement must be RECORDED — otherwise the
        // ceiling drifts away from reality and stops meaning anything. Lower the number.
        expect(
          dy,
          `${name} dySpread improved to ${dy.toFixed(1)} — lower the ceiling`,
        ).toBeGreaterThan(expected.dy - 1)
        expect(
          dx,
          `${name} dxSpread improved to ${dx.toFixed(1)} — lower the ceiling`,
        ).toBeGreaterThan(expected.dx - 1)
      })
    }
  })

  // Machine-readable geometry summary for `npm run parity`, so the one axis that is NOT
  // at 100% stops being invisible. The MEDIAN notehead distance per fixture (weighted per
  // fixture, never pooled — see `fixtureMedianDistance`), and how many fixtures land
  // within 25 / 50 / 100px of abcjs. The corpus figure is the median of the per-fixture
  // medians, which is the number the checkpoint tracks.
  it('records its geometry for the parity tracker', () => {
    const perFixture = withGoldens
      .map((target) => ({ name: target.key, median: fixtureMedianDistance(target) }))
      .sort((a, b) => b.median - a.median)
    const within = (px: number) => perFixture.filter((f) => f.median <= px).length
    writeFileSync(
      '/tmp/abcts-parity-pixel.json',
      JSON.stringify({
        fixtures: perFixture.length,
        corpusMedian: median(perFixture.map((f) => f.median)),
        within25: within(25),
        within50: within(50),
        within100: within(100),
        worst: perFixture.slice(0, 6).map((f) => ({ name: f.name, median: +f.median.toFixed(1) })),
      }),
    )
    // A gate that writes numbers should also prove it can read real ones — the whole point
    // of the axis is that it is not yet at parity, so a zero here means it measured nothing.
    expect(perFixture.length).toBe(withGoldens.length)
    expect(perFixture.every((f) => Number.isFinite(f.median))).toBe(true)
  })

  /**
   * THE RANKED TABLE, the way `corpus-abcjs-ranked` writes one for the harvested corpus.
   *
   * The recorded ceilings above only ever say "no worse than", so reading them tells you
   * what a fixture was, not what it is. This measures all four axes fresh and writes them
   * sorted, largest first — which is the thing to open at the start of a session, and the
   * thing to diff between a session's first commit and its last.
   */
  /**
   * THE EIGHT `ox = 0.18` ROWS WERE NOT THE OUTLINE. THEY WERE THE WRONG NOTE.
   *
   * This block used to assert 0.18 on every one-notehead `G8` tune and explain that the
   * figure was irreducible: "abcjs's head inks 16.83px wide, Bravura's 15.03, and the two
   * are not left-aligned either. Positions are compared as bounding-box CENTRES, so two
   * differently shaped glyphs at the same origin score a difference no placement rule can
   * remove." Every clause of that was true and the conclusion was wrong.
   *
   * `G8` under `L:1/4` is TWO whole notes, and abcjs's `chartable.note[-durlog]` lands on
   * `noteheads.dbl` — a BREVE. We drew a semibreve. The 16.83 quoted as evidence is
   * `noteheads.dbl`'s own `w`, to the hundredth; nobody looked up whose glyph it was.
   *
   * A bounding-box centre cannot tell a wrong glyph from a differently shaped one, so
   * "measured, and not a defect" has to rule the first out before it is written down —
   * otherwise the row stops being read and the note becomes the reason it stays. Nine
   * tunes closed the moment the breve was drawn.
   *
   * Kept, and asserted at ZERO, because these are the corpus's only breves.
   */
  it('the one-notehead `G8` tunes draw a breve, exactly where abcjs draws one', () => {
    for (const key of [
      'clefs-tune0',
      'clefs-tune1',
      'clefs-tune2',
      'clefs-tune3',
      'clefs-tune4',
      'clefs-tune5',
      'clefs-tune6',
      'S6-keys-tune0',
    ]) {
      const target = withGoldens.find((t) => t.key === key)
      if (target === undefined) throw new Error(`${key} is not measured`)
      const { dx, ox, oy, goldenHeads } = measure(target)
      expect(goldenHeads, key).toBe(1)
      expect(dx, `${key} dx`).toBeLessThan(EPSILON)
      expect(Math.abs(ox), `${key} ox`).toBeLessThan(EPSILON)
      expect(Math.abs(oy), `${key} oy`).toBeLessThan(EPSILON)
    }
  })

  it('writes the ranked table', () => {
    const rows = withGoldens
      .map((target) => ({ key: target.key, ...measure(target) }))
      .map((r) => ({ ...r, worst: Math.max(r.dy, r.dx, Math.abs(r.oy), Math.abs(r.ox)) }))
      .sort((a, b) => b.worst - a.worst)
    const off = rows.filter((r) => r.worst >= EPSILON)
    writeFileSync(
      '/tmp/abcts-pixel-ranked.txt',
      `${off.length} of ${rows.length} tunes are off some axis by ${EPSILON}px or more\n${off
        .map(
          (r) =>
            `${r.worst.toFixed(2).padStart(9)}  dy=${r.dy.toFixed(2)} dx=${r.dx.toFixed(2)} ` +
            `oy=${r.oy.toFixed(2)} ox=${r.ox.toFixed(2)}  ${r.goldenHeads} heads  ${r.key}`,
        )
        .join('\n')}\n`,
    )
    // Same canary as everything else here: a table that can only ever come out empty is
    // not measuring. Every notehead COUNT, on the other hand, is a flat assertion.
    expect(rows.every((r) => r.ourHeads === r.goldenHeads)).toBe(true)
  })
})
