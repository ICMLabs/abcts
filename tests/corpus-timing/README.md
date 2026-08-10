# abcjs timing corpus — the `setTiming` oracle, and the audio↔geometry JOIN

Harvested from abcjs 6.7.0’s `tests/synth/timing.test.js` by
`scripts/harvest-abcjs-timing.mjs` (`npm run harvest:timing`). Nineteen cases in four kinds,
classified by ASSERTION TARGET rather than by helper name — the lesson the 2026-08-09 suite
audit turned on itself.

| kind | n | what it asserts | reader |
|---|---|---|---|
| `warp` | 12 | `setTiming(bpm, measuresOfDelay)` → every `noteTimings[i].milliseconds`, and `millisecondsPerMeasure` | **none yet** |
| `elements` | 2 | `currentTrackMilliseconds` and `midiPitches` stamped back onto each element of voice 0, in SOURCE order | **none yet** |
| `switch` | 1 | two tunes’ `milliseconds` arrays | **none yet** |
| `creation` | 4 | rendering does not THROW | `tests/timing-creation.test.ts` |

## Why this oracle is worth more than its case count

`noteTimings` is derived from the FLATTENED AUDIO and the LAID-OUT ELEMENTS together, so it
is the one surface that can disagree with both halves at once. That is the same argument
that made the MIDI file worth building — and that one disagreed three times with the event
table green.

It also unrolls repeats a **second, different way**: `setupEvents` replays elements
`startingRepeatElem … endingRepeatElem` in place, where the sequencer’s `resolveRepeats`
rewrites the voice. Two independent answers to the same question is exactly the kind of
surface that finds things.

## What is NOT here, and why

`doBeatCallbackTest*` (5), `doAnimationTest` (1) and `doClickTest2` (1) need a real timer,
`sleep()`, an animation loop and `position.left` off the DOM. That is host playback — the
same line `create-synth.js` and `synth-controller.js` fall on.

And note what abcjs’s own file never asserts: `left`, `endX`, `top` and `height` are on every
`noteTimings` row and **nothing here checks them**. The geometry half of the join has no
oracle in this file, only the time half.

## The four `creation` cases

They assert only that rendering does not throw, and each names a shape that once crashed
abcjs: a subtitle, a repeat at the start, skipped ties, and a tie over a repeat. They cost
nothing and they are live from the day the corpus lands, which is why they have a reader
while the rest wait for `setTiming`.

## Licence

The ABC text and the expected timings are from abcjs, which is MIT licensed — see
`tests/corpus-audio/README.md` for the notice.
