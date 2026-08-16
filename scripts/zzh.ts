import { renderAbc } from '../src/compat/index.js'
const svg = renderAbc('*', process.env.A as string, { staffwidth: 670 })[0]?.svg ?? ''
console.log(/height="([\d.]+)"/.exec(svg)?.[1] ?? 'none')
