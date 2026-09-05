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
 * ⚠️ **EVERY TUNE, THROUGH THE OBJECT ENTRY POINT.** `getMidiFile` on a STRING is
 * `renderEngine(callback, "*", …)` and `renderEngine` renders one tune per output SLOT
 * (`synth/get-midi-file.js:38`), so it yields the FIRST tune and nothing else — which left
 * 460 of the corpus's 691 tunes never compared. The other arm,
 * `else return callback(null, source, 0)` (`:40`), takes ONE TUNE OBJECT, so `parseOnly`
 * then one call per tune reaches all of them. Keys are `<slug>#<tune>`.
 *
 * ⚠️ That arm was broken on our side until 2026-09-05 — it assumed an ARRAY and threw
 * `tunes.map is not a function` — so **the entry point needed to test the other 460 tunes
 * was itself the first defect widening found.**
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
let tunes = 0
for (const f of files) {
  const slug = f.replace(/\.abc$/, '')
  const abc = readFileSync(join(fixtures, f), 'utf-8')
  let parsed = []
  try { parsed = abcjs.parseOnly(abc) } catch { parsed = [] }
  for (let i = 0; i < parsed.length; i += 1) {
    tunes += 1
    const key = `${slug}#${i}`
    try {
      const r = abcjs.synth.getMidiFile(parsed[i], { midiOutputType: 'encoded' })
      const v = Array.isArray(r) ? r[0] : r
      midi[key] = typeof v === 'string' ? v : `NOT A STRING: ${typeof v}`
    } catch (e) {
      midi[key] = `THREW: ${e?.message ?? e}`
      threw += 1
    }
  }
}
writeFileSync(
  out,
  `${JSON.stringify({ abcjs: ABCJS_VERSION, generatedBy: 'scripts/harvest-abcjs-midi-corpus.mjs', midi }, null, 1)}\n`,
)
console.log(`${files.length} fixtures, ${tunes} tunes -> ${out}  (${threw} threw)`)
