import { defineConfig } from 'tsup'

// ponytail: single entry until parser/renderer/compat modules actually exist.
// ARCHITECTURE.md specifies four entry points plus a minified iife build —
// add each one when the module it points at has code in it.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
})
