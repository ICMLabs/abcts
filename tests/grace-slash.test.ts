import { describe, expect, it } from "vitest";

import { renderAbc } from "../src/compat/index.js";

/**
 * **A `/` SLASHES THE ONE GRACE AFTER IT, NOT THE GROUP.** abcjs reads each grace with
 * `getCoreNote`, and the acciaccatura flag is read per note (`abc_parse_music.js:686-700`)
 * — so `{/EF}` draws ONE `flags.ugrace` slash, on the `E`, and `{/C/2}` one on the `C`.
 * abcjs 6.7.1's own `tests/visual/svg.test.js` grace-note-placement tune is the sibling
 * fixture `grace-note-placement`, byte-exact in `svg-bytes-sibling`; this is the same rule
 * on one line, so it fails on its own if the parser ever marks every note of the group.
 * Every count below was measured through abcjs 6.7.1 (`dump-svg.js`) before it was written.
 * (abcMusicKit needed the same fix — its commit 5183b8bd, "read the slash per note".)
 */
const HEAD = "X:1\nL:1/4\nK:C\n";

function slashes(abc: string): number {
  const svg = renderAbc("*", HEAD + abc, { staffwidth: 670 })[0]?.svg ?? "";
  return svg.split('data-name="flags.ugrace"').length - 1;
}

describe("the acciaccatura slash is per grace note", () => {
  it("{/EF} slashes only the E", () => {
    expect(slashes("{/EF}G|")).toBe(1);
  });
  it("{/C/2} slashes only the C, whatever length follows it", () => {
    expect(slashes("{/C/2}D|")).toBe(1);
  });
  it("{EF} draws no slash at all", () => {
    expect(slashes("{EF}G|")).toBe(0);
  });
  it("{/E /F} slashes both, one per marker", () => {
    expect(slashes("{/E /F}G|")).toBe(2);
  });
  it("{/E/F} slashes one — the second `/` is the E's length, not a marker", () => {
    expect(slashes("{/E/F}G|")).toBe(1);
  });
});
