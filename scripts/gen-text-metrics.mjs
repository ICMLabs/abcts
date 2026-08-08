/**
 * Generates `src/renderer/text-metrics.ts` — per-character advance widths for prose.
 *
 *   node scripts/gen-text-metrics.mjs
 *
 * WHY THIS EXISTS. Everything that centres or advances past text used one flat number:
 * `text.length * size * 0.5`. So `iiiii` and `WWWWW` measured the same. Against real
 * serif metrics over the 348 distinct strings in the corpus, that estimate has a median
 * error of 8.9% and a worst case of +77% — on exactly the short narrow syllables lyrics
 * are made of (`li`, `I'll`, `f`). Centred text halves the error, but the melisma
 * extender starts at the text's right edge and takes it in full.
 *
 * WHAT `0.5` ACTUALLY WAS: the average advance per character of a lowercase serif, in em.
 * So a real per-character table in the same units is a drop-in — same overall scale, but
 * the relative proportions become right.
 *
 * WHY MEASURED AND NOT LOOKED UP. Typing AFM numbers from memory is the kind of thing
 * that reads as authoritative and is quietly wrong. These come out of a real font file.
 *
 * SOURCE FONTS — THE ONES abcjs NAMES, AND NO LONGER NORMALISED.
 *
 * This used to measure Georgia and rescale it to a mean letter advance of 0.5 em, on the
 * grounds that opentype.js cannot read a `.ttc` and Times ships as one. Times New Roman
 * ships as a plain `.ttf` on this machine, so that reason had lapsed — and the absolute
 * scale stopped being cosmetic the moment a lyric's width became part of its note's ROD.
 *
 * abcjs's own defaults (`parse/abc_parse_directive.js:20-42`) are the specification:
 *
 *   vocalfont       "Times New Roman" 13pt BOLD    lyrics
 *   gchordfont      Helvetica         12pt         chord symbols
 *   annotationfont  Helvetica         12pt         annotations
 *   titlefont etc.  "Times New Roman"              prose
 *
 * and the abcjs goldens were measured against real browser metrics for exactly those. The
 * check, against widths read out of abcjs's `extraw` by probe: `Hap-` 36.875 against Times
 * New Roman Bold's 36.84, `birth-` 42.563 against 42.50, `Amaj7` 45.38 against Arial's
 * 45.35. Normalised Georgia had them a uniform 13% narrow.
 *
 * Arial stands in for Helvetica, which is `.ttc`-only here. The two are metrically
 * compatible by design and the numbers above are the proof, not the claim.
 *
 * LICENSING. This emits ADVANCE WIDTHS — a table of numbers measured from a font, not any
 * part of its outlines, and nothing here lets anyone reconstruct a glyph. That is
 * materially different from `glyphs.ts`, which embeds real outline data and therefore
 * carries Bravura's OFL notice. No font is redistributed by this file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const FONTS = {
  CHAR_ADVANCE: {
    file: '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
    what: 'serif, regular — titles, prose, anything with no font of its own',
  },
  CHAR_ADVANCE_BOLD: {
    file: '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf',
    what: "serif, bold — abcjs's `vocalfont`, so every lyric, and `tempofont`",
  },
  CHAR_ADVANCE_SANS: {
    file: '/System/Library/Fonts/Supplemental/Arial.ttf',
    what: "sans — abcjs's `gchordfont` and `annotationfont`, i.e. Helvetica's metrics",
  },
}
const OUT = resolve(root, 'src/renderer/text-metrics.ts')

/**
 * Printable ASCII, plus the accented letters the corpus actually uses. Anything else
 * falls back to the average, which is what the whole estimate used to be.
 */
const CHARS = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  ...'àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇÑßœæ',
  // Pinyin tone marks appear in the corpus's Chinese-lyric fixture.
  ...'āēīōūǎěǐǒǔ',
  // Punctuation real tunes carry — a copyright line, an ellipsis, typographic quotes and
  // dashes. Found by auditing which corpus characters the table was missing.
  ...'©…–—‘’“”†‡§¶•·',
]

const round = (n) => Number(n.toFixed(4))

/** One face: its advances in em, and the mean LETTER advance as the unknown-char fallback. */
function measure(file) {
  const font = opentype.parse(readFileSync(file).buffer)
  const widths = {}
  let sum = 0
  let counted = 0
  for (const ch of CHARS) {
    const w = font.getAdvanceWidth(ch, 1000) / 1000
    if (!Number.isFinite(w) || w <= 0) continue
    widths[ch] = round(w)
    // Averaged over LETTERS only — folding in space and punctuation would drag the mean
    // well below a realistic character.
    if (/[a-zA-Z]/.test(ch)) {
      sum += w
      counted += 1
    }
  }
  return { widths, fallback: round(sum / counted) }
}

const tables = Object.entries(FONTS).map(([name, { file, what }]) => {
  const { widths, fallback } = measure(file)
  const entries = Object.entries(widths)
    .map(([ch, w]) => `  ${JSON.stringify(ch)}: ${w},`)
    .join('\n')
  return { name, what, count: Object.keys(widths).length, fallback, entries }
})

const ts = `// GENERATED by scripts/gen-text-metrics.mjs — DO NOT EDIT.
// Regenerate: node scripts/gen-text-metrics.mjs
//
// Per-character advance widths in EM, one table per face abcjs names in its font
// defaults. REAL advances, not normalised: a lyric's width is part of its note's rod, so
// the absolute scale decides where the music goes and not just where the text sits.
//
// These are measurements — a table of numbers — not font outlines. Nothing here
// reproduces any part of a typeface, so unlike \`glyphs.ts\` this file carries no font
// licence. See the generator for which font stands for which of abcjs's, and for the
// probe numbers that check each one.

${tables
  .map(
    (t) => `/**
 * Advance width in em for one character, at font-size 1 — ${t.what}.
 */
export const ${t.name}: Readonly<Record<string, number>> = {
${t.entries}
}

/** Mean advance of the LETTERS above, for a character the table does not carry. */
export const ${t.name}_FALLBACK = ${t.fallback}
`,
  )
  .join('\n')}
/**
 * The default fallback — the serif one, for callers that name no face.
 *
 * Letters only: folding in space and punctuation would pull this well below a realistic
 * unknown character, which is likelier to be a letter in some script than a comma.
 */
export const FALLBACK_ADVANCE = ${tables[0].fallback}
`

writeFileSync(OUT, ts)
for (const t of tables)
  console.log(`gen-text-metrics: ${t.name} — ${t.count} advances, fallback ${t.fallback}`)
console.log(`  → ${OUT}`)
