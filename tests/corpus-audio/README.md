# abcjs audio corpus — the flattener oracle

One JSON file per `it()` in abcjs 6.6.3’s `tests/synth/flattener.test.js`,
extracted by `scripts/harvest-abcjs-audio.mjs` (`npm run harvest:audio`). Each holds
the ABC, the options that test passes to `setUpAudio`, and the exact event list abcjs
expects back.

Unlike `tests/corpus-abcjs/`, the ASSERTIONS are harvested here as well as the inputs.
They can be, because `doFlattenTest` compares `setUpAudio()`’s public return value —
a plain `{tempo, instrument, totalDuration, tracks[][]}` — rather than abcjs’s internal
`visualObj` tree. That makes this an exact oracle of the same kind as the `.parse.json`
and `.elements.json` goldens.

`timing.test.js` and `midi.test.js` are deliberately not harvested — see the script’s
header for why.

## Licence

The ABC text and the expected event lists are from abcjs, which is MIT licensed:

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
