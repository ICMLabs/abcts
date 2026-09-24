/**
 * **THE `ponytail:` LEDGER, SWEPT — one CONTROL per open prediction, both engines live.**
 *
 * The repo's own rule: a `ponytail:` saying *"no fixture in either corpus writes one"* is a
 * PREDICTION, not a measurement, and writing the fixture is how it becomes one. Thirteen of
 * one day's thirty-one defects came from four sweeps of this ledger; it has grown from 54
 * markers to 97 since the last one.
 *
 * Same harness as `zzlive.mjs` — abcjs 6.7.0 and abcts in ONE WebKit page, byte-compared —
 * because the tunes are not in the corpus yet and there is nothing to harvest a golden
 * from. A row that DIFFERS names a defect the ledger predicted was harmless; a row that
 * AGREES closes the marker, which is worth as much and costs the same.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/zzledger.mjs
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit, chromium } = require0(process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js')

const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.1/dist/abcjs-basic-min.js'
const OURS = join(import.meta.dirname, '..', 'dist', 'abcts-browser.global.js')
if (!existsSync(OURS)) throw new Error(`no ${OURS} — run npm run build`)

const H = 'X:1\nM:4/4\nL:1/4\n'
/** [marker, what it predicts, abc] — one variable per rung, as the ladder rule asks. */
const CASES = [
  ['layout.ts:9145', 'a curve whose ends fall in different SYSTEMS is dropped',
    `${H}K:C\n(CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd'|CDEF|GABc|defg|abc'd')|\n`],
  ['layout.ts:9296', 'a chord where one head closes a slur still contributes its others',
    `${H}K:C\n(C [Ec]) d e|\n`],
  ['layout.ts:13469', 'one LINE holding two lyric elements with different vocalPosition',
    `${H}K:C\nCDEF|[I:vocal below]GABc|\nw:a b c d e f g h\n`],
  ['layout.ts:19807', 'an ANNOTATION on the other voice’s note at a rest collision',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nz4|\nV:2\n"^x"CDEF|\n`],
  ['layout.ts:374', 'three annotations above AND two below on one note',
    `${H}K:C\n"^a""^b""^c""_d""_e"C D E F|\n`],
  ['layout.ts:13417', 'SOME voices on a staff declare stems= and others do not',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1 stems=up\nV:2\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n`],
  ['layout.ts:3564', 'a Q: whose beat unit is 3/32 — abcjs’s table names a glyph that does not exist',
    `X:1\nM:4/4\nL:1/4\nQ:3/32=60\nK:C\nCDEF|\n`],
  ['layout.ts:14857', 'a moved bar that also carries a bar NUMBER',
    `X:1\n%%barnumbers 1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|GABc|\nV:2\nC,8|G,8|\n`],
  ['parser.ts:365', 'an unsupported key signature that also carries a parameter',
    `X:1\nM:4/4\nL:1/4\nK:Cbmin clef=bass\nCDEF|\n`],
  ['parser.ts:6623', 'a microtone INSIDE a chord',
    `${H}K:C\n[^/C^/E] D E F|\n`],
  ['parser.ts:5019', 'a voice DECLARED AFTER a K: that carries transpose=',
    `X:1\nM:4/4\nL:1/4\nK:C transpose=2\nV:1\nCDEF|\n`],
  ['parser.ts:7472', 'a lyric line carrying a | bar-alignment hint',
    `${H}K:C\nCDEF|GABc|\nw:a b|c d e f g h\n`],
  ['parser.ts:1114', 'a two-voice staff back-filled by %%score',
    `X:1\nM:4/4\nL:1/4\n%%score (1 2) 3\nV:1\nV:2\nV:3\nK:C\nV:1\nCDEF|\nV:2\nGABc|\nV:3\nEFGA|\n`],
  ['model.ts:2003', 'free text BETWEEN two music lines',
    `${H}K:C\nCDEF|\n%%text between\nGABc|\n`],
  ['model.ts:286', 'a clef written explicitly where the default would be the same',
    `X:1\nM:4/4\nL:1/4\nK:C clef=treble\nCDEF|\n`],
  ['lines.ts:1077', 'a melisma held across more than one verse',
    `${H}K:C\nCDEF|\nw:a_ b c d\nw:e_ f g h\n`],

  /**
   * **THE SECOND SWEEP, 2026-09-09** — the ~80 markers the first pass classified by
   * READING rather than by writing a control. Four of these six were defects.
   */
  ['parser.ts:s-line', 'a `*` in an s: line — addSymbols is NOT addWords',
    `${H}K:C\nCDEF|\ns:!trill! * !fermata! *\n`],
  ['parser.ts:3868', 'a %%voicecolor with NO voice declared',
    `${H}%%voicecolor red\nK:C\nCDEF|\n`],
  ['parser.ts:3868b', 'a %%voicecolor written after the SECOND of two V: declarations',
    `${H}%%score (1 2)\nV:1\nV:2\n%%voicecolor red\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n`],
  ['model.ts:1871', 'a MID-TUNE %%newpage, which costs nothing where a header one costs 61.33px',
    `${H}K:C\nCDEF|\n%%newpage\nGABc|\n`],
  ['layout-model.ts:682', 'a BOXED multi-row block — rowExtra as one number',
    `${H}%%historyfont Times-Roman 14 box\nK:C\nCDEF|\nH:first line\nH:second line\n`],
  ['layout.ts:19683', 'a staff whose ONLY below-dynamic is a hairpin',
    `${H}K:C\n!<(!C!<)!DEF|\n`],
  ['layout.ts:1316', 'a line whose SHORTEST note is longer than a quarter',
    `${H}K:C\nC2D2|E4|\n`],
  ['layout.ts:8306', 'a curve spanning MORE than two systems',
    `${H}K:C\n(CDEF|GABc|\ndefg|abc'd'|\nCDEF)|\n`],
  ['layout.ts:13829', 'unequal-length voices whose last bar is |]',
    `${H}%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|GABc|]\nV:2\nCDEF|]\n`],
  ['layout.ts:16725', 'a mid-tune T: block of TWO lines',
    `X:1\nT:First\nM:4/4\nL:1/4\nK:C\nCDEF|\nT:Second\nT:Third\nGABc|\n`],
  ['layout.ts:18725', 'an ENDING bracket on a staff that also carries a part label',
    `${H}K:C\nP:A\n|:CDEF|1 GABc:|2 defg|]\n`],
  ['parser.ts:1120', 'an & overlay on a SHARED staff',
    `${H}%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|\nV:2\nGABc|&EFGA|\n`],
  ['parser.ts:2615', 'a mid-body V: that changes octave= partway',
    `${H}V:1 octave=1\nK:C\nCDEF|\nV:1 octave=-1\nGABc|\n`],
  ['layout.ts:3455', 'an accidental CLUSTER that would need two columns',
    `${H}K:C\n[^C^D^E]4|\n`],
  ['parser.ts:4914', 'a header K: style= over TWO voices — the engraver leak',
    `${H}%%score (1 2)\nV:1\nV:2\nK:C style=rhythm\nV:1\nCDEF|\nV:2\nGABc|\n`],
  ['directive:voicescale', '%%voicescale — the arm beside %%voicecolor, guarded the same way',
    `${H}V:1\n%%voicescale 1.5\nK:C\nCDEF|\n`],
  // ✅ FIXED 2026-09-09 — `voiceScale` is a property of the LINE, not of the voice.
  // `createVoice` re-asserts it from a `scale` ELEMENT at every line head
  // (`tune-builder.js:990-991`) and `%%voicescale` appends one where it stands as well
  // (`abc_parse_directive.js:858-860`), so the directive reaches the line it is written in
  // — which a `[K: style=]` in the same position does NOT. See `Measure.lineScale`.
  ['directive:voicescale2', 'a SECOND %%voicescale mid-tune, which abcjs applies FROM THERE',
    `${H}V:1\n%%voicescale 1.5\nK:C\nCDEF|\n%%voicescale 0.6\nGABc|\n`],

  /**
   * **THE CHORD-TIE LADDER** — where the `-` is written decides what may close the tie,
   * and an unclosed one runs to the end of the line. Every row was a divergence before
   * 2026-09-09; `t13`'s 0.01 y rounding is older and still open.
   */
  ['tie:internal-note', 'a tie inside a chord cannot close on a single NOTE',
    `${H}K:C\n[C-E]C|\n`],
  ['tie:internal-every', 'every head marked inside the bracket is still not the whole-chord form',
    `${H}K:C\n[C-E-]C|\n`],
  ['tie:after-note', 'a mark AFTER the bracket does reach a single note',
    `${H}K:C\n[CE]-C|\n`],
  ['tie:across-rest', 'a chord-internal tie spans a rest to the next chord',
    `${H}K:C\n[C-E]z[CE]|\n`],
  ['tie:across-note', '…and an intervening note',
    `${H}K:C\n[C-E]D[CE]|\n`],
  ['tie:by-position', 'it closes at the SOURCE position, which sorting moves',
    `${H}K:C\n[C-E][EC]|\n`],
  ['tie:fallback', 'an arriving head with no pitch match closes the OLDEST open tie',
    `${H}K:C\n[CE]-[GE]|\n`],
  ['tie:dangling-end', 'a tie on the last note of the tune runs to the end of the line',
    `${H}K:C\nGGGG|GGGG-|\n`],

  /**
   * **THE THIRD SWEEP, 2026-09-24** — every marker re-evaluated after the line-head,
   * meter-grammar and held-barline fixes. SVG only: `/tmp/gp/pt.mjs` compared tune.lines,
   * warnings and MIDI too, and the markers record what those found.
   */
  ["layout-model.ts:737b", "a BOXED part label over two parts",
    "X:1\n%%partsfont box\nM:4/4\nL:1/4\nK:C\nP:A\nCDEF|\nP:B\nGABc|\n"],
  ["layout.ts:915", "the quarter-tone prefixes ^/ and _/",
    "X:1\nM:4/4\nL:1/4\nK:C\n^/C _/D E F|\n"],
  ["layout.ts:2316", "a tempo mark under a non-default %%scale",
    "X:1\n%%scale 0.7\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n\"C\"CDEF|\n"],
  ["layout.ts:6411", "a two-row chord symbol",
    "X:1\nM:4/4\nL:1/4\nK:C\n\"C\\nG7\"CDEF|\n"],
  ["layout.ts:6411j", "a two-row chord symbol under jazzchords",
    "X:1\nM:4/4\nL:1/4\nK:C\n\"C7\\nGm7/Bb\"CDEF|\n", { jazzchords: true }],
  ["layout.ts:7329", "a hairpin crossing a break and closing on a BARLINE",
    "X:1\nM:4/4\nL:1/4\nK:C\n!crescendo(!CDEF|\ndefg!crescendo)!|\n"],
  ["layout.ts:7329b", "\u2026and closing on a NOTE, which agrees",
    "X:1\nM:4/4\nL:1/4\nK:C\n!crescendo(!CDEF|\nGAB!crescendo)!c|\n"],
  ["layout.ts:9381", "a slur over up-stems on a shared staff",
    "X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\n(CDEF)|\nV:2\nC,D,E,F,|\n"],
  ["layout.ts:9381b", "a slur over MIXED stems",
    "X:1\nM:4/4\nL:1/4\nK:C\n(CcC)D|\n"],
  ["layout.ts:10442", "beamed tuplets high above the staff",
    "X:1\nM:4/4\nL:1/8\nK:C\n(3c'd'e' (3f'g'a' b'4|\n"],
  ["layout.ts:10442b", "\u2026and low below it",
    "X:1\nM:4/4\nL:1/8\nK:C\n(3C,D,E, (3F,G,A, B,4|\n"],
  ["layout.ts:15472", "unequal-length voices ending ||",
    "X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|GABc||\nV:2\nC,4||\n"],
  ["layout.ts:16686", "a %%voicecolor mid-voice",
    "X:1\nM:4/4\nL:1/4\nV:1\nK:C\nV:1\nCDEF|\n%%voicecolor red\nGABc|\n"],
  ["layout.ts:21052", "an inline [P:] straight after |:",
    "X:1\nM:4/4\nL:1/4\nK:C\n|:[P:A]CDEF|1 GABc:|2 cdef|]\n"],
  ["layout.ts:21052b", "an ending with an inline [Q:]",
    "X:1\nM:4/4\nL:1/4\nK:C\n|:CDEF|1 [Q:1/4=90]GABc:|2 cdef|]\n"],
  ["wrap.ts:675", "a K: change then %%text, under wrap",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|\nK:D\n%%text hello\ndefg|abc'd'|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }],
  ["wrap.ts:675b", "%%text then a K: change, under wrap",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|\n%%text hello\nK:D\ndefg|abc'd'|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 }, staffwidth: 400 }],
  ["wrap.ts:747", "staves in different keys, under wrap",
    "X:1\nM:4/4\nL:1/4\n%%score 1 2\nV:1\nV:2\nK:C\nV:1\nCDEF|GABc|cdef|gabc'|\nV:2\n[K:D]C,D,E,F,|G,A,B,C|CDEF|GABc|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 2 }, staffwidth: 400 }],
  ["wrap.ts:878", "a bar number on a |:, under wrap",
    "X:1\n%%barnumbers 1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|:cdef|gabc':|CDEF|GABc|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 2 }, staffwidth: 400 }],
  ["parser.ts:3798", "[K: style=] reaching a whole voice",
    "X:1\nM:4/4\nL:1/4\nV:1\nV:2\nK:C\nV:1\nCDEF|\n[K:C style=x]GABc|\nV:2\nC,D,E,F,|\nG,A,B,C|\n"],
  ["flatten.ts:1892", "an inline [M:] on voice 0\u2019s later line only",
    "X:1\nM:4/4\nL:1/4\nV:1\nV:2\nK:C\nV:1\nCDEF|\nV:2\nC,D,E,F,|\nV:1\n[M:3/4]GAB|\nV:2\nG,A,B,|\n"],
  ["parser.ts:1340", "an & overlay on the FIRST voice of a shared staff",
    "X:1\nM:4/4\nL:1/4\n%%score (1 2)\nV:1\nV:2\nK:C\nV:1\nCDEF|G4&EFGA|\nV:2\nC,4|C,4|\n"],
  ["annotation:rows", "a two-row annotation is two marks, not one 1.19px taller",
    "X:1\nM:4/4\nL:1/4\nK:C\n\"^top\\nbottom\"CDEF|\n"],
  ["annotation:semicolon", "a ; in an annotation is a row break",
    "X:1\nM:4/4\nL:1/4\nK:C\n\"^a;b\"CDEF|\n"],
  ["annotation:groups", "position groups drawn in written order, rows backward",
    "X:1\nM:4/4\nL:1/4\nK:C\n\"^a\"\"<l\"\"_c\"\"^b\"\">r\"\"<m\"CDEF|\n"],
  ["gchordfont:box", "%%gchordfont box keeps the face in force",
    "X:1\nM:4/4\nL:1/4\n%%gchordfont Arial 14\n%%gchordfont box\nK:C\n\"C\"CDEF|\n"],
  ["part:after-bar-key", "an inline [P:] between |: and [K:], in source order",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n|:[P:A][K:D]CDEF|GABc:|\n"],
  ["hairpin:open-on-last-bar", "a hairpin opened on a line's last bar is a zero-length pair",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF!crescendo(!|\ndefg|\n"],
  ["wrap.ts:675c", "a K: after %%sep in a section that wraps onto a second line",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|\n%%sep\nK:D\ndefg|abc'd'|defg|abc'd'|defg|abc'd'|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 2 }, staffwidth: 400 }],
  ["wrap.ts:675d", "…and after a subtitle, which keeps the carried key",
    "X:1\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|\nT:Sub\nK:D\ndefg|abc'd'|defg|abc'd'|defg|abc'd'|\n", { wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 2 }, staffwidth: 400 }],
  ["meter:after-continuation", "an inline [M:] straight after a continuation",
    "X:1\nM:4/4\nL:1/4\nV:1\nK:C\nCDEF|\\\n[M:3/4]GAB|\n"],
  ["meter:parked-discarded", "a line-start [M:] after a V: field is taken and discarded",
    "X:1\nM:4/4\nL:1/4\nV:1\nV:2\nK:C\nV:1\nCDEF|\nV:2\nC,D,E,F,|\nV:1\n[M:3/4]GAB|\nV:2\nG,A,B,|\nV:1\nCDE|\nV:2\nC,D,E,|\n"],
  ["model.ts:2178", "a FILE-header %%landscape over two tunes",
    "%%landscape 1\n\nX:1\nK:C\nC|\n\nX:2\nK:C\nD|\n"],
]

const engine = process.env.ENGINE === 'chrome'
  ? { launcher: chromium, opts: { channel: 'chrome' }, name: 'chrome' }
  : { launcher: webkit, opts: {}, name: 'webkit' }
const browser = await engine.launcher.launch(engine.opts)
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
await page.addScriptTag({ content: readFileSync(OURS, 'utf-8') })
const ready = await page.evaluate(() => ({
  abcjs: typeof window.ABCJS?.renderAbc, abcts: typeof window.ABCTS?.renderAbc,
}))
if (ready.abcjs !== 'function' || ready.abcts !== 'function')
  throw new Error(`engines did not load: ${JSON.stringify(ready)}`)

/**
 * **THE FOUR THE SWEEP FOUND, each measured and each written up in ABCJS-DIFFERENCES.md.**
 * A marker here is a defect that is KNOWN and NAMED, never a tolerance: remove the row when
 * it is fixed and this goes red if it was not.
 */
const KNOWN = new Map([
  // ✅ parser.ts:4914 — FIXED 2026-09-09, and the marker's SIZE was right: it took a model
  // change, not a patch. Three rules, laddered over TEN rungs through both engines:
  //   1. `K: style=` is GLOBAL (`multilineVars.style`), not the current voice's — a header
  //      one over two voices reached only the first here.
  //   2. A voice-line's style is FIXED WHEN THE LINE OPENS, and a `V:` FIELD opens one —
  //      which is the whole difference between a single-voice tune, where a leading
  //      `[K: style=]` does reach its own line, and a multi-voice one, where it does not.
  //   3. A voice-line with NO style of its own INHERITS the last one engraved, because
  //      `pushCrossLineElems` saves the slurs, ties, endings, colour and scale and not
  //      `this.style` (`abstract-engraver.js:92-107`).
  // ⚠️ The running value follows SOURCE order, which is engraving order for interleaved
  // voices and every single-staff tune, and not for a tune written a whole voice at a time.
  // See `ScoreBuilder.runningStyle` for the upgrade path.
  // ✅ layout.ts:3564 — FIXED 2026-09-09, and the row was a symptom of a bigger one: the
  // tempo mark has its OWN note table (`tempo-element.js:32-44`) and we were reading it
  // out of `noteGlyph`. `tempoNoteGlyph` is that ladder, `flags.u16nd` and all, and the
  // marker abcjs draws for a glyph its table lacks is `PlacedText.debug`.
  // ✅ parser.ts:365 — FIXED 2026-09-08. abcjs's key table is harvested into
  // `src/core/keys-abcjs.ts` and consulted by `keyFifths`; an unrecognised spelling redraws
  // the key IN FORCE (`abcjsKeepsKey`); and the cancelling naturals compare the note LETTER
  // alone, as abcjs does. Header 48 of 168 -> 0, inline 128 of 336 -> 0.
  // ✅ parser.ts:7472 — FIXED 2026-09-09. The hint is abcjs's `{skip: true, to: 'bar'}`,
  // consumed by the next BAR element, and every element it waits through takes an EMPTY
  // syllable (`abc_parse.js:286-313`). Our measures ARE those barlines — `alignSyllables`.
  // ✅ lines.ts:1077 — FIXED 2026-09-09. abcjs reads the divider off EACH verse's own
  // syllable (`abstract-engraver.js:769-774`), so the flag is per verse:
  // `Note.extraVerseMelismaStarts`, set in `applyLyrics`, read by the drawing and by the
  // compat emitter — whose zip happens BEFORE the dense filter, since an entry's index is
  // not its verse's.
  // ⏳ OPEN, 2026-09-24 — the third sweep's six SVG-visible divergences, each still carrying
  // its `ponytail:` with the measurement written at the marker.
  ['parser.ts:1340', 'OPEN: an & overlay on a shared staff draws its notes elsewhere'],
  ['meter:after-continuation', 'OPEN: an inline [M:] straight after a \\ continuation — abcjs swallows the field'],
])

const rows = []
let differ = 0
let unexpected = 0
let stale = 0
for (const [marker, claim, abc, opts] of CASES) {
  const r = await page.evaluate(([abc, opts]) => {
    const render = (API) => {
      try {
        const d = document.createElement('div')
        d.style.position = 'absolute'
        // visibility, NOT display — see zzlive: getBBox() answers 0 in a display:none tree.
        d.style.visibility = 'hidden'
        document.body.appendChild(d)
        API.renderAbc([d], abc, { staffwidth: 670, ...opts })
        const svg = d.querySelector('svg')
        const s = svg ? svg.outerHTML : 'NO SVG'
        d.remove()
        return s
      } catch (e) { return 'THREW: ' + e.message }
    }
    return { js: render(window.ABCJS), ts: render(window.ABCTS) }
  }, [abc, opts])
  if (r.js === r.ts) {
    if (KNOWN.has(marker)) { stale += 1; rows.push(`  STALE    ${marker.padEnd(20)} agrees now — drop it from KNOWN`) }
    else rows.push(`  agrees   ${marker.padEnd(20)} ${claim}`)
    continue
  }
  differ += 1
  if (!KNOWN.has(marker)) unexpected += 1
  let i = 0
  while (i < Math.min(r.js.length, r.ts.length) && r.js[i] === r.ts[i]) i += 1
  rows.push(
    `  ${KNOWN.has(marker) ? 'known  ' : 'DIFFERS'}  ${marker.padEnd(20)} ${KNOWN.get(marker) ?? claim}\n` +
      `           at byte ${i}\n` +
      `           abcjs ${JSON.stringify(r.js.slice(Math.max(0, i - 30), i + 90))}\n` +
      `           abcts ${JSON.stringify(r.ts.slice(Math.max(0, i - 30), i + 90))}`,
  )
}
await browser.close()
const head =
  `ponytail ledger sweep — ${CASES.length} controls, both engines live in ${engine.name}\n` +
  `${differ} differ (${KNOWN.size} known), ${CASES.length - differ} agree\n`
writeFileSync(`/tmp/abcts-ledger-${engine.name}.txt`, head + rows.join('\n') + '\n')
console.log(head + rows.join('\n'))
if (unexpected > 0 || stale > 0) {
  console.error(`\nFAIL: ${unexpected} undeclared divergence(s), ${stale} stale KNOWN row(s)`)
  process.exit(1)
}
