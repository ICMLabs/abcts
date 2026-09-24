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
 *    warning. ✅ **AND `[K:C CDEF|` CLOSED 2026-09-24 — it was NOT warnings-only.** An `[X:`
 *    with no `]` ran to the end of the line here and drew an EMPTY PAGE; abcjs runs the field
 *    on `line.substring(0, i+3)` (the swapped `substring(i+3, -1)`), consumes nothing, and
 *    reads the `[` again as a failed chord. `tests/unterminated-field.test.ts`.
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
 *    ✅ **AND THE LAST TWO CLOSED TOO**: `%%score`'s six bracket warnings (the flags were all
 *        there and none of them warned — and `justOpen…` is part of the CLOSE test, so `()`
 *        warns on an EMPTY group), and a `w:` before any music, which abcjs DROPS with a
 *        warning whose text is the literal `SPACE`. **The class is closed.**
 * 3. ✅ **WHAT A CHUNK OF THE BOOK IS — CLOSED 2026-09-23**, and it was three rules, not one.
 *    abcjs cuts the book on `"\nX:"` ALONE and then truncates each chunk at its first `\n\n`
 *    (`abc_parse_book.js:18-37`), which the parse loop confirms by falling out of
 *    `while (line)` on the first EMPTY line (`abc_parse.js:548-563`):
 *      • **an empty tune is still a tune** — `''` gives ONE tune and a 37.56px page, where
 *        `renderAbc(div, '')[0]` was `undefined`;
 *      • **a blank line ENDS the chunk, it does not start a tune** — `X:1 / CDEF| / ⏎ /
 *        GABc|` is one tune of one line and the rest is DISCARDED, where we made a second
 *        tune and wrote a staff into a second div abcjs leaves empty, disagreeing with our
 *        own `numberOfTunes`;
 *      • **whitespace is not empty** — `" "` is truthy to `nextLine()`, so a space on the
 *        line between two music lines joins them into ONE tune of two staves.
 *    ⚠️ **And a chunk holding only a `W:` or a `%%text` is not empty**: `flush` dropped it,
 *    losing 96.5px of words and a whole text line.
 * 4. ✅ **THE LEADING CHUNK'S `%%` LINES ARE PREPENDED TO EVERY TUNE — CLOSED 2026-09-24.**
 *    abcjs keeps them as TEXT and each tune parses them again (`abc_parse_book.js:22-37`), so
 *    `%%text hi` above the first `X:` is a row in every tune. Ours kept a FORMATTING SNAPSHOT
 *    of that chunk and lost every directive that makes content. They REPLAY now, into each
 *    tune, at the offsets abcjs's string gives them — the `header.length` characters before
 *    the tune, packed end to end (`abc_tunebook.js:84`) — and their warnings are not raised
 *    twice. The snapshot and its 70 lines are gone.
 * 5. ✅ **THE THREE REWRITES BEFORE THE FIRST LINE IS READ — CLOSED 2026-09-23.** abcjs
 *    normalizes line endings, blanks latex lines and swaps escaped percents before it reads
 *    anything (`abc_parse.js:497-512`), and the book is STRIPPED and its leading chunk's
 *    non-`%%` lines are never parsed (`abc_parse_book.js:9-31`). A classic-Mac file whose only
 *    separator is `\r` was ONE line here — a whole book as a 37.56px empty page — and a CRLF
 *    file's offsets were the host's rather than the normalized ones abcjs reports. ⚠️ **AND
 *    THE PROJECTION WAS READING A DIFFERENT STRING FROM THE PARSE**: `tune.lines` tiles spans
 *    per source line and tiled from character 0 with no `\n` to find, so the parser had it
 *    right and the tune object did not. `normalizeSource` is now the one door both use.
 *    ⚠️ **WHAT IS LEFT IS THE CHUNKING, WHICH abcjs DOES ON THE RAW STRING**: it cuts the book
 *    on `"\nX:"` BEFORE normalizing, so `X:1\rC|\rX:2\rD|` is ONE tune of two lines to abcjs
 *    (its split finds no `\n`) where ours is two tunes, and in a CRLF book a later tune's
 *    offsets are its RAW start plus its NORMALIZED interior — tune 2 of
 *    `X:1⏎C|⏎⏎X:2⏎D|` is `note15,16` to abcjs and `note12,13` here, the three `\r`s before it.
 *    MEASURED, not built: reproducing it means chunking the raw source and giving each chunk
 *    its own offset base, which is a different parser entry, not a rewrite.
 * 6. ✅ **A BARE `&` LAYER — CLOSED 2026-09-24, AND IT WAS NOT A FUZZ ROW AT ALL.** Chasing
 *    `C&|` found that an `&` forces the voice it interrupts UP for its own measure — a
 *    `stem up` before the barline opening it, a `stem auto` after the one closing it
 *    (`tune-builder.js:601-606`), each the engraver's `stemdir` until the next — and ours
 *    had NEVER modelled it: `c2&e2|` stemmed its `c` down into the layer's `e`. The corpus
 *    overlays pass only because their main voices sit low enough to stem up anyway.
 *    `Measure.overlayStem` carries the marker. And the fuzz rows themselves: an EMPTY layer
 *    is still an `&` (`Measure.writtenOverlays`), a run of `&` belongs to nothing, and a
 *    voice that sings nothing is DELETED after overlays resolve, the main one included
 *    (`Voice.deletedByOverlay`) — `&|` is a staff with no voices and a 37.56px page.
 */
const DECLARED = new Set([
  'cr two tunes',
  /**
   * ⚖️ **RULED, NOT OPEN.** `C99999999|` is a note past every glyph abcjs has, and abcjs
   * draws its own red DEBUG TEXT for it — `pitch is undefined`, an `abcjs-debug-msg` — which
   * is its whole 113.992px against our 94.617. The same ruling as `abcts-rests-and-bars-tune14`
   * in `tests/open-rows.ts`: we decline to draw an internal error message as music.
   */
  'huge duration',
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
