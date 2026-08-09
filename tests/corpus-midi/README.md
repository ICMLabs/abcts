# abcjs MIDI-file corpus

Three cases harvested from abcjs 6.7.0's `tests/synth/midi.test.js` by
`scripts/harvest-abcjs-midi.mjs`: the ABC, the options `getMidiFile` is called with, and
**abcjs's own bytes** — a `data:audio/midi,` URI of URL-encoded Standard MIDI File.

Unlike `tests/corpus-abcjs/`, these ARE assertions. `midi.test.js` compares a public return
value rather than abcjs's internal `visualObj` tree, so its expectations port directly —
the same reason `flattener.test.js` could be harvested into `tests/corpus-audio/` and
`timing.test.js` could not.

## Why this oracle is worth more than its three rows

**It is byte-exact.** Every other comparison in this repo has to say what it ignores:
`pixel-parity` excludes glyph outlines because abcts draws Bravura, `tempo-parts` compares
glyph kinds for the same reason, the harvested table takes 0.05px. A MIDI file is a byte
string, so "differs" means differs and the first differing byte names the field.

**And it re-derives the flattener's answer a different way.** The writer reads the same
event list the audio table gates, so a wrong duration or velocity shows up here as a wrong
byte even with `corpus-audio` green. A surface that agrees by construction is worth less
than one that could disagree.

Between them the three cover a lot: `midi-piano` has `%%MIDI program`/`channel`/`transpose`,
a `%%score`, two voices, track names and a `pan` option; `midi-staccato` has staccato gaps
and a slur; `midi-drums` has `%%MIDI drummap` and a percussion clef.

## Licence

The ABC text and the expected bytes are from abcjs, which is MIT licensed:

> Copyright (c) 2009-2024 Paul Rosen and Gregory Dyke
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.
