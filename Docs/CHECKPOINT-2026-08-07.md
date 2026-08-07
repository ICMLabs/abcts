# abcts — Checkpoint, 2026-08-07

Supersedes `CHECKPOINT-2026-08-06b.md` for the STATE. That file keeps findings 106–124 and
**THE GATES CANNOT SEE WHAT IS LEFT** — which this session answered by widening a gate
rather than by working around it. `-08-06.md` keeps **THE HARNESS** and findings 104–105,
`-08-05c.md` 90–103 and the `ENGRAVE` triage table, `-08-05b.md` 71–89, `-08-04c.md` 51–70
and the ladder method, `-08-04b.md` 41–50, `-08-03d.md` the ledger 16–40.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔎 THE HEADLINE: THE GATE WAS READING 29 OF THE 41 FIXTURES

`CHECKPOINT-2026-08-06b.md` opened with *"no gate can name the next defect any more"* — the
harvested table empty, 36 of the 41 at exact zero, every finding from 113 on made by reading
abcjs with no instrument to point the way.

**That was true of the gate as written, and the gate was reading a third of the goldens.**

`tests/pixel-parity.test.ts` enumerated `<name>.svg`. Only a SINGLE-TUNE fixture has one. A
multi-tune fixture's goldens are `<name>-tune0.svg`, `-tune1.svg`, … — so the twelve
multi-tune fixtures (`S1`–`S8`, `clefs`, `curves`, `missing-decorations`, `score-transpose`)
were **not measured at all**, though abcjs's own per-tune SVGs had been in the same
directory since April.

29 fixtures measured. 119 tunes available.

`key-change.test.ts` had already written down half of this — it opens by explaining that the
structural gate is "FIRST TUNE ONLY … so the gate cannot see this feature at all" and then
hand-rolls its own comparison, because every mid-tune key change in the corpus lives in a
later tune. The pixel gate had the identical hole and no note saying so.

**A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS COMPARISON.** Every axis of
this one was sound. It simply never looked at two thirds of the evidence, and that is not
something any number it printed could reveal — the fixtures it skipped had no rows to be
missing from.

All 89 new tunes matched abcjs on notehead COUNT on the first run: 2,696 heads became 5,105
and not one was missing or extra. **Twelve differed on POSITION**, and that list is what
drove the rest of the session.

---

| | at the session's start | now |
|---|---|---|
| suite | 703 | **890. NO REDS.** |
| pixel gate | 29 fixtures, 2,696 heads | **119 tunes, 5,105 heads** |
| pixel ranked table | *did not exist* | **19 of 119 off some axis, eight of them the whole-note OUTLINE and not work** |
| harvested (174) | 0 of 174 off | **0 of 174 off** |
| 41-fixture | one above 0.02 | one above 0.02 |
| ceilings | — | **fifteen LOWERED.** TWO were raised mid-session (129, 131) and each was CLOSED by the finding after it (130, 132) |

`npx vitest run tests/pixel-parity.test.ts && cat /tmp/abcts-pixel-ranked.txt` is the new
first command of a session, beside the harvested one.

---

## FINDING 125 — A KEY CHANGE AT THE HEAD OF A LINE BELONGS TO THAT LINE'S PREFIX

`startNewLine` fires **lazily**. `parseMusicLine` consumes the inline fields at the head of
a source line and only calls it once it is "past the inline statements"
(`abc_parse_music.js:152-156`), so a `[K:]` written before the line's first note or bar is
already in `multilineVars.key` when `params.key` is stamped. A leading BARLINE fires it too,
which is why the opening barline is part of the test.

**AND THE ELEMENT IS NOT LOST, WHICH `-08-06b` HAD BACKWARDS.** Its "WHERE TO START" said
abcjs puts the cancellation "in the prefix and nothing after". It does both:
`appendStartingElement` runs while `tune.lineNum` is still the PREVIOUS line, finds a note in
that line's voice and PUSHES the signature onto its end (`tune-builder.js:270-280`).

Measured on three controls rather than reasoned, which is how the error surfaced:

```
[K:C] opening a music line   line 0 … bar 653.80, keySignature 664.80 w=20.20 [nB ne nA]
                             line 1   clef 15, keySignature 49.05 w=20.20 [nB ne nA]
                             line 2   nothing
standalone K:C between lines  identical to the above
[K:C] MID-line                line 1 keeps its Eb prefix, draws the change where it stands,
                              and the NEXT line's prefix carries the naturals
```

The mid-line case was already right. The trailing draw is the exact analogue of
`trailingClef`, which is the same mechanism reached through `K:… clef=`.

This is exact only because **a system IS a source line here** — there is no re-wrapping
pass, so `startsSystem` and abcjs's `startNewLine` are the same event.

## FINDING 126 — A DISPLACED NOTEHEAD PUSHES THE WHOLE ACCIDENTAL STACK A NOTEHEAD LEFT

The displacement pass runs BEFORE the accidental loop and **assigns** into the very same
running total:

```js
if (delta <= 1 && !prev.printer_shift) {
  curr.printer_shift = delta ? "different" : "same"
  if (dir === "down") roomTaken = glyphs.getSymbolWidth(noteSymbol) + 2
  else                dotshiftx = glyphs.getSymbolWidth(noteSymbol) + 2
}
```

(`abstract-engraver.js:649-664`.) 9.81 + 2 = **11.81**, and it has to be there because the
displaced head occupies exactly the strip the first accidental column wants. The UP arm
spends the same figure on `dotshiftx` — that head goes RIGHT of the stem, so it widens the
element rather than its left reach.

Ours started every chord at zero, so a chord holding a second came out one column narrow and
the deficit **accumulated**. `S8-layout` X:811 "Chords with many accidentals" was a perfect
staircase — dx exactly −11.81 per such chord out to −82.67, with `dy` flat at 0.00 the whole
way. abcjs's own probe names it: `[^c^d]` at `extraw = -36.44` against `[^c^e]`'s −24.63.

**AND A UNISON IS DISPLACED TOO, BY ONE PIXEL LESS.** The test is `delta <= 1`, not `=== 1`,
and `create-note-head.js:30-32` spends the distinction:

```js
var adjust = (pitchelem.printer_shift === "same") ? 1 : 0
shiftheadx = (dir === "down") ? -getSymbolWidth(c) * scale + adjust
                              :  getSymbolWidth(c) * scale - adjust
```

**AND THE MAP COULD NOT EXPRESS IT.** `offsets` was keyed by STEP, and `[cc]` is two heads at
one step — the second `set` overwrote the first, so both landed on the same x whatever the
rule said. Indexed by POSITION now. **Third time on this branch that a representation, not a
rule, was the defect** — after `PixelItem` carrying only a centre and `beamLinks` comparing
physical neighbours.

## FINDING 127 — THERE IS NO "SAME SIGNATURE, PRINT NOTHING" RULE IN ABCJS

The guard in `layoutKeyChange` was our own engraving judgement wearing a citation: *"`K:G`
and `K:Em` are the same signature in different modes, and a reader sees no accidental change
between them, so neither should the page."* Sound engraving. abcjs's SVG denies it.

Probed on `K:G\nGABc|[K:Em]GABc|`, abcjs lays out TWO key signatures — the prefix at 49.05
and the change at 248.01, both `w = 8.25`. Its parser appends the element on
`result.foundKey && hasBeginMusic()` alone (`abc_parse_header.js:430-434`) and never compares
keys. The only suppression is `createKeySignature` returning null on an EMPTY accidental list
(`create-key-signature.js:9`), which the `cancelled`/`incoming` test already is.

**WHAT THE GUARD WAS COMPENSATING FOR is a modelling difference**, and it is handled where it
belongs. A per-voice `K:G clef=treble` on each of two voices made the second a "change" from
G to G — but in abcjs that `K:` reaches `appendStartingElement` with the VOICE'S OWN child
list empty, falls past both arms of the scan and assigns `staff[staffNum].key` rather than
pushing an element (`tune-builder.js:270-292`). It is the voice's KEY, not a change, and
`keyChangeLeadsLine` (finding 125) is that same test. Measured on the control: abcjs draws
one signature, and so do we.

## FINDING 128 — `!slide!` IS A CURVE AT THE NOTE, NOT A GLYPH ABOVE THE STAFF

```js
var yPos2 = abselem.heads[0].pitch - 2
var blank1 = new RelativeElement("", -roomtaken - 15, 0, yPos2 - 1)
var blank2 = new RelativeElement("", -roomtaken -  5, 0, yPos2 + 1)
voice.addOther(new TieElem({ anchor1: blank1, anchor2: blank2, fixedY: true }))
```

(`decoration.js:51-59`.) Two ZERO-WIDTH blanks below and left of the head with a tie between
them. It reserves NOTHING above, and it reaches the page through `addOther` — the one route
the structural gate is blind to, **which is exactly why it was read as an above-stacked glyph
in the first place.** The comment in `DECORATIONS` said so out loud: "made `slide` and
`breath` look unsupported on the first pass". `breath` really is a glyph. `slide` never was.

Endpoints taken from abcjs's own path for `!slide!C` — `M 61.85 158.49 C … 69.85 150.74 …`
against a notehead centred at (75.78, 146.85). 8px wide, 2 pitch tall, ending 1 pitch below
the head, and `fixedY` means the anchors' own pitches with none of a tie's 1.2 lift.

**A LADDER OF THREE CONTROLS PUT IT ON `!slide!` ALONE IN ONE RUN** — plain, `!slide!`,
`!glissando(!` measured 0.00 / 9.67 / 0.00 against abcjs. The tune has both decorations and
the glissando was the likelier suspect.

## FINDING 129 — AN EXPLICIT `!style=normal!` MUST OVERRIDE THE VOICE'S `style=rhythm`

`resolveStyle` returned `'normal'` for BOTH "no inline style" and an explicit
`!style=normal!`, so the caller's `inline === 'normal' ? voice().noteStyle : inline` handed
the voice's `rhythm` straight back. `U:n=!style=normal!` then `nG` — which is how a
rhythm-notation voice writes a note that keeps its real head — drew a slash.

**FOURTH TIME ON THIS BRANCH THAT A REPRESENTATION, NOT A RULE, WAS THE DEFECT**, after
`PixelItem` carrying only a centre, `beamLinks` comparing physical neighbours, and the
seconds map keyed by step (126). All four were expressible only by widening the type.

abcjs honours it per PITCH: *"There is a style for the whole group of pitches, but there
could also be an override for a particular pitch"*, `c = chartable[elem.pitches[p].style]
[-durlog]` (`abstract-engraver.js:677-680`).

**AND EVERY STYLE HAS A `nostem` ENTRY, which is a THIRD glyph and not a repeat of the
quarter.** `if (zeroDuration) noteSymbol = chartable[style].nostem` (`:642-646`), and for
`rhythm` that is `noteheads.slash.nostem` — its own glyph at `w 12.81, h 15.63` against
`.slash.quarter`'s 9.00 x 13.00. `B0` in a rhythm voice drew the quarter slash. The other
three styles repeat their single glyph, so only `rhythm` needs the field.

**AND ITS `ox` RAISE IS THE THIRD ON THIS BRANCH, RECORDED RATHER THAN MASKED.** dy 0.52 →
0.03, oy 0.03 → 0.00 and dx 24.72 → 24.27, against ox 1.79 → 1.94. The rule was verified
glyph-for-glyph on a control before it touched the fixture — ten heads, same names, same
boxes, dy 0.00, where four had been a whole glyph wrong. What grew is a MEAN over a system
whose remaining error is a RAMP this change does not touch. Closing the ramp takes both down.

## FINDING 130 — AN INLINE `[M:]` AT THE HEAD OF A LINE DRAWS AT THE END OF THE PREVIOUS ONE

Finding 125's mechanism, reached through the OTHER arm of the header parser:

```js
case "[M:":
  var meter = this.setMeter(…)
  if (tuneBuilder.hasBeginMusic() && meter)
    tuneBuilder.appendStartingElement('meter', startChar, endChar, meter)
  else multilineVars.meter = meter
```

(`abc_parse_header.js:356-362`.) Music has begun, so it appends — and `startNewLine` has not
fired yet, so the element lands on the PREVIOUS line.

**AND THE TWO `M:` FORMS PART ON THE OTHER HALF**, which is what makes this a MODEL change
and not a renderer one. The inline arm never fills `multilineVars.meter`, so the next line's
prefix prints NOTHING; a standalone `M:` line fills it and the next `startNewLine` consumes
it into that line's PREFIX — finding 121, already right. Measured on a pair of controls,
`M:3/4` and `[M:3/4]` at the same point in the same tune:

```
standalone   line 0 ends with its notes;  line 1 opens `clef 15, timeSig 49.05 w=11.79`
inline       line 0 ends `timeSig 673.20 w=11.79`;  line 1 opens with the CLEF ALONE
```

**THE FIRST ATTEMPT FIRED ON BOTH FORMS AND THE RATCHET CAUGHT IT** — `frere-jacques` went
straight back to the 21.80px finding 121 had closed, and `S8-layout-tune2` from exact to
23.04. Nothing downstream could tell the forms apart, so `Measure` now carries
`meterChangeInline`; the parser has always known, having two entry points for it.

**AND A RESTATED INLINE METER STILL DRAWS**, for the same reason a restated key does (127):
nothing on that path compares meters. `[M:C]` under `M:C` is exactly what `S5-directives`
X:502 writes, and abcjs puts `timeSig w=13.04` at x 671.96 for it.

dx 24.27 → 1.19 and ox 1.94 → −0.03. Its element x's now match abcjs's final solve pass
EXACTLY across the whole system, trailing time signature included.

**AND THIS IS WHY FINDING 129'S RAISE WAS RECORDED RATHER THAN ARGUED AWAY.** That `ox` 1.79
→ 1.94 was a mean over exactly this ramp; closing the ramp took it to −0.03. A recorded raise
that names what it is waiting on is a lead. A reverted correct change is nothing.

**AND READING AN INTERMEDIATE SOLVE PASS COST AN HOUR.** The `voice-elements.js` probe fires
on EVERY `setX`, and abcjs's solve runs the line several times — the second block is not the
answer, the LAST one is. Two intermediate passes read as real numbers and disagreed with the
golden by amounts that looked like findings. **Anchor the probe on a figure you can also read
out of the SVG** — here, the first notehead's x — before trusting any of it.

---

## FINDING 131 — THE PREFIX CANCELS THE KEY IN FORCE, NOT THE PREVIOUS LINE'S KEY

abcjs's naturals are `impliedNaturals`, and `parseKey` computes them from the old key AT THE
MOMENT OF THE CHANGE (`abc_parse_key_voice.js:295-311`). Reading the previous LINE's key
instead is the same number whenever every change starts a line — **which is every fixture
finding 124 was measured on** — and a different one the moment a MID-line `[K:]` sits between
the two.

`S8-layout` X:812 is that tune: `K:G`, a mid-line `[K:Bb]`, then a standalone `K:Gb`. Gb
carries both of Bb's flats, so nothing is cancelled and abcjs draws no natural; against G,
still the previous line's key, we cancelled its F#.

**AND A NATURAL IS THE TALL ACCIDENTAL**, which is why one wrong glyph was worth 8.37px on
every notehead of the system. It DECLARES a box up to pitch 15.88 against the clef's 13.72,
so it raised the chord lane, then the ending lane sitting on top of that, and the staff with
them. dy 8.37 → 0.01, oy 4.73 → 0.00.

**PROVING THE LANES WERE RIGHT IS WHAT MADE IT FINDABLE.** The shape said "staff extent", and
the staff had both a chord lane and a volta ending — the one combination with a special rule
(`endingOverChordLane`, a flat 2). Instrumenting abcjs's own `staff.top` on three controls
settled it in one run:

```
                        abcjs      = ink + lanes
  chords + ending       21.5037    = 13.7244 + (4.7794 + 1) + 2
  ending only           19.7244    = 13.7244 + (5 + 1)
  chords only           19.5037    = 13.7244 + (4.7794 + 1)
```

and ours matched all three at 0.00. So the 2.1595 pitch had to be INK, and our own extent
probe named it: a `keySignature accidentalNatural` reserving to 15.8839 on a system abcjs
tops out at the clef. **Rule out the mechanism you suspect before hunting inside it.**

---

## FINDING 132 — A STANDALONE `M:` ON A CONTINUED LINE DRAWS WHERE IT STANDS

The THIRD case for `M:`, and it is not a variant of either other one. **The discriminator is
which of abcjs's two parsers ever sees the field**, which is why reading
`letter_to_body_header` alone could never have settled it:

```
fresh line     the HEADER parser takes it and only fills `multilineVars.meter` for the
               next `startNewLine`. `letter_to_body_header`'s "M:" arm is NEVER REACHED —
               instrumented, and silent on that control.
after a `\`    the line goes to `parseMusicLine`, which DOES reach that arm and runs
               `appendStartingElement('meter', …)` on a voice that already holds notes.
```

So the three routes are:

| written as | drawn |
|---|---|
| standalone `M:` on its own line | the NEXT line's prefix |
| inline `[M:]` at the head of one | the PREVIOUS line's end |
| standalone `M:` after a `\` | INLINE, where it stands |

`S8-layout` X:812 writes `"Em"ABc def |\` then `M: 9/8`, and abcjs draws `timeSignature
x=207.51 w=10.93` straight after that bar at 196.51. Ours parked it for the next line, where
the tune's own `M: 6/8` overwrote it — **the 9/8 was lost outright**, and the parsed model
showed no `meterChange` on that measure at all. dx 20.12 → 0.00, ox −3.16 → 0.00, and the
tune is EXACT on all four.

`this.lineContinued` already holds the PREVIOUS line's flag inside `applyField`, because a
field line returns from `parseLine` before the music path reassigns it. No new state.

**AND THE SECOND RECORDED RAISE CLOSED ITSELF, ONE COMMIT LATER, EXACTLY AS THE FIRST DID.**
Both were `ox` — a MEAN over a spread that had not been fixed yet — and both entries named
what they were waiting on. Two for two is the argument for recording a raise with its reason
rather than reverting a change that measures correct on every other axis. **The test is
whether every notehead moved the right way or not at all; if one moved the wrong way, it is a
regression and the rule stands.**

---

## FINDING 133 — AN ENDING'S EXTRA `minspacing` IS CHARGED TO ONE VOICE, NOT EVERY BARLINE

abcjs adds `minspacing += textWidth + 10` in `createBarLine`, which runs where the ENDING
element is created — and a volta belongs to the **first voice of the first staff**, not to
every voice whose bar falls under the `|1`. Its own probe says so: of the FIVE barlines at
one x on `ragtime-nightingale`'s system 17, ONE carries `minsp=28.50` and the other four the
plain 10.00.

**AND CHARGING EVERY VOICE IS NOT A WASH**, which is the part that made this cost 12.13px
rather than nothing. The left-ink rule is a SHORTFALL, not an addition:

```js
var extraWidth = getExtraWidth(child, pad)
if (er < extraWidth) x += extraWidth - er
```

(`layout/voice-elements.js:66-72`, and we already had it, correctly.) abcjs's other voices
keep 18.50 of slack after their bar, and the chord that follows hangs 12.13 of accidental ink
to its left — which FITS inside the slack, so nothing moves. Ours had spent that slack on the
ending, leaving `room = 0`, so the same accidental pushed the shared cursor 12.13 right.

dx 12.13 → **1.58**, dy 0.04 → 0.01, oy 0.01 → 0.00. The oldest number on the table, and the
last one above 8.25, on a 2009-notehead fixture.

**AND THE SHAPE LIED TWICE.** The per-notehead diff showed a drift to −5.35 then a jump to
+6.78, so the handoff recorded "ONE element between golden x 384.5 and 442.9 is 12.13 too
wide". It was not an element's width at all — both engines put the barline at the SAME offset
from the note before it (15.81). It was the SLACK AFTER that barline, in a voice on the OTHER
STAFF, spent on an ending that voice does not own.

What turned it round was finding the same number on both sides: `extraw=-12.13` in abcjs's
probe and `left=12.13` in ours, identical. That ruled the accidental itself out and moved the
question from "what is too wide" to "what was supposed to absorb it". **When both engines
agree on a quantity that is still 12px apart on the page, stop measuring the quantity and
start measuring what consumes it.**

---

## AND ONE ROW OF THE TABLE IS NOT WORK AT ALL

The eight `ox = 0.18` rows — `clefs-tune0` through `-tune6` and `S6-keys-tune0` — are tunes
whose entire content is `G8`, and the figure is the WHOLE NOTEHEAD's OUTLINE: abcjs's inks
16.83px wide against Bravura's 15.03, and the two are not left-aligned. Positions are
compared as bounding-box CENTRES, so no placement rule can remove it, and this file's header
puts outlines out of scope in its second paragraph.

Asserted at 0.18 rather than written down in prose, so a real regression on those tunes still
fails while an intended difference stops reading as a defect. **A ranked table needs a way to
say "measured, and not a defect", or its tail fills with work nobody should do.**

---

## WHAT MOVED, MEASURED BEFORE AND AFTER OVER ALL 119 TARGETS

Nothing regressed by any amount at any point. Every ceiling that moved went DOWN.

| target | was | now |
|---|---|---|
| `S8-layout-tune10` | dx 82.67 ox −31.37 | **0.00 / 0.00 — exact on all four** |
| `S6-keys-tune3` | dx 24.93 ox 2.08 | **0.01 / 0.00** |
| `S1-decorations-tune4` | oy 9.67 | **0.00 — exact on all four** |
| `S6-keys-tune2` | dx 31.55 ox 20.20 | **0.00 / 0.00** |
| `S6-keys-tune1` | ox 38.75 | **0.00** |
| `clefs-tune7` | ox 38.75 | **0.00** |
| `S8-layout-tune11` | dx 50.31 ox 23.48 | dx 23.66 ox −0.64 |
| `S8-layout-tune5` | dx 11.81 ox −1.56 | dx 6.20 ox 1.07 |
| `ragtime-nightingale` | dy 0.25 oy 0.05 ox 0.12 | **dy 0.04 oy 0.01 ox 0.02** |
| `S8-layout-tune7` | oy 1.67 | oy 1.14 |

---

## WHAT IS LEFT — the ranked table, measured at the session's last commit

```
19 of 119 tunes are off some axis by 0.05px or more
      1.19  dy=0.03 dx=1.19  oy=0.00 ox=-0.03   188 heads  S5-directives-tune1
    23.66  dy=8.37 dx=23.66 oy=4.73 ox=-0.64   46 heads  S8-layout-tune11
     8.25  dy=0.00 dx=8.25 oy=0.00 ox=3.58     99 heads  S8-layout-tune6
     6.24  dy=0.00 dx=6.24 oy=0.00 ox=0.11     64 heads  S3-note-syntax-tune24
     6.20  dy=0.01 dx=6.20 oy=0.00 ox=1.07     60 heads  S8-layout-tune5
     4.68  dy=4.68 dx=0.00 oy=-2.98 ox=0.00    11 heads  S2-fields-tune1
     3.88  dy=0.00 dx=3.88 oy=0.00 ox=0.17     22 heads  S5-directives-tune4
     2.66  dy=2.66 dx=0.00 oy=1.14 ox=0.00     58 heads  S8-layout-tune7
     1.80  dy=0.00 dx=1.17 oy=0.00 ox=1.80      2 heads  S4-bars-repeats-tune2
     0.18  dy=0.00 dx=0.18 oy=0.00 ox=0.02     16 heads  S3-note-syntax-tune12
     0.18  ox=0.18 on eight ONE-NOTEHEAD `G8` tunes — the OUTLINE, NOT WORK. See above.
```

### 1. `S5-directives-tune1`, dx 24.27 — its `dy` is CLOSED (129); the SYSTEM-0 RAMP remains

X:502 "Alternate Note Heads": `style=rhythm`, `U:n=!style=normal!`, `[K:style=x]`,
`!style=harmonic!`, `B0` zero-duration notes. Systems 1–4 are inside 0.5px; the whole spread
is system 0, where dx ramps 0 → 23.06 with plateaus at bar boundaries.

**ITS `dy` 0.52 WAS A SEPARATE, CLEANER THING AND IS NOW 0.03** — finding 129, which was
exactly the "do this half first" the earlier draft of this section recommended. What is left
is the ramp: UNEQUAL steps (1.35 per note across the first four, then plateaus, then 0.6,
then 1.9 across the `B0`s), which is a SPRING difference and not a missing fixed element at
one place. Zero-duration spacing is ruled out — `layoutMeasure` has taken
`ratToNumber(duration) || 0.25` since finding 105, and the `ponytail:` note at `noteGlyph`
saying otherwise is stale.

### 2. `S8-layout-tune11`, dy 8.37 / dx 23.66 / oy 4.73 — X:812

"Changing Time or Key Signatures, Guitar Chords". A big `dy` with a big `oy` is a staff
extent, and the two moved together when `S8-layout-tune10`'s accidental room landed, so they
are not independent of what is already fixed. Re-measure the SHAPE before hypothesising.

### 3. ~~`ragtime-nightingale`~~ — 12.13 → 1.58, finding 133. Effectively closed. `-08-06b` §"…AND THE CANCELLATION LINE IS PINNED" is now
DONE (finding 125) and did not touch it, so **that section's remaining note is the live
one**: the largest single band jumps 10.33 between two adjacent heads at golden x 323.1 and
442.9 on the y≈4600 system — ONE element's width, not a spread.

### 4. `S8-layout-tune6` dx 8.25 ox 3.58, `S3-note-syntax-tune24` dx 6.24, `S5-directives-tune4` dx 3.88

Unexamined. 8.25 is one sharp's width exactly.

### 5. `S2-fields-tune1` dy 4.68 / oy −2.98, `S8-layout-tune7` dy 2.66 / oy 1.14

Both vertical-only with dx at 0.00 — an extent, the shape finding 128 had.

### 6. THE SEVEN 0.18px `ox` ROWS

One-notehead tunes, six of them `clefs`. A constant 0.18 on a single head is a rod or a gap,
not a spread — and being the same figure on seven tunes it is ONE cause. Cheap, and it takes
seven rows off the table.

### 7. THE REMAINING FIXED LANES, then Gonzato, then audio.

`chordSymbolStep`, `dynamicAboveStep`, `dynamicBelowStep`, `annotationAboveStep`,
`annotationBelowStep`, `partStep`, `tempoStep`, `lyricStep`. One decision, not eight.
`anchorVoltas` (finding 93) is the model.

---

## THE METHOD, unchanged, and the one thing added to it

1. `npx vitest run tests/pixel-parity.test.ts && cat /tmp/abcts-pixel-ranked.txt`
2. `npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt`
3. Per-notehead diff of the top entry — **read the SHAPE**. A uniform `oy` is a staff origin
   (128). A clean ramp inside one system is missing FIXED width, and justification spread it
   (127). A staircase stepping at one construct is a per-construct deficit accumulating (126).
4. Instrument abcjs in the scratchpad copy to answer ONE question.
5. Read the named function.
6. Port the structure, then the constants.
7. **Prove it on a CONTROL TUNE before touching a fixture**, and prefer a LADDER of controls
   — three of them put finding 128 on `!slide!` in a single run.

**AND THE ONE THING ADDED: BEFORE CONCLUDING A GATE IS EXHAUSTED, CHECK WHAT IT
ENUMERATES.** The previous checkpoint's central claim was that no gate could name the next
defect. Four of this session's findings came off a gate — the same gate — once it read the
goldens that were already on disk. Ask what evidence exists before asking what the evidence
says.

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 886/886
npx biome check src                   # NOT clean — 1 error, 4 warnings, all PRE-EXISTING
npm run baseline                      # READ the diff, and MEASURE anything that moved
git status --short                    # `git add -A` swept a probe into a commit on 08-06
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Never commit or revert there.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there** — it
happened again this session and cost a confusing "No test files found". Put the absolute
`cd /Users/lrettberg/ICMLabs/Code/abcts &&` in front of every command. **vitest SWALLOWS
console.log on a passing test** — `--disableConsoleIntercept`. **DELETE YOUR PROBE BEFORE
COMMITTING.**

The scratchpad harness needs `dump-elements-char-widths.js` copied beside `dump-svg.js` or it
throws MODULE_NOT_FOUND — `-08-06.md`'s recipe lists it; do not skip that line.
