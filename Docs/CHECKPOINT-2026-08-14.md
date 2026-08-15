# CHECKPOINT — 2026-08-14

**abcts, `main`.** `npx tsc --noEmit` is clean and everything below is committed and pushed.
The suite is **1415/1416 and the ONE red is NOT OURS** — `content-parity`'s `S7-voices` is an
uncommitted fixture edit in the sibling `../abcMusicKit` repo whose goldens were never
regenerated. Do not bisect it; `ls -la` on the two inputs says it at once.

---

## 1. THE STATE

| Gate | Now | Session start |
|---|---|---|
| **SVG bytes, in-repo corpus** | **0 of 178** | 3 of 171 |
| **SVG bytes, 41-fixture corpus** | **22 of 113** | *did not exist* |
| Audio events / timings / chord grids / MIDI | 0 of 72 / 0 of 38 / 0 of 23 / 0 of 3 | same |
| Element timings | **0 of 13** | 1 of 13 |
| Harvested geometry / pixel targets | 0 of 174 / 0 of 120 | same |
| DOM contract | **0 of 25** | 1 of 25 |

`DIVERGENT` is EMPTY on both byte gates.

**EVERY TABLE THAT EXISTED AT THE START OF THE SESSION IS NOW AT ZERO.** The one open gate
is the one that did not exist — `tests/svg-bytes-sibling.test.ts`, which reads the 41-fixture
corpus's own 381 abcjs SVGs, opened at 38 of 113 and is at 22.

---

## 2. THE LANDINGS

Every one is a read of a named abcjs function, and every one was settled by PRINTING THE
SAME QUANTITY FROM BOTH ENGINES.

### 2.1 A BOXED MUSIC TEXT, A MID-TUNE BLOCK, AND EVERY `%%…font` FACE

`visual-options-01-fonts` went 12539 → 33896 of 33896 on one rule read seven places over:
`renderText` draws EVERY text abcjs writes, so each takes its `%%<type>font`'s FACE, weight,
style and BOX, and each derives its baseline from a RUNG by adding its OWN size.

- **A CHORD LANE'S MARKS SHARE THE RUNG, NOT THE BASELINE.** `chordAt` started from `chordY`
  — the TALLEST mark's baseline — so a 15pt annotation sat 13px below abcjs's beside a 25pt
  chord symbol. The lane offset is spent BEFORE `+= hash.font.size` (`draw/text.js:13-15`,
  `:29-30`), so both terms are the mark's own. Same defect `%%tempofont` had one lane over.
- **THE FACE WAS HARD-CODED AT SIX EMITTERS** — annotation, bar number, ending number,
  triplet number, mid-tune free-text/subtitle, bottom block. A `%%<type>font` REPLACES the
  whole object, so the triplet also takes its weight and style (`%%tripletfont cursive 39
  box` draws UPRIGHT at 52px where the default is italic at 15).
- **THE RECT'S TOP IS RECOVERED, NOT CARRIED.** `rect.y = Math.round(y)` off the same
  `params.y` the baseline is built from, so `boxRect` drops its `y` and the emitter reads
  `baseline - size - padding`. Carrying it cost a mid-tune block 150px — the text got the
  staff origin and the rect did not.
- **EACH BLOCK IS ITS OWN `tune.lines` ENTRY AND ITS OWN `<g>`** (`draw/draw.js:53-58`), and
  each row carries its own `klass`: `text subtitle` for a Subtitle, `defined-text` for a
  FreeText.
- **A MULTI-LINE BOX IS THE WIDEST NON-EMPTY TSPAN AND `h + (n-1) * size * 1.2`** — the
  generator's patched `getBBox` (`dump-svg.js:106-128`); an EMPTY line counts for neither.

### 2.2 A STANDALONE BODY `K:` RESTAMPS ONE STAFF'S KEY, AGAINST THE `K:`-CLEF

`visual-layout-07` closed — 13364 → 19706 of 19706. **Two previous attempts inferred the
rule from the outcome and were reverted; this one is a probe.** `-08-12` §3.3b concluded a
`V:… clef=` never reaches the drawn signature. abcjs's own parse tree denies it:

    CST line 0 staff 0 voice 0 clef treble key ["B@6","e@9"]
    CST line 0 staff 1 voice 0 clef bass   key ["B@4","e@7"]      <- BASS at parse time
    ASE-SET staff 1 type key ["B@6","e@9"]                        <- the body K: overwrites
    ENGKEY clef bass key ["B@6","e@9"]                            <- what the engraver reads

`appendStartingElement('key', …, fixKey(multilineVars.clef, multilineVars.key))` falls
through to `staff[tune.staffNum][type] = hashParams2` when the current voice holds no note or
bar yet (`parse/tune-builder.js:294`). `startNewLine` positions each staff's key against THAT
VOICE's clef (`abc_parse_music.js:961`, `:984`), so without a body `K:` the bass staff is
bass; the body `K:` overwrites exactly one of them.

**A SEVEN-RUNG LADDER PINS EVERY EDGE**, one variable each, `ENGKEY` printed for all:

| control | drawn |
|---|---|
| no body `K:` | each staff keeps its OWN clef's positions |
| body `K:` after the `V:` block | the CURRENT (last-declared) voice's staff → treble |
| `V:2 clef=bass`, same | same |
| `V:1 bass` / `V:2 treble` + body `K:` | staff 0 keeps BASS; only staff 1 restamped |
| `K:GMin clef=bass` + body `K:` | BOTH bass — `multilineVars.clef` is what moved |
| two music lines | line 0 treble, line 1 BASS again |

Per-STAFF, per-LINE, keyed on the last `V:` read — `lastVoiceId`, not `currentVoiceId`.

### 2.3 A METER IS AN ELEMENT IN THE STREAM, AND A SPACER SPENDS ITS `minspacing`

`visual-svg-02-staffwidth-12` is `[M:2/4]y[M:3/4]y[M:4/4]` and drew ONE time signature.
abcjs's voice, instrumented, is FIVE elements:

    XX i 0 timeSig x 15      minx 36.795 w 11.795 minspacing 10
    XX i 1 rest    x 36.795  minx 37.795 w 0      minspacing 1
    XX i 2 timeSig x 37.795  minx 59.59  w 11.795 minspacing 10
    XX i 3 rest    x 59.59   minx 60.59  w 0      minspacing 1
    XX i 4 timeSig x 60.59   minx 72.385 w 11.795 minspacing 10

`Measure.meterChanges` carries every `[M:]` with the number of events already emitted;
`meterChange` stays the meter IN FORCE, and both are built from the one list in `takeChanges`.

**AND THE FIXTURE HANDED OVER A SECOND DEFECT NO GATE COULD SEE.** `getMinWidth` is 0 for an
invisible rest and a spacer — they draw nothing — but `voice.minx += child.minspacing` runs
on EVERY element whatever it drew (`layout/voice-elements.js:74-80`). `x` and `y` carry no
ink, so no positional gate pairs them.

### 2.4 AN ENDING WITH NO `end` EMITS NOTHING — one rule ported in HALF

`synth/repeats.js:29-33` pushes a synthetic `startRepeat` after ANY last section that is not
already one; ours had been narrowed to `endRepeat` alone, because firing it on a final
`startEnding` made that ending come out twice. That was a symptom of the other half: the
synthetic section skips an ending whose `start` equals its own index, so the last ending keeps
`end === undefined` and `duplicateSpan`'s `for (i = start; i <= end; i++)` runs ZERO times.
Ours filled the missing end with `lastIndex`.

    |:CDE|1,3FGA:|2,4cde|]      CDE FGA · CDE · CDE FGA · CDE cde   (7 bars, 21s)
    CDE|:FG[Ab]|1 Bcd:|2 efg|]  CDE · FG[Ab] Bcd · FG[Ab] · efg     (`efg` once)

A third detail goes with them: `Math.max(lastUsed, undefined)` is NaN and `NaN < x` is FALSE,
so an unresolved ending suppresses the gap span entirely — a `?? -1` there invents one.

### 2.5 RICH TEXT IS `richTextLine`'s ELEMENT — a whole missing feature

`renderText` RETURNS EARLY on `params.phrases` (`draw/text.js:7-10`), so none of the rest of
it runs: no font size added to the baseline, no `roundNumber`, no box, no `data-name`.
`richTextLine` writes one `<text>` at the CURSOR with `dominant-baseline="middle"` and one
`<tspan>` per phrase with its own five font attributes (`svg.js:242-269`).

- **A PHRASE'S OWN SIZE GOES IN RAW.** `getTextSize.calc` applies the `pt → px` 4/3 only when
  handed a font by NAME; handed a font OBJECT — a `%%setfont` — it copies `type.size` through.
- **THE `class` IS THE LITERAL `"undefined"`** without `add_classes`, because `richText` sets
  `row.klass` only when asked for one and `richTextLine` writes the attribute regardless.
- **THE COMPOSER/ORIGIN JOIN IS RICH WHEN EITHER SIDE IS** (`top-text.js:47-60`).
- **`simplifyMetaText` JOINS ONLY AN ARRAY OF STRINGS**; one `$N` in `N:`/`H:` and
  `addMultiLine`'s array branch runs instead, abcjs's own "TODO-PER: Hack!" move included.
- **A RICH ROW RESERVES ITS ROW, NOT ITS INK** (`PlacedText.rowSpan`) — the 0.8-ascent
  estimate reached a font size ABOVE the block's top and dragged the music down 14.04px.

Two more came with it. The `aria-label` CONCATENATES `metaText.title` and a rich title is an
ARRAY, so abcjs's own label reads `Sheet Music for "[object Object],[object Object],[object
Object]"`. And the BOTTOM BLOCK now builds from the PAGE'S CURSOR, as the top block already
did: a rich row's y goes into the markup RAW, so `local + base` and `base + a + b + …` are
visibly different doubles — 610.5615 against abcjs's 610.5614999999999.

### 2.6 A DECLARED EDGE OF ZERO IS NOT DECLARED AT ALL

`if (opt.top)` / `if (opt.bottom)`, and `0` is FALSY (`relative-element.js:40-43`). The
element keeps its own `pitch`. A MEZZOSOPRANO CLEF is exactly that case — `clefPos 4` with
`clefOffsets('clefs.C') = -4` makes `bottom` 0, so abcjs reserves down to 4 and we reserved
down to 0: `clefs-tune5` came out 7.75px (2 pitch) tall. **The rule was already ported for a
STEM and written up as belonging to that one site.** It belongs to every declared box.

### 2.7 A CURVE HANGS ON THE CHORD'S LOWEST HEAD, and its other heads are INTERNAL NOTES

- `addSlursAndTies` walks `el.pitches`, which the ENGRAVER has SORTED so the heads can stack,
  and a slur is hung on `pitches[0]` — so `[GCD]` anchors on C where the source says G.
- Its `else if (!isGrace)` arm pushes every head carrying no `endSlur` into every OPEN slur
  (`abstract-engraver.js:934-940`), so the heads read after `pitches[0]` land INSIDE it. That
  decides `isTie`: `([GCD][GCD])` has anchors of equal pitch and abcjs draws a SLUR.
- `((` puts two curves on one element and no x can tell them apart; abcjs's
  `for (i = 0; i < elem.startSlur.length; i++)` adds the OUTER first. `PlacedCurve.openSeq`.

### 2.8 A NOTE'S DOTS GO OUT FROM THE OUTSIDE IN

`for (; dot > 0; dot--)` with `dx = notehead.w + dotshiftx - 2 + 5 * dot`
(`create-note-head.js:52-55`). The baseline diff is a pure PERMUTATION.

### 2.9 `!breath!` DRAWS abcjs's `,`, AND `+` WAS STILL REACHING FOR BRAVURA

`symbolList` maps `"breath": ","` (`decoration.js:195`), not `scripts.comma` — two different
outlines in abcjs's table. And `"+": "scripts.stopped"` was UNMAPPED, so strict drew Bravura's
`pluckedLeftHandPizzicato` with `scale(7.75)` on it. **A BRAVURA FIGURE REACHABLE IN STRICT IS
A DEFECT, NOT A DECISION** — the class the 2026-08-05 audit closed, surviving because the note
beside it READ as a mapping and was a sentence (and named the wrong glyph).

---

## 3. THE NEW GATE, AND WHY IT EXISTS

`tests/svg-bytes-sibling.test.ts`. `../abcMusicKit/Tools/abcjs-debug/golden/` holds 381 abcjs
6.7.0 SVGs dumped at `{staffwidth: 670}`, and the only gate that ever opened them was
`pixel-parity`, which compares NOTEHEAD CENTRES within 0.05px and has read 0 of 120 for a week.

**A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION, NOT OF ITS COMPARISON** — third and fourth
time on this branch. The in-repo gate had the same hole and a note explaining it away (*"a
multi-tune file … is a different surface with a different generator"*): three fixtures, seven
tunes, six already exact and the seventh the whole rich-text feature.

`S7-voices` is EXCLUDED and named. The gate SKIPS when the sibling checkout is absent.

---

## 4. WHAT IS LEFT — 22 of 113

Regenerate with `npx vitest run tests/svg-bytes-sibling.test.ts` →
`/tmp/abcts-svg-bytes-sibling-ranked.txt`. Probe one row with
`S=<slug> [T=<tune>] npx tsx scripts/zzs1.ts`.

### 4.1 THE ULP FAMILY IS IN THE SOLVE, and that is now measured

`S8-layout-tune9`'s `G,` draws at `81.57861713702906` against abcjs's `…04`; `-tune10`'s
`^c`, `-tune7`'s sharp, `S6-keys-tune2`'s flat, `S3-note-syntax-tune8`'s and
`ragtime-nightingale`'s `height` are the same shape — **six rows behind one cause.**

**IT IS NOT THE PLACEMENT.** A carried `dx` on the notehead was tried and took `svg-bytes`
from 0 to 23 of 178; `placeElement` printed for the same head reads

    at 75.48861713702905  el.x 34.64101615137754  g.x 34.64101615137754  derived 0

so the head's offset is genuinely zero and there is nothing to build. Taking the glyph's
own 6.09 off both drawn x's leaves OUR `at` one ULP above abcjs's element x — **the line
solve's own cursor.** `ABCJS_XX` prints abcjs's per-element `x`/`minx`/`nextx`; walk the
two chains back to where they part. `CHECKPOINT-2026-08-11b.md` §5 has the token counters.

### 4.2 A `*` IS AN EMPTY SYLLABLE — measured, NOT landed

`little swallow` carries 19 `*`s in its `w:` lines and abcjs draws **89 lyric elements to
our 70**, one per `*`. The content falls out of `renderText`'s two rewrites: `addLyric`
builds `lyricStr += syllable + div + "\n"`, so two blank verses give `"\n\n"`, which
`/\n\n/g → "\n \n"` and `/^\n/ → "\xA0\n"` turn into abcjs's three tspans —
`&nbsp;`, a space, an empty one.

Three pieces, which is why it is written down instead: the parser must keep the syllable
(`applyLyrics` drops it with a note saying it "need not be recorded"), the lyric emitter
must apply those rewrites to the JOINED verse string as `bottomTextBlock` already does for
`N:`/`H:`, and the LANE counts `versesHere` by non-empty text.

### 4.3 The rest, by what its first difference names

| row | first difference |
|---|---|
| `S1-decorations-tune2` | a hairpin's x — 366.53 against 525.26, and one hairpin too many |
| `zocharti-loch` | a whole rest's x, 133.75 against 116.84 |
| `S8-layout-tune6` | a beam's `d` — one path against two |
| `S5-directives-tune4` | a `<text>` missing after a stem |
| `S8-layout-tune8` | a slur flat where abcjs slopes it |
| `S4-bars-repeats-tune1` | an ending bracket at 203.41 against 58.05 |
| `S8-layout-tune5` | `scripts.roll`'s y, 90.698 against 90.679 |
| `vree-slurs-and-triplets` | a curve 23px low |
| `S2-fields-tune2` | a `%%text` block between two music lines |
| `S1-decorations-tune3` | a note group |
| `multi-voice-rest-placement` | a quarter rest's x |
| `S5-directives-tune1` | a stem after a `"Am"` |
| `ave-verum-corpus` | a BRACE's path — `curvyPath` arithmetic, the largest single one left |
| `S8-layout-tune3` | `height` 187.542 against 186.524 |
| `frere-jacques` | `height` 854.4015 against 854.4205 |

## 5. THE HARNESS — WHAT WAS ADDED THIS SESSION

**abcjs, instrumented** — a SCRATCHPAD COPY at `/tmp/gp/abcjs`, NEVER `../abcMusicKit`:

```bash
NODE_PATH=../abcMusicKit/Tools/abcjs-debug/node_modules \
ABCJS_PATH=/tmp/gp/abcjs ABCJS_MYPROBE=1 \
node /tmp/gp/walk.js --file <path to .abc> 2>&1 | grep MYPROBE
```

| Var | Where | Prints |
|---|---|---|
| `ABCJS_CST` | `parse/tune-builder.js`, `abc_parse_music.js`, `abstract-engraver.js` | `createStaff`'s clef+key, `startNewLine`'s clef choice, `appendStartingElement`'s staff write, and what the ENGRAVER is handed |
| `ABCJS_CLEF` | `creation/create-clef.js` | a clef's `type`/`clefPos`/`verticalPos` and its declared box |
| `ABCJS_ABSY` | `draw/staff-group.js` | each staff's `absoluteY`, `top` and `bottom` AFTER `setUpperAndLowerElements` |
| `ABCJS_NM` | `draw/non-music.js` | every nonMusic ROW **with `renderer.y`** — the page cursor row by row |

plus `ABCJS_XX`, `ABCJS_SLUR`, `ABCJS_GDX`, `ABCJS_MAXW`, `ABCJS_SXS` and the rest from
earlier arcs (`CHECKPOINT-2026-08-13.md` §5).

**Ours:**

    ABCTS_FIX=<slug> [ABCTS_TUNE=n] npx tsx scripts/zzpr.ts   # in-repo corpus  -> /tmp/ours.svg
    S=<slug> [T=<tune>]             npx tsx scripts/zzs1.ts   # sibling corpus, first difference
    S=<slug>  T=<tune>              npx tsx scripts/zzs2.ts   # sibling corpus  -> /tmp/ours.svg

**vitest swallows `console.log`**, so probe through `tsx`. `ABCTS_PROBE=1` adds the staff
extents with the contributing source line; `ABCTS_CHECK=1` asserts the walked staff origin.

**The two ratchets.** `/tmp/exact.mjs` (in-repo) and `/tmp/exact-sib.mjs` (sibling) each read
their ranked table and write the `PASSING` list; splice it into the test. Both enumerate
`<slug>.svg` AND `<slug>-tune{i}.svg`.

---

## 6. THE RULES THIS SESSION EARNED

- **A GATE'S REACH IS A PROPERTY OF ITS ENUMERATION.** Twice more, and both times a NOTE
  explaining the hole away was the reason nobody measured it. 120 tunes and 7 more were
  sitting in goldens nothing opened.
- **A RULE PORTED IN HALF LOOKS LIKE A RULE THAT DOES NOT APPLY.** The synthetic
  `startRepeat` was narrowed to `endRepeat` because the other half of the same rule was
  missing, and the narrowing was written down as a finding. So was the zero-edge guard,
  ported for a stem and recorded as belonging to that one site.
- **A NOTE THAT READS LIKE A MAPPING MAY BE A SENTENCE.** `scripts.stopped` sat in
  `UNMAPPED_ABCJS` beside a comment saying what it maps to, and it named the wrong glyph.
- **WHEN A CHANGE TO AN INPUT MOVES NOTHING, THE OUTPUT IS NOT READING THAT INPUT** — the
  chord's internal notes flipped `isTie` and the page did not move, because the anchor's
  PITCH was wrong for a different reason.
- **A SUM CANNOT SEE AN ORDER, AND `round2` HIDES ONE.** The bottom block's local sum was
  invisible until a RICH row printed its y raw.
