/** `rangeHighlight` on one tune, printed like `/tmp/gp/edit2.js` prints abcjs's. */
import { createRequire } from "node:module";
import { join } from "node:path";

import { renderAbc } from "../src/compat/index.js";

const sibling = createRequire(
  join(import.meta.dirname, "..", "..", "abcMusicKit", "Tools", "abcjs-debug", "package.json"),
);
const { JSDOM } = sibling("jsdom") as { JSDOM: new (html: string) => any };
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>');
(globalThis as any).document = dom.window.document;
const abc = process.env.ABC ?? "X:1\nT:t\nM:4/4\nL:1/4\nK:C\nCDEF|GABc|\n";
const paper = dom.window.document.getElementById("paper");
const tune = renderAbc("paper", abc, {})[0];
const groups = (): string[] =>
  Array.from(paper.querySelectorAll("g[data-name]")).map(
    (g: any) =>
      `${g.getAttribute("data-name")}|fill=${g.getAttribute("fill")}|class=${JSON.stringify(g.getAttribute("class"))}`,
  );
const show = (t: string): void => {
  console.log(`--- ${t}`);
  groups().forEach((g, i) => {
    if (!/fill=currentColor\|class=null/.test(g)) console.log(`  ${i} ${g}`);
  });
};
show("fresh");
tune!.engraver.rangeHighlight(0, 200); show("all selected");
tune!.engraver.rangeHighlight(31, 32); show("one note selected");
tune!.engraver.rangeHighlight(0, 0); show("collapsed at 0");
console.log("total groups with data-name:", groups().length);
