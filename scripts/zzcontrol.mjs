/**
 * **THE LADDER RUNNER — one variable per rung, both engines, one page.**
 *
 * ⚠️ **THIS IS THE INSTRUMENT THAT PRODUCED THE BROWSER-PARITY ARC, AND IT SPENT A DAY
 * LIVING IN A SCRATCHPAD THAT WAS THEN WIPED.** Nine fixes on 2026-08-31 came off ladders
 * like these and not one came off staring at a corpus fixture; when the session restarted
 * they were gone and had to be written twice. A harness that finds things belongs in the
 * repo. See `Docs/CHECKPOINT-2026-08-31-browser-parity.md`.
 *
 * **WHY A LADDER AND NOT A FIXTURE.** A corpus fixture carries several open causes at
 * once, so it can rank hypotheses and cannot rule anything out. Two conclusions were
 * committed to this repo that day reasoning from `visual-options-01-fonts` — which sets
 * EIGHTEEN font directives — and both were wrong; a control with one variable per rung
 * refuted them in a single run.
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzcontrol.mjs size
 *   PW=… node scripts/zzcontrol.mjs dirs
 *   PW=… node scripts/zzcontrol.mjs tempo
 *   PW=… node scripts/zzcontrol.mjs lyricfont
 *   PW=… node scripts/zzcontrol.mjs abc 'X:1\nK:C\nCDEF|'      # one ad-hoc tune
 *
 * `size` varies ONE gchord font size per rung and prints the top staff line's y in both
 * engines — the shape that identified Helvetica-against-Arial by its increments.
 * `dirs` varies ONE `%%<type>font` per rung over a body carrying a chord, an annotation,
 * a part, a tempo, a voice name and a lyric — the shape that took the font types to
 * 16 of 17 exact.
 *
 * ⚠️ **`visibility:hidden`, NEVER `display:none`** — see `zzlive.mjs`. A `display:none`
 * subtree has no layout, `getBBox` answers 0 inside it, and abcjs measures at DRAW time
 * for a boxed font, so hiding slots that way INVENTS defects.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const require0 = createRequire(import.meta.url)
const PW = process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js'
const { webkit, chromium } = require0(PW)

const ABCJS =
  '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const repo = join(import.meta.dirname, '..')
const OURS = join(repo, 'dist', 'abcts-browser.global.js')
if (!existsSync(OURS)) throw new Error(`no ${OURS} — run npm run build`)

const mode = process.argv[2] ?? 'size'
const engine =
  process.env.ENGINE === 'chrome'
    ? { launcher: chromium, opts: { channel: 'chrome' }, name: 'chrome' }
    : { launcher: webkit, opts: {}, name: 'webkit' }

/** A body carrying every feature a `%%<type>font` can reach. */
const BODY =
  'T:Title\nT:Subtitle\nC:Composer\nP:AB\nQ:1/4=90\nM:4/4\nL:1/4\nK:C\nV:1 name=RH\n"G""^ann"(3CDE F|\nw:la la la la\n'

const rungs = (() => {
  if (mode === 'size') {
    const box = process.env.BOX === '0' ? '' : ' box'
    return [8, 10, 12, 16, 20, 25, 40, 80, 130].map((s) => ({
      label: `gchordfont ${s}${box}`,
      abc: `X:1\n%%gchordfont Arial ${s}${box}\nM:4/4\nL:1/4\nK:C\n"G"CDEF|\n`,
    }))
  }
  if (mode === 'dirs') {
    return [
      '',
      '%%gchordfont Arial 25 box',
      '%%annotationfont Times-Roman 15 box',
      '%%composerfont Arial 8 box',
      '%%historyfont Palatino 9 box',
      '%%infofont Monaco 11 box',
      '%%measurefont Helvetica 7 box',
      '%%partsfont sans-serif 29 box',
      '%%repeatfont Helvetica 13 box',
      '%%subtitlefont Arial 17 box',
      '%%tempofont serif 19 box',
      '%%textfont Verdana 21 box',
      '%%titlefont cursive 23 box',
      '%%tripletfont cursive 39 box',
      '%%voicefont Verdana 17 box',
      '%%vocalfont sans-serif 11 box',
      '%%wordsfont Georgia 13 box',
    ].map((d) => ({ label: d || '(no directive)', abc: `X:1\n${d ? `${d}\n` : ''}${BODY}` }))
  }
  /**
   * **THE TEMPO LADDER — one variable per rung, and the variable is the SUB-PIXEL x.**
   *
   * A tempo's texts are measured at the x they are DRAWN at (`draw/tempo.js:20` hands
   * `getTextSize.calc` the node), and in WebKit a fractional x measures 1/64 wider than an
   * integer one. The advance is `preWidth + preWidth/length`, so the error is BIGGER on a
   * SHORT word — which is why the length rungs come first and why a single fixture cannot
   * tell this apart from a font difference.
   *
   * Rungs 1-5 vary the WORD alone at a fixed position; 6-10 vary the POSITION alone with a
   * fixed word, by pushing the `[Q:]` further into the bar so it lands on a different
   * fraction; 11-13 vary WHERE the mark is written — header, mid-tune, both — because the
   * header mark is REBUILT from the solved x and a mid-tune one was merely translated.
   */
  if (mode === 'tempo') {
    const head = 'X:1\nM:4/4\nL:1/4\n'
    const mid = (word, before) =>
      `${head}K:C\n${'G4|'.repeat(before)}[Q:"${word}" 1/4=170"right"] A4 |\n`
    return [
      ...['l', 'le', 'left', 'lefthand', 'lefthandsidemark'].map((w) => ({
        label: `word "${w}" (len ${w.length})`,
        abc: mid(w, 1),
      })),
      ...[0, 1, 2, 3, 4].map((n) => ({
        label: `"left" after ${n} bar(s)`,
        abc: mid('left', n),
      })),
      { label: 'header Q: only', abc: `${head}Q: "Easy Swing" 1/4=140\nK:C\nG4|A4|\n` },
      { label: 'mid-tune [Q:] only', abc: mid('left', 1) },
      {
        label: 'header + mid-tune',
        abc: `${head}Q: "Easy Swing" 1/4=140\nK:C\nG4| [Q:"left" 1/4=170"right"] A4 |\n`,
      },
    ]
  }
  /**
   * **THE LYRIC-FONT LADDER — one variable per rung, and the variable is WHICH syllable.**
   *
   * `%%vocalfont` is stamped per ELEMENT, so the `&nbsp;` a `_` carries onto the next note
   * and the one a `*` draws reach the emitter with no font at all. Rungs 1-2 vary the SIZE
   * either side of the default (the sign of the error flips there), 3 swaps `_` for `*`,
   * 4 lengthens the melisma, 5 adds a second verse, 6 is the no-directive control that must
   * not move, and 7 is the inline `[I:vocalfont]` form.
   */
  if (mode === 'lyricfont') {
    const head = 'X:1\nM:4/4\nL:1/4\nK:C\n'
    return [
      { label: 'held _ Times-Roman 20', abc: `X:1\n%%vocalfont Times-Roman 20\n${head.slice(4)}C4 D4\nw:laa_ la\n` },
      { label: 'held _ Helvetica 10', abc: `X:1\n%%vocalfont Helvetica 10.0\n${head.slice(4)}C4 D4\nw:laa_ la\n` },
      { label: 'star *', abc: `X:1\n%%vocalfont Times-Roman 20\n${head.slice(4)}C4 D4\nw:* la\n` },
      { label: 'long melisma', abc: `X:1\n%%vocalfont cursive 18\n${head.slice(4)}C4 D4 E4 F4\nw:laa___ la\n` },
      { label: 'two verses + held', abc: `X:1\n%%vocalfont Verdana 16\n${head.slice(4)}C4 D4\nw:laa_ la\nw:one two\n` },
      { label: 'no directive', abc: `${head}C4 D4\nw:laa_ la\n` },
      { label: 'inline [I:vocalfont]', abc: `${head}[I:vocalfont Times-Roman 20]C4 D4\nw:laa_ la\n` },
    ]
  }
  if (mode === 'abc') {
    const raw = process.argv[3]
    if (raw === undefined) throw new Error("abc mode needs a tune: zzcontrol.mjs abc 'X:1\\n…'")
    return [{ label: 'ad-hoc', abc: raw.replace(/\\n/g, '\n') }]
  }
  throw new Error(`unknown mode ${mode} — size | dirs | tempo | lyricfont | abc`)
})()

const browser = await engine.launcher.launch(engine.opts)
const page = await browser.newPage()
const abcjsSrc = readFileSync(ABCJS, 'utf-8')
const oursSrc = readFileSync(OURS, 'utf-8')
/**
 * ⚠️ **A FRESH DOCUMENT PER RUNG, BECAUSE abcjs's TEXT CACHE IS MODULE-GLOBAL AND
 * OUTLIVES A RENDER.** `var sizeCache = {}` sits at `write/svg.js`'s module scope and its
 * key is `text + JSON.stringify(attr)` (`:306`, `:316`) — the FONT attrs, with no x — so
 * the first width abcjs measures for a short string is the width every later render in
 * that page gets, whatever x the text is drawn at next.
 *
 * Sharing one document across rungs therefore makes rung k's answer depend on rungs 1..k-1,
 * which is the exact property a ladder exists to remove: nine of thirteen rungs of the
 * `tempo` ladder "differed" on a build whose every rung is byte-identical measured alone.
 * A new document is a new JS realm and so a new `sizeCache`.
 *
 * `SHARE=1` keeps one document across every rung — which is what a long-lived HOST page
 * looks like, and the only way to exercise that caching from here.
 */
const reset = async () => {
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
  await page.addScriptTag({ content: abcjsSrc })
  await page.addScriptTag({ content: oursSrc })
  const ready = await page.evaluate(() => ({
    abcjs: typeof window.ABCJS?.renderAbc,
    abcts: typeof window.ABCTS?.renderAbc,
  }))
  if (ready.abcjs !== 'function' || ready.abcts !== 'function')
    throw new Error(`engines did not load: ${JSON.stringify(ready)}`)
}
const share = process.env.SHARE === '1'
await reset()

const rows = []
for (const rung of rungs) {
  if (!share) await reset()
  const r = await page.evaluate((abc) => {
    const go = (API) => {
      try {
        const n = API.numberOfTunes(abc)
        const slots = []
        for (let i = 0; i < n; i++) {
          const d = document.createElement('div')
          d.style.position = 'absolute'
          d.style.visibility = 'hidden'
          document.body.appendChild(d)
          slots.push(d)
        }
        API.renderAbc(slots, abc, { staffwidth: 670 })
        const svg = slots[0]?.querySelector('svg')
        const html = svg ? svg.outerHTML : 'NO SVG'
        const line = svg?.querySelector('path.abcjs-top-line')
        const top = line ? /M \S+ ([\d.]+)/.exec(line.getAttribute('d') ?? '')?.[1] : null
        for (const d of slots) d.remove()
        return { html, top: top === null || top === undefined ? null : Number(top) }
      } catch (e) {
        return { html: `THREW: ${e.message}`, top: null }
      }
    }
    return { js: go(window.ABCJS), ts: go(window.ABCTS) }
  }, rung.abc)
  const same = r.js.html === r.ts.html
  let at = ''
  if (!same) {
    let k = 0
    while (k < Math.min(r.js.html.length, r.ts.html.length) && r.js.html[k] === r.ts.html[k]) k += 1
    at = ` byte ${k}`
  }
  const d = r.ts.top !== null && r.js.top !== null ? r.ts.top - r.js.top : null
  rows.push({ label: rung.label, same, at, jsTop: r.js.top, tsTop: r.ts.top, d })
}
await browser.close()

console.log(`${engine.name} — ${mode} ladder, abcts vs abcjs 6.7.0 in one page`)
console.log('    rung                                  abcjs top    ours top    delta')
for (const r of rows)
  console.log(
    `${r.same ? '  ' : '≠≠'}  ${r.label.padEnd(36)} ${String(r.jsTop).padStart(10)}  ${String(
      r.tsTop,
    ).padStart(10)}  ${r.d === null ? '' : r.d.toFixed(6).padStart(10)}${r.at}`,
  )
const off = rows.filter((r) => !r.same).length
console.log(`\n${off} of ${rows.length} rungs differ`)
