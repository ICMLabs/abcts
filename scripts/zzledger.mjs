/**
 * **THE `ponytail:` LEDGER, SWEPT — one CONTROL per open prediction, both engines live.**
 *
 * The repo's own rule: a `ponytail:` saying *"no fixture in either corpus writes one"* is a
 * PREDICTION, not a measurement, and writing the fixture is how it becomes one. Thirteen of
 * one day's thirty-one defects came from four sweeps of this ledger; it has grown from 54
 * markers to 97 since the last one.
 *
 * Same harness as `zzlive.mjs` — abcjs 6.7.0 and abcts in ONE WebKit page, byte-compared —
 * because the tunes are not in the corpus yet and there is nothing to harvest a golden
 * from. A row that DIFFERS names a defect the ledger predicted was harmless; a row that
 * AGREES closes the marker, which is worth as much and costs the same.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzledger.mjs
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit, chromium } = require0(process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js')

const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const OURS = join(import.meta.dirname, '..', 'dist', 'abcts-browser.global.js')
if (!existsSync(OURS)) throw new Error(`no ${OURS} — run npm run build`)

const H = 'X:1\nM:4/4\nL:1/4\n'
/** [marker, what it predicts, abc] — one variable per rung, as the ladder rule asks. */
const CASES = [
  ['layout.ts:9145', 'a curve whose ends fall in different SYSTEMS is dropped',
    `${H}K:C\n(CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd')|\n`],
  ['layout.ts:9296', 'a chord where one head closes a slur still contributes its others',
    `${H}K:C\n(C [Ec]) d e|\n`],
  ['layout.ts:13469', 'one LINE holding two lyric elements with different vocalPosition',
    `${H}K:C\nCDEF|[I:vocal below]GABc|\nw:a b c d e f g h\n`],
  ['layout.ts:19807', 'an ANNOTATION on the other voice’s note at a rest collision',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nz4|\nV:2\n"^x"CDEF|\n`],
  ['layout.ts:374', 'three annotations above AND two below on one note',
    `${H}K:C\n"^a""^b""^c""_d""_e"C D E F|\n`],
  ['layout.ts:13417', 'SOME voices on a staff declare stems= and others do not',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1 stems=up\nV:2\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n`],
  ['layout.ts:3564', 'a Q: whose beat unit is 3/32 — abcjs’s table names a glyph that does not exist',
    `X:1\nM:4/4\nL:1/4\nQ:3/32=60\nK:C\nCDEF|\n`],
  ['layout.ts:14857', 'a moved bar that also carries a bar NUMBER',
    `X:1\n%%barnumbers 1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|GABc|\nV:2\nC,8|G,8|\n`],
  ['parser.ts:365', 'an unsupported key signature that also carries a parameter',
    `X:1\nM:4/4\nL:1/4\nK:Cbmin clef=bass\nCDEF|\n`],
  ['parser.ts:6623', 'a microtone INSIDE a chord',
    `${H}K:C\n[^/C^/E] D E F|\n`],
  ['parser.ts:5019', 'a voice DECLARED AFTER a K: that carries transpose=',
    `X:1\nM:4/4\nL:1/4\nK:C transpose=2\nV:1\nCDEF|\n`],
  ['parser.ts:7472', 'a lyric line carrying a | bar-alignment hint',
    `${H}K:C\nCDEF|GABc|\nw:a b|c d e f g h\n`],
  ['parser.ts:1114', 'a two-voice staff back-filled by %%score',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2) 3\nV:1\nV:2\nV:3\nK:C\nV:1\nCDEF|\nV:2\nGABc|\nV:3\nEFGA|\n`],
  ['model.ts:2003', 'free text BETWEEN two music lines',
    `${H}K:C\nCDEF|\n%%text between\nGABc|\n`],
  ['model.ts:286', 'a clef written explicitly where the default would be the same',
    `X:1\nM:4/4\nL:1/4\nK:C clef=treble\nCDEF|\n`],
  ['lines.ts:1077', 'a melisma held across more than one verse',
    `${H}K:C\nCDEF|\nw:a_ b c d\nw:e_ f g h\n`],
]

const engine = process.env.ENGINE === 'chrome'
  ? { launcher: chromium, opts: { channel: 'chrome' }, name: 'chrome' }
  : { launcher: webkit, opts: {}, name: 'webkit' }
const browser = await engine.launcher.launch(engine.opts)
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
await page.addScriptTag({ content: readFileSync(OURS, 'utf-8') })
const ready = await page.evaluate(() => ({
  abcjs: typeof window.ABCJS?.renderAbc, abcts: typeof window.ABCTS?.renderAbc,
}))
if (ready.abcjs !== 'function' || ready.abcts !== 'function')
  throw new Error(`engines did not load: ${JSON.stringify(ready)}`)

/**
 * **THE FOUR THE SWEEP FOUND, each measured and each written up in ABCJS-DIFFERENCES.md.**
 * A marker here is a defect that is KNOWN and NAMED, never a tolerance: remove the row when
 * it is fixed and this goes red if it was not.
 */
const KNOWN = new Map([
  ['layout.ts:3564', 'abcjs draws NO flag and colours the mark #ff0000 — its own table names flags.u16nd, which does not exist'],
  // ✅ parser.ts:365 — FIXED 2026-09-08. abcjs's key table is harvested into
  // `src/core/keys-abcjs.ts` and consulted by `keyFifths`; an unrecognised spelling redraws
  // the key IN FORCE (`abcjsKeepsKey`); and the cancelling naturals compare the note LETTER
  // alone, as abcjs does. Header 48 of 168 -> 0, inline 128 of 336 -> 0.
  ['parser.ts:7472', 'a | bar hint in a w: line re-aligns the remaining syllables to the next barline; we drop it'],
  ['lines.ts:1077', 'a melisma is tracked for verse 1 only, so verse 2 loses abcjs literal _'],
])

const rows = []
let differ = 0
let unexpected = 0
let stale = 0
for (const [marker, claim, abc] of CASES) {
  const r = await page.evaluate((abc) => {
    const render = (API) => {
      try {
        const d = document.createElement('div')
        d.style.position = 'absolute'
        // visibility, NOT display — see zzlive: getBBox() answers 0 in a display:none tree.
        d.style.visibility = 'hidden'
        document.body.appendChild(d)
        API.renderAbc([d], abc, { staffwidth: 670 })
        const svg = d.querySelector('svg')
        const s = svg ? svg.outerHTML : 'NO SVG'
        d.remove()
        return s
      } catch (e) { return 'THREW: ' + e.message }
    }
    return { js: render(window.ABCJS), ts: render(window.ABCTS) }
  }, abc)
  if (r.js === r.ts) {
    if (KNOWN.has(marker)) { stale += 1; rows.push(`  STALE    ${marker.padEnd(20)} agrees now — drop it from KNOWN`) }
    else rows.push(`  agrees   ${marker.padEnd(20)} ${claim}`)
    continue
  }
  differ += 1
  if (!KNOWN.has(marker)) unexpected += 1
  let i = 0
  while (i < Math.min(r.js.length, r.ts.length) && r.js[i] === r.ts[i]) i += 1
  rows.push(
    `  ${KNOWN.has(marker) ? 'known  ' : 'DIFFERS'}  ${marker.padEnd(20)} ${KNOWN.get(marker) ?? claim}\n` +
      `           at byte ${i}\n` +
      `           abcjs ${JSON.stringify(r.js.slice(Math.max(0, i - 30), i + 90))}\n` +
      `           abcts ${JSON.stringify(r.ts.slice(Math.max(0, i - 30), i + 90))}`,
  )
}
await browser.close()
const head =
  `ponytail ledger sweep — ${CASES.length} controls, both engines live in ${engine.name}\n` +
  `${differ} differ (${KNOWN.size} known), ${CASES.length - differ} agree\n`
writeFileSync(`/tmp/abcts-ledger-${engine.name}.txt`, head + rows.join('\n') + '\n')
console.log(head + rows.join('\n'))
if (unexpected > 0 || stale > 0) {
  console.error(`\nFAIL: ${unexpected} undeclared divergence(s), ${stale} stale KNOWN row(s)`)
  process.exit(1)
}
