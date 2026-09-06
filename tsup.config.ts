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
    sourcemap: true,
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
    sourcemap: true,
    clean: false,
    treeshake: true,
    /**
     * **MINIFIED, AND ONLY HERE.** This is the artifact a PAGE downloads; the esm/cjs
     * builds above are what a bundler consumes, and it will minify them itself with better
     * information than we have. Minifying those would cost debuggability and buy nothing.
     *
     * Measured 2026-09-06, and the win is not marginal — Cloudflare and every other CDN
     * serve brotli, so that is the column that matters:
     *
     *                       raw       gzip     brotli
     *     unminified      1393 KB    371 KB    294 KB
     *     minified         666 KB    209 KB    174 KB     ← 41% off the wire, half the
     *     abcjs-basic-min  499 KB    144 KB    122 KB       bytes to PARSE
     *
     * ⚠️ **VERIFIED BY RE-RUNNING THE BROWSER GATE AGAINST THE MINIFIED BUNDLE**, not
     * assumed: `zzlive` loads this very file and byte-compares 685 tunes against abcjs
     * live, in WebKit and in Chrome. A minifier that broke something would show up there
     * rather than on someone's site.
     */
    minify: true,
  },
])
