/**
 * **THE SWEEP RUNNER.** Render every `*.abc` in a directory through BOTH engines and print
 * `exact` / `DIFFERS` per row. This is the instrument that has produced every defect for
 * weeks — no gate can name one, so the work is writing shapes neither corpus contains.
 *
 *   npx tsx scripts/zzsweep.ts <dir>            # from the REPO ROOT, always
 *
 * Three traps it is built around, each of which has bitten:
 *
 * ⚠️ **WRITE THE SHAPES WITH `printf '%b'`, NOT `'%s'`.** A sweep on 2026-08-26 reported
 *    36 of 36 EXACT because every `\n` stayed literal and both engines agreed on one line
 *    of garbage. This cannot check that for you — but see the next two.
 * ⚠️ **A MISSING REFERENCE READS AS A CLEAN COLUMN**, so an empty or absent abcjs SVG is a
 *    hard exit here rather than a row. `cd` has broken the relative path to `dump-svg.js`
 *    twice; run from the repo root.
 * ⚠️ **`ABCJS_VERSION` IS NOT OPTIONAL** — `dump-svg.js` DEFAULTS TO 6.6.3, and a run
 *    without it accuses the 6.7.0 branch we port of defects it does not have.
 *
 * **AND `git stash` IS THE PROOF IT RAN.** After a fix, stash it and re-run: the rows you
 * just closed must turn `DIFFERS`. Nothing else separates a real fix from a harness that
 * never rendered.
 *
 * ⚠️ **BUT `git stash` ON A CLEAN TREE STASHES NOTHING, AND `git stash pop` THEN POPS
 * SOMEBODY ELSE'S ENTRY.** Doing it after committing dropped a WIP from
 * `geometry/lyric-ink-anchor` — a branch nobody is on — into `layout.ts` as a conflicted
 * merge. Nothing was lost (git keeps the entry when the pop conflicts, and it is still
 * `stash@{0}`), but check `git stash list` and `git status` before reaching for the pair,
 * and prefer `git stash push -- <file>` so an empty stash is an error rather than a
 * surprise.
 *
 * **THE CHEAPER PROOF IS A CONTROL THAT MUST DIFFER**, in the same run as the ones that
 * must not: `C32|` is a note longer than a breve, which abcjs answers with a red debug
 * string and a chord lane we decline (`Docs/ABCJS-DIFFERENCES.md`). It reads `DIFFERS`
 * forever, on purpose.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderAbc } from '../src/compat/index.js'

const dir = process.argv[2]
if (dir === undefined) throw new Error('usage: npx tsx scripts/zzsweep.ts <dir>')

// The goldens' own width. Every gate here passes it explicitly — abcjs's own default is
// 740 on screen, and rendering against a 670 reference with neither set agrees only while
// both are wrong.
const STAFFWIDTH = 670
const tools = '../abcMusicKit/Tools/abcjs-debug'

const names = readdirSync(dir)
  .filter((f) => f.endsWith('.abc'))
  .sort()

let differing = 0
for (const name of names) {
  const abc = join(dir, name)
  const want = join(dir, `${name}.abcjs.svg`)
  execFileSync('node', [join(tools, 'dump-svg.js'), '--file', abc, '--output', want], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, ABCJS_VERSION: '6.7.0' },
  })
  if (statSync(want).size === 0) throw new Error(`${name}: abcjs wrote NOTHING — check the path`)
  const reference = readFileSync(want, 'utf-8')

  let ours: string
  try {
    ours = (renderAbc(['*'], readFileSync(abc, 'utf-8'), { staffwidth: STAFFWIDTH })[0] as
      | { svg: string }
      | undefined)?.svg ?? ''
  } catch (e) {
    console.log(`${name.padEnd(28)} THREW      ${String(e).split('\n')[0]}`)
    differing += 1
    continue
  }
  writeFileSync(join(dir, `${name}.svg`), ours)
  if (ours === reference) {
    console.log(`${name.padEnd(28)} exact`)
    continue
  }
  differing += 1
  // The first differing OFFSET names the construct — the same argument `svg-bytes` is
  // built on. Print both sides around it rather than a diff, which a one-line file defeats.
  let at = 0
  while (at < ours.length && at < reference.length && ours[at] === reference[at]) at += 1
  console.log(`${name.padEnd(28)} DIFFERS    byte ${at} of ${reference.length}`)
  console.log(`    want …${reference.slice(Math.max(0, at - 40), at + 60)}`)
  console.log(`    got  …${ours.slice(Math.max(0, at - 40), at + 60)}`)
}
console.log(`\n${differing} of ${names.length} differ`)
