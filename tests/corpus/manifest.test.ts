import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type CorpusCase, corpusDir, goldensDir, loadCorpus, parseGolden } from './corpus'

// Baseline suite: proves the corpus is reachable and every fixture has the goldens
// later suites will diff against. It asserts nothing about abcts behavior — there is
// no parser yet. It goes red the moment the sibling corpus path moves or a golden
// stops being generated, which is the failure mode worth catching this early.

describe('corpus harness', () => {
  it('resolves the corpus and goldens directories', () => {
    expect(existsSync(corpusDir), `missing corpus dir: ${corpusDir}`).toBe(true)
    expect(existsSync(goldensDir), `missing goldens dir: ${goldensDir}`).toBe(true)
  })

  const cases: CorpusCase[] = loadCorpus()

  it('finds fixtures', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it('attributes every golden to exactly one fixture', () => {
    const claimed = cases.flatMap((c) => c.goldens)
    expect(new Set(claimed).size).toBe(claimed.length)
  })

  describe.each(cases)('$name', (testCase) => {
    it('has non-empty ABC', () => {
      expect(testCase.abc.trim().length).toBeGreaterThan(0)
    })

    it('has a readable abcjs parse golden', () => {
      expect(parseGolden(testCase.name)).toBeTypeOf('object')
    })

    it('has at least one SVG golden', () => {
      expect(testCase.goldens.filter((g) => g.endsWith('.svg')).length).toBeGreaterThan(0)
    })
  })
})
