/**
 * `setTiming` — WHEN each note sounds, which is the playback cursor's clock.
 *
 * Ported from `data/abc_tune.js:438-622` (`setupEvents`, `setTiming`, `getBpm`,
 * `getBeatLength`, `millisecondsPerMeasure`) and `:298-392` (`addElementToEvents`).
 *
 * ── WHY THIS SURFACE IS WORTH BUILDING ───────────────────────────────────────
 * It is the AUDIO↔GEOMETRY JOIN, and it **re-derives the answer a different way**. The
 * flattener resolves repeats by REWRITING the voice (`resolveRepeats`); `setupEvents`
 * resolves them by REPLAYING elements in place, from `startingRepeatElem` to
 * `endingRepeatElem`, with its own separate notion of which ending to skip. Two independent
 * answers to one question is what finds things — the MIDI file was built on the same
 * argument and disagreed with the event table three times while that table was green.
 *
 * ── WHAT IS HERE AND WHAT IS NOT ─────────────────────────────────────────────
 * **The TIME half.** Every row abcjs publishes also carries `left`, `endX`, `top`, `height`
 * and `line`, which come from the laid-out elements — and **abcjs's own `timing.test.js`
 * asserts none of them**, so the geometry half has no oracle at all. A green timing table
 * is the clock, not the join. `tests/corpus-timing/README.md` says so where it cannot be
 * mistaken for coverage.
 *
 * The time half needs no layout: `realDuration` is `durationClass`, which is
 * `elem.duration * tripletmultiplier` (`abstract-engraver.js:808`) — the SOUNDING duration,
 * which our model already carries on the event.
 */
import type { Measure, Meter, Score, Tempo, Voice } from '../core/model.js'
import { ratToNumber } from '../core/model.js'

export interface NoteTiming {
  readonly type: 'event' | 'end'
  /** Milliseconds from the start of the piece, rounded as abcjs rounds it. */
  readonly milliseconds: number
  /** Present on `event` rows only. */
  readonly measureNumber?: number
  /** This row is the first of its measure. */
  readonly measureStart?: boolean
  /** Stamped on EVERY row, including the end, by `addUsefulCallbackInfo`. */
  readonly millisecondsPerMeasure: number
}

export interface TimingOptions {
  /** The host's tempo. Warps the tune's own rather than replacing it — see `setTiming`. */
  readonly bpm?: number
  /** Whole measures of count-in before the music, less the pickup. */
  readonly measuresOfDelay?: number
}

const DEFAULT_METER: Meter = { numerator: 4, denominator: 4, symbol: 'numeric' }

/**
 * `getMeterFraction()` — the first meter on any staff of any LINE, and **4/4 when there is
 * none at all** (`abc_tune.js:181-220`). Not the header's meter: a tune may write its `K:`
 * before its `M:`.
 */
function meterOf(score: Score): Meter {
  return (
    score.meter ??
    score.voices.flatMap((v) => v.measures.map((m) => m.meterChange)).find((m) => m !== null) ??
    DEFAULT_METER
  )
}

/**
 * `getBeatLength()` — "there are two types of meters: compound and regular. Compound meter
 * has 3 beats counted as one" (`abc_tune.js:92-106`).
 *
 * The irregular arm is abcjs's own comment: 5/8 and 7/8 take the beat as an eighth but the
 * tempo as a quarter, "which may or may not be generally intuitive".
 */
function beatLengthOf(meter: Meter): number {
  const { numerator: num, denominator: den } = meter
  let multiplier = 1
  if (num === 6 || num === 9 || num === 12) multiplier = 3
  else if (num === 3 && den === 8) multiplier = 3
  else if (den === 8 && (num === 5 || num === 7)) multiplier = 2
  return multiplier / den
}

const barLengthOf = (meter: Meter): number => meter.numerator / meter.denominator

/**
 * `getBpm(tempo)` — **the stated beat unit is a RATIO, not a rate.** `Q:1/2=60` on a tune
 * whose beat is a quarter is 120 quarter-beats a minute, because
 * `bpm = bpm * statedBeatLength / beatLength` (`abc_tune.js:563-582`).
 *
 * The default is 180, and 120 on a compound meter — "compensate for compound meter, where
 * the beat isn't a beat". `meter.num !== 3 && meter.num % 3 === 0` is abcjs's test, so 3/4
 * takes the 180 and 6/8 takes the 120.
 */
function bpmOf(tempo: Tempo | null, meter: Meter): number {
  let bpm = 0
  if (tempo !== null) {
    const beatLength = beatLengthOf(meter)
    const stated = tempo.beatUnit === null ? beatLength : ratToNumber(tempo.beatUnit)
    bpm = ((tempo.bpm ?? 0) * stated) / beatLength
  }
  if (!bpm) {
    bpm = 180
    if (meter.numerator !== 3 && meter.numerator % 3 === 0) bpm = 120
  }
  return bpm
}

/** `getPickupLength()`, in whole notes — the lead-in before the first full measure. */
function pickupOf(score: Score, meter: Meter): number {
  const voice = score.voices[0]
  if (voice === undefined) return 0
  const barLength = barLengthOf(meter)
  let pickup = 0
  for (const measure of voice.measures) {
    if (measure.openingBarline !== null) return pickup
    for (const event of measure.events) {
      if (!(event.type === 'rest' && event.kind === 'spacer')) pickup += ratToNumber(event.duration)
      if (pickup >= barLength) pickup -= barLength
    }
    if (measure.closingBarline !== null) break
  }
  return pickup < 1e-8 || barLength - pickup < 1e-8 ? 0 : pickup
}

/** abcjs's `bar_*` names, which the repeat logic reads. */
const BAR_TYPE: Readonly<Record<string, string>> = {
  thin: 'bar_thin',
  double: 'bar_thin_thin',
  thickThin: 'bar_thick_thin',
  final: 'bar_thin_thick',
  repeatStart: 'bar_left_repeat',
  repeatEnd: 'bar_right_repeat',
  repeatBoth: 'bar_dbl_repeat',
  invisible: 'bar_invisible',
}

/** One entry of `makeVoicesArray()`, reduced to what the TIME half reads. */
interface TimedElement {
  // (mutated once, by `stampVolta`)
  readonly kind: 'note' | 'bar' | 'tempo'
  readonly measureNumber: number
  /** Sounding duration in whole notes — abcjs's `durationClass`. Zero for a spacer. */
  readonly duration: number
  /** `bar` only. */
  readonly barType?: string
  readonly startEnding?: string
  /** `tempo` only. */
  readonly tempo?: Tempo
}

/**
 * `makeVoicesArray()` — one flat list per voice, tagged with the MEASURE NUMBER, which is
 * counted at BARLINES and **skips a barline standing before any note** ("a bar line that
 * appears at the left of the music"), so a tune opening `|:` numbers from 0 either way.
 *
 * ponytail: the laid-out tree gives abcjs `top`, `height` and `line` here too. Nothing in
 * the time half reads them and nothing in abcjs's own suite asserts them, so they are not
 * carried; adding them is the geometry half's job and it needs an oracle first.
 */
function voiceElements(voice: Voice, score: Score, tempos: Map<number, Tempo>): TimedElement[] {
  const out: TimedElement[] = []
  let measureNumber = 0
  let noteFound = false
  const bar = (kind: string | null): void => {
    if (kind === null) return
    out.push({ kind: 'bar', measureNumber, duration: 0, barType: BAR_TYPE[kind] ?? 'bar_thin' })
    if (noteFound) measureNumber += 1
  }
  /**
   * `|1` IS ONE ELEMENT IN ABCJS AND TWO IN OURS — the same split the chord grid hit, and
   * it is load-bearing here for a different reason: `startEnding === '1'` is what stops the
   * replay before the first ending (`abc_tune.js:509-510`). We record the volta on the
   * MEASURE the ending opens, and the barline that announced it is the PREVIOUS measure's
   * closing one, so it is stamped on the last bar emitted. Without it `|:CDEF|1GABc:|2cBAG|`
   * replayed the first ending too — 21 rows against abcjs's 17.
   */
  const stampVolta = (volta: string | null): void => {
    if (volta === null) return
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const el = out[i]
      if (el?.kind === 'bar') {
        out[i] = { ...el, startEnding: volta }
        return
      }
    }
  }
  // The tune's own `Q:` is a tempo ELEMENT at the head of the first voice, so it files
  // under measure 0 — which is why a header tempo and a `[Q:]` in bar 1 are the same thing
  // to this walk.
  if (score.tempo !== null) {
    tempos.set(0, score.tempo)
    out.push({ kind: 'tempo', measureNumber: 0, duration: 0, tempo: score.tempo })
  }
  for (const measure of voice.measures as readonly Measure[]) {
    bar(measure.openingBarline)
    stampVolta(measure.volta)
    if (measure.tempoChange != null) {
      tempos.set(measureNumber, measure.tempoChange)
      out.push({ kind: 'tempo', measureNumber, duration: 0, tempo: measure.tempoChange })
    }
    for (const event of measure.events) {
      // "If there is an invisible rest, then there are not elements" — and a SPACER has no
      // duration at all (`addElementToEvents:302-303`).
      const spacer = event.type === 'rest' && event.kind === 'spacer'
      out.push({
        kind: 'note',
        measureNumber,
        duration: spacer ? 0 : ratToNumber(event.duration),
      })
      noteFound = true
    }
    bar(measure.closingBarline)
  }
  return out
}

/**
 * `setupEvents` — the walk, with **its own repeat resolution**.
 *
 * At an end repeat it replays elements `[startingRepeatElem, endingRepeatElem)` in place.
 * Three subtleties, all abcjs's:
 *
 * - `startRepeat` includes `bar_right_repeat`, so a `:|` is BOTH the end of one repeat and
 *   the start of the next — which is how `|: A :| B :|` works without a second `|:`.
 * - **`startEnding === '1'` and nothing else** sets `endingRepeatElem`. A `|2` does not, and
 *   neither does a `|1,2`, because the test is string equality against `'1'`.
 * - `timeDivider` is seeded WITHOUT the warp and every tempo change applies it — so a tune
 *   with no `Q:` is never warped at all, which is why `warpMs` and `warpMsNoQ` are the same
 *   nineteen numbers.
 */
function setupEvents(
  score: Score,
  startingDelay: number,
  startingBpm: number,
  warp: number,
): { rows: NoteTiming[]; finalBpm: number } {
  const meter = meterOf(score)
  const beatLength = beatLengthOf(meter)
  const tempos = new Map<number, Tempo>()
  const voices = score.voices.map((v) => voiceElements(v, score, tempos))
  /** ms → the row at that time. One row per distinct millisecond, across all voices. */
  const events = new Map<number, { measureNumber: number; measureStart: boolean }>()
  let maxVoiceTimeMs = 0
  let bpm = startingBpm

  for (const elements of voices) {
    let voiceTime = startingDelay
    let voiceTimeMs = Math.round(voiceTime * 1000)
    let startingRepeatElem = 0
    let endingRepeatElem = -1
    let nextIsBar = true
    bpm = startingBpm
    let timeDivider = (beatLength * bpm) / 60
    let tempoDone = -1

    /** `addElementToEvents`, reduced to the time half. Returns the duration to advance. */
    const add = (el: TimedElement, atMs: number, divider: number): number => {
      if (el.duration <= 0) return 0
      const row = events.get(atMs)
      if (row === undefined) {
        events.set(atMs, { measureNumber: el.measureNumber, measureStart: nextIsBar })
      } else if (nextIsBar) row.measureStart = true
      nextIsBar = false
      return el.duration / divider
    }

    for (let elem = 0; elem < elements.length; elem += 1) {
      const el = elements[elem] as TimedElement
      if (tempoDone !== el.measureNumber && tempos.has(el.measureNumber)) {
        bpm = bpmOf(tempos.get(el.measureNumber) as Tempo, meter)
        timeDivider = (warp * beatLength * bpm) / 60
        tempoDone = el.measureNumber
      }
      voiceTime += add(el, voiceTimeMs, timeDivider)
      voiceTimeMs = Math.round(voiceTime * 1000)
      if (el.kind === 'bar') {
        nextIsBar = true
        const endRepeat = el.barType === 'bar_right_repeat' || el.barType === 'bar_dbl_repeat'
        const startEnding = el.startEnding === '1'
        const startRepeat =
          el.barType === 'bar_left_repeat' ||
          el.barType === 'bar_dbl_repeat' ||
          el.barType === 'bar_right_repeat'
        if (endRepeat) {
          if (endingRepeatElem === -1) endingRepeatElem = elem
          tempoDone = -1
          for (let el2 = startingRepeatElem; el2 < endingRepeatElem; el2 += 1) {
            const element2 = elements[el2] as TimedElement
            if (tempoDone !== element2.measureNumber && tempos.has(element2.measureNumber)) {
              bpm = bpmOf(tempos.get(element2.measureNumber) as Tempo, meter)
              timeDivider = (warp * beatLength * bpm) / 60
              tempoDone = element2.measureNumber
            }
            voiceTime += add(element2, voiceTimeMs, timeDivider)
            voiceTimeMs = Math.round(voiceTime * 1000)
          }
          nextIsBar = true
          endingRepeatElem = -1
        }
        if (startEnding) endingRepeatElem = elem
        if (startRepeat) startingRepeatElem = elem
      }
    }
    maxVoiceTimeMs = Math.max(maxVoiceTimeMs, voiceTimeMs)
  }

  const rows: NoteTiming[] = [...events.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, r]) => ({
      type: 'event' as const,
      milliseconds: ms,
      measureNumber: r.measureNumber,
      ...(r.measureStart ? { measureStart: true } : {}),
      millisecondsPerMeasure: 0,
    }))
  rows.push({ type: 'end', milliseconds: maxVoiceTimeMs, millisecondsPerMeasure: 0 })
  return { rows, finalBpm: bpm }
}

/**
 * `setTiming(bpm, measuresOfDelay)` — the tune's note timings, in milliseconds.
 *
 * **THE HOST'S BPM WARPS THE TUNE'S TEMPO RATHER THAN REPLACING IT, AND ONLY WHEN THE TUNE
 * STATES ONE.** `warp = bpm / naturalBpm` is computed `if (tempo)` and nowhere else
 * (`abc_tune.js:592-598`), so a tune with a `Q:` played at 30 keeps every relative tempo
 * change and a tune without one is simply played at 30. That the two produce the SAME
 * nineteen numbers on abcjs's own pair of fixtures is the coincidence that makes the rule
 * easy to miss.
 *
 * The count-in is whole measures LESS THE PICKUP — the music's downbeat still lands on a
 * bar line — and `if (startingDelay)` guards it, so a zero delay never subtracts.
 */
export function setTiming(score: Score, options: TimingOptions = {}): NoteTiming[] {
  const meter = meterOf(score)
  const measuresOfDelay = options.measuresOfDelay ?? 0
  const naturalBpm = bpmOf(score.tempo, meter)
  let warp = 1
  let bpm = options.bpm ?? 0
  if (bpm) {
    if (score.tempo !== null) warp = bpm / naturalBpm
  } else bpm = naturalBpm

  const beatLength = beatLengthOf(meter)
  const beatsPerSecond = bpm / 60
  let startingDelay = (barLengthOf(meter) / beatLength) * measuresOfDelay / beatsPerSecond
  if (startingDelay) startingDelay -= pickupOf(score, meter) / beatLength / beatsPerSecond

  const { rows, finalBpm } = setupEvents(score, startingDelay, bpm, warp)
  // `addUsefulCallbackInfo` stamps every row, INCLUDING the end, with one figure — and the
  // bpm it uses is the LAST voice's running one times the warp, not the tune's.
  const perMeasure = millisecondsPerMeasure(meter, finalBpm * warp)
  return rows.map((r) => ({ ...r, millisecondsPerMeasure: perMeasure }))
}

/** `millisecondsPerMeasure(bpm)` — beats per measure over the rate (`abc_tune.js:158-178`). */
export function millisecondsPerMeasure(meter: Meter, bpm: number): number {
  const rate = bpm <= 0 ? 1 : bpm
  return ((barLengthOf(meter) / beatLengthOf(meter)) / rate) * 60000
}
