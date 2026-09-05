---
title: Plan — landing the ABCJS-DEBT §3b improvements without touching byte parity
status: EXECUTED 2026-09-04 — all five phases run; two landed, two measured-not-defects
supersedes: nothing
---

# ✅ OUTCOME, 2026-09-04

| # | Phase | Result |
|---|---|---|
| 0 | Non-strict gate | **LANDED** (`db2d61e`). 691 digests + two guards; a `+0.0001` probe takes it red on 88 rows. |
| 1 | Size cache | **LANDED** (`de12139`), and bigger than planned — `extended` had no live measurer at all. |
| 2 | Falsy-zero | **PART LANDED** (`9507179`). Clef edge and lyric height fixed; the stem site measured UNREACHABLE and reverted. |
| 3 | `"A"` probe | **NOT A DEFECT.** `getBBox().height` is the LINE BOX, so measuring the row gives the identical answer. Written, measured, reverted. |
| 4 | Vendor prefixes | **NOT REACHABLE.** They live in compat's root markup, which is strict by construction; the non-strict root has no CSS transform. Written, measured, reverted. |

**Two of the four "improvements" were not improvements**, and both claims had been reasoned
from abcjs's source rather than measured — the same class of error this repo has recorded
four times as *a note that names a cause is the reason the row stops being read*. The
refutations are in `ABCJS-DEBT.md` §3b.2 and §3b.4 and in `zzextended.mjs` rung 4, so
neither can quietly come back.

**Strict never moved.** `zzlive` 0 of 685 WebKit, `svg-bytes` 685/685 and 356/356, four
ladders at zero, suite 2,456, at every phase boundary.

⭐ **AND THE LESSON THE PLAN ITSELF GOT WRONG:** it ordered Phase 3 last and called it *"the
highest risk in this plan — it moves every text block's height in extended, which moves every
page."* It moves nothing. The risk was estimated from the reach of the code rather than from
a measurement, which is the same mistake as sizing the cache arc at 51 call sites.

---


# Landing §3b without jeopardising byte parity

`Docs/ABCJS-DEBT.md` §3b lists four things abcjs does badly that abcts now reproduces
deliberately, because the browser-parity arc closed on reproducing them. This is the plan
for doing them properly **without a single strict byte moving.**

## The governing constraint, and why it makes this tractable

**Every improvement here is a NON-STRICT change.** This engine already has the split the
work needs:

    abcjs-strict   reproduce abcjs, bugs included — the DEFAULT, and byte-equal to 6.7.0
    abcjs-extended         the standard read correctly
    extended       parity+

`isStrict(options.mode)` is resolved once at the layout entry (`layout.ts:13072`) and
threaded to 221 sites; `STRICT_TEXT_METRICS = strict` at `:13142` is the precedent this plan
copies four more times. **Nothing below changes what strict emits.** The rule from
`CLAUDE.md` stands unaltered: a strict divergence is a defect, not a tolerance.

⚠️ **THE INVARIANT, AND IT IS THE WHOLE SAFETY ARGUMENT: NO STRICT BASELINE MAY MOVE.** If
one does, that is a behaviour change — revert it, do not re-record it. Same terms the
deferred optimisation pass was held to (`CHECKPOINT-2026-08-08d.md`).

## ⚠️ PHASE 0 IS NOT OPTIONAL — THE NON-STRICT PATH HAS ALMOST NO GATE

Measured 2026-09-03: **three test files** reference a non-strict mode at all
(`lyric-continuation`, `optimize-svg`, `renderer/layout`). Every corpus gate in this repo —
`svg-bytes` 685, `svg-bytes-sibling` 356, `zzlive`, all four control ladders, the pixel and
harvested tables — renders **strict**.

So today: a non-strict change is unproven when written and unprotected afterwards. Four
improvements landed onto that would be four untested behaviours, and the first regression
would surface as a user's bug report.

**Phase 0 — build the non-strict gate before touching anything.**

1. A `RATCHET` snapshot of `extended` output over the same 691 cases: not "matches abcjs",
   which is the wrong question for this mode, but **"has not changed since recorded"**. The
   `svg-bytes` ratchet is the shape to copy — it names every exact slug rather than counting.
2. A ladder of controls per item, written BEFORE the code, as `zzcontrol` has been for
   `size`/`dirs`/`tempo`/`lyricfont`. Each rung varies one thing and asserts the IMPROVED
   behaviour, so the item is proven and not just observed.
3. Both wired into `npm test`, so the next agent inherits them.

**Exit criterion:** the extended ratchet is green over 691 cases and a deliberate one-line
regression is shown to take it red. A ratchet nobody has seen fail is not a ratchet.

---

## Phase 1 — the size cache (§3b.1). Highest value, and the code already exists

**What abcjs does:** `var sizeCache = {}` at module scope, keyed `text + JSON.stringify(attr)`
with **no x**, consulted **before** the drawn element (`svg.js:306`, `:316-325`). Its output
for a tune therefore depends on what was rendered before it in the same page, the cache is
unbounded, and it discards the x-corrected tempo measurement one line after making it.

**What extended should do:** what this repo did until `97613c6` — a **per-render cache keyed
WITH the x**. That is not a design exercise: it is `git show 15ec0d2:src/renderer/text-measure.ts`,
which passed every gate for a day.

**Where the gate goes:** `text-measure.ts` is mode-blind today. Give `setTextMeasurer` a mode
argument, or hand `createDomTextMeasurer` a `{ shared: boolean }` — one branch, at the
cache key and its lifetime. `compat/index.ts`'s `withLiveTextMetrics` is the only caller.

**Value:** a host rendering a tunebook gets the same SVG for a tune wherever it sits in the
page. That is the single most user-visible item in §3b.

**Risk:** low. The behaviour is written, was proven, and is reverted rather than invented.

**Check:** strict — `zzlive` 0 of 685 WebKit, `svg-bytes` 685/685 + 356/356. Extended — a
new `zzwarm`-style control asserting a tune renders identically at position 1 and position 40
of a page, which is the property abcjs cannot satisfy and this exists to give.

---

## Phase 2 — whitespace measures zero, and zero means "4 pitch" (§3b.3)

**What abcjs does:** two shortcuts that meet.

    if (!text || text.match(/^\s+$/)) return { width: 0, height: 0 };   svg.js:311-312
    this.height = opt.height ? opt.height : 4;                          relative-element.js:36

A held syllable's `lyricStr` is `"\n"` → measures zero → zero is FALSY → the element takes a
magic 4-pitch default. The lyric lane is a max over children, so that default silently
becomes the floor for every `%%vocalfont` under 13pt.

**What extended should do:** an empty row reserves its font's **line height**, and a
legitimate zero is not confused with an absent value. This is the third appearance of the
falsy-zero bug in the ledger (`if (opt.bottom)` is the other two), so fix the CLASS: a
helper that distinguishes "measured zero" from "not measured" and is used at all three.

**Where the gate goes:** `layout.ts`'s `ENGRAVE.lyricEmptyLanePitch` branch, added
2026-09-03 and already commented with the full citation.

**Value:** real engraving. Small vocal fonts currently reserve a lane four pitch deep for a
syllable that draws nothing.

**Risk:** low, and contained to one lane.

**Check:** extend `zzcontrol lyricfont` with extended-mode rungs across the same size ladder
that named the strict rule — 8, 9, 10, 11, 13, 20pt with and without the `_`.

---

## Phase 3 — a text row advances on the probe `"A"` (§3b.2)

**What abcjs does:** `addTextIf` measures `getTextSize.calc("A", params.font, params.klass)`
and multiplies by the line count (`add-text-if.js:21-27`); `richText`'s empty arm measures
`"i"` (`rich-text.js:4`). Its own comment says why — *"if there are blank lines they won't be
counted by getTextSize, so just get the height of one line and multiply"* — which is a
workaround for the whitespace early-out in Phase 2, not a typographic choice. A row of
descenders advances by the same amount as a row of capitals.

**What extended should do:** measure the row. `Subtitle` already does
(`subtitle.js:8`) and is the one row here whose advance is its own string, so the target
shape exists in abcjs itself.

**Where the gate goes:** `rowProbe` in the bottom block and `advance`'s `text` default in the
top block — both added 2026-09-02 and both already carry the citation.

**⚠️ ORDER MATTERS: this phase depends on Phase 2.** The probe exists *because* whitespace
measures zero. Doing it first means measuring rows that answer zero and reintroducing the
same falsy-zero hole one layer up.

**Value:** every multi-line text block in the app — `W:`, `H:`, `N:`, titles — advances by a
typographically wrong amount today.

**Risk:** **the highest in this plan.** It moves every text block's height in extended, which
moves every page. Do it with the Phase 0 ratchet in place and read the diff row by row; a
change of this reach with no ratchet is how the arc lost a day in August.

**Check:** the extended ratchet, read rather than counted, plus a control ladder over rows
that do and do not carry descenders.

---

## Phase 4 — dead vendor prefixes (§3b.4). Trivial, do it last

**What abcjs does:** `setScale` assigns eight style properties (`svg.js:71-83`), of which the
`-ms-` pair and the two `-webkit-transform-origin-*` are dead in every browser it supports.
We set the same eight through the DOM (`compat/index.ts`'s `restyleScale`) so the browser
serialises its own answer.

**What extended should do:** `transform` and `transform-origin`, once, as text — no DOM
round-trip, no browser-dependent serialisation.

**Value:** small. It is here for completeness and because it is the one item with no
engraving consequence at all.

**Risk:** none to geometry. Note that extended already emits `<defs>`/`<use>`, so its markup
is not abcjs-shaped anyway and this is consistent with that.

**Check:** the extended ratchet; no browser needed.

---

## The order, and why it is that order

| # | Item | Value | Risk | Depends on |
|---|---|---|---|---|
| 0 | **The non-strict gate** | — | — | — |
| 1 | Size cache | highest | low | 0 |
| 2 | Whitespace → 4 pitch | medium | low | 0 |
| 3 | Probe `"A"` advance | medium | **high** | 0, **2** |
| 4 | Vendor prefixes | low | none | 0 |

Phase 1 first because the correct code already exists and passed every gate — it is the
cheapest way to prove Phase 0's ratchet actually holds something. Phase 3 last of the real
ones because it moves every page in extended and because it is meaningless before Phase 2.

## What every phase does at its end

1. **Strict unchanged, proven, not assumed:** `zzlive` 0 of 685 WebKit, `svg-bytes` 685/685
   and 356/356, `zzcontrol` `dirs`/`tempo`/`lyricfont`/`size` all at zero, suite green.
2. **The extended ratchet re-recorded with the diff READ**, and the reason for every moved
   row stated in the commit. A new behaviour only ADDS; removals mean something broke.
3. **The `ABCJS-DEBT.md` entry deleted and an `ABCJS-DIFFERENCES.md` entry written**, with
   how it was checked — that is the repo's own rule for anything abcts declines to
   reproduce, and these become exactly that.
4. **The `zzcontrol` ladder kept in the repo**, not in a scratchpad. `/tmp` is cleaned and
   it has cost this arc a session once already.

## What this plan does NOT do

- **It does not touch strict.** Not one byte, not one constant, not one association.
- **It does not open Chrome.** The four Chrome rows on the board are a strict-parity
  question and belong to the browser arc, not here.
- **It does not refactor `layout.ts`.** That is a separate question with its own recorded
  terms (`CHECKPOINT-2026-08-08d.md`), and mixing it into a behaviour change would make both
  unreviewable.
