/**
 * THE AUDIO FLATTENER — abcjs's `setUpAudio()`, which is `sequence()` then `flatten()`.
 *
 * ── WHAT THE PARITY SURFACE IS ───────────────────────────────────────────────
 * EVENT GENERATION, and not a note of sound. abcjs's `abc_midi_flattener.js`,
 * `abc_midi_sequencer.js` and `chord-track.js` turn a parsed tune into a
 * `{tempo, instrument, totalDuration, tracks[][]}` of `{cmd, pitch, volume, start,
 * duration, instrument, gap}` rows; `create-synth.js`, `synth-controller.js`, the
 * soundfont loading and the WebAudio graph are ~90KB of HOST PLAYBACK on top of that, and
 * they are out of scope. Whether a host plays the list through WebAudio, CoreAudio or a
 * MIDI file is that host's business. It is the same split the renderer makes between
 * geometry (in scope) and glyph outlines (out).
 *
 * ── WHAT IT RUNS OVER ────────────────────────────────────────────────────────
 * abcts's own parse tree, not the laid-out one. abcjs sequences the VISUAL object because
 * that is what its `Tune` has to hand, and pays for it — `preProcess` mutates the tree it
 * was given, and `writeNote` writes `currentTrackMilliseconds` back onto the drawn
 * element. Nothing here needs the geometry: pitches, durations, decorations, chord
 * symbols and bar structure are all in the AST, so audio does not depend on the renderer
 * and a headless host can have one without the other.
 *
 * ── UNITS, AND WHY THEY ARE INTEGERS ─────────────────────────────────────────
 * abcjs accumulates time as WHOLE NOTES SCALED BY A MILLION and rounds at every step —
 * `timeCounter += Math.round(thisDuration * tempoMultiplier * 1000000)` — with the comment
 * "To compensate for JS rounding problems, do all intermediate calcs on integers". Its
 * goldens carry the result of that: a triplet eighth is `0.083333` and the third of them
 * is `0.083334`, which is a rounded integer accumulator and not a rational. Reproducing
 * the accumulator is the only way to reproduce those figures, so it is reproduced exactly.
 */

import {
  type KeySignature,
  keyFifths,
  type Meter,
  type MusicEvent,
  type Rational,
  ratToNumber,
  type Score,
  stepIndex,
  type Tempo,
  type Clef,
  type Voice,
} from '../core/model.js'
import { ABCJS_PERC_NOTE_NAMES } from '../renderer/abcjs-constants.js'
import { type ChordOptions, ChordTrack } from './chord-track.js'

/** One `{cmd: 'note'}` row, exactly as abcjs's flattener emits it. */
export interface MidiNote {
  readonly cmd: 'note'
  readonly pitch: number
  readonly volume: number
  readonly start: number
  readonly duration: number
  readonly instrument: number
  readonly gap: number
  readonly endType?: string
  readonly style?: string
  readonly cents?: number
}

export interface MidiProgram {
  readonly cmd: 'program'
  readonly channel: number
  readonly instrument: number
}

export interface MidiText {
  readonly cmd: 'text'
  readonly type: string
  readonly text: string
}

export type MidiEvent = MidiNote | MidiProgram | MidiText

export interface FlatAudio {
  readonly tempo: number
  readonly instrument: number
  readonly totalDuration: number
  readonly tracks: readonly (readonly MidiEvent[])[]
  /**
   * WHAT THE FLATTENER WRITES BACK ONTO THE SOURCE — abcjs's `elem.elem.currentTrackMilliseconds`
   * and `elem.elem.midiPitches` (`abc_midi_flattener.js:526-576`).
   *
   * It is a THIRD surface over the same walk, and the one the playback CURSOR reads: the
   * event table says what sounds, `setTiming` says when the clock is at, and this says which
   * WRITTEN note is lit. **A note reached twice through a repeat carries both times** — a
   * number becomes an array the moment a second, different value arrives, and duplicates
   * from other voices are dropped. That asymmetry is abcjs's shape and not a convenience.
   *
   * Keyed by the source event OBJECT, which survives `resolveRepeats` unchanged — the same
   * identity `writtenTimeline` files tempo changes under.
   */
  readonly elementTimings: ReadonlyMap<MusicEvent, ElementTiming>
}

export interface ElementTiming {
  /** Milliseconds, in the order the element was reached. One entry for a note played once. */
  readonly milliseconds: readonly number[]
  /** The same instants in WHOLE NOTES — abcjs's `currentTrackWholeNotes`, stamped beside. */
  readonly wholeNotes: readonly number[]
  /** The sounding pitches, bottom-up. Empty for a rest and for a tie's silent half. */
  readonly pitches: readonly number[]
  /**
   * `elem.elem.midiPitches` — **THE VERY NOTE OBJECTS THAT GO INTO THE TRACK**, which is
   * why the `gap` an element gets AFTER it is pushed is visible here too
   * (`abc_midi_flattener.js:589-611`: one object, pushed to both).
   *
   * **AND IT IS RESET ON EVERY VISIT** — `elem.elem.midiPitches = []` runs each time the
   * element is written, so an element reached twice through a repeat keeps only the LAST
   * pass, where `currentTrackMilliseconds` keeps both. Two fields, two rules.
   *
   * abcjs's own carry `startChar`/`endChar` off the `tune.lines` element; those are added
   * where the projection is, in `src/compat/`, because only that side knows the span.
   */
  readonly notes: readonly MidiNote[]
}

export interface AudioOptions {
  /** Overrides the tune's `Q:` outright — abcjs's `options.qpm`. */
  readonly qpm?: number
  /** Used only when the tune has no `Q:` at all. */
  readonly defaultQpm?: number
  readonly program?: number
  readonly channel?: number
  readonly midiTranspose?: number
  /** Every voice, or the listed voice indices, silenced to volume 0 rather than dropped. */
  readonly voicesOff?: boolean | readonly number[]
  /** `chordsOff` — the guitar-chord track is suppressed entirely, symbols and all. */
  readonly chordsOff?: boolean
  /**
   * THE CHORD-TRACK SETTINGS, SUPPLIED BY THE HOST rather than by the tune.
   *
   * abcjs folds them into `midiOptions` at the top of `flatten()` — `if (options.bassprog
   * !== undefined && !midiOptions.bassprog) midiOptions.bassprog = [options.bassprog]`
   * (`abc_midi_flattener.js:95-105`) — so a `%%MIDI bassprog` in the tune WINS and the
   * option is only a default. Five of them, and they are scalars where the `%%MIDI` form is
   * an array, which is what the wrapping is for.
   */
  readonly bassprog?: number
  readonly bassvol?: number
  readonly chordprog?: number
  readonly chordvol?: number
  readonly gchord?: string
  /**
   * THE DRUM TRACK, SUPPLIED BY THE HOST — and unlike the chord settings above, the tune's
   * `%%MIDI` does not merely default them, it REPLACES them: the sequencer reads
   * `options.drum` into `drumPattern` and then overwrites it wholesale with
   * `if (globals.drum) drumPattern = globals.drum` (`abc_midi_sequencer.js:28-31, 86-92`).
   *
   * `drum` is one space-separated string here where `%%MIDI drum` is already an array, and
   * abcjs splits it and NEVER PARSES THE TOKENS — so a host-supplied pattern writes its
   * pitch and volume out as STRINGS, `"pitch":"76"`, where the tune's own writes numbers.
   *
   * `drumOn` is the one thing a pattern DOES imply here: `drumOn = drumPattern !== ""` is
   * computed off the option, before the tune is read. A tune that writes `%%MIDI drum …`
   * and no `drumon` is silent; a host that passes `drum` is not.
   */
  readonly drum?: string
  readonly drumBars?: number
  /** The COUNT-IN, in whole measures. See `spliceDrumIntro`. */
  readonly drumIntro?: number
  /** The drums stop once the count-in is over. Nothing in `%%MIDI` corresponds to it. */
  readonly drumOff?: boolean
  /**
   * A CHORD'S PITCHES IN SOURCE ORDER RATHER THAN SORTED — and this is not a preference,
   * it is which abcjs ENTRY POINT is being reproduced.
   *
   * `[cD]` sounds D then c and `[gF]` sounds 42 then 36 — low-then-high in the first and
   * high-then-low in the second — and for a long time only the first was known, recorded
   * here as "abcjs sorts `elem.pitches`". **It is the ENGRAVER that sorts them, not the
   * parser**, because a chord's noteheads have to stack in pitch order to be drawn.
   *
   * So the order depends on whether the tune was LAID OUT. `flattener.test.js` calls
   * `renderAbc` and then `setUpAudio`, so its 54 cases are sorted; `getMidiFile` on a STRING
   * goes through `renderEngine(callback, "*", …)`, which parses without engraving, so its
   * chords keep source order. Both oracles are right about their own path, and `midi-drums`
   * is where they disagree — measured by instrumenting `abc_midi_create.js`, whose own
   * `setUpAudio` returns `[[42,0],[36,0]]` where a RENDERED dump of the same tune returns
   * `[36, 42]`.
   *
   * Default false: ours is the laid-out answer, because that is what the 54 audio cases
   * assert and what a host playing a rendered score wants. `midiFile()` sets it.
   */
  readonly chordsInSourceOrder?: boolean
}

/** `%%MIDI` settings gathered off the tune — abcjs's `tune.formatting.midi`. */
export interface MidiDirectives extends ChordOptions {
  readonly program?: readonly number[]
  readonly channel?: readonly number[]
  readonly transpose?: readonly number[]
  /** `%%MIDI drum dddd 76 77 77 77 50 50 50 50` — MIXED, so it is kept raw. */
  readonly drum?: readonly (string | number)[]
  /** Present-or-absent, and abcjs tests it as `if (globals.drumon)` — `[]` is truthy. */
  readonly drumon?: readonly (string | number)[]
  readonly drumbars?: readonly (string | number)[]
}

const MICRO = 1000000

/** abcjs's `PERCUSSION_PROGRAM` — GM has 128 melodic programs, so this is "the drum kit". */
const PERCUSSION_PROGRAM = 128
const PERCUSSION_CHANNEL = 10

/** abcjs's `scale` — semitones above the tonic for each diatonic step. */
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]

/**
 * abcjs's `accentPseudonyms` and `accentDynamicPseudonyms` (`parse/abc_parse_settings.js`).
 *
 * abcjs canonicalises a decoration IN THE PARSER; our parser keeps the source spelling, so
 * the audio side resolves it. Both are defensible and this is where the difference is paid.
 */
const DECORATION_ALIAS: Readonly<Record<string, string>> = {
  '<': 'accent',
  '>': 'accent',
  tr: 'trill',
  plus: '+',
  emphasis: 'accent',
  '^': 'umarcato',
  marcato: 'umarcato',
  '<(': 'crescendo(',
  '<)': 'crescendo)',
  '>(': 'diminuendo(',
  '>)': 'diminuendo)',
}

const canonical = (d: string): string => DECORATION_ALIAS[d] ?? d

/**
 * A DYNAMIC IS A STRESS TABLE, not a volume. abcjs's `setDynamics` replaces the three
 * beat-stress figures outright — bar-first, on-beat, off-beat — so `!p!` makes the whole
 * passage quieter WITHOUT flattening its accents (`abc_midi_sequencer.js:422-433`).
 *
 * Tested one way round only, so the ORDER of the tests is load-bearing: abcjs asks for
 * `pppp` first and `ffff` last, but its `ff`/`fff`/`ffff` arms are unreachable — `f` is
 * tested before them and `indexOf('f')` matches nothing else in the list, so `!ff!` takes
 * the `f` row. Reproduced, because a strict-mode engine reproduces the bug: `flatten-
 * dynamics3` expects 105/95/80 where `!ffff!` is written.
 */
const DYNAMIC_ORDER = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff']
const DYNAMIC_VOLUMES: Readonly<Record<string, readonly [number, number, number]>> = {
  pppp: [15, 10, 5],
  ppp: [30, 20, 10],
  pp: [45, 35, 20],
  p: [60, 50, 35],
  mp: [75, 65, 50],
  mf: [90, 80, 65],
  f: [105, 95, 80],
  ff: [120, 110, 95],
  fff: [127, 125, 110],
  ffff: [127, 125, 110],
}

/** `crescendoSize` — how far a hairpin moves the stress table, before it is divided up. */
const CRESCENDO_SIZE = 50

/** The order sharps and flats are added to a key signature. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] // f c g d a e b
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] // b e a d g c f

/**
 * The gaps abcjs leaves after a note, and its own words for them.
 *
 * The first two are in SECONDS and the third is a FRACTION of the duration — a difference
 * that matters, because the staccato one is then converted with the tempo
 * (`startingTempo / 60 * d`) and the other two are not.
 */
const NORMAL_GAP = 0
const SLURRED_GAP = -0.001
const STACCATO_FRACTION = 0.4

/** abcjs's `getBeatFraction` — the note that gets a beat, given the meter. */
function beatFractionOf(meter: Meter): number {
  switch (meter.denominator) {
    case 2:
      return 0.5
    case 4:
      return 0.25
    case 8:
      return meter.numerator % 3 === 0 ? 0.375 : 0.125
    case 16:
      return 0.125
    default:
      return 0.25
  }
}

/**
 * `Tune.getBeatLength` — NOT the same thing as `getBeatFraction`, and both are used.
 *
 * This one only ever divides the tempo: `interpretTempo` turns `Q:1/2=60` into a
 * quarter-note qpm through it. A 6/8 tune counts in dotted quarters, so its beat is
 * `3/8`; an irregular 5/8 or 7/8 counts in `2/8`.
 */
function beatLengthOf(meter: Meter | null): number {
  if (meter === null) return 0.25
  const { numerator: num, denominator: den } = meter
  let multiplier = 1
  if (num === 6 || num === 9 || num === 12) multiplier = 3
  else if (num === 3 && den === 8) multiplier = 3
  else if (den === 8 && (num === 5 || num === 7)) multiplier = 2
  return multiplier / den
}

/** Semitone alteration per diatonic step index, from the key's position on the circle. */
function keyAccidentals(key: KeySignature): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0]
  const fifths = keyFifths(key)
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER
  /**
   * ⚠️ **A `K:` MODIFIER REPLACES THE KEY'S OWN ACCIDENTAL ON THAT LETTER — IT DOES NOT ADD
   * TO IT.** The replacement happens in the PARSER: a field accidental "REPLACES a standard
   * accidental on the same letter or appends" (`abc_parse_key_voice.js:320-350`), so by the
   * time `setKeySignature` walks the list with its `accidentals[note] += d` there are no
   * duplicate letters left for the `+=` to double.
   *
   * We summed the two steps instead: C minor's three flats, then `=B`'s natural ADDED to
   * the B flat — `-1 + 0` is still flat. `K:C m=B` is C harmonic minor and its B is
   * NATURAL: abcjs sounds 71 where we sounded 70, an audible wrong note on
   * `abcts-key-modifiers`.
   *
   * abcjs's own list for `K:C m=B` is `[natural B, flat e, flat A]` — asked, not reasoned —
   * which is the replacement already done.
   */
  const replaced = new Set<number>()
  for (const extra of key.extra ?? []) {
    const step = stepIndex(extra.step)
    if (step >= 0) replaced.add(step)
  }
  for (let i = 0; i < Math.abs(fifths); i += 1) {
    const step = order[i]
    if (step !== undefined && !replaced.has(step)) out[step] = fifths >= 0 ? 1 : -1
  }
  // `K:… ^f _b` and the like ADD to the signature they follow — abcjs's `setKeySignature`
  // does `accidentals[note] += d`, not `=`. And a QUARTER tone is **0.25**, not 0.5:
  // `switch (acc.acc) { case "quarterflat": d = -0.25; case "quartersharp": d = 0.25 }`
  // (`abc_midi_flattener.js:676-682`). That looks like a bug — a quarter tone is half a
  // semitone, not a quarter — and it is not: the fraction is a MARKER. `adjustForMicroTone`
  // tests the pitch's decimal for `.25` or `.75` and turns it into a whole pitch plus a
  // ±50-cent bend, and only 0.25 lands unambiguously on one or the other. A 0.5 would put a
  // half-sharp above C and a half-flat below D on the same 60.5 and lose the direction.
  for (const extra of key.extra ?? []) {
    const step = stepIndex(extra.step)
    if (step >= 0) {
      out[step] =
        (out[step] ?? 0) + (extra.quarters % 2 === 0 ? extra.quarters / 2 : extra.quarters / 4)
    }
  }
  return out
}

/**
 * THE REPEAT RESOLVER — abcjs's `synth/repeats.js`, in MEASURES rather than elements.
 *
 * Two passes. The first records only the INTERESTING bars into `sections`, seeded with a
 * `startRepeat` at -1 so a `:|` with no `|:` before it repeats from the start of the tune.
 * The second folds those into `{common, endings[]}` spans and emits them.
 *
 * THE EMIT RULE IS THREE CASES and they are not the same shape: no `endings` at all copies
 * the common span ONCE; an EMPTY `endings` copies it TWICE — that is a plain `|: … :|`;
 * a non-empty `endings` copies the common span and then that ending, once per ending.
 *
 * AND THE `endings` ARRAY IS SPARSE, indexed by the ENDING NUMBER rather than packed. That
 * is what makes `|1,3` and `|2,4` interleave: `|1,3` fills slots 1 and 3 with the same span
 * and `|2,4` fills 2 and 4, so walking the array in index order gives the four passes in the
 * right order. Packing it would give 1,3,2,4.
 *
 * TWO `:|` IN A ROW is a notation error and abcjs recovers by pretending there was a
 * `startRepeat` immediately before the second — `no-start-repeat-repeat` is that tune.
 */
interface Section {
  readonly type: 'startRepeat' | 'endRepeat' | 'startEnding'
  readonly index: number
  readonly endings?: readonly number[]
}

/** `"1"`, `"1,3"`, `"1-3"` — anything that is not a number at all is skipped. */
function endingNumbers(volta: string): number[] {
  const nums: number[] = []
  if (volta.includes(',')) {
    for (const part of volta.split(',')) {
      const n = Number.parseInt(part, 10)
      if (n > 0) nums.push(n)
    }
  } else if (volta.indexOf('-') > 0) {
    const [a, b] = volta.split('-')
    const from = Number.parseInt(a ?? '', 10)
    const to = Number.parseInt(b ?? '', 10)
    for (let i = from; i <= to; i += 1) if (i > 0) nums.push(i)
  } else {
    const n = Number.parseInt(volta, 10)
    if (n > 0) nums.push(n)
  }
  return nums
}

function resolveRepeats<
  M extends {
    readonly openingBarline: unknown
    readonly closingBarline: unknown
    readonly volta: string | null
  },
>(measures: readonly M[]): readonly M[] {
  // INDEXED BY BARLINE, NOT BY MEASURE, and that is the whole of the translation. abcjs
  // records a bar ELEMENT's position; bar k sits between measure k-1 and measure k, so a
  // section that STARTS there starts at measure k and one that ENDS there ends at k-1. One
  // bar is a `::` — an end AND a start — which is exactly why abcjs handles them in that
  // order on a single element, and why iterating measures instead of bars puts a volta's
  // `startEnding` after the `endRepeat` of the same measure and unrolls the wrong span.
  const lastIndex = measures.length - 1
  const sections: Section[] = [{ type: 'startRepeat', index: 0 }]
  for (let k = 1; k <= measures.length; k += 1) {
    const before = measures[k - 1]
    const after = measures[k]
    const closes = before?.closingBarline === 'repeatEnd' || before?.closingBarline === 'repeatBoth'
    // A `|:` WRITTEN AFTER A MEASURE IS THAT MEASURE'S CLOSING BARLINE IN OUR MODEL, and
    // it still OPENS a repeat. Only a `|:` at the head of a source line becomes the next
    // measure's `openingBarline`; `D4 |: E4` puts it on `D4`'s close, so testing
    // `openingBarline` alone missed it entirely and `flatten-rep-and-over` repeated
    // `D E F` where abcjs repeats `E F`. One bar element in abcjs, two fields here.
    const opens =
      after?.openingBarline === 'repeatStart' ||
      after?.openingBarline === 'repeatBoth' ||
      before?.closingBarline === 'repeatStart' ||
      before?.closingBarline === 'repeatBoth'
    if (closes) {
      // Two `:|` in a row is a notation error; abcjs recovers by pretending there was a
      // `startRepeat` right before the second. `no-start-repeat-repeat` is that tune.
      const last = sections[sections.length - 1]
      if (last !== undefined && last.type === 'endRepeat') {
        sections.push({ type: 'startRepeat', index: last.index })
      }
      sections.push({ type: 'endRepeat', index: k })
    }
    if (opens) sections.push({ type: 'startRepeat', index: k })
    if (after?.volta != null) {
      const endings = endingNumbers(after.volta)
      if (endings.length > 0) sections.push({ type: 'startEnding', index: k, endings })
    }
  }

  /**
   * **A TRAILING SECTION OF ANY KIND NEEDS A SYNTHETIC `startRepeat` AFTER IT** —
   * `else if (lastSection.index+1 < lastElement) sections.push({type:"startRepeat",
   * index: lastSection.index+1})`, guarded only by the last section not already BEING a
   * `startRepeat` (`synth/repeats.js:29-33`). abcjs's `index+1` is the element after the
   * bar, which in measures is the section's own index.
   *
   * **IT WAS NARROWED TO `endRepeat` ONCE AND THAT WAS HALF A FIX.** Firing it on a final
   * `startEnding` made the last ending's measures come out TWICE — but only because the
   * emitter then filled the ending's missing `end` with `lastIndex`. abcjs leaves it
   * UNDEFINED and `duplicateSpan`'s `for (i = start; i <= undefined; i++)` runs zero
   * times, so the pass has no ending at all. The two halves are one rule; with both in
   * place `CDE|:FG[Ab]|1 Bcd:|2 efg|]` plays `efg` once, and `|:CDE|1,3FGA:|2,4cde|]`
   * plays abcjs's `CDE FGA · CDE · CDE FGA · CDE cde` — seven bars, not eight.
   */
  const lastSection = sections[sections.length - 1]
  if (
    lastSection !== undefined &&
    lastSection.type !== 'startRepeat' &&
    lastSection.index <= lastIndex
  ) {
    sections.push({ type: 'startRepeat', index: lastSection.index })
  }
  if (sections.length < 2) return measures

  interface Repeat {
    common: { start: number; end?: number }
    endings?: ({ start: number; end?: number } | undefined)[]
  }
  const instructions: Repeat[] = []
  let current: Repeat | null = null
  sections.forEach((section, i) => {
    switch (section.type) {
      case 'startRepeat': {
        if (current !== null) {
          if (current.common.end === undefined) current.common.end = section.index - 1
          for (const e of current.endings ?? []) {
            if (e !== undefined && e.end === undefined && e.start !== section.index) {
              e.end = section.index - 1
            }
          }
          // A trailing `:|` after endings means one more bare pass of the common span.
          if (
            sections[i - 1]?.type === 'endRepeat' &&
            current.endings !== undefined &&
            current.endings.length > 0
          ) {
            current.endings[current.endings.length] = { start: -1, end: -1 }
          }
          instructions.push(current)
          // **AN UNRESOLVED ENDING POISONS THE GAP TEST, AND THAT IS abcjs's ANSWER.**
          // `lastUsed = Math.max(lastUsed, ending.end)` over an `undefined` end is NaN, and
          // `NaN < section.index - 1` is FALSE — so no gap span is inserted at all. A `?? -1`
          // here would invent one.
          let lastUsed: number = current.common.end ?? -1
          for (const e of current.endings ?? []) {
            if (e !== undefined) lastUsed = e.end === undefined ? Number.NaN : Math.max(lastUsed, e.end)
          }
          if (lastUsed < section.index - 1) {
            instructions.push({ common: { start: lastUsed + 1, end: section.index - 1 } })
          }
        }
        current = { common: { start: section.index } }
        break
      }
      case 'startEnding': {
        if (current !== null) {
          if (current.common.end === undefined) current.common.end = section.index - 1
          if (current.endings === undefined) current.endings = []
          for (const n of section.endings ?? []) current.endings[n] = { start: section.index }
        }
        break
      }
      case 'endRepeat': {
        if (current !== null) {
          if (current.endings === undefined) current.endings = []
          if (current.endings.length > 0) {
            for (const e of current.endings) {
              if (e !== undefined && e.end === undefined) e.end = section.index - 1
            }
          }
          if (current.common.end === undefined) current.common.end = section.index - 1
        }
        break
      }
    }
  })
  if (current !== null) {
    const c = current as Repeat
    if (c.common.end === undefined) c.common.end = lastIndex
    for (const e of c.endings ?? []) {
      if (e !== undefined && e.end === undefined) e.end = lastIndex
    }
    instructions.push(c)
  }

  const out: M[] = []
  const span = (from: number, to: number): void => {
    for (let i = Math.max(0, from); i <= to; i += 1) {
      const m = measures[i]
      if (m !== undefined) out.push(m)
    }
  }
  for (const r of instructions) {
    const end = r.common.end ?? lastIndex
    if (r.endings === undefined) span(r.common.start, end)
    else if (r.endings.length === 0) {
      span(r.common.start, end)
      span(r.common.start, end)
    } else {
      for (const ending of r.endings) {
        if (ending === undefined) continue
        span(r.common.start, end)
        // …AND AN ENDING WITH NO `end` EMITS NOTHING. `duplicateSpan`'s
        // `for (i = start; i <= end; i++)` with `end === undefined` runs zero times
        // (`synth/repeats.js:165`), so the pass takes the common span alone.
        if (ending.start >= 0 && ending.end !== undefined) span(ending.start, ending.end)
      }
    }
  }
  return out
}

interface Timed {
  /**
   * `bar` rows carry NO event and exist only so a decoration written before a barline can
   * still be found. abcjs's `numNotesToDecoration` walks every element and tests
   * `voice[i].decoration` on all of them, counting only the notes — so a `!<)!` written at
   * the end of a bar, which BOTH engines attach to the barline rather than to the next
   * note, still closes the hairpin. Probed on `flatten-dynamics2`: abcjs logs
   * `["crescendo)"] el bar`. Leave the bars out and the search runs off the end of the
   * tune, `floor(50 / 51)` is 0, and the whole crescendo is flat.
   */
  readonly kind: 'note' | 'bar' | 'midi'
  /**
   * A `%%MIDI` written inside the music, standing at the head of the measure it was
   * written in — abcjs's own `el_type: 'midi'` element, at its position in the stream.
   *
   * Its own ROW rather than a field on the first note, because a measure need not have
   * one: `%%MIDI drumoff` on a line of its own, between two music lines, has to take
   * effect whether or not anything sounds after it.
   */
  readonly midi?: readonly { readonly cmd: string; readonly params: readonly (string | number)[] }[]
  /**
   * The SOURCE LINE this row is on, and it is load-bearing for hairpins.
   *
   * abcjs sequences line by line — its `voice` is `abcLine.staff[j].voices[v]` — so
   * `numNotesToDecoration` and `endingVolume` can only see the line they were called on.
   * Measured on `flatten-dynamics`: a `!diminuendo(!` in the last bar of one line reaches
   * its `!diminuendo)!` but NOT the `!pppp!` two elements later, because that is the first
   * note of the next line and simply is not in the array. Searching the whole tune found
   * it, took the target from 76 to 15 and the step from -8 to -16, and put every note of
   * the passage 8 too quiet.
   */
  readonly line: number
  readonly decorations: readonly string[]
  readonly event: MusicEvent | null
  /** Whole notes × 1,000,000, accumulated as an integer exactly as abcjs does. */
  readonly time: number
  /** True on the first event of a measure — where the beat-stress clock restarts. */
  readonly barStart: boolean
  readonly key: KeySignature
  readonly meter: Meter | null
  /** Sounding duration in whole notes, with a tie's continuation already folded in. */
  readonly duration: number
  /** `startingTempo / qpm` in force here — a `[Q:]` stretches durations, not the tempo. */
  readonly factor: number
  /** Semitones the CLEF adds, which replaces the voice's transpose rather than adding. */
  readonly clefTranspose: number
  /** A tie's continuation, silenced: it was folded into the note that opened the tie. */
  readonly tiedOver: boolean
  /**
   * **A CHORD TIES PER HEAD, SO ITS DURATIONS ARE PER HEAD TOO.** abcjs resolves ties on
   * the PITCH — `ties[pitch.pitch]` keyed by MIDI number, `pitches[k].duration += dur` and
   * the later pitch NULLED (`abc_midi_flattener.js:287-316`) — so `[C-EG-] [CEG]` sounds a
   * half-note C and G under a re-articulated E. The whole-event `tiedOver` cannot say that.
   *
   * Written duration ADDED to this head, keyed by the head's own name; absent means the
   * event's own. `silenced` is the other half: a head that was folded into an earlier one.
   */
  readonly tieExtra?: Map<string, number>
  readonly tieSilenced?: Set<string>
}

/**
 * Walk one voice into a flat, timed list — abcjs's `sequence()` plus its `preProcess()`.
 *
 * TIES ARE RESOLVED HERE, and abcjs resolves them by MOVING THE DURATION: the note that
 * opens the tie grows by the tied note's duration and the tied note is deleted outright
 * (`preProcess`, `voice[ties[…]].pitches[…].duration += pitch.duration; element.pitches[k]
 * = null`). So a tie makes ONE longer event, not two joined ones, and three notes tied
 * together make one event of the whole length.
 *
 * The repeats ARE unrolled here (`resolveRepeats`) and the `&` overlays are split out
 * before this runs (`overlayVoices`). This note used to defer both, on the grounds that
 * neither could be steered before the ranked table existed. It existed; they were.
 */
/**
 * THE WRITTEN TIMELINE — every event's duration and its position in the SOURCE, before a
 * repeat is unrolled and before any tempo is applied.
 *
 * abcjs's `durationCounter[voiceNumber]`, and it exists for one reason: it is the KEY a
 * tempo change is filed under. `insertTempoChanges` matches a note to a change by
 * `el.timing`, so the position has to be the one the note was WRITTEN at — a note reached
 * for the second time through a repeat carries its first pass's timing, which is how a
 * `:|` back to the head restores the opening tempo.
 *
 * Keyed by the measure OBJECT, which survives `resolveRepeats` unchanged: the same measure
 * met twice looks up the same original position, exactly as abcjs's copied elements carry
 * their original `timing`.
 */
interface WrittenTimeline {
  readonly durationsOf: Map<object, number[]>
  readonly positionOf: Map<object, number>
}

function writtenTimeline(voice: Voice): WrittenTimeline {
  const durationsOf = new Map<object, number[]>()
  const positionOf = new Map<object, number>()
  let written = 0
  let tripletGroup: number | null = null
  let tripletTotal = 0
  let tripletCount = 0
  const round6 = (x: number): number => Math.round(x * MICRO) / MICRO

  for (const measure of voice.measures) {
    positionOf.set(measure, written)
    const durations: number[] = []
    for (const [index, event] of measure.events.entries()) {
      // A SPACER SOUNDS NOTHING, TAKES NO TIME — AND STILL COUNTS.
      //
      // `y` is skipped where the sequence is BUILT — `if (!elem.rest || elem.rest.type
      // !== 'spacer')` (`abc_midi_sequencer.js:246`) — so it neither sounds nor advances
      // the clock, and letting it take its written duration put every note after
      // `!<)!y!ffff!B` a quarter late. But `setDynamics(elem)` is called on the line ABOVE
      // that guard, and `numNotesToDecoration` walks the RAW voice where the spacer is
      // still an `el_type: "note"` — so a hairpin written on a `y` closes there and the
      // spacer is one of the notes the step is divided by. Dropping it outright made
      // `flatten-dynamics3`'s crescendo run to the end of the line instead of to the `y`,
      // 28 per note against 14.
      const spacer = event.type === 'rest' && event.kind === 'spacer'
      // A MULTI-MEASURE REST IS AS LONG AS IT SAYS. `Z4` is four BARS of silence, and its
      // written duration is one bar — abcjs multiplies by `measureLength` where we carried
      // the single bar through, so everything after it on `flatten-multi-measure-rest` ran
      // three whole notes early.
      const bars =
        event.type === 'rest' &&
        (event.kind === 'multiMeasure' || event.kind === 'invisibleMultiMeasure')
          ? (event.measureCount ?? 1)
          : 1
      /**
       * A TRIPLET'S LAST NOTE IS THE REMAINDER, NOT A THIRD — and that is the whole of the
       * `0.083333` vs `0.083334` on the table.
       *
       * abcjs rounds every duration to a MILLIONTH, so three notes of `1/6` come to
       * `0.500001` and the bar drifts. Its answer (`abc_midi_sequencer.js:253-277`) is to
       * work out the group's total ONCE at the opening note —
       * `startTriplet * tripletMultiplier * elem.duration` — accumulate the rounded
       * durations as it goes, and give the LAST note whatever is left. So the group is
       * exact and one note of it is a millionth off, rather than the group being three
       * millionths off. WHICH note is short depends on the fraction: `(3 C2` under `L:1/8`
       * gives 0.166667 twice and 0.166666 last, and `(3 C` gives 0.083333 twice and
       * 0.083334 last.
       *
       * ⚠️ **AND `(p:q:r` WITH `r < p` NEVER ENDS IN ABCJS — MEASURED, NOT PORTED.**
       * `abcts-ledger-gaps` tune 1 is `(3:2:1 ABC D2 E2` at `L:1/8`, and abcjs sounds ALL
       * FIVE notes at two thirds: 0.083333 × 3 then 0.166667 × 2. The mechanism is one
       * `if`: `tripletNotesLeft = num_notes` makes the group ONE note, so that note carries
       * BOTH `startTriplet` and `endTriplet` — and `if (elem.startTriplet)` wins the
       * if/else, so the `endTriplet` arm that clears `tripletMultiplier` never runs
       * (`abc_midi_sequencer.js:253-277`). The multiplier is then applied to every element
       * to the end of the voice. Its `startTriplet !== tripletR` branch — the sum of the
       * first `r` written durations — only feeds the remainder that arm would have used, so
       * it is unreachable here too.
       *
       * Ours scales the r notes at PARSE time, so the first note agrees and every note
       * after it is unscaled: 0.083333 then 0.125 × 2 then 0.25 × 2. Reproducing the leak
       * means running abcjs's state machine over the voice at sequence time — the durations
       * here are already tuplet-scaled — which is a change to WHERE tuplets are resolved,
       * for a shape neither corpus writes. Written down rather than half-done; the object,
       * the SVG and the timings are byte-exact on that tune either way.
       */
      const tuplet = event.tuplet
      let dur = spacer ? 0 : ratToNumber(event.duration) * bars
      if (tuplet !== null) {
        if (tuplet.group !== tripletGroup) {
          tripletGroup = tuplet.group
          const notated = ratToNumber(event.notatedDuration)
          const multiplier = notated === 0 ? 1 : ratToNumber(event.duration) / notated
          tripletTotal = tuplet.number * multiplier * notated
          dur = round6(dur)
          tripletCount = dur
        } else if (measure.events[index + 1]?.tuplet?.group === tuplet.group) {
          dur = round6(dur)
          tripletCount += dur
        } else {
          dur = round6(tripletTotal - tripletCount)
          tripletGroup = null
        }
      }
      durations.push(dur)
      written += dur
    }
    durationsOf.set(measure, durations)
  }
  return { durationsOf, positionOf }
}

/**
 * A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE, and that is a whole pass of its own.
 *
 * `insertTempoChanges` (`abc_midi_sequencer.js:569-592`) collects every `[Q:]` in the tune
 * into one table keyed by WRITTEN POSITION, then walks each voice and splices a `tempo`
 * element into it at every element whose `timing` matches. Its own comment says why it
 * cannot be done inline: "all the elements in all the voices need to be created first."
 *
 * `flatten-tempo-3-voices` is three voices changing tempo at four different bars, and the
 * top voice — which writes exactly ONE `[Q:]` of its own — takes all four.
 *
 * TWO CONSEQUENCES that only fall out of the position keying:
 *
 * - the table is seeded with `{0: <tune qpm>}`, so a `:|` back to the head meets position 0
 *   again and RESTORES the opening tempo. abcjs says so where it seeds `lastTempo`: "don't
 *   insert redundant changes… this happens normally when repeating from the beginning".
 * - a change is filed under a position, not a voice, so two voices changing at the same
 *   position leave whichever was written LAST in force for all of them.
 */
function collectTempoChanges(
  voices: readonly Voice[],
  score: Score,
  startingTempo: number,
): Map<number, number> {
  const changes = new Map<number, number>([[0, startingTempo]])
  for (const voice of voices) {
    const { positionOf } = writtenTimeline(voice)
    let meter = score.meter
    for (const measure of voice.measures) {
      if (measure.meterChange !== null) meter = measure.meterChange
      if (measure.tempoChange == null) continue
      const qpm = qpmOfTempo(measure.tempoChange, meter)
      changes.set(positionOf.get(measure) ?? 0, qpm)
    }
  }
  return changes
}

/**
 * **THE CLEF BELONGS TO THE STAFF, AND EVERY VOICE ON IT TAKES THE OCTAVE.** abcjs reads
 * `staff.clef` — `if (staff.clef.type.indexOf("+8") >= 0) push {el_type:'transpose',
 * transpose: 12}` (`abc_midi_sequencer.js:194-200`) — inside the per-VOICE loop, so a
 * second voice sharing the staff is transposed by a clef it never declared.
 *
 * We read `voice.clef`, which is only ever set on the voice that wrote it. Measured, one
 * variable per rung:
 *
 *     %%staves {(V1 V2)}, V1 clef=treble+8   abcjs 72,74,76,77 72,74,76,77   ours …,60,62,64,65
 *     %%staves {(V1) (V2)}, V1 clef=treble+8 both 72,74,76,77 60,62,64,65
 *
 * So it is not the clef octave that was missing — that works on its own on all five shapes
 * tried, and the flattener has carried it since `flatten-octave-clefs`. It is WHOSE clef.
 * `visual-tablature-15` and `visual-mouse-click-01` write
 * `%%staves {(PianoRightHand extra) (PianoLeftHand)}` with `clef=treble+8` on the first,
 * and `extra` sounded a whole octave below abcjs — an audible defect on channel 1.
 *
 * A voice in no group is its own staff, so this degrades to `voice.clef` and the
 * single-voice shapes are unmoved.
 */
const staffClefOf = (voice: Voice, score: Score): Clef | null => {
  const group = score.staves.find((g) => g.voiceIds.includes(voice.id))
  if (group === undefined) return voice.clef
  for (const id of group.voiceIds) {
    const clef = score.voices.find((v) => v.id === id)?.clef
    if (clef != null) return clef
  }
  return voice.clef
}

function sequenceVoice(
  voice: Voice,
  score: Score,
  startingTempo: number,
  tempoChanges: Map<number, number>,
): Timed[] {
  const out: Timed[] = []
  let time = 0
  /**
   * THE TEMPO CHANGE SCALES THE CLOCK, NOT THE NOTE. abcjs never restates the tempo — it
   * keeps the FIRST one and stretches every later duration by `startingTempo / qpm`, in
   * both `preProcess` and `flatten` (`abc_midi_flattener.js:148-151, 271`). So a
   * `[Q:1/4=129]` under a 180 default makes every quarter last `0.25 * 180/129`, and the
   * reported `tempo` stays 180.
   */
  let tempoFactor = 1
  /**
   * THE CLEF'S OCTAVE REPLACES THE VOICE'S TRANSPOSE, it does not add to it.
   *
   *     if (staff.clef.transpose) { push transpose: clef.transpose; active = false }
   *     if (clef.type has "-8") { push transpose: -12; active = true }
   *     else if (has "+8")      { push transpose:  12; active = true }
   *     else if (active)        { push transpose:   0; active = false }
   *
   * (`abc_midi_sequencer.js:190-211`.) They are separate `transpose` ELEMENTS and the
   * flattener's `case "transpose"` ASSIGNS — so a `clef=bass+8` on a voice declared
   * `octave=-2` sounds at +12, not at -12, and the `octave=` is simply overwritten for
   * that line. The `else if (active)` arm is what cancels a `+8` when a later line goes
   * back to a plain clef, and it cannot fire on a line whose clef carries its own
   * transpose, because that arm already cleared the flag.
   */
  let clefTranspose = 0
  let clefOctaveActive = false
  let line = -1
  let firstMeasure = true
  let key = score.key
  let meter = score.meter
  /**
   * `lastTempo` — abcjs's guard against a redundant change. A tempo is only applied when
   * it DIFFERS from the one already running, which is what makes a repeat back to the head
   * restore the opening tempo rather than being a no-op at an already-changed position.
   */
  let lastTempo = startingTempo
  const { durationsOf, positionOf } = writtenTimeline(voice)
  /** Open ties, keyed by written pitch, holding the index into `out` that owns them. */
  const ties = new Map<string, number>()
  const durations: number[] = []

  for (const measure of resolveRepeats(voice.measures)) {
    const measureDurations = durationsOf.get(measure) ?? []
    let written = positionOf.get(measure) ?? 0
    if (measure.startsSystem || line < 0) line += 1
    // THE DECLARED CLEF ARRIVES ONCE, NOT ON EVERY MEASURE OF LINE ONE. This read
    // `line === 0`, which is true for every measure of the first source line, so a
    // measure with no `[K:]` of its own re-applied the DEFAULT treble and cancelled the
    // octave a mid-line clef change had set. `flatten-octave-clefs` writes all five of its
    // bars on one line: `[K: treble-8]G8|` sounded an octave down and the very next bar,
    // which inherits it, did not — three notes a whole octave high, under a green gate for
    // every axis but the pitch. abcjs re-pushes the STAFF clef per line and a mid-line
    // `[K: clef=]` updates `multilineVars.clef`, so the octave carries.
    const clef =
      measure.clefChange ?? (firstMeasure ? (staffClefOf(voice, score) ?? score.clef) : null)
    firstMeasure = false
    if (clef != null) {
      if (clef.octaveShift !== 0) {
        clefTranspose = clef.octaveShift * 12
        clefOctaveActive = true
      } else if (voice.transpose !== 0) {
        // `V:… transpose=` is pushed as its own `transpose` element BEFORE the `±8` arm
        // and clears `clefTransposeActive` (`abc_midi_sequencer.js:190-193`), so a clef
        // octave beats it and a plain clef does not cancel it.
        clefTranspose = voice.transpose
        clefOctaveActive = false
      } else if (clefOctaveActive) {
        clefTranspose = 0
        clefOctaveActive = false
      }
    }
    if (measure.keyChange !== null) key = measure.keyChange
    if (measure.meterChange !== null) meter = measure.meterChange
    if (measure.midiCommands !== undefined) {
      out.push({
        kind: 'midi',
        line,
        decorations: [],
        event: null,
        time,
        barStart: false,
        key,
        meter,
        duration: 0,
        factor: tempoFactor,
        clefTranspose,
        tiedOver: false,
        midi: measure.midiCommands,
      })
      durations.push(0)
    }
    let first = true
    for (const [eventIndex, event] of measure.events.entries()) {
      // THE TEMPO IN FORCE IS LOOKED UP BY WRITTEN POSITION, not carried from the measure.
      // Every voice's `[Q:]` is in the same table, so this note may be re-timed by a change
      // written three staves below it — see `collectTempoChanges`.
      const change = tempoChanges.get(written)
      if (change !== undefined && change !== lastTempo) {
        lastTempo = change
        tempoFactor = change > 0 ? startingTempo / change : 1
      }
      const dur = measureDurations[eventIndex] ?? 0
      written += dur
      let tiedOver = false
      let silenced: Set<string> | undefined
      if (event.type === 'note') {
        const name = `${event.pitch.step}${event.pitch.octave}`
        const open = ties.get(name)
        if (open !== undefined) {
          durations[open] = (durations[open] ?? 0) + dur
          tiedOver = true
          ties.delete(name)
        }
        if (event.tiedToNext) ties.set(name, tiedOver ? (open as number) : out.length)
      } else if (event.type === 'chord') {
        /**
         * **A CHORD'S TIES ARE ONE PER HEAD** — see `VoiceItem.tieExtra`. The bookkeeping is
         * the note's, keyed by the head's own name rather than by the event, and it never
         * touches `durations`: a chord with SOME heads tied still sounds and still spends
         * its own time, and only the tied heads' note-offs move.
         *
         * `tiedToNext` is the whole-chord form (`[CEG]-`) and `tiedPitches` the partial one;
         * a head that closes a tie and opens another carries the duration forward, which is
         * the `open as number` arm the note path has.
         */
        const flags =
          event.tiedPitches ?? (event.tiedToNext ? event.pitches.map(() => true) : [])
        for (const [k, head] of event.pitches.entries()) {
          const name = `${head.step}${head.octave}`
          const open = ties.get(name)
          let carried = false
          if (open !== undefined) {
            const item = out[open]
            if (item !== undefined) {
              const extra = item.tieExtra ?? new Map<string, number>()
              extra.set(name, (extra.get(name) ?? 0) + dur)
              ;(item as { tieExtra?: Map<string, number> }).tieExtra = extra
            }
            ;(silenced ??= new Set()).add(name)
            carried = true
            ties.delete(name)
          }
          if (flags[k] === true) ties.set(name, carried ? (open as number) : out.length)
        }
        // …and a chord EVERY head of which was tied into is silent outright, which is what
        // the whole-event flag already says.
        tiedOver = silenced !== undefined && silenced.size === event.pitches.length
      }
      out.push({
        kind: 'note',
        line,
        decorations: event.decorations,
        event,
        time,
        barStart: first,
        key,
        meter,
        duration: dur,
        factor: tempoFactor,
        clefTranspose,
        tiedOver,
        ...(silenced === undefined ? {} : { tieSilenced: silenced }),
      })
      /**
       * ⚠️ **ONLY THE NOTE PATH MOVES THE DURATION, SO ONLY IT ZEROES THE CLOCK.** A chord
       * records its extension on the HEAD (`tieExtra`) and leaves `durations` alone, so a
       * chord tied into keeps its own place in time and simply sounds nothing — zeroing it
       * would take that time off the voice.
       */
      durations.push(tiedOver && event.type === 'note' ? 0 : dur)
      time += Math.round(dur * tempoFactor * MICRO)
      first = false
    }
    // A MEASURE BOUNDARY IS NOT ALWAYS A BARLINE. Our model closes a measure at a line
    // break whether or not a `|` was written; abcjs's voice carries a `bar` element only
    // where one actually is. Emitting one either way restarted the beat-stress clock at
    // every line end — `flatten-treble-8` writes one note per line with no barlines at all
    // and every one of them came out at the bar-first 105 instead of 85.
    if (measure.closingBarline === null) continue
    out.push({
      kind: 'bar',
      line,
      decorations: measure.closingBarlineDecorations ?? [],
      event: null,
      time,
      barStart: false,
      key,
      meter,
      duration: 0,
      factor: tempoFactor,
      clefTranspose,
      tiedOver: false,
    })
    durations.push(0)
  }
  return out.map((t, i) => ({ ...t, duration: durations[i] ?? t.duration }))
}

/**
 * THE DRUM TRACK — `%%MIDI drum`, and abcjs is DELIBERATELY BRITTLE about it.
 *
 * "Be very strict with the drum definition. If anything is not perfect, just turn the drums
 * off" (`abc_midi_flattener.js:760`). Three separate ways to fail closed, and each returns
 * the same `{on: false}` rather than a warning:
 *
 * - a pattern that does not START with `d` or `z`;
 * - a length suffix containing anything but `/` and digits;
 * - **and the arithmetic one** — `params.pattern.length !== totalPlay * 2 + 1`. The array is
 *   the pattern string, then one PITCH per `d`, then one VELOCITY per `d`, so `dddd` needs
 *   exactly eight numbers after it. Nine turns the drums off entirely.
 *
 * The parse is a small state machine over the string: a `d` or `z` opens an event, anything
 * else extends the one open. `d2` is two beats, `d/` is half of one (a bare slash reads as
 * `/2`), `d/4` a quarter. The lengths come out RELATIVE — `alignDrumToMeter` is what scales
 * them onto real time.
 */
interface DrumEvent {
  len: number
  readonly pitch: number | null
  readonly velocity?: number
}
interface DrumDefinition {
  readonly on: boolean
  readonly pattern: DrumEvent[]
}

const DRUM_OFF: DrumDefinition = { on: false, pattern: [] }

function normalizeDrumDefinition(
  params: readonly (string | number)[],
  on: boolean,
  beatLength: number,
): DrumDefinition {
  const str = params[0]
  if (params.length === 0 || !on || typeof str !== 'string') return DRUM_OFF

  const events: string[] = []
  let event = ''
  let totalPlay = 0
  for (const ch of str) {
    if (ch === 'd') totalPlay += 1
    if (ch === 'd' || ch === 'z') {
      if (event.length !== 0) {
        events.push(event)
        event = ch
      } else event += ch
    } else {
      // The string has to OPEN with a `d` or a `z`; a length suffix with nothing to
      // lengthen is one of the three ways abcjs fails closed.
      if (event.length === 0) return DRUM_OFF
      event += ch
    }
  }
  if (event.length !== 0) events.push(event)
  if (params.length !== totalPlay * 2 + 1) return DRUM_OFF

  const pattern: DrumEvent[] = []
  let playCount = 0
  for (const e of events) {
    let len = 1
    let div = false
    let num = 0
    for (const ch of e.slice(1)) {
      if (ch === '/') {
        if (num !== 0) len *= num
        num = 0
        div = true
      } else if (ch >= '0' && ch <= '9') {
        num = num * 10 + Number(ch)
      } else return DRUM_OFF
    }
    if (div) len /= num === 0 ? 2 : num
    else if (num !== 0) len *= num
    if (e[0] === 'd') {
      pattern.push({
        len: len * beatLength,
        pitch: params[1 + playCount] as number,
        velocity: params[1 + playCount + totalPlay] as number,
      })
      playCount += 1
    } else pattern.push({ len: len * beatLength, pitch: null })
  }
  return { on: true, pattern }
}

/**
 * `alignDrumToMeter` — the pattern's lengths are RELATIVE and this is what makes them time.
 *
 * Whatever the pattern adds up to, it is scaled to cover exactly `drumBars` measures of the
 * meter in force. So `dddd` and `dddddddd` both fill one 4/4 bar, at quarters and at
 * eighths. Called again on every meter change, and it is idempotent: after the first pass
 * the total already IS `drumBars * measuresPerBeat`, so the factor comes out 1.
 */
function alignDrumToMeter(def: DrumDefinition, drumBars: number, meter: Meter): void {
  if (def.pattern.length === 0) return
  const total = def.pattern.reduce((sum, p) => sum + p.len, 0)
  const factor = total / drumBars / (meter.numerator / meter.denominator)
  if (factor === 0) return
  for (const p of def.pattern) p.len /= factor
}

/**
 * `drumIntro` — THE COUNT-IN, AND ABCJS MAKES IT BY REWRITING THE MUSIC, not by moving a
 * clock. `abc_midi_sequencer.js:510-537` splices whole measures of rests onto the FRONT of
 * every voice, so everything downstream — `lastBarTime`, the chord track's bar boundaries,
 * `totalDuration`, and above all the drum's own "have we reached a full measure yet" guard —
 * shifts by construction rather than by a correction anyone has to remember to apply.
 *
 * Reproduced the same way: prepend the rows, shift the rest. Three details are abcjs's:
 *
 * - **The insertion point is the first NOTE**, not the head of the voice, so a `%%MIDI`
 *   written in the header still runs before the count-in.
 * - **The pickup comes out of the LAST intro measure**, and that measure gets no barline of
 *   its own — the pickup's own bar closes it. Without that the downbeat lands off the bar.
 * - **`drumOff` is a `drum` element spliced in after the rests**, which is why the intro
 *   still sounds: the bar that closes it is written before the element that turns it off.
 */
function spliceDrumIntro(
  timed: readonly Timed[],
  intro: number,
  measureLength: number,
  pickup: number,
  drumOff: boolean,
): Timed[] {
  const at = timed.findIndex((t) => t.kind === 'note')
  if (at < 0) return [...timed]
  const seed = timed[at] as Timed
  const row = (kind: Timed['kind'], time: number, duration: number): Timed => ({
    kind,
    line: -1,
    decorations: [],
    event: null,
    time,
    barStart: true,
    key: seed.key,
    meter: null,
    duration,
    factor: 1,
    clefTranspose: 0,
    tiedOver: false,
  })
  const rows: Timed[] = []
  let time = 0
  for (let w = 0; w < intro; w += 1) {
    const last = pickup !== 0 && w === intro - 1
    const length = last ? measureLength - pickup : measureLength
    rows.push(row('note', Math.round(time * MICRO), length))
    time += length
    if (!last) rows.push(row('bar', Math.round(time * MICRO), 0))
  }
  if (drumOff) {
    rows.push({ ...row('midi', Math.round(time * MICRO), 0), midi: [{ cmd: 'drumoff', params: [] }] })
  }
  const shift = Math.round(time * MICRO)
  return [
    ...timed.slice(0, at),
    ...rows,
    ...timed.slice(at).map((t) => ({ ...t, time: t.time + shift })),
  ]
}

/**
 * `&` OVERLAY VOICES — each layer is a WHOLE VOICE of its own, with a track of its own.
 *
 * abcjs does this in the PARSER, not the sequencer: `resolveOverlays`
 * (`parse/tune-builder.js:513-640`) rewrites the tune before anything sees it, and it runs
 * in a `while` loop because one pass splits one LEVEL — `A & B & C` needs two.
 *
 * THE PART THAT MATTERS IS THE PADDING, because that is what puts an overlay in TIME — an
 * overlay voice runs from bar one whether or not it sings there, so everything it does not
 * cover is an INVISIBLE REST of that bar's own length. `C4 | D4 |` then `G4 & E4 |` sounds
 * its `E4` at time 2, not at time 0.
 *
 * **AND OUR PARSER ALREADY DOES IT.** `padOverlays` was written for the BEAM gate — an
 * overlay that existed only where it sang left a fixture two elements short — and it is
 * abcjs's rule to the letter, spacers excluded and a pickup padded to the pickup rather
 * than to a full bar. So this is a REGROUPING, not a port: every layer already has one
 * event per measure, and all this does is read the layers out sideways as voices.
 *
 * The synthetic voice keeps the SAME measure objects for their barlines, so
 * `resolveRepeats` unrolls it identically — which is what `overlay-repeat` and
 * `flatten-rep-and-over` are.
 *
 * ONE THING IS DELIBERATELY DROPPED: abcjs strips `startEnding`/`endEnding` from the
 * overlay voice "so they are not repeated". Those are VOLTAS, and a volta left on both
 * voices would unroll them differently.
 *
 * ponytail: appended after ALL main voices, in (voice, layer) order. abcjs appends per
 * STAFF — `staff.voices.push(ov.voice)` — so a two-staff tune where only the second staff
 * has an overlay numbers its tracks differently from this. Nothing in the corpus does it,
 * and the ranked table will say so if anything ever does.
 */
function overlayVoices(voices: readonly Voice[]): Voice[] {
  const out: Voice[] = []
  for (const voice of voices) {
    const depth = voice.measures.reduce((n, m) => Math.max(n, m.overlays.length), 0)
    for (let layer = 0; layer < depth; layer += 1) {
      out.push({
        ...voice,
        id: `${voice.id}&${layer + 1}`,
        measures: voice.measures.map((m) => ({
          ...m,
          volta: null,
          events: m.overlays[layer] ?? [],
          overlays: [],
        })),
      })
    }
  }
  return out
}

/** abcjs's `interpretTempo`: `Q:` is stated at some beat, the sequencer wants another. */
function qpmOfTempo(tempo: Tempo, meter: Meter | null): number {
  const unit: Rational | null = tempo.beatUnit
  const duration = unit === null ? 0.25 : ratToNumber(unit)
  return (duration * (tempo.bpm ?? 60)) / beatLengthOf(meter)
}

/**
 * The tune's qpm — and an INLINE `[Q:]` does not supply one.
 *
 * abcjs reads `abctune.metaText.tempo`, which only the FIELD parser writes; an inline
 * `[Q:]` becomes an element in the stream and never reaches it. Measured on a control
 * pair: `[Q:1/4=129]CDEF` reports `tempo: 180` from `setUpAudio` and draws the mark
 * anyway; `Q:1/4=129` reports 129.
 */
function qpmOf(score: Score, options: AudioOptions): number {
  if (options.qpm !== undefined) return Math.trunc(options.qpm)
  const tempo = score.tempo
  if (tempo !== null && tempo.bpm !== null && score.tempoInline !== true) {
    return qpmOfTempo(tempo, score.meter)
  }
  return options.defaultQpm ?? 180
}

/**
 * The pickup — abcjs's `computePickupLength`, which is what makes a lead-in play QUIETLY.
 *
 * It accumulates durations until the first barline and returns what it has, subtracting a
 * whole bar whenever it reaches one. So a tune that opens with a full measure returns 0
 * and every note is stressed normally; one that opens with `G/|` returns 0.125 and every
 * note before that time takes the weak-beat volume.
 */
function pickupLengthOf(score: Score): number {
  const voice = score.voices[0]
  if (voice === undefined) return 0
  const barLength = score.meter === null ? 1 : score.meter.numerator / score.meter.denominator
  let pickup = 0
  for (const measure of voice.measures) {
    // …AND AN OPENING BARLINE IS A BAR ELEMENT TOO. abcjs's voice is a flat stream, so a
    // tune written `|:e2|` has a `bar` as its very FIRST element and `computePickupLength`
    // returns 0 before it counts a note. Ours splits the same `|:` off as the next
    // measure's `openingBarline`, which is a different place to look and was not looked
    // at: `overlay-repeat` counted its `e2` as a 0.25 pickup and played the whole first
    // bar at the weak-beat 85 where abcjs plays it at 105.
    if (measure.openingBarline !== null) return pickup
    for (const event of measure.events) {
      if (!(event.type === 'rest' && event.kind === 'spacer')) pickup += ratToNumber(event.duration)
      if (pickup >= barLength) pickup -= barLength
    }
    // IT STOPS AT A BARLINE, NOT AT A MEASURE. `computePickupLength` returns the moment it
    // meets a `bar` ELEMENT, and a tune with no barlines at all runs to the end and returns
    // everything it counted. `flatten-treble-8` is six notes over six lines and not one
    // `|`, so abcjs's pickup is 0.75 and every note in it takes the weak-beat volume;
    // stopping at the first measure gave 0.125 and the third note came out on-beat.
    if (measure.closingBarline !== null) return clampPickup(pickup, barLength)
  }
  return clampPickup(pickup, barLength)
}

/**
 * "If computed pickup length is very close to 0 or the bar length, we assume that we
 * actually have a full bar and hence no pickup" (`data/abc_tune.js:140-142`) — and it is
 * not defensive, it is LOad-BEARING.
 *
 * `flatten-triplet-chords` opens with two triplets of `1/6`, and six of those in floating
 * point come to 0.9999999999999999. The `pickup >= barLength` subtraction therefore never
 * fires, the whole first bar reads as a pickup, and every note in it takes the weak-beat 85
 * where abcjs plays the downbeat at 105. The clamp is the only thing standing between a
 * repeating fraction and a wrong volume on the first note of a tune.
 */
function clampPickup(pickup: number, barLength: number): number {
  return pickup < 1e-8 || barLength - pickup < 1e-8 ? 0 : pickup
}

/**
 * `%%MIDI` as the sequencer reads it — abcjs's `abctune.formatting.midi`, whose values are
 * flat arrays of number-or-string. `program 4` and `program 2 4` differ by LENGTH.
 */
function midiOf(score: Score): MidiDirectives {
  const raw = score.midi ?? {}
  const nums = (key: string): readonly number[] | undefined => {
    const v = raw[key]
    return v === undefined ? undefined : v.filter((x): x is number => typeof x === 'number')
  }
  const strs = (key: string): readonly string[] | undefined => {
    const v = raw[key]
    return v === undefined ? undefined : v.filter((x): x is string => typeof x === 'string')
  }
  const out: Record<string, readonly number[] | readonly string[]> = {}
  for (const key of [
    'program',
    'channel',
    'transpose',
    'bassprog',
    'chordprog',
    'bassvol',
    'chordvol',
  ]) {
    const v = nums(key)
    if (v !== undefined) out[key] = v
  }
  const g = strs('gchord')
  if (g !== undefined) out.gchord = g
  // The drum keys are MIXED — `["dddd", 76, 77, …]` is a pattern string followed by
  // pitches and velocities — so filtering by type would destroy them. Kept verbatim, and
  // `drumon` matters by its PRESENCE: abcjs tests `if (globals.drumon)` and an empty array
  // is truthy, which is how `%%MIDI drumon` with no argument turns the drums on.
  const raw2 = raw as Record<string, readonly (string | number)[] | undefined>
  const passthrough: Record<string, readonly (string | number)[]> = {}
  for (const key of ['drum', 'drumon', 'drumbars']) {
    const v = raw2[key]
    if (v !== undefined) passthrough[key] = v
  }
  return { ...out, ...passthrough } as MidiDirectives
}

export function flattenAudio(
  score: Score,
  options: AudioOptions = {},
  midiIn?: MidiDirectives,
): FlatAudio {
  const parsed = midiIn ?? midiOf(score)
  // THE TUNE'S OWN `%%MIDI` WINS over the host's option — abcjs tests
  // `!midiOptions.<key>` before filling one in, so these are defaults and not overrides.
  const midi: MidiDirectives = {
    ...parsed,
    ...(options.bassprog !== undefined && parsed.bassprog === undefined
      ? { bassprog: [options.bassprog] }
      : {}),
    ...(options.bassvol !== undefined && parsed.bassvol === undefined
      ? { bassvol: [options.bassvol] }
      : {}),
    ...(options.chordprog !== undefined && parsed.chordprog === undefined
      ? { chordprog: [options.chordprog] }
      : {}),
    ...(options.chordvol !== undefined && parsed.chordvol === undefined
      ? { chordvol: [options.chordvol] }
      : {}),
    ...(options.gchord !== undefined && parsed.gchord === undefined
      ? { gchord: [options.gchord] }
      : {}),
  }
  const startingTempo = qpmOf(score, options)
  let program = Math.trunc(options.program ?? 0)
  let channel = Math.trunc(options.channel ?? 0)
  let transposeGlobal = Math.trunc(options.midiTranspose ?? 0)
  /** `channelExplicitlySet` — a tune that named a channel or program keeps what it asked. */
  let channelExplicit = false
  // `%%MIDI program 4` sets the instrument; `%%MIDI program 2 4` sets channel AND
  // instrument, in that order (`abc_midi_sequencer.js:73-79`).
  const declared = midi.program ?? []
  if (declared.length === 1) {
    program = declared[0] as number
    channelExplicit = true
  } else if (declared.length > 1) {
    channel = declared[0] as number
    program = declared[1] as number
    channelExplicit = true
  }
  if (midi.channel !== undefined && midi.channel.length > 0) {
    channel = midi.channel[0] as number
    channelExplicit = true
  }
  // CHANNEL 10 IS PERCUSSION, and abcjs decides that in the sequencer's own preamble:
  // `if (channel === 10) program = PERCUSSION_PROGRAM` (`abc_midi_sequencer.js:40-41`),
  // twice — once for the option and once after `%%MIDI channel` has been read.
  if (channel === PERCUSSION_CHANNEL) program = PERCUSSION_PROGRAM
  if (midi.transpose !== undefined && midi.transpose.length > 0) {
    transposeGlobal = midi.transpose[0] as number
  }

  /**
   * `elem.elem.currentTrackMilliseconds` — stamped for EVERY element that has one, before
   * the pitch loop, so a rest and a tie's silent half are stamped too. `ms = realTime /
   * beatFraction / startingTempo * 60 * 1000`, and `realTime` is our own `start`.
   */
  type Stamped = {
    milliseconds: number[]
    wholeNotes: number[]
    pitches: number[]
    notes: MidiNote[]
  }
  const elementTimings = new Map<MusicEvent, Stamped>()
  const stamp = (event: MusicEvent, ms: number, wholeNotes: number): Stamped => {
    let row = elementTimings.get(event)
    if (row === undefined) {
      row = { milliseconds: [], wholeNotes: [], pitches: [], notes: [] }
      elementTimings.set(event, row)
    }
    // "There can be duplicates if there are multiple voices" — a value already present is
    // dropped rather than repeated.
    if (!row.milliseconds.includes(ms)) {
      row.milliseconds.push(ms)
      row.wholeNotes.push(wholeNotes)
    }
    // …**AND `midiPitches` IS EMPTIED ON EVERY VISIT**, where the times accumulate.
    row.notes.length = 0
    return row
  }
  const percMap = score.percMap ?? {}
  const drumMap = score.drumMap ?? {}
  const pickupLength = pickupLengthOf(score)
  const tracks: MidiEvent[][] = []
  // The overlay voices are REAL voices by the time abcjs's flattener runs — the parser put
  // them there — so everything downstream counts them: the chord track's channel, the drum
  // track's, and `voicesOff`'s indices.
  const allVoices: readonly Voice[] = [...score.voices, ...overlayVoices(score.voices)]
  const startMeter = score.meter ?? { numerator: 4, denominator: 4, symbol: 'numeric' as const }
  const chordTrack = new ChordTrack(allVoices.length, options.chordsOff === true, midi, {
    num: startMeter.numerator,
    den: startMeter.denominator,
  })
  let instrument: number | undefined
  let totalDuration = 0
  const tempoChanges = collectTempoChanges(allVoices, score, startingTempo)

  /**
   * THE DRUM TRACK'S STATE, which is the whole tune's and not any voice's.
   *
   * abcjs pushes every `drum` element into **voices[0]** — a `[I:MIDI drumon]` written on
   * voice 3 lands on voice 0's stream — and writes the track on voice 0 only, "so that it
   * is not duplicated". So the definition is tune-wide and the writes are voice-0-wide.
   *
   * `drumOn` is NOT implied by a pattern: `drumOn = drumPattern !== ""` is computed from
   * the OPTIONS before the tune's own `%%MIDI` is read, and the header's `drum` only sets
   * the pattern (`abc_midi_sequencer.js:86-92`). A tune that writes `%%MIDI drum …` and
   * never `drumon` gets silence.
   */
  let drumPattern: readonly (string | number)[] =
    midi.drum ?? (options.drum !== undefined && options.drum !== '' ? options.drum.split(' ') : [])
  let drumBars =
    typeof midi.drumbars?.[0] === 'number'
      ? (midi.drumbars[0] as number)
      : Math.trunc(options.drumBars ?? 1)
  let drumOn = (options.drum ?? '') !== '' || midi.drumon !== undefined
  const drumIntro = Math.trunc(options.drumIntro ?? 0)
  /**
   * THE COUNT-IN'S MEASURE IS THE TUNE'S LAST METER, NOT ITS FIRST — and that is a quirk
   * rather than a choice. `measureLength` is a sequencer-global that `interpretMeter`
   * overwrites at every `M:` it meets (`abc_midi_sequencer.js:625-652`), and the intro is
   * spliced after ALL the voices are built (`:510`), so whatever the last meter change left
   * behind is what the rests are cut to. A tune that ends in 3/4 gets a 3/4 count-in.
   *
   * ponytail: read voice-major where abcjs reads line-major, so a tune whose LAST line
   * changes meter on voice 0 and not on voice 1 differs. Nothing states one anywhere.
   */
  const introMeter =
    allVoices
      .flatMap((v) => v.measures.map((m) => m.meterChange))
      .filter((m): m is Meter => m !== null)
      .pop() ?? startMeter
  const introMeasureLength = introMeter.numerator / introMeter.denominator
  let drumDefinition: DrumDefinition = DRUM_OFF
  const drumTrack: MidiEvent[] = []
  const setDrum = (on: boolean, meter: Meter): void => {
    drumDefinition = normalizeDrumDefinition(drumPattern, on, beatFractionOf(meter))
    alignDrumToMeter(drumDefinition, drumBars, meter)
  }
  // The FIRST line of the FIRST voice gets the element, after its key and meter and before
  // a note of it (`abc_midi_sequencer.js:186-189`), so it is in force from time zero.
  if (drumOn) setDrum(true, startMeter)

  /**
   * `writeDrum` — one measure of the pattern, at every BAR of voice 0, and it writes the
   * measure that has just ENDED (`start = lastBarTime`).
   *
   * TWO GUARDS, and they are not the same guard. Before the track exists,
   * `lastEventTime < measureLen` returns without writing: that is how a PICKUP delays the
   * first hit, because the bar closing a lead-in has not yet reached a whole measure of
   * music. Once the track exists, `!drumDefinition.on` returns instead — a `drumoff` stops
   * the hits without closing the track, so a later `drumon` resumes into the same one.
   */
  const writeDrum = (meter: Meter, lastBarTime: number, factor: number): void => {
    if (drumTrack.length === 0 && !drumDefinition.on) return
    if (drumTrack.length === 0) {
      if (totalDuration < meter.numerator / meter.denominator) return
      drumTrack.push({
        cmd: 'program',
        // The channel after the last VOICE track, so it moves with a dropped staff too.
        channel: soundingVoices.length + 1,
        instrument: PERCUSSION_PROGRAM,
      })
    }
    if (!drumDefinition.on) return
    let start = lastBarTime
    for (const p of drumDefinition.pattern) {
      const len = Math.round(p.len * factor * MICRO) / MICRO
      if (p.pitch !== null && p.pitch !== 0) {
        drumTrack.push({
          cmd: 'note',
          pitch: p.pitch,
          volume: p.velocity as number,
          start,
          duration: len,
          gap: 0,
          instrument: PERCUSSION_PROGRAM,
        })
      }
      start += len
    }
  }

  /**
   * **`%%staffnonote 0` DROPS EVERY STAFF THAT HOLDS NOTHING BUT RESTS — AND WITH IT THE
   * TRACK.** `cleanUp` nulls any STAFF none of whose voices satisfies `containsNotesStrict`
   * and filters the nulls out (`tune-builder.js:70-93`), so the sequencer never sees the
   * staff, never makes a voice, and the flattener pushes no track. Measured through abcjs:
   *
   *     rests + %%staffnonote 0      staff count 0   tracks 0
   *     rests, no directive          staff count 1   tracks 1
   *     rests + %%staffnonote 1      staff count 1   tracks 1
   *     notes + %%staffnonote 0      staff count 1   tracks 1
   *     two voices, one all rests    staff count 1   tracks 1
   *
   * So `MThd` says ONE track for a tune of pure rests where we said three — six rows of the
   * byte gate, and the largest family the widening to all 691 tunes turned up.
   *
   * ⚠️ **AND A REST CARRYING A CHORD SYMBOL KEEPS ITS STAFF.** The test is
   * `el_type === 'note' && (rest === undefined || chord !== undefined)`
   * (`tune-builder.js:896-902`) — the `chord` clause is the whole difference between
   * `zzzz|` and `"C"zzzz|`, which is why this cannot be "does the voice have a note".
   *
   * ⚠️ **AND THE RENDERER ALREADY HAD ALL OF THIS**, `layout.ts`'s own `sounds()` beside the
   * same citations — the drawing has dropped these staves since the rule was found and the
   * AUDIO kept building tracks for them. Eighth instance of A RULE PORTED AT THE SITE THAT
   * NAMED IT IS NOT A RULE PORTED.
   */
  const soundsIn = (v: (typeof allVoices)[number] | undefined): boolean =>
    (v?.measures ?? []).some((m) =>
      m.events.some(
        (e) => e.type === 'note' || (e.type === 'rest' && e.chordSymbol !== null),
      ),
    )
  /** The voices sharing this one's staff — every voice is its own staff without `%%score`. */
  const staffOf = (voice: (typeof allVoices)[number]): (typeof allVoices)[number][] => {
    const group = score.staves.find((g) => g.voiceIds.includes(voice.id))
    if (group === undefined) return [voice]
    return group.voiceIds
      .map((id) => allVoices.find((v) => v.id === id))
      .filter((v): v is (typeof allVoices)[number] => v !== undefined)
  }

  /**
   * ⚠️ **AND THE SURVIVORS ARE ITERATED, NOT SKIPPED OVER**, because the index IS the
   * channel: abcjs seeds each track with `{cmd: 'program', channel: i}` where `i` runs over
   * its OWN already-filtered voices (`abc_midi_flattener.js:117`). Returning early from a
   * loop over every voice leaves the later ones on their original index, so a tune that
   * drops a staff wrote `%b2` where abcjs writes `%b1` — the track count agreed and the
   * channel did not. `voicesOff` indexes the same array in abcjs, so it moves with it.
   */
  const soundingVoices =
    score.staffNoNote === true
      ? allVoices.filter((v) => staffOf(v).some(soundsIn))
      : allVoices

  /**
   * **THE VOLUME CARRIES FROM ONE VOICE TO THE NEXT — abcjs's `currentVolume` IS ONE
   * VARIABLE FOR THE WHOLE TUNE.** `setDynamics` assigns
   * `currentVolume = volumes[dynamicType].slice(0)` (`abc_midi_sequencer.js:459`) and
   * nothing resets it per voice, so a `!mp!` written on voice 1 is still in force when
   * voice 2 begins. We started every voice at the default and lost it.
   *
   * Measured, and the SCOPE is the tune rather than the staff:
   *
   *     shared staff, v1 !mp!      abcjs v2 75/65      ours v2 105/95
   *     separate staves, v1 !mp!   abcjs v2 75/65      ours v2 105/95
   *     no %%staves at all         abcjs v2 75/65      ours v2 105/95
   *     three voices, v1 !mp!      abcjs v2 AND v3 75  ours both 105
   *
   * ⚠️ **AND THE OBVIOUS CONTROL PASSES FOR THE WRONG REASON.** The same ladder written
   * with `!f!` agrees in both engines on every rung — because `f`'s table IS the default
   * `[105, 95, 85]`, so a lost dynamic and a carried one produce identical bytes. Only a
   * dynamic that differs from the default can see this, which is why the first cut of the
   * ladder reported no defect at all.
   */
  let stress: [number, number, number] = [105, 95, 85]

  soundingVoices.forEach((voice, voiceIndex) => {
    const voiceOff =
      options.voicesOff === true ||
      (Array.isArray(options.voicesOff) && options.voicesOff.includes(voiceIndex))
    /**
     * A PERCUSSION CLEF REWRITES THE PROGRAM AND SUPPRESSES THE KEY, and abcjs does both in
     * one `if`:
     *
     *     if (staff.clef && staff.clef.type === 'perc' && !channelExplicitlySet) {
     *       for (…) if (voices[v][cl].el_type === 'instrument') voices[v][cl].program = 128
     *     } else if (staff.key) { addKey(voices[voiceNumber], staff.key) }
     *
     * (`abc_midi_sequencer.js:175-181`.) The `else` is the part that is easy to miss: a
     * percussion staff never gets a key element at all, so its written accidentals are the
     * only ones that apply. And `!channelExplicitlySet` means a tune that said
     * `%%MIDI channel`/`program` keeps what it asked for.
     */
    const clef = voice.clef ?? score.clef
    const percussion = clef.shape === 'percussion'
    const voiceProgram = percussion && !channelExplicit ? PERCUSSION_PROGRAM : program
    // abcjs seeds every track with a program event whose channel is the VOICE INDEX, then
    // lets an explicit `%%MIDI channel` walk back and overwrite it (`setChannel`).
    const track: MidiEvent[] = [
      {
        cmd: 'program',
        channel: channel !== 0 ? channel : voiceIndex,
        instrument: voiceProgram,
      },
    ]
    if (instrument === undefined) instrument = voiceProgram

    let accidentals = percussion ? [0, 0, 0, 0, 0, 0, 0] : keyAccidentals(score.key)
    let barAccidentals = new Map<string, number>()
    let meter: Meter = score.meter ?? { numerator: 4, denominator: 4, symbol: 'numeric' }
    let lastBarTime = 0
    let slurCount = 0
    // The clef's transpose REPLACES the running one rather than adding, so the global
    // `%%MIDI transpose` only survives where no clef states one.
    chordTrack.setTranspose(0)
    chordTrack.setLastBarTime(0)
    chordTrack.setMeter({ num: meter.numerator, den: meter.denominator })

    const transposeOf = transposeOfFactory(transposeGlobal)
    const sequenced = sequenceVoice(voice, score, startingTempo, tempoChanges)
    // The count-in goes onto EVERY voice; the `drumOff` element that follows it goes onto
    // one, because abcjs clears `drumOffAfterIntro` the first time it splices one in and
    // the drum state is the tune's rather than the voice's either way.
    const timed =
      drumIntro > 0
        ? spliceDrumIntro(
            sequenced,
            drumIntro,
            introMeasureLength,
            pickupLength,
            options.drumOff === true && voiceIndex === 0,
          )
        : sequenced
    /** The running stress table — abcjs's `currentVolume`, seeded at the default triple. */
    /** Per-note increment while a hairpin is open; 0 when none is. */
    let hairpin = 0
    /** `volumesPerNotePitch` — one stress table per pitch of a chord. Empty when none. */
    let perPitch: readonly (readonly [number, number, number])[] = []
    let currentKey = score.key
    for (const [index, item] of timed.entries()) {
      const decorations = item.decorations.map(canonical)
      // THE HAIRPIN MOVES FIRST AND THE DYNAMIC OVERRIDES IT, which is abcjs's order in
      // its own loop: the crescendo increment is applied at the top of the `note` arm and
      // `setDynamics` is called immediately after (`abc_midi_sequencer.js:229-245`).
      //
      // AND ONLY IN THE `note` ARM. A bar row is here so the hairpin's CLOSE can be found
      // on it; letting one step the volume as well put every bar of `flatten-dynamics2`
      // four louder than abcjs's.
      if (item.kind === 'note' && hairpin !== 0) {
        stress = [stress[0] + hairpin, stress[1] + hairpin, stress[2] + hairpin]
        /**
         * ⚠️ **AND THE HAIRPIN DROPS THE PER-PITCH TABLE, BECAUSE IN abcjs IT IS NOT STATE
         * — IT RIDES A ROW.** `volumesPerNotePitch` is written onto an `el_type: 'beat'`
         * element pushed into the voice, and ONLY the dynamic arm writes one
         * (`abc_midi_sequencer.js:468`). The crescendo arm pushes its own beat row with
         * `{el_type: 'beat', beats: currentVolume.slice(0)}` and no table at all (`:234`,
         * `:241`), so a hairpin-moved note has none to look up and falls back to the beats.
         *
         * We model it as a variable that persists until the next dynamic, which is right
         * for every OTHER note and wrong across a hairpin: `!mp![b8B8d8]` at the head of a
         * voice left `mp`'s table standing, so the lowest note of every later chord took
         * `mp`'s 65 instead of the 115 the crescendo had just computed. Measured on
         * `visual-selection-01`: the same 293 note-ons and the same pitches, six at the
         * wrong VELOCITY — **the ramp was computed correctly and then thrown away.**
         *
         * ⚠️ A read guard on `decorations.length > pitchIndex` — abcjs's `writeNote` test —
         * was tried first and moved NOTHING: the closing chord carries `crescendo)`, so the
         * length is 1 and the guard passes. The state is what is wrong, not the read.
         */
        perPitch = []
      }
      const named = DYNAMIC_ORDER.find((d) => decorations.includes(d))
      if (named !== undefined) {
        stress = [...(DYNAMIC_VOLUMES[named] as readonly [number, number, number])]
        /**
         * A CHORD CAN CARRY ONE DYNAMIC PER NOTE — `volumesPerNotePitch`.
         *
         * `setDynamics` rebuilds it whenever a dynamic is seen at all, from the element's
         * decorations filtered to the ones that ARE dynamics
         * (`abc_midi_sequencer.js:458-468`), and `writeNote` then looks it up BY PITCH
         * INDEX: `if (!ret.velocity && elem.decoration.length > i) processVolume(…, i)`.
         * So the list is zipped against the SORTED pitches positionally — decoration 0
         * belongs to the lowest note, whatever it was written next to. `[!pppp!c!ffff!D]`
         * plays its D at 10 and its c at 125, which reads backwards until you know that.
         *
         * It is NOT moved by a hairpin: only the plain table is, because abcjs rebuilds
         * this one solely at a dynamic.
         */
        perPitch = decorations
          .filter((d) => DYNAMIC_VOLUMES[d] !== undefined)
          .map((d) => DYNAMIC_VOLUMES[d] as readonly [number, number, number])
        hairpin = 0
      }
      if (decorations.includes('crescendo(')) {
        hairpin = hairpinStep(timed, index, stress[0], 'crescendo)', CRESCENDO_SIZE)
      } else if (decorations.includes('diminuendo(')) {
        hairpin = hairpinStep(timed, index, stress[0], 'diminuendo)', -CRESCENDO_SIZE)
      } else if (decorations.includes('crescendo)') || decorations.includes('diminuendo)')) {
        hairpin = 0
      }
      if (item.key !== currentKey && !percussion) {
        currentKey = item.key
        accidentals = keyAccidentals(item.key)
      }
      if (item.meter !== null && item.meter !== meter) {
        meter = item.meter
        chordTrack.setMeter({ num: meter.numerator, den: meter.denominator })
        // A METER CHANGE RE-SCALES A PATTERN ALREADY IN FORCE — abcjs's `case "meter"`
        // calls `alignDrumToMeter()` as its last act, so `dddd` under a new 3/4 covers
        // three beats rather than running past the bar.
        alignDrumToMeter(drumDefinition, drumBars, meter)
      }
      if (item.barStart) barAccidentals = new Map()
      const start = item.time / MICRO
      chordTrack.setTempoChangeFactor(item.factor)
      // THE CHORD TRACK IS TRANSPOSED WITH THE VOICE. abcjs pairs every
      // `transpose = element.transpose` with a `chordTrack.setTranspose(transpose)`, so a
      // `V:1 transpose=-2` moves its `"Em"` too — the chord track was two semitones above
      // the voice it belongs to on `flatten-transpose`.
      chordTrack.setTranspose(transposeOf(item))
      if (item.kind === 'midi') {
        for (const { cmd, params } of item.midi ?? []) {
          // The CHORD commands, which abcjs funnels through one `chordTrack.paramChange`.
          // `%%MIDI gchord` with NO argument cancels the override rather than setting an
          // empty one — "skips gchord elements that don't have pattern strings" — and
          // `cancel-gchord` is that tune: two identical bars, the second on the meter's
          // own pattern.
          switch (cmd) {
            case 'gchord':
              chordTrack.setGChord(typeof params[0] === 'string' ? params[0] : undefined)
              continue
            case 'gchordon':
              chordTrack.gChordOn(false)
              continue
            case 'gchordoff':
              chordTrack.gChordOn(true)
              continue
            case 'bassprog':
              chordTrack.setBassProg(params[0] as number, (params[1] as number | undefined) ?? 0)
              continue
            case 'chordprog':
              chordTrack.setChordProg(params[0] as number, (params[1] as number | undefined) ?? 0)
              continue
            case 'bassvol':
              chordTrack.setBassVol(params[0] as number)
              continue
            case 'chordvol':
              chordTrack.setChordVol(params[0] as number)
              continue
            case 'drumon':
              drumOn = true
              break
            case 'drumoff':
              drumOn = false
              break
            case 'drum':
              drumPattern = params
              break
            case 'drumbars':
              drumBars = typeof params[0] === 'number' ? params[0] : 1
              break
            default:
              continue
          }
          setDrum(drumOn, meter)
        }
        continue
      }
      if (item.kind === 'bar') {
        // The bar CLOSES here: the measure's chords are laid onto the meter's pattern and
        // only then does `lastBarTime` move on, which is the order abcjs's own `case "bar"`
        // arm takes (`abc_midi_flattener.js:157-165`).
        chordTrack.barEnd(start)
        // AND THE DRUM IS WRITTEN BEFORE `lastBarTime` MOVES, on voice 0 only, so it fills
        // the measure that just ended.
        if (voiceIndex === 0) writeDrum(meter, lastBarTime, item.factor)
        // "Decide whether there are rhythm heads each measure" — the flag is per BAR, and
        // abcjs resets it on every voice despite the `if (i === 0)` above it reading as
        // though it guarded both statements. Its indentation says one thing and its braces
        // another; the braces win.
        chordTrack.setRhythmHead(false)
        lastBarTime = start
        chordTrack.setLastBarTime(lastBarTime)
        continue
      }
      const realDuration = Math.round(item.duration * item.factor * MICRO) / MICRO
      totalDuration = Math.max(totalDuration, start + realDuration)
      // A REST CARRIES ITS CHORD SYMBOL, and so does the silent half of a tie. abcjs's
      // `writeNote` runs `chordTrack.processChord(elem)` before it looks at the pitches at
      // all, and its `el_type: "note"` covers rests — so `"C"z4|` is a whole bar of chord
      // track over silence, which is most of `flatten-all-time-sigs`. Skipping the event
      // first left eight cases with no chord track to compare.
      if (item.event !== null) {
        chordTrack.processChord(chordSymbolOf(item.event), annotationsOf(item.event), start)
      }
      // A SPACER IS NEVER STAMPED AT ALL — it reaches `writeNote` in neither engine, so
      // abcjs's element carries no `currentTrackMilliseconds` rather than one it ignores.
      // `CzE|DyFG|` proves it: the `z` rest IS stamped and the `y` is not.
      const stamped =
        item.event === null || (item.event.type === 'rest' && item.event.kind === 'spacer')
          ? null
          : stamp(item.event, (start / beatFractionOf(meter) / startingTempo) * 60 * 1000, start)
      if (item.event === null || item.event.type === 'rest' || item.tiedOver) continue

      const volume = stressVolume(start, lastBarTime, meter, pickupLength, voiceOff, stress)
      // A CHORD SOUNDS FROM THE BOTTOM UP, whatever order it was written in. abcjs's parser
      // sorts `elem.pitches`, so `[cD]` emits D and then c; ours keeps the source order, so
      // the sort is here. `volume-in-chords` is the whole of it: pitch 62 where we had 72.
      const pitches =
        item.event.type !== 'chord'
          ? [item.event.pitch]
          : options.chordsInSourceOrder === true
            ? item.event.pitches
            : [...item.event.pitches].sort(
                (a, b) => a.octave * 7 + stepIndex(a.step) - (b.octave * 7 + stepIndex(b.step)),
              )
      const mods = noteModifications(decorations, volume)
      /**
       * A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED, and both counts move BEFORE this
       * note's articulation is decided.
       *
       * abcjs does the two together inside the pitch loop and reads `slurCount` after —
       * `if (note.startSlur) slurCount += …; if (note.endSlur) slurCount -= …;` then
       * `if (slurCount > 0) p.endType = 'tenuto'` (`abc_midi_flattener.js:580-604`). We
       * added before the loop and subtracted after it, which made the CLOSING note tenuto
       * too: `(ef)` gave `f` the -0.001s overlap it should not have, and its note-off
       * landed two ticks late. Invisible to the event table — a `gap` of -0.001 on the last
       * note of a slur was in `flatten-*`'s goldens nowhere — and one byte in the MIDI file.
       */
      slurCount += slurStartsOf(item.event)
      slurCount -= slurEndsOf(item.event)

      /**
       * GRACE NOTES TAKE HALF THE MAIN NOTE, and the main note gives it up.
       *
       *     var multiplier = companionDuration/2 / graceDuration
       *     …
       *     if (elem.gracenotes) { p.duration = p.duration / 2; p.start = p.start + p.duration }
       *
       * (`abc_midi_flattener.js:691-714, 591-594`.) So the graces fill the FIRST half of the
       * written note and the note itself sounds for the second — it is not an ornament
       * stolen from the beat before. The velocity is `velocity * 2/3` ROUNDED, "to make the
       * graces a little quieter", and it is the beat-stress velocity: `findNoteModifications`
       * has not run yet, so an `!accent!` on the note does NOT reach its graces.
       *
       * They are written BEFORE the main note in the track, which is why emission order
       * matters here as much as it did for the renderer's notehead pairing.
       *
       * AND THE LENGTHS INSIDE THE GROUP ARE SPENT PROPORTIONALLY, not evenly. The
       * multiplier is `companionDuration / 2` over the graces' SUM, and each grace then
       * takes its own length times that — so `{B2c/d/}` gives the B four times what each
       * of the others gets. Because the multiplier normalises, only the RATIOS matter and
       * the unit note length cancels out. This note used to say the count was all that
       * survived and that the table would speak up if a fixture ever wrote an unequal
       * group; `flatten-grace`'s fourth bar is one, and it did.
       */
      const graces = item.event.graceNotes
      let mainStart = start
      let mainDuration = realDuration
      if (graces.length > 0) {
        const graceTotal = graces.reduce((sum, g) => sum + ratToNumber(g.length), 0)
        const multiplier = graceTotal === 0 ? 0 : realDuration / 2 / graceTotal
        const graceVolume = Math.round(volume * (2 / 3))
        let at = start
        for (const g of graces) {
          const each = ratToNumber(g.length) * multiplier
          const mappedGrace = percussion ? drumMap[writtenName(g)] : undefined
          const raw =
            mappedGrace ?? midiPitchOf(g, accidentals, barAccidentals, null) + transposeOf(item)
          const sound =
            mappedGrace === undefined && voiceProgram === PERCUSSION_PROGRAM
              ? percMap[percKey(g)]?.sound
              : undefined
          const resolved = sound === undefined ? adjustForMicroTone(raw) : { pitch: sound }
          track.push({
            cmd: 'note',
            pitch: resolved.pitch,
            volume: graceVolume,
            start: at,
            duration: each,
            gap: 0,
            instrument: voiceProgram,
            style: 'grace',
            ...('cents' in resolved && resolved.cents !== undefined
              ? { cents: resolved.cents }
              : {}),
          })
          at += each
        }
        mainDuration = realDuration / 2
        mainStart = start + mainDuration
      }

      // A RHYTHM HEAD PLAYS THE CHORD, NOT THE NOTE. `!style=rhythm!B` is a slash head, so
      // abcjs swaps the whole pitch list for the last chord's CHICK
      // (`abc_midi_flattener.js:563-565`) — at the melody's own volume, duration and
      // instrument, and with no key signature or transpose applied, because each pitch
      // arrives with `actualPitch` already set. Written after the graces because that is
      // where abcjs does it, and the graces still play their own notes.
      if (item.event.style === 'rhythm') {
        for (const pitch of chordTrack.setRhythmHead(true)) {
          track.push({
            cmd: 'note',
            pitch,
            volume: mods.velocity ?? volume,
            start: mainStart,
            duration: mainDuration,
            instrument: voiceProgram,
            ...endTypeAndGap(mods.endType, slurCount, mainDuration, startingTempo),
          })
        }
        continue
      }

      for (const [pitchIndex, written] of pitches.entries()) {
        // …**AND A HEAD FOLDED INTO AN EARLIER TIE SOUNDS NOTHING**, where its neighbours
        // in the same chord still do — see `VoiceItem.tieExtra`.
        const headName = `${written.step}${written.octave}`
        if (item.tieSilenced?.has(headName) === true) continue
        const headExtra = item.tieExtra?.get(headName) ?? 0
        const headDuration =
          headExtra === 0
            ? mainDuration
            : mainDuration + Math.round(headExtra * item.factor * MICRO) / MICRO
        const transpose = transposeOf(item)
        // The per-pitch volume, and abcjs's guard is on the DECORATION count rather than
        // on `volumesPerNotePitch`'s: `elem.decoration.length > i` decides whether to
        // recompute, `volumesPerNotePitch.length >= i+1` decides whether the recomputation
        // uses a different table. An accent (`ret.velocity`) suppresses the whole path.
        const pitchVolume =
          mods.velocity === undefined && decorations.length > pitchIndex
            ? stressVolume(
                start,
                lastBarTime,
                meter,
                pickupLength,
                voiceOff,
                perPitch[pitchIndex] ?? stress,
              )
            : (mods.velocity ?? volume)
        // `%%MIDI drummap B 38` — the PARSER stamps this onto the note in abcjs
        // (`abc_parse_music.js:1127-1134`) and `adjustPitch` then returns it OUTRIGHT:
        // `if (note.midipitch !== undefined) return note.midipitch` — no key signature, no
        // bar accidental, no transpose. Keyed on the written LETTER plus any accidental
        // prefix, which is `line[index]` at the moment the pitch is read, so the octave
        // marks that follow are not part of the key.
        const mapped = percussion ? drumMap[writtenName(written)] : undefined
        if (mapped !== undefined) {
          const drum: MidiNote = {
            cmd: 'note',
            pitch: mapped,
            volume: pitchVolume,
            start: mainStart,
            duration: headDuration,
            instrument: voiceProgram,
            ...endTypeAndGap(mods.endType, slurCount, headDuration, startingTempo),
          }
          if (mods.ornament !== undefined) doModifiedNotes(mods.ornament, drum, item.factor, track)
          else track.push(drum)
          continue
        }
        // `V:… octave=` IS ALREADY IN THE PITCH — in BOTH engines — and the model's comment
        // says otherwise. Measured: `V:2 octave=-2` parses `B` as octave 2 while also
        // reporting `octaveShift: -2`, and abcjs's own answer for the same voice under a
        // plain bass clef is 47, the shifted pitch with no transpose at all. So the shift is
        // spent once, in the pitch, and `octave=` is NOT one of the things that becomes a
        // `transpose` element. Reading it here as well put the voice an octave and a half
        // low — 23 against 47.
        const raw =
          midiPitchOf(written, accidentals, barAccidentals, quarterAlter(item.event)) + transpose
        /**
         * `%%percmap` REPLACES THE PITCH OUTRIGHT, once the voice is on the drum kit.
         *
         *     if (currentInstrument === drumInstrument && percmap) {
         *       var name = pitchesToPerc(note)
         *       if (name && percmap[name]) actualPitch = percmap[name].sound
         *     }
         *
         * (`abc_midi_flattener.js:584-588`.) The gate is the INSTRUMENT, not the clef — a
         * `%%MIDI program 128` reaches it just as a `K:… perc` does — and the lookup is by
         * vertical position, so it is the written place on the staff that names the drum.
         */
        const percussionSound =
          voiceProgram === PERCUSSION_PROGRAM ? percMap[percKey(written)]?.sound : undefined
        const { pitch, cents } =
          percussionSound === undefined
            ? adjustForMicroTone(raw)
            : { pitch: percussionSound, cents: undefined }
        const event: MidiNote = {
          cmd: 'note',
          pitch,
          volume: pitchVolume,
          start: mainStart,
          duration: headDuration,
          instrument: voiceProgram,
          ...endTypeAndGap(mods.endType, slurCount, headDuration, startingTempo),
          ...(cents === undefined ? {} : { cents }),
        }
        // AN ORNAMENT REPLACES THE NOTE RATHER THAN DECORATING IT — abcjs's own
        // `if (ret.noteModification) doModifiedNotes(…) else { …articulation…; push }`,
        // so the run inherits the pitch, volume and instrument and nothing else.
        if (stamped !== null && !stamped.pitches.includes(pitch)) stamped.pitches.push(pitch)
        // The SAME object the track gets — abcjs pushes one `p` to both, which is why its
        // `gap` shows up here.
        if (stamped !== null) stamped.notes.push(event)
        if (mods.ornament !== undefined) doModifiedNotes(mods.ornament, event, item.factor, track)
        else track.push(event)
      }
    }
    /**
     * THE TRACK NAME IS UNSHIFTED, not appended — `%FF%03` in a MIDI file, and abcjs puts
     * it at the FRONT of the finished track (`abc_midi_flattener.js:228`) even though the
     * `name` element that carries it is the first thing it reads.
     *
     * Found by the MIDI-FILE oracle and not by the event table: `cmd: 'text'` has been a
     * type in this file since it was written and nothing ever produced one, because not one
     * of `tests/corpus-audio`'s 54 cases declares `V:… name=`. A second surface over the
     * same data is worth having precisely for this.
     */
    /**
     * ⚠️ **AND THE NAME IS THE STAFF'S TITLE ARRAY JOINED WITH A SPACE, NOT THE VOICE'S
     * OWN `name=`.** `getTrackTitle` is `staff[voiceNumber].title.join(" ")`
     * (`abc_midi_sequencer.js:606-610`), and that array carries ONE SLOT PER VOICE ON THE
     * STAFF with `''` for a voice that has no `name=` — so a staff holding a named voice
     * and an unnamed one joins to **`"RH "`, with the separator left behind**:
     *
     *     %%staves {(PianoRightHand extra) (PianoLeftHand)}
     *     staff 0 title ["RH", ""]  -> "RH "     staff 1 title ["LH"] -> "LH"
     *
     * We wrote `voice.name`, so the track name was one byte short on four corpus fixtures
     * — `%FF%03%02%52%48` against abcjs's `%FF%03%03%52%48%20`.
     *
     * ⚠️ **AND THE RULE WAS ALREADY WRITTEN DOWN IN THIS REPO, IN `compat/lines.ts`**,
     * whose own comment beside the same array says `synth.sequence` "reads it as the
     * track's name — `staff[voiceNumber].title`, joined with a space… and nothing else in
     * this library did". It does now. **A RULE PORTED AT THE SITE THAT NAMED IT IS NOT A
     * RULE PORTED** — seventh instance, and the fourth in this file alone.
     *
     * The STAVES are indexed by the VOICE number, which is abcjs's own quirk and the same
     * one that draws a reordered staff's voices under each other's names.
     */
    const staffTitle = (): string | null => {
      /**
       * ⚠️ **AND OUT OF RANGE MEANS NO NAME AT ALL, NOT THE VOICE'S OWN.**
       * `if (!staff || staff.length <= voiceNumber || !staff[voiceNumber].title) return
       * undefined` (`abc_midi_sequencer.js:607-608`) — so with THREE voices over TWO staves,
       * voice 2 asks for `staff[2]`, finds nothing, and its track gets no `%FF%03` row.
       * Falling back to `voice.name` wrote `LH` where abcjs writes no name at all.
       *
       * Only a tune with NO `%%staves`/`%%score` at all falls back, and there every voice
       * is its own staff, so the array is `[voice.name]` and the join is that name.
       */
      const ids = score.staves[voiceIndex]?.voiceIds
      if (ids === undefined)
        return score.staves.length > 0 ? null : voice.name === '' ? null : voice.name
      const names = ids
        .map((id) => score.voices.find((v) => v.id === id))
        .sort((a, b) => (a?.declaredIndex ?? 0) - (b?.declaredIndex ?? 0))
        .map((v) => v?.name ?? '')
      return names.some((t) => t !== '') ? names.join(' ') : null
    }
    const trackTitle = staffTitle()
    if (trackTitle !== null && trackTitle !== '') {
      track.unshift({ cmd: 'text', type: 'name', text: trackTitle })
    }
    tracks.push(track)
    chordTrack.finish()
  })

  chordTrack.addTrack(tracks as never)
  // The drum track goes LAST, after the chord track — abcjs's own order at the foot of
  // `flatten()`, and it is why `flatten-drum` reports two tracks rather than three.
  if (drumTrack.length > 0) tracks.push(drumTrack)

  return {
    tempo: startingTempo,
    instrument: instrument ?? 0,
    totalDuration: Math.round(totalDuration * MICRO) / MICRO,
    tracks,
    elementTimings,
  }
}

const chordSymbolOf = (event: MusicEvent): string | null => event.chordSymbol
const annotationsOf = (event: MusicEvent): readonly string[] => event.annotations

/**
 * The `%%MIDI drummap` key — the note's written LETTER with any accidental in front.
 *
 * abcjs builds it as `accMap[el.accidental] + line[index]`, the raw source character at the
 * pitch, so `B,` and `B` share the key `B`: the octave marks come after and are not read.
 * Case carries the octave — uppercase to C4, lowercase from C5.
 */
function writtenName(pitch: { step: string; octave: number; accidental: number | null }): string {
  const letter = pitch.octave <= 4 ? pitch.step.toUpperCase() : pitch.step
  const prefix =
    pitch.accidental === null
      ? ''
      : (({ 1: '^', '-1': '_', 0: '=', 2: '^^', '-2': '__' } as Record<string, string>)[
          String(pitch.accidental)
        ] ?? '')
  return prefix + letter
}

/**
 * The `%%percmap` key — abcjs's `pitchesToPerc`, which is a VERTICAL POSITION lookup and
 * not a pitch one.
 *
 *     var pitch = (pitchObj.accidental ? pitchObj.accidental[0] : 'x') + pitchObj.verticalPos
 *     return pitchMap[pitch]
 *
 * (`synth/pitches-to-perc.js`.) Seventeen positions, `C` to `e'`, so anything outside that
 * range has no key at all — and the prefix is the accidental's FIRST LETTER, which makes
 * both double accidentals `d` and therefore unmappable too. The table is already ported for
 * the engraver, which reads the same map for `%%percmap`'s note-head half.
 */
function percKey(pitch: { step: string; octave: number; accidental: number | null }): string {
  const position = (pitch.octave - 4) * 7 + stepIndex(pitch.step as never)
  const name = ABCJS_PERC_NOTE_NAMES[position]
  if (name === undefined) return ''
  const prefix =
    pitch.accidental === null
      ? ''
      : ({ 1: '^', '-1': '_', 0: '=' } as Record<string, string>)[String(pitch.accidental)]
  return prefix === undefined ? '' : prefix + name
}

/** The transpose in force — the clef's if it states one, else the global `%%MIDI`. */
const transposeOfFactory =
  (global: number) =>
  (item: Timed): number =>
    item.clefTranspose !== 0 ? item.clefTranspose : global

/** A microtone's alteration in abcjs's units — `^/` is +0.25, `_3/2` is -0.75. */
function quarterAlter(event: MusicEvent): number | null {
  const cents = event.type === 'rest' ? 0 : event.microtoneCents
  return cents === 0 ? null : cents / 200
}

/** `startSlur`/`endSlur` counts, which a chord carries on its own events. */
const slurStartsOf = (event: MusicEvent): number =>
  event.type === 'note' ? event.slurStarts : event.type === 'chord' ? event.slurStarts : 0
const slurEndsOf = (event: MusicEvent): number =>
  event.type === 'note' ? event.slurEnds : event.type === 'chord' ? event.slurEnds : 0

/**
 * abcjs's `processVolume`, and it is a BEAT-STRESS model rather than a dynamic one.
 *
 * The bar's first note is 105, any note landing on a whole beat is 95, everything else is
 * 85 — and a note inside the PICKUP takes the weak 85 whatever beat it lands on
 * (`abc_midi_flattener.js:352-391`). `!p!` and friends override it outright; those are the
 * `vol` elements, which arrive separately.
 */
function stressVolume(
  start: number,
  lastBarTime: number,
  meter: Meter,
  pickupLength: number,
  voiceOff: boolean,
  stress: readonly [number, number, number],
): number {
  if (voiceOff) return 0
  const clamp = (v: number) => Math.max(0, Math.min(127, v))
  if (pickupLength > start) return clamp(stress[2])
  const barBeat = (start - lastBarTime) / beatFractionOf(meter)
  if (barBeat === 0) return clamp(stress[0])
  return clamp(Number.isInteger(barBeat) ? stress[1] : stress[2])
}

/**
 * `numNotesToDecoration` and `endingVolume`, folded into the one number they produce.
 *
 * The hairpin's total travel is divided by how many NOTES are under it and floored, so a
 * crescendo over three notes steps by 16 and not by 16.67. If a named dynamic sits within
 * TWO events of the close, abcjs takes that as the destination instead of the flat 50
 * (`endingVolume`, "If we have a volume within a couple notes of the end then assume that
 * is the destination").
 */
function hairpinStep(
  timed: readonly Timed[],
  index: number,
  from: number,
  close: string,
  size: number,
): number {
  const line = timed[index]?.line
  let notes = 0
  let end = timed.length
  for (let i = index + 1; i < timed.length && timed[i]?.line === line; i += 1) {
    if (timed[i]?.kind === 'note') notes += 1
    if ((timed[i]?.decorations ?? []).map(canonical).includes(close)) {
      end = i
      break
    }
  }
  let target = size > 0 ? Math.min(127, from + size) : Math.max(15, from + size)
  // `endingVolume` — "If we have a volume within a couple notes of the end then assume
  // that is the destination." Three ELEMENTS, not three notes, and it starts one past the
  // close.
  for (let i = end + 1; i < Math.min(timed.length, end + 4); i += 1) {
    if (timed[i]?.line !== line) break
    if (timed[i]?.kind !== 'note') continue
    const named = DYNAMIC_ORDER.find((d) =>
      (timed[i]?.decorations ?? []).map(canonical).includes(d),
    )
    if (named !== undefined) {
      target = (DYNAMIC_VOLUMES[named] as readonly number[])[0] as number
      break
    }
  }
  return notes > 0 ? Math.floor((target - from) / notes) : 0
}

/**
 * abcjs's `findNoteModifications` — three unrelated things off one decoration list.
 *
 * The ORNAMENTS are the third, and they do not modify the note: they REPLACE it. When
 * `noteModification` is set, `writeNote` calls `doModifiedNotes` INSTEAD of pushing the
 * note, so an ornamented note never reaches the articulation switch and gets no `endType`
 * and no `gap` of its own — a `!staccato!!trill!C` is a trill and nothing else.
 *
 * `uppermordent` resolves to `pralltriller` — the two are the same sound and abcjs writes
 * that mapping out rather than aliasing the name.
 */
const ORNAMENTS: Readonly<Record<string, string>> = {
  trill: 'trill',
  trillh: 'trillh',
  lowermordent: 'lowermordent',
  uppermordent: 'pralltriller',
  pralltriller: 'pralltriller',
  mordent: 'mordent',
  turn: 'turn',
  roll: 'roll',
}

function noteModifications(
  decorations: readonly string[],
  velocity: number,
): { endType?: string; velocity?: number; ornament?: string } {
  const out: { endType?: string; velocity?: number; ornament?: string } = {}
  for (const d of decorations) {
    if (d === 'staccato') out.endType = 'staccato'
    else if (d === 'tenuto') out.endType = 'tenuto'
    else if (d === 'accent') out.velocity = Math.min(127, velocity * 1.5)
    else if (ORNAMENTS[d] !== undefined) out.ornament = ORNAMENTS[d]
  }
  return out
}

/**
 * `doModifiedNotes` — an ornament is a RUN of 1/32 notes, and the run overruns the note.
 *
 * The unit is a flat `durationRounded(1/32)` for every ornament but the turn, which takes a
 * QUARTER of the note however long that is. Two shapes:
 *
 * - a LOOP (`trill`, `trillh`, `roll`) runs `while (runningDuration > 0)`, so the last note
 *   of the run is a whole 1/32 even when only a sliver of the written duration is left —
 *   the sounding total therefore rounds UP to the next 1/32 and does not equal the note;
 * - a FIXED shape (`mordent`, `pralltriller`) writes two 1/32s and then gives the REST of
 *   the duration to a third note, which is the only one of the three with no
 *   `style: 'decoration'` on it.
 *
 * A `roll` steps by `shortestNote * 2` while writing notes of `shortestNote`, so it is a
 * repeated note with a silence of its own length between each — half as many notes as a
 * trill of the same length, not a run of the same density.
 */
function doModifiedNotes(
  ornament: string,
  base: MidiNote,
  factor: number,
  out: MidiEvent[],
): void {
  const unit = Math.round((1 / 32) * factor * MICRO) / MICRO
  let start = base.start
  let left = base.duration
  const push = (pitch: number, duration: number, decoration = true): void => {
    out.push({
      cmd: 'note',
      pitch,
      volume: base.volume,
      start,
      duration,
      gap: 0,
      instrument: base.instrument,
      ...(decoration ? { style: 'decoration' } : {}),
    })
  }
  switch (ornament) {
    case 'trill':
    case 'trillh': {
      const step = ornament === 'trill' ? 2 : 1
      let note = step
      while (left > 0) {
        push(base.pitch + note, unit)
        note = note === step ? 0 : step
        left -= unit
        start += unit
      }
      break
    }
    case 'pralltriller':
    case 'mordent':
    case 'lowermordent': {
      const away = ornament === 'pralltriller' ? 2 : -2
      push(base.pitch, unit)
      left -= unit
      start += unit
      push(base.pitch + away, unit)
      left -= unit
      start += unit
      push(base.pitch, left, false)
      break
    }
    case 'turn': {
      const quarter = base.duration / 4
      for (const offset of [2, 0, -1, 0]) {
        push(base.pitch + offset, quarter)
        start += quarter
      }
      break
    }
    case 'roll': {
      while (left > 0) {
        push(base.pitch, unit)
        left -= unit * 2
        start += unit * 2
      }
      break
    }
  }
}

/**
 * The gap after a note, which is abcjs's articulation model and is three different units.
 *
 * A slurred note OVERLAPS the next by a millisecond; a staccato one is cut by 0.4 of its
 * own duration converted through the tempo; everything else has no gap at all
 * (`abc_midi_flattener.js:605-616`). A SLUR beats the note's own decoration, because the
 * `endType` is set from `slurCount` first and the decoration only fills in when no slur is
 * open.
 */
function endTypeAndGap(
  decorationEnd: string | undefined,
  slurCount: number,
  duration: number,
  startingTempo: number,
): { endType?: string; gap: number } {
  const endType = slurCount > 0 ? 'tenuto' : decorationEnd
  switch (endType) {
    case 'tenuto':
      return { endType, gap: SLURRED_GAP }
    case 'staccato':
      return { endType, gap: (startingTempo / 60) * (duration * STACCATO_FRACTION) }
    default:
      return { gap: NORMAL_GAP }
  }
}

/**
 * abcjs's `adjustPitch`, in our pitch model.
 *
 * `extractOctave(pitch) * 12 + scale[extractNote(pitch)] + 60` — where abcjs's `pitch` is
 * an index with 0 at middle C, so ours is the same number written as a scientific octave.
 * An explicit accidental is recorded for the rest of the BAR at that written pitch and
 * supersedes the key; without one the key's alteration applies.
 */
function midiPitchOf(
  pitch: { step: string; octave: number; accidental: number | null },
  accidentals: readonly number[],
  barAccidentals: Map<string, number>,
  quarter: number | null = null,
): number {
  const step = stepIndex(pitch.step as never)
  const name = `${pitch.step}${pitch.octave}`
  // A QUARTER-TONE ACCIDENTAL IS 0.25, NOT THE PRINTED SIGN. Our model keeps the drawn
  // accidental and records the sounding deviation beside it in `microtoneCents`; abcjs has
  // one number and marks the fraction. Passing the printed sharp through here would sound
  // `^/G` a full semitone up and then bend it further.
  if (quarter !== null) barAccidentals.set(name, quarter)
  else if (pitch.accidental !== null) barAccidentals.set(name, pitch.accidental)
  const base = (pitch.octave - 4) * 12 + (SEMITONES[step] ?? 0) + 60
  const alter = barAccidentals.get(name) ?? accidentals[step] ?? 0
  return base + alter
}

/**
 * abcjs's `adjustForMicroTone` — a quarter tone is a WHOLE pitch plus a PITCH BEND.
 *
 *     if (pitch.indexOf(".75") >= 0) { pitch = Math.round(pitch); cents = -50 }
 *     else if (pitch.indexOf(".25") >= 0) { pitch = Math.round(pitch); cents = 50 }
 *
 * (`abc_midi_flattener.js:735-747`, and yes it tests the decimal as a STRING.) A synth is
 * handed an integer note and a detune, never a fractional MIDI pitch, so `70.5` is not a
 * near miss — it is the wrong KIND of answer.
 */
function adjustForMicroTone(pitch: number): { pitch: number; cents?: number } {
  const text = String(pitch)
  if (text.includes('.75')) return { pitch: Math.round(pitch), cents: -50 }
  if (text.includes('.25')) return { pitch: Math.round(pitch), cents: 50 }
  return { pitch }
}
