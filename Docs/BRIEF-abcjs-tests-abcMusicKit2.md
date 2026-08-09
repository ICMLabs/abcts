# Brief — abcMusicKit2: review abcjs's test suite

Copy everything inside the fence.

````
Review abcjs's OWN TEST SUITE for applicability to abcMusicKit2, and report what is worth
adopting AS AN ORACLE. This is a review request, not a change request.

CLEAN-ROOM CAVEAT, and it is yours to apply rather than mine to rule on: everything below
is stated as an OBSERVABLE FACT about what abcjs's output IS, plus the test case that shows
it — deliberately not as abcjs's code. Nothing here requires reading abcjs's source. Where
a source citation appears it is so you can VERIFY a claim if your repo's policy allows it,
not because the finding depends on it. The harvested oracles are JSON data, not code.

WHERE IT IS
  abcjs 6.7.0 test suite: /Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/tests/
  Already harvested into abcts as plain JSON — language-independent, reusable as-is:
    /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-audio/  61 cases
       {abc, options, expected: {tempo, instrument, totalDuration, tracks[][]}}
       track rows are {cmd, pitch, volume, start, duration, instrument, gap}
    /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-midi/    3 cases
       {abc, options, expected: byte-exact "data:audio/midi," string}

WHY NOW, WHEN v2 HAS NO FLATTENER
  abcMusicKit2Audio is currently one file, AudioPlayer.swift — playback, no event
  generation. So none of this is a latent bug; it is a SPECIFICATION for work not yet done,
  and an oracle to build it against. In abcts the audio arc's first commit was the
  HARVESTER, not the flattener: the table opened at 54-of-54 differing and became the work
  list, and every finding below was found because a gate existed to state it in. Landing
  these oracles before v2's flattener exists makes it measurable from line one, and costs
  nothing — they are already written.

BUILD A RANKED TABLE, NOT A PASS/FAIL SUITE
  Per case, report the FIRST differing event with both sides printed, sorted by how far in
  the divergence is. Structurally-wrong cases sort to the top and nearly-right to the
  bottom, so the table is a work list rather than a score. Keep a PASSING list as a ratchet
  that only ever grows: if a change takes a case out, that is a regression to fix, not a
  list to edit.

WHAT IS PORTABLE IN abcjs's SUITE — classify by ASSERTION TARGET, not by file, because
most files mix both kinds.

  assertion target            files (cases)                            note
  setUpAudio() return         flattener 54, options 7, synth 4         harvested (54+7)
  MIDI file bytes             midi 3                                   harvested; byte-exact
  setTiming / noteTimings     timing 16                                audio↔geometry JOIN
  chordGrid                   chord-grid 24                            a feature, JSON oracle
  metaText / warnings         parsing, misc, title, note, transpose,
                              tablature, directives                    parse-level
  charPos (source offsets)    start-char 1
  lineBreaks / explanation    wrap 9                                   the wrap DECISION
  SVG DOM [data-name=…]       svg 3, svg-per-line 5, options 1         only if you emit
                                                                       abcjs-shaped markup

  NOT portable: visualObj[0].lines / topText / bottomText / engraver / makeVoicesArray —
  abcjs's internal laid-out tree, which v2 has no reason to reproduce.
  Skip parse/voices-array.test.js: abcjs's own comment says it is a known bug expected to
  fail. Skip api/tunebook_svg.test.js: it asserts param forwarding, not behaviour.

THE BEHAVIOURS — what the output has to be, with the case that shows it

  - A "C" ABOVE THE STAFF IS A WHOLE VOICE, not a marking. Chords become their own track:
    a measure's chords are expanded across that bar's eighth-note grid and played as a
    boom-chick pattern chosen by the METER. A short bar (a pickup, or a bar split over a
    line break) throws the pattern away and gets a plain alternating chick for the beats
    actually present. Only the FIRST note of a chord is a bass note.
  - A DYNAMIC IS A STRESS TABLE, NOT A VOLUME — it replaces the three beat-stress figures
    (bar-first / on-beat / off-beat), so a passage gets quieter without losing its accents.
  - A CHORD CAN CARRY ONE DYNAMIC PER NOTE, zipped against the SORTED pitches positionally:
    `[!pppp!c!ffff!D]` plays D at 10 and c at 125, which reads backwards until you know it.
  - THE CHORD SORT BELONGS TO THE ENGRAVER, NOT THE PARSER. `[cD]` sounds D-then-c when the
    tune has been laid out; `[gF]` sounds high-then-low when it has not, because noteheads
    must STACK in pitch order to be drawn. Decide which entry point each of your APIs is
    and make it an EXPLICIT option rather than a constant — abcts had to add one.
  - A TRIPLET'S LAST NOTE IS THE REMAINDER. The group total is computed once and the last
    note gets what is left, so the group is exact and one note is a millionth off.
    L:1/8 `(3 C2 D2 E2` → .166667/.166667/.166666;  `(3 CDE` → .083333/.083333/.083334.
  - A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE, keyed by WRITTEN position — and a
    `:|` back to the head RESTORES the opening tempo, because position 0 is in the table.
  - AN ORNAMENT REPLACES THE NOTE: a run of 1/32s, so a trilled staccato gets no gap at
    all. Loops (trill, roll) round up past the note; mordent and pralltriller write two
    1/32s and give the remainder to a third, undecorated note; a turn takes a quarter of
    the note four times.
  - A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED. `(ef)` — f gets no overlap.
  - A SPACER (`y`) sounds nothing, takes no time, AND STILL COUNTS for hairpin arithmetic.
    A multi-measure rest is as long as it says. A rest carries its chord symbol, and so
    does the silenced half of a tie.
  - AN INLINE `[Q:]` IS THE PAGE'S TEMPO AND NOT THE CLOCK'S.
  - THE CLEF'S OCTAVE REPLACES the voice's `transpose=` rather than adding to it, and
    `V:… transpose=` is SOUNDING-ONLY — nothing on the page moves.
  - `&` OVERLAY VOICES are whole voices from bar one, padded with invisible rests wherever
    they do not sing; that padding is what puts them in time.
  - A QUARTER TONE IS A WHOLE PITCH PLUS A PITCH BEND, never a fractional MIDI pitch.
  - A PICKUP MUST BE CLAMPED: six floating-point 1/6s sum to 0.9999999999999999, so a
    naive "is this a whole bar" test reads the first bar as a pickup and plays it quietly.
    An OPENING barline counts as a bar element when measuring the pickup.

TWO ENGRAVING FINDINGS, if the render side is in scope for this review
  - The tempo mark's beat-unit note takes a FLAG and a DOT, and both are purely ADDITIVE:
    the head and stem do not move, only the rate's x follows (+4.41px for a flag, +6.45
    for a dot, at abcjs's 0.75 scale). abcts drew a bare stem for months and NO GATE COULD
    SEE IT, because abcjs classes only its noteheads and the tempo notehead is not one.
  - An ACCENT sits "always three pitches away", and its aliases (`>`, `<`, `emphasis`) must
    reach that rule too. Key it on the resolved GLYPH, not the written name: abcts had
    every accent one pitch low for months because the alias drew the right glyph and then
    failed a name comparison.

THE METHODOLOGICAL LESSONS, which transfer whatever the engine
  - A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT ITS COMPARISON.
  - A COMPARISON CAN ONLY CATCH WHAT ITS REPRESENTATION CAN EXPRESS. When every gate is
    quiet, ask what none of them can represent — twice in abcts the answer was to build a
    new gate, not to look harder with the old ones.
  - A NOTE THAT NAMES A CAUSE IS THE REASON THE ROW STOPS BEING READ. Rule the cause OUT
    on a control tune before writing it down.
  - A CANARY MUST TEST THE INSTRUMENT, NOT THE FIX — one that fails for the same reason
    every case does proves nothing about whether the gate can see.

REPORT: which oracles are worth landing now, and what shape v2's flattener should take
given the ranked-table approach — before writing it.
````
