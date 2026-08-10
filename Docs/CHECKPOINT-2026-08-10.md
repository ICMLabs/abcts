# abcts — Checkpoint, 2026-08-10 — **BYTE PARITY IS THE BAR, AND THE SVG IS THE ARC**

Supersedes `CHECKPOINT-2026-08-09b.md` for the STATE. That file keeps the count-in ladder,
the chord grid, `setTiming`, the third audio surface and **the decoration-x finding**.
`-08-09.md` keeps the tempo gate, the byte-exact MIDI file and **the audit of abcjs's
`tests/` folder**. `-08-08e.md` keeps the audio arc's thirteen findings.
`-08-08d.md` keeps the 6.7.0 flip and the terms the structural pass must be held to.
`-08-06.md` keeps **THE HARNESS**.

---

## THE GOAL, RESTATED BY LANCE (2026-08-09)

> **abcts exists to build an abcjs-modern whose output — the SVG FILE and the AUDIO — is
> 100% BYTE-EQUAL to abcjs 6.7.0.**

A tolerance is therefore not a compromise to be balanced against effort; it is **a defect
that has not been written down yet**. Anything we decline to reproduce goes in
`Docs/ABCJS-DIFFERENCES.md` with its evidence, and its slug goes in `svg-bytes.test.ts`'s
`DIVERGENT` list. A slug there without an entry in the doc is a tolerance wearing a disguise.

---

## STATE

| surface | gate | standing |
|---|---|---|
| MIDI file | `midi-file-ranked` | **BYTE-EXACT, 0 of 3** |
| audio event list | `audio-ranked` | 0 of 72 |
| note timings | `timing-ranked` | 0 of 38 |
| element timings | `timing-elements` | 1 of 13 — abcjs's own quirk |
| chord grid | `chord-grid-ranked` | 0 of 23 |
| harvested geometry | `corpus-abcjs-ranked` | 0 of 174 |
| pixel geometry | `pixel-parity` | 0 of 120 |
| DOM contract | `dom-contract` | 25 of 25 cases, 86 of 694 rows |
| **SVG bytes** | **`svg-bytes`** | **171 of 171 — best 651 bytes, median 162** |

**Suite 1127 of 1127. NO REDS.** Nine ranked tables, seventeen gates.

---

## 1. THE BYTE TABLE IS THE PRIMARY GATE NOW

`tests/svg-bytes.test.ts` is the only comparison here with **no tolerance at all**. Every
other one declares what it ignores — `pixel-parity` compares notehead CENTRES, the harvested
table takes 0.05px, `tempo-parts` compares glyph KINDS, `decoration-x` measures one axis,
`dom-contract` counts classed ancestors rather than raw nesting. Each was defensible for the
axis it was built to see. **Together they let a markup difference live forever**: a `<rect>`
where abcjs writes a `<path>` moves nothing, a `<g transform>` where abcjs writes absolute
coordinates moves nothing, an attribute in a different order moves nothing.

It opened at **byte 10 on all 171 fixtures** and stands at **best 651, median 162**.

---

## 2. WHAT CLOSED, AND THE TWO CORRECTIONS ALONG THE WAY

- **Absolute pixels and no `viewBox`.** abcjs draws in pixels; we drew in staff spaces and
  let the view transform convert. **Removing the attribute alone took 196 tests red** —
  `tests/pixel-geometry.ts` reads it and every geometry gate is built on that — so emitting
  pixels and dropping it are ONE change. The whole suite green across it is the proof: those
  gates measure pixels and see the same pixels they saw before.
- **No `transform` anywhere.** The system and staff translates are flattened into every
  coordinate (`oy`).
- **The root element, attribute for attribute** — no `xmlns`, `xmlns:xlink` instead, `role`,
  `fill`, `stroke`, `aria-label` carrying the title, abcjs's `<style>` text, a `<title>` with
  REAL quotes where the label has `&quot;`, and **raw JS floats** for width and height.
- **The page is the staff width PLUS abcjs's 15px margins** — 670 renders 700. A test
  asserted the staff width itself; every golden says otherwise.
- **Staff lines TOP-DOWN**, every rule a **CLOSED PATH** with abcjs's attribute order and an
  explicit close tag, and **abcjs's two-decimal path rounding** (`roundNumber`).
- **The top text first and OUTSIDE the line group**; the staff-lines group restored; abcjs's
  element-group attributes; **abcjs's nine-attribute `<text>`** with its `<tspan>`.
- **The title is not bold.** See §3.

**TWO CORRECTIONS, both worth keeping:**

1. A "~31px vertical origin difference, a real defect no pixel gate could see" was recorded
   and was **wrong**. Heights matched to the byte and our top line was already at 36.642.
   abcjs writes staff lines top-down and we wrote them bottom-up, so comparing the FIRST
   path of each engine compared **different lines**. Measure the output — and be sure it is
   the same thing being measured.
2. "abcjs has no staff-lines group" was **wrong** too: it groups them with or without
   `add_classes`. Removing that group was right about the TRANSFORM and wrong about the
   GROUP.

---

## 3. THE TITLE WAS BOLD, AND NO GATE COULD HAVE SEEN IT

abcjs's default `titlefont` is `{face: "Times New Roman", size: 20, weight: "normal"}`
(`abc_parse_directive.js:38`) and its SVG writes `font-weight="normal"`. We drew every title
bold.

**The pixel tables compare POSITIONS, and the golden width tables `calcWidth` measures with
are keyed by font SIZE alone** — a bold title and a normal one measure the same and land in
the same place. It took a byte comparison, where `font-weight` is an ATTRIBUTE rather than a
consequence. **Fourth axis to turn out unrepresented**, after the line weights, the
decoration x and the DOM contract.

Twelve baselines moved; every moved row is a title losing `bold`, no position changed.

---

## 4. THE TITLE'S CENTRE — A REAL DEFECT, **NOT FIXED**, AND THE ATTEMPT IS RECORDED

abcjs centres the title on the **PAPER**: `x="350"` on a 700px page. The rule is already
written down in `ScoreMetadata`'s own comment — *"`%%center` centres on the STAFF width —
335, not the paper's 350 the title uses."* We emit **x=123.0809** for
`X:1\nT:T\nL:1/4\nM:4/4\nK:C\nCDEF|`, which is neither.

**No pixel gate compares text POSITION** — they pair noteheads — so this has been wrong on
every titled tune.

**WHAT WAS TRIED AND WHY IT IS NOT COMMITTED.** `topTextBlock` is called once, at
`layout.ts:7493`, with `systemWidth - ENGRAVE.marginX * 2`, and centres its title on
`width / 2` (`:8223`). Changing that argument to `systemWidth + ENGRAVE.marginX * 2` — which
by the arithmetic should give 45.16 staff spaces, exactly abcjs's 350px — **changed the
output not at all**. So the width reaching that call is not what it appears to be, and a
change I cannot explain is worse than no change: it was reverted.

**MEASURED, so the next session starts from facts rather than from my reading:**

```
layout(score, { mode: 'abcjs-strict', systemWidth: 670 / 7.75 })
  doc.width   33.10353548387097     (the tune's NATURAL width, not the page)
  doc.top     -1.935483870967742
  title x     15.881406451612905    anchor "middle"   → 123.0809px
abcjs                                                  → 350px
```

`15.8814 * 2 = 31.7628`, so the width that call actually centred on was 31.7628 staff
spaces — neither `systemWidth` (86.45), nor `systemWidth - 2 * marginX` (82.58), nor the
paper (90.32). **Find where 31.7628 comes from and the fix is one line.** Start by printing
`width` inside `topTextBlock`; do not reason about it from the call site, which is what cost
this attempt.

---

## WHAT IS LEFT

1. **The title's centre** — §4, with the measurement.
2. **The byte table's next rows**, in order: the two-decimal rounding rule for a `<text>`'s
   `x`/`y` (unmeasured); `height="292.14200000000005"` against `292.142`, which is arithmetic
   ORDER and not formatting (abcjs writes `1081.3299999999997` elsewhere, so rounding fixes
   one and breaks the other); curves, beams and glyph path formatting; per-glyph `data-name`.
3. **The DOM contract**, 86 of 694 rows — the per-glyph `data-name` and `abcjs-meta-top`.
4. **`oneSvgPerLine` / `responsive` / `scale`** — five cases in `svg-per-line.test.js`
   assert an `<svg>` COUNT under options compat does not implement at all.
5. **`el-four-endings`** — `|1,3 … :|2,4 …`, where abcjs's own `duplicateSpan` iterates to an
   `undefined` end and emits nothing. Closing it is a DECISION, not a bug fix.
6. **The geometry half of the timing join** — `left`, `endX`, `top`, `height` on every
   `noteTimings` row, and abcjs's own suite asserts none of them. A gate to BUILD.
7. **The structural pass** — terms in `CHECKPOINT-2026-08-08d.md`, not to be re-argued.

---

## RE-VERIFIED AT THIS COMMIT

```
working tree clean
npx tsc --noEmit    clean
npx vitest run      1127 / 1127
svg bytes           171 of 171   best 651, median 162
audio ranked        0 of 72
timing ranked       0 of 38
element timings     1 of 13
chord-grid ranked   0 of 23
midi ranked         0 of 3       BYTE-EXACT
harvested ranked    0 of 174
pixel ranked        0 of 120
DOM contract        25 of 25     (86 of 694 rows)
npx biome check src NOT clean — same rows as before, all pre-existing
```

**RUN EVERYTHING FROM `/Users/lrettberg/ICMLabs/Code/abcts`.**
