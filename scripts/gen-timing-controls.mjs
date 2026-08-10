/**
 * `setTiming`'s LADDER OF CONTROLS — abcjs's own answer for tunes abcjs's suite does not
 * contain.
 *
 * **THE CORPUS IS A SAMPLE OF THE ORACLE, NOT THE ORACLE.** `timing.test.js` warps two
 * tunes twelve ways and both tunes are 4/4 with no pickup, one voice and no mid-tune tempo.
 * So whole branches of `setTiming` had no case behind them, and the one that named this
 * ladder is `startingDelay -= getPickupLength() …`: deleting that line outright left the
 * ranked table at 0 of 13. A line no case can reach is a line no gate can defend.
 *
 * Each rung varies ONE thing, and `plain` is the CANARY — a bare 4/4 tune at the default
 * tempo, which every other rung must differ from.
 *
 * Written into `tests/corpus-timing-controls/`, in the harvested corpus's shape and read by
 * the SAME ranked table under the SAME ratchet. A directory of its own because
 * `npm run harvest:timing` clears the other one — the same reason the audio controls have
 * theirs.
 *
 *   node scripts/gen-timing-controls.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const tools = join(root, config.goldens, '..')
const out = join(root, 'tests', 'corpus-timing-controls')

const require = createRequire(join(tools, 'package.json'))
const { JSDOM } = require('jsdom')

/** `[slug, abc, bpm|null, measuresOfDelay]`. */
const CONTROLS = [
  // THE CANARY: the plainest possible tune at its own tempo. Everything else moves from it.
  ['plain', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCDEF|GABc|\n', null, 0],
  // ── THE COUNT-IN, and the line no harvested case reaches ──
  ['delay-1', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCDEF|GABc|\n', null, 1],
  ['delay-2', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCDEF|GABc|\n', null, 2],
  // **`startingDelay -= getPickupLength()`** — with a pickup the music's downbeat still has
  // to land on a bar line, so the count-in is short by the lead-in.
  ['delay-pickup', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nG|CDEF|GABc|\n', null, 1],
  ['delay-pickup-2', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nGA|CDEF|GABc|\n', null, 2],
  // …and `if (startingDelay)` means a pickup with NO delay subtracts nothing.
  ['pickup-no-delay', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nG|CDEF|GABc|\n', null, 0],
  // ── `getBeatLength`'s three arms, which nothing in 4/4 can reach ──
  ['compound-6-8', 'X:1\nL:1/8\nM:6/8\nQ:3/8=60\nK:C\nCDEFGA|cdefga|\n', null, 0],
  ['compound-9-8', 'X:1\nL:1/8\nM:9/8\nK:C\nCDEFGAcde|\n', null, 0],
  ['three-eight', 'X:1\nL:1/8\nM:3/8\nK:C\nCDE|FGA|\n', null, 0],
  ['five-eight', 'X:1\nL:1/8\nM:5/8\nK:C\nCDEFG|ABcde|\n', null, 0],
  ['seven-eight', 'X:1\nL:1/8\nM:7/8\nK:C\nCDEFGAB|\n', null, 0],
  // THE DEFAULT BPM IS 180, AND 120 ON A COMPOUND METER — and 3/4 is deliberately not one.
  ['no-tempo-4-4', 'X:1\nL:1/4\nM:4/4\nK:C\nCDEF|\n', null, 0],
  ['no-tempo-3-4', 'X:1\nL:1/4\nM:3/4\nK:C\nCDE|\n', null, 0],
  ['no-tempo-6-8', 'X:1\nL:1/8\nM:6/8\nK:C\nCDEFGA|\n', null, 0],
  // ── THE STATED BEAT UNIT IS A RATIO, not a rate ──
  ['tempo-half', 'X:1\nL:1/4\nM:4/4\nQ:1/2=60\nK:C\nCDEF|GABc|\n', null, 0],
  ['tempo-eighth', 'X:1\nL:1/4\nM:4/4\nQ:1/8=120\nK:C\nCDEF|GABc|\n', null, 0],
  // ── A MID-TUNE TEMPO, which is what `tempoLocations` is for ──
  ['tempo-change', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCDEF|[Q:1/4=120]GABc|CDEF|\n', null, 0],
  ['tempo-change-warped', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCDEF|[Q:1/4=120]GABc|\n', 30, 0],
  // ── THE REPEAT WALK, which is `setupEvents`'s own and not the sequencer's ──
  ['repeat-plain', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\n|:CDEF:|\n', null, 0],
  // `startEnding === '1'` is a STRING test, so `|1` skips the first ending on the replay.
  ['repeat-endings', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\n|:CDEF|1GABc:|2cBAG|\n', null, 0],
  // A `:|` is ALSO a start repeat, which is how a second section repeats without a `|:`.
  ['repeat-chained', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\n|:CDEF:|GABc:|\n', null, 0],
  // ── TWO VOICES: rows are deduped by millisecond and the END is the LONGEST voice ──
  ['two-voices', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nV:1\nCDEF|\nV:2\nC2E2|\n', null, 0],
  ['two-voices-ragged', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nV:1\nCDEF|GABc|\nV:2\nC4|\n', null, 0],
  // A SPACER SOUNDS NOTHING AND TAKES NO TIME, as it does in the flattener.
  ['spacer', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\nCyDEF|\n', null, 0],
  // A TRIPLET's members carry the sounding duration, so the group is exact.
  ['triplet', 'X:1\nL:1/4\nM:4/4\nQ:1/4=60\nK:C\n(3CDE F2|\n', null, 0],
]

/**
 * ── AND A SECOND LADDER, IN THE `elements` SHAPE ────────────────────────────
 * `currentTrackMilliseconds` is the only surface that can SEE a repeat's structure: a
 * doubled pass reads as "more notes" on an event table nobody counts by hand, and as a
 * doubled ENTRY on a per-element one. That is exactly how `|1 … :|2 … |]` was found playing
 * its last ending twice while the audio table sat at 0 of 72 and the MIDI file was
 * byte-exact.
 *
 * So every repeat SHAPE gets a rung. `no-repeat` is the canary — the same notes with no
 * repeat at all, whose every element must carry a bare number rather than an array.
 */
const ELEMENT_CONTROLS = [
  ['el-no-repeat', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\nCDE|FGA|\n'],
  ['el-plain-repeat', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE:|\n'],
  ['el-repeat-then-more', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE:|FGA|\n'],
  // THE SHAPE THAT WAS WRONG: a final ending as the LAST measure.
  ['el-two-endings', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE|1FGA:|2cde|]\n'],
  // …and the same with music after it, which reaches a different arm.
  ['el-endings-then-more', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE|1FGA:|2cde|efg|\n'],
  // A SPARSE ENDING ARRAY — `|1,3` and `|2,4` interleave four passes.
  ['el-four-endings', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE|1,3FGA:|2,4cde|]\n'],
  // `::` is an end AND a start on one bar element.
  ['el-double-repeat', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE::FGA:|\n'],
  // A `:|` with no `|:` repeats from the head of the tune.
  ['el-no-start-repeat', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\nCDE|FGA:|\n'],
  // Two `:|` in a row — a notation error abcjs recovers from.
  ['el-two-end-repeats', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:CDE:|FGA:|\n'],
  // A TIE across the repeat's seam, and a chord, both of which the stamp treats specially.
  ['el-tie-and-chord', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\n|:C2-C|[CEG]DE:|\n'],
  // A rest and a spacer are stamped too — the spacer sounds nothing and takes no time.
  ['el-rest-and-spacer', 'X:1\nL:1/4\nM:3/4\nQ:1/4=60\nK:C\nCzE|DyFG|\n'],
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
for (const [slug, abc, bpm, measuresOfDelay] of CONTROLS) {
  // `setTiming` REQUIRES the tune to have been drawn — it reads `engraver.staffgroups` —
  // which is why this renders rather than parsing.
  const visualObj = ABCJS.renderAbc('notation', abc, { staffwidth: 670 })
  const timings = visualObj[0].setTiming(bpm ?? undefined, measuresOfDelay)
  writeFileSync(
    join(out, `${slug}.json`),
    `${JSON.stringify(
      {
        name: slug,
        kind: 'warp',
        source: 'control tune, rendered by abcjs',
        abc,
        ...(bpm === null ? {} : { bpm }),
        measuresOfDelay,
        millisecondsPerMeasure: timings[0] ? timings[0].millisecondsPerMeasure : null,
        ms: timings.map((t) => t.milliseconds),
      },
      null,
      1,
    )}\n`,
  )
}
for (const [slug, abc] of ELEMENT_CONTROLS) {
  const visualObj = ABCJS.renderAbc('notation', abc, { staffwidth: 670 })
  visualObj[0].setUpAudio()
  const voice = visualObj[0].lines[0].staff[0].voices[0]
  const expected = voice.map((el) =>
    el.el_type === 'bar'
      ? { bar: true }
      : {
          ms: el.currentTrackMilliseconds,
          pitches: (el.midiPitches || []).map((p) => p.pitch),
        },
  )
  writeFileSync(
    join(out, `${slug}.json`),
    `${JSON.stringify({ name: slug, kind: 'elements', source: 'control tune, rendered by abcjs', abc, expected }, null, 1)}\n`,
  )
}
console.log(
  `${CONTROLS.length} timing controls and ${ELEMENT_CONTROLS.length} element controls written to tests/corpus-timing-controls/`,
)
