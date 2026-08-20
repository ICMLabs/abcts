/**
 * Harvest THE SHAPE OF `parseOnly`'s TUNE — which FIELDS an unengraved tune carries — by
 * RUNNING abcjs 6.7.0 over both corpora.
 *
 * ── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
 * abcjs's `parseOnly` is `renderEngine` with a callback that does nothing
 * (`api/abc_tunebook.js:42-54`): the tune is PARSED and never ENGRAVED. Ours has been
 * `renderAbc(['*'])`, which lays the tune out — so a host calling `parseOnly` got fields
 * abcjs does not give it, and no gate here could see that, because every other oracle in
 * the repo is harvested from a RENDERED tune. It was written down rather than fixed for
 * three sessions running. This measures it.
 *
 * ── THE SHAPE, AND WHY IT IS FIELD NAMES RATHER THAN VALUES ─────────────────
 * What the engraver does to the parse tree is ADD to it and RENAME it — `highestVert`,
 * `averagepitch` and `printer_shift` are stamped onto elements, `rest.type` is rewritten
 * to `whole`, `createKeySignature` opens with `elem.el_type = "keySignature"` where the
 * parser wrote `key`, and `draw` hangs an `abselem` on everything it draws. So the
 * question is not what a number is, it is WHICH FIELDS EXIST — and the answer per tune is
 * small: the union of own property names per `el_type`, which is a row of text.
 *
 * Values would be the second gate and are not this one: `tune.lines`'s own character gate
 * and `synth.sequence` already hold the values a RENDERED tune carries.
 *
 * ── NO DOM ──────────────────────────────────────────────────────────────────
 * Nothing renders, so there is no `document` to stub. That is the point of the file.
 *
 * ── LICENCE ─────────────────────────────────────────────────────────────────
 * The fixtures are abcjs's authors' work where they came from abcjs, and abcjs is MIT.
 *
 * ⚠️ **THE REDUCTION IS A SHARED FILE** — `tests/parse-only-script.ts`, imported here and
 * by the test, which is why this harvester is a `.ts` run through `tsx`:
 *
 *   npx tsx scripts/harvest-abcjs-parse-only.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const abcjsPath = join(root, config.abcjsRef)
const require = createRequire(join(root, config.goldens, '..', 'package.json'))
const ABCJS = require(join(abcjsPath, 'index'))

import { rowsOfTune } from "../tests/parse-only-script.js";

const corpora = [
  ['repo', join(root, 'tests', 'corpus-abcjs', 'fixtures')],
  ['sib', join(root, config.goldens, '..', 'fixtures')],
]

const out = {}
for (const [label, dir] of corpora) {
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.abc')) continue
    const abc = readFileSync(join(dir, file), 'utf-8')
    let tunes
    try {
      tunes = ABCJS.parseOnly(abc)
    } catch (e) {
      console.error(`SKIPPED ${label}/${file}: ${e.message}`)
      continue
    }
    tunes.forEach((tune, i) => {
      out[`${label}/${file.replace(/\.abc$/, '')}-tune${i}`] = rowsOfTune(tune)
    })
  }
}

const outDir = join(root, 'tests', 'corpus-parse-only')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'golden.json'), `${JSON.stringify(out, null, 1)}\n`)
const rows = Object.values(out).reduce((n, v) => n + v.length, 0)
console.log(`${Object.keys(out).length} tunes, ${rows} rows`)
