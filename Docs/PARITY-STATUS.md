# PARITY STATUS — abcts vs abcjs 6.7.0

*Measured 2026-09-06, on commit `a17681f`, by running every gate in the repo plus both
browser comparisons. Every number below is a re-run, not a carried-forward claim.*

**The one-line answer: on every axis this repo has built a way to measure, abcts and abcjs
produce identical output — the same SVG bytes and the same MIDI bytes — with the exceptions
listed in §3, each of which is a case where abcjs itself produces broken output.**

This file is the plain-language status. `CLAUDE.md` carries the working history,
`Docs/HANDOFF-<date>.md` the session state, `Docs/ABCJS-DIFFERENCES.md` the evidence behind
every declared divergence.

---

## 1. Rendering

The comparison is the **SVG file, byte for byte** — not "looks the same", not "the notes are
in the right place", but the same characters in the same order. It is the only gate here
with no tolerance and no excluded axis; every other one declares what it ignores, and
together they let a markup difference live forever.

| gate | what it compares | result |
|---|---|---|
| `svg-bytes` | 691 in-repo tunes, rendered headless | **0 differ** (6 divergent) |
| `svg-bytes-sibling` | 356 tunes from the 41-fixture corpus, in 5 flavours — plain, `--add-classes`, print, stacked, stacked-print | **0 differ** |
| `zzlive` (WebKit) | abcts and abcjs running **in the same browser page**, diffed live | **0 of 685** (6 divergent) |
| `zzlive` (Chrome) | the same, in Blink | **0 of 685** (6 divergent) |
| `dom-contract` | `class`, `data-name` and DOM depth over 25 tunes — what `querySelector` finds | **0 differ** |
| `pixel-parity` | notehead/ledger/stem centres to 0.05px, against abcjs's own SVGs | **0 of 120** |
| `corpus-ranked` (diagnostic, not a gate) | worst geometric axis per fixture | **1 of 231** — and it is `abcts-unknown-clef`, a declared divergence (§3) |

**Why the browser check matters and why it cannot be a stored golden.** abcjs does not agree
with *itself* across browsers: 230 of 691 tunes render differently in WebKit and Blink,
because the two measure text differently (single glyph advances agree exactly; multi-character
string widths and glyph bounding-box heights do not). So there is no single browser answer to
store. The only coherent test is both engines in one page, and that is what `zzlive` is.
WebKit is the primary because Studio's editor is CodeMirror 6 in a WKWebView — for this stack
WebKit is the deployment engine, not a proxy for one.

**What the headless goldens do and do not assert.** They are harvested under JSDOM, where
`dump-svg.js` patches `getBBox`, so they assert *"abcts matches abcjs given synthetic text
metrics"* — the right target headless, the wrong one in a browser. `zzlive` covers the real
thing.

---

## 2. Audio

Three layers, each a different derivation of the same answer — which is the argument for
having all three. A surface that agrees by construction is worth less than one that could
disagree, and each of these has disagreed with the others at least once.

| gate | what it compares | result |
|---|---|---|
| `midi-bytes` | the **MIDI file, byte for byte**, over all 691 tunes | **0 differ** (19 divergent) |
| `audio-ranked` | the flattened event list — every note's pitch, start, duration, volume | **0 of 72** |
| `timing-ranked` | `setTiming` — the clock a player follows | **0 of 38** |
| `timing-elements` | `currentTrackMilliseconds` — which written element is lit | **0 of 13** |
| `timing-callbacks` | 132 cases, 4,816 callbacks | **0 differ** |
| `chord-grid` | the accompaniment grid `%%MIDI gchord` plays from | **0 of 23** |
| `midi-ranked` | the three cases abcjs's own suite asserts | **0 of 3** |
| `synth-*`, `create-synth`, `animation` | the synth control surface and its frames | **0 differ** |

`midi-bytes` closed on 2026-09-06 from 24 open. It is the youngest surface here and it found
sixteen real defects in code the other audio gates had called green for a month — the usual
result when a new axis opens.

**And the SYNTH itself is ported and gated, which an earlier note here got wrong.** A
2026-08-08 decision put WebAudio out of scope; it was REVERSED on 2026-08-15 when the scope
became the whole of abcjs's `index.js`. `CreateSynth` fetches the same soundfonts from the
same default URLs, and `tests/audio-recorder.ts` replaces `XMLHttpRequest`, `AudioContext`
and `OfflineAudioContext` with recorders on BOTH engines — so which sound is fetched, where
each note is placed in the output buffer and at what gain are all compared. The samples are
fake and the placement is real.

**What is NOT gated, and it is the one thing a website should smoke-test itself:** actual
mp3 decoding and real `AudioContext` scheduling in a browser. Nothing here makes a sound.

---

## 3. The declared divergences — where we deliberately differ

**A tolerance is a defect that has not been written down yet.** Everything below is written
down, with evidence, in `Docs/ABCJS-DIFFERENCES.md`, and its slug is in the gate's own
`DIVERGENT` list. Nothing else is excluded from any gate.

### Rendering — 6 tunes

| what abcjs does | why we decline |
|---|---|
| draws a **red debug string** in the shipped output for a note longer than a breve (`chartable.note` runs out one entry past it) | it is an internal error message rendered as music |
| `abcts-unknown-clef` (5 tunes) — an explicit `clef=x` | we reproduce the warning and the un-drawn clef; the residual is documented geometry |

### Audio — 19 tunes

| what abcjs does | count |
|---|---|
| writes **`NaN` into the tempo** — `Math.round(60000000 / undefined)` is `NaN`, and `toHex(NaN, 6)` pads the *string* `"NaN"` and slices it into `%00%0N%aN`. Its own decoder reads those as 0 and 10, giving a tempo of ~2.6 microseconds per quarter note. We write the 180bpm default. | 16 |
| **throws outright**, so a host gets no file at all — a rich `T:` reaching `charCodeAt` as an object, and two `Cannot read properties of undefined` | 3 |

### And one abcjs bug we decline to reproduce because it is a hang

`%%beginps` with a non-empty body **never returns**: the reader advances the tokenizer but
never reassigns the variable it tests, so the loop condition is true forever. We consume the
block and raise abcjs's own single `Postscript ignored` warning — which is what abcjs would
do if that one assignment were there. A parser that can be made to spin forever on
user-supplied input is a denial of service, not a rendering difference.

---

## 4. Everything else that is measured

All at zero, re-run 2026-09-06. These are the parse and API surfaces rather than the output.

| surface | result |
|---|---|
| `tune.lines` — every element's source span | **0 of 499 tunes; 607,177 of 607,177 characters** |
| `parse-values` — every value of every element | **0 of 13,314** |
| `parse-only`, `voices-array`, `deline`, `extract-measures`, `setupevents` | **0** on 507 / 215 / 998 / 274 / 180 cases |
| `tune.warnings` — the strings a host shows | **0 of 815 tunes**, 542 warnings across 93 |
| `metaText` / `metaTextInfo` / `formatting` / `tuneMetrics` | **0** |
| `compat-surface` — abcjs's 64 public symbols | **0 absent** |
| `selectables`, `dom`, `editor`, `synth-controller` | **0** |

**Full suite: 79 files, 2,470 tests, no reds, no expected-fails.**

---

## 5. What this does NOT prove

Read this section before quoting the numbers above.

1. **It is `abcjs-strict`** — but as of 2026-09-07 that is a much smaller caveat than it
   was. The owner's rule is that `abcjs-extended` is **byte-identical to strict except for
   the divergences declared in `Docs/ABCJS-DIFFERENCES.md`**, and
   `tests/mode-bytes.test.ts` holds all 691 fixtures to it: **11 differ, every one
   declared**. So the numbers above carry over to extended everywhere it has not been given
   leave to differ.

   It opened at **675 of 691**. `strict` had been gating the LOOK as well as the bugs, so
   extended was drawing Bravura outlines at Bravura's advances, spacing at abcm2ps's
   density and measuring text with real per-em tables — none of it declared, none of it
   compared to anything. `tests/mode-partition.test.ts` still holds the partition by named
   behaviour; `mode-bytes` holds the bytes.

2. **Parity is only as broad as the corpus.** ~1,000 tunes: abcjs's own test suite plus
   purpose-built controls. **Every previous "everything is green" moment here was followed
   by building a new comparison that immediately found real defects** — `midi-bytes` is the
   most recent, opening at 37 differing a week after every other audio gate read zero. The
   honest phrasing is *"parity on every axis we have built a way to measure"*, never "done".

3. **A gate's reach is a property of its enumeration, not its comparison.** Twice a gate
   here read a confident zero while skipping a third of its inputs. Before concluding a
   surface is exhausted, ask what evidence EXISTS, not what the evidence says.

4. **No gate can currently name the next defect.** That is the normal condition in this repo,
   not a milestone — it has happened eleven times, and the answer has always been to build
   the surface that expresses an axis none of the others can, or to render a control abcjs's
   own suite does not contain.

---

## 6. Swapping abcjs for abcts on a site

Measured on 2026-09-06, not assumed.

**What is already true**

- **Zero missing symbols.** All 64 of abcjs's public symbols exist and behave;
  `Object.keys` on the built CJS bundle against abcjs 6.7.0's shows *nothing* abcjs has that
  we lack. We add a few extras, which is harmless.
- **`signature` reports `abcjs-basic v6.7.0`**, because a host that version-sniffs is
  sniffing for a behaviour contract we meet. `abctsSignature` says which engine it really is.
- **Zero runtime dependencies.**
- **The `<script>` build is browser-verified**, not just built: `zzlive` loads
  `dist/abcts-browser.global.js` in WebKit and Chrome and diffs it against abcjs live —
  **including the minification**, so a minifier that broke something would show up on 685
  byte comparisons rather than on someone's site. It is **666 KB raw, 175 KB brotli**
  (abcjs's own min build is 122 KB brotli). The esm/cjs builds stay unminified, because a
  consuming bundler minifies them with better information than we have.
- **The published artifacts are gated too** — `npm run test:dist` renders the whole corpus
  through `dist/` in ESM and CJS: 0 of 685 each.
- **The audio-control CSS still applies.** `CreateSynthControl` emits abcjs's own class names
  (`abcjs-inline-audio`, `abcjs-midi-start`, `abcjs-btn`, …), so a page already linking
  `abcjs-audio.css` keeps its styling. **We ship no CSS of our own — keep that link.**

**Speed and size, measured 2026-09-07 — abcts is SLOWER and BIGGER, and both by a little**

Both engines loaded into ONE page and alternated per fixture, so they share a JS engine, a
font stack, a machine and a thermal state. `scripts/zzperf.mjs`; 231 files, 4 reps, the
first discarded as compilation.

| | abcjs 6.7.0 | abcts | ratio |
|---|---|---|---|
| WebKit, whole corpus (warm) | 229 ms | 280 ms | **1.22x** |
| Chrome, whole corpus (warm) | 161 ms | 221 ms | **1.38x** |
| WebKit, per file | 0.99 ms | 1.21 ms | median per-file **1.04x** |
| Chrome, per file | 0.70 ms | 0.96 ms | median per-file **1.21x** |
| bundle, brotli (minified both) | 123 KB | 175 KB | **1.43x** |

**A page renders a tune in about a millisecond either way**, which is the number that
decides whether a visitor notices, and nothing here is within an order of magnitude of
mattering for a page with a handful of tunes. The worst single fixture is `abcts-midi`
(2.0x in WebKit, 2.3x in Chrome), a 40-tune `%%MIDI` directive file; the median tune is
1.04x in WebKit.

⚠️ **The MEDIAN and the TOTAL disagree on purpose** — a corpus total is dominated by its
largest tunes, and a site renders whatever it renders. Both are reported rather than one
being picked.

⚠️ **AND THE FIRST PER-FILE TABLE WAS NOISE.** `performance.now()` is clamped to 0.33 ms in
WebKit as a Spectre mitigation, and most fixtures render in under one tick, so a
single-render timing gave `0.00x`, `NaNx` and `Infinityx` ratios — beside an aggregate that
was perfectly sound, because 231 files sum well past the quantum. Each file is timed over
20 renders now. A broken per-file column can live beside a correct total.

**What the swap needs**

- **The global is `ABCTS`, not `ABCJS`** — deliberately, so both can load in one page.
  A `<script>`-tag host writes `window.ABCJS = window.ABCTS` itself.
- **Bundler hosts** import `abcts/compat`, which is the abcjs-shaped surface.
  The bare `abcts` entry is the core API and is a different shape.
- **`package.json` is not release-ready**: `version` is `0.0.0`, and there is no
  `repository`, `homepage`, `browser`, `unpkg` or `jsdelivr` field, so a CDN will not resolve
  the script build by default. Those are release decisions, not defects.

**One helper abcts adds that abcjs has no equivalent for**

`synth.notesAvailable(visualObj, params)` → `{ inMemory, inCache, missing, error,
soundFontUrl }`, answering **which sounds the user already has, before playing**. abcjs's
`init` reports `{loaded, cached, error}`, but that is what a load DID, after the fetching,
and it only sees this page's memory. Use it for a prefetch decision, a progress bar, or an
"available offline" badge.

`inCache` is the **Cache API** — a service worker's store, or one you filled yourself. The
HTTP cache is not readable by anything, so a note the browser would in fact serve from disk
is still reported `missing`; the honest answer to an unanswerable question is the
pessimistic one. It is abcts's own symbol, not abcjs's, so the drop-in surface is untouched.

**What to smoke-test on the site itself**

1. **Playback makes sound**, and the soundfont fetch is not blocked. Default URL is
   `https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/` — same as abcjs, so an
   existing CSP already allows it, but check if the site passes its own `soundFontUrl`.
2. **Anything reading `abcjs-extended`** — `renderAbc(target, abc, { mode:
   'abcjs-extended' })`. That param is abcts's one addition to abcjs's, it defaults to
   `abcjs-strict`, and it reaches the parse, the layout, the measure widths and the
   emitter. (It did not exist until 2026-09-07; extended was reachable only through
   `ABCTS.core.render`.)

   ⚠️ **If you do go through `core.render`, pass the same options compat does or you are
   comparing pipelines rather than modes**: `classes: 'abcjs'`, `staffSpace: 7.75`, and
   `systemWidth` (the PAGE — there is no `staffwidth` option on `render`, so one passed
   there is silently dropped). All three caught out this repo's own comparison site.
3. **The editor**, if the site uses `abcjs.Editor` — it is implemented and gated on 14
   cases, but against recorded call sequences rather than a live textarea.

---

## How to re-run all of it

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts       # every command from here

npx tsc --noEmit && echo OK                  # before anything else
npx vitest run --testTimeout=180000          # 79 files, 2,470 tests

npm run build                                # zzlive loads dist/, a stale bundle lies
PW=/tmp/gp/pw/node_modules/playwright-core/index.js node scripts/zzlive.mjs
ENGINE=chrome PW=… node scripts/zzlive.mjs
```

⚠️ **The browser harness needs `playwright-core` whose webkit revision matches the cached
browser.** `~/Library/Caches/ms-playwright` currently holds `webkit-2311`, which is
**playwright-core 1.61.0**; a mismatch fails with "Executable doesn't exist" and a misleading
"just run `npx playwright install`". `/tmp` is cleaned periodically and leaves EMPTY
directories behind, which reads as a corrupt install rather than a missing one — reinstall
into `/tmp/gp/pw` rather than debugging it.

⚠️ **The suite times out under machine load and it is not a defect.** One run on 2026-09-06
reported three reds with a `Failed to start forks worker` at 592 seconds; the same tree
re-ran green at 2,470 in 19. Re-run before believing a red.

Each gate writes its ranked table to `/tmp/abcts-*.txt`. Those files **outlive the run**, so
a stale one has twice been mistaken for a result — check the timestamp.
