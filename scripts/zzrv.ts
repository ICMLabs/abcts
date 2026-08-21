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
import { valuesOfTune } from '../tests/parse-values-script.js'
import { renderAbc } from '../src/compat/index.js'

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]
let agree = 0, total = 0, onlyMarker = 0
const kinds = new Map()
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    const n = ABCJS.numberOfTunes(abc)
    const slots = []
    for (let k = 0; k < n; k += 1) slots.push('*')
    let theirs, ours
    try { theirs = ABCJS.renderAbc(slots, abc, { staffwidth: 670 }) } catch (e) { console.log('ABCJS THREW', file, String(e).slice(0,90)); continue }
    try { ours = renderAbc(slots, abc, { staffwidth: 670 }) } catch { continue }
    theirs.forEach((t, i) => {
      let a, b
      if (process.env.CYCLE && (t.lines || []).some((l) => l.staff)) {
        const seen = new Set()
        const path = []
        const walk = (v) => {
          if (v === null || typeof v !== 'object') return null
          if (seen.has(v)) return path.join('.')
          seen.add(v)
          for (const k of Object.keys(v)) {
            path.push(k)
            const hit = walk(v[k])
            if (hit) return hit
            path.pop()
          }
          seen.delete(v)
          return null
        }
        const withStaff = (t.lines || []).find((l) => l.staff)
        console.log('LINE keys', Object.keys(withStaff).join(','))
        console.log('STAFF keys', Object.keys(withStaff.staff[0]).join(','))
        const el = withStaff?.staff?.[0]?.voices?.[0]?.[0]
        console.log('CYCLE at', walk(el), '| keys', el ? Object.keys(el).join(',') : '-')
        process.exit(0)
      }
      try { a = valuesOfTune(t); b = valuesOfTune(ours[i] ?? {}) } catch (e) { if (total === 0) console.log('THREW', String(e).slice(0, 160)); return }
      // …and how many rows differ ONLY by the absent `abselem` / `staffGroup`.
      const strip = (t) => t.replace(/"abselem":"abselem",?/g, '').replace(/"staffGroup":"staffGroup",?/g, '').replace(/,}/g, '}')
      for (const [k, v] of a) {
        total++
        if (b.get(k) === v) { agree++; continue }
        if (strip(v) === strip(b.get(k) ?? '')) { onlyMarker++; continue }
        let key = '(shape)'
        try {
          const A = JSON.parse(v), B = JSON.parse(b.get(k) ?? '{}')
          const names = [...new Set([...Object.keys(A), ...Object.keys(B)])]
          key = names.filter((x) => JSON.stringify(A[x]) !== JSON.stringify(B[x])).join('+') || '(equal)'
        } catch {}
        const type = /"el_type":"([^"]+)"/.exec(v)?.[1] ?? (k.includes('/v') ? 'el' : k.includes('/s') ? 'staff' : 'line')
        const tag = `${type}  ${key}`
        const e = kinds.get(tag) ?? { n: 0, eg: `${label}/${file}-tune${i} ${k}\n    abcjs ${v.slice(0, 200)}\n    ours  ${(b.get(k) ?? '(absent)').slice(0, 200)}` }
        kinds.set(tag, { n: e.n + 1, eg: e.eg })
      }
    })
  }
}
console.log(`${agree} of ${total} RENDERED values agree; ${total - agree} differ, of which ${onlyMarker} differ ONLY by the absent abselem/staffGroup — ${total - agree - onlyMarker} are something else`)
const only = process.env.K
for (const [k, v] of [...kinds].sort((x, y) => y[1].n - x[1].n).slice(0, 16)) {
  if (only && !k.includes(only)) continue
  console.log(`  ${String(v.n).padStart(5)}  ${k}`)
  if (only) console.log('    ' + v.eg + '\n')
}
