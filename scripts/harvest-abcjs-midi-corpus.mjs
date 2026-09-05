/**
 * **THE MIDI-FILE ORACLE FOR THE WHOLE CORPUS, BY RUNNING abcjs.**
 *
 *   node scripts/harvest-abcjs-midi-corpus.mjs
 *
 * `tests/corpus-midi/` is three cases lifted from abcjs's own `midi.test.js` ASSERTIONS.
 * This is the other kind of oracle and the one the arc needed: abcjs 6.7.0 ASKED, over every
 * fixture in `tests/corpus-abcjs/fixtures/`, for what it actually produces. Its own suite
 * asserts none of this.
 *
 * ⚠️ **THE VERSION IS PINNED IN THE PATH AND RECORDED IN THE FILE.** `CLAUDE.md` records
 * `harvest-abcjs-goldens.mjs` silently rebaselining the SVG byte gate against 6.6.3, because
 * its version was a default rather than a statement. The written `abcjs` field is what
 * `tests/midi-bytes.test.ts` checks, so a harvest against the wrong tree fails loudly
 * instead of moving the target.
 *
 * ⚠️ **AND `getMidiFile` ON A STRING YIELDS ONE TUNE, NOT ONE PER `X:`** — it is
 * `renderEngine(callback, "*", …)` and `renderEngine` renders one tune per output SLOT
 * (`synth/get-midi-file.js:38`). So a multi-tune fixture is represented by its FIRST tune
 * here, exactly as a host calling the same function would see it. Reaching the others means
 * passing more slots, which is a different entry point and a different gate.
 */
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require0 = createRequire(import.meta.url)
const ABCJS_VERSION = '6.7.0'
const ABCJS_PATH = `/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-${ABCJS_VERSION}/dist/abcjs-basic-min.js`
const abcjs = require0(ABCJS_PATH)

const repo = join(import.meta.dirname, '..')
const fixtures = join(repo, 'tests', 'corpus-abcjs', 'fixtures')
const out = join(repo, 'tests', 'corpus-abcjs', 'midi.json')

const files = readdirSync(fixtures).filter((f) => f.endsWith('.abc')).sort()
const midi = {}
let threw = 0
for (const f of files) {
  const slug = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  try {
    const r = abcjs.synth.getMidiFile(abc, { midiOutputType: 'encoded' })
    const first = Array.isArray(r) ? r[0] : r
    midi[slug] = typeof first === 'string' ? first : `NOT A STRING: ${typeof first}`
  } catch (e) {
    midi[slug] = `THREW: ${e?.message ?? e}`
    threw += 1
  }
}
writeFileSync(
  out,
  `${JSON.stringify({ abcjs: ABCJS_VERSION, generatedBy: 'scripts/harvest-abcjs-midi-corpus.mjs', midi }, null, 1)}\n`,
)
console.log(`${files.length} fixtures -> ${out}  (${threw} threw)`)
