# Brief — abcMusicKit v1: review abcjs's test suite

Copy everything inside the fence.

````
Review abcjs's OWN TEST SUITE for applicability to abcMusicKit v1, and report what is
worth adopting. This is a review request, not a change request — do not change anything
until we have your list.

WHERE IT IS
  abcjs 6.7.0 source: /Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/
  its test suite:     .../abcjs-6.7.0/tests/     30 files
  Already harvested into abcts as plain JSON — language-independent, reusable as-is,
  no re-harvest needed:
    /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-audio/  61 cases
       {abc, options, expected: {tempo, instrument, totalDuration, tracks[][]}}
       track rows are {cmd, pitch, volume, start, duration, instrument, gap}
    /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-midi/    3 cases
       {abc, options, expected: byte-exact "data:audio/midi," string}
    harvest scripts: /Users/lrettberg/ICMLabs/Code/abcts/scripts/harvest-abcjs-{audio,midi}.mjs

WHY THIS IS WORTH THE TIME — THE ORACLE-BREADTH POINT
  Tests/abcMusicKitSynthTests/FlattenComparisonTests.swift compares against goldens from
  Tools/abcjs-debug/dump-flatten.js — that is abcjs run over OUR fixtures. abcjs's own
  tests carry a DIFFERENT oracle: expectations its authors wrote, choosing what they
  thought worth exercising. Running abcjs over our tunes cannot find a case our tunes do
  not contain. A gate is only as broad as its inputs, and ours were all chosen by us.

CLASSIFY BY ASSERTION TARGET, NOT BY FILE — most files mix both kinds. abcts's harvester
named a FILE (flattener.test.js) and so missed options.test.js, which has the same
doFlattenTest(abc, expected, options) helper: seven cases, and the only place in the suite
exercising HOST-supplied options rather than the tune's own %%MIDI. Grep for the helper
signature, not the filename.

WHAT IS PORTABLE — asserts a public value, so it ports to Swift unchanged

  assertion target            files (cases)                            harvested?
  setUpAudio() return         flattener 54, options 7, synth 4         54+7 yes
  MIDI file bytes             midi 3                                   yes
  setTiming / noteTimings     timing 16                                no
  chordGrid                   chord-grid 24                            no — feature absent
  metaText                    parsing, misc, title                     no
  warnings                    parsing, note, transpose, tablature,
                              directives, chord-grid                   no
  charPos (source offsets)    start-char 1                             no
  lineBreaks / explanation    wrap 9                                   no
  SVG DOM: [data-name=…],
    group structure           svg 3, svg-per-line 5, options 1         no

WHAT IS NOT PORTABLE, and why
  visualObj[0].lines / topText / bottomText / engraver / makeVoicesArray — the internal
  laid-out tree. SVG-geometry gates against abcjs's own output are a stronger check on
  those same tunes.
  parse/voices-array.test.js carries abcjs's own comment: "this is currently a known bug
  so the test is expected to fail at the moment."
  api/tunebook_svg.test.js asserts renderAbc forwards params to renderEngine — wiring.

THREE THAT LOOK ESPECIALLY RELEVANT TO v1 RIGHT NOW
  - synth/timing.test.js (16). doTimingTest writes currentTrackMilliseconds and
    midiPitches back onto the DRAWN elements, so a note reached twice through a repeat
    carries [3000, 9000] — two times on one notehead. That is SyncMap.swift's surface and
    nothing gates it. Also asserts millisecondsPerMeasure, left, endX, top, height.
  - visual/tablature.test.js (37 cases, 1188 lines) — the tablature port is in flight.
    Asserts warnings plus rendered DOM.
  - visual/svg.test.js + svg-per-line.test.js (8) — the data-name / group DOM contract,
    which geometry gates do not cover.

BEHAVIOURAL FINDINGS FROM PORTING THIS SUITE IN abcts
Each was invisible to a green gate there, so CHECK rather than assume. v1 is an avowed
byte-parity port, so where abcjs is wrong v1 must be wrong identically — these are all
things easy to port "corrected" by accident.

 1. THE CHORD SORT BELONGS TO THE ENGRAVER, NOT THE PARSER. `[cD]` sounds D-then-c but
    `[gF]` sounds 42-then-36. Noteheads must STACK in pitch order to be drawn, so the
    LAYOUT sorts elem.pitches. flattener.test.js renders first (sorted); getMidiFile on a
    STRING goes through renderEngine(callback,"*",…) and never engraves (source order).
    Sorting unconditionally in the flattener is wrong on one entry point — and v1 has both
    a flattener and a MIDIWriter, so it can exhibit both halves.
    CHECK: %%MIDI drummap F 36 / drummap g 42, K:C perc, `[gF]` — is the first note-on 42
    or 36 through the MIDI-file path? abcjs writes 42.

 2. A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED. Both slur counts move BEFORE they are
    read, inside the pitch loop (abc_midi_flattener.js:580-604). Adding before the loop and
    subtracting after gives the closing note a -0.001s overlap it should not have.
    CHECK: `(ef)` — f should get no gap.

 3. A TRIPLET'S LAST NOTE IS THE REMAINDER, not a third. abcjs rounds every duration to a
    millionth, computes the group total once at the opening note and gives the last note
    round(total - accumulated) (abc_midi_sequencer.js:253-277). The group is exact; one
    note is a millionth off, and WHICH one depends on the fraction.
    CHECK: L:1/8 `(3 C2 D2 E2` → .166667/.166667/.166666;  `(3 CDE` → .083333/.083333/.083334.

 4. A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE. insertTempoChanges
    (abc_midi_sequencer.js:569-592) is a whole pass; every [Q:] goes into one table keyed
    by WRITTEN POSITION and each voice gets one spliced in wherever an element's timing
    matches. Seeded {0: tune qpm}, so a `:|` back to the head RESTORES the opening tempo.
    Two voices changing at the same position: the last one written wins for both.
    CHECK: three voices each changing at a different bar — the top voice takes all of them.

 5. volumesPerNotePitch — a chord can carry one dynamic per note, and the list zips against
    the SORTED pitches positionally (abc_midi_sequencer.js:458-468), so decoration 0
    belongs to the LOWEST note whatever it was written beside. Not moved by a hairpin.
    CHECK: `[!pppp!c!ffff!D]` — D at 10 and c at 125, which reads backwards.

 6. AN ORNAMENT REPLACES THE NOTE rather than decorating it
    (abc_midi_flattener.js:425-495), so an ornamented note never reaches the gap switch.
    A LOOP (trill, trillh, roll) writes a whole 1/32 even when a sliver is left, so the
    total rounds UP past the note; a FIXED shape (mordent, pralltriller) writes two 1/32s
    and gives the REST to a third note — the only one without style:'decoration'. A roll
    steps by shortestNote*2 while writing notes of shortestNote. A turn ignores the 1/32
    and takes a QUARTER of the note, four times. uppermordent resolves to pralltriller.
    CHECK: `!staccato!!trill!C` — no gap at all.

 7. THE PICKUP'S EPSILON CLAMP IS LOAD-BEARING, not defensive (abc_tune.js:140-142). Six
    floating-point 1/6s come to 0.9999999999999999, the `>= barLength` subtraction never
    fires, and the whole first bar reads as a pickup — every note at the weak-beat volume.
    AND AN OPENING BARLINE IS A BAR ELEMENT: `|:e2|` has a bar as its FIRST element and
    computePickupLength returns 0 before counting a note.
    CHECK: L:1/8 M:4/4 `"C" (3 C2 D2 E2 (3 F2 E2 D2 |` — first note 105, not 85.

 8. AN ACCENT IS RECOGNISED BY ITS GLYPH, NOT BY ITS NAME. abcjs canonicalises `>`, `<`
    and `emphasis` to `accent` in the PARSER (abc_parse_settings.js:95-103). An engine
    keeping the source spelling and testing name == "accent" in closeDecoration
    (decoration.js:17-47) misses the "always three pitches away" rule and lands one pitch
    low — on EVERY accent.
    CHECK: `!>!f` and `!accent!f` — same y?

 9. MIDI WRITER QUIRKS (abc_midi_renderer.js / abc_midi_create.js), all deliberate:
    - the program change is ALWAYS on channel 0 ("%00%C0" hard-coded), so a tune on
      %%MIDI channel 4 emits its program on %C0 and its notes on %94;
    - the instrument LEAKS into the next track — startTrack re-emits whatever was last set;
    - an empty-but-PRESENT key still writes a key signature, which is why K:cm (a key abcjs
      cannot read, its lowercase letters being commented out) emits %00%FF%59%02%00%00;
    - a pitch is not zero-padded — "%" + pitch.toString(16);
    - note placement is a map keyed by TIME, so two notes starting together cost one delta
      and a staccato gap shortens the note-off without moving the next note-on.

10. THE TEMPO MARK'S BEAT-UNIT NOTE TAKES A FLAG AND A DOT, and they are purely ADDITIVE —
    the head and stem do not move, only the rate's x follows. abcjs runs the tempo note
    through createNoteHead at scale 0.75 (tempo-element.js:24-59), so the flag/dot figures
    are the ordinary note path's: flag x = headx + notehead.w - 0.6, pitch + 7*scale;
    dot x = notehead.w - 2 + 5*dot, pitch + (1 - |pitch| % 2). Measured off abcjs's SVG:
    +4.41px on the rate for a flag, +6.45 for a dot.
    CHECK: Q:1/8=66 — is there a flag, or a bare stem?

METHOD: measure, do not reason. Instrument a SCRATCHPAD COPY of abcjs, never the vendored
tree. Three of the findings above were reached by printing what abcjs actually emits after
its source suggested otherwise.

REPORT: which apply, which v1 already handles, and which are deliberate v1 deviations.
````
