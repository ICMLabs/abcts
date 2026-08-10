/**
 * THE CHORD GRID — abcjs's `renderAbc(…, {chordGrid: …})` answer, ported.
 *
 * A rhythm chart: the tune reduced to one cell per measure, four beat slots per cell, split
 * into parts and broken eight bars to a line. abcjs publishes it on the tune object as
 * `visualObj.chordGrid` and `visual/chord-grid.test.js` asserts it directly, which is what
 * makes it portable where most of abcjs's `visual/` suite is not — it is a published
 * structure, not the internal laid-out tree.
 *
 * ── THE SOURCE IS `src/parse/chord-grid.js` AND THIS IS A LINE-BY-LINE PORT ──
 * Its own header lists sixteen numbered rules and they are the specification; the file is
 * 375 lines and every one of them is reproduced here, including the two it gets wrong on
 * purpose and the one it gets wrong by accident (see `chordNameOf`).
 *
 * ── WHY AN ADAPTER RATHER THAN A REWRITE ────────────────────────────────────
 * abcjs walks a FLAT element stream — `part`, `note`, `bar`, in source order — where our
 * model is measures holding events. Rewriting the algorithm against our shape would mean
 * re-deriving every one of those rules against a different data layout, and the rules are
 * full of order-dependent state: `nextBarEnding` spans two bar elements, `currentBar`
 * survives a barline that does not close a measure, `lastChord` runs across parts. So the
 * ADAPTER converts our measures into abcjs's stream and the algorithm is transcribed. Same
 * reasoning as the audio flattener, and the same payoff — the citations line up.
 *
 * ── REFUSALS ARE PART OF THE CONTRACT ───────────────────────────────────────
 * `chordGrid()` throws `notCommonTime` on anything but 4/4 or 2/2, and `noChords` on a tune
 * with no chord symbols; abcjs catches both and the tune simply carries no grid. Two of the
 * 23 harvested cases assert exactly that, and they are the ones an implementation written
 * from the happy path gets wrong. `null` is that answer here.
 */
import type { FreeTextBlock, Measure, MusicEvent, Score, Voice } from './core/model.js'
import { ratToNumber } from './core/model.js'

// ─── The published shape ─────────────────────────────────────────────────────

export interface GridMeasure {
  /** Four beat slots. `''` where nothing sounds; `'%'` repeats the measure before. */
  chord: string[]
  annotations?: string[]
  /** The volta number this measure opens — `'1'`, `'1,2'`. */
  ending?: string
  hasStartRepeat?: boolean
  hasEndRepeat?: boolean
  /** A blank cell used to right-justify a short second-ending line. */
  noBorder?: boolean
}

export type ChartLine =
  | { type: 'part'; name: string; lines: GridMeasure[][] }
  | { type: 'subtitle'; subtitle: string }
  | { type: 'text'; text: string }

// ─── abcjs's element stream ──────────────────────────────────────────────────

/** One entry of `element.chord` — a chord symbol or an annotation, with its position. */
interface ChordEntry {
  readonly name: string
  /** `'default'` for a chord symbol; a side for `^_<>`; `null` for the `@x,y` form. */
  readonly position: string | null
}

interface GridElement {
  readonly el_type: 'part' | 'note' | 'bar'
  /** `part` */
  readonly title?: string
  readonly chord?: readonly ChordEntry[]
  readonly decoration?: readonly string[]
  /** `note` — the WRITTEN duration in whole notes, before any tuplet ratio. */
  readonly duration?: number
  readonly tripletMultiplier?: number
  readonly rest?: { readonly type: string }
  /** `bar` — abcjs's `bar_*` name. */
  readonly type?: string
  readonly startEnding?: string
}

/** One delined section: a run of consecutive systems, or one non-music line. */
type Section =
  | { readonly kind: 'staff'; readonly voices: readonly GridElement[][] }
  | { readonly kind: 'subtitle'; readonly text: string }
  | { readonly kind: 'text'; readonly text: string }

// ─── The adapter ─────────────────────────────────────────────────────────────

const POSITIONS: Readonly<Record<string, string | null>> = {
  '^': 'above',
  _: 'below',
  '<': 'left',
  '>': 'right',
  '@': null,
}

/**
 * An annotation's POSITION and its NAME, which our model keeps welded together.
 *
 * `letter_to_chord` (`abc_parse_music.js:599-665`) strips the marker and files the rest
 * under a side; the `@` form then eats `x,y` and any whitespace after it, so
 * `"@-20,5Trombone"` is the annotation `Trombone` at no side at all. We store the marker
 * with the text because every other consumer wants it back, so it is undone here.
 *
 * A malformed `@` — no number, no comma — falls back to `above` with the `@` REMOVED by a
 * `.replace("@", "")` that has already been consumed by the `substring(1)` above it, which
 * is abcjs's own dead line and is reproduced by doing nothing.
 */
function splitAnnotation(text: string): ChordEntry {
  const marker = text[0] ?? ''
  if (!(marker in POSITIONS)) return { name: text, position: 'default' }
  const rest = text.slice(1)
  if (marker !== '@') return { name: rest, position: POSITIONS[marker] as string }
  const m = /^(-?[\d.]+),(-?[\d.]+)[ \t]*/.exec(rest)
  if (m === null) return { name: rest, position: 'above' }
  return { name: rest.slice(m[0].length), position: null }
}

/**
 * `element.chord` — ONE ARRAY, IN SOURCE ORDER, MERGED BY POSITION.
 *
 * Our model splits a note's quoted strings into `chordSymbol` (abcjs's `'default'`
 * position) and `annotations` (every other), which loses the order between them — and the
 * order is load-bearing twice over. `chordNameOf` reads `element.chord[0]` and nothing
 * else, and the annotation loop tests that same first entry rather than its own (see
 * below). `"@-20,5Trombone""F"` and `"F""@-20,5Trombone"` are therefore different tunes,
 * and `i-wish` writes the first.
 *
 * The order is recoverable because both carry SOURCE RANGES. abcjs then merges same-position
 * entries into the FIRST of that position with a `\n` between
 * (`abc_parse_music.js:200-205`) — `"^Bass Drum:""^Thump"` is one annotation of two lines,
 * not two annotations, which `i-wish` also writes. Our parser already does that merge for
 * the chord symbols; this does it for the rest.
 */
function chordsOf(event: {
  chordSymbol: string | null
  chordSymbolSourceRange: { start: number } | null
  annotations: readonly string[]
  annotationSourceRanges: readonly { start: number }[]
}): ChordEntry[] {
  const items: { entry: ChordEntry; at: number }[] = []
  if (event.chordSymbol !== null) {
    items.push({
      entry: { name: event.chordSymbol, position: 'default' },
      at: event.chordSymbolSourceRange?.start ?? 0,
    })
  }
  event.annotations.forEach((text, i) => {
    items.push({
      entry: splitAnnotation(text),
      at: event.annotationSourceRanges[i]?.start ?? 0,
    })
  })
  items.sort((a, b) => a.at - b.at)
  const merged: { name: string; position: string | null }[] = []
  for (const { entry } of items) {
    const found = merged.find((m) => m.position === entry.position)
    if (found === undefined) merged.push({ ...entry })
    else found.name = `${found.name}\n${entry.name}`
  }
  return merged
}

/** abcjs's `bar_*` names, which the grid reads for the two repeat flags. */
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

const decorationsOf = (event: MusicEvent): readonly string[] => event.decorations

/**
 * `element.duration` is the WRITTEN length, and **`tripletMultiplier` is stamped on the
 * FIRST note of the group and on nothing else** — `el.tripletMultiplier = ret.tripletQ /
 * ret.triplet` runs once, where the `(3` is read (`abc_parse_music.js:334`).
 *
 * So the grid's beat count is wrong for every tuplet and wrong by design: `(3A2G2F2` under
 * `L:1/8` counts 0.667 + 1 + 1 rather than three thirds, and two of them close a 4/4 bar
 * at 5.333 beats. The `under` fixture's own header says "triplets mess up beat counting",
 * which is the tune being a CONTROL for exactly this. Folding the ratio into every member
 * — which is what our `duration` does — makes the bar 3.9999999999999996 and it never
 * closes at all, so the tune came out one measure short.
 *
 * `isFirst` is the caller's, because our model marks membership rather than position.
 */
function noteElement(event: MusicEvent, isFirstOfTuplet: boolean): GridElement {
  const written = ratToNumber(event.notatedDuration)
  const sounding = ratToNumber(event.duration)
  return {
    el_type: 'note',
    chord: chordsOf(event),
    decoration: decorationsOf(event),
    duration: written,
    ...(isFirstOfTuplet && written !== 0 ? { tripletMultiplier: sounding / written } : {}),
    ...(event.type === 'rest' ? { rest: { type: event.kind } } : {}),
  }
}

/**
 * One voice's measures as abcjs's flat stream.
 *
 * The order within a measure is the SOURCE order — a `P:` on its own line stands before the
 * `|:` that opens the music under it, and both stand before the notes.
 */
function voiceElements(measures: readonly Measure[]): GridElement[] {
  const out: (GridElement & { startEnding?: string })[] = []
  /** Tuplet groups already opened, so only the first member carries the multiplier. */
  const tupletSeen = new Set<number>()
  for (const measure of measures) {
    if (measure.partLabel !== null) out.push({ el_type: 'part', title: measure.partLabel })
    if (measure.openingBarline !== null) {
      out.push({
        el_type: 'bar',
        type: BAR_TYPE[measure.openingBarline] ?? 'bar_thin',
        ...(measure.openingBarlineChord !== undefined ||
        (measure.openingBarlineAnnotations ?? []).length > 0
          ? {
              chord: chordsOf({
                chordSymbol: measure.openingBarlineChord ?? null,
                chordSymbolSourceRange: null,
                annotations: measure.openingBarlineAnnotations ?? [],
                annotationSourceRanges: [],
              }),
            }
          : {}),
        ...(measure.openingBarlineDecorations !== undefined
          ? { decoration: measure.openingBarlineDecorations }
          : {}),
      })
    }
    /**
     * `|1` IS ONE ELEMENT IN ABCJS AND TWO IN OUR MODEL, and the grid reads the abcjs one.
     *
     * abcjs's bar element carries `startEnding`, and the grid files it forward:
     * `nextBarEnding` is set at the bar that OPENS the ending and spent on the NEXT bar, so
     * the flag lands on the measure between them (`chord-grid.js:139-159`). We record the
     * volta on the MEASURE the ending opens, and the barline that announced it is the
     * PREVIOUS measure's closing one — `|1` splits that way — unless this measure declares
     * an opening barline of its own.
     *
     * So it is stamped on the last bar emitted, whichever of the two that is. Seven of the
     * twelve cases the table opened with were this one flag.
     */
    if (measure.volta !== null) {
      for (let i = out.length - 1; i >= 0; i -= 1) {
        const el = out[i]
        if (el?.el_type === 'bar') {
          el.startEnding = measure.volta
          break
        }
      }
    }
    for (const event of measure.events) {
      const group = event.tuplet?.group ?? null
      const first = group !== null && !tupletSeen.has(group)
      if (group !== null) tupletSeen.add(group)
      out.push(noteElement(event, first))
    }
    if (measure.closingBarline !== null) {
      out.push({
        el_type: 'bar',
        type: BAR_TYPE[measure.closingBarline] ?? 'bar_thin',
        // A CHORD AND A DECORATION CAN BE WRITTEN ON A BARLINE, and abcjs's parser moves
        // both there rather than onto the next note (`abc_parse_music.js:288-289`). The
        // grid reads both: `addDecoration` for the fermata, the chord loop for annotations.
        ...(measure.closingBarlineChord !== undefined ||
        (measure.closingBarlineAnnotations ?? []).length > 0
          ? {
              chord: chordsOf({
                chordSymbol: measure.closingBarlineChord ?? null,
                chordSymbolSourceRange: null,
                annotations: measure.closingBarlineAnnotations ?? [],
                annotationSourceRanges: [],
              }),
            }
          : {}),
        ...(measure.closingBarlineDecorations !== undefined
          ? { decoration: measure.closingBarlineDecorations }
          : {}),
      })
    }
  }
  return out
}

/**
 * `deline()` — a run of consecutive music systems is ONE section, and anything non-musical
 * between two of them ends the run (`data/deline-tune.js:13-88`).
 *
 * Ours records those blocks on the first measure of the system BELOW them (`textBefore`),
 * which is the same information read from the other side. A `%%sep` is neither a subtitle
 * nor text and abcjs's grid ignores it, so it only breaks the run.
 */
function sections(score: Score): Section[] {
  const voices = gridVoices(score)
  const first = voices[0]
  if (first === undefined) return []
  /** System index → the blocks standing above it. Taken from the driving voice. */
  const breaks = new Map<number, readonly FreeTextBlock[]>()
  let systemOfMeasure: number[] = []
  let system = -1
  first.measures.forEach((measure, i) => {
    if (measure.startsSystem || i === 0) system += 1
    systemOfMeasure[i] = system
    const blocks = measure.textBefore ?? []
    if (blocks.length > 0 && system > 0) breaks.set(system, blocks)
  })
  systemOfMeasure = systemOfMeasure // keep the map local; only the break points are used

  const out: Section[] = []
  let runStart = 0
  const flush = (from: number, to: number): void => {
    if (to <= from) return
    out.push({
      kind: 'staff',
      voices: voices.map((v) => voiceElements(measuresOfSystems(v, from, to))),
    })
  }
  for (const [at, blocks] of [...breaks.entries()].sort((a, b) => a[0] - b[0])) {
    flush(runStart, at)
    for (const block of blocks) {
      const text = block.lines.join('\n')
      if (block.role === 'subtitle') out.push({ kind: 'subtitle', text })
      else if (block.role !== 'separator') out.push({ kind: 'text', text })
    }
    runStart = at
  }
  flush(runStart, Number.POSITIVE_INFINITY)
  return out
}

/** The measures of one voice falling in systems `[from, to)`. */
function measuresOfSystems(voice: Voice, from: number, to: number): Measure[] {
  const out: Measure[] = []
  let system = -1
  voice.measures.forEach((measure, i) => {
    if (measure.startsSystem || i === 0) system += 1
    if (system >= from && system < to) out.push(measure)
  })
  return out
}

// ─── The port ────────────────────────────────────────────────────────────────

const BREAK_SYNONYMS = ['break', '(break)', 'no chord', 'n.c.', 'tacet']

const isBreak = (name: string): boolean => BREAK_SYNONYMS.includes(name.toLowerCase())

/**
 * "Use just the first chord specified - if there are multiple ones, then ignore them"
 * (`chord-grid.js:103-104`), and a BREAK counts as a chord however it was positioned:
 * `"^break"` is written above the staff like an annotation and grids as a cell.
 */
function chordNameOf(chords: readonly ChordEntry[]): string {
  const first = chords[0] as ChordEntry
  return first.position === 'default' || isBreak(first.name) ? first.name : ''
}

/**
 * `addDecoration` — the nine decorations a rhythm player cares about, promoted to
 * annotations on the cell (`chord-grid.js:352-374`).
 */
const GRID_DECORATIONS = [
  'fermata',
  'segno',
  'coda',
  'D.C.',
  'D.S.',
  'D.C.alcoda',
  'D.C.alfine',
  'D.S.alcoda',
  'D.S.alfine',
  'fine',
]

function addDecoration(element: GridElement, bar: GridMeasure): void {
  for (const d of element.decoration ?? []) {
    if (GRID_DECORATIONS.includes(d)) {
      if (bar.annotations === undefined) bar.annotations = []
      bar.annotations.push(d)
    }
  }
}

function findLastChord(measures: readonly GridMeasure[]): string | undefined {
  for (let m = measures.length - 1; m >= 0; m -= 1) {
    const chord = (measures[m] as GridMeasure).chord
    for (let c = chord.length - 1; c >= 0; c -= 1) {
      if (chord[c]) return chord[c]
    }
  }
  return undefined
}

/**
 * `flattenVoices` — one section's staves into parts of measures.
 *
 * THE FIRST STAFF'S FIRST VOICE DRIVES EVERYTHING and every other voice is a SOURCE OF
 * CHORDS ONLY: it walks the same measure count and fills in slots the driving voice left
 * empty, which is how a tune that writes its chords on an overlay (`&&`) or on a second
 * `V:` grids at all. Only the driving voice's `P:` fields make parts.
 */
function flattenVoices(voices: readonly GridElement[][]): {
  parts: ChartLine[]
  sawChord: boolean
} {
  const parts: ChartLine[] = []
  let partName = ''
  let measures: GridMeasure[] = []
  let currentBar: GridMeasure = { chord: ['', '', '', ''] }
  let lastChord = ''
  let nextBarEnding = ''

  voices.forEach((voice, index) => {
    const driving = index === 0
    let beatNum = 0
    let measureNum = 0
    for (const element of voice) {
      if (element.el_type === 'part') {
        if (measures.length > 0 && driving) {
          parts.push({ type: 'part', name: partName, lines: [measures] })
          measures = []
        }
        partName = element.title ?? ''
      } else if (element.el_type === 'note') {
        addDecoration(element, currentBar)
        const intBeat = Math.floor(beatNum)
        const chords = element.chord ?? []
        if (chords.length > 0) {
          const chordName = chordNameOf(chords)
          if (chordName) {
            // "Be sure there is a chord for the first beat in a measure."
            if (intBeat > 0 && !currentBar.chord[0]) currentBar.chord[0] = lastChord
            lastChord = chordName
            if (currentBar.chord[intBeat]) {
              // A chord written slightly early — an eighth before the beat — goes on the
              // NEXT slot rather than overwriting what is already there.
              if (intBeat < 4 && !currentBar.chord[intBeat + 1]) {
                currentBar.chord[intBeat + 1] = chordName
              }
            } else currentBar.chord[intBeat] = chordName
          }
          for (const ch of chords) {
            // ABCJS TESTS THE FIRST CHORD HERE AND NOT THIS ONE — `chord.name`, not
            // `ch.name` (`chord-grid.js:118`). So one break synonym at the head of the
            // list suppresses EVERY annotation on the element, and `"^break"` on a note
            // that also carries `"^Roll"` loses the Roll. Reproduced deliberately: it is
            // the difference between `douce` passing and not.
            if (ch.position !== 'default' && !isBreak((chords[0] as ChordEntry).name)) {
              if (currentBar.annotations === undefined) currentBar.annotations = []
              currentBar.annotations.push(ch.name)
            }
          }
        }
        if (element.rest?.type !== 'spacer') {
          // A zero-duration NOTE is stemless and counts as a quarter; a zero-duration rest
          // counts as nothing.
          const dur = element.duration === 0 && element.rest === undefined ? 0.25 : (element.duration ?? 0)
          const thisDuration = Math.floor(dur * 4)
          if (thisDuration > 4) {
            measureNum += Math.floor(thisDuration / 4)
            beatNum = 0
          } else {
            let thisBeat = dur * 4
            if (element.tripletMultiplier) thisBeat *= element.tripletMultiplier
            beatNum += thisBeat
          }
        }
      } else if (element.el_type === 'bar') {
        if (nextBarEnding) {
          currentBar.ending = nextBarEnding
          nextBarEnding = ''
        }
        addDecoration(element, currentBar)
        for (const ch of element.chord ?? []) {
          if (ch.position !== 'default') {
            if (currentBar.annotations === undefined) currentBar.annotations = []
            currentBar.annotations.push(ch.name)
          }
        }
        if (element.type === 'bar_dbl_repeat' || element.type === 'bar_left_repeat') {
          currentBar.hasStartRepeat = true
        }
        if (element.type === 'bar_dbl_repeat' || element.type === 'bar_right_repeat') {
          currentBar.hasEndRepeat = true
        }
        if (element.startEnding) nextBarEnding = element.startEnding
        if (beatNum >= 4) {
          if (currentBar.chord[0] === '') {
            // No chord on beat one, but one later in the bar: repeat the last one found.
            if (currentBar.chord[1] || currentBar.chord[2] || currentBar.chord[3]) {
              currentBar.chord[0] = findLastChord(measures) ?? ''
            }
          }
          if (driving) measures.push(currentBar)
          else {
            // A NON-DRIVING VOICE FILLS IN BLANKS BY MEASURE INDEX, walking forward through
            // the parts already built — `lines[0]` because the line breaks have not been
            // made yet.
            let index2 = measureNum
            let partIndex = 0
            while (
              partIndex < parts.length &&
              index2 >= ((parts[partIndex] as { lines: GridMeasure[][] }).lines[0]?.length ?? 0)
            ) {
              index2 -= (parts[partIndex] as { lines: GridMeasure[][] }).lines[0]?.length ?? 0
              partIndex += 1
            }
            const line = (parts[partIndex] as { lines: GridMeasure[][] } | undefined)?.lines[0]
            const bar = line?.[index2]
            if (bar !== undefined) {
              for (let c = 0; c < 4; c += 1) {
                if (!bar.chord[c] && currentBar.chord[c]) bar.chord[c] = currentBar.chord[c] as string
              }
              if (currentBar.annotations) {
                bar.annotations =
                  bar.annotations === undefined
                    ? currentBar.annotations
                    : bar.annotations.concat(currentBar.annotations)
              }
            }
            measureNum += 1
          }
          currentBar = { chord: ['', '', '', ''] }
        } else {
          // A barline that does not close a full measure — a pickup, or a repeat mark
          // written mid-bar — CLEARS the chords but keeps the cell, which is how a leading
          // `|:` marks the measure after it.
          currentBar.chord = ['', '', '', '']
        }
        beatNum = 0
      }
    }
    if (driving) parts.push({ type: 'part', name: partName, lines: [measures] })
  })
  return { parts, sawChord: lastChord !== '' }
}

/**
 * Rule 6 — "if there are first and second endings and the chords are the same, then
 * collapse them". Only when the two endings are the SAME LENGTH, and every slot and every
 * annotation matches.
 */
function collapseIdenticalEndings(chartLines: readonly ChartLine[]): void {
  for (const line of chartLines) {
    if (line.type !== 'part') continue
    const partLine = line.lines[0]
    if (partLine === undefined) continue
    const ending1 = partLine.findIndex((bar) => !!bar.ending)
    const ending2 = partLine.findIndex((bar, index) => index > ending1 && !!bar.ending)
    if (ending1 < 0 || ending2 < 0) continue
    if (ending2 - ending1 !== partLine.length - ending2) continue
    let matches = true
    for (let i = 0; i < ending2 - ending1 && matches; i += 1) {
      const lhs = partLine[ending1 + i] as GridMeasure
      const rhs = partLine[ending2 + i] as GridMeasure
      for (let c = 0; c < 4; c += 1) if (lhs.chord[c] !== rhs.chord[c]) matches = false
      if ((lhs.annotations === undefined) !== (rhs.annotations === undefined)) matches = false
      if (lhs.annotations !== undefined && rhs.annotations !== undefined) {
        if (lhs.annotations.length !== rhs.annotations.length) matches = false
        else if (lhs.annotations.some((a, j) => a !== rhs.annotations?.[j])) matches = false
      }
    }
    if (matches) {
      delete (partLine[ending1] as GridMeasure).ending
      partLine.splice(ending2, partLine.length - ending2)
    }
  }
}

/**
 * Rules 1 and 15 — eight measures to a line, four for a twelve-bar blues, and a line is cut
 * short at an end repeat that is not already at its end.
 *
 * The twelve-bar test is the length up to and including the FIRST end repeat, not the
 * part's length.
 */
function addLineBreaks(chartLines: readonly ChartLine[]): void {
  for (const line of chartLines) {
    if (line.type !== 'part') continue
    const oldLines = line.lines[0]
    if (oldLines === undefined) continue
    const newLines: GridMeasure[][] = []
    const firstEndRepeat = oldLines.findIndex((l) => !!l.hasEndRepeat)
    const length =
      firstEndRepeat >= 0 ? Math.min(firstEndRepeat + 1, oldLines.length) : oldLines.length
    const barsPerLine = length === 12 ? 4 : 8
    for (let i = 0; i < oldLines.length; i += barsPerLine) {
      const newLine = oldLines.slice(i, i + barsPerLine)
      const endRepeat = newLine.findIndex((l) => !!l.hasEndRepeat)
      if (endRepeat >= 0 && endRepeat < newLine.length - 1) {
        newLines.push(newLine.slice(0, endRepeat + 1))
        newLines.push(newLine.slice(endRepeat + 1))
      } else newLines.push(newLine)
    }
    // Rule 7 — a second ending on a line of its own is RIGHT-JUSTIFIED, padded with
    // borderless cells to the width of the line above it.
    for (let i = 0; i < newLines.length; i += 1) {
      if ((newLines[i] as GridMeasure[])[0]?.ending) {
        const prev = Math.max(0, i - 1)
        const toAdd = (newLines[prev] as GridMeasure[]).length - (newLines[i] as GridMeasure[]).length
        const pad: GridMeasure[] = []
        for (let j = 0; j < toAdd; j += 1) pad.push({ noBorder: true, chord: ['', '', '', ''] })
        newLines[i] = pad.concat(newLines[i] as GridMeasure[])
      }
    }
    line.lines = newLines
  }
}

/**
 * Rule 8 — a measure repeating the one before it draws `%`, but only when BOTH are a single
 * chord. A complicated measure resets the run, and an empty measure after a complicated one
 * inherits its last chord outright rather than a percent.
 */
function addPercents(chartLines: readonly ChartLine[]): void {
  for (const part of chartLines) {
    if (part.type !== 'part') continue
    let lastMeasureSingle = false
    let lastChord = ''
    for (const line of part.lines) {
      for (const measure of line) {
        if (measure.noBorder) continue
        const chords = measure.chord
        if (!chords[0] && !chords[1] && !chords[2] && !chords[3]) {
          if (lastMeasureSingle) {
            if (lastChord) chords[0] = '%'
          } else chords[0] = lastChord
          lastMeasureSingle = true
        } else if (!chords[1] && !chords[2] && !chords[3]) {
          lastMeasureSingle = true
          lastChord = chords[0] as string
        } else {
          lastMeasureSingle = false
          lastChord = (chords[3] || chords[2] || chords[1]) as string
        }
      }
    }
  }
}

/**
 * The voices the grid walks, in abcjs's order: every voice of every staff, with the `&`
 * overlay layers already split out into voices of their own.
 *
 * abcjs does that split in the PARSER (`resolveOverlays`), so by the time any of its
 * consumers see the tune an overlay IS a voice — which is why `after` grids the chords it
 * writes on `&&` at all. Ours splits at the point of use, and `overlayVoices` in the audio
 * flattener is the same regrouping written for the same reason.
 */
function gridVoices(score: Score): readonly Voice[] {
  return [...score.voices, ...overlayVoicesOf(score.voices)]
}

/**
 * ponytail: a local copy of the audio flattener's `overlayVoices`, reduced to what the grid
 * reads — measures with their barlines, part labels and events. Sharing the real one would
 * mean exporting it out of `src/audio/`, and the grid has no other business there.
 */
function overlayVoicesOf(voices: readonly Voice[]): Voice[] {
  const out: Voice[] = []
  for (const voice of voices) {
    const depth = voice.measures.reduce((n, m) => Math.max(n, m.overlays.length), 0)
    for (let layer = 0; layer < depth; layer += 1) {
      out.push({
        ...voice,
        id: `${voice.id}-overlay-${layer}`,
        measures: voice.measures.map((m) => ({
          ...m,
          events: m.overlays[layer] ?? [],
          overlays: [],
          // A volta belongs to the written voice; abcjs strips it off the overlay "so they
          // are not repeated".
          volta: null,
        })),
      })
    }
  }
  return out
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * The tune's chord grid, or `null` where abcjs refuses to make one.
 *
 * `null` rather than a thrown error or a Result: abcjs throws and its own caller swallows
 * it, so "no grid" is the observable answer and both of its refusals produce exactly the
 * same one. A caller that wants to know why can ask the meter and the chords itself.
 */
export function chordGrid(score: Score): ChartLine[] | null {
  /**
   * `getMeterFraction()` — the FIRST meter on any staff of any line, and **4/4 when there
   * is none at all** (`data/abc_tune.js:181-220`). Not the header's meter: `you` writes its
   * `K:` before its `M:`, so its 4/4 is a body element, and reading only `Score.meter`
   * refused a tune abcjs grids.
   */
  const meter =
    score.meter ??
    score.voices.flatMap((v) => v.measures.map((m) => m.meterChange)).find((m) => m !== null) ??
    ({ numerator: 4, denominator: 4, symbol: 'numeric' } as const)
  const isCommonTime = meter.numerator === 4 && meter.denominator === 4
  const isCutTime = meter.numerator === 2 && meter.denominator === 2
  if (!isCommonTime && !isCutTime) return null

  let chartLines: ChartLine[] = []
  let nonSubtitle = false
  let sawChord = false
  for (const section of sections(score)) {
    if (section.kind === 'subtitle') {
      // "Don't do the subtitle if the first thing is the subtitle, but that is already
      // printed on the top."
      if (nonSubtitle) chartLines.push({ type: 'subtitle', subtitle: section.text })
    } else if (section.kind === 'text') {
      nonSubtitle = true
      chartLines.push({ type: 'text', text: section.text })
    } else {
      nonSubtitle = true
      const flat = flattenVoices(section.voices)
      if (flat.sawChord) sawChord = true
      else return null
      chartLines = chartLines.concat(flat.parts)
    }
  }
  if (!sawChord) return null
  collapseIdenticalEndings(chartLines)
  addLineBreaks(chartLines)
  addPercents(chartLines)
  return chartLines
}
