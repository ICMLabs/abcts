/**
 * Generate abcjs goldens for the harvested corpus, by running abcjs itself.
 *
 * The tools are abcjs's own (`Tools/abcjs-debug/dump-*.js` in the abcMusicKit tree), so
 * the goldens are abcjs's output and not our idea of it. They are written HERE rather
 * than beside abcjs's other goldens because `../abcMusicKit` is read-only from this repo.
 *
 * A fixture abcjs itself cannot render is recorded in `SKIPPED.json` with its error and
 * left without a golden — that is a fact about the tune, not a gate failure, and the gate
 * counts it so the number cannot drift silently.
 *
 *   node scripts/harvest-abcjs-goldens.mjs [--only <substring>]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'abcts.config.json'), 'utf-8'))
const tools = join(root, config.goldens, '..')
const fixtures = join(root, 'tests', 'corpus-abcjs', 'fixtures')
const out = join(root, 'tests', 'corpus-abcjs', 'golden')

const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : undefined

mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) rmSync(join(out, f))

const names = readdirSync(fixtures)
  .filter((f) => f.endsWith('.abc') && (only === undefined || f.includes(only)))
  .map((f) => f.replace(/\.abc$/, ''))
  .sort()

/**
 * ⚠️ **`dump-svg.js` DEFAULTS TO abcjs 6.6.3, AND THIS SCRIPT USED TO LET IT.**
 *
 *     var abcjsPath = path.resolve(__dirname,
 *       '../../Docs/References/abcjs/abcjs-' + (process.env.ABCJS_VERSION || '6.6.3'))
 *
 * The committed goldens are 6.7.0 — the parity target since 2026-08-08 — so running this
 * without the variable REBASELINED THE BYTE GATE'S ORACLE AGAINST A SUPERSEDED REFERENCE,
 * silently and across all 176 fixtures. The tell is `class=""` on every element group: 6.6.3
 * writes it and 6.7.0 does not, so the diff looks cosmetic and is a version change.
 *
 * The version is taken from `abcts.config.json`'s `abcjsRef`, which is the same path every
 * other harvester loads abcjs from — one source, so the two cannot disagree.
 */
const ABCJS_VERSION = /abcjs-([\d.]+)$/.exec(config.abcjsRef)?.[1] ?? '6.7.0'

const skipped = {}
let made = 0
for (const name of names) {
  const abc = join(fixtures, `${name}.abc`)
  try {
    execFileSync(
      process.execPath,
      [join(tools, 'dump-svg.js'), '--file', abc, '--output', join(out, `${name}.svg`)],
      { cwd: tools, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ABCJS_VERSION } },
    )
    made++
  } catch (e) {
    skipped[name] =
      String(e.stderr ?? e.message)
        .split('\n')
        .find((l) => /Error|error/.test(l))
        ?.trim()
        ?.slice(0, 200) ?? 'unknown'
  }
}

writeFileSync(join(out, '..', 'SKIPPED.json'), `${JSON.stringify(skipped, null, 2)}\n`)
console.log(
  `${made} goldens written, ${Object.keys(skipped).length} skipped (abcjs itself errored)`,
)
for (const [name, why] of Object.entries(skipped)) console.log(`  ${name}: ${why}`)
