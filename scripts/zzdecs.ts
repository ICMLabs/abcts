/** Our SVG for each per-decoration probe tune, for diffing against abcjs's. D=dir O=out */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'
const dir = process.env.D ?? '', out = process.env.O ?? ''
const names = JSON.parse(readFileSync(join(dir, 'names.json'), 'utf-8')) as string[]
mkdirSync(out, { recursive: true })
names.forEach((_, i) => {
  const abc = readFileSync(join(dir, `${i}.abc`), 'utf-8')
  try {
    const r = renderAbc(['*'], abc, { staffwidth: 670 })
    writeFileSync(join(out, `${i}.svg`), (r[0] as { svg: string }).svg)
  } catch (e) {
    writeFileSync(join(out, `${i}.err`), String(e))
  }
})
