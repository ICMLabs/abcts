import { glyphsFor } from "../src/renderer/glyph-table.js";
const g = glyphsFor(true);
const wG = g.advance("clefs.G"), w8 = g.advance("timeSig8");
const scale = 2 / 3;
const width = w8 * scale;
const adjust = (wG - width) / 2;
console.log("wG", wG, "w8", w8, "w8*scale", width, "adjust", adjust, "5+adj", 5 + adjust);
console.log("300.639 + (5+adj) =", 300.639 + (5 + adjust));
