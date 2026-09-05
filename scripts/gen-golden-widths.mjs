// Regenerates `src/renderer/golden-widths.ts` from the golden generator's own tables.
//
// Those tables live in the sibling abcMusicKit repo beside `dump-svg.js`, which is what
// produced every SVG golden we measure against. Nothing from that repo is committed here,
// so the numbers are copied in at generation time rather than imported at build time.

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const widths = require('../../abcMusicKit/Tools/abcjs-debug/dump-elements-char-widths.js')

const NOTES = {
  repeatfont: 'TNR 17px regular — the DEFAULT, and what three of the six size brackets resolve to.',
  vocalfont: 'TNR 17px bold.',
  gchordfont: 'Helvetica 16px.',
  measurefont:
    'TNR Italic 19px — THIRTY-ONE characters. Every letter past `C` falls to the flat 8.',
  partsfont: 'TNR Bold 20px.',
}

const B = '`'
let out = `// GENERATED from ${B}../abcMusicKit/Tools/abcjs-debug/dump-elements-char-widths.js${B}.
// Regenerate: node scripts/gen-golden-widths.mjs — DO NOT EDIT.
//
// THE GOLDEN GENERATOR'S OWN TEXT METRICS, and therefore the parity target.
//
// ${B}dump-svg.js${B} patches ${B}getBBox${B} onto jsdom's SVG text elements and measures with
// ${B}calcWidth${B} (${B}dump-svg.js:62-84${B}): pick ONE of these five tables by font SIZE, sum
// ${B}widths[ch] || 8${B}, take the widest line. The tables are WebKit-calibrated ASCII and
// nothing else — CJK, accented Latin and every ${B}measurefont${B} letter past ${B}C${B} measure 8.
//
// Reproducing this makes our SVG match the goldens and our real output diverge from a
// browser's, which is the point: ${B}abcjs-strict${B} is faithful to abcjs, and abcMusicKit v1
// — production, byte-identical to these goldens — already does the same on purpose
// (${B}abcRenderer.swift:108-109${B}, "matches dump-svg.js getBBox patch"). The real per-em
// metrics in ${B}text-metrics.ts${B} are what ${B}abcjs-extended${B} and ${B}extended${B} keep.
//
// Widths are PIXELS at the table's own size, not per em.
`

for (const key of ['repeatfont', 'vocalfont', 'gchordfont', 'measurefont', 'partsfont']) {
  const name = `GOLDEN_${key.replace('font', '').toUpperCase()}`
  out += `\n/** ${NOTES[key]} */\nexport const ${name}: Readonly<Record<string, number>> = ${JSON.stringify(widths[key])}\n`
}

writeFileSync(new URL('../src/renderer/golden-widths.ts', import.meta.url), out)
// The tables come out as one long line each; `npx biome check --write
// src/renderer/golden-widths.ts` afterwards is what makes the file readable and the lint
// clean. Doing it here would mean shelling out from a script that otherwise only reads.
