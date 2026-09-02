/**
 * **zzpair, WITH THE PAGE PRE-WARMED — the only instrument that can see a shared-page defect.**
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core/index.js \
 *     node scripts/zzwarm.mjs abcjs-visual-selection-01-selection-test
 *
 * `zzlive` renders all 691 cases into ONE page and abcjs's `sizeCache` is MODULE-scoped
 * (`write/svg.js:306`), so a case can fail there and be byte-identical under `zzpair`,
 * which renders it alone. Neither instrument can tell you which — this renders every case
 * `zzlive` renders BEFORE the target, then diffs the target element by element, so the
 * difference between the two runs IS the page's history.
 *
 * `WARM=0` renders the target alone, which is `zzpair` with this script's element diff —
 * run both and the pair names the defect: same → history, differ → the fixture itself.
 * ⚠️ Keep it in the repo. The scratchpad that held the first version of these was wiped
 * mid-session on 2026-08-31 and nine fixes' worth of instrument had to be written twice.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit } = require0(process.env.PW)
const ABCJS='/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'
const repo='/Users/lrettberg/ICMLabs/Code/abcts'
const OURS=join(repo,'dist','abcts-browser.global.js')
const fixtures=join(repo,'tests','corpus-abcjs','fixtures')
const goldens=join(repo,'tests','corpus-abcjs','golden')
const { readdirSync } = await import('node:fs')
const cases=[]
for (const f of readdirSync(fixtures).filter(x=>x.endsWith('.abc')).sort()) {
  const base=f.replace(/\.abc$/,''); const abc=readFileSync(join(fixtures,f),'utf-8')
  if (existsSync(join(goldens,`${base}.svg`))) { cases.push({slug:base,abc,tune:0}); continue }
  for (let i=0; existsSync(join(goldens,`${base}-tune${i}.svg`)); i+=1) cases.push({slug:`${base}-tune${i}`,abc,tune:i})
}
const target=process.argv[2]
const upto=cases.findIndex(c=>c.slug===target)
if (upto<0) throw new Error('no case '+target)
const warm=Number(process.env.WARM ?? '1') ? cases.slice(0,upto) : []
const b=await webkit.launch(); const page=await b.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({content:readFileSync(ABCJS,'utf-8')})
await page.addScriptTag({content:readFileSync(OURS,'utf-8')})
const render = async (c) => page.evaluate(({abc,tune})=>{
  const go=(API)=>{try{const n=API.numberOfTunes(abc);const s=[];for(let i=0;i<n;i++){const d=document.createElement('div');d.style.position='absolute';d.style.visibility='hidden';document.body.appendChild(d);s.push(d)}
    API.renderAbc(s,abc,{staffwidth:670});const v=s[tune]?.querySelector('svg');const h=v?v.outerHTML:'X';for(const d of s)d.remove();return h}catch(e){return 'THREW '+e.message}}
  return {js:go(window.ABCJS), ts:go(window.ABCTS)}
}, {abc:c.abc, tune:c.tune})
for (const c of warm) await render(c)
const r = await render(cases[upto])
await b.close()
if (r.js===r.ts) { console.log(`IDENTICAL (warmed ${warm.length})`); process.exit(0) }
const els=s=>s.split(/(?=<)/).join('').match(/<(path|text|tspan|g|rect)[^>]*>/g)??[]
const A=els(r.ts), B=els(r.js)
console.log(`differ, warmed ${warm.length} — ${A.length} vs ${B.length} elements`)
let shown=0
for (let i=0;i<Math.min(A.length,B.length)&&shown<Number(process.env.LIMIT??6);i++){
  if(A[i]!==B[i]){ console.log(`--- el ${i}\n  ours : ${A[i].slice(0,150)}\n  abcjs: ${B[i].slice(0,150)}`); shown++ }
}
