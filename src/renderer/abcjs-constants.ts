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

/** abcjs PIXELS → staff spaces. One division, so the result is bit-identical to `n / 7.75`. */
export const spaces = (px: number): number => px / STAFF_SPACE_PX

/** abcjs PIXELS → staff STEPS, which are its pitch unit. */
export const steps = (px: number): number => px / STEP_PX

/** abcjs PITCH → staff spaces. A pitch is half a space. */
export const spacesOfPitch = (pitch: number): number => pitch * 0.5

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
  /** `padding.left` for SCREEN media (`write/renderer.js:71`); print is 68. */
  paddingLeft: 15,
  /** `padding.top` / `.bottom`, screen (`write/renderer.js:69-72`). */
  paddingTop: 15,
  paddingBottom: 15,
  /**
   * `minspacing` on every `AbsoluteElement` that is not a note — a bar, a clef, a key or
   * time signature (`abstract-engraver.js:959` and each `staff-extra`).
   */
  minSpacing: 10,
  /** …and a NOTE's, which is 1 and not 10 (`abstract-engraver.js:808`). */
  noteMinSpacing: 1,
  /** `var dx = 5` — how far into its element a clef glyph sits (`create-clef.js:32`). */
  clefIndent: 5,
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
  /** `renderText`'s `x: linestartx + 5` (`draw/ending.js:41`). */
  voltaTextIndent: 5,
  /** The ending rules' stroke: no `stroke-width` attribute, so SVG's default. */
  voltaRule: 1,
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
} as const

/**
 * LINE WEIGHTS — abcjs's, in PIXELS, and the reason this section exists.
 *
 * `abcjs-strict` HAS NO LATITUDE: it exists to reproduce abcjs byte for byte, so every
 * figure it draws with must be abcjs's. Bravura is authorised as a glyph OUTLINE source
 * for `abc2.1`/`extended` and, before the split, for strict too — but it was NEVER
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
  /** `Decoration.minBottom` — the same on the other side (`decoration.js:14`). */
  decorationMinBottom: 0,
  /** `symbolHeightInPitches(symbol) + 1` — the 1 is "a little padding" (`decoration.js:160`). */
  decorationPadding: 1,
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
  /** `chordHeightAbove`, from the 16px `gchordfont`'s measured height of 18.52px. */
  chordHeightAbove: 4.779354838709677,
  /** `partHeightAbove`, from the 20px `partsfont`'s 22.16px. */
  partHeightAbove: 5.718709677419355,
  /** `tempoHeightAbove` — the tempo lane. */
  tempoHeightAbove: 6,
  /** `endingHeightAbove` for a VOLTA (`ending-element.js:8`). */
  voltaLane: 5,
  /** …and for a TUPLET, which shares the field (`triplet-element.js:25`). */
  tupletLane: 4,
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
  /** `vert` in `addMeasureNumber` on a barline (`abstract-engraver.js:952`). */
  barNumberPitch: 11,
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
} as const

// ─── Unitless ratios and counts ──────────────────────────────────────────────

/** Every abcjs figure that is a scale, a fraction or a multiplier. */
export const ABCJS_RATIO = {
  /** `fontboxpadding` — the fraction of the font size a boxed font pads by, per side. */
  fontBoxPadding: 0.1,
  /** `size.height * 1.1` — what a top-text row advances by (`add-text-if.js:26`). */
  lineSkip: 1.1,
  /** `dy="1.2em"` between the lines of one `<text>` (`svg.js:196`). */
  textLineStep: 1.2,
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

/** A text's height as the generator measures it, in staff spaces. */
export const goldenTextHeight = (sizeInSpaces: number): number => {
  const px = sizeInSpaces * STAFF_SPACE_PX
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
