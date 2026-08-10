/**
 * Harvest abcjs's TIMING oracle — `setTiming`'s answer, which is the audio↔geometry JOIN.
 *
 * ── WHY THIS ONE ────────────────────────────────────────────────────────────
 * It is the last unharvested PORTABLE oracle in abcjs's suite (see the 2026-08-09 audit,
 * which classified all thirty files by assertion target). And it is worth more than its
 * case count: `noteTimings` is derived from the FLATTENED AUDIO and the LAID-OUT ELEMENTS
 * together, so it is the one surface that can disagree with both halves at once — the same
 * argument that made the MIDI file worth building, and that one disagreed three times with
 * the event table green.
 *
 * ── WHICH OF ITS SIXTEEN CASES ARE PORTABLE, AND WHY THE REST ARE NOT ───────
 * Classified by ASSERTION TARGET rather than by file, which is the lesson the audit turned
 * on itself:
 *
 *   doWarpTest        6+6  `setTiming(bpm, measuresOfDelay)` → every `milliseconds` and
 *                          `millisecondsPerMeasure`. Pure time. **The core of the oracle.**
 *   doTimingTest        2  `currentTrackMilliseconds` and `midiPitches` stamped back onto
 *                          each element of voice 0, IN SOURCE ORDER. Pure time, plus a
 *                          bar marker. A note reached twice through a repeat carries BOTH.
 *   doSwitchTunesTest   1  `noteTimings[i].milliseconds` for two tunes, the second having
 *                          replaced the first on a live TimingCallbacks. The REPLACEMENT is
 *                          host state; the two arrays are ordinary timings and are kept.
 *   doCreationTest      4  asserts only that rendering does not THROW — four crash
 *                          regressions. Kept: they cost nothing and each names a shape
 *                          (a subtitle, a repeat at the start, ties, a tie over a repeat).
 *   doBeatCallbackTest* 5  a real timer, `sleep()`, and `position.left` off the DOM. That
 *                          is host playback, the same line `create-synth.js` falls on.
 *   doAnimationTest     1  drives an animation loop. Same.
 *   doClickTest2        1  a click handler on rendered SVG. Same.
 *
 * `left` / `endX` / `top` / `height` are on every `noteTimings` row and NOTHING in this file
 * asserts them — the geometry half of the join has no oracle here, only the time half.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────────
 * By EVALUATING the file with `describe`/`it`/the helpers replaced, as the audio, MIDI and
 * chord-grid harvesters do. The `it()` bodies are again the only place the tune is paired
 * with its answer, and `doWarpTest` is called in a LOOP over two parallel arrays, which no
 * regex could follow.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The ABC text and the expected timings are abcjs's authors' work, and abcjs is MIT. The
 * corpus directory carries abcjs's notice.
 *
 *   node scripts/harvest-abcjs-timing.mjs [--dry]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsRoot = join(root, config.abcjsRef ?? '../abcMusicKit/Docs/References/abcjs/abcjs-6.7.0')
const SOURCE = join(abcjsRoot, 'tests/synth/timing.test.js')
const outDir = join(root, 'tests', 'corpus-timing')

const dry = process.argv.includes('--dry')
const text = readFileSync(SOURCE, 'utf-8')

// The helpers reach for `abcjs`, `chai`, `document` and `setTimeout`; cut them off so ours
// are what runs. They are top-level function DECLARATIONS and would otherwise hoist.
const helpersAt = text.indexOf('\nfunction doWarpTest')
if (helpersAt < 0) throw new Error('timing.test.js: no `function doWarpTest` to cut at')
const body = text.slice(0, helpersAt)

const cases = []
let pending = null
const push = (kind, extra) => {
  if (pending === null) throw new Error('a helper ran outside an it()')
  cases.push({ name: pending, kind, ...extra })
}

const stubs = {
  describe: (_name, fn) => fn(),
  it: (name, fn) => {
    pending = name
    // Mocha's `this.timeout(3000)` — the async beat-callback cases call it on the `it`
    // context before anything else runs, so the stub is called with one.
    fn.call({ timeout: () => {} })
    pending = null
  },
  /** `setTiming(bpm, measuresOfDelay)` → every note's ms, and the measure length. */
  doWarpTest: (abc, warps, warpMs) =>
    push('warp', {
      abc,
      bpm: warps.bpm,
      measuresOfDelay: warps.measuresOfDelay,
      millisecondsPerMeasure: warpMs.millisecondsPerMeasure,
      ms: warpMs.ms,
    }),
  /** Per ELEMENT of voice 0, in source order: `{ms, pitches}` or `{bar: true}`. */
  doTimingTest: (abc, expected) => push('elements', { abc, expected }),
  /** Two tunes; only the two timing arrays are portable, not the live replacement. */
  doSwitchTunesTest: (abc1, abc2, expected1, expected2) =>
    push('switch', { abc: abc1, abc2, ms: expected1, ms2: expected2 }),
  /** "Does not throw" — four crash regressions, each naming a shape. */
  doCreationTest: (abc) => push('creation', { abc }),
  // Host playback: a real timer, the DOM, an animation loop. Out of scope, as
  // `create-synth.js` and `synth-controller.js` are.
  doBeatCallbackTest: () => {},
  doBeatCallbackTest2: () => {},
  doBeatCallbackTestTies: () => {},
  doAnimationTest: () => {},
  doClickTest2: () => {},
}

// eslint-disable-next-line no-new-func
const run = new Function(...Object.keys(stubs), body)
run(...Object.values(stubs))

if (cases.length === 0) throw new Error('timing.test.js: harvested nothing')

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** `warp` fires six times under one `it()`; number them. */
const named = []
const seen = new Map()
for (const c of cases) {
  const base = slug(c.name)
  const n = (seen.get(base) ?? 0) + 1
  seen.set(base, n)
  named.push({ ...c, slug: n === 1 && cases.filter((x) => slug(x.name) === base).length === 1 ? base : `${base}-${n}` })
}

if (dry) {
  for (const c of named) {
    const size = c.kind === 'warp' ? `${c.ms.length} ms @ ${c.bpm}bpm/${c.measuresOfDelay}` : c.kind === 'elements' ? `${c.expected.length} elements` : c.kind === 'switch' ? `${c.ms.length}+${c.ms2.length} ms` : 'no throw'
    console.log(`${c.slug.padEnd(28)} ${c.kind.padEnd(9)} ${size}`)
  }
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(join(outDir, f))
}
for (const c of named) {
  const { slug: s, ...rest } = c
  writeFileSync(join(outDir, `${s}.json`), `${JSON.stringify(rest, null, 1)}\n`)
}
console.log(`harvested ${named.length} timing cases into ${outDir}`)
