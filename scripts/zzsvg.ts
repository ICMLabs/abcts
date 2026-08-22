/** Our SVG for one fixture tune, for diffing against its golden by hand. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'
const file = process.env.F ?? ''
const tune = Number(process.env.T ?? 0)
const abc = readFileSync(file, 'utf-8')
const n = abc.split(/^X:/m).length - 1
const out = renderAbc(Array.from({ length: n }, () => '*'), abc, { staffwidth: 670 })
writeFileSync(process.env.O ?? '/tmp/gp/ours.svg', (out[tune] as { svg: string }).svg)
