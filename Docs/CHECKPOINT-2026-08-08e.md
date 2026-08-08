# abcts — Checkpoint, 2026-08-08e — **THE AUDIO ARC IS CLOSED**

Supersedes `CHECKPOINT-2026-08-08d.md` for the STATE. That file keeps the 6.7.0 flip and
**the reasoning behind the deferred optimisation pass, which is now the live phase** —
read its `⏳` section before starting one, and do not re-argue it. `-08-08c.md` keeps the
audio arc's first findings; `-08-08b.md` keeps 147–150 and the geometric tail; `-08-08.md`
keeps the ARC DECISION; `-08-07b.md` keeps 134–146 and the method; `-08-06.md` keeps
**THE HARNESS**.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## STATE

| axis | standing |
|---|---|
| suite | **989 of 989. NO REDS.** |
| **audio ranked table** | **0 of 54.** PASSING is all 54 — the ratchet and the table now say the same thing |
| harvested ranked table | **0 of 174** — against the 6.7.0 oracle |
| pixel ranked table | **1 of 120** — `extra-class`, recorded and named, and it is the ONE open parity target |
| staff-line gate | 0 of 41 |
| above-lane gate / ycorr gate | 12 + 20 controls |
| render benchmark | 220 tunes, ~1.1ms each — recorded, asserts no time |
| gates | **7** |

**ALL THREE RANKED TABLES ARE REGRESSION NETS NOW.** None of them can name the next
defect. That has happened twice before on this branch and the answer both times was to
BUILD A GATE that could express what the others could not — `draws its staff lines the
length abcjs draws them`, then the above-lane and `getYCorr` ladders. It is the answer
again if a new arc is wanted: see **WHAT IS LEFT**.

---

## THE AUDIO ARC — thirteen findings, from 23-of-54 differing to none

Every one is a read of a named abcjs function, and the two that cost the most were the
ones where something already in this repo turned out to do the job (`padOverlays`) or the
model had quietly dropped the input (`transpose=`, grace lengths, chord-inner decorations).

### THE DRUM TRACK (`%%MIDI drum`) — 2 cases

`normalizeDrumDefinition` / `alignDrumToMeter` / `writeDrum`, `abc_midi_flattener.js:760-889`.

- abcjs is DELIBERATELY BRITTLE: three ways to fail closed, all returning `{on: false}`
  with no warning — a pattern not starting `d`/`z`, a bad length suffix, and the
  arithmetic one, `params.pattern.length !== totalPlay * 2 + 1`. `dddd` needs exactly
  eight numbers after it; nine turns the drums off entirely.
- **THE TWO GUARDS IN `writeDrum` ARE NOT THE SAME GUARD.** Before the track exists,
  `lastEventTime < measureLen` returns — that is how a PICKUP delays the first hit. Once
  it exists, `!drumDefinition.on` returns instead, so a `drumoff` stops the hits without
  closing the track and a later `drumon` resumes into the same one.
- `drumOn` is NOT implied by a pattern: the header's `drum` sets only the pattern, and
  `drumon` is what turns it on. `if (globals.drumon)` on an empty array is truthy.
- Written on every BAR of voice 0, from `lastBarTime` — the measure that just ENDED.
- A meter change re-scales a pattern already in force (`alignDrumToMeter` is idempotent).

**AND `[I:MIDI drumon]` NEVER REACHED THE DIRECTIVE HANDLER.** An inline field dispatches
on its LETTER and there was no `I` arm, where abcjs routes `[I:` straight to `addDirective`
in the same switch as `[M:` and `[K:` (`abc_parse_header.js:353`). Inline only — a
full-line `I:` in strict remains a separate open divergence, listed below.

Mid-tune `%%MIDI` now rides the timed stream as **its own row kind** rather than a field on
a note, because a measure need not have one: `%%MIDI drumoff` on a line of its own has to
take effect whether or not anything sounds after it.

### `&` OVERLAY VOICES — 4 cases, and the hard part was already written

`resolveOverlays` (`parse/tune-builder.js:513-640`) is a PARSER pass in abcjs, in a `while`
loop because one pass splits one level. What puts an overlay in TIME is the PADDING: the
voice runs from bar one whether or not it sings there, so everything it does not cover is
an invisible rest of that bar's own length.

**`padOverlays` in our parser already did exactly that** — written for the BEAM gate months
ago, spacers excluded and a pickup padded to the pickup. So the fix was a REGROUPING: read
the layers out sideways as voices, keeping the same measure objects so `resolveRepeats`
unrolls them identically. **I wrote the padding a second time before measuring that it
existed.** Look for the rule before porting it.

### AN ORNAMENT IS A RUN OF 1/32 NOTES AND IT REPLACES THE NOTE — 3 cases

`doModifiedNotes`. The structural point is the `else`: `if (ret.noteModification)
doModifiedNotes(…) else { …articulation…; push }`, so an ornamented note never reaches the
gap switch — `!staccato!!trill!C` is a trill and nothing else.

Two shapes that round differently. A LOOP (trill, trillh, roll) runs `while (runningDuration
> 0)` and writes a whole 1/32 even when a sliver is left, so the sounding total rounds UP
past the note. A FIXED shape (mordent, pralltriller) writes two 1/32s and hands the REST to
a third note — the only one without `style: 'decoration'`. A `roll` steps by
`shortestNote * 2` while writing notes of `shortestNote`. A turn ignores the 1/32 and takes
a QUARTER of the note, four times. `uppermordent` resolves to `pralltriller`.

### MID-TUNE `%%MIDI` — 4 cases, not the 2 the list predicted

All six chord commands funnel through one `chordTrack.paramChange` (`chord-track.js:99-138`).
`%%MIDI gchord` **with no argument CANCELS** the override rather than setting an empty one.
`bassvol`/`chordvol` needed two fields to stop being `readonly` — that they were is what
said nothing had ever changed them mid-tune. `flatten-power-chord` and
`flatten-chord-arpeggio` were waiting on the same plumbing.

`%%MIDI bassprog 10 octave=-1`: the octave is a NUMBER in abcjs, stripped of its `octave=`
and CLAMPED to [-1, 3] in the directive parser (`abc_parse_directive.js:686-716`).

### A TRIPLET'S LAST NOTE IS THE REMAINDER, NOT A THIRD

abcjs rounds every duration to a MILLIONTH, so three notes of 1/6 come to 0.500001 and the
bar drifts. Its answer (`abc_midi_sequencer.js:253-277`): compute the group's total ONCE at
the opening note, accumulate the rounded durations, give the LAST note what is left. The
group is exact and one note of it is a millionth off. **Which note is short depends on the
fraction** — 0.166667/0.166667/0.166666 one way, 0.083333/0.083333/0.083334 the other —
which is why it read as noise on the table rather than as a rule.

### THE PICKUP'S EPSILON CLAMP IS LOAD-BEARING, NOT DEFENSIVE

"If computed pickup length is very close to 0 or the bar length, we assume that we actually
have a full bar" (`abc_tune.js:140-142`). `flatten-triplet-chords` opens with two triplets
of 1/6; six of those come to 0.9999999999999999, the `>= barLength` subtraction never
fires, the whole first bar reads as a pickup and every note in it plays at the weak-beat
85. **AND AN OPENING BARLINE IS A BAR ELEMENT TOO** — `|:e2|` has a `bar` as its FIRST
element and `computePickupLength` returns 0 before counting a note. Ours splits that `|:`
onto the next measure's `openingBarline`, a different place to look that was not looked at.

### `V:… transpose=` — A SOUNDING SHIFT THE MODEL HAD NOWHERE TO PUT

abcjs hangs it on the CLEF and its renderer never reads it (`src/write/` has zero
references). Here it goes on the VOICE, because a `V:` may declare one with no `clef=`
beside it and the tune's clef is shared. **The clef's ±8 OVERRIDES it** rather than adding:
both are pushed as `transpose` elements, transpose= first, and `case "transpose"` ASSIGNS.
`middleLineOverride` had guarded on the field's presence in the spec string for months,
which is how long it had been parsed and dropped.

**AND THE CHORD TRACK IS TRANSPOSED WITH THE VOICE** — abcjs pairs every
`transpose = element.transpose` with a `chordTrack.setTranspose(transpose)`. Ours was
pinned at 0, so `"Em"` sounded two semitones above the voice carrying it.

### THE DECLARED CLEF ARRIVES ONCE, NOT ON EVERY MEASURE OF THE FIRST LINE

The clef in force read `line === 0 ? voice.clef ?? score.clef : null`, and `line === 0` is
true for EVERY measure of the first source line — so a measure with no `[K:]` of its own
re-applied the default treble and cancelled a mid-line octave. `flatten-octave-clefs`
writes all five bars on one line: `[K: treble-8]G8|` sounded right and the bar that
INHERITS it did not.

### A DECORATION INSIDE A CHORD MODIFIES THE CHORD

`buildChord` had carried `ponytail: decorations and chord symbols inside […] are skipped`
since it was written. abcjs pushes an inner accent onto the CHORD's own `el.decoration`
(`abc_parse_music.js:356-363`), with only `style=` going to the individual pitch, and keeps
it only if a note actually follows — a trailing `[ce!p!]` fails its `getCoreNote` and the
accent is discarded.

### A CHORD CAN CARRY ONE DYNAMIC PER NOTE — `volumesPerNotePitch`

`setDynamics` rebuilds it whenever a dynamic is seen, from the decorations filtered to
those that ARE dynamics, and `writeNote` looks it up BY PITCH INDEX. **The list is zipped
against the SORTED pitches positionally — decoration 0 belongs to the LOWEST note, whatever
it was written beside.** `[!pppp!c!ffff!D]` plays its D at 10 and its c at 125, which reads
backwards until you know that. A hairpin does not move it.

### A `|:` WRITTEN AFTER A MEASURE STILL OPENS A REPEAT

One bar element in abcjs, two fields here. Only a `|:` at the HEAD of a line becomes the
next measure's `openingBarline`; `D4 |: E4` puts it on `D4`'s close, and `resolveRepeats`
tested `openingBarline` alone.

### A GRACE'S WRITTEN LENGTH IS SPENT PROPORTIONALLY

`parseGracePitches` skipped the digits — "lengths are ignored" — and the flattener's own
note beside it said the count was all that survived and that the table would speak up if a
fixture ever wrote an unequal group. `flatten-grace`'s fourth bar is `{B2c/d/}` and it did.
abcjs takes `companionDuration / 2` over the graces' SUM and gives each its own length times
that, so the B gets four times each of the others. Only the RATIOS matter — hence
`GracePitch.length` is a bare multiplier, not a duration.

### A TEMPO CHANGE IN ANY VOICE APPLIES TO EVERY VOICE

`insertTempoChanges` (`abc_midi_sequencer.js:569-592`) is a whole pass of its own, and its
comment says why it cannot be inline: "all the elements in all the voices need to be
created first." Every `[Q:]` goes into one table keyed by WRITTEN POSITION, then each voice
gets a tempo element spliced in at every element whose `timing` matches.
`flatten-tempo-3-voices` is three voices changing at four bars, and the top voice — one
`[Q:]` of its own — takes all four.

Two consequences that only fall out of the position keying: the table is seeded with
`{0: tune qpm}`, so **a `:|` back to the head RESTORES the opening tempo**; and a change is
filed under a position rather than a voice, so two voices changing at the same moment leave
whichever was written LAST in force for both.

This is what forced **the written timeline** into being a thing of its own —
`writtenTimeline(voice)`, every event's duration and its position in the SOURCE, before
repeats unroll and before any tempo applies. It runs the triplet-remainder arithmetic once,
in one place, and is keyed by the measure OBJECT, which survives `resolveRepeats` unchanged.

### A RHYTHM HEAD PLAYS THE CHORD, NOT THE NOTE

`!style=rhythm!B` is a slash head — a strum — so abcjs swaps the whole pitch list for the
last chord's CHICK, at the melody's own volume, duration and instrument, and with no key
signature or transpose, because each pitch arrives with `actualPitch` set. The flag was
already here doing its other job (making the chord track sit out that measure);
`setRhythmHead` simply never returned the pitches. Reset at every bar, on every voice:
abcjs's `if (i === 0)` above it is INDENTED as though it guarded both statements and does
not — the braces win.

### THE LAST ONE WAS A POSITION CHARACTER

`"^break"` is `{position: 'above', name: 'break'}` in abcjs's parser and its `findChord`
matches `ch.name`. Ours kept the source spelling, so `^break` matched no synonym:
`flatten-break`'s second bar strummed an A chord through a silence and `flatten-break2`
wrote 37 chord events where abcjs writes 22. One character, two cases, the last two rows.

---

## WHAT IS LEFT

### 1. THE OPTIMISATION PASS — this is the phase boundary, and it is NOW

The full reasoning is in `CHECKPOINT-2026-08-08d.md` and is **not to be re-argued**. In
short: no performance problem exists (220 tunes in 151ms, and the nine-pass solve is
MANDATED by finding 104), the real cruft is structural, and `layout.ts` is 49% COMMENT
whose comments ARE the finding ledger. The test for any deletion: *could a future session
re-derive this finding without the comment?* If no, it stays.

Order: (1) harvest the `ponytail:` ledger and triage; (2) split `layout.ts` along its seams
— glyph metrics, horizontal solve, vertical lanes, curves, text — mechanically; (3) close
the `ENGRAVE` bare-literal table, already half-triaged; (4) the 5 module-level mutables *if*
they are a real hazard for repeated renders.

**THE INVARIANT: NO BASELINE MAY MOVE.** If one does, that is a behaviour change — revert
it, do not re-record it.

### 2. `extra-class` — the ONE open parity target

`oy = -3.88`, one PITCH, uniform, `dy`/`dx`/`ox` at zero. Its tune is
`!class=alice!A!class=bob!!>!T[dfa]`: a chord carrying BOTH an accent and a trill, which
nothing else in either corpus does. `!class=…!` is accounted for and verified by parse, so
the residual is the two-decoration STACK on a chord. Unchanged by this session's chord-inner
decoration work — both of its decorations are written OUTSIDE the `[`.

### 3. AFTER THE FLATTENER — two more oracles, both sitting in abcjs's tests

- `timing.test.js`'s `setTiming` — the event list joined to rendered geometry. Its rows
  carry `line`, `left` and `endX` beside the pitches, so it gates the audio↔geometry
  JOIN, which nothing does today.
- `midi.test.js`'s MIDI FILE writer (`abc_midi_renderer.js`, `get-midi-file.js`) — a second
  surface on top of the event list, compared as a serialized `data:` URI.

Both are harvestable the way `flattener.test.js` was: EVALUATE the test file with
`describe`/`it`/the assert helper replaced. `npm run harvest:audio` is the pattern.

### 4. KNOWN OPEN DIVERGENCES, small and named

- **A full-line `I:` in strict is dropped.** abcjs's `letter_to_body_header` handles one
  (`abc_parse_header.js:423`, and 6.6.3:421), routing it to `addDirective`. Ours is
  mode-gated to non-strict, and the comment beside it says "abcjs does not implement this:
  it has no `I:` case at all", which is **false as written** — that reasoning is about `+:`
  LYRIC CONTINUATIONS, where an `I:` line is consumed as lyric before the dispatch is
  reached, and that part still holds. No case exercises the difference. Fix it with a
  control tune, not by widening the arm and hoping.
- `(p:q:r` with `p !== r` takes a different triplet total in abcjs — the sum of the first
  `r` written durations — and our model does not record `r`.
- Overlay voices are appended after ALL main voices, in (voice, layer) order. abcjs appends
  per STAFF, so a two-staff tune where only the second staff has an overlay would number
  its tracks differently.
- `options.drum` / `drumBars` / `drumIntro` / `drumOff` — the HOST-supplied drum options —
  are not implemented; only the tune's own `%%MIDI` is. No case passes them.
- GONZATO is deferred by decision.

---

## RE-VERIFIED AT THIS COMMIT

```
HEAD                3c354bd   working tree clean
npx tsc --noEmit    clean
npx vitest run      989 / 989
audio ranked        0 of 54     PASSING 54
harvested ranked    0 of 174    (6.7.0 oracle)
pixel ranked        1 of 120    (`extra-class`, recorded)
npx biome check src NOT clean — same rows as before this session, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.** `cd` does not persist between
tool calls and the workspace ROOT has its own vitest reach: run from there and it collects
every test in every sibling repo, including abcjs's own, and reports a wall of failures that
are nothing to do with this one.
