/**
 * The compat DOM claim, checked against abcjs's OWN OUTPUT rather than asserted.
 *
 * `src/compat/index.ts` promises that "a stylesheet written against abcjs keeps working".
 * Until now the only evidence was a handful of substring assertions on one fixture, which
 * shows that four class names appear SOMEWHERE — not that the set is complete. A promise
 * to anyone who swaps the import deserves better than that.
 *
 * The goldens ship abcjs's rendered SVG for 29 corpus fixtures. Those files were sitting
 * unused, marked "compat mode only", and they are exactly the reference: every
 * `abcjs-*` class abcjs puts in its markup, on real music.
 *
 * WHAT THIS DOES NOT COVER, stated because the gap is the interesting part: a class name
 * appearing in our output does not prove a stylesheet SELECTS the same elements, that a
 * click handler hit-tests the same region, or that the page does not reflow. Those need a
 * browser. This is the strongest check available without one, and it found a real gap
 * (`abcjs-chord-pos-N`) that the substring assertions could not.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";
import { renderAll } from "./render-all.js";
import { corpusDir, goldensDir } from "./corpus/corpus.js";

const classesIn = (svg: string): Set<string> =>
  new Set(
    [...svg.matchAll(/class="([^"]+)"/g)]
      .flatMap((m) => (m[1] ?? "").split(" "))
      .filter((c) => c.startsWith("abcjs-")),
  );

it("emits every abcjs class the golden SVGs contain", () => {
  const theirs = new Map<string, number>();
  const ours = new Set<string>();
  let compared = 0;

  for (const file of readdirSync(corpusDir).filter((f) => f.endsWith(".abc"))) {
    const golden = join(goldensDir, `${file.replace(".abc", "")}.svg`);
    if (!existsSync(golden)) continue;
    compared += 1;
    for (const cls of classesIn(readFileSync(golden, "utf-8"))) {
      theirs.set(cls, (theirs.get(cls) ?? 0) + 1);
    }
    for (const tune of renderAll(readFileSync(join(corpusDir, file), "utf-8"), {
      staffwidth: 740,
    })) {
      for (const cls of classesIn(tune.svg)) ours.add(cls);
    }
  }

  // A vacuous pass is the failure mode here: if the goldens moved, `theirs` would be
  // empty and every assertion below would hold for the wrong reason.
  expect(compared, "no golden SVG matched a corpus fixture").toBeGreaterThan(
    20,
  );
  expect(theirs.size, "no abcjs classes found in the goldens").toBeGreaterThan(
    3,
  );

  const missing = [...theirs.keys()].filter((c) => !ours.has(c)).sort();
  expect(missing, `compat does not emit ${missing.join(", ")}`).toEqual([]);
});

it("puts the chord position on each notehead of a chord, lowest first", () => {
  // The one class the substring assertions missed. abcjs numbers from the BOTTOM: in
  // `[Fc]` the F is pos-1 and the c is pos-2, which its golden confirms by y coordinate.
  const svg = renderAll("X:1\nL:1/4\nK:C\n[CEG]|\n")[0]?.svg ?? "";
  expect(svg).toContain("abcjs-notehead abcjs-chord-pos-1");
  expect(svg).toContain("abcjs-notehead abcjs-chord-pos-2");
  expect(svg).toContain("abcjs-notehead abcjs-chord-pos-3");
});

it("leaves a single note unnumbered, as abcjs does", () => {
  // Not cosmetic: abcjs emits pos-1 722 times and pos-2 715 across the corpus. If lone
  // notes carried pos-1 that first number would dwarf the second.
  const svg = renderAll("X:1\nL:1/4\nK:C\nC|\n")[0]?.svg ?? "";
  expect(svg).toContain("abcjs-notehead");
  expect(svg).not.toContain("abcjs-chord-pos");
});
