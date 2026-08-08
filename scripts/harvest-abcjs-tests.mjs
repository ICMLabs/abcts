/**
 * Harvest the ABC tunes embedded in abcjs's own test suite into abcts fixtures.
 *
 * ── WHY THIS AND NOT THE TESTS THEMSELVES ────────────────────────────────────
 * abcjs's `tests/` holds 272 `it()` cases, and none of them are runnable here: they
 * assert against abcjs's INTERNAL laid-out tree (`visualObj[0].lines[0].staff[0]
 * .voices[0][i].duration`), which `abcts/compat` does not reproduce, and `tests/api/`
 * goes further and `require()`s abcjs's own modules directly. Reproducing `visualObj`
 * to run them is a project.
 *
 * The FIXTURES are a different matter. Those files carry ~113 distinct tunes chosen by
 * abcjs's maintainers to exercise the things they thought worth testing — directives,
 * wrapping, transposition, tablature, titles, selection, chord grids, slur-vs-beam — and
 * every gate abcts already has applies to a tune the moment a golden exists for it. So
 * this takes the inputs and leaves the assertions.
 *
 * ── WHERE THEY GO, AND WHY NOT BESIDE THE OTHERS ─────────────────────────────
 * `../abcMusicKit` is READ-ONLY from here — the 41-fixture corpus and its goldens live
 * there and stay there. These are new material, so they live in abcts under
 * `tests/corpus-abcjs/`, generated rather than vendored: this script reads abcjs's test
 * sources and writes fixtures, and `npm run harvest:goldens` runs abcjs itself over them.
 *
 * ── LICENCE ──────────────────────────────────────────────────────────────────
 * abcjs is MIT and these strings are its authors' work, so the directory carries abcjs's
 * notice — the same call `glyphs-abcjs.ts` makes for its glyph table. See the README this
 * writes beside them.
 *
 *   node scripts/harvest-abcjs-tests.mjs [--dry]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjs = join(root, config.abcjsRef ?? '../abcMusicKit/Docs/References/abcjs/abcjs-6.6.3')
const testsDir = join(abcjs, 'tests')
const outDir = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const existingDir = join(root, config.corpus)

const dry = process.argv.includes('--dry')

/**
 * Every string literal in a file, including `+`-concatenated runs.
 *
 * abcjs writes its tunes as `"X:1\n" + "K:C\n" + …`, so a per-literal scan finds
 * fragments and a per-statement one finds the tune. `eval` on a matched literal run is
 * safe here in a way it would not be on input: the text comes from a vendored,
 * version-pinned source tree that is already `require`d by the golden generator.
 */
const LITERAL =
  /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:\s*\+\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*/g

/** A tune, for our purposes: an `X:` line and at least one more line. */
const looksLikeTune = (s) => typeof s === 'string' && /(^|\n)X:\s*\d/.test(s) && s.includes('\n')

/** `T:`, else the first non-field line, reduced to a filename-safe slug. */
function slugFor(abc) {
  const title = /(^|\n)T:\s*(.+)/.exec(abc)?.[2] ?? ''
  const fallback = abc.split('\n').find((l) => l.trim() && !/^[A-Za-z%+]:/.test(l)) ?? ''
  return (
    (title || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'tune'
  )
}

/** Normalised for comparison, so trailing-newline differences do not read as new tunes. */
const key = (abc) => abc.replace(/\r\n/g, '\n').replace(/\s+$/g, '').trim()

const seen = new Map()
for (const f of readdirSync(existingDir)) {
  if (f.endsWith('.abc')) seen.set(key(readFileSync(join(existingDir, f), 'utf-8')), f)
}
const alreadyCovered = seen.size

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )

const harvested = []
let duplicates = 0
for (const file of walk(testsDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()) {
  const source = readFileSync(file, 'utf-8')
  const group = file
    .slice(testsDir.length + 1)
    .replace(/\.test\.js$/, '')
    .replace(/\//g, '-')
  let n = 0
  for (const match of source.match(LITERAL) ?? []) {
    let abc
    try {
      // biome-ignore lint/security/noGlobalEval: vendored, pinned source — see above.
      abc = eval(match)
    } catch {
      continue
    }
    if (!looksLikeTune(abc)) continue
    const k = key(abc)
    if (seen.has(k)) {
      duplicates++
      continue
    }
    const name = `abcjs-${group}-${String(++n).padStart(2, '0')}-${slugFor(abc)}`
    seen.set(k, name)
    harvested.push({ name, abc: `${k}\n`, from: file.slice(abcjs.length + 1) })
  }
}

console.log(
  `${harvested.length} new tunes from ${walk(testsDir).filter((f) => f.endsWith('.test.js')).length} test files ` +
    `(${duplicates} already in the ${alreadyCovered}-fixture corpus)`,
)
if (dry) {
  for (const h of harvested) console.log(`  ${h.name}  <- ${h.from}`)
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
// Cleared first: a rename would otherwise leave the old file behind and the gate would
// go on measuring a fixture the harvest no longer produces.
for (const f of readdirSync(outDir)) if (f.endsWith('.abc')) rmSync(join(outDir, f))
for (const h of harvested) writeFileSync(join(outDir, `${h.name}.abc`), h.abc)
writeFileSync(
  join(outDir, '..', 'SOURCES.json'),
  `${JSON.stringify(Object.fromEntries(harvested.map((h) => [h.name, h.from])), null, 2)}\n`,
)
if (!existsSync(join(outDir, '..', 'README.md'))) {
  writeFileSync(
    join(outDir, '..', 'README.md'),
    [
      '# abcjs test-suite corpus',
      '',
      'ABC tunes extracted from abcjs 6.6.3\u2019s own `tests/` directory by',
      '`scripts/harvest-abcjs-tests.mjs`, with goldens generated by abcjs itself',
      '(`npm run harvest:goldens`). `SOURCES.json` maps each fixture back to the test file',
      'it came from.',
      '',
      'These are inputs, not assertions \u2014 abcjs\u2019s tests assert against its internal',
      '`visualObj` tree, which `abcts/compat` does not reproduce. What is reused is the',
      'maintainers\u2019 choice of what is worth exercising.',
      '',
      '## Licence',
      '',
      'The ABC text is from abcjs, which is MIT licensed:',
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
