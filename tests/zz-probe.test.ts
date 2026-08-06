import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { renderAbc } from '../src/compat/index.js'
it('probe', () => {
  renderAbc('p', readFileSync('tests/corpus-abcjs/fixtures/abcjs-visual-parsing-10-song.abc', 'utf-8'), {})
})
