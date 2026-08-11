# abcts — Checkpoint, 2026-08-10d — **THE DOM CONTRACT IS 24 OF 25, AND THE LAYOUT HOLDS ABCJS'S OWN PIXELS**

Supersedes `CHECKPOINT-2026-08-10c.md` for the STATE. That file keeps THE HARNESS (§1), the
height's three-way split (§2), the forty-one landings of the SVG-frame arc (§3) and — above
all — **§5, the `px / 7.75` round trip and v1's answer to it**, which is the arc this
session opened and did not close. `-08-10b.md` keeps the SVG frame arc. `-08-09b.md` keeps
the count-in ladder, the chord grid, `setTiming`, the third audio surface and the
decoration-x finding. `-08-09.md` keeps the tempo gate, the byte-exact MIDI file and the
audit of abcjs's `tests/` folder.

---

## THE GOAL, UNCHANGED

> **abcts exists to build an abcjs-modern whose output — the SVG FILE and the AUDIO — is
> 100% BYTE-EQUAL to abcjs 6.7.0.**

A tolerance is a defect that has not been written down yet. Anything we decline to
reproduce goes in `Docs/ABCJS-DIFFERENCES.md` with its evidence and its slug goes in
`svg-bytes.test.ts`'s `DIVERGENT` list. **That list is still EMPTY.**

---

## STATE

| surface | gate | standing | was, this morning |
|---|---|---|---|
| MIDI file | `midi-file-ranked` | **BYTE-EXACT, 0 of 3** | 0 of 3 |
| audio event list | `audio-ranked` | 0 of 72 | 0 of 72 |
| note timings | `timing-ranked` | 0 of 38 | 0 of 38 |
| element timings | `timing-elements` | 1 of 13 — abcjs's own quirk | 1 of 13 |
| chord grid | `chord-grid-ranked` | 0 of 23 | 0 of 23 |
| harvested geometry | `corpus-abcjs-ranked` | 0 of 174 | 0 of 174 |
| pixel geometry | `pixel-parity` | 0 of 120 | 0 of 120 |
| **DOM contract** | **`dom-contract`** | **1 of 25 — TWENTY-FOUR RATCHETED** | 11 of 25, fourteen |
| **SVG bytes** | **`svg-bytes`** | **151 of 171**; best 22908, median 657 | 164 of 171, best 5186, median 174 |

**Suite 1158 of 1158. NO REDS. `npx tsc --noEmit` clean. Working tree clean.**

Heights: **80 exact / 86 ULP-only / 5 larger, of which 2 are structural** — unchanged, and
the two structural ones are still `visual-mouse-click-01` and `visual-tablature-15` at
3.875px.

---

## 1. THE DOM CONTRACT WENT FROM 11 OF 25 TO 1, AND IT NAMED EVERY DEFECT IN ONE RUN

That is the instrument working exactly as `-08-10c` said it would: it carries the EXACT
expected string, so a wrong guess is named rather than measured as a distance. Nine
landings, each a read of a named abcjs function.

### The order inside a note is the ENGRAVER'S CALL ORDER, and `_addChild` is a plain push

`createNote` is a straight run of adders and `_addChild` is `this.children[len] = child`
(`absolute-element.js:181-190`), so **DRAW ORDER IS CALL ORDER**:

```
heads+stem → lyric → graces → decorations → barNumber → LEDGER → chord
```

(`abstract-engraver.js:829-855`.) **THE LEDGER IS LAST**, and only a BEAMED stem comes
after it. We emitted every rule together, so the ledger came out with the stem and
everything the engraver added after it followed. **THREE CASES MOVED ON THAT ONE CHANGE**,
and a LYRIC being a `<text>` is why the emitter's "texts last" rule had to bend: only the
CHORD SYMBOL is genuinely last, because `addChord` runs after `ledgerLines`.

A TEXT DECORATION (`!D.C.!`) is `createDecoration`'s and precedes the ledger; an ANNOTATION
(`"^above"`) is `addChord`'s and follows it. **Both draw with `annotationfont`, so the ROLE
is what tells them apart, not the markup.**

### A lyric, a chord symbol and an annotation each NAME THEMSELVES

`relative.js:41-52` gives all three `klass: classes.generate(<name>)` and the same string
as `name`. The `n` counter joins only the lyric's, because `generate` appends it for a key
containing `note`, `rest` or `lyric` (`helpers/classes.js:90`). Ours wrote neither.

A TEMPO MARK's three parts — `pre`, `beats`, `post` — name themselves and carry **NO
class**: `drawTempo` passes `noClass: true` (`draw/tempo.js:19`, `:31`, `:38`). They are the
only text in the music that is named and not classed.

### A DYNAMIC IS NOT A CHILD OF THE NOTE

`!p!` becomes a `DynamicDecoration` pushed onto the voice's `otherchildren`
(`decoration.js:287`), so `drawVoice` draws it AFTER every element and every beam, at the
VOICE's level — where a hairpin already sat. Ours nested it in the note group at depth 2.

**AND `drawDynamics` AND `drawCrescendo` DISAGREE ON THE ORDER OF THEIR OWN TWO CLASSES** —
`generate('decoration dynamics')` for a volume mark (`draw/dynamics.js:11`) against
`generate('dynamics decoration')` for a hairpin (`draw/crescendo.js:34`). abcjs's contract
shows both spellings side by side. A quirk to reproduce, not one of them to pick.

**AND A HAIRPIN IS ONE STROKED `<path>` WITH TWO SUBPATHS.** `drawCrescendo` builds
`M %f %f L %f %f M %f %f L %f %f` in a single `printPath`, so both arms are one element and
one row of the contract. We drew an arm each, which read as a doubled dynamic.

### An ENDING and a TRIPLET are each a GROUP holding ONE path and its number

Both `openGroup`, write EVERY segment into a single `printPath` `d`, add the number as a
`noClass` text naming itself, and close (`draw/ending.js:27-50`, `draw/triplet.js:7-13`).
We wrote a line per segment at the voice's level and a text beside them — four rows where
abcjs has three. **The hooks come FIRST and the rule last**, and every `d` segment carries a
trailing space, from `sprintf`.

**THE ENDING'S MEASURE COUNTER IS ITS MEASURE WITHIN THE LINE, MINUS ONE**, and that was
MEASURED through abcjs rather than reasoned: three controls with `--add-classes` gave
`CDEF|1…:|2…` → m0/m1, `|:CDEF|GABc|1…:|2…` → m1/m2, and a second line restarting at m0
with `mm4`/`mm5`. It is the count of `"bar"` markers already in `otherchildren`, since the
ending is `addOther`'d ahead of its own barline (`voice-element.js:29-41`).

Because our per-staff buckets are walked in an order of our own where abcjs's
`otherchildren` is ONE interleaved list, the counter has to be ADDRESSED rather than
advanced — `Classes.generateAt(key, measure)`.

### A SLUR AND A TIE NAME THE NOTES THEY JOIN

`abcjs-start-m0-n0 abcjs-end-m0-n3 abcjs-slur abcjs-legato …`, built from each anchor's
`parent.counters` (`draw/tie.js:6-20`) with `abcjs-start-edge`/`abcjs-end-edge` for an
unanchored end, then `drawArc` appends `slur` and `tie`-or-`legato` before generating
(`:83-87`). `data-name` is `tie` or `slur`. Ours wrote a bare `abcjs-tie`, a class abcjs
only ever writes with the rest of that string.

The counters come from `params.counters = classes.getCurrent()` recorded inside
`drawAbsolute` (`draw/absolute.js:33`) — so the emitter records them per element index
during its walk and `PlacedCurve` carries the two anchor indices.

**A GRACE SLUR'S TWO ANCHORS ARE THE SAME ELEMENT** — a grace head and the main head are
children of one `AbsoluteElement` — so it reads `abcjs-start-m0-n0 abcjs-end-m0-n0`.

### A GRACE BEAM IS A BEAM

`addBeam(gracebeam)` puts it in `params.beams` (`abstract-engraver.js:493`), so `drawVoice`
writes it after every element with `classes.generate('beam-elem d0')` — durationClass 0,
since a grace has no sounding duration. Ours carried it inside the note's own lines with no
class at all, which made it INVISIBLE to a contract that walks classed-or-named elements.

### AN ELEMENT THAT DRAWS NOTHING WRITES NO GROUP

`elementGroup.endGroup` returns null with no children and `drawAbsolute` skips the whole
append — abcjs's own comment says "If there was no output, then don't add to the
selectables. This happens when using the `y` spacer." Ours wrote a `<g class="abcjs-rest">`
around nothing, so **a spacer read as a rest on every gate that walks the DOM**, and it took
a `data-index` with it. Same rule as `abcjs-meta-top` and the staff-lines group
(`svg.js:364-372`) — now applied to element groups too.

---

## 2. TWO BYTE-LEVEL FINDINGS THAT ONLY THE BYTE TABLE COULD STATE

- **A NOTEHEAD'S CLASS IS WRITTEN AFTER ITS `d`.** Inside an element group `printSymbol`
  passes ONLY `data-name` and no `klass` (`draw/print-symbol.js:34-38`) — which is why a
  CLEF glyph carries no class at all — and `drawAbsolute` comes back afterwards with
  `el.setAttribute('class', 'abcjs-notehead')` for any symbol whose glyph name contains
  `notehead`, appending `abcjs-chord-pos-N` the same way (`draw/absolute.js:20-28`). **A
  late `setAttribute` serialises LAST.** The golden reads
  `<path data-name="A" d="…" class="abcjs-notehead">`.
- **A STEM AND A BARLINE COME OUT OF A DIFFERENT EMITTER FROM A STAFF LINE.** `printStem`
  joins each command's parts with a space and CONCATENATES the commands with NOTHING
  between them — `M 80.66 49.86L 80.66 75.69…` — where `printLine` builds one `sprintf`
  with spaces throughout (`print-stem.js:33-36`, `print-line.js:29`). They start at
  different CORNERS and order their attributes differently, and **a stem carries no
  `stroke`/`fill` because `printStem` adds those only when NOT inside an element group.**

  The corner rule, measured on one control carrying an up stem, a down stem and a bar:
  `x` then `x + dx`, with `dx` NEGATIVE for an up stem and the two y's swapped when it is —
  so an **up** stem runs right-top → right-bottom → left-bottom → left-top and a **down**
  stem or a **barline** runs left-bottom → left-top → right-top → right-bottom.

  And `printLine`'s options are `{path, stroke, fill, data-name, class}` — **the NAME before
  the CLASS**, which is the opposite of everywhere else here.

---

## 3. THREE GATES WERE READING THE MARKUP THEY MEASURED — AGAIN

The same failure mode as `glyph-ycorr` and `compat`'s density test on 2026-08-10b, and it is
now the most reliable signal in the repo that a change LANDED:

- **`compat`'s density test** matched `class="abcjs-notehead"` BEFORE the `d`. True only of
  our markup; abcjs writes that class last. Rewritten to read the whole tag and ask what it
  carries, in no order. *(Its third correction, and the note in the file says so.)*
- **`above-lane-order`** filtered `i.cls.includes('abcjs-dynamics')`. abcjs's dynamic class
  is `classes.generate('decoration dynamics')`, which is the EMPTY STRING when `add_classes`
  is off — and that ladder renders with no options. We had been writing the class literally
  whatever the option said. Keyed on `data-name` now, which is unconditional.
- **`line-weights`** asked for a bracket's rule weight by taking the thinnest dimension of
  its BOXES, which worked only while ours was a rect per stroke and abcjs's was one path.
  Both are one path now, so the gate parses the SEGMENTS out of the `d` — a question both
  engines can answer, and the one it exists to ask. The ENDING's weight is asserted as what
  it now is for both: **SVG's default 1, which is what writing no `stroke-width` MEANS.**

**A gate built on our own markup fails when we succeed; the failure is the signal.**

**AND THE BASELINES SAID CHANGED, NOT WRONG, AND THE SHAPE PROVED IT**: six fixtures moved
on the ending/triplet reorder, 85 insertions and 85 deletions, and a `sort | md5` check
showed all six were **pure permutations** — no removals. That is the check to run, not a
reading of the diff.

---

## 4. THE UNIT FLIP IS HALF-BUILT, AND THE HALF THAT IS BUILT IS THE SAFE HALF

`-08-10c` §5 named the remaining architectural question and answered it: **v1 never
introduced a second unit.** We divide every abcjs constant by 7.75 on the way in and
multiply back on the way out, and the two roundings do not cancel.

**MEASURED, and this is why it is the whole remaining arc**: the byte table's head is
`M 108.03813656268917` against abcjs's `M 108.038`, and its MEDIAN row — 175 bytes in, on
most of the 161 — is the root's `height="149.07999999999998"` against `149.08`. A histogram
of the first differing bytes is glyph path coordinates and the root height, and nothing
else of size.

**Rounding cannot fix it**, and that was checked rather than assumed: abcjs itself emits
`29.689999999999998` for a `clefs.G` and `94.89699999999999` for a height, where OURS is
clean. The noise runs both ways, so only the SAME ARITHMETIC produces the same bytes.

### What landed (two commits, both behaviour-neutral, suite green and NO baseline moved)

`src/renderer/abcjs-constants.ts` now has the knob:

```ts
export const UNIT_PX = STAFF_SPACE_PX      // px per layout unit — becomes 1
export const SPACE   = STAFF_SPACE_PX / UNIT_PX   // one staff space, in layout units
export const spaces         = (px)    => px / UNIT_PX
export const spacesOfPitch  = (pitch) => pitch * (STEP_PX / UNIT_PX)
export const steps          = (px)    => px / STEP_PX   // PITCH — unit-free, no SPACE
```

and everything denominated in staff SPACES is written `n * SPACE` so it survives the flip:

- **17 bare literals in `ENGRAVE`** — `spacePerStep`, `dotGap`, `dotSpacing`,
  `spacingScale`, `minColumnGap`, `connectorGap`, `spannerGap`, `spannerMinLength`,
  `melismaGap`, `melismaMinLength`, `tuneGap`, `beamStubLength`, `curveContinuation`,
  `curveEndGap`, `curveMinBulge`, `curveMaxBulge`, and the module's `STAFF_HALF_HEIGHT`.
  **Every other one of `ENGRAVE`'s 109 entries was already `spaces()`, `spacesOfPitch()`,
  `steps()`, `ABCJS_PITCH.*` or `ABCJS_RATIO.*`** — the triage of 2026-08-05 is what made
  this small.
- **The glyph metrics** (`glyph-table.ts`). SMuFL publishes in STAFF SPACES, so Bravura's
  advances, widths, heights, `y` and every `BRAVURA_WEIGHTS` entry carry `* SPACE`; abcjs
  publishes in ITS PIXELS, so its `glyph.w / ABCJS_STAFF_SPACE` became `/ UNIT_PX`.
- **The emitter.** `PX = (scale * UNIT_PX) / STAFF_SPACE_PX`, so compat's own 7.75 resolves
  to EXACTLY 1 once the layout holds abcjs's pixels and the emitter stops multiplying at
  all. And an outline's `scale` is `STAFF_SPACE_PX / (unitsPerSpace * UNIT_PX)` — path units
  to layout units — which is 1 for abcjs's outlines after the flip and 7.75 for Bravura's.
- **All 19 `STAFF_SPACE_PX` uses in `layout.ts`** — every one a px↔layout-unit conversion —
  are `UNIT_PX`, and so is `goldenTextHeight`'s.

### …AND THE ANNOTATION PASS IS NOW **DONE**, AND PROVEN DONE

Later the same session, on a green tree, every remaining space-denominated length was
annotated. **The proof is mechanical**: with `UNIT_PX = 1`, the baseline RATIO script
(recipe in the handoff) reports **NOTHING** — every number in all 46 baselines scales by
exactly 7.75 — and under the flip

```
pixel-parity            0 of 120     (unflipped: 0 of 120)
corpus-abcjs-ranked     0 of 174     (unflipped: 0 of 174)
```

so the GEOMETRY is unit-clean. Ten literals did it, and the classes they fall into are what
transfers:

- **A LENGTH→STEP CONVERSION WRITTEN `2 *`.** `2 * x` is `x / 0.5`, and 0.5 is only the
  step's length while a staff space is the unit. Four sites, each of which had a comment
  already SAYING it was a division: the clef's declared top, a key accidental's, the bar
  number's `measureNumDim.height / spacing.STEP`, and the tuplet's `pitchOf(y) = 6 - 2 * y`.
- **A LENGTH SPELLED AS A PITCH.** `noteheadHalfHeight` was `ABCJS_PITCH.noteheadHeight / 4`
  — numerically right and dimensionally silent, because `/4` is "pitch → spaces, halved".
  Now `spacesOfPitch(h) / 2`.
- **A STEP SPELLED AS A LENGTH** — the mirror. A tremolo's stem reach added
  `ENGRAVE.stemLength` (a LENGTH) to a STEP.
- **A BARE OFFSET.** Half a staff space of curve padding on every note anchor; the grace
  slash's three offsets.
- **A HARD-CODED `7.75`.** Nine of them, every one a px↔unit conversion — `%%staffsep`,
  `%%musicspace`, `%%sysstaffsep`, `%%staffwidth`, a font size, the justification loop's
  2px break threshold, the page ratchet's whole-pixel compare, and compat's own page width.
- **A RAW `GLYPHS[…]` READ.** The brace is Bravura's in every mode — one of the six sites
  the 2026-08-05 audit cleared — so its published width and height are in STAFF SPACES and
  carry the unit at the call site, where `glyphsFor()` would have carried it for them.
- **THE ROOT'S OWN SIZE.** `w`/`h` multiplied by the host's `staffSpace` where they wanted
  layout-units-to-output-pixels. Now one `OUT` factor, used by both modes.

**AND TWO OF THE TEN WERE REAL DEFECTS, NOT UNIT SLIPS**, found only because the knob made
the dimensions speak:

- **A TEMPO'S PRE-TEXT GAP IS ONE AVERAGE CHARACTER.** abcjs takes
  `charWidth = preWidth / preString.length` and advances `preWidth + charWidth`
  (`draw/tempo.js:22-23`); ours added a flat 1 staff space. **Verified against abcjs's own
  SVG**: `Q:"Allegro" 1/4=60` puts `data-name="beats"` at x 155.61 in both engines now.
- **THE SPRING WAS A PRE-DIVIDED, PRE-ROUNDED CONSTANT.** abcjs's law is
  `spacing * Math.sqrt(duration * 8)` with a base of 30px (`layout/voice-elements.js:22`,
  `:99`). Ours was `spacingScale * sqrt(d / (1/16))` with `spacingScale = 2.7372` — the
  same law with the `sqrt(2)` folded in and then rounded to FOUR DECIMALS, a relative
  1.5e-5 on every note's spring. **Invisible to a 0.05px gate and not to a byte
  comparison**, which is exactly why it survived: `CHECKPOINT-2026-08-05b.md`'s ruling —
  measuring is a compass, never a source of numbers — in one constant. Landing it took the
  byte table's best row from 5779 to 7897.

### …AND THE FLIP IS LANDED

`UNIT_PX = 1`. **The layout holds abcjs's own pixels end to end**, as `abcMusicKit` v1 does
and for the reason v1 does. Suite green, both geometry gates at zero, the ratio report
empty. The byte table on either side of it:

```
                      differ   median   best      heights (exact / ULP / structural)
before the flip      161/171      177   7 975     80 /  86 / 2
after                151/171      657  22 908    114 /  55 / 2
```

**34 heights went from ULP-noise to EXACT and the median first-difference nearly
quadrupled** — the round trip really was the tail. Five more findings came out of the flip
itself, and the first two are the ones whose lesson transfers:

- **THE IDENTITY SHORT-CUT WAS `PX === 1`, AND IT HAD TO BE `PX === 1 && oy === 0`.** `TL`
  and `TC` returned their argument untouched when the scale was 1 — written when `PX === 1`
  meant CORE mode, where `oy` is zero by construction and the groups carry the origin
  instead. Once the layout holds abcjs's pixels, `PX` is 1 in the abcjs path too, and there
  `oy` is the flattened origin: skipping it dropped the whole staff. **It cost three
  byte-exact fixtures**, whose top staff line came out at `-15.85` where abcjs writes
  `22.21` — exactly the missing `(system.originY + OY) + staff.originY`. A short-cut is a
  claim about its guard, and the guard had quietly changed meaning.
- **`roundNumber` IS `parseFloat(x.toFixed(2))`, WHICH IS NOT `Math.round(x * 100) / 100`.**
  The two disagree on a decimal half — `toFixed` rounds the BINARY value correctly where
  multiplying by 100 first introduces its own error — and a beam's second edge is computed
  FROM the rounded first, so 171.945 became 171.95 against abcjs's 171.94 and the 0.01
  propagated. **Three more fixtures byte-exact on that one line.**
- **A SCALED GLYPH IS CSS-SCALED, NOT DRAWN SMALL.** `drawRelativeElement` ends with
  `if (params.scalex !== 1) scaleExistingElem(…)`, setting
  `style="transform:scale(sx,sy);transform-origin:Xpx Ypx;"` on the element it just made
  (`draw/relative.js:68-76`). That is the OTHER HALF of the finding that abcjs never
  applies a glyph's scale to its PATH: the outline really is byte-identical to a full-size
  one, and a `style` attribute shrinks it. The origin is the RAW pitch, before `getYCorr`,
  and like the notehead's class it is a late `setAttribute` — so it serialises after the
  `d`.
- **A BEAM IS A `<path>`, AND ONE PATH HOLDS EVERY BEAM OF ITS GROUP.** `drawBeam`
  concatenates the corners of every beam in the group into a single `d`
  (`draw/beam.js:7-44`), where ours was a `<polygon>` each. The separators are irregular —
  a space before the first and third `L` and none before the second — and `dy` is SIGNED,
  `+STEP` for stems up and `-STEP` for stems down, so an up-stem beam's path opens on its
  TOP edge and a down-stem beam's on its BOTTOM.
- **A MUSIC TEXT IS `renderText`'s ELEMENT, ATTRIBUTE FOR ATTRIBUTE**, with the FACE,
  weight and style of its own `%%…font` spelled out — a lyric is Times New Roman BOLD, a
  chord symbol Helvetica, a tuplet number plain `Times` and not Times New Roman
  (`parse/abc_parse_directive.js:22-44`). Ours wrote a short ad-hoc `<text>` with
  `font-family="serif"`. **And `noClass` is a PROPERTY, not `renderText`'s third
  argument** — that one is `alreadyInGroup`. The bar number passes `true` for THAT while
  carrying a real class, and reading the positional argument as `noClass` broke
  `dom-bar-numbers` the moment it landed. Measured through abcjs both ways rather than
  read: `class=""` without `add_classes`, the generated string with it.
- **A TEMPO'S RATE IS BOLD**, like the `pre` text beside it: both are `tempofont`, whose
  default is `weight: "bold"`.

### What the FIRST attempt cost, and the LESSON that is now proven

**THE FLIP WAS ATTEMPTED AND REVERTED.** Setting `UNIT_PX = 1` took `pixel-parity` to
**119 of 120** and the harvested table to **150 of 174**. The layout is full of INLINE
space-denominated literals beyond `ENGRAVE`, and with hundreds wrong at once the ranked
tables are noise rather than a work list.

**DO THE ANNOTATION PASS BEFORE THE FLIP, NOT AFTER IT.** That is the whole finding.
Annotating `n * SPACE` while `SPACE === 1` is a ZERO-BEHAVIOUR-CHANGE edit whose check is
the one this repo already trusts — **the suite stays green and NO BASELINE MOVES** — so
every literal can be converted and verified one at a time, on a green tree, with no
guessing. Flipping first inverts that: the check becomes "everything is broken", and it
names nothing.

**AND THE DISCOVERY MECHANISM IS THE BASELINES, USED AS A RATIO.** After the flip every
number in `tests/renderer/baselines/` must be EXACTLY 7.75× what it was. A one-off script
comparing the two directories token by token prints, per row kind, how many failed and what
ratios they came out at — that is an exhaustive, mechanical list of what did not scale, and
it needs no judgement. The recipe is in `Docs/HANDOFF-2026-08-10d.md`.

Even half-flipped it was already naming things: `staffline 1.935 → 15.000` and `t=0.090 →
0.700` were exact ×7.75 on the first try, which is how the glyph-metric pass was found (the
clef's `w` was ×2.4 until `glyph-table.ts` took the knob) and how the text sizes were
(`size=3.484 → 27.000` ✓ once `goldenTextHeight` did). What remained wrong at the point of
revert was **element WIDTHS** (a note's `w` moved ×1.975, not ×7.75) and the **vertical
stacking** (a staff's `originY` moved ×18.5) — so the spring/column model and the
staff-stacking arithmetic are where the remaining inline literals are.

---

## WHAT IS LEFT, IN YIELD ORDER

1. **THE BYTE TABLE, WHICH IS NOW THE ONLY OPEN GATE.** 151 of 171, median 657. Read
   `/tmp/abcts-svg-bytes-ranked.txt` and its FAMILY HISTOGRAM — the one command that has
   named most of this arc's work:

   ```bash
   grep "^      want" /tmp/abcts-svg-bytes-ranked.txt \
     | sed 's/^      want …//' | cut -c1-38 | sort | uniq -c | sort -rn | head
   ```

   The families standing now, biggest first:
   - **THE ROOT'S `height`, 12 rows.** 55 of 171 still differ by ULP after the flip
     (`{exact: 114, ulpOnly: 55, structural: 2}`), and it is no longer a round trip: it is
     the ORDER the vertical cursor is summed in. abcjs's `draw.js` calls `moveY` repeatedly
     and we accumulate differently, so `652.3275` meets `652.3275000000001` and
     `149.07999999999998` meets `149.08` — **in BOTH directions**, which is what says it is
     an accumulation order rather than a systematic bias.
   - **A `<text>`, 5 rows**, differing at `decoration="none" class="" text-anchor` — some
     remaining attribute or a lyric's trailing `<tspan dy="1.2em"></tspan>`, which abcjs
     emits because `addLyric` ends every syllable with a `\n`.
   - **The body's very first bytes, 5 rows**, at `;}</style><title>Sheet Music</title><g`.
   - **`clefs.G`'s y, 6 rows.**
   - **A multi-character DYNAMIC is a `<g data-name="dynamics">` of one path per LETTER.**
     `printSymbol`'s multi-char branch opens a group and draws each character with
     `kernSymbols` between them (`draw/print-symbol.js:15-31`), where SMuFL precomposes
     `pppp` into one glyph. Strict must spell it out — the same shape the time signature
     already takes.
   - **The two structural HEIGHTS**, 3.875px on `visual-mouse-click-01` and
     `visual-tablature-15`, with FOUR LADDERS already ruling out what they are not. Do not
     re-measure those.
2. **A MEASURE CAN CARRY ONLY ONE `meterChange`, AND `svg-time-sig-list` NEEDS THREE.**
   `[M:2/4]y[M:3/4]y[M:4/4]` has no barline in it, so all three belong to ONE measure and
   `Measure.meterChange` keeps the last. abcjs draws all three, each as its own
   `staff-extra time-signature`, because **a `y` SPACER does not open a measure**. The LAST
   open case of the DOM contract, and a MODEL change: `Measure.meterChange` is one slot,
   read by `layout.ts`, `chord-grid.ts`, `audio/flatten.ts` and `audio/timing.ts`. *(Half of
   this case closed today — abcjs draws no rest for the two `y` spacers, and neither do we
   any more.)*
3. **The last two structural heights** — 3.875px, one pitch, on `visual-mouse-click-01` and
   `visual-tablature-15`, with FOUR LADDERS already ruling out what they are not (a subtitle
   between voice lines of the first system, of the last, a mid-tune `%%sep`, a trailing
   `%%sep`). Do not re-measure those.
4. **`oneSvgPerLine` / `responsive` / `scale`** — five cases in `svg-per-line.test.js`.
5. **`el-four-endings`** — `|1,3 … :|2,4 …`. A DECISION, not a bug fix.
6. **The geometry half of the timing join** — `left`, `endX`, `top`, `height` on every
   `noteTimings` row. A gate to BUILD.
7. **The structural pass** — terms in `CHECKPOINT-2026-08-08d.md`, not to be re-argued.
   Note that §4's annotation work is a natural companion to it: both are whole-file sweeps
   of `layout.ts`.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1158 / 1158
svg bytes           151 of 171   best 22908, median 657
                    PASSING ratchet: 7 slugs
DOM contract        1 of 25       PASSING ratchet: 24 slugs
heights             114 exact / 55 ULP-only / 2 structural
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13
chord-grid ranked   0 of 23
midi ranked         0 of 3       BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERY COMMAND FROM `/Users/lrettberg/ICMLabs/Code/abcts`.**
