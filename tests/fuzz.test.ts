import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parse } from '../src/parser/parser.js'
import { corpusDir } from './corpus/corpus.js'

// Deterministic PRNG so a failure is reproducible.
let seed = 12345
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)] as T

const CHARS = [...'ABCDEFGabcdefgz^_=,\'/0123456789|:[]{}()"!+-<>&\\\n \tXKLMQVwW%~*.']

it('survives malformed, hostile and randomly mutated input', () => {
  const seeds = readdirSync(corpusDir)
    .filter((f) => f.endsWith('.abc'))
    .map((f) => readFileSync(join(corpusDir, f), 'utf-8'))
  const problems: string[] = []
  const check = (src: string, label: string) => {
    const t0 = Date.now()
    let r: ReturnType<typeof parse>
    try {
      r = parse(src)
    } catch (e) {
      problems.push(`THREW ${label}: ${(e as Error).message}`)
      return
    }
    const ms = Date.now() - t0
    if (ms > 1000) problems.push(`SLOW ${label}: ${ms}ms for ${src.length} chars`)
    if (!r.ok) return
    for (const s of r.scores)
      for (const v of s.voices)
        for (const m of v.measures)
          for (const e of [...m.events, ...m.overlays.flat()]) {
            for (const [n, d] of [
              ['duration', e.duration],
              ['notated', e.notatedDuration],
            ] as const) {
              if (!Number.isFinite(d.numerator) || !Number.isFinite(d.denominator))
                problems.push(`NONFINITE ${n} ${label}: ${d.numerator}/${d.denominator}`)
              if (d.denominator <= 0)
                problems.push(`BADDEN ${n} ${label}: ${d.numerator}/${d.denominator}`)
              if (d.numerator < 0)
                problems.push(`NEGATIVE ${n} ${label}: ${d.numerator}/${d.denominator}`)
            }
            if (e.type === 'note' && !Number.isFinite(e.pitch.octave)) {
              problems.push(`BADOCTAVE ${label}`)
            }
            if (e.type === 'chord' && e.pitches.some((p) => !Number.isFinite(p.octave))) {
              problems.push(`BADOCTAVE ${label}`)
            }
          }
  }
  // 1. structured edge cases
  for (const [i, s] of [
    '',
    '\n',
    'X:1',
    'X:1\nK:C\n',
    'K:C\nabc',
    'X:1\nL:0/0\nK:C\nabc',
    'X:1\nL:1/4\nK:C\nA0 B/0 C999999999 |',
    'X:1\nK:C\na>>>>>>>>>>b',
    `X:1\nK:C\na${'>'.repeat(60)}b`,
    `X:1\nK:C\na${'<'.repeat(200)}b`,
    'X:1\nK:C\n(0abc',
    'X:1\nK:C\n(999999:999999:999999abc',
    'X:1\nK:C\n"unterminated',
    'X:1\nK:C\n{unterminated',
    'X:1\nK:C\n!unterminated',
    'X:1\nK:C\n[',
    'X:1\nK:C\n[]',
    'X:1\nK:C\n^^^^^^^^^^C',
    'X:1\nK:C\nC' + "'".repeat(5000),
    'X:1\nK:C\n' + 'C'.repeat(50000),
    'X:1\nK:C\nabc\r\nw:do re mi\r\n',
    'X:1\nK:C\n[V:nosuchvoice]abc',
    'X:1\nK:C\nabc\nw:' + 'a-'.repeat(5000),
    'X:1\nK:C\n%%score (((((',
    'X:1\nK:C\n\\',
    'X:1\nK:C\n&&&&abc',
    'X:1\nK:C\nz'.repeat(1000),
  ].entries())
    check(s, `edge#${i}`)
  // 2. random mutations of real corpus files
  for (let n = 0; n < 400; n++) {
    const base = pick(seeds)
    const chars = [...base]
    const edits = 1 + Math.floor(rnd() * 30)
    for (let e = 0; e < edits; e++) {
      const at = Math.floor(rnd() * chars.length)
      const op = rnd()
      if (op < 0.4) chars[at] = pick(CHARS)
      else if (op < 0.7) chars.splice(at, 0, pick(CHARS))
      else chars.splice(at, 1)
    }
    check(chars.join(''), `mut#${n}(seed12345)`)
  }
  // 3. pure random
  for (let n = 0; n < 200; n++) {
    const len = Math.floor(rnd() * 2000)
    check(Array.from({ length: len }, () => pick(CHARS)).join(''), `rand#${n}`)
  }
  const unique = [...new Set(problems)]
  writeFileSync(join(tmpdir(), 'abcts-fuzz.txt'), unique.slice(0, 40).join('\n') || 'NO PROBLEMS')
  // THE ASSERTION IS THE POINT. Without it this file accumulates findings, writes them to
  // a temp file, and passes — which is exactly what it did while three separate crashes
  // were live. parse() promises it never throws and always yields finite durations with
  // positive denominators; this is what holds it to that.
  expect(unique.slice(0, 10)).toEqual([])
})
