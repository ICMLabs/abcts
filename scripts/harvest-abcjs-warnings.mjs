/**
 * Harvest abcjs's `tune.warnings` — the strings a host SHOWS — by RUNNING abcjs 6.7.0's
 * parser over every fixture of BOTH corpora.
 *
 * ── WHAT IT RECORDS ─────────────────────────────────────────────────────────
 * The array verbatim, per tune, and only for the tunes that have one: abcjs hangs
 * `warnings` on the tune ONLY when the parse produced any (`abc_tunebook.js:87-89`), so an
 * absent key and an empty array are different answers.
 *
 * Each string is built by `warn(str, line, col)` (`abc_parse.js:194-203`):
 *
 *     "Music Line:" + lineIndex + ":" + (col + 1) + ": " + message + ":  " + clean_line
 *
 * where `clean_line` is the 64 characters either side of the offending one with that one
 * wrapped in a `<span style="text-decoration:underline;…">`, `&`/`<`/`>` escaped, and a
 * space or a missing character spelled `SPACE`. The FORMAT is as much of the contract as
 * the wording is, which is why the whole string is compared.
 *
 * ── PARSE ONLY ──────────────────────────────────────────────────────────────
 * `parseOnly` rather than `renderAbc`: warnings come from the PARSER, so no DOM and no
 * `getBBox` stub — and no chance of a layout difference colouring the oracle.
 *
 *   node scripts/harvest-abcjs-warnings.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const ABCJS = require(join(root, config.abcjsRef, 'index'))

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.corpus)],
]

const out = {}
let tunes = 0
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort().filter((f) => f.endsWith('.abc'))) {
    const abc = readFileSync(join(dir, file), 'utf-8')
    let parsed = []
    try {
      parsed = ABCJS.parseOnly(abc)
    } catch (e) {
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    parsed.forEach((tune, i) => {
      tunes += 1
      const key = `${label}/${file.replace(/\.abc$/, '')}-tune${i}`
      // ABSENT and EMPTY are different answers — see the note above.
      out[key] = tune.warnings === undefined ? null : tune.warnings
    })
  }
}

const dir = join(root, 'tests', 'corpus-warnings')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const warned = Object.values(out).filter((v) => v !== null)
console.log(
  `${tunes} tunes, ${warned.length} with warnings, ${warned.reduce((n, v) => n + v.length, 0)} warnings`,
)
