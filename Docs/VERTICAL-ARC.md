# The vertical arc — opened, not finished

`geometry/horizontal` is CLOSED and GREEN at 505/505 (see
`CHECKPOINT-2026-08-02b.md`). This is the next arc, on `geometry/vertical`, and it starts
RED on purpose — for the same reason the horizontal one did, and by the same rule: four
recorded ceilings would have to be RAISED to land the first fix on the green branch, and
raising a ceiling to make a change pass is the one thing the contract forbids.

Everything below was read out of abcjs by INSTRUMENTING IT.

---

## Where the corpus stands

| axis | median | at ZERO | state |
|---|---|---|---|
| dx spread | +0.01 | 22/29 | horizontal arc CLOSED |
| ox offset | −0.00 | 22/29 | horizontal arc CLOSED |
| dy spread | +0.01 | 21/29 | this arc |
| oy offset | **+0.025** | **18/29** | this arc |
| ALL FOUR at zero | — | **14/29** | — |

Fourteen fixtures now match abcjs on every axis at once. At the start of this session it
was three, and dx/ox were zero on eight.

---

## THE FINDING: abcjs reserves DECLARED boxes, not ink

Nothing at the edge of a staff is measured by what it paints. abcjs hands each element a
`top` and `bottom` and reserves those, and they are routinely not the glyph's box.

| element | declared box | source |
|---|---|---|
| clef | `symbolHeightInPitches + clefPos + ofs` / `clefPos + ofs`, `ofs` = −5 G, −4 C and F, −2 perc | `create-clef.js:37,62-70` |
| time signature | `pitch ± thickness/2`, thickness = the glyph's height in pitches | `create-time-signature.js:25`, `relative-element.js:22` |
| key signature | `verticalPos + height + fudge` / `verticalPos + fudge`, fudge −3 sharp, −1.2 flat | `create-key-signature.js:17-25` |
| tempo | a FLAT 6 pitches, whatever the mark says | `elements/tempo-element.js:12-13` |

**THE CLEF IS WHAT SETS THE STAFF'S TOP** on any tune with nothing above the staff — not
the stems, which is the intuitive guess and is wrong. Probed on `simple-c`: `staff.top` is
raised to 13.7244 *by the clef* and by nothing else.

Two consequences worth keeping:

- A tiny declared-vs-ink difference moves the WHOLE DRAWING. The clef's was 0.0235 of a
  staff space and it put eight fixtures a uniform 0.184px high, staff lines and noteheads
  alike — so a constant offset like that is NOT a glyph question, and checking the staff
  line is how you tell.
- The tempo's flat 6 pitches is the largest single term: six fixtures, all of them with a
  `Q:`, each sitting 6.89–6.94px low on every staff while their staff-TO-staff spacing was
  already exact. A rigid offset with correct internal spacing points at the header stack,
  not at the music.

---

## What is open

### The four partners, unfound

A right change can make the corpus worse; look for its partner rather than reverting.

- **`ragtime-nightingale`** oy 7.05 → 8.89. NOT the tempo. Probed: abcjs's first staff
  reaches `staff.top = 21.0` from the MUSIC's own ink *before* the tempo's 6 pitches go on
  top, and ours falls ~2px short of that 21. A beam or stem extent. Its dy is 58.1, so the
  vertical is this fixture's big term — start here.
- **`little swallow`** dy 5.35 → 6.13 and **`frere-jacques`** dy 22.15 → 22.35. Spreads,
  not offsets, so something inside the system rather than above it.
- **`center-text`** oy 10.15 → 10.32 — the clef's 0.18 landing on a fixture already 10px
  out for its own reason (`%%center`). Fix the 10 and this goes with it.

### Bigger, and not touched

`multi-voice-rest-collision` oy −13.93, `vree-slurs-and-triplets` oy −19.35,
`multi-voice-lyrics-two-voices` oy −7.55, `multi-voice-triplet-brackets` dy 14.09,
`vree-grace-notes` dy 11.65.

---

## The method

Unchanged, and it is what produced every line above:

```bash
# 1. env-guarded log in the vendored source (abcMusicKit is clean git, fully reversible)
#      Docs/References/abcjs/abcjs-6.6.3/src/write/…
#      if (process.env.ABCJS_PROBE) console.log('PROBE …')
cd Code/abcMusicKit/Tools/abcjs-debug
ABCJS_PROBE=1 node dump-svg.js --file fixtures/X.abc --output /tmp/x.svg | grep '^PROBE'
git -C ../.. checkout -- Docs/References/abcjs/ && git -C ../.. status --short
```

The probes that paid here: `Renderer.moveY`/`absolutemoveY`, which prints the page's whole
vertical cursor with a stack line saying who moved it; `VoiceElement.adjustRange`, which
says WHICH element raised the staff's top — that one is what found the clef in a single
run; and `incTop`, which prints the above-staff stack item by item.

Compare the STAFF LINE, not just the noteheads. A constant offset in both is placement; a
constant offset in the noteheads alone would be the glyph.
