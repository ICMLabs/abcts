# CHECKPOINT — 2026-08-12

**abcts, `main`.** `npx tsc --noEmit` is clean and everything below is committed.
The suite is **1275/1276 with ONE red, and the red is NOT OURS** — see §5, which has to be
read before anything else in this file is trusted, because I reported that gate green twice
on stale runs before finding out what it was.

---

## 1. THE STATE

| Gate | Ranked table | Now | Session start |
|---|---|---|---|
| Audio events | `abcts-audio-ranked` | **0 of 72** | 0 of 72 |
| Note timings | `abcts-timing-ranked` | **0 of 38** | 0 of 38 |
| Chord grids | `abcts-chordgrid-ranked` | **0 of 23** | 0 of 23 |
| MIDI files | — | **0 of 3** | 0 of 3 |
| Harvested geometry | `abcts-corpus-ranked` | **0 of 174** | 0 of 174 |
| Pixel targets | `abcts-pixel-ranked` | **0 of 120** | 0 of 120 |
| Element timings | — | 1 of 13 (abcjs's own quirk, NAMED) | 1 of 13 |
| DOM contract | — | **1 of 25**, 24 slugs RATCHETED | 1 of 25 |
| **SVG bytes** | **`abcts-svg-bytes-ranked`** | **41 of 171**, best 200613 | 49 of 171 |

`DIVERGENT` is still EMPTY. **130 fixtures are byte-exact and all 130 are RATCHETED.**

---

## 2. THE LANDINGS

Five, and the shape of the session is that **three of the five were found by a fixture that
had nothing to do with what they were about.** The bar-number arc in particular is three
rules stacked, each invisible until the one before it closed.

### 2.1 A STANDALONE `M:` ON THE TUNE'S FIRST MEASURE BELONGS TO THAT LINE'S PREFIX

    X: 1
    L: 1/4
    M: 4/4
    K:C
    M:2/4
    "C"zz|"D"z"E"z|

abcjs draws the **2**; we drew the header's **4**.

`startNewLine` fires LAZILY — when the first music element is appended — so a standalone
`M:` written before any music reaches the NEXT line's prefix. That is finding 121 and it is
why `meterChangeLeadsLine` deliberately fires only on the INLINE form. **On the FIRST
measure there is no next line, so it reaches its own.**

`meterLeadsFirstMeasure` is the standalone twin: a system-starting first measure whose
`meterChangeSourceRange` precedes every event of it. Wired into the prefix and into
`drawMeterChange`'s suppression, through a new `isFirstMeasure` parameter on
`layoutMeasure`.

### 2.2 A BAR NUMBER WEARS `measurefont`'S WEIGHT AND STYLE

Both were hard coded to abcjs's own default — `{ face: "Times New Roman", size: 14, weight:
"normal", style: "italic" }` (`abc_parse_directive.js:26`) — which is right until a tune
writes `%%barlabelfont Times-Bold 18 box`. Then the SIZE moved and the style did not,
because only the size was ever read from the score. The parser had it correct all along;
`layoutBarNumber` simply never asked.

### 2.3 A BOXED FONT IS MEASURED FOUR PADDINGS WIDER **AND** TALLER

`getTextSize.calc` ends

    if (hash.font.box)
        return { height: size.height + hash.font.padding * 4,
                 width:  size.width  + hash.font.padding * 4 }

(`helpers/get-text-size.js:46-49`) — "padding and an equal margin to each side", where
`padding` is `font.size * fontboxpadding`, default 0.1.

`fontHeightOf` ALREADY did the height. `textWidth` is the raw glyph run and did not.
**Adding it to both double-counted and cost 9.06px of page**, which is how the split was
found — it is not a rule about "the box", it is a rule about two functions of which one
already obeyed it.

Instrumented through abcjs on the fixture: `w 26.6 h 35.6 pad 2.4`, against a `getBBox` of
17.0 × 26.0. Both axes carry the 9.6, once each.

The width matters TWICE: `addMeasureNumber` centres on it (`dx += measureNumDim.width / 2`)
and thresholds `vert` against it (`width > 10 && type === "treble" ? 13.5 : 11`). **So a
boxed bar number is centred on the BOX rather than on its digits** — and that threshold is
what surfaced the next one.

### 2.4 A BAR NUMBER ON A CLEF DOES NOT PUSH THE TOP

`_addChild` opens with an explicit exception:

    var okToPushTop = true;
    if ((this.abcelem.el_type == "clef") && (child.type == "barNumber")){
      okToPushTop = false;
    }

(`elements/absolute-element.js:184-189`) — its own comment reading *"To avoid extra space
for chords if there is only a bar number on the clef"*. It still pushes the BOTTOM, which
for a point that far above the staff can never win.

**It was invisible while the width was measured unboxed.** `%%measurefont Helvetica 7 box`
measures 8.5 raw and takes `vert` 11, which sits inside the clef's own extent, so the
unconditional push cost nothing. Boxed it measures 12.1, `vert` becomes 13.5 — abcjs's own
number, instrumented — and `visual-options-01-fonts`' second system dropped 9.69px. That
was the harvested table's only row, and it is why 2.2–2.4 are one commit and not three.

**AND "DOES NOT PUSH" HAD TO BE SAID, NOT LEFT OUT.** Deleting the `reserve` changed
nothing at all: an absent reserve falls back to `verticalExtent`'s ascent/descent estimate,
which pushes MORE. `reserve: [stepToY(4), y]` is the honest form — `stepToY(4)` is where the
extent starts, so it can never win. **The built-in `ABCTS_PROBE` named the real contributor
in one run** (`topBy=L12597` — the heading block, not the bar number) after a wrong guess
had already been implemented and measured to do nothing.

### 2.5 A CHORD'S TIE IS ONE TIE PER NOTEHEAD

`-` after a chord is

    case '-':
      el.pitches.forEach(function(pitch) { pitch.startTie = {}; });

(`abc_parse_music.js:427`), and `addSlursAndTies` runs once per pitch — so `[GB]8-` builds
**TWO** `TieElem`s (`abstract-engraver.js:873-905`). We built one, on `pitches[0]`, and
abcjs's golden for `parse-tie-slur-02` has the second sitting 7.75px above it with the
identical arc.

**A SLUR IS NOT LIKE THIS, AND THE TWO RULES LOOK ALIKE.** `(` is hung on `el.pitches[0]`
and on nothing else (`:508`), which is what `NoteAnchor.pitchY` already records. Both are
now stated at the field, because reading one as the other is how this survived.

The pairing is abcjs's own: an arriving head closes the open tie whose `anchor1.pitch`
MATCHES it, and an unmatched one closes `ties[0]`, the oldest still open
(`abstract-engraver.js:874-891`).

The reserve and the drawing fan out through the same `tiePairs`, so the extent sees every
arm — one derivation, not two. Three baselines moved and **the diff is PURE ADDITIONS with
no removals**, which is the shape a new feature has to have.

### 2.6 A NOTEHEAD'S `data-name` IS THE SOURCE SPELLING, AND IT IS NOT DERIVABLE

    el.name = line[index];
    if (el.accidental) el.name = accMap[el.accidental] + el.name;
    …
    case ',':  el.pitch -= 7; el.name += ',';
    case '\'': el.pitch += 7; el.name += "'";

(`abc_parse_music.js:1116-1147`) — the letter AS TYPED. **`c,` and `C` are the same note**
and abcjs keeps whichever the writer used; we canonicalised, so every `c,` in the corpus
came out `C` (`create-note-head.js:34`).

`writtenNote`'s own doc block said the pitch was enough — *"transposition rewrites the whole
string, which is why deriving it from the (already transposed) pitch reproduces it rather
than needing the source text."* The first half is true and **the conclusion does not
follow**: without a transpose there is no rewrite and the source spelling stands. Same shape
as the `G8` breve and the `extra-class` accent — **a note that names a cause is the reason
the row stops being read.**

The canonical form stays as the fallback, and it is ALSO what abcjs itself produces once
`%%transpose` HAS rewritten a name: `allPitches` runs `C,,,` to `b'''` in exactly that order
(`abc_transpose.js:170-176`, `all-notes.js:3-12`), which is the table `writtenNote` already
derives. Only the letter and marks are carried; the accidental prefix is abcjs's canonical
`accMap[el.accidental]` and was already right.

---

## 3. WHAT IS LEFT — MEASURED, NOT LANDED

### 3.1 A FORCED STEM DIRECTION IS PER **LINE**, NOT PER VOICE — 2 fixtures, fully measured

`visual-parsing-06` and `-07` (`%%score (T B)`, byte 10288 of 11592, the same tune):

    X: 360
    %%score (T B)
    [V:T]c|\
    [V:B]A|\
    [V:T]d|

Every element matches except the third note's flag: abcjs draws `flags.d8th`, we draw
`flags.u8th`. Instrumented — abcjs's own three voice streams are

    VOICE s 0 v 0 stream ["stem:up",  "note:c","bar"]
    VOICE s 0 v 1 stream ["stem:down","note:A","bar"]
    VOICE s 0 v 0 stream [            "note:d","bar"]

`createVoice` appends `{el_type:'stem', direction:'down'}` when `tune.voiceNum > 0` and
splices `up` onto `voices[0]` (`tune-builder.js:965-990`) — **on the line where that voice
opens.** `createABCVoice` then resets `this.stemdir = null` at the head of EVERY line
(`abstract-engraver.js:229`). The third `[V:T]` opens a new line on which the staff carries
ONE voice, so nothing is forced and `d` takes its natural down stem by pitch.

Ours is `stemForVoice(index)` — per voice, for the whole tune. The fix is to make it per
LINE, keyed on how many voices that line's staff carries. **Do not land it without
re-reading `ave-verum-corpus` and `ragtime-nightingale`**, whose vertical extents both
depend on the existing rule (see `stemForVoice`'s own doc block, which records 23.5px of
error from getting it wrong the other way).

### 3.2 THE STAFF-LINE ULP IS THE STAFF **BOTTOM** PITCH — 1 fixture, located to the digit

`visual-multi-voice-02`, byte 38733 of 48279: a staff line reads
`M 15 414.24 … 414.94` against abcjs's `M 15 414.23 … 414.94`.

Not the emitter — `printLine`'s two independently-rounded edges are already ported. The
centre is:

    abcjs   414.585              ours   414.58500000000004

and it comes from the page walk, where the second staff of the SECOND system diverges:

    abcjs   moveY 3.875 × 22.044387096774194 → 346.438
            moveY 3.875 ×  6.861935483870968 → 373.02799999999996
            moveY 3.875 × 20.724387096774194 → 453.335
    ours    261.016 + 0 + 85.422 + 26.590000000000003 + 80.307 → 453.33500000000004

The single differing term is the second: **abcjs's `staff.bottom` is
`-6.861935483870968` and our `extent.bottomPitch` is `-6.861935483870969`** — one ULP,
which `× 3.875` turns into `26.590000000000003` against abcjs's exact `26.59`. Note that
`26.59 / 3.875` gives abcjs's number EXACTLY, so here the DIVISION is right and our pitch
SUM is the one that is off — the opposite direction from the rest of that family, and worth
knowing before reaching for the usual fix. `staff.bottom` is built by
`set-upper-and-lower-elements.js:55-80` (`staff.bottom -= (lane + margin)`, then
`staff.bottom -= diff` per voice); start by instrumenting those terms.

### 3.3 THE REST OF THE TABLE

Read `/tmp/abcts-svg-bytes-ranked.txt` after `npx vitest run tests/svg-bytes.test.ts`.
The named structural rows, cheapest last:

- **`%%voicecolor` IS NOT IMPLEMENTED AT ALL** — `visual-layout-09-endings`, byte 1257 of
  38942, the earliest structural divergence left. `%%voicecolor blue` sets
  `multilineVars.currentVoice.color` (`abc_parse_directive.js:863-869`) and `drawVoice`
  swaps `renderer.foregroundColor` for the whole voice (`draw/voice.js:14-16`), so its
  notes, bars, endings, lines AND its `staff-extra` clef and key all come out `fill="blue"`.
  21 elements in that one golden.
- A GLISSANDO is a squiggly `<path>` where we draw a `<polygon>` (`visual-misc-04`,
  `draw/glissando.js`).
- `visual-misc-05` draws a `<text>` where abcjs draws a `<path>` for a `D.C. al coda` mark.
- `visual-misc-12`'s `!beambr1!` beam split.
- `flattener-37` emits `rests.half` where abcjs emits `dots.dot` — an element ORDER row.
- `visual-transpose-04`'s chord annotation is 20px high; `visual-decorations-01`'s
  `scripts.dfermata` 3.70px.
- `visual-tablature-*` — an acciaccatura slash, and `-20`'s missing note element.
- The `x.0000000000004` tail on `88.038`, `417.893`, `29.69`, `609.95…` — the same ULP
  family as §3.2 and probably the same cause.

---

## 4. THE RATCHET

`tests/svg-bytes.test.ts`'s `PASSING` names all 130 byte-exact fixtures. It caught nothing
this session, which is the point of it — every change here moved the count the right way
AND kept every ratcheted slug. Regenerate it with `/tmp/gp/exact.mjs`; never shrink it.

---

## 5. THE ONE RED IS NOT OURS — AND I CALLED IT GREEN TWICE

`tests/corpus/content-parity.test.ts` fails at 44 of 45:

    diff   S7-voices    ours= 371 abcjs= 371   content OK, OFFSET out of span

Every note matches; 40 of them start at the wrong SOURCE OFFSET. I bisected it to HEAD~1,
~2, ~3, ~4, ~6, ~9 and ~12 — all red — and only then looked at the input:

    ../abcMusicKit/Tools/abcjs-debug/fixtures/S7-voices.abc   modified 2026-08-12 10:54
    ../abcMusicKit/Tools/abcjs-debug/golden/S7-voices.parse.json   generated 2026-08-08

`git -C ../abcMusicKit diff` shows that fixture is **uncommitted-modified by the other
agent working in that repo**: chord durations respelled (`[C,3G,3]` → `[C,G,]3`), an em dash
turned into a hyphen, the trailing newline dropped. Same notes, different offsets — which is
exactly what the gate says. The goldens were generated from the COMMITTED fixture and have
not been regenerated.

**Nothing in abcts caused it and nothing in abcts can fix it**: the rule here is never to
write to `../abcMusicKit`. It clears itself the moment that fixture is committed and its
goldens regenerated, or reverted.

Two lessons, both mine:

- **I reported that gate green on stale runs.** The number came from a `/tmp` report file
  written by an earlier run, not from the run I was quoting. Read the exit status, not the
  artefact.
- **A BISECT THAT NEVER TURNS GREEN IS TELLING YOU THE CAUSE IS NOT IN THE HISTORY.** Four
  more commits of bisecting bought nothing that the first `ls -la` on the two inputs did not
  say immediately.

`tests/svg-bytes.test.ts` is unaffected — `S7-voices` is not in the harvested corpus the
byte table walks, and both other corpora are green.

---

## 6. THE HARNESS

Unchanged from `CHECKPOINT-2026-08-11b.md` §5, plus two things worth writing down:

**`walk.js` NEEDS `NODE_PATH`.** Running the scratchpad abcjs from this repo's directory
cannot resolve `jsdom`:

    NODE_PATH=../abcMusicKit/Tools/abcjs-debug/node_modules \
    ABCJS_PATH=/tmp/gp/abcjs \
    node /tmp/gp/walk.js --file tests/corpus-abcjs/fixtures/<slug>.abc

**AND `cd /tmp/gp` IS REFUSED IN THIS SANDBOX**, which silently resets the shell to the
WORKSPACE ROOT — where `npx vitest run` collects every sibling repo's tests and prints a
wall of unrelated failures. It bit twice today. Run everything from
`/Users/lrettberg/ICMLabs/Code/abcts` with absolute script paths, and if a suite reports
~160 test FILES, look at `pwd` before looking at the code.

**To render one fixture the way the byte gate does**, write a throwaway
`scripts/zzpr.ts` (it must live inside the repo — `tsx` will not resolve a script in `/tmp`
against these imports) and delete it before committing:

    import { readFileSync, writeFileSync } from 'node:fs'
    import { renderAbc } from '../src/compat/index.js'
    const abc = readFileSync(`tests/corpus-abcjs/fixtures/${process.env.ABCTS_FIX}.abc`, 'utf8')
    writeFileSync('/tmp/ours.svg', renderAbc('paper', abc, { staffwidth: 670 })[0]?.svg ?? '')

`ABCTS_PROBE=1` on that prints the staff extents WITH the contributing source line, which is
what §2.4 turned on. **vitest swallows `console.log`**, so a probe run has to go through
`tsx`, not through a test.

---

## 7. THE RULES THIS SESSION ADDED

- **A BISECT THAT NEVER TURNS GREEN MEANS THE CAUSE IS NOT IN THE HISTORY.** Check the
  INPUTS' timestamps before the third commit.
- **A GATE'S REPORT FILE IS NOT ITS RESULT.** `/tmp/abcts-*.txt` outlives the run.
- **"DOES NOT RESERVE" MUST BE SAID, NOT OMITTED** — an absent reserve falls back to an
  estimate that reserves more, so deleting one can be a no-op or a regression, never a
  removal.
- **A RULE THAT IS ALREADY OBEYED BY ONE OF TWO FUNCTIONS IS A HALF-RULE.** `fontHeightOf`
  had the box padding and `textWidth` did not; landing it on both was worse than landing it
  on neither.
- **AND THE ONE FROM §2.6, WHICH THIS BRANCH KEEPS RELEARNING**: a comment that explains why
  a derivation is safe is the reason nobody re-measures it. `writtenNote`'s said the source
  text was unnecessary, and it had been wrong on every lowercase-with-comma note in the
  corpus since it was written.
