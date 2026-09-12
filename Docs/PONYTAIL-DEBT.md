# `ponytail:` debt ledger — abcts

Harvested by `/ponytail-debt`, 2026-09-12. **One row per deliberate shortcut**: each names the
ceiling it accepts and, where it has one, the trigger that should reopen it.

⚠️ **A row tagged `no-trigger` names a ceiling and nothing that would make anyone
revisit it.** Those are the ones that rot: the reasoning survives, the deadline never
arrives. They are not necessarily wrong — several are deliberate permanent positions —
but each should either GAIN a trigger or be restated as a decision rather than a debt.

**63 markers, 26 with no trigger.**

⚠️ This is a SNAPSHOT and the repo's own handoffs are the authority on which have been
turned into controls: `HANDOFF-2026-09-08.md` records a sweep of 97 markers that wrote
16 controls and found **4 real defects of 16 predictions** — a 25% hit rate, which is
why the remainder is worth a pass rather than an assumption.

## `src/renderer/layout.ts` — 37

- **:413** — the above lane can reach `partStep` once three annotations stack, and the below lane can reach `lyricStep` at two. No fixture combines them, and the real fix is the skyline pass this whole block is waiting on rather than more hand-picked numbers. ✅ **MEASURED 2026-09-08: three above AND two below on
- **:915**  `no-trigger` — the quarter-tone prefixes `_/` and `^/` are in abcjs's `accMap` and not here, because `Accidental` is a whole-semitone enum. Strict draws nothing for a three-quarter tone anyway — see `Docs/ABCJS-DIFFERENCES.md`.
- **:2231** — the x is in LAYOUT units and the emitter scales by `OUT` — 1 for every default host, and the whole effect is one sub-pixel, so a non-default `%%scale` measures at an x off by that factor. Thread `OUT` in if one ever matters.
- **:2334** — abcjs's own table maps a `3/32` beat unit to `flags.u16nd` (`tempo-element.js:35`), which is NOT A GLYPH THAT EXISTS — a typo for `u16th`, so abcjs silently draws no flag there. Not reproduced: it would mean dropping a flag we can draw, and `noteGlyph` never produces that shape anyway. It belongs in
- **:3198**  `no-trigger` — quantised to the nearest quarter tone in the OTHER modes, so `^1/3G` rounds to a half-sharp rather than drawing nothing; Bravura has no third-tone glyph. In STRICT it never arises — `^1/3` is three characters and `getCoreNote` abandons the note, which is `abcts-ledger-gaps-4` tune 2, byte-exact with
- **:5851** — a module-level switch rather than a `strict` argument threaded through `textWidth`'s sixteen call sites, most of which do not have the mode in scope. Thread it properly if a caller ever needs both metrics in one render.
- **:5887**  `no-trigger` — a module-level map, the seventh such switch, for the same reason as `SCORE_FONTS` — these are read deep in the lane arithmetic and threading them would touch every frame between.
- **:5926**  `no-trigger` — a module-level switch, the sixth beside `PRINT_SCALE` and `STRICT_TEXT_METRICS`.
- **:5955**  `no-trigger` — a module-level switch, the seventh beside `STRICT_TEXT_METRICS` and `PRINT`.
- **:6014**  `no-trigger` — a module-level switch, the fifth beside `STRICT_TEXT_METRICS`, `JAZZ_CHORDS`, `SCORE_FONTS` and `PERC_MAP`. Eight of the twenty-one sites are in functions with no `strict` in scope — `ledgerLines`, `layoutBeam`, `staffLinesFor`, `buildCurve` and the rest — and threading a boolean through eight signa
- **:6070**  `no-trigger` — a module-level map rather than a `fonts` argument threaded through the measure, note and bar builders. abcjs keeps it on the controller for the same reason.
- **:6125** — one line, where abcjs splits on `\n` first. Our chord symbols carry no newline; a multi-line one would need the loop.
- **:6954** — abcjs writes ONE `<text>` for every verse of a note, tspan per line, where ours writes one per verse in its own lane. The trailing blank is added only where there is a single verse; a note with two would need the texts merged, which is a lane change rather than a markup one. **MEASURED: `abcts-ledge
- **:7035** — a run that crosses a system break is truncated at the edge, because anchors arrive already filtered to one system. v1 draws a stub and resumes on the next; worth doing when a fixture needs it.
- **:7052** — a pair that opens on one system and closes on another is dropped rather than split, because anchors arrive filtered to a single system. Slurs solve this properly by resolving after the whole tune is packed; hairpins can move to that machinery when a fixture needs it. **MEASURED: `abcts-ledger-gaps-4
- **:8174** — a curve whose ends fall in different SYSTEMS is dropped rather than drawn wrong. Engraving splits it in two, one piece running to the end of the first system and another from the start of the next; that needs the halves laid out separately and is a slice of its own. `vree-ties-across-bars` ties acro
- **:8330** — abcjs excludes the HEAD, not the note — a chord where one head closes a slur still contributes its others. Nothing in either corpus writes one; widen this to `tieSteps` if something does. ✅ **MEASURED 2026-09-08: `(C [Ec]) d e` is byte-identical in both engines** (`scripts/zzledger.mjs`). The corpus
- **:9011**  `no-trigger` — `startY`/`endY` are the anchor pitches, which is `calcSlurY`'s `else` branch. An ABOVE slur between two up-stem notes reads the middle of the stem instead; that side is inside the notes' own ink in every corpus fixture, so it never binds.
- **:9153**  `no-trigger` — `(highestVert + pitch) / 2`, the half-way-up-the-stem case for an above end on an up-stem note, is not reproduced. Probed, `highestVert` IS the anchor pitch on every binding curve here, so the average is the pitch and the branch is a no-op.
- **:9981**  `no-trigger` — the BEAMED arm still has no pitch. `heightAtMidpoint` interpolates the beam's own two pitches where ours samples the drawn line and undoes half its thickness — a length with no pitch of its own — so that arm keeps the division. No fixture in either corpus reaches the extent through a beamed tuplet.
- **:12640** — `realTextWidth` below is unreachable in consequence. Left in place — it is the headless real-metrics path if this is ever declared, and it costs one branch.
- **:12758** — first voice up, everything below it down. Three voices on a staff — the corpus has `( 1 2 3 )` — conventionally wants the middle one placed by context, which needs collision detection this engine does not have yet. abcjs does the same thing here, forcing every voice after the first down, so strict h
- **:12775** — that suppression is not modelled separately. It only shows when SOME voices on a staff declare and others do not, which no corpus tune does — ragtime declares on all three of its bass voices and none of its treble ones. ✅ MEASURED 2026-09-08: a two-voice staff with `stems=up` on the first and nothin
- **:12861** — abcjs `return`s at the FIRST lyric-bearing element, so a later one cannot revive the flag; this filters and asks `some`. The two differ only where one LINE holds two lyric elements with different `vocalPosition`, which needs an inline `[I:vocal …]` mid-line — nothing in either corpus writes one. Mak
- **:13006** — re-scanned per measure rather than gathered once — it runs for `$` voices only, and both corpora have five such lines between them.
- **:13683** — NO width fallback. A source line wider than the page compresses to fit and keeps compressing, exactly as abcjs does — there is no width at which it wraps. A host wanting reflow needs a mode that re-breaks, and none is asked for; adding one speculatively would put back the packer this replaces.
- **:14251** — abcjs's ABSOLUTE guard — `if (spacing * minSpace > 50) spacing = 50/minSpace` — is NOT reproduced, and this closes that long-standing open item rather than deferring it again. `minSpace` is `min` over every pass of the pushing voice's spacing units, and the FIRST pass always contributes zero: every 
- **:14370** — abcjs moves `maxChild.children[0].x`, the bar's FIRST relative child, where this moves the whole element. The two agree on a plain `|`, whose element is that one rule. They part on a `|]` (two rules, one of which would stay behind) and on a bar carrying a number — abcjs would deform it and we transl
- **:16525**  `no-trigger` — no `%%titleformat`, `%%writefields` or `%%aligncomposer`. v1 has all three as NATIVE extensions; nothing in the corpus sets any, and each changes only where within the block a field lands, not the block's shape.
- **:17499** — one spend for the block, where abcjs builds one `Subtitle` per line. A mid-tune `T:` block is one line — the header's subtitles take `advanceText` — so the two agree; spend per line if a block ever carries two.
- **:19030**  `no-trigger` — abcjs rounds all four to whole pixels; we do not, so an edge can land half a pixel off its. Sub-pixel, and rounding here would put a px-space conversion in geometry that is otherwise in staff spaces throughout.
- **:19503**  `no-trigger` — abcjs's order above the staff is lyric, chord, ENDING, dynamic, part, tempo, and ours spends the ending lane last of all — so on a staff that ALSO carries a part label or a tempo mark the bracket lands above them where abcjs puts it below. The staff's total is right either way, because the lane goes
- **:19565** — `closeTop`/`closeBottom` are read over GLYPHS and LINES here, where abcjs reads every child except a `chord` (above) or a `lyric` (below) — so an ANNOTATION on the other voice's note would pull abcjs's `closeTop` up to the annotation lane and ours would not. Nothing in either corpus writes one on a 
- **:20018**  `no-trigger` — the loop is gone rather than guarded, since nothing else read it.
- **:20334** — live only. Headless never reaches zero — it does not reproduce `getTextSize`'s whitespace early-out at all, since `goldenTextHeight` answers from the table whatever the string — so the 691 goldens are untouched and the rule is unproven on that path. Reproduce the early-out there too if a golden ever
- **:20448**  `no-trigger` — abcjs's `diff` also carries `element.bottom - staff.bottom` — the element's own overhang below the staff's lowest point — and takes the LAST such element rather than the deepest. **MEASURED: `abcts-ledger-gaps-4` tune 4 is `c c C,, c|` with lyrics, whose lowest note is not its last, and it is byte-e
- **:20461**  `no-trigger` — a staff whose only below-dynamic is a HAIRPIN reserves nothing, because hairpins resolve after packing and `spannerLines` is still empty here. abcjs does reserve for them (`dynamicHeightBelow`, `crescendo-element.js:11`). Taking presence from the model instead was tried and made the corpus much wors

## `src/parser/parser.ts` — 11

- **:16** — DEFERRED — part ORDER (a header `P:ABAB`, which is a different thing from the body `P:` label), symbol lines (`s:`), and most `%%` directives. Each is a separate step driven by the corpus fixture that needs it; the lexer already tokenizes all of them, so the work is parser-side only.
- **:366** — the `Unsupported key signature` early return is not reproduced, so a `K:Cbmin clef=x` would report a parameter abcjs never reaches. No corpus tune writes an impossible key with a modifier after it; add the guard when one does. ✅ **THE WARNING PREDICTION IS CORRECT AND THE CONTROL FOUND SOMETHING ELS
- **:1120** — ONE STAFF PER VOICE. abcjs back-fills a staff by copying EVERY voice on it, so a two-voice staff gains two voices per pass where this gains one each. Nothing in either corpus writes an `&` on a shared staff; the ranked tables will say so if anything does.
- **:2751** — the voice's FINAL shift applies to all of its measures. A mid-body `V:` that changes `octave=` partway would need this per-measure; none does. PER MEASURE, because the tune-level `K: octave=` can change mid-tune and a voice with no `octave=` of its own follows it from that point.
- **:3372** — this follows SOURCE order, which is engraving order for a tune whose voices are interleaved line by line and for every single-staff tune — not for one written a whole voice at a time, where abcjs engraves line 1 of every voice before line 2 of the first. Upgrade path is a post-parse pass over `score
- **:3833**  `no-trigger` — non-strict stops at the first UNESCAPED `%` but does not yet UNESCAPE the `\%` it keeps, so `abcjs-extended` prints the backslash. Fixing that means rewriting the text after every field and music handler has taken its source offsets, which is a bigger change than the one this corrects.
- **:4071** — abcjs appends a `color` ELEMENT to the voice stream, so a second `%%voicecolor` mid-tune repaints from there on and `drawVoice` colours the whole LINE it lands in, retroactively. We hold ONE colour per voice. ✅ **MEASURED 2026-09-09 AND THE PREDICTION HELD** — a second `%%voicecolor` between two mus
- **:5403**  `no-trigger` — onto the voice in force, which for a header `K:` is the implicit one. A voice DECLARED after such a `K:` takes the clef's copy in abcjs (`:514-515`), where here it would take its own default; nothing in either corpus writes that pair, and `abcts-ledger-gaps` tune 4 is what named the field at all. ✅ 
- **:5457**  `no-trigger` — the Swift lexer streams; buffering one line's tokens into an array costs nothing at ABC line lengths and makes the lookahead in note assembly (octave marks, then length) plain indexing instead of a peek/rewind protocol.
- **:6604**  `no-trigger` — the WARNING alone, not `unreadable` — the character-ownership gate is closed at 255,684 and nothing there stands on this path, so moving ownership would be a change with no oracle asking for it.
- **:7032** — microtones inside a chord when a fixture needs it. ✅ MEASURED 2026-09-08: `[^/C^/E]` is byte-identical in both engines (`scripts/zzledger.mjs`) — abcjs carries no per-pitch cents either.

## `src/core/model.ts` — 4

- **:335** — the FACE is recorded but not emitted. Output asks for `font-family="serif"` and lets the viewer supply the face, which is the same call the rest of the text layer makes and the reason the width table is an estimate. Weight, style and size are what Gonzato §4.1.4 actually distinguishes — Times-Roman 
- **:1313**  `no-trigger` — BODY `P:` only. A `P:` in the header is a part ORDER ("ABAB"), a different thing entirely, and is still deferred.
- **:1930** — scoped to the FIRST SYSTEM rather than to abcjs's tune LINE. The two differ only when the first source line WRAPS, where `wrap_lines.js:50` copies the running key signature onto the continuation. **MEASURED: `abcts-ledger-gaps-4` tune 5 wraps its first line and changes key after it, and is byte-exac
- **:2185** — free text BETWEEN two music lines lands here too. No fixture does it, and placing it properly needs free text to be a line in its own right rather than a property of the tune.

## `src/compat/lines.ts` — 3

- **:1225**  `no-trigger` — the source spelling is the whole test. A microtone reached any other way — the DSL, a converter — has no `/` to read and falls back to the plain name, which is what the enum can express anyway.
- **:1477** — a mid-tune `[K:]` and `[M:]` carry source ranges and a `[V:… clef=]`, `[Q:]`, `%%MIDI`, `!style=!`, `%%voicecolor` and `P:` do not yet — so those six element types are absent from the projection. `tests/lines.test.ts` measures which characters that costs, rather than the gap being a claim. **A STAND
- **:3323** — a mirror with several pads is matched IN ORDER, on the two walks agreeing; a whole-measure pad has no mirror and is still synthesized. Both are what the corpus has — the ranked table in `scripts/zzrv.ts` says so if that changes.

## `src/audio/flatten.ts` — 2

- **:1594** — appended after ALL main voices, in (voice, layer) order. abcjs appends per STAFF — `staff.voices.push(ov.voice)` — so a two-staff tune where only the second staff has an overlay numbers its tracks differently from this. Nothing in the corpus does it, and the ranked table will say so if anything ever
- **:1888**  `no-trigger` — read voice-major where abcjs reads line-major, so a tune whose LAST line changes meter on voice 0 and not on voice 1 differs. Nothing states one anywhere.

## `src/audio/midi-file.ts` — 1

- **:450** — abcjs's COMPOUND-METER tempo fix is not ported — for `den === 8` with a numerator other than 5 or 7 it recomputes the tempo from `millisecondsPerMeasure()`, which is a method on its laid-out tune and not on an event list. None of the three harvested cases is in 6/8; the table will say so when one is

## `src/chord-grid.ts` — 1

- **:657**  `no-trigger` — a local copy of the audio flattener's `overlayVoices`, reduced to what the grid reads — measures with their barlines, part labels and events. Sharing the real one would mean exporting it out of `src/audio/`, and the grid has no other business there.

## `src/compat/index.ts` — 1

- **:781**  `no-trigger` — abcjs's tune object also carries audio and timing methods (`setUpAudio`, `millisecondsPerMeasure`, `getTotalTime`) and an `engraver` for its drag interaction. None of them is faked — a stub returning plausible numbers would be worse than an absent method, which at least fails loudly. **THE AUDIO HAL

## `src/compat/selectables.ts` — 1

- **:319**  `no-trigger` — a `tempo` and a `part` ARE stream elements and have no source range in our model — two of the six types `tests/lines.test.ts` already names — so they produce nothing here, and because the gate compares row against row, every entry after one is misaligned. That is the whole of what `selection-tempo` 

## `src/compat/wrap.ts` — 1

- **:755** — an OPENING barline takes a number in abcjs and cannot here — the model has `closingBarNumber` and no opening twin. It still COUNTS, so every drawn number is right; only a number ON a `|:` is missing. Give `Measure` an `openingBarNumber` if a fixture ever shows one.

## `src/renderer/layout-model.ts` — 1

- **:682** — `rowExtra` is one number where the build is `((y + size) + index * step) + pad`. They are the same double for every row in either corpus — `index` is 0 and there is no box — and differ in the last bits for a boxed multi-row block. Split it if one turns up.

