# abcts — Checkpoint, 2026-08-03c

Supersedes `CHECKPOINT-2026-08-03b.md`, which stays as the record of the lyric-ink fix, the
tempo note, the two beam divergences and the ragtime verdict. Nothing in it is corrected;
this is the ledger of what landed after it.

**THE STANDING ORDER IS 100% PARITY WITH ABCJS ON EVERY TUNE — the 41-fixture corpus, the
174-tune harvested corpus, Gonzato, and the audio feature set. Work until it is reached.**

Read this, then `HANDOFF-2026-08-03c.md`, then `VERTICAL-ARC.md`, then `ARCHITECTURE.md`,
then `CLAUDE.md`.

---

## STATE

| corpus | standing |
|---|---|
| 41-fixture | **SIX of 29 are off any axis at all**, from nine. Only `ragtime-nightingale`'s `oy` is a gate failure. |
| harvested (174) | within 0.05 / 1 / 5 / 25px: **95 / 106 / 115 / 137**, from 72 / 83 / 91 / 116 at the start of the day. **79 of 174 still off some axis.** |
| suite | 684 of 685. The one red is `ragtime-nightingale`'s `oy` at 1.58 against 0.59, NOT raised. |

The 41-fixture stragglers, and every one is now named:

| fixture | dy | dx | oy | ox | what |
|---|---|---|---|---|---|
| `ragtime-nightingale` | 58.13 | 53.56 | −1.58 | −1.86 | dy is the mis-paired pair; the rest is horizontal |
| `vree-grace-notes` | 11.64 | 32.50 | 0.03 | −1.14 | grace EMISSION ORDER, an artefact |
| `little swallow` | 0.32 | 24.19 | 0.16 | −6.29 | dx is the goldens' ASCII width table |
| `frere-jacques` | 0.03 | 22.64 | −0.02 | −3.52 | horizontal |
| `happy-birthday` | 0.04 | 3.85 | 0.04 | −0.49 | horizontal |
| `zocharti-loch` | 0.01 | 1.25 | −0.01 | −0.33 | horizontal |

---

## START HERE, EVERY SESSION

```bash
npx vitest run tests/corpus-abcjs-ranked.test.ts && cat /tmp/abcts-corpus-ranked.txt
```

**Every fix below came off that table.** The ratchet's four counts say a number moved; only
the table says what to fix, and its DIRECTIVES column is what makes it actionable. Read the
SHAPE: `dy 0.0` beside a large `dx` is horizontal; a large `|oy|` with `dy` near zero is a
rigid vertical shift, one term and usually one cause; and a fixture with ONE paired notehead
has no meaningful spread at all, so its `dy`/`dx` of 0.00 mean nothing and its `ox` is that
single note.

---

## WHAT LANDED

### 10. ACCIDENTALS — three facts, and the largest horizontal term on the branch

`create-note-head.js:85-100`, `abstract-engraver.js:723-734`:

- **They stack leftward in columns.** A running `roomTaken` across the chord's pitches,
  each accidental at `-roomTaken - (width + 2)`. We took the widest and one gap, which puts
  a chord's second accidental on top of its first.
- **A column is reused six steps apart.** An open column holding a pitch at least 6 below is
  taken as-is and adds no width.
- **THE DRAWN OFFSET IS NOT THE LAYOUT EXTENT.** The glyph sits at `width + 2`; the element
  declares `extraw -= width / 2` ON TOP of that, with abcjs's own "not sure why it isn't the
  full width" beside it. A sharp DRAWS 10.25px left of its head and RESERVES 14.375.

On a line with slack the spring absorbs all of it and nothing shows. On a COMPRESSED line
it is the whole error. Our natural width at abcjs's initial spacing of 30 is now
**1037.408** against its **1037.4038**, and all four extents match its probe exactly.

### 11. The notehead's ROD is abcjs's 9.81, not Bravura's 9.145 outline

The rod read the Bravura table while the flag beside it already read the active one. 0.665px
per note — nothing with slack, everything without, since **a rod only shows when the spring
has been squeezed under it**.

### 12. MULTI-MEASURE RESTS — and a duration the source gets wrong

`Z` and `X` drew nothing. abcjs puts the bar glyph at `dx = mmWidth`, `w = mmWidth * 2`,
pitch 7, and the count at `dx = mmWidth`, `w = mmWidth`, pitch 16 — so `w = 3 x mmWidth`,
126px, which the probe confirms exactly.

**Its duration is a FLAT 1.** `abc_parse_music.js:1214` reads
`el.duration = num.num * tune.getBarLength()`, predicting 24 for `Z24`. Measured at layout,
abcjs carries `duration: 1` whatever the count and whatever the meter — probed on `Z24` with
no `M:`, `Z2` in 3/4 and `Z5` in 2/4, all three exactly 1. The third time on this branch that
a line of abcjs predicts a number its own SVG denies.

### 13. `%%staffwidth` IS IN POINTS; the host's `staffwidth` param is in PIXELS

abcjs converts only the directive — `this.width = formatting.staffwidth * 1.33`
(`engraver-controller.js:208`) — where the param goes straight into `staffwidthScreen`
(`:55`). `visual-svg-per-line-02-scaled` dx 115.5 → 0.01.

### 14. A `%%` DIRECTIVE BEFORE THE FIRST `X:` IS THE FILE HEADER

ABC 2.1 §4.1, and it applies to every tune. The builder holding it looks EMPTY — no `X:`,
no `T:`, no music — so `flush` dropped it whole and `%%stretchlast 1` written above `X:1`
never reached the tune below it. `visual-wrap-02-stretchlast-1` dx 241.15 → 0.01.

---

## THE HORIZONTAL MODEL IS A FAITHFUL PORT — the divergences are NUMBERS in it

Worth knowing before touching it. `lineAt` reproduces `layoutStaffGroup` +
`voice-elements.js` element for element: `nextx = x + spacing * sqrt(dur * 8)`,
`minx = x + w (+ minspacing)`, `getNextX = max(minx, nextx)`, the `extraw` shift, the
waiting-voice instalments, and `calcHorizontalSpacing`'s inversion over `spacingUnits`.

So a horizontal divergence is almost never the loop. It is a `w`, an `extraw`, a
`minspacing` or a duration — and the way to find it is to instrument
`voice-elements.js`'s `layoutOneItem` to print `type / dur / w / extraw / minspacing / x`
and compare item by item. Three of the four fixes above were found that way in one run each.

**Our `units` are abcjs's × √2 and our `spacingScale` is its 30 ÷ √2** — the reference is
1/16 where abcjs's is 1/8. The PRODUCT is what the solve uses, so both are consistent; do
not "fix" one without the other.

---

### 15. `%%gchordfont`, and A THIRD GOLDEN LIMITATION

The directive is a CHANGING font (`getChangingFont`, `abc_parse_directive.js:1019-1029`) —
`visual-tablature-17` sets it four times between music lines — so it is stamped per EVENT,
like the vocalfont. Size converts as every abcjs font does, `round(size * 4 / 3)`, and its
default is Helvetica 12 = the 16px `chordTextSize` already in `ENGRAVE`, so a tune setting
no font takes exactly the path it always did.

**The lane is as tall as the font**: `RelativeElement` takes `chordHeightAbove` straight
from the measured height (`relative-element.js:60`).

**AND THE GOLDEN GENERATOR CANNOT MEASURE A NON-DEFAULT FONT'S WIDTH.**
`dump-svg.js:63-85` maps every font SIZE onto one of six per-character tables — anything
27px or larger is measured with the TITLE table — while its HEIGHT comes from
`fontHeights[round(size)]` with a faithful `size + 2` fallback (`:50-58,105`). So:

| | can we match it? |
|---|---|
| text HEIGHT, any size | YES — `goldenTextHeight` reproduces the table and the fallback |
| text WIDTH, one of the seven default sizes | yes |
| text WIDTH, any other size | **NO** — the golden measures 107px Arial with 27px widths |

`visual-tablature-17-stretchlast`'s `dy` went 300.3 → 64.1 and its `dx` 47.2 → 425.5 on
this, and that `dx` is NOT chaseable: its chord symbols are 10, 20, 40 and 80 POINT, three
of the four outside the tables. The third such limitation, after `little swallow`'s
ASCII-only CJK widths and `vree-grace-notes`'s emission order.

**So the font work should be judged on the VERTICAL axes.** `visual-options-01-fonts` is
`oy` −153.5 → −133.9 and has eighteen more fonts to go.

---

## THE NEXT CLUSTER IS THE REST OF THE FONT DIRECTIVES

`%%gchordfont` and friends are parsed nowhere and drive four of the top ten:

| fixture | worst | fonts it sets |
|---|---|---|
| `visual-tablature-17-stretchlast` | 300.3 (dy) | `%%gchordfont` at 10/20/40/80 mid-tune |
| `visual-options-01-fonts` | 153.5 (oy) | all EIGHTEEN, plus `%%header`/`%%footer` |
| `visual-selection-01-selection-test` | 69.9 | title/vocal/voice/measure/parts |
| `visual-svg-per-line-01-selection-test` | 69.9 | " |

abcjs's mechanism is one place: `getFontAndAttr.calc(type, klass)` reads
`abcTune.formatting[type]`, and every size in the engraver comes from it. The directive
grammar is `%%<type>font <family> <size> [box]`, the same shape `%%vocalfont` already
parses — the model has `LyricFont` and could grow a `fonts` record keyed by type.

**`%%gchordfont` can change MID-TUNE** (that fixture sets it four times between music
lines), so it is per-element state, not a tune-level constant.

---

## TRAPS ADDED THIS SESSION

1. **A FIXTURE WITH ONE PAIRED NOTEHEAD HAS NO SPREAD.** `misc-01-barnumbers-1` reported
   `dy 0.0 dx 0.0` and looked like a pure translation; it has exactly one notehead, so both
   are 0 by construction and only `ox` said anything.
2. **`dump-svg.js` PASSES `staffwidth: 670`** (`renderParams` at its foot), so every golden
   in BOTH corpora is 670 wide and abcjs's `targetWidth` is 685, not 755. The harvested
   generator shells out to the same script, so the two corpora agree.
3. **THE SOURCE PREDICTED THE WRONG NUMBER A THIRD TIME** — `Z24`'s duration. The rule now
   has three instances and no exceptions: read the source for the MECHANISM, then MEASURE
   the number, and when they disagree the output wins.
4. Everything in `-08-03b`'s trap list still holds.

---

## VERIFY LOOP

```bash
cd Code/abcts
npx tsc --noEmit
npx vitest run          # 684/685; the ONLY expected failure is ragtime's oy
npx biome check src tests
npm run baseline        # READ the diff, commit baselines with the code
git -C ../abcMusicKit status --short   # MUST be empty
```

The probes, unchanged, plus the two that paid most this session:

```bash
# per-element widths — the horizontal workhorse
#   voice-elements.js `layoutOneItem`, before `child.setX(x)`:
#   type / dur / w / extraw / minspacing / er / x
# the spacing solve
#   layout.js `setXSpacing`: initial `space`, then per iteration `staffGroup.w`,
#   `newspace`, `ret.spacingUnits`, `ret.minSpace`
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```
