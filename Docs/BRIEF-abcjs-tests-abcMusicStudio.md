# Brief — abcMusicStudio: review abcjs's test suite

Copy everything inside the fence.

````
Two items from an audit of abcjs's OWN TEST SUITE (done in abcts, 2026-08-09) that are
PRODUCT-level rather than engine-level, plus one caveat. This is a review request — report
which is worth scheduling and against which roadmap item.

The suite is at
  /Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/tests/
Thirty files. Most assert abcjs's internal laid-out tree and are engine business; those are
going to the abcMusicKit v1 agent separately. These two assert PUBLIC, structured data and
describe features rather than internals.

1. `chordGrid` — A FEATURE WITH NO EQUIVALENT ANYWHERE IN OUR STACK
   `abcjs.renderAbc(…, { chordGrid: "withMusic" })` makes abcjs publish a structured chord
   chart on the tune object:
       [{ type: 'part', name: 'A', lines: [[ { chord: ["B♭","","G♭7",""],
                                              annotations: ["fermata","uptempo"],
                                              hasStartRepeat: true,
                                              hasEndRepeat: true } ]] }]
   Four chord slots per bar, part names from P:, repeat flags, and fermata/annotation
   capture. Chord symbols arrive already prettified (Bb → B♭).
   Asserted over 24 real tunes in tests/visual/chord-grid.test.js — a plain JSON oracle, so
   it ports directly to whatever produces it, in any language.
   This is a lead-sheet / chord-chart view. Worth assessing BEFORE anyone designs one from
   scratch: the data model is already specified and tested by someone else. Check it
   against the Accompaniment Designer plan (ACCOMPANIMENT-DESIGNER-PLAN.md) and the parked
   Notebook score-layout work.

2. `setTiming` / `noteTimings` — THE AUDIO↔GEOMETRY JOIN, WHICH NOTHING IN THE STACK GATES
   tests/synth/timing.test.js, 16 cases. Its `doTimingTest` writes
   `currentTrackMilliseconds` and `midiPitches` back onto the DRAWN elements, so a note
   reached twice through a repeat carries `[3000, 9000]` — two times on one notehead. The
   other helpers assert `noteTimings` rows carrying `milliseconds`,
   `millisecondsPerMeasure`, `left`, `endX`, `top` and `height`.
   That is exactly the playback-cursor contract, written by the engine's authors and backed
   by 16 cases. Worth reviewing against:
     - the bidirectional cross-link invariants (BidirectionalContractTests) — this is an
       independent specification of the same join;
     - the overlay-voice playback-highlight gap (`&` notes play but do not tint);
     - the macro-expansion source-identity gap (macro-expanded notes share one source
       range, so the playhead cannot step through a macro).
   In abcMusicKit v1 the corresponding surface is SyncMap.swift.

CAVEAT ON WHAT THIS DOES NOT MEAN
   The same audit produced a set of AUDIO findings that are engine-level and are going to
   the v1 agent: chord pitch ORDER within a chord, the gap on a note that closes a slur,
   triplet durations, tempo changes propagating across voices, per-note dynamics in a
   chord, and several MIDI-file byte quirks. If v1 changes as a result, some of those are
   AUDIBLE and would reach Studio through the engine. Expect the possibility of playback
   diffs and check v1's changelog before filing one as a Studio regression.

Nothing here needs immediate action.
````
