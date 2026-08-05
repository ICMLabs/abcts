/**
 * Layout — `Score` → positioned elements, in staff spaces.
 *
 * This is the stage the structural gate reads. SVG emission is a separate, dumber pass
 * over the same result (`svg.ts`), so what gets tested is where things ARE, not how the
 * markup happens to be spelled. That split is deliberate: core renders in its own visual
 * style, so a byte comparison of its SVG gates nothing, whereas element sequence and
 * staff positions are exactly the properties that must not drift.
 *
 * UNITS: staff spaces throughout, y-DOWN. The middle staff line is y = 0 and staff step
 * 0. A staff step is one diatonic position — line to adjacent space — and half a staff
 * space, so `y = -step / 2` (negated because higher pitch is lower y).
 *
 * Design follows abcMusicKit2: font metadata (glyph metrics, line thicknesses) stays in
 * the font, engraving conventions (stem length, spacing) live in ENGRAVE below.
 */
import {
  ABC_FONT_DEFAULT_PT,
  type AbcFontType,
  Accidental,
  type Barline,
  type Clef,
  type ClefShape,
  type CompatibilityMode,
  DEFAULT_STAFF_LINES,
  DEFAULT_VOCALFONT_PT,
  type DiatonicStep,
  defaultClef,
  defaultMode,
  type FreeTextBlock,
  isStrict,
  type KeySignature,
  type Measure,
  type Meter,
  type Mode,
  type MusicEvent,
  type NoteStyle,
  type Pitch,
  type Rational,
  type Rest,
  rational,
  ratToNumber,
  type Score,
  type ScoreMetadata,
  type StaffGroup,
  stepIndex,
  type Tempo,
  type Voice,
} from '../core/model.js'
import {
  ABCJS_CLEF_OFFSET_PITCH,
  ABCJS_KEY_ACCIDENTAL_FUDGE_PITCH,
  ABCJS_PERC_NOTE_NAMES,
  ABCJS_PITCH,
  ABCJS_PX,
  ABCJS_RATIO,
  fontPixels,
  GOLDEN_GCHORD,
  GOLDEN_MEASURE,
  GOLDEN_PARTS,
  GOLDEN_REPEAT,
  GOLDEN_VOCAL,
  goldenTextHeight,
  PITCH_ORIGIN,
  STAFF_SPACE_PX,
  STEP_PX,
  spaces,
  spacesOfPitch,
  steps,
} from './abcjs-constants.js'
import { glyphsFor, lineWeightsFor } from './glyph-table.js'
import { GLYPHS, type GlyphName } from './glyphs.js'
import {
  CHAR_ADVANCE,
  CHAR_ADVANCE_BOLD,
  CHAR_ADVANCE_BOLD_FALLBACK,
  CHAR_ADVANCE_SANS,
  CHAR_ADVANCE_SANS_FALLBACK,
  FALLBACK_ADVANCE,
} from './text-metrics.js'

// ─── Engine constants ────────────────────────────────────────────────────────
// Engraving conventions, NOT font metadata. Sources noted; values marked PROVISIONAL
// are starting points pending calibration against reference renders.

export const ENGRAVE = {
  /** Steps of the five staff lines, bottom → top, about the middle line at 0. */
  staffLineSteps: [-4, -2, 0, 2, 4],
  /** A staff step is half a staff space. */
  spacePerStep: 0.5,
  /** Standard stem length ≈ one octave. *Behind Bars* (Gould). */
  stemLength: 3.5,
  /**
   * How far a BEAM sits beyond its group's extreme note, in staff STEPS — abcjs's beamed
   * stem height, which is not the same constant as an unbeamed one's.
   *
   * abcjs hardcodes 7 for a lone stem (`abstract-engraver.js:739`) but takes the beam's
   * from `renderer.spacing.stemHeight`, 26.67 + 10 = 36.67 PIXELS (`renderer.js:107`),
   * which `setStemHeight` converts as `round(36.67 x 10 / 3.875) / 10` = **9.5** steps
   * (`abstract-engraver.js:84-86`). `calcYPos` then uses `stemHeight - 2`.
   *
   * Reusing `stemLength` here — the unbeamed 7 — put every beam 2.5 steps too close to its
   * notes, which on ragtime is most of the corpus's remaining vertical error.
   */
  beamStemHeight: Math.round((ABCJS_PX.beamStemHeight * 10) / STEP_PX) / 10,
  /** First ledger step beyond the staff; grows outward by 2. *Behind Bars*. */
  firstLedgerStep: 6,
  /**
   * Page margin left of the staff.
   *
   * 15px at abcjs's 7.75px staff space — its SCREEN default `padding.left`
   * (`write/renderer.js:71`; print uses 68px, which is 1.8cm). Was 1.0 and marked
   * PROVISIONAL, which put every drawing about 7px left of abcjs's and, more sharply,
   * dropped `multi-voice-rest-placement` to a fill of 0.659 against the 0.66 threshold —
   * so it kept its natural width where abcjs justified it, by one thousandth.
   */
  marginX: spaces(ABCJS_PX.paddingLeft),
  /**
   * Vertical padding above and below a staff's ink.
   *
   * ZERO, because abcjs and abcMusicKit v1 have none: v1 advances its cursor by
   * `(staff.top - staff.bottom) * STEP` — the pitch extent of what is actually drawn —
   * and relies on a MINIMUM separation to keep systems apart (`SVGDraw.swift`
   * `addStaffPadding`, against `draw.js:84-92`). A per-staff margin adds room every time
   * instead, which accumulates: `ragtime-nightingale` has 46 systems and carried 987px of
   * it. Was 4.0 — 31px on each side of every staff.
   */
  marginY: 0,
  /**
   * Gap after a clef, key signature or meter before the next element.
   *
   * abcjs's `minspacing`, a flat 10px on every `AbsoluteElement` (`absolute-element.js`,
   * and visible as `minSpacing: 10` in its element dumps). Instrumenting its own layout on
   * `simple-c` shows the chain exactly: clef at 15 (`padding.left`) w 24.051, meter at
   * `15 + 24.051 + 10` = 49.051 w 11.795, first note at `49.051 + 11.795 + 10` = 70.846.
   * Ours was one staff space, 7.75px, so every prefix ran short and took the music with it.
   */
  prefixGap: spaces(ABCJS_PX.minSpacing),
  /**
   * A clef glyph sits this far INTO its element — abcjs's `var dx = 5` in `createClef`,
   * which is why its clef element is 24.051 wide against a 19.051 glyph. We drew the glyph
   * flush at the element's left and made the element glyph-wide, losing 5px before the
   * music on every staff.
   */
  clefIndent: spaces(ABCJS_PX.clefIndent),
  /**
   * Gap a NOTE's rod adds beyond its own ink — abcjs's `minspacing`, and for a note that is
   * **1px**, not the 10 a bar or a staff-extra gets.
   *
   * `new AbsoluteElement(elem, durationForSpacing, 1, absType, …)` for a note
   * (`abstract-engraver.js:808`) against `new AbsoluteElement(elem, 0, 10, 'bar', …)` at
   * `:959` and 10 for every `staff-extra`. The rod itself is `getMinWidth(child)`, which is
   * simply `child.w` (`layout/voice-elements.js`), and the layout takes
   * `x = max(x + rod + minspacing, x + spacing * sqrt(dur * 8))` — whichever is larger.
   *
   * Ours added `minColumnGap`, 0.6 of a space = 4.65px, which is nearly five times abcjs's
   * and binds on exactly the short dense notes where the rod starts to win: a 32nd's spring
   * is 15px against a ~20px rod.
   */
  noteRodGap: spaces(ABCJS_PX.noteMinSpacing),
  /**
   * Gap between adjacent accidentals in a key signature.
   *
   * abcjs steps by `getSymbolWidth(symbol) + 2` (`create-key-signature.js:26`) — a flat 2px,
   * which its own element dump confirms: five sharps at dx 0, 10.25, 20.5, 30.75, 41 with
   * each glyph 8.25 wide. Ours was 0.15 of a space, 1.16px, so a five-sharp signature ran
   * 3.35px narrow and pulled the music left with it.
   */
  keySignatureGap: spaces(ABCJS_PX.keySignatureGap),
  /**
   * Between an accidental and whatever is to its right — `width + 2` in
   * `create-note-head.js:95`, where the 2 is abcjs's flat gap and NOT a fraction of the
   * glyph. Was 0.15 (1.16px) and provisional.
   */
  accidentalGap: spaces(ABCJS_PX.accidentalGap),
  /** Two accidentals this far apart in STEPS share a column (`create-note-head.js:87`). */
  accidentalColumnSteps: ABCJS_PITCH.accidentalColumnPitch,
  /** Gap from the notehead's right edge to the first augmentation dot. PROVISIONAL. */
  dotGap: 0.35,
  /** Spacing between successive dots on a double- or triple-dotted note. PROVISIONAL. */
  dotSpacing: 0.45,
  /**
   * Square-root spacing coefficient, in staff spaces: a note's natural width is
   * `spacingScale · √(duration / reference)`.
   *
   * Taken from abcMusicKit2's `EngravingConstants.spacingScale`, which is not a guess:
   * abcm2ps's duration→width curve was measured by black-box probe and fits a pure
   * SQUARE ROOT of duration (its per-halving increment shrinks by ~1/√2 each step,
   * steeper than log2), and the full recovered model `W(d|s) = min(6.667, 13.3·√s)·√(d/s)`
   * collapses to `13.3·√d` for any line whose shortest note is a quarter or less — which
   * is nearly all music. 3.25 ≈ 13.3/4 is the corpus-centered scale.
   */
  spacingScale: 3.25,
  /**
   * Absolute spacing anchor. A sixteenth gets exactly `spacingScale`; everything else
   * scales from it by √duration, so a note's width depends only on its own duration and
   * not on what surrounds it.
   */
  spacingReference: 1 / 16,
  /** Hard minimum gap between adjacent columns — the rod floor beneath the springs. */
  minColumnGap: 0.6,
  /**
   * Space AFTER a barline, before the next element. Nothing goes before it.
   *
   * abcjs's bar is `new AbsoluteElement(elem, 0, 10, 'bar', …)` (`abstract-engraver.js:959`)
   * — width 1, `minspacing` 10 — and it has ZERO duration, so its spring is nothing and its
   * rod always wins: the next element sits 11px past it. Nothing is inserted before it
   * either; the preceding note's own advance puts it there.
   *
   * Measured on `simple-c`, whose note-to-note gaps already matched abcjs exactly at 42.4px
   * everywhere EXCEPT across a barline — 53.4 against our 57.9. We were adding one space on
   * each side, 15.5px, where abcjs adds 11.0 once.
   */
  barGap: spaces(ABCJS_PX.barGap),
  /**
   * What a barline occupies on the LAYOUT cursor, by kind — abcjs's `child.w`, which is
   * not its drawn thickness but a flat width per type. Read out of abcjs by probe, one
   * measure per kind:
   *
   * ```
   * |  1     ||  4     |]  8     |:  16     :|  14     ::  22     [|  13
   * ```
   *
   * The rod is this plus the flat 10 of `minspacing`, which is where the familiar 11 for
   * a plain barline comes from. Using one flat 11 for every kind puts a final `|]` 7px
   * narrow, and because a line's LAST element keeps its width and loses its `minspacing`
   * that 7px lands entirely in the justification's constant term: on
   * `vree-compound-meter` it stretched every gap by 0.58px, a drift that reached 6.4px by
   * the twelfth note.
   *
   * `[|` is not here because the parser folds it into `double`, where abcjs keeps them
   * apart at 13 and 4 — a model question, not a spacing one.
   */
  /**
   * Room a barline wants to its LEFT — abcjs's `extraw = -5` on every bar, flat.
   * It only bites where the previous element's rod runs right up to the cursor, which is
   * a compressed line; a line with any slack in it never notices.
   */
  barClearance: spaces(ABCJS_PX.barClearance),
  barLayoutWidth: {
    thin: spaces(ABCJS_PX.barWidthThin),
    double: spaces(ABCJS_PX.barWidthDouble),
    final: spaces(ABCJS_PX.barWidthFinal),
    repeatStart: spaces(ABCJS_PX.barWidthRepeatStart),
    repeatEnd: spaces(ABCJS_PX.barWidthRepeatEnd),
    repeatBoth: spaces(ABCJS_PX.barWidthRepeatBoth),
    // An invisible bar reserves a thin bar's width and paints nothing.
    invisible: spaces(ABCJS_PX.barWidthThin),
  } as Record<Barline, number>,
  /**
   * LANES above and below the staff, in staff steps. The staff itself spans -4 to 4.
   *
   * Fixed lanes rather than a skyline pass. Real engraving stacks whatever is present
   * and closes the gap when something is absent; lanes are the smaller correct answer
   * while the set of things that can appear is small and known. Each is far enough from
   * its neighbour that 1.4-space text cannot collide — `full-song-template` carries a
   * tempo and a part label at once, and `chord-grid` a symbol over every note.
   *
   * Nothing costs vertical space when absent: the drawing box is measured from the
   * content actually placed, so a tune with no tempo is no taller for the lane existing.
   */
  /**
   * Chord symbols and annotations sit FURTHER out than a staff step or two, and abcjs
   * puts them at a fixed distance from the staff rather than stacking them above the
   * notes. Measured from its goldens: a chord symbol's baseline is 20.8px above the top
   * staff line in `chord-grid` (notes inside the staff), in `happy-birthday` (notes 23px
   * above it) and in `full-song-template` alike — the note height does not move it.
   * 20.8px is 5.37 steps above the top line, which is step 4.
   */
  chordSymbolStep: 9.37,
  ornamentStep: 7,
  /**
   * `Decoration.minTop` — the floor the ornament stack starts from, in PITCH
   * (`creation/decoration.js:13`). One pitch above the top staff line, so an ornament on
   * a low note still clears the staff.
   */
  decorationMinTop: ABCJS_PITCH.decorationMinTop,
  /** `minBottom` — the floor `getPlacement('below')` clamps to (`decoration.js:14`). */
  decorationMinBottom: ABCJS_PITCH.decorationMinBottom,
  /** The pitch of padding each stacked decoration adds so nothing touches (`:154`). */
  decorationPadding: ABCJS_PITCH.decorationPadding,
  /** `textFudge` — how far a TEXT decoration sits above the stack cursor (`:149`). */
  decorationTextFudge: ABCJS_PITCH.decorationTextFudge,
  /** `textHeight` — the flat pitch a text decoration advances the cursor by (`:150`). */
  decorationTextHeight: ABCJS_PITCH.decorationTextHeight,
  /**
   * `thickness: 3` — a text decoration's DECLARED height in pitch (`decoration.js:151`),
   * with abcjs's own "TODO-PER: Get the height of the current font and use that" beside
   * it. It is not the font's height and reproducing the font's height is wrong.
   */
  decorationTextThickness: ABCJS_PITCH.decorationTextThickness,
  /**
   * Dynamics (`!p!`, `!mf!`) and hairpins go ABOVE the staff WHEN THE TUNE HAS LYRICS,
   * and below it otherwise — abcjs's rule, not a taste choice.
   *
   * `createDecoration` defaults `volumePosition` to `hasVocals ? 'above' : 'below'`
   * (`write/creation/decoration.js:379`), and `hasVocals` is set once per system if any
   * voice on it carries a `w:` line below the staff (`abstract-engraver.js:110-122`).
   * `DynamicDecoration` then reserves `volumeHeightAbove` or `volumeHeightBelow` from that
   * (`dynamic-decoration.js`). The element dumps confirm the split:
   * `multi-voice-lyrics-two-voices` records `volumeHeightAbove`, `ragtime-nightingale` and
   * `two-voice-invention` `volumeHeightBelow`.
   *
   * `dynamicAboveStep` 19.5 is 60px above the top line, off `multi-voice-lyrics-two-voices`
   * (box centre 35.9, top line 95.8). `dynamicBelowStep` −10.96 is 27px below the bottom
   * line, off `two-voice-invention` (box centre 201.7, bottom line 174.7).
   *
   * ponytail: two FIXED lanes where abcjs stacks against the ink. `hasVocals` is read
   * tune-wide, not per system — the corpus never varies lyrics across a tune's systems, so
   * the two agree; a per-system read is the faithful version if one ever does.
   */
  dynamicAboveStep: 19.5,
  dynamicBelowStep: -10.96,
  /**
   * Room a staff reserves BELOW its ink for dynamics and hairpins, in staff steps.
   *
   * abcjs's `max(volumeHeightBelow, dynamicHeightBelow) + margin` = `max(6, 6) + 1` = 7
   * pitch (`dynamic-decoration.js:8`, `crescendo-element.js:11`,
   * `set-upper-and-lower-elements.js:63-71`). It reserves that BEYOND the staff's ink and
   * draws the marks at the bottom it had BEFORE subtracting — so the mark is anchored on
   * the music, and the room is a flat lane past it. A fixed lane for both, which is what
   * we had, gets neither right.
   */
  dynamicBelowReserve: 7,
  /**
   * `"^text"` above the staff and `"_text"` below.
   *
   * abcjs joins same-position annotations into ONE multi-line block, so the first one
   * written becomes the top line. Above the staff that puts it furthest out; below, it
   * puts it nearest. Stacking outward in reverse above and in written order below
   * reproduces both without special-casing either.
   *
   * ponytail: the above lane can reach `partStep` once three annotations stack, and the
   * below lane can reach `lyricStep` at two. No fixture combines them, and the real fix is
   * the skyline pass this whole block is waiting on rather than more hand-picked numbers.
   */
  annotationAboveStep: 9.0,
  /** 27.8px below the BOTTOM line (step -4) in `stacked-annotations`. */
  annotationBelowStep: -11.17,
  /**
   * One text line to the next, out of staff: 20px, which is `round(height x 1.1)` for
   * abcjs's 16px annotation font — the same advance rule the top-text block uses. Ours
   * was 2.5 steps, 9.7px, so three stacked annotations occupied half the room abcjs
   * gives them.
   */
  annotationLineStep: 5.16,
  partStep: 10,
  tempoStep: 14,
  /**
   * The above-staff STACK — what `anchorAboveStaff` walks, and why the three lanes above
   * are only the origin it shifts from.
   *
   * abcjs reserves each of these on the running staff top, `height + margin` per item,
   * and DRAWS the item at the top it just reserved (`set-upper-and-lower-elements.js:31-49`,
   * `incTop`; `margin = 1` at `:102`). So a tune carrying a chord, a part label and a tempo
   * mark stacks all three — where a fixed lane puts each at one distance from the staff
   * whatever else is present, and the whole drawing sits as high as its outermost lane.
   *
   * The heights are abcjs's own `specialY`, and they are CONSTANTS: every staff of every
   * fixture in the corpus reports the same three. In its pitch units, halved here because
   * a step is half a staff space.
   */
  aboveStackMargin: spacesOfPitch(ABCJS_PITCH.laneMargin),
  chordHeightAbove: spacesOfPitch(ABCJS_PITCH.chordHeightAbove),
  partHeightAbove: spacesOfPitch(ABCJS_PITCH.partHeightAbove),
  /**
   * `fontboxpadding` — the fraction of the font size a boxed font pads by, on each side.
   * abcjs's default is 0.1 and the directive can change it (`get-font-and-attr.js:35`).
   */
  fontBoxPadding: ABCJS_RATIO.fontBoxPadding,
  /** Stroke of the rules `%%partsbox` draws — one pixel, as abcjs's `rect` emits. */
  fontBoxRule: spaces(ABCJS_PX.fontBoxRule),
  tempoHeightAbove: spacesOfPitch(ABCJS_PITCH.tempoHeightAbove),
  /** abcjs bumps the tempo's baseline 2px past the top it reserved (`draw/tempo.js:15`). */
  tempoDescenderBump: spaces(ABCJS_PX.tempoDescenderBump),
  /** `temposcale` — the beat-unit note is a miniature (`tempo-element.js:25`). */
  tempoNoteScale: ABCJS_RATIO.tempoNoteScale,
  /** `x += note.w + 5` between the beat-unit note and the rate (`draw/tempo.js:29`). */
  tempoNoteGap: spaces(ABCJS_PX.tempoNoteGap),
  /**
   * A tune's title sits above everything else it owns, in staff STEPS above the middle
   * line — so the gap to the top staff line is `titleStep / 2 - 2` spaces.
   *
   * 19 leaves 58px there. abcjs leaves 27.6px: its title baseline lands at y 49.6 and
   * its top staff line at 77.2, built from `padding.top` 15, `spacing.title` 7.56 and
   * `spacing.music` 7.56 above the first staff (`write/renderer.js:94`). That 30px is
   * the whole of the vertical offset every fixture's noteheads carry.
   *
   * MEASURED AND LEFT ALONE. Setting this to 11.12 makes the gap exactly abcjs's, but
   * the 30px it was correcting turned out to be `marginY` — 31px of per-staff padding
   * abcjs does not have — and removing that fixed the gap without touching this. Six
   * fixtures went to a y offset of ~0.5px with `titleStep` untouched.
   *
   * Which is the lesson: the title was never mispositioned relative to the music. The
   * MUSIC was carrying padding, and the title rode along on top of it.
   */
  titleStep: 19,
  /** First verse below the staff; further verses stack downward by `lyricLineStep`. */
  /**
   * Verse 1's baseline as WRITTEN — a provisional lane, 28.8px below the bottom staff
   * line. `anchorLyrics` moves the whole block to where abcjs puts it once the staff's
   * voices are merged and its music ink is known; this is only the origin the shift is
   * measured from, and the verse stacking below it rides along untouched.
   */
  lyricStep: -11.43,
  /**
   * Lyrics hang from the staff's MUSIC INK BOTTOM, not from a fixed lane — and this is
   * the one out-of-staff thing that genuinely does, which is why fixed lanes were right
   * for chords and dynamics and wrong here.
   *
   * abcjs resolves a lyric's pitch to `staff.bottom`, the ink bottom over every voice on
   * the staff (`set-upper-and-lower-elements.js:52-55`), and the k-th voice's lyrics one
   * rendered lyric height lower than that (`:165-169`). Both constants below are its own
   * 17px vocal font: the gap is the SVG baseline offset, the step is `17 x 1.108`, the
   * same calibrated height ratio `textHeightRatio` carries.
   *
   * MEASURED, on four independent points, exact to 0.01px:
   *   `ave-verum-corpus`  staff 0 ink bottom 8 steps below its bottom line, lyric 214.24
   *                       staff 1 ink bottom 4 steps below its bottom line, lyric 310.23
   *   `multi-voice-lyrics-two-voices`  two voices' lyrics 18.84px apart, both systems.
   * ave-verum's two lyric lines sit only 3.3px apart NOT because the voice offset is
   * absent there, but because its upper staff's ink reaches 15.5px further down and very
   * nearly cancels it. Reading that 3.3 as "abcjs does not offset here" is what left this
   * unfixed for two sessions.
   */
  lyricInkGap: spaces(ABCJS_PX.lyricInkGap),
  lyricVoiceStep: spaces(ABCJS_PX.lyricInkGap * ABCJS_RATIO.textHeight),
  /**
   * Verse to verse: abcjs stacks verses as `<tspan dy="1.2em">` inside ONE `<text>` per
   * note, so the step is 1.2 x the 17px vocal font = 20.4px, not the 21px an advance rule
   * would give. Read off its own goldens' markup, not inferred.
   */
  lyricLineStep: steps(ABCJS_PX.lyricInkGap * ABCJS_RATIO.textLineStep),
  /**
   * How far a brace or bracket moves the staff's left edge — abcjs's
   * `BraceElem.getWidth()`, a flat 10 for both, with its own comment that the drawing
   * does not vary it.
   */
  connectorIndent: spaces(ABCJS_PX.connectorIndent),
  /** Clearance between a brace or bracket and the staff it joins. */
  connectorGap: 0.6,
  /** A bracket is a rule, and a heavy one. */
  bracketThickness: 0.5,
  /** Mouth of a hairpin at its open end — abcjs paints 8px against a 7.75px space. */
  hairpinMouth: 1.0,
  /** Clearance either side of a glissando, so it does not touch the noteheads. */
  spannerGap: 0.3,
  /** Below this a hairpin is a smudge rather than a shape. */
  spannerMinLength: 1.5,
  /** Gap either side of a melisma extender — off the syllable, past the last notehead. */
  melismaGap: 0.4,
  /** Below this a run is a speck rather than a line; drawn as nothing. */
  melismaMinLength: 0.8,
  /**
   * Tempo and part labels are directions; chord symbols and lyrics are smaller.
   *
   * abcjs's `partsfont` and `tempofont` are both 15pt -> `round(15 x 4/3)` = 20px
   * (`abc_parse_directive.js:25-38`). Ours was 1.6 — 12.4px — which is the same
   * two-thirds undersizing `titleTextSize` and `chordTextSize` carried before they were
   * derived, and it matters twice over: the stack draws each item one FONT SIZE below the
   * top it reserved, so an undersized font lands the baseline high as well as small.
   */
  tempoTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.partsfont)),
  /**
   * Top-text font sizes, in staff spaces.
   *
   * abcjs's defaults are in POINTS (`abc_parse_directive.js:25-38`), converted by 4/3 to
   * pixels at a 7.75px staff space: title 20pt, subtitle 16pt, composer and info 14pt.
   * `titleTextSize` was 2.4 — 18.6px against abcjs's 26.7 — so the title was undersized
   * as well as mispositioned.
   */
  // ROUNDED TO WHOLE PIXELS, as abcjs emits them: its title is `font-size="27"`, not
  // 26.67, its composer `19` not 18.67. The rounding is visible in the goldens and it
  // feeds the line advance below, where it is worth 4px on the first staff.
  titleTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.titlefont)),
  subtitleTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.subtitlefont)),
  composerTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.composerfont)),
  infoTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.infofont)),
  /**
   * Rendered text HEIGHT as a multiple of font size — a line of prose is taller than its
   * point size, and abcjs advances by the height, not the size.
   *
   * 1.108, from the WebKit-calibrated heights the golden generator measures with
   * (`dump-svg.js`: 27px -> 29.91, 21 -> 23.27, 20 -> 22.16, 19 -> 21.06, 17 -> 18.84).
   * Every one of those serif faces gives the same ratio to three decimals.
   *
   * This was the last of the corpus-wide vertical offset. We advanced by
   * `round(size * 1.1)` where abcjs advances by `round(size * 1.108 * 1.1)` — for a title
   * that is 29px against abcjs's 33, so the first staff of every tune sat 4px high.
   */
  textHeightRatio: ABCJS_RATIO.textHeight,
  /**
   * Page margin above everything — abcjs's `padding.top`, 15px on screen
   * (`write/renderer.js:69`; print uses 38px, which is 1cm). We had none: our drawing
   * began at the top text's own ink, so every tune sat 15px higher than abcjs's.
   */
  marginTop: spaces(ABCJS_PX.paddingTop),
  /**
   * And BELOW everything — abcjs's `padding.bottom`, also 15px on screen, spent in
   * `(renderer.y + renderer.padding.bottom) * scale` (`draw/set-paper-size.js:3`).
   *
   * We had the top and not the bottom, so the page ended flush with the last staff line
   * and clipped its own stroke: `simple-c` came out 124.085px against abcjs's 139.052,
   * and every fixture was short by this exact 15.
   */
  marginBottom: spaces(ABCJS_PX.paddingBottom),
  /** Space above the title, a subtitle, and the composer row (`renderer.js:94`). */
  titleSpace: spaces(ABCJS_PX.titleSpace),
  subtitleSpace: spaces(ABCJS_PX.subtitleSpace),
  composerSpace: spaces(ABCJS_PX.composerSpace),
  /** Space between the top-text block and the top of the music (`renderer.js:101`). */
  musicSpace: spaces(ABCJS_PX.musicSpace),
  /**
   * `%%center` free text — abcjs's `textfont`, 21px at its 7.75px staff space.
   *
   * `freeTextSpace` is the gap above such a line, and it is abcjs's standard 7.56 — the
   * same unit as `titleSpace`, `composerSpace` and `musicSpace`. Derived, not guessed:
   * abcjs's composer baseline in the `center-text` golden is 82.12 and its centred line's
   * is 114.68, and 114.68 = 82.12 + (23 - 19) + 7.56 + 21 exactly, where 23 is the
   * composer row's advance and 21 the free-text size.
   */
  freeTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.textfont)),
  /**
   * Line to line inside ONE `%%begintext` block — `1.2em` at the 21px `textfont`, the
   * `tspan dy` abcjs stacks a multi-line `<text>` by. Measured: a two-line block costs
   * 25.2px more than a one-line one, where the first line costs `21 x 1.108`.
   */
  freeTextLineStep: spaces(fontPixels(ABC_FONT_DEFAULT_PT.textfont) * ABCJS_RATIO.textLineStep),
  freeTextSpace: spaces(ABCJS_PX.titleSpace),
  /** Gap from the last staff line down to a trailing `%%center` line's baseline. */
  freeTextBelowSpace: spaces(ABCJS_PX.freeTextBelowSpace),
  /** A text line advances by its height times this, rounded to whole pixels by abcjs. */
  lineSkipFactor: ABCJS_RATIO.lineSkip,
  /** Vertical gap between tunes in a tunebook — wider than between systems. */
  tuneGap: 6.0,
  /**
   * abcjs's `vocalfont`, 13pt -> `round(13 x 4/3)` = 17px, and its `gchordfont` /
   * `annotationfont`, 12pt -> 16px (`abc_parse_directive.js:25-38`). Both were 1.4 —
   * 10.85px — one constant serving lyrics, chord symbols, annotations and decorations at
   * two thirds of abcjs's size. Same undersizing the title carried before `titleTextSize`
   * was derived; it makes every out-of-staff reserve too small as well as drawing small.
   */
  lyricTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.vocalfont)),
  chordTextSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.gchordfont)),
  /**
   * `dy="1.2em"` — the step abcjs puts between the lines of one `<text>` (`svg.js:196`),
   * and therefore what the golden generator adds per extra line when it measures one
   * (`dump-svg.js:120-124`).
   */
  textLineStep: ABCJS_RATIO.textLineStep,
  /**
   * A stem shortened to meet a beam never drops below this. *Behind Bars* keeps beamed
   * stems from collapsing to stubs. PROVISIONAL.
   */
  minStemLength: 2.5,
  /** Maximum total vertical rise of a sloped beam across its span. *Behind Bars*. */
  beamMaxRise: 2.0,
  /** Length of a secondary-beam stub on a note whose neighbours lack that level. */
  beamStubLength: 1.1,
  /** Clearance from a tuplet's furthest note to its bracket or number. PROVISIONAL. */
  tupletGap: 1.2,
  /** Half-gap the bracket leaves around its number. */
  tupletNumberGap: 0.35,
  /** Length of the hook turning down from each end of a tuplet bracket. */
  tupletHook: 0.6,
  tupletTextSize: 1.4,
  /** Staff step for a repeat-ending bracket, above everything the staff itself draws. */
  /**
   * `endingHeightAbove` — the lane a tuplet or a volta reserves beyond the top note, in
   * pitch, before abcjs adds its 1-pitch margin (`set-upper-and-lower-elements.js:37`).
   * A TUPLET declares 4 (`triplet-element.js:25`) and a VOLTA declares 5
   * (`ending-element.js:8`); a staff carrying both keeps the larger, since `setLimit`
   * takes the max. The bracket is DRAWN where its geometry puts it and overhangs this
   * lane; only the lane is reserved. See `verticalExtent`.
   *
   * One flat 5 for both cost every voltaed staff of `ragtime-nightingale` a pitch.
   */
  tupletLane: ABCJS_PITCH.tupletLane,
  /**
   * `RelativeElement`'s default `height` — a flat 4 pitch when nothing declares one
   * (`relative-element.js:37`). A notehead never does, so this is what a notehead's
   * height IS wherever abcjs reads that field.
   */
  relativeElementHeight: ABCJS_PITCH.relativeElementHeight,
  /**
   * HALF A NOTEHEAD'S DECLARED BOX, in staff spaces.
   *
   * `create-note-head.js:34` passes `thickness: symbolHeightInPitches(c) * scale`, and
   * `RelativeElement` turns that into `top = pitch + thickness/2`,
   * `bottom = pitch - thickness/2` (`relative-element.js:22-24`). For
   * `noteheads.quarter` that is **2.088774 pitches**, so half of it is 1.0443871 pitch —
   * NOT the 1 pitch a notehead looks like it is. The 0.0444 that difference leaves shows
   * up in every one of abcjs's own numbers: `a1bot=5.9556` for a note at pitch 5,
   * `mids=6.0444^3.9556`, `staff.bottom=-14.0444`.
   *
   * The other heads differ in the third decimal (half 2.0986, whole 2.0895, dbl 2.1019);
   * one figure covers them to 0.02px.
   */
  noteheadHalfHeight: ABCJS_PITCH.noteheadHeight / 4,
  voltaLane: ABCJS_PITCH.voltaLane,
  /**
   * What an ending lane costs when the staff ALSO has a chord lane — a flat 2 pitch with
   * no margin, instead of `endingHeightAbove + margin`
   * (`set-upper-and-lower-elements.js:33-38`).
   */
  endingOverChordLane: ABCJS_PITCH.endingOverChordLane,
  /**
   * `vert` in `addMeasureNumber` — the pitch a bar number's box starts from, before its
   * own height is added (`abstract-engraver.js:952`). 11 on a barline; the 13.5 branch
   * needs a number wider than 10px on a TREBLE CLEF element, which a barline never is.
   * In our steps, which are abcjs's pitch.
   */
  barNumberPitch: ABCJS_PITCH.barNumberPitch,
  /** `measurefont` — Times Italic 14pt, so `round(14 x 4/3)` = 19px. */
  barNumberSize: spaces(fontPixels(ABC_FONT_DEFAULT_PT.measurefont)),
  /**
   * A LEFT annotation's room before the note — `roomTaken += chordWidth + 7`
   * (`add-chord.js:52`), in abcjs pixels.
   */
  leftAnnotationGap: spaces(ABCJS_PX.leftAnnotationGap),
  /** A RIGHT annotation's, 4 either side — `roomTakenRight += 4` and `w = width + 4`. */
  rightAnnotationGap: spaces(ABCJS_PX.rightAnnotationGap),
  /** abcjs's `margin` in `set-upper-and-lower-elements.js:102` — one pitch on every lane. */
  laneMargin: ABCJS_PITCH.laneMargin,
  voltaStep: 8,
  /** How far the volta bracket's end hooks turn down toward the staff. */
  voltaHook: 1.4,
  voltaTextSize: 1.3,
  /** Grace notes are drawn at this fraction of full size. *Behind Bars* ~60%. */
  graceScale: ABCJS_RATIO.graceScale,
  /**
   * Horizontal advance per grace note, before the note it decorates — a flat **10px**,
   * and the last grace's own step is the gap to the notehead, so there is no separate
   * one. abcjs records the whole group as `extraw`: probed on `C{ABc}G/4 D2`, a note with
   * three graces reads `extraw = -30` exactly, and `w` unchanged at the notehead alone.
   * Ours stepped 8.52px and then added 5.1px of gap, which put a single grace 3.6px too
   * far from its note and every grace of a group at the wrong pitch of the ladder.
   */
  graceAdvance: spaces(ABCJS_PX.graceAdvance),
  /** …and an ACCIDENTAL on a grace note adds 7 more (`abstract-engraver.js:484-486`). */
  graceAccidentalRoom: spaces(ABCJS_PX.graceAccidentalRoom),
  /** No gap: the last grace's own advance IS the distance to the notehead. */
  graceGap: 0,
  /** Length of the hook that resumes a curve at the start of the next system. */
  curveContinuation: 2.0,
  /** How far a slur or tie endpoint sits clear of the notehead it springs from. */
  curveEndGap: 0.3,
  /** Arc height as a fraction of the curve's horizontal span, before clamping. */
  curveBulgeRatio: 0.18,
  /** Arc height floor and ceiling, in staff spaces. *Behind Bars* keeps slurs shallow. */
  curveMinBulge: 0.5,
  curveMaxBulge: 2.2,
  /**
   * Page width, in staff spaces — the span a system is justified into.
   *
   * abcjs's is `padding.left + staffwidth + padding.right` = 15 + 670 + 15 = **700px**
   * (`renderer.js:69-72`, `staffwidthScreen`), so the music ends at 685 and its own solver
   * targets exactly that. Ours was a round 90 spaces, 697.5px, which put the target 2.5px
   * short and compressed every justified line by that much.
   */
  systemWidth: spaces(ABCJS_PX.systemWidth),
  /**
   * Vertical gap between stacked systems, on top of the ink.
   *
   * abcjs has NO such gap — `addStaffPadding` (`draw/draw.js:84-92`) computes the natural
   * ink separation and pads only when it falls short of `staffSeparation`. Setting this to
   * 0 to match moves the corpus the WRONG way (median 17.4 -> 19.0, `little swallow` to
   * -19.7px), which says our ink extents are short of abcjs's by roughly this much and
   * this constant has been standing in for that. Left in place, and named for what it is
   * rather than tuned: the fix is to find the missing extent, not to trade fixtures.
   */
  systemGap: 0,
  /**
   * MINIMUM distance from one system's bottom staff line to the next system's top staff
   * line — abcjs's `staffSeparation`, 61.33px at its 7.75px space
   * (`write/renderer.js:105`).
   *
   * A minimum, not a fixed gap: `draw.js:84-92` computes the natural clearance and pads
   * only when it falls short, so tall content takes the room it needs and no more.
   * abcMusicKit v1 implements exactly this in `addStaffPadding`.
   */
  systemSeparation: spaces(ABCJS_PX.systemSeparation),
  /**
   * How full a LAST system must already be before it is justified to the page.
   *
   * 0.66, taken from abcjs `write/layout/layout.js:102`, where it is the threshold under
   * which a last line keeps its natural width. Not a taste judgement — matching it is
   * what puts a single-system tune's notes where abcjs puts them, and every single-tune
   * fixture in the corpus is a last system.
   *
   * abcjs also exposes `%%stretchlast` to override it with a "lack" fraction. Not
   * implemented; no fixture sets it.
   */
  lastSystemFill: 0.66,
  /** Vertical gap between staves WITHIN one system, on top of the minimum separation. */
  staffGap: 0,
  /**
   * The same minimum, between staves WITHIN one system — abcjs's
   * `systemStaffSeparation`, 48px (`write/renderer.js:109`). Tighter than between
   * systems, which is what makes the staves of one score read as belonging together.
   */
  staffSeparation: spaces(ABCJS_PX.staffSeparation),
} as const

// ─── Layout model ────────────────────────────────────────────────────────────

export type ElementType =
  | 'title'
  | 'voiceName'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'tempo'
  | 'part'
  | 'note'
  | 'rest'
  | 'bar'

/**
 * What a drawn part IS, independent of which element owns it.
 *
 * A note element draws a notehead, a stem and maybe a ledger line, and a host wants to
 * tell them apart — for styling, for hit-testing, and for the compat layer, which must
 * emit abcjs's per-part class names (`abcjs-notehead`, `abcjs-stem`, `abcjs-ledger`)
 * rather than one class for the whole note.
 */
export type PartRole =
  | 'notehead'
  | 'stem'
  | 'ledger'
  | 'accidental'
  | 'flag'
  | 'dot'
  | 'grace'
  | 'staff'
  | 'beam'
  | 'bar'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'rest'
  | 'decoration'
  | 'text'
  | 'lyric'
  | 'chord'
  | 'dynamic'
  | 'title'

export interface PlacedGlyph {
  readonly name: GlyphName
  /**
   * Position within a CHORD, 1 = lowest pitch, counting upward. Absent on a single note.
   *
   * abcjs puts `abcjs-chord-pos-N` on each notehead of a chord and nothing on a lone one,
   * which is what its 722/715 split of pos-1 to pos-2 across the corpus shows — a single
   * note would make pos-1 dwarf the rest. Compat reproduces it because a stylesheet can
   * legitimately target it, and it was the ONLY class abcjs emits that we did not.
   */
  readonly chordPos?: number
  readonly x: number
  readonly y: number
  /** What this glyph is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * Uniform scale about the glyph origin. 1 unless stated — grace notes and the octave
   * marker on a `-8` clef are the only things that shrink, and a scale shrinks everything:
   * notehead, stem and flag together.
   */
  readonly scale?: number
  /**
   * Vertical extent this glyph DECLARES, replacing its ink box — `[top, bottom]` in the
   * same y-down staff spaces as `y`.
   *
   * abcjs's `RelativeElement` takes `top`/`bottom` overrides that need not bracket the ink
   * at all (`elements/relative-element.js:38-41`), and the octave marker on a `clef=treble-8`
   * is the clearest case: drawn at pitch -2, it declares -4/-6 — a reserve four pitch
   * deeper than anything it draws. Reserving its ink box instead leaves the staff below it
   * 4 pitch too close, which is the whole of `zocharti-loch`'s tenor-to-bass gap.
   *
   * The same "reserve a fixed lane, let the ink overhang it" shape as the tuplet lane and
   * the above-staff stack.
   */
  readonly reserve?: readonly [top: number, bottom: number]
}

export interface PlacedLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly thickness: number
  /** What this line is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /** Set on a stem a BEAM retargets — see the stem case in `verticalExtent`. */
  readonly beamed?: boolean
}

/**
 * Prose — a tempo direction, and later titles, lyrics and chord symbols.
 *
 * Kept separate from `PlacedGlyph` because the two are drawn by different mechanisms and
 * for a stated reason. Musical glyphs are inline paths so the SVG is self-contained; text
 * is a real `<text>` element in a generic family, because a missing serif face degrades
 * to a different serif whereas a missing Bravura degrades to nothing legible. That
 * asymmetry is the whole argument, and abcMusicKit2 splits the same way.
 */
export interface PlacedText {
  readonly text: string
  /** What this text is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * Vertical extent this text DECLARES, replacing the box its font size implies — the
   * same escape a glyph has. `[top, bottom]` in staff spaces.
   *
   * A text DECORATION is the case: abcjs gives `D.C.` and its like a flat
   * `thickness: 3` (`decoration.js:151`), so it reserves `pitch ± 1.5` and not the font
   * size its letters occupy. Reserving the letters put `frere-jacques`'s last staff 2.08
   * pitch high.
   */
  readonly reserve?: readonly [number, number]
  readonly x: number
  /** Baseline y, staff spaces. */
  readonly y: number
  /** Font size in staff spaces. */
  readonly size: number
  readonly bold: boolean
  readonly italic: boolean
  /**
   * Horizontal alignment. Absent means `start`, which is every text the music draws —
   * only the top-text block centres a title or right-aligns a composer.
   */
  readonly anchor?: 'start' | 'middle' | 'end'
  /**
   * `%%jazzchords`' split of this chord symbol — root, modifier, `/bass`.
   *
   * Present only on a `chord` role under the directive, so an ANNOTATION never carries one:
   * abcjs runs `translateChord` on chord symbols and skips annotations outright
   * (`add-chord.js:45-46`). The modifier and the bass draw as `font-size:0.7em` tspans
   * nested in the chord's own, and each one the generator sees adds a whole LINE to the
   * measured height. See `Score.jazzChords`.
   */
  readonly jazz?: readonly [string, string, string]
  /**
   * `%%<type>font … box` — the text's own font is boxed, so `getTextSize` returns
   * `height + padding * 4` for it (`helpers/get-text-size.js:46-48`). Carried on a chord
   * symbol because its LANE is measured from that height.
   */
  readonly box?: boolean
}

export interface LayoutElement {
  readonly type: ElementType
  /**
   * Total height, for an element that is a BLOCK rather than a mark — only the top text.
   * abcjs advances its cursor by a rounded line height per row, which is more than the
   * last row's descender, so the block cannot be measured from its texts after the fact.
   */
  readonly blockHeight?: number
  /** A MID-TUNE block: it sits straight on the music, spending no `musicSpace`. */
  readonly blockAbutsMusic?: boolean
  /**
   * Absolute y of a block's TOP — its cursor origin, above the first line's ink.
   *
   * abcjs's block starts at the cursor and its first baseline is a font size below that,
   * so the space above the title's ascender is part of the block and must be reserved.
   * Without this the page began at the title's INK and every drawing sat 13.3px high.
   */
  readonly blockTop?: number
  /** Left edge, staff spaces from the system origin. */
  readonly x: number
  readonly width: number
  /**
   * The two halves `width` is the maximum of, for an element that stretches.
   *
   * abcjs advances by `max(rod, spacing * sqrt(duration * 8))` — a ROD, the element's own
   * ink plus its `minspacing`, and a SPRING, the duration advance
   * (`layout/voice-elements.js`: `x = Math.max(voice.minx, voice.nextx)`). Justification
   * scales the spring and leaves the rod alone, which is why a line cannot be stretched by
   * multiplying it: the winner can change as the factor moves, so the total width is
   * piecewise-linear in the factor and abcjs re-solves it up to 8 times.
   *
   * Absent on anything that does not stretch — a barline, a clef, a key signature. Those
   * are all rod, and `width` is it.
   */
  readonly spring?: number
  readonly rod?: number
  /**
   * How far the element's ink reaches LEFT of its own x — abcjs's `-child.extraw`.
   *
   * An accidental, a grace group or a barline's clearance sits before the thing that
   * names the element, and none of it advances the cursor: the gap the spring already
   * opened absorbs it. It pushes only when there is not enough room, which is abcjs's
   * `if (er < extraWidth) x += extraWidth - er`.
   */
  readonly left?: number
  /**
   * Staff steps of every notehead, ascending — 0 is the middle line, positive upward.
   * Empty for anything unpitched.
   *
   * ALL of them, not just the lowest, because this is what makes the structural gate
   * meaningful and a chord has more than one. Reporting a single step would leave every
   * upper notehead of every chord unverified while the suite reported MATCH — the exact
   * shape of the blind spot the parser audit found.
   */
  readonly staffSteps: readonly number[]
  readonly glyphs: readonly PlacedGlyph[]
  readonly lines: readonly PlacedLine[]
  readonly texts: readonly PlacedText[]
}

/**
 * Everything a beam needs to know about one of its members, recorded during layout so
 * the beam pass does not have to reverse-engineer it out of the drawn lines.
 */
export interface StemInfo {
  /** Index into the system's `elements`. */
  readonly element: number
  readonly x: number
  /** Staff step of the notehead furthest along the stem — where the tip is measured from. */
  readonly farStep: number
  /**
   * Mean staff step of this event's noteheads — abcjs's `abcelem.averagepitch`.
   *
   * A CHORD contributes its own mean rather than each notehead, which is what the beam's
   * slant is measured from (`calcSlant` takes the first and last elements' averages).
   */
  readonly averageStep: number
  readonly up: boolean
  /** Beams needed at this note: 1 for an eighth, 2 for a sixteenth. */
  readonly beams: number
}

/**
 * One voice's staff within a system.
 *
 * Laid out in its own coordinate space with its middle line at y = 0, and placed by
 * `originY`. Each staff carries its own clef, so a staff step means a different pitch on
 * different staves — which is exactly why the coordinate space is per staff, not shared.
 */
/**
 * A slur or tie: a lens-shaped curve, thin at the ends and thicker in the middle.
 *
 * Stored as endpoints plus a signed bulge rather than explicit control points, because
 * everything downstream wants the shape rather than the spline — the SVG backend derives
 * the two cubics, and a future canvas backend would derive its own.
 */
export interface PlacedCurve {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Height of the arc at its midpoint. NEGATIVE arcs upward, matching y-down. */
  readonly bulge: number
  readonly endThickness: number
  readonly midThickness: number
  /** A tie joins one pitch to itself; a slur spans a phrase. They differ in shape rules. */
  readonly kind: 'tie' | 'slur'
}

export interface LayoutStaff {
  /**
   * Everything drawn on this staff, in drawing order — the concatenation of `voices`.
   *
   * Most consumers want this: a renderer does not care which voice a stem belongs to.
   */
  readonly elements: readonly LayoutElement[]
  /**
   * The same elements, still split BY VOICE.
   *
   * A staff is not a voice — `%%score {1 (2 3)}` prints voices 2 and 3 on one staff — so
   * the flat list above cannot answer "what did voice 0 draw". abcjs keeps the same split
   * (`staffGroups[].voices[]`) and so does abcMusicKit v1 (`StaffDef.numVoices`), because
   * the answer is needed for stem-direction convention within a shared staff, and by any
   * gate comparing one voice against a reference.
   *
   * These hold the SAME element objects as `elements`, not copies.
   */
  readonly voices: readonly (readonly LayoutElement[])[]
  readonly staffLines: readonly PlacedLine[]
  /**
   * How many lines `staffLines` was built from — `V:… stafflines=`, 5 unless stated.
   *
   * Kept alongside the drawn rules because `staffLines` cannot be counted back: a
   * `stafflines=1` staff and a `stafflines=0` one both have a length a consumer would
   * misread, and the count is what a host asking "is this a rhythm staff" wants.
   */
  readonly staffLineCount: number
  /**
   * Beams, which belong to no single element — a beam spans several noteheads and is
   * drawn once for the group, after every member's position is known. Per staff, since
   * a beam never joins two voices.
   */
  readonly beams: readonly PlacedLine[]
  /**
   * Slurs and ties, which like beams belong to no single element — each spans from one
   * notehead to another and is resolved once every member's position is known.
   */
  readonly curves: readonly PlacedCurve[]
  /**
   * Whether a tuplet on this staff reserves abcjs's ending lane ABOVE it — declared by
   * `layoutTuplets` from abcjs's own rule, never from where the bracket was drawn.
   */
  /** A hairpin on this staff — see `StaffFurniture.hasHairpin`. */
  readonly hasHairpin: boolean
  /** Which side the dynamics lane is on. */
  readonly dynamicsAbove: boolean
  readonly tupletReservesAbove: boolean
  /** abcjs's declared box per tuplet on this staff — see `layoutTuplets`. */
  readonly tupletReserves: readonly { top: number; bottom: number }[]
  /** abcjs's declared box per tie and slur — see `curveReserves`. */
  readonly curveReserves: readonly { top: number; bottom: number }[]
  /** Tuplet brackets, and the numbers that go with them. Also span elements. */
  readonly tupletLines: readonly PlacedLine[]
  readonly tupletTexts: readonly PlacedText[]
  /**
   * Melisma extenders — one syllable held across several notes. Non-strict only; strict
   * prints a literal `_` on the syllable instead, as abcjs does.
   */
  readonly melismaLines: readonly PlacedLine[]
  /**
   * Hairpins and glissandi — decorations that SPAN, opened by one note and closed by a
   * later one, so they belong to no single element for the same reason beams do not.
   */
  readonly spannerLines: readonly PlacedLine[]
  /** Repeat-ending (volta) brackets and their labels. Span whole measures. */
  readonly voltaLines: readonly PlacedLine[]
  readonly voltaTexts: readonly PlacedText[]
  /** Vertical offset of this staff's middle line within its system. */
  readonly originY: number
}

export interface LayoutSystem {
  /** One per STAFF, top to bottom. `%%score`'s `( … )` puts several voices on one. */
  readonly staves: readonly LayoutStaff[]
  /**
   * Braces and brackets at the system's left edge, joining the staves of a group.
   *
   * On the SYSTEM rather than a staff, because that is what they span: a brace over a
   * grand staff belongs to neither of its two staves. abcjs draws both — a curvy path for
   * the brace, verified against its rendered SVG — and so does abcMusicKit v1, whose
   * `drawBraces` ports the same element.
   */
  readonly connectorGlyphs: readonly PlacedGlyph[]
  readonly connectorLines: readonly PlacedLine[]
  /** Width of this system, staff spaces. Systems wrap, so they differ. */
  readonly width: number
  /**
   * Vertical offset of this system within the whole drawing.
   *
   * Each system is laid out in its OWN coordinate space and stacked by translation. That
   * keeps every position within a system independent of how many systems precede it, so
   * a break inserted earlier cannot shift the geometry of a later one — which would
   * otherwise churn every baseline below the break.
   */
  readonly originY: number
}

export interface Layout {
  readonly systems: readonly LayoutSystem[]
  /** Bounding box in staff spaces; the SVG backend applies the scale. */
  readonly width: number
  readonly height: number
  /** y of the topmost content — the SVG backend translates by this. */
  readonly top: number
}

/** Staff step → y, in staff spaces. Higher pitch is lower y. */
export const stepToY = (step: number): number => -step * ENGRAVE.spacePerStep

/** Middle line to outer staff line, in staff spaces — the staff is four spaces tall. */
const STAFF_HALF_HEIGHT = 2

/** abcjs's staff space in pixels — the unit its published constants are given in. */

/**
 * Text box estimate, in multiples of the font size — the renderer's CONTRACT for how
 * tall text is, since there are no real metrics and abcjs measures where we estimate.
 *
 * Exported because anything reserving space for text has to use the same numbers. A test
 * that assumed a full em above the baseline while the extent reserved 0.8 reported a
 * title clipped by 0.48 spaces that was not clipped by anything the renderer does.
 *
 * 0.8 is not a guess to be made safer: raising it to 1.0 moves every drawing 3.7px down
 * and takes eight fixtures from a y offset of ~0.5px to ~3.2px against abcjs. It is the
 * value that matches what abcjs's own measured text does.
 */
export const TEXT_ASCENT = 0.8
export const TEXT_DESCENT = 0.25

// ─── Pitch → staff position ──────────────────────────────────────────────────

/**
 * Diatonic index: steps above C0, so it orders and subtracts cleanly across octaves.
 * Middle line of a treble staff is B4 → index 34.
 */
const diatonicIndex = (p: Pitch): number => stepIndex(p.step) + 7 * p.octave

/**
 * Which pitch sits on a clef's own line: a G clef marks G4, an F clef F3, a C clef C4.
 * That single fact, plus the line the clef sits on, positions every note on the staff.
 */
const CLEF_REFERENCE: Readonly<Record<ClefShape, number>> = {
  // Diatonic indices: G4 = 4 + 7*4, F3 = 3 + 7*3, C4 = 0 + 7*4.
  G: 32,
  F: 24,
  C: 28,
  // UNPITCHED CLEFS STILL MAP LIKE TREBLE — only the glyph is absent.
  //
  // abcjs's table gives `perc` and `none` `mid: 0`, the same as treble
  // (`abc_parse_key_voice.js:36,42`), and `none` carries no `pitch` at all. Measured on
  // its own output: `K:C perc` and `K:C none` both put `B4` 15.49px below the top staff
  // line, exactly where `K:C` puts it. The whole visible difference between them and
  // treble is the CLEF's own reserve — 13.7244 pitch against a bare staff's 10.
  //
  // Reading them as a C clef on the middle line — "so notes land somewhere sane" — put
  // every note 3 staff spaces high, and the staff under it ~11.8px low in compensation.
  percussion: 32,
  none: 32,
}

/**
 * The diatonic index that lands on the middle staff line, for a given clef.
 *
 * The clef's reference pitch sits on its own line, and staff line `n` is `(n - 3) * 2`
 * steps from the middle line, so the middle line carries `reference - (line - 3) * 2`.
 *
 * Treble checks out as B4: G clef, line 2, so 32 - (2-3)*2 = 34, which is B4. Bass as
 * D3: F clef, line 4, 24 - (4-3)*2 = 22. And that second number is what makes
 * `score-reorder` agree with abcjs — `C,,` is index 14, so 14 - 22 = -8, exactly the
 * step abcjs records, where the old hardcoded treble constant gave -20.
 */
export const middleLineIndex = (clef: Clef): number =>
  clef.middleOverride ?? CLEF_REFERENCE[clef.shape] - (clef.line - 3) * 2

const pitchToStep = (p: Pitch, clef: Clef): number => diatonicIndex(p) - middleLineIndex(clef)

// ─── Duration → notehead ─────────────────────────────────────────────────────

interface NoteGlyphSpec {
  readonly head: GlyphName
  readonly stemmed: boolean
  /** Number of flags: 1 for an eighth, 2 for a sixteenth, 0 for a quarter or longer. */
  readonly flags: number
  /** Augmentation dots — 1 for a dotted quarter, 2 for a double-dotted one. */
  readonly dots: number
}

/** True for 1, 2, 4, 8, … and nothing else. */
const isPowerOfTwo = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0

/**
 * Split a written duration into the note value that is printed and its dots.
 *
 * A dot adds half of what precedes it, so `d` dots on a base `b` sound
 * `b × (2^(d+1) − 1) / 2^d`. Reduced, that puts an ODD numerator of the form
 * 2^(d+1)−1 — 1, 3, 7, 15 — over a power of two. So the numerator alone names the dot
 * count and the denominator then yields the base:
 *
 *   3/8  → numerator 3 = 2^2−1 → 1 dot,  base 1/4  (dotted quarter)
 *   7/16 → numerator 7 = 2^3−1 → 2 dots, base 1/4  (double-dotted quarter)
 *   3/4  → numerator 3          → 1 dot,  base 1/2  (dotted half)
 *
 * Deriving it rather than tabling the handful of common cases costs no more code and
 * gets double dots and dotted breves for free.
 *
 * Returns null when the numerator is not 2^(d+1)−1 or the denominator is not a power of
 * two — a value no combination of dots can write. That is not the same as a tuplet:
 * `notatedDuration` excludes tuplet scaling by contract, so a triplet eighth arrives
 * here as a plain 1/8 and its ratio never reaches this function.
 */
function splitDots(notated: Rational): { base: Rational; dots: number } | null {
  const { numerator, denominator } = notated
  if (numerator <= 0 || denominator <= 0) return null

  // Split the numerator into its power-of-two part and its ODD part. Only the odd part
  // can carry dots, since 2^(d+1)−1 is always odd — which is what lets a breve (2/1) and
  // a dotted quarter (3/8) be told apart: odd parts 1 and 3.
  let odd = numerator
  while (odd % 2 === 0) odd /= 2
  if (!isPowerOfTwo(odd + 1)) return null

  const dots = Math.log2(odd + 1) - 1
  const base = rational(numerator * 2 ** dots, denominator * odd)

  // The base must be a plain note value — a power of two either side. Anything else is a
  // duration no combination of notehead and dots can write.
  if (!isPowerOfTwo(base.numerator) || !isPowerOfTwo(base.denominator)) return null
  return { base, dots }
}

/**
 * Written duration → notehead, stem, flag count and dots.
 *
 * Returns `null` for a duration no notehead can express. Callers must handle that rather
 * than fall back to a quarter: silently drawing a dotted half as a half is wrong OUTPUT,
 * which is worse than an absent feature, and the structural gate would never catch it
 * because the staff position is still right.
 */
export function noteGlyph(notated: Rational): NoteGlyphSpec | null {
  // A ZERO-LENGTH NOTE IS A STEMLESS QUARTER HEAD, and it has to be tested BEFORE
  // `splitDots`, which rejects a zero numerator as a duration no notehead can write.
  //
  // `C0` is legal ABC and abcjs keeps it:
  // `if (duration === 0) { zeroDuration = true; duration = 0.25; nostem = true; }`, with
  // its own comment "zero duration will draw a quarter note head"
  // (`abstract-engraver.js:790-791`), and then `chartable[style].nostem`, which for a
  // plain note is `noteheads.quarter` (`:36`). We drew nothing at all, so half the notes
  // in abcjs's own `parse/note.test.js` fixture never reached the page.
  //
  // ponytail: abcjs also SPACES it as a quarter, by rewriting `duration` before spacing
  // runs. Ours still spaces it at zero — the head is content, the advance is geometry,
  // and no fixture measures the second yet.
  if (notated.numerator === 0) return { head: 'noteheadBlack', stemmed: false, flags: 0, dots: 0 }

  const split = splitDots(notated)
  if (split === null) return null
  const { base, dots } = split

  const whole = ratToNumber(base)
  if (!(whole > 0)) return null
  if (whole >= 1) return { head: 'noteheadWhole', stemmed: false, flags: 0, dots }

  // 1/2 → 1, 1/4 → 2, 1/8 → 3 …
  const log = Math.log2(1 / whole)
  if (!Number.isInteger(log)) return null

  if (log === 1) return { head: 'noteheadHalf', stemmed: true, flags: 0, dots }
  return { head: 'noteheadBlack', stemmed: true, flags: Math.max(0, log - 2), dots }
}

/**
 * Augmentation dots for one notehead, starting at `x`.
 *
 * A dot NEVER sits on a staff line — it goes in the space beside the notehead, so a note
 * on a line takes its dot in the space above. Even staff steps are lines (0 is the middle
 * line, ±2 and ±4 the others) and odd steps are spaces, so the rule is simply: bump an
 * even step up by one.
 */
function dotGlyphs(count: number, x: number, step: number, taken: Set<number>): PlacedGlyph[] {
  let dotStep = step % 2 === 0 ? step + 1 : step
  // ponytail: in a chord, two notes a second apart can want the same dot space — one is
  // on a line and bumps up onto its neighbour's. Moved up a space rather than solved
  // properly; engraving has finer rules for dot columns. No corpus fixture has one.
  while (taken.has(dotStep)) dotStep += 2
  taken.add(dotStep)

  const out: PlacedGlyph[] = []
  for (let i = 0; i < count; i++) {
    out.push({ ...glyphAt('augmentationDot', x + i * ENGRAVE.dotSpacing, dotStep), role: 'dot' })
  }
  return out
}

/**
 * A note's natural horizontal width for its duration — the spring, before justification.
 *
 * `spacingScale · √(duration / reference)`, floored by the rod. Uses SOUNDING duration,
 * not written: three triplet eighths occupy the time of two and get the space of two,
 * which is what makes a tuplet look like one.
 *
 * The base cap in abcm2ps's full model (`reference = max(absolute, shortest/4)`) only
 * bites on a line whose shortest note is longer than a quarter. ponytail: not
 * implemented — every corpus fixture has something a quarter or shorter, so the cap
 * would never fire. Add it with the line's shortest note when a long-only tune appears.
 */
export function naturalWidth(
  duration: Rational,
  spacingScale: number = ENGRAVE.spacingScale,
): number {
  return springForDuration(ratToNumber(duration), spacingScale)
}

/**
 * The same curve from a plain number, for a duration that is no longer a written note's.
 *
 * A voice waiting through another's shorter notes has only PART of its duration left to
 * spend, and abcjs recomputes its expectation from that remainder
 * (`othervoices[i].spacingduration -= spacingduration; updateNextX(...)`). The remainder is
 * arithmetic on durations already spent, not a notated value, so it arrives as a float.
 */
export function springForDuration(d: number, spacingScale: number = ENGRAVE.spacingScale): number {
  if (!(d > 0)) return ENGRAVE.minColumnGap
  return Math.max(ENGRAVE.minColumnGap, spacingScale * Math.sqrt(d / ENGRAVE.spacingReference))
}

// ─── Element builders ────────────────────────────────────────────────────────

const glyphAt = (name: GlyphName, x: number, step: number): PlacedGlyph => ({
  name,
  x,
  y: stepToY(step),
})

const CLEF_GLYPHS: Readonly<Record<ClefShape, GlyphName | null>> = {
  G: 'gClef',
  F: 'fClef',
  C: 'cClef',
  // `clef=perc` DRAWS — `case 'perc': clef = "clefs.perc"` (`create-clef.js:26`) — and
  // its 21px is 26 of prefix once the clef's own `dx = 5` is on it. We drew nothing and
  // took no width: `visual-tablature-12` slid 36px left on that alone.
  percussion: 'unpitchedPercussionClef1',
  // `case 'none': return null` — abcjs builds NO clef element at all, so it takes no
  // prefix width either (`create-clef.js:27`). Not "an element that draws nothing".
  none: null,
}

/**
 * How far a clef's declared bottom sits below the line it marks, in PITCH.
 *
 * abcjs's `clefOffsets` (`creation/create-clef.js:61-69`). Nothing to do with where the
 * glyph is DRAWN — it is the offset the clef's `RelativeElement` declares its extent from,
 * and the octave marker below a `-8` clef is positioned off that declared bottom rather
 * than off any ink.
 */

/** abcjs draws the octave marker at two thirds size (`create-clef.js:39`). */
const OCTAVE_MARKER_SCALE = 2 / 3

function layoutClef(x: number, clef: Clef, strict = true): LayoutElement | null {
  const name = CLEF_GLYPHS[clef.shape] ?? null
  if (name === null) return null
  // Every SMuFL clef's origin sits on the line it marks, so the glyph goes exactly where
  // the clef's line is — no per-clef offsets. Line n is (n - 3) * 2 steps from the middle.
  const step = (clef.line - 3) * 2
  /** abcjs PITCH -> our y. The bottom staff line is pitch 2, and a pitch is half a step. */
  const pitchStep = (pitch: number): number => stepToY(pitch - 6)
  // THE CLEF RESERVES A DECLARED BOX, NOT ITS INK.
  //
  // `createClef` hands the clef's RelativeElement `{ top: height + clefPos + ofs, bottom:
  // clefPos + ofs }` with `ofs` a hardcoded per-clef constant — −5 for G, −4 for C and F,
  // −2 for perc (`create-clef.js:37,62-70`). That is NOT the glyph's box: for the treble
  // clef it comes to 14.7244 + 4 − 5 = 13.7244 pitch, where the outline's own top is
  // 4.8387 spaces above the G line, 0.0235 of a space less.
  //
  // And the clef is what sets the staff's top on any tune with nothing above the staff —
  // probed on `simple-c`, where `staff.top` is raised to 13.7244 BY THE CLEF and by nothing
  // else, stems included. So that 0.0235 of a space was the whole vertical offset on eight
  // fixtures: they sat a uniform 0.184px high, staff lines and noteheads together.
  const clefBottom = 2 * clef.line + (ABCJS_CLEF_OFFSET_PITCH[clef.shape] ?? 0)
  // …AND THE HEIGHT IN THAT BOX IS THE PUBLISHED `h`, NOT THE INK BOX.
  // `symbolHeightInPitches` reads `glyphs[symbol].h` (`glyphs.js:161-164`), which for the
  // G clef is 57.057px against a derived ink box of 57.09 — 0.033px, a two-hundredth of a
  // staff space, and the SYSTEMIC `oy` that every fixture in the harvested corpus carried.
  const clefTop = clefBottom + 2 * (glyphsFor(strict).get(name)?.declaredHeight ?? 0)
  const glyphs: PlacedGlyph[] = [
    {
      ...glyphAt(name, x + ENGRAVE.clefIndent, step),
      reserve: [pitchStep(clefTop), pitchStep(clefBottom)],
    },
  ]

  // `clef=treble-8` and friends: a small `8` under (or over) the clef.
  //
  // Source: `creation/create-clef.js:39-56`. Its arithmetic is in abcjs PITCH, where the
  // bottom staff line is 2 and the clef's own line is `2 x clef.line`; a pitch is half a
  // staff step here, hence `pitchStep`. The clef element's declared bottom is its line plus
  // `CLEF_PITCH_OFFSET`, and the marker hangs one pitch under that while RESERVING from
  // three under it down to five — a reserve that does not bracket its own ink, which is
  // why it is declared rather than measured. See `PlacedGlyph.reserve`.
  if (clef.octaveShift !== 0) {
    const up = clef.octaveShift > 0
    const anchor = up ? clefTop + 3 : clefBottom - 3
    // `bass-8` hugs the clef instead of hanging off it — abcjs's own exception (`:45-48`).
    const bassEight = clef.shape === 'F' && !up
    const drawPitch = bassEight ? 3 : up ? clefTop + 3 : clefBottom - 1
    const width = glyphsFor(strict).advance('timeSig8') * OCTAVE_MARKER_SCALE
    const adjust = bassEight ? 0 : (glyphsFor(strict).advance(name) - width) / 2
    glyphs.push({
      name: 'timeSig8',
      x: x + ENGRAVE.clefIndent + adjust,
      y: pitchStep(drawPitch),
      scale: OCTAVE_MARKER_SCALE,
      role: 'clef',
      // `top` is `anchor`, `bottom` is `anchor - 2` — in PITCH, so y-down reverses them.
      reserve: [pitchStep(anchor), pitchStep(anchor - 2)],
    })
  }

  return {
    type: 'clef',
    x,
    // The octave marker does NOT widen the clef: abcjs fixes the element at `w: 10` and
    // adds the `8` inside it (`create-clef.js:11`), so the music behind it does not move.
    width: ENGRAVE.clefIndent + glyphsFor(strict).advance(name),
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
  }
}

const DIGIT_GLYPHS = [
  'timeSig0',
  'timeSig1',
  'timeSig2',
  'timeSig3',
  'timeSig4',
  'timeSig5',
  'timeSig6',
  'timeSig7',
  'timeSig8',
  'timeSig9',
] as const satisfies readonly GlyphName[]

/** Glyph names for a meter number's digits. A negative or fractional meter cannot occur. */
const digitNames = (value: number): GlyphName[] =>
  String(value)
    .split('')
    .map((d) => DIGIT_GLYPHS[Number(d)] ?? 'timeSig0')

const totalAdvance = (names: readonly GlyphName[], strict = true): number =>
  names.reduce((sum, name) => sum + glyphsFor(strict).advance(name), 0)

/** Digits laid out left to right, the group centred on `centre`. */
function digitGlyphs(
  names: readonly GlyphName[],
  centre: number,
  step: number,
  strict = true,
): PlacedGlyph[] {
  let cursor = centre - totalAdvance(names) / 2
  return names.map((name) => {
    // A TIME-SIGNATURE DIGIT RESERVES A BOX CENTRED ON ITS PITCH, not its ink.
    //
    // abcjs builds it as `RelativeElement(num, x, w, 8, { thickness:
    // symbolHeightInPitches(num[0]) })` (`create-time-signature.js:25`), and `thickness`
    // means `top = pitch + t/2, bottom = pitch - t/2` (`relative-element.js:22`). So the
    // digit reserves half its height either side of the pitch it sits on and no more.
    //
    // Our ink box reached 7.31px ABOVE the top staff line, and on a staff with nothing
    // else above it that was the whole of the staff's top: `score-reorder`'s bass staff
    // sat 7.3px low against abcjs, which puts `staff.top` at exactly 10.0 there — the top
    // line, set by a barline, with the time signature under it.
    const glyph = glyphsFor(strict).get(name) ?? bravuraDeclared(name)
    const y = stepToY(step)
    const placed: PlacedGlyph = {
      ...glyphAt(name, cursor, step),
      reserve: [y - glyph.declaredHeight / 2, y + glyph.declaredHeight / 2],
    }
    cursor += glyphsFor(strict).advance(name)
    return placed
  })
}

function layoutMeter(x: number, meter: Meter): LayoutElement {
  // AN ADDITIVE METER IS DRAWN TERM BY TERM. abcjs keeps the numerator as the string it
  // was written as — the golden's own `data-name="2+3"` — and lays out one glyph per
  // character (`create-time-signature.js:17-27`). Summing to `5` cost `2+3/8` 17.08px of
  // prefix and moved every note on the line.
  const top =
    meter.numeratorParts === undefined
      ? digitNames(meter.numerator)
      : meter.numeratorParts.flatMap((part, i) =>
          i === 0 ? digitNames(part) : ['timeSigPlus' as GlyphName, ...digitNames(part)],
        )
  const bottom = digitNames(meter.denominator)
  const width = Math.max(totalAdvance(top), totalAdvance(bottom))
  const centre = x + width / 2
  // Numerator and denominator centre on steps +2 and -2 — symmetric about the middle
  // line, each filling half the staff. Standard engraving.
  return {
    type: 'timeSignature',
    x,
    width,
    staffSteps: [],
    glyphs: [...digitGlyphs(top, centre, 2), ...digitGlyphs(bottom, centre, -2)],
    lines: [],
    texts: [],
  }
}

// ─── Key signature ───────────────────────────────────────────────────────────

/**
 * Staff steps for accidentals in a key signature, in the order they are written.
 *
 * Sharps run F C G D A E B and flats the reverse, each at a fixed staff position — the
 * placement is conventional, not derived, and is the same in every book. These are the
 * TREBLE positions; `keySignatureShift` moves them for any other clef.
 */
const SHARP_STEPS = [4, 1, 5, 2, -1, 3, 0] as const
const FLAT_STEPS = [0, 3, -1, 2, -2, 1, -3] as const
/** The order the two signatures are written in — F C G D A E B, and its mirror. */
const SHARP_ORDER: readonly DiatonicStep[] = ['f', 'c', 'g', 'd', 'a', 'e', 'b']
const FLAT_ORDER: readonly DiatonicStep[] = ['b', 'e', 'a', 'd', 'g', 'c', 'f']
/**
 * Where a letter's key accidental sits, which depends on the SIGN: `g` is step 5 as a
 * sharp and −2 as a flat, because the two signatures are written in opposite octaves.
 */
const keyStepOf = (letter: DiatonicStep, sharp: boolean): number =>
  sharp
    ? (SHARP_STEPS[SHARP_ORDER.indexOf(letter)] ?? 0)
    : (FLAT_STEPS[FLAT_ORDER.indexOf(letter)] ?? 0)

/** A `K:` field's explicit accidental, in QUARTER tones, to the glyph abcjs draws. */
const KEY_ACCIDENTAL_GLYPH: Readonly<Record<number, GlyphName>> = {
  [-4]: 'accidentalDoubleFlat',
  [-2]: 'accidentalFlat',
  [-1]: 'accidentalQuarterToneFlatStein',
  [0]: 'accidentalNatural',
  [1]: 'accidentalQuarterToneSharpStein',
  [2]: 'accidentalSharp',
  [4]: 'accidentalDoubleSharp',
}

/** Position on the circle of fifths for a natural step: F=-1, C=0, G=1, D=2 … */
const NATURAL_FIFTHS: Readonly<Record<DiatonicStep, number>> = {
  f: -1,
  c: 0,
  g: 1,
  d: 2,
  a: 3,
  e: 4,
  b: 5,
}

/** How far each mode sits from major on the circle. D dorian has no accidentals, so -2. */
const MODE_FIFTHS: Readonly<Record<Mode, number>> = {
  lydian: 1,
  major: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  phrygian: -4,
  locrian: -5,
}

/**
 * Signed accidental count for a key: positive is that many sharps, negative that many
 * flats. Derived from the circle of fifths rather than a lookup table of key names,
 * which is abcMusicKit2's approach and the reason `KeySignature` stores a tonic and a
 * mode instead of an accidental list.
 */
export function keyFifths(key: KeySignature): number {
  if (key.none) return 0
  // Each sharp on the tonic moves it seven places round the circle: C→C# is 0→7.
  const fifths = NATURAL_FIFTHS[key.tonic.step] + 7 * key.tonic.accidental + MODE_FIFTHS[key.mode]
  // Beyond ±7 the signature would need double accidentals. Real ABC does reach K:A#
  // (10 sharps); clamping draws seven rather than indexing off the end of the table.
  return Math.max(-7, Math.min(7, fifths))
}

/**
 * How far a key signature's accidentals shift for a clef, in staff steps.
 *
 * The written positions are conventional in treble; in another clef the same pitch
 * classes land elsewhere, and the signature follows the pitch, not the position. Two
 * clefs' middle lines differ by a whole number of diatonic steps, so the shift is that
 * difference reduced mod 7 and folded into [-3, 3] — which picks the octave that keeps
 * the accidentals on or near the staff.
 *
 * Bass works out to -2, giving F# on the fourth line and C# in the second space, the
 * standard pattern. Alto gives -1.
 *
 * ponytail: TENOR is genuinely irregular. Engravers drop some of its accidentals an
 * octave to avoid ledger lines, and no single shift reproduces that. This formula puts
 * them an octave high. No corpus fixture uses a tenor key signature; fix it when one does.
 */
/**
 * Last-resort metrics for a glyph NEITHER table carries — zeros rather than a crash.
 *
 * Both tables already fall back to Bravura, so this only fires on a name that is in
 * neither, which the glyph-map test asserts cannot happen. It exists so the reserve sites
 * can read `declaredHeight` unconditionally.
 */
const bravuraDeclared = (name: GlyphName) => {
  const g = GLYPHS[name]
  return { height: g?.height ?? 0, declaredHeight: g?.height ?? 0 }
}

function keySignatureShift(clef: Clef): number {
  const delta = middleLineIndex(defaultClef) - middleLineIndex(clef)
  const wrapped = ((delta % 7) + 7) % 7
  return wrapped > 3 ? wrapped - 7 : wrapped
}

/**
 * The box a key-signature accidental reserves — abcjs's, not its ink.
 *
 * `top = verticalPos + symbolHeightInPitches(symbol) + fudge`, `bottom = verticalPos +
 * fudge`, where the fudge is a constant per accidental (`create-key-signature.js:17-23`):
 * a sharp's box starts 3 pitches BELOW its line, a flat's 1.2. A pitch is one staff step.
 */

function keyAccidentalReserve(name: GlyphName, step: number, strict: boolean): [number, number] {
  const glyph = glyphsFor(strict).get(name) ?? bravuraDeclared(name)
  const fudge = ABCJS_KEY_ACCIDENTAL_FUDGE_PITCH[name] ?? 0
  // `symbolHeightInPitches` is the PUBLISHED `h / STEP`, and ours is in staff spaces —
  // twice that. The published figure, not the ink box: a sharp declares 20.15 against an
  // ink box of 20.19, which is the extra 0.04px a sharp key signature was adding.
  return [stepToY(step + 2 * glyph.declaredHeight + fudge), stepToY(step + fudge)]
}

function layoutKeySignature(
  x: number,
  key: KeySignature,
  clef: Clef,
  strict = true,
): LayoutElement | null {
  const fifths = keyFifths(key)
  const shift = keySignatureShift(clef)
  const sharps = fifths > 0
  const name: GlyphName = sharps ? 'accidentalSharp' : 'accidentalFlat'
  const written: { name: GlyphName; step: number; letter: DiatonicStep }[] = (
    sharps ? SHARP_ORDER : FLAT_ORDER
  )
    .slice(0, Math.abs(fifths))
    .map((letter) => ({ name, step: keyStepOf(letter, sharps) + shift, letter }))

  // EXPLICIT ACCIDENTALS on the field REPLACE a standard one on the same letter, or are
  // appended (`abc_parse_key_voice.js:320-350`). Their own position follows the accidental's
  // SIGN, since a sharp and a flat sit an octave apart for several letters — `g` is step 5
  // sharp and −2 flat.
  for (const acc of key.extra ?? []) {
    const glyph = KEY_ACCIDENTAL_GLYPH[acc.quarters] ?? 'accidentalNatural'
    const entry = {
      name: glyph,
      step: keyStepOf(acc.step, acc.quarters > 0) + shift,
      letter: acc.step,
    }
    const at = written.findIndex((w) => w.letter === acc.step)
    if (at >= 0) written[at] = entry
    else written.push(entry)
  }
  if (written.length === 0) return null // C major and K:none both draw nothing.

  let cursor = x
  const glyphs: PlacedGlyph[] = written.map((w) => {
    const at = cursor
    cursor += glyphsFor(strict).advance(w.name) + ENGRAVE.keySignatureGap
    return {
      ...glyphAt(w.name, at, w.step),
      // A KEY-SIGNATURE ACCIDENTAL RESERVES A DECLARED BOX TOO — abcjs's
      // `{ top: verticalPos + symbolHeightInPitches + fudge, bottom: verticalPos + fudge }`
      // (`create-key-signature.js:25`), with `fudge` a per-accidental constant: -3 for a
      // sharp, -1.2 for a flat. Its height is in PITCHES, which are our steps.
      reserve: keyAccidentalReserve(w.name, w.step, strict),
    }
  })

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: cursor - x - ENGRAVE.keySignatureGap,
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
  }
}

/**
 * A mid-tune key change: naturals for what the old key had and the new one drops, then
 * the new key's own accidentals.
 *
 * The naturals are the whole reason this is not just `layoutKeySignature` at a different
 * x. Going from D (F#, C#) to G (F#) has to CANCEL the C# — print a natural on C — or a
 * reader carries the sharp forward and plays the wrong note. Going to C major cancels
 * everything and is nothing but naturals, which is why `layoutKeySignature` returning
 * null for C is right there and wrong here.
 *
 * Sharps to flats (or back) cancels ALL of them, not the numeric difference: the two
 * signatures share no step, so every outgoing accidental is dropped.
 */
function layoutKeyChange(
  x: number,
  from: KeySignature,
  to: KeySignature,
  clef: Clef,
  strict = true,
): LayoutElement | null {
  // A `K:` that restates the key in force prints NOTHING. This is not an optimisation —
  // it is the difference between correct and a duplicated key signature in the middle of
  // a bar. Three fixtures reach it and none of them is about key changes: a per-voice
  // `K:G clef=treble` on each of two voices makes the second one a "change" from G to G
  // (`multi-voice-rest-collision`), and `clefs` restates the key per voice the same way.
  //
  // Compared on FIFTHS, not on the key object: `K:G` and `K:Em` are the same signature in
  // different modes, and a reader sees no accidental change between them, so neither
  // should the page.
  if (keyFifths(from) === keyFifths(to)) return null

  const shift = keySignatureShift(clef)
  const stepsFor = (key: KeySignature): { step: number; sharp: boolean }[] => {
    const fifths = keyFifths(key)
    const sharp = fifths > 0
    return (sharp ? SHARP_STEPS : FLAT_STEPS)
      .slice(0, Math.abs(fifths))
      .map((step) => ({ step: step + shift, sharp }))
  }
  const outgoing = stepsFor(from)
  const incoming = stepsFor(to)
  // Compared on step AND sign: a step that was sharp and is now flat is not "kept", it
  // is cancelled and re-marked.
  const kept = new Set(incoming.map((entry) => `${entry.step}:${entry.sharp}`))
  const cancelled = outgoing.filter((entry) => !kept.has(`${entry.step}:${entry.sharp}`))
  if (cancelled.length === 0 && incoming.length === 0) return null

  const glyphs: PlacedGlyph[] = []
  let cursor = x
  const advance = (name: GlyphName, step: number): void => {
    // The SAME declared box the opening signature reserves — `createKeySignature` is one
    // function and abcjs calls it for a mid-tune `[K:]` too. A NATURAL's fudge is 0 and it
    // is the tall glyph, so a change that cancels anything reserves well above the staff:
    // `[K:Eb]` after `K:G` puts abcjs's top line 8.34px lower than ours did with none.
    glyphs.push({
      ...glyphAt(name, cursor, step),
      reserve: keyAccidentalReserve(name, step, strict),
    })
    cursor += glyphsFor(strict).advance(name) + ENGRAVE.keySignatureGap
  }
  for (const entry of cancelled) advance('accidentalNatural', entry.step)
  for (const entry of incoming)
    advance(entry.sharp ? 'accidentalSharp' : 'accidentalFlat', entry.step)

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: cursor - x - ENGRAVE.keySignatureGap,
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
  }
}

// ─── Tempo ───────────────────────────────────────────────────────────────────

/**
 * A tempo direction above the staff: `"Allegro"`, or a beat-unit note, `=`, and a rate.
 *
 * Zero width, matching abcjs, whose tempo element reports `w: 0` — the mark sits above
 * the music and takes no room in the horizontal spine, so it cannot push notes around.
 * Its text therefore overhangs to the right, which is also why this needs no text
 * metrics: nothing downstream depends on how wide the words turn out to be.
 */
function layoutTempo(x: number, tempo: Tempo, strict = true): LayoutElement | null {
  const glyphs: PlacedGlyph[] = []
  const texts: PlacedText[] = []
  const lines: PlacedLine[] = []

  // Above the staff, clear of anything reaching over the top line.
  const step = ENGRAVE.tempoStep
  const baseline = stepToY(step)
  let cursor = x

  if (tempo.text !== null && tempo.text !== '') {
    texts.push({
      text: tempo.text,
      x: cursor,
      y: baseline,
      size: ENGRAVE.tempoTextSize,
      bold: true,
      italic: false,
    })
    // Real per-character metrics, like everything else that measures text. This kept the
    // flat half-em-per-character estimate after `textWidth` replaced it everywhere else —
    // a stale ponytail that was still running, not just still written.
    cursor += textWidth(tempo.text, ENGRAVE.tempoTextSize, 'serifBold') + 1
  }

  if (tempo.bpm !== null) {
    // THE BEAT-UNIT NOTE IS A 0.75-SCALE MINIATURE FIVE PITCHES BELOW THE RESERVED TOP,
    // and its stem is a flat 3.5 pitch — not the note geometry the staff uses.
    //
    // abcjs builds it in `tempo-element.js:24-59`: `temposcale = 0.75` on the head, a stem
    // from `1/3 * scale` to `5 * scale` — 0.25 to 3.75 pitch above the head — hung off
    // `tempoNote.dx + tempoNote.w`, the scaled head's right edge, and an advance of
    // `note.w + 5` before the rate (`draw/tempo.js:29`). The head's own pitch is
    // `element.pitch - totalHeightInPitches + 1` (`set-upper-and-lower-elements.js:209`),
    // which is five pitch below the top the mark reserved — the same point
    // `verticalExtent` reads back off this baseline.
    //
    // Measured against abcjs's own SVG on `ragtime-nightingale`, all four to 0.01px: head
    // centre 2.625px above the rate's baseline, stem spanning y 98.52 to 112.09, its left
    // edge at 122.96, and the rate at x 128.56.
    const spec = tempo.beatUnit === null ? null : noteGlyph(tempo.beatUnit)
    if (spec !== null) {
      const headAdvance = glyphsFor(strict).advance(spec.head) * ENGRAVE.tempoNoteScale
      const noteY =
        baseline - ENGRAVE.tempoTextSize - ENGRAVE.tempoDescenderBump + 5 * ENGRAVE.spacePerStep
      glyphs.push({ name: spec.head, x: cursor, y: noteY, scale: ENGRAVE.tempoNoteScale })
      if (spec.stemmed) {
        lines.push({
          role: 'stem',
          x1: cursor + headAdvance,
          y1: noteY - 0.25 * ENGRAVE.spacePerStep,
          x2: cursor + headAdvance,
          y2: noteY - 3.75 * ENGRAVE.spacePerStep,
          thickness: LINE_WEIGHTS.stem,
        })
      }
      // ponytail: no FLAG or DOT on the beat-unit note, so `Q:1/8=66` draws a bare stem
      // where abcjs draws an eighth. Probed on `S7-voices`, ready to land: abcjs adds a
      // second scaled symbol at `dx = headAdvance - 0.6px` and pitch `noteY + 5.25`, and
      // the element's width becomes `dx + flagWidth` (`flags.u8th` w 6.692 unscaled) so
      // the rate moves right with it. `tempo-element.js:32-49` also maps `3/8`, `3/16`
      // and `3/32` to a DOT. No pixel-gated fixture has a non-quarter `Q:` — S7-voices is
      // baseline-only — so it lands blind until one does.
      cursor += headAdvance + ENGRAVE.tempoNoteGap
    }
    texts.push({
      text: `= ${tempo.bpm}`,
      x: cursor,
      y: baseline,
      size: ENGRAVE.tempoTextSize,
      bold: false,
      italic: false,
    })
  }

  if (glyphs.length === 0 && texts.length === 0) return null
  return { type: 'tempo', x, width: 0, staffSteps: [], glyphs, lines, texts }
}

/**
 * A `P:` part label above the staff. Zero width, like the tempo mark and for the same
 * reason: abcjs reports `w: 0`, and a label must not push the music it labels.
 */
const layoutPart = (x: number, label: string): LayoutElement => ({
  type: 'part',
  x,
  width: 0,
  staffSteps: [],
  glyphs: [],
  lines: [],
  texts: [
    {
      text: label,
      x,
      y: stepToY(ENGRAVE.partStep),
      // `partsfont`, whatever the tune set — `%%partsfont sans-serif 29 box` is 26.45px of
      // part lane over the 15pt default.
      size: fontSizeOf('partsfont'),
      bold: true,
      italic: false,
    },
  ],
})

// ─── Rests ───────────────────────────────────────────────────────────────────

/**
 * Written duration → rest glyph and the staff step its origin sits on.
 *
 * The step is not a free choice: SMuFL designs each rest around its origin, so a whole
 * rest's ink hangs BELOW the origin (bbox -0.54 to 0.036) and a half rest's sits ABOVE
 * it (-0.008 to 0.568). Putting the whole rest on step 2 and the half on step 0 is what
 * makes the first hang from the fourth line and the second sit on the middle line, which
 * is the engraving convention. The shorter rests are drawn about their own centre.
 *
 * NOTE this is a different convention from abcjs, which anchors every rest at its pitch
 * 7 regardless of duration, because its glyphs have different origins. Rest POSITION is
 * therefore not comparable between the two engines; the structural gate compares only
 * that a rest is present. See the gate's blind-spot list.
 */
function restGlyph(notated: Rational): { name: GlyphName; step: number; dots: number } | null {
  const split = splitDots(notated)
  if (split === null) return null
  const { base, dots } = split

  const whole = ratToNumber(base)
  if (!(whole > 0)) return null
  if (whole >= 1) return { name: 'restWhole', step: 2, dots }

  const log = Math.log2(1 / whole)
  if (!Number.isInteger(log)) return null

  const byLog: Readonly<Record<number, GlyphName>> = {
    1: 'restHalf',
    2: 'restQuarter',
    3: 'rest8th',
    4: 'rest16th',
  }
  const name = byLog[log]
  if (!name) return null
  return { name, step: 0, dots }
}

function layoutRest(rest: Rest, advance: number, x: number, strict = true): LayoutElement {
  // `x` and `y` occupy horizontal space but print nothing; a spacer prints nothing and
  // is not even a rest musically. Both still advance, so following notes stay put.
  const invisible = rest.kind === 'invisible' || rest.kind === 'invisibleMultiMeasure'
  const spec = invisible || rest.kind === 'spacer' ? null : restGlyph(rest.notatedDuration)

  const glyphs: PlacedGlyph[] = []
  // A REST CARRIES ITS CHORD SYMBOL AND ANNOTATIONS. abcjs calls `addChord` on every
  // abselem it builds, rest included (`abstract-engraver.js:853`), so `"Eb7"z` prints the
  // chord and reserves the whole chord lane — 22.4px of staff on a tune that opens that
  // way, and the mark itself was lost outright before this.
  const textSpan = { left: 0, right: 0 }
  const restWidth = spec === null ? 0 : glyphsFor(strict).width(spec.name)
  const texts: PlacedText[] = noteText(rest, x, restWidth, strict, textSpan)
  // A MULTI-MEASURE REST IS A BAR AND A COUNT, both hung off one `mmWidth`.
  //
  // abcjs (`abstract-engraver.js:593-598`) puts the glyph at `dx = mmWidth`, declares it
  // `mmWidth * 2` wide and pitch 7, and adds the count as a `multimeasure-text` at
  // `dx = mmWidth`, width `mmWidth`, pitch 16 — where `mmWidth` is the glyph's own width,
  // 42px. So the element reaches `3 x mmWidth` to the right of its origin and the bar
  // itself starts one width in. Our pitch 7 and 16 are steps 1 and 10.
  //
  // Drawing nothing for it left `Z24` occupying a bare spring: `misc-01-barnumbers-1`'s
  // one notehead sat 75.84px right of abcjs's, and the line was too short to reach the
  // 66% fill that makes abcjs justify it at all.
  if (rest.kind === 'multiMeasure' && rest.measureCount > 0) {
    const mm = glyphsFor(strict).width('restHBar')
    glyphs.push(glyphAt('restHBar', x + mm, 1))
    texts.push({
      text: String(rest.measureCount),
      x: x + mm,
      y: stepToY(10),
      size: ENGRAVE.tempoTextSize,
      bold: true,
      italic: false,
      anchor: 'middle',
      // A POINT at its pitch: abcjs's `multimeasure-text` is a bare `RelativeElement` with
      // no thickness, so `top === bottom === pitch` (`relative-element.js:18-21`).
      reserve: [stepToY(10), stepToY(10)],
    })
    return {
      type: 'rest',
      x,
      // `w = 126` measured, exactly `3 x mmWidth`: the glyph sits one width in and is two
      // wide (`addHead(new RelativeElement(c, mmWidth, mmWidth * 2, 7))`).
      width: Math.max(advance, 3 * mm + ENGRAVE.noteRodGap),
      spring: advance,
      // `minspacing: 1` like any note — abcjs adds it to `minx` on every element but the
      // line's last (`voice-elements.js:74`).
      rod: 3 * mm + ENGRAVE.noteRodGap,
      staffSteps: [],
      glyphs,
      lines: [],
      texts,
    }
  }
  if (spec) {
    glyphs.push(glyphAt(spec.name, x, spec.step))
    if (spec.dots > 0) {
      const dotX = x + glyphsFor(strict).width(spec.name) + ENGRAVE.dotGap
      glyphs.push(...dotGlyphs(spec.dots, dotX, spec.step, new Set()))
    }
  }

  // A REST IS A ROD LIKE ANY NOTE. abcjs's `getMinWidth` is `child.w` whatever the type,
  // and a rest's `w` is its glyph — an eighth rest reports 7.534 and pushes `minx` by
  // that plus `minspacing`. We reported 0, so a compressed line let the note after a rest
  // slide onto it: `visual-layout-04` put its `zA` 37.6px left of abcjs's.
  const restInk = Math.max(spec === null ? 0 : restWidth + ENGRAVE.noteRodGap, textSpan.right)
  return {
    type: 'rest',
    x,
    width: Math.max(advance, restInk),
    spring: advance,
    rod: restInk,
    left: textSpan.left,
    staffSteps: [],
    glyphs,
    lines: [],
    texts,
  }
}

// ─── Accidentals ─────────────────────────────────────────────────────────────

/**
 * The accidental glyph to print before a note, or `null` for none.
 *
 * THE RULE IS `!== null`, NEVER TRUTHINESS. `Pitch.accidental` is null when the source
 * wrote no accidental and the note inherits from the key, and a NUMBER when the source
 * wrote one — where `Accidental.natural` is 0, which is falsy. So the idiomatic
 * `if (pitch.accidental)` collapses "inherit from the key" and "explicitly natural",
 * which are musically opposite: in D major, `=F` is F natural and a bare `F` is F sharp.
 * Writing it that way silently drops every natural sign in the corpus and is wrong in
 * every key but C major. This is risk 5 in CHECKPOINT-2026-07-18.
 *
 * ABC prints an accidental exactly where the source wrote one — that is the notation's
 * convention and why this needs no key or measure state. A note inheriting a sharp from
 * the key signature prints nothing, which is what `null` already says.
 */
/**
 * Notehead shape for `!style=x!` and `[K: style=x]`, keyed the way abcjs draws them:
 * harmonic is a diamond, `x` its `noteheads.indeterminate`, rhythm a slash.
 *
 * `filled` and `open` follow the DURATION, because a styled note is still a quarter or a
 * half — the style picks the shape, the duration picks whether it is filled.
 *
 * ponytail: abcjs has one glyph for `x` and one for rhythm whatever the duration
 * (`noteheads.indeterminate`, `noteheads.slash.quarter`), so both map to themselves here.
 * A half-note rhythm slash is its own SMuFL glyph if a fixture ever needs one.
 */
const STYLED_HEADS: Readonly<
  Record<Exclude<NoteStyle, 'normal'>, { readonly filled: GlyphName; readonly open: GlyphName }>
> = {
  harmonic: { filled: 'noteheadDiamondBlack', open: 'noteheadDiamondWhite' },
  x: { filled: 'noteheadXBlack', open: 'noteheadXBlack' },
  triangle: { filled: 'noteheadTriangleUpBlack', open: 'noteheadTriangleUpWhite' },
  rhythm: { filled: 'noteheadSlashVerticalEnds', open: 'noteheadSlashVerticalEnds' },
}

/**
 * `pitchesToPerc`'s table (`synth/pitches-to-perc.js:1-70`), by VERTICAL POSITION.
 *
 * Sixteen entries and no more: a pitch outside `C`..`e'` has no key at all, so `%%percmap`
 * cannot reach it. The prefix is the accidental's — abcjs builds the key as the
 * accidental's first LETTER plus the position, and both double accidentals begin `d`,
 * which is in neither table. So a double-accidental note takes the ordinary head.
 */
const PERC_ACCIDENTAL_PREFIX: Readonly<Record<number, string>> = {
  [Accidental.flat]: '_',
  [Accidental.natural]: '=',
  [Accidental.sharp]: '^',
}

/** `%%percmap` for the current render — the same one-place switch as the fonts. */
let PERC_MAP: Score['percMap'] = {}

/** The `%%percmap` head for a written pitch on a PERCUSSION staff, or null. */
function percHead(step: number, accidental: Accidental | null): NoteStyle | null {
  const position = step + PITCH_ORIGIN
  const name = ABCJS_PERC_NOTE_NAMES[position]
  if (name === undefined) return null
  const prefix = accidental === null ? '' : PERC_ACCIDENTAL_PREFIX[accidental]
  if (prefix === undefined) return null // a double accidental has no key
  const head = PERC_MAP[prefix + name]
  return head !== undefined && head in STYLED_HEADS ? (head as NoteStyle) : null
}

/**
 * The head a note actually draws, once its style has had a say.
 *
 * `%%percmap` is the OTHER source, and abcjs's `else if` is the order: an explicit
 * `!style=x!` on the note wins, and only then does a percussion voice consult the map
 * (`abstract-engraver.js:679-688`).
 *
 * ponytail: resolved from the FIRST pitch of a chord, because one head glyph serves the
 * whole chord here — the same shape as the duration, which abcjs also takes from the first
 * note. No corpus tune writes a percussion chord whose pitches map to different heads.
 */
function styledHead(
  base: GlyphName,
  event: MusicEvent | null,
  percussion = false,
  firstStep = 0,
  firstAccidental: Accidental | null = null,
): GlyphName {
  if (event === null || event.type === 'rest') return base
  const style =
    event.style !== 'normal'
      ? event.style
      : percussion
        ? percHead(firstStep, firstAccidental)
        : null
  if (style === null || style === 'normal') return base
  const pair = STYLED_HEADS[style]
  return base === 'noteheadBlack' ? pair.filled : pair.open
}

const ACCIDENTAL_GLYPHS: Readonly<Record<Accidental, GlyphName>> = {
  [Accidental.doubleFlat]: 'accidentalDoubleFlat',
  [Accidental.flat]: 'accidentalFlat',
  [Accidental.natural]: 'accidentalNatural',
  [Accidental.sharp]: 'accidentalSharp',
  [Accidental.doubleSharp]: 'accidentalDoubleSharp',
}

export const accidentalGlyph = (accidental: Accidental | null): GlyphName | null =>
  accidental === null ? null : ACCIDENTAL_GLYPHS[accidental]

/**
 * Microtonal accidentals, by quarter-tone step: 1 is a half-sharp, 3 a three-quarter
 * sharp. `Pitch.accidental` records only the printed SIGN, so the alteration itself has
 * to come from `microtoneCents`.
 */
const MICROTONE_GLYPHS: Readonly<Record<number, GlyphName>> = {
  [-3]: 'accidentalThreeQuarterTonesFlatZimmermann',
  [-2]: 'accidentalFlat',
  [-1]: 'accidentalQuarterToneFlatStein',
  [1]: 'accidentalQuarterToneSharpStein',
  [2]: 'accidentalSharp',
  [3]: 'accidentalThreeQuarterTonesSharpStein',
}

/**
 * The accidental a note actually draws, once microtones have had a say.
 *
 * MODE SPLIT, measured against abcjs 6.6.3 rather than assumed:
 *
 *   `^/G`   half-sharp     abcjs draws `accidentals.halfsharp`; so do we, both modes.
 *   `^3/2G` ¾-sharp        abcjs draws NOTHING — no accidental in its element dump at
 *                          all. Strict reproduces that; abc2.1/extended draw the
 *                          three-quarter glyph, which is what the ABC actually says.
 *
 * Before this, every microtone drew a FULL sharp or flat — so `^/G` printed as a plain
 * sharp and `^3/2G` printed ink abcjs does not print. Wrong output, not missing output,
 * which is why the gap list's "parsed, not rendered" undersold it.
 *
 * ponytail: quantised to the nearest quarter tone, so `^1/3G` rounds to a half-sharp
 * rather than drawing nothing. Bravura has no third-tone glyph and no fixture writes one.
 */
function microtoneAccidental(
  accidental: Accidental | null,
  cents: number,
  strict: boolean,
): GlyphName | null {
  if (cents === 0) return accidentalGlyph(accidental)
  const steps = Math.round(cents / 50)
  // abcjs knows the quarter-tone pair and nothing else; anything wider prints no
  // accidental at all rather than an approximation.
  if (strict && Math.abs(steps) !== 1) return null
  return MICROTONE_GLYPHS[steps] ?? null
}

/**
 * Flag glyphs by level, `[up, down]`. Index is `spec.flags`, so index 1 is an eighth.
 *
 * Index 0 is unused — a note with no flags draws none — and is filled with the eighth
 * pair so the array indexes directly rather than needing an offset. Levels beyond the
 * last entry clamp to it: a 128th prints as a 64th, which is the same ponytail the 16th
 * used to be, but four levels deeper and out of reach of any real music.
 */
const FLAG_GLYPHS: readonly (readonly [GlyphName, GlyphName])[] = [
  ['flag8thUp', 'flag8thDown'],
  ['flag8thUp', 'flag8thDown'],
  ['flag16thUp', 'flag16thDown'],
  ['flag32ndUp', 'flag32ndDown'],
  ['flag64thUp', 'flag64thDown'],
]

/** Ledger lines for a note that sits beyond the staff. */
function ledgerLines(step: number, x: number, headWidth: number): PlacedLine[] {
  const lines: PlacedLine[] = []
  // THE OVERHANG IS PER RENDER, so it is read here and not baked into `ENGRAVE`: abcjs
  // gives a ledger `symbolWidth + 4` of width at `dx = -2` (`abstract-engraver.js:462`),
  // which is 2px each side against Bravura's 0.4 of a space, 3.1px.
  const x1 = x - LINE_WEIGHTS.ledgerExtension
  const x2 = x + headWidth + LINE_WEIGHTS.ledgerExtension
  const push = (s: number) => {
    lines.push({
      x1,
      y1: stepToY(s),
      x2,
      y2: stepToY(s),
      thickness: LINE_WEIGHTS.ledgerLine,
      role: 'ledger',
    })
  }
  for (let s = ENGRAVE.firstLedgerStep; s <= step; s += 2) push(s)
  for (let s = -ENGRAVE.firstLedgerStep; s >= step; s -= 2) push(s)
  return lines
}

/**
 * One or more noteheads sharing a stem — the general case, of which a single note is
 * simply N = 1.
 *
 * Written as one function rather than two because a chord needs everything a note needs
 * (stem, ledger lines, accidental) and duplicating that was how the stem came to anchor
 * to the wrong x when accidentals landed. The differences from a note are real but
 * small: the stem spans the outermost heads, and heads a second apart must sit on
 * opposite sides of the stem.
 */
function layoutNoteheads(
  pitches: readonly Pitch[],
  notated: Rational,
  /** Natural width for this event's SOUNDING duration — see `naturalWidth`. */
  advance: number,
  x: number,
  clef: Clef,
  /** Forced by the beam group when this note is beamed — every stem in a beam agrees. */
  forcedUp: boolean | null = null,
  /** Set when this note is beamed: suppresses its flag and reports its stem. */
  stemOut: { value: Omit<StemInfo, 'element'> | null } | null = null,
  /** The source event, for the text attached to it. Null when there is none to attach. */
  event: MusicEvent | null = null,
  /** `abcjs-strict` — decides which microtonal accidentals print. See `microtoneAccidental`. */
  strict = true,
  /** Dynamics above the staff when the tune sings, below otherwise. See `dynamicAboveStep`. */
  dynamicsAbove = true,
): LayoutElement {
  // Sorted ascending to match abcjs, which reports a chord's heads lowest-first — so the
  // gate compares like with like regardless of the order the pitches were written in.
  // `[GCE]` and `[CEG]` are the same chord and must produce the same steps.
  const steps = pitches.map((p) => pitchToStep(p, clef)).sort((a, b) => a - b)
  const lowest = steps[0] ?? 0
  const highest = steps[steps.length - 1] ?? 0
  const spec = noteGlyph(notated)

  if (spec === null || steps.length === 0) {
    // Unsupported duration — see noteGlyph. Emit the position with no ink rather than
    // the wrong notehead, so the gap is visible in output and in the gate.
    return {
      type: 'note',
      x,
      width: advance,
      spring: advance,
      rod: 0,
      staffSteps: steps,
      glyphs: [],
      lines: [],
      texts: [],
    }
  }

  // The style picks the SHAPE; `spec` still decides filled-vs-open, dots, stem and flags,
  // so a harmonic eighth is a filled diamond with a flag.
  const headName = styledHead(
    spec.head,
    event,
    clef.shape === 'percussion',
    steps[0] ?? 0,
    pitches[0]?.accidental ?? null,
  )
  // The OUTLINE stays Bravura's — anchors are a property of the shape — while the
  // metrics come from the active table, so strict spaces at abcjs's widths.
  const head = GLYPHS[headName]
  const headAdvance = glyphsFor(strict).advance(headName)
  const headInk = glyphsFor(strict).width(headName)
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []

  // Grace notes lead INTO the note, so they are laid out first and push everything else
  // right. Each is a small notehead with a small stem; an acciaccatura (`{/g}`) takes a
  // slash through the stems. *Behind Bars* draws them at about 60% and always stem-up.
  //
  // THEY ARE EMITTED LAST, THOUGH. abcjs writes the MAIN notehead before the graces that
  // precede it — probed on `{ab}c {d}e`, whose noteheads come out at 75.14, 55.14, 65.14,
  // 105.14, 95.14 — because a grace is an `extra` child and the head is a `head`. The
  // pixel gate pairs the i-th notehead of each engine, so emitting them in playing order
  // read as a position error on every graced fixture: `vree-grace-notes` dy 11.6 / dx 32.5
  // is that and nothing else, and four harvested fixtures carry the same 11.6.
  const graceGlyphs: PlacedGlyph[] = []
  const graceLines: PlacedLine[] = []
  let graceWidth = 0
  /** What the graces add to abcjs's `roomtaken` — see below. Zero when there are none. */
  let graceRoom = 0
  if (event !== null && event.type !== 'rest' && event.graceNotes.length > 0) {
    const scale = ENGRAVE.graceScale
    const small = GLYPHS.noteheadBlack
    const graceSteps = event.graceNotes.map((p) => pitchToStep(p, clef))

    graceSteps.forEach((graceStep, i) => {
      const gx = x + i * ENGRAVE.graceAdvance
      graceGlyphs.push({
        name: 'noteheadBlack',
        x: gx,
        y: stepToY(graceStep),
        scale,
        role: 'grace',
      })
      // The stem attaches at the scaled anchor and runs a scaled length upward.
      const [ax, ay] = small.anchors.stemUpSE ?? [small.width, 0]
      const stemX = gx + ax * scale
      const base = stepToY(graceStep) + ay * scale
      graceLines.push({
        x1: stemX,
        y1: base,
        x2: stemX,
        y2: base - ENGRAVE.stemLength * scale,
        thickness: LINE_WEIGHTS.stem * scale,
        role: 'stem',
      })
    })

    graceWidth = graceSteps.length * ENGRAVE.graceAdvance + ENGRAVE.graceGap
    // A GRACE NOTE ADDS 10 TO `roomtaken`, and an accidental on it another 7
    // (`abstract-engraver.js:481-487`). Whatever comes after — the arpeggio, a LEFT
    // annotation — starts from the total, so it sits left of the graces rather than on
    // them. `B"<2"{c}B` was 6.71px of dx out on the missing term.
    graceRoom =
      graceSteps.length * ENGRAVE.graceAdvance +
      event.graceNotes.filter((p) => p.accidental !== null).length * ENGRAVE.graceAccidentalRoom

    if (event.graceSlash) {
      // One slash across the first grace note's stem, which is what marks the whole
      // group as an acciaccatura however many notes it has.
      const firstStep = graceSteps[0] ?? 0
      const tipY = stepToY(firstStep) - ENGRAVE.stemLength * scale
      graceLines.push({
        x1: x - 0.2,
        y1: tipY + 1.0,
        x2: x + ENGRAVE.graceAdvance * 0.9,
        y2: tipY - 0.2,
        thickness: LINE_WEIGHTS.stem * 1.4,
      })
    }
  }

  // Stem direction follows the chord as a whole: away from the middle line, judged by
  // the midpoint of its outermost notes. On the middle line itself the stem goes down.
  // A beamed note takes its group's direction instead — a beam cannot join opposed stems.
  const up = forcedUp ?? (lowest + highest) / 2 < 0

  // Accidentals sit in a column before the heads and push everything right. ponytail:
  // ONE column. Real engraving fans accidentals into several columns when they would
  // collide; with the heads at distinct steps they only collide for a cluster, and no
  // corpus fixture has one.
  const noteX = x + graceWidth
  /** An accidental `place` units left of the notehead, in absolute x. */
  const headXOf = (place: number): number => noteX + accidentalWidth - place
  // ponytail: `microtoneCents` is per-EVENT, not per-pitch, so a chord's microtone
  // applies to every altered head in it. `[^/G^/B]` is right; a chord mixing a microtone
  // with a plain accidental is not expressible. No fixture writes one, and fixing it
  // means moving the field onto Pitch.
  const cents = event === null || event.type === 'rest' ? 0 : event.microtoneCents
  // A PERCUSSION VOICE PRINTS NO ACCIDENTALS. `createNote` passes
  // `printAccidentals: !voice.isPercussion` (`abstract-engraver.js:723`), so `^c'` on a
  // `clef=perc` staff draws its head and nothing else — the golden has no
  // `accidentals.sharp` in it at all. Ours drew one and reserved its declared box, which is
  // 7.18px of staff above a high note.
  const accidentals =
    clef.shape === 'percussion'
      ? []
      : pitches
          .map((p) => ({
            glyph: microtoneAccidental(p.accidental, cents, strict),
            step: pitchToStep(p, clef),
          }))
          .filter((a): a is { glyph: GlyphName; step: number } => a.glyph !== null)

  // ACCIDENTALS STACK LEFTWARD IN COLUMNS, AND THE COLUMN IS REUSED SIX STEPS APART.
  //
  // abcjs's `createNoteHead` keeps a running `roomTaken` across a chord's pitches and
  // places each accidental at `-roomTaken - (width + 2)`, unless an existing column holds
  // a pitch at least 6 steps below, in which case it takes that column's x and adds
  // nothing (`create-note-head.js:85-98`, `abstract-engraver.js:723,734`). Taking the
  // widest accidental and one gap put a chord's second accidental on top of its first.
  //
  // THE DRAWN OFFSET AND THE LAYOUT EXTENT ARE NOT THE SAME NUMBER. The glyph sits at
  // `width + 2`, but the element declares `extraw -= width / 2` on top of that
  // (`:100`, `abstract-engraver.js:725`) — abcjs's own comment says "we need a little
  // extra width if there is an accidental, but I'm not sure why it isn't the full width".
  // So a sharp draws 10.25px left of its head and reserves 14.375. Conflating the two as
  // one `accidentalGap` left every accidental note ~4.5px narrow, which on a COMPRESSED
  // line is the whole error: `visual-transpose-02` solved to a spacing of 18.67px where
  // abcjs's rods bottom out at 10.81 and its springs never bind at all.
  const accidentalPlaces: number[] = []
  let roomTaken = 0
  let extraLeft = 0
  {
    /** `[pitch, place]` per open column — abcjs's `accidentalSlot`. */
    const slots: { step: number; place: number }[] = []
    for (const a of accidentals) {
      const width = glyphsFor(strict).advance(a.glyph)
      const slot = slots.find((s) => a.step - s.step >= ENGRAVE.accidentalColumnSteps)
      if (slot) {
        slot.step = a.step
        accidentalPlaces.push(slot.place)
      } else {
        roomTaken += width + ENGRAVE.accidentalGap
        slots.push({ step: a.step, place: roomTaken })
        accidentalPlaces.push(roomTaken)
      }
      // `abselem.extraw` IS A RUNNING MIN WITH A SUBTRACTION BETWEEN THE STEPS, and the
      // order is what makes it not a sum:
      //
      //     addExtra(accidental at dx)   ->  if (dx < extraw) extraw = dx
      //     abselem.extraw -= ret.extraLeft                  // half the accidental's width
      //
      // (`create-note-head.js:100-101`, `abstract-engraver.js:723-725`, per PITCH). A
      // deeper column on the next pitch RESETS the min and throws the previous
      // subtraction away, so `[_d^f=b]` ends at `deepest - nat/2` and not at
      // `deepest - (flat + sharp + nat)/2`. Accumulating cost 7.50px, which is exactly
      // `(6.75 + 8.25) / 2` — the two subtractions the min swallowed.
      const place = accidentalPlaces[accidentalPlaces.length - 1] ?? 0
      extraLeft = Math.max(extraLeft, place) + width / 2
    }
  }
  // `extraLeft` came out of that loop as the FULL reach left of the head, columns and all
  // — it is `-extraw`. What the element wants is the part BEYOND the columns.
  extraLeft = Math.max(0, extraLeft - roomTaken)
  const accidentalWidth = roomTaken
  // `roomtaken += this.addGraceNotes(…, roomtaken)` (`abstract-engraver.js:834-836`), and
  // `addGraceNotes` RETURNS the running total it was handed — so the accidental room is
  // counted TWICE when there are graces. An abcjs bug, reproduced: everything placed after
  // this point reads the doubled figure.
  const roomAfterGraces = graceRoom === 0 ? roomTaken : roomTaken + roomTaken + graceRoom

  // AN ACCIDENTAL DECLARES `pitch ± h / 2`, centred on the note it belongs to, and abcjs
  // passes that as an explicit `top`/`bottom` rather than letting the outline stand
  // (`create-note-head.js:99-100`) — the same escape the key signature takes two files
  // over. Its ink box is not centred on its origin, so reserving the outline reaches
  // higher than abcjs on any staff an accidental tops out.
  accidentals.forEach((a, index) => {
    const placed = glyphAt(a.glyph, headXOf(accidentalPlaces[index] ?? 0), a.step)
    const half = (glyphsFor(strict).get(a.glyph)?.declaredHeight ?? 0) / 2
    glyphs.push({
      ...placed,
      role: 'accidental',
      reserve: [stepToY(a.step) - half, stepToY(a.step) + half],
    })
  })
  const headX = noteX + accidentalWidth

  // A second cannot be printed on the same side of the stem — the noteheads would
  // overlap — so the offending head moves across it. *Behind Bars*. Working from the
  // stem side outward keeps a cluster alternating rather than every head shifting.
  const ordered = up ? steps : [...steps].reverse()
  const offsets = new Map<number, number>()
  let previous: number | null = null
  let shifted = false
  for (const step of ordered) {
    shifted = previous !== null && Math.abs(step - previous) === 1 ? !shifted : false
    // With an up stem the displaced head goes right of it; with a down stem, left.
    offsets.set(step, shifted ? (up ? headInk : -headInk) : 0)
    previous = step
  }

  for (const [position, step] of steps.entries()) {
    const dx = offsets.get(step) ?? 0
    glyphs.push({
      ...glyphAt(headName, headX + dx, step),
      role: 'notehead',
      // `steps` is sorted ascending, so the index IS the chord position from the bottom.
      ...(steps.length > 1 ? { chordPos: position + 1 } : {}),
    })
    lines.push(...ledgerLines(step, headX + dx, headInk))
  }

  // Dots align in one column right of the WIDEST extent, so a chord's dots line up
  // rather than stepping in and out with each displaced notehead.
  let dotWidth = 0
  if (spec.dots > 0) {
    const rightmost = headX + Math.max(0, ...[...offsets.values()]) + headInk
    const dotX = rightmost + ENGRAVE.dotGap
    const taken = new Set<number>()
    for (const step of steps) glyphs.push(...dotGlyphs(spec.dots, dotX, step, taken))
    dotWidth = dotX - headX + spec.dots * ENGRAVE.dotSpacing
  }

  if (spec.stemmed) {
    const anchor = up ? head.anchors.stemUpSE : head.anchors.stemDownNW
    const [ax, ay] = anchor ?? [up ? headInk : 0, 0]
    // headX, not x: an accidental shifts the noteheads, and the stem follows them.
    const stemX = headX + ax
    // The stem starts at the head nearest its own end and runs past the far one, so a
    // chord's stem spans the whole spread rather than one notehead's worth.
    const base = stepToY(up ? lowest : highest) + ay
    const far = stepToY(up ? highest : lowest)
    // A STEM ON A NOTE FAR FROM THE MIDDLE LINE IS STRETCHED TO REACH IT — abcjs's own
    // words, `create-note-head.js:39`: "the stem will have been stretched to the middle
    // line if it is far from the center". A down-stem's tip is pulled down to the middle
    // line and an up-stem's pushed up to it, so a note high above the staff gets a longer
    // stem than the standard length rather than a floating stub. Conventional engraving,
    // and abcjs's `p1`/`p2` clamps say the same (`abstract-engraver.js:740-745`).
    //
    // ONLY WHEN NO DIRECTION IS FORCED, which is what `forcedUp === null` means here:
    // abcjs guards both clamps on `!stemdir`, and `stemdir` is truthy for a `V:… stems=`,
    // for the shared-staff convention, AND inside a beam (`createBeam` sets it around the
    // notes it builds). A beamed stem is retargeted to the beam anyway, so extending it
    // first would be undone. `stems=down` bass voices therefore keep the plain length,
    // which is what makes ragtime's bass staves match abcjs to a tenth of a pitch.
    const plain = far + (up ? -ENGRAVE.stemLength : ENGRAVE.stemLength)
    const middle = stepToY(0)
    const tip = forcedUp !== null ? plain : up ? Math.min(plain, middle) : Math.max(plain, middle)
    lines.push({
      x1: stemX,
      y1: base,
      x2: stemX,
      y2: tip,
      thickness: LINE_WEIGHTS.stem,
      role: 'stem',
    })

    if (stemOut !== null) {
      // Beamed: the beam pass retargets this stem and draws the beams. No flag — a note
      // cannot carry both.
      stemOut.value = {
        x: stemX,
        farStep: up ? highest : lowest,
        averageStep: steps.reduce((a, b) => a + b, 0) / steps.length,
        up,
        beams: spec.flags,
      }
    } else if (spec.flags > 0) {
      // Unbeamed: ONE glyph carrying every flag level, hung from the stem tip. SMuFL
      // draws a 32nd as a single three-tailed glyph rather than three stacked 8th flags,
      // and its up and down designs are separate rather than a reflection.
      //
      // This used to fall back to the 16th flag for anything shorter, on the stated
      // grounds that "two flags is already rare in the corpus". The corpus has 72 notes
      // shorter than a 16th; 63 are beamed (and the beam pass already draws three levels
      // correctly), but 9 are not, and every one of them printed as a 16th. A 32nd drawn
      // as a 16th is the wrong rhythm on the page, not a missing detail.
      const flag = FLAG_GLYPHS[Math.min(spec.flags, FLAG_GLYPHS.length - 1)]?.[up ? 0 : 1]
      if (flag !== undefined) glyphs.push({ name: flag, x: stemX, y: tip, role: 'flag' })
    }
  }

  /** How far LEFT a decoration reaches past the note — an arpeggio, and only it. */
  let decorationLeft = 0
  /** How far the note's attached text reaches either side of it — see `noteText`. */
  const textSpan = { left: 0, right: 0 }
  const texts =
    event === null
      ? []
      : noteText(
          event,
          headX,
          headInk,
          strict,
          textSpan,
          steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length),
          lowest,
          roomAfterGraces,
        )
  if (event !== null && event.decorations.length > 0) {
    const decorated = decorationGlyphs(
      event.decorations,
      headX,
      head.width,
      highest,
      lowest,
      up,
      // abcjs's `abselem.top` / `.bottom`: the notehead's DECLARED box widened by the
      // stem it just drew. `pushTop`/`pushBottom` over the element's children.
      Math.max(
        highest + ENGRAVE.noteheadHalfHeight / ENGRAVE.spacePerStep,
        ...lines
          .filter((l) => l.role === 'stem')
          .map((l) => -Math.min(l.y1, l.y2) / ENGRAVE.spacePerStep),
      ),
      Math.min(
        lowest - ENGRAVE.noteheadHalfHeight / ENGRAVE.spacePerStep,
        ...lines
          .filter((l) => l.role === 'stem')
          .map((l) => -Math.max(l.y1, l.y2) / ENGRAVE.spacePerStep),
      ),
      strict,
      roomAfterGraces,
      dynamicsAbove,
    )
    glyphs.push(...decorated.glyphs)
    texts.push(...decorated.texts)
    decorationLeft = decorated.leftReach
  }

  // The spring is the natural width, but ink is a rod: a displaced head or a dot column
  // must never be crushed by a short duration, so the element is at least as wide as what
  // it draws to the RIGHT of the notehead, plus the minimum gap.
  // RIGHT and LEFT are measured separately, as abcjs measures them: `addRight` takes
  // `w = max(w, dx + w)` and `addHead` takes `extraw = min(extraw, dx)`. A displaced head
  // reaches right by its own width and left by its offset, and those are not the same
  // number. `dotWidth` is ALREADY a full extent from the notehead's origin, so the old
  // `max(|offsets|, dotWidth) + head.width` counted the notehead twice for every dotted
  // note: `happy-birthday`'s dotted eighth came out at 26.16px against abcjs's 18.44, and
  // the 6.7px went straight into the gap after it.
  //
  // THE ACTIVE TABLE'S WIDTH, NOT BRAVURA'S. abcjs's `w` for `noteheads.quarter` is 9.81
  // and Bravura's outline is 9.145 — 0.665px per note, which is nothing on a line with
  // slack and the whole error on one without: it is a ROD, and a rod only shows when the
  // spring has been squeezed under it. The flag beside it already read the active table.
  const headRight = Math.max(0, ...[...offsets.values()]) + glyphsFor(strict).width(headName)
  const headLeft = -Math.min(0, ...[...offsets.values()])
  // A lyric or a chord symbol is CENTRED on the note and counts on BOTH sides. It is the
  // dominant term in sung music: `birth-` makes a 9.81px notehead occupy 21.28px each way.
  //
  // An unbeamed FLAG counts too — abcjs reads `flags.u8th` at `dx = 9.21, w = 6.69`, so an
  // eighth's rod is 15.90 where its notehead alone is 9.81. A beamed note has no flag and
  // stays at its notehead.
  const flagInk = glyphs
    .filter((g) => g.role === 'flag')
    .map((g) => g.x - headX + glyphsFor(strict).width(g.name))
  const ink = Math.max(headRight, dotWidth, textSpan.right, ...flagInk) + ENGRAVE.noteRodGap
  return {
    type: 'note',
    // THE ELEMENT IS ITS NOTEHEAD. Grace notes and accidentals hang LEFT of it and cost
    // the cursor nothing — abcjs's `w` for `^c` is 9.810, the notehead alone, with the
    // accidental recorded as `extraw = -14.375` and no part of the rod (probed on
    // `vree-sharps`). It only pushes when there is not enough room already, which the
    // spring nearly always provides: measured gaps there are a flat 42.43px, exactly the
    // quarter-note spring, with the sharps sitting inside it. Anchoring at the accidental
    // instead put every note after the first 9.4px right.
    x: headX,
    width: Math.max(advance, ink),
    spring: advance,
    rod: ink,
    // abcjs's `-extraw`: the leftmost accidental's own offset PLUS the `width / 2` each
    // one adds again — see the accidental block above.
    left: Math.max(headX - x + extraLeft, textSpan.left, headLeft, decorationLeft),
    staffSteps: steps,
    // The graces go on the END — abcjs's document order, see the grace block above.
    glyphs: [...glyphs, ...graceGlyphs],
    lines: [...lines, ...graceLines],
    texts,
  }
}

/**
 * A barline, in all six shapes ABC can write.
 *
 * Built left to right from three pieces — thin rule, thick rule, repeat dots — because
 * that is what the shapes are: a final is thin-then-thick, a repeat end is dots-then-
 * thin-then-thick, and a two-way repeat is that mirrored around a single thick rule.
 * Drawing them from parts rather than as six special cases means the spacing constants
 * (all from the font) apply uniformly.
 */
/**
 * The bar number drawn on a barline — `addMeasureNumber`, `abstract-engraver.js:945-953`.
 *
 * Centred on the barline (`anchor: "middle"` in `draw/relative.js:38-40`) and reserving a
 * POINT at its pitch, since its `RelativeElement` is given no `thickness`.
 */
function barNumberText(number: number, x: number): PlacedText {
  const text = String(number)
  // MEASURED IN `measurefont`, whatever the tune set it to — `%%measurefont Helvetica 7
  // box` measures 14.6px against the default's 21.06 and drops the reserve 1.68px.
  // abcjs PITCH -> our step: the bottom staff line is pitch 2 and our step -4, so a step
  // is `pitch - 6`. Its height is in PIXELS over `spacing.STEP`, which is `spaces x 2`.
  const y = stepToY(ENGRAVE.barNumberPitch + fontHeightOf('measurefont') * 2 - PITCH_ORIGIN)
  return {
    text,
    x,
    y,
    size: fontSizeOf('measurefont'),
    bold: false,
    italic: true,
    anchor: 'middle',
    reserve: [y, y],
  }
}

function layoutBar(x: number, kind: Barline, strict = true): LayoutElement {
  const thin = LINE_WEIGHTS.thinBarline
  const thick = LINE_WEIGHTS.thickBarline
  const gap = LINE_WEIGHTS.barlineSeparation
  const dotGap = LINE_WEIGHTS.repeatBarlineDotSeparation

  const lines: PlacedLine[] = []
  const glyphs: PlacedGlyph[] = []
  let cursor = x

  const rule = (thickness: number): void => {
    // A rule is placed by its LEFT edge and the line is its centre, so the cursor
    // advances by the full thickness and nothing overlaps.
    lines.push({
      x1: cursor + thickness / 2,
      y1: stepToY(4),
      x2: cursor + thickness / 2,
      y2: stepToY(-4),
      thickness,
    })
    cursor += thickness
  }

  const dots = (): void => {
    // The two dots straddle the middle staff line, one in the space either side.
    //
    // SMuFL anchors `repeatDots` at the BOTTOM staff line, not the middle — its ink sits
    // ~1.98 spaces ABOVE its origin — so placing it at step 0 puts the dots up near the
    // top line. Centring from the bounding box rather than hardcoding the offset means a
    // different SMuFL font with a different anchor still lands correctly.
    const glyph = glyphsFor(strict).get('repeatDots') ?? GLYPHS.repeatDots
    glyphs.push({ name: 'repeatDots', x: cursor, y: -(glyph.y + glyph.height / 2) })
    cursor += glyph.width + dotGap
  }

  switch (kind) {
    case 'invisible':
      // Draws nothing. Its width is the rod, which `barRod` takes from the table.
      break
    case 'thin':
      rule(thin)
      break
    case 'double':
      rule(thin)
      cursor += gap
      rule(thin)
      break
    case 'final':
      rule(thin)
      cursor += gap
      rule(thick)
      break
    case 'repeatStart':
      rule(thick)
      cursor += gap
      rule(thin)
      cursor += dotGap
      dots()
      break
    case 'repeatEnd':
      dots()
      rule(thin)
      cursor += gap
      rule(thick)
      break
    case 'repeatBoth':
      // One thick rule serving both directions, dots on each side — the standard
      // back-to-back form, rather than two complete repeat signs jammed together.
      dots()
      rule(thin)
      cursor += gap
      rule(thick)
      cursor += gap
      rule(thin)
      cursor += dotGap
      dots()
      break
  }

  return {
    type: 'bar',
    x,
    width: cursor - x,
    staffSteps: [],
    glyphs,
    lines,
    texts: [],
  }
}

/**
 * ABC decoration name → SMuFL glyph, and where it belongs.
 *
 * `articulation` hugs the notehead on the side opposite the stem; `ornament` sits above
 * the staff clear of everything; `dynamic` sits below it. That is the convention and it
 * is also what keeps three kinds of mark from fighting for one lane.
 *
 * Deliberately PARTIAL. The corpus uses a long tail — rolls, slides, glissandi,
 * crescendo hairpins, fingerings — and several have no unambiguous SMuFL equivalent or
 * are line-based rather than a glyph. Those are left undrawn and counted, rather than
 * approximated with a glyph that means something else: an Irish roll is not a turn, and
 * drawing one for the other is wrong output, which is worse than absent output.
 */
const DECORATIONS: Readonly<
  Record<
    string,
    {
      above: GlyphName
      below: GlyphName
      place: 'articulation' | 'ornament' | 'dynamic' | 'stem'
      /** Hangs UNDER the note whatever the tune says — abcjs's `invertedfermata`, alone. */
      forceBelow?: boolean
    }
  >
> = {
  staccato: { above: 'articStaccatoAbove', below: 'articStaccatoBelow', place: 'articulation' },
  accent: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  tenuto: { above: 'articTenutoAbove', below: 'articTenutoBelow', place: 'articulation' },
  // `marcato` is in abcjs's STACKED list (`scripts.umarcato`), not its close one — that
  // holds only staccato, tenuto and accent (`decoration.js:19`).
  marcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'ornament' },
  fermata: { above: 'fermataAbove', below: 'fermataBelow', place: 'ornament' },
  trill: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },
  // ABC's `M` is the mordent with the vertical stroke; `P` is the one without, which
  // SMuFL calls a short trill.
  lowermordent: { above: 'ornamentMordent', below: 'ornamentMordent', place: 'ornament' },
  uppermordent: { above: 'ornamentShortTrill', below: 'ornamentShortTrill', place: 'ornament' },
  turn: { above: 'ornamentTurn', below: 'ornamentTurn', place: 'ornament' },
  upbow: { above: 'stringsUpBow', below: 'stringsUpBow', place: 'ornament' },
  downbow: { above: 'stringsDownBow', below: 'stringsDownBow', place: 'ornament' },
  segno: { above: 'segno', below: 'segno', place: 'ornament' },
  coda: { above: 'coda', below: 'coda', place: 'ornament' },
  p: { above: 'dynamicPiano', below: 'dynamicPiano', place: 'dynamic' },
  f: { above: 'dynamicForte', below: 'dynamicForte', place: 'dynamic' },

  // ── The rest of abcjs's volumeDecoration set ────────────────────────────────
  // SMuFL precomposes the multi-letter dynamics, so `mp` is one glyph rather than an
  // `m` and a `p` set side by side.
  pp: { above: 'dynamicPP', below: 'dynamicPP', place: 'dynamic' },
  ppp: { above: 'dynamicPPP', below: 'dynamicPPP', place: 'dynamic' },
  pppp: { above: 'dynamicPPPP', below: 'dynamicPPPP', place: 'dynamic' },
  mp: { above: 'dynamicMP', below: 'dynamicMP', place: 'dynamic' },
  mf: { above: 'dynamicMF', below: 'dynamicMF', place: 'dynamic' },
  ff: { above: 'dynamicFF', below: 'dynamicFF', place: 'dynamic' },
  fff: { above: 'dynamicFFF', below: 'dynamicFFF', place: 'dynamic' },
  ffff: { above: 'dynamicFFFF', below: 'dynamicFFFF', place: 'dynamic' },
  sfz: { above: 'dynamicSforzando1', below: 'dynamicSforzando1', place: 'dynamic' },

  // ── Fingerings ─────────────────────────────────────────────────────────────
  // `!0!` through `!5!` are in `DECORATION_TEXTS`, not here: abcjs draws them as TEXT
  // (`decoration.js:200-210`) and they stack by the flat text height.

  // ── Aliases ────────────────────────────────────────────────────────────────
  // abcjs rewrites these to canonical names through `accentPseudonyms`; we keep the
  // source spelling in the model, so the renderer resolves them instead. Each already
  // had its glyph — they drew nothing only because the table was keyed on the canonical
  // name. Verified against 6.6.3: `!>!` and `!emphasis!` both draw its sforzato (the
  // accent wedge), `!^!` its umarcato, `!tr!` its trill.
  '>': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  '<': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  emphasis: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  // STACKED, like their `marcato` synonym above — abcjs's close list is only staccato,
  // tenuto and accent (`decoration.js:19-20`), and `umarcato` sits in the long
  // `symbolDecoration` case list beside `marcato` (`:255`). Left on the close path these
  // reserved a POINT at their pitch where abcjs reserves `cursor + h + 0.5`, which is
  // `ragtime-nightingale`'s staff 37 and 2.23px of its page drift.
  '^': { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'ornament' },
  umarcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'ornament' },
  tr: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },
  // abcjs draws `!mordent!` and `!trillh!` with the same glyphs as `!lowermordent!` and
  // `!trill!` — its scripts.mordent and scripts.trill respectively.
  mordent: { above: 'ornamentMordent', below: 'ornamentMordent', place: 'ornament' },
  trillh: { above: 'ornamentTrill', below: 'ornamentTrill', place: 'ornament' },

  // ── Ornaments and techniques ───────────────────────────────────────────────
  // Every one of these is painted by abcjs. Checked against its RENDERED SVG, because
  // its element dump misses anything attached through addOther — which is exactly what
  // made `slide` and `breath` look unsupported on the first pass. They are not.
  //
  // The glyph is core's own choice from SMuFL, as everywhere else: what is reproduced is
  // abcjs's decision to MARK the note, not the shape of its private font.
  roll: { above: 'ornamentTremblement', below: 'ornamentTremblement', place: 'ornament' },
  slide: { above: 'brassLiftShort', below: 'brassLiftShort', place: 'ornament' },
  breath: { above: 'breathMarkComma', below: 'breathMarkComma', place: 'ornament' },
  pralltriller: { above: 'ornamentShortTrill', below: 'ornamentShortTrill', place: 'ornament' },
  // An inverted fermata is the below-facing design, which was already extracted.
  invertedfermata: {
    above: 'fermataBelow',
    below: 'fermataBelow',
    place: 'ornament',
    forceBelow: true,
  },
  // Stacked for the same reason (`decoration.js:229`).
  wedge: {
    above: 'articStaccatissimoAbove',
    below: 'articStaccatissimoBelow',
    place: 'ornament',
  },
  open: { above: 'brassMuteOpen', below: 'brassMuteOpen', place: 'ornament' },
  thumb: { above: 'stringsThumbPosition', below: 'stringsThumbPosition', place: 'ornament' },
  snap: {
    above: 'pluckedSnapPizzicatoAbove',
    below: 'pluckedSnapPizzicatoBelow',
    place: 'ornament',
  },

  // ── Drawn only in abc2.1 / extended ────────────────────────────────────────
  // abcjs paints NOTHING for these three — confirmed twice, by element dump and by
  // rendered SVG. Strict reproduces the blank; the other modes draw the ornament the ABC
  // actually names. Third instance of this split, after melisma and the microtones.
  invertedturn: { above: 'ornamentTurnInverted', below: 'ornamentTurnInverted', place: 'ornament' },
  invertedturnx: { above: 'ornamentTurnSlash', below: 'ornamentTurnSlash', place: 'ornament' },
  turnx: { above: 'ornamentTurnSlash', below: 'ornamentTurnSlash', place: 'ornament' },

  // ── Tremolo ────────────────────────────────────────────────────────────────
  // Strokes across the STEM, not a lane mark — the stroke count is the rhythm, so it has
  // to read against the stem it divides. SMuFL gives one glyph per count, so `!//!` is
  // tremolo2 rather than two copies of tremolo1.
  //
  // abcjs paints the slash spellings and NOT `trem1`..`trem4`, which are the same marks
  // under different names. Its own quirk; the named forms are left undrawn to match, and
  // asserted as such.
  '/': { above: 'tremolo1', below: 'tremolo1', place: 'stem' },
  '//': { above: 'tremolo2', below: 'tremolo2', place: 'stem' },
  '///': { above: 'tremolo3', below: 'tremolo3', place: 'stem' },
  '////': { above: 'tremolo4', below: 'tremolo4', place: 'stem' },

  // ── Phrase separators and technique ────────────────────────────────────────
  // Three lengths of the same idea, so three widths of the same family.
  shortphrase: { above: 'breathMarkTick', below: 'breathMarkTick', place: 'ornament' },
  mediumphrase: { above: 'caesuraShort', below: 'caesuraShort', place: 'ornament' },
  longphrase: { above: 'caesura', below: 'caesura', place: 'ornament' },
  // ABC's `+` is left-hand pizzicato; `plus` is abcjs's spelling of the same mark.
  '+': {
    above: 'pluckedLeftHandPizzicato',
    below: 'pluckedLeftHandPizzicato',
    place: 'ornament',
  },
  plus: {
    above: 'pluckedLeftHandPizzicato',
    below: 'pluckedLeftHandPizzicato',
    place: 'ornament',
  },
  // Rolled chord — a vertical wiggle beside the notehead rather than above it.
  arpeggio: { above: 'wiggleArpeggiatoUp', below: 'wiggleArpeggiatoUp', place: 'stem' },
}

/**
 * Decorations abcjs recognises but never paints. Strict draws nothing for them; every
 * other mode draws the glyph above.
 *
 * Not the same thing as a name abcjs REJECTS — those never reach the renderer, because
 * the parser drops them in strict (see `ABCJS_KNOWN_DECORATIONS`). These are accepted,
 * attached to the note, and then silently not drawn.
 */
const STRICT_UNDRAWN: ReadonlySet<string> = new Set(['invertedturn', 'invertedturnx', 'turnx'])

/**
 * Navigation directions, drawn as WORDS rather than symbols — which is what they are.
 *
 * abcjs paints each of these; verified by the delta against a plain note in its rendered
 * SVG. The display spelling is conventional engraving (`D.C. al Fine`), not the ABC
 * token, because the token is an identifier and the page wants prose.
 */
/** Pitches a stave line sits on, which a close decoration is never left sitting on. */
const ON_STAVE_LINE: ReadonlySet<number> = new Set([2, 4, 6, 8, 10])

const DECORATION_TEXTS: Readonly<Record<string, string>> = {
  // A FINGERING DIGIT IS TEXT, not a glyph. abcjs's switch sends `"0"` through `"5"` to
  // `textDecoration` beside `D.C.` and `D.S.` (`decoration.js:200-210`), so a digit takes
  // the flat `thickness: 3` / `textHeight: 5` those do and NOT
  // `symbolHeightInPitches(glyph) + 1`. Drawing SMuFL's `fingering1` instead reserved
  // 3.76px too little on `+1+`.
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  'D.C.': 'D.C.',
  'D.S.': 'D.S.',
  fine: 'Fine',
  'D.C.alcoda': 'D.C. al Coda',
  'D.C.alfine': 'D.C. al Fine',
  'D.S.alcoda': 'D.S. al Coda',
  'D.S.alfine': 'D.S. al Fine',
}

/**
 * Decoration glyphs for one note.
 *
 * Articulations stack outward from the notehead on the side away from the stem, so a
 * staccato dot never collides with its own stem. Ornaments and dynamics take their own
 * lanes above and below the staff.
 */
function decorationGlyphs(
  names: readonly string[],
  headX: number,
  headWidth: number,
  topStep: number,
  bottomStep: number,
  stemUp: boolean,
  /**
   * `abselem.top` in STAFF STEPS — the element's own extent, STEM INCLUDED, which is what
   * abcjs hands `createDecoration` as its starting pitch (`abstract-engraver.js:842`).
   * Not the notehead's top: a long stem is what an ornament has to clear.
   */
  elemTopStep: number,
  /** `abselem.bottom` in staff steps — the other end of the same extent. */
  elemBottomStep: number,
  /** `abcjs-strict` — suppresses the marks abcjs accepts but never paints. */
  strict: boolean,
  /**
   * `roomtaken` — how far the note's ACCIDENTALS already reach left of it
   * (`abstract-engraver.js:842`). Only the arpeggio reads it, and it sits left of them.
   */
  roomTaken: number,
  /** Dynamics above the staff when the tune sings, below when it does not. */
  dynamicsAbove: boolean,
): { glyphs: PlacedGlyph[]; texts: PlacedText[]; leftReach: number } {
  /** How far LEFT of the note any decoration reaches — an arpeggio, and only it. */
  let leftReach = 0
  const out: PlacedGlyph[] = []
  const texts: PlacedText[] = []

  // ── THE ORNAMENT STACK IS abcjs's, AND IT IS NOT A FIXED STEP ───────────────
  //
  // `stackedDecoration` walks a cursor in PITCH (`creation/decoration.js:154-165`):
  //
  //     var height = glyphs.symbolHeightInPitches(symbol) + 1;  // a pitch of padding
  //     var y = getPlacement(placement);                        // the running cursor
  //     y = y + height / 2;                                     // CENTRE it on the step
  //     … new RelativeElement(symbol, …, y, …)
  //     incrementPlacement(placement, height);                  // cursor += height
  //
  // Three things at once: each glyph advances the cursor by its OWN declared height plus
  // a pitch of padding, it is CENTRED on the space it takes rather than sitting on the
  // cursor, and the cursor starts at the note's own top — `Math.max(yPos.above, minTop)`
  // with `minTop = 12` (`decoration.js:13,389`), which is one pitch above the top staff
  // line.
  //
  // Ours stepped a flat 2 pitch per ornament from a fixed lane, so a trill landed at
  // pitch 15 where abcjs puts it at 19.88 and a note reaching above the staff had its
  // ornaments sitting in its own ink. Probed on `frere-jacques`, whose every staff top is
  // an ornament: 19.8832, 16.0493 and 16.0444 against our 15, 13 and 14.
  const table = glyphsFor(strict)
  /** abcjs's `symbolHeightInPitches` — the PUBLISHED height, in pitch. */
  const heightInPitches = (g: GlyphName): number =>
    (table.get(g)?.declaredHeight ?? 0) / ENGRAVE.spacePerStep
  /** abcjs works in pitch and we work in staff steps; they differ by the staff's middle. */
  const toPitch = (step: number): number => step + 6
  const toStep = (pitch: number): number => pitch - 6
  // ── CLOSE DECORATIONS FIRST, AND THEY SET WHERE THE STACK STARTS ────────────
  //
  // `createDecoration` runs `closeDecoration` over the whole list before
  // `stackedDecoration` sees any of it (`decoration.js:386-391`), and hands the stack the
  // last close decoration's pitch as its floor. So the two are ORDERED PASSES, not one
  // walk — an ornament written before a staccato still stacks above it.
  //
  // The close rule itself (`decoration.js:17-47`), which is fussier than it looks:
  //
  //     yPos = first ? (dir === 'down' ? pitch + 2 : minPitch - 2)
  //                  : (dir === 'down' ? yPos + 2  : yPos - 2)
  //     accent:  yPos += dir === 'up' ? -1 : +1      // always three pitches away
  //     others:  if yPos is ON A STAVE LINE (2,4,6,8,10), step it one further
  //     if (pitch > 9) yPos++                        // "take up some room of those above"
  //
  // `pitch` is `abselem.top` and `minPitch` its bottom, both DECLARED. Worked on
  // `frere-jacques`: top 12.0493 → 14.0493 → accent → 15.0493 → above 9 → **16.0493**,
  // which is abcjs's number to the digit.
  const artAbove = !stemUp
  const topPitch = toPitch(elemTopStep)
  let closeY: number | undefined
  for (const name of names) {
    if (strict && STRICT_UNDRAWN.has(name)) continue
    if (DECORATIONS[name]?.place !== 'articulation') continue
    closeY =
      closeY === undefined
        ? artAbove
          ? topPitch + 2
          : toPitch(elemBottomStep) - 2
        : artAbove
          ? closeY + 2
          : closeY - 2
    if (name === 'accent') closeY += artAbove ? 1 : -1
    else if (ON_STAVE_LINE.has(closeY)) closeY += artAbove ? 1 : -1
    if (topPitch > 9) closeY += 1
    const spec = DECORATIONS[name]
    if (spec === undefined) continue
    const glyph = artAbove ? spec.above : spec.below
    const y = stepToY(toStep(closeY))
    // A CLOSE decoration is given no `thickness`, so its declared box is a POINT at its
    // own pitch — `new RelativeElement(symbol, deltaX, width, yPos)` with no options
    // (`decoration.js:47`). Probed: abcjs's `scripts.sforzato` reports `top === pitch`.
    out.push({
      name: glyph,
      x: headX + headWidth / 2 - table.width(glyph) / 2,
      y,
      role: 'decoration',
      reserve: [y, y],
    })
  }

  let above = Math.max(closeY ?? topPitch, ENGRAVE.decorationMinTop)
  // …AND THERE IS A CURSOR ON THE OTHER SIDE. `yPos` is an object with `above` and
  // `below`, and `incrementPlacement` walks whichever one the placement names
  // (`decoration.js:127-145`). Only `invertedfermata` reaches it here: abcjs's switch
  // hands it the literal `'below'` while every other ornament passes `positioning`
  // through (`decoration.js:261-264`), so the inverted fermata hangs UNDER the note
  // however the tune is written. Stacking it above put `!invertedfermata!EF` 6.52px low.
  let below = Math.min(toPitch(elemBottomStep), ENGRAVE.decorationMinBottom)

  for (const name of names) {
    if (strict && STRICT_UNDRAWN.has(name)) continue
    const spec = DECORATIONS[name]
    if (spec === undefined) continue // unmapped — counted by the test, never guessed at
    if (spec.place === 'articulation') continue // already placed, above

    const glyph = spec.above
    const centre = headX + headWidth / 2 - table.width(glyph) / 2

    if (spec.place === 'ornament') {
      const height = heightInPitches(glyph) + ENGRAVE.decorationPadding
      if (spec.forceBelow === true) {
        const y = stepToY(toStep(below - height / 2))
        const half = (table.get(glyph)?.declaredHeight ?? 0) / 2
        out.push({ name: glyph, x: centre, y, role: 'decoration', reserve: [y - half, y + half] })
        below -= height
        continue
      }
      const y = stepToY(toStep(above + height / 2))
      // …and a STACKED one is given `thickness: symbolHeightInPitches(symbol)`
      // (`decoration.js:163`), so it reserves `pitch ± thickness / 2` — its DECLARED box,
      // centred on where it sits. Its ink box is not centred on the glyph origin at all:
      // `scripts.trill` paints 2.09 spaces above its origin and 0.04 below, so reserving
      // the outline put `multi-voice-triplet-brackets` 1.31 pitch high on the staff whose
      // only ornament is a `T`.
      const half = (table.get(glyph)?.declaredHeight ?? 0) / 2
      out.push({ name: glyph, x: centre, y, role: 'decoration', reserve: [y - half, y + half] })
      above += height
    } else if (spec.place === 'stem') {
      // Centred on the stem's midpoint. An arpeggio instead sits just LEFT of the head,
      // which is where a rolled chord is read from.
      // AN ARPEGGIO IS A STACK, and it reaches TWICE ITS OWN WIDTH back from the note.
      //
      //     for (var j = minpitch - 1; j <= maxpitch; j += 2)
      //       abselem.addExtra(new RelativeElement("scripts.arpeggio",
      //         -getSymbolWidth("scripts.arpeggio") * 2 - roomtaken, 0, j + 2,
      //         { thickness: symbolHeightInPitches("scripts.arpeggio") }))
      //
      // (`decoration.js:279-297`). One glyph per two pitches from a pitch BELOW the lowest
      // note to the highest, each declaring its own height about the pitch it sits on, and
      // `addExtra` walks `extraw` back to that `dx` — 10px, which is what a bare
      // `!arpeggio!A` was out by. We drew ONE, half a width to the left, reserving nothing.
      if (name === 'arpeggio') {
        const width = glyphsFor(strict).width(glyph)
        const half = (table.get(glyph)?.declaredHeight ?? 0) / 2
        const at = headX - 2 * width - roomTaken
        for (let step = bottomStep - 1; step <= topStep; step += 2) {
          const y = stepToY(step + 2)
          out.push({
            name: glyph,
            x: at,
            y,
            role: 'decoration',
            reserve: [y - half, y + half],
          })
        }
        leftReach = Math.max(leftReach, 2 * width + roomTaken)
        continue
      }
      const onStem = headX + headWidth / 2 - glyphsFor(strict).width(glyph) / 2
      const tip = stemUp
        ? Math.max(topStep, 4) + ENGRAVE.stemLength
        : Math.min(bottomStep, -4) - ENGRAVE.stemLength
      out.push({
        name: glyph,
        x: onStem,
        y: stepToY(((stemUp ? topStep : bottomStep) + tip) / 2),
        role: 'decoration',
      })
    } else {
      const lane = dynamicsAbove ? ENGRAVE.dynamicAboveStep : ENGRAVE.dynamicBelowStep
      // `dynamic`, not `decoration`: the below-side ones are re-anchored on the staff's ink
      // by `anchorBelowStaff`, and they have to be findable. Markup-neutral — neither
      // `ABCJS_CLASSES` nor `ABCJS_DATA_NAMES` carries either name.
      out.push({ name: glyph, x: centre, y: stepToY(lane), role: 'dynamic' })
    }
  }

  // A TEXT DECORATION STACKS ON THE SAME CURSOR AS THE SYMBOLS. `D.C.`, `Fine` and the
  // fingering digits go through `textDecoration` (`decoration.js:147-153`), which takes
  // the running `yPos.above` exactly as `symbolDecoration` does, places the text a flat
  // `textFudge = 2` pitch above it, and advances by a flat `textHeight = 5`. One list,
  // one cursor, dispatched by name.
  //
  // Ours drew them at a fixed part-lane step instead, so `frere-jacques`'s `!D.C.!` sat
  // 4.09 pitch above where abcjs puts it and took the staff's ink with it.
  for (const name of names) {
    if (strict && STRICT_UNDRAWN.has(name)) continue
    const text = DECORATION_TEXTS[name]
    if (text === undefined) continue
    const size = ENGRAVE.chordTextSize
    const y = stepToY(toStep(above + ENGRAVE.decorationTextFudge))
    const half = (ENGRAVE.decorationTextThickness * ENGRAVE.spacePerStep) / 2
    texts.push({
      text,
      x: headX + headWidth / 2 - textWidth(text, size) / 2,
      y,
      size,
      bold: false,
      italic: true,
      reserve: [y - half, y + half],
    })
    above += ENGRAVE.decorationTextHeight
  }

  return { glyphs: out, texts, leftReach }
}

/**
 * Which of abcjs's faces a run of text is set in — and therefore measured in.
 *
 * abcjs names a font per role (`parse/abc_parse_directive.js:20-42`) and they are not all
 * the same family: a lyric is Times New Roman BOLD, a chord symbol is Helvetica. The
 * difference is not cosmetic here, because a lyric's width is half of its note's rod on
 * each side — measuring bold text with regular metrics ran every sung fixture 13% narrow.
 */
type Face = 'serif' | 'serifBold' | 'sans'

/**
 * Width of a run of text, in staff spaces.
 *
 * Per-character advances rather than one number per character. The flat estimate this
 * replaces measured `iiiii` and `WWWWW` the same, with a median error of 8.9% against
 * real serif metrics over the corpus and a worst case of +77% — on the short narrow
 * syllables lyrics are actually made of.
 *
 * Still an estimate — the output asks for a font FAMILY and the viewer supplies the face
 * — but no longer a systematic one: the tables are real advances from the fonts abcjs
 * names, checked against widths probed out of its own `extraw`.
 */
const textWidth = (text: string, size: number, face: Face = 'serif'): number =>
  STRICT_TEXT_METRICS ? goldenTextWidth(text, size, face) : realTextWidth(text, size, face)

/**
 * Which of the two the current render measures with — set once per render from the mode.
 *
 * ponytail: a module-level switch rather than a `strict` argument threaded through
 * `textWidth`'s sixteen call sites, most of which do not have the mode in scope. Thread it
 * properly if a caller ever needs both metrics in one render.
 */
let STRICT_TEXT_METRICS = true

/** `%%jazzchords` for the current render — same one-place switch, set beside it. */
let JAZZ_CHORDS = false

/**
 * LINE WEIGHTS for the current render — abcjs's in strict, Bravura's otherwise.
 *
 * ponytail: a module-level switch, the fifth beside `STRICT_TEXT_METRICS`, `JAZZ_CHORDS`,
 * `SCORE_FONTS` and `PERC_MAP`. Eight of the twenty-one sites are in functions with no
 * `strict` in scope — `ledgerLines`, `layoutBeam`, `staffLinesFor`, `buildCurve` and the
 * rest — and threading a boolean through eight signatures to reach a constant is a bigger
 * change than the one it enables. abcjs keeps the same thing on its renderer.
 */
let LINE_WEIGHTS = lineWeightsFor(true)

/**
 * A chord symbol's or annotation's MEASURED width — `getTextSize.calc`, box included.
 *
 * The `padding * 4` a boxed font adds goes on the WIDTH as well as the height
 * (`helpers/get-text-size.js:46-48`), and that width is the mark's `realWidth`: it decides
 * how far a centred chord reaches either side of its note and where `placeInLane` thinks
 * its right edge is. `visual-tablature-17` boxes five `%%gchordfont` sizes and was 33.9px
 * of dx out on this alone.
 */
const markWidth = (text: string, size: number, boxed: boolean): number =>
  textWidth(text, size, 'sans') + (boxed ? size * ENGRAVE.fontBoxPadding * 4 : 0)

/**
 * Every `%%<type>font` the tune set, for the current render — the same one-place switch.
 *
 * ponytail: a module-level map rather than a `fonts` argument threaded through the
 * measure, note and bar builders. abcjs keeps it on the controller for the same reason.
 */
let SCORE_FONTS: Score['fonts'] = {}

/** A `%%<type>font`'s size in staff spaces — `round(pt x 4 / 3)` px (`get-font-and-attr.js:29`). */
const fontSizeOf = (type: AbcFontType): number =>
  Math.round(((SCORE_FONTS[type]?.size ?? ABC_FONT_DEFAULT_PT[type]) * 4) / 3) / STAFF_SPACE_PX

/**
 * What `getTextSize.calc` returns as a `%%<type>font`'s HEIGHT, in staff spaces.
 *
 * The generator's size table with `size + 2` for anything unlisted, plus `padding * 4`
 * when the font is BOXED (`helpers/get-text-size.js:46-48`).
 */
const fontHeightOf = (type: AbcFontType): number => {
  const size = fontSizeOf(type)
  return (
    goldenTextHeight(size) +
    (SCORE_FONTS[type]?.box === true ? size * ENGRAVE.fontBoxPadding * 4 : 0)
  )
}

/**
 * `translateChord`'s split of a chord symbol into root, modifier and `/bass`
 * (`write/creation/translate-chord.js:12-34`).
 *
 * Every group is optional and the regex is unanchored at the tail, so it always matches —
 * abcjs's `if (!reg) continue` is dead code. A chord it cannot read simply comes back as
 * one modifier, which is what `"x"` does.
 *
 * ponytail: one line, where abcjs splits on `\n` first. Our chord symbols carry no
 * newline; a multi-line one would need the loop.
 */
/**
 * A `"…"` annotation's PLACEMENT, and the coordinates of an absolute one.
 *
 * `letter_to_chord` (`abc_parse_music.js:598-652`) reads the leading character: `^` above,
 * `_` below, `<` left, `>` right, `@` absolute. An `@` is followed by two floats separated
 * by a comma, then optional whitespace, then the text — and every way of getting that
 * wrong falls back to ABOVE with the `@` stripped and the rest printed verbatim, which is
 * three separate `warn` branches saying the same thing.
 */
type Annotation =
  | { where: 'above' | 'below' | 'left' | 'right'; text: string }
  | {
      where: 'relative'
      text: string
      dx: number
      dy: number
    }

/**
 * A pitched annotation reserves a POINT, not its letters.
 *
 * `RelativeElement`'s `top` and `bottom` are both the pitch it was given unless a
 * `thickness` says otherwise (`relative-element.js:18-24`), and `add-chord.js` passes none
 * for a left, right or absolute annotation. So `_addChild`'s `pushTop` sees the pitch
 * itself — `"@1,1E"e` reserves at pitch 12.26, which the clef's 13.72 already covers, and
 * the staff does not move at all. Reserving the text's ink box instead raised it 10.31px.
 */
const pointReserve = (y: number): readonly [number, number] => [y, y]

const annotationOf = (raw: string): Annotation => {
  const rest = raw.slice(1)
  switch (raw[0]) {
    case '_':
      return { where: 'below', text: rest }
    case '<':
      return { where: 'left', text: rest }
    case '>':
      return { where: 'right', text: rest }
    case '@': {
      // `getFloat`, a literal comma, `getFloat`, then whitespace — abcjs's own order.
      const m = /^(-?\d*\.?\d+),(-?\d*\.?\d+)\s*/.exec(rest)
      if (m?.[1] === undefined || m[2] === undefined) return { where: 'above', text: rest }
      return {
        where: 'relative',
        text: rest.slice(m[0].length),
        dx: Number.parseFloat(m[1]),
        dy: Number.parseFloat(m[2]),
      }
    }
    default:
      return { where: 'above', text: rest }
  }
}

const chordParts = (chord: string): readonly [string, string, string] => {
  const m = /^([ABCDEFG][♯♭]?)?([^/]+)?(\/([ABCDEFG][#b♯♭]?))?/.exec(chord)
  if (m === null) return [chord, '', '']
  return [m[1] ?? '', m[2] ?? '', m[4] === undefined ? '' : `/${m[4]}`]
}

/**
 * `dump-svg.js`'s `calcWidth`, which is what every SVG golden was measured with.
 *
 * Five ASCII tables chosen by SIZE ALONE — not by family — summed per character with a
 * flat **8** for anything the table does not carry, widest line wins. Three of the six
 * brackets ask for a key that does not exist in `dump-elements-char-widths.js`
 * (`titlefont`, `subtitlefont`, and the bold arm below 17), so they fall through to
 * `repeatfont`: a 27px title is measured with 17px Times widths.
 *
 * Byte parity with the goldens is the goal, so this is not a limitation to record — it is
 * the target. `abcMusicKit` v1 ships the same fallback deliberately.
 *
 * Indexed by UTF-16 code UNIT, as the generator's `lines[li][i]` is: an astral character
 * measures 8 twice, not once.
 */
const goldenTextWidth = (text: string, size: number, face: Face): number => {
  if (text === '') return 0
  const px = size * STAFF_SPACE_PX
  const table =
    px >= 27 || px >= 21
      ? GOLDEN_REPEAT // asks for `titlefont` / `subtitlefont`; neither key exists
      : px >= 20
        ? GOLDEN_PARTS
        : px >= 19
          ? GOLDEN_MEASURE
          : px >= 17
            ? face === 'serifBold'
              ? GOLDEN_VOCAL
              : GOLDEN_REPEAT
            : px >= 16
              ? GOLDEN_GCHORD
              : GOLDEN_REPEAT
  let widest = 0
  for (const line of text.split('\n')) {
    let width = 0
    for (let i = 0; i < line.length; i++) width += table[line[i] as string] ?? 8
    if (width > widest) widest = width
  }
  return widest / STAFF_SPACE_PX
}

/**
 * The REAL per-em metrics — what `abc2.1` and `extended` measure with, and what strict
 * measured with until `calcWidth` was ported.
 */
const realTextWidth = (text: string, size: number, face: Face): number => {
  const table =
    face === 'serifBold' ? CHAR_ADVANCE_BOLD : face === 'sans' ? CHAR_ADVANCE_SANS : CHAR_ADVANCE
  const fallback =
    face === 'serifBold'
      ? CHAR_ADVANCE_BOLD_FALLBACK
      : face === 'sans'
        ? CHAR_ADVANCE_SANS_FALLBACK
        : FALLBACK_ADVANCE
  let em = 0
  for (const ch of text) em += table[ch] ?? (isFullWidth(ch) ? FULL_WIDTH_ADVANCE : fallback)
  return em * size
}

/**
 * CJK and kana, which are FULL WIDTH — about one em, against a Latin letter's half.
 *
 * A range test rather than a table entry: there are tens of thousands of these and they
 * share one advance, so enumerating them would be absurd. Found because the corpus has a
 * Chinese-lyric fixture whose three characters were each measured at half their real
 * width, which was the whole of the table's residual error.
 */
function isFullWidth(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return (
    (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
    (c >= 0x2e80 && c <= 0x9fff) || // CJK radicals through unified ideographs, incl. kana
    (c >= 0xac00 && c <= 0xd7a3) || // Hangul syllables
    (c >= 0xf900 && c <= 0xfaff) || // CJK compatibility ideographs
    (c >= 0xff00 && c <= 0xff60) // full-width forms
  )
}

/** One em, the standard advance for a full-width character. */
const FULL_WIDTH_ADVANCE = 1.0

/**
 * Text attached to a note: its chord symbol above, its lyric syllables below.
 *
 * Both are CENTRED on the notehead, which without text metrics means centred on an
 * estimate — see `textWidth`. A chord symbol in real engraving is left
 * aligned to the note rather than centred; centring reads better against an estimated
 * width, since the error is halved and falls on both sides instead of accumulating to
 * one. Revisit when there are metrics.
 */
function noteText(
  event: MusicEvent,
  headX: number,
  headWidth: number,
  /** `abcjs-strict` — gates whether `%%vocalfont` is realized. See the verses block. */
  strict = true,
  /**
   * Out-param: how far the note's CENTRED text reaches each side of the element's x.
   *
   * abcjs's `addCentered` (`creation/elements/absolute-element.js`), verbatim:
   *
   *     var half = elem.w / 2;
   *     if (-half < this.extraw) this.extraw = -half;      // LEFT: half, dx ignored
   *     if (elem.dx + half > this.w) this.w = elem.dx + half;   // RIGHT: dx + half
   *
   * so a lyric and a chord symbol both widen the note AND reach back before it, and the
   * two sides are not symmetric because the left one drops `dx`. The two differ in where
   * they are anchored, which the probes give directly: a lyric has `dx = 0` and a chord
   * symbol `dx = 4.91`, half a notehead — `Hap-` reads `w = 18.438, extraw = -18.438`
   * while `Amaj7` reads `w = 27.593, extraw = -22.688` off a 45.38px string.
   *
   * ANNOTATIONS ARE NOT IN THIS. abcjs gives `"^Allegro"` a RelativeElement of `w = 0`:
   * probed on `stacked-annotations`, four annotated notes all read `w = 15.902,
   * extraw = 0` — the flag, and nothing from the text. They draw without occupying.
   */
  spans: { left: number; right: number } | null = null,
  /**
   * The note's MEAN staff step and its LOWEST — abcjs's `elem.averagepitch` and
   * `elem.minpitch`, which are where a left, right or absolute annotation is pitched.
   */
  averageStep = 0,
  minStep = 0,
  /**
   * abcjs's `roomtaken` as `addChord` is reached — the accidentals plus the grace notes
   * (`abstract-engraver.js:834-853`). A LEFT annotation accumulates ON TOP of it, so it
   * sits left of everything already hanging off the note.
   */
  roomTakenBefore = 0,
): PlacedText[] {
  const texts: PlacedText[] = []
  const centre = headX + headWidth / 2
  /** A text CENTRED on the note, `dx` from its x. Annotations do not call this. */
  const centred = (text: string, size: number, dx: number, face: Face): void => {
    if (spans === null) return
    const half = textWidth(text, size, face) / 2
    spans.left = Math.max(spans.left, half)
    spans.right = Math.max(spans.right, dx + half)
  }

  if (event.chordSymbol !== null && event.chordSymbol !== '') {
    // `%%gchordfont`'s size, in POINTS, converted the way abcjs converts every font:
    // `Math.round(size * 4 / 3)` (`get-font-and-attr.js:29`). Its default is Helvetica 12,
    // which is the 16px `chordTextSize` already here, so a tune with no directive takes
    // exactly the path it always did.
    const size =
      event.chordFont === null
        ? ENGRAVE.chordTextSize
        : Math.round((event.chordFont.size * 4) / 3) / 7.75
    // EACH LINE IS ITS OWN CENTRED MARK, in REVERSE order — `chordString` splits on `\n`
    // and walks `j` down from the last "because we place them from bottom to top"
    // (`add-chord.js:39-41`). So `"D""G"d`, which the parser joined into one name, becomes
    // two chord marks at one x; `placeInLane` cannot fit them side by side and opens a
    // second lane, which is 18.52px of staff. Collapsing them to one line lost that on
    // every fixture that stacks a chord.
    for (const line of event.chordSymbol.split('\n').reverse()) {
      if (line === '') continue
      const boxed = event.chordFont?.box === true
      const lineWidth = markWidth(line, size, boxed)
      if (spans !== null) {
        spans.left = Math.max(spans.left, lineWidth / 2)
        spans.right = Math.max(spans.right, headWidth / 2 + lineWidth / 2)
      }
      texts.push({
        text: line,
        // The lane is only the origin: `anchorAboveStaff` moves the whole set onto the
        // staff's music once the voices sharing it are known, exactly as lyrics are.
        role: 'chord',
        x: centre - lineWidth / 2,
        y: stepToY(ENGRAVE.chordSymbolStep),
        size,
        bold: false,
        italic: false,
        ...(JAZZ_CHORDS ? { jazz: chordParts(line) } : {}),
        ...(event.chordFont?.box === true ? { box: true } : {}),
      })
    }
  }

  // `"^text"` / `"_text"` / `"<text"` / `">text"` / `"@x,y text"` — free annotations, which
  // the parser separates from chord symbols by that leading char. It is placement, not
  // content, so it is stripped here rather than printed.
  //
  // FOUR PLACEMENTS AND FOUR DIFFERENT RESERVES (`add-chord.js:50-104`), and the switch is
  // what decides whether the mark takes a LANE at all: `RelativeElement`'s `case "text"`
  // gives `chordHeightAbove` only when the pitch is UNDEFINED
  // (`relative-element.js:68-75`). `above` and `below` pass no pitch and take the lane;
  // `left`, `right` and `@` are pitched on the note and take none.
  const annotations = event.annotations.map(annotationOf)
  const above = annotations.filter((a) => a.where === 'above')
  const below = annotations.filter((a) => a.where === 'below')

  above.forEach((a, index) => {
    // `annotationfont`, not the chord font — abcjs picks `font = isAnnotation ?
    // 'annotationfont' : 'gchordfont'` (`add-chord.js:11-17`). They share a 12pt default,
    // so a tune that sets neither is unmoved; `%%annotationfont Times-Roman 15 box` is
    // 11.65px of chord lane.
    const size = fontSizeOf('annotationfont')
    const lane =
      ENGRAVE.annotationAboveStep + (above.length - 1 - index) * ENGRAVE.annotationLineStep
    texts.push({
      text: a.text,
      // LEFT-JUSTIFIED AT THE ELEMENT, where a chord symbol is CENTRED on it. abcjs's
      // annotation is `RelativeElement(chord, 0, 0, undefined, {realWidth})` — `dx` 0 —
      // and `getChordDim` takes `offset = this.type === "chord" ? realWidth / 2 : 0`
      // (`relative-element.js:96`), so its lane extent runs from the element's x rightward.
      // The golden says the same in one attribute: `text-anchor="start"` on an annotation
      // beside `text-anchor="middle"` on a chord. Centring ours reached further left than
      // abcjs's and opened a second chord LANE that abcjs does not — 18.51px of staff on
      // `"Ab"z"^break"c2`.
      x: headX,
      y: stepToY(lane),
      size,
      bold: false,
      italic: false,
      ...(SCORE_FONTS.annotationfont?.box === true ? { box: true } : {}),
      // AN ANNOTATION SHARES THE CHORD LANE. `RelativeElement` gives a `type: "text"`
      // with no pitch the very same `chordHeightAbove` a `type: "chord"` gets
      // (`relative-element.js:60-76`), and `setUpperAndLowerRelativeElements` handles
      // both in one `case "text": case "chord":`. Ours drew them at a fixed step with no
      // role, so `anchorAboveStaff` never saw them, reserved nothing, and let their ink
      // set the staff's top instead — the whole of `frere-jacques`'s last residual.
      role: 'chord',
    })
  })

  below.forEach((a, index) => {
    const size = fontSizeOf('annotationfont')
    texts.push({
      text: a.text,
      // Left-justified, like the `above` case.
      x: headX,
      y: stepToY(ENGRAVE.annotationBelowStep - index * ENGRAVE.annotationLineStep),
      size,
      bold: false,
      italic: false,
    })
  })

  // A LEFT ANNOTATION TAKES `width + 7` OF ROOM BEFORE THE NOTE, and a right one 4 either
  // side of itself:
  //
  //     case "left":  roomTaken += chordWidth + 7; x = -roomTaken;
  //                   abselem.addExtra(new RelativeElement(chord, x, chordWidth + 4, …))
  //     case "right": roomTakenRight += 4; x = roomTakenRight;
  //                   abselem.addRight(new RelativeElement(chord, x, chordWidth + 4, …))
  //
  // (`add-chord.js:50-71`). `addExtra` walks `extraw` back to `dx` and `addRight` walks
  // `w` out to `dx + w`, so both are real spacing. We drew them at a fixed gap and
  // reserved nothing at all: a bare `"<F"F` put the note 16.78px left of abcjs's, which is
  // `F`'s 9.78 in the annotation font plus the 7.
  //
  // Both are pitched on the note's AVERAGE, which is also why neither takes a lane.
  let roomTaken = roomTakenBefore
  let roomTakenRight = 0
  for (const a of annotations) {
    if (a.where !== 'left' && a.where !== 'right') continue
    const size = fontSizeOf('annotationfont')
    const width = textWidth(a.text, size, 'sans')
    if (a.where === 'left') {
      roomTaken += width + ENGRAVE.leftAnnotationGap
      if (spans !== null) spans.left = Math.max(spans.left, roomTaken)
      texts.push({
        text: a.text,
        x: headX - roomTaken,
        y: stepToY(averageStep),
        size,
        bold: false,
        italic: false,
        reserve: pointReserve(stepToY(averageStep)),
      })
    } else {
      roomTakenRight += ENGRAVE.rightAnnotationGap
      if (spans !== null)
        spans.right = Math.max(spans.right, roomTakenRight + width + ENGRAVE.rightAnnotationGap)
      texts.push({
        text: a.text,
        x: headX + roomTakenRight,
        y: stepToY(averageStep),
        size,
        bold: false,
        italic: false,
        reserve: pointReserve(stepToY(averageStep)),
      })
    }
  }

  // `"@x,y text"` — ABSOLUTE placement, and it reserves NOTHING: abcjs gives it `w: 0` and
  // a pitch of `elem.minpitch + (y + 3 * STEP) / STEP` (`add-chord.js:88-96`), so it takes
  // no lane and no width. Ours put it in the chord lane and printed its coordinates —
  // `"@1,1E"e` alone reserved 22.38px abcjs does not.
  for (const a of annotations) {
    if (a.where !== 'relative') continue
    const y = stepToY(minStep + 3 + a.dy / STEP_PX)
    texts.push({
      text: a.text,
      x: headX + a.dx / STAFF_SPACE_PX,
      y,
      size: fontSizeOf('annotationfont'),
      bold: false,
      italic: false,
      reserve: pointReserve(y),
    })
  }

  // A REST STOPS HERE. It carries a chord symbol and annotations, which abcjs engraves
  // over it like any other element, but no lyric — nothing sings a rest.
  if (event.type === 'rest') return texts

  // Verse 1 comes from `lyric`; `extraVerses` holds 2..n, positionally, with a null
  // wherever a verse skips this note.
  const verses = [event.lyric, ...event.extraVerses]
  // `%%vocalfont`, realized. THE NULL BRANCH DOES NO ARITHMETIC: a tune that never sets a
  // vocalfont takes `ENGRAVE.lyricTextSize` itself, the same object it always took, so
  // its geometry cannot move by a rounding step. Computing a size and finding it equal to
  // the default would be the same value in theory and a sub-pixel drift across every
  // font-free fixture in practice.
  //
  // Verse 1 only, because `lyricFont` is per event and `extraVerses` is a bare
  // (string|null)[] with nowhere to put one — the same limitation melisma has, recorded
  // on `lyricMelisma` in the model. A `%%vocalfont` between two `w:` lines under the same
  // music therefore styles verse 1 and not verse 2.
  //
  // MODE-GATED, and this direction is deliberate: abcjs stamps `el.fonts` at parse time
  // and never reads `.fonts` anywhere in its write phase, so its mid-tune vocalfont is
  // parsed and never realized. Strict reproduces that by drawing every syllable in the
  // default. Realizing it in strict would be an IMPROVEMENT, which is the one thing
  // strict must not do.
  const lyricSize =
    !strict && event.lyricFont !== null
      ? // Ratio FIRST. `size / DEFAULT` is exactly 1 when they are equal, whatever the
        // values, so `%%vocalfont Times-Bold` with no size lands on the default size
        // exactly rather than a rounding step away from it. Multiplying first happens to
        // be exact for 13 too, and would stop being so if either constant moved.
        ENGRAVE.lyricTextSize * (event.lyricFont.size / DEFAULT_VOCALFONT_PT)
      : ENGRAVE.lyricTextSize
  const lyricBold = !strict && event.lyricFont !== null ? event.lyricFont.bold : true
  const lyricItalic = !strict && event.lyricFont !== null ? event.lyricFont.italic : false
  verses.forEach((verse, index) => {
    if (verse === null || verse === '') return
    // Verse 1 carries the font; later verses stay at the default until `extraVerses` can
    // hold one of their own.
    const size = index === 0 ? lyricSize : ENGRAVE.lyricTextSize
    centred(verse, size, 0, 'serifBold')
    texts.push({
      text: verse,
      // Tagged so the melisma pass can find the syllable it must extend from. Matching
      // on the y lane instead would couple that pass to this one's lane arithmetic.
      role: 'lyric',
      // MEASUREMENT follows the same `size`, so a bigger font both draws and occupies
      // bigger. A font that draws large and measures at the default width is how lyrics
      // end up overlapping — the centring here and the melisma extender's start both
      // read this width.
      // CENTRED ON THE ELEMENT'S x, which is the notehead's LEFT edge, not its middle —
      // abcjs's lyric RelativeElement has `dx = 0` and the golden agrees to the pixel:
      // `text-anchor="middle" x="106.03"` under a note placed at 106.03.
      x: headX - textWidth(verse, size, 'serifBold') / 2,
      y: stepToY(ENGRAVE.lyricStep - index * ENGRAVE.lyricLineStep),
      size,
      // BOLD BY DEFAULT — abcjs's `vocalfont` is Times New Roman 13pt **bold**
      // (`parse/abc_parse_directive.js:30`) and its goldens draw every syllable with
      // `font-weight="bold"`. `%%vocalfont` can still turn it off in the modes that read
      // the directive at all.
      bold: index === 0 ? lyricBold : true,
      italic: index === 0 ? lyricItalic : false,
    })
  })

  return texts
}

/**
 * Melisma runs — one syllable held across several notes.
 *
 * Two different jobs, because the modes disagree about what a melisma LOOKS like:
 *
 *   strict    abcjs prints the `_` literally after the syllable and draws no line. Its
 *             element dump carries `c: "sing_"` as one text, so the underscore is folded
 *             into the syllable and the pair re-centred, not dropped alongside it.
 *   non-strict  the `_` is suppressed and an extender line is stroked instead, which is
 *             what every engraving convention actually asks for.
 *
 * ENDPOINT, per Gould, *Behind Bars* p.447: the line runs to the last written NOTE, not to
 * the end of that note's duration — and the book prints the over-long form as a captioned
 * example of the mistake. So it stops at the last held NOTEHEAD's right edge, NOT at the
 * end of the duration allotment and NOT at the next syllable. abcMusicKit v1 and v2 both
 * arrived here independently; this model's own comment used to prescribe the duration
 * extent, which is the error Gould is warning about.
 *
 * A rest inside the run keeps it alive without moving its end — also v1's rule. Rests
 * carry no lyric fields at all, so they are skipped rather than tested.
 *
 * ponytail: a run that crosses a system break is truncated at the edge, because anchors
 * arrive already filtered to one system. v1 draws a stub and resumes on the next; worth
 * doing when a fixture needs it.
 */
/**
 * Spanning decorations: hairpins and glissandi.
 *
 * These come in open/close pairs — `!<(!` … `!<)!` — so unlike every other decoration
 * they cannot be drawn from one note. The pass mirrors `layoutCurves`: walk the anchors,
 * remember where each kind opened, emit geometry when it closes.
 *
 * HAIRPIN geometry from abcjs 6.6.3's painted output. It draws two strokes from a common
 * apex to a spread mouth — `M 70.85 128.35 L 198.13 124.35` plus `L 198.13 132.35`, a
 * mouth of 8px against its 7.75px staff space, so almost exactly one space. A crescendo
 * points left and opens right; a diminuendo is the mirror. Both sit in the dynamic lane
 * below the staff, which is where a lone `!p!` already goes.
 *
 * ponytail: a pair that opens on one system and closes on another is dropped rather than
 * split, because anchors arrive filtered to a single system. Slurs solve this properly by
 * resolving after the whole tune is packed; hairpins can move to that machinery when a
 * fixture needs it. No corpus fixture spans one.
 */
const SPANNER_OPEN: Readonly<Record<string, 'crescendo' | 'diminuendo' | 'glissando'>> = {
  '<(': 'crescendo',
  'crescendo(': 'crescendo',
  '>(': 'diminuendo',
  'diminuendo(': 'diminuendo',
  'glissando(': 'glissando',
}
const SPANNER_CLOSE: Readonly<Record<string, 'crescendo' | 'diminuendo' | 'glissando'>> = {
  '<)': 'crescendo',
  'crescendo)': 'crescendo',
  '>)': 'diminuendo',
  'diminuendo)': 'diminuendo',
  'glissando)': 'glissando',
}

/**
 * Braces and brackets joining the staves of a `%%score` group.
 *
 * Placed once the staves have their final `originY`, since a connector spans from the top
 * of the first staff in its group to the bottom of the last — which is only known then.
 *
 * SMuFL draws a brace as one glyph meant to be STRETCHED vertically, and a bracket as a
 * plain rule with separate serifs at each end. So the brace is scaled and the bracket is
 * built, which is also how the two differ in engraving: a brace is a piece of lettering,
 * a bracket is a rule.
 */
function layoutConnectors(
  groups: readonly StaffGroup[],
  staves: readonly { readonly originY: number }[],
): { glyphs: PlacedGlyph[]; lines: PlacedLine[] } {
  const glyphs: PlacedGlyph[] = []
  const lines: PlacedLine[] = []
  if (groups.length === 0) return { glyphs, lines }

  /** Runs of consecutive staves sharing a connector, from its `start`…`end` markers. */
  const runs = (kind: 'brace' | 'bracket'): { from: number; to: number }[] => {
    const out: { from: number; to: number }[] = []
    let open: number | null = null
    groups.forEach((group, i) => {
      const mark = kind === 'brace' ? group.brace : group.bracket
      if (mark === 'start') open = i
      if (mark === 'end' && open !== null) {
        out.push({ from: open, to: i })
        open = null
      }
    })
    return out
  }

  const edge = (index: number): { top: number; bottom: number } | null => {
    const staff = staves[index]
    if (staff === undefined) return null
    // A staff spans steps +4 to -4 around its own origin.
    return { top: staff.originY + stepToY(4), bottom: staff.originY + stepToY(-4) }
  }

  for (const { from, to } of runs('brace')) {
    const first = edge(from)
    const last = edge(to)
    if (first === null || last === null) continue
    const height = last.bottom - first.top
    const glyph = GLYPHS.brace
    // Stretched to the span. The glyph's own height is its natural size, so the scale is
    // the ratio — the one place a glyph is deliberately not drawn at 1:1.
    glyphs.push({
      name: 'brace',
      x: -ENGRAVE.connectorGap - glyph.width,
      y: first.top,
      scale: height / glyph.height,
      role: 'staff',
    })
  }

  for (const { from, to } of runs('bracket')) {
    const first = edge(from)
    const last = edge(to)
    if (first === null || last === null) continue
    const x = -ENGRAVE.connectorGap
    lines.push({
      x1: x,
      y1: first.top,
      x2: x,
      y2: last.bottom,
      thickness: ENGRAVE.bracketThickness,
      role: 'staff',
    })
    glyphs.push({ name: 'bracketTop', x, y: first.top, role: 'staff' })
    glyphs.push({ name: 'bracketBottom', x, y: last.bottom, role: 'staff' })
  }

  return { glyphs, lines }
}

function layoutSpanners(
  anchors: readonly NoteAnchor[],
  /** Where each system's music starts and ends, exactly as `layoutCurves` uses it. */
  bounds: readonly { left: number; right: number }[],
  /** Hairpins share the dynamics lane, so they share its side. See `dynamicAboveStep`. */
  dynamicsAbove: boolean,
): PlacedLine[][] {
  const out: PlacedLine[][] = bounds.map(() => [])
  const thickness = LINE_WEIGHTS.staffLine

  /**
   * One hairpin piece: two strokes whose gap goes from `startGap` to `endGap`.
   *
   * A hairpin split across systems is NOT two whole hairpins — it is one shape cut in
   * half, so each piece continues the taper the other left off at. The mouth therefore
   * interpolates by how much of the span each system carries.
   */
  const hairpin = (system: number, x1: number, x2: number, g1: number, g2: number): void => {
    if (x2 - x1 < ENGRAVE.spannerMinLength) return
    const y = stepToY(dynamicsAbove ? ENGRAVE.dynamicAboveStep : ENGRAVE.dynamicBelowStep)
    out[system]?.push(
      { x1, y1: y - g1 / 2, x2, y2: y - g2 / 2, thickness, role: 'dynamic' },
      { x1, y1: y + g1 / 2, x2, y2: y + g2 / 2, thickness, role: 'dynamic' },
    )
  }

  const emit = (from: NoteAnchor, to: NoteAnchor, kind: string): void => {
    if (kind === 'glissando') {
      // Tracks PITCH, so it follows the noteheads rather than sitting in a lane. A
      // glissando across a system break is dropped rather than split: half a pitch line
      // aimed at a note the reader cannot see says nothing. No fixture writes one.
      if (from.system !== to.system) return
      out[from.system]?.push({
        x1: from.right + ENGRAVE.spannerGap,
        y1: (from.top + from.bottom) / 2,
        x2: to.left - ENGRAVE.spannerGap,
        y2: (to.top + to.bottom) / 2,
        thickness,
        role: 'decoration',
      })
      return
    }

    const mouth = ENGRAVE.hairpinMouth
    // Gap as a fraction of the way along: a crescendo opens, a diminuendo closes.
    const gapAt = (t: number) => (kind === 'crescendo' ? t : 1 - t) * mouth

    if (from.system === to.system) {
      hairpin(from.system, from.left, to.right, gapAt(0), gapAt(1))
      return
    }
    const start = bounds[from.system]
    const end = bounds[to.system]
    if (start === undefined || end === undefined) return
    const firstRun = Math.max(0, start.right - from.left)
    const lastRun = Math.max(0, to.right - end.left)
    const total = firstRun + lastRun
    const split = total === 0 ? 0.5 : firstRun / total
    hairpin(from.system, from.left, start.right, gapAt(0), gapAt(split))
    hairpin(to.system, end.left, to.right, gapAt(split), gapAt(1))
  }

  // A QUEUE per kind, not a single slot. `S1-decorations` writes `!crescendo(!G!<(!G`
  // and then closes both — the two spellings are the same kind, so a single slot let the
  // second open overwrite the first and silently lost a hairpin. FIFO rather than a
  // stack because hairpins on one voice run in sequence; they do not nest, so the first
  // open belongs to the first close.
  const open = new Map<string, NoteAnchor[]>()

  for (const anchor of anchors) {
    if (anchor.event.type === 'rest') continue
    for (const name of anchor.event.decorations) {
      const opens = SPANNER_OPEN[name]
      if (opens !== undefined) {
        const queue = open.get(opens)
        if (queue === undefined) open.set(opens, [anchor])
        else queue.push(anchor)
        continue
      }
      const closes = SPANNER_CLOSE[name]
      if (closes === undefined) continue
      const from = open.get(closes)?.shift()
      if (from !== undefined) emit(from, anchor, closes)
    }
  }

  return out
}

function layoutMelismas(
  anchors: readonly NoteAnchor[],
  elements: LayoutElement[],
  strict: boolean,
): PlacedLine[] {
  const lines: PlacedLine[] = []

  anchors.forEach((start, index) => {
    if (start.event.type === 'rest' || !start.event.lyricMelismaStart) return

    const element = elements[start.element]
    const lyricIndex = element?.texts.findIndex((t) => t.role === 'lyric') ?? -1
    const lyric = lyricIndex < 0 ? undefined : element?.texts[lyricIndex]
    if (element === undefined || lyric === undefined) return

    if (strict) {
      // One text, as abcjs emits it. Appending widens the string by the underscore, so
      // the pair re-centres by half that — the syllable itself shifts left, which is
      // what centring "sing_" rather than "sing" does.
      const widened = `${lyric.text}_`
      const texts = [...element.texts]
      texts[lyricIndex] = {
        ...lyric,
        text: widened,
        x: lyric.x - textWidth('_', lyric.size, 'serifBold') / 2,
      }
      elements[start.element] = { ...element, texts }
      return
    }

    // Only the LINE needs the far end, which is why the search sits below the strict
    // branch rather than above it. The two modes wrap differently — strict renders at
    // abcjs's denser spacing — so a run can be intact in one mode and split across a
    // system break in the other. abcjs prints the `_` either way, because for abcjs it
    // is part of the syllable's text and has nothing to do with where the hold landed.
    // Gating it on finding a hold in THIS system dropped the underscore from
    // S5-directives, which is real corpus content no gate renders.
    let last: NoteAnchor | null = null
    for (const anchor of anchors.slice(index + 1)) {
      if (anchor.event.type === 'rest') continue
      if (!anchor.event.lyricMelisma) break
      last = anchor
    }
    if (last === null) return

    const from = lyric.x + textWidth(lyric.text, lyric.size, 'serifBold') + ENGRAVE.melismaGap
    const to = last.right + ENGRAVE.melismaGap
    // A run so tight that the line would be a speck reads as a smudge; drop it instead.
    if (to - from < ENGRAVE.melismaMinLength) return
    lines.push({
      x1: from,
      y1: lyric.y,
      x2: to,
      y2: lyric.y,
      thickness: LINE_WEIGHTS.staffLine,
      role: 'lyric',
    })
  })

  return lines
}

// ─── Slurs and ties ──────────────────────────────────────────────────────────

/** Where a curve can attach to a note, recorded during layout. */
interface NoteAnchor {
  /** Left and right edges of the notehead, and its vertical extremes. */
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  /**
   * `anchor.pitch` AS ABCJS MEANS IT — the FIRST pitch of the chord as the source wrote
   * it, not the chord's middle and not its lowest note. A slur or tie is hung on
   * `el.pitches[0]` and on nothing else (`parse/abc_parse_music.js:503-506`), so that one
   * notehead is what every curve reserve is measured from. `ave-verum-corpus`'s organ
   * staff pairs pitch 1 to pitch 0 on that rule where the chord's centre pairs 1 to 1.
   *
   * Taken from the EVENT rather than the drawn heads, which `layoutNoteheads` sorts by
   * pitch so that `[GCE]` and `[CEG]` engrave alike.
   */
  readonly pitchY: number
  readonly stemUp: boolean
  /** The source event, so ties and slurs can be matched to what the music said. */
  readonly event: MusicEvent
  /** Which system this note ended up in — a curve spanning two is drawn in halves. */
  readonly system: number
  /**
   * Index into the staff's `elements`, filled when the block is placed.
   *
   * A tuplet bracket must clear the STEMS and BEAMS, not just the noteheads, and those
   * are only final after the beam pass has retargeted them — so the bracket reads the
   * drawn element rather than the anchor's own notehead extent.
   */
  readonly element: number
}

/**
 * Build one curve between two anchors.
 *
 * A slur or tie sits on the NOTEHEAD side, opposite the stems — that is the convention,
 * and it is also what keeps the curve clear of the stems and beams. When the two ends
 * disagree about stem direction the curve goes above, which is the usual tie-break.
 */
function buildCurve(
  from: NoteAnchor,
  to: NoteAnchor,
  kind: 'tie' | 'slur',
  /** The voice's index on its staff, or −1 when it has that staff to itself. */
  voicePos: number,
): PlacedCurve {
  const above = curveIsAbove(from, to, voicePos)
  const direction = above ? -1 : 1

  const x1 = from.right + ENGRAVE.curveEndGap
  const x2 = to.left - ENGRAVE.curveEndGap
  const edge = (a: NoteAnchor) => (above ? a.top : a.bottom) + direction * ENGRAVE.curveEndGap

  const span = Math.max(0, x2 - x1)
  const bulge = Math.min(
    ENGRAVE.curveMaxBulge,
    Math.max(ENGRAVE.curveMinBulge, span * ENGRAVE.curveBulgeRatio),
  )

  return {
    x1,
    y1: edge(from),
    x2,
    y2: edge(to),
    bulge: bulge * direction,
    endThickness: kind === 'tie' ? LINE_WEIGHTS.tieEndpoint : LINE_WEIGHTS.slurEndpoint,
    midThickness: kind === 'tie' ? LINE_WEIGHTS.tieMidpoint : LINE_WEIGHTS.slurMidpoint,
    kind,
  }
}

/**
 * Which side of the notes a tie or slur sits on.
 *
 * ON A SHARED STAFF THE VOICE DECIDES, and the stems do not come into it:
 * `calcSlurDirection` / `calcTieDirection` short-circuit on `voiceNumber === 0` -> above,
 * `> 0` -> below, and only a voice with the staff to itself
 * (`voicetotal < 2 ? -1 : voicenumber`, `abstract-engraver.js:235`) reaches the stem
 * rules. Reading the stems for every voice put `ragtime-nightingale`'s upper-voice slurs
 * BELOW, where abcjs draws them above — and, because a beamed end is pinned to the beam,
 * that is the difference between reserving nothing and reserving 2.43 pitch.
 *
 * The stem rules themselves differ between the two, and this keeps our one-line
 * approximation of them: a curve goes opposite the stems, above when they disagree.
 */
function curveIsAbove(from: NoteAnchor, to: NoteAnchor, voicePos: number): boolean {
  if (voicePos === 0) return true
  if (voicePos > 0) return false
  return !(from.stemUp && to.stemUp)
}

/**
 * Resolve every tie and slur over one staff's notes, in order.
 *
 * Ties are pairwise and local: `tiedToNext` joins a note to the one after it. Slurs
 * nest, so `slurStarts` and `slurEnds` are COUNTS and matching them needs a stack —
 * `((AB)C)` has two slurs opening on the same note and they close in reverse.
 *
 * ponytail: a curve whose ends fall in different SYSTEMS is dropped rather than drawn
 * wrong. Engraving splits it in two, one piece running to the end of the first system
 * and another from the start of the next; that needs the halves laid out separately and
 * is a slice of its own. `vree-ties-across-bars` ties across a BARLINE, which is fine —
 * only a system break drops one.
 */
function layoutCurves(
  anchors: readonly NoteAnchor[],
  /**
   * Where each system's music starts and ends. A split curve runs to the right edge of
   * the system it leaves and resumes after the clef and key of the one it enters.
   */
  bounds: readonly { left: number; right: number }[],
  /** The voice's index on its staff, or −1 when it has that staff to itself. */
  voicePos: number,
): PlacedCurve[][] {
  const curves: PlacedCurve[][] = bounds.map(() => [])
  const open: number[] = []

  /**
   * Emit one logical curve, SPLITTING it if its ends are in different systems.
   *
   * Engraving breaks such a curve in two: a piece running from the first note to the end
   * of its system, and a piece from the start of the next system to the second note.
   * Each half keeps the full arc shape, so the eye completes it across the break.
   *
   * ponytail: a curve spanning THREE systems — possible only for a very long slur —
   * gets its two ends and no middle. The intervening systems would each want a full-width
   * arc; no corpus fixture has one.
   */
  const emit = (from: NoteAnchor, to: NoteAnchor, kind: 'tie' | 'slur'): void => {
    if (from.system === to.system) {
      curves[from.system]?.push(buildCurve(from, to, kind, voicePos))
      return
    }
    const start = bounds[from.system]
    const end = bounds[to.system]
    if (start === undefined || end === undefined) return

    // Each half is LEVEL at its own note's height. Sloping it toward a note in another
    // system would aim at a pitch the reader cannot see, and the two halves would tilt
    // in unrelated directions.
    curves[from.system]?.push(
      buildCurve(from, { ...from, left: start.right, right: start.right }, kind, voicePos),
    )
    // The continuation resumes after the new system's clef and key — starting at the
    // system's left edge drew it straight through the clef, where it was invisible.
    //
    // ponytail: if the first note sits hard against the prefix there is no room for the
    // hook, and it is OMITTED rather than drawn backwards. The half running off the
    // previous system still signals that the curve continues, which is most of the
    // reading benefit. Engraving reserves room at the system start for exactly this;
    // doing that means feeding the curve back into spacing, which is a slice of its own.
    const resume = Math.max(end.left, to.left - ENGRAVE.curveContinuation)
    if (to.left - resume >= ENGRAVE.curveEndGap * 2) {
      curves[to.system]?.push(
        buildCurve({ ...to, left: resume, right: resume }, to, kind, voicePos),
      )
    }
  }

  anchors.forEach((anchor, i) => {
    const event = anchor.event
    if (event.type === 'rest') return

    // Slurs close before they open, so `(A)(B)` closes on A before opening on B.
    for (let n = 0; n < event.slurEnds; n++) {
      const start = open.pop()
      const from = start === undefined ? undefined : anchors[start]
      if (from !== undefined) emit(from, anchor, 'slur')
    }
    for (let n = 0; n < event.slurStarts; n++) open.push(i)

    // A tie joins this note to the next SOUNDING one, wherever it falls.
    if (event.tiedToNext) {
      const next = anchors[i + 1]
      if (next !== undefined) emit(anchor, next, 'tie')
    }
  })

  return curves
}

/**
 * What each tie and slur RESERVES on its staff — a flat 3-pitch box, not its arc.
 *
 * `setUpperAndLowerVoiceElements` gives `TieElem` a case of its own
 * (`set-upper-and-lower-elements.js:139-146`) and grows the staff's range by
 * `getYBounds()`, which is declared rather than measured
 * (`creation/elements/tie-element.js:228-251`):
 *
 *     above: bottom = min(startY, endY);  top = bottom + 3
 *     below: top    = min(startY, endY);  bottom = top - 3
 *
 * — in PITCH, off the anchors, with abcjs's own "it's hard to tell how far the arc is,
 * so I'm just using 3 as the max" beside it. Both bounds then go through `max` AND `min`,
 * so the staff covers the whole box. A below slur is therefore three pitch under its
 * LOWER anchor whatever the curve draws, and that was 9 of `ragtime-nightingale`'s staves
 * sitting 1.0 to 2.6 pitch short at the bottom.
 *
 * Paired over ONE system's anchors, because that is the set of `TieElem`s abcjs has in
 * the voice when it measures. Like the hairpin lane this cannot read `curves` — those
 * resolve after packing, when the extent is long decided.
 *
 * ponytail: `startY`/`endY` are the anchor pitches, which is `calcSlurY`'s `else` branch.
 * An ABOVE slur between two up-stem notes reads the middle of the stem instead; that
 * side is inside the notes' own ink in every corpus fixture, so it never binds.
 */
function curveReserves(
  anchors: readonly NoteAnchor[],
  elements: readonly LayoutElement[],
  voicePos: number,
): { ink: { top: number; bottom: number }[]; post: { top: number; bottom: number }[] } {
  const reserves: { top: number; bottom: number }[] = []
  /**
   * The EARLIER of a curve's two reserves — a flat 4 pitch either side of its anchors,
   * set the moment the closing note is known:
   *
   *     this.top    = Math.max(anchor1.pitch, anchor2.pitch) + 4
   *     this.bottom = Math.min(anchor1.pitch, anchor2.pitch) - 4
   *
   * with abcjs's own "we don't really have enough info to know what the vertical extent
   * is yet… this will just give it enough room on either side" beside it
   * (`tie-element.js:28-36`). `voice.addOther` runs `setRange` on it, so unlike the
   * `getYBounds` box this one is INK, and every lane then stacks on top of it.
   * `ave-verum-corpus`'s tenor staff reaches its bottom on nothing else.
   */
  const ink: { top: number; bottom: number }[] = []
  const four = 4 * ENGRAVE.spacePerStep
  const open: number[] = []
  const centre = (a: NoteAnchor) => a.pitchY
  /**
   * `parent.fixed` — the element's OWN box over its fixed children, so on a beamed note
   * the beam-retargeted stem end, and on the other side the notehead's. Not the stem
   * alone: reading only the stem left four staves half a pitch out either way.
   */
  const fixedOf = (a: NoteAnchor): { top: number; bottom: number } => {
    // A NOTEHEAD's declared box is `pitch ± thickness / 2` and the thickness is the
    // glyph's own height in pitches — see `ENGRAVE.noteheadHalfHeight`. `a.top`/`a.bottom`
    // carry half a space of curve padding, so that comes off before the real half goes on.
    let top = a.top + ENGRAVE.spacePerStep - ENGRAVE.noteheadHalfHeight
    let bottom = a.bottom - ENGRAVE.spacePerStep + ENGRAVE.noteheadHalfHeight
    for (const line of elements[a.element]?.lines ?? []) {
      top = Math.min(top, line.y1, line.y2)
      bottom = Math.max(bottom, line.y1, line.y2)
    }
    return { top, bottom }
  }
  const three = 3 * ENGRAVE.spacePerStep
  /** Position in its own beam group, so the mid-beam rules below can be applied. */
  const beamPos = (a: NoteAnchor): 'none' | 'first' | 'last' | 'middle' => {
    const group = a.event.type === 'rest' ? null : a.event.beamGroup
    if (group === null) return 'none'
    const members = anchors.filter((b) => b.event.type !== 'rest' && b.event.beamGroup === group)
    if (members.length < 2) return 'none'
    if (members[0] === a) return 'first'
    if (members[members.length - 1] === a) return 'last'
    return 'middle'
  }
  /**
   * `calcSlurY`'s `startY`/`endY` for one end, in our y.
   *
   * A BEAMED end is pinned to `parent.fixed.t` / `.b` rather than to its notehead —
   * TIES INCLUDED. `getYBounds` branches on `this.isTie`, and nothing sets that before
   * layout: `TieElem`'s constructor never reads `options.isTie`, and only `draw/tie.js`
   * assigns it, at draw time. So every curve takes `calcSlurY` here whatever it is —
   * abcjs's own bug, and excluding real ties from the rule undid the whole finding.
   * The rule proper:
   * `hasBeam1 && !isLastInBeam` for the start, `hasBeam2 && !isFirstInBeam` for the end
   * (`tie-element.js`, inside the `scalex === 1` non-grace guard). `fixed` is the
   * element's own extent over its fixed children, so on the beam side that is where the
   * beam retargeted the stem. EVERY curve that binds a staff in `ragtime-nightingale`
   * takes this branch — its fractional `startY` against an integer anchor pitch is the
   * tell — and reading the notehead instead reserved nothing at all.
   *
   * ponytail: `(highestVert + pitch) / 2`, the half-way-up-the-stem case for an above end
   * on an up-stem note, is not reproduced. Probed, `highestVert` IS the anchor pitch on
   * every binding curve here, so the average is the pitch and the branch is a no-op.
   */
  const endAt = (a: NoteAnchor, above: boolean, isStart: boolean): number => {
    const pos = beamPos(a)
    if (pos !== 'none' && (isStart ? pos !== 'last' : pos !== 'first')) {
      const fixed = fixedOf(a)
      return above ? fixed.top : fixed.bottom
    }
    return centre(a)
  }
  const add = (from: NoteAnchor, to: NoteAnchor): void => {
    const above = curveIsAbove(from, to, voicePos)
    // abcjs's `Math.min` over PITCHES is our `Math.max` over y — the lower end on screen.
    const y = Math.max(endAt(from, above, true), endAt(to, above, false))
    if (process.env.ABCTS_CURVE) {
      const p = (v: number) => (6 - 2 * v).toFixed(4)
      const dump = (a: NoteAnchor) =>
        `${a.left.toFixed(2)}@${p(centre(a))} pos=${beamPos(a)} el=${a.element}` +
        ` fixed.b=${p(fixedOf(a).bottom)} lines=[${(elements[a.element]?.lines ?? []).map((l) => `${l.role ?? '?'}:${p(l.y1)}..${p(l.y2)}`).join(' ')}]`
      console.log(`CURVE above=${above} res=${p(y + three)} | a1 ${dump(from)} | a2 ${dump(to)}`)
    }
    reserves.push(above ? { top: y - three, bottom: y } : { top: y, bottom: y + three })
    ink.push({
      top: Math.min(centre(from), centre(to)) - four,
      bottom: Math.max(centre(from), centre(to)) + four,
    })
  }
  anchors.forEach((anchor, i) => {
    if (anchor.event.type === 'rest') return
    for (let n = 0; n < anchor.event.slurEnds; n++) {
      const start = open.pop()
      const from = start === undefined ? undefined : anchors[start]
      if (from !== undefined) add(from, anchor)
    }
    for (let n = 0; n < anchor.event.slurStarts; n++) open.push(i)
    if (anchor.event.tiedToNext) {
      const next = anchors[i + 1]
      if (next !== undefined) add(anchor, next)
    }
  })
  return { ink, post: reserves }
}

// ─── Tuplets ─────────────────────────────────────────────────────────────────

/**
 * Tuplet brackets and their number.
 *
 * A tuplet is a rhythmic claim — "three in the time of two" — and without the digit a
 * triplet is indistinguishable from three plain notes. 177 tuplet members sit in the
 * corpus and none of them were drawn; the structural gate never noticed, because it
 * compares noteheads and abcjs does not put a tuplet bracket in `children` either.
 *
 * *Behind Bars*: over a BEAMED group the beam already shows the grouping, so only the
 * number is printed. Over unbeamed notes the number needs a bracket to say how far the
 * claim extends. Both sit on the stem side, with the beam rather than across the
 * noteheads.
 */
function layoutTuplets(
  anchors: readonly NoteAnchor[],
  elements: readonly LayoutElement[],
): {
  lines: PlacedLine[]
  texts: PlacedText[]
  reservesAbove: boolean
  /** abcjs's declared `[top, bottom]` per tuplet, in our y — see `reserves` below. */
  reserves: { top: number; bottom: number }[]
} {
  /**
   * A member's extent AS abcjs DECLARES IT — not as it paints.
   *
   * abcjs's `anchor1.parent.top` is the AbsoluteElement's top, a max over its children's
   * DECLARED tops, and a notehead's is its PITCH — the centre of the head, with no ink
   * around it. A stem contributes its endpoint. Measuring the outline instead runs every
   * head 1 pitch high (half a space), which is enough to fire the high-middle-note
   * override in `layoutTriplet` where abcjs's does not: on
   * `multi-voice-triplet-brackets` that turned a bracket at 18/15 into one at 19/19.
   *
   * `NoteAnchor` pads the head box by half a space on each side for curve endpoints, so
   * that padding comes back off here.
   */
  const extentOf = (anchor: NoteAnchor): { top: number; bottom: number } => {
    const el = elements[anchor.element]
    let top = anchor.top + ENGRAVE.spacePerStep - ENGRAVE.noteheadHalfHeight
    let bottom = anchor.bottom - ENGRAVE.spacePerStep + ENGRAVE.noteheadHalfHeight
    for (const line of el?.lines ?? []) {
      top = Math.min(top, line.y1, line.y2)
      // An UNBEAMED stem declares one pitch past its low end — `bottom: p1 - 1`
      // (`abstract-engraver.js:762`) — and `abselem.bottom` carries it, so the bracket
      // arithmetic that reads `anchor.parent.bottom` gets it too. `multi-voice-triplet-
      // brackets` sat exactly that pitch short at the bottom of its first system.
      const extra = line.role === 'stem' && line.beamed !== true ? ENGRAVE.spacePerStep : 0
      bottom = Math.max(bottom, line.y1 + extra, line.y2 + extra)
    }
    return { top, bottom }
  }

  const lines: PlacedLine[] = []
  const texts: PlacedText[] = []
  /**
   * Whether ANY tuplet on this staff reserves the ending lane — and abcjs reserves it
   * ABOVE whichever side it then draws the bracket on.
   *
   * `TripletElem.setCloseAnchor`: `if (!this.anchor1.parent.beam || this.anchor1.stemDir
   * === 'up') this.endingHeightAbove = 4` (`elements/triplet-element.js:22-25`). There is
   * no `endingHeightBelow` anywhere in abcjs — `positionY` has no such field — so an
   * unbeamed triplet reserves 4 pitches ABOVE the staff even when its bracket hangs
   * below. `vree-slurs-and-triplets` is exactly that case: abcjs draws its `3` under the
   * staff, at y 149.24 against a bottom line at 127.9, and still reserves above, which
   * put its whole drawing 19.35px lower than ours. Deriving the side from where the
   * bracket is DRAWN is the reasonable reading and it is not abcjs's.
   */
  let reservesAbove = false
  /**
   * What each tuplet contributes to the staff's range — abcjs's `element.top = yTextPos +
   * 1; element.bottom = yTextPos - 2` (`layout/triplet.js:20-21,73-74`), a small box in
   * PITCH around where the NUMBER sits, and not the bracket's drawn lines at all. `y` is
   * our equivalent of `yTextPos`, so +1 pitch up is half a space and -2 pitch down is one.
   */
  const reserves: { top: number; bottom: number }[] = []

  // Members of one tuplet are contiguous, so grouping by id preserves their order.
  const groups = new Map<number, NoteAnchor[]>()
  for (const anchor of anchors) {
    const tuplet = anchor.event.tuplet
    if (tuplet === null) continue
    const members = groups.get(tuplet.group) ?? []
    members.push(anchor)
    groups.set(tuplet.group, members)
  }

  for (const members of groups.values()) {
    const first = members[0]
    const last = members[members.length - 1]
    if (first === undefined || last === undefined) continue
    const number = first.event.tuplet?.number ?? 0
    if (number === 0) continue

    // The bracket goes on the stem side, where the beam is, so it never crosses the
    // noteheads. A majority vote: a group whose stems disagree is rare and the beam
    // pass has usually forced them to agree anyway.
    const up = members.filter((m) => m.stemUp).length * 2 >= members.length
    const direction = up ? -1 : 1
    // abcjs's reserve rule, off the FIRST member only — not the majority, and not the
    // side the bracket lands on. Its `anchor1.parent.beam` is whether that note is drawn
    // into a beam, which our stem line records.
    const firstBeamed =
      elements[first.element]?.lines.some((l) => l.role === 'stem' && l.beamed === true) ?? false
    if (!firstBeamed || first.stemUp) reservesAbove = true

    // A tuplet entirely inside ONE beam group needs no bracket: the beam already says
    // where it starts and stops. abcjs decides the same way and then takes a COMPLETELY
    // DIFFERENT y for it, so this has to come first.
    //
    // …and the beam must be the tuplet EXACTLY. abcjs re-checks that the group's first
    // and last notes are the beam's own first and last —
    // `beam.elems[0] !== anchor1.parent || beam.elems[len-1] !== anchor2.parent` clears
    // `hasBeam` again (`layout/triplet.js:11`, with `(3 dcdcc` named in its comment). A
    // triplet living INSIDE a longer beam still gets a bracket, and reading the beam's y
    // for it put one of `ragtime-nightingale`'s staves 8 pitch shallow at the bottom.
    const group =
      first.event.type === 'rest' || last.event.type === 'rest' ? null : first.event.beamGroup
    const inGroup =
      group === null
        ? []
        : anchors.filter((a) => a.event.type !== 'rest' && a.event.beamGroup === group)
    const beamed =
      group !== null &&
      members.every((m) => m.event.type !== 'rest' && m.event.beamGroup === group) &&
      inGroup[0] === first &&
      inGroup[inGroup.length - 1] === last

    // WHERE THE BRACKET GOES IS abcjs'S ARITHMETIC, per END NOTE and in PITCH
    // (`layout/triplet.js:29-64`):
    //
    //     up:   note = max(anchor.parent.top, 9) + 4      // never below the 'a' line
    //     down: note = min(anchor.parent.bottom, 0) - 2   // never above the 'C' line
    //
    // taken at the FIRST and LAST member separately, so the bracket may SLOPE; then a
    // really high (or low) middle note flattens it clear of itself. We cleared the
    // furthest extent of ANY member by one flat gap, which is a different line whenever
    // the ends differ, and 1.4 to 2.0 pitch out on `multi-voice-triplet-brackets`.
    const extents = members.map(extentOf)
    /** abcjs pitch from our y in staff spaces — pitch 0 is middle C, 2 the bottom line. */
    const pitchOf = (y: number): number => 6 - 2 * y
    const yOfPitch = (pitch: number): number => stepToY(pitch - 6)
    const endPitch = (e: { top: number; bottom: number }): number =>
      up ? Math.max(pitchOf(e.top), 9) + 4 : Math.min(pitchOf(e.bottom), 0) - 2
    const firstExtent = extents[0]
    const lastExtent = extents[extents.length - 1]
    if (firstExtent === undefined || lastExtent === undefined) continue
    /** A BEAMED tuplet has no bracket: its number rides the BEAM, 3 pitches clear above
     * it or 2 below (`layout/triplet.js:15-21`). Nothing of the end-note arithmetic below
     * applies — using it put `multi-voice-triplet-brackets` 24 pitch out. */
    const beamY = (): number => {
      const tipOf = (a: NoteAnchor): { x: number; y: number } | null => {
        const stem = elements[a.element]?.lines.find((l) => l.role === 'stem')
        if (stem === undefined) return null
        return { x: stem.x1, y: up ? Math.min(stem.y1, stem.y2) : Math.max(stem.y1, stem.y2) }
      }
      const a = tipOf(first)
      const b = tipOf(last)
      if (a === null || b === null) return (a ?? b)?.y ?? 0
      // THE BEAM IS SAMPLED AT AN x MIDPOINT, NOT AVERAGED OVER ITS ENDS — and the span
      // it is sampled over is NOT symmetric: `heightAtMidpoint(left, anchor2.x, beam)`
      // with `left = isAbove(beam) ? anchor1.x + anchor1.w : anchor1.x`
      // (`layout/triplet.js:15-16`). An ABOVE beam starts measuring from the far side of
      // the first notehead and stops at the near side of the last, so on a sloped beam
      // the sample lands off the midpoint of the two stem tips. The two agree on a level
      // beam, which is why averaging looked right: `multi-voice-rest-collision` is
      // sloped, and its `yTextPos` came out 16.5 against abcjs's 16.5929.
      const leftX = up ? first.right : first.left
      const midX = leftX + (last.left - leftX) / 2
      const span = b.x - a.x
      const y = span === 0 ? a.y : a.y + ((b.y - a.y) * (midX - a.x)) / span
      return y + (up ? -3 : 2) * ENGRAVE.spacePerStep
    }
    let startNote = endPitch(firstExtent)
    let endNote = endPitch(lastExtent)
    // A rest at either end makes the bracket horizontal.
    if (first.event.type === 'rest' && last.event.type !== 'rest') startNote = endNote
    else if (last.event.type === 'rest' && first.event.type !== 'rest') endNote = startNote
    // THE MIDDLE NOTES ARE MEASURED AS NOTEHEADS, THE ENDS AS WHOLE ELEMENTS.
    //
    // `middleElems` holds RELATIVE elements — abcjs pushes the notehead, which is why the
    // down branch can ask for its `.height` (`layout/triplet.js:56`, a RelativeElement
    // property). So a middle note contributes its HEAD's box and not its stem tip, where
    // `anchor1.parent.top` at the ends is the whole note. Probed on the same triplet:
    // abcjs reads a middle of 6.04 where our stem-tip reading said 12.00, and the six
    // pitches of difference fired the flattening override abcjs never reaches.
    const middle = members.slice(1, -1).map((m) => ({
      // A middle member contributes its NOTEHEAD's declared box — `pitch ± thickness/2`,
      // see `ENGRAVE.noteheadHalfHeight` — not the anchor's curve-padded one. That
      // 0.0444 of a pitch is what `multi-voice-triplet-brackets` was out by at both ends.
      top: m.top + ENGRAVE.spacePerStep - ENGRAVE.noteheadHalfHeight,
      bottom: m.bottom - ENGRAVE.spacePerStep + ENGRAVE.noteheadHalfHeight,
    }))
    if (middle.length > 0) {
      if (up) {
        const highest = Math.max(0, ...middle.map((e) => pitchOf(e.top))) + 4
        if (highest > startNote || highest > endNote) {
          startNote = highest + 3
          endNote = highest + 3
        }
      } else {
        // A LOW MIDDLE NOTE COUNTS ITS OWN HEIGHT AS WELL AS ITS POSITION:
        // `min(middleElems[i].bottom - middleElems[i].height)`, and `height` is
        // `RelativeElement`'s DEFAULT 4 (`relative-element.js:37`) for a notehead — a flat
        // figure, like everything else abcjs declares. The recorded ponytail note said no
        // corpus fixture had a low middle note that binds; `multi-voice-triplet-brackets`
        // does, and without the height its bracket sat 4 pitch high.
        const lowest =
          Math.min(0, ...middle.map((e) => pitchOf(e.bottom) - ENGRAVE.relativeElementHeight)) - 3
        if (lowest < startNote && lowest < endNote) {
          startNote = Math.min(lowest, startNote) - 2
          endNote = Math.min(lowest, endNote) - 2
        }
      }
    }
    const yStart = beamed ? beamY() : yOfPitch(startNote)
    const yEnd = beamed ? beamY() : yOfPitch(endNote)
    /** abcjs's `yTextPos` — the bracket's midpoint, and what its declared box hangs off. */
    const y = beamed ? beamY() : yOfPitch(startNote + (endNote - startNote) / 2)

    const label = String(number)
    const size = ENGRAVE.tupletTextSize
    const width = textWidth(label, size)
    const centre = (first.left + last.right) / 2

    texts.push({
      text: label,
      x: centre - width / 2,
      // Text hangs from its baseline, so a bracket ABOVE needs the number lifted clear.
      y: up ? y - size * 0.1 : y + size * 0.9,
      size,
      bold: false,
      italic: true,
    })

    reserves.push({ top: y - ENGRAVE.spacePerStep, bottom: y + 2 * ENGRAVE.spacePerStep })

    if (beamed) continue

    // Bracket: a horizontal rule broken around the number, with a hook at each end
    // turning toward the notes.
    const gap = width / 2 + ENGRAVE.tupletNumberGap
    const thickness = LINE_WEIGHTS.slurEndpoint
    const hook = ENGRAVE.tupletHook * -direction

    // The rule runs from one end note's pitch to the other's, so it slopes with them.
    lines.push({ x1: first.left, y1: yStart, x2: centre - gap, y2: y, thickness })
    lines.push({ x1: centre + gap, y1: y, x2: last.right, y2: yEnd, thickness })
    lines.push({ x1: first.left, y1: yStart, x2: first.left, y2: yStart - hook, thickness })
    lines.push({ x1: last.right, y1: yEnd, x2: last.right, y2: yEnd - hook, thickness })
  }

  return { lines, texts, reservesAbove, reserves }
}

// ─── Beams ───────────────────────────────────────────────────────────────────

/**
 * Draw one beam group: retarget every member's stem to a common beam line, and add the
 * beams themselves.
 *
 * The line is fitted from the two end notes' natural stem tips and then clamped twice —
 * once on slope, so a beam stays gently inclined however far the melody leaps, and once
 * on position, so no stem in the middle of the group ends up shorter than
 * `minStemLength`. Both are *Behind Bars*; the second is what stops a beam cutting
 * through a notehead that sits high inside a rising run.
 *
 * Returns the beam rectangles. Stems are rewritten in place in `elements`.
 */
function layoutBeam(group: readonly StemInfo[], elements: LayoutElement[]): PlacedLine[] {
  const first = group[0]
  const last = group[group.length - 1]
  if (!first || !last || group.length < 2) return []

  const up = first.up
  const direction = up ? -1 : 1

  // THE BEAM SITS A FIXED DISTANCE BEYOND THE GROUP'S EXTREME NOTE, not beyond its end
  // notes. Source: `layout/beam.js` `calcYPos`. In its own pitch units, which are our
  // staff steps exactly:
  //
  //     pos = round(asc ? max(average + barpos, maxPitch + barminpos)
  //                     : min(average - barpos, minPitch - barminpos))
  //
  // with `barpos === barminpos === stemHeight - 2`. Because the two are equal the
  // `average` term can never win — `maxPitch >= average` and `minPitch <= average` by
  // construction — so it reduces to `extreme +/- (stemHeight - 2)`. The vestigial term is
  // kept out rather than reproduced; the commented-out `(isGrace)? 5:7` beside it says
  // they were once different.
  //
  // This replaces a fit through the END notes plus a `minStemLength` push. The two agree
  // whenever an end note is the extreme and disagree whenever an interior one is, which
  // in a dense sixteenth run is most of the time.
  const barpos = ENGRAVE.beamStemHeight - 2
  const extreme = up
    ? Math.max(...group.map((stem) => stem.farStep))
    : Math.min(...group.map((stem) => stem.farStep))
  const pos = Math.round(up ? extreme + barpos : extreme - barpos)

  // Slant, from the END elements' average pitches and capped at half the stem count
  // (`calcSlant`). `Math.floor` on both halves is abcjs's, negatives included — it is what
  // makes an odd slant land asymmetrically rather than splitting evenly.
  const maxSlant = group.length / 2
  const rawSlant = first.averageStep - last.averageStep
  const slant = Math.max(-maxSlant, Math.min(maxSlant, rawSlant))
  let startStep = pos + Math.floor(slant / 2)
  let endStep = pos + Math.floor(-slant / 2)

  // "If the notes are too high or too low, make the beam go down to the middle" — abcjs's
  // own comment. A run far from the middle line gets a FLAT beam on it rather than one
  // riding the notes, which lengthens every stem in the group. Step 0 is its pitch 6.
  if ((up && pos < 0) || (!up && pos > 0)) {
    startStep = 0
    endStep = 0
  }

  if (PROBE)
    console.log(
      `BEAM up=${up} n=${group.length} avg=${(group.reduce((a, g) => a + g.averageStep, 0) / group.length + 6).toFixed(4)}` +
        ` min=${Math.min(...group.map((g) => g.farStep)) + 6} max=${Math.max(...group.map((g) => g.farStep)) + 6}` +
        ` barpos=${barpos} firstAvg=${first.averageStep + 6} lastAvg=${last.averageStep + 6}` +
        ` pos=${pos + 6} startY=${startStep + 6} endY=${endStep + 6}` +
        ` startX=${(first.x * 7.75).toFixed(3)} endX=${(last.x * 7.75).toFixed(3)}`,
    )
  const span = last.x - first.x
  const startY = stepToY(startStep)
  const endY = stepToY(endStep)

  const yAt = (x: number): number =>
    span === 0 ? startY : startY + ((x - first.x) / span) * (endY - startY)

  // Retarget each stem to the beam.
  //
  // A DOWN-stem stops half a beam-width short of the line the beam is drawn on, and an
  // up-stem does not: `createStems` does `if (!asc) bary -= (dy / 2) / spacing.STEP` with
  // `dy = -STEP` for a descending beam, which is `bary + 0.5` in pitch — abcjs calls it
  // "just a fudge factor so the down-pointing stems don't overlap" (`layout/beam.js:125`).
  // The BEAM itself is unmoved; only where the stem meets it changes.
  const stemEndOffset = up ? 0 : -0.5 * ENGRAVE.spacePerStep
  for (const stem of group) {
    const element = elements[stem.element]
    if (!element) continue
    const beamY = yAt(stem.x) + stemEndOffset
    const lines = element.lines.map((line) =>
      line.x1 === line.x2 && line.x1 === stem.x ? { ...line, y2: beamY, beamed: true } : line,
    )
    elements[stem.element] = { ...element, lines }
  }

  // Level 0 spans the whole group; deeper levels only where consecutive notes both carry
  // them, and a lone note at a level gets a stub pointing back toward its neighbour.
  //
  // Deeper beams stack INWARD, toward the noteheads: the outermost beam is the one the
  // stems actually end on, so an up-stem's second beam sits below its first.
  const beams: PlacedLine[] = []
  const maxLevel = Math.max(...group.map((stem) => stem.beams))
  const thickness = LINE_WEIGHTS.beam
  const inward = -direction
  const step = (thickness + LINE_WEIGHTS.beamSpacing) * inward

  for (let level = 0; level < maxLevel; level++) {
    // y here is the beam's CENTRE line; the emitted line carries its thickness.
    const offset = level * step + (inward * thickness) / 2
    let runStart: StemInfo | null = null
    let runEnd: StemInfo | null = null

    const flush = () => {
      if (runStart === null || runEnd === null) return
      let x1 = runStart.x
      let x2 = runEnd.x
      if (runStart === runEnd) {
        // A stub: point it back toward the previous note when there is one, so a lone
        // sixteenth in a run of eighths reads as belonging to what precedes it.
        const index = group.indexOf(runStart)
        const backward = index > 0
        x1 = backward ? runStart.x - ENGRAVE.beamStubLength : runStart.x
        x2 = backward ? runStart.x : runStart.x + ENGRAVE.beamStubLength
      }
      beams.push({
        x1,
        y1: yAt(x1) + offset,
        x2,
        y2: yAt(x2) + offset,
        thickness,
      })
      runStart = null
      runEnd = null
    }

    for (const stem of group) {
      if (stem.beams > level) {
        runStart ??= stem
        runEnd = stem
      } else {
        flush()
      }
    }
    flush()
  }

  return beams
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Lay out a score.
 *
 * Every voice, wrapped into justified systems, with voices that `%%score` groups with
 * `( … )` sharing a staff. (This once said "first voice only, one system, no line
 * breaking" — all three stopped being true and the comment did not.)
 */
/**
 * Which engine's look to reproduce.
 *
 * `standard` is core's own: abcm2ps's density, via abcMusicKit2's oracle-calibrated
 * constant. `abcjs` reproduces abcjs's, for the compat path where an existing page must
 * not visibly shift when abcts replaces abcjs.
 *
 * The two differ by ONE number, which is a genuinely surprising result and worth stating.
 * abcjs computes a note's spacing as `sqrt(duration * 8)` units of 30px
 * (`write/layout/voice-elements.js:23`, `engraver-controller.js:43`) — the same
 * SQUARE-ROOT law abcm2ps uses, just calibrated differently. In staff spaces abcjs is
 * `sqrt(d) * 10.949` against core's `sqrt(d) * 13.0`, so abcjs is about 16% tighter.
 * Predicted 42.43px for a quarter note; the goldens measure 42.43px.
 */
export type RenderProfile = 'standard' | 'abcjs'

const PROFILES: Readonly<Record<RenderProfile, { spacingScale: number }>> = {
  standard: { spacingScale: 3.25 },
  // sqrt(8) * 30 / 7.75 / 4 — abcjs's coefficient expressed against core's 1/16 reference.
  abcjs: { spacingScale: 2.7372 },
}

export interface LayoutOptions {
  /**
   * Which dialect's look to render. `abcjs-strict` reproduces abcjs's engraving density
   * so an existing page does not visibly shift; the other modes use core's own, which
   * follows abcm2ps.
   */
  readonly mode?: CompatibilityMode
  /** Override the mode's density directly. Rarely needed; `mode` is the usual control. */
  readonly profile?: RenderProfile
  /**
   * Width a system may reach before it wraps, in staff spaces. 90 is roughly a page
   * width at a typical staff size; a host with a known viewport should pass its own.
   */
  readonly systemWidth?: number
}

/** A measure laid out on its own, ready to be placed into whichever system it lands in. */
interface MeasureBlock {
  readonly elements: readonly LayoutElement[]
  readonly width: number
  /** Beam members, with element indices LOCAL to this block. */
  readonly beams: ReadonlyMap<number, readonly StemInfo[]>
  /**
   * Index of the barline that CLOSES this measure, if it has one.
   *
   * Recorded because it must end up at the column boundary rather than at this
   * measure's own content width: a sparse voice's barline would otherwise sit left of a
   * busy voice's, and the staves would stop lining up.
   */
  readonly closingBarIndex: number | null
  /** Note anchors for slur and tie resolution, positioned LOCAL to this block. */
  readonly anchors: readonly NoteAnchor[]
  /** A repeat ending opening at this measure, and whether this measure closes it. */
  readonly volta: string | null
  readonly closesVolta: boolean
  /**
   * Width of the music alone, excluding the closing barline and its gaps.
   *
   * A barline is a ROD, not a spring: it keeps its size and its distance from the
   * column edge however far the measure stretches. Only the music between barlines is
   * justified, so this is the span the stretch factor applies to.
   */
  readonly musicWidth: number
  /**
   * Per element: the ROD it advances x by and its duration — abcjs's `getMinWidth(child) +
   * child.minspacing` and `child.duration`. Musical time is NOT recorded here: the cursor
   * accumulates it as abcjs's `voice.durationindex` does, per voice and across the whole
   * LINE, so a bar of 1.0 in one voice and 1.5 in another simply drift apart.
   */
  readonly advances: readonly Advance[]
}

/**
 * One step of a voice's cursor.
 *
 * `rod` is the whole of `getMinWidth(child) + child.minspacing`; `gap` is the `minspacing`
 * part of it alone, kept apart because **a line's last element does not get its
 * `minspacing`** (`if (voice.i !== voice.children.length - 1) voice.minx += child.minspacing`,
 * `layout/voice-elements.js`). The spring is not stored — it is `sqrt(duration)`, and the
 * cursor recomputes it at whatever factor the solve has reached.
 */
interface Advance {
  readonly rod: number
  readonly gap: number
  readonly duration: number
  /** Ink reaching LEFT of the element's own x — abcjs's `-child.extraw`. */
  readonly left: number
  /** A barline gets no left clearance when it follows a part label or a tempo mark. */
  readonly kind: 'bar' | 'part' | 'other'
  /**
   * What a SOUNDING note needs for the voice-overlap rule, and null for everything else —
   * rests included, since abcjs tests `!child.abcelem.rest`.
   *
   * `low`/`high` are abcjs's `minpitch`/`maxpitch`, `width` its `heads[0].realWidth` and
   * `head` the glyph the share-a-notehead exception compares. See `lineAt`.
   */
  readonly note?: { low: number; high: number; width: number; head: GlyphName } | null
}

/**
 * How far a barline pushes the cursor: its own layout width plus the flat `minspacing`.
 *
 * Strict takes the width from abcjs's table, because that number is abcjs's and has
 * nothing to do with how thick the rules are drawn. The other modes measure the glyph
 * they actually draw, which is the honest answer once byte-parity is not the point.
 */
const barRod = (kind: Barline, el: LayoutElement, strict: boolean): number =>
  (strict ? (ENGRAVE.barLayoutWidth[kind] ?? el.width) : el.width) + ENGRAVE.prefixGap

/**
 * A BAR THAT STARTS AN ENDING GETS MORE `minspacing` — the label's width plus 10.
 *
 * `abselem.minspacing += textWidth + 10` with the comment "Give plenty of room for the
 * ending number" (`abstract-engraver.js:1034-1041`), measured in `repeatfont`. Probed on
 * `synth-timing-06`, whose `|1` bar reports `minsp = 28.5` against a plain bar's 10.
 *
 * It applies to whichever bar the ending opens on — the measure's own opening barline, or
 * the PREVIOUS measure's closing one when the number follows a `:|`.
 */
const endingRoom = (label: string | null): number =>
  label === null || label === ''
    ? 0
    : // MEASURED IN `repeatfont`, 13pt -> 17px — NOT in `voltaTextSize`, which is the size
      // the bracket's number is DRAWN at. abcjs measures the reserve and the ink with two
      // different fonts and only the first is this.
      textWidth(label, 17 / 7.75) + 10 / 7.75

/**
 * Lay out one measure at x = 0. Position within a system comes later, by translation,
 * which is what lets a measure be measured before anywhere is chosen to put it.
 */
function layoutMeasure(
  measure: Measure,
  clef: Clef,
  directions: ReadonlyMap<number, boolean>,
  spacingScale: number,
  /** `abcjs-strict` — passed through for microtonal accidentals. */
  strict = true,
  /** Voice convention on a SHARED staff; null lets pitch decide. */
  voiceStem: boolean | null = null,
  /**
   * The key in force as this measure BEGINS — needed only to cancel it. A key change
   * cannot be drawn from the new key alone: the naturals depend on what is being left.
   */
  keyInForce: KeySignature | null = null,
  /** Dynamics above the staff when the tune sings, below otherwise. */
  dynamicsAbove = true,
  /** The NEXT measure's volta label, if it opens one — see `endingRoom`. */
  voltaAfter: string | null = null,
  /** The meter as this measure BEGINS — a restated one prints nothing. */
  meterInForce: Meter | null = null,
  /**
   * A clef change that arrives AFTER this measure's barline and before the next SYSTEM.
   *
   * A `K:C clef=treble+8` written on its own line between two music lines is appended to
   * the voice stream that is still open — the previous line's — so abcjs draws it at the
   * END of that line as well as reprinting it in the next system's prefix. Two clefs, one
   * `K:`. Suppressing our inline draw was half of that rule and this is the other half:
   * `visual-selection-03`'s seven systems each sat 11.63px high without it, exactly the
   * octave marker's reserve.
   */
  trailingClef: Clef | null = null,
): MeasureBlock {
  const elements: LayoutElement[] = []
  /**
   * What each element ADVANCES x by, split into rod and spring — parallel to `elements`.
   *
   * Recorded rather than re-derived because an element's `width` is not what moves the
   * cursor: a barline advances by its gap and not its glyph, a part label advances by
   * nothing at all. Justification has to re-run this sum at a new spring factor, so the
   * split has to survive the measure.
   */
  const advances: Advance[] = []
  /** A zero-duration element: a bar, a key change, a part label. */
  const fixed = (rod: number, gap: number, kind: Advance['kind'] = 'other', left = 0): void => {
    advances.push({ rod, gap, duration: 0, left, kind })
  }
  const beams = new Map<number, StemInfo[]>()
  const anchors: NoteAnchor[] = []
  let x = 0

  // The label precedes the first event that comes AFTER the `P:` in the source, which is
  // the measure head in every ordinary tune — a `P:` sits on its own line, so everything
  // in the measure follows it. The two come apart only when a measure spans the `P:`,
  // which `frere-jacques` does: abcjs lexes its `+:` prose as music, so the prose and the
  // real first bar are one measure with `P:A` between them, and abcjs prints the label
  // after the prose. Anchoring on the offset rather than on the measure gets both.
  //
  // An event with no source range is treated as following the `P:`, so an unknown offset
  // keeps the head placement rather than pushing the label to the end of the bar.
  const partAfter = measure.partLabelSourceRange?.start ?? -1
  const partIndex =
    measure.partLabel === null
      ? -1
      : measure.events.findIndex(
          (e) => (e.sourceRange?.start ?? Number.POSITIVE_INFINITY) >= partAfter,
        )
  if (measure.partLabel !== null && partIndex === 0) {
    elements.push(layoutPart(x, measure.partLabel))
    fixed(0, 0, 'part')
  }

  // A mid-tune `K:` and the barline that opens the measure print in SOURCE ORDER.
  //
  // Which comes first is not a convention to pick, it is what the file says: `[K:Bb] |`
  // draws the signature then the bar, and `| [K:Bb]` draws the bar then the signature.
  // abcjs does exactly this — `S6-keys` X:602 writes `[K:Bb]       |` and abcjs emits
  // `[key]` BEFORE the bar — and strict has to match it. Anchoring on the two offsets
  // gets both spellings without a rule about either.
  //
  // The first version of this drew the key unconditionally after the barline, on the
  // stated grounds that "the new signature belongs to the music it governs". That reads
  // as sound engraving and is wrong here: it put the key on the far side of a barline
  // the author wrote it before, in all four of S6-keys' changes. The corpus fixture that
  // proves it is in tune 1, which the structural gate never looks at.
  const keyChangeAt = measure.keyChangeSourceRange?.start ?? Number.POSITIVE_INFINITY
  const openingBarAt = measure.openingBarlineSourceRange?.start ?? Number.POSITIVE_INFINITY
  const drawKeyChange = (): void => {
    if (measure.keyChange === null || keyInForce === null) return
    const change = layoutKeyChange(x, keyInForce, measure.keyChange, clef, strict)
    if (change === null) return
    elements.push(change)
    fixed(change.width + ENGRAVE.prefixGap, ENGRAVE.prefixGap)
    x += change.width + ENGRAVE.prefixGap
  }
  const drawOpeningBar = (): void => {
    // An opening `|:` or `[|` prints before the measure it belongs to, and is a SEPARATE
    // barline from the previous measure's closer.
    if (measure.openingBarline === null) return
    const bar = layoutBar(x, measure.openingBarline, strict)
    elements.push(bar)
    fixed(
      barRod(measure.openingBarline, bar, strict) + endingRoom(measure.volta),
      ENGRAVE.prefixGap + endingRoom(measure.volta),
      'bar',
      ENGRAVE.barClearance,
    )
    x += ENGRAVE.barGap
  }
  // A MID-TUNE CLEF PRINTS WHERE IT STANDS, before the key change and before the
  // measure's notes — abcjs builds it with `createClef` like any other, an ordinary
  // zero-duration `staff-extra clef` on the voice's child list.
  const drawClefChange = (): void => {
    // NOT WHEN THE MEASURE OPENS A SYSTEM — the prefix already reprints the clef in force
    // there, and abcjs prints exactly one. A `K:C clef=bass` written on its own line above
    // the music it governs is that case, and drawing both put `visual-selection-03` 24px
    // wider than abcjs on every line.
    if (measure.clefChange == null || measure.startsSystem) return
    const change = layoutClef(x, measure.clefChange, strict)
    if (change === null) return
    elements.push(change)
    fixed(change.width + ENGRAVE.prefixGap, ENGRAVE.prefixGap)
    x += change.width + ENGRAVE.prefixGap
  }
  // A MID-TUNE `[M:4/4]` or `M:` PRINTS WHERE IT STANDS. abcjs builds an ordinary
  // `staff-extra time-signature` for it, like the clef change beside it — and unlike the
  // clef, it is NOT reprinted at the head of later systems, so there is no double to
  // guard against: our prefix prints a meter only on system 0.
  const drawMeterChange = (): void => {
    if (measure.meterChange == null) return
    // A RESTATED METER PRINTS NOTHING, exactly as a restated key does.
    //
    // AND NEITHER DOES THE FIRST ONE A FREE-METER TUNE ACQUIRES. `frere-jacques`'s
    // `M:4/4` sits on line 14, after the `+:` prose that strict mode scans as MUSIC, so
    // it arrives as a mid-tune change over a null header meter. abcjs prints it on the
    // system where the prose ends; we have no line for that prose, so the change lands on
    // measure 1 and would put a time signature 17.6px into the middle of system 1.
    // Drawing nothing is the same answer our prefix already gave, and it keeps that
    // fixture where it was — see the note on `bodyStarted` in `scanMusic`.
    if (meterInForce === null) return
    if (
      meterInForce.numerator === measure.meterChange.numerator &&
      meterInForce.denominator === measure.meterChange.denominator &&
      meterInForce.symbol === measure.meterChange.symbol
    ) {
      return
    }
    const meter = layoutMeter(x, measure.meterChange)
    elements.push(meter)
    fixed(meter.width + ENGRAVE.prefixGap, ENGRAVE.prefixGap)
    x += meter.width + ENGRAVE.prefixGap
  }
  // A `Q:` AFTER THE FIRST prints where it stands, on its OWN voice's staff — an ordinary
  // element in that voice's stream. Zero width, like the tune's own mark.
  const drawTempoChange = (): void => {
    if (measure.tempoChange == null) return
    const tempo = layoutTempo(x, measure.tempoChange, strict)
    if (tempo === null) return
    elements.push(tempo)
    fixed(0, 0)
  }
  if (keyChangeAt < openingBarAt) {
    drawTempoChange()
    drawClefChange()
    drawKeyChange()
    drawMeterChange()
    drawOpeningBar()
  } else {
    drawOpeningBar()
    drawTempoChange()
    drawClefChange()
    drawKeyChange()
    drawMeterChange()
  }

  for (const [eventIndex, event] of measure.events.entries()) {
    if (measure.partLabel !== null && eventIndex === partIndex && partIndex > 0) {
      elements.push(layoutPart(x, measure.partLabel))
      fixed(0, 0, 'part')
    }
    const group = event.type === 'rest' ? null : event.beamGroup
    const stemOut: { value: Omit<StemInfo, 'element'> | null } | null =
      group === null ? null : { value: null }
    const el = layoutEvent(
      event,
      x,
      clef,
      spacingScale,
      group === null ? null : (directions.get(group) ?? null),
      stemOut,
      strict,
      voiceStem,
      dynamicsAbove,
    )
    if (el === null) continue
    if (group !== null && stemOut?.value) {
      const members = beams.get(group) ?? []
      members.push({ ...stemOut.value, element: elements.length })
      beams.set(group, members)
    }
    // Anchor the curve endpoints on the NOTEHEAD, not the element: an accidental shifts
    // the head right, and a slur springing from the accidental would start in mid-air.
    const heads = el.glyphs.filter((g) => g.name.startsWith('notehead'))
    if (heads.length > 0) {
      const width = GLYPHS[heads[0]?.name ?? 'noteheadBlack'].width
      const first =
        event.type === 'note' ? event.pitch : event.type === 'chord' ? event.pitches[0] : undefined
      anchors.push({
        system: 0, // filled in when the block is placed into a system
        element: elements.length,
        left: Math.min(...heads.map((h) => h.x)),
        right: Math.max(...heads.map((h) => h.x)) + width,
        top: Math.min(...heads.map((h) => h.y)) - 0.5,
        bottom: Math.max(...heads.map((h) => h.y)) + 0.5,
        pitchY:
          first === undefined
            ? (Math.min(...heads.map((h) => h.y)) + Math.max(...heads.map((h) => h.y))) / 2
            : stepToY(pitchToStep(first, clef)),
        stemUp: el.lines.some((l) => l.x1 === l.x2 && l.y2 < l.y1),
        event,
      })
    } else if (event.type === 'rest') {
      // Rests get an anchor too — not for curves, which skip them, but because a tuplet
      // can contain one (`(3cz` and `(3z` are both in the corpus) and its bracket has to
      // span the rest like any other member.
      const glyph = el.glyphs[0]
      const ink = glyph === undefined ? undefined : GLYPHS[glyph.name]
      anchors.push({
        system: 0,
        element: elements.length,
        left: el.x,
        right: el.x + (ink?.width ?? el.width),
        top: (glyph?.y ?? 0) + (ink?.y ?? 0),
        bottom: (glyph?.y ?? 0) + (ink?.y ?? 0) + (ink?.height ?? 0),
        // A rest is never a curve anchor; only a tuplet reads this one.
        pitchY: (glyph?.y ?? 0) + (ink?.y ?? 0) + (ink?.height ?? 0) / 2,
        stemUp: false,
        event,
      })
    }
    elements.push(el)
    // A ZERO-DURATION NOTE SPACES AS A QUARTER. abcjs rewrites the duration before
    // anything reads it — `if (duration === 0) { zeroDuration = true; duration = 0.25;
    // nostem = true; }` (`abstract-engraver.js:791`) — so the head, the stem and the
    // ADVANCE all come from 0.25. We had the head and the stem and left the advance at
    // zero, which put every note after a `C0` on top of it.
    const duration = ratToNumber(event.duration) || 0.25
    // The voice-overlap rule reads the note's pitch range and its FIRST head. A rest is
    // excluded at the source, as abcjs excludes it (`!child.abcelem.rest`).
    const firstHead = el.type === 'note' ? el.glyphs.find((g) => g.role === 'notehead') : undefined
    advances.push({
      rod: el.rod ?? el.width,
      gap: ENGRAVE.noteRodGap,
      duration,
      left: el.left ?? 0,
      kind: 'other',
      note:
        firstHead === undefined || el.staffSteps.length === 0
          ? null
          : {
              low: Math.min(...el.staffSteps),
              high: Math.max(...el.staffSteps),
              width: glyphsFor(strict).width(firstHead.name),
              head: firstHead.name,
            },
    })
    x += el.width
  }

  // Every event preceded the `P:` — the label belongs after them, before the barline.
  if (measure.partLabel !== null && partIndex === -1) {
    elements.push(layoutPart(x, measure.partLabel))
    fixed(0, 0, 'part')
  }

  let closingBarIndex: number | null = null
  const musicWidth = x
  if (measure.closingBarline !== null) {
    closingBarIndex = elements.length
    const plain = layoutBar(x, measure.closingBarline, strict)
    // A DECORATION ON THE BAR starts its stack at a FIXED pitch 12, not at any note's
    // extent — abcjs passes the literal 12 (`abstract-engraver.js:1002`). Pitch 12 is our
    // step 6, and `decorationMinTop` clamps it there anyway.
    const barDecorations = measure.closingBarlineDecorations ?? []
    const marks =
      barDecorations.length === 0
        ? null
        : decorationGlyphs(
            barDecorations,
            x,
            plain.width,
            6,
            6,
            false,
            6,
            2,
            strict,
            0,
            dynamicsAbove,
          )
    const withMarks =
      marks === null
        ? plain
        : {
            ...plain,
            glyphs: [...plain.glyphs, ...marks.glyphs],
            texts: [...plain.texts, ...marks.texts],
          }
    // THE BAR NUMBER, and it is geometry before it is text.
    //
    // `addMeasureNumber` (`abstract-engraver.js:945-953`) measures the number in
    // `measurefont`, puts it at pitch `vert + height / STEP` with `vert` 11 on a barline,
    // and adds it with `addFixed` — so it goes through `_addChild`'s `pushTop` and enters
    // the staff's ink. On a plain treble tune the clef's 13.72 loses to its 16.43, and
    // that difference is the 10.5px every `%%barnumbers` fixture was out by.
    //
    // `vert` is 13.5 instead when the number is WIDER than 10px AND the element is the
    // treble clef — a clef-only case, so a barline always takes the 11.
    const bar =
      measure.closingBarNumber === undefined
        ? withMarks
        : {
            ...withMarks,
            texts: [...withMarks.texts, barNumberText(measure.closingBarNumber, x)],
          }
    elements.push(bar)
    fixed(
      barRod(measure.closingBarline, bar, strict) + endingRoom(voltaAfter),
      ENGRAVE.prefixGap + endingRoom(voltaAfter),
      'bar',
      ENGRAVE.barClearance,
    )
    x += ENGRAVE.barGap
  }

  // …AND THE NEXT SYSTEM'S CLEF CHANGE, drawn after that barline. See `trailingClef`.
  if (trailingClef !== null) {
    const trailing = layoutClef(x, trailingClef, strict)
    if (trailing !== null) {
      elements.push(trailing)
      fixed(trailing.width + ENGRAVE.prefixGap, ENGRAVE.prefixGap)
      x += trailing.width + ENGRAVE.prefixGap
    }
  }

  // A repeat barline or a final ends the ending it sits in; a plain one does not.
  const closesVolta =
    measure.closingBarline === 'repeatEnd' ||
    measure.closingBarline === 'repeatBoth' ||
    measure.closingBarline === 'final' ||
    measure.closingBarline === 'double'

  return {
    elements,
    advances,
    width: x,
    beams,
    anchors,
    closingBarIndex,
    musicWidth,
    volta: measure.volta,
    closesVolta,
  }
}

/** Shift a laid-out measure sideways into its place in a system. */
const shiftElement = (el: LayoutElement, dx: number): LayoutElement => ({
  ...el,
  x: el.x + dx,
  glyphs: el.glyphs.map((g) => ({ ...g, x: g.x + dx })),
  lines: el.lines.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx })),
  texts: el.texts.map((t) => ({ ...t, x: t.x + dx })),
})

/**
 * The DRAWN half of the voice-overlap rule: everything but the accidentals moves right.
 *
 * abcjs walks the element's relative children and adds `firstChildNoteWidth` to each
 * `dx` whose name does not contain "accidental" (`voice-elements.js:56-62`), leaving the
 * element's own x — and therefore the cursor, the `er` and every other voice — alone.
 * So the head is displaced INSIDE its element, which is the whole point: two voices a
 * second apart stay at the same musical time and stop sharing a column.
 */
const displaceHeads = (el: LayoutElement, dx: number): LayoutElement =>
  dx === 0
    ? el
    : {
        ...el,
        glyphs: el.glyphs.map((g) => (g.name.startsWith('accidental') ? g : { ...g, x: g.x + dx })),
        lines: el.lines.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx })),
        texts: el.texts.map((t) => ({ ...t, x: t.x + dx })),
      }

/**
 * The staff's own lines — five, or however many `V:… stafflines=` asked for.
 *
 * Source: `write/draw/staff.js`. Lines are counted UP from the bottom line, `pitch =
 * (i + 1) * 2` for `i` in `[0, n)`, so a three-line staff keeps the bottom line where it
 * was and drops the top two. ONE line is special-cased to the B line — the middle — rather
 * than the bottom, which is the percussion/rhythm convention; and zero draws no staff at
 * all, which is how a chord chart or a lyrics-only part is written.
 *
 * The notes do not move: `stafflines=` changes what is DRAWN, not the coordinate system,
 * so a `stafflines=1` treble staff still puts every pitch where a treble staff would and
 * simply hides four of its lines. Ledger lines follow from the same unchanged pitches, as
 * they do in abcjs.
 */
const staffLinesFor = (width: number, count: number): PlacedLine[] => {
  const rule = (step: number): PlacedLine => ({
    x1: 0,
    y1: stepToY(step),
    x2: width,
    y2: stepToY(step),
    thickness: LINE_WEIGHTS.staffLine,
  })
  if (count === DEFAULT_STAFF_LINES) return ENGRAVE.staffLineSteps.map(rule)
  if (count <= 0) return []
  if (count === 1) return [rule(0)]
  // Bottom line is step -4 (pitch 2) and each line up is two steps.
  return Array.from({ length: count }, (_, i) => rule(-4 + 2 * i))
}

/** Everything about one voice that the packer needs. */
interface VoicePlan {
  readonly clef: Clef
  readonly blocks: readonly MeasureBlock[]
  /** The measures the blocks came from — read for their source-line break points. */
  readonly measures: readonly Measure[]
  /** `V:… name=` / `subname=`, or null — the label printed left of the staff. */
  readonly name: string | null
  readonly subname: string | null
  /**
   * The staff prefix, whose width differs per voice because clefs and keys differ.
   * `indent` is the voice-name reservation, in staff spaces — the prefix (and so all the
   * music after it) starts that far right of the page margin.
   */
  readonly prefix: (
    withMeter: boolean,
    topStaff: boolean,
    indent: number,
    /** Index of the system's first measure — the prefix prints the clef in force THERE. */
    from?: number,
  ) => { elements: LayoutElement[]; advances: Advance[] }
  /** The clef in force at measure `i`, after every `Measure.clefChange` before it. */
  readonly clefAt: (i: number) => Clef
}

/**
 * Lay out a score.
 *
 * Every voice becomes a staff, stacked within each system. Measures are aligned across
 * voices by column, so bar 3 begins at the same x on every staff — without that the
 * staves drift apart and the score stops being readable as one thing.
 */
/**
 * `&` OVERLAY LAYERS BECOME VOICES ON THE SAME STAFF, which is what they are.
 *
 * `G8 & C4 D4` is one voice carrying two simultaneous lines, and the parser reads it that
 * way — `measure.overlays` is a parallel stream per layer. Nothing downstream looked at
 * it, so every layer but the first went undrawn: four fixtures in abcjs's own test suite
 * lose most of their notes, and nothing in the 41-fixture corpus uses `&` at all, which
 * is why it went unnoticed.
 *
 * Expanding here rather than in the parser keeps the MODEL honest — an overlay is a
 * property of the measure it was written in, and flattening it away would lose that — and
 * lets the renderer reuse everything it already does for two voices sharing a staff:
 * stem-direction convention, the shared prefix, the union of reserves.
 *
 * A layer inherits its parent's clef and stems but not its NAME: `V:1 name="Melody"` puts
 * one label beside the staff, not one per layer. It keeps the parent's barlines and
 * volta, exactly as a second `V:` on a shared staff does — they draw at the same x.
 */
function expandOverlays(score: Score): Score {
  const layersOf = (voice: Score['voices'][number]): number =>
    Math.max(0, ...voice.measures.map((m) => m.overlays.length))
  if (score.voices.every((v) => layersOf(v) === 0)) return score

  const voices: Score['voices'][number][] = []
  /** Parent voice id → the ids of its layers, in order. */
  const layerIds = new Map<string, string[]>()
  for (const voice of score.voices) {
    voices.push({ ...voice, measures: voice.measures.map((m) => ({ ...m, overlays: [] })) })
    const ids: string[] = []
    for (let layer = 0; layer < layersOf(voice); layer++) {
      // `$` cannot appear in an ABC voice id, so a synthetic id can never collide with a
      // declared one.
      const id = `${voice.id}$${layer + 1}`
      ids.push(id)
      voices.push({
        ...voice,
        id,
        name: null,
        subname: null,
        measures: voice.measures.map((m) => ({
          ...m,
          events: m.overlays[layer] ?? [],
          overlays: [],
        })),
      })
    }
    if (ids.length > 0) layerIds.set(voice.id, ids)
  }

  const withLayers = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => [id, ...(layerIds.get(id) ?? [])])
  const staves =
    score.staves.length > 0
      ? score.staves.map((g) => ({ ...g, voiceIds: withLayers(g.voiceIds) }))
      : // No `%%score`, so every voice had a staff of its own — and its layers join it.
        score.voices.map((v) => ({
          voiceIds: withLayers([v.id]),
          brace: null,
          bracket: null,
          connectBarLines: null,
        }))
  return { ...score, voices, staves }
}

export function layout(input: Score, options: LayoutOptions = {}): Layout {
  const score = expandOverlays(input)
  // `%%staffwidth` names the same quantity as the host's `staffwidth` param; the
  // DIRECTIVE wins, because it is the tune saying how wide it wants to be.
  const systemWidth =
    score.staffWidth !== null
      ? score.staffWidth / 7.75 + 2 * ENGRAVE.marginX
      : (options.systemWidth ?? ENGRAVE.systemWidth)
  // The mode picks the look; `profile` can still override it explicitly.
  const profile: RenderProfile =
    options.profile ?? (isStrict(options.mode ?? defaultMode) ? 'abcjs' : 'standard')
  // Read from the MODE, not from `profile`: profile is a density override and a caller
  // may set it either way, but whether a melisma prints abcjs's literal `_` or an
  // extender is a question about which engine's behaviour is being reproduced.
  const strict = isStrict(options.mode ?? defaultMode)
  STRICT_TEXT_METRICS = strict
  LINE_WEIGHTS = lineWeightsFor(strict)
  JAZZ_CHORDS = score.jazzChords
  SCORE_FONTS = score.fonts
  PERC_MAP = score.percMap
  const { spacingScale } = PROFILES[profile]
  const voices = score.voices.length > 0 ? score.voices : [undefined]

  // `%%staffsep` / `%%sysstaffsep` override the engine defaults when the tune sets them —
  // ragtime-nightingale asks for a wider system gap (staffsep 90 -> 120px) and a wider
  // intra-staff gap (sysstaffsep 50 -> 66.67px), and abcjs honours both. The model carries
  // them already in pixels; here they become staff spaces like the rest of `ENGRAVE`.
  const interSystemSep = score.staffSep !== null ? score.staffSep / 7.75 : ENGRAVE.systemSeparation
  /** `%%musicspace` — the gap before the FIRST staff group only, in staff spaces. */
  const musicSpace = score.musicSpace !== null ? score.musicSpace / 7.75 : ENGRAVE.musicSpace
  const intraStaffSep =
    score.sysStaffSep !== null ? score.sysStaffSep / 7.75 : ENGRAVE.staffSeparation

  /**
   * Which VOICES share each staff — the whole point of `%%score`'s `( … )`.
   *
   * Indices into `voices`, grouped by staff, top to bottom. Without a directive every
   * voice takes a staff of its own, which is what abcts did unconditionally until
   * 2026-07-20: five staves for a piano rag abcjs renders on two.
   *
   * Computed once for the tune, not per system, because staff membership is a property of
   * the score. It has to outlive the per-system build, since slurs and hairpins resolve
   * after packing and are indexed BY VOICE — so the merge needs to know, at that point,
   * which voices' curves belong to which staff.
   */
  const voicesOfStaff: number[][] =
    score.staves.length > 0
      ? score.staves.map((group) =>
          group.voiceIds.map((id) => voices.findIndex((v) => v?.id === id)).filter((i) => i >= 0),
        )
      : voices.map((_, i) => [i])

  /**
   * A voice's index on its staff, or −1 when it has that staff to itself.
   *
   * abcjs's `voice.voicetotal < 2 ? -1 : voice.voicenumber` (`abstract-engraver.js:235`),
   * which is what decides a slur's side on a shared staff — see `curveIsAbove`.
   */
  const voicePosOf = (v: number): number => {
    const members = voicesOfStaff.find((m) => m.includes(v))
    return members === undefined || members.length < 2 ? -1 : members.indexOf(v)
  }

  /**
   * Stem direction by a voice's POSITION on its staff, not by its pitch.
   *
   * Two voices sharing a staff are read apart by their stems: the upper voice takes them
   * up, the lower down, whatever the notes do. Without this, `%%score (1 2)` on two
   * middle-register voices gives every stem the same direction — both down, since both
   * sit above the middle line — and the parts become unreadable exactly where sharing was
   * supposed to help. abcjs does the same: for `(1 2)` on identical notes, voice 0's stem
   * runs up and voice 1's down.
   *
   * `null` on a staff of one, where pitch is the right answer and forcing would be wrong.
   *
   * AND `null` ON THE UPPER VOICE OF A STAFF ITS LOWER VOICE OPENED FIRST, which is not a
   * refinement but abcjs's actual rule, and it is worth stating because the shape is odd.
   * `createVoice` (`parse/tune-builder.js:961-989`) forces `down` on every voice after the
   * first on a staff, unconditionally — but it only back-fills `up` onto the first voice
   * `if (thisStaff.voices[0] !== undefined)`, and `voices[0]` exists only once that voice
   * has opened a line. So a tune whose body writes the LOWER voice first leaves the upper
   * one unforced, following its pitch like a solo voice.
   *
   * `ave-verum-corpus` is that tune — its body runs MD1, MD2, MS1, MS2, B, T, A, S, so the
   * second voice of each vocal staff opens before the first — and abcjs's own element dump
   * confirms every consequence: Soprano stemmed up (by pitch), Alto down (forced), Tenore
   * DOWN (by pitch, unforced), Basso down (forced). Forcing Tenore up put our staff's ink
   * top 23.5px above abcjs's, and that was the whole of the fixture's vertical error.
   *
   * Body order comes from the first measure's source offset, which the model already
   * carries — no new field, and it is the same order `createVoice` walks in.
   *
   * ponytail: first voice up, everything below it down. Three voices on a staff — the
   * corpus has `( 1 2 3 )` — conventionally wants the middle one placed by context, which
   * needs collision detection this engine does not have yet. abcjs does the same thing
   * here, forcing every voice after the first down, so strict has nothing to answer for.
   */
  const opensAt = (index: number): number =>
    voices[index]?.measures?.[0]?.sourceRange?.start ?? Number.POSITIVE_INFINITY
  const stemForVoice = (index: number): boolean | null => {
    // `V:… stems=` WINS over the shared-staff convention — abcjs takes
    // `if (params.stem) … else if (voiceNum > 0)` (`parse/tune-builder.js:971-986`), so a
    // declared direction also suppresses the `up` back-filled onto the staff's first voice.
    // ponytail: that suppression is not modelled separately. It only shows when SOME voices
    // on a staff declare and others do not, which no corpus tune does — ragtime declares on
    // all three of its bass voices and none of its treble ones.
    const declared = voices[index]?.stemDirection
    if (declared != null) return declared === 'up'
    const staff = voicesOfStaff.find((members) => members.includes(index))
    if (staff === undefined || staff.length < 2) return null
    if (staff.indexOf(index) !== 0) return false
    return staff.every((member) => member === index || opensAt(index) < opensAt(member))
      ? true
      : null
  }

  // Does the tune SING? Dynamics stack above the staff if so, below if not — abcjs's
  // `hasVocals` (`abstract-engraver.js:110`). Any note in any voice carrying a syllable or
  // a held-melisma marker counts; a wordless `*` (`lyric: null, lyricMelisma: false`) does
  // not, matching abcjs's test on `el.lyric`.
  //
  // IT IS PER SYSTEM AND MONOTONIC. `createABCLine` calls `containsLyrics(staffs)` at the
  // head of every line, and that function only ever sets the flag TRUE — `reset()` clears
  // it once per TUNE, not once per line. So a tune whose lyrics arrive on its second
  // system engraves the FIRST with dynamics BELOW and everything after with them above.
  //
  // Nothing in the 41 fixtures does that and the note here used to say it never varies.
  // `visual-selection-01` does: its `w:` follows the SECOND of two `[V: PianoRightHand]`
  // lines, and putting system 1's dynamics above cost 27.11px — seven pitch, the lane —
  // between its two staves.
  const sings = (measure: Measure): boolean =>
    measure.events.some(
      (event) =>
        (event.type === 'note' || event.type === 'chord') &&
        ((event.lyric !== null && event.lyric !== '') ||
          event.extraVerses.some((v) => v !== null && v !== '')),
    )
  /** Measure indices that open a system, taken from the measures themselves. */
  const systemOpensAt = new Set<number>([0])
  for (const voice of voices) {
    ;(voice?.measures ?? []).forEach((m, i) => {
      if (m.startsSystem) systemOpensAt.add(i)
    })
  }
  /** The first measure index of the system that first sings; `Infinity` if none does. */
  const firstSingingSystemAt = ((): number => {
    let openedAt = 0
    let answer = Number.POSITIVE_INFINITY
    const columns = Math.max(0, ...voices.map((v) => v?.measures.length ?? 0))
    for (let i = 0; i < columns; i++) {
      if (systemOpensAt.has(i)) openedAt = i
      if (
        voices.some((v) => {
          const m = v?.measures[i]
          return m !== undefined && sings(m)
        })
      ) {
        answer = openedAt
        break
      }
    }
    return answer
  })()
  const hasVocalsAt = (measureIndex: number): boolean => measureIndex >= firstSingingSystemAt
  /** The tune sings SOMEWHERE — for the passes that are not per measure. */
  const hasVocals = Number.isFinite(firstSingingSystemAt)

  const plans: VoicePlan[] = voices.map((voice, voiceIndex) => {
    // A voice's own `clef=` wins over the tune's `K:` clef; treble is the fallback.
    // A bare `V:… stafflines=` rides on the VOICE, not its clef, so that it can apply to
    // an inherited clef without replacing it. Resolve it here, where the clef is picked.
    const resolved = voice?.clef ?? score.clef
    const clef =
      voice?.staffLineOverride == null
        ? resolved
        : { ...resolved, staffLines: voice.staffLineOverride }
    const directions = beamDirections(voice, clef, stemForVoice(voiceIndex))
    // The key in force, accumulated forward. `Measure.keyChange` is a DELTA — the model
    // deliberately keeps `score.key` as the header key and leaves accumulation to the
    // consumer — so the renderer is the consumer that has to do it.
    let keyInForce = score.key
    // The clef in force, accumulated the same way — `Measure.clefChange` is a DELTA. It
    // has to be carried into the PREFIX too: abcjs reprints the current clef at the head
    // of every system, not the one the voice was declared with.
    let clefInForce = clef
    let meterInForce = score.meter
    const clefAtMeasure: Clef[] = []
    const blocks = (voice?.measures ?? []).map((measure, measureIndex) => {
      // A mid-tune clef prints at the START of its measure and governs it — abcjs's
      // `staff-extra clef` is emitted before the measure's notes, and everything after it
      // is read against the new clef.
      if (measure.clefChange != null) clefInForce = measure.clefChange
      clefAtMeasure.push(clefInForce)
      const block = layoutMeasure(
        measure,
        clefInForce,
        directions,
        spacingScale,
        strict,
        stemForVoice(voiceIndex),
        keyInForce,
        hasVocalsAt(measureIndex),
        (voice?.measures ?? [])[measureIndex + 1]?.volta ?? null,
        meterInForce,
        (() => {
          const next = (voice?.measures ?? [])[measureIndex + 1]
          return next?.startsSystem === true ? (next.clefChange ?? null) : null
        })(),
      )
      if (measure.keyChange !== null) keyInForce = measure.keyChange
      if (measure.meterChange != null) meterInForce = measure.meterChange
      return block
    })

    /**
     * The clef and key reprinted at the head of every system, which is what makes a
     * wrapped line readable. The meter is NOT reprinted — it appears once, at the start,
     * or again only where it changes.
     */
    const prefix = (
      withMeter: boolean,
      topStaff: boolean,
      indent: number,
      /** The first measure of the system, so the prefix prints the clef in force there. */
      from = 0,
    ): { elements: LayoutElement[]; advances: Advance[] } => {
      const clef = clefAtMeasure[from] ?? clefInForce
      const elements: LayoutElement[] = []
      const advances: Advance[] = []
      // The voice-name reservation pushes the whole prefix — and the music after it —
      // right, exactly as abcjs's `getLeftEdgeOfStaff` moves `staffGroup.startx`.
      //
      // These are abcjs's `staff-extra` children: ordinary zero-duration elements on the
      // voice's own child list, laid out through the SAME shared cursor as the music. So a
      // treble clef against a bass clef does not give the two staves different prefix
      // widths — the cursor takes the wider ONE ELEMENT AT A TIME and both time signatures
      // land on the same x. Summing each voice's prefix and taking the widest total is a
      // different number whenever the two voices' prefixes differ in shape.
      let x = ENGRAVE.marginX + indent
      const push = (el: LayoutElement): void => {
        elements.push(el)
        advances.push({
          rod: el.width + ENGRAVE.prefixGap,
          gap: ENGRAVE.prefixGap,
          duration: 0,
          left: 0,
          kind: 'other',
        })
        x += el.width + ENGRAVE.prefixGap
      }

      const clefElement = layoutClef(x, clef, strict)
      if (clefElement !== null) push(clefElement)
      const keySig = layoutKeySignature(x, score.key, clef, strict)
      if (keySig !== null) push(keySig)
      if (withMeter && score.meter !== null) {
        push(layoutMeter(x, score.meter))
      }
      // The tempo mark belongs to the TUNE — not to each system, and not to each voice.
      // It prints once: on the first system, above the top staff. Every staff still gets
      // its own clef, key and meter, which are per-staff by definition.
      // Zero width, so it does not advance the cursor.
      if (withMeter && topStaff && score.tempo !== null) {
        const tempo = layoutTempo(x, score.tempo, strict)
        if (tempo !== null) {
          elements.push(tempo)
          advances.push({ rod: 0, gap: 0, duration: 0, left: 0, kind: 'other' })
        }
      }
      return { elements, advances }
    }

    return {
      clef,
      blocks,
      measures: voice?.measures ?? [],
      clefAt: (i: number): Clef => clefAtMeasure[i] ?? clef,
      name: voice?.name ?? null,
      subname: voice?.subname ?? null,
      prefix,
    }
  })

  /**
   * The voice-name reservation for a system, in staff spaces — abcjs's `getLeftEdgeOfStaff`.
   *
   * The widest label across the staves (the `name` on the first system, the `subname` on
   * later ones) plus, when there is any label at all, "the width of an A" of trailing
   * space. Zero when no voice on this system is labelled, so an unlabelled tune keeps its
   * old left edge to the pixel. Braces and brackets can widen it too, but no fixture pairs
   * a group connector with a name — ponytail: add their width here when one does.
   */
  /**
   * A voice label's width in STAFF SPACES, measured the way abcjs measures it.
   *
   * `getTextSize.calc(header, 'voicefont')` — so the golden's `calcWidth` at whatever size
   * `%%voicefont` set, plus `padding * 4` for a BOXED font. The default resolves to Times
   * New Roman Bold 17px, which is the table the old dedicated metrics file carried; a
   * `%%voicefont Verdana 17 box` resolves to the 23px bracket, which asks for a key that
   * does not exist and falls through to `repeatfont` — and then adds 9.2px of box, twice
   * over once the trailing "A" is measured the same way. That was 18.40px of left edge.
   */
  const voiceNameWidth = (text: string): number => {
    const size = fontSizeOf('voicefont')
    const bold = score.fonts.voicefont === undefined || score.fonts.voicefont.bold
    return (
      textWidth(text, size, bold ? 'serifBold' : 'serif') +
      (score.fonts.voicefont?.box === true ? size * ENGRAVE.fontBoxPadding * 4 : 0)
    )
  }

  const indentFor = (systemIndex: number): number => {
    const label = (plan: VoicePlan): string | null => (systemIndex === 0 ? plan.name : plan.subname)
    const widest = Math.max(
      0,
      ...plans.map((plan) => {
        const text = label(plan)
        return text ? voiceNameWidth(text) : 0
      }),
    )
    // A BRACE OR BRACKET MOVES THE LEFT EDGE, name or no name.
    //
    // `getLeftEdgeOfStaff` ends `return x + ofs`, where `ofs` is the widest connector's
    // `getWidth()` — a flat 10 for both, with abcjs's own note that its drawing does not
    // vary. The "width of an A" of trailing space is NOT part of it: that is added only
    // when there is a header to clear, so an unnamed grand staff takes exactly the 10.
    // Probed on `ragtime-mini`, which has `%%score { ( 4 5 ) | ( 1 2 3 ) }` and no names:
    // `leftEdge = 25.000` against a bare tune's 15.
    const connector = score.staves.some((group) => group.brace !== null || group.bracket !== null)
      ? ENGRAVE.connectorIndent
      : 0
    if (widest === 0) return connector
    // …plus "the width of an A" in the SAME font, box padding and all — abcjs measures it
    // with `getTextSize.calc("A", 'voicefont')` rather than taking a constant
    // (`get-left-edge-of-staff.js:19-20`).
    return connector + widest + voiceNameWidth('A')
  }

  /** How many measures the longest voice has — the span indices run over these. */
  const columns = Math.max(0, ...plans.map((plan) => plan.blocks.length))

  /**
   * Systems follow the SOURCE, not a width packer.
   *
   * ABC breaks staff lines where the file breaks them — one line of music is one printed
   * system — and abcjs has no line-breaking pass at all. It never re-wraps; it fits each
   * source line to the page, compressing a long one rather than splitting it. Packing by
   * width instead was the largest remaining structural divergence: we made 60 systems of
   * `ragtime-nightingale` where abcjs makes 46, split `twinkle`'s single source line in
   * two, and merged two of `multi-voice-lyrics-two-voices`'s into one.
   *
   * `Measure.startsSystem` carries the author's break points from the parser. A measure
   * continued across a line break belongs to the line it STARTED on, which is what abcjs
   * lays out too.
   *
   * ponytail: NO width fallback. A source line wider than the page compresses to fit and
   * keeps compressing, exactly as abcjs does — there is no width at which it wraps. A
   * host wanting reflow needs a mode that re-breaks, and none is asked for; adding one
   * speculatively would put back the packer this replaces.
   */
  const breaksAt = new Set<number>()
  for (const plan of plans) {
    plan.measures.forEach((measure, index) => {
      if (measure.startsSystem) breaksAt.add(index)
    })
  }
  const spans: { start: number; end: number }[] = []
  let start = 0
  for (let i = 1; i < columns; i++) {
    if (!breaksAt.has(i)) continue
    spans.push({ start, end: i })
    start = i
  }
  if (columns > 0) spans.push({ start, end: columns })
  if (spans.length === 0) spans.push({ start: 0, end: 0 })

  // Anchors for every note of every voice, tagged with the system it landed in. A slur
  // or tie can span a break, so pairing them needs the whole tune, not one system.
  const voiceAnchors: NoteAnchor[][] = plans.map(() => [])
  /**
   * Where the MUSIC starts on each system, past the clef and key — the left clamp for a
   * slur continued from the system above. With one cursor per line there is no shared
   * prefix width to read this off, so each system records where its first music element
   * actually landed.
   */
  const musicLeft: number[] = []
  /**
   * THE PAGE TARGET GROWS TO THE WIDEST LINE SO FAR, and later lines justify to the new
   * width rather than to the page.
   *
   * abcjs's `layout()`: `if (Math.round(thisWidth) > Math.round(maxWidth)) maxWidth =
   * thisWidth`, where `thisWidth` is what `setXSpacing` returns for the line just solved
   * and `maxWidth` is what the next line is told to fill. A line that cannot compress to
   * the page — its rods already exceed it — therefore widens the page for everything
   * after it. Probed on `happy-birthday`: line 1 stops at 686.771 against a 685 target
   * (inside abcjs's own 2px tolerance) and line 2 is then justified to 686.771, not 685.
   *
   * `expandToWidest` would re-run the earlier lines at the final width; abcjs leaves it
   * off by default and so do we, which is why this is a forward-only ratchet.
   */
  let pageWidth = systemWidth - 2 * ENGRAVE.marginX

  const systems: LayoutSystem[] = spans.map((span, systemIndex) => {
    const withMeter = systemIndex === 0
    const indent = indentFor(systemIndex)

    /**
     * ONE CURSOR ACROSS EVERY VOICE, FOR THE WHOLE LINE — abcjs's `layoutStaffGroup`.
     *
     * There are no columns here and there is no per-measure reconciliation. abcjs walks a
     * single cursor along one timeline per LINE: each pass takes the voices whose next
     * element sits at the smallest pending musical time, moves the cursor to the furthest
     * right any of them wants to be, places them all THERE, and tells every voice still
     * waiting that some of its time has been spent without it.
     *
     * Two consequences the per-column model could not have, and both are load-bearing:
     *
     * 1. **Barlines are not aligned.** They are ordinary zero-duration elements on the
     *    timeline. `voice-middle-after-clef` writes a bar of 1.0 against a bar of 1.5 and
     *    abcjs simply lets the two voices' bars fall where their own time says — measure 2
     *    starts at 207.1 on one staff and 278.1 on the other. A column model force-aligns
     *    them because a column IS a measure, and that fixture sat at exactly 79.0px of
     *    spread through every change of the arc.
     * 2. **A FINISHED voice still pushes the cursor.** `getDurationIndex` on an exhausted
     *    voice reads `children[i]` as undefined and so returns `durationindex - 5e-7`,
     *    which lands it in `currentvoices` on every remaining pass; `layoutOneItem` places
     *    nothing, but the isolation loop above it has already taken its `getNextX`. Its
     *    last element's rod therefore keeps shunting the other voices right after it has
     *    stopped having anything to say. Measured, not read: on `voice-middle-after-clef`
     *    the shorter voice's final `|]` at 332.917 pushes the longer voice's next note to
     *    340.917, exactly its own 8px width.
     *
     * THE WAITING VOICES ARE THE TRICK, and leaving them out is what made the first
     * attempt at a shared cursor worse than none:
     *
     *     // if a voice had planned to use up 5 spacing units but is not in line to be laid
     *     // out at this duration level - where we've used 2 spacing units - then we must
     *     // use up 3 spacing units, not 5
     *     othervoices[i].spacingduration -= spacingduration
     *     updateNextX(x, spacing, othervoices[i])
     *
     * A half note does not push the cursor its full width at once; it gives up its width in
     * instalments as another voice's shorter notes go by. The recompute is
     * `sqrt(remaining)`, NOT a proportional share.
     */
    /** abcjs's `epsilon` — durations are floats and are compared, never equated. */
    const EPSILON = 1e-7
    /**
     * A zero-duration element is fractionally EARLIER than a note at the same time, so a
     * clef, key, meter, bar or part label is laid out before the other voices' notes reach
     * it (`getDurationIndex`, `layout/staff-group.js`).
     */
    const BEFORE = 5e-7
    /** Where the staff's music starts — abcjs's `getLeftEdgeOfStaff`. */
    const leftEdge = ENGRAVE.marginX + indent

    /**
     * Every element of one voice on this line, prefix included, in cursor order.
     *
     * ONLY THE FIRST VOICE OF A STAFF CARRIES THE STAFF-EXTRAS. abcjs hangs the clef, key
     * and meter off the staff's first voice and gives the others none at all — probed on
     * `multi-voice-lyrics-two-voices`, where the second voice's `i=0` is a NOTE and its
     * `minx` is still 15, the bare left edge.
     *
     * That is not cosmetic, because `minx` is what `er` is measured from. Giving the second
     * voice its own clef left it with `er = 3.77` where abcjs has 61.99, so its lyric's
     * 11.34px of left extent triggered a shift abcjs never makes — and `shiftRight` then
     * dragged the whole time slot, and the rest of the line, 7.56px right.
     */
    const leadsStaff = (v: number): boolean =>
      (voicesOfStaff.find((m) => m.includes(v)) ?? [v])[0] === v
    const blank = { elements: [] as LayoutElement[], advances: [] as Advance[] }
    const heads = plans.map((plan, v) =>
      leadsStaff(v) ? plan.prefix(withMeter, v === 0, indent, span.start) : blank,
    )
    const lines = plans.map((plan, v) => {
      const items: Advance[] = [...(heads[v]?.advances ?? [])]
      /** Where item `k` belongs: the prefix (`block: -1`) or element `index` of `block`. */
      const slots: { block: number; index: number }[] = (heads[v]?.advances ?? []).map(
        (_, index) => ({ block: -1, index }),
      )
      for (let i = span.start; i < span.end; i++) {
        const block = plan.blocks[i]
        if (block === undefined) continue
        block.advances.forEach((a, index) => {
          items.push(a)
          slots.push({ block: i, index })
        })
      }
      return { items, slots }
    })

    /**
     * THE VOICE-OVERLAP RULE — `layout/voice-elements.js:36-66`, run ONCE per element.
     *
     * A sounding note in a voice that is NOT its staff's top voice, whose pitch range
     * touches the top voice's simultaneous note, is displaced to the RIGHT of it: abcjs
     * sets `child.w = firstChildNoteWidth + child.w` and adds the same to every relative
     * child whose name is not an accidental. It is the seconds rule, applied between
     * voices rather than within a chord, and it is why `visual-layout-04`'s two-voice
     * line is 258px wide in abcjs and was 197 here.
     *
     * TOUCHING, not crossing: either end of the child's range inside the first's ± 1.
     * With ONE exception — if the two notes have the same range AND the same head glyph
     * they share a notehead and nothing moves.
     *
     * It is cached in abcjs (`child.adjustedWidth`), so it happens once however many
     * times the solve re-lays the line out. That matters: the widened rod is an input to
     * the next pass, and re-applying it would compound.
     */
    const displaced = new Map<number, Map<number, number>>()
    /** How far element `index` of `block` is displaced in voice `v`, in staff spaces. */
    const displacementOf = (v: number, block: number, index: number): number => {
      const line = lines[v]
      if (line === undefined) return 0
      const k = line.slots.findIndex((slot) => slot.block === block && slot.index === index)
      return k < 0 ? 0 : (displaced.get(v)?.get(k) ?? 0)
    }

    /**
     * Lay the whole line out at one spacing factor, and report what abcjs's solve needs.
     *
     * `units` is abcjs's `spacingUnits`: the `sqrt(duration * 8)` of whichever voice pushed
     * the cursor, summed over every pass. It is the part of the line's width that scales
     * with the factor, and the solve inverts on it directly — no piecewise search, because
     * the rods that won are already accounted for in `width - units * spacing`.
     */
    const lineAt = (factor: number): { at: number[][]; width: number; units: number } => {
      const n = lines.length
      const i = new Array<number>(n).fill(0)
      const durationIndex = new Array<number>(n).fill(0)
      const minx = new Array<number>(n).fill(leftEdge)
      const nextx = new Array<number>(n).fill(leftEdge)
      const unspent = new Array<number>(n).fill(0)
      const at: number[][] = lines.map(() => [])
      /** abcjs's `getSpacingUnits` — NO floor, and zero for a zero-duration element. */
      const unitsOf = (d: number): number => (d > 0 ? Math.sqrt(d / ENGRAVE.spacingReference) : 0)
      const spring = (d: number): number => factor * spacingScale * unitsOf(d)
      const itemOf = (v: number): Advance | undefined => lines[v]?.items[i[v] ?? 0]
      const ended = (v: number): boolean => itemOf(v) === undefined
      const nextXOf = (v: number): number => Math.max(minx[v] ?? 0, nextx[v] ?? 0)
      /** Time this voice is pending at — earlier by a hair when its next element is fixed. */
      const timeOf = (v: number): number =>
        (durationIndex[v] ?? 0) - ((itemOf(v)?.duration ?? 0) > 0 ? 0 : BEFORE)

      let x = leftEdge
      let units = 0
      // Bounded rather than `while (!finished)`: every pass advances at least one voice, so
      // the element count is the ceiling and a bug cannot hang the renderer.
      const passes = lines.reduce((sum, line) => sum + line.items.length, 0)
      for (let pass = 0; pass < passes; pass += 1) {
        // The smallest pending time among the voices that still have something to place.
        // ENDED VOICES ARE EXCLUDED HERE and included in the isolation below — abcjs's own
        // asymmetry, and what stops an exhausted short voice pinning the cursor forever.
        let current = Number.POSITIVE_INFINITY
        for (let v = 0; v < n; v += 1) if (!ended(v)) current = Math.min(current, timeOf(v))
        if (!Number.isFinite(current)) break

        const now: number[] = []
        const waiting: number[] = []
        for (let v = 0; v < n; v += 1) (timeOf(v) - current > EPSILON ? waiting : now).push(v)

        // The cursor goes to the furthest right any of them wants to be, and the voice that
        // pushed it there is the one whose spent time the others have to account for.
        let unit = 0
        let spent = 0
        for (const v of now) {
          if (nextXOf(v) > x) {
            x = nextXOf(v)
            unit = unitsOf(unspent[v] ?? 0)
            spent = unspent[v] ?? 0
          }
        }
        units += unit

        // THE VOICE-OVERLAP RULE, before anything reads a rod — see `displaced` above.
        // abcjs's `lastTopVoice` is the last voice with `voicenumber === 0` seen so far in
        // this duration level, and `currentvoices` is in staff order, so for voice v that
        // is its own staff's top voice — and only when that voice is at this level too.
        for (const v of now) {
          const top = (voicesOfStaff.find((m) => m.includes(v)) ?? [v])[0] ?? v
          if (top === v || !now.includes(top)) continue
          const k = i[v] ?? 0
          const seen = displaced.get(v)
          if (seen?.has(k) === true) continue
          const mine = itemOf(v)?.note
          const theirs = itemOf(top)?.note
          if (!mine || !theirs) continue
          const touches =
            (mine.high <= theirs.high + 1 && mine.high >= theirs.low - 1) ||
            (mine.low <= theirs.high + 1 && mine.low >= theirs.low - 1)
          const shares =
            mine.low === theirs.low && mine.high === theirs.high && mine.head === theirs.head
          if (!touches || shares) continue
          const line = lines[v]
          const item = line?.items[k]
          if (line === undefined || item === undefined) continue
          line.items[k] = { ...item, rod: item.rod + theirs.width }
          const row = seen ?? new Map<number, number>()
          row.set(k, theirs.width)
          displaced.set(v, row)
        }

        /** Voices already placed in THIS pass — they follow the cursor if it moves again. */
        const done: number[] = []
        for (const v of now) {
          const item = itemOf(v)
          if (item === undefined) continue // exhausted: it moved the cursor and nothing else
          const k = i[v] ?? 0
          // Ink hanging LEFT of the element pushes the cursor only when the gap already
          // opened is too small to hold it — `if (er < extraWidth) x += extraWidth - er`
          // (`layout/voice-elements.js`). An accidental normally sits inside the spring
          // and costs nothing. abcjs's one exception: a barline straight after a part
          // label does not shift, because the label has no width of its own to clear.
          const room = x - (minx[v] ?? 0)
          const shifts = k === 0 || item.kind !== 'bar' || lines[v]?.items[k - 1]?.kind !== 'part'
          if (shifts && room < item.left) {
            // Everything already placed at this time slot moves with the cursor —
            // abcjs's `shiftRight`, which carries each voice's own expectations along.
            const dx = item.left - room
            x += dx
            for (const w of done) {
              const row = at[w]
              if (row !== undefined && row.length > 0) row[row.length - 1] = x
              minx[w] = (minx[w] ?? 0) + dx
              nextx[w] = (nextx[w] ?? 0) + dx
            }
          }
          at[v]?.push(x)
          if (PROBE && probeFinalPass) {
            const px = (n: number) => (n * 7.75).toFixed(3)
            console.log(
              `PROBE item v=${v} i=${k} kind=${item.kind} dur=${item.duration} w=${px(item.rod)}` +
                ` left=${px(item.left)} gap=${px(item.gap)} er=${px(x - (minx[v] ?? 0))} x=${px(x)}`,
            )
          }
          done.push(v)
          unspent[v] = item.duration
          // The line's LAST element keeps its own width and loses its `minspacing`.
          const last = k === (lines[v]?.items.length ?? 0) - 1
          minx[v] = x + item.rod - (last ? item.gap : 0)
          nextx[v] = x + spring(item.duration)
          durationIndex[v] = (durationIndex[v] ?? 0) + item.duration
          i[v] = k + 1
        }
        for (const v of waiting) {
          unspent[v] = (unspent[v] ?? 0) - spent
          nextx[v] = x + spring(unspent[v] ?? 0)
        }
      }

      // The line ends where the last thing placed still needs room.
      let unit = 0
      for (let v = 0; v < n; v += 1) {
        if (nextXOf(v) > x) {
          x = nextXOf(v)
          unit = unitsOf(unspent[v] ?? 0)
        }
      }
      return { at, width: x, units: units + unit }
    }

    /**
     * THE SOLVE — abcjs's `setXSpacing` / `calcHorizontalSpacing` (`layout/layout.js`).
     *
     * Justification scales the SPRINGS and leaves the RODS where they are, and the springs
     * are exactly `units * spacing` — so `constSpace = width - units * spacing` is
     * everything that will not move, and one division gives the spacing that hits the
     * target. It still iterates, because which rods win changes as the spacing does; abcjs
     * re-lays out up to 8 times and stops within 2px.
     *
     * ponytail: abcjs's ABSOLUTE guard — `if (spacing * minSpace > 50) spacing = 50/minSpace`
     * — is NOT reproduced, and this closes that long-standing open item rather than
     * deferring it again. `minSpace` is `min` over every pass of the pushing voice's spacing
     * units, and the FIRST pass always contributes zero: every voice starts at `leftEdge`,
     * so no voice's `getNextX` is greater than the cursor and `spacingunit` stays 0.
     * Measured on `voice-middle-after-clef`: `minSpace=0`. `spacing * 0 > 50` is never true,
     * so the guard is inert in abcjs itself and implementing it would be a divergence.
     */
    const target = pageWidth + ENGRAVE.marginX
    // Trailing `%%center` text means the music is no longer the LAST LINE of the tune, so
    // abcjs justifies it unconditionally — its last-line guard tests the last LINE, not
    // the last STAFF line. `center-text` sat 219px out on exactly this.
    const isLast = systemIndex === spans.length - 1 && score.textBelow.length === 0
    const justify = ((): number => {
      let factor = 1
      for (let pass = 0; pass < 8; pass += 1) {
        const { width, units } = lineAt(factor)
        // A last line under `LAST_SYSTEM_FILL` of the page is left at its natural width;
        // above it, it is justified like any other. "Never stretch the last system" was too
        // blunt and was the single largest source of horizontal divergence from abcjs —
        // every single-tune fixture is a last system. COMPRESSION is unconditional: a line
        // longer than the page has `width / target > 1`, sails past this test and is
        // squeezed, which is what makes source-line breaking work without a width packer.
        // `%%stretchlast` REPLACES the 66% rule rather than tuning it. With no directive
        // abcjs keeps its backward-compatible "at least 66% of the page" test; with one,
        // it asks how much the line LACKS and stretches only if that is under the value
        // (`layout.js:100-107`). `padding` there is left PLUS right, both of which are our
        // `marginX`.
        if (isLast) {
          if (score.stretchLast === null) {
            if (width / target < ENGRAVE.lastSystemFill) break
          } else if (!(1 - (width + 2 * ENGRAVE.marginX) / target < score.stretchLast)) break
        }
        if (Math.abs(target - width) < 2 / 7.75) break
        if (units <= 0) break
        const springs = units * spacingScale
        factor = (target - (width - factor * springs)) / springs
      }
      return factor
    })()
    probeFinalPass = true
    const solved = lineAt(justify)
    probeFinalPass = false
    // The ratchet. abcjs rounds to whole PIXELS before comparing, so a sub-pixel overrun
    // does not drag the page with it.
    const thisWidth = solved.width - leftEdge
    if (Math.round(thisWidth * 7.75) > Math.round(pageWidth * 7.75)) pageWidth = thisWidth
    musicLeft[systemIndex] = Math.min(
      ...lines.map((line, v) => {
        const first = line.slots.findIndex((slot) => slot.block >= 0)
        return first < 0 ? Number.POSITIVE_INFINITY : (solved.at[v]?.[first] ?? leftEdge)
      }),
      systemWidth,
    )

    const staves: LayoutStaff[] = plans.map((plan, voiceIndex) => {
      // The title heads the tune: first system, top staff, and inside the layout so the
      // vertical extent accounts for it. Added afterwards it would sit above y = 0 and
      // be clipped away — which is what happened to the first tune of a tunebook, while
      // every later tune looked fine because the tune above had already made room.
      // The top text is a BLOCK — title, subtitles, composer row — with y relative to
      // its own top. `placed` moves it into position once the music's extent is known,
      // which is abcjs's sequence: block, then `spacing.music`, then the music.
      // Blocks standing between the system above and this one — a `%%text`, a `%%center`
      // or a mid-tune `T:`. They belong to the SYSTEM, so they are read off the first
      // measure of the span whichever voice happened to claim them, and drawn on the
      // first voice only.
      const midTune =
        systemIndex === 0 || voiceIndex !== 0
          ? []
          : plans.flatMap((p) => [...(p.measures[span.start]?.textBefore ?? [])])
      const block: { texts: PlacedText[]; lines: PlacedLine[]; height: number } =
        systemIndex === 0 && voiceIndex === 0
          ? {
              lines: [],
              ...topTextBlock(
                score.metadata,
                systemWidth - ENGRAVE.marginX * 2,
                score.textAbove,
                score.fonts,
              ),
            }
          : midTune.length > 0
            ? freeTextBlock(midTune, systemWidth - ENGRAVE.marginX * 2, score.fonts)
            : { texts: [], lines: [], height: 0 }
      const blockLines: readonly PlacedLine[] = block.lines
      const heading: LayoutElement[] =
        block.texts.length === 0 && blockLines.length === 0
          ? []
          : [
              {
                type: 'title',
                // A MID-TUNE BLOCK SPENDS NO `musicSpace`. abcjs's `spacing.music` is
                // spent once, before the first staff group (`draw.js:17`); a nonMusic line
                // between two groups costs exactly its own rows. Measured on a control
                // pair: a mid-tune `T:` costs 27.05px and nothing else moves.
                blockAbutsMusic: systemIndex > 0,
                x: 0,
                width: 0,
                staffSteps: [],
                glyphs: [],
                lines: blockLines,
                texts: block.texts,
                blockHeight: block.height,
              },
            ]
      // The voice label sits at the page margin, vertically centred on its staff. When
      // several voices share a staff their labels stack, centred as a block — abcjs's
      // `headerPosition`. Zero-width: it lives left of the music the indent already made
      // room for, so it advances nothing.
      const labelText = systemIndex === 0 ? plan.name : plan.subname
      const nameElements: LayoutElement[] = []
      if (labelText) {
        const members = voicesOfStaff.find((m) => m.includes(voiceIndex)) ?? [voiceIndex]
        const pos = Math.max(0, members.indexOf(voiceIndex))
        const size = 17 / 7.75
        const centre =
          (pos - (members.length - 1) / 2) * size * ENGRAVE.lineSkipFactor + size * 0.35
        nameElements.push({
          type: 'voiceName',
          x: ENGRAVE.marginX,
          width: 0,
          staffSteps: [],
          glyphs: [],
          lines: [],
          texts: [
            { text: labelText, x: ENGRAVE.marginX, y: centre, size, bold: true, italic: false },
          ],
        })
      }
      // Where the cursor put every one of this voice's elements, split back out by the
      // slot each item came from.
      const line = lines[voiceIndex]
      const xs = solved.at[voiceIndex] ?? []
      const prefixX: number[] = []
      const blockX = new Map<number, number[]>()
      line?.slots.forEach((slot, k) => {
        const x = xs[k]
        if (x === undefined) return
        if (slot.block < 0) prefixX[slot.index] = x
        else {
          const row = blockX.get(slot.block) ?? []
          row[slot.index] = x
          blockX.set(slot.block, row)
        }
      })
      const elements: LayoutElement[] = [
        ...heading,
        ...nameElements,
        // The prefix rides the same cursor as the music, so its elements move with it.
        ...(heads[voiceIndex]?.elements ?? []).map((el, index) =>
          shiftElement(el, (prefixX[index] ?? el.x) - el.x),
        ),
      ]
      const beamGroups = new Map<number, StemInfo[]>()
      const voltaLines: PlacedLine[] = []
      const voltaTexts: PlacedText[] = []
      // ONE volta bracket per SYSTEM, on the first voice of the first staff — abcjs's
      // `elem.startEnding && isFirstStaff && voice.voicenumber === 0`
      // (`abstract-engraver.js:1034-1037`, comment: "only put the first & second ending
      // marks on the first staff"). Every voice carries the `|1`/`|2` barline, so drawing
      // per voice put FIVE brackets on `ragtime-nightingale` where abcjs draws one — 15
      // `1` labels against its 3 — and, worse, reserved the ending lane on the BASS staff
      // too, which pushed it 6 pitch clear of the treble on every voltaed system.
      const drawsVoltas = voiceIndex === voicesOfStaff[0]?.[0]
      /** The repeat ending currently open, and where its bracket started. */
      let openVolta: { label: string; startX: number } | null = null

      /**
       * Close the open ending, drawing its bracket.
       *
       * `hooked` is false when the ending simply runs off the end of a system —
       * engraving leaves that end open, because the bracket resumes on the next line.
       */
      const closeVolta = (endX: number, hooked: boolean): void => {
        if (openVolta === null) return
        const y = stepToY(ENGRAVE.voltaStep)
        const thickness = LINE_WEIGHTS.thinBarline
        voltaLines.push({ x1: openVolta.startX, y1: y, x2: endX, y2: y, thickness })
        // The opening hook always turns down; the closing one only when the ending
        // really ends here rather than continuing onto the next system.
        voltaLines.push({
          x1: openVolta.startX,
          y1: y,
          x2: openVolta.startX,
          y2: y + ENGRAVE.voltaHook,
          thickness,
        })
        if (hooked) {
          voltaLines.push({ x1: endX, y1: y, x2: endX, y2: y + ENGRAVE.voltaHook, thickness })
        }
        voltaTexts.push({
          text: openVolta.label,
          x: openVolta.startX + 0.4,
          y: y + ENGRAVE.voltaTextSize,
          size: ENGRAVE.voltaTextSize,
          bold: false,
          italic: false,
        })
        openVolta = null
      }

      // Where this voice's measure `i` begins and ends on the line — a volta bracket spans
      // measures, and with no columns left there is no shared edge to read it off.
      const startOf = (i: number): number => blockX.get(i)?.find((v) => v !== undefined) ?? leftEdge
      /**
       * Where measure `i`'s bracket stops: at the start of the next measure that has any
       * ink, so `|1 … :|2` runs its two endings back to back with no gap between them.
       * A column model got this for free — both ends were the same column edge.
       */
      const endOf = (i: number): number => {
        for (let j = i + 1; j < span.end; j++) {
          const next = blockX.get(j)?.find((v) => v !== undefined)
          if (next !== undefined) return next
        }
        return solved.width
      }

      for (let i = span.start; i < span.end; i++) {
        const block = plan.blocks[i]
        if (block !== undefined) {
          // A new ending closes whatever was open — `|1 … :|2` runs them back to back.
          if (block.volta !== null && drawsVoltas) {
            closeVolta(startOf(i), true)
            openVolta = { label: block.volta, startX: startOf(i) }
          }
          const base = elements.length
          // Every element sits where the LINE's shared cursor put it: notes at the same
          // musical time land on the same x however differently the voices are written, and
          // a barline is one more entry on that timeline rather than a column edge. Internal
          // geometry is untouched — `shiftElement` translates a whole element, so an
          // accidental keeps its distance from its notehead however far the line stretches.
          const placedAt = blockX.get(i) ?? []
          /** How far element `index` moved — beams and anchors ride with their element. */
          const shiftOf = (index: number): number => {
            const at = block.elements[index]?.x ?? 0
            return (placedAt[index] ?? at) - at
          }
          block.elements.forEach((el, index) => {
            elements.push(
              displaceHeads(shiftElement(el, shiftOf(index)), displacementOf(voiceIndex, i, index)),
            )
          })
          for (const [group, members] of block.beams) {
            const shifted = members.map((m) => ({
              ...m,
              // A stem sits at its element's origin plus an offset within it, so it
              // moves with the element rather than scaling on its own — and with its
              // voice-overlap displacement, which moves the head the stem hangs off.
              x: m.x + shiftOf(m.element) + displacementOf(voiceIndex, i, m.element),
              element: m.element + base,
            }))
            beamGroups.set(group, [...(beamGroups.get(group) ?? []), ...shifted])
          }
          for (const a of block.anchors) {
            const away = displacementOf(voiceIndex, i, a.element)
            voiceAnchors[voiceIndex]?.push({
              ...a,
              system: systemIndex,
              element: a.element + base,
              left: a.left + shiftOf(a.element) + away,
              right: a.right + shiftOf(a.element) + away,
            })
          }
        }
        if (block?.closesVolta) closeVolta(endOf(i), true)
      }

      const beams: PlacedLine[] = []
      // Beams last: they retarget stems already placed and need every member's final
      // position. A beam never crosses a barline, so it never crosses a system break.
      for (const group of beamGroups.values()) beams.push(...layoutBeam(group, elements))

      // Curves are NOT resolved here: a slur or tie can span a system break, so it needs
      // every system's anchors, which only exist once the whole tune is packed. Filled
      // in by the pass below.
      // An ending still open at the end of a system runs off it, unhooked.
      closeVolta(solved.width, false)

      // Tuplets resolve here — unlike curves they never span a system, because a beam
      // and a barline both break them long before a line break can.
      const systemAnchors = (voiceAnchors[voiceIndex] ?? []).filter(
        (anchor) => anchor.system === systemIndex,
      )
      const isHairpin = (name: string): boolean => {
        const kind = SPANNER_OPEN[name] ?? SPANNER_CLOSE[name]
        return kind === 'crescendo' || kind === 'diminuendo'
      }
      const hasHairpin = systemAnchors.some((a) => a.event.decorations.some(isHairpin))
      const tuplets = layoutTuplets(systemAnchors, elements)
      const curves = curveReserves(systemAnchors, elements, voicePosOf(voiceIndex))
      // Melismas resolve here for the same reason tuplets do, and must run AFTER the
      // elements are final: in strict mode this rewrites the syllable's text in place.
      const melismaLines = layoutMelismas(systemAnchors, elements, strict)

      return {
        elements,
        // One voice per staff until the merge below folds shared staves together.
        voices: [elements],
        // How many lines this voice's staff draws — `V:… stafflines=`. The MERGE keeps the
        // first voice's, which is abcjs's answer too: `stafflines` is read off the staff's
        // clef (`abstract-engraver.js:182`), and a staff has one.
        staffLineCount: plan.clef.staffLines,
        staffLines: [],
        beams,
        curves: [],
        hasHairpin,
        dynamicsAbove: hasVocalsAt(span.start),
        tupletReservesAbove: tuplets.reservesAbove,
        // Ties and slurs reserve on the same terms — a declared box, folded in here so
        // `verticalExtent` has one list of them. See `curveReserves`.
        tupletReserves: [...tuplets.reserves, ...curves.ink],
        curveReserves: curves.post,
        tupletLines: tuplets.lines,
        tupletTexts: tuplets.texts,
        voltaLines,
        voltaTexts,
        melismaLines,
        // Filled in after packing, with curves: a hairpin can cross a system break, and
        // resolving it here would silently drop every one that does.
        spannerLines: [],
        originY: 0,
      }
    })

    // The line's own solved width — abcjs's `staffGroup.w`, which is absolute and already
    // carries the left edge — plus the right margin.
    const musicWidth = solved.width + ENGRAVE.marginX

    /**
     * The drawing has to fit its PROSE too, not just its music.
     *
     * A title is routinely wider than the bar it heads, and a lyric under the last note
     * runs past it. Sizing the system from the music alone clipped both: a 64-character
     * title on a one-bar tune produced a 13-space viewBox with text reaching 77, so most
     * of it was simply cut off the right edge.
     *
     * A title is measured BARE because it has not been centred yet — that happens below,
     * against this width. Everything else is already placed, so it measures from its x.
     */
    const textWidth_ = (t: { text: string; size: number }) => textWidth(t.text, t.size)
    const proseWidth = Math.max(
      0,
      ...staves.flatMap((staff) =>
        staff.elements.flatMap((el) =>
          el.texts.map((t) =>
            el.type === 'title'
              ? textWidth_(t) + 2 * ENGRAVE.marginX
              : t.x + textWidth_(t) + ENGRAVE.marginX,
          ),
        ),
      ),
    )
    const width = Math.max(musicWidth, proseWidth)

    // The title centres on the finished system, whose width is only known now.
    const centred = staves.map((staff, staffIndex) =>
      staffIndex !== 0
        ? staff
        : {
            ...staff,
            elements: staff.elements.map((el) =>
              el.type !== 'title'
                ? el
                : {
                    ...el,
                    texts: el.texts.map((t) => ({
                      ...t,
                      x: Math.max(0, (width - textWidth(t.text, t.size)) / 2),
                    })),
                  },
            ),
          },
    )

    // MERGE the voices that share a staff. Everything above is built per voice, because
    // beams, stems and lyrics are a voice's own; what is shared is the five lines they
    // are printed on. So the drawing is concatenated and one set of staff lines is drawn,
    // rather than each voice getting its own stave.
    const merged = voicesOfStaff.map((members) => {
      const parts = anchorBelowStaff(
        anchorAboveStaff(
          anchorLyrics(
            members.map((i) => centred[i]).filter((x) => x !== undefined),
            strict,
          ),
          strict,
          score.partsBox,
        ),
        strict,
      )
      const first = parts[0]
      if (first === undefined) return centred[0] as (typeof centred)[number]
      if (parts.length === 1) return { ...first, voices: [first.elements] }
      return {
        ...first,
        voices: parts.map((p) => p.elements),
        elements: parts.flatMap((p) => p.elements),
        beams: parts.flatMap((p) => p.beams),
        tupletLines: parts.flatMap((p) => p.tupletLines),
        tupletTexts: parts.flatMap((p) => p.tupletTexts),
        // The staff's reserves are the union of its voices', not the first voice's. A
        // spread alone kept only voice one's, so a hairpin or a tuplet on the lower voice
        // of a shared staff reserved nothing at all.
        tupletReserves: parts.flatMap((p) => p.tupletReserves),
        curveReserves: parts.flatMap((p) => p.curveReserves),
        tupletReservesAbove: parts.some((p) => p.tupletReservesAbove),
        hasHairpin: parts.some((p) => p.hasHairpin),
        voltaLines: parts.flatMap((p) => p.voltaLines),
        voltaTexts: parts.flatMap((p) => p.voltaTexts),
        melismaLines: parts.flatMap((p) => p.melismaLines),
      }
    })

    // Stack the staves, each measured from its own content so a staff with a tempo mark
    // or high ledger lines gets the room it needs and no more.
    //
    // abcjs leaves `spacing.music` between the top text and the first staff even when the
    // top text is empty — `draw.js` runs `y += spacing.music` unconditionally after
    // `nonMusic`. A TITLED first system folds that gap into the heading offset below; a
    // TITLE-LESS one has no heading to fold it into, so without this the whole system
    // rides `musicSpace` too high. Only system 0, and only when it has no heading — a
    // later system's spacing is the inter-system minimum, not this.
    const headingless = systemIndex === 0 && !merged[0]?.elements.some((el) => el.type === 'title')
    let cursor = headingless ? musicSpace : 0
    /** Bottom staff LINE of the staff placed before this one, in system coordinates. */
    let previousBottomLine: number | null = null
    const placed = merged.map((staff) => {
      // Place the top-text block FROM the music: its bottom sits `musicSpace` clear of
      // whatever the music's own top is, which already includes a tempo mark or an
      // annotation. The block shifts as a whole, so its internal spacing is untouched.
      const heading = staff.elements.filter((el) => el.type === 'title')
      const musicOnly = staff.elements.filter((el) => el.type !== 'title')
      const positioned =
        heading.length === 0
          ? staff.elements
          : (() => {
              const musicTop = verticalExtent(musicOnly, staff.beams, strict, staff).top
              // The block's own height, not its last descender: abcjs advances by a
              // rounded line height per row and that trailing space is part of the block.
              const blockBottom = Math.max(...heading.map((el) => el.blockHeight ?? 0))
              const gap = heading.some((el) => el.blockAbutsMusic === true) ? 0 : musicSpace
              const offset = musicTop - gap - blockBottom
              if (PROBE)
                console.log(
                  `BLOCK musicTop=${musicTop.toFixed(4)} (pitch ${(6 - 2 * musicTop).toFixed(4)}) topBy=${probeTop} flags=${probeFlags} blockH=${blockBottom.toFixed(4)} musicSpace=${musicSpace} offset=${offset.toFixed(4)}`,
                )
              return [
                ...heading.map((el) => ({
                  ...el,
                  blockTop: offset,
                  texts: el.texts.map((t) => ({ ...t, y: t.y + offset })),
                })),
                ...musicOnly,
              ]
            })()
      const extent = verticalExtent(positioned, staff.beams, strict, staff)
      if (PROBE) {
        // abcjs pitch = 6 - 2 * ourY(spaces); its `top` is our MIN y and vice versa.
        const pitch = (y: number) => (6 - 2 * y).toFixed(4)
        console.log(
          `PROBE staff ${systemIndex} top=${pitch(extent.top)} bottom=${pitch(extent.bottom)}` +
            `  topBy=${probeTop}  bottomBy=${probeBottom}  flags=${probeFlags}`,
        )
      }
      const stacked = cursor - extent.top
      // The separation is a minimum LINE-to-LINE distance, which is what abcjs measures:
      // `draw.js:86-89` works from each staff's overhang past its own outer lines, so
      // what it pads to is bottom-line to top-line. Comparing origins instead is short by
      // however far the ink reaches beyond the lines — which is the part that varies, and
      // it made the minimum silently never bind.
      const originY =
        previousBottomLine === null
          ? stacked
          : Math.max(stacked, previousBottomLine + intraStaffSep + STAFF_HALF_HEIGHT)
      previousBottomLine = originY + STAFF_HALF_HEIGHT
      cursor = originY + extent.bottom + ENGRAVE.staffGap
      return {
        ...staff,
        elements: positioned,
        staffLines: staffLinesFor(width, staff.staffLineCount),
        originY,
      }
    })

    const connectors = layoutConnectors(score.staves, placed)
    return {
      staves: placed,
      connectorGlyphs: connectors.glyphs,
      connectorLines: connectors.lines,
      width,
      originY: 0,
    }
  })

  // Now that every system exists, resolve each voice's slurs and ties across the whole
  // tune and hand each system its share.
  // Music starts after the widest prefix on the system and ends at its right margin.
  const systemBounds = systems.map((system, i) => ({
    left: musicLeft[i] ?? ENGRAVE.marginX + indentFor(i),
    right: system.width - ENGRAVE.marginX,
  }))
  const curvesBySystem = voiceAnchors.map((anchors, v) =>
    layoutCurves(anchors, systemBounds, voicePosOf(v)),
  )
  // Hairpins need the same treatment and for the same reason. Resolved per system, they
  // lost HALF the hairpins in S1-decorations tune 2 — it wraps to six systems and the
  // pairs straddle the breaks.
  const spannersBySystem = voiceAnchors.map((anchors) =>
    layoutSpanners(anchors, systemBounds, hasVocals),
  )
  const withCurves = systems.map((system, systemIndex) => ({
    ...system,
    // By STAFF now, not by voice: a shared staff collects the curves and hairpins of
    // every voice on it.
    staves: system.staves.map((staff, staffIndex) => ({
      ...staff,
      curves: (voicesOfStaff[staffIndex] ?? []).flatMap(
        (v) => curvesBySystem[v]?.[systemIndex] ?? [],
      ),
      spannerLines: (voicesOfStaff[staffIndex] ?? []).flatMap(
        (v) => spannersBySystem[v]?.[systemIndex] ?? [],
      ),
    })),
  }))

  // Stack the systems, with the same line-to-line minimum the staves use.
  let cursor = 0
  /** Absolute y of the BOTTOM staff line of the last system placed. */
  let previousBottomLine: number | null = null
  const placed = withCurves.map((system) => {
    const height = systemHeight(system, strict)
    const staves = system.staves
    const topLineOffset = (staves[0]?.originY ?? 0) - STAFF_HALF_HEIGHT
    const bottomLineOffset = (staves[staves.length - 1]?.originY ?? 0) + STAFF_HALF_HEIGHT
    // A MID-TUNE BLOCK IS ADDITIVE TO THE SEPARATION, NOT ABSORBED BY IT. abcjs draws the
    // nonMusic line first — `renderer.y` moves by its rows — and only then runs
    // `addStaffPadding`, which measures `naturalSeparation` from the two groups' OWN
    // overhangs (`draw.js:82-89`) and knows nothing about the cursor. So the minimum
    // applies to the music, and the block goes on top of whatever it produces. Left in
    // `topLineOffset` the block was swallowed whole and a mid-tune `T:` moved nothing.
    const blockH = (staves[0]?.elements ?? [])
      .filter((el) => el.type === 'title' && el.blockAbutsMusic === true)
      .reduce((sum, el) => sum + (el.blockHeight ?? 0), 0)
    const originY =
      previousBottomLine === null
        ? cursor
        : Math.max(cursor, previousBottomLine + interSystemSep - topLineOffset + blockH)

    previousBottomLine = originY + bottomLineOffset
    cursor = originY + height + ENGRAVE.systemGap
    return { ...system, originY }
  })

  // `%%maxStaves` — an INCIPIT. abcjs lays the whole tune out and simply stops drawing
  // past the limit (`draw/draw.js:33-38`), so the systems that survive are placed exactly
  // as they would be without the directive.
  const shown = score.maxStaves === null ? placed : placed.slice(0, score.maxStaves)
  const last = shown[shown.length - 1]
  const bottom = last === undefined ? 0 : last.originY + systemHeight(last, strict)

  return {
    systems: shown,
    width: Math.max(0, ...shown.map((s) => s.width)),
    // `cursor` has one trailing gap on it, added after the last system. abcjs opens with
    // `moveY(padding.top)` before drawing anything (`draw.js:14`), so the page begins
    // ABOVE the ink — expressed as a negative viewBox top rather than by shifting every
    // system, which would put the same constant in two places.
    height: bottom + ENGRAVE.marginTop + ENGRAVE.marginBottom,
    top: -ENGRAVE.marginTop,
  }
}

/**
 * Lay out a whole tunebook: several tunes stacked down the page.
 *
 * Each tune is laid out INDEPENDENTLY by `layout` and then translated into place, which
 * is the same trick as systems within a tune and staves within a system, for the same
 * reason — nothing inside a tune depends on how many tunes precede it, so adding a tune
 * at the top cannot shift the geometry of one below.
 *
 * This is not a niche case: 12 of the 41 corpus fixtures hold more than one tune, and
 * `clefs` holds eight. Rendering only the first meant seven of its eight clefs were
 * invisible.
 */
export function layoutBook(scores: readonly Score[], options: LayoutOptions = {}): Layout {
  const systems: LayoutSystem[] = []
  let cursor = 0
  let width = 0

  scores.forEach((score, index) => {
    const tune = layout(score, options)
    for (const system of tune.systems) {
      systems.push({ ...system, originY: system.originY + cursor })
    }
    width = Math.max(width, tune.width)
    cursor += tune.height + (index === scores.length - 1 ? 0 : ENGRAVE.tuneGap)
  })

  // abcjs opens with `moveY(padding.top)` before anything is drawn (`draw.js:14`), so
  // the page begins ABOVE the ink. Expressed as a negative viewBox top rather than by
  // shifting every system, which would put the same constant in two places.
  //
  // AND IT CLOSES WITH `padding.bottom` — see `ENGRAVE.marginBottom`.
  return {
    systems,
    width,
    height: cursor + ENGRAVE.marginTop + ENGRAVE.marginBottom,
    top: -ENGRAVE.marginTop,
  }
}

/** A system's full vertical extent, from the top of its first staff's content down. */
function systemHeight(system: LayoutSystem, strict = true): number {
  let bottom = 0
  for (const staff of system.staves) {
    const extent = verticalExtent(staff.elements, staff.beams, strict, staff)
    bottom = Math.max(bottom, staff.originY + extent.bottom)
  }
  return bottom
}

/**
 * The vertical span of everything drawn, plus a margin.
 *
 * Measured from content rather than assumed, because a fixed margin silently CLIPS: a
 * bass-clef voice written in treble range sits four ledger lines above the staff, well
 * outside any constant, and a tempo mark sits above that again. The bug is invisible in
 * the structural gate, which sees no geometry at all — it shows up only as notes missing
 * from the rendered SVG.
 */
/**
 * The tune's top text — title, subtitles, then the rhythm / composer / origin row.
 *
 * A BLOCK with its own height, which is the point. abcjs walks a cursor down it and only
 * then leaves `spacing.music` before the staff (`draw.js:14-17` via `top-text.js`,
 * reproduced line by line in abcMusicKit v1's `drawTopText`). So a tune with a composer
 * pushes its music further down than one without, and no single "title height" constant
 * can stand in for that — which is what four earlier attempts at the vertical offset kept
 * rediscovering, and why our first system used to start at a fixed 72.5px while abcjs's
 * ranged from 126.7 to 213.1 across the corpus.
 *
 * y runs DOWN from the block's own top, so the caller can place the whole thing against
 * the music without knowing what is in it.
 *
 * ponytail: no `%%titleformat`, `%%writefields` or `%%aligncomposer`. v1 has all three as
 * NATIVE extensions; nothing in the corpus sets any, and each changes only where within
 * the block a field lands, not the block's shape.
 */
function topTextBlock(
  metadata: ScoreMetadata,
  width: number,
  textAbove: readonly FreeTextBlock[] = [],
  fonts: Score['fonts'] = {},
): { texts: PlacedText[]; height: number } {
  const texts: PlacedText[] = []
  let y = 0
  // abcjs rounds each line advance to whole PIXELS before moving on, so a block's height
  // is not simply a sum of ems. Reproduced rather than smoothed.
  //
  // The height is the MEASURED one — `Math.round(size.height * 1.1)` (`add-text-if.js:26`)
  // — so it comes from the golden's own table, not from a ratio. The two agree to a
  // hundredth on every DEFAULT size; they part company as soon as a `%%…font` sets one the
  // table does not list, where the generator falls back to `size + 2`.
  const advance = (size: number, extra = 0): void => {
    y +=
      Math.round((goldenTextHeight(size) + extra) * ENGRAVE.lineSkipFactor * STAFF_SPACE_PX) /
      STAFF_SPACE_PX
  }
  const sizeOf = (type: AbcFontType): number =>
    Math.round(((fonts[type]?.size ?? ABC_FONT_DEFAULT_PT[type]) * 4) / 3) / STAFF_SPACE_PX
  /** A boxed font measures `height + padding * 4`, `padding = size * fontboxpadding`. */
  const boxOf = (type: AbcFontType): number =>
    fonts[type]?.box === true ? sizeOf(type) * ENGRAVE.fontBoxPadding * 4 : 0
  const centre = width / 2

  const titleSize = sizeOf('titlefont')
  const [title, ...subtitles] = metadata.titles
  if (title !== undefined && title !== '') {
    y += ENGRAVE.titleSpace
    texts.push({
      text: title,
      role: 'title',
      x: centre,
      // abcjs writes the baseline one font size below the cursor (`text.js:30`).
      y: y + titleSize,
      size: titleSize,
      bold: true,
      italic: false,
      anchor: 'middle',
    })
    advance(titleSize, boxOf('titlefont'))
  }

  // Second and later `T:` fields are subtitles — abcm2ps's convention, and abcjs's.
  for (const subtitle of subtitles) {
    if (subtitle === '') continue
    y += ENGRAVE.subtitleSpace
    texts.push({
      text: subtitle,
      role: 'title',
      x: centre,
      y: y + sizeOf('subtitlefont'),
      size: sizeOf('subtitlefont'),
      bold: false,
      italic: false,
      anchor: 'middle',
    })
    advance(sizeOf('subtitlefont'), boxOf('subtitlefont'))
  }

  // ONE row carrying up to three fields: rhythm left, composer and origin right. They
  // share a baseline, so the row advances once however many are present.
  const rhythm = metadata.rhythm ?? ''
  const composer = metadata.composer ?? ''
  const origin = metadata.origin ?? ''
  if (rhythm !== '' || composer !== '' || origin !== '') {
    y += ENGRAVE.composerSpace
    if (rhythm !== '') {
      texts.push({
        text: rhythm,
        role: 'title',
        x: 0,
        y: y + sizeOf('infofont'),
        size: sizeOf('infofont'),
        bold: false,
        italic: true,
        anchor: 'start',
      })
    }
    // abcjs emits composer and origin as ONE text, the origin parenthesised.
    const right = origin === '' ? composer : `${composer === '' ? '' : `${composer} `}(${origin})`
    if (right !== '') {
      texts.push({
        text: right,
        role: 'title',
        x: width,
        y: y + sizeOf('composerfont'),
        size: sizeOf('composerfont'),
        bold: false,
        italic: true,
        anchor: 'end',
      })
    }
    // THE ROW ADVANCES BY WHICHEVER FIELD MOVES IT, not by the taller of the two.
    // `addTextIf` measures `getTextSize.calc("A", font)` and moves by `round(height *
    // 1.1)` — but the rhythm is given `noMove: !!(composer || origin)`
    // (`top-text.js:36-39`), so when either is present the rhythm draws and moves nothing
    // and `composerfont` alone sets the row. Taking the max spent `%%infofont Monaco 11
    // box`'s 24px where abcjs spent `%%composerfont Arial 8 box`'s 19.
    const rowFont: AbcFontType = composer !== '' || origin !== '' ? 'composerfont' : 'infofont'
    advance(sizeOf(rowFont), boxOf(rowFont))
  }

  // `A:` — the author of the words. Its own row, right-aligned in `composerfont`, with NO
  // leading gap: abcjs spends `spacing.composer` only before the rhythm/composer row and
  // writes this one bare (`top-text.js:68-71`). Measured on a control pair, exactly 23px.
  const author = metadata.author ?? ''
  if (author !== '') {
    texts.push({
      text: author,
      role: 'title',
      x: width,
      y: y + sizeOf('composerfont'),
      size: sizeOf('composerfont'),
      bold: false,
      italic: true,
      anchor: 'end',
    })
    advance(sizeOf('composerfont'), boxOf('composerfont'))
  }

  // A HEADER `P:` — the part ORDER, left-aligned in `partsfont`, closing the block. 24px.
  const partOrder = metadata.partOrder ?? ''
  if (partOrder !== '') {
    texts.push({
      text: partOrder,
      role: 'title',
      x: 0,
      y: y + sizeOf('partsfont'),
      size: sizeOf('partsfont'),
      bold: false,
      italic: false,
      anchor: 'start',
    })
    advance(sizeOf('partsfont'), boxOf('partsfont'))
  }

  // `%%center` lines standing before the music close the block. Centred like the title,
  // but on the STAFF width rather than the paper width — which is the width passed here.
  //
  // TWO THINGS DIFFER FROM A TITLE ROW, and both are abcjs's:
  //
  // 1. NO LEADING GAP HERE. abcjs's own gap before a `%%center` is `spacing.music`, spent
  //    by `draw.js:17` BEFORE the row and never again after it — the centered text ends
  //    exactly where the staff group begins. We place the block `musicSpace` above the
  //    music, so that same 7.56 is already accounted for on the other side; adding one
  //    here too spent it twice.
  // 2. NO LINE-SKIP. `FreeText` pushes `{ move: size.height }` bare
  //    (`elements/free-text.js:38`), where `addTextIf` — the title, subtitle and composer
  //    path — pushes `Math.round(size.height * 1.1)` (`add-text-if.js:26-27`). At the
  //    21px `textfont` that is 23.27 against our 26.
  //
  // Together they put `center-text` 10.32px low.
  //
  // `%%text` and `%%begintext` differ from `%%center` in exactly two ways, both measured
  // off abcjs with a control pair on one tune: they sit at the LEFT margin with
  // `anchor: "start"`, and they spend `{ move: hash.attr['font-size'] / 2 }` before the
  // row (`free-text.js:12`) where the centred branch pushes its row bare (`:38`).
  // `%%center A` costs 23.27px, `%%text A` costs 33.77, and their rows sit that same
  // 10.5 apart — one half of the 21px `textfont`.
  //
  // A `%%begintext` block is ONE element however many lines it holds: abcjs draws it as a
  // single `<text>` with a `tspan` per line and reserves one multi-line height. Measured,
  // each line past the first adds 25.2px — `1.2em` at 21px, the same `dy` a lyric verse
  // steps by, and NOT the 1.108 line height the first line takes.
  y = appendFreeText(texts, textAbove, y, centre, fonts)

  return { texts, height: y }
}

/**
 * The free-text and subtitle rows, shared by the tune's own block and every mid-tune one.
 *
 * A MID-TUNE `T:` is a Subtitle element, not a FreeText: `spacing.subtitle` above it, one
 * row in `subtitlefont`, and its own MEASURED height below with no `* 1.1`
 * (`elements/subtitle.js`). Measured on a control pair it costs 27.05px where `%%text`
 * costs 33.77 and `%%center` 23.27 — and those two cost the same mid-tune as at the head,
 * because they are the same element in both places.
 */
function appendFreeText(
  texts: PlacedText[],
  blocks: readonly FreeTextBlock[],
  from: number,
  centre: number,
  fonts: Score['fonts'],
  /** `%%sep` rules, collected out — a block can carry ink as well as text. */
  rules: { y: number; width: number }[] = [],
): number {
  let y = from
  const sizeOf = (type: AbcFontType): number =>
    Math.round(((fonts[type]?.size ?? ABC_FONT_DEFAULT_PT[type]) * 4) / 3) / STAFF_SPACE_PX
  /**
   * A BOXED font measures `height + padding * 4`, and both of these rows move by their
   * MEASURED height — `getTextSize.calc` in `subtitle.js:8` and `free-text.js:19`. Leaving
   * it out cost a `%%text` + mid-tune `T:` between two systems 20.4px of gap.
   */
  const boxOf = (type: AbcFontType): number =>
    fonts[type]?.box === true ? sizeOf(type) * ENGRAVE.fontBoxPadding * 4 : 0
  for (const block of blocks) {
    if (block.separator !== undefined) {
      // The RULE COSTS NO HEIGHT — `drawSeparator` paints at the cursor and moves nothing
      // — so the line is worth exactly its two spaces. Points to staff spaces on the way.
      y += block.separator.above / STAFF_SPACE_PX
      rules.push({ y, width: block.separator.length / STAFF_SPACE_PX })
      y += block.separator.below / STAFF_SPACE_PX
      continue
    }
    if (block.role === 'subtitle') {
      const size = sizeOf('subtitlefont')
      y += ENGRAVE.subtitleSpace
      for (const line of block.lines) {
        texts.push({
          text: line,
          role: 'title',
          x: centre,
          y: y + size,
          size,
          bold: false,
          italic: false,
          anchor: 'middle',
        })
      }
      y += goldenTextHeight(size) + boxOf('subtitlefont')
      continue
    }
    const textSize = sizeOf('textfont')
    if (block.align === 'left') y += textSize / 2
    block.lines.forEach((line, index) => {
      texts.push({
        text: line,
        role: 'title',
        x: block.align === 'center' ? centre : 0,
        y: y + textSize + index * ENGRAVE.freeTextLineStep,
        size: textSize,
        bold: false,
        italic: false,
        anchor: block.align === 'center' ? 'middle' : 'start',
      })
    })
    y +=
      goldenTextHeight(textSize) +
      boxOf('textfont') +
      (block.lines.length - 1) * ENGRAVE.freeTextLineStep
  }
  return y
}

/** A system's own preceding blocks, with no title above them. */
function freeTextBlock(
  blocks: readonly FreeTextBlock[],
  width: number,
  fonts: Score['fonts'] = {},
): { texts: PlacedText[]; lines: PlacedLine[]; height: number } {
  const texts: PlacedText[] = []
  const rules: { y: number; width: number }[] = []
  const height = appendFreeText(texts, blocks, 0, width / 2, fonts, rules)
  // Centred on the STAFF width, as `drawSeparator` centres it, and one pixel thick.
  const lines: PlacedLine[] = rules.map((r) => ({
    x1: (width - r.width) / 2,
    y1: r.y,
    x2: (width + r.width) / 2,
    y2: r.y,
    thickness: 1 / STAFF_SPACE_PX,
  }))
  return { texts, lines, height }
}

/**
 * Everything a staff draws that does NOT live in `elements` — tuplet brackets and their
 * numbers, repeat-ending brackets and labels, hairpins and melisma rules.
 *
 * These were absent from the extent entirely, so nothing reserved room for them and the
 * staff sat as high as if they were not drawn. A tuplet bracket rides above the beam, so
 * the tuplet fixtures were the corpus's worst vertical offenders after ragtime.
 *
 * Slurs and ties are deliberately NOT here: they resolve after packing, so at the moment
 * a staff is placed its `curves` are still empty. The SYSTEM height is measured later and
 * does see them.
 */
/**
 * Hang each voice's lyrics off the staff's music, once the voices sharing it are known.
 *
 * Two voices on one staff printed their syllables ON TOP OF EACH OTHER, because a lyric
 * was placed at a fixed lane below the staff when its own voice was laid out — before
 * anything knew a second voice would land on the same five lines. abcjs resolves both
 * facts here instead, at the staff: the block hangs from the staff's ink bottom, and each
 * voice after the first hangs one lyric height lower again. See `ENGRAVE.lyricInkGap`.
 *
 * The shift is UNIFORM per voice, so verse-to-verse stacking and the melisma extenders
 * already aligned to verse 1 ride along without being recomputed.
 */
function anchorLyrics<
  T extends {
    readonly elements: readonly LayoutElement[]
    readonly beams: readonly PlacedLine[]
    readonly melismaLines: readonly PlacedLine[]
  } & StaffFurniture,
>(parts: readonly T[], strict: boolean): T[] {
  const isLyric = (t: PlacedText): boolean => t.role === 'lyric'
  if (!parts.some((p) => p.elements.some((el) => el.texts.some(isLyric)))) return [...parts]
  // THE ANCHOR IS THE SAME INK THE RESERVE IS TAKEN FROM, and it has to be the SAME
  // NUMBER, not a second measurement of it. abcjs runs both off one value — `staff.bottom`
  // at `set-upper-and-lower-elements.js:51`, before the lyric, chord and dynamic lanes and
  // before the `TieElem` push: it draws at that ink (`:244`) and subtracts from it (`:54`).
  //
  // Measuring it again here drifted, because this call passed a hand-picked subset of the
  // furniture — no tuplet boxes — and applied lanes the lyric phase has not reached yet.
  // Probed on `little swallow`, abcjs subtracts a flat 11.1265 pitch from all five staves,
  // where we subtracted 11.13 / 11.13 / 10.63 / 11.13 / 9.17: the two that drifted are the
  // two carrying the most furniture. So take `inkBottom` from `verticalExtent` itself.
  //
  // The top-text block still goes: it is not music, and it has not been moved into place
  // yet, so a four-row heading measured as ink 96px BELOW the staff and dragged the lyrics
  // after it. The lyrics themselves need no stripping — `verticalExtent` routes a lyric
  // text to `lyricBottom` and never to the ink.
  const inkBottom = verticalExtent(
    parts.flatMap((p) => p.elements.filter((el) => el.type !== 'title')),
    parts.flatMap((p) => p.beams),
    strict,
    {
      tupletReserves: parts.flatMap((p) => p.tupletReserves ?? []),
      tupletLines: parts.flatMap((p) => p.tupletLines ?? []),
      tupletTexts: parts.flatMap((p) => p.tupletTexts ?? []),
      voltaLines: parts.flatMap((p) => p.voltaLines ?? []),
      voltaTexts: parts.flatMap((p) => p.voltaTexts ?? []),
    },
  ).inkBottom
  const written = stepToY(ENGRAVE.lyricStep)
  return parts.map((part, voiceIndex) => {
    const shift = inkBottom + ENGRAVE.lyricInkGap + voiceIndex * ENGRAVE.lyricVoiceStep - written
    return {
      ...part,
      elements: part.elements.map((el) =>
        el.texts.some(isLyric)
          ? { ...el, texts: el.texts.map((t) => (isLyric(t) ? { ...t, y: t.y + shift } : t)) }
          : el,
      ),
      melismaLines: part.melismaLines.map((line) =>
        line.role === 'lyric' ? { ...line, y1: line.y1 + shift, y2: line.y2 + shift } : line,
      ),
    }
  })
}

/**
 * Stack the above-staff furniture on the staff's music, once its voices are known.
 *
 * The mirror of `anchorLyrics`, and the same lesson from the other side: abcjs does NOT
 * hold a chord symbol, a part label and a tempo mark at three fixed distances from the
 * staff. It stacks them on the music's own ink top, each reserving its rendered height
 * plus a one-pitch margin and then drawing at the top it reserved
 * (`set-upper-and-lower-elements.js:31-49`, `incTop`). A tune carrying all three sits
 * ~19.5 pitch lower than one carrying only a chord — which fixed lanes, topping out at
 * whichever lane is furthest out, cannot express: `full-song-template` reserved ~53px
 * where abcjs reserves ~75, and its whole drawing rode 22px high as a result.
 *
 * MEASURED off abcjs's own SVG before it was modelled, per this repo's iron rule. In
 * `full-song-template`'s golden the chord baseline sits 6.7187 pitch below the part
 * baseline — `partHeightAbove` 5.71871 + 1 margin, exactly — and the part 7.0013 below
 * the tempo, `tempoHeightAbove` 6 + 1. Both within the goldens' two-decimal rounding,
 * and the resolved chord pitch lands on 19.504 against a predicted 19.5037.
 *
 * Order is abcjs's, innermost first: chord, part, tempo. Its `endingHeightAbove` and the
 * dynamics pair sit between chord and part; both are reserved elsewhere — the ending as a
 * fixed lane in `verticalExtent`, dynamics in their own — and neither shares a staff with
 * this stack anywhere in the corpus.
 *
 * Each item is drawn one FONT SIZE below the top it reserved, which is abcjs's universal
 * text rule (`text.js:30-31`), plus the tempo's own 2px bump (`draw/tempo.js:15`).
 */
function anchorAboveStaff<
  T extends {
    readonly elements: readonly LayoutElement[]
    readonly beams: readonly PlacedLine[]
  } & StaffFurniture,
>(parts: readonly T[], strict: boolean, partsBox = false): T[] {
  const isChord = (t: PlacedText): boolean => t.role === 'chord'
  /**
   * How many non-empty tspans the golden generator sees in this chord — 1 plus one for
   * each of the modifier and the bass note (`svg.js:198-211`). The outer tspan's
   * `textContent` gathers its children, so it counts whenever the chord is not empty.
   */
  const jazzTspans = (t: PlacedText): number =>
    t.jazz === undefined ? 1 : 1 + (t.jazz[1] === '' ? 0 : 1) + (t.jazz[2] === '' ? 0 : 1)
  const has = (fn: (el: LayoutElement) => boolean) => parts.some((p) => p.elements.some(fn))
  const chords = has((el) => el.texts.some(isChord))
  const partLabels = has((el) => el.type === 'part')
  const tempos = has((el) => el.type === 'tempo')
  if (!chords && !partLabels && !tempos) return [...parts]

  // The MUSIC's ink — the stack itself taken out, or each item would reserve room above
  // the lane the previous one is still sitting in and the staff would grow every pass.
  // The top-text block goes too: it is not music and has not been placed yet.
  const inkTop = verticalExtent(
    parts.flatMap((p) =>
      p.elements
        .filter((el) => el.type !== 'title' && el.type !== 'part' && el.type !== 'tempo')
        .map((el) => ({ ...el, texts: el.texts.filter((t) => !isChord(t)) })),
    ),
    parts.flatMap((p) => p.beams),
    strict,
    {
      tupletLines: parts.flatMap((p) => p.tupletLines ?? []),
      tupletTexts: parts.flatMap((p) => p.tupletTexts ?? []),
      // NO VOLTA AND NO TUPLET LANE HERE — the ENDING lane is spent ONCE, at the end of
      // the outer `verticalExtent`, and this call exists only to find the ink the stack
      // sits on. The volta lines were in it and the tuplet's flag was not, so the two
      // calls disagreed about what the lane already held: a volta arriving beside a
      // tuplet jumped this number by the FULL 6 pitch where abcjs moves 1. That was
      // 23.25px and all of `mouse-click-01`'s first staff.
      //
      // ponytail: so a tempo mark over a staff that also has a volta is DRAWN inside the
      // ending lane rather than above it — abcjs's order is ending, part, tempo
      // (`set-upper-and-lower-elements.js:33-49`) and ours reserves the tempo from the
      // ink. The staff's total is right either way, because the lane goes on last; only
      // the mark's own y differs, and no gate here can see it. Fixing it properly means
      // moving the ending lane into `anchorAboveStaff`'s stack, which is where every
      // other lane already lives.
      voltaLines: [],
      voltaTexts: [],
      // A TUPLET'S DECLARED BOX IS INK AND BELONGS HERE. `layoutVoice` calls
      // `voice.adjustRange` on every `TripletElem` (`layout/voice.js:19-23`) BEFORE
      // `setUpperAndLowerElements` runs, so abcjs's chord lane sits on top of the bracket
      // like any other ink. Leaving it out put the lane under the bracket, and the outer
      // pass then took the bracket instead — 0.779 pitch, `chordHeightAbove` minus the
      // tuplet lane, on every staff carrying both.
      tupletReserves: parts.flatMap((p) => p.tupletReserves ?? []),
    },
  ).top

  // y is DOWN, so reserving room above walks it negative.
  let top = inkTop
  const reserve = (height: number): number => {
    top -= height + ENGRAVE.aboveStackMargin
    return top
  }
  // ── CHORD SYMBOLS AND ANNOTATIONS SHARE A LANE, AND THE LANE COUNT IS PACKED ─
  //
  // `setLaneForChord` (`layout/voice.js:70-101`) walks a voice's items left to right and
  // drops each into the FIRST lane whose right edge clears its left one, opening a new
  // lane when none does — so two marks that would touch stack, and two that would not sit
  // side by side in lane 0. `placeInLane` is that loop; the count comes back as
  // `staff.specialY.chordLines.above` and MULTIPLIES the reserve through `incTop`'s
  // `count` argument.
  //
  // The reserve is `chordHeightAbove * lanes + margin`, and the height in that product is
  // the PLAIN measured one. `putChordInLane` does rewrite an item's own
  // `chordHeightAbove` to `height * 1.25 * lane`, but that happens in `layoutVoice`, long
  // after `setLimit` fixed the staff's `specialY` at engrave time — so the rewrite never
  // reaches the reserve. Probed rather than read: `stacked-annotations` reports
  // `chordHeightAbove: 4.7794` with `chordLines.above: 2`, not the 5.97 the rewrite would
  // give. Reading the source alone gets this wrong twice over.
  //
  // `draw/text.js:13-15` then offsets each lane DOWN from the top of the block by
  // `fontSize * 1.25`, so lane 0 is the topmost and the item packed FIRST is drawn
  // highest.
  //
  // NOT what `setLane`'s `invertLane` reads as it does, and the SVG settles it: abcjs
  // draws `"^Allegro""^con brio"` with Allegro at y 79.12 and con brio at 99.12, exactly
  // one `fontSize * 1.25` apart, first-written on top. Composing `invertLane` with the
  // draw offset predicts the opposite. Measure the output before trusting a chain of
  // three source reads.
  const laneOf = new Map<PlacedText, number>()
  let chordLanes = 1
  for (const part of parts) {
    // Per VOICE, as abcjs runs it — and the staff keeps the LAST voice's count, because
    // `voice.staff.specialY.chordLines = setLaneForChord(...)` assigns rather than maxes.
    const rightMost: number[] = [0]
    const marks: PlacedText[] = []
    for (const el of part.elements) for (const t of el.texts) if (isChord(t)) marks.push(t)
    for (const t of marks) {
      const left = t.x
      const right = left + markWidth(t.text, t.size, t.box === true)
      const lane = rightMost.findIndex((edge) => edge < left)
      if (lane >= 0) {
        rightMost[lane] = right
        laneOf.set(t, lane)
      } else {
        rightMost.push(right)
        laneOf.set(t, rightMost.length - 1)
      }
    }
    if (marks.length > 0) chordLanes = rightMost.length
  }
  // THE LANE IS AS TALL AS THE FONT. `RelativeElement` takes `chordHeightAbove` straight
  // from the text's measured height (`relative-element.js:60`), so `%%gchordfont Arial 80`
  // reserves five times what the 12pt default does. The constant here IS the default's
  // height, so scaling by the ratio of sizes is the same number wherever nothing changed.
  // THE TALLEST CHORD ON THE STAFF SETS THE LANE — `setLimit`'s `Math.max` over the
  // voice's `chordHeightAbove`, which `RelativeElement` takes straight from the text's
  // MEASURED height (`relative-element.js:60`). Three terms go into that measure and all
  // three are the golden generator's:
  //
  //   • the height for the size, from its table with `size + 2` for anything unlisted —
  //     so `%%gchordfont Arial 80` resolves to 107px and reserves 109, not 80 x a ratio;
  //   • one whole LINE per extra nested tspan, which is what `%%jazzchords` costs
  //     (`dump-svg.js:120-124`);
  //   • `padding * 4` for a BOXED font, `padding = size * fontboxpadding`
  //     (`get-text-size.js:46-48`) — `visual-tablature-17` boxes five of them.
  const chordHeightOf = (t: PlacedText): number =>
    goldenTextHeight(t.size) +
    (jazzTspans(t) - 1) * t.size * ENGRAVE.textLineStep +
    (t.box === true ? t.size * ENGRAVE.fontBoxPadding * 4 : 0)
  const chordTexts = parts.flatMap((p) => p.elements.flatMap((el) => el.texts.filter(isChord)))
  const chordSize = Math.max(ENGRAVE.chordTextSize, ...chordTexts.map((t) => t.size))
  const chordBlock =
    Math.max(ENGRAVE.chordHeightAbove, ...chordTexts.map(chordHeightOf)) * chordLanes
  const chordY = chords ? reserve(chordBlock) + chordSize : null

  // A BOXED PART LABEL MEASURES TALLER, so its whole lane grows: `getTextSize` returns
  // `height + padding * 4` for a boxed font (`helpers/get-text-size.js:46-48`), and
  // `padding` is `font.size * fontboxpadding`, default 0.1 (`get-font-and-attr.js:35-36`).
  // Probed on `frere-jacques`: `partHeightAbove` is 5.7187 pitch without `%%partsbox` and
  // 7.7832 with it — 8px on a 20px font, which is exactly `padding * 4`.
  //
  // …AND THE HEIGHT IS `partsfont`'s, not a constant. `RelativeElement` takes
  // `partHeightAbove` from the measured text like every other lane
  // (`relative-element.js:77`), so `%%partsfont sans-serif 29 box` reserves 26.45px more
  // than the 15pt default. The default resolves to exactly the constant this replaces.
  // The BOX comes from `partsBox`, not from `fontHeightOf`: `%%partsbox` sets it without
  // touching the font at all, so the padding is added here and `goldenTextHeight` is asked
  // for the bare height. Using `fontHeightOf` counted the box twice for `%%partsfont …
  // box` and not at all for `%%partsbox` — 15.6px each way.
  const partSize = fontSizeOf('partsfont')
  const boxPad = partsBox ? partSize * ENGRAVE.fontBoxPadding : 0
  const partY = partLabels
    ? reserve(goldenTextHeight(partSize) + boxPad * 4) + partSize + boxPad
    : null
  const tempoY = tempos
    ? reserve(ENGRAVE.tempoHeightAbove) + ENGRAVE.tempoTextSize + ENGRAVE.tempoDescenderBump
    : null

  // A uniform shift per item, so a tempo mark's beat-unit glyph and its stem ride along
  // with the `= 120` they belong to rather than being re-derived.
  const shiftBy = (el: LayoutElement, shift: number): LayoutElement => ({
    ...el,
    glyphs: el.glyphs.map((g) => ({ ...g, y: g.y + shift })),
    lines: el.lines.map((l) => ({ ...l, y1: l.y1 + shift, y2: l.y2 + shift })),
    texts: el.texts.map((t) => ({ ...t, y: t.y + shift })),
  })

  /** A chord or annotation is placed ABSOLUTELY in its lane, not shifted from where it
   * was drawn: the two kinds start from different steps, so one shift cannot serve both. */
  const chordAt = (t: PlacedText): number =>
    (chordY ?? 0) + (laneOf.get(t) ?? 0) * ENGRAVE.chordTextSize * 1.25
  const partShift = partY === null ? 0 : partY - stepToY(ENGRAVE.partStep)
  const tempoShift = tempoY === null ? 0 : tempoY - stepToY(ENGRAVE.tempoStep)

  return parts.map((part) => ({
    ...part,
    aboveStackPlaced: true,
    chordLaneAbove: chords,
    elements: part.elements.map((el) => {
      if (el.type === 'part') {
        const moved = shiftBy(el, partShift)
        return partsBox ? { ...moved, lines: [...moved.lines, ...partBox(moved)] } : moved
      }
      if (el.type === 'tempo') return shiftBy(el, tempoShift)
      if (!el.texts.some(isChord)) return el
      return {
        ...el,
        texts: el.texts.map((t) => (isChord(t) ? { ...t, y: chordAt(t) } : t)),
      }
    }),
  }))
}

/**
 * The four rules `%%partsbox` draws round a `P:` label.
 *
 * `renderText` emits `rect({ x: params.x - delta, y, width: size.width + padding * 2,
 * height: size.height + padding * 2 })` (`draw/text.js:81`) — so the box is the MEASURED
 * text plus one padding a side, where the reserved LANE is the text plus TWO. The
 * baseline sits one font size below the box's top plus that same padding.
 *
 * ponytail: abcjs rounds all four to whole pixels; we do not, so an edge can land half a
 * pixel off its. Sub-pixel, and rounding here would put a px-space conversion in geometry
 * that is otherwise in staff spaces throughout.
 */
function partBox(el: LayoutElement): PlacedLine[] {
  const t = el.texts[0]
  if (t === undefined) return []
  const pad = t.size * ENGRAVE.fontBoxPadding
  const left = t.x - pad
  const top = t.y - t.size - pad
  const right = left + textWidth(t.text, t.size) + pad * 2
  const bottom = top + ENGRAVE.partHeightAbove + pad * 2
  const w = ENGRAVE.fontBoxRule
  return [
    { x1: left, y1: top, x2: right, y2: top, thickness: w },
    { x1: left, y1: bottom, x2: right, y2: bottom, thickness: w },
    { x1: left, y1: top, x2: left, y2: bottom, thickness: w },
    { x1: right, y1: top, x2: right, y2: bottom, thickness: w },
  ]
}

/**
 * Hang the below-staff dynamics and hairpins off the staff's music, once its voices are
 * known — the third and last of these passes, after `anchorLyrics` and `anchorAboveStaff`.
 *
 * abcjs draws a `!mf!` or a hairpin at the staff's bottom AS IT STANDS when the below chain
 * reaches them, then subtracts their height plus a margin from it
 * (`set-upper-and-lower-elements.js:63-71`). So the mark sits on the music's ink and the
 * room is a flat lane past it — where we had a fixed lane for both, which gets the mark
 * wrong on any staff whose music does not happen to end where the lane sits.
 *
 * The chain is lyric, then chord, then volume/dynamic, so dynamics belong BELOW lyrics. No
 * corpus tune has both: abcjs puts dynamics ABOVE whenever the tune sings (`hasVocals`,
 * `decoration.js:379`), so a staff with lyrics never reaches this. Anchoring on the music
 * ink alone is therefore exact here — and would need the lyric block added first if that
 * ever changed.
 */
function anchorBelowStaff<
  T extends {
    readonly elements: readonly LayoutElement[]
    readonly beams: readonly PlacedLine[]
    readonly spannerLines: readonly PlacedLine[]
  } & StaffFurniture,
>(parts: readonly T[], strict: boolean): T[] {
  const isDyn = (r: PartRole | undefined, y: number): boolean => r === 'dynamic' && y > 0
  const present =
    parts.some((p) => p.elements.some((el) => el.glyphs.some((g) => isDyn(g.role, g.y)))) ||
    parts.some((p) => p.spannerLines.some((l) => isDyn(l.role, l.y1)))
  if (!present) return [...parts]

  // The MUSIC's ink, with the dynamics themselves taken out — `verticalExtent` already
  // skips them, so this is just the staff's own bottom before the lane is added.
  const inkBottom =
    verticalExtent(
      parts.flatMap((p) => p.elements),
      parts.flatMap((p) => p.beams),
      strict,
      {
        tupletLines: parts.flatMap((p) => p.tupletLines ?? []),
        tupletTexts: parts.flatMap((p) => p.tupletTexts ?? []),
        voltaLines: parts.flatMap((p) => p.voltaLines ?? []),
        voltaTexts: parts.flatMap((p) => p.voltaTexts ?? []),
      },
    ).bottom -
    ENGRAVE.dynamicBelowReserve * ENGRAVE.spacePerStep

  const shift = inkBottom - stepToY(ENGRAVE.dynamicBelowStep)
  const moveLine = (l: PlacedLine): PlacedLine =>
    isDyn(l.role, l.y1) ? { ...l, y1: l.y1 + shift, y2: l.y2 + shift } : l
  return parts.map((part) => ({
    ...part,
    elements: part.elements.map((el) =>
      el.glyphs.some((g) => isDyn(g.role, g.y))
        ? {
            ...el,
            glyphs: el.glyphs.map((g) => (isDyn(g.role, g.y) ? { ...g, y: g.y + shift } : g)),
          }
        : el,
    ),
    spannerLines: part.spannerLines.map(moveLine),
  }))
}

interface StaffFurniture {
  /**
   * A hairpin somewhere on this staff, taken from the EVENTS rather than from the drawn
   * lines — see the note where it is consumed.
   */
  readonly hasHairpin?: boolean
  /** Which side the dynamics lane is on — hairpins share it. */
  readonly dynamicsAbove?: boolean
  /**
   * `anchorAboveStaff` HAS ALREADY SPENT THE ABOVE-STAFF LANES on this staff.
   *
   * Each lane is spent ONCE in abcjs — `setUpperAndLowerElements` walks `staff.top` up
   * through lyric, chord, ending, dynamic, part and tempo in that order and every element
   * it places is measured from the total. `anchorAboveStaff` reproduces that stack, and
   * the element it places already sits above the lanes; re-deriving them here adds them a
   * second time on top of it. Probed on `mouse-click-01`: adding a `w:` line flips the
   * dynamics above and cost us 54.25px where abcjs spends 27.13 — exactly twice.
   */
  readonly aboveStackPlaced?: boolean
  /**
   * Whether `anchorAboveStaff` reserved a CHORD lane on this staff — which changes what
   * the ENDING lane after it costs. See `verticalExtent`.
   */
  readonly chordLaneAbove?: boolean
  /** abcjs's `endingHeightAbove` from a tuplet — see `layoutTuplets`. Never below. */
  readonly tupletReservesAbove?: boolean
  /** abcjs's declared box per tuplet — NOT the bracket's drawn lines. */
  readonly tupletReserves?: readonly { top: number; bottom: number }[]
  /** abcjs's declared box per tie and slur, applied AFTER the lanes. */
  readonly curveReserves?: readonly { top: number; bottom: number }[]
  readonly tupletLines?: readonly PlacedLine[]
  readonly tupletTexts?: readonly PlacedText[]
  readonly voltaLines?: readonly PlacedLine[]
  readonly voltaTexts?: readonly PlacedText[]
  readonly melismaLines?: readonly PlacedLine[]
  readonly spannerLines?: readonly PlacedLine[]
}

/**
 * WHO SET THIS STAFF'S EXTENT — the probe that named the beam, the volta lane and the
 * curve box, each in one run. `ABCTS_PROBE=1` makes the staff-origin call in the stacking
 * loop print its own `top`/`bottom` in abcjs PITCH (`6 - 2 * y`) beside the source line
 * that last raised each, ready to sit next to abcjs's `staff.top`/`.bottom`.
 *
 * Read ours from the STACKING LOOP and not from in here: `verticalExtent` also runs for
 * the top-text block, and mixing the two scrambles the staff order.
 */

const PROBE = process.env.ABCTS_PROBE !== undefined
/** Item probes fire only on the SOLVED pass — the solve runs `lineAt` up to eight times. */
let probeFinalPass = false
let probeTop = ''
let probeBottom = ''
let probeFlags = ''

function verticalExtent(
  elements: readonly LayoutElement[],
  beams: readonly PlacedLine[] = [],
  strict = true,
  furniture: StaffFurniture = {},
): { top: number; bottom: number; inkBottom: number } {
  // The staff itself is always present, spanning steps 4 to -4.
  let top = stepToY(4)
  let bottom = stepToY(-4)
  const include = (a: number, b: number) => {
    if (PROBE) {
      const who = (new Error().stack ?? '')
        .split('\n')[2]
        ?.trim()
        .replace(/.*layout\.ts:/, 'L')
      if (a < top) probeTop = `${who} ${a.toFixed(4)}`
      if (b > bottom) probeBottom = `${who} ${b.toFixed(4)}`
    }
    top = Math.min(top, a)
    bottom = Math.max(bottom, b)
  }
  // Tuplet brackets and volta endings reserve a FIXED LANE beyond the top (or bottom) NOTE,
  // not their drawn geometry. abcjs adds `endingHeightAbove` (`set-upper-and-lower-
  // elements.js`) — 4 pitch + 1 margin = 5 pitch — ABOVE `staff.top`, which is the highest
  // note; the bracket and its number are then drawn where they go and OVERHANG that lane,
  // exactly as a down-stem overhangs below. Its element dump proves it: `staff.top` for
  // `multi-voice-triplet-brackets` is the highest note (26.0) with `endingHeightAbove: 4`,
  // not the bracket that sits well above it. So these are gathered as ABOVE/BELOW flags and
  // the lane is applied after the note extent is known; their real y is ignored here.
  /** `endingHeightAbove` in PITCH — 0 for none, 4 for a tuplet, 5 for a volta. */
  let endingAbove = 0
  let endingBelow = 0
  /** Any dynamic or hairpin on the BELOW side, which reserves a flat lane past the ink. */
  let sawDynamicBelow = false
  /**
   * The same on the ABOVE side, which kept its own drawn box until now.
   *
   * abcjs reserves a FLAT lane there too: `DynamicDecoration` sets `volumeHeightAbove = 6`
   * and `CrescendoElem` `dynamicHeightAbove = 6`, and when both are present
   * `set-upper-and-lower-elements.js:39-42` adds `max(...) + margin` — 7 pitch — above the
   * staff's ink without going through `incTop` at all. Probed on
   * `multi-voice-lyrics-two-voices`: its ink tops out at 21.993 on a note and `staff.top`
   * lands at 28.993, exactly 7 higher, with no lane logged. Measuring the `p` glyph's own
   * box instead left both its staves 1.30 pitch short.
   */
  let sawDynamicAbove = false
  // A HAIRPIN RESERVES THE DYNAMICS LANE LIKE ANY OTHER DYNAMIC, and it has to be taken
  // from the music rather than from `spannerLines`: hairpins can span a system break, so
  // they are resolved after packing and that array is still empty here. abcjs reserves for
  // them all the same (`CrescendoElem.dynamicHeightAbove`, `crescendo-element.js:9`).
  // Probed on `ragtime-nightingale`, whose `!<(!` staves read `staff.bottom = -20.000`
  // against our -13.000 — a flat 7 pitch, exactly the lane.
  if (furniture.hasHairpin === true) {
    if (furniture.dynamicsAbove === true) sawDynamicAbove = true
    else sawDynamicBelow = true
  }
  const flag = (y: number) => {
    if (y < 0) endingAbove = Math.max(endingAbove, ENGRAVE.voltaLane)
    else endingBelow = Math.max(endingBelow, ENGRAVE.voltaLane)
  }
  // A TUPLET COUNTS TWICE: its BRACKET'S INK, and then the lane ON TOP OF THAT.
  //
  // `layoutVoice` calls `voice.adjustRange(child)` on every `TripletElem` (`layout/voice.js:19-23`),
  // so the drawn bracket enters the staff's range like any other ink — and THEN
  // `setUpperAndLowerElements` adds `endingHeightAbove + margin` above the result. Probed on
  // `multi-voice-rest-collision`, the chain is explicit: clef 13.7244 -> a note 13.9879 ->
  // TripletElem 17.5929 -> +5 = 22.5929.
  //
  // We reserved the lane and ignored the ink, on the reading that `multi-voice-triplet-brackets`
  // has `staff.top` at its highest NOTE rather than at its bracket. That is true there and it
  // is not the rule — the bracket simply did not out-reach the notes in that fixture. Here it
  // does, by 3.59 pitch, and that was the whole of that fixture's 13.93px offset.
  //
  // A VOLTA is NOT the same: `EndingElem` goes through the `otherchildren` switch, which sets
  // its top from the lane it was given and never adjusts the staff's range by its ink.
  if (furniture.tupletReservesAbove === true)
    endingAbove = Math.max(endingAbove, ENGRAVE.tupletLane)
  for (const r of furniture.tupletReserves ?? []) include(r.top, r.bottom)
  for (const line of furniture.voltaLines ?? []) flag((line.y1 + line.y2) / 2)
  for (const t of furniture.voltaTexts ?? []) flag(t.y)
  // Melisma extenders and hairpins/glissandi keep their actual geometry — they sit in the
  // lyric and dynamic lanes, not the ending lane.
  for (const line of [...(furniture.melismaLines ?? []), ...(furniture.spannerLines ?? [])]) {
    // A HAIRPIN arrives here, not on an element, because it resolves after packing — and it
    // reserves abcjs's flat `dynamicHeightBelow + margin` lane like any dynamic
    // (`crescendo-element.js:11`), never its own drawn box. Instrumenting abcjs's own
    // `specialY` per staff showed 4 of ragtime's 46 reserve on a hairpin with no `!mf!`
    // beside it, and those are exactly the staves whose `lastBottomLine` ran 7.00 pitch
    // short of abcjs's at the system boundary below them.
    if (line.role === 'dynamic' && line.y1 > 0) {
      sawDynamicBelow = true
      continue
    }
    const half = line.thickness / 2
    include(Math.min(line.y1, line.y2) - half, Math.max(line.y1, line.y2) + half)
  }

  // A BEAM DOES NOT COUNT TOWARD THE STAFF'S EXTENT. A `BeamElem` lives in
  // `voice.otherchildren`, and `setUpperAndLowerVoiceElements` switches only on
  // Crescendo, Dynamic, Ending and Tie — a beam is none of those, so abcjs never adds one.
  // The STEMS carry it instead: they end on the beam, and their endpoints are in the range.
  //
  // Ours added half a beam thickness past the stem tip — a flat 0.50 pitch — which is
  // exactly the `dBot = -0.50` that sat on 23 of `ragtime-nightingale`'s 46 staves.
  // ponytail: the loop is gone rather than guarded, since nothing else read it.

  /** LOWEST lyric baseline on the staff — the last verse of the lowest-offset voice. */
  let lyricBottom = Number.NEGATIVE_INFINITY

  for (const el of elements) {
    // A TEMPO MARK RESERVES A FLAT 6 PITCHES, not its ink.
    //
    // abcjs's `TempoElement` sets `totalHeightInPitches = 6` and `tempoHeightAbove` to the
    // same 6 (`creation/elements/tempo-element.js:12-13`) — a constant, whatever the mark
    // says and however far the beat-unit note's stem reaches above it. The staff's top then
    // becomes exactly the point that reserve started from (`set-upper-and-lower-elements.js:206`).
    //
    // Ours measured the drawn mark instead, and its little up-stem stuck 6.9px past the
    // reserve. That is a rigid shift of the whole drawing: every fixture with a `Q:` — six
    // of them — sat 6.89 to 6.94px below abcjs on EVERY staff, with their staff-to-staff
    // spacing already exact.
    //
    // The baseline is one font size plus abcjs's 2px bump below the top it reserved, which
    // is how `anchorAboveStaff` placed it, so reading the box back off the baseline gets
    // the reserve without threading it through.
    if (el.type === 'tempo' && el.texts.length > 0) {
      const baseline = Math.min(...el.texts.map((t) => t.y))
      const declaredTop = baseline - ENGRAVE.tempoTextSize - ENGRAVE.tempoDescenderBump
      include(declaredTop, declaredTop + ENGRAVE.tempoHeightAbove)
      continue
    }
    for (const g of el.glyphs) {
      // The ACTIVE table's box: abcjs's clef reaches 4.84 staff spaces above its origin
      // where Bravura's reaches 4.39, and that difference is space reserved above the
      // staff — visible as the last of the vertical offset on a title-only tune.
      // Only the BELOW side is re-anchored and lane-reserved. An ABOVE dynamic keeps its
      // own box in the ink scan, which is what it had before and what its fixtures expect.
      if (g.role === 'dynamic') {
        if (g.y > 0) sawDynamicBelow = true
        else sawDynamicAbove = true
        continue
      }
      if (g.reserve !== undefined) {
        include(g.reserve[0], g.reserve[1])
        continue
      }
      const glyph = glyphsFor(strict).get(g.name) ?? GLYPHS[g.name]
      include(g.y + glyph.y, g.y + glyph.y + glyph.height)
    }
    for (const line of el.lines) {
      const half = line.thickness / 2
      // A STEM reserves one step below its low end — `bottom: p1 - 1` on the stem's
      // RelativeElement (`abstract-engraver.js:762`), `p1` being the low pitch. On an
      // up-stem that end is at the notehead and the head's own box swallows it; on a
      // down-stem it binds, and it is a uniform 3.4px our staff bottoms ran short of
      // abcjs's on every staff whose lowest thing is a down-stem.
      // Dynamics reserve a flat lane below the ink, applied after this scan — see
      // `dynamicBelowReserve`. Their own geometry must not push the ink they hang off.
      if (line.role === 'dynamic' && line.y1 > 0) {
        sawDynamicBelow = true
        continue
      }
      // A STEM RESERVES ITS ENDPOINTS, NOT ITS PAINTED BOX, and only an UNBEAMED one
      // reserves the extra pitch below. abcjs's stem `RelativeElement` takes `top`/`bottom`
      // from `pitch`/`pitch2` and never widens them by the line's thickness; the unbeamed
      // one adds `bottom: p1 - 1` (`abstract-engraver.js:762`), the beamed one — built in
      // `layout/beam.js:135-140` — passes no `bottom` at all. Measured against abcjs's own
      // post-mutation `staff.bottom`, ours ran 1.12 pitch too deep, which is exactly this
      // reserve (1) plus half a stem thickness (0.12).
      if (line.role === 'stem') {
        const low = Math.max(line.y1, line.y2)
        include(Math.min(line.y1, line.y2), low + (line.beamed === true ? 0 : ENGRAVE.spacePerStep))
        continue
      }
      // A LINE RESERVES ITS ENDPOINTS AND NOT ITS PAINTED WIDTH. `RelativeElement` widens
      // `top`/`bottom` by `thickness / 2` only when a `thickness` is PASSED, and the only
      // things that pass one are glyphs declaring their own height in pitches — noteheads,
      // decorations, key and time signatures (`relative-element.js:22-24`). A barline
      // never does: probed, abcjs's is `bar@2..10`, flush with the staff.
      //
      // Ours widened every line by half its stroke, and on a bass-clef staff whose top is
      // the staff line itself that put the whole drawing 0.62px low — the barline's 0.16
      // stroke, half of it, reaching 0.16 pitch above the top line.
      include(Math.min(line.y1, line.y2), Math.max(line.y1, line.y2))
    }
    // No text metrics available, so bound the box by the font size: ascenders reach
    // roughly 0.8 of it above the baseline and descenders 0.25 below.
    for (const t of el.texts) {
      if (t.role === 'lyric') {
        lyricBottom = Math.max(lyricBottom, t.y)
        continue
      }
      // OUT-OF-STAFF TEXT RESERVES ABCJS'S WAY: a full font size above the baseline and
      // the rest of the rendered height below it. abcjs stacks such a text on the staff's
      // ink (`incTop`) reserving `height + margin`, and draws its baseline one font size
      // below the top it reserved (`text.js:30-31`) — so the box is exactly
      // [y - size, y + (height - size)], and `textHeightRatio - 1` is that remainder.
      //
      // The 0.8/0.25 estimate is kept for the TITLE block, where it was measured and where
      // raising the ascent to 1.0 is recorded as moving every drawing 3.7px down.
      if (t.reserve !== undefined) {
        include(t.reserve[0], t.reserve[1])
        continue
      }
      const ascent = el.type === 'title' ? TEXT_ASCENT : 1
      const descent = el.type === 'title' ? TEXT_DESCENT : ENGRAVE.textHeightRatio - 1
      include(t.y - t.size * ascent, t.y + t.size * descent)
    }
    // A block reserves from its own top, not from its first line's ascender.
    if (el.blockTop !== undefined) include(el.blockTop, el.blockTop)
  }

  // A LYRIC BLOCK RESERVES ITS OWN HEIGHT PLUS ONE PITCH STEP, measured from the LAST
  // verse's baseline rather than from the drawn box — our vocal font is not abcjs's, and
  // what has to match is the room taken, not the ink.
  //
  // abcjs subtracts `lyricHeightBelow + margin` from the staff bottom (`:52-55`), where
  // `lyricHeightBelow` is `18.84 + (verses - 1) x 20.4` — the multi-line `getBBox` its own
  // golden generator measures with. Since verse n sits `(n - 1) x 20.4` below verse 1 and
  // the k-th voice's block another `k x 18.84` below that, the LOWEST baseline already
  // carries both, and everything reduces to one constant below it:
  //
  //     18.84 + 3.875 - 17  =  5.715px
  //
  // Verified against abcjs's own output on three shapes: one verse one voice
  // (`ave-verum` staff 0, 22.715px below the ink), one verse SECOND voice (staff 1,
  // 41.55px), two verses first voice (`little swallow`, 43.115px). Reproducing its
  // arithmetic over the goldens takes `full-song-template` to 0.00px of residual.
  //
  // NOT one line whatever the verse count, which is what the `.elements.json` dump says:
  // that dump's `getBBox` stub returns a single line's height where the SVG generator's
  // measures every tspan (`dump-svg.js:120-124`). The dump is the wrong oracle for this
  // one field, and believing it cost `little swallow` 19px a system.
  /**
   * The ink the lyric block hangs from and is subtracted from — abcjs's `staff.bottom` at
   * `set-upper-and-lower-elements.js:51`, before the lyric, chord and dynamic lanes and
   * before the `TieElem` push. `anchorLyrics` reads this rather than measuring its own.
   */
  const inkBottom = bottom
  if (Number.isFinite(lyricBottom)) {
    bottom = Math.max(
      bottom,
      lyricBottom + ENGRAVE.lyricVoiceStep + ENGRAVE.spacePerStep - ENGRAVE.lyricInkGap,
    )
  }

  // Apply the tuplet/volta ending lane now that `top`/`bottom` are the NOTE extent: a fixed
  // `endingHeightAbove + 1` beyond the note on whichever side an ending sits, never
  // the bracket's real height. See the ABOVE/BELOW gather at the top of this function.
  // Dynamics: a flat lane past the music, never their own drawn box.
  // ponytail: a staff whose only below-dynamic is a HAIRPIN reserves nothing, because
  // hairpins resolve after packing and `spannerLines` is still empty here. abcjs does
  // reserve for them (`dynamicHeightBelow`, `crescendo-element.js:11`). Taking presence
  // from the model instead was tried and made the corpus much worse — see the checkpoint.
  if (PROBE)
    probeFlags =
      `dynBelow=${sawDynamicBelow} dynAbove=${sawDynamicAbove}` +
      ` endAbove=${endingAbove} endBelow=${endingBelow}` +
      ` tuplets=${(furniture.tupletReserves ?? []).length}` +
      ` curves=${(furniture.curveReserves ?? []).length}`
  // The ABOVE lanes are skipped once something has been placed on top of them — see
  // `aboveStackPlaced`. `hasBlock` is the same rule for the title block, which is placed
  // from a `musicTop` that already carries them.
  const hasBlock = elements.some((el) => el.type === 'title')
  const aboveSpent = hasBlock || furniture.aboveStackPlaced === true
  if (sawDynamicBelow) bottom += ENGRAVE.dynamicBelowReserve * ENGRAVE.spacePerStep
  if (sawDynamicAbove && !aboveSpent) top -= ENGRAVE.dynamicBelowReserve * ENGRAVE.spacePerStep
  // THE LANE EXTENDS THE MUSIC, AND ONLY THE MUSIC — so not on a pass that is measuring a
  // top-text block as well.
  //
  // `verticalExtent` runs twice per staff: once over the music alone, to decide where the
  // title block goes, and once over both, to set the staff's origin. Applying the lane on
  // the second pass adds it to a total that already carries it, because the block was
  // placed `musicSpace` above a `musicTop` that had it. Probed on
  // `vree-slurs-and-triplets`: three applications, the last two both taking -97.46 to
  // -116.84. The block always wins that `min` when it is present — its offset is
  // `musicTop - musicSpace - blockHeight`, which is below `musicTop` by construction — so
  // skipping the lane here cannot change the answer, only stop it being counted twice.
  // The ENDING lane is NOT gated on `aboveStackPlaced`: `anchorAboveStaff`'s ink call
  // deliberately leaves it out (see the `voltaLines: []` note there), so the stack it
  // placed sits BELOW it and this is the one place it is spent. `hasBlock` still gates it,
  // for the title block, which is placed from a `musicTop` that does carry it.
  //
  // AND AN ENDING OVER A CHORD LANE COSTS A FLAT 2 PITCH, margin included:
  //
  //     if (staff.specialY.endingHeightAbove) {
  //       if (staff.specialY.chordHeightAbove) staff.top += 2;
  //       else staff.top += staff.specialY.endingHeightAbove + margin;
  //
  // (`set-upper-and-lower-elements.js:33-38`). Not a scaling and not a max — a different
  // branch, and 2 against a volta's 5 + 1 is four pitch, exactly the 15.49px a ladder of
  // five control tunes put on `"D7"…|1…` and on nothing simpler. A tuplet's lane takes the
  // same branch, since abcjs stores both in the one `endingHeightAbove`.
  const lane = (pitch: number) => (pitch + ENGRAVE.laneMargin) * ENGRAVE.spacePerStep
  if (endingAbove > 0 && !hasBlock)
    top -=
      furniture.chordLaneAbove === true
        ? ENGRAVE.endingOverChordLane * ENGRAVE.spacePerStep
        : lane(endingAbove)
  if (endingBelow > 0 && !hasBlock) bottom += lane(endingBelow)

  // A TIE OR SLUR PUSHES THE LANES' RESULT — IT DOES NOT GO UNDER THEM.
  //
  // `setUpperAndLowerElements` runs every lane onto `staff.top`/`.bottom` FIRST and only
  // then loops the voices, where the `TieElem` case takes `max`/`min` against what the
  // lanes already produced. So a curve that reaches less far than the lane contributes
  // nothing at all, where a tuplet's box — which enters through `layoutVoice`'s
  // `adjustRange`, before any of this — is ink the lane then sits on top of.
  //
  // Counting curves as ink instead put five of `ragtime-nightingale`'s staves 1.2 to 2.6
  // pitch out, always on a staff that also had a lane, and always by the amount the curve
  // poked past the music underneath it.
  for (const r of furniture.curveReserves ?? []) {
    top = Math.min(top, r.top)
    bottom = Math.max(bottom, r.bottom)
  }

  return { top: top - ENGRAVE.marginY, bottom: bottom + ENGRAVE.marginY, inkBottom }
}

function layoutEvent(
  event: MusicEvent,
  x: number,
  clef: Clef,
  spacingScale: number,
  forcedUp: boolean | null = null,
  stemOut: { value: Omit<StemInfo, 'element'> | null } | null = null,
  /** `abcjs-strict` — passed through for microtonal accidentals. */
  strict = true,
  /** Voice convention on a SHARED staff; null lets pitch decide. See `stemForVoice`. */
  voiceStem: boolean | null = null,
  /** Dynamics above the staff when the tune sings, below otherwise. */
  dynamicsAbove = true,
): LayoutElement | null {
  const advance = naturalWidth(event.duration, spacingScale)
  // The beam's direction wins over the voice convention: a beam cannot join opposed stems,
  // and the beam pass already agreed one direction for the whole group.
  const stem = forcedUp ?? voiceStem
  if (event.type === 'note') {
    return layoutNoteheads(
      [event.pitch],
      event.notatedDuration,
      advance,
      x,
      clef,
      stem,
      stemOut,
      event,
      strict,
      dynamicsAbove,
    )
  }
  if (event.type === 'chord') {
    return layoutNoteheads(
      event.pitches,
      event.notatedDuration,
      advance,
      x,
      clef,
      stem,
      stemOut,
      event,
      strict,
      dynamicsAbove,
    )
  }
  return layoutRest(event, advance, x, strict)
}

/**
 * Stem direction for each beam group, decided before anything is drawn.
 *
 * Every stem in a beam must point the same way — a beam cannot join opposed stems — so
 * the decision belongs to the group, not the note. The rule is the usual one: away from
 * the middle line, judged by the note furthest from it, so the beam ends up on the side
 * with the most room.
 */
function beamDirections(
  voice: Voice | undefined,
  clef: Clef,
  /**
   * The direction this VOICE is held to, or null to let each group choose by pitch.
   *
   * A forced voice forces its beams. abcjs has one mechanism for both: `createVoice`
   * appends a `stem` element for a declared `V:… stems=` AND for the shared-staff
   * convention (`parse/tune-builder.js:971-986`), the engraver turns that into
   * `this.stemdir`, and `createBeam` hands it to `BeamElem` as `forceup`/`forcedown`,
   * which `setStemDirection` tests BEFORE the pitch rule (`beam-element.js:74-86`).
   *
   * We had the beam's own choice overriding the voice instead, which is backwards. It is
   * the whole of ragtime's treble: its `V:4`/`V:5` share a staff, so abcjs forces `V:4`
   * up and we let each beam group pick by pitch — 388 up-stems against our 81.
   */
  forced: boolean | null = null,
): Map<number, boolean> {
  // A BEAM'S DIRECTION IS THE MEAN OF ITS NOTES' AVERAGE PITCHES, not its extremes.
  //
  //     this.total = Math.round(this.total + abselem.abcelem.averagepitch)   // per element
  //     this.average = total / elems.length
  //     this.stemsUp = this.average < 6                                       // B, hardcoded
  //
  // (`beam-element.js:54-66,89-98`). The RUNNING TOTAL IS ROUNDED at every add, which only
  // shows on a chord — whose `averagepitch` is fractional — and is reproduced because it is
  // free to.
  //
  // We took whichever EXTREME was further from the middle line, which agrees with the mean
  // on a compact run and disagrees the moment one note is an outlier: `"E"e"F"F"F#"^F"G"G`
  // averages 4.75 and beams UP where its extremes are symmetric about the line and beamed
  // DOWN. That was 16.52px of staff, and all of `visual-transpose-05`.
  const totals = new Map<number, { total: number; count: number }>()
  for (const measure of voice?.measures ?? []) {
    for (const event of measure.events) {
      if (event.type === 'rest' || event.beamGroup === null) continue
      const pitches = event.type === 'chord' ? event.pitches : [event.pitch]
      if (pitches.length === 0) continue
      // abcjs's `averagepitch`, in ITS pitch units so the rounding lands where its does.
      const average =
        pitches.reduce((sum, p) => sum + pitchToStep(p, clef), 0) / pitches.length + PITCH_ORIGIN
      const seen = totals.get(event.beamGroup)
      if (seen === undefined) totals.set(event.beamGroup, { total: Math.round(average), count: 1 })
      else {
        seen.total = Math.round(seen.total + average)
        seen.count += 1
      }
    }
  }

  const directions = new Map<number, boolean>()
  // A beam cannot join opposed stems, so a forced voice's beams all point its way.
  const declared = voice?.stemDirection == null ? forced : voice.stemDirection === 'up'
  for (const [group, { total, count }] of totals) {
    directions.set(group, declared ?? total / count < PITCH_ORIGIN)
  }
  return directions
}
