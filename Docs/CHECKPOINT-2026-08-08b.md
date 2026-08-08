# abcts — Checkpoint, 2026-08-08b

Supersedes `CHECKPOINT-2026-08-08.md` for the STATE and for WHAT IS NEXT. That file keeps
the ARC DECISION and the audio sizing verbatim, and both are still exactly right.
`-08-07b.md` keeps findings 134–146 and the method; `-08-06.md` keeps **THE HARNESS**;
`-08-07.md` keeps 125–133; earlier ledgers as listed there.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE.**

---

## 🔎 THE HEADLINE: THE GEOMETRIC TAIL IS CLOSED. AUDIO IS ALL THAT IS LEFT.

The three-item work order of `-08-08.md` had two geometry items and audio. **Both geometry
items are done, and they produced four findings rather than two** — every one of them
invisible to all three existing gates, and every one found by BUILDING A LADDER OF
CONTROLS and reading abcjs's source.

| axis | standing |
|---|---|
| suite | **925 of 925. NO REDS.** |
| pixel ranked table | **0 of 119** |
| harvested ranked table | **0 of 174** |
| staff-line gate | **0 of 41** — the last target closed (147) |
| above-lane gate | **NEW** — 12 controls, every mark on abcjs's rung |
| ycorr gate | **NEW** — 20 controls, every glyph on abcjs's pixel |
| parser, lyrics, beams, render structure | **100%**, 0 recorded divergences |
| gates | **5** |

---

## THE FOUR FINDINGS, and the one sentence each that transfers

### 147 — a rest shorter than a 16th drew NOTHING and reserved NOTHING

`restGlyph`'s `byLog` table stopped at 4 where abcjs's `chartable.rest` runs to SEVEN —
`{5: "rests.32nd", 6: "rests.64th", 7: "rests.128th"}`
(`creation/abstract-engraver.js:36`). The three names sat in `UNMAPPED_ABCJS` as "abcjs
glyphs no SMuFL name claims", which is untrue.

**It was reached through a SECOND-ORDER effect.** A rest is not a notehead, so no ranked
row could ever hold it. What caught it was the staff-line gate's last open target —
`S3-note-syntax-tune13`, 0.26px, filed as "the justification TARGET at the right edge,
unexamined". It was neither: at the solved spacing abcjs's 11.373px 32nd-rest rod beats
its spring and pins `staffGroup.w` at 685.533, where our missing rod let the line solve to
exactly the 685 target. Both traces now agree pass for pass (883.740 / 692.995 / 685.533).

### 148 — the above lanes are ONE walk, in abcjs's order, spent once

abcjs runs lyric, chord, ending, dynamic/volume, part, tempo off a single running
`staff.top` and draws each mark at the rung the walk had reached
(`layout/set-upper-and-lower-elements.js:31-49`). We spent them in FOUR places.

**AND THE STAFF'S TOTAL WAS RIGHT EITHER WAY** — `verticalExtent` sums the same terms
whatever order it adds them in. **A LANE ORDER IS INVISIBLE TO A SUM.** Five of eleven
controls disagreed, by up to 27.13px, with every extent already exact:

```
volta + tempo     tempo    abcjs -51.63   ours -28.37   the tempo INSIDE the ending lane
volta + part      part           -52.53        -29.29   likewise
volta + dynamic   ending         -19.81        -46.94   the ending on the dynamic's lane
part  + dynamic   dynamic        -39.25        -74.50   the dynamic on the part's
chord + dynamic   chord          -29.64        -56.77   the chord on the dynamic's
```

Two things had to move with the walk. The ink it stands on now excludes an above
DYNAMIC's glyph — `verticalExtent` flags one and spends a flat lane, so leaving it in made
the ink 27.13px higher than the music. And `aboveStackPlaced` now means "a PART or TEMPO
was placed" rather than "the stack ran": those two are OUTSIDE both lanes so their boxes
carry them; a chord is INSIDE both and still owes them.

**AND IT MOVED TWO CORPUS FIXTURES.** `S4-bars-repeats` and `S8-layout` drew their FIRST
system's volta 23.25px too low — 12.26px *below* the top staff line, inside the music —
because the ending lane was gated on `hasBlock` and a first system carries the title
block. abcjs -10.99, ours 12.26 before and -10.99 after.

Three `ponytail:` notes retired: the ending bracket's (93), the tempo mark's, the above
dynamic's (146).

### 149 → 150 — `getYCorr`, and the two fermatas that named it

`printSymbol` never draws at `calcY(offset)`. It draws at
`calcY(offset + glyphs.getYCorr(symbol))` (`draw/print-symbol.js:22`, `:33`) — a 30-row
per-glyph alignment fix-up for abcjs's own font (`creation/glyphs.js:174-219`).

**IT NEVER ENTERS A RESERVE**, so a staff's extent is bit-identical with it and without
it. That is why five gates could not see it.

**THE SIGN IS WHAT NAMED IT.** `!fermata!` measured one pitch too HIGH and
`!invertedfermata!` one pitch too LOW on the same control — opposite directions, equal
magnitude, which no outline difference and no lane error can produce. Twenty rows,
measured one control per glyph, all exact after the port:

```
scripts.ufermata -1   scripts.trill   -2   flags.u32nd +1   digits 0-9 and '+'  -2
scripts.dfermata +1   scripts.upbow   -2   flags.d32nd -1
scripts.roll     -1   scripts.downbow -2   flags.u64th +3
scripts.wedge    -1   f m p s z       -4   flags.d64th -2
```

Spent in the WRITER (`svg.ts`), where abcjs spends it and the only place that cannot
disturb a reserve. **THE REST ROWS ARE DELIBERATELY ABSENT**: `restGlyph` returns abcjs's
DRAWN pitch rather than its anchor, and the dots hang off the same step — measured exact,
so adding the rows would move both by a pitch. The test says this out loud.

**AND FOUR DECORATIONS WERE DRAWING BRAVURA IN STRICT.** `scripts.wedge`, `.shortphrase`,
`.mediumphrase`, `.longphrase` sat in `UNMAPPED_ABCJS` under "abcjs glyphs no SMuFL name
above claims" — read for months as a fact about SMuFL when it was a fact about our own
map. `!longphrase!` was 11.66px out.

---

## ⚖️ THE ARC DECISION IS UNCHANGED (Lance, 2026-08-08)

**GONZATO IS DEFERRED. AUDIO IS THE ARC.** `-08-08.md` sizes it and nothing here changes
that sizing. In one paragraph:

61 of the 174 harvested fixtures ARE abcjs's own synth tests (46 flattener, 12 timing, 3
midi, paired in `SOURCES.json`), and `flattener.test.js` is **8,203 lines of expected
event lists written as JSON literals** — an exact oracle of the same kind as the
`.parse.json` and `.elements.json` goldens. The implementation is genuinely absent: no
`src/midi/`, no `src/synth/`, `%%MIDI` in the parser ZERO times. The parity surface is
EVENT GENERATION — `abc_midi_flattener.js`, `abc_midi_sequencer.js`, `chord-track.js`;
soundfonts and WebAudio are host playback and OUT of scope, the same split the renderer
makes between geometry and glyph outlines.

**THE FIRST COMMIT OF THAT ARC IS THE HARVESTER, NOT THE FLATTENER.**

---

## THE METHOD, and it earned four findings today

1. Both ranked tables first. They are empty — that is the state, not a bug.
2. **ASK WHAT NONE OF THE GATES CAN REPRESENT.** All four findings today were in that
   space, and two of them needed a NEW GATE built before the defect could be stated.
3. Read the named function in abcjs.
4. **A LADDER OF CONTROLS, ONE VARIABLE PER RUNG** — one tune per PAIR of lanes for 148,
   one tune per GLYPH for 150. Nothing in either corpus combines the lanes, and a tune
   with two decorations on it hides the second inside the first's stacking cursor.
5. Instrument a SCRATCHPAD COPY of abcjs to answer ONE question.
6. Measure before and after over ALL 119 targets, not against the ceiling.

**AND THE SIGN OF AN ERROR IS EVIDENCE.** 149 was found because our dynamic sat 15.13px
above abcjs's on the ABOVE side and 15.14px above it on the BELOW side — the same
direction on both, which no outline difference can produce. 150 was found because two
fermatas were off by one pitch in OPPOSITE directions, which nothing but a per-glyph table
can produce. Before hunting a cause, ask what the error's SIGN and MAGNITUDE rule out.

---

## RE-VERIFIED AT THIS COMMIT

```
HEAD                e0def2b   working tree clean
npx tsc --noEmit    clean
npx vitest run      925 / 925
pixel ranked        0 of 119
harvested ranked    0 of 174
staff-line gate     0 of 41
above-lane gate     12 controls
ycorr gate          20 controls
npx biome check src NOT clean — same 12 rows as before this session, all pre-existing
```

---

## VERIFY LOOP

```bash
cd /Users/lrettberg/ICMLabs/Code/abcts
git rev-parse --abbrev-ref HEAD       # main
npx tsc --noEmit
npx vitest run                        # 925/925
npx biome check src                   # NOT clean — pre-existing; diff against a stash
npm run baseline                      # READ the diff, and MEASURE anything that moved
git status --short                    # DELETE tests/zz-probe.test.ts before committing
```

**`../abcMusicKit` IS DIRTY AND IT IS NOT US.** Never commit or revert there.

**`cd` DOES NOT PERSIST, and a `cd` inside a compound command leaves the shell there.**
**vitest SWALLOWS console.log on a passing test** — `--disableConsoleIntercept`.
