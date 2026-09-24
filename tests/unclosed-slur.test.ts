import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAbc } from "../src/compat/index.js";

/**
 * **A `(` NOTHING CLOSES RUNS TO THE END OF THE TUNE, AND abcjs HANDS IT A `TieElem` PER
 * LINE.** `createABCVoice` recreates every open slur at the head of each line with no
 * anchors (`abstract-engraver.js:236-243`), so each later line draws an arc of its own and
 * RESERVES for it — `getYBounds`' flat 3 at `above ? 14 : 0` (`tie-element.js:206-213`),
 * pointed by that line's internal notes. Ours drew the first line's half and nothing after.
 *
 * And on the line it opens: the reserve takes `calcSlurY`'s ONE-anchor arm (the anchor's
 * pitch — not the beam rule, which is why `(CD|` stood 4.047px tall), and the drawn half
 * lifts over its internal notes (`avoidCollisionAbove`, which runs on every drawn curve,
 * tie-shaped halves included).
 *
 * `unclosed-slur.json` is abcjs 6.7.1's page height and every arc it drew, read out of a
 * WebKit page at `staffwidth: 670`.
 */
type Answer = { abc: string; height: string; arcs: string[] };
const answers = JSON.parse(
  readFileSync(join(__dirname, "unclosed-slur.json"), "utf-8"),
) as Answer[];

const ours = (abc: string): Answer => {
  const svg = (renderAbc("*", abc, { staffwidth: 670 })[0] as { svg?: string })?.svg ?? "";
  return {
    abc,
    height: /height="([\d.]+)"/.exec(svg)?.[1] ?? "",
    arcs: [...svg.matchAll(/<path d="([^"]+)"/g)]
      .map((m) => m[1] ?? "")
      .filter((d) => / C .* C .* z$/.test(d)),
  };
};

describe("an unclosed slur, line by line", () => {
  for (const answer of answers)
    it(JSON.stringify(answer.abc), () => {
      expect(ours(answer.abc)).toEqual(answer);
    });
});
