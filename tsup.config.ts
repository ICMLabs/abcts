import { defineConfig } from 'tsup'

// ponytail: entries added as modules land. ARCHITECTURE.md specifies four entry points
// plus a minified iife build — `./parser` and `./compat` follow when those modules are
// worth importing alone. The renderer is here because glyph outlines are ~40KB that a
// parse-only consumer should be able to tree-shake away.
export default defineConfig({
  entry: { index: 'src/index.ts', 'renderer/index': 'src/renderer/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
})
