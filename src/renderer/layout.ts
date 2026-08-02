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
  isStrict,
  type KeySignature,
  type Measure,
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
import { glyphsFor } from './glyph-table.js'
import { ENGRAVING_DEFAULTS, GLYPHS, type GlyphName } from './glyphs.js'
import {
  CHAR_ADVANCE,
  CHAR_ADVANCE_BOLD,
  CHAR_ADVANCE_BOLD_FALLBACK,
  CHAR_ADVANCE_SANS,
  CHAR_ADVANCE_SANS_FALLBACK,
  FALLBACK_ADVANCE,
} from './text-metrics.js'
import { VOICE_NAME_GAP_PX, voiceNameWidthPx } from './voice-name-metrics.js'

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
  beamStemHeight: Math.round((36.67 * 10) / 3.875) / 10,
  /** First ledger step beyond the staff; grows outward by 2. *Behind Bars*. */
  firstLedgerStep: 6,
  /** Ledger line overhang past the notehead each side. */
  ledgerExtension: ENGRAVING_DEFAULTS.legerLineExtension,
  /**
   * Page margin left of the staff.
   *
   * 15px at abcjs's 7.75px staff space — its SCREEN default `padding.left`
   * (`write/renderer.js:71`; print uses 68px, which is 1.8cm). Was 1.0 and marked
   * PROVISIONAL, which put every drawing about 7px left of abcjs's and, more sharply,
   * dropped `multi-voice-rest-placement` to a fill of 0.659 against the 0.66 threshold —
   * so it kept its natural width where abcjs justified it, by one thousandth.
   */
  marginX: 15 / 7.75,
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
  prefixGap: 10 / 7.75,
  /**
   * A clef glyph sits this far INTO its element — abcjs's `var dx = 5` in `createClef`,
   * which is why its clef element is 24.051 wide against a 19.051 glyph. We drew the glyph
   * flush at the element's left and made the element glyph-wide, losing 5px before the
   * music on every staff.
   */
  clefIndent: 5 / 7.75,
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
  noteRodGap: 1 / 7.75,
  /**
   * Gap between adjacent accidentals in a key signature.
   *
   * abcjs steps by `getSymbolWidth(symbol) + 2` (`create-key-signature.js:26`) — a flat 2px,
   * which its own element dump confirms: five sharps at dx 0, 10.25, 20.5, 30.75, 41 with
   * each glyph 8.25 wide. Ours was 0.15 of a space, 1.16px, so a five-sharp signature ran
   * 3.35px narrow and pulled the music left with it.
   */
  keySignatureGap: 2 / 7.75,
  /** Gap between an accidental and the notehead it alters. PROVISIONAL. */
  accidentalGap: 0.15,
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
  barGap: 11 / 7.75,
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
  barClearance: 5 / 7.75,
  barLayoutWidth: {
    thin: 1 / 7.75,
    double: 4 / 7.75,
    final: 8 / 7.75,
    repeatStart: 16 / 7.75,
    repeatEnd: 14 / 7.75,
    repeatBoth: 22 / 7.75,
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
  aboveStackMargin: 1 * 0.5,
  chordHeightAbove: 4.779354838709677 * 0.5,
  partHeightAbove: 5.718709677419355 * 0.5,
  tempoHeightAbove: 6 * 0.5,
  /** abcjs bumps the tempo's baseline 2px past the top it reserved (`draw/tempo.js:15`). */
  tempoDescenderBump: 2 / 7.75,
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
  lyricInkGap: 17 / 7.75,
  lyricVoiceStep: (17 * 1.108) / 7.75,
  /**
   * Verse to verse: abcjs stacks verses as `<tspan dy="1.2em">` inside ONE `<text>` per
   * note, so the step is 1.2 x the 17px vocal font = 20.4px, not the 21px an advance rule
   * would give. Read off its own goldens' markup, not inferred.
   */
  lyricLineStep: (17 * 1.2) / 3.875,
  /**
   * How far a brace or bracket moves the staff's left edge — abcjs's
   * `BraceElem.getWidth()`, a flat 10 for both, with its own comment that the drawing
   * does not vary it.
   */
  connectorIndent: 10 / 7.75,
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
  tempoTextSize: 20 / 7.75,
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
  titleTextSize: Math.round((20 * 4) / 3) / 7.75,
  subtitleTextSize: Math.round((16 * 4) / 3) / 7.75,
  composerTextSize: Math.round((14 * 4) / 3) / 7.75,
  infoTextSize: Math.round((14 * 4) / 3) / 7.75,
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
  textHeightRatio: 1.108,
  /**
   * Page margin above everything — abcjs's `padding.top`, 15px on screen
   * (`write/renderer.js:69`; print uses 38px, which is 1cm). We had none: our drawing
   * began at the top text's own ink, so every tune sat 15px higher than abcjs's.
   */
  marginTop: 15 / 7.75,
  /** Space above the title, a subtitle, and the composer row (`renderer.js:94`). */
  titleSpace: 7.56 / 7.75,
  subtitleSpace: 3.78 / 7.75,
  composerSpace: 7.56 / 7.75,
  /** Space between the top-text block and the top of the music (`renderer.js:101`). */
  musicSpace: 7.56 / 7.75,
  /**
   * `%%center` free text — abcjs's `textfont`, 21px at its 7.75px staff space.
   *
   * `freeTextSpace` is the gap above such a line, and it is abcjs's standard 7.56 — the
   * same unit as `titleSpace`, `composerSpace` and `musicSpace`. Derived, not guessed:
   * abcjs's composer baseline in the `center-text` golden is 82.12 and its centred line's
   * is 114.68, and 114.68 = 82.12 + (23 - 19) + 7.56 + 21 exactly, where 23 is the
   * composer row's advance and 21 the free-text size.
   */
  freeTextSize: 21 / 7.75,
  freeTextSpace: 7.56 / 7.75,
  /** Gap from the last staff line down to a trailing `%%center` line's baseline. */
  freeTextBelowSpace: 36.85 / 7.75,
  /** A text line advances by its height times this, rounded to whole pixels by abcjs. */
  lineSkipFactor: 1.1,
  /** Vertical gap between tunes in a tunebook — wider than between systems. */
  tuneGap: 6.0,
  /**
   * abcjs's `vocalfont`, 13pt -> `round(13 x 4/3)` = 17px, and its `gchordfont` /
   * `annotationfont`, 12pt -> 16px (`abc_parse_directive.js:25-38`). Both were 1.4 —
   * 10.85px — one constant serving lyrics, chord symbols, annotations and decorations at
   * two thirds of abcjs's size. Same undersizing the title carried before `titleTextSize`
   * was derived; it makes every out-of-staff reserve too small as well as drawing small.
   */
  lyricTextSize: 17 / 7.75,
  chordTextSize: 16 / 7.75,
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
   * Fixed lane a tuplet bracket or volta ending reserves beyond the top/bottom note —
   * abcjs's `endingHeightAbove`, 4 pitch + 1 margin = 5 pitch, which at 0.5 space/pitch is
   * 2.5 staff-spaces. The bracket is DRAWN where its geometry puts it and overhangs this
   * lane; only the lane is reserved. See `verticalExtent`.
   */
  endingLane: 5 * 0.5,
  voltaStep: 8,
  /** How far the volta bracket's end hooks turn down toward the staff. */
  voltaHook: 1.4,
  voltaTextSize: 1.3,
  /** Grace notes are drawn at this fraction of full size. *Behind Bars* ~60%. */
  graceScale: 0.6,
  /**
   * Horizontal advance per grace note, before the note it decorates — a flat **10px**,
   * and the last grace's own step is the gap to the notehead, so there is no separate
   * one. abcjs records the whole group as `extraw`: probed on `C{ABc}G/4 D2`, a note with
   * three graces reads `extraw = -30` exactly, and `w` unchanged at the notehead alone.
   * Ours stepped 8.52px and then added 5.1px of gap, which put a single grace 3.6px too
   * far from its note and every grace of a group at the wrong pitch of the ladder.
   */
  graceAdvance: 10 / 7.75,
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
  systemWidth: 700 / 7.75,
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
  systemSeparation: 61.33 / 7.75,
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
  staffSeparation: 48 / 7.75,
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
}

export interface LayoutElement {
  readonly type: ElementType
  /**
   * Total height, for an element that is a BLOCK rather than a mark — only the top text.
   * abcjs advances its cursor by a rounded line height per row, which is more than the
   * last row's descender, so the block cannot be measured from its texts after the fact.
   */
  readonly blockHeight?: number
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
const ABCJS_PX_PER_SPACE = 7.75

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
  // Unpitched. Treated as a C clef on the middle line so notes land somewhere sane
  // rather than at a wild offset; neither is a real pitch mapping.
  percussion: 28,
  none: 28,
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
  // ponytail: no percussion glyph extracted, and `clef=none` draws nothing by definition.
  percussion: null,
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
const CLEF_PITCH_OFFSET: Readonly<Record<ClefShape, number>> = {
  G: -5,
  C: -4,
  F: -4,
  percussion: -2,
  none: 0,
}

/** abcjs draws the octave marker at two thirds size (`create-clef.js:39`). */
const OCTAVE_MARKER_SCALE = 2 / 3

function layoutClef(x: number, clef: Clef, strict = true): LayoutElement | null {
  const name = CLEF_GLYPHS[clef.shape] ?? null
  if (name === null) return null
  // Every SMuFL clef's origin sits on the line it marks, so the glyph goes exactly where
  // the clef's line is — no per-clef offsets. Line n is (n - 3) * 2 steps from the middle.
  const step = (clef.line - 3) * 2
  const glyphs = [glyphAt(name, x + ENGRAVE.clefIndent, step)]

  // `clef=treble-8` and friends: a small `8` under (or over) the clef.
  //
  // Source: `creation/create-clef.js:39-56`. Its arithmetic is in abcjs PITCH, where the
  // bottom staff line is 2 and the clef's own line is `2 x clef.line`; a pitch is half a
  // staff step here, hence `pitchStep`. The clef element's declared bottom is its line plus
  // `CLEF_PITCH_OFFSET`, and the marker hangs one pitch under that while RESERVING from
  // three under it down to five — a reserve that does not bracket its own ink, which is
  // why it is declared rather than measured. See `PlacedGlyph.reserve`.
  if (clef.octaveShift !== 0) {
    const pitchStep = (pitch: number): number => stepToY(pitch - 6)
    const clefBottom = 2 * clef.line + (CLEF_PITCH_OFFSET[clef.shape] ?? 0)
    const clefTop = clefBottom + 2 * (glyphsFor(strict).get(name)?.height ?? 0)
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
    const placed = glyphAt(name, cursor, step)
    cursor += glyphsFor(strict).advance(name)
    return placed
  })
}

function layoutMeter(x: number, numerator: number, denominator: number): LayoutElement {
  const top = digitNames(numerator)
  const bottom = digitNames(denominator)
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
function keySignatureShift(clef: Clef): number {
  const delta = middleLineIndex(defaultClef) - middleLineIndex(clef)
  const wrapped = ((delta % 7) + 7) % 7
  return wrapped > 3 ? wrapped - 7 : wrapped
}

function layoutKeySignature(
  x: number,
  key: KeySignature,
  clef: Clef,
  strict = true,
): LayoutElement | null {
  const fifths = keyFifths(key)
  if (fifths === 0) return null // C major and K:none both draw nothing.

  const shift = keySignatureShift(clef)
  const sharps = fifths > 0
  const steps = (sharps ? SHARP_STEPS : FLAT_STEPS)
    .slice(0, Math.abs(fifths))
    .map((step) => step + shift)
  const name: GlyphName = sharps ? 'accidentalSharp' : 'accidentalFlat'
  const pitch = glyphsFor(strict).advance(name) + ENGRAVE.keySignatureGap

  return {
    type: 'keySignature',
    x,
    // No trailing gap: the signature ends at the last glyph's ink.
    width: steps.length * pitch - ENGRAVE.keySignatureGap,
    staffSteps: [],
    glyphs: steps.map((step, i) => glyphAt(name, x + i * pitch, step)),
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
    glyphs.push(glyphAt(name, cursor, step))
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
    // The beat unit is drawn as a real note — a quarter note for `1/4=120`.
    const spec = tempo.beatUnit === null ? null : noteGlyph(tempo.beatUnit)
    if (spec !== null) {
      // Anchors are Bravura's alone — abcjs's table has none, and a stem attachment is
      // a property of the OUTLINE, so it stays with the font that defines it. Only the
      // advance comes from the active table.
      const head = GLYPHS[spec.head]
      const headAdvance = glyphsFor(strict).advance(spec.head)
      glyphs.push({ name: spec.head, x: cursor, y: baseline })
      if (spec.stemmed) {
        const [ax, ay] = head.anchors.stemUpSE ?? [head.width, 0]
        lines.push({
          x1: cursor + ax,
          y1: baseline + ay,
          x2: cursor + ax,
          y2: baseline + ay - ENGRAVE.stemLength,
          thickness: ENGRAVING_DEFAULTS.stemThickness,
        })
      }
      cursor += headAdvance + 0.3
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
      size: ENGRAVE.tempoTextSize,
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
  if (spec) {
    glyphs.push(glyphAt(spec.name, x, spec.step))
    if (spec.dots > 0) {
      const dotX = x + glyphsFor(strict).width(spec.name) + ENGRAVE.dotGap
      glyphs.push(...dotGlyphs(spec.dots, dotX, spec.step, new Set()))
    }
  }

  return {
    type: 'rest',
    x,
    width: advance,
    spring: advance,
    rod: 0,
    staffSteps: [],
    glyphs,
    lines: [],
    texts: [],
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

/** The head a note actually draws, once its style has had a say. */
function styledHead(base: GlyphName, event: MusicEvent | null): GlyphName {
  if (event === null || event.type === 'rest' || event.style === 'normal') return base
  const pair = STYLED_HEADS[event.style]
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
  const x1 = x - ENGRAVE.ledgerExtension
  const x2 = x + headWidth + ENGRAVE.ledgerExtension
  const push = (s: number) => {
    lines.push({
      x1,
      y1: stepToY(s),
      x2,
      y2: stepToY(s),
      thickness: ENGRAVING_DEFAULTS.legerLineThickness,
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
  const headName = styledHead(spec.head, event)
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
  let graceWidth = 0
  if (event !== null && event.type !== 'rest' && event.graceNotes.length > 0) {
    const scale = ENGRAVE.graceScale
    const small = GLYPHS.noteheadBlack
    const graceSteps = event.graceNotes.map((p) => pitchToStep(p, clef))

    graceSteps.forEach((graceStep, i) => {
      const gx = x + i * ENGRAVE.graceAdvance
      glyphs.push({ name: 'noteheadBlack', x: gx, y: stepToY(graceStep), scale, role: 'grace' })
      // The stem attaches at the scaled anchor and runs a scaled length upward.
      const [ax, ay] = small.anchors.stemUpSE ?? [small.width, 0]
      const stemX = gx + ax * scale
      const base = stepToY(graceStep) + ay * scale
      lines.push({
        x1: stemX,
        y1: base,
        x2: stemX,
        y2: base - ENGRAVE.stemLength * scale,
        thickness: ENGRAVING_DEFAULTS.stemThickness * scale,
        role: 'stem',
      })
    })

    graceWidth = graceSteps.length * ENGRAVE.graceAdvance + ENGRAVE.graceGap

    if (event.graceSlash) {
      // One slash across the first grace note's stem, which is what marks the whole
      // group as an acciaccatura however many notes it has.
      const firstStep = graceSteps[0] ?? 0
      const tipY = stepToY(firstStep) - ENGRAVE.stemLength * scale
      lines.push({
        x1: x - 0.2,
        y1: tipY + 1.0,
        x2: x + ENGRAVE.graceAdvance * 0.9,
        y2: tipY - 0.2,
        thickness: ENGRAVING_DEFAULTS.stemThickness * 1.4,
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
  // ponytail: `microtoneCents` is per-EVENT, not per-pitch, so a chord's microtone
  // applies to every altered head in it. `[^/G^/B]` is right; a chord mixing a microtone
  // with a plain accidental is not expressible. No fixture writes one, and fixing it
  // means moving the field onto Pitch.
  const cents = event === null || event.type === 'rest' ? 0 : event.microtoneCents
  const accidentals = pitches
    .map((p) => ({
      glyph: microtoneAccidental(p.accidental, cents, strict),
      step: pitchToStep(p, clef),
    }))
    .filter((a): a is { glyph: GlyphName; step: number } => a.glyph !== null)

  const accidentalWidth =
    accidentals.length === 0
      ? 0
      : Math.max(...accidentals.map((a) => glyphsFor(strict).advance(a.glyph))) +
        ENGRAVE.accidentalGap

  for (const a of accidentals)
    glyphs.push({ ...glyphAt(a.glyph, noteX, a.step), role: 'accidental' })
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
      thickness: ENGRAVING_DEFAULTS.stemThickness,
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

  /** How far the note's attached text reaches either side of it — see `noteText`. */
  const textSpan = { left: 0, right: 0 }
  const texts = event === null ? [] : noteText(event, headX, headInk, strict, textSpan)
  if (event !== null && event.type !== 'rest') {
    texts.push(...decorationTexts(event.decorations, headX, head.width))
  }
  if (event !== null && event.decorations.length > 0) {
    glyphs.push(
      ...decorationGlyphs(
        event.decorations,
        headX,
        head.width,
        highest,
        lowest,
        up,
        strict,
        dynamicsAbove,
      ),
    )
  }

  // The spring is the natural width, but ink is a rod: a displaced head or a dot column
  // must never be crushed by a short duration, so the element is at least as wide as what
  // it draws to the RIGHT of the notehead, plus the minimum gap.
  const spread = Math.max(0, ...[...offsets.values()].map(Math.abs), dotWidth)
  // A lyric or a chord symbol is CENTRED on the note and counts on BOTH sides. It is the
  // dominant term in sung music: `birth-` makes a 9.81px notehead occupy 21.28px each way.
  //
  // An unbeamed FLAG counts too — abcjs reads `flags.u8th` at `dx = 9.21, w = 6.69`, so an
  // eighth's rod is 15.90 where its notehead alone is 9.81. A beamed note has no flag and
  // stays at its notehead.
  const flagInk = glyphs
    .filter((g) => g.role === 'flag')
    .map((g) => g.x - headX + glyphsFor(strict).width(g.name))
  const ink = Math.max(spread + head.width, textSpan.right, ...flagInk) + ENGRAVE.noteRodGap
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
    left: Math.max(headX - x, textSpan.left),
    staffSteps: steps,
    glyphs,
    lines,
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
function layoutBar(x: number, kind: Barline, strict = true): LayoutElement {
  const thin = ENGRAVING_DEFAULTS.thinBarlineThickness
  const thick = ENGRAVING_DEFAULTS.thickBarlineThickness
  const gap = ENGRAVING_DEFAULTS.barlineSeparation
  const dotGap = ENGRAVING_DEFAULTS.repeatBarlineDotSeparation

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
    { above: GlyphName; below: GlyphName; place: 'articulation' | 'ornament' | 'dynamic' | 'stem' }
  >
> = {
  staccato: { above: 'articStaccatoAbove', below: 'articStaccatoBelow', place: 'articulation' },
  accent: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  tenuto: { above: 'articTenutoAbove', below: 'articTenutoBelow', place: 'articulation' },
  marcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
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
  // abcjs draws `!3!` as a decoration digit above the staff, so these take the ornament
  // lane rather than the dynamic one.
  '0': { above: 'fingering0', below: 'fingering0', place: 'ornament' },
  '1': { above: 'fingering1', below: 'fingering1', place: 'ornament' },
  '2': { above: 'fingering2', below: 'fingering2', place: 'ornament' },
  '3': { above: 'fingering3', below: 'fingering3', place: 'ornament' },
  '4': { above: 'fingering4', below: 'fingering4', place: 'ornament' },
  '5': { above: 'fingering5', below: 'fingering5', place: 'ornament' },

  // ── Aliases ────────────────────────────────────────────────────────────────
  // abcjs rewrites these to canonical names through `accentPseudonyms`; we keep the
  // source spelling in the model, so the renderer resolves them instead. Each already
  // had its glyph — they drew nothing only because the table was keyed on the canonical
  // name. Verified against 6.6.3: `!>!` and `!emphasis!` both draw its sforzato (the
  // accent wedge), `!^!` its umarcato, `!tr!` its trill.
  '>': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  '<': { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  emphasis: { above: 'articAccentAbove', below: 'articAccentBelow', place: 'articulation' },
  '^': { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
  umarcato: { above: 'articMarcatoAbove', below: 'articMarcatoBelow', place: 'articulation' },
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
  invertedfermata: { above: 'fermataBelow', below: 'fermataBelow', place: 'ornament' },
  wedge: {
    above: 'articStaccatissimoAbove',
    below: 'articStaccatissimoBelow',
    place: 'articulation',
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
const DECORATION_TEXTS: Readonly<Record<string, string>> = {
  'D.C.': 'D.C.',
  'D.S.': 'D.S.',
  fine: 'Fine',
  'D.C.alcoda': 'D.C. al Coda',
  'D.C.alfine': 'D.C. al Fine',
  'D.S.alcoda': 'D.S. al Coda',
  'D.S.alfine': 'D.S. al Fine',
}

/**
 * Words a note carries — the navigation directions above.
 *
 * Italic and in the part lane, well clear of the ornament stack, because these address
 * the PLAYER rather than marking the note: they are read at a glance while navigating,
 * not while reading pitch. Stacked so two on one note cannot overprint.
 */
function decorationTexts(names: readonly string[], headX: number, headWidth: number): PlacedText[] {
  const out: PlacedText[] = []
  const size = ENGRAVE.chordTextSize
  for (const name of names) {
    const text = DECORATION_TEXTS[name]
    if (text === undefined) continue
    out.push({
      text,
      x: headX + headWidth / 2 - textWidth(text, size) / 2,
      y: stepToY(ENGRAVE.partStep - out.length * ENGRAVE.annotationLineStep),
      size,
      bold: false,
      italic: true,
    })
  }
  return out
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
  /** `abcjs-strict` — suppresses the marks abcjs accepts but never paints. */
  strict: boolean,
  /** Dynamics above the staff when the tune sings, below when it does not. */
  dynamicsAbove: boolean,
): PlacedGlyph[] {
  const out: PlacedGlyph[] = []
  // Away from the stem, and never inside the staff for a note that sits in it.
  const artAbove = !stemUp
  let artStep = artAbove ? Math.max(topStep, 4) + 2 : Math.min(bottomStep, -4) - 2
  let ornamentStep = ENGRAVE.ornamentStep

  for (const name of names) {
    if (strict && STRICT_UNDRAWN.has(name)) continue
    const spec = DECORATIONS[name]
    if (spec === undefined) continue // unmapped — counted by the test, never guessed at

    const glyph = spec.place === 'articulation' ? (artAbove ? spec.above : spec.below) : spec.above
    const centre = headX + headWidth / 2 - glyphsFor(strict).width(glyph) / 2

    if (spec.place === 'articulation') {
      out.push({ name: glyph, x: centre, y: stepToY(artStep), role: 'decoration' })
      artStep += artAbove ? 2 : -2
    } else if (spec.place === 'ornament') {
      out.push({ name: glyph, x: centre, y: stepToY(ornamentStep), role: 'decoration' })
      ornamentStep += 2
    } else if (spec.place === 'stem') {
      // Centred on the stem's midpoint. An arpeggio instead sits just LEFT of the head,
      // which is where a rolled chord is read from.
      const onStem =
        name === 'arpeggio'
          ? headX - glyphsFor(strict).width(glyph) - ENGRAVE.spannerGap
          : headX + headWidth / 2 - glyphsFor(strict).width(glyph) / 2
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
  return out
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
const textWidth = (text: string, size: number, face: Face = 'serif'): number => {
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
): PlacedText[] {
  if (event.type === 'rest') return []
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
    const size = ENGRAVE.chordTextSize
    centred(event.chordSymbol, size, headWidth / 2, 'sans')
    texts.push({
      text: event.chordSymbol,
      // The lane is only the origin: `anchorAboveStaff` moves the whole set onto the
      // staff's music once the voices sharing it are known, exactly as lyrics are.
      role: 'chord',
      x: centre - textWidth(event.chordSymbol, size, 'sans') / 2,
      y: stepToY(ENGRAVE.chordSymbolStep),
      size,
      bold: false,
      italic: false,
    })
  }

  // `"^text"` and `"_text"` — free annotations, which the parser separates from chord
  // symbols by that leading char. It is placement, not content, so it is stripped here
  // rather than printed. See `ENGRAVE.annotationAboveStep` for the stacking order.
  const annotations = event.annotations.map((a) => ({ where: a[0] ?? '^', text: a.slice(1) }))
  const above = annotations.filter((a) => a.where === '^' || a.where === '@')
  const below = annotations.filter((a) => a.where === '_')

  above.forEach((a, index) => {
    const size = ENGRAVE.chordTextSize
    const lane =
      ENGRAVE.annotationAboveStep + (above.length - 1 - index) * ENGRAVE.annotationLineStep
    texts.push({
      text: a.text,
      x: centre - textWidth(a.text, size, 'sans') / 2,
      y: stepToY(lane),
      size,
      bold: false,
      italic: false,
    })
  })

  below.forEach((a, index) => {
    const size = ENGRAVE.chordTextSize
    texts.push({
      text: a.text,
      x: centre - textWidth(a.text, size, 'sans') / 2,
      y: stepToY(ENGRAVE.annotationBelowStep - index * ENGRAVE.annotationLineStep),
      size,
      bold: false,
      italic: false,
    })
  })

  // `"<text"` and `">text"` sit beside the note at staff height instead of above it.
  // ponytail: `"@x,y text"` is free placement — its coordinates would need parsing, so it
  // falls in with `^` above and prints them. No corpus fixture writes one.
  for (const a of annotations) {
    if (a.where !== '<' && a.where !== '>') continue
    const size = ENGRAVE.chordTextSize
    texts.push({
      text: a.text,
      x:
        a.where === '<'
          ? headX - textWidth(a.text, size, 'sans') - ENGRAVE.minColumnGap
          : headX + headWidth + ENGRAVE.minColumnGap,
      y: stepToY(0),
      size,
      bold: false,
      italic: false,
    })
  }

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
  const thickness = ENGRAVING_DEFAULTS.staffLineThickness

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
      thickness: ENGRAVING_DEFAULTS.staffLineThickness,
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
function buildCurve(from: NoteAnchor, to: NoteAnchor, kind: 'tie' | 'slur'): PlacedCurve {
  // Opposite the stems: an up-stem note carries its slur below the notehead.
  const above = !(from.stemUp && to.stemUp)
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
    endThickness:
      kind === 'tie'
        ? ENGRAVING_DEFAULTS.tieEndpointThickness
        : ENGRAVING_DEFAULTS.slurEndpointThickness,
    midThickness:
      kind === 'tie'
        ? ENGRAVING_DEFAULTS.tieMidpointThickness
        : ENGRAVING_DEFAULTS.slurMidpointThickness,
    kind,
  }
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
      curves[from.system]?.push(buildCurve(from, to, kind))
      return
    }
    const start = bounds[from.system]
    const end = bounds[to.system]
    if (start === undefined || end === undefined) return

    // Each half is LEVEL at its own note's height. Sloping it toward a note in another
    // system would aim at a pitch the reader cannot see, and the two halves would tilt
    // in unrelated directions.
    curves[from.system]?.push(
      buildCurve(from, { ...from, left: start.right, right: start.right }, kind),
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
      curves[to.system]?.push(buildCurve({ ...to, left: resume, right: resume }, to, kind))
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
): { lines: PlacedLine[]; texts: PlacedText[] } {
  /** Full vertical ink of a member, stems and beams included. */
  const extentOf = (anchor: NoteAnchor): { top: number; bottom: number } => {
    const el = elements[anchor.element]
    if (el === undefined) return { top: anchor.top, bottom: anchor.bottom }
    let top = anchor.top
    let bottom = anchor.bottom
    for (const line of el.lines) {
      top = Math.min(top, line.y1, line.y2)
      bottom = Math.max(bottom, line.y1, line.y2)
    }
    for (const g of el.glyphs) {
      const glyph = GLYPHS[g.name]
      const scale = g.scale ?? 1
      top = Math.min(top, g.y + glyph.y * scale)
      bottom = Math.max(bottom, g.y + (glyph.y + glyph.height) * scale)
    }
    return { top, bottom }
  }

  const lines: PlacedLine[] = []
  const texts: PlacedText[] = []

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

    // Clear of the furthest extent any member reaches, so the bracket never collides.
    const extents = members.map(extentOf)
    const edge = up
      ? Math.min(...extents.map((e) => e.top))
      : Math.max(...extents.map((e) => e.bottom))
    const y = edge + direction * ENGRAVE.tupletGap

    // A tuplet entirely inside ONE beam group needs no bracket: the beam already says
    // where it starts and stops.
    const beamed =
      members.every((m) => m.event.type !== 'rest' && m.event.beamGroup !== null) &&
      new Set(members.map((m) => (m.event.type === 'rest' ? null : m.event.beamGroup))).size === 1

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

    if (beamed) continue

    // Bracket: a horizontal rule broken around the number, with a hook at each end
    // turning toward the notes.
    const gap = width / 2 + ENGRAVE.tupletNumberGap
    const thickness = ENGRAVING_DEFAULTS.slurEndpointThickness
    const hook = ENGRAVE.tupletHook * -direction

    lines.push({ x1: first.left, y1: y, x2: centre - gap, y2: y, thickness })
    lines.push({ x1: centre + gap, y1: y, x2: last.right, y2: y, thickness })
    lines.push({ x1: first.left, y1: y, x2: first.left, y2: y - hook, thickness })
    lines.push({ x1: last.right, y1: y, x2: last.right, y2: y - hook, thickness })
  }

  return { lines, texts }
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
  const thickness = ENGRAVING_DEFAULTS.beamThickness
  const inward = -direction
  const step = (thickness + ENGRAVING_DEFAULTS.beamSpacing) * inward

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
      barRod(measure.openingBarline, bar, strict),
      ENGRAVE.prefixGap,
      'bar',
      ENGRAVE.barClearance,
    )
    x += ENGRAVE.barGap
  }
  if (keyChangeAt < openingBarAt) {
    drawKeyChange()
    drawOpeningBar()
  } else {
    drawOpeningBar()
    drawKeyChange()
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
      anchors.push({
        system: 0, // filled in when the block is placed into a system
        element: elements.length,
        left: Math.min(...heads.map((h) => h.x)),
        right: Math.max(...heads.map((h) => h.x)) + width,
        top: Math.min(...heads.map((h) => h.y)) - 0.5,
        bottom: Math.max(...heads.map((h) => h.y)) + 0.5,
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
        stemUp: false,
        event,
      })
    }
    elements.push(el)
    const duration = ratToNumber(event.duration)
    advances.push({
      rod: el.rod ?? el.width,
      gap: ENGRAVE.noteRodGap,
      duration,
      left: el.left ?? 0,
      kind: 'other',
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
    const bar = layoutBar(x, measure.closingBarline, strict)
    elements.push(bar)
    fixed(
      barRod(measure.closingBarline, bar, strict),
      ENGRAVE.prefixGap,
      'bar',
      ENGRAVE.barClearance,
    )
    x += ENGRAVE.barGap
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
    thickness: ENGRAVING_DEFAULTS.staffLineThickness,
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
  ) => { elements: LayoutElement[]; advances: Advance[] }
}

/**
 * Lay out a score.
 *
 * Every voice becomes a staff, stacked within each system. Measures are aligned across
 * voices by column, so bar 3 begins at the same x on every staff — without that the
 * staves drift apart and the score stops being readable as one thing.
 */
export function layout(score: Score, options: LayoutOptions = {}): Layout {
  const systemWidth = options.systemWidth ?? ENGRAVE.systemWidth
  // The mode picks the look; `profile` can still override it explicitly.
  const profile: RenderProfile =
    options.profile ?? (isStrict(options.mode ?? defaultMode) ? 'abcjs' : 'standard')
  // Read from the MODE, not from `profile`: profile is a density override and a caller
  // may set it either way, but whether a melisma prints abcjs's literal `_` or an
  // extender is a question about which engine's behaviour is being reproduced.
  const strict = isStrict(options.mode ?? defaultMode)
  const { spacingScale } = PROFILES[profile]
  const voices = score.voices.length > 0 ? score.voices : [undefined]

  // `%%staffsep` / `%%sysstaffsep` override the engine defaults when the tune sets them —
  // ragtime-nightingale asks for a wider system gap (staffsep 90 -> 120px) and a wider
  // intra-staff gap (sysstaffsep 50 -> 66.67px), and abcjs honours both. The model carries
  // them already in pixels; here they become staff spaces like the rest of `ENGRAVE`.
  const interSystemSep = score.staffSep !== null ? score.staffSep / 7.75 : ENGRAVE.systemSeparation
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
  // `hasVocals` (`abstract-engraver.js:110`), which it reads per system but which never
  // varies across a corpus tune's systems. Any note in any voice carrying a syllable or a
  // held-melisma marker counts; a wordless `*` (`lyric: null, lyricMelisma: false`) does
  // not, matching abcjs's test on `el.lyric`.
  const hasVocals = voices.some((voice) =>
    (voice?.measures ?? []).some((measure) =>
      measure.events.some(
        (event) =>
          (event.type === 'note' || event.type === 'chord') &&
          ((event.lyric !== null && event.lyric !== '') ||
            event.extraVerses.some((v) => v !== null && v !== '')),
      ),
    ),
  )

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
    const blocks = (voice?.measures ?? []).map((measure) => {
      const block = layoutMeasure(
        measure,
        clef,
        directions,
        spacingScale,
        strict,
        stemForVoice(voiceIndex),
        keyInForce,
        hasVocals,
      )
      if (measure.keyChange !== null) keyInForce = measure.keyChange
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
    ): { elements: LayoutElement[]; advances: Advance[] } => {
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
        push(layoutMeter(x, score.meter.numerator, score.meter.denominator))
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
  const indentFor = (systemIndex: number): number => {
    const label = (plan: VoicePlan): string | null => (systemIndex === 0 ? plan.name : plan.subname)
    const widest = Math.max(
      0,
      ...plans.map((plan) => {
        const text = label(plan)
        return text ? voiceNameWidthPx(text) : 0
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
    return connector + (widest + VOICE_NAME_GAP_PX) / 7.75
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

    /** Every element of one voice on this line, prefix included, in cursor order. */
    const heads = plans.map((plan) => plan.prefix(withMeter, plans.indexOf(plan) === 0, indent))
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
        if (isLast && width / target < ENGRAVE.lastSystemFill) break
        if (Math.abs(target - width) < 2 / 7.75) break
        if (units <= 0) break
        const springs = units * spacingScale
        factor = (target - (width - factor * springs)) / springs
      }
      return factor
    })()
    const solved = lineAt(justify)
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
      const block =
        systemIndex === 0 && voiceIndex === 0
          ? topTextBlock(score.metadata, systemWidth - ENGRAVE.marginX * 2, score.textAbove)
          : { texts: [], height: 0 }
      const heading: LayoutElement[] =
        block.texts.length === 0
          ? []
          : [
              {
                type: 'title',
                x: 0,
                width: 0,
                staffSteps: [],
                glyphs: [],
                lines: [],
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
        const thickness = ENGRAVING_DEFAULTS.thinBarlineThickness
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
          if (block.volta !== null) {
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
            elements.push(shiftElement(el, shiftOf(index)))
          })
          for (const [group, members] of block.beams) {
            const shifted = members.map((m) => ({
              ...m,
              // A stem sits at its element's origin plus an offset within it, so it
              // moves with the element rather than scaling on its own.
              x: m.x + shiftOf(m.element),
              element: m.element + base,
            }))
            beamGroups.set(group, [...(beamGroups.get(group) ?? []), ...shifted])
          }
          for (const a of block.anchors) {
            voiceAnchors[voiceIndex]?.push({
              ...a,
              system: systemIndex,
              element: a.element + base,
              left: a.left + shiftOf(a.element),
              right: a.right + shiftOf(a.element),
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
      const tuplets = layoutTuplets(systemAnchors, elements)
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
    let cursor = headingless ? ENGRAVE.musicSpace : 0
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
              const offset = musicTop - ENGRAVE.musicSpace - blockBottom
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
  const curvesBySystem = voiceAnchors.map((anchors) => layoutCurves(anchors, systemBounds))
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
    const originY =
      previousBottomLine === null
        ? cursor
        : Math.max(cursor, previousBottomLine + interSystemSep - topLineOffset)

    previousBottomLine = originY + bottomLineOffset
    cursor = originY + height + ENGRAVE.systemGap
    return { ...system, originY }
  })

  return {
    systems: placed,
    width: Math.max(0, ...placed.map((s) => s.width)),
    // `cursor` has one trailing gap on it, added after the last system. abcjs opens with
    // `moveY(padding.top)` before drawing anything (`draw.js:14`), so the page begins
    // ABOVE the ink — expressed as a negative viewBox top rather than by shifting every
    // system, which would put the same constant in two places.
    height: Math.max(0, cursor - ENGRAVE.systemGap) + ENGRAVE.marginTop,
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
  return { systems, width, height: cursor + ENGRAVE.marginTop, top: -ENGRAVE.marginTop }
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
  textAbove: readonly string[] = [],
): { texts: PlacedText[]; height: number } {
  const texts: PlacedText[] = []
  let y = 0
  // abcjs rounds each line advance to whole PIXELS before moving on, so a block's height
  // is not simply a sum of ems. Reproduced rather than smoothed.
  const advance = (size: number): void => {
    y +=
      Math.round(size * ENGRAVE.textHeightRatio * ENGRAVE.lineSkipFactor * ABCJS_PX_PER_SPACE) /
      ABCJS_PX_PER_SPACE
  }
  const centre = width / 2

  const [title, ...subtitles] = metadata.titles
  if (title !== undefined && title !== '') {
    y += ENGRAVE.titleSpace
    texts.push({
      text: title,
      role: 'title',
      x: centre,
      // abcjs writes the baseline one font size below the cursor (`text.js:30`).
      y: y + ENGRAVE.titleTextSize,
      size: ENGRAVE.titleTextSize,
      bold: true,
      italic: false,
      anchor: 'middle',
    })
    advance(ENGRAVE.titleTextSize)
  }

  // Second and later `T:` fields are subtitles — abcm2ps's convention, and abcjs's.
  for (const subtitle of subtitles) {
    if (subtitle === '') continue
    y += ENGRAVE.subtitleSpace
    texts.push({
      text: subtitle,
      role: 'title',
      x: centre,
      y: y + ENGRAVE.subtitleTextSize,
      size: ENGRAVE.subtitleTextSize,
      bold: false,
      italic: false,
      anchor: 'middle',
    })
    advance(ENGRAVE.subtitleTextSize)
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
        y: y + ENGRAVE.infoTextSize,
        size: ENGRAVE.infoTextSize,
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
        y: y + ENGRAVE.composerTextSize,
        size: ENGRAVE.composerTextSize,
        bold: false,
        italic: true,
        anchor: 'end',
      })
    }
    advance(Math.max(ENGRAVE.infoTextSize, ENGRAVE.composerTextSize))
  }

  // `%%center` lines standing before the music close the block. Centred like the title,
  // but on the STAFF width rather than the paper width — which is the width passed here.
  for (const line of textAbove) {
    y += ENGRAVE.freeTextSpace
    texts.push({
      text: line,
      role: 'title',
      x: centre,
      y: y + ENGRAVE.freeTextSize,
      size: ENGRAVE.freeTextSize,
      bold: false,
      italic: false,
      anchor: 'middle',
    })
    advance(ENGRAVE.freeTextSize)
  }

  return { texts, height: y }
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
  // The MUSIC's ink, with the lyrics themselves taken out — including them would let the
  // block push the anchor it hangs from further down, one staff at a time. The top-text
  // block goes too: it is not music, and it has not been moved into place yet, so a
  // four-row heading measured as ink 96px BELOW the staff and dragged the lyrics after it.
  const inkBottom = verticalExtent(
    parts.flatMap((p) =>
      p.elements
        .filter((el) => el.type !== 'title')
        .map((el) => ({ ...el, texts: el.texts.filter((t) => !isLyric(t)) })),
    ),
    parts.flatMap((p) => p.beams),
    strict,
    {
      tupletLines: parts.flatMap((p) => p.tupletLines ?? []),
      tupletTexts: parts.flatMap((p) => p.tupletTexts ?? []),
      voltaLines: parts.flatMap((p) => p.voltaLines ?? []),
      voltaTexts: parts.flatMap((p) => p.voltaTexts ?? []),
    },
  ).bottom
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
>(parts: readonly T[], strict: boolean): T[] {
  const isChord = (t: PlacedText): boolean => t.role === 'chord'
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
      voltaLines: parts.flatMap((p) => p.voltaLines ?? []),
      voltaTexts: parts.flatMap((p) => p.voltaTexts ?? []),
    },
  ).top

  // y is DOWN, so reserving room above walks it negative.
  let top = inkTop
  const reserve = (height: number): number => {
    top -= height + ENGRAVE.aboveStackMargin
    return top
  }
  const chordY = chords ? reserve(ENGRAVE.chordHeightAbove) + ENGRAVE.chordTextSize : null
  const partY = partLabels ? reserve(ENGRAVE.partHeightAbove) + ENGRAVE.tempoTextSize : null
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

  const chordShift = chordY === null ? 0 : chordY - stepToY(ENGRAVE.chordSymbolStep)
  const partShift = partY === null ? 0 : partY - stepToY(ENGRAVE.partStep)
  const tempoShift = tempoY === null ? 0 : tempoY - stepToY(ENGRAVE.tempoStep)

  return parts.map((part) => ({
    ...part,
    elements: part.elements.map((el) => {
      if (el.type === 'part') return shiftBy(el, partShift)
      if (el.type === 'tempo') return shiftBy(el, tempoShift)
      if (!el.texts.some(isChord)) return el
      return {
        ...el,
        texts: el.texts.map((t) => (isChord(t) ? { ...t, y: t.y + chordShift } : t)),
      }
    }),
  }))
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
  readonly tupletLines?: readonly PlacedLine[]
  readonly tupletTexts?: readonly PlacedText[]
  readonly voltaLines?: readonly PlacedLine[]
  readonly voltaTexts?: readonly PlacedText[]
  readonly melismaLines?: readonly PlacedLine[]
  readonly spannerLines?: readonly PlacedLine[]
}

function verticalExtent(
  elements: readonly LayoutElement[],
  beams: readonly PlacedLine[] = [],
  strict = true,
  furniture: StaffFurniture = {},
): { top: number; bottom: number } {
  // The staff itself is always present, spanning steps 4 to -4.
  let top = stepToY(4)
  let bottom = stepToY(-4)
  const include = (a: number, b: number) => {
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
  let endingAbove = false
  let endingBelow = false
  /** Any dynamic or hairpin on the BELOW side, which reserves a flat lane past the ink. */
  let sawDynamicBelow = false
  const flag = (y: number) => {
    if (y < 0) endingAbove = true
    else endingBelow = true
  }
  for (const line of [...(furniture.tupletLines ?? []), ...(furniture.voltaLines ?? [])]) {
    flag((line.y1 + line.y2) / 2)
  }
  for (const t of [...(furniture.tupletTexts ?? []), ...(furniture.voltaTexts ?? [])]) flag(t.y)
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

  for (const beam of beams) {
    const half = beam.thickness / 2
    include(Math.min(beam.y1, beam.y2) - half, Math.max(beam.y1, beam.y2) + half)
  }

  /** LOWEST lyric baseline on the staff — the last verse of the lowest-offset voice. */
  let lyricBottom = Number.NEGATIVE_INFINITY

  for (const el of elements) {
    for (const g of el.glyphs) {
      // The ACTIVE table's box: abcjs's clef reaches 4.84 staff spaces above its origin
      // where Bravura's reaches 4.39, and that difference is space reserved above the
      // staff — visible as the last of the vertical offset on a title-only tune.
      // Only the BELOW side is re-anchored and lane-reserved. An ABOVE dynamic keeps its
      // own box in the ink scan, which is what it had before and what its fixtures expect.
      if (g.role === 'dynamic' && g.y > 0) {
        sawDynamicBelow = true
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
      include(Math.min(line.y1, line.y2) - half, Math.max(line.y1, line.y2) + half)
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
  if (Number.isFinite(lyricBottom)) {
    bottom = Math.max(
      bottom,
      lyricBottom + ENGRAVE.lyricVoiceStep + ENGRAVE.spacePerStep - ENGRAVE.lyricInkGap,
    )
  }

  // Apply the tuplet/volta ending lane now that `top`/`bottom` are the NOTE extent: a fixed
  // 5 pitch (`ENGRAVE.endingLane`) beyond the note on whichever side an ending sits, never
  // the bracket's real height. See the ABOVE/BELOW gather at the top of this function.
  // Dynamics: a flat lane past the music, never their own drawn box.
  // ponytail: a staff whose only below-dynamic is a HAIRPIN reserves nothing, because
  // hairpins resolve after packing and `spannerLines` is still empty here. abcjs does
  // reserve for them (`dynamicHeightBelow`, `crescendo-element.js:11`). Taking presence
  // from the model instead was tried and made the corpus much worse — see the checkpoint.
  if (sawDynamicBelow) bottom += ENGRAVE.dynamicBelowReserve * ENGRAVE.spacePerStep
  if (endingAbove) top = Math.min(top, top - ENGRAVE.endingLane)
  if (endingBelow) bottom = Math.max(bottom, bottom + ENGRAVE.endingLane)

  return { top: top - ENGRAVE.marginY, bottom: bottom + ENGRAVE.marginY }
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
  const extremes = new Map<number, { min: number; max: number }>()
  for (const measure of voice?.measures ?? []) {
    for (const event of measure.events) {
      if (event.type === 'rest' || event.beamGroup === null) continue
      const pitches = event.type === 'chord' ? event.pitches : [event.pitch]
      for (const pitch of pitches) {
        const step = pitchToStep(pitch, clef)
        const seen = extremes.get(event.beamGroup)
        if (seen === undefined) extremes.set(event.beamGroup, { min: step, max: step })
        else {
          seen.min = Math.min(seen.min, step)
          seen.max = Math.max(seen.max, step)
        }
      }
    }
  }

  const directions = new Map<number, boolean>()
  // A beam cannot join opposed stems, so a forced voice's beams all point its way.
  const declared = voice?.stemDirection == null ? forced : voice.stemDirection === 'up'
  for (const [group, { min, max }] of extremes) {
    if (declared !== null) {
      directions.set(group, declared)
      continue
    }
    // Whichever extreme is further from the middle line decides; ties go stem-down.
    directions.set(group, Math.abs(min) > Math.abs(max) ? min < 0 : max < 0)
  }
  return directions
}
