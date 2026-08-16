# The `AbcTune` accessor oracle — 293 rows

Every NUMERIC accessor abcjs's tune object exposes, dumped for both corpora by **running
abcjs 6.7.0** at the goldens' own `{staffwidth: 670}`:

    beatLength  barLength  beatsPerMeasure  bpm  pickupLength
    msPerMeasure  msPerMeasure120  totalTime  totalBeats

`totalTime` and `totalBeats` are read after `setTiming(0, 0)`, which is the only way they
exist at all — `AbcTune` leaves them `undefined` until the timings are built
(`abc_tune.js:614-621`).

Regenerate with `/tmp/gp/accessors.js` against a SCRATCHPAD copy of abcjs
(`ABCJS_PATH=/tmp/gp/abcjs`, `NODE_PATH=../abcMusicKit/Tools/abcjs-debug/node_modules`),
never against `../abcMusicKit` — another lane owns that repo. The harvest asks for one
output SLOT per tune, as `dump-svg.js` does, because `renderAbc` renders one tune per slot.

**These accessors have no other gate.** abcjs's own suite exercises a handful of them
inside `timing.test.js` and nothing else, so without this table a wrong `getBeatLength`
shows up only as a wrong clock somewhere downstream.
