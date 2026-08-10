# abcjs chord-grid corpus — the grid oracle

One JSON file per `it()` in abcjs 6.7.0’s `tests/visual/chord-grid.test.js`, extracted by
`scripts/harvest-abcjs-chord-grid.mjs` (`npm run harvest:chord-grid`). Each holds the ABC
and the exact structure abcjs publishes as `visualObj[0].chordGrid`.

Portable for the reason the 2026-08-09 suite audit named: `parserTest` asserts a PUBLISHED
structure, not the internal `visualObj` tree that makes most of abcjs’s `visual/` suite
unportable.

**Two cases expect `null`, and they are the interesting ones.** `waltz` (3/4) and
`no-chords` assert that abcjs produces no grid at all — `chordGrid()` throws `notCommonTime`
and `noChords` and its caller swallows both. A feature’s refusals are part of its contract,
and they are what an implementation written from the happy path gets wrong.

`1-svg-grid` is not harvested: it asserts a DIV COUNT under `oneSvgPerLine`, which is a
layout fact rather than a grid one.

## Licence

The ABC text and the expected grids are from abcjs, which is MIT licensed — see
`tests/corpus-audio/README.md` for the notice.
