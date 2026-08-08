/**
 * SMuFL name → abcjs glyph name.
 *
 * abcts names glyphs by SMuFL, which is the standard and what Bravura ships. abcjs has
 * its own vocabulary, inherited from the Postscript music fonts it grew out of —
 * `noteheads.quarter`, `scripts.ufermata`, `flags.d8th`. The parity build needs abcjs's
 * outlines AND its advances (they differ from Bravura's by up to 13%, which moves notes),
 * so it needs this bridge.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 * An unmapped glyph is NOT an oversight to be filled in later — in most cases abcjs has
 * no such glyph, and that absence is itself the parity behaviour. Three groups:
 *
 *  1. **abcjs draws nothing.** Three-quarter-tone accidentals are the recorded example:
 *     abcjs has `halfsharp` and `halfflat` but nothing for three quarters, and strict
 *     mode already reproduces that blank. Mapping them would be inventing parity.
 *
 *  2. **abcjs COMPOSES rather than having a glyph.** Dynamics are letters: it draws `pp`
 *     from the `p` glyph twice, where Bravura has a single kerned `dynamicPP`. A 1:1 map
 *     cannot express that, and faking it with one letter would draw the wrong mark.
 *
 *  3. **abcjs draws it as geometry, not a glyph.** Braces and brackets are constructed
 *     paths in its engraver, not entries in its glyph table.
 *
 * `glyph-map.test.ts` asserts every name here exists in abcjs's table, and lists what is
 * unmapped so the gap stays visible instead of being discovered later as a blank on a page.
 */

/**
 * The mapping. Left side is a `GlyphName` from `glyphs.ts`; right side is a key of
 * `ABCJS_GLYPHS`.
 *
 * Several SMuFL names collapse onto one abcjs glyph, which is a real difference in
 * vocabulary rather than a shortcut: abcjs has ONE `scripts.staccato` and orients it by
 * position, where SMuFL distinguishes `articStaccatoAbove` from `articStaccatoBelow`.
 */
export const SMUFL_TO_ABCJS: Readonly<Record<string, string>> = {
  // Noteheads
  // A BREVE — `chartable.note[-1]`, which abcjs reaches for any note two whole notes
  // long. `G8` under `L:1/4` is one, and every `clefs` fixture is exactly that.
  noteheadDoubleWhole: 'noteheads.dbl',
  noteheadWhole: 'noteheads.whole',
  noteheadHalf: 'noteheads.half',
  noteheadBlack: 'noteheads.quarter',
  noteheadXBlack: 'noteheads.indeterminate',
  noteheadSlashVerticalEnds: 'noteheads.slash.nostem',
  noteheadSlashWhiteWhole: 'noteheads.slash.whole',
  noteheadSlashHorizontalEnds: 'noteheads.slash.quarter',
  // THE STYLED HEADS — `V:… style=` and `%%percmap`'s third field. abcjs keeps ONE glyph
  // per style whatever the duration (`abstract-engraver.js:36-41`: every durlog key of
  // `triangle` and of `harmonic` is the same `.quarter`), so the filled and open SMuFL
  // names both land on it. Only `rhythm` splits, and by durlog rather than by fill.
  //
  // They were absent because the GENERATOR could not see them, not because abcjs lacks
  // them: abcjs adds these four by assignment after its table literal, under "Custom
  // characters that weren't generated from the font". A name missing here falls through
  // to Bravura in strict — the defect class the Bravura ruling closes — and the triangle
  // was 0.117 pitch of reserve out because of it.
  noteheadTriangleUpBlack: 'noteheads.triangle.quarter',
  noteheadTriangleUpWhite: 'noteheads.triangle.quarter',
  noteheadDiamondBlack: 'noteheads.harmonic.quarter',
  noteheadDiamondWhite: 'noteheads.harmonic.quarter',

  // Clefs
  gClef: 'clefs.G',
  fClef: 'clefs.F',
  cClef: 'clefs.C',
  // `clef=perc`. abcjs DRAWS it — `case 'perc': clef = "clefs.perc"`
  // (`create-clef.js:26`) — and its 21px is 26 of prefix once the clef's own `dx = 5` is
  // on it. Bravura has no entry here, so the other modes still draw nothing.
  unpitchedPercussionClef1: 'clefs.perc',

  // Accidentals. `halfsharp`/`halfflat` are abcjs's quarter tones; it has no three-quarter
  // tone glyph at all, which is why those two SMuFL names are absent — see the header.
  accidentalSharp: 'accidentals.sharp',
  accidentalFlat: 'accidentals.flat',
  accidentalNatural: 'accidentals.nat',
  accidentalDoubleSharp: 'accidentals.dblsharp',
  accidentalDoubleFlat: 'accidentals.dblflat',
  accidentalQuarterToneSharpStein: 'accidentals.halfsharp',
  accidentalQuarterToneFlatStein: 'accidentals.halfflat',

  // Rests
  restWhole: 'rests.whole',
  restHalf: 'rests.half',
  restQuarter: 'rests.quarter',
  rest8th: 'rests.8th',
  rest16th: 'rests.16th',
  rest32nd: 'rests.32nd',
  rest64th: 'rests.64th',
  rest128th: 'rests.128th',

  // Flags
  flag8thUp: 'flags.u8th',
  flag8thDown: 'flags.d8th',
  flag16thUp: 'flags.u16th',
  flag16thDown: 'flags.d16th',
  flag32ndUp: 'flags.u32nd',
  flag32ndDown: 'flags.d32nd',
  flag64thUp: 'flags.u64th',
  flag64thDown: 'flags.d64th',

  // Time signatures. The digits are abcjs's plain numeral glyphs, named "0".."9".
  timeSig0: '0',
  timeSig1: '1',
  timeSig2: '2',
  timeSig3: '3',
  timeSig4: '4',
  timeSig5: '5',
  timeSig6: '6',
  timeSig7: '7',
  timeSig8: '8',
  timeSig9: '9',
  timeSigPlus: '+',
  timeSigCommon: 'timesig.common',
  timeSigCutCommon: 'timesig.cut',

  // Dots
  augmentationDot: 'dots.dot',

  // Articulations. abcjs orients one glyph by placement where SMuFL has an Above/Below
  // pair, so both SMuFL names land on the same abcjs entry.
  articStaccatoAbove: 'scripts.staccato',
  articStaccatoBelow: 'scripts.staccato',
  articAccentAbove: 'scripts.sforzato',
  articAccentBelow: 'scripts.sforzato',
  articTenutoAbove: 'scripts.tenuto',
  articTenutoBelow: 'scripts.tenuto',
  articMarcatoAbove: 'scripts.umarcato',
  articMarcatoBelow: 'scripts.dmarcato',
  fermataAbove: 'scripts.ufermata',
  fermataBelow: 'scripts.dfermata',

  // Ornaments
  ornamentTrill: 'scripts.trill',
  // THE IRISH ROLL, and it was the last Bravura metric reachable in strict on the
  // decoration path. abcjs's `scripts.roll` is 6.125px tall against Bravura's
  // `ornamentTremblement` at 7.564, and a decoration is stacked by
  // `symbolHeightInPitches(symbol) + 1` — so every `~` or `R` cost 0.3714 pitch too much
  // and the two of them together carried a whole system 2.66px down.
  //
  // It sat in `UNMAPPED_ABCJS` because no SMuFL name CLAIMS abcjs's roll — the list's own
  // first paragraph says an absence there is usually the parity behaviour. It is not here:
  // abcjs draws a mark, we draw a mark, and the only question was whose metrics measure it.
  ornamentTremblement: 'scripts.roll',
  ornamentMordent: 'scripts.mordent',
  ornamentShortTrill: 'scripts.prall',
  ornamentTurn: 'scripts.turn',

  // Techniques
  stringsUpBow: 'scripts.upbow',
  stringsDownBow: 'scripts.downbow',
  stringsThumbPosition: 'scripts.thumb',
  brassMuteOpen: 'scripts.open',
  pluckedSnapPizzicatoAbove: 'scripts.snap',
  pluckedSnapPizzicatoBelow: 'scripts.snap',
  wiggleArpeggiatoUp: 'scripts.arpeggio',

  // Navigation and breath
  segno: 'scripts.segno',
  coda: 'scripts.coda',
  breathMarkComma: 'scripts.comma',
  restHBar: 'rests.multimeasure',
}

/** abcjs glyphs no SMuFL name above claims — its vocabulary, minus what we use. */
export const UNMAPPED_ABCJS = [
  'scripts.stopped',
  'scripts.wedge',
  'scripts.longphrase',
  'scripts.mediumphrase',
  'scripts.shortphrase',
  'flags.ugrace',
  'flags.dgrace',
  'tab.big',
  'tab.tiny',
  'timesig.imperfectum',
  'timesig.imperfectum2',
  'timesig.perfectum',
  'timesig.perfectum2',
  // Text glyphs abcjs draws inline in chord symbols and annotations — a `,` in a figured
  // bass. abcts sets prose in <text>, so it has no outline for it and needs none. (`+` is
  // no longer here: an additive meter draws one, so it is mapped from `timeSigPlus`.)
  ',',
  'f',
  'm',
  'p',
  'r',
  's',
  'z',
  '-',
  '.',
] as const
