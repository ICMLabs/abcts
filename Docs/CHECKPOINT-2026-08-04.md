# abcts — Checkpoint, 2026-08-04

Supersedes `CHECKPOINT-2026-08-03d.md`, which stays as the **findings ledger for 16–40** —
every rule this session ported, with its abcjs citation and its measured number. Read that
one when you need the WHY of a specific behaviour; read this one for the state, the method
and what is left.

**One statement in `-08-03d` is corrected below** (the mid-tune-clef entry's suppression
rule was written before the meter and tempo arrived and is now part of a three-way pattern),
and **finding 32 corrected two claims that had stood for two days in `-08-02d`, `-08-03`,
`-08-03b` and `CLAUDE.md`** — see THE EXPENSIVE LESSON.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached.**

Read this, then `HANDOFF-2026-08-04.md`, then `-08-03d` for the findings ledger, then
`ARCHITECTURE.md`, then `CLAUDE.md`.

---

## STATE

| corpus | standing |
|---|---|
| 41-fixture | **20 of 29 at ZERO on all four axes.** One gate failure: `ragtime-nightingale`'s `oy` at **0.656** against 0.59, from 1.58 — NOT raised. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **114 / 130 / 144 / 169**, from 95 / 106 / 115 / 137 one session earlier. **60 of 174 off some axis**, from 79. |
| suite | **685 of 686.** The one red is ragtime's `oy`. Anything else failing is yours. |

The 41-fixture stragglers, all nine:

| fixture | dy | dx | oy | ox | what |
|---|---|---|---|---|---|
| `little swallow` | 0.32 | 24.19 | 0.16 | −6.29 | dx is the goldens' `\|\| 8` fallback — REACHABLE, see below |
| `frere-jacques` | 0.00 | 22.64 | 0.00 | −3.53 | horizontal, and its `M:` arrives after prose (see below) |
| `ragtime-nightingale` | 1.12 | 18.30 | −0.66 | −0.93 | was 58.13 / 53.56; the one red |
| `vree-grace-notes` | 0.02 | 1.99 | 0.03 | −1.14 | was 11.64 / 32.50; the 1.99 is the grace glyph |
| `zocharti-loch` | 0.00 | 1.25 | 0.00 | −0.34 | horizontal |
| `happy-birthday` | 0.00 | 0.23 | 0.00 | −0.49 | was 3.85 |
| `multi-voice-lyrics-two-voices`, `two-voice-invention`, `vree-sharps` | ≤0.07 | 0 | ≤0.06 | 0 | sub-tenth |

---

## START HERE, EVERY SESSION

```bash
npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt
```

**Every fix on this branch came off that table.** Read the SHAPE, not the total: `dy 0.0`
beside a large `dx` is horizontal; a large `|oy|` with `dy` near zero is one rigid term; a
fixture with ONE paired notehead has no spread, so its `dy`/`dx` of 0.00 are arithmetic.

**AND READ THE STAFF TOPLINES, not only the notehead average.** Twice this session that is
what turned a 20px number into a named mechanism: four toplines out by 38.75 / 11.64 /
27.34 / 31.17 says SPACING, not a shift, and the gap it names is a lane. The notehead
average cannot tell those apart. `tests/controlled-pair.test.ts` prints both.

---

## THE THREE PROBES

### 1. THE CONTROLLED PAIR — `tests/controlled-pair.test.ts`, committed

Reads `/tmp/abcts-probe/*.abc` beside abcjs's SVG for each and prints the four axes AND both
engines' staff-line y. A no-op when the directory is absent.

```bash
mkdir -p /tmp/abcts-probe && printf 'X:1\nK:C\ncd|\n' > /tmp/abcts-probe/a.abc
cd ../abcMusicKit/Tools/abcjs-debug
for f in /tmp/abcts-probe/*.abc; do node dump-svg.js --file "$f" --output "${f%.abc}.svg" >/dev/null; done
cd - && npx vitest run tests/controlled-pair.test.ts && cat /tmp/abcts-probe.txt
```

**A LADDER BEATS A HYPOTHESIS.** `mouse-click-01` was 99.6px out and every feature in it
measured clean ON ITS OWN; nine tunes, each one field longer than the last, split it into
four unrelated causes. And when a fixture resists, delete its directives ONE AT A TIME —
that is what proved `visual-selection-01`'s residual is in the MUSIC and not in any of its
eight.

### 2. THE ITEM PROBE — the horizontal workhorse, on both sides

`ABCTS_PROBE=1` prints `v / i / kind / dur / w / left / gap / er / x` per item **on the
SOLVED pass only**. Add the matching line to abcjs, right after `child.setX(x)` in
`write/layout/voice-elements.js`:

```js
if (process.env.ABCJS_PROBE) console.log('PROBE item v=' + voice.voicenumber + ' i=' + voice.i +
  ' type=' + child.type + ' dur=' + child.duration + ' w=' + child.w.toFixed(3) +
  ' extraw=' + child.extraw.toFixed(3) + ' minsp=' + child.minspacing +
  ' er=' + er.toFixed(3) + ' x=' + x.toFixed(3));
```

**OUR `rod` CARRIES THE GAP WHERE ABCJS'S `w` DOES NOT** — 34.051 against its 24.051 plus
`minspacing` 10. Compare the SUM. **And read the DURATIONS first**: two of the session's
finds were a duration with a correct width beside it.

### 3. THE STAFF PROBE — `ABCTS_PROBE=1` prints `PROBE staff` and `BLOCK`

`PROBE staff` gives each staff's `top`/`bottom` in abcjs PITCH with the source line that
last raised each; `BLOCK` gives `musicTop`, the block height and the offset. Put them beside
abcjs's `staff.top`/`.bottom` at the end of `setUpperAndLowerElements`.

**Restore the sibling afterwards, every time:**

```bash
git -C ../abcMusicKit checkout -- Docs/References/abcjs/ && git -C ../abcMusicKit status --short
```

That command EXITS 0 with output, so `&& echo CLEAN` lies — READ it.

---

## THE EXPENSIVE LESSON, AND IT COST TWO DAYS

**"The gate cannot see this" and "the golden is wrong" are different claims, and the second
needs the golden OPENED.**

Four numbers were recorded as unchaseable GOLDEN artefacts. **Two of them were ours**, and
both were the same one-line difference: abcjs emits a note's MAIN notehead BEFORE the graces
that precede it, and we emitted them in playing order. The gate pairs the i-th notehead of
each engine, so that read as a position error:

| | recorded as | actually |
|---|---|---|
| `ragtime-nightingale` dy 58.13 | "two mis-paired heads, do not chase as geometry" | **1.12** |
| `vree-grace-notes` dy 11.64 / dx 32.50 | "a property of the GOLDEN" | **0.02 / 1.99** |

The note recording them even predicted the residual — "sorted by x, dx a uniform 1.99, which
is the grace glyph" — and named the wrong owner. Five more harvested fixtures came off the
table with it.

**AND THE OTHER TWO ARE NOT "LIMITATIONS" EITHER — THEY ARE THE TARGET.** This document
called them unchaseable for a day; that was a judgement, not a fact, and it was the WRONG
judgement. **The goldens are what abcjs produces, and byte parity with them is the goal**, so
whatever the generator's text metrics do is what we have to do.

**THE DECIDING EVIDENCE IS `abcMusicKit` v1**, which ships in production and is byte-identical
to these goldens. It reproduces the fallback ON PURPOSE, with the comment naming the source
(`Sources/abcMusicKitRenderer/abcRenderer.swift:108-109`):

```swift
// Fallback 8px for missing chars matches dump-svg.js getBBox patch (|| 8)
lineWidth += table[ch] ?? 8
```

So the shipping reference engine already made the opposite call to the one recorded here.

### WHAT THE GENERATOR ACTUALLY MEASURES — `dump-svg.js:62-84`, and it is MECHANICAL

`calcWidth` picks ONE of five per-character tables by SIZE, sums `widths[ch] || 8`, and takes
the widest line:

| size (px) | table it asks for | table it GETS |
|---|---|---|
| ≥ 27 | `titlefont` | **`repeatfont`** — the key does not exist, so it falls back to TNR **17px** |
| ≥ 21 | `subtitlefont` | **`repeatfont`**, same |
| ≥ 20 | `partsfont` | `partsfont` (TNR Bold 20, 95 chars) |
| ≥ 19 | `measurefont` | `measurefont` — **31 characters only**; every letter past `C` falls to 8 |
| ≥ 17 | `vocalfont` if bold, else `repeatfont` | as asked |
| ≥ 16 | `gchordfont` | `gchordfont` (Helvetica 16, 101 chars) |
| else | `repeatfont` | `repeatfont` |

`dump-elements-char-widths.js` carries only those FIVE keys, all ASCII (95–101 characters
each, `measurefont` 31), all WebKit-calibrated — the file's own comment says "WebKit
calibrated 2026-04-03". Everything outside them — CJK, `è é â ç ê`, and every letter in
`measurefont` past `C` — is **8**.

So a 27px title is measured with 17px widths, and `little swallow`'s 73 Chinese characters
are 8px each. **Both are reproducible exactly**: five tables, one size ladder, one `|| 8`.

### WHAT IT COSTS, WHICH IS THE PART THAT NEEDS A DECISION

Reproducing it makes our SVG match the goldens and makes our REAL output diverge from a
browser's: CJK lyrics would be SPACED at 8px while DRAWN at ~17. **v1 ships exactly that**,
and the mode split is where the two answers live — `abcjs-strict` reproduces abcjs, `abc2.1`
and `extended` are the corrected ones. `textWidth` does not take `strict` today and 16 call
sites would have to thread it, or the fallback becomes mode-gated at one place.

### WHAT IS STILL GENUINELY OPEN

`%%jazzchords`' `oy`: `getBBox` counts a chord's NESTED tspans as separate LINES,
`h + (n-1) * fontSize * 1.2` (`dump-svg.js:120-124`), so `"x/C"` measures three lines high —
38.4px exactly. Same status as the widths: reproducible, and a decision rather than a
limitation.

**Text HEIGHT for the seven default sizes is already faithful** (`goldenTextHeight`).

---

## WHAT THE SESSION ESTABLISHED, IN ONE PLACE

The full ledger with citations is `-08-03d` findings 16–40. These are the ones that will
bite again:

**MEASURE-LEVEL DELTAS ARE A PATTERN, NOT THREE FEATURES.** A mid-tune clef, meter and
tempo all arrive as a `Measure` delta, accumulate forward, and print where they stand. They
differ ONLY in what the system prefix reprints — the CLEF is reprinted at every system head,
so its inline draw is suppressed on a measure that opens one; the METER and TEMPO are not.
Anything else that can appear mid-tune follows that shape. *(This corrects the standalone
suppression note in `-08-03d` finding 28.)*

**EACH ABOVE-STAFF LANE IS SPENT ONCE.** `setUpperAndLowerElements` walks `staff.top` up
through lyric, chord, ending, dynamic, part and tempo IN THAT ORDER, and every element it
places is measured from the running total. `anchorAboveStaff` reproduces that stack, so what
it places already sits above the lanes. The DYNAMIC lane was being re-derived and subtracted
a second time; the ENDING lane is deliberately NOT gated the same way, because
`anchorAboveStaff`'s ink call leaves it out. **The two lanes are in different phases and one
gate cannot serve both** — gating both cost a tempo-and-volta staff 23.25px.

**`hasVocals` IS PER SYSTEM AND MONOTONIC.** `containsLyrics` only ever sets it TRUE and
`reset()` clears it once per TUNE. A tune whose lyrics arrive on system 2 engraves system 1
with dynamics BELOW.

**THE FIRST TOKEN OF A `K:` IS THE KEY ONLY WHEN IT PARSES AS ONE** — `HP`, `Hp`, `none`, or
an UPPERCASE A..G, because `getKeyPitch`'s lowercase cases are commented out. Hence `K:none`
keeps its treble clef, `K:C none` loses it, `K:cm` prints nothing, `K: bass` is the bass
clef. **And the MODE may be its own token**, matched on the first three characters.

**A ROD IS A ROD WHATEVER THE TYPE.** `getMinWidth` is `child.w` for a rest as much as a
note. A zero-duration note spaces as a quarter. A bar that starts an ending gets
`minspacing += textWidth + 10`, measured in `repeatfont` and not in the size the number is
drawn at.

---

## WHAT IS LEFT

```
499.38  dy= 40.8 dx=499.4 oy=  5.5 ox=113.3  visual-tablature-17-stretchlast   calcWidth
 38.37  dy=  0.0 dx=  0.1 oy=-38.4 ox= -0.1  visual-misc-03-jazzchords         getBBox tspans
 31.50  dy= 23.1 dx= 17.0 oy=-31.5 ox= -4.6  visual-options-01-fonts
 23.00  dy= 15.5 dx=  0.0 oy= 23.0 ox= -0.0  visual-layout-09-endings  [%%voicecolor]
 20.47  dy= 19.5 dx=  6.3 oy= 20.5 ox=  2.7  visual-selection-01 / visual-svg-per-line-01
 18.49  dy=  0.0 dx= 15.1 oy=-18.5 ox= -2.6  visual-transpose-04-transpose-annotations
 16.89  dy=  0.0 dx= 16.9 oy= -3.5 ox=  4.6  visual-misc-06  [%%setfont]
 16.71  dy=  0.0 dx= 16.7 oy= -2.7 ox=  0.2  visual-transpose-output-04
 15.64  dy= 11.3 dx=  0.0 oy= 15.6 ox= -0.0  synth-flattener-27-triplets-and-chord-rhythm
 14.31  dy=  4.8 dx=  9.2 oy= 14.3 ox= -4.4  mouse-click-01 / visual-tablature-15
```

The two worst are the generator's text metrics, and **both are reachable by porting
`calcWidth`** — see THE EXPENSIVE LESSON. That is now the largest single item on the table
by pixels, ahead of the systemic 0.03px by fixture count.

### THE SYSTEMIC 0.03px, and it is now the largest single item by fixture count

Every fixture carries a rigid `oy` of about 0.03px, and a sharp key signature adds another
0.04 — measured on `K:C` / `K:A` control pairs with nothing else in them. It is a hundredth
of a staff space, invisible in every gate but the ranked table's 0.05 threshold, **and it is
why roughly a dozen fixtures at the foot of that table read 0.06–0.07 and are otherwise
exact.** Closing it would move `0.05` by more than any remaining feature.

Not chased, and not diagnosed beyond that measurement.

---

## VERIFY LOOP

```bash
cd Code/abcts
git rev-parse --abbrev-ref HEAD       # geometry/vertical
npx tsc --noEmit
npx vitest run                        # 685/686; the ONLY expected failure is ragtime's oy
npx biome check src tests/corpus-abcjs.test.ts tests/pixel-parity.test.ts
npm run baseline                      # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short  # MUST be empty — read it, do not test the exit code
```

`npm run lint` has pre-existing findings in the harvested goldens' inline CSS; check your
own files with `npx biome check <paths>` instead.
