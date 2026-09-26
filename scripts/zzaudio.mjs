/**
 * **DOES IT MAKE A SOUND?** — the one question no other gate here asks.
 *
 * Every audio comparison in this repo stops short of WebAudio on purpose: the event list
 * (`tests/audio.test.ts`), the sequencer rows (`sequence`), the note timings and the
 * byte-exact MIDI file all describe what SHOULD sound, and none of them touches an
 * `AudioContext`, a soundfont fetch or a rendered buffer. So the whole of
 * `compat/create-synth.ts` and `compat/synth-controller.ts` — the API a host actually calls
 * to hear the tune — sat behind every green gate in the repo while it was **broken outright**
 * (2026-09-23): `registerAudioContext()` never created a context, so `init` rejected with
 * "MIDI is not supported in this browser" in WebKit, and `SynthController` threw
 * "CreateSynth is not built yet" from `play()` for any host that did not inject a factory.
 *
 * This runs abcjs's own documented three lines — `new SynthController()`, `load`, `setTune`,
 * `play` — plus `CreateSynth().init().prime()`, in ONE WebKit page, against BOTH engines,
 * and compares what came back INCLUDING the rendered samples: buffer count, duration, peak
 * amplitude and the number of audible samples. Silence is the failure it is built to catch.
 * It also compares the NODES a playback cursor is handed (`noteTimings`, `makeVoicesArray`).
 *
 *     node scripts/zzaudio.mjs
 *
 * ⚠️ It needs the network, because the soundfonts are fetched from
 * `paulrosen.github.io/midi-js-soundfonts` exactly as abcjs fetches them. A run with no
 * network reports `loaded: 0` for BOTH engines and agrees — which is agreement about
 * nothing, so it says so rather than passing quietly.
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

/** One tune per shape the synth treats differently — a melody, a chord, a rest, two voices. */
const CASES = [
  ['melody', 'X:1\nQ:1/4=120\nK:C\nCDEF|GABc|\n'],
  ['chord', 'X:1\nQ:1/4=120\nK:C\n[CEG]4|\n'],
  ['rest', 'X:1\nQ:1/4=120\nK:C\nC2 z2|\n'],
  ['two voices', 'X:1\nQ:1/4=120\nK:C\nV:1\nCDEF|\nV:2\nC,4|\n'],
  ['percussion', 'X:1\nQ:1/4=120\nK:C perc\nDEFG|\n'],
]

const probe = async (page, name) =>
  page.evaluate(
    async ([name, cases]) => {
      const API = window[name]
      const out = []
      for (const [label, abc] of cases) {
        const row = { label }
        try {
          const visual = API.renderAbc('paper', abc)[0]
          // **WHAT A PLAYBACK CURSOR IS HANDED** — abcjs's `elements` / `elemset` hold the
          // LIVE `<g>`, and a cursor adds a class to it. abcts handed a stand-in object
          // until 2026-09-25, which broke every follow-along highlight and no gate saw.
          const node = (x) => (x && x.getAttribute ? `${x.tagName}#${x.getAttribute('data-index')}:${x.getAttribute('data-name')}` : 'NOT-A-NODE')
          row.cursor = new API.TimingCallbacks(visual, {}).noteTimings
            .filter((e) => e.type === 'event')
            .map((e) => (e.elements ?? []).map((g) => g.map(node).join(',')).join('|'))
            .join(' ')
          // …and every element's `elemset`: a clef or bar is an unindexed `<g>`, a `K:C` key none.
          row.elemset = visual.makeVoicesArray().flat().map((r) => r.elem.elemset.map(node).join(',')).join(' ')
          // abcjs's own documented path, in its own order.
          const c = new API.synth.SynthController()
          c.load('#audio', null, { displayPlay: true, displayProgress: true })
          row.setTune = (await c.setTune(visual, false, {})).status
          await c.play()
          row.isStarted = c.isStarted === true
          c.pause()
          // …and the buffer itself, which is the part that can be silent.
          const s = new API.synth.CreateSynth()
          const init = await s.init({ visualObj: visual })
          row.loaded = (init.loaded ?? []).length + (init.cached ?? []).length
          row.error = (init.error ?? []).length
          const primed = await s.prime()
          row.status = primed.status
          row.duration = primed.duration
          row.buffers = (s.audioBuffers ?? []).length
          row.samples = (s.audioBuffers ?? []).map((b) => {
            const d = b.getChannelData(0)
            let peak = 0
            let loud = 0
            for (let i = 0; i < d.length; i += 17) {
              const v = Math.abs(d[i])
              if (v > peak) peak = v
              if (v > 0.001) loud += 1
            }
            return { peak: Math.round(peak * 1000) / 1000, loud }
          })
        } catch (e) {
          row.threw = e?.message ?? String(e)
        }
        out.push(row)
      }
      return out
    },
    [name, cases],
  )

const cases = CASES
const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent(
  '<!doctype html><meta charset="utf-8"><body><div id="paper"></div><div id="audio"></div></body>',
)
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
const js = await probe(page, 'ABCJS')
await browser.close()

const browser2 = await webkit.launch()
const page2 = await browser2.newPage()
await page2.setContent(
  '<!doctype html><meta charset="utf-8"><body><div id="paper"></div><div id="audio"></div></body>',
)
await page2.addScriptTag({ content: readFileSync(`${REPO}/dist/abcts-browser.global.js`, 'utf-8') })
const ts = await probe(page2, 'ABCTS')
await browser2.close()

console.log('abcts vs abcjs 6.7.1, WebAudio, both live in webkit —', cases.length, 'cases')
let differ = 0
let silent = 0
for (let i = 0; i < cases.length; i += 1) {
  const a = JSON.stringify(js[i])
  const b = JSON.stringify(ts[i])
  const loud = (js[i].samples ?? []).reduce((n, s) => n + s.loud, 0)
  if (loud === 0) silent += 1
  if (a !== b) {
    differ += 1
    console.log(`  DIFFER  ${cases[i][0]}\n     js ${a}\n     ts ${b}`)
  } else console.log(`  same    ${cases[i][0]}  ${b}`)
}
if (silent > 0)
  console.log(
    `\n⚠️  ${silent} of ${cases.length} cases rendered SILENCE in ABCJS TOO — no network for the` +
      ' soundfonts, so this run agrees about nothing. Re-run with a network.',
  )
console.log(`\n${differ} of ${cases.length} differ`)
process.exit(differ === 0 && silent === 0 ? 0 : 1)
