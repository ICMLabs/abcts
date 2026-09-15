import { defineConfig } from 'tsup'

// ponytail: entries added as modules land. ARCHITECTURE.md specifies four entry points
// plus a minified iife build — `./parser` follows when that module is worth importing
// alone. The renderer is here because glyph outlines are ~40KB that a parse-only
// consumer should be able to tree-shake away.
//
// TWO CONFIGS, because the iife takes ONE entry: tsup refuses `format: ['iife']` with a
// multi-entry object (every entry would claim the same global). The second block is the
// `<script>` build and nothing else.
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'renderer/index': 'src/renderer/index.ts',
      'compat/index': 'src/compat/index.ts',
      cli: 'src/cli.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    /**
     * **NO SOURCEMAPS, AND THAT IS A PACKAGE DECISION (2026-09-16).** They were 12 files
     * and ~22 MB of a 29 MB tarball — three quarters of what a consumer downloads, to
     * resolve a stack trace into a build nobody debugs from source: the corpus gates read
     * `dist` as an artifact and every engine question is answered in `src` with the suite.
     *
     * ⚠️ Turned OFF rather than excluded from `files`: excluding them would leave a
     * `//# sourceMappingURL=` in every bundle pointing at a file the package does not
     * carry, which is a 404 in the devtools of anyone who opens them.
     */
    sourcemap: false,
    clean: true,
    treeshake: true,
  },
  {
    // `dist/abcts-browser.global.js`, reached as `window.ABCTS` — see src/browser.ts for
    // why the global is not `ABCJS`. `clean` is FALSE here: this block runs after the
    // one above and would otherwise delete everything it just built.
    entry: { 'abcts-browser': 'src/browser.ts' },
    format: ['iife'],
    globalName: 'ABCTS',
    dts: false,
    // …and the CDN bundle least of all: `unpkg`/`jsdelivr` point at this file, so its map
    // was 4.4 MB fetched from a CDN by anyone who opened devtools. See above.
    sourcemap: false,
    clean: false,
    treeshake: true,
    /**
     * **MINIFIED, AND ONLY HERE.** This is the artifact a PAGE downloads; the esm/cjs
     * builds above are what a bundler consumes, and it will minify them itself with better
     * information than we have. Minifying those would cost debuggability and buy nothing.
     *
     * Re-measured 2026-09-07, and the win is not marginal — Cloudflare and every other CDN
     * serve brotli, so that is the column that matters:
     *
     *                       raw       gzip     brotli
     *     unminified      1394 KB    371 KB    295 KB
     *     minified         665 KB    209 KB    175 KB     ← 41% off the wire, half the
     *     abcjs-basic-min  500 KB    145 KB    123 KB       bytes to PARSE
     *
     * ⚠️ **AND abcts IS THE BIGGER BUNDLE — 1.43x abcjs over the wire, minified both
     * sides.** That is the honest number and it is not going to be minified away; it is
     * what a from-source TypeScript engine with its own glyph outlines costs. 52 KB brotli
     * over abcjs is roughly one photograph.
     *
     * ⚠️ **VERIFIED BY RE-RUNNING THE BROWSER GATE AGAINST THE MINIFIED BUNDLE**, not
     * assumed: `zzlive` loads this very file and byte-compares 685 tunes against abcjs
     * live, in WebKit and in Chrome. A minifier that broke something would show up there
     * rather than on someone's site.
     */
    minify: true,
  },
])
