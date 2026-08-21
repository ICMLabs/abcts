/**
 * **THE VALUES OF EVERY ELEMENT OF A `parseOnly` TUNE, REDUCED ONCE.**
 *
 * `scripts/harvest-abcjs-parse-values.ts` runs it over abcjs 6.7.0 and
 * `tests/parse-values.test.ts` over ours — one file, so the two reductions cannot drift.
 * The repo has been bitten by a "verbatim copy" comment before; a comment cannot keep that
 * promise and a shared import can.
 *
 * ── WHY THIS EXISTS BESIDE `parse-only` ─────────────────────────────────────
 * `parse-only` compares WHICH FIELDS an element carries, per element KIND, unioned across
 * the tune — and its own header says so: *"Values would be the second gate and are not
 * this one."* That leaves two things it structurally cannot see:
 *
 *  1. **VALUES.** A field present on both sides with different contents is invisible to a
 *     name-set. `verticalPos` was `pitch` on every note of every non-treble clef in both
 *     corpora, and the union of names was identical.
 *  2. **WHICH element.** A union per kind cannot tell one note carrying a field from all of
 *     them carrying it, nor a field that landed on the wrong element.
 *
 * This is that second gate: ONE ROW PER ELEMENT, keyed by its position in the tune, whose
 * value is the element canonicalised to JSON. It opened at **1,249 of 9,727 rows differing**
 * and named six defects nothing else in the repo could state — the largest being that a
 * whole VERSE of every multi-verse tune was missing from `el.lyric` while the DRAWING
 * stacked all of them correctly.
 *
 * ── WHY IT IS `parseOnly` AND NOT A RENDERED TUNE ───────────────────────────
 * Because the parser's answer and the engraver's are DIFFERENT answers, and the engraver's
 * is already gated six ways. `elem.pitches` is sorted by `createNote` and left as written by
 * the parser; `el_type` is renamed as the engraver draws. A rendered tune would measure the
 * union of both and be unable to attribute a difference to either.
 */

/**
 * Keys sorted, `undefined` dropped — `exactOptionalPropertyTypes` omits where abcjs assigns.
 *
 * ⚠️ **AND `abselem` IS REPLACED BY ITS OWN NAME, WHICH IS abcjs'S CHOICE AND NOT A
 * TOLERANCE OF OURS.** `deline`'s comparison uses
 * `JSON.stringify(input, replacer)` with `if (key === 'abselem') return 'abselem'`
 * (`data/deline-tune.js:118-124`) — the drawn element hangs off every element a RENDERED
 * tune drew, and it points back at the tune, so a plain walk recurses until the stack
 * gives out. **PRESENCE STILL COUNTS**: only a DRAWN line carries one
 * (`draw/absolute.js:72`), which is how `%%maxStaves`' hidden lines are told apart.
 */
/**
 * Compared by PRESENCE, replaced with their own name.
 *
 * `abselem` is abcjs's own choice (see `canon`). `staffGroup` is ours and is DECLARED
 * here rather than silently dropped: a rendered line carries the laid-out staff group,
 * which is the DRAWING — already gated byte for byte by `svg-bytes`, and a graph that
 * points back at the tune. What matters at this level is that a line HAS one, which is
 * what a rendered line has and an unengraved one does not.
 */
const BY_PRESENCE = new Set(["abselem", "staffGroup"]);

export const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as object).sort()) {
      const value = (v as Record<string, unknown>)[key];
      if (value === undefined) continue;
      out[key] = BY_PRESENCE.has(key) ? key : canon(value);
    }
    return out;
  }
  return v;
};

/**
 * One tune as `position -> element`. The position is `L{line}/s{staff}/v{voice}/{index}`,
 * which is stable under everything except a change to the LINE ASSIGNMENT — and that is
 * `tune.lines`' own gate, so a wholesale shift here means look there first.
 */
/** Every own field except one — the container the walk descends into. */
const without = (o: object, skip: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) if (key !== skip) out[key] = (o as Record<string, unknown>)[key];
  return out;
};

export const valuesOfTune = (tune: {
  lines?: readonly { staff?: readonly { voices?: readonly (readonly unknown[])[] }[] }[];
}): Map<string, string> => {
  const out = new Map<string, string>();
  (tune.lines ?? []).forEach((line, li) => {
    /**
     * ⚠️ **THE LINE'S AND THE STAFF'S OWN FIELDS ARE ROWS TOO.** The first cut of this walk
     * descended `line.staff[].voices[]` and emitted only what it found at the bottom — so
     * a staff's `clef`, `key`, `meter`, `title`, `brace`, `bracket`, `connectBarLines`,
     * `stafflines` and its `%%…font` changes, and a line's `vskip` / `subtitle` / `text`,
     * were all unmeasured. Exactly the hole this gate was built to close in `parse-only`,
     * one level up: **a walk measures what it descends INTO, and nothing it passes over.**
     */
    out.set(`L${li}`, JSON.stringify(canon(without(line, "staff"))));
    (line.staff ?? []).forEach((staff, si) => {
      out.set(`L${li}/s${si}`, JSON.stringify(canon(without(staff, "voices"))));
      (staff.voices ?? []).forEach((voice, vi) =>
        voice.forEach((el, ei) =>
          out.set(`L${li}/s${si}/v${vi}/${ei}`, JSON.stringify(canon(el))),
        ),
      );
    });
  });
  return out;
};
