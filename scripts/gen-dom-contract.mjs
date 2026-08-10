/**
 * THE SVG DOM CONTRACT — abcjs's `class` and `data-name` tree, which is what
 * `abcts/compat` promises and what no gate here has ever measured.
 *
 * ── WHY THIS AXIS IS INVISIBLE TO EVERYTHING ELSE ────────────────────────────
 * `pixel-parity` and the harvested table resolve both SVGs to ABSOLUTE PIXELS and compare
 * positions — they deliberately throw the markup away, because that is how they see past
 * `<rect>`-versus-`<path>` and Bravura-versus-abcjs outlines. The structural gate compares
 * abcjs's LAID-OUT ELEMENTS, which are its internal tree and not its output. So the thing a
 * drop-in replacement is actually judged on — "does `querySelector('[data-name=note]')`
 * find a note" — has had no instrument at all.
 *
 * The 2026-08-09 suite audit corrected an earlier reading to say exactly this:
 * `visual/svg.test.js` and `svg-per-line.test.js` assert the DOM contract, not the internal
 * tree, and eight cases were nearly written off.
 *
 * ── WHAT IS COMPARED ─────────────────────────────────────────────────────────
 * Every element carrying a `class` or a `data-name`, in document order, with its DEPTH —
 * so grouping is part of the comparison and not just membership. **The tag name is not**:
 * a staff line is a `<path>` in abcjs and a `<rect>` here, which is a drawing choice the
 * pixel gate already proves equivalent, and folding it in would drown the axis this gate
 * exists for.
 *
 * ── THE TUNES ────────────────────────────────────────────────────────────────
 * `svg-*` are `visual/svg.test.js`'s own three. The rest are controls, one feature each,
 * because that file covers a clef, a time signature and a note and nothing else — and a
 * contract is exactly the kind of thing that holds for the features someone tested and
 * lapses for the ones they did not.
 *
 *   node scripts/gen-dom-contract.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const tools = join(root, config.goldens, '..')
const out = join(root, 'tests', 'corpus-dom')

const require = createRequire(join(tools, 'package.json'))
const { JSDOM } = require('jsdom')

const H = 'X:1\nL:1/4\nM:4/4\nK:C\n'
const TUNES = [
  // `visual/svg.test.js`'s own three.
  ['svg-single-note', 'X:1\nL:1/4\n%%staffwidth 5\n%%musicspace 0\nK:C clef=none\nV:all stem=up\nB4\n'],
  ['svg-time-sig-list', 'X:1\nL:1/4\n%%staffwidth 12\n%%musicspace 0\nK:C clef=none stafflines=0\n[M:2/4]y[M:3/4]y[M:4/4]\n'],
  ['svg-12-8-group', 'X:1\nL:1/4\nM:12/8\nK:C clef=none\nA4\n'],
  // …and one control per feature, because three tunes cannot hold a contract.
  ['dom-plain', `${H}CDEF|GABc|\n`],
  ['dom-key-sig', 'X:1\nL:1/4\nM:4/4\nK:Eb\nCDEF|\n'],
  ['dom-accidentals', `${H}^C_D=EF|\n`],
  ['dom-chord', `${H}[CEG]D2|\n`],
  ['dom-beam', 'X:1\nL:1/8\nM:4/4\nK:C\nCDEF GABc|\n'],
  ['dom-rest', `${H}Cz2E|\n`],
  ['dom-ledger', `${H}C,,4|c'''4|\n`],
  ['dom-dots-and-ties', `${H}C3-C|D2.E2|\n`],
  ['dom-slur', `${H}(CDEF)|\n`],
  ['dom-grace', `${H}{gab}c4|\n`],
  ['dom-tuplet', `${H}(3CDE F|\n`],
  ['dom-decorations', `${H}!fermata!C!trill!D!staccato!E!accent!F|\n`],
  ['dom-dynamics', `${H}!p!C!f!D!crescendo(!E!crescendo)!F|\n`],
  ['dom-chord-symbols', `${H}"Am7"C"^above"D"_below"E F|\n`],
  ['dom-lyrics', `${H}CDEF|\nw:one two three four\n`],
  ['dom-bars', 'X:1\nL:1/4\nM:4/4\nK:C\n|:CDEF:|1GABc:|2cBAG|]\n'],
  ['dom-tempo', 'X:1\nL:1/4\nM:4/4\nQ:1/4=120\nK:C\nCDEF|\n'],
  ['dom-parts', 'X:1\nL:1/4\nM:4/4\nK:C\nP:A\nCDEF|\n'],
  ['dom-two-voices', 'X:1\nL:1/4\nM:4/4\nK:C\nV:1\nCDEF|\nV:2\nC,4|\n'],
  ['dom-title-composer', 'X:1\nT:A Title\nC:A Composer\nL:1/4\nM:4/4\nK:C\nCDEF|\n'],
  ['dom-bar-numbers', 'X:1\n%%barnumbers 1\nL:1/4\nM:4/4\nK:C\nCDEF|GABc|cBAG|\n'],
  ['dom-clef-change', 'X:1\nL:1/4\nM:4/4\nK:C\nCDEF|[K:bass]C,4|\n'],
]

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="notation"></div></body></html>')
global.document = dom.window.document
global.window = dom.window
const origCreateElementNS = dom.window.document.createElementNS.bind(dom.window.document)
dom.window.document.createElementNS = (ns, tag) => {
  const el = origCreateElementNS(ns, tag)
  if (tag === 'text' || tag === 'tspan') el.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 })
  return el
}
const ABCJS = require(join(abcjsPath, 'index'))

mkdirSync(out, { recursive: true })
for (const [slug, abc] of TUNES) {
  const div = dom.window.document.getElementById('notation')
  div.innerHTML = ''
  ABCJS.renderAbc('notation', abc, { add_classes: true, staffwidth: 670 })
  const svg = div.querySelector('svg')
  writeFileSync(join(out, `${slug}.json`), `${JSON.stringify({ name: slug, abc, contract: contractOf(svg) }, null, 1)}\n`)
}
console.log(`${TUNES.length} DOM-contract cases written to tests/corpus-dom/`)

/** Every element carrying a class or a data-name, in document order, with its depth. */
function contractOf(root) {
  const rows = []
  const walk = (el, depth) => {
    const klass = el.getAttribute('class')
    const name = el.getAttribute('data-name')
    if (klass || name) rows.push({ depth, class: klass || null, name: name || null })
    for (const child of el.children) walk(child, depth + 1)
  }
  for (const child of root.children) walk(child, 0)
  return rows
}
