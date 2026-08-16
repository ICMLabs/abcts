// A sibling fixture rendered STACKED -> /tmp/ours.svg
//   S=<slug> [P=1] npx tsx scripts/zzs.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderTuneBook } from '../src/compat/index.js'
const dir = join(import.meta.dirname, '..', '..', 'abcMusicKit', 'Tools', 'abcjs-debug', 'fixtures')
const abc = readFileSync(join(dir, `${process.env.S}.abc`), 'utf8')
writeFileSync(
  '/tmp/ours.svg',
  renderTuneBook(abc, { staffwidth: 670, ...(process.env.P === '1' ? { print: true } : {}) }),
)
