# Brief — abcMusicKitCpp: record, do not resume

Copy everything inside the fence.

````
abcMusicKitCpp is PARKED (2026-07-07, demoted to reference/oracle; "do not re-sync it"), so
this is a RECORD-IT request and not a do-work request. Do not re-sync, do not start an arc.
The ask is that these findings be written into the repo's own docs so a future unparking
does not re-derive them, and so v2's Step-2 backport — cpp's stated role — can use them.

WHAT PROMPTED IT
  abcts reached byte-parity with abcjs on its MIDI file writer and 61/61 on its event
  flattener (2026-08-08/09), and an audit of abcjs's own test suite turned up both a set of
  behavioural findings and a set of unharvested oracles. Details:
    /Users/lrettberg/ICMLabs/Code/abcts/Docs/CHECKPOINT-2026-08-08e.md
    abcjs 6.7.0 + its tests: /Users/lrettberg/ICMLabs/Code/abcMusicKit/Docs/References/abcjs/abcjs-6.7.0/
    harvested oracles (plain JSON, language-independent):
      /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-audio/  61 cases
      /Users/lrettberg/ICMLabs/Code/abcts/tests/corpus-midi/    3 byte-exact SMF cases

WHAT ACTUALLY TOUCHES cpp — I checked the tree rather than guessing

 1. src/smf.h IS THE ONE DIRECTLY AFFECTED FILE, and the finding is a DIVERGENCE TO RECORD
    rather than a bug to fix. Its own header says "Direct port of
    abcMusicKit/Sources/abcMusicKitSynth/MIDIWriter.swift (clean-room implementation from
    the MIDI 1.0 spec)" — and v1's MIDIWriter.swift confirms it: "Clean room implementation
    from the MIDI 1.0 specification." Neither is a port of abcjs's abc_midi_renderer.js.
    So neither reproduces abcjs's four deliberate quirks, and a spec-clean writer is very
    likely the RIGHT choice — but it means cpp's MIDI bytes cannot be byte-compared against
    abcjs's, and anybody who tries later will waste a day discovering that.
    RECORD, in whatever doc covers smf.h, that abcjs's file differs by design in four ways:
      - the program change is ALWAYS on channel 0 ("%00%C0" hard-coded), so a tune on
        %%MIDI channel 4 emits its program on %C0 while its notes go out on %94;
      - the instrument LEAKS into the next track — abcjs re-emits whatever was last set, so
        track two carries track one's program having never asked for one;
      - an empty-but-PRESENT key still writes a key signature, which is why K:cm (a key
        abcjs cannot read, its lowercase key letters being commented out) emits
        %00%FF%59%02%00%00 rather than nothing;
      - a pitch is not zero-padded — "%" + pitch.toString(16), so a pitch below 0x10 would
        emit one hex digit where every other byte takes two.
    Whether abcjsStrict owes byte parity on the FILE (as opposed to the EVENT LIST) is a
    v1-level policy question and is being put to the v1 agent. cpp inherits whatever is
    decided; note the dependency rather than pre-empting it.

 2. cpp HAS NO FLATTENER, SEQUENCER OR CHORD TRACK. engine.cpp carries only a handful of
    MIDI symbols and src/v2/ is parse / core / layout / engrave / render. So the eight
    audio findings below are NOT latent bugs here — they are information for the Step-2
    backport into abcMusicKit2, which is the role cpp was parked to serve. If any of them
    names an algorithm cpp's engine already implements DIFFERENTLY, that difference is
    worth recording, because it is exactly what the backport needs to know.

 3. CHECK THEM AGAINST V1-PARITY-BACKLOG.md. The gate stands at 690/708 (97.5%). If any of
    the 18 open items corresponds to one of these findings, say so — a known-open item with
    a now-known CAUSE is worth more than either alone, and costs nothing to note.

THE FINDINGS, as observable facts. Each is a statement about what abcjs's output IS, with
the case that shows it, so none requires reading abcjs's source.

  - THE CHORD SORT BELONGS TO THE ENGRAVER, NOT THE PARSER. `[cD]` sounds D-then-c but
    `[gF]` sounds 42-then-36: noteheads must STACK in pitch order to be drawn, so the
    LAYOUT sorts them and a never-engraved path keeps source order. Any engine sorting
    unconditionally is wrong on one of its two entry points.
  - A NOTE THAT CLOSES A SLUR IS NOT ITSELF SLURRED — `(ef)` gives f no overlap.
  - A TRIPLET'S LAST NOTE IS THE REMAINDER: the group total is computed once and the last
    note gets what is left, so the group is exact and one note is a millionth off.
    L:1/8 `(3 C2 D2 E2` → .166667/.166667/.166666; `(3 CDE` → .083333/.083333/.083334.
  - A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE, keyed by WRITTEN position — and a
    `:|` back to the head RESTORES the opening tempo.
  - A CHORD CAN CARRY ONE DYNAMIC PER NOTE, zipped against the SORTED pitches positionally:
    `[!pppp!c!ffff!D]` plays D at 10 and c at 125.
  - AN ORNAMENT REPLACES THE NOTE — a run of 1/32s — so `!staccato!!trill!C` gets no gap.
  - THE PICKUP NEEDS AN EPSILON CLAMP: six floating-point 1/6s sum to 0.9999999999999999,
    so a naive whole-bar test reads the first bar as a pickup and plays it quietly. An
    OPENING barline counts as a bar element when measuring the pickup.
  - AN ACCENT IS RECOGNISED BY ITS GLYPH, NOT BY ITS NAME: `>`, `<` and `emphasis` are all
    the accent, and it sits "always three pitches away". Keying the placement rule on the
    written name leaves every aliased accent one pitch out.

AND ONE ENGRAVING FINDING, which does touch cpp's renderer if the parity gate covers it:
  THE TEMPO MARK'S BEAT-UNIT NOTE TAKES A FLAG AND A DOT, and both are purely ADDITIVE —
  head and stem do not move, only the rate's x follows (+4.41px for a flag, +6.45 for a
  dot, at abcjs's 0.75 scale). abcts drew a bare stem for Q:1/8= for months and no gate
  could see it, because abcjs classes only its noteheads and the TEMPO notehead is not one.
  CHECK: does cpp's Q:1/8=66 draw a flag? If the parity gate is silent either way, that is
  the same blind spot, and worth a line in the backlog.

REPORT: what you recorded and where; any V1-PARITY-BACKLOG correspondences; and anything
cpp's engine already does differently that the v2 backport should know. No code changes.
````
