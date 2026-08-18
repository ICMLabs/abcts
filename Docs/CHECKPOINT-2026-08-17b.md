# CHECKPOINT — 2026-08-17b

**`tune.lines` IS CLOSED — 255,684 of 255,684 characters and 295 of 295 tunes**, from
255,641 and 290 when the session opened and from 185 tunes when the arc did. **The
`AbcTune` accessors are CLOSED at 0 of 291**, both measured-not-ported rows with them.
**`tune.deline` is BUILT and its gate is at 1,558 of 1,570 rows**, from 494 when it opened.
**`tune.setupEvents` and `tune.addUsefulCallbackInfo` are BUILT** — and their new gate,
which compares EVERY COLUMN of a timing row, is at 3,339 of 3,366. **`extractMeasures` is
BUILT AND OPENED AT ZERO**, 1,663 of 1,663 rows across 221 files. **`TimingCallbacks` and
the three ANIMATION functions are BUILT** — 4,674 of 4,696 callbacks and 834 of 834
animation frames. Surface **21 → 13 absent**. Suite **1,825 passing, 2 expected-fail, no
reds**.

Every other table is where it was, at zero: `svg-bytes` 0 of 188, `svg-bytes-sibling` 0 of
356, `selectables` 0 of 389 rows across four cases, `metaTextInfo` 0 of 310, `metaText` 0 of
368, `topText`/`bottomText` 0 of 1,023, `formatting` 0 of 7,219, `strTranspose` 0 of 59,
harvested geometry 0 of 177, pixel 0 of 120, DOM 0 of 25, audio 0 of 72, timings 0 of 38,
element timings 0 of 13, chord grids 0 of 23, MIDI 0 of 3.

---

## 1. THE ORACLE DECIDED THE UNIT TWICE, AND BOTH TIMES BY BEING WRONG FIRST

### 1.1 A PARSE-ONLY ORACLE IS A DIFFERENT ENGINE FROM A RENDERED ONE

`deline`'s first harvest called `Parse` directly, as `metaTextInfo`'s does, because `deline`
reads `tune.lines` and `tune.lines` is a parse product. It is not: **the ENGRAVER RENAMES
THE ELEMENT IT DRAWS.** `createKeySignature` opens with `elem.el_type = "keySignature"` and
`createTimeSignature` with `"timeSignature"` (`write/creation/create-key-signature.js:8`,
`create-time-signature.js:8`), writing on the very object `tune.lines` holds — so a
parse-only tune says `key`/`meter` where a rendered one says `keySignature`/`timeSignature`,
and a host gets the rendered one. The golden now carries both names side by side: 96
`keySignature` drawn in the stream and 134 `key` unshifted by `deline` itself.

### 1.2 AN ORACLE HARVESTED WITHOUT THE TEXT-METRIC STUB IS ALSO A DIFFERENT ENGINE

`setupEvents`'s first harvest ran under jsdom with no `getBBox`, and **that changes the
LAYOUT, not merely the text**. Measured on `synth-flattener-41`, a tune with no text at all:

    with dump-svg.js's stub      barline 161.48   whole rest 99.6405
    without it                   barline 159.6988 whole rest 98.7499

Every golden in both corpora was made with that stub and our own metrics reproduce its
table, so the geometry columns were uniformly 1.78px out — and every one of them would have
been "measured" as a defect of ours. The stub is lifted into the harvester now, as
`harvest-abcjs-toptext.mjs` lifts it.

**BOTH FAILURES LOOK LIKE OUR BUG AND ARE THE ORACLE'S CONFIGURATION.** The check that
caught each was the same: take one row, walk it back to the abcjs source, and ask what would
have to be true.

---

## 2. `deline` — A PORT, AND THEN NINE `tune.lines` FINDINGS BEHIND IT

`deline` merges every run of music lines back into one and moves any staff
`meter`/`key`/`clef`/font that CHANGED at a line boundary into the voice stream as a
`-1 … -1` element (`data/deline-tune.js`). It is a LINE-BY-LINE PORT
(`src/compat/deline.ts`): arithmetic-free bookkeeping whose every branch is observable, so
the internal-freedom half of the ruling buys nothing. `objEqual`'s `if (!input) return true`,
`!inputLine.vskip`'s truthiness and the shared mutated field object are all abcjs's and all
kept.

It opened at 494 of 1,570 rows and **what it measured was `tune.lines`'s STRUCTURE**, which
its own per-character gate cannot see — `getElementFromChar` walks every staff of every line
and asks only about characters. Nine findings, in the order they were closed:

- **THE STAFF'S OWN FURNITURE, PER LINE.** `createStaff` builds every line's staff as
  `{voices, clef, key, workingClef}` and adds `meter` only `if (params.meter !== undefined)`
  (`tune-builder.js:1002`, `:1023`) — the clef and key on all 646 staves of the two corpora,
  the meter on 265. **The meter is a THREE-WAY split** and a five-rung ladder settled it,
  because abcjs states it in three files and no one of them says which wins:

      M:3/4   on its own line    the NEXT line's `staff.meter`, and NOTHING in the stream
      [M:3/4] leading a line     a `timeSignature` at the END of the line ABOVE
      K:G     on its own line    a `keySignature` at the end of the line above, AND the
                                 next line's `staff.key`

  On the FIRST line there is no line above and no music yet, so `hasBeginMusic()` is false
  and BOTH forms land on the staff.
- **ONE STAFF PER `%%score` GROUP, AND ONE PER VOICE WITHOUT ONE** — the renderer's own
  `voicesOfStaff`, down to its default. And **a line holds only the staves that wrote music
  on it**: `createStaff` runs from `startNewLine`, so a staff silent on one system is ABSENT
  from that line rather than present and empty.
- **THE NON-MUSIC LINES ARE LINES, AND THEIR POSITION IS LOAD-BEARING** — a `%%text`, a
  `%%center`, a `%%sep`, a `%%vskip` and a mid-tune `T:`. Any line with no `staff` clears
  `inMusicLine`, so the music line after one does NOT merge. Ours pushed every subtitle at
  the FRONT and carried no `%%text` line at all. abcjs's payloads are not interchangeable:
  `subtitle` and `%%text` are `{text, startChar, endChar}`, **`%%center` is an ARRAY of one
  `{text, center: true}` with NO span at all** — `addCentered` takes no `info`, the same
  absence that gives its selectable row no `startChar` KEY — and `separator` is three
  ROUNDED point values.
- **A MID-TUNE `%%MIDI` IS AN ELEMENT** with a `-1 … -1` span, `formatting.midi` being the
  other half of the same `if` (`abc_parse_directive.js:718-724`).
- **`resolveOverlays`, PORTED** — see §3.
- **`createVoice`'S OWN HEAD ELEMENTS** — see §4.
- **`noWarnBeforeTitle`** — see §5.
- **`[K: bass-8]` NAMES A CLEF AND NO KEY** — see §6.
- **THE FIRST `K:` OF A TUNE IS NEVER A KEY CHANGE** — see §7.

### 2.1 THE TWELVE ROWS LEFT, ALL MEASURED

`/tmp/abcts-deline-ranked.txt`, five distinct mechanisms and not one of them a number:

- **A `style` ELEMENT OPENS EVERY LINE ONCE A `style=` HAS BEEN SEEN.** `createVoice` reads
  `multilineVars.style` per line (`tune-builder.js:963-971`); ours is per-NOTE state and the
  parser keeps no per-line record. `S5-directives` tunes 0 and 1.
- **A CHANGED `%%gchordfont` LANDS ON THE STAFF**, and `deline` unshifts it as a `font`
  element (`setLineFont:948-962`). We record no per-line font but `lineVocalFont`.
  `visual-tablature-17`.
- **`deline`'s `objEqual` COMPARES THE ENGRAVER'S MUTATIONS.** With `%%maxStaves 2`,
  `visual-directives-01-incipit`'s lines 3 and 4 are never drawn, so their `staff.clef`
  carries no `abselem` where lines 1 and 2 do — and the JSON differs, so abcjs unshifts a
  clef on each. Reproducing it means reproducing which lines the engraver touched.
- **PROSE SPANS.** `frere-jacques`'s licence text is read as music by strict, as it is by
  abcjs, and the two disagree about where each accidental "note" starts inside it.
- **AN `&` LAYER'S OWN `key`**, one row.

⚠️ **AND `deline`'s CORPUS IS 312 TUNES WHERE `tune.lines`'s IS 295** — `frere-jacques` is
not in the character gate's golden at all. A gate's reach is a property of its enumeration,
and two gates over "both corpora" enumerated differently.

---

## 3. `resolveOverlays` — WHAT AN `&` REALLY IS

The projection reached the layers through the RENDERER's `expandOverlays`, which is a layout
convenience: our layer voices carried zero-width barlines (`bar@26..26`) that exist in no
source and no abcjs output. abcjs does something quite different and a host sees all of it,
so it is ported line by line (`src/compat/overlays.ts`, `tune-builder.js:515-620`):

- the parser appends an `{el_type: "overlay"}` for the `&` and goes on appending to the SAME
  voice, so a layer's notes sit between the main voice's in reading order;
- `cleanUp` then snips each layer into a voice of its own, opened by a `stem` `down`;
- **it BACK-FILLS EVERY EARLIER LINE** with a copy of each of its voices, notes replaced by
  invisible rests of the same duration and the SAME SPAN;
- and it leaves two more stems behind per snip — `auto` after it, `up` at the last barline
  before it, where `findLastBar`'s `i > 0` guard stops at index 0 whatever is there.

`synth-flattener-21` is exact on all four rows: `[stem, note, stem, stem, bar, note, bar,
stem]` on its first line, which is the shape that proves the port rather than a count.

⚠️ **OUR PARSER'S OWN PADDING WAS THE TRAP.** It pads every measure of the tune to the
tune's overlay depth with RANGELESS invisible rests so the renderer can tile them; abcjs's
stream holds the `&` and its own notes and nothing else, generating its padding inside
`resolveOverlays` from `durationThisBar`. Emitting the padding as overlays made every
measure look like one and snipped the first line's own notes out of it — six voices where
abcjs has three. **The written layer is the one with a source range.**

---

## 4. `createVoice`'S HEAD ELEMENTS, AND THE RATCHET THAT CAUGHT THE COST

Every line's voice opens with what `createVoice` appended when it made it — a `style`, a
`stem`, a `scale` and a `color`, each with a NULL `startChar` so `appendElement` leaves the
key off entirely. Two sources of a stem, and the second surprises: `V:… stem=up` names it,
and **a voice that is not the FIRST on its staff gets `down` and puts an `up` on the first
one**.

⚠️ **abcjs's guard against doubling that `up` NEVER FIRES** — it tests
`thisStaff.voices[0].el_type === 'stem'` on the ARRAY rather than on its elements (`:980`),
so a three-voice staff splices two `up` stems onto its first voice. Ported as written.

⚠️ **AND THE ORDER `createVoice` RUNS IN IS THE SOURCE'S, NOT THE STAFF'S.** The `up` is
spliced only `if (thisStaff.voices[0] !== undefined)`, so a `%%score (V2 V1)` whose `[V:V1]`
line is written FIRST creates staff voice 1 before staff voice 0 exists and no `up` is ever
added — `score-reorder-shared` has none on its `v0`.

**AND THE RATCHET CAUGHT WHAT THE TOTAL HID.** The `deline` number jumped 160 rows in the
same run that took FIVE ratcheted `tune.lines` tunes red and the character total from
255,641 to 255,576. The hoist read a LEADING RUN of staff fields, and a stem at index 0
ended the run before it began — where `appendStartingElement` scans the voice for a `note`
or a `bar` and treats everything else as not there (`:273-292`). It now takes every staff
field BEFORE the first note or bar, whatever stands between them.

---

## 5. `noWarnBeforeTitle` — INSTRUMENTED, AND THE SOURCE READ ALONE SAID THE OPPOSITE

A standalone `K:` is appended to the line ABOVE it like every other one — and then, if the
NEXT line is a subtitle, `cleanUp` takes it straight back off (`tune-builder.js:1075-1111`).
"A `K:` immediately preceded by a `T:` starts a new section, so the cautionary key change
belongs to the new section's initial key." The naturals of that new key are stripped with it.

`appendStartingElement` FIRES for that `K:D` — `ASE type=key 400..403 lineNum=1 …
voice=["note","bar"]`, so the first arm pushes it — and the element is nonetheless absent
from abcjs's own `tune.lines`. Only the pop explains both halves.

**AND IT HAD TO RUN AFTER THE HOIST**, which is what puts the key at the END of the line
above: run before it, the pass looked at a line whose last element was still a note and did
nothing at all, with every test green.

---

## 6. `getKeyPitch` IS UPPERCASE-ONLY, AND `bass` IS NOT THE KEY B

`hasKeySpec` lowercased the first token before testing `/^[a-g]/`, so `bass` and `alto` read
as keys. abcjs's `getKeyPitch` has `case 'A'` … `case 'G'` and **its lowercase arms are
COMMENTED OUT** (`abc_tokenizer.js:33-45`).

`synth-flattener-20` is `[K: treble+8]`, `[K: treble-8]`, `[K: bass-8]`, `[K: bass+8]`: the
two `bass` ones grew a `keySignature` element beside their clef — and, worse than the extra
element, every accidental after them was being wiped by a silent change to B major.

---

## 7. `tune.lines` CLOSED — THE LAST THREE FINDINGS

- **AN OPENING `(` BEFORE A GRACE OR A DECORATION BELONGS TO NOTHING.**
  `letter_to_open_slurs_and_triplets` eats the `(`s and the whitespace between them BEFORE
  anything is appended (`abc_parse_music.js:890-953`), and `startI` was taken at the top of
  that iteration — so whether the run is inside the element depends on what comes NEXT. A
  core note or a `[` chord and the element is appended in the same iteration, keeping its
  `(`; a grace group, a decoration or a chord symbol and nothing matches, the iteration ends
  having appended nothing, and the next one opens past the run. MEASURED by instrumenting
  `startI`, because the source reads both ways:

      ITER startI=14   NOTE 14..25 "\"Bb\"{C}B,4 "
      ITER startI=25              <- the `(`, and NOTHING is appended
      ITER startI=26   NOTE 26..35 "{^CD}B,4 "

  ⚠️ **A TRIPLET INSIDE THE RUN KEEPS THE WHOLE RUN, SLURS AND ALL** — `S8-layout` tune 8
  writes `((3e` and abcjs answers `note` for BOTH parentheses. The first cut dropped the
  slur's and took that ratcheted tune red for eight characters while the total improved.
- **EVERY `[M:]` IN A BAR IS AN ELEMENT, AND THE STAFF'S IS THE FIRST THAT LEADS THE
  MUSIC.** `Measure.meterChanges` carried `{meter, at}` with no range, so
  `[M:2/4]y[M:3/4]y[M:4/4]` had only its LAST entry reachable. `meterChange` is the last
  entry — the meter IN FORCE, which is a different role from the drawn ones.
- **A PARSE FAILURE OWNS NO CHARACTERS**, and **THE RULE WAS FOUND BY ENUMERATING THE NULL
  RUNS RATHER THAN BY READING THE SOURCE.** Every run of characters abcjs assigns to no
  element between two elements on one line, over both corpora, is fifteen rows: an `&`, a
  space, an inline `[V:]`/`[K:]`/`[L:]`/`[I:]`, a `(`, a bare `#`, and `^3/2`/`_3/2`. A
  first cut guessed the rule from the characters themselves — a whitelist of what abcjs's
  tokenizer can consume — and took the corpus from 255,660 to **255,158** in one run,
  because prose is made of letters that look exactly like decorations. The parser is the
  only side that knows what it could not read, so it records it: `Score.unreadable`.

  ⚠️ **AND THE DOT OF A DOTTED SLUR IS NOT UNREADABLE.** `letter_to_accent`'s `case '.'`
  BREAKS out of its switch when a `(` or `-` follows: it returns no decoration, but the
  iteration goes on to read the note, so `startI` is still the dot. Three of them in
  `S3-note-syntax` tune 22, four characters each — one ratcheted tune red while the total
  improved, again.
- And **THE FIRST `K:` OF A TUNE IS NEVER A KEY CHANGE, WHATEVER STOOD ABOVE IT.** abcjs's
  guard is `!multilineVars.is_in_header` and `is_in_header` is cleared by the `K:` ITSELF
  and by nothing else — where our `bodyStarted` is also set by MUSIC, which strict makes of
  a `+:` prose line. The METER is the other way round and stays on `bodyStarted`: abcjs's
  `M:` arm tests `hasBeginMusic()`, which the prose DOES satisfy. **One flag standing for
  two predicates, and this time `deline` is the gate that could see it.**

---

## 8. THE TIMING ROW'S GEOMETRY HALF — A NEW GATE, AND FIVE DEFECTS IT NAMED

`tune.setupEvents(startingDelay, timeDivider, startingBpm, warp)` is `setTiming`'s own walk
with the four numbers it computes handed in; `addUsefulCallbackInfo(rows, bpm)` is the one
figure it stamps on every row. Both are public in abcjs and `setTiming` is a caller like any
other.

**THE ORACLE IS NEW BECAUSE THE OLD ONE COULD NOT REACH IT.** `setTiming`'s gate is at 0 of
38 and is harvested from abcjs's own `doWarpTest`, which asserts `milliseconds` and
`millisecondsPerMeasure` alone. A timing ROW carries `line`, `top`, `height`, `left`,
`width`, `startChar`, `endChar`, `startCharArray` and `endCharArray` as well — the GEOMETRY
a playback cursor draws with, joined to the time (`abc_tune.js:298-395`). Ours carried the
clock alone, and the new gate opened at **174 of 3,366 rows** with the old one at zero. **A
COMPARISON CAN ONLY CATCH WHAT ITS REPRESENTATION CAN EXPRESS**, and the representation is
the oracle's column list.

The join is `LayoutElement.sourceEvent`, the same reference the selectable array and
`tune.lines` are joined by; `src/audio/timing.ts` still imports no renderer, because the
caller passes a `geometryOf`. The formulas are abcjs's and the unit is the PITCH step, HALF
a staff space: `top = staffs[0].absoluteY − staffs[0].top × STEP`, `bottom` from the last
staff, `height` their difference; `left` is `element.x` and `width` its ROD width — abcjs's
`element.w` is the INK, not the spring the cursor advanced by.

Five defects, none of which the clock could see:

- **`timeDivider` IS A DEAD PARAMETER.** The first statement inside abcjs's voice loop is
  `timeDivider = this.getBeatLength() * bpm / 60` (`:459`), which overwrites whatever was
  passed before a single element is read. Ours honoured it, and the gate's `half-divider`
  case — byte-identical to its `canonical` one in abcjs — was DOUBLE in ours.
- **`noteFound` RESETS AT EVERY LINE WHERE `measureNumber` DOES NOT.** abcjs declares it
  inside `makeVoicesArray`'s per-LINE loop and the counter outside it, so "skip a bar line
  that appears at the left of the music" is per SYSTEM. Three fixtures were one measure high
  on every row after their first line break.
- **A REST HAD NO `rodWidth`**, so `width` reported the SPRING — 60 against abcjs's 11.25 —
  and a rest UNDER A CHORD SYMBOL takes its width from the symbol, where the glyph terms
  carry `minspacing` and the symbol does not.
- **`line` IS THE INDEX IN `tune.lines`, NOT THE SYSTEM'S** — a subtitle between two systems
  counts, which `synth-timing-05-subtitle-crash` says at line 2.
- **A BARLINE INSIDE A REPLAYED REPEAT STILL OPENS A MEASURE** — `nextIsBar = ret.nextIsBar`
  in the replay loop (`:499-500`), the only place ours did not read the barline.

### 8.1 AND IT CLOSED BOTH MEASURED-NOT-PORTED ROWS

- **AN `&` OVERLAY LAYER IS A VOICE IN THE TIMING WALK TOO**, because abcjs walks the DRAWN
  voices and `resolveOverlays` has already split them. `S5-directives-tune2`'s `end` was a
  whole note late because the layer was in no voice at all — named by the gate's
  `startCharArray` column, not by the clock.
- **`%%maxStaves` TRUNCATES THE CLOCK.** `makeVoicesArray` walks the groups `draw()` BUILT
  and `draw()` breaks out once `nStaves > maxStaves`, so an incipit's later systems take no
  time. A caller that supplied a `geometryOf` has laid the tune out and our layout truncates
  the same way, so **an element with an event and NO geometry is one abcjs never saw**.
  Without a `geometryOf` the whole tune sounds, which is what the library path has always
  done.

The accessor gate reads its totals off the TUNE OBJECT now, where a host reads them, rather
than off `timingsOf` — it had been measuring the library path and reporting a row abcjs
never disagreed with us about. **0 of 291.**

### 8.2 `endX` — WHERE THE CURSOR STOPS, AND THE HOUR A UNITS TRAP COST

`addEndPoints` runs over the sorted rows before the `end` row is pushed: a row runs to the
NEXT row's `left` when the two are on the same system, and to that system's own right edge
when they are not, with two more assignments from the REPEAT branch — "the cursor won't go
past the end repeat". Barlines carry their span into the timing walk for those two.

**abcjs's `staffGroup.w` IS OUR `musicWidth` LESS THE LEFT MARGIN** — 224 of 225 systems
agree to the digit, stretched and unstretched alike — and it is the MUSIC's width rather
than the system's box, which `max(musicWidth, proseWidth)` widens for a long title.

⚠️ **AND IT LOOKED LIKE TWO RULES FOR AN HOUR BECAUSE MY OWN PROBE HAD THE WRONG UNITS.**
`layout`'s `systemWidth` option is the PAGE in layout units — `(staffwidth + 2 × padding) /
UNIT_PX` — and the probe passed 740, the STAFFWIDTH, so it laid out a different tune from
the one every gate renders at 770. The derived comparisons then said abcjs's number was our
width PLUS 15 on a stretched line and MINUS 15 on a short one, with a plausible story for
each, and the handoff was about to record "the layout must expose a number it does not
have". Instrumenting the SOLVE itself (`ABCTS_W`, kept in `layout.ts`) printed
`solved=755.0000000000003` against abcjs's `staffGroup.w` of `755.0000000000003` and ended
it in one line. **MEASURE THE THING, NOT A DIFFERENCE OF THINGS YOU DERIVED.**

### 8.3 THE 27 ROWS LEFT

- **21 `startCharArray`: an overlay layer exists on every measure of ours and only where
  `resolveOverlays` put one.** Our model pads every measure to the tune's overlay depth;
  abcjs back-fills only the lines BEFORE the `&`.
- **6 `height`: one system's BOTTOM pitch, and only where a tie hangs below it.**
  `synth-timing-10-stretchlast-1` reports −1.0493 against abcjs's −2 on its first system and
  −3 on its second, which is exact. Both engines PLACE the two systems identically — the
  next system's `absoluteY` agrees to the digit — so this is what the extent is REPORTED as,
  not where anything is drawn.

---

## 8.4 `extractMeasures` OPENED AT ZERO, AND THAT IS THE SECOND PROOF

1,663 of 1,663 rows across 221 files, first run. Every fragment it returns is
`tune.abc.substring(fragStart, elem.endChar)` — `tune.lines`'s SPANS read back out as TEXT —
so it is the strictest consumer of the character gate there is, and it agreeing everywhere
is an independent check on 255,684 of 255,684. Three quirks ported: it reads ONE staff and
ONE voice, the header is split on the first `K:` textually (**28 files THROW and the throw
is in the golden**), and `lastChord` changes type mid-loop from an element to a name string.

---

## 8.5 THE CURSOR — `TimingCallbacks`, THE THREE ANIMATION FUNCTIONS, AND AN ULP

**abcjs's OWN TESTS FOR THESE ARE UNPORTABLE AND THE CODE IS NOT.** They drive a real timer
and `sleep()`; but `doTiming(timestamp)` takes the time as an ARGUMENT and the only other
host calls are `requestAnimationFrame`, `setTimeout` and `performance.now()`. Stub those
three and 436 lines become a pure function of a timestamp sequence — so both oracles drive
at a fixed 16ms and record every callback (124 cases × four shapes) and every DOM change
(54 cases × three shapes). ⚠️ **AND THE FIRST FRAME CANNOT BE 0**: `doTiming` opens with
`if (self.lastTimestamp === timestamp) return` and `lastTimestamp` starts at 0, so a drive
from zero returns before registering the next frame. The first animation harvest logged one
frame per case with an empty cursor, which is what that looks like from outside.

Three defects the callback gate named, none of them in the class:

- **`skipTies` TESTS `=== null`, AND THE `end` ROW'S `left` IS `undefined`.** A tie's
  continuation carries an explicit `null` and is skipped; the END row carries no `left` KEY
  and is not — which is what gives the last beat its `endMs` and therefore a cursor
  position. Coercing the two with `?? null` emptied the final `position` of every tune.
- **THE WARP TESTS `metaText.tempo`, THE HEADER'S ALONE.** An inline `[Q:]` never reaches
  `metaText`, so a tune whose only tempos are inline is PLAYED at the host's rate with its
  relative changes intact rather than warped. `getBpm` already made the distinction;
  `setTiming` did not, and `flattener-10` was 6,678ms against abcjs's 9,318.
- **`getMeter()` HANDS BACK THE NUMERATOR AS WRITTEN, `2+3` AND NOT `5`** — which is why
  `getMeterFraction()` splits on `+` at all. The irregular-meter beat branch tests for that
  `+`, so a summed numerator sent `M:2+3/8` down the regular path.

**AND THE ANIMATION GATE CLOSED ON AN ULP EVERY OTHER GATE'S TOLERANCE WAS HIDING.** The
cursor's WIDTH came out 15.902000000000008 against abcjs's 15.902000000000001 — an eighth's
rod, which is its FLAG: `addRight` is `w = max(w, dx + w)` and ours derived the dx back out
of two absolute x's. `PlacedGlyph.dx` already existed for exactly this reason on the
placement side. The byte gates are unmoved at 0 of 188 and 0 of 356 and the geometry table
at 0 of 177 — none of them could see it, because they all compare that number with a
tolerance.

---

## 9. THE HARNESS

Ours, gated on their own env var: `ABCTS_Y`, `ABCTS_H`, `ABCTS_PL`, `ABCTS_PLR`, `ABCTS_SP`,
`ABCTS_XX`, `ABCTS_PROBE`, `ABCTS_CHECK`, `ABCTS_ABSY`, `ABCTS_TEMPOX`, `ABCTS_OTHER`,
`ABCJS_CHILD`.

| Script (`npx tsx scripts/…`) | Prints |
|---|---|
| `zzdel.ts` | **NEW** — every `deline` row that differs for one case (`SLUG=<slug>`), abcjs's above ours |
| `zzgeom.ts` | **NEW** — our laid-out systems and elements: `absoluteY`, the two extent pitches, each element's `x`/`width`/`rod`/`rodWidth` (`F=<path> [T=] [W=]`) |
| `zzmidi.ts` | **NEW** — every `%%MIDI` our parser attached to a measure |
| `zzlines.ts` | every character where `getElementFromChar` differs |
| `zzsel.ts` / `zzsink.ts` | every open selectable row BY FIELD / what the EMITTER records |
| `zzmti.ts` / `zzmt.ts` / `zztt.ts` / `zzfmt.ts` | `metaTextInfo` / `metaText` / `topText` rows / `formatting` settings |
| `zzacc.ts` / `zztr.ts` | accessor rows (now off the TUNE OBJECT) / `strTranspose` cases |
| `zzr.ts` / `zzc.ts` / `zzpm.ts` / `zzs.ts` | one fixture rendered like the byte gate / with classes / print / stacked |
| `zzgap.ts` / `zzbars.ts` / `zztypes.ts` / `zzkey.ts` / `zztim.ts` / `zzev.ts` / `zzflat.ts` / `zzh.ts` | as before |

Harvesters (`node scripts/…`), all of which RUN abcjs: `harvest-abcjs-deline.mjs` and
`harvest-abcjs-setupevents.mjs` are the new ones. **BOTH RENDER AND BOTH NEED THE
`getBBox` STUB** — see §1.

abcjs probes in the SCRATCHPAD COPY at `/tmp/gp/abcjs` — never `../abcMusicKit`. New this
session, and each is three lines in a file that already existed:

| Probe | Prints |
|---|---|
| `deline.js` / `deline2.js` / `deline3.js` / `deline5.js` | what `deline` does over a corpus / which lines are non-staff / where `staff.meter` appears / a five-rung ladder over standalone vs inline `M:`/`K:` |
| `nonmusic.js` | every NON-STAFF line of a fixture, whole, after a render |
| `staffclef.js` | each line's `staff.clef`/`key`/`meter` with the `abselem` replacer |
| `ABCTS_STARTI` in `abc_parse_music.js` | every iteration of `parseMusic`'s loop and every note appended, with `startI` |
| `ABCTS_ASE` in `tune-builder.js` | every `appendStartingElement` with the line it landed on and that voice's contents |
| `ABCTS_CWR` in `layout/layout.js` | `centerWholeRests`'s before/after elements and the x it chose |
| `ABCTS_MVA` in `abc_tune.js` | `makeVoicesArray`'s elements per line, with `x` and `w` |
| `ABCTS_LAYOUT` in `layout/layout.js` | every `layout()` call, its width and its caller |

---

## 10. THE RULES THIS SESSION PAID FOR

- **AN ORACLE IS A CONFIGURATION, NOT A PROGRAM.** Twice: a parse where a render was needed
  (§1.1) and a render without the text-metric stub (§1.2). Both looked exactly like a defect
  of ours, and both were found by walking ONE row back to the abcjs source.
- **A RATCHET THAT NAMES ROWS CAUGHT THREE MORE REGRESSIONS THE AGGREGATE HID**, every one
  while the total improved: the hoist's leading run (§4), the `((3e` triplet (§7), the
  dotted-slur dot (§7).
- **GUESSING A RULE FROM ITS OUTPUT COSTS MORE THAN MEASURING IT.** The parse-failure
  whitelist took the character gate from 255,660 to 255,158 in one run; ENUMERATING abcjs's
  own null runs gave the answer in fifteen rows.
- **WHEN ONE FLAG STANDS FOR TWO PREDICATES, THE GATE THAT DEFENDS THE OTHER ONE IS THE ONLY
  THING THAT CAN SAY SO** — again, and this time it was `bodyStarted` for `is_in_header`,
  with `deline` as the gate.
- **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION** — `deline` covers 312 tunes where the
  character gate covers 295, and `frere-jacques` had never been measured per character at
  all.
- **MEASURE THE THING, NOT A DIFFERENCE OF THINGS YOU DERIVED.** §8.2: an hour on
  `staffGroup.w` because a probe passed the STAFFWIDTH where the option is the PAGE, and
  every comparison after that was between two numbers neither of which was the one in
  question. One `console.error` inside the solve settled it.
- **PORT THE QUIRK.** `findLastBar`'s `i > 0`, `createVoice`'s always-false `found`, the dead
  `timeDivider`: three abcjs bugs reproduced deliberately, each visible in a count a host
  reads.
