# CHECKPOINT — 2026-08-18

The session that took the API surface from 12 absent to 7, and found four ENGINE bugs no
byte gate could have found — because every one of them needs text that was EDITED.

Read `HANDOFF-2026-08-18.md` for where things stand and what to do next; this file is the
why, with the measurements that decided each answer.

---

## 1. THE EDITOR IS A GATE, NOT JUST A SURFACE

`Editor` and `EditArea` are ports of `edit/abc_editor.js` and `edit/abc_editarea.js` — a
textarea, a 300ms debounce, and a selection driven both ways. That much was expected.

**What was not expected is what the gate FOUND.** It drives fourteen steps of a session at
the keyboard, and four of those steps render text that no fixture in either corpus
contains: the fixture with a line appended, the fixture with a character typed after a
pause, the fixture re-rendered at `staffwidth` 300. Four engine bugs fell out, in a family:

> **A VOICE THAT RUNS OUT OF MEASURES USED TO END THE TUNE.**

| What was dropped | Where it was decided | Cost |
|---|---|---|
| A mid-tune `T:` or `%%text` block | drawn on voice 0, and voice 0's staff was gone | a whole subtitle, 587 bytes |
| The brace over the remaining staff | connectors read the DECLARED staff list | one brace per system |
| The system's bar number | moved within a voice's own measures, then DELETED | one `%%barnumbers` row |
| Every line after the voice's last | `tune.lines` took its breaks from voice 0 | `getElementFromChar`, `deline`, selectables, timings |

Each is a one-line predicate in abcjs and each was measured before it was written:

- **The block rides the FIRST VOICE STILL ON THE SYSTEM.** `voicesHere` already dropped a
  staff whose voice had run out — that rule is `cleanUp`'s (`tune-builder.js:33-60`) and was
  ported long ago; the block just was not moved with it.
- **A DANGLING `end` OPENS A CONNECTOR OF ITS OWN**: `abcstaff.brace === "start" ||
  (!staffgroup.brace && abcstaff.brace)` (`abstract-engraver.js:189`), and `drawBrace` falls
  back from `endVoice` to `lastContinuedVoice` to `startVoice` (`draw/brace.js:8-14`). So
  `%%staves {(A B) (C)}` with only C left braces the single staff.
- **A trailing bar number goes to the next LINE OF THE TUNE**, `nextLine.staff[0].barNumber`
  (`tune-builder.js:139-144`), where `staff[0]` is whatever survived the filtering.
- **`tune.lines`'s breaks are every voice's.** The union, and the last line runs to the
  longest voice.

⚠️ **`StaffConnector` is `| null`, not `| undefined`.** The first cut of the connector chain
skipped only `undefined`, so a `null` marker opened a bogus connector: 85 tests and 31 byte
fixtures red in one run. The types said so and the port did not.

### `rangeHighlight` — the join is the MARKUP

abcjs keeps the SVG node on the absolute element (`draw/absolute.js:57`) and paints that one
node. We emit a STRING, so the drawing now records each element group's `data-name` and its
ordinal among groups of that name (`DrawnElement`), and the highlight finds it again with
`querySelectorAll`. Measured in jsdom BEFORE a line was written:

    <g fill="currentColor" … data-name="note" …>   →   fill="#ff0000" class="abcjs-note_selected"
    cleared                                         →   fill="currentColor" class=""

— an EMPTY class attribute, still present, which is `String.replace` writing its result
back (`helpers/set-class.js`). Our first render of the same three states came out
character-identical to abcjs's.

**And a MID-TUNE CLEF OWNS CHARACTERS**: `appendStartingElement('clef', startChar, endChar,
…)` (`abc_parse_header.js:508-509`), so selecting a `K:C clef=treble+8` line paints the clef
abcjs draws at the END of the previous system, while the one reprinted at the head of the
next owns nothing. `visual-selection-03` says `start 37, end 54` — exactly that field.

---

## 2. `makeVoicesArray` — 1,902 of 4,208 ROWS, THEN 4,151

The gate compares ten columns per row, in drawing order, over every in-repo fixture. Four
mechanisms took it from 1,902 to 4,151, and each was a measurement rather than a guess:

1. **PROSE IS NOT A VOICE CHILD.** Ours puts a title in the same element stream; abcjs keeps
   it in `tune.lines`. Fifty tunes had a different ROW COUNT for it. The whitelist is
   abcjs's own eight element builders.
2. **`noteFound` IS PER SYSTEM AND THE COUNT IS NOT** (`data/abc_tune.js:414`) — a barline at
   the head of a line does not count, while the measure number carries on from the line
   above. 183 rows numbered one too high.
3. **A BARLINE'S `w` IS DECLARED, NOT DRAWN**: 1 where the rect is 0.6, and 4/8/14/16/22 for
   the other kinds. Carried as `LayoutElement.minWidth`, set where `barWidthOf` is spent.
4. **`duration` IS `durationForSpacing`** (`abstract-engraver.js:802-806`), which equals
   `durationClass` everywhere INCLUDING tuplets — `(3ABc` reports 1/12 twice — and parts
   company on a `Z4`: SPACED as one measure, CLASSED as four.

And the mid-tune fields' characters, which the same walk exposed: an inline `[K:]`, a
trailing cautionary `K:` and an inline `[M:]` each own their field's span, while **a
STANDALONE `M:` LINE OWNS NOTHING** — abcjs sets that one on the staff and only an inline one
is appended to the stream. Twelve rows of `synth-flattener-38` say so.

---

## 3. `deline` — 1,558 → 1,566, AND THE TWO PARSER FIELDS THAT DID NOT EXIST

- **`style`**: `createVoice` opens every voice of every line with one once a `style=` has
  been seen at all (`tune-builder.js:971-972`), reading `multilineVars.style` AS THE LINE
  OPENED. Ours tracked the style for the noteheads it draws and never put the element in the
  stream. It is read where `startNewLine` FIRES — the same lazy line start
  `styleForNextLine` was already built on.
- **`font`**: `setRunningFont` seeds all four changing fonts the moment the header ends
  (`abc_parse.js:556-561`), and `setLineFont` hangs one on a line's STAFF only when it
  differs from the running one (`tune-builder.js:948-962`). So a header font is on no line
  and each later change is on exactly one. `visual-tablature-17` sets `%%gchordfont` five
  times, once per line.

⚠️ The staff gets a COPY of the font object: `deline` writes `el_type` onto that very object,
the way abcjs does, and our parse tree is FROZEN.

---

## 4. THE TIE THAT LEAVES THE SYSTEM — `TimingCallbacks` CLOSED

abcjs splits a tie crossing a break in two and puts BOTH halves on their voice's
`otherchildren`. The outgoing half has a null `anchor2`, so `calcTieY` falls to `startY =
endY = anchor1.pitch` and `getYBounds` takes its flat 3 off that (`tie-element.js:203-206`,
`:240-252`) — and it is THAT box, not the ink box `setEndAnchor` builds, which
`setUpperAndLowerVoiceElements` mins into `voice.staff.bottom`
(`layout/set-upper-and-lower-elements.js:140-146`).

Measured on `synth-timing-10-stretchlast-1`: abcjs reports that system's `staff.bottom` as
**-2** where its VOICE's is **-1.0493**, and `1 - 3` is exactly the difference. One reserve,
and:

- `TimingCallbacks` closed — **4,696 of 4,696**, from 4,674;
- `setupEvents` 3,339 → **3,345 of 3,366**, and its remaining 21 rows are now ONE mechanism.

⚠️ It moved a VISUAL BASELINE, which is ours and not an oracle: `S7-voices` grew 7.578px.
Checked against LIVE abcjs rather than re-recorded on faith — abcjs renders that tune
370.7945 tall and we now say 370.795, where the old baseline said 363.217. That fixture is
the one excluded from the byte gate for a STALE golden, which is why nothing caught it
either way.

---

## 5. WHAT THE OVERLAY QUESTION ACTUALLY IS

Every remaining `setupEvents` row and the one open `makeVoicesArray` tune are the same
thing, and the rule is now read rather than inferred (`tune-builder.js`, `resolveOverlays`):

> On the FIRST `&` in a voice, abcjs walks every EARLIER LINE (`for (ii = 0; ii < i; ii++)`)
> and pushes a new voice built of INVISIBLE-REST COPIES of that line's own events — each
> carrying the ORIGINAL's `startChar`/`endChar` — plus its barlines. Within the line, the
> overlay voice starts AT THE `&`.

Ours pads every measure of the tune with ONE invisible rest of the measure's duration. So a
row's `startCharArray` reads `[82, 82, 82]` where abcjs reads `[82, 85]`: same count of
voices, different provenance. Closing it is a change to how the AUDIO path builds layers
(`timing.ts`'s `layered`, and `padOverlays` behind it), which is why it is a model question
and not a patch — the audio gate it would move is at 0 of 72.
