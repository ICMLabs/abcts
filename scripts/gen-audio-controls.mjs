/**
 * THE COUNT-IN'S LADDER OF CONTROLS — abcjs's own answer for tunes abcjs's suite does not
 * contain.
 *
 * `options.test.js` exercises `drumIntro` twice and both times the same way: one intro
 * measure, no pickup, 4/4, one voice. Everything else the splice does
 * (`abc_midi_sequencer.js:510-537`) — the `drumIntro-1` loop, the pickup coming out of the
 * LAST intro measure, that measure getting no barline, the count-in applying to voices that
 * have no drums at all — is code with no case behind it, and code with no case behind it is
 * where this repo has found most of its defects.
 *
 * **THE CORPUS IS NOT THE ORACLE, IT IS A SAMPLE OF IT.** abcjs renders any tune on demand,
 * so a finding blocked on "nothing does this" is blocked on nothing. Same lesson as the
 * tempo mark's flag, which sat open for months under a note reading "no pixel-gated fixture
 * has a non-quarter `Q:`".
 *
 * The rungs vary ONE thing each, and `intro-0` is the CANARY: same tune, same drum, no
 * intro. If the gate cannot tell that one from `intro-1` it cannot see the axis at all.
 *
 * Written in the same shape as `tests/corpus-audio/`, into a directory of their own so
 * `npm run harvest:audio` — which clears its output — cannot take them with it. abcjs is
 * resolved out of the sibling debug tool's `node_modules` rather than added as a dependency
 * here; `harvest-abcjs-goldens.mjs` reaches into the same tree for the same reason.
 *
 *   node scripts/gen-audio-controls.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const tools = join(root, config.goldens, '..')
const out = join(root, 'tests', 'corpus-audio-controls')

const require = createRequire(join(tools, 'package.json'))
const { JSDOM } = require('jsdom')

const DRUM = 'dddd 76 77 77 77 60 30 30 30'
const PLAIN = 'M:4/4\nL:1/4\nK:C\n"C"CDEF|"G"GABc|\n'
const PICKUP = 'M:4/4\nL:1/4\nK:C\nG|"C"CDEF|"G"GABc|\n'

const CONTROLS = [
  // THE CANARY. Same tune, same drum, no count-in — an instrument that cannot tell this
  // from `intro-1` is measuring nothing.
  ['intro-0', PLAIN, { drum: DRUM }],
  ['intro-1', PLAIN, { drum: DRUM, drumIntro: 1 }],
  // The `for (w = 0; w < drumIntro; w++)` loop, which one measure never enters twice.
  ['intro-2', PLAIN, { drum: DRUM, drumIntro: 2 }],
  // `measureLength - pickups` on the LAST intro measure, and that measure getting no bar.
  ['intro-pickup', PICKUP, { drum: DRUM, drumIntro: 1 }],
  ['intro-2-pickup', PICKUP, { drum: DRUM, drumIntro: 2 }],
  // `if (drumIntro)` does not test `drumOn`: the count-in is silent here and still shifts.
  ['intro-no-drum', PLAIN, { drumIntro: 1 }],
  // Where the spliced `drum` element lands relative to the bar that closes the count-in.
  ['intro-2-drumoff', PLAIN, { drum: DRUM, drumIntro: 2, drumOff: true }],
  // A pattern spanning two measures, started from an odd offset.
  ['intro-bars2-pickup', PICKUP, { drum: DRUM, drumBars: 2, drumIntro: 1 }],
  // A count-in measure that is not 1.0 long.
  ['intro-three-four', 'M:3/4\nL:1/4\nK:C\n"C"CDE|"G"GAB|\n', { drum: DRUM, drumIntro: 1 }],
  // "add some measures of rests to the start of each track" — every voice, not voice 0.
  [
    'intro-two-voices',
    'M:4/4\nL:1/4\nK:C\nV:1\n"C"CDEF|"G"GABc|\nV:2\nC,4|G,4|\n',
    { drum: DRUM, drumIntro: 1 },
  ],
  // THE LAST METER WINS. `measureLength` is a sequencer-global every `M:` overwrites and
  // the splice runs after every voice is built, so this tune's count-in should be 3/4.
  [
    'intro-meter-change',
    'M:4/4\nL:1/4\nK:C\n"C"CDEF|[M:3/4]"G"GAB|\n',
    { drum: DRUM, drumIntro: 1 },
  ],
]

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="notation"></div></body></html>')
global.document = dom.window.document
global.window = dom.window
const origCreateElementNS = dom.window.document.createElementNS.bind(dom.window.document)
dom.window.document.createElementNS = (ns, tag) => {
  const el = origCreateElementNS(ns, tag)
  // The flattener runs off the parse tree; nothing it reads is measured, so the shim only
  // has to exist. (`dump-svg.js`'s calibrated one is for geometry.)
  if (tag === 'text' || tag === 'tspan') el.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 })
  return el
}
const ABCJS = require(join(abcjsPath, 'index'))

mkdirSync(out, { recursive: true })
for (const [slug, abc, options] of CONTROLS) {
  const visualObj = ABCJS.renderAbc('notation', abc, { staffwidth: 670 })
  const expected = visualObj[0].setUpAudio(options)
  for (const track of expected.tracks)
    for (const event of track) {
      // `doFlattenTest` drops these before comparing; the source offsets are a separate
      // surface and `start-char.test.js` is where they belong.
      event.startChar = undefined
      event.endChar = undefined
      delete event.startChar
      delete event.endChar
    }
  writeFileSync(
    join(out, `${slug}.json`),
    `${JSON.stringify({ name: slug, source: 'control tune, rendered by abcjs', abc, options, expected }, null, 2)}\n`,
  )
}
console.log(`${CONTROLS.length} controls written to tests/corpus-audio-controls/`)
