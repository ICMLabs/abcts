import { describe, it } from "vitest";
import { renderAll } from "./render-all.js";
describe("k", () => { it("k", () => {
  for (const abc of ["X:1\nM:4/4\nL:1/4\nK:Cbmin clef=bass\nCDEF|\n", "X:1\nM:4/4\nL:1/4\nK:Cbmin\nCDEF|\n"]) {
    const t = renderAll(abc)[0];
    console.log("ZZ", JSON.stringify(t?.warnings), "clef=", JSON.stringify(t?.lines?.[0]?.staff?.[0]?.clef));
  }
}); });
