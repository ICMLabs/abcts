/**
 * The parity tracker: one view of how close abcts is to its references.
 *
 *   npm run parity
 *
 * Runs the gates, then reads the counts each one writes. The numbers come FROM the
 * assertions rather than being recomputed here, so the tracker cannot quietly disagree
 * with the suite — a report that drifts from its gate is worse than no report.
 *
 * ── ON THE TWO REFERENCES ─────────────────────────────────────────────────────
 * ARCHITECTURE.md names two: abcjs (what compat mode must reproduce) and abcMusicKit v1
 * (what the output should BE). They are not independent axes, and it is worth being
 * precise about why, because "v1 parity: 0%" would be a misleading thing to report.
 *
 * v1 is a direct port of abcjs, and its `.abcjsStrict` path is byte-identical to abcjs by
 * construction — v1's own SVGComparison tests gate exactly that. Rendering `simple-c`
 * through v1's CLI and diffing against the abcjs golden confirms it: identical staff-line
 * coordinates, identical stem paths, identical barlines. The files differ only in
 * packaging (v1 emits `<defs>` + `<use>`, the golden inlines each path) and a default
 * page width.
 *
 * So measuring against the abcjs goldens IS measuring against v1's shared surface. What
 * v1 has that abcjs does not is its EXTENDED mode — per-element colour, modern collision
 * detection, theory overlays, tablature. That is a feature-coverage question, not a
 * numeric-parity one, and no amount of corpus diffing answers it. It is listed below as
 * an explicit gap rather than folded into a percentage.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const read = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const bar = (n, total, width = 24) => {
  if (!total) return ' '.repeat(width)
  const filled = Math.round((n / total) * width)
  return `${'█'.repeat(filled)}${'·'.repeat(width - filled)}`
}

const row = (label, n, total, note = '') => {
  const pct = total ? `${Math.round((n / total) * 100)}%`.padStart(4) : '   —'
  console.log(`  ${label.padEnd(30)} ${bar(n, total)} ${String(n).padStart(3)}/${String(total).padEnd(3)} ${pct}  ${note}`)
}

console.log('Running gates…\n')
try {
  execFileSync('npx', ['vitest', 'run'], { stdio: 'pipe' })
} catch {
  console.log('  ⚠ the suite is RED — the numbers below are from the last successful write\n')
}

const content = read('/tmp/abcts-parity-content.json')
const render = read('/tmp/abcts-parity-render.json')
const baseline = read('/tmp/abcts-parity-baseline.json')

console.log('abcts parity — against abcjs goldens (= abcMusicKit v1\'s shared surface)')
console.log('═'.repeat(78))

if (content) {
  row('Note content', content.content.matched, content.content.total,
    `${content.content.divergences.length} known divergence(s)`)
  row('Beam grouping', content.beams.matched, content.beams.total,
    content.beams.failures.length ? `open: ${content.beams.failures.filter((f) => f !== 'frere-jacques').join(', ')}` : '')
  row('Lyrics', content.lyrics.matched, content.lyrics.total,
    `${content.lyrics.divergences.length} known divergence(s)`)
}
if (render) {
  row('Render structure', render.renderable, render.total,
    `${render.divergences.length} known divergence(s)`)
}
if (baseline) {
  console.log()
  row('Visual baselines (self)', baseline.baselines, baseline.baselines, 'committed geometry snapshots')
  if (baseline.undrawnNotes > 0) {
    console.log(`  ⚠ ${baseline.undrawnNotes} fixture(s) still have notes that draw nothing`)
  }
}

console.log(`
NOT MEASURED — and why
${'─'.repeat(78)}
  abcMusicKit v1 EXTENDED mode    v1's capabilities beyond abcjs: per-element colour,
                                  collision detection, theory overlays, tablature.
                                  A feature-coverage question; corpus diffing cannot
                                  answer it. abcts implements none of it yet.

  Compat DOM/API fidelity         abcts/compat reproduces abcjs's classes, data-name
                                  hooks, density and element width, and is tested for
                                  each. Not measured: how much of abcjs's wider API
                                  (audio, timing, the engraver) is absent — deliberately
                                  unstubbed, so it fails loudly rather than lying.

  Visual correctness              Baselines catch CHANGE, not WRONGNESS. Nothing
                                  compares abcts's own rendering to a reference image.
${'─'.repeat(78)}
Known divergences are recorded with reasons in the gates themselves, and each FAILS if
it starts matching, so none can quietly go stale.`)
