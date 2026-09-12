---
title: Codebase evaluation — abcts, 2026-09-12
scope: every skill that fits a zero-dependency TypeScript rendering library
---

# Codebase evaluation — 2026-09-12

Run at the owner's request ("every available skill"). Four lenses: deliberate-debt,
over-engineering, correctness, and security. **One real defect was found and fixed**; the
rest is a report.

## ▶️ THE HEADLINE

**The code is lean and the docs are not.** `src/` has **zero runtime dependencies**, two
dead exports and no security findings. `CLAUDE.md` is **2,240 lines, 60% of it historical
blockquote narrative**, duplicating **56 handoff documents**, and it is loaded in full at the
start of every session.

## 1. CORRECTNESS — one real defect, found where no gate could see it

⭐ **The voice-name grace line was ungated, and it regressed the UNWRAPPED path.**
`findLineBreaks` runs only under `wrap`, but the rule "a voice survives one line past its
last music" was applied to every render. Four source lines with the second voice on the
second of them, unwrapped:

    abcjs   RH X2 rh rh rh
    ours    RH X2 rh x2 rh rh

⚠️ **NEITHER GATE COULD SEE IT.** `svg-bytes` is 0 of 691 because no corpus fixture has that
shape; `zzopts` only ever renders `{wrap}`. Fixed in `fe08f34`, with a regression test that
asserts abcjs's own unwrapped answer.

**The lesson worth keeping: a rule derived under `{wrap}` must be shown not to fire without
it.** Three of this session's rules are wrap-gated on purpose (`wrapDroppedMeter`,
`openingBarlineTrails`, the stem carry); this one was not, and nothing caught it but a probe.

## 2. SECURITY — no findings

Reviewed this session's 840 added lines across six files. No `eval`, no `new Function`, no
`innerHTML` assignment, no raw text reaching the output, no user-controlled object keys
(the new lookups are `Map`s). The one emitter change is a numeric sort key.

**And the library's actual attack surface was probed rather than reasoned about.** A tune
whose title, composer, `%%text`, chord symbol and lyric are all
`"><script>alert(1)</script>` renders with every one escaped —
`&gt;&lt;script&gt;alert(1)&lt;/script&gt;` — including inside the `aria-label` attribute.
No `<script>` survives. Every `">` in the output is a legitimate tag close.

## 3. OVER-ENGINEERING — lean; the big candidate is measured and declined

| | |
|---|---|
| runtime dependencies | **0** |
| dev dependencies | 6, all in use (`biome`, `@types/node`, `opentype.js`, `tsup`, `typescript`, `vitest`) |
| `src/` | 66,321 lines across 40 files |
| dead exports | **2** — `stepOfPitch`, `CHAR_ADVANCE_FALLBACK` (~4 lines) |
| unreferenced probe scripts | 15 of 74 `scripts/zz*.ts` (201 lines); the other 59 are cited in docs |

⚠️ **`layout.ts` IS 21,293 LINES AND THAT IS NOT A FINDING.** Splitting it at its named
seams was MEASURED — 75% transitively coupled to the module-level switches, "the seams ARE
the 75%" — and threading those switches as a `ctx` is **217 references**
(`HANDOFF-2026-09-08.md` §6). Both are on the repo's "do not re-open without new evidence"
list, and this audit found no new evidence.

## 4. DELIBERATE DEBT — `Docs/PONYTAIL-DEBT.md`

**63 `ponytail:` markers, 26 with no trigger.** A no-trigger marker names a ceiling and
nothing that would make anyone revisit it: the reasoning survives, the deadline never
arrives. Several are deliberate permanent positions and should be RESTATED as decisions
rather than left as debt.

⚠️ **The hit rate argues for the pass.** `HANDOFF-2026-09-08.md` records a sweep that turned
16 markers into controls and found **4 real defects** — 25%.

## ⚖️ THE ONE DECISION FOR THE OWNER

**`CLAUDE.md` is 2,240 lines and 88% of it sits in two sections:**

    1,275  ## First Step — Always
      699  ## Current phase          ← 32 dated entries, a chronological log
       ~   everything actionable: standing order, commands, rules, key files, remote — ~150

1,355 lines are blockquote (`> `) narrative. `Docs/` holds **56 handoff documents** whose
job that is, and `Current phase`'s newest entry is older than the newest handoff.

**The recommendation is to move the dated log out and point at the handoffs, keeping the
method and the rules inline.** That is ~700 lines off every session's context for no loss of
information — but it is the owner's durable memory and the call is theirs, so nothing has
been deleted. What HAS been added is a short map at the top of the file saying where the
current state lives, which costs nothing and was the actual failure mode: a session reading
linearly meets 1,270 lines of history before it reaches a command.
