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
  },
])
