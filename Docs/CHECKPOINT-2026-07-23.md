# abcts — Checkpoint, 2026-07-23

Supersedes `CHECKPOINT-2026-07-22c.md` — read this one, then `ARCHITECTURE.md`, then
`CLAUDE.md`. The `c` file's *method notes* still stand; its priority list is answered below.

---

## The contract (unchanged)

`abcjs-strict` reproduces abcjs 6.6.3 exactly — 100% parity is the bar, any divergence is a
defect. `abc2.1` / `extended` fix abcjs's bugs; their target is abcm2ps / abc2svg via the
golden sets, observed through OUTPUT only. Never raise a pixel-parity ceiling to pass.

---

## Where things stand

`main` is unchanged from `a761cf8` in behaviour: **499 tests green**, every structural gate
at 100% with zero recorded divergences, corpus median notehead distance **17.4px**, 21/29
within 25px, 29/29 within 50px, systems 29/29.

**The session's work is on the branch `geometry/lyric-ink-anchor` (`8196bfd`), not on
`main`,** because it regresses four ceilings. Its commit message is the full record; the
summary is below. Read it before doing anything with lyrics — it answers priority 1 and
disproves the reason the last two sessions gave for leaving it out.

---

## Priority 1 — ANSWERED, and the old obstacle was a misreading

abcjs's lyric model, measured from its own output and exact to 0.01px on four independent
points:

```
lyric baseline  = staff INK BOTTOM + 17px + voiceIndex x 18.84px
staff reserves  = ink bottom + 18.84px + 3.875px, ONCE, whatever the verse count
```

`17` is abcjs's vocal font size (the SVG baseline offset), `18.84` is `17 x 1.108` — the
same calibrated height ratio `ENGRAVE.textHeightRatio` already carries — and `3.875` is its
`margin = 1` pitch step.

**Lyrics hang off the staff's INK, not off a fixed lane.** This is the one out-of-staff
thing that does, which is why fixed lanes were the right answer for chords and dynamics and
the wrong one here. abcjs resolves a lyric's pitch to `staff.bottom`
(`set-upper-and-lower-elements.js:52-55`) and the k-th voice's one lyric height below that
(`:165-169`).

**abcjs DOES apply the voice offset in `ave-verum-corpus`.** Two sessions recorded that it
does not, because that fixture's two lyric lines sit 3.3px apart where the rule implies
~21px. They do — and its upper staff's ink reaches 15.5px further down, so
`18.84 - 15.5 = 3.34` is the 3.3 that was read as absence. Reasoning from the gap BETWEEN
two staves instead of from each staff's OWN ink is what hid it.

**A lyric block reserves ONE line, whatever the verse count.** `specialY.lyricHeightBelow`
is `4.862` pitch in abcjs's two-verse `little swallow` golden and `4.862` in its one-verse
`ave-verum` golden. Verses past the first hang into space nothing reserved, and strict must
reproduce that. Measuring the drawn box instead made every system of `little swallow` 19px
taller than abcjs's. (abcjs stacks verses as `<tspan dy="1.2em">` inside ONE `<text>` per
note — that is why its golden shows 19 lyric elements on one baseline where ours shows
13 + 13 on two.)

On the branch this gives `little swallow` dy 50.6 -> 3.1 / oy 25.2 -> 1.5,
`multi-voice-lyrics-two-voices` dy 26.7 -> 4.0, `frere-jacques` dy 34.1 -> 31.0, and the
overprint is gone.

### What blocks it — one fixture, and the cause is located

`ave-verum-corpus` goes dy 13.5 -> 48.8, oy 10.5 -> 40.7. Its staff 1 (`(T B)`, bass)
measures its ink top **23.5px above abcjs's**, because our shared-staff rule forces voice 0's
stems UP and abcjs's Tenore is stemmed DOWN.

abcjs prepends `stem: up` to a staff's first voice only if that voice ALREADY HAS MUSIC when
the second voice is declared (`parse/tune-builder.js:974-987` — the guard is
`thisStaff.voices[0] !== undefined`). ave-verum declares all eight voices in the header, so
nothing is forced and every voice follows its pitch. `multi-voice-triplet-brackets` and
`multi-voice-rest-placement` write `V:Top`, music, `V:Bottom`, so they DO get the forcing.

Making voice 0 unforced everywhere takes ave-verum 50.0 -> 27.9 and costs triplet-brackets
17.4 -> 58.4 and rest-placement 14.5 -> 27.4. **Reproducing abcjs needs the model to record
whether a voice was declared before any music** — a parser/model change (`Voice` has no such
field), not a renderer one. That is the next piece of work, and it unblocks the branch.

`full-song-template` (oy -17.4 -> -26.3), `happy-birthday` (dy 12.9 -> 16.0) and
`program-127-test` (dy 9.2 -> 12.5) also regress and are NOT diagnosed.

---

## Priority 2 — the missing extent, narrowed but not closed

A direct oracle exists and was not being used: abcjs's `.elements.json` goldens carry each
staff's own `top` and `bottom` in pitch units, which is its MUSIC INK before any
out-of-staff furniture is added. Compared against our `verticalExtent` over 53 staves:

| | median |
|---|---|
| ink TOP vs abcjs | **+0.03px** — already right |
| ink BOTTOM vs abcjs | **-3.41px** — we are short |

The bottom shortfall is not noise: it is **-3.4 exactly** on every staff whose lowest thing
is a down-stem and **0.0** on every staff where it is not. abcjs reserves one pitch step
below a down-stem's drawn end — `bottom: p1 - 1` on the stem's `RelativeElement`
(`abstract-engraver.js:762`), where `p1` is the stem's low pitch. On an up-stem the reserve
sits at the notehead and is swallowed by the head's own; on a down-stem it binds. The drawn
stems themselves agree to 0.2px, so this is a reservation difference, not a drawing one.

**Adding it makes the corpus WORSE** — median 16.1 -> 17.4, within-50 29 -> 26 — so it is
not landed. It is right in kind and something larger is still wrong in the same direction.

`systemGap` / `staffGap` still cannot be zeroed. A 3x3 grid over
`systemGap {3.0, 1.5, 0} x staffGap {1.5, 0.75, 0}`, measured with the lyric model in place,
puts the current 3.0/1.5 at the best cell of nine; every step toward zero costs mean |oy|.
Do not tune them; the fix is still the missing extent.

---

## Priority 3 — the absolute stretch guard — untouched

`spacing * minSpace > 50` still needs a real spring/rod split. Unchanged from `c`.

---

## Also measured, not landed

**Our out-of-staff text is undersized, and one constant does five jobs.**
`ENGRAVE.lyricTextSize` is 1.4 (10.85px) where abcjs's `vocalfont` is 17px and its
`gchordfont` / `annotationfont` 16px, and chord symbols, annotations, decorations, inline
`"<text"` and lyrics all read that single constant. Sizing it correctly moves the corpus by
0.2px of mean |oy| — not a gate mover — but it is the same undersizing that was found and
fixed for the title, and it makes every out-of-staff reserve too small. It also explains a
-7.3px `oy` cluster (`chord-grid`, `stacked-annotations`, `multi-voice-rest-placement`,
`voice-middle-after-clef`): abcjs reserves `chordHeightAbove + margin` from a 16px font
where we reserve the ascender of a 10.85px one.

---

## Method notes — new this session

The `c`, `b`, 07-21 and 07-22 notes still apply. New:

1. **A scratch probe that writes to a fixed path will lie to you.** A geometry table was
   overwritten by a later probe writing the same `/tmp` file, and nine consecutive
   configurations reported byte-identical results — which was the tell, because a constant
   that changes nothing at all changes nothing at all. Check the file's mtime, or make the
   probe fail loudly when it writes nothing.
2. **The element goldens are an oracle for EXTENTS, not just for structure.**
   `.elements.json` carries `staffs[].top/.bottom` and `specialY` per staff — abcjs's own
   answer to "how much room does this staff take, and why". Three sessions of reasoning
   about extents happened without opening it. It settled the lyric reserve, the ink-top
   agreement and the down-stem shortfall in one pass.
3. **Two errors that cancel look like one model.** Our lyric lane was too shallow AND our
   staff stacking too generous; the sum was near enough that fixing only the lane made
   fixtures worse. That is the same shape as the 4px gate bias in `c` — and the same
   remedy: measure each term against its own reference, never the sum against the total.
4. **"abcjs does not do X here" is a claim about your measurement's frame.** The
   ave-verum lyric offset was declared absent twice, from the distance between two staves'
   lyrics. Measured from each staff's own ink instead, it is present and exact. Pick the
   frame the source computes in.
5. **Excluding the right things from a measurement is most of the measurement.** The first
   ink-bottom probe included the top-text block, which at merge time has not been moved yet
   — a four-row heading measured as ink 96px BELOW the staff. The second used the wrong
   glyph table and read Bravura's clef where strict draws abcjs's, inventing a 3.6px
   corpus-wide top error that does not exist.
6. **A parked branch beats a third write-up.** This is the third session to leave the
   per-voice lyric offset out. The difference now is that the obstacle is a NAMED defect
   with a source citation and a numbered cost, the work is committed where it can be
   rebased rather than rebuilt, and the wrong reason the last two write-ups gave has been
   retracted rather than repeated.

---

## Confirm your lane before structural work — `Code/` vs `Code-v2/` vs `Code-1.9/`.
