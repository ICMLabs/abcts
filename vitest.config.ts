import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const config = JSON.parse(readFileSync('./abcts.config.json', 'utf-8'))

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: {
      ABCTS_CORPUS_PATH: config.corpus,
      ABCTS_GOLDENS_PATH: config.goldens,
      ABCTS_ABCJS_PATH: config.abcjsRef,
    },
  },
})
