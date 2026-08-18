/**
 * Harvest abcjs's `tune.deline()` — its MERGED line list — over both corpora, by RUNNING
 * abcjs 6.7.0 rather than reading its source. abcjs's own suite asserts it nowhere.
 *
 * ── WHAT `deline` IS ────────────────────────────────────────────────────────
 * `tune.lines` is one line per DRAWN system. `deline` merges every consecutive music line
 * back into one — a host that wants the tune's stream rather than its layout reads this —
 * and, because the staff's own furniture is per LINE, it moves any of `meter`/`key`/`clef`
 * (and four fonts) that CHANGED at a line boundary into the voice stream as an element with
 * `startChar`/`endChar` of `-1`, deleting it off the staff (`data/deline-tune.js:14-72`).
 *
 * Two quirks the port has to keep:
 *   - **THE UNSHIFTED ELEMENT'S `el_type` IS NOT THE STREAM'S NAME.** deline writes `meter`,
 *     `key` and `clef` where the parser's own in-stream elements are `timeSignature`,
 *     `keySignature` and `clef`.
 *   - **A NON-MUSIC LINE STOPS THE MERGE.** `inMusicLine` is cleared by any line with no
 *     `staff` — a `subtitle`, a `%%text`, a `%%sep`, a `%%vskip` — so the music line after
 *     one is a NEW output line. Eight tunes across the two corpora are written that way.
 *
 * ── THE SHAPE ───────────────────────────────────────────────────────────────
 * REDUCED, unlike `metaTextInfo`'s golden: the raw output is every element of every tune
 * with every field the engraver later stamps on it. What `deline` itself decides is the
 * LINE COUNT, the per-voice ELEMENT ORDER and which staff fields it moved, so each line
 * becomes a row of strings — `el_type@start..end` per element, plus what stayed on the
 * staff. `tune.lines`'s own per-character gate is what defends the spans themselves.
 *
 * Both option shapes are harvested: the default and `{lineBreaks: true}`, which pushes an
 * `{el_type: "break"}` at every join.
 *
 * ── WHY IT RENDERS RATHER THAN PARSES ───────────────────────────────────────
 * **THE ENGRAVER RENAMES THE ELEMENT IT DRAWS.** `createKeySignature` opens with
 * `elem.el_type = "keySignature"` and `createTimeSignature` with `"timeSignature"`
 * (`write/creation/create-key-signature.js:8`, `create-time-signature.js:8`), writing on
 * the very object `tune.lines` holds — so a PARSE-ONLY tune says `key`/`meter` where a
 * rendered one says `keySignature`/`timeSignature`, and a host gets the rendered one.
 * Harvesting from a parse would have written an oracle no `renderAbc` caller can ever see.
 * That means jsdom and `dump-svg.js`'s `getBBox` stub, lifted here as
 * `harvest-abcjs-toptext.mjs` lifts it.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 *   node scripts/harvest-abcjs-deline.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const tools = join(root, config.goldens, '..')

const require = createRequire(join(tools, 'package.json'))
const { JSDOM } = require('jsdom')
const charWidths = require(join(tools, 'dump-elements-char-widths.js'))

// ── `dump-svg.js`'s text metrics, so a boxed font does not kill the run under jsdom ──
const fontHeights = { 27: 29.91, 21: 23.27, 20: 22.16, 19: 21.06, 17: 18.84, 16: 18.52, 15: 17.5 }
const calcWidth = (str, fontSize, fontWeight) => {
  if (!str) return 0
  let fontType = 'repeatfont'
  if (fontSize >= 27) fontType = 'titlefont'
  else if (fontSize >= 21) fontType = 'subtitlefont'
  else if (fontSize >= 20) fontType = 'partsfont'
  else if (fontSize >= 19) fontType = 'measurefont'
  else if (fontSize >= 17) fontType = fontWeight === 'bold' ? 'vocalfont' : 'repeatfont'
  else if (fontSize >= 16) fontType = 'gchordfont'
  const widths = charWidths[fontType] ?? charWidths.repeatfont ?? {}
  let maxWidth = 0
  for (const line of String(str).split('\n')) {
    let lineWidth = 0
    for (const ch of line) lineWidth += widths[ch] ?? 8
    if (lineWidth > maxWidth) maxWidth = lineWidth
  }
  return maxWidth
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>')
const origCreateElementNS = dom.window.document.createElementNS.bind(dom.window.document)
dom.window.document.createElementNS = (ns, tag) => {
  const el = origCreateElementNS(ns, tag)
  if (tag === 'text' || tag === 'tspan') {
    el.getBBox = () => {
      const fontSize = parseFloat(el.getAttribute('font-size')) || 16
      let fontWeight = el.getAttribute('font-weight') || 'normal'
      if (fontWeight === 'normal' && el.parentElement)
        fontWeight = el.parentElement.getAttribute('font-weight') || 'normal'
      let h = fontHeights[Math.round(fontSize)] ?? fontSize + 2
      let w = 0
      const tspans = el.querySelectorAll ? el.querySelectorAll('tspan') : []
      if (tspans.length > 0) {
        let nonEmpty = 0
        for (const tspan of tspans) {
          const ttext = tspan.textContent || ''
          if (ttext.length > 0) {
            w = Math.max(w, calcWidth(ttext, fontSize, fontWeight))
            nonEmpty += 1
          }
        }
        if (nonEmpty > 1) h = h + (nonEmpty - 1) * fontSize * 1.2
      } else {
        w = calcWidth(el.textContent || '', fontSize, fontWeight)
      }
      return { x: 0, y: 0, width: w, height: h }
    }
  }
  return el
}
global.document = dom.window.document
global.window = dom.window
const ABCJS = require(join(abcjsPath, 'index'))

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]

/** One line of the deline output as rows of text — see THE SHAPE above. */
export function rowsOfLine(line, i) {
  if (!line.staff) {
    const kind = line.subtitle !== undefined
      ? 'subtitle'
      : line.text !== undefined
        ? 'text'
        : line.separator !== undefined
          ? 'separator'
          : line.vskip !== undefined
            ? 'vskip'
            : Object.keys(line).join('+')
    return [`L${i} ${kind}`]
  }
  const out = []
  line.staff.forEach((staff, s) => {
    const kept = ['meter', 'key', 'clef'].filter((k) => staff[k] !== undefined)
    out.push(`L${i} s${s} kept=${kept.join(',')}`)
    staff.voices.forEach((voice, v) => {
      out.push(
        `L${i} s${s} v${v} ${voice
          .map((e) => `${e.el_type}@${e.startChar}..${e.endChar}`)
          .join(' ')}`,
      )
    })
  })
  return out
}

const out = {}
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    const n = ABCJS.numberOfTunes(abc)
    const slots = []
    for (let k = 0; k < n; k += 1) slots.push('*')
    for (const [suffix, options] of [['', {}], ['#breaks', { lineBreaks: true }]]) {
      // A FRESH RENDER per option shape: `deline` clones its lines but MUTATES the staff
      // field objects it moves, which are the parse tree's own.
      let tunes
      try {
        tunes = ABCJS.renderAbc(slots, abc, {})
      } catch (e) {
        console.error(`SKIPPED ${label}/${file}: ${e.message}`)
        break
      }
      tunes.forEach((tune, i) => {
        out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}${suffix}`] = tune
          .deline(options)
          .flatMap(rowsOfLine)
      })
    }
  }
}

const outDir = join(root, 'tests', 'corpus-deline')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} cases, ${rows} rows`)
