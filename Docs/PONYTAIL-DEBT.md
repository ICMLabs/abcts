# `ponytail:` debt ledger — abcts

> ⚠️ **§B's sweep was measured against abcjs 6.7.0, before the 6.7.1 re-harvest of
> 2026-09-21/22.** 6.7.1's one behavioural change is a scaled element's `transform`
> attribute (`draw/relative.js:74-78`) and none of the swept rows touches it — the transpose
> rows are MIDI, the selectables and part order are element lists, the part box was compared
> as a whole group — so the conclusions stand. The rows are dated; re-measure rather than
> assume if one of them matters again.

Harvested by `/ponytail-debt`. One row per deliberate shortcut.
**Re-harvested 2026-09-16: 53 markers**, 21 naming no trigger, 16 carrying a resolution.

Two whole sections closed that day: **§A's ten were RESTATED AS DECISIONS in the code**, and
**§B was swept against abcjs live — five of its six rows were already closed**, three of them
now held by tests. A per-file row with a real trigger went the same way: `midi-file.ts`'s
compound-meter tempo branch said "the table will say so when a 6/8 case turns up", no
harvested case is in 6/8, and running the trigger by hand over **28 meter × tempo
combinations** found every one byte-identical — and abcjs's own tempo byte not moving between
a compound meter and 4/4 either. What is genuinely open is smaller than this file has ever
said, and **the one row that is genuinely the owner's** is
`millisecondsPerMeasure`/`getTotalTime` on the tune object.

⚠️ **THIS FILE'S COUNT HAS BEEN WRONG THREE TIMES, AND EVERY TIME THE INSTRUMENT MOVED
RATHER THAN THE CODE.** 26 came from a classifier that read only FORWARD from each marker, so
a resolution written ABOVE it counted as no-trigger; 94 and 85 came from grepping the bare
word, which counts PROSE — a comment saying "the `ponytail:` above said why" is not a marker,
and neither is a continuation line. 53 is the count of comment-prefixed markers, which is
what the convention actually is.

⚠️ **A row with no trigger names a ceiling and nothing that would make anyone revisit it.**
Those rot: the reasoning survives, the deadline never arrives. Several are deliberate
permanent positions and should be RESTATED as decisions rather than left as debt — see the
triage at the end, which is the part worth reading.

> **RE-HARVESTED 2026-09-16, and the line numbers below are that harvest's.** They shift
> with every edit to these files — the list before this one pointed at lines that had moved
> — so treat a stale number as a reason to re-run the harvest rather than to hunt.
>
> **53 markers**, 21 of them naming no trigger, 16 carrying a resolution
> (MEASURED / RETIRED / DECIDED / not reproduced) written at the marker itself.
>
> ⚠️ **The 94 and 85 this file used to report counted PROSE**: a comment saying "the
> `ponytail:` above said why" is not a marker, and neither is a continuation line. The
> harvest greps for the comment prefix, which is what the convention actually is.


## `src/audio/flatten.ts` — 2

- **:1594** — appended after ALL main voices, in (voice, layer) order. abcjs appends per STAFF — `staff.voices.push(ov.voice)` — so a two-staff tune where only the second staff has an overlay numbers its tracks differently from this. Nothing in the corpus does it, and the ranked table will say so if anything e…
- **:1888**  `no-trigger` — read voice-major where abcjs reads line-major, so a tune whose LAST line changes meter on voice 0 and not on voice 1 differs. Nothing states one anywhere.

## `src/audio/midi-file.ts` — 1

- **:450** — abcjs's COMPOUND-METER tempo fix is not ported — for `den === 8` with a numerator other than 5 or 7 it recomputes the tempo from `millisecondsPerMeasure()`, which is a method on its laid-out tune and not on an event list. None of the three harvested cases is in 6/8; the table will say so when one…

## `src/compat/index.ts` — 1

- **:800**  `no-trigger` — abcjs's tune object also carries audio and timing methods (`setUpAudio`, `millisecondsPerMeasure`, `getTotalTime`) and an `engraver` for its drag interaction. None of them is faked — a stub returning plausible numbers would be worse than an absent method, which at least fails loudly.

## `src/compat/lines.ts` — 3

- **:1221**  `no-trigger` — the source spelling is the whole test. A microtone reached any other way — the DSL, a converter — has no `/` to read and falls back to the plain name, which is what the enum can express anyway.
- **:1473** — a mid-tune `[K:]` and `[M:]` carry source ranges and a `[V:… clef=]`, `[Q:]`, `%%MIDI`, `!style=!`, `%%voicecolor` and `P:` do not yet — so those six element types are absent from the projection. `tests/lines.test.ts` measures which characters that costs, rather than the gap being a claim. **A ST…
- **:3350**  `no-trigger` — a mirror with several pads is matched IN ORDER, on the two walks agreeing; a whole-measure pad has no mirror and is still synthesized. Both are what the corpus has — the ranked table in `scripts/zzrv.ts` says so if that changes.

## `src/compat/wrap.ts` — 3

- **:675** — this cannot see the ORDER of the block and the `K:`. Written `K:D` / `%%text` / music the field lands on the previous music line's voice and DOES publish an element; written `%%text` / `K:D` / music it does not. The model hangs `textBefore` on the measure and keeps no relative position, so the se…
- **:747** — the DECISION is still voice 0's, where abcjs asks it per staff against `currentKey[s]`. Right whenever the staves share a key, which is every fixture in both corpora; give `injects` a staff dimension if one ever differs.
- **:878** — an OPENING barline takes a number in abcjs and cannot here — the model has `closingBarNumber` and no opening twin. It still COUNTS, so every drawn number is right; only a number ON a `|:` is missing. Give `Measure` an `openingBarNumber` if a fixture ever shows one.

## `src/core/model.ts` — 3

- **:335** — the FACE is recorded but not emitted. Output asks for `font-family="serif"` and lets the viewer supply the face, which is the same call the rest of the text layer makes and the reason the width table is an estimate. Weight, style and size are what Gonzato §4.1.4 actually distinguishes — Times-Rom…
- **:1975**  ✅ resolved — scoped to the FIRST SYSTEM rather than to abcjs's tune LINE. The two differ only when the first source line WRAPS, where `wrap_lines.js:50` copies the running key signature onto the continuation. **MEASURED: `abcts-ledger-gaps-4` tune 5 wraps its first line and changes key after it, and is byte-e…
- **:2230**  `no-trigger` — free text BETWEEN two music lines lands here too. No fixture does it, and placing it properly needs free text to be a line in its own right rather than a property of the tune.

## `src/parser/parser.ts` — 8

- **:16**  ✅ resolved — DEFERRED — symbol lines (`s:`) and most `%%` directives. ⚖️ The header part ORDER (`P:ABAB`) was on this list and is NOT a parity item: measured 2026-09-16, abcjs carries it at `metaText.partOrder` and expands nothing, which is exactly what happens here. See `tests/part-order-header.test.ts`. Eac…
- **:368**  ✅ resolved — the `Unsupported key signature` early return is not reproduced, so a `K:Cbmin clef=x` would report a parameter abcjs never reaches. No corpus tune writes an impossible key with a modifier after it; add the guard when one does.
- **:1122** — ONE STAFF PER VOICE. abcjs back-fills a staff by copying EVERY voice on it, so a two-voice staff gains two voices per pass where this gains one each. Nothing in either corpus writes an `&` on a shared staff; the ranked tables will say so if anything does.
- **:2750**  `no-trigger` — the voice's FINAL shift applies to all of its measures. A mid-body `V:` that changes `octave=` partway would need this per-measure; none does. PER MEASURE, because the tune-level `K: octave=` can change mid-tune and a voice with no `octave=` of its own follows it from that point.
- **:3371**  `no-trigger` — this follows SOURCE order, which is engraving order for a tune whose voices are interleaved line by line and for every single-staff tune — not for one written a whole voice at a time, where abcjs engraves line 1 of every voice before line 2 of the first. Upgrade path is a post-parse pass over `sc…
- **:3829**  `no-trigger` — non-strict stops at the first UNESCAPED `%` but does not yet UNESCAPE the `\%` it keeps. Fixing that means rewriting the text after every field and music handler has taken its source offsets, which is a bigger change than the one this corrects.
- **:4080**  ✅ resolved — abcjs appends a `color` ELEMENT to the voice stream, so a second `%%voicecolor` mid-tune repaints from there on and `drawVoice` colours the whole LINE it lands in, retroactively. We hold ONE colour per voice. ✅ **MEASURED 2026-09-09 AND THE PREDICTION HELD** — a second `%%voicecolor` between two …
- **:7064**  ✅ resolved — microtones inside a chord when a fixture needs it. ✅ MEASURED 2026-09-08: `[^/C^/E]` is byte-identical in both engines (`scripts/zzledger.mjs`) — abcjs carries no per-pitch cents either.

## `src/renderer/layout-model.ts` — 1

- **:737** — `rowExtra` is one number where the build is `((y + size) + index * step) + pad`. They are the same double for every row in either corpus — `index` is 0 and there is no box — and differ in the last bits for a boxed multi-row block. Split it if one turns up.

## `src/renderer/layout.ts` — 31

- **:413**  ✅ resolved — the above lane can reach `partStep` once three annotations stack, and the below lane can reach `lyricStep` at two. No fixture combines them, and the real fix is the skyline pass this whole block is waiting on rather than more hand-picked numbers. ✅ **MEASURED 2026-09-08: three above AND two below…
- **:915**  `no-trigger` — the quarter-tone prefixes `_/` and `^/` are in abcjs's `accMap` and not here, because `Accidental` is a whole-semitone enum. Strict draws nothing for a three-quarter tone anyway — see `Docs/ABCJS-DIFFERENCES.md`.
- **:2244** — the x is in LAYOUT units and the emitter scales by `OUT` — 1 for every default host, and the whole effect is one sub-pixel, so a non-default `%%scale` measures at an x off by that factor. Thread `OUT` in if one ever matters.
- **:2350**  ✅ resolved — abcjs's own table maps a `3/32` beat unit to `flags.u16nd` (`tempo-element.js:35`), which is NOT A GLYPH THAT EXISTS — a typo for `u16th`, so abcjs silently draws no flag there. Not reproduced: it would mean dropping a flag we can draw, and `noteGlyph` never produces that shape anyway. It belongs…
- **:3243**  `no-trigger` — quantised to the nearest quarter tone in the OTHER modes, so `^1/3G` rounds to a half-sharp rather than drawing nothing; Bravura has no third-tone glyph. In STRICT it never arises — `^1/3` is three characters and `getCoreNote` abandons the note, which is `abcts-ledger-gaps-4` tune 2, byte-exact w…
- **:6152** — abcjs bounds its restart not at all, and the chase is long — 112 passes on `visual-layout-04-score-s-a`, which walks 670 → 850.54 in ratchets of a pixel and a half because a line that cannot compress justifies to just OVER its target and trips `Math.round(thisWidth) > Math.round(maxWidth)` again.…
- **:6329**  `no-trigger` — one line, where abcjs splits on `\n` first. Our chord symbols carry no newline; a multi-line one would need the loop.
- **:7166**  ✅ resolved — abcjs writes ONE `<text>` for every verse of a note, tspan per line, where ours writes one per verse in its own lane. The trailing blank is added only where there is a single verse; a note with two would need the texts merged, which is a lane change rather than a markup one. **MEASURED: `abcts-le…
- **:7247** — a run that crosses a system break is truncated at the edge, because anchors arrive already filtered to one system. v1 draws a stub and resumes on the next; worth doing when a fixture needs it.
- **:7264**  ✅ resolved — a pair that opens on one system and closes on another is dropped rather than split, because anchors arrive filtered to a single system. Slurs solve this properly by resolving after the whole tune is packed; hairpins can move to that machinery when a fixture needs it. **MEASURED: `abcts-ledger-gap…
- **:8386**  `no-trigger` — a curve whose ends fall in different SYSTEMS is dropped rather than drawn wrong. Engraving splits it in two, one piece running to the end of the first system and another from the start of the next; that needs the halves laid out separately and is a slice of its own. `vree-ties-across-bars` ties a…
- **:8542**  ✅ resolved — abcjs excludes the HEAD, not the note — a chord where one head closes a slur still contributes its others. Nothing in either corpus writes one; widen this to `tieSteps` if something does. ✅ **MEASURED 2026-09-08: `(C [Ec]) d e` is byte-identical in both engines** (`scripts/zzledger.mjs`). The cor…
- **:9223**  `no-trigger` — `startY`/`endY` are the anchor pitches, which is `calcSlurY`'s `else` branch. An ABOVE slur between two up-stem notes reads the middle of the stem instead; that side is inside the notes' own ink in every corpus fixture, so it never binds.
- **:9365**  ✅ resolved — `(highestVert + pitch) / 2`, the half-way-up-the-stem case for an above end on an up-stem note, is not reproduced. Probed, `highestVert` IS the anchor pitch on every binding curve here, so the average is the pitch and the branch is a no-op.
- **:10217**  `no-trigger` — the BEAMED arm still has no pitch. `heightAtMidpoint` interpolates the beam's own two pitches where ours samples the drawn line and undoes half its thickness — a length with no pitch of its own — so that arm keeps the division. No fixture in either corpus reaches the extent through a beamed tuplet.
- **:13152**  `no-trigger` — `realTextWidth` below is unreachable in consequence. Left in place — it is the headless real-metrics path if this is ever declared, and it costs one branch.
- **:13300**  `no-trigger` — first voice up, everything below it down. Three voices on a staff — the corpus has `( 1 2 3 )` — conventionally wants the middle one placed by context, which needs collision detection this engine does not have yet. abcjs does the same thing here, forcing every voice after the first down, so stric…
- **:13317**  ✅ resolved — that suppression is not modelled separately. It only shows when SOME voices on a staff declare and others do not, which no corpus tune does — ragtime declares on all three of its bass voices and none of its treble ones. ✅ MEASURED 2026-09-08: a two-voice staff with `stems=up` on the first and not…
- **:13403**  ✅ resolved — abcjs `return`s at the FIRST lyric-bearing element, so a later one cannot revive the flag; this filters and asks `some`. The two differ only where one LINE holds two lyric elements with different `vocalPosition`, which needs an inline `[I:vocal …]` mid-line — nothing in either corpus writes one. …
- **:13548**  `no-trigger` — re-scanned per measure rather than gathered once — it runs for `$` voices only, and both corpora have five such lines between them.
- **:14368**  `no-trigger` — NO width fallback. A source line wider than the page compresses to fit and keeps compressing, exactly as abcjs does — there is no width at which it wraps. A host wanting reflow needs a mode that re-breaks, and none is asked for; adding one speculatively would put back the packer this replaces.
- **:14958**  ✅ resolved — abcjs's ABSOLUTE guard — `if (spacing * minSpace > 50) spacing = 50/minSpace` — is NOT reproduced, and this closes that long-standing open item rather than deferring it again. `minSpace` is `min` over every pass of the pushing voice's spacing units, and the FIRST pass always contributes zero: eve…
- **:15197** — abcjs moves `maxChild.children[0].x`, the bar's FIRST relative child, where this moves the whole element. The two agree on a plain `|`, whose element is that one rule. They part on a `|]` (two rules, one of which would stay behind) and on a bar carrying a number — abcjs would deform it and we tra…
- **:16402**  `no-trigger` — "the line that carries it" is read as SYSTEM 0, which is where a `%%voicecolor` at the head of a voice lands. A directive written mid-tune belongs to whichever output line holds its offset; no fixture in either corpus writes one.
- **:17633**  `no-trigger` — no `%%titleformat`, `%%writefields` or `%%aligncomposer`. v1 has all three as NATIVE extensions; nothing in the corpus sets any, and each changes only where within the block a field lands, not the block's shape.
- **:18620** — one spend for the block, where abcjs builds one `Subtitle` per line. A mid-tune `T:` block is one line — the header's subtitles take `advanceText` — so the two agree; spend per line if a block ever carries two.
- **:20239** — abcjs rounds all four to whole pixels; we do not, so an edge COULD land half a pixel off its. Rounding here would put a px-space conversion into geometry that is otherwise in staff spaces throughout. ⚠️ **AND IT HAS NOT BEEN SEEN — probed 2026-09-16** on the fixture that draws one (`visual-select…
- **:20727**  `no-trigger` — abcjs's order above the staff is lyric, chord, ENDING, dynamic, part, tempo, and ours spends the ending lane last of all — so on a staff that ALSO carries a part label or a tempo mark the bracket lands above them where abcjs puts it below. The staff's total is right either way, because the lane g…
- **:20789**  ✅ resolved — `closeTop`/`closeBottom` are read over GLYPHS and LINES here, where abcjs reads every child except a `chord` (above) or a `lyric` (below) — so an ANNOTATION on the other voice's note would pull abcjs's `closeTop` up to the annotation lane and ours would not. Nothing in either corpus writes one on…
- **:21581** — live only. Headless never reaches zero — it does not reproduce `getTextSize`'s whitespace early-out at all, since `goldenTextHeight` answers from the table whatever the string — so the 691 goldens are untouched and the rule is unproven on that path. Reproduce the early-out there too if a golden e…
- **:21695**  ✅ resolved — abcjs's `diff` also carries `element.bottom - staff.bottom` — the element's own overhang below the staff's lowest point — and takes the LAST such element rather than the deepest. **MEASURED: `abcts-ledger-gaps-4` tune 4 is `c c C,, c|` with lyrics, whose lowest note is not its last, and it is byt…


## ⭐ TRIAGE — by OBSERVABILITY, not by file order

**Three of the first four controls written for these were MUTE**, and all three for the same
reason: the path each marker described is not observable from the public render API for the
shape it named. That is very likely **why they have no trigger — there is nothing to trigger
on.** See `Docs/CODEBASE-EVALUATION-2026-09-12.md`.

So work them in this order, and **write the deliberate break FIRST**:

### A. NOT OBSERVABLE — ✅ RESTATED AS DECISIONS 2026-09-16

These describe internal structure. No public output can distinguish the shortcut from the
alternative, so there is nothing to measure and nothing to revisit. Calling them debt implied
a repayment that cannot be demonstrated — **so each now reads as a DECISION at its own site,
and the `ponytail:` marker is gone with it.** 95 markers → 85.

⚠️ **This is the only kind of marker it is right to retire by editing the comment.** A row in
section B names a shape a fixture could exhibit; these name a structure nothing can observe.
If a later session finds an output that DOES distinguish one of them, the decision is wrong
and reopening it is a code change, not a marker.

- **The render-scoped module `let`s — SIX markers, one decision.** `STRICT_TEXT_METRICS`,
  `SPACING`, `PRINT`, `ABCJS_GAPS`, `LINE_WEIGHTS`, `SCORE_FONTS`. Each now points at
  `RenderState`, which already carried the measurement and the ruling: threading them is
  **217 references across ~100 functions** in the most byte-sensitive file in the repo, it
  buys no safety (module state is per-realm, so workers each get their own copy), and the
  save/restore wrapper defends every field individually with a test that fails if ONE line is
  dropped. `HANDOFF-2026-09-08.md` §6.
  ⭐ **And the wrapper gained two fields on 2026-09-16** — `PAGE_WIDTH_PX` and `MUSIC_WIDTH`,
  added by the page-width primitive. Neither leak is reachable (both are assigned before
  anything reads them), but "every field" is the rule this guard states, so they are in it.
- **`chord-grid.ts` — a local copy of `overlayVoices`** rather than an export out of
  `src/audio/`. The two are gated separately and no output can tell a copy from an import.
- **`parser.ts` — the lexer BUFFERS a line's tokens** where the Swift one streams. It makes
  note assembly's lookahead plain indexing instead of a peek/rewind protocol.
- **`parser.ts` — a standalone octave mark WARNS and does not claim ownership.** The
  character-ownership gate is closed at 255,684 and nothing there stands on this path.
- **`layout.ts` — a loop REMOVED rather than guarded**, since nothing else read it: there is
  no state in which a guarded one would behave differently.

### B. OBSERVABLE — swept 2026-09-16, and FIVE OF SIX WERE ALREADY CLOSED

⭐⭐ **EVERY ROW HERE WAS A PREDICTION NOBODY HAD RE-MEASURED, AND THE PREDICTIONS WERE
MOSTLY WRONG.** Each was probed live against abcjs 6.7.0 in WebKit, each probe verified
against its own break first. That is the finding: **a debt row ages into a claim about the
code that the code has quietly stopped agreeing with**, and the cost of checking is minutes
where the cost of believing is a session.

- ✅ `layout.ts` hairpin reserve — **DONE 2026-09-12, and the marker was STALE.** A hairpin
  DOES reserve below. Control in `tests/above-lane-order.test.ts`; it discriminates 139.052
  from 166.177, which is why it was the first non-mute one.
- ✅ `parser.ts` — a voice DECLARED after a header `K: transpose=` — **RETIRED 2026-09-16.**
  The marker predicted we would take the voice's own default; both engines transpose and
  agree byte for byte on `getMidiFile`. ⚠️ Its "✅ MEASURED byte-identical" was `zzledger`'s
  SVG, and `transpose` is read by the SYNTH and never by the renderer — **that measurement
  could not have failed.** `tests/voice-transpose-inherits.test.ts`.
- ✅ `compat/selectables.ts` — a `tempo` and a `part` — **RETIRED 2026-09-16.** The lists
  are identical entry for entry, source ranges included. The four cases harvested into
  `corpus-selection/golden.json` write neither field, which is why 389 gated entries could
  not say so. `tests/selectable-tempo-part.test.ts`.
- ✅ `core/model.ts` — a HEADER `P:ABAB` — **NOT A PARITY GAP, measured 2026-09-16.** abcjs
  carries the order at `metaText.partOrder` and expands no music for it; so do we, byte for
  byte in both the SVG and the MIDI. Expanding it would be a NATIVE feature and a divergence
  FROM abcjs. `tests/part-order-header.test.ts`.
- ✅ `layout.ts` — `%%titleformat` / `%%writefields` / `%%aligncomposer` — already resolved
  in the code on 2026-09-12: **abcjs implements none of the three.** Native extensions, not
  parity work.
- ⚠️ `layout.ts` `partBox` — abcjs rounds four edges to whole pixels and we do not.
  **Probed 2026-09-16 and NOT REPRODUCED**: the fixture that draws one
  (`visual-selection-01`) is byte-identical at six staff widths, fractional ones included.
  A latent difference. Bring a width that shows it before paying for a px conversion in
  space-domain geometry.
- ⚖️ `compat/index.ts` — `millisecondsPerMeasure` / `getTotalTime` absent from the tune
  object. **The marker says "flag it before doing it" and it is right**: hanging them on
  `TuneObject` makes them part of the drop-in contract, which is an API decision and the
  owner's. `setUpAudio`'s answer already exists (`src/audio/flatten.ts`); only the wiring is
  missing.
- `layout.ts` quarter-tone accidentals in the NON-STRICT modes. Signal: the drawn glyph.
  ⚠️ Strict draws nothing either way, so abcjs cannot be the oracle and the control must set
  the mode — this one is about our own extended mode, not parity.
- `layout.ts` slur and beamed-tuplet endpoint pitches. Each already carries a probe saying
  the branch is a no-op on every binding curve in both corpora.
- ⚠️ `parser.ts`, `layout.ts`, `flatten.ts` — **ATTEMPTED AND MUTE.** Each carries its
  failed probe at the site. Do not re-run those probes; find a different signal.


---

## Added by the wrap arc, 2026-09-14 — three, and each names a shape absent from BOTH corpora

These are narrower ports rather than cut corners: in each case abcjs asks a broader question
than we do, and no fixture in either corpus distinguishes the two. Each says what would.

- **`src/compat/wrap.ts`, the deline injection's DECISION** — abcjs asks it PER STAFF against
  `currentKey[s]` (`data/deline-tune.js:19-33`); ours asks voice 0 and applies the answer to
  every voice. Right whenever the staves share a key, which is every fixture in both corpora.
  ⭐ **Trigger: a tune whose two staves carry DIFFERENT keys across a wrapped line.** Give
  `injects` a staff dimension.
- **`src/compat/wrap.ts`, the "published nothing" test** — a standalone `K:` written after a
  `%%text`/subtitle row publishes no key element, because `appendStartingElement` bails on a
  row with no staff. The model hangs `textBefore` on the MEASURE and keeps no relative
  position, so `K:D` / `%%text` / music is read as `%%text` / `K:D` / music — and in the
  first order the field DOES reach the previous line's voice.
  ⭐ **Trigger: a fixture writing the field BEFORE the block.** Give `Measure` a source
  offset for the block.
- **`src/renderer/layout.ts`, `%%voicecolor` under a wrap** — abcjs loses it on every output
  line but the one holding the `color` ELEMENT; "the line that carries it" is read here as
  SYSTEM 0, which is where a directive at a voice head lands.
  ⭐ **Trigger: a `%%voicecolor` written MID-TUNE.** Read the element's own offset instead.

⚠️ **AND ONE MARKER WAS RETIRED RATHER THAN WORKED.** `layout.ts`'s "an OPENING barline takes
a number in abcjs and cannot here" predicted `visual-options-01-fonts` would need the field;
that fixture closed without it, because the bar numbers under a wrap are RENUMBERED from 1
and the opening bar never carries one. The prediction was right about the mechanism and
wrong about whether anything reaches it.
