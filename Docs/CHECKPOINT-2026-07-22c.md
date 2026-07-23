# abcts — Checkpoint, 2026-07-22 (late)

Supersedes `CHECKPOINT-2026-07-22b.md` — read this one, then `ARCHITECTURE.md`, then
`CLAUDE.md`. The `b` file's *method notes* still stand; its priority list is updated below.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only. Never raise a pixel-parity ceiling to pass.

---

## What closed this session

Three geometric milestones, all shipped, committed and pushed. **Structural gates stay at
100% (every axis, zero divergences); 499 tests.**

1. **Voice-name indent.** abcjs reserves horizontal space at the left of every system for
   `V:… name=` labels (`getLeftEdgeOfStaff`), shifting the staff and its notes right; we
   reserved none. `score-reorder-shared` sat dx-spread 0.0 (a "perfect" score) while
   translated ~100px left — the exact blind spot the offset axis was added to catch. The
   reservation is `width(widest label) + width("A")` in abcjs's own bold voicefont (its
   WebKit-calibrated `vocalfont` table, so the number equals the one baked into the
   goldens). `name=` on the first system, `subname=`/`sname=` on later ones.
   - `score-reorder` ox −106.3 → −15.6 · `score-reorder-shared` −97.8 → −15.6 ·
     `ave-verum` −59.4 → −23.7 · `brother-john` −50.0 → −19.8 · `zocharti` −47.2 → −15.7.
   - New file `src/renderer/voice-name-metrics.ts`; `Voice.name`/`.subname` in the model.

2. **`%%staffsep` / `%%sysstaffsep`.** `ragtime-nightingale` — the amplifier, 23 two-staff
   systems — drifted ~950px UP over the tune because we dropped these directives. abcjs
   reads them in points and scales ×4/3 to pixel line-to-line minimums
   (`renderer.js:148,160`): `staffsep 90` → 120px between systems, `sysstaffsep 50` →
   66.67px within one. Applying them, the inter-system pitch now lands on abcjs's exactly
   (151.0px top-to-top = 120 + the 31px staff height). **`ragtime-nightingale` 335.5 →
   42.3px.** `Score.staffSep`/`.sysStaffSep` (pixels).

3. **Geometry axis wired into `npm run parity`.** The report printed four structural axes
   at 100% and omitted the open one. It now prints fixtures-within-25/50/100px, the corpus
   median, and the six worst fixtures, from `/tmp/abcts-parity-pixel.json`.

### The numbers moved

| | before | after |
|---|---|---|
| Corpus median notehead distance | 32.6px | **24.2px** |
| Within 25 / 50 / 100px | 11 / 21 / 24 | **16 / 26 / 26** of 29 |

Best unchanged (`vree-grace-notes` 8.9). Worst now: `frere-jacques` 244, `center-text`
127.8, `multi-voice-lyrics-two-voices` 118.4, `full-song-template` 47.9,
`ragtime-nightingale` 42.3, `multi-voice-rest-collision` 40.3.

---

## Next, in priority order — with the diagnosis each already has

1. **`frere-jacques` 244px — HARD, and it fights the line-breaking model.** abcjs draws it
   as **4 systems**; we draw **2** (one per source music line, per the model the last
   session settled: one source line = one system, no wrapping). Measured: each 4-measure
   source line (23 and 26) is WRAPPED by abcjs into two 2-measure systems — golden
   top-lines at y 196.8 / 289.1 / 389.2 / 534.4, 45 heads split 8 / … across four. So abcjs
   DOES wrap here, which contradicts "abcjs has no line-breaking pass." Resolve that
   contradiction before touching it — the likely truth is that abcjs wraps a line only when
   it overflows the page (these lines are eighth-notes under lyrics, so they are wide), and
   the earlier "no line-breaking" finding held only because no other corpus line overflows.
   Reintroducing a width-based wrap risks the very fixtures that finding fixed
   (`twinkle`, `chord-grid`, the whole horizontal collapse). High risk; measure first.

2. **`center-text` 127.8px — needs `%%center`, and it is BOTH axes.** `oy −25.4` (the top
   `%%center` line pushes abcjs's music down; we don't render it, so we sit high) and
   `dx-spread 219.3 / ox −125.2` (abcjs JUSTIFIES the single music line because the trailing
   `%%center` makes it not the last line; our last-system rule leaves it ragged). Fix is a
   feature: parse `%%center` free-text with its position, render it centred and reserve its
   height, and treat a music system with trailing text as non-last for justification. Only
   `center-text` uses it in the corpus, so the blast radius is small.

3. **`multi-voice-lyrics-two-voices` 118px** — multi-voice with lyrics; vertical. Not yet
   diagnosed this session.

4. **`ragtime-nightingale`'s residual 42px — the intra-staff term.** The inter-system pitch
   is exact now; what is left is that our intra-staff gap runs ~15px wider than abcjs's
   (golden 97.7 top-to-top constant, ours 103–124, content-driven). abcjs's `sysstaffsep`
   minimum (66.67px) BINDS every system because its inter-staff content fits inside it;
   ours does not, so our content extent between the two staves drives the gap wider.
   Chase our `verticalExtent` over-measurement between staves (the `!<!` crescendos and
   downward stems are the suspects). Small, low-risk, finishes ragtime.

---

## Method notes — new this session

The `b`, 07-21 and 07-22 notes still apply. New:

1. **A pure translation shows up as OFFSET, and only offset.** The voice-name fixtures had
   dx-spread 0.0 and were still ~100px out. Read `ox`/`oy`, not just the spreads — this is
   why they exist.
2. **The golden generator IS the abcjs oracle for text metrics.** Voice-name widths came
   from `abcMusicKit/Tools/abcjs-debug/dump-elements-char-widths.js` (`vocalfont`), the
   WebKit-calibrated table the goldens were MADE with, not from a font file — so the
   reservation equals the baked-in one exactly. When a number must match a golden, look for
   the constant that MADE the golden before measuring a substitute.
3. **Decompose an accumulating error by its PER-STEP pitch, not its total.** ragtime's
   335px median said nothing; its top-line-to-top-line pitch, alternating a clean
   intra/inter pattern, said everything — one term exact after the fix, one still off.
4. **Directives can be the whole bug.** Two dropped `%%` lines were the entire ragtime
   vertical drift. Before modelling a spacing discrepancy, grep the fixture for a directive
   that sets it — abcjs honours far more of them than a default-only engine reproduces.
5. **A "no line-breaking" finding is only as broad as the corpus that tested it.**
   `frere-jacques` wraps in abcjs; the model that says it cannot is right for every line
   that fits the page and wrong for the one that does not. Re-check a model against its
   counterexample before extending it.

---

## Confirm your lane before structural work — `Code/` vs `Code-v2/` vs `Code-1.9/`.
