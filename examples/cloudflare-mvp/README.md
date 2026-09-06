# abcts on Cloudflare Pages — the MVP

**Verified end to end on 2026-09-06**, not sketched: this page was served over HTTP and
loaded in real WebKit and real Chrome. It renders 58 noteheads, `window.ABCJS ===
window.ABCTS` is true, `signature` reports `abcjs-basic v6.7.0`, and `notesAvailable` says
Cooley's needs 12 sounds. The only console error was the missing `abcjs-audio.css` that
step 2 supplies.

The MVP deliberately keeps the **CDN soundfont**, because that is what the site already
uses today — so the swap changes ONE thing, the engine, and nothing else. Self-hosting is
step 4 and it is optional.

---

## 1. Get the bundle onto the site

abcts is **not published to npm yet** (`version: 0.0.0`), so the MVP uses the `<script>`
build directly. From this repo:

```bash
npm run build
cp dist/abcts-browser.global.js examples/cloudflare-mvp/public/vendor/
```

**666 KB raw, 175 KB brotli** — minified, and brotli is what Cloudflare actually serves, so
that is what a visitor pays. (abcjs's own `abcjs-basic-min.js` is 122 KB brotli, for scale.)

> For a bundler-based site instead of a script tag, `npm pack` here and
> `npm i ./abcts-0.0.0.tgz` there, then `import { renderAbc } from "abcts/compat"`. The
> compat entry is the abcjs-shaped one; the bare `abcts` entry is the core API and a
> different shape.

## 2. Bring your existing `abcjs-audio.css`

abcts ships **no CSS**, on purpose: `CreateSynthControl` emits abcjs's own class names
(`abcjs-inline-audio`, `abcjs-midi-start`, `abcjs-btn`, …), so the stylesheet you already
serve keeps working unchanged. Copy it beside the bundle:

```bash
cp <your-site>/abcjs-audio.css examples/cloudflare-mvp/public/vendor/
```

If the site links it from a CDN today, just leave that link alone.

## 3. Claim the global — the one line the swap needs

```html
<script src="/vendor/abcts-browser.global.js"></script>
<script>
  window.ABCJS = window.ABCTS;   // ← the whole migration
</script>
```

The global is `ABCTS` rather than `ABCJS` **on purpose**: both engines have to be loadable
in one page, because comparing them live in one browser is how parity is measured. A host
adopting abcts claims the name itself, deliberately, in one line. Every existing
`ABCJS.renderAbc(…)` call on the site then runs on abcts untouched.

Deploy `public/` as the Pages output directory. That is the MVP.

## 4. OPTIONAL — self-host the soundfont

Only worth doing if you want one of: no third-party origin in your CSP, offline support, or
your own cache headers. **It is not needed for the swap to work** — the default URL is
abcjs's own, so an existing CSP already allows it.

```bash
# ONE instrument, the ~88 notes a piano part needs. Repeat per instrument you actually use.
BASE=https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM
INST=acoustic_grand_piano
mkdir -p public/soundfont/$INST-mp3
for oct in 0 1 2 3 4 5 6 7 8; do
  for n in C Db D Eb E F Gb G Ab A Bb B; do
    curl -sfo "public/soundfont/$INST-mp3/$n$oct.mp3" "$BASE/$INST-mp3/$n$oct.mp3" || true
  done
done
```

Then point the engine at it:

```js
ABCJS.renderAbc("paper", abc);
controller.setTune(visualObj, false, { soundFontUrl: "/soundfont/" });
```

⚠️ **Do not inline the mp3s into your JS.** Measured: one instrument as base64 is **2.63 MB**
(~2 MB gzipped — base64 of already-compressed audio barely compresses), against a 175 KB
brotli bundle. All 128 GM instruments would be ~330 MB. A real tune fetches 205–717 KB
lazily, on first play only, and never again. See `Docs/PARITY-STATUS.md` §6.

⚠️ **And check the licence before redistributing.** Serving FluidR3_GM from your own origin
makes you a redistributor rather than a linker. This repo carries abcjs's MIT notice for its
glyph table and Bravura's OFL for `glyphs.ts` for exactly this reason.

## 5. OPTIONAL — make "already downloaded" a real answer

`synth.notesAvailable(visualObj)` is abcts's own — abcjs has no equivalent — and returns
`{ inMemory, inCache, missing, error, soundFontUrl }` **before** anything plays:

```js
const a = await ABCJS.synth.notesAvailable(visualObj);
if (a.missing.length === 0) badge("available offline");
else if (a.missing.length > 20) prefetchInBackground();
```

`inCache` is the **Cache API**, so it only becomes meaningful once a service worker (or your
own `caches.open()`) is storing the notes — which is why it pairs with step 4. The HTTP
cache is not readable by anything, so a note the browser would in fact serve from disk is
still reported `missing`.

---

## Two gotchas this example already works around

⚠️ **`supportsAudio()` returns `undefined`, not `true`, before a user gesture.** abcjs's last
arm is `if (aac) return aac.resume !== undefined` with **no else**, and an AudioContext needs
a gesture to exist. So `if (!ABCJS.synth.supportsAudio())` is true on first load and a site
guarding on it **hides its own player**. Test for the explicit `false`. This is abcjs's
behaviour, faithfully reproduced — it will have been biting the site already.

⚠️ **`renderAbc` renders ONE TUNE PER OUTPUT SLOT**, so a multi-tune book handed one div
gets the FIRST tune and nothing else. Also abcjs's behaviour, and also already true today.

## What to check once it is live

1. **Playback makes sound.** This is the one thing no gate in this repo covers: the synth's
   arithmetic is compared against abcjs note for note, but the harness stubs the mp3s, so
   real decoding and real scheduling have never been machine-checked.
2. **Anything relying on `abcjs-extended`** — unreachable from `renderAbc`, which hard-wires
   strict. Use `ABCTS.core.render(score, { mode: "abcjs-extended" })`.
3. **`abcjs.Editor`**, if the site uses it — implemented and gated on 14 cases, but against
   recorded call sequences rather than a live textarea.
