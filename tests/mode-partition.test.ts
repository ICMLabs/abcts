/**
 * **THE MODE PARTITION — what each of the two modes is actually FOR.**
 *
 * `tests/extended-snapshot.test.ts` renders ONE mode and asks whether it moved. It cannot
 * ask the question this file exists for, which is about the RELATION between the modes:
 * does each behaviour fire on the side it belongs to?
 *
 * ⚠️ **THERE WERE THREE MODES AND `abcjs-extended` WAS NEVER ONE** (owner's call, 2026-09-04, after
 * this file measured it). **Every mode branch in `src/` is `isStrict(mode)`** — one
 * comparison, `core/model.ts`. Not one site ever distinguished `abcjs-extended` from `extended`, so
 * all 691 corpus cases were byte-identical between them and both intended tiers had landed
 * in the same bucket: the `+:`/`[U:`/`I:` parsing fixes beside the styled noteheads,
 * tremolos, three-quarter-tone glyphs and per-segment lyric fonts. The third name is gone
 * rather than implemented, and the survivor is `abcjs-extended`.
 *
 * **The type now carries what a corpus assertion used to.** `CompatibilityMode` has two
 * members, so "the modes have not silently collapsed into one" is a COMPILE error rather
 * than a test — which is why the two `it`s that compared `abcjs-extended` against `extended` are
 * gone rather than rewritten. What a type cannot say is that each behaviour still fires on
 * the right SIDE, and that is what is left here.
 *
 * ── ⚠️ WHY THE ROWS ARE PAIRED WITHIN ONE MODE ───────────────────────────────
 * The obvious control is `strict(feature) !== nonStrict(feature)`, and it is worthless: the
 * two modes **already differ on a bare `CDEF|`** (`<defs>`/`<use>`, the glyph font), so
 * every row reads red and every row means nothing. A first cut of this table had three rows
 * whose two digests were exactly the digests of the PLAIN tune. `CHECKPOINT-2026-09-04.md`
 * §4 records the same trap costing a probe in the falsy-zero work: sixteen notes all
 * "differing" was the modes differing, not the gate firing.
 *
 * So each row carries a BASE and a FEAT that differ by the feature alone, and asks whether
 * adding it moves the output **inside** each mode. That comparison has no baseline to be
 * contaminated by.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompatibilityMode } from "../src/core/model.js";
import { parse } from "../src/index.js";
import { render } from "../src/renderer/index.js";

const fixtures = join(import.meta.dirname, "corpus-abcjs", "fixtures");
const goldens = join(import.meta.dirname, "corpus-abcjs", "golden");

/** The enumeration `svg-bytes` and the extended ratchet share — see either for why. */
const CASES = readdirSync(fixtures)
  .filter((f) => f.endsWith(".abc"))
  .sort()
  .flatMap((f) => {
    const slug = f.replace(/\.abc$/, "");
    const abc = readFileSync(join(fixtures, f), "utf-8");
    if (existsSync(join(goldens, `${slug}.svg`))) return [{ slug, abc, tune: 0 }];
    const rows: { slug: string; abc: string; tune: number }[] = [];
    for (let i = 0; existsSync(join(goldens, `${slug}-tune${i}.svg`)); i += 1)
      rows.push({ slug: `${slug}-tune${i}`, abc, tune: i });
    return rows;
  });

/**
 * ⚠️ **A FAILURE STRING MUST NOT DIGEST AS A SUCCESS.** The ratchet learned this: a
 * `THREW:` recorded once agrees with itself forever. Here the risk is worse than there,
 * because two modes that BOTH throw compare equal and the row passes. So a non-SVG answer
 * is returned verbatim and the first assertion is that there are none.
 */
const svgOf = (abc: string, mode: CompatibilityMode, tune = 0): string => {
  try {
    const parsed = parse(abc, { mode });
    if (!parsed.ok) return `PARSE FAILED: ${parsed.errors.length} error(s)`;
    const score = parsed.scores[tune];
    if (score === undefined) return "NO SCORE";
    return render(score, { mode, systemWidth: 670 });
  } catch (e) {
    return `THREW: ${e instanceof Error ? e.message : String(e)}`;
  }
};

const digest = (abc: string, mode: CompatibilityMode, tune = 0): string => {
  const svg = svgOf(abc, mode, tune);
  if (!svg.startsWith("<svg")) return svg;
  return createHash("sha256").update(svg, "utf-8").digest("hex").slice(0, 16);
};

const H = "X:1\nM:4/4\nL:1/4\nK:C\n";

/**
 * **THE ROWS, AND EVERY ONE WAS SHOWN TO FIRE BEFORE IT WAS WRITTEN DOWN.**
 * `sees` is the mode in which adding the feature MOVES the page. The two polarities:
 *
 *   - `nonStrict` — abcjs is blind to a mark the ABC names, and the standard reads it.
 *   - `strict`    — abcjs's BUG is what is visible, and reading the standard correctly
 *                   makes the page identical to not having written the thing at all.
 *
 * ⚠️ Rows where BOTH modes see the feature and merely disagree about it — `s:`,
 * `%%vocalfont`, `^^/`, `clef=alto2`, a melisma, a mid-tune `[Q:]`, `[C4G]`'s notehead —
 * are deliberately NOT here. There is no uncontaminated within-mode question to ask about
 * them; the strict goldens hold one side and the extended ratchet holds the other, and a
 * row here could only re-assert that the modes differ, which they do everywhere.
 *
 * ⚠️ And two candidates were dropped as BAD SNIPPETS rather than as findings, which is the
 * `!trem2!` lesson — a spelling the parser never sees looks exactly like a dead feature:
 *   - `I:linebreak $` and `I:decoration +` move NEITHER mode. `I:score` does, so the class
 *     fires and those two directives are simply unimplemented on both paths.
 *   - "a space stops ending a beam if anything intervenes" moves BOTH modes for every
 *     intervening character tried (`y`, `)`, `"^x"`, `!trill!`, `.`). A whole-SVG digest is
 *     the wrong instrument for it; it needs the beam grouping, not the page.
 */
const ROWS: { name: string; sees: "strict" | "nonStrict"; base: string; feat: string }[] = [
  // abcjs paints nothing for these; the other modes draw the ornament the ABC names.
  { name: "!staccato!", sees: "nonStrict", base: `${H}C D E F|\n`, feat: `${H}!staccato!C D E F|\n` },
  { name: "!invertedturn!", sees: "nonStrict", base: `${H}C D E F|\n`, feat: `${H}!invertedturn!C D E F|\n` },
  { name: "!invertedturnx!", sees: "nonStrict", base: `${H}C D E F|\n`, feat: `${H}!invertedturnx!C D E F|\n` },
  { name: "!turnx!", sees: "nonStrict", base: `${H}C D E F|\n`, feat: `${H}!turnx!C D E F|\n` },
  // ABC 2.1 §3.2 — abcjs has no `+:` handling, so the continuation falls through to the
  // music parser and the words are lexed as notes.
  {
    name: "+: field continuation",
    sees: "nonStrict",
    base: "X:1\nT:one\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    feat: "X:1\nT:one\n+:two\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
  },
  {
    name: "I: information field",
    sees: "nonStrict",
    base: "X:1\nM:4/4\nL:1/4\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n",
    feat: "X:1\nI:score (1 2)\nM:4/4\nL:1/4\nK:C\nV:1\nCDEF|\nV:2\nGABc|\n",
  },
  // The other polarity: abcjs's bug is the thing that shows, and correctness is invisible.
  // `[U:` is not one of the eight inline fields, so abcjs draws the leftovers.
  { name: "[U: inline field", sees: "strict", base: `${H}C D E F|\n`, feat: `${H}C [U:n=!trill!] D E F|\n` },
  // A spaced hyphen in a `w:` line consumes a note in abcjs.
  {
    name: "spaced lyric hyphen",
    sees: "strict",
    base: `${H}C D E F|\nw:la la la la\n`,
    feat: `${H}C D E F|\nw:la - la la la\n`,
  },
];

describe("the two compatibility modes, as a partition", () => {
  it("renders every corpus case in both modes — no failure digests as a success", () => {
    const broken: string[] = [];
    for (const c of CASES)
      for (const mode of ["abcjs-strict", "abcjs-extended"] as const) {
        const svg = svgOf(c.abc, mode, c.tune);
        if (!svg.startsWith("<svg")) broken.push(`${c.slug} [${mode}]: ${svg.slice(0, 60)}`);
      }
    expect(broken).toEqual([]);
  });

  /**
   * **AND THE CASES WHERE NOTHING MODE-GATED APPEARS AT ALL, BY NAME.** 16 of 691, and a
   * LIST rather than a count for the reason the ratchet reports three lists: the shape of
   * the diff is the finding. A slug ARRIVING means a non-strict fix stopped applying to it;
   * a slug LEAVING means a new one reached it, which is the ordinary good case.
   */
  it("names the cases where the two modes agree", () => {
    const same = CASES.filter(
      (c) => digest(c.abc, "abcjs-strict", c.tune) === digest(c.abc, "abcjs-extended", c.tune),
    ).map((c) => c.slug);
    expect(same).toEqual([
      "abcjs-parse-book_parser-01-example",
      "abcjs-parse-book_parser-02-tune",
      "abcjs-parse-book_parser-03-a-tune0",
      "abcjs-parse-book_parser-03-a-tune1",
      "abcjs-parse-book_parser-03-a-tune2",
      "abcjs-parse-book_parser-04-wed",
      "abcjs-parse-book_parser-05-a-tune0",
      "abcjs-parse-book_parser-05-a-tune1",
      "abcjs-parse-book_parser-06-a",
      "abcjs-parse-book_parser-07-a",
      "abcjs-visual-misc-14-tune",
      "abcjs-visual-misc-x07",
      "abcjs-visual-transpose-output-02-transpose-output",
      "abcts-inline-fields-and-blocks-tune9",
      "abcts-staffnonote-empty-staves-tune0",
      "abcts-staffnonote-empty-staves-tune1",
    ]);
  });

  /**
   * **THE NAMED GATES — a red row says WHICH behaviour stopped, which no digest table can.**
   * Reported as one list rather than eight `it`s so a change that switches the `isStrict`
   * sense globally shows as eight rows at once instead of one failure and seven unreported.
   */
  it("each mode-gated behaviour fires in exactly the mode it belongs to", () => {
    const wrong = ROWS.flatMap(({ name, sees, base, feat }) => {
      const moved = {
        strict: digest(base, "abcjs-strict") !== digest(feat, "abcjs-strict"),
        nonStrict: digest(base, "abcjs-extended") !== digest(feat, "abcjs-extended"),
      };
      const blind = sees === "strict" ? "nonStrict" : "strict";
      if (moved[sees] && !moved[blind]) return [];
      return [`${name}: expected ${sees} to see it and ${blind} to be blind — got ${JSON.stringify(moved)}`];
    });
    expect(wrong).toEqual([]);
  });

  /**
   * **NON-STRICT MEASURES TEXT WITH REAL PER-EM METRICS, NOT THE GOLDEN GENERATOR'S.**
   * `STRICT_TEXT_METRICS` (`layout.ts:6880`, set at `:13171`) picks `golden-widths.ts` —
   * the five WebKit-calibrated ASCII tables `dump-svg.js` patches onto jsdom's `getBBox`,
   * which answer a flat `FALLBACK_ADVANCE` for **everything outside ASCII** — against
   * `text-metrics.ts`'s real per-em advances. Reproducing the generator's tables is what
   * makes strict match the 691 goldens; non-strict is not bound by them.
   *
   * If that wiring ever went always-strict, every non-strict render would silently lay text
   * out with the generator's tables — the Phase 1 defect (`extended` using the tables in a
   * real browser) one layer down, and the ratchet would go red saying only "691 moved".
   *
   * ⚠️ THE OBSERVABLE IS THE ROOT `width` AND NOTHING ELSE HERE WORKS. The title string is
   * IN the markup, so a digest differs whatever the metrics say; the title is `middle`-
   * anchored at a FIXED paper x (abcjs places the top block absolutely), so its own `x`
   * cannot move; and an annotation is `start`-anchored and does not reach the page width at
   * all. Two instruments were written and discarded before this one.
   */
  it("non-strict measures with real per-em metrics, not the golden tables", () => {
    const titled = (t: string) => `X:1\nT:${t}\nM:4/4\nL:1/4\nK:C\nC D E F|\n`;
    const width = (t: string, mode: CompatibilityMode): string | undefined =>
      /<svg[^>]*\bwidth="([\d.]+)"/.exec(svgOf(titled(t)  , mode))?.[1];

    // ⚠️ THE CONTROL COMES FIRST: an ASCII pair BOTH tables distinguish, so an instrument
    // that had gone blind cannot pass the rows below by measuring nothing.
    expect(width("iiii", "abcjs-strict")).not.toBe(width("MMMM", "abcjs-strict"));
    expect(width("iiii", "abcjs-extended")).not.toBe(width("MMMM", "abcjs-extended"));

    // Pairs of equal LENGTH outside ASCII: identical to the generator's flat fallback,
    // distinct to a real font. (`ŴŴŴŴ`/`ıııı` is NOT here — measured, and the per-em table
    // gives those two the same advance, so the pair proves nothing either way.)
    for (const [a, b] of [
      ["ÀÀÀÀ", "ÎÎÎÎ"],
      ["ÿÿÿÿ", "ÀÀÀÀ"],
      ["音音音音", "ÀÀÀÀ"],
    ] as const) {
      expect(width(a, "abcjs-strict"), `${a}/${b} strict`).toBe(width(b, "abcjs-strict"));
      expect(width(a, "abcjs-extended"), `${a}/${b} non-strict`).not.toBe(width(b, "abcjs-extended"));
    }
  });

});
