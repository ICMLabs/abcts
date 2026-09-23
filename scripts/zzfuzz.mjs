/**
 * **WHAT DOES A DROP-IN DO WITH INPUT A USER IS HALFWAY THROUGH TYPING?**
 *
 * Every fixture in both corpora is VALID ABC — 180 harvested from abcjs's own suite and 57
 * controls written to pin a rule — so malformed input had no gate at all. This runs
 * `tests/corpus-fuzz/cases.json` through BOTH engines in ONE WebKit page and compares what a
 * host can see: the tune count, the warning strings, the element stream per voice, and the
 * rendered page's own height.
 *
 *     node scripts/zzfuzz.mjs            # the table
 *     node scripts/zzfuzz.mjs -v         # …with every declared row's measurement
 *
 * ⭐ **IT FOUND SIX DEFECTS ON ITS FIRST RUN** (2026-09-23) and two were fixed the same hour:
 * a line of nothing but barlines was DELETED (the voice's emptiness was tested before the
 * pending barline was flushed), and consecutive barlines COLLAPSED into one (the lexer's `|`
 * arm was a greedy run where `getBarLine` is a bounded decision tree, so `|||` drew one
 * barline where abcjs draws two). Both had a `ponytail:`-shaped comment saying no fixture
 * wrote the shape — which was true, and is what this file is for.
 *
 * The rest are DECLARED below with their measurements, in the shape `svg-bytes`'s `DIVERGENT`
 * list uses: a row here without a measurement is a tolerance wearing a disguise.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require0 = createRequire(import.meta.url)
const PW = process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js'
const { webkit } = require0(PW)
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const ABCJS =
  process.env.ABCJS ??
  '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.1/dist/abcjs-basic-min.js'
const VERBOSE = process.argv.includes('-v')

/**
 * **THE ROWS THAT DIFFER, EACH MEASURED.** Four classes, and the first is the one worth
 * fixing next: it is what an EDITOR sees on every keystroke.
 *
 * 1. ✅ **RECOVERY FROM AN UNTERMINATED CONSTRUCT — CLOSED 2026-09-23.** It was one shared
 *    primitive: `getBrackettedSubstring` clamps a missing close to a per-construct BUDGET
 *    rather than eating the line, and ours ran to the newline, so one stray `{` or `"` lost
 *    everything after it — what an editor sees on every keystroke. `{ab CDEF|`, `"Am CDEF|`,
 *    `!trill CDEF|` and six more rungs now match abcjs element for element and warning for
 *    warning. ⚠️ **What is LEFT of the class is `[K:C CDEF|`** — abcjs raises seven warnings
 *    walking out of a failed inline field where we raise one, and the ELEMENTS agree.
 * 2. ✅ **WARNINGS THIS PARSER DID NOT RAISE — three of five CLOSED 2026-09-23**, each a
 *    RETRY rather than a message: abcjs fails the attempt and `parseMusic`'s
 *    `if (i === startI)` warns per character it walks past.
 *      • **a tuplet field is ONE DIGIT** — `(99999` is a tuplet of nine and four warnings,
 *        and `p < 2` warns at its own digit and builds nothing;
 *      • **an accidental run is the longest LEGAL SUFFIX** — `^^^^^^C` keeps `^^C` and warns
 *        four times, `^_C` keeps `_C` and warns once, where ours accumulated and clamped
 *        (a silent double sharp, and `^_` a silent NATURAL);
 *      • **a `-` that nothing can continue is an unknown character** — and a SPACE is enough
 *        to fail it, so `- C|` warns where `-C|` does not.
 *    ⚠️ **AND CLOSING THE TUPLET ONE EXPOSED A RENDERING DEFECT**: a group that never reaches
 *    its count draws NOTHING in abcjs (`endTriplet` is never stamped and a `TripletElem` with
 *    no end is never drawn), where we drew a bracket and a number — 19.4px on a shape a user
 *    makes by typing `(3` and stopping. `TupletMark.closes`.
 *    **What is LEFT: `%%score (((` and a `w:` before any music.**
 * 3. **AN EMPTY TUNE IS STILL A TUNE.** `''` and `'\n\n\n'` give abcjs ONE tune object and a
 *    37.56px page; ours gives zero tunes and no SVG, so `renderAbc(div, '')[0]` is undefined
 *    where abcjs hands back an object.
 * 4. **A BARE `&` LAYER.** `&|` and `&&&|` give abcjs NO lines where ours draws a barline, and
 *    `C&|` gives abcjs `stem note bar stem` — `createVoice`'s stem pair survives the empty
 *    layer's removal — where ours gives `note bar`. MEASURED, not built: `resolveOverlays`
 *    and `createVoice` interact here and a half-understood fix is worth less than this note.
 */
const DECLARED = new Set([
  'empty',
  'blank lines',
  'unterminated slur',
  'unterminated bracket field',
  'huge duration',
  'unicode',
  'directive garbage',
  'overlay only',
  'bare overlay after a note',
])

const cases = JSON.parse(readFileSync(`${REPO}/tests/corpus-fuzz/cases.json`, 'utf-8'))

const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
await page.addScriptTag({ content: readFileSync(`${REPO}/dist/abcts-browser.global.js`, 'utf-8') })

const rows = await page.evaluate((cases) =>
  cases.map(({ label, abc }) => {
    const one = (name) => {
      // A fresh div per engine per case: one engine leaving its markup behind reads as the
      // other's answer, which is how the first run of this probe lied.
      const div = document.createElement('div')
      div.id = `d${Math.random().toString(36).slice(2)}`
      document.body.appendChild(div)
      try {
        const tunes = window[name].renderAbc(div.id, abc, { add_classes: true })
        const svg = div.querySelector('svg')
        return {
          tunes: tunes.length,
          warnings: (tunes[0]?.warnings ?? []).length,
          height: svg ? svg.getAttribute('height') : null,
          stream: (tunes[0]?.lines ?? [])
            .map((l) =>
              l.staff
                ? l.staff
                    .map((st, si) =>
                      (st.voices ?? [])
                        .map(
                          (v, vi) =>
                            `s${si}v${vi}[` +
                            v
                              .map((e) =>
                                e.el_type === 'bar' ? e.type.replace('bar_', '') : e.el_type,
                              )
                              .join(' ') +
                            ']',
                        )
                        .join(' '),
                    )
                    .join(' ')
                : 'nonmusic',
            )
            .join(' | '),
        }
      } catch (e) {
        return { threw: (e?.message ?? String(e)).slice(0, 80) }
      }
    }
    return { label, js: one('ABCJS'), ts: one('ABCTS') }
  }),
cases)
await browser.close()

let differ = 0
let undeclared = 0
const closed = []
for (const { label, js, ts } of rows) {
  const same = JSON.stringify(js) === JSON.stringify(ts)
  const declared = DECLARED.has(label)
  if (same && declared) closed.push(label)
  if (same) {
    if (VERBOSE) console.log(`  same      ${label}`)
    continue
  }
  differ += 1
  if (!declared) undeclared += 1
  console.log(`  ${declared ? 'declared' : 'DIFFER  '}  ${label}`)
  if (VERBOSE || !declared) {
    console.log(`       js ${JSON.stringify(js)}`)
    console.log(`       ts ${JSON.stringify(ts)}`)
  }
}
console.log(
  `\n${differ} of ${rows.length} differ — ${differ - undeclared} declared, ${undeclared} NOT`,
)
if (closed.length > 0)
  console.log(`\n⚠️  DELETE these from DECLARED — they AGREE now: ${closed.join(', ')}`)
process.exit(undeclared === 0 && closed.length === 0 ? 0 : 1)
