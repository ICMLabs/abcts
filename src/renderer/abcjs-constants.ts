/**
 * THE GOLDEN VARIABLES — every number that comes FROM abcjs, in one place.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `abcjs-strict` reproduces abcjs 6.6.3, so a large part of the renderer is not engraving
 * judgement at all: it is abcjs's own figures, transcribed. Those were spread across
 * `ENGRAVE`, `layout.ts`'s locals, `svg.ts` and `model.ts`, each written in the unit the
 * call site happened to want and each carrying its citation in a different comment. That
 * makes two things hard that this file makes easy:
 *
 *   1. **Auditing.** "Is this number abcjs's or ours?" is answerable by looking here.
 *      Anything NOT in this file is our own choice and may be changed on its merits;
 *      anything in it may only change if abcjs changes.
 *   2. **Units.** Every entry is stated in the unit ABCJS states it in, and converted at
 *      the point of use. That is not tidiness — it is correctness, and finding 69 is why:
 *      abcjs computes in PIXELS and PITCH, and doing its arithmetic in staff spaces gives
 *      a mathematically equal answer that is not the same double.
 *
 * ── THE UNITS, AND THEY ARE NOT INTERCHANGEABLE ──────────────────────────────
 * abcjs works in three:
 *
 *   PIXEL   its own device unit. A staff space is 7.75 of them.
 *   PITCH   `spacing.STEP` = 3.875px, half a staff space. The bottom staff line is pitch 2
 *           and the middle line is 6 — which is OUR step 0, hence `PITCH_ORIGIN`.
 *   RATIO   unitless — a scale, a fraction, a multiplier.
 *
 * Our renderer works in STAFF SPACES with the middle line at 0, so every figure here is
 * converted on the way out. The converters are single operations on purpose: `spaces(15)`
 * is exactly `15 / 7.75`, bit for bit, so moving a constant here can never move a pixel.
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
 * Our own engraving decisions — *Behind Bars* stem lengths, slur bulge, dot spacing, the
 * spacing curve, the fixed lanes — stay in `ENGRAVE`. They are ours to argue about. Mixing
 * them in would destroy the one property that makes this file worth having.
 *
 * The per-character WIDTH tables are in `golden-widths.ts` and the abcjs glyph metrics in
 * `glyphs-abcjs.ts`; both are generated, both are golden, and both are too large to sit
 * beside prose. They are re-exported from here so there is still one import to reach for.
 */

export {
  GOLDEN_GCHORD,
  GOLDEN_MEASURE,
  GOLDEN_PARTS,
  GOLDEN_REPEAT,
  GOLDEN_VOCAL,
} from './golden-widths.js'

// ─── Units ───────────────────────────────────────────────────────────────────

/**
 * One staff space in abcjs PIXELS. Its whole coordinate system is built on this.
 *
 * `glyphs-abcjs.ts` declares its own `ABCJS_STAFF_SPACE` with the same value — it is
 * GENERATED beside the glyph metrics it converts, and `scripts/gen-abcjs-glyphs.mjs`
 * writes both. That one is the generator's; this one is everything else's.
 */
export const STAFF_SPACE_PX = 7.75

/**
 * `spacing.STEP` — abcjs's PITCH unit, half a staff space (`helpers/spacing.js`).
 *
 * Exact in binary (7.75 / 2), so this and the literal `3.875` are the same double.
 */
export const STEP_PX = STAFF_SPACE_PX / 2

/**
 * abcjs counts PITCH from 2 at the bottom staff line; we count STEPS from 0 at the middle.
 * `step = pitch - 6`, and the two are otherwise the same unit.
 */
export const PITCH_ORIGIN = 6

/**
 * **THE LAYOUT'S LENGTH UNIT, IN abcjs PIXELS — AND IT IS ABOUT TO BECOME 1.**
 *
 * abcjs holds its own PIXELS end to end and so does `abcMusicKit` v1, whose byte parity
 * with abcjs is what settles this: `Spacing.STEP = 3.875`,
 * `calcY(pitch) = staffAbsoluteY - pitch * STEP`, and no second unit anywhere. We divide
 * every abcjs constant by 7.75 on the way in and multiply back on the way out, and the
 * two roundings do not cancel — `flagX = headX + headInk - spaces(flagStemInset)` emits
 * `57.840999999999994` where abcjs writes `57.841`, and the root's `height` is the same
 * defect on the vertical axis. That is the head AND the median of the byte table.
 *
 * The flip is one number. Everything denominated in staff SPACES is written `n * SPACE`
 * so that it survives it; a PITCH or STEP count is unit-free and is converted by
 * `spacesOfPitch` / `ENGRAVE.spacePerStep`, which carry the factor themselves. While this
 * is 7.75, `SPACE` is 1 and every expression below is bit-identical to what it replaced —
 * which is what makes the annotation pass verifiable on its own: NO BASELINE MAY MOVE.
 *
 * See `Docs/CHECKPOINT-2026-08-10c.md` §5.
 */
export const UNIT_PX = 1

/** One staff space, in layout units. 1 while the unit IS a staff space. */
export const SPACE = STAFF_SPACE_PX / UNIT_PX

/** abcjs PIXELS → the layout's length unit. */
export const spaces = (px: number): number => px / UNIT_PX

/** abcjs PIXELS → staff STEPS, which are its pitch unit — unit-free, so no `SPACE`. */
export const steps = (px: number): number => px / STEP_PX

/** abcjs PITCH → the layout's length unit. A pitch is half a staff space. */
export const spacesOfPitch = (pitch: number): number => pitch * (STEP_PX / UNIT_PX)

/** abcjs PITCH → our staff step. Same unit, different zero. */
export const stepOfPitch = (pitch: number): number => pitch - PITCH_ORIGIN

// ─── Constants abcjs states in PIXELS ────────────────────────────────────────

/**
 * Every figure abcjs writes as a PIXEL count, with the line it is written on.
 *
 * Converted with `spaces()` or `steps()` at the point of use — never pre-divided here, so
 * a reader can check the number against the source without doing arithmetic first.
 */
export const ABCJS_PX = {
  /**
   * `newDotShiftX = notehead.w + dotshiftx - 2 + 5 * dot` (`create-note-head.js:50`) — the
   * element's RIGHT room, computed whether or not the note is dotted, and what
   * `roomTakenRight` starts at when `addChord` places a `">"` annotation.
   */
  dotShiftInset: 2,
  dotShiftStep: 5,
  /**
   * `deltaX += (dir === 'down') ? -5 : 3` — how far off the notehead's centre a TREMOLO
   * slash sits, which side depending on which side of the head the stem is
   * (`creation/decoration.js:109`). An x, so abcjs PIXELS and not pitch.
   */
  tremoloDxUp: 3,
  tremoloDxDown: -5,
  /** `padding.left` for SCREEN media (`write/renderer.js:71`); print is 68. */
  paddingLeft: 15,
  /** `padding.top` / `.bottom`, screen (`write/renderer.js:69-72`). */
  paddingTop: 15,
  paddingBottom: 15,
  /**
   * And PRINT's own set (`write/renderer.js:69-72`) — 1cm top and bottom, 1.8cm either
   * side, both stated in the comment beside them as their pixel conversions.
   */
  printPaddingLeft: 68,
  printPaddingTop: 38,
  /**
   * `spacing.top` — the vertical space above a tune, spent by `TopText` ONLY in print
   * (`renderer.js:99`, `top-text.js:17-18`).
   */
  printTopSpace: 30.24,
  /**
   * The minimum page height in print: 11in at 72pt/in and 1.33px/pt
   * (`draw/set-paper-size.js:4-5`). It floors the SVG's own size and nothing inside it.
   */
  printMinHeight: 1056,
  /**
   * `minspacing` on every `AbsoluteElement` that is not a note — a bar, a clef, a key or
   * time signature (`abstract-engraver.js:959` and each `staff-extra`).
   */
  minSpacing: 10,
  /** …and a NOTE's, which is 1 and not 10 (`abstract-engraver.js:808`). */
  noteMinSpacing: 1,
  /**
   * **THE BASE SPACING, AND abcjs'S SPRING IS `spacing * Math.sqrt(duration * 8)`** —
   * `VoiceElement.getSpacingUnits` returns `sqrt(spacingduration * 8)` and
   * `layoutOneItem` spends `voice.nextx = x + spacing * units`
   * (`layout/voice-elements.js:22`, `:99`). 30px is the base, scaled by the
   * justification factor `calcHorizontalSpacing` solves.
   *
   * Ours computed `spacingScale * sqrt(d / (1/16))` with `spacingScale = 2.7372` — the
   * SAME LAW with the `sqrt(2)` folded into the constant and then ROUNDED TO FOUR
   * DECIMALS. `2.7372 * sqrt(16)` is 10.9488 against abcjs's `(30/7.75) * sqrt(8)` =
   * 10.948962…, a relative 1.5e-5 on EVERY note's spring — invisible to a 0.05px gate
   * and not invisible to a byte comparison, which is the whole reason it survived. A
   * PRE-DIVIDED, PRE-ROUNDED constant is exactly what `CHECKPOINT-2026-08-05b.md`'s
   * ruling is about: measuring is a compass, never a source of numbers.
   */
  spacingUnit: 30,
  /** `var dx = 5` — how far into its element a clef glyph sits (`create-clef.js:32`). */
  clefIndent: 5,
  /**
   * `this.startX = this.anchor2.x - 20` — "make a small arc" — the stub a tie or slur
   * arriving from the system above is drawn as (`tie-element.js:126-127`).
   */
  curveStub: 20,
  /** `grace.dx - 1` — how far LEFT of a grace head its ledger starts (`abstract-engraver.js:522`). */
  graceLedgerInset: 1,
  /**
   * `var width = params.w - 1` — the `lineEndX` a tie or an ending with no closing anchor
   * is drawn to, one inside the staff line's own end (`draw/voice.js:12`).
   */
  lineEndInset: 1,
  /** `getSymbolWidth(symbol) + 2` between key-signature accidentals (`create-key-signature.js:26`). */
  keySignatureGap: 2,
  /**
   * How far INSIDE the notehead's right edge an up-stem's FLAG hangs — `xdelta = headx +
   * notehead.w - 0.6` (`create-note-head.js:47`), against `headx` flat going down.
   *
   * Not the same figure as the stem's own centre, which is `w - 0.5`, and the difference
   * is not decorative: a flag's `x` feeds the element's ROD (`flagInk`), so hanging it off
   * the stem instead moved every notehead after it. `happy-birthday`'s dx spread went 0.17
   * to 0.18 on exactly that, which is how the two came to be told apart at all.
   *
   * `beam.js`'s `calcXPos` uses the same 0.6 for a beam's ends — see `layoutBeam`.
   */
  flagStemInset: 0.6,
  /**
   * How far a LONE auxiliary beam reaches from its note — `auxBeamEndX = x ± 5`
   * (`layout/beam.js:220-236`). A flat 5, whichever side it points; the stub's own START
   * is the note's sample point less `flagStemInset` going up, so an up-stem's stub spans
   * 4.4 rather than 5.
   */
  beamStub: 5,
  /** `getSymbolWidth(symb) * scale + 2` before an accidental (`create-note-head.js:95`). */
  accidentalGap: 2,
  /**
   * AN AUGMENTATION DOT'S OWN ARITHMETIC — `notehead.w + dotshiftx - 2 + 5 * dot`
   * (`create-note-head.js:50-53`), where `dot` counts DOWN from the number of dots. So the
   * first sits `w + 3` from the head's origin and each further one 5px past it.
   *
   * Verified against abcjs's own output: one dot lands at `headx + 12.81` and two at
   * `+12.81` and `+17.81`, exactly 5 apart, on a 9.81px notehead.
   */
  dotOffset: -2,
  dotSpacing: 5,
  /**
   * A BARLINE'S CURSOR, and it is five hardcoded numbers rather than one separation
   * (`abstract-engraver.js:985-1030`). abcjs walks left to right:
   *
   *     if (firstdots)  { dots at dx;              dx += 6 }
   *     if (firstthin)  { thin at dx }                        // no advance at all
   *     if (thick)      { dx += 4; thick at dx;    dx += 5 }
   *     if (secondthin) { dx += 3; thin at dx }
   *     if (seconddots) { dx += 3; dots at dx }
   *
   * Every rule is placed by its LEFT EDGE, so the gaps between them are asymmetric and
   * fall out of the arithmetic rather than being stated: thin→thick is `4 − 0.6 = 3.4`
   * and thick→thin is `5 + 3 − 4 = 4.0`. Those are the two figures the audit finding
   * recorded from the goldens, and this is where they come from.
   */
  barlineAfterDots: 6,
  barlineBeforeThick: 4,
  barlineAfterThick: 5,
  barlineBeforeSecondThin: 3,
  barlineBeforeSecondDots: 3,
  /**
   * The "notehead width" a BARLINE hands its decorations, which is not a width at all:
   * `createDecoration(voice, elem.decoration, 12, (thick) ? 3 : 1, abselem, 0, "down", 2, …)`
   * (`abstract-engraver.js:1002`). The mark is centred half of it right of the bar's own
   * origin — 1.5px on a repeat or a double, 0.5px on a plain one — wherever the bar's
   * rules actually reach. Passing the bar's DRAWN width instead put a coda 7.5px right.
   */
  barDecorationWidthThick: 3,
  barDecorationWidthThin: 1,
  /** A bar's own width plus its `minspacing`: nothing follows it closer than this. */
  barGap: 11,
  /** Clearance a barline leaves before the music resumes. */
  barClearance: 5,
  /**
   * A barline rule's DECLARED width — its `RelativeElement` `w`, which is not what it
   * paints. `new RelativeElement(null, dx, 1, 2, {linewidth: 0.6})` for a thin and
   * `(null, dx, 4, 2, {linewidth: 4})` for a thick (`abstract-engraver.js:990`, `:1006`),
   * so only the thick pair agree. Read by a repeat ending, which opens at the anchor's
   * RIGHT edge — `anchor1.x + anchor1.w` — and so needs the declared one.
   */
  barAnchorThin: 1,
  barAnchorThick: 4,
  /** Drawn widths per barline shape, measured off abcjs's own output. */
  barWidthThin: 1,
  barWidthDouble: 4,
  /**
   * `[|` — `bar_thick_thin`, which walks the cursor `dx += 4; thick(w 4); dx += 5` and
   * then `dx += 3; thin(w 1)`, so its declared width is `max(4 + 4, 12 + 1) = 13`. Probed:
   * abcjs reports the element at `w = 13` with children `bar@4/w4, bar@12/w1`.
   */
  barWidthThickThin: 13,
  barWidthFinal: 8,
  barWidthRepeatStart: 16,
  barWidthRepeatEnd: 14,
  barWidthRepeatBoth: 22,
  /** `renderer.spacing.stemHeight` — 26.67 + 10, the BEAMED stem (`write/renderer.js:107`). */
  beamStemHeight: 36.67,
  /**
   * A REPEAT ENDING's bracket, all four figures from `drawEnding` (`draw/ending.js:8-46`)
   * and every one confirmed against the `S4-bars-repeats` golden's own markup.
   *
   * The hook is `height = 20`, a flat pixel count that does not scale with anything:
   * the golden's `|1` bracket runs `M 257.37 170.51 L 257.37 190.51`. Ours was
   * `voltaHook: 1.4` staff spaces — 10.85px, very nearly half.
   *
   * The label sits `linestartx + 5` across and on the baseline `calcY(pitch - 0.5)` plus
   * one font height, which is 18.94px below the bracket: the golden's text is at
   * `x="262.37" y="189.45"` against a bracket at 257.37 / 170.51. It is drawn in
   * `repeatfont` — 13pt, so `round(13 * 4/3)` = 17px, and the golden says `font-size="17"`
   * in as many words. Ours drew it at `voltaTextSize: 1.3` spaces, 10.07px.
   *
   * The rules themselves carry NO `stroke-width`, so they are the SVG default of 1px.
   * Ours used the thin barline's 0.6 — the right weight for a different line.
   */
  voltaHook: 20,
  /**
   * A TRIPLET BRACKET's end hooks — `bracketHeight = up ? 5 : -5`
   * (`draw/triplet.js:24`), a flat pixel count like the volta's 20 beside it.
   */
  tupletHook: 5,
  /**
   * The GAP a triplet's broken bracket leaves for its number — `gapWidth = 8`, each side
   * of the bracket's MIDPOINT (`draw/triplet.js:35`).
   *
   * FIXED, and that is the difference that matters: abcjs breaks the same gap for `13` as
   * for `3`, where ours was `width / 2 + tupletNumberGap` and moved with the number.
   */
  tupletNumberGap: 8,
  /** A HAIRPIN's full mouth at the open end — `height = 8` (`draw/crescendo.js:10`). */
  hairpinMouth: 8,
  /**
   * `var y = renderer.calcY(params.pitch) + 4` — "the top pixel to use (it is offset a
   * little so that it looks good with the volume marks)" (`draw/crescendo.js:7`).
   */
  hairpinOffset: 4,
  /** `renderText`'s `x: linestartx + 5` (`draw/ending.js:41`). */
  voltaTextIndent: 5,
  /**
   * A STROKED PATH THAT DECLARES NO `stroke-width`, so it paints at SVG's default of 1.
   *
   * abcjs's `printPath` passes `stroke` and never a width (`draw/print-path.js`), so every
   * rule it draws that way is exactly 1px: a repeat ending's bracket and hooks
   * (`draw/ending.js:46`), a triplet's bracket (`draw/triplet.js:42`), a hairpin's two
   * lines (`draw/crescendo.js:34`). One figure, three constructions, and it is not
   * ANYBODY'S engraving judgement — it is the absence of an attribute.
   */
  strokedPathRule: 1,
  /** The rule a boxed font draws round its text. */
  fontBoxRule: 1,
  /** A tempo mark's descender bump, measured off its own output. */
  tempoDescenderBump: 2,
  /** Gap between a tempo's beat-unit note and its `=` (`draw/tempo.js`). */
  tempoNoteGap: 5,
  /** `spacing.vocal` — the lyric baseline's clearance from the staff's ink. */
  lyricInkGap: 17,
  /** A group connector's indent — `getWidth()` is a flat 10 for a brace and a bracket. */
  connectorIndent: 10,
  /** `roomTaken += chordWidth + 7` for a LEFT annotation (`add-chord.js:52`). */
  leftAnnotationGap: 7,
  /** `roomTakenRight += 4`, and the same 4 again on the width (`add-chord.js:63-70`). */
  rightAnnotationGap: 4,
  /** `roomtaken += 10` per grace note (`abstract-engraver.js:481`). */
  graceAdvance: 10,
  /** …and `+= 7` more when that grace carries an accidental (`:484-486`). */
  graceAccidentalRoom: 7,
  /** `spacing.title` (`write/renderer.js:94-113`). */
  titleSpace: 7.56,
  /** `spacing.subtitle`. */
  subtitleSpace: 3.78,
  /** `spacing.composer`. */
  composerSpace: 7.56,
  /** `spacing.music` — top text to the first staff. */
  musicSpace: 7.56,
  /** Measured: the gap a bottom free-text block leaves. */
  freeTextBelowSpace: 36.85,
  /** `spacing.staffSeparation` — the MINIMUM between two systems (`write/renderer.js:112`). */
  systemSeparation: 61.33,
  /** `spacing.systemStaffSeparation` — the minimum between staves of one system. */
  staffSeparation: 48,
  /** `staffwidthScreen` — the music area, not the SVG (`write/renderer.js`). */
  systemWidth: 700,
  /**
   * The gap above the BOTTOM text block. `draw()` spends it bare, with abcjs's own comment
   * beside it: "TODO-PER: Empirically discovered. What variable should this be?"
   * (`draw/draw.js:66`).
   */
  bottomTextGap: 24,
} as const

/**
 * LINE WEIGHTS — abcjs's, in PIXELS, and the reason this section exists.
 *
 * `abcjs-strict` HAS NO LATITUDE: it exists to reproduce abcjs byte for byte, so every
 * figure it draws with must be abcjs's. Bravura is authorised as a glyph OUTLINE source
 * for `abcjs-extended` and, before the split, for strict too — but it was NEVER
 * authorised for strict, and its `ENGRAVING_DEFAULTS` (line thicknesses, extensions,
 * separations) went on being read there at 21 sites with no `strict` gate at all. That is
 * the audit finding of 2026-08-05, and these are its numbers.
 *
 * MEASURED off abcjs's own goldens rather than read out of its source, because a
 * `linewidth` is a `dx` handed to `printStem` and the emitted quad is the ground truth:
 *
 *   staff line   `simple-c.svg`  77.9 - 77.2                    = 0.700
 *   ledger       `simple-c.svg`  116.65 - 115.95                = 0.700
 *   ledger width `simple-c.svg`  82.66 - 68.85 = 13.81, which is `symbolWidth + 4` on a
 *                9.81 notehead with `dx = -2` — so 2px of overhang EACH SIDE
 *   stem         `simple-c.svg`  80.66 - 79.66                  = 1.000
 *   thin bar     `S4-bars-repeats-tune0.svg`                    = 0.600
 *   thick bar    same                                           = 4.000
 *
 * The BEAM is the one that already agreed: `calcDy` returns `spacing.STEP`, which is
 * 3.875px, and Bravura's 0.5 staff spaces is the same number. A coincidence, and the only
 * one of the seven.
 */
export const ABCJS_LINE_PX = {
  /** `printStaff(…, dy = 0.35)` + `lineThickness` 0, so 0.35 either side. */
  staffLine: 0.7,
  /**
   * The rule down the LEFT EDGE of a staff group of more than one staff —
   * `printStem(renderer, params.startx, 0.6, topLine, bottomLine, null)`
   * (`draw/staff-group.js:143`). A `printStem` width, so it is the whole rule and not a
   * half-thickness.
   */
  staffConnector: 0.6,
  /** `printStaffLine(…, 0.35 + lineThickness)` for a ledger too (`draw/relative.js:66`). */
  ledgerLine: 0.7,
  /**
   * How far a ledger overhangs its notehead EACH SIDE. `ledgerLines` builds
   * `RelativeElement(null, ofs + dx, (symbolWidth + 4) * scale, …)` with `dx = -2`
   * (`abstract-engraver.js:462`, called at `:849` with `-2, 1`) — 2px left, 2px right.
   */
  ledgerExtension: 2,
  /** `var width = (dir === "down") ? 1 : -1` (`abstract-engraver.js:748`). */
  stem: 1,
  /**
   * …and a BEAMED stem is a different figure: `lineWidth = (asc) ? -0.6 : 0.6`
   * (`layout/beam.js:122`). A beamed note's stem is not the unbeamed one retargeted — it is
   * built from scratch in `createStems`, thinner, and hung at `w - 0.3` / `+0.3` rather than
   * `w - 0.5` / `+0.5`. `line-weights.test.ts` could not see it: its only fixture was
   * `simple-c`, which has no beams.
   */
  beamedStem: 0.6,
  /** `linewidth: 0.6` (`abstract-engraver.js:992`). */
  thinBarline: 0.6,
  /** `linewidth: 4` (`abstract-engraver.js:1007`). */
  thickBarline: 4,
  /** `calcDy` returns `spacing.STEP` for a full-size beam (`layout/beam.js:66-70`). */
  beam: STEP_PX,
} as const

/**
 * `drawArc`'s figures — the SHAPE of a slur or tie (`draw/tie.js:57-102`).
 *
 * Separate from `ABCJS_PX` because they are not lengths on the page: they are terms in a
 * construction along the chord's unit vector, and only mean anything together.
 */
export const ABCJS_ARC = {
  /** `flatten = norm / 3.5` — where the control points sit ALONG the chord. */
  flattenDivisor: 3.5,
  /** `Math.max(4, flatten)` — the bulge never goes below this. */
  minBulge: 4,
  /** `maxFlatten` for a TIE, which abcjs draws shallower than a slur. */
  tieMaxBulge: 10,
  /** …and for a SLUR. */
  slurMaxBulge: 25,
  /**
   * `var thickness = 2` — flat, everywhere along the arc.
   *
   * abcjs has NO endpoint-versus-midpoint notion: its arc comes to a point at both ends
   * because the path returns through the same `x1,y1` it started from, and is 2px wide
   * between. Bravura's four `slur*`/`tie*` thicknesses are not wrong numbers, they are a
   * different MODEL, which is why the audit finding could not port them one for one.
   */
  thickness: 2,
  /**
   * THE ENDPOINTS, which finding 89 ported the SHAPE without.
   *
   * `x1 = roundNumber(x1 + 6)` and `x2 = roundNumber(x2 + 4)` (`draw/tie.js:60-61`) —
   * asymmetric, and stated from the ANCHOR's own x rather than from its ink. `calcX` sets
   * `startX = anchor1.x` and `endX = anchor2.x` (`tie-element.js:118-140`), and an
   * anchor is the notehead's `RelativeElement`, so its x is the head's left edge.
   */
  /**
   * A GRACE ANCHOR PULLS ITS END BACK 3px, and it is the only thing `calcX` special-cases:
   * `if (this.anchor1.scalex < 1) this.startX -= 3` — "this is a grace note, don't offset
   * the tie as much" (`tie-element.js:120-122`). It composes with `startOffset`, so a
   * grace slur springs 3px right of the grace head where an ordinary one springs 6.
   */
  graceStartInset: 3,
  startOffset: 6,
  endOffset: 4,
  /**
   * …and the LIFT off the anchor's pitch: `spacing = isTie ? 1.2 : 1.5`, applied as
   * `pitch ± spacing` by `above` (`draw/tie.js:58, 62-63`). In PITCH, off the notehead's
   * own pitch — NOT a clearance measured from the ink box, which is what ours was.
   */
  tieLift: 1.2,
  slurLift: 1.5,
} as const

// ─── Constants abcjs states in PITCH ─────────────────────────────────────────

/**
 * Every figure abcjs writes in PITCH — its `spacing.STEP` unit, half a staff space.
 *
 * These are the ones a reader is most likely to mistake for staff spaces, which is half
 * the reason they are grouped: `chordHeightAbove` is 4.78 PITCH, 2.39 spaces, 18.52px.
 */
export const ABCJS_PITCH = {
  /** `Decoration.minTop` — the floor an ornament stack starts from (`decoration.js:13`). */
  decorationMinTop: 12,
  /**
   * `restpitch` — where a rest sits, and where it reserves from
   * (`abstract-engraver.js:544-551`). The default is the space above the middle line; a
   * voice SHARING a staff moves four pitch either way, up or down with its stems.
   */
  restPitch: 7,
  restPitchUp: 11,
  restPitchDown: 3,
  /** `Decoration.minBottom` — the same on the other side (`decoration.js:14`). */
  decorationMinBottom: 0,
  /**
   * WHAT A BEAMED NOTE'S DOWN-STEM IS WORTH TO A DECORATION BEFORE IT EXISTS.
   *
   * `createBeam` passes `nostem`, so a beamed note builds no stem child and its
   * `abselem.bottom` is the heads alone. abcjs guesses the rest in one line —
   * `var bottom = nostem && dir !== 'up' ? Math.min(-3, abselem.bottom - 6) : abselem.bottom`
   * (`abstract-engraver.js:841`) — a flat 6-pitch drop, floored at pitch −3. Neither
   * figure is the stem's real end, and there is no matching term on the ABOVE side.
   */
  beamedDecorationDrop: 6,
  beamedDecorationFloor: -3,
  /** `symbolHeightInPitches(symbol) + 1` — the 1 is "a little padding" (`decoration.js:160`). */
  decorationPadding: 1,
  /**
   * `padding` in `moveDecorations` — "the vertical padding between elements, in pitches"
   * (`layout/voice.js:31`). How far clear of the BEAM an above-ornament is pushed once the
   * beam it would have been drawn through is known.
   */
  ornamentBeamPadding: 1.5,
  /** `textFudge` in `textDecoration` (`decoration.js:148`). */
  decorationTextFudge: 2,
  /**
   * How far each ADDITIONAL beam sits from the one before — `sy = (asc) ? -1.5 : 1.5` and
   * `y = bary + sy * (index + 1)` (`layout/beam.js:180-186`). A step between CENTRES, not
   * a gap between edges, which is the whole reason it is stated here rather than as a
   * thickness plus a spacing.
   *
   * Bravura's `beamThickness + beamSpacing` is `0.5 + 0.25 = 0.75` staff spaces, which is
   * 1.5 pitch EXACTLY — so this constant changes no pixel and its baseline diff is zero
   * lines. That is the point: the number was already right by coincidence, the way
   * `calcDy` returning `STEP` makes Bravura's beam thickness right by coincidence, and a
   * coincidence is not a citation. Strict now says what abcjs says.
   */
  beamStep: 1.5,
  /** `textHeight` — what a text decoration advances the stack by (`decoration.js:149`). */
  decorationTextHeight: 5,
  /** `thickness: 3` — a text decoration's DECLARED box (`decoration.js:151`). */
  decorationTextThickness: 3,
  /** `margin = 1` — one pitch between every lane (`set-upper-and-lower-elements.js:102`). */
  laneMargin: 1,
  /**
   * **A `RelativeElement` WITH NO MEASURED HEIGHT IS FOUR PITCH** —
   * `this.height = opt.height ? opt.height : 4` (`relative-element.js:36`), whose own
   * comment is "the +1 is to give a little bit of padding". It reaches the page through
   * a LYRIC: `addLyric` passes `lyricDim.height / STEP`, and a held syllable's
   * `lyricStr` is `"\n"` — whitespace, which `getTextSize` answers 0 for — so the
   * default binds wherever the sung syllable measures under 4 pitch.
   */
  lyricEmptyLane: 4,
  /**
   * The five-line staff's outer lines, in abcjs's pitch — `renderer.calcY(10)` for the top
   * and `calcY(linePitch)` for the bottom, `linePitch` being 2 on a five-line staff
   * (`draw/staff-group.js:86-96`). Read by the rule that closes a multi-staff group.
   */
  topLine: 10,
  bottomLine: 2,
  /**
   * An UNBEAMED stem's length — `Math.round(70 * this.voiceScale) / 10`
   * (`abstract-engraver.js:740`), so 7 at the default scale, measured from the note's own
   * pitch rather than run up from a base. NOT the beamed one, which comes from
   * `renderer.spacing.stemHeight` and is 9.5 — see `ENGRAVE.beamStemHeight`.
   *
   * Lance's worked example for the whole triage: `stemLength: 3.5` staff spaces IS this 7,
   * the same number with no citation and therefore nothing to catch it drifting.
   */
  stemLength: 7,
  /**
   * `pos = gracenote.verticalPos + 7 * gracescale` — where the ACCIACCATURA slash sits,
   * "the same formula that determines the flag position" (`abstract-engraver.js:502-503`).
   * A PITCH, scaled by the grace scale at the site.
   */
  graceStemReach: 7,
  /**
   * `highestVert += 6` — what a stem-up note shorter than a whole adds for the sake of
   * placing a SLUR, which is not its stem's real length (`abstract-engraver.js:700`).
   */
  slurStemCompensation: 6,
  /**
   * `volumeHeightBelow` and `dynamicHeightBelow`, both 6 (`dynamic-decoration.js:8`,
   * `crescendo-element.js:11`). A staff with both reserves `max(...) + margin` in one go
   * (`set-upper-and-lower-elements.js:66`), which is why this is one figure and not two.
   */
  dynamicLane: 6,
  /** `chordHeightAbove`, from the 16px `gchordfont`'s measured height of 18.52px. */
  chordHeightAbove: 4.779354838709677,
  /** `partHeightAbove`, from the 20px `partsfont`'s 22.16px. */
  partHeightAbove: 5.718709677419355,
  /** `tempoHeightAbove` — the tempo lane. */
  tempoHeightAbove: 6,
  /**
   * How far below the tempo rung its NOTEHEAD sits — `element.pitch -
   * totalHeightInPitches + 1` with `totalHeightInPitches = 6`
   * (`set-upper-and-lower-elements.js:209`, `tempo-element.js:14`). Instrumented on
   * `synth-flattener-25`: rung 20.79664516129032, head offset 15.796645161290321.
   */
  tempoNoteDrop: 5,
  /** `endingHeightAbove` for a VOLTA (`ending-element.js:8`). */
  voltaLane: 5,
  /** …and for a TUPLET, which shares the field (`triplet-element.js:25`). */
  tupletLane: 4,
  /**
   * How far BELOW `yTextPos` the triplet's number is drawn — `calcY(params.yTextPos - 1)`,
   * carrying abcjs's own "HACK: adjust the position of '3'. It is too high in all cases so
   * we fudge it by subtracting 1 here" (`draw/triplet.js:11`).
   *
   * And it is the BASELINE, not a top: `renderText` adds `font.size` to `y` only when
   * `centerVertically` is FALSE (`draw/text.js:30-31`), and the triplet number passes it
   * true. So there is no font height to add, which is what made ours a heuristic.
   */
  tupletTextDrop: 1,
  /**
   * A BEAMED triplet's number sits clear of the beam — `yTextPos += isAbove(beam) ? 3 : -2`
   * (`layout/triplet.js:17`), with abcjs's own "This creates some space between the beam
   * and the number" beside it. Asymmetric, like the barline cursor's five numbers.
   *
   * An UNBEAMED one takes no such term: `yTextPos = startNote + (endNote - startNote) / 2`
   * (`:74`), the plain midpoint, which is what we already had.
   *
   * NOT WIRED UP, and recorded here rather than applied. Adding it moved one number of six
   * and by the wrong amount, which says our `yTextPos` differs from abcjs's by more than
   * this term: abcjs measures `heightAtMidpoint(left, anchor2.x, beam)` — the beam's height
   * at the midpoint, with `left` itself shifted by `anchor1.w` when the beam is above —
   * where we take the beam's own y. The whole beamed branch has to be ported together.
   */
  tupletBeamClearAbove: 3,
  tupletBeamClearBelow: 2,
  /**
   * What an ending lane costs when the staff ALSO has a chord lane — a flat 2, margin
   * included, and a different BRANCH rather than a scaling
   * (`set-upper-and-lower-elements.js:33-38`).
   */
  endingOverChordLane: 2,
  /**
   * How far BELOW the lane's top the bracket is actually drawn.
   *
   * `element.pitch = positionY.endingHeightAbove - 2`
   * (`set-upper-and-lower-elements.js:201`). The reserve and the drawing are NOT the same
   * point, which is easy to miss because every other lane in that file draws AT the top it
   * reserved — `positionY.chordHeightAbove`, `partHeightAbove` and `tempoHeightAbove` are
   * all handed straight to their elements, and only the ending subtracts.
   *
   * MEASURED BEFORE IT WAS BELIEVED, which is the only reason it was found: reserving
   * `voltaLane + laneMargin` and drawing at the result put the bracket 7.75px — exactly 2
   * pitch — above abcjs's on `S4-bars-repeats`, whose golden draws it at pitch 17.724
   * against a dumped `staff.top` of 13.7244 and an `endingHeightAbove` of 5. 13.724 + 5 + 1
   * − 2 = 17.724, and no other reading of those four numbers gives it.
   */
  endingDrawDrop: 2,
  /**
   * A group BRACKET's stem — `xLineWidth = spacing.STEP * 0.75` (`draw/brace.js:20`), so
   * 0.75 PITCH, which is 0.375 staff spaces. Ours was a flat 0.5 spaces.
   *
   * A LINE WEIGHT REACHABLE IN STRICT, which is the audit finding's own class — and one
   * no gate could see, because a bracket had no class and no `data-name` in our output
   * until finding 92.
   */
  bracketRule: 0.75,
  /** `vert` in `addMeasureNumber` on a barline (`abstract-engraver.js:952`). */
  barNumberPitch: 11,
  /**
   * …AND 13.5 INSTEAD, on a TREBLE CLEF carrying a number wider than 10px:
   *
   *     var vert = measureNumDim.width > 10 && abselem.abcelem.type === "treble" ? 13.5 : 11
   *
   * (`abstract-engraver.js:955`, under abcjs's own comment "Change 13 to 13.5 since
   * previously bar numbers were very slightly overlapping the top of the clef".) Only
   * `%%barnumbers 0` can reach it — every other setting puts the number on a BARLINE, and
   * a barline is never a clef.
   */
  barNumberClefPitch: 13.5,
  /** The width above which that branch takes the taller of the two. */
  barNumberClefWide: 10,
  /** A `RelativeElement`'s default `height` when nothing declares one (`relative-element.js:37`). */
  relativeElementHeight: 4,
  /**
   * `symbolHeightInPitches("noteheads.quarter")` — a notehead's DECLARED box, and NOT the
   * 2 it looks like. The 0.0888 shows up in every one of abcjs's own numbers.
   */
  noteheadHeight: 2.088774193548387,
  /** Two accidentals this far apart in pitch share a column (`create-note-head.js:87`). */
  accidentalColumnPitch: 6,
  /** A decoration written before a BARLINE attaches at this fixed pitch (`abstract-engraver.js:1002`). */
  barDecorationPitch: 12,
  /**
   * **`RelativeElement`'s DEFAULT `height`, WHICH A `debug` ELEMENT SPENDS AS A CHORD
   * LANE** — `this.height = opt.height ? opt.height : 4` and then
   * `case "debug": this.chordHeightAbove = this.height` (`relative-element.js:37, 54-56`).
   * Reached by exactly one thing: a note whose `chartable.note[-durlog]` lookup failed,
   * which abcjs marks with `new RelativeElement("pitch is undefined", 0, 0, 0,
   * {type: "debug"})` (`create-note-head.js:24-25`).
   */
  debugChordHeight: 4,
} as const

// ─── Unitless ratios and counts ──────────────────────────────────────────────

/** Every abcjs figure that is a scale, a fraction or a multiplier. */
export const ABCJS_RATIO = {
  /**
   * The CSS scale a print render is drawn at when neither the host nor `%%scale` names one
   * (`engraver-controller.js:216`). Everything that must NOT shrink with it — the four
   * page margins, the music width, the header and footer font sizes — is divided by it
   * first (`:124-126`, `renderer.js:78-86`).
   */
  printScale: 0.75,
  /** `fontboxpadding` — the fraction of the font size a boxed font pads by, per side. */
  fontBoxPadding: 0.1,
  /** `size.height * 1.1` — what a top-text row advances by (`add-text-if.js:26`). */
  lineSkip: 1.1,
  /** `dy="1.2em"` between the lines of one `<text>` (`svg.js:196`). */
  textLineStep: 1.2,
  /**
   * ONE LANE TO THE NEXT above or below the staff, as a multiple of the item's OWN font
   * size — `draw/text.js:13-15` offsets each lane down from the top of the block by
   * `fontSize * 1.25`, so the item packed FIRST is drawn highest.
   *
   * MEASURED, because the source alone cannot discriminate it: at abcjs's 16px annotation
   * font, `fontSize * 1.25` and `round(height * 1.1)` both give exactly 20, and ours was
   * the flat 20. `stacked-annotations`' golden settles which by SHAPE rather than by
   * value — `"^Allegro""^con brio"` draws at y 79.12 and 99.12, and `"_p""_dolce"` at
   * 177.26 and 197.26, first-written topmost on both sides.
   *
   * It is a RATIO and not a constant, which is the whole point: `%%annotationfont` and
   * `%%gchordfont` change the size, and a flat 20 cannot follow.
   */
  laneLineStep: 1.25,
  /** The height ratio a `%%vocalfont` verse steps by. */
  textHeight: 1.108,
  /** `stretchlast`'s default: justify a last line already 66% full (`layout/layout.js:102`). */
  lastSystemFill: 0.66,
  /** `gracescale` (`abstract-engraver.js:467`). */
  graceScale: 3 / 5,
  /** `graceScaleStem`, "empirically found" (`abstract-engraver.js:468`). */
  graceStemScale: 3.5 / 5,
  /** `calcDy` scales a GRACE beam to this — `dy = dy * 0.4` (`layout/beam.js:70`). */
  graceBeamScale: 0.4,
  /**
   * How much closer together a GRACE group's beams stack — `if (isGrace) sy = sy * 2 / 3`,
   * "this makes the second beam on grace notes closer to the first one"
   * (`layout/beam.js:181`). `sy` is the ±1.5 PITCH step an ordinary group takes.
   */
  graceBeamStepScale: 2 / 3,
  /** The octave marker's scale on a `clef=treble-8` (`create-clef.js:39`). */
  octaveMarkerScale: 2 / 3,
  /** A tempo's beat-unit note is drawn at this fraction. */
  tempoNoteScale: 0.75,
  /** `pt -> px` is `Math.round(size * 4 / 3)` (`get-font-and-attr.js:29`). */
  pointsToPixelsNumerator: 4,
  pointsToPixelsDenominator: 3,
} as const

/** `Math.round(pt * 4 / 3)` — abcjs's ONE point-to-pixel conversion (`get-font-and-attr.js:29`). */
export const fontPixels = (points: number): number =>
  Math.round((points * ABCJS_RATIO.pointsToPixelsNumerator) / ABCJS_RATIO.pointsToPixelsDenominator)

// ─── The golden generator's text HEIGHTS ─────────────────────────────────────

/**
 * `fontHeights` in `dump-svg.js:50-58` — what the generator's patched `getBBox` returns.
 *
 * SEVEN entries, and they are the seven sizes abcjs's font DEFAULTS resolve to, so a tune
 * that sets no font only ever reaches them. Anything else falls back to `size + 2`
 * (`dump-svg.js:105`), which is why `%%gchordfont Arial 80` reserves 109 and not 107.
 *
 * These are the GENERATOR's numbers rather than abcjs's own, like the width tables beside
 * them — and they are the parity target for the same reason: byte parity with the goldens
 * is what `abcjs-strict` means.
 */
export const GOLDEN_TEXT_HEIGHTS: Readonly<Record<number, number>> = {
  15: 17.5,
  16: 18.52,
  17: 18.84,
  19: 21.06,
  20: 22.16,
  21: 23.27,
  27: 29.91,
}

/** A text's height as the generator measures it, in layout units. */
export const goldenTextHeight = (sizeInLayoutUnits: number): number => {
  const px = sizeInLayoutUnits * UNIT_PX
  return spaces(GOLDEN_TEXT_HEIGHTS[Math.round(px)] ?? px + 2)
}

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * `clefOffsets` — the `ofs` in a clef's declared box, in PITCH (`create-clef.js:62-70`).
 *
 * `top = symbolHeightInPitches(clef) + clefPos + ofs`, `bottom = clefPos + ofs`. Keyed by
 * our `ClefShape` rather than abcjs's glyph name; `none` draws nothing and takes 0.
 */
export const ABCJS_CLEF_OFFSET_PITCH: Readonly<Record<string, number>> = {
  G: -5,
  C: -4,
  F: -4,
  percussion: -2,
  none: 0,
}

/**
 * The per-accidental fudge in a key signature's declared box, in PITCH
 * (`create-key-signature.js:17-23`): a sharp's box starts 3 BELOW its line, a flat's 1.2.
 */
export const ABCJS_KEY_ACCIDENTAL_FUDGE_PITCH: Readonly<Record<string, number>> = {
  accidentalSharp: -3,
  accidentalFlat: -1.2,
  accidentalNatural: 0,
  // The QUARTER TONES, which a `K:` may write — `K: C ^/f _/B` is legal and abcjs draws
  // both (`accidentals.halfsharp` and `accidentals.halfflat` appear in its own output).
  // Missing here they fell to the `?? 0` default, and a fudge of 0 against the half
  // sharp's -2.5 is 2.5 pitch of staff nobody asked for: `synth-flattener-32` was 5.74px
  // on these two entries and NOTHING else, its every other axis already at zero.
  accidentalQuarterToneSharpStein: -2.5,
  accidentalQuarterToneFlatStein: -1.2,
}

/**
 * `pitchMap` in `synth/pitches-to-perc.js:1-70`, by VERTICAL POSITION.
 *
 * Seventeen entries and no more, so a pitch outside `C`..`e'` has no `%%percmap` key at
 * all. The accidental prefix is the other half of the key; both double accidentals begin
 * `d` in abcjs's spelling, which is in neither table, so they have no key either.
 */
export const ABCJS_PERC_NOTE_NAMES: readonly string[] = [
  'C',
  'D',
  'E',
  'F',
  'G',
  'A',
  'B',
  'c',
  'd',
  'e',
  'f',
  'g',
  'a',
  'b',
  "c'",
  "d'",
  "e'",
]

/**
 * abcjs's own font defaults, in POINTS (`abc_parse_directive.js:21-42`).
 *
 * RE-EXPORTED, not copied: a font size defaults to these at PARSE time, so the canonical
 * table has to live in the core model where the parser can reach it — core must not import
 * from the renderer. It is listed here because it is a golden variable and this is where a
 * reader will look for it, and re-exporting is how it stays one table rather than two.
 *
 * The eighteen land on exactly SEVEN distinct pixel sizes once `fontPixels` has had them,
 * which is why `GOLDEN_TEXT_HEIGHTS` has seven entries and covers every tune that sets no
 * font of its own.
 */
export { ABC_FONT_DEFAULT_PT as ABCJS_FONT_DEFAULT_PT } from '../core/model.js'

/**
 * `getYCorr` — the pitch abcjs shifts a glyph by at DRAW TIME, and nowhere else.
 *
 *     ycorr = glyphs.getYCorr(symbol);
 *     el = glyphs.printSymbol(x + dx, renderer.calcY(offset + ycorr), s, …);
 *
 * (`draw/print-symbol.js:22` and `:33`; the table is `creation/glyphs.js:174-219`.) It is
 * a per-glyph ALIGNMENT fix-up for abcjs's own font — the outlines are not all authored
 * against the same baseline — and it never touches a reserve: `RelativeElement` takes its
 * `top`/`bottom` from the uncorrected pitch, so a staff's extent is the same either way.
 * Which is exactly why nothing could see this: the pixel gate compares NOTEHEADS, whose
 * correction is 0, and every gate that compares an extent is looking at a number the
 * correction never enters.
 *
 * Measured on one control per glyph, single mark per tune so nothing stacks — the
 * agreement is to the hundredth of a pixel on all ten:
 *
 *     scripts.ufermata  -1     scripts.trill    -2     flags.u32nd  +1     '3' / '4'  -2
 *     scripts.dfermata  +1     scripts.upbow    -2     flags.d32nd  -1
 *     scripts.roll      -1     scripts.downbow  -2     flags.u64th  +3
 *                                                      flags.d64th  -2
 *
 * THE REST ROWS ARE DELIBERATELY ABSENT, and it is not an oversight. `restGlyph` returns
 * abcjs's DRAWN pitch rather than its anchor — `restpitch` 7 plus the correction, folded
 * into one step — and the augmentation dots hang off that same step. Measured on a dotted
 * control: `dots.dot` 11.61, `rests.half` 13.16, `rests.quarter` 14.36, ours identical to
 * the hundredth. Adding the rows here would move both by a pitch. The same goes for
 * `rests.multimeasure`, whose correction is 0 anyway.
 *
 * Nor is `timesig.common` / `timesig.cut` listed: abcjs returns 0 for both, which is what
 * an absent key already means.
 */
export const ABCJS_YCORR: Readonly<Record<string, number>> = {
  '0': -2,
  '1': -2,
  '2': -2,
  '3': -2,
  '4': -2,
  '5': -2,
  '6': -2,
  '7': -2,
  '8': -2,
  '9': -2,
  '+': -2,
  'flags.d32nd': -1,
  'flags.d64th': -2,
  'flags.u32nd': 1,
  'flags.u64th': 3,
  f: -4,
  m: -4,
  p: -4,
  s: -4,
  z: -4,
  'scripts.trill': -2,
  'scripts.upbow': -2,
  'scripts.downbow': -2,
  'scripts.ufermata': -1,
  'scripts.wedge': -1,
  'scripts.roll': -1,
  'scripts.shortphrase': -1,
  'scripts.longphrase': -1,
  'scripts.dfermata': 1,
}

/**
 * abcjs's DEFAULT font face per `%%…font` type (`parse/abc_parse_directive.js:22-44`).
 *
 * The quotes are abcjs's own — it stores `"\"Times New Roman\""` and writes the face
 * straight into the attribute, where the serializer strips the inner quotes. `tripletfont`
 * is plain `Times` and NOT `Times New Roman`, which is a difference the goldens show.
 */
export const ABCJS_FONT_FACE: Readonly<Record<string, string>> = {
  annotationfont: 'Helvetica',
  gchordfont: 'Helvetica',
  historyfont: 'Times New Roman',
  infofont: 'Times New Roman',
  measurefont: 'Times New Roman',
  partsfont: 'Times New Roman',
  repeatfont: 'Times New Roman',
  textfont: 'Times New Roman',
  tripletfont: 'Times',
  vocalfont: 'Times New Roman',
  wordsfont: 'Times New Roman',
  composerfont: 'Times New Roman',
  subtitlefont: 'Times New Roman',
  tempofont: 'Times New Roman',
  titlefont: 'Times New Roman',
  voicefont: 'Times New Roman',
  footerfont: 'Times New Roman',
  headerfont: 'Times New Roman',
}

/**
 * abcjs's DEFAULT WEIGHT AND STYLE per `%%…font` type — the OTHER two columns of
 * `initializeFonts` (`parse/abc_parse_directive.js:22-44`), and they are not all `normal`.
 *
 * ⚠️ **A TYPE'S DEFAULT STYLE IS PART OF WHAT IT MEASURES WITH.** `getFontAndAttr` hands
 * `getTextSize` the whole font object, so a tune that sets no `%%measurefont` is still
 * measured ITALIC — and in Blink an italic `6` inks 9.982422 against an upright 9.5 at 19px,
 * which is a bar number 0.24px out. WebKit inks every digit at 9.5 either way and cannot
 * express it at all, which is why this survived WebKit reaching zero.
 *
 * Only the seven that differ are listed; everything else is `normal`/`normal`.
 */
export const ABCJS_FONT_DEFAULT_STYLE: Readonly<
  Record<string, { readonly bold?: true; readonly italic?: true }>
> = {
  infofont: { italic: true },
  measurefont: { italic: true },
  tripletfont: { italic: true },
  composerfont: { italic: true },
  vocalfont: { bold: true },
  tempofont: { bold: true },
  voicefont: { bold: true },
}

/**
 * **THE DEBUG PROBES' ENVIRONMENT, AND THE ONLY PLACE `process` IS TOUCHED OUTSIDE THE CLI.**
 *
 * ⚠️ **`process` DOES NOT EXIST IN A BROWSER, AND READING IT AT MODULE SCOPE KILLS THE
 * WHOLE BUNDLE.** `const PROBE = process.env.ABCTS_PROBE` sat at `layout.ts`'s top level;
 * in the iife build that throws while the IIFE is still evaluating, so `var ABCTS` hoists,
 * its assignment never runs, and the page sees `undefined` with one
 * "Can't find variable: process" behind it. Measured the first time this engine was loaded
 * into WebKit. The other 22 probe sites are inside functions and would not have thrown at
 * load — each would have waited to kill a render instead, which is worse to diagnose.
 *
 * Node keeps its env; a browser gets an empty bag and every probe reads false.
 */
export const ENV: Record<string, string | undefined> =
  typeof process === 'undefined' ? {} : (process.env ?? {})
