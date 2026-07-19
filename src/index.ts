// abcts — modern TypeScript ABC notation library. See ARCHITECTURE.md.
//
// The surface is deliberately small: a frozen AST, the types to read it, and just enough
// rational arithmetic to interpret a duration. `export *` was promoting every internal
// helper to public API with no review — including a midiNoteIgnoringKey that ignored both
// the key signature and Voice.octaveShift, and so was wrong outside C major.

export type {
  Barline,
  Chord,
  Diagnostic,
  DiatonicStep,
  KeySignature,
  Measure,
  Meter,
  MeterSymbol,
  Mode,
  MusicEvent,
  Note,
  NoteStyle,
  Pitch,
  PitchClass,
  Rational,
  Rest,
  RestKind,
  Score,
  ScoreMetadata,
  SourceRange,
  TupletMark,
  Voice,
} from './core/model.js'

// Reading a duration requires these two; comparing an accidental requires Accidental.
export { Accidental, rational, ratToNumber } from './core/model.js'
export { type ParseResult, parse } from './parser/parser.js'

// The renderer's own types stay behind `abcts/renderer`, so a parse-only consumer does
// not pull ~40KB of glyph outlines. `render` is re-exported here because ARCHITECTURE.md
// specifies `import { parse, render } from 'abcts'` as the standard-mode surface.
export { type RenderOptions, render } from './renderer/index.js'
