/**
 * **abcjs's KEY SIGNATURES, HARVESTED BY RUNNING IT.**
 *
 *   PW=/tmp/gp/pw/node_modules/playwright-core node scripts/harvest-abcjs-keys.mjs
 *
 * ⚠️ **abcjs HAS NO ARITHMETIC FOR KEYS.** `relativeMajor` maps a spelling to its relative
 * major through a reverse index of 16 majors x 10 mode spellings, then `keyAccidentals`
 * looks THAT up in a 23-entry table — which carries five off-spec enharmonics under abcjs's
 * own comment *"These SOUND the same as what's written, but they aren't right"* (`A#` two
 * FLATS, `B#` none, `D#` three flats, `E#` one flat, `G#` four flats). A spelling in neither
 * table returns `null`, and `transpose.keySignature`'s `if (!k) return multilineVars.key`
 * KEEPS THE KEY IN FORCE — then `multilineVars.key.mode = mode` overwrites the mode alone
 * (`abc_parse_key_voice.js:314-317`).
 *
 * abcts computed fifths and clamped to ±7 instead, which differed on **48 of 168 spellings**
 * — `K:D#` is 3 flats to abcjs and was 7 sharps here.
 *
 * ── WHY HARVESTED RATHER THAN PORTED ─────────────────────────────────────────
 * The mechanism is two tables and a fallback, and re-implementing tables is how a
 * transcription error gets in. abcjs's ANSWER is the specification here, exactly as it is
 * for `glyphs-abcjs.ts` and every audio oracle in this repo. Re-run this script against a
 * new abcjs and the table follows.
 *
 * Two questions are asked per spelling, because the fallback behaves differently in each:
 *   - in a HEADER `K:` the accidentals drawn are the answer;
 *   - INLINE, a spelling abcjs does not recognise leaves the key UNCHANGED, which is
 *     `keeps: true` and cannot be inferred from the header answer.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require0 = createRequire(import.meta.url)
const { webkit } = require0(process.env.PW ?? '/tmp/gp/pw/node_modules/playwright-core/index.js')
const ABCJS = '/Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/dist/abcjs-basic-min.js'

const ROOTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const ACCS = ['', '#', 'b']
/** abcjs's own `modeNames`, plus the bare (major) spelling. */
const MODES = ['', 'maj', 'ion', 'min', 'aeo', 'm', 'mix', 'dor', 'phr', 'lyd', 'loc']
const NAMES = []
for (const r of ROOTS) for (const a of ACCS) for (const m of MODES) NAMES.push(r + a + m)

const browser = await webkit.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
await page.addScriptTag({ content: readFileSync(ABCJS, 'utf-8') })
if ((await page.evaluate(() => typeof window.ABCJS?.parseOnly)) !== 'function')
  throw new Error('abcjs did not load')

const rows = await page.evaluate((names) => {
  /** Fifths from an accidental list: abcjs's are always one contiguous run of one kind. */
  const fifths = (accs) => {
    const list = (accs ?? []).filter((a) => a.acc === 'sharp' || a.acc === 'flat')
    if (list.length === 0) return 0
    return list[0].acc === 'sharp' ? list.length : -list.length
  }
  const sigOf = (abc) => {
    const t = window.ABCJS.parseOnly(abc)[0]
    return t ? fifths(t.getKeySignature()?.accidentals) : null
  }
  /**
   * ⚠️ **`getKeySignature()` REPORTS THE HEADER KEY, NOT THE ONE IN FORCE.** A first cut
   * asked it after an inline `[K:…]` and got the header's answer for all 231 spellings, so
   * every one read as "unrecognised". The inline question can only be asked of what was
   * DRAWN, which is what this does.
   */
  const drawn = (abc) => {
    const d = document.createElement('div')
    d.style.position = 'absolute'
    d.style.visibility = 'hidden'
    document.body.appendChild(d)
    window.ABCJS.renderAbc([d], abc, { staffwidth: 670 })
    const acc = [...d.querySelectorAll('[data-name^="accidentals"]')]
      .map((n) => n.getAttribute('data-name'))
      .join(',')
    d.remove()
    return acc
  }
  return names.map((k) => ({
    k,
    header: sigOf(`X:1\nM:4/4\nL:1/4\nK:${k}\nCDEF|\n`),
    // ⚠️ TWO DIFFERENT KEYS IN FORCE, so a spelling that merely HAPPENS to equal one of
    // them cannot read as "keeps". A recognised spelling draws the SAME second signature
    // after either; an unrecognised one draws whatever was already there, so the two differ.
    keepsA: drawn(`X:1\nM:4/4\nL:1/4\nK:D\nCDEF|[K:${k}]GABc|\n`),
    keepsB: drawn(`X:1\nM:4/4\nL:1/4\nK:Bb\nCDEF|[K:${k}]GABc|\n`),
    // Both heads carry TWO accidentals, so the change is everything after the first two.
    headA: drawn(`X:1\nM:4/4\nL:1/4\nK:D\nCDEF|GABc|\n`),
    headB: drawn(`X:1\nM:4/4\nL:1/4\nK:Bb\nCDEF|GABc|\n`),
  }))
}, NAMES)
await browser.close()

/**
 * ⚠️ **THE DISCRIMINATOR TOOK THREE TRIES AND THE FIRST TWO MEASURED NOTHING.**
 *   1. `getKeySignature()` after the change — reports the HEADER key. All 231 "unrecognised".
 *   2. `keepsA !== keepsB` over the whole drawn list — the two HEADS already differ, so
 *      again all 231.
 * What actually answers it: an unrecognised spelling leaves the key in force, so the change
 * REDRAWS THE HEAD's own accidentals — the tail equals the head, after BOTH controls. One
 * control alone would call a spelling that happens to equal D "unrecognised".
 */
const tail = (whole, head) => whole.slice(head.length ? head.length + 1 : 0)
const table = rows.map((r) => ({
  k: r.k,
  fifths: r.header,
  keeps: tail(r.keepsA, r.headA) === r.headA && tail(r.keepsB, r.headB) === r.headB,
}))
const kept = table.filter((t) => t.keeps)
/**
 * **KEYED BY (root, accidental, MODE) RATHER THAN BY SPELLING**, because that is what a
 * parsed `KeySignature` holds — and it is safe: all 231 spellings collapse into 147 groups
 * and **every group is internally consistent** (checked below, not assumed). `Cbmin`,
 * `Cbm` and `Cbaeo` are one row.
 */
const MODE = {
  '': 'major', maj: 'major', ion: 'major',
  min: 'minor', aeo: 'minor', m: 'minor',
  mix: 'mixolydian', dor: 'dorian', phr: 'phrygian', lyd: 'lydian', loc: 'locrian',
}
const grouped = new Map()
for (const t of table) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(t.k)
  if (m === null) throw new Error(`unparsed spelling ${t.k}`)
  const id = `${m[1]}${m[2]}|${MODE[m[3]]}`
  const seen = grouped.get(id)
  const value = `${t.fifths}|${t.keeps}`
  if (seen !== undefined && seen.value !== value)
    throw new Error(`inconsistent group ${id}: ${seen.value} vs ${value} (${t.k})`)
  grouped.set(id, { id, value, fifths: t.fifths, keeps: t.keeps })
}

const ts = `// GENERATED by scripts/harvest-abcjs-keys.mjs — DO NOT EDIT.
// Harvested from abcjs 6.7.0 by RUNNING it; see that script for why a table and not a port.
//
// ${table.length} spellings collapsed into ${grouped.size} (root, accidental, mode) groups,
// of which ${[...grouped.values()].filter((g) => g.keeps).length} abcjs does not recognise
// at all. Every group was checked internally consistent at generation time.

/** What abcjs draws for a key, and whether it recognises it. */
export interface AbcjsKey {
  /** Signed count: positive is sharps. The HEADER answer. */
  readonly fifths: number
  /**
   * abcjs has no entry for this spelling, so \`transpose.keySignature\` returns the key IN
   * FORCE and only the mode is overwritten. Inline, that means NO CHANGE; in a header it
   * means the value in \`fifths\`, which is what the initial key plus this mode produces.
   */
  readonly keeps: boolean
}

/** Key: \`\${root}\${accidental}|\${mode}\` — e.g. \`Cb|minor\`, \`D|major\`. */
export const ABCJS_KEYS: Readonly<Record<string, AbcjsKey>> = {
${[...grouped.values()].map((g) => `  '${g.id}': { fifths: ${g.fifths}, keeps: ${g.keeps} },`).join('\n')}
}
`
const out = join(import.meta.dirname, '..', 'src', 'core', 'keys-abcjs.ts')
writeFileSync(out, ts)
console.log(`harvested ${table.length} spellings -> ${grouped.size} groups, ${[...grouped.values()].filter((g) => g.keeps).length} unrecognised -> ${out}`)
