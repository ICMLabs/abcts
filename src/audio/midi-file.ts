/**
 * THE MIDI FILE WRITER — abcjs's `abc_midi_create.js` + `abc_midi_renderer.js`.
 *
 * ── WHAT THIS IS AND WHY IT IS IN SCOPE ──────────────────────────────────────
 * A SERIALIZATION of the event list `flatten.ts` produces, not a second engine. The parity
 * surface for audio is EVENT GENERATION, and soundfonts and WebAudio are out of scope as
 * host playback — but a Standard MIDI File is neither: `abcjs.synth.getMidiFile` is a
 * public API returning bytes, and bytes are checkable. It is the one oracle in this repo
 * with NO tolerance and NO excluded axis.
 *
 * ── THE FORMAT, IN ONE PARAGRAPH ─────────────────────────────────────────────
 * abcjs builds the whole file as a PERCENT-ENCODED STRING — `%4d%54%68%64` and so on —
 * rather than as bytes, and hands it back as a `data:audio/midi,` URI. That is reproduced
 * exactly, because it is what the oracle records and because the string IS the public
 * return value: `midiOutputType: "binary"` decodes this same string three characters at a
 * time. Every byte therefore costs three characters, which is why `endTrack` divides by
 * three to get a length.
 *
 * ── FOUR abcjs QUIRKS THAT ARE REPRODUCED ON PURPOSE ─────────────────────────
 * 1. **The program change is always on channel 0.** `setInstrument` writes `"%00%C0"`
 *    with the channel hard-coded, so a tune on `%%MIDI channel 4` emits its控 program on
 *    `%C0` and every note on `%94`. The golden has it; it is abcjs's bug, and strict's job.
 * 2. **A pitch is not zero-padded.** `"%" + pitch.toString(16)` — a pitch below 0x10 would
 *    emit two characters where every other byte takes three and shift the whole file. No
 *    real pitch is that low, and abcjs has the same hole.
 * 3. **The instrument LEAKS between tracks.** `startTrack` re-emits `this.instrument` if one
 *    was ever set, so track two carries track one's program even having never asked for one.
 * 4. **An empty key still writes a key signature.** `keySignature` bails on a missing
 *    `accidentals` but not on an EMPTY one, so `K:cm` — which abcjs reads as no key at all,
 *    its lowercase key letters being commented out — emits `%00%FF%59%02%00%00` rather than
 *    nothing. `midi-staccato` is that tune.
 *
 * ── AND ONE THING IT SURFACED THAT THE EVENT TABLE COULD NOT ─────────────────
 * The TRACK NAME. `%FF%03` carries `V:… name=`, and nothing in `tests/corpus-audio`'s 54
 * cases writes a named voice, so `cmd: 'text'` was a type in `flatten.ts` that nothing ever
 * produced. A surface that re-derives the same answer a different way is worth more than
 * one that agrees by construction — that is the whole argument for this file, and it paid
 * before a byte of it was compared.
 */
import { type DiatonicStep, keyFifths, plainText, type Score } from '../core/model.js'
import { type AudioOptions, flattenAudio, type MidiEvent } from './flatten.js'
import { getMeter, millisecondsPerMeasureOf } from './timing.js'

export interface MidiFileOptions extends AudioOptions {
  /** Per-track stereo placement, -1 to 1. abcjs's `pan`, indexed by TRACK. */
  readonly pan?: readonly number[]
}

/** 480 ticks to the quarter — `%01%e0` in the header — so a whole note is 1920. */
const BASE_DURATION = 480 * 4

/** `n` as `%XX` bytes, left-padded and then TRUNCATED to `padding` hex digits. */
function toHex(n: number, padding: number): string {
  let s = Math.trunc(n).toString(16)
  while (s.length < padding) s = `0${s}`
  if (s.length > padding) s = s.substring(0, padding)
  let out = ''
  for (let i = 0; i < s.length; i += 2) out += `%${s.substring(i, i + 2)}`
  return out
}

/**
 * A MIDI variable-length quantity — the delta time before every event.
 *
 * Seven bits per byte, high bit set on all but the last. abcjs assembles it into a single
 * NUMBER by shifting, then hexes that, which caps it at four bytes; a rest longer than
 * 2^28 ticks would break both engines identically and no tune is 155 hours long.
 */
function toDurationHex(nIn: number): string {
  let n = Math.round(nIn)
  const chunks: number[] = []
  while (n !== 0) {
    chunks.push(n & 0x7f)
    n = n >> 7
  }
  let res = 0
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    res = res << 8
    let bits = chunks[i] as number
    if (i !== 0) bits = bits | 0x80
    res = res | bits
  }
  let padding = res.toString(16).length
  padding += padding % 2
  return toHex(res, padding)
}

/** A 14-bit value split across two 7-bit bytes — the pitch wheel's encoding. */
function to7BitHex(nIn: number): string {
  const n = Math.round(nIn)
  const lower = n % 128
  return toHex((n - lower) * 2 + lower, 4)
}

/** `%00%FF<type><len><bytes>` — a text meta event, its length counted in BYTES. */
function encodeString(str: string, cmdType: string): string {
  let bytes = ''
  for (let i = 0; i < str.length; i += 1) bytes += toHex(str.charCodeAt(i), 2)
  return `%00%FF${cmdType}${toHex(bytes.length / 3, 2)}${bytes}`
}

/** `2^(cents/1200)` — abcjs's `cents-to-factor`, for the pitch wheel. */
const centsToFactor = (cents: number): number => 2 ** (cents / 1200)

/** For the pitch wheel — the distance from C to C#. */
const HALF_STEP = 4096

/**
 * The renderer, one track at a time. A direct port of `Midi` in `abc_midi_renderer.js`,
 * kept as a class for the same reason abcjs keeps it as one: every method appends to a
 * running string and the ORDER is the format.
 */
/** abcjs's own key object, which is what a host driving the renderer passes. */
export interface AbcjsKey {
  readonly accidentals?: readonly { readonly acc?: string }[]
  readonly mode?: string
}

/** As little of the DOM as `embed` touches. */
interface EmbedElement {
  innerHTML: string
  setAttribute(name: string, value: string): void
}
interface EmbedDocument {
  createElement(tag: string): EmbedElement
}
export interface EmbedParent {
  readonly firstChild: unknown
  insertBefore(node: unknown, before: unknown): void
}

export class MidiWriter {
  private trackstrings = ''
  private trackcount = 0
  private track = ''
  private trackName = ''
  private trackInstrument = ''
  private silencelength = 0
  private channel = 0
  private instrument: number | undefined
  private noteOnAndChannel = '%90'
  private noteOffAndChannel = '%80'
  private noteWarped: Record<number, boolean> = {}

  /**
   * `setTempo(qpm)` — the FIRST track and nothing else, exactly as `setGlobalInfo` is:
   * both open with `if (this.trackcount === 0)` (`abc_midi_renderer.js:22-28`). A host
   * driving the renderer itself uses this one when it has no key or meter to state.
   */
  setTempo(qpm: number): void {
    if (this.trackcount !== 0) return
    this.startTrack()
    this.track += `%00%FF%51%03${toHex(Math.round(60000000 / qpm), 6)}`
    this.endTrack()
  }

  setGlobalInfo(
    qpm: number,
    name: string,
    key: Score['key'] | AbcjsKey | undefined,
    time: { num: number; den: number },
  ) {
    if (this.trackcount !== 0) return
    this.startTrack()
    this.track += `%00%FF%51%03${toHex(Math.round(60000000 / qpm), 6)}`
    if (key !== undefined) this.track += keySignature(key)
    this.track += timeSignature(time)
    if (name) this.track += encodeString(name, '%01')
    this.endTrack()
  }

  startTrack(): void {
    this.noteWarped = {}
    this.track = ''
    this.trackName = ''
    this.trackInstrument = ''
    this.silencelength = 0
    this.trackcount += 1
    /**
     * THE INSTRUMENT LEAKS. abcjs re-states whatever was last set, so a second track that
     * never asked for a program still carries the first one's — which is why both voices
     * of `midi-piano` emit `%00%C0%04`.
     *
     * ⚠️ **AND THE TEST IS TRUTHINESS, SO PROGRAM 0 DOES NOT LEAK.** `if (this.instrument)`
     * (`abc_midi_renderer.js:55-57`) — the Acoustic Grand is program 0, so a track that
     * asked for it explicitly leaves the NEXT track with none at all. Measured through the
     * renderer directly: a second track after `setInstrument(0)` opens at its control
     * changes, where ours emitted `%00%C0%00` first and made the track three bytes longer.
     */
    if (this.instrument) this.setInstrument(this.instrument)
  }

  endTrack(): void {
    // The name and the instrument are PREPENDED, so they precede the control changes
    // `setChannel` appended even though `setChannel` ran first.
    this.track = this.trackName + this.trackInstrument + this.track
    const length = toHex(this.track.length / 3 + 4, 8)
    this.trackstrings += `MTrk${length}${this.track}%00%FF%2F%00`
  }

  setText(type: string, text: string): void {
    if (type === 'name') this.trackName = encodeString(text, '%03')
  }

  setInstrument(program: number): void {
    // `%C0` — the channel is HARD-CODED at 0 in abcjs, whatever `setChannel` was given.
    this.trackInstrument = `%00%C0${toHex(program, 2)}`
    this.instrument = program
  }

  setChannel(channel: number, panIn: number | undefined): void {
    this.channel = channel
    const cc = `%00%B${channel.toString(16)}`
    this.track += `${cc}%79%00` // Reset All Controllers
    this.track += `${cc}%40%00` // Damper pedal
    this.track += `${cc}%5B%30` // Effect 1 Depth (reverb)
    const pan = Math.round(((panIn ?? 0) + 1) * 64)
    this.track += `${cc}%0A${toHex(pan, 2)}` // Pan, -1..1 mapped onto 0..127
    this.track += `${cc}%07%64` // Channel Volume
    this.noteOnAndChannel = `%9${channel.toString(16)}`
    this.noteOffAndChannel = `%8${channel.toString(16)}`
  }

  startNote(pitch: number, loudness: number, cents: number | undefined): void {
    this.track += toDurationHex(this.silencelength)
    this.silencelength = 0
    if (cents) {
      this.track += `%e${this.channel.toString(16)}`
      this.track += to7BitHex(0x2000 + Math.round(centsToFactor(cents) * HALF_STEP))
      this.track += toDurationHex(0)
      this.noteWarped[pitch] = true
    }
    this.track += this.noteOnAndChannel
    // NOT zero-padded — abcjs's own `"%" + pitch.toString(16)`.
    this.track += `%${pitch.toString(16)}${toHex(loudness, 2)}`
  }

  endNote(pitch: number): void {
    this.track += toDurationHex(this.silencelength)
    this.silencelength = 0
    if (this.noteWarped[pitch]) {
      this.track += `%e${this.channel.toString(16)}`
      this.track += to7BitHex(0x2000)
      this.track += toDurationHex(0)
      this.noteWarped[pitch] = false
    }
    this.track += this.noteOffAndChannel
    this.track += `%${pitch.toString(16)}%00`
  }

  addRest(length: number): void {
    this.silencelength += length
    if (this.silencelength < 0) this.silencelength = 0
  }

  /**
   * `embed(parent, noplayer)` — a download link and, unless suppressed, an `<embed>` player
   * (`abc_midi_renderer.js:150-172`). Both are inserted BEFORE the parent's first child, so
   * the player ends up above the link that was inserted before it.
   */
  embed(parent: EmbedParent, noplayer?: boolean): void {
    const doc = (globalThis as { document?: EmbedDocument }).document
    if (doc === undefined) return
    const data = this.getData()
    const link = doc.createElement('a')
    link.setAttribute('href', data)
    link.innerHTML = 'download midi'
    parent.insertBefore(link, parent.firstChild)
    if (noplayer) return
    const player = doc.createElement('embed')
    for (const [name, value] of [
      ['src', data],
      ['type', 'video/quicktime'],
      ['controller', 'true'],
      ['autoplay', 'false'],
      ['loop', 'false'],
      ['enablejavascript', 'true'],
      ['style', 'display:block; height: 20px;'],
    ])
      player.setAttribute(name as string, value as string)
    parent.insertBefore(player, parent.firstChild)
  }

  getData(): string {
    return `data:audio/midi,MThd%00%00%00%06%00%01${toHex(this.trackcount, 4)}%01%e0${this.trackstrings}`
  }
}

/**
 * `%00%FF%59%02<sig><mode>` — and it counts ACCIDENTALS, not fifths, which is the same
 * number until it is negative: flats are written as `256 - n`, a two's-complement byte.
 *
 * The empty-but-present case is quirk 4 above: abcjs bails on a MISSING `accidentals` and
 * not on an empty one, so a keyless tune still writes `%00%00`.
 */
/**
 * **THE KEY COMES IN TWO SHAPES AND abcjs COUNTS THE ACCIDENTALS.** Its own
 * `keySignature(key)` walks `key.accidentals`, adding one per `sharp` and subtracting one
 * from 256 per `flat`, and writes `%01` for mode `"m"` (`abc_midi_renderer.js:180-196`) —
 * so a host driving `midiRenderer` hands it that object. Ours is handed the model's key and
 * counts fifths, which is the same number by construction. Both are accepted, because the
 * class is public now.
 */
function keySignature(key: Score['key'] | AbcjsKey): string {
  const accidentals = (key as AbcjsKey).accidentals
  if (accidentals !== undefined) {
    let sharps = 0
    let flats = 256
    for (const entry of accidentals) {
      if (entry.acc === 'sharp') sharps += 1
      else if (entry.acc === 'flat') flats -= 1
    }
    const sig = flats !== 256 ? toHex(flats, 2) : toHex(sharps, 2)
    return `%00%FF%59%02${sig}${(key as AbcjsKey).mode === 'm' ? '%01' : '%00'}`
  }
  /**
   * ⚠️ **abcjs COUNTS THE ACCIDENTALS IT WOULD DRAW, AND A `K:` MODIFIER CHANGES THAT LIST.**
   * The fifths of the key NAME are only the starting point: `K:` field accidentals REPLACE a
   * standard one on the same letter and otherwise append
   * (`abc_parse_key_voice.js:320-350`), and `keySignature` then counts `acc === "sharp"` and
   * `acc === "flat"` and **ignores everything else** (`abc_midi_renderer.js:187-192`).
   *
   * So the list, not the name, decides:
   *
   *     K:C m=B                natural B, flat e, flat A   -> TWO flats, %fe
   *     K: C ^/f _/B _A ^D     quarter marks + flat A + sharp D -> ONE flat, %ff
   *
   * We took `keyFifths` alone, which is the key name's answer — three flats for C minor,
   * none for C major — and wrote `%fd` and `%00`. A NATURAL is not a flat, and a QUARTER
   * tone is neither: abcjs's two `===` tests admit only the exact words.
   */
  const own = key as Score['key']
  const fifths = keyFifths(own)
  const useSharps = fifths > 0
  const order = useSharps ? KEY_SHARP_ORDER : KEY_FLAT_ORDER
  const list: { step: DiatonicStep; quarters: number }[] = order
    .slice(0, Math.abs(fifths))
    .map((step) => ({ step, quarters: useSharps ? 2 : -2 }))
  for (const e of own.extra ?? []) {
    const at = list.findIndex((b) => b.step === e.step)
    if (at >= 0) list[at] = { step: e.step, quarters: e.quarters }
    else list.push({ step: e.step, quarters: e.quarters })
  }
  let sharps = 0
  let flats = 256
  for (const a of list) {
    if (a.quarters === 2) sharps += 1
    else if (a.quarters === -2) flats -= 1
  }
  const sig = flats !== 256 ? toHex(flats, 2) : toHex(sharps, 2)
  const mode = own.mode === 'minor' ? '%01' : '%00'
  return `%00%FF%59%02${sig}${mode}`
}

/**
 * The order sharps and flats join a key signature, as STEP LETTERS — `flatten.ts` holds the
 * same order as indices and does not export it, and `KeyAccidental.step` is the letter.
 */
const KEY_SHARP_ORDER: readonly DiatonicStep[] = ['f', 'c', 'g', 'd', 'a', 'e', 'b']
const KEY_FLAT_ORDER: readonly DiatonicStep[] = ['b', 'e', 'a', 'd', 'g', 'c', 'f']

/**
 * `%00%FF%58%04<num><den><clocks>%08` — and BOTH lookups can fail closed.
 *
 * A denominator outside 1..32 and a meter outside the listed set each return "", so the
 * file simply has no time signature. That is abcjs's `if (!den) return ""` and
 * `if (!clocks) return ""`, and the second one is easy to miss: 7/8 is a legal meter with
 * no entry, so a Balkan tune writes no time signature at all.
 */
const DENOMINATORS: Readonly<Record<number, number>> = { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5 }
const CLOCKS: Readonly<Record<string, number>> = {
  '2/4': 24,
  '3/4': 24,
  '4/4': 24,
  '5/4': 24,
  '6/4': 72,
  '2/2': 48,
  '3/2': 48,
  '4/2': 48,
  '3/8': 36,
  '6/8': 36,
  '9/8': 36,
  '12/8': 36,
}

function timeSignature(time: { num: number; den: number }): string {
  const den = DENOMINATORS[time.den]
  if (den === undefined || den === 0) {
    // `if (!den)` — so a denominator of 1 fails too, its index being 0. Reproduced.
    if (den !== 0) return ''
    return ''
  }
  const clocks = CLOCKS[`${time.num}/${time.den}`]
  if (clocks === undefined) return ''
  return `%00%FF%58%04${toHex(time.num, 2)}${toHex(den, 2)}${toHex(clocks, 2)}%08`
}

/**
 * `abc_midi_create.js` — the event list laid onto a tick grid, one track at a time.
 *
 * THE NOTE PLACEMENT IS A MAP KEYED BY TIME, not a list, and that is the whole of the
 * algorithm: every note contributes an ON at its start and an OFF at
 * `start + duration - gap * beatsPerSecond`, both filed under their time; the times are
 * then sorted and walked, with the gap between consecutive times becoming a rest. Two notes
 * that start together therefore emit at the same delta and a chord costs one rest, not
 * three — and a staccato gap shortens the OFF without moving the next ON.
 */
export function midiFile(score: Score, options: MidiFileOptions = {}): string {
  // SOURCE ORDER, because `getMidiFile` never engraves. See `chordsInSourceOrder`: the
  // chord sort belongs to the ENGRAVER, and abcjs's string entry point parses without one.
  const commands = flattenAudio(score, { ...options, chordsInSourceOrder: true })
  const midi = new MidiWriter()

  let title = plainText(score.metadata.titles[0] ?? null)
  if (title.length > 128) title = `${title.substring(0, 124)}...`
  /**
   * **abcjs PASSES `abcTune.getMeterFraction()`, WHICH IS A WALK LIKE THE KEY IS.**
   * `getMeter()` scans `lines[].staff[].meter` and answers the FIRST it finds, falling
   * through to `common_time` (`data/abc_tune.js:181-193`); `getMeterFraction` then reduces
   * it to a num/den, summing a `2+3` numerator and mapping cut and common time
   * (`:195-218`).
   *
   * ⚠️ **THE STAFF'S METER IS NOT THE HEADER'S.** A standalone body `M:` written before any
   * music on its line REPLACES the staff's in place — `appendStartingElement`'s "same type
   * → replace" arm — so `M:4/4` in the header followed by `M:2/4` in the body is a **2/4**
   * tune to `getMeter`. We read `score.meter`, the header's, and wrote `%FF%58%04%04` where
   * abcjs writes `%02`.
   *
   * ⚠️ **AND THE RULE WAS ALREADY PORTED ONCE, IN `chord-grid.ts`**, whose own comment
   * spells it out — "the FIRST meter on any staff of any line… not the header's" — and
   * which reaches it through `score.meter ?? <walk>`, header-first, so it would answer 4/4
   * here too. `timing.ts`'s `getMeter` is the one that walks properly, and it is in the
   * file this already imports `millisecondsPerMeasureOf` from. **A RULE PORTED AT THE SITE
   * THAT NAMED IT IS NOT A RULE PORTED** — third time in this file's own history.
   */
  const m = getMeter(score)
  const time =
    m.symbol === 'common'
      ? { num: 4, den: 4 }
      : m.symbol === 'cut'
        ? { num: 2, den: 2 }
        : {
            num:
              m.numeratorParts === undefined
                ? m.numerator
                : m.numeratorParts.reduce((t, part) => t + part, 0),
            den: m.denominator,
          }

  // ponytail: abcjs's COMPOUND-METER tempo fix is not ported — for `den === 8` with a
  // numerator other than 5 or 7 it recomputes the tempo from `millisecondsPerMeasure()`,
  // which is a method on its laid-out tune and not on an event list. None of the three
  // harvested cases is in 6/8; the table will say so when one is, and the fix belongs with
  // whatever else ends up needing `millisecondsPerMeasure`.
  /**
   * **AN EIGHTH-NOTE METER RECOMPUTES THE TEMPO FROM THE MEASURE'S DURATION, AND HALVES IT.**
   *
   *     if (time.den === 8 && time.num !== 5 && time.num !== 7) {
   *       var msPerMeasure = abcTune.millisecondsPerMeasure();
   *       tempo = (60000 / (msPerMeasure/time.num)) / 2;
   *       beatsPerSecond = tempo/60;
   *     }
   *
   * (`abc_midi_create.js:26-35`, whose own comment is "Fix for x/8 meter tempos".) 5/8 and
   * 7/8 are excluded BY NAME — they do not divide into equal dotted beats — and every other
   * eighth-note meter takes it, 3/8 and 11/8 included.
   *
   * ⚠️ **THIS WAS MARKED UNPORTED WITH A `ponytail:` SAYING IT NEEDED
   * `millisecondsPerMeasure`, "a method on its laid-out tune and not on an event list".**
   * It is not: `timing.ts` already exports `millisecondsPerMeasureOf(score)` over the
   * SCORE, written for the `setTiming` arc. **The answer was in this repo already** —
   * `CLAUDE.md` records the same thing happening for `padOverlays` and three parser inputs.
   * Grep this repo for the rule before porting it.
   *
   * The same note predicted "none of the three harvested cases is in 6/8; the table will
   * say so when one is." The table said so: `Q:3/8=60` under `M:6/8` is a 2000ms measure,
   * so abcjs plays it at `(60000/(2000/6))/2` = **90bpm** where we took `Q:`'s 60 — 666,667
   * microseconds against our 1,000,000. Five corpus tunes, every one `den === 8`.
   *
   * `beatsPerSecond` is recomputed WITH it, so this moves note timings and not just the
   * tempo meta event.
   */
  let tempo = commands.tempo
  let beatsPerSecond = tempo / 60
  if (time.den === 8 && time.num !== 5 && time.num !== 7) {
    const msPerMeasure = millisecondsPerMeasureOf(score)
    tempo = 60000 / (msPerMeasure / time.num) / 2
    beatsPerSecond = tempo / 60
  }

  /**
   * ⚠️ **abcjs PASSES `abcTune.getKeySignature()` HERE, WHICH IS A WALK AND NOT A FIELD.**
   * It scans `lines[].staff[]` for the first `key` and returns **`{}`** when there is none
   * (`data/abc_tune.js:222-233`). `{}` is TRUTHY, so `if (key)` passes
   * (`abc_midi_create.js:38`) and `keySignature` then bails on the missing `accidentals`
   * and returns `""` (`abc_midi_renderer.js:184`). **Two guards, and only the inner one
   * ever fires** — porting the outer `if (key)` alone is a gate nothing reaches, which is
   * how the first attempt at this moved not one byte.
   *
   * We handed it `score.key`, which is always populated — C major standing in for "no key"
   * — so the writer produced `%00%FF%59%02%00%00` for a tune abcjs writes no key signature
   * for at all: six bytes, plus six on the track length. Measured over the first 20 corpus
   * fixtures, **EIGHT of them**, every `book_parser` tune, each a header with no music.
   *
   * ⚠️ **AND `K:C` WITH MUSIC IS THE OPPOSITE CASE AND MUST KEEP ITS BYTES**: that key HAS
   * an `accidentals`, empty, and `!key.accidentals` is false for `[]` — so abcjs writes
   * `%00%FF%59%02%00%00` there. The predicate is whether the tune has a STAFF, not whether
   * the key is C, which is why this mirrors the walk rather than reading `key.none`.
   *
   * The three-case `corpus-midi` oracle could not see any of it: all three tunes have music,
   * so the walk finds a key in every row it has. **A GUARD IS INVISIBLE TO A CORPUS THAT
   * NEVER MAKES IT FALSE.**
   */
  const keyForFile = score.voices.length === 0 ? undefined : score.key
  midi.setGlobalInfo(tempo, title, keyForFile, time)

  commands.tracks.forEach((track, i) => {
    midi.startTrack()
    /** Time (in whole notes) → the note-ons and note-offs that land on it. */
    const placement = new Map<number, { pitch: number; volume: number; cents?: number }[]>()
    const at = (t: number): { pitch: number; volume: number; cents?: number }[] => {
      const found = placement.get(t)
      if (found !== undefined) return found
      const made: { pitch: number; volume: number; cents?: number }[] = []
      placement.set(t, made)
      return made
    }
    for (const event of track as readonly MidiEvent[]) {
      switch (event.cmd) {
        case 'text':
          midi.setText(event.type, event.text)
          break
        case 'program': {
          const pan = options.pan !== undefined && options.pan.length > i ? options.pan[i] : 0
          // CHANNEL 10 IS THE DRUM KIT, and abcjs switches to it on the INSTRUMENT rather
          // than on anything the tune said — program 128 means percussion, so the channel
          // becomes 9 (zero-based) and the program becomes 0.
          if (event.instrument === 128) {
            midi.setChannel(9, pan)
            midi.setInstrument(0)
          } else {
            midi.setChannel(event.channel, pan)
            midi.setInstrument(event.instrument)
          }
          break
        }
        case 'note': {
          const end = event.start + event.duration - event.gap * beatsPerSecond
          at(event.start).push({
            pitch: event.pitch,
            volume: event.volume,
            ...(event.cents === undefined ? {} : { cents: event.cents }),
          })
          at(end).push({ pitch: event.pitch, volume: 0 })
          break
        }
      }
    }
    let lastTime = 0
    for (const t of [...placement.keys()].sort((a, b) => a - b)) {
      if (t > lastTime) {
        midi.addRest((t - lastTime) * BASE_DURATION)
        lastTime = t
      }
      for (const e of placement.get(t) ?? []) {
        // A ZERO VOLUME IS THE NOTE-OFF. abcjs tests `if (event.volume)`, so a note written
        // at volume 0 — every note of a `voicesOff` voice — is a note-off at its own start
        // and never sounds. Reproduced by testing the same way.
        if (e.volume) midi.startNote(e.pitch, e.volume, e.cents)
        else midi.endNote(e.pitch)
      }
    }
    midi.endTrack()
  })

  return midi.getData()
}
