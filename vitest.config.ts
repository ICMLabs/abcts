import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const config = JSON.parse(readFileSync('./abcts.config.json', 'utf-8'))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    /**
     * ⚠️ **A TIMEOUT THAT DOES NOT TRACK THE CORPUS IS A GATE THAT FAILS FOR GROWING.**
     * A dozen of these suites write a RANKED TABLE by rendering every fixture — some of
     * them twice, through both engines' goldens — and the corpus grew from 424 rows to 624
     * in two days. Three separate tables crossed vitest's 5s default under full-suite
     * contention in that time, each passing on its own and failing beside the others, which
     * reads exactly like a flake and is not one.
     *
     * Raising them one at a time does not hold: the NEXT table someone adds inherits the
     * default again. This is the one place the number belongs.
     */
    testTimeout: 20_000,
    env: {
      ABCTS_CORPUS_PATH: config.corpus,
      ABCTS_GOLDENS_PATH: config.goldens,
    },
  },
})
