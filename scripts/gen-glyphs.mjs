/**
 * Generates `src/renderer/glyphs.ts` — SMuFL glyph outlines + metrics, in staff spaces.
 *
 *   node scripts/gen-glyphs.mjs
 *
 * Outlines come from Bravura.otf via opentype.js. Metrics (bbox, anchors, advance,
 * engraving defaults) come from `bravura_metadata.json`, which publishes them in staff
 * spaces already — so no unit conversion is applied to them, only to the outlines.
 *
 * Units: 1 em = 4 staff spaces (SMuFL). Outlines are emitted y-DOWN (SVG convention),
 * origin at the glyph origin, which for staff-relative glyphs is the middle staff line.
 *
 * The glyph list is `GLYPHS` below. Adding a glyph is: add the name, re-run, commit.
 * Only listed glyphs are emitted — Bravura defines 3449 and a renderer uses dozens.
 *
 * LICENSE: the generated path data is derived from Bravura, which is SIL OFL 1.1.
 * The generated file carries an OFL header and is licensed OFL 1.1, not MIT. This
 * script, and every other file in abcts, is MIT.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const v2 = resolve(root, '../abcMusicKit2')

const FONT = resolve(v2, 'Sources/abcMusicKit2Fonts/Resources/Bravura.otf')
const META = resolve(v2, 'Tools/bravura_metadata.json')
const NAMES = resolve(v2, 'Tools/glyphnames.json')
const OUT = resolve(root, 'src/renderer/glyphs.ts')

/**
 * The glyphs the renderer draws. Grows as fixtures demand — the parser phase grew its
 * coverage the same way, from the diff against the next fixture rather than from a
 * feature list drawn up in advance.
 */
const GLYPHS = [
  // Staff connectors — `%%score {A B}` braces a grand staff, `[A B]` brackets a family.
  // SMuFL's brace is drawn to be stretched vertically; the bracket is a rule with
  // separate serif glyphs at each end.
  'brace',
  'bracketTop',
  'bracketBottom',
  // Clefs
  'gClef',
  'fClef',
  'cClef',
  // `clef=perc`, which abcjs DRAWS. Absent from this list until 2026-08-06, so a
  // regeneration would have deleted it from the table it is mapped in.
  'unpitchedPercussionClef1',
  // Noteheads
  // A BREVE. abcjs's `chartable.note[-1]` is `noteheads.dbl` and it reaches it for any
  // note two whole notes long — `G8` under `L:1/4`, which is what every `clefs` tune is.
  'noteheadDoubleWhole',
  'noteheadWhole',
  'noteheadHalf',
  'noteheadBlack',
  // Styled heads — `!style=x!` and `[K: style=x]`. abcjs draws harmonic as a diamond,
  // x as `noteheads.indeterminate`, rhythm as a slash. White variants are here because
  // a styled note can still be a half or a whole.
  'noteheadDiamondBlack',
  'noteheadDiamondWhite',
  'noteheadXBlack',
  'noteheadTriangleUpBlack',
  'noteheadTriangleUpWhite',
  // …and the rhythm slash splits by DURATION, not by fill: abcjs keys it by durlog —
  // `noteheads.slash.whole` for a whole or half, `.slash.quarter` for a quarter and
  // shorter, `.slash.nostem` when there is no stem (`abstract-engraver.js:38`). Three
  // glyphs, so three SMuFL names.
  'noteheadSlashWhiteWhole',
  'noteheadSlashHorizontalEnds',
  'noteheadSlashVerticalEnds',
  // Flags
  'flag8thUp',
  'flag8thDown',
  'flag16thUp',
  'flag16thDown',
  'flag32ndUp',
  'flag32ndDown',
  'flag64thUp',
  'flag64thDown',
  // Accidentals
  'accidentalFlat',
  'accidentalNatural',
  'accidentalSharp',
  'accidentalDoubleSharp',
  'accidentalDoubleFlat',
  // Microtones. abcjs draws only the QUARTER-tone pair — Stein's half-sharp and
  // half-flat — and nothing at all for three-quarter tones, which strict reproduces.
  // The three-quarter glyphs are for abc2.1/extended, which draw what the ABC says.
  'accidentalQuarterToneSharpStein',
  'accidentalQuarterToneFlatStein',
  'accidentalThreeQuarterTonesSharpStein',
  'accidentalThreeQuarterTonesFlatZimmermann',
  // Rests
  'restWhole',
  'restHalf',
  'restQuarter',
  'restHBar',
  'rest8th',
  'rest16th',
  // Time signatures
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
  // An additive meter draws one — `M:2+3/8` is the string `2+3` over `8`.
  'timeSigPlus',
  'timeSigCommon',
  'timeSigCutCommon',
  // Augmentation
  'augmentationDot',
  // Barlines — the dots of a repeat sign.
  'repeatDots',
  // Articulations. SMuFL gives an Above and a Below design for each rather than one
  // glyph reflected, because the shapes genuinely differ.
  'articStaccatoAbove',
  'articStaccatoBelow',
  'articAccentAbove',
  'articAccentBelow',
  'articTenutoAbove',
  'articTenutoBelow',
  'articMarcatoAbove',
  'articMarcatoBelow',
  // Ornaments — always above the staff.
  'fermataAbove',
  'fermataBelow',
  'ornamentTrill',
  'ornamentMordent',
  'ornamentShortTrill',
  'ornamentTurn',
  // Bowing.
  'stringsUpBow',
  'stringsDownBow',
  // Ornaments and techniques abcjs paints but we did not. Verified against its rendered
  // SVG rather than its element dump — the dump misses anything attached via addOther,
  // which is what made `slide` and `breath` look unsupported when they are not.
  'ornamentTremblement',
  'brassLiftShort',
  'breathMarkComma',
  'articStaccatissimoAbove',
  'articStaccatissimoBelow',
  'brassMuteOpen',
  'stringsThumbPosition',
  'pluckedSnapPizzicatoAbove',
  'pluckedSnapPizzicatoBelow',
  // Only reachable in abc2.1/extended — abcjs draws nothing for the inverted turns.
  'ornamentTurnInverted',
  'ornamentTurnSlash',
  // Tremolo: SMuFL gives ONE glyph per stroke count, so `!//!` is tremolo2 rather than
  // two copies of tremolo1.
  'tremolo1',
  'tremolo2',
  'tremolo3',
  'tremolo4',
  // `!+!` / `!plus!` — left-hand pizzicato, which is what the ABC `+` means.
  'pluckedLeftHandPizzicato',
  // Phrase separators, shortest to longest.
  'breathMarkTick',
  'caesuraShort',
  'caesura',
  // abcjs draws an arpeggio as a plain vertical rule; SMuFL's is the conventional wiggle.
  'wiggleArpeggiatoUp',
  // Navigation.
  'segno',
  'coda',
  // Dynamics. SMuFL has precomposed multi-letter glyphs; abcjs's volumeDecoration
  // handles all eleven of these names.
  'dynamicPiano',
  'dynamicMezzo',
  'dynamicForte',
  'dynamicPP',
  'dynamicPPP',
  'dynamicPPPP',
  'dynamicMP',
  'dynamicMF',
  'dynamicFF',
  'dynamicFFF',
  'dynamicFFFF',
  'dynamicSforzando1',
  // Fingerings — abcjs draws `!3!` as a decoration digit above the staff.
  'fingering0',
  'fingering1',
  'fingering2',
  'fingering3',
  'fingering4',
  'fingering5',
]

const font = opentype.parse(readFileSync(FONT).buffer)
const meta = JSON.parse(readFileSync(META, 'utf8'))
const names = JSON.parse(readFileSync(NAMES, 'utf8'))

/** 1 em = 4 staff spaces, so rendering at "fontSize" 4 yields staff-space coordinates. */
const EM_IN_STAFF_SPACES = 4

const round = (n) => Number(n.toFixed(4))

const entries = []
const missing = []

for (const name of GLYPHS) {
  const entry = names[name]
  if (!entry) {
    missing.push(`${name}: not in glyphnames.json`)
    continue
  }
  const codepoint = Number.parseInt(entry.codepoint.replace('U+', ''), 16)
  const glyph = font.charToGlyph(String.fromCodePoint(codepoint))
  // charToGlyph falls back to .notdef rather than throwing, so an absent glyph would
  // otherwise be emitted as an empty box that renders as a plausible-looking rectangle.
  if (!glyph || glyph.index === 0) {
    missing.push(`${name}: no outline in Bravura (U+${codepoint.toString(16).toUpperCase()})`)
    continue
  }

  // getPath(x, y, fontSize) already returns y-DOWN SVG coordinates.
  const path = glyph.getPath(0, 0, EM_IN_STAFF_SPACES).toPathData(4)
  if (!path) {
    missing.push(`${name}: empty outline`)
    continue
  }

  const bbox = meta.glyphBBoxes[name]
  const advance = meta.glyphAdvanceWidths[name]
  if (!bbox || advance === undefined) {
    missing.push(`${name}: no metrics in bravura_metadata.json`)
    continue
  }

  // Metadata is y-UP; the renderer works y-DOWN, so the box flips and NE/SW swap roles.
  const [east, north] = bbox.bBoxNE
  const [west, south] = bbox.bBoxSW

  const anchors = {}
  for (const [key, [ax, ay]] of Object.entries(meta.glyphsWithAnchors[name] ?? {})) {
    anchors[key] = [round(ax), round(-ay)]
  }

  entries.push({
    name,
    codepoint,
    path,
    x: round(west),
    y: round(-north),
    width: round(east - west),
    height: round(north - south),
    advance: round(advance),
    anchors,
  })
}

if (missing.length > 0) {
  console.error(`gen-glyphs: ${missing.length} glyph(s) could not be generated:`)
  for (const m of missing) console.error(`  - ${m}`)
  process.exit(1)
}

const defaults = meta.engravingDefaults

const ts = `// GENERATED by scripts/gen-glyphs.mjs — DO NOT EDIT.
// Regenerate: node scripts/gen-glyphs.mjs
//
// Bravura ${meta.fontVersion} — ${entries.length} glyphs.
//
// ─── LICENSE ─────────────────────────────────────────────────────────────────
// The path data in this file is derived from the Bravura font:
//
//   Copyright (c) 2021, Steinberg Media Technologies GmbH (http://www.steinberg.net/),
//   with Reserved Font Name "Bravura".
//   Licensed under the SIL Open Font License, Version 1.1 — http://scripts.sil.org/OFL
//
// THIS FILE ONLY is licensed OFL 1.1. The rest of abcts is MIT. The two are compatible:
// OFL permits redistribution and embedding, and requires only that derivatives of the
// font software stay OFL and not use the Reserved Font Name — hence "Bravura" appears
// here as attribution, never as an identifier this module exports.
// ─────────────────────────────────────────────────────────────────────────────
//
// UNITS: staff spaces throughout, y-DOWN (SVG convention). The origin is the glyph
// origin, which for staff-positioned glyphs sits on the middle staff line.

/** A point on a glyph, e.g. where a stem meets a notehead. Staff spaces, y-down. */
export type Anchors = Readonly<Record<string, readonly [number, number]>>

export interface Glyph {
  /** SVG path data, staff spaces, y-down, origin at the glyph origin. */
  readonly path: string
  /** SMuFL code point — for backends that emit <text> against an installed font. */
  readonly codepoint: number
  /** Bounding box, y-down: (x, y) is the TOP-left corner. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Horizontal advance — the spacing width, which is not always the ink width. */
  readonly advance: number
  readonly anchors: Anchors
}

/**
 * The font's own engraving defaults — line thicknesses and separations, staff spaces.
 * These are FONT metadata, not engine constants: a different SMuFL font ships different
 * values, and layout conventions (stem length, spacing) live in the engine instead.
 */
export const ENGRAVING_DEFAULTS = {
  staffLineThickness: ${defaults.staffLineThickness},
  stemThickness: ${defaults.stemThickness},
  beamThickness: ${defaults.beamThickness},
  beamSpacing: ${defaults.beamSpacing},
  legerLineThickness: ${defaults.legerLineThickness},
  legerLineExtension: ${defaults.legerLineExtension},
  thinBarlineThickness: ${defaults.thinBarlineThickness},
  thickBarlineThickness: ${defaults.thickBarlineThickness},
  barlineSeparation: ${defaults.barlineSeparation},
  repeatBarlineDotSeparation: ${defaults.repeatBarlineDotSeparation},
  slurEndpointThickness: ${defaults.slurEndpointThickness},
  slurMidpointThickness: ${defaults.slurMidpointThickness},
  tieEndpointThickness: ${defaults.tieEndpointThickness},
  tieMidpointThickness: ${defaults.tieMidpointThickness},
} as const

export type GlyphName =
${entries.map((e) => `  | '${e.name}'`).join('\n')}

export const GLYPHS: Readonly<Record<GlyphName, Glyph>> = {
${entries
  .map(
    (e) => `  ${e.name}: {
    path: '${e.path}',
    codepoint: 0x${e.codepoint.toString(16)},
    x: ${e.x},
    y: ${e.y},
    width: ${e.width},
    height: ${e.height},
    advance: ${e.advance},
    anchors: { ${Object.entries(e.anchors)
      .map(([k, v]) => `${k}: [${v[0]}, ${v[1]}]`)
      .join(', ')} },
  },`,
  )
  .join('\n')}
}
`

writeFileSync(OUT, ts)
console.log(`gen-glyphs: wrote ${entries.length} glyphs → ${OUT}`)
