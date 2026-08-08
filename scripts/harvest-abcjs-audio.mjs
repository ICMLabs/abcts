/**
 * Harvest abcjs's AUDIO oracle — the expected event lists, not just the tunes.
 *
 * ── WHY THIS IS THE FIRST COMMIT OF THE AUDIO ARC ────────────────────────────
 * abcts has no audio at all: no `src/midi/`, no `src/synth/`, and `%%MIDI` appears in the
 * parser zero times. Every previous arc in this repo has been worth more for its GATE than
 * for any single fix, and three of the newest findings could only be stated after one was
 * built. So the oracle lands before a line of the flattener does.
 *
 * ── WHY IT CAN BE HARVESTED AT ALL ───────────────────────────────────────────
 * `harvest-abcjs-tests.mjs` deliberately took abcjs's test INPUTS and left its assertions,
 * because those assert against abcjs's internal `visualObj` tree, which `abcts/compat`
 * does not reproduce. **`flattener.test.js` is the exception, and it is a large one.** Its
 * `doFlattenTest(abc, expected, options)` compares `setUpAudio()`'s RETURN VALUE — a plain
 * `{tempo, instrument, totalDuration, tracks[][]}` of `{cmd, pitch, volume, start,
 * duration, instrument, gap}` rows, written out as JSON literals across 8,203 lines. That
 * is a public, structural answer of exactly the same kind as the `.parse.json` and
 * `.elements.json` goldens, and it needs harvesting rather than deriving.
 *
 * `timing.test.js` is NOT harvested: its `doTimingTest` reads `currentTrackMilliseconds`
 * and `midiPitches` off the laid-out voice, which is the internal tree again. `midi.test.js`
 * is not either — it compares a serialized MIDI FILE as a `data:` URI, which is a second
 * surface (the file writer) sitting on top of this one. Both are worth revisiting once the
 * flattener is passing; neither is the first gate.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * By EVALUATING the test file with `describe`, `it` and `doFlattenTest` replaced, rather
 * than by matching text. The file declares its tunes as `var abcX = "…" + "…"` and its
 * answers as `var expectedX = {…}`, and only the `it()` bodies say which pairs with which
 * — a regex would have to re-implement that pairing and would get the `options` third
 * argument wrong. The real helpers are cut off first: they reference `abcjs`, `chai` and
 * `document`, none of which exist here.
 *
 * ── LICENCE ──────────────────────────────────────────────────────────────────
 * The ABC text and the expected event lists are abcjs's authors' work, and abcjs is MIT.
 * The corpus directory carries abcjs's notice, exactly as `tests/corpus-abcjs/` does.
 *
 *   node scripts/harvest-abcjs-audio.mjs [--dry]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjs = join(root, config.abcjsRef ?? '../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3')
const SOURCE = join(abcjs, 'tests/synth/flattener.test.js')
const outDir = join(root, 'tests', 'corpus-audio')

const dry = process.argv.includes('--dry')

const text = readFileSync(SOURCE, 'utf-8')
// Everything up to the helpers. `doFlattenTest` is a top-level function DECLARATION, so it
// hoists over any binding of the same name in the same scope — cutting it out is what lets
// ours be the one that runs.
const cut = text.indexOf('\nfunction doFlattenTest(')
if (cut === -1) throw new Error('could not find the end of the describe block')

const cases = []
/**
 * `doTimingObjTest` is the file's OTHER helper — two cases — and it is not this surface:
 * it asserts `setTiming()`'s output, whose rows carry `line`, `left` and `endX` alongside
 * the pitches. That is the event list joined to the RENDERED geometry, which belongs to a
 * later gate. Stubbed so the eval reaches the end of the file rather than skipped silently.
 */
const skipped = []
let current = null
// biome-ignore lint/security/noGlobalEval: vendored, version-pinned source, already
// `require`d by the golden generator. The stubs are what make it inert.
const run = eval(
  `(function (describe, it, doFlattenTest, doTimingObjTest) {\n${text.slice(0, cut)}\n})`,
)
run(
  (_name, fn) => fn(),
  (name, fn) => {
    current = name
    fn()
  },
  (abc, expected, options) => {
    cases.push({ name: current, abc, options: options ?? null, expected })
  },
  () => skipped.push(current),
)

/** Filename-safe, and the `it()` name is already unique and descriptive in this file. */
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const names = new Set()
for (const c of cases) {
  c.slug = slug(c.name)
  if (names.has(c.slug)) throw new Error(`duplicate case name ${c.slug}`)
  names.add(c.slug)
}

console.log(
  `${cases.length} flattener cases from tests/synth/flattener.test.js` +
    (skipped.length > 0
      ? ` (${skipped.length} setTiming cases skipped: ${skipped.join(', ')})`
      : ''),
)
if (dry) {
  for (const c of cases) {
    const events = (c.expected.tracks ?? []).reduce((n, t) => n + t.length, 0)
    console.log(
      `  ${c.slug.padEnd(34)} ${String(c.expected.tracks?.length ?? 0).padStart(2)} tracks ` +
        `${String(events).padStart(4)} events${c.options ? '  +options' : ''}`,
    )
  }
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
// Cleared first: a renamed `it()` would otherwise leave the old case behind and the gate
// would go on measuring something the harvest no longer produces.
for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(join(outDir, f))
for (const c of cases) {
  writeFileSync(
    join(outDir, `${c.slug}.json`),
    `${JSON.stringify(
      {
        name: c.name,
        source: 'tests/synth/flattener.test.js',
        abc: c.abc,
        options: c.options,
        expected: c.expected,
      },
      null,
      2,
    )}\n`,
  )
}

if (!existsSync(join(outDir, 'README.md'))) {
  writeFileSync(
    join(outDir, 'README.md'),
    [
      '# abcjs audio corpus — the flattener oracle',
      '',
      'One JSON file per `it()` in abcjs 6.6.3’s `tests/synth/flattener.test.js`,',
      'extracted by `scripts/harvest-abcjs-audio.mjs` (`npm run harvest:audio`). Each holds',
      'the ABC, the options that test passes to `setUpAudio`, and the exact event list abcjs',
      'expects back.',
      '',
      'Unlike `tests/corpus-abcjs/`, the ASSERTIONS are harvested here as well as the inputs.',
      'They can be, because `doFlattenTest` compares `setUpAudio()`’s public return value —',
      'a plain `{tempo, instrument, totalDuration, tracks[][]}` — rather than abcjs’s internal',
      '`visualObj` tree. That makes this an exact oracle of the same kind as the `.parse.json`',
      'and `.elements.json` goldens.',
      '',
      '`timing.test.js` and `midi.test.js` are deliberately not harvested — see the script’s',
      'header for why.',
      '',
      '## Licence',
      '',
      'The ABC text and the expected event lists are from abcjs, which is MIT licensed:',
      '',
      '> Copyright (c) 2009-2024 Paul Rosen and Gregory Dyke',
      '>',
      '> Permission is hereby granted, free of charge, to any person obtaining a copy',
      '> of this software and associated documentation files (the "Software"), to deal',
      '> in the Software without restriction, including without limitation the rights',
      '> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
      '> copies of the Software, and to permit persons to whom the Software is',
      '> furnished to do so, subject to the following conditions:',
      '>',
      '> The above copyright notice and this permission notice shall be included in',
      '> all copies or substantial portions of the Software.',
      '>',
      '> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
      '> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
      '> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
      '> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
      '> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
      '> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN',
      '> THE SOFTWARE.',
      '',
    ].join('\n'),
  )
}
console.log(`written to ${outDir.slice(root.length + 1)}`)
