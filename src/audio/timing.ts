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

/** What `createNote` replaces a zero duration with — a quarter (`abstract-engraver.js:802`). */
const ZERO_LENGTH_DRAWN = 0.25

/**
 * `getMeterFraction()` — the first meter on any staff of any LINE, and **4/4 when there is
 * none at all** (`abc_tune.js:181-220`). Not the header's meter: a tune may write its `K:`
 * before its `M:`.
 */
function meterOf(score: Score): Meter {
  /**
   * **IT IS THE STAFF'S METER, WHICH IS THE ONE IN FORCE WHEN THE VOICE'S FIRST ELEMENT IS
   * EMITTED** — and a tune with no elements at all has no `lines`, so it falls through to
   * `{ type: "common_time" }` and 4/4 (`abc_tune.js:181-220`).
   *
   * `appendStartingElement` stamps `staff[staffNum][type]` while the voice is still empty,
   * which is the same fall-through that lets a body `K:` restamp a staff's key — so an
   * INLINE `[M:]` written before any note becomes the staff's meter just as a standalone
   * `M:` does, and one written after it does not. Three fixtures say so:
   *
   *     misc-14                header `M:6/8`, NO music     abcjs 4/4  (no lines at all)
   *     flattener-38           header 4/4, body `M:2/4`     abcjs 2/4  (before any note)
   *     svg-02-staffwidth-12   `[M:2/4]y[M:3/4]y[M:4/4]`    abcjs 2/4  (the first, inline)
   *
   * Ours read `score.meter ?? the first meterChange`, which is the HEADER's when there is
   * one and never sees an inline meter at all.
   */
  const voice = score.voices[0]
  let inForce = score.meter
  for (const measure of voice?.measures ?? []) {
    // A barline is an element too — `containsNotes` tests `el_type === 'note' || 'bar'`.
    if (measure.openingBarline !== null) return inForce ?? DEFAULT_METER
    /**
     * …**AND AN INLINE `[M:]` ONLY STAMPS THE STAFF WHEN NOTHING HAS STAMPED IT YET.**
     * `appendStartingElement` replaces `staff[staffNum][type]` while the voice holds no
     * note or bar (`tune-builder.js:272-277`), but a HEADER meter has already put one
     * there — measured on three fixtures through abcjs:
     *
     *     grandstaff-inline-meter  header 4/4, V:1 opens `[M:3/4]`   abcjs 4/4
     *     svg-02-staffwidth-12     no header, opens `[M:2/4]`        abcjs 2/4
     *     flattener-38             header 4/4, body `M:2/4` line     abcjs 2/4
     *
     * So a STANDALONE `M:` replaces whatever is there and an INLINE one only fills a gap.
     * A measure carrying `meterChanges` has more than one `[M:]` in it, which only inline
     * meters can do.
     */
    const changes =
      measure.meterChanges?.map((c) => ({ ...c, inline: true })) ??
      (measure.meterChange === null
        ? []
        : [
            {
              meter: measure.meterChange,
              at: 0,
              inline: measure.meterChangeInline === true,
            },
          ])
    let next = 0
    for (let i = 0; i <= measure.events.length; i += 1) {
      while (next < changes.length && (changes[next]?.at ?? 0) <= i) {
        const c = changes[next]
        if (c?.meter != null && (!c.inline || inForce === null)) inForce = c.meter
        next += 1
      }
      // A SPACER counts: abcjs gives it `el_type: 'note'` like any other rest.
      if (i < measure.events.length) return inForce ?? DEFAULT_METER
    }
    if (measure.closingBarline !== null) return inForce ?? DEFAULT_METER
  }
  return DEFAULT_METER
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

/**
 * `getPickupLength()`, in whole notes — the lead-in before the first full measure.
 *
 * **AND IT WALKS EVERY VOICE OF EVERY STAFF, ACCUMULATING, UNTIL IT MEETS A BAR.**
 * `computePickupLength`'s three nested loops run over `lines[i].staff[j].voices[v]` and
 * only the `el_type === 'bar'` arm returns (`abc_tune.js:108-134`), so a two-voice tune
 * with no barline at all sums BOTH voices: `tablature-07` is `ABc` over `A,B,C` and abcjs
 * answers 0.75 where one voice is 0.375. Reproduced rather than corrected — a host asking
 * for the pickup gets abcjs's number, and this is one of the places its own comment does
 * not claim the result is sensible.
 */
function pickupOf(score: Score, meter: Meter): number {
  const barLength = barLengthOf(meter)
  let pickup = 0
  for (const voice of score.voices) {
    for (const measure of voice.measures) {
      if (measure.openingBarline !== null) return settle(pickup, barLength)
      for (const event of measure.events) {
        if (!(event.type === 'rest' && event.kind === 'spacer')) {
          pickup += ratToNumber(event.duration)
        }
        if (pickup >= barLength) pickup -= barLength
      }
      if (measure.closingBarline !== null) return settle(pickup, barLength)
    }
  }
  return settle(pickup, barLength)
}

/** "If computed pickup length is very close to 0 or the bar length, we assume" no pickup. */
const settle = (pickup: number, barLength: number): number =>
  pickup < 1e-8 || barLength - pickup < 1e-8 ? 0 : pickup

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
  const meter = meterOf(score)
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
    /**
     * **`noteFound` RESETS AT EVERY LINE, AND `measureNumber` DOES NOT.** abcjs declares it
     * inside `makeVoicesArray`'s per-LINE loop and the counter outside it
     * (`abc_tune.js:396-434`), so "skip a bar line that appears at the left of the music,
     * before any notes" is per SYSTEM rather than per tune — a `|:` opening a second line
     * does not count a measure either. Three fixtures were one measure high on every row
     * after the first line break, and only the `setupEvents` gate could say so: the timing
     * oracle is harvested from `doWarpTest`, which asserts times alone.
     */
    if (measure.startsSystem) noteFound = false
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
      /**
       * **AND A ZERO-LENGTH NOTE TAKES A QUARTER OF TIME.** `durationClassOveride` is
       * `elem.duration * tripletmultiplier` and `AbsoluteElement` takes it only
       * `if (options.durationClassOveride)` — **`0` IS FALSY** — so it falls through to the
       * element's own `duration`, which `createNote` has already replaced: `if (duration
       * === 0) { zeroDuration = true; duration = 0.25; nostem = true; }`, abcjs's own
       * comment reading "zero duration will draw a quarter note head"
       * (`abstract-engraver.js:801-819`, `absolute-element.js:40`). `setupEvents` then
       * reads `durationClass ? durationClass : duration` (`abc_tune.js:301`).
       *
       * So `C0` DRAWS as a stemless quarter, SOUNDS for nothing — the flattener walks the
       * parse tree and never sees this — and OCCUPIES a quarter on the clock. The same
       * falsy-zero class as `if (opt.bottom)` on a stem and `if (this.measureNumber)` in
       * the class counters.
       */
      /**
       * **AND A MULTI-MEASURE REST TAKES ITS MEASURES.** `durationClassOveride` is the
       * PARSE tree's `elem.duration`, which for `Zn` is `n` whole measures — only the
       * SPACING duration is flattened to 1 (`abstract-engraver.js:812-816`), and
       * `setupEvents` reads `durationClass` first (`abc_tune.js:301`). So `Z24 | F2 |`
       * runs 32.667s at 180bpm in 2/4 and ours ran 2s, because our model carries the
       * DRAWN duration on the event.
       */
      const multi =
        event.type === 'rest' &&
        (event.kind === 'multiMeasure' || event.kind === 'invisibleMultiMeasure') &&
        event.measureCount > 0
      const sounding = spacer
        ? 0
        : multi
          ? event.measureCount * barLengthOf(meter)
          : ratToNumber(event.duration)
      out.push({
        kind: 'note',
        measureNumber,
        duration: sounding === 0 && !spacer ? ZERO_LENGTH_DRAWN : sounding,
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
/**
 * **THE `AbcTune` ACCESSORS, WITH abcjs'S OWN NAMES AND ANSWERS.**
 *
 * Every one of these already existed here as a private helper the timing gate leaned on —
 * `meterOf`, `beatLengthOf`, `barLengthOf`, `bpmOf`, `pickupOf` — because the clock cannot
 * be built without them. abcjs states them on the tune object
 * (`data/abc_tune.js:90-181`), so under "match every API" they are exported rather than
 * reimplemented, and `tests/accessors.test.ts` measures all nine against abcjs's own
 * answers over 293 tunes.
 *
 * They take a `Score` where abcjs's take nothing, because ours are functions and abcjs's
 * are methods; `compat` binds them to the tune object it hands back.
 */
export const getMeter = (score: Score): Meter => meterOf(score)
/** `getBeatLength()` — the note value one beat is (`abc_tune.js:90-135`). */
export const getBeatLength = (score: Score): number => beatLengthOf(meterOf(score))
/** `getBarLength()` — `meter.num / meter.den` (`abc_tune.js:145-148`). */
export const getBarLength = (score: Score): number => barLengthOf(meterOf(score))
/** `getBeatsPerMeasure()` — the bar over the beat (`abc_tune.js:175-179`). */
export const getBeatsPerMeasure = (score: Score): number =>
  getBarLength(score) / getBeatLength(score)
/** `getBpm(tempo)` — the tune's own rate, with abcjs's compound-meter default. */
/**
 * `getBpm(tempo)` — and **the tempo it defaults to is `metaText.tempo`, the HEADER's
 * alone** (`abc_tune.js:563-566`). An inline `[Q:]` becomes a `tempo` ELEMENT in the voice
 * stream and never reaches `metaText`, so `flattener-10` — five inline `[Q:]` and no
 * header one — answers with the 180 default where ours answered 129. The inline rates
 * still drive the clock through `tempoLocations`; they just are not the tune's own rate.
 */
export const getBpm = (score: Score): number =>
  bpmOf(score.tempoInline === true ? null : score.tempo, meterOf(score))
/** `getPickupLength()` — the lead-in before the first full measure, in whole notes. */
export const getPickupLength = (score: Score): number => pickupOf(score, meterOf(score))

/**
 * `millisecondsPerMeasure(bpmOverride)` — the tune-level form, which resolves the rate the
 * way abcjs does before dividing: the override if there is one, else the tune's own
 * (`abc_tune.js:158-173`).
 */
export function millisecondsPerMeasureOf(score: Score, bpmOverride?: number): number {
  return millisecondsPerMeasure(meterOf(score), bpmOverride ? bpmOverride : getBpm(score))
}

/**
 * `setTiming`'s two by-products. abcjs STORES them on the tune and `getTotalTime()` /
 * `getTotalBeats()` just read the field, so both are `undefined` until the timings have
 * been built at least once (`abc_tune.js:614-621`) — reproduced, because a host that calls
 * `getTotalTime()` too early gets `undefined` from abcjs and must get it from us.
 */
export interface TimingTotals {
  readonly rows: NoteTiming[]
  readonly totalTime: number | undefined
  readonly totalBeats: number | undefined
}

/** `setTiming`, with the totals it computes on the way (`abc_tune.js:614-621`). */
export function timingsOf(score: Score, options: TimingOptions = {}): TimingTotals {
  const rows = setTiming(score, options)
  const last = rows[rows.length - 1]
  if (last === undefined) return { rows, totalTime: undefined, totalBeats: undefined }
  // The rate the run actually used, resolved exactly as `setTiming` resolves it.
  const bpm = options.bpm !== undefined && options.bpm ? options.bpm : getBpm(score)
  const totalTime = last.milliseconds / 1000
  return { rows, totalTime, totalBeats: totalTime * (bpm / 60) }
}

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
  return addUsefulCallbackInfo(score, rows, finalBpm * warp)
}

/**
 * **`tune.setupEvents(startingDelay, timeDivider, startingBpm, warp)` — `setTiming`'s own
 * walk, with the four numbers it computes handed in instead.**
 *
 * abcjs exposes it publicly (`abc_tune.js:438`) and `setTiming` is a caller like any other:
 * it works out `startingDelay` from `measuresOfDelay` and the pickup, `timeDivider` from
 * the beat length and the rate, and passes them straight through. It closes by stamping
 * every row with `millisecondsPerMeasure` at `bpm * warp` — the RUNNING bpm at the end of
 * the walk, not the tune's (`:523`).
 *
 * ⚠️ **AND `timeDivider` IS A DEAD PARAMETER.** The first statement inside the voice loop
 * is `timeDivider = this.getBeatLength() * bpm / 60` (`:459`), which overwrites whatever
 * was passed before a single element is read. Ours took it seriously and threaded it
 * through as the initial divider — reasonable, and wrong: the gate's `half-divider` case
 * is byte-identical to its `canonical` one in abcjs and was DOUBLE in ours. It stays in
 * the signature because a host passes four arguments.
 */
export function setupEventsFor(
  score: Score,
  startingDelay: number,
  _timeDivider: number,
  startingBpm: number,
  warp = 1,
): NoteTiming[] {
  const { rows, finalBpm } = setupEvents(score, startingDelay, startingBpm, warp)
  return addUsefulCallbackInfo(score, rows, finalBpm * warp)
}

/**
 * `addUsefulCallbackInfo(timingEvents, bpm)` — one figure, stamped on every row INCLUDING
 * the end row (`abc_tune.js:527-533`). Public because a host that builds its own event
 * list can call it.
 *
 * **IT RETURNS A NEW ARRAY WHERE abcjs MUTATES IN PLACE.** abcjs writes
 * `ev.millisecondsPerMeasure` onto each row it was handed; ours are frozen records, and
 * the value a caller reads back is the same either way.
 */
export function addUsefulCallbackInfo(
  score: Score,
  rows: readonly NoteTiming[],
  bpm: number,
): NoteTiming[] {
  const perMeasure = millisecondsPerMeasure(meterOf(score), bpm)
  return rows.map((r) => ({ ...r, millisecondsPerMeasure: perMeasure }))
}

/** `millisecondsPerMeasure(bpm)` — beats per measure over the rate (`abc_tune.js:158-178`). */
export function millisecondsPerMeasure(meter: Meter, bpm: number): number {
  const rate = bpm <= 0 ? 1 : bpm
  return ((barLengthOf(meter) / beatLengthOf(meter)) / rate) * 60000
}
