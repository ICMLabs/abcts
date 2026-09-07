/**
 * **`abcjs-extended` — A GATE THAT CAN SAY *WRONG*, NOT ONLY *CHANGED*.**
 *
 * ── WHY IT HAD TO EXIST ─────────────────────────────────────────────────────
 * Every SVG gate in this repo is STRICT-ONLY: `svg-bytes`, `svg-bytes-sibling` and
 * `zzlive` all compare against abcjs, and abcjs is not what extended is trying to be.
 * What extended had was `extended-snapshot`, which records a HASH — so it can say a
 * rendering moved and never that it was wrong, and it holds a defect in place the moment
 * one is recorded.
 *
 * That is not a theory. Three real bugs shipped under it and were found by a human
 * looking at the renderings on 2026-09-07:
 *
 *   - `<defs>` ids were `g0`, `g1`, … per render, and an SVG id is DOCUMENT-global, so
 *     two extended scores on one page drew each other's glyphs;
 *   - every dynamic sat four pitch high, on the notes rather than in the lane below them,
 *     because its y-correction was inside a `strict` guard;
 *   - every UP-STEM drew on the wrong side of its notehead, because Bravura's anchors are
 *     published in STAFF SPACES and were being used as layout units.
 *
 * ── THE ORACLE PROBLEM, AND THE ANSWER ──────────────────────────────────────
 * Extended has no reference engine — that is the point of it. So this cannot be a
 * comparison against another engine's output, and a golden of our own would only repeat
 * `extended-snapshot`'s mistake.
 *
 * **STRICT IS THE STRUCTURAL REFERENCE.** Strict is byte-verified against abcjs over 691
 * tunes in two browsers, so what it says about TOPOLOGY — which side a stem is on, which
 * side of the staff a dynamic sits — is known-good. The FIGURES may differ, and are meant
 * to: a different font, a different spacing engine, its own glyph choices. So every
 * assertion here is about a sign or a side, never a number.
 *
 * ── AND THE AUDIO ───────────────────────────────────────────────────────────
 * The audio gates all run through `compat`, which hard-wires strict, so extended's audio
 * was never measured at all. A mode is a PARSING difference before it is an engraving
 * one, so it can change what you hear — and where it does, it must be a NAMED, deliberate
 * fix rather than a side effect of an engraving change. §3.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flattenAudio } from "../src/audio/flatten.js";
import { parse } from "../src/index.js";
import { render } from "../src/renderer/index.js";

const fixtures = join(import.meta.dirname, "corpus-abcjs", "fixtures");
const files = readdirSync(fixtures)
  .filter((f) => f.endsWith(".abc"))
  .sort();

type Mode = "abcjs-strict" | "abcjs-extended";
const renderAll = (abc: string, mode: Mode): string[] => {
  const parsed = parse(abc, { mode });
  return (parsed.scores ?? []).map((s) => render(s, { mode } as never));
};

/** Every `translate(x,y)` on an element carrying `cls`, in document order. */
const placed = (svg: string, cls: string): { x: number; y: number }[] =>
  [
    ...svg.matchAll(
      new RegExp(
        `<(?:path|use)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*transform="translate\\(([-\\d.]+),([-\\d.]+)\\)`,
        "g",
      ),
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/** Every `<rect class="cls">`, which is how a stem and a staff line are drawn. */
const rects = (svg: string, cls: string): { x: number; y: number; h: number }[] =>
  [
    ...svg.matchAll(
      new RegExp(
        `<rect[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*x="([-\\d.]+)"[^>]*y="([-\\d.]+)"[^>]*height="([-\\d.]+)"`,
        "g",
      ),
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), h: Number(m[3]) }));

/**
 * **A LADDER OF CONTROLS, NOT A CORPUS SCAN.**
 *
 * ⚠️ **THE FIRST CUT WAS A CORPUS-WIDE CLASSIFIER AND IT WAS NOISE.** It paired a stem with
 * the nearest notehead and compared the side against strict over all 691 tunes — and it
 * needed four corrections in a row (a flag carries the same class as a head; a dynamic in
 * the lane is nearer than the head; the two modes emit stems in different ORDERS so an
 * index pairing is invalid; only glyphs at the stem's ENDS are candidates), and STILL
 * reported five dense fixtures off by one or two in both directions. A probe whose
 * residual I cannot explain is not a gate — the next person widens the tolerance and it
 * measures nothing. Recorded rather than shipped.
 *
 * One stem per tune pairs with no classifier at all. Each rung fixes one variable, and the
 * defect this was written for — Bravura's anchors read as layout units — flips EVERY
 * up-stem, so a single rung catches it.
 */
const STEM_LADDER: readonly (readonly [string, string, "up" | "down"])[] = [
  ["a low note stems up", "X:1\nL:1/4\nK:C\nD|\n", "up"],
  ["a high note stems down", "X:1\nL:1/4\nK:C\nc|\n", "down"],
  ["an eighth carries a flag with it", "X:1\nL:1/8\nK:C\nD|\n", "up"],
  ["a high eighth stems down", "X:1\nL:1/8\nK:C\nc|\n", "down"],
  ["a low chord stems up", "X:1\nL:1/4\nK:C\n[CE]|\n", "up"],
  ["a high chord stems down", "X:1\nL:1/4\nK:C\n[ce]|\n", "down"],
  // A forced-direction rung was tried and DROPPED: `[I:stemdir down]D` stems UP in both
  // modes, so the rung asserted a directive rather than a stem side, and would have read
  // as an engine defect. Both modes agreeing is what this file is for; whether the
  // directive is honoured belongs to a parser gate.
]

/**
 * The stem's offset from its notehead, in that mode's own units. One note, one stem, one
 * head — so this is a subtraction rather than a classification.
 */
const stemOffset = (svg: string): number | null => {
  const heads = placed(svg, "abcts-note")
  // ⚠️ **A LEDGER LINE IS A `<rect class="abcts-note">` TOO** — wide and 0.7 tall, and it
  // comes FIRST, so `[0]` picked it and reported a chord's stem 2px LEFT of its head. The
  // stem is the tall one; nothing else on a note is.
  const stem = rects(svg, "abcts-note").find((r) => r.h > 5)
  if (stem === undefined || heads.length === 0) return null
  // The head is the glyph at an END of the stem that does NOT share its x — the flag does.
  const ends = heads.filter(
    (h) => Math.abs(h.y - stem.y) < 2 || Math.abs(h.y - (stem.y + stem.h)) < 2,
  )
  let best: number | null = null
  for (const h of ends) {
    const d = stem.x - h.x
    if (best === null || Math.abs(d) > Math.abs(best)) best = d
  }
  return best
}

describe("abcjs-extended, against strict as a STRUCTURAL reference", () => {
  /**
   * ⚠️ **THE BUG THIS WAS WRITTEN FOR.** Bravura's `stemUpSE` is `[1.18, -0.168]` in STAFF
   * SPACES and was applied as layout units, so an up-stem drew 1.18 units from the head's
   * origin — its LEFT edge — instead of 9.145, its right. Every up-stemmed note in the
   * corpus, and the flag reads its x off the stem so it followed.
   *
   * A stem is at one EDGE of its head: an up-stem a head's width to the RIGHT, a down-stem
   * at 0. The width is a font's business and the two differ by design; the SIDE is not.
   */
  it.each(STEM_LADDER)("%s", (_name, abc, want) => {
    for (const mode of ["abcjs-strict", "abcjs-extended"] as const) {
      const svg = renderAll(abc, mode)[0] as string
      const d = stemOffset(svg)
      expect(d, `${mode} found no stem`).not.toBeNull()
      if (want === "up") expect(d as number, `${mode} up-stem offset`).toBeGreaterThan(4)
      else expect(Math.abs(d as number), `${mode} down-stem offset`).toBeLessThan(4)
    }
  })

  /**
   * ⚠️ **AND THE SECOND BUG.** A dynamic's four-pitch drop was inside the `strict` guard,
   * so extended drew `pppp` and `ffff` four pitch high — ON the notes.
   *
   * ⚠️ **AND THE FIRST CUT OF THIS CHECK WAS MUTE.** It looked for `class="abcts-dynamic"`,
   * which does not exist — a dynamic is classed `abcts-note` like every other glyph — so it
   * found nothing and passed with the bug deliberately reintroduced. **Verified by putting
   * the bug back**, which is the only way to know a check can see it.
   *
   * The LANE is mode-independent: it is where abcjs puts the mark relative to the staff,
   * not a property of either font. So this is the one place a NUMBER is compared, and 3px
   * is far tighter than the 15.5 the defect moved it by.
   */
  it("puts a dynamic in the same lane as strict, not on the notes", () => {
    const abc = "X:1\nL:1/4\nK:C\n!ffff!C !pppp!G|\n"
    const lowest = (mode: Mode): number => {
      const ys = placed(renderAll(abc, mode)[0] as string, "abcts-note").map((g) => g.y)
      return Math.max(...ys)
    }
    const s = lowest("abcjs-strict")
    const e = lowest("abcjs-extended")
    expect(Math.abs(e - s), `dynamic lane: strict ${s}, extended ${e}`).toBeLessThan(3)
  })

  /**
   * **A SCORE MUST BE DRAWABLE IN A PAGE THAT HOLDS ANOTHER** — `<defs>` ids are
   * document-global, and two extended scores on one page drew each other's glyphs.
   *
   * ⚠️ **THAT RULE LIVES IN `optimize-svg.test.ts`, NOT HERE.** A version was written here
   * too and its assertion reduced to `expect(x).toBeLessThanOrEqual(x)` — a tautology that
   * would pass for ever. Verified by putting the collision back: `optimize-svg`'s
   * "gives two renders disjoint ids" goes red and this file does not need to.
   */
});

/**
 * **§3 — THE AUDIO, WHICH NO GATE REACHED.**
 *
 * `audio-ranked`, `midi-bytes`, `timing` and the rest all go through `compat`, which
 * hard-wires `abcjs-strict`. So nothing measured what extended SOUNDS like, and a mode is
 * a PARSING difference before it is an engraving one — `+:`, an inline `[U:`, a
 * three-quarter tone — so it can change the notes.
 *
 * **Where it does, that must be DELIBERATE AND NAMED.** Every slug below is a documented
 * mode split; anything else is an engraving change that has leaked into the audio, which
 * is the failure this gate exists to catch.
 */
const AUDIO_DIFFERS: readonly string[] = [
  /** Microtones: extended sounds the quarter tone, strict rounds it — `ABCJS-DIFFERENCES`. */
  "abcts-ledger-gaps-4#2",
  "abcts-stafflines-and-modifiers#25",
  /** An accidental abcjs mis-parses and extended reads per ABC 2.1: pitch 60 against 61. */
  "abcts-stafflines-and-modifiers#23",
  /** `[U:` defines a macro in extended and is a failed CHORD in abcjs — volume 105 vs 127. */
  "abcts-text-udef-parts-overlays#43",
  "abcts-text-udef-parts-overlays#44",
];

describe("abcjs-extended, what it sounds like", () => {
  it("changes the audio ONLY where a documented parsing fix says it should", () => {
    const unexpected: string[] = [];
    const stale: string[] = [];
    for (const f of files) {
      const abc = readFileSync(join(fixtures, f), "utf-8");
      let ps: ReturnType<typeof parse>;
      let pe: ReturnType<typeof parse>;
      try {
        ps = parse(abc, { mode: "abcjs-strict" });
        pe = parse(abc, { mode: "abcjs-extended" });
      } catch {
        continue;
      }
      const n = Math.min(ps.scores?.length ?? 0, pe.scores?.length ?? 0);
      for (let t = 0; t < n; t += 1) {
        const slug = `${f.replace(/\.abc$/, "")}#${t}`;
        let a: string;
        let b: string;
        try {
          a = JSON.stringify(flattenAudio(ps.scores[t] as never));
          b = JSON.stringify(flattenAudio(pe.scores[t] as never));
        } catch (err) {
          unexpected.push(`${slug} THREW ${(err as Error).message.slice(0, 60)}`);
          continue;
        }
        const named = AUDIO_DIFFERS.includes(slug);
        if (a !== b && !named) {
          let i = 0;
          while (i < Math.min(a.length, b.length) && a[i] === b[i]) i += 1;
          unexpected.push(`${slug} at ${i}`);
        }
        if (a === b && named) stale.push(slug);
      }
    }
    expect(unexpected.slice(0, 15), "extended changed the audio where nothing says it may").toEqual(
      [],
    );
    // A slug that has stopped differing is a rule that moved: read it, do not delete it.
    expect(stale, "these agree now — remove them from AUDIO_DIFFERS").toEqual([]);
  });
});
