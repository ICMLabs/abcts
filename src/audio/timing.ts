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
import type { Measure, Meter, MusicEvent, Score, SourceRange, Tempo, Voice } from '../core/model.js'
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
  /**
   * **THE GEOMETRY HALF, WHICH IS WHAT A PLAYBACK CURSOR DRAWS WITH** — the SYSTEM the
   * row falls on, that system's ink extent, and the leftmost element's box
   * (`abc_tune.js:298-395`). Present only when the caller supplied a `geometryOf`, which
   * the compat tune object does because it has laid the tune out anyway.
   *
   * `line`, `top`, `height`, `width` and `measureNumber` come from the element that
   * CREATED the row; `left` is the MINIMUM across every voice that lands on it, "the left
   * most element wins"; and the two `…CharArray`s collect every element while the plain
   * `startChar`/`endChar` keep the first that was not null.
   */
  readonly line?: number
  readonly top?: number
  readonly height?: number
  readonly left?: number | null
  readonly width?: number
  readonly startChar?: number | null
  readonly endChar?: number | null
  readonly startCharArray?: readonly (number | null)[]
  readonly endCharArray?: readonly (number | null)[]
  /** Where the cursor stops — the next row's `left`, or the system's right edge. */
  readonly endX?: number
  /**
   * abcjs's is one DOM NODE ARRAY per element at this time; ours is one entry per element,
   * carrying the `tune.lines` element itself — the same object `getElementFromChar`
   * returns. A host cannot be handed our markup as nodes (we emit a string), and the
   * COUNT and the identity are what it reads.
   */
  readonly elements?: readonly (readonly unknown[])[]
  readonly midiPitches?: readonly unknown[]
}

/**
 * What the caller knows about an element's DRAWING, supplied to `setTiming` so the clock
 * and the geometry can be joined without this file importing the renderer.
 */
export interface TimingGeometry {
  readonly line: number
  /** The SYSTEM's right edge — abcjs's `staffGroup.w`, which `addEndPoints` runs out to. */
  readonly systemWidth?: number
  readonly top: number
  readonly height: number
  readonly left: number
  readonly width: number
  readonly startChar: number | null
  readonly endChar: number | null
  /** The `tune.lines` element, for the row's `elements` and its `midiPitches`. */
  readonly abcelem?: unknown
  readonly midiPitches?: readonly unknown[]
}

export interface TimingOptions {
  /** The host's tempo. Warps the tune's own rather than replacing it — see `setTiming`. */
  readonly bpm?: number
  /** Whole measures of count-in before the music, less the pickup. */
  readonly measuresOfDelay?: number
  /** The drawing, per model event — see `TimingGeometry`. Absent leaves the rows clock-only. */
  readonly geometryOf?: (event: MusicEvent) => TimingGeometry | undefined
  /** The same for a BARLINE, found by its span — read only for `endX`. */
  readonly barGeometryOf?: (range: SourceRange) => TimingGeometry | undefined
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
              /**
               * ⚠️ **AND THE SINGULAR CHANGE CARRIES NO INDEX, SO IT IS DERIVED FROM ITS
               * RANGE** — how many of the measure's events were WRITTEN before the field,
               * which is `meterEventIndex` in the layout. Assuming 0 made a MID-MEASURE
               * `[M:]` stamp the staff: `CD[M:2/4]EF|` reported 2/4 where abcjs reports
               * 4/4, because `getMeter` reads `line.staff[j].meter` and a field written
               * after music is a STREAM element that never becomes one
               * (`abc_tune.js:181-193`, `tune-builder.js:272-295`).
               *
               * It reached three surfaces at once — `getMeter`, `getBarLength` and
               * `getPickupLength`, which is what `extractMeasures`' `hasPickup` reads.
               */
              at: measure.events.filter(
                (e) =>
                  (e.sourceRange?.start ?? Number.POSITIVE_INFINITY) <
                  (measure.meterChangeSourceRange?.start ?? Number.POSITIVE_INFINITY),
              ).length,
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
  /** The model event, for the geometry join — see `TimingGeometry`. */
  readonly event?: MusicEvent
  /** A BARLINE's own span, which is how the drawing is found for one — see `endX`. */
  readonly range?: SourceRange
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
  const bar = (kind: string | null, range: SourceRange | null = null): void => {
    if (kind === null) return
    out.push({
      kind: 'bar',
      measureNumber,
      duration: 0,
      barType: BAR_TYPE[kind] ?? 'bar_thin',
      ...(range === null ? {} : { range }),
    })
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
    bar(measure.openingBarline, measure.openingBarlineSourceRange)
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
        event,
      })
      noteFound = true
    }
    bar(measure.closingBarline, measure.closingBarlineSourceRange)
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
  geometryOf?: (event: MusicEvent) => TimingGeometry | undefined,
  barGeometryOf?: (range: SourceRange) => TimingGeometry | undefined,
): { rows: NoteTiming[]; finalBpm: number } {
  const meter = meterOf(score)
  const beatLength = beatLengthOf(meter)
  const tempos = new Map<number, Tempo>()
  /**
   * **AN `&` OVERLAY LAYER IS A VOICE HERE TOO, BECAUSE abcjs WALKS THE DRAWN ONES.**
   * `makeVoicesArray` reads `staffgroups[].voices`, which `resolveOverlays` has already
   * split — and every earlier line of that staff carries an invisible-rest COPY of itself,
   * so a row in the first measure of a two-layer tune has THREE elements and three
   * `startCharArray` entries. Our model pads the same way (one layer per measure, invisible
   * rests where nothing was written), so the layer is a voice by taking `measure.overlays`
   * as its events — the same shape the renderer's own `expandOverlays` makes, without this
   * file having to import it.
   */
  const layered = score.voices.flatMap((v) => {
    const depth = v.measures.reduce((n, m) => Math.max(n, m.overlays.length), 0)
    const layers: Voice[] = []
    for (let layer = 0; layer < depth; layer += 1)
      layers.push({
        ...v,
        measures: v.measures.map((m) => ({ ...m, events: m.overlays[layer] ?? [], overlays: [] })),
      })
    return [v, ...layers]
  })
  const voices = layered.map((v) => voiceElements(v, score, tempos))
  /** ms → the row at that time. One row per distinct millisecond, across all voices. */
  const events = new Map<
    number,
    {
      measureNumber: number
      measureStart: boolean
      geometry?: TimingGeometry
      left?: number | null
      elements: unknown[][]
      startChar: number | null
      endChar: number | null
      startCharArray: (number | null)[]
      endCharArray: (number | null)[]
      midiPitches: unknown[]
      endX?: number
    }
  >()
  let maxVoiceTimeMs = 0
  let bpm = startingBpm

  for (const elements of voices) {
    let voiceTime = startingDelay
    let voiceTimeMs = Math.round(voiceTime * 1000)
    let startingRepeatElem = 0
    let endingRepeatElem = -1
    let nextIsBar = true
    let lastHashMs = -1
    bpm = startingBpm
    let timeDivider = (beatLength * bpm) / 60
    let tempoDone = -1

    /** `addElementToEvents`, reduced to the time half. Returns the duration to advance. */
    const add = (el: TimedElement, atMs: number, divider: number): number => {
      if (el.duration <= 0) return 0
      const g = el.event === undefined ? undefined : geometryOf?.(el.event)
      /**
       * **`%%maxStaves` TRUNCATES THE CLOCK, AND THIS IS WHERE.** `makeVoicesArray` walks
       * `this.engraver.staffgroups` — the groups `draw()` actually BUILT — and `draw()`
       * breaks out of its line loop once `nStaves > maxStaves` (`abc_tune.js:396-436`,
       * `draw/draw.js:33-39`), so an incipit's later systems are in no voice array and
       * take no time at all. abcjs answers 2.667s where the whole tune is 5.333.
       *
       * A caller that supplied a `geometryOf` has laid the tune out, and our layout
       * truncates the same way — so an element with an event and NO geometry is one abcjs
       * never saw. Without a `geometryOf` this cannot be known and the whole tune sounds,
       * which is what the library path has always done.
       */
      if (geometryOf !== undefined && el.event !== undefined && g === undefined) return 0
      const row = events.get(atMs)
      if (row === undefined) {
        // **THE FIRST ELEMENT AT A TIME MAKES THE ROW AND GIVES IT ITS SYSTEM** —
        // `line`, `top`, `height`, `width` and `measureNumber` are its, and every later
        // one only narrows `left` and appends to the arrays (`abc_tune.js:338-383`).
        events.set(atMs, {
          measureNumber: el.measureNumber,
          measureStart: nextIsBar,
          ...(g === undefined ? {} : { geometry: g, left: g.left, width: g.width }),
          elements: g === undefined ? [] : [[g.abcelem]],
          startChar: g?.startChar ?? null,
          endChar: g?.endChar ?? null,
          startCharArray: g === undefined ? [] : [g.startChar],
          endCharArray: g === undefined ? [] : [g.endChar],
          midiPitches: [...(g?.midiPitches ?? [])],
        })
      } else {
        if (nextIsBar) row.measureStart = true
        if (g !== undefined) {
          // "the left most element wins" — and the test is TRUTHINESS, so a row whose
          // `left` is 0 or null takes the new one outright (`:359-362`).
          row.left = row.left ? Math.min(row.left, g.left) : g.left
          row.elements.push([g.abcelem])
          /**
           * **AN OVERLAY LAYER'S PADDING REST BORROWS THE SPAN OF THE ELEMENT IT MIRRORS.**
           * `resolveOverlays` back-fills every earlier line of the staff with a copy of its
           * voices, notes replaced by invisible rests **of the same duration and the same
           * `startChar`/`endChar`** (`tune-builder.js:541-556`), so abcjs's row reads
           * `[22, 22]` where a layer exists at all. Our model pads with rangeless rests —
           * the renderer only needs their duration — and the element they mirror is the one
           * that CREATED this row, at this millisecond, in the voice above.
           */
          row.startCharArray.push(g.startChar ?? row.startChar)
          row.endCharArray.push(g.endChar ?? row.endChar)
          if (row.startChar === null) row.startChar = g.startChar
          if (row.endChar === null) row.endChar = g.endChar
          row.midiPitches.push(...(g.midiPitches ?? []))
        }
      }
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
      // **THE ROW THE ELEMENT JUST LANDED ON**, kept for the repeat's `endX` —
      // `if (element.duration > 0 && eventHash["event"+voiceTimeMilliseconds]) lastHash = …`
      // (`abc_tune.js:472-473`), read only at an end repeat.
      if (el.duration > 0 && events.has(voiceTimeMs)) lastHashMs = voiceTimeMs
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
          /**
           * **A REPEAT BARLINE CLOSES THE NOTE BEFORE IT** — "the cursor won't go past the
           * end repeat", `eventHash[lastHash].endX = element.x` (`abc_tune.js:481-483`).
           * The `elem > 0` guard is abcjs's.
           */
          const here = el.range === undefined ? undefined : barGeometryOf?.(el.range)
          const lastRow = events.get(lastHashMs)
          if (elem > 0 && lastRow !== undefined && here !== undefined)
            lastRow.endX = here.left
          if (endingRepeatElem === -1) endingRepeatElem = elem
          let lastVoiceTimeMs = 0
          tempoDone = -1
          for (let el2 = startingRepeatElem; el2 < endingRepeatElem; el2 += 1) {
            const element2 = elements[el2] as TimedElement
            if (tempoDone !== element2.measureNumber && tempos.has(element2.measureNumber)) {
              bpm = bpmOf(tempos.get(element2.measureNumber) as Tempo, meter)
              timeDivider = (warp * beatLength * bpm) / 60
              tempoDone = element2.measureNumber
            }
            voiceTime += add(element2, voiceTimeMs, timeDivider)
            // **AND A BARLINE INSIDE THE REPLAYED RUN STILL OPENS A MEASURE.**
            // `nextIsBar = ret.nextIsBar` and `addElementToEvents` returns
            // `nextIsBar || element.type === 'bar'` (`abc_tune.js:499-500`, `:394`), so the
            // replay is not a special case — it was the only place ours did not read the
            // barline, and the first note AFTER a `:|` lost its `measureStart` on 39 rows.
            if (element2.kind === 'bar') nextIsBar = true
            lastVoiceTimeMs = voiceTimeMs
            voiceTimeMs = Math.round(voiceTime * 1000)
          }
          /**
           * …**AND THE LAST ROW OF THE REPLAY CLOSES AT THE BARLINE THE REPLAY ENDED AT**
           * (`:504-505`). "This won't exist if it is the beginning of the next line."
           */
          const closing = elements[endingRepeatElem] as TimedElement | undefined
          const closingAt =
            closing?.range === undefined ? undefined : barGeometryOf?.(closing.range)
          const lastReplayed = events.get(lastVoiceTimeMs)
          if (lastReplayed !== undefined && closingAt !== undefined)
            lastReplayed.endX = closingAt.left
          nextIsBar = true
          endingRepeatElem = -1
        }
        if (startEnding) endingRepeatElem = elem
        if (startRepeat) startingRepeatElem = elem
      }
    }
    maxVoiceTimeMs = Math.max(maxVoiceTimeMs, voiceTimeMs)
  }

  const sorted = [...events.entries()].sort((a, b) => a[0] - b[0])
  /**
   * **`addEndPoints` — WHERE THE CURSOR STOPS**, run over the sorted rows before the `end`
   * row is pushed (`abc_tune.js:544-560`). A row runs to the NEXT row's `left` when the two
   * are on the same system, and to that system's own right edge when they are not — abcjs's
   * `lines[el.line].staffGroup.w`. `skipTies` walks past any row with a null `left`, which
   * is a tie's continuation.
   *
   * An `endX` already set by a REPEAT is kept unless the walk finds a closer one, and the
   * `endX > el.left` guard is abcjs's: a repeat can put the close BEHIND the note.
   */
  const skipTies = (from: number): (typeof sorted)[number] | undefined => {
    let i = from
    while (i < sorted.length && (sorted[i]?.[1].left ?? null) === null) i += 1
    return sorted[i]
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const row = sorted[i]?.[1]
    if (row === undefined || row.geometry === undefined) continue
    if ((row.left ?? null) === null) continue
    const next = skipTies(i + 1)?.[1]
    const endX =
      next !== undefined && next.geometry !== undefined && next.geometry.top === row.geometry.top
        ? (next.left ?? row.geometry.systemWidth ?? 0)
        : (row.geometry.systemWidth ?? 0)
    if (row.endX !== undefined) {
      if (endX > (row.left ?? 0)) row.endX = Math.min(row.endX, endX)
    } else row.endX = endX
  }
  const lastRow = sorted[sorted.length - 1]?.[1]
  if (lastRow !== undefined && lastRow.geometry !== undefined)
    lastRow.endX = lastRow.geometry.systemWidth ?? 0

  const rows: NoteTiming[] = sorted
    .map(([ms, r]) => ({
      type: 'event' as const,
      milliseconds: ms,
      measureNumber: r.measureNumber,
      ...(r.measureStart ? { measureStart: true } : {}),
      millisecondsPerMeasure: 0,
      ...(r.geometry === undefined
        ? {}
        : {
            line: r.geometry.line,
            top: r.geometry.top,
            height: r.geometry.height,
            left: r.left ?? null,
            width: r.geometry.width,
            startChar: r.startChar,
            endChar: r.endChar,
            startCharArray: r.startCharArray,
            endCharArray: r.endCharArray,
            elements: r.elements,
            midiPitches: r.midiPitches,
            ...(r.endX === undefined ? {} : { endX: r.endX }),
          }),
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
    /**
     * **THE TEMPO THE WARP TESTS IS `metaText.tempo`, THE HEADER'S ALONE** — `var tempo =
     * this.metaText ? this.metaText.tempo : null; if (tempo) warp = bpm / naturalBpm`
     * (`abc_tune.js:592-597`). An inline `[Q:]` is a tempo ELEMENT and never reaches
     * `metaText`, so a tune whose only tempos are inline is PLAYED at the host's rate with
     * its own relative changes intact rather than warped — the same distinction
     * `getBpm` makes one line above, and `flattener-10`, five inline `[Q:]` and no header
     * one, is 9,318ms to abcjs and was 6,678 to us the moment `TimingCallbacks` passed a
     * bpm in.
     */
    if (score.tempo !== null && score.tempoInline !== true) warp = bpm / naturalBpm
  } else bpm = naturalBpm

  const beatLength = beatLengthOf(meter)
  const beatsPerSecond = bpm / 60
  let startingDelay = (barLengthOf(meter) / beatLength) * measuresOfDelay / beatsPerSecond
  if (startingDelay) startingDelay -= pickupOf(score, meter) / beatLength / beatsPerSecond

  const { rows, finalBpm } = setupEvents(
    score,
    startingDelay,
    bpm,
    warp,
    options.geometryOf,
    options.barGeometryOf,
  )
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
  geometryOf?: (event: MusicEvent) => TimingGeometry | undefined,
  barGeometryOf?: (range: SourceRange) => TimingGeometry | undefined,
): NoteTiming[] {
  const { rows, finalBpm } = setupEvents(
    score,
    startingDelay,
    startingBpm,
    warp,
    geometryOf,
    barGeometryOf,
  )
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
